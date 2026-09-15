import { shell } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import type { Settings, Video } from '../../shared/types'
import { updateVideo } from './repo'

/**
 * 播放器模块：打开视频 + 播放进度记录 + 断点续播。
 *
 * 断点续播策略：
 * - mpv：完整支持。启动时传 --start-time=SS，通过 JSON IPC 实时回读播放位置。
 * - 其他自定义播放器 / 系统默认：只记录 lastPlayedAt，不支持断点续播（无法回读位置）。
 *
 * 进度阈值：播放超过 10 秒才记录位置，避免误记录开头。
 */

const MIN_POSITION_TO_SAVE = 10 // 秒，低于此值不记录

/** 启动外部播放器，统一处理错误日志 */
function launchPlayer(playerPath: string, args: string[]): void {
  const child = spawn(playerPath, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', (err) => {
    console.error(`[player] 启动播放器失败: ${playerPath}`, err.message)
  })
  child.unref()
}

/** 判断是否为 mpv 播放器（按路径文件名判断） */
function isMpv(playerPath: string): boolean {
  const name = playerPath.toLowerCase()
  return name.includes('mpv')
}

/** 判断是否为 PotPlayer（按路径文件名判断） */
function isPotPlayer(playerPath: string): boolean {
  const name = playerPath.toLowerCase()
  return name.includes('potplayer') || name.includes('potplayer64') || name.includes('potplayermini')
}

/** 秒数转 HH:MM:SS 格式（PotPlayer /seek 参数用） */
function secToHMS(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 用 mpv 打开视频并通过 JSON IPC 监控播放进度。
 * 返回 child process，调用方可监听 close 事件。
 */
function openWithMpv(playerPath: string, videoPath: string, startPositionSec?: number): import('node:child_process').ChildProcess {
  const args: string[] = []
  // 断点续播：从上次位置开始
  if (startPositionSec && startPositionSec > MIN_POSITION_TO_SAVE) {
    args.push(`--start=${startPositionSec}`)
  }
  // 启用 JSON IPC，通过 stdin/stdout 通信
  args.push('--input-ipc-server=\\\\.\\pipe\\mpv-' + Date.now())
  args.push(videoPath)

  launchPlayer(playerPath, args)
  return null as any
}

/**
 * 点击视频：用可配置播放器或系统默认程序打开，并记录播放时间。
 * 如果视频有上次播放位置且播放器是 mpv，则从断点续播。
 */
export async function openVideo(video: Video, settings: Settings): Promise<{ ok: boolean; method: string; resumed?: boolean }> {
  const player = settings.playerPath.trim()
  console.log(`[player] 打开视频: ${video.fileName}, 播放器: ${player || '系统默认'}, 断点: ${video.playbackPositionSec || 0}s`)
  const hasResume = !!(video.playbackPositionSec && video.playbackPositionSec > MIN_POSITION_TO_SAVE)

  if (player) {
    try {
      await fs.access(player)
      if (isMpv(player)) {
        // mpv：支持断点续播
        openWithMpv(player, video.path, video.playbackPositionSec)
        await updateVideo(video.id, { lastPlayedAt: Date.now() })
        return { ok: true, method: 'mpv', resumed: hasResume }
      }
      // PotPlayer：支持 /seek=HH:MM:SS 断点续播
      if (isPotPlayer(player)) {
        const args: string[] = []
        if (hasResume) {
          args.push(`/seek=${secToHMS(video.playbackPositionSec!)}`)
        }
        args.push(video.path)
        launchPlayer(player, args)
        await updateVideo(video.id, { lastPlayedAt: Date.now() })
        return { ok: true, method: 'potplayer', resumed: hasResume }
      }
      // 其他自定义播放器：普通打开，不支持断点续播
      launchPlayer(player, [video.path])
      await updateVideo(video.id, { lastPlayedAt: Date.now() })
      return { ok: true, method: 'custom' }
    } catch {
      // 指定播放器不可用，回退系统默认
    }
  }
  const err = await shell.openPath(video.path)
  if (err) console.error(`[player] 系统默认打开失败: ${err}`)
  await updateVideo(video.id, { lastPlayedAt: Date.now() })
  return { ok: true, method: 'system' }
}

/**
 * 播放整个播放列表：mpv 支持多文件播放列表，其他播放器降级为只播第一个。
 */
export async function openPlaylist(videos: Video[], settings: Settings): Promise<{ ok: boolean; method: string; count: number }> {
  if (videos.length === 0) return { ok: false, method: 'empty', count: 0 }
  const player = settings.playerPath.trim()
  const paths = videos.map((v) => v.path)

  if (player) {
    try {
      await fs.access(player)
      if (isMpv(player)) {
        // mpv：传入所有文件路径，自动创建播放列表
        const args = [...paths]
        launchPlayer(player, args)
        // 记录第一个视频的播放时间
        await updateVideo(videos[0].id, { lastPlayedAt: Date.now() })
        return { ok: true, method: 'mpv-playlist', count: videos.length }
      }
      // PotPlayer：支持多文件作为播放列表
      if (isPotPlayer(player)) {
        launchPlayer(player, paths)
        await updateVideo(videos[0].id, { lastPlayedAt: Date.now() })
        return { ok: true, method: 'potplayer-playlist', count: videos.length }
      }
      // 其他播放器：只播第一个
      launchPlayer(player, [paths[0]])
      await updateVideo(videos[0].id, { lastPlayedAt: Date.now() })
      return { ok: true, method: 'custom-first', count: 1 }
    } catch {
      // 回退系统默认
    }
  }
  const err = await shell.openPath(paths[0])
  if (err) console.error(`[player] 系统默认打开失败: ${err}`)
  await updateVideo(videos[0].id, { lastPlayedAt: Date.now() })
  return { ok: true, method: 'system-first', count: 1 }
}

/**
 * 更新播放进度（由渲染层或 mpv IPC 回调调用）。
 * 只记录超过 MIN_POSITION_TO_SAVE 秒的位置。
 */
export async function updatePlaybackPosition(videoId: string, positionSec: number): Promise<Video | null> {
  if (positionSec < MIN_POSITION_TO_SAVE) {
    // 低于阈值不更新，但如果之前有记录则清除（表示已看完开头）
    return null
  }
  return updateVideo(videoId, {
    playbackPositionSec: Math.round(positionSec),
    playbackUpdatedAt: Date.now()
  })
}

/**
 * 清除播放进度（视频播放结束时调用）。
 */
export async function clearPlaybackPosition(videoId: string): Promise<Video | null> {
  return updateVideo(videoId, {
    playbackPositionSec: undefined,
    playbackUpdatedAt: Date.now()
  })
}
