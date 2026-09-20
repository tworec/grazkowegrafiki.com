import { state } from '../state.js';
import { GROUND_TEX, imgReady } from './sprites.js';

// ---------- Diamond ground ----------
// The world stays cartesian (x right, y down) so movement and collisions are
// unchanged; only the ground lattice is laid out isometrically. Tiles are
// painted once into small offscreen canvases and blitted, which costs a few
// hundred drawImage calls per frame and no chunk cache — far lighter on a
// phone than caching megabytes of composed terrain.

export const TILE = { w: 96, h: 48 };   // a 2:1 diamond; smaller reads as a
                                       // laid path rather than a big blotch

// Tile centre in world units.
export function tileToWorld(i, j) {
  return { x: (i - j) * TILE.w / 2, y: (i + j) * TILE.h / 2 };
}
export function worldToTile(x, y) {
  return { i: x / TILE.w + y / TILE.h, j: y / TILE.h - x / TILE.w };
}

// Stable per-tile hash: the same tile always looks the same, with no stored map.
function hash2(i, j, seed) {
  let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- Terrain kinds ----------
// Painted procedurally for now. Each painter fills one diamond; swapping in a
// seamless texture later means replacing the body of one function.
const KINDS = ['grassA', 'grassB', 'grassC', 'dirt', 'path'];

function diamondPath(ctx, w, h) {
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w, h / 2);
  ctx.lineTo(w / 2, h);
  ctx.lineTo(0, h / 2);
  ctx.closePath();
}

function paintTile(kind) {
  // One pixel of bleed on every side hides hairline seams between neighbours.
  const pad = 1;
  const w = TILE.w + pad * 2, h = TILE.h + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.save();
  diamondPath(g, w, h);
  g.clip();

  const soil = kind === 'dirt' || kind === 'path';
  const tex = kind === 'path' ? GROUND_TEX.path : kind === 'dirt' ? GROUND_TEX.dirt : GROUND_TEX.grass;
  if (imgReady(tex)) {
    // Each grass variant is cut from a different corner of the same seamless
    // texture, so neighbouring tiles do not repeat visibly.
    const off = kind === 'grassB' ? [90, 40] : kind === 'grassC' ? [170, 120] : [0, 0];
    const scale = 0.62;                       // texture detail at game scale
    const sw = w / scale, sh = h / scale;
    g.drawImage(tex, off[0], off[1], Math.min(sw, tex.naturalWidth - off[0]),
                Math.min(sh, tex.naturalHeight - off[1]), 0, 0, w, h);
  } else {
    // Until the texture arrives, a flat fill keeps the map readable.
    g.fillStyle = kind === 'path' ? '#ab8f62' : kind === 'dirt' ? '#8d6b45' : '#48a84d';
    g.fillRect(0, 0, w, h);
  }

  // Only bare earth gets an edge, and it is that edge which draws the path.
  if (soil) {
    g.strokeStyle = 'rgba(120,92,58,0.30)';
    g.lineWidth = 2;
    diamondPath(g, w, h);
    g.stroke();
  }
  g.restore();
  return cv;
}

let tiles = null;
// The textures load asynchronously; drop the cache when they arrive so the
// first frames drawn on flat colour get repainted properly.
for (const t of Object.values(GROUND_TEX)) {
  t.addEventListener('load', () => { tiles = null; }, { once: true });
}
function tileCanvas(kind) {
  if (!tiles) {
    tiles = {};
    for (const k of KINDS) tiles[k] = paintTile(k);
  }
  return tiles[kind];
}

// ---------- Terrain layout ----------
// buildLevel fills state.terrain with a seed, dirt blobs and path corridors;
// the kind of any tile is derived from those, so nothing per-tile is stored.
export function makeTerrain(seed, blobs, paths) {
  return { seed, blobs: blobs || [], paths: paths || [] };
}

function distToSegment(x, y, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((x - s.x1) * dx + (y - s.y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (s.x1 + dx * t), y - (s.y1 + dy * t));
}

export function kindAt(i, j) {
  const t = state.terrain;
  const { x, y } = tileToWorld(i, j);
  if (t) {
    for (const s of t.paths) {
      // A wobble on the edge keeps the path from looking machine-cut.
      const wob = (hash2(i, j, t.seed + 7) - 0.5) * 26;
      if (distToSegment(x, y, s) < s.w + wob) return 'path';
    }
    for (const b of t.blobs) {
      const wob = (hash2(i, j, t.seed + 3) - 0.5) * 44;
      if (Math.hypot(x - b.x, y - b.y) < b.r + wob) return 'dirt';
    }
  }
  const r = hash2(i, j, t ? t.seed : 1);
  return r < 0.42 ? 'grassA' : r < 0.74 ? 'grassB' : 'grassC';
}

// ---------- Drawing ----------
export function drawGround(ctx, vx, vy, vw, vh) {
  // Corners of the view in tile space; the visible set is their bounding box.
  const c = [
    worldToTile(vx, vy), worldToTile(vx + vw, vy),
    worldToTile(vx, vy + vh), worldToTile(vx + vw, vy + vh)
  ];
  const i0 = Math.floor(Math.min(...c.map(p => p.i))) - 1;
  const i1 = Math.ceil(Math.max(...c.map(p => p.i))) + 1;
  const j0 = Math.floor(Math.min(...c.map(p => p.j))) - 1;
  const j1 = Math.ceil(Math.max(...c.map(p => p.j))) + 1;

  const pad = 1;
  const w = TILE.w + pad * 2, h = TILE.h + pad * 2;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const p = tileToWorld(i, j);
      // Cheap reject: the diamond's bounding box against the view.
      if (p.x + TILE.w / 2 < vx || p.x - TILE.w / 2 > vx + vw ||
          p.y + TILE.h / 2 < vy || p.y - TILE.h / 2 > vy + vh) continue;
      ctx.drawImage(tileCanvas(kindAt(i, j)),
        p.x - TILE.w / 2 - pad, p.y - TILE.h / 2 - pad, w, h);
    }
  }
}
