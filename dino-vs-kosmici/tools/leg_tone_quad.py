#!/usr/bin/env python3
"""leg_tone dla czworonogow: osobno para przednia i para tylna.

leg_tone.py dzieli obszar nog na pol i porownuje jasnosc lewej i prawej polowy.
U dwunoga to dokladnie test "ktora noga jest blizej widza". U czworonoga lewa
polowa to para TYLNA, a prawa para PRZEDNIA - kazda z nich zawiera jedna noge
jasna (blizsza) i jedna ciemna (dalsza), wiec roznica sie znosi i wynik jest
bliski zera niezaleznie od pozy.

Ten skrypt najpierw dzieli obszar nog na pare tylna i przednia, a dopiero potem
w kazdej parze porownuje jasnosc nogi cofnietej i wysunietej. Dwie klatki
kontaktu tego samego cyklu musza miec roznice o PRZECIWNYCH znakach w obu parach.
"""
import sys, os
from PIL import Image


def halves(im, x0, x1, y0, y1):
    """Srednia jasnosc pikseli w [x0,x1) podzielona na lewa i prawa polowe."""
    px = im.load()
    xs = [x for x in range(x0, x1) for y in range(y0, y1) if px[x, y][3] > 40]
    if not xs:
        return None
    mid = (min(xs) + max(xs)) // 2
    out = []
    for lo, hi in ((min(xs), mid), (mid, max(xs) + 1)):
        vals = [0.299 * px[x, y][0] + 0.587 * px[x, y][1] + 0.114 * px[x, y][2]
                for x in range(lo, hi) for y in range(y0, y1) if px[x, y][3] > 200]
        out.append(sum(vals) / len(vals) if vals else 0.0)
    return out


def main(paths):
    print(f"{'plik':<16} {'para TYLNA':>26}   {'para PRZEDNIA':>26}")
    for p in paths:
        im = Image.open(p).convert("RGBA")
        im = im.crop(im.getchannel("A").getbbox())
        w, h = im.size
        y0, y1 = int(h * 0.80), h
        px = im.load()
        xs = [x for x in range(w) for y in range(y0, y1) if px[x, y][3] > 40]
        split = (min(xs) + max(xs)) // 2          # granica para tylna | przednia
        back = halves(im, min(xs), split, y0, y1)
        front = halves(im, split, max(xs) + 1, y0, y1)
        def fmt(t):
            return f"cofn={t[0]:6.1f} wys={t[1]:6.1f} d={t[1]-t[0]:+6.1f}" if t else " brak"
        print(f"{os.path.basename(p):<16} {fmt(back)}   {fmt(front)}")


if __name__ == "__main__":
    main(sys.argv[1:])
