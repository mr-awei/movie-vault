const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const write = (p, s, c) => fs.writeFileSync(p, c ? s.replace(/\n/g, '\r\n') : s)

let sp = read('E:/Movie Vault/src/renderer/src/components/StatsPanel.tsx')
const sc = sp.includes('\r\n')
sp = sp.replace('const v = e.video?.', 'const v = e.video!')
write('E:/Movie Vault/src/renderer/src/components/StatsPanel.tsx', sp, sc)

let ap = read('E:/Movie Vault/src/renderer/src/App.tsx')
const ac = ap.includes('\r\n')
ap = ap.replace('e.video.meta?.cast?.some((a) => d.cast.includes(a))', 'e.video.meta?.cast?.some((a) => (d.cast ?? []).includes(a))')
write('E:/Movie Vault/src/renderer/src/App.tsx', ap, ac)

let ss = read('E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx')
const ssc = ss.includes('\r\n')
ss = ss.replace('api.openExternal(updateRes.asset.downloadUrl)', 'api.openExternal(updateRes.asset!.downloadUrl)')
write('E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx', ss, ssc)
console.log('fixed 3')
