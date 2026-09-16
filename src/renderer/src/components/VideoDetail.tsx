import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MovieMeta, Video } from '../../../shared/types'
import { posterUrl } from '../lib/util'
import { api } from '../lib/api'
import { toast } from './Toast'
import { t } from '../../../shared/i18n'
import SceneMarkers from './SceneMarkers'
import {
  DetailHeader,
  DetailCover,
  FileInfoPanel,
  DetailActions,
  DetailMetaHead,
  DetailMetaBody,
  CastGrid,
  PreviewFrames,
  RelatedGrid,
  ZoomOverlay
} from './VideoDetailParts'
import type { DisplayEntry, Playlist } from '../../../shared/types'

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
  /** 编辑影片信息 */
  onEdit?: (v: Video) => void
  /** 从磁盘删除视频文件（弹二次确认、按需连带删同目录种子文件夹） */
  onDelete?: (v: Video) => void
  /** v2.9.0 播放列表 */
  playlists?: Playlist[]
  onAddToPlaylist?: (playlistId: string, videoId: string) => void
}

export default function VideoDetail({ video, onClose, onPlay, onDetailFetched, onPosterFetched, onTechInfoFetched, onPickFilter, onPickTag, onToggleFlag, related, onOpenRelated, onEdit, onDelete, playlists, onAddToPlaylist }: Props) {
  const [detail, setDetail] = useState<Video['meta']>(video.meta)
  /** 本地 video 副本：截帧/封面更新后立即反映，不必等父组件重新拉取 */
  const [localVideo, setLocalVideo] = useState<Video>(video)
  /** 封面加载失败（路径失效）时标记，触发截帧兜底 */
  const [coverImgError, setCoverImgError] = useState(false)
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
  /** 截帧预览帧 → 设为封面：复制为 <id>.jpg 并更新本地副本 + 通知父组件 */
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
        const t0 = updated?.techInfo
        if (t0) {
          setTech(t0)
          onTechInfoFetched?.(video.id, t0)
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
  /** ESC：放大图打开时先关放大图，否则关闭详情页（非组合键，用户要求保留）。
   *  P1-13：输入框/文本域聚焦时按 ESC 不关详情页，避免误关。 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const ae = document.activeElement
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || (ae as HTMLElement).isContentEditable)) return
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
  const zoomGroup = useRef<string[]>([]) // 当前轮播的图片 URL 组
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
    zoomIndex.current = Math.max(0, group.findIndex((u) => u === currentUrl))
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
  const isStale = (d0: Video['meta']): boolean => {
    if (!d0) return true
    if (d0.cover && /^https?:\/\//.test(d0.cover)) return true
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
  // 手动设封面（posterSource='manual'，预览帧设封面）优先级最高，立即生效且持久；
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

  const coverSrc = originalCover && !coverImgError ? originalCover : null
  const toggleLockLocal = () => {
    const next = !localVideo.locked
    setLocalVideo((prev) => ({ ...prev, locked: next, lockedAt: next ? Date.now() : undefined }))
    onToggleFlag?.(video.id, 'locked')
  }

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
          <DetailHeader
            video={video}
            localVideo={localVideo}
            fetching={fetching}
            framing={framing}
            urlInput={urlInput}
            setUrlInput={setUrlInput}
            fetchByUrl={fetchByUrl}
            forceFetch={forceFetch}
            handleGenerateFrames={handleGenerateFrames}
            onToggleFlag={onToggleFlag}
            onToggleLockLocal={toggleLockLocal}
            onClose={onClose}
          />

          <div className="grid grid-cols-[300px_1fr] gap-6 mb-6 items-start">
            {/* 左栏：封面 + 文件信息，填充左栏空白 */}
            <div className="flex flex-col gap-4">
              <DetailCover coverSrc={coverSrc} posterVersion={posterVersion} title={video.title} onError={() => setCoverImgError(true)} />
              <FileInfoPanel video={video} d={d} tech={tech} />
            </div>
            {/* 右栏：标题/按钮/影片信息/标签（剧情简介横跨左右两栏放在最下方） */}
            <div className="min-w-0 flex flex-col">
              <DetailMetaHead d={d} localVideo={localVideo} video={video} />
              <DetailActions
                video={video}
                onPlay={onPlay}
                onEdit={onEdit}
                onDelete={onDelete}
                playlists={playlists ?? []}
                onAddToPlaylist={onAddToPlaylist}
              />
              <DetailMetaBody d={d} localVideo={localVideo} video={video} yearText={yearText} loading={loading} error={error} onPickFilter={onPickFilter} onPickTag={onPickTag} />
              <CastGrid d={d} onPickFilter={onPickFilter} />
              <SceneMarkers video={video} />
            </div>
          </div>

          {/* 剧情简介：横跨左右两栏 */}
          {d?.synopsis || video.description ? (
            <div className="mb-6 bg-ink-800/40 rounded-xl p-4 ring-1 ring-white/8">
              <div className="text-xs font-medium text-white/60 mb-2">{t('detail.synopsis')}</div>
              <div className="text-[13px] leading-[1.85] text-white/85 whitespace-pre-wrap max-h-[260px] overflow-y-auto thin-scroll">
                {d?.synopsis || video.description}
              </div>
            </div>
          ) : null}

          {/* ffmpeg 截帧预览帧（封面外的多张预览，本地 previewPaths） */}
          {localVideo.previewPaths && localVideo.previewPaths.length > 0 ? (
            <PreviewFrames
              previewUrls={previewUrls}
              previewPaths={localVideo.previewPaths}
              onZoomEnter={(url) => {
                setZoomGroup(previewUrls, url)
                cancelClose()
                scheduleOpen(url)
              }}
              onZoomLeave={clearOpenTimer}
              onZoomClick={(url) => {
                setZoomGroup(previewUrls, url)
                setZoomUrl(url)
              }}
              onSetAsCover={handleSetPreviewAsCover}
            />
          ) : null}

          {/* 相关推荐 */}
          {related && related.length > 0 ? <RelatedGrid related={related} onOpenRelated={onOpenRelated} /> : null}
        </div>
      </div>

      {/* hover 样本图时显示原尺寸大图（lightbox） */}
      {zoomUrl ? (
        <ZoomOverlay
          zoomUrl={zoomUrl}
          overlayRef={overlayRef}
          zoomGroup={zoomGroup}
          zoomIndex={zoomIndex}
          scheduleClose={scheduleClose}
          cancelClose={cancelClose}
          disableHover={disableHover}
          setZoomUrl={setZoomUrl}
        />
      ) : null}
    </div>
  )
}
