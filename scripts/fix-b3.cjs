const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const write = (p, s, c) => fs.writeFileSync(p, c ? s.replace(/\n/g, '\r\n') : s)

let s

// 1) HomeView: 断言在 !=null 判断内，改 ?. 等价且不崩
let hv = read('E:/Movie Vault/src/renderer/src/components/HomeView.tsx')
const hc = hv.includes('\r\n')
hv = hv.replace('{(hero?.score ?? heroV.rating)!.toFixed(2)}', '{(hero?.score ?? heroV.rating)?.toFixed(2)}')
write('E:/Movie Vault/src/renderer/src/components/HomeView.tsx', hv, hc)

// 2/3) ListView: 判断用 ?. 取值用 ! 不一致，统一 ?. + ?? 0
let lv = read('E:/Movie Vault/src/renderer/src/components/ListView.tsx')
const lc = lv.includes('\r\n')
lv = lv.replace('formatDuration((v.durationSec ?? v.techInfo!.durationSec)!)', 'formatDuration(v.durationSec ?? v.techInfo?.durationSec ?? 0)')
lv = lv.replace('formatDuration((v.durationSec ?? v.techInfo!.durationSec)!)', 'formatDuration(v.durationSec ?? v.techInfo?.durationSec ?? 0)')
write('E:/Movie Vault/src/renderer/src/components/ListView.tsx', lv, lc)

// 4) StatsPanel: withVideo 循环内 e.video 必存在，改 ?. 语义等价
let sp = read('E:/Movie Vault/src/renderer/src/components/StatsPanel.tsx')
const spc = sp.includes('\r\n')
sp = sp.replace(/e\.video!/g, 'e.video?.')
write('E:/Movie Vault/src/renderer/src/components/StatsPanel.tsx', sp, spc)

// 5) App: d.cast guard 内收窄
let ap = read('E:/Movie Vault/src/renderer/src/App.tsx')
const apc = ap.includes('\r\n')
ap = ap.replace('e.video.meta?.cast?.some((a) => d.cast!.includes(a))', 'e.video.meta?.cast?.some((a) => d.cast.includes(a))')
write('E:/Movie Vault/src/renderer/src/App.tsx', ap, apc)

// 6) OnboardSheetModal: codes 数组非空（L298 同款用法无 !）
let om = read('E:/Movie Vault/src/renderer/src/components/OnboardSheetModal.tsx')
const omc = om.includes('\r\n')
om = om.replace('copy(codes!.join(\'、\'), \'codes\')', 'copy(codes.join(\'、\'), \'codes\')')
write('E:/Movie Vault/src/renderer/src/components/OnboardSheetModal.tsx', om, omc)

// 7) SettingsSections: guard 内收窄
let ss = read('E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx')
const ssc = ss.includes('\r\n')
ss = ss.replace('api.openExternal(updateRes.asset!.downloadUrl)', 'api.openExternal(updateRes.asset.downloadUrl)')
write('E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx', ss, ssc)

console.log('B-3 done')
