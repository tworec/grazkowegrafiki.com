import { W, H } from '../view.js';
import { sfx } from '../audio.js';
import { rand, clamp, damp } from '../util.js';
import { state, flashRing } from '../state.js';
import { pushOutOfRocks } from '../world.js';
import { damageAlien } from './aliens.js';
import { damageBase } from './bases.js';


export function makeAlly(x, y, species) {
  // small dino sidekick — auto-attacks aliens, low HP
  const allyUp = state.player && state.player.upgrades ? state.player.upgrades.ally : 0;
  return {
    x, y, vx: 0, vy: 0,
    r: 14, hp: 25, maxHp: 25,
    speed: 150, dmg: 3 + allyUp, attackCd: 0,
    bob: rand(0, Math.PI*2), facing: 1, flash: 0,
    species: species || null,
    jump: 0, attackAnim: 0, attackKind: null,
    walkPhase: 0
  };
}

export function damageAlly(al, dmg) {
  al.hp -= dmg; al.flash = 0.18;
  sfx.hit();
  if (al.hp <= 0) {
    al.dead = true;
    // small puff
    for (let i=0;i<6;i++) {
      const ang = rand(0, Math.PI*2), sp = rand(40, 120);
      state.fx.push({kind:'puff', x:al.x, y:al.y, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, life:0.4, t:0, color:'#9b7'});
    }
  }
}

export function updateAlly(al, dt) {
  al.bob = (al.bob || 0) + dt * 6;
  if (al.flash > 0) al.flash -= dt;
  // Find nearest alien (or base if no aliens)
  let target = null, bestD = Infinity;
  for (const a of state.aliens) {
    if (a.dead) continue;
    const d = Math.hypot(a.x - al.x, a.y - al.y);
    if (d < bestD) { bestD = d; target = a; }
  }
  let attackingBase = false;
  if (!target) {
    for (const b of state.bases) {
      if (b.dead) continue;
      const d = Math.hypot(b.x - al.x, b.y - al.y);
      if (d < bestD) { bestD = d; target = b; attackingBase = true; }
    }
  }

  let dx = 0, dy = 0;
  if (target) {
    dx = target.x - al.x; dy = target.y - al.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = al.r + (target.r || 30) + 4;
    if (d > reach) {
      al.vx += (dx/d * al.speed - al.vx) * Math.min(1, dt*4);
      al.vy += (dy/d * al.speed - al.vy) * Math.min(1, dt*4);
    } else {
      { const d = damp(0.85, dt); al.vx *= d; al.vy *= d; }
      al.attackCd -= dt;
      if (al.attackCd <= 0) {
        al.attackCd = 0.9;
        if (attackingBase) damageBase(target, al.dmg);
        else damageAlien(target, al.dmg);
        // little snap visual
        flashRing(al.x + (dx/d)*8, al.y + (dy/d)*8, 14, '#bff5bf');
      }
    }
    if (dx > 1) al.facing = 1; else if (dx < -1) al.facing = -1;
  } else {
    // no target — follow player
    const p = state.player;
    const fdx = p.x - al.x, fdy = p.y - al.y;
    const d = Math.hypot(fdx, fdy);
    if (d > 70) {
      al.vx += (fdx/d * al.speed*0.6 - al.vx) * Math.min(1, dt*3);
      al.vy += (fdy/d * al.speed*0.6 - al.vy) * Math.min(1, dt*3);
    } else { const d = damp(0.9, dt); al.vx *= d; al.vy *= d; }
  }
  { const d = damp(0.92, dt); al.vx *= d; al.vy *= d; }
  al.x += al.vx * dt;
  al.y += al.vy * dt;
  pushOutOfRocks(al);
  al.x = clamp(al.x, al.r, W - al.r);
  al.y = clamp(al.y, al.r + 60, H - al.r);
  // walk cycle for limb animation
  const sp = Math.hypot(al.vx, al.vy);
  if (sp > 20) al.walkPhase = (al.walkPhase || 0) + dt * Math.min(2 + sp/100, 8);
}
