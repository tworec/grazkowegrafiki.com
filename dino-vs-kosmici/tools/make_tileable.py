#!/usr/bin/env python3
"""Zamienia wygenerowany kwadrat w bezszwowy kafel 256x256 i mierzy szwy.

Metoda: skalujemy zrodlo do (N+o) px, potem liniowo przenikamy pas o
szerokosci o z przeciwleglej krawedzi. Piksel 0 wyniku to dokladnie piksel N
zrodla, a piksel N-1 to piksel N-1 zrodla - w zrodle sasiaduja ze soba, wiec
po zawinieciu kafla krawedzie lacza sie naturalnie.

Uzycie:
  make_tileable.py src.png out.png [--size 256] [--overlap 64]
  make_tileable.py --measure out.png            # sam pomiar
  make_tileable.py --preview out.png prev.png   # podglad 3x3
"""
import sys
from PIL import Image


def blend_seamless(im, size=256, overlap=64):
    src = im.convert('RGB').resize((size + overlap, size + overlap), Image.LANCZOS)
    sp = src.load()
    out = Image.new('RGB', (size, size))
    op = out.load()
    for y in range(size):
        for x in range(size):
            r, g, b = sp[x, y]
            wx = min(x, overlap) / overlap if overlap else 1.0
            wy = min(y, overlap) / overlap if overlap else 1.0
            # poziome przenikanie
            if wx < 1.0:
                r2, g2, b2 = sp[x + size, y]
                r = r * wx + r2 * (1 - wx)
                g = g * wx + g2 * (1 - wx)
                b = b * wx + b2 * (1 - wx)
            # pionowe przenikanie (na juz przenikniete poziomo tlo)
            if wy < 1.0:
                r3, g3, b3 = sp[x, y + size]
                if wx < 1.0:
                    r4, g4, b4 = sp[x + size, y + size]
                    r3 = r3 * wx + r4 * (1 - wx)
                    g3 = g3 * wx + g4 * (1 - wx)
                    b3 = b3 * wx + b4 * (1 - wx)
                r = r * wy + r3 * (1 - wy)
                g = g * wy + g3 * (1 - wy)
                b = b * wy + b3 * (1 - wy)
            op[x, y] = (int(r + 0.5), int(g + 0.5), int(b + 0.5))
    return out


def _col_diff(p, w, h, xa, xb):
    s = 0.0
    for y in range(h):
        a, b = p[xa, y], p[xb, y]
        s += abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
    return s / (h * 3)


def _row_diff(p, w, h, ya, yb):
    s = 0.0
    for x in range(w):
        a, b = p[x, ya], p[x, yb]
        s += abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
    return s / (w * 3)


def measure(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    p = im.load()
    seam_lr = _col_diff(p, w, h, 0, w - 1)
    seam_tb = _row_diff(p, w, h, 0, h - 1)
    # tlo odniesienia: srednia roznica sasiadujacych kolumn/wierszy w srodku
    ref_lr = sum(_col_diff(p, w, h, x, x + 1) for x in range(w // 4, 3 * w // 4)) / (w // 2)
    ref_tb = sum(_row_diff(p, w, h, y, y + 1) for y in range(h // 4, 3 * h // 4)) / (h // 2)
    return dict(seamLR=round(seam_lr, 2), seamTB=round(seam_tb, 2),
                refLR=round(ref_lr, 2), refTB=round(ref_tb, 2))


def preview(path, out, n=3):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    cv = Image.new('RGB', (w * n, h * n))
    for i in range(n):
        for j in range(n):
            cv.paste(im, (i * w, j * h))
    cv.save(out)
    return out


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == '--measure':
        for p in a[1:]:
            print(p, measure(p))
    elif a[0] == '--preview':
        print(preview(a[1], a[2]))
    else:
        size, overlap = 256, 64
        if '--size' in a:
            size = int(a[a.index('--size') + 1])
        if '--overlap' in a:
            overlap = int(a[a.index('--overlap') + 1])
        src, dst = a[0], a[1]
        blend_seamless(Image.open(src), size, overlap).save(dst)
        print(dst, measure(dst))
