
export const DIFFICULTY = {
  easy:   {spawn: 0.11, extraSpawn: 0.04, maxBase: 4, hpMul: 0.82, dmgMul: 0.75, label: 'Easy'},
  normal: {spawn: 0.16, extraSpawn: 0.06, maxBase: 5, hpMul: 1.00, dmgMul: 1.00, label: 'Normal'},
  hard:   {spawn: 0.22, extraSpawn: 0.08, maxBase: 6, hpMul: 1.18, dmgMul: 1.20, label: 'Hard'}
};

// Three species cycle every time you finish a game. Stats are tuned to give each
// a clear personality without wildly changing how the game plays.
export const SPECIES = ['tyranno', 'stego', 'diplo'];
export const SPECIES_STATS = {
  stego:   { name: 'Stegozaur',  hp: 250, claw: 18, tail: 30, fire: 6, color: '#4ea84e', dark: '#2f7a2f', belly: '#a3d9a3' },
  tyranno: { name: 'Tyranozaur', hp: 220, claw: 26, tail: 22, fire: 6, color: '#a85a3a', dark: '#7a3a20', belly: '#d49a7a' },
  diplo:   { name: 'Diplodok',   hp: 320, claw: 14, tail: 38, fire: 5, color: '#3a8a8a', dark: '#1f5a5a', belly: '#7accbe' }
};
// Fire has no per-use cost — it drains energy per second while held (FIRE.drain).
export const ENERGY_COST = { claw: 5, tail: 16, fire: 0 };

// World size in world units (1 unit == 1 CSS px at zoom 1). The camera shows
// ~VIEW_H units vertically regardless of screen size, so the dino has the same
// on-screen size on a phone and on a big monitor.
// Two thirds of the original 3600x1440: the same 2.5:1 shape, but a third
// less walking between the base and the pads.
export const WORLD = { w: 2400, h: 960 };
export const VIEW_H = 720;
export const ZOOM_MIN = 0.7, ZOOM_MAX = 1.8;

// ---------- Levelling ----------
// Antoś's rule: you level up for wrecking a base or a boss, and for nothing
// else. Ordinary aliens give money, never experience, so the bar only ever
// moves when something that matters falls over. The first levels cost exactly
// one main base so the rule is obvious the first time it happens; later ones
// take two or three.
export const XP_CURVE = { base: 100, growth: 1.25 };
export const XP_REWARD = { small: 0, walker: 0, shooter: 0, charger: 0, shield: 0, big: 0, boss: 120 };
export const XP_BASE = { main: 100, other: 60 };
