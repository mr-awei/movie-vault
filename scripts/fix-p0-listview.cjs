const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/components/ListView.tsx'
let s = fs.readFileSync(p, 'utf8')
const EOL = s.includes('\r\n') ? '\r\n' : '\n'
console.log('EOL:', JSON.stringify(EOL))

// 1. add useRef import
s = s.replace(
  "import { memo, useEffect, useState } from 'react'",
  "import { memo, useEffect, useRef, useState } from 'react'"
)

// 2. insert virtualization hooks before empty-state return
const fnSig = `function ListViewInner({ entries, onOpen, onEdit, onOpenMissing, onToggleFlag, onPickTag, mode = 'full', selectable = false, selectedIds, onToggleSelect }: Props) {`
const hooks = fnSig + EOL +
`  // P0-5：虚拟化——列表曾全量 .map() 渲染，3000 部 = 3000 个 DOM 行（每行还有
  // useFrameFallback + useState）必然卡顿。固定行高 + scrollTop 窗口，只渲染视口 ±5 行。
  const containerRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ top: 0, viewH: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setRange({ top: el.scrollTop, viewH: el.clientHeight })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])
`
if (s.includes(fnSig)) {
  s = s.replace(fnSig, hooks)
  console.log('hooks inserted')
} else {
  console.log('WARN: fnSig not found')
}

// 3. windowed rendering: wrap list container
const listOpen = `<div className="overflow-auto thin-scroll pr-1 h-full">
      <div className="flex flex-col gap-1.5">
        {entries.map((e) => {`
const listOpenNew = `<div ref={containerRef} className="overflow-auto thin-scroll pr-1 h-full">
      <div className="flex flex-col gap-1.5" style={{ paddingTop: start * ROW_H, paddingBottom: (total - end) * ROW_H }}>
        {visible.map((e) => {`
if (s.includes(listOpen)) {
  s = s.replace(listOpen, listOpenNew)
  console.log('list container wrapped')
} else {
  console.log('WARN: listOpen not found')
}

// 4. compute window vars before the container div (right after empty-state block)
const windowVars = EOL + `  // 虚拟化窗口：固定行高（filename≈50px / full 缩略图行≈86px，含 gap）
  const ROW_H = mode === 'filename' ? 50 : 86
  const total = entries.length
  const start = Math.max(0, Math.floor(range.top / ROW_H) - 5)
  const end = Math.min(total, Math.ceil((range.top + range.viewH) / ROW_H) + 5)
  const visible = entries.slice(start, end)

  return (`
// anchor: the closing of empty-state block + "return ("
const emptyEnd = `    )
  }

  return (`
if (s.includes(emptyEnd)) {
  s = s.replace(emptyEnd, `    )
  }
${windowVars}`)
  console.log('window vars inserted')
} else {
  console.log('WARN: emptyEnd not found')
}

fs.writeFileSync(p, s)
console.log('done')
