/**
 * 图片 / 类别 工具函数
 *
 * 包含：
 * - cleanGenreName(): 清洗类别名称（去数字后缀、括号、纯分隔符）
 * - cacheRemoteImage(): 真正把远程图片下载并缓存到本地
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Settings } from '../../shared/types'
import { proxyFetch, UA } from './proxy'

/**
 * 清洗类别名称，去除数字后缀、括号、纯分隔符等
 * @param genre 原始类别名称
 * @returns 清洗后的类别名称，如果为空则返回 null
 */
export function cleanGenreName(genre: string): string | null {
  if (!genre || typeof genre !== 'string') return null
  
  // 去除数字后缀（如 "剧情 2" → "剧情"）
  let cleaned = genre.replace(/\s*\d+$/, '')
  
  // 去除括号内容（如 "剧情（爱情）" → "剧情"）
  cleaned = cleaned.replace(/\s*（[^）]*）$/, '') // 中文括号
  cleaned = cleaned.replace(/\s*\([^)]*\)$/, '')  // 英文括号
  
  // 去除纯分隔符（如 "/"、"、"、"、" 等）
  cleaned = cleaned.replace(/^[/\\,，、\s-]+/, '')
  cleaned = cleaned.replace(/[/\\,，、\s-]+$/, '')
  
  // 去除特殊符号和空白
  cleaned = cleaned.replace(/[\[\]{}【】「」""''（）()<>]/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  
  // 如果清洗后为空，返回 null
  return cleaned.length > 0 ? cleaned : null
}

/**
 * 把远程图片真正下载并缓存到本地，返回本地绝对路径；失败返回 null（不抛异常）。
 *
 * 约定（与各数据源一致）：失败不抛，错误通过 onError 收集，
 * 调用方用 Promise.all + null 过滤处理，避免单个坏图拖垮整批。
 *
 * @param imageUrl 远程图片 URL（http/https）
 * @param key      缓存文件名（不含扩展名），建议带数据源前缀避免冲突，如 `moviedb-cover-123`
 * @param settings 全局设置（用于代理出口与 UA）
 * @param base     数据源 base URL，仅作为 Referer 提示（部分图床防盗链需要）
 * @param onError  下载失败时的回调（接收原因字符串）
 * @returns 本地图片绝对路径；URL 为空或下载失败返回 null
 */
export async function cacheRemoteImage(
  imageUrl: string,
  key?: string,
  settings?: Settings,
  base?: string,
  onError?: (reason: string) => void
): Promise<string | null> {
  if (!imageUrl) {
    onError?.('Image URL is required')
    return null
  }

  const imagesDir = path.join(app.getPath('userData'), 'images')
  await fs.mkdir(imagesDir, { recursive: true })

  // 扩展名：优先从 URL pathname 取，否则按内容嗅探，最后兜底 .jpg
  let ext = '.jpg'
  try {
    const pn = new URL(imageUrl).pathname
    const m = pn.match(/\.([a-z0-9]+)(?:\?.*)?$/i)
    if (m) ext = '.' + m[1].toLowerCase()
  } catch {
    /* URL 解析失败则用兜底扩展名 */
  }
  const safeKey = (key || `img_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_')
  const localPath = path.join(imagesDir, `${safeKey}${ext}`)

  // 命中缓存：直接复用，省一次网络请求
  try {
    await fs.access(localPath)
    return localPath
  } catch {
    /* 文件不存在，继续下载 */
  }

  // Referer：优先用 base（数据源域名），否则用图片自身 origin
  let referer = base && /^https?:\/\//i.test(base) ? base : ''
  try {
    if (!referer) referer = new URL(imageUrl).origin
  } catch {
    referer = ''
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const res = await proxyFetch(
      imageUrl,
      {
        signal: ctrl.signal,
        headers: {
          'User-Agent': UA,
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
          Referer: referer || imageUrl,
          'Sec-Fetch-Dest': 'image'
        }
      },
      settings
    )
    if (!res.ok) {
      const reason = `HTTP ${res.status} ${res.statusText}`
      onError?.(reason)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    // 轻量校验：空文件或非图片魔数（避免把 HTML 错误页存成图片）
    if (buf.length < 64 || !isImageBuffer(buf)) {
      const reason = '响应不是有效图片（内容校验失败）'
      onError?.(reason)
      return null
    }
    await fs.writeFile(localPath, buf)
    return localPath
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    onError?.(reason)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 常见图片文件头魔数校验 */
function isImageBuffer(buf: Buffer): boolean {
  const sig =
    buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff || // JPEG
    (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) || // PNG
    (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) || // GIF
    (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) || // WEBP (RIFF)
    (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) // WEBP (ftyp)
  return sig
}