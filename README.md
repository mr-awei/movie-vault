# Yinghai · 影海 (Movie Vault)

**English** · [简体中文](./README.zh-CN.md)

> A local-first desktop manager for your own movie collection. Point it at a video folder plus an Excel catalog, and it builds a browseable, searchable poster wall — **100% local, no upload, no telemetry, no account**.

![License](https://img.shields.io/badge/license-Yinghai%20Dual%20License%20v1.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)

---

## Overview

Yinghai turns an ordinary folder of video files into a curated, streamable-feeling library:

- the **Excel catalog is the single source of truth** for category, recommended score, synopsis and custom tags;
- **metadata, posters and cast** are enriched from public film databases, then cached locally forever;
- everything — database, posters, caches — lives on your own disk.

The application is a three-layer Electron app (main / preload / renderer) written in TypeScript, with no server component and no outbound analytics.

> **Disclaimer** — Yinghai is a **local file organizer**. It does not host, provide, distribute, stream or share any video content. All metadata comes from public film databases. You are responsible for ensuring you have the right to access the media in your own collection.

## Highlights

### Library & browsing
- Poster wall with **three densities** (immersive / standard / compact) and portrait / landscape / filename-list modes.
- **Virtual scrolling** — DOM size stays constant regardless of library size (thousands of titles stay smooth).
- Netflix-style hover preview panel, hover synopsis, six sort orders (added / title / year / score / last played / random).
- Smart filters: favorites, recently played, unrated, no-poster, untracked, plus tag / cast / studio / series / category / resolution / duration / score / year facets.
- Home dashboard: hero shuffle, daily recommendation, cross-library random rows, statistics panel.

### Catalog
- Excel sheet is authoritative: `Title | Category | Recommended score | Synopsis`, **any extra column becomes a generic tag group** (no fixed schema).
- Guided sheet wizard generates an AI prompt that matches the real schema, and re-import / re-reconcile at any time.
- Automatic reconciliation between folder contents and the catalog: missing entries, untracked files, one-click advertisement cleanup for filenames.

### Metadata enrichment
- Five sources with automatic fallback: **MovieDB (TMDb) · OMDb · OpenLibrary · JustWatch · Wikipedia**.
- Draggable source order, per-source enable/disable, single-source debug mode; API keys optional and stored locally only.
- Batch enrichment supports concurrency / interval throttling, **pause / resume / stop**, per-item retry, and a live "source failed → degrade to next source" log.
- Failure report shows exactly which items failed and why; manual query / ID input is available for hard cases.

### Media & covers
- Poster priority chain: manual cover → sidecar image → data-source poster → ffmpeg frame → generated placeholder.
- ffmpeg fallback: random multi-point sampling with quality scoring (rejects black / white / blurry / monotone frames) to build a cover and a preview set.
- One-click re-frame, set preview frame as cover, switch between data-source poster and ffmpeg cover.

### File lock
- Lock any number of titles (individually or via multi-select) so **batch and force-batch enrichment skip them automatically**; manual update on the detail page still works.
- After each batch run the app reports exactly which files were skipped, and offers "unlock all".

### Safety & privacy
- **Privacy shield** — blur every preview image with one click (screenshot-safe), optionally on by default.
- **Deletion lock** — protect delete / library-removal with a SHA-256 password (salt + hash, never stored in plaintext).
- Deleting a file moves it to the **system recycle bin** (restorable), and offers to take the whole seed folder along when it contains nothing else.
- Configurable HTTP / HTTPS / SOCKS4 / SOCKS5 proxy for all outbound requests.
- Uninstall keeps your data by default, guarded by an NSIS + PowerShell retention script.

### Experience
- Bilingual UI (Simplified Chinese / English), dark / light / follow-system themes, minimize-to-tray, launch at login.
- In-app update check (GitHub / Gitee), day / week / month frequency, in-app release notes.
- Non-destructive store: automatic schema migration on startup, external-edit detection, batched checkpoint writes.

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Electron 31 |
| Build | electron-vite 2 · Vite 5 · electron-builder 24 |
| UI | React 18 · TypeScript 5.5 · Tailwind CSS 3 |
| Data | Single JSON document store (`data.json`) with schema migration + debounced atomic writes |
| Media | ffmpeg / ffprobe (bundled or system) |
| Network | undici · socks / socks-proxy-agent |
| Catalog | xlsx (SheetJS) |
| i18n | In-house lightweight dictionary (zh-CN / en-US) |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Renderer (React 18 + Tailwind)                           │
│  App.tsx · HomeView / VirtualizedWall / ListView         │
│  VideoDetail · SettingsModal · ReconcileDialog …         │
└───────────────▲──────────────────────────┬───────────────┘
                │ window.api (contextBridge)│  events
                │ typed IPC invoke          │  scan:progress
┌───────────────┴──────────────────────────▼───────────────┐
│ Main process                                             │
│  scanner → reconcile → fetch-meta (5 sources)            │
│  images (ffmpeg) · repo/store (data.json) · proxy        │
│  ipc.ts (all handlers)                                   │
└──────────────────────────────────────────────────────────┘
        ▲ typed by shared/types.ts · shared/ipc.ts
```

`src/shared` holds the type contracts used by both sides, so an IPC signature change fails `npm run typecheck` immediately.

## Getting started

**Requirements** — Node.js 18+, npm 9+. ffmpeg is detected from `PATH` or bundled; it is only needed for frame fallback, not for basic browsing.

```bash
npm install
npm run dev          # start in development (electron-vite dev)
npm run typecheck    # full tsc check for main + renderer
npm run build        # produce dist/ artifacts
npm run pack         # build + electron-builder installer into release/
```

| Script | Purpose |
| --- | --- |
| `dev` | Development runtime with HMR for the renderer and auto-restart for main |
| `typecheck` | `tsc --noEmit` over `tsconfig.json` and `tsconfig.node.json` |
| `build` | Compile main / preload / renderer bundles |
| `pack` | Build then run `scripts/pack.mjs` to produce the NSIS installer / archives |
| `preview` | Run the built bundles like production |

## Data & privacy

- Data directory: `%APPDATA%/local-movie-vault` (Windows), `~/Library/Application Support/local-movie-vault` (macOS), `~/.config/local-movie-vault` (Linux).
- `data.json` — libraries, videos, metadata, settings (single document, migrated in place).
- `posters/` — cached covers and preview frames; safe to delete, will be re-fetched on demand.
- No account, no cloud sync, no analytics. Outbound network requests happen only when you trigger enrichment, poster fetch or update check, and all of them respect the proxy settings.

## Project layout

```
src/
├── main/                 # Electron main process
│   ├── lib/
│   │   ├── ipc.ts        # every IPC handler
│   │   ├── scanner.ts    # folder walk → records
│   │   ├── reconcile.ts  # catalog vs folder reconciliation
│   │   ├── fetch-meta.ts # 5-source fallback orchestrator
│   │   ├── movie-db.ts / omdb.ts / openlibrary.ts / justwatch.ts / wikipedia.ts
│   │   ├── images.ts     # ffmpeg frame fallback & poster cache
│   │   ├── store.ts      # data.json load / migrate / debounced save
│   │   └── repo.ts       # video / library / settings repository
│   └── assets/           # bundled guides
├── preload/              # contextBridge → window.api
├── renderer/src/         # React UI (components, lib, App.tsx)
└── shared/               # types, IPC channel names, i18n, code helpers
build/                    # NSIS template, uninstall guard
scripts/                  # pack / publish / certificate helpers
docs/                     # topic guides
```

## Documentation

| Document | Audience | Content |
| --- | --- | --- |
| [PRD](./PRD.en.md) · [中文](./产品需求文档.md) | Product / QA | Positioning, personas, numbered requirements, acceptance criteria |
| [TDD](./TDD.en.md) · [中文](./技术设计文档.md) | Engineers | Architecture, modules, IPC list, storage, key sequences, security |
| [HANDOFF](./HANDOFF.en.md) · [中文](./交接文档.md) | Maintainers | Onboarding, key files, verification checklist, gotchas |
| [PUBLISHING](./PUBLISHING.en.md) · [中文](./发布说明.md) | Release owner | Versioning, signing, CI release, rollback |
| [CHANGELOG](./CHANGELOG.en.md) · [中文](./更新日志.md) | Everyone | Release notes |
| [docs/](./docs) | Topic readers | Frame fallback & auto-categorization, data-source integration |
| [Scoring & Synopsis Guide](./src/main/assets/Scoring_and_Synopsis_Guide.en.md) | Catalog authors | Authoritative rubric for category, rating and synopsis writing (bundled with the app, also opened from the sheet wizard) |

## Contributing

1. Branch from `main`, keep changes focused.
2. Run `npm run typecheck` before opening a pull request — CI treats it as a gate.
3. For user-facing changes, update `CHANGELOG.en.md` / `更新日志.md` and the relevant doc under `docs/`.

Issue reports are welcome; please include the app version (About dialog), OS version and reproduction steps.

## License

Released under the **Yinghai Dual License v1.0** — free for non-commercial use; commercial use requires a license. See [LICENSE](./LICENSE) for the full bilingual text. Commercial licensing: `new_mr_awei@163.com`.
