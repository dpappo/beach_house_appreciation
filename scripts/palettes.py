"""Derive a table palette for each card: images/NN.webp -> data/palettes.json

The page is warm paper under dappled light. For each card we keep that paper but let it
take on the card's colour, the way a room takes on the light from a picture in it:

1. Downsample the card and move its pixels into OKLab, where distance ~ perceived difference.
2. k-means the pixels into a handful of colours.
3. Score each colour by how much of the card it covers and how colourful it is (like
   Material You's source-colour scoring), discounting near-black, whose hue is mostly noise.
   The winner sets the paper's hue; the best colour of a clearly different hue tints the
   shadowed corner of the table.
4. Rebuild the page's tokens at the same lightness as the default paper, with low chroma,
   and darken the text tokens until they clear WCAG contrast on every part of the gradient.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "images"
OUT = ROOT / "data" / "palettes.json"
N_CARDS = len(json.loads((ROOT / "data" / "cards.json").read_text()))

# ---------- colour maths (sRGB <-> OKLab, Björn Ottosson) ----------

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

def linear_to_oklab(rgb):
    m1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    m2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    return np.einsum("ij,...j->...i", m2, np.cbrt(np.einsum("ij,...j->...i", m1, rgb)))

def oklab_to_linear(lab):
    m1 = np.array([[1, 0.3963377774, 0.2158037573],
                   [1, -0.1055613458, -0.0638541728],
                   [1, -0.0894841775, -1.2914855480]])
    m2 = np.array([[4.0767416621, -3.3077115913, 0.2309699292],
                   [-1.2684380046, 2.6097574011, -0.3413193965],
                   [-0.0041960863, -0.7034186147, 1.7076147010]])
    return np.einsum("ij,...j->...i", m2, np.einsum("ij,...j->...i", m1, lab) ** 3)

def lch_to_lab(L, C, h):
    return np.array([L, C * np.cos(np.radians(h)), C * np.sin(np.radians(h))])

def lab_to_lch(lab):
    L, a, b = lab
    return L, float(np.hypot(a, b)), float(np.degrees(np.arctan2(b, a)) % 360)

def in_gamut(lab):
    lin = oklab_to_linear(lab)
    return bool(np.all(lin >= -1e-4) and np.all(lin <= 1 + 1e-4))

def lch(L, C, h):
    """OKLCH -> sRGB hex, reducing chroma until the colour fits in sRGB."""
    while C > 0 and not in_gamut(lch_to_lab(L, C, h)):
        C -= 0.002
    rgb = linear_to_srgb(oklab_to_linear(lch_to_lab(L, max(C, 0), h)))
    return "#" + "".join(f"{round(float(v) * 255):02x}" for v in rgb)

def hex_to_lab(hx):
    rgb = np.array([int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return linear_to_oklab(srgb_to_linear(rgb))

def luminance(hx):
    rgb = srgb_to_linear(np.array([int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)]))
    return float(np.dot(rgb, [0.2126, 0.7152, 0.0722]))

def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def hue_gap(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)

# ---------- the default table (styles.css), as OKLCH ----------

NEUTRAL = {
    "paper": "#d7d1c7", "paper-hi": "#e6e1d8", "paper-lo": "#c4bcb0",
    "ink": "#16130f", "ink-soft": "#3a342d", "muted": "#6e665c",
    "shade": "#1c140a", "light": "#fff5e0",
}
BASE = {k: lab_to_lch(hex_to_lab(v)) for k, v in NEUTRAL.items()}
WARM_HUE = BASE["paper"][2]

def mix(a, b):
    """Midpoint of two hex colours in OKLab: roughly where text sits on the gradient."""
    lab = (hex_to_lab(a) + hex_to_lab(b)) / 2
    rgb = linear_to_srgb(oklab_to_linear(lab))
    return "#" + "".join(f"{round(float(v) * 255):02x}" for v in rgb)

def grounds(p):
    return [p["paper"], p["paper-hi"], mix(p["paper"], p["paper-lo"])]

# tinted tables are never less legible than the default one (and text always clears WCAG AA)
TARGET = {k: max(4.5, min(contrast(NEUTRAL[k], g) for g in grounds(NEUTRAL))) for k in ("ink", "ink-soft", "muted")}

# ---------- palette extraction ----------

def kmeans(x, k, iters=30, seed=7):
    rng = np.random.default_rng(seed)
    centres = [x[rng.integers(len(x))]]
    for _ in range(k - 1):  # k-means++ seeding
        d = np.min(((x[:, None] - np.array(centres)[None]) ** 2).sum(-1), axis=1)
        centres.append(x[rng.choice(len(x), p=d / d.sum())])
    centres = np.array(centres)
    for _ in range(iters):
        labels = np.argmin(((x[:, None] - centres[None]) ** 2).sum(-1), axis=1)
        new = np.array([x[labels == i].mean(0) if np.any(labels == i) else centres[i] for i in range(k)])
        if np.allclose(new, centres, atol=1e-5):
            break
        centres = new
    counts = np.bincount(labels, minlength=k)
    return centres, counts / counts.sum()

def analyse(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((72, 96), Image.LANCZOS)
    px = np.asarray(im, dtype=np.float64).reshape(-1, 3) / 255
    lab = linear_to_oklab(srgb_to_linear(px))
    centres, share = kmeans(lab, 8)
    colours = []
    for c, p in zip(centres, share):
        L, C, h = lab_to_lch(c)
        # hue is unreliable in near-black and near-grey pixels; colour that covers more of the card matters more
        trust = np.clip((L - 0.12) / 0.25, 0, 1) * np.clip(C / 0.06, 0, 1)
        colours.append({"L": L, "C": C, "h": h, "share": float(p), "score": float(p ** 0.5 * trust * (0.4 + C * 6))})
    colours.sort(key=lambda c: -c["score"])
    primary = colours[0]
    secondary = next((c for c in colours[1:] if hue_gap(c["h"], primary["h"]) > 30 and c["score"] > primary["score"] * 0.25), None)
    mean_L = float(lab[:, 0].mean())
    return primary, secondary, mean_L

def solve_dark(L, C, h, against, target):
    """Darken a text colour until it reaches `target` contrast against every background in `against`."""
    while L > 0.05:
        hx = lch(L, C, h)
        if all(contrast(hx, bg) >= target for bg in against):
            return hx
        L -= 0.01
    return lch(L, C, h)

def palette(primary, secondary, mean_L):
    colourful = primary["C"] >= 0.025
    h = primary["h"] if colourful else WARM_HUE
    # enough tint to read as the card's colour, never so much the paper stops being paper
    C = float(np.clip(primary["C"] * 0.42, 0.014, 0.046)) if colourful else 0.008
    # brighter cards make a slightly brighter table, darker ones a slightly dimmer one
    L = BASE["paper"][0] + float(np.clip((mean_L - 0.35) * 0.08, -0.025, 0.02))

    h2, C2 = (secondary["h"], float(np.clip(secondary["C"] * 0.42, 0.012, 0.046))) if secondary and colourful else (h, C * 1.1)

    paper = lch(L, C, h)
    hi = lch(L + (BASE["paper-hi"][0] - BASE["paper"][0]), C * 0.7, h)
    lo = lch(L + (BASE["paper-lo"][0] - BASE["paper"][0]), C2, h2)
    on = grounds({"paper": paper, "paper-hi": hi, "paper-lo": lo})
    tint = min(C * 0.45, 0.02)
    return {
        "paper": paper, "paper-hi": hi, "paper-lo": lo,
        "ink": solve_dark(BASE["ink"][0], tint, h, on, TARGET["ink"]),
        "ink-soft": solve_dark(BASE["ink-soft"][0], tint, h, on, TARGET["ink-soft"]),
        "muted": solve_dark(BASE["muted"][0], min(C * 0.8, 0.035), h, on, TARGET["muted"]),
        "shade": lch(BASE["shade"][0], min(C * 1.2, 0.045), h),
        # the dappled light picks up the card's own brightest colour
        "light": lch(0.97, min(primary["C"] * 0.5, 0.06) if colourful else 0.025, h),
    }

def main():
    print("contrast floors:", {k: round(v, 2) for k, v in TARGET.items()})
    out = []
    for n in range(N_CARDS):
        src = IMAGES / f"{n:02d}.webp"
        if not src.exists():
            out.append(None)
            continue
        primary, secondary, mean_L = analyse(src)
        p = palette(primary, secondary, mean_L)
        out.append(p)
        sec = f"{secondary['h']:5.1f}°" if secondary else "  -   "
        print(f"{n:02d}  hue {primary['h']:5.1f}° C {primary['C']:.3f}  2nd {sec}  L̄ {mean_L:.2f}  ->  {p['paper']}  "
              f"ink {min(contrast(p['ink'], g) for g in grounds(p)):.1f}  muted {min(contrast(p['muted'], g) for g in grounds(p)):.1f}")
    OUT.write_text(json.dumps({"neutral": NEUTRAL, "cards": out}, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
