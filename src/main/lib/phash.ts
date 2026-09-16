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

/**
 * 内容感知哈希（dHash，零依赖）。
 * 用 ffmpeg 抽 1 帧灰度 9x8 像素，按相邻像素亮度差生成 64-bit 哈希。
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

/** 抽帧基础参数（9x8 灰度 rawvideo） */
function frameArgs(videoPath: string, ss?: number): string[] {
  const vf = 'scale=9:8:force_original_aspect_ratio=increase,crop=9:8'
  return ss != null
    ? ['-ss', String(ss), '-i', videoPath, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']
    : ['-i', videoPath, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']
}

/**
 * 计算视频的内容感知哈希。
 * 单次 ffmpeg 调用（v2.12.1 优化）：固定 seek 30s（快速输入 seek，避开黑帧标题帧片头），
 * 短视频/抽帧失败回退首帧。相比逐部 probe+抽帧 2 次进程，计算量减半。
 * 失败返回 null（不抛错，重复检测降级跳过该视频）。
 */
export async function computePhash(videoPath: string, settings: Settings): Promise<string | null> {
  try {
    const exe = await resolveFfmpegExe(settings)
    if (!exe) return null

    // 先尝试 30s 处（大片头跳过标题帧；-ss 在 -i 前为快速 seek）
    try {
      const out = await runFfmpegRaw(exe, frameArgs(videoPath, 30))
      if (out && out.length >= 72) return dHashFromGray(out, 9, 8)
    } catch {
      /* 短视频/损坏 → 回退首帧 */
    }
    // 回退：首帧
    try {
      const out = await runFfmpegRaw(exe, frameArgs(videoPath))
      if (out && out.length >= 72) return dHashFromGray(out, 9, 8)
    } catch {
      return null
    }
    return null
  } catch {
    return null
  }
}
