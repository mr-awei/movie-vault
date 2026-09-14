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
 *
 * v2.8.5 搜索策略改进：
 * - 优先用 `t` 参数精确搜索（直接返回详情，不会返回 "Too many results"）
 * - `t` 失败后用 `s` + 年份模糊搜索兜底
 * - `s` 返回 "Too many results" 时，英文搜索词尝试缩短重试，中文直接放弃
 * - 中文片名在 OMDb 上基本搜不到（OMDb 以英文标题为主），建议文件夹名/片单含英文名
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

/** 判断字符串是否主要由中文字符组成 */
function isMostlyChinese(s: string): boolean {
  const chinese = (s.match(/[\u4e00-\u9fff]/g) || []).length
  return chinese > 0 && chinese >= s.replace(/\s/g, '').length / 2
}

/**
 * 用 `t` 参数按标题精确搜索（直接返回单条详情，不会 "Too many results"）。
 * 这是 OMDb 最可靠的搜索方式：匹配到就返回完整详情，匹配不到返回 "Movie not found!"。
 * 有年份时加上 `y` 参数收窄范围，避免同名不同年的误匹配。
 */
async function fetchOmdbByTitle(
  query: string,
  settings: Settings,
  onError?: (m: string) => void,
  year?: number
): Promise<OmdbMovie | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const params = new URLSearchParams({
      t: query,
      type: 'movie',
      r: 'json'
    })
    if (year) params.set('y', String(year))
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
    const data = (await res.json()) as OmdbMovie & { Response?: string | null; Error?: string | null }
    if (data.Error) {
      if (/api.key|invalid/i.test(data.Error)) {
        throw new Error(`OMDb 错误：${data.Error}`)
      }
      // "Movie not found!" 属正常结果，记录后返回 null
      onError?.(`OMDb 精确搜索无结果：${data.Error}`)
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
 * 按电影名称搜索OMDb（`s` 参数，模糊搜索，返回列表）。
 * v2.8.5：遇到 "Too many results" 时，英文搜索词尝试缩短（取前2个词）重试；
 * 中文搜索词直接放弃（OMDb 对中文支持极差，缩短也无意义）。
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
      // "Too many results."：搜索词太宽泛
      if (/too many results/i.test(data.Error)) {
        // 英文搜索词：尝试缩短为前2个词再试一次（如 "The Dark Knight" → "The Dark"）
        if (!isMostlyChinese(query)) {
          const words = query.split(/\s+/).filter(Boolean)
          if (words.length > 2) {
            const shortened = words.slice(0, 2).join(' ')
            console.log(`[omdb] "${query}" Too many results，缩短为 "${shortened}" 重试`)
            return searchOmdb(shortened, settings, onError, year)
          }
        }
        onError?.(`OMDb 错误：${data.Error}（搜索词过宽，建议在文件夹名中加入年份或英文名）`)
        return null
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
 *
 * v2.8.5 搜索策略：
 * 1. 优先用 `t` 参数精确搜索（直接返回详情，不会 "Too many results"），有年份时加 `y`
 * 2. `t` 失败后用 `s` + 年份模糊搜索，取第一个结果的 imdbID
 * 3. 用 `i` 参数获取完整详情
 *
 * 注意：OMDb 以英文标题为主，中文片名命中率极低。
 * 建议在文件夹名或 Excel 片单中包含英文名（如 "满清十大酷刑 A Chinese Torture Chamber Story"）。
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
    // 策略1：优先用 `t` 参数精确搜索（一步到位，不会 Too many results）
    details = await fetchOmdbByTitle(query, settings, onError, q.year)

    // 策略2：`t` 失败后用 `s` 模糊搜索兜底（取第一个结果再取详情）
    if (!details) {
      const movie = await searchOmdb(query, settings, onError, q.year)
      if (!movie) return null
      const imdbId = movie.imdbID
      if (!imdbId) {
        onError?.('OMDb 返回的IMDb ID无效')
        return null
      }
      details = await getOmdbDetails(imdbId, settings, onError)
    }
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
