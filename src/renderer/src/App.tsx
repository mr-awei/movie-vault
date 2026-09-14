import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DisplayEntry,
  ImageSource,
  Library,
  ReconcileResult,
  Settings,
  SortKey,
  SourceId,
  Video,
  ViewMode
} from '../../shared/types'
import { DEFAULT_IMAGE_PRIORITY, DEFAULT_SETTINGS, entryPrimaryTags, flattenAllTags, hasDocTags } from '../../shared/types'
import { displayTitle } from './lib/util'
import { categorizeTag } from '../../shared/tagCategories'
import { api } from './lib/api'
import { t, setLocale } from '../../shared/i18n'
import Toolbar from './components/Toolbar'
import Sidebar, { type TagInfo, type SectionInfo, type MetaFacet, type ViewName, type SmartFilter } from './components/Sidebar'
import VirtualizedWall, { type WallSection } from './components/VirtualizedWall'
import ReconcileDialog from './components/ReconcileDialog'
import LibraryModal from './components/LibraryModal'
import SettingsModal from './components/SettingsModal'
import EditMetaModal from './components/EditMetaModal'
import VideoDetail from './components/VideoDetail'
import StatsPanel from './components/StatsPanel'
import AboutModal from './components/AboutModal'
import LicenseModal from './components/LicenseModal'
import HomeView from './components/HomeView'
import HomeSkeleton from './components/HomeSkeleton'
import BrowseBar from './components/BrowseBar'
import ListView from './components/ListView'
import Icon from './components/Icon'
import { ToastProvider, toast } from './components/Toast'
import ConfirmDeleteModal, { type DeletePreview } from './components/ConfirmDeleteModal'
import UserNoticeModal from './components/UserNoticeModal'
import OnboardSheetModal from './components/OnboardSheetModal'
import type { AppInfo } from '../../shared/api-types'

interface FilterState {
  search: string
  sort: SortKey
  desc: boolean
  /** 分组模式：grouped 按 Excel 分类分组 / flat 全库单网格（适用于所有排序） */
  groupMode: 'grouped' | 'flat'
  /** 当前选中的分类（点击侧栏分类切换；null = 全部） */
  category: string | null
}

/** Fisher-Yates 洗牌（默认用 Math.random，保证每次重建队列都不同；可传入 rand 做可复现） */
function shuffleEntries<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- 多维筛选：连续维度离散化（分辨率 / 时长 / 评分） ----
function resolutionBucket(v?: Video): string {
  const h = v?.techInfo?.height ?? 0
  const w = v?.techInfo?.width ?? 0
  const px = Math.max(h, w)
  if (px >= 3840) return '4K'
  if (px >= 2560) return '2K'
  if (px >= 1920) return '1080p'
  if (px >= 1280) return '720p'
  if (px >= 640) return '480p'
  if (px > 0) return 'SD'
  return t('app.unknown')
}
function durationBucket(sec?: number): string {
  if (!sec || sec <= 0) return t('app.unknown')
  if (sec < 1800) return t('app.within30min')
  if (sec < 3600) return t('app.duration30to60')
  if (sec < 7200) return t('app.duration1to2h')
  if (sec < 10800) return t('app.duration2to3h')
  return t('app.over3h')
}
function scoreBucketOf(e: DisplayEntry): string {
  const s = e.score ?? e.video?.rating
  if (s == null) return t('app.unrated')
  if (s >= 9) return '9-10'
  if (s >= 8) return '8-9'
  if (s >= 7) return '7-8'
  if (s >= 6) return '6-7'
  return t('app.below6')
}
const RES_ORDER = ['4K', '2K', '1080p', '720p', '480p', 'SD', '未知']
const DUR_ORDER = ['30分钟内', '30-60分', '1-2小时', '2-3小时', '3小时以上', '未知']
const SCORE_ORDER = ['9-10', '8-9', '7-8', '6-7', '6以下', '未评分']

export default function App() {
  const [libraries, setLibraries] = useState<Library[]>([])
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [libraryId, setLibraryId] = useState('')
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null)
  const [filter, setFilter] = useState<FilterState>({
    search: '',
    sort: 'title',
    desc: false,
    groupMode: 'flat' as 'grouped' | 'flat',
    category: null
  })
  /** 搜索输入框的值（立即更新 UI）；实际过滤用防抖后的 filter.search */
  const [searchInput, setSearchInput] = useState('')
  /** 多选标签 AND 过滤（侧栏交互） */
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  // v2.3.2 类别（genre）筛选：从 meta.genres 提取单标签，独立于「分类」
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set())
  /** 演员 / 制片公司 / 系列 维度筛选（各维度内 OR，跨维度 AND；点击详情页字段触发） */
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set())
  const [selectedStudios, setSelectedStudios] = useState<Set<string>>(new Set())
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(new Set())
  /** 技术规格 / 时间 维度筛选（分辨率 / 时长 / 评分 / 年份），各维度内 OR、跨维度 AND */
  const [selectedResolutions, setSelectedResolutions] = useState<Set<string>>(new Set())
  const [selectedDurations, setSelectedDurations] = useState<Set<string>>(new Set())
  const [selectedScores, setSelectedScores] = useState<Set<string>>(new Set())
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set())
  const [statsOpen, setStatsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  /** 用户须知弹窗：首次启动（noticeDismissed 未设置/为 false）时强制弹出 */
  const [noticeOpen, setNoticeOpen] = useState(false)
  /** true = 「{t('app.addLibrary')}」新建表单；false = 库设置编辑模式 */
  const [addingLibrary, setAddingLibrary] = useState(false)
  const [editing, setEditing] = useState<Video | null>(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [detail, setDetail] = useState<Video | null>(null)
  /** 删除二次确认弹窗：非空时显示；保存预检结果与删除范围 */
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null)
  /** 删除执行中（防重复点击） */
  const [deleting, setDeleting] = useState(false)
  const [scanning, setScanning] = useState(false)
  // 隐私护盾：一键模糊所有预览图（防截图泄露敏感内容），持久化到 localStorage
  const [privacy, setPrivacy] = useState<boolean>(() => localStorage.getItem('vm-privacy') === '1')
  const [progress, setProgress] = useState<{ total: number; done: number; current?: string } | null>(null)
  const [fetchPaused, setFetchPaused] = useState(false)
  // v2.7.x：多选批量锁定（浏览页）
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // v2.2.10：实时抓取日志（"数据源失败 → 降级下一源" 这类过程，右下角浮层滚动展示）
  const [fetchLogs, setFetchLogs] = useState<
    Array<{ code: string; src: string; status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'; detail?: string }>
  >([])
  // v2.2.14：批量抓取失败明细弹窗（居中显示失败影片标题 + 原因）
  const [batchFailures, setBatchFailures] = useState<Array<{ id: string; title: string; reason: string }> | null>(null)
  const [batchFailuresVisible, setBatchFailuresVisible] = useState(true)
  const [retryingFailures, setRetryingFailures] = useState(false)
  /** v2.7.x：本次批量补齐自动跳过的文件明细（已锁定 / 文件不存在），结束后弹窗告知用户 */
  const [skippedFiles, setSkippedFiles] = useState<
    Array<{ id: string; title: string; reason: 'locked' | 'missing' }> | null
  >(null)

  // === 批量抓取失败明细：打开详情时藏弹窗，关详情时自动恢复 ===
  const prevDetailRef = useRef<Video | null>(null)
  useEffect(() => {
    const prev = prevDetailRef.current
    prevDetailRef.current = detail
    // detail 从有值 → null，且 batchFailures 数据还在 → 恢复弹窗
    if (prev && !detail && batchFailures && !batchFailuresVisible) {
      setBatchFailuresVisible(true)
    }
  }, [detail, batchFailures, batchFailuresVisible])

  // ---- 新增：导航 / 视图状态 ----
  /** 主导航：home 首页概览 / browse 浏览 */
  const [view, setView] = useState<ViewName>('home')
  /** 智能筛选（我的清单 / 快捷过滤） */
  const [smart, setSmart] = useState<SmartFilter>('all')
  /** 浏览视图模式：竖屏预览墙 / 横屏预览墙 / 纯文件名列表 */
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('vm-viewmode')
    if (saved === 'list') return 'list-filename'
    if (saved === 'grid') return 'grid-portrait'
    return (saved as ViewMode) || 'grid-landscape'
  })
  /** 是否已加载完基础设置（未加载前显示启动遮罩，避免锁界面闪烁泄露内容） */
  const [loaded, setLoaded] = useState(false)
  /** 隐私锁是否已{t('app.unlock')}（未上锁时恒为 true） */
  const [unlocked, setUnlocked] = useState(false)
  /** 命令面板 ⌘K */
  /** 随机推荐：手动刷新 nonce（每日刷新由种子里的日期自动驱动） */
  const [recommendNonce, setRecommendNonce] = useState(0)
  /** 全库随机（跨媒体库）：手动刷新 nonce */
  const [allRandomNonce, setAllRandomNonce] = useState(0)
  /** 所有媒体库的 reconcile 缓存（全库随机数据源；key = libraryId） */
  const [allReconciles, setAllReconciles] = useState<Record<string, ReconcileResult>>({})

  // ---- Onboard Sheet Wizard 状态 ----
  /** 新建片单 Excel 向导弹窗（introError.kind==='not-configured' 时自动弹） */
  const [onboardOpen, setOnboardOpen] = useState(false)
  const [onboardLib, setOnboardLib] = useState<Library | null>(null)
  /** 让 scanProgress 回调能拿到最新 settings.suppressIntroExcelNotice 和 libraries（空依赖 useEffect 闭包问题） */
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const librariesRef = useRef(libraries)
  librariesRef.current = libraries

  // ---- Hero 独立洗牌队列：整库全部影片入队，点一次取下一个，走完一轮自动重新洗牌 ----
  // 队列只存 video.id 列表（ref）；渲染时按最新 reconcile 实时映射 → 收藏/详情等 reconcile 更新不重建队列、顺序稳定
  const heroQueueRef = useRef<string[]>([])
  const heroBuiltLibRef = useRef<string | null>(null)
  const [heroIdx, setHeroIdx] = useState(0)
  const heroIdxRef = useRef(0)
  heroIdxRef.current = heroIdx

  useEffect(() => {
    localStorage.setItem('vm-viewmode', viewMode)
  }, [viewMode])

  const currentLibrary = useMemo(
    () => libraries.find((l) => l.id === libraryId) ?? null,
    [libraries, libraryId]
  )

  /** 跳过首次自动对账（scanOnStartup=false 时） */
  const skipFirstAutoScanRef = useRef(false)

  // 初始加载：媒体库 + 设置 + 版本号
  useEffect(() => {
    ;(async () => {
      const [libs, s, info] = await Promise.all([api.libraryList(), api.settingsGet(), api.appInfo()])
      setLibraries(libs)
      setSettings(s)
      setAppInfo(info)
      // 隐私护盾默认开（仅在用户从未手动设置过时生效）
      if (s.privacyDefaultOn && localStorage.getItem('vm-privacy') === null) setPrivacy(true)
      // 默认排序（仅当用户还没手动改过排序时应用）
      if (s.defaultSort && s.defaultSort !== 'title') {
        setFilter((f) => (f.sort === 'title' ? { ...f, sort: s.defaultSort } : f))
      }
      // 默认列表展示模式（设置页可切换；默认全库平铺）
      if (s.listViewMode) {
        setFilter((f) => ({ ...f, groupMode: s.listViewMode as 'flat' | 'grouped' }))
      }
      // 启动时自动对账开关：{t('common.close')}则跳过首次自动对账
      if (s.scanOnStartup === false) skipFirstAutoScanRef.current = true
      if (libs.length > 0) setLibraryId(libs[0].id)
      // 首次启动：用户须知未确认则强制弹窗（背景点击 / ESC 均不{t('common.close')}）
      if (!s.noticeDismissed) setNoticeOpen(true)
      // 应用保存的界面语言
      if (s.language) setLocale(s.language as 'zh-CN' | 'en-US')
      setLoaded(true)
    })()
  }, [])

  // 设置中的界面语言变化 → 立即切换（设置页保存后自动生效）
  useEffect(() => {
    if (settings.language) setLocale(settings.language as 'zh-CN' | 'en-US')
  }, [settings.language])


  // 后台轻量刷新设置：让「自动检查更新」写入的 pendingUpdate / lastUpdateCheck 自动回流到 UI（徽标、设置页横幅）
  useEffect(() => {
    const t = setInterval(() => {
      void api.settingsGet().then(setSettings).catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [])

  // 对账：选中库变化时重新对账
  useEffect(() => {
    if (!libraryId) return
    // 启动时自动对账{t('common.close')}：跳过首次自动对账（后续手动/库变化仍正常）
    if (skipFirstAutoScanRef.current) {
      skipFirstAutoScanRef.current = false
      return
    }
    let alive = true
    setScanning(true)
    // v2.2.10-fix5：先读上次对账结果缓存秒出界面（首次 walk 可能十几秒，避免一直空白
    // "正在加载媒体库…"），再发起全量对账，完成后刷新为最新结果；对账失败则保留缓存展示。
    void api
      .libraryReconcileCache(libraryId)
      .then((cached) => {
        if (!alive || !cached) return
        setReconcile(cached)
        setAllReconciles((prev) => (prev[libraryId] ? prev : { ...prev, [libraryId]: cached }))
      })
      .catch(() => {})
    api
      .libraryReconcile(libraryId)
      .then((res) => {
        if (!alive) return
        setReconcile(res)
        setAllReconciles((prev) => ({ ...prev, [libraryId]: res }))
        if (res.stats.missing > 0 || res.stats.unlisted > 0) setReconcileOpen(true)
      })
      .catch(() => {
        /* 忽略 */
      })
      .finally(() => alive && setScanning(false))
    return () => {
      alive = false
    }
  }, [libraryId])

  // 扫描进度（主进程推送）
  useEffect(() => {
    return api.onScanProgress((p) => {
      setProgress(p.total ? { total: p.total, done: p.done, current: p.current } : null)
      if (p.total && p.done === 0) setFetchPaused(false)
      // v2.2.10：实时抓取事件 → 追加到右下角抓取日志浮层（保留最近 60 条）
      const fe = (p as { fetchEvent?: { code: string; src: string; status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'; detail?: string } }).fetchEvent
      if (fe) {
        setFetchLogs((prev) => [...prev.slice(-59), fe])
      }
      // v2.2.4 硬性要求：片单加载失败必须告知用户，不能藏起问题
      // v2.3.13：kind==='not-configured' → 优先弹向导（suppressIntroExcelNotice 时静默）；
      //         其他 kind（parse-failed / auto-find-failed）仍弹 toast
      const err = (p as { introError?: { kind: string; message: string; triedPaths: string[] } }).introError
      if (err) {
        if (err.kind === 'not-configured') {
          if (!settingsRef.current.suppressIntroExcelNotice) {
            const lib = librariesRef.current.find((l) => l.id === p.libraryId)
            if (lib) {
              setOnboardLib(lib)
              setOnboardOpen(true)
            }
          }
        } else {
          const titles: Record<string, string> = {
            'parse-failed': t('app.excelParseFailed'),
            'auto-find-failed': t('app.excelAutoFindFailed')
          }
          const title = titles[err.kind] ?? t('app.excelLoadFailed')
          const tried = err.triedPaths?.length
            ? t('app.triedPathsList', { paths: err.triedPaths.map((p) => '· ' + p).join('\n') })
            : ''
          toast({
            title,
            text: err.message + tried,
            tone: 'warn',
            duration: 0
          })
        }
      }
    })
  }, [])

  // 进度条卡死保险：done===total 时 2.5s 后自动清空（处理 runReconcile 收尾时不再推事件的边界情况）
  const clearTimer = useRef<number | null>(null)
  useEffect(() => {
    if (progress && progress.total > 0 && progress.done >= progress.total) {
      if (clearTimer.current) window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => {
        setProgress(null)
        setFetchPaused(false)
        setFetchLogs([])
      }, 2500)
    }
    return () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current)
    }
  }, [progress])



  // 片单变化触发重新对账（预留：Excel 片单 watcher 可在此接入）
  const libraryIdRef = useRef(libraryId)
  useEffect(() => {
    libraryIdRef.current = libraryId
  }, [libraryId])
  // 启动时自动重扫：所有「非当前」媒体库各跑一次对账（当前库由上方 reconcile 副作用覆盖），仅刷新数据、不切换展示
  const autoRescanDone = useRef(false)
  useEffect(() => {
    if (autoRescanDone.current) return
    if (!settings.autoRescan) return
    if (libraries.length === 0) return
    autoRescanDone.current = true
    for (const l of libraries) {
      if (l.id === libraryId) continue
      void api
        .libraryReconcile(l.id)
        .then((res) => setAllReconciles((prev) => ({ ...prev, [l.id]: res })))
        .catch(() => {})
    }
  }, [settings, libraries, libraryId])

  // 首页全库随机：确保所有媒体库都有 reconcile 缓存（autoRescan 可能{t('common.close')}，这里进入首页时补齐缺失库）
  useEffect(() => {
    if (view !== 'home') return
    if (libraries.length === 0) return
    // v2.2.10-fix4：原来并发发起所有缺失库 reconcile → 多库同时 walk 扫描 + 与主对账
    // effect 并发写盘（applyVideoChanges 非原子，可能丢更新）。改串行 + 跳过当前库
    // （当前库由主对账 effect 负责），依赖不再含 allReconciles（避免 setAllReconciles 反复重跑）。
    let cancelled = false
    ;(async () => {
      for (const l of libraries) {
        if (cancelled) return
        if (l.id === libraryId) continue
        try {
          const res = await api.libraryReconcile(l.id)
          if (!cancelled) setAllReconciles((prev) => (prev[l.id] ? prev : { ...prev, [l.id]: res }))
        } catch {
          /* 单库失败不影响其他库 */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, libraries, libraryId])

  // 数据源批量抓取：每抓到一张实时刷新该卡片的封面
  useEffect(() => {
    return api.onPosterFetched(
      ({ videoId, posterPath, posterSource }: { videoId: string; posterPath: string; posterSource?: string }) => {
        setReconcile((prev) =>
          prev
            ? {
                ...prev,
                entries: prev.entries.map((e) =>
                  e.video && e.video.id === videoId
                    ? {
                        ...e,
                        video: {
                          ...e.video,
                          posterPath,
                          posterSource: (posterSource ?? 'moviedb') as ImageSource,
                          // 同上：文件内容可能已覆盖，自增版本强制列表端刷新
                          coverVersion: (e.video.coverVersion ?? 0) + 1
                        }
                      }
                    : e
                )
              }
            : prev
        )
      }
    )
  }, [])

  // 搜索防抖：输入停止 200ms 后才真正触发过滤（大库避免每敲一个字符全量过滤+重排）
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => (f.search === searchInput ? f : { ...f, search: searchInput })), 200)
    return () => clearTimeout(t)
  }, [searchInput])

  // 皮肤同步：dark（内部复用 theme-cinema 样式）/ light + 跟随系统
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const raw = settings.theme as string
      const effective =
        raw === 'system' ? (mq.matches ? 'cinema' : 'light') : raw === 'dark' ? 'cinema' : 'light'
      const root = document.documentElement
      root.classList.remove('theme-cinema', 'theme-light')
      root.classList.add(`theme-${effective}`)
      root.style.colorScheme = effective === 'light' ? 'light' : 'dark'
    }
    apply()
    if (settings.theme === 'system') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [settings.theme])


  // 第一层：仅应用搜索 + 多选 tag（不含 category 过滤）—— 用于驱动侧栏所有计数
  const applyTagsOnly = useMemo(() => {
    let list = [...(reconcile?.entries ?? [])]
    const q = filter.search.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const codeLower = e.code.toLowerCase()
        if (codeLower.includes(q)) return true
        if (e.title.toLowerCase().includes(q)) return true
        if (displayTitle(e).toLowerCase().includes(q)) return true
        if ((e.description ?? '').toLowerCase().includes(q)) return true
        // v2.2.13 标签分层：搜索扩展到「文档标签 + 备用数据源标签」，
        // 保证用户按 genres 关键词也能命中（backupTags 折叠并不代表不可搜索）
        const allTags = flattenAllTags({ tags: e.tags, tagCategories: e.tagCategories, backupTags: e.video?.backupTags })
        if (allTags.some((t) => t.toLowerCase().includes(q))) return true
        return false
      })
    }
    if (selectedTags.size > 0) {
      list = list.filter((e) => {
        // 有结构化标签时优先按结构化算「主标签」，无则回退平铺 tags；
        // 筛选命中范围 = 文档主标签 + 备用标签的并集（用户在侧栏点了数据源的 tag 也能命中）
        const primary = entryPrimaryTags(e)
        const union = new Set<string>()
        for (const t of primary) union.add(t)
        for (const t of e.video?.backupTags ?? []) union.add(t)
        for (const t of selectedTags) if (!union.has(t)) return false
        return true
      })
    }
    return list
  }, [reconcile, filter.search, selectedTags])

  // 分类集合（来自 applyTagsOnly 的结果，计数 = 再点该分类会变多少）
  const sectionList = useMemo<SectionInfo[]>(() => {
    const order: { name: string; order: number }[] = []
    const counts = new Map<string, number>()
    for (const e of applyTagsOnly) {
      if (!counts.has(e.category)) order.push({ name: e.category, order: e.order })
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
    }
    return order
      .map((s) => ({ name: s.name, order: s.order, count: counts.get(s.name) ?? 0 }))
      .sort((a, b) => a.order - b.order)
  }, [applyTagsOnly])

  // 标签集合：文档结构化分类优先，e.tags/backupTags 中未归属者走内置字典兜底归类；
  // 类别顺序按文档 tagCategories 首次出现排列，之后 push 其他 +「其他」
  const { categories: tagCategoriesOrder, tags } = useMemo<{ categories: string[]; tags: TagInfo[] }>(() => {
    const counts = new Map<string, { count: number; category: string }>()
    const catOrder: string[] = []
    const ensureCat = (cat: string) => {
      if (cat !== '其他' && !catOrder.includes(cat)) catOrder.push(cat)
    }
    for (const e of applyTagsOnly) {
      // 1) 文档结构化 tagCategories：按分类分栏展示，计数 + 归属为其分类
      const cats = e.tagCategories ?? {}
      for (const [cat, list] of Object.entries(cats)) {
        ensureCat(cat)
        for (const t of list) {
          const k = counts.get(t)
          if (k) {
            k.count++
            if (k.category === '其他') k.category = cat
          } else {
            counts.set(t, { count: 1, category: cat })
          }
        }
      }
      // 2) entry 主标签（tagCategories 已记录过的会 continue；文档只有平铺 tags 时在这里归入字典分类）
      for (const t of entryPrimaryTags(e)) {
        if (counts.has(t)) continue
        const cat = categorizeTag(t)
        ensureCat(cat)
        counts.set(t, { count: 1, category: cat })
      }
      // 3) 备用数据源标签（backupTags）：有文档标签时归入「备用来源」分类展示，
      // 无文档标签时按字典兜底归类（因为它会作为主标签展示）
      const back = e.video?.backupTags ?? []
      const hasDoc = hasDocTags({ tags: e.tags, tagCategories: e.tagCategories })
      for (const t of back) {
        const existing = counts.get(t)
        if (existing) {
          existing.count++
          // 已经被文档分类记录过 → 不动 category（主来源优先）
          continue
        }
        const cat = hasDoc ? '备用来源' : categorizeTag(t)
        ensureCat(cat)
        counts.set(t, { count: 1, category: cat })
      }
    }
    catOrder.push('其他')
    const list: TagInfo[] = [...counts.entries()].map(([tag, v]) => ({
      tag,
      count: v.count,
      category: v.category
    }))
    return { categories: catOrder, tags: list }
  }, [applyTagsOnly])

  // 演员 / 制片公司 / 系列 facet（基于 applyTagsOnly，计数随搜索+tag 联动；用于侧栏像标签一样筛选）
  const metaFacets = useMemo<{ actors: MetaFacet[]; studios: MetaFacet[]; series: MetaFacet[] }>(() => {
    const actors = new Map<string, number>()
    const studios = new Map<string, number>()
    const series = new Map<string, number>()
    for (const e of applyTagsOnly) {
      const d = e.video?.meta
      const cast = d?.cast?.length ? d.cast : d?.actors ?? []
      for (const a of cast) actors.set(a, (actors.get(a) ?? 0) + 1)
      if (d?.studio) studios.set(d.studio, (studios.get(d.studio) ?? 0) + 1)
      if (d?.series) series.set(d.series, (series.get(d.series) ?? 0) + 1)
    }
    const sort = (m: Map<string, number>) =>
      [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    return { actors: sort(actors), studios: sort(studios), series: sort(series) }
  }, [applyTagsOnly])

  // v2.3.2 类别（genre）facet：从 meta.genres 提取单标签 + 计数（基于 applyTagsOnly）
  const genreFacets = useMemo<MetaFacet[]>(() => {
    const counts = new Map<string, number>()
    for (const e of applyTagsOnly) {
      const d = e.video?.meta
      if (d?.genres && d.genres.length > 0) {
        for (const g of d.genres) counts.set(g, (counts.get(g) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [applyTagsOnly])

  // 技术规格 facet：分辨率 / 时长 / 评分 / 年份（基于 applyTagsOnly，计数随搜索+tag 联动）
  const specFacets = useMemo(() => {
    const res = new Map<string, number>()
    const dur = new Map<string, number>()
    const score = new Map<string, number>()
    const year = new Map<string, number>()
    for (const e of applyTagsOnly) {
      const r = resolutionBucket(e.video); res.set(r, (res.get(r) ?? 0) + 1)
      const sec = e.video?.durationSec ?? e.video?.techInfo?.durationSec
      const d = durationBucket(sec); dur.set(d, (dur.get(d) ?? 0) + 1)
      const s = scoreBucketOf(e); score.set(s, (score.get(s) ?? 0) + 1)
      const y = e.video?.year
      const yk = y ? String(y) : '未知'
      year.set(yk, (year.get(yk) ?? 0) + 1)
    }
    const fromOrder = (m: Map<string, number>, order: string[]): MetaFacet[] => {
      const out: MetaFacet[] = []
      for (const k of order) if ((m.get(k) ?? 0) > 0) out.push({ name: k, count: m.get(k)! })
      for (const [k, c] of m) if (!order.includes(k) && c > 0) out.push({ name: k, count: c })
      return out
    }
    const years = [...year.entries()]
      .filter(([, c]) => c > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (a.name === '未知' ? 1 : b.name === '未知' ? -1 : Number(b.name) - Number(a.name)))
    return {
      resolutions: fromOrder(res, RES_ORDER),
      durations: fromOrder(dur, DUR_ORDER),
      scores: fromOrder(score, SCORE_ORDER),
      years
    }
  }, [applyTagsOnly])

  // 第二层：在 applyTagsOnly 基础上再应用 演员/制片公司/系列 维度筛选（各维度内 OR，跨维度 AND）
  const applyMetaFilters = useMemo(() => {
    let list = applyTagsOnly
    if (selectedActors.size > 0) {
      list = list.filter((e) => {
        const d = e.video?.meta
        const cast = d?.cast?.length ? d.cast : d?.actors ?? []
        return cast.some((a) => selectedActors.has(a))
      })
    }
    if (selectedStudios.size > 0) {
      list = list.filter(
        (e) => !!e.video?.meta?.studio && selectedStudios.has(e.video.meta.studio)
      )
    }
    if (selectedSeries.size > 0) {
      list = list.filter(
        (e) => !!e.video?.meta?.series && selectedSeries.has(e.video.meta.series)
      )
    }
    // v2.3.2 类别（genre）筛选：选中 genres 内 OR
    if (selectedGenres.size > 0) {
      list = list.filter((e) => {
        const d = e.video?.meta
        return !!d?.genres && d.genres.some((g) => selectedGenres.has(g))
      })
    }
    if (selectedResolutions.size > 0) {
      list = list.filter((e) => selectedResolutions.has(resolutionBucket(e.video)))
    }
    if (selectedDurations.size > 0) {
      list = list.filter((e) => {
        const sec = e.video?.durationSec ?? e.video?.techInfo?.durationSec
        return selectedDurations.has(durationBucket(sec))
      })
    }
    if (selectedScores.size > 0) {
      list = list.filter((e) => selectedScores.has(scoreBucketOf(e)))
    }
    if (selectedYears.size > 0) {
      list = list.filter((e) => {
        const y = e.video?.year
        return !!y && selectedYears.has(String(y))
      })
    }
    return list
  }, [applyTagsOnly, selectedActors, selectedStudios, selectedSeries, selectedGenres, selectedResolutions, selectedDurations, selectedScores, selectedYears])

  // 第三层：应用 智能筛选（我的清单 / 快捷过滤）
  const applySmart = useMemo(() => {
    let list = applyMetaFilters
    switch (smart) {
      case 'favorite':
        list = list.filter((e) => !!e.video?.favorite)
        break
      case 'recent':
        list = list.filter((e) => (e.video?.lastPlayedAt ?? 0) > 0)
        break
      case 'unrated':
        list = list.filter((e) => (e.score ?? e.video?.rating) == null)
        break
      case 'nocover':
        list = list.filter((e) => !e.video?.posterPath)
        break
      case 'unlisted':
        list = list.filter((e) => e.category === '未收录')
        break
    }
    return list
  }, [applyMetaFilters, smart])

  // 客户端排序（在 applySmart 基础上 + category 过滤）
  const filtered = useMemo(() => {
    let list = applySmart
    if (filter.category) list = list.filter((e) => e.category === filter.category)
    const dir = filter.desc ? -1 : 1
    list = list.slice().sort((a, b) => {
      if (filter.sort === 'title') return displayTitle(a).localeCompare(displayTitle(b), 'zh') * dir
      if (filter.sort === 'year') return ((a.video?.year ?? 0) - (b.video?.year ?? 0)) * dir
      if (filter.sort === 'lastPlayed')
        return ((a.video?.lastPlayedAt ?? 0) - (b.video?.lastPlayedAt ?? 0)) * dir
      if (filter.sort === 'random') return Math.random() - 0.5
      if (filter.sort === 'score') return ((b.score ?? 0) - (a.score ?? 0)) // 评分始终高分在前
      return ((a.video?.addedAt ?? 0) - (b.video?.addedAt ?? 0)) * dir
    })
    return list
  }, [applySmart, filter.category, filter.sort, filter.desc])

  // 当前库已锁定影片数（进度面板运行时提示：这些会被批量补齐自动跳过）
  const lockedCount = useMemo(
    () => (reconcile?.entries ?? []).filter((e) => e.video?.locked).length,
    [reconcile]
  )

  // ---------- 多选批量锁定 ----------
  const toggleSelectMode = useCallback(() => {
    setSelectMode((m) => {
      if (m) setSelectedIds(new Set())
      return !m
    })
  }, [])

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  /** 全选当前筛选结果中所有有真实记录的影片 */
  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filtered.filter((e) => e.video?.id).map((e) => e.video!.id)))
  }, [filtered])

  /** 反选：当前筛选结果中有记录的影片与当前选中集合取反 */
  const invertSelection = useCallback(() => {
    const visibleIds = filtered.filter((e) => e.video?.id).map((e) => e.video!.id)
    setSelectedIds((prev) => new Set(visibleIds.filter((id) => !prev.has(id))))
  }, [filtered])

  /** 对当前选中项批量设置锁定状态 */
  const applyLockToSelection = useCallback(
    async (locked: boolean) => {
      const ids = [...selectedIds]
      if (ids.length === 0) {
        toast({ text: t('lock.selectedNone'), tone: 'warn' })
        return
      }
      const now = Date.now()
      await api.videoLockMany(ids, locked)
      setReconcile((prev) =>
        prev
          ? {
              ...prev,
              entries: prev.entries.map((e) =>
                e.video && ids.includes(e.video.id)
                  ? { ...e, video: { ...e.video, locked, lockedAt: locked ? now : undefined } }
                  : e
              )
            }
          : prev
      )
      setSelectedIds(new Set())
      setSelectMode(false)
      toast({
        text: locked ? t('lock.batchLockedToast', { count: ids.length }) : t('lock.batchUnlockedToast', { count: ids.length }),
        tone: locked ? 'warn' : 'ok'
      })
    },
    [selectedIds]
  )

  // 离开浏览页 / 切换媒体库时退出多选，避免残留选中项
  useEffect(() => {
    if (!selectMode) return
    if (view !== 'browse') {
      setSelectMode(false)
      setSelectedIds(new Set())
    }
  }, [view, selectMode, libraryId])

  // 分组：选中分类 → 单一 section；flat → 全库单网格；其他 → 按 Excel 分类分组
  const sections = useMemo<WallSection[]>(() => {
    if (filter.category) {
      return [{ title: `📁 ${filter.category}`, entries: filtered }]
    }
    if (filter.groupMode === 'flat') {
      return [{ title: t('app.allLibraryBySort'), entries: filtered }]
    }
    const map = new Map<string, { order: number; entries: DisplayEntry[] }>()
    for (const e of filtered) {
      const g = map.get(e.category) ?? { order: e.order, entries: [] }
      g.entries.push(e)
      map.set(e.category, g)
    }
    return [...map.entries()]
      .map(([title, g]) => ({ title, entries: g.entries }))
      .sort((a, b) => {
        const oa = map.get(a.title)?.order ?? 0
        const ob = map.get(b.title)?.order ?? 0
        return oa - ob
      })
  }, [filtered, filter.sort, filter.groupMode, filter.category])

  // 我的清单 / 待处理 计数（侧栏徽标）
  const flagCounts = useMemo(() => {
    let fav = 0
    let recent = 0
    let unrated = 0
    let nocover = 0
    for (const e of reconcile?.entries ?? []) {
      if (e.video?.favorite) fav++
      if ((e.video?.lastPlayedAt ?? 0) > 0) recent++
      if (e.video && (e.score ?? e.video.rating) == null) unrated++
      if (e.video && !e.video.posterPath) nocover++
    }
    // 未收录 仅统计待处理（已忽略的不计入徽标，但仍可在「待处理」里找到）
    const unlisted = reconcile?.unlisted?.length ?? 0
    return { fav, recent, unrated, nocover, unlisted }
  }, [reconcile])

  // 随机推荐：整库真随机洗牌。洗牌顺序（video.id 列表）缓存到 ref，
  // 只有 recommendNonce（点「换一批」）变化才重新洗牌；reconcile 更新（收藏/详情等）只实时映射最新数据、顺序不变。
  const recommendOrderRef = useRef<{ nonce: number; ids: string[] }>({ nonce: -1, ids: [] })
  const recommend = useMemo<DisplayEntry[]>(() => {
    const list = (reconcile?.entries ?? []).filter((e) => e.video)
    if (list.length === 0) return []
    const byId = new Map(list.map((e) => [e.video!.id, e]))
    const order = recommendOrderRef.current
    if (order.nonce !== recommendNonce || order.ids.length === 0) {
      const q = shuffleEntries(list).slice(0, 14)
      recommendOrderRef.current = { nonce: recommendNonce, ids: q.map((e) => e.video!.id) }
    }
    // 按缓存顺序映射最新数据：收藏/详情变化后卡片状态实时更新，但顺序（随机结果）保持不变
    return recommendOrderRef.current.ids
      .map((id) => byId.get(id))
      .filter((e): e is DisplayEntry => !!e)
  }, [reconcile, recommendNonce])

  // 全库随机（跨媒体库）：合并所有库的 reconcile 缓存，洗牌顺序缓存到 ref，
  // 只有 allRandomNonce（点「换一批」）变化才重新洗牌；缓存更新只实时映射、顺序不变。
  const allRandomOrderRef = useRef<{ nonce: number; ids: string[] }>({ nonce: -1, ids: [] })
  const allRandom = useMemo<DisplayEntry[]>(() => {
    // 仅一个媒体库时与「随机推荐」重叠，隐藏全库随机行
    if (libraries.length <= 1) return []
    const list: DisplayEntry[] = []
    for (const res of Object.values(allReconciles)) {
      for (const e of res.entries) {
        // 当前库优先用最新 reconcile 数据（收藏/详情状态实时），其他库用缓存
        if (e.video && e.video.libraryId === libraryId) {
          const cur = (reconcile?.entries ?? []).find((c) => c.video?.id === e.video?.id)
          if (cur) {
            list.push(cur)
            continue
          }
        }
        if (e.video) list.push(e)
      }
    }
    if (list.length === 0) return []
    const byId = new Map(list.map((e) => [e.video!.id, e]))
    const order = allRandomOrderRef.current
    if (order.nonce !== allRandomNonce || order.ids.length === 0) {
      const q = shuffleEntries(list).slice(0, 14)
      allRandomOrderRef.current = { nonce: allRandomNonce, ids: q.map((e) => e.video!.id) }
    }
    return allRandomOrderRef.current.ids
      .map((id) => byId.get(id))
      .filter((e): e is DisplayEntry => !!e)
  }, [allReconciles, reconcile, libraryId, allRandomNonce, libraries])

  // 库内容变化（扫描 / 切换库 / 补齐信息）→ 用整库全部影片重建 hero 洗牌队列（Fisher-Yates 乱序）
  // 仅当 reconcile 归属当前库（切库时旧库数据会先到达，等新库 reconcile 到位再重建）
  useEffect(() => {
    if (heroBuiltLibRef.current === libraryId) return
    if (reconcile?.libraryId !== libraryId) return
    const all = (reconcile?.entries ?? []).filter((e) => e.video)
    if (all.length === 0) return
    heroQueueRef.current = shuffleEntries(all).map((e) => e.video!.id)
    heroBuiltLibRef.current = libraryId
    setHeroIdx(0)
  }, [reconcile, libraryId])

  // Hero：从独立队列取当前项，渲染时用最新 reconcile 实时映射（收藏/详情变化不换片，顺序稳定）
  const hero = useMemo<DisplayEntry | undefined>(() => {
    const all = (reconcile?.entries ?? []).filter((e) => e.video)
    if (all.length === 0) return undefined
    const byId = new Map(all.map((e) => [e.video!.id, e]))
    const id = heroQueueRef.current[heroIdx]
    return (id ? byId.get(id) : undefined) ?? all[0] ?? undefined
  }, [reconcile, heroIdx])

  // 点一次 → 取下一项；走到队尾自动重新洗牌（并避免与上一轮尾项重复）
  const onHeroNext = useCallback(() => {
    const q = heroQueueRef.current
    if (q.length <= 1) return
    const next = heroIdxRef.current + 1
    if (next < q.length) {
      setHeroIdx(next)
      return
    }
    const all = (reconcile?.entries ?? []).filter((e) => e.video)
    if (all.length <= 1) return
    const nq = shuffleEntries(all)
    const lastId = q[q.length - 1]
    const ids = nq.map((e) => e.video!.id)
    if (ids[0] === lastId && ids.length > 1) ids.push(ids.shift()!)
    heroQueueRef.current = ids
    setHeroIdx(0)
  }, [reconcile])

  // 详情页相关推荐（同制片公司 / 系列 / 主演）


  const relatedEntries = useMemo<DisplayEntry[]>(() => {
    if (!detail) return []
    const d = detail.meta
    if (!d?.studio && !d?.series && !(d?.cast && d.cast.length)) return []
    return (reconcile?.entries ?? [])
      .filter(
        (e) =>
          e.video &&
          e.video.id !== detail.id &&
          ((d.studio && e.video.meta?.studio === d.studio) ||
            (d.series && e.video.meta?.series === d.series) ||
            (d.cast &&
              e.video.meta?.cast?.some((a) => d.cast!.includes(a))))
      )
      .slice(0, 12)
  }, [detail, reconcile])

  const totalSelected = selectedTags.size
  const metaSelectedCount = selectedActors.size + selectedStudios.size + selectedSeries.size + selectedGenres.size
  const techSelectedCount = selectedResolutions.size + selectedDurations.size + selectedScores.size + selectedYears.size
  const hasActiveFilters = totalSelected + metaSelectedCount + techSelectedCount + (filter.category ? 1 : 0) > 0 || smart !== 'all'

  // ---------- 回调 ----------

  const runReconcile = useCallback(async (id: string) => {
    setScanning(true)
    setProgress(null)
    try {
      const res = await api.libraryReconcile(id)
      setReconcile(res)
      setAllReconciles((prev) => ({ ...prev, [id]: res }))
      if (res.stats.missing > 0 || res.stats.unlisted > 0) setReconcileOpen(true)
    } catch {
      /* 忽略 */
    }
    setScanning(false)
  }, [])

  /** {t('app.addLibrary')}：打开「{t('app.addLibrary')}」表单（不再直接连弹两个系统对话框），表单内提供两步引导说明 */
  const handleAddLibrary = useCallback(() => {
    setAddingLibrary(true)
    setLibraryOpen(true)
  }, [])

  const handleScan = useCallback(() => {
    if (!libraryId) return
    // v2.4.1：扫描库合并为单次 IPC 调用 libraryScanAndReconcile，内部先 scanLibrary 建记录
    // 再 reconcileLibrary 对账并写缓存；主进程只推一轮连续进度，UI 上只看到一次进度条
    // （之前先 videoScan 再 runReconcile，两次 IPC 各发自己的 emitProgress，进度条弹两轮）
    setScanning(true)
    setProgress(null)
    setFetchLogs([])
    api
      .libraryScanAndReconcile(libraryId)
      .then((res) => {
        setReconcile(res)
        setAllReconciles((prev) => ({ ...prev, [libraryId]: res }))
        if (res.stats.missing > 0 || res.stats.unlisted > 0) setReconcileOpen(true)
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => setProgress(null), 800)
        setScanning(false)
      })
  }, [libraryId])

  const handleOpenEntry = useCallback((entry: DisplayEntry) => {
    if (entry.video) setDetail(entry.video)
  }, [])

  const handleEditEntry = useCallback((v: Video) => setEditing(v), [])

  /** 从磁盘删除视频文件：预检 → 打开二次确认弹窗（Impeccable 设计 ConfirmDeleteModal） */
  const handleNoticeConfirm = async (dismissed: boolean) => {
    setNoticeOpen(false)
    if (dismissed) {
      try {
        await api.settingsSet({ noticeDismissed: true })
        setSettings((prev) => ({ ...prev, noticeDismissed: true }))
      } catch {
        /* 保存失败下次再弹 */
      }
    }
  }
  const openDeleteConfirm = useCallback(
    async (v: Video) => {
      if (!v.path) {
        window.alert(t('app.noFilePathCannotDelete'))
        return
      }
      const fileName = v.path.split(/[\\/]/).pop() || v.path

  // 预检：让用户在确认前看到准确的删除范围（不删任何文件）
      const inspect = await api.videoInspectForDelete(v.id).catch((e) => ({ ok: false as const, error: String(e) }))
      if (!inspect.ok) {
        window.alert(t('app.deletePrecheckFailed') + inspect.error)
        return
      }
      const otherVideoCount = inspect.otherVideoCount ?? 0
      const otherFileCount = inspect.otherFileCount ?? 0
      const willDeleteDir = otherVideoCount === 0 && otherFileCount === 0

      setDeletePreview({
        id: v.id,
        title: v.title,
        filePath: v.path,
        fileName,
        otherVideoCount,
        otherFileCount,
        scope: willDeleteDir ? 'dir' : 'file',
        dirPath: willDeleteDir ? inspect.dirPath : undefined
      })
    },
    []
  )

  /** 弹窗确认后：把文件/目录挪到回收站 → 关详情页 → 全库扫描 */
  const confirmDelete = useCallback(async () => {
    if (!deletePreview || deleting) return
    if (settings.lockHash) {
      const pwd = window.prompt(t('app.privacyLockPrompt'))
      if (pwd == null) return
      const ok = await api.lockVerify(pwd)
      if (!ok) {
        window.alert(t('app.wrongPasswordDelete'))
        return
      }
    }
    const fileName = deletePreview.fileName
    setDeleting(true)
    try {
      const r = await api.videoDeleteFile(deletePreview.id)
      if (!r.ok) {
        window.alert(t('app.deleteFailed') + (r.error ?? t('app.unknownError')))
        setDeletePreview(null)
        return
      }
      const desc = r.deletedDir
        ? t('app.movedDirToRecycle', { path: r.dirPath ?? '' })
        : t('app.movedFileToRecycle', { file: fileName })
      const cacheDesc = r.removedCache ? `\n${t('app.cleanedCacheCount', { n: r.removedCache })}` : ''
      const recordDesc = r.removedRecord ? `\n${t('app.clearedMeta')}` : ''
      toast({ title: t('app.movedToRecycle'), text: desc + cacheDesc + recordDesc + '\n' + t('app.recycleRecoverHint'), tone: 'ok', duration: 5000 })
      // 删除/挪到回收站后{t('common.close')}详情页（用户已无该视频的打开需求）
      setDetail(null)
      setDeletePreview(null)
      // 触发全库扫描，让 data.json 重新同步
      if (libraryId) {
        await runReconcile(libraryId)
      }
    } catch (e) {
      window.alert(t('app.deleteFailed') + ((e as Error)?.message ?? String(e)))
    } finally {
      setDeleting(false)
    }
  }, [deletePreview, deleting, libraryId])

  const handleDetailFetched = useCallback((videoId: string, detail: Video['meta']) => {
    setReconcile((prev) =>
      prev
        ? {
            ...prev,
            entries: prev.entries.map((e) =>
              e.video && e.video.id === videoId ? { ...e, video: { ...e.video, meta: detail } } : e
            )
          }
        : prev
    )
  }, [])

  const handlePosterFetched = useCallback(
    (videoId: string, posterPath: string, previewPaths?: string[], posterSource?: string) => {
      setReconcile((prev) =>
        prev
          ? {
              ...prev,
              entries: prev.entries.map((e) =>
                e.video && e.video.id === videoId
                  ? {
                      ...e,
                      video: {
                        ...e.video,
                        posterPath,
                        posterSource: (posterSource ?? 'ffmpeg') as ImageSource,
                        // 保留原预览帧：设为封面等回调若不传 previewPaths，不能把已有的截帧预览清掉
                        previewPaths: previewPaths ?? e.video.previewPaths,
                        // 自增版本号：posterPath 可能不变（如 <id>.jpg 被覆盖），列表端靠它让 lm:// URL 带 ?v= 强制刷新
                        coverVersion: (e.video.coverVersion ?? 0) + 1
                      }
                    }
                  : e
              )
            }
          : prev
      )
    },
    []
  )

  const handleOpenMissing = useCallback(
    (_entry: DisplayEntry) => {
      if (currentLibrary?.introExcelPath) void api.openPath(currentLibrary.introExcelPath)
    },
    [currentLibrary]
  )

  const handleSaveLibrary = useCallback(
    async (patch: Partial<Library>): Promise<boolean> => {
      if (addingLibrary) {
        const lib = await api.libraryAdd({
          name: patch.name?.trim() || patch.folderPath || t('app.unnamedLibrary'),
          folderPath: patch.folderPath || '',
          imagePriority: [...DEFAULT_IMAGE_PRIORITY]
        })
        if (!lib) return false
        setLibraries((prev) => [...prev, lib])
        setLibraryId(lib.id)
        setLibraryOpen(false)
        setAddingLibrary(false)
        await runReconcile(lib.id)
        return true
      }
      if (!currentLibrary) return false
      const updated = await api.libraryUpdate(currentLibrary.id, patch)
      if (updated) {
        setLibraries((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
        setLibraryOpen(false)
        await runReconcile(updated.id)
        return true
      }
      return false
    },
    [addingLibrary, currentLibrary, runReconcile]
  )

  const handleRemoveLibrary = useCallback(async () => {
    if (!currentLibrary) return
    if (settings.lockHash) {
      const pwd = window.prompt(t('app.privacyLockDeleteLib'))
      if (pwd == null) return
      const ok = await api.lockVerify(pwd)
      if (!ok) {
        window.alert(t('app.wrongPasswordDelete'))
        return
      }
    }
    await api.libraryRemove(currentLibrary.id)
    setLibraries((prev) => prev.filter((l) => l.id !== currentLibrary.id))
    setLibraryOpen(false)
    setAddingLibrary(false)
    setReconcile(null)
    const rest = libraries.filter((l) => l.id !== currentLibrary.id)
    setLibraryId(rest[0]?.id ?? '')
  }, [currentLibrary, libraries])

  const handleSaveMeta = useCallback(async (id: string, patch: Partial<Video>) => {
    const updated = await api.videoUpdate(id, patch)
    if (updated) {
      setReconcile((prev) =>
        prev
          ? {
              ...prev,
              entries: prev.entries.map((e) => (e.video && e.video.id === id ? { ...e, video: updated } : e))
            }
          : prev
      )
      setEditing(null)
    }
  }, [])

  const handleFetchPoster = useCallback(async (videoId: string) => {
    const updated = await api.videoFetchPoster(videoId)
    if (updated) {
      setReconcile((prev) =>
        prev
          ? {
              ...prev,
              entries: prev.entries.map((e) =>
                e.video && e.video.id === videoId ? { ...e, video: updated } : e
              )
            }
          : prev
      )
    }
    return updated
  }, [])

  /** 批量补齐结果：结构化数据 → 统一 Toast（含来源分布 / 失败原因） */
  interface BatchToastData {
    title?: string
    tone?: 'ok' | 'warn' | 'err'
    ok: number
    failed: number
    bySource: Record<SourceId, number>
    reasons: string[]
    stopped: boolean
    remaining: number
    /** v2.2.7：按用户的 customSourceOrder 渲染来源分布条，让展示顺序跟实际采集顺序一致 */
    customSourceOrder?: SourceId[]
    /** v2.3.11：补充提示（如「仍有 N 部无封面，可再跑一轮」） */
    hint?: string
  }
  const showBatchToast = (data: Omit<BatchToastData, 'tone'> & { tone?: 'ok' | 'warn' | 'err' }) => {
    // 自动推断 tone：err（异常）> 停止 > 部分失败 > 全成功
    const tone: 'ok' | 'warn' | 'err' = data.tone ?? (data.stopped || data.failed > 0 ? 'warn' : 'ok')
    const total = data.ok + data.failed
    // v2.2.7：按 customSourceOrder 排 bySource 展示，跟用户实际的采集顺序一致
    const SOURCE_LABELS: Record<SourceId, string> = {
      moviedb: 'MovieDB', omdb: 'OMDb', openlibrary: 'OpenLibrary', justwatch: 'JustWatch', wikipedia: '维基百科'
    }
    const order: readonly SourceId[] = data.customSourceOrder ?? (['moviedb', 'omdb', 'openlibrary', 'justwatch', 'wikipedia'] as const)
    const bySourceLine = order
      .map((s) => `${SOURCE_LABELS[s]} ${data.bySource[s]}`)
      .join(' · ')
    const title = data.title ?? (tone === 'ok' ? t('app.refetchComplete') : tone === 'warn' ? t('app.refetchPartialFail') : t('app.refetchFail'))
    const subtitle = data.failed > 0 ? t('app.batchResultOkFail', { ok: data.ok, fail: data.failed }) : data.ok > 0 ? t('app.batchResultOk', { ok: data.ok }) : ''
    const detail = (
      <div className="space-y-2">
        {total > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-white/45 font-medium">{t('app.sourceDistribution')}</span>
              <span className="text-[10px] text-white/65 font-mono tabular-nums">
                {bySourceLine} · 失败 {data.failed}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden flex">
              <div
                className={`h-full transition-all ${data.failed > 0 ? 'bg-emerald-500' : 'bg-brand'}`}
                style={{ width: `${total > 0 ? (data.ok / total) * 100 : 0}%` }}
              />
              {data.failed > 0 ? (
                <div className="bg-red-500/60 h-full transition-all" style={{ width: `${total > 0 ? (data.failed / total) * 100 : 0}%` }} />
              ) : null}
            </div>
          </div>
        ) : null}
        {data.reasons.length > 0 ? (
          <div className="space-y-0.5">
            {data.reasons.map((r, i) => (
              <div key={i} className="text-[12px] text-white/55 truncate">· {r}</div>
            ))}
          </div>
        ) : null}
        {data.stopped ? (
          <div className="text-[11px] text-amber-400/90">⚠ {t('app.autoStoppedRemaining', { n: data.remaining })}</div>
        ) : null}
        {data.hint ? <div className="text-[11px] text-white/50">{data.hint}</div> : null}
      </div>
    )
    toast({ title, text: subtitle, tone, detail, duration: 9000 })
  }

  const handleBatchFetch = useCallback(async (force = false) => {
    if (!libraryId) return
    setScanning(true)
    setProgress(null)
    // 清空上一轮的抓取日志，避免旧日志被误认为本轮结果
    setFetchLogs([])
    try {
      const res = await api.libraryFetchAll(libraryId, force)
      // 失败原因按文本去重计数，Top3 给 toast 显示
      const reasonCount: Record<string, number> = {}
      for (const f of res.failures ?? []) {
        const key = f.reason || '未知原因'
        reasonCount[key] = (reasonCount[key] ?? 0) + 1
      }
      const reasons = Object.entries(reasonCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([r, n]) => `${r}（×${n}）`)
      const tone: 'ok' | 'warn' | 'err' = res.stopped || res.failed > 0 ? 'warn' : 'ok'
      const lockedList = (res.lockedSkipped ?? []).map((x) => ({ ...x, reason: 'locked' as const }))
      const missingList = (res.missingSkipped ?? []).map((x) => ({ ...x, reason: 'missing' as const }))
      const skippedAll = [...lockedList, ...missingList]
      const hintParts: string[] = []
      if (skippedAll.length > 0)
        hintParts.push(
          t('lock.skippedToastGeneric', { count: skippedAll.length, locked: lockedList.length, missing: missingList.length })
        )
      if (res.remainingNoPoster) hintParts.push(t('app.stillNoPoster', { n: res.remainingNoPoster }))
      showBatchToast({
        title: tone === 'ok' ? t('app.refetchComplete') : t('app.refetchPartialFail'),
        hint: hintParts.length ? hintParts.join('；') : undefined,
        tone,
        ok: res.ok,
        failed: res.failed,
        bySource: { moviedb: res.bySource.moviedb ?? 0, omdb: res.bySource.omdb ?? 0, openlibrary: res.bySource.openlibrary ?? 0, justwatch: res.bySource.justwatch ?? 0, wikipedia: res.bySource.wikipedia ?? 0 },
        reasons,
        stopped: res.stopped ?? false,
        remaining: res.remaining ?? 0,
        customSourceOrder: settings.customSourceOrder
      })
      // v2.7.x：本次自动跳过的文件（锁定 / 文件不存在）→ 弹窗明确告知用户
      if (skippedAll.length > 0) {
        setSkippedFiles(skippedAll)
      }
      // 有失败任务时弹出居中明细窗口
      if (res.failures && res.failures.length > 0) {
        setBatchFailures(res.failures)
        setBatchFailuresVisible(true)
      }
      await runReconcile(libraryId)
    } catch (e) {
      showBatchToast({
        title: t('app.refetchFail'),
        tone: 'err',
        ok: 0,
        failed: 0,
        bySource: { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 },
        reasons: [`${t('app.requestError')}：${(e as Error)?.message ?? e}`],
        stopped: false,
        remaining: 0
      })
    } finally {
      // 批量补齐结束后再保留进度条 1 秒，让用户看到「完成」
      setTimeout(() => setProgress(null), 1000)
      // 抓取过程浮层立即收起
      setFetchLogs([])
      setScanning(false)
    }
  }, [libraryId, runReconcile])

  /** 对失败明细弹窗中的项目逐个重试补齐（单点抓取，顺序执行降风控） */
  const handleRetryFailures = useCallback(async (failures: Array<{ id: string; title: string; reason: string }>) => {
    if (failures.length === 0) return
    setBatchFailures(null)
    setRetryingFailures(true)
    setScanning(true)
    setProgress({ total: failures.length, done: 0 })
    setFetchLogs([])
    let ok = 0
    const stillFailed: Array<{ id: string; title: string; reason: string }> = []
    try {
      for (let i = 0; i < failures.length; i++) {
        const f = failures[i]
        setProgress({ total: failures.length, done: i, current: f.title })
        try {
          const res = await api.videoFetchDetail(f.id)
          if (res?.ok && res.detail) {
            ok++
          } else {
            stillFailed.push({ id: f.id, title: f.title, reason: (!res || res.ok) ? '未知原因' : res.error })
          }
        } catch (e) {
          stillFailed.push({ id: f.id, title: f.title, reason: (e as Error)?.message ?? t('app.requestError') })
        }
      }
      setProgress({ total: failures.length, done: failures.length })
      if (stillFailed.length > 0) {
        // 仍有失败 → 再次弹出明细窗口，循环重试直到成功或用户取消
        setBatchFailures(stillFailed)
        setBatchFailuresVisible(true)
        showBatchToast({
          title: t('app.stillFailed'),
          tone: 'warn',
          ok,
          failed: stillFailed.length,
          bySource: { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 },
          reasons: [t('app.stillFailedCountHint', { n: stillFailed.length })],
          stopped: false,
          remaining: 0
        })
      } else {
        showBatchToast({
          title: t('app.retryAllSuccess'),
          tone: 'ok',
          ok,
          failed: 0,
          bySource: { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 },
          reasons: [],
          stopped: false,
          remaining: 0
        })
      }
      if (libraryId) await runReconcile(libraryId)
    } catch (e) {
      showBatchToast({
        title: t('app.retryFail'),
        tone: 'err',
        ok,
        failed: stillFailed.length,
        bySource: { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 },
        reasons: [`${t('app.requestError')}：${(e as Error)?.message ?? e}`],
        stopped: false,
        remaining: 0
      })
    } finally {
      setTimeout(() => setProgress(null), 1000)
      setFetchLogs([])
      setRetryingFailures(false)
      setScanning(false)
    }
  }, [libraryId, runReconcile])

  // v2.3.7 批量补齐时长：对当前库所有缺时长视频 ffprobe 读时长写 techInfo
  const handleBatchProbe = useCallback(async () => {
    if (!libraryId) return
    setScanning(true)
    setProgress(null)
    try {
      const res = await api.libraryBatchProbe(libraryId)
      toast({
        text: t('app.durationFixResult', { ok: res.ok, fail: res.failed, skip: res.skipped }),
        tone: res.failed > 0 ? 'warn' : 'ok',
        duration: 6000
      })
      await runReconcile(libraryId)
    } catch (e) {
      toast({ text: t('app.durationFixFail', { msg: (e as Error)?.message ?? e }), tone: 'err' })
    } finally {
      setTimeout(() => setProgress(null), 1000)
      setScanning(false)
    }
  }, [libraryId, runReconcile])

  const handlePreviewRenames = useCallback(async () => {
    if (!libraryId) return []
    return api.libraryPreviewRenames(libraryId)
  }, [libraryId])

  const handleApplyRenames = useCallback(
    async (items: { path: string; newName: string }[]) => {
      if (!libraryId) return { ok: 0, failed: [] }
      const r = await api.libraryApplyRenames(libraryId, items)
      if (r.ok > 0) await runReconcile(libraryId)
      return r
    },
    [libraryId, runReconcile]
  )

  const handleSaveSettings = useCallback(async (patch: Partial<Settings>) => {
    const s = await api.settingsSet(patch)
    setSettings(s)
    // 设置页切换列表展示模式后，立即同步到当前列表视图
    if (s.listViewMode) {
      setFilter((f) => ({ ...f, groupMode: s.listViewMode as 'flat' | 'grouped' }))
    }
    setSettingsOpen(false)
    // 刚开启自动更新频率时，立即联网检测一次，让「待处理更新」尽快可见
    if (patch.autoUpdateFrequency && patch.autoUpdateFrequency !== 'off') {
      void api.updateCheck().then(() => api.settingsGet().then(setSettings)).catch(() => {})
    }
  }, [])

  const togglePrivacy = useCallback(() => {
    setPrivacy((p) => {
      const next = !p
      localStorage.setItem('vm-privacy', next ? '1' : '0')
      return next
    })
  }, [])

  const toggleTag = useCallback((t: string) => {
    setSelectedTags((prev) => {
      const n = new Set(prev)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })
  }, [])

  const clearTags = useCallback(() => setSelectedTags(new Set()), [])

  // 收藏 / 锁定切换（持久化到视频记录，同步本地 reconcile）
  const toggleFlag = useCallback(
    async (id: string, key: 'favorite' | 'locked') => {
      const entry = reconcile?.entries.find((e) => e.video?.id === id)
      const v = entry?.video
      if (!v) return
      const next = !v[key]
      const patch: Partial<Video> =
        key === 'locked' ? { locked: next, lockedAt: next ? Date.now() : undefined } : { [key]: next }
      const updated = await api.videoUpdate(id, patch)
      if (updated) {
        setReconcile((prev) =>
          prev
            ? {
                ...prev,
                entries: prev.entries.map((e) =>
                  e.video && e.video.id === id ? { ...e, video: updated } : e
                )
              }
            : prev
        )
        // 同步全库随机缓存（收藏状态在跨媒体库行也实时）
        setAllReconciles((prev) => {
          const cur = prev[libraryId]
          if (!cur) return prev
          return {
            ...prev,
            [libraryId]: {
              ...cur,
              entries: cur.entries.map((e) =>
                e.video && e.video.id === id ? { ...e, video: updated } : e
              )
            }
          }
        })
        if (key === 'locked') {
          toast({
            text: next ? t('lock.lockedToast') : t('lock.unlockedToast'),
            tone: next ? 'warn' : 'ok'
          })
        }
      }
    },
    [reconcile, libraryId]
  )

  /** v2.7.x：批量补齐结束后弹窗里「全部解锁」——解锁本次因锁定被跳过的所有影片 */
  const unlockSkippedAll = useCallback(async () => {
    const lockedItems = (skippedFiles ?? []).filter((x) => x.reason === 'locked')
    if (lockedItems.length === 0) return
    const ids = lockedItems.map((x) => x.id)
    await api.videoLockMany(ids, false)
    setReconcile((prev) =>
      prev
        ? {
            ...prev,
            entries: prev.entries.map((e) =>
              e.video && ids.includes(e.video.id)
                ? { ...e, video: { ...e.video, locked: false, lockedAt: undefined } }
                : e
            )
          }
        : prev
    )
    setSkippedFiles(null)
    toast({ text: t('lock.unlockedAll'), tone: 'ok' })
  }, [skippedFiles])

  // ---------- 导航 ----------

  const clearAllFilters = useCallback(() => {
    setSmart('all')
    setFilter((f) => ({ ...f, category: null }))
    setSelectedTags(new Set())
    setSelectedActors(new Set())
    setSelectedStudios(new Set())
    setSelectedSeries(new Set())
    setSelectedGenres(new Set())
    clearTechFilters()
  }, [])

  const onNav = useCallback((v: ViewName, s?: SmartFilter) => {
    setView(v)
    if (s) setSmart(s)
    // 进入具体智能筛选时清空其它筛选，避免叠加混乱
    setFilter((f) => ({ ...f, category: null }))
    setSelectedTags(new Set())
    setSelectedActors(new Set())
    setSelectedStudios(new Set())
    setSelectedSeries(new Set())
    setSelectedGenres(new Set())
    clearTechFilters()
    if (s === 'recent') setFilter((f) => ({ ...f, sort: 'lastPlayed', desc: true }))
  }, [])

  const handleNavLibrary = useCallback((id: string) => {
    setLibraryId(id)
    setView('browse')
    setSmart('all')
    setFilter((f) => ({ ...f, category: null, sort: 'title', desc: false }))
    setSelectedTags(new Set())
    setSelectedActors(new Set())
    setSelectedStudios(new Set())
    setSelectedSeries(new Set())
    clearTechFilters()
  }, [])


  const onSmart = useCallback((s: SmartFilter) => {
    setSmart(s)
    if (s !== 'all') {
      setFilter((f) => ({ ...f, category: null }))
      setSelectedTags(new Set())
      setSelectedActors(new Set())
      setSelectedStudios(new Set())
      setSelectedSeries(new Set())
    }
    if (s === 'recent') setFilter((f) => ({ ...f, sort: 'lastPlayed', desc: true }))
  }, [])

  // ---------- 演员 / 制片公司 / 系列 维度筛选 ----------
  const toggleActor = useCallback((a: string) => {
    setSelectedActors((prev) => {
      const n = new Set(prev)
      if (n.has(a)) n.delete(a)
      else n.add(a)
      return n
    })
  }, [])
  const toggleStudio = useCallback((s: string) => {
    setSelectedStudios((prev) => {
      const n = new Set(prev)
      if (n.has(s)) n.delete(s)
      else n.add(s)
      return n
    })
  }, [])
  const toggleSeries = useCallback((s: string) => {
    setSelectedSeries((prev) => {
      const n = new Set(prev)
      if (n.has(s)) n.delete(s)
      else n.add(s)
      return n
    })
  }, [])
  const clearMetaFilters = useCallback(() => {
    setSelectedActors(new Set())
    setSelectedStudios(new Set())
    setSelectedSeries(new Set())
    setSelectedGenres(new Set())
    clearTechFilters()
  }, [])

  const clearActors = useCallback(() => setSelectedActors(new Set()), [])
  const clearStudios = useCallback(() => setSelectedStudios(new Set()), [])
  const clearSeries = useCallback(() => setSelectedSeries(new Set()), [])

  // v2.3.2 类别（genre）筛选 toggle/clear
  const toggleGenre = useCallback((g: string) => {
    setSelectedGenres((prev) => {
      const n = new Set(prev)
      if (n.has(g)) n.delete(g)
      else n.add(g)
      return n
    })
  }, [])
  const clearGenres = useCallback(() => setSelectedGenres(new Set()), [])

  // ---------- 技术规格 / 时间 维度筛选 ----------
  const toggleResolution = useCallback((v: string) => {
    setSelectedResolutions((prev) => {
      const n = new Set(prev)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  }, [])
  const toggleDuration = useCallback((v: string) => {
    setSelectedDurations((prev) => {
      const n = new Set(prev)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  }, [])
  const toggleScore = useCallback((v: string) => {
    setSelectedScores((prev) => {
      const n = new Set(prev)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  }, [])
  const toggleYear = useCallback((v: string) => {
    setSelectedYears((prev) => {
      const n = new Set(prev)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  }, [])
  const clearResolutions = useCallback(() => setSelectedResolutions(new Set()), [])
  const clearDurations = useCallback(() => setSelectedDurations(new Set()), [])
  const clearScores = useCallback(() => setSelectedScores(new Set()), [])
  const clearYears = useCallback(() => setSelectedYears(new Set()), [])
  const clearTechFilters = useCallback(() => {
    setSelectedResolutions(new Set())
    setSelectedDurations(new Set())
    setSelectedScores(new Set())
    setSelectedYears(new Set())
  }, [])

  const handlePickFilter = useCallback((f: { type: 'actor' | 'studio' | 'series' | 'category'; value: string }) => {
    setDetail(null)
    if (f.type === 'actor') setSelectedActors(new Set([f.value]))
    else if (f.type === 'studio') setSelectedStudios(new Set([f.value]))
    else if (f.type === 'category') setFilter((p) => ({ ...p, search: p.search && p.search.length ? `${p.search} OR ${f.value}` : f.value }))
    else setSelectedSeries(new Set([f.value]))
    setView('browse')
    setSmart('all')
    setFilter((p) => ({ ...p, category: null }))
  }, [])

  // 详情页 / 卡片点击标签 → 一键筛选该标签全部影片
  const handlePickTag = useCallback((tag: string) => {
    setDetail(null)
    setSelectedTags(new Set([tag]))
    setSmart('all')
    setView('browse')
    setFilter((p) => ({ ...p, category: null }))
  }, [])

  const handleTechInfoFetched = useCallback((videoId: string, tech: Video['techInfo']) => {
    setReconcile((prev) =>
      prev
        ? {
            ...prev,
            entries: prev.entries.map((e) =>
              e.video && e.video.id === videoId ? { ...e, video: { ...e.video, techInfo: tech } } : e
            )
          }
        : prev
    )
  }, [])

  const toggleCategory = useCallback((c: string) => {
    setFilter((f) => ({ ...f, category: f.category === c ? null : c }))
  }, [])

  const clearCategory = useCallback(() => setFilter((f) => ({ ...f, category: null })), [])

  const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), [])

  const mismatch =
    reconcile && (reconcile.stats.missing > 0 || reconcile.stats.unlisted > 0)
      ? { missing: reconcile.stats.missing, unlisted: reconcile.stats.unlisted }
      : null



  // 启动遮罩：未加载完基础设置前不渲染任何内容（防止隐私锁闪烁泄露）
  if (!loaded) {
    return <SplashScreen />
  }
  // 隐私锁：已上锁且未{t('app.unlock')} → 拦截整个界面
  const locked = !!settings.lockHash && !unlocked
  if (locked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />
  }

  return (
    <ToastProvider>
    <div
      className={`h-full flex flex-col text-white ${privacy ? 'privacy-on' : ''} density-${settings.posterDensity}`}
      style={{ contain: 'layout' }}
    >
      <Toolbar
        search={searchInput}
        onSearch={(v) => {
          setSearchInput(v)
          if (v.trim()) {
            setView('browse')
            setSmart('all')
          }
        }}
        onHome={() => setView('home')}
        onAddLibrary={handleAddLibrary}
        privacy={privacy}
        onTogglePrivacy={togglePrivacy}
        libraryName={currentLibrary?.name}
        onScan={handleScan}
        onBatchFetch={handleBatchFetch}
        onBatchProbe={handleBatchProbe}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          view={view}
          smart={smart}
          onNav={onNav}
          libraries={libraries}
          libraryId={libraryId}
          onLibrary={handleNavLibrary}
          onEditLibrary={() => {
            setAddingLibrary(false)
            setLibraryOpen(true)
          }}
          onAddLibrary={handleAddLibrary}
          favoriteCount={flagCounts.fav}
          recentCount={flagCounts.recent}
          unlistedCount={flagCounts.unlisted}
          unratedCount={flagCounts.unrated}
          nocoverCount={flagCounts.nocover}
          pendingUpdate={settings.pendingUpdate}
          sections={sectionList}
          selectedCategory={filter.category}
          onToggleCategory={toggleCategory}
          onClearCategory={clearCategory}
          tags={tags}
          categories={tagCategoriesOrder}
          selected={selectedTags}
          onToggle={toggleTag}
          onClear={clearTags}
          actorFacets={metaFacets.actors}
          studioFacets={metaFacets.studios}
          seriesFacets={metaFacets.series}
          selectedActors={selectedActors}
          selectedStudios={selectedStudios}
          selectedSeries={selectedSeries}
          onToggleActor={toggleActor}
          onToggleStudio={toggleStudio}
          onToggleSeries={toggleSeries}
          onClearActors={clearActors}
          onClearStudios={clearStudios}
          onClearSeries={clearSeries}
          onClearMetaFilters={clearMetaFilters}
          genreFacets={genreFacets}
          selectedGenres={selectedGenres}
          onToggleGenre={toggleGenre}
          onClearGenres={clearGenres}
          resolutionFacets={specFacets.resolutions}
          durationFacets={specFacets.durations}
          scoreFacets={specFacets.scores}
          yearFacets={specFacets.years}
          selectedResolutions={selectedResolutions}
          selectedDurations={selectedDurations}
          selectedScores={selectedScores}
          selectedYears={selectedYears}
          onToggleResolution={toggleResolution}
          onToggleDuration={toggleDuration}
          onToggleScore={toggleScore}
          onToggleYear={toggleYear}
          onClearResolutions={clearResolutions}
          onClearDurations={clearDurations}
          onClearScores={clearScores}
          onClearYears={clearYears}
          onClearTechFilters={clearTechFilters}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          onOpenStats={() => setStatsOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="flex-1 min-w-0">
          {libraries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 ring-1 ring-brand/30 flex items-center justify-center mb-5">
                <Icon name="film" size={30} className="text-brand" />
              </div>
              <div className="text-2xl font-semibold mb-2">{t('app.welcomeTitle')}</div>
              <div className="text-white/50 text-sm mb-6 max-w-md leading-relaxed">
                {t('app.welcomeStep1')}
                {t('app.welcomeStep2')}
              </div>
              <button className="btn btn-brand px-5 py-2.5" onClick={handleAddLibrary}>
                <Icon name="plus" size={16} />
                {t('app.addLibrary')}
              </button>
            </div>
          ) : !reconcile ? (
            <HomeSkeleton
              aspect={viewMode === 'grid-portrait' ? 'portrait' : 'landscape'}
              label={scanning ? t('app.reconciling') : t('app.loadingLibrary')}
            />
          ) : view === 'home' ? (
            <HomeView
              key="home"
              entries={reconcile.entries}
              onOpen={handleOpenEntry}
              onEdit={handleEditEntry}
              onOpenMissing={handleOpenMissing}
              onToggleFlag={toggleFlag}
              onBrowse={(s) => onNav('browse', s)}
              recommend={recommend}
              onRefreshRecommend={() => setRecommendNonce((n) => n + 1)}
              allRandom={allRandom}
              onRefreshAllRandom={() => setAllRandomNonce((n) => n + 1)}
              hero={hero}
              onHeroNext={onHeroNext}
              onPickTag={handlePickTag}
              onDelete={openDeleteConfirm}
              viewMode={viewMode}
              onSetView={setViewMode}
            />
          ) : filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 text-sm px-6 text-center animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-ink-800 ring-1 ring-white/5 flex items-center justify-center mb-4">
                <Icon name="search" size={26} />
              </div>
              {t('app.noMatches')}
            </div>
          ) : (
            <div key="browse" className="h-full flex flex-col p-4 min-h-0 animate-fadeIn">
              <BrowseBar
                libraryName={currentLibrary?.name}
                categoryLabel={filter.category}
                smart={smart}
                onSmart={onSmart}
                resultCount={filtered.length}
                sort={filter.sort}
                onSort={(v) => setFilter((f) => ({ ...f, sort: v }))}
                desc={filter.desc}
                onToggleDesc={() => setFilter((f) => ({ ...f, desc: !f.desc }))}
                groupMode={filter.groupMode}
                onToggleGroup={() => {
                  const next = filter.groupMode === 'grouped' ? 'flat' : 'grouped'
                  setFilter((f) => ({ ...f, groupMode: next }))
                  void api.settingsSet({ listViewMode: next })
                    .then((s) => setSettings(s))
                    .catch(() => {})
                }}
                viewMode={viewMode}
                onSetView={setViewMode}
                onClearAll={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
                selectMode={selectMode}
                selectedCount={selectedIds.size}
                onToggleSelectMode={toggleSelectMode}
                mismatch={mismatch}
                onShowReconcile={() => setReconcileOpen(true)}
              />

              {/* 活跃筛选条：多维筛选可视化，可单独移除 */}
              {(metaSelectedCount + techSelectedCount) > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 animate-fadeIn-fast">
                  <span className="text-white/40 text-xs">{t('app.filterLabel')}</span>
                  {[...selectedActors].map((a) => (
                    <button
                      key={`a-${a}`}
                      onClick={() => toggleActor(a)}
                      className="h-6 px-2 rounded-md text-[11px] flex items-center gap-1 bg-brand/15 text-brand ring-1 ring-brand/30 hover:bg-brand/25 transition-colors"
                    >
                      {t('app.cast')}{a}
                      <Icon name="x" size={11} className="opacity-70" />
                    </button>
                  ))}
                  {[...selectedStudios].map((s) => (
                    <button
                      key={`s-${s}`}
                      onClick={() => toggleStudio(s)}
                      className="h-6 px-2 rounded-md text-[11px] flex items-center gap-1 bg-brand/15 text-brand ring-1 ring-brand/30 hover:bg-brand/25 transition-colors"
                    >
                      {t('app.studioLabel')}{s}
                      <Icon name="x" size={11} className="opacity-70" />
                    </button>
                  ))}
                  {[...selectedSeries].map((s) => (
                    <button
                      key={`se-${s}`}
                      onClick={() => toggleSeries(s)}
                      className="h-6 px-2 rounded-md text-[11px] flex items-center gap-1 bg-brand/15 text-brand ring-1 ring-brand/30 hover:bg-brand/25 transition-colors"
                    >
                      {t('app.seriesLabel')}{s}
                      <Icon name="x" size={11} className="opacity-70" />
                    </button>
                  ))}
                  {[...selectedResolutions].map((r) => (
                    <button
                      key={`r-${r}`}
                      onClick={() => toggleResolution(r)}
                      className="h-6 px-2 rounded-md text-[11px] flex items-center gap-1 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                    >
                      {t('app.resolutionLabel')}{r}
                      <Icon name="x" size={11} className="opacity-70" />
                    </button>
                  ))}
                  {[...selectedDurations].map((d) => (
                    <button
                      key={`d-${d}`}
                      onClick={() => toggleDuration(d)}
                      className="h-6 px-2 rounded-md text-[11px] flex items-center gap-1 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                    >
                      {t('app.durationLabel')}{d}
                      <Icon name="x" size={11} className="opacity-70" />
                    </button>
                  ))}
                  {[...selectedScores].map((s) => (
                    <button
                      key={`sc-${s}`}
                      onClick={() => toggleScore(s)}
                      className="h-6 px-2 rounded-md text-[11px] flex items-center gap-1 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                    >
                      {t('app.scoreLabel')}{s}
                      <Icon name="x" size={11} className="opacity-70" />
                    </button>
                  ))}
                  {[...selectedYears].map((y) => (
                    <button
                      key={`y-${y}`}
                      onClick={() => toggleYear(y)}
                      className="h-6 px-2 rounded-md text-[11px] flex items-center gap-1 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
                    >
                      {t('app.yearLabel')}{y}
                      <Icon name="x" size={11} className="opacity-70" />
                    </button>
                  ))}
                  <button
                    onClick={clearAllFilters}
                    className="h-6 px-2 rounded-md text-[11px] text-white/50 hover:text-white hover:bg-ink-700 transition-colors"
                  >
                    {t('app.clearAll')}
                  </button>
                </div>
              ) : null}

              <div className="flex-1 min-h-0">
                {viewMode === 'list-filename' ? (
                  <ListView
                    entries={filtered}
                    onOpen={handleOpenEntry}
                    onEdit={handleEditEntry}
                    onOpenMissing={handleOpenMissing}
                    onToggleFlag={toggleFlag}
                    onPickTag={handlePickTag}
                    mode="filename"
                    selectable={selectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelectId}
                  />
                ) : (
                  <VirtualizedWall
                    key={viewMode}
                    sections={sections}
                    onOpen={handleOpenEntry}
                    onEdit={handleEditEntry}
                    onOpenMissing={handleOpenMissing}
                    onToggleFlag={toggleFlag}
                    onPickTag={handlePickTag}
                    onDelete={openDeleteConfirm}
                    aspect={viewMode === 'grid-landscape' ? 'landscape' : 'portrait'}
                    selectable={selectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelectId}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ReconcileDialog
        open={reconcileOpen}
        result={reconcile}
        ignoredUnlistedPaths={settings.ignoredUnlistedPaths}
        onClose={() => setReconcileOpen(false)}
        onOpenFile={(p) => void api.openPath(p)}
        onRevealInFolder={(p) => void api.shellRevealInFolder(p)}
        onPreviewRenames={handlePreviewRenames}
        onApplyRenames={handleApplyRenames}
        onIgnoreUnlisted={async (p) => {
          if (!libraryId) return
          const next = [...new Set([...settings.ignoredUnlistedPaths, p])]
          const s = await api.settingsSet({ ignoredUnlistedPaths: next })
          setSettings(s)
          await runReconcile(libraryId)
        }}
        onUnignoreUnlisted={async (p) => {
          if (!libraryId) return
          const next = settings.ignoredUnlistedPaths.filter((x) => x !== p)
          const s = await api.settingsSet({ ignoredUnlistedPaths: next })
          setSettings(s)
          await runReconcile(libraryId)
        }}
        onOpenExternal={(u) => void api.openExternal(u)}
        onOpenLibrarySettings={() => {
          if (currentLibrary) {
            setLibraryId(currentLibrary.id)
            setLibraryOpen(true)
            setAddingLibrary(false)
          }
        }}
      />

      <LibraryModal
        open={libraryOpen}
        library={addingLibrary ? null : currentLibrary}
        onClose={() => {
          setLibraryOpen(false)
          setAddingLibrary(false)
        }}
        onSave={handleSaveLibrary}
        onRemove={handleRemoveLibrary}
        onGenerateSheet={() => {
          const lib = addingLibrary ? null : currentLibrary
          if (lib) {
            setLibraryOpen(false)
            setAddingLibrary(false)
            setOnboardLib(lib)
            setOnboardOpen(true)
          }
        }}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onSaved={() => {
          void api.settingsGet().then(setSettings)
        }}
      />

      <AboutModal
        open={aboutOpen}
        info={appInfo}
        onClose={() => setAboutOpen(false)}
        onOpenExternal={(u) => void api.openExternal(u)}
        onOpenLicense={() => setLicenseOpen(true)}
        language={settings.language}
      />

      <LicenseModal
        open={licenseOpen}
        onClose={() => setLicenseOpen(false)}
        language={settings.language}
      />

      <EditMetaModal
        video={editing}
        onClose={() => setEditing(null)}
        onSave={handleSaveMeta}
        onFetchPoster={handleFetchPoster}
      />

      {detail ? (
        <VideoDetail
          video={detail}
          onClose={() => setDetail(null)}
          onPlay={(v) => {
            setDetail(null)
            void api.videoOpen(v.id)
          }}
          onDetailFetched={handleDetailFetched}
          onPosterFetched={handlePosterFetched}
          onTechInfoFetched={handleTechInfoFetched}
          onPickFilter={handlePickFilter}
          onPickTag={handlePickTag}
          onToggleFlag={toggleFlag}
          related={relatedEntries}
          onOpenRelated={(e) => {
            if (e.video) setDetail(e.video)
          }}
          onEdit={(v) => {
            setDetail(null)
            setEditing(v)
          }}
          onDelete={openDeleteConfirm}
        />
      ) : null}

      {statsOpen && reconcile ? (
        <StatsPanel
          open={statsOpen}
          result={reconcile}
          onClose={() => setStatsOpen(false)}
          onOpen={(entry) => {
            setStatsOpen(false)
            handleOpenEntry(entry)
          }}
        />
      ) : null}

      {/* 删除文件二次确认（Impeccable 设计：琥珀=仅删文件 / 红=整目录删） */}
      <ConfirmDeleteModal
        open={!!deletePreview}
        preview={deletePreview}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletePreview(null)}
      />

      {/* 用户须知弹窗：首次启动（noticeDismissed 未确认）强制弹出；勾选+确认后不再弹 */}
      <UserNoticeModal
        open={noticeOpen}
        onClose={handleNoticeConfirm}
      />

      {/* v2.3.13：新建片单 Excel 向导弹窗 —— reconcile 检测到库无片单 Excel 时自动弹 */}
      <OnboardSheetModal
        open={onboardOpen}
        library={onboardLib}
        onClose={(dontShowAgain) => {
          setOnboardOpen(false)
          setOnboardLib(null)
          if (dontShowAgain) {
            const newSettings = { ...settingsRef.current, suppressIntroExcelNotice: true }
            setSettings(newSettings)
            window.api.settingsSet({ suppressIntroExcelNotice: true })
          }
        }}
        onOpenExternal={(url) => window.api.openExternal(url)}
        onOpenSpec={async () => {
          try {
            const r = await window.api.specGet()
            if (r.path) window.api.openPath(r.path)
          } catch { /* ignore */ }
        }}
        onRevealSpec={async () => {
          try {
            const r = await window.api.specGet()
            if (r.path) window.api.shellRevealInFolder(r.path)
          } catch { /* ignore */ }
        }}
        onOpenLibrarySettings={() => {
          setOnboardOpen(false)
          setOnboardLib(null)
          if (onboardLib) {
            setLibraryId(onboardLib.id)
            setLibraryOpen(true)
            setAddingLibrary(false)
          }
        }}
        onCopyText={async (text) => {
          try { await navigator.clipboard.writeText(text) } catch { /* fallback */ window.api.copyText?.(text) }
        }}
        onExportCodes={(libId, fmt) => window.api.libraryExportCodes(libId, fmt)}
      />

      {/* v2.2.10：实时抓取日志浮层（左下角）。批量补齐期间滚动显示"数据源失败 → 降级下一源"，结束自动收起 */}
      

      {/* v2.4.1：进度面板（可拖拽、暂停/继续/停止） */}
      <ProgressPanel
        progress={progress}
        scanning={scanning}
        paused={fetchPaused}
        skippedLocked={lockedCount}
        logs={fetchLogs}
        onDismissLogs={() => setFetchLogs([])}
        onPause={() => { setFetchPaused(true); window.api.libraryFetchPause() }}
        onResume={() => { setFetchPaused(false); window.api.libraryFetchResume() }}
        onStop={() => { window.api.libraryFetchStop(); setFetchPaused(false) }}
      />

      {/* v2.2.14：批量抓取失败明细弹窗（居中） */}
      {batchFailures && batchFailuresVisible && batchFailures.length > 0 && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-modal-backdrop"
          onClick={() => setBatchFailures(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/10 shadow-2xl shadow-black/50 animate-modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <h3 className="text-base font-medium text-white">{t('app.batchFailures')}</h3>
                <span className="text-xs text-white/40 ml-2">{t('app.batchFailuresCount', { count: batchFailures.length })}</span>
              </div>
              <button
                type="button"
                onClick={() => setBatchFailures(null)}
                className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-2">
              {batchFailures.map((f, i) => {
                const entry = reconcile?.entries.find((e) => e.video?.id === f.id)
                const video = entry?.video
                const failTitle = entry ? displayTitle(entry) : f.title
                return (
                <button
                  key={f.id + i}
                  type="button"
                  title={video ? t('app.batchFailuresClickHint') : ''}
                  onClick={() => {
                    if (video) {
                      setBatchFailuresVisible(false)
                      setDetail(video)
                    }
                  }}
                  className="w-full flex items-start gap-3 rounded-lg bg-white/5 hover:bg-white/10 hover:ring-1 hover:ring-brand/40 px-3 py-2.5 text-left transition-colors group"
                >
                  <span className="text-xs text-white/30 font-mono mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate group-hover:text-brand transition-colors" title={failTitle}>{failTitle}</div>
                    <div className="text-xs text-red-300/80 mt-0.5 break-all">{f.reason || t('app.unknownReason')}</div>
                  </div>
                  <span className="text-[10px] text-white/30 group-hover:text-brand/70 self-center whitespace-nowrap">
                    → {t('app.batchFailuresDetail')}
                  </span>
                </button>
                )
              })}
            </div>
            <div className="flex justify-end items-center gap-3 px-5 py-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => handleRetryFailures(batchFailures)}
                disabled={retryingFailures}
                className="px-4 h-9 rounded-lg bg-brand hover:bg-brand/90 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {retryingFailures && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {t('app.retryAll')}
              </button>
              <button
                type="button"
                onClick={() => setBatchFailures(null)}
                className="px-4 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v2.7.x：多选批量锁定操作条 */}
      {selectMode && view === 'browse' ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[65] flex items-center gap-2 px-3 py-2 rounded-2xl bg-ink-850/95 ring-1 ring-white/15 shadow-2xl shadow-black/60 backdrop-blur-sm animate-fadeIn-fast">
          <span className="text-sm text-white/80 px-1 whitespace-nowrap">{t('lock.selectedCount', { count: selectedIds.size })}</span>
          <button
            type="button"
            className="h-8 px-2.5 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors whitespace-nowrap"
            onClick={selectAllVisible}
          >
            {t('lock.selectAll')}
          </button>
          <button
            type="button"
            className="h-8 px-2.5 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors whitespace-nowrap"
            onClick={invertSelection}
          >
            {t('lock.invertSelection')}
          </button>
          <button
            type="button"
            className="h-8 px-2.5 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-white/80 transition-colors disabled:opacity-40 whitespace-nowrap"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedIds.size === 0}
          >
            {t('lock.clearSelection')}
          </button>
          <div className="w-px h-5 bg-white/10 mx-0.5" />
          <button
            type="button"
            className="h-8 px-3 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-black transition-colors flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            onClick={() => void applyLockToSelection(true)}
            disabled={selectedIds.size === 0}
          >
            <Icon name="lock" size={13} />
            {t('lock.batchLock')}
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            onClick={() => void applyLockToSelection(false)}
            disabled={selectedIds.size === 0}
          >
            <Icon name="unlock" size={13} />
            {t('lock.batchUnlock')}
          </button>
          <button
            type="button"
            className="h-8 w-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
            onClick={toggleSelectMode}
            title={t('lock.exitSelect')}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ) : null}

      {/* v2.7.x：批量补齐结束后，告知哪些文件被自动跳过（已锁定 / 文件不存在） */}
      {skippedFiles && skippedFiles.length > 0 && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-modal-backdrop"
          onClick={() => setSkippedFiles(null)}
        >
          <div
            className="relative w-full max-w-xl max-h-[80vh] overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/10 shadow-2xl shadow-black/50 animate-modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const lockedItems = skippedFiles.filter((x) => x.reason === 'locked')
              const missingItems = skippedFiles.filter((x) => x.reason === 'missing')
              return (
                <>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <h3 className="text-base font-medium text-white truncate">{t('lock.skippedTitle')}</h3>
                      <span className="text-xs text-white/40 ml-2 shrink-0">{t('lock.skippedCount', { count: skippedFiles.length })}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSkippedFiles(null)}
                      className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="px-5 pt-3 text-xs text-white/50 leading-relaxed">
                    {t('lock.skippedHintGeneric', { locked: lockedItems.length, missing: missingItems.length })}
                  </div>
                  <div className="p-5 overflow-y-auto max-h-[50vh] space-y-1.5">
                    {skippedFiles.map((item) => {
                      const entry = reconcile?.entries.find((e) => e.video?.id === item.id)
                      return (
                        <div
                          key={`${item.reason}-${item.id}`}
                          className="w-full flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2"
                        >
                          <Icon
                            name={item.reason === 'locked' ? 'lock' : 'alert'}
                            size={13}
                            className={`shrink-0 ${item.reason === 'locked' ? 'text-amber-400' : 'text-red-400'}`}
                          />
                          <span className="text-sm text-white/90 truncate flex-1 min-w-0" title={item.title}>
                            {item.title}
                          </span>
                          <span
                            className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded ${
                              item.reason === 'locked' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'
                            }`}
                          >
                            {item.reason === 'locked' ? t('lock.reasonLocked') : t('lock.reasonMissing')}
                          </span>
                          {entry?.video ? (
                            <button
                              type="button"
                              className="text-[10px] text-white/40 hover:text-brand shrink-0"
                              onClick={() => {
                                setSkippedFiles(null)
                                setDetail(entry.video!)
                              }}
                            >
                              {t('app.batchFailuresDetail')}
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-end items-center gap-3 px-5 py-4 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => void unlockSkippedAll()}
                      disabled={lockedItems.length === 0}
                      className="px-4 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Icon name="unlock" size={13} />
                      {t('lock.unlockAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkippedFiles(null)}
                      className="px-4 h-9 rounded-lg bg-brand hover:bg-brand/90 text-white text-sm transition-colors"
                    >
                      {t('lock.skippedClose')}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

    </div>
    </ToastProvider>
  )
}

/** v2.2.10：实时抓取过程浮层（右下角）。批量补齐期间滚动显示"数据源失败 → 降级下一源"这类过程提示 */
/** v2.4.1：右下角进度面板（可拖拽、暂停/继续/停止） */
interface FetchLogItem {
  code: string
  src: string
  status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'
  detail?: string
}

/** v2.8.5：统一进度面板（扫描进度 + 抓取过程日志 + 暂停/停止），合并原 FetchLogOverlay 和 ProgressPanel */
interface ProgressPanelProps {
  progress: { total: number; done: number; current?: string } | null
  scanning: boolean
  paused: boolean
  /** v2.7.x：当前库已锁定的影片数（运行时提示：这些会被自动跳过） */
  skippedLocked?: number
  /** v2.8.5：抓取过程日志，显示在进度条下方 */
  logs?: FetchLogItem[]
  /** v2.8.5：清除日志（关闭按钮） */
  onDismissLogs?: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}
function ProgressPanel({ progress, scanning, paused, skippedLocked = 0, logs = [], onDismissLogs, onPause, onResume, onStop }: ProgressPanelProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const width = 360
  // 有日志时面板更高（日志区域约120px），无日志时保持原高度
  const hasLogs = logs.length > 0
  const height = hasLogs ? 300 : 140

  const clampPos = (x: number, y: number) => ({
    x: Math.max(0, Math.min(window.innerWidth - width, x)),
    y: Math.max(0, Math.min(window.innerHeight - height, y))
  })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      setPos(clampPos(dragRef.current.origX + dx, dragRef.current.origY + dy))
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPos((prev) => (prev ? clampPos(prev.x, prev.y) : null))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleDragStart = (e: React.MouseEvent) => {
    const el = (e.currentTarget as HTMLElement).parentElement
    const rect = el?.getBoundingClientRect()
    const defaultX = window.innerWidth - width - 16
    const defaultY = window.innerHeight - height - 16
    const origX = rect?.left ?? (pos?.x ?? defaultX)
    const origY = rect?.top ?? (pos?.y ?? defaultY)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY }
    if (!pos) setPos({ x: origX, y: origY })
    e.preventDefault()
  }

  const style: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : { position: 'fixed', right: 16, bottom: 16 }

  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
  const title = scanning ? t('app.scanningLibrary') : t('app.scanningOrFetching')
  const statusColor = paused ? 'bg-amber-400' : percent >= 100 ? 'bg-emerald-400' : 'bg-brand'

  // 日志行渲染（从原 FetchLogOverlay 迁移）
  const SOURCE_LABEL: Record<string, string> = {
    moviedb: 'MovieDB', omdb: 'OMDb', openlibrary: 'OpenLibrary', justwatch: 'JustWatch', wikipedia: '维基百科'
  }
  const logLine = (l: FetchLogItem) => {
    const label = SOURCE_LABEL[l.src] ?? l.src
    const localizedDetail = (() => {
      if (!l.detail) return ''
      if (l.detail.match(/^(.+)-not-configured$/)) return t('app.fetchSkippedNotConfigured', { source: label })
      if (l.detail.match(/^(.+)-disabled$/)) return t('app.fetchSkippedDisabled', { source: label })
      return l.detail
    })()
    switch (l.status) {
      case 'trying': return { text: `→ ${t('app.fetchTrying')} ${label}…`, cls: 'text-white/55' }
      case 'hit': return { text: `✓ ${label} ${t('app.fetchHit')}`, cls: 'text-emerald-400' }
      case 'skipped': return { text: `· ${label} ${t('app.fetchSkipped')}${localizedDetail ? ` (${localizedDetail})` : ''}`, cls: 'text-white/35' }
      case 'no-result': return { text: `· ${label} ${localizedDetail ? localizedDetail.slice(0, 80) : t('app.fetchNoResult')}`, cls: 'text-amber-400/80' }
      case 'network-failed': return { text: `✗ ${label} ${t('app.fetchNetworkFail')}${localizedDetail ? ` (${localizedDetail.slice(0, 60)})` : ''}`, cls: 'text-red-400/85' }
    }
  }

  if (!progress || progress.total <= 0) return null

  return (
    <div
      style={style}
      className="z-[60] w-[360px] rounded-xl bg-ink-900/95 ring-1 ring-white/10 shadow-2xl shadow-black/50 flex flex-col overflow-hidden backdrop-blur-sm animate-fadeIn-fast"
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-white/5 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="text-xs font-medium text-white/80 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${paused ? '' : 'animate-pulse'} ${statusColor}`} />
          {paused ? t('app.progressPaused') : title}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-white/40">{percent}%</span>
          {hasLogs && onDismissLogs && (
            <button
              type="button"
              onClick={onDismissLogs}
              className="w-5 h-5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center text-xs"
              title={t('common.close')}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span className="truncate max-w-[220px]" title={progress.current || ''}>
            {progress.current || ''}
          </span>
          <span className="font-mono text-white/40">
            {progress.done}/{progress.total}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full ${statusColor} transition-all duration-300 ${paused ? '' : 'animate-pulse'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {skippedLocked > 0 ? (
          <div className="flex items-center gap-1 text-[11px] text-amber-300/90">
            <Icon name="lock" size={11} className="shrink-0" />
            {t('lock.progressSkipped', { count: skippedLocked })}
          </div>
        ) : null}
        {/* v2.8.5：抓取过程日志区域（可滚动） */}
        {hasLogs && (
          <div className="border-t border-white/5 pt-2 max-h-[120px] overflow-y-auto space-y-0.5 font-mono text-[10.5px] leading-relaxed">
            {logs.slice(-20).map((l, i) => {
              const { text, cls } = logLine(l)
              return (
                <div key={i} className={`truncate ${cls}`} title={l.detail}>
                  <span className="text-white/30 mr-1.5">[{l.code}]</span>
                  {text}
                </div>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2 pt-0.5">
          {paused ? (
            <button
              type="button"
              onClick={onResume}
              className="flex-1 h-7 rounded-md bg-brand/20 hover:bg-brand/30 text-brand text-xs font-medium transition-colors"
            >
              {t('app.progressResume')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="flex-1 h-7 rounded-md bg-white/10 hover:bg-white/15 text-white/90 text-xs font-medium transition-colors"
            >
              {t('app.progressPause')}
            </button>
          )}
          <button
            type="button"
            onClick={onStop}
            className="flex-1 h-7 rounded-md bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium transition-colors"
          >
            {t('app.progressStop')}
          </button>
        </div>
      </div>
    </div>
  )
}
function SplashScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-ink-900 text-white/70 animate-fadeIn">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-[#ff9db6] flex items-center justify-center shadow-glow-sm mb-4">
        <Icon name="film" size={24} className="text-white" />
      </div>
      <div className="text-sm">{t('app.starting')}</div>
    </div>
  )
}

/** 隐私锁界面：软件上锁后每次打开需输入密码；连续错误 5 次自动退出 */
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const attempts = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async () => {
    if (!pwd || busy) return
    setBusy(true)
    setError('')
    try {
      const ok = await api.lockVerify(pwd)
      if (ok) {
        onUnlock()
        return
      }
      attempts.current += 1
      if (attempts.current >= 5) {
        await api.appQuit()
        return
      }
      setError(t('app.wrongPasswordAttempts', { n: attempts.current }))
      setPwd('')
    } catch {
      setError(t('app.verifyFailedRetry'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-ink-900 px-4 animate-fadeIn">
      <div className="w-full max-w-sm rounded-2xl bg-ink-800 ring-1 ring-white/10 shadow-2xl p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand to-[#ff9db6] flex items-center justify-center shadow-glow-sm">
            <Icon name="lock" size={20} className="text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-lg">{t('app.lockedTitle')}</div>
            <div className="text-white/45 text-xs">{t('app.lockedHint')}</div>
          </div>
        </div>
        <input
          ref={inputRef}
          type="password"
          className="w-full bg-ink-900/60 text-white text-sm rounded-lg px-3 py-2.5 outline-none border border-white/10 focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition-colors"
          placeholder={t('app.passwordPlaceholder')}
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        {error ? <div className="text-red-400 text-xs mt-2">{error}</div> : null}
        <button
          className="w-full mt-4 px-4 py-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          onClick={() => void submit()}
          disabled={busy}
        >
          <Icon name="unlock" size={15} />
          {t('app.unlock')}
        </button>
      </div>
    </div>
  )
}
