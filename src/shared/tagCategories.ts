// 标签分类字典（兜底）：当标签未出现在结构化分组里时做兜底归类。
// 通用电影管理场景下，标签维度不再区分「主题/体型/服装/行为/玩法」等细分维度，
// 统一归入「其他」，由 UI 直接平铺展示用户自定义标签。
// 匹配规则：精确相等。匹配不到归到「其他」。

export const TAG_CATEGORIES: Record<string, string[]> = {}

export const CATEGORY_ORDER: string[] = ['其他']

export function categorizeTag(_tag: string): string {
  return '其他'
}
