import type { MovieMeta, Settings } from '../../shared/types'
import type { MovieQuery } from '../../shared/code'
import { proxyFetch, UA } from './proxy'
import { cacheRemoteImage, cleanGenreName } from './image-util'

/**
 * 中文维基百科 —— 免 API key 的电影兜底数据源。
 *
 * 对华语 / 港产老片（TMDb 收录不全的那类）覆盖较好：
 * - 搜索：MediaWiki `action=query&list=search`
 * - 摘要：REST `page/summary`（含 originalimage 海报 + extract 剧情摘要）
 * - 结构化字段：`action=parse&prop=wikitext` 解析信息框（導演/主演/片長/類型/製片商）
 *
 * 注意：维基百科在主网被墙，必须走代理（本应用已支持）。
 * 与其它数据源约定一致：无结果返回 null（不抛），网络/接口异常 throw 由 fetch-meta 统计。
 */

const API = 'https://zh.wikipedia.org/w/api.php'
const REST = 'https://zh.wikipedia.org/api/rest_v1/page'

export function hasWikipediaKey(_settings: Settings): boolean {
  return true
}

interface WikiSearchResponse {
  query?: { search?: { title?: string; snippet?: string }[] | null } | null
}

interface WikiSummary {
  type?: string
  title?: string
  description?: string
  extract?: string
  originalimage?: { source?: string } | null
  thumbnail?: { source?: string } | null
  content_urls?: { desktop?: { page?: string } } | null
}

interface WikiParseResponse {
  parse?: { wikitext?: { '*': string } | null } | null
}

const FILM_RE = /(電影|电影|影片|領銜主演|主演|執導|执导)/

/** 通用请求（带 15s 超时），失败抛错交给上层统计 */
async function wikiGet<T>(url: string, settings: Settings): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await proxyFetch(
      url,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal },
      settings
    )
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** 搜索候选条目（先加" 電影"提高命中电影的概率） */
async function searchCandidates(query: string, settings: Settings): Promise<string[]> {
  const run = async (q: string): Promise<string[]> => {
    const url = `${API}?action=query&list=search&srlimit=5&format=json&utf8=1&srsearch=${encodeURIComponent(q)}`
    const data = await wikiGet<WikiSearchResponse>(url, settings)
    return (data.query?.search || []).map((s) => s.title || '').filter(Boolean)
  }
  const first = await run(query)
  if (first.length > 0) return first
  return run(`${query} 電影`)
}

/** 取条目摘要（含海报） */
async function getSummary(title: string, settings: Settings): Promise<WikiSummary | null> {
  try {
    return await wikiGet<WikiSummary>(`${REST}/summary/${encodeURIComponent(title)}`, settings)
  } catch {
    return null
  }
}

/** 取条目 wikitext（信息框） */
async function getWikitext(title: string, settings: Settings): Promise<string> {
  try {
    const url = `${API}?action=parse&prop=wikitext&format=json&redirects=1&page=${encodeURIComponent(title)}`
    const data = await wikiGet<WikiParseResponse>(url, settings)
    return data.parse?.wikitext?.['*'] || ''
  } catch {
    return ''
  }
}

/** 去掉 wiki 标记，保留纯文本（<br> 视为列表分隔符，避免演员名被粘成一串） */
function stripWiki(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '、')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[、，,;；]{2,}/g, '、')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 从信息框取参数（兼容中英文参数名） */
function findParam(wikitext: string, names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(`\\|\\s*${name}\\s*=([^\\n]*)`, 'i')
    const m = wikitext.match(re)
    const val = m?.[1] ? stripWiki(m[1]) : ''
    if (val) return val
  }
  return undefined
}

/** 把 "A、B、C" / "A和B" 这类列表拆成数组 */
function splitList(raw?: string): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const part of raw.split(/[、,，;；/／|]+/)) {
    for (const seg of part.split(/(?:和|及|與|与)/)) {
      const name = stripWiki(seg)
        .replace(/^[·・\s]+|[·・\s]+$/g, '')
        .replace(/等$/, '')
        .trim()
      if (name && name.length <= 20) out.push(name)
    }
  }
  return out
}

/** 判断搜索结果是不是电影条目 */
function isFilm(summary: WikiSummary | null, title: string): boolean {
  if (!summary) return false
  const text = `${summary.description || ''} ${summary.extract || ''}`
  if (FILM_RE.test(text)) return true
  return /(電影|电影)/.test(title)
}

/** 从摘要 extract / 信息框里抽取年份（上映日期多在 {{film date|1993|..}} 模板里） */
function extractYear(summary: WikiSummary, wikitext: string): string | undefined {
  const tpl = wikitext.match(/\{\{\s*(?:film date|start date|film_date|上映日期)\s*\|\s*(\d{4})/i)
  if (tpl) return tpl[1]
  const fromBox = findParam(wikitext, ['上映日期', '上映日', 'released', '發行日期', '发行日期', '首映'])
  const m1 = fromBox?.match(/(\d{4})/)
  if (m1) return m1[1]
  const m2 = (summary.extract || '').match(/(\d{4})\s*年/)
  return m2?.[1]
}

function extractDirector(summary: WikiSummary, wikitext: string): string | undefined {
  const fromBox = findParam(wikitext, ['導演', '导演', 'director'])
  if (fromBox) return splitList(fromBox)[0]
  const m = (summary.extract || '').match(/由([^，。、]{2,12}?)(?:執導|执导|導演|导演)/)
  return m?.[1]
}

/** 从剧情摘要里抽主演：先按标点切句，避免把"由…執導，"整段吞进来 */
function castFromText(text: string): string[] {
  for (const seg of text.split(/[，,。；;]/)) {
    const m = seg.match(/(.+?)(?:等)?(?:領銜主演|领衔主演|主演)/)
    if (m) {
      const names = splitList(m[1])
      if (names.length > 0) return names
    }
  }
  return []
}

function extractCast(summary: WikiSummary, wikitext: string): string[] {
  const fromBox = findParam(wikitext, ['主演', '領銜主演', '领衔主演', 'starring'])
  const fromBoxList = splitList(fromBox)
  if (fromBoxList.length > 0) return fromBoxList
  return castFromText(summary.extract || '')
}

function extractDuration(summary: WikiSummary, wikitext: string): string | undefined {
  const fromBox = findParam(wikitext, ['片長', '片长', 'runtime', '时长', '時長'])
  if (fromBox) {
    const m = fromBox.match(/(\d{1,3})\s*(?:分鐘|分钟|分)?/)
    if (m) return `${m[1]}分钟`
  }
  const m = (summary.extract || '').match(/(\d{2,3})\s*(?:分鐘|分钟)/)
  return m ? `${m[1]}分钟` : undefined
}

function extractGenres(summary: WikiSummary, wikitext: string): string[] {
  const list = splitList(findParam(wikitext, ['類型', '类型', 'genre', '片種', '片种']))
    .map((g) => cleanGenreName(g))
    .filter((g): g is string => !!g)
  if (list.length > 0) return list
  // 信息框常没有类型字段：从「香港驚悚電影」这类描述里猜一个
  const text = `${summary.description || ''} ${summary.extract || ''}`
  const m = text.match(/(?:香港|臺灣|台湾|中國|中国|日本|韓國|韩国|美國|美国)([\u4e00-\u9fa5]{2,4})電影/)
  const g = m ? cleanGenreName(m[1]) : null
  return g ? [g] : []
}

function extractStudio(wikitext: string): string | undefined {
  return splitList(
    findParam(wikitext, [
      '製片商',
      '制片商',
      '出品公司',
      'production_company',
      'production company',
      '製作公司',
      '制作公司',
      'studio',
      '發行商',
      '发行商'
    ])
  )[0]
}

/** v2.8.5：从全页 wikitext 中提取剧情章节内容（兼容多种章节命名，保留段落换行） */
function extractPlotSection(wikitext: string): string | undefined {
  const sectionNames = ['剧情', '剧情简介', '故事大纲', '故事大綱', '故事梗概', '情节', '內容簡介', '内容简介', '劇情', '劇情簡介']
  for (const name of sectionNames) {
    const re = new RegExp('==\\s*' + name + '\\s*==\\s*([\\s\\S]*?)(?=\\r?\\n==|$)')
    const m = wikitext.match(re)
    if (m) {
      const raw = m[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<ref[^>]*\/>/gi, '')
        .replace(/<ref[\s\S]*?<\/ref>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{\{[^{}]*\}\}/g, '')
        .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '')
        .replace(/\[\[([^\]]+)\]\]/g, '')
        .replace(/'''?/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim()
      if (raw && raw.length > 20) return raw
    }
  }
  return undefined
}

function buildDetail(summary: WikiSummary, wikitext: string, fallbackTitle: string): MovieMeta {
  const title = (summary.title || fallbackTitle).replace(/\s*[（(](電影|电影)[)）]\s*$/, '')
  const year = extractYear(summary, wikitext)
  const cast = extractCast(summary, wikitext)
  const coverRaw = summary.originalimage?.source || summary.thumbnail?.source
  const cover = coverRaw ? coverRaw.split('?')[0] : undefined

  return {
    uid: title,
    externalId: title,
    title,
    cover,
    date: year ? `${year}-01-01` : undefined,
    duration: extractDuration(summary, wikitext),
    director: extractDirector(summary, wikitext),
    studio: extractStudio(wikitext),
    series: undefined,
    rating: undefined,
    genres: extractGenres(summary, wikitext),
    actors: cast,
    cast,
    synopsis: extractPlotSection(wikitext) || summary.extract || undefined,
    parseVer: 2,
    source: 'wikipedia',
    fetchedAt: Date.now()
  }
}

/** 按电影名称抓取维基百科详情 */
export async function fetchWikipediaDetail(
  q: MovieQuery,
  settings: Settings,
  onError?: (m: string) => void,
  _manual = false
): Promise<MovieMeta | null> {
  const query = q.query.trim()
  if (!query) {
    onError?.('电影名称为空')
    return null
  }

  const candidates = await searchCandidates(query, settings)
  if (candidates.length === 0) {
    onError?.('维基百科未匹配到电影')
    return null
  }

  for (const title of candidates.slice(0, 4)) {
    const summary = await getSummary(title, settings)
    if (!isFilm(summary, title)) continue
    const wikitext = await getWikitext(title, settings)
    const detail = buildDetail(summary as WikiSummary, wikitext, query)

    // 有年份且明显不符 → 尝试下一个候选（避免命中同名小说/续集）
    if (q.year && detail.date && !detail.date.startsWith(String(q.year))) continue

    console.log(`[wikipedia] ${query} 命中「${detail.title}」`)
    if (detail.cover) {
      const local = await cacheRemoteImage(detail.cover, `wikipedia-cover-${detail.uid}`, settings, 'https://zh.wikipedia.org')
      detail.cover = local || undefined
    }
    return detail
  }

  onError?.('维基百科未匹配到电影')
  return null
}
