import type { DisplayEntry } from '../../../shared/types'

/** lm:// URL 结果缓存（同一路径只编码一次，大库滚动时避免重复 base64） */
const posterUrlCache = new Map<string, string>()

/**
 * 把本地绝对路径构造成 lm:// 协议 URL（主进程 lm:// 协议处理器返回图片）；远程 URL 直接透传。
 * @param version 封面缓存失效版本号：手动设为封面后文件内容变了但路径不变，
 *                传一个自增版本号让 URL 带 ?v=N，强制 Chromium 重新请求（主进程只解析 pathname，query 被忽略）
 */
export function posterUrl(posterPath?: string, version?: number | string): string | null {
  if (!posterPath) return null
  if (/^https?:\/\//.test(posterPath)) return posterPath
  // 已经转换好的 lm:// URL 直接透传，避免详情页 zoom 浮层再次调用时被二次 base64
  if (/^lm:\/\//.test(posterPath)) return posterPath
  const cacheKey = version != null ? `${posterPath}\u0000v${version}` : posterPath
  const cached = posterUrlCache.get(cacheKey)
  if (cached) return cached
  const bytes = new TextEncoder().encode(posterPath)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  const b64 = btoa(bin)
  const url = `lm://poster/${encodeURIComponent(b64)}${version != null ? `?v=${version}` : ''}`
  if (posterUrlCache.size > 5000) posterUrlCache.clear() // 防无限增长
  posterUrlCache.set(cacheKey, url)
  return url
}

/**
 * 根据字符串生成一个稳定、素雅的 HSL 色值（用于演员缺头像时的名字色块）。
 * 饱和度 / 亮度固定在中等偏低区间，避免过于抢眼；同名字永远得到同一颜色。
 */
export function stringToMutedColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 35% 58%)`
}

/** 获取条目在列表/搜索/排序中应使用的「最新标题」：数据源标题 > 视频标题 > 去扩展名文件名 > 条目标题 > code */
export function displayTitle(entry: DisplayEntry): string {
  return (
    entry.video?.meta?.title ||
    entry.video?.title ||
    (entry.video?.fileName ? entry.video.fileName.replace(/\.[^./\\]+$/, '') : undefined) ||
    entry.title ||
    entry.code
  )
}

/**
 * 解析一个条目的最佳封面路径（与 EntryCard 展示优先级一致）。
 * 优先级：手动设的封面(manual) > 非截帧 posterPath > ffmpeg posterPath > meta.cover。
 * v2.3.3 修复：meta.cover 常指向已失效的文件（数据源-cover-*.jpg 下载失败/被清理），
 * 若 cover 优先于存在的 posterPath，相关推荐会返回 404 路径导致占位图。posterPath（100% 有效）
 * 始终优先，cover 仅在 posterPath 缺失时补充。
 */
export function resolveEntryPoster(v?: { posterPath?: string; posterSource?: string; meta?: { cover?: string } }): string | null {
  if (!v) return null
  const manualPoster = v.posterSource === 'manual' && v.posterPath ? v.posterPath : null
  const realPoster =
    v.posterPath &&
    v.posterSource &&
    v.posterSource !== 'placeholder' &&
    v.posterSource !== 'manual'
      ? v.posterPath
      : null
  const detailCover = v.meta?.cover && !/^https?:\/\//.test(v.meta.cover) ? v.meta.cover : null
  return manualPoster ?? detailCover ?? realPoster ?? v.posterPath ?? null
}

export function formatSize(bytes?: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(sec?: number): string {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}小时${m}分`
  return `${m}分钟`
}

/** 取标题首字符作为占位图大字符 */
export function titleInitial(title: string): string {
  return (title ?? '').trim().charAt(0).toUpperCase() || '?'
}

/** 取占位图次要文本（标题/文件名，去前后空白，最多 12 字符）用于占位图小字 */
export function titleSecondary(code: string): string {
  const c = (code ?? '').trim()
  return c.slice(0, 12) || '?'
}

/** 取干净的展示标题：去除路径分隔符、扩展名，若为空则回退到文件名（无扩展名） */
export function pureTitle(title?: string, fileName?: string): string {
  let s = (title ?? '').trim()
  // 含路径时取最后一段
  if (/[\\/]/.test(s)) {
    s = s.replace(/^[\\/]+/, '').split(/[\\/]/).pop() ?? s
  }
  // 去掉扩展名
  s = s.replace(/\.[^.\\/]+$/, '')
  if (!s && fileName) {
    s = fileName.replace(/^[\\/]+/, '').split(/[\\/]/).pop() ?? fileName
    s = s.replace(/\.[^.\\/]+$/, '')
  }
  return s || '???'
}

/**
 * 大厂风格多层渐变占位背景（参考 Netflix/Disney+/Apple TV 卡片占位）。
 * 三层叠加：左上径向高光 + 右下径向阴影 + 主对角渐变，立体感强。
 */
export function placeholderGradient(code: string): string {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360
  // 邻近色相家族：主色 h、微移 h2（+40°）做自然过渡、补色 h3（+220°）做暗角
  const h2 = (h + 40) % 360
  const h3 = (h + 220) % 360
  // 大厂风格（参考 Netflix/TMDB/Disney+ 卡片占位）：
  // 甜点区 = 色相清晰（饱和度 40-48%）+ 中低亮度（15-36%）→ 不刺眼、不显脏
  // 主渐变同家族邻近色（h → h2），自然不生硬；左上高光亮于主色、右下暗角压场
  return (
    `radial-gradient(ellipse 90% 70% at 30% 18%, hsla(${h2},48%,36%,0.6), transparent 62%),` +
    `radial-gradient(ellipse 110% 90% at 80% 95%, hsla(${h3},42%,12%,0.65), transparent 60%),` +
    `linear-gradient(150deg, hsl(${h},44%,22%), hsl(${h2},46%,15%))`
  )
}
