/**
 * About module static config (edit once, managed centrally)
 *
 * Link fields (website / github / gitee / feedback) — leave empty to skip rendering that button.
 * After deploying to your own repo, replace the TODO placeholder with the real URL.
 *
 * getAbout(language) returns the localized ABOUT object; ABOUT_ZH / ABOUT_EN are exported directly;
 * ABOUT is kept as a backward-compatible alias for ABOUT_ZH.
 */
export interface AboutLink {
  key: 'website' | 'github' | 'gitee' | 'feedback'
  label: string
  icon: 'home' | 'external' | 'info'
  url: string
}

export interface TechItem {
  name: string
  detail: string
  url?: string
}

export interface ThirdPartyItem {
  name: string
  license: string
  url: string
}

export type About = {
  name: string
  tagline: string
  description: string
  author: string
  year: number
  license: string
  licenseUrl: string
  github: string
  links: AboutLink[]
  techStack: TechItem[]
  thirdParty: ThirdPartyItem[]
}

export function getAbout(language: string): About {
  return language === 'en-US' ? ABOUT_EN : ABOUT_ZH
}

export const ABOUT_ZH: About = {
  /** 应用名（与 package.json productName 一致） */
  name: '影海',
  /** 一句话标语 */
  tagline: '本地影片海报墙管理 · 基于 Excel 片单的私人影库',
  /** 较长描述 */
  description:
    '影海是一款面向本地影片收藏的桌面管理工具：选择视频文件夹 + Excel 片单文件，即可生成可按分类浏览的海报墙。' +
    'Excel 片单为权威来源（分类 / 简介 / 标签 / 评分），支持从公开影视数据库（TMDB、OMDb、OpenLibrary、JustWatch）' +
    '抓取封面与详情并本地永久缓存、深色 / 浅色 / 跟随系统主题、虚拟滚动大库流畅、隐私护盾一键模糊预览图，' +
    '以及按演员 / 制片公司 / 系列筛选与统计看板。',
  /** 作者 / 团队 */
  author: '影海',
  /** 版权起始年份 */
  year: 2026,
  /** 许可证 */
  license: '影海 双授权协议 v1.0',
  licenseUrl: 'https://github.com/mr-awei/yinghai-movie-vault/blob/main/LICENSE',

  /** 开源仓库地址（About 弹窗用于引导点亮 Star） */
  github: 'https://github.com/mr-awei/yinghai-movie-vault',

  /** 外部链接（留空不渲染） */
  links: [
    {
      key: 'github',
      label: 'GitHub',
      icon: 'external',
      url: 'https://github.com/mr-awei/yinghai-movie-vault'
    },
    {
      key: 'gitee',
      label: 'Gitee',
      icon: 'external',
      url: 'https://gitee.com/mr-awei/yinghai-movie-vault'
    },
    {
      key: 'feedback',
      label: '反馈问题',
      icon: 'info',
      // TODO: 替换为 issue 页或邮箱（mailto:you@example.com）
      url: ''
    }
  ],

  /** 核心技术栈（自建部分） */
  techStack: [
    { name: 'Electron', detail: '跨平台桌面运行时', url: 'https://www.electronjs.org/' },
    { name: 'React', detail: 'UI 框架', url: 'https://react.dev/' },
    { name: 'TypeScript', detail: '开发语言', url: 'https://www.typescriptlang.org/' },
    { name: 'Vite', detail: '构建工具（electron-vite）', url: 'https://vitejs.dev/' },
    { name: 'Tailwind CSS', detail: '样式方案', url: 'https://tailwindcss.com/' }
  ],

  /** 关键第三方依赖与数据来源（致谢） */
  thirdParty: [
    { name: 'undici', license: 'MIT', url: 'https://github.com/nodejs/undici' },
    { name: 'archiver', license: 'MIT', url: 'https://github.com/archiverjs/node-archiver' },
    { name: 'TMDB', license: 'Data source', url: 'https://www.themoviedb.org/' }
  ]
}

export const ABOUT_EN: About = {
  name: 'yinghai',
  tagline: 'Local video poster wall · Excel-sheet-driven private library',
  description:
    'yinghai is a desktop tool for managing local video collections: point it at a video folder plus an Excel sheet, ' +
    'and it generates a browseable poster wall organized by categories. The Excel sheet is the single source of truth ' +
    '(categories / descriptions / tags / ratings). Optional metadata scraping from public film databases ' +
    '(TMDB, OMDb, OpenLibrary, JustWatch) with permanent local cache, ' +
    'dark / light / system themes, smooth virtual scrolling for large libraries, a privacy shield that blurs preview thumbnails, ' +
    'plus actor / studio / series filtering and a statistics dashboard.',
  author: 'Ying Xia',
  year: 2026,
  license: 'Ying Xia Dual License v1.0',
  licenseUrl: 'https://github.com/mr-awei/yinghai-movie-vault/blob/main/LICENSE',
  github: 'https://github.com/mr-awei/yinghai-movie-vault',
  links: [
    {
      key: 'github',
      label: 'GitHub',
      icon: 'external',
      url: 'https://github.com/mr-awei/yinghai-movie-vault'
    },
    {
      key: 'gitee',
      label: 'Gitee',
      icon: 'external',
      url: 'https://gitee.com/mr-awei/yinghai-movie-vault'
    },
    {
      key: 'feedback',
      label: 'Report Issue',
      icon: 'info',
      // TODO: replace with issue page or email (mailto:you@example.com)
      url: ''
    }
  ],
  techStack: [
    { name: 'Electron', detail: 'Cross-platform desktop runtime', url: 'https://www.electronjs.org/' },
    { name: 'React', detail: 'UI framework', url: 'https://react.dev/' },
    { name: 'TypeScript', detail: 'Development language', url: 'https://www.typescriptlang.org/' },
    { name: 'Vite', detail: 'Build tool (electron-vite)', url: 'https://vitejs.dev/' },
    { name: 'Tailwind CSS', detail: 'Styling solution', url: 'https://tailwindcss.com/' }
  ],
  thirdParty: [
    { name: 'undici', license: 'MIT', url: 'https://github.com/nodejs/undici' },
    { name: 'archiver', license: 'MIT', url: 'https://github.com/archiverjs/node-archiver' },
    { name: 'TMDB', license: 'Data source', url: 'https://www.themoviedb.org/' }
  ]
}

// Backward-compatible alias
export const ABOUT: About = ABOUT_ZH
