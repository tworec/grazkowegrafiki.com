import { perf, W, H } from './view.js';
import { el, updateHUD } from './hud.js';
import { rand, clamp } from './util.js';
import { state, makePlayer } from './state.js';
import { spawnAlien } from './entities/aliens.js';
import { makeBase } from './entities/bases.js';


export function buildLevel() {
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
  const baseX = rand(W*0.15, W*0.85);
  const baseY = rand(90, H - 110);

  // Player spawn: anywhere far from the HQ
  let pX, pY, tries = 0;
  do {
    pX = rand(W*0.10, W*0.90);
    pY = rand(120, H - 80);
    tries++;
  } while (tries < 60 && Math.hypot(pX - baseX, pY - baseY) < Math.min(W*0.45, H*0.55));
  state.player.x = pX; state.player.y = pY;

  // Heal pad — middle band, away from HQ and player
  let hpX, hpY; tries = 0;
  do {
    hpX = rand(70, W - 70);
    hpY = rand(H*0.34, H*0.66);
    tries++;
  } while (tries < 60 && (
    Math.hypot(hpX - baseX, hpY - baseY) < 140 ||
    Math.hypot(hpX - pX,    hpY - pY)    < 100
  ));

  // Ally pad — also middle band, but kept away from heal pad
  let apX, apY; tries = 0;
  do {
    apX = rand(70, W - 70);
    apY = rand(H*0.34, H*0.66);
    tries++;
  } while (tries < 80 && (
    Math.hypot(apX - baseX, apY - baseY) < 140 ||
    Math.hypot(apX - pX,    apY - pY)    < 100 ||
    Math.hypot(apX - hpX,   apY - hpY)   < 140
  ));

  // Now create the entities at the picked spots
  state.bases.push(makeBase(baseX, baseY));
  state.upgradePad = {x: hpX, y: hpY, r: 26};
  state.allyPad    = {x: apX, y: apY, r: 26};

  // Helipad — sits to one side of the HQ (decorative, gives the alien camp character)
  const hpdSide = Math.random() < 0.5 ? -1 : 1;
  state.helipad = {
    x: clamp(baseX + hpdSide * rand(95, 135), 60, W - 50),
    y: clamp(baseY + rand(-20, 25), 60, H - 80),
    r: 38
  };
  // If helipad ends up overlapping the HQ horizontally, push it further out
  if (Math.abs(state.helipad.x - baseX) < 90) {
    state.helipad.x = clamp(baseX + hpdSide * 110, 60, W - 50);
  }

  // Flag (territory) — somewhere near the player's home turf
  state.flag = {
    x: clamp(pX + rand(-100, 100), 50, W - 30),
    y: clamp(pY + rand(-50, 70),   140, H - 60)
  };

  // Rocks — random positions, avoiding all the above
  const targetRocks = 6 + Math.floor(Math.random()*3); // 6–8 rocks
  let rockTries = 0;
  while (state.rocks.length < targetRocks && rockTries < 200) {
    rockTries++;
    const r = rand(22, 36);
    const x = rand(70, W - 70);
    const y = rand(140, H - 90);
    if (Math.hypot(x - state.upgradePad.x, y - state.upgradePad.y) < r + state.upgradePad.r + 28) continue;
    if (Math.hypot(x - state.allyPad.x,    y - state.allyPad.y)    < r + state.allyPad.r + 28) continue;
    if (state.helipad && Math.hypot(x - state.helipad.x, y - state.helipad.y) < r + state.helipad.r + 18) continue;
    const mainBase = state.bases[0];
    if (Math.abs(x - mainBase.x) < r + mainBase.w/2 + 40 && Math.abs(y - mainBase.y) < r + mainBase.h/2 + 40) continue;
    if (Math.hypot(x - state.player.x, y - state.player.y) < r + 70) continue;
    let tooClose = false;
    for (const rk of state.rocks) {
      if (Math.hypot(x - rk.x, y - rk.y) < r + rk.r + 22) { tooClose = true; break; }
    }
    if (tooClose) continue;
    state.rocks.push({x, y, r, seed: Math.random()*1000});
  }

  // Trees — random decoration, also avoiding the placed elements
  const treeTarget = 10;
  let treeTries = 0;
  while (state.trees.length < treeTarget && treeTries < 200) {
    treeTries++;
    const tx = rand(40, W-40);
    const ty = rand(140, H-90);
    if (Math.hypot(tx - state.player.x, ty - state.player.y) < 80) continue;
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

  // Start with one alien (per agreement: zaczynamy od jednego)
  spawnAlien();

  state.t = 0; state.hudAcc = 1; state.gameOver = false; state.won = false;
  state.wave = 1; state.nextWaveAt = null;
  perf.staticDirty = true;
  el.banner.style.display = 'none';
  updateHUD();
}

// ---------- Rock collision ----------
export function pushOutOfRocks(e) {
  if (!state.rocks) return;
  for (const r of state.rocks) {
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
