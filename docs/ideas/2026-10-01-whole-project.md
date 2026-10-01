# Ideas: whole project (2026-10-01)

**1. Rewrite the Sparks prompt so card 29 stops shipping as "developing"** - `build` - shipped (2026-10-01: spark moved between two fingertips, passed moderation on attempt 1)
Card 29 failed 4 of 4 generation attempts with `moderation_blocked`, and the only fallback the script has (a clothing note) doesn't address what this prompt asks for.

**2. Chain thumbs and palettes onto generate.mjs and print a coverage line** - `build` - proposed
Only 11 of 41 generated images have a Spread thumb (full images are 12× heavier), and palettes.json already lags the images by one card. Both are manual follow-up steps that drift while generation runs.

**3. Make styles.css the single source of the neutral table colours** - `consolidate` - proposed
The neutral palette is defined in 4 places, and app.js resets to the Python copy rather than the CSS one. They're all equal today, but they'll drift the next time someone tunes `--paper`, which is the thing being tuned right now.

## Findings

- **F1:** There are no decision records, no prior idea runs, and no version control. `ls docs/decisions docs/adr docs/ideas` returned nothing, and the folder isn't a git repo. README.md is the only authored doc, so rejection history rests on README.md, `data/generation.out` and `data/generation-log.json`. (2026-10-01 17:48)
- **F2:** Work is in flight. `ps aux | grep generate.mjs` shows `node --env-file=.env scripts/generate.mjs --concurrency 5` running since 17:28, with 41 of 54 images on disk at 17:52. A second session is editing `app.js` and `styles.css`: palette wiring landed at 17:51 (`app.js:26-41`). (2026-10-01 17:52)
- **F3:** Card 29 "Sparks" failed permanently. `data/generation.out` shows `moderation_blocked` on attempts 1 to 4, then `✗ 29 Sparks failed`, and `data/generation-log.json` has `"29": {"failed": true}`. `grep -c moderation_blocked data/generation.out` returns 6: Saltwater ×2 (rescued on attempt 3 by the safety note) and Sparks ×4. (2026-10-01 17:52)
- **F4:** The only moderation fallback is `SAFETY_NOTE` at `scripts/generate.mjs:12-13`: "All figures are fully and modestly clothed…", used on attempts 3 and 4 (`:67-72`). The Sparks prompt (`data/cards.source.json[29]`) has no bodies. It asks for two faces "almost touching", a spark "between their lips", "slight moisture" and "intimate". The likely trigger is mouth-to-mouth intimacy, not clothing. (That's my inference; the API gives no reason.) (2026-10-01)
- **F5:** A missing card shows up in all 3 views. The table shows a "developing" placeholder (`styles.css:208-210`). `drawIndex()` (`app.js`) deals from all 54 cards without excluding missing ones, so 1 random draw in 54 lands on it. In Spread, a missing thumb plus a missing image falls back to `images/back.webp`. (2026-10-01)
- **F6:** At 17:52, 11 of 41 images had a thumb (`images/thumbs/` holds only 01 to 11, made 17:34). The average full image is 278 KB and the average thumb is 23.5 KB (12×), measured with `os.path.getsize` over `images/[0-9][0-9].webp` and `images/thumbs/*.webp`. Spread's `img.onerror` loads the full image when a thumb is missing (`app.js`, `renderSpread`). (2026-10-01 17:52)
- **F7:** `data/palettes.json` comes from a manual `python3 scripts/palettes.py` run. At 17:52 it held 40 palettes for 41 images (card 41 has an image but no palette). `app.js:33` silently falls back to `palettes.neutral` for any null entry. (2026-10-01 17:52)
- **F8:** The neutral table colours are defined 4 times: `scripts/palettes.py:89-93` (`NEUTRAL`), `styles.css:3-9` (`@property` initial-values), `styles.css:12-19` (`:root`), and `caustics.js:67` (`warm = [1, .96, .88]`, which is #fff5e0). All 4 are equal today. `app.js:33` resets the face-down table to `palettes.neutral`, the Python copy, not to the CSS values. (2026-10-01 17:52)
- **F9:** The Spotify data is correct. Spotify oEmbed confirms all 54 IDs in `data/cards.json` point at the right song title; the only difference is the punctuation in "Drunk in L.A.". All 54 album and year labels match Spotify's `og:description` for the track page. (2026-10-01 17:50)
- **F10:** `images/back.webp` is 799 KB, 2.9× the average card, and it's preloaded at `index.html:13`. Re-encoding it with PIL at WebP q82 gives 506 KB, and a 360×480 version is 67 KB. (2026-10-01 17:51)
- **F11:** `data/generation-log.json` has no entry for card 01, which was copied from a scratchpad `test1.webp` (visible in the running command line). Five workers write the log with overlapping `fs.writeFile` calls (`generate.mjs:105`), and a parse failure at `:35` silently resets it to `{}`. No corruption so far. (2026-10-01 17:52)
- **F12:** `.mini img[data-missing]` (`styles.css:293`) has 0 writers: `grep -n 'data-missing\|dataset.missing' app.js` matches nothing. (2026-10-01 17:52)

---

### #1. Rewrite the Sparks prompt so card 29 stops shipping as "developing"

**Kind:** `build`

**Worth it because:** The site shows the wrong thing for a real song: card 29 renders as a "developing" placeholder in the table, Spread and random draws (F3, F5). Rerunning won't fix it, because the only fallback addresses clothing and this prompt doesn't involve bodies (F4).

**What:** Edit `data/cards.source.json[29].prompt` to keep the song's idea (reanimation, attraction, the instant transfer of something fragile, a tiny white spark, near-black monochrome with a warm-red tint, grainy high-ISO film, a displaced double exposure) and drop the parts most likely to trip moderation: mouths almost touching, "between their lips", "moisture", "intimate". For example, move the spark between two fingertips, or between two faces in profile with clear space between them. Wait for the main generation run to exit, then run `node --env-file=.env scripts/generate.mjs --only 29 --force`, and after that `python3 scripts/thumbs.py` and `python3 scripts/palettes.py`.

**Grounded in:** F3, F4, F5, F2

**Already rejected?** No match. There are no decision records (F1). README.md documents the safety-note fallback as the intended remedy, and this card is the case where that remedy failed. Nothing records a decision to leave a card blank.

**Why now:** Card 29 failed at 17:51 today. It's the only card of 54 without an image once the run finishes, and the thumb and palette steps have to be rerun at the end anyway (F6, F7).

**Upside:** 54 of 54 cards render. Removes the 1-in-54 chance that a random draw shows a placeholder, the card back in Spread, and the neutral palette on card 29.

**Test in:** 5 min: one edit, then one generation call that takes about 30 to 180 s per F3's timings.

**Risk:** The rewrite could get blocked again (each attempt costs a call), or it could lose what made the card feel like the song. If two rewrites are both blocked, stop and ask the user how to depict the card rather than escalating the safety-note wording. Running it while the main `generate.mjs` is still going would clobber `generation-log.json`, because each process rewrites the whole file from its own in-memory copy (`generate.mjs:105`).

**Hand off:**

```text
Rewrite the image prompt for card 29 ("Sparks") so it passes OpenAI image moderation, then regenerate that one card.

Context (measured 2026-10-01, re-verify before changing anything):
- `data/generation.out`: card 29 got `moderation_blocked` on all 4 attempts, ending in "✗ 29 Sparks failed". `data/generation-log.json` has "29": {"failed": true}.
- `scripts/generate.mjs:12-13,67-72`: the only fallback appends "All figures are fully and modestly clothed; nothing revealing or suggestive." It rescued card 0 (Saltwater, a figure in a pool), but it doesn't fit card 29, which has no bodies.
- Likely triggers in `data/cards.source.json[29].prompt`: two faces "almost touching", crop to "mouths", a spark "between their lips", "slight moisture", "intimate". This is inference; the API gives no reason.
- While card 29 has no image, it shows a "developing" placeholder (`styles.css:208-210`) and is dealt by random draws 1 time in 54 (`app.js` `drawIndex`).

Read first: README.md ("Regenerating images"), `data/cards.source.json` entries 0 and 30 for house style (single vertical 3:4 photographic art card, film grain, ending with "Do not include text, lyrics, logos, borders…").

In scope: rewording entry 29's `prompt` only. Keep the song's core: reanimation, attraction, the instant transfer of something fragile, a tiny white spark hanging impossibly in midair, near-black, monochrome with a faint warm-red tint, grainy high-ISO film, a subtly displaced double exposure. Remove the mouth-to-mouth intimacy (lips, moisture, "intimate"); for example, put the spark between two fingertips, or between two profiles with clear space between them.
Deliberately out of scope: changing `SAFETY_NOTE` or the retry ladder in `generate.mjs`, and touching any other card.

Before running: make sure no other generation run is active, because concurrent runs overwrite each other's `data/generation-log.json`:
pgrep -fl generate.mjs

Run:
node --env-file=.env scripts/generate.mjs --only 29 --force
python3 scripts/thumbs.py
python3 scripts/palettes.py

Verify: `images/29.webp` and `images/thumbs/29.webp` exist, `generation-log.json` "29" has no "failed" key, and `data/palettes.json` cards[29] is not null. Open http://localhost:4321/#/card/29 (python3 scripts/serve.py) and check that the image appears instead of "developing".

Stop if: two different rewrites are both blocked. Report back and ask the user how they want the card depicted, rather than piling more safety language on.

Do not: edit `data/cards.json` (titles and Spotify IDs are verified correct, 54 of 54), or regenerate other cards.
```

---

### #2. Chain thumbs and palettes onto generate.mjs and print a coverage line

**Kind:** `build`

**Worth it because:** This is a measured cost with a measured fix. 30 of 41 generated images had no thumb at 17:52, so Spread falls back to full images that are 12× heavier (278 KB vs 23.5 KB, F6). palettes.json already lags the images (F7), and `app.js` hides both gaps by silently falling back.

**What:** When `scripts/generate.mjs` finishes (after the `await Promise.all`), run `python3 scripts/thumbs.py` and `python3 scripts/palettes.py` with `child_process.spawnSync` and `stdio: "inherit"`. Then print one coverage line, for example `images 54/54 · thumbs 54/54 · palettes 54/54 · failed: 29`, listing any card numbers missing from each. thumbs.py already skips up-to-date thumbs by mtime (`thumbs.py:10`), so rerunning it is cheap. Update the README's "Regenerating images" block so it's one command.

**Grounded in:** F6, F7, F5, F3

**Already rejected?** No match. There are no decision records (F1). README.md documents `thumbs.py` as a separate manual step after generation and doesn't mention `palettes.py`; nothing records a reason to keep them separate.

**Why now:** The regenerate-one-card workflow is about to be used for card 29 (#1), and every later `--only N --force` needs the same two follow-up steps. At 17:52 the thumbs had already drifted 30 cards behind.

**Upside:** Spread loads about 54 × 23.5 KB (about 1.3 MB) instead of up to about 54 × 278 KB (about 15 MB) when thumbs are stale, and no card silently gets the neutral palette. Gaps show up in the terminal instead of in the browser.

**Test in:** 15 min. Add the tail, then run `--only 0` without `--force`. That should be a no-op generation that still prints thumbs, palettes and coverage.

**Risk:** It adds a Python + PIL + numpy dependency to a Node script's exit path. Have it warn rather than fail if `python3` is missing. If the user prefers just running thumbs.py once after this run and never regenerating again, this adds little. The parallel session working on palettes may already plan its own rerun, so coordinate rather than double up.

**Hand off:**

```text
Make `scripts/generate.mjs` refresh the derived assets (Spread thumbnails and table palettes) when it finishes, and print a per-card coverage line, so the three artifacts can't silently drift apart.

Context (measured 2026-10-01 17:52, re-verify before changing anything):
- 41 of 54 card images existed but only 11 thumbs (`images/thumbs/` held 01 to 11, made 17:34).
- Average full image 278 KB vs average thumb 23.5 KB (12×). Measured with python `os.path.getsize` over `images/[0-9][0-9].webp` and `images/thumbs/*.webp`.
- `app.js` `renderSpread()`: when a thumb 404s, `img.onerror` loads the full image, and then `images/back.webp` (799 KB) if that's missing too. Spread hides stale thumbs by paying for full images.
- `data/palettes.json` had 40 palettes for 41 images. `app.js` `tint()` (around line 33) silently uses `palettes.neutral` for a null entry.
- `scripts/thumbs.py` already skips thumbs newer than their source (line 10). `scripts/palettes.py` recomputes all 54 in seconds.

Read first: README.md "Regenerating images", `scripts/generate.mjs` (end of file, after `await Promise.all`), `scripts/thumbs.py`, `scripts/palettes.py` `main()`.

In scope: after generation, `spawnSync("python3", ["scripts/thumbs.py"], {cwd: ROOT, stdio: "inherit"})` and the same for `scripts/palettes.py`. If python3 or PIL is missing, warn and continue, don't throw. Then print one line like `images 54/54 · thumbs 54/54 · palettes 54/54 · failed: 29`, listing the card numbers missing from each set. Update the README to show the single command.
Deliberately out of scope: changing how palettes are computed (another session is actively working on the palette feature in `app.js`/`styles.css`/`palettes.py`), changing the retry ladder, and adding a build tool or package.json.

Change: `scripts/generate.mjs` (tail), README.md ("Regenerating images").

Verify (no API spend: without --force an existing card is skipped):
node --env-file=.env scripts/generate.mjs --only 0
Expected: "Generating 0 image(s)", thumbs.py output for any stale thumbs, palettes.py output, then a coverage line whose counts match `ls images/[0-9][0-9].webp | wc -l` and `ls images/thumbs | wc -l`.

Stop if: the user would rather run the two scripts by hand. In that case just run `python3 scripts/thumbs.py && python3 scripts/palettes.py` once and leave the code alone.

Do not: run this while another `generate.mjs` is active (`pgrep -fl generate.mjs`); concurrent runs overwrite `data/generation-log.json`.
```

---

### #3. Make styles.css the single source of the neutral table colours

**Kind:** `consolidate`

**Worth it because:** It's one edit away from drifting, and the edit is likely. The neutral palette exists 4 times (F8), and `app.js` resets the face-down table to the Python copy. The next time someone tunes `--paper` in `styles.css` (the palette work is being tuned right now, F2), the table will show the new colour until the first card is flipped, then snap back to the old one, and every card palette will be anchored to the old lightness.

**What:** (a) In `app.js` `tint()`, when there's no card palette, call `removeProperty` on each `--token` instead of writing `palettes.neutral`, so the CSS `:root` values apply. (b) Add `--light: #fff5e0` to `styles.css :root`, and have `caustics.js` read its initial `warm` from `getComputedStyle(document.documentElement).getPropertyValue("--light")` instead of the literal `[1, .96, .88]`. Have `app.js` dispatch that value for the neutral case too. (c) Make `scripts/palettes.py` parse the `:root` hex tokens out of `styles.css` instead of hard-coding `NEUTRAL`, and assert that the `@property` initial-values match `:root`. They have to stay literal, because `@property` can't use `var()`.

**Grounded in:** F8, F2, F7

**Already rejected?** No match. There are no decision records (F1). The palette feature is new today (`app.js:26-41`, 17:51), so no decision about its source of truth exists yet.

**Why now:** The palette feature landed minutes ago and is still being tuned. Consolidating before the first colour tweak costs nothing; doing it after means finding out why the table snaps back.

**Upside:** 4 copies of the neutral palette become 1 source plus 1 asserted copy. This removes the one class of bug where face-down and face-up tables disagree about what "plain paper" is.

**Test in:** 20 min. Change `--paper` in `:root` to an obvious colour, flip a card face up then face down, and confirm the table returns to the new colour, not #d7d1c7.

**Risk:** It collides with in-flight work in another session (F2). Hand it to that session or wait for it to finish, rather than editing the same files concurrently. If nobody plans to touch the base colours again, the honest verdict drops to "fine, not now".

**Hand off:**

```text
Make `styles.css :root` the single source of the neutral ("plain paper") table colours used by the per-card palette feature.

Context (measured 2026-10-01, re-verify before changing anything; the palette feature was being edited the same day, so re-read every file first):
- Neutral colours are defined 4 times, all currently equal:
  1. `scripts/palettes.py:89-93` NEUTRAL dict (paper #d7d1c7, paper-hi #e6e1d8, paper-lo #c4bcb0, ink #16130f, ink-soft #3a342d, muted #6e665c, shade #1c140a, light #fff5e0). It's written into `data/palettes.json` as "neutral", and it's also the lightness anchor for every card palette (`BASE`).
  2. `styles.css:3-9` @property initial-values.
  3. `styles.css:12-19` :root.
  4. `caustics.js:67` `const warm = [1, .96, .88]` (= #fff5e0).
- `app.js` `tint()` (around line 33): face down or off the table, it writes `palettes.neutral` (copy 1) as inline styles, so CSS edits to :root are overridden after the first card is flipped.

Read first: the top of `app.js` (Table colour section), `caustics.js` (tint listener), `scripts/palettes.py` (NEUTRAL, BASE, palette()), `styles.css` lines 1-35.

In scope:
- app.js: in the neutral case, `document.documentElement.style.removeProperty("--" + k)` for each token instead of setting values. Dispatch "tint" with the CSS `--light` value parsed to [r, g, b].
- styles.css: add `--light: #fff5e0;` to :root.
- caustics.js: initialise `warm` from `getComputedStyle(document.documentElement).getPropertyValue("--light")`, falling back to [1, .96, .88] if empty.
- palettes.py: parse the :root hex tokens from styles.css with a regex instead of the literal NEUTRAL, and assert the @property initial-values equal :root (they must stay literal; @property can't use var()).
Deliberately out of scope: changing any colour value, the palette algorithm, or contrast targets.

Verify: temporarily set `--paper: #cfe0d0` in :root, run `python3 scripts/palettes.py` (it should succeed, with palettes anchored to the new lightness), open http://localhost:4321/#/card/3, flip it face up then face down, and confirm with `getComputedStyle(document.documentElement).getPropertyValue("--paper")` that it's back to #cfe0d0. Then revert the colour.

Stop if: another session is mid-edit on these files. Hand this brief to that session instead of editing concurrently.

Do not: refactor the rest of styles.css's hard-coded colours (45 hex/rgba literals). Only the 8 palette tokens are in scope.
```

---

## Measured and cut

- **Audit the Spotify track IDs and labels**: 54 of 54 IDs resolve to the right title (oEmbed), and 54 of 54 album/year labels match Spotify. Nothing to fix; don't re-check.
- **Smarter moderation fallback (per-trigger safety notes)**: 2 of 42 prompts blocked so far, one already rescued. A hand rewrite (#1) is cheaper than building a remedy ladder.
- **Re-encode or downsize `images/back.webp`**: 799 KB to 506 KB at q82, or 67 KB as a 360×480 version for the two small deck faces. That's about 300 KB off first paint. Fine, not now; it could ride along with #2 if thumbs.py learns about the back.
- **Serialize generation-log writes and stop the silent reset at `generate.mjs:35`**: Node docs call overlapping `writeFile` unsafe, but completions are seconds apart, writes are 6 KB, and 0 corruptions were seen. Fine, not now. The real exposure is losing card 0's only safetyNote record if a parse ever fails.
- **Backfill a log entry for card 01**: a provenance gap (copied from a scratchpad test), but no decision depends on it unless card 01 looks off-style next to the rest. Not now.
- **Delete `.mini img[data-missing]` (`styles.css:293`)**: 1 dead line with 0 writers. Deleting a line isn't reason enough; fold it into the next styles.css edit.
- **Exclude missing cards from the draw pool**: works around a gap #1 closes in about 5 minutes. Moot.
- **Wire palettes.json into the page**: already in flight in another session (`app.js:26-41`, 17:51). Not proposed.
