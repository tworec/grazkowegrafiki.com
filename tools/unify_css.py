#!/usr/bin/env python3
"""Unify dist/css/main.css + all assets/theme-*.css into a single main.css.

- Deduplicates identical top-level CSS blocks (rules / @media at-rules /
  @keyframes etc.) preserving first-seen order.
- Backs up original theme-*.css to assets/_themes_backup/ then removes them.
- Strips <link href="assets/theme-*.css"> tags from every *.html.
- Preserves the trailing /* grazka-social-module-v4 */ override block at the
  very end of main.css so its cascade priority is unchanged.
"""
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS_DIR = ROOT / "dist" / "css"
ASSETS = ROOT / "assets"
BACKUP = ASSETS / "_themes_backup"
MAIN_CSS = CSS_DIR / "main.css"
MARKER = "/* grazka-social-module-v4 */"


def strip_trailing_marker(css):
    """Cut everything from MARKER to EOF off the front and return both halves."""
    idx = css.find(MARKER)
    if idx < 0:
        return css, ""
    return css[:idx].rstrip() + "\n", css[idx:].strip()


def split_blocks(css):
    """Yield top-level CSS blocks (text from selector through matching `}`)."""
    i, n = 0, len(css)
    while i < n:
        while i < n and css[i].isspace():
            i += 1
        if i >= n:
            return
        if css[i:i + 2] == "/*":
            end = css.find("*/", i + 2)
            if end < 0:
                return
            i = end + 2
            continue
        block_start = i
        brace = css.find("{", i)
        if brace < 0:
            return
        depth, j = 1, brace + 1
        while j < n and depth > 0:
            two = css[j:j + 2]
            if two == "/*":
                end = css.find("*/", j + 2)
                if end < 0:
                    return
                j = end + 2
                continue
            c = css[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            j += 1
        yield css[block_start:j].strip()
        i = j


def main():
    if not MAIN_CSS.exists():
        raise SystemExit(f"missing {MAIN_CSS}")

    themes = sorted(ASSETS.glob("theme-*.css"))
    if not themes:
        print("no theme-*.css to unify (already done?)")
        return

    BACKUP.mkdir(exist_ok=True)
    for f in themes:
        shutil.copy2(f, BACKUP / f.name)

    main_base, marker_block = strip_trailing_marker(MAIN_CSS.read_text())

    seen = set()

    def collect(css):
        out = []
        for b in split_blocks(css):
            key = re.sub(r"\s+", " ", b).strip()
            if key in seen:
                continue
            seen.add(key)
            out.append(b)
        return out

    parts = ["/* === main.css base === */"]
    parts += collect(main_base)
    for f in themes:
        parts.append(f"/* === {f.name} === */")
        parts += collect(f.read_text())
    if marker_block:
        parts.append(marker_block)

    unified = "\n\n".join(parts) + "\n"
    MAIN_CSS.write_text(unified)

    link_pat = re.compile(
        r'\s*<link[^>]*href="assets/theme-[^"]+\.css"[^>]*>\s*\n?'
    )
    htmls_touched = 0
    for html in sorted(ROOT.glob("*.html")):
        s = html.read_text()
        new = link_pat.sub("\n", s)
        if new != s:
            html.write_text(new)
            htmls_touched += 1

    for f in themes:
        f.unlink()

    base_lines = MAIN_CSS.read_text().count("\n")
    orig_total = sum((BACKUP / f.name).read_text().count("\n") for f in themes) \
        + main_base.count("\n")
    print(f"unified {len(themes)} themes + main.css")
    print(f"  source lines (sum): {orig_total}")
    print(f"  unified lines: {base_lines}")
    print(f"  HTML <link> tags removed in {htmls_touched} files")
    print(f"  backup: {BACKUP.relative_to(ROOT)}")


def revert():
    """Restore theme-*.css from backup and re-link them in every HTML.

    Also strips the unified theme blocks from dist/css/main.css, leaving only
    the original main.css base + the trailing marker block intact.
    """
    if not BACKUP.exists():
        raise SystemExit(f"no backup at {BACKUP}")

    restored = []
    for f in sorted(BACKUP.glob("theme-*.css")):
        target = ASSETS / f.name
        shutil.copy2(f, target)
        restored.append(target.name)

    css = MAIN_CSS.read_text()
    base_end = css.find("/* === theme-")
    if base_end < 0:
        base_end = css.find("/* === main.css base ===")
    head = ""
    if base_end >= 0:
        head = css[:base_end].rstrip()
        head = head.replace("/* === main.css base === */", "").strip() + "\n"
    else:
        head = css
    _, marker_block = strip_trailing_marker(css)
    if marker_block:
        MAIN_CSS.write_text(head.rstrip() + "\n\n" + marker_block + "\n")
    else:
        MAIN_CSS.write_text(head)

    link_pat_present = re.compile(r'href="assets/theme-[^"]+"')
    css_link = '<link href="dist/css/main.css" rel="stylesheet" type="text/css"/>'
    htmls_touched = 0
    for html in sorted(ROOT.glob("*.html")):
        s = html.read_text()
        if link_pat_present.search(s):
            continue
        page = html.stem
        candidate = f"theme-{page}.css"
        if candidate not in restored:
            mapping = {"contact": "theme-contact.css",
                       "zaproszenia-i-kartki-okolicznosciowe": "theme-zaproszenia.css",
                       "work": "theme-index.css"}
            candidate = mapping.get(page)
        if not candidate or candidate not in restored:
            continue
        theme_link = (f'<link href="assets/{candidate}" rel="stylesheet" '
                      f'type="text/css"/>')
        new = s.replace(css_link, css_link + "\n" + theme_link, 1)
        if new != s:
            html.write_text(new)
            htmls_touched += 1

    print(f"restored {len(restored)} theme-*.css")
    print(f"  re-linked into {htmls_touched} HTML files")
    print(f"  stripped unified theme blocks from {MAIN_CSS.name}")


PAGE_THEME = {
    "cennik": "cennik",
    "contact": "contact",
    "gra-owoce-ducha": "gra-owoce-ducha",
    "index": "index",
    "jak-zamowic": "jak-zamowic",
    "o-mnie": "o-mnie",
    "opinie": "opinie",
    "portrety-komiksowe": "portrety-komiksowe",
    "portrety-kreskowkowe": "portrety-kreskowkowe",
    "portrety-w-praktyce-1": "portrety-w-praktyce-1",
    "portrety-w-praktyce": "portrety-w-praktyce",
    "regulamin": "regulamin",
    "work": "index",
    "zaproszenia-i-kartki-okolicznosciowe": "zaproszenia",
}

GLOBAL_AT_RULES = {
    "keyframes", "-webkit-keyframes", "-moz-keyframes", "-o-keyframes",
    "font-face", "charset", "import", "page",
}
NESTED_AT_RULES = {"media", "supports", "document"}


def split_selectors(s):
    out, depth, cur = [], 0, []
    for c in s:
        if c == "," and depth == 0:
            out.append("".join(cur).strip())
            cur = []
            continue
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        cur.append(c)
    if cur:
        out.append("".join(cur).strip())
    return [s for s in out if s]


_HTML_BODY_RE = re.compile(r"^(html|body)((?:[.:#\[][^\s]*)?)(\s.*)?$")


def scope_selector(sel, scope):
    sel = sel.strip()
    if not sel:
        return scope
    m = _HTML_BODY_RE.match(sel)
    if m:
        attached = m.group(2) or ""
        rest = m.group(3) or ""
        return (scope + attached + rest).strip()
    return f"{scope} {sel}"


def at_rule_name(block):
    m = re.match(r"@(-?[a-z]+(?:-[a-z]+)*)", block.lstrip())
    return m.group(1) if m else ""


def scope_block(block, scope):
    s = block.lstrip()
    if s.startswith("@"):
        name = at_rule_name(s)
        if name in GLOBAL_AT_RULES:
            return block
        if name in NESTED_AT_RULES:
            brace = block.find("{")
            inner_end = block.rfind("}")
            head = block[:brace + 1]
            inner = block[brace + 1:inner_end]
            scoped = [scope_block(b, scope) for b in split_blocks(inner)]
            return head + "\n  " + "\n  ".join(scoped) + "\n}"
        return block
    brace = block.find("{")
    if brace < 0:
        return block
    selectors = block[:brace].strip()
    body = block[brace:]
    sel_list = split_selectors(selectors)
    scoped = ", ".join(scope_selector(x, scope) for x in sel_list)
    return scoped + " " + body


def keyframes_or_fontface_key(block):
    """Return a dedup key for @keyframes / @font-face, else None."""
    s = block.lstrip()
    name = at_rule_name(s)
    if name in ("keyframes", "-webkit-keyframes", "-moz-keyframes", "-o-keyframes"):
        m = re.match(r"@-?[a-z]+(?:-[a-z]+)*\s+([^\s{]+)", s)
        return ("keyframes", (m.group(1) if m else block.strip()))
    if name == "font-face":
        return ("fontface", re.sub(r"\s+", " ", block.strip()))
    return None


_URL_RE = re.compile(r'url\(\s*(["\']?)([^)\'"]*)\1\s*\)')


def rewrite_url(match):
    quote = match.group(1)
    path = match.group(2).strip()
    if (not path or path.startswith(("http://", "https://", "//", "data:",
                                      "/", "#", "../", "./assets/"))):
        return match.group(0)
    return f'url({quote}../../assets/{path}{quote})'


def fixup_urls(css):
    """Rewrite relative url(...) so they resolve from dist/css/ to assets/."""
    return _URL_RE.sub(rewrite_url, css)


def unify_scoped():
    if not BACKUP.exists():
        if any(ASSETS.glob("theme-*.css")):
            BACKUP.mkdir(exist_ok=True)
            for f in sorted(ASSETS.glob("theme-*.css")):
                shutil.copy2(f, BACKUP / f.name)

    backup_themes = sorted(BACKUP.glob("theme-*.css"))
    if not backup_themes:
        raise SystemExit(f"no theme-*.css source in {BACKUP}")

    main_orig = MAIN_CSS.read_text()
    main_base, marker_block = strip_trailing_marker(main_orig)

    base_part = main_base
    if "/* === main.css base === */" in base_part:
        base_part = base_part.split("/* === main.css base === */", 1)[1]
        end = base_part.find("/* === theme-")
        if end >= 0:
            base_part = base_part[:end]
        base_part = base_part.strip() + "\n"

    parts = ["/* === main.css base === */", base_part.strip()]
    seen_global = set()

    for theme_file in backup_themes:
        theme_id = theme_file.stem.replace("theme-", "")
        scope = f"body.page-{theme_id}"
        parts.append(f"\n/* === scoped {theme_file.name} ({scope}) === */")
        css = fixup_urls(theme_file.read_text())
        for b in split_blocks(css):
            key = keyframes_or_fontface_key(b)
            if key is not None:
                if key in seen_global:
                    continue
                seen_global.add(key)
                parts.append(b)
                continue
            parts.append(scope_block(b, scope))

    if marker_block:
        parts.append("\n" + marker_block)

    MAIN_CSS.write_text("\n".join(parts) + "\n")

    css_link = '<link href="dist/css/main.css" rel="stylesheet" type="text/css"/>'
    theme_link_pat = re.compile(
        r'\s*<link[^>]*href="assets/theme-[^"]+\.css"[^>]*>\s*\n?'
    )
    body_pat = re.compile(r'<body\b([^>]*)>', re.IGNORECASE)

    htmls_touched = 0
    for html in sorted(ROOT.glob("*.html")):
        page = html.stem
        if page not in PAGE_THEME:
            continue
        page_class = f"page-{PAGE_THEME[page]}"
        s = html.read_text()
        new = theme_link_pat.sub("\n", s)

        def add_class(m, cls=page_class):
            attrs = m.group(1)
            cm = re.search(r'class="([^"]*)"', attrs)
            if cm:
                existing = cm.group(1).split()
                if cls in existing:
                    return m.group(0)
                new_classes = cls + " " + cm.group(1)
                return ('<body' + attrs[:cm.start()] +
                        f'class="{new_classes}"' + attrs[cm.end():] + '>')
            return f'<body class="{cls}"{attrs}>'

        new = body_pat.sub(add_class, new, count=1)
        if new != s:
            html.write_text(new)
            htmls_touched += 1

    for f in ASSETS.glob("theme-*.css"):
        f.unlink()

    print(f"scoped-unified {len(backup_themes)} themes")
    print(f"  unified lines: {MAIN_CSS.read_text().count(chr(10))}")
    print(f"  HTML touched: {htmls_touched}")
    print(f"  backup: {BACKUP.relative_to(ROOT)}")


if __name__ == "__main__":
    import sys
    if "--revert" in sys.argv:
        revert()
    elif "--scoped" in sys.argv:
        unify_scoped()
    else:
        main()
