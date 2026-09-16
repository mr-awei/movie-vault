const fs = require('fs')
const pkg = 'E:/Movie Vault/package.json'
const zh = 'E:/Movie Vault/更新日志.md'
const en = 'E:/Movie Vault/CHANGELOG.en.md'

// 1) package.json version 2.10.0 -> 2.11.0
let p = fs.readFileSync(pkg, 'utf8')
p = p.replace('"version": "2.10.0"', '"version": "2.11.0"')
fs.writeFileSync(pkg, p)

// 2) 更新日志.md insert 2.11.0 section after header
let z = fs.readFileSync(zh, 'utf8')
const zhAnchor = '# 更新日志（Changelog）\n'
if (!z.includes(zhAnchor)) { console.log('WARN zh anchor'); process.exit(1) }
const zhSec = `# 更新日志（Changelog）

## [2.11.0] - 2026-09-16

**P2 优化清单实施：原生弹窗替换 / 备份还原 / 数据收口 / 类型安全**

### 新增功能
- **内置备份 / 还原（P2-7）**：设置 → 数据与存储 新增「导出备份 / 导入备份」。
  纯 Node 手写 zip（零依赖），导出 SQLite 数据库 + data.json + 版本清单；
  导入前自动备份现有数据库为 \`.pre-restore\`，schema 校验 + 重启生效提示。
- **原生弹窗全替换（P2-4）**：删除影片、删除媒体库的密码输入改为主题一致的
  PasswordPromptModal（Esc/遮罩取消、Enter 提交、错误内联提示）；
  清空海报缓存的 window.confirm 改为 ConfirmModal；
  7 处 window.alert 统一收敛为 toast 提示。

### 架构 / 类型
- **preload 事件类型化（P2-3）**：4 处 \`payload as never\` 改为随回调签名联动的
  类型断言，主进程推送 payload 形状变化时渲染端直接编译报错。
- **previewTasks 移出 data.json（P2-5）**：预览任务/清单主存储已在 SQLite 表，
  data.json 不再双写（迁移完成后加载即剥离旧字段）。

### 修复 / 收敛（P2-8）
- **proxy dispatcher 释放**：代理配置变化时关闭旧 Agent，防 socket 泄漏
- **播放列表重排去重**：reorder 前 \`new Set\` 去重 + 过滤已删影片
- **Open Library 结果校验**：标题/主题匹配电影特征（FILM_HINTS），纯书籍结果不再误刮
- **死代码清理**：images.ts 删除 generatePreviewSet 整条死链（含 spawnFrameAt/mapLimit 等）
- **排序常量 i18n 对齐**：RES_ORDER/DUR_ORDER/SCORE_ORDER 与 bucket() 输出对齐，修复语言切换失配
- **VirtualizedWall key 修复**：行 key 改用 video.id，排序后不再强制卸载重挂载
- **更新定时器清理**：before-quit clearInterval，进程退出更干净

## [2.10.0] - 2026-09-16
`
z = z.replace(zhAnchor, zhSec)
fs.writeFileSync(zh, z)

// 3) CHANGELOG.en.md insert
let e = fs.readFileSync(en, 'utf8')
const enAnchor = e.match(/^# [^\n]*\n\n/m)
if (!enAnchor) { console.log('WARN en anchor'); process.exit(1) }
const enSec = `## [2.11.0] - 2026-09-16

**P2 optimization batch: native dialog replacement / backup & restore / data convergence / type safety**

### New features
- **Built-in Backup / Restore (P2-7)**: Settings → Data & Storage now has "Export backup / Import backup".
  Zero-dependency hand-written zip (Node zlib), exports SQLite DB + data.json + manifest;
  import backs up the current DB to \`.pre-restore\` first, validates schema, prompts restart.
- **Native dialog replacement (P2-4)**: delete-video / delete-library password prompts now use the
  theme-consistent PasswordPromptModal (Esc/backdrop cancel, Enter submit, inline error);
  clear-poster-cache window.confirm replaced by ConfirmModal; 7 window.alert calls unified to toasts.

### Architecture / types
- **preload event typing (P2-3)**: 4 \`payload as never\` casts replaced with callback-signature-linked
  assertions, so a changed payload shape fails compilation in the renderer.
- **previewTasks out of data.json (P2-5)**: preview tasks/manifests live in SQLite tables;
  data.json no longer double-writes them (stripped on load once migration is done).

### Fixes / cleanup (P2-8)
- proxy dispatcher closed on config change (socket leak)
- playlist reorder dedupes with \`new Set\` and filters removed videos
- Open Library result validation (FILM_HINTS) — book-only results no longer scraped
- dead code removal: generatePreviewSet chain in images.ts
- sort constants aligned with bucket() i18n output (language-switch fix)
- VirtualizedWall row key now uses video.id (no forced remount on sort)
- update timer cleared on before-quit

`
e = e.replace(enAnchor[0], enAnchor[0] + enSec)
fs.writeFileSync(en, e)
console.log('version + changelogs bumped to 2.11.0')
