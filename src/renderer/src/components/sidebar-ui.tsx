/**
 * Sidebar 共享 UI（B-2 拆分：折叠段 / 滚动持久化 / facet 组 / 导航项）
 */
import { useState, useRef, useEffect, type ReactNode } from 'react'
import Icon, { type IconName } from './Icon'
import { t } from '../../../shared/i18n'

const PER_CAT_LIMIT = 10

export interface MetaFacet {
  name: string
  count: number
}

/** 外层可折叠段（导航 / 媒体库 / 我的 / 筛选） */
export function Section({
  title,
  icon,
  count,
  onClear,
  children,
  defaultOpen = true,
  active,
  grow
}: {
  title: string
  icon: IconName
  count?: number
  onClear?: () => void
  children: ReactNode
  defaultOpen?: boolean
  active?: boolean
  grow?: boolean
}) {
  const storageKey = `sidebar_section_${title}`
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved !== null ? saved === 'true' : defaultOpen
    } catch { return defaultOpen }
  })
  const toggleOpen = () => setOpen((o) => {
    const next = !o
    try { localStorage.setItem(storageKey, String(next)) } catch {}
    return next
  })
  return (
    <div className={`border-b border-white/5 last:border-b-0 ${grow ? 'flex flex-col flex-1 min-h-0' : ''}`}>
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-ink-800/40 transition-colors cursor-pointer select-none"
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleOpen()
          }
        }}
        title={open ? t('sidebar.collapseSection') : t('sidebar.expandSection')}
      >
        <div className={`flex items-center gap-1.5 font-semibold text-[12px] ${active ? 'text-brand' : 'text-white/90'}`}>
          <Icon name={icon} size={12} className={active ? 'text-brand' : 'text-brand/80'} />
          <span>{title}</span>
          {count ? (
            <span className="px-1.5 rounded-full bg-brand/15 text-brand text-[10px] font-bold">{count}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          {onClear && count ? (
            <button
              className="no-drag h-5 px-1.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              title={t('sidebar.clearSectionFilter')}
            >
              {t('sidebar.clear')}
            </button>
          ) : null}
          <Icon
            name="chevronDown"
            size={14}
            className={`text-white/40 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </div>
      </div>
      {open ? <div className={`px-3 pb-3 ${grow ? 'flex flex-col flex-1 min-h-0' : ''}`}>{children}</div> : null}
    </div>
  )
}

/** 持久化滚动位置：key 唯一标识滚动容器，scrollTop 存 localStorage */
export function usePersistentScroll(key: string) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    try {
      const saved = localStorage.getItem(`sidebar_scroll_${key}`)
      if (saved) el.scrollTop = parseInt(saved, 10) || 0
    } catch {}
    const onScroll = () => {
      try { localStorage.setItem(`sidebar_scroll_${key}`, String(el.scrollTop)) } catch {}
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [key])
  return ref
}

/** 元信息 facet 单组（演员 / 制片公司 / 系列） */
export function FacetGroup({
  title,
  icon,
  facets,
  selected,
  onToggle,
  onClear
}: {
  title: string
  icon: IconName
  facets: MetaFacet[]
  selected: Set<string>
  onToggle: (v: string) => void
  onClear: () => void
}) {
  const [closed, setClosed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const show = expanded ? facets : facets.slice(0, PER_CAT_LIMIT)
  const selCount = selected.size
  return (
    <div className="mb-2.5 last:mb-0">
      <button
        className="w-full flex items-center justify-between py-1 px-0.5 rounded hover:bg-ink-800/60 transition-colors"
        onClick={() => setClosed((c) => !c)}
        title={closed ? t('sidebar.expand') : t('sidebar.collapse')}
      >
        <span className="flex items-center gap-1 text-white/55 text-[11px] font-medium tracking-wide">
          <Icon name="chevronDown" size={11} className={`transition-transform duration-200 ${closed ? '-rotate-90' : ''}`} />
          <Icon name={icon} size={11} className="opacity-70" />
          <span>{title}</span>
          {selCount > 0 ? (
            <span className="px-1.5 rounded-full bg-brand/15 text-brand text-[10px] font-bold">{selCount}</span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          {selCount > 0 ? (
            <button
              className="no-drag h-5 px-1.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
            >
              {t('sidebar.clear')}
            </button>
          ) : null}
          <Icon name={closed ? 'chevronRight' : 'chevronDown'} size={11} className="text-white/30" />
        </div>
      </button>
      {!closed ? (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {facets.length === 0 ? (
            <span className="text-white/30 text-[11px]">{t('app.noData')}</span>
          ) : (
            show.map((f) => {
              const sel = selected.has(f.name)
              return (
                <button
                  key={f.name}
                  onClick={() => onToggle(f.name)}
                  className={`h-6 px-2 rounded-lg text-[11px] flex items-center gap-1 transition-all max-w-full ring-1 ${
                    sel
                      ? 'bg-brand text-white shadow-sm shadow-brand/30 font-medium'
                      : 'bg-white/6 hover:bg-white/12 text-white/75 hover:text-white'
                  }`}
                  title={f.name}
                >
                  {sel ? <Icon name="check" size={10} className="shrink-0" /> : null}
                  <span className="max-w-[100px] truncate">{f.name}</span>
                  <span className={sel ? 'opacity-75 text-[10px]' : 'opacity-50 text-[10px]'}>{f.count}</span>
                </button>
              )
            })
          )}
          {facets.length > PER_CAT_LIMIT ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="h-6 px-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-white/50"
            >
              {expanded ? t('sidebar.collapse') : `+${facets.length - PER_CAT_LIMIT}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
  alert
}: {
  icon: IconName
  label: string
  active?: boolean
  onClick: () => void
  badge?: number
  alert?: boolean
}) {
  return (
    <button
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
        active
          ? 'bg-brand/15 text-brand font-medium'
          : alert
            ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
            : 'text-white/75 hover:bg-ink-700 hover:text-white'
      }`}
      onClick={onClick}
    >
      <Icon name={icon} size={15} className={active ? 'text-brand' : alert ? 'text-amber-400' : 'text-white/55'} />
      <span className="flex-1 text-left truncate">{label}</span>
      {/* 待处理提醒点：无论是否选中都显示，确保「有未处理项」状态不被选中态掩盖 */}
      {alert ? (
        <span
          className={`h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 ${active ? 'ring-2 ring-brand/15' : ''}`}
          title={t('sidebar.hasPending')}
        />
      ) : null}
      {badge ? (
        <span className={`text-[10px] tabular-nums ${alert ? 'text-amber-400' : 'text-white/40'}`}>{badge}</span>
      ) : null}
    </button>
  )
}

