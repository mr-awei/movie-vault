/**
 * 设置弹窗 shell（P1-12：8 个分类 section 已拆到 SettingsSections.tsx）。
 * 本文件只保留：分类导航、draft 状态、公共弹窗（重复检测 / 卸载确认）、footer。
 * 各 section 用 hidden 保持挂载，跨 tab 切换保留其局部 state（与原单文件行为一致）。
 */
import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'
import DuplicateModal from './DuplicateModal'
import UninstallConfirmModal from './UninstallConfirmModal'
import { t, setLocale } from '../../../shared/i18n'
import type { IconName } from './Icon'
import {
  GeneralSection,
  PreviewSection,
  NetworkSection,
  AppearanceSection,
  PrivacySection,
  StorageSection,
  UpdateSection,
  DangerSection,
  normalizeProxy
} from './SettingsSections'

interface Props {
  /** 当前库 id，用于重复检测 */
  libraryId?: string
  open: boolean
  settings: Settings
  onClose: () => void
  onSave: (patch: Partial<Settings>) => void
  /** 隐私锁等操作直接走主进程后，用于刷新外部 settings 状态 */
  onSaved?: () => void
}
type Category =
  | 'general'
  | 'preview'
  | 'network'
  | 'appearance'
  | 'privacy'
  | 'storage'
  | 'update'
  | 'danger'
const CATEGORIES: { id: Category; label: string; icon: IconName }[] = [
  { id: 'general', get label() { return t('settings.cat.general') }, icon: 'sliders' },
  { id: 'preview', get label() { return t('settings.cat.preview') }, icon: 'image' },
  { id: 'network', get label() { return t('settings.cat.network') }, icon: 'globe' },
  { id: 'appearance', get label() { return t('settings.cat.appearance') }, icon: 'palette' },
  { id: 'privacy', get label() { return t('settings.cat.privacy') }, icon: 'shield' },
  { id: 'storage', get label() { return t('settings.cat.storage') }, icon: 'database' },
  { id: 'update', get label() { return t('settings.cat.update') }, icon: 'refresh' },
  { id: 'danger', get label() { return t('settings.cat.danger') }, icon: 'alert' }
]
function SidebarItem({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: IconName
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
        active ? 'bg-brand/15 text-brand' : 'text-white/55 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </button>
  )
}

export default function SettingsModal({ open, settings, onClose, onSave, onSaved, libraryId }: Props) {
  const [draft, setDraft] = useState<Settings>(settings)
  const [activeCategory, setActiveCategory] = useState<Category>('general')
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [dataDir, setDataDir] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [showUninstall, setShowUninstall] = useState(false)
  const [uninstallBusy, setUninstallBusy] = useState(false)

  useEffect(() => {
    if (open) {
      const t0 = settings.theme as string
      const base: Settings = {
        ...settings,
        theme: (t0 === 'dark' ? 'cinema' : t0 === 'light' ? 'light' : t0) as Settings['theme'],
        posterDensity: (settings.posterDensity ?? 'standard') as Settings['posterDensity']
      }
      setDraft(normalizeProxy(base))
      setActiveCategory('general')
      setShowDuplicates(false)
      void api.appInfo().then((i) => {
        setDataDir(i.dataDir)
        setAppVersion(i.version)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!open) return null
  const inputCls =
    'w-full bg-ink-900/50 text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition-colors placeholder:text-white/25'
  const sectionProps = { draft, setDraft, inputCls, open, settings, onSaved }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-ink-800 rounded-2xl w-[900px] max-w-[94vw] h-[84vh] max-h-[760px] overflow-hidden shadow-2xl flex animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------------- sidebar ---------------- */}
        <aside className="w-[210px] flex-shrink-0 border-r border-white/5 bg-ink-850/30 flex flex-col">
          <div className="flex items-center px-4 py-4 border-b border-white/5">
            <span className="text-white font-semibold text-base">{t('settings.title')}</span>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {CATEGORIES.map((c) => (
              <SidebarItem
                key={c.id}
                active={activeCategory === c.id}
                icon={c.icon}
                label={c.label}
                onClick={() => setActiveCategory(c.id)}
              />
            ))}
          </nav>
        </aside>
        {/* ---------------- content ---------------- */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-white/90 font-semibold text-base">
                {CATEGORIES.find((c) => c.id === activeCategory)?.label}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label={t('common.close')}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
          {/* 8 个 section 常驻挂载（hidden 切换），保留跨 tab 局部 state */}
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            <div className={activeCategory === 'general' ? '' : 'hidden'}>
              <GeneralSection {...sectionProps} onOpenDuplicates={() => setShowDuplicates(true)} />
            </div>
            <div className={activeCategory === 'preview' ? '' : 'hidden'}>
              <PreviewSection {...sectionProps} />
            </div>
            <div className={activeCategory === 'network' ? '' : 'hidden'}>
              <NetworkSection {...sectionProps} />
            </div>
            <div className={activeCategory === 'appearance' ? '' : 'hidden'}>
              <AppearanceSection {...sectionProps} />
            </div>
            <div className={activeCategory === 'privacy' ? '' : 'hidden'}>
              <PrivacySection {...sectionProps} />
            </div>
            <div className={activeCategory === 'storage' ? '' : 'hidden'}>
              <StorageSection {...sectionProps} dataDir={dataDir} />
            </div>
            <div className={activeCategory === 'update' ? '' : 'hidden'}>
              <UpdateSection {...sectionProps} appVersion={appVersion} />
            </div>
            <div className={activeCategory === 'danger' ? '' : 'hidden'}>
              <DangerSection onOpenUninstall={() => setShowUninstall(true)} />
            </div>
          </div>

          <UninstallConfirmModal
            open={showUninstall}
            busy={uninstallBusy}
            onCancel={() => setShowUninstall(false)}
            onConfirm={async (keepUser) => {
              setUninstallBusy(true)
              const r = await api.appUninstall(keepUser)
              setUninstallBusy(false)
              setShowUninstall(false)
              if (!r.ok) {
                window.alert(r.error ?? t('settings.uninstallFailed'))
              }
            }}
          />
          {/* ---------------- footer ---------------- */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/5 bg-ink-850/20">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm cursor-pointer transition-colors"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium cursor-pointer transition-colors flex items-center gap-1.5"
              onClick={() => {
                // 语言变更立即生效（无需重启）
                if (draft.language) setLocale(draft.language as Parameters<typeof setLocale>[0])
                onSave(draft)
              }}
            >
              <Icon name="save" size={15} />
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
      {showDuplicates && libraryId && (
        <DuplicateModal onClose={() => setShowDuplicates(false)} libraryId={libraryId} />
      )}
    </div>
  )
}
