const fs = require('fs')
const p = 'E:/Movie Vault/src/main/lib/watch-history.ts'
let s = fs.readFileSync(p, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')

const anchorOld = `  const allVideos: Video[] = await listVideos({})
  const videoMap = new Map(allVideos.map((v: Video) => [v.id, v]))`
const anchorNew = `  // P1-11：只取聚合所需列（id/tags/actors/meta），不再 listVideos 全字段加载整库
  const videoRows = getDb().prepare('SELECT id, tags, actors, meta FROM videos').all() as Array<{
    id: string
    tags: string | null
    actors: string | null
    meta: string | null
  }>
  const videoMap = new Map<string, { tags?: string[]; actors?: string[]; meta?: { director?: string } }>()
  for (const r of videoRows) {
    let meta: { director?: string } | null = null
    try {
      meta = r.meta ? (JSON.parse(r.meta) as { director?: string }) : null
    } catch {
      meta = null
    }
    let tags: string[] = []
    let actors: string[] = []
    try {
      tags = r.tags ? (JSON.parse(r.tags) as string[]) : []
      actors = r.actors ? (JSON.parse(r.actors) as string[]) : []
    } catch {
      /* ignore corrupted fields */
    }
    videoMap.set(r.id, { tags, actors, meta: meta ?? undefined })
  }`

if (s.includes(anchorOld)) {
  s = s.replace(anchorOld, anchorNew)
  console.log('P1-11 patched')
} else {
  console.log('WARN: anchor not found')
}

// remove unused import listVideos if no longer referenced
if (!/listVideos\(/.test(s.replace(anchorNew, ''))) {
  s = s.replace("import { listVideos } from './repo'\n", '')
  console.log('removed listVideos import')
} else {
  console.log('listVideos still referenced elsewhere')
}

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
