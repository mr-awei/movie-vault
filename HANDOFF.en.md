# Yinghai · Handoff Document

> For the engineer taking over: the shortest path to a working mental model of the codebase, and where to touch things when you change them. Deep design details live in [TDD.en.md](./TDD.en.md).

## 0. At a glance

| Item | Value |
| --- | --- |
| Product | Yinghai (Movie Vault) — local-first movie library manager |
| Version | v2.8.0 |
| Stack | Electron 31 · electron-vite 2 · React 18 · TypeScript 5.5 · Tailwind CSS 3 · xlsx · undici |
| Storage | Single JSON document (`data.json`) + schema migration + debounced atomic writes |
| Media | ffmpeg / ffprobe (system or bundled) |
| Languages | Simplified Chinese / English |
| License | Yinghai Dual License v1.0 (commercial: `new_mr_awei@163.com`) |

> Disclaimer: Yinghai is a local file organizer. It does not host, distribute or share any video content.

---

## 1. Running it in five minutes

```bash
npm install
npm run dev        # development (renderer HMR, main auto-restart)
npm run typecheck  # required before every commit
npm run build      # artifacts to dist/
npm run pack       # installer into release/
```

First run: add a library (video folder + Excel catalog) → click "Scan library" → verify the wall and the reconciliation result.

---

## 2. Directory map

```
src/
├── main/
│   ├── index.ts              # entry: window, single instance, tray, auto-launch
│   ├── assets/               # bundled guide documents
│   └── lib/
│       ├── ipc.ts            # every IPC handler (most changes start here)
│       ├── store.ts          # data.json load / migrate / debounced atomic write
│       ├── repo.ts           # repository (library / video / settings)
│       ├── scanner.ts        # folder walk → records (incl. stale-record purge)
│       ├── reconcile.ts      # catalog vs files, auto-categorisation
│       ├── excel.ts          # catalog parsing (tolerant headers/order)
│       ├── fetch-meta.ts     # 5-source fallback orchestration
│       ├── movie-db.ts / omdb.ts / openlibrary.ts / justwatch.ts / wikipedia.ts
│       ├── images.ts         # ffmpeg frames, quality scoring, poster cache
│       ├── proxy.ts          # single network egress (incl. SOCKS)
│       ├── rename.ts         # filename cleanup & safe base names
│       └── player.ts / runtime.ts / ffmpegEnv.ts / ffprobe.ts
├── preload/index.ts          # contextBridge → window.api
├── renderer/src/
│   ├── App.tsx               # application state hub (largest file — edit carefully)
│   ├── lib/util.ts           # displayTitle / cover resolution / formatting
│   └── components/           # 24 UI components
└── shared/
    ├── types.ts              # core types (Video / Library / MovieMeta / Settings)
    ├── ipc.ts                # IPC channel names (single source of truth)
    ├── api-types.ts          # AppApi and per-channel payloads
    ├── code.ts               # filename → title / year / ID parsing
    ├── i18n/                 # dictionaries and t() / tMain()
    └── about.ts              # About-dialog static config
build/                        # NSIS template, uninstall guard
scripts/                      # pack / publish / certificate
docs/                         # topic guides
```

---

## 3. Core concepts

- **Library** = video root + Excel catalog + cover priority + ignore list.
- **Catalog** = the Excel file that authoritatively defines category / score / synopsis; extra columns become tag groups.
- **Reconcile** = bidirectional match between catalog entries and files → `matched / missing / unlisted`.
- **Meta** = metadata fetched from sources (title, year, score, genres, cast, synopsis); stored at `video.meta`.
- **externalId** = source-side identifier (TMDb ID / IMDb ID / work key).
- **Lock** = marks a title as excluded from batch enrichment (`video.locked`).

---

## 4. Key invariants (read before editing)

1. **IPC contracts live in `src/shared`** — a new/changed channel requires editing both `ipc.ts` and `api-types.ts`, otherwise `typecheck` fails.
2. **`scan:progress.current` is the display title** (`meta.title` preferred). Do not fall back to the filename or the UI will disagree with the list.
3. **Bulk writes go through `repo.applyVideoChanges`** — never loop `updateVideo` (each call rewrites the whole JSON).
4. **Lock protection** — when the incoming record does not carry `locked`, the existing value is preserved; only an explicit `locked:false` unlocks.
5. **Stale records are purged during scan** — only when the scan actually read files, so an offline drive cannot wipe the library.
6. **Deletion always goes to the system recycle bin** and is guarded by the deletion lock.
7. **All network requests must go through `lib/proxy.ts`**, otherwise proxy settings are bypassed.
8. **Schema changes require bumping `SCHEMA_VERSION` and adding an idempotent migration.**

---

## 5. How to make common changes

| Task | Where |
| --- | --- |
| Add a data source | `shared/types.ts` (SourceId) → `main/lib/<source>.ts` → `fetch-meta.ts` → `SettingsModal.tsx` → both i18n files. See [docs/ADDING_A_DATA_SOURCE.en.md](./docs/ADDING_A_DATA_SOURCE.en.md) |
| Add a setting | `Settings` + `DEFAULT_SETTINGS` in `shared/types.ts` → `SettingsModal.tsx` → both i18n files |
| Add an IPC channel | `shared/ipc.ts` → `shared/api-types.ts` → `preload/index.ts` → `main/lib/ipc.ts` → renderer call site |
| Adjust card / list visuals | `components/EntryCard.tsx` / `ListView.tsx`; use `displayTitle` from `lib/util.ts` |
| Adjust frame extraction | `main/lib/images.ts` (sample counts, quality thresholds, timeouts) |
| Adjust batch behaviour | `main/lib/ipc.ts#libraryFetchAll` + the progress / failure / skip orchestration in `App.tsx` |

---

## 6. Troubleshooting

| Symptom | Where to look |
| --- | --- |
| Blank screen / `is not defined` in console | Usually HMR loading a mid-edit state — refresh or restart. If it persists, check `App.tsx` for a leftover old variable name |
| Batch job appears stuck | Check the progress panel and main-process logs; look for a corrupted video hitting the ffmpeg timeout (30s timeout + failure marking) |
| List still shows old filenames | Ensure `displayTitle` is used and that main passes the display title in `current` |
| Locked item still enriched | Verify `locked:true` is on disk in `data.json`, the main process was restarted, and check the "N locked skipped" log line |
| Library count higher than files on disk | Stale records exist — run "Scan library" to purge them automatically |
| Low enrichment success rate | Check API keys, proxy connectivity and source order; the failure modal lists per-item reasons |
| Blurry / black covers | Check ffmpeg status in Settings; re-frame from the detail page |
| Settings not applied | Confirm the debounced write finished; restart if needed |

---

## 7. Data locations

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%/local-movie-vault` |
| macOS | `~/Library/Application Support/local-movie-vault` |
| Linux | `~/.config/local-movie-vault` |

- `data.json` — libraries, videos, settings.
- `posters/` — cover and preview cache (safe to delete).

---

## 8. Handoff verification checklist

- [ ] `npm run dev` starts and renders an existing library.
- [ ] `npm run typecheck` is green.
- [ ] New library → scan → reconcile → wall renders correctly.
- [ ] Batch enrichment can pause / resume / stop; failures retry.
- [ ] Locked items are skipped by both normal and force runs, with a report.
- [ ] A title without a poster gets a cover and previews via ffmpeg.
- [ ] Privacy shield, deletion lock, recycle-bin delete and the uninstall guard work.
- [ ] Switching zh-CN ↔ en-US shows no missing strings.
- [ ] [TDD.en.md](./TDD.en.md) and [PRD.en.md](./PRD.en.md) have been read.

---

## 9. Contacts & release

- Commercial licensing: `new_mr_awei@163.com`
- Repositories: GitHub `mr-awei/movie-vault`, mirrored on Gitee
- Release process: [PUBLISHING.en.md](./PUBLISHING.en.md)
