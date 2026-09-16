const fs = require('fs')
const p = 'E:/Movie Vault/src/main/lib/store.ts'
let s = fs.readFileSync(p, 'utf8')

// 1) import getDb (SQLite) for migration-complete check
if (!s.includes("from './db'")) {
  s = s.replace("import { cleanGenreName } from './image-util'", "import { cleanGenreName } from './image-util'\nimport { getDb } from './db'")
}

// 2) strip previewTasks/previewManifests from in-memory DB after load when SQLite has data (migration done)
//    -> they are no longer written back to data.json (SQLite tables are the source of truth)
const anchor = "    migrateInPlace(current)\n    cache = current"
if (!s.includes(anchor)) { console.log('WARN anchor not found'); process.exit(1) }
const ne = `    migrateInPlace(current)
    // P2-5: previewTasks/previewManifests 主存储已迁移到 SQLite 表（preview_tasks/preview_manifests），
    // data.json 中的旧字段仅一次性迁移用；SQLite 已有数据时不再写回 data.json（避免双写/膨胀）。
    try {
      const row = getDb().prepare('SELECT COUNT(*) AS c FROM videos').get() as { c: number } | undefined
      if (row && row.c > 0) {
        delete current.previewTasks
        delete current.previewManifests
      }
    } catch { /* SQLite 未就绪时保留旧字段，不影响 JSON 侧读取 */ }
    cache = current`
s = s.replace(anchor, ne)

fs.writeFileSync(p, s)
console.log('store.ts P2-5 patched')
