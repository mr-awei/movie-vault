const s = require('fs').readFileSync('E:/Movie Vault/src/renderer/src/components/SettingsModal.tsx', 'utf8')
const lines = s.split('\n')
console.log('total lines:', lines.length)
// find tab definitions
const tabs = [...s.matchAll(/id: '([^']+)'/g)].map((m) => m[1])
console.log('tab ids:', tabs.join(', '))
// find section render branches and their line numbers
lines.forEach((l, i) => {
  if (l.includes('activeTab ===') || l.includes('activeTab !==')) console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 80))
})
// find useState lines
lines.forEach((l, i) => {
  if (l.includes('useState(')) console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 80))
})
// find props interface
const pi = s.indexOf('interface Props')
console.log('---Props---')
console.log(s.slice(pi, pi + 700))
