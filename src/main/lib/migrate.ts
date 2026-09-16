import { app } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { getDb } from './db'
import type { Library, Video, Playlist, Settings } from '../../shared/types'

/**
 * 数据迁移模块：从 JSON (data.json) 迁移到 SQLite。
 *
 * 迁移策略：
 * 1. 备份 data.json 为 data.json.bak-<timestamp>
 * 2. 清空 SQLite 表（libraries/videos/playlists/playlist_items/settings）
 * 3. 批量插入数据
 * 4. 记录迁移状态到 migration_status 表
 * 5. 迁移完成后，应用可以选择使用 SQLite 存储（通过设置开关）
 *
 * 回滚方案：删除 SQLite 数据库文件，恢复 data.json 备份。
 */

interface DBShape {
  libraries: Library[]
  videos: Video[]
  settings: Settings
  playlists: Playlist[]
}

/** 迁移状态 */
export interface MigrationStatus {
  migrated: boolean
  migratedAt?: number
  sourceVersion?: string
  recordCount?: {
    libraries: number
    videos: number
    playlists: number
  }
}

/** 获取 data.json 路径 */
function getDataJsonPath(): string {
  return path.join(app.getPath('userData'), 'data.json')
}

/** 读取 data.json */
async function readDataJson(): Promise<DBShape | null> {
  try {
    const p = getDataJsonPath()
    const raw = await fs.readFile(p, 'utf-8')
    return JSON.parse(raw) as DBShape
  } catch (err) {
    console.warn('[migrate] 读取 data.json 失败:', (err as Error).message)
    return null
  }
}

/** 备份 data.json */
async function backupDataJson(): Promise<string> {
  const p = getDataJsonPath()
  const backupPath = `${p}.bak-${Date.now()}`
  await fs.copyFile(p, backupPath)
  console.log(`[migrate] data.json 已备份: ${backupPath}`)
  return backupPath
}

/** 清空 SQLite 表 */
function clearTables(): void {
  const db = getDb()
  db.exec(`
    DELETE FROM playlist_items;
    DELETE FROM playlists;
    DELETE FROM videos;
    DELETE FROM libraries;
    DELETE FROM settings;
  `)
  console.log('[migrate] SQLite 表已清空')
}

/** 迁移 libraries */
function migrateLibraries(libraries: Library[]): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO libraries (id, name, folder_path, created_at, updated_at, scan_config, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((items: Library[]) => {
    for (const lib of items) {
      stmt.run(
        lib.id,
        lib.name,
        lib.folderPath,
        lib.createdAt,
        lib.createdAt,
        JSON.stringify({}),
        JSON.stringify({
          introExcelPath: lib.introExcelPath,
          imagePriority: lib.imagePriority
        })
      )
    }
  })

  insertMany(libraries)
  console.log(`[migrate] libraries 迁移完成: ${libraries.length} 条`)
  return libraries.length
}

/** 迁移 videos */
function migrateVideos(videos: Video[]): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO videos (
      id, library_id, path, file_name, folder_name, title, year, description, rating,
      duration_sec, file_size, content_hash, poster_path, poster_source, poster_path_ffmpeg,
      added_at, last_played_at, favorite, locked, locked_at,
      playback_position_sec, playback_updated_at, nfo_path, intro_category, region, series,
      tags, tag_categories, backup_tags, actors, tech_info, meta, preview_paths,
      media_status, preview_status, preview_requested_count, preview_generated_count,
      preview_algorithm_version, preview_updated_at, preview_last_error,
      last_meta_fetch_at, frame_failed_at, cover_version, preview_version, extra
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
  `)

  const insertMany = db.transaction((items: Video[]) => {
    for (const v of items) {
      stmt.run(
        v.id,
        v.libraryId,
        v.path,
        v.fileName,
        v.folderName ?? null,
        v.title,
        v.year ?? null,
        v.description ?? null,
        v.rating ?? null,
        v.durationSec ?? null,
        v.fileSize ?? null,
        v.contentHash ?? null,
        v.posterPath ?? null,
        v.posterSource ?? null,
        v.posterPathFfmpeg ?? null,
        v.addedAt,
        v.lastPlayedAt ?? null,
        v.favorite ? 1 : 0,
        v.locked ? 1 : 0,
        v.lockedAt ?? null,
        v.playbackPositionSec ?? null,
        v.playbackUpdatedAt ?? null,
        (v as any).nfoPath ?? null,
        v.introCategory ?? null,
        v.region ?? null,
        v.series ?? null,
        JSON.stringify(v.tags ?? []),
        JSON.stringify(v.tagCategories ?? {}),
        JSON.stringify(v.backupTags ?? []),
        JSON.stringify(v.actors ?? []),
        JSON.stringify(v.techInfo ?? null),
        JSON.stringify(v.meta ?? null),
        JSON.stringify(v.previewPaths ?? []),
        v.mediaStatus ?? null,
        v.previewStatus ?? null,
        v.previewRequestedCount ?? null,
        v.previewGeneratedCount ?? null,
        v.previewAlgorithmVersion ?? null,
        v.previewUpdatedAt ?? null,
        v.previewLastError ?? null,
        v.lastMetaFetchAt ?? null,
        v.frameFailedAt ?? null,
        v.coverVersion ?? 0,
        v.previewVersion ?? 0,
        JSON.stringify({
          descriptionSource: v.descriptionSource,
          nocover: (v as any).nocover,
          unlisted: (v as any).unlisted,
          unrated: (v as any).unrated
        })
      )
    }
  })

  insertMany(videos)
  console.log(`[migrate] videos 迁移完成: ${videos.length} 条`)
  return videos.length
}

/** 迁移 playlists */
function migratePlaylists(playlists: Playlist[]): number {
  const db = getDb()
  const playlistStmt = db.prepare(`
    INSERT OR REPLACE INTO playlists (id, name, created_at, updated_at, extra)
    VALUES (?, ?, ?, ?, ?)
  `)
  const itemStmt = db.prepare(`
    INSERT OR REPLACE INTO playlist_items (id, playlist_id, video_id, position, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((items: Playlist[]) => {
    for (const pl of items) {
      playlistStmt.run(
        pl.id,
        pl.name,
        pl.createdAt,
        pl.updatedAt ?? Date.now(),
        JSON.stringify({})
      )
      const videoIds = (pl as any).videoIds ?? []
      videoIds.forEach((videoId: string, idx: number) => {
        itemStmt.run(
          `${pl.id}-${videoId}`,
          pl.id,
          videoId,
          idx,
          pl.createdAt
        )
      })
    }
  })

  insertMany(playlists)
  console.log(`[migrate] playlists 迁移完成: ${playlists.length} 条`)
  return playlists.length
}

/** 迁移 settings */
function migrateSettings(settings: Settings): void {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
  `)

  // 将 settings 对象拆分为键值对存储
  const entries = Object.entries(settings)
  const insertMany = db.transaction((items: Array<[string, unknown]>) => {
    for (const [key, value] of items) {
      stmt.run(key, JSON.stringify(value), Date.now())
    }
  })

  insertMany(entries)
  console.log(`[migrate] settings 迁移完成: ${entries.length} 个键`)
}

/** 执行完整迁移 */
export async function migrateFromJsonToSqlite(): Promise<MigrationStatus> {
  console.log('[migrate] 开始从 JSON 迁移到 SQLite...')

  // 1. 读取 data.json
  const data = await readDataJson()
  if (!data) {
    throw new Error('无法读取 data.json，迁移失败')
  }

  // 2. 备份 data.json
  const backupPath = await backupDataJson()

  // 3. 清空 SQLite 表
  clearTables()

  // 4. 迁移数据
  const libraryCount = migrateLibraries(data.libraries ?? [])
  const videoCount = migrateVideos(data.videos ?? [])
  const playlistCount = migratePlaylists(data.playlists ?? [])
  migrateSettings(data.settings)

  // 5. 记录迁移状态
  const status: MigrationStatus = {
    migrated: true,
    migratedAt: Date.now(),
    sourceVersion: 'json-v2',
    recordCount: {
      libraries: libraryCount,
      videos: videoCount,
      playlists: playlistCount
    }
  }

  console.log('[migrate] 迁移完成！', status)
  console.log(`[migrate] 备份文件: ${backupPath}`)

  return status
}

/** 检查迁移状态 */
export function getMigrationStatus(): MigrationStatus {
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = '_migration_status'").get() as { value: string } | undefined
    if (row) {
      return JSON.parse(row.value) as MigrationStatus
    }
  } catch {
    // 忽略
  }
  return { migrated: false }
}

/** 回滚：删除 SQLite 数据库，恢复 JSON */
export async function rollbackToJson(): Promise<void> {
  const dbPath = path.join(app.getPath('userData'), 'yinghai.db')
  try {
    await fs.unlink(dbPath)
    console.log('[migrate] SQLite 数据库已删除，已回滚到 JSON 存储')
  } catch (err) {
    console.warn('[migrate] 删除 SQLite 数据库失败:', (err as Error).message)
  }
}
