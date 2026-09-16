/**
 * GeneralSection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import Icon from '../Icon'
import { t, SUPPORTED_LOCALES, Locale } from '../../../../shared/i18n'
import { Card, Field, FieldRow, Toggle, Select, SectionHeader, SettingsSectionProps } from './settings-ui'

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

