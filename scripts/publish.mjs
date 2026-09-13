// 一键发布：本地只推代码，安装包由 GitHub Actions 自动构建 + 签名 + 发布。
//
// 用法（在项目根目录）：
//   node scripts/publish.mjs 2.1.0
//
// 流程：
//   1) 校验版本号格式 vX.Y.Z（去掉 v）
//   2) bump package.json 版本
//   3) 若 更新日志.md 顶部还不是该版本，插入占位段（发布前可手动补充内容后重新跑）
//   4) git add + commit + tag vX.Y.Z
//   5) 推送 main + tag 到 Gitee 和 GitHub
//   6) 提示等待 GitHub Actions（.github/workflows/release.yml）自动构建发布
//
// 前置要求：
//   - GitHub Secrets 已配置 CERT_PASSWORD、GITEE_TOKEN（见 .github/workflows/release.yml 注释）
//   - git remote 走 HTTPS（凭据管理器自动带 token），脚本用显式 URL 分推双端
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 与 git remote 保持一致：origin → GitHub（mr-awei/movie-vault）、gitee → Gitee 同名仓库
const GH = 'https://github.com/mr-awei/movie-vault.git'
const GE = 'https://gitee.com/mr-awei/movie-vault.git'

// 用 fileURLToPath 解码路径（避免 "Movie Vault" 空格被 URL 编码为 %20 导致 chdir 失败）
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
process.chdir(root)

const arg = process.argv[2]?.trim()
if (!arg) {
  console.error('用法：node scripts/publish.mjs <版本号>  例如 node scripts/publish.mjs 2.1.0')
  process.exit(1)
}
const ver = arg.replace(/^v/i, '')
if (!/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error(`版本号格式不对：${ver}（应为 x.y.z）`)
  process.exit(1)
}
const tag = `v${ver}`

// 1) bump package.json
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
if (pkg.version === ver) {
  console.log(`package.json 已是 ${ver}，跳过 bump`)
} else {
  pkg.version = ver
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  console.log(`package.json → ${ver}`)
}

// 2) 更新日志 顶部占位（若还不是该版本）
//    兼容两种版本标题写法：Keep a Changelog「## [x.y.z]」与旧式「## vx.y.z（date）」
const clPath = path.join(root, '更新日志.md')
const cl = readFileSync(clPath, 'utf-8')
const hasSection = cl.includes(`## [${ver}]`) || cl.includes(`## v${ver}（`)
if (hasSection) {
  console.log(`更新日志 已有 ${ver} 段，跳过`)
} else {
  const date = new Date().toISOString().slice(0, 10)
  const rest = cl.replace(/^# 更新日志（Changelog）\s*\n+/i, '').trimStart()
  writeFileSync(
    clPath,
    `# 更新日志（Changelog）\n\n## [${ver}] - ${date}\n\n**待补充**：请在发布前把本次改动写进这一段（可重复执行本脚本，已存在时不会覆盖）。\n\n${rest}`,
    'utf-8'
  )
  console.log(`更新日志 已插入 ${ver} 占位段（发布前请补充内容，之后可重跑）`)
}

// 3) 提交 + tag
execSync('git add -A', { stdio: 'inherit' })
try {
  execSync(`git commit -m "v${ver}: 发布"`, { stdio: 'inherit' })
} catch {
  console.log('无内容可提交（工作区干净）')
}
// 若 tag 已存在则删除重建（允许重跑）
try {
  execSync(`git tag -d ${tag}`, { stdio: 'ignore' })
} catch {}
execSync(`git tag ${tag}`, { stdio: 'inherit' })
console.log(`tag ${tag} 已创建`)

// 4) 双端推送（显式 URL 分推，互不阻塞）
for (const [name, url] of [
  ['Gitee', GE],
  ['GitHub', GH]
]) {
  console.log(`\n=== push ${name} ===`)
  try {
    execSync(`git push ${url} main ${tag}`, { stdio: 'inherit' })
    console.log(`${name} 推送成功`)
  } catch (e) {
    console.error(`${name} 推送失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

// 5) 提示
console.log(`\n==============================================`)
console.log(` 已推送 ${tag}，等待 GitHub Actions 自动构建发布`)
console.log(` 查看进度：https://github.com/mr-awei/movie-vault/actions`)
console.log(` 注意：Gitee 无 CI，Gitee Release 由 Actions 同步 GitHub 下载链接`)
console.log(`==============================================`)
