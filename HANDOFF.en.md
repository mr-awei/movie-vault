# YingXia (yingxia-video-manager) — Project Handoff

> For the AI / developer who takes over this project. One-sentence summary: **local video management tool**, poster-wall library, auto metadata fetch, sheet-driven categorization, local playback.
> Current version **v2.2.10** (2026-08-30). Repo: `E:\moviemanger`, dual remotes (GitHub + Gitee).

---

## 1. Project Positioning

An **Electron desktop app** (Windows-first) that manages the user's local adult video collection (~84 titles, `E:\新建文件夹`).

Core capabilities:
- Scan local videos → identify video codes (like `SONE-560`) → fetch metadata (title / cover / actors / tags / rating) from 5 sources
- Read the user's **Excel sheet** (`收藏整理_2026.xlsx`) as the authoritative categorization source: group by column into categories, recommended rating, tags
- Poster wall UI: hover to see description, click for detail, open with local player, ffmpeg frame previews
- Privacy shield (one-click blur all previews), deletion lock, global random, batch completion

**User profile**: single-user, Windows 10/11, cmd.exe terminal, AI authorized to fix environment issues directly; likes "small steps fast" and **problems must be visible** (never hide errors).

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Desktop | Electron 31 + electron-vite 2.3 |
| Frontend | React 18 + Tailwind 3 + TypeScript |
| Data | `data.json` (JSON file persistence, no database) |
| Network | undici fetch + socks proxy support |
| Excel | xlsx (SheetJS) 0.18.5 |
| Packaging | electron-builder 24 (NSIS installer, self-signed pfx) |
| ffmpeg | Frame extraction / tech detection (system-installed, see build/ffmpeg comment) |

**Build scripts**: `npm run dev` (dev) / `npm run build` (build) / `npm run pack` (build + electron-builder)

---

## 3. Directory Map

```
E:\moviemanger\
├── src/
│   ├── main/            # Electron main process
│   │   ├── index.ts     # entry: register lm:// protocol, main log to disk, window
│   │   └── lib/         # core business logic (below)
│   ├── preload/         # safe bridge (exposes window.api)
│   ├── renderer/src/    # React UI
│   │   ├── App.tsx      # global state + routing + Toast + fetch overlay
│   │   └── components/  # Toolbar / EntryCard / VideoDetail / SettingsModal / ...
│   └── shared/          # cross-process shared
│       ├── types.ts     # Video / Settings / JavdbDetail / ScanProgress
│       ├── code.ts      # code extract / normalize (extractCode / extractBaseCode)
│       ├── ipc.ts       # IPC channel constants
│       └── api-types.ts # IPC return types
├── scripts/             # pack.mjs / sign.cmd / publish-release.mjs / publish.mjs
├── build/               # icon.png / yingxia-sign.pfx (self-signed cert) / ffmpeg (commented bundling)
├── CHANGELOG.md         # version history (user-visible)
└── electron-builder.yml # packaging config
```

### src/main/lib Key Files (by importance)

| File | Responsibility |
|---|---|
| **javdb-smart.ts** | ⭐ **Smart fetch hub**: `fetchDetailSmart` (5-source metadata fallback) + `fetchPosterSmart` (5-source poster fallback) + `SmartFetchState` (consecutive failure counter) + `DEFAULT_SOURCE_ORDER` |
| **reconcile.ts** | ⭐ **Reconcile core**: read Excel sheet → match files → produce categorized entries; auto metadata fetch fallback when no sheet; v2.2.5 added cleanupDeadPreviewPaths |
| **excel.ts** | Excel sheet parsing (`parseIntroExcel`, **must use buffer path**, see Pitfall #1) |
| **ipc.ts** | All IPC handlers: scan / reconcile / fetch / delete / rename / poster / settings |
| **javdb.ts** | JavDB search + detail + image cache (searchJavdb / fetchJavdbDetail / cacheRemoteImage) |
| **javbus.ts / javinfo.ts / javapi.ts / javlibrary.ts** | The other 4 sources (detail fetch, internally downloads cover locally) |
| **repo.ts / store.ts** | `data.json` read/write (store is generic persistence, repo is business layer) |
| **scanner.ts** | Scan video files (walk + code extraction) |
| **images.ts** | ffmpeg frame extraction (generatePreviewSet), poster resolution |
| **player.ts / proxy.ts / rename.ts / torrent.ts / ffprobe.ts / runtime.ts** | Player / proxy / batch rename / seed folder / tech probe / runtime |

---

## 4. Core Data Flow

```
[Scan] walk(library directory)
  → [Reconcile reconcile.ts]
      → find Excel sheet (library.introExcelPath or auto-scan library root)
      → parseIntroExcel(buffer) → IntroDoc{items, tagCategories}
      → ensureVideo() for each file → match sheet keyMatches → categorized entries
      → when no sheet: fetchDetailSmart auto metadata fetch (background async)
      → cleanupDeadPreviewPaths (clean orphan preview paths)
  → write back to data.json (store.mutate / repo)
  → renderer displays (HomeView / BrowseView / detail page)
```

**Source fetch chain** (v2.2.4+ unified in javdb-smart.ts):
```
fetchDetailSmart(code, settings, state, onEvent?)
  → settings.dataSource === 'auto'
      → order = settings.customSourceOrder ?? DEFAULT_SOURCE_ORDER
      → try each source in order: javapi → javinfo → javdb → javbus → javlibrary
      → return { detail, source } on first hit
      → all fail → { detail: null, error: "javapi=skipped; javinfo=skipped; ..." full summary }
  → single-video completion (videoFetchJavdbDetail) / batch completion (libraryFetchJavdbAll) / reconcile fallback all go through here
```

**Live fetch process in UI** (v2.2.10): 4th arg `onEvent` of fetchDetailSmart emits per-source status → `ScanProgress.fetchEvent` → bottom-right FetchLogOverlay shows "JavDB failed → falling back to JavBus".

---

## 5. Source System Deep Dive (Most Recently Modified)

| Source | Characteristics | Config |
|---|---|---|
| javapi | Self-hosted (free, no anti-bot, most complete) | settings.javapiUrl + javapiKey |
| javinfo | Aggregator API (no scraping) | settings.javinfoKey (register at app.javinfo.dev) |
| javdb | Rich info but Cloudflare-blocked (occasional 403) | settings.javdbCookie (optional) |
| javbus | Medium info, Cloudflare, needs age-gate bypass | none (auto ensureJavBusAgeCookie) |
| javlibrary | Lightweight, last resort | none |

**Key mechanisms**:
- `customSourceOrder`: Settings field (added in v2.2.1), SettingsModal drag-to-reorder (UI exposed in v2.2.6)
- `SmartFetchState`: any source failing 3 consecutive **network errors** (not "no result") → disabled for this batch; JavBus failing 3x → `state.stop` entire batch stops (avoid spinning)
- `fetchDetailSmart` auto mode: `srcResults[]` records each source status, final error is 5-source summary (v2.2.6 fix for misleading error messages)
- `fetchPosterSmart` (v2.2.8): poster fetch also falls back by customSourceOrder (fixed bug where fetchJavdbPosterForVideo always hit JavDB)

---

## 6. Version History (What v2.2.x Did, Why)

| Version | Core Change | Why |
|---|---|---|
| v2.2.0 | Drop markdown intro sheets, confirm source order, privacy lock delete password | Major refactor |
| v2.2.1 | customSourceOrder field + CI signing fix | User wanted custom ordering |
| v2.2.2 | Code parsing enhancement (domain prefix hdd800.com@xxx, `_` normalization, letter suffixes) | Matches failing |
| v2.2.3 | autoFindIntroExcel scans root xlsx + used-set dedupe | User's "listed but says unlisted" |
| v2.2.4 | **XLSX.readFile Chinese-path bug** + sheet-exception dialog + fallback metadata fetch + fetchDetailSmart module extraction | 84 videos all "uncategorized" |
| v2.2.5 | lm protocol ENOENT silent + cleanupDeadPreviewPaths | Console flooded with errors |
| v2.2.6 | fetchDetailSmart error-message completion + SettingsModal drag-to-reorder UI | User thought it didn't try other sources |
| v2.2.7 | UI text follows customSourceOrder | Dragged order but text didn't update |
| v2.2.8 | fetchPosterSmart (poster fetch also respects custom order) | "Did the real fetch order actually change?" |
| v2.2.9 | Main process console.log written to disk + [smart] summary log | User can't see background logs |
| v2.2.10 | **Live fetch process overlay** (bottom-right) | "I should see the fallback in the UI" |

**Current user state** (measured from `data.json`): 84 videos, 80 already have javdbDetail (source all javbus — JavDB continuously blocked by Cloudflare), customSourceOrder stored as `["javdb","javbus","javapi","javinfo","javlibrary"]`.

---

## 7. Dev / Build / Release

### Dev
```
npm run dev        # electron-vite dev (HMR only updates renderer; restart to change main)
```
⚠️ Dev mode main process console output goes to terminal; since v2.2.9 also written to `%APPDATA%\影海\logs\main.log`.

### Build + Sign
```
npm run pack       # build + electron-builder → C:\Users\19218\yingxia-release\<timestamp>\YingXia Setup <ver>.exe
```
Signing (self-signed pfx, cert fingerprint `2818B2F69CAD337604F42DEFC7B5A3C3696F02AC`):
```
"C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign /sha1 <TP> /fd SHA256 /tr http://timestamp.sectigo.com /td SHA256 "<installer>.exe"
```
⚠️ Timestamp server (Sectigo) may return 503 — network issue. Retry later or skip timestamp (unsigned installer still installs).

### Publish (GitHub Release)
```
GITHUB_TOKEN=<token> TAG=v2.2.x TITLE="YingXia v2.2.x" ^
INSTALLER_PATH="C:/Users/19218/yingxia-release/<ts>/YingXia Setup <ver>.exe" ^
node scripts/publish-release.mjs
```
- ⚠️ **token must come from env var** (GitHub Push Protection rejects commits with hardcoded tokens — hit in v2.2.5)
- Use node https instead of curl (curl reads HTTP_PROXY env var, can get `000` when proxy dies; node direct-connect works)
- Gitee single-file 100MB limit → Gitee Release only hosts source zip (consistent pattern since v2.2.4)

### Git Dual Push
```
git push origin main && git push origin v2.2.x
git push gitee main && git push gitee v2.2.x
```
⚠️ origin pushurl is configured as dual-push to both Gitee+GitHub; one side fails → whole push fails. Gitee `non-fast-forward` use `--force-with-lease` (user manually handled once in v2.2.10).

---

## 8. Known Issues / Todo (Handle First After Taking Over)

### 🔴 High Priority Todo
1. **Doc tag layering** (only one of the 3 user requirements not done):
   - User requirement: "use doc-defined tags as primary; tags fetched from sources collapse into a single row (expandable) as secondary display"
   - Current state: `backfillFromDetail` (ipc.ts ~L150) merges `v.tags` + `detail.genres` into one array — no layering
   - Plan (written in v2.2.7):
     - Video gains `tagCategories?: Record<string, string[]>` (stores Excel original structured tags — parseIntroExcel already has IntroItem.tagCategories data)
     - Video gains `backupTags?: string[]` (stores source genres, separate field, no merge)
     - reconcile if(doc) branch writes tagCategories; backfillFromDetail writes backupTags only
     - VideoDetail page: primary tags row + collapsible "backup source tags"
   - Note: involves data migration, reference v2.2.5 ENOENT lesson — **handle orphan references when changing data structure**

### 🟡 Low Priority
2. **Timestamp signing**: v2.2.10 was signed without timestamp (Sectigo 503). Re-sign after network recovers
3. **gitee remote plaintext token**: `.git/config` gitee URL contains token (`mr-awei:56c852...`). Suggest `git remote set-url gitee https://gitee.com/...` to clear (uses Windows Credential Manager)
4. **ffmpeg bundling**: electron-builder.yml build/ffmpeg bundling is commented out (directory doesn't exist when local packing). New machines need system-installed ffmpeg or restore bundling
5. **JavDB anti-bot**: user IP is Cloudflare-403ed, v2.2.x fully relies on javbus fallback — if user wants javdb, they need to switch IP / node or configure Cookie

### 🟢 Known Tech Debt
- `fetchMovieDetail` wrapper in ipc.ts (internally calls fetchDetailSmart), kept only for backward compatibility with old callers
- `renderer-console.log` + `logs/main.log` dual log files (renderer uses JSON lines, main uses text lines)
- `src/shared/tagCategories.ts` exists (residue from before v2.2.0 dropped md? unconfirmed if still used)

---

## 9. Pitfalls & Lessons (Codebase-Specific, Must Read)

1. **XLSX.readFile Chinese-path silent failure** (root cause of v2.2.4): `XLSX.readFile('E:\新建文件夹\xxx.xlsx')` throws `Cannot access file`, but returns null which gets caught → user sees 84 videos all "uncategorized". **Must** use `fs.readFile()` + `XLSX.read(buf, {type:'buffer'})`. Already fixed in excel.ts — don't revert.
2. **lm:// protocol ENOENT spam** (v2.2.5): poster/preview files deleted but `data.json` still holds paths → 15 ENOENT per render. Fixed: silent ENOENT + reconcile cleanup. **When adding new fields that reference files, remember to clean orphans.**
3. **fetchDetailSmart extracted twice lesson** (v2.2.4 / v2.2.6): when extracting a function, grep ALL callers, **migrate all before deleting old** — v2.2.4 only moved the function, not `fetchMovieDetail`, leading to two separate logic paths.
4. **Error messages must reflect the full process**: users infer what happened from the error text alone. v2.2.6 changed auto-fallback error to 5-source full summary ("javapi=skipped; javdb=no-result; ...").
5. **Codex sandbox firewall rules** (root cause of 2026-08-30 network outage): `Get-NetFirewallRule` shows `codex_sandbox_offline_block_outbound` (Block Any Any) that blocks all outbound traffic. If network "dies", check this first.
6. **curl 000 ≠ truly down**: curl reads HTTP_PROXY env var, returns 000 when proxy node dies; node https / git push / PowerShell each use their own stack. node scripts are most reliable for publishing.
7. **Main process console not written to disk**: renderer console handled by attachRendererLog listening on webContents.console-message; main's own console goes to terminal (v2.2.9 now also hijacked to write logs/main.log).
8. **Windows terminal is cmd.exe**: use `cd /d` and `\` backslash, avoid PowerShell syntax.
9. **GITHUB PUSH PROTECTION**: never hardcode tokens in repo files (hit in v2.2.5, push rejected).
10. **Timestamp server 503**: Sectigo/DigiCert may be unreachable during pack-sign. Can sign without timestamp first.

---

## 10. User Preferences (How We Work Together)

- Chinese conversation, concise and direct
- **Small steps fast**: break big tasks into small steps, execute one at a time, don't get stuck in discussion
- Problems must not be hidden: missing / parse-failed / fallback process must all be visible (dialog, Toast, overlay, log)
- AI authorized to fix local environment issues directly, no step-by-step confirmation needed
- User may interrupt and redirect when progress stalls; prefers fast action

---

## 11. Quickstart Checklist (AI Taking Over — First Steps)

1. Read this file + `CHANGELOG.md` (version history) + `src/main/lib/javdb-smart.ts` (smart fetch hub)
2. `npm run typecheck` to confirm 0 errors, `npm run build` to confirm build succeeds
3. When user reports an issue, check `%APPDATA%\影海\logs\main.log` + `%APPDATA%\影海\renderer-console.log` + `%APPDATA%\影海\data.json` (settings / videos status)
4. Changed main process → remind user to restart dev; changed renderer → HMR takes effect
5. Publish: npm run pack → sign → publish-release.mjs (token via env var)
