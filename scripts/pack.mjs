/**
 * 打包入口（npm run pack 第二步，build 之后调用）。
 *
 * 默认走 electron-builder.yml 中的 `directories.output: release` 配置，
 * 即产物输出到 <project>/release/。
 *
 * 如需输出到项目外（例如历史上规避 WorkBuddy 索引服务占用 app.asar），
 * 可设置环境变量 yinghai_PACK_OUT=绝对路径 来覆盖：
 *   yinghai_PACK_OUT="C:/Users/xxx/yinghai-release/2026-09-01" npm run pack
 */
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let out
const override = process.env.yinghai_PACK_OUT
if (override) {
  out = path.resolve(override)
  mkdirSync(out, { recursive: true })
  console.log(`[pack] 使用 yinghai_PACK_OUT 覆盖输出目录：${out}`)
} else {
  // 让 electron-builder 直接读取 electron-builder.yml 中的 directories.output
  out = path.join(projectRoot, 'release')
  console.log(`[pack] 使用 electron-builder.yml 默认配置，输出目录：${out}`)
}

const absOut = path.resolve(out)
const args = override
  ? `--config.directories.output="${absOut}"`
  : ''

execSync(`npx electron-builder ${args}`.trim(), {
  stdio: 'inherit',
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/'
  }
})
