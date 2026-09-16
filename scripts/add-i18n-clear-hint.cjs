const fs = require('fs')
const zhP = 'E:/Movie Vault/src/shared/i18n/locales/zh-CN.ts'
const enP = 'E:/Movie Vault/src/shared/i18n/locales/en-US.ts'
let zh = fs.readFileSync(zhP, 'utf8')
let en = fs.readFileSync(enP, 'utf8')

const zhAnchor = "'settings.confirmClearPosterCache': "
const enAnchor = "'settings.confirmClearPosterCache': "
if (zh.includes(zhAnchor)) {
  // find line end of the anchor and insert new key after it
  const i = zh.indexOf(zhAnchor)
  const lineEnd = zh.indexOf('\n', i)
  zh = zh.slice(0, lineEnd + 1) + "  'settings.confirmClearPosterCacheHint': '清除后封面图片将重新生成（不影响视频文件）',\n" + zh.slice(lineEnd + 1)
} else { console.log('WARN zh anchor missing') }
if (en.includes(enAnchor)) {
  const i = en.indexOf(enAnchor)
  const lineEnd = en.indexOf('\n', i)
  en = en.slice(0, lineEnd + 1) + "  'settings.confirmClearPosterCacheHint': 'Poster images will be regenerated after clearing (video files are not affected).',\n" + en.slice(lineEnd + 1)
} else { console.log('WARN en anchor missing') }
fs.writeFileSync(zhP, zh)
fs.writeFileSync(enP, en)
console.log('i18n hint keys added')
