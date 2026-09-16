import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { WatchStats } from '../../../shared/types'
import { api } from '../lib/api'
import Icon from './Icon'

interface Props {
  onClose: () => void
  /** 点击影片条目 → 打开详情 */
  onOpenVideo: (videoId: string) => void
  /** 点击标签 → 筛选 */
  onPickTag: (tag: string) => void
  /** 点击演员 → 筛选 */
  onPickActor: (actor: string) => void
  /** 点击导演 → 筛选 */
  onPickDirector: (director: string) => void
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
export default function WatchStatsModal({ onClose, onOpenVideo, onPickTag, onPickActor, onPickDirector }: Props) {
  const [stats, setStats] = useState<WatchStats | null>(null)
  const [loading, setLoading] = useState(true)
  const monthlyChartRef = useRef<HTMLDivElement>(null)
  const hourlyChartRef = useRef<HTMLDivElement>(null)
  const weeklyChartRef = useRef<HTMLDivElement>(null)
  const completionChartRef = useRef<HTMLDivElement>(null)
  const monthlyChartInstance = useRef<echarts.ECharts | null>(null)
  const hourlyChartInstance = useRef<echarts.ECharts | null>(null)
  const weeklyChartInstance = useRef<echarts.ECharts | null>(null)
  const completionChartInstance = useRef<echarts.ECharts | null>(null)

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
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: '#374151', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 8
      },
      grid: { left: 60, right: 50, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: stats.monthlyTrend.map((m) => m.month),
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280', fontSize: 10, rotate: 30 }
      },
      yAxis: [
        {
          type: 'value',
          name: '观看时长',
          nameTextStyle: { color: '#374151', fontSize: 12, align: 'left' },
          axisLine: { show: false },
          axisLabel: {
            color: '#6b7280',
            fontSize: 11,
            formatter: (v: number) => `${Math.floor(v / 3600)}h`
          },
          splitLine: { lineStyle: { color: '#e5e7eb' } }
        },
        {
          type: 'value',
          name: '观看次数',
          nameTextStyle: { color: '#374151', fontSize: 12, align: 'left' },
          axisLine: { show: false },
          axisLabel: { color: '#6b7280', fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '观看时长',
          type: 'line',
          yAxisIndex: 0,
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
          yAxisIndex: 1,
          data: stats.monthlyTrend.map((m) => m.count),
          barWidth: 8,
          itemStyle: { color: 'rgba(251, 191, 36, 0.6)', borderRadius: [4, 4, 0, 0] }
        }
      ]
    })
  }, [stats])

  // 渲染每周趋势图表
  useEffect(() => {
    if (!stats || !weeklyChartRef.current) return
    if (!weeklyChartInstance.current) {
      weeklyChartInstance.current = echarts.init(weeklyChartRef.current)
    }
    weeklyChartInstance.current.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0]
          return p.name + '<br/>观看时长: ' + formatDuration(p.value) + '<br/>观看次数: ' + (params[1]?.value ?? 0) + '次'
        }
      },
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: '#374151', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 8
      },
      grid: { left: 60, right: 50, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: stats.weeklyTrend.map((m) => weekLabel(m.week)),
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280', fontSize: 10, rotate: 30 }
      },
      yAxis: [
        {
          type: 'value',
          name: '观看时长',
          nameTextStyle: { color: '#374151', fontSize: 12, align: 'left' },
          axisLine: { show: false },
          axisLabel: {
            color: '#6b7280',
            fontSize: 11,
            formatter: (v: number) => Math.floor(v / 3600) + 'h'
          },
          splitLine: { lineStyle: { color: '#e5e7eb' } }
        },
        {
          type: 'value',
          name: '观看次数',
          nameTextStyle: { color: '#374151', fontSize: 12, align: 'left' },
          axisLine: { show: false },
          axisLabel: { color: '#6b7280', fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '观看时长',
          type: 'line',
          yAxisIndex: 0,
          data: stats.weeklyTrend.map((m) => m.watchSec),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#10b981', width: 2 },
          itemStyle: { color: '#10b981' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0)' }
            ])
          }
        },
        {
          name: '观看次数',
          type: 'bar',
          yAxisIndex: 1,
          data: stats.weeklyTrend.map((m) => m.count),
          barWidth: 8,
          itemStyle: { color: 'rgba(251, 191, 36, 0.6)', borderRadius: [4, 4, 0, 0] }
        }
      ]
    })
  }, [stats])

  // 渲染完成度分布图表
  useEffect(() => {
    if (!stats || !completionChartRef.current) return
    if (!completionChartInstance.current) {
      completionChartInstance.current = echarts.init(completionChartRef.current)
    }
    completionChartInstance.current.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          return params.name + '<br/>观看时长: ' + formatDuration(params.value) + '<br/>占比: ' + params.percent + '%'
        }
      },
      title: {
        text: `共 ${stats.totalWatchCount} 次`,
        subtext: '观看次数',
        left: '35%',
        top: 'center',
        textAlign: 'center',
        textStyle: { color: '#111827', fontSize: 16, fontWeight: 'bold' },
        subtextStyle: { color: '#6b7280', fontSize: 11 }
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        textStyle: { color: '#4b5563', fontSize: 11 }
      },
      series: [
        {
          name: '完成度分布',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: 'rgba(0,0,0,0.3)',
            borderWidth: 2
          },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#fff' }
          },
          data: stats.completionDistribution.map((c, idx) => ({
            value: c.watchSec,
            name: c.range,
            itemStyle: {
              color: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'][idx]
            }
          }))
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
      legend: {
        top: 0,
        left: 'center',
        textStyle: { color: '#374151', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 8
      },
      grid: { left: 60, right: 50, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: stats.hourlyDistribution.map((h) => `${h.hour}时`),
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisLabel: { color: '#6b7280', fontSize: 10, interval: 2 }
      },
      yAxis: [
        {
          type: 'value',
          name: '观看时长',
          nameTextStyle: { color: '#374151', fontSize: 12, align: 'left' },
          axisLine: { show: false },
          axisLabel: {
            color: '#6b7280',
            fontSize: 11,
            formatter: (v: number) => `${Math.floor(v / 3600)}h`
          },
          splitLine: { lineStyle: { color: '#e5e7eb' } }
        },
        {
          type: 'value',
          name: '观看次数',
          nameTextStyle: { color: '#374151', fontSize: 12, align: 'left' },
          axisLine: { show: false },
          axisLabel: { color: '#6b7280', fontSize: 11 },
          splitLine: { show: false }
        }
      ],
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
          yAxisIndex: 1,
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
      weeklyChartInstance.current?.resize()
      completionChartInstance.current?.resize()
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      monthlyChartInstance.current?.dispose()
      hourlyChartInstance.current?.dispose()
      weeklyChartInstance.current?.dispose()
      completionChartInstance.current?.dispose()
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
          ) : !stats ? (
            <div className="text-center py-16">
              <Icon name="chart" size={48} className="text-white/20 mx-auto mb-4" />
              <div className="text-white/50 text-sm">暂无观看记录</div>
              <div className="text-white/30 text-xs mt-2">播放视频后会自动记录观看历史</div>
            </div>
          ) : (
            <div className="space-y-6">
              {stats.totalWatchCount === 0 && (
                <div className="text-center py-4 bg-white/5 rounded-xl">
                  <div className="text-white/50 text-sm">暂无观看记录</div>
                  <div className="text-white/30 text-xs mt-1">播放视频后会自动记录观看历史，下方图表将随数据更新</div>
                </div>
              )}
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
                <p className="text-white/40 text-[11px] mb-3 leading-relaxed">横轴为月份；左侧紫色折线 = 该月观看时长（小时），右侧黄色柱 = 该月观看次数。一个月没看则为 0。</p>
                <div ref={monthlyChartRef} style={{ width: '100%', height: 220, backgroundColor: '#ffffff', borderRadius: 8 }} />
              </div>

              {/* 每周趋势 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">每周趋势（最近 12 周）</h3>
                <p className="text-white/40 text-[11px] mb-3 leading-relaxed">横轴为周（周一开始计算，显示该周起止日期）；左侧绿色折线 = 该周观看时长，右侧黄色柱 = 该周观看次数。</p>
                <div ref={weeklyChartRef} style={{ width: '100%', height: 220, backgroundColor: '#ffffff', borderRadius: 8 }} />
              </div>

              {/* 完成度分布 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">完成度分布</h3>
                <p className="text-white/40 text-[11px] mb-3 leading-relaxed">按每部影片看到什么程度归类：0-25% = 刚开头就关，25-50% = 看了一点，50-75% = 看了一大半，75-100% = 基本看完。中心数字 = 观看总次数。</p>
                <div ref={completionChartRef} style={{ width: '100%', height: 200, backgroundColor: '#ffffff', borderRadius: 8 }} />
              </div>

              {/* 观看时间分布 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">观看时间分布（24 小时）</h3>
                <p className="text-white/40 text-[11px] mb-3 leading-relaxed">横轴为一天 24 小时；柱高 = 该小时观看时长，黄色折线 = 该小时观看次数。看出你习惯几点看片。</p>
                <div ref={hourlyChartRef} style={{ width: '100%', height: 200, backgroundColor: '#ffffff', borderRadius: 8 }} />
              </div>

              {/* Top 标签/演员/导演 */}
              <div className="grid grid-cols-3 gap-3">
                {/* Top 标签 */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-white font-medium text-sm mb-3">最常看标签 Top 10</h3>
                  <p className="text-white/40 text-[11px] mb-3 leading-relaxed">你观看时长最多的标签，点击标签可筛选该标签影片。</p>
                  <div className="space-y-2">
                    {stats.topTags.length === 0 ? (
                      <div className="text-white/30 text-xs">暂无数据</div>
                    ) : (
                      stats.topTags.map((item, idx) => (
                        <div key={item.tag} className="flex items-start gap-2 py-0.5">
                          <span className={`text-xs w-5 text-center shrink-0 mt-0.5 ${idx < 3 ? 'text-yellow-400 font-bold' : 'text-white/40'}`}>
                            {idx + 1}
                          </span>
                          <span className="flex-1 min-w-0 flex flex-wrap gap-1">
                            {item.tag.split(/[\/、,，\s]+/).filter(Boolean).map((t) => (
                              <button
                                key={t}
                                className="text-white/70 text-[11px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-brand/40 hover:text-white transition-colors cursor-pointer"
                                onClick={() => onPickTag(t)}
                                title={`筛选标签「${t}」`}
                              >
                                {t}
                              </button>
                            ))}
                          </span>
                          <span className="text-white/40 text-xs shrink-0">{formatDuration(item.watchSec)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top 演员 */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-white font-medium text-sm mb-3">最常看演员 Top 10</h3>
                  <p className="text-white/40 text-[11px] mb-3 leading-relaxed">你观看时长最多的演员，点击可筛选其影片。</p>
                  <div className="space-y-2">
                    {stats.topActors.length === 0 ? (
                      <div className="text-white/30 text-xs">暂无数据</div>
                    ) : (
                      stats.topActors.map((item, idx) => (
                        <div
                          key={item.actor}
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => onPickActor(item.actor)}
                          title={`筛选演员「${item.actor}」的影片`}
                        >
                          <span className={`text-xs w-5 text-center ${idx < 3 ? 'text-yellow-400 font-bold' : 'text-white/40'}`}>
                            {idx + 1}
                          </span>
                          <span className="text-white text-xs flex-1 truncate group-hover:text-brand transition-colors">{item.actor}</span>
                          <span className="text-white/40 text-xs">{formatDuration(item.watchSec)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top 导演 */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-white font-medium text-sm mb-3">最常看导演 Top 10</h3>
                  <p className="text-white/40 text-[11px] mb-3 leading-relaxed">你观看时长最多的导演，点击可筛选其影片。</p>
                  <div className="space-y-2">
                    {stats.topDirectors.length === 0 ? (
                      <div className="text-white/30 text-xs">暂无数据</div>
                    ) : (
                      stats.topDirectors.map((item, idx) => (
                        <div
                          key={item.director}
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => onPickDirector(item.director)}
                          title={`筛选导演「${item.director}」的影片`}
                        >
                          <span className={`text-xs w-5 text-center ${idx < 3 ? 'text-yellow-400 font-bold' : 'text-white/40'}`}>
                            {idx + 1}
                          </span>
                          <span className="text-white text-xs flex-1 truncate group-hover:text-brand transition-colors">{item.director}</span>
                          <span className="text-white/40 text-xs">{formatDuration(item.watchSec)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 观看时长排行榜 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">观看时长排行榜 Top 20</h3>
                <p className="text-white/40 text-[11px] mb-3 leading-relaxed">按累计观看时长排名的前 20 部影片（次数 = 看了几次），点击可打开影片详情。</p>
                <div className="space-y-1.5">
                  {stats.topVideosByDuration.length === 0 ? (
                    <div className="text-white/30 text-xs">暂无数据</div>
                  ) : (
                    stats.topVideosByDuration.map((item, idx) => (
                      <div key={item.videoId} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => onOpenVideo(item.videoId)} title="打开影片详情">
                        <span className={idx < 3 ? 'text-xs w-6 text-center shrink-0 text-yellow-400 font-bold' : 'text-xs w-6 text-center shrink-0 text-white/40'}>
                          {idx + 1}
                        </span>
                        <span className="text-white text-xs flex-1 truncate">{item.title}</span>
                        <span className="text-white/40 text-xs shrink-0">{item.count}次</span>
                        <span className="text-brand text-xs shrink-0 font-medium">{formatDuration(item.watchSec)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 最近观看记录 */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">最近观看记录（最近 20 条）</h3>
                <p className="text-white/40 text-[11px] mb-3 leading-relaxed">最近 20 次观看记录（时间 · 看了多久 · 完成度），点击可打开影片详情。</p>
                <div className="space-y-1.5">
                  {stats.recentWatches.length === 0 ? (
                    <div className="text-white/30 text-xs">暂无记录</div>
                  ) : (
                    stats.recentWatches.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => onOpenVideo(item.videoId)} title="打开影片详情">
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
