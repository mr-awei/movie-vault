# Changelog

All notable changes to Yinghai (Movie Vault) are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

Change types: `Added` / `Changed` / `Fixed` / `Removed` / `Security`.

> Note: releases before 2.7 have been condensed into a thematic "Version history" overview, keeping only what is still relevant to the current codebase. The authoritative structure and interfaces are described in [TDD.en.md](./TDD.en.md).

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
