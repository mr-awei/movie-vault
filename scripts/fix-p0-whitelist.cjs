const fs = require('fs')
const p = 'E:/Movie Vault/src/main/index.ts'
let s = fs.readFileSync(p, 'utf8')

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

// 1. Insert whitelist fn before registerLocalMedia (CRLF-tolerant)
const anchor = /(\/\*\* 注册 lm:\/\/ 协议，让渲染进程安全加载本地图片（海报\/侧车图\/手动图） \*\/\r?\nfunction registerLocalMedia\(\): void \{)/
if (anchor.test(s)) {
  s = s.replace(anchor, whitelistFn + '\n$1')
  console.log('whitelist fn inserted')
} else {
  console.log('WARN: registerLocalMedia anchor not found')
}

// 2. Insert whitelist check inside handler after ext check
const extCheck = /(if \(!POSTER_MIME\[ext\]\) \{\r?\n\s+console\.warn\('\[lm\] 不支持的扩展名[^\n]*\r?\n\s+return new Response\('forbidden', \{ status: 403 \}\)\r?\n\s+\})/
if (extCheck.test(s)) {
  s = s.replace(extCheck, `$1
      // v2.10.x 安全加固：路径白名单，防止渲染进程被注入后经 lm:// 读取任意本地文件
      if (!isLmAllowedPath(real)) {
        console.warn('[lm] 路径不在白名单, path=' + real)
        return new Response('forbidden', { status: 403 })
      }`)
  console.log('whitelist check inserted')
} else {
  console.log('WARN: ext check anchor not found')
}

fs.writeFileSync(p, s)
