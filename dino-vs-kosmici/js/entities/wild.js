import { WORLD } from '../config.js';
import { rand, clamp } from '../util.js';
import { state, notify, flashRing } from '../state.js';
import { sfx } from '../audio.js';
import { inView } from '../camera.js';
import { makeAlly } from './allies.js';
import { updateAnim } from '../anim.js';

// ---------- Wild dinosaurs ----------
// Instead of buying a herd from a pad, grown dinosaurs wander in on their own,
// pick a tree and settle under it. Walk up with enough money and one joins you.
// Antoś's idea: getting a companion should be an event you go and find, not a
// button you press whenever you can afford it.

export const WILD = {
  price: 70,
  maxWaiting: 2,        // at most this many are sitting around unclaimed
  firstAt: 20,          // seconds into the run before the first one shows up
  every: [45, 80],      // gap between arrivals
  hireRange: 58
};

export function spawnWild() {
  // Settle under a tree the player cannot currently see, so one never pops
  // into existence in front of them.
  const candidates = state.trees.filter(t => t.v !== 'bush' && !inView(t.x, t.y, 200));
  if (!candidates.length) return null;
  const tree = candidates[Math.floor(Math.random() * candidates.length)];

  // Walk in from the nearest map edge, so it reads as arriving rather than
  // appearing. The tree is the destination it sits down under.
  const left = tree.x, right = WORLD.w - tree.x, top = tree.y, bottom = WORLD.h - tree.y;
  const m = Math.min(left, right, top, bottom);
  let x, y;
  if (m === left)        { x = 20;             y = clamp(tree.y + rand(-200, 200), 40, WORLD.h - 40); }
  else if (m === right)  { x = WORLD.w - 20;   y = clamp(tree.y + rand(-200, 200), 40, WORLD.h - 40); }
  else if (m === top)    { y = 20;             x = clamp(tree.x + rand(-200, 200), 40, WORLD.w - 40); }
  else                   { y = WORLD.h - 20;   x = clamp(tree.x + rand(-200, 200), 40, WORLD.w - 40); }

  const species = ['tyranno', 'stego', 'diplo'][Math.floor(Math.random() * 3)];
  const w = {
    x, y, vx: 0, vy: 0, r: 19, facing: 1,
    species,
    scale: 0.72,
    spot: { x: tree.x + rand(-18, 18), y: tree.y + 12 },
    sitting: false,
    price: WILD.price,
    glow: 0
  };
  state.wild.push(w);
  notify('Dziki dinozaur szuka miejsca pod drzewem', '#9aff9a');
  return w;
}

export function updateWild(dt) {
  const p = state.player;

  // Arrivals
  state.wildAt = state.wildAt == null ? WILD.firstAt : state.wildAt;
  if (state.t >= state.wildAt) {
    if (state.wild.length < WILD.maxWaiting && state.trees.length) spawnWild();
    state.wildAt = state.t + rand(WILD.every[0], WILD.every[1]);
  }

  for (const w of state.wild) {
    if (!w.sitting) {
      const dx = w.spot.x - w.x, dy = w.spot.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        w.sitting = true;
        w.vx = w.vy = 0;
      } else {
        const sp = 120;
        w.vx += (dx / d * sp - w.vx) * Math.min(1, dt * 3);
        w.vy += (dy / d * sp - w.vy) * Math.min(1, dt * 3);
        w.x += w.vx * dt; w.y += w.vy * dt;
        if (w.vx < -8) w.facing = -1; else if (w.vx > 8) w.facing = 1;
      }
    } else {
      w.vx = w.vy = 0;
      // Face whoever is approaching, so it reads as noticing you.
      if (Math.hypot(p.x - w.x, p.y - w.y) < 180) w.facing = p.x < w.x ? -1 : 1;
    }
    updateAnim(w, dt, { dust: !w.sitting, scale: 0.7 });

    const near = Math.hypot(p.x - w.x, p.y - w.y) < WILD.hireRange + p.r;
    w.glow = near ? Math.min(1, (w.glow || 0) + dt * 4) : Math.max(0, (w.glow || 0) - dt * 3);
    if (near && w.sitting && p.money >= w.price) hire(w);
  }
  state.wild = state.wild.filter(w => !w.taken);
}

function hire(w) {
  const p = state.player;
  p.money -= w.price;
  w.taken = true;
  const ally = makeAlly(w.x, w.y, w.species, true);
  ally.facing = w.facing;
  state.allies.push(ally);
  sfx.herd ? sfx.herd() : sfx.coin();
  flashRing(w.x, w.y, 70, '#9aff9a');
  notify('Dinozaur dołączył do stada!', '#9aff9a');
}
