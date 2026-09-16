const fs = require('fs')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const write = (p, s, c) => fs.writeFileSync(p, c ? s.replace(/\n/g, '\r\n') : s)

let i = read('E:/Movie Vault/src/main/index.ts')
const c = i.includes('\r\n')
// 4 处 repo 动态 import → 静态（L6 已 import * as repo）
i = i.replace("const { getSettings, saveSettings } = await import('./lib/repo')\n      const s = await getSettings()", 'const s = await repo.getSettings()')
i = i.replace('await saveSettings({ language: installerLang })', 'await repo.saveSettings({ language: installerLang })')
i = i.replace("const { getSettings } = await import('./lib/repo')\n        const s = await getSettings()", 'const s = await repo.getSettings()')
i = i.replace("const { getSettings, listLibraries } = await import('./lib/repo')\n      const s = await getSettings()", 'const s = await repo.getSettings()')
i = i.replace('const libs = await listLibraries()', 'const libs = await repo.listLibraries()')
i = i.replace("const { getSettings } = await import('./lib/repo')\n      const { detectFfmpeg } = await import('./lib/ffmpegEnv')\n      await detectFfmpeg(await getSettings())", 'await detectFfmpeg(await repo.getSettings())')
// ffmpegEnv 静态 import
if (!i.includes("from './lib/ffmpegEnv'")) {
  i = i.replace("import { runtime, applyRuntimeSettings } from './lib/runtime'", "import { runtime, applyRuntimeSettings } from './lib/runtime'\nimport { detectFfmpeg } from './lib/ffmpegEnv'")
}
write('E:/Movie Vault/src/main/index.ts', i, c)
console.log('index.ts dynamic imports fixed:', i.includes("await import('./lib/repo')") ? 'REMAIN' : 'OK', i.includes("await import('./lib/ffmpegEnv')") ? 'ffmpeg REMAIN' : 'ffmpeg OK')
