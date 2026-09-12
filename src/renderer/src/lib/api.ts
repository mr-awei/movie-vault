import type { AppApi } from '../../../shared/api-types'

declare global {
  interface Window {
    api: AppApi
  }
}

const w = typeof window !== 'undefined' ? window.api : undefined
if (!w) {
  const msg =
    '[moviemanger] window.api 未定义：preload 脚本未加载或 contextBridge 暴露失败。' +
    '请确认主进程 webPreferences.preload 指向正确的构建产物（CJS .js，避免 ESM 兼容问题）。'
  console.error(msg)
  throw new Error(msg)
}

export const api: AppApi = w
