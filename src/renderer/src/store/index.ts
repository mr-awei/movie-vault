/**
 * Zustand Store 入口。
 * 从 App.tsx 上帝组件中拆分出来的全局状态管理。
 *
 * Store 列表：
 * - useUIStore - UI 状态（模态框、侧边栏等）
 * - 后续可扩展：useFilterStore、useLibraryStore、usePlaylistStore、useVideoStore
 */

export { useUIStore } from './ui'
