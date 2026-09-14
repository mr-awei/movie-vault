/**
 * ffmpeg/ffprobe 运行环境检测与磁盘整理。
 *
 * 版本策略（v1.1.0）：
 *  - 安装包捆绑 UPX 版 ffmpeg（resources/ffmpeg/bin，62MB）作离线兜底；
 *  - 但**系统已装 ffmpeg 的电脑应完全复用系统版**，并**删除捆绑版**释放 62MB 磁盘；
 *  - 查找优先级（运行时）：设置 ffmpegPath > 系统 PATH/常见目录 > 捆绑版。
 */
import { spawn, execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Settings } from '../../shared/types'

/** 捆绑版 ffmpeg 目录（安装器/extraResources 位置） */
export function bundledFfmpegDir(): string {
  // process.resourcesPath 在 Electron 运行时始终存在；纯 node 测试环境可能 undefined，防御兜底
  const base = process.resourcesPath || process.cwd()
  return path.join(base, 'ffmpeg')
}

export function bundledFfmpegPath(): string {
  return path.join(bundledFfmpegDir(), 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
}

export function bundledFfprobePath(): string {
  return path.join(bundledFfmpegDir(), 'bin', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
}

/** 探测 exe 是否可运行（spawn -version） */
function probeExecutable(exe: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(exe, ['-version'], { windowsHide: true })
    p.on('error', () => resolve(false))
    p.on('close', (code) => resolve(code === 0))
  })
}

/** 判断一个绝对路径的 ffmpeg.exe 是否真实可用 */
async function isUsable(exe: string): Promise<boolean> {
  try {
    await fs.access(exe)
  } catch {
    return false
  }
  return probeExecutable(exe)
}

/**
 * Windows 上用 where.exe 查找 ffmpeg/ffprobe 的绝对路径。
 * 用 C:\Windows\System32\where.exe 绝对路径，不依赖 PATH 环境变量。
 * 内部先用 spawn 异步查找，失败后用 execFileSync 同步兜底。
 */
const WIN_WHERE_EXE = 'C:\\Windows\\System32\\where.exe'
function whereFind(name: 'ffmpeg' | 'ffprobe'): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null)
    const p = spawn(WIN_WHERE_EXE, [name], { windowsHide: true })
    let out = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => {
      // spawn 也失败 → 同步兜底
      try {
        const r = execFileSync(WIN_WHERE_EXE, [name], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 3000
        })
        const lines = r.split(/\r?\n/).filter(Boolean)
        resolve(lines[0] || null)
      } catch {
        resolve(null)
      }
    })
    p.on('close', (code) => {
      if (code !== 0) return resolve(null)
      const lines = out.split(/\r?\n/).filter(Boolean)
      resolve(lines[0] || null)
    })
  })
}

/**
 * 常见系统安装位置（PATH 之外的常用目录）。
 * 动态生成所有盘符的常见路径（A-Z），覆盖用户把 ffmpeg 装在 D:/E:/F 等盘的场景。
 */
const COMMON_DIRS = (() => {
  const dirs: string[] = []
  // 每个盘符的常见位置
  for (let drive = 65; drive <= 90; drive++) {
    const letter = String.fromCharCode(drive)
    dirs.push(
      `${letter}:\\ffmpeg\\bin`,
      `${letter}:\\ffmpeg\\bin64`,
      `${letter}:\\Program Files\\ffmpeg\\bin`,
      `${letter}:\\Program Files (x86)\\ffmpeg\\bin`,
      `${letter}:\\Tools\\ffmpeg\\bin`,
      `${letter}:\\tools\\ffmpeg\\bin`,
      `${letter}:\\Portable\\ffmpeg\\bin`,
      `${letter}:\\portable\\ffmpeg\\bin`
    )
  }
  return dirs
})()

/**
 * 检测当前 ffmpeg 来源。
 * 优先级：settings.ffmpegPath（custom）> 系统 PATH（system）> 常见目录（system）> 捆绑版（bundled）> missing
 * 检测到系统版时，尝试删除捆绑版释放磁盘（删除失败不阻塞，返回 note）。
 */
export async function detectFfmpeg(
  settings: Settings
): Promise<{
  source: 'custom' | 'system' | 'bundled' | 'missing'
  path?: string
  bundledRemoved?: boolean
  note?: string
}> {
  // 1) 手动指定
  const custom = settings.ffmpegPath?.trim()
  if (custom) {
    if (await isUsable(custom)) {
      await tryRemoveBundled()
      return { source: 'custom', path: custom, bundledRemoved: true }
    }
    // 指定的路径不可用 → 继续向下探测
  }

  // 2) 系统 PATH
  const inPath = await probeExecutable('ffmpeg')
  if (inPath) {
    await tryRemoveBundled()
    return { source: 'system', path: 'ffmpeg（PATH）', bundledRemoved: true }
  }

  // 2b) Windows 兜底：用 where.exe 查找绝对路径（解决 Electron PATH 继承不完整问题）
  const whereFound = await whereFind('ffmpeg')
  if (whereFound && (await isUsable(whereFound))) {
    await tryRemoveBundled()
    return { source: 'system', path: whereFound, bundledRemoved: true }
  }

  // 3) 常见安装目录
  for (const dir of COMMON_DIRS) {
    const cand = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    if (await isUsable(cand)) {
      await tryRemoveBundled()
      return { source: 'system', path: cand, bundledRemoved: true }
    }
  }

  // 4) 捆绑版兜底
  if (await isUsable(bundledFfmpegPath())) {
    return { source: 'bundled', path: bundledFfmpegPath() }
  }

  // 5) 缺失
  return {
    source: 'missing',
    note:
      '未检测到 ffmpeg：视频封面截帧与分辨率探测将不可用。' +
      '可到设置中手动指定 ffmpeg.exe 路径，或安装 ffmpeg（下载 gyan.dev 的 essentials 版解压即可）。'
  }
}

/** 尝试删除捆绑版 ffmpeg（62MB），删除失败静默忽略（如 Program Files 无写权限） */
async function tryRemoveBundled(): Promise<boolean> {
  const dir = bundledFfmpegDir()
  try {
    await fs.access(dir)
    await fs.rm(dir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/** 运行时可执行路径解析：custom > PATH > where.exe 兜底 > COMMON_DIRS > bundled（供 images/ffprobe 使用） */
export async function resolveFfmpegExe(settings: Settings): Promise<string | null> {
  const custom = settings.ffmpegPath?.trim()
  if (custom && (await isUsable(custom))) return custom
  if (await probeExecutable('ffmpeg')) return 'ffmpeg'
  // Windows 兜底：where.exe 查找绝对路径
  const whereFound = await whereFind('ffmpeg')
  if (whereFound && (await isUsable(whereFound))) return whereFound
  // COMMON_DIRS 兜底
  for (const dir of COMMON_DIRS) {
    const cand = path.join(dir, 'ffmpeg.exe')
    if (await isUsable(cand)) return cand
  }
  if (await isUsable(bundledFfmpegPath())) return bundledFfmpegPath()
  console.error('[ffmpegEnv] ALL sources failed to find ffmpeg')
  return null
}

/** 运行时可执行路径解析：优先 ffmpeg 同目录 ffprobe，其次系统 PATH，其次 where.exe，其次捆绑 */
export async function resolveFfprobeExe(settings: Settings): Promise<string | null> {
  const custom = settings.ffmpegPath?.trim()
  if (custom) {
    const cand = path.join(
      path.dirname(custom),
      process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    )
    if (await isUsable(cand)) return cand
  }
  if (await probeExecutable('ffprobe')) return 'ffprobe'
  // Windows 兜底：where.exe 查找 ffprobe 绝对路径
  const whereFound = await whereFind('ffprobe')
  if (whereFound && (await isUsable(whereFound))) return whereFound
  // 也尝试和 resolveFfmpegExe 找到的 ffmpeg 同目录
  const ffmpegExe = await resolveFfmpegExe(settings)
  if (ffmpegExe && path.isAbsolute(ffmpegExe)) {
    const cand = path.join(
      path.dirname(ffmpegExe),
      process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    )
    if (await isUsable(cand)) return cand
  }
  if (await isUsable(bundledFfprobePath())) return bundledFfprobePath()
  return null
}

// ─── 全局 ffmpeg 进程并发信号量 ───────────────────────────────────────────
// 支持批量预订：一次拿 N 个槽，全部用完后统一 release。
// 这样 generatePreviewV2 的 sampleFrames 内部并发不会互相排队卡成串行。

const MAX_FFMPEG_CONCURRENT = 6
let activeFfmpegCount = 0

type Pending = { slots: number; resolve: (r: () => void) => void }
const queue: Pending[] = []

function tryDrain(): void {
  while (queue.length > 0) {
    const head = queue[0]
    if (activeFfmpegCount + head.slots <= MAX_FFMPEG_CONCURRENT) {
      queue.shift()
      activeFfmpegCount += head.slots
      let released = false
      const release = () => {
        if (released) return
        released = true
        activeFfmpegCount -= head.slots
        tryDrain()
      }
      head.resolve(release)
    } else {
      return // 队头都满足不了，后面的更不行
    }
  }
}

/**
 * 异步获取 N 个 ffmpeg 运行槽位。返回 release()。
 * 同一批次的所有槽同时到位才 resolve。
 */
export function acquireFfmpeg(slots = 1): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    if (activeFfmpegCount + slots <= MAX_FFMPEG_CONCURRENT && queue.length === 0) {
      // 快路径：队列为空且空间够 → 立即分配
      activeFfmpegCount += slots
      let released = false
      const release = () => {
        if (released) return
        released = true
        activeFfmpegCount -= slots
        tryDrain()
      }
      resolve(release)
    } else {
      queue.push({ slots, resolve })
    }
  })
}

/** 当前运行的 ffmpeg 槽数 + 排队中的请求数（仅供日志诊断） */
export function ffmpegConcurrencyStats(): { active: number; queued: number; max: number } {
  return { active: activeFfmpegCount, queued: queue.length, max: MAX_FFMPEG_CONCURRENT }
}
