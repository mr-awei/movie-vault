import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI 状态 Store（Zustand）。
 * 管理全局 UI 状态：模态框显示/隐藏、侧边栏折叠等。
 * 从 App.tsx 上帝组件中拆分出来，降低组件复杂度。
 *
 * 使用方式：
 * const { settingsOpen, setSettingsOpen } = useUIStore()
 * 或按需订阅：
 * const settingsOpen = useUIStore((s) => s.settingsOpen)
 */

interface UIState {
  // ---------- 模态框状态 ----------
  settingsOpen: boolean
  aboutOpen: boolean
  licenseOpen: boolean
  libraryOpen: boolean
  noticeOpen: boolean
  reconcileOpen: boolean
  showDuplicates: boolean
  statsOpen: boolean

  // ---------- 布局状态 ----------
  sidebarCollapsed: boolean

  // ---------- 操作方法 ----------
  setSettingsOpen: (open: boolean) => void
  setAboutOpen: (open: boolean) => void
  setLicenseOpen: (open: boolean) => void
  setLibraryOpen: (open: boolean) => void
  setNoticeOpen: (open: boolean) => void
  setReconcileOpen: (open: boolean) => void
  setShowDuplicates: (show: boolean) => void
  setStatsOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  /** 关闭所有模态框 */
  closeAllModals: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // ---------- 模态框初始状态 ----------
      settingsOpen: false,
      aboutOpen: false,
      licenseOpen: false,
      libraryOpen: false,
      noticeOpen: false,
      reconcileOpen: false,
      showDuplicates: false,
      statsOpen: false,

      // ---------- 布局初始状态 ----------
      sidebarCollapsed: false,

      // ---------- 操作方法 ----------
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setAboutOpen: (open) => set({ aboutOpen: open }),
      setLicenseOpen: (open) => set({ licenseOpen: open }),
      setLibraryOpen: (open) => set({ libraryOpen: open }),
      setNoticeOpen: (open) => set({ noticeOpen: open }),
      setReconcileOpen: (open) => set({ reconcileOpen: open }),
      setShowDuplicates: (show) => set({ showDuplicates: show }),
      setStatsOpen: (open) => set({ statsOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
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
          statsOpen: false
        })
    }),
    {
      name: 'yinghai-ui-store',
      // 只持久化布局状态，不持久化模态框状态（模态框应该每次启动时关闭）
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed })
    }
  )
)
