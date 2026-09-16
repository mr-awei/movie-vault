/**
 * IPC 模块已迁移到 src/main/ipc/ 目录。
 * 此文件保留向后兼容，re-export 新模块。
 *
 * 新模块结构：
 * - ipc/index.ts - 主入口，包含 registerIpc() 和所有共享辅助函数
 * - 按领域拆分为 registerLibraryIpc / registerVideoIpc / registerSettingsIpc / registerPlaylistIpc / registerSystemIpc
 */
export * from '../ipc/index'
