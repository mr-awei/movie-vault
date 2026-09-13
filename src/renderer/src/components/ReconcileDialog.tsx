import { useState } from 'react'
import type { ReconcileResult, RenamePreviewItem } from '../../../shared/types'
import { t } from '../../../shared/i18n'

interface Props {
  open: boolean
  result: ReconcileResult | null
  mdPath?: string
  /** 用户已全局忽略的对账未收录路径 */
  ignoredUnlistedPaths?: string[]
  onClose: () => void
  onOpenFile: (path: string) => void
  /** 在系统文件管理器中显示并选中文件（用于改名） */
  onRevealInFolder?: (path: string) => void
  /** 预览可清理广告的文件名 */
  onPreviewRenames: () => Promise<RenamePreviewItem[]>
  /** 执行改名 */
  onApplyRenames: (
    items: { path: string; newName: string }[]
  ) => Promise<{ ok: number; failed: { path: string; reason: string }[] }>
  /** 忽略某个未收录项（以后不再弹出提醒，但仍保留在左侧「未收录」分类中） */
  onIgnoreUnlisted?: (path: string) => void | Promise<void>
  /** 取消忽略 */
  onUnignoreUnlisted?: (path: string) => void | Promise<void>
}

export default function ReconcileDialog({
  open,
  result,
  mdPath,
  ignoredUnlistedPaths = [],
  onClose,
  onOpenFile,
  onRevealInFolder,
  onPreviewRenames,
  onApplyRenames,
  onIgnoreUnlisted,
  onUnignoreUnlisted
}: Props) {
  const [previews, setPreviews] = useState<RenamePreviewItem[] | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ ok: number; failed: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const [pendingIgnores, setPendingIgnores] = useState<Set<string>>(new Set())

  if (!open || !result) return null

  const missing = result.entries.filter((e) => e.kind === 'missing')
  const unlisted = result.unlisted
  const hasAny = missing.length > 0 || unlisted.length > 0

  async function handlePreview() {
    setApplyResult(null)
    setPreviews(null)
    const items = await onPreviewRenames()
    setPreviews(items)
  }

  async function handleApply() {
    if (!previews || previews.length === 0) return
    setApplying(true)
    try {
      const r = await onApplyRenames(previews)
      setApplyResult({ ok: r.ok, failed: r.failed.length })
      setPreviews(null)
    } finally {
      setApplying(false)
    }
  }

  /** 一键复制所有未收录视频的文件名（中文逗号间隔） */
  async function handleCopyUnlistedCodes() {
    const codes = unlisted
      .map((u) => {
        const f = u.fileName
        const dot = f.lastIndexOf('.')
        return dot > 0 ? f.slice(0, dot) : f
      })
      .filter((c): c is string => !!c)
    // 中文逗号间隔（用户习惯），自动去重
    const text = [...new Set(codes)].join('，')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-ink-800 rounded-xl w-[620px] max-w-[94vw] max-h-[86vh] flex flex-col overflow-hidden shadow-card animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3 border-b border-white/5">
          <div className="text-white font-semibold text-lg">{t('reconcile.title')}</div>
          <div className="text-white/50 text-xs mt-1">
            {t('reconcile.description')}
            {mdPath ? (
              <button
                className="ml-1 text-brand hover:underline"
                onClick={() => onOpenFile(mdPath)}
              >
                {t('reconcile.openIntroFile')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 thin-scroll">
          {!hasAny ? (
            <div className="text-white/60 text-sm py-8 text-center">{t('reconcile.allMatch')}</div>
          ) : null}

          {missing.length > 0 ? (
            <div className="mb-6">
              <div className="text-red-400 text-sm font-medium mb-2">
                {t('reconcile.videoMissing', { count: missing.length })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((m) => (
                  <button
                    key={`${m.category}-${m.code}`}
                    className="px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-white/90 text-xs"
                    title={m.description}
                    onClick={() => mdPath && onOpenFile(mdPath)}
                  >
                    {m.code}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {unlisted.length > 0 ? (
            <div>
              <div className="text-amber-400 text-sm font-medium mb-2">
                {t('reconcile.fileUntracked', { count: unlisted.length })}
                {onRevealInFolder ? (
                  <span className="text-white/40 text-xs ml-2">{t('reconcile.fileClickHint')}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {unlisted.map((u) => (
                  <div
                    key={u.path}
                    className="inline-flex items-center rounded bg-amber-500/20 text-white/90 text-xs overflow-hidden"
                  >
                    <button
                      className="px-2 py-1 hover:bg-amber-500/40"
                      title={`${u.path}\n${t('reconcile.fileClickHint')}`}
                      onClick={() => onRevealInFolder?.(u.path)}
                    >
                      {u.fileName}
                    </button>
                    {onIgnoreUnlisted ? (
                      <button
                        className="px-1.5 py-1 hover:bg-amber-500/40 text-white/50 hover:text-white disabled:opacity-40"
                        title={t('reconcile.ignoreHint')}
                        disabled={pendingIgnores.has(u.path)}
                        onClick={async () => {
                          setPendingIgnores((prev) => new Set(prev).add(u.path))
                          try {
                            await onIgnoreUnlisted(u.path)
                          } finally {
                            setPendingIgnores((prev) => {
                              const next = new Set(prev)
                              next.delete(u.path)
                              return next
                            })
                          }
                        }}
                      >
                        {t('reconcile.ignore')}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* 一键清理文件名广告 */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <button
                  className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium"
                  onClick={handlePreview}
                  disabled={applying}
                >
                  {t('reconcile.cleanAds')}
                </button>

                {/* 一键复制所有未收录文件名（中文逗号间隔） */}
                <button
                  className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/90 text-xs font-medium ring-1 ring-white/10 transition-colors"
                  onClick={handleCopyUnlistedCodes}
                  title={t('reconcile.copyCodesHint')}
                >
                  {copied ? t('reconcile.copySuccess') : t('reconcile.copyCodes')}
                </button>
              </div>
              {copied ? (
                <div className="text-emerald-400 text-[11px] mt-1.5">
                  ✓ {t('reconcile.copiedCount', { count: unlisted.length })}
                </div>
              ) : null}

              {applyResult ? (
                <div className="mt-2 text-xs">
                  <span className="text-brand">{t('reconcile.renameSuccess', { count: applyResult.ok })}</span>
                  {applyResult.failed > 0 ? (
                    <span className="text-amber-400 ml-2">{t('reconcile.renameFailed', { count: applyResult.failed })}</span>
                  ) : null}
                  <span className="text-white/40 ml-2">{t('reconcile.rescanAfterEffect')}</span>
                </div>
              ) : null}

              {previews !== null ? (
                <div className="mt-3">
                  {previews.length === 0 ? (
                    <div className="text-white/50 text-xs">{t('reconcile.noAdsFound')}</div>
                  ) : (
                    <>
                      <div className="text-white/80 text-xs mb-2">
                        {t('reconcile.aboutToRename', { count: previews.length })}
                      </div>
                      <div className="max-h-40 overflow-auto thin-scroll rounded bg-black/20 p-2 space-y-1">
                        {previews.map((p) => (
                          <div key={p.path} className="text-[11px] leading-relaxed">
                            <span className="text-white/40 line-through">{p.oldName}</span>
                            <span className="text-brand mx-1">→</span>
                            <span className="text-white/90">{p.newName}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          className="px-3 py-1 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium"
                          onClick={handleApply}
                          disabled={applying}
                        >
                          {applying ? t('reconcile.renaming') : t('reconcile.confirmRename', { count: previews.length })}
                        </button>
                        <button
                          className="px-3 py-1 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-xs"
                          onClick={() => setPreviews(null)}
                        >
                          {t('app.cancel')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {/* 已忽略项目管理 */}
              {ignoredUnlistedPaths.length > 0 ? (
                <div className="mt-4">
                  <button
                    className="text-white/50 text-xs hover:text-white flex items-center gap-1"
                    onClick={() => setShowIgnored((v) => !v)}
                  >
                    <span>{showIgnored ? '▾' : '▸'}</span>
                    {t('reconcile.ignoredCount', { count: ignoredUnlistedPaths.length })}
                  </button>
                  {showIgnored ? (
                    <div className="mt-2 max-h-40 overflow-auto thin-scroll rounded bg-black/20 p-2 space-y-1">
                      {ignoredUnlistedPaths.map((p) => (
                        <div key={p} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-white/70 truncate" title={p}>
                            {p.split(/[/\\]/).pop() ?? p}
                          </span>
                          {onUnignoreUnlisted ? (
                            <button
                              className="shrink-0 px-1.5 py-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-40"
                              disabled={pendingIgnores.has(p)}
                              onClick={async () => {
                                setPendingIgnores((prev) => new Set(prev).add(p))
                                try {
                                  await onUnignoreUnlisted(p)
                                } finally {
                                  setPendingIgnores((prev) => {
                                    const next = new Set(prev)
                                    next.delete(p)
                                    return next
                                  })
                                }
                              }}
                            >
                              {t('reconcile.unignore')}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-white/5">
          <button
            className="px-4 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm"
            onClick={onClose}
          >
            {t('reconcile.iKnow')}
          </button>
        </div>
      </div>
    </div>
  )
}
