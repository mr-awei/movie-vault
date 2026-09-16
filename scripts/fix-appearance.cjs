const fs = require('fs')
const D = 'E:/Movie Vault/src/renderer/src/components/settings'
const f = D + '/AppearanceSection.tsx'
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
s = s.replace(
  "import { Card, SegmentedControl, Select, ThemeCard, SectionHeader, SORT_OPTIONS, SettingsSectionProps } from './settings-ui'",
  "import { Card, SegmentedControl, Select, ThemeCard, SectionHeader, SORT_OPTIONS, SettingsSectionProps, THEME_OPTIONS } from './settings-ui'"
)
fs.writeFileSync(f, s.replace(/\n/g, '\r\n'))
console.log('Appearance import fixed:', s.includes('THEME_OPTIONS } from'))
