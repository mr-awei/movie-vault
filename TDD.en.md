# Yinghai · Technical Design Document (TDD)

> For engineers and maintainers: the current architecture, module responsibilities, interface contracts and key flows. Keep this document in sync with the code — any structural change should be written back here.

## Document info

| Item | Value |
| --- | --- |
| Doc version | v2.8.0 |
| Product version | v2.8.0 |
| Last updated | 2026-09-14 |
| Related | [PRD.en.md](./PRD.en.md) · [HANDOFF.en.md](./HANDOFF.en.md) · [docs/](./docs) |

---

## 1. Technical goals & constraints

| Goal | Design decision |
| --- | --- |
| Fully local, zero upload | No server, no account, no telemetry; data written only to local disk |
| Smooth for large libraries | Virtual scrolling in the renderer; coalesced batch writes in main |
| Type safety | Every IPC channel and payload defined in `src/shared`, shared by both sides |
| Works offline | Metadata / covers / previews are cached locally; ffmpeg can be bundled |
| Evolvable data | Single-document store with `schemaVersion` in-place migration, backward compatible |
| Security boundary | `contextIsolation` + preload `contextBridge`; renderer has no Node access |

**Environment** — Node.js 18+, Electron 31, electron-vite 2, TypeScript 5.5, React 18, Tailwind CSS 3.

---

## 2. Architecture

### 2.1 Process model

```
┌───────────────────────────────────────────────────────────────┐
│ Main process (Node)                                           │
│  ipc.ts ──► scanner / reconcile / fetch-meta / images / repo   │
│  store.ts (data.json) · proxy.ts (single network egress)       │
└───────────────▲────────────────────────────┬──────────────────┘
                │ ipcMain.handle             │ webContents.send
                │                            │ (scan:progress, poster:fetched)
┌───────────────┴────────────────────────────▼──────────────────┐
│ Preload (sandbox)                                             │
│  contextBridge.exposeInMainWorld('api', AppApi)               │
└───────────────▲────────────────────────────┬──────────────────┘
                │ window.api.xxx()           │ onScanProgress(cb)
┌───────────────┴────────────────────────────▼──────────────────┐
│ Renderer (Chromium, React)                                    │
│  App.tsx state hub · components/* UI · lib/api.ts typed entry │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Layer responsibilities

| Layer | Path | Responsibility | Forbidden |
| --- | --- | --- | --- |
| Main | `src/main` | Filesystem, network, ffmpeg, persistence, all side effects | Direct DOM access |
| Preload | `src/preload` | Whitelist-expose `window.api` | Business logic |
| Renderer | `src/renderer` | UI, interaction, light derived state | Node / fs access |
| Shared | `src/shared` | Types, IPC channel names, i18n, pure helpers | Electron imports |

### 2.3 Data flow

```
User action
  └─► window.api.xxx()            (preload forward)
        └─► ipcMain.handle        (main handler)
              ├─► repo/store      (in-memory DB + debounced atomic write)
              ├─► scanner/reconcile (fs walk & compare)
              ├─► fetch-meta      (5-source fallback + proxy + cache)
              └─► images          (ffmpeg frames + poster cache)
        ◄── return value / scan:progress event
  ◄─ React setState updates the view
```

---

## 3. Modules

### 3.1 Main process

| Module | Responsibility | Key exports |
| --- | --- | --- |
| `lib/ipc.ts` | Registers every IPC handler and orchestrates calls | — |
| `lib/scanner.ts` | Folder walk → create/reuse records; poster enrichment phase | `scanLibrary` `walk` `idForPath` `VIDEO_EXTS` |
| `lib/reconcile.ts` | Parse the catalog, compare with files, produce `ReconcileResult` | `reconcileLibrary` |
| `lib/fetch-meta.ts` | 5-source fallback orchestration, query cleaning, event callbacks | `fetchDetailSmart` `fetchPosterSmart` `DEFAULT_SOURCE_ORDER` |
| `lib/movie-db.ts` `omdb.ts` `openlibrary.ts` `justwatch.ts` `wikipedia.ts` | Per-source adapters | `fetchXxxDetail` |
| `lib/images.ts` | ffmpeg / ffprobe, quality scoring, poster cache | `resolvePoster` `generatePreviewSet` `generateFrame` |
| `lib/store.ts` | `data.json` load, schema migration, debounced atomic write, external-edit detection | `getDB` `saveDB` `SCHEMA_VERSION` |
| `lib/repo.ts` | Domain repository (library / video / settings) | `listVideos` `updateVideo` `applyVideoChanges` |
| `lib/excel.ts` | Catalog parsing (header discovery, name/order tolerance) | catalog parse helpers |
| `lib/rename.ts` | Filename advertisement cleanup, safe base names | `cleanVideoFileName` `safeFileBaseName` |
| `lib/proxy.ts` | Unified egress (undici + socks) and connectivity test | `httpFetch` `testProxyConnectivity` |
| `lib/ffmpegEnv.ts` `ffprobe.ts` | Binary discovery, technical probing | `ffmpegAvailable` `probeVideo` |
| `lib/player.ts` | System / external player launch | `openVideo` |
| `index.ts` | Window lifecycle, single instance, tray, auto-launch | App entry |

### 3.2 Renderer

| Module | Responsibility |
| --- | --- |
| `App.tsx` | Application state hub: library switch, filters, sorting, view, batch jobs, multi-select, modal orchestration |
| `components/VirtualizedWall.tsx` | Virtualized wall: row offsets, only visible ± overscan rows rendered |
| `components/ListView.tsx` | Thumbnail list and filename list (with multi-select) |
| `components/EntryCard.tsx` | Card: cover priority, badges, hover preview, context menu, selection |
| `components/VideoDetail.tsx` | Detail page: metadata, previews, enrich / re-frame / lock / edit / delete |
| `components/HomeView.tsx` | Home: hero, daily recommendation, cross-library random |
| `components/SettingsModal.tsx` | Settings center (general / appearance / network / sources / privacy / storage / update / danger) |
| `components/ReconcileDialog.tsx` | Reconciliation result: missing / untracked / ignore management / rename preview |
| `lib/util.ts` | Display title, cover resolution, formatting helpers |

### 3.3 Shared

| File | Content |
| --- | --- |
| `types.ts` | `Video`, `Library`, `MovieMeta`, `Settings`, `ReconcileResult`, `DisplayEntry` |
| `ipc.ts` | IPC channel name constants (single source of truth) |
| `api-types.ts` | `AppApi` interface and per-channel payload types |
| `code.ts` | Filename → title / year / IMDb / TMDb ID parsing |
| `i18n/` | Dictionaries and `t()` / `tMain()` |
| `about.ts` | About-dialog static config |

---

## 4. IPC reference

> Channel names live in `src/shared/ipc.ts`; payload types in `src/shared/api-types.ts`. `invoke` = request/response, `event` = pushed by main.

| Channel | Kind | Input → Output | Notes |
| --- | --- | --- | --- |
| `library:list` / `add` / `update` / `remove` | invoke | — → `Library` / `void` | Library CRUD |
| `library:scanAndReconcile` | invoke | `libraryId` → `ReconcileResult` | Scan + reconcile with a single progress run |
| `library:reconcile` / `reconcileCache` | invoke | `libraryId` → `ReconcileResult` | Reconcile / cached result |
| `video:list` / `get` | invoke | filter / `id` → `Video[]` / `Video` | Query |
| `video:update` | invoke | `id, patch` → `Video \| null` | Includes favorite / locked |
| `video:lockMany` | invoke | `ids, locked` → `number` | Batch lock, single write |
| `video:scan` | invoke | `libraryId` → `Video[]` | Records only |
| `video:open` | invoke | `id` → `OpenResult` | Playback |
| `video:fetchDetail` | invoke | `id, idOverride?` → `FetchDetailResult` | Enrich one item |
| `video:fetchByUrl` | invoke | `id, url` → `FetchDetailResult` | Fetch from a pasted page URL |
| `video:fetchPoster` | invoke | `id` → `Video \| null` | Poster only |
| `video:generatePreviews` | invoke | `id` → result | Re-frame (cover + previews) |
| `video:frameFallback` | invoke | `id` → `string \| null` | Lazy single frame |
| `video:setPreviewAsCover` / `switchPoster` | invoke | — → `Video \| null` | Cover selection |
| `video:renameFile` | invoke | `id, newTitle` → `RenameFileResult` | Rename file with the title |
| `video:probe` | invoke | `id` → `Video \| null` | ffprobe technical info |
| `video:inspectForDelete` / `deleteFile` | invoke | `id` → result | Pre-check / move to recycle bin |
| `library:fetchAll` | invoke | `libraryId, force?` → `BatchFetchResult` | Batch enrich (skips locked / missing) |
| `library:fetchPause` / `Resume` / `Stop` | invoke | — → `void` | Batch job control |
| `library:batchProbe` | invoke | `libraryId` → stats | Batch duration fix |
| `library:previewRenames` / `applyRenames` | invoke | `libraryId[, items]` | Filename cleanup |
| `library:getCodes` / `exportCodes` | invoke | `libraryId[, fmt]` | List read / export |
| `settings:get` / `set` | invoke | — / `patch` → `Settings` | Settings |
| `dialog:selectFolder` / `selectFile` | invoke | — → `string \| null` | Native pickers |
| `system:openPath` / `openExternal` / `revealInFolder` / `copyText` | invoke | — → `void` | OS capabilities |
| `proxy:test` / `cache:clear` / `ffmpeg:status` | invoke | — → result | Diagnostics |
| `lock:set` / `verify` / `delete` | invoke | `password` → result | Deletion lock |
| `update:check` / `app:info` / `app:quit` / `app:uninstall` / `system:specGet` | invoke | — | App-level |
| `scan:progress` | event | `ScanProgress` | Scan / reconcile / batch progress + fetch events |
| `poster:fetched` | event | `{ videoId, posterPath, … }` | Instant list refresh |

**Conventions**
1. Handlers never leak uncaught exceptions to the renderer; expected failures return `{ ok:false, error }`.
2. `scan:progress.current` carries the **display title** (`meta.title` preferred) so the UI stays consistent.
3. Type changes must update `shared/types.ts` / `shared/api-types.ts`; `typecheck` is the guard.

---

## 5. Storage design

### 5.1 Layout
```
<userData>/
├── data.json        # libraries / videos / settings / schemaVersion
├── posters/         # cover & preview cache (safe to delete)
└── *.log            # runtime logs (e.g. frame extraction)
```

### 5.2 Write strategy
1. **Debounce/coalesce** — several write requests in a short window collapse into one flush.
2. **Atomic replace** — temp file + rename; on Windows remove the target first; fall back to a direct write across devices.
3. **Checkpoints** — batch jobs flush every N items, so an interruption loses at most one batch.
4. **Bulk change application** — `applyVideoChanges(changes)` applies and persists once, avoiding per-item full writes.
5. **Self-write detection** — skip external-edit detection while a write is in flight, and refresh the mtime baseline after reload.

### 5.3 Migration
- On load, `schemaVersion < SCHEMA_VERSION` triggers an in-place migration chain and writes back.
- Covers historical renames (legacy keys → `meta` / `externalId`), tag layering (→ `tagCategories` + `backupTags`), category-column extraction (`introCategory`), title path cleanup, and more.
- Migrations must be idempotent; a summary is logged.

### 5.4 Reconcile cache
The last reconcile result is also persisted: startup / library switch shows it instantly, then refreshes in the background.

### 5.5 Lock protection
`applyVideoChanges` / `upsertVideo` preserve the existing `locked` / `lockedAt` when the incoming record does **not** carry `locked`; an explicit `locked:false` still unlocks. This prevents background scans from wiping user locks.

---

## 6. Key flows

### 6.1 Library setup & scan
```
Pick folder + catalog
  └─► scanLibrary
        ├─ walk (extension whitelist + minimum size)
        ├─ per file: reuse by path, or detect rename via contentHash / title+size
        ├─ bulk write (applyVideoChanges)
        ├─ purge stale records (path absent and file gone)
        └─ enrichment: concurrent poster resolution (manual / sidecar / placeholder / optional ffmpeg)
```

### 6.2 Reconcile
```
reconcileLibrary
  ├─ parse catalog (tolerant headers & order)
  ├─ bidirectional match (normalized title + year constraint + word boundary)
  ├─ output: matched / missing (in catalog, not on disk) / unlisted (on disk, not in catalog)
  ├─ no catalog: per-file entries, auto-categorised by source genres
  ├─ clean dead preview references
  └─ persist + write reconcile cache
```

### 6.3 Batch enrichment
```
libraryFetchAll(force)
  ├─ filter out locked items and missing files (details returned)
  ├─ worker pool (concurrency N, interval M ms)
  │   ├─ poster: fetch when missing/placeholder, ffmpeg fallback on failure
  │   ├─ detail: fetch when absent or stale
  │   └─ same-batch query cache reuse
  ├─ checkpoint flush every K items
  ├─ pause / resume / stop via a shared state object
  └─ returns { ok, failed, bySource, failures, lockedSkipped, missingSkipped, remainingNoPoster }
```

### 6.4 Frame extraction
```
generatePreviewSet
  ├─ cover: 12 random samples → quality ranking → best
  ├─ previews: 22 random samples → top PREVIEW_COUNT
  ├─ quality: downscale to 8×8 gray, compute luma mean/variance
  │    ok = 25 ≤ mean ≤ 230 and variance ≥ 400
  ├─ no candidate passes → fall back to highest variance
  └─ clean temporary candidates, return { coverPath, previewPaths }
```
Every ffmpeg spawn has a timeout and consumes `stderr` so a corrupted file cannot hang the pipeline.

### 6.5 Lock
```
Single: toggleFlag(id,'locked') → video:update → sync state + toast
Batch:  multi-select → video:lockMany(ids, locked) → one applyVideoChanges
Skip:   pre-filter in batch fetch + defensive check inside the worker
Report: modal listing skipped files (locked / missing) with unlock-all
```

### 6.6 Delete
```
video:inspectForDelete → pre-check (other files in the folder)
  └─► confirm (guarded by the deletion lock)
        ├─ folder contains only this file → recycle the whole folder
        └─ otherwise recycle just the file
              └─► clean related caches + remove the data.json record
```

---

## 7. Metadata fetching design

| Aspect | Detail |
| --- | --- |
| Source abstraction | Each source implements `fetchXxxDetail(query, settings, onError?, manual?)` → `MovieMeta \| null` |
| Query cleaning | `extractMovieQuery` derives clean title + year + IMDb / TMDb direct IDs |
| Fallback order | `customSourceOrder` first, else `DEFAULT_SOURCE_ORDER`; stops on first hit |
| Disable / circuit break | `disabledSources` skipped entirely; a source is circuit-broken after consecutive network failures |
| Events | Every attempt emits `{ code, src, status, detail }` for the live degradation log |
| Cache | Result stored in `video.meta` with a localised cover; in-batch query cache avoids duplicate work |
| Throttling | Configurable concurrency and interval; force mode lowers concurrency and raises the interval |
| Manual mode | `manual=true` disables filename-based ID guessing and uses the supplied query verbatim |

---

## 8. Frontend design

- **State**: no third-party store. `App.tsx` holds app-level state and passes it down; derived data is computed with `useMemo`.
- **Virtual scrolling**: category headers and card rows are flattened into one virtual list; row offsets and total height are precomputed; only visible rows ± overscan render; scroll is throttled with `requestAnimationFrame`; column count adapts via `ResizeObserver` / `MutationObserver`.
- **i18n**: in-house dictionaries; `tMain()` in main, `t()` in the renderer; missing keys fall back to zh-CN then the key itself; `{var}` interpolation supported.
- **Theme & density**: root class + CSS variables; the virtual wall observes class changes to re-measure.
- **Error isolation**: a top-level `ErrorBoundary` recovers instead of showing a blank screen.

---

## 9. Security design

| Area | Measure |
| --- | --- |
| Renderer privileges | `contextIsolation` on; only a whitelisted API via preload; no direct Node access |
| Network | All requests egress through `lib/proxy.ts` (HTTP / HTTPS / SOCKS4 / SOCKS5 / system) |
| Secrets | API keys stored locally in `data.json` only |
| Deletion lock | Random salt + SHA-256 hash; required before delete / library removal |
| Deletion safety | Always to the system recycle bin; pre-check and double confirmation |
| Privacy shield | One-click blur of all preview images |
| Uninstall | NSIS + PowerShell retention guard; user data kept by default |

---

## 10. Performance design

| Scenario | Technique |
| --- | --- |
| Large-library rendering | Virtual scrolling, `contain` layout isolation, lazy images |
| Large-library writes | Coalesced changes, checkpoints, debounce, atomic replace |
| Batch enrichment | Worker pool, interval throttling, query dedupe, capped frame fallback |
| Frame extraction | Concurrency limit, timeout kill, failure cool-down |
| Network | Connection reuse, cache hits, controllable circuit breaking |

---

## 11. Observability & troubleshooting

- Structured console tracing for key flows (scanned count, reconcile diff, skip reasons, timings).
- A dedicated log file for frame extraction to locate corrupted files and timeouts.
- `ErrorBoundary` captures render errors with context.
- See the troubleshooting checklist in [HANDOFF.en.md](./HANDOFF.en.md).

---

## 12. Quality assurance

| Stage | Practice |
| --- | --- |
| Static checks | `npm run typecheck` (main + renderer) is the merge gate |
| Contract safety | IPC channels and payloads centrally typed; signature changes surface at compile time |
| Manual acceptance | Execute the acceptance criteria in PRD section 6 |
| Regression focus | Setup / reconcile, controllable batch jobs, lock skipping, frame fallback, delete & uninstall guards |
| Current gap | No automated unit / E2E tests yet (see technical debt) |

---

## 13. Build & release

```bash
npm run dev        # development
npm run typecheck  # type check
npm run build      # artifacts to dist/
npm run pack       # electron-builder installer to release/
```

Versioning, signing and rollback: see [PUBLISHING.en.md](./PUBLISHING.en.md).

---

## 14. Technical debt & evolution

| Item | Current state | Plan |
| --- | --- | --- |
| Automated tests | None | Unit tests for core pure functions; E2E for key flows |
| State management | Concentrated in `App.tsx` | Split into domain contexts / reducers |
| Single-document store | Full JSON rewrite on save | Evaluate sharding or an embedded database |
| Stale-data self-healing | Purged during scan | Add a visible "data health check" entry |
| Frame quality | Heuristic on luma mean/variance | Evaluate richer image-quality scoring |
