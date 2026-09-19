import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'
import * as repo from '../lib/repo'
import { scanLibrary, walk } from '../lib/scanner'
import { reconcileLibrary } from '../lib/reconcile'
import { frameLog } from '../lib/images'
import { extractMovieQuery, localCanonicalName, detectEpisodeGroup } from '../../shared/code'
import * as XLSX from 'xlsx-js-style'
import { createSmartFetchState, fetchDetailSmart, fetchPosterSmart } from '../lib/fetch-meta'
import { generateQuickCover } from '../lib/preview-v2'
import { probeVideo } from '../lib/ffprobe'
import { previewRenames } from '../lib/rename'
import { findDuplicates } from '../lib/dedup'
import path from 'node:path'
import { promises as fs, writeFileSync, existsSync } from 'node:fs'
import type { Library, MovieMeta, ImageSource, SourceId, Video, TechInfo } from '../../shared/types'
import {
  backfillFromDetail,
  emitProgress,
  frameFailedRecently,
  isCoverUsable,
  isSafeId,
  resolveDetailCover,
  readReconcileCache,
  writeReconcileCache,
  setActiveFetchState,
  getActiveFetchState,
  FRAME_FALLBACK_LIMIT
} from './helpers'
export function registerLibraryIpc() {
  ipcMain.handle(IPC.libraryList, () => repo.listLibraries())

  ipcMain.handle(IPC.libraryAdd, async (_e, input: Omit<Library, 'id' | 'createdAt'>) => {
    const lib = await repo.addLibrary(input)
    return lib
  })

  ipcMain.handle(IPC.libraryRemove, async (_e, id: string) => {
    await repo.removeLibrary(id)
  })

  ipcMain.handle(IPC.libraryUpdate, async (_e, id: string, patch: Partial<Library>) => {
    const lib = await repo.updateLibrary(id, patch)
    return lib
  })

  // ---------- 对账（Excel 驱动 + 文件夹对账） ----------
  // v2.4.1："扫描库"按钮合并 scan + reconcile，一次调用只推一轮连续进度。
  //   scanLibrary 负责建 data.json 记录（必做，fix 新库第一次扫不出条目）
  //   reconcileLibrary 负责 Excel 对账 + 条目归类（也必做）
  //   原来 renderer 先调 videoScan → finally 里再调 runReconcile，两个独立 IPC 各发自己的
  //   emitProgress，UI 上就出现"点一次扫描，进度条弹两轮"。

  ipcMain.handle(IPC.libraryScanAndReconcile, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const t0 = Date.now()
    // scanLibrary 正常发进度（0 → scanTotal）
    await scanLibrary(lib, settings, emitProgress)
    // reconcileLibrary 也走 emitProgress，但它会从自己的 0 开始推——
    // 我们让 reconcile 的常规进度（total/done）在 scan 结束后继续"延续"这个进度，
    // 使 UI 上看到的是 0 → scanTotal → scanTotal+reconcileCount 的一条连续进度条。
    // 最简单做法：包装一下 emitProgress，reconcile 阶段的常规 total/done 不推，只推 introError / fetchEvent。
    let scanDone = false
    const reconcilerOnProgress = (p: Parameters<typeof emitProgress>[0]) => {
      // introError / fetchEvent 继续正常推；常规进度在 scan 阶段结束后就不推了
      if (p.introError || p.fetchEvent) {
        emitProgress(p)
        return
      }
      if (!scanDone) return // scan 没跑完？不可能，scanLibrary 是 await 的
      // reconcile 常规进度不推，避免前端看到第二轮进度条
    }
    scanDone = true
    const result = await reconcileLibrary(lib, settings, reconcilerOnProgress)
    console.log(`[scan+reconcile] 完成 ${libraryId}：entries=${result.entries.length} 耗时${Date.now() - t0}ms`)
    void writeReconcileCache(libraryId, result)
      .then(() => console.log(`[scan+reconcile] 缓存已写 ${libraryId}`))
      .catch((e) => console.error('[scan+reconcile] 缓存写入失败:', (e as Error)?.message || e))
    return result
  })


  ipcMain.handle(IPC.libraryReconcile, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const t0 = Date.now()
    const result = await reconcileLibrary(lib, settings, emitProgress)
    // v2.3.10 诊断：对账完成打点（此前若卡在落盘，这里永远到不了，日志一片空白无从定位）
    console.log(`[reconcile] 对账完成 ${libraryId}：entries=${result.entries.length} 耗时${Date.now() - t0}ms`)
    // v2.2.10-fix5：对账结果写磁盘缓存——启动/切库先秒出缓存界面，后台再全量对账刷新
    void writeReconcileCache(libraryId, result)
      .then(() => console.log(`[reconcile] 缓存已写 ${libraryId}`))
      .catch((e) => console.error('[reconcile] 缓存写入失败:', (e as Error)?.message || e))
    return result
  })

  // v2.2.10-fix5：读上次对账结果缓存（无缓存返回 null，由 renderer 决定是否等待全量对账）

  ipcMain.handle(IPC.libraryReconcileCache, async (_e, libraryId: string) => {
    return readReconcileCache(libraryId)
  })

  // ---------- 视频 ----------

  ipcMain.handle(IPC.libraryFetchAll, async (_e, libraryId: string, force = false) => {
    console.log('[ipc] libraryFetchAll libraryId=', libraryId, 'force=', force)
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const allVideos = await repo.listVideos({ libraryId })
    // v2.7.x：「锁定」的影片无论普通/强制批量补齐都自动跳过（详情页手动补齐不受限）。
    // 跳过明细随结果返回，UI 结束后明确告知用户。
    const lockedSkipped = allVideos
      .filter((v) => v.locked)
      .map((v) => ({ id: v.id, title: localCanonicalName(v) }))
    // v2.7.x：文件已不存在的失效记录也跳过（不去浪费请求；下次扫描会自动清理掉）
    const missingSkipped: Array<{ id: string; title: string }> = []
    const videos = allVideos.filter((v) => {
      if (v.locked) return false
      if (!v.path || !existsSync(v.path)) {
        missingSkipped.push({ id: v.id, title: localCanonicalName(v) })
        return false
      }
      return true
    })
    if (lockedSkipped.length > 0 || missingSkipped.length > 0) {
      console.log(
        `[ipc] libraryFetchAll 跳过 ${lockedSkipped.length} 部锁定 / ${missingSkipped.length} 部失效（文件不存在），共 ${allVideos.length} 部`
      )
    }
    if (videos.length === 0) {
      emitProgress({ libraryId, total: 0, done: 0 })
      return {
        ok: 0,
        failed: 0,
        bySource: { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 } as Record<SourceId, number>,
        failures: [],
        stopped: false,
        remaining: 0,
        remainingNoPoster: 0,
        lockedSkipped,
        missingSkipped
      }
    }
    // 抓取并发数 / 间隔（限速、降风控），Settings 中可配。
    // 修复：`Math.floor(x) || 默认值` 在 x=0 时会被默认值顶掉（0 无法生效）——
    // 用显式 Number.isFinite 判断，0 间隔（不限速）可以真正设置为 0。
    const rawConcurrency = Math.floor(settings.fetchConcurrency)
    const baseConcurrency = Number.isFinite(rawConcurrency) && rawConcurrency >= 1
      ? Math.max(1, Math.min(8, rawConcurrency))
      : 2
    const rawInterval = Math.floor(settings.fetchIntervalMs)
    const baseInterval = Number.isFinite(rawInterval) && rawInterval >= 0 ? rawInterval : 600
    // 强制重抓模式：每部都重搜，量极大；并发降到 1、间隔 2 秒，避免触发 数据源 反爬 (HTTP 403)。
    // 普通补齐保持用户配置的并发/间隔。
    const concurrency = force ? 1 : baseConcurrency
    const interval = force ? 3000 : baseInterval
    let done = 0
    let ok = 0
    let failed = 0
    const bySource: Record<SourceId, number> = { moviedb: 0, omdb: 0, openlibrary: 0, justwatch: 0, wikipedia: 0 }
    const failures: Array<{ id: string; title: string; reason: string }> = []
    const smartState = createSmartFetchState()
    setActiveFetchState(smartState)
    // v2.8.5：批量补齐开始时先推一条事件，让 renderer 的左下角浮层立刻显示
    emitProgress({
      libraryId,
      total: videos.length,
      done: 0,
      current: force ? '强制重新获取全部信息' : '补齐缺失信息',
      fetchEvent: { code: 'start', src: 'batch', status: 'trying', detail: `total=${videos.length}` }
    })
    // 同检索词复用：本批内同名影片（同片多文件）只抓一次，其余直接复用，节省请求额度
    const queryCache = new Map<string, MovieMeta>()
    let idx = 0
    // v2.2.10-fix4：批量写盘——worker 内只收集变更，全部结束后一次 applyVideoChanges，
    // 不再逐条 updateVideo 全量写 4.7MB data.json（大库 4680 部 = 4680 次全量写 → 小时级）。
    const pendingChanges: repo.VideoChange[] = []
    // v2.3.10 分段落盘：批量补齐是长任务（4494 部可能跑几十分钟），中途关掉/崩溃时
    // pendingChanges 里已抓到的元数据会全部丢失（原来只在全部跑完才一次落盘）。
    // 现在每 CHECKPOINT_SIZE 条落盘一次，中断最多丢一小批；落盘用锁串行且不阻塞 worker。
    const CHECKPOINT_SIZE = 100
    let flushing = false
    const flushPending = async (): Promise<void> => {
      if (flushing || pendingChanges.length === 0) return
      flushing = true
      const batch = pendingChanges.splice(0, pendingChanges.length)
      try {
        await repo.applyVideoChanges(batch)
        console.log(`[ipc] 补齐进度落盘：${batch.length} 条`)
      } catch (e) {
        console.error('[ipc] 补齐进度落盘失败:', (e as Error)?.message || e)
      } finally {
        flushing = false
      }
    }
    /** 等待在途落盘结束后再落最后一批（收尾调用） */
    const flushPendingSync = async (): Promise<void> => {
      for (let i = 0; i < 100 && flushing; i++) await new Promise((r) => setTimeout(r, 20))
      await flushPending()
    }
    const applyPatch = (v: Video, patch: Partial<Video>): void => {
      const existing = pendingChanges.find((c) => c.type === 'update' && c.video.id === v.id)
      if (existing && existing.type === 'update') {
        existing.video = { ...existing.video, ...patch }
      } else {
        pendingChanges.push({ type: 'update', video: { ...v, ...patch } })
      }
    }
    const worker = async () => {
      while (idx < videos.length && !smartState.stop) {
        const v = videos[idx++]
        // 防御：批量执行期间被临时锁定 → 同样跳过，不发任何请求
        if (v.locked) {
          done++
          emitProgress({ libraryId, total: videos.length, done, current: localCanonicalName(v) })
          continue
        }
        // 本轮是否发过网络请求（封面抓取 / 详情抓取）——有才延时，避免无请求也空等
        let madeRequest = false
        // v2.8.5：抓取过程 UI 显示名统一用「本地真名」，与实际搜索词保持一致
        const displayTitle = localCanonicalName(v)
        emitProgress({ libraryId, total: videos.length, done, current: displayTitle })

        // 0) 所有影片统一走「封面抓取 → 详情抓取」流程（元数据抓取对所有影片开放）

        // 1) 封面：仅缺封面/占位图才抓。force 不重抓海报——海报是图片、URL 基本不变，
        //    本地缓存命中即可；重抓只会浪费 数据源/数据源 请求额度并加剧 403。
        if (!v.posterPath || v.posterSource === 'placeholder') {
          madeRequest = true
          // v2.2.8：海报抓取按 customSourceOrder 降级（原来硬走 数据源）→ 失败则 ffmpeg 批量截帧兜底
          const 数据源Poster = await fetchPosterSmart(v, settings)
          let localPath: string | null = 数据源Poster
          let source: ImageSource = 'moviedb'
          let previews: string[] | undefined
          // 替换前验证图片有效性：下载损坏/截断的坏图视为失败 → 走 ffmpeg 截帧兜底
          if (localPath && !(await isCoverUsable(localPath, settings))) {
            await fs.unlink(localPath).catch(() => {})
            localPath = null
          }
          if (!localPath) {
            const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
            if (coverPath) {
              localPath = coverPath
              source = 'ffmpeg'
            }
            if (coverPath) {} // quick cover only, full previews via V2 queue
          }
          if (localPath) {
            const patch: Partial<Video> = { posterSource: source, posterPath: localPath }
            if (previews && previews.length) patch.previewPaths = previews
            await repo.updateVideo(v.id, patch)
            for (const w of BrowserWindow.getAllWindows()) {
              if (!w.isDestroyed()) {
                w.webContents.send(IPC.posterFetched, { videoId: v.id, posterPath: localPath })
              }
            }
            ok++
          }
        }

        // 2) 缺详情或详情陈旧（含远程 URL） → 抓详情
        const d = v.meta
        // parseVer !== 2：旧解析器写入的数据，需要重抓覆盖；
        // parseVer === 2：当前解析器已抓过，跳过以节省请求额度。
        const detailStale =
          !d ||
          d.parseVer !== 2 ||
          (d.cover ? /^https?:\/\//.test(d.cover) : false) ||
          // v2.7.x：新版 MovieDB 详情会回填演员头像，旧数据缺失时视为陈旧，触发重新抓取
          (d.source === 'moviedb' && !d.castProfiles)
        // v2.8.5：本地文件夹/文件名是用户唯一真名，搜索时优先用它，而不是上次抓取到的 meta.title
        const fetchCodeRaw = localCanonicalName(v)
        const base = extractMovieQuery(fetchCodeRaw).query
        // 同一检索词已在本批抓取过 → 直接复用，不重复请求
        const queryHit = base ? queryCache.get(base) : undefined
        if (queryHit) {
          applyPatch(v, { meta: queryHit, ...backfillFromDetail(v, queryHit) })
          ok++
          const src = queryHit.source ?? 'moviedb'
          bySource[src] = (bySource[src] ?? 0) + 1
          // v2.8.5：queryCache 复用也要在左下角浮层显示命中，否则用户看不到过程
          emitProgress({
            libraryId,
            total: videos.length,
            done,
            current: displayTitle,
            fetchEvent: { code: displayTitle, src, status: 'hit', detail: 'cache-hit' }
          })
        } else if (force || detailStale) {
          madeRequest = true
          // 智能抓取：数据源 连续失败自动切 数据源；数据源 也连续失败自动停止
          // v2.2.10：onEvent 把每次源尝试推给 renderer（UI 实时显示"数据源 失败 → 降级 数据源"）
          const mr = await fetchDetailSmart(fetchCodeRaw, settings, smartState, (e) => {
            emitProgress({ libraryId, total: videos.length, done, current: displayTitle, fetchEvent: { ...e, code: displayTitle || e.code } })
          })
          if (mr.detail) {
            if (base) queryCache.set(base, mr.detail)
            applyPatch(v, { meta: mr.detail, ...backfillFromDetail(v, mr.detail) })
            // **关键**：如果之前的封面是 ffmpeg 兜底（无数据源海报时），但 detail.cover 有真实海报，
            // 用 detail.cover 下载本地海报覆盖错误的截帧，保证列表/详情一致
            if (
              mr.detail.cover &&
              (v.posterSource === 'ffmpeg' || v.posterSource === 'placeholder' || !v.posterPath)
            ) {
              const coverLocal = await resolveDetailCover(mr.detail, v.id, settings)
              if (coverLocal) {
                await applyPatch(v, {
                  posterSource: mr.detail.source ?? 'moviedb',
                  posterPath: coverLocal
                })
                for (const w of BrowserWindow.getAllWindows()) {
                  if (!w.isDestroyed()) {
                    w.webContents.send(IPC.posterFetched, {
                      videoId: v.id,
                      posterPath: coverLocal,
                      posterSource: mr.detail.source ?? 'moviedb'
                    })
                  }
                }
              }
            }
            ok++
            const src = mr.detail.source ?? 'moviedb'
            bySource[src] = (bySource[src] ?? 0) + 1
          } else {
            failed++
            failures.push({ id: v.id, title: localCanonicalName(v), reason: mr.error || '未知原因' })
          }
        } else {
          // v2.8.5：非强制模式且详情不陈旧 → 在左下角浮层显示跳过，避免用户以为没反应
          emitProgress({
            libraryId,
            total: videos.length,
            done,
            current: displayTitle,
            fetchEvent: { code: displayTitle, src: 'skip', status: 'skipped', detail: 'detail-up-to-date' }
          })
        }
        // 统一限速：本轮发过请求才延时一次（修复旧逻辑封面+详情都抓时延时两次、间隔翻倍）
        if (madeRequest) await new Promise((r) => setTimeout(r, interval))
        if (smartState.stop) break
        done++
        emitProgress({ libraryId, total: videos.length, done, current: displayTitle })
        // 分段落盘（不阻塞 worker）：攒够一批就落盘，避免中途关闭丢掉全部进度
        if (pendingChanges.length >= CHECKPOINT_SIZE) void flushPending()
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, videos.length) }, () => worker()))
    // v2.2.10-fix4：worker 全部结束后批量落盘（原来逐条全量写，大库下小时级）
    // v2.3.10：剩余不足一批的收尾落盘（等可能的在途落盘结束后再写）
    await flushPendingSync()
    emitProgress({ libraryId, total: videos.length, done: videos.length })
    // 无封面兜底：多数据源都抓不到数据的视频，后台 ffmpeg 截帧显示真实画面（不阻塞补齐返回）
    void (async () => {
      try {
        const all = await repo.listVideos({})
        const noPosterAll = all.filter(
          (v) =>
            v.libraryId === libraryId &&
            // v2.7.x：锁定影片的封面也不要在批量补齐里被覆盖
            !v.locked &&
            (!v.posterPath || v.posterSource === 'placeholder') &&
            // v2.3.11：跳过刚截帧失败过的损坏文件（否则每轮都在同一个坏文件上卡超时）
            !frameFailedRecently(v)
        )
        // 批次上限：单轮补齐最多后台截 200 部（每部最多 16 个 ffmpeg 进程，放开会让大库 CPU 风暴）
        const noPoster = noPosterAll.slice(0, FRAME_FALLBACK_LIMIT)
        if (noPoster.length === 0) return
        console.log(
          `[ipc] 无封面兜底截帧：待处理 ${noPosterAll.length} 部，本轮截 ${noPoster.length} 部` +
            (noPosterAll.length > noPoster.length
              ? `（剩余 ${noPosterAll.length - noPoster.length} 部需再跑一轮「补齐信息」）`
              : '')
        )
        const conc2 = Math.max(1, Math.min(4, Math.floor(settings.scanConcurrency) || 2))
        let i2 = 0
        // fix4：截帧兜底也批量落盘（最多 200 次全量写 → 1 次）
        const frameChanges: repo.VideoChange[] = []
        const w2 = async () => {
          while (i2 < noPoster.length) {
            const v = noPoster[i2++]
            let frameFailed = true
            try {
              const coverPath = await generateQuickCover(v, settings, { cancelled: false }).catch(() => null)
              if (coverPath) {
                frameFailed = false
                const patch: Partial<Video> = {
                  posterSource: 'ffmpeg' as const,
                  posterPath: coverPath,
                  posterPathFfmpeg: coverPath,
                  frameFailedAt: undefined // 截帧成功：清掉此前的失败标记
                }
                const existing = frameChanges.find((c) => c.type === 'update' && c.video.id === v.id)
                if (existing && existing.type === 'update') {
                  existing.video = { ...existing.video, ...patch }
                } else {
                  frameChanges.push({ type: 'update', video: { ...v, ...patch } })
                }
                for (const w of BrowserWindow.getAllWindows()) {
                  if (!w.isDestroyed()) {
                    w.webContents.send(IPC.posterFetched, { videoId: v.id, posterPath: coverPath, posterSource: 'ffmpeg' })
                  }
                }
              }
            } catch {
              frameFailed = true
            }
            // v2.3.11：截帧没出图（损坏文件 / 超时）→ 打时间戳，批量任务冷却期内不再碰它
            if (frameFailed) {
              frameChanges.push({ type: 'update', video: { ...v, frameFailedAt: Date.now() } })
              void frameLog(`[ipc] 截帧失败打标，7 天内跳过 id=${v.id} path=${v.path}`)
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(conc2, noPoster.length) }, () => w2()))
        if (frameChanges.length > 0) {
          await repo.applyVideoChanges(frameChanges)
        }
        console.log(`[ipc] 无封面兜底截帧完成：产出 ${frameChanges.length}/\${noPoster.length} 部`)
      } catch {
        /* 静默 */
      }
    })()
    // v2.3.11：统计本轮结束后仍无封面的部数（兜底截帧每轮上限 200，需要告知用户是否再来一轮）
    let remainingNoPoster = 0
    try {
      const after = await repo.listVideos({ libraryId })
      remainingNoPoster = after.filter(
        (v) =>
          // v2.7.x：锁定影片不参与批量补齐，也不计入「仍无封面」
          !v.locked && (!v.posterPath || v.posterSource === 'placeholder') && !frameFailedRecently(v)
      ).length
    } catch {
      /* 统计失败不影响主流程 */
    }
    setActiveFetchState(null)
    return {
      ok,
      failed,
      bySource,
      failures,
      stopped: smartState.stop,
      remaining: smartState.stop ? Math.max(0, videos.length - idx) : 0,
      remainingNoPoster,
      lockedSkipped,
      missingSkipped
    }
  })


  ipcMain.handle(IPC.libraryFetchPause, () => {
    const st = getActiveFetchState(); if (st) st.paused = true
  })

  ipcMain.handle(IPC.libraryFetchResume, () => {
    const st = getActiveFetchState(); if (st) st.paused = false
  })

  ipcMain.handle(IPC.libraryFetchStop, () => {
    const st = getActiveFetchState(); if (st) st.stop = true
  })

  // ---------- 设置 ----------

  ipcMain.handle(IPC.libraryGetCodes, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) return { count: 0, codes: [] }
    const files: string[] = []
    for await (const f of walk(lib.folderPath)) files.push(f)
    // 按文件夹分组：剧集文件夹（≥2个不同集号）只取一次文件夹名作为片名
    const byFolder = new Map<string, string[]>()
    for (const f of files) {
      const dir = path.dirname(f)
      const list = byFolder.get(dir) ?? []
      list.push(f)
      byFolder.set(dir, list)
    }
    const seen = new Set<string>()
    const codes: string[] = []
    for (const [dir, flist] of byFolder) {
      const names = flist.map((f) => path.basename(f))
      const epGroup = detectEpisodeGroup(names)
      if (epGroup && epGroup.length >= 2) {
        // 剧集文件夹：取文件夹名作为片名
        const folderName = path.basename(dir)
        const key = folderName.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          codes.push(folderName)
        }
      } else {
        // 普通文件：取文件名（去扩展名）
        for (const f of flist) {
          const base = path.basename(f)
          const ext = path.extname(f)
          const name = base.slice(0, base.length - ext.length)
          if (!name) continue
          const key = name.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          codes.push(name)
        }
      }
    }
    codes.sort((a, b) => a.localeCompare(b, 'zh'))
    return { count: codes.length, codes }
  })

  // ---------- 导出影片清单（txt 或 xlsx 模板）----------

  ipcMain.handle(IPC.libraryExportCodes, async (_e, libraryId: string, format: 'txt' | 'xlsx') => {
    console.log('[exportCodes] called:', { libraryId, format })
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) return { ok: false, error: 'library-not-found' }
    // 复用上面的 walk + 提取文件名逻辑
    const files: string[] = []
    for await (const f of walk(lib.folderPath)) files.push(f)
    const seen = new Set<string>()
    const codes: string[] = []
    for (const f of files) {
      const base = path.basename(f)
      const ext = path.extname(f)
      const name = base.slice(0, base.length - ext.length)
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      codes.push(name)
    }
    codes.sort((a, b) => a.localeCompare(b, 'zh'))
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: format === 'xlsx' ? '导出影片清单 (Excel)' : '导出影片清单 (txt)',
      defaultPath: `影片清单_${lib.name}.${format}`,
      filters: format === 'xlsx'
        ? [{ name: 'Excel', extensions: ['xlsx'] }]
        : [{ name: 'Text', extensions: ['txt'] }]
    })
    console.log('[exportCodes] save dialog result:', { canceled, filePath, codesCount: codes.length })
    if (canceled || !filePath) return { ok: false, error: 'canceled' }
    try {
      if (format === 'xlsx') {
        const wb = XLSX.utils.book_new()
        const rows: string[][] = [['编号', '标题', '年份', '分类', '推荐评分', '简介', '主题', '地区', '系列']]
        codes.forEach((title, idx) => rows.push([String(idx + 1), title, '', '', '', '', '', '', '']))
        const ws = XLSX.utils.aoa_to_sheet(rows)
        // 列宽自适应：中文按2宽度计算，标题列按最长标题+6空隙
        const displayWidth = (s: string) => [...s].reduce((w, ch) => w + (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1), 0)
        const maxTitleW = codes.reduce((max, t) => Math.max(max, displayWidth(t)), 8)
        ws['!cols'] = [
          { wch: 6 },   // 编号
          { wch: maxTitleW + 6 },  // 标题（自适应+空隙）
          { wch: 8 },   // 年份
          { wch: 10 },  // 分类
          { wch: 10 },  // 推荐评分
          { wch: 60 },  // 简介
          { wch: 20 },  // 主题
          { wch: 12 },  // 地区
          { wch: 12 },  // 系列
        ]
        // 所有单元格水平+垂直居中对齐
        const range = XLSX.utils.decode_range(ws['!ref'] || '')
        for (let R = range.s.r; R <= range.e.r; R++) {
          for (let C = range.s.c; C <= range.e.c; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C })
            const cell = ws[addr]
            if (cell) {
              cell.s = { ...(cell.s || {}), alignment: { vertical: 'center', horizontal: 'center', wrapText: true } }
            }
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, '片单')
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
        writeFileSync(filePath, wbout)
        console.log('[exportCodes] xlsx written:', filePath, 'rows:', rows.length, 'codes:', codes.length)
      } else {
        writeFileSync(filePath, codes.join('\n'), 'utf-8')
        console.log('[exportCodes] txt written:', filePath, 'codes:', codes.length)
      }
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ---------- 获取内置规范文件路径（按语言选） ----------

  ipcMain.handle(IPC.libraryBatchProbe, async (_e, libraryId: string) => {
    if (!isSafeId(libraryId)) throw new Error('非法库 id')
    const settings = await repo.getSettings()
    const videos = await repo.listVideos({ libraryId })
    const needProbe = videos.filter((v) => !v.techInfo?.durationSec && !v.durationSec)
    const changes: repo.VideoChange[] = []
    const applyTech = (v: Video, info: TechInfo) => {
      const existing = changes.find((c) => c.type === 'update' && c.video.id === v.id)
      if (existing && existing.type === 'update') {
        existing.video = { ...existing.video, techInfo: info }
      } else {
        changes.push({ type: 'update', video: { ...v, techInfo: info } })
      }
    }
    let ok = 0
    let failed = 0
    const conc = Math.max(1, Math.min(4, Math.floor(settings.scanConcurrency) || 2))
    let idx = 0
    const worker = async () => {
      while (idx < needProbe.length) {
        const v = needProbe[idx++]
        try {
          const info = await probeVideo(v.path, settings)
          if (info?.durationSec) {
            applyTech(v, info)
            ok++
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(conc, needProbe.length) }, () => worker()))
    if (changes.length > 0) await repo.applyVideoChanges(changes)
    return { ok, failed, skipped: videos.length - needProbe.length }
  })

  // ---------- 应用信息 ----------

  ipcMain.handle(IPC.libraryPreviewRenames, async (_e, libraryId: string) => {
    const lib = (await repo.listLibraries()).find((l) => l.id === libraryId)
    if (!lib) throw new Error('媒体库不存在')
    const settings = await repo.getSettings()
    const ignoredSet = new Set(settings.ignoredUnlistedPaths ?? [])
    return previewRenames(
      lib.folderPath,
      async (p) => (await repo.findVideoByPath(p)) !== null,
      (p) => ignoredSet.has(p)
    )
  })


  ipcMain.handle(IPC.libraryFindDuplicates, async (_e, libraryId: string) => {
    if (!isSafeId(libraryId)) throw new Error('非法 libraryId')
    const wc = _e.sender
    return findDuplicates(libraryId, (done, total) => {
      if (!wc.isDestroyed()) wc.send(IPC.duplicateProgress, { done, total })
    })
  })

  // 读取 NFO 文件
}


/** video 领域 IPC handler */
