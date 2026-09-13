import type { MovieMeta, Settings } from '../../shared/types'
import type { MovieQuery } from '../../shared/code'
import { proxyFetch, UA } from './proxy'
import { cacheRemoteImage, cleanGenreName } from './image-util'

/**
 * OMDb (Open Movie Database) - 免费电影数据接口
 * 优点：完全免费，无需API key即可使用，数据全面，支持多种语言
 * 接入：http://www.omdbapi.com/ 注册获取API key（免费计划有限制）
 * 
 * 与图片工具模块的约定一致：失败返回 null（不抛异常），onError 收集原因；
 * 封面/截图抓取后本地缓存，返回的 detail.cover 为本地路径。
 */

const BASE = 'http://www.omdbapi.com'

/**
 * 检查是否配置了OMDb API key
 */
export function hasOmdbKey(settings: Settings): boolean {
  return !!(settings.omdbKey && settings.omdbKey.trim())
}

/**
 * OMDb 响应数据结构（只声明用到的字段）
 */
interface OmdbMovie {
  Title?: string | null
  Year?: string | null
  Rated?: string | null
  Released?: string | null
  Runtime?: string | null
  Genre?: string | null
  Director?: string | null
  Writer?: string | null
  Actors?: string | null
  Plot?: string | null
  Poster?: string | null
  imdbRating?: string | null
  imdbVotes?: string | null
  imdbID?: string | null
  Type?: string | null
  DVD?: string | null
  BoxOffice?: string | null
  Production?: string | null
  Website?: string | null
  Response?: string | null
}

interface OmdbResponse {
  Search?: OmdbMovie[] | null
  totalResults?: string | null
  Error?: string | null
}

/**
 * 按电影名称搜索OMDb
 */
async function searchOmdb(
  query: string,
  settings: Settings,
  onError?: (m: string) => void,
  year?: number
): Promise<OmdbMovie | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const params = new URLSearchParams({
      s: query,
      type: 'movie',
      page: '1',
      r: 'json'
    })
    if (year) params.set('y', String(year))
    
    // 如果有API key，添加到请求中
    if (hasOmdbKey(settings)) {
      params.append('apikey', settings.omdbKey.trim())
    }
    
    const res = await proxyFetch(
      `${BASE}/?${params}`,
      { headers: { 'User-Agent': UA }, signal: ctrl.signal },
      settings
    )

    if (!res.ok) {
      throw new Error(`OMDb HTTP ${res.status}`)
    }

    const data = (await res.json()) as OmdbResponse
    if (data.Error) {
      if (/api.key|invalid/i.test(data.Error)) {
        throw new Error(`OMDb 错误：${data.Error}`)
      }
      onError?.(`OMDb 错误：${data.Error}`)
      return null
    }
    if (!data?.Search || data.Search.length === 0) {
      onError?.('OMDb 未匹配到电影')
      return null
    }

    console.log(`[omdb] ${query} 找到 ${data.Search.length} 个结果`)
    return data.Search[0]
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    onError?.(msg)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 按IMDb ID获取详细信息
 */
async function getOmdbDetails(
  imdbId: string,
  settings: Settings,
  onError?: (m: string) => void
): Promise<OmdbMovie | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const params = new URLSearchParams({
      i: imdbId,
      plot: 'full',
      r: 'json'
    })
    
    // 如果有API key，添加到请求中
    if (hasOmdbKey(settings)) {
      params.append('apikey', settings.omdbKey.trim())
    }
    
    const res = await proxyFetch(
      `${BASE}/?${params}`,
      { headers: { 'User-Agent': UA }, signal: ctrl.signal },
      settings
    )

    if (!res.ok) {
      throw new Error(`OMDb 获取详情失败（HTTP ${res.status}）`)
    }

    const data = (await res.json()) as OmdbMovie & { Response?: string | null; Error?: string | null }
    if (data.Error) {
      if (/api.key|invalid/i.test(data.Error)) {
        throw new Error(`OMDb 错误：${data.Error}`)
      }
      onError?.(`OMDb 错误：${data.Error}`)
      return null
    }

    return data.Response === 'True' && !data.Error ? data : null
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    onError?.(msg)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 按电影名称抓取OMDb详情
 */
export async function fetchOmdbDetail(
  q: MovieQuery,
  settings: Settings,
  onError?: (m: string) => void,
  _manual = false
): Promise<MovieMeta | null> {
  const query = q.query.trim()
  if (!query && !q.imdbId) {
    onError?.('电影名称为空')
    return null
  }

  let details: OmdbMovie | null
  if (q.imdbId) {
    // 直连 IMDb ID：跳过搜索，直接取详情
    details = await getOmdbDetails(q.imdbId, settings, onError)
  } else {
    const movie = await searchOmdb(query, settings, onError, q.year)
    if (!movie) return null
    const imdbId = movie.imdbID
    if (!imdbId) {
      onError?.('OMDb 返回的IMDb ID无效')
      return null
    }
    details = await getOmdbDetails(imdbId, settings, onError)
  }
  if (!details) return null

  const imdbId = details.imdbID ?? query
  const titleFinal = details.Title || query
  const genres = details.Genre ? details.Genre.split(',').map(cleanGenreName).filter((g): g is string => !!g) : []
  
  const detail: MovieMeta = {
    uid: imdbId,
    externalId: imdbId,
    title: titleFinal,
    cover: details.Poster || undefined,
    date: details.Released || undefined,
    duration: details.Runtime != null ? details.Runtime : undefined,
    director: details.Director || undefined,
    studio: details.Production || undefined,
    series: undefined, // OMDb没有系列概念
    rating: details.imdbRating != null ? details.imdbRating : undefined,
    genres,
    actors: details.Actors ? details.Actors.split(',').map(a => a.trim()) : [],
    cast: details.Actors ? details.Actors.split(',').map(a => a.trim()) : [], // OMDb不区分男女演员
    synopsis: details.Plot || undefined,
    parseVer: 2,
    source: 'omdb',
    fetchedAt: Date.now()
  }
  
  // 本地化封面
  let cover: string | undefined
  if (detail.cover) {
    cover = (await cacheRemoteImage(detail.cover, `omdb-cover-${imdbId}`, settings, BASE)) || undefined
  }
  
  return {
    ...detail,
    cover
  }
}