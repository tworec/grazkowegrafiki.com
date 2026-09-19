import { perf, resize } from './view.js';
import { ensureAudio, isMuted, toggleMuted } from './audio.js';
import { SPECIES_STATS, WORLD } from './config.js';
import { cam, viewW, viewH } from './camera.js';
import { clamp } from './util.js';
import { state } from './state.js';
import { showStart } from './screens.js';
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
  powerBtn: document.getElementById('powerBtn'),
  muteBtn: document.getElementById('muteBtn'),
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


el.powerBtn.addEventListener('click', () => {
  perf.lowPower = !perf.lowPower;
  perf.targetFps = perf.lowPower ? 30 : 60;
  el.powerBtn.textContent = perf.lowPower ? '30 FPS' : '60 FPS';
  resize();
});

// Wyciszenie: stan trzymany w localStorage (dino.muted), wycisza muzykę i SFX.
function renderMuteBtn() {
  const m = isMuted();
  el.muteBtn.textContent = m ? '🔇' : '🔊';
  el.muteBtn.title = m ? 'Włącz dźwięk' : 'Wycisz';
  el.muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
}
renderMuteBtn();
el.muteBtn.addEventListener('click', () => {
  ensureAudio();
  toggleMuted();
  renderMuteBtn();
});

export function updateHUD() {
  const p = state.player;
  const aliveBases = state.bases.reduce((n, b) => n + (b.dead ? 0 : 1), 0);
  const up = p.upgrades || {hp:0, energy:0, cooldown:0, ally:0};
  const speciesName = (SPECIES_STATS[p.species] || SPECIES_STATS.stego).name;
  const waiting = state.nextWaveAt != null ? Math.ceil(state.nextWaveAt - state.t) : 0;
  el.speciesLine.textContent = waiting > 0
    ? `Fala ${state.wave} za ${waiting} s · ${speciesName}`
    : (state.wave > 1 ? `Fala ${state.wave} · ` : '') + speciesName;
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
  const taken = Object.values(up).reduce((n, v) => n + (v || 0), 0);
  el.upgradeLine.textContent = taken ? `Ulepszenia: ${taken}` : 'Ulepszenia: brak';
  drawMinimap();
  setBtnCd('Z', cd.claw);
  setBtnCd('X', cd.tail);
  setBtnCd('C', cd.fire);
}
// Minimap: whole world scaled into the little HUD canvas.
const mm = document.getElementById('minimap');
const mmCtx = mm ? mm.getContext('2d') : null;
export function drawMinimap() {
  if (!mmCtx) return;
  const sx = mm.width / WORLD.w, sy = mm.height / WORLD.h;
  mmCtx.clearRect(0, 0, mm.width, mm.height);
  mmCtx.fillStyle = '#2f7a3a';
  mmCtx.fillRect(0, 0, mm.width, mm.height);
  mmCtx.fillStyle = 'rgba(0,0,0,0.18)';
  for (const t of state.trees) mmCtx.fillRect(t.x * sx - 1, t.y * sy - 1, 2, 2);
  for (const r of state.rocks) mmCtx.fillRect(r.x * sx - 1, r.y * sy - 1, 2, 2);
  for (const q of state.pickups) if (q.ready) dot(q.x, q.y, q.kind === 'pill' ? '#ff6b6b' : '#ffd166', 1.8);
  for (const w of state.wild) dot(w.x, w.y, '#9aff9a', 2.5);   // dinosaurs waiting to be taken in
  for (const b of state.bases) {
    mmCtx.fillStyle = b.dead ? 'rgba(60,40,40,0.8)' : '#e63946';
    const w = Math.max(4, b.w * sx), h = Math.max(3, b.h * sy);
    mmCtx.fillRect(b.x * sx - w / 2, b.y * sy - h / 2, w, h);
  }
  for (const al of state.allies) if (!al.dead) dot(al.x, al.y, '#bfffbf', 1.5);
  for (const a of state.aliens) dot(a.x, a.y, '#ffd166', 1.5);
  const p = state.player;
  if (p) dot(p.x, p.y, '#ffffff', 3);
  mmCtx.strokeStyle = 'rgba(255,255,255,0.55)';
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(cam.x * sx + 0.5, cam.y * sy + 0.5, viewW() * sx, viewH() * sy);
  function dot(x, y, color, r) {
    mmCtx.fillStyle = color;
    mmCtx.beginPath(); mmCtx.arc(x * sx, y * sy, r, 0, Math.PI * 2); mmCtx.fill();
  }
}
export function setBtnCd(key, c) {
  const btn = el.btnCd[key];
  if (!btn) return;
  const kind = key === 'Z' ? 'claw' : key === 'X' ? 'tail' : 'fire';
  if (kind === 'fire' && c.ready <= 0) {
    // Fire is gated by energy, not by a timer: show how much is left to burn.
    const p = state.player;
    const left = p ? 1 - clamp(p.energy / p.maxEnergy, 0, 1) : 0;
    btn.style.height = (left * 100) + '%';
    return;
  }
  btn.style.height = clamp(100 * c.ready / cooldownMax(kind), 0, 100) + '%';
}

export function showBanner(html, withRestart) {
  el.banner.innerHTML = html + (withRestart ? '<br><button id="rstBtn">Zagraj jeszcze raz</button>' : '');
  el.banner.style.display = 'block';
  if (withRestart) {
    // Back to the dinosaur picker rather than silently restarting the same run.
    const again = () => { el.banner.style.display = 'none'; showStart(); };
    const b = document.getElementById('rstBtn');
    b.addEventListener('click', again);
    b.addEventListener('touchstart', e => { e.preventDefault(); again(); }, {passive:false});
  }
}
