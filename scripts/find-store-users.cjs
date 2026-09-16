const fs = require('fs')
const path = require('path')
const roots = ['E:/Movie Vault/src/main', 'E:/Movie Vault/src/preload', 'E:/Movie Vault/src/renderer/src']
const hits = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', 'out', 'dist'].includes(e.name)) walk(p)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8')
      if (/from ['"].*store['"]/.test(s)) hits.push(p)
    }
  }
}
roots.forEach(walk)
console.log(hits.join('\n') || '(none)')
