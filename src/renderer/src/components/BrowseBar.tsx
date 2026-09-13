import type { SortKey, ViewMode } from '../../../shared/types'
import Icon from './Icon'
import type { SmartFilter } from './Sidebar'
import { t } from '../../../shared/i18n'

interface Props {
  libraryName?: string
  categoryLabel: string | null
  smart: SmartFilter
  onSmart: (s: SmartFilter) => void
  resultCount: number
  sort: SortKey
  onSort: (s: SortKey) => void
  desc: boolean
  onToggleDesc: () => void
  groupMode: 'grouped' | 'flat'
  onToggleGroup: () => void
  viewMode: ViewMode
  onSetView: (m: ViewMode) => void
  onClearAll: () => void
  hasActiveFilters: boolean
  mismatch?: { missing: number; unlisted: number } | null
  onShowReconcile: () => void
  /** v2.7.x：多选批量锁定模式 */
  selectMode?: boolean
  selectedCount?: number
  onToggleSelectMode?: () => void
}

export default function BrowseBar(props: Props) {
  const {
    libraryName, categoryLabel, smart, onSmart, resultCount,
    sort, onSort, desc, onToggleDesc, groupMode, onToggleGroup,
    viewMode, onSetView, onClearAll, hasActiveFilters, mismatch, onShowReconcile,
    selectMode = false, selectedCount = 0, onToggleSelectMode
  } = props

  const sortLabels: Record<SortKey, string> = {
    added: t('settings.sort.added'),
    title: t('settings.sort.title'),
    year: t('settings.sort.year'),
    score: t('settings.sort.score'),
    lastPlayed: t('settings.sort.lastPlayed'),
    random: t('settings.sort.random')
  }

  const smarts: { key: SmartFilter; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { key: 'all', label: t('browse.smartAll'), icon: 'grid' },
    { key: 'favorite', label: t('sidebar.favorites'), icon: 'heart' },
    { key: 'recent', label: t('sidebar.recentPlayed'), icon: 'clock' },
    { key: 'unrated', label: t('sidebar.unrated'), icon: 'alert' },
    { key: 'nocover', label: t('sidebar.noPoster'), icon: 'image' },
    { key: 'unlisted', label: t('sidebar.untracked'), icon: 'alert' }
  ]

  const crumbs: string[] = []
  if (libraryName) crumbs.push(libraryName)
  if (categoryLabel) crumbs.push(categoryLabel)
  const smartLabel = smarts.find((s) => s.key === smart)?.label
  if (smart !== 'all' && smartLabel && !categoryLabel) crumbs.push(smartLabel)

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {/* 面包屑 */}
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.length === 0 ? (
          <span className="text-white/70 font-medium">{t('browse.allVideos')}</span>
        ) : (
          crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 ? <Icon name="chevronRight" size={13} className="text-white/30 shrink-0" /> : null}
              <span className={i === crumbs.length - 1 ? 'text-white font-medium truncate' : 'text-white/45 truncate'}>
                {c}
              </span>
            </span>
          ))
        )}
        <span className="text-white/35 text-xs tabular-nums ml-1">· {resultCount} {t('browse.unit')}</span>
        {mismatch ? (
          <button
            className="ml-2 h-6 px-2 rounded-md flex items-center gap-1 bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 text-[11px] font-medium hover:bg-amber-500/25 transition-colors"
            onClick={onShowReconcile}
            title={t('browse.descriptionMismatch')}
          >
            <Icon name="alert" size={11} />
            {mismatch.missing + mismatch.unlisted} {t('browse.differenceCount')}
          </button>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* 快捷过滤 chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {smarts.map((s) => {
          const active = smart === s.key
          return (
            <button
              key={s.key}
              onClick={() => onSmart(s.key)}
              className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors ${
                active
                  ? s.key === 'favorite'
                    ? 'bg-brand text-white'
                    : s.key === 'unlisted'
                      ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                      : 'bg-ink-700 text-white ring-1 ring-white/15'
                  : 'bg-ink-800/60 hover:bg-ink-700 text-white/70'
              }`}
              title={s.label}
            >
              <Icon name={s.icon} size={12} className={active ? 'fill-current' : ''} />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* 排序 */}
      <select
        className="h-8 bg-ink-700 text-white text-sm rounded-lg px-2 outline-none ring-1 ring-transparent focus:ring-brand/50 cursor-pointer"
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        title={t('browse.sortMethod')}
      >
        {(Object.keys(sortLabels) as SortKey[]).map((k) => (
          <option key={k} value={k}>
            {sortLabels[k]}
          </option>
        ))}
      </select>
      <button
        className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
          desc ? 'bg-brand/20 text-brand' : 'bg-ink-700 hover:bg-ink-600 text-white/70'
        }`}
        onClick={onToggleDesc}
        title={desc ? t('browse.descToggle') : t('browse.ascToggle')}
      >
        <Icon name="sort" size={14} />
      </button>

      {/* 分组 / 视图 */}
      <button
        className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors ${
          groupMode === 'flat' ? 'bg-brand/15 text-brand ring-1 ring-brand/40' : 'bg-ink-700 hover:bg-ink-600 text-white/70'
        }`}
        onClick={onToggleGroup}
        title={groupMode === 'flat' ? t('browse.mixedMode') : t('browse.groupMode')}
      >
        <Icon name={groupMode === 'flat' ? 'list' : 'layers'} size={13} />
        {groupMode === 'flat' ? t('browse.all') : t('browse.group')}
      </button>
      {/* 多选：开启后可批量锁定/解锁 */}
      {onToggleSelectMode ? (
        <button
          className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors ${
            selectMode
              ? 'bg-brand text-white'
              : 'bg-ink-700 hover:bg-ink-600 text-white/70'
          }`}
          onClick={onToggleSelectMode}
          title={selectMode ? t('lock.exitSelect') : t('lock.enterSelect')}
        >
          <Icon name="check" size={13} />
          {selectMode ? t('lock.selectedCount', { count: selectedCount }) : t('lock.selectMode')}
        </button>
      ) : null}

      {/* 视图模式：竖屏预览墙 / 横屏预览墙 / 纯文件名列表 */}
      <div className="inline-flex p-0.5 bg-ink-900/50 border border-white/10 rounded-lg">
        {(
          [
            { value: 'grid-portrait' as ViewMode, icon: 'grid' as Parameters<typeof Icon>[0]['name'], label: t('browse.vertical') },
            { value: 'grid-landscape' as ViewMode, icon: 'film' as Parameters<typeof Icon>[0]['name'], label: t('browse.horizontal') },
            { value: 'list-filename' as ViewMode, icon: 'list' as Parameters<typeof Icon>[0]['name'], label: t('browse.fileName') }
          ]
        ).map((o) => (
          <button
            key={o.value}
            className={`h-7 px-2 rounded-md flex items-center gap-1 text-xs font-medium transition-colors ${
              viewMode === o.value ? 'bg-brand text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
            onClick={() => onSetView(o.value)}
            title={o.label}
          >
            <Icon name={o.icon} size={13} />
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        ))}
      </div>

      {hasActiveFilters ? (
        <button
          className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors"
          onClick={onClearAll}
          title={t('browse.clearFilterAll')}
        >
          <Icon name="x" size={12} />
          {t('browse.clearFilter')}
        </button>
      ) : null}
    </div>
  )
}
