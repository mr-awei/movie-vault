import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import type {
  DisplayEntry,
  IntroDoc,
  Library,
  ReconcileResult,
  Settings,
  SourceId,
  UnlistedFile,
  Video
} from '../../shared/types'
import { parseIntroExcel } from './excel'
import { applyVideoChanges, findVideoByPath, listVideos, type VideoChange } from './repo'
import { resolvePoster } from './images'
import { walk, VIDEO_EXTS, idForPath, computeContentHash } from './scanner'
import { extractTitleYear, titleMatches, localCanonicalName } from '../../shared/code'
import { fetchDetailSmart, createSmartFetchState } from './fetch-meta'

/**
 * 无片单兜底自动抓取：每个进程生命周期只自动触发一次（首次 reconcile）。
 * 避免切库/切页面/刷新反复触发 reconcile 时重复发起抓取风暴；之后一律走手动「批量补齐」。
 */
let autoFetchFired = false

/** 同一次 reconcile 内的文件内容指纹去重：contentHash → 已建 Video，避免副本重复建条目 */
let contentSeen = new Map<string, Video>()
/** 同一次 reconcile 内已生成卡片的 video id，避免内容相同的副本重复展示 */
let enteredIds = new Set<string>()

/** dead previewPaths 全量清理限频：每 6 小时最多一次（大库下数千次 existsSync 磁盘 IO 会拖慢打开/切库） */
const PREVIEW_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000
let lastPreviewCleanupAt = 0

/**
 * 片单加载结果（含错误信息）。reconcile.ts 把 error 透传给 ipc.ts，
 * 由 ipc.ts 通过 webContents.send 推到 renderer 弹 Toast——
 * "不能藏起问题"是 v2.2.4 的硬性要求：找不到 Excel / 解析失败都要明确告知用户。
 */
export type IntroLookupResult =
  | { doc: IntroDoc; error?: undefined }
  | {
      doc: null
      error: { kind: 'not-configured' | 'parse-failed' | 'auto-find-failed'; message: string; triedPaths: string[] }
    }

async function readIntroDoc(library: Library): Promise<IntroLookupResult> {
  // 仅使用 Excel 片单（已全面切换到 Excel 格式）
  if (library.introExcelPath) {
    // 用户显式配了：直接解析
    const doc = await parseIntroExcel(library.introExcelPath)
    if (doc) return { doc }
    return {
      doc: null,
      error: {
        kind: 'parse-failed',
        message: `配置的片单 Excel 解析失败或为空：${library.introExcelPath}`,
        triedPaths: [library.introExcelPath]
      }
    }
  }
  // v2.2.3 修复：library 没显式配 introExcelPath 时，**自动扫描库根目录找 .xlsx**——用户友好，
  // 避免「明明片单就在库里却因没配字段而全部归未收录」的体验。匹配规则：
  // 1) 优先匹配根目录下含「片名/标题」列的工作簿（顺序按文件名排序）
  // 2) 只在库根（不递归子目录）扫，避免误匹配到无关 xlsx
  const result = await autoFindIntroExcel(library.folderPath)
  if (result.doc) return { doc: result.doc }
  return {
    doc: null,
    error: {
      kind: result.kind ?? 'not-configured',
      message: result.message,
      triedPaths: result.triedPaths
    }
  }
}

/**
 * 在媒体库根目录自动查找 Excel 片单。
 * v2.2.4 改造：返回结构化结果（含失败原因），不再静默吞错——
 * 「藏起问题」是这次回归测试中用户明确反对的设计。
 */
async function autoFindIntroExcel(
  folderPath: string
): Promise<
  | { doc: IntroDoc; kind?: undefined; message?: undefined; triedPaths?: undefined }
  | { doc: null; kind: 'not-configured' | 'parse-failed'; message: string; triedPaths: string[] }
> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true })
  } catch (e) {
    return {
      doc: null,
      kind: 'not-configured',
      message: `无法读取媒体库根目录：${folderPath}（${(e as Error)?.message || e}）`,
      triedPaths: [folderPath]
    }
  }
  const xlsxFiles = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => /\.(xlsx|xls)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, 'zh'))
  if (xlsxFiles.length === 0) {
    return {
      doc: null,
      kind: 'not-configured',
      message: `媒体库根目录未找到任何 .xlsx/.xls 片单文件：${folderPath}`,
      triedPaths: [folderPath]
    }
  }
  // 依次尝试每个 xlsx，找到第一个「片名/标题列可解析」的
  const triedPaths: string[] = []
  for (const name of xlsxFiles) {
    const fullPath = path.join(folderPath, name)
    triedPaths.push(fullPath)
    try {
      const doc = await parseIntroExcel(fullPath)
      if (doc && doc.categories.length > 0) {
        const total = doc.categories.reduce((n, c) => n + c.items.length, 0)
        console.log(`[reconcile] 自动使用库根 Excel 片单: ${fullPath}（${total} 部 / ${doc.categories.length} 类）`)
        return { doc }
      }
    } catch (e) {
      // 单文件解析失败不影响整体，但记录到消息里——让用户能直接看到是哪个文件坏了
      console.warn(`[reconcile] 解析 ${fullPath} 失败:`, (e as Error)?.message || e)
    }
  }
  return {
    doc: null,
    kind: 'parse-failed',
    message: `媒体库根目录下 ${xlsxFiles.length} 个 Excel 文件均无法解析出有效片单（已尝试：${triedPaths.map((p) => path.basename(p)).join('、')}）`,
    triedPaths
  }
}

interface FileEntry {
  path: string
  /** 文件名（去扩展名、小写），用于externalId匹配 */
  key: string
  /** 外文件夹名（小写），优先级更高的匹配源（比文件名更干净） */
  folderName: string
}

function collectFiles(files: string[]): FileEntry[] {
  return files.map((p) => {
    const base = path.basename(p)
    const ext = path.extname(p)
    const nameNoExt = base.slice(0, base.length - ext.length).toLowerCase()
    const folder = path.basename(path.dirname(p)).toLowerCase()
    return { path: p, key: nameNoExt, folderName: folder }
  })
}

/**
 * 文件名/文件夹名 vs 片单标题的匹配已迁到 src/shared/code.ts 的 titleMatches
 * （带词边界 + 年份约束，不再用externalId子串匹配）。
 */

/**
 * 找出所有匹配该片单标题的文件（同名/同片的多版本文件都算同片，全部标记 used，
 * 避免被误报为「未收录」）。返回按主次排序的文件路径列表。
 * 匹配优先级：外文件夹名命中 > 文件名命中（外文件夹名更干净，命中更权威）。
 */
function findFilesForTitle(excelTitle: string, files: FileEntry[], used: Set<string>): string[] {
  const hits: FileEntry[] = []
  for (const f of files) {
    if (used.has(f.path)) continue
    if (titleMatches(f.folderName, excelTitle) || titleMatches(f.key, excelTitle)) {
      used.add(f.path)
      hits.push(f)
    }
  }
  hits.sort((a, b) => {
    // 外文件夹名命中 > 文件名命中
    const aFolder = titleMatches(a.folderName, excelTitle) ? 0 : 1
    const bFolder = titleMatches(b.folderName, excelTitle) ? 0 : 1
    if (aFolder !== bFolder) return aFolder - bFolder
    return a.key.localeCompare(b.key)
  })
  return hits.map((h) => h.path)
}

async function ensureVideo(
  filePath: string,
  library: Library,
  settings: Settings,
  meta: {
    code: string
    description: string
    tags: string[]
    score?: number
    /** Excel 片单结构化分类标签（新格式）；无片单时为 undefined */
    tagCategories?: Record<string, string[]>
    /** Excel 片单「分类」列的单值，独立于 tagCategories */
    introCategory?: string
    /** v2.8.5：Excel 片单「年份」列，权威覆盖文件名提取 */
    year?: number
    /** v2.8.5：Excel 片单「地区」列 */
    region?: string
    /** v2.8.5：Excel 片单「系列」列 */
    series?: string
  },
  changes: VideoChange[]
): Promise<Video> {
  const { year: yearFromFile } = extractTitleYear(filePath)
  // v2.8.5：片单年份为权威源，优先于文件名提取
  const year = meta.year ?? yearFromFile
  const existing = await findVideoByPath(filePath)
  if (existing) {
    // Excel 为权威来源：简介/标签/评分/tagCategories 以 Excel 为准（仅在变化时记录一次 update，不逐条写盘）
    const nextTags = [...meta.tags]
    const nextCats = meta.tagCategories && Object.keys(meta.tagCategories).length ? { ...meta.tagCategories } : undefined
    const newFolderName = path.basename(path.dirname(filePath))
    const newFileName = path.basename(filePath)
    // 本地文件夹/文件名是用户唯一真名：改名后必须同步到媒体库
    const localNameChanged =
      existing.folderName !== newFolderName ||
      existing.fileName !== newFileName ||
      existing.title !== meta.code
    const excelMetaChanged =
      existing.description !== meta.description ||
      JSON.stringify(existing.tags) !== JSON.stringify(nextTags) ||
      JSON.stringify(existing.tagCategories ?? null) !== JSON.stringify(nextCats ?? null) ||
      existing.rating !== meta.score ||
      existing.introCategory !== meta.introCategory ||
      existing.region !== meta.region ||
      existing.series !== meta.series ||
      existing.year !== year
    if (localNameChanged || excelMetaChanged) {
      const updated: Video = {
        ...existing,
        folderName: newFolderName,
        fileName: newFileName,
        title: meta.code,
        description: meta.description,
        tags: nextTags,
        tagCategories: nextCats,
        descriptionSource: 'manual',
        rating: meta.score ?? existing.rating,
        year,
        introCategory: meta.introCategory ?? existing.introCategory,
        region: meta.region ?? existing.region,
        series: meta.series ?? existing.series
      }
      changes.push({ type: 'update', video: updated })
      return updated
    }
    if (existing.contentHash) contentSeen.set(existing.contentHash, existing)
    return existing
  }
  const stat = await fs.stat(filePath).catch(() => null)
  const contentHash = stat ? await computeContentHash(filePath) : undefined
  // 文件哈希去重：内容相同的副本直接复用已建记录，不重复建条目
  if (contentHash && contentSeen.has(contentHash)) {
    return contentSeen.get(contentHash)!
  }
  const video: Video = {
    id: idForPath(filePath, contentHash, library.id),
    libraryId: library.id,
    path: filePath,
    fileName: path.basename(filePath),
    folderName: path.basename(path.dirname(filePath)),
    title: meta.code,
    year,
    description: meta.description,
    descriptionSource: 'manual',
    tags: [...meta.tags],
    tagCategories: meta.tagCategories && Object.keys(meta.tagCategories).length ? { ...meta.tagCategories } : undefined,
    rating: meta.score,
    addedAt: Date.now(),
    fileSize: stat?.size,
    contentHash,
    introCategory: meta.introCategory,
    region: meta.region,
    series: meta.series
  }
  if (!video.posterPath) {
    const r = await resolvePoster(video, library, settings, { allowFfmpeg: false })
    video.posterSource = r.source
    video.posterPath = r.posterPath
  }
  if (contentHash) contentSeen.set(contentHash, video)
  changes.push({ type: 'upsert', video })
  return video
}

/**
 * 按 Excel 片单对账某个媒体库的视频文件夹。
 * - Excel 条目匹配到文件 → matched（含海报/播放信息）
 * - Excel 有但文件缺失 → missing（提示下载或删除简介）
 * - 文件夹有但 Excel 未收录 → unlisted（提示更新 Excel）
 */
export async function reconcileLibrary(
  library: Library,
  settings: Settings,
  onProgress?: (p: {
    libraryId: string
    total: number
    done: number
    current?: string
    introError?: { kind: string; message: string; triedPaths: string[] }
    fetchEvent?: { code: string; src: SourceId; status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'; detail?: string }
  }) => void
): Promise<ReconcileResult> {
  const introLookup = await readIntroDoc(library)
  const doc = introLookup.doc

  // 片单加载失败：必须告知用户，不能静默吞错。
  // 通过 onProgress 把 introError 推给 renderer，由 renderer 决定弹 toast 还是引导向导。
  // suppressIntroExcelNotice 只在 renderer 侧判断（主进程不屏蔽任何 kind）。
  if (introLookup.error) {
    onProgress?.({
      libraryId: library.id,
      total: 0,
      done: 0,
      introError: introLookup.error
    })
  }

  // 与 scanLibrary 一致：按设置过滤小文件（短视频/预告片）
  const minSizeBytes = Math.max(0, Math.floor(settings.scanMinSizeMB ?? 0)) * 1024 * 1024
  const allFiles: string[] = []
  for await (const f of walk(library.folderPath, minSizeBytes)) allFiles.push(f)
  const fileEntries = collectFiles(allFiles)
  const used = new Set<string>()
  contentSeen = new Map<string, Video>()
  enteredIds = new Set<string>()

  const entries: DisplayEntry[] = []
  const changes: VideoChange[] = []
  let mdCount = 0
  let matched = 0
  let missing = 0

  // 已删除标记：用户主动删除过（文件挪回收站 + data.json 记录被删）的externalId集合。
  // Excel 里有条目但文件缺失时，若该externalId在 data.json 中已无任何记录，说明用户主动删除过，
  // 跳过该条目不标 missing（否则删除后对账又会把它标成"缺失"挂回来）。
  let activeCodeSet: Set<string> | null = null
  const getActiveCodeSet = async (): Promise<Set<string>> => {
    if (activeCodeSet) return activeCodeSet
    const s = new Set<string>()
    try {
      const all = await listVideos({})
      for (const v of all) {
        if (v.meta?.externalId) s.add(v.meta.externalId.toUpperCase())
        // v2.7.x：数据源已更新的标题（meta.title）也要参与片单匹配，避免改了名字后对不上
        if (v.meta?.title) s.add(String(v.meta.title).toUpperCase())
        if (v.title) s.add(String(v.title).toUpperCase())
        else if (v.fileName) s.add(path.basename(v.fileName, path.extname(v.fileName)).toUpperCase())
      }
    } catch {
      /* 拿不到记录列表时保守处理：不跳过（维持原 missing 行为） */
    }
    activeCodeSet = s
    return s
  }

  if (doc) {
    const total = doc.totalCount + allFiles.length
    for (const cat of doc.categories) {
      for (const item of cat.items) {
        mdCount++
        onProgress?.({
          libraryId: library.id,
          total,
          done: mdCount,
          current: item.code
        })
        const files = findFilesForTitle(item.code, fileEntries, used)
        if (files.length > 0) {
          const metaForVideo = {
            code: item.code,
            description: item.description,
            tags: item.tags,
            tagCategories: item.tagCategories,
            score: item.score,
            introCategory: item.category,
            year: item.year,
            region: item.region,
            series: item.series
          }
          // 同一片单标题可能匹配到多个文件（不同分辨率 / 多碟 / 同名片），
          // 每个文件各自建一条 entry，不再做"分集合集"分组，避免把不同影片误合并。
          for (const fp of files) {
            const video = await ensureVideo(fp, library, settings, metaForVideo, changes)
            entries.push({
              kind: 'matched',
              category: cat.name,
              order: cat.order,
              code: item.code,
              title: item.code,
              description: item.description,
              tags: item.tags,
              tagCategories: item.tagCategories,
              score: item.score,
              video
            })
            matched++
          }
        } else {
          // 文件缺失：若该externalId在 data.json 中已无任何记录（用户主动删除过视频 + 记录），
          // 跳过该条目不标 missing，避免"删了又挂回来"。
          const activeCodes = await getActiveCodeSet()
          const upperCode = String(item.code).toUpperCase()
          if (activeCodes.size > 0 && !activeCodes.has(upperCode)) {
            continue
          }
          entries.push({
            kind: 'missing',
            category: cat.name,
            order: cat.order,
            code: item.code,
            title: item.code,
            description: item.description,
            tags: item.tags,
            tagCategories: item.tagCategories,
            score: item.score
          })
          missing++
        }
      }
    }
  } else {
    // 未配置 Excel 片单：全部文件直接展示
    // 需求 B（自动归类）：有数据源元数据（meta.genres 非空）的视频按 genres 自动归类，
    // 归入「【数据源】高清·字幕」这类自动分类（order 9000，未分类 9999 之前）；
    // 无元数据的仍归「未分类」（order 0）。
    // 2026-08-30 修复：原 path.basename(f) 含扩展名（SONE-280.mp4），传给 ensureVideo 后写入 video.title，
    // EntryCard 显示就是 `SONE-280.mp4`。先剥扩展名。
    // v2.2.4 兜底：用户明确担忧"万一哪天用户真没有excel怎么办"——
    //   对所有没 meta 的视频，后台异步按 settings.customSourceOrder 抓一次，
    //   7 天内抓过且失败的跳过（避免反复消耗 数据源 配额），抓到的写回 video 让 UI 立刻变好看。
    const needFetchAfter: Video[] = []
    for (const f of allFiles) {
      // v2.2.3 P0 修复：原 else 分支没用 used 记账，导致下方 L297「未收录」循环重复 push 同 filePath →
      // 同 code 两条 entry → HomeView `key={e.code}` duplicate key 警告（用户截图「未收录 84 + 未分类 79」）。
      // 这里补全 else 分支的 used 记账，让未配 Excel 时按文件维度只产出 1 条 entry。
      used.add(f)
      const base = path.basename(f)
      const titleNoExt = path.basename(base, path.extname(base))
      const video = await ensureVideo(
        f,
        library,
        settings,
        { code: titleNoExt, description: '', tags: [] },
        changes
      )
      if (!video.meta) {
        needFetchAfter.push(video)
      } else {
        // 有 meta 但封面仍是远程 URL / 旧解析器数据 → 重新抓一次，升级为本地缓存
        const d = video.meta
        const coverRemote = !!d.cover && /^https?:\/\//.test(d.cover)
        if (coverRemote || d.parseVer !== 2) {
          needFetchAfter.push(video)
        }
      }
      const d = video.meta
      const hasGenres = !!d && !!d.genres && d.genres.length > 0
      // v2.3.2：分类恢复原 v2.2.0 逻辑（一个视频一条 entry，category 用 genres 拼接长串），
      // 避免方案 A 把一个视频拆多条 entry 导致计数/推荐重复；genres 单标签改由独立的「类别」筛选提供。
      const srcNameMap: Record<string, string> = {
        moviedb: 'MovieDB',
        omdb: 'OMDb',
        openlibrary: 'OpenLibrary',
        justwatch: 'JustWatch',
        wikipedia: '维基百科'
      }
      const srcName = (d?.source && srcNameMap[d.source]) || 'MovieDB'
      const catName = hasGenres ? `【${srcName}】${d!.genres.join('·')}` : '未分类'
      if (!enteredIds.has(video.id)) {
        enteredIds.add(video.id)
        entries.push({
          kind: 'matched',
          category: catName,
          order: hasGenres ? 9000 : 0,
          code: titleNoExt,
          title: titleNoExt,
          description: '',
          tags: [],
          video
        })
        matched++
      }
    }

    // 后台异步抓元数据（fire-and-forget，不阻塞 reconcile 返回）
    // v2.2.10-fix 防风暴：大库（数千部）+ 无片单时，v2.2.4 的"全量自动兜底"会让启动即对
    // 数千部视频发起网络抓取 + 逐条全量写盘，CPU/IO 拉满。现在：
    //   1) 自动兜底只抓前 AUTO_FETCH_LIMIT 部，其余留给手动「批量补齐」；
    //   2) 抓取结果统一批量落盘（一次 saveDB），不再逐条 updateVideo 全量写 JSON。
    if (needFetchAfter.length > 0) {
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
      const now = Date.now()
      const toFetch = needFetchAfter.filter((v) => {
        // v2.7.x：锁定影片不参与后台兜底抓取，避免覆盖手动修正过的信息
        if (v.locked) return false
        const last = v.lastMetaFetchAt
        return !last || now - last > SEVEN_DAYS
      })
      const skipped = needFetchAfter.length - toFetch.length
      const lockedCount = needFetchAfter.filter((v) => v.locked).length
      if (skipped > 0) {
        console.log(
          `[reconcile] 无片单兜底抓取：跳过 ${skipped} 部（7 天内已抓过且失败${lockedCount > 0 ? `，其中锁定 ${lockedCount} 部` : ''}）`
        )
      }
      const AUTO_FETCH_LIMIT = 80
      const autoFetch = toFetch.slice(0, AUTO_FETCH_LIMIT)
      const rest = toFetch.length - autoFetch.length
      if (!autoFetchFired && autoFetch.length > 0) {
        autoFetchFired = true
        const conc = Math.max(1, Math.min(4, Math.floor(settings.scanConcurrency) || 2))
        const state = createSmartFetchState()
        let idx = 0
        const changes: VideoChange[] = []
        console.log(
          `[reconcile] 无片单兜底抓取：自动抓 ${autoFetch.length} 部 / 并发 ${conc}` +
            (rest > 0 ? `（其余 ${rest} 部请手动「批量补齐」）` : '')
        )
        void (async () => {
          const worker = async () => {
            while (idx < autoFetch.length) {
              const v = autoFetch[idx++]
              if (state.stop) return
              // 防御：兜底抓取期间被临时锁定 → 跳过
              if (v.locked) continue
              try {
                // v2.8.5：兜底抓取搜索词和显示名统一用「本地真名」folderName 优先
                const displayTitle = localCanonicalName(v)
                const r = await fetchDetailSmart(displayTitle, settings, state, (fe) => {
                  // v2.2.10：兜底抓取也把事件推给 renderer（走 onProgress 同管道）
                  onProgress?.({ libraryId: library.id, total: autoFetch.length, done: idx, current: displayTitle, fetchEvent: { ...fe, code: displayTitle || fe.code } })
                })
                if (r.detail) {
                  changes.push({
                    type: 'update',
                    video: {
                      ...v,
                      meta: { ...r.detail, externalId: v.title, source: r.source ?? r.detail.source },
                      lastMetaFetchAt: now
                    }
                  })
                  console.log(`[reconcile] 兜底抓取成功 ${v.title}（${r.source}）`)
                } else {
                  // 抓不到（不是网络错误也可能是源里没这部）也要标 lastMetaFetchAt，避免下次立即重试
                  changes.push({ type: 'update', video: { ...v, lastMetaFetchAt: now } })
                }
              } catch (e) {
                console.warn(`[reconcile] 兜底抓取异常 ${v.title}:`, (e as Error)?.message || e)
                changes.push({ type: 'update', video: { ...v, lastMetaFetchAt: now } })
              }
            }
          }
          await Promise.all(Array.from({ length: Math.min(conc, autoFetch.length) }, () => worker()))
          await applyVideoChanges(changes).catch((e) =>
            console.warn('[reconcile] 兜底抓取批量落盘失败:', (e as Error)?.message || e)
          )
        })()
      } else if (autoFetch.length > 0) {
        console.log(`[reconcile] 无片单兜底抓取：本进程已自动抓过，跳过（剩 ${toFetch.length} 部待抓，请手动「批量补齐」）`)
      }
    }
  }

  const ignoredSet = new Set(settings.ignoredUnlistedPaths ?? [])

  // 所有未 used 的文件都生成「未收录」条目，保证忽略后仍可在主列表/「未收录」分类找到
  const unlistedAll: UnlistedFile[] = allFiles
    .filter((f) => !used.has(f))
    .map((f) => ({ fileName: path.basename(f), path: f }))

  // 对账弹窗/统计里过滤已忽略项，避免重复打扰
  const unlisted: UnlistedFile[] = unlistedAll.filter((u) => !ignoredSet.has(u.path))

  // 把未收录文件也展示出来（否则导入后列表/首页找不到），统一放到「未收录」分类
  const UNLISTED_ORDER = 9999
  for (const u of unlistedAll) {
    const titleNoExt = path.basename(u.fileName, path.extname(u.fileName))
    const existing = await findVideoByPath(u.path)
    const video =
      existing ??
      (await ensureVideo(
        u.path,
        library,
        settings,
        { code: titleNoExt, description: '', tags: [] },
        changes
      ))
    if (!enteredIds.has(video.id)) {
      enteredIds.add(video.id)
      entries.push({
        kind: 'matched',
        category: '未收录',
        order: UNLISTED_ORDER,
        code: titleNoExt,
        title: titleNoExt,
        description: '',
        tags: [],
        video
      })
    }
  }

  entries.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code, 'zh'))

  // 一次性批量落盘（避免逐条全量写 JSON）
  await applyVideoChanges(changes)

  // v2.2.10-fix2：不再自动截帧。
  // generatePreviewSet 每部 = 1 个 thumbnail 全片解码 + 4 个预览帧进程（5 个 ffmpeg），
  // 大库自动截帧（哪怕 20 部）会让 CPU 长时间拉满、出现"一大堆 ffmpeg.exe"。
  // 截帧改由用户手动触发：详情页「重新截帧」/ 补齐信息（ffmpeg 截帧兜底）。
  {
    const missing = entries.filter(
      (e) => e.video && (!e.video.posterPath || e.video.posterSource === 'placeholder')
    ).length
    if (missing > 0) {
      console.log(`[reconcile] 有 ${missing} 部无封面视频（已禁用自动截帧，需要时请手动「重新截帧」）`)
    }
  }

  onProgress?.({ libraryId: library.id, total: mdCount + allFiles.length, done: mdCount + allFiles.length })

  // v2.2.5 修复：清理 dead previewPaths —— 上一次升级/installer 可能清掉了 posters 目录里的旧 .jpg，
  // 但 data.json 里的 video.previewPaths 仍指向这些不存在的文件 → hover/详情页 lm:// ENOENT 刷屏。
  // v2.2.10-fix3：大库（数千部）下全量清理 = 遍历全部视频 + 数千次 existsSync 磁盘 IO，
  // 且与当前库无关（切一个库也清全库）→ 打开/切库明显变慢。previewPaths 只在升级/清缓存后
  // 才失效，平时不会变，改为每 6 小时最多清理一次。
  const previewCleanupDue = Date.now() - lastPreviewCleanupAt > PREVIEW_CLEANUP_INTERVAL
  if (previewCleanupDue) {
    lastPreviewCleanupAt = Date.now()
    await cleanupDeadPreviewPaths(changes)
  }

  return {
    libraryId: library.id,
    entries,
    unlisted,
    stats: { mdCount, matched, missing, unlisted: unlisted.length },
    generatedAt: Date.now()
  }
}

/**
 * v2.2.5：清理所有 video.previewPaths 里的死引用。
 * - 任何 previewPath 文件不存在的，从 video.previewPaths 里删掉
 * - 删空后 video.previewPaths = undefined（让 UI 走「无预览」分支）
 * - 改动合并进 changes 数组，由 reconcileLibrary 末尾的 applyVideoChanges 一次性落盘
 * - 不刷屏、不弹窗：这是修复性的清理操作，不是用户该被打扰的事件
 */
async function cleanupDeadPreviewPaths(changes: VideoChange[]): Promise<void> {
  const videos = await listVideos({})
  let cleaned = 0
  for (const v of videos) {
    if (!v.previewPaths || v.previewPaths.length === 0) continue
    const alive = v.previewPaths.filter((p) => {
      try {
        return existsSync(p)
      } catch {
        return false
      }
    })
    if (alive.length === v.previewPaths.length) continue
    cleaned++
    // 合并：先查 changes 里是否已有该 video 的 update，有就改它
    const existing = changes.find((c) => c.type === 'update' && c.video.id === v.id)
    if (existing && existing.type === 'update') {
      existing.video.previewPaths = alive.length > 0 ? alive : undefined
    } else {
      changes.push({
        type: 'update',
        video: { ...v, previewPaths: alive.length > 0 ? alive : undefined }
      })
    }
  }
  if (cleaned > 0) {
    console.log(`[reconcile] 清理 dead previewPaths：${cleaned} 部`)
  }
}

export { VIDEO_EXTS }
