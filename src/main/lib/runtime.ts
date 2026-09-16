/**
 * 运行时设置（不持久化，跟随 Settings 变化即时生效）。
 * 独立模块避免 ipc.ts ↔ index.ts 循环依赖。
 */
import { applyProxyToSession, registerProxyAuth } from './proxy'
import { app } from 'electron'
import type { Settings } from '../../shared/types'

// P1-10：Chromium 代理认证监听，模块加载即注册（app.on 任意阶段可用）
registerProxyAuth()

export const runtime = {
  /** 最小化到托盘（关窗隐藏不退出） */
  minimizeToTray: false
}

/** 应用 Settings 变更到运行时：开机自启 / 最小化到托盘 / 代理（Chromium session） */
export function applyRuntimeSettings(s: Settings): void {
  runtime.minimizeToTray = !!s.minimizeToTray
  try {
    app.setLoginItemSettings({ openAtLogin: !!s.launchAtLogin })
  } catch {
    /* 平台不支持时静默 */
  }
  // v2.3.12：代理同步到 Chromium session，让 net.fetch（cacheRemoteImage）和渲染进程
  // 的图片请求也走代理，与 Node.js fetch + undici dispatcher 保持一致
  applyProxyToSession(s)
}
