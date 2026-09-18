export const cv = document.getElementById('game');
export const mainCtx = cv.getContext('2d');
const LOW_POWER_DPR = 1;
export const HIGH_POWER_DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
export const perf = {lowPower: true, targetFps: 30, hidden: false, staticDirty: true};
export let W = 0, H = 0, DPR = LOW_POWER_DPR;
export const staticCv = document.createElement('canvas');
export const staticCtx = staticCv.getContext('2d');

export function resize() {
  DPR = perf.lowPower ? LOW_POWER_DPR : HIGH_POWER_DPR;
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.floor(W * DPR);
  cv.height = Math.floor(H * DPR);
  mainCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  staticCv.width = cv.width;
  staticCv.height = cv.height;
  staticCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  perf.staticDirty = true;
}
window.addEventListener('resize', resize);
resize();
