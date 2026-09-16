const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx'
let s = fs.readFileSync(p, 'utf8')

// StorageSection: add backup/restore state + buttons near clearPosterCache block
const oldBlock = `        {clearMsg ? <div className="text-white/60 text-xs mt-2">{clearMsg}</div> : null}
      </Card>`
if (!s.includes(oldBlock)) { console.log('WARN block anchor missing'); process.exit(1) }

// add state line after clearMsg state
s = s.replace(
  "  const [clearMsg, setClearMsg] = useState('')",
  "  const [clearMsg, setClearMsg] = useState('')\n  const [backupMsg, setBackupMsg] = useState<string | null>(null)\n  const [backupBusy, setBackupBusy] = useState(false)"
)

// add buttons before clearMsg render line
s = s.replace(
  '        {clearMsg ? <div className="text-white/60 text-xs mt-2">{clearMsg}</div> : null}',
  `        {backupMsg ? <div className="text-white/60 text-xs mt-2">{backupMsg}</div> : null}
        {clearMsg ? <div className="text-white/60 text-xs mt-2">{clearMsg}</div> : null}`
)

// add backup buttons into the data/cache card flex row (after clearPosterCache button)
const clearBtn = `<button
            className="px-3 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm cursor-pointer transition-colors"
            onClick={() => setConfirmOpen(true)}
          >
            {t('settings.clearPosterCache')}
          </button>`
if (!s.includes(clearBtn)) { console.log('WARN clear button anchor missing'); process.exit(1) }
s = s.replace(clearBtn, clearBtn + `
          <button
            className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium cursor-pointer transition-colors disabled:opacity-50"
            onClick={async () => {
              setBackupBusy(true)
              setBackupMsg(null)
              try {
                const r = await api.backupExport()
                if (r.ok) setBackupMsg(t('settings.backupExported', { path: r.path ?? '' }))
                else setBackupMsg(t('settings.backupFailed', { err: r.error ?? '' }))
              } finally {
                setBackupBusy(false)
              }
            }}
            disabled={backupBusy}
          >
            {t('settings.backupExport')}
          </button>
          <button
            className="px-3 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm cursor-pointer transition-colors disabled:opacity-50"
            onClick={async () => {
              setBackupBusy(true)
              setBackupMsg(null)
              try {
                const r = await api.backupImport()
                if (r.ok) {
                  setBackupMsg(r.needsRestart ? t('settings.backupImportedRestart') : t('settings.backupImported'))
                } else setBackupMsg(t('settings.backupFailed', { err: r.error ?? '' }))
              } finally {
                setBackupBusy(false)
              }
            }}
            disabled={backupBusy}
          >
            {t('settings.backupImport')}
          </button>`)
fs.writeFileSync(p, s)
console.log('SettingsSections buttons added')
