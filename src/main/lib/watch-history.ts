import type { WatchHistoryEntry, WatchStats, Video } from '../../shared/types'
import { mutate, getDB } from './store'

/**
 * 观看历史管理模块。
 * 记录每次观看的开始/结束时间、观看时长、播放位置等。
 * 提供统计分析功能：总观看时长、月度趋势、时间分布、最常看标签/演员/导演。
 */

/** 生成唯一 ID */
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 记录一次观看开始。
 * 返回记录 ID，用于结束时更新。
 */
export async function startWatch(video: Video): Promise<string> {
  const entry: WatchHistoryEntry = {
    id: genId(),
    videoId: video.id,
    title: video.title,
    startedAt: Date.now(),
    endedAt: 0,
    durationSec: 0,
    endPositionSec: 0,
    totalDurationSec: video.durationSec ?? video.techInfo?.durationSec
  }

  await mutate((db) => {
    db.watchHistory.push(entry)
  })

  return entry.id
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
  await mutate((db) => {
    const entry = db.watchHistory.find((e) => e.id === entryId && e.videoId === videoId)
    if (!entry) return

    entry.endedAt = Date.now()
    entry.endPositionSec = endPositionSec
    entry.durationSec = actualDurationSec ?? Math.round((entry.endedAt - entry.startedAt) / 1000)

    if (entry.totalDurationSec && entry.totalDurationSec > 0) {
      entry.completion = Math.min(1, endPositionSec / entry.totalDurationSec)
    }
  })
}

/**
 * 获取观看历史列表（按开始时间倒序）。
 */
export async function getWatchHistory(limit = 100): Promise<WatchHistoryEntry[]> {
  const db = await getDB()
  return [...db.watchHistory]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
}

/**
 * 计算观看统计。
 */
export async function getWatchStats(): Promise<WatchStats> {
  const db = await getDB()
  const history = db.watchHistory.filter((e) => e.endedAt > 0 && e.durationSec > 0)

  // 基础统计
  const totalWatchSec = history.reduce((sum, e) => sum + e.durationSec, 0)
  const totalWatchCount = history.length
  const avgWatchSec = totalWatchCount > 0 ? Math.round(totalWatchSec / totalWatchCount) : 0
  const uniqueVideos = new Set(history.map((e) => e.videoId)).size

  // 月度趋势（最近 12 个月）
  const monthlyMap = new Map<string, { watchSec: number; count: number }>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap.set(key, { watchSec: 0, count: 0 })
  }
  for (const e of history) {
    const d = new Date(e.startedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap.has(key)) {
      const m = monthlyMap.get(key)!
      m.watchSec += e.durationSec
      m.count++
    }
  }
  const monthlyTrend = [...monthlyMap.entries()].map(([month, v]) => ({ month, ...v }))

  // 观看时间分布（24 小时）
  const hourlyDistribution: WatchStats['hourlyDistribution'] = []
  for (let h = 0; h < 24; h++) {
    hourlyDistribution.push({ hour: h, watchSec: 0, count: 0 })
  }
  for (const e of history) {
    const d = new Date(e.startedAt)
    const h = d.getHours()
    hourlyDistribution[h].watchSec += e.durationSec
    hourlyDistribution[h].count++
  }

  // 最常观看的标签/演员/导演（需要关联视频信息）
  const videoMap = new Map(db.videos.map((v) => [v.id, v]))
  const tagMap = new Map<string, { watchSec: number; count: number }>()
  const actorMap = new Map<string, { watchSec: number; count: number }>()
  const directorMap = new Map<string, { watchSec: number; count: number }>()

  for (const e of history) {
    const video = videoMap.get(e.videoId)
    if (!video) continue

    const addToMap = (map: Map<string, { watchSec: number; count: number }>, key: string) => {
      if (!key) return
      const existing = map.get(key)
      if (existing) {
        existing.watchSec += e.durationSec
        existing.count++
      } else {
        map.set(key, { watchSec: e.durationSec, count: 1 })
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

  // 最近观看记录
  const recentWatches = [...history]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 20)

  return {
    totalWatchSec,
    totalWatchCount,
    avgWatchSec,
    uniqueVideos,
    monthlyTrend,
    hourlyDistribution,
    topTags,
    topActors,
    topDirectors,
    recentWatches
  }
}

/**
 * 清空观看历史（不可恢复）。
 */
export async function clearWatchHistory(): Promise<void> {
  await mutate((db) => {
    db.watchHistory = []
  })
}
