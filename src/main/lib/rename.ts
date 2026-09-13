import { promises as fs } from 'node:fs'
import path from 'node:path'

/** 开头常见的下载站/压制组域名前缀（如 subteam.com@ / www.example.com_ / dl.movie.net-） */
const LEADING_SITE_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}[@_\-\s]+/i
/** 开头常见的标记前缀（如 【字幕组】、(中字)、[某某压制]） */
const LEADING_TAG_RE = /^[\[【（(][^\]\)）】]{0,16}[\]\)）】][@_\-\s]*/

/**
 * 清理视频文件名开头的「下载站域名 / 标记」前缀（通用清理，不解析任何编号规则）。
 * 例：
 *   subteam.com@Movie.2020.mkv  → Movie.2020.mkv
 *   【字幕组】Movie.2020.mkv    → Movie.2020.mkv
 *   www.example.com_Movie.2020.mkv → Movie.2020.mkv
 * 返回 null 表示无需改名（没有可清理的前缀）。
 */
export function cleanVideoFileName(fileName: string): string | null {
  const ext = path.extname(fileName)
  const stem = fileName.slice(0, fileName.length - ext.length)
  let s = stem
  // 反复剥离，覆盖「域名@【标记】片名」这类多重前缀
  for (let i = 0; i < 3; i++) {
    const before = s
    s = s.replace(LEADING_SITE_RE, '').replace(LEADING_TAG_RE, '')
    if (s === before) break
  }
  s = s.trim()
  if (!s || s === stem) return null
  return s + ext
}

/** Windows 保留设备名（单独作为文件名时非法） */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/**
 * 把用户编辑的标题转成安全的（Windows）文件名主干（不含扩展名）。
 * 供「编辑影片信息 → 保存时同步修改文件名」使用：
 * - 去掉 \ / : * ? " < > | 与控制字符（Windows 文件名非法）
 * - 合并空白、去掉首尾空格与结尾的点（Windows 不允许以空格/点结尾）
 * - 撞上保留设备名（CON/PRN/AUX/NUL/COM1…）时加下划线前缀
 * - 长度截断到 120 字符（留出目录路径空间，规避 MAX_PATH 260 限制）
 * 返回空串表示标题无法用作文件名。
 */
export function safeFileBaseName(title: string, maxLen = 120): string {
  if (!title) return ''
  let s = String(title)
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // 结尾的点/空格在 Windows 上会被静默丢弃，改名后与原名不一致
  s = s.replace(/[.\s]+$/, '')
  if (!s) return ''
  if (RESERVED.test(s)) s = `_${s}`
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/[\s.]+$/, '')
  return s
}

/** 预览：扫描文件夹中可安全改名的文件（只处理无 video 记录、未被用户忽略的文件） */
export async function previewRenames(
  folderPath: string,
  isIndexed: (p: string) => Promise<boolean>,
  shouldIgnore?: (p: string) => boolean
): Promise<Array<{ path: string; oldName: string; newName: string }>> {
  const files: string[] = []
  for await (const f of walkFiles(folderPath)) files.push(f)
  const items: Array<{ path: string; oldName: string; newName: string }> = []
  const seen = new Set<string>()
  for (const f of files) {
    const oldName = path.basename(f)
    const newName = cleanVideoFileName(oldName)
    if (!newName) continue
    const dir = path.dirname(f)
    const newPath = path.join(dir, newName)
    if (newPath === f) continue
    // 跳过已收录（有 video 记录）的文件
    if (await isIndexed(f)) continue
    // 跳过用户已忽略的对账未收录文件
    if (shouldIgnore?.(f)) continue
    // 冲突：目标名已存在
    if (seen.has(newName) || (await fileExists(newPath))) continue
    seen.add(newName)
    items.push({ path: f, oldName, newName })
  }
  return items
}

/** 执行改名（逐个，失败跳过） */
export async function applyRenames(
  items: Array<{ path: string; newName: string }>
): Promise<{ ok: number; failed: Array<{ path: string; reason: string }> }> {
  let ok = 0
  const failed: Array<{ path: string; reason: string }> = []
  for (const item of items) {
    const newPath = path.join(path.dirname(item.path), item.newName)
    try {
      if (newPath === item.path) continue
      if (await fileExists(newPath)) throw new Error('目标文件已存在')
      await fs.rename(item.path, newPath)
      ok++
    } catch (e) {
      failed.push({ path: item.path, reason: (e as Error).message })
    }
  }
  return { ok, failed }
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      yield* walkFiles(full)
    } else if (ent.isFile()) {
      yield full
    }
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
