#!/usr/bin/env python3
"""Przygotowuje pojedynczy obiekt scenografii: odzyskuje alfe (jesli trzeba),
przycina do bboxu alfy i skaluje tak, by najdluzszy bok mial ~256 px.

Uzycie:
  prep_scenery.py src.png out.png [--flood] [--max 256] [--tol 28]

--flood: tlo jest nieprzezroczyste (np. odzyskane ze zrzutu ekranu) - usuwamy je
flood-fillem od krawedzi, z tolerancja --tol.
"""
import sys
from collections import deque
from PIL import Image


def flood_alpha(im, tol=28):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    # kolor tla = mediana narozników
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        r, g, b, a = px[x, y]
        if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > tol * 3:
            continue
        seen[i] = 1
        px[x, y] = (r, g, b, 0)
        q.append((x + 1, y)); q.append((x - 1, y))
        q.append((x, y + 1)); q.append((x, y - 1))
    return im


def prep(src, dst, flood=False, mx=256, tol=28):
    im = Image.open(src).convert('RGBA')
    if flood or im.getchannel('A').getextrema()[0] == 255:
        im = flood_alpha(im, tol)
    bbox = im.getchannel('A').getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    s = mx / max(w, h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    im.save(dst)
    return im.size


if __name__ == '__main__':
    a = sys.argv[1:]
    flood = '--flood' in a
    mx = int(a[a.index('--max') + 1]) if '--max' in a else 256
    tol = int(a[a.index('--tol') + 1]) if '--tol' in a else 28
    pos = [x for x in a if not x.startswith('--') and not x.isdigit()]
    print(prep(pos[0], pos[1], flood, mx, tol))
