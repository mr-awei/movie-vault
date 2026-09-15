import { memo, useMemo, useState, useRef, useEffect, type ReactNode } from 'react'
import type { Library, Settings, Playlist } from '../../../shared/types'
import Icon, { type IconName } from './Icon'
import { t } from '../../../shared/i18n'

export interface TagInfo {
  tag: string
  count: number
  category: string
}

export interface SectionInfo {
  name: string
  order: number
  count: number
}

export interface MetaFacet {
  name: string
  count: number
}

export type ViewName = 'home' | 'browse'
export type SmartFilter = 'all' | 'favorite' | 'recent' | 'unrated' | 'nocover' | 'unlisted'

interface Props {
  view: ViewName
  smart: SmartFilter
  onNav: (view: ViewName, smart?: SmartFilter) => void

  libraries: Library[]
  libraryId: string
  onLibrary: (id: string) => void
  onEditLibrary: () => void
  onAddLibrary: () => void

  /** 我的清单 / 待处理 计数 */
  favoriteCount: number
  recentCount: number
  unlistedCount: number
  unratedCount: number
  nocoverCount: number

  /** 待处理（可用）更新；非空时在「设置」入口显示提醒点，颜色随 urgency 变化 */
  pendingUpdate?: Settings['pendingUpdate']

  /** 筛选：分类 */
  sections: SectionInfo[]
  selectedCategory: string | null
  onToggleCategory: (cat: string) => void
  onClearCategory: () => void

  /** 筛选：标签 */
  tags: TagInfo[]
  categories: string[]
  selected: Set<string>
  onToggle: (tag: string) => void
  onClear: () => void

  /** 筛选：演员/制片公司/系列 */
  actorFacets: MetaFacet[]
  studioFacets: MetaFacet[]
  seriesFacets: MetaFacet[]
  selectedActors: Set<string>
  selectedStudios: Set<string>
  selectedSeries: Set<string>
  onToggleActor: (v: string) => void
  onToggleStudio: (v: string) => void
  onToggleSeries: (v: string) => void
  onClearActors: () => void
  onClearStudios: () => void
  onClearSeries: () => void
  onClearMetaFilters: () => void

  /** v2.3.2 类别（genre）筛选：独立于分类，从 meta.genres 提取单标签 */
  genreFacets: MetaFacet[]
  selectedGenres: Set<string>
  onToggleGenre: (g: string) => void
  onClearGenres: () => void

  /** 筛选：技术规格 / 时间 */
  resolutionFacets: MetaFacet[]
  durationFacets: MetaFacet[]
  scoreFacets: MetaFacet[]
  yearFacets: MetaFacet[]
  selectedResolutions: Set<string>
  selectedDurations: Set<string>
  selectedScores: Set<string>
  selectedYears: Set<string>
  onToggleResolution: (v: string) => void
  onToggleDuration: (v: string) => void
  onToggleScore: (v: string) => void
  onToggleYear: (v: string) => void
  onClearResolutions: () => void
  onClearDurations: () => void
  onClearScores: () => void
  onClearYears: () => void
  onClearTechFilters: () => void

  collapsed: boolean
  onToggleCollapsed: () => void

  onOpenStats: () => void
  onOpenAbout: () => void
  playlists: Playlist[]
  activePlaylistId: string | null
  onSelectPlaylist: (id: string | null) => void
  onCreatePlaylist: (name: string) => void
  onDeletePlaylist: (id: string) => void
  onRenamePlaylist?: (id: string, name: string) => void

  onOpenSettings: () => void
}

const PER_CAT_LIMIT = 10

/** 外层可折叠段（导航 / 媒体库 / 我的 / 筛选） */
function Section({
  title,
  icon,
  count,
  onClear,
  children,
  defaultOpen = true,
  active,
  grow
}: {
  title: string
  icon: IconName
  count?: number
  onClear?: () => void
  children: ReactNode
  defaultOpen?: boolean
  active?: boolean
  grow?: boolean
}) {
  const storageKey = `sidebar_section_${title}`
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved !== null ? saved === 'true' : defaultOpen
    } catch { return defaultOpen }
  })
  const toggleOpen = () => setOpen((o) => {
    const next = !o
    try { localStorage.setItem(storageKey, String(next)) } catch {}
    return next
  })
  return (
    <div className={`border-b border-white/5 last:border-b-0 ${grow ? 'flex flex-col flex-1 min-h-0' : ''}`}>
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-ink-800/40 transition-colors"
        onClick={toggleOpen}
        title={open ? t('sidebar.collapseSection') : t('sidebar.expandSection')}
      >
        <div className={`flex items-center gap-1.5 font-semibold text-[12px] ${active ? 'text-brand' : 'text-white/90'}`}>
          <Icon name={icon} size={12} className={active ? 'text-brand' : 'text-brand/80'} />
          <span>{title}</span>
          {count ? (
            <span className="px-1.5 rounded-full bg-brand/15 text-brand text-[10px] font-bold">{count}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          {onClear && count ? (
            <button
              className="no-drag h-5 px-1.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              title={t('sidebar.clearSectionFilter')}
            >
              {t('sidebar.clear')}
            </button>
          ) : null}
          <Icon
            name="chevronDown"
            size={14}
            className={`text-white/40 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </div>
      </button>
      {open ? <div className={`px-3 pb-3 ${grow ? 'flex flex-col flex-1 min-h-0' : ''}`}>{children}</div> : null}
    </div>
  )
}

/** 元信息 facet 单组（演员 / 制片公司 / 系列） */
function FacetGroup({
  title,
  icon,
  facets,
  selected,
  onToggle,
  onClear
}: {
  title: string
  icon: IconName
  facets: MetaFacet[]
  selected: Set<string>
  onToggle: (v: string) => void
  onClear: () => void
}) {
  const [closed, setClosed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const show = expanded ? facets : facets.slice(0, PER_CAT_LIMIT)
  const selCount = selected.size
  return (
    <div className="mb-2.5 last:mb-0">
      <button
        className="w-full flex items-center justify-between py-1 px-0.5 rounded hover:bg-ink-800/60 transition-colors"
        onClick={() => setClosed((c) => !c)}
        title={closed ? t('sidebar.expand') : t('sidebar.collapse')}
      >
        <span className="flex items-center gap-1 text-white/55 text-[11px] font-medium tracking-wide">
          <Icon name="chevronDown" size={11} className={`transition-transform duration-200 ${closed ? '-rotate-90' : ''}`} />
          <Icon name={icon} size={11} className="opacity-70" />
          <span>{title}</span>
          {selCount > 0 ? (
            <span className="px-1.5 rounded-full bg-brand/15 text-brand text-[10px] font-bold">{selCount}</span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          {selCount > 0 ? (
            <button
              className="no-drag h-5 px-1.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
            >
              {t('sidebar.clear')}
            </button>
          ) : null}
          <Icon name={closed ? 'chevronRight' : 'chevronDown'} size={11} className="text-white/30" />
        </div>
      </button>
      {!closed ? (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {facets.length === 0 ? (
            <span className="text-white/30 text-[11px]">{t('app.noData')}</span>
          ) : (
            show.map((f) => {
              const sel = selected.has(f.name)
              return (
                <button
                  key={f.name}
                  onClick={() => onToggle(f.name)}
                  className={`h-6 px-2 rounded-lg text-[11px] flex items-center gap-1 transition-all max-w-full ring-1 ${
                    sel
                      ? 'bg-brand text-white shadow-sm shadow-brand/30 font-medium'
                      : 'bg-white/6 hover:bg-white/12 text-white/75 hover:text-white'
                  }`}
                  title={f.name}
                >
                  {sel ? <Icon name="check" size={10} className="shrink-0" /> : null}
                  <span className="max-w-[100px] truncate">{f.name}</span>
                  <span className={sel ? 'opacity-75 text-[10px]' : 'opacity-50 text-[10px]'}>{f.count}</span>
                </button>
              )
            })
          )}
          {facets.length > PER_CAT_LIMIT ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="h-6 px-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-white/50"
            >
              {expanded ? t('sidebar.collapse') : `+${facets.length - PER_CAT_LIMIT}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
  alert
}: {
  icon: IconName
  label: string
  active?: boolean
  onClick: () => void
  badge?: number
  alert?: boolean
}) {
  return (
    <button
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
        active
          ? 'bg-brand/15 text-brand font-medium'
          : alert
            ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
            : 'text-white/75 hover:bg-ink-700 hover:text-white'
      }`}
      onClick={onClick}
    >
      <Icon name={icon} size={15} className={active ? 'text-brand' : alert ? 'text-amber-400' : 'text-white/55'} />
      <span className="flex-1 text-left truncate">{label}</span>
      {/* 待处理提醒点：无论是否选中都显示，确保「有未处理项」状态不被选中态掩盖 */}
      {alert ? (
        <span
          className={`h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 ${active ? 'ring-2 ring-brand/15' : ''}`}
          title={t('sidebar.hasPending')}
        />
      ) : null}
      {badge ? (
        <span className={`text-[10px] tabular-nums ${alert ? 'text-amber-400' : 'text-white/40'}`}>{badge}</span>
      ) : null}
    </button>
  )
}

function SidebarInner(props: Props) {
  const {
    view, smart, onNav, libraries, libraryId, onLibrary, onEditLibrary, onAddLibrary,
    favoriteCount, recentCount, unlistedCount, unratedCount, nocoverCount, pendingUpdate,
    sections, selectedCategory, onToggleCategory, onClearCategory,
    tags, categories, selected, onToggle, onClear,
    actorFacets, studioFacets, seriesFacets,
    selectedActors, selectedStudios, selectedSeries,
    onToggleActor, onToggleStudio, onToggleSeries,
    onClearActors, onClearStudios, onClearSeries, onClearMetaFilters,
    genreFacets, selectedGenres, onToggleGenre, onClearGenres,
    resolutionFacets, durationFacets, scoreFacets, yearFacets,
    selectedResolutions, selectedDurations, selectedScores, selectedYears,
    onToggleResolution, onToggleDuration, onToggleScore, onToggleYear,
    onClearResolutions, onClearDurations, onClearScores, onClearYears, onClearTechFilters,
    collapsed, onToggleCollapsed,
    playlists = [], activePlaylistId, onSelectPlaylist, onCreatePlaylist, onDeletePlaylist, onRenamePlaylist,
    onOpenStats, onOpenAbout, onOpenSettings
  } = props

  const [collapsedTagCats, setCollapsedTagCats] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)
  const [playlistInputKey, setPlaylistInputKey] = useState(0)
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const playlistInputRef = useRef<HTMLInputElement>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, TagInfo[]>()
    for (const cat of categories) map.set(cat, [])
    for (const t of tags) {
      const list = map.get(t.category) ?? []
      list.push(t)
      map.set(t.category, list)
    }
    for (const list of map.values()) list.sort((a, b) => b.count - a.count)
    return map
  }, [tags, categories])

  // 未收录 已单独归入「待处理」，不再出现在「分类」列表中
  const visibleSections = useMemo(
    () => sections.filter((s) => s.name !== '未收录'),
    [sections]
  )

  const totalSelected = selected.size
  const metaSelectedCount = selectedActors.size + selectedStudios.size + selectedSeries.size
  const genreSelectedCount = selectedGenres.size
  const techSelectedCount = selectedResolutions.size + selectedDurations.size + selectedScores.size + selectedYears.size

  // 筛选：合并为可折叠 Tab 组（分类 / 类别 / 标签 / 影人 / 规格 / 年份），默认收起
  const [filterTab, setFilterTab] = useState<'cat' | 'genre' | 'tag' | 'meta' | 'tech' | 'year'>('cat')
  useEffect(() => {
    if (creatingPlaylist) {
      let attempts = 0
      const tryFocus = () => {
        const el = playlistInputRef.current
        if (el) { el.focus(); el.select() }
        else if (attempts < 5) { attempts++; setTimeout(tryFocus, 30) }
      }
      requestAnimationFrame(() => setTimeout(tryFocus, 0))
    }
  }, [creatingPlaylist, playlistInputKey])

  const handleRenamePlaylist = (id: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed) onRenamePlaylist?.(id, trimmed)
    setEditingPlaylistId(null)
  }

  const filterCount =
    (selectedCategory ? 1 : 0) + genreSelectedCount + totalSelected + metaSelectedCount + techSelectedCount + selectedYears.size
  const clearAllFilters = () => {
    onClearCategory()
    onClearGenres()
    onClear()
    onClearMetaFilters()
    onClearTechFilters()
    onClearYears()
  }
  const FILTER_TABS: { key: 'cat' | 'genre' | 'tag' | 'meta' | 'tech' | 'year'; label: string; icon: IconName; badge: number }[] = [
    { key: 'cat', label: t('sidebar.category'), icon: 'folder', badge: selectedCategory ? 1 : 0 },
    { key: 'genre', label: t('sidebar.genre'), icon: 'layers', badge: genreSelectedCount },
    { key: 'tag', label: t('sidebar.tag'), icon: 'tag', badge: totalSelected },
    { key: 'meta', label: t('sidebar.cast'), icon: 'users', badge: metaSelectedCount },
    { key: 'tech', label: t('sidebar.spec'), icon: 'monitor', badge: techSelectedCount },
    { key: 'year', label: t('sidebar.year'), icon: 'calendar', badge: selectedYears.size }
  ]

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 border-r border-white/5 bg-ink-850/80 flex flex-col items-center py-3">
        <button
          className="no-drag w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-ink-700 transition-colors"
          onClick={onToggleCollapsed}
          title={t('sidebar.expandSidebar')}
        >
          <Icon name="chevronRight" size={16} />
        </button>
        <div className="mt-2 flex flex-col items-center gap-1">
          <button className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${view === 'home' ? 'bg-brand/20 text-brand' : 'text-white/60 hover:text-white hover:bg-ink-700'}`} onClick={() => onNav('home')} title={t('sidebar.home')}>
            <Icon name="home" size={16} />
          </button>
          <button className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${view === 'browse' && smart === 'all' ? 'bg-brand/20 text-brand' : 'text-white/60 hover:text-white hover:bg-ink-700'}`} onClick={() => onNav('browse', 'all')} title={t('sidebar.allVideos')}>
            <Icon name="grid" size={16} />
          </button>
          {favoriteCount > 0 ? (
            <button className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${view === 'browse' && smart === 'favorite' ? 'bg-brand/20 text-brand' : 'text-white/60 hover:text-white hover:bg-ink-700'}`} onClick={() => onNav('browse', 'favorite')} title={t('sidebar.favorites')}>
              <Icon name="heart" size={16} />
            </button>
          ) : null}
          {unlistedCount > 0 ? (
            <button className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${view === 'browse' && smart === 'unlisted' ? 'bg-brand/20 text-brand' : 'text-amber-400/90 hover:text-amber-400 hover:bg-amber-500/15'}`} onClick={() => onNav('browse', 'unlisted')} title={t('sidebar.untracked')}>
              <Icon name="alert" size={16} />
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 text-[10px] text-white/40 [writing-mode:vertical-rl] tracking-widest">{t('sidebar.filter')}</div>
        <div className="mt-auto flex flex-col items-center gap-1 pt-2 border-t border-white/5 w-full">
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-ink-700 transition-colors" onClick={onOpenStats} title={t('sidebar.statsPanel')}>
            <Icon name="chart" size={15} />
          </button>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-ink-700 transition-colors" onClick={onOpenAbout} title={t('sidebar.about')}>
            <Icon name="info" size={15} />
          </button>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-ink-700 transition-colors" onClick={onOpenSettings} title={t('sidebar.settings')}>
            <Icon name="sliders" size={15} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-[280px] shrink-0 border-r border-white/5 bg-ink-850/80 flex flex-col overflow-hidden">
      {/* 顶部条 */}
      <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-white/5">
        <div className="flex items-center gap-1.5 text-white/90 font-semibold text-[12px]">
          <Icon name="layers" size={12} className="text-brand" />
          {t('sidebar.navigation')}
        </div>
        <button
          className="no-drag w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
          onClick={onToggleCollapsed}
          title={t('sidebar.collapseSidebar')}
        >
          <Icon name="chevronLeft" size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* 导航 */}
        <div className="px-2 py-2 flex flex-col gap-0.5 shrink-0">
          <NavItem icon="home" label={t('sidebar.home')} active={view === 'home'} onClick={() => onNav('home')} />
          <NavItem
            icon="grid"
            label={t('sidebar.allVideos')}
            active={view === 'browse' && smart === 'all'}
            onClick={() => onNav('browse', 'all')}
          />
        </div>

        {/* 媒体库 */}
        <Section title={t('sidebar.library')} icon="folder" active={false} defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-col gap-0.5 max-h-[320px] overflow-auto thin-scroll -mr-1 pr-1">
              {libraries.length === 0 ? (
                <div className="text-white/35 text-[11px] py-1 px-1">{t('sidebar.noLibrary')}</div>
              ) : (
                libraries.map((l) => {
                  const sel = l.id === libraryId
                  return (
                    <div
                      key={l.id}
                      className={`group/lib flex items-center gap-1 rounded-lg transition-colors ${
                        sel ? 'bg-brand/15' : 'hover:bg-ink-700'
                      }`}
                    >
                      <button
                        className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px] ${
                          sel ? 'text-brand font-medium' : 'text-white/80 hover:text-white'
                        }`}
                        onClick={() => onLibrary(l.id)}
                        title={l.name}
                      >
                        <Icon name="film" size={13} className={sel ? 'text-brand shrink-0' : 'text-white/45 shrink-0'} />
                        <span className="truncate">{l.name}</span>
                      </button>
                      {sel ? (
                        <button
                          className="no-drag w-6 h-6 mr-1 rounded flex items-center justify-center text-white/45 hover:text-white hover:bg-ink-600 transition-colors shrink-0"
                          onClick={onEditLibrary}
                          title={t('sidebar.librarySettings')}
                        >
                          <Icon name="sliders" size={12} />
                        </button>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
            <button
              className="mt-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] text-brand hover:bg-brand/10 transition-colors"
              onClick={onAddLibrary}
            >
              <Icon name="plus" size={13} />
              {t('sidebar.addLibrary')}
            </button>
          </div>
        </Section>
        {/* 待处理（系统诊断 / 差异视图） */}
        {/* 筛选：合并为可折叠 Tab 组，默认收起，显著降低首屏高度 */}
        <Section title={t('sidebar.filter')} icon="sliders" count={filterCount} onClear={clearAllFilters} active={filterCount > 0} defaultOpen={true}>
          <div className="flex flex-wrap gap-1 mb-2 shrink-0">
            {FILTER_TABS.map((tab) => {
              const sel = filterTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilterTab(tab.key)}
                  className={`flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
                    sel ? 'bg-brand text-white' : 'bg-white/6 hover:bg-white/12 text-white/70 hover:text-white'
                  }`}
                  title={tab.label}
                >
                  <Icon name={tab.icon} size={11} />
                  {tab.label}
                  {tab.badge > 0 ? (
                    <span className={`px-1 rounded-full text-[9px] font-bold ${sel ? 'bg-white/25 text-white' : 'bg-brand/20 text-brand'}`}>{tab.badge}</span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* 分类 */}
          {filterTab === 'cat' ? (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between mb-1 shrink-0">
                <span className="text-white/45 text-[11px] font-medium">{t('sidebar.category')}</span>
                {selectedCategory ? (
                  <button className="h-5 px-1.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors" onClick={onClearCategory}>{t('sidebar.clear')}</button>
                ) : null}
              </div>
              {visibleSections.length === 0 ? (
                <div className="text-white/35 text-[11px] py-1">{t('sidebar.noCategory')}</div>
              ) : (
                <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-auto thin-scroll -mr-1 pr-1">
                  {(() => {
                    // 需求 B：自动归类（order 9000-9998，如【数据源】高清·字幕）与用户分类分组显示
                    const autoSections = visibleSections.filter((s) => s.order >= 9000 && s.order < 9999)
                    const normalSections = visibleSections.filter((s) => s.order < 9000 || s.order >= 9999)
                    const renderSection = (s: SectionInfo) => {
                      const sel = selectedCategory === s.name
                      const empty = s.count === 0
                      return (
                        <button
                          key={s.name}
                          onClick={() => onToggleCategory(s.name)}
                          disabled={empty && !sel}
                          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors text-left ${
                            sel ? 'bg-brand text-white font-medium' : empty ? 'text-white/30 cursor-not-allowed' : 'hover:bg-ink-700 text-white/80 hover:text-white'
                          }`}
                          title={s.name}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {sel ? <Icon name="check" size={11} className="shrink-0 text-white" /> : <Icon name="folder" size={11} className="shrink-0 text-white/40" />}
                            <span className="truncate">{s.name}</span>
                          </div>
                          <span className={`shrink-0 text-[10px] tabular-nums px-1.5 py-0.5 rounded ${sel ? 'bg-white/20' : 'bg-white/5 text-white/50'}`}>{s.count}</span>
                        </button>
                      )
                    }
                    return (
                      <>
                        {normalSections.map(renderSection)}
                        {autoSections.length > 0 ? (
                          <>
                            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/5 text-white/35 text-[10px] font-medium">
                              <Icon name="zap" size={10} className="text-violet-400/70" />
                              {t('sidebar.autoCategory')}
                            </div>
                            {autoSections.map(renderSection)}
                          </>
                        ) : null}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          ) : null}

          {/* 类别（genre） */}
          {filterTab === 'genre' ? (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between mb-1 shrink-0">
                <span className="text-white/45 text-[11px] font-medium">{t('sidebar.genre')}</span>
                {genreSelectedCount > 0 ? (
                  <button className="h-5 px-1.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors" onClick={onClearGenres}>{t('sidebar.clear')}</button>
                ) : null}
              </div>
              {genreFacets.length === 0 ? (
                <div className="text-white/35 text-[11px] py-1">{t('sidebar.noGenre')}</div>
              ) : (
                <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-auto thin-scroll -mr-1 pr-1">
                  {genreFacets.map((g) => {
                     const sel = selectedGenres.has(g.name)
                     return (
                       <button
                         key={g.name}
                         onClick={() => onToggleGenre(g.name)}
                         className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors text-left ${
                           sel ? 'bg-brand text-white font-medium' : 'hover:bg-ink-700 text-white/80 hover:text-white'
                         }`}
                         title={g.name}
                       >
                         <div className="flex items-center gap-1.5 min-w-0 flex-1">
                           {sel ? <Icon name="check" size={11} className="shrink-0 text-white" /> : <Icon name="layers" size={11} className="shrink-0 text-white/40" />}
                           <span className="truncate">{g.name}</span>
                         </div>
                         <span className={`shrink-0 text-[10px] tabular-nums px-1.5 py-0.5 rounded ${sel ? 'bg-white/20' : 'bg-white/5 text-white/50'}`}>{g.count}</span>
                       </button>
                     )
                   })}
                </div>
              )}
            </div>
          ) : null}

          {/* 标签 */}
          {filterTab === 'tag' ? (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between mb-1 shrink-0">
                <span className="text-white/45 text-[11px] font-medium">{t('sidebar.tag')}</span>
                {totalSelected > 0 ? (
                  <button className="h-5 px-1.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors" onClick={onClear}>{t('sidebar.clear')}</button>
                ) : null}
              </div>
              <div className="flex-1 min-h-0 overflow-auto thin-scroll -mr-1 pr-1">
              {tags.length === 0 ? <div className="text-white/35 text-xs py-2 text-center">{t('sidebar.noTag')}</div> : null}
              {categories.map((cat) => {
                const list = grouped.get(cat) ?? []
                if (list.length === 0) return null
                const catClosed = !!collapsedTagCats[cat]
                const isExpanded = !!expanded[cat]
                const show = isExpanded ? list : list.slice(0, PER_CAT_LIMIT)
                return (
                  <div key={cat} className="mb-2.5 last:mb-0 group/cat">
                    <button
                      className="w-full flex items-center justify-between py-1 rounded px-0.5 hover:bg-ink-800/60 transition-colors"
                      onClick={() => setCollapsedTagCats((p) => ({ ...p, [cat]: !p[cat] }))}
                      title={catClosed ? t('sidebar.expandCategory') : t('sidebar.collapseCategory')}
                    >
                      <span className="flex items-center gap-1 text-white/55 text-[11px] font-medium tracking-wide">
                        <Icon name="chevronDown" size={11} className={`transition-transform duration-200 ${catClosed ? '-rotate-90' : ''}`} />
                        {cat}
                      </span>
                      <span className="text-white/35 text-[10px] tabular-nums">{list.length}</span>
                    </button>
                    {!catClosed ? (
                      <div className="flex flex-wrap gap-1.5 mt-1 animate-fadeIn-fast">
                        {show.map((t) => {
                          const sel = selected.has(t.tag)
                          const zero = t.count === 0 && !sel
                          return (
                            <button
                              key={t.tag}
                              onClick={() => onToggle(t.tag)}
                              disabled={zero}
                              className={`h-6 px-1.5 rounded-md text-[11px] flex items-center gap-1 transition-all max-w-full ${
                                sel ? 'bg-brand text-white shadow-sm shadow-brand/30 font-medium ring-brand/50' : zero ? 'bg-white/3 text-white/30 cursor-not-allowed ring-white/5' : 'bg-white/6 hover:bg-white/12 text-white/75 hover:text-white ring-white/10'
                              }`}
                              title={t.tag}
                            >
                              {sel ? <Icon name="check" size={10} className="shrink-0" /> : null}
                              <span className="max-w-[72px] truncate">{t.tag}</span>
                              <span className={sel ? 'opacity-75 text-[10px]' : 'opacity-50 text-[10px]'}>{t.count}</span>
                            </button>
                          )
                        })}
                        {list.length > PER_CAT_LIMIT ? (
                          <button onClick={() => setExpanded((p) => ({ ...p, [cat]: !p[cat] }))} className="h-6 px-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-white/50">
                            {isExpanded ? t('sidebar.collapse') : `+${list.length - PER_CAT_LIMIT}`}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              </div>
            </div>
          ) : null}

          {/* 主演 / 制片公司 / 系列 */}
          {filterTab === 'meta' ? (
            <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-auto thin-scroll -mr-1 pr-1">
              <FacetGroup title={t('sidebar.starring')} icon="users" facets={actorFacets} selected={selectedActors} onToggle={onToggleActor} onClear={onClearActors} />
              <FacetGroup title={t('sidebar.studio')} icon="building" facets={studioFacets} selected={selectedStudios} onToggle={onToggleStudio} onClear={onClearStudios} />
              <FacetGroup title={t('sidebar.series')} icon="layers" facets={seriesFacets} selected={selectedSeries} onToggle={onToggleSeries} onClear={onClearSeries} />
            </div>
          ) : null}

          {/* 技术规格 */}
          {filterTab === 'tech' ? (
            <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-auto thin-scroll -mr-1 pr-1">
              <FacetGroup title={t('sidebar.resolution')} icon="monitor" facets={resolutionFacets} selected={selectedResolutions} onToggle={onToggleResolution} onClear={onClearResolutions} />
              <FacetGroup title={t('sidebar.duration')} icon="clock" facets={durationFacets} selected={selectedDurations} onToggle={onToggleDuration} onClear={onClearDurations} />
              <FacetGroup title={t('sidebar.score')} icon="star" facets={scoreFacets} selected={selectedScores} onToggle={onToggleScore} onClear={onClearScores} />
            </div>
          ) : null}

          {/* 年份 */}
          {filterTab === 'year' ? (
            <FacetGroup title={t('sidebar.year')} icon="calendar" facets={yearFacets} selected={selectedYears} onToggle={onToggleYear} onClear={onClearYears} />
          ) : null}
        </Section>
        {/* 我的清单（用户主动创建的视图） */}
        <Section title={t('sidebar.myLists')} icon="heart" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            <NavItem icon="heart" label={t('sidebar.favorites')} badge={favoriteCount} active={view === 'browse' && smart === 'favorite'} onClick={() => onNav('browse', 'favorite')} />
            <NavItem icon="clock" label={t('sidebar.recentPlayed')} badge={recentCount} active={view === 'browse' && smart === 'recent'} onClick={() => onNav('browse', 'recent')} />
          </div>
        </Section>


        {/* 播放列表 */}
        <Section title="播放列表" icon="list" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            {playlists.map((pl) => (
              editingPlaylistId === pl.id ? (
                <div key={pl.id} className="flex items-center gap-1.5 px-2 py-1.5">
                  <input
                    className="flex-1 bg-ink-700 text-white text-sm rounded-md px-2 py-1.5 outline-none placeholder:text-white/30 ring-1 ring-brand/50"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') handleRenamePlaylist(pl.id, editingName)
                      if (e.key === 'Escape') setEditingPlaylistId(null)
                    }}
                    onBlur={() => handleRenamePlaylist(pl.id, editingName)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <div
                  key={pl.id}
                  className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[13px] transition-colors ${activePlaylistId === pl.id ? 'bg-brand/15 text-brand' : 'text-white/70 hover:text-white hover:bg-ink-700'}`}
                  onClick={() => onSelectPlaylist(activePlaylistId === pl.id ? null : pl.id)}
                >
                  <Icon name="list" size={15} className="shrink-0" />
                  <span className="flex-1 truncate">{pl.name}</span>
                  <span className="text-white/30 text-xs">{pl.videoIds.length}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-all"
                    onClick={(e) => { e.stopPropagation(); setEditingPlaylistId(pl.id); setEditingName(pl.name) }}
                    title="重命名"
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 transition-all"
                    onClick={(e) => { e.stopPropagation(); onDeletePlaylist(pl.id) }}
                    title="删除列表"
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              )
            ))}
            {creatingPlaylist ? (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <input
                  key={playlistInputKey}
                  ref={playlistInputRef}
                  className="flex-1 bg-ink-700 text-white text-sm rounded-md px-2 py-1.5 outline-none placeholder:text-white/30 ring-1 ring-brand/50"
                  placeholder="播放列表名称，回车创建"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      const name = playlistInputRef.current?.value.trim()
                      if (name) onCreatePlaylist(name)
                      setCreatingPlaylist(false)
                    }
                    if (e.key === 'Escape') setCreatingPlaylist(false)
                  }}
                />
              </div>
            ) : (
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/45 hover:text-white hover:bg-ink-700 transition-colors"
                onClick={(e) => { e.stopPropagation(); setPlaylistInputKey((k) => k + 1); setCreatingPlaylist(true) }}
              >
                <Icon name="plus" size={15} />
                <span>新建播放列表</span>
              </button>
            )}
          </div>
        </Section>

        <Section title={t('sidebar.pending')} icon="alert" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            <NavItem
              icon="alert"
              label={t('sidebar.untracked')}
              badge={unlistedCount}
              alert={unlistedCount > 0}
              active={view === 'browse' && smart === 'unlisted'}
              onClick={() => onNav('browse', 'unlisted')}
            />
            <NavItem icon="star" label={t('sidebar.unrated')} badge={unratedCount} active={view === 'browse' && smart === 'unrated'} onClick={() => onNav('browse', 'unrated')} />
            <NavItem icon="image" label={t('sidebar.noPoster')} badge={nocoverCount} active={view === 'browse' && smart === 'nocover'} onClick={() => onNav('browse', 'nocover')} />
          </div>
        </Section>

      </div>

      {/* 底部固定：统计 / 关于 / 设置 */}
      <div className="shrink-0 border-t border-white/5 px-2 py-2 flex items-center gap-1.5">
        <button className="flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 bg-ink-700 hover:bg-ink-600 text-white/80 text-xs font-medium transition-colors" onClick={onOpenStats} title={t('sidebar.statsPanel')}>
          <Icon name="chart" size={14} />
          {t('sidebar.stats')}
        </button>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center bg-ink-700 hover:bg-ink-600 text-white/80 transition-colors" onClick={onOpenAbout} title={t('sidebar.about')}>
          <Icon name="info" size={14} />
        </button>
        <button className="relative w-8 h-8 rounded-lg flex items-center justify-center bg-ink-700 hover:bg-ink-600 text-white/80 transition-colors" onClick={onOpenSettings} title={t('sidebar.settings')}>
          <Icon name="sliders" size={14} />
          {pendingUpdate ? (
            <span
              className={`absolute top-0.5 right-0.5 h-2 w-2 rounded-full ${
                pendingUpdate.urgency === 'mandatory'
                  ? 'bg-red-500'
                  : pendingUpdate.urgency === 'critical'
                    ? 'bg-amber-500'
                    : pendingUpdate.urgency === 'recommended'
                      ? 'bg-sky-400'
                      : 'bg-emerald-400'
              }`}
              title={t('sidebar.newVersionAvailable', { version: pendingUpdate.version, urgency: pendingUpdate.urgency ? ` · ${pendingUpdate.urgency}` : '' })}
            />
          ) : null}
        </button>
      </div>
    </aside>
  )
}

export default memo(SidebarInner)
