const fs = require('fs')

const zhKeys = `  // ===== 观看统计（WatchStatsModal）=====
  'watchStats.title': '观看统计',
  'watchStats.loading': '正在加载观看统计...',
  'watchStats.empty': '暂无观看记录',
  'watchStats.emptyHint': '播放视频后会自动记录观看历史',
  'watchStats.emptyHint2': '播放视频后会自动记录观看历史，下方图表将随数据更新',
  'watchStats.totalDuration': '总观看时长',
  'watchStats.totalCount': '总观看次数',
  'watchStats.avgDuration': '平均每次时长',
  'watchStats.uniqueVideos': '观看视频数',
  'watchStats.monthlyTitle': '月度趋势（最近 12 个月）',
  'watchStats.monthlyDesc': '横轴为月份；左侧紫色折线 = 该月观看时长（小时），右侧黄色柱 = 该月观看次数。一个月没看则为 0。',
  'watchStats.weeklyTitle': '每周趋势（最近 12 周）',
  'watchStats.weeklyDesc': '横轴为周（周一开始计算，显示该周起止日期）；左侧绿色折线 = 该周观看时长，右侧黄色柱 = 该周观看次数。',
  'watchStats.completion': '完成度分布',
  'watchStats.completionDesc': '按每部影片看到什么程度归类：0-25% = 刚开头就关，25-50% = 看了一点，50-75% = 看了一大半，75-100% = 基本看完。中心数字 = 观看总次数。',
  'watchStats.hourlyTitle': '观看时间分布（24 小时）',
  'watchStats.hourlyDesc': '横轴为一天 24 小时；柱高 = 该小时观看时长，黄色折线 = 该小时观看次数。看出你习惯几点看片。',
  'watchStats.topTags': '最常看标签 Top 10',
  'watchStats.topTagsDesc': '你观看时长最多的标签，点击标签可筛选该标签影片。',
  'watchStats.topActors': '最常看演员 Top 10',
  'watchStats.topActorsDesc': '你观看时长最多的演员，点击可筛选其影片。',
  'watchStats.topDirectors': '最常看导演 Top 10',
  'watchStats.topDirectorsDesc': '你观看时长最多的导演，点击可筛选其影片。',
  'watchStats.topVideos': '观看时长排行榜 Top 20',
  'watchStats.topVideosDesc': '按累计观看时长排名的前 20 部影片（次数 = 看了几次），点击可打开影片详情。',
  'watchStats.recent': '最近观看记录（最近 20 条）',
  'watchStats.recentDesc': '最近 20 次观看记录（时间 · 看了多久 · 完成度），点击可打开影片详情。',
  'watchStats.noData': '暂无数据',
  'watchStats.noRecord': '暂无记录',
  'watchStats.watchDuration': '观看时长',
  'watchStats.watchCount': '观看次数',
  'watchStats.times': '次',
  'watchStats.share': '占比',
  'watchStats.totalTimes': '共 {n} 次',
  'watchStats.hourLabel': '{h}时',
  'watchStats.hourUnit': 'h',
  'watchStats.durSec': '{n}秒',
  'watchStats.durMin': '{n}分钟',
  'watchStats.durHour': '{n}小时',
  'watchStats.durHourMin': '{n}小时{m}分钟',
  'watchStats.filterTag': '筛选标签「{tag}」',
  'watchStats.filterActor': '筛选演员「{a}」的影片',
  'watchStats.filterDirector': '筛选导演「{d}」的影片',
  'watchStats.openDetail': '打开影片详情',
  'watchStats.watched': '观看 {d}',
  'watchStats.completionPct': '完成度 {p}%',
`

const enKeys = `  // ===== Watch Stats =====
  'watchStats.title': 'Watch Stats',
  'watchStats.loading': 'Loading watch stats…',
  'watchStats.empty': 'No watch history yet',
  'watchStats.emptyHint': 'Watch history is recorded automatically when you play videos',
  'watchStats.emptyHint2': 'Watch history is recorded automatically when you play videos — the charts below update as data comes in',
  'watchStats.totalDuration': 'Total watch time',
  'watchStats.totalCount': 'Total plays',
  'watchStats.avgDuration': 'Avg per session',
  'watchStats.uniqueVideos': 'Videos watched',
  'watchStats.monthlyTitle': 'Monthly trend (last 12 months)',
  'watchStats.monthlyDesc': 'X-axis: month. Purple line = watch time that month (hours), yellow bars = plays. Months with no viewing show 0.',
  'watchStats.weeklyTitle': 'Weekly trend (last 12 weeks)',
  'watchStats.weeklyDesc': 'X-axis: week (starts Monday, shows the week\'s date range). Green line = watch time, yellow bars = plays.',
  'watchStats.completion': 'Completion distribution',
  'watchStats.completionDesc': 'How far each video got: 0-25% = stopped at the start, 25-50% = watched a bit, 50-75% = most of it, 75-100% = basically finished. Center number = total plays.',
  'watchStats.hourlyTitle': 'Watch time by hour (24h)',
  'watchStats.hourlyDesc': 'X-axis: the 24 hours of the day. Bar = watch time that hour, yellow line = plays that hour. See when you usually watch.',
  'watchStats.topTags': 'Top 10 tags',
  'watchStats.topTagsDesc': 'Tags with the most watch time. Click a tag to filter its videos.',
  'watchStats.topActors': 'Top 10 actors',
  'watchStats.topActorsDesc': 'Actors with the most watch time. Click to filter their videos.',
  'watchStats.topDirectors': 'Top 10 directors',
  'watchStats.topDirectorsDesc': 'Directors with the most watch time. Click to filter their videos.',
  'watchStats.topVideos': 'Top 20 by watch time',
  'watchStats.topVideosDesc': 'The 20 videos with the most accumulated watch time (count = times played). Click to open details.',
  'watchStats.recent': 'Recent watches (last 20)',
  'watchStats.recentDesc': 'The last 20 watch sessions (time · duration · completion). Click to open details.',
  'watchStats.noData': 'No data',
  'watchStats.noRecord': 'No records',
  'watchStats.watchDuration': 'Watch time',
  'watchStats.watchCount': 'Plays',
  'watchStats.times': '×',
  'watchStats.share': 'Share',
  'watchStats.totalTimes': '{n} total',
  'watchStats.hourLabel': '{h}:00',
  'watchStats.hourUnit': 'h',
  'watchStats.durSec': '{n}s',
  'watchStats.durMin': '{n} min',
  'watchStats.durHour': '{n} h',
  'watchStats.durHourMin': '{n}h {m}m',
  'watchStats.filterTag': 'Filter by tag "{tag}"',
  'watchStats.filterActor': 'Filter videos by actor "{a}"',
  'watchStats.filterDirector': 'Filter videos by director "{d}"',
  'watchStats.openDetail': 'Open details',
  'watchStats.watched': 'Watched {d}',
  'watchStats.completionPct': '{p}% watched',
`

function appendKeys(file, keysBlock) {
  let s = fs.readFileSync(file, 'utf8')
  const crlf = s.includes('\r\n')
  s = s.replace(/\r\n/g, '\n')
  // insert before the closing "} as const"
  if (!s.includes(keysBlock.trim().split('\n')[0])) {
    const m = /\n\} as const\n?$/.exec(s)
    if (m) {
      s = s.slice(0, m.index + 1) + keysBlock + s.slice(m.index + 1)
    } else {
      console.log('WARN: no "} as const" anchor in', file)
    }
  } else {
    console.log('SKIP: keys already present in', file)
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s)
  console.log('appended:', file)
}

appendKeys('E:/Movie Vault/src/shared/i18n/locales/zh-CN.ts', zhKeys)
appendKeys('E:/Movie Vault/src/shared/i18n/locales/en-US.ts', enKeys)
