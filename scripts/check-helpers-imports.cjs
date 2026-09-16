const fs = require('fs')
const src = fs.readFileSync('E:/Movie Vault/src/main/ipc/helpers.ts', 'utf8')
const names = [
  'BrowserWindow', 'app', 'createHash', 'randomBytes', 'ReconcileResult', 'repo',
  'scanLibrary', 'walk', 'path', 'readFileSync', 'writeFileSync', 'fs', 'existsSync',
  'XLSX', 'spawn', 'reconcileLibrary', 'openVideo', 'openPlaylist', 'frameLog',
  'generateQuickCover', 'generatePreviewV2', 'previewRoot', 'wakePreviewTaskQueue',
  'flushSave', 'postersCacheDir', 'cacheRemoteImage', 'extractMovieQuery',
  'localCanonicalName', 'testProxyConnectivity', 'detectFfmpeg', 'applyRuntimeSettings',
  'probeVideo', 'probeImage', 'previewRenames', 'applyRenames', 'safeFileBaseName',
  'findDuplicates', 'readNfoForVideo', 'writeNfoForVideo', 'playlist', 'watchHistory',
  'updatePlaybackPosition', 'startWatching', 'stopWatching', 'MovieMeta', 'SourceId',
  'Library', 'ScanProgress', 'Settings', 'Video', 'ImageSource', 'UpdateSource',
  'TechInfo', 'UpdateCheckResult', 'UpdateAssetInfo', 'fetchDetailSmart',
  'createSmartFetchState', 'fetchPosterSmart', 'SmartFetchState', 'fetchDetailByUrl',
  'IPC', 'dialog', 'shell', 'clipboard', 'readReconcileCache'
]
const body = src.split('\n').filter((l) => !l.trim().startsWith('import')).join('\n')
for (const n of names) {
  const re = new RegExp('\\b' + n + '\\b')
  if (re.test(body)) console.log('USED: ' + n)
}
