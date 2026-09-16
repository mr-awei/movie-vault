const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const count = (h, n) => h.split(n).length - 1
const out = []

// P2-3 preload typing
const pre = read('E:/Movie Vault/src/preload/index.ts')
out.push(['P2-3 preload类型化', 'as never=' + count(pre, 'as never') + ', Parameters<typeof cb>=' + count(pre, 'Parameters<typeof cb>'), '应0个never'])

// P2-4 native dialogs
let dialogResid = []
for (const f of ['App.tsx', 'SettingsModal.tsx', 'SettingsSections.tsx']) {
  const s = read('E:/Movie Vault/src/renderer/src/' + (f === 'App.tsx' ? 'App.tsx' : 'components/' + f))
  for (const kind of ['window.alert', 'window.prompt', 'window.confirm']) {
    const n = count(s, kind)
    if (n > 0) dialogResid.push(`${f}:${kind}=${n}`)
  }
}
out.push(['P2-4 原生dialog', dialogResid.join(' ') || '(clean)', '应0'])

// P2-5 previewTasks out of data.json
const st = read('E:/Movie Vault/src/main/lib/store.ts')
out.push(['P2-5 previewTasks收口', '剥离逻辑=' + st.includes('delete current.previewTasks'), '应有剥离'])

// P2-7 backup
const bk = read('E:/Movie Vault/src/main/lib/backup.ts')
out.push(['P2-7 Backup', 'backup.ts=' + bk.split('\n').length + '行, makeZip=' + bk.includes('makeZip'), '应存在'])

// P2-6 plugin system
out.push(['P2-6 插件系统', '未实施', '需规格'])

// P2-8 details
const proxy = read('E:/Movie Vault/src/main/lib/proxy.ts')
out.push(['P2-8a proxy close', 'cacheDispatcher.close=' + count(proxy, 'cacheDispatcher.close'), '应关闭旧实例'])
const pl = read('E:/Movie Vault/src/main/lib/playlist.ts')
out.push(['P2-8b reorder去重', 'new Set=' + count(pl, 'new Set'), '应去重'])
const ol = read('E:/Movie Vault/src/main/lib/openlibrary.ts')
out.push(['P2-8c openlibrary校验', 'FILM_HINTS=' + count(ol, 'FILM_HINTS'), '应校验电影'])
const im = read('E:/Movie Vault/src/main/lib/images.ts')
out.push(['P2-8d images死代码', 'generatePreviewSet=' + count(im, 'generatePreviewSet'), '应已删'])
const app = read('E:/Movie Vault/src/renderer/src/App.tsx')
out.push(['P2-8e ORDER常量', 'RES_ORDER=' + count(app, 'RES_ORDER') + ', t()映射=' + count(app, 'RES_ORDER_MAP'), '应对齐i18n'])
const vw = read('E:/Movie Vault/src/renderer/src/components/VirtualizedWall.tsx')
out.push(['P2-8f wall key', "video?.id key=" + /video\?\.id \?\? e\.code/.test(vw), '应稳定key'])
const mi = read('E:/Movie Vault/src/main/index.ts')
out.push(['P2-8g timer清理', 'clearInterval=' + count(mi, 'clearInterval(updateTimer') + ', updateTimer=' + count(mi, 'updateTimer'), '应清理'])

// P2-1 App.tsx state check
out.push(['P2-1 App拆hook', '行数=' + app.split('\n').length + ', useState=' + count(app, 'useState('), '状态已store化'])

for (const [k, v, exp] of out) console.log(`${k}: ${v} | ${exp}`)
