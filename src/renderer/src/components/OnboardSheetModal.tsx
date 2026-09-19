import { useEffect, useMemo, useRef, useState } from 'react'
import { t, getLocale, subscribeLocale } from '../../../shared/i18n'
import type { Library } from '../../../shared/types'
import Icon from './Icon'

// ============================================================================
// 新建片单 Excel 向导 —— 完全对齐原始 OnboardMdModal（v2.1.x）的逻辑骨架
// 只把 Markdown 文案换成 Excel 导向，其余完整保留：PROMPT_TEXT 常量、
// buildFullPrompt()、统一 copy()、handleExport()、handleCopyFullPrompt()、
// UI 全展开（3 个 section 垂直排列）、底部 3 按钮始终显示。
// ============================================================================

interface Props {
  open: boolean
  library: Library | null
  /** 关闭弹窗。dontShowAgain=true 表示用户勾选了"不再提示"并确认 */
  onClose: (dontShowAgain: boolean) => void
  /** 打开外部链接（如 Grok） */
  onOpenExternal: (url: string) => void
  /** 打开完整规范（用系统程序打开规范文件） */
  onOpenSpec: () => void
  /** 打开规范文件所在文件夹（shellRevealInFolder，发给 AI 用） */
  onRevealSpec: () => void
  /** 关闭向导并打开库设置（片单 Excel tab） */
  onOpenLibrarySettings: () => void
  /** 复制文本到剪贴板 */
  onCopyText: (text: string) => void
  /** 导出影片清单 */
  onExportCodes: (libraryId: string, format: 'txt' | 'xlsx') => Promise<{ ok: boolean; path?: string; error?: string }>
}

const GROK_URL = 'https://grok.com'

/** 中文提示词（v4.0 规范） */
const PROMPT_TEXT_ZH = `请根据我提供的影片清单，按照以下要求生成可以直接粘贴进已有的影海片单 Excel 的内容：

【核心原则】
1. 评分看完成度：不因为类型低俗而歧视，不因为名气大而吹高；以影片实际完成度和类型定位评分。
2. 简介讲清剧情：不要告诉我"这是一部什么样的电影"，首先告诉我"这部电影发生了什么"。
3. 不确定就查：剧情信息必须尽可能核实，不能根据片名、类型和印象自行脑补。

【第一步：确认影片并查询资料】
- 确认正式片名、年份，注意同名/多版本影片。
- 查询导演、演员、人物、故事背景、剧情、类型。
- 允许参考百科、IMDb、豆瓣、TMDB 等公开资料，但必须改写，禁止大段原文复制。
- 严禁根据片名猜剧情；资料不足时宁可缩短简介，也不能编造。

【第二步：确定分类】
从以下 15 类中选一个最匹配的主分类：
剧情 / 动作 / 科幻 / 喜剧 / 爱情 / 悬疑 / 恐怖 / 动画 / 纪录片 / 情色 / 犯罪 / 奇幻 / 历史 / 武侠 / 其他
（明确以情欲与性爱驱动选「情色」；案件属性强于情色选「犯罪」；核心是恐惧选「恐怖」；动画长片优先选「动画」）

【第三步：十维加权评分（10 分制，两位小数）】
剧作 15% / 导演与调度 14% / 表演 13% / 摄影与美术 12% / 剪辑与节奏 10% /
配乐与音效 9% / 主题与思想性 8% / 原创性与差异化 7% / 制作规格与工业完成度 6% / 系列定位与口碑延续 6%。
- 低成本三级/情色/猎奇作品优先与同类横向对比，常见落点 5.8–6.8；《玉蒲团之偷情宝鉴》6.7+ 为情色类高锚，《八仙饭店之人肉叉烧包》7.5+ 为犯罪/猎奇类高锚。
- 情色内容本身不加分也不减分，只评价其是否服务于叙事。
- 避免全部集中在 8 分以上；冷门作品保守给分。

【第四步：撰写简介（中文 100–180 字，剧情优先）】
简介必须回答：主角是谁？故事起点是什么？什么事件改变了状态？核心冲突是什么？后续如何发展？
推荐结构：人物/背景 → 事件起因 → 核心冲突 → 主要发展 → 类型/特色。
- 剧情信息占 60%–80%，特色/主题/氛围占 20%–40%。
- 允许剧透前提和主要剧情发展，但避免直接揭示最终结局、真凶、最终反转。
- 禁止空泛表达代替剧情：不要用"影片围绕……展开""讲述了一段……""展现了……""探讨了人性……"等。
- 全片单句式要有变化，不要每部都以同一句式开头。
- 情色场面用中性客观的剧情语言描述，不要写成色情内容罗列。

【第五步：标签】
主题 / 地区 / 时代 / 系列 / 元素 / 氛围 / 形式 / 亮点，用「、」分隔，单格不超过 6 个值；无内容留空。

【Excel 表头】编号	标题	年份	分类	推荐评分	简介	主题	地区	系列

【评分分档】9.20–10 殿堂级 / 8.50–9.15 神作 / 7.80–8.45 优秀 / 7.00–7.75 良好 / 6.30–6.95 及格 / 5.50–6.25 平庸 / 4.50–5.45 较差 / 3.00–4.45 差 / 0–2.95 极差。

【简介禁忌】不要编造剧情、不要复制百科原文、不要罗列演员表、不要写「必看/神作」等推销语、不要空泛评价代替具体剧情、不要低俗堆砌露骨细节。

【格式要求】每行一部影片，字段之间用 Tab 键（不是空格）分隔，确保粘贴到 Excel 后自动分列。`
/** English prompt (v4.0 spec) */
const PROMPT_TEXT_EN = `Generate a Yinghai sheet for the given movie list. Follow these rules:

【Core Principles】
1. Rate fairly: do not discriminate against a film because of its genre, and do not inflate it because of its reputation. Judge its actual execution within its genre and production context.
2. Make the synopsis tell the story: do not merely tell me what kind of film it is. First tell me what happens in the film.
3. Research before writing: if information is uncertain, research it. If it cannot be verified, do not invent it.

【Step 1: Identify and research the film】
- Confirm the official title and year; watch for similarly titled films or multiple versions.
- Research director, cast, characters, setting, plot, and genre.
- You may reference Wikipedia, IMDb, Douban, TMDB and other public sources for the plot arc, but must rewrite — no verbatim copying.
- Never infer the plot from the title alone. If sources are insufficient, write a shorter synopsis rather than inventing details.

【Step 2: Determine the category】
Pick one of the 15 categories:
Drama / Action / Sci-Fi / Comedy / Romance / Mystery / Horror / Animation / Documentary / Erotica / Crime / Fantasy / Historical / Wuxia / Other
(Works clearly driven by eroticism prefer "Erotica"; if the crime/case element dominates, use "Crime"; if horror is the core identity, use "Horror"; animated features prefer "Animation".)

【Step 3: Ten-dimension weighted rating (10-point, 2 decimals)】
Writing 15% / Direction 14% / Acting 13% / Cinematography & Art 12% / Editing & Pacing 10% /
Music & Sound 9% / Themes & Ideas 8% / Originality 7% / Production Craft 6% / Franchise & Reputation 6%.
- For low-budget Category III / erotica / exploitation titles, compare horizontally with peers — typical range 5.8–6.8. "Sex and Zen" (6.7+) is the high anchor for erotica; "The Untold Story" (7.5+) for crime/exploitation.
- Erotic content itself neither adds nor subtracts points; only evaluate whether it serves the narrative.
- Avoid clustering above 8; be conservative for obscure titles.

【Step 4: Write the synopsis (100–180 words equivalent, plot-first)】
The synopsis must answer: Who is the protagonist? What is the starting situation? What event changes the status quo? What is the central conflict? How does the story develop?
Recommended structure: Character/Setting → Inciting Event → Central Conflict → Plot Development → Genre/Features.
- Plot information should be 60–80% of the synopsis; features/themes/atmosphere 20–40%.
- You may reveal the premise and major plot developments, but avoid directly revealing the final ending, killer identity, or final twist.
- Do not substitute vague phrases for actual plot: avoid "The film revolves around...", "The story follows...", "It explores...", "It depicts...", etc.
- Vary sentence openings across entries; do not start every one the same way.
- Describe erotic scenes using neutral, plot-oriented language; do not turn the synopsis into a list of sexual content.

【Step 5: Tags】
Themes / Region / Era / Series / Elements / Mood / Form / Highlights. Use ", " as separator, max 6 values per cell; leave blank if none.

【Excel columns】ID	Title	Year	Category	Rating	Synopsis	Themes	Region	Series

【Rating bands】9.20–10 Hall of Fame / 8.50–9.15 Masterpiece / 7.80–8.45 Excellent / 7.00–7.75 Good / 6.30–6.95 Passing / 5.50–6.25 Mediocre / 4.50–5.45 Below Average / 3.00–4.45 Poor / 0–2.95 Extremely Poor.

【Synopsis don'ts】No invented plot, no Wikipedia copy, no cast list only, no sales pitch ("must-see", "masterpiece"), no vague commentary in place of actual story, no gratuitously explicit detail.`
/** Pick the right prompt by current locale */
function getPromptText(): string {
  return getLocale() === 'en-US' ? PROMPT_TEXT_EN : PROMPT_TEXT_ZH
}

/** Build the full prompt — locale-aware（ReconcileDialog 复用，给新增视频生成片单提示词） */
export function buildFullPrompt(codes: string[]): string {
  const prompt = getPromptText()
  const codeList = codes.length > 0 ? codes.join('、') : '（无）'
  const header = getLocale() === 'en-US'
    ? `\n\nBelow is the movie list — process each one (${codes.length} total):\n`
    : `\n\n下面是影片清单，请逐一处理（共 ${codes.length} 个）：\n`
  return prompt + header + codeList
}

export default function OnboardSheetModal({
  open,
  library,
  onClose,
  onOpenExternal,
  onOpenSpec,
  onRevealSpec,
  onOpenLibrarySettings,
  onCopyText,
  onExportCodes
}: Props) {
  const [codes, setCodes] = useState<string[] | null>(null) // null=加载中, []=空, 有数组=已加载
  const [exporting, setExporting] = useState<'txt' | 'xlsx' | null>(null)
  const [savedAt, setSavedAt] = useState<string>('')
  const [exportError, setExportError] = useState<string>('')
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [locale, setLocale] = useState(getLocale())
  /** copied 状态：1600ms 自动清除 —— 原始 OnboardMdModal 的 copied 管理方式 */
  const [copied, setCopied] = useState<'prompt' | 'codes' | 'full' | null>(null)
  const copiedTimer = useRef<number | null>(null)
  const specPathRef = useRef<string>('')

  // ============ locale 变化订阅 ============
  useEffect(() => subscribeLocale(setLocale), [])

  // ============ copied 自动清除 ============
  const setCopiedBriefly = (which: 'prompt' | 'codes' | 'full') => {
    setCopied(which)
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1600)
  }
  useEffect(() => () => {
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
  }, [])

  // ============ 弹窗打开时自动加载影片清单 + 拉规范路径（Promise.all 和原始一致） ============
  useEffect(() => {
    if (!open || !library) {
      setCodes(null)
      setExporting(null)
      setSavedAt('')
      return
    }
    let cancelled = false
    setCodes(null)
    Promise.all([
      window.api.libraryGetCodes(library.id).catch(() => ({ count: 0, codes: [] })),
      window.api.specGet().catch(() => ({ path: '' }))
    ]).then(([codesRes, specRes]) => {
      if (cancelled) return
      setCodes(codesRes.codes || [])
      specPathRef.current = specRes.path || ''
    })
    return () => { cancelled = true }
  }, [open, library?.id])

  const hasCodes = (codes?.length ?? 0) > 0
  const fullPrompt = useMemo(() => buildFullPrompt(codes || []), [codes, locale])

  if (!open || !library) return null

  // ============ 统一 copy(text, which, revealPath) —— 原始 OnboardMdModal 的合并复制+reveal 函数 ============
  const copy = (text: string, which: 'prompt' | 'codes' | 'full') => {
    onCopyText(text)
    setCopiedBriefly(which)
  }

  // ============ handleExport(format) —— 导出 txt / xlsx ============
  const handleExport = async (fmt: 'txt' | 'xlsx') => {
    if (!library) return
    setExporting(fmt)
    setSavedAt('')
    setExportError('')
    try {
      const r = await onExportCodes(library.id, fmt)
      if (r.ok && r.path) {
        setSavedAt(r.path)
      } else if (r.error && r.error !== 'canceled') {
        setExportError('导出失败：' + r.error)
      }
    } catch (e) {
      setExportError('导出异常：' + String(e))
    } finally {
      setExporting(null)
    }
  }

  // ============ handleCopyFullPrompt() —— 兜底拿 specPath + 复制完整提示词 + reveal 规范位置 ============
  const handleCopyFullPrompt = async () => {
    copy(fullPrompt, 'full')
    // 延迟一下，让用户先看到 copied 反馈
    window.setTimeout(() => {
      onRevealSpec()
    }, 300)
  }

  const handleClose = () => onClose(dontShowAgain)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-hidden"
      onClick={(e) => { e.stopPropagation(); handleClose() }}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-ink-850 rounded-2xl ring-1 ring-brand/30 shadow-2xl shadow-black/60 animate-modal-panel flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* ============ 顶部标题栏 ============ */}
        <div className="px-6 pt-5 pb-3 border-b border-white/5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/15 ring-1 ring-brand/30 flex items-center justify-center shrink-0">
            <Icon name="sparkles" size={20} className="text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-semibold text-lg leading-tight">
              {t('onboard.title')}
            </h2>
            <p className="text-white/45 text-xs mt-1">
              {t('onboard.subtitle', { name: library.name })}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition shrink-0"
            aria-label="close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* ============ 描述段落 ============ */}
        <div className="px-6 pt-4 pb-1">
          <p className="text-white/65 text-[13px] leading-relaxed">
            {t('onboard.desc')}
          </p>
        </div>

        {/* ============ 正文（3 个 section 全展开，垂直排列） ============ */}
        <div className="px-6 py-3 overflow-y-auto thin-scroll flex-1 space-y-5">

          {/* ============ Section ① 加载影片清单（自动） ============ */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-md bg-brand/20 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
              <h3 className="text-white font-medium text-sm">{t('onboard.step1.title')}</h3>
            </div>
            <p className="text-white/50 text-[12px] leading-relaxed mb-3 ml-7">
              {t('onboard.step1.desc')}
            </p>

            {codes === null ? (
              <div className="ml-7 rounded-xl bg-ink-900/60 ring-1 ring-white/5 px-4 py-2.5 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-white/60 text-sm">{t('onboard.step1.scanning')}</span>
              </div>
            ) : hasCodes ? (
              <div className="ml-7 space-y-2">
                <div className="rounded-xl bg-ink-900/60 ring-1 ring-white/5 p-3">
                  <div className="text-emerald-300/90 text-xs font-medium mb-2">
                    ✓ {t('onboard.step1.loadedNCodes', { count: codes.length })}
                  </div>
                  <textarea
                    readOnly
                    value={codes.join('、')}
                    className="w-full h-24 text-[12px] text-white/75 leading-relaxed bg-transparent resize-none outline-none font-mono"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copy(codes.join('、'), 'codes')}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                      copied === 'codes'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                        : 'bg-brand/15 text-brand ring-1 ring-brand/30 hover:bg-brand/25'
                    }`}
                  >
                    <Icon name="copy" size={14} />
                    {copied === 'codes' ? t('app.copied') : t('onboard.step1.copyCodes')}
                  </button>
                  <button
                    onClick={() => handleExport('txt')}
                    disabled={!!exporting}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10 transition disabled:opacity-50"
                  >
                    <Icon name="download" size={14} />
                    {exporting === 'txt' ? t('onboard.step1.exporting') : t('onboard.step1.exportTxt')}
                  </button>
                  <button
                    onClick={() => handleExport('xlsx')}
                    disabled={!!exporting}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10 transition disabled:opacity-50"
                  >
                    <Icon name="download" size={14} />
                    {exporting === 'xlsx' ? t('onboard.step1.exporting') : t('onboard.step1.exportExcel')}
                  </button>
                </div>
                {savedAt && (
                  <p className="text-emerald-400/80 text-xs break-all">
                    {t('onboard.step1.savedAt', { path: savedAt })}
                  </p>
                )}
                {exportError && (
                  <p className="text-rose-400/90 text-xs break-all">{exportError}</p>
                )}
              </div>
            ) : (
              <div className="ml-7 rounded-xl bg-ink-900/60 ring-1 ring-white/5 px-4 py-2.5 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" />
                <span className="text-rose-300/90 text-sm">{t('onboard.step1.noCodes')}</span>
              </div>
            )}
          </section>

          {/* ============ Section ② 按规范生成片单 Excel ============ */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-md bg-brand/20 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
              <h3 className="text-white font-medium text-sm">{t('onboard.step2.title')}</h3>
            </div>
            <p className="text-white/50 text-[12px] leading-relaxed mb-3 ml-7">
              {t('onboard.step2.desc')}
            </p>

            <div className="ml-7 space-y-3">
              {/* 完整提示词卡片 */}
              <div className="rounded-xl bg-ink-900/60 ring-1 ring-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                  <span className="text-white/60 text-xs">{t('onboard.step2.fullPrompt')}</span>
                  <button
                    onClick={() => copy(fullPrompt, 'prompt')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition ${
                      copied === 'prompt'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                        : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon name="copy" size={12} />
                    {copied === 'prompt' ? t('app.copied') : t('onboard.step2.copyPrompt')}
                  </button>
                </div>
                <pre className="px-3 py-3 text-[12px] text-white/75 leading-relaxed whitespace-pre-wrap font-mono max-h-64 overflow-y-auto thin-scroll">
                  {fullPrompt}
                </pre>
              </div>

              {/* 规范操作：拆成两个按钮 */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onOpenSpec}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10 transition"
                >
                  <Icon name="wand" size={14} />
                  {t('onboard.step2.viewSpec')}
                </button>
                <button
                  onClick={onRevealSpec}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10 transition"
                >
                  <Icon name="folder" size={14} />
                  {t('onboard.step2.revealSpec')}
                </button>
              </div>
            </div>
          </section>

          {/* ============ Section ③ 推荐 AI ============ */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-md bg-brand/20 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
              <h3 className="text-white font-medium text-sm">{t('onboard.step3.title')}</h3>
            </div>
            <p className="text-white/50 text-[12px] leading-relaxed mb-3 ml-7">
              {t('onboard.step3.desc')}
            </p>

            <div className="ml-7 rounded-xl bg-gradient-to-br from-brand/10 to-white/5 ring-1 ring-brand/20 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center shrink-0">
                <Icon name="sparkles" size={18} className="text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">Grok</p>
                <p className="text-white/50 text-xs truncate">{GROK_URL}</p>
              </div>
              <button
                onClick={() => onOpenExternal(GROK_URL)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-brand text-ink-900 font-medium hover:bg-brand/90 transition shrink-0"
              >
                <Icon name="external" size={14} />
                {t('onboard.step3.openGrok')}
              </button>
            </div>
          </section>

        </div>

        {/* ============ 底部操作栏：始终显示 3 按钮 + 复选框 ============ */}
        <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-white/60 hover:text-white/80 cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 accent-brand"
            />
            {t('onboard.dontShowAgain')}
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition"
            >
              {t('onboard.later')}
            </button>
            <button
              onClick={handleCopyFullPrompt}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ring-1 ${
                copied === 'full'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
                  : 'bg-white/5 text-white/85 ring-white/15 hover:bg-white/10'
              }`}
            >
              {copied === 'full' ? t('app.copied') : t('onboard.copyFullAndReveal')}
            </button>
            <button
              onClick={onOpenLibrarySettings}
              className="px-4 py-1.5 rounded-lg text-sm bg-brand text-ink-900 font-medium hover:bg-brand/90 transition"
            >
              {t('onboard.goSettings')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
