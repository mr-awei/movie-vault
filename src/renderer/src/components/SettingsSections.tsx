/**
 * 设置弹窗的 8 个分类 section（P1-12：从 SettingsModal.tsx 拆出，主文件只留 shell）。
 * 各 section 自含局部 state（代理测试、ffmpeg 探测、锁密码、更新检查等），
 * 跨 tab 切换由父组件用 hidden 保持挂载，行为与原单文件版本一致。
 */
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { Settings, ProxyMode, SortKey, SourceId, PreviewQualityMode, BackgroundLoad } from '../../../shared/types'
import type { UpdateCheckResult } from '../../../shared/api-types'
import { api } from '../lib/api'
import Icon from './Icon'
import { t, SUPPORTED_LOCALES, type Locale } from '../../../shared/i18n'
import type { IconName } from './Icon'

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
function getSourceMeta(src: SourceId) {
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
function normalizeSourceOrder(order?: string[]): SourceId[] {
  if (!Array.isArray(order) || order.length < 1) return [...ALL_SOURCE_ORDER]
  const set = new Set(order)
  if (ALL_SOURCE_ORDER.some((s) => !set.has(s))) return [...ALL_SOURCE_ORDER]
  return order as SourceId[]
}

/**
 * 把当前顺序拼成 "MovieDB → OMDb → OpenLibrary → JustWatch" 文案给顶部说明文字用。
 */
function formatSourceOrder(order?: SourceId[]): string {
  const arr = normalizeSourceOrder(order)
  return arr.map((s) => SOURCE_LABELS[s]).join(' → ')
}
function formatBytes(n?: number): string {
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
function urgencyMeta(u?: UpdateCheckResult['urgency']) {
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
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-ink-850/30 border border-white/5 rounded-xl p-4 mb-5 ${className}`}>{children}</div>
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="block text-white/80 text-sm mb-1.5">{label}</label>
      {children}
      {hint ? <div className="text-white/40 text-xs mt-1.5 leading-relaxed">{hint}</div> : null}
    </div>
  )
}
function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
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
function SegmentedControl<T extends string>({
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
function Select<T extends string>({
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
const THEME_OPTIONS: ThemeOption[] = [
  { value: 'dark', get label() { return t('settings.theme.dark') }, get tagline() { return t('settings.theme.darkTagline') } },
  { value: 'light', get label() { return t('settings.theme.light') }, get tagline() { return t('settings.theme.lightTagline') } },
  { value: 'system', get label() { return t('settings.theme.system') }, get tagline() { return t('settings.theme.systemTagline') } }
]
function ThemePreview({ theme }: { theme: Settings['theme'] }) {
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
function ThemeCard({ option, selected, onClick }: { option: ThemeOption; selected: boolean; onClick: () => void }) {
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

/* ================= 通用 ================= */

export function GeneralSection({ draft, setDraft, inputCls, open, onOpenDuplicates }: SettingsSectionProps & { onOpenDuplicates: () => void }) {
  const [ffmpegChecking, setFfmpegChecking] = useState(false)
  const [showFfmpegTutorial, setShowFfmpegTutorial] = useState(false)
  const [ffmpegStatus, setFfmpegStatus] = useState<{ source: string; path?: string; note?: string; bundledRemoved?: boolean } | null>(null)
  useEffect(() => {
    if (open) {
      setFfmpegChecking(true)
      api
        .ffmpegStatus()
        .then(setFfmpegStatus)
        .catch(() => setFfmpegStatus({ source: 'missing' }))
        .finally(() => setFfmpegChecking(false))
    }
  }, [open])
  const checkFfmpeg = () => {
    setFfmpegChecking(true)
    api
      .ffmpegStatus()
      .then(setFfmpegStatus)
      .catch(() => setFfmpegStatus({ source: 'missing' }))
      .finally(() => setFfmpegChecking(false))
  }
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="sliders" title={t('settings.section.general')} description={t('settings.section.generalDesc')} />
      <Card>
        <Field label={t('settings.externalPlayerPath')} hint={t('settings.externalPlayerHint')}>
          <input
            className={inputCls}
            placeholder={t('settings.externalPlayerPlaceholder')}
            value={draft.playerPath ?? ''}
            onChange={(e) => setDraft({ ...draft, playerPath: e.target.value })}
          />
        </Field>
      </Card>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="film" size={16} className="text-white/70" />
            <span className="text-white/90 text-sm font-medium">{t('settings.ffmpegEnv')}</span>
          </div>
          <button
            type="button"
            className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/70 text-xs transition-colors cursor-pointer disabled:opacity-50"
            onClick={checkFfmpeg}
            disabled={ffmpegChecking}
          >
            {ffmpegChecking ? t('settings.checking') : t('settings.redetect')}
          </button>
        </div>
        {ffmpegStatus ? (
          <div className="mb-4 flex items-start gap-2 text-xs leading-relaxed">
            <span
              className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md font-medium ${
                ffmpegStatus.source === 'missing'
                  ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
                  : ffmpegStatus.source === 'bundled'
                    ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
              }`}
            >
              {ffmpegStatus.source === 'custom'
                ? t('settings.manualSpecify')
                : ffmpegStatus.source === 'system'
                  ? t('settings.systemFfmpeg')
                  : ffmpegStatus.source === 'bundled'
                    ? t('settings.bundledFfmpeg')
                    : t('settings.notDetected')}
            </span>
            <span className="text-white/60">
              {ffmpegStatus.source === 'missing'
                ? ffmpegStatus.note ?? t('settings.noFfmpegDetected')
                : t('settings.currentUsing', { path: ffmpegStatus.path ?? '' })}
              {ffmpegStatus.bundledRemoved ? <span className="text-emerald-400/80">{t('settings.deletedBundledHint')}</span> : null}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          className="text-brand/90 hover:text-brand text-xs mb-3 flex items-center gap-1 cursor-pointer"
          onClick={() => setShowFfmpegTutorial((v) => !v)}
        >
          <Icon name={showFfmpegTutorial ? 'chevronDown' : 'chevronRight'} size={12} />
          {t('settings.ffmpegHowToTitle')}
        </button>
        {showFfmpegTutorial ? (
          <div className="mb-4 rounded-lg bg-black/25 border border-white/5 p-3 text-[12px] text-white/60 leading-relaxed space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-brand font-semibold shrink-0">①</span>
              <span>{t('settings.ffmpegBundledInfo')}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-brand font-semibold shrink-0">②</span>
              <span>{t('settings.ffmpegSystemDetectedInfo')}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-brand font-semibold shrink-0">③</span>
              <span>
                {t('settings.ffmpegManualSpecifyInfo')}
                <span className="text-white/80"> ffmpeg-release-essentials.zip </span>
                {t('settings.ffmpegManualStep2')}
                <span className="text-white/80"> bin\ffmpeg.exe </span>
                {t('settings.ffmpegManualStep3')}
              </span>
            </div>
          </div>
        ) : null}
        <Field label={t('settings.ffmpegPathLabel')} hint={t('settings.ffmpegPathHint')}>
          <input
            className={inputCls}
            placeholder={t('settings.ffmpegPathPlaceholder')}
            value={draft.ffmpegPath ?? ''}
            onChange={(e) => setDraft({ ...draft, ffmpegPath: e.target.value })}
          />
        </Field>
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="globe" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.language.title')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.language.desc')}</div>
        <Select
          value={(draft.language ?? 'zh-CN') as Locale}
          options={SUPPORTED_LOCALES}
          onChange={(v) => setDraft({ ...draft, language: v as Locale })}
        />
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="zap" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.startupSection')}</div>
        </div>
        <div className="text-white/40 text-xs mb-2">{t('settings.startupSectionDesc')}</div>
        <FieldRow label={t('settings.noExcelSilent')} hint={t('settings.noExcelSilentHint')}>
          <Toggle on={!!draft.suppressIntroExcelNotice} onChange={(v) => setDraft({ ...draft, suppressIntroExcelNotice: v })} />
        </FieldRow>
        <FieldRow label={t('settings.autoStart')} hint={t('settings.autoStartHint')}>
          <Toggle on={!!draft.launchAtLogin} onChange={(v) => setDraft({ ...draft, launchAtLogin: v })} />
        </FieldRow>
        <FieldRow label={t('settings.autoReconcile')} hint={t('settings.autoReconcileHint')}>
          <Toggle on={!!draft.scanOnStartup} onChange={(v) => setDraft({ ...draft, scanOnStartup: v })} />
        </FieldRow>
        <FieldRow label={t('settings.scanOnStartup')} hint={t('settings.scanOnStartupHint')}>
          <Toggle on={!!draft.scanOnStartup} onChange={(v) => setDraft({ ...draft, scanOnStartup: v })} />
        </FieldRow>
        <FieldRow label={t('settings.minimizeToTray')} hint={t('settings.minimizeToTrayHint')}>
          <Toggle on={!!draft.minimizeToTray} onChange={(v) => setDraft({ ...draft, minimizeToTray: v })} />
        </FieldRow>
        <FieldRow label={t('settings.autoWatchFolders')} hint={t('settings.autoWatchFoldersHint')}>
          <Toggle on={!!draft.autoWatchFolders} onChange={(v) => setDraft({ ...draft, autoWatchFolders: v })} />
        </FieldRow>
      </Card>
      {/* 库工具 */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="sliders" size={14} className="text-white/50" />
          <span className="text-white/70 text-xs font-medium">库工具</span>
        </div>
        <Card>
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left"
            onClick={onOpenDuplicates}
          >
            <Icon name="copy" size={16} className="text-yellow-400" />
            <div className="flex-1">
              <div className="text-white/90 text-sm">重复视频检测</div>
              <div className="text-white/40 text-xs">查找内容相同的重复视频，释放磁盘空间</div>
            </div>
            <Icon name="chevronRight" size={14} className="text-white/30" />
          </button>
        </Card>
      </div>
    </section>
  )
}

/* ================= 预览 ================= */

export function PreviewSection({ draft, setDraft, inputCls }: SettingsSectionProps) {
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="image" title={t('settings.section.preview')} description={t('settings.section.previewDesc')} />
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="film" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.previewQualityMode')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.previewQualityModeDesc')}</div>
        <SegmentedControl
          value={draft.previewQualityMode ?? 'STANDARD'}
          options={[
            { value: 'FAST', label: t('settings.previewQualityModeFast') },
            { value: 'STANDARD', label: t('settings.previewQualityModeStandard') },
            { value: 'HIGH', label: t('settings.previewQualityModeHigh') }
          ]}
          onChange={(v) => setDraft({ ...draft, previewQualityMode: v as PreviewQualityMode })}
        />
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="grid" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.previewFrameCount')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.previewFrameCountDesc')}</div>
        <input
          className={inputCls}
          type="number"
          min={1}
          max={60}
          value={draft.previewFrameCount ?? 20}
          onChange={(e) => setDraft({ ...draft, previewFrameCount: Math.max(1, Math.min(60, Number(e.target.value) || 20)) })}
        />
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="zap" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.previewBackgroundLoad')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.previewBackgroundLoadDesc')}</div>
        <SegmentedControl
          value={draft.previewBackgroundLoad ?? 'standard'}
          options={[
            { value: 'low', label: t('settings.previewBackgroundLoadLow') },
            { value: 'standard', label: t('settings.previewBackgroundLoadStandard') },
            { value: 'high', label: t('settings.previewBackgroundLoadHigh') }
          ]}
          onChange={(v) => setDraft({ ...draft, previewBackgroundLoad: v as BackgroundLoad })}
        />
      </Card>
    </section>
  )
}

/* ================= 网络 ================= */

export function NetworkSection({ draft, setDraft, inputCls, open }: SettingsSectionProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; status?: number; error?: string } | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  useEffect(() => {
    if (open) setTestResult(null)
  }, [open])
  const needHost = draft.proxyMode === 'http' || draft.proxyMode === 'https' || draft.proxyMode === 'socks4' || draft.proxyMode === 'socks5'
  const needAuth = needHost
  const autoOrderSummary = formatSourceOrder(draft.customSourceOrder ?? undefined)
  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.proxyTest(draft)
      console.log('[proxyTest renderer]', r)
      setTestResult(r)
    } catch (e) {
      console.log('[proxyTest renderer] error', e)
      setTestResult({ ok: false, error: String(e).slice(0, 200) })
    } finally {
      setTesting(false)
    }
  }
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="globe" title={t('settings.networkSection')} description={t('settings.networkSectionDesc')} />
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="globe" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.proxySettingsTitle')}</div>
        </div>
        <div className="text-white/40 text-xs mb-4">{t('settings.proxyScopeDesc')}</div>
        <Field label={t('settings.proxyMode')}>
          <Select value={draft.proxyMode ?? 'none'} options={PROXY_MODES} onChange={(v) => setDraft({ ...draft, proxyMode: v as ProxyMode })} />
        </Field>
        {needHost ? (
          <div className="flex gap-3 mb-4">
            <div className="flex-[2]">
              <label className="block text-white/60 text-xs mb-1.5">{t('settings.proxyHost')}</label>
              <input
                className={inputCls}
                placeholder="127.0.0.1"
                value={draft.proxyHost}
                onChange={(e) => setDraft({ ...draft, proxyHost: e.target.value })}
              />
            </div>
            <div className="w-28">
              <label className="block text-white/60 text-xs mb-1.5">{t('settings.proxyPort')}</label>
              <input
                className={inputCls}
                placeholder="7890"
                value={draft.proxyPort}
                onChange={(e) => setDraft({ ...draft, proxyPort: e.target.value })}
              />
            </div>
          </div>
        ) : null}
        {needAuth ? (
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-white/60 text-xs mb-1.5">{t('settings.proxyUsername')}</label>
              <input
                className={inputCls}
                placeholder={t('settings.proxyNoAuth')}
                value={draft.proxyUser}
                onChange={(e) => setDraft({ ...draft, proxyUser: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className="block text-white/60 text-xs mb-1.5">{t('settings.proxyPassword')}</label>
              <input
                className={inputCls}
                type="password"
                placeholder={t('settings.proxyNoAuth')}
                value={draft.proxyPass}
                onChange={(e) => setDraft({ ...draft, proxyPass: e.target.value })}
              />
            </div>
          </div>
        ) : null}
        {draft.proxyMode !== 'none' ? (
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm cursor-pointer disabled:opacity-50 transition-colors"
              onClick={runTest}
              disabled={testing}
            >
              {testing ? t('settings.testing') : t('settings.testConnection')}
            </button>
            {testResult ? (
              <span className={`text-xs ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResult.ok
                  ? t('settings.testConnected', { code: testResult.status ?? '?' })
                  : t('settings.testFailed', { err: testResult.error ?? t('app.unknownError') })}
              </span>
            ) : null}
          </div>
        ) : null}
        {draft.proxyMode === 'system' ? <div className="text-white/40 text-xs mt-3">{t('settings.systemProxyAutoRead')}</div> : null}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="database" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.dataSources')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.autoDegradeHint', { order: autoOrderSummary })}</div>
        <SegmentedControl
          value={draft.dataSource ?? 'auto'}
          options={[
            { value: 'auto', label: t('settings.autoDegrade') },
            { value: 'moviedb', label: 'MovieDB', disabled: !!draft.disabledSources?.includes('moviedb') },
            { value: 'omdb', label: 'OMDb', disabled: !!draft.disabledSources?.includes('omdb') },
            { value: 'openlibrary', label: 'OpenLibrary', disabled: !!draft.disabledSources?.includes('openlibrary') },
            { value: 'justwatch', label: 'JustWatch', disabled: !!draft.disabledSources?.includes('justwatch') },
            { value: 'wikipedia', label: '维基百科', disabled: !!draft.disabledSources?.includes('wikipedia') }
          ]}
          onChange={(v) => setDraft({ ...draft, dataSource: v as 'auto' | SourceId })}
        />
        {/* 数据源明细：每个源可单独启用/禁用，并展示用途介绍；需要 API Key 的来源给出注册步骤 */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-white/85 text-xs font-medium">{t('settings.sourceOrderDragHint')}</div>
          <button
            type="button"
            className="text-[11px] text-brand hover:text-brand/80 transition-colors no-drag"
            onClick={() => setDraft({ ...draft, customSourceOrder: ['moviedb', 'omdb', 'openlibrary', 'justwatch', 'wikipedia'] })}
            title={t('settings.restoreRecommendedOrder')}
          >
            {t('settings.restoreRecommended')}
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {(draft.customSourceOrder ?? ['moviedb', 'omdb', 'openlibrary', 'justwatch', 'wikipedia']).map((src, idx, arr) => {
            const meta = getSourceMeta(src)
            const enabled = !draft.disabledSources?.includes(src)
            const forced = draft.dataSource === src
            const apiRequired = src === 'moviedb' || src === 'omdb'
            return (
              <div
                key={src}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', String(idx))
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const from = Number(e.dataTransfer.getData('text/plain'))
                  if (Number.isNaN(from) || from === idx) return
                  const next = arr.slice()
                  const [moved] = next.splice(from, 1)
                  next.splice(idx, 0, moved)
                  setDraft({ ...draft, customSourceOrder: next })
                }}
                className={`rounded-lg border p-3 transition-opacity ${
                  enabled ? 'border-white/10 bg-white/3' : 'border-white/5 bg-white/3 opacity-55'
                } ${forced ? 'ring-1 ring-brand/50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Toggle
                    on={enabled}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        disabledSources: v
                          ? (draft.disabledSources ?? []).filter((s) => s !== src)
                          : [...(draft.disabledSources ?? []), src]
                      })
                    }
                  />
                  <span className="text-white/90 text-xs font-medium">{meta.label}</span>
                  <span className="text-[10px] text-white/50">{meta.tier} · {meta.risk} · {meta.cost}</span>
                  {apiRequired ? (
                    <span className="text-[10px] text-amber-400/90 border border-amber-400/30 rounded px-1.5 py-0.5">{t('settings.source.requiresApi')}</span>
                  ) : null}
                  <span className="text-[10px] text-white/40">{enabled ? t('settings.general.enabled') : t('settings.general.disabled')}</span>
                  <div className="ml-auto flex items-center gap-0.5 no-drag">
                    <span className="text-white/30 cursor-grab text-sm leading-none select-none">⠿</span>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        const next = arr.slice()
                        ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                        setDraft({ ...draft, customSourceOrder: next })
                      }}
                      className="w-5 h-5 rounded text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center justify-center text-[10px]"
                      title={t('settings.moveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === arr.length - 1}
                      onClick={() => {
                        const next = arr.slice()
                        ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
                        setDraft({ ...draft, customSourceOrder: next })
                      }}
                      className="w-5 h-5 rounded text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center justify-center text-[10px]"
                      title={t('settings.moveDown')}
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 text-white/55 text-[11.5px] leading-relaxed">{meta.desc}</div>
                {apiRequired ? (
                  <details className="mt-2 group">
                    <summary className="text-[11px] text-brand cursor-pointer select-none list-none flex items-center gap-1">
                      <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                      <span>{t('settings.source.stepsTitle')}</span>
                    </summary>
                    <div className="mt-1.5 text-white/45 text-[11px] leading-relaxed space-y-0.5">
                      {t(`settings.source.${src}.steps`).split('\n').map((rawLine, idx2) => {
                        const line = rawLine.replace(/\r$/, '')
                        const m = line.match(/https?:\/\/[^\s，。；、）]+/)
                        if (!m) return <div key={idx2}>{line}</div>
                        const before = line.slice(0, m.index!)
                        const url = m[0]
                        const after = line.slice(m.index! + url.length)
                        return (
                          <div key={idx2}>
                            <span className="whitespace-pre-wrap">
                              {before}
                              <span className="text-brand/80">{url}</span>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  try {
                                    await navigator.clipboard?.writeText(url)
                                    setCopiedUrl(url)
                                    window.setTimeout(() => setCopiedUrl((p) => (p === url ? null : p)), 1500)
                                  } catch {}
                                }}
                                className="no-drag inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-brand hover:text-white hover:bg-brand/20 transition-colors align-middle"
                                title={t('settings.source.copyUrl')}
                              >
                                <Icon name={copiedUrl === url ? 'check' : 'copy'} size={10} />
                                {copiedUrl === url ? t('app.copied') : t('settings.source.copyUrl')}
                              </button>
                              {after}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                ) : null}
              </div>
            )
          })}
        </div>
        {draft.dataSource === 'auto' ? (
          <div className="mt-2 text-white/35 text-[10.5px] leading-relaxed">{t('settings.network.fetchLogic')}</div>
        ) : null}

        {/* 数据源密钥：MovieDB / OMDb 必需，Open Library 可选 */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="lock" size={14} className="text-white/60" />
            <div className="text-white/85 text-xs font-medium">{t('settings.apiKeys')}</div>
          </div>
          <div className="text-white/40 text-[11px] mb-3">{t('settings.apiKeysDesc')}</div>
          <div className="space-y-3">
            <div>
              <label className="block text-white/60 text-xs mb-1.5">{t('settings.movieDbKeyLabel')}</label>
              <input
                className={inputCls}
                type="text"
                placeholder="TMDB API Key"
                value={draft.movieDbKey ?? ''}
                onChange={(e) => setDraft({ ...draft, movieDbKey: e.target.value })}
              />
              <div className="text-white/35 text-[10.5px] mt-1 leading-relaxed">{t('settings.movieDbKeyHint')}</div>
            </div>
            <div>
              <label className="block text-white/60 text-xs mb-1.5">{t('settings.omdbKeyLabel')}</label>
              <input
                className={inputCls}
                type="text"
                placeholder="OMDb API Key"
                value={draft.omdbKey ?? ''}
                onChange={(e) => setDraft({ ...draft, omdbKey: e.target.value })}
              />
              <div className="text-white/35 text-[10.5px] mt-1 leading-relaxed">{t('settings.omdbKeyHint')}</div>
            </div>
            <div>
              <label className="block text-white/60 text-xs mb-1.5">{t('settings.openLibraryKeyLabel')}</label>
              <input
                className={inputCls}
                type="text"
                placeholder="—"
                value={draft.openLibraryKey ?? ''}
                onChange={(e) => setDraft({ ...draft, openLibraryKey: e.target.value })}
              />
              <div className="text-white/35 text-[10.5px] mt-1 leading-relaxed">{t('settings.openLibraryKeyHint')}</div>
            </div>
          </div>
          <FieldRow label={t('settings.includeAdult')} hint={t('settings.includeAdultHint')}>
            <Toggle on={!!draft.includeAdult} onChange={(v) => setDraft({ ...draft, includeAdult: v })} />
          </FieldRow>
        </div>
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="download" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.batchFetchSection')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.batchFetchDesc')}</div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-white/60 text-xs mb-1.5">{t('settings.concurrencyLabel')}</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              max={8}
              value={draft.fetchConcurrency}
              onChange={(e) => setDraft({ ...draft, fetchConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
            />
          </div>
          <div className="flex-1">
            <label className="block text-white/60 text-xs mb-1.5">{t('settings.intervalLabel')}</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              step={100}
              value={draft.fetchIntervalMs}
              onChange={(e) => setDraft({ ...draft, fetchIntervalMs: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        </div>
      </Card>
    </section>
  )
}

/* ================= 外观 ================= */

export function AppearanceSection({ draft, setDraft }: SettingsSectionProps) {
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="palette" title={t('settings.appearanceSection')} description={t('settings.appearanceSectionDesc')} />
      <Card>
        <div className="text-white/90 text-sm font-medium mb-1">{t('settings.themeLabel')}</div>
        <div className="text-white/40 text-xs mb-3">{t('settings.themeDesc')}</div>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((o) => (
            <ThemeCard key={o.value} option={o} selected={draft.theme === o.value} onClick={() => setDraft({ ...draft, theme: o.value })} />
          ))}
        </div>
      </Card>
      <Card>
        <div className="text-white/90 text-sm font-medium mb-1">{t('settings.posterStyleLabel')}</div>
        <div className="text-white/40 text-xs mb-3">{t('settings.posterStyleDesc')}</div>
        <SegmentedControl
          value={draft.posterDensity ?? 'standard'}
          options={[
            { value: 'large', label: t('settings.posterLarge') },
            { value: 'standard', label: t('settings.posterStandard') },
            { value: 'compact', label: t('settings.posterCompact') }
          ]}
          onChange={(v) => setDraft({ ...draft, posterDensity: v as Settings['posterDensity'] })}
        />
      </Card>
      <Card>
        <div className="text-white/90 text-sm font-medium mb-1">{t('settings.defaultSortLabel')}</div>
        <div className="text-white/40 text-xs mb-3">{t('settings.defaultSortDesc')}</div>
        <Select value={draft.defaultSort ?? 'added'} options={SORT_OPTIONS} onChange={(v) => setDraft({ ...draft, defaultSort: v as SortKey })} />
      </Card>
      <Card>
        <div className="text-white/90 text-sm font-medium mb-1">{t('settings.listViewModeLabel')}</div>
        <div className="text-white/40 text-xs mb-3">{t('settings.listViewModeDesc')}</div>
        <SegmentedControl
          value={draft.listViewMode ?? 'flat'}
          options={[
            { value: 'flat', label: t('settings.listViewModeFlat') },
            { value: 'grouped', label: t('settings.listViewModeGrouped') }
          ]}
          onChange={(v) => setDraft({ ...draft, listViewMode: v as 'flat' | 'grouped' })}
        />
      </Card>
    </section>
  )
}

/* ================= 隐私与安全 ================= */

export function PrivacySection({ draft, setDraft, inputCls, settings, onSaved }: SettingsSectionProps) {
  const [lockPwd, setLockPwd] = useState('')
  const [lockPwd2, setLockPwd2] = useState('')
  const [lockMsg, setLockMsg] = useState('')
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="shield" title={t('settings.privacySection')} description={t('settings.privacySectionDesc')} />
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="shield" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.privacyShield')}</div>
        </div>
        <div className="text-white/40 text-xs mb-2">{t('settings.privacyShieldDesc')}</div>
        <FieldRow label={t('settings.privacyDefaultOn')} hint={t('settings.privacyDefaultOnHint')}>
          <div className="flex items-center gap-2">
            <Icon name="shield" size={14} className="text-white/40" />
            <Toggle on={!!draft.privacyDefaultOn} onChange={(v) => setDraft({ ...draft, privacyDefaultOn: v })} />
          </div>
        </FieldRow>
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="lock" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.privacyLock')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.privacyLockDesc')}</div>
        <FieldRow label={t('settings.lockStatus')} hint={settings.lockHash ? t('settings.locked') : t('settings.notLocked')}>
          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${settings.lockHash ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
            {settings.lockHash ? t('settings.locked') : t('settings.notLocked')}
          </span>
        </FieldRow>
        <Field label={t('settings.newPassword')} hint={settings.lockHash ? t('settings.newPasswordHint') : t('settings.setPasswordHint')}>
          <input
            type="password"
            className={inputCls}
            placeholder={settings.lockHash ? t('settings.enterNewPassword') : t('settings.enterPassword')}
            value={lockPwd}
            onChange={(e) => {
              setLockPwd(e.target.value)
              setLockMsg('')
            }}
          />
        </Field>
        {!settings.lockHash ? (
          <div className="mb-3">
            <input
              type="password"
              className={inputCls}
              placeholder={t('settings.confirmPassword')}
              value={lockPwd2}
              onChange={(e) => setLockPwd2(e.target.value)}
            />
          </div>
        ) : null}
        <div className="flex gap-2">
          {settings.lockHash ? (
            <>
              {lockPwd ? (
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm transition-colors cursor-pointer"
                  onClick={async () => {
                    await api.lockSet(lockPwd)
                    setLockPwd('')
                    setLockMsg(t('settings.passwordModified'))
                    onSaved?.()
                  }}
                >
                  {t('settings.modifyPassword')}
                </button>
              ) : null}
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 text-sm ring-1 ring-red-500/30 transition-colors cursor-pointer"
                onClick={async () => {
                  const current = prompt(t('settings.promptCurrentPassword'))
                  if (current === null) return
                  if (!current) {
                    setLockMsg(t('settings.enterCurrentPassword'))
                    return
                  }
                  const r = await api.lockDelete(current)
                  if (r.ok) {
                    setLockMsg(t('settings.lockRemoved'))
                    onSaved?.()
                  } else {
                    setLockMsg(r.error ?? t('settings.passwordWrongRemoveFail'))
                  }
                }}
              >
                {t('settings.removeLock')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              disabled={!lockPwd || lockPwd !== lockPwd2}
              onClick={async () => {
                await api.lockSet(lockPwd)
                setLockPwd('')
                setLockPwd2('')
                setLockMsg(t('settings.lockSet'))
                onSaved?.()
              }}
            >
              {t('settings.setLock')}
            </button>
          )}
        </div>
        {lockMsg ? <div className="text-white/60 text-xs mt-2">{lockMsg}</div> : null}
      </Card>
    </section>
  )
}

/* ================= 数据与存储 ================= */

export function StorageSection({ draft, setDraft, inputCls, dataDir }: SettingsSectionProps & { dataDir: string }) {
  const [clearMsg, setClearMsg] = useState('')
  const clearCache = async () => {
    if (!window.confirm(t('settings.confirmClearPosterCache'))) return
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
            onClick={clearCache}
          >
            {t('settings.clearPosterCache')}
          </button>
        </div>
        {clearMsg ? <div className="text-white/60 text-xs mt-2">{clearMsg}</div> : null}
      </Card>
    </section>
  )
}

/* ================= 更新 ================= */

export function UpdateSection({ draft, setDraft, open, settings, appVersion }: SettingsSectionProps & { appVersion: string }) {
  const [checking, setChecking] = useState(false)
  const [updateRes, setUpdateRes] = useState<UpdateCheckResult | null>(null)
  useEffect(() => {
    if (open) setUpdateRes(null)
  }, [open])
  const checkUpdate = async () => {
    setChecking(true)
    try {
      const r = await api.updateCheck()
      setUpdateRes(r)
    } catch {
      setUpdateRes({
        source: draft.updateSource ?? 'gitee',
        currentVersion: '',
        latestVersion: '',
        hasUpdate: false,
        releaseUrl: '',
        error: t('settings.checkUpdateFailed')
      })
    } finally {
      setChecking(false)
    }
  }
  /** 切换更新源并立即重试（源切换立即保存，主进程按已保存的源检查） */
  const switchSourceAndRetry = async () => {
    const next: 'github' | 'gitee' = (draft.updateSource ?? 'gitee') === 'gitee' ? 'github' : 'gitee'
    setDraft({ ...draft, updateSource: next })
    try {
      await api.settingsSet({ updateSource: next })
    } catch {
      /* 保存失败也照常重试 */
    }
    await checkUpdate()
  }
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="refresh" title={t('settings.updateSection')} description={t('settings.updateSectionDesc')} />
      {/* 待处理更新横幅：只在 pendingUpdate.version 严格大于当前应用版本时显示，避免升级后残留显示 */}
      {settings.pendingUpdate && appVersion && (() => {
        const parse = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0)
        const pa = parse(settings.pendingUpdate.version)
        const ca = parse(appVersion)
        const n = Math.max(pa.length, ca.length)
        let newer = false
        for (let i = 0; i < n; i++) {
          const x = pa[i] ?? 0
          const y = ca[i] ?? 0
          if (x > y) { newer = true; break }
          if (x < y) { newer = false; break }
        }
        return newer
      })() ? (
        (() => {
          const meta = urgencyMeta(settings.pendingUpdate.urgency)
          return (
            <div className={`mb-5 rounded-xl border p-3.5 flex items-center gap-3 ${meta.bg} ${meta.border}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                <Icon name={meta.icon} size={18} className={meta.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{t('settings.foundNewVersion', { v: settings.pendingUpdate.version })}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.bg} ${meta.color}`}>{meta.label}</span>
                </div>
                <div className="text-white/45 text-[11px] truncate">
                  {settings.pendingUpdate.publishedAt
                    ? t('settings.publishedOn', { date: new Date(settings.pendingUpdate.publishedAt).toLocaleDateString() })
                    : t('settings.visitReleaseToDownload')}
                  {settings.pendingUpdate.assetName
                    ? ` · ${settings.pendingUpdate.assetName}${settings.pendingUpdate.assetSize ? ` (${formatBytes(settings.pendingUpdate.assetSize)})` : ''}`
                    : ''}
                </div>
              </div>
              <button
                className={`shrink-0 h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${meta.bg} ${meta.color} hover:brightness-110`}
                onClick={() => settings.pendingUpdate?.url && api.openExternal(settings.pendingUpdate.url)}
              >
                {t('settings.goDownload')}
              </button>
            </div>
          )
        })()
      ) : null}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="refresh" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.manualCheckUpdate')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.manualCheckDesc')}</div>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            onClick={checkUpdate}
            disabled={checking}
          >
            <Icon name="refresh" size={13} className={checking ? 'animate-spin' : ''} />
            {checking ? t('settings.checking') : t('settings.checkUpdate')}
          </button>
          {updateRes && !updateRes.hasUpdate && !updateRes.error ? (
            <span className="text-xs text-emerald-400">{t('settings.alreadyLatest')}</span>
          ) : null}
        </div>
        {updateRes ? (
          (() => {
            const meta = urgencyMeta(updateRes.urgency)
            // 「已是最新」且无错：按钮旁已显示内联文字，不重复渲染整块
            if (!updateRes.hasUpdate && !updateRes.error) return null
            return (
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {updateRes.error ? (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{t('settings.checkFailed')}</span>
                  ) : (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>{meta.label}</span>
                  )}
                  {!updateRes.error && updateRes.hasUpdate && updateRes.confidence ? (
                    <span className="text-white/35 text-[11px]">
                      {t('settings.confidenceLabel')}
                      {updateRes.confidence === 'full'
                        ? t('settings.confidenceFull')
                        : updateRes.confidence === 'partial'
                          ? t('settings.confidencePartial')
                          : t('settings.confidenceUnknown')}
                    </span>
                  ) : null}
                </div>
                {updateRes.hasUpdate && !updateRes.error ? (
                  <div className="space-y-1.5 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">v{updateRes.latestVersion}</span>
                      {updateRes.isPrerelease ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">{t('settings.prerelease')}</span>
                      ) : null}
                      {updateRes.isDraft ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{t('settings.draft')}</span>
                      ) : null}
                    </div>
                    {updateRes.publishedAt ? (
                      <div className="text-white/50 text-xs">{t('settings.publishTime')}{new Date(updateRes.publishedAt).toLocaleString(undefined, { hour12: false })}</div>
                    ) : null}
                    {updateRes.assetMatched && updateRes.asset ? (
                      <div className="text-white/70 text-xs">
                        {t('settings.matchedAsset', { name: updateRes.asset.name, size: formatBytes(updateRes.asset.size) })}
                        {updateRes.checksumAsset ? t('settings.checksumAsset', { name: updateRes.checksumAsset.name }) : ''}
                      </div>
                    ) : !updateRes.error ? (
                      <div className="text-amber-400/90 text-xs">{t('settings.noWindowsInstallerFound')}</div>
                    ) : null}
                    {updateRes.minimumVersion ? (
                      <div className="text-red-400/90 text-xs">{t('settings.minVersionRequired', { min: updateRes.minimumVersion, current: updateRes.currentVersion })}</div>
                    ) : null}
                    {updateRes.notes ? (
                      <div className="text-white/40 text-xs line-clamp-3 whitespace-pre-line">{updateRes.notes}</div>
                    ) : null}
                    <div className="flex items-center gap-3 pt-1">
                      {updateRes.asset?.downloadUrl ? (
                        <button className="text-brand hover:underline text-xs" onClick={() => api.openExternal(updateRes.asset!.downloadUrl)}>
                          {t('settings.downloadInstaller')} →
                        </button>
                      ) : null}
                      <button className="text-white/50 hover:text-white/80 hover:underline text-xs" onClick={() => api.openExternal(updateRes.releaseUrl)}>
                        {t('settings.viewReleasePage')} →
                      </button>
                    </div>
                  </div>
                ) : null}
                {updateRes.error ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-red-400/90 text-xs break-all">{updateRes.error}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="px-2 py-1 rounded-md bg-brand/15 hover:bg-brand/30 text-brand text-[11px] font-medium ring-1 ring-brand/30 transition-colors cursor-pointer flex items-center gap-1"
                        onClick={switchSourceAndRetry}
                        disabled={checking}
                      >
                        <Icon name="globe" size={11} />
                        {t('settings.switchToSourceRetry', { src: (draft.updateSource ?? 'gitee') === 'gitee' ? 'GitHub' : 'Gitee' })}
                      </button>
                    </div>
                  </div>
                ) : null}
                {updateRes.fallback && !updateRes.error ? (
                  <div className="text-amber-400/80 text-xs mt-1">
                    {t('settings.fallbackToSource', { src: updateRes.source === 'gitee' ? 'Gitee' : 'GitHub' })}
                  </div>
                ) : null}
              </div>
            )
          })()
        ) : null}
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="clock" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.autoUpdateFreq')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.autoUpdateFreqDesc')}</div>
        <SegmentedControl
          value={draft.autoUpdateFrequency ?? 'off'}
          options={[
            { value: 'off', label: t('settings.updateOff') },
            { value: 'daily', label: t('settings.updateDaily') },
            { value: 'weekly', label: t('settings.updateWeekly') },
            { value: 'monthly', label: t('settings.updateMonthly') }
          ]}
          onChange={(v) => setDraft({ ...draft, autoUpdateFrequency: v as 'off' | 'daily' | 'weekly' | 'monthly' })}
        />
        {draft.autoUpdateFrequency && draft.autoUpdateFrequency !== 'off' && settings.lastUpdateCheck ? (
          <div className="text-white/35 text-[11px] mt-2">
            {t('settings.lastAutoCheck')}{new Date(settings.lastUpdateCheck).toLocaleString(undefined, { hour12: false })}
          </div>
        ) : null}
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="globe" size={16} className="text-white/70" />
          <div className="text-white/90 text-sm font-medium">{t('settings.updateSourceLabel')}</div>
        </div>
        <div className="text-white/40 text-xs mb-3">{t('settings.updateSourceDesc')}</div>
        <SegmentedControl
          value={draft.updateSource ?? 'gitee'}
          options={[
            { value: 'github', label: 'GitHub' },
            { value: 'gitee', label: 'Gitee' }
          ]}
          onChange={(v) => setDraft({ ...draft, updateSource: v as 'github' | 'gitee' })}
        />
      </Card>
    </section>
  )
}

/* ================= 危险操作 ================= */

export function DangerSection({ onOpenUninstall }: { onOpenUninstall: () => void }) {
  return (
    <section className="animate-fadeIn">
      <SectionHeader icon="alert" title={t('settings.dangerSection')} description={t('settings.dangerSectionDesc')} />
      <Card className="border-red-500/20 bg-red-500/[0.04]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-red-400 text-sm font-semibold mb-1">{t('settings.uninstallApp')}</div>
            <div className="text-white/40 text-xs leading-relaxed max-w-md">{t('settings.uninstallDesc')}</div>
          </div>
          <button
            className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 text-xs font-medium ring-1 ring-red-500/30 transition-colors cursor-pointer shrink-0"
            onClick={onOpenUninstall}
          >
            <span className="flex items-center gap-1.5">
              <Icon name="trash" size={14} />
              {t('settings.uninstallApp')}
            </span>
          </button>
        </div>
      </Card>
    </section>
  )
}
