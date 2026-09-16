const fs = require('fs')

function patchFile(p, replaces) {
  let s = fs.readFileSync(p, 'utf8')
  const crlf = s.includes('\r\n')
  s = s.replace(/\r\n/g, '\n')
  let n = 0
  for (const [old, neu] of replaces) {
    if (s.includes(old)) { s = s.replace(old, neu); n++ }
    else console.log('WARN not found in ' + p.split('/').pop() + ': ' + old.slice(0, 50))
  }
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s)
  console.log(p.split('/').pop() + ': ' + n + ' replaced')
}

// ---- PlaylistToolbar ----
patchFile('E:/Movie Vault/src/renderer/src/components/PlaylistToolbar.tsx', [
  ["import Icon from './Icon'", "import Icon from './Icon'\nimport { t } from '../../../shared/i18n'"],
  ['选择要添加到「{playlistName(pendingPlaylistId)}」的影片', "{t('playlist.selectToAdd', { name: playlistName(pendingPlaylistId) })}"],
  ['已选 {selectedIds.size} 部', "{t('playlist.selectedCount', { n: selectedIds.size })}"],
  ['>全选<', ">{t('playlist.selectAll')}<"],
  ['>取消全选<', ">{t('playlist.deselectAll')}<"],
  ['>反选<', ">{t('playlist.invert')}<"],
  ['>取消<', ">{t('playlist.cancel')}<"],
  ['>添加选中 ({selectedIds.size})<', ">{t('playlist.addSelected', { n: selectedIds.size })}<"],
  ['选择要从「{playlistName(activePlaylistId)}」移除的影片', "{t('playlist.selectToRemove', { name: playlistName(activePlaylistId) })}"],
  ['>移除选中 ({selectedIds.size})<', ">{t('playlist.removeSelected', { n: selectedIds.size })}<"],
  ['{props.filteredCount} 部影片', "{props.filteredCount} {t('playlist.videos')}"],
  ['删除影片\n            </button>', "{t('playlist.removeVideos')}\n            </button>"],
  ['添加影片\n            </button>', "{t('playlist.addVideos')}\n            </button>"],
  ['播放全部\n            </button>', "{t('playlist.playAll')}\n            </button>"],
  ['删除列表\n            </button>', "{t('playlist.delete')}\n            </button>"],
])

// ---- Toolbar: 重复检测 ----
patchFile('E:/Movie Vault/src/renderer/src/components/Toolbar.tsx', [
  ['title="查找内容相同的重复视频，释放磁盘空间"', "title={t('toolbar.duplicatesTitle')}"],
  ['重复检测', "{t('toolbar.duplicates')}"],
])

// ---- EntryCard: 已添加 ----
patchFile('E:/Movie Vault/src/renderer/src/components/EntryCard.tsx', [
  ['已添加', "{t('entry.addedToPlaylist')}"],
])
