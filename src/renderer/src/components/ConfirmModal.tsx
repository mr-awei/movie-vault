import { useEffect } from 'react'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

interface Props {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（红色按钮），默认 false（品牌色） */
  danger?: boolean
  busy?: boolean
  /** 控制显隐，默认 true（受控用法传 open） */
  open?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** P2-4：替代 window.confirm 的轻量确认弹窗（主题一致 + ESC/点遮罩取消） */
export default function ConfirmModal({ title, message, confirmText, cancelText, danger, busy, open = true, onConfirm, onCancel }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-modal-backdrop"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/10 shadow-2xl shadow-black/60 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                danger ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              <Icon name={danger ? 'trash' : 'info'} size={18} />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="text-white text-base font-semibold leading-tight">{title}</h2>
              {message ? <p className="text-white/50 text-xs mt-1 leading-relaxed">{message}</p> : null}
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={t('app.close')}
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-9 px-4 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {cancelText ?? t('delete.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`h-9 px-5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${
                danger
                  ? 'bg-red-500 hover:brightness-110 shadow-lg shadow-red-500/40 text-white'
                  : 'bg-brand hover:brightness-110 shadow-lg shadow-brand/40 text-white'
              }`}
            >
              {busy ? <Icon name="refresh" size={13} className="animate-spin" /> : null}
              {confirmText ?? t('app.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
