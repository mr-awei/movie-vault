import { app, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'
import type { ReconcileResult } from '../../shared/types'
import * as repo from '../lib/repo'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { postersCacheDir } from '../lib/images'
import { cacheRemoteImage } from '../lib/image-util'
import { probeImage } from '../lib/ffprobe'
import { type MovieMeta, type SourceId, type ScanProgress, type Settings, type Video, type UpdateSource } from '../../shared/types'
import { type UpdateCheckResult, type UpdateAssetInfo } from '../../shared/api-types'
import { fetchDetailSmart, createSmartFetchState, type SmartFetchState } from '../lib/fetch-meta'

// 去重锁：同一视频同时只跑一次 generatePreviews，避免并发写入互相覆盖
export const inFlightPreviews = new Map<string, Promise<unknown>>()

// 当前活跃的批量补齐状态（供 pause/resume/stop 控制）
export let activeFetchState: SmartFetchState | null = null
export function setActiveFetchState(v: SmartFetchState | null): void {
  activeFetchState = v
}
export function getActiveFetchState(): SmartFetchState | null {
  return activeFetchState
}
// ---------- v2.2.13 安全加固：openExternal 协议白名单 + 危险 IPC 参数校验 ----------
// 只允许 http/https（更新链接/官网），杜绝渲染进程被注入后经 shell.openExternal 打开 file:// 或任意程序
export const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:'])
export function isSafeExternalUrl(url: string): boolean {
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
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && !id.includes('/') && !id.includes('\\') && !id.includes('..')
}

// ---------- v2.2.10-fix5：对账结果磁盘缓存（启动/切库先秒出，后台全量对账刷新） ----------
export function reconcileCachePath(libraryId: string): string {
  return path.join(app.getPath('userData'), 'reconcile-cache', `${libraryId}.json`)
}

export async function writeReconcileCache(libraryId: string, result: ReconcileResult): Promise<void> {
  const p = reconcileCachePath(libraryId)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(result), 'utf-8')
}

export async function readReconcileCache(libraryId: string): Promise<ReconcileResult | null> {
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
export async function isCoverUsable(filePath: string, settings: Settings): Promise<boolean> {
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
export async function resolveDetailCover(
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
export function backfillFromDetail(v: Video, detail: MovieMeta): Partial<Video> {
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
export function cmpVer(a: string, b: string): number {
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

export function normalizeAsset(raw: unknown): UpdateAssetInfo | null {
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
export async function cleanVideoCacheFiles(video: Video): Promise<{ removed: number; kept: number }> {
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
export function matchWindowsAsset(assets: unknown[]): { installer?: UpdateAssetInfo; checksum?: UpdateAssetInfo } {
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

export function extractMinimumVersion(notes: string): string | undefined {
  const patterns = [/minVersion\s*[:：]\s*([\d.]+)/i, /minimum\s*version\s*[:：]\s*([\d.]+)/i, /最低版本\s*[:：]\s*([\d.]+)/i]
  for (const p of patterns) {
    const m = notes.match(p)
    if (m) return m[1]
  }
  return undefined
}

export function detectUrgency(notes: string, minimumVersion?: string, currentVersion?: string): 'normal' | 'recommended' | 'critical' | 'mandatory' {
  if (minimumVersion && currentVersion && cmpVer(minimumVersion, currentVersion) > 0) return 'mandatory'
  const cn = notes
  const lower = notes.toLowerCase()
  if (/强制更新|mandatory|必须升级|critical|严重漏洞|安全修复/.test(cn + lower)) return 'mandatory'
  if (/breaking|不兼容|破坏性变更|数据迁移|数据库升级|重构/.test(cn + lower)) return 'critical'
  if (/recommended|建议升级|推荐更新|重要修复|performance|性能优化/.test(cn + lower)) return 'recommended'
  return 'normal'
}

export async function fetchMovieDetail(
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

export function emitProgress(p: ScanProgress): void {
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

/** 无封面兜底截帧的单轮上限：每部视频最多 16 个 ffmpeg 进程，放开会让大库 CPU 风暴 */
export const FRAME_FALLBACK_LIMIT = 200

/** v2.3.11：截帧失败冷却期（7 天）。损坏文件若每次都重试，批量补齐会被反复拖住 */
export const FRAME_FAIL_COOLDOWN = 7 * 24 * 60 * 60 * 1000
/** 该视频是否刚截帧失败过（冷却期内跳过，避免损坏文件反复拖慢批量任务） */
export function frameFailedRecently(v: Video): boolean {
  return !!v.frameFailedAt && Date.now() - v.frameFailedAt < FRAME_FAIL_COOLDOWN
}



/** library 领域 IPC handler */
