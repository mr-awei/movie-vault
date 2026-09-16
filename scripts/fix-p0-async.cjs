const fs = require('fs')
const p = 'E:/Movie Vault/src/main/index.ts'
let s = fs.readFileSync(p, 'utf8')

s = s.replace(
  `function isLmAllowedPath(real: string): boolean {
  const roots = [
    path.join(app.getPath('userData'), 'posters'),
    path.join(app.getPath('userData'), 'preview-frames'),
    path.join(app.getPath('userData'), 'images'),
    ...repo.listLibraries().map((l) => l.folderPath)
  ].map((rp) => path.normalize(rp).toLowerCase())
  const norm = path.normalize(real).toLowerCase()
  return roots.some((root) => norm === root || norm.startsWith(root + path.sep))
}`,
  `async function isLmAllowedPath(real: string): Promise<boolean> {
  const libs = await repo.listLibraries().catch(() => [])
  const roots = [
    path.join(app.getPath('userData'), 'posters'),
    path.join(app.getPath('userData'), 'preview-frames'),
    path.join(app.getPath('userData'), 'images'),
    ...libs.map((l) => l.folderPath)
  ].map((rp) => path.normalize(rp).toLowerCase())
  const norm = path.normalize(real).toLowerCase()
  return roots.some((root) => norm === root || norm.startsWith(root + path.sep))
}`
)

s = s.replace(
  `      if (!isLmAllowedPath(real)) {`,
  `      if (!(await isLmAllowedPath(real))) {`
)

fs.writeFileSync(p, s)
console.log('async whitelist applied')
