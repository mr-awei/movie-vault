/**
 * md 片单 → Excel 片单 转换脚本（v1.9.4 → v2.2.x 迁移工具）
 *
 * 用法：
 *   node scripts/md-to-excel.mjs <input.md> [output.xlsx]
 *
 * 输入：本地影海 v1.9.4 的「简介 md」片单（兼容新旧两种标签格式）
 * 输出：上游 v2.2.x 的 Excel 片单（sheet「片单」，表头：
 *       编号 | 品番 | 分类 | 推荐评分 | 简介 | 主题 | 角色 | 服装 | 体型 | 行为 | 玩法 | 场景 | 剧情 | 其他）
 *
 * 转换规则：
 * - md 分类（#### N、分类名）→ Excel「分类」列
 * - 条目 **N. 品番**：简介 → 品番 / 简介 / 编号
 * - **推荐评分**：9.60 → 「推荐评分」列
 * - 新格式 - **主题**：标签 → 对应分类列；未知分类并入「其他」列
 * - 旧格式 **风格**：标签 → 全部并入「其他」列
 * - 标签统一用顿号连接（excel.ts splitTags 兼容顿号/逗号/分号/空格/换行）
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

// ---------- 解析逻辑（移植自 src/main/lib/parser.ts） ----------

const CAT_RE = /^(#{1,6})\s*(.+?)\s*$/
const ITEM_RE = /^\*\*\s*(?:\d+[\.、]\s*)?([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*)\s*\*\*\s*[:：]([\s\S]*)$/
const TAG_BLOCK_RE = /^\*\*\s*标签\s*\*\*\s*[:：]\s*$/
const TAG_LINE_RE = /^[-*]\s*\*\*([^*]+)\*\*\s*[:：]\s*(.+)$/

function splitDescTags(rest) {
  let description = rest
  let tagPart = ''
  const idx = rest.indexOf('风格')
  if (idx >= 0) {
    description = rest.slice(0, idx)
    tagPart = rest.slice(idx + '风格'.length)
    tagPart = tagPart.replace(/^\**\s*[:：]?\s*/, '')
  }
  description = description.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  const raw = tagPart
    .replace(/\*\*/g, ' ')
    .split(/[\/、\s]+/)
    .map((t) => t.trim())
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((t) => t.length > 0 && t !== '风格')
  const seen = new Set()
  const tags = []
  for (const t of raw) {
    if (!seen.has(t)) {
      seen.add(t)
      tags.push(t)
    }
  }
  return { description, tags, tagCategories: {} }
}

function parseIntroMd(content) {
  const lines = content.split(/\r?\n/)
  const categories = []
  let current = null
  let lastItem = null
  let collectingTags = false
  let order = 0
  let total = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      collectingTags = false
      continue
    }
    const catMatch = trimmed.match(CAT_RE)
    if (catMatch) {
      const name = catMatch[2].replace(/^\d+[\.、]\s*/, '').trim() || '未命名分类'
      current = { name, order: order++, items: [] }
      categories.push(current)
      collectingTags = false
      lastItem = null
      continue
    }
    const itemMatch = trimmed.match(ITEM_RE)
    if (itemMatch) {
      const code = itemMatch[1]
      const { description, tags, tagCategories } = splitDescTags(itemMatch[2])
      const item = { code, description, tags, tagCategories, raw: trimmed }
      if (!current) {
        current = { name: '未分类', order: order++, items: [] }
        categories.push(current)
      }
      current.items.push(item)
      lastItem = item
      collectingTags = true
      total++
      continue
    }
    if (lastItem && TAG_BLOCK_RE.test(trimmed)) {
      collectingTags = true
      continue
    }
    const tagLine = trimmed.match(TAG_LINE_RE)
    if (collectingTags && lastItem && tagLine) {
      const cat = tagLine[1].trim()
      if (cat === '推荐评分') {
        const m = tagLine[2].match(/(\d+(?:\.\d+)?)/)
        if (m) lastItem.score = parseFloat(m[1])
        continue
      }
      const list = tagLine[2]
        .split(/[、,，\/]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
      if (cat && list.length > 0) {
        lastItem.tagCategories = lastItem.tagCategories ?? {}
        const prev = lastItem.tagCategories[cat] ?? []
        lastItem.tagCategories[cat] = [...prev, ...list]
        for (const t of list) {
          if (!lastItem.tags.includes(t)) lastItem.tags.push(t)
        }
      }
      continue
    }
    collectingTags = false
    lastItem = null
  }
  return { categories: categories.filter((c) => c.items.length > 0), totalCount: total }
}

// ---------- 转换 ----------

// Excel 标准表头（与上游 excel.ts 期望一致）
const HEADERS = ['编号', '品番', '分类', '推荐评分', '简介', '主题', '角色', '服装', '体型', '行为', '玩法', '场景', '剧情', '其他']
const KNOWN_TAG_COLS = new Set(['主题', '角色', '服装', '体型', '行为', '玩法', '场景', '剧情'])

function toSheetRows(doc) {
  const rows = []
  let no = 0
  const seenCodes = new Set()
  const dupCodes = []
  for (const cat of doc.categories) {
    for (const item of cat.items) {
      const norm = item.code.toUpperCase().replace(/[\s.]+/g, '')
      if (seenCodes.has(norm)) {
        dupCodes.push(`${item.code}（${cat.name}）`)
        continue
      }
      seenCodes.add(norm)
      no++
      // 新格式：tagCategories 分类列
      const tagCols = {}
      for (const [catName, tags] of Object.entries(item.tagCategories ?? {})) {
        if (KNOWN_TAG_COLS.has(catName)) tagCols[catName] = tags.join('、')
        else tagCols['其他'] = [...(tagCols['其他'] ? tagCols['其他'].split('、') : []), ...tags].join('、')
      }
      // 旧格式：平铺 tags 无分类 → 并入「其他」
      if (Object.keys(item.tagCategories ?? {}).length === 0 && item.tags.length > 0) {
        const others = tagCols['其他'] ? tagCols['其他'].split('、') : []
        tagCols['其他'] = [...others, ...item.tags].join('、')
      }
      const row = {
        编号: no,
        品番: item.code,
        分类: cat.name,
        推荐评分: item.score ?? '',
        简介: item.description ?? '',
        ...tagCols
      }
      rows.push(row)
    }
  }
  return { rows, total: no, dupCodes }
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('用法: node scripts/md-to-excel.mjs <input.md> [output.xlsx]')
    process.exit(1)
  }
  const abs = path.resolve(input)
  let content
  try {
    content = await fs.readFile(abs, 'utf-8')
  } catch (e) {
    console.error(`读取失败 ${abs}:`, e.message)
    process.exit(1)
  }
  // 编码兜底：UTF-8 解析出大量替换符 \uFFFD 时，尝试 GBK（iconv-lite 若可用）
  if ((content.match(/\uFFFD/g) || []).length > content.length * 0.01) {
    try {
      const buf = await fs.readFile(abs)
      const iconv = (await import('iconv-lite')).default
      content = iconv.decode(buf, 'gbk')
      console.log('[warn] UTF-8 乱码，已尝试按 GBK 重新解码')
    } catch {
      console.warn('[warn] 文件疑似非 UTF-8 且无 iconv-lite，保持原样（可能有乱码）')
    }
  }
  const doc = parseIntroMd(content)
  if (doc.totalCount === 0) {
    console.error('未解析出任何条目，请检查 md 格式（需 **N. 品番**：... 或 #### 分类 结构）')
    process.exit(1)
  }
  const { rows, total, dupCodes } = toSheetRows(doc)
  const out = path.resolve(process.argv[3] ?? abs.replace(/\.md$/i, '') + '.xlsx')
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS })
  ws['!cols'] = HEADERS.map((h) => ({ wch: h === '简介' ? 60 : h === '品番' ? 14 : 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '片单')
  XLSX.writeFile(wb, out)

  const catNames = doc.categories.map((c) => `${c.name}(${c.items.length})`).join('、')
  console.log('✓ 转换完成')
  console.log(`  解析分类: ${doc.categories.length} 个（${catNames}）`)
  console.log(`  有效条目: ${total} 条`)
  if (dupCodes.length) console.log(`  跳过重复番号: ${dupCodes.length} 条（${dupCodes.slice(0, 5).join('、')}${dupCodes.length > 5 ? '…' : ''}）`)
  console.log(`  输出: ${out}`)
  console.log('  提示: 把该 xlsx 放到媒体库根目录，v2.2.3+ 会自动扫描作为片单')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
