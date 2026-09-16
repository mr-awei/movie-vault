import { useState } from 'react'
import { useDataStore, useUIStore } from '../store'
import Icon from './Icon'
import { toast } from './Toast'
import { t } from '../../../shared/i18n'
import { api } from '../lib/api'

interface Props {
  onClose: () => void
}

/**
 * 批量编辑元数据弹窗（v2.12，对标 Stash/Emby bulk edit）。
 * 支持字段：评分 / 年份 / 系列 / 区域 / 标签（逗号分隔覆盖）。
 * 仅提交非空字段（白名单走主进程 sanitizeVideoPatch）。
 */
export default function BatchEditModal({ onClose }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)
  const setReconcile = useDataStore((s) => s.setReconcile)
  const [rating, setRating] = useState('')
  const [year, setYear] = useState('')
  const [series, setSeries] = useState('')
  const [region, setRegion] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)

  const buildPatch = (): Partial<Record<string, unknown>> => {
    const patch: Record<string, unknown> = {}
    const r = Number(rating)
    if (rating.trim() !== '' && Number.isFinite(r) && r >= 0 && r <= 10) patch.rating = r
    const y = Number(year)
    if (year.trim() !== '' && Number.isFinite(y) && y > 1900 && y < 2100) patch.year = y
    if (series.trim() !== '') patch.series = series.trim()
    if (region.trim() !== '') patch.region = region.trim()
    if (tags.trim() !== '') patch.tags = tags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
    return patch
  }

  const submit = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      toast({ text: t('lock.selectedNone'), tone: 'warn' })
      return
    }
    const patch = buildPatch()
    if (Object.keys(patch).length === 0) {
      toast({ text: t('batchEdit.noFields'), tone: 'warn' })
      return
    }
    setSaving(true)
    try {
      const n = await api.videoBatchUpdate(ids, patch)
      setReconcile((prev) =>
        prev
          ? {
              ...prev,
              entries: prev.entries.map((e) =>
                e.video && ids.includes(e.video.id) ? { ...e, video: { ...e.video, ...patch } } : e
              )
            }
          : prev
      )
      setSelectedIds(new Set())
      toast({ text: t('batchEdit.done', { count: n }) })
      onClose()
    } catch (e) {
      toast({ text: `${t('batchEdit.fail')}: ${String(e).slice(0, 120)}`, tone: 'err' })
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full h-9 px-3 rounded-lg bg-white/5 ring-1 ring-white/10 focus:ring-brand/50 focus:outline-none text-sm text-white placeholder-white/25'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[420px] max-w-[92vw] rounded-2xl bg-ink-850 ring-1 ring-white/15 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">{t('batchEdit.title', { count: selectedIds.size })}</h3>
          <button type="button" className="text-white/50 hover:text-white p-1" onClick={onClose} title={t('common.close')}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-white/50 mb-1 block">{t('batchEdit.rating')}</span>
              <input value={rating} onChange={(e) => setRating(e.target.value)} placeholder="0-10" className={inputCls} inputMode="decimal" />
            </label>
            <label className="block">
              <span className="text-xs text-white/50 mb-1 block">{t('batchEdit.year')}</span>
              <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2000" className={inputCls} inputMode="numeric" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-white/50 mb-1 block">{t('batchEdit.series')}</span>
            <input value={series} onChange={(e) => setSeries(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs text-white/50 mb-1 block">{t('batchEdit.region')}</span>
            <input value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs text-white/50 mb-1 block">{t('batchEdit.tags')}</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('batchEdit.tagsPlaceholder')} className={inputCls} />
          </label>
          <p className="text-[11px] text-white/35 leading-relaxed">{t('batchEdit.hint')}</p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button
            type="button"
            className="h-9 px-4 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="h-9 px-4 rounded-lg text-xs font-medium bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-50"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
