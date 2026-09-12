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
        本软件（"影海"）是一款<strong className="text-white">仅供个人使用的本地视频文件管理工具</strong>，其核心功能为：
        扫描本地文件夹、读取视频元数据、生成本地海报墙、管理本地视频库。
        本软件<strong className="text-amber-300">不提供、不存储、不传播任何片源内容</strong>，亦不连接任何涉嫌传播违法内容的资源服务器，
        不提供下载、上传、分享、传播涉嫌违法内容的功能。本软件对用户本地已存在的视频文件不进行任何形式的主动获取或传播。
      </Section>

      <Section title={t('notice.section2')}>
        用户应严格遵守《中华人民共和国刑法》《中华人民共和国治安管理处罚法》《中华人民共和国网络安全法》
        《中华人民共和国未成年人保护法》《中华人民共和国民法典》等法律法规，不得利用本软件从事：
        <ul className="list-disc list-inside space-y-1 mt-2 text-white/70 pl-2">
          <li>制作、复制、出版、贩卖、传播任何涉嫌淫秽、暴力、血腥、恐怖或其他违反国家规定的内容；</li>
          <li>实施任何侵犯他人合法权益（包括但不限于著作权、肖像权、名誉权、隐私权）的行为；</li>
          <li>从事任何违反国家法律、行政法规及国家政策的活动。</li>
        </ul>
      </Section>

      <Section title={t('notice.section3')} highlight>
        <p>
          <strong className="text-amber-300">《中华人民共和国刑法》第三百六十三条【制作、复制、出版、贩卖、传播淫秽物品牟利罪】</strong>：
          以牟利为目的，制作、复制、出版、贩卖、传播淫秽物品的，处三年以下有期徒刑、拘役或者管制，并处罚金；
          情节严重的，处三年以上十年以下有期徒刑，并处罚金；情节特别严重的，处十年以上有期徒刑或者无期徒刑，并处罚金或者没收财产。
        </p>
        <p>
          <strong className="text-amber-300">《中华人民共和国刑法》第三百六十四条【传播淫秽物品罪】</strong>：
          传播淫秽的书刊、影片、音像、图片或者其他淫秽物品，情节严重的，处二年以下有期徒刑、拘役或者管制；
          向不满十八周岁的未成年人传播淫秽物品的，从重处罚。
        </p>
        <p>
          <strong className="text-amber-300">《中华人民共和国治安管理处罚法》第六十八条</strong>：
          制作、运输、复制、出售、出租、传播淫秽物品的，处十日以上十五日以下拘留，可以并处五千元以下罚款；
          情节较轻的，处五日以下拘留或者五百元以下罚款。
        </p>
        <p>
          <strong className="text-amber-300">《中华人民共和国网络安全法》第十二条</strong>：
          任何个人和组织使用网络应当遵守宪法法律，遵守公共秩序，尊重社会公德，
          不得利用网络从事危害国家安全、荣誉和利益，传播淫秽色情、赌博、暴力、凶杀、恐怖、煽动分裂、破坏民族团结等违法活动及信息。
        </p>
        <p>
          <strong className="text-amber-300">《中华人民共和国未成年人保护法》第五十一条</strong>：
          禁止制作、复制、出版、传播含有淫秽、暴力、凶杀、恐怖、极端等内容的图书、报刊、电影、广播电视节目、音像制品、网络音视频等。
        </p>
        <p>
          <strong className="text-amber-300">《中华人民共和国民法典》第一千零一十九条</strong>：
          任何组织或者个人未经肖像权人同意，不得以丑化、污损，或者利用信息技术手段伪造等方式侵害他人的肖像权。
          未经肖像权人同意，肖像作品权利人不得以发表、复制、发行、出租、展览等方式使用或者公开肖像权人的肖像。
        </p>
      </Section>

      <Section title={t('notice.section4')}>
        严禁向未满十八（18）周岁的未成年人传播、展示或提供任何涉嫌淫秽、色情、暴力、恐怖或其他不适宜未成年人的内容。
        依据上述法律法规及《未成年人保护法》相关规定，向未成年人传播相关内容的，将依法从重处罚。
      </Section>

      <Section title={t('notice.section5')}>
        本软件开发者仅提供本地文件管理与检索工具，<strong className="text-white">不参与、不认可、不承担</strong>
        用户使用本软件所从事的任何违法活动所产生的法律责任。本软件开发者保留依法向有关主管部门报告、协助调查的权利。
        所有法律责任由使用本软件从事违法活动的当事人自行承担。
      </Section>

      <Section title={t('notice.section6')}>
        继续使用本软件即视为您已阅读、理解并同意本须知全部内容，并承诺依法、合规地使用本软件。
        <br />
        <span className="text-white/50 text-[12px]">
          本软件仅用于合法合规的本地文件管理。请自觉遵守国家法律法规，文明使用软件工具。
        </span>
      </Section>
    </>
  )
}

function EnContent() {
  return (
    <>
      <Section title={t('notice.section1')}>
        This software ("YingXia") is a <strong className="text-white">local video file management tool for personal use only</strong>.
        Its core features are scanning local folders, reading video metadata, generating a local poster wall, and managing your local video library.
        This software <strong className="text-amber-300">does not provide, store, or distribute any media content</strong>,
        nor does it connect to any server that distributes illegal content. It does not offer functions for downloading, uploading, sharing, or distributing illegal content.
        The software will not actively acquire or transmit any video files that already exist on your local machine.
      </Section>

      <Section title={t('notice.section2')}>
        You agree to use this software in compliance with all applicable local laws and regulations. You must not use this software to:
        <ul className="list-disc list-inside space-y-1 mt-2 text-white/70 pl-2">
          <li>Create, copy, publish, sell, or distribute any obscene, violent, gory, terrorist, or otherwise illegal content;</li>
          <li>Infringe upon the lawful rights of others, including but not limited to copyright, portrait rights, reputation rights, and privacy rights;</li>
          <li>Engage in any activity that violates applicable laws, administrative regulations, or public policies.</li>
        </ul>
      </Section>

      <Section title={t('notice.section3')} highlight>
        <p>
          This software is intended solely for managing video files that you already lawfully possess on your local device.
          It does not facilitate the acquisition of new content, nor does it enable distribution to third parties.
        </p>
        <p>
          Depending on your jurisdiction, sharing or distributing adult content may be subject to legal restrictions.
          You are solely responsible for ensuring that your use of this software complies with the laws of your country or region.
        </p>
      </Section>

      <Section title={t('notice.section4')}>
        It is strictly prohibited to transmit, display, or provide any obscene, pornographic, violent, terrorist, or otherwise inappropriate content to minors under the age of 18.
        Users who distribute such content to minors may face severe legal penalties under applicable laws.
      </Section>

      <Section title={t('notice.section5')}>
        The developer of this software provides only a local file management and indexing tool and
        <strong className="text-white"> does not participate in, endorse, or assume liability</strong> for any illegal activities conducted by users.
        All legal liability arising from misuse of this software rests solely with the individual user.
      </Section>

      <Section title={t('notice.section6')}>
        By continuing to use this software, you acknowledge that you have read, understood, and agreed to all the terms above,
        and you commit to using this software in a lawful and compliant manner.
        <br />
        <span className="text-white/50 text-[12px]">
          This software is intended solely for lawful local file management. Please use software tools responsibly and in compliance with applicable laws.
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
