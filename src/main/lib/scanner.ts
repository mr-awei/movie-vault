import { createHash } from 'node:crypto'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import type { Library, ScanProgress, Settings, Video } from '../../shared/types'
import { findVideoByPath, findVideoByContentHash, findVideoByTitleSize, listVideos, applyVideoChanges, enqueuePreviewTask, type VideoChange } from './repo'
import { resolvePoster, postersCacheDir } from './images'
import { probeVideo } from './ffprobe'
import { wakePreviewTaskQueue } from './preview-task-queue'
import { extractTitleYear, detectEpisodeGroup } from '../../shared/code'
import type { EpisodeRef } from '../../shared/types'

export const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v',
  '.mpg', '.mpeg', '.rm', '.rmvb', '.ts', '.m2ts', '.3gp', '.ogv'
])

export function idForPath(p: string, contentHash?: string, libraryId?: string): string {
  // 主键策略：默认按路径（定位安全）；传入 contentHash 时改为按文件内容指纹，
  // 使内容相同的文件（不同路径的副本）自然归并到同一条记录，实现"文件哈希去重"。
  // libraryId 用于跨媒体库隔离，避免不同库里的同名副本互相覆盖。
  const basis = contentHash ? `file:${libraryId ?? ''}:${contentHash}` : `path:${p}`
  return createHash('sha1').update(basis).digest('hex')
}

/**
 * 计算文件内容指纹（用于"文件哈希去重"）：取文件大小 + 前 64KB 的 sha1。
 * 不同影片极少共享"相同大小 + 相同头部 64KB"，足以在扫描/对账时识别副本。
 * 读取失败返回 undefined（退化为按路径主键，不影响主流程）。
 */
export async function computeContentHash(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return undefined
    const size = stat.size
    const sampleSize = Math.min(64 * 1024, size)
    if (sampleSize <= 0) return `sz0:${size}`
    const fh = await fs.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(sampleSize)
      await fh.read(buf, 0, sampleSize, 0)
      const h = createHash('sha1').update(buf).digest('hex')
      return `sz${size}:${h}`
    } finally {
      await fh.close()
    }
  } catch {
    return undefined
  }
}

export async function* walk(dir: string, minSizeBytes = 0): AsyncGenerator<string> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full, minSizeBytes)
    } else if (entry.isFile()) {
      const ext = path.extname(full).toLowerCase()
      if (VIDEO_EXTS.has(ext)) {
        // 大小过滤：跳过小于 minSizeBytes 的文件（过滤短视频/预告片；0 = 不过滤）
        if (minSizeBytes > 0) {
          // stat 失败时保守保留（不跳过，避免网络盘/权限异常时误过滤）
          const st = await fs.stat(full).catch(() => null)
          if (st && st.size < minSizeBytes) continue
        }
        yield full
      }
    }
  }
}


/**
 * 扫描媒体库文件夹，建立视频条目，再按策略富集元数据/海报。
 * onProgress 用于向渲染进程推送进度。
 */
export async function scanLibrary(
  library: Library,
  settings: Settings,
  onProgress?: (p: ScanProgress) => void
): Promise<Video[]> {
  // 扫描最小文件大小过滤：0 = 不限；小于阈值的视频（短视频/广告等）不进媒体库。
  // 只影响本次扫描**新建**的条目；已入库的视频不受影响（避免误删既有数据）。
  const minSizeBytes = Math.max(0, Math.floor(settings.scanMinSizeMB ?? 0)) * 1024 * 1024
  const allFiles: string[] = []
  for await (const f of walk(library.folderPath, minSizeBytes)) allFiles.push(f)
  const total = allFiles.length
  let done = 0

  const created: Video[] = []
  // v2.2.10-fix7：批量写盘——创建阶段收集变更，最后一次 applyVideoChanges 落盘
  //（原来逐条 upsertVideo 全量写 data.json，大库扫描会因过慢被中断，只建了部分记录）
  const createdChanges: VideoChange[] = []
  // v2.13：剧集合并（对标 Jellyfin/Plex）——同文件夹下 S01E01/E01/EP01/第01集 等递增集号的多集
  // 合并为一个剧集条目，path 指向第一集，episodes 列出全部集。
  const byFolder = new Map<string, string[]>()
  for (const f of allFiles) {
    const dir = path.dirname(f)
    const list = byFolder.get(dir) ?? []
    list.push(f)
    byFolder.set(dir, list)
  }
  const episodeFiles = new Set<string>()
  // 预取该库所有已有记录，用于按文件名/目录模糊匹配旧独立集（避免 path 精确匹配因路径格式差异漏删）
  const existingAll = await listVideos({ libraryId: library.id })
  const norm = (s: string) => path.resolve(s).replace(/[\\/]+/g, '/').toLowerCase()
  for (const [dir, files] of byFolder) {
    const names = files.map((f) => path.basename(f))
    const group = detectEpisodeGroup(names)
    if (!group || group.length < 2) continue
    const dirFolder = path.basename(dir)
    const firstPath = path.join(dir, group[0].fileName)
    for (const g of group) episodeFiles.add(path.join(dir, g.fileName))
    const { title, year } = extractTitleYear(dirFolder)
    const episodes: EpisodeRef[] = group.map((g) => ({
      episode: g.episode,
      fileName: g.fileName,
      path: path.join(dir, g.fileName)
    }))
    const st = await fs.stat(firstPath).catch(() => null)
    const info = st ? await probeVideo(firstPath, settings).catch(() => null) : null
    // 迁移：第一集若已有独立入库记录，复用其 id/meta/海报/收藏，避免重新抓取覆盖用户数据
    const prevFirst = await findVideoByPath(firstPath)
    const ev: Video = prevFirst
      ? {
          ...prevFirst,
          path: firstPath,
          fileName: path.basename(firstPath),
          folderName: dirFolder,
          title,
          year,
          fileSize: st?.size,
          durationSec: info?.durationSec ?? prevFirst.durationSec,
          techInfo: info ?? prevFirst.techInfo,
          mediaStatus: st ? 'AVAILABLE' : 'MISSING',
          episodes
        }
      : {
          id: idForPath(firstPath, undefined, library.id),
          libraryId: library.id,
          path: firstPath,
          fileName: path.basename(firstPath),
          folderName: dirFolder,
          title,
          year,
          tags: [],
          addedAt: Date.now(),
          fileSize: st?.size,
          durationSec: info?.durationSec,
          techInfo: info ?? undefined,
          mediaStatus: st ? 'AVAILABLE' : 'MISSING',
          previewStatus: 'PENDING',
          episodes
        }
    if (!prevFirst) {
      const quick = await resolvePoster(ev, library, settings, { allowFfmpeg: false })
      ev.posterSource = quick.source
      ev.posterPath = quick.posterPath
    }
    created.push(ev)
    createdChanges.push({ type: 'upsert', video: ev })
    // 迁移：删除同组其他集的旧独立条目（它们已被合并到剧集条目里）
    // 用文件名+目录名模糊匹配，容忍 path 大小写/分隔符差异
    const dirNorm = norm(dir)
    for (const g of group.slice(1)) {
      const old = existingAll.find(
        (v) => norm(v.path) === norm(path.join(dir, g.fileName))
      )
      if (old) createdChanges.push({ type: 'remove', id: old.id })
    }
  }

  for (const filePath of allFiles) {
    if (episodeFiles.has(filePath)) { done++; continue }
    done++
    const existing = await findVideoByPath(filePath)
    onProgress?.({
      libraryId: library.id,
      total,
      done,
      current: existing?.meta?.title || existing?.title || path.basename(filePath)
    })
    if (existing) {
      created.push(existing)
      if (!existing.previewPaths?.length && existing.previewStatus !== 'COMPLETED') {
        await enqueuePreviewTask(existing.id, { priority: 3 }).catch(() => null)
      }
      continue
    }
    const stat = await fs.stat(filePath).catch(() => null)
    const contentHash = stat ? await computeContentHash(filePath) : undefined
    const folderName = path.basename(path.dirname(filePath))
    const { title, year } = extractTitleYear(filePath)
    // 识别「被重命名的文件」：路径变了但内容没变 → 更新已有记录的路径/文件名/标题，保留已抓取 meta、封面等。
    const prev =
      (contentHash ? await findVideoByContentHash(contentHash, library.id) : null) ??
      (await findVideoByTitleSize(title, stat?.size, library.id))
    const video: Video = prev
      ? {
          ...prev,
          path: filePath,
          fileName: path.basename(filePath),
          folderName,
          title,
          year,
          fileSize: stat?.size,
          contentHash,
          addedAt: prev.addedAt,
          mediaStatus: stat ? 'AVAILABLE' : 'MISSING',
          previewStatus: prev.previewPaths?.length ? 'COMPLETED' : 'PENDING'
        }
      : {
          id: idForPath(filePath, contentHash, library.id),
          libraryId: library.id,
          path: filePath,
          fileName: path.basename(filePath),
          folderName,
          title,
          year,
          tags: [],
          addedAt: Date.now(),
          fileSize: stat?.size,
          contentHash,
          mediaStatus: stat ? 'AVAILABLE' : 'MISSING',
          previewStatus: 'PENDING',
          previewRequestedCount: settings.previewFrameCount ?? 20,
          previewGeneratedCount: 0
        }
    const info = stat ? await probeVideo(filePath, settings).catch(() => null) : null
    if (info) {
      video.techInfo = info
      video.durationSec = info.durationSec ?? video.durationSec
    }
    // 快速解析：手动/同名图/占位（不触发网络与截帧）
    const quick = await resolvePoster(video, library, settings, { allowFfmpeg: false })
    video.posterSource = quick.source
    video.posterPath = quick.posterPath
    // v2.2.10-fix7：批量写盘——创建阶段不再逐条 upsertVideo 全量写 4.7MB data.json
    //（4492 部逐条写要几十分钟，用户等不及中断 → 只建了部分记录），统一收集最后一次落盘
    createdChanges.push({ type: 'upsert', video })
    created.push(video)
  }
  // fix7：创建阶段一次性落盘
    // v2.13 兜底清理：任何独立条目的 path 若已被某个剧集条目的 episodes 收录，就删除该独立条目。
  const normPath = (s: string) => path.resolve(s).replace(/[\\/]+/g, '/').toLowerCase()
  const allAfter = await listVideos({ libraryId: library.id })
  const epMemberPaths = new Set<string>()
  for (const v of allAfter) {
    if (v.episodes && v.episodes.length > 1) {
      for (const ep of v.episodes) epMemberPaths.add(normPath(ep.path))
    }
  }
  for (const v of allAfter) {
    if (v.episodes && v.episodes.length > 1) continue
    if (epMemberPaths.has(normPath(v.path))) {
      createdChanges.push({ type: 'remove', id: v.id })
    }
  }
  if (createdChanges.length > 0) await applyVideoChanges(createdChanges)
  await Promise.all(
    created.map((v) =>
      enqueuePreviewTask(v.id, {
        priority: Date.now() - v.addedAt < 60_000 ? 1 : 3,
        requestedCount: settings.previewFrameCount ?? 20,
        qualityMode: settings.previewQualityMode ?? 'STANDARD'
      }).catch(() => null)
    )
  )
  wakePreviewTaskQueue()

  // v2.7.x：清理「文件已不存在」的失效记录。
  // 用户可能在资源管理器里改名/移动/删除过文件，旧路径的记录会残留在 data.json：
  // 对账不会删它们、批量补齐还会按标题去抓（造成「脏数据仍在参与」）。
  // 放在创建阶段之后：刚被识别为「重命名」的记录此时路径已更新，不会被误删。
  // 安全护栏：仅当本次确实扫到文件时才清理，避免外接盘/网络盘离线时误删整库。
  if (allFiles.length > 0) {
    const alive = new Set(allFiles.map((p) => path.resolve(p).toLowerCase()))
    const existing = await listVideos({ libraryId: library.id })
    const stale = existing.filter(
      (v) => !alive.has(path.resolve(v.path).toLowerCase()) && !existsSync(v.path)
    )
    if (stale.length > 0) {
      await applyVideoChanges(stale.map((v) => ({ type: 'remove' as const, id: v.id })))
      console.log(`[scan] 清理失效记录 ${stale.length} 部（文件已不存在）`)
    }
  }

  await postersCacheDir() // 确保缓存目录存在（无副作用）
  onProgress?.({ libraryId: library.id, total, done: total })
  return created
}
