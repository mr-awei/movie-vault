import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppApi } from '../shared/api-types'

console.log('[moviemanger preload] loaded, exposing window.api')

const api: AppApi = {
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  libraryList: () => ipcRenderer.invoke(IPC.libraryList),
  libraryAdd: (input) => ipcRenderer.invoke(IPC.libraryAdd, input),
  libraryRemove: (id) => ipcRenderer.invoke(IPC.libraryRemove, id),
  libraryUpdate: (id, patch) => ipcRenderer.invoke(IPC.libraryUpdate, id, patch),
  libraryScanAndReconcile: (libraryId) => ipcRenderer.invoke(IPC.libraryScanAndReconcile, libraryId),
  libraryReconcile: (libraryId) => ipcRenderer.invoke(IPC.libraryReconcile, libraryId),
  libraryReconcileCache: (libraryId) => ipcRenderer.invoke(IPC.libraryReconcileCache, libraryId),
  videoList: (filter) => ipcRenderer.invoke(IPC.videoList, filter),
  videoGet: (id) => ipcRenderer.invoke(IPC.videoGet, id),
  videoUpdate: (id, patch) => ipcRenderer.invoke(IPC.videoUpdate, id, patch),
  videoLockMany: (ids, locked) => ipcRenderer.invoke(IPC.videoLockMany, ids, locked),
  videoBatchUpdate: (ids, patch) => ipcRenderer.invoke(IPC.videoBatchUpdate, ids, patch),
  markerList: (videoId) => ipcRenderer.invoke(IPC.markerList, videoId),
  markerCreate: (videoId, positionSec, name, tags) => ipcRenderer.invoke(IPC.markerCreate, videoId, positionSec, name, tags),
  markerDelete: (id) => ipcRenderer.invoke(IPC.markerDelete, id),
  videoScan: (libraryId) => ipcRenderer.invoke(IPC.videoScan, libraryId),
  videoOpen: (id, startSec) => ipcRenderer.invoke(IPC.videoOpen, id, startSec),
  videoOpenPlaylist: (videos) => ipcRenderer.invoke(IPC.videoOpenPlaylist, videos),
  videoRegeneratePoster: (id) => ipcRenderer.invoke(IPC.videoRegeneratePoster, id),
  videoFetchPoster: (id) => ipcRenderer.invoke(IPC.videoFetchPoster, id),
  libraryFetchAll: (libraryId, force) => ipcRenderer.invoke(IPC.libraryFetchAll, libraryId, force),
  libraryFetchPause: () => ipcRenderer.invoke(IPC.libraryFetchPause),
  libraryFetchResume: () => ipcRenderer.invoke(IPC.libraryFetchResume),
  libraryFetchStop: () => ipcRenderer.invoke(IPC.libraryFetchStop),
  videoFetchDetail: (id, idOverride) =>
    ipcRenderer.invoke(IPC.videoFetchDetail, id, idOverride),
  videoFetchByUrl: (id, url) =>
    ipcRenderer.invoke(IPC.videoFetchByUrl, id, url),
  videoRenameFile: (id, newTitle) => ipcRenderer.invoke(IPC.videoRenameFile, id, newTitle),
  videoProbe: (id) => ipcRenderer.invoke(IPC.videoProbe, id),
  libraryBatchProbe: (libraryId) => ipcRenderer.invoke(IPC.libraryBatchProbe, libraryId),
  videoDeleteFile: (id) => ipcRenderer.invoke(IPC.videoDeleteFile, id),
  videoInspectForDelete: (id) => ipcRenderer.invoke(IPC.videoInspectForDelete, id),
  videoSwitchPoster: (id, source) => ipcRenderer.invoke(IPC.videoSwitchPoster, id, source),
  libraryPreviewRenames: (libraryId) => ipcRenderer.invoke(IPC.libraryPreviewRenames, libraryId),
  libraryApplyRenames: (libraryId, items) =>
    ipcRenderer.invoke(IPC.libraryApplyRenames, libraryId, items),
  proxyTest: (settings) => ipcRenderer.invoke(IPC.proxyTest, settings),
  cacheClear: () => ipcRenderer.invoke(IPC.cacheClear),
  ffmpegStatus: () => ipcRenderer.invoke(IPC.ffmpegStatus),
  appUninstall: (keepUser: boolean) => ipcRenderer.invoke(IPC.appUninstall, keepUser),
  backupExport: () => ipcRenderer.invoke(IPC.backupExport),
  backupImport: () => ipcRenderer.invoke(IPC.backupImport),
  onPosterFetched: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload as Parameters<typeof cb>[0])
    ipcRenderer.on(IPC.posterFetched, handler)
    return () => ipcRenderer.removeListener(IPC.posterFetched, handler)
  },
  shellRevealInFolder: (p) => ipcRenderer.invoke(IPC.shellRevealInFolder, p),
  settingsGet: () => ipcRenderer.invoke(IPC.settingsGet),
  settingsSet: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
  dialogSelectFolder: () => ipcRenderer.invoke(IPC.dialogSelectFolder),
  dialogSelectFile: () => ipcRenderer.invoke(IPC.dialogSelectFile),
  openPath: (p) => ipcRenderer.invoke(IPC.openPath, p),
  openExternal: (u) => ipcRenderer.invoke(IPC.openExternal, u),
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  lockSet: (password) => ipcRenderer.invoke(IPC.lockSet, password),
  lockVerify: (password) => ipcRenderer.invoke(IPC.lockVerify, password),
  lockDelete: (password) => ipcRenderer.invoke(IPC.lockDelete, password),
  appQuit: () => ipcRenderer.invoke(IPC.appQuit),
  updateCheck: () => ipcRenderer.invoke(IPC.updateCheck),
  videoGeneratePreviews: (id) => ipcRenderer.invoke(IPC.videoGeneratePreviews, id),
  previewTaskStats: () => ipcRenderer.invoke(IPC.previewTaskStats),
  previewTaskEnqueue: (id, requestedCount) => ipcRenderer.invoke(IPC.previewTaskEnqueue, id, requestedCount),
  previewTaskPause: () => ipcRenderer.invoke(IPC.previewTaskPause),
  previewTaskResume: () => ipcRenderer.invoke(IPC.previewTaskResume),
  previewTaskCancel: (taskId) => ipcRenderer.invoke(IPC.previewTaskCancel, taskId),
  previewTaskRetry: (taskId) => ipcRenderer.invoke(IPC.previewTaskRetry, taskId),
  onPreviewTaskEvent: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload as Parameters<typeof cb>[0])
    ipcRenderer.on(IPC.previewTaskEvent, handler)
    return () => ipcRenderer.removeListener(IPC.previewTaskEvent, handler)
  },
  videoFrameFallback: (id) => ipcRenderer.invoke(IPC.videoFrameFallback, id),
  videoSetPreviewAsCover: (id, previewPath) => ipcRenderer.invoke(IPC.videoSetPreviewAsCover, id, previewPath),
  onScanProgress: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, p: unknown) => cb(p as Parameters<typeof cb>[0])
    ipcRenderer.on(IPC.scanProgress, handler)
    return () => ipcRenderer.removeListener(IPC.scanProgress, handler)
  },
  libraryGetCodes: (libraryId) => ipcRenderer.invoke(IPC.libraryGetCodes, libraryId),
  libraryExportCodes: (id, fmt) => ipcRenderer.invoke(IPC.libraryExportCodes, id, fmt),
  specGet: () => ipcRenderer.invoke(IPC.specGet),
  // ---------- v2.9.0 新增 ----------
  libraryFindDuplicates: (libraryId) => ipcRenderer.invoke(IPC.libraryFindDuplicates, libraryId),
  videoReadNfo: (id) => ipcRenderer.invoke(IPC.videoReadNfo, id),
  videoWriteNfo: (id) => ipcRenderer.invoke(IPC.videoWriteNfo, id),
  playlistList: () => ipcRenderer.invoke(IPC.playlistList),
  playlistCreate: (name) => ipcRenderer.invoke(IPC.playlistCreate, name),
  playlistDelete: (id) => ipcRenderer.invoke(IPC.playlistDelete, id),
  playlistRename: (id, name) => ipcRenderer.invoke(IPC.playlistRename, id, name),
  playlistAddVideo: (id, videoId) => ipcRenderer.invoke(IPC.playlistAddVideo, id, videoId),
  playlistRemoveVideo: (id, videoId) => ipcRenderer.invoke(IPC.playlistRemoveVideo, id, videoId),
  playlistReorder: (id, videoIds) => ipcRenderer.invoke(IPC.playlistReorder, id, videoIds),
  videoUpdatePlaybackPosition: (id, positionSec) => ipcRenderer.invoke(IPC.videoUpdatePlaybackPosition, id, positionSec),
  watchHistoryList: (limit) => ipcRenderer.invoke(IPC.watchHistoryList, limit),
  watchHistoryStats: () => ipcRenderer.invoke(IPC.watchHistoryStats),
  watchHistoryClear: () => ipcRenderer.invoke(IPC.watchHistoryClear),
  onWatcherEvent: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload as Parameters<typeof cb>[0])
    ipcRenderer.on(IPC.watcherEvent, handler)
    return () => ipcRenderer.removeListener(IPC.watcherEvent, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
