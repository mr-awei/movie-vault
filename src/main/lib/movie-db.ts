import type { MovieMeta, Settings } from '../../shared/types'
import type { MovieQuery } from '../../shared/code'
import { proxyFetch, UA } from './proxy'
import { cacheRemoteImage, cleanGenreName } from './image-util'

/**
 * MovieDB (The Movie Database) - 常规电影数据接口
 * 优点：全球电影数据库，包含院线电影、老片、内陆未上映电影等信息
 * 接入：https://www.themoviedb.org 注册获取 API key
 * 
 * 与图片工具模块的约定一致：失败返回 null（不抛异常），onError 收集原因；
 * 封面/截图抓取后本地缓存，返回的 detail.cover 为本地路径。
 */

const BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/original'
const PROFILE_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185'
/** 详情页最多缓存的演员头像数量（减少批量补齐时的网络/存储开销） */
const MAX_CAST_PHOTOS = 20

/** TMDb 图片 path 都以 '/' 开头，拼接时要去掉重斜杠 */
function tmdbImageUrl(base: string, path?: string | null): string | undefined {
  if (!path) return undefined
  return `${base}/${path.replace(/^\/+/, '')}`
}

/**
 * 检查是否配置了MovieDB API key
 */
export function hasMovieDbKey(settings: Settings): boolean {
  return !!(settings.movieDbKey && settings.movieDbKey.trim())
}

/**
 * MovieDB 响应数据结构（只声明用到的字段）
 */
interface MovieDbMovie {
  id?: number | null
  imdb_id?: string | null
  title?: string | null
  original_title?: string | null
  overview?: string | null
  release_date?: string | null
  runtime?: number | null
  vote_average?: number | null
  genres?: { id: number; name: string }[] | null
  production_companies?: { name: string }[] | null
  /** 由 append_to_response=credits 解析而来 */
  directors?: { name: string }[] | null
  actors?: { name: string }[] | null
  poster_path?: string | null
  backdrop_path?: string | null
  videos?: { results: { key: string; site: string }[] } | null
  /** 仅当请求带 append_to_response=credits 时存在 */
  credits?: {
    cast?: { id?: number; name: string; profile_path?: string | null; character?: string | null }[] | null
    crew?: { name: string; job?: string | null }[] | null
  } | null
}

interface MovieDbTranslation {
  iso_639_1: string
  iso_3166_1?: string | null
  name?: string
  data?: {
    title?: string | null
    overview?: string | null
    homepage?: string | null
  } | null
}

interface MovieDbTranslationsResponse {
  translations?: MovieDbTranslation[] | null
}

interface MovieDbResponse {
  results?: MovieDbMovie[] | null
}

/**
 * 按电影名称搜索MovieDB
 */
async function searchMovie(
  query: string,
  settings: Settings,
  onError?: (m: string) => void,
  year?: number
): Promise<MovieDbMovie | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const params = new URLSearchParams({
      query,
      include_adult: settings.includeAdult ? 'true' : 'false',
      language: 'zh-CN',
      api_key: settings.movieDbKey.trim()
    })
    if (year) params.set('year', String(year))
    const res = await proxyFetch(
      `${BASE}/search/movie?${params}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': UA
        },
        signal: ctrl.signal
      },
      settings
    )

    if (res.status === 401) {
      throw new Error('MovieDB API key 无效（HTTP 401）')
    }
    if (res.status === 404) {
      onError?.('MovieDB 搜索无结果')
      return null
    }
    if (!res.ok) {
      throw new Error(`MovieDB HTTP ${res.status}`)
    }

    const data = (await res.json()) as MovieDbResponse
    if (!data?.results || data.results.length === 0) {
      onError?.('MovieDB 未匹配到电影')
      return null
    }

    console.log(`[moviedb] ${query} 找到 ${data.results.length} 个结果`)
    return data.results[0]
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    onError?.(msg)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 按电影ID获取详细信息
 */
async function getMovieDetails(
  movieId: number,
  settings: Settings,
  onError?: (m: string) => void
): Promise<MovieDbMovie | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const key = encodeURIComponent(settings.movieDbKey.trim())
    // append_to_response=credits,videos：详情接口默认不返回演职员与视频，需显式追加
    const res = await proxyFetch(
      `${BASE}/movie/${movieId}?api_key=${key}&language=zh-CN&append_to_response=credits,videos`,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': UA
        },
        signal: ctrl.signal
      },
      settings
    )

    if (!res.ok) {
      throw new Error(`MovieDB 获取详情失败（HTTP ${res.status}）`)
    }

    // 注意：TMDb /movie/{id} 直接返回电影对象本身（顶层就是 id/title/genres…），
    // 并没有 { movie: {...} } 这层包装（旧代码 `data.movie || null` 会永远得到 null）。
    let data = (await res.json()) as MovieDbMovie
    if (!data || !data.id) {
      onError?.('MovieDB 详情为空')
      return null
    }

    // v2.6.5：若当前语言（zh-CN）没有剧情简介，查询 TMDb 全语言翻译列表，
    // 优先用中文（港/台/大陆任一）简介回填，没有再回退英文，避免详情页简介空白。
    // 同时优先保留中文标题/演职员/分类，仅把缺失的 overview（必要时 title）补齐。
    if (!data.overview) {
      try {
        const trRes = await proxyFetch(
          `${BASE}/movie/${movieId}/translations?api_key=${key}`,
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent': UA
            },
            signal: ctrl.signal
          },
          settings
        )
        if (trRes.ok) {
          const tr = (await trRes.json()) as MovieDbTranslationsResponse
          const all = tr.translations || []
          const preferredCodes = ['zh-CN', 'zh-HK', 'zh-TW', 'zh-SG', 'en']
          const pick =
            all.find(
              (t) =>
                preferredCodes.includes(`${t.iso_639_1}${t.iso_3166_1 ? `-${t.iso_3166_1}` : ''}`) &&
                t.data?.overview
            ) || all.find((t) => t.data?.overview)
          if (pick?.data?.overview) {
            data = { ...data, overview: pick.data.overview }
          }
        }
      } catch {
        // 回退失败不影响主流程，保持原结果
      }
    }

    // 把 credits 里的演职员映射成 detail 需要的 directors / actors
    if (data.credits) {
      data.directors = (data.credits.crew || []).filter((c) => c.job === 'Director')
      data.actors = (data.credits.cast || []).map((c) => ({ name: c.name }))
    }
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
 * 按电影名称抓取MovieDB详情
 */
export async function fetchMovieDbDetail(
  q: MovieQuery,
  settings: Settings,
  onError?: (m: string) => void,
  _manual = false
): Promise<MovieMeta | null> {
  if (!hasMovieDbKey(settings)) {
    onError?.('未配置 MovieDB API key（设置 → 数据源 → MovieDB Key 填写）')
    return null
  }

  const query = q.query.trim()
  if (!query && !q.tmdbId) {
    onError?.('电影名称为空')
    return null
  }

  let details: MovieDbMovie | null
  if (q.tmdbId) {
    // 直连 TMDB ID：跳过搜索，直接取详情
    details = await getMovieDetails(q.tmdbId, settings, onError)
  } else {
    const movie = await searchMovie(query, settings, onError, q.year)
    if (!movie) return null
    const movieId = movie.id
    if (!movieId) {
      onError?.('MovieDB 返回的电影ID无效')
      return null
    }
    details = await getMovieDetails(movieId, settings, onError)
  }
  if (!details) return null

  const movieId = details.id
  const titleFinal = details.title || details.original_title || query
  const genres = (details.genres || [])
    .filter(Boolean)
    .map((g) => cleanGenreName(g.name))
    .filter((g): g is string => !!g)
  
  const directors = details.directors || []
  const actors = details.actors || []
  
  const detail: MovieMeta = {
    uid: String(movieId),
    externalId: String(movieId),
    title: titleFinal,
    cover: tmdbImageUrl(IMAGE_BASE, details.poster_path),
    date: details.release_date || undefined,
    duration: details.runtime != null ? String(details.runtime) : undefined,
    director: (directors[0]?.name) || undefined,
    studio: (details.production_companies || [])[0]?.name || undefined,
    series: undefined, // MovieDB没有系列概念
    rating: details.vote_average != null ? String(details.vote_average) : undefined,
    genres,
    actors: actors.map((a) => a.name),
    cast: actors.map((a) => a.name), // MovieDB不区分男女演员
    synopsis: details.overview || undefined,
    parseVer: 2,
    source: 'moviedb',
    fetchedAt: Date.now()
  }
  
  // 本地化封面
  let cover: string | undefined
  if (detail.cover) {
    cover = (await cacheRemoteImage(detail.cover, `moviedb-cover-${movieId}`, settings, IMAGE_BASE)) || undefined
  }

  // 缓存演员头像（TMDb credits.cast 有 profile_path 时）
  const rawCast = (details.credits?.cast || []).slice(0, MAX_CAST_PHOTOS)
  const castProfiles = (
    await Promise.all(
      rawCast.map(async (c) => {
        const id = c.id ?? 0
        const safeKey = `moviedb-profile-${id}-${c.name}`.replace(/[\\/:*?"<>|]/g, '_')
        const photoUrl = tmdbImageUrl(PROFILE_IMAGE_BASE, c.profile_path)
        const localPath = photoUrl
          ? await cacheRemoteImage(photoUrl, safeKey, settings, undefined, (reason) => {
              console.warn(`[moviedb] 演员头像下载失败 ${c.name}: ${reason}`)
            })
          : undefined
        return {
          name: c.name,
          photo: localPath || undefined,
          character: c.character || undefined
        }
      })
    )
  ).filter((p) => !!p.name)

  return {
    ...detail,
    cover,
    castProfiles: castProfiles.length > 0 ? castProfiles : undefined
  }
}