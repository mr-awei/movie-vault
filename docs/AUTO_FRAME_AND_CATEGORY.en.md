# Frame Fallback & Auto-Categorization

> Yinghai (Movie Vault): a local-first movie library manager. For managing your own local files only; it does not distribute any content.
>
> This document describes the current implementation of cover resolution, ffmpeg frame extraction and auto-categorization. Parameters and thresholds live in `src/main/lib/images.ts` and `src/main/lib/reconcile.ts`.

## 1. Why frame fallback is needed

Covers come first from data sources (MovieDB / OMDb / OpenLibrary / JustWatch / Wikipedia). When a title has no poster there, or the user is offline, the app samples frames from the local video with ffmpeg to produce a cover and a preview set — no blank cards.

## 2. Cover resolution priority

`resolvePoster()` walks the library's configured `imagePriority` chain:

| Order | Source | Notes |
| --- | --- | --- |
| 1 | `manual` | Cover explicitly chosen by the user ("set as cover") |
| 2 | `sidecar` | Same-name image in the video folder, folder-name image, or a generic name (`poster`, `cover`, `folder`, …; jpg / jpeg / png / webp / bmp) |
| 3 | Data source | Poster returned by MovieDB / OMDb / OpenLibrary / JustWatch / Wikipedia (downloaded and cached locally) |
| 4 | `ffmpeg` | Frame extracted from the video |
| 5 | `placeholder` | Built-in gradient + initial, so a card is never blank |

> The list, the detail page and related recommendations share this chain, so "list has a poster but detail shows a placeholder" cannot happen.

## 3. Extraction strategy

### 3.1 Preview set (`generatePreviewSet`)
One call produces both the cover and the preview set:

| Step | Strategy |
| --- | --- |
| Cover candidates | **12** random timestamps, each scored, best wins |
| Preview candidates | **22** random timestamps, top **15** kept (`PREVIEW_COUNT`) |
| Sampling window | Skips roughly the first and last 5%; start no earlier than 5s; assumes 600s when duration is unknown |
| Concurrency | **4** parallel captures and **4** parallel quality analyses |
| Timeout | **30s** per capture; the child process is killed on timeout |
| Fallback | If no cover candidate passes but previews exist, the best preview becomes the cover |

### 3.2 Single-frame cover (`generateFrame`)
Used by the `ffmpeg` step of the resolution chain (controlled by `allowFfmpeg` during scan enrichment):

- Uses ffmpeg's `thumbnail` filter to auto-pick the most representative frame;
- Analyses `n = clamp(dur / 30, 100, 200)` frames, balancing short and very long videos;
- Output width fixed at `480` to keep the cache small.

### 3.3 Frame quality scoring
Each candidate is downscaled to **8×8 grayscale** and scored:

```
ok = (25 ≤ mean luma ≤ 230) and (variance ≥ 400)
```

- The luma window rejects pure black / pure white frames;
- The variance floor rejects blurry or monotonous frames;
- Candidates are sorted by variance descending; **if none passes, the highest-variance frame is used as a fallback**.

### 3.4 Failure handling & cool-down
- A failed capture (corrupted file, timeout) records a `frameFailedAt` timestamp;
- Batch jobs skip that file during the cool-down (~7 days) so they never repeatedly hang on the same broken file;
- Background framing per batch run is capped (200 items) to avoid saturating the CPU on large libraries.

### 3.5 Cache & file naming

All inside the poster cache directory:

| File | Purpose |
| --- | --- |
| `<videoId>.jpg` | Cover |
| `<videoId>_preview_<n>.jpg` | Nth preview frame |
| `<videoId>_cover_cand_<n>.jpg` | Temporary cover candidate (deleted afterwards) |
| `<videoId>_preview_cand_<n>.jpg` | Temporary preview candidate (deleted afterwards) |

When a cover file is overwritten at the same path, the renderer appends a cache version (`?v=N`) to force an immediate refresh.

## 4. Auto-categorization

When a library has **no Excel catalog** configured (or a title is not covered by it), the app categorises by the source genres:

- With metadata (`meta.genres` non-empty) → grouped as `【Source】genre1·genre2` (e.g. `【MovieDB】Drama·Thriller`), order weight `9000`;
- Without metadata → grouped as "uncategorized" (weight `0`);
- Auto-categorization never overrides a catalog-defined category, and `kind` stays matched.

Implemented in `src/main/lib/reconcile.ts` (no-catalog branch). Genres pass through a shared sanitizer that strips numeric suffixes, brackets and pure separators.

## 5. Parameter reference

| Parameter | Value | Location |
| --- | --- | --- |
| Cover candidate samples | 12 | `images.ts` |
| Preview candidate samples | 22 | `images.ts` |
| Preview count `PREVIEW_COUNT` | 15 | `images.ts` |
| Head / tail skip | 5% each | `images.ts` |
| Minimum sample start | 5s | `images.ts` |
| Capture concurrency | 4 | `images.ts` |
| Per-capture timeout | 30s | `images.ts` |
| Luma threshold | 25 – 230 | `images.ts` |
| Variance threshold | ≥ 400 | `images.ts` |
| Single-frame analysis frames | `clamp(dur/30, 100, 200)` | `images.ts` |
| Single-frame output width | 480 | `images.ts` |
| Background framing cap per run | 200 items | `ipc.ts` |
| Failure cool-down | ~7 days | `ipc.ts` |
