import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { WatchStats } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'

interface Props {
  onClose: () => void
}

/** 格式化秒数为可读时长 */
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟`
  const hours = Math.floor(sec / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
}

/**
 * 观看统计面板。
 * 展示总观看时长、月度趋势、时间分布、最常看标签/演员/导演、最近观看记录。
 */
export default function WatchStatsModal({ onClose }: Props) {
  const [stats, setStats] = useState<WatchStats | null>(null)
  const [loading, setLoading] = useState(true)
  const monthlyChartRef = useRef<HTMLDivElement>(null)
  const hourlyChartRef = useRef<HTMLDivElement>(null)
  const monthlyChartInstance = useRef<echarts.ECharts | null>(null)
  const hourlyChartInstance = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const result = await api.watchHistoryStats()
        setStats(result)
      } catch (err) {
        console.error('获取观看统计失败:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 渲染月度趋势图表
  useEffect(() => {
    if (!stats || !monthlyChartRef.current) return
    if (!monthlyChartInstance.current) {
      monthlyChartInstance.current = echarts.init(monthlyChartRef.current)
    }
    monthlyChartInstance.current.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0]
          return `${p.name}<br/>观看时长: ${formatDuration(p.value)}<br/>观看次数: ${params[1]?.value ?? 0}次`
        }
      },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: stats.monthlyTrend.map((m) => m.month),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          formatter: (v: number) => `${Math.floor(v / 3600)}h`
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      series: [
        {
          name: '观看时长',
          type: 'line',
          data: stats.monthlyTrend.map((m) => m.watchSec),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#6366f1', width: 2 },
          itemStyle: { color: '#6366f1' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
              { offset: 1, color: 'rgba(99, 102, 241, 0)' }
            ])
          }
        },
        {
          name: '观看次数',
          type: 'bar',
          data: stats.monthlyTrend.map((m) => m.count),
          barWidth: 8,
          itemStyle: { color: 'rgba(251, 191, 36, 0.6)', borderRadius: [4, 4, 0, 0] }
        }
      ]
    })
  }, [stats])

  // 渲染观看时间分布图表
  useEffect(() => {
    if (!stats || !hourlyChartRef.current) return
    if (!hourlyChartInstance.current) {
      hourlyChartInstance.current = echarts.init(hourlyChartRef.current)
    }
    hourlyChartInstance.current.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0]
          return `${p.name}时<br/>观看时长: ${formatDuration(p.value)}<br/>观看次数: ${params[1]?.value ?? 0}次`
        }
      },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: stats.hourlyDistribution.map((h) => `${h.hour}时`),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, interval: 2 }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          formatter: (v: number) => `${Math.floor(v / 3600)}h`
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      series: [
        {
          name: '观看时长',
          type: 'bar',
          data: stats.hourlyDistribution.map((h) => h.watchSec),
          barWidth: '60%',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#6366f1' },
              { offset: 1, color: 'rgba(99, 102, 241, 0.3)' }
            ]),
            borderRadius: [4, 4, 0, 0]
          }
        },
        {
          name: '观看次数',
          type: 'line',
          data: stats.hourlyDistribution.map((h) => h.count),
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#fbbf24', width: 2 }
        }
      ]
    })
  }, [stats])

  // 窗口大小变化时重绘图表
  useEffect(() => {
    const handleResize = () => {
      monthlyChartInstance.current?.resize()
      hourlyChartInstance.current?.resize()
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      monthlyChartInstance.current?.dispose()
      hourlyChartInstance.current?.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[900px] max-h-[85vh] bg-ink-850 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Icon name="chart" size={18} className="text-brand" />
            <span className="text-white font-semibold text-base">观看统计</span>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-white/40 text-sm text-center py-16">正在加载观看统计...</div>
          ) : !stats || stats.totalWatchCount === 0 ? (
            <div className="text-center py-16">
              <Icon name="chart" size={48} className="text-white/20 mx-auto mb-4" />
              <div className="text-white/50 text-sm">暂无观看记录</div>
              <div className="text-white/30 text-xs mt-2">播放视频后会自动记录观看历史</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 基础统计卡片 */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-brand">{formatDuration(stats.totalWatchSec)}</div>
                  <div className="text-white/50 text-xs mt-1">总观看时长</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{stats.totalWatchCount}</div>
                  <div className="text-white/50 text-xs mt-1">总观看次数</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">{formatDuration(stats.avgWatchSec)}</div>
                  <div className="text-white/50 text-xs mt-1">平均每次时长</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-purple-400">{stats.uniqueVideos}</div>
                  <div className="text-white/50 text-xs mt-1">观看视频数</div>
                </div>
              </div>

              {/* 月度趋势 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">月度趋势（最近 12 个月）</h3>
                <div ref={monthlyChartRef} style={{ width: '100%', height: 220 }} />
              </div>

              {/* 观看时间分布 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">观看时间分布（24 小时）</h3>
                <div ref={hourlyChartRef} style={{ width: '100%', height: 200 }} />
              </div>

              {/* Top 标签/演员/导演 */}
              <div className="grid grid-cols-3 gap-3">
                {/* Top 标签 */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-white font-medium text-sm mb-3">最常看标签 Top 10</h3>
                  <div className="space-y-2">
                    {stats.topTags.length === 0 ? (
                      <div className="text-white/30 text-xs">暂无数据</div>
                    ) : (
                      stats.topTags.map((item, idx) => (
                        <div key={item.tag} className="flex items-center gap-2">
                          <span className={`text-xs w-5 text-center ${idx < 3 ? 'text-yellow-400 font-bold' : 'text-white/40'}`}>
                            {idx + 1}
                          </span>
                          <span className="text-white text-xs flex-1 truncate">{item.tag}</span>
                          <span className="text-white/40 text-xs">{formatDuration(item.watchSec)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top 演员 */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-white font-medium text-sm mb-3">最常看演员 Top 10</h3>
                  <div className="space-y-2">
                    {stats.topActors.length === 0 ? (
                      <div className="text-white/30 text-xs">暂无数据</div>
                    ) : (
                      stats.topActors.map((item, idx) => (
                        <div key={item.actor} className="flex items-center gap-2">
                          <span className={`text-xs w-5 text-center ${idx < 3 ? 'text-yellow-400 font-bold' : 'text-white/40'}`}>
                            {idx + 1}
                          </span>
                          <span className="text-white text-xs flex-1 truncate">{item.actor}</span>
                          <span className="text-white/40 text-xs">{formatDuration(item.watchSec)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top 导演 */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-white font-medium text-sm mb-3">最常看导演 Top 10</h3>
                  <div className="space-y-2">
                    {stats.topDirectors.length === 0 ? (
                      <div className="text-white/30 text-xs">暂无数据</div>
                    ) : (
                      stats.topDirectors.map((item, idx) => (
                        <div key={item.director} className="flex items-center gap-2">
                          <span className={`text-xs w-5 text-center ${idx < 3 ? 'text-yellow-400 font-bold' : 'text-white/40'}`}>
                            {idx + 1}
                          </span>
                          <span className="text-white text-xs flex-1 truncate">{item.director}</span>
                          <span className="text-white/40 text-xs">{formatDuration(item.watchSec)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 最近观看记录 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">最近观看记录（最近 20 条）</h3>
                <div className="space-y-1.5">
                  {stats.recentWatches.length === 0 ? (
                    <div className="text-white/30 text-xs">暂无记录</div>
                  ) : (
                    stats.recentWatches.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm truncate">{item.title}</div>
                          <div className="text-white/40 text-xs">
                            {new Date(item.startedAt).toLocaleString('zh-CN')} · 观看 {formatDuration(item.durationSec)}
                            {item.completion !== undefined && ` · 完成度 ${Math.round(item.completion * 100)}%`}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
