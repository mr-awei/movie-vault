# 影海 Yinghai · Movie Vault

[English](./README.md) · **简体中文**

> 本地优先的影视收藏管理工具。选择一个视频文件夹 + 一份 Excel 片单，即可生成可浏览、可检索的海报墙影库 —— **数据 100% 落在本地，不上传、不采集、不需要账号**。

![许可证](https://img.shields.io/badge/license-Yinghai%20Dual%20License%20v1.0-blue)
![平台](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)

---

## 项目简介

影海把普通的「视频文件夹」变成一个有分类、有海报、有简介的私人影库：

- **Excel 片单是唯一权威来源**：分类、推荐评分、简介、自定义标签都以片单为准；
- **元数据 / 海报 / 演职员** 从公开影视数据库抓取后永久缓存在本地；
- 数据库、海报、缓存全部存放在你自己的磁盘上。

应用是标准的三层 Electron 架构（主进程 / preload / 渲染进程），TypeScript 全量类型化，无服务端、无埋点上报。

> **免责声明** —— 影海是**本地文件整理工具**，不托管、不提供、不传播、不分发任何视频内容。所有元数据来自公开影视数据库。请确保你对自有收藏拥有合法的访问与使用权。

## 核心特性

### 影库与浏览
- 海报墙 **三档密度**（沉浸 / 标准 / 紧凑），支持竖屏卡片、横屏卡片、纯文件名列表三种视图。
- **虚拟滚动**：DOM 数量恒定，与影库规模无关，数千部依旧顺滑。
- Netflix 式悬停预览面板、悬停简介、六种排序（添加时间 / 标题 / 年份 / 评分 / 最近播放 / 随机）。
- 智能筛选：收藏、最近播放、未评分、无封面、未收录，以及标签 / 演员 / 制片公司 / 系列 / 分类 / 分辨率 / 时长 / 评分 / 年份多维筛选。
- 首页看板：Hero 洗牌推荐、每日推荐、跨媒体库随机行、统计面板。

### 片单驱动
- Excel 为权威数据源：`片名 | 分类 | 推荐评分 | 简介`，**任意额外列自动成为通用标签组**（无固定 schema）。
- 片单向导可生成与实际表结构一致的 AI 提示词；片单可随时重新导入 / 重新对账。
- 文件夹与片单自动对账：识别「片单缺失」「文件未收录」，并支持一键清理文件名广告。

### 元数据补齐
- 五个数据源自动降级：**MovieDB（TMDb）· OMDb · OpenLibrary · JustWatch · 维基百科**。
- 数据源支持拖拽排序、单独启用/禁用、单源调试；API Key 可选，仅保存在本地。
- 批量补齐支持并发 / 间隔限速、**暂停 / 继续 / 停止**、失败单独重试，并实时展示「数据源失败 → 降级下一源」日志。
- 失败明细精确到条目与原因；识别困难时可手工输入检索词 / ID 重试。

### 封面与截帧
- 封面优先级链：手动封面 → 同目录同名图 → 数据源海报 → ffmpeg 截帧 → 内置占位。
- ffmpeg 兜底：随机多点采样 + 质量评分（自动剔除过黑 / 过白 / 模糊 / 画面单调帧），生成封面与预览集。
- 支持一键重新截帧、把预览帧设为封面、数据源海报与 ffmpeg 封面自由切换。

### 文件锁定
- 支持对任意数量影片加锁（单条卡片 / 详情页 / 多选批量），**普通与强制批量补齐都会自动跳过**，详情页手动更新不受限。
- 每轮批量补齐结束后明确告知哪些文件被跳过，并提供「全部解锁」。

### 安全与隐私
- **隐私护盾**：一键模糊所有预览图（防截图泄露），可设为默认开启。
- **删除锁**：删除影片 / 移除媒体库需 SHA-256 密码校验（加盐存储，绝不保存明文）。
- 删除文件走**系统回收站**（可恢复）；当目录内只有该文件时，可选连同整个目录一起回收。
- 支持 HTTP / HTTPS / SOCKS4 / SOCKS5 代理，所有出网请求统一走代理层。
- 卸载默认保留用户数据，并由 NSIS + PowerShell 保留守卫脚本保障。

### 体验
- 中英双语界面、深色 / 浅色 / 跟随系统主题、最小化到托盘、开机自启。
- 应用内检查更新（GitHub / Gitee），支持每天 / 每周 / 每月频率与更新日志展示。
- 存储非破坏式演进：启动自动迁移 schema、外部修改检测、分段检查点写盘防丢数据。

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 运行时 | Electron 31 |
| 构建 | electron-vite 2 · Vite 5 · electron-builder 24 |
| 界面 | React 18 · TypeScript 5.5 · Tailwind CSS 3 |
| 数据 | 单文档 JSON 存储（`data.json`）+ schema 迁移 + 防抖原子写 |
| 媒体 | ffmpeg / ffprobe（系统或捆绑） |
| 网络 | undici · socks / socks-proxy-agent |
| 片单 | xlsx（SheetJS） |
| 国际化 | 自研轻量字典（zh-CN / en-US） |

## 架构概览

```
┌──────────────────────────────────────────────────────────┐
│ 渲染进程（React 18 + Tailwind）                            │
│  App.tsx · HomeView / VirtualizedWall / ListView          │
│  VideoDetail · SettingsModal · ReconcileDialog …          │
└───────────────▲──────────────────────────┬───────────────┘
                │ window.api（contextBridge）│  事件
                │ 类型化 IPC invoke          │  scan:progress
┌───────────────┴──────────────────────────▼───────────────┐
│ 主进程                                                    │
│  scanner → reconcile → fetch-meta（五源降级）              │
│  images（ffmpeg）· repo/store（data.json）· proxy          │
│  ipc.ts（全部 handler）                                    │
└──────────────────────────────────────────────────────────┘
        ▲ 契约由 shared/types.ts · shared/ipc.ts 统一约束
```

`src/shared` 存放两端共用的类型契约，任何 IPC 签名变更都会在 `npm run typecheck` 阶段直接报错。

## 快速开始

**环境要求** —— Node.js 18+、npm 9+。ffmpeg 会从 `PATH` 查找或使用捆绑版本；仅在截帧兜底时需要，基础浏览不依赖它。

```bash
npm install
npm run dev          # 开发模式（electron-vite dev）
npm run typecheck    # 主进程 + 渲染进程全量 tsc 校验
npm run build        # 产出 dist/ 构建产物
npm run pack         # 构建 + electron-builder 生成安装包到 release/
```

| 脚本 | 说明 |
| --- | --- |
| `dev` | 开发运行，渲染进程 HMR、主进程改动自动重启 |
| `typecheck` | 对 `tsconfig.json` 与 `tsconfig.node.json` 执行 `tsc --noEmit` |
| `build` | 编译主进程 / preload / 渲染进程产物 |
| `pack` | 先 build，再执行 `scripts/pack.mjs` 生成 NSIS 安装器与压缩包 |
| `preview` | 以生产方式运行已构建产物 |

## 数据与隐私

- 数据目录：Windows `%APPDATA%/local-movie-vault`、macOS `~/Library/Application Support/local-movie-vault`、Linux `~/.config/local-movie-vault`。
- `data.json` —— 媒体库、影片、元数据、设置（单文档，启动时原位迁移）。
- `posters/` —— 封面与预览帧缓存，可安全删除，需要时会重新抓取。
- 无账号、无云同步、无行为统计。只有在你主动触发补齐、抓海报、检查更新时才会出网，且全部遵循代理设置。

## 目录结构

```
src/
├── main/                 # Electron 主进程
│   ├── lib/
│   │   ├── ipc.ts        # 全部 IPC handler
│   │   ├── scanner.ts    # 文件夹遍历 → 影片记录
│   │   ├── reconcile.ts  # 片单与文件夹对账
│   │   ├── fetch-meta.ts # 五源降级调度
│   │   ├── movie-db.ts / omdb.ts / openlibrary.ts / justwatch.ts / wikipedia.ts
│   │   ├── images.ts     # ffmpeg 截帧兜底与海报缓存
│   │   ├── store.ts      # data.json 加载 / 迁移 / 防抖保存
│   │   └── repo.ts       # 影片 / 媒体库 / 设置仓储
│   └── assets/           # 随包指南文档
├── preload/              # contextBridge → window.api
├── renderer/src/         # React 界面（components、lib、App.tsx）
└── shared/               # 类型、IPC 通道名、i18n、识别工具
build/                    # NSIS 模板、卸载守卫
scripts/                  # 打包 / 发布 / 证书脚本
docs/                     # 专题文档
```

## 文档索引

| 文档 | 面向 | 内容 |
| --- | --- | --- |
| [产品需求文档.md](./产品需求文档.md) · [EN](./PRD.en.md) | 产品 / 测试 | 产品定位、用户画像、编号化需求、验收标准 |
| [技术设计文档.md](./技术设计文档.md) · [EN](./TDD.en.md) | 研发 | 架构、模块、IPC 清单、存储设计、关键时序、安全设计 |
| [交接文档.md](./交接文档.md) · [EN](./HANDOFF.en.md) | 维护者 | 上手路径、核心文件、验证清单、易踩坑点 |
| [发布说明.md](./发布说明.md) · [EN](./PUBLISHING.en.md) | 发布负责人 | 版本号规范、签名、CI 发布、回滚 |
| [更新日志.md](./更新日志.md) · [EN](./CHANGELOG.en.md) | 所有人 | 版本更新日志 |
| [docs/](./docs) | 专题读者 | 截帧与自动分类、数据源接入 |
| [通用评分与简介规范](./src/main/assets/通用评分与简介规范.md) | 片单维护者 | 分类 / 评分 / 简介的权威撰写标准（随应用打包，片单向导内亦可直接打开） |

## 参与贡献

1. 从 `main` 切分支，保持改动聚焦。
2. 提 PR 前必须通过 `npm run typecheck`，CI 将其作为准入门槛。
3. 面向用户的改动请同步更新 `更新日志.md` / `CHANGELOG.en.md` 与 `docs/` 下对应文档。

问题反馈请附上应用版本（关于弹窗）、操作系统版本与复现步骤。

## 许可证

本项目以 **影海 双授权协议 v1.0** 发布 —— 非商业用途免费；商业用途需获得授权。完整中英双语条款见 [LICENSE](./LICENSE)。商业授权联系：`new_mr_awei@163.com`。
