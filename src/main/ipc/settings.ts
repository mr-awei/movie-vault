import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import * as repo from '../lib/repo'
import { applyRuntimeSettings } from '../lib/runtime'
import { startWatching, stopWatching } from '../lib/watcher'
/** A-2: settings 白名单——仅允许 Settings 已知键；未知键丢弃（渲染层注入防护）。 */
const SETTINGS_PATCH_KEYS = new Set([
  'playerPath', 'ffmpegPath', 'theme', 'posterDensity', 'dataSource', 'customSourceOrder',
  'disabledSources', 'omdbKey', 'movieDbKey', 'includeAdult', 'openLibraryKey',
  'proxyMode', 'proxyHost', 'proxyPort', 'proxyUser', 'proxyPass', 'autoRescan',
  'fetchConcurrency', 'fetchIntervalMs', 'scanMinSizeMB', 'launchAtLogin', 'scanOnStartup',
  'minimizeToTray', 'defaultSort', 'privacyDefaultOn', 'lockEnabled', 'scanConcurrency',
  'previewBackgroundLoad', 'previewFrameCount', 'previewQualityMode', 'updateSource',
  'autoUpdateFrequency', 'lastUpdateCheck', 'pendingUpdate', 'ignoredUnlistedPaths',
  'noticeDismissed', 'suppressIntroExcelNotice', 'language', 'listViewMode',
  'autoWatchFolders', 'watchDebounceMs'
])
function sanitizeSettingsPatch(patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, vv] of Object.entries(patch as Record<string, unknown>)) {
    if (SETTINGS_PATCH_KEYS.has(k)) out[k] = vv
  }
  return out
}

export function registerSettingsIpc() {
  ipcMain.handle(IPC.settingsGet, () => repo.getSettings())

  ipcMain.handle(IPC.settingsSet, async (_e, patch: unknown) => {
    const clean = sanitizeSettingsPatch(patch)
    if (Object.keys(clean).length === 0) return repo.getSettings()
    const saved = await repo.saveSettings(clean)
    // 运行时设置即时生效：开机自启 / 最小化到托盘
    const s = await repo.getSettings()
    applyRuntimeSettings(s)
    // 文件夹自动监控：开关变更时启动/停止所有媒体库监控
    if (clean.autoWatchFolders !== undefined) {
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
