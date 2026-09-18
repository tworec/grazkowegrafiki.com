import { perf } from '../view.js';
import { sfx } from '../audio.js';
import { showBanner } from '../hud.js';
import { SPECIES_STATS, ENERGY_COST } from '../config.js';
import { rand } from '../util.js';
import { state, notify, flashRing } from '../state.js';
import { damageAlien } from './aliens.js';
import { damageBase } from './bases.js';


// ---------- Cooldowns & energy costs ----------
export const cd = { claw:{ready:0,max:0.5}, tail:{ready:0,max:10}, fire:{ready:0,max:60} };
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
  if (!best) {
    // fallback: target the base if alive
    for (const b of state.bases) {
      if (b.dead) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bestD) { bestD = d; best = b; }
    }
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
    // melee toward the nearest alien (not just the side we face)
    const biteBonus = p.species === 'tyranno' && tgt && tgt.dist < 72 ? 1.45 : 1;
    meleeHit(40, 30, 0, Math.PI*2, Math.round(stats.claw * biteBonus), /*radius*/ 56, tgt);
    const fxx = tgt ? p.x + (tgt.dx/tgt.dist)*22 : p.x + p.facing*22;
    const fxy = tgt ? p.y + (tgt.dy/tgt.dist)*22 : p.y;
    flashRing(fxx, fxy, 30, '#9bd6ff');
  } else if (kind === 'tail') {
    sfx.tail();
    cd.tail.ready = cooldownMax('tail');
    // tail swing — all-around thump (diplodoks have the longest reach)
    const reach = p.species === 'diplo' ? 80 : 70;
    meleeHit(60, 60, 0, Math.PI*2, stats.tail, reach, null);
    if (p.species === 'diplo') {
      for (const a of state.aliens) {
        const dx = a.x - p.x, dy = a.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (!a.dead && d < reach + a.r + 10) {
          a.vx += dx / d * 180;
          a.vy += dy / d * 180;
        }
      }
    }
    if (p.species === 'stego') {
      p.shield = Math.max(p.shield || 0, 2.5);
      notify('Tarcza stegozaura!', '#9bd6ff');
    }
    flashRing(p.x, p.y, reach - 10, '#fff2a8');
  } else if (kind === 'fire') {
    sfx.fire();
    cd.fire.ready = cooldownMax('fire');
    // fire breath toward nearest alien (or facing direction if none)
    let dirx, diry;
    if (tgt) { dirx = tgt.dx / tgt.dist; diry = tgt.dy / tgt.dist; }
    else { dirx = p.lastDir.x || p.facing; diry = p.lastDir.y || 0; }
    const ang = Math.atan2(diry, dirx);
    const shots = perf.lowPower ? 8 : 14;
    for (let i=0;i<shots;i++) {
      const a = ang + rand(-0.35, 0.35);
      const sp = rand(220, 320);
      state.projectiles.push({
        kind:'fire', x: p.x + Math.cos(ang)*22, y: p.y + Math.sin(ang)*22,
        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
        life: 0.55, dmg: stats.fire, r: 10, t: 0
      });
    }
  }
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

export function tryJump() {
  if (state.gameOver) return;
  const p = state.player;
  if (p.jump <= 0) {
    p.jump = 0.5;
    sfx.jump();
  }
}

export function damagePlayer(dmg) {
  const p = state.player;
  if (p.shield > 0) dmg = Math.ceil(dmg * 0.45);
  p.hp -= dmg; p.flash = 0.18;
  sfx.hit();
  if (p.hp <= 0 && !state.gameOver) {
    p.hp = 0;
    state.gameOver = true;
    sfx.lose();
    const name = (SPECIES_STATS[p.species] || SPECIES_STATS.stego).name;
      showBanner(`Ojej! ${name} padł 😵<br><small>Spróbujcie jeszcze raz!</small>`, true);
  }
}

export function addXP(n) {
  const p = state.player;
  p.xp += n;
  while (p.xp >= p.xpNeed) {
    p.xp -= p.xpNeed;
    p.level += 1;
    p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20);
    p.xpNeed = Math.round(p.xpNeed * 1.6);
    sfx.levelup();
    flashRing(p.x, p.y, 80, '#9aff9a');
    if (p.level >= 10 && !state.won && !state.gameOver) {
      state.won = true;
      sfx.win();
      showBanner('🏆 ZWYCIĘSTWO! 🦖<br><small>Osiągnąłeś 10. poziom!</small>', true);
    }
  }
}

export function tryAutoUpgrade() {
  const p = state.player;
  const up = p.upgrades;
  if (p.money < 40) return false;
  const choices = [
    {key:'hp',       max:4, label:'+HP', apply: () => { p.maxHp += 25; p.hp = p.maxHp; }},
    {key:'energy',   max:3, label:'+ENERGIA', apply: () => { p.maxEnergy += 15; p.energy = p.maxEnergy; }},
    {key:'cooldown', max:4, label:'SZYBSZE ATAKI', apply: () => {}},
    {key:'ally',     max:3, label:'SILNIEJSZE STADO', apply: () => {
      for (const al of state.allies) al.dmg += 1;
    }}
  ];
  choices.sort((a, b) => up[a.key] - up[b.key]);
  const pick = choices.find(c => up[c.key] < c.max);
  if (!pick) return false;
  p.money -= 40;
  up[pick.key] += 1;
  pick.apply();
  sfx.levelup();
  flashRing(p.x, p.y, 90, '#ffd166');
  notify('Ulepszenie: ' + pick.label, '#ffd166');
  return true;
}
