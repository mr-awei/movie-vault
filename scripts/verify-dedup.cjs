// 提取 dedup.ts 的判定逻辑做回归验证（与源码一致，仅复制判定函数）
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[《》【】\[\]()（）{}]/g, ' ')
    .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function editDistance(a, b) {
  const m = a.length, n = b.length
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
function isTitleSimilar(a, b) {
  const na = normalizeTitle(a), nb = normalizeTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen < 3) return false
  return 1 - editDistance(na, nb) / maxLen >= 0.75
}
function getResolution(v) {
  const info = v.techInfo
  if (!info) return undefined
  const w = info.width, h = info.height
  if (!w || !h) return undefined
  if (h >= 2160) return '4K'
  if (h >= 1440) return '2K'
  if (h >= 1080) return '1080p'
  if (h >= 720) return '720p'
  if (h >= 480) return '480p'
  return 'SD'
}
function isFeatureMatch(a, b) {
  if (!isTitleSimilar(a.title ?? '', b.title ?? '')) return false
  const durA = a.durationSec ?? a.techInfo?.durationSec
  const durB = b.durationSec ?? b.techInfo?.durationSec
  if (durA && durB && durA > 60 && durB > 60) {
    const diff = Math.abs(durA - durB) / Math.max(durA, durB)
    if (diff > 0.01 || Math.abs(durA - durB) > 90) return false
  } else return false
  const resA = getResolution(a), resB = getResolution(b)
  if (!resA || !resB || resA !== resB) return false
  const sizeA = a.fileSize, sizeB = b.fileSize
  if (sizeA && sizeB && sizeA > 0 && sizeB > 0) {
    const diff = Math.abs(sizeA - sizeB) / Math.max(sizeA, sizeB)
    if (diff > 0.02) return false
  } else return false
  return true
}

const mk = (title, h, dur, size) => ({ title, techInfo: { width: Math.round(h * 16 / 9), height: h }, durationSec: dur, fileSize: size })
const groups = [
  ['金瓶梅', '金瓶梅2爱的奴隶', 1080, 5590, 20e9, 20e9],
  ['满清十大酷刑', '满清十大酷刑之赤裸凌迟', 1440, 5580, 5510, 17e9, 17e9],
  ['官人我要', '聊斋新传之画皮人', 1440, 5363, 5324, 10e9, 9.6e9],
  ['玉蒲团之玉女心经', '羔羊医生', 1080, 5324, 5381, 9.4e9, 10e9],
  ['强奸终极篇：最后羔羊', '聊斋艳谭1：艳魔大战', 1080, 5242, 5360, 8.2e9, 7.8e9]
]
console.log('=== 用户 5 组（应全部不匹配） ===')
groups.forEach((g, i) => {
  const [ta, tb, h, da, db, sa, sb] = g
  const m = isFeatureMatch(mk(ta, h, da, sa), mk(tb, h, db, sb))
  console.log(`第${i + 1}组 ${ta} vs ${tb}: ${m ? '✗ 仍误判!' : '✓ 已排除'}`)
})
console.log('=== 真实重复（应匹配） ===')
const real = [
  ['满清十大酷刑', '满清十大酷刑（导演剪辑版）', 1080, 5580, 5550, 17e9, 17.1e9],
  ['Inception', 'Inception', 1080, 8880, 8880, 5e9, 5e9],
  ['大话西游之月光宝盒', '月光宝盒', 1080, 5400, 5390, 3e9, 3.05e9]
]
real.forEach((g, i) => {
  const [ta, tb, h, da, db, sa, sb] = g
  const m = isFeatureMatch(mk(ta, h, da, sa), mk(tb, h, db, sb))
  console.log(`真实${i + 1} ${ta} vs ${tb}: ${m ? '✓ 命中' : '✗ 漏检'}`)
})
