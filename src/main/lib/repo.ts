import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { getDB, mutate, saveDB } from './store'
import type { Library, PreviewManifest, PreviewStatus, PreviewTask, PreviewQualityMode, Settings, Video, VideoFilter } from '../../shared/types'
import { DEFAULT_IMAGE_PRIORITY } from '../../shared/types'

// ---------- 设置 ----------
export async function getSettings(): Promise<Settings> {
  const db = await getDB()
  return db.settings
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return mutate((db) => {
    db.settings = { ...db.settings, ...patch }
    return db.settings
  })
}

// ---------- 媒体库 ----------
export async function listLibraries(): Promise<Library[]> {
  const db = await getDB()
  return [...db.libraries].sort((a, b) => a.createdAt - b.createdAt)
}

export async function addLibrary(input: Omit<Library, 'id' | 'createdAt'>): Promise<Library> {
  return mutate((db) => {
    const lib: Library = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now()
    }
    db.libraries.push(lib)
    return lib
  })
}

export async function updateLibrary(id: string, patch: Partial<Library>): Promise<Library | null> {
  return mutate((db) => {
    const lib = db.libraries.find((l) => l.id === id)
    if (!lib) return null
    Object.assign(lib, patch)
    return lib
  })
}

export async function removeLibrary(id: string): Promise<void> {
  await mutate((db) => {
    db.libraries = db.libraries.filter((l) => l.id !== id)
    db.videos = db.videos.filter((v) => v.libraryId !== id)
  })
}

// ---------- 视频 ----------
export async function getVideo(id: string): Promise<Video | null> {
  const db = await getDB()
  const v = db.videos.find((x) => x.id === id)
  if (!v) return null
  // 防御：previewPaths 指向的文件已被清理（手动删/磁盘清理工具）→ 清掉坏路径，
  // 让详情页走「无预览图自动截帧」分支，避免显示一整排破损图。
  if (v.previewPaths?.length && !existsSync(v.previewPaths[0])) {
    return { ...v, previewPaths: undefined, previewStatus: undefined }
  }
  return v
}

export async function upsertVideo(video: Video): Promise<Video> {
  return mutate((db) => {
    const idx = db.videos.findIndex((v) => v.id === video.id)
    if (idx >= 0) {
      // v2.7.x：同 applyVideoChanges —— 写入方未显式携带 locked 时保留已有锁定状态
      const prev = db.videos[idx]
      db.videos[idx] =
        video.locked === undefined && prev.locked !== undefined
          ? { ...video, locked: prev.locked, lockedAt: prev.lockedAt }
          : video
    } else db.videos.push(video)
    return video
  })
}

export async function updateVideo(id: string, patch: Partial<Video>): Promise<Video | null> {
  return mutate((db) => {
    const v = db.videos.find((x) => x.id === id)
    if (!v) return null
    Object.assign(v, patch)
    return v
  })
}

export async function removeVideo(id: string): Promise<void> {
  await mutate((db) => {
    db.videos = db.videos.filter((v) => v.id !== id)
    db.previewTasks = db.previewTasks.filter((t) => t.mediaId !== id)
    delete db.previewManifests[id]
  })
}

/** 按路径查重，避免重复扫描 */
export async function findVideoByPath(p: string): Promise<Video | null> {
  const db = await getDB()
  return db.videos.find((v) => v.path === p) ?? null
}

/** 按内容指纹查重：用于识别「被重命名的文件」——路径变了但内容没变 */
export async function findVideoByContentHash(
  hash: string,
  libraryId: string
): Promise<Video | null> {
  if (!hash) return null
  const db = await getDB()
  return (
    db.videos.find((v) => v.libraryId === libraryId && v.contentHash === hash) ?? null
  )
}

/** 兜底查重：老记录未存 contentHash 时，用「标题 + 文件大小」近似识别重命名 */
export async function findVideoByTitleSize(
  title: string,
  size: number | undefined,
  libraryId: string
): Promise<Video | null> {
  if (!title || size == null) return null
  const db = await getDB()
  return (
    db.videos.find(
      (v) => v.libraryId === libraryId && v.title === title && v.fileSize === size
    ) ?? null
  )
}

// ---------- 批量写盘（对账/扫描时避免逐条 saveDB 全量写 JSON） ----------

export type VideoChange =
  | { type: 'upsert'; video: Video }
  | { type: 'update'; video: Video }
  | { type: 'remove'; id: string }

/** 把一批视频变更一次性应用到内存 DB 并落盘（只写一次） */
export async function applyVideoChanges(changes: VideoChange[]): Promise<void> {
  if (changes.length === 0) return
  const db = await getDB()
  // v2.3.10：用 Map 建 id→下标索引（原逐条 findIndex 是 O(n²)——4494 条变更 × 6253 条记录
  // ≈ 2800 万次字符串比较，大库对账落盘明显卡顿）。remove 数量通常极少，先 filter 再建索引。
  const removeIds: string[] = []
  for (const c of changes) if (c.type === 'remove') removeIds.push(c.id)
  if (removeIds.length > 0) {
    const rm = new Set(removeIds)
    db.videos = db.videos.filter((v) => !rm.has(v.id))
  }
  const index = new Map<string, number>()
  for (let i = 0; i < db.videos.length; i++) {
    const id = db.videos[i].id
    if (!index.has(id)) index.set(id, i)
  }
  for (const c of changes) {
    if (c.type === 'remove') continue
    const idx = index.get(c.video.id)
    if (idx !== undefined) {
      const prev = db.videos[idx]
      // v2.7.x：保护用户「锁定」标记 —— 扫描/对账等批量写入可能带着锁定前的旧副本，
      // 若写入方没有显式携带 locked（undefined），沿用已有值，避免把锁定状态覆盖掉。
      // 注意：显式 unlocked 会带 locked:false，不会被这里拦截。
      const next =
        c.video.locked === undefined && prev.locked !== undefined
          ? { ...c.video, locked: prev.locked, lockedAt: prev.lockedAt }
          : c.video
      db.videos[idx] = next
    } else {
      index.set(c.video.id, db.videos.length)
      db.videos.push(c.video)
    }
  }
  await saveDB()
}

// ---------- Preview V2 任务 / 清单 ----------

export const PREVIEW_ALGORITHM_VERSION = 'V2.0'

export async function listPreviewTasks(): Promise<PreviewTask[]> {
  const db = await getDB()
  return [...db.previewTasks]
}

export async function getPreviewTask(id: string): Promise<PreviewTask | null> {
  const db = await getDB()
  return db.previewTasks.find((t) => t.id === id) ?? null
}

export async function getPreviewTaskForMedia(mediaId: string): Promise<PreviewTask | null> {
  const db = await getDB()
  return (
    db.previewTasks.find(
      (t) =>
        t.mediaId === mediaId &&
        t.taskType === 'GENERATE_PREVIEW' &&
        (t.status === 'PENDING' || t.status === 'PROCESSING')
    ) ?? null
  )
}

export async function enqueuePreviewTask(
  mediaId: string,
  opts: {
    priority?: number
    requestedCount?: number
    qualityMode?: PreviewQualityMode
    force?: boolean
  } = {}
): Promise<PreviewTask> {
  return mutate((db) => {
    const v = db.videos.find((x) => x.id === mediaId)
    if (!v) throw new Error('视频不存在')
    const requestedCount = Math.max(1, Math.floor(opts.requestedCount ?? db.settings.previewFrameCount ?? 20))
    const qualityMode = opts.qualityMode ?? db.settings.previewQualityMode ?? 'STANDARD'
    const fingerprint = `${v.path}|${v.fileSize ?? 0}|${v.contentHash ?? ''}`
    const manifest = db.previewManifests[mediaId]
    // 缓存有效条件：元数据匹配 + 第一个预览图文件存在（同目录生成的，第一个在则都在）
    const firstFrame = manifest?.frames?.[0]?.filePath
    const filesExist = firstFrame ? existsSync(firstFrame) : false
    const cacheFresh =
      !opts.force &&
      filesExist &&
      manifest?.algorithmVersion === PREVIEW_ALGORITHM_VERSION &&
      manifest.requestedCount === requestedCount &&
      manifest.sourceFingerprint === fingerprint &&
      manifest.generatedCount > 0
    if (cacheFresh) {
      v.previewStatus = 'COMPLETED'
      v.previewAlgorithmVersion = manifest.algorithmVersion
      v.previewRequestedCount = manifest.requestedCount
      v.previewGeneratedCount = manifest.generatedCount
      v.previewPaths = manifest.frames.map((f) => f.filePath)
      return db.previewTasks.find((t) => t.mediaId === mediaId && t.status === 'COMPLETED') ?? {
        id: randomUUID(),
        mediaId,
        taskType: 'GENERATE_PREVIEW',
        priority: opts.priority ?? 3,
        status: 'COMPLETED',
        progress: 1,
        requestedCount,
        generatedCount: manifest.generatedCount,
        retryCount: 0,
        algorithmVersion: PREVIEW_ALGORITHM_VERSION,
        qualityMode,
        createdAt: Date.now(),
        finishedAt: manifest.generatedAt
      }
    }
    const existing = db.previewTasks.find(
      (t) =>
        t.mediaId === mediaId &&
        t.taskType === 'GENERATE_PREVIEW' &&
        (t.status === 'PENDING' || t.status === 'PROCESSING')
    )
    if (existing) {
      existing.priority = Math.min(existing.priority, opts.priority ?? existing.priority)
      existing.requestedCount = requestedCount
      existing.qualityMode = qualityMode
      existing.algorithmVersion = PREVIEW_ALGORITHM_VERSION
      existing.status = existing.status === 'PROCESSING' ? existing.status : 'PENDING'
      v.previewStatus = existing.status
      v.previewRequestedCount = requestedCount
      return existing
    }
    const task: PreviewTask = {
      id: randomUUID(),
      mediaId,
      taskType: 'GENERATE_PREVIEW',
      priority: opts.priority ?? 3,
      status: 'PENDING',
      progress: 0,
      requestedCount,
      generatedCount: 0,
      retryCount: 0,
      algorithmVersion: PREVIEW_ALGORITHM_VERSION,
      qualityMode,
      createdAt: Date.now()
    }
    db.previewTasks.push(task)
    v.previewStatus = 'PENDING'
    v.previewRequestedCount = requestedCount
    v.previewGeneratedCount = 0
    v.previewAlgorithmVersion = PREVIEW_ALGORITHM_VERSION
    v.previewLastError = undefined
    return task
  })
}

export async function claimNextPreviewTask(): Promise<PreviewTask | null> {
  return mutate((db) => {
    const task = db.previewTasks
      .filter((t) => t.taskType === 'GENERATE_PREVIEW' && t.status === 'PENDING')
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)[0]
    if (!task) return null
    task.status = 'PROCESSING'
    task.progress = 0
    task.startedAt = Date.now()
    task.lastError = undefined
    const v = db.videos.find((x) => x.id === task.mediaId)
    if (v) {
      v.previewStatus = 'PROCESSING'
      v.previewRequestedCount = task.requestedCount
      v.previewGeneratedCount = 0
      v.previewLastError = undefined
    }
    return { ...task }
  })
}

export async function updatePreviewTask(
  id: string,
  patch: Partial<PreviewTask>,
  videoPatch?: Partial<Video>
): Promise<PreviewTask | null> {
  return mutate((db) => {
    const task = db.previewTasks.find((t) => t.id === id)
    if (!task) return null
    Object.assign(task, patch)
    const v = db.videos.find((x) => x.id === task.mediaId)
    if (v) Object.assign(v, videoPatch ?? {})
    return { ...task }
  })
}

export async function completePreviewTask(
  taskId: string,
  manifest: PreviewManifest,
  coverPath?: string
): Promise<PreviewTask | null> {
  return mutate((db) => {
    db.previewManifests[manifest.mediaId] = manifest
    const task = db.previewTasks.find((t) => t.id === taskId)
    if (!task) return null
    Object.assign(task, {
      status: 'COMPLETED' as PreviewStatus,
      progress: 1,
      generatedCount: manifest.generatedCount,
      finishedAt: Date.now(),
      lastError: undefined,
      errorCode: undefined
    })
    const v = db.videos.find((x) => x.id === manifest.mediaId)
    if (v) {
      v.previewStatus = 'COMPLETED'
      v.previewAlgorithmVersion = manifest.algorithmVersion
      v.previewRequestedCount = manifest.requestedCount
      v.previewGeneratedCount = manifest.generatedCount
      v.previewUpdatedAt = manifest.generatedAt
      v.previewPaths = manifest.frames.map((f) => f.filePath)
      v.previewLastError = undefined
      if (coverPath && (!v.posterPath || v.posterSource === 'placeholder' || v.posterSource === 'ffmpeg')) {
        v.posterSource = 'ffmpeg'
        v.posterPath = coverPath
        v.posterPathFfmpeg = coverPath
      }
    }
    return { ...task }
  })
}

export async function savePreviewManifest(manifest: PreviewManifest): Promise<void> {
  await mutate((db) => {
    db.previewManifests[manifest.mediaId] = manifest
  })
}

export async function getPreviewManifest(mediaId: string): Promise<PreviewManifest | null> {
  const db = await getDB()
  return db.previewManifests[mediaId] ?? null
}

export async function resetProcessingPreviewTasks(): Promise<number> {
  return mutate((db) => {
    let count = 0
    for (const task of db.previewTasks) {
      if (task.status === 'PROCESSING') {
        task.status = 'PENDING'
        task.progress = 0
        task.startedAt = undefined
        count++
      }
    }
    for (const v of db.videos) {
      if (v.previewStatus === 'PROCESSING') v.previewStatus = 'PENDING'
    }
    return count
  })
}

export function applyFilter(videos: Video[], filter: VideoFilter): Video[] {
  let list = [...videos]
  if (filter.libraryId) list = list.filter((v) => v.libraryId === filter.libraryId)
  if (filter.tag) list = list.filter((v) => v.tags.includes(filter.tag!))
  if (filter.search) {
    const q = filter.search.trim().toLowerCase()
    if (q) list = list.filter((v) => v.title.toLowerCase().includes(q) || v.fileName.toLowerCase().includes(q) || (v.description ?? '').toLowerCase().includes(q))
  }
  const sort = filter.sort ?? 'added'
  const dir = filter.desc ? -1 : 1
  list.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh') * dir
    if (sort === 'year') return ((a.year ?? 0) - (b.year ?? 0)) * dir
    if (sort === 'lastPlayed') return ((a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0)) * dir
    if (sort === 'random') return Math.random() - 0.5
    return ((a.addedAt ?? 0) - (b.addedAt ?? 0)) * dir
  })
  return list
}

export async function listVideos(filter: VideoFilter): Promise<Video[]> {
  const db = await getDB()
  return applyFilter(db.videos, filter)
}

export async function allTags(): Promise<string[]> {
  const db = await getDB()
  const set = new Set<string>()
  for (const v of db.videos) for (const t of v.tags) set.add(t)
  return [...set].sort()
}

export { DEFAULT_IMAGE_PRIORITY }
