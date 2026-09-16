import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import fsSync from 'node:fs'

/**
 * SQLite 数据库模块（better-sqlite3）。
 *
 * 渐进式迁移策略：
 * - v1：watch_history 表迁移到 SQLite（新增功能，不影响现有数据）
 * - 后续版本：videos/libraries/playlists/settings 逐步迁移
 *
 * 数据库文件位置：%APPDATA%/yinghai/yinghai.db
 * 迁移备份：data.json 在迁移前自动备份为 data.json.bak
 */

let db: Database.Database | null = null
let dbPath = ''

/** 获取数据库文件路径 */
export function getDbPath(): string {
  if (!dbPath) {
    dbPath = path.join(app.getPath('userData'), 'yinghai.db')
  }
  return dbPath
}

/** 获取数据库实例（懒加载） */
export function getDb(): Database.Database {
  if (!db) {
    const p = getDbPath()
    console.log(`[db] 打开数据库: ${p}`)
    db = new Database(p)
    // 启用 WAL 模式，提高并发读写性能
    db.pragma('journal_mode = WAL')
    // 启用外键约束
    db.pragma('foreign_keys = ON')
    // 初始化表结构
    initSchema()
  }
  return db
}

/** 初始化表结构 */
function initSchema(): void {
  if (!db) return

  console.log('[db] 初始化表结构...')

  // watch_history 表：观看历史记录
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL DEFAULT 0,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      end_position_sec REAL NOT NULL DEFAULT 0,
      total_duration_sec REAL,
      completion REAL
    );

    CREATE INDEX IF NOT EXISTS idx_watch_history_video_id ON watch_history(video_id);
    CREATE INDEX IF NOT EXISTS idx_watch_history_started_at ON watch_history(started_at);

    -- libraries 表：媒体库
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      scan_config TEXT,
      extra TEXT
    );

    -- videos 表：视频记录（复杂字段用 JSON 存储）
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      library_id TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      folder_name TEXT,
      title TEXT NOT NULL,
      year INTEGER,
      description TEXT,
      rating REAL,
      duration_sec REAL,
      file_size INTEGER,
      content_hash TEXT,
      phash TEXT,
      poster_path TEXT,
      poster_source TEXT,
      poster_path_ffmpeg TEXT,
      added_at INTEGER NOT NULL,
      last_played_at INTEGER,
      favorite INTEGER DEFAULT 0,
      locked INTEGER DEFAULT 0,
      locked_at INTEGER,
      playback_position_sec REAL,
      playback_updated_at INTEGER,
      nfo_path TEXT,
      intro_category TEXT,
      region TEXT,
      series TEXT,
      tags TEXT,
      tag_categories TEXT,
      backup_tags TEXT,
      actors TEXT,
      tech_info TEXT,
      meta TEXT,
      preview_paths TEXT,
      media_status TEXT,
      preview_status TEXT,
      preview_requested_count INTEGER,
      preview_generated_count INTEGER,
      preview_algorithm_version TEXT,
      preview_updated_at INTEGER,
      preview_last_error TEXT,
      last_meta_fetch_at INTEGER,
      frame_failed_at INTEGER,
      cover_version INTEGER DEFAULT 0,
      preview_version INTEGER DEFAULT 0,
      extra TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_videos_library_id ON videos(library_id);
    CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
    CREATE INDEX IF NOT EXISTS idx_videos_content_hash ON videos(content_hash);
    CREATE INDEX IF NOT EXISTS idx_videos_added_at ON videos(added_at);
    CREATE INDEX IF NOT EXISTS idx_videos_path ON videos(path);

    -- playlists 表：播放列表
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      extra TEXT
    );

    -- playlist_items 表：播放列表项
    CREATE TABLE IF NOT EXISTS playlist_items (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(playlist_id, video_id)
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_items_video_id ON playlist_items(video_id);

    -- settings 表：设置（键值对）
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- preview_tasks 表：预览图生成任务
    CREATE TABLE IF NOT EXISTS preview_tasks (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      requested_count INTEGER NOT NULL DEFAULT 20,
      generated_count INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      algorithm_version TEXT,
      quality_mode TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      last_error TEXT,
      error_code TEXT,
      extra TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_preview_tasks_media ON preview_tasks(media_id);
    CREATE INDEX IF NOT EXISTS idx_preview_tasks_status ON preview_tasks(status);

    -- preview_manifests 表：预览图清单（mediaId → manifest JSON）
    CREATE TABLE IF NOT EXISTS preview_manifests (
      media_id TEXT PRIMARY KEY,
      manifest TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- scene_markers 表：场景标记（v2.12，对标 Stash scene markers）
    CREATE TABLE IF NOT EXISTS scene_markers (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      position_sec REAL NOT NULL,
      name TEXT,
      tags TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scene_markers_video_id ON scene_markers(video_id);
  `)

  ensureColumns()
  console.log('[db] 表结构初始化完成')
}

/** 增量加列（旧库升级）：videos.phash（内容感知哈希，v2.12 重复检测用） */
function ensureColumns(): void {
  const cols = (db!.prepare('PRAGMA table_info(videos)').all() as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes('phash')) {
    db!.prepare('ALTER TABLE videos ADD COLUMN phash TEXT').run()
    console.log('[db] videos.phash 列已添加')
  }
}

/** 关闭数据库连接（应用退出时调用） */
export function closeDb(): void {
  if (db) {
    console.log('[db] 关闭数据库连接')
    db.close()
    db = null
  }
}

/** 备份数据库文件 */
export async function backupDb(): Promise<string> {
  const p = getDbPath()
  const backupPath = `${p}.bak-${Date.now()}`
  await fs.copyFile(p, backupPath)
  console.log(`[db] 数据库已备份: ${backupPath}`)
  return backupPath
}

/** 获取数据库大小（字节） */
export function getDbSize(): number {
  const p = getDbPath()
  try {
    const stat = fsSync.statSync(p)
    return stat.size
  } catch {
    return 0
  }
}

/** 执行 SQL 查询（调试用） */
export function execSql(sql: string): unknown {
  const d = getDb()
  return d.exec(sql)
}
