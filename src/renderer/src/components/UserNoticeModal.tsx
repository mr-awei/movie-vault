import { useState } from 'react'
import { t, getLocale } from '../../../shared/i18n'
import Icon from './Icon'

interface Props {
  open: boolean
  /** 勾选"下次不再显示" + 点击"我已阅读并继续" 后的回调：persisted 传 true（持久化到 settings） */
  onClose: (persisted: boolean) => void
}

/**
 * 用户须知弹窗 —— 首次启动强制弹出，**必须**阅读后才可继续使用。
 * 设计要点：
 * - 不可 ESC 关闭、不可背景点击关闭（合规要求：让用户真正阅读）
 * - 复选框"我已阅读并同意，下次启动不再显示"——勾选后 settings.noticeDismissed=true 永久不再弹
 * - 未勾选关闭 → 视为"还未确认"，下次启动再次弹出
 * - 中文用户展示中国法律法规节选；英文用户展示通用免责声明，不含具体国家法律条文。
 */
export default function UserNoticeModal({ open, onClose }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const isZh = getLocale() === 'zh-CN'
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-hidden"
      // 注意：背景点击 / ESC 都不关闭（合规要求用户主动确认）
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-ink-850 rounded-2xl ring-1 ring-amber-500/30 shadow-2xl shadow-black/60 animate-modal-panel flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-notice-title"
      >
        {/* 顶部标题栏 */}
        <div className="px-6 pt-5 pb-3 border-b border-white/5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center shrink-0">
            <Icon name="alert" size={20} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 id="user-notice-title" className="text-white font-semibold text-lg leading-tight">
              {t('notice.title')}
            </h2>
            <p className="text-white/45 text-xs mt-1">
              {t('notice.intro')}
            </p>
          </div>
        </div>

        {/* 正文（可滚动） */}
        <div className="px-6 py-4 overflow-y-auto thin-scroll flex-1 text-white/80 text-[13px] leading-relaxed space-y-4 select-text">
          {isZh ? <ZhContent /> : <EnContent />}
        </div>

        {/* 底部：复选框 + 主按钮 */}
        <div className="px-6 py-4 border-t border-white/5 flex flex-col sm:flex-row sm:items-center gap-3 bg-ink-900/40">
          <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-ink-700 text-brand focus:ring-2 focus:ring-brand/40 shrink-0 cursor-pointer"
            />
            <span className="text-white/80 text-[13px] leading-snug">
              {t('notice.agreeAndDismiss')}
            </span>
          </label>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onClose(dontShowAgain)}
            className="h-10 px-6 rounded-xl bg-brand hover:brightness-110 text-white text-sm font-semibold shadow-lg shadow-brand/30 transition-all"
          >
            {t('notice.readAndContinue')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ZhContent() {
  return (
    <>
      <Section title={t('notice.section1')}>
        本软件「影海 / Movie Vault」是一款<strong className="text-white">本地视频文件整理与管理工具</strong>。
        它会扫描您指定的本地文件夹，识别影片并匹配公开影视资料库的元数据（标题、年份、简介、演职员、评分、分类等），
        生成可视化的海报墙与统计看板。本软件<strong className="text-amber-300">不提供、不存储、不分发任何视频文件或片源</strong>；
        所有影视文件均来自您本机已有的文件，软件仅做本地读取与展示。
      </Section>

      <Section title={t('notice.section2')}>
        为补充影片信息，本软件会在您授权后联网查询<strong className="text-white">公开的影视数据库</strong>
        （如 TMDB、OMDb、OpenLibrary、JustWatch 等第三方服务）。这些服务由各自运营方提供，其内容与可用性不在本软件控制范围内。
        联网前请确认您所在地区可合法访问相关服务，并遵守其服务条款与隐私政策。
        本软件<strong className="text-amber-300">不会上传您的本地文件</strong>，仅发送影片名称等检索关键词。
      </Section>

      <Section title={t('notice.section3')} highlight>
        您应对加入媒体库的文件承担全部责任，确保您对该文件享有合法的持有、观看与管理权利。
        请勿将本软件用于任何<strong className="text-white">侵犯他人著作权、肖像权、隐私权等合法权益</strong>，
        或违反法律法规的活动。请尊重影视作品的版权，仅在法律允许的范围内使用本软件。
      </Section>

      <Section title={t('notice.section4')}>
        本软件按"现状"提供，开发者<strong className="text-white">不参与、不认可、不承担</strong>
        用户使用本软件所产生的任何法律风险与责任。因使用本软件产生的任何纠纷或损失，由使用者自行承担。
        开发者保留依法向有关主管部门报告、协助调查的权利。
      </Section>

      <Section title={t('notice.section5')}>
        继续使用本软件即视为您已阅读、理解并同意本须知全部内容。
        <br />
        <span className="text-white/50 text-[12px]">
          本软件仅供个人合法合规地整理与管理本地视频文件之用。请自觉遵守国家法律法规，文明使用软件工具。
        </span>
      </Section>
    </>
  )
}

function EnContent() {
  return (
    <>
      <Section title={t('notice.section1')}>
        This app ("Movie Vault") is a <strong className="text-white">local video file organizer and manager</strong>.
        It scans your chosen local folders, identifies movies, and matches metadata from public film databases
        (title, year, synopsis, cast, ratings, genres, etc.), building a visual poster wall and statistics dashboard.
        This software <strong className="text-amber-300">does not provide, host, or distribute any video files</strong>;
        all media comes from files already on your device—the app only reads and displays them locally.
      </Section>

      <Section title={t('notice.section2')}>
        To enrich movie information, the app may query <strong className="text-white">public film databases</strong>
        online with your permission (such as TMDB, OMDb, OpenLibrary, JustWatch, and other third-party services).
        These services are operated by their respective providers; their content and availability are outside our control.
        Before querying, please ensure lawful access in your region and comply with each service's terms and privacy policy.
        The app <strong className="text-amber-300">never uploads your local files</strong>—only search keywords such as movie titles are sent.
      </Section>

      <Section title={t('notice.section3')} highlight>
        You are solely responsible for any files you add to your library and must ensure you have the legal right
        to hold, view, and manage them. Do not use this app to <strong className="text-white">infringe upon others' copyright,
        portrait, privacy, or other lawful rights</strong>, or to violate any laws or regulations.
        Please respect film copyrights and use the app only within the bounds of the law.
      </Section>

      <Section title={t('notice.section4')}>
        This software is provided "as is". The developer <strong className="text-white">does not participate in, endorse, or assume</strong>
        any legal risk or liability arising from your use of it. Any dispute or loss resulting from use is borne solely by the user.
        The developer reserves the right to cooperate with authorities as required by law.
      </Section>

      <Section title={t('notice.section5')}>
        By continuing to use this software, you acknowledge that you have read, understood, and agreed to all the terms above.
        <br />
        <span className="text-white/50 text-[12px]">
          This app is intended solely for personal, lawful organization and management of your local video files.
          Please use software tools responsibly and in compliance with applicable laws.
        </span>
      </Section>
    </>
  )
}

function Section({
  title,
  children,
  highlight = false
}: {
  title: string
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <section
      className={`rounded-xl p-3.5 ${
        highlight
          ? 'bg-amber-500/10 ring-1 ring-amber-500/25'
          : 'bg-white/5'
      }`}
    >
      <h3 className="text-white font-medium text-sm mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}
