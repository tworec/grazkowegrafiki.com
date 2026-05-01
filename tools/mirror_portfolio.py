#!/usr/bin/env python3
"""
Robust site mirrorer for grazkowegrafiki.com (or similar Adobe Portfolio sites).

What it does:
- Crawls all pages starting from BASE_URL (handles relative links)
- Canonicalizes page URLs (removes query/fragment and decodes %3F)
- Downloads assets (CSS, JS, images, fonts, pdfs)
- Renames images using <img alt="..."> or enclosing <a href="..."> when available
- Rewrites asset/page URLs in saved HTML to local relative paths
- Avoids duplicate downloads & filename collisions

Requirements:
    pip install requests beautifulsoup4
Usage:
    python mirror_portfolio.py
"""
import os
import re
import requests
import unicodedata
from collections import defaultdict
from urllib.parse import urljoin, urlparse, urlunparse, unquote
from bs4 import BeautifulSoup

BASE_URL = "https://grazkowegrafiki.com/"
OUTPUT_DIR = "site_mirror"

ASSET_SUFFIXES = (".css", ".js", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
                  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf")

LINK_RELS = {"stylesheet", "preload", "prefetch", "modulepreload", "icon", "shortcut icon", "apple-touch-icon"}

# Helpers --------------------------------------------------------------------
def slugify(text: str) -> str:
    """Make a safe ascii filename stem from arbitrary text."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^A-Za-z0-9_-]+", "_", text).strip("_")
    return text or "file"

def is_text_asset(path: str) -> bool:
    path = path.lower()
    return path.endswith((".css", ".js", ".html", ".htm", ".svg"))

def canonicalize_page_url(u: str) -> str:
    joined = urljoin(BASE_URL, u)
    joined = unquote(joined)
    p = urlparse(joined)
    path = p.path or "/"
    return urlunparse((p.scheme, p.netloc, path, "", "", ""))

def canonicalize_asset_url(u: str) -> str:
    joined = urljoin(BASE_URL, u)
    joined = unquote(joined)
    return joined

def safe_save_path_for_asset(parsed):
    path = parsed.path.lstrip("/")
    if not path:
        path = "root"
    dirname = os.path.dirname(path)
    basename = os.path.basename(path)
    stem, ext = os.path.splitext(basename)
    if parsed.query:
        qslug = slugify(parsed.query)[:40]
        fname = f"{stem}_{qslug}{ext or ''}"
    else:
        fname = f"{stem}{ext or ''}"
    return os.path.join(dirname, fname) if dirname else fname

def is_safe_path(rel_path: str) -> bool:
    abs_output = os.path.realpath(OUTPUT_DIR)
    abs_target = os.path.realpath(os.path.join(OUTPUT_DIR, rel_path))
    return abs_target.startswith(abs_output + os.sep) or abs_target == abs_output

def local_rel(target_rel: str, from_save_rel: str) -> str:
    """Compute a relative path from the directory of from_save_rel to target_rel."""
    from_dir = os.path.dirname(from_save_rel)
    if not from_dir:
        return target_rel
    return os.path.relpath(target_rel, from_dir)

# State ----------------------------------------------------------------------
visited_pages = set()
queued_pages = set()
downloaded_assets = set()
asset_map = {}                     # canonical asset URL -> local relative path
saved_pages = {}                   # canonical page URL -> save_rel path
image_name_counters = defaultdict(int)

# Core functions --------------------------------------------------------------
def download_asset(canon_url: str):
    """Download an asset once and save it; return local relative path or None."""
    if not canon_url or canon_url.startswith(("data:", "javascript:", "blob:", "#")):
        return None
    if canon_url in downloaded_assets:
        return asset_map.get(canon_url)

    url = canon_url.split("#", 1)[0]
    parsed = urlparse(url)
    rel_path = safe_save_path_for_asset(parsed)

    if not is_safe_path(rel_path):
        print(f"[!] Skipping unsafe path: {rel_path}")
        return None

    local_path = os.path.join(OUTPUT_DIR, rel_path)
    if os.path.exists(local_path):
        downloaded_assets.add(canon_url)
        asset_map[canon_url] = rel_path
        return rel_path

    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    try:
        resp = session.get(url, timeout=20, stream=True)
        if resp.status_code != 200:
            print(f"[!] Failed to download asset {url} ({resp.status_code})")
            return None
        if is_text_asset(parsed.path):
            with open(local_path, "w", encoding="utf-8") as f:
                f.write(resp.text)
        else:
            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(32768):
                    f.write(chunk)
        downloaded_assets.add(canon_url)
        asset_map[canon_url] = rel_path
        print(f"[+] Saved asset {url} -> {rel_path}")
        return rel_path
    except Exception as e:
        print(f"[!] Error downloading asset {url}: {e}")
        return None

def choose_image_filename(canon_asset_url: str, alt_text: str = None, parent_href: str = None):
    """Pick a unique filename (relative) for an image, using alt text or parent href."""
    parsed = urlparse(canon_asset_url)
    ext = os.path.splitext(parsed.path)[1] or ".jpg"
    if alt_text:
        base = slugify(alt_text)
    elif parent_href:
        base = slugify(os.path.splitext(os.path.basename(urlparse(parent_href).path))[0] or "img")
    else:
        base = slugify(os.path.splitext(os.path.basename(parsed.path))[0] or "img")
    image_name_counters[base] += 1
    count = image_name_counters[base]
    final_name = f"{base}" + (f"_{count}" if count > 1 else "") + ext
    return os.path.join("images", final_name)

def crawl_page(page_url: str, to_visit: set):
    """Crawl a single page: download HTML, parse, queue subpages, download assets."""
    if page_url in visited_pages:
        return
    print(f"[*] Crawling: {page_url}")
    try:
        resp = session.get(page_url, timeout=20)
    except Exception as e:
        print(f"[!] Error fetching {page_url}: {e}")
        visited_pages.add(page_url)
        return

    if resp.status_code != 200:
        print(f"[!] Skipping {page_url} ({resp.status_code})")
        visited_pages.add(page_url)
        return

    html = resp.text
    soup = BeautifulSoup(html, "html.parser")

    # --- <img> with alt / parent <a> renaming preference
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        canon_asset = canonicalize_asset_url(urljoin(page_url, src))
        if canon_asset in asset_map or canon_asset in downloaded_assets:
            continue
        alt = img.get("alt")
        parent_a = img.find_parent("a")
        parent_href = parent_a.get("href") if parent_a and parent_a.get("href") else None
        suggested = choose_image_filename(canon_asset, alt_text=alt, parent_href=parent_href)
        saved_rel = download_asset(canon_asset)
        if saved_rel is None:
            asset_map[canon_asset] = suggested
        elif saved_rel != suggested:
            src_path = os.path.join(OUTPUT_DIR, saved_rel)
            dest_path = os.path.join(OUTPUT_DIR, suggested)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            try:
                os.replace(src_path, dest_path)
                asset_map[canon_asset] = suggested
                print(f"[+] Renamed asset to {suggested}")
            except Exception:
                asset_map[canon_asset] = saved_rel
        else:
            asset_map[canon_asset] = saved_rel

    # --- <link> (stylesheets/preload only), <script src>
    for el in soup.find_all("link"):
        rel = " ".join(el.get("rel", [])).lower()
        if not any(r in rel for r in LINK_RELS):
            continue
        src = el.get("href")
        if src:
            download_asset(canonicalize_asset_url(urljoin(page_url, src)))

    for el in soup.find_all("script", src=True):
        download_asset(canonicalize_asset_url(urljoin(page_url, el["src"])))

    # --- srcset (native + data-srcset) and <source srcset>
    for el in soup.find_all(attrs={"data-srcset": True}):
        for part in el["data-srcset"].split(","):
            urlpart = part.strip().split(" ")[0]
            if urlpart:
                download_asset(canonicalize_asset_url(urljoin(page_url, urlpart)))

    for el in soup.find_all(["img", "source"], srcset=True):
        for part in el["srcset"].split(","):
            urlpart = part.strip().split(" ")[0]
            if urlpart:
                download_asset(canonicalize_asset_url(urljoin(page_url, urlpart)))

    # --- data-src on non-img elements (lightbox full-res)
    for el in soup.find_all(attrs={"data-src": True}):
        if el.name == "img":
            continue
        download_asset(canonicalize_asset_url(urljoin(page_url, el["data-src"])))

    # --- inline CSS url(...)
    for u in re.findall(r'url\([\'"]?(.*?)[\'"]?\)', html):
        if u.startswith(("data:", "javascript:", "#")):
            continue
        download_asset(canonicalize_asset_url(urljoin(page_url, u)))

    # --- <script type="text/html"> blocks — BSoup treats content as text, parse manually
    for script in soup.find_all("script"):
        t = script.get("type", "")
        if t.lower() not in ("text/html", "text/x-template"):
            continue
        content = script.string or ""
        for u in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', content):
            if u.startswith(("data:", "javascript:", "#")):
                continue
            download_asset(canonicalize_asset_url(urljoin(page_url, u)))
        for srcset_val in re.findall(r'srcset=["\']([^"\']+)["\']', content):
            for part in srcset_val.split(","):
                u = part.strip().split(" ")[0]
                if u and not u.startswith(("data:", "javascript:", "#")):
                    download_asset(canonicalize_asset_url(urljoin(page_url, u)))

    # --- Queue subpages (links)
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        canon_page = canonicalize_page_url(urljoin(page_url, href))
        p = urlparse(canon_page)
        if p.netloc and not p.netloc.endswith("grazkowegrafiki.com"):
            continue
        if p.path.lower().endswith(ASSET_SUFFIXES):
            continue
        if canon_page not in visited_pages and canon_page not in queued_pages:
            queued_pages.add(canon_page)
            to_visit.add(canon_page)
            print(f"  [+] Queued subpage: {canon_page}")

    # --- Save raw HTML
    parsed = urlparse(page_url)
    save_rel = parsed.path.lstrip("/") or "index.html"
    if save_rel.endswith("/"):
        save_rel += "index.html"
    if not os.path.splitext(save_rel)[1]:
        save_rel += ".html"
    save_path = os.path.join(OUTPUT_DIR, save_rel)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    try:
        with open(save_path, "w", encoding="utf-8") as fh:
            fh.write(html)
        saved_pages[page_url] = save_rel
        print(f"[+] Saved page {page_url} -> {save_rel}")
    except Exception as e:
        print(f"[!] Error saving page {page_url}: {e}")

    visited_pages.add(page_url)

# HTML rewriting -------------------------------------------------------------
def rewrite_css_url(match, page_url, save_rel):
    u = match.group(1)
    if not u or u.startswith(("data:", "javascript:", "#")):
        return match.group(0)
    canon = canonicalize_asset_url(urljoin(page_url, u))
    rel = asset_map.get(canon)
    if rel:
        return f"url('{local_rel(rel, save_rel)}')"
    return match.group(0)

def rewrite_srcset(val, page_url, save_rel):
    new_parts = []
    changed = False
    for part in val.split(","):
        pieces = part.strip().split(" ", 1)
        canon = canonicalize_asset_url(urljoin(page_url, pieces[0]))
        rel = asset_map.get(canon)
        if rel:
            pieces[0] = local_rel(rel, save_rel)
            changed = True
        new_parts.append(" ".join(pieces))
    return ", ".join(new_parts), changed

def rewrite_page(page_url: str, save_rel: str):
    path = os.path.join(OUTPUT_DIR, save_rel)
    try:
        with open(path, "r", encoding="utf-8") as f:
            html = f.read()
    except Exception as e:
        print(f"[!] Cannot read {path} for rewrite: {e}")
        return

    soup = BeautifulSoup(html, "html.parser")
    changed = False

    def asset_local(url_str):
        if not url_str or url_str.startswith(("data:", "javascript:", "#")):
            return None
        canon = canonicalize_asset_url(urljoin(page_url, url_str))
        rel = asset_map.get(canon)
        return local_rel(rel, save_rel) if rel else None

    def page_local(url_str):
        if not url_str or url_str.startswith(("mailto:", "tel:", "javascript:", "#")):
            return None
        # keep external links as-is
        if url_str.startswith("http") and not urlparse(url_str).netloc.endswith("grazkowegrafiki.com"):
            return None
        canon = canonicalize_page_url(urljoin(page_url, url_str))
        rel = saved_pages.get(canon)
        return local_rel(rel, save_rel) if rel else None

    # <img src>, <img data-src> and any element with data-src (lightbox etc.)
    for img in soup.find_all("img"):
        for attr in ("src", "data-src"):
            val = img.get(attr)
            if val:
                loc = asset_local(val)
                if loc:
                    img[attr] = loc
                    changed = True
        for attr in ("srcset", "data-srcset"):
            val = img.get(attr)
            if val:
                new_val, c = rewrite_srcset(val, page_url, save_rel)
                if c:
                    img[attr] = new_val
                    changed = True

    for el in soup.find_all(attrs={"data-src": True}):
        if el.name == "img":
            continue
        loc = asset_local(el["data-src"])
        if loc:
            el["data-src"] = loc
            changed = True

    # <source srcset>
    for source in soup.find_all("source"):
        val = source.get("srcset")
        if val:
            new_val, c = rewrite_srcset(val, page_url, save_rel)
            if c:
                source["srcset"] = new_val
                changed = True

    # og:image / twitter:image meta — rewrite content URL to local
    for el in soup.find_all("meta"):
        prop = el.get("property", "") or el.get("name", "")
        if any(prop.startswith(p) for p in ("og:image", "twitter:image")):
            val = el.get("content", "")
            if val:
                loc = asset_local(val)
                if loc:
                    el["content"] = loc
                    changed = True

    # canonical link — rewrite to local page path
    for el in soup.find_all("link", rel=True):
        if "canonical" in el.get("rel", []):
            loc = page_local(el.get("href", ""))
            if loc:
                el["href"] = loc
                changed = True

    # <link href>
    for el in soup.find_all("link"):
        val = el.get("href")
        if val:
            loc = asset_local(val)
            if loc:
                el["href"] = loc
                changed = True

    # <script src>
    for el in soup.find_all("script", src=True):
        loc = asset_local(el["src"])
        if loc:
            el["src"] = loc
            changed = True

    # <a href> — internal page links
    for a in soup.find_all("a", href=True):
        loc = page_local(a["href"])
        if loc:
            a["href"] = loc
            changed = True

    # inline style url(...)
    for el in soup.find_all(style=True):
        new_style = re.sub(
            r'url\([\'"]?(.*?)[\'"]?\)',
            lambda m: rewrite_css_url(m, page_url, save_rel),
            el["style"],
        )
        if new_style != el["style"]:
            el["style"] = new_style
            changed = True

    # <style> block url(...)
    for style_tag in soup.find_all("style"):
        if style_tag.string:
            new_css = re.sub(
                r'url\([\'"]?(.*?)[\'"]?\)',
                lambda m: rewrite_css_url(m, page_url, save_rel),
                style_tag.string,
            )
            if new_css != style_tag.string:
                style_tag.string = new_css
                changed = True

    # <script type="text/html"> — rewrite src/srcset attributes via regex on raw text
    for script in soup.find_all("script"):
        t = script.get("type", "")
        if t.lower() not in ("text/html", "text/x-template"):
            continue
        content = script.string
        if not content:
            continue

        def rewrite_script_attr(m):
            attr, quote, val = m.group(1), m.group(2), m.group(3)
            loc = asset_local(val)
            return f'{attr}={quote}{loc}{quote}' if loc else m.group(0)

        def rewrite_script_srcset(m):
            quote, val = m.group(1), m.group(2)
            new_val, c = rewrite_srcset(val, page_url, save_rel)
            return f'srcset={quote}{new_val}{quote}' if c else m.group(0)

        new_content = re.sub(r'(src|href)=(["\'])([^"\']+)\2', rewrite_script_attr, content)
        new_content = re.sub(r'srcset=(["\'])([^"\']+)\1', rewrite_script_srcset, new_content)
        if new_content != content:
            script.string = new_content
            changed = True

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(str(soup))
        print(f"[+] Rewritten links in {save_rel}")

def rewrite_css_file(canon_css_url: str, css_save_rel: str):
    """Rewrite url(...) references inside a downloaded CSS file to local paths."""
    path = os.path.join(OUTPUT_DIR, css_save_rel)
    try:
        with open(path, "r", encoding="utf-8") as f:
            css = f.read()
    except Exception as e:
        print(f"[!] Cannot read CSS {path} for rewrite: {e}")
        return

    def replace_url(m):
        u = m.group(1)
        if not u or u.startswith(("data:", "javascript:", "#")):
            return m.group(0)
        # resolve relative to the CSS file's own URL
        canon = canonicalize_asset_url(urljoin(canon_css_url, u))
        rel = asset_map.get(canon)
        if rel:
            return f"url('{local_rel(rel, css_save_rel)}')"
        return m.group(0)

    new_css = re.sub(r'url\([\'"]?(.*?)[\'"]?\)', replace_url, css)
    if new_css != css:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_css)
        print(f"[+] Rewritten links in {css_save_rel}")

# Main crawl loop ------------------------------------------------------------
def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    global session
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; MirrorBot/1.0)"})
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    to_visit = set()
    start = canonicalize_page_url(BASE_URL)
    queued_pages.add(start)
    to_visit.add(start)

    while to_visit:
        cur = to_visit.pop()
        crawl_page(cur, to_visit)

    print(f"\n[*] Crawl complete. Pages: {len(visited_pages)}, Assets: {len(downloaded_assets)}")

    print("[*] Downloading assets referenced inside CSS files...")
    for canon_css_url, css_save_rel in list(asset_map.items()):
        if not css_save_rel.endswith(".css"):
            continue
        path = os.path.join(OUTPUT_DIR, css_save_rel)
        try:
            with open(path, "r", encoding="utf-8") as f:
                css = f.read()
        except Exception:
            continue
        for u in re.findall(r'url\([\'"]?(.*?)[\'"]?\)', css):
            if u.startswith(("data:", "javascript:", "#")):
                continue
            canon = canonicalize_asset_url(urljoin(canon_css_url, u))
            download_asset(canon)

    print("[*] Rewriting local links in HTML...")
    for page_url, save_rel in saved_pages.items():
        rewrite_page(page_url, save_rel)

    print("[*] Rewriting local links in CSS...")
    for canon_url, save_rel in asset_map.items():
        if save_rel.endswith(".css"):
            rewrite_css_file(canon_url, save_rel)

    print(f"\n[*] Done.")
    print(f"    Pages visited:    {len(visited_pages)}")
    print(f"    Assets downloaded:{len(downloaded_assets)}")
    print(f"    Output folder:    {os.path.abspath(OUTPUT_DIR)}")

if __name__ == "__main__":
    main()
