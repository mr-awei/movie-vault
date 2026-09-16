import { ipcMain, shell, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'
import * as repo from '../lib/repo'
import { scanLibrary } from '../lib/scanner'
import { openVideo, openPlaylist, updatePlaybackPosition } from '../lib/player'
import { frameLog, postersCacheDir } from '../lib/images'
import { generateQuickCover, generatePreviewV2, previewRoot } from '../lib/preview-v2'
import { wakePreviewTaskQueue } from '../lib/preview-task-queue'
import { flushSave } from '../lib/store'
import { fetchPosterSmart } from '../lib/fetch-meta'
import { fetchDetailByUrl } from '../lib/fetch-by-url'
import { probeVideo } from '../lib/ffprobe'
import { safeFileBaseName } from '../lib/rename'
import { readNfoForVideo, writeNfoForVideo } from '../lib/nfo'
import { localCanonicalName } from '../../shared/code'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { Library, Video, VideoFilter } from '../../shared/types'
import {
  backfillFromDetail,
  cleanVideoCacheFiles,
  emitProgress,
  fetchMovieDetail,
  inFlightPreviews,
  isCoverUsable,
  isSafeId,
  resolveDetailCover
} from './helpers'
const VIDEO_PATCH_KEYS = new Set([
  'title', 'year', 'description', 'descriptionSource', 'rating', 'tags', 'tagCategories',
  'backupTags', 'posterPath', 'posterSource', 'posterPathFfmpeg', 'durationSec', 'fileSize',
  'techInfo', 'favorite', 'locked', 'lockedAt', 'meta', 'actors', 'previewPaths',
  'previewVersion', 'mediaStatus', 'previewStatus', 'previewRequestedCount', 'previewGeneratedCount',
  'previewAlgorithmVersion', 'previewUpdatedAt', 'previewLastError', 'lastMetaFetchAt',
  'frameFailedAt', 'lastPlayedAt', 'introCategory', 'region', 'series',
  'playbackPositionSec', 'playbackUpdatedAt', 'nfoPath', 'unrated', 'unlisted', 'nocover'
])
/** A-2: IPC 边界白名单——只允许用户可编辑字段写库，未知键直接丢弃（防注入覆盖系统字段）。 */
function sanitizeVideoPatch(patch: unknown): Partial<Video> {
  if (!patch || typeof patch !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, vv] of Object.entries(patch as Record<string, unknown>)) {
    if (VIDEO_PATCH_KEYS.has(k)) out[k] = vv
  }
  return out as Partial<Video>
}

export function registerVideoIpc() {
  ipcMain.handle(IPC.videoList, (_e, filter: VideoFilter) => repo.listVideos(filter ?? {}))

  ipcMain.handle(IPC.videoGet, (_e, id: string) => repo.getVideo(id))

  ipcMain.handle(IPC.videoUpdate, (_e, id: string, patch: unknown) => repo.updateVideo(id, sanitizeVideoPatch(patch)))
  // v2.7.x：批量设置锁定状态 —— 一次 applyVideoChanges 落盘，避免逐条全量写 data.json

  ipcMain.handle(IPC.videoLockMany, async (_e, ids: string[], locked: boolean) => {
    if (!Array.isArray(ids) || ids.length === 0) return 0
    const idSet = new Set(ids)
    const all = await repo.listVideos({})
    const now = Date.now()
    const changes: repo.VideoChange[] = all
      .filter((v: Video) => idSet.has(v.id))
      .map((v: Video) => ({
        type: 'update' as const,
        video: { ...v, locked, lockedAt: locked ? now : undefined }
      }))
    await repo.applyVideoChanges(changes)
    return changes.length
  })

  ipcMain.handle(IPC.videoScan, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l: Library) => l.id === libraryId)
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
      (m: string) => errors.push(m)
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
        const previewPaths = result.manifest.frames.map((f: { filePath: string }) => f.filePath)
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

  ipcMain.handle(IPC.videoUpdatePlaybackPosition, (_e, id: string, positionSec: number) => {
    if (!isSafeId(id)) return null
    return updatePlaybackPosition(id, positionSec)
  })
}


/** settings 领域 IPC handler */
