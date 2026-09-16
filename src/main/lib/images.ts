import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Library, Settings, Video, ImageSource } from '../../shared/types'
import { resolveFfmpegExe, acquireFfmpeg } from './ffmpegEnv'

/** 截帧诊断日志：写到 userData/logs/ffmpeg-frame.log，便于排查“点了截帧但不出图” */
function frameLogPath(): string {
  return path.join(app.getPath('userData'), 'logs', 'ffmpeg-frame.log')
}
async function frameLog(msg: string): Promise<void> {
  try {
    const p = frameLogPath()
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.appendFile(p, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8')
  } catch {
    /* 日志失败不阻塞业务 */
  }
}

const POSTER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp']
/** 视频文件夹里常见的通用封面文件名（无需与视频同名） */
const GENERIC_POSTER_NAMES = [
  'poster',
  'cover',
  'folder',
  'front',
  'fanart',
  'thumb',
  'cover-art'
]

function postersCacheDir(): string {
  return path.join(app.getPath('userData'), 'posters')
}

/** 查找视频所在目录下的封面图（同名 / 外文件夹同名 / 通用名） */
export async function findSidecar(videoPath: string): Promise<string | null> {
  const dir = path.dirname(videoPath)
  const base = path.basename(videoPath, path.extname(videoPath))
  const folder = path.basename(dir)
  // 候选名：视频同名、外文件夹同名、通用封面名
  const candidates: string[] = [base, folder, ...GENERIC_POSTER_NAMES]
  for (const name of candidates) {
    for (const ext of POSTER_EXTS) {
      const candidate = path.join(dir, name + ext)
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // 继续尝试
      }
    }
  }
  return null
}

function frameCachePath(video: Video): string {
  return path.join(postersCacheDir(), `${video.id}.jpg`)
}

/** 解析 ffmpeg 可执行文件路径是否可用（优先级：设置 > 系统 PATH/常见目录 > 捆绑版兜底） */
async function ffmpegAvailable(settings: Settings): Promise<string | null> {
  return resolveFfmpegExe(settings)
}

async function generateFrame(video: Video, settings: Settings): Promise<string | null> {
  const exe = await ffmpegAvailable(settings)
  if (!exe) return null
  const out = frameCachePath(video)
  await fs.mkdir(postersCacheDir(), { recursive: true })
  // ffmpeg `thumbnail` 滤镜：分析 N 帧后自动选最具代表性的一帧（避免黑场/静帧/淡入淡出）。
  // 官方推荐做法：https://ffmpeg.org/ffmpeg-filters.html#thumbnail-1
  // n=100 覆盖常见短片；超长片（>2h）按比例放大 n 但封顶 200 避免太慢
  const dur = video.durationSec ?? 0
  const n = Math.min(200, Math.max(100, Math.floor(dur / 30)))
  const baseArgs = [
    '-y',
    '-i', video.path,
    '-vf', `thumbnail=n=${n},scale=480:-1`,
    '-frames:v', '1',
    '-q:v', '2',
    out
  ]
  const release = await acquireFfmpeg()
  return new Promise<string | null>((resolve) => {
    const done = (v: string | null) => { release(); resolve(v) }
    const p0 = spawn(exe, baseArgs, { windowsHide: true })
    // 超时兜底：thumbnail 全片分析较慢，30s 未结束强制 kill
    const timer = setTimeout(() => {
      try { p0.kill('SIGKILL') } catch {}
      done(null)
    }, FRAME_TIMEOUT_MS)
    p0.on('error', () => { clearTimeout(timer); done(null) })
    p0.on('close', async (code) => {
      clearTimeout(timer)
      if (code === 0) {
        try { await fs.access(out); done(out) } catch { done(null) }
      } else done(null)
    })
  })
}

export interface ResolvedPoster {
  source: ImageSource
  posterPath?: string
}

/**
 * 按媒体库 imagePriority 顺序解析海报来源。
 * allowFfmpeg=false 时跳过生成（扫描阶段用，避免阻塞）。
 */
export async function resolvePoster(
  video: Video,
  library: Library,
  settings: Settings,
  opts: { allowFfmpeg: boolean }
): Promise<ResolvedPoster> {
  for (const source of library.imagePriority) {
    switch (source) {
      case 'manual':
        if (video.posterSource === 'manual' && video.posterPath) {
          try {
            await fs.access(video.posterPath)
            return { source: 'manual', posterPath: video.posterPath }
          } catch {
            /* 文件丢失，继续 */
          }
        }
        break
      case 'sidecar': {
        const p = await findSidecar(video.path)
        if (p) return { source: 'sidecar', posterPath: p }
        break
      }
      case 'moviedb':
      case 'omdb':
      case 'openlibrary':
      case 'justwatch':
      case 'wikipedia':
        // 只复用已抓取的数据源缓存；抓取动作由「从数据源获取封面 / 批量补全」显式触发
        if (
          (video.posterSource === 'moviedb' || video.posterSource === 'omdb' || video.posterSource === 'openlibrary' || video.posterSource === 'justwatch' || video.posterSource === 'wikipedia') &&
          video.posterPath
        ) {
          try {
            await fs.access(video.posterPath)
            return { source: video.posterSource, posterPath: video.posterPath }
          } catch {
            /* 缓存丢失，继续 */
          }
        }
        break
      case 'ffmpeg': {
        // 已有截帧缓存则复用
        if (video.posterSource === 'ffmpeg' && video.posterPath) {
          try {
            await fs.access(video.posterPath)
            return { source: 'ffmpeg', posterPath: video.posterPath }
          } catch {
            /* 缓存丢失 */
          }
        }
        if (opts.allowFfmpeg) {
          const p = await generateFrame(video, settings)
          if (p) return { source: 'ffmpeg', posterPath: p }
        }
        break
      }
      case 'placeholder':
        return { source: 'placeholder' }
    }
  }
  return { source: 'placeholder' }
}

// v2.3.11：统一子进程超时封装。
// 关键点 1：**必须消费 stdout/stderr**——损坏文件会让 ffmpeg 疯狂刷错误输出，管道缓冲区写满后
//   子进程阻塞在 write 上永远退不出来（原封面截帧没消费 stderr，这是"补齐卡死不动"的直接原因之一）。
// 关键点 2：**必须有超时**——原封面截帧（thumbnail 滤镜要解码全片）既没超时也没消费 stderr，
//   遇到损坏的 wmv 能挂几小时，整个 generatePreviewSet 不返回 → 批量补齐 worker 永久卡住。
const FRAME_TIMEOUT_MS = 30_000 // 单帧截帧

export { postersCacheDir, frameCachePath, generateFrame, frameLog }
