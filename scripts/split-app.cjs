const fs = require('fs')
const P = 'E:/Movie Vault/src/renderer/src/App.tsx'
let s = fs.readFileSync(P, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')
const L = s.split('\n')

const find = (from, re) => {
  for (let i = from; i < L.length; i++) if (re.test(L[i])) return i
  throw new Error('anchor not found from ' + from + ' ' + re)
}

const b1s = find(0, /\{\/\* 活跃筛选条：多维筛选可视化，可单独移除 \*\/\}/)
const b1e = find(b1s + 1, /^              \) : null}$/)
const b2s = find(0, /\{\/\* v2\.7\.x：多选批量锁定操作条 \*\/\}/)
const b2e = find(b2s + 1, /^      \) : null}$/)
const b3s = find(0, /\{\/\* v2\.7\.x：批量补齐结束后，告知哪些文件被自动跳过（已锁定 \/ 文件不存在） \*\/\}/)
const b3e = find(b3s + 1, /^      \)\}$/)

console.log('blocks:', b1s + 1, '-', b1e + 1, '|', b2s + 1, '-', b2e + 1, '|', b3s + 1, '-', b3e + 1)

const rep = (start, end, txt) => {
  L.splice(start, end - start + 1, txt)
}
rep(b3s, b3e, '      <SkippedFilesModal />')
rep(b2s, b2e, '      {selectMode && !activePlaylistId && !pendingPlaylistId && view === \'browse\' ? (\n        <BatchLockBar onSelectAll={selectAllVisible} onInvert={invertSelection} />\n      ) : null}')
rep(b1s, b1e, '      <ActiveFilterBar />')

const out = L.join('\n')
fs.writeFileSync(P, crlf ? out.replace(/\n/g, '\r\n') : out)
console.log('done, new lines:', out.split('\n').length)
