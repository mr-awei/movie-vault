import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Vite 插件：构建完成后在输出目录创建 {"type": "commonjs"} 的 package.json。
 *
 * 原因：根目录 package.json 有 "type": "module"，导致所有 .js 文件被当作 ESM 加载。
 * 但主进程/preload 构建输出是 CJS 格式（含 require），被当作 ESM 加载会报
 * "require is not defined in ES module scope"。
 * 在输出目录放一个 {"type": "commonjs"} 的 package.json 可覆盖根目录设置。
 */
function commonjsPackageJson(outDir: string) {
  return {
    name: 'commonjs-package-json',
    closeBundle() {
      const dir = resolve(process.cwd(), outDir)
      mkdirSync(dir, { recursive: true })
      writeFileSync(resolve(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2))
      console.log(`[commonjs-package-json] created ${outDir}/package.json`)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [commonjsPackageJson('out/main')],
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
    plugins: [commonjsPackageJson('out/preload')],
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
