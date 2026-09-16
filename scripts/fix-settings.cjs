const fs = require('fs')
const D = 'E:/Movie Vault/src/renderer/src/components/settings'
const w = (p, t) => fs.writeFileSync(p, t.replace(/\n/g, '\r\n'))

// 1) settings-ui.tsx：给共享函数/常量加 export
let ui = fs.readFileSync(D + '/settings-ui.tsx', 'utf8').replace(/\r\n/g, '\n')
const FNS = ['getSourceMeta', 'normalizeSourceOrder', 'formatSourceOrder', 'formatBytes', 'urgencyMeta', 'Card', 'Field', 'FieldRow', 'Toggle', 'SegmentedControl', 'Select', 'ThemePreview', 'ThemeCard']
FNS.forEach((n) => {
  ui = ui.replace(new RegExp('^function ' + n + '\\b', 'm'), 'export function ' + n)
})
ui = ui.replace(/^const THEME_OPTIONS: ThemeOption\[\]/m, 'export const THEME_OPTIONS: ThemeOption[]')
w(D + '/settings-ui.tsx', ui)
console.log('settings-ui exports OK')

// 2) 各 section：路径修正 ../../../shared → ../../../../shared；AppearanceSection 补 THEME_OPTIONS import
const files = fs.readdirSync(D).filter((f) => f.endsWith('.tsx') && f !== 'settings-ui.tsx')
for (const f of files) {
  let s = fs.readFileSync(D + '/' + f, 'utf8').replace(/\r\n/g, '\n')
  s = s.replace(/\.\.\/\.\.\/\.\.\/shared/g, '../../../../shared')
  if (f === 'AppearanceSection.tsx' && !s.includes('THEME_OPTIONS')) {
    s = s.replace("import { ", "import { THEME_OPTIONS, ")
  }
  w(D + '/' + f, s)
  console.log(f, 'fixed')
}
