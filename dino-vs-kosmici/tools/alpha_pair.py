#!/usr/bin/env python3
"""Odzyskuje alfe z pary zrzutow: ten sam obrazek na bialym i na czarnym tle.

Dla tla B i koloru C z alfa a obserwujemy O = C*a + B*(1-a), wiec
  a = 1 - (Ow - Ob)/255,  C = Ob / a.
Wynik przycinamy do bboxu alfy i skalujemy do najdluzszego boku --max.

Uzycie: alpha_pair.py white.png black.png out.png [--max 256]
"""
import sys
from PIL import Image


def recover(white_path, black_path, out_path, mx=256):
    w_im = Image.open(white_path).convert('RGB')
    b_im = Image.open(black_path).convert('RGB')
    if w_im.size != b_im.size:
        raise SystemExit('rozne rozmiary zrzutow: %s vs %s' % (w_im.size, b_im.size))
    W, H = w_im.size
    wp, bp = w_im.load(), b_im.load()
    out = Image.new('RGBA', (W, H))
    op = out.load()
    for y in range(H):
        for x in range(W):
            ow, ob = wp[x, y], bp[x, y]
            d = (ow[0] - ob[0] + ow[1] - ob[1] + ow[2] - ob[2]) / 3.0
            a = 1.0 - d / 255.0
            if a <= 0.02:
                op[x, y] = (0, 0, 0, 0)
                continue
            a = min(1.0, a)
            c = tuple(min(255, max(0, int(ob[i] / a + 0.5))) for i in range(3))
            op[x, y] = (c[0], c[1], c[2], int(a * 255 + 0.5))
    bbox = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    w, h = out.size
    if mx > 0:
        s = mx / max(w, h)
        out = out.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    out.save(out_path)
    return out.size


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    mx = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 256
    print(recover(a[0], a[1], a[2], mx))
