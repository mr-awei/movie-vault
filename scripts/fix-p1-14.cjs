const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/components/HomeView.tsx'
let s = fs.readFileSync(p, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')

// 1. insert topN helper before the component's useMemo (before "const { recent, topRated")
const helper = `/** P1-14：求 top N（按 key 排序），O(N·logN') 小顶堆，替代全量 sort（首页只展示前 14，无需排全库） */
function topN<T>(arr: T[], key: (t: T) => number, n: number, dir: 1 | -1 = -1): T[] {
  if (arr.length <= n) return [...arr].sort((a, b) => (key(a) - key(b)) * dir)
  const cmp = (a: T, b: T) => (key(a) - key(b)) * dir // 堆顶 = 当前最差
  const heap: T[] = []
  const push = (x: T) => {
    heap.push(x)
    let i = heap.length - 1
    while (i > 0) {
      const pp = (i - 1) >> 1
      if (cmp(heap[i], heap[pp]) >= 0) break
      ;[heap[i], heap[pp]] = [heap[pp], heap[i]]
      i = pp
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && cmp(heap[l], heap[m]) < 0) m = l
        if (r < heap.length && cmp(heap[r], heap[m]) < 0) m = r
        if (m === i) break
        ;[heap[i], heap[m]] = [heap[m], heap[i]]
        i = m
      }
    }
    return top
  }
  for (const x of arr) {
    if (heap.length < n) push(x)
    else if (cmp(x, heap[0]) > 0) {
      pop()
      push(x)
    }
  }
  return heap.sort((a, b) => (key(b) - key(a)) * dir)
}

`
const anchor = `  const { recent, topRated, recentPlayed, favorite } = useMemo(() => {`
if (s.includes(anchor)) {
  s = s.replace(anchor, helper + anchor)
  console.log('topN inserted')
} else {
  console.log('WARN anchor not found')
}

// 2. replace the four sorts
const oldBlock = `    return {
      recent: sortBy((e) => e.video?.addedAt ?? 0).slice(0, 14),
      topRated: sortBy(scoreOf).filter((e) => scoreOf(e) > 0).slice(0, 14),
      recentPlayed: sortBy((e) => e.video?.lastPlayedAt ?? 0)
        .filter((e) => (e.video?.lastPlayedAt ?? 0) > 0)
        .slice(0, 14),
      favorite: withVideo.filter((e) => e.video?.favorite).slice(0, 14)
    }`
const newBlock = `    return {
      recent: topN(withVideo, (e) => e.video?.addedAt ?? 0, 14),
      topRated: topN(withVideo.filter((e) => scoreOf(e) > 0), scoreOf, 14),
      recentPlayed: topN(
        withVideo.filter((e) => (e.video?.lastPlayedAt ?? 0) > 0),
        (e) => e.video?.lastPlayedAt ?? 0,
        14
      ),
      favorite: withVideo.filter((e) => e.video?.favorite).slice(0, 14)
    }`
if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock)
  console.log('sorts replaced')
} else {
  console.log('WARN sort block not found')
}

// 3. remove now-unused sortBy if present
if (s.includes('const sortBy =')) {
  s = s.replace('    const sortBy = (key: (e: DisplayEntry) => number, dir: 1 | -1 = -1) =>\n      [...withVideo].sort((a, b) => (key(a) - key(b)) * dir)\n\n', '')
  console.log('sortBy removed')
}

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('done')
