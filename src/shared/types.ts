// 跨主进程/渲染进程的共享类型定义（纯接口，无 Node/DOM 依赖）

/** 数据源标识（新增数据源时只需在这里加一个值） */
export type SourceId = 'moviedb' | 'omdb' | 'openlibrary' | 'justwatch' | 'wikipedia'
export type ImageSource = 'manual' | 'sidecar' | 'ffmpeg' | 'placeholder' | SourceId
export type SortKey = 'title' | 'year' | 'added' | 'lastPlayed' | 'random' | 'score'
/** 浏览页视图模式：竖屏预览墙 / 横屏预览墙 / 纯文件名列表 */
export type ViewMode = 'grid-portrait' | 'grid-landscape' | 'list-filename'
/** 更新检查源 */
export type UpdateSource = 'github' | 'gitee'
export type MediaStatus = 'AVAILABLE' | 'MISSING' | 'INVALID' | 'ERROR'
export type PreviewStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type PreviewTaskType = 'GENERATE_PREVIEW'
export type PreviewQualityMode = 'FAST' | 'STANDARD' | 'HIGH'
export type BackgroundLoad = 'low' | 'standard' | 'high'

/** 媒体库：对应一个被扫描的本地文件夹 + 一个 Excel 片单文件 */
export interface Library {
  id: string
  name: string
  folderPath: string
  /** Excel 片单文件路径（片单/分类/简介/标签的权威来源）；为空则仅按文件夹展示 */
  introExcelPath?: string
  /** 海报图片来源优先级链，越靠前优先级越高 */
  imagePriority: ImageSource[]
  createdAt: number
}

/** 单个视频条目 */
export interface Video {
  id: string
  libraryId: string
  path: string
  fileName: string
  /** 视频所在外文件夹名（用于匹配/封面查找/数据源 搜索的更干净来源） */
  folderName?: string
  title: string
  year?: number
  description?: string
  descriptionSource?: 'manual' | null
  rating?: number
  /** 文档标签（平铺）：有 Excel 片单时 = IntroItem.tags（去重平铺的文档来源标签）；
   *  无片单时 = 空数组或旧数据遗留的 genres。展示 / 搜索 / 筛选的「主标签源」。
   *  配合 tagCategories 字段可以还原结构化分组。
   *  ⚠️ 从 v2.2.13 起，数据源抓取的 genres 不再合并到 tags，改写入独立的 backupTags。 */
  tags: string[]
  /** 文档结构化标签（Excel 分栏「主题/角色/服装/…」分类 → 各自标签列表）；
   *  仅在有条目匹配到 Excel 片单且片单行定义了结构化标签时存在。
   *  详情页按分类分组展示主标签；无分类时退化到 tags 平铺展示。 */
  tagCategories?: Record<string, string[]>
  /** 备用来源标签（数据源 genres）：有文档标签时折叠为一行，点击展开；
   *  无文档标签时作为主标签源使用（tags 空时 UI 自动兜底渲染它）。
   *  v2.2.13 起由 backfillFromDetail 单独写入，不再与 tags 合并去重。 */
  backupTags?: string[]
  /** 解析后的海报本地路径（缓存文件或手动指定文件） */
  posterPath?: string
  posterSource?: ImageSource
  /** FFmpeg 截帧生成的封面路径（与 posterPath 独立保存，供「数据源图/FFmpeg 截图」自由切换） */
  posterPathFfmpeg?: string
  /** 封面缓存失效版本号（仅渲染进程内存使用，不落盘）：posterPath 文件被覆盖但路径不变时自增，
   *  列表/详情页用它给 lm:// URL 加 ?v=N，强制立即刷新封面而不依赖重开/切库 */
  coverVersion?: number
  durationSec?: number
  fileSize?: number
  /** 文件内容指纹（大小 + 头部 64KB 的 sha1），用于"文件哈希去重" */
  contentHash?: string
  /** ffprobe 读取的视频技术参数（编码/分辨率/码率等） */
  techInfo?: TechInfo
  addedAt: number
  lastPlayedAt?: number
  /** 用户收藏（♥），持久化到视频记录 */
  favorite?: boolean
  /** 数据源 详情页抓取的元数据（缓存；缺失时点击卡片时再抓） */
  meta?: MovieMeta
  /** 演员名单（从数据源抓取回填，用于检索/展示；演员维度筛选仍优先用 meta.cast） */
  actors?: string[]
  /** ffmpeg 批量截帧生成的预览图本地路径（横屏预览墙使用），最多 PREVIEW_COUNT 张 */
  previewPaths?: string[]
  /** 预览图缓存失效版本号：重新截帧后自增，前端用它给预览图 URL 加 ?v=N 强制刷新 */
  previewVersion?: number
  mediaStatus?: MediaStatus
  previewStatus?: PreviewStatus
  previewRequestedCount?: number
  previewGeneratedCount?: number
  previewAlgorithmVersion?: string
  previewUpdatedAt?: number
  previewLastError?: string
  /** v2.2.4：reconcile else 分支自动抓 数据源 元数据时的最后尝试时间戳；
   *  7 天内抓过且失败的跳过，避免反复浪费 数据源 配额。缺失字段 = 从未抓过 */
  lastMetaFetchAt?: number

  frameFailedAt?: number
  /** v2.7.x：锁定后批量补齐 / 强制批量补齐都会自动跳过此片（详情页手动补齐不受限），
   *  避免手动修正过的信息被再次抓取覆盖。 */
  locked?: boolean
  /** 锁定时间戳（便于排序/展示；缺失表示从未锁定） */
  lockedAt?: number
  /** Excel 片单「分类」列的单值（如"剧情"、"科幻"），独立字段不进 tagCategories；
   *  详情页 MetaRow 单独展示。无片单或未匹配时为 undefined。v2.6.5 起引入。 */
  introCategory?: string
  /** v2.8.5：地区（Excel 片单权威源，如 中国香港、日本） */
  region?: string
  /** v2.8.5：系列（Excel 片单权威源，如 改编、系列作品、原创） */
  series?: string
  /** v2.9.0：最后播放位置（秒），断点续播用 */
  playbackPositionSec?: number
  /** v2.9.0：播放进度最后更新时间戳 */
  playbackUpdatedAt?: number
  /** v2.9.0：关联 NFO 文件路径（如有） */
  nfoPath?: string
}

export interface PreviewFrameMeta {
  index: number
  timestamp: number
  filePath: string
  width?: number
  height?: number
  qualityScore: number
  sharpness: number
  pHash: string
  algorithmVersion: string
  createdAt: number
}

export interface PreviewManifest {
  mediaId: string
  algorithmVersion: string
  requestedCount: number
  generatedCount: number
  generatedAt: number
  sourceFingerprint?: string
  width?: number
  height?: number
  frames: PreviewFrameMeta[]
}

export interface PreviewTask {
  id: string
  mediaId: string
  taskType: PreviewTaskType
  priority: number
  status: PreviewStatus
  progress: number
  requestedCount: number
  generatedCount: number
  retryCount: number
  algorithmVersion: string
  qualityMode: PreviewQualityMode
  lastError?: string
  errorCode?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
}

export interface PreviewTaskStats {
  active?: PreviewTask
  queued: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  paused: boolean
  workerLimit: number
}

/** 演员头像与角色信息 */
export interface ActorProfile {
  name: string
  /** 本地头像路径（已缓存），缺失时展示名字色块 */
  photo?: string
  /** 饰演角色（TMDb 等数据源提供时显示） */
  character?: string
}

/** 数据源详情页抓取的元数据 */
export interface MovieMeta {
  uid: string
  /** 外部源检索 id（如 MovieDB id / IMDb id / OpenLibrary work key；详情主键、封面缓存 key） */
  externalId: string
  /** 完整标题（含系列等） */
  title: string
  /** 封面原图 URL（数据源） */
  cover?: string
  date?: string
  duration?: string
  director?: string
  studio?: string
  series?: string
  rating?: string
  /** 类别（如 剧情/科幻/喜剧 等） */
  genres: string[]
  /** 演员名（全部演员，男女混合） */
  actors: string[]
  /** 主演名单（统一字段命名；旧数据可能缺失，facet 会回退到 actors） */
  cast?: string[]
  /** 演员详情（头像 + 角色），TMDb 有数据时回填 */
  castProfiles?: ActorProfile[]
  /** 剧情简介 / 概述（来自数据源 overview/Plot/extract/description 等） */
  synopsis?: string
  /** 解析器版本标记：v2 = 当前解析器。旧数据无此字段。 */
  parseVer?: number
  /** 数据来源（旧数据无此字段，默认视为 moviedb） */
  source?: SourceId
  fetchedAt: number
}

/** ffprobe 读取的视频技术参数 */
export interface TechInfo {
  /** 视频流宽度（像素） */
  width?: number
  /** 视频流高度（像素） */
  height?: number
  /** 时长（秒） */
  durationSec?: number
  /** 视频码率（kbps） */
  bitrateKbps?: number
  /** 视频编码，如 H.264 / HEVC */
  videoCodec?: string
  /** 音频编码，如 AAC */
  audioCodec?: string
  /** 平均帧率（fps） */
  fps?: number
  /** 视频编码 profile，如 High / Main / Main10 */
  videoProfile?: string
  /** 视频编码 level，如 4.0 / 5.1 */
  videoLevel?: string
  /** 色彩空间，如 bt709 / bt2020nc */
  colorSpace?: string
  /** 色彩传输特性，如 bt709 / smpte2084 (HDR) / arib-std-b67 (HLG) */
  colorTransfer?: string
  /** 色彩原色，如 bt709 / bt2020 */
  colorPrimaries?: string
  /** HDR 格式：HDR10 / HLG / Dolby Vision / SDR */
  hdrFormat?: 'HDR10' | 'HLG' | 'Dolby Vision' | 'SDR'
  /** 音频声道数，如 2 / 6 / 8 */
  audioChannels?: number
  /** 音频采样率（Hz），如 44100 / 48000 */
  audioSampleRate?: number
  /** 音频码率（kbps） */
  audioBitrate?: number
  /** 音频轨道列表（多音轨） */
  audioTracks?: Array<{ index: number; codec?: string; channels?: number; language?: string; sampleRate?: number }>
  /** 字幕轨道列表 */
  subtitleTracks?: Array<{ index: number; codec?: string; language?: string }>
  /** 文件容器格式，如 matroska / mov / mpegts */
  container?: string
}

/** 代理模式：none 关闭 / http / https / socks4 / socks5 / system 自动读取系统代理 */
export type ProxyMode = 'none' | 'http' | 'https' | 'socks4' | 'socks5' | 'system'

export interface Settings {
  /** 外部播放器路径，为空则用系统默认程序打开 */
  playerPath: string
  /** ffmpeg 可执行文件路径，为空则在 PATH 中查找 */
  ffmpegPath: string
  /** 皮肤：dark 深色 / light 浅色 / system 跟随系统（仅保留一明一暗两种外观） */
  theme: 'dark' | 'light' | 'system'
  /** 海报墙密度：large 大图沉浸 / standard 标准 / compact 高密度 */
  posterDensity: 'large' | 'standard' | 'compact'
  /** 数据源：auto 自动降级；或指定单一源（调试用） */
  dataSource: 'auto' | SourceId
  /** auto 模式下的自定义源优先级；未设置时用推荐顺序 */
  customSourceOrder?: SourceId[]
  /** 被用户关闭（禁用）的数据源；auto 模式下这些源不会被尝试，detail 与海报抓取均跳过 */
  disabledSources?: SourceId[]
  /** OMDb API key（http://www.omdbapi.com/ 注册获取免费额度） */
  omdbKey: string
  /** MovieDB API key（https://www.themoviedb.org 注册获取免费额度） */
  movieDbKey: string
  /** MovieDB 搜索是否包含成人内容（对应 TMDb include_adult；默认 false 排除） */
  includeAdult: boolean
  /** Open Library API key（可选，Open Library 无需 API key） */
  openLibraryKey: string
  /** JustWatch API key（可选，JustWatch 无需 API key） */
  /** 代理模式（取代旧版单一 legacyProxy 字符串） */
  proxyMode: ProxyMode
  /** 代理主机（IP 或域名），system 模式可留空 */
  proxyHost: string
  /** 代理端口 */
  proxyPort: string
  /** 代理认证用户名（可选） */
  proxyUser: string
  /** 代理认证密码（可选） */
  proxyPass: string
  /** 启动时/库变化时自动重扫本库（MD 驱动对账） */
  autoRescan: boolean
  /** 批量抓取并发数（1-8，越大越快但风险高） */
  fetchConcurrency: number
  /** 批量抓取每条之间的间隔毫秒（限速，降低封禁风险，默认 600） */
  fetchIntervalMs: number
  /** 扫描时跳过小于该体积（MB）的视频文件（过滤短视频/预告片；0 = 不过滤） */
  scanMinSizeMB: number
  /** 开机自启 */
  launchAtLogin: boolean
  /** 启动时自动对账当前库 */
  scanOnStartup: boolean
  /** 最小化到系统托盘（关窗不退出） */
  minimizeToTray: boolean
  /** 默认排序方式（浏览页初始排序） */
  defaultSort: SortKey
  /** 隐私护盾默认开启（启动时自动进入隐私模式） */
  privacyDefaultOn: boolean
  /** 删除密码锁：开启后删除视频/媒体库需输入密码验证（防误删/防小孩/防陌生人） */
  lockEnabled: boolean
  /** 扫描富集并发数（1-8：ffprobe 探测 / 截帧等） */
  scanConcurrency: number
  /** 后台预览生成负载：控制有限 worker 数量 */
  previewBackgroundLoad?: BackgroundLoad
  /** 默认预览帧数量，支持 10/15/20/30 或自定义 */
  previewFrameCount?: number
  /** Preview Generator V2 质量模式 */
  previewQualityMode?: PreviewQualityMode
  /** 扫描最小文件大小（MB）；0 = 不限。小于该值的视频不进入媒体库（过滤短视频/预告片） */
  /** 隐私锁密码哈希（SHA-256 salt+password）；为空表示未上锁 */
  lockHash?: string
  /** 隐私锁随机盐（十六进制），与 lockHash 配套 */
  lockSalt?: string
  /** 检查更新时使用的源（GitHub / Gitee） */
  updateSource?: UpdateSource
  /** 自动检查更新频率：关闭 / 每天 / 每周 / 每月。按此频率在启动时自动检测更新 */
  autoUpdateFrequency?: 'off' | 'daily' | 'weekly' | 'monthly'
  /** 上次自动检查更新的时间戳（ms），用于频率判定 */
  lastUpdateCheck?: number
  /** 待处理（可用）更新；为空表示无可用更新或已是最新 */
  pendingUpdate?: {
    version: string
    url: string
    /** 更新紧急程度 */
    urgency?: 'normal' | 'recommended' | 'critical' | 'mandatory'
    /** 发布时间 ISO 字符串 */
    publishedAt?: string
    /** 匹配到的安装包文件名 */
    assetName?: string
    /** 安装包大小（字节） */
    assetSize?: number
  } | null
  /** 用户已选择忽略的对账未收录文件路径列表（不再弹窗/不再进入「未收录」分类） */
  ignoredUnlistedPaths: string[]
  /** 用户须知弹窗已确认（勾选了下次不再显示）；未勾选/未确认则首次启动仍弹 */
  noticeDismissed?: boolean
  /**
   * v2.3.11：不再提示「媒体库根目录无片单 Excel」。
   * 无片单用户（绝大多数）每次对账都会被这条 toast 打断，且它不会自动消失。
   * 只屏蔽「未配置片单」这一类提示，片单解析失败等真实错误仍照常提示。
   */
  suppressIntroExcelNotice?: boolean
  /** v2.3.12：界面语言，zh-CN 中文 / en-US 英文 */
  language?: 'zh-CN' | 'en-US'
  /** v2.4.4：列表页默认展示模式，flat 全库平铺 / grouped 按 Excel 分类分组 */
  listViewMode?: 'flat' | 'grouped'
  /** v2.9.0：文件夹自动监控，检测到新增/删除文件时自动增量扫描 */
  autoWatchFolders?: boolean
  /** v2.9.0：监控事件去抖毫秒数（默认 3000），避免批量拷贝时频繁触发 */
  watchDebounceMs?: number
}

export interface VideoFilter {
  libraryId?: string
  search?: string
  tag?: string
  sort?: SortKey
  desc?: boolean
}

export interface ScanProgress {
  libraryId: string
  total: number
  done: number
  current?: string
  /** v2.2.10：实时抓取事件（每个源尝试一次推一条），渲染层可显示"数据源失败 → 降级下一源"这类过程提示 */
  fetchEvent?: {
    code: string
    src: SourceId | 'batch' | 'skip'
    status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'
    detail?: string
  }
  /** reconcileLibrary 特有：片单加载错误（找不到/解析失败），renderer 收到后弹 toast 或引导向导 */
  introError?: { kind: string; message: string; triedPaths: string[] }
}

export interface OpenResult {
  ok: boolean
  method: 'custom' | 'system'
}

export const DEFAULT_SETTINGS: Settings = {
  playerPath: '',
  ffmpegPath: '',
  theme: 'dark',
  posterDensity: 'standard',
  
  omdbKey: '',
  movieDbKey: '',
  openLibraryKey: '',
  includeAdult: false,
  proxyMode: 'none',
  proxyHost: '',
  proxyPort: '',
  dataSource: 'auto',
  disabledSources: [],
  proxyUser: '',
  proxyPass: '',
  autoRescan: false,
  fetchConcurrency: 2,
  fetchIntervalMs: 600,
  scanMinSizeMB: 0,
  launchAtLogin: false,
  scanOnStartup: true,
  minimizeToTray: false,
  defaultSort: 'title',
  privacyDefaultOn: false,
  lockEnabled: false,
  scanConcurrency: 4,
  previewBackgroundLoad: 'low',
  previewFrameCount: 20,
  previewQualityMode: 'STANDARD',
  updateSource: 'gitee',
  autoUpdateFrequency: 'off',
  pendingUpdate: null,
  ignoredUnlistedPaths: [],
  noticeDismissed: false,
  suppressIntroExcelNotice: false,
  language: 'zh-CN',
  listViewMode: 'flat',
  autoWatchFolders: false,
  watchDebounceMs: 3000
}

/** 默认海报来源优先级：手动 > 同名图 > moviedb > omdb > openlibrary > justwatch > wikipedia > 截帧 > 占位 */
export const DEFAULT_IMAGE_PRIORITY: ImageSource[] = [
  'manual',
  'sidecar',
  'moviedb',
  'omdb',
  'openlibrary',
  'justwatch',
  'wikipedia',
  'ffmpeg',
  'placeholder'
]

// ---------- Excel 片单解析结果 ----------

/** Excel 片单中的单条影片信息（名字=externalId，简介，标签） */
export interface IntroItem {
  /** externalId / 文件名匹配键，如 SONE-560 */
  code: string
  /** 简介正文 */
  description: string
  /** 标签（平铺去重，兼容旧格式；新格式为各分类标签合并） */
  tags: string[]
  /** 结构化标签：分类 → 标签列表（新格式 `**标签**：` 块解析；旧格式无此块为空） */
  tagCategories?: Record<string, string[]>
  /** 推荐评分（Excel 片单中的评分列，0-10 分；权威，覆盖数据源） */
  score?: number
  /** Excel 片单「分类」列的单值，如 "剧情"、"科幻"，独立于 tagCategories */
  category?: string
  /** v2.8.5：Excel 片单「年份」列，权威覆盖文件名提取 */
  year?: number
  /** v2.8.5：Excel 片单「地区」列，如 中国香港、日本 */
  region?: string
  /** v2.8.5：Excel 片单「系列」列，如 改编、系列作品、原创 */
  series?: string
  /** 原始行文本 */
  raw: string
}

/** md 中的一个分类分组 */
export interface IntroCategory {
  name: string
  /** 分类出现顺序，用于稳定排序 */
  order: number
  items: IntroItem[]
}

/** 整份 Excel 片单的解析结果 */
export interface IntroDoc {
  categories: IntroCategory[]
  totalCount: number
}

// ---------- 对账展示（Excel 片单驱动 + 文件夹对账） ----------

/** 海报墙展示条目 */
export interface DisplayEntry {
  kind: 'matched' | 'missing'
  /** 所属分类名（来自 md） */
  category: string
  /** 分类顺序，用于排序 */
  order: number
  /** externalId / 文件名匹配键 */
  code: string
  /** 展示标题（默认等于 code） */
  title: string
  description: string
  tags: string[]
  /** 结构化标签（文档分类），供侧栏按文档类别分组展示 */
  tagCategories?: Record<string, string[]>
  /** 推荐评分（md 权威，覆盖 数据源） */
  score?: number
  /** 匹配到磁盘文件时的视频记录（用于海报与播放）；缺失时为 undefined */
  video?: Video
}

/** 文件夹存在但未收录进 md 的文件 */
export interface UnlistedFile {
  fileName: string
  path: string
}

/** 文件名广告清理的预览项 */
export interface RenamePreviewItem {
  path: string
  oldName: string
  newName: string
}

/** 一次对账的结果 */
export interface ReconcileResult {
  libraryId: string
  /** 已分类的展示条目（含匹配到文件的与 md 有但文件缺失的） */
  entries: DisplayEntry[]
  /** 文件夹存在但 md 未收录的文件 */
  unlisted: UnlistedFile[]
  stats: {
    /** md 中条目总数 */
    mdCount: number
    /** md 条目前在文件夹中找到文件的 */
    matched: number
    /** md 有但文件夹缺失文件的 */
    missing: number
    /** 文件夹有但 md 未收录的 */
    unlisted: number
  }
  generatedAt: number
}

// ---------- 标签分层 helpers（共享给主进程与渲染器）----------

/** Excel tagCategories 里这些分类是元数据/简介/评分, 不是标签, 统一跳过不收集
 *  导出给 UI 层去重渲染时共享, 避免前端自己硬编码一份同名单. */
export const NON_TAG_CATEGORY_NAMES = new Set([
  '分类', 'category',
  '推荐评分', '评分', '简介', '说明', '备注', 'note', 'comment',
  '推荐', '描述', 'desc', 'description', 'summary'
])

/** 视频的「主标签源」扁平化列表：
 *  - 有文档结构化 tagCategories → 优先按分类顺序合并去重
 *  - 退化 → tags（片单平铺标签或旧数据）
 *  UI 筛选/搜索/侧栏 facet 均以它作为「主标签」。
 *  内部统一跳过非标签分类(NON_TAG_CATEGORY_NAMES)并 trim 空字符串,
 *  避免把简介/评分文本当标签渲染导致 React key 冲突 + 视觉错乱. */
export function primaryTags(v: { tags?: string[]; tagCategories?: Record<string, string[]> }): string[] {
  const cats = v.tagCategories
  if (cats && Object.keys(cats).length > 0) {
    const set = new Set<string>()
    for (const [name, list] of Object.entries(cats)) {
      if (NON_TAG_CATEGORY_NAMES.has(name.trim())) continue   // 跳过简介/评分等元数据分类
      for (const t of (list ?? [])) {
        const trimmed = t?.trim() ?? ''
        if (trimmed) set.add(trimmed)                         // trim + 去空字符串
      }
    }
    if (set.size) return [...set]
  }
  return (v.tags ?? []).map(t => t?.trim() ?? '').filter(Boolean)
}

/** DisplayEntry 的「主标签源」扁平化列表（优先 entry.tagCategories，退化 entry.tags）。
 *  侧栏 facet / 搜索 / 标签筛选用它代替直接读 entry.tags，做到有结构化标签就用结构化。 */
export function entryPrimaryTags(e: { tags: string[]; tagCategories?: Record<string, string[]> }): string[] {
  return primaryTags({ tags: e.tags, tagCategories: e.tagCategories })
}

/** 判断视频/条目是否定义了「文档标签」（不管平铺或结构化，任一有即 true）。
 *  注意: tagCategories 全是简介/评分等元数据分类 → 算没有文档标签.
 *  UI 层用它决定是否把 backupTags 折叠为备用展示, 而不是作为主标签. */
export function hasDocTags(v: { tags?: string[]; tagCategories?: Record<string, string[]> }): boolean {
  const cats = v.tagCategories
  if (cats && Object.keys(cats).length > 0) {
    // 必须至少有一个分类是非 NON_TAG_CATEGORY_NAMES, 且有实际 tag 值
    for (const [name, list] of Object.entries(cats)) {
      if (NON_TAG_CATEGORY_NAMES.has(name.trim())) continue
      if ((list ?? []).some(t => (t?.trim() ?? ''))) return true
    }
  }
  return Array.isArray(v.tags) && v.tags.some(t => (t?.trim() ?? ''))
}

/** 最终用于展示的「所有标签」，用于搜索兜底（搜备份标签也能命中）时扁平展开；
 *  顺序：文档结构化 + 文档平铺 + 备份标签，保证用户看到的优先级一致。 */
export function flattenAllTags(v: { tags?: string[]; tagCategories?: Record<string, string[]>; backupTags?: string[] }): string[] {
  const set = new Set<string>()
  const p = primaryTags({ tags: v.tags, tagCategories: v.tagCategories })
  for (const t of p) set.add(t)
  for (const t of v.backupTags ?? []) set.add(t)
  return [...set]
}

// ---------- v2.9.0 新增类型 ----------

/** 播放列表 */
export interface Playlist {
  id: string
  name: string
  /** 视频 id 列表（有序） */
  videoIds: string[]
  createdAt: number
  updatedAt: number
}

/** 重复视频分组（按 contentHash 分组） */
export interface DuplicateGroup {
  /** 分组 key（contentHash） */
  key: string
  /** 组内视频列表 */
  videos: Array<{ id: string; title: string; path: string; fileSize?: number; addedAt: number }>
  /** 组内总大小（字节） */
  totalSizeBytes: number
  /** 可释放空间（保留一份后可删除的字节数） */
  wastedBytes: number
}

/** NFO 文件解析结果（Kodi/Jellyfin/Plex 标准格式） */
export interface NfoData {
  title?: string
  originaltitle?: string
  sorttitle?: string
  year?: number
  plot?: string
  outline?: string
  tagline?: string
  rating?: number
  votes?: number
  mpaa?: string
  premiered?: string
  runtime?: number
  genres?: string[]
  tags?: string[]
  actors?: Array<{ name?: string; role?: string; thumb?: string }>
  director?: string
  writer?: string
  studio?: string
  country?: string
  set?: string
  /** 各数据源唯一 ID，如 imdb、tmdb */
  uniqueids?: Record<string, string>
  /** 封面图相对路径 */
  thumb?: string
  /** fanart 背景图相对路径 */
  fanart?: string
}