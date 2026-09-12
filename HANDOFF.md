# 影海 (yingxia-video-manager) — 项目交接文档

> 写给接手这个项目的 AI / 开发者。核心一句话：**本地视频管理工具**，海报墙式影库，自动抓元数据、按片单归类、本地播放。
> 当前版本 **v2.2.10**（2026-08-30）。仓库：`E:\moviemanger`，双 remote（GitHub + Gitee）。

---

## 1. 项目定位

- 一个 **Electron 桌面应用**（Windows 为主），管理用户本地的成人视频收藏（~84 部，E:\新建文件夹）。
- 核心能力：
  - 扫描本地视频 → 识别番号（`SONE-560` 这类）→ 从 5 个数据源抓元数据（标题/封面/演员/标签/评分）
  - 读用户的 **Excel 片单**（`收藏整理_2026.xlsx`）做权威归类：按列分组分类、推荐评分、标签
  - 海报墙 UI：悬停看简介、点击看详情、本地播放器打开、ffmpeg 截帧预览
  - 隐私护盾（一键模糊预览图）、删除锁、全库随机、批量补齐
- **用户画像**：单人使用，Windows 10/11，cmd.exe 终端，已授权 AI 直接修环境问题；喜欢"小步快跑"、问题必须可视化（不能藏起问题）。

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 桌面 | Electron 31 + electron-vite 2.3 |
| 前端 | React 18 + Tailwind 3 + TypeScript |
| 数据 | `data.json`（JSON 文件持久化，无数据库）|
| 网络 | undici fetch + socks 代理支持 |
| Excel | xlsx (SheetJS) 0.18.5 |
| 打包 | electron-builder 24（NSIS 安装包，自签名 pfx）|
| ffmpeg | 截帧/技术探测（系统已装 ffmpeg，见 build/ffmpeg 注释）|

**构建脚本**：`npm run dev`（开发）/ `npm run build`（构建）/ `npm run pack`（打包 + electron-builder）

---

## 3. 目录结构地图

```
E:\moviemanger\
├── src/
│   ├── main/            # Electron 主进程
│   │   ├── index.ts     # 入口：注册 lm:// 协议、main log 落盘、窗口
│   │   └── lib/         # 核心业务逻辑（见下）
│   ├── preload/         # 安全桥（暴露 window.api）
│   ├── renderer/src/    # React UI
│   │   ├── App.tsx      # 全局状态 + 路由 + Toast + 抓取过程浮层
│   │   └── components/  # Toolbar / EntryCard / VideoDetail / SettingsModal / ...
│   └── shared/          # 跨进程共享
│       ├── types.ts     # Video / Settings / JavdbDetail / ScanProgress
│       ├── code.ts      # 番号提取/归一化（extractCode / extractBaseCode）
│       ├── ipc.ts       # IPC channel 常量
│       └── api-types.ts # IPC 返回类型
├── scripts/             # pack.mjs / sign.cmd / publish-release.mjs / publish.mjs
├── build/               # icon.png / yingxia-sign.pfx（自签名证书）/ ffmpeg（注释掉的捆绑）
├── CHANGELOG.md         # 版本历史（用户可见）
└── electron-builder.yml # 打包配置
```

### src/main/lib 关键文件（按重要性）

| 文件 | 职责 |
|---|---|
| **javdb-smart.ts** | ⭐ **智能抓取中枢**：`fetchDetailSmart`（元数据 5 源降级）+ `fetchPosterSmart`（海报 5 源降级）+ `SmartFetchState`（连续失败计数）+ `DEFAULT_SOURCE_ORDER` |
| **reconcile.ts** | ⭐ **对账核心**：读 Excel 片单 → 匹配文件 → 产出分类条目；无片单时兜底自动抓元数据；v2.2.5 加的 cleanupDeadPreviewPaths |
| **excel.ts** | 片单 Excel 解析（`parseIntroExcel`，**必须用 buffer 路径**，见坑 #1）|
| **ipc.ts** | 所有 IPC handler：扫描/对账/抓取/删除/改名/海报/设置 |
| **javdb.ts** | JavDB 搜索+详情+图片缓存（searchJavdb / fetchJavdbDetail / cacheRemoteImage）|
| **javbus.ts / javinfo.ts / javapi.ts / javlibrary.ts** | 其他 4 个数据源（详情抓取，内部已下载 cover 到本地）|
| **repo.ts / store.ts** | data.json 读写（store 是通用持久化，repo 是业务层）|
| **scanner.ts** | 扫描视频文件（walk + 番号提取）|
| **images.ts** | ffmpeg 截帧（generatePreviewSet）、海报解析 |
| **player.ts / proxy.ts / rename.ts / torrent.ts / ffprobe.ts / runtime.ts** | 播放器 / 代理 / 批量改名 / 种子文件夹 / 技术探测 / 运行时 |

---

## 4. 核心数据流

```
[扫描] walk(媒体库目录)
  → [对账 reconcile.ts]
      → 找片单 Excel（library.introExcelPath 或自动扫库根目录）
      → parseIntroExcel(buffer) → IntroDoc{items, tagCategories}
      → 每个文件 ensureVideo() → 匹配片单 keyMatches → 分类条目
      → 无片单时：fetchDetailSmart 兜底抓元数据（后台异步）
      → cleanupDeadPreviewPaths（清理孤儿预览路径）
  → 写回 data.json（store.mutate / repo）
  → renderer 显示（HomeView / BrowseView / 详情页）
```

**数据源抓取链**（v2.2.4+ 统一走 javdb-smart.ts）：
```
fetchDetailSmart(code, settings, state, onEvent?)
  → settings.dataSource === 'auto'
      → order = settings.customSourceOrder ?? DEFAULT_SOURCE_ORDER
      → 逐个源尝试：javapi → javinfo → javdb → javbus → javlibrary（按 order）
      → 任一源命中即返回 { detail, source }
      → 全部失败 → { detail: null, error: "javapi=跳过; javinfo=跳过; ..." 完整 summary }
  → 单点补齐(videoFetchJavdbDetail) / 批量补齐(libraryFetchJavdbAll) / reconcile 兜底 都走这里
```

**UI 抓取过程可视化**（v2.2.10）：fetchDetailSmart 第 4 参 `onEvent` 每源推一条 → `ScanProgress.fetchEvent` → renderer 右下角 FetchLogOverlay 浮层显示"javdb 失败 → 降级 javbus"。

---

## 5. 数据源系统详解（最近改最多的部分）

| 源 | 特点 | 配置 |
|---|---|---|
| javapi | 本地自托管（免费、无风控、信息最全）| settings.javapiUrl + javapiKey |
| javinfo | 聚合 API（免爬虫）| settings.javinfoKey（app.javinfo.dev 注册）|
| javdb | 信息全但 Cloudflare 风控（偶发 403）| settings.javdbCookie 可选 |
| javbus | 信息中、Cloudflare、需绕过年龄验证 | 无（自动 ensureJavBusAgeCookie）|
| javlibrary | 偏简、纯兜底 | 无 |

**关键机制**：
- `customSourceOrder`：Settings 字段（v2.2.1 加），SettingsModal 里拖拽排序（v2.2.6 暴露 UI）
- `SmartFetchState`：任一源连续 3 部**网络失败**（非"无结果"）→ 本轮禁用该源；JavBus 连续 3 部失败 → `state.stop` 整批停止（防空转）
- `fetchDetailSmart` auto 模式：`srcResults[]` 完整记录每个源结果，最终 error 是 5 源 summary（v2.2.6 修的错误信息误导）
- `fetchPosterSmart`（v2.2.8）：海报抓取也按 customSourceOrder 降级（原 fetchJavdbPosterForVideo 硬走 JavDB 的漏洞）

---

## 6. 版本史（v2.2.x 干了什么，为什么要做）

| 版本 | 核心内容 | 为什么 |
|---|---|---|
| v2.2.0 | 删 markdown 片单、数据源顺序确认、隐私锁删密码 | 大重构 |
| v2.2.1 | customSourceOrder 字段 + CI 签名修 | 用户要自定义顺序 |
| v2.2.2 | 番号解析增强（域名前缀 hdd800.com@xxx、_ 归一化、字母后缀）| 匹配不上 |
| v2.2.3 | autoFindIntroExcel 自动扫库根 xlsx + used 记账去重 | 用户"收录了说没收录" |
| v2.2.4 | **XLSX.readFile 中文路径 bug** + 片单异常弹窗 + 无片单兜底抓元数据 + fetchDetailSmart 抽模块 | 用户 84 部全"未分类" |
| v2.2.5 | lm 协议 ENOENT 静默 + cleanupDeadPreviewPaths | 控制台大量报错 |
| v2.2.6 | fetchDetailSmart 错误信息完整化 + SettingsModal 拖拽排序 UI | 用户误以为没继续试其他源 |
| v2.2.7 | 文案随 customSourceOrder 联动 | 拖了顺序文案没变 |
| v2.2.8 | fetchPosterSmart（海报也跟自定义顺序）| "真实采集顺序是否变了" |
| v2.2.9 | main 进程 console.log 落盘 + [smart] 总览 log | 用户看不到后台日志 |
| v2.2.10 | **UI 实时抓取过程浮层**（右下角）| "UI 也应该能看到降级过程" |

**当前用户状态**（data.json 实测）：84 部视频，80 部已有 javdbDetail（source 全是 javbus——JavDB 一直被 Cloudflare 风控），customSourceOrder 已存 `["javdb","javbus","javapi","javinfo","javlibrary"]`。

---

## 7. 开发 / 构建 / 发布流程

### 开发
```
npm run dev        # electron-vite dev（HMR 只热更新 renderer，改 main 要重启）
```
⚠️ dev 模式下 main 进程的 console 输出在 terminal；v2.2.9 起也落盘到 `%APPDATA%\影海\logs\main.log`。

### 打包 + 签名
```
npm run pack       # build + electron-builder → C:\Users\19218\yingxia-release\<时间戳>\影海 Setup <ver>.exe
```
签名（自签名 pfx，证书指纹 `2818B2F69CAD337604F42DEFC7B5A3C3696F02AC`）：
```
"C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign /sha1 <TP> /fd SHA256 /tr http://timestamp.sectigo.com /td SHA256 "<installer>.exe"
```
⚠️ 签名时时间戳服务器（Sectigo）可能 503——网络问题，稍后重试或跳过时间戳（无时间戳仍可装）。

### 发布（GitHub Release）
```
GITHUB_TOKEN=<token> TAG=v2.2.x TITLE="影海 v2.2.x" \
INSTALLER_PATH="C:/Users/19218/yingxia-release/<ts>/影海 Setup <ver>.exe" \
node scripts/publish-release.mjs
```
- ⚠️ **token 必须从环境变量读**（GitHub Push Protection 会拦含硬编码 token 的 commit，v2.2.5 踩过）
- 用 node https 而非 curl（curl 走 HTTP_PROXY env var 可能因代理节点挂而 000，node 直连能通）
- Gitee 单文件 100MB 限制 → Gitee Release 只发源码 zip（v2.2.4 起的一致模式）

### Git 双推
```
git push origin main && git push origin v2.2.x
git push gitee main && git push gitee v2.2.x
```
⚠️ origin pushurl 同时配了 gitee+github 双推，一边失败整体失败；Gitee 遇 `non-fast-forward` 用 `--force-with-lease`（v2.2.10 用户手动处理过一次）。

---

## 8. 已知问题 / 未完成事项（接手后优先做）

### 🔴 高优先级未做
1. **文档标签分层**（用户 3 大需求里唯一没做完的）：
   - 用户要求："文档里定义的标签优先用；其他数据源抓的标签折叠成一行（可展开）做备用展示"
   - 现状：`backfillFromDetail`（ipc.ts L150）把 `v.tags` + `detail.genres` **合并去重**到同一个数组——没有分层
   - 计划（v2.2.7 写的）：
     - Video 加 `tagCategories?: Record<string, string[]>`（存 Excel 原始结构化标签，parseIntroExcel 已有 IntroItem.tagCategories 数据）
     - Video 加 `backupTags?: string[]`（存数据源 genres，单独字段不合并）
     - reconcile if(doc) 分支写 tagCategories；backfillFromDetail 写 backupTags 不合并
     - VideoDetail 详情页：主标签一行 + 折叠"备用来源标签"
   - 注意：涉及数据迁移，参考 v2.2.5 ENOENT 教训——**改数据结构时处理孤儿引用**

### 🟡 低优先级
2. **时间戳签名**：v2.2.10 是无时间戳签名（Sectigo 503），网络恢复后可补
3. **gitee remote 明文 token**：`.git/config` 里 gitee URL 带 token（`mr-awei:56c852...`），建议 `git remote set-url gitee https://gitee.com/...` 清掉（会走 Windows 凭据管理器）
4. **ffmpeg 捆绑**：electron-builder.yml 里 build/ffmpeg 捆绑被注释（本地打包时目录不存在），新电脑需系统装 ffmpeg 或恢复捆绑
5. **JavDB 风控**：用户 IP 被 Cloudflare 403，v2.2.x 全靠 javbus 兜底——如果用户想用 javdb，需要换 IP/节点或配 Cookie

### 🟢 已知技术债
- `fetchMovieDetail` wrapper 在 ipc.ts（内部调 fetchDetailSmart），仅为了老调用方兼容
- `renderer-console.log` + `logs/main.log` 双日志文件（renderer 用 JSON 行格式，main 用文本行）
- `src/shared/tagCategories.ts` 存在（v2.2.0 删 md 前的残留？未确认是否还有用）

---

## 9. 坑与教训（代码库特有，必读）

1. **XLSX.readFile 中文路径静默失败**（v2.2.4 根因）：`XLSX.readFile('E:\新建文件夹\xxx.xlsx')` 抛 `Cannot access file`，但返回 null 被 catch 吞掉→用户 84 部全"未分类"。**必须** `fs.readFile()` + `XLSX.read(buf, {type:'buffer'})`。excel.ts 已修，别改回去。
2. **lm:// 协议 ENOENT 刷屏**（v2.2.5）：poster/preview 文件被清但 data.json 残留路径→每次渲染 15 次 ENOENT。已修：ENOENT 静默 + reconcile 清理。**新增字段引用文件时记得清理孤儿**。
3. **fetchDetailSmart 被抽两次的教训**（v2.2.4/2.2.6）：抽函数时 grep 全部调用方，**全切完再删旧**——v2.2.4 只搬了函数没搬 fetchMovieDetail，导致两套逻辑不一致。
4. **错误信息要反映完整流程**：用户只看错误信息推断发生了什么。v2.2.6 把 auto 降级 error 改成 5 源完整 summary（"javapi=跳过; javdb=无结果; ..."）。
5. **Codex 沙箱防火墙规则**（2026-08-30 网络故障根因）：`Get-NetFirewallRule` 里的 `codex_sandbox_offline_block_outbound` (Block Any Any) 会拦所有出站。网络"断"先查它。
6. **curl 000 ≠ 真断**：curl 读 HTTP_PROXY env var，代理节点挂时 000；node https / git push / PowerShell 各走各的栈。发布用 node 脚本最稳。
7. **main 进程 console 不落盘**：renderer console 由 attachRendererLog 接 webContents.console-message；main 自己的 console 走 terminal（v2.2.9 起劫持写 logs/main.log）。
8. **Windows 终端是 cmd.exe**：给用户命令用 `cd /d`、`\` 反斜杠、避免 PowerShell 语法。
9. **GITHUB PUSH PROTECTION**：任何 token 别硬编码进仓库文件（v2.2.5 踩过，push 被拒）。
10. **时间戳服务器 503**：打包签名时 Sectigo/DigiCert 可能连不上，可先无时间戳签名发布。

---

## 10. 用户偏好（合作方式）

- 中文交流，简洁直接
- **小步快跑**：大任务拆小步骤逐个执行，别停在讨论
- 问题不能藏：找不到/解析失败/降级过程都要可见（弹窗、Toast、浮层、日志）
- 授权 AI 直接修本机环境问题，不用逐步确认
- 用户会在进度停滞时打断重新定向，倾向快速行动

---

## 11. 快速上手清单（接手的 AI 第一步）

1. 读本文件 + `CHANGELOG.md`（版本史）+ `src/main/lib/javdb-smart.ts`（智能抓取中枢）
2. `npm run typecheck` 确认 0 错，`npm run build` 确认构建
3. 有用户问题反馈时，先看 `%APPDATA%\影海\logs\main.log` + `%APPDATA%\影海\renderer-console.log` + `%APPDATA%\影海\data.json`（settings/videos 现状）
4. 改 main 进程 → 提醒用户重启 dev；改 renderer → HMR 生效
5. 发布：npm run pack → 签名 → publish-release.mjs（token 走环境变量）
