import { useEffect, useState } from 'react'
import type { DuplicateGroup, DuplicateMatchType } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'
import { formatSize } from '../lib/util'

interface Props {
  onClose: () => void
  libraryId: string
}

/** 匹配类型的显示配置 */
const MATCH_TYPE_CONFIG: Record<DuplicateMatchType, { label: string; color: string; desc: string }> = {
  exact: {
    label: '精确匹配',
    color: 'text-red-400',
    desc: '文件内容指纹完全相同（大小 + 头部 64KB 哈希），是同一文件的精确副本'
  },
  title: {
    label: '标题匹配',
    color: 'text-yellow-400',
    desc: '归一化标题 + 年份相同，可能是不同编码/压制的同一电影'
  },
  feature: {
    label: '特征匹配',
    color: 'text-blue-400',
    desc: '标题相似 + 时长（±1%）+ 分辨率 + 文件大小（±2%）特征相似，仅作同内容不同命名的兜底'
  }
}

/**
 * 重复视频检测模态框（增强版）。
 * 三级检测：精确匹配 / 标题匹配 / 特征匹配。
 * 按匹配类型分组展示，标注推荐保留版本。
 */
export default function DuplicateModal({ onClose, libraryId }: Props) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [totalWasted, setTotalWasted] = useState(0)
  const [activeType, setActiveType] = useState<DuplicateMatchType | 'all'>('all')

  useEffect(() => {
    void (async () => {
      const result = await api.libraryFindDuplicates(libraryId)
      setGroups(result)
      setTotalWasted(result.reduce((sum, g) => sum + g.wastedBytes, 0))
      setLoading(false)
    })()
  }, [libraryId])

  const filteredGroups = activeType === 'all' ? groups : groups.filter((g) => g.matchType === activeType)

  const countByType = (type: DuplicateMatchType) => groups.filter((g) => g.matchType === type).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[720px] max-h-[85vh] bg-ink-850 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Icon name="copy" size={18} className="text-yellow-400" />
            <span className="text-white font-semibold text-base">重复视频检测</span>
            {!loading && groups.length > 0 && (
              <span className="text-xs text-white/50 ml-2">
                {groups.length} 组重复 · 可释放 {formatSize(totalWasted)}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* 匹配类型筛选 */}
        {!loading && groups.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-white/5">
            <button
              onClick={() => setActiveType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeType === 'all' ? 'bg-brand text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              全部 ({groups.length})
            </button>
            {(['exact', 'title', 'feature'] as DuplicateMatchType[]).map((type) => {
              const count = countByType(type)
              if (count === 0) return null
              const config = MATCH_TYPE_CONFIG[type]
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeType === type ? 'bg-brand text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className={activeType === type ? '' : config.color}>{config.label}</span> ({count})
                </button>
              )
            })}
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-white/40 text-sm text-center py-16">正在检测重复视频（三级匹配：精确/标题/特征）...</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16">
              <Icon name="check" size={48} className="text-green-400 mx-auto mb-4" />
              <div className="text-white/70 text-sm">未发现重复视频</div>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-white/40 text-sm text-center py-16">该匹配类型下无重复视频</div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group, idx) => {
                const config = MATCH_TYPE_CONFIG[group.matchType]
                return (
                  <div key={group.key} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                        <span className="text-white/40 text-xs">第 {idx + 1} 组 · {group.videos.length} 个副本</span>
                      </div>
                      <span className="text-yellow-400/80 text-xs">可释放 {formatSize(group.wastedBytes)}</span>
                    </div>
                    <div className="text-white/30 text-[11px] mb-2">{config.desc}</div>
                    <div className="space-y-1.5">
                      {group.videos.map((v) => (
                        <div
                          key={v.id}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            v.recommended ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          {v.recommended && (
                            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded shrink-0 font-medium">
                              推荐保留
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm truncate">{v.title}</div>
                            <div className="text-white/40 text-xs truncate">{v.path}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {v.resolution && (
                              <span className="text-white/50 text-[11px] bg-white/10 px-1.5 py-0.5 rounded">{v.resolution}</span>
                            )}
                            {v.durationSec && (
                              <span className="text-white/50 text-[11px]">
                                {Math.floor(v.durationSec / 60)}:{String(Math.floor(v.durationSec % 60)).padStart(2, '0')}
                              </span>
                            )}
                            <span className="text-white/50 text-xs">{formatSize(v.fileSize ?? 0)}</span>
                            <button
                              className="text-white/30 hover:text-white/70 transition-colors"
                              onClick={() => void api.shellRevealInFolder(v.path)}
                              title="打开文件位置"
                            >
                              <Icon name="folderOpen" size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        {!loading && groups.length > 0 && (
          <div className="px-5 py-3 border-t border-white/10 bg-white/5">
            <p className="text-white/40 text-xs">
              三级检测：①精确匹配（内容指纹）②标题匹配（归一化标题+年份）③特征匹配（标题相似+时长±1%+分辨率+大小±2%）。
              推荐保留版本为文件最大的一份，请手动确认后删除多余副本，删除操作走系统回收站可恢复。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
