import { useEffect, useState } from 'react'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

interface Props {
  /** 弹窗标题（如"输入锁密码以继续"） */
  title: string
  /** 提交按钮文案，默认"确定" */
  submitText?: string
  /** 提交回调：返回 true 表示验证通过（关闭弹窗）；false 显示错误 */
  onSubmit: (pwd: string) => Promise<boolean>
  onCancel: () => void
}

/**
 * P2-4：替代 window.prompt 的密码输入弹窗（设置/删除前锁校验）。
 * 与自建 modal 风格一致（ink-850 卡片 + 焦点输入 + Enter 提交 + ESC 取消）。
 */
export default function PasswordPromptModal({ title, submitText, onSubmit, onCancel }: Props) {
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = (el: HTMLInputElement | null) => {
    if (el) el.focus()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const submit = async () => {
    if (busy || !pwd) return
    setBusy(true)
    setErr(null)
    try {
      const ok = await onSubmit(pwd)
      if (!ok) setErr(t('app.wrongPasswordDelete'))
    } finally {
      setBusy(false)
    }
  }

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
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <Icon name="lock" size={18} />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="text-white text-base font-semibold leading-tight">{title}</h2>
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

          <input
            ref={inputRef}
            type="password"
            autoFocus
            value={pwd}
            onChange={(e) => {
              setPwd(e.target.value)
              setErr(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
            placeholder={t('app.passwordPlaceholder')}
            className="no-drag w-full h-10 px-3 rounded-lg bg-ink-800 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-amber-400/60"
          />
          {err ? <div className="mt-2 text-red-400 text-xs">{err}</div> : null}

          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-9 px-4 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {t('delete.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !pwd}
              className="h-9 px-5 rounded-lg text-sm font-semibold bg-amber-500 hover:brightness-110 shadow-lg shadow-amber-500/30 text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {busy ? <Icon name="refresh" size={13} className="animate-spin" /> : null}
              {submitText ?? t('app.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
