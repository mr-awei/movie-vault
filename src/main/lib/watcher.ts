import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { IPC } from '../../shared/ipc'
import { VIDEO_EXTS } from './scanner'

/**
 * 文件夹自动监控模块。
 * 监控媒体库根目录的文件变化，去抖后触发扫描事件通知渲染进程。
 * 由 settings.autoWatchFolders 控制开关。
 */

interface WatcherEntry {
  libraryId: string
  folderPath: string
  watcher: FSWatcher
  /** 去抖定时器 */
  debounceTimer: NodeJS.Timeout | null
  /** 本次去抖窗口内收集到的变化路径 */
  pendingPaths: Set<string>
}

const watchers = new Map<string, WatcherEntry>()

/** 判断路径是否为视频文件（按扩展名） */
function isVideoFile(p: string): boolean {
  const ext = path.extname(p).toLowerCase()
  return VIDEO_EXTS.has(ext)
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
 */
export function startWatching(libraryId: string, folderPath: string, debounceMs = 3000): void {
  // 先停止旧的
  stopWatching(libraryId)

  try {
    const entry: WatcherEntry = {
      libraryId,
      folderPath,
      watcher: watch(folderPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return
        const fullPath = path.isAbsolute(filename) ? filename : path.join(folderPath, filename)
        // 只关心视频文件变化
        if (!isVideoFile(fullPath)) return

        entry.pendingPaths.add(fullPath)

        // 清除旧定时器，重新去抖
        if (entry.debounceTimer) {
          clearTimeout(entry.debounceTimer)
        }
        entry.debounceTimer = setTimeout(() => {
          const paths = [...entry.pendingPaths]
          entry.pendingPaths.clear()
          entry.debounceTimer = null
          if (paths.length > 0) {
            emitWatcherEvent(libraryId, 'changed', paths)
          }
        }, debounceMs)
      }),
      debounceTimer: null,
      pendingPaths: new Set()
    }

    // 监听 watcher 错误（如目录被删除）
    entry.watcher.on('error', (err) => {
      console.warn(`[watcher] 监控出错 ${folderPath}:`, err.message)
    })

    watchers.set(libraryId, entry)
    console.log(`[watcher] 开始监控: ${folderPath}`)
  } catch (e) {
    console.error(`[watcher] 启动监控失败 ${folderPath}:`, (e as Error).message)
  }
}

/** 停止监控一个媒体库文件夹 */
export function stopWatching(libraryId: string): void {
  const entry = watchers.get(libraryId)
  if (entry) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    entry.watcher.close()
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
