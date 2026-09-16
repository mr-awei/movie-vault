import type { DuplicateGroup, Video } from '../../shared/types'
import { listVideos } from './repo'

/**
 * 重复视频检测模块（增强版）。
 * 三级检测：
 * 1. exact：contentHash（文件大小 + 前 64KB sha1）完全相同 —— 同一文件的精确副本
 * 2. title：归一化标题 + 年份匹配 —— 不同编码/压制的同一电影
 * 3. feature：时长（±5%）+ 分辨率 + 文件大小（±10%）特征匹配 —— 标题不同但内容可能相同
 *
 * 性能优化：先按标题+年份快速分组（O(n log n)），再在组内做精确匹配和特征匹配，
 * 避免全量两两比较（O(n²)）。
 */

/** 标题归一化：去除特殊字符、统一大小写、去除多余空格 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[《》【】\[\]()（）{}]/g, ' ')
    .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 从 techInfo 中提取分辨率字符串 */
function getResolution(v: Video): string | undefined {
  const info = v.techInfo
  if (!info) return undefined
  const w = info.width
  const h = info.height
  if (!w || !h) return undefined
  if (h >= 2160) return '4K'
  if (h >= 1440) return '2K'
  if (h >= 1080) return '1080p'
  if (h >= 720) return '720p'
  if (h >= 480) return '480p'
  return 'SD'
}

/** 判断两个视频是否特征匹配（时长±5% + 分辨率相同 + 大小±10%） */
function isFeatureMatch(a: Video, b: Video): boolean {
  // 时长匹配（±5%，至少 60 秒）
  const durA = a.durationSec ?? a.techInfo?.durationSec
  const durB = b.durationSec ?? b.techInfo?.durationSec
  if (durA && durB && durA > 60 && durB > 60) {
    const diff = Math.abs(durA - durB) / Math.max(durA, durB)
    if (diff > 0.05) return false
  } else {
    return false // 没有时长信息不做特征匹配
  }

  // 分辨率匹配
  const resA = getResolution(a)
  const resB = getResolution(b)
  if (resA && resB && resA !== resB) return false

  // 文件大小匹配（±10%）
  const sizeA = a.fileSize
  const sizeB = b.fileSize
  if (sizeA && sizeB && sizeA > 0 && sizeB > 0) {
    const diff = Math.abs(sizeA - sizeB) / Math.max(sizeA, sizeB)
    if (diff > 0.1) return false
  }

  return true
}

/** 计算分组的可释放空间（保留最大的一份） */
function calcWasted(videos: Video[]): { totalSizeBytes: number; wastedBytes: number; keepIndex: number } {
  const totalSizeBytes = videos.reduce((sum, v) => sum + (v.fileSize ?? 0), 0)
  let keepIndex = 0
  let maxSize = 0
  videos.forEach((v, i) => {
    if ((v.fileSize ?? 0) > maxSize) {
      maxSize = v.fileSize ?? 0
      keepIndex = i
    }
  })
  const wastedBytes = totalSizeBytes - maxSize
  return { totalSizeBytes, wastedBytes, keepIndex }
}

/** 将 Video 转换为 DuplicateGroup 中的视频项 */
function toDupVideo(v: Video, recommended = false): DuplicateGroup['videos'][number] {
  return {
    id: v.id,
    title: v.title,
    path: v.path,
    fileSize: v.fileSize,
    addedAt: v.addedAt,
    year: v.year,
    durationSec: v.durationSec ?? v.techInfo?.durationSec,
    resolution: getResolution(v),
    recommended
  }
}

/**
 * 查找指定媒体库中的重复视频。
 * 按三级检测分组，返回组内 > 1 的分组。
 * 精确匹配优先，避免同一个视频出现在多个组中。
 */
export async function findDuplicates(libraryId: string): Promise<DuplicateGroup[]> {
  const videos = await listVideos({ libraryId })
  const result: DuplicateGroup[] = []
  const usedIds = new Set<string>()

  // ========== 第一级：精确匹配（contentHash） ==========
  const hashGroups = new Map<string, Video[]>()
  for (const v of videos) {
    if (!v.contentHash) continue
    const existing = hashGroups.get(v.contentHash)
    if (existing) {
      existing.push(v)
    } else {
      hashGroups.set(v.contentHash, [v])
    }
  }

  for (const [key, group] of hashGroups) {
    if (group.length < 2) continue
    const { totalSizeBytes, wastedBytes, keepIndex } = calcWasted(group)
    result.push({
      key: `exact:${key}`,
      matchType: 'exact',
      videos: group.map((v, i) => toDupVideo(v, i === keepIndex)),
      totalSizeBytes,
      wastedBytes
    })
    group.forEach((v) => usedIds.add(v.id))
  }

  // ========== 第二级：标题匹配（归一化标题 + 年份） ==========
  // 先按归一化标题+年份分组
  const titleGroups = new Map<string, Video[]>()
  for (const v of videos) {
    if (usedIds.has(v.id)) continue
    if (!v.title) continue
    const normTitle = normalizeTitle(v.title)
    if (!normTitle) continue
    const groupKey = `${normTitle}|${v.year ?? 'unknown'}`
    const existing = titleGroups.get(groupKey)
    if (existing) {
      existing.push(v)
    } else {
      titleGroups.set(groupKey, [v])
    }
  }

  for (const [key, group] of titleGroups) {
    if (group.length < 2) continue
    const { totalSizeBytes, wastedBytes, keepIndex } = calcWasted(group)
    result.push({
      key: `title:${key}`,
      matchType: 'title',
      videos: group.map((v, i) => toDupVideo(v, i === keepIndex)),
      totalSizeBytes,
      wastedBytes
    })
    group.forEach((v) => usedIds.add(v.id))
  }

  // ========== 第三级：特征匹配（时长 + 分辨率 + 大小） ==========
  // 只对有完整技术信息的视频做特征匹配
  const candidates = videos.filter((v) => {
    if (usedIds.has(v.id)) return false
    const dur = v.durationSec ?? v.techInfo?.durationSec
    return dur && dur > 60 && v.fileSize && v.fileSize > 0
  })

  // 按时长分桶（每 60 秒一个桶），减少两两比较次数
  const durationBuckets = new Map<number, Video[]>()
  for (const v of candidates) {
    const dur = v.durationSec ?? v.techInfo?.durationSec!
    const bucket = Math.floor(dur / 60)
    // 检查相邻桶（±1 桶，因为 ±5% 可能跨桶）
    for (let b = bucket - 1; b <= bucket + 1; b++) {
      const existing = durationBuckets.get(b)
      if (existing) {
        existing.push(v)
      } else {
        durationBuckets.set(b, [v])
      }
    }
  }

  const featureUsed = new Set<string>()
  for (const [, bucketVideos] of durationBuckets) {
    if (bucketVideos.length < 2) continue
    // 在桶内做两两比较
    for (let i = 0; i < bucketVideos.length; i++) {
      for (let j = i + 1; j < bucketVideos.length; j++) {
        const a = bucketVideos[i]
        const b = bucketVideos[j]
        if (featureUsed.has(a.id) || featureUsed.has(b.id)) continue
        if (isFeatureMatch(a, b)) {
          // 找到一个特征匹配组，尝试找更多
          const group = [a, b]
          featureUsed.add(a.id)
          featureUsed.add(b.id)
          // 在桶内继续找匹配的
          for (let k = j + 1; k < bucketVideos.length; k++) {
            const c = bucketVideos[k]
            if (featureUsed.has(c.id)) continue
            if (isFeatureMatch(a, c)) {
              group.push(c)
              featureUsed.add(c.id)
            }
          }
          if (group.length >= 2) {
            const { totalSizeBytes, wastedBytes, keepIndex } = calcWasted(group)
            result.push({
              key: `feature:${group.map((v) => v.id).join('-')}`,
              matchType: 'feature',
              videos: group.map((v, idx) => toDupVideo(v, idx === keepIndex)),
              totalSizeBytes,
              wastedBytes
            })
          }
        }
      }
    }
  }

  // 按可释放空间降序排列
  result.sort((a, b) => b.wastedBytes - a.wastedBytes)
  return result
}

/** 按匹配类型统计重复数量 */
