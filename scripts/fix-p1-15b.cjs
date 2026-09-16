const fs = require('fs')

const zhKeys = `  // ===== 播放列表操作栏 / 工具栏 / 卡片 =====
  'playlist.selectToAdd': '选择要添加到「{name}」的影片',
  'playlist.selectedCount': '已选 {n} 部',
  'playlist.selectAll': '全选',
  'playlist.deselectAll': '取消全选',
  'playlist.invert': '反选',
  'playlist.cancel': '取消',
  'playlist.addSelected': '添加选中 ({n})',
  'playlist.selectToRemove': '选择要从「{name}」移除的影片',
  'playlist.removeSelected': '移除选中 ({n})',
  'playlist.videos': '部影片',
  'playlist.removeVideos': '删除影片',
  'playlist.addVideos': '添加影片',
  'playlist.playAll': '播放全部',
  'playlist.delete': '删除列表',
  'toolbar.duplicates': '重复检测',
  'toolbar.duplicatesTitle': '查找内容相同的重复视频，释放磁盘空间',
  'entry.addedToPlaylist': '已添加',
`

const enKeys = `  // ===== Playlist toolbar / toolbar / card =====
  'playlist.selectToAdd': 'Select videos to add to "{name}"',
  'playlist.selectedCount': '{n} selected',
  'playlist.selectAll': 'Select all',
  'playlist.deselectAll': 'Deselect all',
  'playlist.invert': 'Invert',
  'playlist.cancel': 'Cancel',
  'playlist.addSelected': 'Add selected ({n})',
  'playlist.selectToRemove': 'Select videos to remove from "{name}"',
  'playlist.removeSelected': 'Remove selected ({n})',
  'playlist.videos': 'videos',
  'playlist.removeVideos': 'Remove videos',
  'playlist.addVideos': 'Add videos',
  'playlist.playAll': 'Play all',
  'playlist.delete': 'Delete playlist',
  'toolbar.duplicates': 'Duplicates',
  'toolbar.duplicatesTitle': 'Find duplicate videos by content hash to free disk space',
  'entry.addedToPlaylist': 'Added',
`

function appendKeys(file, keysBlock) {
  let s = fs.readFileSync(file, 'utf8')
  const crlf = s.includes('\r\n')
  s = s.replace(/\r\n/g, '\n')
  const firstKey = keysBlock.trim().split('\n')[0].trim().slice(0, 30)
  if (!s.includes(firstKey)) {
    const m = /\n\} as const\n?$/.exec(s)
    if (m) {
      s = s.slice(0, m.index + 1) + keysBlock + s.slice(m.index + 1)
      console.log('appended', file.split('/').pop())
    } else console.log('WARN no anchor', file)
  } else console.log('SKIP already present', file.split('/').pop())
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s)
}

appendKeys('E:/Movie Vault/src/shared/i18n/locales/zh-CN.ts', zhKeys)
appendKeys('E:/Movie Vault/src/shared/i18n/locales/en-US.ts', enKeys)
