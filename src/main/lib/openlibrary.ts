import type { MovieMeta, Settings } from '../../shared/types'
import type { MovieQuery } from '../../shared/code'
import { proxyFetch, UA } from './proxy'
import { cacheRemoteImage, cleanGenreName } from './image-util'

/**
 * Open Library - 完全免费的电影和书籍数据接口
 * 优点：完全免费，无需API key，数据开源，支持多种语言
 * 接入：https://openlibrary.org/ 开放API
 * 
 * 与图片工具模块的约定一致：失败返回 null（不抛异常），onError 收集原因；
 * 封面/截图抓取后本地缓存，返回的 detail.cover 为本地路径。
 */

const BASE = 'https://openlibrary.org'

/**
 * P2-8：OpenLibrary 以书籍为主，直接把书当电影抓会污染元数据（作者当导演、页数当片长）。
 * 搜索路径只接受带影视特征的条目（标题/分类命中以下词），否则视为未命中交给下一数据源；
 * 手动按 URL/作品 key 抓取（fetchOpenLibraryByKey）是用户明确指定，不受此限制。
 */
const FILM_HINTS = ['film', 'movie', 'cinema', 'motion picture', 'television', 'tv series', 'tv program', 'screenplay', 'screen adaptation', 'documentary', 'screen version']
function isFilmLikeDoc(d: { title: string; subject?: string[] }): boolean {
  const text = `${d.title} ${(d.subject ?? []).join(' ')}`.toLowerCase()
  return FILM_HINTS.some((h) => text.includes(h))
}

/**
 * Open Library 完全免费，无需 API key 即可使用
 */
export function hasOpenLibraryKey(_settings: Settings): boolean {
  return true
}

/**
 * Open Library 响应数据结构（只声明用到的字段）
 */
interface OpenLibrarySearch {
  docs: Array<{
    key: string
    title: string
    author_name?: string[]
    author_key?: string[]
    first_publish_year?: number
    cover_i?: number
    cover_edition_key?: string
    language?: string[]
    type?: string[]
    subject?: string[]
    ia_collection?: string[]
  }>
  numFound: number
}

interface OpenLibraryWork {
  key: string
  title: string
  authors?: Array<{
    name: string
    key: string
  }>
  covers?: number[]
  first_publish_date?: string
  description?: {
    type: string
    value: string
  }
  subjects?: string[]
  subject_places?: string[]
  subject_times?: string[]
  type?: string[]
  languages?: string[]
  number_of_pages?: number
  imdb_id?: string
  youtube_trailer?: string
}

/**
 * 按电影名称搜索Open Library
 */
async function searchOpenLibrary(
  query: string,
  settings: Settings,
  onError?: (m: string) => void,
  year?: number
): Promise<OpenLibrarySearch | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const params = new URLSearchParams({
      q: query,
      limit: '10',
      fields: 'key,title,author_name,cover_i,first_publish_year,language,type,subject'
    })
    if (year) params.set('first_publish_year', String(year))
    
    const res = await proxyFetch(
      `${BASE}/search.json?${params}`,
      { headers: { 'User-Agent': UA }, signal: ctrl.signal },
      settings
    )
    
    if (!res.ok) {
      throw new Error(`Open Library HTTP ${res.status}`)
    }

    const data = await res.json() as OpenLibrarySearch
    if (data.numFound === 0) {
      onError?.('Open Library 未匹配到电影')
      return null
    }

    console.log(`[openlibrary] ${query} 找到 ${data.numFound} 个结果`)
    return data
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    onError?.(msg)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 获取作品详细信息
 */
async function getWorkDetails(
  workKey: string,
  settings: Settings,
  onError?: (m: string) => void
): Promise<OpenLibraryWork | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await proxyFetch(
      `${BASE}${workKey}.json`,
      { headers: { 'User-Agent': UA }, signal: ctrl.signal },
      settings
    )
    
    if (!res.ok) {
      throw new Error(`Open Library 获取作品详情失败（HTTP ${res.status}）`)
    }

    const data = await res.json() as OpenLibraryWork
    return data
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    onError?.(msg)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 按电影名称抓取Open Library详情
 */
export async function fetchOpenLibraryDetail(
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

  const searchResult = await searchOpenLibrary(query, settings, onError, q.year)
  if (!searchResult) return null
  
    // P2-8：只接受影视特征条目，避免“书当电影”（作者当导演/页数当片长）；全部是书则视为未命中
  const firstDoc = searchResult.docs.find(isFilmLikeDoc)
  if (!firstDoc) {
    onError?.('Open Library 未匹配到电影条目（结果多为书籍，已跳过）')
    return null
  }

const workKey = firstDoc.key
  const workDetails = await getWorkDetails(workKey, settings, onError)
  if (!workDetails) return null
  
  // 尝试获取版本详情以获取封面
  let coverUrl = undefined
  if (firstDoc.cover_i) {
    // 使用封面ID构建封面URL
    coverUrl = `https://covers.openlibrary.org/b/id/${firstDoc.cover_i}-L.jpg`
  } else if (workDetails.covers && workDetails.covers.length > 0) {
    // 使用作品封面
    coverUrl = `https://covers.openlibrary.org/b/id/${workDetails.covers[0]}-L.jpg`
  }
  
  // 构建演员列表
  const actors = workDetails.authors?.map(author => author.name) || []
  
  // 构建类型列表作为类别
  const genres = workDetails.subjects?.map(cleanGenreName).filter((g): g is string => !!g) || []
  if (workDetails.type && workDetails.type.length > 0) {
    workDetails.type.forEach(type => {
      const cleaned = cleanGenreName(type)
      if (cleaned) genres.push(cleaned)
    })
  }
  
  const detail: MovieMeta = {
    uid: workKey,
    externalId: workKey,
    title: workDetails.title || query,
    cover: coverUrl,
    date: workDetails.first_publish_date || undefined,
    duration: workDetails.number_of_pages != null ? `${workDetails.number_of_pages}页` : undefined,
    director: workDetails.authors?.[0]?.name || undefined,
    studio: undefined, // Open Library没有制片厂概念
    series: undefined,
    rating: undefined, // Open Library没有评分
    genres,
    actors,
    cast: workDetails.authors?.map(author => author.name) || [], // 不区分男女演员
    synopsis: typeof workDetails.description === 'string' ? workDetails.description : workDetails.description?.value || undefined,
    parseVer: 2,
    source: 'openlibrary',
    fetchedAt: Date.now()
  }
  
  // 本地化封面
  let cover: string | undefined
  if (detail.cover) {
    cover = (await cacheRemoteImage(detail.cover, `openlibrary-cover-${workKey}`, settings, BASE)) || undefined
  }
  
  return {
    ...detail,
    cover
  }
}

/** 按 OpenLibrary 作品 key（来自网页 URL，如 OL27448W）直接抓取详情，跳过搜索 */
export async function fetchOpenLibraryByKey(
  workKey: string,
  settings: Settings,
  onError?: (m: string) => void
): Promise<MovieMeta | null> {
  const key = workKey.startsWith('/works/') ? workKey : `/works/${workKey}`
  const workDetails = await getWorkDetails(key, settings, onError)
  if (!workDetails) return null

  const actors = workDetails.authors?.map((a) => a.name) || []
  const genres = workDetails.subjects?.map(cleanGenreName).filter((g): g is string => !!g) || []
  if (workDetails.type && workDetails.type.length > 0) {
    workDetails.type.forEach((type) => {
      const cleaned = cleanGenreName(type)
      if (cleaned) genres.push(cleaned)
    })
  }

  const detail: MovieMeta = {
    uid: key,
    externalId: key,
    title: workDetails.title || workKey,
    cover: undefined,
    date: workDetails.first_publish_date || undefined,
    duration: workDetails.number_of_pages != null ? `${workDetails.number_of_pages}页` : undefined,
    director: workDetails.authors?.[0]?.name || undefined,
    studio: undefined,
    series: undefined,
    rating: undefined,
    genres,
    actors,
    cast: workDetails.authors?.map((a) => a.name) || [],
    synopsis: typeof workDetails.description === 'string' ? workDetails.description : workDetails.description?.value || undefined,
    parseVer: 2,
    source: 'openlibrary',
    fetchedAt: Date.now()
  }

  let cover: string | undefined
  if (workDetails.covers && workDetails.covers.length > 0) {
    const coverUrl = `https://covers.openlibrary.org/b/id/${workDetails.covers[0]}-L.jpg`
    cover = (await cacheRemoteImage(coverUrl, `openlibrary-cover-${workKey}`, settings, BASE)) || undefined
  }

  return { ...detail, cover }
}