import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Icon, { type IconName } from './Icon'
import { t } from '../../../shared/i18n'

export type ToastTone = 'ok' | 'warn' | 'err' | 'info'

export interface ToastOptions {
  /** 主文本（一行或短句） */
  text: string
  /** 可选标题（粗体，显示在文本上方） */
  title?: string
  /** 语气色：ok 绿 / warn 琥珀 / err 红 / info 品牌色（默认） */
  tone?: ToastTone
  /** 自动消失时间(ms)；0 = 不自动消失（手动关闭或 update 移除）。默认 4000 */
  duration?: number
  /** 富内容（失败原因列表、来源分布条等） */
  detail?: ReactNode
  /** 进度变体：提供后显示进度条，且默认不自动消失，需 update/dismiss 移除 */
  progress?: { done: number; total: number; current?: string } | null
  /** 自定义操作按钮（例如"前往下载"） */
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends ToastOptions {
  id: string
  tone: ToastTone
  duration: number
  leaving: boolean
}

interface ToastApi {
  show: (opts: ToastOptions) => string
  update: (id: string, partial: Partial<ToastOptions>) => void
  dismiss: (id: string) => void
}

/** 模块级单例：让任意深层组件无需 prop 透传即可调用 toast */
let _api: ToastApi | null = null
export function toast(opts: ToastOptions): string {
  if (!_api) {
    console.warn('[toast] ToastProvider 尚未挂载')
    return ''
  }
  return _api.show(opts)
}
export function updateToast(id: string, partial: Partial<ToastOptions>) {
  _api?.update(id, partial)
}
export function dismissToast(id: string) {
  _api?.dismiss(id)
}

const TONE: Record<ToastTone, { bar: string; icon: IconName; iconBg: string; text: string }> = {
  ok: { bar: 'bg-emerald-500', icon: 'check', iconBg: 'bg-emerald-500', text: 'text-emerald-400' },
  warn: { bar: 'bg-amber-500', icon: 'alert', iconBg: 'bg-amber-500', text: 'text-amber-400' },
  err: { bar: 'bg-red-500', icon: 'x', iconBg: 'bg-red-500', text: 'text-red-400' },
  info: { bar: 'bg-brand', icon: 'info', iconBg: 'bg-brand', text: 'text-brand' }
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const toneCfg = TONE[item.tone]
  const pct = item.progress && item.progress.total > 0
    ? Math.round((item.progress.done / item.progress.total) * 100)
    : 0
  const done = item.progress?.done != null && item.progress.done >= (item.progress.total ?? 0)
  return (
    <div
      className={`w-[360px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden backdrop-blur-xl shadow-2xl shadow-black/60 ring-1 ring-white/10 bg-ink-900/95 ${
        item.leaving ? 'animate-toast-out' : 'animate-toast-in'
      }`}
      role="status"
    >
      <div className={`h-1 ${toneCfg.bar}`} />
      <div className="p-4 flex items-start gap-3">
        <div className={`shrink-0 w-8 h-8 rounded-full ${toneCfg.iconBg} flex items-center justify-center text-white text-sm shadow-md`}>
          <Icon name={toneCfg.icon} size={15} />
        </div>
        <div className="flex-1 min-w-0">
          {item.title ? (
            <div className="text-[14px] font-semibold text-white tracking-tight truncate">{item.title}</div>
          ) : null}
          <div
            className={`text-[12.5px] leading-relaxed ${item.title ? 'mt-0.5' : ''} ${
              item.detail ? 'text-white/70' : 'text-white/90'
            }`}
          >
            {item.text}
          </div>
          {item.detail ? <div className="mt-2">{item.detail}</div> : null}
          {item.progress ? (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] text-white/55 mb-1">
                <span className="truncate max-w-[210px]">
                  {done ? t('app.done') : t('app.processing')}
                  {item.progress.current ? ` · ${item.progress.current}` : ''}
                </span>
                <span className="tabular-nums shrink-0 ml-2">
                  {pct}% ({item.progress.done}/{item.progress.total})
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full transition-all ${toneCfg.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
          {item.action ? (
            <button
              className="mt-2.5 text-xs font-medium text-brand hover:underline"
              onClick={item.action.onClick}
            >
              {item.action.label}
            </button>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-6 h-6 rounded-md hover:bg-white/10 text-white/50 hover:text-white text-sm flex items-center justify-center transition-colors"
          title={t('app.close')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/**
 * 统一 Toast 系统：全站唯一的通知出口（右下角堆叠）。
 * - 临时消息（ok/warn/err/info）默认 4s 自动消失；
 * - 进度变体（progress）常驻，由调用方 update/dismiss；
 * - 支持富内容 detail（失败原因、来源分布）与自定义操作按钮；
 * - 退场带 200ms 淡出动画；全局尊重 prefers-reduced-motion。
 */
export function ToastProvider({ children, bottomOffset = 0 }: { children: ReactNode; bottomOffset?: number }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, number>>(new Map())

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const tm = timers.current.get(id)
    if (tm) {
      window.clearTimeout(tm)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      // 标记退场 → 200ms 后真正移除
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, leaving: true } : i)))
      const prev = timers.current.get(id)
      if (prev) window.clearTimeout(prev)
      const tm = window.setTimeout(() => remove(id), 200)
      timers.current.set(id, tm)
    },
    [remove]
  )

  const show = useCallback(
    (opts: ToastOptions): string => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const tone = opts.tone ?? 'info'
      const duration = opts.progress ? 0 : opts.duration ?? 4000
      const item: ToastItem = { ...opts, id, tone, duration, leaving: false }
      setItems((prev) => [...prev, item].slice(-4)) // 最多同时 4 条
      if (duration > 0) {
        const tm = window.setTimeout(() => dismiss(id), duration)
        timers.current.set(id, tm)
      }
      return id
    },
    [dismiss]
  )

  const update = useCallback((id: string, partial: Partial<ToastOptions>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...partial } : i)))
  }, [])

  useEffect(() => {
    _api = { show, update, dismiss }
    return () => {
      _api = null
      timers.current.forEach((tm) => window.clearTimeout(tm))
      timers.current.clear()
    }
  }, [show, update, dismiss])

  return (
    <>
      {children}
      <div style={{ bottom: 24 + bottomOffset }} className="fixed right-6 z-[100] flex flex-col items-end gap-2.5 pointer-events-none">
        {items.map((i) => (
          <div key={i.id} className="pointer-events-auto">
            <ToastCard item={i} onClose={() => dismiss(i.id)} />
          </div>
        ))}
      </div>
    </>
  )
}
