import { create } from 'zustand'
import type { Library, Playlist, ReconcileResult, Settings } from '../../../shared/types'
import type { AppInfo } from '../../../shared/api-types'

/**
 * 数据状态 Store（Zustand）。
 * 管理从主进程 IPC 拉取的应用数据：媒体库、设置、视频列表、播放列表、
 * 扫描进度、抓取日志等。数据加载副作用仍留在 App.tsx 的 useEffect 中，
 * 本 store 只负责状态存放与更新。
 */

/** 支持函数式更新的 setter 类型（与 React setState 语义一致） */
type Setter<T> = (v: T | ((prev: T) => T)) => void

export interface ProgressState {
  total: number
  done: number
  current?: string
}

export interface FetchLogEntry {
  code: string
  src: string
  status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'
  detail?: string
}

export interface BatchFailureItem {
  id: string
  title: string
  reason: string
}

export interface SkippedFileItem {
  id: string
  title: string
  reason: 'locked' | 'missing'
}

/** 函数式更新工具：v 为函数时基于旧值计算 */
function upd<T>(v: T | ((prev: T) => T), prev: T): T {
  return typeof v === 'function' ? (v as (p: T) => T)(prev) : v
}

interface DataStore {
  libraries: Library[]
  settings: Settings
  libraryId: string
  reconcile: ReconcileResult | null
  appInfo: AppInfo | null
  progress: ProgressState | null
  fetchPaused: boolean
  playlists: Playlist[]
  fetchLogs: FetchLogEntry[]
  batchFailures: BatchFailureItem[] | null
  skippedFiles: SkippedFileItem[] | null
  allReconciles: Record<string, ReconcileResult>

  setLibraries: Setter<Library[]>
  setSettings: Setter<Settings>
  setLibraryId: Setter<string>
  setReconcile: Setter<ReconcileResult | null>
  setAppInfo: Setter<AppInfo | null>
  setProgress: Setter<ProgressState | null>
  setFetchPaused: Setter<boolean>
  setPlaylists: Setter<Playlist[]>
  setFetchLogs: Setter<FetchLogEntry[]>
  setBatchFailures: Setter<BatchFailureItem[] | null>
  setSkippedFiles: Setter<SkippedFileItem[] | null>
  setAllReconciles: Setter<Record<string, ReconcileResult>>
}

export const useDataStore = create<DataStore>((set) => ({
  libraries: [],
  settings: {} as Settings,
  libraryId: '',
  reconcile: null,
  appInfo: null,
  progress: null,
  fetchPaused: false,
  playlists: [],
  fetchLogs: [],
  batchFailures: null,
  skippedFiles: null,
  allReconciles: {},

  setLibraries: (v) => set((s) => ({ libraries: upd(v, s.libraries) })),
  setSettings: (v) => set((s) => ({ settings: upd(v, s.settings) })),
  setLibraryId: (v) => set((s) => ({ libraryId: upd(v, s.libraryId) })),
  setReconcile: (v) => set((s) => ({ reconcile: upd(v, s.reconcile) })),
  setAppInfo: (v) => set((s) => ({ appInfo: upd(v, s.appInfo) })),
  setProgress: (v) => set((s) => ({ progress: upd(v, s.progress) })),
  setFetchPaused: (v) => set((s) => ({ fetchPaused: upd(v, s.fetchPaused) })),
  setPlaylists: (v) => set((s) => ({ playlists: upd(v, s.playlists) })),
  setFetchLogs: (v) => set((s) => ({ fetchLogs: upd(v, s.fetchLogs) })),
  setBatchFailures: (v) => set((s) => ({ batchFailures: upd(v, s.batchFailures) })),
  setSkippedFiles: (v) => set((s) => ({ skippedFiles: upd(v, s.skippedFiles) })),
  setAllReconciles: (v) => set((s) => ({ allReconciles: upd(v, s.allReconciles) }))
}))
