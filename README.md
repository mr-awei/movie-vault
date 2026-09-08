# YingXia (影匣)

<div align="center">
  <strong><a href="README.md">English</a></strong>
  <span> · </span>
  <a href="README.zh-CN.md">中文</a>
</div>

<div align="center">
  <strong>v2.7.0</strong> ·
  <span>2026-09-09</span> ·
  <a href="CHANGELOG.en.md">Changelog</a>
</div>

<br />

## Local Video Poster Wall Manager · Excel-Sheet-Driven Private Library

**Core principle: 100% local. No data collection. No outbound transmission.**

YingXia is a Windows desktop app that turns a local video folder into a beautiful poster-wall library. Pair it with an Excel sheet (your personal catalog) and the app will organize, categorize, and enrich your collection automatically — while keeping every byte of metadata on your own machine.

> ⚠️ This tool is intended for managing **locally owned video collections**. It does not distribute, upload, or share any content.

---

## Key Features

### 📊 Excel-Sheet-Driven Catalog
- Your spreadsheet is the single source of truth for `Category / Rating / Synopsis / Theme / Role / Costume / BodyType / Behavior / Play / Scene / Plot / Other`
- Reconcile it against the folder anytime — the detail page renders every non-empty tag group from your sheet as-is
- AI-generated Chinese headers are auto-mapped to the English schema

### 🖼️ Poster Wall Browsing
- Three density levels (immersive / standard / compact), 1s hover-to-zoom delay
- Smooth virtual scrolling for large libraries
- Choose "flat view" or "grouped by category" as the default in Settings

### 🔍 Smart Metadata Fetch
- Auto-identifies video codes and fetches metadata from configurable sources (JavDB, JavBus, JavLibrary, Javapi, Javinfo) with automatic fallback
- Drag-to-reorder sources, pause/resume/stop the batch, per-video failure reasons shown both as a toast and inline in the detail page
- Manual code input after failed backfill

### 🎬 Series Episodes & Frame Extraction
- Multiple files for the same code (e.g. `SONE-560_1.mp4`, `SONE-560_2.mp4`) show as one card; the detail page lists episodes and lets you switch
- When no source cover is available, ffmpeg extracts 12–22 candidate frames and automatically rejects black, white, blurry, or monotonous frames
- Auto-framing and manual "Re-frame" share the same multi-frame pipeline

### 🛡️ Privacy & Security
- Zero uploads: the app never transmits any user data to any server
- One-click blur of all covers, deletion lock with SHA-256 verification
- Choose to keep or delete app data on uninstall; media library folders are guarded and never touched

### 🌐 Bilingual & Internationalization
- Installer first-screen language selection (Simplified Chinese / English), applied on first launch
- Switch UI language anytime in Settings
- English user notice shows a generic disclaimer without referencing specific laws

### ⚙️ System Integration
- Windows NSIS installer, auto-start on boot, tray minimization
- Automatic update check (GitHub / Gitee dual release)
- Configurable HTTP / HTTPS / SOCKS5 proxy covering both Node.js requests and the Chromium network stack
- Statistics & discovery: filter by tag / series / custom field, view totals, largest files, random picks, and favorites

---

## Excel Sheet Schema

The app expects an **English-header** sheet with columns in this order:

| Column | Purpose |
| --- | --- |
| Code | Video code (e.g. `SONE-560`) — **required** |
| Rating | Your personal rating (optional) |
| Category | Single-value category, shown as a MetaRow in the detail page |
| Theme | Theme tags |
| Role | Role tags |
| Costume | Costume tags |
| BodyType | Body type tags |
| Behavior | Behavior tags |
| Play | Play tags |
| Scene | Scene tags |
| Plot | Plot tags |
| Other | Other tags |

AI-generated sheets usually produce **Chinese headers**. The onboard wizard auto-maps common Chinese header names to the English schema above before writing to disk.

---

## Tech Stack

- **Desktop**: Electron 31 + electron-vite
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Build & packaging**: electron-builder (Windows NSIS installer)
- **Data**: Local JSON + Excel (xlsx) parsing
- **Media**: ffmpeg / ffprobe (system or bundled fallback)

---

## Installation & Uninstall

- **Download**: Get the latest installer from the [GitHub Releases](https://github.com/mr-awei/yingxia-video-manager/releases) page (mirrored to Gitee)
- **Install**: Run `YingXia Setup x.x.x.exe`. Pick your UI language on the first screen; it is saved and applied on first launch.
- **Uninstall**: Use *Apps & features* (Windows) or the Start-menu entry. You will be asked whether to **keep** or **delete** your app data (`%APPDATA%\local-video-manager`). Your media libraries and media files are **never** touched.

---

## Development

```bash
npm install
npm run dev        # start dev mode (DevTools opens automatically)
npm run build      # build renderer + main + preload
npm run typecheck  # TypeScript type checking
npm run pack       # clean + build + electron-builder installer
```

---

## Version History

**v2.7.0** (2026-09-09) — License switched to dual license + in-app license modal + full documentation rewrite

- Open source license switched from MIT to "Ying Xia Dual License v1.0" (bilingual five-chapter structure)
- New in-app open source license modal (`LicenseModal`), accessible from About modal footer
- License modal supports bilingual auto-switch and one-click email copy
- PRD / README / CHANGELOG fully updated to v2.7.0

Older releases: see [CHANGELOG.en.md](CHANGELOG.en.md).

---

## Privacy Statement

1. **Zero uploads**: The app never transmits any user data — no video lists, no tags, no ratings, no file paths, no filenames — to any server.
2. **Local-only storage**: All data lives in `%APPDATA%\local-video-manager\data.json`. Back it up or delete it at any time.
3. **Anonymous network requests**: Outbound requests are only made when you explicitly configure a cover/metadata source. Requests carry no identifying headers (anonymous User-Agent, no cookies).
4. **Works fully offline**: With the network disconnected, every core feature — scanning, browsing, details, playback, reconciliation — functions normally. Only the optional fetch features stop.

---

## License

This project is licensed under the **Ying Xia Dual License v1.0**.

- ✅ **Non-commercial use is free** (individuals, non-profit organizations, educational institutions)
- 💰 **Commercial use requires authorization** (contact new_mr_awei@163.com)
- 🚫 **Strictly prohibited for malicious programs** (three-layer protection: anti-tampering/injection, anti-embedding into malware, anti-use with malware)
- ⚖️ **Author reserves the right to sue violators**

See [LICENSE](./LICENSE) for details.

---

## Contact

- Commercial license: new_mr_awei@163.com
- Repository: [GitHub](https://github.com/mr-awei/yingxia-video-manager) · [Gitee](https://gitee.com/mr-awei/yingxia-video-manager)
