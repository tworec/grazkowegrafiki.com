import { perf, W, H } from './view.js';
import { SPECIES, SPECIES_STATS } from './config.js';
import { rand } from './util.js';
import { buildLevel } from './world.js';


// ---------- Game state ----------
export const state = {
  t: 0,
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
  trees: [],
  rocks: [],
  allies: [],
  upgradePad: null,
  allyPad: null,
  helipad: null,
  flag: null
};
export let difficultyKey = 'normal';
export function setDifficulty(k) { difficultyKey = k; }
export let speciesIndex = 0;

export function currentSpecies() { return SPECIES[speciesIndex]; }
export function currentStats()   { return SPECIES_STATS[currentSpecies()]; }

export function makePlayer() {
  const sp = currentSpecies();
  const st = SPECIES_STATS[sp];
  return {
    x: W/2, y: H - 100,
    vx: 0, vy: 0,
    r: 26,
    species: sp,
    hp: st.hp, maxHp: st.hp,
    energy: 100, maxEnergy: 100,
    level: 1, xp: 0, xpNeed: 50,
    money: 0,
    facing: 1, // 1 right, -1 left
    jump: 0,   // jump animation timer
    flash: 0,  // damage flash
    attackAnim: 0,
    shield: 0,
    upgrades: {hp:0, energy:0, cooldown:0, ally:0},
    lastDir: {x:1,y:0},
    walkPhase: 0
  };
}

export function notify(text, color) {
  state.fx.push({kind:'notify', x: W/2, y: H*0.28, text, color: color || '#fff', life: 2.5, t: 0, vy: -10});
}

export function spawnCoinBurst(x, y, total) {
  const n = Math.min(perf.lowPower ? 5 : 8, Math.max(2, Math.round(total/14)));
  const each = Math.round(total / n);
  for (let i=0;i<n;i++) {
    const ang = rand(0, Math.PI*2), sp = rand(60, 160);
    // Coins now stick around for ~25 s instead of 6, so you have time to
    // come back and pick them up after a fight.
    state.coins.push({x, y, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, life:25, t:0, value:each});
  }
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
