const fs = require('fs')

function patchEntryCard() {
  const p = 'E:/Movie Vault/src/renderer/src/components/EntryCard.tsx'
  let s = fs.readFileSync(p, 'utf8')
  const crlf = s.includes('\r\n')
  s = s.replace(/\r\n/g, '\n')
  s = s.replace("import { useFrameFallback } from '../lib/frameFallback'\n", '')
  const old = `  const { fallbackPoster } = useFrameFallback(entry.video, hasValidSrc)
  const src = hasValidSrc ?? fallbackPoster`
  const newS = `  const src = hasValidSrc`
  if (s.includes(old)) { s = s.replace(old, newS); console.log('EntryCard hook removed') }
  else console.log('WARN EntryCard hook block not found')
  // isFrameFallback: remove fallbackPoster comparison
  s = s.replace(/const isFrameFallback = src\s*\n\s*\? src === fallbackPoster \|\| \(!manualPoster && !detailCover && !realPoster && v0\?\.posterSource === 'ffmpeg'\)\s*\n\s*: false/, "const isFrameFallback = src ? !manualPoster && !detailCover && !realPoster && v0?.posterSource === 'ffmpeg' : false")
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
}

function patchListView() {
  const p = 'E:/Movie Vault/src/renderer/src/components/ListView.tsx'
  let s = fs.readFileSync(p, 'utf8')
  const crlf = s.includes('\r\n')
  s = s.replace(/\r\n/g, '\n')
  s = s.replace("import { useFrameFallback } from '../lib/frameFallback'\n", '')
  const old = `  const { fallbackPoster } = useFrameFallback(video ?? undefined, hasValidSrc)
  const src = hasValidSrc ?? fallbackPoster`
  const newS = `  const src = hasValidSrc`
  if (s.includes(old)) { s = s.replace(old, newS); console.log('ListView hook removed') }
  else console.log('WARN ListView hook block not found')
  const isFf = `  const isFrameFallback = src
    ? src === fallbackPoster || (!manualPoster && !detailCover && !realPoster && video?.posterSource === 'ffmpeg')
    : false`
  if (s.includes(isFf)) { s = s.replace(isFf, `  const isFrameFallback = src ? !manualPoster && !detailCover && !realPoster && video?.posterSource === 'ffmpeg' : false`); console.log('ListView isFrameFallback fixed') }
  else console.log('WARN ListView isFrameFallback not found (check)')
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
}

patchEntryCard()
patchListView()
console.log('done')
