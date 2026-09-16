import { EnvHttpProxyAgent, ProxyAgent, type Dispatcher } from 'undici'
import http from 'node:http'
import https from 'node:https'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { app, session } from 'electron'
import type { ProxyMode, Settings } from '../../shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export { UA }

/**
 * 按 Settings 构建 undici Dispatcher（代理出口）。
 * - none：不走代理，返回 undefined
 * - system：读取 HTTP_PROXY / HTTPS_PROXY / NO_PROXY 环境变量（undici EnvHttpProxyAgent）
 * - http / https：标准 CONNECT 代理（ProxyAgent）
 * - socks4 / socks5：undici 6.x 没有原生 SOCKS5 支持，这里不返回 dispatcher，
 *   改由 proxyFetch() 走 node:http(s) + SocksProxyAgent（见下）。
 * 结果按配置缓存，避免每次请求都 new 一个 Agent。
 */
let cacheKey = ''
let cacheDispatcher: Dispatcher | undefined = undefined

export function getDispatcher(settings: Settings): Dispatcher | undefined {
  const mode: ProxyMode = settings.proxyMode ?? 'none'
  const key = `${mode}|${settings.proxyHost ?? ''}|${settings.proxyPort ?? ''}|${settings.proxyUser ?? ''}|${settings.proxyPass ?? ''}`
  if (key === cacheKey) return cacheDispatcher
  cacheKey = key
  cacheDispatcher = buildDispatcher(mode, settings)
  return cacheDispatcher
}

function buildDispatcher(mode: ProxyMode, s: Settings): Dispatcher | undefined {
  if (mode === 'none') return undefined
  if (mode === 'system') return new EnvHttpProxyAgent()

  if (mode === 'http' || mode === 'https') {
    const proto = mode === 'https' ? 'https' : 'http'
    let auth = ''
    if (s.proxyUser) {
      auth = `${encodeURIComponent(s.proxyUser)}:${encodeURIComponent(s.proxyPass)}@`
    }
    const url = `${proto}://${auth}${s.proxyHost}:${s.proxyPort}`
    return new ProxyAgent(url)
  }

  // socks4 / socks5：交给 proxyFetch() 处理，这里没有可用 dispatcher
  return undefined
}

/** 当前是否配置了 SOCKS 代理（需要走 node:http(s) 通道） */
export function isSocksMode(settings?: Settings): boolean {
  const mode: ProxyMode = settings?.proxyMode ?? 'none'
  return mode === 'socks4' || mode === 'socks5'
}

let socksCacheKey = ''
let socksAgent: SocksProxyAgent | undefined

/**
 * SocksProxyAgent 只接受一个代理 URL；注意协议用 socks5h / socks4a——
 * 这两个变体会把**域名交给代理远端解析**，绕过本地被污染的 DNS。
 * （socks5 / socks4 会先在本地 dns.lookup，被墙环境下会解析到错误 IP。）
 */
function getSocksAgent(s: Settings): SocksProxyAgent {
  const mode: ProxyMode = s.proxyMode ?? 'none'
  const key = `${mode}|${s.proxyHost ?? ''}|${s.proxyPort ?? ''}|${s.proxyUser ?? ''}|${s.proxyPass ?? ''}`
  if (key === socksCacheKey && socksAgent) return socksAgent
  socksCacheKey = key
  const proto = mode === 'socks4' ? 'socks4a' : 'socks5h'
  let auth = ''
  if (s.proxyUser) {
    auth = `${encodeURIComponent(s.proxyUser)}:${encodeURIComponent(s.proxyPass ?? '')}@`
  }
  socksAgent = new SocksProxyAgent(`${proto}://${auth}${s.proxyHost}:${s.proxyPort}`)
  return socksAgent
}

export interface ProxyFetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

/**
 * 统一的带代理 fetch：
 * - http / https / system：undici fetch + dispatcher（支持 CONNECT 隧道）
 * - socks4 / socks5：node:http(s) + SocksProxyAgent，返回标准 Response
 *
 * 数据源与图片下载都应调用它，而不是直接用全局 fetch + dispatcher——
 * undici 6.x 的自定义 connector 无法正确处理 SOCKS 隧道（TLS 与 readable 数据流都会断）。
 */
export function proxyFetch(
  url: string,
  init: ProxyFetchInit,
  settings?: Settings
): Promise<Response> {
  if (settings && isSocksMode(settings)) return socksFetch(url, init, settings)
  return fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
    dispatcher: settings ? getDispatcher(settings) : undefined
  } as RequestInit)
}

function socksFetch(url: string, init: ProxyFetchInit, settings: Settings): Promise<Response> {
  const agent = getSocksAgent(settings)
  const lib = url.startsWith('https:') ? https : http
  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: init.method ?? 'GET',
        headers: init.headers,
        agent
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer | string) => chunks.push(Buffer.from(c)))
        res.on('end', () => {
          // Node 的 res.headers 允许数组值（如 set-cookie），转成 Response 可接受的纯字符串表
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) headers[k] = v.join(', ')
            else if (v != null) headers[k] = String(v)
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 500,
              statusText: res.statusMessage ?? '',
              headers
            })
          )
        })
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    if (init.signal) {
      const onAbort = () => req.destroy(new Error('The operation was aborted'))
      if (init.signal.aborted) onAbort()
      else init.signal.addEventListener('abort', onAbort, { once: true })
    }
    if (init.body != null) req.write(init.body)
    req.end()
  })
}

/** 仅用于测试连接：返回当前代理配置下能否连通目标（默认 httpbin.org） */
export async function testProxyConnectivity(
  settings: Settings,
  target = 'https://httpbin.org/get'
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await proxyFetch(
      target,
      { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html' } },
      settings
    )
    return { ok: res.ok, status: res.status }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 把代理配置同步到 Electron Chromium session —— 这样 net.fetch（主进程）和渲染进程
 * 的图片请求也会走代理，与 Node.js 侧保持一致。
 * 必须在 app.whenReady() 之后调用（session.defaultSession 此时才可用）。
 */
export function applyProxyToSession(settings: Settings): void {
  try {
    const mode: ProxyMode = settings.proxyMode ?? 'none'
    if (mode === 'none') {
      session.defaultSession.setProxy({ mode: 'direct' })
      return
    }
    if (mode === 'system') {
      session.defaultSession.setProxy({ mode: 'system' })
      return
    }
    if (mode === 'http' || mode === 'https') {
      const proto = mode === 'https' ? 'https' : 'http'
      // P1-10：Chromium 忽略 proxyRules 内嵌的 user:pass，认证改由 app.on('login') 提供
      proxyCredentials = settings.proxyUser ? { user: settings.proxyUser, pass: settings.proxyPass ?? '' } : null
      const url = `${proto}://${settings.proxyHost}:${settings.proxyPort}`
      session.defaultSession.setProxy({ proxyRules: url })
      return
    }
    // socks4 / socks5：Chromium 只支持 socks5（socks5 同样由代理端解析域名）
    proxyCredentials = settings.proxyUser ? { user: settings.proxyUser, pass: settings.proxyPass ?? '' } : null
    const url = `socks5://${settings.proxyHost}:${settings.proxyPort}`
    session.defaultSession.setProxy({ proxyRules: url })
  } catch {
    /* session 可能尚未 ready，静默跳过；下次 applyRuntimeSettings 会再试 */
  }
}

/** P1-10：Chromium 代理认证——登录事件里回填凭据，修复带账号密码代理下渲染端图片 407 裂图 */
let proxyCredentials: { user: string; pass: string } | null = null

export function registerProxyAuth(): void {
  app.on('login', (event, _webContents, details, _authInfo, callback) => {
    if (!(details as { isProxy?: boolean }).isProxy || !proxyCredentials) return
    event.preventDefault()
    callback(proxyCredentials.user, proxyCredentials.pass)
  })
}
