"""Make small thumbnails for the Spread view: images/NN.webp -> images/thumbs/NN.webp"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / "images"
out = root / "thumbs"
out.mkdir(exist_ok=True)
for src in [*sorted(root.glob("[0-9][0-9].webp")), root / "back.webp"]:  # back: face-down cards in Spread
    dst = out / src.name
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        continue
    im = Image.open(src).convert("RGB")
    im.thumbnail((360, 480), Image.LANCZOS)
    im.save(dst, "WEBP", quality=82, method=6)
    print("thumb", src.name)
