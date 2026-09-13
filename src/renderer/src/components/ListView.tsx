import { memo, useEffect, useState } from 'react'
import type { DisplayEntry, Video } from '../../../shared/types'
import { entryPrimaryTags, hasDocTags } from '../../../shared/types'
import { posterUrl, placeholderGradient, titleInitial, formatDuration, formatSize, displayTitle } from '../lib/util'
import { useFrameFallback } from '../lib/frameFallback'
import { api } from '../lib/api'
import { t } from '../../../shared/i18n'
import Icon from './Icon'

interface Props {
  entries: DisplayEntry[]
  onOpen: (e: DisplayEntry) => void
  onEdit: (v: Video) => void
  onOpenMissing: (e: DisplayEntry) => void
  onToggleFlag?: (id: string, key: 'favorite' | 'locked') => void
  /** 点击标签 → 一键筛选该标签全部影片 */
  onPickTag?: (tag: string) => void
  /** full = 缩略图列表；filename = 纯文件名列表 */
  mode?: 'full' | 'filename'
  /** v2.7.x：多选模式 —— 点击行切换选中而非打开详情 */
  selectable?: boolean
  /** 多选模式下已选中的视频 id 集合 */
  selectedIds?: Set<string>
  /** 切换选中状态（多选模式） */
  onToggleSelect?: (id: string) => void
}

function ListViewInner({ entries, onOpen, onEdit, onOpenMissing, onToggleFlag, onPickTag, mode = 'full', selectable = false, selectedIds, onToggleSelect }: Props) {
  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-white/40 text-sm px-6 text-center animate-fadeIn">
        <div className="w-14 h-14 rounded-2xl bg-ink-800 ring-1 ring-white/5 flex items-center justify-center mb-4">
          <Icon name="search" size={26} />
        </div>
        {t('list.noMatch')}
      </div>
    )
  }

  return (
    <div className="overflow-auto thin-scroll pr-1 h-full">
      <div className="flex flex-col gap-1.5">
        {entries.map((e) => {
          const v = e.video
          const isMissing = e.kind === 'missing'
          const score = e.score ?? v?.rating
          const fav = !!v?.favorite
          const isLocked = !!v?.locked
          const canSelect = selectable && !!v?.id
          const isSelected = !!(v?.id && selectedIds?.has(v.id))

          // 文件名列表模式：展示文件名、标签、文件大小、演员等（不显示大图和简介）
          if (mode === 'filename') {
            const actors = v?.actors?.length
              ? v.actors
              : v?.meta?.cast?.length
                ? v.meta.cast
                : v?.meta?.actors?.length
                  ? v.meta.actors
                  : []
            const tags = (() => {
              // 主标签来源优先 entry.tagCategories → entry.tags（文档权威）；
              // 无文档标签但视频有 backupTags（数据源 genres）→ 也显示，避免列表空白
              const primary = entryPrimaryTags(e)
              const back = v?.backupTags ?? []
              if (hasDocTags({ tags: e.tags, tagCategories: e.tagCategories })) return primary
              if (primary.length) return primary
              return back
            })()
            const studio = v?.meta?.studio
            const series = v?.meta?.series
            const title = displayTitle(e)
            return (
              <div
                key={v?.id ?? e.code}
                className={`cv-list-item group flex items-center gap-3 px-3 py-2 rounded-lg bg-ink-800/40 hover:bg-ink-700/60 ring-1 transition-colors cursor-pointer ${
                  isSelected ? 'ring-brand ring-2' : 'ring-white/5'
                }`}
                onClick={() => {
                  if (canSelect && v?.id) {
                    onToggleSelect?.(v.id)
                    return
                  }
                  if (isMissing) onOpenMissing(e)
                  else onOpen(e)
                }}
              >
                {canSelect ? (
                  <span
                    className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ring-1 transition-colors ${
                      isSelected ? 'bg-brand text-white ring-brand' : 'bg-black/30 text-white/50 ring-white/30'
                    }`}
                  >
                    <Icon name="check" size={12} className={isSelected ? '' : 'opacity-40'} />
                  </span>
                ) : null}
                {/* 文件名 */}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-white/90 truncate" title={title}>
                    {title}
                  </div>
                  <div className="text-white/35 text-[11px] truncate mt-0.5">
                    {e.code !== title ? e.code : ''}
                    {studio ? ` · ${studio}` : ''}
                    {series ? ` · ${series}` : ''}
                  </div>
                </div>

                {/* 年份 */}
                <div className="w-12 shrink-0 text-right hidden sm:block">
                  {v?.year ? (
                    <span className="text-white/50 text-[11px] tabular-nums">{v.year}</span>
                  ) : null}
                </div>

                {/* 时长 */}
                <div className="w-14 shrink-0 text-right hidden md:block">
                  {v?.durationSec ?? v?.techInfo?.durationSec ? (
                    <span className="text-white/50 text-[11px] tabular-nums">{formatDuration((v.durationSec ?? v.techInfo!.durationSec)!)}</span>
                  ) : null}
                </div>

                {/* 文件大小 */}
                <div className="w-16 shrink-0 text-right hidden md:block">
                  {v?.fileSize ? (
                    <span className="text-white/50 text-[11px] tabular-nums">{formatSize(v.fileSize)}</span>
                  ) : null}
                </div>

                {/* 演员 */}
                <div className="w-28 shrink-0 hidden lg:block">
                  {actors.length > 0 ? (
                    <div className="text-white/50 text-[11px] truncate" title={actors.join(' · ')}>
                      {actors.slice(0, 2).join(' · ')}
                    </div>
                  ) : null}
                </div>

                {/* 标签：仅占所需宽度（不再 flex-1 抢占空间），文件名获得全部剩余宽度避免截断 */}
                <div className="max-w-[260px] min-w-0 overflow-hidden hidden md:flex items-center gap-1">
                  {tags.slice(0, 4).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      title={t('list.filterTag', { tag })}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onPickTag?.(tag)
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/6 text-white/55 text-[10px] truncate max-w-[80px] md:max-w-[100px] lg:max-w-[120px] hover:bg-brand/25 hover:text-brand hover:ring-1 hover:ring-brand/30 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* 评分 / 收藏 */}
                <div className="w-16 shrink-0 flex items-center justify-end gap-1.5">
                  {score != null ? (
                    <span className="flex items-center gap-0.5 text-brand text-[12px] font-semibold">
                      <Icon name="star" size={10} className="fill-brand" />
                      {score.toFixed(2)}
                    </span>
                  ) : null}
                  {fav ? <Icon name="heart" size={12} className="text-brand fill-current" /> : null}
                  {isLocked ? (
                    <span title={t('lock.badge')} className="flex items-center">
                      <Icon name="lock" size={12} className="text-amber-400" />
                    </span>
                  ) : null}
                </div>

                {/* 操作 */}
                {!isMissing && v && !canSelect ? (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      className="w-7 h-7 rounded-lg bg-black/40 hover:bg-brand text-white flex items-center justify-center no-drag"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        void api.videoOpen(v.id)
                      }}
                      title={t('list.play')}
                    >
                      <Icon name="play" size={12} className="fill-current" />
                    </button>
                    {onToggleFlag ? (
                      <button
                        className={`w-7 h-7 rounded-lg flex items-center justify-center no-drag ${fav ? 'bg-brand text-white' : 'bg-black/40 hover:bg-brand text-white'}`}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onToggleFlag(v.id, 'favorite')
                        }}
                        title={fav ? t('list.unfavorite') : t('list.favorite')}
                      >
                        <Icon name="heart" size={12} className={fav ? 'fill-current' : ''} />
                      </button>
                    ) : null}
                    {onToggleFlag ? (
                      <button
                        className={`w-7 h-7 rounded-lg flex items-center justify-center no-drag ${isLocked ? 'bg-amber-500 text-black' : 'bg-black/40 hover:bg-brand text-white'}`}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onToggleFlag(v.id, 'locked')
                        }}
                        title={isLocked ? t('lock.unlockTitle') : t('lock.lockTitle')}
                      >
                        <Icon name={isLocked ? 'lock' : 'unlock'} size={12} />
                      </button>
                    ) : null}
                    <button
                      className="w-7 h-7 rounded-lg bg-black/40 hover:bg-ink-600 text-white flex items-center justify-center no-drag"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onEdit(v)
                      }}
                      title={t('list.edit')}
                    >
                      <Icon name="pencil" size={12} />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          }

          return (
            <div
              key={e.code}
              className={`cv-list-item group flex items-center gap-3 px-2.5 py-2 rounded-xl bg-ink-800/50 hover:bg-ink-700/70 ring-1 transition-colors cursor-pointer ${
                isSelected ? 'ring-brand ring-2' : 'ring-white/5'
              } ${isMissing ? 'opacity-80' : ''}`}
              onClick={() => {
                if (canSelect && v?.id) {
                  onToggleSelect?.(v.id)
                  return
                }
                if (isMissing) onOpenMissing(e)
                else onOpen(e)
              }}
            >
              {canSelect ? (
                <span
                  className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ring-1 transition-colors ${
                    isSelected ? 'bg-brand text-white ring-brand' : 'bg-black/30 text-white/50 ring-white/30'
                  }`}
                >
                  <Icon name="check" size={12} className={isSelected ? '' : 'opacity-40'} />
                </span>
              ) : null}
              {/* 缩略图：无封面时 ffmpeg 截帧兜底，右上角「帧」标识 */}
              <ListThumb video={v} code={e.code} isMissing={isMissing} />

              {/* 主信息 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-medium text-white truncate">{displayTitle(e)}</span>
                  {score != null ? (
                    <span className="flex items-center gap-0.5 text-brand text-[12px] font-semibold shrink-0">
                      <Icon name="star" size={11} className="fill-brand" />
                      {score.toFixed(2)}
                    </span>
                  ) : null}
                  {fav ? <Icon name="heart" size={12} className="text-brand fill-current shrink-0" /> : null}
                  {isLocked ? (
                    <span title={t('lock.badge')} className="flex items-center shrink-0">
                      <Icon name="lock" size={12} className="text-amber-400" />
                    </span>
                  ) : null}
                </div>
                <div className="text-white/45 text-[11px] truncate mt-0.5">
                  {v?.year ? `${v.year} · ` : ''}
                  {v?.meta?.studio ?? e.category}
                  {v?.durationSec ?? v?.techInfo?.durationSec ? ` · ${formatDuration((v.durationSec ?? v.techInfo!.durationSec)!)}` : ''}
                </div>
              </div>

              {/* 标签预览：列表行空间小，优先文档主标签；无文档时兜底 backupTags */}
              <div className="hidden md:flex items-center gap-1 max-w-[240px] overflow-hidden shrink-0">
                {(() => {
                  const p = entryPrimaryTags(e)
                  const back = v?.backupTags ?? []
                  const show = hasDocTags({ tags: e.tags, tagCategories: e.tagCategories }) ? p : [...new Set([...p, ...back])]
                  return show.slice(0, 4).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      title={t('list.filterTag', { tag })}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onPickTag?.(tag)
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/6 text-white/55 text-[10px] truncate max-w-[90px] hover:bg-brand/25 hover:text-brand hover:ring-1 hover:ring-brand/30 transition-colors"
                    >
                      {tag}
                    </button>
                  ))
                })()}
              </div>

              {/* 操作 */}
              {!isMissing && v && !canSelect ? (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    className="w-7 h-7 rounded-lg bg-black/40 hover:bg-brand text-white flex items-center justify-center no-drag"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      void api.videoOpen(v.id)
                    }}
                    title={t('list.play')}
                  >
                    <Icon name="play" size={12} className="fill-current" />
                  </button>
                  {onToggleFlag ? (
                    <>
                      <button
                        className={`w-7 h-7 rounded-lg flex items-center justify-center no-drag ${fav ? 'bg-brand text-white' : 'bg-black/40 hover:bg-brand text-white'}`}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onToggleFlag(v.id, 'favorite')
                        }}
                        title={fav ? t('list.unfavorite') : t('list.favorite')}
                      >
                        <Icon name="heart" size={12} className={fav ? 'fill-current' : ''} />
                      </button>
                      <button
                        className={`w-7 h-7 rounded-lg flex items-center justify-center no-drag ${isLocked ? 'bg-amber-500 text-black' : 'bg-black/40 hover:bg-brand text-white'}`}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onToggleFlag(v.id, 'locked')
                        }}
                        title={isLocked ? t('lock.unlockTitle') : t('lock.lockTitle')}
                      >
                        <Icon name={isLocked ? 'lock' : 'unlock'} size={12} />
                      </button>
                    </>
                  ) : null}
                  <button
                    className="w-7 h-7 rounded-lg bg-black/40 hover:bg-ink-600 text-white flex items-center justify-center no-drag"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onEdit(v)
                    }}
                    title={t('list.edit')}
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default memo(ListViewInner)

/** 列表缩略图：无真实封面时懒加载 ffmpeg 截帧兜底，右上角「帧」标识；完整显示封面（object-contain） */
function ListThumb({ video, code, isMissing }: { video?: Video | null; code: string; isMissing: boolean }) {
  const [imgError, setImgError] = useState(false)
  // 封面优先级：手动设的封面（manual）> meta.cover（真实海报）> 非截帧 posterPath > 截帧 posterPath
  const manualPoster = video?.posterSource === 'manual' && video?.posterPath ? video.posterPath : null
  const detailCover =
    video?.meta?.cover && !/^https?:\/\//.test(video.meta.cover) ? video.meta.cover : null
  const realPoster =
    video?.posterPath &&
    video.posterSource &&
    video.posterSource !== 'ffmpeg' &&
    video.posterSource !== 'placeholder' &&
    video.posterSource !== 'manual'
      ? video.posterPath
      : null
  const poster = manualPoster ?? detailCover ?? realPoster ?? video?.posterPath ?? null
  // coverVersion：手动设为封面后文件内容变了但路径可能不变，用它让 lm:// URL 带 ?v= 强制立即刷新
  const original = poster ? posterUrl(poster, video?.coverVersion) : null
  const hasValidSrc = original && !imgError ? original : null
  const { fallbackPoster } = useFrameFallback(video ?? undefined, hasValidSrc)
  const src = hasValidSrc ?? fallbackPoster
  const isFrameFallback = src
    ? src === fallbackPoster || (!manualPoster && !detailCover && !realPoster && video?.posterSource === 'ffmpeg')
    : false

  // 自动补齐元信息后 posterPath/coverVersion 变化时重置错误状态，否则旧错误会挡住真实海报
  useEffect(() => {
    setImgError(false)
  }, [poster, video?.coverVersion])

  return (
    <div className="w-11 h-16 shrink-0 rounded-md overflow-hidden bg-ink-900 ring-1 ring-white/10 relative">
      {src ? (
        <>
          <img src={src} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md opacity-40" />
          <img src={src} alt="" loading="lazy" className="relative h-full w-full object-contain poster-img" onError={() => setImgError(true)} />
          {isFrameFallback ? (
            <span className="absolute bottom-0.5 right-0.5 px-1 py-px rounded bg-black/70 text-white/90 text-[8px] font-bold leading-none">{t('list.frameFallback')}</span>
          ) : null}
        </>
      ) : (
        <div className="h-full w-full flex items-center justify-center text-base font-bold text-white/80" style={{ background: placeholderGradient(code) }}>
          {titleInitial(code)}
        </div>
      )}
      {isMissing ? (
        <span className="absolute inset-0 flex items-center justify-center bg-red-600/70 text-white text-[9px] font-bold">{t('list.missing')}</span>
      ) : null}
    </div>
  )
}
