export const cv = document.getElementById('game');
export const mainCtx = cv.getContext('2d');
const LOW_POWER_DPR = 1;
export const HIGH_POWER_DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
export const perf = {lowPower: true, targetFps: 30, hidden: false};
export let W = 0, H = 0, DPR = LOW_POWER_DPR;

export function resize() {
  DPR = perf.lowPower ? LOW_POWER_DPR : HIGH_POWER_DPR;
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.floor(W * DPR);
  cv.height = Math.floor(H * DPR);
  mainCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();
