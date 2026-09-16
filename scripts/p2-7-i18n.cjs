const fs = require('fs')
const zhP = 'E:/Movie Vault/src/shared/i18n/locales/zh-CN.ts'
const enP = 'E:/Movie Vault/src/shared/i18n/locales/en-US.ts'
let zh = fs.readFileSync(zhP, 'utf8')
let en = fs.readFileSync(enP, 'utf8')

const zhAnchor = "'settings.clearPosterCache': "
const enAnchor = "'settings.clearPosterCache': "
const zhAdd = `  'settings.backupExport': '导出备份',
  'settings.backupImport': '导入备份',
  'settings.backupExported': '备份已导出：{path}',
  'settings.backupImported': '备份已导入',
  'settings.backupImportedRestart': '备份已导入，重启应用后生效',
  'settings.backupFailed': '备份操作失败：{err}',\n`
const enAdd = `  'settings.backupExport': 'Export backup',
  'settings.backupImport': 'Import backup',
  'settings.backupExported': 'Backup exported: {path}',
  'settings.backupImported': 'Backup imported',
  'settings.backupImportedRestart': 'Backup imported, restart the app to take effect',
  'settings.backupFailed': 'Backup failed: {err}',\n`

if (zh.includes(zhAnchor)) {
  const i = zh.indexOf(zhAnchor)
  const lineEnd = zh.indexOf('\n', i)
  zh = zh.slice(0, lineEnd + 1) + zhAdd + zh.slice(lineEnd + 1)
} else { console.log('WARN zh anchor missing'); process.exit(1) }
if (en.includes(enAnchor)) {
  const i = en.indexOf(enAnchor)
  const lineEnd = en.indexOf('\n', i)
  en = en.slice(0, lineEnd + 1) + enAdd + en.slice(lineEnd + 1)
} else { console.log('WARN en anchor missing'); process.exit(1) }
fs.writeFileSync(zhP, zh)
fs.writeFileSync(enP, en)
console.log('i18n backup keys added')
