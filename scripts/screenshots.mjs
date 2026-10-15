// Captures the README images into docs/screenshots/: the stills, the animated hero
// (hero.webp), the full deck (deck.jpg) and the GitHub social preview (social.jpg).
//   npm run screenshots
// Serves the site itself on a free port, so it works whether or not serve.py is running.
// Spotify is blocked for the stills (the player would show a login wall or nothing in headless
// Chrome) and Math.random is seeded, so the same site produces the same shots. The hero lets the
// Spotify player in, because a song starting is the point; offline, it's recorded without it.
// The hero is encoded by scripts/animate.py, which needs Python 3 with Pillow.
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs/screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root)) return res.writeHead(403).end();
  try {
    const file = (await fs.stat(p)).isDirectory() ? path.join(p, "index.html") : p;
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

// Prefer the installed Chrome (no download); fall back to Playwright's own Chromium.
const args = ["--autoplay-policy=no-user-gesture-required"]; // so the hero's player shows a song playing
const browser = await chromium.launch({ channel: "chrome", args }).catch(() => chromium.launch({ args }));

// Cards the "visitor" has already turned over, so the Spread shows a mix of faces and backs.
const SEEN = [0, 2, 3, 5, 7, 8, 11, 12, 14, 16, 17, 19, 20, 22, 23, 26, 27, 29, 30, 31, 33, 34, 36, 38, 39, 41, 42, 44, 45, 47, 48, 50, 51, 53];

async function open({ width = 1280, height = 800, mobile = false, scale, spotify = false, storage = {} } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale ?? (mobile ? 2 : 1.5), isMobile: mobile, hasTouch: mobile,
    reducedMotion: "no-preference",
  });
  if (!spotify) await ctx.route(/spotify\.com|scdn\.co/, (r) => r.abort());
  await ctx.addInitScript((storage) => {
    let s = 54; // mulberry32
    Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    if (!sessionStorage.getItem("seeded")) {
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, JSON.stringify(v));
      sessionStorage.setItem("seeded", "1");
    }
  }, { "bh-sound": false, ...storage });
  return ctx.newPage();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 80 });
  console.log(`  docs/screenshots/${name}.jpg`);
}

await fs.mkdir(out, { recursive: true });
console.log("Capturing screenshots…");

// 1. The box, opened, with the note on the deck
let page = await open();
await page.goto(base);
await wait(1200);
await page.click("#lid");
await wait(2200);
await shot(page, "box");

// 2. The letter
await page.click("#box-note");
await wait(2400);
await shot(page, "letter");
await page.context().close();

// 3. The table: one card, front and back
page = await open({ storage: { "bh-letter": true } });
await page.goto(`${base}#/card/30`);
await page.waitForSelector("#caption.on");
await wait(2600); // let the card finish developing
await shot(page, "card");
await page.click("#turn");
await wait(1400);
await shot(page, "card-back");
await page.context().close();

// 4. A three-card reading
page = await open({ storage: { "bh-letter": true } });
await page.goto(`${base}#/reading/0-30-51`);
await wait(4500);
await shot(page, "reading");
await page.context().close();

// 5. The Spread, part-way through the deck
page = await open({ storage: { "bh-letter": true, "bh-seen": SEEN } });
await page.goto(`${base}#/spread`);
await wait(1500);
await page.click("#by-album");
await wait(2500);
await shot(page, "spread");
await page.context().close();

// 6. On a phone
page = await open({ width: 390, height: 844, mobile: true, storage: { "bh-letter": true } });
await page.goto(`${base}#/card/11`);
await page.waitForSelector("#caption.on");
await wait(2600);
await shot(page, "mobile");
await page.context().close();

// 7. The whole deck, in order: a contact sheet of the 54 (the hidden card stays hidden)
const cards = JSON.parse(await fs.readFile(path.join(root, "data/cards.json"), "utf8")).filter((c) => !c.hidden);
const pad = (n) => String(n).padStart(2, "0");
page = await open({ width: 1100, height: 600, scale: 2 });
await page.setContent(`<!doctype html><base href="${base}">
<style>
  body { margin: 0; padding: 44px; background: radial-gradient(120% 90% at 70% 10%, #e6e1d8 0%, transparent 60%), radial-gradient(90% 70% at 10% 100%, #c4bcb0 0%, transparent 70%), #d7d1c7; }
  .grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 14px; }
  img { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 4.2% / 3.15%;
    box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 10px 18px -10px rgba(28,20,10,.55); }
</style>
<div class="grid">${cards.map((c) => `<img src="images/thumbs/${pad(c.n)}.webp" alt="">`).join("")}</div>`);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
await page.screenshot({ path: path.join(out, "deck.jpg"), type: "jpeg", quality: 82, fullPage: true });
console.log("  docs/screenshots/deck.jpg");
await page.context().close();

// 8. The social preview GitHub shows when the repo is linked (upload it in Settings > Social preview)
page = await open({ width: 1280, height: 640, scale: 1 });
await page.setContent(`<!doctype html><base href="${base}">
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400&family=Cormorant+Garamond:ital,wght@1,400&display=swap" rel="stylesheet">
<style>
  body { margin: 0; width: 1280px; height: 640px; overflow: hidden; position: relative; color: #f4e6da; font-family: "Jost", sans-serif; font-weight: 300;
    background: radial-gradient(90% 120% at 78% 40%, #7b1c27 0%, transparent 65%), radial-gradient(80% 90% at 0% 100%, #3a0810 0%, transparent 70%), #5a1019; }
  .words { position: absolute; left: 88px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
  .mark { font-size: 19px; letter-spacing: .42em; text-transform: uppercase; }
  .mark span { opacity: .55; margin: 0 .5em; }
  h1 { font-family: "Cormorant Garamond", serif; font-style: italic; font-weight: 400; font-size: 70px; line-height: 1.02; margin: 34px 0 30px; }
  .meta { font-size: 15px; letter-spacing: .32em; text-transform: uppercase; color: #cf9f96; }
  .fan { position: absolute; right: 70px; top: 0; bottom: 0; width: 520px; }
  .fan img { position: absolute; width: 250px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 4.2% / 3.15%; top: 140px; left: 135px;
    box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 40px 60px -20px rgba(18,2,10,.9); }
</style>
<div class="words">
  <div class="mark">Beach House<span>/</span>54 Images</div>
  <h1>Draw a card<br>and its song plays.</h1>
  <div class="meta">54 cards · 2006 – 2023 · a fan site</div>
</div>
<div class="fan">
  <img src="images/00.webp" style="transform: translate(-125px, 34px) rotate(-11deg)">
  <img src="images/51.webp" style="transform: translate(125px, 34px) rotate(11deg)">
  <img src="images/30.webp" style="transform: translateY(-8px)">
</div>`);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(out, "social.jpg"), type: "jpeg", quality: 88 });
console.log("  docs/screenshots/social.jpg");
await page.context().close();

// 9. The hero: three draws in a row (velvet, a kitchen at night, the sea), recorded as a loop.
// Frames come from Chrome's screencast, which delivers one whenever the page repaints.
const spotifyUp = await fetch("https://open.spotify.com/embed/iframe-api/v1", { signal: AbortSignal.timeout(5000) })
  .then((r) => r.ok).catch(() => false);
const DRAWS = [30, 11, 0, 30]; // ends where it starts, so the loop is seamless
page = await open({ scale: 1, spotify: spotifyUp, storage: { "bh-letter": true, "bh-sound": spotifyUp } });
await page.goto(`${base}#/card/${DRAWS[0]}`);
if (!spotifyUp) await page.addStyleTag({ content: ".player iframe { visibility: hidden; }" });
await page.waitForSelector("#caption.on");
await wait(spotifyUp ? 6000 : 3000); // let the player load its first track
const frameDir = await fs.mkdtemp(path.join(os.tmpdir(), "bh-hero-"));
const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", (f) => {
  frames.push(f);
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1280, maxHeight: 800 });
await wait(900);
for (const n of DRAWS.slice(1)) {
  await page.evaluate((n) => { location.hash = `#/card/${n}`; }, n);
  await wait(4600);
}
await cdp.send("Page.stopScreencast");
await page.context().close();
const t0 = frames[0].metadata.timestamp;
await Promise.all(frames.map((f, i) => fs.writeFile(path.join(frameDir, `${pad(i).padStart(4, "0")}.jpg`), Buffer.from(f.data, "base64"))));
await fs.writeFile(path.join(frameDir, "times.json"), JSON.stringify(frames.map((f) => f.metadata.timestamp - t0)));
try {
  execFileSync("python3", [path.join(root, "scripts/animate.py"), frameDir, path.join(out, "hero.webp")], { stdio: "inherit" });
} catch {
  console.warn("  hero.webp not updated (scripts/animate.py needs Python 3 with Pillow)");
}
await fs.rm(frameDir, { recursive: true, force: true });

await browser.close();
server.close();
