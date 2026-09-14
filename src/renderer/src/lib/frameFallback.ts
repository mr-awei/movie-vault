import { useEffect, useState } from 'react'
import type { Video } from '../../../shared/types'
import { api } from './api'

/**
 * 无封面 → ffmpeg 截帧兜底（懒加载）。
 *
 * 卡片/缩略图在「没有可用封面」时才请求主进程截 1 帧视频画面作封面，
 * 成功后在会话内缓存（frameFallbackCache）并回填视频记录（posterSource='ffmpeg'），
 * 下次进库直接走持久化封面，不再重复截帧。
 *
 * 并发控制：同时最多 2 个 ffmpeg 进程，避免滚墙时瞬间拉起几十个。
 */

/** 会话级兜底缓存：videoId → 截帧封面路径 */
export const frameFallbackCache = new Map<string, string>()

/** 已请求过的 id（含进行中/失败），本次会话不再重复发起 */
const requested = new Set<string>()

interface FrameJob {
  id: string
  cb: (poster: string | null) => void
}

const queue: FrameJob[] = []
let inFlight = 0
const MAX_IN_FLIGHT = 2

function pump(): void {
  while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
    const job = queue.shift()!
    inFlight++
    api
      .videoFrameFallback(job.id)
      .then((p) => {
        if (p) frameFallbackCache.set(job.id, p)
        job.cb(p)
      })
      .catch(() => job.cb(null))
      .finally(() => {
        inFlight--
        pump()
      })
  }
}

/** 请求一次截帧兜底；已有缓存/已请求过则直接回调缓存结果或跳过 */
export function requestFrameFallback(id: string, cb: (poster: string | null) => void): void {
  const cached = frameFallbackCache.get(id)
  if (cached) {
    cb(cached)
    return
  }
  if (requested.has(id)) return
  requested.add(id)
  queue.push({ id, cb })
  pump()
}

/**
 * 懒加载截帧兜底 Hook。
 *
 * - 虚拟墙会复用组件实例（EntryCard 无 key），因此本地状态必须跟随 videoId 重置；
 * - hasValidSrc 非空（有真实封面）时不触发截帧，同时清掉可能残留的本地兜底状态；
 * - 无封面/封面加载失败时自动排队请求一帧，返回的 fallbackPoster 可当封面展示；
 * - isFrameFallback = 当前展示的是截帧画面（用于显示「截帧」标识）。
 */
export function useFrameFallback(
  video: Video | undefined,
  hasValidSrc: string | null
): { fallbackPoster: string | null; isFrameFallback: boolean } {
  const videoId = video?.id
  const [fallbackPoster, setFallbackPoster] = useState<string | null>(null)

  useEffect(() => {
    // 视频切换 → 先清掉上一个视频的兜底状态
    setFallbackPoster(null)
    const id = videoId
    if (!id) return
    const cached = frameFallbackCache.get(id)
    if (cached) {
      setFallbackPoster(cached)
      return
    }
    // 已禁用：自动截帧兜底会和 preview-task-queue 抢 ffmpeg 资源导致 CPU 爆炸
    // preview-task-queue 启动后会统一处理封面/预览生成
    // if (!hasValidSrc) {
    //   requestFrameFallback(id, (p) => {
    //     if (p) setFallbackPoster(p)
    //   })
    // }
  }, [videoId, hasValidSrc])

  return {
    fallbackPoster,
    // 持久化记录里已是截帧（posterSource='ffmpeg'）也算截帧画面
    isFrameFallback: !!fallbackPoster || video?.posterSource === 'ffmpeg'
  }
}
