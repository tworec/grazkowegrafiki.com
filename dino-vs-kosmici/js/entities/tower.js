import { state, flashRing, damageNumber, notify, spawnCoinBurst } from '../state.js';
import { sfx } from '../audio.js';

// The tower art is 135 × 256 px and is drawn 112 units high. Share its drawn
// rectangle with combat instead of treating the tall machine as a tiny circle
// only at its feet.
export function towerBox(t) {
  const h = 112;
  const w = h * 135 / 256;
  const top = t.y - h * 0.96;
  return {x:t.x, y:t.y, w, h, left:t.x - w / 2, right:t.x + w / 2,
          top, bottom:top + h, aimY:t.y - 55, muzzleY:t.y - 62};
}

export function towerHitDistance(t, x, y) {
  const b = towerBox(t);
  const dx = Math.max(b.left - x, 0, x - b.right);
  const dy = Math.max(b.top - y, 0, y - b.bottom);
  return Math.hypot(dx, dy);
}

export function makeTower(x, y) {
  return {x, y, r: 19, hp: 120, maxHp: 120, fireCd: 1.0,
          aiming: 0, flash: 0, dead: false};
}

export function damageTower(t, dmg) {
  if (!t || t.dead) return false;
  t.hp = Math.max(0, t.hp - dmg);
  t.flash = 0.16;
  damageNumber(t.x, t.y - 74, dmg, '#b9ebff');
  sfx.alienHit();
  if (t.hp === 0) {
    t.dead = true;
    t.aiming = 0;
    // The tower is also a movement obstacle; remove the exact object when it falls.
    state.obstacles = (state.obstacles || []).filter(o => o !== t);
    spawnCoinBurst(t.x, t.y, 24);
    flashRing(t.x, t.y - 45, 75, '#83dcff');
    notify('Armatka zniszczona!', '#b9ebff');
  }
  return true;
}

export function updateTower(t, dt) {
  if (!t || t.dead) return;
  t.flash = Math.max(0, t.flash - dt);
  const p = state.player;
  const dx = p.x - t.x, dy = p.y - t.y;
  const d = Math.hypot(dx, dy);
  if (d > 520) {
    t.aiming = 0;
    t.fireCd = Math.max(0, t.fireCd - dt);
    return;
  }
  if (t.aiming > 0) {
    t.aiming -= dt;
    if (t.aiming > 0) return;
    t.aiming = 0;
    t.fireCd = 2.2;
    const muzzleY = towerBox(t).muzzleY;
    const shotDx = p.x - t.x, shotDy = p.y - muzzleY;
    const shotD = Math.hypot(shotDx, shotDy) || 1;
    const speed = 300;
    state.projectiles.push({kind:'plasma', x:t.x, y:muzzleY,
      vx:shotDx / shotD * speed, vy:shotDy / shotD * speed,
      life:2.2, r:10, dmg:12, t:0, hostile:true});
    flashRing(t.x, muzzleY, 25, '#80dfff');
  } else {
    t.fireCd -= dt;
    if (t.fireCd <= 0) {
      t.aiming = 0.55;
      sfx.alarm();
    }
  }
}
