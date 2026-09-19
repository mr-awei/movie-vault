import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { getDb } from './db'
import type { Library, PreviewManifest, PreviewStatus, PreviewTask, PreviewQualityMode, Settings, Video, VideoFilter } from '../../shared/types'
import { DEFAULT_IMAGE_PRIORITY } from '../../shared/types'

/**
 * 数据仓储层（SQLite 版）。
 * 从 data.json 迁移到 SQLite 后，所有读写走 better-sqlite3。
 * 函数签名与旧版 JSON 实现保持一致，调用方无需改动。
 *
 * 存储表：settings / libraries / videos / preview_tasks / preview_manifests
 */

// ---------- 行 ↔ 实体 转换 ----------

function safeParse<T>(json: string | null | undefined, fallback: T): T
function safeParse<T>(json: string | null | undefined, fallback: T | undefined): T | undefined
function safeParse<T>(json: string | null | undefined, fallback: T | undefined): T | undefined {
  if (json == null) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function rowToVideo(row: Record<string, unknown>): Video {
  const extra = safeParse<Record<string, unknown>>(row.extra as string, {})
  const v: Video = {
    id: row.id as string,
    libraryId: row.library_id as string,
    path: row.path as string,
    fileName: row.file_name as string,
    folderName: (row.folder_name as string) ?? undefined,
    title: row.title as string,
    year: (row.year as number) ?? undefined,
    description: (row.description as string) ?? undefined,
    rating: (row.rating as number) ?? undefined,
    durationSec: (row.duration_sec as number) ?? undefined,
    fileSize: (row.file_size as number) ?? undefined,
    contentHash: (row.content_hash as string) ?? undefined,
    phash: (row.phash as string) ?? undefined,
    posterPath: (row.poster_path as string) ?? undefined,
    posterSource: (row.poster_source as Video['posterSource']) ?? undefined,
    posterPathFfmpeg: (row.poster_path_ffmpeg as string) ?? undefined,
    addedAt: row.added_at as number,
    lastPlayedAt: (row.last_played_at as number) ?? undefined,
    favorite: !!row.favorite,
    locked: !!row.locked,
    lockedAt: (row.locked_at as number) ?? undefined,
    playbackPositionSec: (row.playback_position_sec as number) ?? undefined,
    playbackUpdatedAt: (row.playback_updated_at as number) ?? undefined,
    nfoPath: (row.nfo_path as string) ?? undefined,
    introCategory: (row.intro_category as string) ?? undefined,
    region: (row.region as string) ?? undefined,
    series: (row.series as string) ?? undefined,
    tags: safeParse<string[]>(row.tags as string, []),
    tagCategories: safeParse<Record<string, string[]>>(row.tag_categories as string, undefined),
    backupTags: safeParse<string[]>(row.backup_tags as string, undefined),
    actors: safeParse<string[]>(row.actors as string, undefined),
    techInfo: safeParse<Video['techInfo']>(row.tech_info as string, undefined),
    meta: safeParse<Video['meta']>(row.meta as string, undefined),
    previewPaths: safeParse<string[]>(row.preview_paths as string, undefined),
    mediaStatus: (row.media_status as Video['mediaStatus']) ?? undefined,
    previewStatus: (row.preview_status as Video['previewStatus']) ?? undefined,
    previewRequestedCount: (row.preview_requested_count as number) ?? undefined,
    previewGeneratedCount: (row.preview_generated_count as number) ?? undefined,
    previewAlgorithmVersion: (row.preview_algorithm_version as string) ?? undefined,
    previewUpdatedAt: (row.preview_updated_at as number) ?? undefined,
    previewLastError: (row.preview_last_error as string) ?? undefined,
    lastMetaFetchAt: (row.last_meta_fetch_at as number) ?? undefined,
    frameFailedAt: (row.frame_failed_at as number) ?? undefined,
    coverVersion: (row.cover_version as number) ?? 0,
    previewVersion: (row.preview_version as number) ?? 0
  }
  if (typeof extra.descriptionSource === 'string') v.descriptionSource = extra.descriptionSource as 'manual' | null
  if (extra.nocover !== undefined) (v as unknown as Record<string, unknown>).nocover = extra.nocover
  if (extra.unlisted !== undefined) (v as unknown as Record<string, unknown>).unlisted = extra.unlisted
  if (extra.unrated !== undefined) (v as unknown as Record<string, unknown>).unrated = extra.unrated
  if (Array.isArray(extra.episodes)) v.episodes = extra.episodes
  return v
}

/** 序列化视频行（返回列名 → 值 的 Record，供 INSERT/UPDATE 复用） */
function videoToRow(v: Video): Record<string, unknown> {
  return {
    id: v.id,
    library_id: v.libraryId,
    path: v.path,
    file_name: v.fileName,
    folder_name: v.folderName ?? null,
    title: v.title,
    year: v.year ?? null,
    description: v.description ?? null,
    rating: v.rating ?? null,
    duration_sec: v.durationSec ?? null,
    file_size: v.fileSize ?? null,
    content_hash: v.contentHash ?? null,
    phash: v.phash ?? null,
    poster_path: v.posterPath ?? null,
    poster_source: v.posterSource ?? null,
    poster_path_ffmpeg: v.posterPathFfmpeg ?? null,
    added_at: v.addedAt,
    last_played_at: v.lastPlayedAt ?? null,
    favorite: v.favorite ? 1 : 0,
    locked: v.locked ? 1 : 0,
    locked_at: v.lockedAt ?? null,
    playback_position_sec: v.playbackPositionSec ?? null,
    playback_updated_at: v.playbackUpdatedAt ?? null,
    nfo_path: v.nfoPath ?? null,
    intro_category: v.introCategory ?? null,
    region: v.region ?? null,
    series: v.series ?? null,
    tags: JSON.stringify(v.tags ?? []),
    tag_categories: JSON.stringify(v.tagCategories ?? {}),
    backup_tags: JSON.stringify(v.backupTags ?? []),
    actors: JSON.stringify(v.actors ?? []),
    tech_info: JSON.stringify(v.techInfo ?? null),
    meta: JSON.stringify(v.meta ?? null),
    preview_paths: JSON.stringify(v.previewPaths ?? []),
    media_status: v.mediaStatus ?? null,
    preview_status: v.previewStatus ?? null,
    preview_requested_count: v.previewRequestedCount ?? null,
    preview_generated_count: v.previewGeneratedCount ?? null,
    preview_algorithm_version: v.previewAlgorithmVersion ?? null,
    preview_updated_at: v.previewUpdatedAt ?? null,
    preview_last_error: v.previewLastError ?? null,
    last_meta_fetch_at: v.lastMetaFetchAt ?? null,
    frame_failed_at: v.frameFailedAt ?? null,
    cover_version: v.coverVersion ?? 0,
    preview_version: v.previewVersion ?? 0,
    extra: JSON.stringify({
      descriptionSource: v.descriptionSource ?? null,
      nocover: (v as unknown as Record<string, unknown>).nocover,
      unlisted: (v as unknown as Record<string, unknown>).unlisted,
      unrated: (v as unknown as Record<string, unknown>).unrated,
      episodes: v.episodes ?? null
    })
  }
}

const VIDEO_COLS = [
  'id', 'library_id', 'path', 'file_name', 'folder_name', 'title', 'year', 'description', 'rating',
  'duration_sec', 'file_size', 'content_hash', 'phash', 'poster_path', 'poster_source', 'poster_path_ffmpeg',
  'added_at', 'last_played_at', 'favorite', 'locked', 'locked_at',
  'playback_position_sec', 'playback_updated_at', 'nfo_path', 'intro_category', 'region', 'series',
  'tags', 'tag_categories', 'backup_tags', 'actors', 'tech_info', 'meta', 'preview_paths',
  'media_status', 'preview_status', 'preview_requested_count', 'preview_generated_count',
  'preview_algorithm_version', 'preview_updated_at', 'preview_last_error',
  'last_meta_fetch_at', 'frame_failed_at', 'cover_version', 'preview_version', 'extra'
] as const

function selectVideo(id: string): Video | null {
  const row = getDb().prepare(`SELECT ${VIDEO_COLS.join(',')} FROM videos WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  return row ? rowToVideo(row) : null
}

function upsertVideoRow(v: Video): void {
  const row = videoToRow(v)
  const keys = VIDEO_COLS.join(',')
  const placeholders = VIDEO_COLS.map(() => '?').join(',')
  getDb()
    .prepare(`INSERT OR REPLACE INTO videos (${keys}) VALUES (${placeholders})`)
    .run(...VIDEO_COLS.map((c) => row[c]))
}

function patchVideoRow(id: string, patch: Partial<Video>): Video | null {
  const prev = selectVideo(id)
  if (!prev) return null
  const merged: Video = { ...prev, ...patch }
  // 保护锁定：写入方未显式携带 locked 时沿用已有锁定状态
  if (patch.locked === undefined && prev.locked !== undefined) {
    merged.locked = prev.locked
    merged.lockedAt = prev.lockedAt
  }
  upsertVideoRow(merged)
  return merged
}

/** 只更新内容感知哈希（phash 由计算流程写入，不在用户可编辑白名单内） */
export function setVideoPhash(id: string, phash: string | null): void {
  getDb().prepare('UPDATE videos SET phash = ? WHERE id = ?').run(phash, id)
}

// ---------- 设置 ----------
export async function getSettings(): Promise<Settings> {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  const settings = {} as Settings
  for (const r of rows) {
    if (r.key.startsWith('_')) continue
    try {
      ;(settings as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value)
    } catch {
      // 忽略坏值
    }
  }
  return settings
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = getDb()
  const current = await getSettings()
  const merged = { ...current, ...patch }
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
  const tx = db.transaction((entries: Array<[string, unknown]>) => {
    for (const [k, v] of entries) stmt.run(k, JSON.stringify(v), Date.now())
  })
  tx(Object.entries(merged))
  return merged
}

// ---------- 媒体库 ----------
export async function listLibraries(): Promise<Library[]> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM libraries').all() as Array<Record<string, unknown>>
  return rows
    .map((r) => {
      const extra = safeParse<Record<string, unknown>>(r.extra as string, {})
      const lib: Library = {
        id: r.id as string,
        name: r.name as string,
        folderPath: r.folder_path as string,
        createdAt: r.created_at as number,
        introExcelPath: extra.introExcelPath as string | undefined,
        imagePriority: extra.imagePriority as Library['imagePriority']
      }
      return lib
    })
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function addLibrary(input: Omit<Library, 'id' | 'createdAt'>): Promise<Library> {
  const lib: Library = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now()
  }
  getDb()
    .prepare('INSERT OR REPLACE INTO libraries (id, name, folder_path, created_at, updated_at, scan_config, extra) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      lib.id,
      lib.name,
      lib.folderPath,
      lib.createdAt,
      lib.createdAt,
      JSON.stringify({}),
      JSON.stringify({
        introExcelPath: lib.introExcelPath,
        imagePriority: lib.imagePriority
      })
    )
  return lib
}

export async function updateLibrary(id: string, patch: Partial<Library>): Promise<Library | null> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM libraries WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const extra = safeParse<Record<string, unknown>>(row.extra as string, {})
  const merged: Library = {
    id: row.id as string,
    name: row.name as string,
    folderPath: row.folder_path as string,
    createdAt: row.created_at as number,
    introExcelPath: (extra.introExcelPath as string) ?? undefined,
    imagePriority: extra.imagePriority as Library['imagePriority']
  }
  Object.assign(merged, patch)
  db.prepare('UPDATE libraries SET name = ?, folder_path = ?, updated_at = ?, extra = ? WHERE id = ?').run(
    merged.name,
    merged.folderPath,
    Date.now(),
    JSON.stringify({ introExcelPath: merged.introExcelPath, imagePriority: merged.imagePriority }),
    id
  )
  return merged
}

export async function removeLibrary(id: string): Promise<void> {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM videos WHERE library_id = ?').run(id)
    db.prepare('DELETE FROM libraries WHERE id = ?').run(id)
  })
  tx()
}

// ---------- 视频 ----------
export async function getVideo(id: string): Promise<Video | null> {
  const v = selectVideo(id)
  if (!v) return null
  // 防御：previewPaths 指向的文件已被清理（手动删/磁盘清理工具）→ 清掉坏路径，
  // 让详情页走「无预览图自动截帧」分支，避免显示一整排破损图。
  if (v.previewPaths?.length && !existsSync(v.previewPaths[0])) {
    return { ...v, previewPaths: undefined, previewStatus: undefined }
  }
  return v
}

export async function upsertVideo(video: Video): Promise<Video> {
  const prev = selectVideo(video.id)
  if (prev && video.locked === undefined && prev.locked !== undefined) {
    upsertVideoRow({ ...video, locked: prev.locked, lockedAt: prev.lockedAt })
  } else {
    upsertVideoRow(video)
  }
  return video
}

export async function updateVideo(id: string, patch: Partial<Video>): Promise<Video | null> {
  return patchVideoRow(id, patch)
}

export async function removeVideo(id: string): Promise<void> {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM videos WHERE id = ?').run(id)
    db.prepare('DELETE FROM preview_tasks WHERE media_id = ?').run(id)
    db.prepare('DELETE FROM preview_manifests WHERE media_id = ?').run(id)
  })
  tx()
}

/** 按路径查重，避免重复扫描 */
export async function findVideoByPath(p: string): Promise<Video | null> {
  const row = getDb().prepare(`SELECT ${VIDEO_COLS.join(',')} FROM videos WHERE path = ?`).get(p) as Record<string, unknown> | undefined
  return row ? rowToVideo(row) : null
}

/** 按内容指纹查重：用于识别「被重命名的文件」——路径变了但内容没变 */
export async function findVideoByContentHash(hash: string, libraryId: string): Promise<Video | null> {
  if (!hash) return null
  const row = getDb().prepare(`SELECT ${VIDEO_COLS.join(',')} FROM videos WHERE library_id = ? AND content_hash = ?`).get(libraryId, hash) as Record<string, unknown> | undefined
  return row ? rowToVideo(row) : null
}

/** 兜底查重：老记录未存 contentHash 时，用「标题 + 文件大小」近似识别重命名 */
export async function findVideoByTitleSize(title: string, size: number | undefined, libraryId: string): Promise<Video | null> {
  if (!title || size == null) return null
  const row = getDb()
    .prepare(`SELECT ${VIDEO_COLS.join(',')} FROM videos WHERE library_id = ? AND title = ? AND file_size = ?`)
    .get(libraryId, title, size) as Record<string, unknown> | undefined
  return row ? rowToVideo(row) : null
}

// ---------- 批量写盘（对账/扫描时避免逐条写） ----------

export type VideoChange =
  | { type: 'upsert'; video: Video }
  | { type: 'update'; video: Video }
  | { type: 'remove'; id: string }

/** 把一批视频变更一次性应用到 SQLite（单个事务） */
export async function applyVideoChanges(changes: VideoChange[]): Promise<void> {
  if (changes.length === 0) return
  const db = getDb()
  const getById = db.prepare(`SELECT ${VIDEO_COLS.join(',')} FROM videos WHERE id = ?`)
  const del = db.prepare('DELETE FROM videos WHERE id = ?')
  const ins = db.prepare(
    `INSERT OR REPLACE INTO videos (${VIDEO_COLS.join(',')}) VALUES (${VIDEO_COLS.map(() => '?').join(',')})`
  )
  const tx = db.transaction((items: VideoChange[]) => {
    for (const c of items) {
      if (c.type === 'remove') {
        del.run(c.id)
        continue
      }
      // v2.7.x：保护用户「锁定」标记 —— 写入方未显式携带 locked 时沿用已有锁定状态
      let next: Video = c.video
      const prevRow = getById.get(c.video.id) as Record<string, unknown> | undefined
      if (prevRow && c.video.locked === undefined) {
        const prev = rowToVideo(prevRow)
        if (prev.locked !== undefined) {
          next = { ...c.video, locked: prev.locked, lockedAt: prev.lockedAt }
        }
      }
      const row = videoToRow(next)
      ins.run(...VIDEO_COLS.map((col) => row[col]))
    }
  })
  tx(changes)
}

// ---------- Preview V2 任务 / 清单 ----------

export const PREVIEW_ALGORITHM_VERSION = 'V2.0'

export async function listPreviewTasks(): Promise<PreviewTask[]> {
  const rows = getDb().prepare('SELECT * FROM preview_tasks ORDER BY created_at').all() as Array<Record<string, unknown>>
  return rows.map(rowToTask)
}

export async function getPreviewTask(id: string): Promise<PreviewTask | null> {
  const row = getDb().prepare('SELECT * FROM preview_tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToTask(row) : null
}

export async function getPreviewTaskForMedia(mediaId: string): Promise<PreviewTask | null> {
  const row = getDb()
    .prepare("SELECT * FROM preview_tasks WHERE media_id = ? AND task_type = 'GENERATE_PREVIEW' AND (status = 'PENDING' OR status = 'PROCESSING')")
    .get(mediaId) as Record<string, unknown> | undefined
  return row ? rowToTask(row) : null
}

function rowToTask(row: Record<string, unknown>): PreviewTask {
  const extra = safeParse<Record<string, unknown>>(row.extra as string, {})
  const t: PreviewTask = {
    id: row.id as string,
    mediaId: row.media_id as string,
    taskType: (row.task_type as PreviewTask['taskType']) ?? 'GENERATE_PREVIEW',
    priority: (row.priority as number) ?? 3,
    status: (row.status as PreviewStatus) ?? 'PENDING',
    progress: (row.progress as number) ?? 0,
    requestedCount: (row.requested_count as number) ?? 20,
    generatedCount: (row.generated_count as number) ?? 0,
    retryCount: (row.retry_count as number) ?? 0,
    algorithmVersion: (row.algorithm_version as string) ?? PREVIEW_ALGORITHM_VERSION,
    qualityMode: (row.quality_mode as PreviewQualityMode) ?? 'STANDARD',
    createdAt: row.created_at as number,
    startedAt: (row.started_at as number) ?? undefined,
    finishedAt: (row.finished_at as number) ?? undefined,
    lastError: (row.last_error as string) ?? undefined,
    errorCode: (row.error_code as string) ?? undefined
  }
  // extra 中可能携带的额外字段
  if (extra.lastError !== undefined) t.lastError = extra.lastError as string
  return t
}

function taskToRow(t: PreviewTask): Record<string, unknown> {
  return {
    id: t.id,
    media_id: t.mediaId,
    task_type: t.taskType,
    priority: t.priority,
    status: t.status,
    progress: t.progress,
    requested_count: t.requestedCount,
    generated_count: t.generatedCount,
    retry_count: t.retryCount,
    algorithm_version: t.algorithmVersion,
    quality_mode: t.qualityMode,
    created_at: t.createdAt,
    started_at: t.startedAt ?? null,
    finished_at: t.finishedAt ?? null,
    last_error: t.lastError ?? null,
    error_code: t.errorCode ?? null,
    extra: JSON.stringify({})
  }
}

function upsertTask(t: PreviewTask): void {
  const row = taskToRow(t)
  getDb()
    .prepare(`INSERT OR REPLACE INTO preview_tasks (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`)
    .run(...Object.values(row))
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
  const db = getDb()
  const v = selectVideo(mediaId)
  if (!v) throw new Error('视频不存在')
  const settings = await getSettings()
  const requestedCount = Math.max(1, Math.floor(opts.requestedCount ?? settings.previewFrameCount ?? 20))
  const qualityMode = opts.qualityMode ?? settings.previewQualityMode ?? 'STANDARD'
  const fingerprint = `${v.path}|${v.fileSize ?? 0}|${v.contentHash ?? ''}`
  const manifestRow = db.prepare('SELECT manifest FROM preview_manifests WHERE media_id = ?').get(mediaId) as { manifest: string } | undefined
  const manifest = manifestRow ? (safeParse<PreviewManifest>(manifestRow.manifest, undefined) ?? null) : null
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
  if (cacheFresh && manifest) {
    const completed = {
      id: randomUUID(),
      mediaId,
      taskType: 'GENERATE_PREVIEW' as const,
      priority: opts.priority ?? 3,
      status: 'COMPLETED' as PreviewStatus,
      progress: 1,
      requestedCount,
      generatedCount: manifest.generatedCount,
      retryCount: 0,
      algorithmVersion: PREVIEW_ALGORITHM_VERSION,
      qualityMode,
      createdAt: Date.now(),
      finishedAt: manifest.generatedAt
    }
    const existing = await getPreviewTaskForMedia(mediaId)
    upsertVideoRow({
      ...v,
      previewStatus: 'COMPLETED',
      previewAlgorithmVersion: manifest.algorithmVersion,
      previewRequestedCount: manifest.requestedCount,
      previewGeneratedCount: manifest.generatedCount,
      previewPaths: manifest.frames.map((f) => f.filePath)
    })
    return existing ?? completed
  }
  const existing = await getPreviewTaskForMedia(mediaId)
  if (existing) {
    const next: PreviewTask = {
      ...existing,
      priority: Math.min(existing.priority, opts.priority ?? existing.priority),
      requestedCount,
      qualityMode,
      algorithmVersion: PREVIEW_ALGORITHM_VERSION,
      status: existing.status === 'PROCESSING' ? existing.status : 'PENDING'
    }
    upsertTask(next)
    upsertVideoRow({
      ...v,
      previewStatus: next.status,
      previewRequestedCount: requestedCount
    })
    return next
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
  upsertTask(task)
  upsertVideoRow({
    ...v,
    previewStatus: 'PENDING',
    previewRequestedCount: requestedCount,
    previewGeneratedCount: 0,
    previewAlgorithmVersion: PREVIEW_ALGORITHM_VERSION,
    previewLastError: undefined
  })
  return task
}

export async function claimNextPreviewTask(): Promise<PreviewTask | null> {
  const db = getDb()
  const row = db
    .prepare("SELECT * FROM preview_tasks WHERE task_type = 'GENERATE_PREVIEW' AND status = 'PENDING' ORDER BY priority ASC, created_at ASC LIMIT 1")
    .get() as Record<string, unknown> | undefined
  if (!row) return null
  const task = rowToTask(row)
  const next: PreviewTask = { ...task, status: 'PROCESSING', progress: 0, startedAt: Date.now(), lastError: undefined }
  upsertTask(next)
  const v = selectVideo(task.mediaId)
  if (v) {
    upsertVideoRow({
      ...v,
      previewStatus: 'PROCESSING',
      previewRequestedCount: task.requestedCount,
      previewGeneratedCount: 0,
      previewLastError: undefined
    })
  }
  return { ...next }
}

export async function updatePreviewTask(
  id: string,
  patch: Partial<PreviewTask>,
  videoPatch?: Partial<Video>
): Promise<PreviewTask | null> {
  const existing = await getPreviewTask(id)
  if (!existing) return null
  const next: PreviewTask = { ...existing, ...patch }
  upsertTask(next)
  if (videoPatch) {
    const v = selectVideo(existing.mediaId)
    if (v) upsertVideoRow({ ...v, ...videoPatch })
  }
  return { ...next }
}

export async function completePreviewTask(
  taskId: string,
  manifest: PreviewManifest,
  coverPath?: string
): Promise<PreviewTask | null> {
  const db = getDb()
  const existing = await getPreviewTask(taskId)
  if (!existing) return null
  const now = Date.now()
  const next: PreviewTask = {
    ...existing,
    status: 'COMPLETED',
    progress: 1,
    generatedCount: manifest.generatedCount,
    finishedAt: now,
    lastError: undefined,
    errorCode: undefined
  }
  const tx = db.transaction(() => {
    upsertTask(next)
    db.prepare('INSERT OR REPLACE INTO preview_manifests (media_id, manifest, updated_at) VALUES (?, ?, ?)').run(
      manifest.mediaId,
      JSON.stringify(manifest),
      now
    )
    const v = selectVideo(manifest.mediaId)
    if (v) {
      const patch: Partial<Video> = {
        previewStatus: 'COMPLETED',
        previewAlgorithmVersion: manifest.algorithmVersion,
        previewRequestedCount: manifest.requestedCount,
        previewGeneratedCount: manifest.generatedCount,
        previewUpdatedAt: manifest.generatedAt,
        previewPaths: manifest.frames.map((f) => f.filePath),
        previewLastError: undefined
      }
      if (coverPath && (!v.posterPath || v.posterSource === 'placeholder' || v.posterSource === 'ffmpeg')) {
        patch.posterSource = 'ffmpeg'
        patch.posterPath = coverPath
        patch.posterPathFfmpeg = coverPath
      }
      upsertVideoRow({ ...v, ...patch })
    }
  })
  tx()
  return { ...next }
}

export async function savePreviewManifest(manifest: PreviewManifest): Promise<void> {
  getDb().prepare('INSERT OR REPLACE INTO preview_manifests (media_id, manifest, updated_at) VALUES (?, ?, ?)').run(
    manifest.mediaId,
    JSON.stringify(manifest),
    Date.now()
  )
}

export async function getPreviewManifest(mediaId: string): Promise<PreviewManifest | null> {
  const row = getDb().prepare('SELECT manifest FROM preview_manifests WHERE media_id = ?').get(mediaId) as { manifest: string } | undefined
  return row ? (safeParse<PreviewManifest>(row.manifest, undefined) ?? null) : null
}

export async function resetProcessingPreviewTasks(): Promise<number> {
  const db = getDb()
  const res = db.prepare("UPDATE preview_tasks SET status = 'PENDING', progress = 0, started_at = NULL WHERE status = 'PROCESSING'").run()
  db.prepare("UPDATE videos SET preview_status = 'PENDING' WHERE preview_status = 'PROCESSING'").run()
  return res.changes
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
  const rows = getDb().prepare(`SELECT ${VIDEO_COLS.join(',')} FROM videos`).all() as Array<Record<string, unknown>>
  return applyFilter(rows.map(rowToVideo), filter)
}

export async function allTags(): Promise<string[]> {
  const rows = getDb().prepare('SELECT tags FROM videos').all() as Array<{ tags: string }>
  const set = new Set<string>()
  for (const r of rows) for (const t of safeParse<string[]>(r.tags, [])) set.add(t)
  return [...set].sort()
}

export { DEFAULT_IMAGE_PRIORITY }
