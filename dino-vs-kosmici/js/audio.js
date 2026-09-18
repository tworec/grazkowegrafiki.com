
// ---------- Audio (Web Audio – no files) ----------
// Graph:  sources -> sfxGain / musicGain -> master -> compressor -> destination
// Everything (SFX and the two music loops) is synthesised on the fly, so the
// game ships no audio files. The context is created lazily in ensureAudio()
// (first user gesture — required by browsers) and music starts right there.

export let actx = null;
let master = null, sfxGain = null, musicGain = null;

// ---------- Mute (persisted) ----------
const MUTE_KEY = 'dino.muted';
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* private mode etc. */ }

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
  applyMute();
}
export function toggleMuted() { setMuted(!muted); return muted; }
function applyMute() {
  if (!master) return;
  const t = actx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.03);
}

export function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    if (actx) buildGraph();
  }
  if (actx && actx.state === 'suspended' && !document.hidden) actx.resume();
}

function buildGraph() {
  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6;
  comp.attack.value = 0.004; comp.release.value = 0.2;
  comp.connect(actx.destination);
  master = actx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(comp);
  sfxGain = actx.createGain();
  sfxGain.gain.value = 1;
  sfxGain.connect(master);
  musicGain = actx.createGain();
  musicGain.gain.value = 0.55; // music sits well under the SFX
  musicGain.connect(master);
  music.start();
}

// Karta w tle: zatrzymujemy cały kontekst (zegar staje, zaplanowane nuty czekają).
document.addEventListener('visibilitychange', () => {
  if (!actx) return;
  if (document.hidden) { if (actx.state === 'running') actx.suspend(); }
  else if (actx.state === 'suspended') actx.resume();
});

// ---------- SFX primitives ----------
// `pitch` scales freq+slide (1 = as written); `dest` defaults to the SFX bus.
export function beep({freq=440, dur=0.15, type='sine', vol=0.18, slide=0, noise=false, pitch=1, at=0, dest=null}) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + at;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(dest || sfxGain);
  if (noise) {
    const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * dur), actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const src = actx.createBufferSource();
    src.buffer = buf; src.connect(g); src.start(t0); src.stop(t0+dur);
  } else {
    const o = actx.createOscillator();
    o.type = type;
    const f = freq * pitch;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide * pitch), t0+dur);
    o.connect(g); o.start(t0); o.stop(t0+dur);
  }
}

// ±8 % random pitch so repeated hits (claw spam) don't sound identical.
function jitter(range = 0.08) { return 1 + (Math.random()*2 - 1) * range; }

// Dino roar: a low tone that bends down, shaped by a sweeping band-pass
// (gives the "throat") plus a growl (fast amplitude wobble) and a breath of noise.
function roar({base=110, dur=0.7, drop=0.55, growl=28, vol=0.22, type='sawtooth'}) {
  if (!actx || muted) return;
  const t0 = actx.currentTime;
  const out = actx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(vol, t0 + 0.05);
  out.gain.setValueAtTime(vol, t0 + dur * 0.55);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(base * 6, t0);
  bp.frequency.exponentialRampToValueAtTime(base * 2.2, t0 + dur);
  bp.connect(out); out.connect(sfxGain);
  // two slightly detuned oscillators = thicker throat
  for (const det of [0, 7]) {
    const o = actx.createOscillator();
    o.type = type; o.detune.value = det;
    o.frequency.setValueAtTime(base * 0.85, t0);
    o.frequency.exponentialRampToValueAtTime(base * 1.15, t0 + dur * 0.18);
    o.frequency.exponentialRampToValueAtTime(base * drop, t0 + dur);
    o.connect(bp); o.start(t0); o.stop(t0 + dur);
  }
  // growl: LFO on the output gain
  const lfo = actx.createOscillator(), lfoG = actx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = growl; lfoG.gain.value = vol * 0.45;
  lfo.connect(lfoG); lfoG.connect(out.gain); lfo.start(t0); lfo.stop(t0 + dur);
  beep({dur: dur * 0.6, noise: true, vol: vol * 0.35});
}

let lastAlarmAt = -1;

export const sfx = {
  claw:    () => { const k = jitter(); beep({freq:900, dur:0.10, type:'square', vol:0.12, slide:-500, pitch:k}); beep({freq:1400, dur:0.07, type:'sawtooth', vol:0.08, slide:-700, pitch:k}); },
  tail:    () => { beep({freq:200, dur:0.18, type:'sine', vol:0.20, slide:-120, pitch:jitter(0.05)}); beep({dur:0.12, noise:true, vol:0.10}); },
  fire:    () => { beep({dur:0.45, noise:true, vol:0.18}); beep({freq:120, dur:0.45, type:'sawtooth', vol:0.10, slide:-60}); },
  // Ryk zależny od gatunku: tyranozaur niski i krótki, stegozaur średni,
  // diplodok długi i bardzo niski (trąbienie).
  roar:    (species) => {
    if (species === 'tyranno')    roar({base:95,  dur:0.75, drop:0.5,  growl:30, vol:0.24});
    else if (species === 'diplo') roar({base:70,  dur:1.25, drop:0.65, growl:18, vol:0.22, type:'triangle'});
    else                          roar({base:150, dur:0.6,  drop:0.6,  growl:38, vol:0.20});
  },
  hit:     () => { beep({freq:500, dur:0.06, type:'square', vol:0.08, slide:-300, pitch:jitter()}); },
  alienHit:() => { beep({freq:300, dur:0.12, type:'triangle', vol:0.14, slide:-180, pitch:jitter()}); beep({dur:0.08, noise:true, vol:0.05}); },
  jump:    () => { beep({freq:380, dur:0.18, type:'sine', vol:0.13, slide:520}); },
  coin:    () => { beep({freq:880, dur:0.07, type:'square', vol:0.12}); beep({freq:1320, dur:0.10, type:'square', vol:0.12, at:0.06}); },
  // Wyklucie jajka: "pęknięcie" (szum) i wesołe ćwierknięcie w górę.
  hatch:   () => { beep({dur:0.06, noise:true, vol:0.12}); beep({freq:1100, dur:0.12, type:'triangle', vol:0.11, slide:700, at:0.05}); beep({freq:1500, dur:0.14, type:'sine', vol:0.09, slide:400, at:0.16}); },
  // Zakup stada: trzy szybkie tupnięcia, każde wyżej, i krótka fanfara.
  herd:    () => {
    [0, 0.09, 0.18].forEach((at, i) => beep({freq:160 + i*40, dur:0.09, type:'sine', vol:0.16, slide:-60, at}));
    [523, 659, 784].forEach((f, i) => beep({freq:f, dur:0.14, type:'triangle', vol:0.11, at:0.3 + i*0.07}));
  },
  // Alarm bazy (0,35 s celowania): dwa krótkie piski. Throttled tak, żeby
  // kilka baz celujących naraz nie dawało kakofonii.
  alarm:   () => {
    if (!actx) return;
    const now = actx.currentTime;
    if (now - lastAlarmAt < 0.3) return;
    lastAlarmAt = now;
    beep({freq:1180, dur:0.09, type:'square', vol:0.045});
    beep({freq:1180, dur:0.09, type:'square', vol:0.045, at:0.15});
  },
  fizzle:  () => { beep({freq:240, dur:0.18, type:'square', vol:0.08, slide:-180}); },
  heal:    () => { beep({freq:660, dur:0.08, type:'sine', vol:0.10}); beep({freq:990, dur:0.10, type:'sine', vol:0.10, at:0.05}); },
  levelup: () => { [523,659,784,1046].forEach((f,i)=>beep({freq:f, dur:0.16, type:'triangle', vol:0.15, at:i*0.09})); },
  win:     () => { [392,494,587,784,988,1175].forEach((f,i)=>beep({freq:f, dur:0.18, type:'triangle', vol:0.16, at:i*0.12})); },
  lose:    () => { [440,330,247,165].forEach((f,i)=>beep({freq:f, dur:0.30, type:'sawtooth', vol:0.18, slide:-40, at:i*0.18})); }
};

// ---------- Music: two synthesised loops, crossfaded ----------
// Both loops are step sequencers (16th-note grid) running all the time on
// their own gain node; switching just ramps the gains (~1.5 s crossfade).
// A loop whose gain is (going to) zero still advances its clock but skips
// creating nodes, so the idle loop costs nothing.

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

// Chords as midi triads (root octave 4). Bass takes the root two octaves down.
const CH = {
  C:  [60, 64, 67], Am: [57, 60, 64], F:  [53, 57, 60], G:  [55, 59, 62],
  Em: [52, 55, 59], Dm: [50, 53, 57]
};

// Spokojna pętla "eksploracja": 88 BPM, 8 taktów, C-dur, pozytywka + miękki pad.
const CALM = {
  bpm: 88, bars: 8,
  chords: ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G'],
  // [step, midi, length in steps]
  melody: [
    [0,76,3],[4,79,3],[8,81,3],[12,79,4],
    [16,76,4],[22,72,3],[26,74,4],
    [32,81,3],[36,84,3],[40,81,4],[46,79,2],
    [48,74,4],[54,76,3],[58,79,6],
    [64,84,3],[68,79,3],[72,76,3],[76,79,4],
    [80,76,4],[86,74,3],[90,76,6],
    [96,81,3],[100,84,3],[104,86,3],[108,84,4],
    [112,74,3],[116,71,3],[120,74,6]
  ],
  level: 1.0
};

// Pętla "bojowa": 138 BPM, 8 taktów, a-moll (ta sama tonacja, więc crossfade
// nie zgrzyta). Bas ósemkowy, lekka perkusja, staccato w pentatonice.
const COMBAT = {
  bpm: 138, bars: 8,
  chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'],
  melody: [
    [0,69,1],[2,69,1],[4,72,1],[6,76,1],[8,74,2],[12,72,1],[14,74,1],
    [16,76,3],[20,72,1],[22,69,1],[24,72,2],[28,74,3],
    [32,76,1],[34,76,1],[36,79,1],[38,76,1],[40,74,2],[44,72,3],
    [48,74,3],[52,76,1],[54,74,1],[56,71,2],[60,74,3],
    [64,81,1],[66,81,1],[68,79,1],[70,76,1],[72,74,2],[76,72,1],[78,74,1],
    [80,76,3],[84,81,1],[86,79,1],[88,76,2],[92,72,3],
    [96,76,1],[98,79,1],[100,84,2],[104,79,2],[108,76,3],
    [112,74,3],[116,76,1],[118,74,1],[120,71,1],[122,74,1],[124,76,4]
  ],
  level: 1.0
};

// Generic enveloped oscillator voice.
function voice(dest, t, hz, {type='sine', vol=0.05, a=0.005, d=0.3, hold=0, lp=0, detune=0}) {
  const o = actx.createOscillator();
  o.type = type; o.frequency.value = hz; o.detune.value = detune;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  if (hold > 0) g.gain.setValueAtTime(vol, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  let head = o;
  if (lp) {
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.7;
    o.connect(f); head = f;
  }
  head.connect(g); g.connect(dest);
  o.start(t); o.stop(t + a + hold + d + 0.02);
}

function noiseHit(dest, t, {dur=0.05, vol=0.03, hp=0, bp=0}) {
  const n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i=0;i<n;i++) data[i] = (Math.random()*2-1) * (1 - i/n);
  const src = actx.createBufferSource(); src.buffer = buf;
  const g = actx.createGain(); g.gain.value = vol;
  let head = src;
  if (hp) { const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; src.connect(f); head = f; }
  if (bp) { const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = 1.2; head.connect(f); head = f; }
  head.connect(g); g.connect(dest);
  src.start(t); src.stop(t + dur);
}

function kick(dest, t, vol=0.09) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.18);
}

class Loop {
  constructor(def, style) {
    this.def = def; this.style = style;
    this.stepDur = 60 / def.bpm / 4;
    this.steps = def.bars * 16;
    this.step = 0;
    this.nextT = 0;
    this.gain = actx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(musicGain);
    this.target = 0;
    this.melodyAt = new Map();
    for (const [s, m, len] of def.melody) this.melodyAt.set(s, [m, len]);
  }
  setLevel(level, secs) {
    this.target = level;
    const g = this.gain.gain, t = actx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level * this.def.level, t + secs);
  }
  audible() { return this.target > 0 || this.gain.gain.value > 0.002; }
  schedule(until) {
    // If the clock ran away from us (iOS "interrupted" state, long stall),
    // resync instead of firing a burst of overdue steps.
    if (this.nextT < until - LOOKAHEAD - 0.5) this.nextT = until - LOOKAHEAD + 0.05;
    while (this.nextT < until) {
      if (this.audible() && !muted) this.playStep(this.step, this.nextT);
      this.step = (this.step + 1) % this.steps;
      this.nextT += this.stepDur;
    }
  }
  playStep(s, t) {
    const bar = Math.floor(s / 16), inBar = s % 16;
    const chord = CH[this.def.chords[bar]];
    const sd = this.stepDur;
    const mel = this.melodyAt.get(s);
    if (this.style === 'calm') {
      // Pad: soft sine triad held for the bar (retriggered every bar).
      if (inBar === 0) for (const m of chord) voice(this.gain, t, midiHz(m), {type:'sine', vol:0.028, a:0.35, hold: sd*16 - 0.7, d:0.5});
      // Bass: root on beats 1 and 3.
      if (inBar === 0 || inBar === 8) voice(this.gain, t, midiHz(chord[0] - 24), {type:'triangle', vol:0.06, a:0.02, d:0.9, lp:500});
      // Melody: music-box pluck (sine + quieter octave), gentle decay.
      if (mel) {
        const [m, len] = mel;
        voice(this.gain, t, midiHz(m),      {type:'sine',     vol:0.075, a:0.004, d: Math.max(0.45, len*sd*1.1)});
        voice(this.gain, t, midiHz(m + 12), {type:'triangle', vol:0.022, a:0.004, d: 0.35, lp: 3500});
      }
      // Tiny sparkle on the "and" of beat 2 every other bar.
      if (inBar === 6 && bar % 2 === 1) voice(this.gain, t, midiHz(chord[2] + 24), {type:'sine', vol:0.02, a:0.003, d:0.3});
    } else {
      // Pad (quiet) for warmth.
      if (inBar === 0) for (const m of chord) voice(this.gain, t, midiHz(m), {type:'triangle', vol:0.014, a:0.05, hold: sd*16 - 0.3, d:0.25, lp:1800});
      // Bass: 8th notes, octave jump on the 4th and 8th eighth.
      if (inBar % 2 === 0) {
        const up = (inBar === 6 || inBar === 14) ? 12 : 0;
        voice(this.gain, t, midiHz(chord[0] - 24 + up), {type:'square', vol:0.05, a:0.004, d:0.16, lp:650});
      }
      // Drums: kick on 1 and 3 (+ "and of 3" in bars 4/8), snare on 2 and 4, hats on 8ths.
      if (inBar === 0 || inBar === 8 || ((bar % 4 === 3) && inBar === 10)) kick(this.gain, t, 0.085);
      if (inBar === 4 || inBar === 12) noiseHit(this.gain, t, {dur:0.11, vol:0.05, bp:1800});
      if (inBar % 2 === 0) noiseHit(this.gain, t, {dur:0.03, vol: inBar % 4 === 2 ? 0.024 : 0.014, hp:7000});
      // Lead: staccato triangle.
      if (mel) {
        const [m, len] = mel;
        voice(this.gain, t, midiHz(m), {type:'triangle', vol:0.07, a:0.004, hold: Math.max(0, len*sd*0.55 - 0.05), d:0.09});
      }
    }
  }
}

const LOOKAHEAD = 0.35;   // s of audio scheduled ahead of the clock
const XFADE = 1.5;        // s crossfade between loops
const CALM_AFTER = 6;     // s of quiet before we go back to the calm loop
const NEAR_R = 300, NEAR_N = 3;

export const music = {
  loops: null,
  mode: 'calm',
  combatHold: 0,
  lastWave: null,
  start() {
    if (!actx || this.loops) return;
    this.loops = { calm: new Loop(CALM, 'calm'), combat: new Loop(COMBAT, 'combat') };
    const t = actx.currentTime + 0.1;
    this.loops.calm.nextT = t; this.loops.combat.nextT = t;
    this.mode = 'calm';
    this.loops.calm.setLevel(1, 2.5);
  },
  // Wezwanie do walki (start fali). Muzyka zostaje bojowa przez CALM_AFTER s
  // od ostatniego wezwania.
  combat() { this.combatHold = CALM_AFTER; },
  setMode(mode) {
    if (!this.loops || mode === this.mode) return;
    this.mode = mode;
    this.loops.calm.setLevel(mode === 'calm' ? 1 : 0, XFADE);
    this.loops.combat.setLevel(mode === 'combat' ? 1 : 0, XFADE);
  },
  fadeOut() {
    if (!this.loops || this.mode === 'off') return;
    this.mode = 'off';
    this.loops.calm.setLevel(0, 1.2);
    this.loops.combat.setLevel(0, 1.2);
  }
};

// Called once per frame from main.js. `state` is passed in (instead of imported)
// to keep audio.js free of the state -> world -> entities -> audio import cycle.
export function updateAudio(dt, state) {
  if (!actx || !music.loops) return;
  // (No check on actx.state: with a suspended clock the scheduler below is
  // simply a no-op, while the mode logic keeps tracking the game.)

  if (state.gameOver || state.won) {
    music.fadeOut();
  } else {
    // Combat triggers: new wave number, explicit music.combat() calls,
    // or >= NEAR_N aliens within NEAR_R of the player.
    if (music.lastWave != null && state.wave !== music.lastWave && state.wave > 1) music.combat();
    music.lastWave = state.wave;
    const p = state.player;
    if (p) {
      let near = 0;
      for (const a of state.aliens) {
        if (a.dead) continue;
        if (Math.hypot(a.x - p.x, a.y - p.y) < NEAR_R && ++near >= NEAR_N) break;
      }
      if (near >= NEAR_N) music.combatHold = CALM_AFTER;
    }
    music.combatHold = Math.max(0, music.combatHold - dt);
    music.setMode(music.combatHold > 0 ? 'combat' : 'calm');
  }

  const until = actx.currentTime + LOOKAHEAD;
  music.loops.calm.schedule(until);
  music.loops.combat.schedule(until);
}
