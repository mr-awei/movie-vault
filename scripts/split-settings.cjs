const fs = require('fs')
const P = 'E:/Movie Vault/src/renderer/src/components/SettingsSections.tsx'
const OUT = 'E:/Movie Vault/src/renderer/src/components/settings'
let s = fs.readFileSync(P, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')
const L = s.split('\n')
const w = (p, txt) => fs.writeFileSync(p, crlf ? txt.replace(/\n/g, '\r\n') : txt)

// 共享区结束：SettingsSectionProps 接口的闭合 }（后跟空行 + 通用分隔注释）
let sharedEnd = L.findIndex((l) => l.includes('export interface SettingsSectionProps'))
for (let i = sharedEnd; i < L.length; i++) {
  if (L[i].trim() === '}' && L[i + 1].trim() === '' && L[i + 2].includes('=====')) { sharedEnd = i; break }
}
console.log('shared: L1-' + (sharedEnd + 1))

// 顶层 export 边界
const expList = []
L.forEach((l, i) => {
  const t = l.trim()
  if (/^export (function|const|interface)/.test(t)) expList.push({ name: t.match(/export (?:function|const|interface) (\w+)/)[1], line: i })
})

const usedIn = (body) => {
  const code = body.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.trim())).join('\n')
  const has = (n) => new RegExp('\\b' + n + '\\b').test(code)
  const IMP = ['useEffect', 'useState', 'Dispatch', 'ReactNode', 'SetStateAction', 'Settings', 'ProxyMode', 'SortKey', 'SourceId', 'PreviewQualityMode', 'BackgroundLoad', 'UpdateCheckResult', 'api', 'Icon', 'ConfirmModal', 't', 'SUPPORTED_LOCALES', 'Locale', 'IconName']
  const SHARED = ['Card', 'Field', 'FieldRow', 'Toggle', 'SegmentedControl', 'Select', 'ThemePreview', 'ThemeCard', 'SectionHeader', 'normalizeProxy', 'PROXY_MODES', 'SORT_OPTIONS', 'SettingsSectionProps', 'getSourceMeta', 'normalizeSourceOrder', 'formatSourceOrder', 'formatBytes', 'urgencyMeta', 'SOURCE_LABELS', 'ALL_SOURCE_ORDER']
  return { imp: IMP.filter(has), shared: SHARED.filter(has) }
}

const importLines = (used, extraShared) => {
  const hooks = used.imp.filter((u) => ['useEffect', 'useState'].includes(u))
  const rtypes = used.imp.filter((u) => ['Dispatch', 'ReactNode', 'SetStateAction'].includes(u))
  const stypes = used.imp.filter((u) => ['Settings', 'ProxyMode', 'SortKey', 'SourceId', 'PreviewQualityMode', 'BackgroundLoad'].includes(u))
  const atypes = used.imp.filter((u) => u === 'UpdateCheckResult')
  const i18n = used.imp.filter((u) => ['t', 'SUPPORTED_LOCALES', 'Locale'].includes(u))
  const out = []
  if (hooks.length) out.push("import { " + hooks.join(', ') + " } from 'react'")
  if (rtypes.length) out.push("import type { " + rtypes.join(', ') + " } from 'react'")
  if (stypes.length) out.push("import type { " + stypes.join(', ') + " } from '../../../shared/types'")
  if (atypes.length) out.push("import type { UpdateCheckResult } from '../../../shared/api-types'")
  if (used.imp.includes('api')) out.push("import { api } from '../../lib/api'")
  if (used.imp.includes('Icon')) out.push("import Icon from '../Icon'")
  if (used.imp.includes('ConfirmModal')) out.push("import ConfirmModal from '../ConfirmModal'")
  if (i18n.length) out.push("import { " + i18n.join(', ') + " } from '../../../shared/i18n'")
  if (used.imp.includes('IconName')) out.push("import type { IconName } from '../Icon'")
  if (extraShared.length) out.push("import { " + extraShared.join(', ') + " } from './settings-ui'")
  return out
}

fs.mkdirSync(OUT, { recursive: true })

// 1) settings-ui.tsx：注释 + 按需 import + 共享区
const uiBody = L.slice(14, sharedEnd + 1).join('\n')
const uiUsed = usedIn(uiBody)
const uiImports = importLines(uiUsed, [])
const uiFile = [
  '/**',
  ' * 设置共享 UI 与常量（B-2 拆分：从 SettingsSections.tsx 拆出）',
  ' * 含 Card/Field/Toggle/Select 等基础控件、数据源/代理常量与 SettingsSectionProps。',
  ' */',
  ...uiImports,
  '',
  uiBody,
  ''
].join('\n')
w(OUT + '/settings-ui.tsx', uiFile)
console.log('settings-ui.tsx OK, used:', uiUsed.imp.join(','), '| shared:', uiUsed.shared.join(','))

// 2) 各 section 独立文件
const sectionFiles = []
for (let i = 0; i < expList.length; i++) {
  const e = expList[i]
  if (e.name === 'PROXY_MODES' || e.name === 'SORT_OPTIONS' || e.name === 'normalizeProxy' || e.name === 'SettingsSectionProps') continue
  const end = i + 1 < expList.length ? expList[i+1].line : L.length
  const body = L.slice(e.line, end).join('\n')
  const used = usedIn(body)
  const imports = importLines(used, used.shared)
  const file = [
    '/**',
    ' * ' + e.name + '（B-2 拆分：从 SettingsSections.tsx 拆出）',
    ' */',
    ...imports,
    '',
    body,
    ''
  ].join('\n')
  const fn = OUT + '/' + e.name + '.tsx'
  w(fn, file)
  sectionFiles.push(e.name)
  console.log(fn, 'OK, imp:', used.imp.join(',') || '-', '| shared:', used.shared.join(',') || '-')
}

// 3) 聚合 re-export
const agg = [
  '/**',
  ' * 设置 8 个分类 section 的聚合出口（B-2 拆分后保持兼容，SettingsModal 继续从这里 import）',
  ' */',
  "export { PROXY_MODES, SORT_OPTIONS, normalizeProxy, SectionHeader, Card, Field, FieldRow, Toggle, SegmentedControl, Select, ThemePreview, ThemeCard, getSourceMeta, normalizeSourceOrder, formatSourceOrder, formatBytes, urgencyMeta } from './settings/settings-ui'",
  "export type { SettingsSectionProps } from './settings/settings-ui'",
  ...sectionFiles.map((n) => "export { " + n + " } from './settings/" + n + "'"),
  ''
].join('\n')
w(P, agg)
console.log('SettingsSections.tsx → aggregate OK')
