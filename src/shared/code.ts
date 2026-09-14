/**
 * 影片识别工具：从文件名提取干净标题与年份。
 *
 * 用途：
 *  - extractTitle / extractTitleYear：扫描建库时把文件名清洗成展示标题、并识别年份
 *    （如 The.Matrix.1999.1080p.mkv → 标题 "The Matrix"、年份 1999）。
 *  - normTitleForMatch / titleMatches / extractMovieQuery：按片名 + 年份匹配片单与检索数据源。
 */

/**
 * 从文件名提取干净标题（去扩展名、去括号/方括号、去画质/编码等噪声词）。
 * 用于扫描建库时的展示标题，以及元数据搜索的查询词清洗。
 */
export function extractTitle(fileName: string): string {
  const noExt = (fileName ?? '').replace(/\.[^./\\]+$/, '')
  let s = noExt
    // 去方括号 / 圆括号 / 花括号（含全角）：[中字]、（双语）、【合集】等
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[\(（][^\)）]*[\)）]/g, ' ')
    .replace(/[\{【][^\}】]*[\}】]/g, ' ')
  // 去画质/编码/语言等噪声词
  s = s.replace(
    /\b(720p|1080p|2160p|4k|8k|hr|hd|fhd|uhd|web-?dl|blu-?ray|bdrip|dvdrip|hdtv|webrip|x264|x265|hevc|h\.?264|h\.?265|avc|10bit|8bit|yuv420p|ac3|aac|dts|truehd|atmos|chinese|english|双语|中英|双字|内封|外挂|合集|完整版|国语|粤语|普通话)\b/gi,
    ' '
  )
  return s.replace(/\s{2,}/g, ' ').trim()
}

/**
 * 从文件名提取标题与年份。
 * 例：The.Matrix.1999.1080p.mkv → { title: 'The Matrix', year: 1999 }
 * 年份识别用于更精准的元数据匹配与列表排序；识别不到时 year 为 undefined。
 */
export function extractTitleYear(fileName: string): { title: string; year?: number } {
  const noExt = (fileName ?? '').replace(/\.[^./\\]+$/, '')
  const title = extractTitle(fileName)
  const ym = noExt.match(/\b(19|20)\d{2}\b/)
  const year = ym ? parseInt(ym[0], 10) : undefined
  return { title, year }
}

/**
 * 归一化标题用于模糊匹配：小写，仅保留字母/数字/中日韩文字，去除空格与标点。
 * 供"片名+年份"去重匹配使用（电影没有externalId，统一按标题匹配）。
 */
export function normTitleForMatch(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
}

/**
 * 判断文件标题是否命中片单里的影片标题：
 * - 词边界约束：片单标题作为子串出现在文件标题中时，前后不能是字母/数字/汉字
 *   （避免 "The Matrix" 误命中 "The Matrix Reloaded"）；
 * - 年份约束：双方都能识别到年份且不一致时判不命中（避免同名不同年）；
 * - 兼容"文件名带年份、片单不带（或反之）"：自动拼接年份再试一次边界匹配。
 */
export function titleMatches(fileTitle: string, excelTitle: string): boolean {
  const ft = normTitleForMatch(fileTitle)
  const et = normTitleForMatch(excelTitle)
  if (!ft || !et) return false
  const fy = (fileTitle.match(/\b(19|20)\d{2}\b/) || [])[0]
  const ey = (excelTitle.match(/\b(19|20)\d{2}\b/) || [])[0]
  if (fy && ey && fy !== ey) return false
  const candidates = [et, et + (fy || ''), et + (ey || '')].filter(Boolean)
  for (const needle of candidates) {
    const i = ft.indexOf(needle)
    if (i < 0) continue
    const before = i > 0 ? ft[i - 1] : ''
    const after = ft[i + needle.length] ?? ''
    if (!/[a-z0-9\u4e00-\u9fff]/.test(before) && !/[a-z0-9\u4e00-\u9fff]/.test(after)) return true
  }
  return false
}

/**
 * 电影检索查询：从用户输入（文件名 / 手工输入 / externalId遗留）解析出
 * 「干净标题 + 年份 + 可选 IMDb / TMDB 直连 ID」。
 * 这是把"按externalId匹配"改造为"按片名/年份/ID 模糊匹配"的核心解析器。
 */
export interface MovieQuery {
  /** 清洗后的检索标题（从文件名/手工输入提取） */
  query: string
  /** 识别到的年份，用于收窄搜索（避免同名不同年） */
  year?: number
  /** 识别到的 IMDb ID（如 tt0133093），可直接查 OMDb 等 */
  imdbId?: string
  /** 识别到的 TMDB ID，可直接查 MovieDB 详情 */
  tmdbId?: number
}

/**
 * 解析电影检索查询（电影没有externalId，统一按片名/年份/ID 匹配）。
 * 优先级：IMDb/TMDB 直连 ID > 标题+年份。
 * - 标题：从文件名/手工输入清洗出干净标题与年份（The.Matrix.1999.1080p → The Matrix / 1999）；
 * - 标题中若含 `tt1234567` 或 `tmdb:12345` 这类直连 ID，单独抽出供数据源直查。
 */
export function extractMovieQuery(raw: string): MovieQuery {
  const s = (raw ?? '').trim()
  if (!s) return { query: '' }
  const imdbM = s.match(/\btt\d{6,}\b/i)
  const tmdbM = s.match(/tmdb[:\- ]?(\d{1,})/i)
  const imdbId = imdbM ? imdbM[0] : undefined
  const tmdbId = tmdbM ? Number(tmdbM[1]) : undefined
  const ty = extractTitleYear(s)
  return { query: ty.title || s, year: ty.year, imdbId, tmdbId }
}

/**
 * 视频的「本地真名」：以本地文件夹名为最高优先级，其次文件名、title、meta.title。
 *
 * 这是所有数据源搜索/抓取的唯一检索词来源，也是抓取过程 UI 浮层的显示名来源。
 * 理由：用户在资源管理器里重命名文件夹后，重新扫描/对账会同步 folderName 字段，
 * 因此搜索词始终跟随本地实际名字——不会出现"文件夹已改名但媒体库还拿旧标题去搜"的情况。
 *
 * 优先级说明：
 * - folderName：用户手动整理的文件夹名，最干净、最权威
 * - fileName：文件名（含扩展名，交给 extractMovieQuery 清洗）
 * - title：扫描时从文件名提取的标题 / Excel 片单标题
 * - meta.title：上次从数据源抓取到的标题（可能是外文/别名，不应优先于本地名）
 */
export function localCanonicalName(v: {
  folderName?: string | null
  fileName?: string | null
  title?: string | null
  meta?: { title?: string | null } | null
}): string {
  return v.folderName || v.fileName || v.title || v.meta?.title || ''
}
