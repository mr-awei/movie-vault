// 类型化 IPC 通道名集合（主进程 handle / 渲染进程 invoke 共用）

export const IPC = {
  // 媒体库
  libraryList: 'library:list',
  libraryAdd: 'library:add',
  libraryRemove: 'library:remove',
  libraryUpdate: 'library:update',
  // 扫描 + 对账（一次调用合并 scanLibrary + reconcileLibrary，进度条只显示一轮连续进度）
  libraryScanAndReconcile: 'library:scanAndReconcile',
  // 对账（MD 驱动 + 文件夹对账）
  libraryReconcile: 'library:reconcile',
  // 对账结果磁盘缓存（上次 reconcile 的快照，启动/切库先秒出，后台再全量对账刷新）
  libraryReconcileCache: 'library:reconcileCache',
  // 视频
  videoList: 'video:list',
  videoGet: 'video:get',
  videoUpdate: 'video:update',
  // v2.7.x：批量设置锁定状态（一次落盘）
  videoLockMany: 'video:lockMany',
  videoScan: 'video:scan',
  videoOpen: 'video:open',
  videoRegeneratePoster: 'video:regeneratePoster',
  // 数据源封面抓取
  videoFetchPoster: 'video:fetchPoster',
  // 数据源补齐所有信息：批量抓封面 + 详情（演员/时长/关键截图等），标签来自 MD
  libraryFetchAll: 'library:fetchAll',
  libraryFetchPause: 'library:fetchPause',
  libraryFetchResume: 'library:fetchResume',
  libraryFetchStop: 'library:fetchStop',
  // 数据源详情抓取
  videoFetchDetail: 'video:fetchDetail',
  // 详情页「按网址更新」：粘贴任一数据源网页 URL 直连抓取
  videoFetchByUrl: 'video:fetchByUrl',
  // 编辑标题后同步修改磁盘文件名（v2.6.5）
  videoRenameFile: 'video:renameFile',
  // ffmpeg 兜底截帧：随机截 1 张封面 + 15 张预览图
  videoGeneratePreviews: 'video:generatePreviews',
  // ffmpeg 单帧兜底：无封面时截 1 帧视频画面作为封面（列表懒加载用，返回本地路径或 null）
  videoFrameFallback: 'video:frameFallback',
  // 截帧预览帧 → 设为封面：把某张预览帧复制为封面文件 <id>.jpg 并更新记录
  videoSetPreviewAsCover: 'video:setPreviewAsCover',
  previewTaskStats: 'preview:stats',
  previewTaskEnqueue: 'preview:enqueue',
  previewTaskPause: 'preview:pause',
  previewTaskResume: 'preview:resume',
  previewTaskCancel: 'preview:cancel',
  previewTaskRetry: 'preview:retry',
  previewTaskEvent: 'preview:event',
  // ffprobe 读取视频技术参数
  videoProbe: 'video:probe',
  // v2.3.7 批量补齐视频时长：对当前库所有缺时长视频 ffprobe 读取时长写 techInfo
  libraryBatchProbe: 'library:batchProbe',
  // 从磁盘删除视频文件（按需连带删除所在目录）
  videoDeleteFile: 'video:deleteFile',
  // 预检：列出 video 所在目录的其他文件数，供删除前确认
  videoInspectForDelete: 'video:inspectForDelete',
  // 封面来源切换：数据源图（各数据源）↔ FFmpeg 截帧图
  videoSwitchPoster: 'video:switchPoster',
  // 文件批量改名（清理文件名广告）
  libraryPreviewRenames: 'library:previewRenames',
  libraryApplyRenames: 'library:applyRenames',
  // 代理测试连接
  proxyTest: 'proxy:test',
  // 清理海报缓存目录
  cacheClear: 'cache:clear',
  // ffmpeg 状态检测（系统 / 捆绑 / 缺失）；检测到系统版时删除捆绑版释放磁盘
  ffmpegStatus: 'ffmpeg:status',
  // 卸载应用（危险操作）
  appUninstall: 'app:uninstall',
  // 事件：批量抓取时，每抓到一张实时推送（main -> renderer）
  posterFetched: 'poster:fetched',
  // 设置
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  // 系统对话框
  dialogSelectFolder: 'dialog:selectFolder',
  dialogSelectFile: 'dialog:selectFile',
  // 用系统默认程序打开路径（文件或文件夹）
  openPath: 'system:openPath',
  // 复制文本到剪贴板（主进程执行，sandbox preload 无法直接访问 clipboard 模块）
  copyText: 'system:copyText',
  // 用默认浏览器打开外部链接（官网 / 仓库 / issue）
  openExternal: 'system:openExternal',
  // 应用信息（版本号等）
  appInfo: 'app:info',
  // 隐私锁：设置/清除密码、校验密码、退出应用
  lockSet: 'lock:set',
  lockVerify: 'lock:verify',
  lockDelete: 'lock:delete',
  appQuit: 'app:quit',
  // 检查更新：按所选源（GitHub / Gitee）查询最新版本
  updateCheck: 'update:check',
  // 在文件管理器中显示并选中文件
  shellRevealInFolder: 'system:revealInFolder',
  // 事件（主进程 -> 渲染进程）
  scanProgress: 'scan:progress',
  // 片单变化事件（预留）
  // 仅扫描媒体库影片清单（不弹保存对话框、不写文件，供向导打开时自动加载）
  libraryGetCodes: 'library:getCodes',
  // 导出影片清单为 txt 或 xlsx（模板：带 编号/分类/推荐评分/简介 表头）
  libraryExportCodes: 'library:exportCodes',
  // 返回内置规范文件路径（中文：通用评分与简介规范.md / 英文：Scoring_and_Synopsis_Guide.en.md）
  specGet: 'system:specGet'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
