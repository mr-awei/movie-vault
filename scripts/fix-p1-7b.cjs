const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/components/VideoDetail.tsx'
let s = fs.readFileSync(p, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')

// remove import
s = s.replace("import { useFrameFallback } from '../lib/frameFallback'\n", '')

// replace hook block
const old = `  const { fallbackPoster, isFrameFallback } = useFrameFallback(
    localVideo,
    originalCover && !coverImgError
      ? originalCover
      : autoFramePlanned || (autoFramedRef.current && framing)
        ? '__auto_frame_planned__'
        : null
  )
  const coverSrc = (originalCover && !coverImgError ? originalCover : null) ?? fallbackPoster`
const newS = `  // P1-7：useFrameFallback 自动截帧逻辑已废弃（preview-task-queue 统一处理），
  // 删除死 hook；截帧标识改为直接判断持久化记录来源
  const isFrameFallback = localVideo?.posterSource === 'ffmpeg'
  const coverSrc = originalCover && !coverImgError ? originalCover : null`
if (s.includes(old)) { s = s.replace(old, newS); console.log('VideoDetail hook removed') }
else console.log('WARN VideoDetail hook block not found')

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
