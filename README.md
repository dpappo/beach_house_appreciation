# Beach House / 54 Images

An unofficial fan microsite: 54 memory cards, one for each Beach House song. Open the box, draw a card, and its song plays through Spotify.

## Run locally

```bash
python3 scripts/serve.py
```

Then open http://localhost:4321.

## Views

- **Box**: open the lid. There's a folded letter on the deck (its text is in `index.html`, `#letter`).
- **Table**: one card at a time. Cards develop like photographs as they turn. Use the arrows (or ← →) to go through the deck in order, or click the deck (or press D) to draw at random. Click the card (or "Turn it over") to read the note written on its back.
- **Reading** (R): three cards for what you remember, what you're hearing and what you're becoming. They play in order. The URL (`#/reading/12-30-44`) is the reading, so it can be shared.
- **Spread**: every card on the table. Cards you haven't drawn yet lie face-down, and the bar counts how many you've turned over. Drag to arrange them (your layout is saved in this browser), tap one to draw it. By album / Gather / Scatter re-deal them.
- **Spotify**: the embed plays the full track if you're logged in to Spotify in that browser, otherwise a 30-second preview. With **Play the deck** on, the next card is dealt when a song ends (a reading plays its three songs and stops).

### Small things

- Turn over all 54 and a 55th card unlocks: "Irene", whose album hides one more song after a long silence (`"hidden": true` in the card data).
- Depression Cherry came in a red velvet sleeve, so its cards lay the table with velvet (`VELVET` in `app.js`). Once Twice Melody cards carry their chapter.
- The light on the table slows and dims while the music is paused. A few cards bring their own light (`MOODS` in `caustics.js`): falling stars, water, rising dust, light through blinds, a mirror ball. "Sparks" throws a spark.

## Files

- `data/cards.source.json`: title, album, year and image prompt for every card (index = card number).
- `data/cards.json`: what the site loads (adds Spotify track IDs, Once Twice Melody chapters and `note`, the line written on the back of each card).
- `images/NN.webp`: the cards; `images/back.webp` is the card back; `images/thumbs/` holds Spread thumbnails (including `back.webp` for face-down cards).
- `data/palettes.json`: per-card table colours, derived from each image by `scripts/palettes.py` (missing cards get `null` and keep the plain paper).
- `data/generation-log.json`: per-card generation record, including whether a safety note had to be appended.

## Regenerating images

Put `OPENAI_API_KEY=...` in `.env`, then:

```bash
node --env-file=.env scripts/generate.mjs --only 12,30 --force
python3 scripts/thumbs.py
python3 scripts/palettes.py
```

Without `--force`, cards that already have an image are skipped. `palettes.py` re-reads every card (a few seconds), so rerun it whenever images change. If the model's safety filter blocks a prompt twice, the script retries with one appended line ("All figures are fully and modestly clothed…") and records that in the log.
