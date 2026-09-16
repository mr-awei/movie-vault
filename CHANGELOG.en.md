# Changelog

All notable changes to Yinghai (Movie Vault) are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

Change types: `Added` / `Changed` / `Fixed` / `Removed` / `Security`.

> Note: releases before 2.7 have been condensed into a thematic "Version history" overview, keeping only what is still relevant to the current codebase. The authoritative structure and interfaces are described in [TDD.en.md](./TDD.en.md).

---

## [2.10.0] - 2026-09-16

**Deep-review P0+P1 all done: security hardening + performance + architecture refactor**

### Security (P0)
- **Single-instance lock**: second launches yield to the first; no duplicate scans or concurrent DB writes
- **lm:// protocol allowlist**: isLmAllowedPath validation, invalid paths get 403
- **Playback progress persisted every 10s** with lastSaveAt tracking; PotPlayer handoff entries are not written

### Performance (P0/P1)
- **Home rankings via top-N min-heap**: O(N·log14) instead of full sorts; fixed high-score items being filtered out before sorting
- **ListView virtualization with fixed row height**; EntryCard memo narrowed to [libraryId] + reconcileRef
- **ffmpeg/ffprobe paths cached at module level**; watch stats use SQL aggregation instead of full listVideos

### Architecture (P1)
- **fetch-meta source-table driven**: five sources (moviedb/omdb/openlibrary/justwatch/wikipedia) share one SOURCES config and runSingleSource; auto-disable after 3 consecutive failures
- **SettingsModal split** (1634 → shell + SettingsSections with 8 category components)
- **VideoDetail split** (1121 lines → 9 sub-components)
- Earlier: full SQLite migration, Zustand state migration, IPC split by domain

### Fixed (P0/P1)
- **Proxy auth**: embedded user:pass in proxyRules is ignored by Chromium; moved to app.on('login')
- **Watcher jitter**: MutationObserver scoped to the container itself; wall re-measure on theme/density change
- **i18n**: 18 hard-coded Chinese strings moved to keys (zh/en)

## [2.9.2] - 2026-09-16


**Export Excel improvements + Reconcile dialog spec buttons + poster consistency fix**

### Added
- **Reconcile dialog spec buttons**: Step 2 now has "View full spec" and "Reveal spec file location" buttons, consistent with the onboard sheet wizard
- **Related recommendation hover tags**: Hovering related recommendation cards shows gradient overlay + movie tags (brand-colored chips)
- **Export Excel cell styling**: All content horizontally + vertically centered with text wrap; switched to xlsx-js-style for style support

### Changed
- **Export Excel headers**: Expanded from 6 to 9 columns (ID/Title/Year/Category/Rating/Synopsis/Theme/Region/Series), matching reference format
- **Export Excel column widths**: Title column auto-fits longest title (CJK chars count as 2 width) + 6 char padding; other columns have reasonable widths
- **Related recommendation info**: Shows title + year + rating below poster, no longer poster-only

### Fixed
- **Poster inconsistency**: Home hero/list cards showed ffmpeg frame captures while detail page showed correct poster. Root cause was resolveEntryPoster priority (frame capture ranked above detail cover). Fixed to "manual poster > detail cover > frame capture > posterPath", unifying posters across the app
- **Export Excel no file generated**: XLSX.writeFile unreliable in Electron main process, switched to XLSX.write + writeFileSync; added detailed console logs for debugging
- **List page hover preview obscured**: z-index increased from 70 to 9999, card hover z-index boosted
- **Duration badge overlaps hover preview**: Duration badge auto-hides when hovering card
- **Reconcile dialog JSX structure error**: Missing div closing tag caused HMR 500 error, preventing code updates

## [2.9.1] - 2026-09-16

**Video card duration badge readability fix**

### Fixed
- Duration badge unreadable on light/dark posters: after multiple iterations, final solution uses semi-transparent black background (60%) + backdrop blur + white text + black text-shadow + compact sizing, ensuring readability on any poster without looking obtrusive

## [2.9.0] - 2026-09-16

**Full playlist feature + hierarchical tag splitting + sidebar state persistence**

### Added
- **Full playlist feature**: create/delete/rename, right-click add to playlist, detail page "Add to Playlist" button, playlist view action bar (Add/Remove videos, Play All), drag-to-reorder, multi-select delete, added-video indicator
- **Hierarchical tag auto-splitting**: "古装/欲望/夫妻" automatically splits into three independent tags. Both filter panel and detail page use split tags; clicking a sub-tag filters all videos containing that tag
- **Sidebar state persistence**: expand/collapse state of each section (Library/Filter/My Lists/Playlists/Pending) and scroll position within each section are saved to localStorage and restored on next launch
- **Duplicate detection moved to top toolbar**: common feature elevated next to Scan Library, hover shows tooltip

### Changed
- **Sidebar layout**: Playlists and My Lists moved from before Filter to after Filter
- **Sidebar default state**: Filter expanded by default, all other sections collapsed
- **Tag button style**: increased spacing, borders, optimized width for more tags per row
- **Removed Boxset/Collection feature**: duplicated with Playlists, removed per user request

### Fixed
- Numerous playlist bugs: no file selection after create, playlist showing all videos, empty playlist cannot add files, occasional input field unresponsive, selection cancels immediately, play button unresponsive, PotPlayer no resume playback, Sidebar playlists undefined crash, etc.
- Overlapping dialogs
- Excess blank space below collapsed Filter section

## [2.8.6] - 2026-09-15

**Excel sheet as single source of truth + preview frame algorithm rewrite + multiple UX fixes**

### Added
- **Excel sheet as single source of truth**: the sheet's "Year", "Region" and "Series" columns are now formally ingested. Fields present in the sheet take precedence; only missing fields are fetched from online data sources. The detail page now shows Region, and Series prefers the sheet value.
- **Local folder name as canonical title**: all data-source searches, poster fetches, fallback fetches and progress displays now prefer the local folder name (folderName). Renaming a folder automatically syncs the library.

### Changed
- **OMDb search reworked**: prefers the `t` parameter for exact-title search (never returns "Too many results"), falling back to `s` + year. Short Chinese queries are skipped early with a clear message.
- **Merged overlays**: the bottom-left "fetch progress" and bottom-right "scanning library" panels are merged into one unified progress panel with a collapsible log area.
- **Drag-to-reorder restored**: data-source drag reordering is now available in all modes (previously only shown in auto mode).
- **Wikipedia plot extraction**: now extracts the "Plot" section body instead of the page lead summary, compatible with 10 section-name variants (Plot / Synopsis / Story / 劇情 etc.).
- **Preview frame 2.0 randomization**: sample timestamps get ±70% random jitter, and each time segment randomly picks from its top 3 candidates, ensuring every re-capture produces different frames.

### Fixed
- **Excel title column misdetected**: when the first column was "No." (编号), it was mistaken for the title column, so "001"/"002" were used as movie names to match files — everything showed as "unlisted". Now prefers "Title"/"片名" columns, with "No." only as fallback.
- **Synopsis not refreshed after URL update**: detail page rendered synopsis from props instead of local state, and backfillFromDetail didn't copy description. Both fixed.
- **Re-capture produces identical frames**: frontend version-bump condition too strict + fully deterministic frame selection + ffmpeg output-seeking timeouts causing corrupt frames. All three layers fixed.
- **Corrupt preview frames**: output seeking was too slow, causing later frames to time out under 8-way concurrency. Reverted to input seeking, lowered concurrency to 4, raised timeout to 60s, and no longer deletes old frames upfront.
- **Wheel event error**: the lightbox wheel-nav used React onWheel (passive by default), calling preventDefault threw errors. Switched to addEventListener({ passive: false }).
- **"Set as cover" reports invalid**: path validation only allowed the posters/ directory, but preview frames live under preview-frames/, so every attempt was rejected. Both cache directories are now allowed.

---

## [Unreleased]

### Fixed
- **Repository links** — the About dialog's GitHub / Gitee / license links and the update-check repository path were corrected from `yinghai-movie-vault` to the actual repository `mr-awei/movie-vault` (previously causing 404 links and failing update checks). The publish script and GitHub Actions workflow URLs were corrected as well.
- **CI packaging failure (mismatched certificate and guard filenames)** — the signing step referenced `build/yinghai-sign.pfx` while the repository only contained the YingXia-era `build/yingxia-sign.pfx`, so electron-builder aborted immediately. For the same reason the uninstall guard `build/yinghai-uninstall-guard.ps1` referenced by `electron-builder.yml` / `installer.nsh` did not exist, so it was never bundled (uninstalling and ticking "delete user data" reported a missing protection script and kept the data). Now: Yinghai generates and uses **its own** certificate `build/yinghai-sign.pfx` (`CN=影海 yinghai`, thumbprint `50BAB905D077C2FA950CE0317D32624630451F9B`, password via the GitHub secret `CERT_PASSWORD`); YingXia's `yingxia-sign.pfx` is preserved untouched; the guard script has a same-named copy (identical content); `.gitignore` keeps exceptions for both certificates.
- **`scripts/gen-cert.ps1` could not run at all** — it was saved as UTF-8 without BOM, so Windows PowerShell 5.1 decoded the Chinese text as GBK, breaking quoting and the whole script failed to parse. It is now saved as UTF-8 with BOM, and `scripts/sign.cmd` now points at Yinghai's certificate thumbprint.

---

## [2.8.0] - 2026-09-14

**File locking, self-healing data, and a standardized documentation set**

### Added
- **File lock** — lock any number of titles; both normal and force batch enrichment skip them, while the detail page can still refetch manually. Lock toggles are available on the card hover actions, the context menu and the detail page.
- **Multi-select batch lock** — a selection mode on the browse page with "select all / invert / clear" and "lock selected / unlock selected"; the action bar shows the live selection count.
- **Skipped-file report** — after each batch run a modal lists every skipped file with its reason (locked / file missing), with per-item detail access and "unlock all".
- **Runtime hint** — the progress panel now shows "N locked skipped in this batch" while a job runs.
- **Batch lock IPC** — new `video:lockMany` that persists in a single write instead of one full `data.json` write per item.
- **General Movie Scoring & Synopsis Standards v2.0** (bilingual, bundled with the app): weighted 10-dimension scoring, nine rating bands, anchor calibration, a comparison of major rating systems, a four-beat synopsis and tag vocabularies.
- **Technical Design Document** (bilingual): architecture, modules, IPC reference, storage design, key flows and security design.
- **Publishing Guide** (bilingual): versioning, build and signing, CI release, rollback.

### Changed
- **Unified display title** — a single `displayTitle()` helper (meta title → title → filename → entry name) is now used by the home hero, poster wall, lists, detail page, search and sort.
- **Unified search query** — single-item, batch, poster and background enrichment all prefer the updated title instead of the original filename.
- **Fetch log** — the log overlay is cleared when a batch job starts, so it only reflects the current run.
- **Documentation naming standardized** — Chinese docs keep Chinese filenames (`产品需求文档.md` / `技术设计文档.md` / `交接文档.md` / `发布说明.md` / `更新日志.md`), English docs use `*.en.md`; developer guides and topic docs live under `docs/`.
- **Documentation overhaul** — README / PRD / TDD / HANDOFF / PUBLISHING / CHANGELOG rewritten to industry conventions and kept in sync across both languages, with legacy content removed.
- **Sheet wizard aligned** — the wizard prompt and dialog copy now follow the new rubric (ten weighted dimensions, nine bands, four-beat synopsis and don'ts).
- **About dialog** — product description aligned with the actual implementation (dark / light / system themes).

### Fixed
- **Lock state overwritten** — scan / reconcile batch writes no longer clear user locks (when the writer does not explicitly carry `locked`, the existing value is preserved).
- **Locked items still fetched** — an extra defensive skip inside batch workers, so a lock applied mid-run also takes effect.
- **Stale records accumulating** — scanning now purges records whose file no longer exists, so the record count matches the files on disk.
- **Wasted requests** — batch enrichment skips records whose file is missing and reports them in the result.
- **"Update from URL" timeout** — timeouts now return a friendly message instead of raising an uncaught exception in the main process.
- **Detail page cast section** — capped height with scrolling; fixed mismatched colour-block/photo sizing and duplicate React keys for same-named cast members.
- **Filename conventions** — English documents no longer use Chinese filenames; non-ASCII filenames removed from the repository.

---

## [2.7.0] - 2026-09-09

### Changed
- **License switch** — from MIT to the "Yinghai Dual License v1.0"; `LICENSE` fully replaced with bilingual terms (non-commercial free use, malware prohibition, commercial license, rights reserved, disclaimer). The original MIT license is kept as `LICENSE.mit.backup`.
- **Documentation overhaul** — README / PRD / HANDOFF / PUBLISHING / CHANGELOG and topic guides fully rewritten and kept in sync across both languages.

### Added
- **In-app license modal (`LicenseModal`)** — the About footer gains a "Yinghai Dual License v1.0 · View License" entry that shows the full bilingual text in-app, following the UI language, with no external browser.
- **One-click copy of the commercial contact** — the modal footer shows `new_mr_awei@163.com`; clicking copies it with a confirmation.
- **i18n** — new `about.viewLicense` key.

### Fixed
- The About dialog license entry now opens the in-app modal; `about.ts` names and links point at the repository `LICENSE`.

---

## [2.6.7] - 2026-09-02

### Changed
- **Uninstall flow consolidation** — "Uninstall" in Settings is now a single flow: an in-app confirmation chooses "keep data" or "delete data" in one step, passed to the NSIS uninstaller by parameter, skipping the standard welcome and retention pages.

### Fixed
- Fixed an NSIS build failure caused by a redundant `!undef` referencing an undefined macro in `build/installer.nsh`.
- Fixed "unable to clean up user data, data kept": the uninstall guard script is now saved as **UTF-8 with BOM**, avoiding parse failures under the default GBK code page on Chinese Windows.
- The guard script now declares `param([string]$DataDirOverride)` so the argument passed by NSIS binds correctly.
- Lingering processes are terminated before deleting user data, releasing Electron cache / Storage file locks.
- Deletion retries increased 3 → 5 with a 800ms → 1.2s wait; the failure message now lists likely causes.

---

## [2.6.6] - 2026-09-02

### Added
- **Frame-extraction failure details** — both the post-run toast and the detail-page preview block show the failed count, a de-duplicated reason list and actionable hints.
- **Sheet wizard aligned with the real schema** — prompt headers now match the actual structure, plus a "category system" paragraph.

### Changed
- **Tag layering fix** — source genre tags are stored in a dedicated backup field, displayed separately from document tags.
- **Catalog category column** — the category value flows into its own field instead of leaking into tag groups.
- **Genre sanitisation** — a shared cleaner strips numeric suffixes, brackets and pure separators.
- Hover-to-zoom delay unified at 1s.
- Detail-page auto framing now uses the same full multi-frame pipeline as the manual "Re-frame" action.

### Fixed
- Fixed the genre parser matching cast groupings instead of real genres.
- Fixed inconsistent display between document tags and backup tags.

---

## [2.6.5] - 2026-09-01

### Added
- **Manual query / ID input** — a prompt appears automatically when recognition fails, plus a permanent toolbar entry to correct mis-attributed metadata at any time.
- **Rename file with the title** — `EditMetaModal` offers a "rename file on save" toggle (on by default) backed by the new `video:renameFile` IPC and a safe base-name generator (illegal characters stripped, reserved names prefixed, length capped). A failed rename never loses metadata, and the video id is kept stable so covers and previews stay linked.

### Fixed
- Fixed "data.json modified externally" log spam: self-write detection is skipped while a write is in flight and the mtime baseline is refreshed after reload.
- Improved query extraction robustness, reducing wasted requests.

---

## [2.6.0] – [2.6.4] - 2026-09-01

### Added
- In-app update check (GitHub / Gitee) with configurable frequency and release notes.

### Fixed
- Fixed an installer crash caused by mixing a custom language dialog with window detection; switched to the native language selector.
- Installer and uninstaller text now follows the language chosen during installation.

---

## [2.5.0] – [2.5.1] - 2026-09-01

### Added
- Structured tags (grouped by spreadsheet column) displayed separately from backup tags.

### Fixed
- Fixed display inconsistencies caused by tag merging logic.

---

## [2.3.0] – [2.4.9] - 2026-08-30 – 2026-09-01

### Added
- **Virtualized poster wall** — constant DOM size keeps large libraries smooth.
- **Controllable batch jobs** — configurable concurrency / interval with pause / resume / stop and failure retry.
- **Better frame extraction** — random multi-point sampling with quality scoring (rejects black / white / blurry / monotone frames), plus preview sets and "set as cover".
- **Statistics panel** and home recommendations (hero / daily / cross-library random).

### Changed
- Catalog and file reconciliation merged into a single "Scan library" action with one continuous progress run.

### Fixed
- Fixed UI stalls and write deadlocks on large libraries.
- Fixed settings not persisting, reconcile hanging, and inconsistent cover fallback.

---

## [2.0.0] – [2.2.14] - 2026-08-29 – 2026-08-30

### Added
- Library creation (video root + Excel catalog), scanning and reconciliation.
- Poster wall with three densities, hover synopsis, grid / list switching, search and multi-facet filtering.
- Five-source automatic fallback for covers and details, cached locally forever.
- Privacy shield, deletion lock (salted SHA-256), recycle-bin deletion, uninstall retention guard, proxy configuration.
- Bilingual UI (zh-CN / en-US), theme and density settings.

### Changed
- Storage schema gains a version number and startup migration, remaining compatible with older `data.json`.

---

## Version history

| Phase | Theme |
| --- | --- |
| v2.0 – v2.2 | Setup, reconciliation, poster wall, basic enrichment |
| v2.3 – v2.4 | Large-library performance (virtual scrolling), controllable batch jobs, frame quality |
| v2.5 – v2.6 | Tag layering, catalog matching, update check, uninstall flow |
| v2.7 | Dual license, in-app license modal, documentation overhaul |
| v2.8 (in progress) | Richer file locking, self-healing stale data, search experience |
