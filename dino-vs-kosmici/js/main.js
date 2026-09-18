import { perf, W, H, DPR } from './view.js';
import { sfx } from './audio.js';
import { updateAudio } from './audio.js';
import { updateHUD } from './hud.js';
import { DIFFICULTY } from './config.js';
import { keys, joy } from './input.js';
import { rand, clamp, damp } from './util.js';
import { state, difficultyKey, currentSpecies, flashRing } from './state.js';
import { buildLevel, pushOutOfRocks, projectileHitsRock } from './world.js';
import { cd, damagePlayer, tryAutoUpgrade } from './entities/player.js';
import { spawnAlien, damageAlien, updateAlien } from './entities/aliens.js';
import { damageBase, updateBase, spawnNextWaveBase, spawnBaseFromAlienCluster } from './entities/bases.js';
import { makeAlly, damageAlly, updateAlly } from './entities/allies.js';
import { draw } from './render/draw.js';


// ---------- Frame ----------
export let last = performance.now();
export let lastDraw = performance.now();
// True while any base is still within its ~1s destruction animation window.
export function baseAnimating() {
  const now = performance.now();
  for (const b of state.bases) {
    if (b.dead && b.deadAt != null && (now - b.deadAt) < 1000) return true;
  }
  return false;
}

export function frame(now) {
  if (perf.hidden) {
    requestAnimationFrame(frame);
    return;
  }
  const frameMs = 1000 / perf.targetFps;
  if (now - lastDraw < frameMs - 1) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  lastDraw = now;
  debugTick(dt);
  updateAudio(dt, state);
  // Bases live on the static layer; while one plays its destruction
  // animation we must keep refreshing it (this also runs after win/lose,
  // when update() is skipped, so the final base finishes exploding).
  if (baseAnimating()) perf.staticDirty = true;
  if (!state.gameOver && !state.won) {
    update(dt);
    draw();
  } else if (perf.staticDirty) {
    draw();
  }
  requestAnimationFrame(frame);
}

export function update(dt) {
  state.t += dt;
  const p = state.player;
  const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.normal;

  // Input vector: keyboard + joystick
  let ix = 0, iy = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) ix -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) ix += 1;
  if (keys.has('ArrowUp') || keys.has('w')) iy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) iy += 1;
  if (Math.abs(joy.dx) + Math.abs(joy.dy) > 0.05) { ix = joy.dx; iy = joy.dy; }
  const m = Math.hypot(ix, iy);
  if (m > 1) { ix /= m; iy /= m; }

  if (m > 0.05) {
    p.lastDir.x = ix; p.lastDir.y = iy;
    if (ix > 0.1) p.facing = 1;
    else if (ix < -0.1) p.facing = -1;
  }
  const speed = 220;
  p.vx += (ix * speed - p.vx) * Math.min(1, dt*8);
  p.vy += (iy * speed - p.vy) * Math.min(1, dt*8);
  { const d = damp(0.85, dt); p.vx *= d; p.vy *= d; }
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Rocks block movement (you can hide behind them)
  pushOutOfRocks(p);
  // Clamp to screen (no leaving the screen — per request)
  p.x = clamp(p.x, p.r + 4, W - p.r - 4);
  p.y = clamp(p.y, p.r + 60, H - p.r - 4); // keep below HUD a bit

  // Walk-cycle phase advances only while we're moving — feet plant believably
  const pSpeed = Math.hypot(p.vx, p.vy);
  if (pSpeed > 20) p.walkPhase = (p.walkPhase || 0) + dt * Math.min(1.5 + pSpeed/120, 7);

  // Slow passive energy regen — but most of your energy comes from the heal pad
  p.energy = clamp(p.energy + 2*dt, 0, p.maxEnergy);

  // Healing pad (red plus) — converts dino-money into HP and energy
  // Costs: 1 $ = 5 HP, 1 $ = 5 energy. Tick every 100 ms while standing on it.
  const pad = state.upgradePad;
  if (pad) {
    const onPad = Math.hypot(p.x - pad.x, p.y - pad.y) < pad.r + p.r;
    pad.tickAcc = (pad.tickAcc || 0) + (onPad ? dt : 0);
    pad.glow = onPad ? 1 : Math.max(0, (pad.glow||0) - dt*2);
    if (onPad && pad.tickAcc >= 0.1) {
      pad.tickAcc = 0;
      let didSomething = false;
      if (p.hp < p.maxHp && p.money >= 1) {
        p.hp = Math.min(p.maxHp, p.hp + 5);
        p.money -= 1;
        didSomething = true;
      }
      if (p.energy < p.maxEnergy && p.money >= 1) {
        p.energy = Math.min(p.maxEnergy, p.energy + 5);
        p.money -= 1;
        didSomething = true;
      }
      if (didSomething) {
        // tiny heal sound, but only every ~0.5s so it isn't spammy
        if (!pad.lastSnd || state.t - pad.lastSnd > 0.45) {
          sfx.heal();
          pad.lastSnd = state.t;
        }
        state.fx.push({kind:'puff', x: p.x + rand(-12,12), y: p.y - 14,
                       vx: rand(-20,20), vy: -50, life: 0.5, t: 0, color: '#9aff9a'});
      } else if (p.hp >= p.maxHp && p.energy >= p.maxEnergy && p.money >= 40 &&
                 (!pad.lastUpgrade || state.t - pad.lastUpgrade > 1.5)) {
        if (tryAutoUpgrade()) pad.lastUpgrade = state.t;
      }
    }
  }

  // Ally pad — buy a STADO (herd) of 3 small dinos for 30$. Max 6 alive at once.
  const ALLY_COST = 30, ALLY_MAX = 6, ALLY_PER_BUY = 3;
  const ap = state.allyPad;
  if (ap) {
    const onAp = Math.hypot(p.x - ap.x, p.y - ap.y) < ap.r + p.r;
    ap.glow = onAp ? 1 : Math.max(0, (ap.glow||0) - dt*2);
    ap.tickAcc = (ap.tickAcc || 0) + (onAp ? dt : 0);
    if (onAp && ap.tickAcc >= 2) {
      ap.tickAcc = 0;
      const aliveCount = state.allies.filter(a => !a.dead).length;
      // Need full slots for the whole herd, so 3 always show up together.
      if (p.money >= ALLY_COST && aliveCount + ALLY_PER_BUY <= ALLY_MAX) {
        p.money -= ALLY_COST;
        for (let i = 0; i < ALLY_PER_BUY; i++) {
          const ang = rand(0, Math.PI*2);
          const dist = rand(20, 45);
          state.allies.push(makeAlly(p.x + Math.cos(ang)*dist, p.y + Math.sin(ang)*dist, p.species));
        }
        sfx.herd();
        flashRing(p.x, p.y, 70, '#9aff9a');
      }
    }
  }

  if (p.jump > 0) p.jump -= dt;
  if (p.shield > 0) p.shield -= dt;
  if (p.flash > 0) p.flash -= dt;
  if (p.attackAnim > 0) p.attackAnim -= dt;

  // Cooldowns
  for (const k of Object.keys(cd)) cd[k].ready = Math.max(0, cd[k].ready - dt);

  // Aliens
  for (const a of state.aliens) updateAlien(a, dt);
  state.aliens = state.aliens.filter(a => !a.dead);

  // Allies
  for (const al of state.allies) if (!al.dead) updateAlly(al, dt);
  state.allies = state.allies.filter(al => !al.dead);

  // Bases
  for (const b of state.bases) updateBase(b, dt);

  // Projectiles
  for (const pr of state.projectiles) {
    pr.t += dt; pr.life -= dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    // Rocks block projectiles — that's how you "hide"
    if (projectileHitsRock(pr)) { pr.life = 0; continue; }
    if (pr.kind === 'fire') {
      { const d = damp(0.97, dt); pr.vx *= d; pr.vy *= d; }
      // damage aliens & base
      for (const a of state.aliens) if (!a.dead && Math.hypot(a.x-pr.x, a.y-pr.y) < a.r + pr.r) {
        damageAlien(a, pr.dmg); pr.life = 0;
      }
      for (const b of state.bases) if (!b.dead && Math.abs(b.x-pr.x) < b.w/2+pr.r && Math.abs(b.y-pr.y) < b.h/2+pr.r) {
        damageBase(b, pr.dmg); pr.life = 0;
      }
    } else if (pr.kind === 'plasma' && pr.hostile) {
      if (Math.hypot(p.x-pr.x, p.y-pr.y) < p.r + pr.r) { damagePlayer(pr.dmg); pr.life = 0; }
      // also hit allies
      else for (const al of state.allies) if (!al.dead && Math.hypot(al.x-pr.x, al.y-pr.y) < al.r + pr.r) {
        damageAlly(al, pr.dmg); pr.life = 0; break;
      }
    }
  }
  state.projectiles = state.projectiles.filter(pr => pr.life > 0 && pr.x > -40 && pr.x < W+40 && pr.y > -40 && pr.y < H+40);

  // Coins
  for (const c of state.coins) {
    c.t += dt; c.life -= dt;
    c.x += c.vx * dt; c.y += c.vy * dt;
    { const d = damp(0.92, dt); c.vx *= d; c.vy *= d; }
    // generous pickup range so you don't lose coins by walking past them
    const pickupR = p.r + 22;
    const dToP = Math.hypot(c.x-p.x, c.y-p.y);
    if (dToP < pickupR) {
      p.money += c.value; c.life = 0; sfx.coin();
    } else if (dToP < pickupR * 3.2 && c.life < 24.8) {
      // gentle magnet pull once they've settled — drifts coins toward the dino
      const m = (dToP > 0.001) ? 1/dToP : 0;
      c.vx += (p.x - c.x) * m * 90 * dt;
      c.vy += (p.y - c.y) * m * 90 * dt;
    }
  }
  state.coins = state.coins.filter(c => c.life > 0);

  // FX
  for (const f of state.fx) {
    f.t += dt; f.life -= dt;
    if (f.kind === 'puff' || f.kind === 'egg') {
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vy += 240 * dt; f.vx *= damp(0.98, dt);
      if (f.kind === 'egg') {
        // settle on the ground band so eggs don't fall off-screen before hatching
        const groundY = H - 70;
        if (f.y > groundY) { f.y = groundY; f.vy = 0; f.vx *= 0.6; }
      }
    } else if (f.kind === 'notify') {
      f.y += (f.vy || 0) * dt;
      f.vy = (f.vy || 0) * damp(0.93, dt);
    }
    // Eggs hatch into baby allied dinosaurs (same species as the player)
    if (f.kind === 'egg' && f.life <= 0 && !f.hatched) {
      f.hatched = true;
      const ax = clamp(f.x, 30, W - 30);
      const ay = clamp(f.y, 100, H - 60);
      const sp = state.player ? state.player.species : currentSpecies();
      state.allies.push(makeAlly(ax, ay, sp));
      flashRing(ax, ay, 22, '#9aff9a');
      sfx.hatch();
    }
  }
  state.fx = state.fx.filter(f => f.life > 0);

  // Aliens are produced by every alive base. Spawn rate is intentionally slow
  // so the player has time to actually win (was way too aggressive before).
  // Single-base rate ~0.16/s = ~one alien every 6 seconds. +0.06/s per extra base.
  const aliveBases = state.bases.filter(b => !b.dead);
  const maxAliens = Math.min(11, diff.maxBase + (aliveBases.length - 1) * 3);
  if (aliveBases.length > 0 && state.aliens.length < maxAliens && state.t > 6 &&
      Math.random() < dt * (diff.spawn + (aliveBases.length - 1) * diff.extraSpawn)) {
    spawnAlien(aliveBases[Math.floor(Math.random() * aliveBases.length)]);
  }

  // Next-wave HQ: after the player clears every base, a bigger one sprouts
  // somewhere else. Then secondary/tertiary backfill kicks back in.
  if (state.nextWaveAt != null && state.t >= state.nextWaveAt) {
    state.nextWaveAt = null;
    spawnNextWaveBase();
  }

  // Reinforcement bases are built from a real group of at least 5 aliens,
  // so they never appear out of empty grass.
  const haveLiveBase = state.bases.some(bb => !bb.dead);
  if (haveLiveBase && state.bases.filter(b => !b.dead).length < 2) {
    spawnBaseFromAlienCluster('secondary', 'Druga baza zbudowana przez kosmitów!');
  }
  if (haveLiveBase && state.bases.filter(b => !b.dead).length < 3) {
    spawnBaseFromAlienCluster('tertiary', 'Trzecia baza zbudowana przez kosmitów!');
  }

  state.hudAcc = (state.hudAcc || 0) + dt;
  if (state.hudAcc >= 0.1) {
    state.hudAcc = 0;
    updateHUD();
  }
}

document.addEventListener('visibilitychange', () => {
  perf.hidden = document.hidden;
  if (!perf.hidden) last = performance.now();
});

// ---------- Debug overlay (?debug=1) ----------
const DEBUG = new URLSearchParams(location.search).has('debug');
let dbgEl = null, dbgFrames = 0, dbgAcc = 0;
if (DEBUG) {
  dbgEl = document.createElement('div');
  dbgEl.style.cssText = 'position:absolute;left:8px;bottom:170px;background:rgba(0,0,0,.6);color:#0f0;font:12px monospace;padding:4px 6px;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(dbgEl);
}
function debugTick(dt) {
  if (!dbgEl) return;
  dbgFrames++; dbgAcc += dt;
  if (dbgAcc < 0.5) return;
  const fps = Math.round(dbgFrames / dbgAcc);
  dbgFrames = 0; dbgAcc = 0;
  dbgEl.textContent = `fps ${fps}  dpr ${DPR}  ${W}x${H}\naliens ${state.aliens.length}  allies ${state.allies.length}  proj ${state.projectiles.length}  fx ${state.fx.length}  coins ${state.coins.length}`;
}

// ---------- Boot ----------
buildLevel();
requestAnimationFrame(now => { last = now; frame(now); });
