import { useEffect, useRef, useState } from 'react'
import type { Video, ImageSource } from '../../../shared/types'
import { posterUrl, placeholderGradient, titleInitial, pureTitle } from '../lib/util'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

interface Props {
  video: Video | null
  onClose: () => void
  onSave: (id: string, patch: Partial<Video>) => void
  onFetchPoster: (id: string) => Promise<Video | null>
}

/** 判断封面地址是本地路径（含 lm:// / file:// / Windows 盘符） */
function isLocalCover(u?: string): boolean {
  return !!u && (/^lm:\/\//.test(u) || /^file:\/\//.test(u) || /^[A-Za-z]:[\\/]|^\//.test(u) || !/^https?:\/\//.test(u))
}

export default function EditMetaModal({ video, onClose, onSave, onFetchPoster }: Props) {
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [rating, setRating] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [description, setDescription] = useState('')
  const [manualPoster, setManualPoster] = useState('')
  const [数据源Poster, setSourcePoster] = useState<string | null>(null)
  const [数据源PosterSource, setSourcePosterSource] = useState<ImageSource | null>(null)
  const [sourceBusy, setSourceBusy] = useState(false)
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!video) return
    setTitle(pureTitle(video.title, video.fileName))
    setYear(video.year ? String(video.year) : '')
    setRating(video.rating != null ? String(video.rating) : '')
    setTags([...video.tags])
    setTagInput('')
    setDescription(video.description ?? '')
    // 编辑页预览与详情页封面保持一致：手动封面 > meta.cover 本地路径 > posterPath
    const isManual = video.posterSource === 'manual'
    setManualPoster(isManual ? video.posterPath ?? '' : '')
    if (!isManual) {
      const metaLocal = video.meta?.cover && isLocalCover(video.meta.cover) ? video.meta.cover : null
      const cover = metaLocal ?? video.posterPath ?? null
      setSourcePoster(cover)
      setSourcePosterSource(
        (metaLocal && video.meta?.source ? video.meta.source : video.posterSource) ?? 'moviedb'
      )
    } else {
      setSourcePoster(null)
      setSourcePosterSource('moviedb')
    }
    setSourceBusy(false)
    setSaveToast(null)
    // 自动聚焦标题
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [video])

  if (!video) return null

  const previewUrl =
    manualPoster || 数据源Poster || video.posterPath
      ? posterUrl(manualPoster || 数据源Poster || video.posterPath)
      : null

  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if (tags.includes(v)) {
      setTagInput('')
      return
    }
    setTags([...tags, v])
    setTagInput('')
  }
  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t))
  }

  async function handleFetchPoster() {
    setSourceBusy(true)
    try {
      const updated = await onFetchPoster(video!.id)
      if (updated?.posterPath) {
        setManualPoster('')
        setSourcePoster(updated.posterPath)
        setSourcePosterSource(updated.posterSource ?? 'moviedb')
      }
    } finally {
      setSourceBusy(false)
    }
  }

  function handleSave() {
    // 简介与标签以「Excel 片单」为权威来源，这里不写回，避免被下次对账覆盖
    const trimmed = title.trim()
    const nextTitle = trimmed ? pureTitle(trimmed) : pureTitle(video!.title, video!.fileName)
    const patch: Partial<Video> = {
      title: nextTitle,
      year: year ? Number(year) : undefined,
      rating: rating ? Number(rating) : undefined,
      tags
    }
    if (manualPoster.trim()) {
      patch.posterPath = manualPoster.trim()
      patch.posterSource = 'manual'
    } else if (数据源Poster) {
      patch.posterPath = 数据源Poster
      patch.posterSource = 数据源PosterSource ?? 'moviedb'
    }
    onSave(video!.id, patch)
    setSaveToast(t('editMeta.saved'))
    setTimeout(() => onClose(), 600)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-ink-900 rounded-2xl w-[920px] max-w-[96vw] max-h-[92vh] overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-black/60 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏（Notion / Linear 风格：图标 + 标题 + 文件名面包屑） */}
        <div className="relative px-7 py-5 border-b border-white/5 bg-gradient-to-r from-ink-850/80 to-ink-900">
          <div className="flex items-center gap-3 pr-10">
            <div className="w-10 h-10 rounded-xl bg-brand/15 ring-1 ring-brand/30 flex items-center justify-center text-brand">
              <Icon name="pencil" size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-[15px] tracking-tight">{t('editMeta.title')}</div>
              <div className="text-white/40 text-xs mt-0.5 truncate flex items-center gap-1.5">
                <Icon name="film" size={11} />
                {video.fileName}
              </div>
            </div>
          </div>
          <button
            className="absolute top-4 right-4 no-drag w-9 h-9 rounded-lg text-white/50 hover:text-white hover:bg-white/10 ring-1 ring-white/5 flex items-center justify-center transition-all"
            onClick={onClose}
            title={t('editMeta.closeEsc')}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-auto thin-scroll">
          <div className="grid grid-cols-[220px_1fr]">
            {/* 左侧封面区 - sticky 滚动时固定可见 */}
            <div className="bg-gradient-to-b from-ink-850/40 to-ink-900/40 border-r border-white/5 p-6">
              <div className="sticky top-0 space-y-4">
                <div className="aspect-[2/3] w-full rounded-xl overflow-hidden bg-ink-800 ring-1 ring-white/10 shadow-2xl shadow-black/40">
                  {previewUrl ? (
                    <img src={previewUrl} alt="poster" className="h-full w-full object-cover poster-img" />
                  ) : (
                    <div
                      className="h-full w-full flex items-center justify-center text-5xl font-bold text-white/80"
                      style={{ background: placeholderGradient(title || video.fileName) }}
                    >
                      {titleInitial(title || video.fileName)}
                    </div>
                  )}
                </div>
                <button
                  className="no-drag w-full px-3.5 py-2.5 rounded-lg bg-brand/90 hover:bg-brand text-white text-sm font-medium disabled:opacity-50 transition-all shadow-md shadow-brand/20"
                  onClick={handleFetchPoster}
                  disabled={sourceBusy}
                >
                  {sourceBusy ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {t('editMeta.fetching')}
                    </span>
                  ) : t('editMeta.fetchCover')}
                </button>
                {数据源Poster ? (
                  <div className="inline-flex items-center justify-center gap-1 w-full text-emerald-400 text-[11px] font-medium">
                    ✓ {t('editMeta.fetchedFromSource')}
                  </div>
                ) : null}
                <div className="pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1 h-3 rounded-full bg-brand" />
                    <div className="text-white/70 text-[12px] font-medium">{t('editMeta.customCover')}</div>
                  </div>
                  <input
                    className="w-full bg-ink-800/60 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 ring-brand/40 focus:bg-ink-800 transition-all border border-white/5 placeholder-white/30"
                    placeholder="D:\posters\foo.jpg"
                    value={manualPoster}
                    onChange={(e) => setManualPoster(e.target.value)}
                  />
                  <div className="text-white/35 text-[10px] mt-1.5 leading-relaxed">
                    {t('editMeta.customCoverHint')}
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧表单（大厂风格：更大 padding、focus 边框发光） */}
            <div className="px-7 py-6 space-y-5">
              <FieldGroup label={t('editMeta.titleField')}>
                <input
                  ref={titleRef}
                  className="w-full bg-ink-800/60 text-white text-sm rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 ring-brand/50 focus:bg-ink-800 transition-all border border-white/5 focus:border-brand/40"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </FieldGroup>

              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label={t('editMeta.year')}>
                  <input
                    className="w-full bg-ink-800/60 text-white text-sm rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 ring-brand/50 focus:bg-ink-800 transition-all border border-white/5 focus:border-brand/40"
                    value={year}
                    inputMode="numeric"
                    onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                    placeholder="2024"
                  />
                </FieldGroup>
                <FieldGroup label={t('editMeta.myRating')} hint="0 - 10">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand font-bold">
                      ★
                    </span>
                    <input
                      className="w-full bg-ink-800/60 text-white text-sm rounded-lg pl-9 pr-3.5 py-2.5 outline-none focus:ring-2 ring-brand/50 focus:bg-ink-800 transition-all border border-white/5 focus:border-brand/40"
                      value={rating}
                      inputMode="decimal"
                      onChange={(e) => setRating(e.target.value.replace(/[^\d.]/g, ''))}
                      placeholder="9.60"
                    />
                  </div>
                </FieldGroup>
              </div>

              <FieldGroup
                label={t('editMeta.tags')}
                hint={tags.length > 0 ? t('edit.tagsCountHint', { count: tags.length }) : t('edit.tagsHint')}
              >
                <div className="bg-ink-800/60 rounded-lg px-2.5 py-2 min-h-[44px] focus-within:ring-2 ring-brand/50 focus-within:bg-ink-800 transition-all border border-white/5 focus-within:border-brand/40">
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {tags.map((tagStr) => (
                      <span
                        key={tagStr}
                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md bg-brand/15 text-brand text-xs font-medium ring-1 ring-brand/20"
                      >
                        {tagStr}
                        <button
                          onClick={() => removeTag(tagStr)}
                          className="hover:bg-brand/30 hover:text-white w-4 h-4 rounded flex items-center justify-center text-brand/70 transition-colors"
                          title={t('editMeta.remove')}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    className="w-full bg-transparent text-white text-sm outline-none placeholder-white/30"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addTag()
                      } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                        setTags(tags.slice(0, -1))
                      }
                    }}
                    placeholder={tags.length ? '' : t('edit.tagPlaceholder')}
                  />
                </div>

                {/* v2.2.13 数据源备用标签（只读展示）—— 避免用户完全看不到 genres 来源 */}
                {video!.backupTags?.length ? (
                  <div className="mt-2.5 rounded-lg bg-sky-400/5 ring-1 ring-sky-300/15 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-sky-200/80 font-medium mb-1.5">
                      <span>📡</span>
                      <span>{t('editMeta.sourceTagsNote')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {video!.backupTags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded bg-sky-400/10 text-sky-200/90 text-[10px] ring-1 ring-sky-300/20"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </FieldGroup>

              <FieldGroup
                label={t('editMeta.descPlaceholder')}
                hint={t('editMeta.descHint', { count: description.length })}
              >
                <textarea
                  className="w-full bg-ink-800/60 text-white/95 text-[13px] rounded-lg px-3.5 py-3 outline-none focus:ring-2 ring-brand/50 focus:bg-ink-800 transition-all border border-white/5 focus:border-brand/40 resize-none leading-relaxed"
                  rows={7}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('editMeta.descPlaceholder')}
                />
              </FieldGroup>
            </div>
          </div>
        </div>

        {/* 底部操作栏（与内容主体明确分离，提示更紧凑） */}
        <div className="flex items-center justify-between gap-3 px-7 py-4 border-t border-white/5 bg-ink-900/60">
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Icon name="info" size={12} className="shrink-0" />
            <span>
              Excel {t('editMeta.sheetPriority')} <span className="text-white/60">{t('editMeta.prioritizedOver')}</span> {t('editMeta.localEdit')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {saveToast ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs">
                ✓ {saveToast}
              </span>
            ) : null}
            <button
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm transition-colors border border-white/5"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              className="px-5 py-2 rounded-lg bg-brand hover:brightness-110 text-white text-sm font-semibold transition-all shadow-md shadow-brand/30"
              onClick={handleSave}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldGroup({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-white/80 text-xs font-medium">{label}</div>
        {hint ? <div className="text-white/30 text-[10px]">{hint}</div> : null}
      </div>
      {children}
    </div>
  )
}
