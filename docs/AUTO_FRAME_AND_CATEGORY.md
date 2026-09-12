# 需求：无封面截帧兜底 + 自动归类

> 版本：v0.1（草稿，待评审）
> 适用范围：影海（yingxia-video-manager）v2.x
> 关联：v2.0.1（无封面自动截帧） + v2.0.2（thumbnail 滤镜） + v2.0.3（回滚详情页 UI）

---

## 一、背景与现状

### 1.1 问题

**A. 无封面视频大量堆积灰色占位图**

在 1 个媒体库内（典型 100~500 部），经常出现以下场景：
- 部分影片在 **JavDB / JavBus / JavLibrary 三个数据源均无对应条目**（冷门片、首发未收录、番号识别错误等）
- 这些视频没有封面，元数据为空，列表页/详情页/卡片墙显示**灰色占位图**，观感极差
- v2.0.1 已实现"无封面自动 ffmpeg 截帧"（扫描/对账/补齐三条路径），v2.0.2 已用 `thumbnail` 滤镜选最具代表性帧；但**行为细节、降级处理、并发、重试等仍待细化**

**B. "未分类" 分类堆放无意义**

对于"有 JavDB/JavBus 元数据但不在 md / Excel 片单中"的视频（如 DLDSS 系列 8 部），reconcileLibrary 当前的处理是：统一归到 `【未分类】` 分类。

这导致两个问题：
1. 用户看到「未分类 - 8 部」无法区分它们是「没有元数据」还是「有元数据但 md 没收录」
2. 明明 JavBus 已经抓到了 `genres: ["高清", "字幕", ...]`，却没用上，等于浪费了抓回来的结构化信息

### 1.2 截图示例

**列表页「未分类 - 8 部」实际含 JavBus 元数据**（截图2）

```
美乃雀 - 16 部
  未分类 - 8 部
    dldss-001.mp4   [JavBus]
    dldss-030.mp4   [JavBus]
    dldss-129.mp4   [JavBus]
    ...（8 部全部是 DLDSS 系列，全部来自 JavBus）
```

**详情页能看到 JavBus 抓到的 genres 却没被用上**（截图1 DLDSS-409）

- 数据来源：JavBus
- 类别：`高清` / `字幕`（来自 `javdbDetail.genres`）
- 当前分类：`【未分类】`（应改为基于 genres 的自动归类）

---

## 二、目标

1. **所有"无封面"视频最终都有真实画面**（ffmpeg 截帧），且截帧帧画面有内容、不黑屏、不静帧
2. **有元数据但不在片单中的视频按 genres 自动归类**，不再无意义堆入"未分类"
3. **现有数据不破坏**：md/Excel 片单已配置的分类优先；自动归类作为"兜底"层
4. **行为可降级**：ffmpeg 不可用、文件无法访问、并发满载时，整库扫描/对账/补齐仍能正常完成（截帧失败不阻塞主流程）

---

## 三、详细需求

### 需求 A：无封面自动 ffmpeg 截帧兜底（细化）

#### A.1 触发条件（精确）

满足以下**全部**条件的视频，触发自动截帧生成封面：

| 条件 | 说明 |
|---|---|
| `video.posterPath` 为空 | 字段缺失或值为 `undefined`/`null`/`''` |
| `video.posterSource === 'placeholder'` | 当前来源是占位图（手动指定 / sidecar / 数据源抓取 / ffmpeg 都未成功） |
| 数据源抓取已结束 | 至少完成一轮 javdb / javbus / javlibrary 抓取尝试（详情页"补齐信息" 或 批量补齐已完成） |

**触发路径**（覆盖所有可能的入口）：

1. **扫描媒体库**（`scanLibrary` 富集阶段）— 无海报视频强制截帧
2. **对账完成**（`reconcileLibrary` 末尾）— 收集 `matched` 但无海报的视频，后台异步截帧
3. **批量补齐完成**（`libraryFetchJavdbAll` 末尾）— 后台异步截帧
4. **详情页单条重新截帧**（`videoGeneratePreviews`）— 用户手动触发

**不触发**的情况：
- 视频有数据源封面（`posterSource` 为 `javdb`/`javbus`/`javlibrary`）— 不覆盖
- 视频有手动指定封面（`posterSource === 'manual'`）— 不覆盖
- 视频已有 ffmpeg 截帧缓存（`posterPathFfmpeg` 存在）— 优先复用，不重复截

#### A.2 帧选择策略（精确）

使用 **ffmpeg `thumbnail` 滤镜**（v2.0.2 已实现），参数：

```bash
ffmpeg -y -i <video.path> \
  -vf "thumbnail=n=<N>,scale=480:-1" \
  -frames:v 1 \
  -q:v 2 \
  <cover.jpg>
```

**`n`（采样帧数）自适应**（v2.0.2 已实现）：

| 视频时长 `dur` | 采样帧数 `n` |
|---|---|
| `dur < 30s` | 100（最低保证） |
| `30s ≤ dur < 6000s（100 分钟）` | `floor(dur / 30)`，约每 30 秒采一帧 |
| `dur ≥ 6000s` | 200（封顶，避免长片拖慢扫描） |

**输出规格**：
- 宽 480 像素（`-1` 高度按比例，保持原比例）
- JPEG q=2（高质量 ≈ qscale 2~5）
- 文件大小通常 30~80 KB

#### A.3 失败兜底（精确）

按以下顺序处理失败：

| 失败原因 | 检测方式 | 兜底处理 |
|---|---|---|
| ffmpeg 不可用 | `await ffmpegAvailable(settings)` 返回 `null` | 跳过截帧，使用占位封面；记录 `frameLog`；不抛错 |
| 截帧命令失败 | `spawn` close code !== 0 | 跳过该视频；不重试；下轮扫描/对账/补齐时再尝试 |
| 视频文件不可访问 | `fs.stat` 抛 `ENOENT` / `EACCES` | 跳过该视频；记录日志 |
| 截帧超时 | ffmpeg 单次 > 30 秒未结束 | `child.kill('SIGKILL')`；跳过；不阻塞并发池 |
| 缓存目录写入失败 | `fs.writeFile` / `fs.mkdir` 抛错 | 跳过；记录日志 |

**关键约束**：
- 截帧失败**不阻塞**主流程（扫描/对账/补齐继续推进）
- 截帧失败**不标记视频为永久失败**——下次扫描/对账时**重新尝试**（自然重试机制）
- 单次截帧设置 `spawn` 的 `windowsHide: true`，避免 Windows 上弹出黑窗

#### A.4 并发与超时（精确）

- **并发数**：复用 `settings.scanConcurrency`（默认 4，最大 8）— 与 ffprobe 探测共享并发池
- **单次超时**：ffmpeg 子进程 30 秒未结束则 kill
- **批量上限**：单次扫描/对账/补齐触发的"无封面兜底截帧"任务，单库最多截 200 部；超出后剩余视频留待下次扫描/补齐
- **优先级**：扫描 > 对账 > 补齐 完成后触发的兜底截帧；用户点"重新截帧"按钮的请求立即执行（不走异步队列）

#### A.5 缓存与持久化（精确）

- **缓存目录**：`posters/` 下 `<video.id>.jpg`（v2.0.1 已实现）
- **持久化字段**：
  - `video.posterPath` = 截帧生成的本地路径
  - `video.posterSource = 'ffmpeg'`
  - `video.posterPathFfmpeg` = 同 `posterPath`（与数据源图独立保存，详情页可自由切换）
  - `video.previewPaths` = 15 张预览图本地路径（`generatePreviewSet` 顺带生成）
- **复用**：`videoSwitchPoster` 切换到 ffmpeg 时，优先复用 `posterPathFfmpeg`（避免重复截）

#### A.6 视觉标识（精确）

- **列表/卡片徽标**：ffmpeg 截帧封面在 EntryCard 和 ListView 左上显示紫色 `截帧` chip（v2.0.2 已实现，紫色 `bg-violet-500/90` + film 图标）
- **详情页切换按钮**：保留 v2.0.3 已回滚的设计——v2.0.3 之后详情页无"数据源图/FFmpeg 截图"切换 chips；如未来需重新引入，应在"重新截帧"按钮旁加

---

### 需求 B：未分类视频按数据源 genres 自动归类（全新）

#### B.1 触发条件（精确）

满足以下**全部**条件的视频，进入自动归类流程：

| 条件 | 说明 |
|---|---|
| 该视频在 `reconcileLibrary` 时**未匹配到 md / Excel 片单条目** | 仍归入「未分类」分支（保留兼容） |
| `video.javdbDetail`（或 javbusDetail / javlibraryDetail）**非空** | 元数据已抓取成功 |
| `video.javdbDetail.genres`（或对应字段）**非空数组** | 至少 1 个类别 |
| `video.javdbDetail.source` 已记录 | 用于决定分类前缀 |

#### B.2 类别来源与优先级（精确）

**单一数据源场景**（当前 90% 情况）：

- **使用 `javdbDetail.genres` 作为分类依据**（v2.0.0+ 已经把 javbus / javlibrary 抓的数据也归一存到 `javdbDetail.genres`）
- 即"哪个数据源抓到的数据进入 `javdbDetail`，就用它的 genres"

**多源场景**（v2.0.0+ 数据源 auto 降级：javdb→javbus→javlibrary）：

- 只有**实际成功的源**的 genres 进入 `javdbDetail.genres`
- 不存在多源冲突（每次抓取只取第一个成功的源的数据）

**冲突规则**：单视频多个 genres 是正常的（一部片可能同时是"高清"和"字幕"），**不做优先级排序，全部归入**

#### B.3 归类逻辑（精确）

**Step 1：生成自动分类名**

为每部视频生成**唯一一个**自动分类标识：

```
格式：【{source}】{genre1}·{genre2}·...
示例 1：【JavBus】高清·字幕
示例 2：【JavDB】有码·单体
示例 3：【JavLibrary】欧美·HD
```

> 说明：
> - `{source}` = `javdb` / `javbus` / `javlibrary`（根据 `video.javdbDetail.source`）
> - `{genre}` 来自 `video.javdbDetail.genres`（按数组顺序）
> - 中文友好：source 显示为中文「JavDB / JavBus / JavLibrary」
> - 同 genres 的视频归入同一分类

**Step 2：在 UI 侧栏"分类"列表中显示**

- reconcile 输出的 `entries` 中，新增一类 `kind: 'auto-categorized'`
- 侧栏分类列表在「未分类」之上，插入「自动归类」分组，分组下显示每个 `{source}+{genres}` 组合（如「【JavBus】高清·字幕 - 8 部」）
- 排序：按"该分类下视频数量"降序，量大的在前

**Step 3：视频同时显示在「未分类」与「自动归类」分组？**

- **否**。一旦被自动归类，从「未分类」**移除**
- 「未分类」仅保留**真正无元数据**的视频（既不在片单中，数据源也都没抓到）

#### B.4 数据结构（精确）

新增 `DisplayEntry` 变体（src/shared/types.ts）：

```typescript
/** 自动归类：根据数据源 genres 推断出的分类（无 md / Excel 条目） */
interface AutoCategoryEntry {
  kind: 'auto-categorized'
  /** 自动分类标识，如 "javbus:高清·字幕" */
  autoCategoryKey: string
  /** 用户可见的分类名，如 "【JavBus】高清·字幕" */
  autoCategoryName: string
  /** 来源（JavDB / JavBus / JavLibrary） */
  source: 'javdb' | 'javbus' | 'javlibrary'
  /** 该视频的 genres（来自 javdbDetail.genres） */
  genres: string[]
  category: string          // 与 autoCategoryName 一致
  order: number             // 自动归类固定 9000（未分类 9999 之前）
  code: string              // 番号
  title: string
  description: string
  tags: string[]
  tagCategories?: Record<string, string[]>
  score?: number
  video: Video
}
```

**reconcileLibrary 改造点**：

- 当前：未匹配到 md/Excel 条目但有元数据的视频 → 归入「未分类」
- 改造后：
  - 有 `javdbDetail.genres`（非空）→ 生成自动分类，**归入自动分类**（同时**从「未分类」移除**）
  - 无 `javdbDetail.genres` → 归入「未分类」（保持现有行为）

**Video 持久化字段**（可选，不强制；reconcile 阶段计算即可）：

- `video.autoCategoryKey?: string` — 自动分类 key（重启后仍可识别）
- `video.autoCategoryName?: string` — 自动分类显示名

> **不**持久化到 video 的理由：genres 变了，autoCategory 会变；持久化会让"再次抓取"后老分类残留。reconcile 每次重算即可。
> **持久化**的理由：避免每次 reconcile 重复计算（O(n) → O(1)）；且与 md 分类走同一对账路径。**最终决定**：持久化 `autoCategoryKey` 字段（轻量；reconcile 时检测到 genres 变化时更新）。

#### B.5 UI 展示（精确）

**侧栏「分类」列表（Browse 视图）**：

```
全部
├─ 收藏
├─ 国产片
├─ 多人大乱交 (12)
├─ ...
├─ ─── 自动归类 ───
├─ 【JavBus】高清·字幕 (8)   ← 自动归类
├─ 【JavBus】字幕·独家 (5)
├─ ...
└─ 未收录 (3)
```

**列表页/详情页行为**：

- 点击侧栏自动分类 → 只显示该自动分类下的视频
- 详情页"数据来源"徽标保留 v2.0.3 状态（无 javlibrary 蓝色，回归"无角标 = JavDB"）
- 详情页「类别」字段照常显示 `javdbDetail.genres` 列表（"高清"、"字幕"等 chip）

**自动归类与片单（md/Excel）的优先级**：

- 若用户后续在 md / Excel 中**新增了该番号的条目**，下次对账时：
  - reconcile 优先匹配 md / Excel 条目 → 归入用户配置分类
  - 移出自动归类（因为 `entry.kind` 变为 `matched`）

#### B.6 边界与兼容

- **空 genres**：`javdbDetail.genres = []` → 归入「未分类」（与"完全无元数据"行为一致）
- **元数据失效**：`javdbDetail` 字段缺失/无 source → 归入「未分类」
- **国产片**：`video.domestic === true` → 不参与自动归类（保留在「国产片」分组）
- **重复归类**：同一视频的 genres 与另一视频完全一致 → 归入同一自动分类（去重）
- **空分类**：某自动分类下视频被全部删除/重新对账后，分类自动从侧栏消失（无残留）
- **侧栏性能**：自动分类数量上限 50；超出后按"视频数"降序保留前 50，其余视频归入「未分类」并在 toast 提示"自动归类已达上限 50"

#### B.7 用户控制（可选）

设置 → 通用 → 新增"自动归类开关"（默认开）：
- **开**：reconcile 时执行自动归类
- **关**：所有"不在片单"的视频一律归入「未分类」（v2.0.3 行为）

**存储**：`settings.autoCategorize: boolean`（DEFAULT `true`）

---

## 四、验收标准

### 截帧需求 A

- [ ] A1. 扫描媒体库（含无封面视频）完成后，所有无封面视频的 `posterPath` 非空，且 `posterSource === 'ffmpeg'`
- [ ] A2. ffmpeg 不可用时（如卸载/路径错误），扫描仍能正常完成，视频显示占位图，不抛错
- [ ] A3. 截帧画面有内容（人工抽查 10 部，无黑屏/全静帧/纯色帧）
- [ ] A4. 截帧成功后，列表卡片左上有紫色 `截帧` chip
- [ ] A5. 1000 部无封面视频扫描时间 < 5 分钟（thumbnail 滤镜 30s 帧数封顶 200，平均 5-15s/部）
- [ ] A6. 截帧失败视频在下一次扫描/对账时**自动重试**（非永久失败）
- [ ] A7. 并发数 = `settings.scanConcurrency`（默认 4），可通过设置调整

### 归类需求 B

- [ ] B1. 媒体库无 md/Excel 片单、有元数据的视频全部归入自动分类（不留在「未分类」）
- [ ] B2. 自动分类名格式正确：`【{源}】{genres}`，如 `【JavBus】高清·字幕`
- [ ] B3. 侧栏分类列表在「自动归类」分组下显示各自动分类项
- [ ] B4. 关闭"自动归类开关"后，行为退回到 v2.0.3（所有非片单视频归入「未分类」）
- [ ] B5. 视频的 javdbDetail.genres 更新后，下次对账自动归类相应更新
- [ ] B6. 自动归类下的视频**不**在「未分类」中重复出现
- [ ] B7. 自动分类数量 > 50 时，按"视频数"降序保留前 50

---

## 五、范围之外（Out of Scope）

本需求**不**包含：

- 用户**手动**为单视频指定分类（未来考虑：详情页加"移动到分类…"操作）
- 自动归类的**合并/重命名**（未来考虑：右键菜单"合并到…/重命名"）
- 多源 genres 合并去重策略（当前不存在多源冲突，单源直接取；未来若支持真正的多源抓取再讨论）
- 自动归类的**搜索**支持（视频内搜索"javbus 高清"能搜到自动分类 → 暂不支持；先做侧栏导航 + 过滤）
- 截图2 提到的「未分类」按钮当前在分类列表中的位置调整（保持现状）

---

## 六、实施分批建议

| 批次 | 内容 | 工作量 | 风险 |
|---|---|---|---|
| **v2.1.0** | 需求 A 全部实现细节（并发、超时、失败兜底、缓存策略、视觉标识补全）+ 现有 v2.0.1/v2.0.2 行为对齐 | 中 | 低（已有 v2.0.1/v2.0.2 基础，补全细节） |
| **v2.1.0 同批** | 需求 B.1 ~ B.5 核心（触发条件、归类逻辑、UI 展示）+ 验收 B1-B6 | 中 | 中（reconcile 流程改动，需谨慎） |
| **v2.1.1** | 需求 B.6 边界 + B.7 自动归类数量上限 + 「自动归类开关」设置项 | 小 | 低 |

**第一批预计代码改动**：
- `src/main/lib/images.ts`：截帧参数确认、并发池、超时
- `src/main/lib/scanner.ts`：扫描富集阶段补全
- `src/main/lib/reconcile.ts`：对账时新增自动归类逻辑
- `src/shared/types.ts`：`DisplayEntry` 加 `auto-categorized` kind
- `src/renderer/src/components/Sidebar.tsx`：侧栏"自动归类"分组
- `src/renderer/src/components/EntryCard.tsx`：自动归类 kind 渲染
- `src/main/lib/ipc.ts`：批量补齐末尾截帧兜底

---

## 七、待评审 / 待用户确认的点

1. **A.5 截帧批次上限 200** — 合理？1000 部库扫描会跑多轮，可接受
2. **A.6 重试策略** — "下次扫描/对账时自动重试" 是否足够？是否需要"手动重试"按钮？
3. **B.3 自动归类与「未分类」是否互斥** — 满足自动归类条件的视频**从「未分类」移除**（不重复显示）。可接受？
4. **B.4 Video 持久化 `autoCategoryKey`** — 是/否？建议"是"（轻量 + 跨对账稳定）
5. **B.7 侧栏自动分类上限 50** — 合理？是否需要"全部展开 + 滚动"？
6. **「自动归类开关」默认开** — 可接受？需要更激进的默认（关）让用户主动开？
7. **需求 A 是否需要详情页恢复"数据源图/FFmpeg 截图"切换按钮** — 这次回滚后没了，但 B 的自动归类配合 A 的双封面策略，未来可能需要

---

> **本文档作为开发任务输入的最终态**：待用户确认 / 修改后冻结。
> 冻结后：拆分到 v2.1.0 / v2.1.1 的 issue 列表，按依赖顺序实现。
