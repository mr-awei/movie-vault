import { useDataStore, useUIStore } from '../store'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

/**
 * 播放列表操作栏（浏览页工具栏下方）。
 * 三态：
 * 1. 添加模式（pendingPlaylistId）：从全库选择要加入列表的影片
 * 2. 管理模式（activePlaylistId + selectMode）：批量移除列表内影片
 * 3. 普通视图（activePlaylistId）：改名/删除影片/添加影片/播放全部/删除列表
 * 状态直接从 store 读取，App.tsx 只传行为回调，减少上帝组件 props 传递。
 */
export function PlaylistToolbar(props: {
  filteredCount: number
  onSelectAll: () => void
  onInvert: () => void
  onAddSelected: () => void
  onRemoveSelected: () => void
  onPlayAll: () => void
  onDeletePlaylist: (id: string) => void
}) {
  const playlists = useDataStore((s) => s.playlists)
  const activePlaylistId = useUIStore((s) => s.activePlaylistId)
  const pendingPlaylistId = useUIStore((s) => s.pendingPlaylistId)
  const setPendingPlaylistId = useUIStore((s) => s.setPendingPlaylistId)
  const selectMode = useUIStore((s) => s.selectMode)
  const setSelectMode = useUIStore((s) => s.setSelectMode)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)

  const cancelSelection = () => {
    setSelectedIds(new Set())
    setSelectMode(false)
  }
  const playlistName = (id: string | null) => playlists.find((p) => p.id === id)?.name ?? ''

  return (
    <>
      {/* 播放列表：添加影片模式操作栏 */}
      {pendingPlaylistId ? (
        <div className="mb-3 flex items-center justify-between px-4 py-2.5 rounded-xl bg-brand/10 ring-1 ring-brand/30">
          <span className="text-sm text-brand font-medium">
            {t('playlist.selectToAdd', { name: playlistName(pendingPlaylistId) })}
            <span className="ml-2 text-brand/60">{t('playlist.selectedCount', { n: selectedIds.size })}</span>
          </span>
          <div className="flex items-center gap-2">
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={props.onSelectAll}>{t('playlist.selectAll')}</button>
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={() => setSelectedIds(new Set())}>{t('playlist.deselectAll')}</button>
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={props.onInvert}>{t('playlist.invert')}</button>
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={() => { setPendingPlaylistId(null); setSelectMode(false); setSelectedIds(new Set()) }}>{t('playlist.cancel')}</button>
            <button className="h-8 px-3 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand/90 disabled:opacity-40" disabled={selectedIds.size === 0} onClick={() => void props.onAddSelected()}>{t('playlist.addSelected', { n: selectedIds.size })}</button>
          </div>
        </div>
      ) : null}

      {/* 播放列表：管理模式（批量移除）操作栏 */}
      {activePlaylistId && selectMode && !pendingPlaylistId ? (
        <div className="mb-3 flex items-center justify-between px-4 py-2.5 rounded-xl bg-red-500/10 ring-1 ring-red-500/30">
          <span className="text-sm text-red-300 font-medium">
            {t('playlist.selectToRemove', { name: playlistName(activePlaylistId) })}
            <span className="ml-2 text-red-300/60">已选 {selectedIds.size} 部</span>
          </span>
          <div className="flex items-center gap-2">
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={props.onSelectAll}>全选</button>
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={() => setSelectedIds(new Set())}>取消全选</button>
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={props.onInvert}>反选</button>
            <button className="h-8 px-2.5 rounded-lg text-xs bg-white/8 hover:bg-white/15 text-white/80" onClick={cancelSelection}>取消</button>
            <button className="h-8 px-3 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-40" disabled={selectedIds.size === 0} onClick={() => void props.onRemoveSelected()}>{t('playlist.removeSelected', { n: selectedIds.size })}</button>
          </div>
        </div>
      ) : null}

      {/* 播放列表：普通视图操作栏 */}
      {activePlaylistId && !selectMode && !pendingPlaylistId ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Icon name="list" size={16} />
            <span className="font-medium text-white/80">{playlistName(activePlaylistId)}</span>
            <span>{props.filteredCount} {t('playlist.videos')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm transition-colors" onClick={() => { setSelectedIds(new Set()); setSelectMode(true) }}>
              <Icon name="trash" size={14} />
              {t('playlist.removeVideos')}
            </button>
            <button className="h-9 px-3 rounded-lg flex items-center gap-2 bg-white/8 hover:bg-white/15 text-white text-sm transition-colors" onClick={() => { setPendingPlaylistId(activePlaylistId); setSelectedIds(new Set()); setSelectMode(true) }}>
              <Icon name="plus" size={14} />
              {t('playlist.addVideos')}
            </button>
            <button className="h-9 px-3 rounded-lg flex items-center gap-2 bg-brand hover:bg-brand/90 text-white text-sm font-medium transition-colors" onClick={() => void props.onPlayAll()}>
              <Icon name="play" size={14} />
              {t('playlist.playAll')}
            </button>
            <button className="h-9 px-3 rounded-lg flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm transition-colors" onClick={() => void props.onDeletePlaylist(activePlaylistId)}>
              <Icon name="trash" size={14} />
              {t('playlist.delete')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
