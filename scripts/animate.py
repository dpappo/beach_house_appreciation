# Turns screencast frames into the README's animated hero (an animated WebP).
#   python3 scripts/animate.py FRAMES_DIR OUT.webp [--fps 20] [--width 1120] [--quality 72]
# FRAMES_DIR holds 0000.jpg, 0001.jpg, … and times.json (seconds since the first frame),
# as written by scripts/screenshots.mjs. Frames arrive unevenly, so they're resampled to a
# steady frame rate by taking whichever frame was on screen at each tick.
import argparse, bisect, json, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("frames")
ap.add_argument("out")
ap.add_argument("--fps", type=float, default=20)
ap.add_argument("--width", type=int, default=1120)
ap.add_argument("--quality", type=int, default=72)
a = ap.parse_args()

times = json.load(open(os.path.join(a.frames, "times.json")))
ticks = int(times[-1] * a.fps)
frames = []
for i in range(ticks):
    k = max(0, bisect.bisect_right(times, i / a.fps) - 1)
    im = Image.open(os.path.join(a.frames, f"{k:04d}.jpg")).convert("RGB")
    if im.width != a.width:
        im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
    frames.append(im)

frames[0].save(a.out, save_all=True, append_images=frames[1:], duration=round(1000 / a.fps),
               loop=0, quality=a.quality, method=4)
print(f"  {os.path.relpath(a.out)} ({len(frames)} frames, {os.path.getsize(a.out) // 1024} KB)")
