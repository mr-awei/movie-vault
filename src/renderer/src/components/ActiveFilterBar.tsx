import { useFilterStore } from '../store'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

type Setter = (updater: (prev: Set<string>) => Set<string>) => void

function toggleIn(set: Setter, v: string) {
  set((prev) => {
    const n = new Set(prev)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  })
}

/**
 * 活跃筛选条：多维筛选可视化，可单独移除（原内联于 App.tsx，迁移自 useFilterStore）
 */
export default function ActiveFilterBar() {
  const selectedActors = useFilterStore((s) => s.selectedActors)
  const selectedStudios = useFilterStore((s) => s.selectedStudios)
  const selectedSeries = useFilterStore((s) => s.selectedSeries)
  const selectedGenres = useFilterStore((s) => s.selectedGenres)
  const selectedResolutions = useFilterStore((s) => s.selectedResolutions)
  const selectedDurations = useFilterStore((s) => s.selectedDurations)
  const selectedScores = useFilterStore((s) => s.selectedScores)
  const selectedYears = useFilterStore((s) => s.selectedYears)
  const setSelectedActors = useFilterStore((s) => s.setSelectedActors)
  const setSelectedStudios = useFilterStore((s) => s.setSelectedStudios)
  const setSelectedSeries = useFilterStore((s) => s.setSelectedSeries)
  const setSelectedGenres = useFilterStore((s) => s.setSelectedGenres)
  const setSelectedResolutions = useFilterStore((s) => s.setSelectedResolutions)
  const setSelectedDurations = useFilterStore((s) => s.setSelectedDurations)
  const setSelectedScores = useFilterStore((s) => s.setSelectedScores)
  const setSelectedYears = useFilterStore((s) => s.setSelectedYears)

  const total =
    selectedActors.size +
    selectedStudios.size +
    selectedSeries.size +
    selectedGenres.size +
    selectedResolutions.size +
    selectedDurations.size +
    selectedScores.size +
    selectedYears.size

  if (total === 0) return null

  const chip = (cls: string, label: string, v: string, set: Setter) => (
    <button
      key={v}
      onClick={() => toggleIn(set, v)}
      className={`h-6 px-2 rounded-md text-[11px] flex items-center gap-1 ${cls} transition-colors`}
    >
      {label}
      <Icon name="x" size={11} className="opacity-70" />
    </button>
  )

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 animate-fadeIn-fast">
      <span className="text-white/40 text-xs">{t('app.filterLabel')}</span>
      {[...selectedActors].map((a) => chip('bg-brand/15 text-brand ring-1 ring-brand/30 hover:bg-brand/25', t('app.cast') + a, a, setSelectedActors))}
      {[...selectedStudios].map((s) => chip('bg-brand/15 text-brand ring-1 ring-brand/30 hover:bg-brand/25', t('app.studioLabel') + s, s, setSelectedStudios))}
      {[...selectedSeries].map((s) => chip('bg-brand/15 text-brand ring-1 ring-brand/30 hover:bg-brand/25', t('app.seriesLabel') + s, s, setSelectedSeries))}
      {[...selectedResolutions].map((r) => chip('bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25', t('app.resolutionLabel') + r, r, setSelectedResolutions))}
      {[...selectedDurations].map((d) => chip('bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25', t('app.durationLabel') + d, d, setSelectedDurations))}
      {[...selectedScores].map((sc) => chip('bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25', t('app.scoreLabel') + sc, sc, setSelectedScores))}
      {[...selectedYears].map((y) => chip('bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25', t('app.yearLabel') + y, y, setSelectedYears))}
      <button
        onClick={() => {
          setSelectedActors(new Set())
          setSelectedStudios(new Set())
          setSelectedSeries(new Set())
          setSelectedGenres(new Set())
          setSelectedResolutions(new Set())
          setSelectedDurations(new Set())
          setSelectedScores(new Set())
          setSelectedYears(new Set())
        }}
        className="h-6 px-2 rounded-md text-[11px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
      >
        {t('app.clearAll')}
      </button>
    </div>
  )
}
