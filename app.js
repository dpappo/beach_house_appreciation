const [cards, palettes] = await Promise.all([
  fetch("data/cards.json").then((r) => r.json()),
  fetch("data/palettes.json").then((r) => r.json()).catch(() => null), // the table just stays plain without it
]);
// The last card is hidden: it joins the deck only once the other 54 have been turned over.
const HIDDEN = cards.findIndex((c) => c.hidden);
const N = HIDDEN < 0 ? cards.length : HIDDEN;
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const imgSrc = (n) => `images/${pad(n)}.webp`;
const thumbSrc = (n) => `images/thumbs/${pad(n)}.webp`;
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const metaLine = (c) => [c.album, c.chapter && `Chapter ${c.chapter}`, c.year, c.hidden && "The hidden card"].filter(Boolean).join(" · ");

const el = {
  card: $("#card"), inner: $("#card .card-inner"), img: $("#card-img"), deck: $("#deck"),
  caption: $("#caption"), num: $("#cap-num"), title: $("#cap-title"), meta: $("#cap-meta"), turn: $("#turn"),
  bnNum: $("#bn-num"), bnText: $("#bn-text"),
  player: $("#player"), sound: $("#sound"), playOn: $("#play-on"), openSpotify: $("#open-spotify"),
  spread: $("#spread-table"), count: $("#count"), about: $("#about"), letter: $("#letter"), sheet: $("#sheet"),
  readingCards: $("#reading-cards"), toast: $("#toast"),
};

let current = null;
let seq = 0;

/* ---------------- The collection ---------------- */

const seen = new Set(store.get("bh-seen", []));
let unlocked = store.get("bh-unlocked", false);
const size = () => (unlocked ? cards.length : N);

function markSeen(n) {
  if (seen.has(n)) return;
  seen.add(n);
  store.set("bh-seen", [...seen]);
  renderCount();
  syncMini(n);
  if (!unlocked && HIDDEN >= 0 && [...Array(N).keys()].every((i) => seen.has(i))) {
    unlocked = true;
    store.set("bh-unlocked", true);
    pool = [];
    setTimeout(() => toast("You’ve turned over all 54. There’s one more card in the box.", "Draw it", () => { location.hash = `#/card/${HIDDEN}`; }), 2600);
  }
}

function renderCount() {
  const k = [...seen].filter((n) => n < N).length;
  el.count.textContent = unlocked ? "· All 54 turned over, and one more" : `· ${k} of ${N} turned over`;
}
renderCount();

let toastTimer;
function toast(text, action, fn) {
  $("#toast-text").textContent = text;
  const btn = $("#toast-action");
  btn.textContent = action;
  btn.onclick = () => { hideToast(); fn(); };
  el.toast.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.toast.classList.add("on")));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 14000);
}
function hideToast() { el.toast.classList.remove("on"); setTimeout(() => { el.toast.hidden = true; }, 600); }

/* ---------------- Table colour ---------------- */

// Each card has a palette derived from its image (scripts/palettes.py). While a card is
// in hand the table takes on its colours; otherwise it goes back to plain paper.
// Depression Cherry came in a red velvet sleeve, so its cards lay the table with velvet instead.
const VELVET = {
  paper: "#5a1019", "paper-hi": "#7b1c27", "paper-lo": "#3a0810", ink: "#f4e6da", "ink-soft": "#e8d2c5",
  muted: "#cf9f96", shade: "#12020a", light: "#ffd6c8",
};
const themeMeta = document.querySelector('meta[name="theme-color"]');
let tinted;
function tint(n) {
  dispatchEvent(new CustomEvent("mood", { detail: n })); // caustics.js: some cards bring their own light
  const velvet = n != null && cards[n].album === "Depression Cherry";
  document.body.dataset.material = velvet ? "velvet" : "";
  const p = velvet ? VELVET : (n != null && palettes?.cards[n]) || palettes?.neutral;
  if (!p || p === tinted) return;
  tinted = p;
  const root = document.documentElement.style;
  for (const k of ["paper", "paper-hi", "paper-lo", "ink", "ink-soft", "muted", "shade"]) root.setProperty(`--${k}`, p[k]);
  themeMeta.content = p.paper;
  const light = [1, 3, 5].map((i) => parseInt(p.light.slice(i, i + 2), 16) / 255);
  dispatchEvent(new CustomEvent("tint", { detail: light }));
}

// the card whose colours the table should wear right now, if any
function inHand() {
  const view = document.body.dataset.view;
  if (view === "table" && current !== null && el.card.classList.contains("annotated")) return current;
  if (view === "reading" && reading.active >= 0) return reading.cards[reading.active];
  return null;
}

// velvet changes shade with the direction of the pile: let the sheen follow the pointer
let sheenFrame = 0;
addEventListener("pointermove", (e) => {
  if (document.body.dataset.material !== "velvet" || sheenFrame) return;
  sheenFrame = requestAnimationFrame(() => {
    sheenFrame = 0;
    document.documentElement.style.setProperty("--vx", `${(e.clientX / innerWidth) * 100}%`);
    document.documentElement.style.setProperty("--vy", `${(e.clientY / innerHeight) * 100}%`);
  });
});

/* ---------------- Views & routing ---------------- */

function setView(view) {
  document.body.dataset.view = view;
  if (view !== "intro" && el.letter.open) { clearTimeout(letterClosing); el.letter.close(); el.letter.classList.remove("closing"); }
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === view));
  if (view === "spread") renderSpread();
  tint(inHand());
}

function setHash(h) { history.replaceState(null, "", h); }

function route() {
  const h = location.hash;
  const m = h.match(/^#\/card\/(\d+)/);
  const r = h.match(/^#\/reading\/(\d+)-(\d+)-(\d+)$/);
  if (m && +m[1] < cards.length) {
    setView("table");
    if (+m[1] !== current) show(+m[1], 1);
  } else if (h.startsWith("#/card")) {
    setView("table");
    const n = playingN ?? current; // come back to whatever is playing
    if (n === null) show(drawIndex(), 1);
    else if (n !== current) show(n, 1);
    else setHash(`#/card/${current}`);
  } else if (r && r.slice(1).every((x) => +x < cards.length)) {
    setView("reading");
    const ns = r.slice(1).map(Number);
    if (ns.join("-") !== reading.cards.join("-")) deal(ns);
  } else if (h.startsWith("#/reading")) {
    setView("reading");
    deal(drawThree());
  } else if (h === "#/spread") {
    setView("spread");
  } else {
    setView("intro");
  }
}
addEventListener("hashchange", route);

/* ---------------- Intro box & the letter ---------------- */

const box = $("#box");
$("#lid").addEventListener("click", () => {
  box.classList.add("open");
  const hint = $("#intro-hint");
  hint.style.opacity = 0;
  setTimeout(() => {
    if (store.get("bh-letter", false)) hint.hidden = true;
    else { hint.textContent = "There’s a note in the box"; hint.style.opacity = ""; }
    $("#intro-draw").hidden = false;
  }, 900);
});
$("#intro-draw").addEventListener("click", () => { location.hash = `#/card/${drawIndex()}`; });
box.querySelector(".box-well").addEventListener("click", (e) => {
  if (box.classList.contains("open") && !e.target.closest(".box-note")) location.hash = `#/card/${drawIndex()}`;
});

// The letter is folded in thirds. Each panel shows its third of the same text, so it can unfold in 3D.
(function foldLetter() {
  const text = el.sheet.querySelector(".letter-text");
  for (let i = 0; i < 3; i++) {
    const panel = document.createElement("div");
    panel.className = `panel p${i}`;
    const front = document.createElement("div");
    front.className = "pf";
    const copy = text.cloneNode(true);
    if (i) copy.setAttribute("aria-hidden", "true");
    front.append(copy);
    panel.append(front);
    if (i !== 1) {
      const back = document.createElement("div");
      back.className = "pb";
      if (i === 0) back.innerHTML = "<span>for you</span>";
      panel.append(back);
    }
    el.sheet.append(panel);
  }
  text.remove();
})();

let letterClosing = null;
function openLetter() {
  clearTimeout(letterClosing);
  el.sheet.classList.add("folded");
  el.letter.classList.remove("closing");
  el.letter.showModal();
  void el.sheet.offsetWidth; // start folded, then unfold
  el.sheet.classList.remove("folded");
  store.set("bh-letter", true);
  $("#intro-hint").hidden = true;
}
function closeLetter() {
  if (!el.letter.open || el.letter.classList.contains("closing")) return;
  el.sheet.classList.add("folded");
  el.letter.classList.add("closing");
  letterClosing = setTimeout(() => { el.letter.close(); el.letter.classList.remove("closing"); }, 1500);
}
$("#box-note").addEventListener("click", openLetter);
$("#letter-close").addEventListener("click", closeLetter);
el.letter.addEventListener("cancel", (e) => { e.preventDefault(); closeLetter(); });
el.letter.addEventListener("click", (e) => { if (e.target === el.letter) closeLetter(); });

/* ---------------- Drawing ---------------- */

let pool = [];
function drawIndex() {
  if (!pool.length) {
    pool = [...Array(size()).keys()].filter((i) => i !== current);
    for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  }
  return pool.pop();
}
const go = (n, dir) => { if (n !== current) { show(n, dir); } };
const step = (d) => go((current + d + size()) % size(), d);

/* ---------------- The card ---------------- */

const isNarrow = () => matchMedia("(max-width: 760px)").matches;

function fromDeckTransform() {
  if (isNarrow() || getComputedStyle(el.deck).display === "none") return "translate(-70vw, 6vh) rotate(-12deg)";
  const d = el.deck.getBoundingClientRect(), c = el.card.getBoundingClientRect();
  const dx = d.left + d.width / 2 - (c.left + c.width / 2);
  const dy = d.top + d.height / 2 - (c.top + c.height / 2);
  return `translate(${dx}px, ${dy}px) rotate(-4deg) scale(${d.width / c.width})`;
}

let outAnim = null;
async function show(n, dir = 1) {
  const token = ++seq;
  const c = cards[n];
  const firstCard = current === null;
  current = n;
  setHash(`#/card/${n}`);

  const pre = new Image();
  pre.src = imgSrc(n);
  const ready = pre.decode().then(() => true, () => false);

  el.caption.classList.remove("on");

  if (!firstCard && document.body.dataset.view === "table") {
    outAnim?.cancel();
    outAnim = el.card.animate(
      [{ transform: "none", opacity: 1 }, { transform: `translate(${dir * 55}vw, -2vh) rotate(${dir * 9}deg)`, opacity: 0 }],
      { duration: 420, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }
    );
    await outAnim.finished.catch(() => {});
    if (token !== seq) return;
  }

  // reset face-down, with a clean back, without animating the flip
  el.inner.style.transition = "none";
  el.card.classList.remove("revealed", "annotated", "developing", "sparking");
  void el.inner.offsetWidth;
  el.inner.style.transition = "";
  el.bnNum.textContent = `No. ${pad(n)} · ${c.title}`;
  el.bnText.textContent = c.note || "";

  const front = el.img.parentElement;
  front.classList.remove("missing");
  el.img.classList.remove("loaded");
  el.img.onload = () => el.img.classList.add("loaded");
  el.img.onerror = () => { el.img.removeAttribute("src"); front.classList.add("missing"); };
  el.img.src = imgSrc(n);
  el.img.alt = `Card ${pad(n)}, inspired by “${c.title}”`;

  const from = dir < 0 && !isNarrow() ? `translate(-55vw, -2vh) rotate(-9deg)` : fromDeckTransform();
  const inAnim = el.card.animate(
    [{ transform: from, opacity: 0 }, { transform: from, opacity: 1, offset: 0.08 }, { transform: "none", opacity: 1 }],
    { duration: 760, easing: "cubic-bezier(.22,.9,.25,1)" }
  );
  outAnim?.cancel();
  outAnim = null;
  await inAnim.finished.catch(() => {});
  if (token !== seq) return;

  await Promise.race([ready, sleep(2500)]);
  if (token !== seq) return;
  reveal(true);
}

// first: the card has just been dealt (it develops like a photograph); otherwise it's being turned back up
function reveal(first = false) {
  const c = cards[current];
  el.card.classList.add("revealed", "annotated");
  if (first) {
    el.card.classList.remove("developing");
    void el.card.offsetWidth;
    el.card.classList.add("developing");
    if (current === 29) sparkFrom(el.card, 0.484, 0.479); // "Sparks": the spark between the fingertips
  }
  tint(current);
  el.num.textContent = `No. ${pad(current)}`;
  el.title.textContent = c.title;
  el.meta.textContent = metaLine(c);
  renderTurn();
  setTimeout(() => el.caption.classList.add("on"), 350);
  markSeen(current);
  playCard(c);
  // warm the neighbours
  [current + 1, current - 1].forEach((i) => { const im = new Image(); im.src = imgSrc((i + size()) % size()); });
}

function sparkFrom(node, fx, fy) {
  setTimeout(() => {
    const r = node.getBoundingClientRect();
    node.classList.add("sparking");
    dispatchEvent(new CustomEvent("spark", { detail: { x: (r.left + r.width * fx) / innerWidth, y: 1 - (r.top + r.height * fy) / innerHeight } }));
  }, 650);
}

// Turning a card over shows what's written on its back.
function flip() {
  if (current === null || !el.card.classList.contains("annotated")) return;
  if (el.card.classList.contains("revealed")) el.card.classList.remove("revealed");
  else reveal();
  renderTurn();
}
function renderTurn() { el.turn.textContent = el.card.classList.contains("revealed") ? "Turn it over" : "Turn it back"; }
el.turn.addEventListener("click", flip);

// pointer tilt + light glare
function track(e) {
  const r = el.card.getBoundingClientRect();
  const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  el.card.style.setProperty("--mx", `${px * 100}%`);
  el.card.style.setProperty("--my", `${py * 100}%`);
  el.card.style.setProperty("--ry", `${(px - 0.5) * 12}deg`);
  el.card.style.setProperty("--rx", `${(0.5 - py) * 12}deg`);
}
el.card.addEventListener("pointerenter", () => el.card.classList.add("tracking"));
el.card.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") track(e); });
el.card.addEventListener("pointerleave", () => {
  el.card.classList.remove("tracking");
  ["--rx", "--ry"].forEach((p) => el.card.style.setProperty(p, "0deg"));
  ["--mx", "--my"].forEach((p) => el.card.style.setProperty(p, "50%"));
});

// tap to flip, swipe to move through the deck
let swipe = null;
el.card.addEventListener("pointerdown", (e) => { swipe = { x: e.clientX, y: e.clientY, moved: false }; });
el.card.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    swipe.moved = true;
    step(dx < 0 ? 1 : -1);
  }
});
el.card.addEventListener("click", () => { if (!swipe?.moved) flip(); swipe = null; });
el.card.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); flip(); } });

$("#prev").addEventListener("click", () => step(-1));
$("#next").addEventListener("click", () => step(1));
$("#draw").addEventListener("click", () => go(drawIndex(), 1));
el.deck.addEventListener("click", () => go(drawIndex(), 1));

/* ---------------- Reading: three cards, played in order ---------------- */

const POSITIONS = ["What you remember", "What you’re hearing", "What you’re becoming"];
const reading = { cards: [], active: -1, slots: [], ready: false };
let readingSeq = 0;

function drawThree() {
  const ns = [];
  while (ns.length < 3) { const n = drawIndex(); if (!ns.includes(n)) ns.push(n); }
  return ns;
}

function buildReading() {
  POSITIONS.forEach((pos, i) => {
    const slot = document.createElement("figure");
    slot.className = "slot";
    slot.innerHTML = `
      <div class="rcard" role="button" tabindex="0">
        <div class="rinner">
          <div class="face back"><img src="images/back.webp" alt="" /><span class="holo"></span></div>
          <div class="face front"><img alt="" /><span class="glare"></span></div>
        </div>
      </div>
      <figcaption><span class="pos">${pos}</span><span class="rtitle"></span><span class="rmeta"></span></figcaption>`;
    const rc = slot.querySelector(".rcard");
    const pick = () => {
      if (!reading.ready) return;
      if (reading.active === i) location.hash = `#/card/${reading.cards[i]}`; // a second tap picks it up
      else activate(i);
    };
    rc.addEventListener("click", pick);
    rc.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    el.readingCards.append(slot);
    reading.slots.push(slot);
  });
}
buildReading();

async function deal(ns) {
  const token = ++readingSeq;
  reading.cards = ns;
  reading.active = -1;
  reading.ready = false;
  setHash(`#/reading/${ns.join("-")}`);
  $('[data-nav="reading"]').href = `#/reading/${ns.join("-")}`;
  const ready = ns.map((n) => { const im = new Image(); im.src = imgSrc(n); return im.decode().then(() => true, () => false); });
  reading.slots.forEach((slot, i) => {
    const c = cards[ns[i]];
    slot.classList.remove("dealt", "revealed", "developing", "active");
    slot.querySelector(".rcard").classList.remove("sparking");
    slot.querySelector(".front img").src = imgSrc(ns[i]);
    slot.querySelector(".front img").alt = `Card ${pad(ns[i])}, inspired by “${c.title}”`;
    slot.querySelector(".rtitle").textContent = c.title;
    slot.querySelector(".rmeta").textContent = metaLine(c);
  });
  await sleep(60);
  for (const slot of reading.slots) {
    if (token !== readingSeq) return;
    slot.classList.add("dealt");
    await sleep(200);
  }
  await sleep(700);
  for (let i = 0; i < 3; i++) {
    await Promise.race([ready[i], sleep(2500)]);
    if (token !== readingSeq) return;
    reading.slots[i].classList.add("revealed", "developing");
    if (ns[i] === 29) sparkFrom(reading.slots[i].querySelector(".rcard"), 0.484, 0.479);
    markSeen(ns[i]);
    await sleep(750);
  }
  if (token !== readingSeq) return;
  reading.ready = true;
  activate(0);
}

function activate(i) {
  reading.active = i;
  reading.slots.forEach((s, j) => s.classList.toggle("active", j === i));
  if (document.body.dataset.view === "reading") tint(reading.cards[i]);
  playCard(cards[reading.cards[i]]);
}

$("#redraw").addEventListener("click", () => deal(drawThree()));
$("#share-reading").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const url = location.href;
  const text = reading.cards.map((n) => cards[n].title).join(" · ");
  try {
    if (navigator.share) await navigator.share({ title: "A Beach House reading", text, url });
    else {
      await navigator.clipboard.writeText(url);
      btn.textContent = "Link copied";
      setTimeout(() => { btn.textContent = "Share this reading"; }, 2200);
    }
  } catch {} // share sheet dismissed
});

/* ---------------- Spotify ---------------- */

let controller = null;
let loadedUri = null;
let wantPlay = false;   // we've asked for playback and Spotify hasn't confirmed it yet
let retry = null;
let pendingCard = null;
let playingN = null;    // the card whose song is in the player
let soundOn = store.get("bh-sound", true);
let playOn = store.get("bh-play-on", true);

function renderSound() {
  el.sound.textContent = soundOn ? "Sound on" : "Sound off";
  el.sound.setAttribute("aria-pressed", String(soundOn));
  el.playOn.textContent = playOn ? "Play the deck: on" : "Play the deck: off";
  el.playOn.setAttribute("aria-pressed", String(playOn));
}
renderSound();
el.sound.addEventListener("click", () => {
  soundOn = !soundOn;
  store.set("bh-sound", soundOn);
  renderSound();
  if (!controller) return;
  if (soundOn) requestPlay(); else { stopRetry(); controller.pause(); }
});
el.playOn.addEventListener("click", () => {
  playOn = !playOn;
  store.set("bh-play-on", playOn);
  renderSound();
});

function stopRetry() { wantPlay = false; clearInterval(retry); retry = null; }

const log = (...a) => console.debug("[player]", ...a);

// The embed ignores play() until its iframe has loaded the track, and loadUri()
// doesn't reliably say when that is (logged-in, full-track players load slower).
// play() restarts the track, so retry it only until Spotify reports this track playing.
function requestPlay() {
  if (!controller || !soundOn) return;
  stopRetry();
  const uri = loadedUri;
  wantPlay = true;
  let attempts = 0;
  const attempt = () => {
    if (!wantPlay || loadedUri !== uri || attempts >= 4) return stopRetry();
    attempts++;
    log("play()", uri, "attempt", attempts);
    controller.play();
  };
  attempt();
  retry = setInterval(attempt, 2000);
}

// Tell the light whether music is playing. Pauses are debounced so a track change doesn't dim the room.
let musicPlaying = true, pauseTimer = null;
function setMusic(playing) {
  clearTimeout(pauseTimer);
  const send = () => { if (musicPlaying !== playing) { musicPlaying = playing; dispatchEvent(new CustomEvent("music", { detail: { playing } })); } };
  if (playing) send(); else pauseTimer = setTimeout(send, 1200);
}

// Spotify doesn't announce the end of a track, so watch the position. Logged out, the embed
// stops after a 30-second preview while still reporting the full duration.
let lastPos = 0, endedUri = null;
function watchEnd({ position = 0, duration = 0, isPaused }) {
  if (!duration) return;
  if (!isPaused && position < duration - 3000) endedUri = null; // playing (again)
  if (endedUri === loadedUri) return;
  const atEnd = position >= duration - 700;
  const wrapped = isPaused && lastPos >= duration - 3000 && position < lastPos;
  const previewDone = isPaused && duration > 32000 && lastPos > 28500 && lastPos < 31500 && Math.abs(position - lastPos) < 1500;
  if (!isPaused) lastPos = position;
  if (atEnd || wrapped || previewDone) { endedUri = loadedUri; onEnded(); }
}

function initSpotify(api) {
  const first = pendingCard || cards[0];
  loadedUri = `spotify:track:${first.spotify}`;
  log("creating controller", loadedUri);
  api.createController($("#embed"), { uri: loadedUri, width: "100%", height: 80, theme: "dark" }, (c) => {
    controller = c;
    c.addListener("ready", () => {
      log("ready", loadedUri, wantPlay ? "(want play)" : "");
      if (wantPlay) c.play();
    });
    c.addListener("playback_update", (e) => {
      const d = e.data || {};
      if (d.playingURI && d.playingURI !== loadedUri) return; // stale update from the previous track
      if (wantPlay && d.isPaused === false) { log("playing", loadedUri); stopRetry(); }
      if (pendingCard) setMusic(d.isPaused === false);
      watchEnd(d);
    });
    if (!pendingCard) return;
    // a card may have been revealed while the player was still being created
    if (`spotify:track:${pendingCard.spotify}` !== loadedUri) playCard(pendingCard);
    else requestPlay();
  });
}
if (window.__spotifyApi) initSpotify(window.__spotifyApi);
else addEventListener("spotify-ready", () => initSpotify(window.__spotifyApi), { once: true });

// If the iframe API never arrives (blockers, strict privacy settings), fall back to a
// plain embed. It can't autoplay, so the listener presses play in it.
let plainEmbed = null;
setTimeout(() => {
  if (controller || window.__spotifyApi) return;
  console.warn("Spotify iframe API did not load; using a plain embed instead");
  plainEmbed = document.createElement("iframe");
  plainEmbed.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  plainEmbed.title = "Spotify player";
  $("#embed").replaceWith(plainEmbed);
  if (pendingCard) playCard(pendingCard);
}, 6000);

function playCard(c) {
  const uri = `spotify:track:${c.spotify}`;
  el.openSpotify.href = `https://open.spotify.com/track/${c.spotify}`;
  el.player.classList.add("on");
  pendingCard = c;
  playingN = c.n;
  syncPlaying();
  if (plainEmbed) { plainEmbed.src = `https://open.spotify.com/embed/track/${c.spotify}?theme=0`; return; }
  if (!controller) return;
  if (uri === loadedUri) { if (soundOn) controller.resume(); return; }
  loadedUri = uri;
  lastPos = 0;
  controller.loadUri(uri);
  requestPlay();
}

// Play the deck: when a song ends, deal the next one.
let endTimer = null;
function onEnded() {
  log("ended", loadedUri);
  if (!playOn || !soundOn) return;
  const view = document.body.dataset.view;
  clearTimeout(endTimer);
  if (view === "table" && current === playingN) {
    // turn the card over to its note, then deal the next
    if (el.card.classList.contains("revealed")) flip();
    endTimer = setTimeout(() => { if (current === playingN) go(drawIndex(), 1); }, 1800);
  } else if (reading.ready && reading.cards[reading.active] === playingN) {
    // a reading plays through in order, even from another view, and then rests
    if (reading.active < 2) activate(reading.active + 1);
  } else {
    const n = drawIndex();
    markSeen(n);
    playCard(cards[n]);
  }
}

/* ---------------- Spread ---------------- */

const SPREAD_KEY = "bh-spread-v1";
let layout = store.get(SPREAD_KEY, null); // { n: [x, y, r] } in units of table width
let labels = store.get("bh-spread-labels", null); // album piles: [[text, x, y, w]]
let albumW = store.get("bh-spread-album-w", 0);     // table width the piles were laid out for
let z = Math.max(10, ...Object.values(layout || {}).map((v) => v[3] || 0));
const minis = [];

function thumbWidth() { return Math.round(Math.min(150, Math.max(84, el.spread.clientWidth / 8.5))); }

function gather() {
  const W = el.spread.clientWidth, tw = thumbWidth(), th = tw * (4 / 3);
  const gap = Math.max(14, tw * 0.22);
  const cols = Math.max(3, Math.floor((W + gap) / (tw + gap)));
  const offset = (W - (cols * tw + (cols - 1) * gap)) / 2;
  layout = {};
  for (let n = 0; n < size(); n++) {
    const col = n % cols, row = Math.floor(n / cols);
    const jx = (Math.random() - 0.5) * gap * 0.5, jy = (Math.random() - 0.5) * gap * 0.5;
    layout[n] = [(offset + col * (tw + gap) + jx) / W, (row * (th + gap) + jy) / W, (Math.random() - 0.5) * 7];
  }
  setLabels(null);
}

function scatter() {
  const W = el.spread.clientWidth, tw = thumbWidth();
  const H = Math.max(innerHeight - 260, (Math.ceil(size() / Math.max(3, Math.floor(W / (tw * 1.2)))) * tw * 1.33 * 1.05));
  layout = {};
  for (let n = 0; n < size(); n++) {
    layout[n] = [Math.random() * (W - tw) / W, Math.random() * (H - tw * 1.33) / W, (Math.random() - 0.5) * 34];
  }
  setLabels(null);
}

// one fanned pile per album, in release order, each with its name underneath
function byAlbum() {
  const W = el.spread.clientWidth, tw = thumbWidth(), th = tw * (4 / 3);
  const fan = tw * 0.3, gapX = Math.max(26, tw * 0.45), rowH = th + 74;
  const groups = [];
  for (let n = 0; n < size(); n++) {
    let g = groups.find((g) => g.album === cards[n].album);
    if (!g) groups.push((g = { album: cards[n].album, year: cards[n].year, ns: [] }));
    g.ns.push(n);
  }
  const rows = [[]];
  let x = 0;
  for (const g of groups) {
    g.w = tw + (g.ns.length - 1) * fan;
    if (x && x + g.w > W) { rows.push([]); x = 0; }
    rows.at(-1).push(g);
    x += g.w + gapX;
  }
  layout = {};
  const next = [];
  rows.forEach((row, ri) => {
    let x = (W - row.reduce((s, g) => s + g.w, 0) - gapX * (row.length - 1)) / 2;
    const y = ri * rowH;
    for (const g of row) {
      g.ns.forEach((n, i) => { layout[n] = [(x + i * fan) / W, (y + (i % 2) * 4) / W, (Math.random() - 0.5) * 3, i + 1]; });
      next.push([`${g.album} · ${g.year}`, x / W, (y + th + 18) / W, g.w / W]);
      x += g.w + gapX;
    }
  });
  albumW = W;
  store.set("bh-spread-album-w", W);
  setLabels(next);
}

function setLabels(next) {
  labels = next;
  store.set("bh-spread-labels", labels);
  store.set(SPREAD_KEY, layout);
}

function place(node, n) {
  const W = el.spread.clientWidth;
  if (!layout[n]) { // a card that wasn't on the table when this layout was made
    const maxY = Math.max(0, ...Object.values(layout).map(([, y]) => y));
    layout[n] = [Math.random() * 0.8, maxY + 0.05, (Math.random() - 0.5) * 20];
  }
  const [x, y, r, zi] = layout[n];
  node.style.transform = `translate(${x * W}px, ${y * W}px) rotate(${r}deg)`;
  if (zi) node.style.zIndex = zi;
}

function fitHeight() {
  const W = el.spread.clientWidth, th = thumbWidth() * (4 / 3);
  const maxY = Math.max(...Object.values(layout).map(([, y]) => y * W));
  el.spread.style.height = `${maxY + th + (labels ? 70 : 40)}px`;
}

function renderLabels() {
  el.spread.querySelectorAll(".pile-label").forEach((l) => l.remove());
  const W = el.spread.clientWidth;
  for (const [text, x, y, w] of labels || []) {
    const l = document.createElement("span");
    l.className = "pile-label";
    l.textContent = text;
    l.style.transform = `translate(${x * W}px, ${y * W}px)`;
    l.style.width = `${w * W}px`;
    el.spread.append(l);
  }
}

// cards you haven't drawn yet lie face-down
function syncMini(n) {
  const node = minis[n];
  if (!node) return;
  const up = seen.has(n);
  node.classList.toggle("down", !up);
  node.setAttribute("aria-label", up ? `Card ${pad(n)}: ${cards[n].title}` : `Card ${pad(n)}, face down`);
  const img = node.querySelector("img");
  img.dataset.tried = "";
  img.src = up ? thumbSrc(n) : "images/thumbs/back.webp";
}
function syncPlaying() { minis.forEach((m, n) => m?.classList.toggle("playing", n === playingN)); }

function renderSpread() {
  el.spread.style.setProperty("--tw", `${thumbWidth()}px`);
  if (!layout) gather();
  else if (labels && el.spread.clientWidth !== albumW) byAlbum(); // piles don't stretch; lay them out again
  for (let n = 0; n < size(); n++) {
    if (minis[n]) continue;
    const node = document.createElement("div");
    node.className = "mini";
    node.dataset.n = n;
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.onerror = () => {
      if (!seen.has(n)) return;
      if (img.dataset.tried) { img.src = "images/back.webp"; img.onerror = null; return; }
      img.dataset.tried = "1";
      img.src = imgSrc(n);
    };
    const label = document.createElement("span"); label.className = "n"; label.textContent = pad(n);
    node.append(img, label);
    el.spread.append(node);
    minis[n] = node;
    syncMini(n);
    bindDrag(node, n);
  }
  minis.forEach((node, n) => place(node, n));
  syncPlaying();
  renderLabels();
  fitHeight();
}

function bindDrag(node, n) {
  let start = null;
  node.addEventListener("pointerdown", (e) => {
    node.setPointerCapture(e.pointerId);
    const W = el.spread.clientWidth;
    start = { x: e.clientX, y: e.clientY, ox: layout[n][0] * W, oy: layout[n][1] * W, dragged: false };
    node.style.zIndex = ++z;
    layout[n][3] = z;
  });
  node.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.dragged && Math.hypot(dx, dy) < 5) return;
    if (!start.dragged) { start.dragged = true; node.classList.add("dragging"); }
    const W = el.spread.clientWidth;
    layout[n][0] = (start.ox + dx) / W;
    layout[n][1] = Math.max(0, (start.oy + dy) / W);
    place(node, n);
  });
  const end = () => {
    if (!start) return;
    const wasDrag = start.dragged;
    start = null;
    node.classList.remove("dragging");
    if (wasDrag) { store.set(SPREAD_KEY, layout); fitHeight(); }
    else location.hash = `#/card/${n}`;
  };
  node.addEventListener("pointerup", end);
  node.addEventListener("pointercancel", () => { start = null; node.classList.remove("dragging"); });
  node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); location.hash = `#/card/${n}`; } });
}

$("#gather").addEventListener("click", () => { gather(); renderSpread(); });
$("#scatter").addEventListener("click", () => { scatter(); renderSpread(); });
$("#by-album").addEventListener("click", () => { byAlbum(); renderSpread(); });
addEventListener("resize", () => { if (document.body.dataset.view === "spread") renderSpread(); });

/* ---------------- About & keys ---------------- */

$("#about-open").addEventListener("click", () => el.about.showModal());
$("#about-close").addEventListener("click", () => el.about.close());
el.about.addEventListener("click", (e) => { if (e.target === el.about) el.about.close(); });

addEventListener("keydown", (e) => {
  if (el.about.open || el.letter.open || e.metaKey || e.ctrlKey || e.altKey) return;
  const view = document.body.dataset.view;
  if (e.key === "s" || e.key === "S") location.hash = "#/spread";
  else if (e.key === "r" || e.key === "R") location.hash = view === "reading" ? `#/reading` : $('[data-nav="reading"]').getAttribute("href");
  else if (e.key === "d" || e.key === "D") { if (view === "table") go(drawIndex(), 1); else location.hash = `#/card/${drawIndex()}`; }
  else if (view === "reading" && reading.ready && (e.key === "ArrowRight" || e.key === "ArrowLeft")) activate((reading.active + (e.key === "ArrowRight" ? 1 : 2)) % 3);
  else if (view !== "table") return;
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === " " && document.activeElement?.tagName !== "BUTTON") { e.preventDefault(); flip(); }
  else if (e.key === "Escape") location.hash = "#/spread";
});

route();
