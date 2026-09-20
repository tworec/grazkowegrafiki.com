import { WORLD, XP_REWARD } from '../config.js';
import { sfx } from '../audio.js';
import { rand, clamp, damp } from '../util.js';
import { state, spawnCoinBurst, flashRing, damageNumber, notify } from '../state.js';
import { addShake } from '../camera.js';
import { pushOutOfRocks } from '../world.js';
import { damagePlayer, addXP } from './player.js';
import { damageAlly } from './allies.js';


export function pickWanderTarget(a) {
  // A patrol circles the patch it was posted to; anything else wanders from
  // wherever it happens to be. Without a home a group slowly drifts off the
  // route the player walks, which is exactly where we want it to stay.
  if (a && a.home) {
    return { x: clamp(a.home.x + rand(-260, 260), 60, WORLD.w - 60),
             y: clamp(a.home.y + rand(-200, 200), 60, WORLD.h - 60) };
  }
  if (a) return { x: clamp(a.x + rand(-500, 500), 60, WORLD.w - 60), y: clamp(a.y + rand(-350, 350), 60, WORLD.h - 60) };
  return { x: rand(WORLD.w*0.10, WORLD.w*0.90), y: rand(WORLD.h*0.18, WORLD.h*0.85) };
}

// A group posted between the bases so the walk across the map has something
// in it. Patrols sit outside the per-base spawn budget, so they never starve
// the fight at the base.
let patrolSeq = 0;
export function spawnPatrol(x, y, wave) {
  const id = ++patrolSeq;
  const pool = ['walker', 'small', 'walker', 'big'];
  if ((wave || 1) >= 2) pool.push('shooter');
  if ((wave || 1) >= 3) pool.push('charger');
  const n = 2 + Math.floor(Math.random() * 3);
  const made = [];
  for (let i = 0; i < n; i++) {
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const a = makeAlien(kind, x + rand(-70, 70), y + rand(-50, 50));
    a.patrol = true;
    a.patrolId = id;          // group identity: headcount alone cannot tell
    a.home = { x, y };        // one 4-alien group from two 2-alien ones

    a.personality = 'wanderer';     // they guard the spot, not hunt the map
    a.wanderTarget = pickWanderTarget(a);
    state.aliens.push(a);
    made.push(a);
  }
  return made;
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
  } else if (type === 'shooter') {
    // Keeps its distance and lobs shots — you have to close in or dodge.
    return Object.assign({type:'shooter', r: 17, hp: 34, maxHp: 34, speed: 70, dmg: 9,
                          shootCd: rand(0.8, 2.2), keepAway: rand(170, 230)}, common);
  } else if (type === 'charger') {
    // Winds up, then bolts in a straight line. Telegraphed, so it is dodgeable.
    return Object.assign({type:'charger', r: 19, hp: 46, maxHp: 46, speed: 70, dmg: 16,
                          windup: 0, charge: 0, chargeCd: rand(1, 3), cx: 0, cy: 0}, common);
  } else if (type === 'shield') {
    // Armoured from the front: hit it in the back or shove it around first.
    return Object.assign({type:'shield', r: 22, hp: 90, maxHp: 90, speed: 52, dmg: 12,
                          armor: 0.25}, common);
  } else if (type === 'boss') {
    // End-of-wave brute: slow, heavy, slams the ground in a ring.
    // personality AFTER the spread: `common` carries a random one and would
    // otherwise overwrite it, leaving most bosses wandering.
    return Object.assign({type:'boss', r: 44, hp: 420, maxHp: 420, speed: 46, dmg: 22,
                          slamCd: 3.5, slamWind: 0}, common, {personality: 'aggressive'});
  } else { // small flyer
    return Object.assign({type:'small',  r: 16, hp: 30, maxHp: 30, speed: 95, dmg:  8}, common);
  }
}

export function spawnAlien(fromBase) {
  // Proportions tuned so count × HP ≈ equal across types:
  //   big=60HP @ 22%, walker=40HP @ 33%, flyer=30HP @ 45%
  // (cyclops/big is now rarer; flyers are most common)
  // The roster widens as the waves go on, so the fight keeps changing.
  const wave = state.wave || 1;
  const pool = ['small', 'small', 'walker', 'walker', 'big'];
  if (wave >= 2) pool.push('shooter', 'shooter');
  if (wave >= 3) pool.push('charger', 'charger');
  if (wave >= 4) pool.push('shield');
  const kind = pool[Math.floor(Math.random() * pool.length)];
  const b = fromBase || state.bases.find(bb => !bb.dead) || state.bases[0];
  if (!b) return;
  const bx = b.x, by = b.y + (b.h ? b.h/2 + 10 : 60);
  const a = makeAlien(kind, bx + rand(-90,90), by + rand(0,30));
  state.aliens.push(a);
}

// ---------- Damage ----------
// `src` is whoever landed the hit (player by default, but allies hit too);
// the armour check has to use the real attacker or the front/back rule lies.
export function damageAlien(a, dmg, src) {
  const attacker = src || state.player;
  // Armoured types soak hits that land on the shielded (facing) side.
  if (a.armor) {
    const fromFront = Math.sign(attacker.x - a.x) === Math.sign(a.facing || 1);
    if (fromFront) {
      dmg = Math.max(1, Math.round(dmg * a.armor));
      flashRing(a.x + (a.facing || 1) * a.r, a.y, 14, '#9fd0ff');
    }
  }
  a.hp -= dmg;
  sfx.alienHit();
  flashRing(a.x, a.y, 18, '#ff7a7a');
  damageNumber(a.x, a.y - a.r, dmg, '#ffe066');
  a.flash = 0.14;
  // A couple of frames of near-freeze: the hit reads as an impact, not a nudge.
  state.hitStop = Math.max(state.hitStop, 0.04);
  addShake(3.5);
  // knockback away from whoever hit it
  const dx = a.x - attacker.x, dy = a.y - attacker.y;
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
  const REWARD = { small: 12, walker: 22, shooter: 26, charger: 34, shield: 55, big: 85, boss: 260 };
  const XP = XP_REWARD;
  const reward = REWARD[a.type] != null ? REWARD[a.type] : 12;
  const xp     = XP[a.type]     != null ? XP[a.type]     : 10;
  if (a.type === 'boss') {
    notify('Boss pokonany!', '#ffd166');
    addShake(16);
  }
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
  // Dead aliens are filtered after the AI pass, so without this one killed
  // between frames still gets its attack in.
  if (a.dead) return;
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

  // Types with their own movement handle themselves and skip the generic AI.
  if (a.type === 'charger' && updateCharger(a, dt, closest, bestD)) return;
  if (a.type === 'boss') updateBoss(a, dt, closest, bestD);
  if (a.type === 'shooter') updateShooter(a, dt, closest, bestD);

  // Decide what we're walking toward this frame:
  // - aggressives chase if anything is within 520 px (basically always)
  // - wanderers only chase when something is within 220 px; otherwise stroll to a point
  const aggroRange = a.personality === 'aggressive' ? 520 : 220;
  const inAggro = bestD < aggroRange;

  let goalX, goalY;
  if (a.type === 'shooter' && bestD < 340) {
    // Strafe to hold the preferred range: back off when close, close in when far.
    const dx = a.x - closest.x, dy = a.y - closest.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = bestD < a.keepAway ? 1 : -1;      // 1 = away, -1 = closer
    goalX = a.x + (dx / d) * want * 120 - (dy / d) * 60;   // sidestep as well
    goalY = a.y + (dy / d) * want * 120 + (dx / d) * 60;
  } else if (inAggro) {
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
  const melee = a.type !== 'shooter';   // shooters fight at range only
  if (melee && inAggro && bestD < closest.r + a.r + 4 && a.attackCd <= 0) {
    if (closest === p) damagePlayer(a.dmg);
    else damageAlly(closest, a.dmg);
    a.attackCd = 1.0;
  }
}

// ---------- Per-type behaviour ----------

// Shooter: stands off and lobs a shot on a timer.
function updateShooter(a, dt, closest, bestD) {
  a.shootCd -= dt;
  if (bestD > 360 || a.shootCd > 0) return;
  a.shootCd = rand(1.8, 2.8);
  const dx = closest.x - a.x, dy = closest.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  state.projectiles.push({
    kind: 'plasma', x: a.x, y: a.y, vx: dx/d * 300, vy: dy/d * 300,
    life: 20, r: 7, dmg: a.dmg, t: 0, hostile: true
  });
  flashRing(a.x, a.y, 16, '#b98cff');
  sfx.alarm && sfx.alarm();
}

// Charger: telegraphs with a wind-up, then bolts in a straight line.
// Returns true when it is running its own movement this frame.
function updateCharger(a, dt, closest, bestD) {
  if (a.charge > 0) {
    a.charge -= dt;
    a.x += a.cx * dt; a.y += a.cy * dt;
    a.vx = a.cx; a.vy = a.cy;
    a.x = clamp(a.x, a.r, WORLD.w - a.r);
    a.y = clamp(a.y, a.r, WORLD.h - a.r);
    pushOutOfRocks(a);
    // Hits whatever it runs into, once per charge.
    if (!a.charged && Math.hypot(closest.x - a.x, closest.y - a.y) < closest.r + a.r + 4) {
      a.charged = true;
      if (closest === state.player) damagePlayer(a.dmg); else damageAlly(closest, a.dmg);
    }
    if (a.charge <= 0) { a.chargeCd = rand(2.2, 3.6); a.vx *= 0.2; a.vy *= 0.2; }
    return true;
  }
  if (a.windup > 0) {
    a.windup -= dt;
    // Braking during the wind-up runs every frame, so it has to be time-based
    // or the charger stops harder at 60 FPS than at 30.
    { const d = damp(0.7, dt); a.vx *= d; a.vy *= d; }
    if (a.windup <= 0) {
      const dx = closest.x - a.x, dy = closest.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      a.cx = dx/d * 430; a.cy = dy/d * 430;
      a.charge = 0.65; a.charged = false;
      flashRing(a.x, a.y, 34, '#ff9a5a');
    }
    return true;
  }
  a.chargeCd -= dt;
  if (a.chargeCd > 0 || bestD > 300) return false;
  if (bestD < 110) {
    // Too close to build up speed: back off like a bull taking a run-up.
    const dx = a.x - closest.x, dy = a.y - closest.y;
    const d = Math.hypot(dx, dy) || 1;
    a.vx += (dx / d * 150 - a.vx) * Math.min(1, dt * 4);
    a.vy += (dy / d * 150 - a.vy) * Math.min(1, dt * 4);
    a.x += a.vx * dt; a.y += a.vy * dt;
    a.x = clamp(a.x, a.r, WORLD.w - a.r);
    a.y = clamp(a.y, a.r, WORLD.h - a.r);
    pushOutOfRocks(a);
    if (a.vx < -8) a.facing = -1; else if (a.vx > 8) a.facing = 1;
    return true;
  }
  a.windup = 0.55;
  flashRing(a.x, a.y, 24, '#ffd166');
  return true;
}

// Boss: walks you down and periodically slams the ground in a ring.
function updateBoss(a, dt, closest, bestD) {
  if (a.slamWind > 0) {
    a.slamWind -= dt;
    { const d = damp(0.6, dt); a.vx *= d; a.vy *= d; }
    if (a.slamWind <= 0) {
      a.slamCd = rand(4, 6);
      flashRing(a.x, a.y, 150, '#ff7a7a');
      state.hitStop = Math.max(state.hitStop, 0.06);
      addShake(14);
      const p = state.player;
      if (Math.hypot(p.x - a.x, p.y - a.y) < 150) damagePlayer(Math.round(a.dmg * 1.3));
      for (const al of state.allies) {
        if (!al.dead && Math.hypot(al.x - a.x, al.y - a.y) < 150) damageAlly(al, a.dmg);
      }
    }
    return;
  }
  a.slamCd -= dt;
  if (a.slamCd <= 0 && bestD < 170) {
    a.slamWind = 0.7;
    flashRing(a.x, a.y, 60, '#ffd166');
  }
}
