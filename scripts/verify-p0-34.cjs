const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// P0-3: modal container bg
const wsm = read('E:/Movie Vault/src/renderer/src/components/WatchStatsModal.tsx')
console.log('=== P0-3 modal container bg ===')
wsm.split('\n').forEach((l, i) => {
  if (/bg-white|bg-ink|bg-\[#|max-w-|rounded-/.test(l)) {
    if (i < 70) console.log(i + 1, l.trim())
  }
})

// P0-4: hardcoded Chinese outside t() and comments — scan JSX text nodes
console.log('\n=== P0-4 suspicious Chinese (JSX text / string literals) ===')
const stripped = wsm
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')
  .replace(/t\('[^']*'\)/g, 't()')
const zh = stripped.match(/(['"`][^'"`]*[\u4e00-\u9fff][^'"`]*['"`])|(>[^<]*[\u4e00-\u9fff][^<]*<)/g) || []
const seen = new Set()
for (const m of zh.slice(0, 40)) {
  const s = m.slice(0, 60)
  if (!seen.has(s)) { seen.add(s); console.log(' ', s) }
}
console.log('count:', seen.size)
