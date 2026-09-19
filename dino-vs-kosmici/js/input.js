import { ensureAudio } from './audio.js';
import { clamp } from './util.js';
import { state, restart } from './state.js';
import { tryAttack, tryDash, startFire, stopFire } from './entities/player.js';


// ---------- Input ----------
export const keys = new Set();
// Freezing update() is not enough: these handlers spend energy and deal damage
// straight away, so they have to respect the frozen world too.
function frozen() { return state.paused || state.gameOver || state.won; }

window.addEventListener('keydown', e => {
  ensureAudio();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key)) e.preventDefault();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.add(k);
  if (k === 'r' && state.gameOver) { restart(); return; }
  if (frozen()) return;
  if (k === ' ' || e.code === 'Space') tryDash();
  if (k === 'z') tryAttack('claw');
  if (k === 'x') tryAttack('tail');
  if (k === 'c') startFire();
}, {passive:false});
window.addEventListener('keyup', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.delete(k);
  if (k === 'c') stopFire();
});
// Losing focus mid-breath must not leave the fire on.
window.addEventListener('blur', stopFire);

// Joystick
export const joyEl = document.getElementById('joy');
export const stickEl = joyEl.querySelector('.stick');
export let joy = {active:false, dx:0, dy:0, id:null};
export const joyR = 50;
export function setStick(x, y) {
  stickEl.style.transform = `translate(${x}px, ${y}px)`;
}
export function joyStart(e) {
  ensureAudio();
  const t = e.changedTouches ? e.changedTouches[0] : e;
  joy.active = true; joy.id = e.changedTouches ? t.identifier : 'mouse';
  joyMove(e);
}
export function joyMove(e) {
  if (!joy.active) return;
  const r = joyEl.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  let pt;
  if (e.changedTouches) {
    for (const t of e.changedTouches) if (t.identifier === joy.id) { pt = t; break; }
    if (!pt) return;
  } else pt = e;
  let dx = pt.clientX - cx, dy = pt.clientY - cy;
  const d = Math.hypot(dx, dy);
  if (d > joyR) { dx = dx/d*joyR; dy = dy/d*joyR; }
  setStick(dx, dy);
  joy.dx = dx/joyR; joy.dy = dy/joyR;
}
export function joyEnd(e) {
  if (e && e.changedTouches) {
    let m = false;
    for (const t of e.changedTouches) if (t.identifier === joy.id) { m = true; break; }
    if (!m) return;
  }
  joy.active = false; joy.dx = 0; joy.dy = 0; setStick(0,0);
}
// Floating joystick: touching anywhere in the left half puts the stick under
// the thumb instead of making the player reach for a fixed circle. The resting
// spot is remembered so the pad does not jump around between touches.
const JOY_HOME = { left: 16, bottom: 16 };
function placeJoy(clientX, clientY) {
  const size = joyEl.offsetWidth || 140;
  const x = clamp(clientX - size / 2, 4, window.innerWidth - size - 4);
  const y = clamp(clientY - size / 2, 4, window.innerHeight - size - 4);
  joyEl.style.left = x + 'px';
  joyEl.style.top = y + 'px';
  joyEl.style.bottom = 'auto';
}
function resetJoyHome() {
  joyEl.style.left = JOY_HOME.left + 'px';
  joyEl.style.top = 'auto';
  joyEl.style.bottom = JOY_HOME.bottom + 'px';
}

// A touch that starts on the HUD or on an attack button is not a move command.
function onControls(target) {
  return !!(target && target.closest &&
    target.closest('#hud, #attacks, #banner, .screen'));
}

function areaTouchStart(e) {
  if (joy.active || frozen()) return;
  const t = e.changedTouches ? e.changedTouches[0] : e;
  if (onControls(e.target)) return;
  if (t.clientX > window.innerWidth * 0.55) return;  // right side is for attacks
  e.preventDefault();
  placeJoy(t.clientX, t.clientY);
  joyStart(e);
}

joyEl.addEventListener('touchstart', joyStart, {passive:false});
joyEl.addEventListener('touchmove', e => { e.preventDefault(); joyMove(e); }, {passive:false});
joyEl.addEventListener('touchend', e => { joyEnd(e); if (!joy.active) resetJoyHome(); });
joyEl.addEventListener('touchcancel', e => { joyEnd(e); resetJoyHome(); });
joyEl.addEventListener('mousedown', joyStart);
document.addEventListener('touchstart', areaTouchStart, {passive:false});
document.addEventListener('touchmove', e => { if (joy.active) { e.preventDefault(); joyMove(e); } }, {passive:false});
document.addEventListener('touchend', e => { joyEnd(e); if (!joy.active) resetJoyHome(); });
// A cancelled touch (OS gesture, incoming call) must release the stick too,
// otherwise the dino keeps walking with no finger on the screen.
document.addEventListener('touchcancel', e => { joyEnd(e); if (!joy.active) resetJoyHome(); });
// Belt and braces: if no touch is left on the screen, the stick is not held.
document.addEventListener('touchend', e => {
  if (e.touches.length === 0 && joy.active) { joyEnd(); resetJoyHome(); }
});
window.addEventListener('mousemove', e => joy.active && joy.id==='mouse' && joyMove(e));
window.addEventListener('mouseup', e => joy.active && joy.id==='mouse' && joyEnd());

// Attack buttons
document.querySelectorAll('.attackBtn').forEach(btn => {
  const handler = e => {
    e.preventDefault(); ensureAudio();
    if (frozen()) return;
    const k = btn.dataset.key;
    if (k === 'Z') tryAttack('claw');
    else if (k === 'X') tryAttack('tail');
    else if (k === 'C') startFire();
    else if (k === 'J') tryDash();
  };
  btn.addEventListener('touchstart', handler, {passive:false});
  btn.addEventListener('mousedown', handler);
  if (btn.dataset.key === 'C') {
    // The fire button is held down, so every way of letting go must stop it.
    const release = () => stopFire();
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
    window.addEventListener('mouseup', release);
  }
});
