const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// P0-1: show requestSingleInstanceLock contexts
const main = read('E:/Movie Vault/src/main/index.ts')
const lines = main.split('\n')
console.log('=== P0-1 requestSingleInstanceLock contexts ===')
lines.forEach((l, i) => {
  if (l.includes('requestSingleInstanceLock')) console.log(i + 1, l.trim())
})

// P0-3: chart colors in WatchStatsModal
const wsm = read('E:/Movie Vault/src/renderer/src/components/WatchStatsModal.tsx')
console.log('\n=== P0-3 WatchStatsModal theme refs ===')
lines2 = wsm.split('\n')
lines2.forEach((l, i) => {
  if (/theme|#fff|#6b7280|#e5e7eb|textStyle|axisLabel|isDark/i.test(l)) {
    if (i < 220) console.log(i + 1, l.trim())
  }
})
