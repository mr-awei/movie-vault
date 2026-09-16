import { execFile } from 'node:child_process'
import { resolveFfmpegExe } from './ffmpegEnv'
import type { Settings } from '../../shared/types'

/** 执行 ffmpeg 并返回二进制 stdout（rawvideo 帧数据） */
function runFfmpegRaw(exe: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: 20000, maxBuffer: 4 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout as Buffer)
    })
  })
}

/** 执行 ffmpeg 探测（拿 stderr 文本） */
function runFfmpegProbe(exe: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: 15000, encoding: 'utf8' }, (err, _stdout, stderr) => {
      if (err) reject(err)
      else resolve(stderr)
    })
  })
}

/**
 * 内容感知哈希（dHash，零依赖）。
 * 用 ffmpeg 从视频中部抽 1 帧灰度 9x8 像素，按相邻像素亮度差生成 64-bit 哈希。
 * 用途：重复检测第 4 级——容忍转码/缩放/水印的内容级相似（比特征匹配可靠）。
 * 注意：命中只作"疑似"，必须配合标题相似度 + 人工确认（防误删）。
 */

/** 从 9x8 灰度像素（72 字节）计算 64-bit dHash，返回 16 位 hex */
export function dHashFromGray(px: Buffer, w: number, h: number): string {
  let hash = 0n
  let bit = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (px[y * w + x] > px[y * w + x + 1]) {
        hash |= 1n << BigInt(bit)
      }
      bit++
    }
  }
  return hash.toString(16).padStart(16, '0')
}

/** 汉明距离（两 64-bit hex 哈希的差异位数），越小越相似 */
export function phashDistance(a: string, b: string): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64
  const x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let n = 0
  let t = x
  while (t) {
    t &= t - 1n
    n++
  }
  return n
}

/**
 * 计算视频的内容感知哈希。
 * 步骤：ffprobe 取时长 → ffmpeg 从中部抽 1 帧 → scale 9:8 灰度 → rawvideo 输出 → dHash。
 * 失败返回 null（不抛错，重复检测降级跳过该视频）。
 */
export async function computePhash(videoPath: string, settings: Settings): Promise<string | null> {
  try {
    const exe = await resolveFfmpegExe(settings)
    if (!exe) return null

    // 时长（中间帧最稳：片头可能有黑帧/标题帧）
    let duration = 0
    try {
      const stderr = await runFfmpegProbe(exe, ['-i', videoPath, '-f', 'null', '-'])
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
      if (m) duration = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    } catch {
      /* probe 失败则不 seek，抽首帧 */
    }
    const ss = duration > 30 ? Math.max(1, Math.round(duration / 2)) : 0

    const args = ss > 0
      ? ['-ss', String(ss), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=9:8:force_original_aspect_ratio=increase,crop=9:8', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']
      : ['-i', videoPath, '-frames:v', '1', '-vf', 'scale=9:8:force_original_aspect_ratio=increase,crop=9:8', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']
    const out = await runFfmpegRaw(exe, args)
    if (!out || out.length < 72) return null
    return dHashFromGray(out, 9, 8)
  } catch {
    return null
  }
}
