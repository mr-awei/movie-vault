# Yinghai · Publishing Guide

> For the release owner: versioning rules, build & signing, CI release, rollback and checklists.

## 1. Prerequisites

| Item | Detail |
| --- | --- |
| Node.js | 18+ (prefer the same major as CI) |
| Dependencies | `npm install` completed |
| Windows code signing | The certificate ships with the repository (`build/yinghai-sign.pfx`, with a `.gitignore` exception); the password comes from the `CERT_PASSWORD` env var / CI secret and is never committed |
| GitHub release credentials | **Nothing to configure** for CI publishing (`GITHUB_TOKEN` is injected by Actions); local manual publishing needs the `GITHUB_TOKEN` env var |
| Gitee sync | GitHub repository secret `GITEE_TOKEN` (a Gitee personal access token) — see 4.4 |

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

## 4. Code signing & release credentials

> **Two independent pfx files in the repository — do not confuse them**
>
> | File | Owner | Certificate subject | Notes |
> | --- | --- | --- | --- |
> | `build/yinghai-sign.pfx` | Yinghai (this repository's CI signing) | `CN=影海 yinghai, O=yinghai, C=CN` (expires 2031-09-14) | the workflow's `certificateFile` points at it; **the GitHub secret `CERT_PASSWORD` must be this certificate's password** |
> | `build/yingxia-sign.pfx` | YingXia (a separate product, still maintained) | `CN=影匣 YingXia, O=YingXia, C=CN` (expires 2031-08-27) | **never rename or delete** — that side still uses it |
>
> Yinghai generated its own certificate on 2026-09-14, thumbprint `50BAB905D077C2FA950CE0317D32624630451F9B`; the local signing script `scripts/sign.cmd` was updated to it.
> ⚠️ **A new certificate means a new password**: the old password no longer opens `yinghai-sign.pfx`, so the GitHub secret `CERT_PASSWORD` must be updated too — otherwise the CI signing step fails immediately.

### 4.1 Generate the self-signed certificate (once)

Run in **PowerShell** from the project root:

```powershell
# 1) Set the password first — it goes into a GitHub Secret later, so keep it safe
$env:CERT_PASSWORD = 'your-strong-random-password'

# 2) Generate the certificate and export the pfx (CN=影海 yinghai, valid 5 years)
powershell -ExecutionPolicy Bypass -File .\scripts\gen-cert.ps1
# → creates build\yinghai-sign.pfx and prints the thumbprint

# 3) (Optional) stop the local SmartScreen prompt by trusting it (needs admin)
Import-PfxCertificate -FilePath .\build\yinghai-sign.pfx `
  -CertStoreLocation Cert:\LocalMachine\Root `
  -Password (ConvertTo-SecureString $env:CERT_PASSWORD -AsPlainText -Force)
```

Then commit the certificate (`.gitignore` keeps an exception for it, otherwise `*.pfx` is ignored):

```bash
git add build/yinghai-sign.pfx
```

> For signing to work you need **the certificate file in the repository** and **the password in the CI secret**.
> A self-signed certificate does not remove the SmartScreen warning (only trusting it locally does); it only proves the installer was signed by this project's certificate.

### 4.2 Verify the password of an existing pfx

```powershell
# Replace <candidate>; printing Subject means the password is correct
$p = ConvertTo-SecureString '<candidate>' -AsPlainText -Force
$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 (Resolve-Path .\build\yinghai-sign.pfx), $p
$c.Subject
```

If the password is lost for good, regenerate per 4.1 (overwriting the file), commit, and update the secret.

### 4.3 GitHub repository secrets

Repository → **Settings → Secrets and variables → Actions → New repository secret**. Add two:

| Secret | Value | Purpose |
| --- | --- | --- |
| `CERT_PASSWORD` | the password chosen in 4.1 | injected as `CSC_KEY_PASSWORD`; electron-builder signs the installer with it |
| `GITEE_TOKEN` | Gitee personal access token (see 4.4) | creates/updates the Gitee Release after publishing; if unset the step warns and is skipped, the GitHub Release still publishes |

`GITHUB_TOKEN` is injected automatically (the workflow declares `permissions: contents: write`) — no manual setup.
Updating a secret does not require re-running old runs; the next tag picks it up.

### 4.4 What to do on Gitee

1. Make sure the same repository exists on Gitee (`gitee.com/mr-awei/movie-vault` for this project).
2. Create a **personal access token**: avatar → Settings → Security → Personal access tokens → generate, with scopes:
   - `projects` (repository read/write — required to create a Release)
   - `notes` (required by the workflow's sync step)
3. Paste the token into the GitHub secret `GITEE_TOKEN` from 4.3 (the token lives only in the GitHub secret; never in the repository).
4. Gitee has **no CI**: configure no secrets there and do not build there. The installer is built by GitHub Actions and hosted on the GitHub Release; the Gitee Release only carries download links (Gitee attachments are capped at 100MB).

### 4.5 What happens without a certificate

The workflow passes `--config.win.certificateFile=build/yinghai-sign.pfx`, so **a missing file makes electron-builder fail immediately** (the root cause of the failed v2.8.0 tag release).
To skip signing temporarily, comment out that parameter and `CSC_KEY_PASSWORD` — do **not** simply delete the pfx file.

## 5. Release process

### 5.1 Automated (recommended)

1. Land features and docs on `main`; `npm run typecheck` must be green.
2. Bump the version and update the changelog (chapter 3).
3. Commit and push to both remotes in one command:

```bash
node scripts/publish.mjs 2.8.1     # bump → commit → tag vX.Y.Z → push to Gitee + GitHub
```

4. GitHub receives the tag and runs `.github/workflows/release.yml`:

   `Typecheck` → `Build` → **signed packaging** (`release/*.exe`) → upload to the GitHub Release (body taken from the top of `更新日志.md`) → create/update the Gitee Release with `GITEE_TOKEN`.

### 5.2 Manual (bypassing CI)

```bash
GITHUB_TOKEN=ghp_xxx TAG=v2.8.1 node scripts/publish-release.mjs
```

`scripts/publish-release.mjs` calls the GitHub API directly to create the Release and upload artifacts from `release/` — useful when you already ran `npm run pack` locally.

### 5.3 Division of labour

| Side | Responsibility |
| --- | --- |
| GitHub | Hosts the code, runs Actions (build / sign / publish), hosts the installer (`scripts/publish.mjs` pushes code and tags) |
| Gitee | Mirrors the code (`scripts/publish.mjs` pushes `main` + tag); the **Release is created by GitHub Actions via the Gitee API** with download links in the body. No secrets needed on Gitee |

If the Gitee Release sync fails: check that `GITEE_TOKEN` (4.3) is valid and has the `projects` scope, then re-run the workflow (Actions → the failed run → Re-run failed jobs).

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
- The installer includes the uninstall retention guard (`build/yinghai-uninstall-guard.ps1`, bundled into `resources/` via `extraResources` in `electron-builder.yml`), which must stay saved as **UTF-8 with BOM**, otherwise it fails to parse on Chinese Windows.
- The guard currently coexists with the YingXia-era `build/yingxia-uninstall-guard.ps1` (**identical content**): packaging only uses the `yinghai-` one, the other is kept for the YingXia project. When changing the guard logic, **update both**, or delete the old name once YingXia has migrated.
- For renames (certificates, guards, any asset) update `.gitignore`, `electron-builder.yml`, `installer.nsh`, the workflow and this document together — and first confirm no parallel project still references the old filename.
- **Any `.ps1` containing Chinese must be saved as UTF-8 with BOM**: Windows PowerShell 5.1 decodes BOM-less scripts using the system ANSI codepage (GBK), so Chinese text breaks quoting and **the whole script fails to parse** (`scripts/gen-cert.ps1` was unrunnable for this reason). After editing such a script, actually run it once to verify.
- Never release without a green `typecheck`.
