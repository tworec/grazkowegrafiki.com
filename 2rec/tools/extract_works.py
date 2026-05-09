#!/usr/bin/env python3
"""Generate 2rec/data/works.json from root-level gallery HTML pages.

Parses 5 gallery pages + gra-owoce-ducha.html for <img> tags pointing
to assets/, deduplicates, and emits a JSON list with thumb/full URLs
relative to 2rec/index.html (i.e. prefixed with ../).

Usage: python3 2rec/tools/extract_works.py
"""
from __future__ import annotations
import json
import re
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ASSETS_DIR = REPO_ROOT / "assets"
OUT_FILE = REPO_ROOT / "2rec" / "data" / "works.json"

# (filename in repo root, target category slug)
SOURCES = [
    ("portrety-komiksowe.html",                  "komiksowe"),
    ("portrety-kreskowkowe.html",                "kreskowkowe"),
    ("portrety-w-praktyce.html",                 "akwarelove"),
    ("portrety-w-praktyce-1.html",               "gadzety"),
    ("zaproszenia-i-kartki-okolicznosciowe.html","zaproszenia"),
    ("gra-owoce-ducha.html",                     "gry"),
]

SIZE_RE = re.compile(r"_(?:rwc_)?(\d+)\.(png|jpe?g)$", re.I)
ORIG_RE = re.compile(r"_orig\.(png|jpe?g)$", re.I)


def slug(filename: str) -> str:
    """Strip path + size suffix to get a stable per-work id."""
    name = filename.split("/")[-1]
    name = SIZE_RE.sub("", name)
    name = ORIG_RE.sub("", name)
    name = re.sub(r"\.(png|jpe?g)$", "", name, flags=re.I)
    return name


def variant_size(filename: str) -> int:
    m = SIZE_RE.search(filename)
    return int(m.group(1)) if m else 0


class ImgCollector(HTMLParser):
    """Collect (src, alt) pairs from <img> tags whose src points to assets/."""
    def __init__(self):
        super().__init__()
        self.images: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        d = dict(attrs)
        src = d.get("data-src") or d.get("src") or ""
        if not src.startswith("assets/"):
            return
        alt = d.get("alt", "")
        self.images.append((src, alt))


def collect_assets_by_slug() -> dict[str, list[str]]:
    """Map slug -> list of all variant filenames in assets/."""
    by_slug: dict[str, list[str]] = {}
    for f in ASSETS_DIR.iterdir():
        if not f.is_file():
            continue
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        by_slug.setdefault(slug(f.name), []).append(f.name)
    return by_slug


def pick_thumb_full(variants: list[str]) -> tuple[str, str]:
    """Return (thumb_filename, full_filename). Smallest variant for thumb,
    largest for full. If only one variant exists, both are the same."""
    sized = sorted(variants, key=variant_size)
    return sized[0], sized[-1]


def title_from_slug(s: str) -> str:
    return s.replace("-", " ").capitalize()


def main():
    by_slug = collect_assets_by_slug()
    works = []
    seen: set[str] = set()

    for filename, category in SOURCES:
        path = REPO_ROOT / filename
        html = path.read_text(encoding="utf-8")
        collector = ImgCollector()
        collector.feed(html)
        for src, alt in collector.images:
            s = slug(src)
            if s in seen:
                continue
            seen.add(s)
            variants = by_slug.get(s)
            if not variants:
                continue
            thumb, full = pick_thumb_full(variants)
            works.append({
                "id": s,
                "category": category,
                "title": alt.strip() or title_from_slug(s),
                "thumb": f"../assets/{thumb}",
                "full":  f"../assets/{full}",
                "alt":   alt.strip() or title_from_slug(s),
            })

    # Special case: consolidate Owoce Ducha into one work with description + moreUrl.
    gry = [w for w in works if w["category"] == "gry"]
    if gry:
        first = gry[0]
        first["id"] = "owoce-ducha"
        first["title"] = "Owoce Ducha"
        first["alt"] = "Gra Owoce Ducha — Wydawnictwo Kościuszko"
        first["description"] = (
            "Gra wydana przez Wydawnictwo Kościuszko. "
            "To była dopiero frajda — współtworzyć grę!"
        )
        first["gallery"] = [w["full"] for w in gry[1:]]
        first["moreUrl"] = "../gra-owoce-ducha.html"
        works = [w for w in works if w["category"] != "gry" or w is first]

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(
        json.dumps(works, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(works)} works to {OUT_FILE.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
