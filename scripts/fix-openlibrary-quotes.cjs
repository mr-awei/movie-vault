const fs = require('fs')
const p = 'E:/Movie Vault/src/main/lib/openlibrary.ts'
let s = fs.readFileSync(p, 'utf8')
const bad = 'onError?.(Open Library 未匹配到电影条目（结果多为书籍，已跳过）)'
if (!s.includes(bad)) { console.log('WARN not found'); process.exit(1) }
s = s.replace(bad, "onError?.('Open Library 未匹配到电影条目（结果多为书籍，已跳过）')")
fs.writeFileSync(p, s)
console.log('quoted fixed')
