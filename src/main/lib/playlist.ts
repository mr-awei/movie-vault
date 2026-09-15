import { randomUUID } from 'node:crypto'
import { getDB, mutate } from './store'
import type { Playlist } from '../../shared/types'

/**
 * 播放列表 CRUD 模块。
 * 数据存储在 data.json 的 playlists 数组中，与视频记录解耦。
 */

/** 列出所有播放列表（按创建时间排序） */
export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDB()
  return [...db.playlists].sort((a, b) => a.createdAt - b.createdAt)
}

/** 创建播放列表 */
export async function createPlaylist(name: string): Promise<Playlist> {
  return mutate((db) => {
    const pl: Playlist = {
      id: randomUUID(),
      name: name.trim(),
      videoIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    db.playlists.push(pl)
    return pl
  })
}

/** 删除播放列表 */
export async function deletePlaylist(id: string): Promise<void> {
  await mutate((db) => {
    db.playlists = db.playlists.filter((p) => p.id !== id)
  })
}

/** 重命名播放列表 */
export async function renamePlaylist(id: string, name: string): Promise<Playlist | null> {
  return mutate((db) => {
    const pl = db.playlists.find((p) => p.id === id)
    if (!pl) return null
    pl.name = name.trim()
    pl.updatedAt = Date.now()
    return pl
  })
}

/** 添加视频到播放列表（已存在则不重复添加） */
export async function addVideoToPlaylist(id: string, videoId: string): Promise<Playlist | null> {
  return mutate((db) => {
    const pl = db.playlists.find((p) => p.id === id)
    if (!pl) return null
    if (!pl.videoIds.includes(videoId)) {
      pl.videoIds.push(videoId)
      pl.updatedAt = Date.now()
    }
    return pl
  })
}

/** 从播放列表移除视频 */
export async function removeVideoFromPlaylist(id: string, videoId: string): Promise<Playlist | null> {
  return mutate((db) => {
    const pl = db.playlists.find((p) => p.id === id)
    if (!pl) return null
    const before = pl.videoIds.length
    pl.videoIds = pl.videoIds.filter((v) => v !== videoId)
    if (pl.videoIds.length !== before) pl.updatedAt = Date.now()
    return pl
  })
}

/** 重排播放列表（传入完整的有序 videoIds） */
export async function reorderPlaylist(id: string, videoIds: string[]): Promise<Playlist | null> {
  return mutate((db) => {
    const pl = db.playlists.find((p) => p.id === id)
    if (!pl) return null
    // 只保留播放列表中已存在的视频 id，防止注入不存在的 id
    const existing = new Set(pl.videoIds)
    pl.videoIds = videoIds.filter((v) => existing.has(v))
    pl.updatedAt = Date.now()
    return pl
  })
}

/** 获取单个播放列表 */
export async function getPlaylist(id: string): Promise<Playlist | null> {
  const db = await getDB()
  return db.playlists.find((p) => p.id === id) ?? null
}
