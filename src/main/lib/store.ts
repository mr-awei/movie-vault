import { app } from 'electron'
import { promises as fs, mkdirSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, type Library, type Playlist, type PreviewManifest, type PreviewTask, type Settings, type Video, type WatchHistoryEntry } from '../../shared/types'
import type { MovieMeta } from '../../shared/types'
import { cleanGenreName } from './image-util'
import { getDb } from './db'

export interface DBShape {
  libraries: Library[]
  videos: Video[]
  /** P2-5: 迁移到 SQLite 后不再写回 data.json（旧字段仅一次性迁移用，可为空） */
  previewTasks?: PreviewTask[]
  previewManifests?: Record<string, PreviewManifest>
  settings: Settings
  playlists: Playlist[]
  /** 观看历史记录 */
  watchHistory: WatchHistoryEntry[]
  /** 数据结构迁移的最后版本号，用于启动时只跑新增迁移；缺失视为 v0（v2.2.12 及以前）*/
  schemaVersion?: number
}

const DEFAULT_DB: DBShape = {
  libraries: [],
  videos: [],
  previewTasks: [],
  previewManifests: {},
  settings: { ...DEFAULT_SETTINGS },
  playlists: [],
  watchHistory: []
}

/** v2.2.13 schemaVersion：标签分层（tagCategories / backupTags）已完成迁移
 *  v2.2.14 schemaVersion：清洗误写入 title 的完整文件路径 */
export const SCHEMA_VERSION = 2026091402

let cache: DBShape | null = null
let dbPath = ''
// v2.3.9 外部修改检测：data.json 可能被外部工具/另一实例改写（如数据修复脚本、手动编辑），
// 内存缓存若永不重载，会用陈旧数据覆盖磁盘（丢数据）或把陈旧 entries 写进 reconcile-cache
// （列表看不到新写入的时长/元数据，"点详情再返回才刷新"）。每次取 DB 前比对新 mtime，
// 发现外部修改即丢弃内存重载。lastSelfWrite 记录自己写盘的 mtime，避免把自己的写当外部修改。
let lastSelfWriteMs = 0
let lastLoadMs = 0
const STAT_THROTTLE_MS = 1000
let lastStatMs = 0

// v2.2.10-fix5：写盘 debounce——连续写入合并为一次落盘（300ms 窗口），
// 避免连点收藏/改名等单条操作每次都全量序列化 4.7MB data.json（几百 ms 卡顿）。
// 批量场景（批量补齐 fix4 已合并）同样受益。进程退出前 flushSave 保证不丢数据。
// v2.3.10 重写（修死锁）：原实现把 resolve() 只挂在 debounce 计时器回调里，
// 且「pendingWrite 非空时不重建计时器」——任一次 mutate/saveDB 在窗口内再次调用
// scheduleSave 就会 clearTimeout 掉那个唯一计时器，Promise 永不 resolve，
// await saveDB()（applyVideoChanges → 对账收尾）永久挂起 → UI 一直"正在对账"。
// 现在：dirty 标志 + 写盘串行 + waiters 唤醒，计时器只负责触发，不承载 Promise。
const SAVE_DEBOUNCE_MS = 300
// 防饥饿：距上次落盘超过该值就不再等 debounce，立即写（连续改动下也能推进）
const MAX_SAVE_DELAY_MS = 2000
let saveTimer: NodeJS.Timeout | null = null
let waiters: Array<() => void> = []
/** 是否有未落盘的数据 */
let dirty = false
/** 是否正在写盘（runWrite 执行中） */
let writeInFlight = false
/** 最近一次落盘完成时间：用于防饥饿（距上次写入过久就不再等 debounce） */
let lastWriteAt = 0

function resolveDbPath(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'data.json')
}

async function ensureLoaded(): Promise<DBShape> {
  if (!dbPath) dbPath = resolveDbPath()
  // 外部修改检测（1s 节流）：磁盘 mtime 既不是自己写的也不是上次加载的 → 内存已陈旧，丢弃重载
  if (cache) {
    const now = Date.now()
    if (now - lastStatMs > STAT_THROTTLE_MS) {
      lastStatMs = now
      try {
        // v2.6.5：写盘进行中跳过检测——批量补齐频繁写盘时，`fs.stat` 返回的 mtime
        // 在 Windows 高并发 rename 下可能短暂不一致，会造成「自己写盘被误判成外部修改」的刷屏。
        // 写盘是串行的（writeInFlight 防重入），写盘期间暂不检测即可彻底消除该竞态。
        if (writeInFlight) return cache
        const st = await fs.stat(dbPath)
        if (st.mtimeMs !== lastSelfWriteMs && st.mtimeMs !== lastLoadMs) {
          console.log('[store] 检测到 data.json 被外部修改，重载内存缓存')
          cache = null
          // v2.6.5：把「重载前已知的磁盘 mtime」记为基准，避免重载后又因自己写盘把 mtime 推新、
          // 与旧基准不匹配而反复误判
          lastLoadMs = st.mtimeMs
          lastSelfWriteMs = st.mtimeMs
        }
      } catch {
        /* 文件暂时不可访问（被占用等）：保守沿用内存 */
      }
    }
    if (cache) return cache
  }
  try {
    const raw = await fs.readFile(dbPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DBShape> & { schemaVersion?: number }
    const current: DBShape = {
      schemaVersion: parsed.schemaVersion,
      libraries: parsed.libraries ?? [],
      videos: parsed.videos ?? [],
      previewTasks: parsed.previewTasks ?? [],
      previewManifests: parsed.previewManifests ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      playlists: parsed.playlists ?? [],
      watchHistory: parsed.watchHistory ?? []
    }
    migrateInPlace(current)
    // P2-5: previewTasks/previewManifests 主存储已迁移到 SQLite 表（preview_tasks/preview_manifests），
    // data.json 中的旧字段仅一次性迁移用；SQLite 已有数据时不再写回 data.json（避免双写/膨胀）。
    try {
      const row = getDb().prepare('SELECT COUNT(*) AS c FROM videos').get() as { c: number } | undefined
      if (row && row.c > 0) {
        delete current.previewTasks
        delete current.previewManifests
      }
    } catch { /* SQLite 未就绪时保留旧字段，不影响 JSON 侧读取 */ }
    cache = current
    const st = await fs.stat(dbPath).catch(() => null)
    lastLoadMs = st?.mtimeMs ?? 0
    lastSelfWriteMs = 0
  } catch {
    // 文件不存在或解析失败 -> 用默认值（新 schema）
    cache = structuredClone(DEFAULT_DB)
    cache.schemaVersion = SCHEMA_VERSION
    lastLoadMs = 0
    lastSelfWriteMs = 0
  }
  return cache
}

/** v2.2.13 标签分层迁移（一次性）：
 *  - 保证每个 Video 至少 tags=[], tagCategories 字段存在或为 undefined（正确类型）
 *  - 若视频有 meta.genres：**无条件**把全部 genres 写入 backupTags（去重合并已有值），
 *    不管 genres 是否与 Excel 文档标签重叠——backupTags 的语义是"数据源报告了这些类别"，
 *    用户需要看到它（蓝色）作为参考，即使它恰好与 Excel 片单（品牌色）相同。
 *  - 同时从 tags 中移除那些"原来被旧版合并进来、现在又已经有 backupTags 承载"的 genres 项，
 *    让文档 tags 保持纯净（undo 旧合并行为）。
 *  - schemaVersion < SCHEMA_VERSION 才执行，之后不重复跑。
 */
function migrateInPlace(db: DBShape): void {
  const from = db.schemaVersion ?? 0
  if (from >= SCHEMA_VERSION) return

  if (!Array.isArray(db.previewTasks)) db.previewTasks = []
  if (!db.previewManifests || typeof db.previewManifests !== 'object') db.previewManifests = {}
  for (const task of db.previewTasks) {
    if (task.status === 'PROCESSING') {
      task.status = 'PENDING'
      task.progress = 0
      task.startedAt = undefined
    }
  }
  for (const v of db.videos) {
    if (!v.mediaStatus) v.mediaStatus = existsSync(v.path) ? 'AVAILABLE' : 'MISSING'
    if (!v.previewStatus) {
      v.previewStatus = v.previewPaths?.length ? 'COMPLETED' : 'NONE'
      v.previewRequestedCount = v.previewRequestedCount ?? (v.previewPaths?.length || DEFAULT_SETTINGS.previewFrameCount)
      v.previewGeneratedCount = v.previewGeneratedCount ?? (v.previewPaths?.length || 0)
    }
  }

  // v20260913-2：字段重命名迁移（保证旧库 data.json 不丢已抓取元数据）
  //   Video.sourceDetail → Video.meta（JSON 键改名，必须迁移旧键）
  //   SourceDetail.sourceCode → externalId（嵌套 JSON 键改名，必须迁移旧键）
  //   SourceDetail 类型本身改名不影响 JSON，无需迁移。
  let fieldMigrated = 0
  let idMigrated = 0
  for (const v of db.videos) {
    const anyV = v as unknown as Record<string, unknown>
    if (anyV.sourceDetail !== undefined && anyV.meta === undefined) {
      anyV.meta = anyV.sourceDetail
      delete anyV.sourceDetail
      fieldMigrated++
    }
    const d = anyV.meta as (Record<string, unknown> & {
      code?: string
      sourceCode?: string
      externalId?: string
    }) | undefined
    if (d && typeof d.externalId !== 'string') {
      if (typeof d.sourceCode === 'string') {
        d.externalId = d.sourceCode
        delete d.sourceCode
        idMigrated++
      } else if (typeof d.code === 'string') {
        d.externalId = d.code
        delete d.code
        idMigrated++
      }
    }
  }

  let touched = 0
  let stripped = 0
  let cleaned = 0
  let cleanedDoc = 0
  let peeledCategory = 0
  for (const v of db.videos) {
    // tags 必须存在（旧数据 JSON 可能缺）
    if (!Array.isArray(v.tags)) (v as Video & { tags?: unknown }).tags = []
    const doc = v as Video & {
      tagCategories?: Record<string, string[]>
      backupTags?: string[]
      meta?: MovieMeta
      introCategory?: string
    }
    const genres = doc.meta?.genres ?? []

    // 0) 清洗文档级脏标签（tagCategories 和 v.tags 里 AI/Excel 生成的垃圾值）
    let docDirty = false
    if (doc.tagCategories) {
      const newTc: Record<string, string[]> = {}
      for (const [k, list] of Object.entries(doc.tagCategories)) {
        // "分类" 是 Excel 独立列，不应作为标签分组；剥出来写到 introCategory
        if (k === '分类' || k === 'category') {
          const firstClean = list
            .map((t) => cleanGenreName(t))
            .filter((t): t is string => !!t)[0]
          if (firstClean) {
            v.introCategory = firstClean
            peeledCategory++
          }
          docDirty = true // 剥掉这个 key
          continue
        }
        const cleanedList = list.map((t) => cleanGenreName(t)).filter((t): t is string => !!t)
        if (cleanedList.length !== list.length) docDirty = true
        // 跳过空列表（整个分类都被清干净了）
        if (cleanedList.length > 0) newTc[k] = cleanedList
      }
      // 如果之前有 tagCategories 但剥+洗后全空，直接置 undefined 让 UI 退化处理
      const gotKeys = Object.keys(newTc)
      if (gotKeys.length === 0 && Object.keys(doc.tagCategories).length > 0) {
        doc.tagCategories = undefined
        docDirty = true
      } else if (docDirty) {
        doc.tagCategories = newTc
        cleanedDoc++
      }
    }
    const cleanedVTags = v.tags.map((t) => cleanGenreName(t)).filter((t): t is string => !!t)
    if (cleanedVTags.length !== v.tags.length) {
      v.tags = cleanedVTags
      cleanedDoc++
    }

    if (genres.length === 0 && !Array.isArray(doc.backupTags) && !doc.introCategory) continue

    // 1) 清洗已入库的脏数据源标签（【多人】5、纯分隔符 / 等）
    const cleanGenres = genres.map((g) => cleanGenreName(g)).filter((g): g is string => !!g)
    if (cleanGenres.length !== genres.length) {
      doc.meta!.genres = cleanGenres
      cleaned++
    }
    if (Array.isArray(doc.backupTags)) {
      const cleanBackup = doc.backupTags.map((g) => cleanGenreName(g)).filter((g): g is string => !!g)
      if (cleanBackup.length !== doc.backupTags.length) {
        doc.backupTags = cleanBackup
        cleaned++
      }
    }

    // 2) 合并全部 genres 进 backupTags（无论是否与文档标签重叠——用户要看数据源侧的完整信息）
    const existing = Array.isArray(doc.backupTags) ? doc.backupTags : []
    const merged = Array.from(new Set([...existing, ...cleanGenres]))
    if (merged.length !== existing.length) {
      doc.backupTags = merged
      touched++
    }

    // 3) 如果有文档权威标签（Excel 片单），旧版 backfill 可能把 genres 合并进了 v.tags，
    //    现在 backupTags 已经承载了完整 genres 信息，把 v.tags 中那些"是 genres 但不在文档标签集合里"的
    //    旧合并残留项剥掉——让文档 tags 保持权威纯净；
    //    但如果某个 genre 同时也是文档标签（比如 Excel 和 数据源 都有"剧情"），保留在 v.tags 不动。
    const docTagSet = new Set<string>()
    if (doc.tagCategories) for (const list of Object.values(doc.tagCategories)) for (const t of list) docTagSet.add(t)
    for (const t of v.tags) docTagSet.add(t)

    if (v.descriptionSource === 'manual' || v.tags.length > 0 || doc.tagCategories) {
      // genres 中「不在文档标签集合里」的项 → 是旧合并残留，应从 v.tags 剥掉
      const oldMerged = cleanGenres.filter((g) => !docTagSet.has(g))
      if (oldMerged.length) {
        const strippedTags = v.tags.filter((t) => !oldMerged.includes(t))
        if (strippedTags.length !== v.tags.length) {
          v.tags = strippedTags
          stripped++
        }
      }
    }
  }

  // v20260913：actresses → cast（统一字段命名，统一为"主演/cast"）
  let castMigrated = 0
  for (const v of db.videos) {
    const jd = v.meta as (MovieMeta & { actresses?: string[] }) | undefined
    if (jd && Array.isArray(jd.actresses) && !Array.isArray(jd.cast)) {
      jd.cast = jd.actresses
      delete (jd as unknown as Record<string, unknown>).actresses
      castMigrated++
    }
  }

  // 注：历史 code / sourceCode → externalId 的迁移已在上方「字段重命名迁移」统一处理。

  // v20260914：清洗把完整路径（如 E:\\影视\\xxx\\xxx）误写入 title 的旧数据，统一为纯文件名（无扩展名）
  let titlePathCleaned = 0
  for (const v of db.videos) {
    if (!v.title) continue
    const isPathLike = /[\\/]/.test(v.title)
    const isFileName = v.fileName && v.title === v.fileName
    if (isPathLike || isFileName) {
      const base = path.basename(v.title)
      v.title = base.replace(/\.[^.]+$/, '') || base
      titlePathCleaned++
    }
  }

  db.schemaVersion = SCHEMA_VERSION
  console.log(
    `[store] schema migrate v${from} -> v${SCHEMA_VERSION}：` +
      `touched backupTags=${touched}，stripped merged genres=${stripped}，` +
      `cleaned bad genres=${cleaned}，cleaned doc tags=${cleanedDoc}，` +
      `peeled '分类' → introCategory=${peeledCategory}，castMigrated=${castMigrated}，` +
      `fieldMigrated=${fieldMigrated}，idMigrated=${idMigrated}，titlePathCleaned=${titlePathCleaned}`
  )
}

let jsonWriteChecked = false
let jsonWriteEnabled = true
/** A-1: SQLite 已承载数据后 data.json 降级为只读兼容层（不再全量写盘）。 */
function isJsonWriteEnabled(): boolean {
  if (!jsonWriteChecked) {
    jsonWriteChecked = true
    try {
      const row = getDb().prepare('SELECT COUNT(*) AS c FROM videos').get() as { c: number } | undefined
      jsonWriteEnabled = !row || row.c === 0
    } catch {
      jsonWriteEnabled = true
    }
  }
  return jsonWriteEnabled
}

async function writeNow(): Promise<void> {
  const data = cache ?? (await ensureLoaded())
  if (!dbPath) dbPath = resolveDbPath()
  if (!isJsonWriteEnabled()) {
    // A-1: SQLite 为主，JSON 只读。不写盘但刷新 mtime 基准，避免外部修改检测把旧 JSON 当外部改动误触发重载。
    const st = await fs.stat(dbPath).catch(() => null)
    lastSelfWriteMs = st?.mtimeMs ?? Date.now()
    lastLoadMs = lastSelfWriteMs
    return
  }
  const dir = path.dirname(dbPath)
  await fs.mkdir(dir, { recursive: true })
  // v2.2.13 原子写盘：先写临时文件再 rename 覆盖，避免写盘中途崩溃/断电导致
  // data.json 截断损坏（4.7MB 全量序列化窗口内风险）。rename 是同目录原子操作。
  const tmp = `${dbPath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, dbPath)
  // 记录自己写盘后的 mtime：外部修改检测以此为基准区分"自己写的"和"别人改的"
  const st = await fs.stat(dbPath).catch(() => null)
  lastSelfWriteMs = st?.mtimeMs ?? Date.now()
  lastLoadMs = lastSelfWriteMs
}

/** 唤醒所有等待落盘的调用者（数据已持久化） */
function settleWaiters(): void {
  const ws = waiters
  waiters = []
  for (const w of ws) w()
}

/** 串行落盘一轮：写盘期间的新改动置 dirty，写完后自动续一轮，保证不漏写 */
async function runWrite(): Promise<void> {
  if (writeInFlight) return
  writeInFlight = true
  dirty = false
  const t0 = Date.now()
  try {
    await writeNow()
    const cost = Date.now() - t0
    if (cost > 1000) console.log(`[store] 落盘耗时 ${cost}ms（大库全量序列化，可观察指标）`)
  } catch (e) {
    console.error('[store] 落盘失败:', (e as Error)?.message || e)
  } finally {
    writeInFlight = false
    lastWriteAt = Date.now()
    if (dirty) void runWrite()
    else settleWaiters()
  }
}

/** 触发一次防抖写盘；返回的 Promise 在「本次改动已落盘」后 resolve（保证会 resolve，不挂起） */
export function scheduleSave(): Promise<void> {
  dirty = true
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // 防饥饿：距上次落盘过久就不再等 debounce，立即写（连续改动下也能推进）
  const delay = Date.now() - lastWriteAt > MAX_SAVE_DELAY_MS ? 0 : SAVE_DEBOUNCE_MS
  saveTimer = setTimeout(() => {
    saveTimer = null
    void runWrite()
  }, delay)
  return new Promise<void>((resolve) => {
    waiters.push(resolve)
  })
}

/** 立即落盘（进程退出前调用，保证 debounce 窗口内的写入不丢） */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // 等在途写盘结束（含写盘期间新改动触发的续写轮次），最多等 2s
  for (let i = 0; i < 100 && (writeInFlight || dirty); i++) {
    await new Promise((r) => setTimeout(r, 20))
  }
  if (dirty && !writeInFlight) {
    try {
      await writeNow()
    } catch (e) {
      console.error('[store] 退出前落盘失败:', (e as Error)?.message || e)
    }
  }
  settleWaiters()
}

export async function getDB(): Promise<DBShape> {
  return ensureLoaded()
}

export async function saveDB(): Promise<void> {
  await scheduleSave()
}

/** 工具：在修改后自动落盘（防抖合并，立即返回不阻塞调用方） */
export async function mutate<T>(fn: (db: DBShape) => T): Promise<T> {
  const db = await ensureLoaded()
  const result = fn(db)
  scheduleSave()
  return result
}

// 进程退出前同步兜底落盘（debounce 未触发/进行中也能保住最新数据）
app.on('before-quit', () => {
  if (cache && dbPath && isJsonWriteEnabled()) {
    try {
      mkdirSync(path.dirname(dbPath), { recursive: true })
      const tmp = `${dbPath}.tmp`
      writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8')
      try {
        // renameSync 在 Windows 上目标存在时会抛 EEXIST/EPERM，先删旧再 rename
        if (existsSync(dbPath)) unlinkSync(dbPath)
        renameSync(tmp, dbPath)
      } catch {
        // 跨设备或权限失败：退化为直接写（尽力而为，不因清理失败丢数据）
        writeFileSync(dbPath, JSON.stringify(cache, null, 2), 'utf-8')
      }
    } catch (e) {
      console.error('[store] 退出前落盘失败:', (e as Error)?.message || e)
    }
  }
})
