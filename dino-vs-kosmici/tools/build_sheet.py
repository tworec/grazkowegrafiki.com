#!/usr/bin/env python3
"""
build_sheet.py — składa pojedyncze PNG z pozami (z ChatGPT) w poziomy arkusz
sprite'ów o stałej siatce klatek, taki jaki czyta gra (js/render/sprites.js).

Tryb budowania:
    build_sheet.py assets-src/tyranno --bands walk,attack,breath \
        --out assets/char-tyranno.png --meta assets/char-tyranno.json \
        --preview /tmp/tyranno-preview.png

Tryb cięcia (operacja odwrotna, do testów i poprawiania jednej klatki):
    build_sheet.py --split assets/char-tyranno.png --frame-w 233 --frame-h 188 \
        --bands walk:4,attack:3,breath:3 --out-dir /tmp/tyranno-frames

Zależności: Python 3 + Pillow (nic więcej).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import deque
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FRAME_RE = re.compile(r"^(?P<band>[a-z][a-z0-9_]*?)(?:[-_](?P<nr>\d+))?\.png$", re.I)


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def round_even(v: float) -> int:
    n = int(round(v))
    return n + (n % 2)


# ---------------------------------------------------------------------------
# Usuwanie tła
# ---------------------------------------------------------------------------

def _is_grayish(c, max_spread=20):
    return max(c) - min(c) <= max_spread


def _lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def _border_ring(img: Image.Image, width: int):
    """Zwraca listę obrazów pasków obwódki (góra, dół, lewo, prawo)."""
    w, h = img.size
    t = max(1, min(width, w // 2, h // 2))
    return [
        img.crop((0, 0, w, t)),
        img.crop((0, h - t, w, h)),
        img.crop((0, t, t, h - t)),
        img.crop((w - t, t, w, h - t)),
    ]


def _cluster_colors(pairs, merge_dist=10):
    """pairs: [(count, (r,g,b))] → posortowane klastry [(count, kolor)]."""
    pairs = sorted(pairs, key=lambda p: -p[0])
    clusters = []  # [count, color]
    for cnt, col in pairs:
        for cl in clusters:
            if max(abs(a - b) for a, b in zip(cl[1], col)) <= merge_dist:
                cl[0] += cnt
                break
        else:
            clusters.append([cnt, col])
    clusters.sort(key=lambda c: -c[0])
    return clusters


def detect_background(img: Image.Image):
    """
    Zwraca (rodzaj, kolory): rodzaj ∈ {"alpha", "checker", "solid", "unknown"}.
    Analizuje obwódkę obrazu: dwa jasne szare odcienie → szachownica,
    jeden dominujący kolor → tło jednolite.
    """
    w, h = img.size
    ring_w = max(3, min(w, h) // 40)
    if "A" in img.getbands():
        alpha_strips = _border_ring(img.getchannel("A"), ring_w)
        n = sum(s.size[0] * s.size[1] for s in alpha_strips)
        transparent = 0
        for s in alpha_strips:
            for cnt, v in s.getcolors(256) or []:
                if v < 128:
                    transparent += cnt
        if n and transparent / n > 0.5:
            return "alpha", []

    rgb = img.convert("RGB")
    strips = _border_ring(rgb, ring_w)
    total = 0
    pairs = []
    for s in strips:
        cols = s.getcolors(s.size[0] * s.size[1] + 1) or []
        pairs.extend(cols)
        total += s.size[0] * s.size[1]
    clusters = _cluster_colors(pairs)
    if not clusters or not total:
        return "unknown", []

    c1_cnt, c1 = clusters[0]
    if c1_cnt / total >= 0.9:
        return "solid", [c1]
    if len(clusters) >= 2:
        c2_cnt, c2 = clusters[1]
        if (
            (c1_cnt + c2_cnt) / total >= 0.8
            and _is_grayish(c1) and _is_grayish(c2)
            and _lum(c1) >= 120 and _lum(c2) >= 120
            and abs(_lum(c1) - _lum(c2)) >= 10
        ):
            return "checker", [c1, c2]
    if c1_cnt / total >= 0.5:
        return "solid", [c1]
    return "unknown", [c1]


def _distance_to_colors(rgb: Image.Image, colors) -> Image.Image:
    """Obraz L: dla każdego piksela min po kolorach tła z max po kanałach |c-b|."""
    dist = None
    for col in colors:
        diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, tuple(col)))
        r, g, b = diff.split()
        d = ImageChops.lighter(ImageChops.lighter(r, g), b)
        dist = d if dist is None else ImageChops.darker(dist, d)
    return dist


def _flood_from_edges(w: int, h: int, is_bg: bytes) -> bytearray:
    """Scanline flood-fill od krawędzi po pikselach tła. Zwraca maskę 0/1."""
    filled = bytearray(w * h)
    dq = deque()

    def seed(i):
        if is_bg[i] and not filled[i]:
            filled[i] = 1
            dq.append(i)

    for x in range(w):
        seed(x)
        seed((h - 1) * w + x)
    for y in range(h):
        seed(y * w)
        seed(y * w + w - 1)

    while dq:
        i = dq.popleft()
        y, x = divmod(i, w)
        # rozszerz w lewo/prawo
        x0 = x
        while x0 > 0 and is_bg[i - (x - x0) - 1] and not filled[i - (x - x0) - 1]:
            x0 -= 1
            filled[y * w + x0] = 1
        x1 = x
        while x1 < w - 1 and is_bg[y * w + x1 + 1] and not filled[y * w + x1 + 1]:
            x1 += 1
            filled[y * w + x1] = 1
        # zasiej wiersze nad i pod
        for yy in (y - 1, y + 1):
            if 0 <= yy < h:
                base = yy * w
                for xx in range(x0, x1 + 1):
                    j = base + xx
                    if is_bg[j] and not filled[j]:
                        filled[j] = 1
                        dq.append(j)
    return filled


def remove_background(img: Image.Image, mode: str, tol: int, feather: int):
    """Zwraca (RGBA, opis). mode: auto|none|checker|solid."""
    img = img.convert("RGBA")
    if mode == "none":
        return img, "bez zmian"
    kind, colors = detect_background(img)
    if mode == "auto":
        if kind == "alpha":
            return img, "ma już alfę"
        if kind == "unknown":
            log("  ! nie rozpoznano tła — zostawiam bez zmian (wymuś --remove-bg solid|checker)")
            return img, "nie rozpoznano"
    else:
        if kind == "alpha":
            kind = mode
            colors = colors or []
        if mode == "solid" and (kind != "solid" or not colors):
            # weź najczęstszy kolor obwódki
            kind = "solid"
            colors = colors[:1] if colors else [img.convert("RGB").getpixel((0, 0))]
        if mode == "checker" and kind != "checker":
            log("  ! wymuszono checker, ale wykryto %s — używam kolorów obwódki" % kind)
            kind = "checker"
    if not colors:
        return img, "brak kolorów tła"

    w, h = img.size
    rgb = img.convert("RGB")
    dist = _distance_to_colors(rgb, colors)
    is_bg_img = dist.point(lambda v: 255 if v <= tol else 0)
    is_bg = is_bg_img.tobytes()
    filled = _flood_from_edges(w, h, is_bg)
    filled_img = Image.frombytes("L", (w, h), bytes(filled)).point(lambda v: 255 if v else 0)

    alpha = img.getchannel("A")
    alpha = ImageChops.subtract(alpha, filled_img)  # tło → 0

    if feather > 0:
        # 1-px obwódka postaci stykająca się z usuniętym tłem: alfa z odległości
        # koloru od tła i odbielenie koloru (un-premultiply).
        ring = ImageChops.subtract(filled_img.filter(ImageFilter.MaxFilter(3)), filled_img)
        ring_px = ring.load()
        dist_px = dist.load()
        px = img.load()
        alpha_px = alpha.load()
        bg = colors[0]
        for y in range(h):
            for x in range(w):
                if not ring_px[x, y]:
                    continue
                d = dist_px[x, y]
                a = min(255, d * 255 // feather)
                if a <= 0:
                    alpha_px[x, y] = 0
                    continue
                r, g, b, _ = px[x, y]
                # który kolor tła bliżej
                if len(colors) > 1:
                    bg = min(colors, key=lambda c: max(abs(r - c[0]), abs(g - c[1]), abs(b - c[2])))
                af = a / 255.0
                nr = int(max(0, min(255, (r - (1 - af) * bg[0]) / af)))
                ng = int(max(0, min(255, (g - (1 - af) * bg[1]) / af)))
                nb = int(max(0, min(255, (b - (1 - af) * bg[2]) / af)))
                px[x, y] = (nr, ng, nb, 255)
                alpha_px[x, y] = min(alpha_px[x, y], a)

    img.putalpha(alpha)
    desc = "%s %s" % (kind, ",".join("#%02x%02x%02x" % tuple(c) for c in colors))
    return img, desc


# ---------------------------------------------------------------------------
# Normalizacja i składanie
# ---------------------------------------------------------------------------

def alpha_bbox(img: Image.Image, thresh: int):
    mask = img.getchannel("A").point(lambda v: 255 if v > thresh else 0)
    return mask.getbbox()


def mass_center_x(img: Image.Image) -> float:
    a = img.getchannel("A")
    w, h = a.size
    col = a.resize((w, 1), Image.BOX).tobytes()  # średnia alfa w kolumnie
    tot = sum(col)
    if tot == 0:
        return w / 2.0
    return sum(i * v for i, v in enumerate(col)) / tot + 0.5


def parse_band_order(spec: str | None):
    if not spec:
        return None
    return [s.strip() for s in spec.split(",") if s.strip()]


def collect_frames(src: Path, band_order):
    """Zwraca listę (band, nr, path) w kolejności arkusza."""
    found: dict[str, list[tuple[int, Path]]] = {}
    for p in sorted(src.iterdir()):
        if not p.is_file():
            continue
        m = FRAME_RE.match(p.name)
        if not m:
            if p.suffix.lower() == ".png":
                log("  pomijam %s (nazwa nie pasuje do <pasmo>-<nr>.png)" % p.name)
            continue
        band = m.group("band").lower()
        nr = int(m.group("nr")) if m.group("nr") else 0
        found.setdefault(band, []).append((nr, p))
    if not found:
        sys.exit("brak plików <pasmo>-<nr>.png w %s" % src)
    if band_order is None:
        band_order = sorted(found)
    else:
        missing = [b for b in band_order if b not in found]
        if missing:
            sys.exit("brak klatek dla pasm: %s (mam: %s)" % (", ".join(missing), ", ".join(sorted(found))))
        skipped = [b for b in found if b not in band_order]
        if skipped:
            log("  pomijam pasma spoza --bands: %s" % ", ".join(skipped))
    frames = []
    for band in band_order:
        for nr, p in sorted(found[band]):
            frames.append((band, nr, p))
    return frames, band_order


def build(args):
    src = Path(args.src)
    if not src.is_dir():
        sys.exit("%s nie jest katalogiem" % src)
    frames, band_order = collect_frames(src, parse_band_order(args.bands))
    log("klatki: %d, pasma: %s" % (len(frames), ", ".join(band_order)))

    # 1. tło + przycięcie
    cropped = []
    for band, nr, p in frames:
        img = Image.open(p)
        img, desc = remove_background(img, args.remove_bg, args.tolerance, args.feather)
        bb = alpha_bbox(img, args.alpha_threshold)
        if bb is None:
            sys.exit("%s: klatka pusta po usunięciu tła" % p.name)
        img = img.crop(bb)
        log("  %-20s %4dx%-4d tło: %s → bbox %dx%d" % (p.name, *Image.open(p).size, desc, *img.size))
        cropped.append(img)

    # 2. jednolita skala po medianie wysokości
    heights = [im.size[1] for im in cropped]
    med_h = median(heights)
    scale = 1.0 if args.no_scale else args.height / med_h
    if abs(scale - 1.0) > 1e-6:
        scaled = []
        for im in cropped:
            w, h = im.size
            nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
            im = im.resize((nw, nh), Image.LANCZOS)
            bb = alpha_bbox(im, args.alpha_threshold)
            scaled.append(im.crop(bb) if bb else im)
        cropped = scaled
    log("mediana wysokości: %g px, skala: %.4f" % (med_h, scale))

    # 3. rozmiar klatki
    max_w = max(im.size[0] for im in cropped)
    max_h = max(im.size[1] for im in cropped)
    m = args.margin
    frame_w = args.frame_w or round_even(max_w + 2 * m)
    frame_h = args.frame_h or round_even(max_h + 2 * m)
    foot_y = frame_h - m  # rząd, w którym leży linia stóp (pierwszy przezroczysty pod stopami)
    if max_w > frame_w or max_h > foot_y:
        log("  ! klatka %dx%d za mała dla największej pozy %dx%d (linia stóp %d) — klatki będą przycięte"
            % (frame_w, frame_h, max_w, max_h, foot_y))
    elif max_w + 2 * m > frame_w or max_h + 2 * m > frame_h:
        log("  ~ klatka %dx%d ciasna dla największej pozy %dx%d: margines %d px nie wszędzie zachowany"
            % (frame_w, frame_h, max_w, max_h, m))

    # 4. składanie
    sheet = Image.new("RGBA", (frame_w * len(cropped), frame_h), (0, 0, 0, 0))
    placements = []
    for i, im in enumerate(cropped):
        w, h = im.size
        if args.anchor == "mass":
            cx = mass_center_x(im)
        else:
            cx = w / 2.0
        x = int(round(frame_w / 2.0 - cx))
        y = foot_y - h
        cell = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
        cell.alpha_composite(im, dest=(max(0, x), max(0, y)), source=(max(0, -x), max(0, -y)))
        sheet.alpha_composite(cell, (i * frame_w, 0))
        placements.append((x, y, w, h))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)
    log("zapisano %s (%dx%d, %d klatek %dx%d)" % (out, *sheet.size, len(cropped), frame_w, frame_h))

    # 5. meta
    bands = {}
    idx = 0
    for band in band_order:
        count = sum(1 for b, _, _ in frames if b == band)
        bands[band] = {"start": idx, "count": count}
        idx += count
    name = args.name or re.sub(r"[^a-z0-9]+", "_", out.stem.replace("char-", "")).strip("_").upper() + "_ANIM"
    js_lines = ["export const %s = {" % name, "  frameW: %d, frameH: %d," % (frame_w, frame_h)]
    width = max(len(b) for b in bands)
    for j, (band, bd) in enumerate(bands.items()):
        js_lines.append("  %s { start: %2d, count: %d }%s"
                        % ((band + ":").ljust(width + 1), bd["start"], bd["count"], "," if j < len(bands) - 1 else ""))
    js_lines.append("};")
    js = "\n".join(js_lines)
    meta = {
        "frameW": frame_w,
        "frameH": frame_h,
        "frames": len(cropped),
        "bands": bands,
        "source": [str(p.relative_to(src)) for _, _, p in frames],
        "srcDir": str(src),
        "scale": round(scale, 5),
        "medianHeight": med_h,
        "margin": m,
        "footY": foot_y,
        "anchor": args.anchor,
        "js": js,
    }
    if args.meta:
        Path(args.meta).write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        log("zapisano %s" % args.meta)
    print(js)

    # 6. podgląd
    if args.preview:
        make_preview(sheet, frame_w, frame_h, frames, foot_y, Path(args.preview), args.preview_cols)
    return sheet, meta


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # stare Pillow
        return ImageFont.load_default()


def make_preview(sheet, frame_w, frame_h, frames, foot_y, path: Path, cols: int):
    n = sheet.size[0] // frame_w
    cols = max(1, min(cols, n))
    rows = (n + cols - 1) // cols
    label_h = 22
    pad = 6
    cell_w, cell_h = frame_w + pad, frame_h + label_h + pad
    W, H = cols * cell_w + pad, rows * cell_h + pad
    pv = Image.new("RGBA", (W, H), (38, 38, 42, 255))
    draw = ImageDraw.Draw(pv)
    font = _font(14)
    for i in range(n):
        r, c = divmod(i, cols)
        x0, y0 = pad + c * cell_w, pad + r * cell_h
        fx, fy = x0, y0 + label_h
        draw.rectangle((fx - 1, fy - 1, fx + frame_w, fy + frame_h), outline=(90, 90, 100, 255))
        # siatka pomocnicza: oś środkowa
        draw.line((fx + frame_w // 2, fy, fx + frame_w // 2, fy + frame_h), fill=(60, 60, 70, 255))
        pv.alpha_composite(sheet.crop((i * frame_w, 0, (i + 1) * frame_w, frame_h)), (fx, fy))
        draw.line((fx, fy + foot_y, fx + frame_w, fy + foot_y), fill=(230, 60, 60, 255))
        label = "%d" % i
        if i < len(frames):
            label += "  %s-%d" % (frames[i][0], frames[i][1])
        draw.text((x0 + 2, y0 + 3), label, fill=(240, 240, 240, 255), font=font)
    path.parent.mkdir(parents=True, exist_ok=True)
    pv.convert("RGB").save(path)
    log("zapisano podgląd %s" % path)


# ---------------------------------------------------------------------------
# Cięcie
# ---------------------------------------------------------------------------

def parse_split_bands(spec: str | None):
    """'walk:4,attack:3' → [(walk,4),(attack,3)]."""
    if not spec:
        return None
    out = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            sys.exit("--bands w trybie --split wymaga postaci nazwa:liczba (np. walk:4,attack:3)")
        name, cnt = part.split(":", 1)
        out.append((name.strip(), int(cnt)))
    return out


def split(args):
    sheet = Image.open(args.split).convert("RGBA")
    fw, fh = args.frame_w, args.frame_h
    bands = parse_split_bands(args.bands)
    if args.meta and Path(args.meta).exists():
        meta = json.loads(Path(args.meta).read_text(encoding="utf-8"))
        fw = fw or meta.get("frameW")
        fh = fh or meta.get("frameH")
        if bands is None and "bands" in meta:
            bands = [(b, v["count"]) for b, v in sorted(meta["bands"].items(), key=lambda kv: kv[1]["start"])]
    if not fw or not fh:
        sys.exit("--split wymaga --frame-w i --frame-h (albo --meta z frameW/frameH)")
    W, H = sheet.size
    cols, rows = W // fw, H // fh
    if W % fw or H % fh:
        log("  ! arkusz %dx%d nie dzieli się równo przez %dx%d — ogon pomijam" % (W, H, fw, fh))
    n = cols * rows
    names = []
    if bands:
        for band, cnt in bands:
            names.extend("%s-%d.png" % (band, k + 1) for k in range(cnt))
        if len(names) != n:
            log("  ! pasma opisują %d klatek, arkusz ma %d" % (len(names), n))
    while len(names) < n:
        names.append("frame-%d.png" % (len(names) + 1))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        r, c = divmod(i, cols)
        fr = sheet.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
        fr.save(out_dir / names[i])
    log("pocięto %s → %d klatek %dx%d w %s" % (args.split, n, fw, fh, out_dir))


# ---------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Składa PNG z pozami w arkusz sprite'ów (albo tnie arkusz na klatki).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Zależności")[0],
    )
    ap.add_argument("src", nargs="?", help="katalog z PNG pozami <pasmo>-<nr>.png")
    ap.add_argument("--bands", help="kolejność pasm, np. idle,walk,attack (build) "
                                    "lub nazwa:liczba, np. walk:4,attack:3 (split)")
    ap.add_argument("--out", help="wyjściowy arkusz PNG")
    ap.add_argument("--meta", help="JSON z frameW/frameH/bands (zapis w build, odczyt w split)")
    ap.add_argument("--preview", help="arkusz kontaktowy PNG do oceny wzrokiem")
    ap.add_argument("--preview-cols", type=int, default=6, help="kolumn w podglądzie (domyślnie 6)")
    ap.add_argument("--name", help="nazwa stałej JS w meta/stdout (domyślnie z nazwy pliku, np. TYRANNO_ANIM)")
    ap.add_argument("--remove-bg", choices=["auto", "none", "checker", "solid"], default="auto",
                    help="usuwanie tła (domyślnie auto)")
    ap.add_argument("--tolerance", type=int, default=28,
                    help="tolerancja koloru tła (max różnica kanału, domyślnie 28)")
    ap.add_argument("--feather", type=int, default=140,
                    help="odległość koloru dająca pełną alfę na 1-px obwódce postaci; 0 wyłącza (domyślnie 140)")
    ap.add_argument("--alpha-threshold", type=int, default=16, help="próg alfy dla bbox (domyślnie 16)")
    ap.add_argument("--anchor", choices=["bbox", "mass"], default="bbox",
                    help="wyśrodkowanie poziome: środek bbox albo środek masy alfy")
    ap.add_argument("--height", type=int, default=168,
                    help="docelowa mediana wysokości bbox po skali (domyślnie 168)")
    ap.add_argument("--no-scale", action="store_true", help="nie skaluj klatek")
    ap.add_argument("--margin", type=int, default=8, help="margines wokół klatki w px (domyślnie 8)")
    ap.add_argument("--frame-w", type=int, help="wymuś szerokość klatki (build) / szerokość klatki (split)")
    ap.add_argument("--frame-h", type=int, help="wymuś wysokość klatki (build) / wysokość klatki (split)")
    ap.add_argument("--split", metavar="SHEET", help="tryb odwrotny: potnij arkusz na PNG")
    ap.add_argument("--out-dir", help="katalog na klatki w trybie --split")
    args = ap.parse_args(argv)

    if args.split:
        if not args.out_dir:
            ap.error("--split wymaga --out-dir")
        split(args)
        return
    if not args.src:
        ap.error("podaj katalog z pozami albo --split SHEET")
    if not args.out:
        ap.error("podaj --out sheet.png")
    build(args)


if __name__ == "__main__":
    main()
