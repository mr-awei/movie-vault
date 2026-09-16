import type {
  MovieMeta,
  SourceId,
  Library,
  Settings,
  Video,
  VideoFilter,
  ScanProgress,
  OpenResult,
  ReconcileResult,
  RenamePreviewItem,
  PreviewTask,
  PreviewTaskStats,
  Playlist,
  DuplicateGroup,
  NfoData,
  WatchHistoryEntry,
  WatchStats
} from './types'

/** videoFetchDetail 返回：成功（含详情 + 来源）或失败（含原因） */
export type FetchDetailResult =
  | { ok: true; detail: MovieMeta; source: SourceId }
  | { ok: false; error: string }

/** videoRenameFile 返回：成功（含改名后的 video + 新旧名）或失败（原因，不抛异常） */
export type RenameFileResult =
  | { ok: true; video: Video; oldName: string; newName: string }
  | { ok: false; error: string }

/** 批量补齐（libraryFetchAll）结果统计 */
export interface BatchFetchResult {
  /** 成功部数 */
  ok: number
  /** 失败部数 */
  failed: number
  /** 成功来源分布（按数据源统计） */
  bySource: Record<SourceId, number>
  /** 失败明细（id + 标题 + 原因） */
  failures: Array<{ id: string; title: string; reason: string }>
  /** 是否因连续失败自动停止 */
  stopped?: boolean
  /** 停止时剩余未处理部数 */
  remaining?: number
  /**
   * v2.3.11：本库仍无封面的部数（不含刚截帧失败被冷却的损坏文件）。
   * 兜底截帧每轮上限 200 部，用户需要知道"要不要再来一轮"。
   */
  remainingNoPoster?: number
  /**
   * v2.7.x：本次批量补齐/强制批量补齐中因「锁定」而自动跳过的影片明细。
   * 结束后 UI 需要明确告知用户哪些文件被跳过。
   */
  lockedSkipped?: Array<{ id: string; title: string }>
  /**
   * v2.7.x：本次因「文件已不存在」被跳过的失效记录明细。
   * 这些记录通常来自用户在资源管理器里改名/移动/删除文件，会在下次扫描时被自动清理。
   */
  missingSkipped?: Array<{ id: string; title: string }>
}

/** 应用信息（关于模块展示） */
export interface AppInfo {
  /** 应用版本号（package.json version） */
  version: string
  /** Electron 版本 */
  electron: string
  /** Node.js 版本 */
  node: string
  /** Chromium 版本 */
  chrome: string
  /** 用户数据目录（data.json / posters 所在） */
  dataDir: string
  /** 最近一版更新日志正文（中文：更新日志.md 顶部 / 英文：CHANGELOG.en.md 顶部） */
  changelog: string
}

/** 匹配到的发布资源信息 */
export interface UpdateAssetInfo {
  /** 资源文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
  /** 直接下载链接 */
  downloadUrl: string
  /** 资源 Content-Type */
  contentType?: string
}

/** 检查更新结果：基于版本号 + 资源 + 元数据的多维特征判定 */
export interface UpdateCheckResult {
  /** 实际查询的源 */
  source: 'github' | 'gitee'
  /** 当前安装版本 */
  currentVersion: string
  /** 远端最新版本号 */
  latestVersion: string
  /** 远端版本是否比当前新 */
  hasUpdate: boolean
  /** 最新版本发布页 / 下载页链接 */
  releaseUrl: string
  /** 更新说明（release notes，截断） */
  notes?: string
  /** 发布时间 ISO 字符串 */
  publishedAt?: string
  /** 是否为预发布版本 */
  isPrerelease?: boolean
  /** 是否为草稿（通常不应向用户推送） */
  isDraft?: boolean
  /** 是否找到了匹配当前平台（Windows x64 Setup）的安装包资源 */
  assetMatched?: boolean
  /** 匹配到的安装包信息 */
  asset?: UpdateAssetInfo
  /** 校验文件信息（如 .sha256 / .blockmap） */
  checksumAsset?: UpdateAssetInfo
  /** 更新紧急程度：normal=普通 recommended=推荐 critical=重要 mandatory=强制（低于 minimumVersion） */
  urgency?: 'normal' | 'recommended' | 'critical' | 'mandatory'
  /** 发布页声明的最低要求版本；当前版本低于此值时 urgency 自动升级为 mandatory */
  minimumVersion?: string
  /** 判定置信度：full=完整（版本+资源均匹配） partial=仅版本（无对应资源） none=无法判定 */
  confidence?: 'full' | 'partial' | 'none'
  /** 出错信息（网络/解析失败） */
  error?: string
  /** 是否发生了源回退（首选源失败自动切换另一源） */
  fallback?: boolean
}

/** 渲染进程通过 window.api 调用的类型化接口（主进程实现） */
export interface AppApi {
  /** 复制文本到剪贴板（主进程执行） */
  copyText(text: string): Promise<void>
  libraryList(): Promise<Library[]>
  libraryAdd(input: Omit<Library, 'id' | 'createdAt'>): Promise<Library>
  libraryRemove(id: string): Promise<void>
  libraryUpdate(id: string, patch: Partial<Library>): Promise<Library | null>
  /** 扫描库（videoScan + libraryReconcile 合并调用，只推一轮连续进度） */
  libraryScanAndReconcile(libraryId: string): Promise<ReconcileResult>
  /** 按 Excel 片单对账文件夹，返回分类展示数据 */
  libraryReconcile(libraryId: string): Promise<ReconcileResult>
  /** 读上次对账结果的磁盘缓存（秒出，无缓存返回 null） */
  libraryReconcileCache(libraryId: string): Promise<ReconcileResult | null>
  videoList(filter?: VideoFilter): Promise<Video[]>
  videoGet(id: string): Promise<Video | null>
  videoUpdate(id: string, patch: Partial<Video>): Promise<Video | null>
  /** v2.7.x：批量设置锁定状态（一次落盘），返回实际更新条数 */
  videoLockMany(ids: string[], locked: boolean): Promise<number>
  videoScan(libraryId: string): Promise<Video[]>
  videoOpen(id: string): Promise<OpenResult>
  videoOpenPlaylist(videos: Video[]): Promise<{ ok: boolean; method: string; count: number }>
  videoRegeneratePoster(id: string): Promise<Video | null>
  /** 从数据源按检索词抓取封面并缓存到该视频 */
  videoFetchPoster(id: string): Promise<Video | null>
  /** 批量补齐信息（多源数据源）；force=true 忽略缓存逐部重抓，返回统计 */
  libraryFetchAll(libraryId: string, force?: boolean): Promise<BatchFetchResult>
  libraryFetchPause(): Promise<void>
  libraryFetchResume(): Promise<void>
  libraryFetchStop(): Promise<void>
  /** 抓取详情页元数据（多源数据源），返回是否成功及来源 / 失败原因。
   *  v2.6.5：idOverride = 手工输入的检索词/ID（文件名/标题识别不出时的兜底入口）。 */
  videoFetchDetail(id: string, idOverride?: string): Promise<FetchDetailResult>
  /** 详情页「按网址更新」：粘贴任一数据源网页 URL 直连抓取元数据，返回是否成功及来源 / 失败原因 */
  videoFetchByUrl(id: string, url: string): Promise<FetchDetailResult>
  /** v2.6.5：编辑标题后同步修改磁盘文件名（保留扩展名），失败返回原因（不抛异常） */
  videoRenameFile(id: string, newTitle: string): Promise<RenameFileResult>
  /** 用 ffprobe 读取视频技术参数（分辨率/编码/码率/帧率/时长），并缓存到视频 */
  videoProbe(id: string): Promise<Video | null>
  /** v2.3.7 批量补齐当前库视频时长（ffprobe 读时长写 techInfo），返回处理统计 */
  libraryBatchProbe(libraryId: string): Promise<{ ok: number; failed: number; skipped: number }>
  /** 预览：库内可安全改名的文件（清理文件名广告） */
  libraryPreviewRenames(libraryId: string): Promise<RenamePreviewItem[]>
  /** 执行改名，返回成功数与失败列表 */
  libraryApplyRenames(
    libraryId: string,
    items: { path: string; newName: string }[]
  ): Promise<{ ok: number; failed: { path: string; reason: string }[] }>
  /** 测试当前代理配置能否连通数据源站点，返回连通性结果 */
  proxyTest(settings: Settings): Promise<{ ok: boolean; status?: number; error?: string }>
  /** 清空海报缓存目录（仅删除缓存文件，不动数据） */
  cacheClear(): Promise<{ ok: boolean; removed: number }>
  /** ffmpeg 状态检测：custom（手动指定）/ system（系统 PATH）/ bundled（捆绑版）/ missing。
   *  检测到系统版时主进程自动删除捆绑版 ffmpeg 释放磁盘（62MB）。 */
  ffmpegStatus(): Promise<{
    source: 'custom' | 'system' | 'bundled' | 'missing'
    path?: string
    bundledRemoved?: boolean
    note?: string
  }>
  /** 卸载应用（危险操作）：弹出应用内确认框后调用 NSIS 卸载程序。
   *  keepUser=true 保留用户数据；false 则在卸载流程中删除用户数据（受保护脚本安全校验） */
  appUninstall(keepUser: boolean): Promise<{ ok: boolean; error?: string }>
  /** 监听：批量抓取时每抓到一张实时回调 {videoId, posterPath} */
  onPosterFetched(cb: (p: { videoId: string; posterPath: string }) => void): () => void
  /** 在系统文件管理器中显示并选中该文件（用于改名） */
  shellRevealInFolder(path: string): Promise<void>
  settingsGet(): Promise<Settings>
  settingsSet(patch: Partial<Settings>): Promise<Settings>
  dialogSelectFolder(): Promise<string | null>
  /** 选择单个文件（Excel 片单 / 其他） */
  dialogSelectFile(): Promise<string | null>
  /** 用系统默认程序打开文件 / 文件夹（如打开 Excel 片单供编辑） */
  openPath(path: string): Promise<void>
  /** 应用信息（版本 / 运行环境 / 数据目录 / 更新日志） */
  appInfo(): Promise<AppInfo>
  /** 用默认浏览器打开外部链接（官网 / 仓库 / issue） */
  openExternal(url: string): Promise<void>
  /** 设置 / 修改隐私锁密码 */
  lockSet(password: string): Promise<void>
  /** 校验隐私锁密码，返回是否正确 */
  lockVerify(password: string): Promise<boolean>
  /** 清除隐私锁（需校验当前密码，密码错误返回 { ok:false, error }） */
  lockDelete(password: string): Promise<{ ok: boolean; error?: string }>
  /** 退出应用（密码错误超次 / 锁界面退出用） */
  appQuit(): Promise<void>
  /** 按所选源（GitHub / Gitee）检查更新，返回最新版本与发布链接 */
  updateCheck(): Promise<UpdateCheckResult>
  /** 用 ffmpeg 随机截帧生成封面 + 预览图（1 封面 + 15 预览），回填视频记录 */
  videoGeneratePreviews(id: string): Promise<Video | null>
  previewTaskStats(): Promise<PreviewTaskStats>
  previewTaskEnqueue(id: string, requestedCount?: number): Promise<PreviewTask>
  previewTaskPause(): Promise<void>
  previewTaskResume(): Promise<void>
  previewTaskCancel(taskId: string): Promise<void>
  previewTaskRetry(taskId: string): Promise<PreviewTask | null>
  onPreviewTaskEvent(cb: (p: { type: string; stats?: PreviewTaskStats; task?: PreviewTask; mediaId?: string; posterPath?: string; previewPaths?: string[] }) => void): () => void
  /** 无封面时截 1 帧视频画面作为封面（懒加载兜底），成功返回本地路径并回填视频记录，失败/无 ffmpeg 返回 null */
  videoFrameFallback(id: string): Promise<string | null>
  /** 把某张截帧预览帧设为封面：复制为 <id>.jpg 并更新记录（posterSource='ffmpeg'），成功返回更新后的视频 */
  videoSetPreviewAsCover(id: string, previewPath: string): Promise<Video | null>
  /**
   * 把视频文件（可能连带所在目录）**挪到系统回收站**。
   * 智能判定：若视频所在目录除了它本身外**没有任何其他文件**，
   * 则整个目录一并挪到回收站；否则只挪视频文件本身。
   * 用 Electron `shell.trashItem`（Windows 回收站 / macOS Trash / Linux trash），
   * **不彻底删除**——用户可从回收站恢复。
   * 不动 data.json，调用方负责触发扫描以更新库。
   */
  videoDeleteFile(id: string): Promise<{
    ok: boolean
    /** 实际删除的路径（视频文件路径） */
    path?: string
    /** 是否连同所在目录一并删除（"种子文件夹"场景） */
    deletedDir?: boolean
    /** 删除的目录路径（仅 deletedDir=true 时有） */
    dirPath?: string
    /** 一并清理的关联缓存文件数（封面/预览图/ffmpeg 截图/数据源信息图） */
    removedCache?: number
    /** 是否已删除 data.json 中的视频记录（含全部文本元数据：演员/时长/导演等） */
    removedRecord?: boolean
    error?: string
  }>
  /** 预检 video 所在目录（不删除任何文件），供删除前确认"会删什么" */
  videoInspectForDelete(id: string): Promise<{
    ok: boolean
    filePath?: string
    dirPath?: string
    /** 同目录其他视频文件数（不含本视频） */
    otherVideoCount?: number
    /** 同目录其他文件数（非视频） */
    otherFileCount?: number
    error?: string
  }>
  /**
   * 切换封面来源：'data' = 数据源图（各数据源缓存，没有则抓取）；
   * 'ffmpeg' = FFmpeg 随机截帧图（没有则生成）。两套图片独立保存，可自由来回切换。
   */
  videoSwitchPoster(
    id: string,
    source: 'data' | 'ffmpeg'
  ): Promise<{ ok: boolean; posterPath?: string; posterSource?: string; error?: string }>
  onScanProgress(cb: (p: ScanProgress) => void): () => void
  /** 仅扫描媒体库影片清单（不弹保存对话框、不写文件），供向导打开时自动加载 */
  libraryGetCodes(libraryId: string): Promise<{ count: number; codes: string[] }>
  /** 导出影片清单为 txt 或 xlsx（模板：带表头留空供用户填分类/评分/简介等） */
  libraryExportCodes(id: string, format: 'txt' | 'xlsx'): Promise<{ ok: boolean; path?: string; error?: string }>
  /** 返回内置规范文件路径（中文：通用评分与简介规范.md / 英文：Scoring_and_Synopsis_Guide.en.md） */
  specGet(): Promise<{ path: string }>
  // ---------- v2.9.0 新增 API ----------
  libraryFindDuplicates(libraryId: string): Promise<DuplicateGroup[]>
  videoReadNfo(id: string): Promise<{ ok: boolean; nfo?: NfoData; error?: string }>
  videoWriteNfo(id: string): Promise<{ ok: boolean; path?: string; error?: string }>
  playlistList(): Promise<Playlist[]>
  playlistCreate(name: string): Promise<Playlist>
  playlistDelete(id: string): Promise<void>
  playlistRename(id: string, name: string): Promise<Playlist | null>
  playlistAddVideo(id: string, videoId: string): Promise<Playlist | null>
  playlistRemoveVideo(id: string, videoId: string): Promise<Playlist | null>
  playlistReorder(id: string, videoIds: string[]): Promise<Playlist | null>
  videoUpdatePlaybackPosition(id: string, positionSec: number): Promise<Video | null>
  watchHistoryList(limit?: number): Promise<WatchHistoryEntry[]>
  watchHistoryStats(): Promise<WatchStats>
  watchHistoryClear(): Promise<void>
  onWatcherEvent(cb: (p: { type: 'changed' | 'added' | 'removed'; libraryId: string; paths: string[] }) => void): () => void
}
