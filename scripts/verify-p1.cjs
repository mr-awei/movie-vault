const fs = require('fs')
const path = require('path')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const count = (h, n) => h.split(n).length - 1
const out = []

// P1-1 SQLite 全量: repo.ts uses SQL
const repo = read('E:/Movie Vault/src/main/lib/repo.ts')
out.push(['P1-1 SQLite主存储', 'prepare/SELECT=' + count(repo, '.prepare(') + ', listVideos find=' + count(repo, '.find('), '应SQL为主'])

// P1-2 path index
out.push(['P1-2 路径索引', 'Map索引=' + count(repo, 'pathIndex') + '|contentHashIndex=' + count(repo, 'contentHashIndex'), '应O(1)'])

// P1-3 PotPlayer delegation
const pl = read('E:/Movie Vault/src/main/lib/player.ts')
out.push(['P1-3 PotPlayer委托', 'elapsedSec<2=' + /elapsedSec\s*[<≤]\s*2/.test(pl) + ', startWatch存promise=' + count(pl, 'startWatchPromise'), '应防垃圾记录'])

// P1-4 filter store
const storeFiles = fs.readdirSync('E:/Movie Vault/src/renderer/src/store').filter(f => f.endsWith('.ts') || f.endsWith('.ts'))
out.push(['P1-4 useFilterStore', 'store文件=' + storeFiles.join(','), '应存在'])

// P1-5 MutationObserver narrowed
const vw = read('E:/Movie Vault/src/renderer/src/components/VirtualizedWall.tsx')
out.push(['P1-5 MO收窄', 'observe次数=' + count(vw, '.observe('), '应只观察自身'])

// P1-6 sidebar state
const app = read('E:/Movie Vault/src/renderer/src/App.tsx')
out.push(['P1-6 sidebar单状态', 'useState(sidebarCollapsed)=' + count(app, 'useState(false)') + ', store订阅=' + count(app, 'useUIStore((s) => s.sidebarCollapsed)'), '应用store'])

// P1-7 frameFallback removed
const ffFiles = []
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'out'].includes(e.name)) walk(p) } else if (/\.(ts|tsx)$/.test(e.name)) { const s = read(p); if (s.includes('useFrameFallback') || s.includes('frameFallback')) ffFiles.push(p) } } }
walk('E:/Movie Vault/src')
out.push(['P1-7 frameFallback', '残留=' + ffFiles.length + ' ' + ffFiles.map(f => path.basename(f)).join(','), '应已删'])

// P1-8 IPC split
const ipcDir = fs.readdirSync('E:/Movie Vault/src/main/ipc')
out.push(['P1-8 IPC拆分', 'ipc文件=' + ipcDir.join(','), '应按域拆分'])

// P1-9 fetch-meta refactor
const fm = read('E:/Movie Vault/src/main/lib/fetch-meta.ts')
out.push(['P1-9 fetch-meta', 'SOURCES=' + count(fm, 'SOURCES') + ', runSingleSource=' + count(fm, 'runSingleSource'), '应源表驱动'])

// P1-10 proxy login auth
const mainIdx = read('E:/Movie Vault/src/main/index.ts')
out.push(['P1-10 代理认证', "app.on('login')=" + count(mainIdx, "app.on('login'") + ', isProxy=' + count(mainIdx, 'details.isProxy'), '应监听login'])

// P1-11 watchStats SQL
const wh = read('E:/Movie Vault/src/main/lib/watch-history.ts')
out.push(['P1-11 统计SQL', 'GROUP BY=' + count(wh, 'GROUP BY') + ', JOIN=' + count(wh, 'JOIN') + ', listVideos全量=' + count(wh, 'listVideos'), '应SQL聚合'])

// P1-12 SettingsModal split
const sm = read('E:/Movie Vault/src/renderer/src/components/SettingsModal.tsx')
const ss = read('E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx')
out.push(['P1-12 Settings拆分', 'shell行数=' + sm.split('\n').length + ', Sections行数=' + ss.split('\n').length, '应拆分区'])

// P1-13 VideoDetail split
const vd = read('E:/Movie Vault/src/renderer/src/components/VideoDetail.tsx')
const vdp = read('E:/Movie Vault/src/renderer/src/components/VideoDetailParts.tsx')
out.push(['P1-13 VideoDetail拆分', 'VideoDetail行数=' + vd.split('\n').length + ', Parts行数=' + vdp.split('\n').length, '应拆子组件'])

// P1-14 HomeView topN
const hv = read('E:/Movie Vault/src/renderer/src/components/HomeView.tsx')
out.push(['P1-14 HomeView topN', 'sort次数=' + count(hv, '.sort(') + ', 小顶堆=' + /topK|minHeap|heap/i.test(hv), '应top14'])

// P1-15 i18n remaining hardcoded zh
const targets = {
  'App.tsx': app, 'Sidebar.tsx': read('E:/Movie Vault/src/renderer/src/components/Sidebar.tsx'),
  'EntryCard.tsx': read('E:/Movie Vault/src/renderer/src/components/EntryCard.tsx'),
  'Toolbar.tsx': read('E:/Movie Vault/src/renderer/src/components/Toolbar.tsx')
}
for (const [n, s] of Object.entries(targets)) {
  const stripped = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/t\('[^']*'\)/g, 't()')
  const zh = stripped.match(/['"][^'"]*[\u4e00-\u9fff][^'"]*['"]/g) || []
  const jsx = stripped.match(/>\s*[^<{]*[\u4e00-\u9fff][^<{]*\s*</g) || []
  out.push(['P1-15 ' + n, '字面量中文=' + (zh.length + jsx.length), '应≈0'])
}

for (const [k, v, exp] of out) console.log(`${k}: ${v} | ${exp}`)
