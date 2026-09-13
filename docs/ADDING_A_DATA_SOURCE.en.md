# Adding a New Data Source · Developer Guide

> Yinghai (Movie Vault): a local-first movie library manager. For managing your own local files only; it does not distribute any content.
>
> For engineers: which files to touch when integrating a new metadata source, and which conventions to follow. The example uses `newsrc`.

## 0. Conventions

- Each source is a standalone module exporting `fetchXxxDetail(query, settings, onError?, manual?)` and a "configured?" predicate.
- **Every** outbound request must go through `src/main/lib/proxy.ts` so proxy settings apply.
- Return `MovieMeta | null`; never throw to the caller.
- Descriptive strings go through i18n; brand names (e.g. `MovieDB`) stay fixed English.

Built-in sources: `moviedb` (MovieDB / TMDb), `omdb` (OMDb), `openlibrary` (OpenLibrary), `justwatch` (JustWatch), `wikipedia` (Chinese Wikipedia).

---

## 1. Types & defaults — `src/shared/types.ts`

1. Extend the `SourceId` union:

```ts
export type SourceId = 'moviedb' | 'omdb' | 'openlibrary' | 'justwatch' | 'wikipedia' | 'newsrc'
```

2. If the source needs an API key, add a field to `Settings` (e.g. `newsrcKey: string`) with a `''` default in `DEFAULT_SETTINGS`.

> `SourceId` is a union: missing any spot fails `npm run typecheck` immediately.

## 2. Fetch implementation — `src/main/lib/newsrc.ts`

Export:

```ts
export async function fetchNewSrcDetail(
  query: MovieQuery,          // already cleaned by extractMovieQuery
  settings: Settings,
  onError?: (msg: string) => void,
  manual?: boolean
): Promise<MovieMeta | null>

export function hasNewSrcKey(settings: Settings): boolean
```

Requirements:

- Return `null` immediately when no key is configured (make no request).
- Route requests through `lib/proxy.ts`.
- Fill `uid` / `externalId` / `title` / `genres` / `actors` etc., and set `source: 'newsrc'`, `parseVer: 2`, `fetchedAt`.
- Pass genre labels through `cleanGenreName()`.
- Prefer returning a downloadable image URL for the cover (the upper layer downloads and caches it).

## 3. Wire it into the orchestrator — `src/main/lib/fetch-meta.ts`

1. Add `'newsrc'` to `DEFAULT_SOURCE_ORDER`.
2. Add a branch to the `auto` fallback loop covering the six states: not-configured / disabled this run / trying / hit / no-result / network-failed; on hit `return { detail, source: 'newsrc' }`.
3. Add the single-source debug branch `if (mode === 'newsrc') { ... }`.
4. Add `NEWSRC_CONSECUTIVE_LIMIT = 3` for "circuit-break after consecutive network failures".

Emit events in the existing shape so the UI can show the degradation live:

```ts
onEvent?.({ code, src: 'newsrc', status: 'trying' | 'hit' | 'skipped' | 'no-result' | 'network-failed', detail?: string })
```

## 4. Settings UI — `src/renderer/src/components/SettingsModal.tsx`

Three hardcoded spots:

| Spot | Change |
| --- | --- |
| `SOURCE_LABELS` | Add `newsrc: 'NewSrc'` (fixed English brand name) |
| `ALL_SOURCE_ORDER` | Add `'newsrc'` |
| `apiRequired` | If a key is required, extend to `src === 'moviedb' \|\| src === 'omdb' \|\| src === 'newsrc'` and add a matching key input (mirror `movieDbKey` / `omdbKey`) |

## 5. i18n — `src/shared/i18n/locales/zh-CN.ts` & `en-US.ts`

Add these keys (`cost` can reuse `settings.source.free`):

```ts
'settings.source.newsrc.desc': '...',
'settings.source.newsrc.risk': 'No risk',
'settings.source.newsrc.tier': 'Supplement',
// if a key is required, also:
'settings.source.newsrc.steps': '1. ...\n2. ...\n3. Paste it into the "NewSrc Key" box above and save.'
```

`SettingsModal` renders each card from `customSourceOrder` automatically (description, risk, tier, key requirement, "how to get a key" steps and a copy-link button) — no hand-written card needed.

## 6. Verification checklist

- [ ] `npm run typecheck` is green (the `SourceId` union surfaces missed spots).
- [ ] The new card appears and supports drag-reorder / disable.
- [ ] Single-source mode fetches correctly with `newsrc`.
- [ ] In `auto` mode it sits at the right position and the fallback log looks correct.
- [ ] With no key it shows "API key required" and makes no request.
- [ ] After disabling it, neither detail nor poster fetching tries it.
- [ ] Both zh-CN and en-US strings are complete.
