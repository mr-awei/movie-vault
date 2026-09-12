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
  /** 导出番号清单 */
  onExportCodes: (libraryId: string, format: 'txt' | 'xlsx') => Promise<{ ok: boolean; path?: string; error?: string }>
}

const GROK_URL = 'https://grok.com'

/** 中文提示词 */
const PROMPT_TEXT_ZH = `请根据我提供的番号，按照以下要求生成影海片单 Excel 内容：

1. 先查询该番号的准确信息（片商、剧情、时长、类型等）。
2. 先确定「分类」（从下方分类体系选一个主分类）。
3. 用中文撰写详细简介，风格参考下方「简介模版」。
4. 简介要包含：核心设定、关键过程、高潮/特色内容，语言流畅有画面感。
5. 简介结束后，参考下方「完整分类标签系统」进行打标签，按 9 个标签类别分栏填写（主题 / 角色 / 服装 / 体型 / 行为 / 玩法 / 场景 / 剧情 / 其他），每栏内多标签用顿号分隔。
6. 最后给出推荐评分（满分10分，保留两位小数），并简要说明评分依据。
7. 如果我一次提供多个番号，请逐一处理，保持格式统一。

【Excel 表头】编号\t品番\t分类\t推荐评分\t简介\t主题\t角色\t服装\t体型\t行为\t玩法\t场景\t剧情\t其他

【分类体系】从下方选一个最匹配的主分类填入「分类」列：
- 剧情 / 单体 / 恋爱 / 美少女 / 制服 / 角色扮演 / 校园 / 职场 / 家庭 / 特殊 / 其他

【评分标准】10 分制：
- 9.5-10.0 殿堂级必看，综合体验极佳
- 9.0-9.5 强烈推荐，各方面表现优秀
- 8.0-9.0 推荐观看，有明显亮点
- 7.0-8.0 中规中矩，可看
- 6.0-7.0 及格以上，有不足但不影响观看
- 5.0-6.0 勉强可看，亮点稀少
- 5.0 以下 可跳过 / 避雷

【简介模版参考】请保持 80-150 字，突出核心设定、关键看点、类型标签。避免剧透关键转折。`

/** English prompt */
const PROMPT_TEXT_EN = `Generate a YingXia sheet Excel for the given codes. Follow these rules:

1. Look up accurate metadata for each code (studio, plot, duration, genre, etc.).
2. Pick one main category from the category system below and write it to the "Category" column.
3. Write the synopsis in English, using the template style below.
4. Synopsis should cover: core premise, key moments, highlights. Keep it vivid and engaging.
5. After the synopsis, assign tags into each of the 9 tag-category columns (Theme / Role / Costume / BodyType / Behavior / Play / Scene / Plot / Other). Separate multiple tags inside one cell with commas.
6. End with a recommended rating (10-point scale, 2 decimals) and a brief rationale.
7. Process each code separately if multiple codes are provided. Keep format consistent across all rows.

【Excel columns】ID\tCode\tCategory\tRating\tSynopsis\tTheme\tRole\tCostume\tBodyType\tBehavior\tPlay\tScene\tPlot\tOther

【Category system】Pick the single best-fit category:
- Story / Solo / Romance / BeautifulGirl / Uniform / Cosplay / School / Workplace / Family / Special / Other

【Rating scale】10 points:
- 9.5-10.0 Masterpiece, essential viewing
- 9.0-9.5 Strongly recommended, excellent overall
- 8.0-9.0 Recommended, notable highlights
- 7.0-8.0 Decent, watchable
- 6.0-7.0 Above average, some flaws
- 5.0-6.0 Barely watchable, few highlights
- Below 5.0 Skip / caution

【Synopsis template hint】Keep 80-150 words. Highlight core premise, key selling points, and genre tags. Avoid spoiling major twists.`

/** Pick the right prompt by current locale */
function getPromptText(): string {
  return getLocale() === 'en-US' ? PROMPT_TEXT_EN : PROMPT_TEXT_ZH
}

/** Build the full prompt — locale-aware */
function buildFullPrompt(codes: string[]): string {
  const prompt = getPromptText()
  const codeList = codes.length > 0 ? codes.join('、') : '（无）'
  const header = getLocale() === 'en-US'
    ? `\n\nBelow is the code list — process each one (${codes.length} total):\n`
    : `\n\n下面是番号列表，请逐一处理（共 ${codes.length} 个）：\n`
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

  // ============ 弹窗打开时自动加载番号 + 拉规范路径（Promise.all 和原始一致） ============
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
    try {
      const r = await onExportCodes(library.id, fmt)
      if (r.ok && r.path) setSavedAt(r.path)
    } catch {
      /* ignore — handler 已返回 ok:false */
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

          {/* ============ Section ① 加载番号（自动） ============ */}
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
                    onClick={() => copy(codes!.join('、'), 'codes')}
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
                  <p className="text-white/40 text-xs break-all">
                    {t('onboard.step1.savedAt', { path: savedAt })}
                  </p>
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
