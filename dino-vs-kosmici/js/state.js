import { perf } from './view.js';
import { WORLD } from './config.js';
import { SPECIES, SPECIES_STATS, XP_CURVE } from './config.js';
import { rand, clamp } from './util.js';
import { buildLevel } from './world.js';


// ---------- Game state ----------
export const state = {
  t: 0,
  hitStop: 0,
  paused: false,
  pendingLevelUps: 0,
  energyRegen: 2,
  wave: 1,
  nextWaveAt: null,
  gameOver: false,
  won: false,
  cam: {x:0, y:0}, // (we keep camera at 0 because world == screen for now)
  player: null,
  aliens: [],
  bases: [],
  projectiles: [],
  fx: [],
  coins: [],
  resourceDrops: [],
  trees: [],
  terrain: null,
  patrolTarget: 0,
  patrolAcc: 0,
  clusterAcc: 0,
  rocks: [],
  allies: [],
  wild: [],
  pickups: [],
  scars: [],
  wildAt: null,
  helipad: null,
  flag: null,
  updateon: null
};
export let difficultyKey = 'normal';
export function setDifficulty(k) { difficultyKey = k; }
export let speciesIndex = 0;
export function setSpecies(i) { speciesIndex = ((i % SPECIES.length) + SPECIES.length) % SPECIES.length; }

export function currentSpecies() { return SPECIES[speciesIndex]; }
export function currentStats()   { return SPECIES_STATS[currentSpecies()]; }

export function makePlayer() {
  const sp = currentSpecies();
  const st = SPECIES_STATS[sp];
  return {
    x: WORLD.w/2, y: WORLD.h/2,
    vx: 0, vy: 0,
    r: 26,
    species: sp,
    hp: st.hp, maxHp: st.hp,
    energy: 100, maxEnergy: 100,
    level: 1, xp: 0, xpNeed: XP_CURVE.base,
    money: 0,
    resources: {logs: 0, pebbles: 0, sticks: 0},
    facing: 1, // 1 right, -1 left
    jump: 0,   // jump animation timer
    flash: 0,  // damage flash
    attackAnim: 0,
    shield: 0,
    upgrades: {hp:0, energy:0, cooldown:0, ally:0},
    combo: 0, comboT: 0, firing: false, fireAcc: 0,
    lastDir: {x:1,y:0},
    walkPhase: 0
  };
}

export function notify(text, color) {
  // Screen-space (drawn after the camera transform is reset); y is a drift offset.
  state.fx.push({kind:'notify', screen: true, x: 0, y: 0, text, color: color || '#fff', life: 2.5, t: 0, vy: -10});
}

export function spawnCoinBurst(x, y, total) {
  const n = Math.min(perf.lowPower ? 5 : 8, Math.max(2, Math.round(total/14)));
  // Hand out the remainder one unit at a time instead of rounding every coin:
  // a base worth 100 has to pay 100 whether the burst is five coins or eight.
  const each = Math.floor(total / n);
  let extra = total - each * n;
  // Keep the burst inside the map, or the coins from a fight at the edge land
  // where the dino cannot walk.
  x = clamp(x, 12, WORLD.w - 12);
  y = clamp(y, 12, WORLD.h - 12);
  for (let i=0;i<n;i++) {
    const ang = rand(0, Math.PI*2), sp = rand(60, 160);
    const value = each + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    // Coins now stick around for ~25 s instead of 6, so you have time to
    // come back and pick them up after a fight.
    state.coins.push({x, y, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, life:25, t:0, value});
  }
}

// Floating damage number above whatever just got hit.
export function damageNumber(x, y, amount, color) {
  if (state.fx.length > 240) return;
  state.fx.push({kind:'dmg', x, y, vy: -72, text: String(Math.round(amount)),
                 color: color || '#fff', life: 0.75, t: 0, drift: rand(-14, 14)});
}

export function flashRing(x, y, r, color) {
  state.fx.push({kind:'ring', x, y, r0:8, r1:r, life:0.35, t:0, color});
}

export function restart() {
  // Winning unlocks the next dino. Losing retries the same one.
  if (state.won) speciesIndex = (speciesIndex + 1) % SPECIES.length;
  buildLevel();
  notify('Teraz grasz: ' + SPECIES_STATS[currentSpecies()].name + '!', '#9aff9a');
}
