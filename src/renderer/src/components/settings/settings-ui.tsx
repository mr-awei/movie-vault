/**
 * 设置共享 UI 与常量（B-2 拆分：从 SettingsSections.tsx 拆出）
 * 含 Card/Field/Toggle/Select 等基础控件、数据源/代理常量与 SettingsSectionProps。
 */
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { Settings, ProxyMode, SortKey, SourceId } from '../../../../shared/types'
import type { UpdateCheckResult } from '../../../../shared/api-types'
import Icon from '../Icon'
import { t } from '../../../../shared/i18n'
import type { IconName } from '../Icon'

/* ================= 常量与工具（自 SettingsModal 迁出） ================= */

export const PROXY_MODES: { value: ProxyMode; label: string }[] = [
  { value: 'none', get label() { return t('settings.proxy.off') } },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks5', label: 'SOCKS5' },
  { value: 'socks4', label: 'SOCKS4' },
  { value: 'system', get label() { return t('settings.proxy.system') } }
]
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'title', get label() { return t('settings.sort.title') } },
  { value: 'added', get label() { return t('settings.sort.recentlyAdded') } },
  { value: 'lastPlayed', get label() { return t('settings.sort.recentlyPlayed') } },
  { value: 'score', get label() { return t('settings.sort.score') } },
  { value: 'year', get label() { return t('settings.sort.year') } },
  { value: 'random', get label() { return t('settings.sort.random') } }
]
/** 把旧版单一 legacyProxy 字符串迁移到新的多协议代理结构，并对数值兜底 */
export function normalizeProxy(s: Settings): Settings {
  const anyS = s as Settings & { legacyProxy?: string }
  let next: Settings = { ...s }
  if (!next.proxyMode) {
    const raw = anyS.legacyProxy
    if (raw) {
      try {
        const u = new URL(raw)
        next = {
          ...next,
          proxyMode: (u.protocol.replace(':', '') === 'https' ? 'https' : 'http') as ProxyMode,
          proxyHost: u.hostname,
          proxyPort: u.port,
          proxyUser: decodeURIComponent(u.username || ''),
          proxyPass: decodeURIComponent(u.password || '')
        }
      } catch {
        next = { ...next, proxyMode: 'none' }
      }
    } else {
      next = { ...next, proxyMode: 'none' }
    }
  }
  return {
    ...next,
    proxyHost: next.proxyHost ?? '',
    proxyPort: next.proxyPort ?? '',
    proxyUser: next.proxyUser ?? '',
    proxyPass: next.proxyPass ?? '',
    fetchConcurrency: Number(next.fetchConcurrency) || 2,
    fetchIntervalMs: Number(next.fetchIntervalMs) || 600,
    autoRescan: !!next.autoRescan,
    dataSource: next.dataSource ?? 'auto',
    customSourceOrder: normalizeSourceOrder(next.customSourceOrder)
  }
}

/** 数据源标签（固定英文品牌名，不走 i18n） */
const SOURCE_LABELS: Record<SourceId, string> = {
  moviedb: 'MovieDB',
  omdb: 'OMDb',
  openlibrary: 'OpenLibrary',
  justwatch: 'JustWatch',
  wikipedia: '维基百科'
}
const ALL_SOURCE_ORDER: SourceId[] = ['moviedb', 'omdb', 'openlibrary', 'justwatch', 'wikipedia']

/**
 * 数据源三维度信息 —— getter 函数，每次 render 重新取当前 locale 的翻译
 * （之前 SOURCE_META 在模块顶层用 t() 固化 tier/risk/cost，切英文后还是中文）。
 */
export function getSourceMeta(src: SourceId) {
  return {
    label: SOURCE_LABELS[src],
    tier: t(`settings.source.${src}.tier`),
    risk: t(`settings.source.${src}.risk`),
    cost: t('settings.source.free'),
    desc: t(`settings.source.${src}.desc`)
  }
}

/**
 * 把任意顺序归一化到完整的 4 个源（缺哪个补默认 moviedb→omdb→openlibrary→justwatch）。
 */
export function normalizeSourceOrder(order?: string[]): SourceId[] {
  if (!Array.isArray(order) || order.length < 1) return [...ALL_SOURCE_ORDER]
  const set = new Set(order)
  if (ALL_SOURCE_ORDER.some((s) => !set.has(s))) return [...ALL_SOURCE_ORDER]
  return order as SourceId[]
}

/**
 * 把当前顺序拼成 "MovieDB → OMDb → OpenLibrary → JustWatch" 文案给顶部说明文字用。
 */
export function formatSourceOrder(order?: SourceId[]): string {
  const arr = normalizeSourceOrder(order)
  return arr.map((s) => SOURCE_LABELS[s]).join(' → ')
}
export function formatBytes(n?: number): string {
  if (n == null || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
export function urgencyMeta(u?: UpdateCheckResult['urgency']) {
  switch (u) {
    case 'mandatory':
      return { label: t('settings.update.urgencyMandatory'), color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30', icon: 'alert' as IconName }
    case 'critical':
      return { label: t('settings.update.urgencyCritical'), color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', icon: 'alert' as IconName }
    case 'recommended':
      return { label: t('settings.update.urgencyRecommended'), color: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/30', icon: 'info' as IconName }
    default:
      return { label: t('settings.update.urgencyNormal'), color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: 'check' as IconName }
  }
}

/* ================= UI primitives ================= */

export function SectionHeader({ icon, title, description }: { icon: IconName; title: string; description?: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon name={icon} size={18} className="text-brand" />
        <h2 className="text-white text-lg font-semibold">{title}</h2>
      </div>
      {description ? <p className="text-white/45 text-sm">{description}</p> : null}
    </div>
  )
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-ink-850/30 border border-white/5 rounded-xl p-4 mb-5 ${className}`}>{children}</div>
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="block text-white/80 text-sm mb-1.5">{label}</label>
      {children}
      {hint ? <div className="text-white/40 text-xs mt-1.5 leading-relaxed">{hint}</div> : null}
    </div>
  )
}
export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-white/90 text-sm">{label}</div>
        {hint ? <div className="text-white/40 text-xs mt-0.5">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
        on ? 'bg-brand' : 'bg-ink-600'
      }`}
      title={on ? t('settings.on') : t('settings.off')}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex p-1 bg-ink-900/50 border border-white/10 rounded-lg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md text-sm transition-all ${
            o.disabled
              ? 'opacity-35 cursor-not-allowed'
              : value === o.value
                ? 'bg-ink-700 text-white shadow-sm'
                : 'text-white/50 hover:text-white/80'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
export function Select<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="relative">
      <select
        className="w-full appearance-none bg-ink-900/50 border border-white/10 rounded-lg pl-3 pr-9 py-2 text-sm text-white focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition-colors cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40">
        <Icon name="chevronDown" size={14} />
      </div>
    </div>
  )
}

/* ---------------- theme preview card ---------------- */
type ThemeOption = { value: Settings['theme']; label: string; tagline: string }
export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'dark', get label() { return t('settings.theme.dark') }, get tagline() { return t('settings.theme.darkTagline') } },
  { value: 'light', get label() { return t('settings.theme.light') }, get tagline() { return t('settings.theme.lightTagline') } },
  { value: 'system', get label() { return t('settings.theme.system') }, get tagline() { return t('settings.theme.systemTagline') } }
]
export function ThemePreview({ theme }: { theme: Settings['theme'] }) {
  const previews: Record<Settings['theme'], ReactNode> = {
    dark: (
      <div className="w-full h-full rounded-t-lg overflow-hidden relative" style={{ background: 'radial-gradient(1200px 800px at 20% -10%, #1b2a45 0%, #0a0c12 60%)' }}>
        <div className="absolute top-2 left-3 right-3 h-2 rounded-full bg-white/8" />
        <div className="absolute top-6 left-3 w-10 h-12 rounded bg-white/10 border border-white/5" />
        <div className="absolute top-6 left-[54px] w-10 h-12 rounded bg-white/10 border border-white/5" />
        <div className="absolute bottom-2 right-3 w-5 h-5 rounded-full bg-[rgb(45,212,191)]/40" />
      </div>
    ),
    light: (
      <div className="w-full h-full rounded-t-lg overflow-hidden relative" style={{ background: 'radial-gradient(1200px 800px at 20% -10%, #ffffff 0%, #f2f4f8 65%)' }}>
        <div className="absolute top-2 left-3 right-3 h-2 rounded-full bg-black/6" />
        <div className="absolute top-6 left-3 w-10 h-12 rounded bg-white border border-black/6 shadow-sm" />
        <div className="absolute top-6 left-[54px] w-10 h-12 rounded bg-white border border-black/6 shadow-sm" />
        <div className="absolute bottom-2 right-3 w-5 h-5 rounded-full bg-[rgb(236,72,127)]/25" />
      </div>
    ),
    system: (
      <div className="w-full h-full rounded-t-lg overflow-hidden relative flex">
        <div className="w-1/2 h-full relative" style={{ background: 'radial-gradient(1200px 800px at 20% -10%, #ffffff 0%, #f2f4f8 65%)' }}>
          <div className="absolute top-2 left-2 right-1 h-2 rounded-full bg-black/6" />
          <div className="absolute top-6 left-2 w-7 h-9 rounded bg-white border border-black/6 shadow-sm" />
        </div>
        <div className="w-1/2 h-full relative" style={{ background: 'radial-gradient(1200px 800px at 20% -10%, #1b2a45 0%, #0a0c12 60%)' }}>
          <div className="absolute top-2 left-1 right-2 h-2 rounded-full bg-white/8" />
          <div className="absolute top-6 right-2 w-7 h-9 rounded bg-white/10 border border-white/5" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[8px] font-medium">Auto</div>
      </div>
    )
  }
  return previews[theme]
}
export function ThemeCard({ option, selected, onClick }: { option: ThemeOption; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left rounded-xl border overflow-hidden transition-all cursor-pointer ${
        selected ? 'ring-2 ring-brand border-brand/60 bg-ink-800' : 'border-white/10 bg-ink-850/30 hover:border-white/25 hover:bg-ink-800/50'
      }`}
    >
      <div className="h-24 w-full">
        <ThemePreview theme={option.value} />
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-white/90 text-sm font-medium">{option.label}</span>
          {selected ? (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand text-white">
              <Icon name="check" size={12} />
            </span>
          ) : (
            <span className="w-5 h-5 rounded-full border border-white/20 group-hover:border-white/40" />
          )}
        </div>
        <p className="text-white/40 text-xs mt-0.5">{option.tagline}</p>
      </div>
    </button>
  )
}

/* ================= section 公共 props ================= */

export interface SettingsSectionProps {
  draft: Settings
  setDraft: Dispatch<SetStateAction<Settings>>
  inputCls: string
  open: boolean
  settings: Settings
  onSaved?: () => void
}
