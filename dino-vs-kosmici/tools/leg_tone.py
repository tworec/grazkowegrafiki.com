#!/usr/bin/env python3
"""Srednia jasnosc lewej (tylnej) i prawej (przedniej) nogi ponizej 80% wysokosci."""
import sys, os
from PIL import Image


def tone(p):
    im = Image.open(p).convert('RGBA')
    im = im.crop(im.getchannel('A').getbbox())
    w, h = im.size
    leg = im.crop((0, int(h * 0.80), w, h))
    px = leg.load()
    lw, lh = leg.size
    # podzial w polowie szerokosci obszaru zajetego przez nogi
    xs = [x for x in range(lw) for y in range(lh) if px[x, y][3] > 40]
    if not xs:
        return None
    mid = (min(xs) + max(xs)) // 2
    res = []
    for lo, hi in ((min(xs), mid), (mid, max(xs) + 1)):
        vals = []
        for x in range(lo, hi):
            for y in range(lh):
                r, g, b, a = px[x, y]
                if a > 200:
                    vals.append(0.299 * r + 0.587 * g + 0.114 * b)
        res.append(sum(vals) / len(vals) if vals else 0)
    return res


for p in sys.argv[1:]:
    t = tone(p)
    print(f"{os.path.basename(p):<14} tylna(lewa)={t[0]:6.1f}  przednia(prawa)={t[1]:6.1f}  "
          f"roznica={t[1]-t[0]:+6.1f}")
