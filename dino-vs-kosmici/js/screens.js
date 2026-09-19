import { SPECIES, SPECIES_STATS } from './config.js';
import { state, setDifficulty, setSpecies, currentSpecies } from './state.js';
import { buildLevel } from './world.js';
import { ensureAudio, sfx, music } from './audio.js';
import { charSprites, TYRANNO_ANIM, STEGO_ANIM, DIPLO_ANIM } from './render/sprites.js';
import { pickUpgradeChoices, applyUpgrade } from './upgrades.js';

// ---------- Screens ----------
// One overlay per moment: choose a dinosaur, pick an upgrade, take a break.
// While any of them is up the simulation is frozen (state.paused).

const el = {
  start: document.getElementById('startScreen'),
  level: document.getElementById('levelScreen'),
  pause: document.getElementById('pauseScreen'),
  speciesSigns: document.getElementById('speciesSigns'),
  upgradeSigns: document.getElementById('upgradeSigns'),
  diffTabs: document.getElementById('diffTabs'),
  playBtn: document.getElementById('playBtn'),
  levelTitle: document.getElementById('levelTitle'),
  resumeBtn: document.getElementById('resumeBtn'),
  quitBtn: document.getElementById('quitBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  startHint: document.getElementById('startHint')
};

// What each dinosaur is actually good at, in words a child can act on.
const TRAITS = {
  tyranno: 'Mocny gryz z bliska. Najszybciej rozwala bazy.',
  stego:   'Ogon stawia tarczę, która wchłania ciosy.',
  diplo:   'Najwięcej życia, ogon odrzuca kosmitów daleko.'
};

// ---------- Records ----------
const BEST_KEY = 'dino.best';
function readBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; }
}
function writeBest(b) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* private mode */ }
}
// Returns true when this run beat the stored record for that dinosaur.
export function recordRun(species, wave) {
  const b = readBest();
  const prev = b[species] || 0;
  if (wave <= prev) return false;
  b[species] = wave;
  writeBest(b);
  return true;
}
export function bestFor(species) { return readBest()[species] || 0; }

// ---------- Species portraits ----------
// Drawn from the real sprite sheet, so the card shows the dinosaur you get.
function paintPortrait(cv, species) {
  const ctx = cv.getContext('2d');
  const img = charSprites[species];
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!img || !img.complete || !img.naturalWidth) return false;
  // Each species has its own frame grid; show a standing frame from it.
  const ANIM = species === 'stego' ? STEGO_ANIM
             : species === 'diplo' ? DIPLO_ANIM
             : TYRANNO_ANIM;
  const grid = img.naturalHeight === ANIM.frameH && img.naturalWidth >= ANIM.frameW;
  const fw = grid ? ANIM.frameW : img.naturalWidth;
  const fh = grid ? ANIM.frameH : img.naturalHeight;
  const scale = Math.min(cv.width / fw, cv.height / fh) * 0.96;
  const w = fw * scale, h = fh * scale;
  const x = (cv.width - w) / 2, y = cv.height - h;
  if (grid) ctx.drawImage(img, 0, 0, fw, fh, x, y, w, h);
  else ctx.drawImage(img, x, y, w, h);
  return true;
}

// Deliberately not initialised from state at module level: screens.js sits in
// an import cycle (state → world → hud → screens), so touching state's
// bindings during evaluation hits the temporal dead zone. Resolved lazily.
let chosenSpecies = null;

function buildSpeciesSigns() {
  el.speciesSigns.replaceChildren();
  for (const sp of SPECIES) {
    const st = SPECIES_STATS[sp];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sign';
    btn.setAttribute('aria-pressed', String(sp === chosenSpecies));
    const cv = document.createElement('canvas');
    cv.width = 156; cv.height = 108;
    btn.appendChild(cv);
    const name = document.createElement('div');
    name.className = 'name'; name.textContent = st.name;
    btn.appendChild(name);
    const trait = document.createElement('div');
    trait.className = 'trait'; trait.textContent = TRAITS[sp] || '';
    btn.appendChild(trait);
    const best = document.createElement('div');
    best.className = 'best';
    const b = bestFor(sp);
    best.textContent = b ? `Rekord: fala ${b}` : 'Jeszcze bez rekordu';
    btn.appendChild(best);
    btn.addEventListener('click', () => {
      ensureAudio();
      chosenSpecies = sp;
      for (const other of el.speciesSigns.children) other.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-pressed', 'true');
      sfx.coin();
    });
    el.speciesSigns.appendChild(btn);
    // Sheets may still be loading on a cold start.
    if (!paintPortrait(cv, sp)) {
      const img = charSprites[sp];
      if (img) img.addEventListener('load', () => paintPortrait(cv, sp), { once: true });
    }
  }
}

// ---------- Start screen ----------
export function showStart() {
  if (!chosenSpecies) chosenSpecies = currentSpecies();
  state.paused = true;
  buildSpeciesSigns();
  el.startHint.textContent = window.matchMedia('(pointer: coarse)').matches
    ? 'Lewa połowa ekranu prowadzi dinozaura, przyciski po prawej atakują.'
    : 'Strzałki prowadzą dinozaura, spacja to zryw, Z pazur, X ogon, C ogień (trzymaj).';
  show(el.start);
}

function startGame() {
  ensureAudio();
  setSpecies(SPECIES.indexOf(chosenSpecies));
  buildLevel();   // also resets the mutable upgrade tuning
  state.paused = false;
  hide(el.start);
  music.calm && music.calm();
}

// ---------- Level-up ----------
export function showUpgradeChoice() {
  const p = state.player;
  const choices = pickUpgradeChoices(p, 3);
  if (!choices.length) return false;       // everything maxed: nothing to offer
  state.paused = true;
  el.levelTitle.textContent = `Poziom ${p.level}`;
  el.upgradeSigns.replaceChildren();
  for (const u of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sign';
    const name = document.createElement('div');
    name.className = 'name'; name.textContent = u.name;
    btn.appendChild(name);
    const trait = document.createElement('div');
    trait.className = 'trait'; trait.textContent = u.trait;
    btn.appendChild(trait);
    const taken = (p.upgrades[u.key] || 0);
    const lvl = document.createElement('div');
    lvl.className = 'best';
    lvl.textContent = taken ? `Masz już ${taken} z ${u.max}` : `Nowe`;
    btn.appendChild(lvl);
    btn.addEventListener('click', () => {
      applyUpgrade(p, u);
      sfx.levelup();
      state.paused = false;
      hide(el.level);
    });
    el.upgradeSigns.appendChild(btn);
  }
  show(el.level);
  return true;
}

// ---------- Pause ----------
export function togglePause() {
  if (state.gameOver || state.won) return;
  if (el.level.classList.contains('on') || el.start.classList.contains('on')) return;
  if (el.pause.classList.contains('on')) {
    state.paused = false;
    hide(el.pause);
  } else {
    state.paused = true;
    show(el.pause);
  }
}

function show(node) { node.classList.add('on'); }
function hide(node) { node.classList.remove('on'); }

// Any screen open means the world should not tick.
export function anyScreenOpen() {
  return el.start.classList.contains('on') ||
         el.level.classList.contains('on') ||
         el.pause.classList.contains('on');
}

// ---------- Wiring ----------
el.playBtn.addEventListener('click', startGame);
el.resumeBtn.addEventListener('click', togglePause);
el.quitBtn.addEventListener('click', () => { hide(el.pause); showStart(); });
el.pauseBtn.addEventListener('click', togglePause);
el.diffTabs.addEventListener('click', e => {
  const b = e.target.closest('button[data-diff]');
  if (!b) return;
  for (const other of el.diffTabs.children) other.setAttribute('aria-pressed', 'false');
  b.setAttribute('aria-pressed', 'true');
  setDifficulty(b.dataset.diff);
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { togglePause(); return; }
  // Enter is a shortcut for Play only when no control has focus; otherwise the
  // focused button handles it and we would either start with the previous
  // choice or run startGame twice.
  if (e.key === 'Enter' && el.start.classList.contains('on')) {
    const f = document.activeElement;
    if (f && f !== document.body && f.closest && f.closest('button, select, a, input')) return;
    startGame();
  }
});

