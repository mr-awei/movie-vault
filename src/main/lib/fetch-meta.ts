/**
 * 批量智能抓取（MovieDB → OMDb → OpenLibrary → JustWatch）。
 * v2.2.4 抽到独立模块：原在 ipc.ts 内，reconcile.ts 需要在「无片单兜底」分支
 * 直接调它来抓数据源详情，不能反向 import ipc.ts（会循环依赖）。
 *
 * P1-9 重构：5 个数据源 ×（单源模式 / auto 循环）的重复分支（原 ~150 行）收敛为
 * SOURCES 源表 + runSingleSource()，行为语义与 v2.6.5 完全一致：
 * - 数据源顺序：MovieDB → OMDb → OpenLibrary → JustWatch（可自定义）
 * - 任一源连续**网络失败** N 部 → 本轮自动禁用该源（不再浪费请求）；
 * - 「搜索无结果」属正常结果（该数据源确实没有这部影片），**不计数、不触发停止**——
 *   只有真正的网络/会话异常（请求失败、超时、年龄验证失败等）才累计失败次数，
 *   避免「IP 没被封、只是数据源没这个externalId」时批量被误停；
 * - 单源模式：不检查批量失败禁用状态、不累计失败（用户明确指定该源）。
 */
import { fetchMovieDbDetail, hasMovieDbKey } from './movie-db'
import { fetchOmdbDetail, hasOmdbKey } from './omdb'
import { fetchOpenLibraryDetail, hasOpenLibraryKey } from './openlibrary'
import { fetchJustWatchDetail, hasJustWatchKey } from './justwatch'
import { fetchWikipediaDetail, hasWikipediaKey } from './wikipedia'
import { extractMovieQuery, localCanonicalName, type MovieQuery } from '../../shared/code'
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

export const DEFAULT_SOURCE_ORDER: SourceId[] = ['moviedb', 'omdb', 'openlibrary', 'justwatch', 'wikipedia']

const CONSECUTIVE_LIMIT = 3

/** 单源执行结果（P1-9：供单源模式组装 error、auto 模式判断命中/继续） */
interface SingleResult {
  detail: MovieMeta | null
  source?: SourceId
  status: 'hit' | 'skipped' | 'no-result' | 'network-failed'
  /** 网络失败原始 message（单源模式 error 组装用） */
  failMessage?: string
}

interface SourceDef {
  fetch: (
    q: MovieQuery,
    settings: Settings,
    onError?: (m: string) => void,
    manual?: boolean
  ) => Promise<MovieMeta | null>
  hasKey: (s: Settings) => boolean
  failsKey: 'moviedbFails' | 'omdbFails' | 'openLibraryFails' | 'justWatchFails' | 'wikipediaFails'
  disabledKey: 'moviedbDisabled' | 'omdbDisabled' | 'openLibraryDisabled' | 'justWatchDisabled' | 'wikipediaDisabled'
  /** key 缺失时的跳过 detail（null = 该源无需 key） */
  keyDetail: string | null
  /** key 缺失时的最终错误（单源模式） */
  keyError: string
  /** 异常错误前缀（单源模式）：`Xxx 异常：` */
  errorLabel: string
  /** 无结果最终错误（单源模式）：`Xxx 未返回结果` */
  noResultMsg: string
}

const SOURCES: Record<SourceId, SourceDef> = {
  moviedb: {
    fetch: fetchMovieDbDetail,
    hasKey: hasMovieDbKey,
    failsKey: 'moviedbFails',
    disabledKey: 'moviedbDisabled',
    keyDetail: 'moviedb-not-configured',
    keyError: 'MovieDB API Key 未配置',
    errorLabel: 'MovieDB',
    noResultMsg: 'MovieDB 未返回结果'
  },
  omdb: {
    fetch: fetchOmdbDetail,
    hasKey: hasOmdbKey,
    failsKey: 'omdbFails',
    disabledKey: 'omdbDisabled',
    keyDetail: 'omdb-not-configured',
    keyError: 'OMDb API Key 未配置',
    errorLabel: 'OMDb',
    noResultMsg: 'OMDb 未返回结果'
  },
  openlibrary: {
    fetch: fetchOpenLibraryDetail,
    hasKey: hasOpenLibraryKey,
    failsKey: 'openLibraryFails',
    disabledKey: 'openLibraryDisabled',
    keyDetail: null,
    keyError: '',
    errorLabel: 'OpenLibrary',
    noResultMsg: 'OpenLibrary 未返回结果'
  },
  justwatch: {
    fetch: fetchJustWatchDetail,
    hasKey: hasJustWatchKey,
    failsKey: 'justWatchFails',
    disabledKey: 'justWatchDisabled',
    keyDetail: null,
    keyError: '',
    errorLabel: 'JustWatch',
    noResultMsg: 'JustWatch 未返回结果'
  },
  wikipedia: {
    fetch: fetchWikipediaDetail,
    hasKey: hasWikipediaKey,
    failsKey: 'wikipediaFails',
    disabledKey: 'wikipediaDisabled',
    keyDetail: null,
    keyError: '',
    errorLabel: '维基百科',
    noResultMsg: '维基百科未返回结果'
  }
}

/** 自动模式下「连续失败禁用」的中文日志标签 */
const DISABLE_LABEL: Record<SourceId, string> = {
  moviedb: 'MovieDB',
  omdb: 'OMDb',
  openlibrary: 'OpenLibrary',
  justwatch: 'JustWatch',
  wikipedia: '维基百科'
}

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
 * 各源返回约定：search → { posterUrl }（远程 URL，需 cacheRemoteImage）；
 * fetchXxxDetail → detail.cover（内部已下载到本地）。命中第一个有 cover 的源即返回本地路径。
 */
export async function fetchPosterSmart(video: Video, settings: Settings): Promise<string | null> {
  // v2.8.5：海报抓取搜索词统一用「本地真名」folderName 优先，与详情抓取保持一致
  const q = extractMovieQuery(localCanonicalName(video))
  if (!q.query) return null
  const rawOrder =
    settings.customSourceOrder && settings.customSourceOrder.length >= 1
      ? settings.customSourceOrder
      : DEFAULT_SOURCE_ORDER
  const order = rawOrder.filter((s) => !settings.disabledSources?.includes(s))
  for (const src of order) {
    try {
      const def = SOURCES[src]
      if (def.hasKey(settings)) {
        const d = await def.fetch(q, settings)
        if (d?.cover) return d.cover
      }
    } catch {
      /* 单源失败继续下一个 */
    }
  }
  return null
}

/** v2.2.10：抓取事件回调（每次源尝试推一条），供 UI 实时展示"数据源失败 → 降级下一源" */
export interface SmartFetchEvent {
  code: string
  src: SourceId
  status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed'
  detail?: string
}

interface RunCtx {
  q: MovieQuery
  settings: Settings
  manual: boolean
  state: SmartFetchState
  code: string
  ev: (e: Omit<SmartFetchEvent, 'code'>) => void
  /** auto 模式：null 表示不收集源结果明细（单源模式直接返回） */
  srcResults: Array<{ src: string; status: SingleResult['status']; detail?: string }> | null
  /** true = auto 模式：查禁用状态、累计连续失败；false = 单源模式：不查不计 */
  respectState: boolean
}

/** P1-9：执行单个数据源的抓取（key 检查 → 禁用检查 → trying → hit/no-result/network-failed） */
async function runSingleSource(src: SourceId, ctx: RunCtx): Promise<SingleResult> {
  const def = SOURCES[src]
  const push = (status: SingleResult['status'], detail?: string) => {
    ctx.ev({ src, status, detail })
    ctx.srcResults?.push({ src, status, detail })
  }
  // key 缺失（仅需 key 的源）
  if (def.keyDetail && !def.hasKey(ctx.settings)) {
    push('skipped', def.keyDetail)
    return { detail: null, status: 'skipped' }
  }
  // 本轮已因连续失败禁用（仅 auto 模式）
  if (ctx.respectState && ctx.state[def.disabledKey]) {
    push('skipped', `${src}-disabled`)
    return { detail: null, status: 'skipped' }
  }
  ctx.ev({ src, status: 'trying' })
  const srcErrors: string[] = []
  try {
    const d = await def.fetch(ctx.q, ctx.settings, (m) => srcErrors.push(m), ctx.manual)
    if (d) {
      if (ctx.respectState) ctx.state[def.failsKey] = 0
      push('hit')
      console.log(`[smart] ${ctx.code} HIT ${src}`)
      return { detail: d, source: src, status: 'hit' }
    }
    push('no-result', srcErrors.join('；') || undefined)
    return { detail: null, status: 'no-result' }
  } catch (e) {
    const d = formatFetchError(e)
    console.error(`[smart] ${ctx.code} ${src} network-failed:`, e)
    push('network-failed', d)
    if (ctx.respectState) {
      ctx.state[def.failsKey]++
      if (ctx.state[def.failsKey] >= CONSECUTIVE_LIMIT) {
        ctx.state[def.disabledKey] = true
        console.log(`[batch] ${DISABLE_LABEL[src]} 连续失败 ${ctx.state[def.failsKey]} 部，本轮自动停用`)
      }
    }
    return { detail: null, status: 'network-failed', failMessage: (e as Error)?.message || String(e) }
  }
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
  const ev = (e: Omit<SmartFetchEvent, 'code'>) => onEvent?.({ code, ...e })

  // ---- 单源模式：只跑指定源，不查批量禁用、不累计失败 ----
  if (mode !== 'auto') {
    const res = await runSingleSource(mode, { q, settings, manual, state, code, ev, srcResults: null, respectState: false })
    if (res.detail) return { detail: res.detail, source: res.source }
    if (res.status === 'skipped') return { detail: null, error: SOURCES[mode].keyError }
    if (res.status === 'network-failed') {
      errors.push(`${SOURCES[mode].errorLabel} 异常：${res.failMessage}`)
    }
    return { detail: null, error: errors.length ? errors.join('；') : SOURCES[mode].noResultMsg }
  }

  // ---- auto：按自定义/推荐优先级降级 ----
  const rawOrder =
    settings.customSourceOrder && settings.customSourceOrder.length >= 1
      ? settings.customSourceOrder
      : DEFAULT_SOURCE_ORDER
  const order = rawOrder.filter((s) => !settings.disabledSources?.includes(s))
  // v2.2.9：每次抓取开头打印当前生效的顺序 + externalId，让用户能在 userData/logs/main.log 里
  // 直接看到"这次跑的是 MovieDB→OMDb→..."而不是猜
  console.log(`[smart] ${code} order=${order.join('→')}`)
  // v2.2.6 修复：完整记录每个源的结果（"跳过" / "无结果" / "抓到了" / "网络失败"），
  // 让用户清楚看到 5 个源都跑了哪些、为什么最终失败
  const srcResults: Array<{ src: string; status: SingleResult['status']; detail?: string }> = []
  for (const src of order) {
    if (state.stop) break
    await waitIfPaused(state)
    if (state.stop) break
    const res = await runSingleSource(src, { q, settings, manual, state, code, ev, srcResults, respectState: true })
    if (res.detail) return { detail: res.detail, source: res.source }
  }
  const STATUS_LABEL: Record<SingleResult['status'], string> = {
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
