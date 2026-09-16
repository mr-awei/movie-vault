const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx'
let s = fs.readFileSync(p, 'utf8')
if (!s.includes("import ConfirmModal from './ConfirmModal'")) {
  s = s.replace("import Icon from './Icon'", "import Icon from './Icon'\nimport ConfirmModal from './ConfirmModal'")
}
// replace confirm + clearCache body
const old = `  const [clearMsg, setClearMsg] = useState('')
  const clearCache = async () => {
    if (!window.confirm(t('settings.confirmClearPosterCache'))) return
    const r = await api.cacheClear()
    setClearMsg(r.ok ? t('settings.clearedPosterCache', { count: r.removed }) : t('settings.clearFailed'))
  }`
const ne = `  const [clearMsg, setClearMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const doClearCache = async () => {
    const r = await api.cacheClear()
    setClearMsg(r.ok ? t('settings.clearedPosterCache', { count: r.removed }) : t('settings.clearFailed'))
  }`
if (!s.includes(old)) { console.log('WARN old block not found'); process.exit(1) }
s = s.replace(old, ne)
s = s.replace('onClick={clearCache}', 'onClick={() => setConfirmOpen(true)}')
// render ConfirmModal inside StorageSection: append before </section>
const anchor = '        {clearMsg ? <div className="text-white/60 text-xs mt-2">{clearMsg}</div> : null}\n      </Card>\n    </section>'
if (!s.includes(anchor)) { console.log('WARN anchor not found'); process.exit(1) }
s = s.replace(anchor, `        {clearMsg ? <div className="text-white/60 text-xs mt-2">{clearMsg}</div> : null}
      </Card>
      <ConfirmModal
        title={t('settings.confirmClearPosterCache')}
        message={t('settings.confirmClearPosterCacheHint')}
        confirmText={t('app.confirm')}
        danger
        onConfirm={() => {
          setConfirmOpen(false)
          void doClearCache()
        }}
        onCancel={() => setConfirmOpen(false)}
        open={confirmOpen}
      />
    </section>`)
fs.writeFileSync(p, s)
console.log('SettingsSections confirm patched')
