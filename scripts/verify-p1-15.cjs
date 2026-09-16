const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// P1-15: show actual Chinese literal contexts (exclude t() args & comments)
for (const f of ['App.tsx', 'Sidebar.tsx', 'EntryCard.tsx']) {
  const s = read('E:/Movie Vault/src/renderer/src/components/' + (f === 'App.tsx' ? '../App.tsx' : f))
  console.log('=== P1-15 ' + f + ' ===')
  const lines = s.split('\n')
  lines.forEach((l, i) => {
    const t = l.trim()
    if (!t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && /[\u4e00-\u9fff]/.test(t)) {
      // skip lines that only contain t('...') calls
      const stripped = t.replace(/t\('[^']*'\)/g, '').replace(/t\("[^"]*"\)/g, '')
      if (/[\u4e00-\u9fff]/.test(stripped)) console.log(i + 1, t.slice(0, 110))
    }
  })
}
