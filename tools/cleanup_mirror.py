#!/usr/bin/env python3
"""
Remove Adobe Portfolio branding and dead references from mirrored HTML files.

Removes:
- <meta name="twitter:site" content="@AdobePortfolio">
- <meta name="twitter:card"> (useless without server)
- <link rel="canonical"> (points to local paths, meaningless)
- <div class="site-footer"> containing "Powered by Adobe Portfolio"
- <script src="//use.typekit.net/..."> (external CDN, broken)
- Typekit noscript fallback
- adobe.com / portfolio.adobe.com href attributes on remaining links
- Inline __config__ script (page_id, theme name) and Safari BFCache shim
- <script class="js-lightbox-slide-content" type="text/html"> templates
  (unused by replacement main.js)
- Editor data-attributes: data-context, data-hover-hint*, data-identity,
  data-text-keypath
- Portfolio test/editor classes: e2e-site-*, js-text-editable,
  js-inline-text-editable, js-js-project-module

Also remaps long Portfolio hashes (m[hex40+], p[hex40+]) used as data-id /
page-id into sequential m1/m2.../p1/p2... across HTML + CSS atomically.
"""
import glob
import os
import re
from bs4 import BeautifulSoup

MIRROR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site_mirror")


def clean_html(path):
    original = open(path, encoding="utf-8").read()
    soup = BeautifulSoup(original, "html.parser")
    changed = False

    # 1. Remove twitter:site @AdobePortfolio meta
    for tag in soup.find_all("meta", attrs={"name": "twitter:site"}):
        if "adobe" in (tag.get("content") or "").lower():
            tag.decompose(); changed = True

    # 2. Remove twitter:card meta (server-side feature, useless locally)
    for tag in soup.find_all("meta", attrs={"name": "twitter:card"}):
        tag.decompose(); changed = True

    # 3. Remove canonical link (points to local relative paths, meaningless)
    for tag in soup.find_all("link", rel=lambda r: r and "canonical" in r):
        tag.decompose(); changed = True

    # 4. Remove Typekit script (external CDN, broken)
    for tag in soup.find_all("script", src=re.compile(r"typekit\.net")):
        tag.decompose(); changed = True

    # 5. Remove Typekit noscript fallback
    for tag in soup.find_all("noscript"):
        if "typekit" in str(tag).lower():
            tag.decompose(); changed = True

    # 6. Remove site-footer (only contains "Powered by Adobe Portfolio")
    #    Wrapper may be either <div> or <footer> — match by class only.
    footer = soup.find(class_="site-footer")
    if footer:
        footer.decompose(); changed = True

    # 7. Remove any remaining links to portfolio.adobe.com / adobe.com
    for tag in soup.find_all("a", href=re.compile(r"adobe\.com|portfolio\.adobe")):
        tag.decompose(); changed = True

    # 8. Strip Portfolio editor / runtime markers
    if strip_portfolio_markers(soup):
        changed = True

    # 9. Insert Facebook + Instagram social_icons module (mirrored from
    #    o-mnie / contact, where Adobe Portfolio already had it in-content)
    if add_social_module(soup):
        changed = True

    if changed:
        result = str(soup)
        open(path, "w", encoding="utf-8").write(result)
        return True
    return False


KILL_ATTRS = (
    "data-context", "data-hover-hint", "data-hover-hint-id",
    "data-hover-hint-placement", "data-identity", "data-text-keypath",
)
KILL_CLASS_PREFIXES = ("e2e-site-",)
KILL_CLASS_EXACT = {
    "js-text-editable", "js-inline-text-editable", "js-js-project-module",
}


def strip_portfolio_markers(soup):
    """Remove Adobe Portfolio editor/runtime hooks from a parsed HTML tree."""
    changed = False

    for tag in soup.find_all("script"):
        if tag.get("src"):
            continue
        text = "".join(tag.strings) if tag.string is None else tag.string
        if "__config__" in text or "back/forward cache" in text:
            tag.decompose(); changed = True

    for tag in soup.find_all("script", class_="js-lightbox-slide-content"):
        tag.decompose(); changed = True

    for tag in soup.find_all(True):
        for attr in KILL_ATTRS:
            if attr in tag.attrs:
                del tag.attrs[attr]; changed = True

    for tag in soup.find_all(class_=True):
        kept = [c for c in tag["class"]
                if c not in KILL_CLASS_EXACT
                and not any(c.startswith(p) for p in KILL_CLASS_PREFIXES)]
        if kept != tag["class"]:
            if kept:
                tag["class"] = kept
            else:
                del tag.attrs["class"]
            changed = True

    return changed


HASH_RE = re.compile(r'\b([mp])([0-9a-f]{40,})\b')


def remap_portfolio_hashes():
    """Replace Portfolio hashes with sequential ids across HTML + CSS atomically."""
    files = (
        sorted(glob.glob(os.path.join(MIRROR, "*.html"))) +
        sorted(glob.glob(os.path.join(MIRROR, "assets", "*.css"))) +
        sorted(glob.glob(os.path.join(MIRROR, "dist", "css", "*.css")))
    )

    found_m, found_p = [], []
    for f in files:
        for m in HASH_RE.finditer(open(f, encoding="utf-8").read()):
            full = m.group(0)
            target = found_m if full.startswith("m") else found_p
            if full not in target:
                target.append(full)

    found_m.sort(); found_p.sort()
    mapping = {h: f"m{i}" for i, h in enumerate(found_m, 1)}
    mapping.update({h: f"p{i}" for i, h in enumerate(found_p, 1)})

    if not mapping:
        print("  no Portfolio hashes found")
        return

    updated = 0
    for f in files:
        s = open(f, encoding="utf-8").read()
        new = HASH_RE.sub(lambda m: mapping.get(m.group(0), m.group(0)), s)
        if new != s:
            open(f, "w", encoding="utf-8").write(new)
            updated += 1
    print(f"  remapped {len(found_m)} m-hashes + {len(found_p)} p-hashes "
          f"across {updated} files")


SOCIAL_MODULE_HTML = (
    '<div class="js-project-module project-module module social_icons '
    'project-module-social_icons align-">'
    '<div class="module-content module-content-social_icons js-module-content">'
    '<div class="social"><ul>'
    '<li><a href="https://www.facebook.com/grazkowegrafiki/" target="_blank" '
    'rel="noopener noreferrer" aria-label="Facebook">'
    '<svg class="icon" viewBox="0 0 30 24" xmlns="http://www.w3.org/2000/svg">'
    '<path d="M16.21 20h-3.26v-8h-1.63V9.24h1.63V7.59c0-2.25 0.92-3.59 '
    '3.53-3.59h2.17v2.76H17.3 c-1.02 0-1.08 0.39-1.08 1.11l0 1.38h2.46L18.38 '
    '12h-2.17V20z"/>'
    '</svg></a></li>'
    '<li><a href="https://www.instagram.com/grazkowe_grafiki/" target="_blank" '
    'rel="noopener noreferrer" aria-label="Instagram">'
    '<svg class="icon" viewBox="0 0 30 24" xmlns="http://www.w3.org/2000/svg">'
    '<g>'
    '<path d="M15,5.4c2.1,0,2.4,0,3.2,0c0.8,0,1.2,0.2,1.5,0.3c0.4,0.1,0.6,'
    '0.3,0.9,0.6c0.3,0.3,0.5,0.5,0.6,0.9c0.1,0.3,0.2,0.7,0.3,1.5c0,0.8,0,1.1,'
    '0,3.2s0,2.4,0,3.2c0,0.8-0.2,1.2-0.3,1.5c-0.1,0.4-0.3,0.6-0.6,0.9c-0.3,'
    '0.3-0.5,0.5-0.9,0.6c-0.3,0.1-0.7,0.2-1.5,0.3c-0.8,0-1.1,0-3.2,0s-2.4,0-'
    '3.2,0c-0.8,0-1.2-0.2-1.5-0.3c-0.4-0.1-0.6-0.3-0.9-0.6c-0.3-0.3-0.5-0.5-'
    '0.6-0.9c-0.1-0.3-0.2-0.7-0.3-1.5c0-0.8,0-1.1,0-3.2s0-2.4,0-3.2c0-0.8,'
    '0.2-1.2,0.3-1.5c0.1-0.4,0.3-0.6,0.6-0.9c0.3-0.3,0.5-0.5,0.9-0.6c0.3-'
    '0.1,0.7-0.2,1.5-0.3C12.6,5.4,12.9,5.4,15,5.4 M15,4c-2.2,0-2.4,0-3.3,0c-'
    '0.9,0-1.4,0.2-1.9,0.4c-0.5,0.2-1,0.5-1.4,0.9C7.9,5.8,7.6,6.2,7.4,6.8C7.2,'
    '7.3,7.1,7.9,7,8.7C7,9.6,7,9.8,7,12s0,2.4,0,3.3c0,0.9,0.2,1.4,0.4,1.9c0.2,'
    '0.5,0.5,1,0.9,1.4c0.4,0.4,0.9,0.7,1.4,0.9c0.5,0.2,1.1,0.3,1.9,0.4c0.9,0,'
    '1.1,0,3.3,0s2.4,0,3.3,0c0.9,0,1.4-0.2,1.9-0.4c0.5-0.2,1-0.5,1.4-0.9c0.4-'
    '0.4,0.7-0.9,0.9-1.4c0.2-0.5,0.3-1.1,0.4-1.9c0-0.9,0-1.1,0-3.3s0-2.4,0-'
    '3.3c0-0.9-0.2-1.4-0.4-1.9c-0.2-0.5-0.5-1-0.9-1.4c-0.4-0.4-0.9-0.7-1.4-'
    '0.9c-0.5-0.2-1.1-0.3-1.9-0.4C17.4,4,17.2,4,15,4L15,4L15,4z"/>'
    '<path d="M15,7.9c-2.3,0-4.1,1.8-4.1,4.1s1.8,4.1,4.1,4.1s4.1-1.8,4.1-4.1'
    'S17.3,7.9,15,7.9L15,7.9z M15,14.7c-1.5,0-2.7-1.2-2.7-2.7c0-1.5,1.2-2.7,'
    '2.7-2.7s2.7,1.2,2.7,2.7C17.7,13.5,16.5,14.7,15,14.7L15,14.7z"/>'
    '<path d="M20.2,7.7c0,0.5-0.4,1-1,1s-1-0.4-1-1s0.4-1,1-1S20.2,7.2,20.2,'
    '7.7L20.2,7.7z"/>'
    '</g></svg></a></li>'
    '</ul></div></div></div>'
)


def add_social_module(soup):
    """Insert FB+IG social_icons module at end of project canvas (idempotent).

    Mirrors the original Adobe Portfolio module that was already present on
    o-mnie.html / contact.html. Skips pages that already have it.
    Cleans up any leftover <footer class="social-footer"> from prior versions.
    """
    changed = False

    for stale in soup.find_all("footer", class_="social-footer"):
        stale.decompose(); changed = True

    if soup.find(class_="social_icons"):
        return changed

    canvas = (soup.find(id="project-canvas")
              or soup.find(class_="js-project-modules")
              or soup.find(class_="page-content")
              or soup.find("main"))
    if not canvas:
        return changed

    fragment = BeautifulSoup(SOCIAL_MODULE_HTML, "html.parser")
    canvas.append(fragment)
    return True


RENAME_RULES = [
    (re.compile(r'\bpf-'), ''),
    (re.compile(r'\bmasthead\b'), 'hero'),
    (re.compile(r'\bpage-background-video\b'), 'bg-video'),
]


def rename_class_names():
    """Rename Portfolio-specific class names across HTML + CSS + JS atomically."""
    files = (
        sorted(glob.glob(os.path.join(MIRROR, "*.html"))) +
        sorted(glob.glob(os.path.join(MIRROR, "assets", "*.css"))) +
        sorted(glob.glob(os.path.join(MIRROR, "dist", "css", "*.css"))) +
        sorted(glob.glob(os.path.join(MIRROR, "dist", "js", "*.js")))
    )
    updated = 0
    for f in files:
        s = open(f, encoding="utf-8").read()
        new = s
        for pat, repl in RENAME_RULES:
            new = pat.sub(repl, new)
        if new != s:
            open(f, "w", encoding="utf-8").write(new)
            updated += 1
    print(f"  renamed Portfolio-specific classes across {updated} files")


def main():
    updated = 0
    for fname in sorted(os.listdir(MIRROR)):
        if not fname.endswith(".html"):
            continue
        path = os.path.join(MIRROR, fname)
        if clean_html(path):
            print(f"  cleaned: {fname}")
            updated += 1
    print(f"\nHTML cleanup — touched {updated} files")
    print("\nRemapping Portfolio hashes…")
    remap_portfolio_hashes()
    print("\nRenaming Portfolio-specific class names…")
    rename_class_names()


if __name__ == "__main__":
    main()
