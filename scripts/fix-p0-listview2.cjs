const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/components/ListView.tsx'
let s = fs.readFileSync(p, 'utf8')
s = s.replace(/\r\n/g, '\n') // normalize to LF for patching

// 2. wrap list container (LF version)
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

// 4. insert window vars before "return ("
const windowVars = `  // 虚拟化窗口：固定行高（filename≈50px / full 缩略图行≈86px，含 gap）
  const ROW_H = mode === 'filename' ? 50 : 86
  const total = entries.length
  const start = Math.max(0, Math.floor(range.top / ROW_H) - 5)
  const end = Math.min(total, Math.ceil((range.top + range.viewH) / ROW_H) + 5)
  const visible = entries.slice(start, end)

  return (`
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

fs.writeFileSync(p, s.replace(/\n/g, '\r\n'))
console.log('done, restored CRLF')
