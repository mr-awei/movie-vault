const fs = require('fs')

// 1) package.json version
const pkgPath = 'E:/Movie Vault/package.json'
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.version = '2.10.0'
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log('package.json -> 2.10.0')

// 2) 更新日志.md prepend
const zhPath = 'E:/Movie Vault/更新日志.md'
let zh = fs.readFileSync(zhPath, 'utf8')
const zhBlock = `## [2.10.0] - 2026-09-16

**深度审阅 P0+P1 全部完成：安全加固 + 性能优化 + 架构重构**

### 安全（P0）
- **单实例锁去重**：多开实例自动让位，避免重复扫描与并发写库
- **lm:// 协议白名单**：isLmAllowedPath 校验，非法路径请求返回 403，杜绝任意文件读取
- **播放进度 10s 落盘**：lastSaveAt 追踪 + 断点续播防丢帧，PotPlayer 单实例委托不落盘

### 性能（P0/P1）
- **首页排行 topN 小顶堆**：O(N·log14) 替代全量排序，并修复高分项被 filter 误滤的排序 bug
- **ListView 虚拟化固定行高**：万级影片滚动不再卡顿
- **EntryCard memo 收敛**：依赖收敛为 [libraryId] + reconcileRef，减少无关重渲染
- **ffmpeg/ffprobe 路径模块级缓存**：避免反复探测
- **观看统计 SQL 聚合**：getWatchStats 不再全量 listVideos，改 SQL + JSON.parse

### 架构重构（P1）
- **fetch-meta 源表驱动**：moviedb/omdb/openlibrary/justwatch/wikipedia 五源统一 SOURCES 配置，单源/自动模式共用 runSingleSource，连续失败 3 次自动禁源
- **SettingsModal 拆分**：1634 行拆出 SettingsSections.tsx（8 个分类分区组件），shell 仅留状态编排
- **VideoDetail 拆分**：1121 行拆 9 个子组件（Header/封面/文件信息/CTA/元数据头/元数据体/演员/预览帧/相关推荐/放大浮层）
- **存储迁移 SQLite 全量**、**状态管理 Zustand**、**IPC 按域拆分**（此前已完成）

### 修复（P0/P1）
- **代理认证**：proxyRules 内嵌 user:pass 被 Chromium 忽略，改 app.on('login') 事件统一处理
- **文件监控抖动**：MutationObserver 只观察容器自身 class，主题/海报密度变化后触发墙重测量
- **i18n 补全**：PlaylistToolbar/Toolbar/EntryCard 18 处硬编码中文转 i18n 键（zh/en）

## [2.9.2] - 2026-09-16
`
zh = zh.replace('## [2.9.2] - 2026-09-16', zhBlock)
fs.writeFileSync(zhPath, zh)
console.log('更新日志.md -> 2.10.0 block')

// 3) CHANGELOG.en.md prepend
const enPath = 'E:/Movie Vault/CHANGELOG.en.md'
let en = fs.readFileSync(enPath, 'utf8')
const enBlock = `## [2.10.0] - 2026-09-16

**Deep-review P0+P1 all done: security hardening + performance + architecture refactor**

### Security (P0)
- **Single-instance lock**: second launches yield to the first; no duplicate scans or concurrent DB writes
- **lm:// protocol allowlist**: isLmAllowedPath validation, invalid paths get 403
- **Playback progress persisted every 10s** with lastSaveAt tracking; PotPlayer handoff entries are not written

### Performance (P0/P1)
- **Home rankings via top-N min-heap**: O(N·log14) instead of full sorts; fixed high-score items being filtered out before sorting
- **ListView virtualization with fixed row height**; EntryCard memo narrowed to [libraryId] + reconcileRef
- **ffmpeg/ffprobe paths cached at module level**; watch stats use SQL aggregation instead of full listVideos

### Architecture (P1)
- **fetch-meta source-table driven**: five sources (moviedb/omdb/openlibrary/justwatch/wikipedia) share one SOURCES config and runSingleSource; auto-disable after 3 consecutive failures
- **SettingsModal split** (1634 → shell + SettingsSections with 8 category components)
- **VideoDetail split** (1121 lines → 9 sub-components)
- Earlier: full SQLite migration, Zustand state migration, IPC split by domain

### Fixed (P0/P1)
- **Proxy auth**: embedded user:pass in proxyRules is ignored by Chromium; moved to app.on('login')
- **Watcher jitter**: MutationObserver scoped to the container itself; wall re-measure on theme/density change
- **i18n**: 18 hard-coded Chinese strings moved to keys (zh/en)

## [2.9.2] - 2026-09-16
`
en = en.replace('## [2.9.2] - 2026-09-16', enBlock)
fs.writeFileSync(enPath, en)
console.log('CHANGELOG.en.md -> 2.10.0 block')
