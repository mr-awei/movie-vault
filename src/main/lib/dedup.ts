import type { DuplicateGroup, Video } from '../../shared/types'
import { listVideos, setVideoPhash, getSettings } from './repo'
import { computePhash, phashDistance } from './phash'

/**
 * 重复视频检测模块（增强版）。
 * 三级检测：
 * 1. exact：contentHash（文件大小 + 前 64KB sha1）完全相同 —— 同一文件的精确副本
 * 2. title：归一化标题 + 年份匹配 —— 不同编码/压制的同一电影
 * 3. feature：标题相似 + 时长（±1%，绝对差≤90s）+ 分辨率 + 文件大小（±2%）特征匹配 —— 同内容不同命名的兜底
 *
 * 性能优化：先按标题+年份快速分组（O(n log n)），再在组内做精确匹配和特征匹配，
 * 避免全量两两比较（O(n²)）。
 * 注：v2.11.1 收紧特征匹配阈值并增加标题相似度门槛（编辑距离 ≥0.75），
 * 防止片长/体积分布接近但内容完全不同的影片被误判为重复（防误删优先）。
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

/** 编辑距离（Levenshtein），滚动数组省内存 */
function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0)
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[n]
}

/**
 * 标题相似度校验：归一化编辑距离相似度 ≥ 0.75 才视为「可能同内容」。
 * 特征匹配只对标题相近的候选生效，防止片长/体积分布接近但完全不同的作品被误判为重复。
 */
function isTitleSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen < 3) return false
  return 1 - editDistance(na, nb) / maxLen >= 0.75
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

/**
 * 判断两个视频是否特征匹配。
 * 收紧策略（v2.11.1 防误判）：标题相似 + 时长±1%（绝对差≤90s）+ 分辨率双方必须相同 + 大小±2%。
 * 三级检测里特征匹配是最低置信度信号，宁可漏检不可误报（误报会引导用户删错文件）。
 */
function isFeatureMatch(a: Video, b: Video): boolean {
  // 标题相似：不同作品的片长/体积经常分布相近（尤其同类型影片），必须有标题依据
  if (!isTitleSimilar(a.title ?? '', b.title ?? '')) return false

  // 时长匹配（±1%，且绝对差 ≤ 90 秒）
  const durA = a.durationSec ?? a.techInfo?.durationSec
  const durB = b.durationSec ?? b.techInfo?.durationSec
  if (durA && durB && durA > 60 && durB > 60) {
    const diff = Math.abs(durA - durB) / Math.max(durA, durB)
    if (diff > 0.01 || Math.abs(durA - durB) > 90) return false
  } else {
    return false // 没有时长信息不做特征匹配
  }

  // 分辨率匹配：双方都必须有分辨率且相同（同内容不同压制分辨率一致）
  const resA = getResolution(a)
  const resB = getResolution(b)
  if (!resA || !resB || resA !== resB) return false

  // 文件大小匹配（±2%）：同内容的不同码率/封装体积差应在小范围
  const sizeA = a.fileSize
  const sizeB = b.fileSize
  if (sizeA && sizeB && sizeA > 0 && sizeB > 0) {
    const diff = Math.abs(sizeA - sizeB) / Math.max(sizeA, sizeB)
    if (diff > 0.02) return false
  } else {
    return false
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
 * 惰性计算缺失的内容感知哈希（phash）。
 * 只对没有 phash 的视频抽帧计算（串行，避免 ffmpeg 并发抢 IO），结果写库持久化。
 */
async function ensurePhashes(videos: Video[]): Promise<void> {
  const pending = videos.filter((v) => !v.phash && v.path)
  if (pending.length === 0) return
  const settings = await getSettings()
  let done = 0
  for (const v of pending) {
    const h = await computePhash(v.path, settings)
    if (h) {
      v.phash = h
      setVideoPhash(v.id, h)
    }
    done++
    console.log(`[dedup] phash 计算 ${done}/${pending.length} ${v.fileName ?? v.title}`)
  }
}

/**
 * 查找指定媒体库中的重复视频。
 * 四级检测：精确哈希 / 标题 / 特征 / 内容感知哈希(phash)。
 * 精确匹配优先，避免同一个视频出现在多个组中。
 */
export async function findDuplicates(libraryId: string): Promise<DuplicateGroup[]> {
  const videos = await listVideos({ libraryId })
  const result: DuplicateGroup[] = []
  const usedIds = new Set<string>()

  // 先补齐缺失的 phash（惰性计算 + 持久化）
  await ensurePhashes(videos)

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

  // ========== 第四级：内容感知哈希（phash，容忍转码/缩放/水印） ==========
  // 防误删优先：phash 命中仍需标题相似（同内容不同命名/压制），且阈值保守（≤12/64 bit）
  const phashCandidates = videos.filter((v) => !usedIds.has(v.id) && v.phash)
  const phashUsed = new Set<string>()
  for (let i = 0; i < phashCandidates.length; i++) {
    for (let j = i + 1; j < phashCandidates.length; j++) {
      const a = phashCandidates[i]
      const b = phashCandidates[j]
      if (phashUsed.has(a.id) || phashUsed.has(b.id)) continue
      if (!isTitleSimilar(a.title ?? '', b.title ?? '')) continue
      if (phashDistance(a.phash!, b.phash!) > 12) continue
      const group = [a, b]
      phashUsed.add(a.id)
      phashUsed.add(b.id)
      for (let k = j + 1; k < phashCandidates.length; k++) {
        const c = phashCandidates[k]
        if (phashUsed.has(c.id)) continue
        if (isTitleSimilar(a.title ?? '', c.title ?? '') && phashDistance(a.phash!, c.phash!) <= 12) {
          group.push(c)
          phashUsed.add(c.id)
        }
      }
      if (group.length >= 2) {
        const { totalSizeBytes, wastedBytes, keepIndex } = calcWasted(group)
        result.push({
          key: `phash:${group.map((v) => v.id).join('-')}`,
          matchType: 'phash',
          videos: group.map((v, idx) => toDupVideo(v, idx === keepIndex)),
          totalSizeBytes,
          wastedBytes
        })
      }
    }
  }

  // 按可释放空间降序排列
  result.sort((a, b) => b.wastedBytes - a.wastedBytes)
  return result
}

/** 按匹配类型统计重复数量 */
