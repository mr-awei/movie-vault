import type { WatchHistoryEntry, WatchStats, Video } from '../../shared/types'
import { getDb } from './db'

/**
 * 观看历史管理模块（SQLite 版本）。
 * 记录每次观看的开始/结束时间、观看时长、播放位置等。
 * 提供统计分析功能：总观看时长、月度趋势、时间分布、最常看标签/演员/导演。
 *
 * 数据存储：SQLite（better-sqlite3），表名 watch_history。
 * 迁移说明：v2.9.3 起观看历史从 JSON data.json 迁移到 SQLite，提升查询性能。
 */

/** 生成唯一 ID */
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 标签拆分分隔符（与 UI 展示口径一致）：斜杠 / 顿号 / 逗号 / 空白 */
const TAG_SPLIT_RE = /[/\\、,，\s]+/

/** 解析视频的标签源为独立标签列表：
 *  - 优先结构化 tag_categories（跳过简介/评分等元数据分类），退化平铺 tags
 *  - 对每个候选再做宽分隔拆分（"画中世界 妖异 爱情" → 3 个标签），去空去重
 *  与 UI 侧栏筛选/详情展示的标签口径保持一致。 */
function splitTagSource(tagsJson: string | null, tagCategoriesJson: string | null): string[] {
  const set = new Set<string>()
  const push = (list: string[] | undefined | null) => {
    for (const raw of list ?? []) {
      for (const t of String(raw).split(TAG_SPLIT_RE)) {
        const trimmed = t.trim()
        if (trimmed) set.add(trimmed)
      }
    }
  }
  if (tagCategoriesJson) {
    try {
      const cats = JSON.parse(tagCategoriesJson) as Record<string, string[]>
      // 跳过简介/评分等非标签分类
      const NON_TAG = new Set(['简介', '评分', '推荐', '描述', 'desc', 'description', 'summary', '介绍'])
      const hasRealTag = Object.entries(cats).some(
        ([name, list]) => !NON_TAG.has(name.trim()) && (list ?? []).some((t) => (t?.trim() ?? ''))
      )
      if (hasRealTag) {
        for (const [name, list] of Object.entries(cats)) {
          if (NON_TAG.has(name.trim())) continue
          push(list)
        }
        return [...set]
      }
    } catch {
      /* corrupted, fall through to tags */
    }
  }
  if (tagsJson) {
    try {
      push(JSON.parse(tagsJson) as string[])
    } catch {
      /* corrupted, ignore */
    }
  }
  return [...set]
}

/**
 * 记录一次观看开始。
 * 返回记录 ID，用于结束时更新。
 */
export async function startWatch(video: Video): Promise<string> {
  const id = genId()
  const db = getDb()

  const stmt = db.prepare(`
    INSERT INTO watch_history (id, video_id, title, started_at, ended_at, duration_sec, end_position_sec, total_duration_sec)
    VALUES (?, ?, ?, ?, 0, 0, 0, ?)
  `)
  stmt.run(id, video.id, video.title, Date.now(), video.durationSec ?? video.techInfo?.durationSec ?? null)

  return id
}

/**
 * 结束一次观看，更新结束时间、观看时长、播放位置。
 */
export async function endWatch(
  videoId: string,
  entryId: string,
  endPositionSec: number,
  actualDurationSec?: number
): Promise<void> {
  const db = getDb()

  // 先获取开始时间，用于计算时长
  const row = db.prepare('SELECT started_at, total_duration_sec FROM watch_history WHERE id = ? AND video_id = ?').get(entryId, videoId) as { started_at: number; total_duration_sec: number | null } | undefined
  if (!row) return

  const endedAt = Date.now()
  const durationSec = actualDurationSec ?? Math.round((endedAt - row.started_at) / 1000)
  const completion = row.total_duration_sec && row.total_duration_sec > 0 ? Math.min(1, endPositionSec / row.total_duration_sec) : null

  const stmt = db.prepare(`
    UPDATE watch_history
    SET ended_at = ?, duration_sec = ?, end_position_sec = ?, completion = ?
    WHERE id = ? AND video_id = ?
  `)
  stmt.run(endedAt, durationSec, endPositionSec, completion, entryId, videoId)
}

/**
 * 删除一条观看记录（P1-3：PotPlayer 单实例委托场景，进程秒退时清理孤儿记录）。
 */
export async function deleteWatch(entryId: string): Promise<void> {
  const db = getDb()
  db.prepare('DELETE FROM watch_history WHERE id = ?').run(entryId)
}

/**
 * 获取观看历史列表（按开始时间倒序）。
 */
export async function getWatchHistory(limit = 100): Promise<WatchHistoryEntry[]> {
  const db = getDb()

  const rows = db.prepare(`
    SELECT id, video_id, title, started_at, ended_at, duration_sec, end_position_sec, total_duration_sec, completion
    FROM watch_history
    WHERE ended_at > 0
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string
    video_id: string
    title: string
    started_at: number
    ended_at: number
    duration_sec: number
    end_position_sec: number
    total_duration_sec: number | null
    completion: number | null
  }>

  return rows.map((r) => ({
    id: r.id,
    videoId: r.video_id,
    title: r.title,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSec: r.duration_sec,
    endPositionSec: r.end_position_sec,
    totalDurationSec: r.total_duration_sec ?? undefined,
    completion: r.completion ?? undefined
  }))
}

/**
 * 计算观看统计。
 */
export async function getWatchStats(): Promise<WatchStats> {
  const db = getDb()

  // 基础统计
  const basic = db.prepare(`
    SELECT
      COUNT(*) as total_count,
      COALESCE(SUM(duration_sec), 0) as total_watch_sec,
      COUNT(DISTINCT video_id) as unique_videos
    FROM watch_history
    WHERE ended_at > 0 AND duration_sec > 0
  `).get() as { total_count: number; total_watch_sec: number; unique_videos: number }

  const totalWatchSec = basic.total_watch_sec
  const totalWatchCount = basic.total_count
  const avgWatchSec = totalWatchCount > 0 ? Math.round(totalWatchSec / totalWatchCount) : 0
  const uniqueVideos = basic.unique_videos

  // 月度趋势（最近 12 个月）
  const monthlyMap = new Map<string, { watchSec: number; count: number }>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap.set(key, { watchSec: 0, count: 0 })
  }

  const monthlyRows = db.prepare(`
    SELECT
      strftime('%Y-%m', datetime(started_at / 1000, 'unixepoch')) as month,
      SUM(duration_sec) as watch_sec,
      COUNT(*) as count
    FROM watch_history
    WHERE ended_at > 0 AND duration_sec > 0
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all() as Array<{ month: string; watch_sec: number; count: number }>

  for (const row of monthlyRows) {
    if (monthlyMap.has(row.month)) {
      monthlyMap.set(row.month, { watchSec: row.watch_sec, count: row.count })
    }
  }

  const monthlyTrend = [...monthlyMap.entries()].map(([month, v]) => ({ month, ...v }))

  // 每周趋势（最近 12 周）
  // 周key使用与SQLite strftime('%Y-W%W')一致的算法（周一为一周开始，00-53周）
  const weekKeyOf = (d: Date): string => {
    const startOfYear = new Date(d.getFullYear(), 0, 1)
    const doy = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000) + 1
    const wd = d.getDay() // 0=周日 ... 6=周六
    const week = Math.floor((doy + 6 - wd) / 7)
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
  }
  const weeklyMap = new Map<string, { watchSec: number; count: number }>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7)
    weeklyMap.set(weekKeyOf(d), { watchSec: 0, count: 0 })
  }

  const weeklyRows = db.prepare(`
    SELECT
      strftime('%Y-W%W', datetime(started_at / 1000, 'unixepoch')) as week,
      SUM(duration_sec) as watch_sec,
      COUNT(*) as count
    FROM watch_history
    WHERE ended_at > 0 AND duration_sec > 0
    GROUP BY week
    ORDER BY week DESC
    LIMIT 12
  `).all() as Array<{ week: string; watch_sec: number; count: number }>

  for (const row of weeklyRows) {
    if (weeklyMap.has(row.week)) {
      weeklyMap.set(row.week, { watchSec: row.watch_sec, count: row.count })
    }
  }

  const weeklyTrend = [...weeklyMap.entries()].map(([week, v]) => ({ week, ...v }))

  // 观看时间分布（24 小时）
  const hourlyDistribution: WatchStats['hourlyDistribution'] = []
  for (let h = 0; h < 24; h++) {
    hourlyDistribution.push({ hour: h, watchSec: 0, count: 0 })
  }

  const hourlyRows = db.prepare(`
    SELECT
      CAST(strftime('%H', datetime(started_at / 1000, 'unixepoch')) as INTEGER) as hour,
      SUM(duration_sec) as watch_sec,
      COUNT(*) as count
    FROM watch_history
    WHERE ended_at > 0 AND duration_sec > 0
    GROUP BY hour
  `).all() as Array<{ hour: number; watch_sec: number; count: number }>

  for (const row of hourlyRows) {
    if (row.hour >= 0 && row.hour < 24) {
      hourlyDistribution[row.hour] = { hour: row.hour, watchSec: row.watch_sec, count: row.count }
    }
  }


  // 完成度分布（0-25%, 25-50%, 50-75%, 75-100%）
  const completionRanges = [
    { range: '0-25%', min: 0, max: 0.25 },
    { range: '25-50%', min: 0.25, max: 0.5 },
    { range: '50-75%', min: 0.5, max: 0.75 },
    { range: '75-100%', min: 0.75, max: 1.01 }
  ]
  const completionDistribution = completionRanges.map((r) => {
    const row = db.prepare(`
      SELECT COALESCE(SUM(duration_sec), 0) as watch_sec, COUNT(*) as count
      FROM watch_history
      WHERE ended_at > 0 AND duration_sec > 0 AND completion IS NOT NULL
        AND completion >= ? AND completion < ?
    `).get(r.min, r.max) as { watch_sec: number; count: number }
    return { range: r.range, watchSec: row.watch_sec, count: row.count }
  })

  // 最常观看的标签/演员/导演（需要关联视频信息，从 JSON store 读取）
  // 注意：这部分统计需要视频的元数据，暂时从 repo 读取
  // P1-11：只取聚合所需列（id/tags/actors/meta），不再 listVideos 全字段加载整库
  const videoRows = getDb().prepare('SELECT id, tags, tag_categories, actors, meta FROM videos').all() as Array<{
    id: string
    tags: string | null
    tag_categories: string | null
    actors: string | null
    meta: string | null
  }>
  const videoMap = new Map<string, { tags?: string[]; actors?: string[]; meta?: { director?: string } }>()
  for (const r of videoRows) {
    let meta: { director?: string } | null = null
    try {
      meta = r.meta ? (JSON.parse(r.meta) as { director?: string }) : null
    } catch {
      meta = null
    }
    // 标签：优先结构化 tag_categories（与 UI 筛选/展示口径一致），退化平铺 tags；
    // 同时把「合并串」（如 "画中世界 妖异 爱情" / "古装/欲望/夫妻"）按分隔符拆成独立标签，
    // 避免统计面板把多个标签挤成一行。
    let tags: string[] = []
    let actors: string[] = []
    try {
      tags = splitTagSource(r.tags, r.tag_categories)
      actors = r.actors ? (JSON.parse(r.actors) as string[]) : []
    } catch {
      /* ignore corrupted fields */
    }
    videoMap.set(r.id, { tags, actors, meta: meta ?? undefined })
  }

  const tagMap = new Map<string, { watchSec: number; count: number }>()
  const actorMap = new Map<string, { watchSec: number; count: number }>()
  const directorMap = new Map<string, { watchSec: number; count: number }>()

  const allHistory = db.prepare(`
    SELECT video_id, duration_sec
    FROM watch_history
    WHERE ended_at > 0 AND duration_sec > 0
  `).all() as Array<{ video_id: string; duration_sec: number }>

  for (const entry of allHistory) {
    const video = videoMap.get(entry.video_id)
    if (!video) continue

    const addToMap = (map: Map<string, { watchSec: number; count: number }>, key: string) => {
      if (!key) return
      const existing = map.get(key)
      if (existing) {
        existing.watchSec += entry.duration_sec
        existing.count++
      } else {
        map.set(key, { watchSec: entry.duration_sec, count: 1 })
      }
    }

    // 标签
    if (video.tags) {
      for (const tag of video.tags) addToMap(tagMap, tag)
    }
    // 演员
    if (video.actors) {
      for (const actor of video.actors) addToMap(actorMap, actor)
    }
    // 导演
    if (video.meta?.director) {
      addToMap(directorMap, video.meta.director)
    }
  }

  const topTags = [...tagMap.entries()]
    .sort((a, b) => b[1].watchSec - a[1].watchSec)
    .slice(0, 10)
    .map(([tag, v]) => ({ tag, ...v }))

  const topActors = [...actorMap.entries()]
    .sort((a, b) => b[1].watchSec - a[1].watchSec)
    .slice(0, 10)
    .map(([actor, v]) => ({ actor, ...v }))

  const topDirectors = [...directorMap.entries()]
    .sort((a, b) => b[1].watchSec - a[1].watchSec)
    .slice(0, 10)
    .map(([director, v]) => ({ director, ...v }))


  // 观看时长排行榜（Top 20 视频）
  const topVideosRows = db.prepare(`
    SELECT video_id, title, SUM(duration_sec) as watch_sec, COUNT(*) as count
    FROM watch_history
    WHERE ended_at > 0 AND duration_sec > 0
    GROUP BY video_id
    ORDER BY watch_sec DESC
    LIMIT 20
  `).all() as Array<{ video_id: string; title: string; watch_sec: number; count: number }>

  const topVideosByDuration = topVideosRows.map((r) => ({
    videoId: r.video_id,
    title: r.title,
    watchSec: r.watch_sec,
    count: r.count
  }))

  // 最近观看记录
  const recentWatches = await getWatchHistory(20)

  return {
    totalWatchSec,
    totalWatchCount,
    avgWatchSec,
    uniqueVideos,
    monthlyTrend,
    weeklyTrend,
    hourlyDistribution,
    completionDistribution,
    topTags,
    topActors,
    topDirectors,
    topVideosByDuration,
    recentWatches
  }
}

/**
 * 清空观看历史（不可恢复）。
 */
export async function clearWatchHistory(): Promise<void> {
  const db = getDb()
  db.exec('DELETE FROM watch_history')
  console.log('[watch-history] 观看历史已清空')
}
