import { perf, W, H, DPR } from './view.js';
import { WORLD } from './config.js';
import { cam, updateCamera, inView } from './camera.js';
import { updateAnim } from './anim.js';
import { showStart, showUpgradeChoice, anyScreenOpen } from './screens.js';
import { sfx } from './audio.js';
import { updateAudio } from './audio.js';
import { updateHUD } from './hud.js';
import { DIFFICULTY } from './config.js';
import { keys, joy } from './input.js';
import { rand, clamp, damp } from './util.js';
import { state, difficultyKey, currentSpecies, flashRing, notify } from './state.js';
import { buildLevel, pushOutOfRocks, projectileHitsRock, damageScenery, FRUIT } from './world.js';
import { cd, damagePlayer, updateFire } from './entities/player.js';
import { spawnAlien, spawnPatrol, damageAlien, updateAlien } from './entities/aliens.js';
import { damageBase, updateBase, spawnNextWaveBase, spawnBaseFromAlienCluster } from './entities/bases.js';
import { makeAlly, damageAlly, updateAlly } from './entities/allies.js';
import { updateWild } from './entities/wild.js';
import { draw } from './render/draw.js';


// ---------- Frame ----------
export let last = performance.now();
export let lastDraw = performance.now();
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
  // After win/lose we keep drawing (the last base still plays its
  // destruction animation, notifications fade) but stop simulating.
  // A level-up waits for the frame to finish, then opens the card picker;
  // while any screen is open the world holds still.
  if (state.pendingLevelUps > 0 && !state.paused && !state.gameOver && !state.won) {
    state.pendingLevelUps -= 1;
    // Nothing left to offer: drop the rest of the queue rather than stalling.
    if (!showUpgradeChoice()) state.pendingLevelUps = 0;
  }
  if (!state.gameOver && !state.won && !state.paused && !anyScreenOpen()) update(dt);
  draw();
  requestAnimationFrame(frame);
}

export function update(dt) {
  // Hit-stop: a few frames of near-freeze on impact make hits feel solid.
  if (state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - dt);
    dt *= 0.18;
  }
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
  // While dashing we keep the burst velocity instead of steering normally.
  p.dashT   = Math.max(0, (p.dashT   || 0) - dt);
  p.dashCd  = Math.max(0, (p.dashCd  || 0) - dt);
  p.iframes = Math.max(0, (p.iframes || 0) - dt);
  const speed = 220;
  if (p.dashT > 0) {
    const d = damp(0.90, dt); p.vx *= d; p.vy *= d;
  } else {
    p.vx += (ix * speed - p.vx) * Math.min(1, dt*8);
    p.vy += (iy * speed - p.vy) * Math.min(1, dt*8);
    const d = damp(0.85, dt); p.vx *= d; p.vy *= d;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Rocks block movement (you can hide behind them)
  pushOutOfRocks(p);
  // Clamp to the world
  p.x = clamp(p.x, p.r + 4, WORLD.w - p.r - 4);
  p.y = clamp(p.y, p.r + 4, WORLD.h - p.r - 4);
  updateCamera(p, dt);

  // Walk cycle, squash/stretch, lean, dust — driven by distance travelled.
  updateAnim(p, dt);

  // Slow passive energy regen — but most of your energy comes from the heal pad
  p.energy = clamp(p.energy + (state.energyRegen || 2)*dt, 0, p.maxEnergy);

  // Healing pad (red plus) — buys HP and nothing else. Energy comes from the
  // fruit growing round the map, so you are not dragged back here mid-fight
  // just to breathe fire again.
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
      if (didSomething) {
        // tiny heal sound, but only every ~0.5s so it isn't spammy
        if (!pad.lastSnd || state.t - pad.lastSnd > 0.45) {
          sfx.heal();
          pad.lastSnd = state.t;
        }
        state.fx.push({kind:'puff', x: p.x + rand(-12,12), y: p.y - 14,
                       vx: rand(-20,20), vy: -50, life: 0.5, t: 0, color: '#9aff9a'});
      }
    }
  }

  updateWild(dt);

  // Fruit — walk into a cluster to top up energy; it regrows in its own time.
  for (const f of state.fruit) {
    f.bob += dt * 1.7;      // slow enough to read as floating, not vibrating
    if (f.ready) {
      if (p.energy < p.maxEnergy && Math.hypot(p.x - f.x, p.y - f.y) < FRUIT.radius + p.r) {
        p.energy = Math.min(p.maxEnergy, p.energy + FRUIT.energy);
        f.ready = false;
        f.regrow = FRUIT.regrow;
        sfx.heal();
        flashRing(f.x, f.y, 34, '#ffd166');
        for (let i = 0; i < 7; i++) {
          const ang = rand(0, Math.PI*2);
          state.fx.push({kind:'puff', x: f.x, y: f.y, vx: Math.cos(ang)*70, vy: Math.sin(ang)*70 - 30,
                         life: 0.45, t: 0, color: '#ffd166'});
        }
      }
    } else {
      f.regrow -= dt;
      if (f.regrow <= 0) f.ready = true;
    }
  }

  // Scars left by felled scenery fade on their own.
  for (const sc of state.scars) { sc.t += dt; sc.life -= dt; }
  state.scars = state.scars.filter(sc => sc.life > 0);

  updateFire(dt);
  if (p.jump > 0) p.jump -= dt;
  if (p.shield > 0) p.shield -= dt;
  if (p.flash > 0) p.flash -= dt;
  if (p.attackAnim > 0) p.attackAnim -= dt;

  // Cooldowns
  for (const k of Object.keys(cd)) cd[k].ready = Math.max(0, cd[k].ready - dt);

  // Aliens (flyers leave no dust — they hover)
  for (const a of state.aliens) { updateAlien(a, dt); updateAnim(a, dt, {dust: a.type === 'walker' || a.type === 'big'}); }
  state.aliens = state.aliens.filter(a => !a.dead);

  // Allies
  for (const al of state.allies) if (!al.dead) { updateAlly(al, dt); updateAnim(al, dt, {scale: 0.6}); }
  state.allies = state.allies.filter(al => !al.dead);

  // Scenery damage flash
  for (const list of [state.trees, state.rocks]) {
    for (const o of list) if (o.flash > 0) o.flash -= dt;
  }

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
      // Fire burns scenery too; a bush goes up in a couple of licks.
      if (pr.life > 0 && damageScenery(pr.x, pr.y, pr.r, pr.dmg)) pr.life = 0;
    } else if (pr.kind === 'plasma' && pr.hostile) {
      if (Math.hypot(p.x-pr.x, p.y-pr.y) < p.r + pr.r) { damagePlayer(pr.dmg); pr.life = 0; }
      // also hit allies
      else for (const al of state.allies) if (!al.dead && Math.hypot(al.x-pr.x, al.y-pr.y) < al.r + pr.r) {
        damageAlly(al, pr.dmg); pr.life = 0; break;
      }
    }
  }
  state.projectiles = state.projectiles.filter(pr => pr.life > 0 && pr.x > -40 && pr.x < WORLD.w+40 && pr.y > -40 && pr.y < WORLD.h+40);

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
    if (f.kind === 'puff') {
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vy += 240 * dt; f.vx *= damp(0.98, dt);
    } else if (f.kind === 'egg') {
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vy += 240 * dt; f.vx *= damp(0.98, dt);
      // settle on the ground just below where the egg was launched
      const groundY = f.groundY != null ? f.groundY : f.y;
      if (f.y > groundY) { f.y = groundY; f.vy = 0; f.vx *= 0.6; }
    } else if (f.kind === 'dust') {
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vy += 26 * dt; f.vx *= damp(0.94, dt);
    } else if (f.kind === 'dmg') {
      f.y += f.vy * dt; f.x += (f.drift || 0) * dt;
      f.vy += 55 * dt;
    } else if (f.kind === 'notify') {
      f.y += (f.vy || 0) * dt;
      f.vy = (f.vy || 0) * damp(0.93, dt);
    }
    // Eggs hatch into baby allied dinosaurs (same species as the player)
    if (f.kind === 'egg' && f.life <= 0 && !f.hatched) {
      f.hatched = true;
      const ax = clamp(f.x, 30, WORLD.w - 30);
      const ay = clamp(f.y, 30, WORLD.h - 30);
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
  // Patrols do not count against the base budget, or posting them out on the
  // map would quietly starve the fight at the base.
  const fromBases = state.aliens.reduce((n, a) => n + (a.patrol ? 0 : 1), 0);
  if (aliveBases.length > 0 && fromBases < maxAliens && state.t > 6 &&
      Math.random() < dt * (diff.spawn + (aliveBases.length - 1) * diff.extraSpawn)) {
    spawnAlien(aliveBases[Math.floor(Math.random() * aliveBases.length)]);
  }

  // Patrols refill slowly, and only far from the player so a group never pops
  // into view. Cleared stretches of map stay clear for a while.
  state.patrolAcc = (state.patrolAcc || 0) + dt;
  if (state.patrolAcc > 6) {
    state.patrolAcc = 0;
    // Count distinct groups, not heads: groups are 2-4 strong, so dividing the
    // headcount by three both over- and under-counts.
    const live = new Set();
    for (const a of state.aliens) if (a.patrol) live.add(a.patrolId);
    if (live.size < (state.patrolTarget || 0)) {
      for (let tries = 0; tries < 40; tries++) {
        const x = rand(160, WORLD.w - 160), y = rand(160, WORLD.h - 160);
        // Distance from the player is not enough: near a world edge the camera
        // is clamped and can reach much further one way than the other. Test
        // the view rectangle itself, padded for the group's own spread.
        if (inView(x, y, 140)) continue;
        spawnPatrol(x, y, state.wave);
        break;
      }
    }
  }

  // Next-wave HQ: after the player clears every base, a bigger one sprouts
  // somewhere else. Then secondary/tertiary backfill kicks back in.
  if (state.nextWaveAt != null) {
    const left = state.nextWaveAt - state.t;
    if (left <= 0) {
      state.nextWaveAt = null;
      state.waveCountdown = null;
      spawnNextWaveBase();
    } else {
      // Tick down out loud over the last few seconds.
      const sec = Math.ceil(left);
      if (sec <= 3 && state.waveCountdown !== sec) {
        state.waveCountdown = sec;
        notify(String(sec), '#ffd166');
      }
    }
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
  dbgEl.textContent = `fps ${fps}  dpr ${DPR}  ${W}x${H}  zoom ${cam.zoom.toFixed(2)}  cam ${Math.round(cam.x)},${Math.round(cam.y)}\naliens ${state.aliens.length}  allies ${state.allies.length}  proj ${state.projectiles.length}  fx ${state.fx.length}  coins ${state.coins.length}`;
}

// ---------- Boot ----------
// A level exists from the first frame so the start screen has a world behind
// it; nothing moves until a dinosaur is picked.
buildLevel();
showStart();
requestAnimationFrame(now => { last = now; frame(now); });
