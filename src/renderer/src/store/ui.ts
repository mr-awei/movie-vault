import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Library, Video, ViewMode } from '../../../shared/types'
import type { DeletePreview } from '../components/ConfirmDeleteModal'
import type { ViewName, SmartFilter } from '../components/Sidebar'

/**
 * UI 鐘舵€?Store锛圸ustand锛夈€? * 绠＄悊鍏ㄥ眬 UI 鐘舵€侊細寮圭獥鏄剧ず/闅愯棌銆佷晶杈规爮鎶樺彔銆佹祻瑙堣鍥俱€佺瓫閫夐€夋嫨绛夈€? * 浠?App.tsx 涓婂笣缁勪欢涓媶鍑烘潵锛岄檷浣庣粍浠跺鏉傚害銆? *
 * 浣跨敤鏂规硶锛? * const { settingsOpen, setSettingsOpen } = useUIStore()
 * 鎴栨寜闇€璁㈤槄锛? * const settingsOpen = useUIStore((s) => s.settingsOpen)
 */

/** 鏀寔鍑芥暟寮忔洿鏂扮殑 setter 绫诲瀷锛堜笌 React setState 璇箟涓€鑷达級 */
type Setter<T> = (v: T | ((prev: T) => T)) => void

interface UIState {
  // ---------- 寮圭獥鐘舵€?----------
  settingsOpen: boolean
  aboutOpen: boolean
  licenseOpen: boolean
  libraryOpen: boolean
  noticeOpen: boolean
  reconcileOpen: boolean
  showDuplicates: boolean
  statsOpen: boolean
  showWatchStats: boolean
  addingLibrary: boolean
  editing: Video | null
  detail: Video | null
  deletePreview: DeletePreview | null
  deleting: boolean
  scanning: boolean
  onboardOpen: boolean
  onboardLib: Library | null

  // ---------- 甯冨眬鐘舵€?----------
  sidebarCollapsed: boolean

  // ---------- 娴忚鐘舵€?----------
  view: ViewName
  smart: SmartFilter
  viewMode: ViewMode

  // ---------- 澶氶€夌姸鎬?----------
  selectMode: boolean
  dragSelectMode: 'select' | 'deselect' | null
  selectedIds: Set<string>

  // ---------- 鎾斁鍒楄〃瀵艰埅 ----------
  activePlaylistId: string | null
  pendingPlaylistId: string | null

  // ---------- 闅忔満鎺ㄨ崘 ----------
  recommendNonce: number
  allRandomNonce: number

  // ---------- 鎵归噺鎶撳彇澶辫触 ----------
  batchFailuresVisible: boolean
  retryingFailures: boolean

  // ---------- 闅愮/閿佸畾 ----------
  privacy: boolean
  unlocked: boolean

  // ---------- 鍏朵粬 ----------
  heroIdx: number
  loaded: boolean

  // ---------- 鎿嶄綔鏂规硶 ----------
  setSettingsOpen: Setter<boolean>
  setAboutOpen: Setter<boolean>
  setLicenseOpen: Setter<boolean>
  setLibraryOpen: Setter<boolean>
  setNoticeOpen: Setter<boolean>
  setReconcileOpen: Setter<boolean>
  setShowDuplicates: Setter<boolean>
  setStatsOpen: Setter<boolean>
  setShowWatchStats: Setter<boolean>
  setAddingLibrary: Setter<boolean>
  setEditing: Setter<Video | null>
  setDetail: Setter<Video | null>
  setDeletePreview: Setter<DeletePreview | null>
  setDeleting: Setter<boolean>
  setScanning: Setter<boolean>
  setOnboardOpen: Setter<boolean>
  setOnboardLib: Setter<Library | null>
  setSidebarCollapsed: Setter<boolean>
  setView: Setter<ViewName>
  setSmart: Setter<SmartFilter>
  setViewMode: Setter<ViewMode>
  setSelectMode: Setter<boolean>
  setDragSelectMode: Setter<'select' | 'deselect' | null>
  setSelectedIds: Setter<Set<string>>
  setActivePlaylistId: Setter<string | null>
  setPendingPlaylistId: Setter<string | null>
  setRecommendNonce: Setter<number>
  setAllRandomNonce: Setter<number>
  setBatchFailuresVisible: Setter<boolean>
  setRetryingFailures: Setter<boolean>
  setPrivacy: Setter<boolean>
  setUnlocked: Setter<boolean>
  setHeroIdx: Setter<number>
  setLoaded: Setter<boolean>
  toggleSidebar: () => void
  /** 鍏抽棴鎵€鏈夊脊绐?*/
  closeAllModals: () => void
}

/** 鐢熸垚鏀寔鍑芥暟寮忔洿鏂扮殑 setter */
function apply<T>(set: (fn: (s: UIState) => Partial<UIState>) => void, key: keyof UIState) {
  return (v: T | ((prev: T) => T)) =>
    set((s) => ({ [key]: typeof v === 'function' ? (v as (p: T) => T)(s[key] as T) : v }) as Partial<UIState>)
}

/** viewMode 浠?localStorage 鎭㈠锛堝師 App.tsx 鎯版€у垵濮嬪寲閫昏緫锛?*/
function initialViewMode(): ViewMode {
  const saved = localStorage.getItem('vm-viewmode')
  if (saved === 'list') return 'list-filename'
  if (saved === 'grid') return 'grid-portrait'
  return (saved as ViewMode) || 'grid-landscape'
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // ---------- 寮圭獥鍒濆鐘舵€?----------
      settingsOpen: false,
      aboutOpen: false,
      licenseOpen: false,
      libraryOpen: false,
      noticeOpen: false,
      reconcileOpen: false,
      showDuplicates: false,
      statsOpen: false,
      showWatchStats: false,
      addingLibrary: false,
      editing: null,
      detail: null,
      deletePreview: null,
      deleting: false,
      scanning: false,
      onboardOpen: false,
      onboardLib: null,

      // ---------- 甯冨眬鍒濆鐘舵€?----------
      sidebarCollapsed: false,

      // ---------- 娴忚鍒濆鐘舵€?----------
      view: 'home',
      smart: 'all',
      viewMode: initialViewMode(),

      // ---------- 澶氶€夊垵濮嬬姸鎬?----------
      selectMode: false,
      dragSelectMode: null,
      selectedIds: new Set<string>(),

      // ---------- 鎾斁鍒楄〃瀵艰埅 ----------
      activePlaylistId: null,
      pendingPlaylistId: null,

      // ---------- 闅忔満鎺ㄨ崘 ----------
      recommendNonce: 0,
      allRandomNonce: 0,

      // ---------- 鎵归噺鎶撳彇澶辫触 ----------
      batchFailuresVisible: true,
      retryingFailures: false,

      // ---------- 闅愮/閿佸畾 ----------
      privacy: localStorage.getItem('vm-privacy') === '1',
      unlocked: false,

      // ---------- 鍏朵粬 ----------
      heroIdx: 0,
      loaded: false,

      // ---------- 鎿嶄綔鏂规硶 ----------
      setSettingsOpen: apply<boolean>(set, 'settingsOpen'),
      setAboutOpen: apply<boolean>(set, 'aboutOpen'),
      setLicenseOpen: apply<boolean>(set, 'licenseOpen'),
      setLibraryOpen: apply<boolean>(set, 'libraryOpen'),
      setNoticeOpen: apply<boolean>(set, 'noticeOpen'),
      setReconcileOpen: apply<boolean>(set, 'reconcileOpen'),
      setShowDuplicates: apply<boolean>(set, 'showDuplicates'),
      setStatsOpen: apply<boolean>(set, 'statsOpen'),
      setShowWatchStats: apply<boolean>(set, 'showWatchStats'),
      setAddingLibrary: apply<boolean>(set, 'addingLibrary'),
      setEditing: apply<Video | null>(set, 'editing'),
      setDetail: apply<Video | null>(set, 'detail'),
      setDeletePreview: apply<DeletePreview | null>(set, 'deletePreview'),
      setDeleting: apply<boolean>(set, 'deleting'),
      setScanning: apply<boolean>(set, 'scanning'),
      setOnboardOpen: apply<boolean>(set, 'onboardOpen'),
      setOnboardLib: apply<Library | null>(set, 'onboardLib'),
      setSidebarCollapsed: apply<boolean>(set, 'sidebarCollapsed'),
      setView: apply<ViewName>(set, 'view'),
      setSmart: apply<SmartFilter>(set, 'smart'),
      setViewMode: apply<ViewMode>(set, 'viewMode'),
      setSelectMode: apply<boolean>(set, 'selectMode'),
      setDragSelectMode: apply<'select' | 'deselect' | null>(set, 'dragSelectMode'),
      setSelectedIds: apply<Set<string>>(set, 'selectedIds'),
      setActivePlaylistId: apply<string | null>(set, 'activePlaylistId'),
      setPendingPlaylistId: apply<string | null>(set, 'pendingPlaylistId'),
      setRecommendNonce: apply<number>(set, 'recommendNonce'),
      setAllRandomNonce: apply<number>(set, 'allRandomNonce'),
      setBatchFailuresVisible: apply<boolean>(set, 'batchFailuresVisible'),
      setRetryingFailures: apply<boolean>(set, 'retryingFailures'),
      setPrivacy: apply<boolean>(set, 'privacy'),
      setUnlocked: apply<boolean>(set, 'unlocked'),
      setHeroIdx: apply<number>(set, 'heroIdx'),
      setLoaded: apply<boolean>(set, 'loaded'),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      closeAllModals: () =>
        set({
          settingsOpen: false,
          aboutOpen: false,
          licenseOpen: false,
          libraryOpen: false,
          noticeOpen: false,
          reconcileOpen: false,
          showDuplicates: false,
          statsOpen: false,
          showWatchStats: false,
          addingLibrary: false,
          editing: null,
          detail: null,
          deletePreview: null,
          onboardOpen: false
        })
    }),
    {
      name: 'yinghai-ui-store',
      // 只持久化布局/视图状态，不持久化弹窗状态（弹窗应每次启动时关闭）
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
        view: state.view,
        smart: state.smart
      })
    }
  )
)

