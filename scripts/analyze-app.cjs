const fs = require('fs')
const s = fs.readFileSync('E:/Movie Vault/src/renderer/src/App.tsx', 'utf8').replace(/\r\n/g, '\n')
const lines = s.split('\n')
console.log('total lines:', lines.length)
let useStates = 0, useEffects = 0, useCallbacks = 0, useMemos = 0, useRefs = 0, useStores = 0
const groups = {}
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  if (/useState\(/.test(l)) { useStates++; const m = l.match(/const \[(\w+)/); if (m) groups[m[1]] = (groups[m[1]] || 0) + 1 }
  if (/useEffect\(/.test(l)) useEffects++
  if (/useCallback\(/.test(l)) useCallbacks++
  if (/useMemo\(/.test(l)) useMemos++
  if (/useRef\(/.test(l)) useRefs++
  if (/use\w+Store\(/.test(l)) useStores++
}
console.log('useState', useStates, 'useEffect', useEffects, 'useCallback', useCallbacks, 'useMemo', useMemos, 'useRef', useRefs, 'stores', useStores)
console.log('--- state names ---')
console.log(Object.keys(groups).join(', '))
