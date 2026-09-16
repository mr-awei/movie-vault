import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import path from 'node:path'
import { IPC } from '../../shared/ipc'
import { VIDEO_EXTS } from './scanner'

/**
 * 文件夹自动监控模块（chokidar 实现）。
 * 监控媒体库根目录的文件变化，去抖后触发扫描事件通知渲染进程。
 * 由 settings.autoWatchFolders 控制开关。
 *
 * chokidar 优势：
 * - 跨平台可靠（Windows/macOS/Linux），替代原生 fs.watch 的 recursive 不可靠问题
 * - 支持 awaitWriteFinish（等待大文件写入完成再触发事件）
 * - 支持 usePolling（网络盘/外接盘更可靠）
 * - 细粒度事件（add/addDir/change/unlink/unlinkDir）
 */

interface WatcherEntry {
  libraryId: string
  folderPath: string
  watcher: FSWatcher
  /** 去抖定时器 */
  debounceTimer: NodeJS.Timeout | null
  /** 本次去抖窗口内收集到的变化路径 */
  pendingPaths: Set<string>
  /** 是否使用轮询模式（网络盘/外接盘自动启用） */
  polling: boolean
}

const watchers = new Map<string, WatcherEntry>()

/** 判断路径是否为视频文件（按扩展名） */
function isVideoFile(p: string): boolean {
  const ext = path.extname(p).toLowerCase()
  return VIDEO_EXTS.has(ext)
}

/**
 * 检测路径是否为网络盘或外接盘（需要启用轮询模式）。
 * Windows 上：网络驱动器（\\server\share 或 映射盘符）、可移动磁盘（USB）
 */
function isRemovableOrNetworkPath(folderPath: string): boolean {
  const p = folderPath.toLowerCase()
  // 网络路径：\\server\share 或 //server/share
  if (p.startsWith('\\\\') || p.startsWith('//')) return true
  // 常见网络盘映射盘符（用户可能自定义，这里只做启发式检测）
  // 可移动磁盘通常是 D: E: F: 等，但无法仅凭盘符判断
  // 保守策略：非系统盘（C:）且非固定盘都可能是外接盘
  // 实际上 chokidar 在 Windows 上原生事件通常够用，只有网络盘需要 polling
  return false
}

/** 向所有渲染窗口推送监控事件 */
function emitWatcherEvent(libraryId: string, type: 'changed' | 'added' | 'removed', paths: string[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.watcherEvent, { libraryId, type, paths })
  }
}

/**
 * 开始监控一个媒体库文件夹。
 * 如果已在监控则先停止再重新开始。
 *
 * @param libraryId 媒体库 ID
 * @param folderPath 文件夹路径
 * @param debounceMs 去抖时间（毫秒），默认 3000ms
 * @param forcePolling 强制启用轮询模式（网络盘/外接盘建议）
 */
export function startWatching(libraryId: string, folderPath: string, debounceMs = 3000, forcePolling = false): void {
  // 先停止旧的
  stopWatching(libraryId)

  try {
    const usePolling = forcePolling || isRemovableOrNetworkPath(folderPath)

    const watcher = chokidar.watch(folderPath, {
      persistent: true,
      ignoreInitial: true, // 忽略初始扫描，只监控变化
      followSymlinks: true,
      // 等待文件写入完成：稳定 2 秒后才触发 add/change 事件
      // 避免大文件复制过程中触发多次事件、或文件未写完就扫描
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      },
      // 忽略隐藏文件和目录（.DS_Store、Thumbs.db、.git 等）
      ignored: /(^|[\/\\])\../,
      depth: 99, // 递归深度
      // 轮询模式：网络盘/外接盘更可靠，但 CPU 占用略高
      usePolling,
      interval: 100,
      binaryInterval: 300
    })

    const entry: WatcherEntry = {
      libraryId,
      folderPath,
      watcher,
      debounceTimer: null,
      pendingPaths: new Set(),
      polling: usePolling
    }

    /** 收集变化路径并去抖 */
    const collectChange = (filePath: string) => {
      if (!isVideoFile(filePath)) return
      entry.pendingPaths.add(filePath)

      if (entry.debounceTimer) {
        clearTimeout(entry.debounceTimer)
      }
      entry.debounceTimer = setTimeout(() => {
        const paths = [...entry.pendingPaths]
        entry.pendingPaths.clear()
        entry.debounceTimer = null
        if (paths.length > 0) {
          console.log(`[watcher] 检测到 ${paths.length} 个视频文件变化:`, paths.slice(0, 3).map((p) => path.basename(p)))
          emitWatcherEvent(libraryId, 'changed', paths)
        }
      }, debounceMs)
    }

    // 新文件添加
    watcher.on('add', (filePath) => {
      collectChange(filePath)
    })

    // 文件内容变化
    watcher.on('change', (filePath) => {
      collectChange(filePath)
    })

    // 文件删除
    watcher.on('unlink', (filePath) => {
      if (!isVideoFile(filePath)) return
      console.log(`[watcher] 检测到文件删除: ${path.basename(filePath)}`)
      emitWatcherEvent(libraryId, 'removed', [filePath])
    })

    // 目录删除（目录内文件可能已被 unlink 事件覆盖）
    watcher.on('unlinkDir', (dirPath) => {
      console.log(`[watcher] 检测到目录删除: ${dirPath}`)
    })

    // 监控错误（如目录被删除、权限不足）
    watcher.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[watcher] 监控出错 ${folderPath}:`, msg)
    })

    // 监控就绪
    watcher.on('ready', () => {
      console.log(`[watcher] 开始监控: ${folderPath} (${usePolling ? '轮询模式' : '原生事件模式'})`)
    })

    watchers.set(libraryId, entry)
  } catch (e) {
    console.error(`[watcher] 启动监控失败 ${folderPath}:`, (e as Error).message)
  }
}

/** 停止监控一个媒体库文件夹 */
export function stopWatching(libraryId: string): void {
  const entry = watchers.get(libraryId)
  if (entry) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    entry.watcher.close().catch(() => {})
    watchers.delete(libraryId)
    console.log(`[watcher] 停止监控: ${entry.folderPath}`)
  }
}

/** 停止所有监控（应用退出时调用） */
export function stopAllWatchers(): void {
  for (const id of [...watchers.keys()]) {
    stopWatching(id)
  }
}

/** 当前正在监控的媒体库 id 列表 */
export function listWatchedLibraries(): string[] {
  return [...watchers.keys()]
}

/** 获取指定媒体库的监控状态 */
export function getWatcherStatus(libraryId: string): { watching: boolean; polling: boolean; pendingCount: number } | null {
  const entry = watchers.get(libraryId)
  if (!entry) return null
  return {
    watching: true,
    polling: entry.polling,
    pendingCount: entry.pendingPaths.size
  }
}
