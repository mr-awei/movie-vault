/**
 * DangerSection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import Icon from '../Icon'
import { t } from '../../../../shared/i18n'
import { Card, SectionHeader } from './settings-ui'

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

