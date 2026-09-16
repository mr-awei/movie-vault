const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// P0-7 settings poll
const app = read('E:/Movie Vault/src/renderer/src/App.tsx')
console.log('=== P0-7 settings poll block ===')
const i = app.indexOf('60000')
if (i > 0) console.log(app.slice(i - 500, i + 300))

// P0-8 toggleFlag deps
console.log('\n=== P0-8 toggleFlag ===')
const j = app.indexOf('toggleFlag')
console.log(app.slice(j, j + 700))
