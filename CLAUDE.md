# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-script Python utility that mirrors `grazkowegrafiki.com` to a local `site_mirror/` directory. The main script is `mirror_portfolio.py`.

## Running

```bash
pip install requests beautifulsoup4
python3 mirror_portfolio.py
```

Prints crawl progress to stdout. Output lands in `site_mirror/`.

## Architecture

`mirror_portfolio.py` is a BFS web crawler with these responsibilities:

1. **Crawl loop** (`main` + `crawl_page`) — BFS queue of internal pages; fetches HTML, extracts assets and internal links, saves HTML to disk.
2. **Asset downloader** (`download_asset`) — deduplicates via `downloaded_assets` set; streams binary files in 32 KB chunks; keyed by canonical URL.
3. **Image renaming** (`choose_image_filename`) — prefers `alt` text, falls back to parent `<a href>` basename; `slugify()` converts to ASCII; `image_name_counters` handles collisions.
4. **URL canonicalization** (`canonicalize_page_url`, `canonicalize_asset_url`) — strips query strings from page URLs (but keeps them for asset dedup via `safe_save_path_for_asset`), unquotes percent-encoding.

Key state: `visited_pages`, `queued_pages`, `downloaded_assets`, `asset_map` (URL → local relative path), `image_name_counters`.

## Configuration

All config is hardcoded at the top of `mirror_portfolio.py`:
- `BASE_URL` — target site root
- `OUTPUT_DIR` — local output folder (`site_mirror`)
- `ASSET_SUFFIXES` — file extensions treated as downloadable assets
- HTTP session uses a 20 s timeout and a generic `MirrorBot/1.0` User-Agent

## Known Limitations

- Saved HTML is **not rewritten** — asset URLs in the HTML still point to the live site.
- CSS `url(...)` references are parsed with regex, not a CSS parser.
- Only same-domain links are queued; external resources are downloaded but not crawled.
