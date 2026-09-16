import { app, BrowserWindow, Menu, protocol, Tray, nativeImage, type NativeImage } from 'electron'
import path from 'node:path'
import { promises as fs, appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { registerIpc, runUpdateCheck } from './lib/ipc'
import * as repo from './lib/repo'
import { startWatching, stopAllWatchers } from './lib/watcher'
import { getDb, closeDb } from './lib/db'
import { startPreviewTaskQueue, stopPreviewTaskQueue } from './lib/preview-task-queue'
import { runtime, applyRuntimeSettings } from './lib/runtime'
import { detectFfmpeg } from './lib/ffmpegEnv'
import { installLogger } from './lib/logger'
import { tMain, setLocale as setMainLocale, subscribeLocale, type Locale } from '../shared/i18n'

// 数据目录设置：开发模式与正式版使用相同目录名，共用一份数据（yinghai）
// v2.8.2：从旧目录 movie-vault 一次性迁移到 yinghai，避免与影匣数据冲突。
const appData = app.getPath('appData')
const userDataDir = path.join(appData, 'yinghai')
const legacyUserDataDir = path.join(appData, 'movie-vault')
let resolvedUserDataDir = userDataDir
if (existsSync(legacyUserDataDir) && !existsSync(userDataDir)) {
  try {
    renameSync(legacyUserDataDir, userDataDir)
  } catch (e) {
    console.error('[main] 迁移旧数据目录失败，继续使用原目录：', e)
    resolvedUserDataDir = legacyUserDataDir
  }
}
app.setPath('userData', resolvedUserDataDir)

/**
 * Windows 控制台默认代码页是 GBK(936)，而 Node/Electron 按 UTF-8 输出中文 → 终端显示成乱码。
 * 启动时把当前控制台切到 UTF-8(65001)，这样 console.log 的中文能正常显示。
 * 打包后/无控制台时 chcp 会失败，忽略即可（日志文件本身始终是 UTF-8）。
 */
function setupWindowsConsoleUtf8(): void {
  if (process.platform !== 'win32') return
  try {
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch {
    /* 无控制台（打包后）或 chcp 不可用，忽略 */
  }
}
setupWindowsConsoleUtf8()

// 日志文件接管 console：logs/yinghai.log（启动即生效，崩溃/启动失败可追溯）
installLogger()

// ------------------------------------------------------------------
// 单实例锁 + 升级时强制杀掉旧进程（P0 重要修复）
//
// 旧问题：用户不退出影海直接覆盖安装 → 旧进程仍持有 requestSingleInstanceLock
// → 新 exe 启动时 !app.requestSingleInstanceLock() === true → 直接 app.quit()
// → 用户始终看到旧进程的 UI、功能、文案；只有手动关进程 + 删 AppData 才"看起来好"
// （删 AppData 本身没用，有用的是卸载时旧进程被杀）。
//
// 修复：AppData 写入 .last-version 标记记录上次启动版本；启动时对比当前版本。
//       若检测到升级 → 先用 taskkill /F /IM 强制杀掉旧影海进程 → 再正常获取单实例锁。
//       这样新版完全接管，没有旧进程残留，数据目录也不需要清。
// ------------------------------------------------------------------
const VERSION_MARKER = path.join(app.getPath('userData'), '.last-version')

function readLastVersion(): string | null {
  try {
    if (!existsSync(VERSION_MARKER)) return null
    return readFileSync(VERSION_MARKER, 'utf8').trim()
  } catch {
    return null
  }
}

function killOldProcess(): void {
  try {
    // productName 是中文「影海」，安装后的 exe 文件名为 "影海.exe"。
    // 用 /FI "PID ne <current>" 排除当前进程自己，避免新版启动时被 taskkill 自杀。
    execSync(`taskkill /F /FI "PID ne ${process.pid}" /IM "影海.exe"`, { stdio: 'ignore' })
    console.log('[main] 升级检测到旧进程，已强制结束（排除当前进程）')
  } catch {
    // 旧进程没运行或已经被杀，忽略错误
  }
}

const lastVersion = readLastVersion()
// 升级检测仅在打包（生产）环境生效。
// dev 模式下 app.getVersion() 返回 electron 自身版本（如 31.7.7）而非 package.json 版本，
// 会与 .last-version 记录的真实版本（如 2.9.2）不一致，导致误判升级并强制杀进程、应用退出。
if (app.isPackaged && lastVersion && lastVersion !== app.getVersion()) {
  console.log(`[main] 检测到版本升级 ${lastVersion} -> ${app.getVersion()} → 强制结束旧进程后再启动`)
  killOldProcess()
}

/** v2.5.1：读取 NSIS 安装器写入注册表的语言选择，仅首次安装时使用一次。 */
function readInstallerLanguage(): Locale | null {
  try {
    const out = execSync('reg query HKCU\\Software\\yinghai /v InstallerLanguage', { encoding: 'utf8' })
    const match = out.match(/InstallerLanguage\s+REG_SZ\s+(\S+)/)
    if (match && (match[1] === 'zh-CN' || match[1] === 'en-US')) return match[1] as Locale
  } catch {
    // 注册表不存在或读取失败，正常
  }
  return null
}

function clearInstallerLanguage(): void {
  try {
    execSync('reg delete HKCU\\Software\\yinghai /v InstallerLanguage /f', { stdio: 'ignore' })
  } catch {
    // 忽略删除失败
  }
}

const POSTER_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif'
}

// 必须在 app ready 之前注册特权协议，否则 lm:// 无法在渲染进程加载本地图片
protocol.registerSchemesAsPrivileged([
  { scheme: 'lm', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
])

/** 把渲染进程的 console / 崩溃日志落盘，方便排查 */
function attachRendererLog(win: BrowserWindow): void {
  let logDir: string
  let logFile: string
  try {
    logDir = path.join(app.getPath('userData'))
    logFile = path.join(logDir, 'renderer-console.log')
    mkdirSync(logDir, { recursive: true })
    appendFileSync(logFile, `\n===== session ${new Date().toISOString()} =====\n`)
  } catch {
    return
  }
  const write = (label: string, payload: string) => {
    try { appendFileSync(logFile, `[${new Date().toISOString()}] ${label} ${payload}\n`) } catch { /* 忽略 */ }
  }
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const payload = JSON.stringify({ level, message, line, sourceId })
    write('console', payload)
  })
  win.webContents.on('render-process-gone', (_e, details) => write('render-gone', JSON.stringify(details)))
  win.webContents.on('preload-error', (_e, p, err) => write('preload-error', `${p}: ${err?.message}`))
  win.webContents.on('did-fail-load', (_e, code, desc, url) => write('did-fail-load', `${code} ${desc} ${url}`))
}

/**
 * v2.2.9：把 main 进程自己的 console.log/error 落盘到 logs/main.log，
 * 否则 dev 模式 main 输出在 terminal 滚动看不到、生产包彻底看不到。
 * 跟 renderer console 不同（renderer console 由 attachRendererLog 接 webContents.console-message），
 * main 自己的 console.log 要劫持 console 对象写入。
 */
let mainLogFile = ''
function attachMainLog(): void {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs')
    mkdirSync(logDir, { recursive: true })
    mainLogFile = path.join(logDir, 'main.log')
    appendFileSync(mainLogFile, `\n===== main process session ${new Date().toISOString()} =====\n`)
  } catch {
    return
  }
  const writeAndCall = (orig: (...a: unknown[]) => void) => (...args: unknown[]) => {
    const line = args
      .map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()))
      .join(' ')
    try { appendFileSync(mainLogFile, `[${new Date().toISOString()}] ${line}\n`) } catch { /* 忽略 */ }
    orig.apply(console, args)
  }
  console.log = writeAndCall(console.log) as typeof console.log
  console.error = writeAndCall(console.error) as typeof console.error
  console.warn = writeAndCall(console.warn) as typeof console.warn
}


/** lm:// 协议路径白名单：只允许加载 userData 图片目录 + 媒体库目录内的图片 */
async function isLmAllowedPath(real: string): Promise<boolean> {
  const libs = await repo.listLibraries().catch(() => [])
  const roots = [
    path.join(app.getPath('userData'), 'posters'),
    path.join(app.getPath('userData'), 'preview-frames'),
    path.join(app.getPath('userData'), 'images'),
    ...libs.map((l) => l.folderPath)
  ].map((rp) => path.normalize(rp).toLowerCase())
  const norm = path.normalize(real).toLowerCase()
  return roots.some((root) => norm === root || norm.startsWith(root + path.sep))
}

/** 注册 lm:// 协议，让渲染进程安全加载本地图片（海报/侧车图/手动图） */
function registerLocalMedia(): void {
  protocol.handle('lm', async (request) => {
    try {
      const url = new URL(request.url)
      const encoded = url.pathname.slice(1)
      const real = Buffer.from(decodeURIComponent(encoded), 'base64').toString('utf-8')
      if (!app.isPackaged) {
        const exists = existsSync(real)
        console.log(`[lm] req=${request.url} path=${real} exists=${exists} ext=${path.extname(real)}`)
      }
      const ext = path.extname(real).toLowerCase()
      if (!POSTER_MIME[ext]) {
        console.warn('[lm] 不支持的扩展名, ext=' + JSON.stringify(ext) + ' path=' + real)
        return new Response('forbidden', { status: 403 })
      }
      // v2.10.x 安全加固：路径白名单，防止渲染进程被注入后经 lm:// 读取任意本地文件
      if (!(await isLmAllowedPath(real))) {
        console.warn('[lm] 路径不在白名单, path=' + real)
        return new Response('forbidden', { status: 403 })
      }
      const data = await fs.readFile(real)
      return new Response(data, {
        // no-store：封面文件可能被手动设为封面覆盖（路径不变内容变），禁止 Chromium 缓存，
        // 配合渲染端 lm:// URL 的 ?v= 版本号，保证封面立即生效
        headers: { 'Content-Type': POSTER_MIME[ext], 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      })
    } catch (e) {
      // v2.2.5 修复：ENOENT 是高频场景（poster/预览帧常被清理、data.json 残留旧路径），
      // 之前 console.warn 刷屏「控制台大量报错」。改成 console.debug（生产不可见、dev 模式可见），
      // 仍然返回 404，让渲染端 img onError 走占位图占位。
      const msg = (e as Error).message ?? String(e)
      if (msg.startsWith('ENOENT')) {
        console.debug('[lm] 文件不存在（已静默）:', msg)
      } else {
        console.warn('[lm] 读取失败:', msg)
      }
      return new Response('not found', { status: 404 })
    }
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0d12',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  attachRendererLog(win)

  // 设置内容安全策略，消除 Electron Security Warning
  const csp = app.isPackaged
    ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: lm:; font-src 'self'; media-src 'self' lm:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
    : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: lm:; font-src 'self'; media-src 'self' lm:; connect-src 'self' ws://localhost:* http://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self';" 
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  // dev 模式：拦截所有 HTTP 请求，记录 4xx/5xx（排查资源 404）
  if (!app.isPackaged) {
    const ws = win.webContents.session.webRequest
    ws.onCompleted((details) => {
      if (details.statusCode >= 400 && details.url.startsWith('http')) {
        console.log(`[req-4xx] ${details.statusCode} ${details.method} ${details.url}`)
      }
    })
  }

  // 调试快捷键：Ctrl+Shift+I 切换开发者工具（打包版也可用，便于排查）
  win.webContents.on('before-input-event', (e, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      e.preventDefault()
      win.webContents.toggleDevTools()
    }
  })

  // 最小化到托盘：关闭窗口时隐藏到系统托盘而不是退出
  win.on('close', (e) => {
    if (runtime.minimizeToTray && !forceQuit) {
      e.preventDefault()
      win.hide()
      ensureTray()
    }
  })

  // 最小化到托盘：点击最小化按钮时也隐藏到系统托盘（而不是只缩到任务栏）
  // 注意：Electron 的 minimize 事件不可取消（无 event 参数），窗口已最小化后才触发，
  // 所以这里在事件回调里立即 hide()，把刚缩到任务栏的窗口再藏到托盘。
  win.on('minimize', () => {
    if (runtime.minimizeToTray) {
      win.hide()
      ensureTray()
    }
  })

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ========== 系统托盘（最小化到托盘） ==========
let tray: Tray | null = null
let forceQuit = false

function trayIcon(): NativeImage {
  // 优先 extraResources 里的图标，退回 electron 默认
  const p = path.join(process.resourcesPath, 'icon.png')
  try {
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  } catch {
    /* 图标缺失 */
  }
  return nativeImage.createEmpty()
}

function ensureTray(): void {
  if (tray) return
  tray = new Tray(trayIcon())
  tray.setToolTip(tMain('tray.tooltip'))
  const rebuildMenu = () => {
    if (!tray) return
    tray.setToolTip(tMain('tray.tooltip'))
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: tMain('tray.show'), click: () => showMainWindow() },
        { type: 'separator' },
        { label: tMain('tray.quit'), click: () => { forceQuit = true; app.quit() } }
      ])
    )
  }
  rebuildMenu()
  tray.on('double-click', () => showMainWindow())
  // 订阅语言变化，实时更新托盘文案
  subscribeLocale(() => rebuildMenu())
}

function showMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.show()
    win.focus()
  }
}

/** Electron 单实例锁：防止同时启动多个实例争抢 Cache 目录导致报错 */
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[app] 已有实例在运行，退出新实例')
  app.quit()
  process.exit(0)
}

app.on('second-instance', (_event, _argv, _workingDirectory) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})

/** 其他窗口全关时：托盘模式不退出，否则正常退出 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !runtime.minimizeToTray) {
    forceQuit = true
    app.quit()
  }
})

let updateTimer: ReturnType<typeof setInterval> | undefined

app.on('before-quit', () => {
  if (updateTimer) clearInterval(updateTimer)
  stopAllWatchers()
  closeDb()
  void stopPreviewTaskQueue()
})

app.whenReady().then(async () => {
  // 隐藏默认应用菜单（打包后才出现 File/Edit/View/Window/Help，应用内无窗口菜单，无需保留）
  Menu.setApplicationMenu(null)

  // v2.2.9：把 main 进程自己的 console.log/error/warn 落盘到 logs/main.log
  // （之前只在 terminal / 用户看不到；现在 dev 模式 + 生产包都能在 userData/logs/main.log 看完整抓取过程）
  attachMainLog()

  registerLocalMedia()
  // 初始化 SQLite 数据库
  getDb()
  // 数据存储迁移：首次启动 SQLite 为空时，从 data.json 自动全量迁移（含备份）
  // 必须在 registerIpc / createWindow 之前完成，避免 UI 启动后读到空库
  await import('./lib/migrate').then((m) => m.ensureSqliteMigrated())
  registerIpc()
  void startPreviewTaskQueue()

  // 启动时应用界面语言：安装器首次安装的语言选择 > settings.language > 默认中文
  void (async () => {
    try {
      const installerLang = readInstallerLanguage()
      const s = await repo.getSettings()
      const lang = installerLang ?? s.language ?? 'zh-CN'
      setMainLocale(lang as Locale)
      // 把安装器选择的语言持久化到 settings，并清理一次性注册表标记
      if (installerLang) {
        await repo.saveSettings({ language: installerLang })
        clearInstallerLanguage()
      }
    } catch {
      /* 静默：保持默认中文 */
    }
  })()

  createWindow()

  // 成功启动后写版本标记 → 下次启动时用于判断"是不是升级安装"
  // （升级安装时旧进程还活着持有单实例锁，新实例会因此被提前 app.quit()，
  //  这个标记让新版在启动早期就能检测到升级并绕过锁）
  try {
    writeFileSync(VERSION_MARKER, app.getVersion())
  } catch {
    /* 首次启动 AppData 目录不存在会抛 ENOENT，正常，下次启动时再写 */
  }

  // 自动检查更新：按设置里的「频率」在启动时检测一次，之后每 30 分钟复查（仅当距上次检测超过设定间隔才真正联网）
  void (async () => {
    const FREQ_MS: Record<string, number> = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000
    }
    const maybeCheck = async () => {
      try {
        const s = await repo.getSettings()
        const freq = s.autoUpdateFrequency ?? 'off'
        if (freq === 'off') return
        const interval = FREQ_MS[freq]
        if (!interval) return
        const last = s.lastUpdateCheck ?? 0
        if (Date.now() - last < interval) return
        await runUpdateCheck()
      } catch {
        /* 静默：网络/解析失败不影响启动 */
      }
    }
    await maybeCheck()
    updateTimer = setInterval(maybeCheck, 30 * 60 * 1000)
  })()

  // 启动时应用运行时设置（开机自启 / 最小化到托盘 / 文件夹自动监控）
  void (async () => {
    try {
      const s = await repo.getSettings()
      applyRuntimeSettings(s)
      // 文件夹自动监控：开启后对所有媒体库根目录启动监控
      if (s.autoWatchFolders) {
        const libs = await repo.listLibraries()
        for (const lib of libs) {
          startWatching(lib.id, lib.folderPath, s.watchDebounceMs ?? 3000)
        }
      }
    } catch {
      /* 静默 */
    }
  })()

  // 启动时静默检测 ffmpeg 环境：系统已装则复用系统版并删除捆绑版（释放 62MB 磁盘），
  // 失败/删除无权限时静默忽略，不阻塞启动（检测详情可在设置页查看）
  void (async () => {
    try {
      await detectFfmpeg(await repo.getSettings())
    } catch {
      /* 静默 */
    }
  })()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
