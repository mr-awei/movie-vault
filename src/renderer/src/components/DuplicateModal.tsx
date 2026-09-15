import { useEffect, useState } from 'react'
import type { DuplicateGroup } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'
import { formatSize } from '../lib/util'

interface Props {
  onClose: () => void
  libraryId: string
}

/**
 * 重复视频检测模态框。
 * 按 contentHash 分组显示重复项，可打开文件位置、可删除。
 */
export default function DuplicateModal({ onClose, libraryId }: Props) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [totalWasted, setTotalWasted] = useState(0)

  useEffect(() => {
    void (async () => {
      const result = await api.libraryFindDuplicates(libraryId)
      setGroups(result)
      setTotalWasted(result.reduce((sum, g) => sum + g.wastedBytes, 0))
      setLoading(false)
    })()
  }, [libraryId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[680px] max-h-[80vh] bg-ink-850 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
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

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-white/40 text-sm text-center py-16">正在检测重复视频...</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16">
              <Icon name="check" size={48} className="text-green-400 mx-auto mb-4" />
              <div className="text-white/70 text-sm">未发现重复视频</div>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group, idx) => (
                <div key={group.key} className="bg-white/5 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/60 text-xs">第 {idx + 1} 组 · {group.videos.length} 个副本</span>
                    <span className="text-yellow-400/80 text-xs">可释放 {formatSize(group.wastedBytes)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.videos.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm truncate">{v.title}</div>
                          <div className="text-white/40 text-xs truncate">{v.path}</div>
                        </div>
                        <span className="text-white/50 text-xs shrink-0">{formatSize(v.fileSize ?? 0)}</span>
                        <button
                          className="text-white/30 hover:text-white/70 transition-colors shrink-0"
                          onClick={() => void api.shellRevealInFolder(v.path)}
                          title="打开文件位置"
                        >
                          <Icon name="folderOpen" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        {!loading && groups.length > 0 && (
          <div className="px-5 py-3 border-t border-white/10 bg-white/5">
            <p className="text-white/40 text-xs">
              基于文件内容指纹（大小 + 头部 64KB 哈希）检测。请手动确认后删除多余副本，删除操作走系统回收站可恢复。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
