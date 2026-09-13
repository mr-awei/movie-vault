/**
 * 批量智能抓取（MovieDB → OMDb → OpenLibrary → JustWatch）。
 * v2.2.4 抽到独立模块：原在 ipc.ts 内，reconcile.ts 需要在「无片单兜底」分支
 * 直接调它来抓数据源详情，不能反向 import ipc.ts（会循环依赖）。
 *
 * 数据源顺序：MovieDB → OMDb → OpenLibrary → JustWatch。
 * 任一源连续**网络失败** N 部 → 本轮自动禁用该源（不再浪费请求）；
 * 「搜索无结果」属正常结果（该数据源确实没有这部影片），**不计数、不触发停止**——
 * 只有真正的网络/会话异常（请求失败、超时、年龄验证失败等）才累计失败次数，
 * 避免「IP 没被封、只是数据源没这个externalId」时批量被误停；JustWatch 作为最后兜底，连续网络失败即停止整批。
 */
import { fetchMovieDbDetail, hasMovieDbKey } from './movie-db'
import { fetchOmdbDetail, hasOmdbKey } from './omdb'
import { fetchOpenLibraryDetail, hasOpenLibraryKey } from './openlibrary'
import { fetchJustWatchDetail, hasJustWatchKey } from './justwatch'
import { fetchWikipediaDetail, hasWikipediaKey } from './wikipedia'
import { extractMovieQuery } from '../../shared/code'
import type { MovieMeta, SourceId, Settings, Video } from '../../shared/types'

export interface MovieDetailResult {
  detail: MovieMeta | null
  /** 命中来源（success 时） */
  source?: SourceId
  /** 全部失败时的原因描述 */
  error?: string
}

export interface SmartFetchState {
  /** MovieDB 已被连续失败禁用（本轮不再尝试） */
  moviedbDisabled: boolean
  moviedbFails: number
  /** OMDb 已被连续失败禁用（本轮不再尝试） */
  omdbDisabled: boolean
  omdbFails: number
  /** OpenLibrary 已被连续失败禁用（本轮不再尝试） */
  openLibraryDisabled: boolean
  openLibraryFails: number
  /** JustWatch 已被连续失败禁用（本轮不再尝试） */
  justWatchDisabled: boolean
  justWatchFails: number
  /** 维基百科已被连续失败禁用（本轮不再尝试） */
  wikipediaDisabled: boolean
  wikipediaFails: number
  /** 全部停止 */
  stop: boolean
  /** 用户暂停 */
  paused: boolean
}

const MOVIEDB_CONSECUTIVE_LIMIT = 3
const OMDB_CONSECUTIVE_LIMIT = 3
const OPENLIBRARY_CONSECUTIVE_LIMIT = 3
const JUSTWATCH_CONSECUTIVE_LIMIT = 3
const WIKIPEDIA_CONSECUTIVE_LIMIT = 3

/**
 * 提取 fetch 异常的真实原因（undici 的 TypeError 通常把底层错误放在 e.cause 里）。
 */
function formatFetchError(e: unknown): string {
  let msg: string
  if (e instanceof Error && (e.cause as Error)?.message) {
    msg = `${e.message} → ${(e.cause as Error).message}`
  } else {
    msg = (e as Error)?.message || String(e)
  }
  // 典型被墙 / DNS 污染特征：连接超时、DNS 解析失败、ECONNREFUSED 等
  if (/UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|getaddrinfo|Connect Timeout|certificate/i.test(msg)) {
    msg += '（疑似被墙/DNS污染：请在「设置 → 代理」配置可用代理后再试）'
  }
  return msg
}

export function createSmartFetchState(): SmartFetchState {
  return {
    moviedbDisabled: false,
    moviedbFails: 0,
    omdbDisabled: false,
    omdbFails: 0,
    openLibraryDisabled: false,
    openLibraryFails: 0,
    justWatchDisabled: false,
    justWatchFails: 0,
    wikipediaDisabled: false,
    wikipediaFails: 0,
    stop: false,
    paused: false
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** 如果用户点了暂停，则在此处轮询直到恢复或停止 */
export async function waitIfPaused(state: SmartFetchState): Promise<void> {
  while (state.paused && !state.stop) {
    await wait(200)
  }
}

/**
 * 按 settings.customSourceOrder 依次降级抓取**海报**（只下载封面图，不写 detail）。
 * v2.2.8 修复：原 fetchPosterSmart 前身只硬走单一数据源 search，不读用户自定义顺序——
 * 用户把某源排后面或某源被风控时，海报抓取仍硬试该源而失败。
 *
 * 各源返回约定：
 * - 各数据源 search → { posterUrl }（远程 URL，需 cacheRemoteImage）
 * - 各数据源 fetchXxxDetail → detail.cover（内部已下载到本地）
 * 命中第一个有 cover 的源即返回本地路径。
 */
export async function fetchPosterSmart(video: Video, settings: Settings): Promise<string | null> {
  const q = extractMovieQuery(video.meta?.title || video.title || video.folderName || video.fileName || '')
  if (!q.query) return null
  const rawOrder =
    settings.customSourceOrder && settings.customSourceOrder.length >= 1
      ? settings.customSourceOrder
      : DEFAULT_SOURCE_ORDER
  const order = rawOrder.filter((s) => !settings.disabledSources?.includes(s))
  for (const src of order) {
    try {
      if (src === 'moviedb') {
        if (hasMovieDbKey(settings)) {
          const d = await fetchMovieDbDetail(q, settings)
          if (d?.cover) return d.cover
        }
      } else if (src === 'omdb') {
        if (hasOmdbKey(settings)) {
          const d = await fetchOmdbDetail(q, settings)
          if (d?.cover) return d.cover
        }
      } else if (src === 'openlibrary') {
        if (hasOpenLibraryKey(settings)) {
          const d = await fetchOpenLibraryDetail(q, settings)
          if (d?.cover) return d.cover
        }
      } else if (src === 'justwatch') {
        if (hasJustWatchKey(settings)) {
          const d = await fetchJustWatchDetail(q, settings)
          if (d?.cover) return d.cover
        }
      } else if (src === 'wikipedia') {
        if (hasWikipediaKey(settings)) {
          const d = await fetchWikipediaDetail(q, settings)
          if (d?.cover) return d.cover
        }
      }
    } catch {
      /* 单源失败继续下一个 */
    }
  }
  return null
}

export const DEFAULT_SOURCE_ORDER: SourceId[] = ['moviedb', 'omdb', 'openlibrary', 'justwatch', 'wikipedia']

/** v2.2.10：抓取事件回调（每次源尝试推一条），供 UI 实时展示"数据源失败 → 降级下一源" */
export interface SmartFetchEvent {
  code: string
  src: SourceId
  status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'
  detail?: string
}

export async function fetchDetailSmart(
  rawInput: string,
  settings: Settings,
  state: SmartFetchState,
  onEvent?: (e: SmartFetchEvent) => void,
  /** v2.6.5：true = 手工输入的检索词/ID（详情页「手工输入检索词/ID」窗口），各数据源自动提取失败时直接采用它 */
  manual = false
): Promise<MovieDetailResult> {
  // 入口统一清洗搜索词 — 调用方（ipc 单点/批量补齐、reconcile 兜底）可能传入
  // v.title / folderName / fileName；遇到带画质、语言、括号等噪声的脏字符串时搜索易失败，
  // 这里统一 extractMovieQuery（清洗标题 + 识别年份/ID），所有调用方自动受益。
  const q = extractMovieQuery(rawInput.trim())
  const code = q.query || rawInput.trim()
  const mode = settings.dataSource ?? 'auto'
  // 用户在设置里禁用了该数据源（单源模式仍强制指定某源时）：直接跳过
  if (mode !== 'auto' && settings.disabledSources?.includes(mode)) {
    return { detail: null, error: '此数据源已在设置中禁用（请在「设置 → 数据源」中启用）' }
  }
  const errors: string[] = []
  const onError = (m: string) => errors.push(m)
  const ev = (e: Omit<SmartFetchEvent, 'code'>) => onEvent?.({ code, ...e })
  if (mode === 'moviedb') {
    try {
      const moviedb = await fetchMovieDbDetail(q, settings, onError, manual)
      if (moviedb) return { detail: moviedb, source: 'moviedb' }
    } catch (e) {
      errors.push(`MovieDB 异常：${(e as Error)?.message || e}`)
    }
    return { detail: null, error: errors.length ? errors.join('；') : 'MovieDB 未返回结果' }
  } else if (mode === 'omdb') {
    try {
      const omdb = await fetchOmdbDetail(q, settings, onError, manual)
      if (omdb) return { detail: omdb, source: 'omdb' }
    } catch (e) {
      errors.push(`OMDb 异常：${(e as Error)?.message || e}`)
    }
    return { detail: null, error: errors.length ? errors.join('；') : 'OMDb 未返回结果' }
  } else if (mode === 'openlibrary') {
    try {
      const openLibrary = await fetchOpenLibraryDetail(q, settings, onError, manual)
      if (openLibrary) return { detail: openLibrary, source: 'openlibrary' }
    } catch (e) {
      errors.push(`OpenLibrary 异常：${(e as Error)?.message || e}`)
    }
    return { detail: null, error: errors.length ? errors.join('；') : 'OpenLibrary 未返回结果' }
  } else if (mode === 'justwatch') {
    try {
      const justWatch = await fetchJustWatchDetail(q, settings, onError, manual)
      if (justWatch) return { detail: justWatch, source: 'justwatch' }
    } catch (e) {
      errors.push(`JustWatch 异常：${(e as Error)?.message || e}`)
    }
    return { detail: null, error: errors.length ? errors.join('；') : 'JustWatch 未返回结果' }
  } else if (mode === 'wikipedia') {
    try {
      const wikipedia = await fetchWikipediaDetail(q, settings, onError, manual)
      if (wikipedia) return { detail: wikipedia, source: 'wikipedia' }
    } catch (e) {
      errors.push(`维基百科异常：${(e as Error)?.message || e}`)
    }
    return { detail: null, error: errors.length ? errors.join('；') : '维基百科未返回结果' }
  }
  // ---- auto：按自定义/推荐优先级降级 ----
  // 推荐顺序（信息全面度 / 获取难度 / 风控）：MovieDB → OMDb → OpenLibrary → JustWatch
  // 用户可在设置里自定义 1-8 优先级（customSourceOrder）；DEFAULT_SOURCE_ORDER 已在模块底部 export
  const rawOrder =
    settings.customSourceOrder && settings.customSourceOrder.length >= 1
      ? settings.customSourceOrder
      : DEFAULT_SOURCE_ORDER
  const order = rawOrder.filter((s) => !settings.disabledSources?.includes(s))
  // v2.2.9：每次抓取开头打印当前生效的顺序 + externalId，让用户能在 userData/logs/main.log 里
  // 直接看到"这次跑的是 MovieDB→OMDb→..."而不是猜（之前的日志滚动太快看不清顺序）
  console.log(`[smart] ${code} order=${order.join('→')}`)
  // v2.2.6 修复：完整记录每个源的结果（"跳过" / "无结果" / "抓到了" / "网络失败"），
  // 让用户清楚看到 5 个源都跑了哪些、为什么最终失败。errors 数组合并到最终的 return error。
  const srcResults: Array<{ src: string; status: 'hit' | 'skipped' | 'no-result' | 'network-failed'; detail?: string }> = []
  for (const src of order) {
    if (state.stop) break
    await waitIfPaused(state)
    if (state.stop) break
    
    if (src === 'moviedb') {
      if (!hasMovieDbKey(settings)) {
        const d = 'moviedb-not-configured'
        srcResults.push({ src, status: 'skipped', detail: d })
        ev({ src, status: 'skipped', detail: d })
      } else if (state.moviedbDisabled) {
        const d = 'moviedb-disabled'
        srcResults.push({ src, status: 'skipped', detail: d })
        ev({ src, status: 'skipped', detail: d })
      } else {
        ev({ src, status: 'trying' })
        try {
          const moviedb = await fetchMovieDbDetail(q, settings, undefined, manual)
          if (moviedb) {
            state.moviedbFails = 0
            srcResults.push({ src, status: 'hit' })
            ev({ src, status: 'hit' })
            console.log(`[smart] ${code} HIT ${src}`)
            return { detail: moviedb, source: 'moviedb' }
          }
          srcResults.push({ src, status: 'no-result' })
          ev({ src, status: 'no-result' })
        } catch (e) {
          const d = formatFetchError(e)
          console.error(`[smart] ${code} ${src} network-failed:`, e)
          srcResults.push({ src, status: 'network-failed', detail: d })
          ev({ src, status: 'network-failed', detail: d })
          state.moviedbFails++
          if (state.moviedbFails >= MOVIEDB_CONSECUTIVE_LIMIT) {
            state.moviedbDisabled = true
            console.log(`[batch] MovieDB 连续失败 ${state.moviedbFails} 部，本轮自动停用`)
          }
        }
      }
    } else if (src === 'omdb') {
      if (!hasOmdbKey(settings)) {
        const d = 'omdb-not-configured'
        srcResults.push({ src, status: 'skipped', detail: d })
        ev({ src, status: 'skipped', detail: d })
      } else if (state.omdbDisabled) {
        const d = 'omdb-disabled'
        srcResults.push({ src, status: 'skipped', detail: d })
        ev({ src, status: 'skipped', detail: d })
      } else {
        ev({ src, status: 'trying' })
        try {
          const omdb = await fetchOmdbDetail(q, settings, undefined, manual)
          if (omdb) {
            state.omdbFails = 0
            srcResults.push({ src, status: 'hit' })
            ev({ src, status: 'hit' })
            console.log(`[smart] ${code} HIT ${src}`)
            return { detail: omdb, source: 'omdb' }
          }
          srcResults.push({ src, status: 'no-result' })
          ev({ src, status: 'no-result' })
        } catch (e) {
          const d = formatFetchError(e)
          console.error(`[smart] ${code} ${src} network-failed:`, e)
          srcResults.push({ src, status: 'network-failed', detail: d })
          ev({ src, status: 'network-failed', detail: d })
          state.omdbFails++
          if (state.omdbFails >= OMDB_CONSECUTIVE_LIMIT) {
            state.omdbDisabled = true
            console.log(`[batch] OMDb 连续失败 ${state.omdbFails} 部，本轮自动停用`)
          }
        }
      }
    } else if (src === 'openlibrary') {
      if (state.openLibraryDisabled) {
        const d = 'openlibrary-disabled'
        srcResults.push({ src, status: 'skipped', detail: d })
        ev({ src, status: 'skipped', detail: d })
      } else {
        ev({ src, status: 'trying' })
        try {
          const openLibrary = await fetchOpenLibraryDetail(q, settings, undefined, manual)
          if (openLibrary) {
            state.openLibraryFails = 0
            srcResults.push({ src, status: 'hit' })
            ev({ src, status: 'hit' })
            console.log(`[smart] ${code} HIT ${src}`)
            return { detail: openLibrary, source: 'openlibrary' }
          }
          srcResults.push({ src, status: 'no-result' })
          ev({ src, status: 'no-result' })
        } catch (e) {
          const d = formatFetchError(e)
          console.error(`[smart] ${code} ${src} network-failed:`, e)
          srcResults.push({ src, status: 'network-failed', detail: d })
          ev({ src, status: 'network-failed', detail: d })
          state.openLibraryFails++
          if (state.openLibraryFails >= OPENLIBRARY_CONSECUTIVE_LIMIT) {
            state.openLibraryDisabled = true
            console.log(`[batch] OpenLibrary 连续失败 ${state.openLibraryFails} 部，本轮自动停用`)
          }
        }
      }
    } else if (src === 'justwatch') {
      if (state.justWatchDisabled) {
        const d = 'justwatch-disabled'
        srcResults.push({ src, status: 'skipped', detail: d })
        ev({ src, status: 'skipped', detail: d })
      } else {
        ev({ src, status: 'trying' })
        try {
          const justWatch = await fetchJustWatchDetail(q, settings, undefined, manual)
          if (justWatch) {
            state.justWatchFails = 0
            srcResults.push({ src, status: 'hit' })
            ev({ src, status: 'hit' })
            console.log(`[smart] ${code} HIT ${src}`)
            return { detail: justWatch, source: 'justwatch' }
          }
          srcResults.push({ src, status: 'no-result' })
          ev({ src, status: 'no-result' })
        } catch (e) {
          const d = formatFetchError(e)
          console.error(`[smart] ${code} ${src} network-failed:`, e)
          srcResults.push({ src, status: 'network-failed', detail: d })
          ev({ src, status: 'network-failed', detail: d })
          state.justWatchFails++
          if (state.justWatchFails >= JUSTWATCH_CONSECUTIVE_LIMIT) {
            state.justWatchDisabled = true
            console.log(`[batch] JustWatch 连续失败 ${state.justWatchFails} 部，本轮自动停用`)
          }
        }
      }
    } else if (src === 'wikipedia') {
      if (state.wikipediaDisabled) {
        const d = 'wikipedia-disabled'
        srcResults.push({ src, status: 'skipped', detail: d })
        ev({ src, status: 'skipped', detail: d })
      } else {
        ev({ src, status: 'trying' })
        try {
          const wikipedia = await fetchWikipediaDetail(q, settings, undefined, manual)
          if (wikipedia) {
            state.wikipediaFails = 0
            srcResults.push({ src, status: 'hit' })
            ev({ src, status: 'hit' })
            console.log(`[smart] ${code} HIT ${src}`)
            return { detail: wikipedia, source: 'wikipedia' }
          }
          srcResults.push({ src, status: 'no-result' })
          ev({ src, status: 'no-result' })
        } catch (e) {
          const d = formatFetchError(e)
          console.error(`[smart] ${code} ${src} network-failed:`, e)
          srcResults.push({ src, status: 'network-failed', detail: d })
          ev({ src, status: 'network-failed', detail: d })
          state.wikipediaFails++
          if (state.wikipediaFails >= WIKIPEDIA_CONSECUTIVE_LIMIT) {
            state.wikipediaDisabled = true
            console.log(`[batch] 维基百科 连续失败 ${state.wikipediaFails} 部，本轮自动停用`)
          }
        }
      }
    }
  }
  // v2.2.6 修：完整 5 源结果拼成错误消息（用户能看到"5 个源全试了"而不是只看到跳过提示）
  const STATUS_LABEL: Record<typeof srcResults[number]['status'], string> = {
    hit: '命中',
    skipped: '跳过',
    'no-result': '无结果',
    'network-failed': '网络失败'
  }
  const summary = srcResults
    .map((r) => {
      const label = STATUS_LABEL[r.status]
      return r.detail ? `${r.src}=${label}(${r.detail})` : `${r.src}=${label}`
    })
    .join('；')
  // v2.2.9：所有源都失败时打印完整 summary（让 userData/logs/main.log 里有清晰抓取记录）
  console.log(`[smart] ${code} FAILED: ${summary}`)
  return { detail: null, error: summary || '未知原因' }
}
