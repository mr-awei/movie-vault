const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const write = (p, s, crlf) => fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)

// ============ 1) i18n keys (zh + en) ============
const zhP = 'E:/Movie Vault/src/shared/i18n/locales/zh-CN.ts'
const enP = 'E:/Movie Vault/src/shared/i18n/locales/en-US.ts'
let zh = read(zhP)
let en = read(enP)
const zhKeys = [
  "'playlist.duplicateName': '已存在同名播放列表',",
  "'playlist.rename': '重命名',",
  "'playlist.newNamePlaceholder': '播放列表名称，回车创建',",
  "'playlist.createNew': '新建播放列表',",
  "'sidebar.diskStats': '磁盘统计',",
  "'sidebar.watchStats': '观看统计',",
  "'entry.removeFromList': '从当前列表移除',",
  "'entry.addToPlaylist': '添加到播放列表',"
]
const enKeys = [
  "'playlist.duplicateName': 'A playlist with this name already exists',",
  "'playlist.rename': 'Rename',",
  "'playlist.newNamePlaceholder': 'Playlist name, press Enter to create',",
  "'playlist.createNew': 'New playlist',",
  "'sidebar.diskStats': 'Disk stats',",
  "'sidebar.watchStats': 'Watch stats',",
  "'entry.removeFromList': 'Remove from this list',",
  "'entry.addToPlaylist': 'Add to playlist',"
]
const zhAnchor = "'playlist.delete': "
const enAnchor = "'playlist.delete': "
if (!zh.includes(zhAnchor) || !en.includes(enAnchor)) { console.log('WARN anchor missing'); process.exit(1) }
for (const k of zhKeys) {
  if (!zh.includes(k.split(':')[0])) {
    const i = zh.indexOf(zhAnchor); const le = zh.indexOf('\n', i)
    zh = zh.slice(0, le + 1) + '  ' + k + '\n' + zh.slice(le + 1)
  }
}
for (const k of enKeys) {
  if (!en.includes(k.split(':')[0])) {
    const i = en.indexOf(enAnchor); const le = en.indexOf('\n', i)
    en = en.slice(0, le + 1) + '  ' + k + '\n' + en.slice(le + 1)
  }
}
write(zhP, zh, zh.includes('\r\n'))
write(enP, en, en.includes('\r\n'))
console.log('i18n keys added')

// ============ 2) WatchStatsModal P0-4 ============
const wsmP = 'E:/Movie Vault/src/renderer/src/components/WatchStatsModal.tsx'
let wsm = read(wsmP)
const wsmCrlf = wsm.includes('\r\n')
const oldEmpty = '<div className="text-white/50 text-sm">暂无观看记录</div>'
if (!wsm.includes(oldEmpty)) { console.log('WARN wsm anchor missing'); process.exit(1) }
wsm = wsm.replace(oldEmpty, "<div className=\"text-white/50 text-sm\">{t('watchStats.empty')}</div>")
write(wsmP, wsm, wsmCrlf)
console.log('WatchStatsModal P0-4 fixed')

// ============ 3) App.tsx P1-15 toasts ============
const appP = 'E:/Movie Vault/src/renderer/src/App.tsx'
let app = read(appP)
const appCrlf = app.includes('\r\n')
const oldToast = "toast({ text: '已存在同名播放列表', tone: 'warn' })"
const n = app.split(oldToast).length - 1
app = app.split(oldToast).join("toast({ text: t('playlist.duplicateName'), tone: 'warn' })")
write(appP, app, appCrlf)
console.log('App.tsx toasts fixed x' + n)

// ============ 4) Sidebar P1-15 ============
const sbP = 'E:/Movie Vault/src/renderer/src/components/Sidebar.tsx'
let sb = read(sbP)
const sbCrlf = sb.includes('\r\n')
sb = sb.replace('title="重命名"', "title={t('playlist.rename')}")
sb = sb.replace('title="删除列表"', "title={t('playlist.delete')}")
sb = sb.replace('placeholder="播放列表名称，回车创建"', "placeholder={t('playlist.newNamePlaceholder')}")
sb = sb.replace('<span>新建播放列表</span>', "<span>{t('playlist.createNew')}</span>")
sb = sb.replace('<span>磁盘统计</span>', "<span>{t('sidebar.diskStats')}</span>")
sb = sb.replace('<span>观看统计</span>', "<span>{t('sidebar.watchStats')}</span>")
write(sbP, sb, sbCrlf)
console.log('Sidebar P1-15 fixed')

// ============ 5) EntryCard P1-15 ============
const ecP = 'E:/Movie Vault/src/renderer/src/components/EntryCard.tsx'
let ec = read(ecP)
const ecCrlf = ec.includes('\r\n')
ec = ec.replace('label="从当前列表移除"', "label={t('entry.removeFromList')}")
ec = ec.replace('添加到播放列表</div>', "{t('entry.addToPlaylist')}</div>")
write(ecP, ec, ecCrlf)
console.log('EntryCard P1-15 fixed')

// ============ 6) re-apply P2-5 store strip ============
const stP = 'E:/Movie Vault/src/main/lib/store.ts'
let st = read(stP)
const stCrlf = st.includes('\r\n')
if (!st.includes("from './db'")) {
  st = st.replace("import { cleanGenreName } from './image-util'", "import { cleanGenreName } from './image-util'\nimport { getDb } from './db'")
}
const anchor = "    migrateInPlace(current)\n    cache = current"
if (!st.includes(anchor)) { console.log('WARN store anchor missing'); process.exit(1) }
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
st = st.replace(anchor, ne)
write(stP, st, stCrlf)
console.log('store.ts P2-5 re-applied')
