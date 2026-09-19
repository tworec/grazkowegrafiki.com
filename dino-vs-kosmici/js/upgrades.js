import { state } from './state.js';
import { DASH, cd } from './entities/player.js';
import { FIRE } from './entities/player.js';

// Upgrade catalogue. Each entry is offered at most `max` times per run; the
// wording is what a child reads, so it says what changes, not what stat moves.
export const UPGRADES = [
  {
    key: 'hp', max: 5, name: 'Twarda skóra',
    trait: 'Więcej życia i pełne uzdrowienie.',
    apply(p) { p.maxHp += 30; p.hp = p.maxHp; }
  },
  {
    key: 'energy', max: 4, name: 'Głębszy oddech',
    trait: 'Większy zapas energii, dłuższy ogień.',
    apply(p) { p.maxEnergy += 20; p.energy = p.maxEnergy; }
  },
  {
    key: 'cooldown', max: 4, name: 'Szybsze łapy',
    trait: 'Krótsze przerwy między atakami.',
    apply() { /* read by cooldownMax() from p.upgrades.cooldown */ }
  },
  {
    key: 'ally', max: 3, name: 'Dzielne stado',
    trait: 'Małe dinozaury biją mocniej.',
    apply(p) { for (const al of state.allies) al.dmg += 2; void p; }
  },
  {
    key: 'dash', max: 3, name: 'Zwinny zryw',
    trait: 'Zryw wraca szybciej i chroni dłużej.',
    apply() { DASH.cooldown = Math.max(0.5, DASH.cooldown - 0.2); DASH.iframes += 0.05; }
  },
  {
    key: 'fire', max: 3, name: 'Oszczędny ogień',
    trait: 'Ogień zużywa mniej energii.',
    apply() { FIRE.drain = Math.max(12, FIRE.drain - 4); }
  },
  {
    key: 'regen', max: 3, name: 'Spokojny oddech',
    trait: 'Energia sama wraca szybciej.',
    apply() { state.energyRegen = (state.energyRegen || 2) + 2; }
  }
];

// Three distinct offers, favouring ones you have taken least.
export function pickUpgradeChoices(p, n) {
  const up = p.upgrades || {};
  const available = UPGRADES.filter(u => (up[u.key] || 0) < u.max);
  const pool = available.slice().sort((a, b) =>
    ((up[a.key] || 0) - (up[b.key] || 0)) || (Math.random() - 0.5));
  // Take the least-taken half, then shuffle so the order is not predictable.
  const head = pool.slice(0, Math.max(n, Math.ceil(pool.length / 2)));
  for (let i = head.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [head[i], head[j]] = [head[j], head[i]];
  }
  return head.slice(0, n);
}

export function applyUpgrade(p, u) {
  p.upgrades[u.key] = (p.upgrades[u.key] || 0) + 1;
  u.apply(p);
}

// Cooldown and dash tuning live on module constants, so a new run has to reset
// them or upgrades would carry over between games.
export function resetUpgradeTuning() {
  DASH.cooldown = 1.2;
  DASH.iframes = 0.22;
  FIRE.drain = 26;
  cd.claw.ready = cd.tail.ready = cd.fire.ready = 0;
  state.energyRegen = 2;
}
