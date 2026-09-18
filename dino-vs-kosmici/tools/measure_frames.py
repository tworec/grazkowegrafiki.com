#!/usr/bin/env python3
"""Pomiar klatek chodu: pozycje stop, liczba nog, roznica pikselowa."""
import sys, itertools
from PIL import Image, ImageChops


def load(p):
    im = Image.open(p).convert('RGBA')
    bb = im.getchannel('A').getbbox()
    return im.crop(bb)


def norm(p, size=(320, 320)):
    im = load(p)
    r = im.copy()
    r.thumbnail(size, Image.LANCZOS)
    o = Image.new('RGBA', size, (0, 0, 0, 0))
    o.paste(r, ((size[0] - r.size[0]) // 2, size[1] - r.size[1]))
    return o


def runs_at(im, frac_lo, frac_hi, min_frac=0.03):
    """Plamy nieprzezroczystosci w poziomym pasie [frac_lo, frac_hi] wysokosci."""
    a = im.getchannel('A')
    w, h = im.size
    band = a.crop((0, int(h * frac_lo), w, max(int(h * frac_hi), int(h * frac_lo) + 1)))
    # kolumna jest "pelna" jesli ktorykolwiek piksel w pasie jest nieprzezroczysty
    px = band.load()
    bw, bh = band.size
    data = [1 if any(px[x, y] > 40 for y in range(bh)) else 0 for x in range(bw)]
    out = []
    start = None
    for x, v in enumerate(data + [0]):
        if v and start is None:
            start = x
        elif not v and start is not None:
            if x - start > w * min_frac:
                out.append((round(start / w * 100), round(x / w * 100)))
            start = None
    return out


def feet(p):
    return runs_at(load(p), 0.94, 1.0)


def legs(p):
    return runs_at(load(p), 0.72, 0.80)


def diff(a, b):
    ia, ib = norm(a), norm(b)
    d = ImageChops.difference(ia.convert('RGB'), ib.convert('RGB'))
    hist = d.convert('L').histogram()
    tot = sum(hist)
    return sum(i * n for i, n in enumerate(hist)) / tot


def main(paths):
    print(f"{'plik':<28} {'stopy (%)':<34} {'nogi@76% (%)'}")
    for p in paths:
        import os
        print(f"{os.path.basename(p):<28} {str(feet(p)):<34} {legs(p)}")
    print()
    for a, b in itertools.combinations(paths, 2):
        import os
        print(f"diff {os.path.basename(a):<16} vs {os.path.basename(b):<16} = {diff(a,b):.1f}")


if __name__ == '__main__':
    main(sys.argv[1:])
