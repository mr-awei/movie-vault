import type { IntroDoc, IntroItem } from '../../shared/types'
// SheetJS：读取 xlsx。xlsx 解析是主进程侧依赖（electron-builder 打进 app.asar）。
import * as XLSX from 'xlsx'
import { promises as fs, readFileSync } from 'node:fs'
import { cleanGenreName } from './image-util'

/**
 * 解析「收藏整理」Excel 片单（唯一片单权威来源）。
 *
 * 期望结构（sheet「片单」）：
 *   表头：片名 | 分类 | 推荐评分 | 简介
 *   数据行：从第 2 行开始；「分类」即分类分组名；「片名」即影片匹配键（通常为文件名主体）；
 *           「推荐评分」为 0-10 数值；「简介」为影片介绍文本。
 *   兼容旧版列名「标题 / 编号」（自动识别为片名列）。
 * 产出 IntroDoc（统一作为片单权威源）。
 */

function splitTags(v: unknown): string[] {
  if (v == null) return []
  const s = String(v).trim()
  if (!s) return []
  // 兼容逗号、顿号、中文分号、空格、换行分隔
  return s
    .split(/[,，、;；\n\r\t ]+/)
    .map((x) => x.trim())
    .map((x) => cleanGenreName(x)) // 清洗 AI 生成的脏标签（【多人】2、纯 / 等）
    .filter((x): x is string => !!x)
}

function toScore(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return Math.min(10, Math.max(0, n))
}

/**
 * 解析 Excel 片单文件。
 * @returns IntroDoc；文件缺失/无有效数据时返回 null（由调用方回退 md）
 *
 * 2026-08-30 修复：v2.2.3 用的 `XLSX.readFile(filePath)` 在 Windows 中文路径下静默失败
 * （mjs 版 v0.18.5 的 readFileSync 对非 ASCII 路径处理不当，会抛 "Cannot access file"）。
 * 改成读 buffer 再喂 XLSX.read —— 经过实测 `E:\新建文件夹\收藏整理_2026.xlsx` 成功解析。
 */
export async function parseIntroExcel(filePath: string): Promise<IntroDoc | null> {
  let wb: XLSX.WorkBook
  try {
    // 先 readFile 拿 buffer，再喂给 XLSX.read —— 绕开 xlsx mjs readFileSync 中文路径 bug
    const buf = await fs.readFile(filePath)
    wb = XLSX.read(buf, { type: 'buffer' })
  } catch (e) {
    console.error(`[excel] 读取失败 ${filePath}:`, (e as Error)?.message || e)
    return null
  }
  // 兼容不同 sheet 名（片单 / 收藏 / Sheet1 ...）：取第一个含「片名/标题」列的工作表
  // （兼容旧版列名「编号」）
  // 2026-08-30 修复：原版只看 B 列 (rows[0]?.[1])，用户把匹配键放 D 列、F 列时直接报"未找到列"。
  // 改成扫描整个首行（含表头 fallback 至 B 列，若全部工作表都没有匹配列就放弃）
  const sheetNames = wb.SheetNames
  let ws: XLSX.WorkSheet | undefined
  let sheetName = ''
  let codeColIdx = -1  // 本 sheet 中「片名/标题」列所在位置
  for (const name of sheetNames) {
    const candidate = wb.Sheets[name]
    if (!candidate) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(candidate, { header: 1 })
    if (rows.length === 0) continue
    const header = (rows[0] ?? []) as unknown[]
    // 优先整行扫「片名 / 标题 / 编号」
    let idx = header.findIndex((h) => {
      const t = String(h ?? '').trim()
      return t === '片名' || t === '标题' || t === '编号'
    })
    // 兼容部分老 sheet：B 列就是匹配键但表头没文字
    if (idx < 0) idx = String(header[1] ?? '').trim() === '' ? -1 : 1
    if (idx >= 0) {
      ws = candidate
      sheetName = name
      codeColIdx = idx
      break
    }
  }
  if (!ws || codeColIdx < 0) {
    console.error(`[excel] ${filePath} 未找到含「片名/标题」列的工作表（sheets=${sheetNames.join(',')}）`)
    return null
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
  const header = (rows[0] ?? []) as unknown[]
  if (rows.length < 2) return null

  // 列索引：按表头名定位（容错表头顺序变化）
  const colIndex = (key: string): number => {
    const i = header.findIndex((h) => String(h ?? '').trim() === key)
    return i >= 0 ? i : -1
  }
  const ci = {
    code: codeColIdx,
    category: colIndex('分类'),
    score: colIndex('推荐评分'),
    desc: colIndex('简介')
  }
  // 结构化标签列：编号之后的列，跳过已知的"非标签"列（标题/年份等辅助列）
  const NON_TAG_COLS = new Set(['分类', '推荐评分', '简介', '标题', '片名', '年份'])
  const tagCols: { name: string; idx: number }[] = []
  for (let i = Math.max(1, ci.code + 1); i < header.length; i++) {
    const name = String(header[i] ?? '').trim()
    if (!name || name === '编号' || NON_TAG_COLS.has(name)) continue
    tagCols.push({ name, idx: i })
  }

  const entries: Array<{ category: string; item: IntroItem }> = []
  const seenCodes = new Set<string>()  // v2.2.3 P1：按归一externalId去重（保留首次出现）；重复行只 warn 一次
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length === 0) continue
    const code = String(row[ci.code] ?? '').trim()
    if (!code) continue
    const norm = code.trim().toUpperCase()
    if (seenCodes.has(norm)) {
      console.warn(`[excel] 跳过重复编号 ${code}（行 ${r + 1}，已出现于更早分类）`)
      continue
    }
    seenCodes.add(norm)

    const category = String(row[ci.category] ?? '').trim() || '未分类'
    const score = toScore(row[ci.score])
    const description = String(row[ci.desc] ?? '').trim()
    const tagCategories: Record<string, string[]> = {}
    const allTags: string[] = []
    for (const tc of tagCols) {
      if (tc.idx >= row.length) continue
      const tags = splitTags(row[tc.idx])
      if (tags.length > 0) {
        tagCategories[tc.name] = tags
        allTags.push(...tags)
      }
    }
    const raw = `**片名**：${code}\n**推荐评分**：${score ?? ''}\n**简介**：${description}\n${Object.entries(tagCategories)
      .map(([k, v]) => `**${k}**：${v.join('，')}`)
      .join('\n')}`

    entries.push({
      category,
      item: {
        code,
        description,
        tags: [...new Set(allTags)], // 平铺去重
        tagCategories,
        score,
        category: category === '未分类' ? undefined : category,
        raw
      }
    })
  }

  if (entries.length === 0) return null

  // 分组（保持首次出现顺序）
  const categories: IntroDoc['categories'] = []
  const seen = new Map<string, number>()
  for (const e of entries) {
    let order = seen.get(e.category)
    if (order === undefined) {
      order = categories.length
      seen.set(e.category, order)
      categories.push({ name: e.category, order, items: [] })
    }
    categories[order].items.push(e.item)
  }

  console.log(`[excel] ${sheetName} 解析完成：${entries.length} 部 / ${categories.length} 类`)
  return { categories, totalCount: entries.length }
}

/** 供 UI 提示的解析信息（调试/日志） */
export function excelSheetNames(filePath: string): string[] {
  try {
    // 同样用 buffer 读取，绕开 xlsx mjs readFileSync 中文路径 bug
    const buf = readFileSync(filePath)
    const wb = XLSX.read(buf, { type: 'buffer' })
    return wb.SheetNames
  } catch {
    return []
  }
}

export function isExcelFile(p: string): boolean {
  return /\.(xlsx|xls)$/i.test(p)
}
