const fs = require('fs')

// ========== 1. Patch WatchStatsModal.tsx ==========
const p = 'E:/Movie Vault/src/renderer/src/components/WatchStatsModal.tsx'
let s = fs.readFileSync(p, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')

// import t
s = s.replace(
  "import { api } from '../lib/api'",
  "import { api } from '../lib/api'\nimport { t } from '../../../shared/i18n'"
)

// formatDuration → i18n templates
s = s.replace(
  `/** 格式化秒数为可读时长 */
function formatDuration(sec: number): string {
  if (sec < 60) return \`\${sec}秒\`
  if (sec < 3600) return \`\${Math.floor(sec / 60)}分钟\`
  const hours = Math.floor(sec / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  return mins > 0 ? \`\${hours}小时\${mins}分钟\` : \`\${hours}小时\`
}`,
  `/** 格式化秒数为可读时长（i18n） */
function formatDuration(sec: number): string {
  if (sec < 60) return t('watchStats.durSec', { n: sec })
  if (sec < 3600) return t('watchStats.durMin', { n: Math.floor(sec / 60) })
  const hours = Math.floor(sec / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  return mins > 0 ? t('watchStats.durHourMin', { h: hours, m: mins }) : t('watchStats.durHour', { h: hours })
}`
)

// ---- chart strings (global replace of quoted literals) ----
s = s.replace(/'观看时长'/g, "t('watchStats.watchDuration')")
s = s.replace(/'观看次数'/g, "t('watchStats.watchCount')")
s = s.replace(/'完成度分布'/g, "t('watchStats.completion')")
s = s.replace(/`\$\{p\.name\}时<br\/>观看时长: \$\{formatDuration\(p\.value\)\}<br\/>观看次数: \$\{params\[1\]\?\.value \?\? 0\}次`/g,
  "`${t('watchStats.hourLabel', { h: p.name })}<br/>${t('watchStats.watchDuration')}: ${formatDuration(p.value)}<br/>${t('watchStats.watchCount')}: ${params[1]?.value ?? 0}${t('watchStats.times')}`")
s = s.replace(/return p\.name \+ '<br\/>观看时长: ' \+ formatDuration\(p\.value\) \+ '<br\/>观看次数: ' \+ \(params\[1\]\?\.value \?\? 0\) \+ '次'/g,
  "return p.name + '<br/>' + t('watchStats.watchDuration') + ': ' + formatDuration(p.value) + '<br/>' + t('watchStats.watchCount') + ': ' + (params[1]?.value ?? 0) + t('watchStats.times')")
s = s.replace(/return params\.name \+ '<br\/>观看时长: ' \+ formatDuration\(params\.value\) \+ '<br\/>占比: ' \+ params\.percent \+ '%'/g,
  "return params.name + '<br/>' + t('watchStats.watchDuration') + ': ' + formatDuration(params.value) + '<br/>' + t('watchStats.share') + ': ' + params.percent + '%'")
s = s.replace(/`\$\{p\.name\}<br\/>观看时长: \$\{formatDuration\(p\.value\)\}<br\/>观看次数: \$\{params\[1\]\?\.value \?\? 0\}次`/g,
  "`${p.name}<br/>${t('watchStats.watchDuration')}: ${formatDuration(p.value)}<br/>${t('watchStats.watchCount')}: ${params[1]?.value ?? 0}${t('watchStats.times')}`")
s = s.replace(/`共 \$\{stats\.totalWatchCount\} 次`/g, "t('watchStats.totalTimes', { n: stats.totalWatchCount })")
s = s.replace(/'观看次数'\]/g, "t('watchStats.watchCount')]") // completion subtext
s = s.replace(/subtext: '观看次数'/g, "subtext: t('watchStats.watchCount')")
s = s.replace(/`\$\{h\.hour\}时`/g, "t('watchStats.hourLabel', { h: h.hour })")
s = s.replace(/formatter: \(v: number\) => `\$\{Math\.floor\(v \/ 3600\)\}h`/g,
  "formatter: (v: number) => Math.floor(v / 3600) + t('watchStats.hourUnit')")
s = s.replace(/formatter: \(v: number\) => Math\.floor\(v \/ 3600\) \+ 'h'/g,
  "formatter: (v: number) => Math.floor(v / 3600) + t('watchStats.hourUnit')")

// ---- UI strings ----
s = s.replace('<span className="text-white font-semibold text-base">观看统计</span>', "<span className=\"text-white font-semibold text-base\">{t('watchStats.title')}</span>")
s = s.replace('<div className="text-white/40 text-sm text-center py-16">正在加载观看统计...</div>', "<div className=\"text-white/40 text-sm text-center py-16\">{t('watchStats.loading')}</div>")
s = s.replace('<div className="text-white/50 text-sm">暂无观看记录</div>', "<div className=\"text-white/50 text-sm\">{t('watchStats.empty')}</div>")
s = s.replace('<div className="text-white/30 text-xs mt-2">播放视频后会自动记录观看历史</div>', "<div className=\"text-white/30 text-xs mt-2\">{t('watchStats.emptyHint')}</div>")
s = s.replace('<div className="text-white/30 text-xs mt-1">播放视频后会自动记录观看历史，下方图表将随数据更新</div>', "<div className=\"text-white/30 text-xs mt-1\">{t('watchStats.emptyHint2')}</div>")
s = s.replace('<div className="text-white/50 text-xs mt-1">总观看时长</div>', "<div className=\"text-white/50 text-xs mt-1\">{t('watchStats.totalDuration')}</div>")
s = s.replace('<div className="text-white/50 text-xs mt-1">总观看次数</div>', "<div className=\"text-white/50 text-xs mt-1\">{t('watchStats.totalCount')}</div>")
s = s.replace('<div className="text-white/50 text-xs mt-1">平均每次时长</div>', "<div className=\"text-white/50 text-xs mt-1\">{t('watchStats.avgDuration')}</div>")
s = s.replace('<div className="text-white/50 text-xs mt-1">观看视频数</div>', "<div className=\"text-white/50 text-xs mt-1\">{t('watchStats.uniqueVideos')}</div>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">月度趋势（最近 12 个月）</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.monthlyTitle')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">横轴为月份；左侧紫色折线 = 该月观看时长（小时），右侧黄色柱 = 该月观看次数。一个月没看则为 0。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.monthlyDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">每周趋势（最近 12 周）</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.weeklyTitle')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">横轴为周（周一开始计算，显示该周起止日期）；左侧绿色折线 = 该周观看时长，右侧黄色柱 = 该周观看次数。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.weeklyDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">完成度分布</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.completion')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">按每部影片看到什么程度归类：0-25% = 刚开头就关，25-50% = 看了一点，50-75% = 看了一大半，75-100% = 基本看完。中心数字 = 观看总次数。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.completionDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">观看时间分布（24 小时）</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.hourlyTitle')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">横轴为一天 24 小时；柱高 = 该小时观看时长，黄色折线 = 该小时观看次数。看出你习惯几点看片。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.hourlyDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">最常看标签 Top 10</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.topTags')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">你观看时长最多的标签，点击标签可筛选该标签影片。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.topTagsDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">最常看演员 Top 10</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.topActors')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">你观看时长最多的演员，点击可筛选其影片。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.topActorsDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">最常看导演 Top 10</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.topDirectors')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">你观看时长最多的导演，点击可筛选其影片。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.topDirectorsDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">观看时长排行榜 Top 20</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.topVideos')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">按累计观看时长排名的前 20 部影片（次数 = 看了几次），点击可打开影片详情。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.topVideosDesc')}</p>")
s = s.replace('<h3 className="text-white font-medium text-sm mb-3">最近观看记录（最近 20 条）</h3>', "<h3 className=\"text-white font-medium text-sm mb-3\">{t('watchStats.recent')}</h3>")
s = s.replace('<p className="text-white/40 text-[11px] mb-3 leading-relaxed">最近 20 次观看记录（时间 · 看了多久 · 完成度），点击可打开影片详情。</p>', "<p className=\"text-white/40 text-[11px] mb-3 leading-relaxed\">{t('watchStats.recentDesc')}</p>")
s = s.replace(/<div className="text-white\/30 text-xs">暂无数据<\/div>/g, "<div className=\"text-white/30 text-xs\">{t('watchStats.noData')}</div>")
s = s.replace('<div className="text-white/30 text-xs">暂无记录</div>', "<div className=\"text-white/30 text-xs\">{t('watchStats.noRecord')}</div>")
s = s.replace(/title=\{`筛选标签「\$\{t\}」`\}/g, "title={t('watchStats.filterTag', { tag: t })}")
s = s.replace(/title=\{`筛选演员「\$\{item\.actor\}」的影片`\}/g, "title={t('watchStats.filterActor', { a: item.actor })}")
s = s.replace(/title=\{`筛选导演「\$\{item\.director\}」的影片`\}/g, "title={t('watchStats.filterDirector', { d: item.director })}")
s = s.replace(/title="打开影片详情"/g, "title={t('watchStats.openDetail')}")
s = s.replace(/<span className="text-white\/40 text-xs shrink-0">\{item\.count\}次<\/span>/g, "<span className=\"text-white/40 text-xs shrink-0\">{item.count}{t('watchStats.times')}</span>")
s = s.replace(/`· 观看 \$\{formatDuration\(item\.durationSec\)\}`/g, "` · ${t('watchStats.watched', { d: formatDuration(item.durationSec) })}`")
s = s.replace(/` · 完成度 \$\{Math\.round\(item\.completion \* 100\)\}%`/g, "` · ${t('watchStats.completionPct', { p: Math.round(item.completion * 100) })}`")

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('WatchStatsModal patched')
