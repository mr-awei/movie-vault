/**
 * StorageSection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import { useState } from 'react'
import { api } from '../../lib/api'
import Icon from '../Icon'
import ConfirmModal from '../ConfirmModal'
import { t } from '../../../../shared/i18n'
import { Card, FieldRow, Toggle, Select, SectionHeader, SettingsSectionProps } from './settings-ui'

export function StorageSection({ draft, setDraft, inputCls, dataDir }: SettingsSectionProps & { dataDir: string }) {
  const [clearMsg, setClearMsg] = useState('')
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const doClearCache = async () => {
    const r = await api.cacheClear()
    setClearMsg(r.ok ? t('settings.clearedPosterCache', { count: r.removed }) : t('settings.clearFailed'))
  }
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="database" title={t('settings.storageSection')} description={t('settings.storageSectionDesc')} />
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="refresh" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.scanSection')}</div>
        </div>
        <FieldRow label={t('settings.autoRescan')} hint={t('settings.autoRescanHint')}>
          <Toggle on={!!draft.autoRescan} onChange={(v) => setDraft({ ...draft, autoRescan: v })} />
        </FieldRow>
        <FieldRow label={t('settings.scanConcurrency')} hint={t('settings.scanConcurrencyHint')}>
          <Select
            value={String(draft.scanConcurrency ?? 2)}
            options={['1', '2', '3', '4', '6', '8'].map((n) => ({ value: n, label: t('settings.concurrentN', { n }) }))}
            onChange={(v) => setDraft({ ...draft, scanConcurrency: Number(v) })}
          />
        </FieldRow>
        <FieldRow label={t('settings.skipSmallFiles')} hint={t('settings.skipSmallFilesHint')}>
          <input
            className={`${inputCls} w-24`}
            type="number"
            min={0}
            value={draft.scanMinSizeMB ?? 0}
            onChange={(e) => setDraft({ ...draft, scanMinSizeMB: Math.max(0, Number(e.target.value) || 0) })}
          />
        </FieldRow>
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="folder" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.dataAndCache')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3 break-all">{dataDir || '…'}</div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm cursor-pointer transition-colors disabled:opacity-50"
            onClick={() => dataDir && api.openPath(dataDir)}
            disabled={!dataDir}
          >
            {t('settings.openDataDir')}
          </button>
          <button
            className="px-3 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm cursor-pointer transition-colors"
            onClick={() => setConfirmOpen(true)}
          >
            {t('settings.clearPosterCache')}
          </button>
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
          </button>
        </div>
        {backupMsg ? <div className="text-white/60 text-xs mt-2">{backupMsg}</div> : null}
        {clearMsg ? <div className="text-white/60 text-xs mt-2">{clearMsg}</div> : null}
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
    </section>
  )
}

/* ================= 更新 ================= */

