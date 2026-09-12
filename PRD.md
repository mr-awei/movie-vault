# 影海（YingXia）本地视频管理桌面应用 — 产品需求文档（PRD）

| 项目名称 | 影海（YingXia）本地视频管理与海报墙桌面应用 |
|---|---|
| 文档版本 | v2.7.0 |
| 编写日期 | 2026-09-09 |
| 当前产品版本 | v2.7.0 |
| 文档状态 | 已评审（单人口径）|
| 需求来源 | 用户个人收藏管理 + 历史功能迭代 |
| 参考文档 | `HANDOFF.md`（项目交接）、`CHANGELOG.md`（版本史）、`src/shared/ipc.ts`（能力清单）|

> 本文档按腾讯/阿里企业级 PRD 规范编写：覆盖**立项背景 → 演进历程 → 功能需求全量明细 → 非功能需求 → 数据模型 → 风险与规划**。
> 所有功能模块均经代码核实（截至 v2.7.0），标注【当前存在】的模块为 v2.7.0 中仍在运行的功能。

---

## 1. 项目概述

### 1.1 项目背景

用户拥有大量本地收藏的视频文件（组织为按番号命名的文件夹），面临以下痛点：

1. **无组织**：文件名混乱、无封面/无简介/无评分，难以快速浏览和定位目标片源；
2. **元数据缺失**：需要手工逐个去数据源网站查询番号信息，效率极低；
3. **分类割裂**：用户有一份手工维护的 Excel 片单（收藏整理），与磁盘文件互相脱节；
4. **隐私顾虑**：本地收藏涉及敏感内容，需要隐私保护机制（模糊预览、删除锁）。

### 1.2 产品定位

**影海是一款面向个人用户的本地视频管理桌面工具**：海报墙式影库，自动识别番号、自动抓取元数据、按用户片单权威归类、本地播放器无缝播放。**所有数据本地存储（data.json），不上传任何用户内容。**

### 1.3 目标用户

| 用户类型 | 特征 | 核心诉求 |
|---|---|---|
| 收藏爱好者（主） | 拥有大量本地视频文件，有番号命名习惯，维护片单 | 快速浏览、自动补全元数据、按片单分类 |
| 轻度使用者（次） | 少量文件，不维护片单 | 自动抓取元数据、封面墙展示、本地播放 |

### 1.4 核心价值

1. **效率**：扫描 → 识别番号 → 5 源自动降级抓元数据 → 一键批量补齐，替代手工查询；
2. **秩序**：以用户 Excel 片单为权威分类来源，自动归类，可一键对账发现"未收录/未分类"；
3. **体验**：海报墙 + 悬停简介 + 点击详情 + 预览墙 + 本地播放的无缝链路；
4. **隐私**：本地存储、隐私护盾、删除锁，用户数据不出本机。

---

## 2. 里程碑与演进历程（立项 → 当前）

| 阶段 | 版本 | 时间（估） | 核心内容 |
|---|---|---|---|
| 立项 | Initial commit | v0 | 影海（YingXia）本地视频管理与海报墙桌面应用骨架 |
| 起步期 | v1.7.0–1.7.5 | v1 | 新建简介文件向导 + 多轮 UI 优化 |
| 社区化 | v1.7.6–1.7.7 | v1 | About 弹窗接入 GitHub 仓库引导 Star；媒体库添加改为表单引导（不再连弹系统对话框）|
| 双端发布 | v1.8.0–1.8.5 | v1 | GitHub 改名 mr-awei + Gitee 镜像 + 双端自动推送；更新检查修复（仓库路径/默认源/自动回退/20s 超时）；首页骨架屏；窗口缩放重影修复（CSS containment）|
| 数据安全 | v1.9.0–1.9.3 | v1 | 删除文件（回收站 shell.trashItem + 整目录种子文件夹判定 + 二次确认弹窗）；删除连带清理全部关联缓存与记录 |
| 片单驱动 | v2.0.0–2.0.3 | v2 | **Excel 片单支持** + javlibrary 数据源 + 扫描大小过滤 + 双封面切换 + 番号提取增强 + ffmpeg 截帧兜底 + thumbnail 滤镜防黑场 + 用户须知弹窗（法律合规）|
| 数据源扩展 | v2.0.x 合并分支 | v2 | 接入 javapi/javinfo 双数据源；设为封面；渲染进程截帧兜底；全库随机；GitHub Actions 自动构建发布 |
| 分类与兜底 | v2.1.0 | v2 | 无封面视频自动归类（有 genres 按【源】genres 归类）；截帧 30s 超时；批次上限 200 |
| 稳定性修复 | v2.2.0–2.2.3 | v2 | 删 markdown 片单（全面 Excel 化）；customSourceOrder 字段；番号解析增强；autoFindIntroExcel 自动扫库根 |
| **问题集中修复** | **v2.2.4–v2.2.10** | v2 | **用户深度使用后反馈驱动**（详见 2.1）|
| 体验与网络增强 | v2.3.x | v2 | 双语界面（zh-CN/en-US）、系列剧集、批量抓取进度面板（暂停/继续/停止）、代理覆盖 Node.js 与 Chromium 双网络栈 |
| 安装与浏览优化 | v2.4.x | v2 | 安装包体验优化（检测运行中应用、不再强制结束进程）、列表视图切换（平铺/分组）、随机截帧与质量过滤 |
| 稳定性收官 | v2.5.0 | v2 | 修复升级检测误杀自身问题；功能稳定与 PRD 文档对齐 |
| 国际化与合规 | v2.6.6–2.6.7 | v2 | NSIS 安装器第一步语言选择并写入注册表；主进程首次启动读取安装器语言；英文用户须知移除中国法律法规引用；卸载器沿用安装语言。v2.6.7 进一步把应用内卸载确认与「保留/删除用户数据」合并为单条流程，并修复卸载删除阶段报错（PowerShell 保护脚本 UTF-8 BOM、参数绑定、残留进程释放文件锁、删除重试 3→5 次）。 |
| **协议与合规升级** | **v2.7.0** | v2 | **开源协议从 MIT 切换为「影海 双授权协议 v1.0」**（中英双语五章结构：非商业免费授权、恶意程序禁止三层保护、商业授权、权利保留、免责声明）；新增应用内开源协议展示弹窗（`LicenseModal`），关于弹窗页脚「查看开源协议」入口，支持中英双语切换与邮箱一键复制；PRD/README/CHANGELOG 全面更新至 v2.7.0。 |

### 2.1 近期问题集中修复（v2.2.4 – v2.2.10）

| 版本 | 用户反馈 | 根因 | 修复 |
|---|---|---|---|
| v2.2.4 | "收录了说没收录，84 部全未分类" | `XLSX.readFile` 中文路径静默失败 | 改 buffer 读取；片单异常弹窗（不藏问题）；无片单兜底自动抓元数据 |
| v2.2.5 | "控制台大量报错" | previewPaths 孤儿引用 → lm:// ENOENT 刷屏 | ENOENT 静默 + reconcile 清理 dead previewPaths |
| v2.2.6 | "javapi 失败应继续试其他源" | 两套 fetch 逻辑不一致 + 错误信息误导 | 统一 fetchDetailSmart；错误信息完整化（5 源 summary）；拖拽排序 UI |
| v2.2.7 | "文案要跟顺序联动" | 文案写死默认顺序 | formatSourceOrder 动态渲染 |
| v2.2.8 | "真实采集顺序变了吗" | 海报路径硬走 JavDB | fetchPosterSmart 按 customSourceOrder 降级 |
| v2.2.9 | "怎么还是走 javbus" | main 进程 log 不落盘、无总览 | attachMainLog 落盘 + [smart] 总览 log |
| v2.2.10 | "UI 也应看到降级过程" | 过程只在日志 | ScanProgress.fetchEvent + 右下角抓取过程浮层 |

**结论**：v2.2.x 阶段的核心方法论是**"问题必须可见"**——任何失败/降级/异常都要在 UI 呈现，且修复必须经真实用户数据验证。

---

## 3. 用户画像与核心场景

### 3.1 核心场景

1. **首次入库**：添加媒体库 → 自动扫描 → 片单对账 → 批量补齐 → 分类完成；
2. **日常浏览**：海报墙翻看 → 悬停看简介 → 点击看详情（评分/演员/标签/预览墙）→ 本地播放；
3. **增量管理**：新增视频 → 扫描自动识别 → 无片单时后台自动抓元数据；
4. **异常处理**：JavDB 被风控 → 自动降级 JavBus → UI 实时显示降级过程；
5. **隐私操作**：开启隐私护盾模糊预览 → 删除锁保护 → 回收站恢复。

---

## 4. 功能需求总览（当前存在全部模块）

> 优先级定义：**P0** 核心主流程（缺了产品不可用）/ **P1** 重要增强（常用、体验关键）/ **P2** 辅助功能。

| 模块 | 子模块 | 优先级 | 状态 |
|---|---|---|---|
| M1 媒体库管理 | 多库增删改、表单引导、自动扫描、对账 | P0 | ✅ 当前存在 |
| M2 扫描与番号识别 | 目录遍历、番号提取、大小过滤、技术探测 | P0 | ✅ 当前存在 |
| M3 Excel 片单系统 | 解析、自动查找、分类归类、匹配、异常提示 | P0 | ✅ 当前存在 |
| M4 数据源系统 | 5 源抓取、自定义顺序、失败降级、海报抓取 | P0 | ✅ 当前存在 |
| M5 元数据管理 | 批量/单点补齐、编辑、系列去重 | P0 | ✅ 当前存在 |
| M6 封面与预览 | 数据源封面、ffmpeg 截帧、设为封面、封面切换 | P0 | ✅ 当前存在 |
| M7 播放与文件操作 | 本地播放、打开文件夹、删除、改名、磁链 | P0 | ✅ 当前存在 |
| M8 浏览与发现 | 首页/浏览、分类树、搜索筛选、收藏、随机 | P0 | ✅ 当前存在 |
| M9 隐私与安全 | 隐私护盾、删除锁、用户须知、回收站 | P1 | ✅ 当前存在 |
| M10 设置中心 | 7 分区（通用/网络/外观/隐私/存储/更新/危险）| P1 | ✅ 当前存在 |
| M11 系统集成 | 更新检查、托盘、开机自启、About、日志 | P1 | ✅ 当前存在 |
| M12 可视化与体验 | 抓取过程浮层、进度提示、异常 Toast、骨架屏 | P1 | ✅ 当前存在 |
| M13 双语界面 | 中/英语言切换、区域化文案、日期/数字格式 | P1 | ✅ 当前存在 |
| M14 系列剧集 | 同一 base code 多 CD/分集聚合、集数选择、连续浏览 | P1 | ✅ 当前存在 |
| M15 批量抓取进度面板 | 独立进度窗口、任务暂停/继续/停止、源级状态展示 | P1 | ✅ 当前存在 |
| M16 代理覆盖 | Node.js 与 Chromium 网络栈统一代理、PAC/系统代理兼容 | P1 | ✅ 当前存在 |
| M17 安装包体验 | 检测运行中实例、温和提示、不强制结束进程 | P2 | ✅ 当前存在 |
| M18 列表视图模式 | 平铺视图与分组视图切换、系列/源分类聚合 | P1 | ✅ 当前存在 |

---

## 5. 详细功能需求（按模块）

### M1 媒体库管理

| 需求 | 说明 |
|---|---|
| 创建媒体库 | 表单引导（路径选择 + 名称），支持多个媒体库并存 |
| 删除媒体库 | 二次确认，删除关联 data.json 记录与缓存（不删磁盘文件）|
| 编辑媒体库 | 修改路径/名称/片单路径 |
| 自动扫描 | `scanOnStartup` 启动自动对账当前库；`autoRescan` 非当前库后台对账 |
| 对账 | `libraryReconcile`：读片单 → 匹配文件 → 产出分类条目 → 弹对账结果（匹配/未收录/未分类统计）|
| 对账结果展示 | ReconcileDialog：统计 + 忽略未收录路径 + Top 大文件 |
| 扫描进度 | 实时进度条（total/done/current）|

**边界条件**：库路径不可达时提示错误；扫描跳过小于 `scanMinSizeMB` 的视频。

### M2 扫描与番号识别

| 需求 | 说明 |
|---|---|
| 视频格式识别 | 12 种扩展名：mp4/mkv/avi/mov/flv/wmv/webm/m4v/ts/m2ts/mpg/mpeg |
| 番号提取 | `extractCode`：兼容 `SONE-560`、`hdd800.com@JUR-031`（域名前缀剥离）、`HUNTA468CD2`（无分隔符连写）、中文括号；`extractBaseCode` 剥 `-CD/-PART/-A/-B/末尾数字` 等分集后缀 |
| 文件夹名优先 | 视频所在外文件夹名作为更干净的搜索源（比文件名含广告更优）|
| 技术探测 | `ffprobe` 读取编码/分辨率/码率/时长（techInfo），详情页展示 |

**边界条件**：无法识别番号 → 视为"无结果"（不触发网络失败计数，避免批量误停）；国产片（纯中文无番号）标记 domestic，仅截帧不抓元数据。

### M3 Excel 片单系统

| 需求 | 说明 |
|---|---|
| 片单解析 | `parseIntroExcel`：Sheet「片单」，B 列番号、A 列名称、分类列（按列分组）、评分列、标签列；**buffer 方式读取（中文路径兼容）** |
| 自动查找 | `autoFindIntroExcel`：未配置路径时自动扫库根目录一层找 `.xlsx/.xls`（多个取排序第一个）|
| 权威归类 | 片单为权威来源：分类（tagCategories 按列分组）、推荐评分（覆盖数据源）、标签 |
| 匹配算法 | `keyMatches`：番号前缀边界（前一位非字母数字）+ 容忍字母后缀（只拒绝数字后缀）|
| 异常提示 | 片单加载失败必须弹 Toast（不自动消失）：`not-configured` / `parse-failed`（含 triedPaths）/ `auto-find-failed` |
| 对账记账 | 未配片单时按文件维度只产出 1 条 entry（防重复 key）|

**边界条件**：片单为空/损坏 → 明确告知"哪个文件坏了"；片单行去重（同番号只取第一条）。

### M4 数据源系统（核心）

| 需求 | 说明 |
|---|---|
| 数据源 | Javapi（本地自托管，免费无风控）/ Javinfo（聚合 API，免爬虫）/ JavDB（信息全但 Cloudflare 风控）/ JavBus（中量信息，需过年龄验证）/ JavLibrary（偏简，兜底）|
| 采集顺序 | `dataSource: 'auto'` 时按 `customSourceOrder`（默认 Javapi→Javinfo→JavDB→JavBus→JavLibrary）；手动指定单源用于调试 |
| 顺序调整 | SettingsModal 拖拽 ⠿ / ↑↓ 按钮 / 恢复推荐（v2.2.6+）|
| 降级机制 | 按序逐个尝试，任一源命中即停；任一源连续 3 部**网络失败**（非无结果）→ 本轮禁用该源；JavBus 连续 3 部失败 → 停止整批（防空转）|
| 元数据抓取 | `fetchDetailSmart`：完整 5 源结果汇总（`javapi=跳过; javdb=无结果; ...`）|
| 海报抓取 | `fetchPosterSmart`：按 customSourceOrder 降级 5 源抓封面（javdb search → javbus/javlibrary/javinfo/javapi detail cover）|
| 实时过程 | `onEvent` 每次源尝试推一条 → UI 右下角浮层显示（v2.2.10）|
| 并发限速 | `fetchConcurrency`（1-8）+ `fetchIntervalMs`（默认 600ms），降低风控 |

**边界条件**：JavDB 403（Cloudflare 风控）属正常降级路径；"搜索无结果/无法识别番号"不计数不触发停止。

### M5 元数据管理

| 需求 | 说明 |
|---|---|
| 批量补齐 | `libraryFetchJavdbAll`：并发抓全部缺详情视频（封面 + 详情 + 预览图），系列去重（同 base code 只抓一次）|
| 单点补齐 | `videoFetchJavdbDetail`：单视频抓详情，成功后同步封面 |
| 编辑元数据 | EditMetaModal：标题/评分/简介/标签/演员手工编辑 |
| 详情内容 | JavdbDetail：完整标题、封面、日期、时长、导演、片商、系列、评分、类别、演员、女演员、样本图 |
| 元数据回填 | `backfillFromDetail`：actors/year/rating/tags 回填 video 字段 |
| 时效 | 详情 `parseVer !== 2` 视为陈旧需重抓（新解析器版本）|

### M6 封面与预览

| 需求 | 说明 |
|---|---|
| 数据源封面 | 详情 cover → `cacheRemoteImage` 下载本地（带 Referer 防盗链 403）|
| ffmpeg 截帧兜底 | 无封面/坏图 → `generatePreviewSet`：1 封面 + 15 预览帧（thumbnail 滤镜防黑场，30s 超时）|
| 设为封面 | 预览帧 → 封面（`videoSetPreviewAsCover`，posterSource=manual 最高优先级持久生效）|
| 封面切换 | `videoSwitchPoster`：数据源图 ↔ ffmpeg 截帧切换 |
| 坏图保护 | `isCoverUsable`（ffprobe 验证）下载损坏/截断图不替换 |
| 预览体验 | 悬停 HoverDetail 简介 + 详情页预览墙 + 点击放大（zoom）|
| 缓存清理 | `cacheClear` 清海报缓存目录；删除视频连带清缓存 |
| 孤儿清理 | v2.2.5 `cleanupDeadPreviewPaths`：对账时清理 data.json 指向不存在文件的 previewPaths |

### M7 播放与文件操作

| 需求 | 说明 |
|---|---|
| 本地播放 | `videoOpen`：默认系统播放器或 `playerPath` 外部播放器 |
| 打开文件夹 | `shellRevealInFolder`：资源管理器定位文件 |
| 删除视频 | `videoDeleteFile`：**回收站**（shell.trashItem 可恢复）；整目录判定（同目录无其他视频 + 有 .torrent → 视为种子文件夹连带删）；删除连带清 data.json 记录 + 全部缓存 |
| 删除预检 | `videoInspectForDelete`：删除前展示目录内其他视频数 / 是否含 torrent |
| 批量改名 | `libraryPreviewRenames` / `applyRenames`：清理文件名广告（预览 → 应用）|
| 磁链分享 | `videoShareTorrents`：扫目录 .torrent 转磁链复制 |

### M8 浏览与发现

| 需求 | 说明 |
|---|---|
| 首页概览 | Hero 区 + 分类统计 + 收藏数 + 全库随机 |
| 浏览页 | 网格（VirtualizedWall 虚拟滚动）/ 列表双视图；posterDensity 密度（大/标准/紧凑）|
| 分类树 | 片单分类 + 自动分类（【源】genres）+ 未收录 + 未分类 + 系列分组 |
| 搜索 | 模糊匹配标题/文件名/演员/标签 |
| 智能筛选 | 全部 / 未收录 / 未分类 / 收藏 / 无封面 |
| 排序 | 添加时间 / 评分（高在前）/ 年份 / 名称（升降序）|
| 收藏 | ♥ 收藏持久化（favorite），收藏筛选 + 首页统计 |
| 全库随机 | 多库合并洗牌队列 + 换一批；收藏/详情不重建队列保顺序稳定 |

### M9 隐私与安全

| 需求 | 说明 |
|---|---|
| 隐私护盾 | `privacy-on` 一键模糊全部预览图（防截图泄露），localStorage 持久化，可设默认开启 |
| 删除锁 | 设置/清除/校验密码（lockSet/lockVerify），删除操作前验证，防误删/防他人 |
| 锁屏 | LockScreen：软件上锁后需密码打开，连续错误 5 次自动退出 |
| 用户须知 | 首次启动强制弹窗（法律条文 + 复选框 + 确认持久化）|
| 回收站删除 | 删除走系统回收站，可恢复 |

### M10 设置中心（7 分区）

| 分区 | 设置项 |
|---|---|
| 通用 | 外部播放器路径、ffmpeg 路径、自动扫描（启动/变化时）、扫描大小过滤、开机自启、托盘 |
| 网络 | 代理模式/主机/端口/账号密码 + 连通性测试；数据源模式（auto/单源）；customSourceOrder 拖拽；javapi URL/Key；javinfo Key；javdb Cookie |
| 外观 | 主题（cinema/light/magazine/glass/system）、海报密度 |
| 隐私与安全 | 隐私护盾默认开启、删除锁开关/密码 |
| 数据与存储 | 海报缓存清理、ffmpeg 状态检测（系统/捆绑/缺失）|
| 更新 | 更新源（GitHub/Gitee）、检查频率 |
| 危险操作 | 卸载应用（appUninstall）|

### M11 系统集成

| 需求 | 说明 |
|---|---|
| 更新检查 | `updateCheck`：GitHub/Gitee 双源自动回退、20s 超时、启动/周期检查（30min）|
| 系统托盘 | `minimizeToTray`：关窗不退出 |
| About | 应用信息 + 版本 + GitHub 仓库引导 Star |
| 日志 | main.log（v2.2.9 起 main 进程 console 落盘）+ renderer-console.log（JSON 行）→ `%APPDATA%\影海\logs\` |
| 更新提示 | pendingUpdate 顶部横幅 + 下载引导 |

### M12 可视化与体验

| 需求 | 说明 |
|---|---|
| 抓取过程浮层 | 右下角 FetchLogOverlay：实时显示"→ 尝试 JavDB… / ✗ JavDB 网络失败 / ✓ JavBus 命中"（五状态五色，最近 60 条，批量结束 2.5s 自动收起）|
| 进度提示 | 扫描/补齐统一进度 Toast（done/total/current，完成后停留 0.9s）|
| 异常 Toast | 片单失败等 warn Toast 不自动消失（v2.2.4 硬性要求：不藏问题）|
| 首屏体验 | HomeSkeleton 骨架屏；CSS containment 防窗口缩放重影 |

---

## 6. 非功能需求

### 6.1 性能

| 项 | 要求 |
|---|---|
| 扫描 | 千级文件增量扫描秒级完成；ffprobe/截帧并发 `scanConcurrency` 可调 |
| 大列表 | 网格虚拟滚动（VirtualizedWall），500+ 卡片流畅 |
| 抓取 | 批量补齐并发可调（fetchConcurrency 1-8）+ 限速（fetchIntervalMs），防风控 |
| 启动 | 首屏骨架屏；异步加载 data.json |

### 6.2 安全与隐私

| 项 | 要求 |
|---|---|
| 数据本地化 | 所有数据存 `%APPDATA%\影海\data.json`，不上传用户内容 |
| 番号/搜索 | 网络请求仅发往 5 个数据源 + 图片 CDN |
| 密码 | 删除锁哈希存储（SHA-256 salt+password），不存明文 |
| 凭据 | javinfoKey / javapiKey / javdbCookie 明文存 data.json（本地单机可接受，**不做网络同步**）|
| 链接 | 外部链接走 `openExternal` 默认浏览器；本地文件走 `lm://` 白名单协议 + 扩展名白名单 |

### 6.3 兼容性与可用性

| 项 | 要求 |
|---|---|
| 平台 | Windows（主）；macOS/Linux 理论兼容（未充分验证）|
| 中文路径 | **必须支持**（v2.2.4 教训：xlsx 读取用 buffer）|
| 离线 | 无网络时：已缓存元数据可用、ffmpeg 截帧兜底、本地播放不受影响 |
| 升级 | 数据兼容：data.json 增字段向后兼容（v2.2.5 教训：清理孤儿引用）|
| 可恢复 | 删除走回收站；卸载提示 |

### 6.4 可观测性

| 项 | 要求 |
|---|---|
| 日志 | main.log + renderer-console.log（v2.2.9 起 main 也落盘）|
| 抓取过程 | UI 浮层 + [smart] 日志（order/HIT/FAILED 三态）|
| 错误可见 | 所有失败必须在 UI 呈现（Toast/浮层/对账弹窗），不静默 |

---

## 7. 数据模型（核心）

```
data.json
├── settings: Settings
│   ├── dataSource / customSourceOrder / javapiUrl / javapiKey / javinfoKey / javdbCookie
│   ├── proxyMode / proxyHost / proxyPort / proxyUser / proxyPass
│   ├── fetchConcurrency / fetchIntervalMs / scanConcurrency / scanMinSizeMB
│   ├── theme / posterDensity / privacyDefaultOn / lockEnabled / lockHash / lockSalt
│   ├── autoRescan / scanOnStartup / launchAtLogin / minimizeToTray / defaultSort / updateSource
│   └── ...
├── libraries: Library[]        # { id, name, path, introExcelPath?, ignoredUnlistedPaths? }
└── videos: Video[]             # 见下
```

```
Video {
  id, libraryId, path, fileName, folderName?
  title, year?, description?, descriptionSource?
  rating?, tags[], actors?, domestic?
  posterPath?, posterSource?(javdb|javbus|javlibrary|javapi|javinfo|ffmpeg|manual|placeholder)
  posterPathFfmpeg?, coverVersion?
  durationSec?, fileSize?, techInfo?
  addedAt, lastPlayedAt?, favorite?
  javdbDetail?{ uid, code, title, cover?, date?, duration?, director?, studio?, series?, rating?, genres[], actors[], actresses?, samples?, source?, parseVer? }
  previewPaths?, lastMetaFetchAt?
}
```

**片单结构**：`IntroDoc { items: IntroItem[], tagCategories? }`；`IntroItem { code, name, tags[], categories?, score? }`（权威来源，覆盖数据源）。

---

## 8. 风险与依赖

| 风险 | 等级 | 应对 |
|---|---|---|
| **JavDB Cloudflare 风控**（当前用户 IP 403）| 高 | 5 源自动降级（当前已全量降 JavBus）；用户可换 IP/配 Cookie |
| 数据源站点改版（HTML 解析失效）| 中 | 每源独立模块 + parseVer 版本化 + [smart] 日志快速定位 |
| 大数据量性能 | 低 | 虚拟滚动 + 增量扫描 |
| 中文路径兼容 | 已解决 | buffer 读取 + 全链路测试（v2.2.4）|
| 网络不稳定（发布/抓取）| 中 | node 直连发布脚本；抓取自动降级重试 |
| 升级数据迁移 | 中 | 新增字段向后兼容；孤儿引用清理（v2.2.5）|

---

## 9. 指标定义

| 指标 | 定义 | 当前基线（实测）|
|---|---|---|
| 元数据覆盖率 | 有 javdbDetail 的视频 / 总视频 | 80 / 84 = **95.2%** |
| 片单匹配率 | keyMatches 命中 / 总目录 | **76 / 76 = 100%** |
| 抓取命中源分布 | bySource 计数 | javbus: 80（JavDB 风控全降级）|
| 批量补齐成功率 | ok / (ok+failed) | 视网络波动 |
| 启动到可交互 | 首屏骨架到可用 | < 2s（本地数据）|

---

## 10. 未来规划（Roadmap）

| 优先级 | 规划项 | 说明 |
|---|---|---|
| 🔴 P0 | **文档标签分层** | 用户明确需求：文档标签为主、数据源标签折叠备用展示（Video 加 `tagCategories` + `backupTags`，详情页可展开）|
| 🟡 P1 | 封面/预览增强 | ffmpeg 重新截帧按钮补全；无预览视频自动补帧 |
| 🟡 P1 | 数据源稳定性 | JavDB 风控缓解（Cookie 引导/重试策略）；数据源改版监测 |
| 🟢 P2 | 多端 | 打包发布自动化完善（时间戳签名、Gitee Release asset 超限策略）|
| 🟢 P2 | 导入导出 | Excel 片单导出（当前解析只读方向）|

---

## 11. 附录

### 11.1 术语表

| 术语 | 含义 |
|---|---|
| 对账（Reconcile）| 片单/文件与 data.json 记录的比对同步过程 |
| 补齐（FetchJavdb）| 从数据源抓取元数据/封面/预览图 |
| 截帧（FFmpeg Frame）| 用 ffmpeg 从视频抽帧生成封面/预览 |
| 片单（Intro Excel）| 用户维护的收藏整理 Excel，权威分类来源 |
| 风控（Cloudflare）| 数据源对高频 IP 的 403 拦截 |

### 11.2 关键文件索引

- 智能抓取中枢：`src/main/lib/javdb-smart.ts`
- 对账核心：`src/main/lib/reconcile.ts`
- 片单解析：`src/main/lib/excel.ts`
- IPC 全量清单：`src/shared/ipc.ts`
- 类型定义：`src/shared/types.ts`
- UI 入口：`src/renderer/src/App.tsx`
- 数据源模块：`javdb.ts / javbus.ts / javinfo.ts / javapi.ts / javlibrary.ts`

---

:*文档结束。本 PRD 覆盖截至 v2.6.7 的全部现存功能；新增需求请追加至第 10 节 Roadmap 并评审。*
