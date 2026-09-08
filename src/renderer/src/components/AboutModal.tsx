import { useCallback, useMemo, useState } from 'react'
import type { AppInfo, UpdateCheckResult } from '../../../shared/api-types'
import { getAbout } from '../../../shared/about'
import { api } from '../lib/api'
import { t } from '../../../shared/i18n'
import Icon from './Icon'

interface Props {
  open: boolean
  /** 应用信息（版本 / 运行环境 / 数据目录 / 更新日志），由主进程 appInfo 提供 */
  info: AppInfo | null
  onClose: () => void
  /** 用默认浏览器打开外部链接 */
  onOpenExternal: (url: string) => void
  /** 打开开源协议弹窗 */
  onOpenLicense: () => void
  /** 当前语言，用于本地化 About 文案 */
  language?: string
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="text-white/45 text-[11px] font-semibold tracking-wider uppercase mb-2.5">
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900/60 rounded-lg px-3 py-2">
      <div className="text-white/40 text-[11px] mb-0.5">{label}</div>
      <div className="text-white/85 text-sm font-medium break-all">{value}</div>
    </div>
  )
}

export default function AboutModal({ open, info, onClose, onOpenExternal, onOpenLicense, language }: Props) {
  const [copied, setCopied] = useState(false)
  const [updateRes, setUpdateRes] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)

  const about = useMemo(() => getAbout(language || 'zh-CN'), [language])

  // useCallback 稳定引用，避免每次 render 都重建 onClick 闭包（不影响功能，仅性能）
  // 主进程 fetch 已有 20s 超时（ipc.ts runUpdateCheck），checkUpdate 最迟 20s + fallback 第二个源最迟 40s 完成
  const checkUpdate = useCallback(async () => {
    setChecking(true)
    try {
      const r = await api.updateCheck()
      setUpdateRes(r)
    } catch {
      setUpdateRes({ source: 'github', currentVersion: info?.version || '', latestVersion: '', hasUpdate: false, releaseUrl: '', error: t('about.checkFailedShort') })
    } finally {
      setChecking(false)
    }
  }, [info?.version])

  if (!open) return null

  const copyDataDir = async () => {
    if (!info?.dataDir) return
    try {
      await navigator.clipboard.writeText(info.dataDir)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默
    }
  }

  const links = about.links.filter((l) => l.url)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-ink-800 rounded-xl w-[560px] max-w-[92vw] max-h-[88vh] overflow-auto p-6 shadow-card animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero */}
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand to-[#ff9db6] flex items-center justify-center shadow-glow-sm shrink-0">
            <Icon name="film" size={22} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-xl">{about.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-brand/15 text-brand text-[11px] font-bold">
                v{info?.version || '1.0.0'}
              </span>
            </div>
            <div className="text-white/50 text-sm mt-0.5">{about.tagline}</div>
          </div>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-ink-700 hover:bg-ink-600 text-white/60 shrink-0"
            onClick={onClose}
            title={t('close')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* 外部链接 */}
        {links.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-4">
            {links.map((l) => (
              <button
                key={l.key}
                className="h-8 px-3 rounded-lg flex items-center gap-1.5 bg-ink-700 hover:bg-ink-600 text-white/80 text-xs font-medium transition-colors"
                onClick={() => onOpenExternal(l.url)}
              >
                <Icon name={l.icon} size={13} />
                {l.label}
              </button>
            ))}
          </div>
        ) : null}

        {/* 点亮 Star 引导 */}
        {about.github ? (
          <div className="mt-4 rounded-xl bg-gradient-to-r from-brand/15 via-brand/10 to-transparent border border-brand/25 p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand/20 flex items-center justify-center shrink-0">
              <Icon name="star" size={18} className="text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium">{t('about.starTitle')}</div>
              <div className="text-white/45 text-[11px] mt-0.5 truncate">
                {t('about.starDesc')}
              </div>
            </div>
            <button
              className="shrink-0 h-8 px-3 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              onClick={() => onOpenExternal(about.github)}
            >
              <Icon name="star" size={13} />
              {t('about.star')}
            </button>
          </div>
        ) : null}

        {/* 检查更新 */}
        <div className="mt-4 rounded-xl bg-ink-900/50 border border-white/5 p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/15 flex items-center justify-center shrink-0">
            <Icon name="refresh" size={18} className="text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium">{t('about.checkUpdate')}</div>
            <div className="text-white/45 text-[11px] truncate">
              {updateRes
                ? updateRes.error
                  ? t('about.checkFailed', { error: updateRes.error })
                  : updateRes.hasUpdate
                    ? t('about.newVersionAvailable', { newVersion: updateRes.latestVersion, currentVersion: updateRes.currentVersion })
                    : t('about.upToDate', { version: updateRes.currentVersion })
                : t('about.currentVersion', { version: info?.version || '1.0.0' })}
            </div>
          </div>
          <button
            className="shrink-0 h-8 px-3 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            onClick={checkUpdate}
            disabled={checking}
          >
            <Icon name="refresh" size={13} className={checking ? 'animate-spin' : ''} />
            {checking ? t('about.checking') : t('about.checkUpdate')}
          </button>
        </div>
        {updateRes?.hasUpdate && updateRes.releaseUrl ? (
          <div className="mt-2">
            <button
              className="text-brand hover:underline text-xs"
              onClick={() => onOpenExternal(updateRes.releaseUrl)}
            >
              {t('about.downloadLink')}
            </button>
          </div>
        ) : null}

        {/* 简介 */}
        <p className="text-white/60 text-sm leading-relaxed mt-4">{about.description}</p>

        {/* 版本与构建 */}
        <div className="mt-5">
          <SectionTitle>{t('about.versionBuild')}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <InfoRow label={t('about.appVersion')} value={info?.version || '—'} />
            <InfoRow label="Electron" value={info?.electron || '—'} />
            <InfoRow label="Node.js" value={info?.node || '—'} />
            <InfoRow label="Chromium" value={info?.chrome || '—'} />
            <div className="col-span-2 bg-ink-900/60 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-white/40 text-[11px]">{t('about.dataDir')}</span>
                <button
                  className="text-white/40 hover:text-brand text-[11px] flex items-center gap-1 transition-colors"
                  onClick={copyDataDir}
                  title={t('about.copyPath')}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={12} />
                  {copied ? t('about.copied') : t('about.copy')}
                </button>
              </div>
              <div className="text-white/85 text-sm font-medium break-all">
                {info?.dataDir || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* 更新日志 */}
        <div className="mt-5">
          <SectionTitle>{t('about.changelog')}</SectionTitle>
          <div className="bg-ink-900/60 rounded-lg p-3 max-h-52 overflow-auto">
            {info?.changelog ? (
              <pre className="text-white/65 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                {info.changelog}
              </pre>
            ) : (
              <div className="text-white/35 text-xs">{t('about.noChangelog')}</div>
            )}
          </div>
        </div>

        {/* 技术栈 */}
        <div className="mt-5">
          <SectionTitle>{t('about.techStack')}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {about.techStack.map((t) => (
              <span
                key={t.name}
                className="px-2.5 py-1 rounded-lg bg-ink-700 text-white/75 text-xs"
                title={t.detail}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>

        {/* 第三方库 / 数据来源 */}
        <div className="mt-5">
          <SectionTitle>{t('about.thirdParty')}</SectionTitle>
          <div className="space-y-1.5">
            {about.thirdParty.map((t) => (
              <button
                key={t.name}
                className="w-full flex items-center justify-between bg-ink-900/60 hover:bg-ink-900 rounded-lg px-3 py-2 text-left transition-colors"
                onClick={() => t.url && onOpenExternal(t.url)}
                disabled={!t.url}
              >
                <span className="text-white/80 text-sm">{t.name}</span>
                <span className="text-white/40 text-xs">{t.license}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 页脚：许可证与版权 */}
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
          <span className="text-white/40">
            © {about.year} {about.author}
          </span>
          <button
            className="text-white/55 hover:text-brand flex items-center gap-1 transition-colors"
            onClick={onOpenLicense}
          >
            <Icon name="info" size={12} />
            {about.license} · {t('about.viewLicense')}
          </button>
        </div>
      </div>
    </div>
  )
}
