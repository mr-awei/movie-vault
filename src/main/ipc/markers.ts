import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { SceneMarker } from '../../shared/types'
import { getDb } from '../lib/db'

/** 生成唯一 ID */
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function rowToMarker(r: Record<string, unknown>): SceneMarker {
  let tags: string[] = []
  try {
    tags = r.tags ? (JSON.parse(r.tags as string) as string[]) : []
  } catch {
    tags = []
  }
  return {
    id: r.id as string,
    videoId: r.video_id as string,
    positionSec: r.position_sec as number,
    name: (r.name as string) ?? undefined,
    tags,
    createdAt: r.created_at as number
  }
}

/** 场景标记 IPC（v2.12，对标 Stash scene markers） */
export function registerMarkersIpc() {
  ipcMain.handle(IPC.markerList, (_e, videoId: string): SceneMarker[] => {
    if (!videoId) return []
    const rows = getDb()
      .prepare('SELECT * FROM scene_markers WHERE video_id = ? ORDER BY position_sec ASC')
      .all(videoId) as Array<Record<string, unknown>>
    return rows.map(rowToMarker)
  })

  ipcMain.handle(IPC.markerCreate, (_e, videoId: string, positionSec: number, name: string, tags: string[]): SceneMarker | null => {
    if (!videoId || !Number.isFinite(positionSec) || positionSec < 0) return null
    const marker: SceneMarker = {
      id: genId(),
      videoId,
      positionSec: Math.round(positionSec),
      name: (name ?? '').trim() || undefined,
      tags: Array.isArray(tags) ? [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))] : [],
      createdAt: Date.now()
    }
    getDb()
      .prepare('INSERT INTO scene_markers (id, video_id, position_sec, name, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(marker.id, marker.videoId, marker.positionSec, marker.name ?? null, JSON.stringify(marker.tags), marker.createdAt)
    return marker
  })

  ipcMain.handle(IPC.markerDelete, (_e, id: string): boolean => {
    if (!id) return false
    const r = getDb().prepare('DELETE FROM scene_markers WHERE id = ?').run(id)
    return r.changes > 0
  })
}
