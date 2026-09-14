import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PreviewFrameMeta, PreviewManifest, PreviewQualityMode, Settings, TechInfo, Video } from '../../shared/types'
import { resolveFfmpegExe, acquireFfmpeg } from './ffmpegEnv'
import { probeImage, probeVideo } from './ffprobe'
import { PREVIEW_ALGORITHM_VERSION } from './repo'

export interface PreviewCancelToken {
  cancelled: boolean
  currentProcess?: ChildProcessWithoutNullStreams
}

interface Metrics {
  brightnessMean: number
  brightnessStd: number
  sharpness: number
  contrast: number
  edgeDensity: number
  entropy: number
  colorfulness: number
}

interface Stats {
  sharpP10: number
  sharpP20: number
  sharpP25: number
  sharpP50: number
  sharpP75: number
  sharpP90: number
  contrastP10: number
  contrastP90: number
  edgeP10: number
  edgeP25: number
  edgeP90: number
  entropyP10: number
  entropyP25: number
  entropyP90: number
  colorP10: number
  colorP90: number
}

interface Candidate {
  timestamp: number
  metrics: Metrics
  quality: number
  source: 'COARSE' | 'SCENE'
  pHash: string
  frame?: Buffer
}

interface ScenePoint {
  timestamp: number
  score: number
}

interface SceneCluster {
  start: number
  end: number
  points: ScenePoint[]
}

export interface PreviewV2Debug {
  duration: number
  width?: number
  height?: number
  fps?: number
  sampleInterval: number
  sampleCount: number
  sceneCount: number
  clusterCount: number
  coarseCandidates: number
  sceneCandidates: number
  reducedCandidates: number
  phashThreshold: number
  selectedCount: number
  timings: Record<string, number>
}

export interface PreviewV2Result {
  manifest: PreviewManifest
  coverPath?: string
  debug: PreviewV2Debug
}

const ANALYSIS_WIDTH = 320
const ANALYSIS_HEIGHT = 180
const ANALYSIS_BYTES = ANALYSIS_WIDTH * ANALYSIS_HEIGHT * 3
const MAX_RETRY = 2

export const PREVIEW_V2_DEFAULTS = {
  algorithmVersion: PREVIEW_ALGORITHM_VERSION,
  analysisLongSide: 320,
  jpegQuality: 2,
  maxRetry: MAX_RETRY,
  sceneClusterGap: 3,
  candidatesPerBucket: 4
}

export function previewRoot(): string {
  // 注意：不能放在 userData/Cache/ 下！Electron 会把 Cache 目录当 HTTP 缓存自动清理！
  // Windows 不区分大小写，cache/ 和 Cache/ 是同一路径，会导致预览帧神秘消失。
  return path.join(app.getPath('userData'), 'preview-frames')
}

export function previewCacheDir(mediaId: string, version = PREVIEW_ALGORITHM_VERSION): string {
  return path.join(previewRoot(), mediaId, version)
}

function framePath(mediaId: string, index: number): string {
  return path.join(previewCacheDir(mediaId), `preview_${String(index).padStart(3, '0')}.jpg`)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = clamp((p / 100) * (sorted.length - 1), 0, sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function normalizeByPercentile(value: number, p10: number, p90: number): number {
  if (p90 <= p10) return value >= p90 ? 100 : 0
  return clamp(((value - p10) / (p90 - p10)) * 100, 0, 100)
}

function samplingParams(duration: number, requestedCount: number, mode: PreviewQualityMode): { interval: number; count: number } {
  const table = {
    FAST: { oversample: 24, min: 8, max: 18 },
    STANDARD: { oversample: 36, min: 5, max: 12 },
    HIGH: { oversample: 48, min: 3, max: 8 }
  }[mode]
  let interval = clamp(duration / requestedCount / table.oversample, table.min, table.max)
  if (duration < 600) interval = Math.max(2, duration / (requestedCount * 15))
  if (duration > 3 * 3600) interval = clamp(duration / (requestedCount * 36), 8, duration > 6 * 3600 ? 30 : 20)
  const count = clamp(Math.ceil(duration / interval), requestedCount * 20, requestedCount * 60)
  return { interval: Math.max(0.5, duration / count), count }
}

function analyzeFrame(buf: Buffer): Metrics {
  const pixels = ANALYSIS_WIDTH * ANALYSIS_HEIGHT
  const gray = new Float32Array(pixels)
  let sum = 0
  let rgSum = 0
  let ybSum = 0
  const rgVals = new Float32Array(pixels)
  const ybVals = new Float32Array(pixels)
  const hist = new Uint32Array(256)
  for (let i = 0, p = 0; i < buf.length && p < pixels; i += 3, p++) {
    const r = buf[i]
    const g = buf[i + 1]
    const b = buf[i + 2]
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    gray[p] = y
    sum += y
    hist[clamp(Math.round(y), 0, 255)]++
    const rg = r - g
    const yb = 0.5 * (r + g) - b
    rgVals[p] = rg
    ybVals[p] = yb
    rgSum += rg
    ybSum += yb
  }
  const mean = sum / pixels
  let variance = 0
  let lapSum = 0
  let lapSq = 0
  let edges = 0
  for (let y = 1; y < ANALYSIS_HEIGHT - 1; y++) {
    for (let x = 1; x < ANALYSIS_WIDTH - 1; x++) {
      const idx = y * ANALYSIS_WIDTH + x
      const c = gray[idx]
      variance += (c - mean) ** 2
      const lap = gray[idx - 1] + gray[idx + 1] + gray[idx - ANALYSIS_WIDTH] + gray[idx + ANALYSIS_WIDTH] - 4 * c
      lapSum += lap
      lapSq += lap * lap
      const gx = gray[idx + 1] - gray[idx - 1]
      const gy = gray[idx + ANALYSIS_WIDTH] - gray[idx - ANALYSIS_WIDTH]
      if (Math.sqrt(gx * gx + gy * gy) > 28) edges++
    }
  }
  const inner = (ANALYSIS_WIDTH - 2) * (ANALYSIS_HEIGHT - 2)
  const std = Math.sqrt(variance / inner)
  const lapMean = lapSum / inner
  const sharpness = Math.max(0, lapSq / inner - lapMean * lapMean)
  let entropy = 0
  for (const h of hist) {
    if (!h) continue
    const prob = h / pixels
    entropy -= prob * Math.log2(prob)
  }
  const rgMean = rgSum / pixels
  const ybMean = ybSum / pixels
  let rgVar = 0
  let ybVar = 0
  for (let i = 0; i < pixels; i++) {
    rgVar += (rgVals[i] - rgMean) ** 2
    ybVar += (ybVals[i] - ybMean) ** 2
  }
  const colorfulness =
    Math.sqrt(rgVar / pixels + ybVar / pixels) + 0.3 * Math.sqrt(rgMean * rgMean + ybMean * ybMean)
  return {
    brightnessMean: mean,
    brightnessStd: std,
    sharpness,
    contrast: std,
    edgeDensity: edges / inner,
    entropy,
    colorfulness
  }
}

function obviousGoodNight(m: Metrics, stats: Pick<Stats, 'edgeP25' | 'entropyP25'>): boolean {
  return m.brightnessMean < 25 && (m.edgeDensity > stats.edgeP25 || m.entropy > stats.entropyP25)
}

function isObviousBlackOrWhite(m: Metrics): boolean {
  return (
    (m.brightnessMean < 10 && m.brightnessStd < 8 && m.entropy < 1.6) ||
    (m.brightnessMean > 245 && m.brightnessStd < 8 && m.entropy < 1.6)
  )
}

function buildStats(metrics: Metrics[]): Stats {
  const usable = metrics.filter((m) => !isObviousBlackOrWhite(m))
  const src = usable.length ? usable : metrics
  const values = (fn: (m: Metrics) => number) => src.map(fn)
  return {
    sharpP10: percentile(values((m) => m.sharpness), 10),
    sharpP20: percentile(values((m) => m.sharpness), 20),
    sharpP25: percentile(values((m) => m.sharpness), 25),
    sharpP50: percentile(values((m) => m.sharpness), 50),
    sharpP75: percentile(values((m) => m.sharpness), 75),
    sharpP90: percentile(values((m) => m.sharpness), 90),
    contrastP10: percentile(values((m) => m.contrast), 10),
    contrastP90: percentile(values((m) => m.contrast), 90),
    edgeP10: percentile(values((m) => m.edgeDensity), 10),
    edgeP25: percentile(values((m) => m.edgeDensity), 25),
    edgeP90: percentile(values((m) => m.edgeDensity), 90),
    entropyP10: percentile(values((m) => m.entropy), 10),
    entropyP25: percentile(values((m) => m.entropy), 25),
    entropyP90: percentile(values((m) => m.entropy), 90),
    colorP10: percentile(values((m) => m.colorfulness), 10),
    colorP90: percentile(values((m) => m.colorfulness), 90)
  }
}

function qualityScore(m: Metrics, stats: Stats): number {
  const sharpReject = Math.max(stats.sharpP10, stats.sharpP25 * 0.55)
  if (isObviousBlackOrWhite(m)) return -1
  if (!obviousGoodNight(m, stats) && m.sharpness < sharpReject) return -1
  const sharp = normalizeByPercentile(m.sharpness, stats.sharpP10, stats.sharpP90)
  const contrast = normalizeByPercentile(m.contrast, stats.contrastP10, stats.contrastP90)
  const edge = normalizeByPercentile(m.edgeDensity, stats.edgeP10, stats.edgeP90)
  const entropy = normalizeByPercentile(m.entropy, stats.entropyP10, stats.entropyP90)
  const color = normalizeByPercentile(m.colorfulness, stats.colorP10, stats.colorP90)
  const brightness = 100 * Math.exp(-((m.brightnessMean - 128) ** 2) / (2 * 80 ** 2))
  return clamp(0.4 * sharp + 0.15 * contrast + 0.15 * edge + 0.15 * entropy + 0.05 * brightness + 0.1 * color, 0, 100)
}

// ---------- V2.0 P3: Flash / Fade / Motion Blur detection ----------

/** Detect if a frame is likely a flash frame by comparing brightness with neighbors. */
function detectFlash(samples: Array<{ timestamp: number; metrics: Metrics }>, idx: number): number {
  if (idx < 1 || idx >= samples.length - 1) return 0
  const prev = samples[idx - 1].metrics.brightnessMean
  const curr = samples[idx].metrics.brightnessMean
  const next = samples[idx + 1].metrics.brightnessMean
  if (curr > prev * 2.5 && curr > next * 2.5 && curr > 200) {
    if (samples[idx].metrics.sharpness < samples[idx - 1].metrics.sharpness * 0.4) return 40
    return 25
  }
  return 0
}

/** Detect if a frame is in a fade region (continuous brightness ramp across a window of samples). */
function detectFade(samples: Array<{ timestamp: number; metrics: Metrics }>, idx: number): number {
  const window = 4
  if (idx < window || idx >= samples.length - window) return 0
  const brightnesses: number[] = []
  for (let i = idx - window; i <= idx + window; i++) brightnesses.push(samples[i].metrics.brightnessMean)
  let rising = 0
  let falling = 0
  for (let i = 1; i < brightnesses.length; i++) {
    const diff = brightnesses[i] - brightnesses[i - 1]
    if (diff > 8) rising++
    if (diff < -8) falling++
  }
  if (rising >= 5 || falling >= 5) return 20
  return 0
}

/** Detect motion blur: current frame much less sharp than neighbors. */
function detectMotionBlur(samples: Array<{ timestamp: number; metrics: Metrics }>, idx: number, stats: Stats): number {
  if (idx < 1 || idx >= samples.length - 1) return 0
  const sPrev = samples[idx - 1].metrics.sharpness
  const sCurr = samples[idx].metrics.sharpness
  const sNext = samples[idx + 1].metrics.sharpness
  if (sCurr < stats.sharpP20 && (sPrev > sCurr * 1.5 || sNext > sCurr * 1.5)) return 25
  return 0
}

/** Compute transition penalty based on distance to nearest scene cut. */
function transitionPenalty(timestamp: number, scenePoints: { timestamp: number }[]): number {
  if (!scenePoints.length) return 0
  let minDist = Infinity
  for (const sp of scenePoints) {
    const dist = Math.abs(timestamp - sp.timestamp)
    if (dist < minDist) minDist = dist
  }
  if (minDist < 0.2) return 30
  if (minDist < 0.4) return 15
  return 0
}

function phash(buf: Buffer): string {
  const w = 32
  const h = 32
  const small = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    const sy = Math.floor((y / h) * ANALYSIS_HEIGHT)
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x / w) * ANALYSIS_WIDTH)
      const i = (sy * ANALYSIS_WIDTH + sx) * 3
      small[y * w + x] = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]
    }
  }
  const coeffs: number[] = []
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          sum +=
            small[y * w + x] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * w)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * h))
        }
      }
      coeffs.push(sum)
    }
  }
  const withoutDc = coeffs.slice(1)
  const avg = withoutDc.reduce((a, b) => a + b, 0) / withoutDc.length
  let bits = ''
  for (const c of coeffs) bits += c > avg ? '1' : '0'
  return bits
}

export function hamming(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let d = Math.abs(a.length - b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++
  return d
}

function adaptivePHashThreshold(candidates: Candidate[]): number {
  const sorted = [...candidates].sort((a, b) => a.timestamp - b.timestamp)
  const distances: number[] = []
  for (let i = 1; i < sorted.length; i++) distances.push(hamming(sorted[i - 1].pHash, sorted[i].pHash))
  return clamp(Math.max(4, percentile(distances, 10) || 6), 4, 10)
}

function minSpacing(duration: number, requestedCount: number): number {
  const segment = duration / requestedCount
  if (segment < 60) return Math.max(3, 0.2 * segment)
  return 0.35 * segment
}

function violatesHardConstraints(c: Candidate, selected: Candidate[], duration: number, requestedCount: number, phashThreshold: number): boolean {
  const spacing = minSpacing(duration, requestedCount)
  for (const s of selected) {
    if (Math.abs(c.timestamp - s.timestamp) < spacing) return true
    if (hamming(c.pHash, s.pHash) <= phashThreshold) return true
  }
  return false
}

function selectFinal(candidates: Candidate[], requestedCount: number, duration: number, phashThreshold: number): Candidate[] {
  const selected: Candidate[] = []
  const sorted = [...candidates].sort((a, b) => b.quality - a.quality)
  for (let i = 0; i < requestedCount; i++) {
    const start = (i * duration) / requestedCount
    const end = ((i + 1) * duration) / requestedCount
    const local = sorted.filter((c) => c.timestamp >= start && c.timestamp <= end)
    // v2.8.5 修复：从前 3 个最佳帧中随机选一个，而非总是选质量最高的，
    // 确保每次重新截帧得到不同的预览图（之前确定性选帧导致每次结果完全相同）
    const valid = local.filter((c) => !violatesHardConstraints(c, selected, duration, requestedCount, phashThreshold))
    const topK = valid.slice(0, 3)
    const pick = topK.length > 0 ? topK[Math.floor(Math.random() * topK.length)] : undefined
    if (pick) selected.push(pick)
  }
  // Second pass: expand segment search to fill remaining slots
  if (selected.length < requestedCount) {
    const expandRatio = 1 + 0.15 * (requestedCount - selected.length)
    for (let i = 0; i < requestedCount; i++) {
      const segLen = duration / requestedCount
      const center = (i + 0.5) * segLen
      const halfW = (segLen * expandRatio) / 2
      const start = Math.max(0, center - halfW)
      const end = Math.min(duration, center + halfW)
      const local = sorted.filter((c) => c.timestamp >= start && c.timestamp <= end && !selected.includes(c))
      const valid = local.filter((c) => !violatesHardConstraints(c, selected, duration, requestedCount, phashThreshold))
      const topK = valid.slice(0, 3)
      const pick = topK.length > 0 ? topK[Math.floor(Math.random() * topK.length)] : undefined
      if (pick) selected.push(pick)
    }
  }
  while (selected.length < requestedCount) {
    let best: Candidate | null = null
    let bestUtility = -Infinity
    for (const c of sorted) {
      if (selected.includes(c)) continue
      if (violatesHardConstraints(c, selected, duration, requestedCount, phashThreshold)) continue
      const selectedPositions = selected.map((s) => s.timestamp / duration)
      const pos = c.timestamp / duration
      const coverage = selectedPositions.length
        ? 100 * clamp(Math.min(...selectedPositions.map((p) => Math.abs(pos - p))) * requestedCount, 0, 1)
        : 100
      const dMin = selected.length ? Math.min(...selected.map((s) => hamming(c.pHash, s.pHash))) : 64
      const novelty = 100 * clamp(dMin / 16, 0, 1)
      const dt = selected.length ? Math.min(...selected.map((s) => Math.abs(c.timestamp - s.timestamp))) : duration
      const temporalPenalty = dt >= duration / requestedCount ? 0 : 20 * (1 - dt / (duration / requestedCount))
      const duplicatePenalty = dMin <= phashThreshold ? 50 : dMin <= phashThreshold + 2 ? 20 : 0
      const utility = 0.65 * c.quality + 0.2 * coverage + 0.15 * novelty - temporalPenalty - duplicatePenalty
      if (utility > bestUtility) {
        bestUtility = utility
        best = c
      }
    }
    if (!best) break
    selected.push(best)
  }
  return selected.sort((a, b) => a.timestamp - b.timestamp)
}

function reduceCandidates(candidates: Candidate[], requestedCount: number, duration: number): Candidate[] {
  const bucketCount = requestedCount * 2
  const buckets: Candidate[][] = Array.from({ length: bucketCount }, () => [])
  for (const c of candidates) {
    const idx = clamp(Math.floor((c.timestamp / duration) * bucketCount), 0, bucketCount - 1)
    buckets[idx].push(c)
  }
  return buckets.flatMap((b) => b.sort((a, c) => c.quality - a.quality).slice(0, PREVIEW_V2_DEFAULTS.candidatesPerBucket))
}

function classifyError(e: unknown): { code: string; message: string } {
  const message = (e as Error)?.message || String(e)
  if (/cancel/i.test(message)) return { code: 'CANCELLED', message }
  if (/ffprobe|probe/i.test(message)) return { code: 'PROBE_FAILED', message }
  if (/ffmpeg/i.test(message)) return { code: 'FFMPEG_ERROR', message }
  if (/cache|write|rename/i.test(message)) return { code: 'CACHE_WRITE_ERROR', message }
  return { code: 'UNKNOWN_ERROR', message }
}

async function runProcess(
  exe: string,
  args: string[],
  token: PreviewCancelToken,
  timeoutMs: number
): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  const release = await acquireFfmpeg(1)
  return new Promise((resolve, reject) => {
    const cleanup = () => { try { release() } catch {} }
    if (token.cancelled) {
      cleanup(); reject(new Error('cancelled'))
      return
    }
    const child = spawn(exe, args, { windowsHide: true })
    token.currentProcess = child
    const stdout: Buffer[] = []
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      cleanup(); reject(new Error(`ffmpeg timeout ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (c) => stdout.push(Buffer.from(c)))
    child.stderr.on('data', (c) => {
      if (stderr.length < 200_000) stderr += String(c)
    })
    child.on('error', (e) => {
      clearTimeout(timer); cleanup(); reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (token.currentProcess === child) token.currentProcess = undefined
      cleanup()
      resolve({ code, stdout: Buffer.concat(stdout), stderr })
    })
  })
}

/** 并发抽帧：需与全局 acquire 槽数对齐，避免内部排队 */
const SAMPLE_CONCURRENCY = 4
const SAMPLE_FRAME_TIMEOUT_MS = 15_000

/**
 * 从视频中并行抽取 N 个样本帧。
 * 相比旧的 `fps=X` 顺序解码整段视频（长视频可能要几分钟），
 * 并行 seek 每个时间点只解码 1 帧，长视频也只需几秒完成。
 */
async function sampleFrames(
  exe: string,
  videoPath: string,
  duration: number,
  count: number,
  token: PreviewCancelToken
): Promise<Array<{ timestamp: number; frame: Buffer; metrics: Metrics }>> {
  // 均匀分布时间点（跳过开头 2s 和结尾 2s，避免黑场/片尾）
  // v2.8.5：每次重新截帧加入 ±70% 间隔的随机偏移，确保每次截取的预览图不同
  const margin = Math.min(2, duration * 0.01)
  const timestamps: number[] = []
  const baseInterval = count === 1 ? 0 : (duration - margin * 2) / (count - 1)
  const jitter = baseInterval * 0.7
  for (let i = 0; i < count; i++) {
    const base = count === 1 ? duration / 2 : margin + (i / (count - 1)) * (duration - margin * 2)
    const offset = (Math.random() - 0.5) * 2 * jitter
    timestamps.push(clamp(base + offset, margin, duration - margin))
  }

  const vf = `scale=${ANALYSIS_WIDTH}:${ANALYSIS_HEIGHT}:force_original_aspect_ratio=decrease,pad=${ANALYSIS_WIDTH}:${ANALYSIS_HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=rgb24`

  // 并发限制：分批执行
  const results: Array<{ timestamp: number; frame: Buffer }> = []
  for (let start = 0; start < timestamps.length; start += SAMPLE_CONCURRENCY) {
    if (token.cancelled) break
    const batch = timestamps.slice(start, start + SAMPLE_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (ts) => {
        if (token.cancelled) return null
        const args = [
          '-v', 'error',
          '-ss', ts.toFixed(3),
          '-i', videoPath,
          '-vf', vf,
          '-frames:v', '1',
          '-f', 'rawvideo',
          '-pix_fmt', 'rgb24',
          '-'
        ]
        try {
          const r = await runProcess(exe, args, token, SAMPLE_FRAME_TIMEOUT_MS)
          if (r.code !== 0 || r.stdout.length < ANALYSIS_BYTES) return null
          return { timestamp: ts, frame: r.stdout.subarray(0, ANALYSIS_BYTES) }
        } catch {
          return null
        }
      })
    )
    for (const r of batchResults) if (r) results.push(r)
  }

  return results.map((r) => ({ ...r, metrics: analyzeFrame(r.frame) }))
}

async function detectScenes(exe: string, videoPath: string, mode: PreviewQualityMode, token: PreviewCancelToken): Promise<ScenePoint[]> {
  const threshold = mode === 'FAST' ? 14 : mode === 'HIGH' ? 10 : 12
  const args = ['-hide_banner', '-nostats', '-i', videoPath, '-vf', `scdet=threshold=${threshold}`, '-an', '-f', 'null', '-']
  const r = await runProcess(exe, args, token, 120_000)
  const scenes: ScenePoint[] = []
  const regex = /lavfi\.scd\.score:\s*([0-9.]+).*?lavfi\.scd\.time:\s*([0-9.]+)/gs
  for (const m of r.stderr.matchAll(regex)) {
    scenes.push({ score: Number(m[1]), timestamp: Number(m[2]) })
  }
  return scenes
}

function clusterScenes(points: ScenePoint[]): SceneCluster[] {
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp)
  const clusters: SceneCluster[] = []
  for (const p of sorted) {
    const last = clusters[clusters.length - 1]
    if (!last || p.timestamp - last.end >= PREVIEW_V2_DEFAULTS.sceneClusterGap) {
      clusters.push({ start: p.timestamp, end: p.timestamp, points: [p] })
    } else {
      last.end = p.timestamp
      last.points.push(p)
    }
  }
  return clusters
}

async function extractOriginalFrame(
  exe: string,
  video: Video,
  timestamp: number,
  out: string,
  token: PreviewCancelToken
): Promise<void> {
  const tmp = `${out}.tmp.jpg`
  // v2.8.5 修复：用 input seeking（-ss 在 -i 前）保证速度，
  // output seeking 太慢导致 8 路并发时后面的帧全部超时失败产生坏图。
  // 随机性由采样时间点的 ±70% 偏移 + 选帧随机化保证，不需要逐帧精确 seek。
  const args = ['-y', '-ss', timestamp.toFixed(3), '-i', video.path, '-frames:v', '1', '-q:v', String(PREVIEW_V2_DEFAULTS.jpegQuality), tmp]
  const r = await runProcess(exe, args, token, 60_000)
  if (r.code !== 0) throw new Error(`ffmpeg extract failed: ${r.stderr.slice(-500)}`)
  await fs.rename(tmp, out)
}

export function sourceFingerprint(video: Video): string {
  return `${video.path}|${video.fileSize ?? 0}|${video.contentHash ?? ''}`
}

export async function generatePreviewV2(
  video: Video,
  settings: Settings,
  opts: {
    requestedCount: number
    qualityMode: PreviewQualityMode
    token: PreviewCancelToken
    onProgress?: (progress: number, generatedCount?: number) => void
  }
): Promise<PreviewV2Result> {
  const t0 = Date.now()
  const timings: Record<string, number> = {}
  const mark = (name: string, from: number) => {
    timings[name] = Date.now() - from
    return Date.now()
  }
  const exe = await resolveFfmpegExe(settings)
  if (!exe) throw new Error('ffmpeg missing')
  let t = Date.now()
  const info: TechInfo | null = video.techInfo ?? (await probeVideo(video.path, settings))
  t = mark('probeTime', t)
  const duration = info?.durationSec ?? video.durationSec ?? 0
  if (duration <= 0) throw new Error('probe failed: duration <= 0')
  const requestedCount = clamp(Math.floor(opts.requestedCount || 20), 1, 200)
  const params = samplingParams(duration, requestedCount, opts.qualityMode)
  const samples = await sampleFrames(exe, video.path, duration, params.count, opts.token)
  t = mark('samplingTime', t)
  const stats = buildStats(samples.map((s) => s.metrics))
  let coarseCandidates = 0
  const coarse: Candidate[] = []
  for (const s of samples) {
    const quality = qualityScore(s.metrics, stats)
    if (quality < 0) continue
    coarse.push({ timestamp: s.timestamp, metrics: s.metrics, quality, source: 'COARSE', pHash: phash(s.frame), frame: s.frame })
  }
  coarseCandidates = coarse.length
  t = mark('analysisTime', t)
  opts.onProgress?.(0.35, 0)
  // 场景检测：scdet 需要顺序解码整段视频（长视频 120s+）。
  // STANDARD/FAST 模式完全跳过，用采样帧的质量评分+flash/fade/motion blur 惩罚已经足够选出好帧。
  // 只有 HIGH 模式才跑 scdet，作为辅助候选。
  const shouldUseScdet = opts.qualityMode === 'HIGH'
  const scenes = shouldUseScdet
    ? await detectScenes(exe, video.path, opts.qualityMode, opts.token).catch(() => [])
    : []
  let rejectedBlackWhite = 0
  let rejectedBlur = 0
  for (const s of samples) {
    const m = s.metrics
    if (isObviousBlackOrWhite(m)) rejectedBlackWhite++
    else if (!obviousGoodNight(m, stats) && m.sharpness < Math.max(stats.sharpP10, stats.sharpP25 * 0.55)) rejectedBlur++
  }
  const clusters = clusterScenes(scenes).slice(0, requestedCount * 8)
  t = mark('sceneTime', t)
  const sceneCandidates: Candidate[] = []
  for (const cluster of clusters) {
    if (opts.token.cancelled) throw new Error('cancelled')
    const center = (cluster.start + cluster.end) / 2
    const local = samples
      .filter((s) => Math.abs(s.timestamp - center) <= (opts.qualityMode === 'HIGH' ? 3 : opts.qualityMode === 'FAST' ? 1.5 : 2))
      .map((s) => {
        const base = qualityScore(s.metrics, stats)
        const dist = Math.min(...cluster.points.map((p) => Math.abs(p.timestamp - s.timestamp)))
        const transitionPenalty = dist < 0.2 ? 30 : dist < 0.4 ? 15 : 0
        const quality = clamp(base + 7 - transitionPenalty, 0, 100)
        return { timestamp: s.timestamp, metrics: s.metrics, quality, source: 'SCENE' as const, pHash: phash(s.frame), frame: s.frame }
      })
      .filter((c) => c.quality > 0)
      .sort((a, b) => b.quality - a.quality)
      .slice(0, 2)
    sceneCandidates.push(...local)
  }
  // Apply flash / fade / motion blur penalties to all coarse candidates using sample indices
  const sampleIndex = new Map<number, number>()
  for (let i = 0; i < samples.length; i++) sampleIndex.set(samples[i].timestamp, i)
  for (const c of coarse) {
    const idx = sampleIndex.get(c.timestamp)
    if (idx === undefined) continue
    const flashPenalty = detectFlash(samples, idx)
    const fadePenalty = detectFade(samples, idx)
    const motionPenalty = detectMotionBlur(samples, idx, stats)
    const totalPenalty = flashPenalty + fadePenalty + motionPenalty
    if (flashPenalty >= 40) {
      c.quality = -1 // reject
    } else {
      c.quality = clamp(c.quality - totalPenalty, 0, 100)
    }
  }
  // Filter rejected flash frames
  const validCoarse = coarse.filter((c) => c.quality >= 0)
  const merged = [...validCoarse, ...sceneCandidates]
  const reduced = reduceCandidates(merged, requestedCount, duration)
  const phashThreshold = adaptivePHashThreshold(reduced)
  const selected = selectFinal(reduced, requestedCount, duration, phashThreshold)
  t = mark('selectionTime', t)
  opts.onProgress?.(0.7, 0)
  const outDir = previewCacheDir(video.id)
  await fs.mkdir(outDir, { recursive: true })
  // 只清理残留的 .tmp.jpg（上次中断留下的临时文件），
  // 不删除旧的 .jpg——新帧用 .tmp.jpg + rename 原子覆盖，失败时旧图仍在，避免坏图
  const oldFiles = await fs.readdir(outDir).catch(() => [])
  await Promise.all(
    oldFiles
      .filter((f) => f.endsWith('.tmp.jpg'))
      .map((f) => fs.unlink(path.join(outDir, f)).catch(() => {}))
  )
  // 并行抽取所有选好的帧（每个只是 seek+解码1帧，互不影响）
  // v2.8.5：并发从 8 降到 4，避免高并发下 ffmpeg 争抢 IO/CPU 导致超时产生坏图
  const EXTRACT_CONCURRENCY = 4
  const tasks: Array<() => Promise<PreviewFrameMeta | null>> = selected.map((c, i) => async () => {
    if (opts.token.cancelled) return null
    const out = framePath(video.id, i + 1)
    await extractOriginalFrame(exe, video, c.timestamp, out, opts.token)
    const dim = await probeImage(out, settings).catch(() => null)
    return {
      index: i + 1,
      timestamp: c.timestamp,
      filePath: out,
      width: dim?.width ?? info?.width,
      height: dim?.height ?? info?.height,
      qualityScore: Math.round(c.quality * 100) / 100,
      sharpness: Math.round(c.metrics.sharpness * 100) / 100,
      pHash: c.pHash,
      algorithmVersion: PREVIEW_ALGORITHM_VERSION,
      createdAt: Date.now()
    }
  })
  const frames: PreviewFrameMeta[] = []
  for (let start = 0; start < tasks.length; start += EXTRACT_CONCURRENCY) {
    if (opts.token.cancelled) break
    const batch = tasks.slice(start, start + EXTRACT_CONCURRENCY)
    const batchResults = await Promise.all(batch.map((t) => t()))
    for (const r of batchResults) if (r) frames.push(r)
    opts.onProgress?.(0.7 + 0.3 * (frames.length / Math.max(1, selected.length)), frames.length)
  }
  mark('extractionTime', t)
  timings.totalTime = Date.now() - t0
  const manifest: PreviewManifest = {
    mediaId: video.id,
    algorithmVersion: PREVIEW_ALGORITHM_VERSION,
    requestedCount,
    generatedCount: frames.length,
    generatedAt: Date.now(),
    sourceFingerprint: sourceFingerprint(video),
    width: info?.width,
    height: info?.height,
    frames
  }
  await fs.writeFile(path.join(outDir, 'preview_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  console.log('[preview-v2] === Preview V2 Debug ===')
  console.log(`  Video: ${video.fileName}`)
  console.log(`  Duration: ${duration.toFixed(1)}s`)
  console.log(`  Resolution: ${info?.width ?? '?'}x${info?.height ?? '?'}`)
  console.log(`  Requested: ${requestedCount}`)
  console.log(`  Sampling: interval=${params.interval.toFixed(1)}s samples=${samples.length}`)
  console.log(`  Sharpness: P10=${stats.sharpP10.toFixed(1)} P25=${stats.sharpP25.toFixed(1)} P50=${stats.sharpP50.toFixed(1)} P75=${stats.sharpP75.toFixed(1)} P90=${stats.sharpP90.toFixed(1)}`)
  console.log(`  Rejected: black/white=${rejectedBlackWhite} blur=${rejectedBlur}`)
  console.log(`  Scenes: detected=${scenes.length} clusters=${clusters.length}`)
  console.log(`  Candidates: coarse=${coarseCandidates} scene=${sceneCandidates.length} merged=${validCoarse.length + sceneCandidates.length} reduced=${reduced.length}`)
  console.log(`  PHash threshold: ${phashThreshold}`)
  console.log(`  Selected: ${selected.length}`)
  for (const f of frames) console.log(`    [${String(f.index).padStart(3,'0')}] t=${f.timestamp.toFixed(1)}s q=${f.qualityScore.toFixed(1)} sharp=${f.sharpness.toFixed(1)}`)
  console.log(`  Performance: probe=${timings.probeTime}ms sampling=${timings.samplingTime}ms analysis=${timings.analysisTime}ms scene=${timings.sceneTime}ms selection=${timings.selectionTime}ms extraction=${timings.extractionTime}ms total=${timings.totalTime}ms`)
  console.log('[/preview-v2] ========================')
  return {
    manifest,
    coverPath: frames[0]?.filePath,
    debug: {
      duration,
      width: info?.width,
      height: info?.height,
      fps: info?.fps,
      sampleInterval: params.interval,
      sampleCount: samples.length,
      sceneCount: scenes.length,
      clusterCount: clusters.length,
      coarseCandidates,
      sceneCandidates: sceneCandidates.length,
      reducedCandidates: reduced.length,
      phashThreshold,
      selectedCount: selected.length,
      timings
    }
  }
}

/** Generate a quick cover (single frame) from the video using fast sampling. */
export async function generateQuickCover(
  video: Video,
  settings: Settings,
  token: PreviewCancelToken
): Promise<string | null> {
  const exe = await resolveFfmpegExe(settings)
  if (!exe) return null
  try {
    const info: TechInfo | null = video.techInfo ?? (await probeVideo(video.path, settings))
    const duration = info?.durationSec ?? video.durationSec ?? 0
    if (duration <= 0) return null
    const fastParams = samplingParams(duration, 1, 'FAST')
    const count = Math.min(fastParams.count, 80)
    const samples = await sampleFrames(exe, video.path, duration, count, token)
    if (token.cancelled) return null
    const stats = buildStats(samples.map((s) => s.metrics))
    let best: { timestamp: number; quality: number } | null = null
    for (const s of samples) {
      if (token.cancelled) return null
      const quality = qualityScore(s.metrics, stats)
      if (quality < 0) continue
      if (!best || quality > best.quality) best = { timestamp: s.timestamp, quality }
    }
    if (!best) return null
    const outDir = previewCacheDir(video.id)
    await fs.mkdir(outDir, { recursive: true })
    const coverPath = path.join(outDir, 'cover.jpg')
    await extractOriginalFrame(exe, video, best.timestamp, coverPath, token)
    if (token.cancelled) return null
    return coverPath
  } catch {
    return null
  }
}

export { classifyError, MAX_RETRY }
