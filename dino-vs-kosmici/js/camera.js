import { W, H } from './view.js';
import { WORLD, VIEW_H, ZOOM_MIN, ZOOM_MAX } from './config.js';
import { clamp } from './util.js';

// Camera: top-left corner of the view in world units + zoom (screen px per unit).
export const cam = { x: 0, y: 0, zoom: 1, cx: 0, cy: 0 };

export function computeZoom() {
  // Fit VIEW_H world units vertically, but never zoom so far in that the view
  // is narrower than ~560 units (portrait phones).
  let z = H / VIEW_H;
  z = Math.min(z, W / 560);
  return clamp(z, ZOOM_MIN, ZOOM_MAX);
}

// Size of the visible world rectangle.
export function viewW() { return W / cam.zoom; }
export function viewH() { return H / cam.zoom; }

// Snap the camera onto a target (used on level build so there is no fly-in).
export function snapCamera(x, y) {
  cam.zoom = computeZoom();
  cam.cx = x; cam.cy = y;
  applyCenter();
}

export function updateCamera(target, dt) {
  cam.zoom = computeZoom();
  // Critically-damped-ish follow: fast enough to feel attached, soft enough to hide jitter.
  const k = 1 - Math.exp(-dt * 6);
  cam.cx += (target.x - cam.cx) * k;
  cam.cy += (target.y - cam.cy) * k;
  applyCenter();
}

function applyCenter() {
  const vw = viewW(), vh = viewH();
  // Clamp to the world; centre if the world is smaller than the view.
  cam.x = vw >= WORLD.w ? (WORLD.w - vw) / 2 : clamp(cam.cx - vw / 2, 0, WORLD.w - vw);
  cam.y = vh >= WORLD.h ? (WORLD.h - vh) / 2 : clamp(cam.cy - vh / 2, 0, WORLD.h - vh);
}

export function worldToScreen(x, y) {
  return { x: (x - cam.x) * cam.zoom, y: (y - cam.y) * cam.zoom };
}
export function screenToWorld(sx, sy) {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
}
// Is a world-space circle at least partly inside the view (with margin)?
export function inView(x, y, r) {
  return x + r >= cam.x && x - r <= cam.x + viewW() && y + r >= cam.y && y - r <= cam.y + viewH();
}
