/**
 * PreviewSection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import type { PreviewQualityMode, BackgroundLoad } from '../../../../shared/types'
import Icon from '../Icon'
import { t } from '../../../../shared/i18n'
import { Card, SegmentedControl, SectionHeader, SettingsSectionProps } from './settings-ui'

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

