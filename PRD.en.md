# Yinghai · Product Requirements Document (PRD)

> A local-first desktop manager for your own movie collection. It does not host, distribute or share any content; all data stays on the user's machine.

## Document info

| Item | Value |
| --- | --- |
| Product | Yinghai (Movie Vault) |
| Doc version | v2.8.0 |
| Product version | v2.8.0 |
| Status | Active |
| Last updated | 2026-09-14 |
| Related | [TDD.en.md](./TDD.en.md) · [CHANGELOG.en.md](./CHANGELOG.en.md) · [HANDOFF.en.md](./HANDOFF.en.md) |

---

## 1. Background & goals

### 1.1 Background
People with large local video collections face three recurring problems:

1. **A folder is all they have** — only filenames, no category, synopsis or score; browsing is nothing like a streaming service.
2. **High maintenance cost** — hand-maintained spreadsheets and naming conventions are hard to sustain; metadata is scattered.
3. **Privacy concerns** — online library services require uploads and accounts; users do not want private collections indexed.

### 1.2 Goals
| ID | Goal | Measurement |
| --- | --- | --- |
| G1 | Turn a video folder into a browseable, searchable poster library | A 25-title library renders its first screen within 3s |
| G2 | Use one Excel catalog as the single authoritative category source | Re-reconciling applies every catalog change |
| G3 | Automatic metadata enrichment with permanent local cache | After one fetch, detail pages work fully offline |
| G4 | Zero upload, zero account, zero telemetry | Network requests only on explicit user action |

### 1.3 Non-goals
- No online playback / download / distribution of video content;
- No cloud sync, no account system, no social sharing;
- No bundled content sources, no scraping of copyrighted content itself;
- Not a replacement for multi-device media servers (Plex / Jellyfin class).

---

## 2. Users & scenarios

### 2.1 Personas
| Persona | Traits | Core need |
| --- | --- | --- |
| Collector | 100–10,000 local titles, already organized | Fast browsing, clear categories, good-looking covers |
| Curator | Maintains an Excel catalog long term | Catalog edits are reconciled accurately |
| Privacy-first | Refuses uploads / accounts | Fully local, usable offline, portable data |
| Presenter | Home theater / large screen | Immersive wall, hover preview, statistics |

### 2.2 Key scenarios
1. **First-time setup** — pick a video root + Excel catalog → scan → reconcile → poster wall.
2. **Catalog update** — edit the spreadsheet, click "Scan library", categories / scores / synopses refresh.
3. **Batch enrichment** — enrich titles missing covers or details, retry failures separately.
4. **Manual correction** — wrong metadata → type a query / ID and refetch.
5. **Protect results** — lock finished titles so later batch runs never overwrite them.
6. **Housekeeping** — find missing / untracked entries, clean advertisement text from filenames.

---

## 3. Functional requirements

> Priority: P0 must ship; P1 important; P2 enhancement.

### 3.1 Library management (FR-100)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-101 | Add a library: name, video root, Excel catalog | P0 | Clear errors for a missing folder or malformed catalog |
| FR-102 | Multiple libraries with independent switching | P0 | Categories, stats and recommendations follow the active library |
| FR-103 | Scan: walk the folder and create records (extension + minimum-size filters) | P0 | Progress is visible; repeated scans create no duplicates |
| FR-104 | Detect renamed files and keep existing metadata | P1 | Renaming a file outside the app does not lose metadata or covers |
| FR-105 | Purge stale records whose file no longer exists | P1 | After a scan, record count matches the files on disk |
| FR-106 | Remove a library (guarded by the deletion lock) | P1 | Requires password verification |

### 3.2 Catalog & reconciliation (FR-200)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-201 | Parse the catalog: `Title / Category / Score / Synopsis` | P0 | Tolerates legacy headers and column reordering |
| FR-202 | Extra columns become generic tag groups (no fixed schema) | P0 | Detail page groups tags by column name |
| FR-203 | Reconcile: report "missing from disk" and "untracked file" | P0 | Counts and per-item details are clickable |
| FR-204 | Ignore / un-ignore untracked entries | P1 | Ignored items stay in the "untracked" filter |
| FR-205 | One-click filename advertisement cleanup (preview → apply) | P1 | A failed rename keeps metadata and reports the reason |
| FR-206 | With no catalog, show per-file entries and auto-categorize by source genres | P1 | No duplicate entries or duplicate React keys |

### 3.3 Browsing & search (FR-300)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-301 | Three view modes: portrait grid, landscape grid, filename list | P0 | Switching keeps active filters |
| FR-302 | Three poster densities | P1 | Persisted across restarts |
| FR-303 | Virtual scrolling | P0 | 5,000-title library stays smooth; DOM size is constant |
| FR-304 | Hover preview panel (cover, title, score, tags, synopsis) | P1 | Opens after 1s, closes on mouse-out / scroll |
| FR-305 | Search across title / filename / synopsis / tags / cast (case-insensitive) | P0 | Live filtering with an empty-state message |
| FR-306 | Sort by added / title / year / score / last played / random | P0 | Ascending / descending toggle |
| FR-307 | Smart filters: all / favorites / recent / unrated / no poster / untracked | P1 | Composable with facet filters |
| FR-308 | Facets: tag / cast / studio / series / category / resolution / duration / score / year | P1 | Selected facets shown as removable chips, clear-all supported |
| FR-309 | Home dashboard: hero, daily recommendation, cross-library random, stats | P2 | No repeats; manual refresh |

### 3.4 Metadata enrichment (FR-400)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-401 | Five sources with automatic fallback: MovieDB → OMDb → OpenLibrary → JustWatch → Wikipedia | P0 | Stops on first hit; every attempt is logged |
| FR-402 | Drag-reorder and per-source enable / disable | P0 | Disabled sources make no requests |
| FR-403 | Single-source debug mode | P2 | Force one specific source |
| FR-404 | Batch enrichment with concurrency / interval, pause / resume / stop | P0 | Pause stops new requests; stop collapses the progress panel |
| FR-405 | Failure report with per-item reason and retry-all | P0 | Retry touches failures only |
| FR-406 | Manual query / ID refetch | P1 | Prompted automatically on failure; also a permanent toolbar entry |
| FR-407 | "Update from URL" on the detail page | P1 | Invalid links produce a clear message |
| FR-408 | Consecutive network failures circuit-break a source | P1 | It degrades to the next source and says so in the log |

### 3.5 Covers & frames (FR-500)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-501 | Cover priority: manual → sidecar image → data source → ffmpeg → placeholder | P0 | List and detail page share the same chain |
| FR-502 | ffmpeg fallback with random multi-point sampling and quality scoring | P1 | Rejects black / white / blurry / monotone frames |
| FR-503 | Preview set: view, zoom, set as cover | P1 | Setting a cover refreshes the list immediately |
| FR-504 | Re-frame (per item / detail page) | P1 | Sampling points differ each run and overwrite the result |
| FR-505 | Cool-down marking for failed frames | P1 | Batch jobs skip the broken file during the cool-down |

### 3.6 File lock (FR-600)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-601 | Lock / unlock a single item (card, context menu, detail page) | P0 | A lock badge appears |
| FR-602 | Multi-select batch lock / unlock with select-all, invert, clear | P0 | The action bar shows the live selection count |
| FR-603 | Normal and force batch enrichment skip locked items | P0 | The progress panel shows "N locked skipped" |
| FR-604 | Post-run report of every skipped file | P0 | Listed in a modal; open details or unlock all |
| FR-605 | Manual detail-page refetch is not blocked by the lock | P0 | Locked items can still be updated manually |
| FR-606 | Lock state survives scan / reconcile batch writes | P0 | Locks are never wiped by a background job |

### 3.7 Privacy & safety (FR-700)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-701 | Privacy shield: blur every preview image, optionally default-on | P0 | Persisted across restarts |
| FR-702 | Deletion lock: salted SHA-256 password for delete / library removal | P1 | Wrong attempts are counted and reported |
| FR-703 | Delete to the system recycle bin; optionally take an otherwise-empty folder | P0 | Pre-check result shown before double confirmation |
| FR-704 | Proxy: HTTP / HTTPS / SOCKS4 / SOCKS5 / system | P1 | Connectivity test provided |
| FR-705 | Uninstall keeps user data by default | P1 | The uninstaller prompts and honours the choice |

### 3.8 Settings & updates (FR-800)

| ID | Requirement | Pri | Acceptance |
| --- | --- | --- | --- |
| FR-801 | Appearance: theme, density, default sort, list display mode | P1 | Applied immediately and persisted |
| FR-802 | General: external player, ffmpeg path, language, startup behaviour | P1 | Invalid paths are reported |
| FR-803 | Data sources: API keys, order, enabled state | P0 | Keys stay local only |
| FR-804 | Update check: GitHub / Gitee with configurable frequency | P2 | Shows version, notes and download entry |
| FR-805 | About: version, stack, third-party credits, in-app license modal | P2 | License readable in-app; contact email copyable |

---

## 4. Information architecture

```
Sidebar
├── Home (hero / daily recommendation / cross-library random / stats)
├── Browse (poster wall / filename list / facets)
├── Smart filters (favorites / recent / unrated / no poster / untracked)
├── Libraries (multi-library switch)
└── Settings / Statistics / About
```

Detail-page information priority: title → cover and previews → metadata (year / duration / score / category / studio / series / director) → synopsis → tags → cast → related titles.

---

## 5. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | 5,000-title first screen ≤ 3s; 60fps scrolling; batch enrichment never blocks the UI; large writes are checkpointed |
| Reliability | Atomic replace + debounced writes; an unexpected shutdown loses at most one checkpoint batch; schema migrates on startup |
| Compatibility | Windows 10+ / macOS 11+ / Linux; zh-CN and en-US; HiDPI aware |
| Privacy | No account, no telemetry; network only on explicit user action; keys and passwords stay local |
| Maintainability | Shared three-layer types; `npm run typecheck` green is the merge gate; docs evolve with code |
| Observability | Console tracing for key flows; a dedicated frame-extraction log for troubleshooting |

---

## 6. Release acceptance criteria

1. New library → scan → reconcile → the poster wall renders with catalog-accurate category / score / synopsis.
2. A 5,000-title library scrolls, filters and searches without stutter.
3. Batch enrichment can pause / resume / stop; failures retry; the five-source fallback log is visible.
4. Locked items are skipped by both normal and force batch enrichment, with a post-run report.
5. Titles without a poster get a cover and preview set via ffmpeg.
6. Privacy shield, deletion lock, recycle-bin delete and the uninstall retention guard all work.
7. No missing strings when switching zh-CN ↔ en-US; `npm run typecheck` passes.

---

## 7. Metrics

| Metric | Target |
| --- | --- |
| First-time library setup success (incl. no-catalog users) | ≥ 98% |
| Batch enrichment hit rate (at least one source) | ≥ 90% |
| Failure entries per 1,000 titles | ≤ 50 |
| Crash rate per session | 0 |
| Network requests beyond explicit user action | 0 |

---

## 8. Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| v2.0–v2.2 | Library setup, reconciliation, poster wall, basic enrichment | Shipped |
| v2.3–v2.4 | Large-library performance, virtual scrolling, frame quality, controllable batch jobs | Shipped |
| v2.5–v2.6 | Tag layering, catalog matching improvements, update check, uninstall flow | Shipped |
| v2.7 | Dual license, in-app license modal, documentation overhaul | Shipped |
| v2.8 (planned) | Richer file locking, self-healing stale data, search experience | In progress |

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Source rate limiting / anti-scraping | Lower enrichment success | Concurrency + interval throttling, circuit breaker, multi-source fallback, local cache reuse |
| Files renamed / moved outside the app | Stale records | Content-fingerprint rename detection; automatic purge of stale records |
| Slow writes on huge libraries | UI stalls / data loss | Coalesced writes, checkpointed batches, atomic replace |
| External / network drive offline | False "missing" detection | Purging requires this scan to have actually read files |
| Non-standard catalog format | Reconciliation fails | Multi-header tolerance, column-order tolerance, guided wizard |

---

## 10. Appendix: glossary

| Term | Meaning |
| --- | --- |
| Library | A video root folder plus one Excel catalog |
| Catalog | The Excel file that authoritatively defines category / score / synopsis |
| Reconcile | Compare catalog entries against files on disk and classify them |
| Meta | Metadata fetched from a source: title, year, score, genres, cast, synopsis … |
| externalId | A source-side identifier (TMDb ID / IMDb ID / work key) |
| Frame fallback | Using ffmpeg to grab video frames as cover / previews when no poster exists |
| Lock | Marks a title as excluded from batch enrichment, protecting manual fixes |
