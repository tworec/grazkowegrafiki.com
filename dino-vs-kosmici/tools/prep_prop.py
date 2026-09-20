#!/usr/bin/env python3
"""Rekwizyty mapy: oryginal z assets-src/props -> gotowy PNG w assets/props.

Dla kazdego PNG z katalogu zrodlowego:
  1. czysci prawie-przezroczyste smieci (alfa < 8 -> 0),
  2. przycina do bbox kanalu alfa,
  3. skaluje tak, zeby dluzszy bok mial ~TARGET px (bez powiekszania),
  4. zapisuje z alfa i dopisuje wymiary do assets/props/props.json.

Uzycie:
    python3 tools/prep_prop.py                # przerabia wszystko
    python3 tools/prep_prop.py fruit nest     # tylko wybrane nazwy
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "props"
DST = ROOT / "assets" / "props"
MANIFEST = DST / "props.json"
TARGET = 256
ALPHA_FLOOR = 8


def prep(path: Path) -> tuple[int, int]:
    im = Image.open(path).convert("RGBA")
    alpha = im.getchannel("A").point(lambda v: 0 if v < ALPHA_FLOOR else v)
    im.putalpha(alpha)

    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit(f"{path.name}: obraz jest calkiem przezroczysty")
    im = im.crop(bbox)

    w, h = im.size
    longest = max(w, h)
    if longest > TARGET:
        scale = TARGET / longest
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                       Image.LANCZOS)

    DST.mkdir(parents=True, exist_ok=True)
    out = DST / path.name
    im.save(out)
    print(f"{path.name}: {w}x{h} -> {im.width}x{im.height}")
    return im.size


def main(names):
    files = sorted(SRC.glob("*.png"))
    if names:
        wanted = {n.removesuffix(".png") for n in names}
        files = [f for f in files if f.stem in wanted]
    if not files:
        raise SystemExit("nie ma czego przerabiac")

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    for f in files:
        w, h = prep(f)
        manifest[f.stem] = {"w": w, "h": h}

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"zapisano {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
