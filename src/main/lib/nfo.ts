import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import type { NfoData, Video } from '../../shared/types'

/**
 * 轻量 NFO 解析器（Kodi/Jellyfin/Plex 标准 XML 格式）。
 * 不引入第三方 XML 库，用正则提取关键标签，满足本地媒体元数据互通需求。
 * NFO 规范参考：https://kodi.wiki/view/NFO_files/Movies
 */

/** 从 XML 文本中提取单个标签的文本内容 */
function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : undefined
}

/** 从 XML 文本中提取多个同名标签的文本内容列表 */
function extractTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim())
  }
  return results
}

/** 解析 <actor> 块，提取 name/role/thumb */
function extractActors(xml: string): Array<{ name?: string; role?: string; thumb?: string }> {
  const re = /<actor[^>]*>([\s\S]*?)<\/actor>/gi
  const actors: Array<{ name?: string; role?: string; thumb?: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    actors.push({
      name: extractTag(block, 'name'),
      role: extractTag(block, 'role'),
      thumb: extractTag(block, 'thumb')
    })
  }
  return actors
}

/** 解析 <uniqueid> 标签（带 type 属性） */
function extractUniqueIds(xml: string): Record<string, string> {
  const re = /<uniqueid[^>]*type="([^"]*)"[^>]*>([\s\S]*?)<\/uniqueid>/gi
  const ids: Record<string, string> = {}
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    ids[m[1].toLowerCase()] = m[2].trim()
  }
  return ids
}

/**
 * 解析 NFO 文件内容为 NfoData 对象。
 * 解析失败返回 null（文件不存在/格式错误）。
 */
export function parseNfo(xml: string): NfoData | null {
  try {
    if (!xml || xml.length < 5) return null
    const data: NfoData = {}
    const title = extractTag(xml, 'title')
    if (title) data.title = title
    const originaltitle = extractTag(xml, 'originaltitle')
    if (originaltitle) data.originaltitle = originaltitle
    const sorttitle = extractTag(xml, 'sorttitle')
    if (sorttitle) data.sorttitle = sorttitle
    const year = extractTag(xml, 'year')
    if (year) {
      const y = parseInt(year, 10)
      if (!isNaN(y)) data.year = y
    }
    const plot = extractTag(xml, 'plot')
    if (plot) data.plot = plot
    const outline = extractTag(xml, 'outline')
    if (outline) data.outline = outline
    const tagline = extractTag(xml, 'tagline')
    if (tagline) data.tagline = tagline
    const rating = extractTag(xml, 'rating')
    if (rating) {
      const r = parseFloat(rating)
      if (!isNaN(r)) data.rating = r
    }
    const votes = extractTag(xml, 'votes')
    if (votes) {
      const v = parseInt(votes, 10)
      if (!isNaN(v)) data.votes = v
    }
    const mpaa = extractTag(xml, 'mpaa')
    if (mpaa) data.mpaa = mpaa
    const premiered = extractTag(xml, 'premiered')
    if (premiered) data.premiered = premiered
    const runtime = extractTag(xml, 'runtime')
    if (runtime) {
      const r = parseInt(runtime, 10)
      if (!isNaN(r)) data.runtime = r
    }
    const genres = extractTags(xml, 'genre')
    if (genres.length > 0) data.genres = genres
    const tags = extractTags(xml, 'tag')
    if (tags.length > 0) data.tags = tags
    const actors = extractActors(xml)
    if (actors.length > 0) data.actors = actors
    const director = extractTag(xml, 'director')
    if (director) data.director = director
    const writer = extractTag(xml, 'writer')
    if (writer) data.writer = writer
    const studio = extractTag(xml, 'studio')
    if (studio) data.studio = studio
    const country = extractTag(xml, 'country')
    if (country) data.country = country
    const set = extractTag(xml, 'set')
    if (set) data.set = set
    const uniqueids = extractUniqueIds(xml)
    if (Object.keys(uniqueids).length > 0) data.uniqueids = uniqueids
    const thumb = extractTag(xml, 'thumb')
    if (thumb) data.thumb = thumb
    const fanart = extractTag(xml, 'fanart')
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

/** XML 转义 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 把视频元数据导出为 Kodi 标准 NFO XML 字符串。
 */
export function buildNfoXml(video: Video): string {
  const meta = video.meta
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  lines.push('<movie>')
  if (video.title) lines.push(`  <title>${xmlEscape(video.title)}</title>`)
  if (video.year) lines.push(`  <year>${video.year}</year>`)
  // 剧情简介：video.description（Excel片单权威） > meta.synopsis（数据源）
  if (video.description || meta?.synopsis) {
    const plot = xmlEscape(video.description || meta?.synopsis || '')
    lines.push(`  <plot>${plot}</plot>`)
  }
  if (video.rating) lines.push(`  <rating>${video.rating}</rating>`)
  // 时长：meta.duration（字符串如 "120 min"）> video.durationSec（秒）
  if (meta?.duration) {
    const mins = parseInt(meta.duration, 10)
    if (!isNaN(mins) && mins > 0) lines.push(`  <runtime>${mins}</runtime>`)
  } else if (video.durationSec) {
    const mins = Math.round(video.durationSec / 60)
    if (mins > 0) lines.push(`  <runtime>${mins}</runtime>`)
  }
  if (meta?.date) lines.push(`  <premiered>${xmlEscape(meta.date)}</premiered>`)
  // 类型
  const genres = meta?.genres ?? video.backupTags ?? []
  for (const g of genres) {
    if (g) lines.push(`  <genre>${xmlEscape(g)}</genre>`)
  }
  // 标签
  for (const t of video.tags ?? []) {
    if (t) lines.push(`  <tag>${xmlEscape(t)}</tag>`)
  }
  // 演员：优先 castProfiles（有角色名），回退 cast/actors（纯名字）
  const profiles = meta?.castProfiles ?? []
  if (profiles.length > 0) {
    for (const actor of profiles) {
      if (actor.name) {
        lines.push('  <actor>')
        lines.push(`    <name>${xmlEscape(actor.name)}</name>`)
        if (actor.character) lines.push(`    <role>${xmlEscape(actor.character)}</role>`)
        if (actor.photo) lines.push(`    <thumb>${xmlEscape(actor.photo)}</thumb>`)
        lines.push('  </actor>')
      }
    }
  } else {
    const names = meta?.cast ?? meta?.actors ?? []
    for (const name of names) {
      if (name) {
        lines.push('  <actor>')
        lines.push(`    <name>${xmlEscape(name)}</name>`)
        lines.push('  </actor>')
      }
    }
  }
  if (meta?.director) lines.push(`  <director>${xmlEscape(meta.director)}</director>`)
  if (meta?.studio) lines.push(`  <studio>${xmlEscape(meta.studio)}</studio>`)
  if (video.series || meta?.series) lines.push(`  <set>${xmlEscape(video.series || meta?.series || '')}</set>`)
  // 唯一 ID：用 meta.externalId（数据源侧的唯一标识）
  if (meta?.externalId) lines.push(`  <uniqueid type="${xmlEscape(meta.source ?? 'unknown')}">${xmlEscape(meta.externalId)}</uniqueid>`)
  // 封面
  if (video.posterPath) lines.push(`  <thumb>${xmlEscape(video.posterPath)}</thumb>`)
  lines.push('</movie>')
  return lines.join('\n')
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
