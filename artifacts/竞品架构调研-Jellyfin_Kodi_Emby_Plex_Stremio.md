# 主流媒体库项目架构调研报告
## —— 为「影海 Yinghai」本地影视管理应用提供优化方向

> 调研时间：2026-09-16
> 调研对象：Jellyfin、Kodi、Emby、Plex、Stremio（含 Navidrome / Tautulli 等周边）
> 目标：梳理八大维度的竞品做法与来源，最后给出对影海可借鉴点的可行性排序

---

## 0. 调研对象速览

| 项目 | 技术栈 | 定位 | 与影海相似度 |
|---|---|---|---|
| **Jellyfin** | .NET / C#，SQLite + EF Core | 自托管媒体服务器 | 高（本地优先、开源、元数据驱动） |
| **Kodi** | C++，SQLite / MySQL | 本地媒体中心（HTPC） | 高（本地文件库、NFO 事实标准） |
| **Emby** | .NET，SQLite | 商业媒体服务器（Jellyfin 上游） | 中 |
| **Plex** | 闭源 C++，SQLite | 商业客户端-服务器 + 云账户 | 中（架构可参考，模式不建议照抄） |
| **Stremio** | Node.js / Electron 客户端 + 无状态 HTTP Addon | 去中心化流媒体聚合 | 高（Electron 生态、插件协议值得借鉴） |

---

## 1. 数据存储方案

### 1.1 Jellyfin：SQLite + EF Core，从"裸 SQL 散落各处"走向 ORM 集中管理

- **数据库选型**：默认 SQLite，WAL 模式（`jellyfin.db` + `jellyfin.db-wal` + `jellyfin.db-shm`）。连接串示例：`Data Source=jellyfin.db;Cache=Default;Default Timeout=30;Pooling=True`，PRAGMA 调优 `locking_mode=NORMAL`、`synchronous=1`、`temp_store=2`。
  - 来源：<https://jellywatch.app/blog/jellyfin-database-maintenance-optimization-guide-2026>
- **架构演进**：10.11 之前代码库被批评为"spaghetti"——SQL 语句散落在业务代码里，没有 ORM。10.11 把 Library Database 完整迁移到 **Entity Framework Core**，引入 `JellyfinDbContext`、`ItemRepository`、`UserDataRepository` 三层仓储。
  - 来源：<https://jellyfin.org/posts/jellyfin-release-10.11.0/>
  - 来源：<https://mintlify.wiki/jellyfin/jellyfin/concepts/architecture>
- **索引设计**：对 `BaseItem` 建复合索引 `(Type, DateCreated)`、`(ParentId)` 并 `IncludeProperties(Name, Type)` 做覆盖索引；用 `HasQueryFilter` 做全局软过滤。
  - 来源：<https://blog.csdn.net/gitblog_00759/article/details/151917086>
- **多库拆分历史**：曾长期维持"主库（用户/设置）+ 媒体库库"两个 SQLite 文件，10.11 后逐步合并为单库。
  - 来源：<https://mintlify.wiki/jellyfin/jellyfin/concepts/architecture>

### 1.2 Kodi：本地 SQLite 起步，可切 MySQL 中央库做多端同步

- **本地库**：`userdata/Database/` 下多个 `.db`，文件名带 schema 版本号（如 `kodi_video120.db`、`kodi_music56.db`、`AddonsXX.db`），版本号随 Kodi 主版本递增但不总是 +1。
  - 来源：<https://arxiv.org/pdf/2012.01107.pdf>
  - 来源：<https://wiki.geekitude.fr/info/logiciels/kodi/accueil>
- **中央库**：通过 `advancedsettings.xml` 把 `videodatabase` / `musicdatabase` 指向 MySQL/MariaDB，实现多台 Kodi 共享同一媒体库与观看状态。
  - 来源：<https://kodi.wiki/view/MySQL/Setting_up_MySQL>
  - 来源：<https://kodi.wiki/view/MySQL/Advanced_notes>
- **NFO 作为"外挂数据库"**：Kodi 是 NFO 事实标准制定者，`<VideoFileName>.nfo` 与视频同名同目录，扫描时**永远先读 NFO**，再决定是否走在线 scraper。
  - 来源：<https://kodi.wiki/view/NFO_files>
  - 来源：<https://kodi.wiki/index.php?title=NFO_files/Movies>

### 1.3 Plex：SQLite WAL + 后台优化，闭源但实践激进

- 采用 **SQLite WAL 模式 + `synchronous=NORMAL`**，对比 Emby 默认 DELETE/INSERT 模型，日志写阻塞下降约 92%。
  - 来源：<https://lifetips.alibaba.com/tech-efficiency/best-desktop-media-server-application>
- 元数据 agent 在后端聚合 TMDB / TVDB / IMDb 后排序，对用户暴露"可调顺序的 source priority"。
  - 来源：<https://support.plex.tv/articles/200241558-agents/>
  - 来源：<https://forums.plex.tv/t/metadata-mismatch-from-thetvdb-for-rifftrax/935330>

---

## 2. 媒体库扫描与文件监控

### 2.1 Jellyfin：inotify 实时监控 + 增量扫描 + 优先级队列

- **文件系统监控**：Linux 下用 **inotify** 做"real time monitoring"；一旦触发，只扫描变更项，不全量重扫。
  - 来源：<https://forum.jellyfin.org/t-library-scan?pid=56277>
- **增量判定**：用文件 **mtime + size** 变化判断是否需要重新扫元数据，避免重复网络请求。
  - 来源：<https://blog.csdn.net/gitblog_01160/article/details/152356490>
- **任务调度**：带优先级的任务队列，用户正在浏览的项目优先；默认全量扫描间隔 12 小时。
  - 来源：<https://blog.csdn.net/gitblog_01160/article/details/152356490>
  - 来源：<https://forum.jellyfin.org/t-library-scan?pid=56371>
- **网络盘的坑**：NFS 不支持 inotify，SMB 默认 watch 数不够（默认 8192，需调到 524288）；官方建议网络盘关掉实时监控，改回定时扫描。
  - 来源：<https://selfhosting.sh/apps/jellyfin/ubuntu/>
  - 来源：<https://forum.jellyfin.org/t-library-scan?pid=56371>
- **触发式补扫**：社区方案 Autopulse / Radarr-Sonarr Connect 通过 webhook 只扫新增文件，延迟 5–15 秒，CPU 占用极低。
  - 来源：<https://jellywatch.app/blog/autopulse-jellyfin-instant-library-updates-no-scheduled-scans-2026>

### 2.2 Plex：事件驱动扫描，避免轮询反模式

- **设计原则**："Auto-scan every 5 minutes" 被明确列为反模式（峰值 100% I/O wait）。Plex 走 **事件驱动**：监听 OS 文件通知（inotify / kqueue），零轮询开销。
  - 来源：<https://lifetips.alibaba.com/tech-efficiency/best-desktop-media-server-application>
- **配置项**：`Scan my library periodically` 开关 + `Library scan interval` 下拉；官方文档说明网络挂载通常收不到 OS 通知，需退回定时扫描。
  - 来源：<https://support.plex.tv/articles/200289526-library/>
- **重活延后**：缩略图生成放到 idle CPU 周期（Linux 上用 `ionice -c 3`），避免影响前台播放。
  - 来源：<https://lifetips.alibaba.com/tech-efficiency/best-desktop-media-server-application>

### 2.3 Jellyfin 12.0 的关键改进（与扫描相关）

- 12.0 起，**数据库重维护操作不再与库扫描并发**，消除资源争抢；之前卡死的页面现在不再冻结。
  - 来源：<https://jellyfin.org/posts/jellyfin-release-12.0/>
  - 来源：<https://livreeaberto.com/jellyfin-12-0-lancado>

---

## 3. 刮削器 / 元数据架构

### 3.1 Jellyfin：插件化 MetadataProvider + 本地优先 + 可配置优先级

- **本地 NFO 永远优先**：官方文档明确"Local metadata will always be fetched and has priority over remote metadata providers like TMDb"；NFO 中带的图片路径/URL 也优先于远程 artwork。
  - 来源：<https://jellyfin.org/docs/general/server/metadata/nfo/>
- **可配置顺序**：`MetadataOptions.LocalMetadataReaderOrder = ["XbmcMetadata", "NfoMetadata"]`，远程源顺序 TMDb > TVDB > OMDB，可在库级别重排。
  - 来源：<https://blog.csdn.net/gitblog_00895/article/details/152382879>
- **图片文件命名约定**：`<VideoFileName>-poster.jpg`、`-fanart.jpg`、`-thumb.jpg`、`landscape.jpg` 等同目录识别。
  - 来源：<https://jellyfin.org/docs/general/server/media/music-videos/>
- **按库类型配置 agent**：Jellyfin 允许对电影库、剧集库分别指定 agent 优先级，比 Plex 更细。
  - 来源：<https://datahoarder.io/plex-vs-emby-vs-jellyfin/>

### 3.2 Kodi：XML Scraper 声明式 + NFO 短路

- **Scraper 协议**：用 XML 描述三段式：`CreateSearchUrl`（构造搜索 URL）→ `GetSearchResults`（正则解析结果列表）→ `GetDetails`（正则解析详情页），支持 `CustomFunction` 写 Python 后处理。
  - 来源：<https://kodi.wiki/view/Scraper_development_XML>
- **NFO 短路规则**：无论 scraper 设置如何，**Kodi 总是先找 NFO**；找到就直接导入，跳过在线匹配。
  - 来源：<https://kodi.wiki/index.php?title=NFO_files/Movies>

### 3.3 Plex：拖拽排序的 Agent + Fallback

- **Source Priority UI**：在 Agent 设置页用 handle 拖拽调整数据源顺序；"If a piece of metadata isn't available from your first source, the agent will fallback down the priority list until it finds a source with that information."
  - 来源：<https://support.plex.tv/articles/200241558-agents/>
  - 来源：<https://forums.plex.tv/t/aucune-affiche/167722>
- **本地媒体资产**：`Local Media Assets` 默认排第一，用户维护 NFO 时保留；全自动用户可以把它拖到底甚至关掉。
  - 来源：<https://forums.plex.tv/t/plex-agents-order-again/441259>
- **NFO 唯一 ID 约定**：`<uniqueid type="tmdb" default="true">383498</uniqueid>` 生成稳定 GUID，避免重复刮削。
  - 来源：<https://support.plex.tv/articles/using-nfo-metadata-files-with-plex/>

---

## 4. 播放器集成与进度同步

### 4.1 Jellyfin：服务端秒级进度 + WebSocket 远程控制

- **断点续播**：服务端追踪播放位置到秒（UserDataRepository），多设备天然同步——客厅 TV 暂停，手机继续。
  - 来源：<https://diymediaserver.com/post/2026/jellyfin-vs-kodi-comparison/>
  - 来源：<https://mintlify.wiki/jellyfin/jellyfin/concepts/architecture>
- **Kodi 双模式集成**：
  - **Jellyfin for Kodi（Sync 模式）**：把 Jellyfin 库元数据同步进 Kodi 本地 SQLite，Kodi 用自己的播放器。
  - **JellyCon（Addon 模式）**：纯流式 addon，通过 WebSocket 与服务端双向通信，支持远程播放控制、导航、库同步。
  - 来源：<https://jellyfin.org/docs/general/clients/kodi/>
  - 来源：<https://deepwiki.com/jellyfin/jellycon/3.6-websocket-and-remote-control>
- **踩坑**：不要把 Kodi 的 `.db` 直接拷给另一台客户端，会与服务端同步冲突。
  - 来源：<https://jellyfin.org/docs/general/clients/kodi/>

### 4.2 Kodi：本地播放器 + 外挂同步

- 自带 C++ 播放器（DVDPlayer / PLS），默认不做云同步；要看状态同步需要：① 共享 MySQL 中央库，② 接 Trakt 等第三方，③ 作为 Jellyfin 前端。
  - 来源：<https://diymediaserver.com/post/2026/jellyfin-vs-kodi-comparison/>
- `advancedsettings.xml` 可配 `importwatchedstate` / `importresumepoint` 控制导入行为。
  - 来源：<https://opensource.com/sites/default/files/articles/kodi_media_guide.pdf>

---

## 5. 大规模媒体库性能优化

### 5.1 Jellyfin 12.0：把"扫描"和"维护"解耦

- 升级后首次扫描会显著变慢（因为要逐文件对账、清掉旧版 alternate versions），但稳态下**扫描期不再跑数据库重维护**，消除了争抢。
  - 来源：<https://jellyfin.org/posts/jellyfin-release-12.0/>
  - 来源：<https://livreeaberto.com/jellyfin-12-0-lancado>
- **EF Core 激进内存缓存**：10.11 起用 in-memory 缓存最小化磁盘读，代价是 idle 内存上升（Jellyfin idle ~100–200 MB）。
  - 来源：<https://jellywatch.app/blog/jellyfin-10-10-10-11-upgrade-guide-new-features-2026>
  - 来源：<https://selfhostsetup.com/posts/plex-vs-jellyfin-media-server-comparison/>

### 5.2 Plex：I/O 调度 + 缩略图延迟生成

- 缩略图生成走 idle CPU（`ionice -c 3`），不影响前台交互。
  - 来源：<https://lifetips.alibaba.com/tech-efficiency/best-desktop-media-server-application>
- **代价警示**：Plex 默认每 24 小时重写一次元数据缩略图，5 万条库每次扫描产生 ~1.2 GB 随机小文件 I/O，长期对 SSD 寿命不友好——这是 Plex 模式需要规避的反面教材。
  - 来源：<https://lifetips.alibaba.com/tech-efficiency/home-theater-software-showdown-kodi-vs-plex>
- **Intro / Credit 检测**是重 CPU 任务，默认开启后会让 scanner 跑数小时；官方建议在大库分批加文件（50–100 个一批）。
  - 来源：<https://arstechnica.com/civis/threads/why-is-plex-media-scanner-suddenly-eating-up-70-80-of-my-cpu.1490047/>
  - 来源：<https://jellywatch.app/blog/fix-jellyfin-high-cpu-usage-2026>

### 5.3 Kodi：中央 MySQL + 网络缓冲调优

- 多端同步靠 MySQL 中央库；`advancedsettings.xml` 调 `network/buffermode`、`cachemembuffersize`、`readbufferfactor` 优化远程播放。
  - 来源：<https://community.synology.com/enu/forum/1/post/134323>
  - 来源：<https://kodi.wiki/view/MySQL/Advanced_notes>

---

## 6. UI / UX 模式

### 6.1 Plex：Netflix 式 OTT 仪表板

- 视觉上对标 Netflix / Disney+：统一深色主题、海报墙横向滚动、详情页上半屏 fanart + 下半屏元数据，跨 iOS / Android / Apple TV / Roku 一致性最好。
  - 来源：<https://85ideas.com/blog/plex-vs-jellyfin-which-media-server-is-best-in-2025/>
  - 来源：<https://v3.quickbox.io/articles/plex-vs-jellyfin-2026-honest-comparison>
- **反面**：把直播频道、付费流媒体推荐混在用户个人库上方，菜单层级多（侧边源 + 顶栏设置 + 服务器配置三层），被社区批评"不够聚焦"。
  - 来源：<https://raspberrytips.com/jellyfin-vs-plex/>
  - 来源：<https://m.sohu.com/a/1071288369_121674805/>

### 6.2 Jellyfin：极简左栏 + 分类直出

- 左侧主菜单直接列出 Movies / Shows / Music / Photos， dashboard 按类目分块，无 OTT 推荐干扰；主题可换、可通过插件（如 Home Sections / Moonfin）扩展首页行。
  - 来源：<https://raspberrytips.com/jellyfin-vs-plex/>
  - 来源：<https://jasontucker.blog/from-plex-to-jellyfin-part-6-rebuilding-the-home-screen/>
- **详情页性能细节**：第三方客户端 Plezy 的经验——"Show detail 先渲染骨架，再异步查 On-Deck 剧集"，首屏快 18%；冷启动时 Discover 只加载一次。
  - 来源：<https://apps.apple.com/pa/app/plezy-for-plex-jellyfin/id6754315964>

### 6.3 Tautulli（周边参考）：观看统计仪表盘

- Tautulli 作为 Jellyfin / Plex 的第三方统计面板，提供用户观看时长、节目热度、带宽图表——说明"可观测性"是媒体库应用的标配诉求。
  - 来源：<https://selfhosting.sh/compare/jellyfin-vs-emby-vs-plex/>（对比表提及）

---

## 7. 数据迁移与备份

### 7.1 Jellyfin：EF Core Migration + 内置 Backup/Restore

- **迁移机制**：EF Core 自动维护 `__EFMigrationsHistory` 表，启动时比对模型快照，自动应用 pending migration；升级路径要求严格（12.0 必须从 10.10.7 或 10.11.x 升）。
  - 来源：<https://blog.csdn.net/gitblog_00424/article/details/152356753>
  - 来源：<https://learn.microsoft.com/fil-ph/ef/core/managing-schemas/migrations/>
- **12.0 破坏性变更**：schema 会主动重写数据，官方强调"升级前 STOP 服务 + 全量手动备份 data 目录"，备份是回滚唯一手段。
  - 来源：<https://jellyfin.org/posts/jellyfin-release-12.0/>
- **内置备份**：10.11 起加入内部 Backup/Restore，可对元数据库做 live snapshot 并外置存储。
  - 来源：<https://linuxiac.com/jellyfin-10-11-media-server-arrives-with-backup-support-ffmpeg-7-1-and-more/>
- **手动备份**：停服后整体拷贝 `data/` 与配置目录（Windows: `C:\ProgramData\Jellyfin\Server\data\jellyfin.db`）。
  - 来源：<https://jellyfin.org/docs/general/administration/backup-and-restore/>

### 7.2 Kodi：版本号数据库 + 不可直接回拷

- 数据库文件名带 schema 版本号（`kodi_video120.db`），跨主版本升级后会新建文件，**不能直接把旧版 `.db` 拷回新版**；备份脚本需识别版本号。
  - 来源：<https://arxiv.org/pdf/2012.01107.pdf>
  - 来源：<https://wiki.geekitude.fr/info/logiciels/kodi/accueil>

---

## 8. 插件 / 扩展架构

### 8.1 Jellyfin / Emby：进程内 DLL 插件 + 隔离加载上下文

- **Jellyfin**：插件是 .NET 程序集，入口类继承 `BasePlugin<TConfiguration>`，实现 `IHasPluginConfiguration` 等接口；`PluginManager`（`Emby.Server.Implementations/Plugins/PluginManager.cs`）负责发现、校验、实例化；每个插件跑在独立 `PluginLoadContext`，避免程序集版本冲突。
  - 来源：<https://instagit.com/jellyfin/jellyfin/jellyfin-plugin-system-architecture-create-plugin/>
  - 来源：<https://www.andymorrell.net/articles/building-jellyfin-plugins-with-ai/>
- **可扩展点**：metadata provider、auth provider、API endpoint、server event 响应、配置页、扫描/组织扩展。
  - 来源：<https://mintlify.wiki/jellyfin/jellyfin/development/plugin-development>
- **Emby**：插件实现 `IServerEntryPoint`，靠自动类型发现注册；目录在 Dashboard → Plugins → Catalog。
  - 来源：<https://betadev.emby.media/doc/plugins/dev/index.html>
  - 来源：<https://jellywatch.app/blog/awesome-emby-plugins-ecosystem-complete-guide-2026>

### 8.2 Stremio：无状态 HTTP Addon 协议（最适合 Electron 借鉴）

- **协议定义**：Addon 是"无状态 HTTP 服务器"，通过 REST 暴露 4 类端点：
  - `GET /catalog/:type/:id/:extra.json` → 目录（首页行 / 策展列表）
  - `GET /meta/:type/:id.json` → 元数据
  - `GET /stream/:type/:id.json` → 可播放流
  - `GET /search/:type/:id/:query.json` → 搜索
  - 来源：<https://gist.github.com/dipandhali2021/96559332a40269f911e043d864f8763f>
  - 来源：<https://blog.csdn.net/whqwhqwhqxaut/article/details/164453006>
- **关注点分离最佳实践**：元数据/catalog 用一类 addon，流聚合/质量控制用另一类 addon；用户可单独启用/禁用。
  - 来源：<https://luckynumb3rs.github.io/stremio-perfect-setup/guide/0-Beginner-Concepts/>
- **UI 层 addon**：Marquee addon 不提供流，只基于 Trakt 热度生成 AI 海报——说明 addon 协议足以覆盖 UI 增强层。
  - 来源：<https://stremioaddonmanager.org/blog/addons/visual-revolution-in-stremio-a-technical-guide-to-the-marquee-addon>
- **保护型核心 addon**：官方核心 addon 不可卸载，社区 addon 用户自担风险。
  - 来源：<https://stremio.zendesk.com/hc/en-us/articles/360021348391>

### 8.3 Kodi：Python Addon + XML Scraper 双轨

- 刮削器走 XML 声明式（见 §3.2），完整功能插件走 Python 运行时，通过 XML-RPC 与主程序双向通信。
  - 来源：<https://wenku.csdn.net/doc/27fq367xuc>

---

## 9. 对影海 Yinghai 的可借鉴点（按可行性 × 价值排序）

> 影海是 **Electron + 本地优先** 应用。下列排序综合：技术栈匹配度（Electron/Node/SQLite）、用户价值、实现成本。

### 🥇 第一优先级（高价值、低成本，强烈建议立即采纳）

1. **SQLite + WAL + 显式 PRAGMA 调优**
   - 做法：`PRAGMA journal_mode=WAL; synchronous=NORMAL; temp_store=MEMORY;`，连接池化。
   - 来源：Jellyfin / Plex 实践（§1.1、§1.3）。
   - 影海收益：万级库列表查询不卡，写入不阻塞 UI。

2. **本地 NFO 永远优先于在线刮削**
   - 做法：扫描时先找 `<VideoFileName>.nfo`，命中就跳过网络请求；在线源作为 fallback。
   - 来源：Kodi / Jellyfin 明确约定（§3.1、§3.2）。
   - 影海收益：隐私友好、离线可用、刮削失败时不丢数据。

3. **文件系统事件驱动 + 增量扫描（mtime+size 指纹）**
   - 做法：Windows 上用 `ReadDirectoryChangesW`（Node 侧 `chokidar` 已封装），只扫变更项；网络盘/外接盘回退到定时全量对账。
   - 来源：Jellyfin inotify 实践 + Plex 反模式警示（§2.1、§2.2）。
   - 影海收益：避免"每 5 分钟全量扫一次"的 I/O 灾难。

4. **schema 迁移工具化（SQLite 用 `knex` / `prisma migrate` / 自研版本表）**
   - 做法：维护 `__migrations` 历史表，启动时自动 apply；破坏性变更前提示用户备份。
   - 来源：Jellyfin EF Core 教训（§7.1）。
   - 影海收益：Electron 自动更新场景下，老用户升级不丢库。

### 🥈 第二优先级（中价值、中成本，本季度规划）

5. **可配置的多刮削源优先级 + Fallback 链**
   - 做法：UI 拖拽调整 TMDb / TVDB / OMDB / 豆瓣顺序；本地 NFO > 第一源 > 第二源……；按库类型（电影/剧集/动漫）分别配置。
   - 来源：Plex Agent 拖拽 + Jellyfin `MetadataOptions`（§3.1、§3.3）。
   - 影海收益：解决"中文片源刮不准"的核心痛点。

6. **扫描任务与 UI 渲染解耦（后台队列 + 优先级）**
   - 做法：扫描/缩略图生成放后台 worker，idle 时跑；用户正在浏览的项优先；不与主渲染抢资源。
   - 来源：Jellyfin 12.0 解耦 + Plex `ionice` 思路（§2.3、§5.2）。
   - 影海收益：大库导入不卡 UI。

7. **图片/海报缓存目录规范**
   - 做法：在媒体旁识别 `xxx-poster.jpg` / `xxx-fanart.jpg`；远程下载的海报存到应用 `cache/posters/<tmdb_id>/`，按内容寻址避免重复下载。
   - 来源：Jellyfin 命名约定（§3.1）。
   - 影海收益：二次启动快、可手动替换海报。

8. **播放进度本地持久化 + 可导出**
   - 做法：`playback_positions(item_id, user, position_ms, updated_at)` 表，按 item 主键索引；断点续播直接读。
   - 来源：Jellyfin `UserDataRepository` 抽象（§4.1）。
   - 影海收益：即使后续做多端同步，表结构也已就位。

### 🥉 第三优先级（高价值但成本高，中期规划）

9. **借鉴 Stremio 的"无状态 HTTP Addon"协议做插件系统**
   - 做法：影海插件 = 一个本地/远程 HTTP 服务，暴露 `/catalog`、`/meta`、`/stream`、`/search` 4 个端点；主应用通过配置 URL 接入。
   - 优势：比 Jellyfin 式进程内 DLL 插件安全（沙箱、崩溃不拖垮主进程）、比 Electron 原生 IPC 插件跨语言（Python/Go/Node 都行）、调试方便（curl 直连）。
   - 来源：Stremio Addon Protocol v3（§8.2）。
   - 影海收益：刮削器、字幕源、弹幕源、AI 海报都可以做成 addon，不污染核心。

10. **首页信息架构：先渲染骨架，后异步补全**
    - 做法：详情页先出标题/海报/基本元数据，On-Deck 剧集、演员卡、推荐位异步加载；列表用虚拟滚动。
    - 来源：Plezy 实测 18% 提速（§6.2）。
    - 影海收益：万级库首页秒开。

11. **内置 Backup / Restore 一键导出**
    - 做法：设置页加"导出库"按钮——打包 SQLite db + NFO + 海报 zip；导入时做 schema 版本检查。
    - 来源：Jellyfin 10.11 内置备份（§7.1）。
    - 影海收益：用户换机器/重装系统不丢刮削结果。

### ⛔ 不建议影海照搬的做法

- **Plex 式云账户中心化**：影海定位本地应用，不应把库状态绑到外部账号；参考 Jellyfin 的"完全离线可用"。
  - 来源：<https://selfhosting.sh/compare/jellyfin-vs-plex-vs-emby/>
- **Plex 式每 24h 重写缩略图**：会随机写爆 SSD，改成 mtime 触发即可。
- **Kodi 式数据库文件名带版本号**：让用户备份脚本报废，用 migration 历史表更友好。

---

## 10. 关键来源汇总（可直接打开）

- Jellyfin 官方发布说明：<https://jellyfin.org/posts/jellyfin-release-10.11.0/> · <https://jellyfin.org/posts/jellyfin-release-12.0/>
- Jellyfin 架构 Wiki：<https://mintlify.wiki/jellyfin/jellyfin/concepts/architecture>
- Jellyfin NFO 文档：<https://jellyfin.org/docs/general/server/metadata/nfo/>
- Jellyfin 备份文档：<https://jellyfin.org/docs/general/administration/backup-and-restore/>
- Jellyfin 插件开发：<https://mintlify.wiki/jellyfin/jellyfin/development/plugin-development>
- Kodi NFO 规范：<https://kodi.wiki/view/NFO_files> · <https://kodi.wiki/index.php?title=NFO_files/Movies>
- Kodi Scraper XML：<https://kodi.wiki/view/Scraper_development_XML>
- Kodi MySQL 中央库：<https://kodi.wiki/view/MySQL/Setting_up_MySQL>
- Plex Agent 优先级：<https://support.plex.tv/articles/200241558-agents/>
- Plex 库扫描设置：<https://support.plex.tv/articles/200289526-library/>
- Plex NFO：<https://support.plex.tv/articles/using-nfo-metadata-files-with-plex/>
- Stremio Addon 协议：<https://gist.github.com/dipandhali2021/96559332a40269f911e043d864f8763f>
- Emby 插件开发：<https://betadev.emby.media/doc/plugins/dev/index.html>
- Jellyfin 插件机制深度：<https://instagit.com/jellyfin/jellyfin/jellyfin-plugin-system-architecture-create-plugin/>
- Jellyfin 数据库维护：<https://jellywatch.app/blog/jellyfin-database-maintenance-optimization-guide-2026>

---

*报告完。如需针对某一维度（如插件协议详细设计、扫描队列状态机）继续深挖，可在此基础上展开。*
