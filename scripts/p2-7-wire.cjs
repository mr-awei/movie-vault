const fs = require('fs')

// 1) api-types.ts: add BackupResult type + AppApi methods after appUninstall
const at = 'E:/Movie Vault/src/shared/api-types.ts'
let s = fs.readFileSync(at, 'utf8')
const anchorA = "  appUninstall(keepUser: boolean): Promise<{ ok: boolean; error?: string }>"
if (!s.includes(anchorA)) { console.log('WARN api-types anchor missing'); process.exit(1) }
s = s.replace(anchorA, anchorA + `
  /** P2-7 导出库备份（SQLite + data.json → zip，用户选保存路径） */
  backupExport(): Promise<{ ok: boolean; path?: string; error?: string }>
  /** P2-7 导入库备份（覆盖数据库前自动备份现有 .pre-restore；返回 needsRestart 提示重启） */
  backupImport(): Promise<{ ok: boolean; path?: string; error?: string; needsRestart?: boolean }>`)
fs.writeFileSync(at, s)

// 2) preload/index.ts: wire two methods after appUninstall
const pr = 'E:/Movie Vault/src/preload/index.ts'
let p = fs.readFileSync(pr, 'utf8')
const anchorP = "  appUninstall: (keepUser: boolean) => ipcRenderer.invoke(IPC.appUninstall, keepUser),"
if (!p.includes(anchorP)) { console.log('WARN preload anchor missing'); process.exit(1) }
p = p.replace(anchorP, anchorP + `
  backupExport: () => ipcRenderer.invoke(IPC.backupExport),
  backupImport: () => ipcRenderer.invoke(IPC.backupImport),`)
fs.writeFileSync(pr, p)

// 3) system.ts: register handlers
const sy = 'E:/Movie Vault/src/main/ipc/system.ts'
let t = fs.readFileSync(sy, 'utf8')
const anchorS = "import { detectFfmpeg } from '../lib/ffmpegEnv'"
if (!t.includes(anchorS)) { console.log('WARN system.ts anchor missing'); process.exit(1) }
t = t.replace(anchorS, anchorS + "\nimport { backupExport, backupImport } from '../lib/backup'")
const anchorH = "  // ---------- ffmpeg 截帧：同步生成封面 + 预览帧，立即返回 ----------"
if (!t.includes(anchorH)) { console.log('WARN handler anchor missing'); process.exit(1) }
t = t.replace(anchorH, `  // ---------- P2-7 备份 / 还原 ----------
  ipcMain.handle(IPC.backupExport, () => backupExport())
  ipcMain.handle(IPC.backupImport, () => backupImport())

  // ---------- ffmpeg 截帧：同步生成封面 + 预览帧，立即返回 ----------`)
fs.writeFileSync(sy, t)
console.log('ipc/preload/api-types/system wired')
