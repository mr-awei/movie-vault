const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const write = (p, s, crlf) => fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)

// ================= A-1: store.ts 双写收敛 =================
const stP = 'E:/Movie Vault/src/main/lib/store.ts'
let st = read(stP)
const stCrlf = st.includes('\r\n')

const a1flag = `let jsonWriteChecked = false
let jsonWriteEnabled = true
/** A-1: SQLite 已承载数据后 data.json 降级为只读兼容层（不再全量写盘）。 */
function isJsonWriteEnabled(): boolean {
  if (!jsonWriteChecked) {
    jsonWriteChecked = true
    try {
      const row = getDb().prepare('SELECT COUNT(*) AS c FROM videos').get() as { c: number } | undefined
      jsonWriteEnabled = !row || row.c === 0
    } catch {
      jsonWriteEnabled = true
    }
  }
  return jsonWriteEnabled
}

async function writeNow(): Promise<void> {`
if (!st.includes('function isJsonWriteEnabled')) {
  st = st.replace('async function writeNow(): Promise<void> {', a1flag)
  st = st.replace(`async function writeNow(): Promise<void> {
  const data = cache ?? (await ensureLoaded())
  if (!dbPath) dbPath = resolveDbPath()
  const dir = path.dirname(dbPath)`, `async function writeNow(): Promise<void> {
  const data = cache ?? (await ensureLoaded())
  if (!dbPath) dbPath = resolveDbPath()
  if (!isJsonWriteEnabled()) {
    // A-1: SQLite 为主，JSON 只读。不写盘但刷新 mtime 基准，避免外部修改检测把旧 JSON 当外部改动误触发重载。
    const st = await fs.stat(dbPath).catch(() => null)
    lastSelfWriteMs = st?.mtimeMs ?? Date.now()
    lastLoadMs = lastSelfWriteMs
    return
  }
  const dir = path.dirname(dbPath)`)
  st = st.replace(`  if (cache && dbPath) {
    try {
      mkdirSync(path.dirname(dbPath), { recursive: true })`, `  if (cache && dbPath && isJsonWriteEnabled()) {
    try {
      mkdirSync(path.dirname(dbPath), { recursive: true })`)
}
write(stP, st, stCrlf)
console.log('A-1 store.ts ok')

// ================= A-2: IPC 白名单 =================
// video.ts
const vp = 'E:/Movie Vault/src/main/ipc/video.ts'
let v = read(vp)
const vCrlf = v.includes('\r\n')
if (!v.includes('VIDEO_PATCH_KEYS')) {
  v = v.replace("import { IPC } from '../../shared/ipc'", "import { IPC } from '../../shared/ipc'\nimport type { Video } from '../../shared/types'")
  v = v.replace(`export function registerVideoIpc() {
  ipcMain.handle(IPC.videoList, (_e, filter: any) => repo.listVideos(filter ?? {}))
`,
`const VIDEO_PATCH_KEYS = new Set([
  'title', 'year', 'description', 'descriptionSource', 'rating', 'tags', 'tagCategories',
  'backupTags', 'posterPath', 'posterSource', 'posterPathFfmpeg', 'durationSec', 'fileSize',
  'techInfo', 'favorite', 'locked', 'lockedAt', 'meta', 'actors', 'previewPaths',
  'previewVersion', 'mediaStatus', 'previewStatus', 'previewRequestedCount', 'previewGeneratedCount',
  'previewAlgorithmVersion', 'previewUpdatedAt', 'previewLastError', 'lastMetaFetchAt',
  'frameFailedAt', 'lastPlayedAt', 'introCategory', 'region', 'series',
  'playbackPositionSec', 'playbackUpdatedAt', 'nfoPath', 'unrated', 'unlisted', 'nocover'
])
/** A-2: IPC 边界白名单——只允许用户可编辑字段写库，未知键直接丢弃（防注入覆盖系统字段）。 */
function sanitizeVideoPatch(patch: unknown): Partial<Video> {
  if (!patch || typeof patch !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, vv] of Object.entries(patch as Record<string, unknown>)) {
    if (VIDEO_PATCH_KEYS.has(k)) out[k] = vv
  }
  return out as Partial<Video>
}

export function registerVideoIpc() {
  ipcMain.handle(IPC.videoList, (_e, filter: any) => repo.listVideos(filter ?? {}))
`)
  v = v.replace('ipcMain.handle(IPC.videoUpdate, (_e, id: string, patch: any) => repo.updateVideo(id, patch))',
    'ipcMain.handle(IPC.videoUpdate, (_e, id: string, patch: any) => repo.updateVideo(id, sanitizeVideoPatch(patch)))')
}
write(vp, v, vCrlf)
console.log('A-2 video.ts ok')

// settings.ts
const sp = 'E:/Movie Vault/src/main/ipc/settings.ts'
let s2 = read(sp)
const s2Crlf = s2.includes('\r\n')
if (!s2.includes('SETTINGS_PATCH_KEYS')) {
  s2 = s2.replace(`import { startWatching, stopWatching } from '../lib/watcher'
export function registerSettingsIpc() {`,
`import { startWatching, stopWatching } from '../lib/watcher'
/** A-2: settings 白名单——仅允许 Settings 已知键；未知键丢弃（渲染层注入防护）。 */
const SETTINGS_PATCH_KEYS = new Set([
  'playerPath', 'ffmpegPath', 'theme', 'posterDensity', 'dataSource', 'customSourceOrder',
  'disabledSources', 'omdbKey', 'movieDbKey', 'includeAdult', 'openLibraryKey',
  'proxyMode', 'proxyHost', 'proxyPort', 'proxyUser', 'proxyPass', 'autoRescan',
  'fetchConcurrency', 'fetchIntervalMs', 'scanMinSizeMB', 'launchAtLogin', 'scanOnStartup',
  'minimizeToTray', 'defaultSort', 'privacyDefaultOn', 'lockEnabled', 'scanConcurrency',
  'previewBackgroundLoad', 'previewFrameCount', 'previewQualityMode', 'updateSource',
  'autoUpdateFrequency', 'lastUpdateCheck', 'pendingUpdate', 'ignoredUnlistedPaths',
  'noticeDismissed', 'suppressIntroExcelNotice', 'language', 'listViewMode',
  'autoWatchFolders', 'watchDebounceMs'
])
function sanitizeSettingsPatch(patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, vv] of Object.entries(patch as Record<string, unknown>)) {
    if (SETTINGS_PATCH_KEYS.has(k)) out[k] = vv
  }
  return out
}

export function registerSettingsIpc() {`)
  s2 = s2.replace(`  ipcMain.handle(IPC.settingsSet, async (_e, patch: any) => {
    const saved = await repo.saveSettings(patch)`, `  ipcMain.handle(IPC.settingsSet, async (_e, patch: any) => {
    const clean = sanitizeSettingsPatch(patch)
    if (Object.keys(clean).length === 0) return repo.getSettings()
    const saved = await repo.saveSettings(clean)`)
  s2 = s2.replace(`    if (patch.autoWatchFolders !== undefined) {`, `    if (clean.autoWatchFolders !== undefined) {`)
}
write(sp, s2, s2Crlf)
console.log('A-2 settings.ts ok')

// system.ts proxyTest 显式参数
const sysP = 'E:/Movie Vault/src/main/ipc/system.ts'
let sys = read(sysP)
const sysCrlf = sys.includes('\r\n')
if (!sys.includes('proxyTest, async (_e, cfg')) {
  sys = sys.replace(`  ipcMain.handle(IPC.proxyTest, async (_e, settings: any) => {
    return testProxyConnectivity(settings ?? {})
  })`, `  ipcMain.handle(IPC.proxyTest, async (_e, cfg: { proxyMode?: string; proxyHost?: string; proxyPort?: string; proxyUser?: string; proxyPass?: string }) => {
    // A-2: 收敛为显式字段，不再接受任意 settings 对象
    return testProxyConnectivity({
      ...(cfg ?? {}),
      proxyMode: (cfg?.proxyMode ?? 'manual') as 'off' | 'manual' | 'system'
    } as Settings)
  })`)
}
write(sysP, sys, sysCrlf)
console.log('A-2 system.ts ok')

// ================= B-1: scrypt 锁 =================
let s3 = read(sysP)
if (!s3.includes('scryptSync')) {
  s3 = s3.replace(`import { createHash, randomBytes } from 'node:crypto'`, `import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'`)
  s3 = s3.replace(`    const salt = randomBytes(16).toString('hex')
    const hash = createHash('sha256').update(salt + password).digest('hex')
    await repo.saveSettings({ lockHash: hash, lockSalt: salt })`, `    const salt = randomBytes(16).toString('hex')
    const hash = 'v2:' + scryptSync(password, salt, 32).toString('hex')
    await repo.saveSettings({ lockHash: hash, lockSalt: salt })`)
  s3 = s3.replace(`  ipcMain.handle(IPC.lockVerify, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return false
    const hash = createHash('sha256').update(s.lockSalt + password).digest('hex')
    return hash === s.lockHash
  })`, `  ipcMain.handle(IPC.lockVerify, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return false
    return verifyLockPassword(s.lockHash, s.lockSalt, password)
  })`)
  s3 = s3.replace(`  ipcMain.handle(IPC.lockDelete, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return { ok: true } // 本来就没锁
    const hash = createHash('sha256').update(s.lockSalt + password).digest('hex')
    if (hash !== s.lockHash) return { ok: false, error: '密码错误' }
    await repo.saveSettings({ lockHash: undefined, lockSalt: undefined })
    return { ok: true }
  })`, `  ipcMain.handle(IPC.lockDelete, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return { ok: true } // 本来就没锁
    if (!verifyLockPassword(s.lockHash, s.lockSalt, password)) return { ok: false, error: '密码错误' }
    await repo.saveSettings({ lockHash: undefined, lockSalt: undefined })
    return { ok: true }
  })`)
  // helper（放在 registerSystemIpc 前面）
  s3 = s3.replace(/export function registerSystemIpc\(\) {/, `/** B-1: 隐私锁密码校验。v2 前缀 = scrypt（定长比较）；无前缀 = 旧 sha256 格式（兼容迁移）。 */
function verifyLockPassword(lockHash: string, lockSalt: string, password: string): boolean {
  if (lockHash.startsWith('v2:')) {
    const expected = Buffer.from(lockHash.slice(3), 'hex')
    const actual = scryptSync(password, lockSalt, 32)
    return expected.length === actual.length && timingSafeEqual(actual, expected)
  }
  const old = createHash('sha256').update(lockSalt + password).digest()
  return timingSafeEqual(old, Buffer.from(lockHash, 'hex'))
}

export function registerSystemIpc() {`)
}
write(sysP, s3, sysCrlf)
console.log('B-1 system.ts ok')

// ================= C-1: package.json =================
const pkgP = 'E:/Movie Vault/package.json'
let pkg = JSON.parse(read(pkgP))
for (const d of ['xlsx', 'socks', 'app-builder-bin', 'builder-util']) {
  if (pkg.dependencies?.[d]) { delete pkg.dependencies[d]; console.log('C-1 removed dep:', d) }
}
fs.writeFileSync(pkgP, JSON.stringify(pkg, null, 2) + '\n')
console.log('C-1 package.json ok')

// ================= C-2: ui.ts mojibake =================
const uiP = 'E:/Movie Vault/src/renderer/src/store/ui.ts'
let ui = read(uiP)
const uiCrlf = ui.includes('\r\n')
ui = ui.replace('// ---------- 澶氶€夌姸鎬?----------', '// ---------- 多选状态 ----------')
write(uiP, ui, uiCrlf)
console.log('C-2 ui.ts ok')

// ================= C-3: dead code =================
const ddP = 'E:/Movie Vault/src/main/lib/dedup.ts'
let dd = read(ddP)
const ddCrlf = dd.includes('\r\n')
const si = dd.indexOf('export function summarizeDuplicates')
if (si >= 0) {
  const ei = dd.indexOf('\n}', si)
  const end = dd.indexOf('\n', ei + 2)
  dd = dd.slice(0, si) + dd.slice(end + 1)
  // remove trailing blank lines
  dd = dd.replace(/\n{3,}$/, '\n\n')
}
write(ddP, dd, ddCrlf)
console.log('C-3 dedup.ts ok')

const mgP = 'E:/Movie Vault/src/main/lib/migrate.ts'
let mg = read(mgP)
const mgCrlf = mg.includes('\r\n')
const gi = mg.indexOf('export async function getMigrationStatus')
if (gi >= 0) {
  const end = mg.indexOf('\n}\n', gi)
  mg = mg.slice(0, gi) + mg.slice(end + 3)
}
write(mgP, mg, mgCrlf)
console.log('C-3 migrate.ts ok')

// ================= C-4: about.ts TODO =================
const abP = 'E:/Movie Vault/src/shared/about.ts'
let ab = read(abP)
const abCrlf = ab.includes('\r\n')
ab = ab.replace(/ \* After deploying to your own repo, replace the TODO placeholder with the real URL\.\n/, '')
ab = ab.replace('// TODO: 替换为 issue 页或邮箱（mailto:you@example.com）\n', '')
ab = ab.replace('// TODO: replace with issue page or email (mailto:you@example.com)\n', '')
write(abP, ab, abCrlf)
console.log('C-4 about.ts ok')
console.log('ALL DONE')
