import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'

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
  `)

  console.log('[db] 表结构初始化完成')
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
    const stat = require('node:fs').statSync(p)
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
