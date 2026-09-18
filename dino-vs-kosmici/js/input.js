import { ensureAudio } from './audio.js';
import { state, restart } from './state.js';
import { tryAttack, tryJump } from './entities/player.js';


// ---------- Input ----------
export const keys = new Set();
window.addEventListener('keydown', e => {
  ensureAudio();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key)) e.preventDefault();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.add(k);
  if (k === ' ' || e.code === 'Space') tryJump();
  if (k === 'z') tryAttack('claw');
  if (k === 'x') tryAttack('tail');
  if (k === 'c') tryAttack('fire');
  if (k === 'r' && state.gameOver) restart();
}, {passive:false});
window.addEventListener('keyup', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.delete(k);
});

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
joyEl.addEventListener('touchstart', joyStart, {passive:false});
joyEl.addEventListener('touchmove', e => { e.preventDefault(); joyMove(e); }, {passive:false});
joyEl.addEventListener('touchend', joyEnd);
joyEl.addEventListener('touchcancel', joyEnd);
joyEl.addEventListener('mousedown', joyStart);
window.addEventListener('mousemove', e => joy.active && joy.id==='mouse' && joyMove(e));
window.addEventListener('mouseup', e => joy.active && joy.id==='mouse' && joyEnd());

// Attack buttons
document.querySelectorAll('.attackBtn').forEach(btn => {
  const handler = e => {
    e.preventDefault(); ensureAudio();
    const k = btn.dataset.key;
    if (k === 'Z') tryAttack('claw');
    else if (k === 'X') tryAttack('tail');
    else if (k === 'C') tryAttack('fire');
    else if (k === 'J') tryJump();
  };
  btn.addEventListener('touchstart', handler, {passive:false});
  btn.addEventListener('mousedown', handler);
});
