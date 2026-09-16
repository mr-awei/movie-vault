/**
 * PrivacySection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import { useState } from 'react'
import { api } from '../../lib/api'
import Icon from '../Icon'
import { t } from '../../../../shared/i18n'
import { Card, Field, FieldRow, Toggle, SectionHeader, SettingsSectionProps } from './settings-ui'

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

