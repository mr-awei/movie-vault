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
  videoScan: (libraryId) => ipcRenderer.invoke(IPC.videoScan, libraryId),
  videoOpen: (id) => ipcRenderer.invoke(IPC.videoOpen, id),
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
  onPosterFetched: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload as never)
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
  videoFrameFallback: (id) => ipcRenderer.invoke(IPC.videoFrameFallback, id),
  videoSetPreviewAsCover: (id, previewPath) => ipcRenderer.invoke(IPC.videoSetPreviewAsCover, id, previewPath),
  onScanProgress: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, p: unknown) => cb(p as never)
    ipcRenderer.on(IPC.scanProgress, handler)
    return () => ipcRenderer.removeListener(IPC.scanProgress, handler)
  },
  libraryGetCodes: (libraryId) => ipcRenderer.invoke(IPC.libraryGetCodes, libraryId),
  libraryExportCodes: (id, fmt) => ipcRenderer.invoke(IPC.libraryExportCodes, id, fmt),
  specGet: () => ipcRenderer.invoke(IPC.specGet)
}

contextBridge.exposeInMainWorld('api', api)
