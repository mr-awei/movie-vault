import type { MovieMeta, Settings } from '../../shared/types'
import type { MovieQuery } from '../../shared/code'
import { proxyFetch } from './proxy'
import { cacheRemoteImage, cleanGenreName } from './image-util'

/**
 * JustWatch —— 通过其公开 GraphQL 接口获取影视信息（免 API key）。
 *
 * 注意：旧的 REST 接口 `https://apis.justwatch.com/content/...` 已下线（一律 404），
 * 现改用 `https://apis.justwatch.com/graphql`（POST，GraphQL query + variables）。
 * 一次搜索即可拿到标题/年份/简介/海报/时长/类型/IMDb·TMDB id/演职员，无需二次请求。
 *
 * 与其它数据源约定一致：无结果返回 null（不抛），网络/接口异常 throw 由 fetch-meta 统计。
 */

const GRAPHQL = 'https://apis.justwatch.com/graphql'
const IMAGE_BASE = 'https://images.justwatch.com'
const JW_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
/** JustWatch 的国家/语言维度；华语片用 TW + zh 覆盖较好 */
const COUNTRY = 'TW'
const LANGUAGE = 'zh'

/** 检查是否可用（JustWatch 无需 API key） */
export function hasJustWatchKey(_settings: Settings): boolean {
  return true
}

/** JustWatch 返回英文类型名（technicalName），映射成与其它数据源一致的中文 */
const GENRE_ZH: Record<string, string> = {
  action: '动作',
  adventure: '冒险',
  animation: '动画',
  biography: '传记',
  comedy: '喜剧',
  crime: '犯罪',
  documentary: '纪录片',
  drama: '剧情',
  family: '家庭',
  fantasy: '奇幻',
  history: '历史',
  horror: '恐怖',
  music: '音乐',
  mystery: '悬疑',
  romance: '爱情',
  'science fiction': '科幻',
  'sci-fi': '科幻',
  sport: '运动',
  thriller: '惊悚',
  war: '战争',
  western: '西部',
  reality: '真人秀',
  'tv movie': '电视电影',
  adult: '成人'
}

interface JwCredit {
  name?: string | null
  role?: string | null
}

interface JwContent {
  title?: string | null
  originalReleaseYear?: number | null
  shortDescription?: string | null
  posterUrl?: string | null
  fullPath?: string | null
  runtime?: number | null
  genres?: { shortName?: string | null; technicalName?: string | null }[] | null
  externalIds?: { imdbId?: string | null; tmdbId?: string | null } | null
  credits?: JwCredit[] | null
}

interface JwNode {
  id?: string | null
  objectType?: string | null
  content?: JwContent | null
}

interface JwGraphqlResponse {
  data?: { popularTitles?: { edges?: { node?: JwNode | null }[] | null } | null } | null
  errors?: { message?: string }[] | null
}

const SEARCH_QUERY = `query GetSearchResults($country: Country!, $language: Language!, $first: Int!, $searchQuery: String!) {
  popularTitles(country: $country, first: $first, filter: { searchQuery: $searchQuery }) {
    edges {
      node {
        __typename
        id
        objectType
        content(country: $country, language: $language) {
          title
          originalReleaseYear
          shortDescription
          posterUrl
          fullPath
          runtime
          genres { shortName technicalName }
          externalIds { imdbId tmdbId }
          credits { name role }
        }
      }
    }
  }
}`

/** 搜索 JustWatch，返回最匹配的一部（优先年份命中） */
async function searchJustWatch(
  query: string,
  settings: Settings,
  onError?: (m: string) => void,
  year?: number
): Promise<JwNode | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await proxyFetch(
      GRAPHQL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': JW_UA
        },
        body: JSON.stringify({
          query: SEARCH_QUERY,
          variables: { country: COUNTRY, language: LANGUAGE, first: 10, searchQuery: query }
        }),
        signal: ctrl.signal
      },
      settings
    )

    if (!res.ok) {
      throw new Error(`JustWatch HTTP ${res.status}`)
    }

    const data = (await res.json()) as JwGraphqlResponse
    if (data.errors?.length) {
      throw new Error(`JustWatch GraphQL：${data.errors[0]?.message || '未知错误'}`)
    }

    const nodes = (data.data?.popularTitles?.edges || [])
      .map((e) => e?.node)
      .filter((n): n is JwNode => !!n?.content && (n.objectType === 'MOVIE' || !n.objectType))

    if (nodes.length === 0) {
      onError?.('JustWatch 未匹配到电影')
      return null
    }

    console.log(`[justwatch] ${query} 找到 ${nodes.length} 个结果`)
    return (year ? nodes.find((n) => n.content?.originalReleaseYear === year) : undefined) || nodes[0]
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    onError?.(msg)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** JustWatch 海报 URL 是模板：/poster/xxx/{profile}/slug.{format} */
function posterUrl(template?: string | null): string | undefined {
  if (!template) return undefined
  return `${IMAGE_BASE}${template.replace('{profile}', 's592').replace('{format}', 'jpg')}`
}

function genreNames(list?: { shortName?: string | null; technicalName?: string | null }[] | null): string[] {
  if (!list) return []
  const out: string[] = []
  for (const g of list) {
    const zh = g.technicalName ? GENRE_ZH[g.technicalName.toLowerCase()] : undefined
    const name = cleanGenreName(zh || g.technicalName || g.shortName || '')
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** 把 JustWatch 节点转成 MovieMeta（cover 仍为远程 URL，稍后本地化） */
function toMovieMeta(node: JwNode, fallbackTitle: string): MovieMeta {
  const c = node.content || {}
  const credits = c.credits || []
  const actors = credits.filter((x) => x.role === 'ACTOR').map((x) => x.name || '').filter(Boolean)
  const directors = credits.filter((x) => x.role === 'DIRECTOR').map((x) => x.name || '').filter(Boolean)

  return {
    uid: String(node.id || ''),
    externalId: String(node.id || ''),
    title: c.title || fallbackTitle,
    cover: posterUrl(c.posterUrl),
    date: c.originalReleaseYear ? `${c.originalReleaseYear}-01-01` : undefined,
    duration: c.runtime != null ? `${c.runtime}分钟` : undefined,
    director: directors[0],
    studio: undefined,
    series: undefined,
    rating: undefined,
    genres: genreNames(c.genres),
    actors,
    cast: actors,
    synopsis: c.shortDescription || undefined,
    parseVer: 2,
    source: 'justwatch',
    fetchedAt: Date.now()
  }
}

/** 下载并本地化封面 */
async function localizeDetail(detail: MovieMeta, settings: Settings): Promise<MovieMeta> {
  let cover: string | undefined
  if (detail.cover) {
    cover =
      (await cacheRemoteImage(detail.cover, `justwatch-cover-${detail.uid}`, settings, GRAPHQL)) || undefined
  }
  return { ...detail, cover }
}

/**
 * 按电影名称抓取 JustWatch 详情
 */
export async function fetchJustWatchDetail(
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

  const node = await searchJustWatch(query, settings, onError, q.year)
  if (!node) return null

  return localizeDetail(toMovieMeta(node, query), settings)
}
