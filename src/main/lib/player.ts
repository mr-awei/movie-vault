import { shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import net from 'node:net'
import http from 'node:http'
import type { Settings, Video } from '../../shared/types'
import { updateVideo } from './repo'
import { startWatch, endWatch, deleteWatch } from './watch-history'

/**
 * 播放器模块：打开视频 + 播放进度记录 + 断点续播。
 *
 * 进度回传策略：
 * - mpv：完整支持。启动时传 --start=SS，通过 JSON IPC（命名管道）实时回读播放位置。
 * - PotPlayer：启动时传 /seek=HH:MM:SS；尝试通过网络远程控制接口（默认端口29030）轮询进度；
 *   不可用则降级为"进程运行时长估算"。
 * - 其他自定义播放器 / 系统默认：只记录 lastPlayedAt，进度按运行时长估算。
 *
 * 进度阈值：播放超过 10 秒才记录位置，避免误记录开头。
 * 播放结束（位置 >= 时长 - 10秒）时清除进度。
 */

const MIN_POSITION_TO_SAVE = 10 // 秒，低于此值不记录
const POSITION_POLL_INTERVAL = 1000 // 进度轮询间隔（毫秒）
const POTPLAYER_DEFAULT_PORT = 29030 // PotPlayer 网络远程控制默认端口

/** 活跃的播放器会话（videoId -> session） */
const activeSessions = new Map<string, PlayerSession>()

/** 播放器会话：管理一个视频的播放进程和进度回传 */
class PlayerSession {
  video: Video
  settings: Settings
  process: ChildProcess | null = null
  playerPath: string
  method: string
  startTime: number = Date.now()
  lastPosition: number = 0
  /** 上次落盘时间戳（断点按时间间隔保存，避免 %10 取模丢帧） */
  lastSaveAt: number = 0
  pollTimer: NodeJS.Timeout | null = null
  mpvSocket: net.Socket | null = null
  mpvRequestId: number = 0
  potplayerPort: number = POTPLAYER_DEFAULT_PORT
  potplayerAvailable: boolean = false
  closed: boolean = false
  /** 观看历史记录 ID（用于结束时更新） */
  watchEntryId: string | null = null
  /** startWatch 的 Promise：进程秒退（PotPlayer 单实例委托）时 close 事件可能早于其 resolve */
  watchStartPromise: Promise<void> | null = null

  constructor(video: Video, settings: Settings, playerPath: string, method: string) {
    this.video = video
    this.settings = settings
    this.playerPath = playerPath
    this.method = method
    // 记录观看开始（P1-3：存 Promise 供 onProcessClose await，避免孤儿记录）
    this.watchStartPromise = startWatch(video)
      .then((id) => {
        this.watchEntryId = id
      })
      .catch((err) => {
        console.warn('[player] 记录观看开始失败:', err.message)
      })
  }

  /** 启动播放器进程 */
  launch(args: string[]): void {
    this.process = spawn(this.playerPath, args, { detached: true, stdio: 'ignore', windowsHide: true })
    this.process.on('error', (err) => {
      console.error(`[player] 启动播放器失败: ${this.playerPath}`, err.message)
    })
    this.process.on('close', () => {
      this.onProcessClose()
    })
    this.process.unref()
  }

  /** 开始进度轮询 */
  startPolling(): void {
    this.pollTimer = setInterval(() => {
      void this.pollPosition()
    }, POSITION_POLL_INTERVAL)
  }

  /** 轮询当前播放位置 */
  async pollPosition(): Promise<void> {
    if (this.closed) return

    let position: number | undefined

    if (this.method === 'mpv' && this.mpvSocket) {
      position = await this.getMpvPosition()
    } else if (this.method === 'potplayer' && this.potplayerAvailable) {
      position = await this.getPotPlayerPosition()
    }

    if (position !== undefined && position > MIN_POSITION_TO_SAVE) {
      this.lastPosition = position
      // 每 10 秒保存一次断点（按时间间隔而非位置取模，位置值几乎不会恰好落在整 10 秒上，
      // 旧逻辑 Math.floor(position) % 10 === 0 导致断点几乎从不落盘，退出时丢进度）
      const now = Date.now()
      if (now - this.lastSaveAt >= 10_000) {
        this.lastSaveAt = now
        await this.savePosition(position)
      }
    }
  }

  /** 通过 mpv JSON IPC 获取当前位置 */
  async getMpvPosition(): Promise<number | undefined> {
    if (!this.mpvSocket || this.mpvSocket.destroyed) return undefined
    return new Promise((resolve) => {
      const requestId = ++this.mpvRequestId
      const onData = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const msg = JSON.parse(line)
            if (msg.request_id === requestId && msg.error === 'success') {
              this.mpvSocket?.off('data', onData)
              resolve(typeof msg.data === 'number' ? msg.data : undefined)
              return
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
      this.mpvSocket?.on('data', onData)
      try {
        this.mpvSocket?.write(JSON.stringify({ command: ['get_property', 'time-pos'], request_id: requestId }) + '\n')
      } catch {
        this.mpvSocket?.off('data', onData)
        resolve(undefined)
      }
      // 超时 500ms
      setTimeout(() => {
        this.mpvSocket?.off('data', onData)
        resolve(undefined)
      }, 500)
    })
  }

  /** 通过 PotPlayer 网络远程控制接口获取当前位置 */
  async getPotPlayerPosition(): Promise<number | undefined> {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${this.potplayerPort}/api/player`, { timeout: 500 }, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            // PotPlayer API 可能返回不同的字段名，尝试常见的
            const position = json.position ?? json.currentTime ?? json.time_pos ?? json.current_time
            if (typeof position === 'number') {
              resolve(position)
            } else if (typeof position === 'string') {
              // 可能是 "HH:MM:SS" 格式
              const parts = position.split(':').map(Number)
              if (parts.length === 3) {
                resolve(parts[0] * 3600 + parts[1] * 60 + parts[2])
              } else {
                resolve(undefined)
              }
            } else {
              resolve(undefined)
            }
          } catch {
            resolve(undefined)
          }
        })
      })
      req.on('error', () => {
        this.potplayerAvailable = false
        resolve(undefined)
      })
      req.on('timeout', () => {
        req.destroy()
        resolve(undefined)
      })
    })
  }

  /** 检测 PotPlayer 网络远程控制接口是否可用 */
  async detectPotPlayerApi(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${this.potplayerPort}/api/player`, { timeout: 1000 }, (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    })
  }

  /** 保存播放位置到数据库 */
  async savePosition(position: number): Promise<void> {
    try {
      await updateVideo(this.video.id, {
        playbackPositionSec: Math.round(position),
        playbackUpdatedAt: Date.now()
      })
    } catch (err) {
      console.warn(`[player] 保存播放位置失败: ${(err as Error).message}`)
    }
  }

  /** 进程退出时的处理 */
  async onProcessClose(): Promise<void> {
    if (this.closed) return
    this.closed = true

    // P1-3：等 startWatch 落定（PotPlayer 单实例委托时进程几百 ms 就 close，可能早于其 resolve）
    if (this.watchStartPromise) {
      try {
        await this.watchStartPromise
      } catch {
        /* startWatch 失败时 watchEntryId 保持 null */
      }
    }

    // 停止轮询
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    // 关闭 mpv socket
    if (this.mpvSocket) {
      this.mpvSocket.destroy()
      this.mpvSocket = null
    }

    // 保存最终位置
    const elapsedSec = (Date.now() - this.startTime) / 1000

    // P1-3：运行 < 2 秒 = 委托给已有 PotPlayer 实例（新进程转发参数后秒退），
    // 不是真实观看，清理已建的观看记录并跳过 endWatch，防止垃圾记录堆积
    if (elapsedSec < 2) {
      console.log(`[player] 播放器进程秒退(${Math.round(elapsedSec * 1000)}ms)，判定为单实例委托，清理观看记录`)
      if (this.watchEntryId) {
        try {
          await deleteWatch(this.watchEntryId)
        } catch (err) {
          console.warn(`[player] 清理观看记录失败: ${(err as Error).message}`)
        }
        this.watchEntryId = null
      }
      // 秒退场景：新实例不接管，进度不落盘（原实例继续播放）
      activeSessions.delete(this.video.id)
      return
    }

    let finalPosition = this.lastPosition

    // 如果没有实时位置（非 mpv 或 PotPlayer 网络接口不可用），用运行时长估算
    if (finalPosition === 0 && elapsedSec > MIN_POSITION_TO_SAVE) {
      const duration = this.video.durationSec ?? this.video.techInfo?.durationSec
      if (duration && duration > 0) {
        // 估算位置：运行时长，但不超过视频时长
        finalPosition = Math.min(elapsedSec, duration * 0.95)
        console.log(`[player] 估算播放位置: ${Math.round(finalPosition)}s (运行 ${Math.round(elapsedSec)}s, 时长 ${duration}s)`)
      }
    }

    if (finalPosition > MIN_POSITION_TO_SAVE) {
      // 检查是否播放结束（位置 >= 时长 - 10秒）
      const duration = this.video.durationSec ?? this.video.techInfo?.durationSec
      if (duration && finalPosition >= duration - 10) {
        // 播放结束，清除进度
        try {
          await updateVideo(this.video.id, {
            playbackPositionSec: undefined,
            playbackUpdatedAt: Date.now()
          })
          console.log(`[player] 视频播放结束，清除进度: ${this.video.title}`)
        } catch (err) {
          console.warn(`[player] 清除播放进度失败: ${(err as Error).message}`)
        }
      } else {
        await this.savePosition(finalPosition)
        console.log(`[player] 保存最终播放位置: ${this.video.title} @ ${Math.round(finalPosition)}s`)
      }
    }

    // 记录观看结束
    if (this.watchEntryId) {
      endWatch(this.video.id, this.watchEntryId, finalPosition, elapsedSec).catch((err) => {
        console.warn('[player] 记录观看结束失败:', err.message)
      })
    }

    // 更新最后播放时间
    try {
      await updateVideo(this.video.id, { lastPlayedAt: Date.now() })
    } catch (err) {
      console.warn(`[player] 更新最后播放时间失败: ${(err as Error).message}`)
    }

    // 从活跃会话中移除
    activeSessions.delete(this.video.id)
  }

  /** 强制关闭会话（应用退出时调用） */
  destroy(): void {
    if (this.closed) return
    this.closed = true
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.mpvSocket) {
      this.mpvSocket.destroy()
      this.mpvSocket = null
    }
    activeSessions.delete(this.video.id)
  }
}

/** 判断是否为 mpv 播放器（按路径文件名判断） */
function isMpv(playerPath: string): boolean {
  const name = playerPath.toLowerCase()
  return name.includes('mpv')
}

/** 自动探测系统播放器（playerPath 未配置时使用） */
let cachedPlayer: string | null | undefined

const PLAYER_APP_PATHS = ['PotPlayerMini64.exe', 'PotPlayerMini.exe', 'mpv.exe', 'vlc.exe']
const PLAYER_REL_PATHS = [
  'DAUM\\PotPlayer\\PotPlayerMini64.exe',
  'PotPlayer\\PotPlayerMini64.exe',
  'DAUM\\PotPlayer\\PotPlayerMini.exe',
  'PotPlayer\\PotPlayerMini.exe',
  'mpv\\mpv.exe',
  'VideoLAN\\VLC\\vlc.exe'
]

/**
 * 检测系统中可用的播放器（优先 PotPlayer，其次 mpv/VLC）。
 * 探测来源：注册表 App Paths → 各盘 Program Files 常见安装路径。
 * 结果缓存，每次进程生命周期只探测一次。
 */
async function detectDefaultPlayer(): Promise<string | null> {
  if (cachedPlayer !== undefined) return cachedPlayer
  const execFileP = promisify(execFile)

  // 1. 注册表 App Paths（HKCU + HKLM）
  for (const root of ['HKCU', 'HKLM']) {
    for (const name of PLAYER_APP_PATHS) {
      try {
        const { stdout } = await execFileP(
          'reg',
          ['query', `${root}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${name}`, '/ve'],
          { timeout: 3000, windowsHide: true }
        )
        const m = stdout.match(/REG_SZ\s+(.+)$/m)
        if (m) {
          const p = m[1].trim()
          if (p && existsSync(p)) {
            cachedPlayer = p
            console.log(`[player] 自动检测到播放器(注册表): ${p}`)
            return cachedPlayer
          }
        }
      } catch {
        // 未找到，继续
      }
    }
  }

  // 2. 常见安装路径（枚举 C-Z 盘）
  for (let code = 67; code <= 90; code++) {
    const drive = String.fromCharCode(code)
    for (const base of ['Program Files', 'Program Files (x86)']) {
      for (const rel of PLAYER_REL_PATHS) {
        const p = `${drive}:\\${base}\\${rel}`
        try {
          if (existsSync(p)) {
            cachedPlayer = p
            console.log(`[player] 自动检测到播放器(常见路径): ${p}`)
            return cachedPlayer
          }
        } catch {
          // 跳过
        }
      }
    }
  }

  cachedPlayer = null
  return null
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
 */
function openWithMpv(session: PlayerSession, startPositionSec?: number): void {
  const pipeName = `mpv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const pipePath = `\\\\.\\pipe\\${pipeName}`
  const args: string[] = []

  // 断点续播：从上次位置开始
  if (startPositionSec && startPositionSec > MIN_POSITION_TO_SAVE) {
    args.push(`--start=${startPositionSec}`)
  }

  // 启用 JSON IPC，通过命名管道通信
  args.push(`--input-ipc-server=${pipePath}`)
  args.push(session.video.path)

  session.launch(args)

  // 延迟连接命名管道（等待 mpv 启动）
  setTimeout(() => {
    const socket = net.connect(pipePath)
    socket.on('connect', () => {
      console.log(`[player] mpv JSON IPC 已连接: ${pipeName}`)
      session.mpvSocket = socket
      session.startPolling()
    })
    socket.on('error', (err) => {
      console.warn(`[player] mpv JSON IPC 连接失败: ${err.message}`)
      // 连接失败，降级为估算模式（仍然启动轮询，但不会获取到位置）
      session.startPolling()
    })
    socket.on('close', () => {
      console.log(`[player] mpv JSON IPC 已断开`)
      session.mpvSocket = null
    })
  }, 1000)
}

/**
 * 用 PotPlayer 打开视频。
 * 启动时传 /seek 参数跳转；尝试通过网络远程控制接口轮询进度。
 */
async function openWithPotPlayer(session: PlayerSession, startPositionSec?: number): Promise<void> {
  const args: string[] = []

  // 断点续播：从上次位置开始
  if (startPositionSec && startPositionSec > MIN_POSITION_TO_SAVE) {
    args.push(`/seek=${secToHMS(startPositionSec)}`)
  }

  args.push(session.video.path)
  session.launch(args)

  // 延迟检测 PotPlayer 网络远程控制接口（等待 PotPlayer 启动）
  setTimeout(async () => {
    const available = await session.detectPotPlayerApi()
    if (available) {
      console.log(`[player] PotPlayer 网络远程控制接口可用，开始轮询进度`)
      session.potplayerAvailable = true
      session.startPolling()
    } else {
      console.log(`[player] PotPlayer 网络远程控制接口不可用，降级为估算模式`)
      console.log(`[player] 提示：可在 PotPlayer 选项 → 基本 → 网络远程控制 中开启，默认端口 ${POTPLAYER_DEFAULT_PORT}`)
      session.startPolling()
    }
  }, 2000)
}

/**
 * 点击视频：用可配置播放器或系统默认程序打开，并记录播放时间。
 * 如果视频有上次播放位置且播放器支持，则从断点续播。
 */
export async function openVideo(video: Video, settings: Settings): Promise<{ ok: boolean; method: string; resumed?: boolean }> {
  const configured = settings.playerPath.trim()
  const player = configured || (await detectDefaultPlayer()) || ''
  console.log(`[player] 打开视频: ${video.fileName}, 播放器: ${player || '系统默认'}, 断点: ${video.playbackPositionSec || 0}s`)
  const hasResume = !!(video.playbackPositionSec && video.playbackPositionSec > MIN_POSITION_TO_SAVE)

  // 如果已有活跃会话，先关闭
  const existing = activeSessions.get(video.id)
  if (existing) {
    existing.destroy()
  }

  if (player) {
    try {
      await fs.access(player)

      const session = new PlayerSession(video, settings, player, '')

      if (isMpv(player)) {
        session.method = 'mpv'
        openWithMpv(session, video.playbackPositionSec)
        activeSessions.set(video.id, session)
        return { ok: true, method: 'mpv', resumed: hasResume }
      }

      if (isPotPlayer(player)) {
        session.method = 'potplayer'
        await openWithPotPlayer(session, video.playbackPositionSec)
        activeSessions.set(video.id, session)
        return { ok: true, method: 'potplayer', resumed: hasResume }
      }

      // 其他自定义播放器：普通打开，不支持断点续传，但记录会话用于估算
      session.method = 'custom'
      session.launch([video.path])
      session.startPolling()
      activeSessions.set(video.id, session)
      return { ok: true, method: 'custom' }
    } catch {
      // 指定播放器不可用，回退系统默认
    }
  }

  // 系统默认播放器
  const err = await shell.openPath(video.path)
  if (err) console.error(`[player] 系统默认打开失败: ${err}`)
  try {
    await updateVideo(video.id, { lastPlayedAt: Date.now() })
  } catch (e) {
    console.warn(`[player] 更新最后播放时间失败: ${(e as Error).message}`)
  }
  return { ok: true, method: 'system' }
}

/**
 * 播放整个播放列表：mpv 支持多文件播放列表，其他播放器降级为只播第一个。
 */
export async function openPlaylist(videos: Video[], settings: Settings): Promise<{ ok: boolean; method: string; count: number }> {
  if (videos.length === 0) return { ok: false, method: 'empty', count: 0 }
  const configured = settings.playerPath.trim()
  const player = configured || (await detectDefaultPlayer()) || ''
  const paths = videos.map((v) => v.path)

  // 如果已有活跃会话，先关闭
  for (const session of activeSessions.values()) {
    session.destroy()
  }

  if (player) {
    try {
      await fs.access(player)

      if (isMpv(player)) {
        // mpv：传入所有文件路径，自动创建播放列表
        const session = new PlayerSession(videos[0], settings, player, 'mpv-playlist')
        const args = [...paths]
        session.launch(args)
        activeSessions.set(videos[0].id, session)
        try {
          await updateVideo(videos[0].id, { lastPlayedAt: Date.now() })
        } catch (e) {
          console.warn(`[player] 更新最后播放时间失败: ${(e as Error).message}`)
        }
        return { ok: true, method: 'mpv-playlist', count: videos.length }
      }

      if (isPotPlayer(player)) {
        // PotPlayer：支持多文件作为播放列表
        const session = new PlayerSession(videos[0], settings, player, 'potplayer-playlist')
        session.launch(paths)
        activeSessions.set(videos[0].id, session)
        try {
          await updateVideo(videos[0].id, { lastPlayedAt: Date.now() })
        } catch (e) {
          console.warn(`[player] 更新最后播放时间失败: ${(e as Error).message}`)
        }
        return { ok: true, method: 'potplayer-playlist', count: videos.length }
      }

      // 其他播放器：只播第一个
      const session = new PlayerSession(videos[0], settings, player, 'custom-first')
      session.launch([paths[0]])
      session.startPolling()
      activeSessions.set(videos[0].id, session)
      return { ok: true, method: 'custom-first', count: 1 }
    } catch {
      // 回退系统默认
    }
  }

  const err = await shell.openPath(paths[0])
  if (err) console.error(`[player] 系统默认打开失败: ${err}`)
  try {
    await updateVideo(videos[0].id, { lastPlayedAt: Date.now() })
  } catch (e) {
    console.warn(`[player] 更新最后播放时间失败: ${(e as Error).message}`)
  }
  return { ok: true, method: 'system-first', count: 1 }
}

/**
 * 更新播放进度（由渲染层或 mpv IPC 回调调用）。
 * 只记录超过 MIN_POSITION_TO_SAVE 秒的位置。
 */
export async function updatePlaybackPosition(videoId: string, positionSec: number): Promise<Video | null> {
  if (positionSec < MIN_POSITION_TO_SAVE) {
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

/**
 * 停止所有活跃会话（应用退出时调用）。
 */
export function stopAllSessions(): void {
  for (const session of activeSessions.values()) {
    session.destroy()
  }
  activeSessions.clear()
}

/**
 * 获取当前活跃会话数量（用于调试）。
 */
export function getActiveSessionCount(): number {
  return activeSessions.size
}
