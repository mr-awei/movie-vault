/**
 * 详情页子组件（P1-13：从 VideoDetail.tsx 拆出）。
 * 按职责拆分：Header(工具条+URL+锁定提示) / 封面 / 文件信息 / CTA 操作行 /
 * 元数据面板(徽标+标题+评分+元数据行+标签) / 演员 / 预览帧 / 相关推荐 / 放大浮层。
 * 局部 UI state（播放列表菜单、备用标签展开、失败预览集）内聚到各自组件。
 */
import { useState, type ReactNode } from 'react'
import type { DisplayEntry, MovieMeta, Playlist, Video } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'
import { t } from '../../../shared/i18n'
import {
  posterUrl,
  placeholderGradient,
  titleInitial,
  formatSize,
  formatDuration,
  resolveEntryPoster,
  pureTitle,
  stringToMutedColor
} from '../lib/util'
import { hasDocTags, primaryTags, NON_TAG_CATEGORY_NAMES, splitHierarchicalTag } from '../../../shared/types'

type DetailFilter = { type: 'actor' | 'studio' | 'series' | 'category'; value: string }

/* ================= 共享小组件 ================= */

/** 渲染元数据一行（key: value）—— label 左对齐，列宽由最宽 label 自动撑开 */
export function MetaRow({ label, value, children }: { label: string; value?: ReactNode; children?: ReactNode }) {
  if (!value && !children) return null
  return (
    <div className="flex items-baseline gap-2 text-[12.5px] leading-relaxed">
      <span className="text-white/45 shrink-0">{label}</span>
      {children ?? (value != null ? <span className="text-white/90 break-all">{value}</span> : null)}
    </div>
  )
}

/** 把 ffprobe 技术参数拼成一行可读文本（分辨率 · 编码 · 码率 · 帧率） */
export function formatTech(tech?: Video['techInfo']): string | undefined {
  if (!tech) return undefined
  const p: string[] = []
  if (tech.width && tech.height) p.push(`${tech.width}×${tech.height}`)
  if (tech.videoCodec) p.push(tech.videoCodec.toUpperCase())
  if (tech.bitrateKbps) p.push(`${(tech.bitrateKbps / 1000).toFixed(1)} Mbps`)
  if (tech.fps) p.push(`${tech.fps} fps`)
  if (tech.audioCodec) p.push(t('detail.audioCodecLabel', { codec: tech.audioCodec.toUpperCase() }))
  return p.length ? p.join(' · ') : undefined
}

const isLocal = (u?: string) => !!u && !/^https?:\/\//.test(u)

/* ================= 顶部工具条 + URL 输入 + 锁定提示 ================= */

export function DetailHeader(props: {
  video: Video
  localVideo: Video
  fetching: boolean
  framing: boolean
  urlInput: string
  setUrlInput: (v: string) => void
  fetchByUrl: () => void
  forceFetch: () => void
  handleGenerateFrames: () => void
  onToggleFlag?: (id: string, flag: 'favorite' | 'locked') => void
  onToggleLockLocal: () => void
  onClose: () => void
}) {
  const { video, localVideo, fetching, framing, urlInput, setUrlInput, fetchByUrl, forceFetch, handleGenerateFrames, onToggleFlag, onToggleLockLocal, onClose } = props
  return (
    <>
      {/* 顶部工具条 */}
      <div className="flex items-center justify-between mb-4 sticky top-0 -mx-5 px-5 py-3 bg-ink-850/95 z-10 backdrop-blur-sm border-b border-white/5">
        <button
          className="no-drag h-8 px-3 rounded-lg flex items-center gap-1.5 bg-ink-700 hover:bg-ink-600 text-white text-sm transition-colors"
          onClick={onClose}
        >
          <Icon name="arrowLeft" size={14} />
          {t('detail.back')}
        </button>
        <div className="flex items-center gap-2">
          <button
            className="no-drag h-8 px-3 rounded-lg flex items-center gap-1.5 bg-ink-700 hover:bg-ink-600 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={forceFetch}
            disabled={fetching || framing}
            title={t('detail.refetchInfoTitle')}
          >
            <Icon name="refresh" size={13} className={fetching ? 'animate-spin' : ''} />
            {fetching ? t('detail.processing') : t('detail.refetchInfo')}
          </button>
          <button
            className="no-drag h-8 px-3 rounded-lg flex items-center gap-1.5 bg-ink-700 hover:bg-ink-600 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleGenerateFrames}
            disabled={fetching || framing}
            title={t('detail.reframeTitle')}
          >
            <Icon name="film" size={13} className={framing ? 'animate-spin' : ''} />
            {framing ? t('detail.framing') : t('detail.reframe')}
          </button>
          {onToggleFlag ? (
            <>
              <button
                className={`no-drag h-8 w-9 rounded-lg flex items-center justify-center transition-colors ${
                  video.favorite ? 'bg-brand text-white' : 'bg-ink-700 hover:bg-ink-600 text-white'
                }`}
                onClick={() => onToggleFlag(video.id, 'favorite')}
                title={video.favorite ? t('detail.unfavorite') : t('detail.favorite')}
              >
                <Icon name="heart" size={14} className={video.favorite ? 'fill-current' : ''} />
              </button>
              <button
                className={`no-drag h-8 w-9 rounded-lg flex items-center justify-center transition-colors ${
                  localVideo.locked ? 'bg-amber-500 text-black' : 'bg-ink-700 hover:bg-ink-600 text-white'
                }`}
                onClick={onToggleLockLocal}
                title={localVideo.locked ? t('lock.unlockTitle') : t('lock.lockTitle')}
              >
                <Icon name={localVideo.locked ? 'lock' : 'unlock'} size={14} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* 按网址更新：粘贴任一数据源电影页面链接直连抓取 */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <input
            className="no-drag flex-1 h-8 px-3 rounded-lg bg-ink-800 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-brand/60"
            type="text"
            placeholder={t('detail.urlPlaceholder')}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchByUrl()
            }}
          />
          <button
            type="button"
            className="no-drag h-8 px-3 rounded-lg flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={fetchByUrl}
            disabled={fetching || !urlInput.trim()}
          >
            <Icon name="globe" size={13} />
            {t('detail.fetchByUrl')}
          </button>
        </div>
        <div className="mt-1.5 text-[11px] text-white/40 flex items-center gap-1">
          <Icon name="info" size={11} />
          {t('detail.urlHint')}
        </div>
      </div>

      {/* 锁定提示：让用户明确知道此片会被批量补齐自动跳过 */}
      {localVideo.locked ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 px-3 py-2 text-[12px] text-amber-200/90">
          <Icon name="lock" size={13} className="mt-0.5 shrink-0 text-amber-400" />
          <span>{t('lock.detailLockedHint')}</span>
        </div>
      ) : null}
    </>
  )
}

/* ================= 左栏：封面 ================= */

export function DetailCover(props: { coverSrc: string | null; posterVersion: number; title: string; onError: () => void }) {
  const { coverSrc, posterVersion, title, onError } = props
  return (
    <div className="aspect-[2/3] w-full rounded-xl overflow-hidden bg-ink-800 ring-1 ring-white/10 relative shrink-0">
      {coverSrc ? (
        <div className="absolute inset-0">
          {/* 模糊铺底：横竖屏封面完整显示，四周裁切处由模糊同图填充 */}
          <img
            src={posterUrl(coverSrc, posterVersion) ?? ''}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-40"
          />
          <img
            src={posterUrl(coverSrc, posterVersion) ?? ''}
            alt={title}
            className="relative h-full w-full object-contain poster-img"
            onError={onError}
          />
        </div>
      ) : (
        <div
          className="h-full w-full flex items-center justify-center text-5xl font-bold text-white/80"
          style={{ background: placeholderGradient(title) }}
        >
          {titleInitial(title)}
        </div>
      )}
    </div>
  )
}

/* ================= 左栏：文件信息 ================= */

export function FileInfoPanel(props: { video: Video; d?: MovieMeta | null; tech?: Video['techInfo'] }) {
  const { video, d, tech } = props
  return (
    <div className="space-y-1 bg-ink-800/40 rounded-xl p-3.5 ring-1 ring-white/8">
      <div className="text-xs font-medium text-white/60 mb-1.5 flex items-center gap-1.5">
        <Icon name="info" size={11} className="text-white/40" />
        {t('detail.fileInfo')}
      </div>
      <MetaRow label={t('detail.fileName')} value={video.fileName} />
      {video.addedAt ? <MetaRow label={t('detail.addedAt')} value={new Date(video.addedAt).toLocaleString('zh-CN')} /> : null}
      {video.path ? <MetaRow label={t('detail.fullPath')} value={video.path} /> : null}
      <MetaRow label={t('detail.date')} value={d?.date} />
      <MetaRow label={t('detail.duration')} value={d?.duration} />
      <MetaRow label={t('detail.fileSize')} value={video.fileSize ? formatSize(video.fileSize) : undefined} />
      <MetaRow label={t('detail.techInfo')} value={formatTech(tech)} />
    </div>
  )
}

/* ================= CTA 操作行（播放/编辑/打开位置/播放列表/删除） ================= */

export function DetailActions(props: {
  video: Video
  onPlay: (v: Video) => void
  onEdit?: (v: Video) => void
  onDelete?: (v: Video) => void
  playlists: Playlist[]
  onAddToPlaylist?: (playlistId: string, videoId: string) => void
}) {
  const { video, onPlay, onEdit, onDelete, playlists, onAddToPlaylist } = props
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <button
        className="h-11 px-7 rounded-xl flex items-center gap-2.5 bg-brand hover:brightness-110 text-white text-sm font-semibold shadow-lg shadow-brand/40 transition-all"
        onClick={() => onPlay(video)}
      >
        <Icon name="play" size={16} className="fill-current" />
        {t('detail.play')}
      </button>
      {onEdit ? (
        <button
          className="h-11 px-4 rounded-xl flex items-center gap-2 bg-ink-700 hover:bg-ink-600 text-white/90 hover:text-white text-sm transition-colors"
          onClick={() => onEdit(video)}
          title={t('detail.editTitle')}
        >
          <Icon name="pencil" size={14} />
          {t('detail.edit')}
        </button>
      ) : null}
      <button
        className="h-11 px-4 rounded-xl flex items-center gap-2 bg-ink-700 hover:bg-ink-600 text-white/90 hover:text-white text-sm transition-colors"
        onClick={() => void api.shellRevealInFolder(video.path)}
        title={t('detail.openLocationTitle')}
      >
        <Icon name="folderOpen" size={14} />
        {t('detail.openLocation')}
      </button>
      {playlists && playlists.length > 0 && onAddToPlaylist ? (
        <div className="relative">
          <button
            className="h-11 px-4 rounded-xl flex items-center gap-2 bg-ink-700 hover:bg-ink-600 text-white/90 hover:text-white text-sm transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name="list" size={14} />
            添加到列表
          </button>
          {menuOpen ? (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-xl bg-ink-800 ring-1 ring-white/10 shadow-xl py-1.5 text-sm">
              {playlists.slice(0, 10).map((pl) => (
                <button
                  key={pl.id}
                  className="w-full text-left px-3 py-2 hover:bg-ink-700 transition-colors flex items-center gap-2"
                  onClick={() => {
                    onAddToPlaylist(pl.id, video.id)
                    setMenuOpen(false)
                  }}
                >
                  <Icon name="list" size={13} className="text-white/40" />
                  <span className="truncate">{pl.name}</span>
                  <span className="ml-auto text-[11px] text-white/30">{pl.videoIds.length}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {onDelete ? (
        <button
          className="h-11 px-4 rounded-xl flex items-center gap-2 bg-red-500/10 hover:bg-red-500/25 text-red-300 hover:text-red-200 text-sm transition-colors"
          onClick={() => onDelete(video)}
          title={t('detail.deleteFileTitle')}
        >
          <Icon name="trash" size={14} />
          {t('detail.deleteFile')}
        </button>
      ) : null}
    </div>
  )
}

/* ================= 元数据面板（徽标+标题+评分 / 元数据行+标签） ================= */

export function DetailMetaHead(props: { d?: MovieMeta | null; localVideo: Video; video: Video }) {
  const { d, localVideo, video } = props
  return (
    <>
      {d ? (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium mb-2 ${
            d.source === 'openlibrary'
              ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
              : d.source === 'omdb'
                ? 'bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30'
                : d.source === 'justwatch'
                  ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                  : d.source === 'wikipedia'
                    ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                    : 'bg-brand/15 text-brand ring-1 ring-brand/30'
          }`}
        >
          {t('detail.dataSource', { source: d.source === 'openlibrary' ? 'OpenLibrary' : d.source === 'omdb' ? 'OMDb' : d.source === 'justwatch' ? 'JustWatch' : d.source === 'wikipedia' ? '维基百科' : 'MovieDB' })}
        </span>
      ) : null}
      {/* 截帧封面标识：无真实封面，展示的是视频画面里截的一帧（d.cover 有真实封面时不显示） */}
      {localVideo?.posterSource === 'ffmpeg' && !(d?.cover && isLocal(d.cover)) ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium mb-2 bg-fuchsia-500/15 text-fuchsia-400 ring-1 ring-fuchsia-500/30">
          <Icon name="film" size={11} className="fill-current" />
          {t('detail.isFfmpegCoverLabel')}
        </span>
      ) : null}

      <div className="flex items-center gap-2.5 mb-1 flex-wrap">
        <div className="text-2xl font-semibold text-white break-all">{pureTitle(video.title, video.fileName)}</div>
      </div>
      {d?.title && d.title !== pureTitle(video.title, video.fileName) ? (
        <div className="text-white/50 text-sm mb-2 break-all">{d.title}</div>
      ) : (
        <div className="mb-2" />
      )}

      {/* 我的推荐评分（md 权威，替换数据源评分） */}
      {video.rating != null ? (
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand/15 ring-1 ring-brand/30">
            <Icon name="star" size={16} className="text-brand fill-brand" />
            <span className="text-brand font-bold text-xl leading-none tabular-nums">{video.rating.toFixed(2)}</span>
          </span>
          <span className="text-white/40 text-xs">{t('detail.myRecommendedScore')}</span>
        </div>
      ) : null}
    </>
  )
}

export function DetailMetaBody(props: {
  d?: MovieMeta | null
  localVideo: Video
  video: Video
  yearText?: string
  loading: boolean
  error: string | null
  onPickFilter?: (f: DetailFilter) => void
  onPickTag?: (tag: string) => void
}) {
  const { d, localVideo, video, yearText, loading, error, onPickFilter, onPickTag } = props
  /** 备用来源标签（backupTags）默认折叠为一行；点开才展开全部 */
  const [showBackupTags, setShowBackupTags] = useState(false)
  return (
    <div className="min-w-0 flex flex-col">
      {/* 影片信息：导演/主演/类型/年份等元数据（日期、时长、大小、参数已放到封面下方） */}
      <div className="space-y-1.5 mb-4">
        <MetaRow label={t('detail.director')} value={d?.director} />
        <MetaRow label={t('detail.studio')}>
          {d?.studio ? (
            <button type="button" onClick={() => onPickFilter?.({ type: 'studio', value: d.studio! })} className="text-brand hover:underline underline-offset-2">
              {d.studio}
            </button>
          ) : undefined}
        </MetaRow>
        {/* Excel 片单「分类」列的单值（如"剧情"、"科幻"），独立于 tagCategories */}
        {localVideo.introCategory ? (
          <MetaRow label={t('detail.category')}>
            <button type="button" onClick={() => onPickFilter?.({ type: 'category', value: localVideo.introCategory! })} className="text-brand hover:underline underline-offset-2">
              {localVideo.introCategory}
            </button>
          </MetaRow>
        ) : null}
        {/* v2.8.5：Excel 片单「地区」列，权威源 */}
        {localVideo.region ? <MetaRow label={t('detail.region')} value={localVideo.region} /> : null}
        {/* 数据源评分仅在没有我的评分时兜底显示 */}
        <MetaRow label={t('detail.score')} value={video.rating != null ? undefined : d?.rating} />
        <MetaRow label={t('detail.genre')} value={d?.genres?.length ? d.genres.join(' / ') : undefined} />
        <MetaRow label={t('detail.year')} value={yearText} />
      </div>

      {/* v2.2.13 文档标签分层：
          有结构化 tagCategories → 按分类分组展示主标签；
          无结构化但有文档平铺 tags → 退化一组展示；
          无文档标签 + 有 backupTags → 直接把数据源 tags 作主标签展示（不在「备用」里折叠）。
          按钮样式：文档主标签用 brand 色系；备用标签（展开后）用 info 色系区分来源。 */}
      {(() => {
        const cats = localVideo.tagCategories
        const primary = primaryTags({ tags: localVideo.tags, tagCategories: cats })
        const backup = localVideo.backupTags ?? []
        const hasDoc = hasDocTags({ tags: localVideo.tags, tagCategories: cats })
        // 主标签节点：按分类分组 / 平铺（结构化 vs 退化）
        const primaryNode = (() => {
          if (cats && Object.keys(cats).length > 0) {
            // v2.2.14-fix：分类名 normalize（去空格 + 去末尾冒号斜杠），
            // 防 tagCategories 里同时存在 "分类" / "分类:" / "分类/" 等
            // 只差标点的 key 导致 React key 重复 Warning
            const normalizeCat = (n: string) => n.trim().replace(/[:：/\\]+$/, '').trim()
            // 去重 + 过滤空 tag 字符串 + 过滤非标签分类 + key 加索引后缀
            const seen = new Set<string>()
            const dedup: [string, string[]][] = []
            for (const [name, rawList] of Object.entries(cats)) {
              const norm = normalizeCat(name)
              if (!norm) continue
              if (NON_TAG_CATEGORY_NAMES.has(norm)) continue
              const list = Array.from(new Set((rawList ?? []).map((tt) => tt?.trim() ?? '').filter(Boolean).flatMap((tt) => splitHierarchicalTag(tt))))
              if (!list.length) continue
              if (seen.has(norm)) continue
              seen.add(norm)
              dedup.push([norm, list])
            }
            if (!dedup.length) return null
            return (
              <div className="space-y-1.5 min-w-0">
                {dedup.map(([catName, list], idx) => (
                  <div key={`${catName}_${idx}`} className="flex flex-wrap gap-1.5 min-w-0 items-center">
                    <span className="text-[11px] text-white/40 shrink-0 pr-1 min-w-[3.5rem]">{catName}</span>
                    <div className="flex flex-wrap gap-2 min-w-0">
                      {list.map((tagStr) => (
                        <button
                          key={`${catName}:${tagStr}`}
                          type="button"
                          onClick={() => onPickTag?.(tagStr)}
                          title={t('detail.filterTagsByCategory', { category: catName, tag: tagStr })}
                          className="px-2.5 py-1 rounded-lg bg-brand/12 ring-1 ring-brand/25 text-brand text-xs hover:bg-brand/25 hover:ring-brand/50 transition-all"
                        >
                          {tagStr}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
          if (primary.length > 0) {
            return (
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {primary.map((tagStr) => (
                  <button
                    key={tagStr}
                    type="button"
                    onClick={() => onPickTag?.(tagStr)}
                    title={t('detail.filterAllDocs', { tag: tagStr })}
                    className="px-2 py-0.5 rounded-md bg-brand/12 ring-1 ring-brand/20 text-brand text-xs hover:bg-brand/25 hover:ring-brand/40 transition-colors"
                  >
                    {tagStr}
                  </button>
                ))}
              </div>
            )
          }
          return null
        })()

        // 备用标签节点：
        //  - 有文档标签（即上面展示了主标签）→ 折叠为一行，点开才展开（用户要求的折叠备用展示）
        //  - 无文档标签 → 不作为「备用」折叠，而作主标签直接展示（info 色系标识来源）
        const backupNode = (() => {
          if (!backup.length) return null
          if (!hasDoc) {
            // 无文档：backupTags 就是主标签
            return (
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {backup.map((tagStr) => (
                  <button
                    key={`b:${tagStr}`}
                    type="button"
                    onClick={() => onPickTag?.(tagStr)}
                    title={t('detail.filterAllSourcePrimary', { tag: tagStr })}
                    className="px-2 py-0.5 rounded-md bg-sky-500/12 ring-1 ring-sky-400/20 text-sky-300 text-xs hover:bg-sky-500/25 hover:ring-sky-400/40 transition-colors"
                  >
                    {tagStr}
                  </button>
                ))}
              </div>
            )
          }
          // 有文档：折叠为一行（默认展示前 3 个 + 展开按钮）
          const shown = showBackupTags ? backup : backup.slice(0, 3)
          return (
            <div className="mt-0.5 min-w-0">
              <div className="flex flex-wrap gap-1.5 items-center min-w-0">
                <span className="text-[11px] text-white/35 shrink-0 pr-1 min-w-[3.5rem]">{t('detail.sourceTag')}</span>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {shown.map((tagStr) => (
                    <button
                      key={`b:${tagStr}`}
                      type="button"
                      onClick={() => onPickTag?.(tagStr)}
                      title={t('detail.filterAllSourceBackup', { tag: tagStr })}
                      className="px-2 py-0.5 rounded-md bg-sky-500/10 ring-1 ring-sky-400/15 text-sky-300/80 text-[11px] hover:bg-sky-500/20 hover:ring-sky-400/35 transition-colors"
                    >
                      {tagStr}
                    </button>
                  ))}
                </div>
                {backup.length > 3 && !showBackupTags ? (
                  <button
                    type="button"
                    onClick={() => setShowBackupTags(true)}
                    className="text-[11px] text-white/45 hover:text-white/70 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                  >
                    {t('detail.andMoreCount', { count: backup.length - 3 })}
                  </button>
                ) : showBackupTags ? (
                  <button
                    type="button"
                    onClick={() => setShowBackupTags(false)}
                    className="text-[11px] text-white/45 hover:text-white/70 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                  >
                    {t('detail.collapse')}
                  </button>
                ) : null}
              </div>
              <div className="text-[10px] text-white/30 mt-1">
                文档片单标签（彩色）是权威分类；数据源抓取的 genres（蓝色）仅作备用参考。
              </div>
            </div>
          )
        })()

        if (!primaryNode && !backupNode) return null
        return (
          <MetaRow label={t('detail.tag')}>
            <div className="space-y-1.5 min-w-0">
              {primaryNode}
              {backupNode}
            </div>
          </MetaRow>
        )
      })()}

      {loading ? <div className="mt-4 text-white/40 text-xs">{t('detail.fetchingDetail')}</div> : null}
      {error ? <div className="mt-4 text-amber-400 text-xs">{error}</div> : null}
    </div>
  )
}

/* ================= 演员阵容 ================= */

export function CastGrid(props: { d?: MovieMeta | null; onPickFilter?: (f: DetailFilter) => void }) {
  const { d, onPickFilter } = props
  const rawProfiles = d?.castProfiles?.length
    ? d.castProfiles
    : (d?.cast || d?.actors || []).map((name) => ({ name, photo: undefined as string | undefined, character: undefined as string | undefined }))
  const profiles = rawProfiles.filter((p, i, arr) => arr.findIndex((q) => q.name === p.name) === i)
  if (!profiles.length) return null
  return (
    <div className="mt-6 mb-2">
      <div className="text-xs font-medium text-white/60 mb-3 flex items-center gap-1.5">
        <Icon name="users" size={11} className="text-white/40" />
        {t('detail.cast')}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 max-h-[420px] overflow-y-auto overflow-x-hidden thin-scroll pr-1">
        {profiles.map((actor, i) => {
          const photoUrl = actor.photo ? posterUrl(actor.photo) : null
          return (
            <button
              key={`${actor.name}-${i}`}
              type="button"
              onClick={() => onPickFilter?.({ type: 'actor', value: actor.name })}
              className="text-left group flex flex-col min-w-0"
              title={actor.character ? `${actor.name} — ${actor.character}` : actor.name}
            >
              <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-ink-800 ring-1 ring-white/10 mb-1.5 transition-transform duration-200 group-hover:scale-[1.02]">
                {photoUrl ? (
                  <img src={photoUrl} alt={actor.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-center text-xs text-white/95"
                    style={{ backgroundColor: stringToMutedColor(actor.name) }}
                  >
                    <span className="line-clamp-3 break-all p-1">{actor.name}</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-white/90 truncate leading-tight">{actor.name}</div>
              {actor.character ? <div className="text-[10px] text-white/45 truncate leading-tight">{actor.character}</div> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ================= 预览帧 ================= */

export function PreviewFrames(props: {
  previewUrls: string[]
  previewPaths: string[]
  onZoomEnter: (displayUrl: string) => void
  onZoomLeave: () => void
  onZoomClick: (displayUrl: string) => void
  onSetAsCover: (previewPath: string) => void
}) {
  const { previewUrls, previewPaths, onZoomEnter, onZoomLeave, onZoomClick, onSetAsCover } = props
  const [failedPreviews, setFailedPreviews] = useState<Set<number>>(new Set())
  return (
    <div className="mb-6">
      <div className="text-white/80 font-medium mb-2 flex items-center gap-1.5 flex-wrap">
        <Icon name="film" size={13} className="text-white/40" />
        {t('detail.previewFramesHeader', { count: previewPaths.length })}
        {previewPaths.length > 1 ? (
          <span className="flex items-center gap-1.5 text-white/45 text-[12px] ml-2">
            <Icon name="info" size={14} className="text-[#FF6B8A] animate-pulse shrink-0" />
            <span>{t('detail.hoverHint')}</span>
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {previewUrls.map((displayUrl, i) => (
          <div
            key={displayUrl}
            className="aspect-video rounded-lg overflow-hidden bg-ink-800 cursor-zoom-in relative group/preview"
            title={t('detail.hoverHint2')}
            onMouseEnter={() => onZoomEnter(displayUrl)}
            onMouseLeave={onZoomLeave}
            onClick={() => onZoomClick(displayUrl)}
          >
            {failedPreviews.has(i) ? (
              <div className="h-full w-full flex items-center justify-center" style={{ background: placeholderGradient(`preview-${i}`) }}>
                <Icon name="image" size={24} className="text-white/20" />
              </div>
            ) : (
              <img
                src={displayUrl}
                alt={`preview-${i}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover poster-img"
                onError={() => setFailedPreviews((prev) => new Set(prev).add(i))}
              />
            )}
            {/* 设为封面：hover 显示，点击把这帧复制为封面 */}
            <button
              type="button"
              className="absolute bottom-1.5 right-1.5 opacity-0 group-hover/preview:opacity-100 transition-opacity px-2 py-1 rounded-md bg-white/95 text-slate-900 hover:bg-brand hover:text-white text-[11px] font-medium flex items-center gap-1 no-drag shadow-md shadow-black/25"
              onClick={(e) => {
                e.stopPropagation()
                void onSetAsCover(previewPaths[i])
              }}
              title={t('detail.setAsCoverTitle')}
            >
              <Icon name="film" size={10} className="fill-current" />
              {t('detail.setAsCover')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================= 相关推荐 ================= */

export function RelatedGrid(props: { related: DisplayEntry[]; onOpenRelated?: (r: DisplayEntry) => void }) {
  const { related, onOpenRelated } = props
  return (
    <div className="mb-6">
      <div className="text-white/80 font-medium mb-2 flex items-center gap-1.5">
        <Icon name="sparkles" size={13} className="text-brand" />
        {t('detail.relatedRecommendHeading')}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {related.map((r) => {
          const rs = resolveEntryPoster(r.video) ? posterUrl(resolveEntryPoster(r.video)!) : null
          return (
            <button
              key={r.code}
              className="group flex flex-col rounded-lg overflow-hidden bg-ink-800 ring-1 ring-white/5 hover:ring-brand/50 transition-colors text-left"
              onClick={() => onOpenRelated?.(r)}
              title={r.title}
            >
              {/* 封面 */}
              <div className="relative aspect-[2/3] overflow-hidden">
                {rs ? (
                  <img src={rs} alt={r.title} className="h-full w-full object-cover poster-img group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-white/70" style={{ background: placeholderGradient(r.code) }}>
                    {titleInitial(r.code)}
                  </div>
                )}
                {/* 时长角标 */}
                {r.video?.durationSec ?? r.video?.techInfo?.durationSec ? (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-[2px] !text-white text-[10px] font-semibold tabular-nums [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
                    {formatDuration((r.video?.durationSec ?? r.video?.techInfo?.durationSec)!)}
                  </span>
                ) : null}
                {/* hover 时显示影片标签 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 flex flex-col justify-end">
                  {(() => {
                    const relTags = primaryTags({ tags: r.tags, tagCategories: r.tagCategories })
                    if (!relTags.length) return null
                    return (
                      <div className="flex flex-wrap gap-1">
                        {relTags.slice(0, 6).map((tag) => (
                          <span key={tag} className="px-2 py-1 rounded bg-brand/25 text-brand text-[12px] font-medium">{tag}</span>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
              {/* 基本信息：标题 + 年份 + 评分 */}
              <div className="px-1.5 py-1.5 flex flex-col gap-0.5">
                <div className="text-[12px] text-white/90 font-medium truncate leading-tight">{r.title || r.code}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                  {r.video?.year ? <span className="tabular-nums">{r.video.year}</span> : null}
                  {r.video?.rating ? (
                    <span className="flex items-center gap-0.5 text-amber-400/90">
                      <Icon name="star" size={9} className="fill-amber-400/90" />
                      <span className="tabular-nums">{Number(r.video.rating).toFixed(1)}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ================= 放大浮层（lightbox） ================= */

export function ZoomOverlay(props: {
  zoomUrl: string
  overlayRef: React.RefObject<HTMLDivElement>
  zoomGroup: React.MutableRefObject<string[]>
  zoomIndex: React.MutableRefObject<number>
  scheduleClose: () => void
  cancelClose: () => void
  disableHover: () => void
  setZoomUrl: (u: string | null) => void
}) {
  const { zoomUrl, overlayRef, zoomGroup, zoomIndex, scheduleClose, cancelClose, disableHover, setZoomUrl } = props
  return (
    <div
      ref={overlayRef}
      data-zoom-overlay
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 cursor-zoom-out select-none"
      onMouseMove={(e) => {
        // 实时检测光标是否在图片内：不在（图片外灰色区域）就 scheduleClose，在图片内就 cancelClose（保持大图）
        const img = overlayRef.current?.querySelector('img')
        if (!img) return
        const r = img.getBoundingClientRect()
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
        if (outside) scheduleClose()
        else cancelClose()
      }}
      onMouseLeave={scheduleClose}
      onClick={(e) => {
        e.stopPropagation()
        disableHover() // 左键关闭也短暂禁用, 防止马上又开
        setZoomUrl(null)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        disableHover() // 右键关闭后 2s 内禁用 hover 自动打开
        setZoomUrl(null)
      }}
    >
      <img
        src={zoomUrl}
        alt="sample-zoom"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          disableHover()
          setZoomUrl(null)
        }}
        className="max-w-[94vw] max-h-[94vh] object-contain rounded-lg shadow-2xl"
      />
      {/* 右下角小提示: 当前位置 + 滚轮/右键 */}
      {zoomGroup.current.length > 1 ? (
        <div className="absolute bottom-3 right-4 text-[11px] text-white/50 bg-black/50 rounded-md px-2 py-1 pointer-events-none">
          {zoomIndex.current + 1} / {zoomGroup.current.length} · {t('detail.wheelToggleClose')}
        </div>
      ) : null}
    </div>
  )
}
