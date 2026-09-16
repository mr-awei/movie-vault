const fs = require('fs')
let s = fs.readFileSync('E:/Movie Vault/src/renderer/src/components/SettingsModal.tsx', 'utf8')
if (!s.includes("from './Toast'")) {
  s = s.replace("import { t, setLocale } from '../../../shared/i18n'", "import { t, setLocale } from '../../../shared/i18n'\nimport { toast } from './Toast'")
}
s = s.replace("window.alert(r.error ?? t('settings.uninstallFailed'))", "toast({ text: r.error ?? t('settings.uninstallFailed'), tone: 'err' })")
fs.writeFileSync('E:/Movie Vault/src/renderer/src/components/SettingsModal.tsx', s)
console.log('SettingsModal ok', !s.includes('window.alert'))
