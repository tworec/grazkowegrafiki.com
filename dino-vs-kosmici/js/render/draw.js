import { W, H, DPR, mainCtx } from '../view.js';
import { cam, viewW, viewH, inView } from '../camera.js';
import { TREE_SIZE, treeFootY } from '../world.js';
import { drawGround } from './ground.js';
import { atlas, dinoSprite, charSprites, FLYER_ANIM, BASE_DESTRUCT, STEGO_ANIM, DIPLO_ANIM, TYRANNO_ANIM, BIGALIEN_ANIM, WALKER_ANIM, SPR } from './sprites.js';
import { SPECIES_STATS, WORLD } from '../config.js';
import { clamp } from '../util.js';
import { state } from '../state.js';
import { animPose, attackLunge } from '../anim.js';

const ctx = mainCtx;

export function drawSprite(name, x, y, w, h, opts) {
  if (!atlas.complete || !atlas.naturalWidth || !SPR[name]) return false;
  const s = SPR[name];
  opts = opts || {};
  ctx.save();
  ctx.translate(x, y);
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.rotate) ctx.rotate(opts.rotate);
  ctx.drawImage(atlas, s.x, s.y, s.w, s.h, -w/2, -h/2, w, h);
  ctx.restore();
  return true;
}

// Drawn geometry of a dinosaur sprite: size, and how far its foot line sits
// below the top of the image. Shared by the renderer and the HP bar so the bar
// can never end up drawn across the body.
export function dinoBox(p, scaleOpt) {
  const ANIM = p.species === 'stego' ? STEGO_ANIM
             : p.species === 'diplo' ? DIPLO_ANIM
             : TYRANNO_ANIM;
  const sheet = charSprites[p.species];
  const ready = !!(sheet && sheet.complete && sheet.naturalWidth >= ANIM.frameW);
  const s = scaleOpt || 1;
  if (!ready) return { ready, ANIM, s, w: 78 * s, h: 116 * s, footOff: 58 * s };
  const k = ANIM.drawH / ANIM.bodyH;
  const h = ANIM.frameH * k * s;
  return { ready, ANIM, s, w: ANIM.frameW * k * s, h, footOff: (ANIM.footY / ANIM.frameH) * h };
}

export function drawDinoSprite(p, scaleOpt) {
  // One path for all three species: same sheet layout, size derived from the
  // measured body height so proportions stay honest between them.
  const box = dinoBox(p, scaleOpt);
  const { ANIM, ready, s, w, h } = box;
  const img = ready ? charSprites[p.species]
            : (charSprites.dino.complete && charSprites.dino.naturalWidth) ? charSprites.dino
            : (dinoSprite.complete && dinoSprite.naturalWidth ? dinoSprite : null);
  if (!img) return false;

  const jumpY = p.jump > 0 ? Math.sin((0.5 - p.jump) * Math.PI) * 22 : 0;
  const moving = Math.hypot(p.vx, p.vy) > 30;
  const pose = animPose(p, moving);

  // Lunge along the facing direction while attacking.
  const lunge = attackLunge(p.attackAnim > 0 ? p.attackAnim / 0.25 : 0) * (p.facing === -1 ? -1 : 1) * s;
  // The entity's y IS its ground contact point, so the origin here is where
  // the feet belong; the sprite is hung from its own measured foot line.
  // A fixed offset made the dinosaur hover above its shadow, because every
  // sheet puts the feet at a different row.
  const footOff = box.footOff;
  ctx.save();
  ctx.translate(p.x + lunge, p.y - jumpY + pose.bob * s);
  // Facing is tweened, so the sprite squeezes through zero instead of popping.
  const fx = p.anim ? p.anim.facing : (p.facing === -1 ? -1 : 1);
  ctx.rotate(pose.rot * fx);
  ctx.scale(fx * pose.sx, pose.sy);
  if (p.flash > 0) ctx.filter = 'brightness(1.6) saturate(0.5)';

  if (ready) {
    // Band picker: fire breath > melee > walk. Standing still holds the first
    // walk frame and lets the breathing in animPose carry the idle.
    let band, frame;
    if (p.attackAnim > 0 && p.attackKind === 'fire') {
      band = ANIM.breath;
      frame = Math.min(band.count - 1, Math.floor((1 - Math.max(0, p.attackAnim) / 0.25) * band.count));
    } else if (p.attackAnim > 0) {
      band = ANIM.attack;
      frame = Math.min(band.count - 1, Math.floor((1 - Math.max(0, p.attackAnim) / 0.25) * band.count));
    } else if (moving) {
      band = ANIM.walk;
      const cycle = (p.anim ? p.anim.step + p.anim.phase : 0) * (band.count / 2);
      frame = ((Math.floor(cycle) % band.count) + band.count) % band.count;
    } else {
      band = ANIM.walk;
      frame = 0;
    }
    ctx.drawImage(img, (band.start + frame) * ANIM.frameW, 0, ANIM.frameW, ANIM.frameH, -w/2, -footOff, w, h);
  } else {
    ctx.drawImage(img, -w/2, -footOff, w, h);
    if (p.attackAnim > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(w*0.32, -h*0.62, 7*p.attackAnim*4, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.filter = 'none';
  ctx.restore();
  return true;
}

// ---------- Drawing ----------
// Everything is drawn in world space under the camera transform; props and
// entities are sorted by their "feet" y so things further down the screen
// cover what is behind them (2.5D). Ground decals (pads, coins, shadows)
// go first, projectiles and FX last, HUD-like overlays in screen space.
// Ground line for depth sorting: the same point the feet and shadow use.
function feetY(e) { return e.y; }

const drawList = [];
function push(y, fn, arg) { drawList.push({ y, fn, arg }); }

export function draw() {
  const z = cam.zoom;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, -cam.x * DPR * z, -cam.y * DPR * z);
  const vx = cam.x, vy = cam.y, vw = viewW(), vh = viewH();

  // Ground: isometric diamond lattice, drawn only where the camera looks.
  ctx.fillStyle = '#3aa14a';
  ctx.fillRect(vx, vy, vw, vh);
  drawGround(ctx, vx, vy, vw, vh);

  // World edge (dark band so the player sees the map boundary)
  drawWorldEdge(vx, vy, vw, vh);

  // Flat decals — never occlude anything
  drawHelipad(state.helipad);
  drawUpgradePad(state.upgradePad);
  drawAllyPad(state.allyPad);
  for (const c of state.coins) if (inView(c.x, c.y, 20)) drawCoin(c);

  // Blob shadows under characters
  drawShadow(state.player, 0.85);
  for (const al of state.allies) if (!al.dead) drawShadow(al, 0.8);

  // Depth-sorted layer
  drawList.length = 0;
  for (const t of state.trees) if (inView(t.x, t.y, 120)) push(treeFootY(t), drawTree, t);
  for (const r of state.rocks) if (inView(r.x, r.y, 60)) push(r.y + r.r * 0.6, drawRock, r);
  for (const b of state.bases) if (inView(b.x, b.y, 200)) push(b.y + b.h / 2, drawBase, b);
  if (state.flag) push(state.flag.y + 40, drawFlag, state.flag);
  for (const al of state.allies) if (!al.dead && inView(al.x, al.y, 60)) push(feetY(al), drawAlly, al);
  push(feetY(state.player), drawPlayerAndShield, state.player);
  for (const a of state.aliens) if (inView(a.x, a.y, 80)) push(feetY(a), drawAlien, a);
  drawList.sort((p, q) => p.y - q.y);
  for (const d of drawList) d.fn(d.arg);

  // Projectiles and world-space FX on top
  for (const pr of state.projectiles) drawProjectile(pr);
  for (const f of state.fx) if (!f.screen) drawFx(f);

  // Screen-space overlays
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawOffscreenBaseArrow();
  for (const f of state.fx) if (f.screen) drawFx(f);
}

function drawPlayerAndShield(p) { drawPlayer(p); drawShield(p); }

export function drawShadow(e, k) {
  if (!e || !inView(e.x, e.y, 60)) return;
  const jump = e.jump > 0 ? Math.sin((0.5 - e.jump) * Math.PI) : 0;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.22 - jump * 0.1})`;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.r * k * (1 - jump * 0.3), e.r * 0.32 * k * (1 - jump * 0.3), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWorldEdge(vx, vy, vw, vh) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,50,20,0.55)';
  const t = 18;
  if (vx < 0)            ctx.fillRect(vx, vy, -vx, vh);
  if (vy < 0)            ctx.fillRect(vx, vy, vw, -vy);
  if (vx + vw > WORLD.w) ctx.fillRect(WORLD.w, vy, vx + vw - WORLD.w, vh);
  if (vy + vh > WORLD.h) ctx.fillRect(vx, WORLD.h, vw, vy + vh - WORLD.h);
  ctx.strokeStyle = 'rgba(30,70,30,0.7)';
  ctx.lineWidth = t;
  ctx.strokeRect(-t / 2, -t / 2, WORLD.w + t, WORLD.h + t);
  ctx.restore();
}

// Arrow at the screen edge pointing to the nearest living base when it is
// out of view, so the player always knows where to go.
function drawOffscreenBaseArrow() {
  const p = state.player;
  let best = null, bestD = Infinity;
  for (const b of state.bases) {
    if (b.dead) continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (!best || inView(best.x, best.y, -40)) return;
  const z = cam.zoom;
  const sx = (best.x - cam.x) * z, sy = (best.y - cam.y) * z;
  const cx = W / 2, cy = H / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  // Intersect the ray from the screen centre with an inset screen rectangle.
  const m = 56;
  const hw = W / 2 - m, hh = H / 2 - m;
  const c = Math.cos(ang), s = Math.sin(ang);
  const tx = c !== 0 ? hw / Math.abs(c) : Infinity, ty = s !== 0 ? hh / Math.abs(s) : Infinity;
  const t = Math.min(tx, ty);
  const ax = cx + c * t, ay = cy + s * t;
  const pulse = 1 + Math.sin(state.t * 5) * 0.08;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff7a7a';
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.font = 'bold 11px system-ui';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(bestD / 10) * 10} m`, ax, ay + 32);
  ctx.restore();
}

export function drawRock(r) {
  // Rock atlas art is ~1.32:1 (mossy mound on top, stone disk below); keep
  // that aspect and anchor the stone disk near the collision centre.
  if (drawSprite('rock', r.x, r.y - r.r*0.18, r.r*2.55, r.r*1.92)) return;
  ctx.save();
  ctx.translate(r.x, r.y);
  // shadow on the grass
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(2, r.r*0.55, r.r*1.0, r.r*0.32, 0, 0, Math.PI*2); ctx.fill();
  // base rock
  ctx.fillStyle = '#7a7a82';
  ctx.beginPath(); ctx.arc(0, 0, r.r, 0, Math.PI*2); ctx.fill();
  // top highlight
  ctx.fillStyle = '#a4a4ad';
  ctx.beginPath(); ctx.ellipse(-r.r*0.25, -r.r*0.32, r.r*0.55, r.r*0.4, 0, 0, Math.PI*2); ctx.fill();
  // dark crack lines (use seed-stable variation)
  ctx.strokeStyle = '#4a4a52'; ctx.lineWidth = 2;
  const sd = (r.seed||0);
  ctx.beginPath();
  ctx.moveTo(-r.r*0.45, -r.r*0.10 + Math.sin(sd)*r.r*0.05);
  ctx.lineTo( r.r*0.10,  r.r*0.20 + Math.cos(sd*1.3)*r.r*0.04);
  ctx.lineTo( r.r*0.50, -r.r*0.05 + Math.sin(sd*0.7)*r.r*0.03);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r.r*0.20, r.r*0.40);
  ctx.lineTo( r.r*0.05, r.r*0.15);
  ctx.stroke();
  // little moss patches
  ctx.fillStyle = '#3a7a3a';
  ctx.beginPath(); ctx.arc(r.r*0.55,  r.r*0.10, r.r*0.18, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(-r.r*0.30, r.r*0.50, r.r*0.13, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

export function drawAllyPad(u) {
  if (!u) return;
  const glow = u.glow || 0;
  if (glow > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(120,255,180,${0.3*glow})`;
    ctx.beginPath(); ctx.arc(u.x,u.y, u.r*1.9, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  if (drawSprite('bluePad', u.x, u.y + 2, 78, 44)) {
    drawAllyPadLabel(u);
    return;
  }
  ctx.save();
  ctx.translate(u.x, u.y);
  if (glow > 0) {
    ctx.fillStyle = `rgba(120,255,180,${0.3*glow})`;
    ctx.beginPath(); ctx.arc(0,0, u.r*1.9, 0, Math.PI*2); ctx.fill();
  }
  const pulse = 1 + Math.sin(state.t*3 + 1)*0.06;
  // teal/green pad
  ctx.fillStyle = '#1f8a52';
  ctx.beginPath(); ctx.arc(0,0,u.r*pulse,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#cdf0d8';
  ctx.beginPath(); ctx.arc(0,0,u.r*0.85*pulse,0,Math.PI*2); ctx.fill();
  // mini stegosaur silhouette
  ctx.fillStyle = '#1f8a52';
  // body
  ctx.beginPath(); ctx.ellipse(0, 2, u.r*0.55, u.r*0.30, 0, 0, Math.PI*2); ctx.fill();
  // head
  ctx.beginPath(); ctx.ellipse(u.r*0.55, 0, u.r*0.22, u.r*0.18, 0, 0, Math.PI*2); ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(-u.r*0.45, 2);
  ctx.lineTo(-u.r*0.85, -2);
  ctx.lineTo(-u.r*0.45, 6);
  ctx.fill();
  // back plates
  for (let i=-1;i<=1;i++) {
    ctx.beginPath();
    ctx.moveTo(i*u.r*0.20 - 2, -u.r*0.20);
    ctx.lineTo(i*u.r*0.20,     -u.r*0.45);
    ctx.lineTo(i*u.r*0.20 + 2, -u.r*0.20);
    ctx.closePath(); ctx.fill();
  }
  // legs
  ctx.fillRect(-u.r*0.25, u.r*0.20, 3, 6);
  ctx.fillRect( u.r*0.20, u.r*0.20, 3, 6);
  // label
  drawAllyPadLabel(u, true);
  ctx.restore();
}

export function drawAllyPadLabel(u, translated) {
  const canBuy = state.player && state.player.money >= 30 && state.allies.filter(a => !a.dead).length <= 3;
  const x = translated ? 0 : u.x;
  const y = translated ? u.r + 6 : u.y + u.r + 6;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(x - 50, y, 100, 32, 6); ctx.fill();
  ctx.fillStyle = canBuy ? '#fff' : '#cccccc';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(canBuy ? 'KUP STADO' : 'BRAK $ / LIMIT', x, y + 8);
  ctx.font = '10px system-ui';
  ctx.fillText('30 $ = 3 dinki', x, y + 22);
  ctx.restore();
}

export function drawAlly(al) {
  // Hatched allies share the player's species — render with the player sprite
  // at ~half scale so they read as "baby" versions, then add a tiny HP bar.
  if (al.species && drawDinoSprite(al, 0.5)) {
    // Above the head, not across the chest: the sprite hangs from its foot
    // line, so a bar placed relative to the collision radius lands mid-body.
    const barY = al.y - dinoBox(al, 0.5).footOff - 7;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(al.x - 12, barY, 24, 3);
    ctx.fillStyle = '#9aff9a';
    ctx.fillRect(al.x - 12, barY, 24 * (al.hp / al.maxHp), 3);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(al.x, al.y);
  if (al.facing === -1) ctx.scale(-1, 1);
  if (al.flash > 0) ctx.filter = 'brightness(1.6) saturate(0.5)';
  const wp = al.walkPhase || 0;
  const moving = Math.hypot(al.vx, al.vy) > 30;
  const bob = Math.sin(wp*2) * (moving ? 1.2 : 0.3);
  const tailSway = Math.sin(wp) * (moving ? 3 : 0.5);
  const liftBack  = Math.max(0, Math.sin(wp));
  const liftFront = Math.max(0, Math.sin(wp + Math.PI));
  const liftAmt = moving ? 3.5 : 0;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 11, 14, 3.5, 0, 0, Math.PI*2); ctx.fill();
  // legs (animated, 2 pairs)
  ctx.fillStyle = '#2c6b34';
  ctx.fillRect(-7, 7+bob*0.3 - liftBack*liftAmt,  3, 6 - liftBack*2);
  ctx.fillStyle = '#3a8a4a';
  ctx.fillRect(-9, 6+bob*0.4 - liftBack*liftAmt,  4, 7 - liftBack*2.5);
  ctx.fillStyle = '#2c6b34';
  ctx.fillRect( 6, 7+bob*0.3 - liftFront*liftAmt, 3, 6 - liftFront*2);
  ctx.fillStyle = '#3a8a4a';
  ctx.fillRect( 4, 6+bob*0.4 - liftFront*liftAmt, 4, 7 - liftFront*2.5);
  // body
  ctx.fillStyle = '#5fbe5f';
  ctx.beginPath(); ctx.ellipse(-1, bob, 13, 8, 0, 0, Math.PI*2); ctx.fill();
  // belly
  ctx.fillStyle = '#bce8bc';
  ctx.beginPath(); ctx.ellipse(-2, 4+bob, 8, 3.5, 0, 0, Math.PI*2); ctx.fill();
  // tail (animated)
  ctx.fillStyle = '#5fbe5f';
  ctx.beginPath();
  ctx.moveTo(-11, bob);
  ctx.quadraticCurveTo(-18, -2+bob+tailSway*0.4, -22, 2+bob+tailSway);
  ctx.quadraticCurveTo(-18,  5+bob+tailSway*0.4, -11, 4+bob);
  ctx.fill();
  // back plates
  ctx.fillStyle = '#3a8a3a';
  for (let i=-1;i<=1;i++){
    const px = i*4 - 2;
    ctx.beginPath();
    ctx.moveTo(px-2, -5+bob);
    ctx.lineTo(px,   -10+bob);
    ctx.lineTo(px+2, -5+bob);
    ctx.closePath(); ctx.fill();
  }
  // head
  ctx.fillStyle = '#5fbe5f';
  ctx.beginPath(); ctx.ellipse(11, -1+bob, 6.5, 5, 0, 0, Math.PI*2); ctx.fill();
  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(13, -2+bob, 1.7, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(13.5, -2+bob, 0.9, 0, Math.PI*2); ctx.fill();
  ctx.filter = 'none';
  // hp bar (small)
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-12, -al.r-9, 24, 3);
  ctx.fillStyle = '#9aff9a';
  ctx.fillRect(-12, -al.r-9, 24 * (al.hp/al.maxHp), 3);
  ctx.restore();
}


export function drawTree(t) {
  const sprite = t.v === 'pine' ? 'pine' : t.v === 'bush' ? 'bush' : t.v === 'treeB' ? 'treeB' : 'treeA';
  const size = TREE_SIZE[sprite];
  if (drawSprite(sprite, t.x, t.y, size[0] * t.s, size[1] * t.s)) return;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(t.s, t.s);
  if (t.v === 'pine') {
    // trunk
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(-3, 8, 6, 14);
    // foliage
    ctx.fillStyle = '#1f6f2a';
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(-14, 8); ctx.lineTo(14, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a8336';
    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(-11, 4); ctx.lineTo(11, 4); ctx.closePath(); ctx.fill();
  } else {
    // bush
    ctx.fillStyle = '#225a26';
    ctx.beginPath(); ctx.arc(-6,2,9,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(6,2,10,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-6,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#2e7c33';
    ctx.beginPath(); ctx.arc(-2,0,6,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

export function drawHelipad(h) {
  if (!h) return;
  if (drawSprite('arrow', h.x, h.y, h.r*2.4, h.r*1.2)) return;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.fillStyle = '#2a6fb5';
  ctx.beginPath(); ctx.arc(0,0,h.r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('H', 0, 1);
  ctx.restore();
}

export function drawUpgradePad(u) {
  if (!u) return;
  const glow = u.glow || 0;
  if (glow > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(155,255,155,${0.25*glow})`;
    ctx.beginPath(); ctx.arc(u.x,u.y, u.r*1.9, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  if (drawSprite('heal', u.x, u.y, 82, 42)) {
    drawUpgradePadLabel(u);
    return;
  }
  ctx.save();
  ctx.translate(u.x, u.y);
  // soft outer glow when player stands on it
  if (glow > 0) {
    ctx.fillStyle = `rgba(155,255,155,${0.25*glow})`;
    ctx.beginPath(); ctx.arc(0,0, u.r*1.9, 0, Math.PI*2); ctx.fill();
  }
  // pulsing red disk
  const pulse = 1 + Math.sin(state.t*3)*0.06;
  ctx.fillStyle = '#b1342f';
  ctx.beginPath(); ctx.arc(0,0,u.r*pulse,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#f7d4d2';
  ctx.beginPath(); ctx.arc(0,0,u.r*0.85*pulse,0,Math.PI*2); ctx.fill();
  // plus
  ctx.fillStyle = '#b1342f';
  ctx.fillRect(-u.r*0.55, -u.r*0.18, u.r*1.1, u.r*0.36);
  ctx.fillRect(-u.r*0.18, -u.r*0.55, u.r*0.36, u.r*1.1);
  // label
  drawUpgradePadLabel(u, true);
  ctx.restore();
}

export function drawUpgradePadLabel(u, translated) {
  const upgradeReady = state.player && state.player.hp >= state.player.maxHp &&
                       state.player.energy >= state.player.maxEnergy && state.player.money >= 40;
  const x = translated ? 0 : u.x;
  const y = translated ? u.r + 6 : u.y + u.r + 6;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(x - 46, y, 92, 32, 6); ctx.fill();
  ctx.fillStyle = upgradeReady ? '#ffd166' : '#fff';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(upgradeReady ? 'ULEPSZ 40 $' : 'LECZ + ENERGIA', x, y + 8);
  ctx.font = '10px system-ui';
  ctx.fillText('1 $ = 5 HP / 5 EN', x, y + 22);
  ctx.restore();
}

export function drawFlag(f) {
  if (!f) return;
  if (drawSprite('flag', f.x, f.y + 18, 62, 82)) return;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.fillStyle = '#5a3a1f';
  ctx.fillRect(-1, 0, 2, 30);
  // flag rectangle with cross
  ctx.fillStyle = '#fff';
  ctx.fillRect(2, 0, 22, 14);
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(2, 5, 22, 4);
  ctx.fillRect(11, 0, 4, 14);
  ctx.restore();
}

export function drawBase(b) {
  const sheet = charSprites.baseDestruct;
  if (sheet.complete && sheet.naturalWidth) {
    // Pick frame: living base shows damage stage by HP; dead base animates
    // through the destruction sequence and holds on the ruins.
    let frame;
    if (b.dead) {
      const elapsed = (performance.now() - (b.deadAt != null ? b.deadAt : performance.now())) / 1000;
      frame = Math.min(BASE_DESTRUCT.frames - 1, 3 + Math.floor(elapsed * BASE_DESTRUCT.deathFps));
    } else {
      const f = b.hp / b.maxHp;
      frame = f > 0.5 ? 0 : (f > 0.22 ? 1 : 2);
    }
    // Scale to base width; anchor the grass row at the base's bottom edge.
    // Keep close to the 150px native size so it doesn't pixelate.
    const drawW = b.w * 1.05;
    const drawH = drawW * BASE_DESTRUCT.frameH / BASE_DESTRUCT.frameW;
    const grassFrac = 0.04; // grass sits ~4% above the cell bottom
    const topY = (b.y + b.h/2) - drawH * (1 - grassFrac);
    ctx.drawImage(sheet,
      frame * BASE_DESTRUCT.frameW, 0, BASE_DESTRUCT.frameW, BASE_DESTRUCT.frameH,
      b.x - drawW/2, topY, drawW, drawH);
    if (!b.dead) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(b.x - b.w/2, b.y - b.h/2 - 26, b.w, 6);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(b.x - b.w/2, b.y - b.h/2 - 26, b.w * (b.hp/b.maxHp), 6);
      // tier label for the smaller bases (the art is identical, only scaled)
      if (b.tier && b.tier !== 'main') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.tier === 'secondary' ? 'BAZA II' : 'BAZA III', b.x, b.y + b.h/2 - 8);
      }
      ctx.restore();
    }
    return;
  }
  if (b.dead) {
    // smoldering ruin
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = '#3b2a2a';
    ctx.fillRect(-b.w/2, -b.h/2, b.w, b.h);
    ctx.fillStyle = '#553';
    const ruin = b.ruin || [];
    for (const spot of ruin) {
      ctx.beginPath(); ctx.arc(spot.x, spot.y, spot.r || 4, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  // base body
  ctx.fillStyle = b.color || '#4f7fb5';
  roundRect(-b.w/2, -b.h/2, b.w, b.h, Math.min(12, b.h*0.2));
  ctx.fill();
  // dark stripe
  ctx.fillStyle = b.dark || '#2c5990';
  ctx.fillRect(-b.w/2 + 8, 0, b.w - 16, Math.max(8, b.h*0.18));
  // antenna lights (cones)
  const cones = b.cones || 5;
  const span = (b.w - 28);
  for (let i=0;i<cones;i++) {
    const x = -b.w/2 + 14 + (cones === 1 ? span/2 : i * (span/(cones-1)));
    ctx.fillStyle = i%2 ? '#ff5e5e' : '#ffd166';
    ctx.beginPath();
    ctx.moveTo(x, -b.h/2 - 16);
    ctx.lineTo(x-5, -b.h/2);
    ctx.lineTo(x+5, -b.h/2);
    ctx.closePath(); ctx.fill();
  }
  // viewport dots — count scales with width
  ctx.fillStyle = '#9bd6ff';
  const dots = Math.max(2, Math.floor(b.w/40));
  const dspan = b.w - 40;
  for (let i=0;i<dots;i++) {
    const x = -dspan/2 + (dots === 1 ? 0 : i*(dspan/(dots-1)));
    ctx.beginPath(); ctx.arc(x, -10, 5, 0, Math.PI*2); ctx.fill();
  }
  // tier label for non-main bases
  if (b.tier && b.tier !== 'main') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.tier === 'secondary' ? 'BAZA II' : 'BAZA III', 0, b.h/2 - 9);
  }
  // hp bar
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-b.w/2, -b.h/2 - 26, b.w, 6);
  ctx.fillStyle = '#e63946';
  ctx.fillRect(-b.w/2, -b.h/2 - 26, b.w * (b.hp/b.maxHp), 6);
  ctx.restore();
}

export function drawCoin(c) {
  // simple round gold coin with a $ sign, gently bobbing
  ctx.save();
  ctx.translate(c.x, c.y + Math.sin(c.t*6) * 1.2);

  // soft glow halo
  ctx.fillStyle = 'rgba(255, 220, 100, 0.35)';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2); ctx.fill();

  // outer rim (dark gold)
  ctx.fillStyle = '#9a6b00';
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2); ctx.fill();

  // gold face
  ctx.fillStyle = '#ffcc33';
  ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI*2); ctx.fill();

  // inner engraved ring
  ctx.strokeStyle = '#c89110';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.stroke();

  // highlight blob
  ctx.fillStyle = 'rgba(255, 245, 200, 0.55)';
  ctx.beginPath(); ctx.arc(-2.2, -2.4, 2.6, 0, Math.PI*2); ctx.fill();

  // $ sign
  ctx.fillStyle = '#6a3a00';
  ctx.font = 'bold 10px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 0, 0.5);

  ctx.restore();
}

export function drawPlayer(p) {
  if (drawDinoSprite(p)) return;
  // Sprite sheets not loaded yet: simple placeholder so the dino is never invisible.
  const st = SPECIES_STATS[p.species] || SPECIES_STATS.stego;
  ctx.save();
  ctx.fillStyle = st.color;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

export function drawShield(p) {
  if (!p || p.shield <= 0) return;
  const a = clamp(p.shield / 2.5, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.25 + a * 0.2;
  ctx.strokeStyle = '#9bd6ff';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(p.x, p.y - 4, p.r + 12 + Math.sin(state.t*8)*2, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}

// New enemy types reuse the robot sprite until their own art exists; a hue
// shift plus a size difference keeps them apart at a glance.
const ALIEN_TINT = {
  shooter: 'hue-rotate(255deg) saturate(1.5)',
  charger: 'hue-rotate(320deg) saturate(1.7) brightness(1.1)',
  shield:  'hue-rotate(170deg) saturate(1.3) brightness(0.9)',
  boss:    'hue-rotate(330deg) saturate(1.6) brightness(0.85)'
};

// Called while the canvas is already translated to the alien, so the ring is
// drawn around the local origin — using a.x/a.y here would double the offset.
function warnRing(k, maxR, color) {
  const kk = clamp(k, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.25 + kk * 0.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.arc(0, 0, 10 + kk * maxR, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export function drawAlien(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  // Ground walkers use the shared animation machine (step-driven bob, squash,
  // tweened turns); flyers keep a gentle hover, which is what they should do.
  const flying = a.type === 'small';
  const pose = flying ? null : animPose(a, Math.hypot(a.vx, a.vy) > 25);
  const bob = flying ? Math.sin(state.t*4 + a.wob) * 2.2 : pose.bob * 1.4;

  // Shadow on the ground point (a.y), matching where the sprite now stands.
  // Flyers hover, so theirs is smaller and fainter.
  ctx.fillStyle = flying ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, a.r * (flying ? 0.6 : 0.85), a.r * (flying ? 0.18 : 0.25), 0, 0, Math.PI*2);
  ctx.fill();

  // Pick the source sprite per alien type:
  //   small  -> animated cute round-robot (FLYER_ANIM)
  //   walker -> static wide rocket (char-walker.png)
  //   big    -> animated green-warrior (BIGALIEN_ANIM) with static fallback
  // Telegraphs: a charger winding up and a boss about to slam both get a
  // growing warning ring, so the hit is always readable before it lands.
  if (a.windup > 0) warnRing(1 - a.windup / 0.55, 46, '#ffd166');
  if (a.slamWind > 0) warnRing(1 - a.slamWind / 0.7, 150, '#ff7a7a');

  const walkerReady   = a.type === 'walker' && charSprites.walker.complete   && charSprites.walker.naturalWidth;
  const bigalienReady = a.type === 'big'    && charSprites.bigalien.complete && charSprites.bigalien.naturalWidth;
  const alienImg = a.type === 'small' ? charSprites.flyer
                 : walkerReady        ? charSprites.walker
                 : bigalienReady      ? charSprites.bigalien
                                      : charSprites.alien;
  if (alienImg && alienImg.complete && alienImg.naturalWidth) {
    ctx.restore();
    const scale = a.type === 'big' ? 1.18 : (a.type === 'small' ? 1.0 :
                  a.type === 'boss' ? 1.35 : (a.type === 'shield' ? 1.1 : 0.86));
    // Walker is a wide rocket (~2:1), the others are tall.
    let w, h;
    if (a.type === 'small') {
      w = a.r * 2.6 * scale;  h = a.r * 3.6 * scale;
    } else if (walkerReady) {
      w = a.r * 4.2 * scale;
      h = w * WALKER_ANIM.frameH / WALKER_ANIM.frameW;
    } else {
      w = a.r * 2.45 * scale; h = a.r * 3.75 * scale;
    }
    // Hang the sprite from its own foot line at the ground point; flyers get
    // lifted clear of it so they read as airborne.
    const AN = a.type === 'small' ? FLYER_ANIM : walkerReady ? WALKER_ANIM
             : bigalienReady ? BIGALIEN_ANIM : null;
    const footOff = AN ? (AN.footF || 0.97) * h : h * 0.95;
    const hover = flying ? a.r * 1.15 : 0;
    ctx.save();
    ctx.translate(a.x, a.y + bob*0.35 - hover);
    const fx = a.anim ? a.anim.facing : (a.vx < -5 ? -1 : 1);
    if (pose) { ctx.rotate(pose.rot * fx); ctx.scale(fx * pose.sx, pose.sy); }
    else ctx.scale(fx, 1);
    const tint = ALIEN_TINT[a.type];
    const flashF = a.flash > 0 ? 'brightness(1.7) saturate(0.4) ' : '';
    if (flashF || tint) ctx.filter = (flashF + (tint || '')).trim();
    if (a.type === 'small') {
      const frame = Math.floor(state.t * FLYER_ANIM.fps + (a.wob || 0)) % FLYER_ANIM.frames;
      ctx.drawImage(alienImg,
        frame * FLYER_ANIM.frameW, 0, FLYER_ANIM.frameW, FLYER_ANIM.frameH,
        -w/2, -footOff, w, h);
    } else if (walkerReady) {
      const frame = Math.floor(state.t * WALKER_ANIM.fps + (a.wob || 0)) % WALKER_ANIM.frames;
      ctx.drawImage(alienImg,
        frame * WALKER_ANIM.frameW, 0, WALKER_ANIM.frameW, WALKER_ANIM.frameH,
        -w/2, -footOff, w, h);
    } else if (bigalienReady) {
      const frame = Math.floor(state.t * BIGALIEN_ANIM.fps + (a.wob || 0)) % BIGALIEN_ANIM.frames;
      ctx.drawImage(alienImg,
        frame * BIGALIEN_ANIM.frameW, 0, BIGALIEN_ANIM.frameW, BIGALIEN_ANIM.frameH,
        -w/2, -footOff, w, h);
    } else {
      ctx.drawImage(alienImg, -w/2, -footOff, w, h);
    }
    ctx.filter = 'none';
    ctx.restore();
    if (a.armor) {
      // A plate drawn on the facing side: the hint is "get behind it".
      const f = a.anim ? (a.anim.facing < 0 ? -1 : 1) : 1;
      ctx.save();
      ctx.translate(a.x + f * a.r * 0.75, a.y);
      ctx.fillStyle = 'rgba(160,205,255,0.85)';
      ctx.strokeStyle = 'rgba(40,80,130,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, a.r * 0.34, a.r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const barY = a.y - footOff - hover + bob*0.35 - 8;
    ctx.fillRect(a.x - a.r, barY, a.r*2, 4);
    ctx.fillStyle = '#ff7a7a';
    ctx.fillRect(a.x - a.r, barY, a.r*2 * (a.hp/a.maxHp), 4);
    ctx.restore();
    return;
  }

  const robotScale = a.type === 'big' ? 1.35 : (a.type === 'small' ? 0.82 : 1.0);
  ctx.restore();
  // Atlas fallback: the robot is centred, so its own geometry gives the bar.
  const robotH = a.r * 2.55 * robotScale;
  if (drawSprite('robot', a.x, a.y - robotH/2 + bob*0.35, a.r*2.35*robotScale, robotH, {flip: (a.anim ? a.anim.facing : 1) < 0})) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const barY = a.y - robotH + bob*0.35 - 8;
    ctx.fillRect(a.x - a.r, barY, a.r*2, 4);
    ctx.fillStyle = '#ff7a7a';
    ctx.fillRect(a.x - a.r, barY, a.r*2 * (a.hp/a.maxHp), 4);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(a.x, a.y);

  if (a.type === 'big') {
    // BIG alien — friendly mushroom-blob style with 1 big eye, antennae, little legs.
    // legs
    ctx.fillStyle = '#5b3a8a';
    for (let i=-1;i<=1;i++){
      ctx.fillRect(-3 + i*9, a.r*0.4, 5, 10);
    }
    // body (round purple)
    ctx.fillStyle = '#9d6dff';
    ctx.beginPath(); ctx.arc(0, bob, a.r, 0, Math.PI*2); ctx.fill();
    // belly
    ctx.fillStyle = '#caa6ff';
    ctx.beginPath(); ctx.ellipse(0, bob+8, a.r*0.7, a.r*0.4, 0, 0, Math.PI*2); ctx.fill();
    // spots
    ctx.fillStyle = '#7a4cd6';
    ctx.beginPath(); ctx.arc(-10, bob-6, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, bob+2, 3, 0, Math.PI*2); ctx.fill();
    // antennae
    ctx.strokeStyle = '#5b3a8a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, bob - a.r + 2); ctx.quadraticCurveTo(-14, bob - a.r - 12, -16, bob - a.r - 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, bob - a.r + 2); ctx.quadraticCurveTo(14, bob - a.r - 12, 16, bob - a.r - 16); ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(-16, bob - a.r - 16, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(16, bob - a.r - 16, 3, 0, Math.PI*2); ctx.fill();
    // big eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, bob - 4, 9, 0, Math.PI*2); ctx.fill();
    // bloodshot tinge so the eye reads "menacing", not "cartoon-cute"
    ctx.fillStyle = '#ffd2c4';
    ctx.beginPath(); ctx.arc(0, bob - 4, 9, 0, Math.PI*2); ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a1a2a';
    const lookX = clamp((state.player.x - a.x)/30, -3, 3);
    const lookY = clamp((state.player.y - a.y)/30, -3, 3);
    ctx.beginPath(); ctx.arc(lookX, bob - 4 + lookY, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(lookX-1.5, bob - 5.5 + lookY, 1.4, 0, Math.PI*2); ctx.fill();

    // angry V-shaped eyebrow above the eye (slants down toward center)
    ctx.strokeStyle = '#3a1f6a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, bob - 14);   // outer end higher
    ctx.lineTo(-1, bob - 11);
    ctx.lineTo( 9, bob - 14);   // outer end higher (mirror) — V shape pointing down to eye
    ctx.stroke();
    ctx.lineCap = 'butt';

    // mouth — open & toothy when within striking distance, grumpy frown otherwise
    const distP = Math.hypot(state.player.x - a.x, state.player.y - a.y);
    if (distP < 95) {
      // open angry mouth
      ctx.fillStyle = '#1a0a2a';
      ctx.beginPath();
      ctx.ellipse(0, bob + 8, 8, 5, 0, 0, Math.PI*2);
      ctx.fill();
      // jagged teeth — small white triangles top & bottom
      ctx.fillStyle = '#fff5e0';
      for (let i=-1; i<=1; i++) {
        const x = i*4;
        // upper teeth
        ctx.beginPath();
        ctx.moveTo(x - 1.7, bob + 5.2);
        ctx.lineTo(x,       bob + 9);
        ctx.lineTo(x + 1.7, bob + 5.2);
        ctx.closePath(); ctx.fill();
      }
      for (let i=-1; i<=1; i++) {
        const x = i*4 + 2;
        // lower teeth (offset)
        ctx.beginPath();
        ctx.moveTo(x - 1.4, bob + 11);
        ctx.lineTo(x,       bob + 7.5);
        ctx.lineTo(x + 1.4, bob + 11);
        ctx.closePath(); ctx.fill();
      }
    } else {
      // closed grumpy frown — middle dips upward
      ctx.strokeStyle = '#3a1f6a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, bob + 9);
      ctx.quadraticCurveTo(0, bob + 4, 7, bob + 9);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  } else if (a.type === 'walker') {
    // SMALL WALKING alien — orange-red, 4 thin legs, two big eyes, a little gremlin
    // step animation
    const step = Math.sin(state.t*8 + a.wob) * 3;
    // legs
    ctx.strokeStyle = '#7a2317'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-a.r*0.5, a.r*0.3); ctx.lineTo(-a.r*0.7, a.r*0.9 + step);
    ctx.moveTo(-a.r*0.2, a.r*0.4); ctx.lineTo(-a.r*0.3, a.r*0.95 - step);
    ctx.moveTo( a.r*0.2, a.r*0.4); ctx.lineTo( a.r*0.3, a.r*0.95 + step);
    ctx.moveTo( a.r*0.5, a.r*0.3); ctx.lineTo( a.r*0.7, a.r*0.9 - step);
    ctx.stroke();
    // body
    ctx.fillStyle = '#e85a3c';
    ctx.beginPath(); ctx.arc(0, bob, a.r, 0, Math.PI*2); ctx.fill();
    // belly
    ctx.fillStyle = '#ffb59a';
    ctx.beginPath(); ctx.ellipse(0, bob+5, a.r*0.65, a.r*0.35, 0, 0, Math.PI*2); ctx.fill();
    // back spikes
    ctx.fillStyle = '#a73320';
    for (let i=-1;i<=1;i++) {
      ctx.beginPath();
      ctx.moveTo(i*7 - 3, bob - a.r*0.85);
      ctx.lineTo(i*7,     bob - a.r*1.25);
      ctx.lineTo(i*7 + 3, bob - a.r*0.85);
      ctx.closePath(); ctx.fill();
    }
    // two eyes
    const eyeLook = clamp((state.player.x - a.x)/40, -1.5, 1.5);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-5, bob-3, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(5,  bob-3, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-5+eyeLook, bob-3, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(5+eyeLook,  bob-3, 2, 0, Math.PI*2); ctx.fill();
    // little teeth/mouth (cartoon-fierce, not scary)
    ctx.strokeStyle = '#5a1a10'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-4, bob+5); ctx.lineTo(-2, bob+7); ctx.lineTo(0, bob+5); ctx.lineTo(2, bob+7); ctx.lineTo(4, bob+5); ctx.stroke();
  } else {
    // SMALL flyer — brown UFO-like with 3 small eyes
    // wing/saucer
    ctx.fillStyle = '#7a5a3a';
    ctx.beginPath(); ctx.ellipse(0, bob+2, a.r, a.r*0.45, 0, 0, Math.PI*2); ctx.fill();
    // dome
    ctx.fillStyle = '#b08660';
    ctx.beginPath(); ctx.arc(0, bob - 2, a.r*0.7, Math.PI, 0); ctx.fill();
    // dome window
    ctx.fillStyle = '#2dd2c6';
    ctx.beginPath(); ctx.arc(0, bob - 3, a.r*0.55, Math.PI*1.05, -0.05*Math.PI); ctx.fill();
    // 3 eyes
    ctx.fillStyle = '#1a1a2a';
    for (let i=-1;i<=1;i++) { ctx.beginPath(); ctx.arc(i*5, bob-4, 1.6, 0, Math.PI*2); ctx.fill(); }
    // lights under
    const lit = Math.floor(state.t*4 + a.wob*2) % 3;
    for (let i=0;i<3;i++) {
      ctx.fillStyle = i===lit ? '#ffd166' : '#553';
      ctx.beginPath(); ctx.arc(-a.r*0.6 + i*a.r*0.6, bob+5, 2.3, 0, Math.PI*2); ctx.fill();
    }
  }

  // hp bar
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-a.r, -a.r-12, a.r*2, 4);
  ctx.fillStyle = '#ff7a7a';
  ctx.fillRect(-a.r, -a.r-12, a.r*2 * (a.hp/a.maxHp), 4);

  ctx.restore();
}

export function drawProjectile(pr) {
  ctx.save();
  ctx.translate(pr.x, pr.y);
  if (pr.kind === 'fire') {
    const lifeFrac = clamp(pr.life / 0.55, 0, 1);
    ctx.globalAlpha = lifeFrac;
    ctx.fillStyle = '#ff8533';
    ctx.beginPath(); ctx.arc(0,0, pr.r * (0.6+0.4*lifeFrac), 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(0,0, pr.r*0.55*lifeFrac, 0, Math.PI*2); ctx.fill();
  } else if (pr.kind === 'plasma') {
    // Arrow shot from the alien base — rotated to match velocity
    const ang = Math.atan2(pr.vy, pr.vx);
    ctx.rotate(ang);
    // wooden shaft
    ctx.fillStyle = '#7a4a20';
    ctx.fillRect(-13, -1.2, 22, 2.4);
    // shaft highlight (top)
    ctx.fillStyle = '#a07040';
    ctx.fillRect(-13, -1.2, 22, 0.8);
    // metal arrowhead — pointed triangle at the leading edge
    ctx.fillStyle = '#cdd0d4';
    ctx.beginPath();
    ctx.moveTo(9, -4.5);
    ctx.lineTo(15, 0);
    ctx.lineTo(9, 4.5);
    ctx.closePath();
    ctx.fill();
    // arrowhead shading
    ctx.fillStyle = '#7a8088';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(15, 0);
    ctx.lineTo(9, 4.5);
    ctx.closePath();
    ctx.fill();
    // red feather fletching at the back
    ctx.fillStyle = '#cc3333';
    ctx.beginPath();
    ctx.moveTo(-13, -3.5);
    ctx.lineTo(-7, -1);
    ctx.lineTo(-7,  1);
    ctx.lineTo(-13, 3.5);
    ctx.lineTo(-16, 0);
    ctx.closePath();
    ctx.fill();
    // fletching detail line
    ctx.strokeStyle = '#7a1a1a'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-13, -3.5); ctx.lineTo(-13, 3.5);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFx(f) {
  ctx.save();
  if (f.kind === 'ring') {
    const k = clamp(f.t / (f.t + f.life), 0, 1);
    const r = f.r0 + (f.r1 - f.r0) * k;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = f.color || '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI*2); ctx.stroke();
  } else if (f.kind === 'puff') {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color || '#9b7';
    ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI*2); ctx.fill();
  } else if (f.kind === 'dmg') {
    const k = clamp(f.life / 0.75, 0, 1);
    ctx.globalAlpha = k;
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color || '#fff';
    ctx.fillText(f.text, f.x, f.y);
  } else if (f.kind === 'dust') {
    const k = clamp(f.life / 0.35, 0, 1);
    ctx.globalAlpha = k * 0.45;
    ctx.fillStyle = '#cbb98a';
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.6 - k * 0.6), 0, Math.PI*2); ctx.fill();
  } else if (f.kind === 'egg') {
    ctx.fillStyle = '#fff5cc';
    ctx.strokeStyle = '#a07';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, 6, 8, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  } else if (f.kind === 'notify') {
    const nx = W / 2, ny = H * 0.28 + f.y;
    ctx.globalAlpha = clamp(f.life / 1.2, 0, 1);
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(f.text).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(nx - w/2, ny - 16, w, 32, 8); ctx.fill();
    ctx.fillStyle = f.color || '#fff';
    ctx.fillText(f.text, nx, ny);
  }
  ctx.restore();
}

export function roundRect(x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}
