import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      // 每次 build 清空 out/main，避免旧版文件残留导致打包时混入历史 chunk
      emptyOutDir: true,
      rollupOptions: {
        // 主进程依赖 Node 内置模块与 electron，保持外部化（electron-vite 默认已处理）
        // better-sqlite3 是原生模块，内部使用 CommonJS require，必须 external，
        // 否则打包进 ESM 产物后会报 "require is not defined in ES module scope"
        external: ['electron', 'better-sqlite3'],
        // 主进程输出 CJS 格式（与 preload 一致），避免 ESM/CJS 混合导致
        // better-sqlite3 等原生模块加载失败、electron 进程启动后立即退出
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  preload: {
    build: {
      emptyOutDir: true,
      rollupOptions: {
        external: ['electron'],
        // 强制 CJS 输出为 .js（避免 ESM preload + contextBridge 的兼容性问题，
        // 导致渲染进程的 window.api 暴露失败）
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      // vite 用 content-hash 命名 chunk，每次构建旧 chunk 名字都会变，
      // 不清空 out 就会堆满历史 chunk（之前 8/30 ~ 9/1 塞了 30+ 个）
      emptyOutDir: true,
      rollupOptions: {
        // 渲染进程打包进浏览器环境，不外部化 react
      }
    },
    plugins: [react()]
  }
})
