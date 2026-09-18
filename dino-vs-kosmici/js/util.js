
export function rand(a,b){ return a + Math.random()*(b-a); }
export function clamp(v,a,b){ return v<a?a:v>b?b:v; }
export function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
// Per-frame damping factor `k` (tuned at 30 FPS) made frame-rate independent.
export function damp(k, dt){ return Math.pow(k, dt*30); }
