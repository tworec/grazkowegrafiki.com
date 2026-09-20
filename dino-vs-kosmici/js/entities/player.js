import { perf } from '../view.js';
import { sfx } from '../audio.js';
import { showBanner } from '../hud.js';
import { SPECIES_STATS, ENERGY_COST, XP_CURVE, FIRE_DEFAULTS, DASH_DEFAULTS } from '../config.js';
import { rand } from '../util.js';
import { state, notify, flashRing, damageNumber } from '../state.js';
import { recordRun, bestFor } from '../screens.js';
import { addShake } from '../camera.js';
import { damageAlien } from './aliens.js';
import { damageBase } from './bases.js';
import { damageScenery } from '../world.js';


// ---------- Cooldowns & energy costs ----------
export const cd = { claw:{ready:0,max:0.42}, tail:{ready:0,max:3}, fire:{ready:0,max:1.4} };

// Claw combo: three swings inside the window, the third one hits hard.
export const COMBO = { window: 0.85, hits: 3, finisherMul: 1.75, finisherCost: 4 };
// Fire is no longer a once-a-minute nuke but a breath you hold. Upgrades write
// to this object, so the starting numbers live in config.js.
export const FIRE = { ...FIRE_DEFAULTS };
export function cooldownMax(kind) {
  const up = state.player && state.player.upgrades ? state.player.upgrades.cooldown : 0;
  return cd[kind].max * Math.max(0.72, 1 - up * 0.07);
}

// Find the nearest alive alien (or base, if no aliens). Returns {x,y,target,dx,dy,dist} or null.
export function findNearestTarget() {
  const p = state.player;
  let best = null, bestD = Infinity;
  for (const a of state.aliens) {
    if (a.dead) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < bestD) { bestD = d; best = a; }
  }
  // Bases compete on distance like everything else: one patrol left alive at
  // the far end of the map used to stop the base in front of you being a target.
  for (const b of state.bases) {
    if (b.dead) continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (!best) return null;
  const dx = best.x - p.x, dy = best.y - p.y;
  return {x: best.x, y: best.y, target: best, dx, dy, dist: Math.hypot(dx, dy) || 1};
}

export function autoFaceTarget() {
  const p = state.player;
  const t = findNearestTarget();
  if (!t) return null;
  if (t.dx > 1) p.facing = 1;
  else if (t.dx < -1) p.facing = -1;
  p.lastDir.x = t.dx / t.dist;
  p.lastDir.y = t.dy / t.dist;
  return t;
}

export function tryAttack(kind) {
  if (state.gameOver) return;
  if (kind === 'fire') return startFire();   // fire is held, not tapped
  const p = state.player;
  if (cd[kind] && cd[kind].ready > 0) return;
  const cost = ENERGY_COST[kind] || 0;
  if (p.energy < cost) {
    // not enough energy — fizzle
    sfx.fizzle();
    flashRing(p.x, p.y, 22, '#ffd166');
    return;
  }
  p.energy -= cost;
  p.attackAnim = 0.25;
  p.attackKind = kind;
  // Auto-rotate toward the nearest alien before attacking,
  // so the player just needs to press the button.
  const tgt = autoFaceTarget();
  const stats = SPECIES_STATS[p.species] || SPECIES_STATS.stego;
  if (kind === 'claw') {
    sfx.claw();
    cd.claw.ready = cooldownMax('claw');
    // Combo: swings chained inside COMBO.window escalate; the third is a
    // finisher with more damage, more reach and a shove.
    p.combo = (p.comboT > 0 ? (p.combo || 0) : 0) + 1;
    p.comboT = COMBO.window;
    const finisher = p.combo >= COMBO.hits;
    if (finisher) p.combo = 0;
    const biteBonus = p.species === 'tyranno' && tgt && tgt.dist < 72 ? 1.45 : 1;
    const mul = finisher ? COMBO.finisherMul : 1;
    const reach = finisher ? 72 : 56;
    meleeHit(40, 30, 0, Math.PI*2, Math.round(stats.claw * biteBonus * mul), reach, tgt);
    if (finisher) {
      for (const a of state.aliens) {
        const dx = a.x - p.x, dy = a.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (!a.dead && d < reach + a.r + 12) { a.vx += dx/d * 240; a.vy += dy/d * 240; }
      }
      state.hitStop = Math.max(state.hitStop, 0.08);
      addShake(9);
      notify('Seria!', '#9bd6ff');
    }
    const fxx = tgt ? p.x + (tgt.dx/tgt.dist)*22 : p.x + p.facing*22;
    const fxy = tgt ? p.y + (tgt.dy/tgt.dist)*22 : p.y;
    flashRing(fxx, fxy, finisher ? 48 : 30, finisher ? '#ffe066' : '#9bd6ff');
  } else if (kind === 'tail') {
    sfx.tail();
    cd.tail.ready = cooldownMax('tail');
    // tail swing — all-around thump (diplodoks have the longest reach)
    const reach = p.species === 'diplo' ? 80 : 70;
    meleeHit(60, 60, 0, Math.PI*2, stats.tail, reach, null);
    // Every species shoves with the tail; the diplodocus shoves hardest.
    const push = p.species === 'diplo' ? 300 : 190;
    for (const a of state.aliens) {
      const dx = a.x - p.x, dy = a.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!a.dead && d < reach + a.r + 10) {
        a.vx += dx / d * push;
        a.vy += dy / d * push;
      }
    }
    addShake(6);
    if (p.species === 'stego') {
      p.shield = Math.max(p.shield || 0, 2.5);
      notify('Tarcza stegozaura!', '#9bd6ff');
    }
    flashRing(p.x, p.y, reach - 10, '#fff2a8');
  }
}

// ---------- Fire breath (held) ----------
// Holding the button breathes fire for as long as there is energy, instead of
// one big blast on a one-minute timer. Releasing starts a short cooldown so
// tapping the button does not machine-gun.
export function startFire() {
  if (state.gameOver) return;
  const p = state.player;
  if (p.firing) return;          // key repeat must not restart the roar
  if (cd.fire.ready > 0) return;
  if (p.energy < 8) { sfx.fizzle(); flashRing(p.x, p.y, 22, '#ffd166'); return; }
  p.firing = true;
  p.fireSnd = 0;
  sfx.roar(p.species);
}

export function stopFire() {
  const p = state.player;
  if (!p || !p.firing) return;
  p.firing = false;
  cd.fire.ready = cooldownMax('fire');
}

export function updateFire(dt) {
  const p = state.player;
  if (!p) return;
  if (p.comboT > 0) p.comboT -= dt;
  if (!p.firing) return;
  // Compare against what this frame will actually cost: passive regen trickles
  // a little in every frame, so `energy <= 0` never becomes true on its own.
  const cost = FIRE.drain * dt;
  if (state.gameOver || p.energy < cost) { stopFire(); return; }
  p.energy -= cost;
  p.attackAnim = 0.2;
  p.attackKind = 'fire';
  // Aim at the nearest enemy but leave p.lastDir alone: that is the movement
  // direction the dash uses, and breathing fire must not steer the dash.
  const tgt = findNearestTarget();
  const stats = SPECIES_STATS[p.species] || SPECIES_STATS.stego;

  let dirx, diry;
  if (tgt && tgt.dist < 320) {
    dirx = tgt.dx / tgt.dist; diry = tgt.dy / tgt.dist;
    if (tgt.dx > 1) p.facing = 1; else if (tgt.dx < -1) p.facing = -1;
  } else if (Math.abs(p.lastDir.x) > 0.01 || Math.abs(p.lastDir.y) > 0.01) {
    // `x || facing` treated a legitimate 0 as "no direction", so breathing
    // straight up came out diagonal.
    dirx = p.lastDir.x; diry = p.lastDir.y;
  } else { dirx = p.facing; diry = 0; }
  const ang = Math.atan2(diry, dirx);

  // Fixed rate: this is the damage output, so the performance switch must not
  // change it. Sixty FPS used to mean 77 percent more fire.
  const rate = 34;
  p.fireAcc = (p.fireAcc || 0) + rate * dt;
  while (p.fireAcc >= 1) {
    p.fireAcc -= 1;
    const a = ang + rand(-FIRE.cone, FIRE.cone);
    const sp = rand(230, 340);
    state.projectiles.push({
      kind:'fire', x: p.x + Math.cos(ang)*22, y: p.y + Math.sin(ang)*22,
      vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
      life: FIRE.reach / sp, dmg: stats.fire, r: 10, t: 0
    });
  }
  // Looping crackle, not one sound per particle.
  p.fireSnd = (p.fireSnd || 0) - dt;
  if (p.fireSnd <= 0) { sfx.fire(); p.fireSnd = 0.38; }
  addShake(1.6);
}

export function meleeHit(rangeX, rangeY, _a0, _a1, dmg, radius, tgt) {
  // radius = circular reach around player (auto-aim friendly)
  // If tgt provided and is an alien, force-hit it even if a hair outside radius (forgiving aim).
  const p = state.player;
  const reach = radius || rangeX;
  let any = false;
  for (const a of state.aliens) {
    if (a.dead) continue;
    const dx = a.x - p.x, dy = a.y - p.y;
    const d = Math.hypot(dx, dy);
    const hitR = reach + a.r + 6;
    if (d <= hitR || (tgt && tgt.target === a && d <= hitR + 14)) {
      damageAlien(a, dmg);
      any = true;
    }
  }
  // Scenery takes the same swing: a bush comes apart, a rock needs several.
  if (damageScenery(p.x, p.y, reach, dmg)) any = true;
  // base too — any swing close enough hits the base
  for (const b of state.bases) {
    if (b.dead) continue;
    const dx = b.x - p.x, dy = b.y - p.y;
    if (Math.abs(dx) < b.w/2 + rangeX && Math.abs(dy) < b.h/2 + rangeY) {
      damageBase(b, dmg); any = true;
    }
  }
  return any;
}

// Dash: a short burst in the direction of travel with a few frames of
// invulnerability. Replaces the old jump, which looked nice but did nothing.
export const DASH = { ...DASH_DEFAULTS };
export function tryDash() {
  if (state.gameOver) return;
  const p = state.player;
  if ((p.dashCd || 0) > 0 || (p.dashT || 0) > 0) return;
  let dx = p.lastDir.x, dy = p.lastDir.y;
  if (Math.hypot(dx, dy) < 0.05) { dx = p.facing; dy = 0; }
  const d = Math.hypot(dx, dy) || 1;
  p.vx = dx / d * DASH.speed;
  p.vy = dy / d * DASH.speed;
  p.dashT = DASH.time;
  p.dashCd = DASH.cooldown;
  p.iframes = DASH.iframes;
  sfx.jump();
  addShake(3);
}

export function damagePlayer(dmg) {
  const p = state.player;
  // The end of a run is decided once: a stray shot landing in the same frame
  // as the winning blow must not turn a victory into a defeat.
  if (state.won || state.gameOver) return;
  if ((p.iframes || 0) > 0) return;   // dash makes you briefly untouchable
  if (p.shield > 0) dmg = Math.ceil(dmg * 0.45);
  p.hp -= dmg; p.flash = 0.18;
  sfx.hit();
  damageNumber(p.x, p.y - p.r, dmg, '#ff9a9a');
  state.hitStop = Math.max(state.hitStop, 0.05);
  addShake(7);
  if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { /* not supported */ } }
  if (p.hp <= 0 && !state.gameOver) {
    p.hp = 0;
    state.gameOver = true;
    sfx.lose();
    const name = (SPECIES_STATS[p.species] || SPECIES_STATS.stego).name;
    const beat = recordRun(p.species, state.wave);
    const best = bestFor(p.species);
    const line = beat
      ? `Nowy rekord: fala ${state.wave}!`
      : `Doszedłeś do fali ${state.wave}. Rekord: fala ${best}.`;
    showBanner(`Ojej! ${name} padł 😵<br><small>${line}</small>`, true);
  }
}

export function addXP(n) {
  const p = state.player;
  p.xp += n;
  while (p.xp >= p.xpNeed) {
    p.xp -= p.xpNeed;
    p.level += 1;
    p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20);
    p.xpNeed = Math.round(p.xpNeed * XP_CURVE.growth);
    sfx.levelup();
    flashRing(p.x, p.y, 80, '#9aff9a');
    if (p.level >= 10 && !state.won && !state.gameOver) {
      state.won = true;
      sfx.win();
      recordRun(p.species, state.wave);
      showBanner('🏆 ZWYCIĘSTWO! 🦖<br><small>Osiągnąłeś 10. poziom!</small>', true);
    } else {
      // One card per level: a boss award can cross several thresholds at once.
      state.pendingLevelUps = (state.pendingLevelUps || 0) + 1;
    }
  }
}

