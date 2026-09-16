import { registerLibraryIpc } from './library'
import { registerVideoIpc } from './video'
import { registerSettingsIpc } from './settings'
import { registerPlaylistIpc } from './playlist'
import { registerSystemIpc } from './system'
import { registerMarkersIpc } from './markers'
export { runUpdateCheck } from './helpers'

/** 注册所有 IPC handler（按领域拆分） */
export function registerIpc() {
  registerLibraryIpc()
  registerVideoIpc()
  registerSettingsIpc()
  registerPlaylistIpc()
  registerSystemIpc()
  registerMarkersIpc()
}
