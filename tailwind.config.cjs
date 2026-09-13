/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 主题变量化：rgb(var(--ink-x) / <alpha-value>)
        // 由 index.css 按 .theme-* 定义各皮肤的具体 RGB 分量
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)'
        },
        brand: {
          DEFAULT: '#14b8a6', // 影海青（teal-500），与图标统一的清新影视质感
          hover: '#2dd4bf'
        },
        tencent: '#ff6022' // 腾讯视频橙，用于点缀
      },
      boxShadow: {
        card: '0 8px 24px rgba(0,0,0,0.45)',
        glow: '0 0 0 2px rgba(20,184,166,0.55), 0 12px 30px rgba(20,184,166,0.25)'
      }
    }
  },
  plugins: []
}
