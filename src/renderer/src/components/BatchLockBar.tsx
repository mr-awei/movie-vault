import { useDataStore, useUIStore } from '../store'
import Icon from './Icon'
import { toast } from './Toast'
import { t } from '../../../shared/i18n'
import { api } from '../lib/api'

interface Props {
  onSelectAll: () => void
  onInvert: () => void
}

/**
 * 多选批量锁定操作条（原内联于 App.tsx v2.7.x；selectMode 下底部悬浮）
 * selectAll / 反选依赖 App 的 filtered 计算，通过 props 传入
 */
export default function BatchLockBar({ onSelectAll, onInvert }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)
  const setSelectMode = useUIStore((s) => s.setSelectMode)
  const setReconcile = useDataStore((s) => s.setReconcile)

  const toggleSelectMode = () => {
    setSelectMode((m) => {
      if (m) setSelectedIds(new Set())
      return !m
    })
  }

  const applyLockToSelection = async (locked: boolean) => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      toast({ text: t('lock.selectedNone'), tone: 'warn' })
      return
    }
    const now = Date.now()
    await api.videoLockMany(ids, locked)
    setReconcile((prev) =>
      prev
        ? {
            ...prev,
            entries: prev.entries.map((e) =>
              e.video && ids.includes(e.video.id)
                ? { ...e, video: { ...e.video, locked, lockedAt: locked ? now : undefined } }
                : e
            )
          }
        : prev
    )
    setSelectedIds(new Set())
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[65] flex items-center gap-2 px-3 py-2 rounded-2xl bg-ink-850/95 ring-1 ring-white/15 shadow-2xl shadow-black/60 backdrop-blur-sm animate-fadeIn-fast">
      <span className="text-sm text-white/80 px-1 whitespace-nowrap">{t('lock.selectedCount', { count: selectedIds.size })}</span>
      <button
        type="button"
        className="h-8 px-2.5 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors whitespace-nowrap"
        onClick={onSelectAll}
      >
        {t('lock.selectAll')}
      </button>
      <button
        type="button"
        className="h-8 px-2.5 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors whitespace-nowrap"
        onClick={onInvert}
      >
        {t('lock.invertSelection')}
      </button>
      <button
        type="button"
        className="h-8 px-2.5 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors disabled:opacity-40 whitespace-nowrap"
        onClick={() => setSelectedIds(new Set())}
        disabled={selectedIds.size === 0}
      >
        {t('lock.clearSelection')}
      </button>
      <div className="w-px h-5 bg-white/10 mx-0.5" />
      <button
        type="button"
        className="h-8 px-3 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-black transition-colors flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
        onClick={() => void applyLockToSelection(true)}
        disabled={selectedIds.size === 0}
      >
        <Icon name="lock" size={13} />
        {t('lock.batchLock')}
      </button>
      <button
        type="button"
        className="h-8 px-3 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
        onClick={() => void applyLockToSelection(false)}
        disabled={selectedIds.size === 0}
      >
        <Icon name="unlock" size={13} />
        {t('lock.batchUnlock')}
      </button>
      <button
        type="button"
        className="h-8 w-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
        onClick={toggleSelectMode}
        title={t('lock.exitSelect')}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
