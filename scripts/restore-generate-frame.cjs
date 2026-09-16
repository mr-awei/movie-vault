const fs = require('fs')
const p = 'E:/Movie Vault/src/main/lib/images.ts'
let s = fs.readFileSync(p, 'utf8')
const anchor = 'export interface ResolvedPoster {'
const gf = `
/** 解析 ffmpeg 可执行文件路径是否可用（优先级：设置 > 系统 PATH/常见目录 > 捆绑版兜底） */
async function ffmpegAvailable(settings: Settings): Promise<string | null> {
  return resolveFfmpegExe(settings)
}

async function generateFrame(video: Video, settings: Settings): Promise<string | null> {
  const exe = await ffmpegAvailable(settings)
  if (!exe) return null
  const out = frameCachePath(video)
  await fs.mkdir(postersCacheDir(), { recursive: true })
  // ffmpeg \`thumbnail\` 滤镜：分析 N 帧后自动选最具代表性的一帧（避免黑场/静帧/淡入淡出）。
  // 官方推荐做法：https://ffmpeg.org/ffmpeg-filters.html#thumbnail-1
  // n=100 覆盖常见短片；超长片（>2h）按比例放大 n 但封顶 200 避免太慢
  const dur = video.durationSec ?? 0
  const n = Math.min(200, Math.max(100, Math.floor(dur / 30)))
  const baseArgs = [
    '-y',
    '-i', video.path,
    '-vf', \`thumbnail=n=\${n},scale=480:-1\`,
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

`
const i = s.indexOf(anchor)
if (i === -1) { console.log('WARN anchor missing'); process.exit(1) }
s = s.slice(0, i) + gf + s.slice(i)
s = s.replace('export { postersCacheDir, frameCachePath, frameLog }', 'export { postersCacheDir, frameCachePath, generateFrame, frameLog }')
fs.writeFileSync(p, s)
console.log('generateFrame restored, len', s.length)
