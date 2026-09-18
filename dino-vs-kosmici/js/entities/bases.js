import { WORLD } from '../config.js';
import { sfx, music } from '../audio.js';
import { DIFFICULTY } from '../config.js';
import { rand, clamp } from '../util.js';
import { state, difficultyKey, notify, spawnCoinBurst, flashRing } from '../state.js';
import { addXP } from './player.js';


export function makeBase(x, y, tier) {
  const d = DIFFICULTY[difficultyKey] || DIFFICULTY.normal;
  function tuned(b) {
    b.hp = Math.round(b.hp * d.hpMul);
    b.maxHp = b.hp;
    b.dmg = Math.round((b.dmg || 8) * d.dmgMul);
    b.ruin = null;
    return b;
  }
  tier = tier || 'main';
  if (tier === 'main') {
    // The HQ — the biggest, toughest one
    return tuned({x, y, w:160, h:80, hp:700, maxHp:700, eggs:3, fireCd: 0,
            tier, dmg: 8, fireRate: 2.6, color: '#4f7fb5', dark: '#2c5990', cones: 5});
  } else if (tier === 'secondary') {
    return tuned({x, y, w:110, h:60, hp:260, maxHp:260, eggs:1, fireCd: rand(1, 3),
            tier, dmg: 6, fireRate: 3.6, color: '#3f6585', dark: '#1f4060', cones: 3});
  } else { // tertiary or any further
    return tuned({x, y, w:90, h:50, hp:160, maxHp:160, eggs:1, fireCd: rand(1, 3),
            tier, dmg: 5, fireRate: 4.4, color: '#2f5070', dark: '#162a45', cones: 2});
  }
}

export function damageBase(b, dmg) {
  b.hp -= dmg;
  sfx.alienHit();
  flashRing(b.x, b.y, 30, '#ff7a7a');
  if (b.hp <= 0 && !b.dead) {
    b.dead = true;
    b.deadAt = performance.now(); // wall-clock so the anim plays even after win freezes update()
    b.ruin = [];
    for (let i=0;i<8;i++) b.ruin.push({x:rand(-b.w/2, b.w/2), y:rand(-b.h/2, b.h/2), r:rand(3, 5)});
    const isMain = b.tier === 'main';
    const reward = isMain ? 100 : 50;
    const xp     = isMain ? 80 : 40;
    spawnCoinBurst(b.x, b.y, reward);
    addXP(xp);
    // free the eggs!
    for (let i=0;i<b.eggs;i++) {
      const ex = b.x+rand(-30,30), ey = b.y+rand(-15,15);
      state.fx.push({kind:'egg', x:ex, y:ey, groundY: ey + rand(30, 70),
                     vx:rand(-30,30), vy:rand(-100,-40), life:2.5, t:0});
    }
    // Check if ALL bases (main + secondaries) are gone — start the next wave
    const allDead = state.bases.every(bb => bb.dead);
    if (allDead) {
      sfx.win();
      music.combat();
      state.wave = (state.wave || 1) + 1;
      state.nextWaveAt = state.t + 3.0;
      notify(`FALA ${state.wave} nadlatuje — większa baza!`, '#ffd166');
    } else {
      sfx.coin();
      notify(isMain ? 'KWATERA GŁÓWNA padła!' : 'Baza kosmitów zniszczona!', '#9aff9a');
    }
  }
}

export function updateBase(b, dt) {
  if (b.dead) return;
  b.fireCd -= dt;
  if (b.aiming) {
    b.aiming -= dt;
    if (b.aiming > 0) return;
    b.aiming = 0;
    b.fireCd = b.fireRate || 2.6;
    // shoot a slow plasma ball at player
    const p = state.player;
    const dx = p.x - b.x, dy = p.y - b.y;
    const d = Math.hypot(dx,dy)||1;
    state.projectiles.push({
      kind:'plasma', x: b.x, y: b.y + 20,
      vx: dx/d*180, vy: dy/d*180,
      life: 4, r: 8, dmg: b.dmg || 8, t: 0, hostile: true
    });
  } else if (b.fireCd <= 0) {
    b.aiming = 0.35;
    sfx.alarm();
  }
}

export function spawnNextWaveBase() {
  const wave = state.wave || 2;
  const hpMul  = 1 + (wave - 1) * 0.55;
  const dmgMul = 1 + (wave - 1) * 0.22;
  const sizeMul = 1 + (wave - 1) * 0.12;
  const p = state.player;
  let bx, by, tries = 0;
  do {
    bx = rand(160, WORLD.w - 160);
    by = rand(160, WORLD.h - 160);
    tries++;
  } while (tries < 80 && (
    Math.hypot(bx - p.x, by - p.y) < WORLD.w * 0.35 ||
    !canPlaceReinforcementBase(bx, by)
  ));
  const base = makeBase(bx, by, 'main');
  base.w = Math.round(base.w * sizeMul);
  base.h = Math.round(base.h * sizeMul);
  base.hp = Math.round(base.hp * hpMul);
  base.maxHp = base.hp;
  base.dmg = Math.round(base.dmg * dmgMul);
  base.eggs = 3 + wave;
  state.bases.push(base);
  flashRing(bx, by, 110, '#ffd166');
  notify(`FALA ${wave}! Nowa kwatera główna!`, '#ffd166');
  sfx.alienHit();
  music.combat();
}

export function spawnBaseFromAlienCluster(tier, message) {
  const cluster = findAlienCluster(5, 130);
  if (!cluster) return false;
  const x = clamp(cluster.x, 120, WORLD.w - 120);
  const y = clamp(cluster.y, 120, WORLD.h - 120);
  if (!canPlaceReinforcementBase(x, y)) return false;
  const nb = makeBase(x, y, tier);
  state.bases.push(nb);
  for (const a of cluster.members.slice(0, 5)) {
    a.dead = true;
    state.fx.push({kind:'puff', x:a.x, y:a.y, vx:rand(-45,45), vy:rand(-90,-35), life:0.5, t:0, color:'#9b7'});
  }
  state.aliens = state.aliens.filter(a => !a.dead);
  flashRing(nb.x, nb.y, 85, '#ffd166');
  notify(message, '#ffd166');
  sfx.alienHit();
  return true;
}

export function findAlienCluster(minCount, radius) {
  let best = null;
  for (const a of state.aliens) {
    if (a.dead) continue;
    const members = [];
    let sx = 0, sy = 0;
    for (const b of state.aliens) {
      if (b.dead) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= radius) {
        members.push(b);
        sx += b.x; sy += b.y;
      }
    }
    if (members.length >= minCount && (!best || members.length > best.members.length)) {
      best = {members, x: sx / members.length, y: sy / members.length};
    }
  }
  return best;
}

export function canPlaceReinforcementBase(x, y) {
    let ok = true;
    for (const b of state.bases) {
      if (Math.abs(x - b.x) < (b.w||120)/2 + 80 && Math.abs(y - b.y) < (b.h||60)/2 + 50) { ok = false; break; }
    }
    if (ok && state.helipad && Math.hypot(x - state.helipad.x, y - state.helipad.y) < state.helipad.r + 60) ok = false;
    if (ok && state.upgradePad && Math.hypot(x - state.upgradePad.x, y - state.upgradePad.y) < 80) ok = false;
    if (ok && state.allyPad && Math.hypot(x - state.allyPad.x, y - state.allyPad.y) < 80) ok = false;
    return ok;
}
