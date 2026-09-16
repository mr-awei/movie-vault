const fs = require('fs')
const p = 'E:/Movie Vault/src/main/index.ts'
let s = fs.readFileSync(p, 'utf8')

// Remove the FIRST requestSingleInstanceLock block (duplicate), CRLF-tolerant regex
const re = /if \(!app\.requestSingleInstanceLock\(\)\) \{\r?\n  app\.quit\(\)\r?\n\} else \{\r?\n  app\.on\('second-instance', \(\) => \{\r?\n    const win = BrowserWindow\.getAllWindows\(\)\[0\]\r?\n    if \(win\) \{\r?\n      win\.show\(\)\r?\n      win\.focus\(\)\r?\n    \}\r?\n  \}\)\r?\n\}\r?\n\r?\n/s
if (re.test(s)) {
  s = s.replace(re, '')
  console.log('removed duplicate single-instance lock block (regex)')
} else {
  console.log('WARN: still not found')
}
fs.writeFileSync(p, s)
