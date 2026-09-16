#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Finalize IPC split: minimal helpers imports, export fns, domain imports, new index."""
import io, re

D = r"E:\Movie Vault\src\main\ipc"

def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()

def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)

def strip_import_block(s):
    """Remove leading import block (imports may be interleaved with comments)."""
    lines = s.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line == "" or line.startswith("//"):
            i += 1
            continue
        if line.startswith("import "):
            i += 1
            continue
        break
    return "\n".join(lines[i:]).lstrip("\n")

# ---------- 1. helpers.ts: minimal imports + exports ----------
h = read(D + "\\helpers.ts")
# Delete everything from file start up to and including the activeFetchState declaration line
# (original interleaved imports/comments/consts), then re-emit canonical header.
h = re.sub(r"^.*?let activeFetchState[^\n]*\n", "", h, count=1, flags=re.S)
h = h.lstrip("\n")
minimal = (
    "import { app, BrowserWindow } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import type { ReconcileResult } from '../../shared/types'\n"
    "import * as repo from '../lib/repo'\n"
    "import path from 'node:path'\n"
    "import { promises as fs } from 'node:fs'\n"
    "import { postersCacheDir } from '../lib/images'\n"
    "import { cacheRemoteImage } from '../lib/image-util'\n"
    "import { probeImage } from '../lib/ffprobe'\n"
    "import { type MovieMeta, type SourceId, type ScanProgress, type Settings, type Video, type UpdateSource } from '../../shared/types'\n"
    "import { type UpdateCheckResult, type UpdateAssetInfo } from '../../shared/api-types'\n"
    "import { fetchDetailSmart, createSmartFetchState, type SmartFetchState } from '../lib/fetch-meta'\n"
    "\n"
    "// 去重锁：同一视频同时只跑一次 generatePreviews，避免并发写入互相覆盖\n"
    "export const inFlightPreviews = new Map<string, Promise<unknown>>()\n"
    "\n"
    "// 当前活跃的批量补齐状态（供 pause/resume/stop 控制）\n"
    "export let activeFetchState: SmartFetchState | null = null\n"
    "export function setActiveFetchState(v: SmartFetchState | null): void {\n"
    "  activeFetchState = v\n"
    "}\n"
    "export function getActiveFetchState(): SmartFetchState | null {\n"
    "  return activeFetchState\n"
    "}\n"
)
# export remaining top-level functions/consts
h = re.sub(r"(?m)^(async function |function )", r"export \1", h)
for cname in ["ALLOWED_EXTERNAL_PROTOCOLS", "FRAME_FALLBACK_LIMIT", "FRAME_FAIL_COOLDOWN"]:
    h = re.sub(r"(?m)^(const) " + cname + r"\b", r"export \1 " + cname, h)
write(D + "\\helpers.ts", minimal + h)
print("helpers.ts finalized")

# ---------- 2. domain files: export register fn + prepend imports ----------
HELPERS_COMMON = (
    "  backfillFromDetail,\n"
    "  emitProgress,\n"
    "  frameFailedRecently,\n"
    "  isCoverUsable,\n"
    "  isSafeId,\n"
    "  resolveDetailCover,\n"
)

LIBRARY_HEAD = (
    "import { ipcMain, dialog, BrowserWindow } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as repo from '../lib/repo'\n"
    "import { scanLibrary, walk } from '../lib/scanner'\n"
    "import { reconcileLibrary } from '../lib/reconcile'\n"
    "import { frameLog } from '../lib/images'\n"
    "import { extractMovieQuery, localCanonicalName } from '../../shared/code'\n"
    "import * as XLSX from 'xlsx-js-style'\n"
    "import { createSmartFetchState, fetchDetailSmart, fetchPosterSmart } from '../lib/fetch-meta'\n"
    "import { generateQuickCover } from '../lib/preview-v2'\n"
    "import { probeVideo } from '../lib/ffprobe'\n"
    "import { previewRenames } from '../lib/rename'\n"
    "import { findDuplicates } from '../lib/dedup'\n"
    "import path from 'node:path'\n"
    "import { promises as fs, writeFileSync, existsSync } from 'node:fs'\n"
    "import type { Library, MovieMeta, ImageSource, SourceId, Video, TechInfo } from '../../shared/types'\n"
    "import {\n"
    + HELPERS_COMMON +
    "  readReconcileCache,\n"
    "  writeReconcileCache,\n"
    "  setActiveFetchState,\n"
    "  getActiveFetchState,\n"
    "  FRAME_FALLBACK_LIMIT\n"
    "} from './helpers'\n"
)

VIDEO_HEAD = (
    "import { ipcMain, shell, BrowserWindow } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as repo from '../lib/repo'\n"
    "import { scanLibrary } from '../lib/scanner'\n"
    "import { openVideo, openPlaylist, updatePlaybackPosition } from '../lib/player'\n"
    "import { frameLog, postersCacheDir } from '../lib/images'\n"
    "import { generateQuickCover, generatePreviewV2, previewRoot } from '../lib/preview-v2'\n"
    "import { wakePreviewTaskQueue } from '../lib/preview-task-queue'\n"
    "import { flushSave } from '../lib/store'\n"
    "import { fetchPosterSmart } from '../lib/fetch-meta'\n"
    "import { fetchDetailByUrl } from '../lib/fetch-by-url'\n"
    "import { probeVideo } from '../lib/ffprobe'\n"
    "import { safeFileBaseName } from '../lib/rename'\n"
    "import { readNfoForVideo, writeNfoForVideo } from '../lib/nfo'\n"
    "import { localCanonicalName } from '../../shared/code'\n"
    "import path from 'node:path'\n"
    "import { promises as fs } from 'node:fs'\n"
    "import type { Library, Video } from '../../shared/types'\n"
    "import {\n"
    "  backfillFromDetail,\n"
    "  cleanVideoCacheFiles,\n"
    "  emitProgress,\n"
    "  fetchMovieDetail,\n"
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
    "import { startWatching, stopWatching } from '../lib/watcher'\n"
)

PLAYLIST_HEAD = (
    "import { ipcMain } from 'electron'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as playlist from '../lib/playlist'\n"
)

SYSTEM_HEAD = (
    "import { app, ipcMain, dialog, shell, clipboard } from 'electron'\n"
    "import { createHash, randomBytes } from 'node:crypto'\n"
    "import { IPC } from '../../shared/ipc'\n"
    "import * as repo from '../lib/repo'\n"
    "import * as watchHistory from '../lib/watch-history'\n"
    "import { testProxyConnectivity } from '../lib/proxy'\n"
    "import { detectFfmpeg } from '../lib/ffmpegEnv'\n"
    "import { applyRenames } from '../lib/rename'\n"
    "import { postersCacheDir } from '../lib/images'\n"
    "import path from 'node:path'\n"
    "import { promises as fs, existsSync, readFileSync } from 'node:fs'\n"
    "import { spawn } from 'node:child_process'\n"
    "import { isSafeExternalUrl, runUpdateCheck } from './helpers'\n"
    "import type { Library } from '../../shared/types'\n"
    "import type { UpdateCheckResult } from '../../shared/api-types'\n"
)

for name, head in [("library", LIBRARY_HEAD), ("video", VIDEO_HEAD), ("settings", SETTINGS_HEAD), ("playlist", PLAYLIST_HEAD), ("system", SYSTEM_HEAD)]:
    p = D + "\\" + name + ".ts"
    s = read(p)
    s = re.sub(r"(?m)^function register", "export function register", s)
    write(p, head + s)
    print(name + ".ts finalized")

# ---------- 3. library.ts: activeFetchState -> setter/getter (immutable import) ----------
p = D + "\\library.ts"
s = read(p)
s = s.replace("activeFetchState = smartState", "setActiveFetchState(smartState)")
s = s.replace("activeFetchState = null", "setActiveFetchState(null)")
s = s.replace("if (activeFetchState) activeFetchState.paused = true", "const st = getActiveFetchState(); if (st) st.paused = true")
s = s.replace("if (activeFetchState) activeFetchState.paused = false", "const st = getActiveFetchState(); if (st) st.paused = false")
s = s.replace("if (activeFetchState) activeFetchState.stop = true", "const st = getActiveFetchState(); if (st) st.stop = true")
write(p, s)
print("library.ts activeFetchState -> setter")

INDEX = (
    "import { registerLibraryIpc } from './library'\n"
    "import { registerVideoIpc } from './video'\n"
    "import { registerSettingsIpc } from './settings'\n"
    "import { registerPlaylistIpc } from './playlist'\n"
    "import { registerSystemIpc } from './system'\n"
    "export { runUpdateCheck } from './helpers'\n"
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
write(D + "\\index.ts", INDEX)
print("index.ts rewritten")
print("ALL DONE")
