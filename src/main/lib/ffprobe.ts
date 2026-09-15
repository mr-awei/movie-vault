import { execFile } from 'node:child_process'
import type { Settings, TechInfo } from '../../shared/types'
import { resolveFfprobeExe } from './ffmpegEnv'

/**
 * 用 ffprobe 读取本地视频技术参数（分辨率/编码/码率/帧率/时长/色彩/HDR/多音轨/字幕轨）。
 * 失败（文件缺失/损坏/ffprobe 不可用）一律返回 null，由调用方降级跳过。
 */
export async function probeVideo(videoPath: string, settings: Settings): Promise<TechInfo | null> {
  try {
    const ffprobe = (await resolveFfprobeExe(settings)) || 'ffprobe'
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        ffprobe,
        ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath],
        { maxBuffer: 16 * 1024 * 1024, timeout: 30000 },
        (err, out) => (err ? reject(err) : resolve(out))
      )
    })
    const data = JSON.parse(stdout) as {
      streams?: Array<Record<string, any>>
      format?: Record<string, any>
    }
    const streams = data.streams ?? []
    const videoStream = streams.find((s) => s.codec_type === 'video')
    const audioStreams = streams.filter((s) => s.codec_type === 'audio')
    const subtitleStreams = streams.filter((s) => s.codec_type === 'subtitle')
    const fmt = data.format ?? {}
    const info: TechInfo = {}

    // 视频流基础信息
    if (videoStream?.width) info.width = Number(videoStream.width)
    if (videoStream?.height) info.height = Number(videoStream.height)
    if (videoStream?.codec_name) info.videoCodec = String(videoStream.codec_name)
    if (videoStream?.profile) info.videoProfile = String(videoStream.profile)
    if (videoStream?.level) info.videoLevel = String(videoStream.level)
    if (videoStream?.avg_frame_rate) {
      const [n, d] = String(videoStream.avg_frame_rate).split('/').map(Number)
      if (n && d) info.fps = Math.round((n / d) * 100) / 100
    }

    // 色彩空间 / HDR 检测
    if (videoStream?.color_space) info.colorSpace = String(videoStream.color_space)
    if (videoStream?.color_transfer) info.colorTransfer = String(videoStream.color_transfer)
    if (videoStream?.color_primaries) info.colorPrimaries = String(videoStream.color_primaries)
    // HDR 格式判定
    if (videoStream?.color_transfer === 'smpte2084') {
      info.hdrFormat = 'HDR10'
    } else if (videoStream?.color_transfer === 'arib-std-b67') {
      info.hdrFormat = 'HLG'
    } else if (videoStream?.codec_tag_string === 'dvh1' || videoStream?.codec_tag_string === 'dvhe') {
      info.hdrFormat = 'Dolby Vision'
    } else {
      info.hdrFormat = 'SDR'
    }

    // 音频流（取第一个作为主音频信息）
    const firstAudio = audioStreams[0]
    if (firstAudio?.codec_name) info.audioCodec = String(firstAudio.codec_name)
    if (firstAudio?.channels) info.audioChannels = Number(firstAudio.channels)
    if (firstAudio?.sample_rate) info.audioSampleRate = Number(firstAudio.sample_rate)
    if (firstAudio?.bit_rate) info.audioBitrate = Math.round(Number(firstAudio.bit_rate) / 1000)

    // 多音轨列表
    if (audioStreams.length > 0) {
      info.audioTracks = audioStreams.map((s, i) => ({
        index: i,
        codec: s.codec_name ? String(s.codec_name) : undefined,
        channels: s.channels ? Number(s.channels) : undefined,
        language: s.tags?.language ? String(s.tags.language) : undefined,
        sampleRate: s.sample_rate ? Number(s.sample_rate) : undefined
      }))
    }

    // 字幕轨道列表
    if (subtitleStreams.length > 0) {
      info.subtitleTracks = subtitleStreams.map((s, i) => ({
        index: i,
        codec: s.codec_name ? String(s.codec_name) : undefined,
        language: s.tags?.language ? String(s.tags.language) : undefined
      }))
    }

    // 容器格式
    if (fmt.format_name) info.container = String(fmt.format_name).split(',')[0]

    // 码率（优先视频流码率，回退整体码率）
    const br = videoStream?.bit_rate ?? fmt.bit_rate
    if (br) info.bitrateKbps = Math.round(Number(br) / 1000)
    if (fmt.duration) info.durationSec = Math.round(Number(fmt.duration))

    return Object.keys(info).length > 0 ? info : null
  } catch {
    return null
  }
}

/**
 * 用 ffprobe 读取图片分辨率。
 * 用于「真实封面替换前验证」：数据源/数据源 下载的封面可能是损坏/截断/空内容的坏图
 * （文件存在但 ffprobe 读不出尺寸），必须验证通过才允许替换现有封面。
 * 失败（缺失/损坏/ffprobe 不可用）一律返回 null。
 */
export async function probeImage(
  imagePath: string,
  settings: Settings
): Promise<{ width: number; height: number } | null> {
  try {
    const ffprobe = (await resolveFfprobeExe(settings)) || 'ffprobe'
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        ffprobe,
        ['-v', 'quiet', '-print_format', 'json', '-show_streams', imagePath],
        { maxBuffer: 8 * 1024 * 1024, timeout: 10000 },
        (err, out) => (err ? reject(err) : resolve(out))
      )
    })
    const data = JSON.parse(stdout) as { streams?: Array<Record<string, any>> }
    const vs = (data.streams ?? []).find((s) => s.codec_type === 'video')
    if (vs?.width && vs?.height) {
      return { width: Number(vs.width), height: Number(vs.height) }
    }
    return null
  } catch {
    return null
  }
}
