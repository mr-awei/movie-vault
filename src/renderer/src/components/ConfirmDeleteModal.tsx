import { useEffect } from 'react'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

/**
 * 删除文件二次确认弹窗（Impeccable 设计规范）。
 *
 * 设计原则（避免千篇一律的 modal 模板）：
 * - 差异化于 VideoDetail 居中弹窗（信息密集型）——本弹窗是"单焦点决策"，
 *   更窄（max-w-md）、更高密度、戏剧化色块、左侧大色条承担视觉重量
 * - 大留白 + 强对比层次：色条 + 标题 + 文件信息卡 + 范围说明 + 警告条
 * - 两态严重程度：
 *   - 仅删文件：琥珀色边条（中等风险）
 *   - 整目录删：红色边条 + 红色 CTA（高风险）——删除范围更大
 * - 复用项目 Modal 动效（animate-modal-backdrop / animate-modal-panel）
 * - 文件路径用单行 + 截断 + 完整路径 tooltip（不破坏窄弹窗布局）
 */

export type DeleteScope = 'file' | 'dir'

export interface DeletePreview {
  /** 视频 id（用于调用 videoDeleteFile / videoInspectForDelete） */
  id: string
  /** 待删视频标题 */
  title: string
  /** 完整文件路径 */
  filePath: string
  /** 文件名（基名） */
  fileName: string
  /** 同目录其他视频数 */
  otherVideoCount: number
  /** 同目录其他文件数（非视频） */
  otherFileCount: number
  /** 删除范围 */
  scope: DeleteScope
  /** 整目录删时，所在目录路径 */
  dirPath?: string
}

interface Props {
  open: boolean
  preview: DeletePreview | null
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDeleteModal({ open, preview, busy, onConfirm, onCancel }: Props) {
  // ESC 关闭 + Enter 确认（仅在弹窗打开时生效）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
      if (e.key === 'Enter' && !busy) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel, onConfirm])

  if (!open || !preview) return null

  const isDir = preview.scope === 'dir'
  // 严重程度配色：仅删文件=琥珀，整目录删=红
  const accent = isDir ? 'red' : 'amber'
  const accentMap = {
    amber: {
      bar: 'from-amber-500 to-amber-400',
      ring: 'ring-amber-500/40',
      iconBg: 'bg-amber-500/15 text-amber-400',
      ctaBg: 'bg-amber-500 hover:brightness-110 shadow-amber-500/30',
      ctaText: 'text-black',
      scopeBg: 'bg-amber-500/10 ring-amber-500/25 text-amber-300'
    },
    red: {
      bar: 'from-red-500 to-rose-400',
      ring: 'ring-red-500/40',
      iconBg: 'bg-red-500/15 text-red-400',
      ctaBg: 'bg-red-500 hover:brightness-110 shadow-red-500/40',
      ctaText: 'text-white',
      scopeBg: 'bg-red-500/10 ring-red-500/25 text-red-300'
    }
  } as const
  const a = accentMap[accent]

  // 范围说明（按预检结果生成）
  const reasons: string[] = []
  if (isDir) {
    reasons.push(t('delete.dirReason', { fileName: preview.fileName }))
  } else {
    if (preview.otherVideoCount > 0) reasons.push(t('delete.sameDirOtherVideos', { count: preview.otherVideoCount }))
    if (preview.otherFileCount > 0) reasons.push(t('delete.sameDirOtherFiles', { count: preview.otherFileCount }))
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-modal-backdrop"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/10 shadow-2xl shadow-black/60 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左侧大色条：承担视觉重量（Impeccable 原则：不是居中模板） */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${a.bar}`} aria-hidden="true" />

        <div className="p-6 pl-7">
          {/* 标题区：icon + 标题 + 副标题 */}
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl ${a.iconBg} flex items-center justify-center shrink-0`}>
              <Icon name="trash" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-white text-lg font-semibold leading-tight">
                {isDir ? t('delete.deleteDir') : t('delete.deleteVideo')}
              </h2>
              <p className="text-white/50 text-xs mt-1">
                {isDir ? t('delete.deleteDirDesc') : t('delete.deleteVideoDesc')}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={t('app.close')}
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          {/* 文件信息卡（impeccable：清晰层次 + 单焦点） */}
          <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/8 p-3.5 mb-4">
            <div className="text-white/45 text-[11px] tracking-wider uppercase mb-1.5">{t('delete.toDelete')}</div>
            <div className="text-white text-sm font-medium leading-snug mb-2 break-all line-clamp-2" title={preview.title}>
              {preview.title}
            </div>
            <div
              className="text-white/40 text-[11px] font-mono truncate"
              title={preview.filePath}
            >
              {preview.filePath}
            </div>
          </div>

          {/* 删除范围（按严重程度不同色） */}
          <div className={`rounded-xl ring-1 ${a.scopeBg} p-3 mb-4`}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase mb-1.5">
              <Icon name="info" size={12} />
              {t('delete.scope')}
            </div>
            <div className="text-[13px] leading-relaxed space-y-0.5">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="opacity-60 mt-0.5">·</span>
                  <span>{r}</span>
                </div>
              ))}
              <div className="font-medium pt-1">
                {isDir ? t('delete.dirScope') : t('delete.videoScope')}
              </div>
            </div>
          </div>

          {/* 警告条：可恢复（回收站）—— 缓解用户焦虑 */}
          <div className="flex items-start gap-2 text-white/45 text-xs mb-5">
            <Icon name="info" size={12} className="mt-0.5 shrink-0 text-white/40" />
            <div className="leading-relaxed">
              {t('delete.recycleHint')}
            </div>
          </div>

          {/* 操作按钮（impeccable：主次分明，强对比 CTA） */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-9 px-4 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {t('delete.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`h-9 px-5 rounded-lg text-sm font-semibold ${a.ctaBg} ${a.ctaText} shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5`}
            >
              {busy ? (
                <>
                  <Icon name="refresh" size={13} className="animate-spin" />
                  {t('delete.processing')}
                </>
              ) : (
                <>
                  <Icon name="trash" size={13} />
                  {t('delete.toRecycle')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
