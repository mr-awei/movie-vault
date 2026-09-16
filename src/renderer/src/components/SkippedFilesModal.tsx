import { useDataStore, useUIStore } from '../store'
import Icon from './Icon'
import { toast } from './Toast'
import { t } from '../../../shared/i18n'
import { api } from '../lib/api'

/**
 * 批量补齐结束后跳过明细弹窗：告知哪些文件被自动跳过（已锁定 / 文件不存在）
 * （原内联于 App.tsx v2.7.x，迁移自 useDataStore）
 */
export default function SkippedFilesModal() {
  const skippedFiles = useDataStore((s) => s.skippedFiles)
  const reconcile = useDataStore((s) => s.reconcile)
  const setReconcile = useDataStore((s) => s.setReconcile)
  const setSkippedFiles = useDataStore((s) => s.setSkippedFiles)
  const setDetail = useUIStore((s) => s.setDetail)

  if (!skippedFiles || skippedFiles.length === 0) return null
  const lockedItems = skippedFiles.filter((x) => x.reason === 'locked')
  const missingItems = skippedFiles.filter((x) => x.reason === 'missing')

  const unlockSkippedAll = async () => {
    if (lockedItems.length === 0) return
    const ids = lockedItems.map((x) => x.id)
    await api.videoLockMany(ids, false)
    setReconcile((prev) =>
      prev
        ? {
            ...prev,
            entries: prev.entries.map((e) =>
              e.video && ids.includes(e.video.id)
                ? { ...e, video: { ...e.video, locked: false, lockedAt: undefined } }
                : e
            )
          }
        : prev
    )
    setSkippedFiles(null)
    toast({ text: t('lock.unlockedAll'), tone: 'ok' })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-modal-backdrop"
      onClick={() => setSkippedFiles(null)}
    >
      <div
        className="relative w-full max-w-xl max-h-[80vh] overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/10 shadow-2xl shadow-black/50 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <h3 className="text-base font-medium text-white truncate">{t('lock.skippedTitle')}</h3>
            <span className="text-xs text-white/40 ml-2 shrink-0">{t('lock.skippedCount', { count: skippedFiles.length })}</span>
          </div>
          <button
            type="button"
            onClick={() => setSkippedFiles(null)}
            className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pt-3 text-xs text-white/50 leading-relaxed">
          {t('lock.skippedHintGeneric', { locked: lockedItems.length, missing: missingItems.length })}
        </div>
        <div className="p-5 overflow-y-auto max-h-[50vh] space-y-1.5">
          {skippedFiles.map((item) => {
            const entry = reconcile?.entries.find((e) => e.video?.id === item.id)
            return (
              <div
                key={`${item.reason}-${item.id}`}
                className="w-full flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2"
              >
                <Icon
                  name={item.reason === 'locked' ? 'lock' : 'alert'}
                  size={13}
                  className={`shrink-0 ${item.reason === 'locked' ? 'text-amber-400' : 'text-red-400'}`}
                />
                <span className="text-sm text-white/90 truncate flex-1 min-w-0" title={item.title}>
                  {item.title}
                </span>
                <span
                  className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded ${
                    item.reason === 'locked' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {item.reason === 'locked' ? t('lock.reasonLocked') : t('lock.reasonMissing')}
                </span>
                {entry?.video ? (
                  <button
                    type="button"
                    className="text-[10px] text-white/40 hover:text-brand shrink-0"
                    onClick={() => {
                      setSkippedFiles(null)
                      setDetail(entry.video!)
                    }}
                  >
                    {t('app.batchFailuresDetail')}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="flex justify-end items-center gap-3 px-5 py-4 border-t border-white/5">
          <button
            type="button"
            onClick={() => void unlockSkippedAll()}
            disabled={lockedItems.length === 0}
            className="px-4 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="unlock" size={13} />
            {t('lock.unlockAll')}
          </button>
          <button
            type="button"
            onClick={() => setSkippedFiles(null)}
            className="px-4 h-9 rounded-lg bg-brand hover:bg-brand/90 text-white text-sm transition-colors"
          >
            {t('lock.skippedClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
