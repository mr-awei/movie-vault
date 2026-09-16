const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/components/VideoDetailParts.tsx'
let s = fs.readFileSync(p, 'utf8')
const start = 'return (\n    <div className="min-w-0 flex flex-col">\n      {d ? ('
const end = '{/* 影片信息：导演/主演/类型/年份等元数据（日期、时长、大小、参数已放到封面下方） */}'
const i = s.indexOf(start)
const j = s.indexOf(end)
if (i === -1 || j === -1 || j < i) { console.log('WARN anchors not found', i, j); process.exit(1) }
s = s.slice(0, i) + 'return (\n    <div className="min-w-0 flex flex-col">\n      ' + s.slice(j)
fs.writeFileSync(p, s)
console.log('head stripped, new len', s.length)
