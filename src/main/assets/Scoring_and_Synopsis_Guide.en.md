# General Movie Scoring & Synopsis Standards

> This document is the **authoritative writing standard** for a Yinghai catalog spreadsheet. It keeps category, rating and synopsis wording consistent across every title.
> It can be read by a human, or pasted whole into an AI so it generates / reviews catalog content with the same rubric.
>
> Design intent: **preference-neutral, reproducible, calibratable**. A rating is not "a number that feels right" — it is a weighted computation over fixed dimensions; a synopsis is not a Wikipedia abstract — it is structured, spoiler-free, readable text.
> The larger your library grows, the more stable and representative your ratings become.

| Item | Value |
| --- | --- |
| Doc version | v2.0 |
| Updated | 2026-09-14 |
| Audience | Catalog maintainers; users generating catalogs with an AI |
| Reference systems | IMDb · Douban · Metacritic · Rotten Tomatoes · Letterboxd · TMDB · MyAnimeList · festival jury conventions |

---

## Contents

- [1. Rating standard](#1-rating-standard)
- [2. How the major rating systems compare](#2-how-the-major-rating-systems-compare)
- [3. Worked rating examples](#3-worked-rating-examples)
- [4. Synopsis writing standard](#4-synopsis-writing-standard)
- [5. Sheet structure & field definitions](#5-sheet-structure--field-definitions)
- [6. Category system](#6-category-system)
- [7. Tag vocabulary](#7-tag-vocabulary)
- [8. Quality checklist](#8-quality-checklist)
- [9. AI prompt template](#9-ai-prompt-template)
- [10. Usage guidance](#10-usage-guidance)

---

## 1. Rating standard

### 1.1 Dimensions & suggested weights (10-point scale, two decimals)

| Dimension | Weight | What to look at |
| --- | --- | --- |
| Writing / Screenplay | 16% | Structural integrity, logic, character arcs, dialogue, padding |
| Direction & staging | 14% | Narrative control, staging, visual language, authorship, finish |
| Acting | 14% | Credibility and range of leads and supporting cast, ensemble balance |
| Cinematography & production design | 12% | Composition, lighting, colour, sets, costume and props |
| Editing & pacing | 10% | Information density, tension/release, dragging or jarring cuts |
| Score & sound | 10% | Themes, picture-sound sync, mix depth, sound design |
| Theme & substance | 8% | Depth of subject, restraint, whether it leaves something to discuss |
| Originality & differentiation | 6% | Distinctiveness of premise, angle, structure; avoidance of sameness |
| Production scale & craft | 5% | VFX, action design, genre set-pieces, overall polish |
| Franchise position & reputation | 5% | Whether it is part of a classic series, consistency with predecessors |

**Weight rules**

- The table above is the **recommended default**; adjust to taste (e.g. weight acting and writing higher, or craft and spectacle higher).
- Adjusted weights must total 100% and stay consistent within a catalog.
- Score each dimension independently, then combine. **Never start from a total and back-fill dimensions.**

**Formula**

```
Total = Σ(dimension score × its weight)
Keep two decimals (round from the third)
```

### 1.2 Score bands (nine fine-grained tiers)

| Range | Tier | Definition | Practical meaning |
| --- | --- | --- | --- |
| 9.20 – 10.00 | Landmark | Film-history level, no weak dimension, endlessly rewatchable | Must see, worth collecting |
| 8.50 – 9.15 | Outstanding | At least one dimension is best-of-year or best-of-era | Recommend to anyone |
| 7.80 – 8.45 | Excellent | High craft, clear highlights, only isolated flaws | Actively recommend |
| 7.00 – 7.75 | Good | Above average for its genre, stable quality | Worth a watch |
| 6.30 – 6.95 | Passable | Noticeable weaknesses, still watchable with some merit | Watch when bored |
| 5.50 – 6.25 | Mediocre | Significant craft or narrative problems, scattered highlights | Not necessary |
| 4.50 – 5.45 | Poor | Fails in most dimensions with occasional local merit | Not recommended |
| 3.00 – 4.45 | Bad | Serious creative or production failure | Avoid |
| 0 – 2.95 | Awful | Unwatchable or an outright production incident | Clearly avoid |

> The bands are deliberately finer than nine equal slices — see 1.7 on score inflation.

### 1.3 Anchor titles (calibrate before scoring)

| Anchor type | Reference score | Purpose |
| --- | --- | --- |
| Consensus classics | 9.20 – 9.60 | Upper bound; not every era produces one |
| Best of the year / major festival winners | 8.50 – 9.15 | Ceiling for excellent work |
| Genre benchmark (the best few in a genre) | 7.80 – 8.45 | "How good this genre can get" |
| Solid theatrical commercial film | 7.00 – 7.75 | Where most good films land |
| Competent streaming / genre product | 6.30 – 6.95 | Watchable, not worth seeking out |
| Ambitious but failed | 5.50 – 6.25 | Common for over-scoped projects |
| Production incident | ≤ 4.45 | Rare |

### 1.4 Five-step rating process

1. **Anchor** — decide roughly where it sits versus an anchor (e.g. 7.8–8.5).
2. **Score dimensions** — rate all ten in 1.1, writing at least one concrete reason each.
3. **Combine** — apply the formula to two decimals.
4. **Cross-check** — run the three questions in 1.6; if any fails, return to step 2.
5. **Record** — write the value into the Rating column; keep any extra notes outside the sheet.

### 1.5 Rating discipline

1. **No clustering** — if 80% of your library is above 8, your scale has failed; recalibrate.
2. **No copying** — IMDb / Douban scores are crowd averages. Differences are fine, but you must be able to justify them.
3. **No genre bonus** — liking a genre does not make every entry good.
4. **No hype** — box office, buzz, star power and marketing are not merits.
5. **No single-moment canonisation** — one stunning shot does not make a 9; the whole film must hold.
6. **Be conservative on obscure titles** — with very few viewers, converge towards 7.0–8.0 to avoid the "niche filter" (mirrors IMDb's weighted approach; see section 2).
7. **Re-rate sparingly** — revisions are allowed after a rewatch, but avoid oscillation.
8. **One standard per catalog** — do not mix "entertainment-first" and "art-first" scales within the same batch.

### 1.6 Three self-check questions

1. Can I name **at least two concrete reasons** for this score?
2. Is a better film in the same genre rated higher, and a worse one lower?
3. Could I explain the score in **two sentences** if asked?

If any answer is "no", rate again.

### 1.7 Common biases and corrections

| Bias | Symptom | Correction |
| --- | --- | --- |
| Score inflation | Everything is 8+, no discrimination | Enforce the fine bands in 1.2; revisit over-rated entries |
| Score compression | Mostly 6–7, even great films feel flat | Allow 9+ to exist; re-anchor against classics and genre benchmarks |
| Mood bonus | High score because you felt good | Wait 24 hours before finalising |
| Genre filter | Favourite genres always higher | Score dimensions only; genre itself carries no weight |
| Star bonus | Rating driven by actors/directors | Fame affects whether you watch, not how good it is |
| Conformity | Copying platform averages | Use platform scores for calibration only |
| Backlash | Harsh score from disappointed expectations | Compare laterally with the same genre first |

---

## 2. How the major rating systems compare

Understanding each platform's methodology helps calibrate your own scale (**for calibration, never for copying**).

| Platform | Native method | Traits & limitations | Takeaway for this guide |
| --- | --- | --- | --- |
| **IMDb** | Users rate 1–10; one decimal shown | Uses a **weighted average** (not a plain mean) and filters anomalous / bot votes; scores for new or obscure titles are volatile | Borrow the "be conservative with few votes" idea; keep obscure titles within 7.0–8.0 |
| **Douban** | Users rate 1–5 stars, mapped to 2–10; one decimal shown | Weighted average with anomaly filtering; skews toward art-house and domestic titles with strong genre bias | Calibration only; never copy the number |
| **Metacritic** | Metascore 0–100 (critic-weighted, weights undisclosed, often rounded) + separate User Score 0–10 | Keeps critic and audience scores apart | Borrow the "critic vs audience can differ" split; maps to our Direction/Writing vs Personal dimensions |
| **Rotten Tomatoes** | Tomatometer = **share** of positive reviews (not how positive); plus Average Rating (0–10) and an audience score | A ratio system: a merely "fine" film can score very high | Reminder: **ratio ≠ intensity**; this guide rates intensity |
| **Letterboxd** | Users rate 5 stars in half-star steps; two decimals shown | Plain user average; skews art-house | Half-star granularity is close to our 0.5-band intuition |
| **TMDB** | Users rate 1–10, plus a separate popularity metric | Score and popularity are separate; popularity ≠ quality | Confirms popularity is not a rating dimension |
| **MyAnimeList** | Users rate 1–10; two decimals shown | Applies ranking weights and sample-size correction | Borrow sample-size correction |
| **Festival juries** | Awards, not scores; art-oriented | Ignores commercial genre cinema | Reference only for the "artistic merit" dimension |

**In three sentences:**

1. Platform scores are **crowd averages**; your catalog is **personal judgement** — differences are expected.
2. Titles with few votes should be rated **conservatively** to avoid distortion.
3. Separate **ratio-based** systems (share of positive reviews) from **intensity-based** ones — this guide is intensity-based.

### 2.1 Star / percentage conversion (for intuition only)

| This guide | Douban (5★) | Letterboxd (5★) | IMDb (10) | Metacritic (100) | Tomatometer intuition |
| --- | --- | --- | --- | --- | --- |
| 9.20 – 10.00 | ★★★★★ | ★★★★★ | 9.0 – 10.0 | 90 – 100 | 95%+ |
| 8.50 – 9.15 | ★★★★★ | ★★★★½ | 8.4 – 8.9 | 78 – 89 | 88% – 95% |
| 7.80 – 8.45 | ★★★★☆ | ★★★★ | 7.6 – 8.3 | 68 – 77 | 78% – 88% |
| 7.00 – 7.75 | ★★★½☆ | ★★★½ | 6.8 – 7.5 | 58 – 67 | 65% – 78% |
| 6.30 – 6.95 | ★★★☆☆ | ★★★ | 6.0 – 6.7 | 48 – 57 | 50% – 65% |
| 5.50 – 6.25 | ★★½☆☆ | ★★½ | 5.2 – 5.9 | 38 – 47 | 35% – 50% |
| 4.50 – 5.45 | ★★☆☆☆ | ★★ | 4.2 – 5.1 | 28 – 37 | 20% – 35% |
| ≤ 4.45 | ★☆☆☆☆ | ★ | ≤ 4.1 | ≤ 27 | ≤ 20% |

---

## 3. Worked rating examples

### 3.1 Example 1 — consensus classic (result ≈ 9.39)

| Dimension | Score | Weight | Weighted |
| --- | --- | --- | --- |
| Writing | 9.5 | 16% | 1.520 |
| Direction | 9.8 | 14% | 1.372 |
| Acting | 9.5 | 14% | 1.330 |
| Cinematography & design | 9.6 | 12% | 1.152 |
| Editing & pacing | 9.2 | 10% | 0.920 |
| Score & sound | 9.5 | 10% | 0.950 |
| Theme & substance | 9.0 | 8% | 0.720 |
| Originality | 8.8 | 6% | 0.528 |
| Production craft | 9.0 | 5% | 0.450 |
| Franchise position | 9.0 | 5% | 0.450 |
| **Total** | — | 100% | **9.392 → 9.39** |

### 3.2 Example 2 — solid commercial genre film (result ≈ 7.44)

| Dimension | Score | Weight | Weighted |
| --- | --- | --- | --- |
| Writing | 7.0 | 16% | 1.120 |
| Direction | 7.5 | 14% | 1.050 |
| Acting | 7.5 | 14% | 1.050 |
| Cinematography & design | 8.0 | 12% | 0.960 |
| Editing & pacing | 7.5 | 10% | 0.750 |
| Score & sound | 8.0 | 10% | 0.800 |
| Theme & substance | 6.5 | 8% | 0.520 |
| Originality | 6.5 | 6% | 0.390 |
| Production craft | 8.5 | 5% | 0.425 |
| Franchise position | 7.5 | 5% | 0.375 |
| **Total** | — | 100% | **7.440 → 7.44** |

### 3.3 Example 3 — ambitious but failed (result ≈ 6.21)

| Dimension | Score | Weight | Weighted |
| --- | --- | --- | --- |
| Writing | 5.5 | 16% | 0.880 |
| Direction | 6.0 | 14% | 0.840 |
| Acting | 6.5 | 14% | 0.910 |
| Cinematography & design | 7.0 | 12% | 0.840 |
| Editing & pacing | 5.0 | 10% | 0.500 |
| Score & sound | 6.5 | 10% | 0.650 |
| Theme & substance | 7.0 | 8% | 0.560 |
| Originality | 7.5 | 6% | 0.450 |
| Production craft | 6.0 | 5% | 0.300 |
| Franchise position | 5.5 | 5% | 0.275 |
| **Total** | — | 100% | **6.205 → 6.21** |

### 3.4 Band quick reference

| Result range | Tier | Typical traits |
| --- | --- | --- |
| 9.20 – 10.00 | Landmark | No weak dimension, historically discussable |
| 8.50 – 9.15 | Outstanding | A peak dimension, unified whole |
| 7.80 – 8.45 | Excellent | Clear highlights, negligible flaws |
| 7.00 – 7.75 | Good | Reliably above genre average |
| 6.30 – 6.95 | Passable | Obvious weaknesses, still watchable |
| 5.50 – 6.25 | Mediocre | Serious problems, scattered merit |
| 4.50 – 5.45 | Poor | Multi-dimensional failure with local merit |
| ≤ 4.45 | Bad / Awful | Production incident or unwatchable |

---

## 4. Synopsis writing standard

### 4.1 Length & structure

- **Length**: 80–150 words (EN) / 80–150 characters (ZH).
- **Four beats** (may merge into one paragraph, but all information must be present):

| Beat | Content | Share |
| --- | --- | --- |
| Hook | One line stating the premise, mystery or conflict | ≈ 20% |
| Development | Main plot arc, relationships, key choices | ≈ 40% |
| Highlights | Director / performance / genre / craft strengths | ≈ 30% |
| Close | One line on tone or theme (no sales pitch) | ≈ 10% |

### 4.2 Three reusable templates

**Template A — Plot-driven** (drama, biopic, historical)
> [Protagonist] in [situation] is drawn into [core conflict]; as [key event] unfolds, [relationship/belief] gradually [changes]. [Direction / performance / genre traits] give the film its [tone].

**Template B — Mystery-driven** (mystery, crime, thriller)
> [An event / a puzzle] breaks [the calm], and [protagonist] discovers [where the clues lead]; as [the truth approaches], [the cost] surfaces. The film sustains tension through [pacing / craft].

**Template C — Character-driven** (coming-of-age, romance, biopic)
> Driven by [trigger], [protagonist] pursues [path], and through [relationship] experiences [turn]; [situation before the end] forces a reckoning with [theme]. [Performance / emotional register] is the core of the work.

### 4.3 Language rules

- Descriptive and objective; evaluative judgement belongs in the Rating column.
- Fluent and vivid, without adjective stacking.
- Vary sentence openings across the library — no two entries should start identically.
- Keep the English synopsis aligned with the Chinese one; no literal machine translation.
- Consistent proper nouns: series names, directors and actors follow the mainstream spelling.

### 4.4 Don'ts

| Don't | Why |
| --- | --- |
| Spoil twists, endings or the culprit | Ruins the experience |
| Copy Wikipedia, reviews or platform blurbs | Lengthy, inconsistent, copyright risk |
| List only cast and crew | Low information value |
| Write "must-see", "masterpiece", "stunning" | Subjective judgement belongs in the rating |
| Start every entry with "This film tells the story of…" | Mechanical and unreadable across a library |
| Describe a whole season for a series | Describe only the entry's own work |
| Use unverified rumours or trivia | Hurts credibility |

### 4.5 Chinese example

> **Good (≈ 96 characters)**
> 一名技艺高超的窃贼接到一桩不可能的任务：不是窃取财物，而是潜入他人梦境植入一个念头。随着梦境层层下探，现实与幻觉的边界逐渐崩塌，他必须先面对自己不愿触碰的往事。层层嵌套的结构与克制的情绪，让这部作品在商业外壳下保持清醒。

> **Bad**
> 本片由著名导演执导，众多明星联袂出演，讲述了主角完成任务的精彩历程，最后结局出人意料，非常值得一看。（评价堆砌、无信息量、末尾暗示反转）

### 4.6 English example

> **Good (≈ 105 words)**
> A skilled thief is offered an impossible job: instead of stealing a secret, he must plant an idea inside someone's mind. As the team descends through nested dreams, the line between what is real and what is constructed begins to collapse — forcing him to confront a memory he has spent years avoiding. Tight structure and controlled emotion keep the film lucid beneath its blockbuster surface.

> **Bad**
> This film is directed by a famous director and features many stars. It tells the wonderful story of the protagonist completing a mission, and the ending is unexpected. Highly recommended. (Evaluation stacking, no information, spoiler hint.)

---

## 5. Sheet structure & field definitions

### 5.1 Recommended header

| ID | Title | Year | Category | Rating | Synopsis |
| --- | --- | --- | --- | --- | --- |
| 001 | Inception | 2010 | Sci-Fi | 9.39 | A skilled thief is offered an impossible job… |

- The header must be in the **first row**; data starts on the second row.
- Column order is flexible (matched by header name); "ID" may also be `Title` or `片名`.
- **Any extra column** after the title column automatically becomes a tag group (see chapter 7).

### 5.2 Field definitions

| Column | Required | Format | Notes |
| --- | --- | --- | --- |
| ID / Title | Yes | Text, no extension | Primary key matched against file names; matching is fuzzy (denoised title + year + word boundary) — **no** quality tags or site watermarks |
| Year | Recommended | 4 digits | Disambiguates same-name titles (e.g. *Dune* 2021 vs 1984) |
| Category | Yes | One value | Must come from the ten categories in chapter 6 |
| Rating | Yes | 0–10, two decimals | Overrides the data-source rating when present |
| Synopsis | Yes | 80–150 words / characters | Overrides the data-source synopsis when present |

### 5.3 Common mistakes

| Wrong | Consequence | Right |
| --- | --- | --- |
| `Inception.2010.1080p.BluRay.x264` | Noisy matching, may fail | `Inception` |
| Same title twice | Duplicate entries | One row per work |
| Rating as `9` or `9.2/10` | Not parseable | `9.00` / `9.20` |
| Category as `Sci-Fi/Action` | Broken grouping | One main category; the rest become tags |
| Synopsis copied from Wikipedia | Lengthy, spoiler-heavy | Rewrite per chapter 4 |
| Writing `0` to ignore the source rating | Shows as 0 | Leave blank |

---

## 6. Category system

### 6.1 Main categories (pick one)

| Category | Scope | Boundary notes |
| --- | --- | --- |
| Drama | Character, emotion, social themes | Biopic, family, coming-of-age, historical |
| Action | Action set-pieces and pacing | Superhero, crime action, martial arts, spy action |
| Sci-Fi | Scientific or futuristic premise | Space opera, cyberpunk, hard sci-fi, time travel |
| Comedy | Primarily intended to be funny | Dark and satirical comedy included |
| Romance | Relationship-driven | Rom-com: choose by main appeal |
| Mystery | Puzzles, deduction, suspense | Includes crime and thriller |
| Horror | Fear as the goal | Monster, supernatural, psychological |
| Animation | Animated form | Animated features first; subject matter becomes tags |
| Documentary | Non-fiction record | Nature, history, biography |
| Other | Everything else | Experimental, concert film, stage recording |

### 6.2 Selection rules

1. **Judge by the main appeal, not element count** — relationship-driven sci-fi goes to Romance; sci-fi becomes a tag.
2. **Animation first** — animated features are categorised as Animation, then tagged by subject.
3. **If unsure, use "Other"** — never force a category.
4. Category only expresses **how to group**; nuance goes into tag columns.

---

## 7. Tag vocabulary

Extra columns after the title column are tag groups. Below are suggested dimensions and vocabularies (separate multiple values with `,`; keep ≤ 5 per cell).

### 7.1 Theme
Coming-of-age, Revenge, Redemption, Family, Romance, Friendship, Identity, Class, War, Survival, Dreams, Loneliness, Justice, Desire, Faith, Time, Memory, Tech ethics, Power, Freedom, Reconciliation, Fate

### 7.2 Region
USA, UK, France, Germany, Italy, Spain, Japan, South Korea, Mainland China, Hong Kong, Taiwan, India, Thailand, Nordic, Eastern Europe, Latin America, Australia, Middle East

### 7.3 Era
Ancient, Modern era, 1920s, 1930s, 1940s, 1950s, 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s, Contemporary, Future, Fictional

### 7.4 Series
Original, Sequel, Prequel, Trilogy, Shared universe, Adaptation, Reboot

### 7.5 Elements
Crime, Whodunit, Spy, War, Disaster, Sports, Music, Road movie, Courtroom, Medical, Campus, Workplace, Fantasy, Historical, Adventure, Western, Post-disaster

### 7.6 Mood
Warm, Healing, Oppressive, Absurd, Rousing, Cold, Romantic, Dark comedy, Epic, Suspenseful, Lonely

### 7.7 Form
2D, 3D, IMAX, Black and white, Long take, Non-linear, Mockumentary, Stage adaptation, Stop motion, Silent-film style

### 7.8 Audience
Family, Teen, Adult drama, Female-oriented, Hardcore cinephile, Genre fan

### 7.9 Highlights
Great acting, Great score, Great twist, Visual spectacle, Based on true events, Ensemble narrative, Long-take staging, Powerful ending

> The vocabulary is a suggestion — custom tags are equally valid — but keep wording **consistent** across titles, otherwise filtering splits apart.

---

## 8. Quality checklist

Before shipping a catalog, verify:

- [ ] Header in row 1 with ID / Title / Year / Category / Rating / Synopsis.
- [ ] One row per work, no duplicates.
- [ ] Titles contain no quality tags, codecs or watermarks.
- [ ] Years are 4-digit numbers or blank.
- [ ] Every category comes from chapter 6, one per row.
- [ ] Ratings are 0–10 with two decimals and **sensibly distributed** (not all high).
- [ ] Each rating maps to an example in chapter 3 or an anchor in 1.3.
- [ ] Synopses are 80–150 words/characters, spoiler-free, pitch-free, with varied phrasing.
- [ ] Tag columns contain no placeholders (`N/A` / `无`) and use consistent wording.
- [ ] Read through once for consistent style.

---

## 9. AI prompt template

Paste the block below (plus your title list) into an AI to generate catalog content that follows this guide:

```text
Generate a Yinghai sheet for the movie list I provide, following these rules:

1. Look up accurate metadata for each title (year, genre, director, cast, plot).
2. Pick one Category from Drama / Action / Sci-Fi / Comedy / Romance / Mystery /
   Horror / Animation / Documentary / Other.
3. Write the synopsis (English 80–150 words, Chinese 80–150 characters) without
   spoiling twists or endings:
   hook + main plot arc + highlights + one line on tone.
   Vary sentence openings across entries; do not start every one the same way.
4. Rate with a weighted score over ten dimensions (10-point scale, two decimals)
   and briefly state the rationale:
   Writing 16% / Direction 14% / Acting 14% / Cinematography 12% / Editing 10% /
   Score & sound 10% / Theme 8% / Originality 6% / Craft 5% / Franchise 5%.
5. Ratings must respect the anchors: classics 9.20–9.60, best-of-year 8.50–9.15,
   genre benchmark 7.80–8.45, solid commercial 7.00–7.75, ambitious-but-failed
   5.50–6.25. Avoid clustering above 8, and be conservative for obscure titles.
6. Extra tags (Theme / Region / Era / Series / Elements / Mood / Highlights)
   separated by commas, at most 5 per cell; leave empty when nothing applies —
   never write "N/A" or "无".
7. If multiple titles are provided, process each one, keeping format and tone consistent.

【Headers】ID	Title	Year	Category	Rating	Synopsis	Theme	Region	Series
```

**Output requirement**: return tab-separated text ready to paste into Excel (one row per title), with no extra commentary or summary.

---

## 10. Usage guidance

1. **Pilot first** — rate 5–10 familiar titles with this rubric and check whether the bands match your intuition before processing the whole library.
2. **Personalise the weights** — adjust 1.1 to your taste (e.g. Acting +5%, Craft −5%), but keep it **consistent across the catalog**.
3. **AI output is a draft** — treat generated ratings and synopses as drafts, especially the rating; review whether the band is plausible.
4. **Lean on anchors** — when unsure, compare laterally against 1.3 rather than trusting a gut feeling.
5. **Long-term maintenance** — the larger the library, the more accurate your sense of genre benchmarks and franchise reputation becomes, and the more stable your scores get.
6. **Change it if it doesn't fit** — this guide is a tool, not a cage. Prioritise consistency first, then converge on your own taste.

---

**Document version**: v2.0 · 2026-09-14
**Audience**: users who want a unified synopsis style and rating system for a personal catalog
