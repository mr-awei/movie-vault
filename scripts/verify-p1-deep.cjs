const fs = require('fs')
const path = require('path')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// P1-7 frameFallback refs detail
console.log('=== P1-7 frameFallback refs ===')
for (const f of ['E:/Movie Vault/src/renderer/src/components/ListView.tsx', 'E:/Movie Vault/src/renderer/src/components/EntryCard.tsx', 'E:/Movie Vault/src/renderer/src/components/VideoDetail.tsx', 'E:/Movie Vault/src/renderer/src/lib/frameFallback.ts']) {
  try {
    const s = read(f)
    const lines = s.split('\n')
    lines.forEach((l, i) => { if (l.includes('frameFallback') || l.includes('useFrameFallback')) console.log(path.basename(f), i + 1, l.trim()) })
  } catch (e) { console.log(f, 'MISSING') }
}

// P1-10 login handler anywhere in main
console.log('\n=== P1-10 login / proxy auth ===')
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (!['node_modules', 'out'].includes(e.name)) walk(p) }
    else if (/\.ts$/.test(e.name)) {
      const s = read(p)
      if (s.includes("app.on('login'") || s.includes('details.isProxy')) {
        console.log(p, s.match(/app\.on\('login'[\s\S]{0,160}|details\.isProxy[\s\S]{0,120}/)?.[0] || '')
      }
    }
  }
}
walk('E:/Movie Vault/src/main')

// P1-2 findVideoByPath impl
console.log('\n=== P1-2 findVideoByPath ===')
const repo = read('E:/Movie Vault/src/main/lib/repo.ts')
const i = repo.indexOf('findVideoByPath')
console.log(repo.slice(i, i + 500))

// P1-11 watch-history listVideos usage
console.log('\n=== P1-11 watch-history listVideos ===')
const wh = read('E:/Movie Vault/src/main/lib/watch-history.ts')
const j = wh.indexOf('listVideos')
console.log(wh.slice(Math.max(0, j - 300), j + 400))
