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
import { buildLevel, pushOutOfRocks, projectileHitsRock, damageScenery, PICKUP } from './world.js';
import { cd, damagePlayer, updateFire } from './entities/player.js';
import { spawnAlien, spawnPatrol, damageAlien, updateAlien } from './entities/aliens.js';
import { damageBase, updateBase, spawnNextWaveBase, spawnBaseFromAlienCluster } from './entities/bases.js';
import { makeAlly, damageAlly, updateAlly } from './entities/allies.js';
import { updateWild } from './entities/wild.js';
import { draw } from './render/draw.js';


// ---------- Frame ----------
export let last = performance.now();
export let lastDraw = performance.now();
let lastIdleDraw = 0;
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
  const simulating = !state.gameOver && !state.won && !state.paused && !anyScreenOpen();
  if (simulating) {
    update(dt);
  } else if (state.gameOver || state.won) {
    // The world is over but the picture is not: the last base is still
    // collapsing and the effects it threw have to land.
    updateFx(dt);
  }
  // On a menu or a pause the image is all but still, so repainting the whole
  // map sixty times a second just drains a phone. Ten times a second is plenty
  // for the cooldown ticks and the fading banner behind the cards.
  const idling = !simulating && !state.gameOver && !state.won;
  if (!idling || now - lastIdleDraw >= 100) {
    lastIdleDraw = now;
    draw();
  }
  requestAnimationFrame(frame);
}

// Effects run on their own, because they have to finish after the world
// stops: the last ring, the floating numbers and the eggs thrown by the
// killing blow were all freezing behind the result banner.
export function updateFx(dt) {
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
      if (f.y > groundY) { f.y = groundY; f.vy = 0; f.vx *= damp(0.6, dt); }
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

  updateWild(dt);

  // Pickups — walk into one to top up. Fruit gives energy, pills give health;
  // both regrow in their own time so a spot is worth coming back to.
  for (const q of state.pickups) {
    if (q.falling) {
      q.vy += 420 * dt;
      q.y += q.vy * dt;
      if (q.y >= q.groundY) { q.y = q.groundY; q.falling = false; q.grounded = true; }
    } else if (!q.grounded) {
      q.bob += dt * 1.7;    // slow enough to read as floating, not vibrating
    }
    if (!q.ready) {
      // Something knocked off its tree is gone for good once taken.
      if (q.grounded) continue;
      q.regrow -= dt;
      if (q.regrow <= 0) q.ready = true;
      continue;
    }
    const cfg = PICKUP[q.kind];
    const needed = q.kind === 'pill' ? p.hp < p.maxHp : p.energy < p.maxEnergy;
    if (!needed || Math.hypot(p.x - q.x, p.y - q.y) > cfg.radius + p.r) continue;
    if (q.kind === 'pill') p.hp = Math.min(p.maxHp, p.hp + cfg.amount);
    else p.energy = Math.min(p.maxEnergy, p.energy + cfg.amount);
    q.ready = false;
    q.regrow = cfg.regrow;
    sfx.heal();
    flashRing(q.x, q.y, 34, cfg.glow);
    for (let i = 0; i < 7; i++) {
      const ang = rand(0, Math.PI*2);
      state.fx.push({kind:'puff', x: q.x, y: q.y, vx: Math.cos(ang)*70, vy: Math.sin(ang)*70 - 30,
                     life: 0.45, t: 0, color: cfg.glow});
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
    if (projectileHitsRock(pr)) {
      // Fire that stops on a rock should still scorch it; it used to vanish
      // without ever reaching the scenery damage below.
      if (pr.kind === 'fire') damageScenery(pr.x, pr.y, pr.r, pr.dmg);
      pr.life = 0;
      continue;
    }
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
    // A burst at the map edge used to fling coins past it, out of reach.
    c.x = clamp(c.x, 8, WORLD.w - 8); c.y = clamp(c.y, 8, WORLD.h - 8);
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

  updateFx(dt);

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
      // The base refuses to appear on screen or on top of scenery. If there is
      // no good spot this instant, wait half a second and look again rather
      // than landing it somewhere wrong.
      if (spawnNextWaveBase()) {
        state.nextWaveAt = null;
        state.waveCountdown = null;
      } else {
        state.nextWaveAt = state.t + 0.5;
      }
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
  // so they never appear out of empty grass. The search is a nested scan over
  // every alien, and aliens do not gather up within a frame, so twice a second
  // is as often as it is worth asking — it used to run twice per frame.
  state.clusterAcc = (state.clusterAcc || 0) + dt;
  if (state.clusterAcc >= 0.5) {
    state.clusterAcc = 0;
    const live = state.bases.reduce((n, b) => n + (b.dead ? 0 : 1), 0);
    if (live > 0 && live < 2) {
      spawnBaseFromAlienCluster('secondary', 'Druga baza zbudowana przez kosmitów!');
    } else if (live > 0 && live < 3) {
      spawnBaseFromAlienCluster('tertiary', 'Trzecia baza zbudowana przez kosmitów!');
    }
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
