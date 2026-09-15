import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { IPC } from '../../shared/ipc'
import type { ReconcileResult } from '../../shared/types'
import * as repo from './repo'
import { scanLibrary, walk } from './scanner'
import path from 'node:path'
import { readFileSync, writeFileSync, promises as fs, existsSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { spawn } from 'node:child_process'
import { reconcileLibrary } from './reconcile'
import { openVideo, openPlaylist } from './player'
import { frameLog } from './images'
import { generateQuickCover, generatePreviewV2, previewRoot } from './preview-v2'
import { wakePreviewTaskQueue } from './preview-task-queue'
import { flushSave } from './store'

// 去重锁：同一视频同时只跑一次 generatePreviews，避免并发写入互相覆盖
const inFlightPreviews = new Map<string, Promise<unknown>>()
import { postersCacheDir } from './images'
import { cacheRemoteImage } from './image-util'
import { extractMovieQuery, localCanonicalName } from '../../shared/code'
import { testProxyConnectivity } from './proxy'
import { detectFfmpeg } from './ffmpegEnv'
import { applyRuntimeSettings } from './runtime'
import { probeVideo, probeImage } from './ffprobe'
import { previewRenames, applyRenames, safeFileBaseName } from './rename'
import { findDuplicates } from './dedup'
import { readNfoForVideo, writeNfoForVideo } from './nfo'
import * as playlist from './playlist'
import { updatePlaybackPosition } from './player'
import { startWatching, stopWatching } from './watcher'
import { type MovieMeta, type SourceId, type Library, type ScanProgress, type Settings, type Video, type ImageSource, type UpdateSource, type TechInfo } from '../../shared/types'
import { type UpdateCheckResult, type UpdateAssetInfo } from '../../shared/api-types'
// v2.2.4 抽到独立模块（让 reconcile.ts 也能调 fetchDetailSmart，无循环依赖）
import { fetchDetailSmart, createSmartFetchState, fetchPosterSmart, type SmartFetchState } from './fetch-meta'
import { fetchDetailByUrl } from './fetch-by-url'

// 当前活跃的批量补齐状态（供 pause/resume/stop 控制）
let activeFetchState: SmartFetchState | null = null

// ---------- v2.2.13 安全加固：openExternal 协议白名单 + 危险 IPC 参数校验 ----------
// 只允许 http/https（更新链接/官网），杜绝渲染进程被注入后经 shell.openExternal 打开 file:// 或任意程序
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:'])
function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ALLOWED_EXTERNAL_PROTOCOLS.has(u.protocol)
  } catch {
    return false
  }
}

// 危险 IPC 入参白名单校验：
// 1) 库 id / 视频 id：必须是非空字符串且不含路径分隔符（防止拼接路径穿越）
// 2) openExternal：只放行 http/https
function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && !id.includes('/') && !id.includes('\\') && !id.includes('..')
}

// ---------- v2.2.10-fix5：对账结果磁盘缓存（启动/切库先秒出，后台全量对账刷新） ----------
function reconcileCachePath(libraryId: string): string {
  return path.join(app.getPath('userData'), 'reconcile-cache', `${libraryId}.json`)
}

async function writeReconcileCache(libraryId: string, result: ReconcileResult): Promise<void> {
  const p = reconcileCachePath(libraryId)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(result), 'utf-8')
}

async function readReconcileCache(libraryId: string): Promise<ReconcileResult | null> {
  try {
    const raw = await fs.readFile(reconcileCachePath(libraryId), 'utf-8')
    return JSON.parse(raw) as ReconcileResult
  } catch {
    return null
  }
}

/**
 * 多源详情聚合（MovieDB → OMDb → OpenLibrary → JustWatch）。
 * 任一源成功即返回（本地化图片后由调用方写库）；全部失败返回 null。
 */
interface MovieDetailResult {
  detail: MovieMeta | null
  /** 命中来源（success 时） */
  source?: SourceId
  /** 全部失败时的原因描述 */
  error?: string
}

/**
 * 把详情里的 cover 转成可写 posterPath 的本地路径。
 * 数据源模块返回的 detail.cover 已是**本地缓存路径**（内部已下载到磁盘），
 * 直接复用即可；若个别源返回 http(s) URL 则用 cacheRemoteImage 下载。
 * 返回 null 表示无可用封面（不覆盖原 posterPath）。
 */
/**
 * 封面替换前的图片有效性验证：ffprobe 能读出分辨率且不小于阈值。
 * 数据源/数据源 下载的封面可能是损坏/截断/空内容的坏图（文件存在但 ffprobe 读不出尺寸），
 * 直接替换会覆盖现有 ffmpeg 截帧导致黑屏，必须验证通过才允许替换。
 */
async function isCoverUsable(filePath: string, settings: Settings): Promise<boolean> {
  const dim = await probeImage(filePath, settings)
  if (!dim) return false
  // 正常封面至少几百像素；<100px 视为坏图/占位
  return dim.width >= 100 && dim.height >= 100
}

/**
 * 把详情里的 cover 转成可写 posterPath 的本地路径。
 * 数据源模块返回的 detail.cover 已是**本地缓存路径**（内部已下载到磁盘），
 * 直接复用即可；若个别源返回 http(s) URL 则用 cacheRemoteImage 下载。
 * **替换前必须通过 isCoverUsable 验证（分辨率正常），验证失败返回 null（不覆盖原 posterPath）。**
 */
async function resolveDetailCover(
  detail: MovieMeta,
  videoId: string,
  settings: Settings
): Promise<string | null> {
  if (!detail.cover) return null
  const isLocal = /^[A-Za-z]:[\\/]|^file:\/\//.test(detail.cover)
  if (isLocal) {
    try {
      await fs.access(detail.cover)
      if (!(await isCoverUsable(detail.cover, settings))) {
        // 损坏的本地封面：删除坏文件（避免后续复用），不替换
        await fs.unlink(detail.cover).catch(() => {})
        return null
      }
      return detail.cover
    } catch {
      return null
    }
  }
  // http(s) URL → 下载本地。缓存 key 用封面文件名（含源前缀）而非 videoId：
  // 避免与 ffmpeg 截帧封面 <videoId>.jpg 同名冲突（下载坏图会覆盖掉可用截帧）。
  const coverKey = detail.externalId ? `cover-${detail.externalId.toUpperCase()}` : videoId
  const local = await cacheRemoteImage(
    detail.cover,
    coverKey,
    settings,
    detail.source === 'moviedb' ? 'https://www.themoviedb.org' : detail.source === 'openlibrary' ? 'https://openlibrary.org' : detail.source === 'justwatch' ? 'https://www.justwatch.com' : detail.source === 'wikipedia' ? 'https://zh.wikipedia.org' : 'https://www.omdbapi.com'
  ).catch(() => null)
  if (!local) return null
  // 下载后验证分辨率：损坏/全黑/截断的图不替换（避免用坏图覆盖现有 ffmpeg 截帧）
  if (!(await isCoverUsable(local, settings))) {
    await fs.unlink(local).catch(() => {})
    return null
  }
  return local
}

/**
 * 把数据源详情回填到 Video 顶层字段（无 Excel 片单视频用得上）。
 * v2.2.13 标签分层后：
 * - actors：演员名单
 * - year / rating：缺失时从详情补全
 * - tags：**不再**与数据源 genres 合并（文档定义的标签保持权威纯净）
 * - backupTags：数据源 genres 单独写入（UI 折叠为一行「备用标签」，无文档时兜底作为主标签）
 * - title：仅当视频未受简介管理（无 descriptionSource）且当前标题就是文件名时，用数据源标题覆盖
 */
function backfillFromDetail(v: Video, detail: MovieMeta): Partial<Video> {
  const patch: Partial<Video> = {}
  const actors = detail.cast && detail.cast.length ? detail.cast : detail.actors
  if (actors && actors.length) patch.actors = actors
  if (!v.year && detail.date) {
    const y = Number(String(detail.date).slice(0, 4))
    if (!Number.isNaN(y)) patch.year = y
  }
  if (v.rating == null && detail.rating) {
    const r = parseFloat(String(detail.rating).replace(/[^0-9.]/g, ''))
    if (!Number.isNaN(r)) patch.rating = r
  }
  // 数据源 genres 不再与 v.tags 合并：有文档标签时 genres 仅作 backupTags（备用展示），
  // 无文档标签时 backupTags 也会被 UI 兜底作为主标签渲染。
  if (detail.genres?.length) {
    const existing = Array.isArray(v.backupTags) ? v.backupTags : []
    patch.backupTags = Array.from(new Set([...existing, ...detail.genres]))
  }
  const nameWithoutExt = v.fileName ? v.fileName.replace(/\.[^.]+$/, '') : ''
  if (!v.descriptionSource && v.title && nameWithoutExt && v.title === nameWithoutExt) {
    patch.title = detail.title
  }
  // v2.8.5：网址更新/批量抓取时同步更新简介（仅非手动编辑的情况，避免覆盖用户手改内容）
  if (detail.synopsis && v.descriptionSource !== 'manual') {
    patch.description = detail.synopsis
  }
  return patch
}

/** 语义化比较版本号：支持 x.y.z 与带 -beta/-rc 的 semver；a>b 返回 1，a<b 返回 -1，相等返回 0 */
function cmpVer(a: string, b: string): number {
  const parse = (v: string) => {
    const cleaned = String(v).replace(/^v/i, '')
    const [core, pre] = cleaned.split('-', 2)
    const parts = core.split('.').map((x) => parseInt(x, 10) || 0)
    return { parts, pre }
  }
  const pa = parse(a)
  const pb = parse(b)
  const n = Math.max(pa.parts.length, pb.parts.length)
  for (let i = 0; i < n; i++) {
    const x = pa.parts[i] ?? 0
    const y = pb.parts[i] ?? 0
    if (x !== y) return x - y
  }
  // 核心版本相同：有 pre-release 的版本视为更小（1.0.0-beta < 1.0.0）
  if (pa.pre && !pb.pre) return -1
  if (!pa.pre && pb.pre) return 1
  if (pa.pre && pb.pre) return pa.pre.localeCompare(pb.pre)
  return 0
}

function normalizeAsset(raw: unknown): UpdateAssetInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const name = String(a.name || '')
  const size = Number(a.size || 0)
  const url = String(a.browser_download_url || a.direct_asset_url || a.url || '')
  if (!name || !url) return null
  return { name, size, downloadUrl: url, contentType: String(a.content_type || a.contentType || '') }
}

/**
 * 清理某个视频的关联缓存文件（封面 / ffmpeg 截图 / 数据源下载的信息图）。
 * 命名规则（均在 postersCacheDir 下）：
 * - 视频专属：`<videoId>.jpg` + `<videoId>_preview_N.jpg`（封面 + ffmpeg 预览）
 * - 按externalId共享：`数据源-cover-<CODE>.jpg`（封面；多片共用同一外部源元数据时共享）
 * 共享文件删除前检查：若其他视频仍引用同一文件（同系列多分集共用元数据），则保留。
 * 返回删除的文件数。
 */
async function cleanVideoCacheFiles(video: Video): Promise<{ removed: number; kept: number }> {
  try {
    const cacheDir = postersCacheDir()
    let entries: string[]
    try {
      entries = await fs.readdir(cacheDir)
    } catch {
      return { removed: 0, kept: 0 } // 缓存目录不存在
    }

    // 该视频引用的缓存文件（优先精确收集）
    const referencedByVideo = new Set<string>()
    if (video.posterPath) referencedByVideo.add(path.normalize(video.posterPath))
    for (const p of video.previewPaths ?? []) referencedByVideo.add(path.normalize(p))

    // 视频专属缓存前缀（按 video.id 收集；数据源缓存按各自命名规则单独处理）
    const prefixes = new Set<string>()
    prefixes.add(`${video.id}`)

    // 其他视频仍在引用的缓存文件（同系列多分集共享）——不可删
    const stillReferenced = new Set<string>()
    try {
      const others = await repo.listVideos({})
      for (const o of others) {
        if (o.id === video.id) continue
        if (o.posterPath) stillReferenced.add(path.normalize(o.posterPath))
        for (const p of o.previewPaths ?? []) stillReferenced.add(path.normalize(p))
      }
    } catch {
      /* 拿不到引用列表时保守处理：不删共享文件，只删视频专属文件 */
    }

    let removed = 0
    let kept = 0
    for (const f of entries) {
      const lower = f.toLowerCase()
      const matched = [...prefixes].some((p) => lower.startsWith(p.toLowerCase()))
      if (!matched) continue
      const abs = path.join(cacheDir, f)
      // 视频专属文件（videoId 前缀）且被本视频引用过 → 直接删
      // 共享文件（数据源/数据源）→ 仅当无其他视频引用才删
      if (stillReferenced.has(path.normalize(abs))) {
        kept++
        continue
      }
      try {
        await fs.unlink(abs)
        removed++
      } catch {
        kept++
      }
    }
    return { removed, kept }
  } catch {
    return { removed: 0, kept: 0 }
  }
}

/** 从 release assets 中匹配 Windows x64 安装包与对应校验文件 */
function matchWindowsAsset(assets: unknown[]): { installer?: UpdateAssetInfo; checksum?: UpdateAssetInfo } {
  const list = assets.map(normalizeAsset).filter((x): x is UpdateAssetInfo => x !== null)
  const isInstaller = (a: UpdateAssetInfo) => {
    const lower = a.name.toLowerCase()
    if (!lower.endsWith('.exe') && !lower.includes('setup')) return false
    if (lower.includes('.blockmap') || lower.includes('.sha256') || lower.includes('.sha512') || lower.includes('.asc') || lower.includes('.sig')) return false
    return true
  }
  const candidates = list.filter(isInstaller)
  const score = (a: UpdateAssetInfo) => {
    const lower = a.name.toLowerCase()
    let s = 0
    if (lower.includes('x64') || lower.includes('64') || lower.includes('amd64')) s += 3
    if (lower.includes('win') || lower.includes('windows')) s += 2
    if (lower.includes('setup')) s += 1
    return s
  }
  candidates.sort((a, b) => score(b) - score(a))
  const installer = candidates[0]
  const checksum = installer
    ? list.find((a) => {
        const lower = a.name.toLowerCase()
        const base = installer.name.toLowerCase().replace(/\.exe$/, '')
        return (lower.includes('.sha256') || lower.includes('.blockmap') || lower.includes('.sha512')) && lower.includes(base)
      })
    : undefined
  return { installer, checksum }
}

function extractMinimumVersion(notes: string): string | undefined {
  const patterns = [/minVersion\s*[:：]\s*([\d.]+)/i, /minimum\s*version\s*[:：]\s*([\d.]+)/i, /最低版本\s*[:：]\s*([\d.]+)/i]
  for (const p of patterns) {
    const m = notes.match(p)
    if (m) return m[1]
  }
  return undefined
}

function detectUrgency(notes: string, minimumVersion?: string, currentVersion?: string): 'normal' | 'recommended' | 'critical' | 'mandatory' {
  if (minimumVersion && currentVersion && cmpVer(minimumVersion, currentVersion) > 0) return 'mandatory'
  const cn = notes
  const lower = notes.toLowerCase()
  if (/强制更新|mandatory|必须升级|critical|严重漏洞|安全修复/.test(cn + lower)) return 'mandatory'
  if (/breaking|不兼容|破坏性变更|数据迁移|数据库升级|重构/.test(cn + lower)) return 'critical'
  if (/recommended|建议升级|推荐更新|重要修复|performance|性能优化/.test(cn + lower)) return 'recommended'
  return 'normal'
}

async function fetchMovieDetail(
  code: string,
  settings: Settings,
  onEvent?: (e: { code: string; src: SourceId; status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'; detail?: string }) => void,
  /** v2.6.5：true = 手工输入的externalId，各数据源不再对它做「从文件名猜externalId」的提取 */
  manual = false
): Promise<MovieDetailResult> {
  // v2.2.6：fetchDetailSmart 已统一处理所有 5 个源（含顺序、降级、错误信息），
  // 这里保留 wrapper 是为了让 videoFetchDetail 等老调用方零改动；
  // fetchDetailSmart 内部会按 settings.dataSource / customSourceOrder 自动分支。
  const state = createSmartFetchState()
  return await fetchDetailSmart(code, settings, state, onEvent, manual)
}

function emitProgress(p: ScanProgress): void {
  // 只给主窗口发 — BrowserWindow.getAllWindows() 会把 DevTools 也返回
  // DevTools URL 是 devtools://devtools/... 开头, 据此过滤
  const wins = BrowserWindow.getAllWindows()
  console.log(`[emitProgress] windows=${wins.length} payload=${p.current ?? '-'}`)
  for (const w of wins) {
    if (w.isDestroyed()) continue
    const url = w.webContents.getURL()
    if (url.startsWith('devtools://')) continue
    w.webContents.send(IPC.scanProgress, p)
  }
}

/**
 * 执行一次更新检查（GitHub / Gitee），基于多维度特征判定是否有可用新版本：
 * - 版本号 semver 比较（支持 -beta/-rc）
 * - release asset 匹配：确认存在 Windows x64 Setup 安装包
 * - 发布时间、pre-release / draft 标记
 * - release notes 里的 urgency 标记（强制/重要/推荐）与最低版本要求
 * 并把结果持久化到设置：
 * - 若有可用更新：写入 pendingUpdate（版本、链接、紧急程度、资源信息）
 * - 草稿版本：不会标记为 hasUpdate，但会在结果里说明
 * - 无更新 / 出错：清空 pendingUpdate（避免陈旧提示）
 * - 始终更新 lastUpdateCheck 时间戳，供自动更新频率调度判定
 * 容错：首选源（updateSource）请求失败时自动回退到另一源重试；
 * 返回的 source 为实际成功的源，fallback=true 表示发生过回退。
 * 返回完整结果供 UI 即时展示。
 */
export async function runUpdateCheck(): Promise<UpdateCheckResult> {
  const s = await repo.getSettings()
  const preferred = s.updateSource ?? 'gitee'
  const current = app.getVersion()
  const repoPath = 'mr-awei/movie-vault'

  const baseResult: UpdateCheckResult = {
    source: preferred,
    currentVersion: current,
    latestVersion: '',
    hasUpdate: false,
    releaseUrl: '',
    confidence: 'none'
  }

  // 按首选源优先，失败后回退到另一源（GitHub 在大陆网络可能不稳定）。
  // v2.6.7 修复：Gitee 的 releases/latest 可能严重落后于 GitHub，
  // 因此即使首选源请求成功，只要返回的版本不比当前新，就继续尝试另一源，
  // 避免用户实际有新版可用却被提示「已是最新」。
  const order: UpdateSource[] = preferred === 'gitee' ? ['gitee', 'github'] : ['github', 'gitee']
  const errors: string[] = []
  let usedFallback = false
  let bestResult: UpdateCheckResult | null = null

  for (const source of order) {
    try {
      const r = await fetch(
        source === 'gitee'
          ? `https://gitee.com/api/v5/repos/${repoPath}/releases/latest`
          : `https://api.github.com/repos/${repoPath}/releases/latest`,
        {
          headers: {
            'User-Agent': 'yinghai',
            ...(source === 'github' ? { Accept: 'application/vnd.github+json' } : {})
          },
          // 大陆网络下 GitHub API TCP/TLS 能通但 HTTP 层不响应，
          // 无超时则 undici 默认 fetch 会一直挂死导致 UI 永远转圈。
          signal: AbortSignal.timeout(20000)
        }
      )
      if (!r.ok) throw new Error(`${source === 'gitee' ? 'Gitee' : 'GitHub'} API ${r.status}`)

      const j = (await r.json()) as {
        tag_name?: string
        name?: string
        html_url?: string
        body?: string
        published_at?: string
        created_at?: string
        prerelease?: boolean
        draft?: boolean
        assets?: unknown[]
      }

      const tagName = String(j.tag_name ?? '')
      const releaseName = String(j.name ?? '')
      const latest = (tagName || releaseName).replace(/^v/i, '')
      const url =
        j.html_url ??
        (source === 'gitee'
          ? `https://gitee.com/${repoPath}/releases`
          : `https://github.com/${repoPath}/releases`)
      const notes = typeof j.body === 'string' ? j.body : ''
      // Gitee Release API 没有 published_at，使用 created_at 兜底
      const publishedAt =
        typeof j.published_at === 'string' ? j.published_at
        : typeof j.created_at === 'string' ? j.created_at
        : undefined
      const isPrerelease = !!j.prerelease
      const isDraft = !!j.draft

      const minimumVersion = extractMinimumVersion(notes)
      const urgency = detectUrgency(notes, minimumVersion, current)

      const assets = Array.isArray(j.assets) ? j.assets : []
      const { installer, checksum } = matchWindowsAsset(assets)
      const assetMatched = !!installer

      const versionNewer = latest ? cmpVer(latest, current) > 0 : false
      // 草稿不应向用户推送；pre-release 仍视为有更新，但会标记
      const hasUpdate = versionNewer && !isDraft
      const confidence = hasUpdate ? (assetMatched ? 'full' : 'partial') : latest ? 'none' : 'none'

      const result: UpdateCheckResult = {
        ...baseResult,
        source,
        fallback: usedFallback,
        latestVersion: latest,
        hasUpdate,
        releaseUrl: url,
        notes: notes.slice(0, 1000) || undefined,
        publishedAt,
        isPrerelease,
        isDraft,
        assetMatched,
        asset: installer,
        checksumAsset: checksum,
        urgency,
        minimumVersion,
        confidence,
        error: !latest ? '无法解析版本号' : undefined
      }

      if (hasUpdate) {
        // 明确发现新版本，直接落盘并返回，不需要再试其他源
        try {
          await repo.saveSettings({
            lastUpdateCheck: Date.now(),
            pendingUpdate: result.releaseUrl
              ? {
                  version: result.latestVersion,
                  url: result.releaseUrl,
                  urgency: result.urgency,
                  publishedAt: result.publishedAt,
                  assetName: result.asset?.name,
                  assetSize: result.asset?.size
                }
              : null
          })
        } catch {
          /* 持久化失败不影响本次返回 */
        }
        return result
      }

      // 请求成功但没有检测到更新：记录当前源的结果，继续尝试另一源，
      // 防止首选源（如 Gitee）的 latest 版本过旧导致漏报更新。
      if (!bestResult || cmpVer(result.latestVersion, bestResult.latestVersion) > 0) {
        bestResult = result
      }
      usedFallback = true
      // 继续尝试另一源
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } })?.cause
      const err =
        (cause && (cause.code || cause.message)
          ? `${cause.code ?? '网络错误'}${cause.message ? ` ${cause.message}` : ''}`
          : (e as Error)?.message) || '请求失败'
      errors.push(`${source === 'gitee' ? 'Gitee' : 'GitHub'}：${err}`)
      usedFallback = true
      // 继续尝试另一源
    }
  }

  // 至少有一个源成功但两个源都没检测到更新：返回版本号最大的那个结果
  if (bestResult) {
    try {
      await repo.saveSettings({ lastUpdateCheck: Date.now(), pendingUpdate: null })
    } catch {
      /* 持久化失败不影响本次返回 */
    }
    return bestResult
  }

  // 两个源都失败
  try {
    await repo.saveSettings({ lastUpdateCheck: Date.now(), pendingUpdate: null })
  } catch {
    /* 持久化失败不影响本次返回 */
  }
  return { ...baseResult, fallback: true, error: errors.join('；') }
}

let ipcRegistered = false
/** 无封面兜底截帧的单轮上限：每部视频最多 16 个 ffmpeg 进程，放开会让大库 CPU 风暴 */
const FRAME_FALLBACK_LIMIT = 200

/** v2.3.11：截帧失败冷却期（7 天）。损坏文件若每次都重试，批量补齐会被反复拖住 */
const FRAME_FAIL_COOLDOWN = 7 * 24 * 60 * 60 * 1000
/** 该视频是否刚截帧失败过（冷却期内跳过，避免损坏文件反复拖慢批量任务） */
function frameFailedRecently(v: Video): boolean {
  return !!v.frameFailedAt && Date.now() - v.frameFailedAt < FRAME_FAIL_COOLDOWN
}

export function registerIpc(): void {
  if (ipcRegistered) {
    console.warn('[ipc] registerIpc 被重复调用，已跳过')
    return
  }
  ipcRegistered = true

  // ---------- 媒体库 ----------
  ipcMain.handle(IPC.libraryList, () => repo.listLibraries())
  ipcMain.handle(IPC.libraryAdd, async (_e, input: Omit<Library, 'id' | 'createdAt'>) => {
    const lib = await repo.addLibrary(input)
    return lib
  })
  ipcMain.handle(IPC.libraryRemove, async (_e, id: string) => {
    await repo.removeLibrary(id)
  })
  ipcMain.handle(IPC.libraryUpdate, async (_e, id: string, patch: Partial<Library>) => {
    const lib = await repo.updateLibrary(id, patch)
    return lib
  })

  // ---------- 对账（Excel 驱动 + 文件夹对账） ----------
  // v2.4.1："扫描库"按钮合并 scan + reconcile，一次调用只推一轮连续进度。
  //   scanLibrary 负责建 data.json 记录（必做，fix 新库第一次扫不出条目）
  //   reconcileLibrary 负责 Excel 对账 + 条目归类（也必做）
  //   原来 renderer 先调 videoScan → finally 里再调 runReconcile，两个独立 IPC 各发自己的
  //   emitProgress，UI 上就出现"点一次扫描，进度条弹两轮"。
  ipcMain.handle(IPC.libraryScanAndReconcile, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const t0 = Date.now()
    // scanLibrary 正常发进度（0 → scanTotal）
    await scanLibrary(lib, settings, emitProgress)
    // reconcileLibrary 也走 emitProgress，但它会从自己的 0 开始推——
    // 我们让 reconcile 的常规进度（total/done）在 scan 结束后继续"延续"这个进度，
    // 使 UI 上看到的是 0 → scanTotal → scanTotal+reconcileCount 的一条连续进度条。
    // 最简单做法：包装一下 emitProgress，reconcile 阶段的常规 total/done 不推，只推 introError / fetchEvent。
    let scanDone = false
    const reconcilerOnProgress = (p: Parameters<typeof emitProgress>[0]) => {
      // introError / fetchEvent 继续正常推；常规进度在 scan 阶段结束后就不推了
      if (p.introError || p.fetchEvent) {
        emitProgress(p)
        return
      }
      if (!scanDone) return // scan 没跑完？不可能，scanLibrary 是 await 的
      // reconcile 常规进度不推，避免前端看到第二轮进度条
    }
    scanDone = true
    const result = await reconcileLibrary(lib, settings, reconcilerOnProgress)
    console.log(`[scan+reconcile] 完成 ${libraryId}：entries=${result.entries.length} 耗时${Date.now() - t0}ms`)
    void writeReconcileCache(libraryId, result)
      .then(() => console.log(`[scan+reconcile] 缓存已写 ${libraryId}`))
      .catch((e) => console.error('[scan+reconcile] 缓存写入失败:', (e as Error)?.message || e))
    return result
  })

  ipcMain.handle(IPC.libraryReconcile, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const t0 = Date.now()
    const result = await reconcileLibrary(lib, settings, emitProgress)
    // v2.3.10 诊断：对账完成打点（此前若卡在落盘，这里永远到不了，日志一片空白无从定位）
    console.log(`[reconcile] 对账完成 ${libraryId}：entries=${result.entries.length} 耗时${Date.now() - t0}ms`)
    // v2.2.10-fix5：对账结果写磁盘缓存——启动/切库先秒出缓存界面，后台再全量对账刷新
    void writeReconcileCache(libraryId, result)
      .then(() => console.log(`[reconcile] 缓存已写 ${libraryId}`))
      .catch((e) => console.error('[reconcile] 缓存写入失败:', (e as Error)?.message || e))
    return result
  })

  // v2.2.10-fix5：读上次对账结果缓存（无缓存返回 null，由 renderer 决定是否等待全量对账）
  ipcMain.handle(IPC.libraryReconcileCache, async (_e, libraryId: string) => {
    return readReconcileCache(libraryId)
  })

  // ---------- 视频 ----------
  ipcMain.handle(IPC.videoList, (_e, filter: any) => repo.listVideos(filter ?? {}))
  ipcMain.handle(IPC.videoGet, (_e, id: string) => repo.getVideo(id))
  ipcMain.handle(IPC.videoUpdate, (_e, id: string, patch: any) => repo.updateVideo(id, patch))
  // v2.7.x：批量设置锁定状态 —— 一次 applyVideoChanges 落盘，避免逐条全量写 data.json
  ipcMain.handle(IPC.videoLockMany, async (_e, ids: string[], locked: boolean) => {
    if (!Array.isArray(ids) || ids.length === 0) return 0
    const idSet = new Set(ids)
    const all = await repo.listVideos({})
    const now = Date.now()
    const changes: repo.VideoChange[] = all
      .filter((v) => idSet.has(v.id))
      .map((v) => ({
        type: 'update' as const,
        video: { ...v, locked, lockedAt: locked ? now : undefined }
      }))
    await repo.applyVideoChanges(changes)
    return changes.length
  })
  ipcMain.handle(IPC.videoScan, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    return scanLibrary(lib, settings, emitProgress)
  })
  ipcMain.handle(IPC.videoOpen, async (_e, id: string) => {
    const v = await repo.getVideo(id)
    if (!v) throw new Error('视频不存在')
    const settings = await repo.getSettings()
    return openVideo(v, settings)
  })
  ipcMain.handle(IPC.videoOpenPlaylist, async (_e, videos: Video[]) => openPlaylist(videos, await repo.getSettings()))
  ipcMain.handle(IPC.videoRegeneratePoster, async (_e, id: string) => {
    const v = await repo.getVideo(id)
    if (!v) throw new Error('视频不存在')
    const settings = await repo.getSettings()
    const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
    if (!coverPath) return repo.updateVideo(id, v)
    await repo.enqueuePreviewTask(id, {
      priority: 0,
      requestedCount: settings.previewFrameCount ?? 20,
      qualityMode: settings.previewQualityMode ?? 'STANDARD'
    }).catch(() => null)
    wakePreviewTaskQueue()
    return repo.updateVideo(id, {
      posterSource: 'ffmpeg',
      posterPath: coverPath,
      posterPathFfmpeg: coverPath
    })
  })

  // ---------- 数据源 封面抓取  // ---------- 数据源 封面抓取 ----------
  ipcMain.handle(IPC.videoFetchPoster, async (_e, id: string) => {
    const v = await repo.getVideo(id)
    if (!v) throw new Error('视频不存在')
    const settings = await repo.getSettings()
    // v2.2.8：海报抓取也按 customSourceOrder 降级（原来硬走 数据源）
    const localPath = await fetchPosterSmart(v, settings)
    if (!localPath) return null
    // 替换前验证图片有效性：下载损坏/截断的坏图不替换（避免黑屏）
    if (!(await isCoverUsable(localPath, settings))) {
      await fs.unlink(localPath).catch(() => {})
      return null
    }
    return repo.updateVideo(id, { posterSource: 'moviedb', posterPath: localPath })
  })

  // ---------- 数据源 详情抓取 ----------
  ipcMain.handle(IPC.videoFetchDetail, async (_e, id: string, idOverride?: string) => {
    const v = await repo.getVideo(id)
    if (!v) throw new Error('视频不存在')
    const settings = await repo.getSettings()
    // v2.6.5：搜索源优先级改为「手工输入 → title → folderName → fileName」。
    // idOverride = 用户手工输入的检索词/ID（文件名/标题识别不出时的人工兜底入口）。
    const manual = typeof idOverride === 'string' ? idOverride.trim() : ''
    // v2.7.x：优先用数据源已更新的标题（meta.title）作为检索词，避免继续拿旧文件名搜索
    const rawCode = (manual || localCanonicalName(v)).trim()
    if (!rawCode) return null
    if (manual) {
      console.log(`[ipc] videoFetchDetail 手工输入：${v.fileName} -> ${manual}`)
    }
    // 检索词交给 fetchDetailSmart 内部统一用 extractMovieQuery 解析（标题+年份+ID），此处直接透传
    const code = rawCode
    // v2.2.10：单点补齐也推 fetchEvent（右下角浮层实时显示"数据源 失败 → 降级 数据源"）
    const mr = await fetchMovieDetail(
      code,
      settings,
      (e) => {
        emitProgress({ libraryId: v.libraryId, total: 1, done: 0, current: localCanonicalName(v), fetchEvent: { ...e, code: localCanonicalName(v) || e.code } })
      },
      !!manual
    )
    // v2.2.13-fix：无论成功/失败，结束前发一次 done=1，让前端 Toast 有机会 dismiss
    emitProgress({ libraryId: v.libraryId, total: 1, done: 1, current: localCanonicalName(v) })
    if (!mr.detail) return { ok: false as const, error: mr.error || '未获取到数据' }
    await repo.updateVideo(id, { meta: mr.detail, ...backfillFromDetail(v, mr.detail) })
    // **列表/详情封面同步**：详情抓取成功且有真实封面，但视频当前是 ffmpeg 截帧 / 占位 / 无封面时，
    // 用 detail.cover 覆盖（否则列表页还是错误的视频帧）
    const coverLocal = await resolveDetailCover(mr.detail, id, settings)
    const patch: Partial<Video> = {}
    if (coverLocal) {
      patch.posterSource = mr.detail.source ?? 'moviedb'
      patch.posterPath = coverLocal
    }
    await repo.updateVideo(id, patch)
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send(IPC.posterFetched, {
          videoId: id,
          posterPath: coverLocal,
          posterSource: mr.detail.source ?? 'moviedb'
        })
      }
    }
    return { ok: true as const, detail: mr.detail, source: mr.source ?? ('moviedb' as const) }
  })

  // ---------- 详情页「按网址更新」 ----------
  ipcMain.handle(IPC.videoFetchByUrl, async (_e, id: string, url?: string) => {
    const v = await repo.getVideo(id)
    if (!v) throw new Error('视频不存在')
    const settings = await repo.getSettings()
    if (!url || !url.trim()) return { ok: false as const, error: '请粘贴电影页面网址' }
    const errors: string[] = []
    const mr = await fetchDetailByUrl(
      url.trim(),
      settings,
      (m) => errors.push(m)
    )
    if (!mr) {
      return {
        ok: false as const,
        error: errors.length ? errors.join('；') : '未从该网址获取到数据（请确认链接正确且对应数据源已配置密钥）'
      }
    }
    await repo.updateVideo(id, { meta: mr.detail, ...backfillFromDetail(v, mr.detail) })
    const coverLocal = await resolveDetailCover(mr.detail, id, settings)
    const patch: Partial<Video> = {}
    if (coverLocal) {
      patch.posterSource = mr.detail.source ?? 'moviedb'
      patch.posterPath = coverLocal
    }
    await repo.updateVideo(id, patch)
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send(IPC.posterFetched, {
          videoId: id,
          posterPath: coverLocal,
          posterSource: mr.detail.source ?? 'moviedb'
        })
      }
    }
    return { ok: true as const, detail: mr.detail, source: mr.source }
  })

  // ---------- 编辑标题后同步修改磁盘文件名（v2.6.5）----------
  // 用户在「编辑影片信息」里改标题并勾选「同时修改文件名」时调用。
  // 保持扩展名与所在目录不变，只改主文件名；失败一律返回原因，不抛异常（元数据保存不受影响）。
  ipcMain.handle(IPC.videoRenameFile, async (_e, id: string, newTitle: string) => {
    const v = await repo.getVideo(id)
    if (!v) return { ok: false as const, error: '视频不存在' }
    const safeBase = safeFileBaseName(newTitle)
    if (!safeBase) return { ok: false as const, error: '标题为空或不含可用字符，无法生成文件名' }
    const oldPath = v.path
    const dir = path.dirname(oldPath)
    const ext = path.extname(oldPath)
    const newPath = path.join(dir, safeBase + ext)
    // 大小写不同也算改名：Windows 文件系统不敏感，rename 同名不同大小写会被忽略。
    if (newPath.toLowerCase() === oldPath.toLowerCase()) {
      return { ok: true as const, video: v, oldName: path.basename(oldPath), newName: path.basename(oldPath) }
    }
    try {
      await fs.access(oldPath)
    } catch {
      return { ok: false as const, error: `原文件已不存在：${oldPath}` }
    }
    try {
      await fs.access(newPath)
      return { ok: false as const, error: `目标文件名已存在：${path.basename(newPath)}` }
    } catch {
      /* 目标不存在，可以继续 */
    }
    try {
      await fs.rename(oldPath, newPath)
    } catch (e) {
      const msg = (e as Error).message || String(e)
      const friendly = /EPERM|EBUSY|being used/i.test(msg)
        ? '文件被占用（可能正在播放或已被其他程序打开）'
        : msg
      return { ok: false as const, error: `改名失败：${friendly}` }
    }
    const updated = await repo.updateVideo(id, {
      path: newPath,
      fileName: path.basename(newPath)
    })
    if (!updated) return { ok: false as const, error: '改名成功但写回数据失败' }
    console.log(`[ipc] videoRenameFile: ${path.basename(oldPath)} -> ${path.basename(newPath)}`)
    return {
      ok: true as const,
      video: updated,
      oldName: path.basename(oldPath),
      newName: path.basename(newPath)
    }
  })

  ipcMain.handle(IPC.libraryFetchAll, async (_e, libraryId: string, force = false) => {
    console.log('[ipc] libraryFetchAll libraryId=', libraryId, 'force=', force)
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const allVideos = await repo.listVideos({ libraryId })
    // v2.7.x：「锁定」的影片无论普通/强制批量补齐都自动跳过（详情页手动补齐不受限）。
    // 跳过明细随结果返回，UI 结束后明确告知用户。
    const lockedSkipped = allVideos
      .filter((v) => v.locked)
      .map((v) => ({ id: v.id, title: localCanonicalName(v) }))
    // v2.7.x：文件已不存在的失效记录也跳过（不去浪费请求；下次扫描会自动清理掉）
    const missingSkipped: Array<{ id: string; title: string }> = []
    const videos = allVideos.filter((v) => {
      if (v.locked) return false
      if (!v.path || !existsSync(v.path)) {
        missingSkipped.push({ id: v.id, title: localCanonicalName(v) })
        return false
      }
      return true
    })
    if (lockedSkipped.length > 0 || missingSkipped.length > 0) {
      console.log(
        `[ipc] libraryFetchAll 跳过 ${lockedSkipped.length} 部锁定 / ${missingSkipped.length} 部失效（文件不存在），共 ${allVideos.length} 部`
      )
    }
    if (videos.length === 0) {
      emitProgress({ libraryId, total: 0, done: 0 })
      return {
        ok: 0,
        failed: 0,
        bySource: { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 } as Record<SourceId, number>,
        failures: [],
        stopped: false,
        remaining: 0,
        remainingNoPoster: 0,
        lockedSkipped,
        missingSkipped
      }
    }
    // 抓取并发数 / 间隔（限速、降风控），Settings 中可配。
    // 修复：`Math.floor(x) || 默认值` 在 x=0 时会被默认值顶掉（0 无法生效）——
    // 用显式 Number.isFinite 判断，0 间隔（不限速）可以真正设置为 0。
    const rawConcurrency = Math.floor(settings.fetchConcurrency)
    const baseConcurrency = Number.isFinite(rawConcurrency) && rawConcurrency >= 1
      ? Math.max(1, Math.min(8, rawConcurrency))
      : 2
    const rawInterval = Math.floor(settings.fetchIntervalMs)
    const baseInterval = Number.isFinite(rawInterval) && rawInterval >= 0 ? rawInterval : 600
    // 强制重抓模式：每部都重搜，量极大；并发降到 1、间隔 2 秒，避免触发 数据源 反爬 (HTTP 403)。
    // 普通补齐保持用户配置的并发/间隔。
    const concurrency = force ? 1 : baseConcurrency
    const interval = force ? 3000 : baseInterval
    let done = 0
    let ok = 0
    let failed = 0
    const bySource: Record<SourceId, number> = { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 }
    const failures: Array<{ id: string; title: string; reason: string }> = []
    const smartState = createSmartFetchState()
    activeFetchState = smartState
    // v2.8.5：批量补齐开始时先推一条事件，让 renderer 的左下角浮层立刻显示
    emitProgress({
      libraryId,
      total: videos.length,
      done: 0,
      current: force ? '强制重新获取全部信息' : '补齐缺失信息',
      fetchEvent: { code: 'start', src: 'batch', status: 'trying', detail: `total=${videos.length}` }
    })
    // 同检索词复用：本批内同名影片（同片多文件）只抓一次，其余直接复用，节省请求额度
    const queryCache = new Map<string, MovieMeta>()
    let idx = 0
    // v2.2.10-fix4：批量写盘——worker 内只收集变更，全部结束后一次 applyVideoChanges，
    // 不再逐条 updateVideo 全量写 4.7MB data.json（大库 4680 部 = 4680 次全量写 → 小时级）。
    const pendingChanges: repo.VideoChange[] = []
    // v2.3.10 分段落盘：批量补齐是长任务（4494 部可能跑几十分钟），中途关掉/崩溃时
    // pendingChanges 里已抓到的元数据会全部丢失（原来只在全部跑完才一次落盘）。
    // 现在每 CHECKPOINT_SIZE 条落盘一次，中断最多丢一小批；落盘用锁串行且不阻塞 worker。
    const CHECKPOINT_SIZE = 100
    let flushing = false
    const flushPending = async (): Promise<void> => {
      if (flushing || pendingChanges.length === 0) return
      flushing = true
      const batch = pendingChanges.splice(0, pendingChanges.length)
      try {
        await repo.applyVideoChanges(batch)
        console.log(`[ipc] 补齐进度落盘：${batch.length} 条`)
      } catch (e) {
        console.error('[ipc] 补齐进度落盘失败:', (e as Error)?.message || e)
      } finally {
        flushing = false
      }
    }
    /** 等待在途落盘结束后再落最后一批（收尾调用） */
    const flushPendingSync = async (): Promise<void> => {
      for (let i = 0; i < 100 && flushing; i++) await new Promise((r) => setTimeout(r, 20))
      await flushPending()
    }
    const applyPatch = (v: Video, patch: Partial<Video>): void => {
      const existing = pendingChanges.find((c) => c.type === 'update' && c.video.id === v.id)
      if (existing && existing.type === 'update') {
        existing.video = { ...existing.video, ...patch }
      } else {
        pendingChanges.push({ type: 'update', video: { ...v, ...patch } })
      }
    }
    const worker = async () => {
      while (idx < videos.length && !smartState.stop) {
        const v = videos[idx++]
        // 防御：批量执行期间被临时锁定 → 同样跳过，不发任何请求
        if (v.locked) {
          done++
          emitProgress({ libraryId, total: videos.length, done, current: localCanonicalName(v) })
          continue
        }
        // 本轮是否发过网络请求（封面抓取 / 详情抓取）——有才延时，避免无请求也空等
        let madeRequest = false
        // v2.8.5：抓取过程 UI 显示名统一用「本地真名」，与实际搜索词保持一致
        const displayTitle = localCanonicalName(v)
        emitProgress({ libraryId, total: videos.length, done, current: displayTitle })

        // 0) 所有影片统一走「封面抓取 → 详情抓取」流程（元数据抓取对所有影片开放）

        // 1) 封面：仅缺封面/占位图才抓。force 不重抓海报——海报是图片、URL 基本不变，
        //    本地缓存命中即可；重抓只会浪费 数据源/数据源 请求额度并加剧 403。
        if (!v.posterPath || v.posterSource === 'placeholder') {
          madeRequest = true
          // v2.2.8：海报抓取按 customSourceOrder 降级（原来硬走 数据源）→ 失败则 ffmpeg 批量截帧兜底
          const 数据源Poster = await fetchPosterSmart(v, settings)
          let localPath: string | null = 数据源Poster
          let source: ImageSource = 'moviedb'
          let previews: string[] | undefined
          // 替换前验证图片有效性：下载损坏/截断的坏图视为失败 → 走 ffmpeg 截帧兜底
          if (localPath && !(await isCoverUsable(localPath, settings))) {
            await fs.unlink(localPath).catch(() => {})
            localPath = null
          }
          if (!localPath) {
            const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
            if (coverPath) {
              localPath = coverPath
              source = 'ffmpeg'
            }
            if (coverPath) {} // quick cover only, full previews via V2 queue
          }
          if (localPath) {
            const patch: Partial<Video> = { posterSource: source, posterPath: localPath }
            if (previews && previews.length) patch.previewPaths = previews
            await repo.updateVideo(v.id, patch)
            for (const w of BrowserWindow.getAllWindows()) {
              if (!w.isDestroyed()) {
                w.webContents.send(IPC.posterFetched, { videoId: v.id, posterPath: localPath })
              }
            }
            ok++
          }
        }

        // 2) 缺详情或详情陈旧（含远程 URL） → 抓详情
        const d = v.meta
        // parseVer !== 2：旧解析器写入的数据，需要重抓覆盖；
        // parseVer === 2：当前解析器已抓过，跳过以节省请求额度。
        const detailStale =
          !d ||
          d.parseVer !== 2 ||
          (d.cover ? /^https?:\/\//.test(d.cover) : false) ||
          // v2.7.x：新版 MovieDB 详情会回填演员头像，旧数据缺失时视为陈旧，触发重新抓取
          (d.source === 'moviedb' && !d.castProfiles)
        // v2.8.5：本地文件夹/文件名是用户唯一真名，搜索时优先用它，而不是上次抓取到的 meta.title
        const fetchCodeRaw = localCanonicalName(v)
        const base = extractMovieQuery(fetchCodeRaw).query
        // 同一检索词已在本批抓取过 → 直接复用，不重复请求
        const queryHit = base ? queryCache.get(base) : undefined
        if (queryHit) {
          applyPatch(v, { meta: queryHit, ...backfillFromDetail(v, queryHit) })
          ok++
          const src = queryHit.source ?? 'moviedb'
          bySource[src] = (bySource[src] ?? 0) + 1
          // v2.8.5：queryCache 复用也要在左下角浮层显示命中，否则用户看不到过程
          emitProgress({
            libraryId,
            total: videos.length,
            done,
            current: displayTitle,
            fetchEvent: { code: displayTitle, src, status: 'hit', detail: 'cache-hit' }
          })
        } else if (force || detailStale) {
          madeRequest = true
          // 智能抓取：数据源 连续失败自动切 数据源；数据源 也连续失败自动停止
          // v2.2.10：onEvent 把每次源尝试推给 renderer（UI 实时显示"数据源 失败 → 降级 数据源"）
          const mr = await fetchDetailSmart(fetchCodeRaw, settings, smartState, (e) => {
            emitProgress({ libraryId, total: videos.length, done, current: displayTitle, fetchEvent: { ...e, code: displayTitle || e.code } })
          })
          if (mr.detail) {
            if (base) queryCache.set(base, mr.detail)
            applyPatch(v, { meta: mr.detail, ...backfillFromDetail(v, mr.detail) })
            // **关键**：如果之前的封面是 ffmpeg 兜底（无数据源海报时），但 detail.cover 有真实海报，
            // 用 detail.cover 下载本地海报覆盖错误的截帧，保证列表/详情一致
            if (
              mr.detail.cover &&
              (v.posterSource === 'ffmpeg' || v.posterSource === 'placeholder' || !v.posterPath)
            ) {
              const coverLocal = await resolveDetailCover(mr.detail, v.id, settings)
              if (coverLocal) {
                await applyPatch(v, {
                  posterSource: mr.detail.source ?? 'moviedb',
                  posterPath: coverLocal
                })
                for (const w of BrowserWindow.getAllWindows()) {
                  if (!w.isDestroyed()) {
                    w.webContents.send(IPC.posterFetched, {
                      videoId: v.id,
                      posterPath: coverLocal,
                      posterSource: mr.detail.source ?? 'moviedb'
                    })
                  }
                }
              }
            }
            ok++
            const src = mr.detail.source ?? 'moviedb'
            bySource[src] = (bySource[src] ?? 0) + 1
          } else {
            failed++
            failures.push({ id: v.id, title: localCanonicalName(v), reason: mr.error || '未知原因' })
          }
        } else {
          // v2.8.5：非强制模式且详情不陈旧 → 在左下角浮层显示跳过，避免用户以为没反应
          emitProgress({
            libraryId,
            total: videos.length,
            done,
            current: displayTitle,
            fetchEvent: { code: displayTitle, src: 'skip', status: 'skipped', detail: 'detail-up-to-date' }
          })
        }
        // 统一限速：本轮发过请求才延时一次（修复旧逻辑封面+详情都抓时延时两次、间隔翻倍）
        if (madeRequest) await new Promise((r) => setTimeout(r, interval))
        if (smartState.stop) break
        done++
        emitProgress({ libraryId, total: videos.length, done, current: displayTitle })
        // 分段落盘（不阻塞 worker）：攒够一批就落盘，避免中途关闭丢掉全部进度
        if (pendingChanges.length >= CHECKPOINT_SIZE) void flushPending()
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, videos.length) }, () => worker()))
    // v2.2.10-fix4：worker 全部结束后批量落盘（原来逐条全量写，大库下小时级）
    // v2.3.10：剩余不足一批的收尾落盘（等可能的在途落盘结束后再写）
    await flushPendingSync()
    emitProgress({ libraryId, total: videos.length, done: videos.length })
    // 无封面兜底：多数据源都抓不到数据的视频，后台 ffmpeg 截帧显示真实画面（不阻塞补齐返回）
    void (async () => {
      try {
        const all = await repo.listVideos({})
        const noPosterAll = all.filter(
          (v) =>
            v.libraryId === libraryId &&
            // v2.7.x：锁定影片的封面也不要在批量补齐里被覆盖
            !v.locked &&
            (!v.posterPath || v.posterSource === 'placeholder') &&
            // v2.3.11：跳过刚截帧失败过的损坏文件（否则每轮都在同一个坏文件上卡超时）
            !frameFailedRecently(v)
        )
        // 批次上限：单轮补齐最多后台截 200 部（每部最多 16 个 ffmpeg 进程，放开会让大库 CPU 风暴）
        const noPoster = noPosterAll.slice(0, FRAME_FALLBACK_LIMIT)
        if (noPoster.length === 0) return
        console.log(
          `[ipc] 无封面兜底截帧：待处理 ${noPosterAll.length} 部，本轮截 ${noPoster.length} 部` +
            (noPosterAll.length > noPoster.length
              ? `（剩余 ${noPosterAll.length - noPoster.length} 部需再跑一轮「补齐信息」）`
              : '')
        )
        const conc2 = Math.max(1, Math.min(4, Math.floor(settings.scanConcurrency) || 2))
        let i2 = 0
        // fix4：截帧兜底也批量落盘（最多 200 次全量写 → 1 次）
        const frameChanges: repo.VideoChange[] = []
        const w2 = async () => {
          while (i2 < noPoster.length) {
            const v = noPoster[i2++]
            let frameFailed = true
            try {
              const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
              if (coverPath) {
                frameFailed = false
                const patch: Partial<Video> = {
                  posterSource: 'ffmpeg' as const,
                  posterPath: coverPath,
                  posterPathFfmpeg: coverPath,
                  frameFailedAt: undefined // 截帧成功：清掉此前的失败标记
                }
                const existing = frameChanges.find((c) => c.type === 'update' && c.video.id === v.id)
                if (existing && existing.type === 'update') {
                  existing.video = { ...existing.video, ...patch }
                } else {
                  frameChanges.push({ type: 'update', video: { ...v, ...patch } })
                }
                for (const w of BrowserWindow.getAllWindows()) {
                  if (!w.isDestroyed()) {
                    w.webContents.send(IPC.posterFetched, { videoId: v.id, posterPath: coverPath, posterSource: 'ffmpeg' })
                  }
                }
              }
            } catch {
              frameFailed = true
            }
            // v2.3.11：截帧没出图（损坏文件 / 超时）→ 打时间戳，批量任务冷却期内不再碰它
            if (frameFailed) {
              frameChanges.push({ type: 'update', video: { ...v, frameFailedAt: Date.now() } })
              void frameLog(`[ipc] 截帧失败打标，7 天内跳过 id=${v.id} path=${v.path}`)
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(conc2, noPoster.length) }, () => w2()))
        if (frameChanges.length > 0) {
          await repo.applyVideoChanges(frameChanges)
        }
        console.log(`[ipc] 无封面兜底截帧完成：产出 ${frameChanges.length}/\${noPoster.length} 部`)
      } catch {
        /* 静默 */
      }
    })()
    // v2.3.11：统计本轮结束后仍无封面的部数（兜底截帧每轮上限 200，需要告知用户是否再来一轮）
    let remainingNoPoster = 0
    try {
      const after = await repo.listVideos({ libraryId })
      remainingNoPoster = after.filter(
        (v) =>
          // v2.7.x：锁定影片不参与批量补齐，也不计入「仍无封面」
          !v.locked && (!v.posterPath || v.posterSource === 'placeholder') && !frameFailedRecently(v)
      ).length
    } catch {
      /* 统计失败不影响主流程 */
    }
    activeFetchState = null
    return {
      ok,
      failed,
      bySource,
      failures,
      stopped: smartState.stop,
      remaining: smartState.stop ? Math.max(0, videos.length - idx) : 0,
      remainingNoPoster,
      lockedSkipped,
      missingSkipped
    }
  })

  ipcMain.handle(IPC.libraryFetchPause, () => {
    if (activeFetchState) activeFetchState.paused = true
  })
  ipcMain.handle(IPC.libraryFetchResume, () => {
    if (activeFetchState) activeFetchState.paused = false
  })
  ipcMain.handle(IPC.libraryFetchStop, () => {
    if (activeFetchState) activeFetchState.stop = true
  })

  // ---------- 设置 ----------
  ipcMain.handle(IPC.settingsGet, () => repo.getSettings())
  ipcMain.handle(IPC.settingsSet, async (_e, patch: any) => {
    const saved = await repo.saveSettings(patch)
    // 运行时设置即时生效：开机自启 / 最小化到托盘
    const s = await repo.getSettings()
    applyRuntimeSettings(s)
    // 文件夹自动监控：开关变更时启动/停止所有媒体库监控
    if (patch.autoWatchFolders !== undefined) {
      const libs = await repo.listLibraries()
      if (s.autoWatchFolders) {
        for (const lib of libs) {
          startWatching(lib.id, lib.folderPath, s.watchDebounceMs ?? 3000)
        }
      } else {
        for (const lib of libs) {
          stopWatching(lib.id)
        }
      }
    }
    return saved
  })
  // ---------- 卸载应用（危险操作） ----------
  ipcMain.handle(IPC.appUninstall, async (_evt, keepUser: boolean) => {
    try {
      // NSIS 卸载程序与主程序同目录：Uninstall <productName>.exe
      const dir = path.dirname(process.execPath)
      const candidates = ['Uninstall 影海.exe', 'Uninstall.exe']
      // 把「是否保留用户数据」决定传入卸载程序：
      //   /YXKEEPDATA → 保留；/YXDELDATA → 删除（仍受保护脚本安全校验，永不触碰媒体库）
      // 注意：不可用 electron-builder 自带的 --delete-app-data（会无差别 RMDir，不安全）。
      const dataArg = keepUser ? '/YXKEEPDATA' : '/YXDELDATA'
      for (const name of candidates) {
        const p = path.join(dir, name)
        try {
          await fs.access(p)
          // 非静默启动 NSIS 卸载程序，使其卸载界面（进度页）正常弹出；
          // 数据去留已由应用内确认框决定，卸载器会据此跳过「是否保留用户数据」页。
          // 关键：必须 detached + 继承环境 + 脱离进程组，否则卸载程序会随主进程一起被杀。
          const child = spawn(p, [dataArg], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            shell: false,
            env: { ...process.env }
          })
          child.unref()
          // 主动退出应用，让出文件锁。Electron 需要约 1~2s 才能完全释放
          // 缓存/Storage 锁，因此延迟 2000ms；用户点过欢迎页后才进入删除阶段，
          // 这段延迟不会阻塞卸载流程。
          setTimeout(() => {
            app.quit()
          }, 2000)
          return { ok: true }
        } catch {
          /* 继续找下一个 */
        }
      }
      return { ok: false, error: '未找到卸载程序（开发模式无卸载入口）' }
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || '卸载失败' }
    }
  })
  ipcMain.handle(IPC.dialogSelectFolder, async () => {
    const res = await dialog.showOpenDialog({
      title: '第 1 步 · 选择视频文件夹',
      buttonLabel: '选择此文件夹',
      message: '影海会扫描该文件夹及子文件夹里的全部视频文件，生成你的海报墙。',
      properties: ['openDirectory']
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.dialogSelectFile, async (_e, opts?: { title?: string; buttonLabel?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    // 默认选 Excel 片单；调用方可传自定义 filters（如选视频、其他类型）
    const filters = opts?.filters ?? [
      { name: 'Excel 工作簿', extensions: ['xlsx', 'xls'] },
      { name: '所有文件', extensions: ['*'] }
    ]
    const res = await dialog.showOpenDialog({
      title: opts?.title ?? '选择文件',
      buttonLabel: opts?.buttonLabel ?? '选择',
      properties: ['openFile'],
      filters
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.openPath, async (_e, p: string) => {
    // v2.2.13：只放行绝对路径（openPath 可被用来打开任意文件/程序）
    if (typeof p !== 'string' || !path.isAbsolute(p)) {
      console.warn('[ipc] openPath 被拒绝（非绝对路径）')
      return
    }
    try {
      await shell.openPath(p)
    } catch {
      // 忽略打开失败
    }
  })

  // ---------- 仅扫描媒体库影片清单（不弹保存对话框、不写文件，供向导打开时自动加载） ----------
  ipcMain.handle(IPC.libraryGetCodes, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) return { count: 0, codes: [] }
    const files: string[] = []
    for await (const f of walk(lib.folderPath)) files.push(f)
    const seen = new Set<string>()
    const codes: string[] = []
    for (const f of files) {
      const base = path.basename(f)
      const ext = path.extname(f)
      const name = base.slice(0, base.length - ext.length)
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      codes.push(name)
    }
    codes.sort((a, b) => a.localeCompare(b, 'zh'))
    return { count: codes.length, codes }
  })

  // ---------- 导出影片清单（txt 或 xlsx 模板）----------
  ipcMain.handle(IPC.libraryExportCodes, async (_e, libraryId: string, format: 'txt' | 'xlsx') => {
    console.log('[exportCodes] called:', { libraryId, format })
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) return { ok: false, error: 'library-not-found' }
    // 复用上面的 walk + 提取文件名逻辑
    const files: string[] = []
    for await (const f of walk(lib.folderPath)) files.push(f)
    const seen = new Set<string>()
    const codes: string[] = []
    for (const f of files) {
      const base = path.basename(f)
      const ext = path.extname(f)
      const name = base.slice(0, base.length - ext.length)
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      codes.push(name)
    }
    codes.sort((a, b) => a.localeCompare(b, 'zh'))
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: format === 'xlsx' ? '导出影片清单 (Excel)' : '导出影片清单 (txt)',
      defaultPath: `影片清单_${lib.name}.${format}`,
      filters: format === 'xlsx'
        ? [{ name: 'Excel', extensions: ['xlsx'] }]
        : [{ name: 'Text', extensions: ['txt'] }]
    })
    console.log('[exportCodes] save dialog result:', { canceled, filePath, codesCount: codes.length })
    if (canceled || !filePath) return { ok: false, error: 'canceled' }
    try {
      if (format === 'xlsx') {
        const wb = XLSX.utils.book_new()
        const rows: string[][] = [['编号', '标题', '年份', '分类', '推荐评分', '简介', '主题', '地区', '系列']]
        codes.forEach((title, idx) => rows.push([String(idx + 1), title, '', '', '', '', '', '', '']))
        const ws = XLSX.utils.aoa_to_sheet(rows)
        // 列宽自适应：中文按2宽度计算，标题列按最长标题+6空隙
        const displayWidth = (s: string) => [...s].reduce((w, ch) => w + (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1), 0)
        const maxTitleW = codes.reduce((max, t) => Math.max(max, displayWidth(t)), 8)
        ws['!cols'] = [
          { wch: 6 },   // 编号
          { wch: maxTitleW + 6 },  // 标题（自适应+空隙）
          { wch: 8 },   // 年份
          { wch: 10 },  // 分类
          { wch: 10 },  // 推荐评分
          { wch: 60 },  // 简介
          { wch: 20 },  // 主题
          { wch: 12 },  // 地区
          { wch: 12 },  // 系列
        ]
        XLSX.utils.book_append_sheet(wb, ws, '片单')
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
        writeFileSync(filePath, wbout)
        console.log('[exportCodes] xlsx written:', filePath, 'rows:', rows.length, 'codes:', codes.length)
      } else {
        writeFileSync(filePath, codes.join('\n'), 'utf-8')
        console.log('[exportCodes] txt written:', filePath, 'codes:', codes.length)
      }
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ---------- 获取内置规范文件路径（按语言选） ----------
  ipcMain.handle(IPC.specGet, async () => {
    let lang = 'zh-CN'
    try {
      const settings = await repo.getSettings()
      lang = settings.language || 'zh-CN'
    } catch {
      // repo 尚未初始化时兜底中文
    }

    const zhFile = '通用评分与简介规范.md'
    const enFile = 'Scoring_and_Synopsis_Guide.en.md'

    const candidates = lang === 'en-US'
      ? [enFile, zhFile]
      : [zhFile, enFile]

    for (const name of candidates) {
      const devPath = path.join(process.cwd(), 'src', 'main', 'assets', name)
      const resPath = path.join(process.resourcesPath ?? '', name)
      if (existsSync(devPath)) return { path: devPath }
      if (existsSync(resPath)) return { path: resPath }
    }

    return { path: path.join(process.cwd(), 'src', 'main', 'assets', zhFile) }
  })

  // ---------- 从磁盘删除视频文件 ----------
  // 判定：视频所在目录下除自身外没有任何其他文件 → 整个目录一起挪回收站；
  // 否则只删视频文件本身。
  // 安全检查：若目录下还有其他文件（文本/字幕/图片等），保守地只删视频文件（避免误删用户其他资料）。
  // **实现方式：用 Electron `shell.trashItem` 把文件/目录挪到系统回收站**
  //（Windows 回收站 / macOS Trash / Linux trash-cli），不彻底删除。
  // 用户可从回收站恢复，比"直接删"安全得多。
  ipcMain.handle(IPC.videoDeleteFile, async (_e, id: string) => {
    // v2.2.13：删除磁盘文件是危险操作，先校验 id 合法性
    if (!isSafeId(id)) return { ok: false, error: '非法的视频 id' }
    try {
      const v = await repo.getVideo(id)
      if (!v) return { ok: false, error: '视频不存在' }
      if (!v.path) return { ok: false, error: '视频文件路径为空' }

      const filePath = v.path
      const dir = path.dirname(filePath)
      const baseName = path.basename(filePath)

      const VIDEO_EXTS = new Set([
        '.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm', '.m4v', '.ts', '.m2ts', '.mpg', '.mpeg'
      ])

      // 无论最终删到什么，都先清理关联缓存图片 + 删除 data.json 里的记录
      //（记录含 meta 全部文本元数据：演员/时长/导演/制片公司/主演/评分等，一并消失）
      const cleanAll = async () => {
        const c = await cleanVideoCacheFiles(v)
        try {
          await repo.removeVideo(id)
        } catch {
          /* 记录删除失败不阻塞主流程 */
        }
        return c
      }

      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch (e) {
        // 目录不存在 / 权限不足 → 仍尝试只挪视频文件到回收站
        await shell.trashItem(filePath).catch(() => {})
        const c = await cleanAll()
        return { ok: true, path: filePath, deletedDir: false, removedCache: c.removed, removedRecord: true, error: `无法读取目录（${(e as Error)?.message ?? '未知错误'}），仅把视频文件挪到回收站` }
      }

      const otherVideoFiles: string[] = []
      const otherFiles: string[] = []
      for (const e of entries) {
        if (!e.isFile()) continue
        if (e.name === baseName) continue
        const ext = path.extname(e.name).toLowerCase()
        if (VIDEO_EXTS.has(ext)) otherVideoFiles.push(e.name)
        else otherFiles.push(e.name)
      }

      // 整目录挪回收站的条件：同目录除本视频外没有任何其他文件
      const canDeleteDir = otherVideoFiles.length === 0 && otherFiles.length === 0

      const c = await cleanAll()

      if (canDeleteDir) {
        // 整目录挪回收站（shell.trashItem 支持目录）
        await shell.trashItem(dir)
        return { ok: true, path: filePath, deletedDir: true, dirPath: dir, removedCache: c.removed, removedRecord: true }
      } else {
        // 只挪视频文件本身
        await shell.trashItem(filePath)
        return { ok: true, path: filePath, deletedDir: false, removedCache: c.removed, removedRecord: true }
      }
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? '删除失败' }
    }
  })

  // ---------- 删除预检：列出 video 所在目录的其他文件数（不删任何文件） ----------
  ipcMain.handle(IPC.videoInspectForDelete, async (_e, id: string) => {
    try {
      const v = await repo.getVideo(id)
      if (!v) return { ok: false, error: '视频不存在' }
      if (!v.path) return { ok: false, error: '视频文件路径为空' }

      const filePath = v.path
      const dir = path.dirname(filePath)
      const baseName = path.basename(filePath)

      const VIDEO_EXTS = new Set([
        '.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm', '.m4v', '.ts', '.m2ts', '.mpg', '.mpeg'
      ])

      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch (e) {
        return { ok: false, filePath, dirPath: dir, error: `无法读取目录：${(e as Error)?.message ?? '未知错误'}` }
      }

      let otherVideoCount = 0
      let otherFileCount = 0
      for (const e of entries) {
        if (!e.isFile()) continue
        if (e.name === baseName) continue
        const ext = path.extname(e.name).toLowerCase()
        if (VIDEO_EXTS.has(ext)) otherVideoCount++
        else otherFileCount++
      }
      return { ok: true, filePath, dirPath: dir, otherVideoCount, otherFileCount }
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? '预检失败' }
    }
  })

  // ---------- 封面来源切换：数据源图（各数据源）↔ FFmpeg 截帧图 ----------
  // 两套图独立保存：posterPathFfmpeg 始终存 FFmpeg 截帧封面；
  // 切换到 'ffmpeg' → posterPath=截帧图；切换到 'data' → 优先用数据源缓存图，没有则抓取。
  ipcMain.handle(IPC.videoSwitchPoster, async (_e, id: string, source: 'data' | 'ffmpeg') => {
    try {
      const v = await repo.getVideo(id)
      if (!v) return { ok: false, error: '视频不存在' }
      const settings = await repo.getSettings()

      if (source === 'ffmpeg') {
        // 1) 已有 FFmpeg 截帧封面 → 直接切换
        if (v.posterPathFfmpeg) {
          try {
            await fs.access(v.posterPathFfmpeg)
            await repo.updateVideo(id, { posterPath: v.posterPathFfmpeg, posterSource: 'ffmpeg' })
            return { ok: true, posterPath: v.posterPathFfmpeg, posterSource: 'ffmpeg' }
          } catch {
            /* 文件丢失，重新生成 */
          }
        }
        // 2) 生成 FFmpeg 截帧（封面 + 预览图），并持久化两处
        const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
        if (!coverPath) return { ok: false, error: 'FFmpeg 截帧失败（检查 ffmpeg 是否可用）' }
        await repo.updateVideo(id, {
          posterPath: coverPath,
          posterSource: 'ffmpeg',
          posterPathFfmpeg: coverPath,
          
        })
        return { ok: true, posterPath: coverPath, posterSource: 'ffmpeg' }
      }

      // source === 'data'：优先复用数据源缓存图（src-cover-CODE）
      const code = v.meta?.externalId
      const cacheCandidates: string[] = []
      if (code) {
        cacheCandidates.push(
          path.join(postersCacheDir(), `src-cover-${code}.jpg`),
          path.join(postersCacheDir(), `src-cover-${code}.jpg`),
          path.join(postersCacheDir(), `src-cover-${code}.jpg`)
        )
      }
      for (const p of cacheCandidates) {
        try {
          await fs.access(p)
          await repo.updateVideo(id, { posterPath: p, posterSource: 'moviedb' })
          return { ok: true, posterPath: p, posterSource: 'moviedb' }
        } catch {
          /* 继续尝试下一个 */
        }
      }
      // 无缓存 → 从数据源抓封面（v2.2.8：按 customSourceOrder 降级）
      const fetched = await fetchPosterSmart(v, settings)
      if (!fetched) return { ok: false, error: '数据源封面获取失败（无网络或数据源无此片）' }
      await repo.updateVideo(id, { posterPath: fetched, posterSource: 'moviedb' })
      return { ok: true, posterPath: fetched, posterSource: 'moviedb' }
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? '切换失败' }
    }
  })

  // ---------- ffprobe 技术参数 ----------
  ipcMain.handle(IPC.videoProbe, async (_e, id: string) => {
    const v = await repo.getVideo(id)
    if (!v) throw new Error('视频不存在')
    const settings = await repo.getSettings()
    const info = await probeVideo(v.path, settings)
    if (!info) return null
    return repo.updateVideo(id, { techInfo: info })
  })

  // v2.3.7 批量补齐时长：对当前库所有缺时长视频 ffprobe 读时长写 techInfo（复用 probeVideo）
  ipcMain.handle(IPC.libraryBatchProbe, async (_e, libraryId: string) => {
    if (!isSafeId(libraryId)) throw new Error('非法库 id')
    const settings = await repo.getSettings()
    const videos = await repo.listVideos({ libraryId })
    const needProbe = videos.filter((v) => !v.techInfo?.durationSec && !v.durationSec)
    const changes: repo.VideoChange[] = []
    const applyTech = (v: Video, info: TechInfo) => {
      const existing = changes.find((c) => c.type === 'update' && c.video.id === v.id)
      if (existing && existing.type === 'update') {
        existing.video = { ...existing.video, techInfo: info }
      } else {
        changes.push({ type: 'update', video: { ...v, techInfo: info } })
      }
    }
    let ok = 0
    let failed = 0
    const conc = Math.max(1, Math.min(4, Math.floor(settings.scanConcurrency) || 2))
    let idx = 0
    const worker = async () => {
      while (idx < needProbe.length) {
        const v = needProbe[idx++]
        try {
          const info = await probeVideo(v.path, settings)
          if (info?.durationSec) {
            applyTech(v, info)
            ok++
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(conc, needProbe.length) }, () => worker()))
    if (changes.length > 0) await repo.applyVideoChanges(changes)
    return { ok, failed, skipped: videos.length - needProbe.length }
  })

  // ---------- 应用信息 ----------
  ipcMain.handle(IPC.appInfo, async () => {
    // 读取更新日志顶部（最近一版），按当前语言优先本地化版本
    // 中文版文件名：更新日志.md；英文版：CHANGELOG.en.md
    let changelog = ''
    const settings = await repo.getSettings().catch(() => null)
    const lang = settings?.language || 'zh-CN'
    const zhLog = '更新日志.md'
    const enLog = 'CHANGELOG.en.md'
    const candidates = lang === 'en-US'
      ? [
          path.join(process.resourcesPath, enLog),
          path.join(app.getAppPath(), enLog),
          path.join(app.getAppPath(), '..', enLog),
          path.join(process.resourcesPath, zhLog), // fallback
          path.join(app.getAppPath(), zhLog),
          path.join(app.getAppPath(), '..', zhLog)
        ]
      : [
          path.join(process.resourcesPath, zhLog),
          path.join(app.getAppPath(), zhLog),
          path.join(app.getAppPath(), '..', zhLog)
        ]
    for (const c of candidates) {
      try {
        const raw = readFileSync(c, 'utf-8')
        // 只取「最近一个正式版本」段落：
        // - 跳过 `## [未发布]` / `## [Unreleased]` 等非版本标题；
        // - 从第一个版本标题开始，截到下一个版本标题之前（只有一个版本时取到文末）。
        const isVersionHeading = (line: string): boolean =>
          /^##\s+\[?(?:v)?\d+\.\d+\.\d+/.test(line.trim())
        const lines = raw.split('\n')
        let start = -1
        let end = lines.length
        for (let i = 0; i < lines.length; i++) {
          if (!isVersionHeading(lines[i])) continue
          if (start < 0) start = i
          else {
            end = i
            break
          }
        }
        changelog = start >= 0 ? lines.slice(start, end).join('\n').trim() : raw.trim()
        break
      } catch {
        // 尝试下一个候选路径
      }
    }
    return {
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      node: process.versions.node ?? '',
      chrome: process.versions.chrome ?? '',
      dataDir: app.getPath('userData'),
      changelog
    }
  })
  // ---------- 打开外部链接 ----------
  ipcMain.handle(IPC.openExternal, async (_e, url: string) => {
    // v2.2.13：只放行 http/https，防止渲染进程注入后经 openExternal 打开 file:// 或任意本地程序
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      console.warn(`[ipc] openExternal 被拒绝（协议非 http/https）: ${String(url).slice(0, 80)}`)
      return
    }
    try {
      await shell.openExternal(url)
    } catch {
      // 忽略打开失败
    }
  })

  // 复制文本到剪贴板（sandbox preload 无法访问 clipboard 模块，必须在主进程做）
  ipcMain.handle(IPC.copyText, async (_e, text: string) => {
    try {
      clipboard.writeText(text)
    } catch {
      // 忽略复制失败
    }
  })

  ipcMain.handle(IPC.shellRevealInFolder, async (_e, p: string) => {
    // v2.2.13：只放行绝对路径
    if (typeof p !== 'string' || !path.isAbsolute(p)) return
    try {
      shell.showItemInFolder(p)
    } catch {
      // 忽略
    }
  })

  // ---------- 批量改名（清理文件名广告） ----------
  ipcMain.handle(IPC.libraryPreviewRenames, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const ignoredSet = new Set(settings.ignoredUnlistedPaths ?? [])
    return previewRenames(
      lib.folderPath,
      async (p) => (await repo.findVideoByPath(p)) !== null,
      (p) => ignoredSet.has(p)
    )
  })

  ipcMain.handle(
    IPC.libraryApplyRenames,
    async (_e, libraryId: string, items: Array<{ path: string; newName: string }>) => {
      const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
      if (!lib) throw new Error('媒体库不存在')
      const result = await applyRenames(items)
      // 改名成功的文件若已有 video 记录（同路径变更），清理旧记录，下次对账重建
      for (const item of items) {
        const v = await repo.findVideoByPath(item.path)
        if (v) await repo.removeVideo(v.id)
      }
      return result
    }
  )

  // ---------- 代理测试连接 ----------
  ipcMain.handle(IPC.proxyTest, async (_e, settings: any) => {
    return testProxyConnectivity(settings ?? {})
  })

  // ---------- 清理海报缓存目录 ----------
  ipcMain.handle(IPC.cacheClear, async () => {
    try {
      const dir = postersCacheDir()
      const entries = await fs.readdir(dir, { withFileTypes: true })
      let removed = 0
      for (const e of entries) {
        if (e.isFile()) {
          await fs.unlink(path.join(dir, e.name))
          removed++
        }
      }
      return { ok: true, removed }
    } catch {
      return { ok: true, removed: 0 }
    }
  })

  // ---------- ffmpeg 运行环境检测（系统优先，检测到系统版自动删除捆绑版释放磁盘） ----------
  ipcMain.handle(IPC.ffmpegStatus, async () => {
    const settings = await repo.getSettings()
    return detectFfmpeg(settings)
  })

  // ---------- 隐私锁：设置 / 校验 / 退出 ----------
  ipcMain.handle(IPC.lockSet, async (_e, password: string) => {
    // password 为空 → 清除锁
    if (!password) {
      await repo.saveSettings({ lockHash: undefined, lockSalt: undefined })
      return
    }
    const salt = randomBytes(16).toString('hex')
    const hash = createHash('sha256').update(salt + password).digest('hex')
    await repo.saveSettings({ lockHash: hash, lockSalt: salt })
  })

  ipcMain.handle(IPC.lockVerify, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return false
    const hash = createHash('sha256').update(s.lockSalt + password).digest('hex')
    return hash === s.lockHash
  })

  // v2.3.12：清除锁前必须校验当前密码，防止误操作或他人直接清掉锁
  ipcMain.handle(IPC.lockDelete, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return { ok: true } // 本来就没锁
    const hash = createHash('sha256').update(s.lockSalt + password).digest('hex')
    if (hash !== s.lockHash) return { ok: false, error: '密码错误' }
    await repo.saveSettings({ lockHash: undefined, lockSalt: undefined })
    return { ok: true }
  })

  ipcMain.handle(IPC.appQuit, () => {
    app.quit()
  })

  // ---------- 检查更新（GitHub / Gitee） ----------
  ipcMain.handle(IPC.updateCheck, (): Promise<UpdateCheckResult> => runUpdateCheck())

  // ---------- ffmpeg 截帧：同步生成封面 + 预览帧，立即返回 ----------
  ipcMain.handle(IPC.videoGeneratePreviews, async (_e, id: string) => {
    // 去重：同一视频正在处理 → 直接等那个 Promise 完成
    const existing = inFlightPreviews.get(id)
    if (existing) {
      await frameLog(`[videoGeneratePreviews] dedup id=${id} 已有进行中任务，等待完成`)
      return existing
    }
    const task = (async () => {
      const v = await repo.getVideo(id)
      if (!v) throw new Error('视频不存在')
      await frameLog(`[videoGeneratePreviews] start id=${id} path=${v.path}`)
      const settings = await repo.getSettings()
      try {
        // 同步生成完整预览集
        const result = await generatePreviewV2(v, settings, {
          requestedCount: settings.previewFrameCount ?? 20,
          qualityMode: settings.previewQualityMode ?? 'STANDARD',
          token: { cancelled: false }
        })
        const coverPath = result.coverPath
        const previewPaths = result.manifest.frames.map((f) => f.filePath)
        await frameLog(`[videoGeneratePreviews] done id=${id} cover=${coverPath} previews=${previewPaths.length}`)
        const updated = await repo.updateVideo(id, {
          posterSource: 'ffmpeg',
          posterPath: coverPath,
          posterPathFfmpeg: coverPath,
          previewPaths,
          previewVersion: 2,
          previewStatus: 'COMPLETED',
          previewRequestedCount: settings.previewFrameCount
        })
        // 关键：updateVideo 内部是 debounce 写盘，这里强制 flush 确保落盘
        await flushSave()
        const verify = await repo.getVideo(id)
        const ppCount = verify?.previewPaths?.length ?? 0
        const posterStr = (verify?.posterPath ?? 'null').slice(0, 60)
        await frameLog(`[videoGeneratePreviews] saved id=${id} previewPaths.count=${ppCount} poster=${posterStr}`)
        return updated
      } catch (err) {
        await frameLog(`[videoGeneratePreviews] failed id=${id} err=${(err as Error)?.message ?? String(err)}`)
        // 失败兜底：至少截个封面
        const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
        if (coverPath) {
          await frameLog(`[videoGeneratePreviews] fallback cover=${coverPath}`)
          const fallbackUpdated = await repo.updateVideo(id, {
            posterSource: 'ffmpeg',
            posterPath: coverPath,
            posterPathFfmpeg: coverPath
          })
          await flushSave()
          return fallbackUpdated
        }
        return null
      } finally {
        inFlightPreviews.delete(id)
      }
    })()
    inFlightPreviews.set(id, task)
    return task
  })

  // ---------- ffmpeg 单帧兜底  // ---------- ffmpeg 单帧兜底：无封面时截 1 帧视频画面作封面（列表懒加载用） ----------
  ipcMain.handle(IPC.videoFrameFallback, async (_e, id: string) => {
    const v = await repo.getVideo(id)
    if (!v || !v.path) return null
    const settings = await repo.getSettings()
    if (v.posterPath) {
      if (await isCoverUsable(v.posterPath, settings)) return v.posterPath
      await fs.unlink(v.posterPath).catch(() => {})
    }
    await frameLog(`[videoFrameFallback] start id=${id} path=${v.path}`)
    const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
    if (!coverPath) {
      await frameLog(`[videoFrameFallback] no frame id=${id}`)
      return null
    }
    await repo.updateVideo(id, { posterSource: 'ffmpeg', posterPath: coverPath })
    await frameLog(`[videoFrameFallback] ok id=${id} source=ffmpeg poster=${coverPath}`)
    return coverPath
  })

  // ---------- 截帧预览帧  // ---------- 截帧预览帧 → 设为封面：把某张预览帧复制为 <id>.jpg 并更新记录 ----------
  ipcMain.handle(IPC.videoSetPreviewAsCover, async (_e, id: string, previewPath: string) => {
    if (!isSafeId(id)) throw new Error('非法 id')
    const v = await repo.getVideo(id)
    if (!v) throw new Error('视频不存在')
    // v2.2.13：previewPath 是写文件操作，必须是指向缓存目录内的绝对路径（防任意路径写文件）
    // v2.8.5 修复：预览帧在 userData/preview-frames/ 下，之前只允许 posters/ 导致全部被拒
    if (typeof previewPath !== 'string' || !path.isAbsolute(previewPath)) return null
    const posterDir = postersCacheDir()
    const previewDir = previewRoot()
    const inAllowedDir =
      previewPath.startsWith(posterDir + path.sep) ||
      previewPath.startsWith(previewDir + path.sep)
    if (!inAllowedDir) {
      console.warn('[ipc] videoSetPreviewAsCover 被拒绝（previewPath 不在允许的缓存目录内）')
      return null
    }
    const settings = await repo.getSettings()
    // 校验该预览帧是有效图片（防坏图/不存在）
    if (!(await isCoverUsable(previewPath, settings))) return null
    // 复制到标准封面文件 <id>.jpg（独立于预览图生命周期，预览图清理不影响封面）
    const coverPath = path.join(postersCacheDir(), `${id}.jpg`)
    await fs.copyFile(previewPath, coverPath)
    await frameLog(`[videoSetPreviewAsCover] id=${id} poster=${path.basename(previewPath)}`)
    // posterSource='manual'：手动选择的封面，优先级高于自动抓取的真实封面（详情页/列表立即生效并持久）
    const updated = await repo.updateVideo(id, { posterSource: 'manual', posterPath: coverPath })
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send(IPC.posterFetched, { videoId: id, posterPath: coverPath, posterSource: 'manual' })
      }
    }
    return updated
  })

  // ---------- v2.9.0 新增 handler ----------

  // 重复视频检测
  ipcMain.handle(IPC.libraryFindDuplicates, async (_e, libraryId: string) => {
    if (!isSafeId(libraryId)) throw new Error('非法 libraryId')
    return findDuplicates(libraryId)
  })

  // 读取 NFO 文件
  ipcMain.handle(IPC.videoReadNfo, async (_e, id: string) => {
    if (!isSafeId(id)) return { ok: false, error: '非法 id' }
    const v = await repo.getVideo(id)
    if (!v) return { ok: false, error: '视频不存在' }
    return readNfoForVideo(v.path)
  })

  // 写入 NFO 文件
  ipcMain.handle(IPC.videoWriteNfo, async (_e, id: string) => {
    if (!isSafeId(id)) return { ok: false, error: '非法 id' }
    const v = await repo.getVideo(id)
    if (!v) return { ok: false, error: '视频不存在' }
    const result = await writeNfoForVideo(v)
    if (result.ok && result.path) {
      await repo.updateVideo(id, { nfoPath: result.path })
    }
    return result
  })

  // 播放列表 CRUD
  ipcMain.handle(IPC.playlistList, () => playlist.listPlaylists())
  ipcMain.handle(IPC.playlistCreate, (_e, name: string) => playlist.createPlaylist(name))
  ipcMain.handle(IPC.playlistDelete, (_e, id: string) => playlist.deletePlaylist(id))
  ipcMain.handle(IPC.playlistRename, (_e, id: string, name: string) => playlist.renamePlaylist(id, name))
  ipcMain.handle(IPC.playlistAddVideo, (_e, id: string, videoId: string) => playlist.addVideoToPlaylist(id, videoId))
  ipcMain.handle(IPC.playlistRemoveVideo, (_e, id: string, videoId: string) => playlist.removeVideoFromPlaylist(id, videoId))
  ipcMain.handle(IPC.playlistReorder, (_e, id: string, videoIds: string[]) => playlist.reorderPlaylist(id, videoIds))

  // 更新播放进度（断点续播）
  ipcMain.handle(IPC.videoUpdatePlaybackPosition, (_e, id: string, positionSec: number) => {
    if (!isSafeId(id)) return null
    return updatePlaybackPosition(id, positionSec)
  })
}
