const fs = require('fs')
const s = fs.readFileSync('E:/Movie Vault/src/renderer/src/App.tsx', 'utf8').replace(/\r\n/g, '\n').split('\n')
console.log('=== metaSelectedCount / techSelectedCount / unlockSkippedAll ===')
s.forEach((l, i) => {
  const t = l.trim()
  if (/metaSelectedCount = |techSelectedCount = |unlockSkippedAll = /.test(t)) console.log((i + 1) + ': ' + t.slice(0, 130))
})
console.log('=== useFilterStore actions (store file) ===')
const st = fs.readFileSync('E:/Movie Vault/src/renderer/src/store/filter.ts', 'utf8').replace(/\r\n/g, '\n')
st.split('\n').forEach((l, i) => {
  const t = l.trim()
  if (/^setSelected|^clearAll|toggle\w+\(/.test(t)) console.log((i + 1) + ': ' + t.slice(0, 90))
})
