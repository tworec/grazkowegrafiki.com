import { WORLD } from '../config.js';
import { sfx } from '../audio.js';
import { rand, clamp, damp } from '../util.js';
import { state, spawnCoinBurst, flashRing, damageNumber } from '../state.js';
import { addShake } from '../camera.js';
import { pushOutOfRocks } from '../world.js';
import { damagePlayer, addXP } from './player.js';
import { damageAlly } from './allies.js';


export function pickWanderTarget(a) {
  // Wander within ~500 units of where the alien is (or anywhere on a fresh spawn).
  if (a) return { x: clamp(a.x + rand(-500, 500), 60, WORLD.w - 60), y: clamp(a.y + rand(-350, 350), 60, WORLD.h - 60) };
  return { x: rand(WORLD.w*0.10, WORLD.w*0.90), y: rand(WORLD.h*0.18, WORLD.h*0.85) };
}

export function makeAlien(type, x, y) {
  // Personality: ~35% always-chase aggressives, ~65% wanderers that only chase up close.
  // This makes the swarm spread out around the map instead of dogpiling the dino.
  const personality = Math.random() < 0.35 ? 'aggressive' : 'wanderer';
  const common = {
    x, y, vx:0, vy:0, attackCd: 0, facing: -1, flash: 0,
    wob: rand(0,Math.PI*2),
    personality,
    wanderTarget: pickWanderTarget(),
    wanderTimer: rand(2.5, 6)
  };
  if (type === 'big') {
    return Object.assign({type:'big',    r: 26, hp: 60, maxHp: 60, speed: 60, dmg: 14}, common);
  } else if (type === 'walker') {
    return Object.assign({type:'walker', r: 18, hp: 40, maxHp: 40, speed: 80, dmg: 10}, common);
  } else { // small flyer
    return Object.assign({type:'small',  r: 16, hp: 30, maxHp: 30, speed: 95, dmg:  8}, common);
  }
}

export function spawnAlien(fromBase) {
  // Proportions tuned so count × HP ≈ equal across types:
  //   big=60HP @ 22%, walker=40HP @ 33%, flyer=30HP @ 45%
  // (cyclops/big is now rarer; flyers are most common)
  const r = Math.random();
  const kind = r < 0.22 ? 'big' : (r < 0.55 ? 'walker' : 'small');
  const b = fromBase || state.bases.find(bb => !bb.dead) || state.bases[0];
  if (!b) return;
  const bx = b.x, by = b.y + (b.h ? b.h/2 + 10 : 60);
  const a = makeAlien(kind, bx + rand(-90,90), by + rand(0,30));
  state.aliens.push(a);
}

// ---------- Damage ----------
export function damageAlien(a, dmg) {
  a.hp -= dmg;
  sfx.alienHit();
  flashRing(a.x, a.y, 18, '#ff7a7a');
  damageNumber(a.x, a.y - a.r, dmg, '#ffe066');
  a.flash = 0.14;
  // A couple of frames of near-freeze: the hit reads as an impact, not a nudge.
  state.hitStop = Math.max(state.hitStop, 0.04);
  addShake(3.5);
  // knockback
  const p = state.player;
  const dx = a.x - p.x, dy = a.y - p.y;
  const d = Math.hypot(dx,dy)||1;
  a.vx += dx/d * 80; a.vy += dy/d * 80;
  if (a.hp <= 0) killAlien(a);
}

export function killAlien(a) {
  a.dead = true;
  // Cyclop (big) is the heavy-hitter — toughest, hits hardest, rarest. Reward
  // dialled up so taking one down is a clearly profitable event.
  //   flyer 12 $ baseline
  //   walker ≈ 2× flyer
  //   big ≈ 7× flyer
  const reward = a.type === 'big' ? 85 : (a.type === 'walker' ? 22 : 12);
  const xp     = a.type === 'big' ? 70 : (a.type === 'walker' ? 22 : 10);
  spawnCoinBurst(a.x, a.y, reward);
  addXP(xp);
  // burst FX
  for (let i=0;i<10;i++) {
    const ang = rand(0, Math.PI*2), sp = rand(60, 180);
    state.fx.push({kind:'puff', x:a.x, y:a.y, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, life:0.5, t:0, color:'#9b7'});
  }
}

// ---------- AI ----------
export function updateAlien(a, dt) {
  const p = state.player;
  a.wob += dt * 2;
  a.wanderTimer = (a.wanderTimer || 0) - dt;

  // Find closest reachable target (player or ally) — used for distance & attack.
  let closest = p, bestD = Math.hypot(p.x - a.x, p.y - a.y);
  for (const al of state.allies) {
    if (al.dead) continue;
    const d = Math.hypot(al.x - a.x, al.y - a.y);
    if (d < bestD) { bestD = d; closest = al; }
  }

  // Decide what we're walking toward this frame:
  // - aggressives chase if anything is within 520 px (basically always)
  // - wanderers only chase when something is within 220 px; otherwise stroll to a point
  const aggroRange = a.personality === 'aggressive' ? 520 : 220;
  const inAggro = bestD < aggroRange;

  let goalX, goalY;
  if (inAggro) {
    goalX = closest.x; goalY = closest.y;
  } else {
    // wandering: pick a new spot when we arrive or get bored
    const wt = a.wanderTarget;
    if (!wt || a.wanderTimer <= 0 || Math.hypot(wt.x - a.x, wt.y - a.y) < 35) {
      a.wanderTarget = pickWanderTarget(a);
      a.wanderTimer = rand(2.5, 6);
    }
    goalX = a.wanderTarget.x; goalY = a.wanderTarget.y;
  }

  const dx = goalX - a.x, dy = goalY - a.y;
  const d = Math.hypot(dx, dy) || 1;
  let ax = dx/d, ay = dy/d;
  // signature wobble per-type
  if (a.type === 'small') {
    ax += Math.cos(a.wob)*0.5; ay += Math.sin(a.wob*1.3)*0.5;
  } else {
    ax += Math.cos(a.wob*0.7)*0.2; ay += Math.sin(a.wob*0.5)*0.2;
  }
  const m = Math.hypot(ax,ay)||1; ax/=m; ay/=m;
  // Wanderers move at half speed (they're meandering, not charging)
  const speedMul = inAggro ? 1.0 : 0.55;
  a.vx += (ax * a.speed * speedMul - a.vx) * Math.min(1, dt*3);
  a.vy += (ay * a.speed * speedMul - a.vy) * Math.min(1, dt*3);
  // damping
  { const d = damp(0.96, dt); a.vx *= d; a.vy *= d; }
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  // Facing with a dead zone, so an alien drifting sideways does not flicker.
  if (a.vx < -8) a.facing = -1; else if (a.vx > 8) a.facing = 1;
  if (a.flash > 0) a.flash -= dt;
  // flyers fly over rocks; walkers and big are blocked
  if (a.type !== 'small') pushOutOfRocks(a);
  // keep aliens on screen too
  a.x = clamp(a.x, a.r, WORLD.w - a.r);
  a.y = clamp(a.y, a.r, WORLD.h - a.r);

  // attack only matters if our closest target is actually within striking range
  a.attackCd -= dt;
  if (inAggro && bestD < closest.r + a.r + 4 && a.attackCd <= 0) {
    if (closest === p) damagePlayer(a.dmg);
    else damageAlly(closest, a.dmg);
    a.attackCd = 1.0;
  }
}
