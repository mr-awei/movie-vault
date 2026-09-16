const fs = require('fs')
const path = require('path')
function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') }
function count(hay, needle) { return hay.split(needle).length - 1 }
const out = []

// ---- P0-1 single instance lock ----
const main = read('E:/Movie Vault/src/main/index.ts')
out.push(['P0-1 单实例锁', `requestSingleInstanceLock 调用次数=${count(main, 'requestSingleInstanceLock')}`, '应=1'])

// ---- P0-2 lm:// whitelist ----
out.push(['P0-2 lm白名单', `isLmAllowedPath=${main.includes('isLmAllowedPath')}, 403=${count(main, "403")}`, '应存在校验'])

// ---- P0-3 chart theme ----
const wsm = read('E:/Movie Vault/src/renderer/src/components/WatchStatsModal.tsx')
out.push(['P0-3 图表主题', `CHART_THEME=${wsm.includes('CHART_THEME')}, theme-light=${wsm.includes('theme-light')}`, '应抽主题常量'])

// ---- P0-4 WatchStatsModal i18n ----
const zhHard = (wsm.match(/[\u4e00-\u9fff]{2,}/g) || []).length
out.push(['P0-4 统计i18n', `硬编码中文片段数=${zhHard}, t()使用=${count(wsm, 't(')}`, '中文应≈0'])

// ---- P0-5 ListView virtualization ----
const lv = read('E:/Movie Vault/src/renderer/src/components/ListView.tsx')
out.push(['P0-5 列表虚拟化', `virtual/windowed=${/virtual|window|overscan|rowHeight/i.test(lv)}, map渲染=${count(lv, 'entries.map')}`, '应有窗口化'])

// ---- P0-6 playback save timestamp ----
const pl = read('E:/Movie Vault/src/main/lib/player.ts')
out.push(['P0-6 断点时间戳', `lastSaveAt=${count(pl, 'lastSaveAt')}, %10残留=${/position\s*%\s*10/.test(pl)}`, '应用时间戳'])

// ---- P0-7 settings poll diff ----
const appSrc = read('E:/Movie Vault/src/renderer/src/App.tsx')
out.push(['P0-7 轮询diff', 'settingsGet轮询=' + count(appSrc, 'settingsGet') + '次, 60s=' + count(appSrc, '60000'), '应diff后setSettings'])

// ---- P0-8 EntryCard ref ----
const app = read('E:/Movie Vault/src/renderer/src/App.tsx')
const ec = read('E:/Movie Vault/src/renderer/src/components/EntryCard.tsx')
out.push(['P0-8 EntryCard', `reconcileRef=${count(app, 'reconcileRef')}, memo=${count(ec, 'memo(')}`, '应ref化'])

// ---- P0-9 ffmpeg cache ----
const ff = read('E:/Movie Vault/src/main/lib/ffmpegEnv.ts')
out.push(['P0-9 ffmpeg缓存', `缓存变量=${/let .*Cache|cached|_cache/.test(ff)}`, '应有缓存'])

// ---- P0-10 watcher network ----
const wt = read('E:/Movie Vault/src/main/lib/watcher.ts')
out.push(['P0-10 watcher网络盘', `DRIVE_REMOTE=${wt.includes('DRIVE_REMOTE')}, UNC=${/\\\\\\\\|UNC/i.test(wt)}, isRemovable=${wt.includes('isRemovableOrNetworkPath')}`, '应补全'])

for (const [k, v, exp] of out) console.log(`${k}: ${v} | ${exp}`)
