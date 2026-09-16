import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import type { Playlist } from '../../shared/types'

/**
 * 播放列表 CRUD 模块（SQLite 版）。
 * 数据存储在 playlists / playlist_items 两张表中。
 * 函数签名与旧版 JSON 实现保持一致，调用方无需改动。
 */

function rowToPlaylist(row: Record<string, unknown>, videoIds: string[]): Playlist {
  return {
    id: row.id as string,
    name: row.name as string,
    videoIds,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  }
}

/** 列出所有播放列表（按创建时间排序，含各自 videoIds） */
export async function listPlaylists(): Promise<Playlist[]> {
  const db = getDb()
  const plRows = db.prepare('SELECT * FROM playlists ORDER BY created_at').all() as Array<Record<string, unknown>>
  const itemRows = db.prepare('SELECT playlist_id, video_id FROM playlist_items ORDER BY position').all() as Array<{ playlist_id: string; video_id: string }>
  const byPl = new Map<string, string[]>()
  for (const it of itemRows) {
    if (!byPl.has(it.playlist_id)) byPl.set(it.playlist_id, [])
    byPl.get(it.playlist_id)!.push(it.video_id)
  }
  return plRows.map((r) => rowToPlaylist(r, byPl.get(r.id as string) ?? []))
}

/** 创建播放列表 */
export async function createPlaylist(name: string): Promise<Playlist> {
  const pl: Playlist = {
    id: randomUUID(),
    name: name.trim(),
    videoIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  getDb().prepare('INSERT INTO playlists (id, name, created_at, updated_at, extra) VALUES (?, ?, ?, ?, ?)').run(
    pl.id,
    pl.name,
    pl.createdAt,
    pl.updatedAt,
    JSON.stringify({})
  )
  return pl
}

/** 删除播放列表 */
export async function deletePlaylist(id: string): Promise<void> {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(id)
    db.prepare('DELETE FROM playlists WHERE id = ?').run(id)
  })
  tx()
}

/** 重命名播放列表 */
export async function renamePlaylist(id: string, name: string): Promise<Playlist | null> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const trimmed = name.trim()
  db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(trimmed, Date.now(), id)
  const items = db.prepare('SELECT video_id FROM playlist_items WHERE playlist_id = ? ORDER BY position').all(id) as Array<{ video_id: string }>
  return rowToPlaylist({ ...row, name: trimmed, updated_at: Date.now() }, items.map((i) => i.video_id))
}

/** 获取单个播放列表 */
export async function getPlaylist(id: string): Promise<Playlist | null> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const items = db.prepare('SELECT video_id FROM playlist_items WHERE playlist_id = ? ORDER BY position').all(id) as Array<{ video_id: string }>
  return rowToPlaylist(row, items.map((i) => i.video_id))
}

/** 添加视频到播放列表（已存在则不重复添加） */
export async function addVideoToPlaylist(id: string, videoId: string): Promise<Playlist | null> {
  const db = getDb()
  const pl = await getPlaylist(id)
  if (!pl) return null
  if (!pl.videoIds.includes(videoId)) {
    const tx = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO playlist_items (id, playlist_id, video_id, position, created_at) VALUES (?, ?, ?, ?, ?)').run(
        `${id}-${videoId}`,
        id,
        videoId,
        pl.videoIds.length,
        Date.now()
      )
      db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id)
    })
    tx()
  }
  return getPlaylist(id)
}

/** 从播放列表移除视频 */
export async function removeVideoFromPlaylist(id: string, videoId: string): Promise<Playlist | null> {
  const db = getDb()
  const pl = await getPlaylist(id)
  if (!pl) return null
  const before = pl.videoIds.length
  if (before === 0) return pl
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM playlist_items WHERE playlist_id = ? AND video_id = ?').run(id, videoId)
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id)
    // 重排 position，保持连续
    const items = db.prepare('SELECT id, video_id FROM playlist_items WHERE playlist_id = ? ORDER BY position').all(id) as Array<{ id: string; video_id: string }>
    const upd = db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?')
    items.forEach((it, idx) => upd.run(idx, it.id))
  })
  tx()
  return getPlaylist(id)
}

/** 重排播放列表（传入完整的有序 videoIds） */
export async function reorderPlaylist(id: string, videoIds: string[]): Promise<Playlist | null> {
  const db = getDb()
  const pl = await getPlaylist(id)
  if (!pl) return null
  // 只保留播放列表中已存在的视频 id，防止注入不存在的 id；同时去重（P2-8：UI 传入重复 id 会写重复 position）
  const existing = new Set(pl.videoIds)
  const ordered = [...new Set(videoIds)].filter((v) => existing.has(v))
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE playlist_items SET position = ? WHERE playlist_id = ? AND video_id = ?')
    ordered.forEach((vid, idx) => upd.run(idx, id, vid))
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  })
  tx()
  return getPlaylist(id)
}
