const fs = require('fs')
const zh = fs.readFileSync('E:/Movie Vault/src/shared/i18n/locales/zh-CN.ts', 'utf8')
const en = fs.readFileSync('E:/Movie Vault/src/shared/i18n/locales/en-US.ts', 'utf8')
for (const k of ['playlist', 'watchStats', 'sidebar', 'entry']) {
  const re = new RegExp(`'${k}\\.[^']+':\\s*'[^']*'`, 'g')
  const m = zh.match(re)
  console.log('---', k, m ? m.length : 0, '---')
  if (m) m.slice(0, 15).forEach((x) => console.log('  ' + x))
}
// check en for duplicates too
console.log('\nen-US playlist keys:', (en.match(/'playlist\.[^']+':/g) || []).length)
console.log('en-US watchStats keys:', (en.match(/'watchStats\.[^']+':/g) || []).length)
console.log('en-US sidebar keys:', (en.match(/'sidebar\.[^']+':/g) || []).length)
console.log('en-US entry keys:', (en.match(/'entry\.[^']+':/g) || []).length)
