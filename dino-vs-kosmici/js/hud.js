import { perf, resize } from './view.js';
import { DIFFICULTY, SPECIES_STATS } from './config.js';
import { clamp } from './util.js';
import { state, difficultyKey, notify, restart, setDifficulty } from './state.js';
import { buildLevel } from './world.js';
import { cd, cooldownMax } from './entities/player.js';


export const el = {
  speciesLine: document.getElementById('speciesLine'),
  lvl: document.getElementById('lvl'),
  money: document.getElementById('money'),
  goalLine: document.getElementById('goalLine'),
  bazyCnt: document.getElementById('bazyCnt'),
  bazyMax: document.getElementById('bazyMax'),
  kosmiciCnt: document.getElementById('kosmiciCnt'),
  hpTxt: document.getElementById('hpTxt'),
  hpShield: document.getElementById('hpShield'),
  hpBar: document.getElementById('hpBar'),
  enBar: document.getElementById('enBar'),
  xpBar: document.getElementById('xpBar'),
  upgradeLine: document.getElementById('upgradeLine'),
  difficulty: document.getElementById('difficulty'),
  powerBtn: document.getElementById('powerBtn'),
  banner: document.getElementById('banner'),
  btnCd: {
    Z: document.querySelector('.attackBtn[data-key="Z"] .cd'),
    X: document.querySelector('.attackBtn[data-key="X"] .cd'),
    C: document.querySelector('.attackBtn[data-key="C"] .cd')
  }
};

// Bitmap digit rendering — composes a number from sprite PNGs.
// Caches last value per element so we only rebuild on change.
export const _digitsCache = new WeakMap();
export function setDigits(target, value, font) {
  const s = String(value);
  const key = font + '|' + s;
  if (_digitsCache.get(target) === key) return;
  _digitsCache.set(target, key);
  target.replaceChildren();
  for (const ch of s) {
    const name = ch === '/' ? 'slash' : ch;
    const img = document.createElement('img');
    img.src = `assets/digits/${font}-${name}.png`;
    img.alt = ch;
    target.appendChild(img);
  }
}

el.difficulty.addEventListener('change', () => {
  setDifficulty(el.difficulty.value);
  buildLevel();
  notify('Poziom: ' + DIFFICULTY[difficultyKey].label, '#ffd166');
});
el.powerBtn.addEventListener('click', () => {
  perf.lowPower = !perf.lowPower;
  perf.targetFps = perf.lowPower ? 30 : 60;
  el.powerBtn.textContent = perf.lowPower ? '30 FPS' : '60 FPS';
  resize();
});

export function updateHUD() {
  const p = state.player;
  const aliveBases = state.bases.reduce((n, b) => n + (b.dead ? 0 : 1), 0);
  const up = p.upgrades || {hp:0, energy:0, cooldown:0, ally:0};
  const speciesName = (SPECIES_STATS[p.species] || SPECIES_STATS.stego).name;
  el.speciesLine.textContent = (state.wave > 1 ? `Fala ${state.wave} · ` : '') + speciesName;
  setDigits(el.lvl, p.level, 'lvl');
  setDigits(el.money, p.money, 'num');
  setDigits(el.bazyCnt, aliveBases, 'num');
  setDigits(el.bazyMax, state.bases.length, 'num');
  setDigits(el.kosmiciCnt, state.aliens.length, 'num');
  setDigits(el.hpTxt, `${Math.max(0,Math.round(p.hp))}/${p.maxHp}`, 'num');
  el.hpShield.textContent = p.shield > 0 ? ' + tarcza' : '';
  el.hpBar.style.width = (100 * p.hp / p.maxHp) + '%';
  el.enBar.style.width = (100 * p.energy / p.maxEnergy) + '%';
  el.xpBar.style.width = (100 * p.xp / p.xpNeed) + '%';
  el.upgradeLine.textContent = `Ulepszenia: HP ${up.hp} EN ${up.energy} CD ${up.cooldown} ST ${up.ally}`;
  setBtnCd('Z', cd.claw);
  setBtnCd('X', cd.tail);
  setBtnCd('C', cd.fire);
}
export function setBtnCd(key, c) {
  const btn = el.btnCd[key];
  if (!btn) return;
  const kind = key === 'Z' ? 'claw' : key === 'X' ? 'tail' : 'fire';
  btn.style.height = clamp(100 * c.ready / cooldownMax(kind), 0, 100) + '%';
}

export function showBanner(html, withRestart) {
  el.banner.innerHTML = html + (withRestart ? '<br><button id="rstBtn">Zagraj jeszcze raz</button>' : '');
  el.banner.style.display = 'block';
  if (withRestart) {
    const b = document.getElementById('rstBtn');
    b.addEventListener('click', restart);
    b.addEventListener('touchstart', e => { e.preventDefault(); restart(); }, {passive:false});
  }
}
