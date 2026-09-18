
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
export const ENERGY_COST = { claw: 6, tail: 18, fire: 35 };
