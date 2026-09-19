import { state } from '../state.js';
import { rand } from '../util.js';

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
  // Every grass variant shares one base colour: only the pencil strokes differ.
  // Varying the base as well turns the lattice into a visible quilt.
  const base = kind === 'path' ? '#ab8f62'
             : kind === 'dirt' ? '#8d6b45'
             : '#48a84d';
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  if (soil) {
    // Dry ground: scattered grit and a few pale pebbles.
    for (let n = 0; n < 90; n++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,64,38,0.30)' : 'rgba(226,203,160,0.28)';
      g.fillRect(x, y, 1.6, 1.4);
    }
    for (let n = 0; n < 5; n++) {
      g.fillStyle = 'rgba(214,198,168,0.5)';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 2.4, 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // Grass: short pencil strokes, the same language as the old backdrop.
    const density = kind === 'grassB' ? 150 : kind === 'grassC' ? 95 : 120;
    for (let n = 0; n < density; n++) {
      const x = Math.random() * w, y = Math.random() * h;
      const len = 4 + Math.random() * (kind === 'grassC' ? 14 : 11);
      const ang = rand(-0.5, 0.5) + (Math.random() < 0.5 ? 0 : Math.PI * 0.5);
      const shade = Math.random();
      g.strokeStyle = shade < 0.35 ? 'rgba(28,100,35,0.34)'
                    : shade < 0.7  ? 'rgba(115,180,80,0.30)'
                                   : 'rgba(235,230,145,0.16)';
      g.lineWidth = 0.9 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
  }

  // Deliberately no per-tile shading: a light-to-dark gradient inside each
  // diamond makes the grid read as quilted patchwork instead of ground.
  // Only bare earth gets a faint edge, which is what marks the path.
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
