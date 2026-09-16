/**
 * UpdateSection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import { useEffect, useState } from 'react'
import type { UpdateCheckResult } from '../../../../shared/api-types'
import { api } from '../../lib/api'
import Icon from '../Icon'
import { t } from '../../../../shared/i18n'
import { Card, SegmentedControl, SectionHeader, SettingsSectionProps, formatBytes, urgencyMeta } from './settings-ui'

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

