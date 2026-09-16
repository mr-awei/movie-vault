import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Video, ViewMode } from '../../../shared/types'
import type { DeletePreview } from '../components/ConfirmDeleteModal'
import type { ViewName, SmartFilter } from '../components/Sidebar'

/**
 * UI 状态 Store（Zustand）。
 * 管理全局 UI 状态：弹窗显示/隐藏、侧边栏折叠、浏览视图、筛选选择等。
 * 从 App.tsx 上帝组件中拆出来，降低组件复杂度。
 *
 * 使用方法：
 * const { settingsOpen, setSettingsOpen } = useUIStore()
 * 或按需订阅：
 * const settingsOpen = useUIStore((s) => s.settingsOpen)
 */

/** 支持函数式更新的 setter 类型（与 React setState 语义一致） */
type Setter<T> = (v: T | ((prev: T) => T)) => void

interface UIState {
  // ---------- 弹窗状态 ----------
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
  onboardLib: { id: string; name: string } | null

  // ---------- 布局状态 ----------
  sidebarCollapsed: boolean

  // ---------- 浏览状态 ----------
  view: ViewName
  smart: SmartFilter
  viewMode: ViewMode

  // ---------- 多选状态 ----------
  selectMode: boolean
  dragSelectMode: 'select' | 'deselect' | null

  // ---------- 隐私/锁定 ----------
  privacy: boolean
  unlocked: boolean

  // ---------- 其他 ----------
  heroIdx: number
  loaded: boolean

  // ---------- 操作方法 ----------
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
  setOnboardLib: Setter<{ id: string; name: string } | null>
  setSidebarCollapsed: Setter<boolean>
  setView: Setter<ViewName>
  setSmart: Setter<SmartFilter>
  setViewMode: Setter<ViewMode>
  setSelectMode: Setter<boolean>
  setDragSelectMode: Setter<'select' | 'deselect' | null>
  setPrivacy: Setter<boolean>
  setUnlocked: Setter<boolean>
  setHeroIdx: Setter<number>
  setLoaded: Setter<boolean>
  toggleSidebar: () => void
  /** 关闭所有弹窗 */
  closeAllModals: () => void
}

/** 生成支持函数式更新的 setter */
function apply<T>(set: (fn: (s: UIState) => Partial<UIState>) => void, key: keyof UIState) {
  return (v: T | ((prev: T) => T)) =>
    set((s) => ({ [key]: typeof v === 'function' ? (v as (p: T) => T)(s[key] as T) : v }) as Partial<UIState>)
}

/** viewMode 从 localStorage 恢复（原 App.tsx 惰性初始化逻辑） */
function initialViewMode(): ViewMode {
  const saved = localStorage.getItem('vm-viewmode')
  if (saved === 'list') return 'list-filename'
  if (saved === 'grid') return 'grid-portrait'
  return (saved as ViewMode) || 'grid-landscape'
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // ---------- 弹窗初始状态 ----------
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

      // ---------- 布局初始状态 ----------
      sidebarCollapsed: false,

      // ---------- 浏览初始状态 ----------
      view: 'home',
      smart: 'all',
      viewMode: initialViewMode(),

      // ---------- 多选初始状态 ----------
      selectMode: false,
      dragSelectMode: null,

      // ---------- 隐私/锁定 ----------
      privacy: localStorage.getItem('vm-privacy') === '1',
      unlocked: false,

      // ---------- 其他 ----------
      heroIdx: 0,
      loaded: false,

      // ---------- 操作方法 ----------
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
      setOnboardLib: apply<{ id: string; name: string } | null>(set, 'onboardLib'),
      setSidebarCollapsed: apply<boolean>(set, 'sidebarCollapsed'),
      setView: apply<ViewName>(set, 'view'),
      setSmart: apply<SmartFilter>(set, 'smart'),
      setViewMode: apply<ViewMode>(set, 'viewMode'),
      setSelectMode: apply<boolean>(set, 'selectMode'),
      setDragSelectMode: apply<'select' | 'deselect' | null>(set, 'dragSelectMode'),
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
