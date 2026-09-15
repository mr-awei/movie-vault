import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DisplayEntry, MovieMeta, Playlist, Video } from '../../../shared/types'
import { hasDocTags, primaryTags, NON_TAG_CATEGORY_NAMES, splitHierarchicalTag } from '../../../shared/types'
import { posterUrl, placeholderGradient, titleInitial, formatSize, formatDuration, resolveEntryPoster, pureTitle, stringToMutedColor } from '../lib/util'
import { useFrameFallback } from '../lib/frameFallback'
import { api } from '../lib/api'
import Icon from './Icon'
import { toast } from './Toast'
import { t } from '../../../shared/i18n'

interface Props {
  video: Video
  onClose: () => void
  onPlay: (v: Video) => void
  /** 抓取成功回调（用于回写 App 展示数据，下次直接命中本地缓存） */
  onDetailFetched?: (videoId: string, detail: MovieMeta) => void
  /** 截帧/封面更新回调（用于回写 App 列表态，立即刷新封面）。
   *  previewPaths 为空表示不修改原有预览帧；posterSource 默认 'ffmpeg' */
  onPosterFetched?: (videoId: string, posterPath: string, previewPaths?: string[], posterSource?: string) => void
  /** ffprobe 技术参数读取成功回调（回写持久化） */
  onTechInfoFetched?: (videoId: string, tech: Video['techInfo']) => void
  /** 点击演员/制片公司/系列/分类 → 请求按该维度筛选并回到首页 */
  onPickFilter?: (f: { type: 'actor' | 'studio' | 'series' | 'category'; value: string }) => void
  /** 点击标签 → 请求按该标签筛选全部影片 */
  onPickTag?: (tag: string) => void
  /** 收藏 / 锁定切换（持久化到视频记录） */
  onToggleFlag?: (id: string, key: 'favorite' | 'locked') => void
  /** 相关推荐条目（同制片公司/系列/主演） */
  related?: DisplayEntry[]
  /** 点击相关推荐 → 打开该条目详情 */
  onOpenRelated?: (entry: DisplayEntry) => void
  /** {t('detail.edit')}影片信息 */
  onEdit?: (v: Video) => void
  /** 从磁盘删除视频文件（弹二次确认、按需连带删同目录种子文件夹） */
  onDelete?: (v: Video) => void
  /** v2.9.0 播放列表 */
  playlists?: Playlist[]
  onAddToPlaylist?: (playlistId: string, videoId: string) => void
}

/** 渲染元数据一行（key: value）—— label 左对齐，列宽由最宽 label 自动撑开 */
function MetaRow({
  label,
  value,
  children
}: {
  label: string
  value?: string
  children?: ReactNode
}) {
  if (!value && !children) return null
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 text-sm items-start">
      <span className="text-white/40 whitespace-nowrap pt-0.5">{label}</span>
      <span className="text-white/90 break-all min-w-0">{children ?? value}</span>
    </div>
  )
}

/** 把 ffprobe 技术参数拼成一行可读文本（分辨率 · 编码 · 码率 · 帧率） */
function formatTech(tech?: Video['techInfo']): string | undefined {
  if (!tech) return undefined
  const p: string[] = []
  if (tech.width && tech.height) p.push(`${tech.width}×${tech.height}`)
  if (tech.videoCodec) p.push(tech.videoCodec.toUpperCase())
  if (tech.bitrateKbps) p.push(`${(tech.bitrateKbps / 1000).toFixed(1)} Mbps`)
  if (tech.fps) p.push(`${tech.fps} fps`)
  if (tech.audioCodec) p.push(t('detail.audioCodecLabel', { codec: tech.audioCodec.toUpperCase() }))
  return p.length ? p.join(' · ') : undefined
}

export default function VideoDetail({ video, onClose, onPlay, onDetailFetched, onPosterFetched, onTechInfoFetched, onPickFilter, onPickTag, onToggleFlag, related, onOpenRelated, onEdit, onDelete, playlists, onAddToPlaylist }: Props) {
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false)
  const [detail, setDetail] = useState<Video['meta']>(video.meta)
  /** 本地 video 副本：截帧/封面更新后立即反映，不必等父组件重新拉取 */
  const [localVideo, setLocalVideo] = useState<Video>(video)
  /** 封面加载失败（路径失效）时标记，触发截帧兜底 */
  const [coverImgError, setCoverImgError] = useState(false)
  const [failedPreviews, setFailedPreviews] = useState<Set<number>>(new Set())
  /** 封面缓存失效版本号：手动设封面/重新截帧后 +1，让封面 img 的 lm:// URL 带 ?v= 强制立即刷新；
   *  初始值取自 App 的 coverVersion，重开详情页时与列表端版本一致，避免退回旧缓存 */
  const [posterVersion, setPosterVersion] = useState(video.coverVersion ?? 0)
  /** 预览帧缓存失效版本号：重新截帧后文件路径不变但内容已覆盖，+1 强制刷新 */
  const [previewVersion, setPreviewVersion] = useState(0)
  /** 带缓存失效版本号的预览图 URL 列表 */
  const previewUrls = useMemo(
    () => localVideo.previewPaths?.map((url) => posterUrl(url, previewVersion) ?? '') ?? [],
    [localVideo.previewPaths, previewVersion]
  )
  /** 无预览图自动截帧：本次详情页打开中是否已执行过（防止完成/失败后循环重触发） */
  const autoFramedRef = useRef(false)
  useEffect(() => {
    setLocalVideo(video)
    setDetail(video.meta)
    setCoverImgError(false)
    setPosterVersion(video.coverVersion ?? 0)
    setPreviewVersion(0)
    autoFramedRef.current = false
  }, [video.id])
  useEffect(() => {
    return api.onPreviewTaskEvent((event) => {
      if (event.type !== 'completed' || event.mediaId !== localVideo.id) return
      setLocalVideo((prev) => ({
        ...prev,
        posterPath: event.posterPath ?? prev.posterPath,
        posterSource: event.posterPath ? 'ffmpeg' : prev.posterSource,
        previewPaths: event.previewPaths ?? prev.previewPaths,
        previewStatus: 'COMPLETED',
        previewGeneratedCount: event.previewPaths?.length ?? prev.previewGeneratedCount
      }))
      setPosterVersion((v) => v + 1)
      setPreviewVersion((v) => v + 1)
      if (event.posterPath) onPosterFetched?.(localVideo.id, event.posterPath, event.previewPaths, 'ffmpeg')
    })
  }, [localVideo.id, onPosterFetched])
  /** 手动「补齐信息」进行中（与截帧互不干扰，各自独立 loading） */
  const [fetching, setFetching] = useState(false)
  /** 与 fetching 状态同步的 ref 锁，useEffect 自动补齐和按钮手动补齐互斥 */
  const fetchingRef = useRef(false)
  /** 手动「重新截帧」进行中 */
  const [framing, setFraming] = useState(false)
  /** 手动补齐：无视缓存强制重抓当前作品（多源数据源）。
   * 无论数据是否与旧缓存一致，只要拿到新数据就弹窗提示已更新 + 来源；失败弹窗说明原因。 */
  const forceFetch = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setFetching(true)
    setError(null)
    try {
      const res = await api.videoFetchDetail(video.id)
      if (res?.ok && res.detail) {
        setDetail(res.detail)
        onDetailFetched?.(video.id, res.detail)
        const src = res.source === 'openlibrary' ? 'OpenLibrary' : res.source === 'justwatch' ? 'JustWatch' : res.source === 'omdb' ? 'OMDb' : res.source === 'wikipedia' ? '维基百科' : 'MovieDB'
        toast({ text: t('detail.infoUpdated', { source: src }), tone: 'ok' })
      } else {
        const reason = res && !res.ok ? res.error : t('app.unknownReason')
        toast({ text: t('detail.refetchFailReason', { reason: reason ?? t('app.unknownReason') }), tone: 'err' })
      }
    } catch (e) {
      toast({ text: t('detail.refetchFailError', { error: (e as Error)?.message ?? String(e) }), tone: 'err' })
    } finally {
      fetchingRef.current = false
      setFetching(false)
    }
  }, [localVideo.id, onDetailFetched, onPosterFetched])
  /** 详情页「按网址更新」：粘贴任一数据源网页 URL 直连抓取 */
  const [urlInput, setUrlInput] = useState('')
  const fetchByUrl = useCallback(async () => {
    const url = urlInput.trim()
    if (!url) return
    if (fetchingRef.current) return
    fetchingRef.current = true
    setFetching(true)
    setError(null)
    try {
      const res = await api.videoFetchByUrl(localVideo.id, url)
      if (res?.ok && res.detail) {
        setDetail(res.detail)
        onDetailFetched?.(localVideo.id, res.detail)
        const src = res.source === 'openlibrary' ? 'OpenLibrary' : res.source === 'justwatch' ? 'JustWatch' : res.source === 'omdb' ? 'OMDb' : res.source === 'wikipedia' ? '维基百科' : 'MovieDB'
        setUrlInput('')
        toast({ text: t('detail.infoUpdated', { source: src }), tone: 'ok' })
      } else {
        const reason = res && !res.ok ? res.error : t('app.unknownReason')
        toast({ text: t('detail.refetchFailReason', { reason: reason ?? t('app.unknownReason') }), tone: 'err' })
      }
    } catch (e) {
      toast({ text: t('detail.refetchFailError', { error: (e as Error)?.message ?? String(e) }), tone: 'err' })
    } finally {
      fetchingRef.current = false
      setFetching(false)
    }
  }, [localVideo.id, onDetailFetched, urlInput, onPosterFetched])
  /** ffmpeg 重新截帧：同步生成封面 + 预览帧，立即返回并更新展示 */
  const handleGenerateFrames = useCallback(async () => {
    if (framing) return
    setFraming(true)
    setError(null)
    try {
      const updated = await api.videoGeneratePreviews(localVideo.id)
      if (updated) {
        // 同步生成完整预览集，所有字段立即更新
        setLocalVideo((prev) => ({
          ...prev,
          posterPath: updated.posterPath ?? prev.posterPath,
          posterSource: updated.posterSource ?? prev.posterSource,
          posterPathFfmpeg: updated.posterPathFfmpeg ?? prev.posterPathFfmpeg,
          previewPaths: updated.previewPaths ?? prev.previewPaths,
          previewStatus: updated.previewStatus ?? prev.previewStatus,
          previewRequestedCount: updated.previewRequestedCount ?? prev.previewRequestedCount
        }))
        // v2.8.5 修复：只要截帧成功就递增版本号，强制刷新 img 缓存
        // （之前放在 if (updated.posterPath) 内，极端情况下 posterPath 为空会导致预览图不刷新）
        setPosterVersion((v) => v + 1)
        setPreviewVersion((v) => v + 1)
        if (updated.posterPath) {
          onPosterFetched?.(localVideo.id, updated.posterPath, updated.previewPaths ?? localVideo.previewPaths, updated.posterSource ?? 'ffmpeg')
        }
        toast({ text: t('detail.reframeDone'), tone: 'ok' })
      } else {
        toast({ text: t('detail.reframeFailNoFfmpeg'), tone: 'err' })
      }
    } catch (e) {
      toast({ text: t('detail.reframeFailError', { error: (e as Error)?.message ?? String(e) }), tone: 'err' })
    } finally {
      setFraming(false)
    }
  }, [localVideo.id, onPosterFetched, framing])
  /** 截帧预览帧 → {t('detail.setAsCover')}：复制为 <id>.jpg 并更新本地副本 + 通知父组件 */
  const handleSetPreviewAsCover = useCallback(
    async (previewPath: string) => {
      try {
        const updated = await api.videoSetPreviewAsCover(localVideo.id, previewPath)
        if (updated?.posterPath) {
          setLocalVideo((prev) => ({ ...prev, posterPath: updated.posterPath!, posterSource: updated.posterSource ?? 'manual' }))
          setPosterVersion((v) => v + 1)
          // 透传 previewPaths：避免父组件把已有截帧预览清空；posterSource 也透传（manual），不再硬编码 ffmpeg
          onPosterFetched?.(localVideo.id, updated.posterPath, localVideo.previewPaths, updated.posterSource ?? 'manual')
          toast({ text: t('detail.setCoverDone'), tone: 'ok' })
        } else {
          toast({ text: t('detail.setCoverFailInvalid'), tone: 'err' })
        }
      } catch (e) {
        toast({ text: t('detail.setCoverFailError', { error: (e as Error)?.message ?? String(e) }), tone: 'err' })
      }
    },
    [localVideo.id, onPosterFetched]
  )
  /** ffprobe 技术参数：本地持有，避免依赖父组件回写延迟；首次打开无则自动探测 */
  const [tech, setTech] = useState<Video['techInfo']>(video.techInfo)
  // 若无技术参数，自动用 ffprobe 读取（一次），成功则本地展示 + 回写父组件持久化
  useEffect(() => {
    if (tech) return
    let alive = true
    api
      .videoProbe(video.id)
      .then((updated) => {
        if (!alive) return
        const t = updated?.techInfo
        if (t) {
          setTech(t)
          onTechInfoFetched?.(video.id, t)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // 仅在视频切换时尝试探测，tech 变化不再触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** hover 样本图时显示原尺寸大图 */
  const [zoomUrl, setZoomUrl] = useState<string | null>(null)
  /** 备用来源标签（backupTags）默认折叠为一行；点开才展开全部 */
  const [showBackupTags, setShowBackupTags] = useState(false)
  /** ESC：放大图打开时先关放大图，否则关闭详情页（非组合键，用户要求保留） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (zoomUrl) setZoomUrl(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomUrl, onClose])
  const closeTimer = useRef<number | null>(null)
  const openTimer = useRef<number | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  /** 当前 zoom 浮层显示的图片属于哪一组, 用于滚轮切换 */
  const zoomGroup = useRef<string[]>([])   // 当前轮播的图片 URL 组
  const zoomIndex = useRef(0)
  // v2.8.5 修复：wheel 事件必须用 { passive: false } 绑定才能 preventDefault，
  // React 的 onWheel 默认是 passive，会报 Unable to preventDefault inside passive event listener
  useEffect(() => {
    const el = overlayRef.current
    if (!el || !zoomUrl) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const grp = zoomGroup.current
      if (!grp.length) return
      let next = zoomIndex.current + (e.deltaY > 0 ? 1 : -1)
      if (next < 0) next = grp.length - 1
      if (next >= grp.length) next = 0
      zoomIndex.current = next
      cancelClose()
      setZoomUrl(grp[next])
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomUrl])
  /** 右键关闭后短暂禁用 hover 自动打开 (防止鼠标还停在缩略图上 scheduleOpen 又开出来) */
  const hoverDisabledUntil = useRef(0)
  const disableHover = () => {
    hoverDisabledUntil.current = performance.now() + 2000
  }
  const isHoverDisabled = () => performance.now() < hoverDisabledUntil.current
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setZoomUrl(null), 180)
  }
  /** 记录当前 hover/click 打开的图片属于哪一组, 用于滚轮切换 */
  const setZoomGroup = (group: string[], currentUrl: string) => {
    zoomGroup.current = group
    zoomIndex.current = Math.max(0, group.findIndex(u => u === currentUrl))
  }
  /** 延迟打开：hover 停留 1s 稳定后才开，避免划过误触；右键关闭后 2s 内禁用 */
  const scheduleOpen = (url: string) => {
    if (isHoverDisabled()) return
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      if (isHoverDisabled()) return
      setZoomUrl(url)
    }, 1000)
  }
  const clearOpenTimer = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }
  /** 卸载时清掉两个 timer */
  useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  // 判断缓存的 meta 是否"陈旧"（封面仍是远程 URL，说明是修复前缓存的）—— 这种情况重新抓一次升级成本地路径
  const isStale = (d: Video['meta']): boolean => {
    if (!d) return true
    if (d.cover && /^https?:\/\//.test(d.cover)) return true
    return false
  }

  // 打开即展示；缓存命中且不陈旧 → 零请求；否则（首次或陈旧）抓一次保存本地，之后直接命中缓存不再请求
  useEffect(() => {
    if (!isStale(video.meta)) {
      setDetail(video.meta)
      setLoading(false)
      setError(null)
      return
    }
    // 自动补齐与手动「补齐信息」共享 ref 锁，避免两者同时触发造成重复请求
    if (!fetchingRef.current) {
      void forceFetch()
    }
  }, [video.id])

  const d = detail
  // 年份（优先 video.year，缺失时回退到数据源 release date 的年份）
  const yearText = (() => {
    const y = video.year ?? (d?.date ? Number(String(d.date).slice(0, 4)) : undefined)
    return y && !Number.isNaN(y) ? String(y) : undefined
  })()
  // 只用本地路径：远程 URL 经 posterUrl 透传会让 Chromium 直连数据源 CDN 触发反盗链
  const isLocal = (u?: string) => !!u && !/^https?:\/\//.test(u)
  // 手动{t('detail.setAsCover')}（posterSource='manual'，预览帧{t('detail.setAsCover')}）优先级最高，立即生效且持久；
  // 否则用详情真实封面（d.cover），再退回 posterPath
  const originalCover =
    (localVideo.posterSource === 'manual' && localVideo.posterPath
      ? localVideo.posterPath
      : d?.cover && isLocal(d.cover)
        ? d.cover
        : localVideo.posterPath) || null

  // 进入「无预览图」的详情页时自动截帧：与手动「重新截帧」完全一致（1 封面 + 预览帧，走同一 IPC）。
  // 元数据自动补齐进行中先等待；补齐结束仍无任何预览帧时自动执行一次，成功后预览帧持久化，
  // 下次打开直接命中不再重复。
  useEffect(() => {
    if (autoFramedRef.current) return
    if (fetchingRef.current || framing) return
    if ((localVideo.previewPaths?.length ?? 0) > 0) return
    autoFramedRef.current = true
    void handleGenerateFrames()
  }, [video.id, localVideo.previewPaths, fetching, framing, handleGenerateFrames])

  // 自动截帧计划中：预览帧为空且元数据补齐已结束。此期间屏蔽单帧兜底，
  // 避免单帧兜底与完整截帧两个 ffmpeg 进程同时截同一文件
  const autoFramePlanned =
    !autoFramedRef.current &&
    (localVideo.previewPaths?.length ?? 0) === 0 &&
    !fetching &&
    !framing
  // 无封面/封面加载失败 → ffmpeg 截帧兜底（懒加载；自动截帧规划中/进行中时暂不触发单帧兜底）
  const { fallbackPoster, isFrameFallback } = useFrameFallback(
    localVideo,
    originalCover && !coverImgError
      ? originalCover
      : autoFramePlanned || (autoFramedRef.current && framing)
        ? '__auto_frame_planned__'
        : null
  )
  const coverSrc = (originalCover && !coverImgError ? originalCover : null) ?? fallbackPoster

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-auto thin-scroll animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-auto thin-scroll bg-ink-850 rounded-2xl ring-1 ring-white/10 shadow-2xl shadow-black/50 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5" onClick={(e) => e.stopPropagation()}>
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
                  onClick={() => {
                    const next = !localVideo.locked
                    setLocalVideo((prev) => ({ ...prev, locked: next, lockedAt: next ? Date.now() : undefined }))
                    onToggleFlag?.(video.id, 'locked')
                  }}
                  title={localVideo.locked ? t('lock.unlockTitle') : t('lock.lockTitle')}
                >
                  <Icon name={localVideo.locked ? 'lock' : 'unlock'} size={14} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* 封面 + 元数据 —— 左栏封面(固定2:3)+文件信息, 右栏标题/按钮/影片信息/标签,
            剧情简介横跨左右两栏放在最下方, 阅读宽度最舒适. */}
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

        <div className="grid grid-cols-[300px_1fr] gap-6 mb-6 items-start">
          {/* 左栏：封面 + 剧情简介，填充左栏空白 */}
          <div className="flex flex-col gap-4">
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
                    alt={video.title}
                    className="relative h-full w-full object-contain poster-img"
                    onError={() => setCoverImgError(true)}
                  />
                </div>
              ) : (
                <div
                  className="h-full w-full flex items-center justify-center text-5xl font-bold text-white/80"
                  style={{ background: placeholderGradient(video.title) }}
                >
                  {titleInitial(video.title)}
                </div>
              )}
            </div>

            {/* 文件信息：文件名、添加时间、完整路径、日期、时长、大小、参数放到封面下方 */}
            <div className="space-y-1 bg-ink-800/40 rounded-xl p-3.5 ring-1 ring-white/8">
              <div className="text-xs font-medium text-white/60 mb-1.5 flex items-center gap-1.5">
                <Icon name="info" size={11} className="text-white/40" />
                {t('detail.fileInfo')}
              </div>
              <MetaRow label={t('detail.fileName')} value={video.fileName} />
              {video.addedAt ? (
                <MetaRow label={t('detail.addedAt')} value={new Date(video.addedAt).toLocaleString('zh-CN')} />
              ) : null}
              {video.path ? <MetaRow label={t('detail.fullPath')} value={video.path} /> : null}
              <MetaRow label={t('detail.date')} value={d?.date} />
              <MetaRow label={t('detail.duration')} value={d?.duration} />
              <MetaRow label={t('detail.fileSize')} value={video.fileSize ? formatSize(video.fileSize) : undefined} />
              <MetaRow label={t('detail.techInfo')} value={formatTech(tech)} />
            </div>
          </div>
          <div className="min-w-0 flex flex-col">
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
            {isFrameFallback && !(d?.cover && isLocal(d.cover)) ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium mb-2 bg-fuchsia-500/15 text-fuchsia-400 ring-1 ring-fuchsia-500/30">
                <Icon name="film" size={11} className="fill-current" />
                {t('detail.isFfmpegCoverLabel')}
              </span>
            ) : null}

            <div className="flex items-center gap-2.5 mb-1 flex-wrap">
              <div className="text-2xl font-semibold text-white break-all">
                {pureTitle(video.title, video.fileName)}
              </div>

            </div>
            {d?.title && d.title !== pureTitle(video.title, video.fileName) ? (
              <div className="text-white/50 text-sm mb-2 break-all">{d.title}</div>
            ) : (
              <div className="mb-2" />
            )}

            {/* 我的推荐评分（md 权威，替换 数据源 评分） */}
            {video.rating != null ? (
              <div className="flex items-center gap-2.5 mb-3">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand/15 ring-1 ring-brand/30">
                  <Icon name="star" size={16} className="text-brand fill-brand" />
                  <span className="text-brand font-bold text-xl leading-none tabular-nums">
                    {video.rating.toFixed(2)}
                  </span>
                </span>
                <span className="text-white/40 text-xs">{t('detail.myRecommendedScore')}</span>
              </div>
            ) : null}

            {/* 主 CTA 行：参考大厂设计，{t('detail.play')}按钮放在内容区（更突出、离标题/元信息更近），
                顶栏只保留次要操作（补齐/收藏）。同时把"{t('detail.edit')}/{t('detail.openLocation')}/{t('detail.deleteFile')}"等
                也放这里作为二级按钮组，避免再{t('detail.back')}顶栏。 */}
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
                    onClick={() => setPlaylistMenuOpen((v) => !v)}
                  >
                    <Icon name="list" size={14} />
                    添加到列表
                  </button>
                  {playlistMenuOpen ? (
                    <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-xl bg-ink-800 ring-1 ring-white/10 shadow-xl py-1.5 text-sm">
                      {playlists.slice(0, 10).map((pl) => (
                        <button
                          key={pl.id}
                          className="w-full text-left px-3 py-2 hover:bg-ink-700 transition-colors flex items-center gap-2"
                          onClick={() => {
                            onAddToPlaylist(pl.id, video.id)
                            setPlaylistMenuOpen(false)
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

            {/* 影片信息：导演/主演/类型/年份等元数据（日期、时长、大小、参数已放到封面下方） */}
            <div className="space-y-1.5 mb-4">
              <MetaRow label={t('detail.director')} value={d?.director} />
              <MetaRow label={t('detail.studio')}>
                {d?.studio ? (
                  <button
                    type="button"
                    onClick={() => onPickFilter?.({ type: 'studio', value: d.studio! })}
                    className="text-brand hover:underline underline-offset-2"
                  >
                    {d.studio}
                  </button>
                ) : undefined}
              </MetaRow>
              <MetaRow label={t('detail.series')}>
                {(localVideo.series || d?.series) ? (
                  <button
                    type="button"
                    onClick={() => onPickFilter?.({ type: 'series', value: (localVideo.series || d?.series)! })}
                    className="text-brand hover:underline underline-offset-2"
                  >
                    {localVideo.series || d?.series}
                  </button>
                ) : undefined}
              </MetaRow>
              {/* Excel 片单「分类」列的单值（如"剧情"、"科幻"），独立于 tagCategories */}
              {localVideo.introCategory ? (
                <MetaRow label={t('detail.category')}>
                  <button
                    type="button"
                    onClick={() => onPickFilter?.({ type: 'category', value: localVideo.introCategory! })}
                    className="text-brand hover:underline underline-offset-2"
                  >
                    {localVideo.introCategory}
                  </button>
                </MetaRow>
              ) : null}
              {/* v2.8.5：Excel 片单「地区」列，权威源 */}
              {localVideo.region ? (
                <MetaRow label={t('detail.region')} value={localVideo.region} />
              ) : null}
              {/* 数据源 评分仅在没有我的评分时兜底显示 */}
              <MetaRow label={t('detail.score')} value={video.rating != null ? undefined : d?.rating} />
              <MetaRow label={t('detail.genre')} value={d?.genres?.length ? d.genres.join(' / ') : undefined} />
              <MetaRow label={t('detail.year')} value={yearText} />
            </div>

            {/* v2.2.13 文档标签分层：
                有结构化 tagCategories → 按分类分组展示主标签；
                无结构化但有文档平铺 tags → 退化一组展示；
                无文档标签 + 有 backupTags → 直接把数据源 tags 作主标签展示（不在「备用」里折叠）。
                按钮样式：文档主标签用 brand 色系；备用t('detail.sourceTag')（展开后）用 info 色系区分来源。 */}
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
                  const normalizeCat = (n: string) =>
                    n.trim().replace(/[:：/\\]+$/, '').trim()
                  // 去重 + 过滤空 tag 字符串 + 过滤非标签分类 + key 加索引后缀
                  const seen = new Set<string>()
                  const dedup: [string, string[]][] = []
                  for (const [name, rawList] of Object.entries(cats)) {
                    const norm = normalizeCat(name)
                    if (!norm) continue
                    if (NON_TAG_CATEGORY_NAMES.has(norm)) continue
                    const list = Array.from(new Set((rawList ?? []).map(t => t?.trim() ?? '').filter(Boolean).flatMap(t => splitHierarchicalTag(t))))
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

              // 备用t('detail.sourceTag')节点：
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

            {loading ? (
              <div className="mt-4 text-white/40 text-xs">{t('detail.fetchingDetail')}</div>
            ) : null}
            {error ? <div className="mt-4 text-amber-400 text-xs">{error}</div> : null}

            {/* 演员阵容：有 TMDb 头像时展示照片，缺头像时用素色名字块兜底 */}
            {(() => {
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
                              <img
                                src={photoUrl}
                                alt={actor.name}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
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
                          {actor.character ? (
                            <div className="text-[10px] text-white/45 truncate leading-tight">{actor.character}</div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

          </div>
        </div>

        {/* 剧情简介：横跨左右两栏 */}
        {detail?.synopsis || video.description ? (
          <div className="mb-6 bg-ink-800/40 rounded-xl p-4 ring-1 ring-white/8">
            <div className="text-xs font-medium text-white/60 mb-2">{t('detail.synopsis')}</div>
            <div className="text-[13px] leading-[1.85] text-white/85 whitespace-pre-wrap max-h-[260px] overflow-y-auto thin-scroll">
              {detail?.synopsis || video.description}
            </div>
          </div>
        ) : null}

        {/* ffmpeg 截帧预览帧（封面外的多张预览，本地 previewPaths） */}
        {localVideo.previewPaths && localVideo.previewPaths.length > 0 ? (
          <div className="mb-6">
            <div className="text-white/80 font-medium mb-2 flex items-center gap-1.5 flex-wrap">
              <Icon name="film" size={13} className="text-white/40" />
              {t('detail.previewFramesHeader', { count: localVideo.previewPaths.length })}
              {localVideo.previewPaths.length > 1 ? (
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
                  onMouseEnter={() => {
                    setZoomGroup(previewUrls, displayUrl)
                    cancelClose(); scheduleOpen(displayUrl)
                  }}
                  onMouseLeave={clearOpenTimer}
                  onClick={() => {
                    setZoomGroup(previewUrls, displayUrl)
                    setZoomUrl(displayUrl)
                  }}
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
                  {/* {t('detail.setAsCover')}：hover 显示，点击把这帧复制为封面 */}
                  <button
                    type="button"
                    className="absolute bottom-1.5 right-1.5 opacity-0 group-hover/preview:opacity-100 transition-opacity px-2 py-1 rounded-md bg-white/95 text-slate-900 hover:bg-brand hover:text-white text-[11px] font-medium flex items-center gap-1 no-drag shadow-md shadow-black/25"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleSetPreviewAsCover(localVideo.previewPaths![i])
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
        ) : null}

        {/* {t('detail.relatedRecommendHeading')} */}
        {related && related.length > 0 ? (
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
                        <div
                          className="h-full w-full flex items-center justify-center text-2xl font-bold text-white/70"
                          style={{ background: placeholderGradient(r.code) }}
                        >
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
                                <span key={tag} className="px-1.5 py-0.5 rounded bg-brand/25 text-brand text-[10px] font-medium">{tag}</span>
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
        ) : null}

      </div>
      </div>

      {/* hover 样本图时显示原尺寸大图（lightbox） */}
      {zoomUrl ? (
        <div
          ref={overlayRef}
          data-zoom-overlay
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 cursor-zoom-out select-none"
          onMouseMove={(e) => {
            // 实时检测光标是否在图片内：不在（图片外灰色区域）就 scheduleClose
            // 在图片内就 cancelClose（保持大图）
            const img = overlayRef.current?.querySelector('img')
            if (!img) return
            const r = img.getBoundingClientRect()
            const outside =
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            if (outside) scheduleClose()
            else cancelClose()
          }}
          onMouseLeave={scheduleClose}
          onClick={(e) => {
            e.stopPropagation()
            disableHover()            // 左键关闭也短暂禁用, 防止马上又开
            setZoomUrl(null)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            disableHover()            // 右键关闭后 2s 内禁用 hover 自动打开
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
      ) : null}
    </div>
  )
}
