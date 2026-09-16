import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import * as repo from '../lib/repo'
import { applyRuntimeSettings } from '../lib/runtime'
import { startWatching, stopWatching } from '../lib/watcher'
export function registerSettingsIpc() {
  ipcMain.handle(IPC.settingsGet, () => repo.getSettings())

  ipcMain.handle(IPC.settingsSet, async (_e, patch: any) => {
    const saved = await repo.saveSettings(patch)
    // 运行时设置即时生效：开机自启 / 最小化到托盘
    const s = await repo.getSettings()
    applyRuntimeSettings(s)
    // 文件夹自动监控：开关变更时启动/停止所有媒体库监控
    if (patch.autoWatchFolders !== undefined) {
      const libs = await repo.listLibraries()
      if (s.autoWatchFolders) {
        for (const lib of libs) {
          startWatching(lib.id, lib.folderPath, s.watchDebounceMs ?? 3000)
        }
      } else {
        for (const lib of libs) {
          stopWatching(lib.id)
        }
      }
    }
    return saved
  })
  // ---------- 卸载应用（危险操作） ----------
}


/** playlist 领域 IPC handler */
