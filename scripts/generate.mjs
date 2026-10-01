// Generates the 54 card images with OpenAI's image API.
// Usage: node --env-file=.env scripts/generate.mjs [--only 0,5,12] [--force] [--concurrency 4]
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "images");
const LOG = path.join(ROOT, "data", "generation-log.json");

const MODEL = process.env.IMAGE_MODEL || "gpt-image-2.5-sunburst";
const SIZE = "1152x1536"; // 3:4 vertical
const SAFETY_NOTE =
  " All figures are fully and modestly clothed; nothing revealing or suggestive.";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY missing. Put it in .env and run with --env-file=.env");
  process.exit(1);
}

const cards = JSON.parse(await fs.readFile(path.join(ROOT, "data", "cards.source.json"), "utf8"));
const only = opt("only")?.split(",").map(Number);
const concurrency = Number(opt("concurrency", 4));
const force = flag("force");

await fs.mkdir(OUT, { recursive: true });
let log = {};
try { log = JSON.parse(await fs.readFile(LOG, "utf8")); } catch {}

const file = (i) => path.join(OUT, `${String(i).padStart(2, "0")}.webp`);
const exists = (p) => fs.access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: SIZE,
      quality: "high",
      output_format: "webp",
      output_compression: 90,
      moderation: "low",
    }),
  });
  const body = await res.json();
  if (body.error) {
    const err = new Error(body.error.message);
    err.code = body.error.code;
    err.status = res.status;
    throw err;
  }
  return Buffer.from(body.data[0].b64_json, "base64");
}

async function generate(i) {
  const card = cards[i];
  const attempts = [
    { prompt: card.prompt, note: false },
    { prompt: card.prompt, note: false },
    { prompt: card.prompt + SAFETY_NOTE, note: true },
    { prompt: card.prompt + SAFETY_NOTE, note: true },
  ];
  for (let a = 0; a < attempts.length; a++) {
    const { prompt, note } = attempts[a];
    try {
      const t = Date.now();
      const img = await request(prompt);
      await fs.writeFile(file(i), img);
      log[i] = { title: card.title, model: MODEL, safetyNote: note, attempts: a + 1, at: new Date().toISOString() };
      console.log(`✓ ${i} ${card.title} (${((Date.now() - t) / 1000).toFixed(0)}s${note ? ", safety note" : ""})`);
      return;
    } catch (e) {
      console.log(`… ${i} ${card.title} attempt ${a + 1}: ${e.code || e.status} ${e.message.slice(0, 120)}`);
      if (e.code === "moderation_blocked") continue;
      if (e.status === 429 || e.status >= 500 || !e.status) { await sleep(5000 * (a + 1)); continue; }
      break; // other 4xx: don't burn retries
    }
  }
  log[i] = { title: card.title, failed: true, at: new Date().toISOString() };
  console.log(`✗ ${i} ${card.title} failed`);
}

const queue = [];
for (let i = 0; i < cards.length; i++) {
  if (only && !only.includes(i)) continue;
  if (!force && (await exists(file(i)))) continue;
  queue.push(i);
}
console.log(`Generating ${queue.length} image(s) with ${MODEL}, ${concurrency} at a time`);

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      await generate(queue.shift());
      await fs.writeFile(LOG, JSON.stringify(log, null, 2));
    }
  })
);
console.log("Done.");
