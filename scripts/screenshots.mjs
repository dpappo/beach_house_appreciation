// Captures the README screenshots into docs/screenshots/.
//   npm run screenshots
// Serves the site itself on a free port, so it works whether or not serve.py is running.
// Spotify is blocked (the player would show a login wall or nothing in headless Chrome) and
// Math.random is seeded, so the same site produces the same shots.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
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
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());

// Cards the "visitor" has already turned over, so the Spread shows a mix of faces and backs.
const SEEN = [0, 2, 3, 5, 7, 8, 11, 12, 14, 16, 17, 19, 20, 22, 23, 26, 27, 29, 30, 31, 33, 34, 36, 38, 39, 41, 42, 44, 45, 47, 48, 50, 51, 53];

async function open({ width = 1280, height = 800, mobile = false, storage = {} } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1.5, isMobile: mobile, hasTouch: mobile,
    reducedMotion: "no-preference",
  });
  await ctx.route(/spotify\.com|scdn\.co/, (r) => r.abort());
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

await fs.rm(out, { recursive: true, force: true });
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

await browser.close();
server.close();
