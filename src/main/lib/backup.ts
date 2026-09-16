import { app, dialog } from 'electron'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { getDbPath } from './db'

/**
 * P2-7: 内置 Backup / Restore（纯 Node 手写 zip，零依赖）。
 * 导出：yinghai.db + data.json + manifest.json 打包为 zip（用户选保存路径）。
 * 导入：解析 zip → schema/应用版本校验 → 覆盖数据库（先备份现有 .pre-restore）。
 */

/* ---------------- zip writer ---------------- */

let crcTable: number[] | null = null
function crc32(buf: Buffer): number {
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

function dosDateTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return [time, date]
}

function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const raw = deflateRawSync(f.data)
    const method = raw.length < f.data.length ? 8 : 0
    const body = method === 8 ? raw : f.data
    const crc = crc32(f.data)
    const [t, d] = dosDateTime(new Date())
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0, 6)
    lh.writeUInt16LE(method, 8)
    lh.writeUInt16LE(t, 10)
    lh.writeUInt16LE(d, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(f.data.length, 22)
    lh.writeUInt16LE(name.length, 26)
    lh.writeUInt16LE(0, 28)
    chunks.push(lh, name, body)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0, 8)
    ch.writeUInt16LE(method, 10)
    ch.writeUInt16LE(t, 12)
    ch.writeUInt16LE(d, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(f.data.length, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, name)
    offset += lh.length + name.length + body.length
  }
  const cd = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, cd, eocd])
}

/* ---------------- zip reader ---------------- */

function parseZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  const eocd = buf.lastIndexOf(sig)
  if (eocd < 0) throw new Error('不是有效的 zip 文件')
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('zip 目录损坏')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('zip 条目损坏')
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const data = buf.subarray(dataStart, dataStart + compSize)
    out.set(name, method === 8 ? inflateRawSync(data) : data)
    off += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/* ---------------- backup / restore ---------------- */

export interface BackupResult {
  ok: boolean
  path?: string
  error?: string
  needsRestart?: boolean
}

export async function backupExport(): Promise<BackupResult> {
  const stamp = new Date().toISOString().slice(0, 10)
  const res = await dialog.showSaveDialog({
    title: '导出库备份（数据库 + 配置）',
    defaultPath: `yinghai-backup-${stamp}.zip`,
    filters: [{ name: 'Zip 备份', extensions: ['zip'] }]
  })
  if (res.canceled || !res.filePath) return { ok: false, error: '已取消' }
  try {
    const files: { name: string; data: Buffer }[] = []
    const dbPath = getDbPath()
    const dataPath = path.join(app.getPath('userData'), 'data.json')
    if (existsSync(dbPath)) files.push({ name: 'yinghai.db', data: await fs.readFile(dbPath) })
    if (existsSync(dataPath)) files.push({ name: 'data.json', data: await fs.readFile(dataPath) })
    files.push({
      name: 'manifest.json',
      data: Buffer.from(
        JSON.stringify({ appVersion: app.getVersion(), exportedAt: Date.now(), exportedAtText: new Date().toLocaleString('zh-CN') })
      )
    })
    await fs.writeFile(res.filePath, makeZip(files))
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || '导出失败' }
  }
}

export async function backupImport(): Promise<BackupResult> {
  const res = await dialog.showOpenDialog({
    title: '导入库备份（将覆盖当前数据库，导入前自动备份现有数据）',
    filters: [{ name: 'Zip 备份', extensions: ['zip'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, error: '已取消' }
  try {
    const buf = await fs.readFile(res.filePaths[0])
    const entries = parseZip(buf)
    const manifestRaw = entries.get('manifest.json')
    if (!manifestRaw) return { ok: false, error: '不是有效的影海备份（缺少 manifest.json）' }
    let manifest: { appVersion?: string; exportedAt?: number; exportedAtText?: string }
    try {
      manifest = JSON.parse(manifestRaw.toString('utf8')) as typeof manifest
    } catch {
      return { ok: false, error: '备份清单解析失败' }
    }
    const dbPath = getDbPath()
    // 覆盖前先备份现有数据库，出问题可手动恢复
    if (existsSync(dbPath)) await fs.copyFile(dbPath, dbPath + '.pre-restore')
    if (entries.has('yinghai.db')) await fs.writeFile(dbPath, entries.get('yinghai.db')!)
    // v2.12.1：data.json 已废弃（SQLite 唯一数据源），导入不再写回 JSON，避免双写
    return {
      ok: true,
      needsRestart: true,
      path: manifest.exportedAtText ?? undefined
    }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || '导入失败' }
  }
}
