import { W, H, DPR, mainCtx } from '../view.js';
import { cam, viewW, viewH, inView } from '../camera.js';
import { TREE_SIZE, treeFootY } from '../world.js';
import { drawGround } from './ground.js';
import { SCENERY_ART, PROPS, imgReady, atlas, dinoSprite, charSprites, FLYER_ANIM, BASE_DESTRUCT, STEGO_ANIM, DIPLO_ANIM, TYRANNO_ANIM, BIGALIEN_ANIM, WALKER_ANIM, SPR } from './sprites.js';
import { WORLD } from '../config.js';
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
  if (!ready) return { ready, ANIM, s, w: 78 * s, h: 116 * s, footOff: 58 * s, bodyTop: 110 * s };
  const k = ANIM.drawH / ANIM.bodyH;
  const h = ANIM.frameH * k * s;
  return {
    ready, ANIM, s, w: ANIM.frameW * k * s, h,
    footOff: (ANIM.footY / ANIM.frameH) * h,
    // How tall the animal itself stands above its feet. The frame is taller
    // than the animal (a stegosaurus fills 119 of 208 rows), so hanging labels
    // off the frame edge leaves them floating far above the head.
    bodyTop: ANIM.drawH * s
  };
}

// Drawn geometry of an alien sprite. Keep visibility checks and rendering on
// the same measurements: large enemies (especially the boss) can still fill
// much of the screen after their ground point has moved outside the view.
export function alienBox(a) {
  const walkerReady = a.type === 'walker' && imgReady(charSprites.walker);
  const bigalienReady = a.type === 'big' && imgReady(charSprites.bigalien);
  const shooterReady = a.type === 'shooter' && imgReady(charSprites.shooter);
  const chargerReady = a.type === 'charger' && imgReady(charSprites.charger);
  const dedicatedReady = shooterReady || chargerReady;
  const img = a.type === 'small' ? charSprites.flyer
            : walkerReady        ? charSprites.walker
            : bigalienReady      ? charSprites.bigalien
            : shooterReady       ? charSprites.shooter
            : chargerReady       ? charSprites.charger
                                 : charSprites.alien;
  const ready = imgReady(img);
  const scale = a.type === 'big' ? 1.18 : (a.type === 'small' ? 1.0 :
                a.type === 'boss' ? 1.35 : (a.type === 'shield' ? 1.1 : 0.86));
  let w, h;
  if (a.type === 'small') {
    w = a.r * 2.6 * scale; h = a.r * 3.6 * scale;
  } else if (walkerReady) {
    w = a.r * 4.2 * scale;
    h = w * WALKER_ANIM.frameH / WALKER_ANIM.frameW;
  } else if (dedicatedReady) {
    h = a.r * 3.75 * scale;
    w = h * img.naturalWidth / img.naturalHeight;
  } else {
    w = a.r * 2.45 * scale; h = a.r * 3.75 * scale;
  }
  const ANIM = a.type === 'small' ? FLYER_ANIM : walkerReady ? WALKER_ANIM
             : bigalienReady ? BIGALIEN_ANIM : null;
  const footOff = ANIM ? (ANIM.footF || 0.97) * h : dedicatedReady ? h : h * 0.95;
  const hover = a.type === 'small' ? a.r * 1.15 : 0;
  return { ready, img, walkerReady, bigalienReady, dedicatedReady, scale, w, h, ANIM, footOff, hover };
}

// The destruction sheet is square but is anchored by its painted grass line,
// not by the old collision rectangle. This box is the single source of truth
// for drawing, culling and placing the HP bar.
export function baseBox(b) {
  const sheet = charSprites.baseDestruct;
  const ready = imgReady(sheet);
  if (!ready) {
    return { ready, sheet, w: b.w, h: b.h, top: b.y - b.h / 2, bottom: b.y + b.h / 2 };
  }
  const w = b.w * 1.05;
  const h = w * BASE_DESTRUCT.frameH / BASE_DESTRUCT.frameW;
  const grassFrac = 0.04;
  const bottom = b.y + b.h / 2 + h * grassFrac;
  return { ready, sheet, w, h, top: bottom - h, bottom };
}

function boxViewRadius(box, y) {
  return Math.max(box.w / 2, y - box.top, box.bottom - y);
}

function alienViewRadius(box) {
  return Math.max(box.w / 2, box.footOff + box.hover);
}

function projectileRadius(pr) {
  return pr.kind === 'plasma' ? 16 : Math.max(1, pr.r || 0);
}

function fxRadius(f) {
  if (f.kind === 'ring') return Math.max(f.r0 || 0, f.r1 || 0) + 3;
  if (f.kind === 'dmg') return 48;
  if (f.kind === 'dust') return Math.max(3, (f.r || 0) * 1.6);
  if (f.kind === 'egg') return 9;
  return 4;
}

// Fire is held and attackAnim is refreshed every update, so it cannot also be
// the animation clock. Keep a renderer-local elapsed time per creature and
// reset it on the next breath; state.t stops naturally while the game pauses.
const breathClocks = new WeakMap();
function breathFrame(p, count) {
  let clock = breathClocks.get(p);
  if (!clock) {
    clock = { elapsed: 0, lastT: state.t, active: false };
    breathClocks.set(p, clock);
  }
  if (p.firing) {
    if (!clock.active) clock.elapsed = 0;
    else clock.elapsed += Math.max(0, state.t - clock.lastT);
  }
  clock.active = !!p.firing;
  clock.lastT = state.t;
  return Math.floor(clock.elapsed * 12) % count;
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
      frame = breathFrame(p, band.count);
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
  for (const sc of state.scars) if (inView(sc.x, sc.y, 60)) drawScar(sc);
  drawHelipad(state.helipad);
  for (const c of state.coins) if (inView(c.x, c.y, 20)) drawCoin(c);

  // Blob shadows under characters
  drawShadow(state.player, 0.85);
  for (const al of state.allies) if (!al.dead) drawShadow(al, 0.8);
  for (const w of state.wild) drawShadow(w, 0.85);

  // Depth-sorted layer
  drawList.length = 0;
  for (const t of state.trees) if (inView(t.x, t.y, 120)) push(treeFootY(t), drawTree, t);
  for (const r of state.rocks) if (inView(r.x, r.y, 60)) push(r.y + r.r * 0.6, drawRock, r);
  if (state.updateon && inView(state.updateon.x, state.updateon.y, 70)) {
    push(state.updateon.y + 16, drawUpdateon, state.updateon);
  }
  for (const b of state.bases) {
    const box = baseBox(b);
    if (inView(b.x, b.y, boxViewRadius(box, b.y))) push(b.y + b.h / 2, drawBase, b);
  }
  if (state.flag) push(state.flag.y + 40, drawFlag, state.flag);
  for (const al of state.allies) if (!al.dead && inView(al.x, al.y, 60)) push(feetY(al), drawAlly, al);
  for (const w of state.wild) if (inView(w.x, w.y, 80)) push(feetY(w), drawWild, w);
  push(feetY(state.player), drawPlayerAndShield, state.player);
  for (const a of state.aliens) {
    const box = alienBox(a);
    if (inView(a.x, a.y, alienViewRadius(box))) {
      push(feetY(a), drawAlien, a);
    }
  }
  drawList.sort((p, q) => p.y - q.y);
  for (const d of drawList) d.fn(d.arg);

  // Pickups hang in the air, so they go over the scenery rather than into the
  // depth sort — one hidden behind the trunk it floats beside is just lost.
  for (const q of state.pickups) if (q.ready && inView(q.x, q.y, 40)) drawPickup(q);

  // Projectiles and world-space FX on top
  for (const pr of state.projectiles) if (inView(pr.x, pr.y, projectileRadius(pr))) drawProjectile(pr);
  for (const f of state.fx) if (!f.screen && inView(f.x, f.y, fxRadius(f))) drawFx(f);

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

// What a felled bush, tree or rock leaves behind: a painted mark that fades
// out over the last few seconds, so you can read where you have cleared.
export function drawScar(sc) {
  const img = sc.kind === 'rock' ? PROPS.scarRock
            : sc.kind === 'bush' ? PROPS.scarBush
            : PROPS.scarTree;
  if (!imgReady(img)) return;
  const k = clamp(sc.life / 6, 0, 1);          // fade over the last six seconds
  const wMul = sc.kind === 'rock' ? 3.0 : sc.kind === 'tree' ? 2.2 : 3.4;
  const w = sc.r * wMul;
  const h = w * img.naturalHeight / img.naturalWidth;
  ctx.save();
  ctx.globalAlpha = 0.9 * k;
  const foot = sc.kind === 'tree' ? 0.88 : 0.62;
  ctx.drawImage(img, sc.x - w / 2, sc.y - h * foot, w, h);
  ctx.restore();
}

// Antos's upgrade station. For now it is a visible, solid landmark; the
// resource prices and upgrade interaction will be wired in as their own step.
export function drawUpdateon(u) {
  const img = PROPS.updateon;
  if (!imgReady(img)) return;
  const h = 104;
  const w = h * img.naturalWidth / img.naturalHeight;
  ctx.save();
  ctx.fillStyle = 'rgba(255,214,86,0.13)';
  ctx.beginPath();
  ctx.ellipse(u.x, u.y + 5, 50, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, u.x - w / 2, u.y - h * 0.86, w, h);
  ctx.restore();
}

// Floating pickups. Fruit is the yellow one and gives energy, the pill is red
// and heals. Both hover with the same gentle rise and fall; the shadow staying
// on the ground is what makes the float read.
export function drawPickup(q) {
  const pill = q.kind === 'pill';
  const img = pill ? PROPS.pill : PROPS.fruit;
  // Once knocked off its tree it lies where it fell: no rise and fall, and the
  // shadow sits tight underneath.
  const lift = q.grounded ? 0 : Math.sin(q.bob) * 9;
  const high = q.grounded ? 0 : (lift + 9) / 18;
  ctx.save();
  ctx.translate(q.x, q.y + lift);
  ctx.fillStyle = `rgba(0,0,0,${0.20 - high * 0.09})`;
  ctx.beginPath();
  ctx.ellipse(0, (q.grounded ? 9 : 30) - lift, 13 - high * 3.5, 4.5 - high * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // The halo: yellow round the fruit, red round the pill.
  ctx.fillStyle = pill ? 'rgba(255,107,107,0.24)' : 'rgba(255,214,102,0.22)';
  ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = pill ? 'rgba(255,120,120,0.6)' : 'rgba(255,214,102,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 19 + high * 1.5, 0, Math.PI * 2); ctx.stroke();

  if (imgReady(img)) {
    const w = pill ? 34 : 30;
    const h = w * img.naturalHeight / img.naturalWidth;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

export function drawRock(r) {
  if (r.flash > 0) { ctx.save(); ctx.filter = 'brightness(1.8) saturate(0.4)'; }
  // Any exit below must undo that save, including the one where the atlas is
  // not loaded and nothing is drawn at all.
  // Rock atlas art is ~1.32:1 (mossy mound on top, stone disk below); keep
  // that aspect and anchor the stone disk near the collision centre.
  const art = SCENERY_ART[r.v];
  if (art && imgReady(art.img)) {
    const w = r.r * art.wMul;
    const h = w * art.img.naturalHeight / art.img.naturalWidth;
    ctx.drawImage(art.img, r.x - w / 2, r.y - h * art.foot + r.r * 0.35, w, h);
  } else {
    drawSprite('rock', r.x, r.y - r.r*0.18, r.r*2.55, r.r*1.92);
  }
  if (r.flash > 0) ctx.restore();
}



// A dinosaur waiting under a tree, with its price above it. The label brightens
// as you come close, and turns gold once you can actually afford it.
export function drawWild(w) {
  drawDinoSprite(w, w.scale || 0.72);
  const p = state.player;
  const afford = p && p.money >= w.price;
  const near = w.glow || 0;
  const top = w.y - dinoBox(w, w.scale || 0.72).bodyTop - 8;
  ctx.save();
  ctx.globalAlpha = 0.65 + near * 0.35;
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const text = afford ? `Przygarnij za ${w.price} $` : `${w.price} $`;
  const tw = ctx.measureText(text).width + 18;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(w.x - tw/2, top - 20, tw, 20, 6); ctx.fill();
  ctx.fillStyle = afford ? '#ffd166' : '#e8e2cf';
  ctx.fillText(text, w.x, top - 10);
  ctx.restore();
  if (near > 0.01) {
    ctx.save();
    ctx.globalAlpha = near * 0.35;
    ctx.strokeStyle = afford ? '#ffd166' : '#9aff9a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r * 2.2, w.r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

export function drawAlly(al) {
  // Hatched allies share the player's species — render with the player sprite
  // at ~half scale so they read as "baby" versions, then add a tiny HP bar.
  const allyScale = al.scale || 0.5;
  if (al.species && drawDinoSprite(al, allyScale)) {
    // Above the head, not across the chest: the sprite hangs from its foot
    // line, so a bar placed relative to the collision radius lands mid-body.
    const barY = al.y - dinoBox(al, allyScale).bodyTop - 7;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const bw = al.r * 1.7;
    ctx.fillRect(al.x - bw/2, barY, bw, 3);
    ctx.fillStyle = '#9aff9a';
    ctx.fillRect(al.x - bw/2, barY, bw * (al.hp / al.maxHp), 3);
    ctx.restore();
    return;
  }
}


export function drawTree(t) {
  if (t.flash > 0) { ctx.save(); ctx.filter = 'brightness(1.8) saturate(0.4)'; }
  // Painted varieties first; the rest still come from the atlas.
  const art = SCENERY_ART[t.v];
  if (art && imgReady(art.img)) {
    const h = art.h * t.s;
    const w = h * art.img.naturalWidth / art.img.naturalHeight;
    ctx.drawImage(art.img, t.x - w / 2, treeFootY(t) - h * art.foot, w, h);
    if (t.flash > 0) ctx.restore();
    return;
  }
  const sprite = t.v === 'pine' ? 'pine' : t.v === 'bush' ? 'bush' : t.v === 'treeB' ? 'treeB' : 'treeA';
  const size = TREE_SIZE[sprite];
  drawSprite(sprite, t.x, t.y, size[0] * t.s, size[1] * t.s);
  if (t.flash > 0) ctx.restore();
}

export function drawHelipad(h) {
  if (!h) return;
  if (drawSprite('arrow', h.x, h.y, h.r*2.4, h.r*1.2)) return;
}



export function drawFlag(f) {
  if (!f) return;
  if (drawSprite('flag', f.x, f.y + 18, 62, 82)) return;
}

export function drawBase(b) {
  const box = baseBox(b);
  if (box.ready) {
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
    ctx.drawImage(box.sheet,
      frame * BASE_DESTRUCT.frameW, 0, BASE_DESTRUCT.frameW, BASE_DESTRUCT.frameH,
      b.x - box.w/2, box.top, box.w, box.h);
    if (!b.dead) {
      const barY = box.top - 10;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(b.x - b.w/2, barY, b.w, 6);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(b.x - b.w/2, barY, b.w * (b.hp/b.maxHp), 6);
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
  drawDinoSprite(p);
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

// Types without loaded dedicated art reuse the robot sprite; a hue shift plus
// a size difference keeps the fallback variants apart at a glance.
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

  const box = alienBox(a);
  const { img: alienImg, walkerReady, bigalienReady, dedicatedReady, w, h, footOff, hover } = box;
  if (box.ready) {
    ctx.restore();
    // Hang the sprite from its own foot line at the ground point; flyers get
    // lifted clear of it so they read as airborne.
    ctx.save();
    ctx.translate(a.x, a.y + bob*0.35 - hover);
    const fx = a.anim ? a.anim.facing : (a.vx < -5 ? -1 : 1);
    if (pose) { ctx.rotate(pose.rot * fx); ctx.scale(fx * pose.sx, pose.sy); }
    else ctx.scale(fx, 1);
    // The generated shooter and charger already carry their role colors;
    // tint only the shared fallback robot used by the remaining variants.
    const tint = dedicatedReady ? null : ALIEN_TINT[a.type];
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

  // No fallback drawing: every alien type has a sheet, and a missing image
  // should show as nothing rather than as a different, hand-drawn creature.
  // The save()/translate() at the top still has to be undone, or every frame
  // with an unloaded sprite leaves a state on the canvas stack and the next
  // object is drawn under the wrong transform.
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
