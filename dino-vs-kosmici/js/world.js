import { WORLD } from './config.js';
import { snapCamera, cam } from './camera.js';
import { el, updateHUD } from './hud.js';
import { rand, clamp } from './util.js';
import { state, makePlayer, flashRing } from './state.js';
import { sfx } from './audio.js';
import { spawnAlien, spawnPatrol } from './entities/aliens.js';
import { makeBase } from './entities/bases.js';
import { makeTower } from './entities/tower.js';
import { resetUpgradeTuning } from './upgrades.js';
import { makeTerrain } from './render/ground.js';
import { SCENERY_ART } from './render/sprites.js';


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
  state.resourceDrops = [];
  state.trees = [];
  state.rocks = [];
  state.allies = [];
  state.wild = [];
  state.wildAt = null;
  state.scars = [];
  state.pickups = [];
  state.tower = null;
  state.updateon = null;

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

  // Trodden routes between home, both pads and the enemy camp. Defined BEFORE
  // any scenery so rocks and trunks can be kept off them — a boulder sitting
  // in the middle of a path looks like a mistake and blocks the route the
  // ground is advertising.
  // One trodden route from home to the enemy camp, with a bend so it is not a
  // ruler-straight line across the map.
  const midX = clamp((pX + baseX) / 2 + rand(-260, 260), 160, WORLD.w - 160);
  const midY = clamp((pY + baseY) / 2 + rand(-200, 200), 160, WORLD.h - 160);
  // A little network of trodden paths instead of one line: the main route home
  // to the enemy camp, plus a couple of side trails that meet it.
  const paths = [
    {x1: pX, y1: pY, x2: midX, y2: midY, w: 30},
    {x1: midX, y1: midY, x2: baseX, y2: baseY, w: 34}
  ];
  for (let k = 0; k < 2; k++) {
    const t = rand(0.25, 0.8);
    const fromX = pX + (baseX - pX) * t, fromY = pY + (baseY - pY) * t;
    paths.push({
      x1: fromX, y1: fromY,
      x2: clamp(fromX + rand(-620, 620), 140, WORLD.w - 140),
      y2: clamp(fromY + rand(-420, 420), 140, WORLD.h - 140),
      w: 24
    });
  }

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

  // Ten Dino diameters is the farthest these landmarks may spawn from home.
  // Neither should appear at the spawn point or in the alien HQ camp.
  const landmarkMax = state.player.r * 20;
  function placeLandmark(r, minDistance, other) {
    for (let i = 0; i < 300; i++) {
      const angle = rand(0, Math.PI * 2);
      const distance = rand(minDistance, landmarkMax);
      const x = pX + Math.cos(angle) * distance;
      const y = pY + Math.sin(angle) * distance;
      if (x < r + 70 || x > WORLD.w - r - 70 ||
          y < r + 80 || y > WORLD.h - r - 70) continue;
      if (Math.hypot(x - baseX, y - baseY) < 340 + r) continue;
      if (Math.hypot(x - state.helipad.x, y - state.helipad.y) < 90 + r) continue;
      if (other && Math.hypot(x - other.x, y - other.y) < 150 + r + other.r) continue;
      if (onPath(x, y, r + 15)) continue;
      return {x, y};
    }
    // Edge spawns can narrow the valid annulus. Try the same rules without
    // the decorative path clearance before giving up on the landmark.
    for (let i = 0; i < 300; i++) {
      const angle = rand(0, Math.PI * 2);
      const distance = rand(minDistance, landmarkMax);
      const x = pX + Math.cos(angle) * distance;
      const y = pY + Math.sin(angle) * distance;
      if (x < r + 20 || x > WORLD.w - r - 20 ||
          y < r + 20 || y > WORLD.h - r - 20) continue;
      if (Math.hypot(x - baseX, y - baseY) < 300 + r) continue;
      if (Math.hypot(x - state.helipad.x, y - state.helipad.y) < 80 + r) continue;
      if (other && Math.hypot(x - other.x, y - other.y) < 120 + r + other.r) continue;
      return {x, y};
    }
    // Exhaustively search the annulus, so even a very unlucky random sequence
    // cannot silently place a landmark beside the base or on top of Dino.
    for (let distance = minDistance; distance <= landmarkMax; distance += 10) {
      for (let i = 0; i < 72; i++) {
        const angle = i * Math.PI / 36;
        const x = pX + Math.cos(angle) * distance;
        const y = pY + Math.sin(angle) * distance;
        if (x < r + 20 || x > WORLD.w - r - 20 ||
            y < r + 20 || y > WORLD.h - r - 20) continue;
        if (Math.hypot(x - baseX, y - baseY) < 300 + r) continue;
        if (Math.hypot(x - state.helipad.x, y - state.helipad.y) < 80 + r) continue;
        if (other && Math.hypot(x - other.x, y - other.y) < 120 + r + other.r) continue;
        return {x, y};
      }
    }
    throw new Error('Brak miejsca na obiekt w pobliżu Dina');
  }
  state.updateon = {...placeLandmark(34, 190), r: 34};
  const towerSpot = placeLandmark(19, 240, state.updateon);
  state.tower = makeTower(towerSpot.x, towerSpot.y);

  // Flag (territory) — somewhere near the player's home turf
  state.flag = {
    x: clamp(pX + rand(-100, 100), 50, WORLD.w - 30),
    y: clamp(pY + rand(-50, 70),   60, WORLD.h - 60)
  };

  // Bare earth only where something actually flattened it: the alien camp and
  // its landing strip. The big random patches are gone — Antoś wants the dirt
  // to read as laid paths, not blotches dropped on the grass.
  const blobs = [
    {x: baseX, y: baseY, r: rand(110, 150)}
  ];
  if (state.helipad) blobs.push({x: state.helipad.x, y: state.helipad.y, r: 70});

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
    if (state.helipad && Math.hypot(x - state.helipad.x, y - state.helipad.y) < r + state.helipad.r + 18) continue;
    if (state.tower && Math.hypot(x - state.tower.x, y - state.tower.y) < r + state.tower.r + 22) continue;
    if (state.updateon && Math.hypot(x - state.updateon.x, y - state.updateon.y) < r + state.updateon.r + 24) continue;
    const mainBase = state.bases[0];
    if (Math.abs(x - mainBase.x) < r + mainBase.w/2 + 40 && Math.abs(y - mainBase.y) < r + mainBase.h/2 + 40) continue;
    if (Math.hypot(x - state.player.x, y - state.player.y) < r + 70) continue;
    if (onPath(x, y, r)) continue;
    let tooClose = false;
    for (const rk of state.rocks) {
      if (Math.hypot(x - rk.x, y - rk.y) < r + rk.r + 22) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const rockLooks = ['rock', 'rock-tall', 'rock-flat', 'rock-cluster'];
    state.rocks.push({x, y, r, seed: Math.random()*1000, kind: 'rock',
                      v: rockLooks[Math.floor(Math.random()*rockLooks.length)],
                      hp: SCENERY.rock, maxHp: SCENERY.rock});
  }

  // Trees — random decoration, also avoiding the placed elements
  const treeTarget = Math.round(area / 170000);
  let treeTries = 0;
  while (state.trees.length < treeTarget && treeTries < 800) {
    treeTries++;
    const tx = rand(40, WORLD.w - 40);
    const ty = rand(60, WORLD.h - 60);
    if (Math.hypot(tx - state.player.x, ty - state.player.y) < 80) continue;
    if (state.tower && Math.hypot(tx - state.tower.x, ty - state.tower.y) < state.tower.r + 68) continue;
    if (state.updateon && Math.hypot(tx - state.updateon.x, ty - state.updateon.y) < state.updateon.r + 70) continue;
    if (onPath(tx, ty, 22 * 1.2)) continue;   // trunk radius at the largest scale
    const mb = state.bases[0];
    if (Math.abs(tx - mb.x) < mb.w/2 + 30 && Math.abs(ty - mb.y) < mb.h/2 + 30) continue;
    let onRock = false;
    for (const rk of state.rocks) if (Math.hypot(tx-rk.x, ty-rk.y) < rk.r + 18) { onRock = true; break; }
    if (onRock) continue;
    // Keep trees from overlapping each other (pine creeping onto treeB etc.).
    let tooClose = false;
    for (const t of state.trees) if (Math.hypot(tx - t.x, ty - t.y) < 64) { tooClose = true; break; }
    if (tooClose) continue;
    // Four from the original atlas plus five painted ones, so a walk across the
    // map is not the same three shapes over and over.
    const variants = ['treeA', 'pine', 'treeB', 'tree-oak', 'tree-palm-fern', 'tree-dead',
                      'bush', 'bush-flower', 'bush-dry'];
    const v = variants[Math.floor(Math.random()*variants.length)];
    const isBush = v === 'bush' || v.startsWith('bush-');
    const hp = isBush ? SCENERY.bush : SCENERY.tree;
    state.trees.push({x: tx, y: ty, s: rand(0.85, 1.2), v, kind: 'tree', hp, maxHp: hp});
  }
  rebuildObstacles();

  state.terrain = makeTerrain(terrainSeed, blobs, paths);

  // Patrols posted along the routes, so crossing the map is a journey rather
  // than a stroll. Placed on the path segments (where the player actually
  // walks) but clear of the base, the pads and the starting spot.
  // Density, not a fixed count: one group per ~600k square units keeps the
  // journey populated whatever size the map is set to.
  state.patrolTarget = Math.max(3, Math.round((WORLD.w * WORLD.h) / 600000));
  const patrolOk = (x, y) =>
    Math.hypot(x - pX, y - pY) > 380 &&          // not on the player's doorstep
    Math.hypot(x - baseX, y - baseY) > 340 &&    // the base has its own guards
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

  // Pickups: a cluster or a pill hovering by many of the trees, so whatever you
  // are short of is usually a short walk away rather than across the map.
  state.pickups = [];
  for (const t of state.trees) {
    if (isBushVariant(t.v)) continue;
    const r = Math.random();
    const kind = r < PICKUP.pill.chance ? 'pill'
               : r < PICKUP.pill.chance + PICKUP.fruit.chance ? 'fruit'
               : null;
    if (!kind) continue;
    state.pickups.push({
      kind,
      tree: t,                 // felling the tree takes its pickup with it
      // Off to one side of the trunk, never straight in front of it — and
      // pulled back inside the map, since a tree near the edge would otherwise
      // hang its fruit outside it.
      x: clamp(t.x + (Math.random() < 0.5 ? -1 : 1) * rand(28, 48), 16, WORLD.w - 16),
      y: clamp(treeFootY(t) - rand(20, 40), 16, WORLD.h - 16),
      bob: rand(0, Math.PI * 2),
      ready: true, regrow: 0
    });
  }

  // Counters first, then the first alien: spawnAlien() reads state.wave to pick
  // its type, so spawning before the reset gave a brand new game a guard from
  // the previous run's wave.
  state.t = 0; state.hitStop = 0; state.patrolAcc = 0; state.clusterAcc = 0;
  state.hudAcc = 1; state.gameOver = false; state.won = false;
  state.wave = 1; state.nextWaveAt = null; state.pendingLevelUps = 0;
  el.banner.style.display = 'none';
  cam.shake = 0; cam.sx = 0; cam.sy = 0;
  spawnAlien();              // now that state.wave is back to 1
  snapCamera(state.player.x, state.player.y);
  updateHUD();
}

// How much punishment each piece of scenery takes. A bush comes apart almost
// at once, a rock takes real work — Antoś's ordering.
export const SCENERY = { bush: 18, tree: 70, rock: 190 };

// Both pickups hover near trees so neither health nor energy drags you back to
// one fixed spot on the map. Fruit is the common one; pills are rarer and heal.
export const PICKUP = {
  fruit: { chance: 0.34, amount: 40, regrow: 26, radius: 34, glow: '#ffd166' },
  pill:  { chance: 0.20, amount: 50, regrow: 36, radius: 34, glow: '#ff6b6b' }
};

// A felled tree or smashed rock leaves a mark on the ground that fades away,
// so you can see where you have been.
export const SCAR_LIFE = 26;

// Solid obstacles for movement: rocks plus tree trunks (a small circle at the
// foot of the tree). Rebuilt whenever scenery is destroyed.
export function rebuildObstacles() {
  state.obstacles = state.rocks.slice();
  for (const t of state.trees) {
    if (isBushVariant(t.v)) continue;   // you can walk through a bush
    state.obstacles.push({x: t.x, y: treeFootY(t) - 6, r: 9 * t.s});
  }
  if (state.updateon) state.obstacles.push(state.updateon);
  if (state.tower && !state.tower.dead) state.obstacles.push(state.tower);
}

// Damage every piece of scenery inside a circle. Returns true if anything was
// hit, so attacks can play their feedback.
export function damageScenery(x, y, radius, dmg) {
  let hit = false, destroyed = false;
  for (const list of [state.trees, state.rocks]) {
    for (const o of list) {
      if (o.dead) continue;
      // Hit the trunk where it stands, not the centre of the picture: the two
      // used to be up to 58 units apart on a big tree.
      const oy = o.kind === 'rock' ? o.y : treeFootY(o) - 8;
      const reach = radius + (o.kind === 'rock' ? o.r : 18 * o.s);
      if (Math.hypot(o.x - x, oy - y) > reach) continue;
      o.hp -= dmg;
      o.flash = 0.16;
      hit = true;
      if (o.hp <= 0) {
        o.dead = true;
        destroyed = true;
        breakScenery(o);
      }
    }
  }
  if (destroyed) {
    // Chop the tree and whatever hung beside it falls instead of hovering on
    // over nothing. It still works where it lands; it just will not regrow.
    for (const q of state.pickups) {
      if (q.tree && q.tree.dead && !q.falling && !q.grounded) {
        q.falling = true;
        q.vy = -30;                       // a small hop as the tree goes over
        q.groundY = treeFootY(q.tree) - 6;
        q.tree = null;
      }
    }
    state.trees = state.trees.filter(t => !t.dead);
    state.rocks = state.rocks.filter(r => !r.dead);
    rebuildObstacles();
  }
  return hit;
}

function addScar(o) {
  state.scars.push({
    x: o.x, y: o.kind === 'rock' ? o.y : treeFootY(o) - 4,
    kind: o.kind === 'rock' ? 'rock' : (isBushVariant(o.v) ? 'bush' : 'tree'),
    r: o.kind === 'rock' ? o.r * 0.9 : 13 * (o.s || 1),
    seed: Math.random() * 1000,
    life: SCAR_LIFE, t: 0
  });
}

function breakScenery(o) {
  addScar(o);
  const isRock = o.kind === 'rock';
  const isBush = !isRock && isBushVariant(o.v);
  spawnResourceDrops(o, isRock ? 'pebbles' : isBush ? 'sticks' : 'logs');
  const colour = isRock ? '#9a9aa2' : (isBush ? '#6fbf5a' : '#4e8f3a');
  const n = isRock ? 16 : 12;
  for (let i = 0; i < n; i++) {
    const ang = rand(0, Math.PI*2), sp = rand(50, 190);
    state.fx.push({kind:'puff', x: o.x, y: o.y, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp - 40,
                   life: 0.55, t: 0, color: colour});
  }
  flashRing(o.x, o.y, isRock ? 46 : 34, colour);
  sfx.alienHit();
}

// Every destroyed piece of scenery throws out real crafting materials. They
// travel in world space while `lift` supplies the vertical hop, so their
// shadows stay on the ground and the pickup is easy to read.
function spawnResourceDrops(o, kind) {
  const count = kind === 'pebbles' ? 4 : kind === 'logs' ? 3 : 2;
  const y = o.kind === 'rock' ? o.y : treeFootY(o) - 5;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(45, 105);
    state.resourceDrops.push({
      kind,
      x: o.x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.58,
      lift: rand(3, 9),
      vz: rand(165, 235),
      rot: rand(-0.35, 0.35),
      spin: rand(-2.2, 2.2),
      collectDelay: rand(0.45, 0.6),
      bounced: false,
      settled: false,
      collected: false
    });
  }
}

// Tree sprite sizes (w, h) at scale 1 — shared by the renderer and the collision code.
export const TREE_SIZE = { pine: [52, 78], bush: [72, 50], treeB: [78, 96], treeA: [66, 78] };
export function isBushVariant(v) { return v === 'bush' || v.startsWith('bush-'); }

export function treeFootY(t) {
  const art = SCENERY_ART[t.v];
  // Painted pieces stand on their base; atlas pieces are centred on t.y.
  if (art) return t.y + art.h * t.s * 0.5;
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
