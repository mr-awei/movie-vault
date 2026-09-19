import { useCallback, useEffect, useState } from 'react'
import type { SceneMarker, Video } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'
import { toast } from './Toast'
import { t } from '../../../shared/i18n'

interface Props {
  video: Video
}

/** 秒 → HH:MM:SS / MM:SS */
function fmtPos(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/** 输入 "1:02:30" / "90" / "1:30" → 秒 */
function parsePos(input: string): number | null {
  const s = input.trim()
  if (!s) return null
  const parts = s.split(':')
  if (parts.some((p) => p.trim() === '' || !/^\d+$/.test(p.trim()))) return null
  const nums = parts.map((p) => Number(p.trim()))
  if (nums.length === 1) return nums[0]
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  return null
}

/**
 * 场景标记（v2.12，对标 Stash scene markers）。
 * 时间点 + 名称 + 标签；点击标记跳转播放（videoOpen + startSec）。
 */
export default function SceneMarkers({ video }: Props) {
  const [markers, setMarkers] = useState<SceneMarker[]>([])
  const [loading, setLoading] = useState(true)
  const [pos, setPos] = useState('')
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    void api
      .markerList(video.id)
      .then(setMarkers)
      .finally(() => setLoading(false))
  }, [video.id])

  useEffect(() => {
    load()
  }, [load])

  const add = async () => {
    const sec = parsePos(pos)
    if (sec == null) {
      toast({ text: t('markers.invalidPos'), tone: 'warn' })
      return
    }
    setSaving(true)
    try {
      const tagArr = tags
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const m = await api.markerCreate(video.id, sec, name, tagArr)
      if (m) {
        setMarkers((prev) => [...prev, m].sort((a, b) => a.positionSec - b.positionSec))
        setPos('')
        setName('')
        setTags('')
        toast({ text: t('markers.added') })
      }
    } catch (e) {
      toast({ text: `${t('markers.fail')}: ${String(e).slice(0, 120)}`, tone: 'err' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await api.markerDelete(id)
    setMarkers((prev) => prev.filter((m) => m.id !== id))
  }

  const playAt = (sec: number) => {
    void api.videoOpen(video.id, sec)
  }

  const inputCls =
    'h-8 px-2.5 rounded-lg bg-white/90 ring-1 ring-white/40 focus:ring-brand/50 focus:outline-none text-xs text-slate-900 placeholder-slate-400'

  return (
    <div className="mb-6 bg-ink-800/40 rounded-xl p-4 ring-1 ring-white/8">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="bookmark" size={14} />
        <span className="text-xs font-medium text-white/60">{t('markers.title')}</span>
        <span className="text-[11px] text-white/30">{t('markers.subtitle')}</span>
      </div>

      {/* 使用说明 */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-white/4 ring-1 ring-white/6">
        <div className="text-[11px] text-white/50 leading-relaxed">
          给影片打「精彩时间点书签」：时间位置填 <code className="px-1 rounded bg-white/10 text-white/70">1:02:30</code> 或 <code className="px-1 rounded bg-white/10 text-white/70">450</code>（秒），标记名填如「主角出场」，标签可选。添加后点时间戳直接跳转播放。
        </div>
      </div>

      {/* 新增 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder={t('markers.posPlaceholder')} className={`${inputCls} w-20`} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('markers.namePlaceholder')} className={`${inputCls} w-36`} />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('markers.tagsPlaceholder')} className={`${inputCls} flex-1 min-w-[120px]`} />
        <button
          type="button"
          className="h-8 px-3 rounded-lg text-xs font-medium bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-50"
          onClick={() => void add()}
          disabled={saving}
        >
          {t('markers.add')}
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <p className="text-xs text-white/35 py-2">{t('common.loading')}</p>
      ) : markers.length === 0 ? (
        <p className="text-xs text-white/30 py-2">{t('markers.empty')}</p>
      ) : (
        <ul className="space-y-1.5 max-h-[260px] overflow-y-auto thin-scroll">
          {markers.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/4 hover:bg-white/8 ring-1 ring-white/6 transition-colors group"
            >
              <button
                type="button"
                className="text-xs font-mono text-brand/90 hover:text-brand shrink-0 w-14 text-left"
                onClick={() => playAt(m.positionSec)}
                title={t('markers.playAt')}
              >
                {fmtPos(m.positionSec)}
              </button>
              {m.name ? <span className="text-xs text-white/85 truncate">{m.name}</span> : <span className="text-xs text-white/25 italic truncate">{t('markers.unnamed')}</span>}
              {m.tags && m.tags.length > 0 ? (
                <span className="flex gap-1 overflow-hidden">
                  {m.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-white/8 text-[10px] text-white/60 whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                </span>
              ) : null}
              <button
                type="button"
                className="ml-auto text-white/25 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                onClick={() => void remove(m.id)}
                title={t('common.delete')}
              >
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
