# 影匣 YingXia

<div align="center">
  <a href="README.md">English</a>
  <span> · </span>
  <strong><a href="README.zh-CN.md">中文</a></strong>
</div>

<div align="center">
  <strong>v2.7.0</strong> ·
  <span>2026-09-09</span> ·
  <a href="CHANGELOG.md">更新日志</a>
</div>

<br />

## 本地视频海报墙管理工具 · Excel 片单驱动的私人影库

**核心原则：纯本地、不采集、不传输。**

影匣是一款 Windows 桌面应用，能把本地视频文件夹变成精美的海报墙影库。搭配一份 Excel 片单（你的个人目录）后，应用会自动整理、分类并补全元数据——所有元数据始终保存在你自己的电脑上。

> ⚠️ 本工具仅用于管理用户**本地自有**的视频收藏，不传播、不上传、不分享任何内容。

---

## 核心特性

### 📊 Excel 片单驱动
- Excel 片单是 `分类 / 推荐评分 / 简介 / 主题 / 角色 / 服装 / 体型 / 行为 / 玩法 / 场景 / 剧情 / 其他` 的唯一权威来源
- 随时与文件夹对账，详情页按组完整展示片单里非空的标签分组
- AI 生成的中文表头自动映射到英文 schema

### 🖼️ 海报墙浏览
- 三种密度（沉浸 / 标准 / 紧凑），悬停放大延迟 1 秒
- 虚拟滚动支撑大库流畅浏览
- 可在设置页选择「全库平铺」或「按分类分组」作为默认视图

### 🔍 智能元数据补齐
- 自动识别番号，从可配置数据源（JavDB、JavBus、JavLibrary、Javapi、Javinfo）抓取元数据，自动降级
- 支持可拖拽重排序数据源、可暂停/继续/停止的批量抓取进度面板
- 每个视频的抓取失败原因同时在右下角弹窗和详情页内联展示
- 补齐失败后可手工输入番号重试

### 🎬 系列分集与截帧
- 同一番号多文件（如 `SONE-560_1.mp4`、`SONE-560_2.mp4`）在列表页合并为一张卡片
- 缺封面时 ffmpeg 从 12–22 个候选帧里自动跳过黑屏、白屏、模糊、单调画面
- 详情页自动截帧与手动「重新截帧」走同一套多帧管线

### 🛡️ 隐私与安全
- 零上传：应用不向任何服务器上传任何用户数据
- 一键模糊所有封面，删除锁需 SHA-256 校验
- 卸载时可选择保留或删除用户数据，媒体库文件夹受保护脚本把关绝不被触碰

### 🌐 双语与国际化
- 安装器第一步选择语言（简体中文 / English），应用首次打开即为选定语言
- 设置页可随时切换界面语言
- 英文用户须知展示通用免责声明，不引用具体法律法规

### ⚙️ 系统集成
- Windows NSIS 安装包、开机自启、最小化到托盘
- 自动检查更新（GitHub / Gitee 双端发布）
- 可配置 HTTP / HTTPS / SOCKS5 代理，同时覆盖 Node.js 请求与 Chromium 网络栈
- 统计与发现：按标签 / 系列 / 自定义字段筛选，查看总量、最大文件、随机推荐与收藏

---

## Excel 片单结构

应用期望片单表头为**英文**，顺序如下：

| 列名 | 用途 |
| --- | --- |
| Code | 番号 / Video code（如 `SONE-560`）—— **必填** |
| Rating | 用户评分（可选） |
| Category | 分类，单值，详情页 MetaRow 独立一行展示 |
| Theme | 主题标签 |
| Role | 角色标签 |
| Costume | 服装标签 |
| BodyType | 体型标签 |
| Behavior | 行为标签 |
| Play | 玩法标签 |
| Scene | 场景标签 |
| Plot | 剧情标签 |
| Other | 其他标签 |

AI 生成的片单通常使用**中文表头**。向导页会把常见中文表头名自动映射到英文 schema，再写入文件。

---

## 技术栈

- **桌面端**：Electron 31 + electron-vite
- **前端**：React 18 + TypeScript + Tailwind CSS
- **构建打包**：electron-builder（Windows NSIS 安装包）
- **数据**：本地 JSON + Excel（xlsx）解析
- **媒体**：ffmpeg / ffprobe（系统已装或兜底）

---

## 安装与卸载

- **下载**：从 [GitHub Releases](https://github.com/mr-awei/yingxia-video-manager/releases) 页面获取最新安装包（已镜像到 Gitee）
- **安装**：运行 `影匣 Setup x.x.x.exe`，首屏选择界面语言，该语言会保存并在首次启动时应用
- **卸载**：通过 Windows「应用和功能」或开始菜单入口卸载。过程中会询问**保留**还是**删除**应用数据（`%APPDATA%\local-video-manager`）。你的媒体库与媒体文件**绝不会被触碰**

---

## 开发

```bash
npm install
npm run dev        # 启动开发版（自动打开 DevTools）
npm run build      # 构建渲染进程 + 主进程 + preload
npm run typecheck  # TypeScript 类型检查
npm run pack       # 清理 + 构建 + electron-builder 打安装包
```

---

## 版本历史

**v2.7.0**（2026-09-09）— 开源协议切换为双授权协议 + 应用内协议展示弹窗 + 文档全面重写

- 开源协议从 MIT 切换为「影匣 双授权协议 v1.0」（中英双语五章结构）
- 新增应用内开源协议展示弹窗（`LicenseModal`），关于弹窗页脚「查看开源协议」入口
- 协议弹窗支持中英双语切换与邮箱一键复制
- PRD / README / CHANGELOG 全面更新至 v2.7.0

更早版本见 [CHANGELOG.md](CHANGELOG.md)。

---

## 数据隐私声明

1. **零上传**：应用不向任何服务器上传任何用户数据——包括影片列表、标签、评分、路径、文件名。
2. **本地存储**：所有数据存在 `%APPDATA%\local-video-manager\data.json`，可随时备份或删除。
3. **匿名网络请求**：仅在用户主动配置封面/数据源后，应用才会向该服务请求数据；请求不携带任何用户标识（匿名 User-Agent，不发 Cookie）。
4. **可离线使用**：完全切断网络后，除了可选的云端抓取功能外，所有核心功能（扫描、浏览、详情、播放、对账）均可正常使用。

---

## 开源协议

本项目采用「影匣 双授权协议 v1.0」

- ✅ 非商业使用免费（个人、非盈利组织、教育机构）
- 💰 商业使用需授权（联系 new_mr_awei@163.com）
- 🚫 严禁用于恶意程序（三层保护：防篡改注入、防植入恶意程序、防用于恶意程序）
- ⚖️ 违反者保留起诉权利

详见 [LICENSE](./LICENSE)

---

## 联系方式

- 商业授权：new_mr_awei@163.com
- 项目仓库：[GitHub](https://github.com/mr-awei/yingxia-video-manager) · [Gitee](https://gitee.com/mr-awei/yingxia-video-manager)
