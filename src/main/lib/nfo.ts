import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import type { NfoData, Video } from '../../shared/types'

/**
 * NFO 解析器（Kodi/Jellyfin/Plex 标准 XML 格式）。
 * 使用 fast-xml-parser 解析，支持嵌套标签、CDATA、属性、特殊字符。
 * NFO 规范参考：https://kodi.wiki/view/NFO_files/Movies
 */

const parserOptions = {
  ignoreAttributes: false,
  parseAttributeValue: true,
  trimValues: true,
  cdataTagName: '__cdata',
  arrayMode: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text'
}

const parser = new XMLParser(parserOptions)

const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataTagName: '__cdata',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: true
}

const builder = new XMLBuilder(builderOptions)

/** 从解析后的对象中安全提取字符串字段 */
function str(obj: any, key: string): string | undefined {
  const v = obj?.[key]
  if (v === undefined || v === null) return undefined
  if (typeof v === 'object' && v['#text'] !== undefined) return String(v['#text']).trim()
  const s = String(v).trim()
  return s || undefined
}

/** 从解析后的对象中提取数字字段 */
function num(obj: any, key: string): number | undefined {
  const s = str(obj, key)
  if (!s) return undefined
  const n = parseFloat(s)
  return isNaN(n) ? undefined : n
}

/** 从解析后的对象中提取数组字段（可能是单个对象或数组） */
function arr(obj: any, key: string): any[] {
  const v = obj?.[key]
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/** 处理 CDATA 字段 */
function cdataStr(v: any): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'object' && v.__cdata !== undefined) return String(v.__cdata).trim()
  if (typeof v === 'object' && v['#text'] !== undefined) return String(v['#text']).trim()
  const s = String(v).trim()
  return s || undefined
}

/**
 * 解析 NFO 文件内容为 NfoData 对象。
 * 解析失败返回 null（文件不存在/格式错误）。
 */
export function parseNfo(xml: string): NfoData | null {
  try {
    if (!xml || xml.length < 5) return null
    const result = parser.parse(xml)
    const movie = result?.movie
    if (!movie) return null

    const data: NfoData = {}

    const title = cdataStr(movie.title)
    if (title) data.title = title

    const originaltitle = cdataStr(movie.originaltitle)
    if (originaltitle) data.originaltitle = originaltitle

    const sorttitle = cdataStr(movie.sorttitle)
    if (sorttitle) data.sorttitle = sorttitle

    const year = num(movie, 'year')
    if (year) data.year = year

    const plot = cdataStr(movie.plot)
    if (plot) data.plot = plot

    const outline = cdataStr(movie.outline)
    if (outline) data.outline = outline

    const tagline = cdataStr(movie.tagline)
    if (tagline) data.tagline = tagline

    const rating = num(movie, 'rating')
    if (rating) data.rating = rating

    const votes = num(movie, 'votes')
    if (votes) data.votes = votes

    const mpaa = cdataStr(movie.mpaa)
    if (mpaa) data.mpaa = mpaa

    const premiered = cdataStr(movie.premiered)
    if (premiered) data.premiered = premiered

    const runtime = num(movie, 'runtime')
    if (runtime) data.runtime = runtime

    // 类型（可能多个 <genre> 标签）
    const genres = arr(movie, 'genre').map((g) => cdataStr(g)).filter(Boolean) as string[]
    if (genres.length > 0) data.genres = genres

    // 标签（可能多个 <tag> 标签）
    const tags = arr(movie, 'tag').map((t) => cdataStr(t)).filter(Boolean) as string[]
    if (tags.length > 0) data.tags = tags

    // 演员（<actor> 块，含 name/role/thumb）
    const actors = arr(movie, 'actor')
      .map((a) => ({
        name: cdataStr(a.name),
        role: cdataStr(a.role),
        thumb: cdataStr(a.thumb)
      }))
      .filter((a) => a.name || a.role || a.thumb)
    if (actors.length > 0) data.actors = actors

    const director = cdataStr(movie.director)
    if (director) data.director = director

    const writer = cdataStr(movie.writer)
    if (writer) data.writer = writer

    const studio = cdataStr(movie.studio)
    if (studio) data.studio = studio

    const country = cdataStr(movie.country)
    if (country) data.country = country

    const set = cdataStr(movie.set)
    if (set) data.set = set

    // 唯一 ID（<uniqueid type="tmdb">123</uniqueid>）
    const uniqueids = arr(movie, 'uniqueid')
    const idMap: Record<string, string> = {}
    for (const uid of uniqueids) {
      const type = uid?.['@_type'] ? String(uid['@_type']).toLowerCase() : 'unknown'
      const value = cdataStr(uid)
      if (value) idMap[type] = value
    }
    if (Object.keys(idMap).length > 0) data.uniqueids = idMap

    const thumb = cdataStr(movie.thumb)
    if (thumb) data.thumb = thumb

    const fanart = cdataStr(movie.fanart)
    if (fanart) data.fanart = fanart

    return Object.keys(data).length > 0 ? data : null
  } catch {
    return null
  }
}

/**
 * 读取视频同目录的 .nfo 文件并解析。
 * 查找顺序：<视频文件名>.nfo → movie.nfo
 */
export async function readNfoForVideo(videoPath: string): Promise<{ ok: boolean; nfo?: NfoData; nfoPath?: string; error?: string }> {
  try {
    const dir = path.dirname(videoPath)
    const base = path.basename(videoPath, path.extname(videoPath))
    const candidates = [
      path.join(dir, `${base}.nfo`),
      path.join(dir, 'movie.nfo')
    ]
    for (const p of candidates) {
      if (existsSync(p)) {
        const xml = await fs.readFile(p, 'utf8')
        const nfo = parseNfo(xml)
        if (nfo) return { ok: true, nfo, nfoPath: p }
      }
    }
    return { ok: false, error: 'NFO file not found' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 把视频元数据导出为 Kodi 标准 NFO XML 字符串。
 * 使用 fast-xml-parser 的 XMLBuilder 生成，确保 XML 格式正确。
 */
export function buildNfoXml(video: Video): string {
  const meta = video.meta
  const movie: any = {}

  if (video.title) movie.title = video.title
  if (video.year) movie.year = video.year

  // 剧情简介：video.description（Excel片单权威） > meta.synopsis（数据源）
  const plot = video.description || meta?.synopsis
  if (plot) movie.plot = plot

  if (video.rating) movie.rating = video.rating

  // 时长：meta.duration（字符串如 "120 min"）> video.durationSec（秒）
  if (meta?.duration) {
    const mins = parseInt(meta.duration, 10)
    if (!isNaN(mins) && mins > 0) movie.runtime = mins
  } else if (video.durationSec) {
    const mins = Math.round(video.durationSec / 60)
    if (mins > 0) movie.runtime = mins
  }

  if (meta?.date) movie.premiered = meta.date

  // 类型
  const genres = meta?.genres ?? video.backupTags ?? []
  if (genres.length > 0) movie.genre = genres.filter(Boolean)

  // 标签
  if (video.tags && video.tags.length > 0) movie.tag = video.tags.filter(Boolean)

  // 演员：优先 castProfiles（有角色名），回退 cast/actors（纯名字）
  const profiles = meta?.castProfiles ?? []
  if (profiles.length > 0) {
    movie.actor = profiles
      .filter((a: any) => a.name)
      .map((a: any) => {
        const actor: any = { name: a.name }
        if (a.character) actor.role = a.character
        if (a.photo) actor.thumb = a.photo
        return actor
      })
  } else {
    const names = meta?.cast ?? meta?.actors ?? []
    if (names.length > 0) {
      movie.actor = names.filter(Boolean).map((name: string) => ({ name }))
    }
  }

  if (meta?.director) movie.director = meta.director
  if (meta?.studio) movie.studio = meta.studio
  if (video.series || meta?.series) movie.set = video.series || meta?.series

  // 唯一 ID：用 meta.externalId（数据源侧的唯一标识）
  if (meta?.externalId) {
    movie.uniqueid = {
      '@_type': meta.source ?? 'unknown',
      '#text': meta.externalId
    }
  }

  // 封面
  if (video.posterPath) movie.thumb = video.posterPath

  const xmlObj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8', '@_standalone': 'yes' },
    movie
  }

  return builder.build(xmlObj)
}

/**
 * 把视频元数据写入同目录 .nfo 文件。
 * 文件名：<视频文件名>.nfo
 */
export async function writeNfoForVideo(video: Video): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const dir = path.dirname(video.path)
    const base = path.basename(video.path, path.extname(video.path))
    const nfoPath = path.join(dir, `${base}.nfo`)
    const xml = buildNfoXml(video)
    await fs.writeFile(nfoPath, xml, 'utf8')
    return { ok: true, path: nfoPath }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
