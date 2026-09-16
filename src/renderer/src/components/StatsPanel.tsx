import { useEffect, useMemo } from 'react'
import type { DisplayEntry, ReconcileResult } from '../../../shared/types'
import { entryPrimaryTags, hasDocTags } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import Icon from './Icon'

interface Props {
  open: boolean
  result: ReconcileResult
  onClose: () => void
  /** 点击 Top 大文件跳转详情页 */
  onOpen?: (entry: DisplayEntry) => void
}

/** 解析 数据源 时长字符串为秒（"120分钟" / "2小时30分钟" / "2:00:00"） */
function parseDuration(str?: string): number | null {
  if (!str) return null
  let sec = 0
  let found = false
  const hms = str.match(/(\d+):(\d+):(\d+)/)
  const h = str.match(/(\d+)\s*小时/)
  const m = str.match(/(\d+)\s*分钟/)
  if (hms) {
    sec += Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
    found = true
  }
  if (h) {
    sec += Number(h[1]) * 3600
    found = true
  }
  if (m) {
    sec += Number(m[1]) * 60
    found = true
  }
  return found ? sec : null
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h >= 24) return `${(h / 24).toFixed(1)}${t('stats.daysUnit')}`
  if (h > 0) return `${h}${t('stats.hoursUnit')}${m}${t('stats.minsUnit')}`
  return `${m}${t('stats.minsUnit')}`
}

/** 字节数 → 可读大小（B/KB/MB/GB/TB） */
function fmtBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** 分辨率分桶（与首页筛选一致）：基于视频高/宽像素 */
function resolutionBucket(v?: { techInfo?: { width?: number; height?: number } }): string {
  const h = v?.techInfo?.height ?? 0
  const w = v?.techInfo?.width ?? 0
  const px = Math.max(h, w)
  if (px >= 3840) return '4K'
  if (px >= 2560) return '2K'
  if (px >= 1920) return '1080p'
  if (px >= 1280) return '720p'
  if (px >= 640) return '480p'
  if (px > 0) return 'SD'
  return '未知'
}

/** 字节条形（宽度 ∝ 字节，右侧显示可读大小） */
function ByteBar({ label, bytes, max }: { label: string; bytes: number; max: number }) {
  const pct = max > 0 ? Math.round((bytes / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <span className="w-24 shrink-0 text-white/55 truncate text-right" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-[#ff9db6]"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-white/80 tabular-nums text-right">{fmtBytes(bytes)}</span>
    </div>
  )
}

const RATING_BUCKETS = [
  { label: '0-5', min: 0, max: 5 },
  { label: '5-6', min: 5, max: 6 },
  { label: '6-7', min: 6, max: 7 },
  { label: '7-8', min: 7, max: 8 },
  { label: '8-9', min: 8, max: 9 },
  { label: '9-10', min: 9, max: 10.01 }
]

function Bar({
  label,
  count,
  max,
  align = 'right'
}: {
  label: string
  count: number
  max: number
  align?: 'right' | 'left'
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <span
        className={`w-24 shrink-0 text-white/55 truncate ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-[#ff9db6]"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-white/75 tabular-nums text-right">{count}</span>
    </div>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-ink-800/50 ring-1 ring-white/5 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-white/80 font-semibold text-sm flex items-center gap-1.5">
          {title}
        </div>
        {hint ? <div className="text-white/30 text-[10px]">{hint}</div> : null}
      </div>
      {children}
    </div>
  )
}

export default function StatsPanel({ open, result, onClose, onOpen }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  const stats = useMemo(() => {
    const entries = result.entries
    const withVideo = entries.filter((e) => e.video)
    const total = withVideo.length

    let totalSec = 0
    for (const e of withVideo) {
      const v = e.video!
      totalSec += v.techInfo?.durationSec ?? parseDuration(v.meta?.duration) ?? 0
    }

    const scored = entries.filter((e) => typeof e.score === 'number')
    const avgScore = scored.length
      ? scored.reduce((s, e) => s + (e.score ?? 0), 0) / scored.length
      : 0

    const ratingDist = RATING_BUCKETS.map((b) => ({
      label: b.label,
      count: scored.filter((e) => {
        const s = e.score ?? 0
        return s >= b.min && s < b.max
      }).length
    }))

    const actorCount = new Map<string, number>()
    for (const e of withVideo) {
      for (const a of e.video?.meta?.actors ?? []) {
        actorCount.set(a, (actorCount.get(a) ?? 0) + 1)
      }
    }
    const topActors = [...actorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

    const yearCount = new Map<number, number>()
    for (const e of withVideo) {
      const y = e.video?.year
      if (y) yearCount.set(y, (yearCount.get(y) ?? 0) + 1)
    }
    const years = [...yearCount.entries()].sort((a, b) => a[0] - b[0])

    const catCount = new Map<string, number>()
    for (const e of entries) {
      catCount.set(e.category, (catCount.get(e.category) ?? 0) + 1)
    }
    const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1])

    const tagCount = new Map<string, number>()
    for (const e of entries) {
      // v2.2.13 标签分层：统计项仅考虑「文档主标签」，
      // 无文档标签时才把 backupTags 纳入（与 UI 选主策略对齐）
      const primary = entryPrimaryTags(e)
      const back = e.video?.backupTags ?? []
      const countArr = hasDocTags({ tags: e.tags, tagCategories: e.tagCategories }) ? primary : [...new Set([...primary, ...back])]
      for (const t of countArr) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
    }
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

    // 文件大小统计
    const sized = withVideo.filter((e) => e.video?.fileSize && e.video?.fileSize > 0)
    const totalBytes = sized.reduce((sum, e) => sum + (e.video?.fileSize ?? 0), 0)
    const topFiles = [...sized]
      .sort((a, b) => (b.video!.fileSize ?? 0) - (a.video!.fileSize ?? 0))
      .slice(0, 10)
      .map((e) => ({ entry: e, size: e.video?.fileSize ?? 0 }))

    // 磁盘占用：按分类 / 年份 聚合字节
    const diskByCatMap = new Map<string, number>()
    const diskByYearMap = new Map<string, number>()
    const resCountMap = new Map<string, number>()
    for (const e of withVideo) {
      const sz = e.video?.fileSize ?? 0
      if (sz > 0) {
        diskByCatMap.set(e.category, (diskByCatMap.get(e.category) ?? 0) + sz)
        const y = e.video?.year
        if (y) diskByYearMap.set(String(y), (diskByYearMap.get(String(y)) ?? 0) + sz)
      }
      const rb = resolutionBucket(e.video)
      resCountMap.set(rb, (resCountMap.get(rb) ?? 0) + 1)
    }
    const diskByCat = [...diskByCatMap.entries()].sort((a, b) => b[1] - a[1])
    const diskByYear = [...diskByYearMap.entries()]
      .sort((a, b) => (a[0] === '未知' ? 1 : b[0] === '未知' ? -1 : Number(b[0]) - Number(a[0])))
    const resCount = ['4K', '2K', '1080p', '720p', '480p', 'SD', '未知']
      .filter((k) => (resCountMap.get(k) ?? 0) > 0)
      .map((k) => ({ label: k === '未知' ? t('app.unknown') : k, count: resCountMap.get(k)! }))

    return {
      total,
      totalSec,
      avgScore,
      scoredCount: scored.length,
      ratingDist,
      topActors,
      years,
      cats,
      topTags,
      totalBytes,
      sizedCount: sized.length,
      topFiles,
      diskByCat,
      diskByYear,
      resCount
    }
  }, [result])

  if (!open) return null

  const maxRating = Math.max(1, ...stats.ratingDist.map((x) => x.count))
  const maxActor = Math.max(1, ...stats.topActors.map((x) => x[1]))
  const maxYear = Math.max(1, ...stats.years.map((x) => x[1]))
  const maxCat = Math.max(1, ...stats.cats.map((x) => x[1]))
  const maxTag = Math.max(1, ...stats.topTags.map((x) => x[1]))
  const maxDiskCat = Math.max(1, ...stats.diskByCat.map((x) => x[1]))
  const maxDiskYear = Math.max(1, ...stats.diskByYear.map((x) => x[1]))
  const maxRes = Math.max(1, ...stats.resCount.map((x) => x.count))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[86vh] overflow-auto thin-scroll bg-ink-900 ring-1 ring-white/10 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-ink-900/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Icon name="chart" size={16} className="text-brand" />
            {t('stats.title')}
          </div>
          <button
            className="no-drag w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
            onClick={onClose}
            title={t('close')}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 概览卡片 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-ink-800/50 ring-1 ring-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white tabular-nums">{stats.total}</div>
              <div className="text-white/45 text-xs mt-1">{t('stats.totalVideos')}</div>
            </div>
            <div className="bg-ink-800/50 ring-1 ring-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white tabular-nums">
                {stats.totalSec > 0 ? fmtDuration(stats.totalSec) : '—'}
              </div>
              <div className="text-white/45 text-xs mt-1">{t('stats.totalDuration')}</div>
            </div>
            <div className="bg-ink-800/50 ring-1 ring-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand tabular-nums">
                {stats.totalBytes > 0 ? fmtBytes(stats.totalBytes) : '—'}
              </div>
              <div className="text-white/45 text-xs mt-1">
                {t('stats.totalSize', { count: stats.sizedCount })}
              </div>
            </div>
            <div className="bg-ink-800/50 ring-1 ring-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand tabular-nums">
                {stats.scoredCount ? stats.avgScore.toFixed(2) : '—'}
              </div>
              <div className="text-white/45 text-xs mt-1">
                {t('stats.avgScore', { count: stats.scoredCount })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title={t('stats.scoreDist')}>
              {stats.ratingDist.map((b) => (
                <Bar key={b.label} label={b.label} count={b.count} max={maxRating} />
              ))}
            </Section>

            <Section title={t('stats.categoryShare')}>
              {stats.cats.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noCategory')}</div>
              ) : (
                stats.cats.map(([name, c]) => (
                  <Bar key={name} label={name} count={c} max={maxCat} />
                ))
              )}
            </Section>

            <Section title={t('stats.castTop10')}>
              {stats.topActors.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noCast')}</div>
              ) : (
                stats.topActors.map(([name, c]) => (
                  <Bar key={name} label={name} count={c} max={maxActor} />
                ))
              )}
            </Section>

            <Section title={t('stats.tagTop10')}>
              {stats.topTags.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noTag')}</div>
              ) : (
                stats.topTags.map(([name, c]) => (
                  <Bar key={name} label={name} count={c} max={maxTag} />
                ))
              )}
            </Section>

            <Section title={t('stats.largestFiles')} hint={stats.sizedCount ? t('stats.probedFilesHint', { count: stats.sizedCount }) : t('stats.probeHint')}>
              {stats.topFiles.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noFileSize')}</div>
              ) : (
                <div className="space-y-1">
                  {stats.topFiles.map(({ entry, size }, i) => (
                    <button
                      key={entry.video!.id}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left transition-colors group"
                      onClick={() => onOpen?.(entry)}
                      title={t('stats.clickView', { title: entry.title })}
                    >
                      <span className="w-5 shrink-0 text-center text-xs font-bold text-white/30">
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-[13px] text-white/85 group-hover:text-brand">
                        {entry.title}
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-brand/90 tabular-nums">
                        {fmtBytes(size)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Section>

            <Section title={t('stats.yearDist', { count: stats.years.length })}>
              {stats.years.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noYear')}</div>
              ) : (
                stats.years.map(([y, c]) => (
                  <Bar key={y} label={String(y)} count={c} max={maxYear} />
                ))
              )}
            </Section>

            <Section title={t('stats.diskByCategory')} hint={stats.sizedCount ? t('stats.probedFilesHint', { count: stats.sizedCount }) : t('stats.probeHintShort')}>
              {stats.diskByCat.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noFileSize')}</div>
              ) : (
                stats.diskByCat.map(([name, bytes]) => (
                  <ByteBar key={name} label={name} bytes={bytes} max={maxDiskCat} />
                ))
              )}
            </Section>

            <Section title={t('stats.diskByYear')}>
              {stats.diskByYear.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noYearOrSize')}</div>
              ) : (
                stats.diskByYear.map(([y, bytes]) => (
                  <ByteBar key={y} label={y} bytes={bytes} max={maxDiskYear} />
                ))
              )}
            </Section>

            <Section title={t('stats.resolutionDist')} hint={t('stats.needResolutionProbe')}>
              {stats.resCount.length === 0 ? (
                <div className="text-white/35 text-xs">{t('stats.noResolution')}</div>
              ) : (
                stats.resCount.map((r) => (
                  <Bar key={r.label} label={r.label} count={r.count} max={maxRes} />
                ))
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
