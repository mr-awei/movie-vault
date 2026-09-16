/**
 * NetworkSection（B-2 拆分：从 SettingsSections.tsx 拆出）
 */
import { useEffect, useState } from 'react'
import type { ProxyMode, SourceId } from '../../../../shared/types'
import { api } from '../../lib/api'
import Icon from '../Icon'
import { t } from '../../../../shared/i18n'
import { Card, Field, FieldRow, Toggle, SegmentedControl, Select, SectionHeader, PROXY_MODES, SettingsSectionProps, getSourceMeta, formatSourceOrder } from './settings-ui'

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
      setTestResult(r)
    } catch (e) {
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

