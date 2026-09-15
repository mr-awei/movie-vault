import type { DuplicateGroup, Video } from '../../shared/types'
import { listVideos } from './repo'

/**
 * 重复视频检测模块。
 * 基于 contentHash（文件大小 + 前 64KB sha1）分组识别重复项。
 * 相同 contentHash 意味着文件内容头部一致，极大概率是同一视频的副本。
 */

/**
 * 查找指定媒体库中的重复视频。
 * 按 contentHash 分组，返回组内 > 1 的分组。
 */
export async function findDuplicates(libraryId: string): Promise<DuplicateGroup[]> {
  const videos = await listVideos({ libraryId })
  const groups = new Map<string, Video[]>()

  for (const v of videos) {
    if (!v.contentHash) continue
    const existing = groups.get(v.contentHash)
    if (existing) {
      existing.push(v)
    } else {
      groups.set(v.contentHash, [v])
    }
  }

  const result: DuplicateGroup[] = []
  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const totalSizeBytes = group.reduce((sum, v) => sum + (v.fileSize ?? 0), 0)
    // 保留最大的一份，其余可删除
    const maxSize = Math.max(...group.map((v) => v.fileSize ?? 0))
    const wastedBytes = totalSizeBytes - maxSize
    result.push({
      key,
      videos: group.map((v) => ({
        id: v.id,
        title: v.title,
        path: v.path,
        fileSize: v.fileSize,
        addedAt: v.addedAt
      })),
      totalSizeBytes,
      wastedBytes
    })
  }

  // 按可释放空间降序排列
  result.sort((a, b) => b.wastedBytes - a.wastedBytes)
  return result
}
