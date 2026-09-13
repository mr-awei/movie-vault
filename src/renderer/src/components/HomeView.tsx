import { useMemo, useState } from 'react'
import type { DisplayEntry, Video } from '../../../shared/types'
import { posterUrl, placeholderGradient, titleInitial, titleSecondary, displayTitle } from '../lib/util'
import { api } from '../lib/api'
import { t } from '../../../shared/i18n'
import EntryCard from './EntryCard'
import Icon from './Icon'
import type { SmartFilter } from './Sidebar'
import type { ViewMode } from '../../../shared/types'

interface Props {
  entries: DisplayEntry[]
  onOpen: (e: DisplayEntry) => void
  onEdit: (v: Video) => void
  onOpenMissing: (e: DisplayEntry) => void
  onToggleFlag?: (id: string, key: 'favorite' | 'locked') => void
  onBrowse: (smart: SmartFilter) => void
  /** 随机推荐（每日刷新 + 手动刷新） */
  recommend: DisplayEntry[]
  onRefreshRecommend: () => void
  /** 全库随机（跨媒体库，独立刷新） */
  allRandom: DisplayEntry[]
  onRefreshAllRandom: () => void
  /** 顶栏 Hero：独立洗牌队列驱动，整库参与、不重复、点一次换一次 */
  hero?: DisplayEntry
  onHeroNext: () => void
  /** 点击标签 → 一键筛选该标签全部影片 */
  onPickTag?: (tag: string) => void
  /** 从磁盘删除视频文件 */
  onDelete?: (v: Video) => void
  /** 首页视图模式：竖屏/横屏卡片（不含文件名列表） */
  viewMode: ViewMode
  onSetView: (m: ViewMode) => void
}

function Row({
  title,
  icon,
  entries,
  onOpen,
  onEdit,
  onOpenMissing,
  onToggleFlag,
  onMore,
  onRefresh,
  onPickTag,
  onDelete,
  aspect
}: {
  title: string
  icon: Parameters<typeof Icon>[0]['name']
  entries: DisplayEntry[]
  onOpen: (e: DisplayEntry) => void
  onEdit: (v: Video) => void
  onOpenMissing: (e: DisplayEntry) => void
  onToggleFlag?: (id: string, key: 'favorite' | 'locked') => void
  onMore?: () => void
  onRefresh?: () => void
  onPickTag?: (tag: string) => void
  onDelete?: (v: Video) => void
  aspect: 'portrait' | 'landscape'
}) {
  if (entries.length === 0) return null
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="flex items-center gap-2 text-white font-semibold text-[15px]">
          <Icon name={icon} size={15} className="text-brand" />
          {title}
          <span className="text-white/35 text-xs font-normal">{entries.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <button
              className="text-white/45 hover:text-brand text-xs flex items-center gap-1 transition-colors"
              onClick={onRefresh}
              title={t('home.refreshBatchTitle2')}
            >
              <Icon name="refresh" size={13} />
              {t('home.refreshBatch')}
            </button>
          ) : null}
          {onMore ? (
            <button
              className="text-white/45 hover:text-white text-xs flex items-center gap-0.5 transition-colors"
              onClick={onMore}
            >
              {t('home.viewAll')} <Icon name="chevronRight" size={13} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto thin-scroll pb-2 -mx-1 px-1">
        {entries.map((e) => (
          <div key={e.video?.id ?? `code:${e.code}`} className={`${aspect === 'landscape' ? 'w-56' : 'w-36'} shrink-0`}>
            <EntryCard
              entry={e}
              onOpen={onOpen}
              onEdit={onEdit}
              onOpenMissing={onOpenMissing}
              onToggleFlag={onToggleFlag}
              onPickTag={onPickTag}
              onDelete={onDelete}
              aspect={aspect}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function HomeView({ entries, onOpen, onEdit, onOpenMissing, onToggleFlag, onBrowse, recommend, onRefreshRecommend, allRandom, onRefreshAllRandom, hero, onHeroNext, onPickTag, onDelete, viewMode, onSetView }: Props) {
  // 首页只支持竖屏 / 横屏两种卡片，文件名模式自动回退到横屏
  const aspect = viewMode === 'grid-portrait' ? 'portrait' : 'landscape'
  // 合并刷新：点 Hero 刷新或随机推荐行刷新，两者一起换一批
  const refreshAll = () => {
    onHeroNext()
    onRefreshRecommend()
  }
  // hero 刷新按钮的旋转反馈（点击后转 600ms，让用户明确感知已触发刷新）
  const [heroSpin, setHeroSpin] = useState(false)
  const heroRefresh = () => {
    setHeroSpin(true)
    refreshAll()
    window.setTimeout(() => setHeroSpin(false), 600)
  }
  const { recent, topRated, recentPlayed, favorite } = useMemo(() => {
    const withVideo = entries.filter((e) => e.video)
    const scoreOf = (e: DisplayEntry) => e.score ?? e.video?.rating ?? 0
    const sortBy = (key: (e: DisplayEntry) => number, dir: 1 | -1 = -1) =>
      [...withVideo].sort((a, b) => (key(a) - key(b)) * dir)

    return {
      recent: sortBy((e) => e.video?.addedAt ?? 0).slice(0, 14),
      topRated: sortBy(scoreOf).filter((e) => scoreOf(e) > 0).slice(0, 14),
      recentPlayed: sortBy((e) => e.video?.lastPlayedAt ?? 0)
        .filter((e) => (e.video?.lastPlayedAt ?? 0) > 0)
        .slice(0, 14),
      favorite: withVideo.filter((e) => e.video?.favorite).slice(0, 14)
    }
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-brand/10 ring-1 ring-brand/30 flex items-center justify-center mb-5">
          <Icon name="home" size={30} className="text-brand" />
        </div>
        <div className="text-2xl font-semibold mb-2">{t('home.title')}</div>
        <div className="text-white/50 text-sm max-w-md leading-relaxed">
          {t('home.selectLibraryEmpty')}
        </div>
      </div>
    )
  }

  const heroV = hero?.video
  const heroTitle = hero ? displayTitle(hero) : heroV?.title ?? ''
  const heroSrc = heroV?.posterPath ? posterUrl(heroV.posterPath, heroV.coverVersion) : null

  return (
    <div className="h-full overflow-auto thin-scroll p-5 animate-fadeIn" style={{ contain: 'layout' }}>
      {/* Hero 推荐位 - 整张点击播放；海报氛围充满 300px，左下紧凑布局，背景用真实海报图（非纯模糊），右上 chip+刷新 */}
      {heroV ? (
        <div
          className="relative rounded-2xl overflow-hidden mb-7 h-[300px] ring-1 ring-white/10 shadow-2xl shadow-black/40 group cursor-pointer"
          style={{ contain: 'layout paint', willChange: 'transform' }}
          onClick={() => void api.videoOpen(heroV.id)}
        >
          {/* 背景大图：直接展示（去一点饱和度让左下文字清楚），不再 blur */}
          <div className="absolute inset-0">
            {heroSrc ? (
              <img
                src={heroSrc}
                alt=""
                className="h-full w-full object-cover object-[center_top] scale-105 poster-img hero-bg-img"
                style={{ filter: 'saturate(0.85) brightness(0.85)' }}
              />
            ) : (
              <div className="h-full w-full" style={{ background: placeholderGradient(heroTitle) }} />
            )}
            {/* 左深右浅，保证文字可读 */}
            <div className="absolute inset-0 bg-gradient-to-r from-ink-900 via-ink-900/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-ink-900/85" />
          </div>

          {/* 右上 chip + 换一批 + 视图切换 - 高对比（背景不固定时也不能变全黑死条） */}
          <div className="absolute top-5 right-5 flex items-center gap-2 z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 text-slate-900 text-[11px] font-bold tracking-wider shadow-lg shadow-black/30">
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
              {t('home.recommendForYou')}
            </span>
            <button
              className={`w-9 h-9 rounded-full bg-white/95 text-slate-700 flex items-center justify-center hover:bg-brand hover:text-white shadow-lg shadow-black/30 transition-all ${heroSpin ? 'animate-spin' : ''}`}
              onClick={(e) => { e.stopPropagation(); heroRefresh() }}
              title={t('home.refreshBatchTitle')}
            >
              <Icon name="refresh" size={14} />
            </button>
            {/* 首页视图切换：仅竖屏 / 横屏（无文件名列表） */}
            <div className="inline-flex p-0.5 bg-ink-900/50 border border-white/10 rounded-lg backdrop-blur-md">
              <button
                className={`h-7 px-2 rounded-md flex items-center gap-1 text-xs font-medium transition-colors ${aspect === 'portrait' ? 'bg-brand text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                onClick={(e) => { e.stopPropagation(); onSetView('grid-portrait') }}
                title={t('home.verticalCardTitle')}
              >
                <Icon name="grid" size={13} />
              </button>
              <button
                className={`h-7 px-2 rounded-md flex items-center gap-1 text-xs font-medium transition-colors ${aspect === 'landscape' ? 'bg-brand text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                onClick={(e) => { e.stopPropagation(); onSetView('grid-landscape') }}
                title={t('home.horizontalCardTitle')}
              >
                <Icon name="film" size={13} />
              </button>
            </div>
          </div>

          {/* 内容：左下，标题字号大，行高紧凑 */}
          <div className="relative h-full flex items-end p-7 gap-6">
            <div className={`${aspect === 'landscape' ? 'w-52 h-36' : 'w-36 h-52'} shrink-0 rounded-xl overflow-hidden bg-ink-800 ring-1 ring-white/20 shadow-2xl hidden sm:block transition-transform group-hover:scale-[1.02] relative`}>
              {heroSrc ? (
                <>
                  <img src={heroSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-40" />
                  <img src={heroSrc} alt={heroTitle} className="relative h-full w-full object-contain poster-img" />
                </>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2" style={{ background: placeholderGradient(heroTitle) }}>
                <div className="w-16 h-16 rounded-2xl bg-white/25 ring-1 ring-white/40 backdrop-blur-md flex items-center justify-center text-2xl font-bold text-white leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] shadow-xl shadow-black/40"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
                >
                  {titleInitial(heroTitle)}
                </div>
                <div className="text-[10px] font-semibold text-white tracking-[0.12em] uppercase truncate max-w-[85%] px-2 text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
                  {titleSecondary(heroTitle)}
                </div>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-2 truncate drop-shadow-lg">
                {heroTitle}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-white/80 text-sm mb-5">
                {heroV.year ? <span className="font-semibold">{heroV.year}</span> : null}
                {(hero?.score ?? heroV.rating) != null ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand/20 text-brand font-bold text-[13px] backdrop-blur-sm">
                    <Icon name="star" size={12} className="fill-brand" />
                    {(hero?.score ?? heroV.rating)!.toFixed(2)}
                  </span>
                ) : null}
                {heroV.meta?.studio ? (
                  <span className="text-white/70">{heroV.meta.studio}</span>
                ) : null}
                {heroV.meta?.cast?.[0] ? (
                  <span className="text-white/70 truncate max-w-[200px]">
                    {heroV.meta.cast.slice(0, 2).join(' · ')}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  className="h-11 px-6 rounded-xl flex items-center gap-2.5 bg-brand hover:brightness-110 text-white text-sm font-semibold shadow-lg shadow-brand/40 transition-all"
                  onClick={(e) => { e.stopPropagation(); void api.videoOpen(heroV.id) }}
                >
                  <Icon name="play" size={16} className="fill-current" />
                  {t('home.play')}
                </button>
                {onToggleFlag ? (
                  <button
                    className={`h-11 w-11 rounded-xl flex items-center justify-center backdrop-blur-md ring-1 transition-all ${
                      heroV.favorite
                        ? 'bg-brand text-white ring-brand/40'
                        : 'bg-black/40 hover:bg-brand/20 ring-white/15 text-white'
                    }`}
                    onClick={(e) => { e.stopPropagation(); onToggleFlag(heroV.id, 'favorite') }}
                    title={heroV.favorite ? t('home.unfavorite') : t('home.favorite')}
                  >
                    <Icon name="heart" size={17} className={heroV.favorite ? 'fill-current' : ''} />
                  </button>
                ) : null}
                <button
                  className="h-11 px-5 rounded-xl flex items-center gap-2 bg-black/40 backdrop-blur-md hover:bg-black/60 ring-1 ring-white/15 text-white text-sm font-semibold transition-all"
                  onClick={(e) => { e.stopPropagation(); onOpen(hero) }}
                  title={t('home.detail')}
                >
                  <Icon name="info" size={14} />
                  {t('home.detail')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 精选 rows */}
      <Row title={t('home.randomAll')} icon="layers" entries={allRandom} onOpen={onOpen} onEdit={onEdit} onOpenMissing={onOpenMissing} onToggleFlag={onToggleFlag} onRefresh={onRefreshAllRandom} onPickTag={onPickTag} onDelete={onDelete} aspect={aspect} />
      <Row title={t('home.randomRecommend')} icon="sparkles" entries={recommend} onOpen={onOpen} onEdit={onEdit} onOpenMissing={onOpenMissing} onToggleFlag={onToggleFlag} onRefresh={refreshAll} onPickTag={onPickTag} onDelete={onDelete} aspect={aspect} />
      <Row title={t('home.recentAdded')} icon="clock" entries={recent} onOpen={onOpen} onEdit={onEdit} onOpenMissing={onOpenMissing} onToggleFlag={onToggleFlag} onMore={() => onBrowse('all')} onPickTag={onPickTag} onDelete={onDelete} aspect={aspect} />
      <Row title={t('home.topRated')} icon="star" entries={topRated} onOpen={onOpen} onEdit={onEdit} onOpenMissing={onOpenMissing} onToggleFlag={onToggleFlag} onMore={() => onBrowse('all')} onPickTag={onPickTag} onDelete={onDelete} aspect={aspect} />
      <Row title={t('home.recentPlayed')} icon="play" entries={recentPlayed} onOpen={onOpen} onEdit={onEdit} onOpenMissing={onOpenMissing} onToggleFlag={onToggleFlag} onMore={() => onBrowse('recent')} onPickTag={onPickTag} onDelete={onDelete} aspect={aspect} />
      <Row title={t('home.myFavorites')} icon="heart" entries={favorite} onOpen={onOpen} onEdit={onEdit} onOpenMissing={onOpenMissing} onToggleFlag={onToggleFlag} onMore={() => onBrowse('favorite')} onPickTag={onPickTag} onDelete={onDelete} aspect={aspect} />
    </div>
  )
}
