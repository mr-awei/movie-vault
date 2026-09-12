# YingXia (影海) Local Video Manager — Product Requirements Document (PRD)

| Project | YingXia Local Video Manager & Poster Wall |
|---|---|
| Doc version | v2.7.0 |
| Written | 2026-09-09 |
| Current product version | v2.7.0 |
| Doc status | Reviewed (single-author spec) |
| Source | Personal collection management + historical feature iteration |
| References | `HANDOFF.md` (project handoff), `CHANGELOG.md` (version history), `src/shared/ipc.ts` (capability list) |

> This document follows an enterprise-grade PRD structure: **context → evolution → full feature spec → non-functional requirements → data model → risks & roadmap**.
> All modules verified against the codebase (as of v2.7.0). Markers like 【Current】indicate features still present in v2.7.0.

---

## 1. Project Overview

### 1.1 Background

The user owns a large collection of local video files organized into folders named by video code, and faces several recurring pain points:

1. **No structure**: Filenames are messy, missing covers / descriptions / ratings — hard to browse and locate a specific title quickly
2. **Missing metadata**: Manually querying each title on third-party sites is tedious and inefficient
3. **Disconnected sources**: The user maintains a manually curated Excel sheet (their collection log), but it's out of sync with files on disk
4. **Privacy concerns**: Local collections contain sensitive material, so the user needs privacy safeguards (blurred previews, deletion lock)

### 1.2 Product Positioning

**YingXia is a desktop tool for personal users to manage local video collections**: a poster-wall library that auto-identifies video codes, auto-fetches metadata, organizes by the user's sheet as the authoritative source, and plays seamlessly with local players. **All data is stored locally (data.json). Nothing is uploaded.**

### 1.3 Target Users

| User Type | Profile | Core Need |
|---|---|---|
| Collector (primary) | Large local video library, code-based naming habit, maintains a sheet | Fast browsing, auto metadata completion, sheet-driven categorization |
| Casual user (secondary) | Fewer files, no sheet | Auto metadata fetch, poster wall, local playback |

### 1.4 Core Value

1. **Efficiency**: scan → identify code → auto 5-source metadata fetch with fallback → one-click batch completion, replacing manual lookups
2. **Order**: the user's Excel sheet is the single source of truth for categories; one-click reconcile to spot "unlisted / uncategorized"
3. **Experience**: seamless chain of poster wall → hover description → click detail → preview wall → local playback
4. **Privacy**: local storage, privacy shield, deletion lock — no user data leaves the machine

---

## 2. Milestones & Evolution (Inception → Present)

| Phase | Versions | Description |
|---|---|---|
| Kickoff | Initial commit | Electron skeleton |
| Early days | v1.7.0–1.7.5 | Intro-file wizard + multiple UI refinements |
| Community | v1.7.6–1.7.7 | About dialog with GitHub Star prompt; library form-based add (no more chained system dialogs) |
| Dual release | v1.8.0–1.8.5 | GitHub rename to mr-awei + Gitee mirror + dual auto-push; update-check fix (repo path, default source, auto fallback, 20s timeout); home skeleton screen; window resize ghost fix (CSS containment) |
| Data safety | v1.9.0–1.9.3 | Delete to recycle bin (`shell.trashItem` + seed-folder detection + confirm dialog); delete cascades all associated caches and records |
| Sheet-driven | v2.0.0–2.0.3 | **Excel sheet support** + JavLibrary source + size filter on scan + dual-cover switching + code extraction enhancements + ffmpeg frame fallback + thumbnail filter to avoid black frames + UserNoticeModal (legal compliance) |
| Source expansion | v2.0.x merged branch | Javapi / Javinfo sources added; set-as-cover; renderer-side frame fallback; global random; GitHub Actions automated build & release |
| Category & fallback | v2.1.0 | Auto-categorize videos with genres as `【Source】genre1·genre2`; frame-fetch 30s timeout; batch cap 200 |
| Stability fixes | v2.2.0–2.2.3 | Drop markdown intro sheets (Excel-only); customSourceOrder field; code parsing enhancement; autoFindIntroExcel scans library root |
| **Issue-driven fixes** | **v2.2.4–v2.2.10** | **User-feedback-driven fixes** (see 2.1) |
| Experience & networking | v2.3.x | Bilingual UI (zh-CN/en-US), series episodes, batch fetch progress panel (pause/resume/stop), proxy covering both Node.js and Chromium network stacks |
| Installer & browsing | v2.4.x | Installer UX improvements (detect running app, no forced kill), list view mode toggle (flat/grouped), random frame extraction with quality filtering |
| Stability release | v2.5.0 | Fix self-killing upgrade detection; feature stabilization and PRD alignment |
| Internationalization & compliance | v2.6.6–2.6.7 | NSIS installer language selection at first step and registry persistence; main process reads installer language on first launch; English user notice removes PRC legal references; uninstaller follows installer language. v2.6.7 further merges the in-app uninstall confirmation with the "keep / delete user data" choice into one flow, and fixes the deletion-phase error (UTF-8 BOM for the PowerShell guard script, parameter binding, lingering-process lock release, deletion retries 3→5). |
| **License & compliance upgrade** | **v2.7.0** | Open source license switched from MIT to Ying Xia Dual License v1.0 (bilingual five-chapter structure: Non-Commercial Free Use, Malware Prohibition with three-layer protection, Commercial Use, Rights Reserved, Disclaimer); new in-app license modal (LicenseModal) accessible from About modal footer, with bilingual auto-switch and one-click email copy; PRD/README/CHANGELOG fully updated to v2.7.0. |
### 2.1 Recent Fix Cluster (v2.2.4 – v2.2.10)

| Version | User Feedback | Root Cause | Fix |
|---|---|---|---|
| v2.2.4 | "84 videos all show as unlisted" | `XLSX.readFile` fails silently on Chinese paths | Buffer-based read; sheet-exception dialog (don't hide problems); fallback auto metadata fetch when no sheet |
| v2.2.5 | "Console flooded with errors" | Orphan previewPaths → `lm://` ENOENT spam | Silent ENOENT + reconcile cleans dead previewPaths |
| v2.2.6 | "Javapi failed — should keep trying others" | Two separate fetch paths + misleading error messages | Unified fetchDetailSmart; full 5-source summary errors; drag-and-drop ordering UI |
| v2.2.7 | "Copy should follow the order I dragged" | UI text hard-coded to default order | formatSourceOrder dynamic render |
| v2.2.8 | "Is the real fetch order actually changing?" | Poster fetch hardcoded to JavDB | fetchPosterSmart falls back by customSourceOrder |
| v2.2.9 | "How do I know which source is being used?" | Main process logs not written to disk | attachMainLog writes to file + [smart] summary log |
| v2.2.10 | "I should see the fetch progress in the UI too" | Process only in logs | ScanProgress.fetchEvent + bottom-right fetch overlay |

**Takeaway**: the v2.2.x philosophy is **"everything must be visible"** — every failure / fallback / exception must be surfaced in the UI, and every fix must be verified against real user data.

---

## 3. User Personas & Core Scenarios

### 3.1 Core Scenarios

1. **First-time setup**: add library → auto scan → sheet reconcile → batch completion → categorization done
2. **Daily browsing**: poster wall scroll → hover description → click detail (rating / actors / tags / preview wall) → local play
3. **Incremental management**: new videos arrive → scan auto-identifies → if no sheet, auto background metadata fetch
4. **Handling failures**: JavDB blocked by Cloudflare → auto fallback to JavBus → UI shows fallback chain in real time
5. **Privacy operations**: toggle privacy shield to blur previews → deletion lock protects sensitive content → restore from recycle bin

---

## 4. Feature Overview (All Modules Currently Present)

> Priority legend: **P0** = core flow (product unusable without it) / **P1** = important enhancement (frequent use, critical UX) / **P2** = auxiliary.

| Module | Sub-module | Priority | Status |
|---|---|---|---|
| M1 Library Management | Multi-library add/edit/delete, form-guided setup, auto scan, reconcile | P0 | ✅ Current |
| M2 Scan & Code Recognition | Directory traversal, code extraction, size filter, ffprobe tech detection | P0 | ✅ Current |
| M3 Excel Sheet System | Parse, auto-find, category mapping, matching, exception prompts | P0 | ✅ Current |
| M4 Source System | 5-source fetch, custom ordering, fallback, poster fetch | P0 | ✅ Current |
| M5 Metadata Management | Batch / single completion, edit, series dedupe | P0 | ✅ Current |
| M6 Covers & Previews | Source covers, ffmpeg frames, set-as-cover, cover switching | P0 | ✅ Current |
| M7 Playback & File Ops | Local play, reveal in folder, delete, rename, torrent magnet | P0 | ✅ Current |
| M8 Browse & Discover | Home / Browse, category tree, search/filter, favorite, random | P0 | ✅ Current |
| M9 Privacy & Security | Privacy shield, deletion lock, UserNoticeModal, recycle bin | P1 | ✅ Current |
| M10 Settings Center | 7 sections (General / Network / Appearance / Privacy / Storage / Updates / Dangerous Ops) | P1 | ✅ Current |
| M11 System Integration | Update check, tray, auto-start, About, logs | P1 | ✅ Current |
| M12 Visualization & UX | Fetch overlay, progress prompts, error toasts, skeleton screen | P1 | ✅ Current |
| M13 Bilingual UI | zh-CN/en-US language switching, localized copy, date/number formatting | P1 | ✅ Current |
| M14 Series Episodes | Group multiple CDs/episodes under same base code, episode selection, continuous browsing | P1 | ✅ Current |
| M15 Batch Fetch Progress Panel | Dedicated progress window with pause/resume/stop, per-source status | P1 | ✅ Current |
| M16 Proxy Coverage | Unified proxy for Node.js and Chromium network stacks, PAC/system proxy support | P1 | ✅ Current |
| M17 Installer UX | Detect running instance, gentle prompt, no forced kill | P2 | ✅ Current |
| M18 List View Mode | Flat vs. grouped view toggle, series/source-category grouping | P1 | ✅ Current |

---

## 5. Detailed Feature Spec (By Module)

### M1 Library Management

| Requirement | Description |
|---|---|
| Create library | Form-guided (path picker + name), supports multiple libraries in parallel |
| Delete library | Confirm dialog; removes associated `data.json` records and caches (does NOT delete files on disk) |
| Edit library | Change path / name / sheet path |
| Auto scan | `scanOnStartup`: auto reconcile current library on launch; `autoRescan`: background reconcile for non-current libraries |
| Reconcile | `libraryReconcile`: read sheet → match files → produce categorized entries → show reconcile result dialog (match / unlisted / uncategorized counts) |
| Reconcile result display | ReconcileDialog: stats + ignore-unlisted-path + top large files |
| Scan progress | Real-time progress bar (total / done / current) |

**Edge cases**: error when library path unreachable; skip videos smaller than `scanMinSizeMB`.

### M2 Scan & Code Recognition

| Requirement | Description |
|---|---|
| Video format detection | 12 extensions: mp4 / mkv / avi / mov / flv / wmv / webm / m4v / ts / m2ts / mpg / mpeg |
| Code extraction | `extractCode`: handles `SONE-560`, `hdd800.com@JUR-031` (strips domain prefixes), `HUNTA468CD2` (no separator), Chinese brackets; `extractBaseCode` strips episode suffixes like `-CD/-PART/-A/-B/trailing digits` |
| Folder-name priority | Uses the video's parent folder name as the cleaner search source (filenames often contain ad strings) |
| Tech probe | `ffprobe` reads codec / resolution / bitrate / duration into `techInfo`, shown on detail page |

**Edge cases**: unrecognized code → treat as "no result" (don't count as network failure, avoids batch auto-stop); domestic (Chinese-only) videos marked `domestic`, frame-only (no metadata fetch).

### M3 Excel Sheet System

| Requirement | Description |
|---|---|
| Sheet parsing | `parseIntroExcel`: Sheet "Sheet1" ("片单"), code in column B, name in column A, category columns (grouped by column), rating column, tag columns; **buffer-based read (Chinese-path safe)** |
| Auto-find | `autoFindIntroExcel`: when no path configured, scans library root one level deep for `.xlsx/.xls` (picks first when multiple, sorted by name) |
| Authoritative categorization | Sheet is the source of truth: categories (`tagCategories` grouped by column), recommended rating (overrides data sources), tags |
| Matching algorithm | `keyMatches`: code-prefix boundary (previous char not alphanumeric) + tolerant of letter suffixes (only rejects digit suffixes) |
| Exception prompts | Sheet load failure must fire a Toast (non-auto-dismiss): `not-configured` / `parse-failed` (with `triedPaths`) / `auto-find-failed` |
| Reconcile accounting | When no sheet configured, produce exactly one entry per file (prevents duplicate keys) |

**Edge cases**: empty / corrupted sheet → clearly show "which file is broken"; sheet row dedupe (keep first occurrence per code).

### M4 Source System (Core)

| Requirement | Description |
|---|---|
| Sources | Javapi (self-hosted, free, no anti-bot) / Javinfo (aggregator API) / JavDB (rich info but Cloudflare-blocked) / JavBus (medium info, age-gate bypass) / JavLibrary (lightweight, last resort) |
| Fetch order | `dataSource: 'auto'` follows `customSourceOrder` (default Javapi → Javinfo → JavDB → JavBus → JavLibrary); manual single source for debugging |
| Order adjustment | SettingsModal drag ⠿ / ↑↓ buttons / restore recommended (v2.2.6+) |
| Fallback mechanism | Try each source in order, stop on first hit; any source that fails **3 consecutive network errors** (not "no results") is disabled for this batch; JavBus failing 3x stops the entire batch (avoids spinning) |
| Metadata fetch | `fetchDetailSmart`: full 5-source result summary (`javapi=skipped; javdb=no-result; ...`) |
| Poster fetch | `fetchPosterSmart`: falls back across all 5 sources by `customSourceOrder` |
| Live process display | `onEvent` emits per-source attempt → bottom-right overlay in renderer (v2.2.10) |
| Concurrency throttle | `fetchConcurrency` (1-8) + `fetchIntervalMs` (default 600ms), reduces anti-bot risk |

**Edge cases**: JavDB 403 (Cloudflare) is the normal fallback path; "search no results / unrecognizable code" does NOT count toward failure or trigger a stop.

### M5 Metadata Management

| Requirement | Description |
|---|---|
| Batch completion | `libraryFetchJavdbAll`: concurrent fetch for all videos missing detail (cover + detail + preview frames), series dedupe (same base code fetches once) |
| Single completion | `videoFetchJavdbDetail`: fetch one video's detail, update cover on success |
| Edit metadata | EditMetaModal: manual edit of title / rating / description / tags / actors |
| Detail content | JavdbDetail: full title, cover, date, duration, director, studio, series, rating, genres, actors, actresses, samples |
| Metadata backfill | `backfillFromDetail`: actors / year / rating / tags written back to video fields |
| Staleness | Detail `parseVer !== 2` means stale and should be re-fetched (new parser version) |

### M6 Covers & Previews

| Requirement | Description |
|---|---|
| Source covers | Detail cover → `cacheRemoteImage` downloads locally (with Referer header for anti-hotlink protection) |
| ffmpeg frame fallback | No cover / bad image → `generatePreviewSet`: 1 cover + 15 preview frames (thumbnail filter avoids black frames, 30s timeout) |
| Set-as-cover | Preview frame → cover (`videoSetPreviewAsCover`, posterSource=manual highest priority, persisted) |
| Cover switching | `videoSwitchPoster`: toggle between source cover ↔ ffmpeg frame |
| Bad-image protection | `isCoverUsable` (validates with ffprobe); don't replace with corrupt/truncated downloads |
| Preview experience | HoverDetail description + detail-page preview wall + click-to-zoom |
| Cache cleanup | `cacheClear` clears poster cache dir; deleting a video cascades cache cleanup |
| Orphan cleanup | v2.2.5 `cleanupDeadPreviewPaths`: removes `data.json` entries pointing to missing files |

### M7 Playback & File Operations

| Requirement | Description |
|---|---|
| Local playback | `videoOpen`: default system player or custom `playerPath` |
| Reveal in folder | `shellRevealInFolder`: opens Explorer at file location |
| Delete video | `videoDeleteFile`: **recycle bin** (`shell.trashItem`, restorable); seed-folder detection (same folder has no other videos + has `.torrent` → delete the whole folder); delete cascades `data.json` record + all caches |
| Delete pre-check | `videoInspectForDelete`: shows count of other videos in folder / whether folder contains torrents |
| Batch rename | `libraryPreviewRenames` / `applyRenames`: strip ad text from filenames (preview → apply) |
| Magnet share | `videoShareTorrents`: scans folder for `.torrent` files and converts to magnet links for copy |

### M8 Browse & Discover

| Requirement | Description |
|---|---|
| Home overview | Hero area + category stats + favorite count + global random |
| Browse page | Grid (VirtualizedWall virtualized scroll) / List dual-view; poster density (large / standard / compact) |
| Category tree | Sheet categories + auto-categories (`【Source】genre1·genre2`) + unlisted + uncategorized + series groups |
| Search | Fuzzy match on title / filename / actors / tags |
| Quick filter | All / unlisted / uncategorized / favorites / no cover |
| Sort | Added time / rating (desc) / year / name (asc/desc) |
| Favorites | ♥ persisted (`favorite`), favorite filter + home page stats |
| Global random | Multi-library combined shuffle queue + reshuffle; favorites/detail don't rebuild queue for stable ordering |

### M9 Privacy & Security

| Requirement | Description |
|---|---|
| Privacy shield | `privacy-on`: one-click blur all preview images (prevents screenshot leakage), localStorage persisted, can default-on |
| Deletion lock | Set / clear / verify password (`lockSet/lockVerify`), password required before delete actions; prevents accidental deletion and unauthorized users |
| App lock | LockScreen: requires password to unlock the app; auto-quits after 5 consecutive failures |
| User notice | Forced modal on first launch (legal text + checkbox + confirmation persisted) |
| Recycle bin delete | All deletions go through the system recycle bin, restorable |

### M10 Settings Center (7 Sections)

| Section | Settings |
|---|---|
| General | External player path, ffmpeg path, auto-scan (on launch / on change), scan size filter, auto-start on boot, minimize to tray |
| Network | Proxy mode / host / port / user / pass + connectivity test; source mode (auto / single); customSourceOrder drag; javapi URL / Key; javinfo Key; javdb Cookie |
| Appearance | Theme (cinema / light / magazine / glass / system), poster density |
| Privacy & Security | Privacy shield default-on, deletion lock toggle / password |
| Data & Storage | Poster cache cleanup, ffmpeg status detection (system / bundled / missing) |
| Updates | Update source (GitHub / Gitee), check frequency |
| Dangerous Ops | Uninstall app (`appUninstall`) |

### M11 System Integration

| Requirement | Description |
|---|---|
| Update check | `updateCheck`: GitHub / Gitee dual-source auto-fallback, 20s timeout, launch + periodic check (30min) |
| System tray | `minimizeToTray`: closing window doesn't quit |
| About | App info + version + GitHub repo with Star prompt |
| Logs | main.log (main process console written to disk since v2.2.9) + renderer-console.log (JSON lines) → `%APPDATA%\影海\logs\` |
| Update prompt | pendingUpdate top banner + download CTA |

### M12 Visualization & UX

| Requirement | Description |
|---|---|
| Fetch overlay | Bottom-right FetchLogOverlay: live "→ Trying JavDB… / ✗ JavDB network failed / ✓ JavBus hit" (5 states, 5 colors, last 60 entries, auto-collapses 2.5s after batch ends) |
| Progress prompts | Unified scan / completion progress Toast (done / total / current, stays visible 0.9s after completion) |
| Error toasts | Sheet-load-failure and similar warn Toasts never auto-dismiss (v2.2.4 hard requirement: don't hide problems) |
| First-frame experience | HomeSkeleton skeleton screen; CSS containment prevents window resize ghost images |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Item | Requirement |
|---|---|
| Scan | Incremental scan of 1000+ files completes in seconds; ffprobe / frame-fetch concurrency `scanConcurrency` adjustable |
| Large list | Grid virtualized scroll (VirtualizedWall), smooth at 500+ cards |
| Fetch | Batch completion concurrency adjustable (`fetchConcurrency` 1-8) + rate-limited (`fetchIntervalMs`) to avoid anti-bot |
| Startup | First-frame skeleton; async load of `data.json` |

### 6.2 Security & Privacy

| Item | Requirement |
|---|---|
| Data local | All data in `%APPDATA%\影海\data.json`, nothing uploaded |
| Code / search | Network requests only to 5 sources + image CDNs |
| Password | Deletion lock hash-stored (SHA-256 salt + password), no plaintext |
| Credentials | javinfoKey / javapiKey / javdbCookie stored plaintext in `data.json` (acceptable for single-user local, **never synced**) |
| Links | External links via `openExternal` → default browser; local files via `lm://` whitelist protocol + extension whitelist |

### 6.3 Compatibility & Availability

| Item | Requirement |
|---|---|
| Platform | Windows (primary); macOS / Linux theoretically compatible (not fully tested) |
| Chinese paths | **Must support** (v2.2.4 lesson: xlsx read via buffer) |
| Offline | No network: cached metadata works, ffmpeg frame fallback, local playback unaffected |
| Upgrade | Data compatibility: `data.json` forward-compatible with new fields (v2.2.5 lesson: clean orphan references) |
| Recoverable | Deletions go through recycle bin; uninstall prompts |

### 6.4 Observability

| Item | Requirement |
|---|---|
| Logs | main.log + renderer-console.log (main also writes to disk since v2.2.9) |
| Fetch process | UI overlay + [smart] logs (order / HIT / FAILED three states) |
| Visible errors | Every failure must surface in the UI (Toast / overlay / reconcile dialog), never silent |

---

## 7. Data Model (Core)

```
data.json
├── settings: Settings
│   ├── dataSource / customSourceOrder / javapiUrl / javapiKey / javinfoKey / javdbCookie
│   ├── proxyMode / proxyHost / proxyPort / proxyUser / proxyPass
│   ├── fetchConcurrency / fetchIntervalMs / scanConcurrency / scanMinSizeMB
│   ├── theme / posterDensity / privacyDefaultOn / lockEnabled / lockHash / lockSalt
│   ├── autoRescan / scanOnStartup / launchAtLogin / minimizeToTray / defaultSort / updateSource
│   └── ...
├── libraries: Library[]        # { id, name, path, introExcelPath?, ignoredUnlistedPaths? }
└── videos: Video[]             # see below
```

```
Video {
  id, libraryId, path, fileName, folderName?
  title, year?, description?, descriptionSource?
  rating?, tags[], actors?, domestic?
  posterPath?, posterSource?(javdb|javbus|javlibrary|javapi|javinfo|ffmpeg|manual|placeholder)
  posterPathFfmpeg?, coverVersion?
  durationSec?, fileSize?, techInfo?
  addedAt, lastPlayedAt?, favorite?
  javdbDetail?{ uid, code, title, cover?, date?, duration?, director?, studio?, series?, rating?, genres[], actors[], actresses?, samples?, source?, parseVer? }
  previewPaths?, lastMetaFetchAt?
}
```

**Sheet structure**: `IntroDoc { items: IntroItem[], tagCategories? }`; `IntroItem { code, name, tags[], categories?, score? }` (authoritative source, overrides data sources).

---

## 8. Risks & Dependencies

| Risk | Severity | Mitigation |
|---|---|---|
| **JavDB Cloudflare blocking** (user's IP currently 403) | High | 5-source auto-fallback (currently fully falling back to JavBus); user can switch IP / configure Cookie |
| Source site redesign breaks HTML parsing | Medium | Per-source modules + parseVer versioning + [smart] logs for quick diagnosis |
| Large dataset performance | Low | Virtualized scroll + incremental scan |
| Chinese path compatibility | Resolved | Buffer-based read + end-to-end testing (v2.2.4) |
| Network instability (release / fetch) | Medium | Node direct-connect release script; fetch auto-fallback retry |
| Upgrade data migration | Medium | New fields are forward-compatible; orphan cleanup (v2.2.5) |

---

## 9. Metrics

| Metric | Definition | Current baseline (measured) |
|---|---|---|
| Metadata coverage | videos with javdbDetail / total videos | 80 / 84 = **95.2%** |
| Sheet match rate | keyMatches hits / total directory | **76 / 76 = 100%** |
| Fetch source distribution | bySource counts | javbus: 80 (JavDB blocked → all falling back) |
| Batch completion success | ok / (ok+failed) | Depends on network conditions |
| Startup to interactive | skeleton → usable | < 2s (local data) |

---

## 10. Roadmap

| Priority | Item | Description |
|---|---|---|
| 🔴 P0 | **Doc tag layering** | User requirement: doc tags are primary; data-source tags collapse to secondary display (Video gains `tagCategories` + `backupTags`, detail page can expand) |
| 🟡 P1 | Cover / preview enhancement | ffmpeg re-frame button completion; auto frame for videos without previews |
| 🟡 P1 | Source stability | JavDB anti-bot mitigation (Cookie guidance / retry strategy); source-change monitoring |
| 🟢 P2 | Multi-end-device | Pack-and-release automation (timestamp signing, Gitee Release asset size handling) |
| 🟢 P2 | Import / export | Excel sheet export (currently read-only) |

---

## 11. Appendix

### 11.1 Glossary

| Term | Meaning |
|---|---|
| Reconcile | Sheet / file vs. `data.json` record sync comparison |
| FetchJavdb | Metadata / cover / preview fetch from sources |
| Frame (FFmpeg) | Cover / preview generated by extracting frames from video with ffmpeg |
| Intro Excel | User-maintained Excel sheet, authoritative categorization source |
| Cloudflare blocking | Source site's 403 response for high-frequency IPs |

### 11.2 Key Files Index

- Smart fetch hub: `src/main/lib/javdb-smart.ts`
- Reconcile core: `src/main/lib/reconcile.ts`
- Sheet parsing: `src/main/lib/excel.ts`
- Full IPC list: `src/shared/ipc.ts`
- Type definitions: `src/shared/types.ts`
- UI entry: `src/renderer/src/App.tsx`
- Source modules: `javdb.ts / javbus.ts / javinfo.ts / javapi.ts / javlibrary.ts`

---

:*End of document. This PRD covers all features present as of v2.7.0. New requirements should be appended to Section 10 Roadmap and reviewed.*
