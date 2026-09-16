import { useState } from 'react'
import Icon from './Icon'
import { t } from '../../../shared/i18n'

interface Props {
  search: string
  onSearch: (v: string) => void
  onHome: () => void
  onAddLibrary: () => void
  privacy: boolean
  onTogglePrivacy: () => void
  /** 当前库名（搜索框占位提示用） */
  libraryName?: string
  /** 重新扫描当前影视库（文件对账） */
  onScan: () => void
  onShowDuplicates?: () => void
  /** 批量补齐当前库 数据源 信息；force=true 时忽略缓存逐部重抓 */
  onBatchFetch: (force: boolean) => void
  /** v2.3.7 批量补时长：对当前库所有缺时长的视频 ffprobe 读取时长写 techInfo */
  onBatchProbe: () => void
}

export default function Toolbar(props: Props) {
  const {
    search, onSearch, onHome, onAddLibrary, privacy, onTogglePrivacy,
    libraryName, onScan, onBatchFetch, onBatchProbe, onShowDuplicates
  } = props
  const [batchMenuOpen, setBatchMenuOpen] = useState(false)

  return (
    <header className="drag-region relative z-50 flex items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-ink-850/90 backdrop-blur-sm shrink-0" style={{ contain: 'layout' }}>
      {/* Logo → 首页 */}
      <button
        className="no-drag flex items-center gap-2 mr-1 select-none group"
        onClick={onHome}
        title={t('toolbar.backHome')}
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-[#ff9db6] flex items-center justify-center shadow-glow-sm group-hover:brightness-110 transition">
          <Icon name="film" size={15} className="text-white" />
        </div>
        <span className="text-white font-bold text-[15px] tracking-wide">{t('app.name')}</span>
      </button>

      {/* 全局搜索 */}
      <div className="no-drag relative">
        <Icon
          name="search"
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
        />
        <input
          className="bg-ink-700 text-white text-sm rounded-lg pl-8 pr-16 py-1.5 w-64 outline-none ring-1 ring-transparent transition-all focus:ring-brand/60 focus:bg-ink-600 placeholder:text-white/30"
          placeholder={libraryName ? t('toolbar.searchPlaceholderInLibrary', { libraryName }) : t('toolbar.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {search ? (
          <button
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/80"
            onClick={() => onSearch('')}
            title={t('toolbar.clearSearch')}
          >
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* 右侧操作：扫描 / 补齐为高频操作，常驻顶部；侧栏切换 / 命令面板已合并到左侧导航侧栏 */}
      <div className="no-drag flex items-center gap-1.5">
        <button
          className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium bg-ink-700 hover:bg-ink-600 text-white/85 transition-colors"
          onClick={onScan}
          title={t('toolbar.scanLibraryTitle')}
        >
          <Icon name="refresh" size={13} />
          {t('toolbar.scanLibrary')}
        </button>
        {onShowDuplicates ? (
          <button
            className="h-9 px-3.5 rounded-xl flex items-center gap-2 text-sm font-medium bg-ink-700 hover:bg-ink-600 text-white/80 transition-colors"
            onClick={onShowDuplicates}
            title={t('toolbar.duplicatesTitle')}
          >
            <Icon name="copy" size={15} />
            {t('toolbar.duplicates')}
          </button>
        ) : null}

        <div className="relative">
          <button
            className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium bg-ink-700 hover:bg-ink-600 text-white/85 transition-colors"
            onClick={() => setBatchMenuOpen((o) => !o)}
            title={t('toolbar.fetchInfoTitle')}
          >
            <Icon name="wand" size={13} />
            {t('toolbar.fetchInfo')}
            <Icon name="chevronDown" size={11} className="opacity-60" />
          </button>
          {batchMenuOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBatchMenuOpen(false)} />
              <div className="absolute right-0 mt-1.5 z-50 w-56 rounded-xl border border-white/10 bg-ink-800 shadow-xl shadow-black/40 py-1.5 text-sm">
                <button
                  className="w-full text-left px-3 py-2 hover:bg-ink-700 text-white/90 flex items-start gap-2"
                  onClick={() => { setBatchMenuOpen(false); onBatchFetch(false) }}
                >
                  <Icon name="wand" size={14} className="text-brand mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">{t('toolbar.fetchMissingInfo')}</div>
                    <div className="text-[11px] text-white/45 leading-tight">{t('toolbar.fetchMissingInfoHint')}</div>
                  </div>
                </button>
                <button
                  className="w-full text-left px-3 py-2 hover:bg-ink-700 text-white/90 flex items-start gap-2"
                  onClick={() => { setBatchMenuOpen(false); onBatchFetch(true) }}
                >
                  <Icon name="refresh" size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">{t('toolbar.fetchAllForce')}</div>
                    <div className="text-[11px] text-white/45 leading-tight">{t('toolbar.fetchAllForceHint')}</div>
                  </div>
                </button>
                <button
                  className="w-full text-left px-3 py-2 hover:bg-ink-700 text-white/90 flex items-start gap-2 border-t border-white/5"
                  onClick={() => { setBatchMenuOpen(false); onBatchProbe() }}
                >
                  <Icon name="clock" size={14} className="text-sky-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">{t('toolbar.fetchDuration')}</div>
                    <div className="text-[11px] text-white/45 leading-tight">{t('toolbar.fetchDurationHint')}</div>
                  </div>
                </button>
              </div>
            </>
          ) : null}
        </div>

        <button
          className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${
            privacy
              ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
              : 'bg-ink-700 hover:bg-ink-600 text-white/80'
          }`}
          onClick={onTogglePrivacy}
          title={privacy ? t('toolbar.hideHint') : t('toolbar.hideTitle')}
        >
          <Icon name={privacy ? 'eyeOff' : 'eye'} size={13} />
          {privacy ? t('toolbar.hidden') : t('toolbar.hide')}
        </button>

        <button
          className="h-8 px-3 rounded-lg flex items-center gap-1.5 bg-brand hover:brightness-110 text-white text-xs font-medium transition-all shadow-sm shadow-brand/30"
          onClick={onAddLibrary}
        >
          <Icon name="plus" size={13} />
          {t('toolbar.addLibrary')}
        </button>
      </div>
    </header>
  )
}
