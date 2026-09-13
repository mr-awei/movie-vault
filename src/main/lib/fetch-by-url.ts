/**
 * 详情页「按网址更新」：把用户粘贴的任一数据源网页 URL 解析为 源 + 标识，
 * 并直接调用对应数据源抓取详情。支持 MovieDB / IMDb(→OMDb) / OpenLibrary / JustWatch / 维基百科。
 */
import type { MovieMeta, Settings, SourceId } from '../../shared/types'
import type { MovieQuery } from '../../shared/code'
import { fetchMovieDbDetail, hasMovieDbKey } from './movie-db'
import { fetchOmdbDetail } from './omdb'
import { fetchOpenLibraryByKey } from './openlibrary'
import { fetchJustWatchDetail } from './justwatch'
import { fetchWikipediaDetail } from './wikipedia'

export interface ParsedSourceUrl {
  source: SourceId
  /** 解析出的标识：MovieDB/OpenLibrary 为 id；IMDb 为 tt id；JustWatch/维基百科 为标题 */
  token: string
}

/** 从 5 个数据源任一网页 URL 解析出 源 + 标识；无法识别返回 null */
export function parseSourceUrl(raw: string): ParsedSourceUrl | null {
  const url = (raw || '').trim()
  if (!url) return null

  const tmdb = url.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i)
  if (tmdb) return { source: 'moviedb', token: tmdb[1] }

  const imdb = url.match(/imdb\.com\/title\/(tt\d+)/i)
  if (imdb) return { source: 'omdb', token: imdb[1] }

  const ol = url.match(/openlibrary\.org\/(?:works|books)\/([A-Za-z0-9]+)/i)
  if (ol) return { source: 'openlibrary', token: ol[1] }

  const jw = url.match(/justwatch\.com\/[a-z]{2}\/(?:movie|tv-show|tv-series)\/([^/?#]+)/i)
  if (jw) return { source: 'justwatch', token: jw[1].replace(/-/g, ' ') }

  const wiki = url.match(/wikipedia\.org\/wiki\/([^/?#]+)/i)
  if (wiki) return { source: 'wikipedia', token: decodeURIComponent(wiki[1]).replace(/_/g, ' ') }

  return null
}

/** 根据 URL 直连对应数据源抓取详情。返回 { detail, source } 或 null。 */
export async function fetchDetailByUrl(
  raw: string,
  settings: Settings,
  onError?: (m: string) => void
): Promise<{ detail: MovieMeta; source: SourceId } | null> {
  const parsed = parseSourceUrl(raw)
  if (!parsed) {
    onError?.(
      '无法识别该网址所属数据源，请粘贴 MovieDB / IMDb / OpenLibrary / JustWatch / 维基百科 的电影页面链接'
    )
    return null
  }

  const isAbortError = (e: unknown): boolean => {
    if (e instanceof Error && e.name === 'AbortError') return true
    const msg = String((e as Error)?.message || '')
    return /aborted|timeout/i.test(msg)
  }

  const base: MovieQuery = { query: '' }
  let detail: MovieMeta | null = null
  try {
    switch (parsed.source) {
      case 'moviedb':
        detail = await fetchMovieDbDetail({ ...base, tmdbId: Number(parsed.token) }, settings, onError, true)
        break
      case 'omdb':
        detail = await fetchOmdbDetail({ ...base, imdbId: parsed.token }, settings, onError, true)
        break
      case 'openlibrary':
        detail = await fetchOpenLibraryByKey(parsed.token, settings, onError)
        break
      case 'justwatch':
        detail = await fetchJustWatchDetail({ ...base, query: parsed.token }, settings, onError, true)
        break
      case 'wikipedia':
        detail = await fetchWikipediaDetail({ ...base, query: parsed.token }, settings, onError, true)
        break
    }
  } catch (e) {
    if (isAbortError(e)) {
      onError?.('请求超时，请检查网络或代理设置')
    } else {
      onError?.((e as Error)?.message || String(e))
    }
    return null
  }

  if (!detail) return null

  // 非 MovieDB 源（IMDb/OpenLibrary/JustWatch/维基）通常没有演员头像；
  // 若已配置 MovieDB Key，用标题再补一次 MovieDB 详情，把演员头像（castProfiles）合并进来，
  // 让「按网址更新」无论粘贴哪个数据源链接都能补齐头像。
  if (parsed.source !== 'moviedb' && hasMovieDbKey(settings) && detail.title) {
    try {
      const md = await fetchMovieDbDetail({ query: detail.title }, settings, undefined, true)
      if (md?.castProfiles?.length) {
        detail.castProfiles = md.castProfiles
        if (!detail.cast?.length && md.cast?.length) detail.cast = md.cast
        if (!detail.actors?.length && md.actors?.length) detail.actors = md.actors
      }
    } catch {
      /* 兜底失败不影响主流程 */
    }
  }

  return { detail, source: parsed.source }
}
