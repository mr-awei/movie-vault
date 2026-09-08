# Changelog

## v2.7.0 (2026-09-09)

**License switched to dual license + in-app license modal + full documentation rewrite**

- **Open source license switched from MIT to "Ying Xia Dual License v1.0"**: The root `LICENSE` file has been fully replaced with a bilingual (Chinese/English) dual license, containing five chapters: Non-Commercial Free Use License, Malware Prohibition Clause (three-layer protection: anti-tampering/injection, anti-embedding into malware, anti-use with malware), Commercial Use License, Rights Reserved, and Disclaimer. Commercial license contact: new_mr_awei@163.com. The original MIT license is backed up as `LICENSE.mit.backup`.
- **New in-app open source license modal (`LicenseModal`)**: The About modal footer now has a "Ying Xia Dual License v1.0 · View License" button. Clicking it opens an in-app modal displaying the full bilingual license text (auto-switches with app language), no external browser needed.
- **One-click email copy in license modal**: The modal footer shows the commercial license contact email `new_mr_awei@163.com`; clicking it copies to clipboard with a "Copied!" confirmation.
- **About modal license entry changed to internal modal**: The footer license button previously opened an external opensource.org link; it now opens the in-app license modal. The license name in `about.ts` is updated to "Ying Xia Dual License v1.0 / 影匣 双授权协议 v1.0", and licenseUrl points to the repo LICENSE file.
- **New i18n key `about.viewLicense`**: Chinese "查看开源协议", English "View License".
- **PRD updated to v2.7.0**: Doc version, product version, and date synchronized; evolution history adds v2.7.0 phase.
- **README fully rewritten (bilingual)**: `README.md` and `README.zh-CN.md` completely rewritten with updated license statement, feature highlights, tech stack, etc.
- **package.json license field updated**: `license` changed from `"MIT"` to `"影匣 双授权协议 v1.0"`.
## v2.6.7 (2026-09-02)

**In-app uninstall flow consolidation + uninstaller robustness fixes**

- **In-app uninstall confirmation merged with "keep / delete user data" into one flow**: Clicking "Uninstall YingXia" in Settings now opens an in-app confirm modal (`UninstallConfirmModal`) where you decide "keep data" or "delete data" in a single step. The choice is passed to the NSIS uninstaller via `/YXKEEPDATA` / `/YXDELDATA`, which skips the standard welcome page and the separate "keep user data" checkbox page. Previously these were two separate flows with multiple dialogs.
- **Fixed NSIS build failure (warning 6155 treated as error)**: In `build/installer.nsh`, `MUI_UNPAGE_WELCOME` already consumes and `!undef`s `MUI_PAGE_CUSTOMFUNCTION_PRE`; the redundant manual `!undef` referenced an undefined macro and raised `!undef: "MUI_PAGE_CUSTOMFUNCTION_PRE" not defined!`. Removed the redundant line; packaging passes again.
- **Fixed "Unable to clean up user data, data kept" during deletion**: The guard script `build/yingxia-uninstall-guard.ps1` was saved as UTF-8 without BOM. On Chinese Windows (default GBK codepage) PowerShell parsed it as GB2312, misreading Chinese bytes as extra line breaks / symbols, so the script failed to parse and exited 1, causing NSIS to keep the data as a fallback. Now saved as UTF-8 **with BOM**.
- **Guard script now accepts the NSIS-passed argument**: The script previously had no `param()` block, so the `-DataDirOverride` argument passed by NSIS could not bind and errored out. Added `param([string]$DataDirOverride)` and prioritize that value.
- **Force-kill lingering processes before deletion to release file locks**: Before removing `%APPDATA%\local-video-manager`, the script now `Stop-Process` the still-running `local-video-manager` / `影匣` processes to release Electron cache / Storage locks, preventing `Remove-Item` from failing on a lock.
- **More robust deletion retries**: Retry count 3 → 5, per-retry wait 800ms → 1.2s; the `DELETE_FAILED` message now adds "the app may still be running or the folder is in use" as the reason.

## v2.6.6 (2026-09-02)

**Tag-layer fix + screenshot-failure details + Excel sheet wizard alignment + metadata cleanup**

- **Fix inconsistent `Source tags` display**: v2.6.5 merged `backupTags` conditionally — when genres overlapped with sheet tags, they were skipped; now all genres unconditionally land in `backupTags` so the detail page shows the full source-side category set.
- **Fix Excel Category column leaking into tag groups**: `excel.ts` didn't skip the `分类` column, so AI-generated values like `【多人】2 / Drama` were split into tags and written into `tagCategories['分类']`. The Category column now flows through a dedicated `Video.introCategory` field and renders as a standalone MetaRow in the detail page.
- **Fix JavDB genres parser pulling actor groups**: The old regex `/href="\/actors\/xxx"/` matched actor groupings (`【多人】5`) instead of real categories. Corrected to `/tags/xxx`, and added a shared `cleanGenreName()` sanitizer (strips numeric suffixes, brackets, pure separators) used by all five sources: JavDB / JavBus / JavLibrary / Javinfo / Javapi.
- **Screenshot-failure details shown in two places**: After "Fetch info", both the corner toast and the in-page sample-image block display the failed count, a de-duplicated reason list, and actionable hints. The front-end translates reason codes (`http-403`, `timeout`, `network`, …) — toast and UI share the same mapping.
- **Unified hover-to-zoom delay to 1 s**: `VideoDetail` sample cards and `EntryCard` preview cards now wait 1 s before opening the zoom overlay (up from 350 ms).
- **Align auto framing with manual framing**: When a detail page opens with no previews, the app now calls `videoGeneratePreviews` — the same full multi-frame pipeline as the manual "Re-framing" button — instead of the old single-frame fallback.
- **Excel sheet wizard prompt aligned to the real schema**: Wizard prompt headers corrected from `Synopsis/Rating/Tags/Notes/CoverPath` to the real `Category/Rating/Synopsis/Theme/Role/Costume/BodyType/Behavior/Play/Scene/Plot/Other`, plus a "Category system" paragraph so AI picks the right single category value.
- **Store schema bump to `2026090204`**: On startup the migration peels `tagCategories['分类']` out into `Video.introCategory`, sanitizes dirty tags on both the doc and source sides, and logs counts for touched / peeled / cleaned entries.

## v2.6.5 (2026-09-01)

**Metadata backfill enhancement + code recognition improvements + title-to-filename sync + write-conflict fix**

- **Manual code input after failed backfill**: When "Backfill info" fails (typically "Cannot recognize a code from the filename/title"), a `ManualCodeModal` appears so you can type the code and retry. A persistent "Manual code" button in the toolbar lets you correct mis-attributed metadata anytime. Added `normalizeManualCode()` (strips extension/Chinese/【】, maps `.`/`_` to `-`, inserts `-` into `SSIS376`); all five sources plus `fetchDetailSmart`/`fetchMovieDetail` accept a `manual` passthrough flag, with `manual=false` behaviour fully unchanged.
- **Digit-prefixed codes now recognized**: Codes like `261ARA-394` / `476MLA-203` / `200GANA-1459` used to fail (the old logic required ≥2 letters before the dash). Added a 7th fallback regex `CODE_RE_DIGIT_PREFIX` (suffix limited to 2–5 digits to avoid phone timestamps, prefix must contain a letter, blacklist for `VOL-01`/`No.007`), used only when the first six steps all fail. Verified on 4665 titles with zero regressions and 31 newly recognized.
- **Filter pseudo-codes (`isPlausibleCode` guard)**: `IMG-8873` (camera file), `VID-…` (recording timestamp), `…-2160p` (resolution), `guochan2048.com@…` (ad domain), `[HEVC-1080p]` (codec tag) are no longer treated as codes and sent off as requests or attached to the wrong metadata. Hit entries are skipped to try the next candidate; also rescued `hhd800.com@FC2-PPV-1851398` → FC2-PPV-1851398 and `HD_sdnm-256` → SDNM-256, cutting pending fetches from 551 → 183 (67% fewer wasted requests).
- **Full FC2 code extraction**: `FC2-PPV-1510788` / `fc2ppv_1523314` / `FC2PPV-1123249-1` previously only extracted `PPV-1510788`, which sources could not find. A new highest-priority FC2 step returns `FC2-PPV-<id>` and allows episode suffixes (`_1`/`-2`); 84 of 86 titles corrected.
- **Editing a title can rename the file**: `EditMetaModal` now offers a "Rename file on save" toggle (default on) when the title changes, via new IPC `videoRenameFile` + `safeFileBaseName()` (strips illegal chars/trailing dots, prefixes reserved names like `CON`, truncates to 120 chars). A failed rename never loses metadata and keeps the dialog open with the reason. The video id is deliberately kept unchanged so covers/previews stay linked.
- **Fix "data.json modified externally" log spam (self-write misdetection)**: During heavy batch backfills, Windows high-concurrency renames made `fs.stat` mtime briefly differ from the recorded baseline, so the app flagged its own writes as external edits. The detection now skips while a write is in flight (`writeInFlight`) and refreshes the mtime baseline after reload.

## v2.6.4 (2026-09-01)

**Fix installer startup crash + switch to MUI native language selector**

- **Fix double-click installer no response / Program Compatibility Assistant TLS warning**: The root cause was mixing a custom `nsDialogs` language dialog with `FindWindow` running-app detection inside `customInit` (called during `.onInit`), which caused an NSIS runtime crash (exit code -1073741819 / 0xC0000005). Replaced the custom nsDialogs language picker with electron-builder's native `displayLanguageSelector` + `installerLanguages: ['zh_CN', 'en_US']`.
- **Installer language picker still limited to Simplified Chinese and English**: `installerLanguages` restricts MUI to loading only `SimpChinese` and `English` language files.
- **Uninstaller checkbox retained**: `customUnInstall` still uses an nsDialogs checkbox to ask whether to delete `%APPDATA%\local-video-manager`; unchecked by default. Dialog text follows the installer `$LANGUAGE`.
- **Installer running-app check retained**: Still detects the "影匣" window and prompts the user to close the app first, but no longer mixed with nsDialogs, avoiding the crash.

## v2.6.3 (2026-09-01)

**Installer language picker + uninstaller checkbox for data removal + English user notice without PRC laws**

- **Language selection at installer start**: The installer now shows an nsDialogs language picker with only two radio buttons — 简体中文 and English. Simplified Chinese is selected by default. The choice is persisted to `HKCU\Software\YingXia\InstallerLanguage` and used as the app's initial language on first launch.
- **English user notice without PRC legal clauses**: `UserNoticeModal` renders branch content by current locale; the English branch shows a general disclaimer, while the Chinese branch retains the PRC legal excerpts.
- **Uninstaller follows installer language**: The uninstaller reads `$LANGUAGE` set during installation and shows Simplified Chinese or English prompts accordingly.
- **Uninstaller checkbox for user data removal (unchecked by default)**: `customUnInstall` uses an nsDialogs checkbox to ask whether to delete `%APPDATA%\local-video-manager`. The checkbox is unchecked by default; deletion only happens if the user explicitly checks it.

## v2.6.2 (2026-09-01)

**Data-source metadata i18n fix + uninstaller optional data removal + pack output back to project release**

- **Data-source metadata follows current locale**: `SOURCE_META` (static object with `t()` called at module load) replaced by a `getSourceMeta()` function that re-reads translations on every render. English users previously saw Chinese three维度 labels like "Javapi 首选·无风险·免费". Also fixed `javdb.tier` accidentally pointing to `javinfo.tier`.
- **Fetch-logic note goes through i18n**: The detailed explanation under auto-mode source order was a hard-coded Chinese string; now uses `t('settings.network.fetchLogic')` with a full English translation added.
- **Uninstaller now offers optional AppData removal**: New NSIS `customUnInstall` hook shows a checkbox (unchecked by default) asking whether to delete `%APPDATA%\local-video-manager`. Only checked boxes trigger `RMDir /r`. Dialog language follows the installer language.
- **customInit skips language dialog during uninstall**: Added `!ifdef IsUninst` guard so uninstall does not re-run the installer's language picker and running-app check.
- **`scripts/pack.mjs` now outputs to `<project>/release` by default**: Dropped the legacy `~/yingxia-release/<timestamp>` hard-coded path (used to work around another IDE's file watcher locking app.asar) in favour of `electron-builder.yml`'s `directories.output: release`. Override remains via `YINGXIA_PACK_OUT=<absPath>`.

**Installer language picker trimmed to CN/EN + pack output back to project release/**

- **Installer language picker now shows only Chinese/English**: Replaced `MUI_LANGDLL_DISPLAY` (which pulled in 30+ unrelated languages) with a custom nsDialogs dialog featuring just two radio buttons — 简体中文 and English.
- **`scripts/pack.mjs` now outputs to `<project>/release` by default**: Previously hard-coded to `~/yingxia-release/<timestamp>` (a legacy workaround for another IDE's file watcher locking app.asar), it now respects `directories.output: release` from `electron-builder.yml`. Set `YINGXIA_PACK_OUT=<absPath>` to override when needed.

## v2.6.0 (2026-09-01)

**Multilingual Installer + Reliable Upgrade Path + Documentation Aligned**

- **Language selection at installer start**: The NSIS installer now shows a language dialog (Chinese Simplified / English) as its first step; the choice is persisted to the registry and applied as the app's initial interface language on first launch.
- **Uninstaller follows installer language**: The NSIS MUI uninstaller automatically uses the language chosen during installation; the "app is still running" prompt in the installer is also localized.
- **Upgrade-path fix bundle**: Fixed several P0/P1 issues surfaced during in-place upgrades — old process holding the single-instance lock, `taskkill` self-termination, uncleaned renderer assets, and stale cover after frame re-extraction.
- **PRD / CHANGELOG / README aligned to v2.6.0**: All project documentation now tracks the product version number.

## v2.5.1 (2026-09-01)

**Installer Language Selection + English User Notice Without PRC Laws + Uninstaller Language Follows Installer**

- **Language selection on installer start**: The NSIS installer now shows a language-selection dialog at the first step (Chinese / English) and writes the choice to `HKCU\Software\YingXia\InstallerLanguage`.
- **First launch uses installer language**: On first startup the main process reads the installer language from the registry and writes it to `settings.language`, so the app opens in the language chosen during installation.
- **Language can still be changed in Settings**: The installer language is only applied once; users can switch between Chinese and English at any time in the app settings.
- **English user notice no longer cites PRC laws**: `UserNoticeModal` now renders different content by locale. Chinese users still see the PRC legal excerpts; English users see a generic disclaimer without references to Chinese laws such as the Criminal Law, Public Security Administration Punishments Law, Cybersecurity Law, Minor Protection Law, or Civil Code.
- **Uninstaller follows installer language**: The NSIS MUI uninstaller automatically uses the language selected during installation. The installer warning message is also localized based on the selected language.

## v2.5.0 (2026-09-01)

**Documentation & Project Showcase Overhaul (README / PRD Bilingual Rewrite)**

- **README rewritten in Chinese and English**: refreshed product positioning, core features, privacy statement, and development guide. English is the default on GitHub, with a top-bar language switch to Chinese.
- **PRD updated in Chinese and English**: document version and product version aligned to v2.5.0; added milestones and feature modules for v2.3.x – v2.5.0 (bilingual UI, series episodes, batch-fetch progress panel, proxy coverage for Chromium, installer UX, etc.).

## v2.4.9 (2026-09-01)

**Fixed installed app not launching after double-clicking the desktop icon (P0 critical bug)**

- Root cause: The upgrade-detection kill-old-process logic added in v2.4.4 used 	askkill /F /IM \"影匣.exe\" /T, which kills **all** processes with that image name — including the newly started upgrade instance itself. This caused the fresh process to be killed immediately on launch, so the desktop icon appeared to do nothing.
- Fix: Use 	askkill /F /FI \"PID ne <currentPID>\" /IM \"影匣.exe\" to exclude the current process before terminating other old instances.
- Why 
pm run dev made it work afterwards: the dev process is named electron.exe, not 影匣.exe, so taskkill did not kill it. Running dev also wrote .last-version to the current version, so subsequent production launches skipped the upgrade branch and no longer triggered the suicide.
# Changelog

## v2.4.8 (2026-09-01)

**Installer friendly prompt + fix NSIS Chinese encoding**

- When the installer detects 影匣 is running, it shows a Chinese MessageBox asking the user to fully close the app (including the tray icon) before re-running the installer. Clicking OK exits the installer without force-killing the process.
- Fixed NSIS parsing failure caused by Chinese text in uild/installer.nsh: the file is now saved as UTF-8 with BOM so makensis reads the Chinese strings correctly.
# Changelog

## v2.4.7 (2026-09-01)

**Installer no longer force-kills old process; shows friendly prompt instead**

- uild/installer.nsh previously used 	askkill + FindWindow to force-end the old process before overwriting. Now it only checks for a window titled "影匣".
- If the app is still running, a MessageBox prompts the user: "Please fully close 影匣 (including the tray icon), then re-run the installer. The installer will exit after you click OK."
- Calling Abort exits the installer after the user clicks OK, preventing accidental data loss from a forced kill.
# Changelog

## v2.4.6 (2026-09-01)

**Fixed preview frames not refreshing after re-frame**

- Root cause: Preview frame filenames are fixed as <id>_preview_<n>.jpg; re-framing only overwrites the files in place. React reused the DOM because key={url} did not change, and Chromium cached the local lm:// image, so the detail page still showed the old frames.
- Fix: Added a previewVersion state that increments after re-framing. All preview frame URLs now go through posterUrl(url, previewVersion) with a ?v=N cache-busting query; the React key also uses the versioned URL, forcing a fresh <img> render and a new Chromium request.
- Zoom overlay, set-as-cover and other interactions also use the versioned preview URLs to avoid stale images.
# Changelog

## v2.4.5 (2026-09-01)

**Re-frame randomization + quality filtering + library display mode setting**

- **Detail-page "Re-frame" now uses random multi-point sampling**: Replaced the fixed thumbnail algorithm and evenly-spaced preview frames with random candidate timestamps across the 5% ~ 95% range of the video.
- **Auto-filters low-quality frames**: Each candidate frame is scaled to 8x8 grayscale via ffmpeg, and its mean brightness / variance are computed. Frames that are too dark (mean<25), too bright (mean>230), or blurry/monotonic (variance<400) are discarded, reducing black/white/blurry frames.
- **Every re-frame yields different results**: Random timestamps + quality ranking means repeated clicks produce different frames instead of clustering in one spot.
- **Persistent library display mode**: Added "Library display mode" in Settings > Appearance, choosing between "Flat" (default) or "Grouped by category". Toggling the top "Group" button also auto-saves the preference.
# Changelog

## v2.4.4 (2026-09-01)

**Thoroughly prevent stale UI after upgrade (two-layer safety)**

- **Main process kills old process on upgrade**: On startup compare .last-version to pp.getVersion(). If they differ, run 	askkill /F /IM "影匣.exe" /T before acquiring 
equestSingleInstanceLock, so no stale process survives and the AppData folder no longer needs to be cleared.
- **NSIS installer kills old process before overwrite**: Added uild/installer.nsh and referenced it from electron-builder.yml. The installer calls 	askkill + FindWindow before replacing files, providing a second layer of protection.
# Changelog

## v2.4.3 (2026-09-01)

**Upgrade shows old UI / stale app (P0 root-cause fix) + eliminate out/ chunk clutter**

- **Fixed upgrade-after-overwrite showing old UI**: If the user overwrites-installs a new version while the old one is still running, the old process still holds 
equestSingleInstanceLock. The new exe then immediately pp.quit()s because it cannot acquire the lock — the user is stuck on the old window. Fix: write a .last-version marker into %APPDATA%\local-video-manager\.last-version after a successful start. On the next launch, compare pp.getVersion() to the marker; a mismatch means "this is an upgrade run" and we skip the single-instance lock so the new process can start normally. The old process keeps running briefly (its window is buried under the new BrowserWindow) and is cleared on next reboot.
- **Out-renderer/assets no longer accumulates stale chunks**: electron.vite.config.ts had emptyOutDir: false on all three builds. Since Vite uses content-hashed renderer chunks, every build left old hashed files behind — out/renderer/assets/ had 30+ leftover files from 8/30 ~ 9/1, all of which got bundled into pp.asar by electron-builder. Switched all three to emptyOutDir: true so each build produces clean output.
- **New AppData marker file**: %APPDATA%\local-video-manager\.last-version (one-line version text), used purely for upgrade detection — no user data migration touches.
# Changelog

## v2.4.2 (2026-09-01)

**Scan library progress fires only once + GitHub README defaults to English**

- **Fixed scan progress firing twice**: Clicking the "Scan Library" button used to invoke two separate IPCs (ideoScan → libraryReconcile via finally), each pushing its own round of emitProgress. The UI saw two progress bars pop up. Added a merged IPC.libraryScanAndReconcile handle in the main process that runs scanLibrary then 
econcileLibrary as a single call, suppressing 
econcile's regular progress pushes while still forwarding introError / etchEvent events. The renderer now sees one continuous progress bar.
- **README defaults to English on GitHub**: README.md is now the English version (GitHub home page always renders this file), and the former Chinese copy is README.zh-CN.md. Both files have an English · 中文 language switcher at the top.

# Changelog

## v2.4.1 (2026-08-31)

**Batch Fetch Progress Panel + Proxy Test UX + Drag & Sidebar Polish**

- **Draggable batch-fetch progress panel**: The bottom-right scan/fetch progress is now a persistent floating panel instead of a toast, with a draggable header and auto-reposition on window resize. Added Pause / Resume / Stop buttons to control batch fetching in real time.
- **Pause/stop support for batch fetching**: Main-process `SmartFetchState` gains `paused` / `stop` flags; the worker loop responds to pause and stop commands. Added `libraryFetchPause / Resume / Stop` IPC channels.
- **Proxy test connection improved**: Test target switched from `javdb.com` / Google to `httpbin.org/get` to avoid being blocked or rate-limited. The Settings test result is now logged to the renderer console for easier debugging.
- **Fixed first-drag jump**: Both floating panels now use `getBoundingClientRect()` to obtain the actual rendered position as the drag origin, preventing large jumps caused by Windows display scaling / CSS positioning.
- **Media library sidebar is scrollable**: The left media-library list can now be scrolled with the mouse wheel when it exceeds the viewport.
- **Fixed ProgressPanel React internal warning**: Hooks order adjusted so conditional return happens after all hooks.

## v2.4.0 (2026-08-31)

**Bilingual UI + Series Episodes + Batch Fetch UX Upgrade + JavBus Image Stability**

- **In-app bilingual support**: New "Language" setting (zh-CN / en-US); CHANGELOG, scoring/intro spec, ABOUT constants, and OnboardSheetModal prompts all switch by locale. English UI now shows English guidance and prompts everywhere.
- **Bilingual project docs**: README / CHANGELOG / PRD / HANDOFF / PUBLISHING / AUTO_FRAME_AND_CATEGORY all have English copies bundled with the app.
- **Sheet Excel onboarding wizard restored**: Restored `OnboardMdModal` from v2.1.x history and reworked it into Excel-oriented `OnboardSheetModal`, keeping the core "full prompt + copy + open spec" interaction; fixed hardcoded Chinese prompts so English UI shows fully English prompts.
- **Batch fetch failure dialog upgrade**: Each failed item can be clicked to open detail page for individual refetch; the failure dialog stays hidden while in detail and reappears on return, making it easy to process items one by one. The bottom-left fetch log overlay is now draggable.
- **Series episodes (iQiyi-style)**: Multiple files for the same code (e.g. `SONE-560_1.mp4`, `SONE-560_2.mp4`) now show only one card in the library grid; the detail page shows an episode list, supports switching back and forth, and highlights the current episode.
- **Code extraction fix**: Trailing `_1` / `_2` episode suffixes in filenames are now correctly recognized and stripped, so search uses the base code `SONE-560` instead of `SONE-560_1`, improving source hit rate.
- **JavBus image stability**: Fixed `cacheRemoteImage` throwing `Invalid URL` on malformed/relative image URLs, which caused entire fetches to fail; empty or invalid URLs are now skipped and metadata is still returned.
- **Natural-language error messages**: Detail-page refetch and reframe failure toasts no longer show raw `t('...')` template strings; they now display Chinese/English natural-language error descriptions.

## v2.3.13 (2026-08-31)

**Proxy covers all cloud APIs + privacy lock delete password verification + data source intro card + settings page jump fix + batch fetch / startup rescan text upgrade**

- **Proxy covers Chromium network stack (P0)**: `cacheRemoteImage` (JavDB batch cover fetch) and renderer image requests go through Chromium `net.fetch` / `<img>`, but previously only Node.js `fetch` had an undici Dispatcher configured — the Chromium path was completely bare. With proxy enabled, JavDB / JavBus / Javinfo / Javapi remote image fetch still went direct and got blocked by the GFW. Added `applyProxyToSession()` calling `session.defaultSession.setProxy()`, invoked alongside the undici dispatcher inside `applyRuntimeSettings`; HTTP / HTTPS / SOCKS5 all mapped, credentials included.
- **Javapi proxy also covered**: Javapi previously used `getDispatcher(settings)` independently — fixed so it goes through `applyProxyToSession` uniformly.
- **Privacy lock delete now requires password**: New IPC `lockDelete`, must verify current password (SHA-256(salt + pwd)) before clearing the lock — prevents accidental "clear lock" clicks and stops someone tampering with settings to bypass it.
- **Settings page no longer jumps back to the first tab**: `SettingsModal` draft initialization chain + useEffect dependency array fixed. Opening the dialog keeps the last tab / card position.
- **Batch fetch settings now state it affects all cloud APIs**: Original UI text only mentioned JavDB but actually covers all five sources — updated text to avoid user confusion.
- **Proxy settings text also updated**: Same as above, now states it applies to all cloud APIs.
- **Startup auto-rescan now described as Excel-driven**: Original UI text was vague, but autoRescan and scanOnStartup already call `libraryReconcile` (the Excel-driven reconcile flow). Updated text so users know rescan uses "Intro Excel sheet" rather than a full filesystem walk.
- **Each of the five data sources gets a brief intro**: Settings page "Cloud APIs" tab now conditionally renders a source description when the SegmentedControl switches.
- **Uninstall flow hardened**: `appUninstall` spawn now has `detached` + `env: {...process.env}` + shell explicitly set to false; the uninstaller waits for the app to exit before proceeding; main process calls `app.quit()` 500ms after spawn to prevent NSIS silent-uninstall from hanging because main process is still alive.

## v2.3.12 (2026-08-30)

**Merge author's v2.2.14 fix set + friend's v2.3.3~v2.3.11 feature set, keep the best of both**

### Merged author v2.2.14 fixes
- **Settings don't persist**: Rewrote debounced write-to-disk logic (resolve aggregation + timer reordering + serial write) — fixed a deadlock where rapid calls within a 300ms window would clear the only timer, leaving `saveDB()` promises never resolving.
- **DMM CDN Referer rejected**: Electron's Chromium is strict about cross-site Referer; `*.dmm.co.jp` images with a JavBus Referer header get canceled (`ERR_BLOCKED_BY_CLIENT`) — stopped sending Referer for those.
- **Completion metadata overrides preview frames**: Only overwrite `previewPaths` when the screenshot was actually downloaded; otherwise keep the original ffmpeg preview frames.
- **Fetch log printed twice**: `preload/index.ts` `onScanProgress` now returns a cleanup function; useEffect returns it (React StrictMode ran useEffect twice, causing duplicate listeners).
- **tagCategories label value duplicates**: Added `Array.from(new Set(...))` inside each category's label list — eliminated React key conflicts caused by `["/"]` duplicates.
- **Batch completion double-trigger**: Detail-page useEffect auto-fetch + manual button click now use a `fetchingRef` lock for mutual exclusion.
- **Batch fetch failure loop-retry dialog**: Centered dialog showing failure details, with a "Retry all" button at the bottom that retries one by one; if there are still failures, the dialog reappears — loops until all succeed or user closes it.

### Merged friend v2.3.3~v2.3.11 features
- **v2.3.3/2.3.4**: Unified related-recommendation cover priority (`resolveEntryPoster`, posterPath first).
- **v2.3.5/2.3.6**: Duration display in three views + techInfo fallback.
- **v2.3.7**: Duration moved to bottom-right badge + new `libraryBatchProbe` for batch duration completion.
- **v2.3.8**: Scan library actually creates records (`handleScan` → `scanLibrary` → reconcile).
- **v2.3.9**: Store external modification detection (auto reloads memory when `data.json` is written externally).
- **v2.3.10**: Debounce deadlock fix (2s anti-starvation forced flush) + `applyVideoChanges` index O(n²)→O(n).
- **v2.3.11**: Corrupted videos no longer hang batch completion — frame-fetch timeout detection + stderr consumption + 7-day cooldown + completion result shows remaining coverless count.

## v2.3.11 (2026-08-30)

**Fix corrupted videos hanging batch completion + uncategorized notice dismissible**

- **Corrupted files hang completion (P0)**: `generatePreviewSet` cover-frame spawn had **no timeout** and **no stderr consumption** — `thumbnail=n=<max 200>` decodes the entire file; a corrupted wmv would make ffmpeg run forever. Meanwhile ffmpeg's error output fills the pipe buffer and the subprocess blocks on write, unable to even exit. As a result `generatePreviewSet` never returns and the batch completion worker hangs permanently (symptom: progress bar stuck on a specific title, restart doesn't help).
  Fix: unified `spawnWithTimeout` (consumes stdout/stderr + kills on timeout SIGKILL, cover 60s / single-frame 30s); cover **timeout** treated as file anomaly — skip the remaining ~10 preview-frame ffmpeg runs for that video.
- **Corrupted files no longer retried every round**: New `video.frameFailedAt` — timestamped when frame-fetch produces no output; batch tasks automatically skip during a 7-day cooldown period (manual "re-frame" is unrestricted). Previously the same bad file wasted minutes of timeout every round.
- **Frame-fetch round cap now visible**: `slice(0, 200)` was previously silent; logs now show "N videos pending, processing M this round (X remaining will need another run)".
- **Settings → General new "Don't show 'no sheet Excel' notice"**: Users without a sheet kept getting a non-auto-dismiss toast every reconcile. Checking this only suppresses the "no sheet configured" class; real errors like sheet-parse failure still show.

## v2.3.10 (2026-08-30)

**Fix "stuck on reconciling" (write-debounce deadlock) + large-library write O(n²)**

- **Write-debounce deadlock (P0, root cause of stuck)**: Original `scheduleSave` attached `resolve()` only inside the debounce timer callback, and "don't rebuild timer when `pendingWrite` exists" — any second write call within the 300ms window (reconcile for another library, settings save, etc.) would `clearTimeout` the only timer, leaving `await saveDB()` promises never resolving. The reconcile-ending `applyVideoChanges` hangs forever → reconcile IPC never returns → UI shows "reconciling" forever, reconcile-cache also never written. Symptom is **intermittent** (depends on concurrent writes in the window).
  Rewrote with a `dirty` flag + serialized writes + waiter wakeup: timer only triggers, promises resolve together when disk write finishes; new changes during a write automatically queue another round; added a 2s anti-starvation cap (continuous changes still make progress).
- **Large-library write O(n²) → O(n)**: `applyVideoChanges` previously did a full-table `findIndex` scan per change (4494 changes × 6253 records ≈ 28M comparisons). Replaced with a Map building id→index lookup.
- **Diagnosability**: Reconcile completion / cache write results now logged to main.log (previously cache-write failures were silently swallowed, so stuck scenarios had no trace). Logs when disk-write takes > 1s.
- **Batch completion segmented write**: `libraryFetchJavdbAll` previously wrote to disk only after everything was fetched — during long runs (4494 titles) closing / crashing mid-way lost all metadata fetched so far (51% stop = 2300 titles wasted). Now writes every 100 items (async, non-blocking), interrupt loses at most one batch; waits for in-flight writes before writing the remainder at end.

## v2.3.9 (2026-08-30)

**Fix stale list duration/metadata (must enter detail and return to refresh)**

- Store.ts memory DB never reloads disk after initial load — external scripts / another instance editing `data.json` leaves memory and disk out of sync. Reconcile builds entries with stale data and writes them to reconcile-cache, so the list always uses old snapshots. Now checks mtime before each DB get (1s throttled), auto-reloads when external changes detected.

## v2.3.8 (2026-08-30)

**Scan library actually creates records + duration completion covers everything**

- **"Scan library" now really scans**: Previously only ran reconcile (sheet-based); when no sheet existed, entries were generated temporarily without persisting — resulting in many videos having no `data.json` record (couldn't complete duration, couldn't open detail). Now scan library first calls `videoScan` (scanLibrary batch disk write, fix7 completes disk records in seconds), then reconcile refreshes.
- **Duration completion covers all**: After scan fills records, "Complete video duration" can now write techInfo for every video in the library (previously only processed videos with existing records).

## v2.3.7 (2026-08-30)

**Duration becomes a corner badge + batch duration completion feature**

- **Duration becomes bottom-right corner badge**: Duration moved from bottom info row to floating corner badge (similar to the "frame" badge style, `bottom-9 right-1.5`, above the bottom info bar); bottom now only shows code + rating.
- **New "Complete video duration"**: Toolbar "Complete info" dropdown now includes "Complete video duration" — batch ffprobe reads duration for all library videos missing duration and writes to `techInfo` (reuses `probeVideo`, one batch `applyVideoChanges`), toast shows success / failed / skipped counts when done.

## v2.3.6 (2026-08-30)

**Duration display falls back to techInfo**

- EntryCard / ListView / related-recommendation duration reads changed to `video.durationSec ?? video.techInfo.durationSec` fallback — after v2.3.5 changes some videos still didn't show duration (top-level durationSec missing). Now if `techInfo` has ffprobe duration it also displays.
- Note: currently 99% of the user's videos have no duration data at all (both top-level and techInfo missing); UI fallback only covers data that already exists. To fully display in the G-library, need to batch-run videoProbe to write techInfo.

## v2.3.5 (2026-08-30)

**List / related-recommendation duration display**

- **Related recommendation card bottom now shows duration**: Consistent with EntryCard list style, left of code, right is duration; hidden when duration is missing.
- **EntryCard grid (portrait / landscape) now shows duration**: Bottom info row (code + rating) shows duration next to it (hidden when missing), consistent with list filename mode.

## v2.3.4 (2026-08-30)

**Related-recommendation cover completely missing fix**

- **resolveEntryPoster cover priority corrected**: In v2.3.3 `javdbDetail.cover` was prioritized over `posterPath`, but cover often points to missing files (`javapi-cover-*.jpg` download failed / cleaned up) — causing related-recommendation / cover paths to all return 404 placeholders. Changed to **posterPath (100% valid) always first, cover only supplements when posterPath is missing** — related-recommendation covers restored (verified 179/179 all valid).

## v2.3.3 (2026-08-30)

**Related-recommendation cover inconsistency fix**

- **Related-recommendation uses full cover priority**: Related-recommendations (same studio / series / actress) previously only looked at `video.posterPath`, causing inconsistency where "list has real poster, related-recommendation shows placeholder" (EntryCard prioritizes `javdbDetail.cover` local real poster, related-recommendation didn't). Added shared `resolveEntryPoster` (manual cover > javdbDetail.cover > real posterPath > ffmpeg frame); related-recommendation now uses the same priority as list, placeholder problem eliminated.

## v2.3.2 (2026-08-30)

**New "Genre" filter in sidebar; categories restored to original logic**

- **New "Genre" filter**: Sidebar gains a "Genre" tab (separate from "Category"), listing all individual `javdbDetail.genres` tags (Big breasts / Bukkake / Squirting…) + counts; click to filter by genre (multi-select OR). Can stack with category / label / talent / spec filters.
- **Categories restored to original logic**: Auto-categorization category names for videos without sheets revert to v2.2.0 logic (one entry per video, genres concatenated), no longer split single videos into multiple entries per genre (avoids duplicate counts / recommendations). Genre filter replaces v2.2.0's "single genres into categories" approach.

## v2.3.1 (2026-08-30)

**Browse page defaults to all-library view**

- **Browse page defaults to all-library mode**: `groupMode` default changed from `grouped` to `flat` — browse page starts as a mixed large grid, not split by category blocks (toggle with the "Group" button in filter bar anytime).
- Note: v2.3.1's early "single genres into categories" experiment was rolled back in v2.3.2 (categories restored, genre filter provides single-label navigation instead).

## v2.3.0 (2026-08-30)

**Security hardening: atomic writes + dangerous IPC argument whitelist**

- **Atomic writes for data.json**: Write to temp file, then rename to overwrite — prevents data.json truncation / corruption from mid-write crashes / power loss (4.7MB full serialize window is risky); process-exit guaranteed sync write also made atomic.
- **openExternal protocol whitelist**: Only http/https allowed — prevents renderer injection from using `shell.openExternal` to open `file://` or arbitrary local programs.
- **Dangerous IPC argument validation**: `videoDeleteFile` (delete disk file) validates id legality; `videoSetPreviewAsCover` (write cover file) requires previewPath to be inside poster cache dir; `openPath` / `shellRevealInFolder` only allow absolute paths.

## v2.2.13 (2026-08-30)

**Roadmap P0: Doc tag layering — doc tags primary, source genres collapse to secondary display**

### 1. Core design: tags split into 3 categories (type + data layer + full UI chain)
- **New fields**: `Video.tagCategories?: Record<string, string[]>` (Excel structured categories, e.g. "Style / Theme / Actor group") + `Video.backupTags?: string[]` (source JavDB / JavBus genres as backup, don't participate in primary display)
- **Shared helpers**: `primaryTags / entryPrimaryTags / hasDocTags / flattenAllTags` (main process & renderer shared, ensuring global consistency on "who is primary")
- **Primary selection rule**: if `tagCategories` present → union of all categories; otherwise flat `tags`; both considered "doc tags"; empty = "no doc tags".

### 2. One-time old-data migration (`store.ts` startup schemaVersion)
- Old logic pre-v2.2.13: `backfillFromDetail` merged `detail.genres` (source) into `Video.tags`, making "doc tags + source tags mixed together, UI can't tell the difference".
- On startup `migrateInPlace` (runs only when `schemaVersion < 2026083001`):
  - Has doc tags + has `javdbDetail.genres` → remove items from tags that are in genres but not doc tags, move them to `backupTags`;
  - No doc tags but all genres → directly fill `backupTags`;
  - Won't re-run; writes `schemaVersion=2026083001` after completion.
- **Upgrade notice**: existing users will auto-layer once on startup; if tag anomalies are seen, refresh after reconcile (reconcile writes Excel structured `tagCategories` back to Video top-level).

### 3. Main process changes: writes no longer mix
- `reconcile.ts`: `ensureVideo`'s `meta` param gains `tagCategories?`, both update/upsert write `video.tagCategories`, included in deep-change compare (avoids unnecessary writes).
- `ipc.ts`: `backfillFromDetail` no longer merges `detail.genres` into `Video.tags` (deleted old `Array.from(new Set([...(v.tags ?? []), ...(detail.genres ?? [])]))` line); instead only writes `patch.backupTags = ...dedup union`.

### 4. Full UI changes: doc tags = primary authority, source = collapsed backup
- **Detail page (VideoDetail)**:
  - Has `tagCategories` → show primary tags grouped by "Category name (count)";
  - Otherwise fall back to flat tags;
  - Has doc tags AND backupTags → under a `Source` category, **default show first 3, click "N more… · Expand" to show all, click "Collapse" back to 3**, sky color + text "from JavDB / JavBus etc. · secondary reference only";
  - No doc tags but has backupTags → use as primary tags, info color.
- **EntryCard / HoverDetail / ListView**: card chips, hover panel, list row tag preview all use "primary tags first + backupTags as fallback when no doc".
- **Sidebar filter (App.tsx)**:
  - Tag facet generation split into 3 layers: ① entry.tagCategories grouped by category ② entryPrimaryTags dictionary fallback ③ backupTags (if doc exists → into new "Backup source" category; no doc → dictionary category)
  - Search: `applyTagsOnly` now uses `flattenAllTags` (primary + backup all hit); filter matching uses union of `entryPrimaryTags(e) ∪ backupTags`
- **StatsPanel**: TOP10 tag counts use entryPrimaryTags selection rule, no longer counts migrated-out genres.
- **EditMetaModal**:
  - Manually-edited tags still write flat tags; added hint "Excel sheet is the authority, will be overwritten on next reconcile"
  - New block showing **read-only** "Source backup tags" in sky color (with 📡 icon), so users can directly see where this title's genres come from, no longer confused by "why is my tag gone".

### 5. Files Modified
- Types / shared: `src/shared/types.ts` (Video +2 fields + 4 helpers)
- Main process: `src/main/lib/store.ts` (`SCHEMA_VERSION` + `migrateInPlace`), `src/main/lib/reconcile.ts` (writes `tagCategories`), `src/main/lib/ipc.ts` (backupTags split)
- Renderer: `App.tsx` (sidebar / search / filter), `components/VideoDetail.tsx` (detail-page tag grouping + collapse), `components/EntryCard.tsx`, `components/HoverDetail.tsx`, `components/ListView.tsx`, `components/StatsPanel.tsx`, `components/EditMetaModal.tsx`

---

## v2.2.12 (2026-08-30)

**Friend merged three-feature set (P0 perf triple-fix + P1 reconcile cache + write debounce + data directory fix)**

### 1. P0 perf triple-fix (fix4)
- **Batch completion batch disk write**: "Batch complete info" previously called `updateVideo` after each fetch → one full 4.7MB data.json write per video (4680 videos = 4680 full writes, taking hours). Changed to collect changes inside the worker and write once with `applyVideoChanges` after everything completes; frame fallback at the end also writes batch.
- **Home completion sequential**: Home page previously launched all missing-library reconciles concurrently (multi-library simultaneous walk + concurrent disk writes with main reconcile, potential data loss). Changed to sequential completion + skip current library (handled by main reconcile).
- **List virtualization (content-visibility)**: Browse list previously rendered thousands of DOM cards at once — lag on open/scroll, high memory. Added `content-visibility: auto` + `contain-intrinsic-size` to list items (Chromium native skips off-viewport rendering, renders on scroll, zero deps) — large-library scroll smoothness significantly improved.

### 2. P1 dual-fix: startup / library switch instant + write debounce (fix5)
- **Reconcile results disk cache**: Each reconcile result written to `userData/reconcile-cache/<libraryId>.json`. Opening app / switching library **instantly reads cache first and displays** (no more blank "loading library…" while waiting for walk scan of 10+ seconds); full reconcile runs in background to refresh; stale cache is shown if reconcile fails. New IPC: `libraryReconcileCache`.
- **Write debounce**: `data.json` disk write changed to 300ms debounced merge (`saveDB → scheduleSave`) — rapid single-row operations like favorites / renames no longer full-serialize 4.7MB every time; `mutate` returns immediately without blocking; `before-quit` sync flush + `flushSave()` provided, ensuring no writes lost inside the debounce window.

### 3. Data directory back to English path (fix6)
- Main entry uses `app.setPath('userData', %APPDATA%\local-video-manager)` forcing data directory to English path (productName "YingXia" unchanged — window title / installer name both stay the same), avoiding potential compatibility issues with Chinese directory names.
- **Migration reminder**: old data dir `%APPDATA%\影匣` data.json / posters / logs need manual copy to `%APPDATA%\local-video-manager` — if users upgrade and see their library is empty, they need to migrate once manually.

---

## v2.2.11 (2026-08-30)

**Large-library performance triple-fix (eliminate startup storm / lag / slow library switch) + md→Excel migration script**

### 1. Large-library startup storm fix
- **No-sheet auto-fetch limit + batch write**: v2.2.4 introduced "auto metadata fetch for no-sheet videos" — concurrent background fetch for ALL videos without metadata (thousands of titles × 5 sources + per-video full disk write). Now auto-fetch caps at **30 titles per round**; the rest are left for manual "batch completion"; fetch results use **batch disk write** (one saveDB) instead of per-video full data.json writes.
- **Auto-fetch only runs once per process**: Automatic fallback fetch (30 titles) only runs on the first reconcile after process startup — no more triggering on library switch / page change / refresh; after that, always use manual "batch completion".

### 2. Fix large number of ffmpeg.exe processes from auto frame-fetch
- **Auto frame-fetch completely removed**: `generatePreviewSet` = 1 `thumbnail` full-decode + 4 preview frames per video (5 ffmpeg calls). 20 concurrent auto-frames = "a whole bunch of ffmpeg.exe", CPU pegged for extended periods. Reconcile no longer auto-frames; logs instead say "N frame-less videos (auto frame disabled, use manual 're-frame' if needed)".
- Manual entry points unchanged: detail page "re-frame" (single video), toolbar "batch complete" (metadata).

### 3. Fix slow open / switch library
- **Dead previewPaths cleanup rate-limited**: Full cleanup every reconcile (introduced in v2.2.5) — iterates ALL videos + thousands of `existsSync` disk IOs (762 videos × multiple preview frames ≈ 3000+ stat calls), and runs on every library switch regardless of which library is active. Now runs **at most once every 6 hours** (previewPaths only go stale after upgrades / cache clears, not often).

---
## v2.2.10 (2026-08-30)

**Fix fetch order not actually changed + attachMainLog + [smart] summary logs + batch completion segmented write**

- **fetchPosterSmart also respects customSourceOrder (P0)**: Before this version, `fetchPosterSmart` always went JavDB first regardless of the user's `customSourceOrder` drag setting — real fetch order wasn't changing at all. Now poster fetch chain also follows customSourceOrder, consistent with metadata fetch.
- **attachMainLog writes main process console to disk (P0 observability)**: Previously renderer console went to file but main console only went to terminal. Now main process also writes to `%APPDATA%\local-video-manager\logs\main.log` — so stuck scenarios have logs to diagnose.
- **[smart] summary log (per-fetch)**: After each batch completion, logs a [smart] summary line showing the fetch chain order, which sources actually hit, which were skipped / timed out / blocked. Users can see "JavDB blocked → JavBus hit → 77/80 fetched" directly in main.log.
- **Batch completion segmented write**: `libraryFetchJavdbAll` previously wrote to disk only after everything was fetched — during long runs (4494 titles) closing / crashing mid-way lost all metadata fetched so far (51% stop = 2300 titles wasted). Now writes every 100 items (async, non-blocking), interrupt loses at most one batch.

## v2.2.9 (2026-08-30)

**Observation: main process logs weren't being saved**

- Renderer console was written to `renderer-console.log`, but main process console only went to terminal. So when main process got stuck on something (e.g., a fetch loop), there was no trace to diagnose.

## v2.2.8 (2026-08-30)

**fetchPosterSmart also respects customSourceOrder**

- Before this version, poster fetch always went JavDB first regardless of the user's `customSourceOrder` drag setting — real fetch order wasn't changing at all.

## v2.2.7 (2026-08-30)

**UI text follows fetch order (user feedback: "custom source order is supported, but text doesn't change with it")**

v2.2.6 added the customSourceOrder drag UI, but multiple places still hardcoded the default order — after dragging, UI text didn't update. v2.2.7 changes all related text to dynamically follow customSourceOrder.

### 1. SettingsModal top auto-fallback description
- Before: "auto auto-fallback (Javapi → Javinfo → JavDB → JavBus → JavLibrary, auto-switch on consecutive failures)"
- After: `formatSourceOrder(draft.customSourceOrder)` function renders it — **text updates as soon as user drags**.
- Top text + the 1/2/3/4/5 numbering in the drag list + "restore recommended" button — three places all share the same order.

### 2. Javapi / Javinfo API Key input placeholders
- Before: Javapi placeholder "leave blank to skip Javapi, go Javinfo → JavDB → JavBus" (hardcoded)
- Before: Javinfo placeholder "leave blank to skip Javinfo, go JavDB → JavBus" (hardcoded)
- After: filter current source out of `draft.customSourceOrder`, stitch the remaining order into text. "leave blank to skip Javinfo, go JavDB → JavBus → JavLibrary" (reflects the actual current order).

### 3. Batch completion toast "source distribution" bar
- Before: "Javapi X · Javinfo Y · JavDB Z · JavBus W · failed N" (hardcoded)
- After: renders sources + counts in `settings.customSourceOrder` order, **consistent with the user's actual fetch order**.
- Also added `javlibrary: number` field to `api-types.ts` `BatchJavdbResult.bySource` (was missing before — custom order can hit javlibrary).

### 4. Text that was NOT changed
- Bottom of drag list: "Fetch logic: try each source in order; any hit and stop. Any source with 3 consecutive network failures skips this round. JavBus with 3 consecutive failures stops the whole batch (avoid spinning). All sources fail → ffmpeg frame fallback." — order is dynamic, "JavBus" is a fact (stops at 3 consecutive failures regardless of position), text itself doesn't need change.
- "Recommended order: Javapi (local free) → Javinfo (no anti-bot) → JavDB → JavBus → JavLibrary" — JSX comment, not user-facing, kept.

---

## v2.2.6 (2026-08-30)

**Source fetch: full flow visible + order adjustable (user feedback "javapi/javinfo failed should keep trying others")**

### 1. P0: fetchDetailSmart auto mode error messages complete
- v2.2.4 missed **one thing** when extracting `fetchDetailSmart` to a separate module — the `errors` array (javapi skipped / javinfo skipped messages) wasn't merged into the returned error. Also **forgot to delete old `fetchMovieDetail` in ipc.ts** (v2.2.4 incomplete migration), causing user's "complete info" button to go through `fetchMovieDetail` while batch completion went through `fetchDetailSmart`, **two separate logic paths**.
- Symptom: User's SONE-560_1 clicking "complete info" only shows "Javapi not configured, skip; Javinfo key not configured, skip" — looks like it only tried javapi then stopped. Actually javdb/javbus/javlibrary also ran but got "no-result" (not exception), so `errors` array didn't reflect it.
- v2.2.6 fix:
  - `fetchDetailSmart` auto mode now uses `srcResults[]` to record each source's status (`hit` / `skipped` / `no-result` / `network-failed`), and finally assembles a full summary like `javapi=skipped(...); javinfo=skipped(...); javdb=no-result; javbus=no-result; javlibrary=no-result`
  - Deleted `ipc.ts fetchMovieDetail` (kept wrapper, internally calls `fetchDetailSmart`), ensuring both entry points behave consistently
  - Cleaned up 6 no-longer-directly-used per-source imports from `ipc.ts` (fetchJavapiDetail / fetchJavinfoDetail / fetchJavdbDetail / fetchJavBusDetail / fetchJavLibraryDetail / hasJavapiConfig / hasJavinfoKey)

### 2. P0: SettingsModal gets customSourceOrder drag-to-reorder UI
- v2.2.0 added `Settings.customSourceOrder` field; v2.2.4's fetchDetailSmart (javdb-smart.ts) also reads it — **but the UI never exposed an adjustment entry** — users could only pick auto / single source.
- v2.2.6 exposes UI: when dataSource=auto, shows a 5-source draggable list:
  - Drag ⠿ to reorder (HTML5 drag-and-drop)
  - Or ↑↓ buttons
  - "Restore recommended" one-click reset
  - Each source shows a 3-dimension assessment: "info completeness + anti-bot risk + cost"
  - Bottom explains fetch logic: try in order, stop on hit; 3 consecutive network failures → auto-skip this source; JavBus 3 consecutive failures → stop whole batch; all fail → ffmpeg frame fallback
- Field already exists in shared types, store persistence supported automatically

### 3. Data layer (left for v2.2.7)
- "Doc tag primary, source tags collapse as backup" not done yet. Current v.tags = doc tags + source genres merged dedupe.
- v2.2.7 plan: Video gains `tagCategories` + `backupTags`; reconcile if (doc) branch writes tagCategories; backfillFromDetail writes backupTags not merge; detail page UI collapsible display.

---

## v2.2.5 (2026-08-30)

**Fix lots of console ENOENT errors (user feedback "console flooded with errors")**

During v2.2.4 upgrade, the installer cleaned up old .jpg files in the posters directory (`<video.id>_preview_X.jpg` ffmpeg frame naming), but `video.previewPaths` in `data.json` still pointed to those non-existent files. When hovering a video / opening detail page, rendering 15 previews triggered 15 ENOENT on `lm://` protocol calls — main process `console.warn` spam.

Measured: 22 videos / 330 dead preview paths total flooding the console.

### 1. P0: `lm` protocol ENOENT silent
- `src/main/index.ts`: when ENOENT, `console.debug` (invisible in production, visible in dev); other errors still console.warn
- Still returns 404, so renderer `<img onError>` goes to placeholder
- Spam disappears instantly

### 2. P0: reconcile auto-cleans dead previewPaths
- `src/main/lib/reconcile.ts` adds `cleanupDeadPreviewPaths()`, runs after every reconcile completion, scans all videos
- `fs.existsSync` check, removes non-existent entries
- When all gone: `previewPaths = undefined` (lets UI fall into "no preview" branch, no more load attempts)
- Changes merged into the `changes` array, written once by `applyVideoChanges` at the end
- No console spam, no dialogs: this is fixing cleanup, not something users should be disturbed by

### 3. Not done in v2.2.5 (left for patch 2)
- Don't auto re-frame with ffmpeg: hover already has javbus cover to use; preview frames get generated next time user manually clicks "regenerate previews"
- Keep v2.2.5 minimal to reduce risk

---

## v2.2.4 (2026-08-30)

**Core fix (user feedback: "code has issues — it says not listed even though it is + dialog hides problem + what if no Excel")**

### 1. P0: fix `parseIntroExcel` Chinese path read (root cause of user's 84 videos all "unlisted")
- v2.2.3 used `XLSX.readFile(filePath)` which **fails silently** on Chinese paths on Windows — SheetJS v0.18.5 mjs `readFileSync` doesn't handle non-ASCII paths properly, throws `Cannot access file E:/新建文件夹/收藏整理_2026.xlsx`.
- Changed to `await fs.readFile(filePath)` + `XLSX.read(buf, { type: 'buffer' })`, bypassing xlsx mjs readFileSync Chinese-path bug.
- Measured: `E:\新建文件夹\收藏整理_2026.xlsx` (35KB / 74 videos) buffer parse succeeds → keyMatches 76/76 hits.
- Also fixed `excelSheetNames` (also uses buffer).

### 2. P0: restore "sheet load failed" dialog (stop silently hiding errors)
- v2.2.3's `autoFindIntroExcel` **silently catches** when `parseIntroExcel` returns null — users thought "sheet doesn't exist" when actually sheet exists but read failed.
- v2.2.4 changes:
  - `readIntroDoc` returns `IntroLookupResult` (with `doc` and `error`), distinguishing `not-configured` / `parse-failed` / `auto-find-failed`.
  - `autoFindIntroExcel` also returns structured result, recording triedPaths.
  - `reconcileLibrary` pushes `introError` to renderer via onProgress, fires a Toast (title / message / tried paths list), **not auto-dismissed** so users see it.
- User-friendly: not found → tell users "where it couldn't be found"; found but parse-failed → tell users "which file is broken".

### 3. P1: No-sheet fallback: auto background metadata fetch
- User quote: "what if a user truly doesn't have Excel one day?"
- reconcile `else` branch: collect `needFetchAfter` (videos without javdbDetail and not domestic) during traversal.
- Skip if fetched and failed within 7 days (`video.lastMetaFetchAt` field); fetched results write back to `video.javdbDetail`, UI immediately auto-categorizes by genres.
- Concurrency controlled by `settings.scanConcurrency` (default 2), consistent with scanLibrary behavior.
- `fetchDetailSmart` extracted to new module `javdb-smart.ts` (avoids ipc ↔ reconcile circular dep).

### 4. Tech debt
- `MovieDetailResult` / `SmartFetchState` / `fetchDetailSmart` extracted from ipc.ts to `javdb-smart.ts`, so reconcile.ts can also call it (no circular dep).
- Video type gains `lastMetaFetchAt?: number` (7-day dedupe for fallback fetch).

---

## v2.2.3 (2026-08-30)

**Core fix (user feedback "problems still exist + two frame badges + duplicate tags + lots of console errors")**

### 1. P0: auto-scan library root when library has no sheet Excel (most important)
- `reconcile.ts` adds `autoFindIntroExcel(folderPath)`: when `library.introExcelPath` is not set, **auto-scan one level deep** in library root for `.xlsx/.xls` (sorted by filename, pick first that can parse video-code column).
- User-friendly: user just puts `收藏整理_2026.xlsx` at library root, no need to manually set `introExcelPath`.
- When multiple xlsx files, picks first sorted by zh; console.log says "auto-using library-root Excel sheet".

### 2. P0: reconcile.ts double-push (root cause of user screenshot "unlisted 84 + uncategorized 79")
- `reconcile.ts` else branch (~L260) added `used.add(f)`: when no Excel, each filePath produces only 1 entry.
- Previously each filePath entered both "uncategorized" and "unlisted" branches simultaneously, with exactly the same `code` → `HomeView key={e.code}` duplicate-key warning (`MKMP-542`, `juy-703`) → seriesMembers on detail page showed the same chip twice.

### 3. P0: EntryCard dual "frame" badge
- `EntryCard.tsx` removed duplicate `bg-violet-500/90` chip (v2.0.2 + v2.1.0 merge residual), kept the one with `bg-fuchsia-500/90` and film icon.
- Also changed source badge to a single IIFE source (avoids copy-paste errors when adding more sources in future).

### 4. P0: EntryCard dual "JavLibrary" badge (indigo + sky overlapping)
- `EntryCard.tsx` removed the `bg-sky-500/90` block outside the chain, kept the standard `bg-indigo-500/90` inside.
- Also added green "set as cover" chip when `posterSource === 'manual'` (was missing).

### 5. P0: revert v2.2.2's `keyMatches` letter-suffix rejection (the most subtle bug)
- v2.2.2 changed `keyMatches` suffix check to `/[A-Z0-9]/` — **over-aggressive** — misjudged the `M` from `MP4` in normalized `JUR-031.mp4` as "another code letter" and rejected it → **normal files couldn't match**.
- v2.2.3 reverts to rejecting only digit suffixes: `/[0-9]/.test(after)`. `JUR-031.mp4` ↔ `JUR-031` ✅.
- Series episode merging (`SONE-566AB` → `SONE-566`) now handled explicitly by `extractBaseCode/hasSeriesSuffix` in the fetch source — no longer forceful on filename keyMatches.

### 6. P1: parseIntroExcel same code multiple rows not deduped
- Inside parse loop, added `seenCodes = new Set<string>()` (using normalized keys), skip duplicates and warn.
- Also moved `normalizeCode` from reconcile.ts to `src/shared/code.ts` to be shared (reconcile + excel both use it).

### 7. P1: HomeView key defensive hardening
- `HomeView.tsx:94` `key={e.code}` → `key={e.video?.id ?? \`code:${e.code}\`}` — future duplicate codes won't crash.

**Regression test**: 14/14 user-screenshot filenames → Excel hit; normalize / autoFindIntroExcel / keyMatches all pass in v2.2.3.

## v2.2.2 (2026-08-30)

**Bug fix (user feedback "84 unlisted")**
- **`extractCode` domain prefix false extraction** (P0, github repo root cause): `hdd800.com@JUR-031.mp4` was incorrectly recognized as `HDD-800`. Fix: internals now split by `@` first → strip bracket wrappers → segments with valid code form (containing dashes) get priority → plain fallback uses `[A-Z]{2,}[A-Z]+\d{2,}` (requires extra letters, filters compact forms like `HDD800`). **Coverage test 44/44 pass** (including real user-screenshot filenames like `b8s2048.org@EBOD-835`, `[hhd800.com@]DASS-733-C`, `44x.mejuy-703-2`).
- **`javdb.ts` extractCode semantic drift** (P0): Parallel implementation to code.ts, accessing `m[0]` instead of `m[1]`, with independent normalization logic. Unified to re-export from `src/shared/code.ts`, ensuring main / renderer both use the same semantics (also fixes a cache mismatch bug where `javdb-cover-SONE-560CD2` didn't match the actual `javdb-cover-SONE-560.jpg`).

**Other P1 parsing enhancements** (fixed one-by-one based on full agent audit report)
- `reconcile.normalizeCode`: underscore normalization (`SONE_566` → `SONE566`, matches `SONE-566`).
- `reconcile.keyMatches`: also reject letter suffixes (prevents `SONE-566AB` from being merged into `SONE-566`; series-episode merging now done explicitly by `extractBaseCode/hasSeriesSuffix`).
- `rename.cleanVideoFileName`: uppercases input before matching (`sone-566-uc.mp4` / `ALDN606.mp4` previously returned null, now rename correctly); "no rename needed" check compares uppercased too (user's original uppercase = no rename).
- `code.extractBaseCode` (`SERIES_SUFFIX_RE`): trailing letters limited to `[A-DUC]` (previously `[A-Z]` was too wide, stripping `SONE-560X` / `KSJK-013V` incorrectly to `SONE-560` / `KSJK-013`).
- `excel`: `video code` column scan changed from only column B to scanning the entire header row (users putting code in D/F column were being silently categorized as "uncategorized").

**P2**
- `scanner.cleanTitle`: strip Chinese brackets 【】 and Chinese parentheses （）.
- When Excel not configured, reconcile branch: write `code` field after stripping extension (previously UI cards showed `xxx.mp4`).

**Test**: regression test 61/61 pass (44 extractCode + 17 normalizeCode/keyMatches).

## v2.2.1 (2026-08-30)

**Custom source priority (1-5)**
- Settings → Sources → "Custom priority" section (only shown in auto mode): 5 sources each with ↑↓ buttons to reorder (you decide who's 1 who's 2 who's 3 who's 4 who's 5);
- "Reset to recommended order" one-click restore: Javapi → Javinfo → JavDB → JavBus → JavLibrary (ranked by info completeness / difficulty to fetch / anti-bot risk);
- Batch completion (fetchDetailSmart) auto chain follows this order, consecutive network failures auto-skip current source;
- Persisted to `settings.customSourceOrder`.

**Complete markdown residue cleanup (comments + UI text)**
- Full repo review and fix of 20+ comment / text residues: excel.ts, App.tsx, EditMetaModal (4 places), ReconcileDialog (2), about.ts (3), api-types.ts (3), ipc.ts, reconcile.ts (4), types.ts (4) — all changed to Excel terminology;
- Kept: `CHANGELOG.md` (project changelog), `通用评分与简介规范.md` (resource doc), non-sheet uses.

**CI fix (GitHub Actions build failure)**
- `electron-builder.yml` added `win.certificateFile: build/yingxia-sign.pfx`;
- `release.yml` commands simplified to `npx electron-builder --win`, cert password read from `CSC_KEY_PASSWORD` env var (`secrets.CERT_PASSWORD`), no more `-c.win.certificateFile=...` which triggers ENOENT.

## v2.2.0 (2026-08-30)

**Completely remove markdown sheet support** (user demanded zero residue, full repo cleaned)
- Deleted `src/main/lib/parser.ts` (md parser), `mdWatcher.ts` (md watcher), `src/renderer/src/components/OnboardMdModal.tsx` (new-md wizard) — three whole files;
- Deleted IPC: `specGet` (read built-in spec), `libraryExportCodes` (export code list), `onMdChanged` (md change event), including `shared/ipc.ts` constant + `preload/index.ts` exposure + `shared/api-types.ts` type + `ipc.ts` handler;
- Removed `Library.introMdPath` field; `Settings.library.introExcelPath` is now the only sheet authority source;
- `LibraryModal` removed entire "Intro md file" block + "No md yet? Let AI generate one using built-in spec →" button + `onOnboard` prop;
- `dialogSelectFile` default filter changed to Excel (`xlsx`/`xls`), title/buttonLabel can be overridden by caller;
- `reconcile.ts` removed md fallback branch, only uses Excel sheet;
- Resource `通用评分与简介规范.md` still in `extraResources` (project doc, not sheet use), not deleted; `CHANGELOG.md` also kept.

**Recommended source order (confirmed as v2.1.0 order)**
- Order: Javapi → Javinfo → JavDB → JavBus → JavLibrary;
- Rationale: ① Javapi (local, aggregates 8 sources + JavDB API, most complete info, no Cloudflare / IP anti-bot, free but needs self-hosting); ② Javinfo (javinfo.dev aggregator, no anti-bot, pay-per-use); ③ JavDB (original, accurate, but Cloudflare-blocked); ④ JavBus (secondary source, needs age-gate bypass); ⑤ JavLibrary (fallback, high data overlap with javdb/javbus);
- Users can manually assign a single source (Settings → Sources → Manual option). Custom 1-5 priority drag left for v2.3.0.

---

## v2.1.0 (2026-08-29)

**Merged friend branch (github.com/z1006670445/yingxia-video-manager)**

- **New source Javapi (local self-hosted aggregator API)**: settings configure URL + Key, free, no Cloudflare / IP anti-bot; highest priority in auto-fallback chain;
- **New source Javinfo (javinfo.dev aggregator API)**: register for Key, no anti-bot; second in auto chain;
- **Set as cover / preview frame as cover**: Detail page preview frames can be set as cover (posterSource=manual highest priority); before cover replacement, ffprobe validates image validity (bad image doesn't replace + deletes bad image and falls back to frame); coverVersion mechanism makes covers refresh instantly;
- **Renderer-side frame fallback (frameFallback)**: render ffmpeg frames on demand when list / detail page displays (complementary with main-process scan frames); ListThumb thumbnail component (blur background + frame indicator);
- **Home global random**: multi-library combined shuffle, single library auto-hides; favorite / detail don't refresh random;
- Build output moved outside workspace (`~/yingxia-release/<timestamp>`), completely solves app.asar occupied-lock problem;
- Badge system expanded: Javapi (cyan) / Javinfo (green) / JavLibrary (indigo) / JavBus (yellow) / frame (magenta).

**New features**
- **No-cover video auto-categorization (Requirement B)**: when library has no md / Excel sheet, all videos previously went "uncategorized". Now:
  - Videos **with source metadata** (javdbDetail.genres not empty, e.g. JavBus "HD" / "Subtitled") auto-categorized as auto-categories like "【JavBus】HD·Subtitled" (order 9000, after user categories, before unlisted);
  - Videos **without metadata** still go "uncategorized" (unchanged);
  - Sidebar "Categories" shows auto-categorized items under a separate "⚡ Auto-Categorized" group (purple divider title, distinguished from user categories);
  - Multiple videos with the same genres auto-fall into the same category, click to filter.

**Optimizations (Requirement A)**
- **Frame-fetch timeout fallback**: ffmpeg single frame (thumbnail cover / preview) killed after 30 seconds, preventing long videos or corrupted files from blocking scan / reconcile / completion;
- **Frame-fetch batch cap**: single reconcile / single batch completion max 200 videos for background frame-fetch, remaining wait for next round, preventing long concurrency pool occupation slowing other operations.

**Notes**
- Auto-categorization recalculates in real time based on javdbDetail.genres on every reconcile — categories auto-update when source metadata changes;
- If user later adds an entry for this code in md / Excel, next reconcile prioritizes sheet category; auto-categorization steps back automatically.

## v2.0.3 (2026-08-29)

**Rollback / fix**
- **Rolled back detail page UI changes**: restored detail page layout confirmed in v1.9.0 (`git checkout a08dbd0 -- VideoDetail.tsx`), removed "ffmpeg frame switch chips" and "JavLibrary blue badge" introduced in v2.0.0/v2.0.2 (these were the root cause of large blank areas and visual fragmentation indicated in red boxes).
- **Fixed large blank area on right side of detail page**: added `flex flex-col` to right column so content stacks vertically; added "File Info" card at bottom (filename / added / last played / duration / full path), pushed to bottom with `mt-auto`, fills the remaining height after grid stretch, **eliminates the blank area in red box regions**.

**New features**
- **First launch forces "User Notice" modal**: New `UserNoticeModal` component (official legal document style), covering:
  - App nature declaration (local management tool only, does NOT provide / store / distribute any video content)
  - User conduct code
  - Detailed legal provisions (**Criminal Law Art. 363 [crime of producing, duplicating, publishing, trafficking, disseminating obscene materials for profit]**, **Art. 364 [crime of disseminating obscene materials]**, Public Security Administration Punishments Law Art. 68, Cybersecurity Law Art. 12, Minors Protection Law Art. 51, Civil Code Art. 1019)
  - Special protection for minors, disclaimer
  - Checkbox "I have read and agree, don't show again on next launch" — checking writes `settings.noticeDismissed=true` permanently; closing without checking shows again next launch
  - **Cannot be dismissed with ESC, cannot be dismissed by clicking background** (compliance requirement: must actively confirm to continue using)

## v2.0.2 (2026-08-29)

**Optimizations**
- **Frame-fetch quality improved**: Covers and previews now use ffmpeg's official `thumbnail` filter (auto-analyzes N frames then picks the most representative one) — avoids black frames / static frames / fade-in-out dark frames. Adapts by video duration (starts at 100 frames, max 200).
- **List / grid card "Frame" purple badge**: ffmpeg frame covers show a purple `Frame` chip at top-left of EntryCard and ListView (thumbnail list), making it instantly distinguishable whether an image came from source or ffmpeg (also added JavLibrary blue chip).
- **Note**: old dark frames fetched before upgrade won't auto-re-fetch — detail page "re-frame" button can upgrade them one by one; batch upgrade can be triggered via javdb-info batch completion after library scan completes on home page.

## v2.0.1 (2026-08-29)

**Optimizations**
- **No-cover auto FFmpeg frame fallback**: Videos that failed to fetch across multiple sources (JavDB / JavBus / JavLibrary) no longer only show a gray placeholder — all three paths auto-frame to display a real image (1 cover + 15 previews at random time points):
  - **Scan enrichment**: When scanning library, force frame-fetch for videos without poster (no longer limited by `imagePriority` containing ffmpeg);
  - **Reconcile completion**: After auto / manual reconcile, async frame-fetch in background for videos still without poster (doesn't block reconcile return);
  - **Batch completion completion**: After "complete info" batch, async frame-fetch in background for videos still without poster (doesn't block completion return).
  - Framed covers saved independently at `posterPathFfmpeg`, coexist with source covers, freely switchable via detail page "Source image / FFmpeg Screenshot".

## v2.0.0 (2026-08-29)

**New feature · major version**
- **Sheets changed to Excel format (replacing md)**: New `src/main/lib/excel.ts` parser, supports directly selecting `收藏整理_2026.xlsx`-type sheet files (must contain a "Video code" column, e.g., "Sheet1" sheet). Excel's structured columns (code / category / recommended rating / description / theme / role / outfit / body type / behavior / play / scene / plot / other) fully mapped into the existing reconcile system (category → category group, code → video code, recommended rating → rating, each label column → structured tags). Library settings can configure "md sheet" and "Excel sheet" separately, **Excel takes priority, md is fallback**. md completely retained for compatibility.
- **Search only extracts non-Chinese codes**: `extractCode` comprehensively enhanced — supports unseparated codes (`KSJK013` → `KSJK-013`, old version only recognized `SONE-560` with separators, causing unseparated titles not searchable), strips Chinese / full-width / ad prefixes (`【Chinese subtitles】KSJK013` no longer pollutes search terms). javdb / javbus / javlibrary all share the same enhanced logic.
- **Scan supports "only scan > X MB"**: Settings → Data & Storage → "Skip small files" (default 100MB, 0 = don't filter). Scan and reconcile both skip files smaller than the threshold, ad sample videos / short videos no longer mix into the main list.
- **New JavLibrary source**: Settings → Network → Sources adds JavLibrary; manual mode can individually select this source for debugging; auto mode fallback chain becomes JavDB → JavBus → JavLibrary.
- **Cover / preview dual-cache + free switching**: Detail page cover gains "Source image / FFmpeg Screenshot" toggle button. Covers fetched from sources (javdb / javbus / javlibrary) and FFmpeg frame covers **saved independently** (`posterPathFfmpeg`), freely switchable at any time, no longer overwrite each other; clicking when FFmpeg frame doesn't exist auto-generates.

**Fixes**
- **Batch completion no longer false-stops**: `fetchDetailSmart` previously treated "search no results" (source really doesn't have this code, normal case) as consecutive failure, causing auto-stop / source switch even when user's IP wasn't blocked. Now only real network / session exceptions (request failed, timeout, age-gate fail) count toward failure; "no results / unrecognizable code" is silently ignored. javbus's "search no results" message also changed to silent.
- Batch completion executes at the interval set by user (`fetchIntervalMs`), no extra fixed delay stacking.









