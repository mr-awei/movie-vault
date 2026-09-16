#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prepend import blocks to split ipc domain files."""
import io

D = r"E:\Movie Vault\src\main\ipc"

HELPERS_IMPORT = (
    "import {\n"
    "  backfillFromDetail,\n"
    "  cleanVideoCacheFiles,\n"
    "  emitProgress,\n"
    "  fetchMovieDetail,\n"
    "  frameFailedRecently,\n"
    "  isCoverUsable,\n"
    "  isSafeExternalUrl,\n"
    "  isSafeId,\n"
    "  readReconcileCache,\n"
    "  resolveDetailCover,\n"
    "  runUpdateCheck,\n"
    "  writeReconcileCache\n"
    "} from './helpers'\n"
)

LIBRARY_HEAD = (
    "import { ipcMain, dialog } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as repo from '../lib/repo'\n"
    "import { scanLibrary } from '../lib/scanner'\n"
    "import { reconcileLibrary } from '../lib/reconcile'\n"
    "import { frameLog } from '../lib/images'\n"
    "import { extractMovieQuery, localCanonicalName } from '../../shared/code'\n"
    "import * as XLSX from 'xlsx-js-style'\n"
    "import { createSmartFetchState, fetchDetailSmart } from '../lib/fetch-meta'\n"
    "import path from 'node:path'\n"
    "import { promises as fs } from 'node:fs'\n"
    "import type { Library, MovieMeta, ReconcileResult, ScanProgress, Settings, Video } from '../../shared/types'\n"
    "import {\n"
    "  backfillFromDetail,\n"
    "  emitProgress,\n"
    "  frameFailedRecently,\n"
    "  isCoverUsable,\n"
    "  isSafeId,\n"
    "  readReconcileCache,\n"
    "  resolveDetailCover,\n"
    "  writeReconcileCache\n"
    "} from './helpers'\n"
)

VIDEO_HEAD = (
    "import { ipcMain, shell } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as repo from '../lib/repo'\n"
    "import { scanLibrary } from '../lib/scanner'\n"
    "import { openVideo, openPlaylist, updatePlaybackPosition } from '../lib/player'\n"
    "import { frameLog, postersCacheDir } from '../lib/images'\n"
    "import { generateQuickCover, generatePreviewV2 } from '../lib/preview-v2'\n"
    "import { wakePreviewTaskQueue } from '../lib/preview-task-queue'\n"
    "import { cacheRemoteImage } from '../lib/image-util'\n"
    "import { fetchPosterSmart } from '../lib/fetch-meta'\n"
    "import { fetchDetailByUrl } from '../lib/fetch-by-url'\n"
    "import { probeVideo, probeImage } from '../lib/ffprobe'\n"
    "import { safeFileBaseName } from '../lib/rename'\n"
    "import { readNfoForVideo, writeNfoForVideo } from '../lib/nfo'\n"
    "import { localCanonicalName } from '../../shared/code'\n"
    "import path from 'node:path'\n"
    "import { promises as fs } from 'node:fs'\n"
    "import type { ImageSource, Settings, TechInfo, Video } from '../../shared/types'\n"
    "import {\n"
    "  backfillFromDetail,\n"
    "  cleanVideoCacheFiles,\n"
    "  emitProgress,\n"
    "  fetchMovieDetail,\n"
    "  frameFailedRecently,\n"
    "  inFlightPreviews,\n"
    "  isCoverUsable,\n"
    "  isSafeId,\n"
    "  resolveDetailCover\n"
    "} from './helpers'\n"
)

SETTINGS_HEAD = (
    "import { ipcMain } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as repo from '../lib/repo'\n"
    "import { applyRuntimeSettings } from '../lib/runtime'\n"
)

PLAYLIST_HEAD = (
    "import { ipcMain } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as playlist from '../lib/playlist'\n"
)

SYSTEM_HEAD = (
    "import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'\n"
    "import { createHash, randomBytes } from 'node:crypto'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as repo from '../lib/repo'\n"
    "import * as XLSX from 'xlsx-js-style'\n"
    "import * as watchHistory from '../lib/watch-history'\n"
    "import { testProxyConnectivity } from '../lib/proxy'\n"
    "import { detectFfmpeg } from '../lib/ffmpegEnv'\n"
    "import { flushSave } from '../lib/store'\n"
    "import path from 'node:path'\n"
    "import { promises as fs, existsSync } from 'node:fs'\n"
    "import { spawn } from 'node:child_process'\n"
    "import { isSafeExternalUrl, runUpdateCheck } from './helpers'\n"
    "import type { Library, Settings, UpdateSource } from '../../shared/types'\n"
    "import type { UpdateCheckResult, UpdateAssetInfo } from '../../shared/api-types'\n"
)

for name, head in [("library", LIBRARY_HEAD), ("video", VIDEO_HEAD), ("settings", SETTINGS_HEAD), ("playlist", PLAYLIST_HEAD), ("system", SYSTEM_HEAD)]:
    p = D + "\\" + name + ".ts"
    with io.open(p, encoding="utf-8") as f:
        body = f.read()
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(head + body)
    print("prepended " + name + ".ts")

INDEX = (
    "import { registerLibraryIpc } from './library'\n"
    "import { registerVideoIpc } from './video'\n"
    "import { registerSettingsIpc } from './settings'\n"
    "import { registerPlaylistIpc } from './playlist'\n"
    "import { registerSystemIpc } from './system'\n"
    "\n"
    "/** 注册所有 IPC handler（按领域拆分） */\n"
    "export function registerIpc() {\n"
    "  registerLibraryIpc()\n"
    "  registerVideoIpc()\n"
    "  registerSettingsIpc()\n"
    "  registerPlaylistIpc()\n"
    "  registerSystemIpc()\n"
    "}\n"
)
with io.open(D + "\\index.ts", "w", encoding="utf-8", newline="\n") as f:
    f.write(INDEX)
print("rewrote index.ts")
