import { app, ipcMain, dialog, shell, clipboard } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { IPC } from '../../shared/ipc'
import * as repo from '../lib/repo'
import * as watchHistory from '../lib/watch-history'
import { testProxyConnectivity } from '../lib/proxy'
import { detectFfmpeg } from '../lib/ffmpegEnv'
import { backupExport, backupImport } from '../lib/backup'
import { applyRenames } from '../lib/rename'
import { postersCacheDir } from '../lib/images'
import path from 'node:path'
import { promises as fs, existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { isSafeExternalUrl, runUpdateCheck } from './helpers'
import type { Library } from '../../shared/types'
import type { UpdateCheckResult } from '../../shared/api-types'
export function registerSystemIpc() {
  ipcMain.handle(IPC.appUninstall, async (_evt, keepUser: boolean) => {
    try {
      // NSIS 卸载程序与主程序同目录：Uninstall <productName>.exe
      const dir = path.dirname(process.execPath)
      const candidates = ['Uninstall 影海.exe', 'Uninstall.exe']
      // 把「是否保留用户数据」决定传入卸载程序：
      //   /YXKEEPDATA → 保留；/YXDELDATA → 删除（仍受保护脚本安全校验，永不触碰媒体库）
      // 注意：不可用 electron-builder 自带的 --delete-app-data（会无差别 RMDir，不安全）。
      const dataArg = keepUser ? '/YXKEEPDATA' : '/YXDELDATA'
      for (const name of candidates) {
        const p = path.join(dir, name)
        try {
          await fs.access(p)
          // 非静默启动 NSIS 卸载程序，使其卸载界面（进度页）正常弹出；
          // 数据去留已由应用内确认框决定，卸载器会据此跳过「是否保留用户数据」页。
          // 关键：必须 detached + 继承环境 + 脱离进程组，否则卸载程序会随主进程一起被杀。
          const child = spawn(p, [dataArg], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            shell: false,
            env: { ...process.env }
          })
          child.unref()
          // 主动退出应用，让出文件锁。Electron 需要约 1~2s 才能完全释放
          // 缓存/Storage 锁，因此延迟 2000ms；用户点过欢迎页后才进入删除阶段，
          // 这段延迟不会阻塞卸载流程。
          setTimeout(() => {
            app.quit()
          }, 2000)
          return { ok: true }
        } catch {
          /* 继续找下一个 */
        }
      }
      return { ok: false, error: '未找到卸载程序（开发模式无卸载入口）' }
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || '卸载失败' }
    }
  })

  ipcMain.handle(IPC.dialogSelectFolder, async () => {
    const res = await dialog.showOpenDialog({
      title: '第 1 步 · 选择视频文件夹',
      buttonLabel: '选择此文件夹',
      message: '影海会扫描该文件夹及子文件夹里的全部视频文件，生成你的海报墙。',
      properties: ['openDirectory']
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.dialogSelectFile, async (_e, opts?: { title?: string; buttonLabel?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    // 默认选 Excel 片单；调用方可传自定义 filters（如选视频、其他类型）
    const filters = opts?.filters ?? [
      { name: 'Excel 工作簿', extensions: ['xlsx', 'xls'] },
      { name: '所有文件', extensions: ['*'] }
    ]
    const res = await dialog.showOpenDialog({
      title: opts?.title ?? '选择文件',
      buttonLabel: opts?.buttonLabel ?? '选择',
      properties: ['openFile'],
      filters
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.openPath, async (_e, p: string) => {
    // v2.2.13：只放行绝对路径（openPath 可被用来打开任意文件/程序）
    if (typeof p !== 'string' || !path.isAbsolute(p)) {
      console.warn('[ipc] openPath 被拒绝（非绝对路径）')
      return
    }
    try {
      await shell.openPath(p)
    } catch {
      // 忽略打开失败
    }
  })

  // ---------- 仅扫描媒体库影片清单（不弹保存对话框、不写文件，供向导打开时自动加载） ----------

  ipcMain.handle(IPC.specGet, async () => {
    let lang = 'zh-CN'
    try {
      const settings = await repo.getSettings()
      lang = settings.language || 'zh-CN'
    } catch {
      // repo 尚未初始化时兜底中文
    }

    const zhFile = '通用评分与简介规范.md'
    const enFile = 'Scoring_and_Synopsis_Guide.en.md'

    const candidates = lang === 'en-US'
      ? [enFile, zhFile]
      : [zhFile, enFile]

    for (const name of candidates) {
      const devPath = path.join(process.cwd(), 'src', 'main', 'assets', name)
      const resPath = path.join(process.resourcesPath ?? '', name)
      if (existsSync(devPath)) return { path: devPath }
      if (existsSync(resPath)) return { path: resPath }
    }

    return { path: path.join(process.cwd(), 'src', 'main', 'assets', zhFile) }
  })

  // ---------- 从磁盘删除视频文件 ----------
  // 判定：视频所在目录下除自身外没有任何其他文件 → 整个目录一起挪回收站；
  // 否则只删视频文件本身。
  // 安全检查：若目录下还有其他文件（文本/字幕/图片等），保守地只删视频文件（避免误删用户其他资料）。
  // **实现方式：用 Electron `shell.trashItem` 把文件/目录挪到系统回收站**
  //（Windows 回收站 / macOS Trash / Linux trash-cli），不彻底删除。
  // 用户可从回收站恢复，比"直接删"安全得多。

  ipcMain.handle(IPC.appInfo, async () => {
    // 读取更新日志顶部（最近一版），按当前语言优先本地化版本
    // 中文版文件名：更新日志.md；英文版：CHANGELOG.en.md
    let changelog = ''
    const settings = await repo.getSettings().catch(() => null)
    const lang = settings?.language || 'zh-CN'
    const zhLog = '更新日志.md'
    const enLog = 'CHANGELOG.en.md'
    const candidates = lang === 'en-US'
      ? [
          path.join(process.resourcesPath, enLog),
          path.join(app.getAppPath(), enLog),
          path.join(app.getAppPath(), '..', enLog),
          path.join(process.resourcesPath, zhLog), // fallback
          path.join(app.getAppPath(), zhLog),
          path.join(app.getAppPath(), '..', zhLog)
        ]
      : [
          path.join(process.resourcesPath, zhLog),
          path.join(app.getAppPath(), zhLog),
          path.join(app.getAppPath(), '..', zhLog)
        ]
    for (const c of candidates) {
      try {
        const raw = readFileSync(c, 'utf-8')
        // 只取「最近一个正式版本」段落：
        // - 跳过 `## [未发布]` / `## [Unreleased]` 等非版本标题；
        // - 从第一个版本标题开始，截到下一个版本标题之前（只有一个版本时取到文末）。
        const isVersionHeading = (line: string): boolean =>
          /^##\s+\[?(?:v)?\d+\.\d+\.\d+/.test(line.trim())
        const lines = raw.split('\n')
        let start = -1
        let end = lines.length
        for (let i = 0; i < lines.length; i++) {
          if (!isVersionHeading(lines[i])) continue
          if (start < 0) start = i
          else {
            end = i
            break
          }
        }
        changelog = start >= 0 ? lines.slice(start, end).join('\n').trim() : raw.trim()
        break
      } catch {
        // 尝试下一个候选路径
      }
    }
    return {
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      node: process.versions.node ?? '',
      chrome: process.versions.chrome ?? '',
      dataDir: app.getPath('userData'),
      changelog
    }
  })
  // ---------- 打开外部链接 ----------

  ipcMain.handle(IPC.openExternal, async (_e, url: string) => {
    // v2.2.13：只放行 http/https，防止渲染进程注入后经 openExternal 打开 file:// 或任意本地程序
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      console.warn(`[ipc] openExternal 被拒绝（协议非 http/https）: ${String(url).slice(0, 80)}`)
      return
    }
    try {
      await shell.openExternal(url)
    } catch {
      // 忽略打开失败
    }
  })

  // 复制文本到剪贴板（sandbox preload 无法访问 clipboard 模块，必须在主进程做）

  ipcMain.handle(IPC.copyText, async (_e, text: string) => {
    try {
      clipboard.writeText(text)
    } catch {
      // 忽略复制失败
    }
  })


  ipcMain.handle(IPC.shellRevealInFolder, async (_e, p: string) => {
    // v2.2.13：只放行绝对路径
    if (typeof p !== 'string' || !path.isAbsolute(p)) return
    try {
      shell.showItemInFolder(p)
    } catch {
      // 忽略
    }
  })

  // ---------- 批量改名（清理文件名广告） ----------

  ipcMain.handle(
    IPC.libraryApplyRenames,
    async (_e, libraryId: string, items: Array<{ path: string; newName: string }>) => {
      const lib = (await repo.listLibraries()).find((l: Library) => l.id === libraryId)
      if (!lib) throw new Error('媒体库不存在')
      const result = await applyRenames(items)
      // 改名成功的文件若已有 video 记录（同路径变更），清理旧记录，下次对账重建
      for (const item of items) {
        const v = await repo.findVideoByPath(item.path)
        if (v) await repo.removeVideo(v.id)
      }
      return result
    }
  )

  // ---------- 代理测试连接 ----------

  ipcMain.handle(IPC.proxyTest, async (_e, settings: any) => {
    return testProxyConnectivity(settings ?? {})
  })

  // ---------- 清理海报缓存目录 ----------

  ipcMain.handle(IPC.cacheClear, async () => {
    try {
      const dir = postersCacheDir()
      const entries = await fs.readdir(dir, { withFileTypes: true })
      let removed = 0
      for (const e of entries) {
        if (e.isFile()) {
          await fs.unlink(path.join(dir, e.name))
          removed++
        }
      }
      return { ok: true, removed }
    } catch {
      return { ok: true, removed: 0 }
    }
  })

  // ---------- ffmpeg 运行环境检测（系统优先，检测到系统版自动删除捆绑版释放磁盘） ----------

  ipcMain.handle(IPC.ffmpegStatus, async () => {
    const settings = await repo.getSettings()
    return detectFfmpeg(settings)
  })

  // ---------- 隐私锁：设置 / 校验 / 退出 ----------

  ipcMain.handle(IPC.lockSet, async (_e, password: string) => {
    // password 为空 → 清除锁
    if (!password) {
      await repo.saveSettings({ lockHash: undefined, lockSalt: undefined })
      return
    }
    const salt = randomBytes(16).toString('hex')
    const hash = createHash('sha256').update(salt + password).digest('hex')
    await repo.saveSettings({ lockHash: hash, lockSalt: salt })
  })


  ipcMain.handle(IPC.lockVerify, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return false
    const hash = createHash('sha256').update(s.lockSalt + password).digest('hex')
    return hash === s.lockHash
  })

  // v2.3.12：清除锁前必须校验当前密码，防止误操作或他人直接清掉锁

  ipcMain.handle(IPC.lockDelete, async (_e, password: string) => {
    const s = await repo.getSettings()
    if (!s.lockHash || !s.lockSalt) return { ok: true } // 本来就没锁
    const hash = createHash('sha256').update(s.lockSalt + password).digest('hex')
    if (hash !== s.lockHash) return { ok: false, error: '密码错误' }
    await repo.saveSettings({ lockHash: undefined, lockSalt: undefined })
    return { ok: true }
  })


  ipcMain.handle(IPC.appQuit, () => {
    app.quit()
  })

  // ---------- 检查更新（GitHub / Gitee） ----------

  ipcMain.handle(IPC.updateCheck, (): Promise<UpdateCheckResult> => runUpdateCheck())

  // ---------- P2-7 备份 / 还原 ----------
  ipcMain.handle(IPC.backupExport, () => backupExport())
  ipcMain.handle(IPC.backupImport, () => backupImport())

  // ---------- ffmpeg 截帧：同步生成封面 + 预览帧，立即返回 ----------
  // ---------- 观看历史 ----------
  ipcMain.handle(IPC.watchHistoryList, (_e, limit?: number) => watchHistory.getWatchHistory(limit ?? 100))
  ipcMain.handle(IPC.watchHistoryStats, () => watchHistory.getWatchStats())
  ipcMain.handle(IPC.watchHistoryClear, () => watchHistory.clearWatchHistory())

}

/** 注册所有 IPC handler（按领域拆分） */
