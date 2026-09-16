const fs = require('fs')
const zh = fs.readFileSync('E:/Movie Vault/src/shared/i18n/locales/zh-CN.ts', 'utf8')
const en = fs.readFileSync('E:/Movie Vault/src/shared/i18n/locales/en-US.ts', 'utf8')
for (const k of ['passwordPlaceholder', 'confirm', 'wrongPasswordDelete', 'privacyLockPrompt', 'privacyLockDeleteLib']) {
  const re = new RegExp(`['"]${k}['"]\\s*:`)
  console.log(k, 'zh:', re.test(zh), 'en:', re.test(en))
}
