/**
 * AppearanceSection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import type { Settings, SortKey } from '../../../../shared/types'
import { t } from '../../../../shared/i18n'
import { Card, SegmentedControl, Select, ThemeCard, SectionHeader, SORT_OPTIONS, SettingsSectionProps, THEME_OPTIONS } from './settings-ui'

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

