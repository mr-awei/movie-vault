const fs = require('fs')
const p = 'E:/Movie Vault/src/shared/ipc.ts'
let s = fs.readFileSync(p, 'utf8')
const crlf = s.includes('\r\n')
if (crlf) s = s.replace(/\r\n/g, '\n')
const anchor = "  // 文件夹监控事件（主进程 -> 渲染进程）：检测到文件变化\n  watcherEvent: 'watcher:event'"
if (!s.includes(anchor)) { console.log('WARN anchor missing'); process.exit(1) }
s = s.replace(anchor, anchor + ",\n  // P2-7 备份 / 还原（zip）\n  backupExport: 'backup:export',\n  backupImport: 'backup:import'")
if (crlf) s = s.replace(/\n/g, '\r\n')
fs.writeFileSync(p, s)
console.log('ipc channels added:', s.includes('backupExport'))
