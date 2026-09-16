const fs = require('fs')
const P = 'E:/Movie Vault/src/renderer/src/components/Sidebar.tsx'
const OUT = 'E:/Movie Vault/src/renderer/src/components/sidebar-ui.tsx'
let s = fs.readFileSync(P, 'utf8')
const crlf = s.includes('\r\n')
s = s.replace(/\r\n/g, '\n')
const L = s.split('\n')
const w = (p, t) => fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t)

// 工具区：L118（注释行）到 NavItem 结束（function SidebarInner 前一行）
const start = L.findIndex((l) => l.includes('/** 外层可折叠段（导航 / 媒体库 / 我的 / 筛选） */'))
const end = L.findIndex((l) => l.trim().startsWith('function SidebarInner'))
console.log('tool region:', start + 1, '-', end)

const toolBody = L.slice(start, end).join('\n')
const uiFile = [
  '/**',
  ' * Sidebar 共享 UI（B-2 拆分：折叠段 / 滚动持久化 / facet 组 / 导航项）',
  ' */',
  "import { useState, useRef, useEffect, type ReactNode } from 'react'",
  "import Icon, { type IconName } from './Icon'",
  "import { t } from '../../../shared/i18n'",
  '',
  'export interface MetaFacet {',
  '  name: string',
  '  count: number',
  '}',
  '',
  toolBody,
  ''
].join('\n')
w(OUT, uiFile)
console.log('sidebar-ui.tsx OK')

// Sidebar.tsx：删工具区，import 工具 + re-export MetaFacet
const header = L.slice(0, start).join('\n')
const tail = L.slice(end).join('\n')
const newHeader = header.replace(/export interface MetaFacet \{[\s\S]*?\n\}\n\n/, '')
const side = [
  newHeader.replace(
    "import { t } from '../../../shared/i18n'",
    "import { t } from '../../../shared/i18n'\nimport { Section, usePersistentScroll, FacetGroup, NavItem, type MetaFacet } from './sidebar-ui'"
  ),
  "export type { MetaFacet } from './sidebar-ui'",
  '',
  tail
].join('\n')
w(P, side)
console.log('Sidebar.tsx OK')
