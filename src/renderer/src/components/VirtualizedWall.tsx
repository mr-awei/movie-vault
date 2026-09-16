import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DisplayEntry, Playlist, Video } from '../../../shared/types'
import EntryCard from './EntryCard'
import { t } from '../../../shared/i18n'

export interface WallSection {
  title: string
  entries: DisplayEntry[]
}

interface Props {
  sections: WallSection[]
  onOpen: (entry: DisplayEntry) => void
  onEdit: (v: Video) => void
  onOpenMissing: (entry: DisplayEntry) => void
  onToggleFlag?: (id: string, key: 'favorite' | 'locked') => void
  /** 点击标签 → 一键筛选该标签全部影片 */
  onPickTag?: (tag: string) => void
  /** 从磁盘删除视频文件 */
  onDelete?: (v: Video) => void
  /** 卡片宽高比：portrait 竖屏(2:3) / landscape 横屏(16:9) */
  aspect?: 'portrait' | 'landscape'
  /** v2.7.x：多选模式（批量锁定用） */
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  playlists?: Playlist[]
  onAddToPlaylist?: (playlistId: string, videoId: string) => void
  activePlaylistId?: string | null
  onRemoveFromPlaylist?: (playlistId: string, videoId: string) => void
  onDragStart?: (videoId: string) => string | undefined
  onDragOver?: (e: React.DragEvent, targetVideoId: string) => void
  onDrop?: (targetVideoId: string, fromIdx: string) => void
  onDragSelectStart?: (videoId: string) => void
  onDragSelectEnter?: (videoId: string) => void
  dragSelectActive?: boolean
  inPlaylistIds?: Set<string>
}

const GAP = 16
/** 视口上下各多渲染的行数 */
const OVERSCAN = 3
/** 分类标题行高（标题 + 下方留白） */
const TITLE_H = 48

type Row =
  | { kind: 'title'; key: string; title: string; count: number }
  | { kind: 'cards'; key: string; items: DisplayEntry[] }

/**
 * 全库虚拟滚动墙：把「分类标题 + 卡片行」平铺成单一虚拟列表，
 * 只渲染可见行 ± OVERSCAN。整个应用只有这一个滚动容器，
 * 大库（几百上千部）DOM 数量恒定为一屏几十张，滚动性能与库大小无关。
 */
function VirtualizedWall({ sections, onOpen, onEdit, onOpenMissing, onToggleFlag, onPickTag, onDelete, aspect = 'portrait', selectable = false, selectedIds, onToggleSelect, playlists, onAddToPlaylist, activePlaylistId, onRemoveFromPlaylist, onDragStart, onDragOver, onDrop, onDragSelectStart, onDragSelectEnter, dragSelectActive, inPlaylistIds }: Props) {
  const RATIO = aspect === 'landscape' ? 9 / 16 : 3 / 2
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [minPosterW, setMinPosterW] = useState(150)
  const rafRef = useRef(0)
  const resizeRafRef = useRef(0)

  // 容器尺寸 + 海报最小列宽（--poster-min，随主题/密度变化）
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const readMinW = () => parseInt(getComputedStyle(el).getPropertyValue('--poster-min')) || 150
    const measure = () => {
      cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = requestAnimationFrame(() => {
        setWidth(el.clientWidth)
        setHeight(el.clientHeight)
        setMinPosterW(readMinW())
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // P1-5：只观察容器自身 class（此前遍历到 body 的所有祖先，Toast/滚动条/隐私切换
    // 都会触发整墙重算）。theme/density 变化由 App 层 dispatch 'wall-remeasure' 通知。
    const mo = new MutationObserver(measure)
    mo.observe(el, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('wall-remeasure', measure)
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('wall-remeasure', measure)
      cancelAnimationFrame(rafRef.current)
      cancelAnimationFrame(resizeRafRef.current)
    }
  }, [])

  // 滚动 rAF 节流
  const onScroll = () => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      setScrollTop(wrapRef.current?.scrollTop ?? 0)
    })
  }

  // 平铺行 + 每行 y 坐标 + 总高度
  const { rows, offsets, totalH, colW } = useMemo(() => {
    if (width <= 0) return { rows: [] as Row[], offsets: [] as number[], totalH: 0, colW: 0 }
    const cols = Math.max(1, Math.floor((width + GAP) / (minPosterW + GAP)))
    const cw = (width - (cols - 1) * GAP) / cols
    const rowH = cw * RATIO + GAP
    const rows: Row[] = []
    const offsets: number[] = []
    let y = 0
    for (const s of sections) {
      rows.push({ kind: 'title', key: `t-${s.title}`, title: s.title, count: s.entries.length })
      offsets.push(y)
      y += TITLE_H
      for (let i = 0; i < s.entries.length; i += cols) {
        rows.push({ kind: 'cards', key: `c-${s.title}-${i}-${aspect}`, items: s.entries.slice(i, i + cols) })
        offsets.push(y)
        y += rowH
      }
    }
    return { rows, offsets, totalH: y, colW: cw }
  }, [width, sections, minPosterW, aspect, RATIO])

  const visible: React.ReactNode[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const y = offsets[i]
    const isTitle = row.kind === 'title'
    const rowH = isTitle ? TITLE_H : colW * RATIO + GAP
    // 快速剔除：整行在视口外则跳过
    if (y + rowH < scrollTop - OVERSCAN * rowH) continue
    if (y > scrollTop + height + OVERSCAN * rowH) continue
    if (isTitle) {
      visible.push(
        // min-w-0 + truncate：超长分类名（如「科幻 / 悬疑 / 动作（核心推荐）」）截断，不撑爆视图
        <div key={row.key} className="absolute inset-x-0 flex items-baseline gap-2 px-1 min-w-0" style={{ top: y, height: TITLE_H }}>
          <h2 className="section-title text-white font-semibold text-lg leading-none truncate min-w-0">{row.title}</h2>
          <span className="text-white/40 text-xs shrink-0 tabular-nums">{row.count} {t('browse.unit')}</span>
        </div>
      )
    } else {
      visible.push(
        <div
          key={row.key}
          className="absolute flex gap-4"
          style={{ top: y, left: 0, right: 0, height: colW * RATIO }}
        >
          {row.items.map((e, ci) => (
            <div key={`${e.code}-${ci}`} style={{ width: colW, height: colW * RATIO }} className="shrink-0">
              <EntryCard entry={e} onOpen={onOpen} onEdit={onEdit} onOpenMissing={onOpenMissing} onToggleFlag={onToggleFlag} onPickTag={onPickTag} onDelete={onDelete} aspect={aspect} selectable={selectable} selected={!!(e.video?.id && selectedIds?.has(e.video.id))} onToggleSelect={onToggleSelect} playlists={playlists} onAddToPlaylist={onAddToPlaylist} activePlaylistId={activePlaylistId} onRemoveFromPlaylist={onRemoveFromPlaylist} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragSelectStart={onDragSelectStart} onDragSelectEnter={onDragSelectEnter} dragSelectActive={dragSelectActive} inPlaylist={!!(inPlaylistIds && e.video?.id && inPlaylistIds.has(e.video.id))} />
            </div>
          ))}
        </div>
      )
    }
  }

  return (
    <div ref={wrapRef} onScroll={onScroll} className="h-full overflow-x-hidden overflow-y-auto thin-scroll pr-1">
      {/* paddingBottom 让最底部一行卡片下方留 80px 缓冲，确保滚到底时最后一行完整可见（不被滚动容器底部裁切） */}
      {/* paddingRight 让最右侧一列卡片与窗口边框保持 20px 间距，避免悬浮按钮/预览贴到边框触发系统缩放边缘抽动 */}
      <div style={{ position: 'relative', height: Math.max(totalH, height), minWidth: 0, paddingBottom: 80, paddingRight: 20 }}>
        {visible}
      </div>
    </div>
  )
}

export default memo(VirtualizedWall)
