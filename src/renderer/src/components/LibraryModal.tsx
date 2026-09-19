import { useEffect, useState } from 'react'
import type { Library } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

interface Props {
  open: boolean
  /** null = 新建媒体库；非 null = 编辑已有媒体库 */
  library: Library | null
  onClose: () => void
  /** 保存（新建/更新）；返回是否成功 */
  onSave: (patch: Partial<Library>) => Promise<boolean>
  onRemove: () => void
  /** 引导用户生成片单 Excel（introExcelPath 为空时显示） */
  onGenerateSheet?: () => void
}

export default function LibraryModal({ open, library, onClose, onSave, onRemove, onGenerateSheet }: Props) {
  const [name, setName] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [introExcelPath, setIntroExcelPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [needFolderHint, setNeedFolderHint] = useState(false)

  const adding = !library

  useEffect(() => {
    if (open) {
      setName(library?.name ?? '')
      setFolderPath(library?.folderPath ?? '')
      setIntroExcelPath(library?.introExcelPath ?? '')
      setSaving(false)
    }
  }, [open, library])

  if (!open) return null

  const inputCls =
    'w-full bg-ink-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 ring-brand/50'

  async function pickFolder() {
    const p = await api.dialogSelectFolder()
    if (p) {
      setFolderPath(p)
      if (!name) setName(p.split(/[\\/]/).pop() || p)
    }
  }
  async function pickExcel() {
    const p = await api.dialogSelectFile()
    if (p && /\.(xlsx|xls)$/i.test(p)) setIntroExcelPath(p)
  }

  async function save() {
    if (saving) return
    // 新建模式必须有视频文件夹；编辑模式至少要有名称或文件夹
    if (!folderPath.trim()) return
    setSaving(true)
    try {
      const ok = await onSave({ name: name.trim() || folderPath, folderPath, introExcelPath })
      if (!ok) setSaving(false)
      // 成功时弹窗由 App 层关闭
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-ink-800 rounded-xl w-[620px] max-w-[92vw] max-h-[90vh] overflow-auto p-5 shadow-card animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-white font-semibold text-lg">
            {adding ? t('library.addTitle') : t('library.editTitle')}
          </div>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-ink-700 hover:bg-ink-600 text-white/60"
            onClick={onClose}
            title={t('app.close')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* 引导说明：告诉用户这两步分别是什么 */}
        {adding ? (
          <div className="mb-5 rounded-xl bg-ink-900/60 border border-white/5 p-3.5 space-y-2">
            <div className="text-white/85 text-[13px] font-medium">{t('library.stepsIntro')}</div>
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-md bg-brand/20 text-brand text-[11px] font-bold flex items-center justify-center shrink-0 mt-px">1</span>
              <div>
                <div className="text-white/90 text-[13px]">
                  {t('library.videoFolder')}
                  <span className="text-white/40 ml-1.5">{t('library.requiredMark')}</span>
                </div>
                <div className="text-white/45 text-[12px] leading-relaxed mt-0.5">
                  {t('library.step1Desc')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-md bg-brand/20 text-brand text-[11px] font-bold flex items-center justify-center shrink-0 mt-px">2</span>
              <div>
                <div className="text-white/90 text-[13px]">
                  {t('library.excelFile')}
                  <span className="text-white/40 ml-1.5">{t('library.optionalMark')}</span>
                </div>
                <div className="text-white/45 text-[12px] leading-relaxed mt-0.5">
                  {t('library.step2Desc')}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <label className="block mb-4">
          <div className="text-white/80 text-sm mb-1">{t('library.name')}</div>
          <input
            className={inputCls}
            placeholder={adding ? t('library.namePlaceholder') : ''}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {adding ? (
            <div className="text-white/40 text-xs mt-1">{t('library.nameHint')}</div>
          ) : null}
        </label>

        <label className="block mb-4">
          <div className="text-white/80 text-sm mb-1">
            {t('library.videoFolder')}
            {adding ? <span className="text-white/40 ml-1.5 text-xs">{t('library.requiredMark')}</span> : null}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder={t('library.videoFolderHint')}
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
            />
            <button
              className="shrink-0 px-3 py-2 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm"
              onClick={pickFolder}
            >
              {t('library.browse')}
            </button>
          </div>
          <div className="text-white/40 text-xs mt-1">
            {t('library.videoFolderDesc')}
          </div>
        </label>

        <label className="block mb-5">
          <div className="text-white/80 text-sm mb-1">
            {t('library.excelFile')}
            <span className="text-white/40 ml-1.5 text-xs">{t('library.optionalMark')}</span>
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder={t('library.excelPlaceholder2')}
              value={introExcelPath}
              onChange={(e) => setIntroExcelPath(e.target.value)}
            />
            <button
              className="shrink-0 px-3 py-2 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm"
              onClick={pickExcel}
            >
              {t('library.browse')}
            </button>
          </div>
          <div className="text-white/40 text-xs mt-1">
            {t('library.excelHint2')}
          </div>
          {needFolderHint && adding && (
            <div className="text-amber-300 text-xs mt-1">请先选择视频文件夹，再生成片单</div>
          )}
          {!introExcelPath && onGenerateSheet && (
            <button
              type="button"
              onClick={() => {
                if (adding && !folderPath.trim()) {
                  setNeedFolderHint(true)
                  return
                }
                if (adding) {
                  // 添加模式：先保存媒体库，App 层保存成功后会打开片单向导
                  void save()
                  return
                }
                onGenerateSheet()
              }}
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-hover transition"
            >
              <Icon name="sparkles" size={12} />
              {t('library.generateSheetHint')}
            </button>
          )}
        </label>

        <div className="flex justify-between items-center">
          {library ? (
            <button
              className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm"
              onClick={onRemove}
            >
              {t('library.deleteButton')}
            </button>
          ) : (
            <span className="text-white/35 text-[11px]">
              {folderPath.trim() ? '' : t('library.needSelectFolder')}
            </span>
          )}
          <div className="flex gap-2">
            <button
              className="px-4 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-white text-sm"
              onClick={onClose}
            >
              {t('app.cancel')}
            </button>
            <button
              className="px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={save}
              disabled={!folderPath.trim() || saving}
            >
              {saving ? t('library.saveInProgress') : adding ? t('library.addAndScan') : t('library.saveButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
