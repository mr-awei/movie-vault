const fs = require('fs')
const p = 'E:/Movie Vault/src/main/index.ts'
let s = fs.readFileSync(p, 'utf8')

// --- Fix 1: repo import ---
s = s.replace(
  "import { registerIpc, runUpdateCheck } from './lib/ipc'",
  "import { registerIpc, runUpdateCheck } from './lib/ipc'\nimport * as repo from './lib/repo'"
)

// --- Fix 1b: lm:// whitelist ---
const whitelistFn = `/** lm:// 协议路径白名单：只允许加载 userData 图片目录 + 媒体库目录内的图片 */
function isLmAllowedPath(real: string): boolean {
  const roots = [
    path.join(app.getPath('userData'), 'posters'),
    path.join(app.getPath('userData'), 'preview-frames'),
    path.join(app.getPath('userData'), 'images'),
    ...repo.listLibraries().map((l) => l.folderPath)
  ].map((rp) => path.normalize(rp).toLowerCase())
  const norm = path.normalize(real).toLowerCase()
  return roots.some((root) => norm === root || norm.startsWith(root + path.sep))
}
`
s = s.replace(
  "/** 注册 lm:// 协议，让渲染进程安全加载本地图片（海报/侧车图/手动图） */\nfunction registerLocalMedia(): void {",
  whitelistFn + "\n/** 注册 lm:// 协议，让渲染进程安全加载本地图片（海报/侧车图/手动图） */\nfunction registerLocalMedia(): void {"
)

// whitelist check inside handler, after ext check
s = s.replace(
  `      if (!POSTER_MIME[ext]) {
        console.warn('[lm] 不支持的扩展名, ext=' + JSON.stringify(ext) + ' path=' + real)
        return new Response('forbidden', { status: 403 })
      }`,
  `      if (!POSTER_MIME[ext]) {
        console.warn('[lm] 不支持的扩展名, ext=' + JSON.stringify(ext) + ' path=' + real)
        return new Response('forbidden', { status: 403 })
      }
      // v2.10.x 安全加固：路径白名单，防止渲染进程被注入后经 lm:// 读取任意本地文件
      if (!isLmAllowedPath(real)) {
        console.warn('[lm] 路径不在白名单, path=' + real)
        return new Response('forbidden', { status: 403 })
      }`
)

// --- Fix 2: single-instance lock dedup (remove first lock block at top) ---
const dupBlock = `if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.show()
      win.focus()
    }
  })
}

`
if (s.includes(dupBlock)) {
  s = s.replace(dupBlock, '')
  console.log('removed duplicate single-instance lock block')
} else {
  console.log('WARN: dup lock block not found')
}

fs.writeFileSync(p, s)
console.log('index.ts patched')
