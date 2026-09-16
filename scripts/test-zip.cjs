const { deflateRawSync, inflateRawSync } = require('node:zlib')
const fs = require('fs')

let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function dosDateTime(d) {
  return [(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()]
}
function makeZip(files) {
  const chunks = []; const central = []; let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const raw = deflateRawSync(f.data)
    const method = raw.length < f.data.length ? 8 : 0
    const body = method === 8 ? raw : f.data
    const crc = crc32(f.data)
    const [t, d] = dosDateTime(new Date())
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(method, 8)
    lh.writeUInt16LE(t, 10); lh.writeUInt16LE(d, 12); lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(f.data.length, 22)
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
    chunks.push(lh, name, body)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8)
    ch.writeUInt16LE(method, 10); ch.writeUInt16LE(t, 12); ch.writeUInt16LE(d, 14); ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(f.data.length, 24)
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42)
    central.push(ch, name)
    offset += lh.length + name.length + body.length
  }
  const cd = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, cd, eocd])
}
function parseZip(buf) {
  const out = new Map()
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('not zip')
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad cd')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad lh')
    const dataStart = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28)
    const data = buf.subarray(dataStart, dataStart + compSize)
    out.set(name, method === 8 ? inflateRawSync(data) : data)
    off += 46 + nameLen + extraLen + commentLen
  }
  return out
}

// test 1: round-trip
const a = Buffer.from('你好世界 hello '.repeat(2000), 'utf8')
const b = Buffer.from(JSON.stringify({ x: 1, s: '中文内容' }))
const z = makeZip([{ name: 'yinghai.db', data: a }, { name: 'manifest.json', data: b }])
const parsed = parseZip(z)
if (!parsed.get('yinghai.db').equals(a)) throw new Error('round-trip db mismatch')
if (!parsed.get('manifest.json').equals(b)) throw new Error('round-trip manifest mismatch')
console.log('round-trip OK, zip size', z.length)

// test 2: external compat via Windows tar (bsdtar)
fs.writeFileSync('E:/Movie Vault/.tmp-backup-test.zip', z)
console.log('test zip written')
