const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// P0-5 ListView structure
const lv = read('E:/Movie Vault/src/renderer/src/components/ListView.tsx')
console.log('=== P0-5 ListView lines:', lv.split('\n').length, '===')
const hits = lv.match(/virtual|window|overscan|startIndex|endIndex|slice\(|rowH|itemH|useRef/g) || []
console.log('virtualization signals:', hits.join(', ') || '(none)')
const i = lv.indexOf('return (')
console.log(lv.slice(i, i + 900))

// P0-10 watcher impl
console.log('\n=== P0-10 watcher isRemovableOrNetworkPath ===')
const wt = read('E:/Movie Vault/src/main/lib/watcher.ts')
const j = wt.indexOf('isRemovableOrNetworkPath')
console.log(wt.slice(j, j + 800))
