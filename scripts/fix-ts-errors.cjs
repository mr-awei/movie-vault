const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const write = (p, s, c) => fs.writeFileSync(p, c ? s.replace(/\n/g, '\r\n') : s)

let sys = read('E:/Movie Vault/src/main/ipc/system.ts')
const sc = sys.includes('\r\n')
if (!sys.includes('type { Settings }')) {
  sys = sys.replace("import { IPC } from '../../shared/ipc'", "import { IPC } from '../../shared/ipc'\nimport type { Settings } from '../../shared/types'")
}
write('E:/Movie Vault/src/main/ipc/system.ts', sys, sc)

let v = read('E:/Movie Vault/src/main/ipc/video.ts')
const vc = v.includes('\r\n')
const lines = v.split('\n')
const idx = lines.findIndex((l) => l.includes('import type { Video }'))
if (idx >= 0 && lines.filter((l) => l.includes('import type { Video }')).length > 1) {
  lines.splice(idx, 1)
  v = lines.join('\n')
}
write('E:/Movie Vault/src/main/ipc/video.ts', v, vc)

let d = read('E:/Movie Vault/src/main/lib/dedup.ts')
const dc = d.includes('\r\n')
d = d.replace(/export interface DuplicateMatchType[\s\S]*?\n}\n\n/, '')
write('E:/Movie Vault/src/main/lib/dedup.ts', d, dc)
console.log('fixed 3')
