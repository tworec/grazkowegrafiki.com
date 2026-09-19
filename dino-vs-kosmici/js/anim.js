import { state } from './state.js';
import { rand } from './util.js';

// ---------- Animation machine ----------
// One small state object per character (player, allies, aliens). The point is
// that the walk cycle is driven by DISTANCE TRAVELLED, not by a timer: feet
// plant where they touch the ground instead of sliding, and the same code
// gives a slow diplodocus and a fast flyer a believable cadence.

// World units per half-step (one foot plant). Roughly the stride length of the
// sprite, so the cycle reads at the size the dino is actually drawn.
const STEP_LEN = 52;

export function makeAnim(facing) {
  return {
    phase: 0,        // 0..1 within the current half-step
    step: 0,         // how many half-steps taken (integer, grows)
    // Seeded from the entity so a fresh spawn does not play a turn on its
    // first frames; the tween is for turns that actually happen.
    facing: facing === -1 ? -1 : 1,
    lean: 0,         // radians, body tips into the direction of travel
    squash: 0,       // >0 right after a foot plant, decays
    breathe: rand(0, Math.PI * 2),
    landed: 0        // set on plant, used for the dust puff
  };
}

function ensure(e) {
  if (!e.anim) e.anim = makeAnim(e.facing);
  return e.anim;
}

// dustColor: null disables the puff (flyers, robots).
export function updateAnim(e, dt, opts) {
  const a = ensure(e);
  const o = opts || {};
  const sp = Math.hypot(e.vx || 0, e.vy || 0);
  const moving = sp > 25;

  // Walk phase from distance covered.
  if (moving) {
    const before = a.phase;
    a.phase += (sp * dt) / STEP_LEN;
    if (a.phase >= 1) {
      const steps = Math.floor(a.phase);
      a.phase -= steps;
      a.step += steps;
      // Foot plant: squash impulse + a puff of dust under the feet.
      a.squash = 1;
      a.landed = 1;
      if (o.dust !== false && state.fx.length < 220) {
        for (let i = 0; i < 2; i++) {
          state.fx.push({
            kind: 'dust', x: e.x + rand(-6, 6), y: e.y + (e.r || 16) * 0.7,
            vx: -(e.vx || 0) * 0.12 + rand(-14, 14), vy: rand(-18, -4),
            r: rand(2.2, 4.2) * (o.scale || 1), life: 0.35, t: 0
          });
        }
      }
      if (before < 1) a.justLanded = true;
    }
  } else {
    // Ease back to a neutral stance instead of freezing mid-stride.
    a.phase += (0 - a.phase) * Math.min(1, dt * 6);
    a.breathe += dt * 1.7;
  }

  // Squash decays quickly (≈0.13 s).
  a.squash = Math.max(0, a.squash - dt * 7.5);

  // Facing tween: ~80 ms to flip, so the sprite rolls over instead of popping.
  const want = e.facing === -1 ? -1 : 1;
  const k = Math.min(1, dt * 14);
  a.facing += (want - a.facing) * k;
  if (Math.abs(a.facing - want) < 0.01) a.facing = want;

  // Lean into the movement (capped), decaying to upright when standing.
  const wantLean = moving ? Math.max(-1, Math.min(1, (e.vx || 0) / 260)) * 0.10 : 0;
  a.lean += (wantLean - a.lean) * Math.min(1, dt * 7);

  return a;
}

// Vertical bob and squash/stretch for the current animation state.
// Returns {bob, sx, sy, rot} in sprite-local units.
export function animPose(e, moving) {
  const a = ensure(e);
  // Two bobs per half-step: body is lowest at the plant, highest mid-stride.
  const bobPhase = a.phase * Math.PI * 2;
  const bob = moving ? -Math.abs(Math.sin(bobPhase)) * 2.2 + 1.1 : Math.sin(a.breathe) * 0.5;
  // Impulse: wide + short right after the plant, easing out.
  const q = a.squash * a.squash;
  const breath = moving ? 0 : Math.sin(a.breathe) * 0.012;
  return {
    bob,
    sx: 1 + q * 0.07,
    sy: 1 - q * 0.08 + breath,
    rot: a.lean
  };
}

// Attack shaping: a quick lunge along the strike direction with a recoil.
// t goes 1 → 0 over the attack window; returns a forward offset in units.
export function attackLunge(t) {
  if (t <= 0) return 0;
  const p = 1 - t;                   // 0 at the start, 1 at the end
  if (p < 0.3) return (p / 0.3) * 9; // strike out
  return (1 - (p - 0.3) / 0.7) * 9;  // ease back
}
