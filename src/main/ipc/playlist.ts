import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import * as playlist from '../lib/playlist'
export function registerPlaylistIpc() {
  ipcMain.handle(IPC.playlistList, () => playlist.listPlaylists())

  ipcMain.handle(IPC.playlistCreate, (_e, name: string) => playlist.createPlaylist(name))

  ipcMain.handle(IPC.playlistDelete, (_e, id: string) => playlist.deletePlaylist(id))

  ipcMain.handle(IPC.playlistRename, (_e, id: string, name: string) => playlist.renamePlaylist(id, name))

  ipcMain.handle(IPC.playlistAddVideo, (_e, id: string, videoId: string) => playlist.addVideoToPlaylist(id, videoId))

  ipcMain.handle(IPC.playlistRemoveVideo, (_e, id: string, videoId: string) => playlist.removeVideoFromPlaylist(id, videoId))

  ipcMain.handle(IPC.playlistReorder, (_e, id: string, videoIds: string[]) => playlist.reorderPlaylist(id, videoIds))

  // 更新播放进度（断点续播）
}


/** system 领域 IPC handler */
