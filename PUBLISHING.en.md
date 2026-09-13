# Yinghai · Publishing Guide

> For the release owner: versioning rules, build & signing, CI release, rollback and checklists.

## 1. Prerequisites

| Item | Detail |
| --- | --- |
| Node.js | 18+ (prefer the same major as CI) |
| Dependencies | `npm install` completed |
| Windows code signing | Place `build/yinghai-sign.pfx` in `build/` and set `CERT_PASSWORD` |
| GitHub release | `GH_TOKEN` |
| Gitee sync | `GITEE_TOKEN` |

## 2. Local build & packaging

```bash
npm run typecheck      # required before releasing
npm run build          # artifacts to dist/
npm run pack           # scripts/pack.mjs → electron-builder → release/
```

`scripts/pack.mjs` produces:

- `*.exe` — NSIS installer (bilingual language selection, running-app detection, uninstall retention guard)
- `*.7z` / `*.zip` — portable archives
- `*.blockmap` + `latest.yml` — auto-update metadata

> The output directory comes from `directories.output` in `electron-builder.yml` (default `release/`); override with `yinghai_PACK_OUT`.

## 3. Versioning

Semantic versioning `MAJOR.MINOR.PATCH`:

| Change | Bump | Example |
| --- | --- | --- |
| Incompatible / major | MAJOR | 2.x → 3.0.0 |
| Backward-compatible features | MINOR | 2.7.0 → 2.8.0 |
| Backward-compatible fixes | PATCH | 2.7.0 → 2.7.1 |

**Sync two places before releasing:**

1. `package.json` → `version` (single source of truth; the About dialog and the installed build both read it)
2. `更新日志.md` / `CHANGELOG.en.md` → add a top entry (turn `[Unreleased]` into `[x.y.z] - YYYY-MM-DD`, then add a fresh `[Unreleased]` section)

Optional: the "doc version / product version" fields in `产品需求文档.md`, `技术设计文档.md`, `交接文档.md` and their English counterparts.

## 4. Code signing

- `scripts/gen-cert.ps1` generates / verifies `build/yinghai-sign.pfx`.
- CI reads the certificate via `CERT_PASSWORD` and signs the installer.
- Without a certificate, signing is skipped and the installer triggers an OS warning — not recommended for production releases.

## 5. Release process

### 5.1 Automated (recommended)

1. Land features and docs on `main`; `npm run typecheck` must be green.
2. Bump the version in the three places and update the CHANGELOG.
3. Tag and push: `git tag v2.8.0 && git push origin v2.8.0`.
4. GitHub Actions (`.github/workflows/release.yml`) runs `scripts/publish-release.mjs`, uploading artifacts and creating the Release.

### 5.2 Manual

```bash
node scripts/publish.mjs     # needs GH_TOKEN; syncs to Gitee afterwards (needs GITEE_TOKEN)
```

### 5.3 Gitee sync

`scripts/publish.mjs` mirrors the GitHub release to the Gitee repository. If the sync fails, simply rerun the script.

## 6. Post-release checks

- [ ] The Release page contains the installer and archives, with `latest.yml` uploaded.
- [ ] The installer installs correctly; language selection, running-app detection and data retention all work.
- [ ] The installed app launches and reports the released version.
- [ ] In-app "Check for updates" detects the new version.
- [ ] Both zh-CN and en-US strings are complete.
- [ ] The CHANGELOG matches the actual changes.

## 7. Rollback

1. Metadata-only issues: fix the release notes or re-upload artifacts, keep the version number.
2. Defective artifacts: versions only move **forward** — ship a PATCH fix.
3. Temporary takedown: set the Release to Draft or delete it (keep the tag for traceability).
4. Always record the reason and impact scope in the CHANGELOG.

## 8. Notes

- There is **no** `publish` npm script; all releases go through the flows above.
- The installer includes the uninstall retention guard (`build/yinghai-uninstall-guard.ps1`), which must stay saved as **UTF-8 with BOM**, otherwise it fails to parse on Chinese Windows.
- Never release without a green `typecheck`.
