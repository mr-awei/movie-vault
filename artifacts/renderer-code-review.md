# 影海 Yinghai 渲染层（React）深度审阅报告

> 审阅范围：`src/renderer/src/` 全部渲染层文件 + `src/preload/index.ts` + `tailwind.config.cjs`
> 技术栈：React 18 + TypeScript + Tailwind + Zustand + ECharts
> 审阅日期：2026-09-16

---

## 0. 总览

| 指标 | 数值 |
|---|---|
| `App.tsx` 行数 | 2901 行（上帝组件） |
| `App.tsx` 内 `useState` | **22 个** |
| `App.tsx` 内 `useEffect` | **20 个** |
| `App.tsx` 内 `useCallback/useMemo` | 40+ 个 |
| Zustand store 实际使用 | 仅 8 个弹窗开关 + sidebarCollapsed（且 sidebarCollapsed 未被使用） |
| `SettingsModal.tsx` | 1628 行单文件，8 个设置分类 |
| `VideoDetail.tsx` | 1101 行，15+ useState/useEffect |
| `Sidebar.tsx` props | **80+ 个**（props drilling 极值） |
| `EntryCard.tsx` | 694 行，内含 hover 预览/右键菜单/拖拽/多选/截帧兜底 |
| 硬编码中文（不走 i18n） | **44+ 处**（grep 命中） |
| 硬编码 hex 颜色 | 76 处（含 index.css） |
| `any` 使用 | 仅 4 处（WatchStatsModal formatter） |

**核心结论**：Zustand 迁移只完成了 UI 模态框层，**业务状态（视频列表、筛选条件、播放列表、选中集、扫描进度）全部仍堆在 `App.tsx`**，导致任何一个 slice 状态变化都会触发整个 App 树重渲染。`EntryCard` 虽然包了 `memo`，但传入的回调在 `App` 侧几乎都不是稳定引用，`memo` 实际失效。

---

## 一、高严重度（用户可感知卡顿 / 显示错误）

### H1. `ListView` 完全没有虚拟化，大库一次性渲染全部行

- **文件:行号**：`src/renderer/src/components/ListView.tsx:43`
- **组件**：`ListViewInner`
- **代码证据**：
  ```tsx
  return (
    <div className="overflow-auto thin-scroll pr-1 h-full">
      <div className="flex flex-col gap-1.5">
        {entries.map((e) => {   // ← 全量 map，无窗口化
          ...
        })}
      </div>
    </div>
  )
  ```
- **问题**：海报墙走 `VirtualizedWall`（正确虚拟化），但 **纯文件名列表模式 (`list-filename`) 走 `ListView`，直接 `.map()` 全量渲染**。库有 3000 部影片时，一次性创建 3000 个 DOM 行（每行还有 `useFrameFallback` + `useState`），滚动必然卡顿，且每个 `ListThumb` 都会跑一次封面 URL 计算。
- **严重程度**：高
- **建议**：把 `ListView` 也改成窗口化（复用 `VirtualizedWall` 的行高测量思路，行高固定 ~52px，实现成本很低）；或至少先做 `windowing`（只渲染视口 ± 5 行）。

### H2. `WatchStatsModal` ECharts 图表硬编码浅色坐标轴，深色主题下文字几乎不可见

- **文件:行号**：`src/renderer/src/components/WatchStatsModal.tsx:94, 102-103, 112, 116, 121-123, 136-137, 178, 186-187, 196, 200, 208` 等
- **组件**：`WatchStatsModal`（月度/周度/小时/完成度 4 个图表）
- **代码证据**：
  ```ts
  legend: { textStyle: { color: '#374151', fontSize: 11 } },        // 深灰字
  xAxis: {
    axisLine: { lineStyle: { color: '#d1d5db' } },                  // 浅灰轴
    axisLabel: { color: '#6b7280', fontSize: 10, rotate: 30 }        // 中灰标签
  },
  splitLine: { lineStyle: { color: '#e5e7eb' } },                    // 浅灰分割线
  ```
  但弹窗容器是 `bg-ink-850`（深色，见 403 行）：
  ```tsx
  <div className="w-[900px] max-h-[85vh] bg-ink-850 rounded-2xl ...">
  ```
- **问题**：这正是 hint 里提到的"弹窗/图表深色浅色混用、白字浅底看不清"bug 域——**坐标轴文字 `#6b7280` 画在 `#0e1118` 深色底上，对比度极低**。tooltip 背景写死 `rgba(30,30,40,0.95)`（第 83 行）在浅色主题下也会不协调。
- **严重程度**：高（用户打开观看统计即看不清数字）
- **建议**：
  1. 从 `document.documentElement.classList.contains('theme-light')` 读取当前主题，把坐标轴/分割线/legend 颜色抽到两个常量对象 `CHART_THEME_LIGHT` / `CHART_THEME_DARK`；
  2. 监听 `theme-light` class 变化（`MutationObserver`）触发 `chart.setOption(...)` 重绘；
  3. tooltip 背景用 CSS 变量或跟随主题。

### H3. `WatchStatsModal` 整文件硬编码中文，完全不走 i18n

- **文件:行号**：`WatchStatsModal.tsx:411, 421, 425-426, 432-433, 440, 444, 448, 452, 458-459, 472, 489, 492, 521, 524, 547, 550, 577, 580, 599, 602`
- **代码证据**：
  ```tsx
  <span className="text-white font-semibold text-base">观看统计</span>
  <div className="text-white/40 text-sm text-center py-16">正在加载观看统计...</div>
  <div className="text-white/50 text-sm">暂无观看记录</div>
  <div className="text-white/30 text-xs mt-2">播放视频后会自动记录观看历史</div>
  <div className="text-white/50 text-xs mt-1">总观看时长</div>
  <h3 className="text-white font-medium text-sm mb-3">完成度分布</h3>
  <p>你观看时长最多的标签，点击标签可筛选该标签影片。</p>
  ...
  ```
  文件顶部 `import { t } from '../../../shared/i18n'` **根本没被使用**。
- **问题**：用户切到英文界面后，观看统计弹窗全部仍是中文。项目 `i18n` 文件 zh-CN/en-US 各 1089 行，但这个 595 行的统计弹窗是个 i18n 孤岛。
- **严重程度**：高（功能完整但国际化失效）
- **建议**：把所有文案抽到 `shared/i18n`，与 `StatsPanel`（磁盘统计，已正确用 `t()`）保持一致。

### H4. `EntryCard` 的 `memo` 实际失效——App 侧回调每次 reconcile 都重建

- **文件:行号**：
  - `App.tsx:1655-1698`（`toggleFlag` 依赖 `[reconcile, libraryId]`）
  - `App.tsx:1156-1158`（`handleOpenEntry` 虽然是 `[]` 依赖但仍每次渲染传递）
  - `VirtualizedWall.tsx:152`（把所有回调原样透传给每个 EntryCard）
  - `EntryCard.tsx:688`（`export default memo(EntryCardInner)`）
- **代码证据**：
  ```ts
  // App.tsx
  const toggleFlag = useCallback(async (id, key) => {
    const entry = reconcile?.entries.find(...)   // ← 依赖 reconcile
    ...
  }, [reconcile, libraryId])                      // ← reconcile 每次单条海报更新都变

  // VirtualizedWall.tsx:152
  <EntryCard entry={e} onToggleFlag={onToggleFlag} ... />
  ```
  而 `App.tsx:430-456` 的 `onPosterFetched` 回调里：
  ```ts
  setReconcile((prev) => ({ ...prev, entries: prev.entries.map((e) => ...) }))
  ```
  **每抓到一张新海报就整体替换 `reconcile` 引用**，导致 `toggleFlag`、`handleAddToPlaylist`（依赖 `playlists`）、`handleOpenRelated` 等全部重建，进而 `VirtualizedWall` 重渲染 → 所有可见 `EntryCard` 因 props 引用变化全部重渲染。
- **问题**：批量补齐封面时，每抓一张海报（每秒可能多次），整屏卡片全量重渲染，`EntryCard` 内还有 hover timer / 截帧 hook / 双 `<img>`，肉眼可见卡顿。
- **严重程度**：高（批量补齐 / 实时抓海报场景下直接掉帧）
- **建议**：
  1. `toggleFlag` 改为接收 `(id, key)` 后内部用 `reconcileRef.current` 读最新值（参考 `settingsRef` 已有模式 `App.tsx:217-218`），依赖数组改为 `[]`；
  2. `reconcile` 更新单条 entry 时用不可变方式但保持其他 entry 引用稳定（现在已经是 map 创建新对象，但**数组本身新引用**——`useMemo` 链全部断），考虑用 `Map<id, entry>` 存储；
  3. `EntryCard` 的 props 用 `useMemo` 包裹回调集合，或把 `selectedIds` 改成只传 `Set<string>` 引用（已经是了），但 `selected` 布尔值每卡计算——OK，关键还是回调稳定。

### H5. `VirtualizedWall` 的 `MutationObserver` 从容器一路 observe 到 `document.body`

- **文件:行号**：`VirtualizedWall.tsx:82-87`
- **代码证据**：
  ```ts
  const mo = new MutationObserver(measure)
  let node: HTMLElement | null = el
  while (node && node !== document.body) {
    mo.observe(node, { attributes: true, attributeFilter: ['class'] })
    node = node.parentElement
  }
  ```
- **问题**：注释说"theme-* / density-* 是 class 切换不会触发 ResizeObserver"，但这个实现**观察了从容器到 body 的所有祖先元素 class 变化**。而应用里 Toast 弹出/关闭、hover 状态（`group-hover`）、任何弹窗开关都会给祖先加 class（例如 `privacy-on` 在 `App.tsx:1927` 挂在根 div）。**每次 toast 出现、privacy 切换、滚动条出现/消失，都会触发 `measure()` → `setWidth/setHeight/setMinPosterW` → 整个 `rows/offsets/totalH` useMemo 重算 → 所有可见 EntryCard 重渲染**。
- **严重程度**：高（任何 UI 抖动都会触发整墙重算）
- **建议**：只 observe 挂载点本身 + 用一个明确的 theme class 切换事件（App 已经在 `App.tsx:465-481` 里手动加 `theme-*` class，完全可以在那里 `dispatchEvent` 或改 callback），不要冒泡到 body。

### H6. `App.tsx` 每 60 秒轮询 `settingsGet`，每次都触发整个 App 重渲染

- **文件:行号**：`App.tsx:278-283`
- **代码证据**：
  ```ts
  useEffect(() => {
    const t = setInterval(() => {
      void api.settingsGet().then(setSettings).catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [])
  ```
- **问题**：主进程返回的 settings 对象每次都是新引用（即使内容没变），`setSettings` 直接替换。`App` 的 `settings` 传给 `Sidebar.pendingUpdate`、`SettingsModal`、`Toolbar`（间接）、`VideoDetail` 等。**每 60 秒整个 App 重渲染一次**，包括 `applyTagsOnly`/`sectionList`/`tagCategoriesOrder`/`metaFacets`/`genreFacets`/`specFacets` 这一串 useMemo（依赖 `reconcile`，但 App 重渲染本身会让子组件重渲染）。
- **严重程度**：高（后台无感知卡顿，长期使用累计）
- **建议**：
  1. 对比新旧 settings 的关键字段（`pendingUpdate`、`lastUpdateCheck`），只有变化才 `setSettings`；
  2. 或把 settings 拆分：UI 相关的留在 React state，跨进程后台刷新的字段（pendingUpdate）单独存一个轻量 store。

---

## 二、中严重度（可维护性 / 边界情况）

### M1. `App.tsx` 上帝组件：22 个 useState、20 个 useEffect 全部集中

- **文件:行号**：`App.tsx:98-2781`
- **状态清单**（按业务域分组）：
  | 业务域 | state | 行号 |
  |---|---|---|
  | 库 | `libraries`, `libraryId`, `reconcile`, `allReconciles` | 99, 113, 114, 210 |
  | 设置 | `settings`, `appInfo`, `loaded` | 112, 139, 201 |
  | 筛选 | `filter`, `searchInput`, `selectedTags/Genres/Actors/Studios/Series/Resolutions/Durations/Scores/Years` | 115-136（共 11 个 Set） |
  | 导航 | `view`, `smart`, `viewMode`, `sidebarCollapsed` | 190, 192, 194, 138 |
  | 多选 | `selectMode`, `selectedIds`, `dragSelectMode` | 155, 156, 161 |
  | 播放列表 | `playlists`, `activePlaylistId`, `pendingPlaylistId` | 158, 159, 160 |
  | 扫描 | `scanning`, `progress`, `fetchPaused`, `fetchLogs` | 149, 152, 153, 165 |
  | 详情/编辑 | `editing`, `detail`, `deletePreview`, `deleting` | 143, 144, 146, 148 |
  | 失败重试 | `batchFailures`, `batchFailuresVisible`, `retryingFailures`, `skippedFiles` | 169-175 |
  | 推荐 | `recommendNonce`, `allRandomNonce`, `heroIdx` | 206-226 |
  | Onboard | `onboardOpen`, `onboardLib` | 214-215 |
- **问题**：`store/index.ts:7` 注释里写着"后续可扩展：useFilterStore、useLibraryStore、usePlaylistStore、useVideoStore"——**但实际一行都没做**。所有筛选 Set（11 个）、播放列表、多选状态都在 App，任何一个变化 App 重渲染。
- **严重程度**：中
- **建议**：按业务域拆 4 个 slice：
  - `useFilterStore`：`filter/search/selectedTags/selectedActors/...` 11 个 Set + 操作（toggle/clear），用 `zustand` 并选择器订阅，Sidebar 只订阅自己需要的；
  - `usePlaylistStore`：`playlists/activePlaylistId/pendingPlaylistId`；
  - `useSelectionStore`：`selectMode/selectedIds/dragSelectMode`；
  - `useLibraryStore`：`libraries/libraryId/reconcile/allReconciles`（这个最大，迁移成本高但收益最大）。

### M2. `Sidebar` 接收 80+ 个 props，是 props drilling 的极值

- **文件:行号**：`Sidebar.tsx:26-114`（Props 接口），`App.tsx:1951-2024`（传参处）
- **代码证据**：Props 接口列了 80+ 个字段，包括：
  ```ts
  sections / selectedCategory / onToggleCategory / onClearCategory
  tags / categories / selected / onToggle / onClear
  actorFacets / studioFacets / seriesFacets
  selectedActors / selectedStudios / selectedSeries
  onToggleActor / onToggleStudio / onToggleSeries
  onClearActors / onClearStudios / onClearSeries / onClearMetaFilters
  genreFacets / selectedGenres / onToggleGenre / onClearGenres
  resolutionFacets / durationFacets / scoreFacets / yearFacets
  selectedResolutions / selectedDurations / selectedScores / selectedYears
  onToggleResolution / onToggleDuration / onToggleScore / onToggleYear
  onClearResolutions / onClearDurations / onClearScores / onClearYears / onClearTechFilters
  ...
  ```
- **问题**：每加一个筛选维度就要在 App 和 Sidebar 两边各加一对 props。这是 M1 没拆 store 的直接后果。
- **严重程度**：中
- **建议**：M1 拆 `useFilterStore` 后，`Sidebar` 直接 `useFilterStore(s => s.xxx)` 订阅，props 能砍掉 60+ 个。

### M3. `HomeView` 对 entries 做 4 次全量拷贝 + 排序

- **文件:行号**：`HomeView.tsx:128-142`
- **代码证据**：
  ```ts
  const { recent, topRated, recentPlayed, favorite } = useMemo(() => {
    const withVideo = entries.filter((e) => e.video)
    const sortBy = (key, dir = -1) => [...withVideo].sort((a, b) => (key(a) - key(b)) * dir)
    return {
      recent: sortBy((e) => e.video?.addedAt ?? 0).slice(0, 14),
      topRated: sortBy(scoreOf).filter((e) => scoreOf(e) > 0).slice(0, 14),
      recentPlayed: sortBy((e) => e.video?.lastPlayedAt ?? 0).filter(...).slice(0, 14),
      favorite: withVideo.filter((e) => e.video?.favorite).slice(0, 14)
    }
  }, [entries])
  ```
- **问题**：每次 `entries` 引用变化（即每次 reconcile 更新单条海报），都对全库（数千条）做 4 次 `[...arr].sort()`。O(4·N log N)。
- **严重程度**：中（大库首页加载/刷新时卡顿）
- **建议**：用 `nth_element` 思路（只需 top 14）——`Array.prototype.reduce` 维护一个长度 14 的有序小顶堆，O(N·log14)；或直接在主进程 SQLite 查询时就 `ORDER BY ... LIMIT 14`。

### M4. `HomeView` 用 `setResizeTick` 强制重渲染来处理缩放错乱

- **文件:行号**：`HomeView.tsx:159-171`
- **代码证据**：
  ```ts
  // 快速缩放时强制重渲染，避免布局重绘不及时出现黑边
  const [, setResizeTick] = useState(0)
  useEffect(() => {
    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setResizeTick((t) => t + 1))
    }
    window.addEventListener('resize', onResize)
    ...
  }, [])
  ```
- **问题**：这是 hint 里提到的"缩放页面快速时渲染错乱"的 workaround。根因是海报 `<img>` 用 `object-contain` 但容器宽度变化时浏览器重绘不及时。靠 `setResizeTick` 强刷整个 HomeView（包括所有 row 的 EntryCard）是治标。
- **严重程度**：中
- **建议**：根因修：给 hero 背景 `<img>` 加 `style={{ width: '100%', height: '100%' }}` 配合 CSS `object-fit` + `object-position`；或用 `ResizeObserver` 监听 hero 容器尺寸变化而不是 window resize。

### M5. `App.tsx` 播放列表操作栏硬编码中文（20+ 处）

- **文件:行号**：`App.tsx:2109-2117, 2126-2134, 2144-2162, 2602-2651`
- **代码证据**：
  ```tsx
  <span>选择要添加到「{playlists.find(...)?.name ?? ''}」的影片</span>
  <span>已选 {selectedIds.size} 部</span>
  <button onClick={selectAllVisible}>全选</button>
  <button onClick={() => setSelectedIds(new Set())}>取消全选</button>
  <button onClick={invertSelection}>反选</button>
  <button>取消</button>
  <button onClick={() => void handleAddSelectedToPlaylist()}>添加选中 ({selectedIds.size})</button>
  ...
  <span>{filtered.length} 部影片</span>
  <button>删除影片</button>
  <button>添加影片</button>
  <button>播放全部</button>
  <button>删除列表</button>
  ```
- **问题**：整个播放列表交互栏（添加模式 / 管理模式 / 普通模式三套）全部硬编码中文。`App.tsx:831, 855` 的"已存在同名播放列表"toast 也是中文。
- **严重程度**：中
- **建议**：抽到 `shared/i18n`，与 `t('lock.*')` 系列保持一致。

### M6. `Sidebar` 播放列表区硬编码中文

- **文件:行号**：`Sidebar.tsx:785, 817, 824, 837, 857, 884, 887, 889`
- **代码证据**：
  ```tsx
  <Section title="播放列表" icon="list" defaultOpen={false}>
  <button title="重命名">
  <button title="删除列表">
  <input placeholder="播放列表名称，回车创建" />
  <span>新建播放列表</span>
  <span>磁盘统计</span>
  <button title="观看统计：观看时长/趋势/排行榜">
  <span>观看统计</span>
  ```
- **严重程度**：中（英文界面下半部分全是中文）
- **建议**：补 i18n key。

### M7. `EntryCard` 硬编码中文 + 每次渲染新建 `hoverVideo(entry)` 对象

- **文件:行号**：`EntryCard.tsx:260, 349, 485, 608, 619, 103`
- **代码证据**：
  ```tsx
  // 260 行
  <div ...>已添加</div>
  // 349 行
  <span ...>维基百科</span>
  // 485 行（hover 预览面板里）
  <span ...>帧</span>
  // 608 行
  <MenuItem label="从当前列表移除" ... />
  // 619 行
  <div ...>添加到播放列表</div>

  // 103 行：每次渲染都新建对象
  const v = hoverVideo(entry)
  ```
- **问题**：
  1. 硬编码中文（"已添加"、"帧"、"从当前列表移除"、"添加到播放列表"、"维基百科"）；
  2. `hoverVideo(entry)` 在组件函数体里直接调用，每次渲染创建新 `Video` 对象传给 `<HoverDetail video={v} />`——即使 entry 没变，引用也变，HoverDetail 内部若有 `memo`/`useEffect` 依赖会失效。
- **严重程度**：中
- **建议**：
  1. 文案走 `t()`；
  2. `hoverVideo(entry)` 用 `useMemo(() => hoverVideo(entry), [entry])` 包裹。

### M8. `frameFallback.ts` 主请求逻辑被注释，hook 仍在跑

- **文件:行号**：`lib/frameFallback.ts:86-92`
- **代码证据**：
  ```ts
  // 已禁用：自动截帧兜底会和 preview-task-queue 抢 ffmpeg 资源导致 CPU 爆炸
  // preview-task-queue 启动后会统一处理封面/预览生成
  // if (!hasValidSrc) {
  //   requestFrameFallback(id, (p) => {
  //     if (p) setFallbackPoster(p)
  //   })
  // }
  ```
- **问题**：`useFrameFallback` 仍在 `EntryCard:95`、`ListView:378`、`VideoDetail:396` 三处调用，每次调用都跑一个 `useEffect`（依赖 `[videoId, hasValidSrc]`），但 effect 内部什么都不做（除了清 state）。这是**死代码 + 每次 entry 变化都执行的无效 effect**。
- **严重程度**：中
- **建议**：要么彻底删掉 `useFrameFallback` 和所有调用点，要么把逻辑恢复。当前状态属于"看着有兜底实际没有"的误导性代码。

### M9. `SettingsModal` 1628 行单文件，8 个分类塞一个组件

- **文件:行号**：`SettingsModal.tsx:415-1628`
- **代码证据**：单 `return (...)` JSX 里包含 `general/preview/network/appearance/privacy/storage/update/danger` 8 个 section，每个 section 几十到上百行。
- **问题**：
  1. 任何一个分类的小改动都要在 1600 行文件里滚动定位；
  2. 所有 draft 状态（`lockPwd/lockPwd2/lockMsg/testResult/clearMsg/ffmpegStatus/dataDir/appVersion` 等 15+ 个 useState）都在顶层，切到"通用"分类时其他分类的 state 也在内存里；
  3. `useEffect` 在 `open` 变化时一次性加载所有（ffmpeg 状态、appInfo、updateRes）——`SettingsModal.tsx:446-467`。
- **严重程度**：中
- **建议**：按 `CATEGORIES` 拆成 `<GeneralSection /> / <NetworkSection /> / <PrivacySection /> / ...`，每个 section 自己管理自己的 draft 子状态（比如代理表单只在 network section 里）。顶层只保留 `draft: Settings` + `onSave(patch)`。

### M10. `VideoDetail` 1101 行，混合了 6 种职责

- **文件:行号**：`VideoDetail.tsx:72-1101`
- **统计**：15+ 个 useState/useEffect（grep 命中 22 处 hook 调用）
- **混合的职责**：
  1. 元数据展示 + 编辑入口（`MetaRow`、`formatTech`）；
  2. 封面加载 + 截帧兜底（`coverImgError`、`useFrameFallback`）；
  3. 预览帧生成 + 预览帧 zoom 浮层（`previewUrls`、`zoomUrl`、`zoomGroup`、`zoomIndex`、滚轮切换）；
  4. 元数据自动抓取 + 手动补齐（`forceFetch`、`fetchByUrl`、`fetchingRef` 锁）；
  5. 播放列表添加菜单（`playlistMenuOpen`）；
  6. 相关推荐行（`related` prop）。
- **问题**：`useEffect` 之间有复杂的互斥逻辑（`autoFramedRef`、`fetchingRef`、`autoFramePlanned`、`isHoverDisabledUntil`），阅读成本极高。
- **严重程度**：中
- **建议**：拆 `VideoDetailPoster / VideoPreviewGallery / VideoMetaInfo / VideoDetailActions` 四个子组件，把截帧/抓取互斥逻辑抽到 `useVideoAutoFetch(videoId)` 自定义 hook。

### M11. `index.css` 浅色主题靠 20+ 条 `!important` 覆盖 `.text-white/*`

- **文件:行号**：`index.css:89-109`
- **代码证据**：
  ```css
  .theme-light .text-white { color: #1a1a1a !important; }
  .theme-light .text-white\/100 { color: #1a1a1a !important; }
  .theme-light .text-white\/95 { color: rgba(26,26,26,0.95) !important; }
  ... (一直到 .text-white\/5，共 21 条)
  ```
  还有 `bg-white/*`、`border-white/*`、`ring-white/*` 的覆盖（111-123 行）。
- **问题**：根因是组件直接写 `text-white/70`、`bg-white/5` 而不是用主题变量 `text-ink-*`。这套 `!important` 覆盖非常脆弱：
  1. 新增一个透明度档位（如 `text-white/33`）就要加一条 CSS；
  2. 卡片底部渐变蒙层上的白字（`card-title`、`card-hover`）必须再用 `!important` 强行保持白色（144-152 行），否则浅色主题下渐变蒙层上的白字会被覆盖成深灰看不见。
- **严重程度**：中
- **建议**：长期方向是把 `text-white/X` 逐步替换为 `text-ink-*` 语义类（已经有 ink 变量体系），让浅色主题自然生效，不再依赖 `!important` 覆盖。短期至少把这套覆盖规则集中注释、加 lint 规则禁止新写 `text-white/*`。

### M12. `App.tsx` 的 `sidebarCollapsed` 与 Zustand store 里的 `sidebarCollapsed` 是两套状态

- **文件:行号**：
  - `App.tsx:138` `const [sidebarCollapsed, setSidebarCollapsed] = useState(false)`
  - `App.tsx:1905` `const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), [])`
  - `store/ui.ts:27, 69-70` `sidebarCollapsed: boolean` + `setSidebarCollapsed` + `toggleSidebar`
- **问题**：`store/ui.ts` 用了 `persist` 中间件，本意是持久化侧栏折叠状态（86 行 `partialize` 只 persist `sidebarCollapsed`）。但 **App 根本没用 store 里的 sidebarCollapsed**，而是自己 `useState(false)`，每次启动都重置为 false，localStorage 里的 `yinghai-ui-store` 持久化值被无视。`store/ui.ts:70` 的 `toggleSidebar` 是死代码。
- **严重程度**：中（功能 bug：侧栏折叠状态不持久化）
- **建议**：App 改用 `useUIStore(s => s.sidebarCollapsed)` + `useUIStore(s => s.toggleSidebar)`，删除本地 useState。

### M13. `App.tsx` 多处 `useMemo` 依赖数组包含实际未使用的字段

- **文件:行号**：
  - `App.tsx:978` `sections` useMemo 依赖 `[filtered, filter.sort, filter.groupMode, filter.category]`——`filter.sort` 在函数体内未使用；
  - `App.tsx:752` `filtered` useMemo 依赖 `[applySmart, filter.category, filter.sort, filter.desc, activePlaylistId, pendingPlaylistId, playlists]`——`activePlaylistId/pendingPlaylistId/playlists` 在 `applySmart` 里已处理，这里再依赖一次是冗余；
  - `App.tsx:1110` `hasActiveFilters` 每次渲染都重新计算（没用 useMemo，但依赖项都是原始值，开销小）。
- **严重程度**：中（不影响正确性，但多余依赖会导致不必要的重算）
- **建议**：清理依赖数组，ESLint `react-hooks/exhaustive-deps` 应该能报。

### M14. `App.tsx` 第 2665-2746 行用 IIFE 在 JSX 里做条件渲染

- **文件:行号**：`App.tsx:2665-2746`
- **代码证据**：
  ```tsx
  {(() => {
    const lockedItems = skippedFiles.filter((x) => x.reason === 'locked')
    const missingItems = skippedFiles.filter((x) => x.reason === 'missing')
    return (
      <>
        ... 80 行 JSX ...
      </>
    )
  })()}
  ```
- **问题**：这个"跳过文件"弹窗内联了 80 行 JSX 在 IIFE 里，和 `batchFailures` 弹窗（2524-2597）结构高度重复（都是 fixed 遮罩 + 居中卡片 + 列表 + 底部按钮）。
- **严重程度**：中
- **建议**：抽成 `<SkippedFilesDialog />` 组件，与 `<BatchFailuresDialog />` 共享一个 `<ModalShell>`。

### M15. `App.tsx` 内联 `ProgressPanel` 组件定义在文件底部，与主组件分离

- **文件:行号**：`App.tsx:2807`（`function ProgressPanel(...)`）
- **问题**：`App` 在 2511 行就用了 `<ProgressPanel ... />`，但函数定义在 2807 行。虽然函数提升 OK，但这个组件 90 行（含拖拽位置、日志渲染、状态色）应该独立成文件 `components/ProgressPanel.tsx`。
- **严重程度**：中
- **建议**：拆出去。

### M16. preload 层 `payload as never` 类型不安全

- **文件:行号**：`preload/index.ts:47, 72, 79, 102`
- **代码证据**：
  ```ts
  onPosterFetched: (cb) => {
    const handler = (_e, payload: unknown) => cb(payload as never)
    ipcRenderer.on(IPC.posterFetched, handler)
    ...
  }
  ```
- **问题**：`as never` 让 `cb` 的类型签名可以是任意形状，绕过了 `AppApi` 的类型检查。主进程推送的 payload 形状变化时，渲染端不会有编译错误。
- **严重程度**：中
- **建议**：在 `shared/api-types.ts` 里为每个事件定义 `PosterFetchedPayload / ScanProgressPayload / PreviewTaskEventPayload / WatcherEventPayload`，preload 用 `cb(payload as PosterFetchedPayload)`。

### M17. `App.tsx` 搜索防抖用 `setTimeout` 但依赖数组只看 `searchInput`

- **文件:行号**：`App.tsx:459-462`
- **代码证据**：
  ```ts
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => (f.search === searchInput ? f : { ...f, search: searchInput })), 200)
    return () => clearTimeout(t)
  }, [searchInput])
  ```
- **问题**：功能正确，但每次按键都创建新 timer（虽然 cleanup 会清）。更大的问题是 `searchInput` 和 `filter.search` 是两个 state，输入框显示 `searchInput`（即时），实际过滤用 `filter.search`（200ms 后）——这个双 state 模式虽然注释里说了，但任何中间件（如清空按钮 `Toolbar.tsx:60` `onSearch('')`）必须同时更新两个，否则会出现"输入框空了但还在过滤"的不一致。
- **严重程度**：中
- **建议**：用 `useDeferredValue(searchInput)`（React 18 原生）替代手动双 state。

### M18. `VideoDetail` 的 ESC 键全局监听未考虑输入框聚焦

- **文件:行号**：`VideoDetail.tsx:260-268`
- **代码证据**：
  ```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (zoomUrl) setZoomUrl(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomUrl, onClose])
  ```
- **问题**：用户在"按 URL 抓取"输入框（`urlInput`，148 行）里按 ESC 想取消输入，结果整个详情页关闭了。应该检查 `document.activeElement` 是否是 input/textarea。
- **严重程度**：中
- **建议**：`if ((e.target as HTMLElement).tagName === 'INPUT') return`。

### M19. `App.tsx` 多处用 `window.alert` / `window.prompt` 原生对话框

- **文件:行号**：`App.tsx:1177, 1185, 1210, 1214, 1223, 1241, 1328, 1332`
- **代码证据**：
  ```ts
  window.alert(t('app.noFilePathCannotDelete'))
  const pwd = window.prompt(t('app.privacyLockPrompt'))
  window.alert(t('app.wrongPasswordDelete'))
  ```
- **问题**：Electron 里原生 `alert/prompt` 样式与应用主题完全脱节（系统原生窗口），且阻塞式 UX 差。项目已经有 `ConfirmDeleteModal`、`UserNoticeModal` 等自建模态，应该统一。
- **严重程度**：中
- **建议**：把 `window.prompt` 封装成 `<PasswordPromptModal>`（隐私锁密码输入），`window.alert` 换成 toast 或自建错误弹窗。

---

## 三、低严重度（代码整洁 / 小优化）

### L1. `App.tsx` 内 `BatchToastData` 接口定义在组件函数体内

- **文件:行号**：`App.tsx:1378-1391`
- **问题**：TypeScript 接口会被擦除，运行时无影响，但语义上应该提到模块顶层（与 `FilterState` 44 行并列）。
- **建议**：上移到文件顶部。

### L2. `App.tsx` `showBatchToast` 返回 JSX 但定义为普通函数

- **文件:行号**：`App.tsx:1392-1441`
- **问题**：函数名是 `show*`，实际返回 `void` 但内部构造了一大段 JSX（`<div className="space-y-2">...</div>`）传给 `toast({ detail: ... })`。读起来像普通工具函数，实际是个内联 JSX 工厂。
- **建议**：改名为 `<BatchToastDetail data={...} />` 组件，或至少加注释说明。

### L3. `App.tsx` 常量 `RES_ORDER/DUR_ORDER/SCORE_ORDER` 硬编码中文标签

- **文件:行号**：`App.tsx:94-96`
- **代码证据**：
  ```ts
  const RES_ORDER = ['4K', '2K', '1080p', '720p', '480p', 'SD', '未知']
  const DUR_ORDER = ['30分钟内', '30-60分', '1-2小时', '2-3小时', '3小时以上', '未知']
  const SCORE_ORDER = ['9-10', '8-9', '7-8', '6-7', '6以下', '未评分']
  ```
- **问题**：这些字符串同时作为筛选 facet 的 key 和展示文案。英文界面下"未知/30分钟内/6以下/未评分"不会翻译。
- **建议**：key 用英文 token（`unknown/under30min/below6/unrated`），展示时再 `t()`。

### L4. `SettingsModal` `normalizeProxy` 末尾 trailing comma 加空行

- **文件:行号**：`SettingsModal.tsx:89-91`
- **代码证据**：
  ```ts
      customSourceOrder: normalizeSourceOrder(next.customSourceOrder),

    }
  ```
- **建议**：删掉空行。

### L5. `Toolbar.tsx` 硬编码中文 + console.log 残留

- **文件:行号**：`Toolbar.tsx:84, 87, 117`
- **代码证据**：
  ```tsx
  title="查找内容相同的重复视频，释放磁盘空间"
  重复检测
  onClick={() => { console.log('[batch] menu click force=true'); setBatchMenuOpen(false); onBatchFetch(true) }}
  ```
- **建议**：文案走 i18n；删 console.log。

### L6. `WatchStatsModal` `formatDuration` 硬编码中文单位

- **文件:行号**：`WatchStatsModal.tsx:36-42`
- **代码证据**：
  ```ts
  if (sec < 60) return `${sec}秒`
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟`
  const hours = Math.floor(sec / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
  ```
- **建议**：复用 `StatsPanel.tsx:38-44` 里已经用 `t('stats.hoursUnit')` 的 `fmtDuration`，统一两处实现。

### L7. `EntryCard` 的 `hoverVideo` 与 `resolveEntryPoster` 优先级逻辑重复

- **文件:行号**：
  - `EntryCard.tsx:81-91`（卡片封面优先级）
  - `ListView.tsx:363-374`（ListThumb 封面优先级）
  - `lib/util.ts:60-72`（`resolveEntryPoster`）
- **问题**：三处几乎一样的 `manualPoster ?? detailCover ?? realPoster ?? posterPath` 逻辑。`util.ts` 已经有 `resolveEntryPoster`，但 EntryCard 和 ListThumb 都没用，各自重新实现了一遍。
- **建议**：统一用 `resolveEntryPoster`。

### L8. `VirtualizedWall` 行 key 用 `${e.code}-${ci}`，翻页/排序后可能复用错误

- **文件:行号**：`VirtualizedWall.tsx:151`
- **代码证据**：
  ```tsx
  <div key={`${e.code}-${ci}`} ...>
  ```
- **问题**：`ci` 是行内列索引。如果数据变化导致同一个 code 从第 3 列移到第 1 列，key 变化会强制 React 卸载重挂载（丢失 EntryCard 内部的 img 加载状态、hover timer）。应该只用 `e.code` 或 `e.video.id`。
- **严重程度**：低
- **建议**：`key={e.video?.id ?? e.code}`。

### L9. `App.tsx` `entries.map` 里的 `key={f.id + i}` 用索引兜底

- **文件:行号**：`App.tsx:2554`（batchFailures 列表）
- **代码证据**：
  ```tsx
  {batchFailures.map((f, i) => {
    ...
    <button key={f.id + i} ...>
  ```
- **问题**：`f.id + i` 在 `f.id` 相同时用索引，但 batchFailures 重试后数组顺序变化会导致 key 不稳定。
- **建议**：`key={f.id}`（如果 id 唯一）或 `key={`${f.id}-${i}`}` 明确意图。

### L10. `App.tsx` `useUIStore` 订阅了 12 个字段但没用 `shallow`

- **文件:行号**：`App.tsx:100-111`
- **代码证据**：
  ```ts
  const licenseOpen = useUIStore((s) => s.licenseOpen)
  const setLicenseOpen = useUIStore((s) => s.setLicenseOpen)
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  ... // 共 12 行
  ```
- **问题**：当前是一个个选择器订阅，OK；但如果以后改成 `useUIStore()` 整体订阅就会因 store 任何字段变化都重渲染。保持当前模式即可，或用 `useShallow`（zustand v5）。
- **严重程度**：低（目前没问题，只是提醒）。

### L11. `tailwind.config.cjs` 的 `brand.hover` 未被使用

- **文件:行号**：`tailwind.config.cjs:18-21`
- **代码证据**：
  ```js
  brand: {
    DEFAULT: '#14b8a6',
    hover: '#2dd4bf'
  },
  ```
- **问题**：grep 全工程没有 `bg-brand-hover` / `hover:bg-brand` 用法（hover 态都是 `hover:bg-brand/90` 这种透明度修饰）。`brand.hover` 是死配置。
- **建议**：删除或统一。

### L12. `App.tsx` 第 2979、3027 行 SplashScreen/LockScreen 用 `to-[#ff9db6]` 硬编码粉色渐变

- **文件:行号**：`App.tsx:2979, 3027`；`Toolbar.tsx:38`；`StatsPanel.tsx:83, 125`；`AboutModal.tsx:85`
- **代码证据**：
  ```tsx
  <div className="... from-brand to-[#ff9db6] ...">
  ```
- **问题**：`#ff9db6` 这个粉色在 6 处硬编码，不是主题变量。如果要换品牌色要改 6 个文件。
- **建议**：在 `tailwind.config.cjs` 加 `brand-gradient-end: '#ff9db6'`，或用 CSS 变量。

---

## 四、架构层面的整体建议（按优先级）

### P0（立即做，影响用户感知）
1. **修 H2/H3**：WatchStatsModal 图表主题 + i18n——这是用户打开即看到的显示错误。
2. **修 H1**：ListView 虚拟化——大库用户切到列表模式必卡。
3. **修 H6**：60 秒轮询 settingsGet 加 diff——后台无感知卡顿。
4. **修 H4**：`toggleFlag` 等回调改 ref 模式——批量补齐时整屏重渲染。

### P1（本迭代做，影响可维护性）
5. **拆 `useFilterStore`**：把 11 个 selectedXxx Set + toggle/clear 从 App.tsx 迁出，Sidebar props 从 80+ 砍到 ~20。
6. **修 M12**：sidebarCollapsed 统一到 Zustand（现在两套状态）。
7. **修 H5**：VirtualizedWall 的 MutationObserver 收窄到只观察 theme 切换。
8. **删 M8**：frameFallback 死代码要么恢复要么删掉。

### P2（下一迭代，结构性重构）
9. **拆 `App.tsx`**：按业务域拆 hook：`useLibraryData`（reconcile/allReconciles）、`usePlaylist`、`useSelection`、`useScanProgress`、`useRecommendQueue`。预计能把 App.tsx 从 2900 行降到 ~600 行壳。
10. **拆 `SettingsModal`**：8 个分类各成子组件，draft 子状态下沉。
11. **拆 `VideoDetail`**：封面/预览/元数据/抓取互斥逻辑分离。
12. **清理 i18n 孤岛**：WatchStatsModal / Sidebar 播放列表 / App 播放列表操作栏 / EntryCard 零散中文，全部补 key。

### P3（长期技术债）
13. **`text-white/X` → `text-ink-*`**：逐步替换，最终删掉 index.css 里 21 条 `.theme-light .text-white/*` 的 `!important` 覆盖。
14. **preload 类型化**：把 `as never` 换成具体 payload 类型。
15. **原生 dialog 替换**：`window.alert/prompt` 换成自建模态，统一主题。

---

## 五、亮点（做得好的地方）

1. **`VirtualizedWall` 本身设计正确**：单行虚拟化 + rAF 节流滚动 + OVERSCAN 3，大库海报墙性能是达标的（问题在 H5 的 MutationObserver 放大了重渲染范围）。
2. **`Toast` 模块级单例**（`Toast.tsx:38-45`）：深层组件不需要 prop drilling 就能 `toast(...)`，设计简洁。
3. **`util.ts` 的 `posterUrlCache`**（`util.ts:4, 24`）：5000 条上限防内存泄漏，`?v=N` 版本号设计解决封面覆盖刷新问题。
4. **`SettingsModal.CATEGORIES` 用 getter label**（`SettingsModal.tsx:30-38`）：解决了模块顶层 `t()` 固化导致切语言不更新的问题，注释里还记录了历史 bug。
5. **ECharts dispose 有做**（`WatchStatsModal.tsx:393-396`）：4 个实例在 resize effect cleanup 里统一 dispose，没有内存泄漏。
6. **隐私锁 SplashScreen**（`App.tsx:1915-1922`）：未加载完基础设置前不渲染内容，避免隐私锁闪烁泄露，考虑周到。
7. **`frameFallback.ts` 并发限制**（`frameFallback.ts:28` `MAX_IN_FLIGHT = 2`）：防滚墙瞬间拉起几十个 ffmpeg，思路正确（虽然当前调用被注释了）。

---

*报告完。所有行号基于 2026-09-16 提交的代码。*
