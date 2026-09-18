
// ---------- Audio (Web Audio – no files) ----------
export let actx = null;
export function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (actx && actx.state === 'suspended') actx.resume();
}
export function beep({freq=440, dur=0.15, type='sine', vol=0.18, slide=0, noise=false}) {
  if (!actx) return;
  const t0 = actx.currentTime;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(actx.destination);
  if (noise) {
    const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * dur), actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const src = actx.createBufferSource();
    src.buffer = buf; src.connect(g); src.start(t0); src.stop(t0+dur);
  } else {
    const o = actx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq+slide), t0+dur);
    o.connect(g); o.start(t0); o.stop(t0+dur);
  }
}
export const sfx = {
  claw:    () => { beep({freq:900, dur:0.10, type:'square', vol:0.12, slide:-500}); beep({freq:1400, dur:0.07, type:'sawtooth', vol:0.08, slide:-700}); },
  tail:    () => { beep({freq:200, dur:0.18, type:'sine', vol:0.20, slide:-120}); beep({dur:0.12, noise:true, vol:0.10}); },
  fire:    () => { beep({dur:0.45, noise:true, vol:0.18}); beep({freq:120, dur:0.45, type:'sawtooth', vol:0.10, slide:-60}); },
  hit:     () => { beep({freq:500, dur:0.06, type:'square', vol:0.08, slide:-300}); },
  alienHit:() => { beep({freq:300, dur:0.12, type:'triangle', vol:0.14, slide:-180}); beep({dur:0.08, noise:true, vol:0.05}); },
  jump:    () => { beep({freq:380, dur:0.18, type:'sine', vol:0.13, slide:520}); },
  coin:    () => { beep({freq:880, dur:0.07, type:'square', vol:0.12}); setTimeout(()=>beep({freq:1320, dur:0.10, type:'square', vol:0.12}), 60); },
  fizzle:  () => { beep({freq:240, dur:0.18, type:'square', vol:0.08, slide:-180}); },
  heal:    () => { beep({freq:660, dur:0.08, type:'sine', vol:0.10}); setTimeout(()=>beep({freq:990, dur:0.10, type:'sine', vol:0.10}), 50); },
  levelup: () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep({freq:f, dur:0.16, type:'triangle', vol:0.15}), i*90)); },
  win:     () => { [392,494,587,784,988,1175].forEach((f,i)=>setTimeout(()=>beep({freq:f, dur:0.18, type:'triangle', vol:0.16}), i*120)); },
  lose:    () => { [440,330,247,165].forEach((f,i)=>setTimeout(()=>beep({freq:f, dur:0.30, type:'sawtooth', vol:0.18, slide:-40}), i*180)); }
};
