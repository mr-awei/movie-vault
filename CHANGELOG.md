# 更新日志（Changelog）

## v2.7.0（2026-09-09）

**开源协议切换为双授权协议 + 应用内协议展示弹窗 + 文档全面重写**

- **开源协议从 MIT 切换为「影匣 双授权协议 v1.0」**：根目录 `LICENSE` 文件完整替换为中英双语双授权协议，包含非商业免费使用授权、恶意程序禁止条款（三层保护：防篡改注入、防植入恶意程序、防用于恶意程序）、商业使用授权、权利保留、免责声明五章结构。商业授权联系邮箱：new_mr_awei@163.com。原 MIT 协议备份为 `LICENSE.mit.backup`。
- **新增应用内开源协议展示弹窗（`LicenseModal`）**：关于弹窗页脚新增「影匣 双授权协议 v1.0 · 查看开源协议」按钮，点击后在应用内打开协议弹窗，展示完整中英双语协议正文（随应用语言自动切换），无需跳转外部浏览器。
- **协议弹窗支持邮箱一键复制**：弹窗底部显示商业授权联系邮箱 `new_mr_awei@163.com`，点击即可复制到剪贴板，复制成功后显示「已复制」反馈。
- **关于弹窗许可证入口改为内部弹窗**：原页脚许可证按钮点击后跳转外部 opensource.org 链接，现改为打开应用内协议弹窗；`about.ts` 中许可证名称同步更新为「影匣 双授权协议 v1.0 / Ying Xia Dual License v1.0」，licenseUrl 指向仓库 LICENSE 文件。
- **i18n 新增 `about.viewLicense` 翻译键**：中文「查看开源协议」、英文「View License」。
- **PRD 文档更新至 v2.7.0**：文档版本、产品版本、编写日期同步更新，演进历程新增 v2.7.0 阶段说明。
- **README 全面重写（汉英双语）**：`README.md` 和 `README.zh-CN.md` 完整重写，更新协议声明、功能亮点、技术栈等内容。
- **package.json 许可证字段更新**：`license` 从 `"MIT"` 改为 `"影匣 双授权协议 v1.0"`。
## v2.6.7（2026-09-02）

**应用内卸载流程整合 + 卸载器健壮性修复**

- **应用内卸载确认与「保留/删除用户数据」合并为单条流程**：设置页点击「卸载影匣」后，先弹出应用内卸载确认弹窗（`UninstallConfirmModal`），一步决定「保留数据」或「删除数据」；决定通过 `/YXKEEPDATA` / `/YXDELDATA` 参数传给 NSIS 卸载器，直接跳过标准欢迎页与独立的「保留用户数据」复选框页。原流程是「卸载确认」与「是否保留数据」两个独立流程、多个弹窗。
- **修复 NSIS 构建失败（warning 6155 被当作错误处理）**：`build/installer.nsh` 中 `MUI_UNPAGE_WELCOME` 已自动消费并 `!undef` 掉 `MUI_PAGE_CUSTOMFUNCTION_PRE`，多余的手动 `!undef` 引用了未定义宏，触发 `!undef: "MUI_PAGE_CUSTOMFUNCTION_PRE" not defined!`。已移除该冗余行，打包恢复通过。
- **修复卸载删除阶段报错「无法完成用户数据清理，用户数据已保留」**：保护脚本 `build/yingxia-uninstall-guard.ps1` 以 UTF-8 无 BOM 保存，在中文 Windows（默认 GBK 代码页）下被 PowerShell 当作 GB2312 解析，中文字节被错读为额外的换行/符号，脚本直接解析失败退出 1，NSIS 兜底保留数据。现已改为 UTF-8 带 BOM 保存。
- **保护脚本正确接收 NSIS 传入参数**：脚本此前未声明 `param()` 块，NSIS 调用时带的 `-DataDirOverride` 参数无法绑定，直接报错退出。新增 `param([string]$DataDirOverride)` 并优先使用该值。
- **删除前强制结束残留进程释放文件锁**：脚本在删除 `%APPDATA%\local-video-manager` 前，先 `Stop-Process` 结束仍在运行的 `local-video-manager` / `影匣` 进程，释放 Electron 缓存/Storage 文件锁，避免 `Remove-Item` 因锁失败。
- **删除重试更稳健**：重试次数 3 → 5 次，单次等待 800ms → 1.2s；`DELETE_FAILED` 提示文案补充「可能应用仍在运行或数据目录被占用」原因。

## v2.6.6（2026-09-02）

**标签分层修复 + 截图失败详情 + Excel 片单向导对齐 + 元数据清洗**

- **修复「数据源标签」显示不一致**：v2.6.5 把 `backupTags` 合并逻辑写反了，导致数据源 genres 在多数视频上看不到；改回无条件合并全部 genres，不管是否与 Excel 片单标签重叠。
- **修复 Excel 分类列混入标签分组**：excel.ts 未跳过「分类」列，AI 生成的 `【多人】2 / 剧情` 被当成标签拆入 `tagCategories['分类']`；现在分类列值走独立字段 `Video.introCategory`，详情页 MetaRow 单独一行展示。
- **修复数据源 genres 解析污染**：JavDB 旧正则 `/href="\/actors\/xxx"/` 匹配到演员分组（`【多人】5`）而非真正的类别标签；修正为 `/tags/xxx` 结构，并新增 `cleanGenreName()` 通用清洗器（去数字后缀、括号、纯分隔符），覆盖 JavDB / JavBus / JavLibrary / Javinfo / Javapi 五个数据源。
- **截图失败详情展示**：补齐信息后弹窗 + 详情页截图区**双处**展示失败张数、去重原因列表及解决建议；前端翻译失败原因代码（`http-403`、`timeout`、`network`…），toast 和 UI 共享同一套映射。
- **统一 hover 大图延迟 1s**：VideoDetail 样本图 / EntryCard 预览卡，所有 hover 大图展示延迟从 350ms 升至 1s。
- **对齐自动截帧与手动截帧**：无预览图的详情页自动调用 `videoGeneratePreviews` 完整多帧截帧（与手动「重新截帧」一致），不再走旧的单帧兜底路径，避免并发 ffmpeg 进程。
- **Excel 片单向导表头对齐实际数据结构**：向导提示词里的表头从旧版 `简介/评分/标签/备注/封面路径` 更正为 `分类/推荐评分/简介/主题/角色/服装/体型/行为/玩法/场景/剧情/其他`，并新增「分类体系」段落让 AI 生成正确的分类值。
- **store schema 迁移升到 `2026090204`**：启动时自动剥离 `tagCategories['分类']` 至 `Video.introCategory`，清洗文档级和数据源级脏标签，迁移日志统计 touched / peeled / cleaned 三类数量。

## v2.6.5（2026-09-01）

**番号识别与元数据补齐增强 + 文件名同步改名 + 写盘误判修复**

- **补齐失败 → 手工输入番号**：详情页「补齐信息」失败（典型文案「无法从文件名/标题识别番号」）时自动弹出 `ManualCodeModal` 手工番号窗口，失败后可换号直接重试；工具条另设常驻「手工番号」按钮，随时可纠正张冠李戴的元数据。新增 `normalizeManualCode()` 归一化（去扩展名/中文/【】、`.` `_` 转连字符、`SSIS376` 补连字符），5 个数据源与 `fetchDetailSmart`/`fetchMovieDetail` 均支持 `manual` 参数透传，`manual=false` 时行为完全不变。
- **自动识别支持数字开头番号**：`261ARA-394` / `476MLA-203` / `200GANA-1459` 这类数字开头的番号，旧逻辑（连字符前要求 ≥2 字母）一律提取失败。新增第 7 步兜底正则 `CODE_RE_DIGIT_PREFIX`（后缀限 2-5 位防手机时间戳误报、前缀须含字母、`VOL-01`/`No.007` 黑名单），仅在前 6 步全部失败时生效，实测 4665 部零回归、新增识别 31 部。
- **过滤伪番号（isPlausibleCode 守卫）**：`IMG-8873`（相机文件）、`VID-…`（录像时间戳）、`…-2160p`（分辨率）、`guochan2048.com@…`（广告域名）、`[HEVC-1080p]`（编码标记）不再被当成番号白白发请求或挂错元数据；守卫命中时跳过该候选继续找下一个，并顺带救回 `hhd800.com@FC2-PPV-1851398` → FC2-PPV-1851398、`HD_sdnm-256` → SDNM-256，待抓量 551 → 183（省 67% 无效请求）。
- **FC2 番号完整提取**：`FC2-PPV-1510788` / `fc2ppv_1523314` / `FC2PPV-1123249-1` 旧逻辑只提取出 `PPV-1510788`，数据源搜不到。最高优先级新增 FC2 步骤返回 `FC2-PPV-<编号>`，允许分集尾号（`_1`/`-2`），86 部修正 84 部。
- **编辑标题可同步修改文件名**：`EditMetaModal` 标题改动时出现「保存时同步修改文件名」开关（默认开），新 IPC `videoRenameFile` + `safeFileBaseName()`（去非法字符/尾部点、CON 等保留名加前缀、截断 120 字符）；改名失败不丢元数据并保留弹窗说明原因；改名刻意保持视频 id 不变，封面/预览帧不失联。
- **修复 data.json「被外部修改」日志刷屏（自写误判）**：批量补齐频繁写盘时，Windows 高并发 rename 下 `fs.stat` 的 mtime 与记录基准短暂不一致，导致影匣自己写的盘被误判为外部修改。检测逻辑在写盘进行中（`writeInFlight`）跳过，重载后同步刷新 mtime 基准。

## v2.6.4（2026-09-01）

**修复安装器启动崩溃 + 改用 MUI 原生语言选择器**

- **修复双击安装包无反应 / 程序兼容性助手弹 TLS 警告**：根因是 `customInit` 宏中混用 `nsDialogs` 自定义语言对话框与 `FindWindow` 运行检测，在 .onInit 阶段触发 NSIS 运行时崩溃（exit code -1073741819 / 0xC0000005）。已移除自定义 nsDialogs 语言选择，改由 electron-builder 原生 `displayLanguageSelector` + `installerLanguages: ['zh_CN', 'en_US']` 提供稳定语言选择框。
- **安装器语言选择框仍仅保留简体中文和 English**：通过 `installerLanguages` 限制 MUI 只加载 `SimpChinese` 和 `English` 两个语言文件。
- **卸载器复选框保留**：`customUnInstall` 仍使用 nsDialogs 复选框询问是否删除 `%APPDATA%\local-video-manager`，默认不勾选；卸载器文案跟随安装时选定的 `$LANGUAGE`。
- **安装器运行中检测保留**：继续检测「影匣」窗口并提示用户先关闭应用，但不再与 nsDialogs 混用，避免崩溃。

## v2.6.3（2026-09-01）

**安装器语言选择 + 卸载器复选框删除用户数据 + 用户须知去中国法律法规**

- **安装器第一步语言选择**：运行安装包首先弹出 nsDialogs 语言选择框，仅保留「简体中文」和「English」两个单选按钮，默认选中简体中文。选择结果写入注册表 `HKCU\Software\YingXia\InstallerLanguage`，应用首次启动即使用安装时选定的语言。
- **英文用户须知去中国法律法规**：`UserNoticeModal` 已按当前 locale 分支渲染，英文分支展示通用免责声明，中文分支保留原有法律条文。
- **卸载器跟随安装语言**：卸载器通过 `$LANGUAGE` 读取安装时选定的语言，提示文案按简体中文/英文展示。
- **卸载器新增复选框，默认不删除用户数据**：`customUnInstall` 使用 nsDialogs 复选框询问是否删除 `%APPDATA%\local-video-manager`，默认不勾选；用户手动勾选后才执行 `RMDir /r` 删除整个目录。

## v2.6.2（2026-09-01）

**数据源介绍国际化修复 + 卸载器可选删除用户数据 + 打包路径回归项目内 release**

- **设置页数据源介绍跟随语言切换**：`SOURCE_META` 从模块顶层静态对象（`t()` 在加载时固化）改为 `getSourceMeta()` 函数，每次 render 重新取当前 locale 翻译。修复英文版仍显示 "Javapi 首选·无风险·免费" 等中文三维度标签；修复 `javdb.tier` 错误写成 `javinfo.tier` 的 typo。
- **抓取逻辑文案走 i18n**：auto 模式下数据源排序底部的详细说明从硬编码中文改为 `t('settings.network.fetchLogic')`，英文字段同步补充完整翻译。
- **卸载器新增复选框，可选删除 AppData 用户数据目录**：nsis hook `customUnInstall` 在卸载阶段弹窗询问，默认不勾选（保留数据），用户手动勾选才执行 `RMDir /r %APPDATA%\local-video-manager`。卸载器语言跟随安装时选择的语言。
- **修复 customInit 在卸载时也弹语言选择框**：加 `!ifdef IsUninst` 判断，卸载流程跳过安装时的语言选择和运行中检测。
- **`scripts/pack.mjs` 默认输出回归 `<project>/release`**：弃用历史上规避另一 IDE 索引服务的 `~/yingxia-release/<时间戳>` 硬编码，改用 `electron-builder.yml` 的 `directories.output: release`；保留 `YINGXIA_PACK_OUT` 环境变量覆盖开关。

## v2.6.1（2026-09-01）

**安装器语言选择框精简 + 打包路径回归项目内 release 目录**

- **安装器语言选择框仅保留中/英**：弃用 `MUI_LANGDLL_DISPLAY`（会拉出 30+ 种无关语言），改用自定义 nsDialogs 对话框，仅展示「简体中文」和「English」两个单选按钮。
- **`scripts/pack.mjs` 默认输出回归 `<project>/release`**：之前硬编码 `~/yingxia-release/<时间戳>`（历史上为规避另一 IDE 索引服务锁 app.asar），现在按 `electron-builder.yml` 的 `directories.output: release` 打包到项目根目录的 `release/`；如需临时改输出目录，可设 `YINGXIA_PACK_OUT` 环境变量覆盖。

## v2.6.0（2026-09-01）

**安装器多语言 + 升级链路可靠性 + 文档版本同步**

- **NSIS 安装器第一步语言选择**：运行安装包首先弹出语言对话框（简体中文 / English），选择结果写入注册表 `HKCU\Software\YingXia\InstallerLanguage`，应用首次打开即使用安装时选定的界面语言。
- **卸载器自动沿用安装语言**：NSIS MUI 卸载器按安装时选择的语言展示，安装器检测运行中旧版本的提示也按语言本地化。
- **升级链路修复集**：修复升级安装时旧进程持锁导致新版 `app.quit()` 退出、`taskkill` 自杀、renderer assets 未清理、重新截图不刷新封面等 P0 / P1 问题。
- **PRD / CHANGELOG / README 同步到 v2.6.0**：全量文档版本号与产品版本对齐。

## v2.5.1（2026-09-01）

**安装器语言选择 + 英文用户须知去中国法律化 + 卸载器语言跟随**

- **安装器第一步选择语言**：NSIS 安装器初始化时弹出语言选择对话框（中文 / English），并将选择结果写入注册表 `HKCU\Software\YingXia\InstallerLanguage`。
- **首次启动应用安装器语言**：主进程启动时读取注册表中的安装器语言，优先于默认中文写入 `settings.language`，实现首次打开即为安装时选定的语言。
- **设置页可切换语言**：安装器语言仅首次生效，用户仍可在应用设置页自由切换中文 / 英文。
- **英文用户须知移除中国法律法规**：`UserNoticeModal` 根据当前 locale 分支渲染，中文用户保留中国法律节选；英文用户展示通用免责声明，不再引用《刑法》《治安管理处罚法》《网络安全法》《未成年人保护法》《民法典》等具体中国法律条文。
- **卸载器自动沿用安装语言**：NSIS MUI 卸载器默认沿用安装时选择的语言，安装器提示文案也按所选语言展示。

## v2.5.0（2026-09-01）

**文档与项目展示全面升级（README / PRD 汉英双语重写）**

- **README 汉英双语重写**：重新梳理产品定位、核心功能、隐私声明、开发指南，默认展示英文版，顶部可自由切换中英文。
- **PRD 汉英双语更新**：文档版本与产品版本同步到 v2.5.0，补充 v2.3.x – v2.5.0 里程碑与功能模块（双语化、系列分集、批量抓取进度面板、代理覆盖 Chromium、安装器体验等）。

## v2.4.9（2026-09-01）

**修复安装最新版后双击图标无反应（P0 严重 bug）**

- 根本原因：v2.4.4 加入的升级检测强杀旧进程逻辑中，`taskkill /F /IM "影匣.exe" /T` 会按映像名杀死**所有**同名进程，包括正在启动的新版自己，导致新版启动后立即被自杀，桌面图标双击无反应。
- 修复：改用 `taskkill /F /FI "PID ne <当前PID>" /IM "影匣.exe"`，排除当前进程后再结束其他旧实例。
- 为什么运行 `npm run dev` 后能打开：dev 进程名为 `electron.exe` 而非 `影匣.exe`，taskkill 不会自杀；同时 dev 运行会把 `.last-version` 写成当前版本，之后双击生产版时不再进入升级分支，自然不再触发自杀。

## v2.4.8（2026-09-01）

**安装器友好提示 + 修复 NSIS 中文编码**

- 安装器检测到「影匣」正在运行时，弹出中文提示框要求用户先彻底关闭应用（包括托盘图标），用户点确定后安装器退出，不再强制结束进程。
- 修复 `build/installer.nsh` 中文 MessageBox 导致 NSIS 解析失败的编码问题：文件以 UTF-8 BOM 保存，确保 makensis 正确读取中文字符串。

## v2.4.7（2026-09-01）

**安装器不再强杀旧进程，改为友好提示**

- 之前 `build/installer.nsh` 在覆盖安装前用 `taskkill` + `FindWindow` 强制结束旧进程；现在改为检测窗口标题「影匣」。
- 检测到正在运行时弹出 MessageBox 提示用户：「请先彻底关闭应用（包括右下角的托盘图标），然后重新运行安装器。点击确定后安装器将退出。」
- 用户点确定后调用 `Abort`，安装器退出，避免意外杀进程导致状态丢失。

## v2.4.6（2026-09-01）

**修复重新截图后详情页预览帧未刷新**

- 根本原因：预览帧文件路径固定为 `<id>_preview_<n>.jpg`，重新截图只是覆盖同名文件；React `key={url}` 没变化，且 Chromium 缓存了本地 `lm://` 图片，导致详情页仍然展示旧画面。
- 修复：新增 `previewVersion` 状态，重新截图成功后 `+1`；所有预览帧 URL 通过 `posterUrl(url, previewVersion)` 带上 `?v=N` 缓存失效参数，`key` 也使用带版本号的 URL，强制 React 重新创建 `<img>` 并让 Chromium 重新请求。
- 浮层轮播、设为封面等交互也同步使用带版本号的预览 URL，避免浮层里看到旧图。

## v2.4.5（2026-09-01）

**重新截图随机化 + 质量过滤 + 列表展示模式设置**

- **详情页「重新截图」改为随机多点采样**：不再用固定 thumbnail 算法和等分预览帧，改为在视频 5% ~ 95% 范围内随机抽取多个候选时间点。
- **自动过滤低质量帧**：通过 ffmpeg 把候选帧缩放到 8x8 灰度，计算亮度均值与方差，自动排除过黑（mean<25）、过白（mean>230）、模糊/画面单调（variance<400）的帧，降低黑屏、白屏、糊图概率。
- **每次重新截图结果不同**：随机时间点 + 质量排序，用户多次点击「重新截图」会拿到不同画面，避免挤在同一位置。
- **列表展示模式可持久化设置**：设置页「外观」新增「列表展示模式」，可选「全库平铺」（默认）或「按分类分组」；切换顶部「分组」按钮也会自动同步保存。

## v2.4.4（2026-09-01）

**彻底杜绝升级后旧版本 UI 残留（双重保险）**

- **主进程升级时强杀旧进程**：启动时对比 `.last-version` 与 `app.getVersion()`，若版本不一致 → 先 `taskkill /F /IM "影匣.exe" /T` 强制结束旧进程，再正常获取 `requestSingleInstanceLock`。旧进程不会再残留，数据目录无需清理。
- **NSIS 安装前强杀旧进程**：新增 `build/installer.nsh` 并在 `electron-builder.yml` 里 `include`，安装器在覆盖文件前先用 `taskkill` + `FindWindow` 关闭已运行的影匣，双重保险。

## v2.4.3（2026-09-01）

**升级安装后看不到新版本（P0 根因修复） + 杜绝 out/ 历史 chunk 堆积**

- **修复升级后旧版本 UI/功能残留**：用户不关闭影匣直接覆盖安装时，旧进程仍持有 `requestSingleInstanceLock`，新 exe 启动因拿不到锁直接 `app.quit()`，用户始终看到旧进程的界面和功能。修复：AppData 写入 `.last-version` 标记记录上次启动版本；启动时对比当前版本——不一致则视为升级安装，**绕过单实例锁让新版正常启动**。旧进程继续跑没关系，窗口被新版 BrowserWindow 盖住，用户重启后自动清除。
- **杜绝 out/ 历史 chunk 堆积**：之前 `electron.vite.config.ts` 三处 `emptyOutDir: false`，渲染进程每次 build 旧 chunk（content-hash 命名）不会被清理，out/renderer/assets/ 里塞了 30+ 个历史文件，全部被 electron-builder 打进 app.asar。现在全改 `emptyOutDir: true`，打包产物干净无冗余。
- **顺带：AppData 标记文件**：新增 `%APPDATA%\local-video-manager\.last-version`（一行版本号文本），仅用于升级检测，不涉及任何用户数据迁移。

## v2.4.2（2026-09-01）

**扫描库进度条只触发一次 + GitHub 默认英文版 README**

- **修复扫描进度条触发两次**：点击"扫描库"按钮时，`handleScan` 原先串行调用 `videoScan` 和 `libraryReconcile` 两个独立 IPC，各推一轮 `emitProgress`，导致进度条弹两轮。主进程新增 `IPC.libraryScanAndReconcile` 合并 scan + reconcile 为单次调用，reconcile 阶段的常规进度被屏蔽（`introError` / `fetchEvent` 仍正常推送），UI 上只剩一条连续进度条。
- **README 默认展示英文版**：`README.md` 改为英文版（GitHub 仓库首页只认这个），原中文版改名为 `README.zh-CN.md`；两份文件顶部加 `English · 中文` 切换条，互相跳转。

## v2.4.1（2026-08-31）

**批量抓取进度面板 + 代理测试体验 + 拖拽与侧边栏优化**

- **可拖拽批量抓取进度面板**：右下角扫描/补齐进度由 toast 升级为固定浮动面板，支持头部拖拽、窗口缩放自动归位；新增「暂停 / 继续 / 停止」按钮，可实时控制批量补齐流程。
- **批量补齐支持暂停/停止**：主进程 `SmartFetchState` 新增 `paused` / `stop` 状态，worker 循环响应暂停与停止指令；新增 `libraryFetchPause / Resume / Stop` IPC。
- **代理测试连接优化**：测试目标从 `javdb.com` / Google 改为 `httpbin.org/get`，避免被目标站风控或拒绝；Settings 页点击测试后结果会输出到 renderer 控制台，便于排查。
- **修复首次拖拽大偏差**：两个浮动面板首次拖拽时改用 `getBoundingClientRect()` 获取真实渲染位置作为拖拽原点，避免 Windows 缩放 / CSS 定位导致的位置跳变。
- **左侧媒体库列表支持滚动**：媒体库列表超出视窗时可使用滚轮滑动，避免库过多时无法查看。
- **修复 ProgressPanel React 内部警告**：调整 hooks 顺序，条件 return 放到所有 hooks 之后。

## v2.4.0（2026-08-31）

**双语化 + 系列分集 + 批量抓取体验升级 + JavBus 抓图稳定性**

- **应用内全双语化**：设置新增「语言」选项（zh-CN / en-US），CHANGELOG、评分/简介规范、ABOUT 常量、OnboardSheetModal 提示词均按语言切换；英文界面下所有引导文案和提示词自动展示英文。
- **项目文档双语化**：README / CHANGELOG / PRD / HANDOFF / PUBLISHING / AUTO_FRAME_AND_CATEGORY 均生成英文副本，打包后随应用分发。
- **片单 Excel 引导弹窗恢复并完善**：从 v2.1.x 历史版本恢复 `OnboardMdModal`，改造成 Excel 导向的 `OnboardSheetModal`，保留「完整提示词 + 复制 + 打开规范文件」核心交互；修复提示词硬编码中文问题，英文界面下全英文展示。
- **批量抓取失败明细弹窗升级**：失败条目可点击进入详情页单独补齐；跳转详情页时弹窗保持（返回后自动恢复），方便逐个处理；左下角抓取过程浮层支持自由拖动。
- **系列分集（爱奇艺模式）**：同一番号多文件（如 `SONE-560_1.mp4`、`SONE-560_2.mp4`）在列表页只展示一张卡片，进入详情页展示分集按钮列表，支持来回切换，当前分集醒目标识。
- **番号提取修复**：文件名尾部 `_1` / `_2` 等分集后缀现在能正确识别并剥离 base code，搜索时使用 `SONE-560` 而非 `SONE-560_1`，提升片源命中率。
- **JavBus 抓图稳定性**：修复 `cacheRemoteImage` 因非法/相对图片 URL 抛 `Invalid URL` 导致整批失败的问题，空或非法 URL 直接跳过，元数据正常返回。
- **报错自然语言化**：详情页补齐失败、重新截帧失败等 toast 不再显示 `t('...')` 模板字符串，而是展示中文/英文自然语言错误说明。

## v2.3.13（2026-08-31）

**代理覆盖全云端 API + 隐私锁删除密码校验 + 数据源介绍卡 + 设置页跳转修复 + 批量抓取/启动重扫文案升级**

- **代理覆盖 Chromium 网络栈（P0）**：`cacheRemoteImage`（JavDB 批量抓取封面）和渲染进程图片请求走的是 Chromium `net.fetch` / `<img>`，之前只给 Node.js `fetch` 配了 undici Dispatcher，Chromium 那条路完全裸奔——代理开了但 JavDB/JavBus/Javinfo/Javapi 四个云端 API 的远程抓图还是直连被墙。新增 `applyProxyToSession()` 调 `session.defaultSession.setProxy()`，在 `applyRuntimeSettings` 里与 undici dispatcher 同步调用；HTTP/HTTPS/SOCKS5 全部映射过去，auth 信息一并带上。
- **Javapi 代理也覆盖**：之前 Javapi 单独走了 `getDispatcher(settings)`，修掉后统一走 `applyProxyToSession`。
- **隐私锁删除加密码校验**：新增 IPC `lockDelete`，清除锁前必须校验当前密码（SHA-256(salt + pwd)），防止误点「清除锁」直接解锁，也防止别人操作 settings 绕过。
- **设置页不再自动跳回第一页**：`SettingsModal` 的 draft 初始化链路 + useEffect 依赖数组修复，打开弹窗保持上次的 tab/卡片位置。
- **批量抓取设置升级为对所有云端 API 生效**：原来的 UI 文案只写 JavDB，实际已经覆盖五个源，改了文案避免用户误解。
- **代理设置升级为对所有云端 API 生效**：同上。
- **启动时自动重扫改为 Excel 驱动**：原来 UI 文案模糊，实际 autoRescan 和 scanOnStartup 已经走 `libraryReconcile`（Excel 驱动的对账流程），改了文案让用户知道重扫用的是「片单 Excel」而不是全盘扫。
- **五个数据源各加一段介绍**：设置页「云端 API」tab 的 SegmentedControl 切换时条件渲染对应数据源的简介。
- **卸载逻辑加固**：`appUninstall` 的 spawn 加了 `detached` + `env: {...process.env}` + shell 显式 false，卸载程序等待应用退出后才继续；主进程 spawn 后 500ms 主动 `app.quit()`，避免 NSIS 静默卸载因为主进程还活着而卡住。

## v2.3.12（2026-08-30）

**合并作者 v2.2.14 修复集 + 朋友 v2.3.3~v2.3.11 功能集，保留双方最优解**

### 合入的作者 v2.2.14 修复
- **设置项不持久化**：重写防抖写盘逻辑（resolve 收集 + 定时器重排 + 写盘串行化），修掉 300ms 窗口内连续调用导致 Promise 永不 resolve 的死锁。
- **DMM 图床 Referer 被拒**：Electron Chromium 对跨站 Referer 校验严格，`*.dmm.co.jp` 图床带 JavBus 域名 Referer 会被取消（`ERR_BLOCKED_BY_CLIENT`），改为不传 Referer。
- **补齐信息覆盖预览帧**：仅当截图实际下载到时才覆盖 `previewPaths`，否则保留原有 ffmpeg 预览帧。
- **抓取日志重复打印**：`preload/index.ts` 的 `onScanProgress` 返回 cleanup 函数，useEffect 返回它（React StrictMode 让 useEffect 执行两次导致双监听器）。
- **tagCategories 标签值重复**：分类内部标签列表加 `Array.from(new Set(...))` 去重，消除 `["/"]` 重复导致的 React key 冲突。
- **批量补齐重复触发**：详情页 useEffect 自动补抓 + 用户手动点按钮互斥，加 `fetchingRef` 锁。
- **批量抓取失败循环重试弹窗**：居中弹窗显示失败明细，底部「全部重试」按钮逐个重试；仍有失败则再次弹窗，循环直到全部成功或用户关闭。

### 合入的朋友 v2.3.3~v2.3.11 功能
- **v2.3.3/2.3.4**：相关推荐封面统一（`resolveEntryPoster`，posterPath 优先）。
- **v2.3.5/2.3.6**：三种视图时长显示 + techInfo fallback。
- **v2.3.7**：时长改右下角角标 + 新增 `libraryBatchProbe` 批量补时长。
- **v2.3.8**：扫描库真正建记录（`handleScan` → `scanLibrary` → reconcile）。
- **v2.3.9**：store 外部修改检测（data.json 被外部改写时自动重载内存）。
- **v2.3.10**：防抖死锁修复（防饥饿 2s 强制落盘）+ `applyVideoChanges` 索引 O(n²)→O(n)。
- **v2.3.11**：损坏视频不再卡死批量补齐——封面截帧超时检测 + stderr 消费 + 7 天冷却期 + 补齐结果提示剩余无封面数。

## v2.3.11（2026-08-30）

**修复损坏视频卡死批量补齐 + 无片单提示可关闭**

- **损坏文件卡死补齐（P0）**：`generatePreviewSet` 的封面截帧 spawn **既没有超时、也没有消费 stderr**——`thumbnail=n=<最多200>` 要解码整个文件，损坏的 wmv 会让 ffmpeg 无限转下去；同时 ffmpeg 刷出的错误输出填满管道缓冲区后子进程会阻塞在写入上，连退出都做不到。结果是整个 `generatePreviewSet` 永不返回，批量补齐的 worker 永久卡住（表现为进度条停在某一部不动，反复重开都卡在同一条）。
  改动：统一 `spawnWithTimeout`（消费 stdout/stderr + 超时 SIGKILL，封面 60s / 单帧 30s）；封面**超时**视为文件异常，直接跳过后续十余个预览帧 ffmpeg。
- **损坏文件不再每轮都重试**：新增 `video.frameFailedAt`，截帧无产出时打时间戳，7 天冷却期内批量任务自动跳过（手动「重新截帧」不受限）。此前同一个坏文件每跑一轮都要白白吃几分钟超时。
- **兜底截帧上限可见**：原来 `slice(0, 200)` 静默截断，用户不知道还剩多少部。现在日志打印「待处理 N 部，本轮截 M 部（剩余 X 部需再跑一轮）」。
- **设置-通用新增「不提示『无片单 Excel』」**：无片单用户每次对账都会被这条不会自动消失的 toast 打断。勾选后仅屏蔽「未配置片单」这一类，片单解析失败等真实错误仍照常提示。

## v2.3.10（2026-08-30）

**修复「一直正在对账」卡死（写盘防抖死锁）+ 大库落盘 O(n²)**

- **写盘防抖死锁（P0，卡死根因）**：原 `scheduleSave` 把 `resolve()` 只挂在 debounce 计时器回调里，且「`pendingWrite` 非空时不重建计时器」——只要 300ms 窗口内有第二次写入调用（另一个库的对账、设置保存等），就会 `clearTimeout` 掉唯一的计时器，`await saveDB()` 的 Promise 永不 resolve，对账收尾的 `applyVideoChanges` 永久挂起 → 对账 IPC 不返回 → UI 一直显示"正在对账"、reconcile-cache 也写不出来。表现为**偶发**（取决于窗口内有没有并发写入）。
  重写为 `dirty` 标志 + 写盘串行化 + waiters 唤醒：计时器只负责触发，Promise 由落盘完成统一 resolve，写盘期间的新改动自动续写一轮不丢数据；并加 2s 防饥饿上限（连续改动也能推进）。
- **大库落盘 O(n²) → O(n)**：`applyVideoChanges` 原来对每条变更都 `findIndex` 全表扫描（4494 条变更 × 6253 条记录 ≈ 2800 万次比较），改为 Map 建 id→下标索引。
- **可诊断性**：对账完成/缓存写入结果打点落 main.log（此前缓存写失败被静默吞掉，卡死时日志一片空白无从定位）；落盘超过 1s 记录耗时。
- **批量补齐分段落盘**：`libraryFetchJavdbAll` 原来「全部抓完才一次落盘」，长任务（4494 部）中途关闭/崩溃会丢掉已抓到的全部元数据（51% 关掉 = 2300 部白抓）。现在每 100 条落盘一次（后台异步、不阻塞抓取），中断最多丢一批；收尾时等待在途落盘后再写剩余部分。

## v2.3.9（2026-08-30）

**修复列表时长/元数据陈旧（要点进详情再返回才刷新）**

- `store.ts` 的内存 DB 加载后永不重载磁盘，外部脚本/另一实例改过 data.json 后内存与磁盘分叉，对账用陈旧数据构建 entries 并写进 reconcile-cache，列表一直吃旧快照。现在每次取 DB 前比对 mtime（1s 节流），发现外部修改即重载。

## v2.3.8（2026-08-30）

**扫描库真正建记录 + 补时长覆盖全部**

- **「扫描库」改为真正扫描**：原来只跑 reconcile（对账），无片单时临时生成 entry 不落盘记录，导致大库大量视频无 data.json 记录（补不到时长、点不开详情）。现在扫描库先调 `videoScan`（scanLibrary 批量写盘，fix7 秒级补全磁盘视频记录）再 reconcile 刷新。
- **补时长覆盖全部**：扫描补全记录后，「补齐视频时长」可对全库所有视频写 techInfo（原来只处理有记录的）。

## v2.3.7（2026-08-30）

**时长改角标 + 批量补时长功能**

- **时长改右下角角标**：卡片右下角时长从底部信息行改为悬浮角标（参考「截帧」角标风格，`bottom-9 right-1.5`，位于底部信息条上方），底部只保留 code + 评分。
- **新增「补齐视频时长」**：工具栏「补齐信息」下拉新增「补齐视频时长」——对当前库所有缺时长视频批量 ffprobe 读取时长写入 `techInfo`（复用 `probeVideo`，批量落盘一次 `applyVideoChanges`），完成后 toast 显示 成功/失败/跳过 数。

## v2.3.6（2026-08-30）

**时长显示 fallback 到 techInfo**

- EntryCard / ListView / 相关推荐 三处时长读取改为 `video.durationSec ?? video.techInfo.durationSec` fallback——v2.3.5 改动后仍有视频不显示时长（顶层 durationSec 缺失），现在如果 `techInfo` 里有 ffprobe 时长也能显示。
- 注：用户当前 99% 视频仍无任何时长数据（顶层和 techInfo 都缺），UI fallback 只能覆盖已有数据；要在 G 库完整显示需批量跑 videoProbe 写 techInfo。

## v2.3.5（2026-08-30）

**列表/相关推荐时长显示**

- **相关推荐卡片底部新增时长**：与列表 EntryCard 风格一致，code 左侧、时长右侧，时长缺失不显示。
- **EntryCard 网格（竖屏/横屏）新增时长**：卡片底部信息行（code + 评分）旁显示时长（缺失不显示），与列表文件名模式保持一致。

## v2.3.4（2026-08-30）

**相关推荐封面全无修复**

- **resolveEntryPoster 封面优先级修正**：v2.3.3 里 `javdbDetail.cover` 优先于 `posterPath`，但 cover 常指向失效文件（`javapi-cover-*.jpg` 下载失败/被清理），导致相关推荐/封面返回 404 路径全部占位。改为 **posterPath（100% 有效）始终优先，cover 仅在 posterPath 缺失时补充**——相关推荐封面恢复（实测 179/179 全部有效）。

## v2.3.3（2026-08-30）

**相关推荐封面不一致修复**

- **相关推荐用完整封面优先级**：相关推荐（同片商/系列/女演员）原来只看 `video.posterPath`，导致"列表有真实海报、相关推荐显示占位图"的不一致（列表 EntryCard 会优先用 `javdbDetail.cover` 本地真实海报，相关推荐没有）。新增共享 `resolveEntryPoster`（手动封面 > javdbDetail.cover > 真实 posterPath > ffmpeg 截帧），相关推荐改用与列表一致的优先级取封面，占位图问题消除。

## v2.3.2（2026-08-30）

**侧栏新增「类别」筛选；分类恢复原逻辑**

- **新增「类别」筛选**：侧栏新增「类别」tab（独立于「分类」），列出所有 `javdbDetail.genres` 单标签（巨乳/中出/潮吹…）+ 计数，点击按类别筛选（多选 OR）。与分类/标签/影人/规格可叠加。
- **分类恢复原逻辑**：无片单自动归类的分类名回到原 v2.2.0 逻辑（每视频一条 entry、genres 拼接长串），不再按方案 A 把单个视频拆成多条 entry（避免计数/推荐重复）。类别筛选取代了方案 A 的"单标签进分类"。

## v2.3.1（2026-08-30）

**浏览页默认全库视图**

- **浏览页默认全库模式**：`groupMode` 默认从 `grouped` 改为 `flat`，进浏览页默认显示混合大网格，不按分类分块（点筛选条「分组」按钮可随时切换）。
- 注：v2.3.1 早期实验的「genre 单标签进分类」已在 v2.3.2 回退（分类恢复原逻辑，改由侧栏「类别」筛选提供单标签）。

## v2.3.0（2026-08-30）

**安全加固：原子写盘 + 危险 IPC 参数白名单**

- **data.json 原子写盘**：写临时文件再 rename 覆盖，避免写盘中途崩溃/断电导致 data.json 截断损坏（4.7MB 全量序列化窗口内风险）；进程退出兜底同步落盘同样原子化。
- **openExternal 协议白名单**：只放行 http/https，杜绝渲染进程被注入后经 `shell.openExternal` 打开 `file://` 或任意本地程序。
- **危险 IPC 入参校验**：`videoDeleteFile`（删磁盘文件）校验 id 合法性；`videoSetPreviewAsCover`（写封面文件）要求 previewPath 必须位于海报缓存目录内；`openPath` / `shellRevealInFolder` 只放行绝对路径。

## v2.2.13（2026-08-30）

**Roadmap P0：文档标签分层 —— 文档标签为主，数据源 genres 折叠为备用展示**

### 1. 核心设计：标签分三类（类型 + 数据层 + UI 全链路）
- **新增字段**：`Video.tagCategories?: Record<string, string[]>`（Excel 结构化分类，如「风格/题材/演员分组」）+ `Video.backupTags?: string[]`（数据源 JavDB/JavBus genres 备用标签，不参与展示主逻辑）
- **共享 helpers**：`primaryTags / entryPrimaryTags / hasDocTags / flattenAllTags`（主进程 & 渲染通用，保证「谁做主标签」的判断全局一致）
- **选主规则**：有 `tagCategories` → 取全部分类并集；否则取平铺 `tags`；两者都视为「文档标签」；都空才算「无文档」。

### 2. 旧数据一次性迁移（`store.ts` 启动 schemaVersion）
- v2.2.13 前的旧逻辑：`backfillFromDetail` 会把 `detail.genres`（数据源）合并进 `Video.tags`，导致「文档标签 + 数据源标签混成一锅，UI 分不清谁是谁」。
- 启动 `migrateInPlace`（仅 `schemaVersion < 2026083001` 时跑一次）：
  - 有文档标签 + 有 `javdbDetail.genres` → 从 tags 里剔除「genres 中不属于文档标签」的项，移到 `backupTags`；
  - 无文档但全是 genres → 直接填 `backupTags`；
  - 不会重复跑，完成后写入 `schemaVersion=2026083001`。
- **升级提示**：已有老数据的用户，启动一次会自动分层；如发现标签异常，可在「对账」后刷新（对账会把 Excel 结构化 `tagCategories` 真正写回 Video 顶层字段）。

### 3. 主进程改造：写入不再混合
- `reconcile.ts`：`ensureVideo` 的 `meta` 参数新增 `tagCategories?`，update/upsert 均写入 `video.tagCategories`，并纳入变化深对比（避免无用写盘）。
- `ipc.ts`：`backfillFromDetail` 不再把 `detail.genres` 合并进 `Video.tags`（已删除旧 `Array.from(new Set([...(v.tags ?? []), ...(detail.genres ?? [])]))` 行），改为只写 `patch.backupTags = ...去重并集`。

### 4. 全 UI 改造：文档标签=权威主，数据源=备用折叠
- **详情页（VideoDetail）**：
  - 有 `tagCategories` → 按「分类名（分类条目数）」分组展示主标签；
  - 否则退化平铺 tags；
  - 有文档标签且有 backupTags → `数据源` 分类下**默认只显示前 3 个，点击「还有 N 个… · 展开」展开全部，点「收起」折叠回 3 个**，sky 色系 + 提示文字「来自 JavDB/JavBus 等数据源 · 仅作备用参考」；
  - 无文档标签但有 backupTags → 直接作主标签，info 色系展示（不让空白）。
- **EntryCard / HoverDetail / ListView**：卡片 chips、悬停面板、列表行标签预览全部换成「主标签优先 + 无 doc 时拿 backupTags 兜底」。
- **侧栏筛选（App.tsx）**：
  - 标签 facet 生成分 3 层：① entry.tagCategories 按分类分 ② entryPrimaryTags 字典兜底分类 ③ backupTags（有 doc → 归入新分类「备用来源」；无 doc → 字典分类）
  - 搜索：`applyTagsOnly` 改用 `flattenAllTags`（主 + 备用 全命中）；筛选匹配：`entryPrimaryTags(e) ∪ backupTags` 并集
- **StatsPanel**：TOP10 标签计数改用 entryPrimaryTags 选主规则，不再统计被迁移出的 genres。
- **EditMetaModal**：
  - 手动编辑的标签仍写 tags 平铺；新增 hint 文字「Excel 片单为权威来源，下次对账会被覆盖」
  - 新增一块 **只读** 的「数据源备用标签」sky 色系展示（带 📡 图标），用户可直观看到此片的 genres 来源，不再混淆"为什么标签不是我加的"。

### 5. 修改的文件
- 类型/共享：`src/shared/types.ts`（Video 加 2 字段 + 4 个 helper）
- 主进程：`src/main/lib/store.ts`（`SCHEMA_VERSION` + `migrateInPlace`）、`src/main/lib/reconcile.ts`（写 `tagCategories`）、`src/main/lib/ipc.ts`（backupTags 分流）
- 渲染：`App.tsx`（侧栏/搜索/筛选）、`components/VideoDetail.tsx`（详情页标签分组+折叠）、`components/EntryCard.tsx`、`components/HoverDetail.tsx`、`components/ListView.tsx`、`components/StatsPanel.tsx`、`components/EditMetaModal.tsx`


## v2.2.12（2026-08-30）

**朋友合入三件套（P0 性能三连修 + P1 对账缓存+写盘防抖 + 数据目录名修复）**

### 1. P0 性能三连修（fix4）
- **批量补齐批量写盘**：「批量补齐信息」原来每抓完一部就 `updateVideo` → 4.7MB data.json 全量写盘一次（4680 部 = 4680 次全量写，小时级）。改为 worker 内收集变更、全部结束后一次 `applyVideoChanges` 落盘；末尾无封面截帧兜底同样批量落盘。
- **首页补齐改串行**：进入首页时原来并发发起所有缺失库的 reconcile（多库同时 walk + 与主对账并发写盘竞态，可能丢更新）。改为串行补齐 + 跳过当前库（由主对账负责）。
- **列表虚拟化（content-visibility）**：浏览列表原来一次性渲染几千条 DOM 卡片，打开/滚动卡顿、内存高。给列表项加 `content-visibility: auto` + `contain-intrinsic-size`（Chromium 原生跳过视口外渲染，滚动按需渲染，零依赖），大库滚动流畅度明显提升。

### 2. P1 双修：启动/切库秒出 + 写盘防抖（fix5）
- **对账结果磁盘缓存**：每次对账结果写入 `userData/reconcile-cache/<libraryId>.json`。打开软件/切换媒体库时**先读缓存秒出界面**（不再空白"正在加载媒体库…"等 walk 扫描十几秒），后台再全量对账刷新；对账失败时保留缓存展示。新增 IPC：`libraryReconcileCache`。
- **写盘 debounce**：`data.json` 落盘改为 300ms 防抖合并（`saveDB → scheduleSave`）——连点收藏/改名等单条操作不再每次全量序列化 4.7MB；`mutate` 不阻塞立即返回；进程 `before-quit` 同步兜底落盘 + 提供 `flushSave()`，保证 debounce 窗口内的写入不丢。

### 3. 数据目录换回英文路径（fix6）
- main 入口用 `app.setPath('userData', %APPDATA%\local-video-manager)` 强制数据目录为英文路径（productName「影匣」不改，窗口标题/安装包名均不变），避免中文目录名带来的潜在兼容问题。
- **迁移提醒**：旧数据目录 `%APPDATA%\影匣` 的 `data.json / posters / logs` 需要手工拷贝到 `%APPDATA%\local-video-manager`，老用户升级后如发现库空了请手动迁移一次。

## v2.2.11（2026-08-30）

**大库性能优化三件套（根治启动风暴 / 卡顿 / 切库变慢）+ md→Excel 迁移脚本**

### 1. 大库启动风暴修复
- **无片单兜底抓取限量 + 批量落盘**：v2.2.4 引入的「无片单自动抓元数据」会对全部无元数据视频后台并发抓取（数千部 × 5 源 + 逐条全量写盘）。现在自动兜底每轮最多抓 **30 部**，其余留给手动「批量补齐」；抓取结果改为**批量落盘**（一次 saveDB），不再逐条全量写 data.json。
- **兜底抓取每进程只自动一次**：自动兜底抓取（30 部）只在进程启动后的首次 reconcile 执行一次，切库/切页面/刷新不再反复触发；之后一律走手动「批量补齐」。

### 2. 根治 ffmpeg 自动截帧引发的大量 ffmpeg.exe 进程
- **自动截帧完全移除**：`generatePreviewSet` 每部视频 = 1 个 thumbnail **全片解码** + 4 个预览帧进程（5 个 ffmpeg），20 部自动截帧并发下会出现"一大堆 ffmpeg.exe"、CPU 长时间拉满。现在 reconcile 不再自动截帧，改为日志提示"有 N 部无封面视频（已禁用自动截帧，需要时请手动「重新截帧」）"。
- 手动入口保持不变：详情页「重新截帧」（单视频）、工具栏「批量补齐」（元数据）。

### 3. 打开/切换媒体库变慢修复
- **dead previewPaths 清理限频**：v2.2.5 的全量清理每次 reconcile 都跑——遍历全部视频 + 数千次 `existsSync` 磁盘 IO（762 部 × 多个预览帧 ≈ 3000+ 次 stat），且与当前库无关（切一个库也清全库），大库下打开/切库明显变慢。现改为**每 6 小时最多清理一次**（previewPaths 只在升级/清缓存后失效，平时不会变）。

### 4. Bug Fix
- 修 `cleanupDeadPreviewPaths` 误调用 `fs.existsSync`（fs 是 promises API）→ 导入同步 `existsSync`，避免死代码（catch 吞 TypeError，导致孤儿预览路径从没清干净）。

### 5. 新增迁移工具
- `scripts/md-to-excel.mjs`：v1.9.4 md 片单 → v2.2.x Excel 片单迁移脚本，兼容旧风格标签 + 新结构化标签分类列，用法 `node scripts/md-to-excel.mjs <input.md> [output.xlsx]`。

## v2.2.10（2026-08-30）

**UI 实时显示数据源降级过程（用户："用户界面也应该能看到类似'javdb 失败了 → 降级 javbus'的提示，而不只是后台能看到"）**

### P0：实时抓取过程浮层（右下角）
- `ScanProgress` 加 `fetchEvent` 字段（code / src / status / detail）
- `fetchDetailSmart` 加第 4 参 `onEvent` 回调，每个源尝试一次推一条：
  - `trying` → 尝试前
  - `hit` → 命中（绿色 ✓）
  - `skipped` → 跳过（未配置 key / 已被禁用）
  - `no-result` → 无结果（琥珀色）
  - `network-failed` → 网络失败（红色 ✗，含错误详情）
- 三条入口全接上事件：
  - 批量补齐（`libraryFetchJavdbAll`）
  - 单点补齐（`videoFetchJavdbDetail`）
  - reconcile 无片单兜底（`fetchDetailSmart` 兜底抓取）
- renderer 右下角浮层滚动展示（保留最近 60 条），批量补齐结束后 2.5s 自动收起，可手动 ✕ 关闭

### 效果
批量补齐时右下角实时显示：
```
→ 尝试 JavDB…
✗ JavDB 网络失败（fetch failed）
→ 尝试 JavBus…
✓ JavBus 命中
```
用户直接看到"javdb 失败了 → 降级 javbus"，不再需要翻 main.log。

### 技术债
- `fetchMovieDetail` 加第 4 参 onEvent 透传
- `reconcileLibrary` onProgress 类型加 fetchEvent 字段

---

## v2.2.9（2026-08-30）

**main 进程 console.log 落盘 + fetchDetailSmart 总览 log（用户问"怎么还是走的 javbus"）**

用户反馈日志里"全是 javbus 输出，没 javdb"，担心 customSourceOrder 没生效。实测是 v2.2.8 main 进程 console.log 走 terminal 滚动看不到 + fetchDetailSmart 没打印总览。但 `[search] AVOP-127 getText FAILED`（javdb.ts 自己的 log）证明 javdb 真的先跑了、失败后降级 javbus。

### 1. P0：main 进程 console.log 落盘
- 之前只 `attachRendererLog` 接 renderer 进程的 console-message，**main 进程自己 console.log 不落盘**。
- v2.2.9 加 `attachMainLog`：劫持 console.log / console.error / console.warn，写到 `userData/logs/main.log` 同时保持原 terminal 输出。
- 之前排查"为什么走 javbus"只能看 dev 模式 terminal 滚动；现在直接打开 `C:\Users\19218\AppData\Roaming\影匣\logs\main.log` 就能看完整抓取过程。

### 2. P0：fetchDetailSmart 加总览 log
- 开头：`[smart] ${code} order=${order.join('→')}` —— 每次抓取直接打印**当前生效的顺序**（"javdb→javbus→javapi→javinfo→javlibrary"），用户能立刻确认顺序对不对
- 命中：`[smart] ${code} HIT ${src}` —— 哪个源 hit 一目了然
- 全失败：`[smart] ${code} FAILED: ${完整 5 源结果}` —— 一行看完全部 5 源结果

### 3. 用户的 customSourceOrder 现状
- data.json 里 `settings.customSourceOrder: ["javdb","javbus","javapi","javinfo","javlibrary"]`（v2.2.6 拖拽保存的）
- fetchDetailSmart v2.2.4 起就完全按 customSourceOrder 降级，**v2.2.8 实际抓取行为是按这个顺序**的
- javdb 抓不到（`[search] getText FAILED`）→ 降级 javbus 命中 → 这是**预期降级行为**而不是 bug

### 用户装上 v2.2.9 后
- dev 模式：Ctrl+C 关闭 `npm run dev` 再重启（main 进程才会加载新代码，HMR 只更新 renderer）
- 生产包：安装新 v2.2.9 后
- 点「批量补齐」后 → 打开 `%APPDATA%\影匣\logs\main.log` → 能看到完整的 `[smart] ... order=...` + `[smart] ... HIT javbus` / `FAILED ...` 记录

---

## v2.2.8（2026-08-30）

**海报抓取也跟随自定义采集顺序（用户问："真实采集顺序是否也跟着自定义采集顺序改变了？"）**

### 验证结论
- 元数据抓取（单点补齐 / 批量补齐 / reconcile 兜底）**早就是**按 `settings.customSourceOrder` 降级（v2.2.4 起，v2.2.6 统一了入口）。
- 但**海报抓取** `fetchJavdbPosterForVideo` 是漏网：它直接调 `searchJavdb`，**不读 customSourceOrder**——用户把 JavDB 排最后、或 JavDB 被 Cloudflare 风控 403 时，海报仍硬试 JavDB 而失败。

### 修复
- `javdb-smart.ts` 新加 `fetchPosterSmart(video, settings)`：按 `settings.customSourceOrder` 依次降级抓海报——
  - javdb: `searchJavdb` → `cacheRemoteImage(posterUrl)`
  - javbus: `fetchJavBusDetail` → detail.cover（内部已下载本地）
  - javlibrary: `fetchJavLibraryDetail` → detail.cover
  - javinfo: 需配 key → `fetchJavinfoDetail` → detail.cover
  - javapi: 需配 config → `fetchJavapiDetail` → detail.cover
  - 命中第一个有 cover 的源即返回本地路径
- `ipc.ts` 3 处 `fetchJavdbPosterForVideo` 调用全改成 `fetchPosterSmart`：
  - `videoFetchJavdbPoster`（手动"抓海报"）
  - 批量补齐的封面步骤
  - `videoSwitchPoster` 的"数据源图"切换兜底
- `DEFAULT_SOURCE_ORDER` 抽到模块底部 export（fetchDetailSmart 和 fetchPosterSmart 共用，消除重复定义）

### 现在全链路一致
| 场景 | 读 customSourceOrder |
|---|---|
| 单点补齐详情 | ✅ |
| 批量补齐详情 | ✅ |
| reconcile 无片单兜底 | ✅ |
| 单点抓海报 | ✅（v2.2.8 修） |
| 批量补齐封面 | ✅（v2.2.8 修） |
| 切换数据源封面 | ✅（v2.2.8 修） |

---

## v2.2.7（2026-08-30）

**文案随顺序联动（用户反馈："都已经支持自定义采集顺序了，采集逻辑和文案也要跟着变"）**

v2.2.6 暴露了 customSourceOrder 拖拽 UI，但多处文案还写死默认顺序——拖了顺序后文案不会跟变。v2.2.7 把所有相关文案改成"动态跟随 customSourceOrder"。

### 1. SettingsModal 顶部 auto 降级说明
- 原来："auto 自动降级（Javapi → Javinfo → JavDB → JavBus → JavLibrary，连续失败自动切换）"
- 现在：`formatSourceOrder(draft.customSourceOrder)` 函数渲染，**用户拖一下就跟着变**。
- 顶部文案 + 拖拽列表里 1/2/3/4/5 编号 + "恢复推荐" 按钮——三处共享同一份顺序。

### 2. Javapi/Javinfo API Key 输入框 placeholder
- 原来：Javapi placeholder "留空则跳过 Javapi，直接走 Javinfo → JavDB → JavBus"（写死）
- 原来：Javinfo placeholder "留空则跳过 Javinfo，直接走 JavDB → JavBus"（写死）
- 现在：从 draft.customSourceOrder 过滤掉当前源，剩余顺序拼文案。"留空则跳过 Javinfo，直接走 JavDB → JavBus → JavLibrary"（实际当前顺序）。

### 3. 补齐完成 toast 的「来源分布」条
- 原来："Javapi X · Javinfo Y · JavDB Z · JavBus W · 失败 N"（写死）
- 现在：按 `settings.customSourceOrder` 渲染对应源 + 数量，**顺序跟用户实际采集顺序一致**。
- 顺手在 `api-types.ts` `BatchJavdbResult.bySource` 加了 `javlibrary: number` 字段（之前漏了，自定义顺序里可能命中 javlibrary）。

### 4. 没动的文案
- 拖拽列表底部的"抓取逻辑：按顺序逐个尝试，任一源命中即停。任一源连续 3 部网络失败自动跳过本轮。JavBus 连续 3 部失败会停止整批（防空转）。所有源都失败 → 走 ffmpeg 截帧兜底。" — 顺序是动态的、"JavBus" 是事实（无论排在哪位都是连续 3 部 stop），文案本身无需变。
- "推荐顺序：Javapi（本地免费）→ Javinfo（免风控）→ JavDB → JavBus → JavLibrary" — JSX 注释不是给用户看的，保留。

---

## v2.2.6（2026-08-30）

**数据源采集：完整流程可见 + 顺序可调（用户反馈"javapi/javinfo 失败应继续试其他源"）**

### 1. P0：fetchDetailSmart auto 模式错误信息完整化
- v2.2.4 把 `fetchDetailSmart` 抽到独立模块时**漏修一处**——`errors` 数组（javapi 跳过 / javinfo 跳过的提示）没合并到 return error。同时**没在 ipc.ts 删掉旧的 `fetchMovieDetail`**（v2.2.4 漏改），导致用户点「补齐信息」走 `fetchMovieDetail`、批量补齐走 `fetchDetailSmart`，**两套逻辑不一致**。
- 表现：用户的 SONE-560_1 点「补齐信息」只显示「未配置本地 Javapi，跳过；未配置 Javinfo key，跳过」——看起来像只跑了 javapi 就停了。实际上 javdb/javbus/javlibrary 也跑了但「无结果」（不是异常），所以 `errors` 数组里没反映。
- v2.2.6 修复：
  - `fetchDetailSmart` auto 模式用 `srcResults[]` 记录每个源的状态（`hit` / `skipped` / `no-result` / `network-failed`），最后拼成 `javapi=跳过(...); javinfo=跳过(...); javdb=无结果; javbus=无结果; javlibrary=无结果` 这种完整 summary
  - `ipc.ts fetchMovieDetail` 删掉（保留 wrapper，内部调 `fetchDetailSmart`），保证两套入口行为一致
  - `ipc.ts` 清理掉 6 个不再直接用的 per-source import（fetchJavapiDetail / fetchJavinfoDetail / fetchJavdbDetail / fetchJavBusDetail / fetchJavLibraryDetail / hasJavapiConfig / hasJavinfoKey）

### 2. P0：SettingsModal 加 customSourceOrder 拖拽排序 UI
- v2.2.0 时加了 `Settings.customSourceOrder` 字段，v2.2.4 抽到 javdb-smart.ts 的 fetchDetailSmart 也读了，**但 UI 没暴露调整入口**——只能选 auto/单源。
- v2.2.6 暴露 UI：dataSource=auto 时显示 5 个源的可拖拽列表
  - 拖拽 ⠿ 调整顺序（HTML5 drag-and-drop）
  - 点 ↑↓ 按钮也行
  - 「恢复推荐」一键还原默认顺序
  - 每个源展示「信息全面度 + 风控 + 成本」三维度评估
  - 底部说明抓取逻辑：按顺序逐个尝试，任一源命中即停；任一源连续 3 部网络失败自动跳过本轮；JavBus 连续 3 部失败停止整批；所有源都失败 → 走 ffmpeg 截帧兜底
- 字段已存在 Shared types，store 持久化天然支持

### 3. 数据层未做（留给 v2.2.7）
- 「文档定义标签优先、其他数据源标签折叠成备用」还没做。当前 v.tags 是文档 tags + 数据源 genres 合并去重。
- v2.2.7 计划：Video 加 `tagCategories` + `backupTags` 字段；reconcile if (doc) 分支写 tagCategories；backfillFromDetail 把 detail.genres 写 backupTags 不合并；详情页 UI 折叠显示。

---

## v2.2.5（2026-08-30）

**控制台大量 ENOENT 报错修复（用户反馈"控制台大量报错"）**

v2.2.4 升级时 installer 清掉了 posters 目录里的旧 .jpg（`<video.id>_preview_X.jpg` ffmpeg 截帧命名），但 data.json 里的 `video.previewPaths` 还指向这些不存在的文件。hover 视频 / 打开详情页时，渲染 15 张 preview 触发 15 次 `lm://` 协议 ENOENT，main 进程 console.warn 刷屏。

实测：22 部 video / 共 330 个 dead preview 路径在控制台刷屏。

### 1. P0：`lm` 协议 ENOENT 静默
- `src/main/index.ts`：ENOENT 时 `console.debug`（生产不可见、dev 模式可见），其他错误仍 console.warn
- 仍返回 404，让渲染端 `<img onError>` 走占位图
- 刷屏瞬间消失

### 2. P0：reconcile 自动清理 dead previewPaths
- `src/main/lib/reconcile.ts` 新加 `cleanupDeadPreviewPaths()`，每次 reconcile 完成后扫一遍所有 video
- `fs.existsSync` 检查，删掉不存在的条目
- 全删完的 `previewPaths = undefined`（让 UI 走「无预览」分支，不再尝试加载）
- 改动合并进 `changes` 数组，由末尾 `applyVideoChanges` 一次性落盘
- 不刷屏、不弹窗：这是修复性的清理，不是用户该被打扰的事件

### 3. v2.2.5 仍未做（留给 patch 2）
- 不补 ffmpeg 重新截帧：hover 已有 javbus 抓的 cover 顶着用，preview 帧下次手动点"重新生成预览"时再生成
- 让 v2.2.5 保持最小变更，降低风险

---

## v2.2.4（2026-08-30）

**核心修复（用户反馈："代码有问题导致我收录了说没收录 + 弹窗不能藏起问题 + 万一没 Excel 怎么办"）**

### 1. P0：修 `parseIntroExcel` 中文路径读取（用户 84 部全部"未收录"根因）
- v2.2.3 用的 `XLSX.readFile(filePath)` 在 Windows 中文路径下**静默失败**——SheetJS v0.18.5 mjs 的 `readFileSync` 对非 ASCII 路径处理不当，会抛 `Cannot access file E:/新建文件夹/收藏整理_2026.xlsx`。
- 改成 `await fs.readFile(filePath)` + `XLSX.read(buf, { type: 'buffer' })`，绕开 xlsx mjs readFileSync 中文路径 bug。
- 实测：`E:\新建文件夹\收藏整理_2026.xlsx`（35KB / 74 部片单）buffer 解析成功 → keyMatches 76/76 命中。
- 同步修 `excelSheetNames`（同样用 buffer）。

### 2. P0：恢复「片单加载失败」弹窗（不再静默吞错）
- v2.2.3 的 `autoFindIntroExcel` 在 `parseIntroExcel` 返回 null 时**静默 catch**，让用户以为"片单不存在"——实际可能是片单存在但读取失败。
- v2.2.4 改造：
  - `readIntroDoc` 返回 `IntroLookupResult`（含 `doc` 和 `error`），区分 `not-configured` / `parse-failed` / `auto-find-failed`。
  - `autoFindIntroExcel` 同样返回结构化结果，记录 triedPaths。
  - `reconcileLibrary` 通过 onProgress 顺路把 `introError` 推到 renderer，弹 Toast 提示（title / message / 已尝试的路径列表），**不自动消失**让用户看到。
- 用户友好优先：找不到 → 告诉用户"在哪找不到"；找到了但解析失败 → 告诉用户"哪个文件坏了"。

### 3. P1：无 Excel 片单兜底：自动后台抓元数据
- 用户原话："万一哪天用户真没有excel怎么办"。
- reconcile `else` 分支：遍历时收集 `needFetchAfter`（没 javdbDetail 且非国产片）。
- 7 天内抓过且失败的跳过（`video.lastMetaFetchAt` 字段），抓到的写回 `video.javdbDetail` 让 UI 立刻按 genres 自动归类。
- 用 `settings.scanConcurrency` 控制并发（默认 2），与 scanLibrary 行为一致。
- `fetchDetailSmart` 抽到独立模块 `javdb-smart.ts`（避免 ipc ↔ reconcile 循环依赖）。

### 4. 技术债
- `MovieDetailResult` / `SmartFetchState` / `fetchDetailSmart` 从 ipc.ts 抽出到 `javdb-smart.ts`，让 reconcile.ts 也能调（无循环依赖）。
- Video 类型加 `lastMetaFetchAt?: number`（兜底抓取 7 天去重用）。

---

## v2.2.3（2026-08-30）

**核心修复（用户反馈"问题依旧存在 + 两个截帧角标 + 标签两份 + 控制台大量报错"）**

### 1. P0：library 未配 Excel 片单时自动扫描库根目录（最关键）
- `reconcile.ts` 加 `autoFindIntroExcel(folderPath)`：当 `library.introExcelPath` 未设时，**自动扫描库根目录一层**找 `.xlsx/.xls`（按文件名排序取第一个能解析品番列的）。
- 用户友好：用户把 `收藏整理_2026.xlsx` 放到 library 根目录即可，无需手动配 `introExcelPath`。
- 多个 xlsx 时按 zh 排序取第一个；console.log 提示「自动使用库根 Excel 片单」。

### 2. P0：reconcile.ts 双重 push（用户截图「未收录 84 + 未分类 79」根因）
- `reconcile.ts` else 分支（L260）补 `used.add(f)`：未配 Excel 时按文件维度只产出 1 条 entry。
- 之前每个 filePath 同时进入「未分类」和「未收录」两条 entry，`code` 完全相同 → `HomeView key={e.code}` 重复 key 警告（`MKMP-542`、`juy-703`）→ 详情页 seriesMembers 出现两次相同 chip。

### 3. P0：EntryCard 双「截帧」徽标
- `EntryCard.tsx` 删 `bg-violet-500/90` 重复 chip（v2.0.2 + v2.1.0 合并遗留），保留 `bg-fuchsia-500/90` 带 film 图标版。
- 顺手把数据源徽标改为单 IIFE 来源（防未来再加源时 paste 复制出错）。

### 4. P0：EntryCard 双「JavLibrary」徽标（靛 + 天蓝重叠）
- `EntryCard.tsx` 删链外 `bg-sky-500/90` 残留块，保留链内 `bg-indigo-500/90` 标准版。
- 顺手加 `posterSource === 'manual'` 时显示绿色「设为封面」chip（之前没有）。

### 5. P0：撤销 v2.2.2 的 `keyMatches` 字母后缀拒绝（最阴险 bug）
- v2.2.2 把 `keyMatches` 后缀检查改成 `/[A-Z0-9]/`，**严重过度修改**——把 `JUR-031.mp4` 归一后的 `M`（来自 MP4）误判为「另一番号字母」拒绝，导致**正常文件都匹配不上**。
- v2.2.3 改回只拒绝数字后缀：`/[0-9]/.test(after)`。`JUR-031.mp4` ↔ `JUR-031` ✅。
- 系列分集合并（`SONE-566AB` → `SONE-566`）改由 `extractBaseCode/hasSeriesSuffix` 在抓取源显式处理，不要在文件名 keyMatches 上做强约束。

### 6. P1：parseIntroExcel 同 code 多行不去重
- 解析循环内加 `seenCodes = new Set<string>()`（用归一 key），跳过重复并 warn。
- 同步把 `normalizeCode` 从 reconcile.ts 抽到 `src/shared/code.ts` 共享（reconcile + excel 两处共用）。

### 7. P1：HomeView key 防御性加固
- `HomeView.tsx:94` `key={e.code}` → `key={e.video?.id ?? \`code:${e.code}\`}`，未来再出重复 code 也不会 crash。

**回归测试**：14/14 用户截图文件名 → Excel 命中；normalize/autoFindIntroExcel/keyMatches v2.2.3 全部通过。

## v2.2.2（2026-08-30）

**Bug 修复（用户反馈"未收录 84 个"）**
- **`extractCode` 域名前缀误提取**（P0，github 项目根因）：`hdd800.com@JUR-031.mp4` 之前被错误识别成 `HDD-800`。修复：内部改造为先按 `@` 切多段 → 去方括号包裹 → 含 dashes 的合法番号形态段排序靠前 → plain fallback 用 `[A-Z]{2,}[A-Z]+\d{2,}`（要求额外字母，过滤纯字母+纯数字紧凑形态如 `HDD800`）。**覆盖测试 44/44 通过**（含 `b8s2048.org@EBOD-835`、`[hhd800.com@]DASS-733-C`、`44x.mejuy-703-2` 等用户截图实拍文件名）。
- **`javdb.ts` 的 extractCode 语义漂移**（P0）：与 code.ts 并行两套，访问 `m[0]` 而非 `m[1]`，独立归一逻辑。统一为从 `src/shared/code.ts` re-export，确保 main/renderer 两侧同语义（缓存前缀 `javdb-cover-SONE-560CD2` 与实际 `javdb-cover-SONE-560.jpg` 不匹配导致老缓存删不掉的 bug 同时修复）。

**其他 P1 解析增强**（按 Agent 全量排查报告逐条修）
- `reconcile.normalizeCode`：下划线归一（`SONE_566` → `SONE566`，与 `SONE-566` 命中）。
- `reconcile.keyMatches`：后缀字母也拒绝（防 `SONE-566AB` 误合并到 `SONE-566`；分集合并改由 `extractBaseCode/hasSeriesSuffix` 显式处理）。
- `rename.cleanVideoFileName`：先 `.toUpperCase()` 入参再匹配（`sone-566-uc.mp4` / `ALDN606.mp4` 之前返回 null 现能正确改名）；"无需改名"判定改为按大写比较（用户原大写即无需改）。
- `code.extractBaseCode` (`SERIES_SUFFIX_RE`)：尾部字母限制 `[A-DUC]`（之前 `[A-Z]` 太宽，把 `SONE-560X` / `KSJK-013V` 错剥成 `SONE-560` / `KSJK-013`）。
- `excel`：`品番` 列扫描从仅 B 列改为扫整个表头（用户把品番放 D/F 列之前会全部静默归入"未分类"）。

**P2**
- `scanner.cleanTitle`：清理中文方括号【】、中文圆括号（）。
- `reconcile` 未配置 Excel 分支：去掉扩展名后再写入 `code` 字段（之前 UI 卡片显示 `xxx.mp4`）。

**测试**：回归测试 61/61 通过（44 个 extractCode + 17 个 normalizeCode/keyMatches）。

## v2.2.1（2026-08-30）

**数据源自定义优先级（1-5）**
- 设置 → 数据源 → 「自定义优先级」区块（仅 auto 模式显示）：5 个源可点 ↑↓ 调整任意顺序（谁 1 谁 2 谁 3 谁 4 谁 5 你说了算）；
- 「重置为推荐顺序」一键恢复默认：Javapi → Javinfo → JavDB → JavBus → JavLibrary（按信息全面度 / 获取难度 / 风控排序）；
- 批量抓取（fetchDetailSmart）auto 链按该顺序降级，连续网络失败自动跳过当前源；
- 持久化到 `settings.customSourceOrder`。

**markdown 残留彻底清除（含注释与文案）**
- 复查全仓并修复 20+ 处注释/文案残留：excel.ts、App.tsx、EditMetaModal（4 处）、ReconcileDialog（2 处）、about.ts（3 处）、api-types.ts（3 处）、ipc.ts、reconcile.ts（4 处）、types.ts（4 处）——全部改为 Excel 表述；
- 保留：`CHANGELOG.md`（项目更新日志）、`通用评分与简介规范.md`（资源文档），非片单用途。

**CI 修复（GitHub Actions 构建失败）**
- `electron-builder.yml` 增加 `win.certificateFile: build/yingxia-sign.pfx`；
- `release.yml` 命令简化为 `npx electron-builder --win`，证书密码改走 `CSC_KEY_PASSWORD` 环境变量（`secrets.CERT_PASSWORD`），不再用会触发 ENOENT 的 `-c.win.certificateFile=...` 写法。

## v2.2.0（2026-08-30）

**全面删除 markdown 片单支持**（用户要求一处不留，已全仓清理）
- 删除 `src/main/lib/parser.ts`（md 解析器）、`mdWatcher.ts`（md 监听）、`src/renderer/src/components/OnboardMdModal.tsx`（新建 md 向导）三个整文件；
- 删除 IPC：`specGet`（读取内置规范）、`libraryExportCodes`（导出番号清单）、`onMdChanged`（md 变更事件），含 `shared/ipc.ts` 常量 + `preload/index.ts` 暴露 + `shared/api-types.ts` 类型 + `ipc.ts` handler；
- `Library.introMdPath` 字段移除；`Settings.library.introExcelPath` 改为唯一的片单权威来源；
- `LibraryModal` 去掉「简介 md 文件」整块选项 + 「还没有 md？按内置规范让 AI 帮你生成 →」按钮 + `onOnboard` prop；
- `dialogSelectFile` 通用文件选择器默认 filter 改为 Excel（`xlsx`/`xls`），title/buttonLabel 支持调用方覆盖；
- `reconcile.ts` 删除 md 兜底分支，仅使用 Excel 片单；
- 资源 `通用评分与简介规范.md` 仍在 `extraResources` 中保留（项目文档，非片单），未删除；`CHANGELOG.md` 同理保留。

**数据源推荐顺序（已确认 v2.1.0 即为该顺序）**
- 顺序：Javapi → Javinfo → JavDB → JavBus → JavLibrary；
- 推荐依据：① Javapi（本地聚合 8 源 + JavDB API，信息最全、无 Cloudflare/IP 风控、免费，但需自托管）；② Javinfo（javinfo.dev 聚合，免风控，按量计费）；③ JavDB（原始最准，但有 Cloudflare 风控）；④ JavBus（备用源，含年龄验证绕过）；⑤ JavLibrary（兜底源，与 javdb/javbus 数据重叠度高）；
- 用户可手动指定单一源（设置 → 数据源 → 手动选项）。自定义 1-5 优先级拖拽留 v2.3.0。

**新功能：隐私锁删除密码验证**
- 设置 → 隐私与安全 → 已有「当前状态：已上锁/未上锁」+ 密码输入区（SHA-256 + 随机 salt 哈希存储，明文不落盘）；
- 开启锁后，删除视频（详情页/卡片/文件列表「删除文件」按钮 → 二次确认 → 走 confirmDelete）和删除媒体库（库设置 → 删除）时，会先弹密码框（window.prompt）要求输入密码；
- 密码错误或取消则中止删除；连续验证失败不影响下次。

## v2.1.0（2026-08-29）

**合并朋友分支（github.com/z1006670445/yingxia-video-manager）**
- **新增数据源 Javapi（本地自托管聚合 API）**：settings 配置地址 + Key，免费、无 Cloudflare/IP 风控；auto 降级链最优先；
- **新增数据源 Javinfo（javinfo.dev 聚合 API）**：注册拿 Key，免风控；auto 链第二顺位；
- **设为封面 / 预览帧设为封面**：详情页预览帧可设为封面（posterSource=manual 最高优先级），封面替换前 ffprobe 验证图片有效性（坏图不替换 + 删坏图走截帧兜底）；coverVersion 机制让封面即时刷新；
- **渲染进程侧截帧兜底（frameFallback）**：列表/详情显示时按需 ffmpeg 截帧（与主进程扫描截帧互补）；ListThumb 缩略图组件（blur 背景 + 帧标识）；
- **首页全库随机**：多库合并洗牌，单库自动隐藏；收藏/详情不再刷新随机；
- **打包输出移到工作区外**（~/yingxia-release/<时间戳>），根治 app.asar 被占用；
- 徽标体系扩展：Javapi（青）/ Javinfo（绿）/ JavLibrary（靛）/ JavBus（黄）/ 截帧（品红）。

**新功能**
- **无封面视频自动归类（需求 B）**：媒体库未配置 md / Excel 片单时，所有文件原先一律归入「未分类」。现在：
  - **有数据源元数据**（javdbDetail.genres 非空，如 JavBus 抓到的「高清」「字幕」）的视频，按 genres 自动归类为「【JavBus】高清·字幕」这类自动分类（order 9000，位于用户分类之后、未收录之前）；
  - **无元数据**的视频仍归「未分类」（行为不变）；
  - 侧栏「分类」里自动归类项用独立分组「⚡ 自动归类」显示（紫色分隔标题，与用户分类区分）；
  - 同一 genres 组合的多部视频自动归入同一分类，点击即可筛选查看。

**优化（需求 A）**
- **截帧超时兜底**：ffmpeg 单次截帧（thumbnail 封面 / 预览图）超过 30 秒强制 kill，防止长视频或异常文件卡死扫描/对账/补齐流程；
- **截帧批次上限**：单轮对账 / 单轮批量补齐后台截帧最多处理 200 部，其余留待下轮，避免长时间占满并发池拖慢操作。

**说明**
- 自动归类在每次对账时按 javdbDetail.genres 实时计算，数据源元数据更新后归类自动跟随变化；
- 若视频后续在 md / Excel 片单中新增条目，下次对账会优先按片单分类展示，自动归类自动让位。

## v2.0.3（2026-08-29）

**回滚 / 修复**
- **回滚详情页 UI 改动**：恢复 v1.9.0 时确认的详情页布局（`git checkout a08dbd0 -- VideoDetail.tsx`），撤销 v2.0.0/v2.0.2 引入的"ffmpeg 截帧切换 chips"和"JavLibrary 蓝色徽标"（这两项是导致红框标注的大片空白 + 视觉割裂的根源）。
- **修复详情页右栏大片空白**：右栏加 `flex flex-col` 让内容垂直排列，底部新增「文件信息」卡片（文件名 / 添加于 / 上次播放 / 时长 / 完整路径），通过 `mt-auto` 推到右栏底，填满 grid 拉伸后的剩余高度，**消除红框区域的空白**。

**新功能**
- **首次启动强制弹出「用户须知」**：新增 `UserNoticeModal` 组件（正式法律文书风格），涵盖：
  - 软件性质声明（仅本地管理工具，不提供/不存储/不传播任何片源内容）
  - 用户行为规范
  - 详细法律条文（**《刑法》第三百六十三条【制作、复制、出版、贩卖、传播淫秽物品牟利罪】**、**第三百六十四条【传播淫秽物品罪】**、《治安管理处罚法》第六十八条、《网络安全法》第十二条、《未成年人保护法》第五十一条、《民法典》第一千零一十九条）
  - 未成年人特别保护、免责声明
  - 复选框「我已阅读并同意，下次启动不再显示」——勾选后写入 `settings.noticeDismissed=true` 永久不再弹；未勾选关闭则下次启动再次弹出
  - **不可 ESC 关闭、不可背景点击关闭**（合规要求：必须主动确认才能继续使用）

## v2.0.2（2026-08-29）

**优化**
- **截帧质量提升**： 与  改用 ffmpeg 官方  滤镜（自动分析 N 帧后选最具代表性的一帧）——避免黑场/静帧/淡入淡出等暗帧问题。 按视频时长自适应（100 帧起步，最长 200 帧）。
- **列表页 / 网格卡片「截帧」紫色徽标**：ffmpeg 截帧生成的封面在 EntryCard 和 ListView（缩略图列表）左上加紫色  chip 标识，一眼分辨是数据源图还是 ffmpeg 截帧（顺带补了 JavLibrary 蓝色 chip）。
- **说明**：升级前已截的旧暗帧不会自动重新截——详情页「重新截帧」按钮可逐个升级；批量升级可在首页扫描库完成后用 javdb 信息批量补齐流程触发。

## v2.0.1（2026-08-29）（2026-08-29）

**优化**
- **无封面自动 FFmpeg 截帧兜底**：多个数据源（JavDB/JavBus/JavLibrary）都抓不到数据的视频，不再只显示灰色占位图——以下三条路径都会对无封面视频自动截帧显示真实画面（随机时间点截 1 张封面 + 15 张预览图）：
  - **扫描富集**：扫描媒体库时，对无海报视频强制截帧兜底（不再受 `imagePriority` 是否含 ffmpeg 限制）；
  - **对账完成**：自动/手动对账结束后，后台对仍无海报的视频异步截帧（不阻塞对账返回）；
  - **批量补齐完成**：「补齐信息」批量结束后，后台对仍无海报的视频异步截帧（不阻塞补齐返回）。
  - 截帧封面独立保存在 `posterPathFfmpeg`，与数据源图并存，仍可通过详情页「数据源图 / FFmpeg 截图」自由切换。

## v2.0.0（2026-08-29）

**新功能 · 大版本**
- **片单改为 Excel 格式（替代 md）**：新增 `src/main/lib/excel.ts` 解析器，支持直接选择「收藏整理_2026.xlsx」这类片单文件（需含「品番」列，如「片单」工作表）。Excel 的分列结构（编号/品番/分类/推荐评分/简介/主题/角色/服装/体型/行为/玩法/场景/剧情/其他）完整映射到现有对账体系（分类 → 分类分组、品番 → 番号、推荐评分 → 评分、各标签列 → 结构化标签）。媒体库设置中可分别配置「md 简介」与「Excel 片单」，**Excel 优先、md 兜底**。md 完全保留兼容。
- **搜索只提取非中文番号**：`extractCode` 全面增强——支持无分隔符番号（`KSJK013` → `KSJK-013`，旧版只认 `SONE-560` 这种带分隔符的，导致无分隔符片名搜不到），并先剥离中文/全角/广告前缀（`【中文字幕】KSJK013` 不再污染搜索词）。javdb / javbus / javlibrary 三源共用同一增强逻辑。
- **扫描支持"只扫大于 X MB"**：设置 → 数据与存储 →「跳过小体积文件」（默认 100MB，0 = 不过滤）。扫描与对账都会跳过小于阈值的文件，广告样片/短视频不再混入主列表。
- **新增 JavLibrary 数据源**：设置 → 网络 → 数据源 新增 JavLibrary；手动模式可单独指定该源调试；auto 模式降级链变为 JavDB → JavBus → JavLibrary。
- **封面/预览图双缓存 + 自由切换**：详情页封面下方新增「数据源图 / FFmpeg 截图」切换按钮。数据源（javdb/javbus/javlibrary）抓取的封面与 FFmpeg 随机截帧封面**独立保存**（`posterPathFfmpeg`），可随时来回切换，不再互相覆盖；FFmpeg 截图不存在时点击会自动生成。

**修复**
- **批量补齐不再误停**：`fetchDetailSmart` 之前把「搜索无结果」（数据源确实没这个番号，正常情况）也计为连续失败，导致 IP 没被封也自动停止/切源。现在只有真正的网络/会话异常（请求失败、超时、年龄验证失败）才累计失败次数；「无结果/无法识别番号」静默不计。javbus 的「搜索无结果」提示同步改为静默。
- 批量补齐按用户设置的间隔执行（`fetchIntervalMs`，不再有额外固定延时叠加）。
