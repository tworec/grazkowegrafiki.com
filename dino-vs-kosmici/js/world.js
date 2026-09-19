import { WORLD } from './config.js';
import { snapCamera } from './camera.js';
import { el, updateHUD } from './hud.js';
import { rand, clamp } from './util.js';
import { state, makePlayer } from './state.js';
import { spawnAlien, spawnPatrol } from './entities/aliens.js';
import { makeBase } from './entities/bases.js';
import { resetUpgradeTuning } from './upgrades.js';
import { makeTerrain } from './render/ground.js';


// Distance from a point to a path segment; used when keeping scenery off the
// routes. ground.js has its own copy for per-tile work.
function distToSeg(x, y, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((x - s.x1) * dx + (y - s.y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (s.x1 + dx * t), y - (s.y1 + dy * t));
}

export function buildLevel() {
  // Dash, fire and regen upgrades live on module constants, so every path that
  // starts a run (Play button, R after a defeat, restart()) must clear them.
  resetUpgradeTuning();
  state.player = makePlayer();
  state.aliens = [];
  state.bases = [];
  state.projectiles = [];
  state.fx = [];
  state.coins = [];
  state.trees = [];
  state.rocks = [];
  state.allies = [];

  // ----- Randomized layout — picked fresh every game -----
  // Alien HQ: anywhere on the map (with margin from edges)
  const M = 160; // margin from the world edge
  const baseX = rand(M, WORLD.w - M);
  const baseY = rand(M, WORLD.h - M);

  // Player spawn: anywhere far from the HQ
  let pX, pY, tries = 0;
  do {
    pX = rand(M, WORLD.w - M);
    pY = rand(M, WORLD.h - M);
    tries++;
  } while (tries < 60 && Math.hypot(pX - baseX, pY - baseY) < WORLD.w * 0.45);
  state.player.x = pX; state.player.y = pY;

  // Heal pad — middle band, away from HQ and player
  let hpX, hpY; tries = 0;
  do {
    hpX = clamp(pX + rand(-520, 520), M, WORLD.w - M);
    hpY = clamp(pY + rand(-360, 360), M, WORLD.h - M);
    tries++;
  } while (tries < 60 && (
    Math.hypot(hpX - baseX, hpY - baseY) < 400 ||
    Math.hypot(hpX - pX,    hpY - pY)    < 160
  ));

  // Ally pad — also middle band, but kept away from heal pad
  let apX, apY; tries = 0;
  do {
    apX = clamp(pX + rand(-520, 520), M, WORLD.w - M);
    apY = clamp(pY + rand(-360, 360), M, WORLD.h - M);
    tries++;
  } while (tries < 80 && (
    Math.hypot(apX - baseX, apY - baseY) < 400 ||
    Math.hypot(apX - pX,    apY - pY)    < 160 ||
    Math.hypot(apX - hpX,   apY - hpY)   < 200
  ));

  // Trodden routes between home, both pads and the enemy camp. Defined BEFORE
  // any scenery so rocks and trunks can be kept off them — a boulder sitting
  // in the middle of a path looks like a mistake and blocks the route the
  // ground is advertising.
  const paths = [
    {x1: pX, y1: pY, x2: hpX, y2: hpY, w: 34},
    {x1: hpX, y1: hpY, x2: apX, y2: apY, w: 30},
    {x1: apX, y1: apY, x2: baseX, y2: baseY, w: 38}
  ];
  const terrainSeed = Math.floor(Math.random() * 100000);
  // The widest wobble kindAt() can add to a corridor edge, so scenery clears
  // the path at its widest, not its nominal width.
  const PATH_WOBBLE = 17;
  function onPath(x, y, r) {
    for (const seg of paths) {
      if (distToSeg(x, y, seg) < seg.w + PATH_WOBBLE + r) return true;
    }
    return false;
  }

  // Now create the entities at the picked spots
  state.bases.push(makeBase(baseX, baseY));
  state.upgradePad = {x: hpX, y: hpY, r: 26};
  state.allyPad    = {x: apX, y: apY, r: 26};

  // Helipad — sits to one side of the HQ (decorative, gives the alien camp character)
  const hpdSide = Math.random() < 0.5 ? -1 : 1;
  state.helipad = {
    x: clamp(baseX + hpdSide * rand(95, 135), 60, WORLD.w - 50),
    y: clamp(baseY + rand(-20, 25), 60, WORLD.h - 80),
    r: 38
  };
  // If helipad ends up overlapping the HQ horizontally, push it further out
  if (Math.abs(state.helipad.x - baseX) < 90) {
    state.helipad.x = clamp(baseX + hpdSide * 110, 60, WORLD.w - 50);
  }

  // Flag (territory) — somewhere near the player's home turf
  state.flag = {
    x: clamp(pX + rand(-100, 100), 50, WORLD.w - 30),
    y: clamp(pY + rand(-50, 70),   60, WORLD.h - 60)
  };

  // Bare earth: where the aliens landed, around the pads, plus a few patches.
  const blobs = [
    {x: baseX, y: baseY, r: rand(150, 200)},
    {x: hpX,   y: hpY,   r: rand(70, 100)},
    {x: apX,   y: apY,   r: rand(70, 100)}
  ];
  if (state.helipad) blobs.push({x: state.helipad.x, y: state.helipad.y, r: 80});
  for (let k = 0; k < 5; k++) {
    blobs.push({x: rand(200, WORLD.w - 200), y: rand(200, WORLD.h - 200), r: rand(60, 130)});
  }

  // Rocks — random positions, avoiding all the above
  // Counts scale with the map area (the old 1280x1272 screen had 6-8 rocks, 10 trees).
  const area = WORLD.w * WORLD.h;
  const targetRocks = Math.round(area / 220000) + Math.floor(Math.random()*3);
  let rockTries = 0;
  while (state.rocks.length < targetRocks && rockTries < 600) {
    rockTries++;
    const r = rand(22, 36);
    const x = rand(70, WORLD.w - 70);
    const y = rand(70, WORLD.h - 70);
    if (Math.hypot(x - state.upgradePad.x, y - state.upgradePad.y) < r + state.upgradePad.r + 28) continue;
    if (Math.hypot(x - state.allyPad.x,    y - state.allyPad.y)    < r + state.allyPad.r + 28) continue;
    if (state.helipad && Math.hypot(x - state.helipad.x, y - state.helipad.y) < r + state.helipad.r + 18) continue;
    const mainBase = state.bases[0];
    if (Math.abs(x - mainBase.x) < r + mainBase.w/2 + 40 && Math.abs(y - mainBase.y) < r + mainBase.h/2 + 40) continue;
    if (Math.hypot(x - state.player.x, y - state.player.y) < r + 70) continue;
    if (onPath(x, y, r)) continue;
    let tooClose = false;
    for (const rk of state.rocks) {
      if (Math.hypot(x - rk.x, y - rk.y) < r + rk.r + 22) { tooClose = true; break; }
    }
    if (tooClose) continue;
    state.rocks.push({x, y, r, seed: Math.random()*1000});
  }

  // Trees — random decoration, also avoiding the placed elements
  const treeTarget = Math.round(area / 170000);
  let treeTries = 0;
  while (state.trees.length < treeTarget && treeTries < 800) {
    treeTries++;
    const tx = rand(40, WORLD.w - 40);
    const ty = rand(60, WORLD.h - 60);
    if (Math.hypot(tx - state.player.x, ty - state.player.y) < 80) continue;
    if (onPath(tx, ty, 22 * 1.2)) continue;   // trunk radius at the largest scale
    if (Math.hypot(tx - state.upgradePad.x, ty - state.upgradePad.y) < 60) continue;
    if (Math.hypot(tx - state.allyPad.x,    ty - state.allyPad.y)    < 60) continue;
    const mb = state.bases[0];
    if (Math.abs(tx - mb.x) < mb.w/2 + 30 && Math.abs(ty - mb.y) < mb.h/2 + 30) continue;
    let onRock = false;
    for (const rk of state.rocks) if (Math.hypot(tx-rk.x, ty-rk.y) < rk.r + 18) { onRock = true; break; }
    if (onRock) continue;
    // Keep trees from overlapping each other (pine creeping onto treeB etc.).
    let tooClose = false;
    for (const t of state.trees) if (Math.hypot(tx - t.x, ty - t.y) < 64) { tooClose = true; break; }
    if (tooClose) continue;
    const variants = ['treeA', 'pine', 'bush', 'treeB'];
    state.trees.push({x: tx, y: ty, s: rand(0.85, 1.2), v: variants[Math.floor(Math.random()*variants.length)]});
  }
  // Solid obstacles for movement: rocks + tree trunks (small circle at the foot of the tree).
  state.obstacles = state.rocks.slice();
  for (const t of state.trees) {
    if (t.v === 'bush') continue;
    const foot = treeFootY(t);
    state.obstacles.push({x: t.x, y: foot - 6, r: 9 * t.s});
  }

  state.terrain = makeTerrain(terrainSeed, blobs, paths);

  // Patrols posted along the routes, so crossing the map is a journey rather
  // than a stroll. Placed on the path segments (where the player actually
  // walks) but clear of the base, the pads and the starting spot.
  state.patrolTarget = 5;
  const patrolOk = (x, y) =>
    Math.hypot(x - pX, y - pY) > 380 &&          // not on the player's doorstep
    Math.hypot(x - baseX, y - baseY) > 340 &&    // the base has its own guards
    Math.hypot(x - hpX, y - hpY) > 200 &&
    Math.hypot(x - apX, y - apY) > 200 &&
    !state.aliens.some(a => a.home && Math.hypot(x - a.home.x, y - a.home.y) < 300);
  let posted = 0;
  // First pass: on the routes, where the player actually walks.
  for (let tries = 0; tries < 250 && posted < state.patrolTarget; tries++) {
    const seg = paths[Math.floor(Math.random() * paths.length)];
    const t = rand(0.15, 0.85);
    const x = clamp(seg.x1 + (seg.x2 - seg.x1) * t + rand(-110, 110), 120, WORLD.w - 120);
    const y = clamp(seg.y1 + (seg.y2 - seg.y1) * t + rand(-110, 110), 120, WORLD.h - 120);
    if (!patrolOk(x, y)) continue;
    spawnPatrol(x, y, 1);
    posted++;
  }
  // Second pass: anywhere sensible, so a short route never leaves the map bare.
  for (let tries = 0; tries < 250 && posted < state.patrolTarget; tries++) {
    const x = rand(160, WORLD.w - 160), y = rand(160, WORLD.h - 160);
    if (!patrolOk(x, y)) continue;
    spawnPatrol(x, y, 1);
    posted++;
  }

  // Start with one alien (per agreement: zaczynamy od jednego)
  spawnAlien();

  state.t = 0; state.hudAcc = 1; state.gameOver = false; state.won = false;
  state.wave = 1; state.nextWaveAt = null; state.pendingLevelUps = 0;
  el.banner.style.display = 'none';
  snapCamera(state.player.x, state.player.y);
  updateHUD();
}

// Tree sprite sizes (w, h) at scale 1 — shared by the renderer and the collision code.
export const TREE_SIZE = { pine: [52, 78], bush: [72, 50], treeB: [78, 96], treeA: [66, 78] };
export function treeFootY(t) {
  const sz = TREE_SIZE[t.v] || TREE_SIZE.treeA;
  return t.y + sz[1] * t.s / 2;
}

// ---------- Rock collision ----------
export function pushOutOfRocks(e) {
  const obs = state.obstacles || state.rocks;
  if (!obs) return;
  for (const r of obs) {
    const dx = e.x - r.x, dy = e.y - r.y;
    const d = Math.hypot(dx, dy);
    const minD = e.r + r.r;
    if (d < minD && d > 0.001) {
      const push = (minD - d) + 0.5;
      const nx = dx/d, ny = dy/d;
      e.x += nx * push; e.y += ny * push;
      // dampen velocity into the rock so we don't constantly press
      if (e.vx !== undefined) {
        const dot = e.vx * nx + e.vy * ny;
        if (dot < 0) { e.vx -= dot * nx; e.vy -= dot * ny; }
      }
    } else if (d <= 0.001) {
      // dead-on overlap — eject upward
      e.x += 0.1; e.y += minD;
    }
  }
}
export function projectileHitsRock(pr) {
  if (!state.rocks) return false;
  for (const r of state.rocks) {
    if (Math.hypot(pr.x - r.x, pr.y - r.y) < r.r + (pr.r||4) - 1) return true;
  }
  return false;
}
