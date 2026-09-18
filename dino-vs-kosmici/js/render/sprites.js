import { perf } from '../view.js';

export const atlas = new Image();
atlas.onload = () => { perf.staticDirty = true; };
atlas.src = 'assets/antos-atlas.png';
export const dinoSprite = new Image();
dinoSprite.src = 'assets/antos-dino.png';
export const charSprites = {
  dino: new Image(),
  alien: new Image(),
  flyer: new Image(),
  stego: new Image(),
  tyranno: new Image(),
  diplo: new Image(),
  bigalien: new Image(),
  walker: new Image(),
  baseDestruct: new Image()
};
charSprites.dino.src = 'assets/char-dino.png';
charSprites.alien.src = 'assets/kosmita-robot-transparent.png';
charSprites.flyer.src = 'assets/char-flyer.png';
charSprites.stego.src = 'assets/char-stego.png';
charSprites.tyranno.src = 'assets/char-tyranno.png';
charSprites.diplo.src = 'assets/char-diplo.png';
charSprites.bigalien.src = 'assets/char-bigalien.png';
charSprites.walker.src = 'assets/char-walker.png';
charSprites.baseDestruct.src = 'assets/base-destruction.png';
// Sprite-sheet animation metadata (horizontal strips).
export const FLYER_ANIM = { frames: 6,  frameW: 250, frameH: 350, fps: 7 };
// Base destruction: 8 frames. 0-1 intact, 2 fire starts, 3 explosion,
// 4-5 collapsing, 6-7 burning ruins. Living bases show 0/1/2 by HP; on
// death we play 3→7 and hold on the ruins.
export const BASE_DESTRUCT = { frames: 8, frameW: 150, frameH: 150, deathFps: 6 };
// Stego: 18 frames laid out as idle(6) + walk(8) + shoot(4). Each frame is
// pre-normalized so the dino body is at constant size, centered, feet at
// bottom — no per-frame bbox handling needed.
export const STEGO_ANIM = {
  frameW: 256, frameH: 168,
  idle:  { start:  0, count: 6 },
  walk:  { start:  6, count: 8 },
  shoot: { start: 14, count: 4 }
};
// Diplo: same layout as stego — idle(6) + walk(8) + shoot(4).
export const DIPLO_ANIM = {
  frameW: 256, frameH: 168,
  idle:  { start:  0, count: 6 },
  walk:  { start:  6, count: 8 },
  shoot: { start: 14, count: 4 }
};
// Tyranno: 4 walk + 3 attack + 3 breath frames laid side-by-side.
export const TYRANNO_ANIM = {
  frameW: 233, frameH: 188,
  walk:   { start: 0, count: 4 },
  attack: { start: 4, count: 3 },
  breath: { start: 7, count: 3 }
};
// Big alien: 5 walk/idle poses (front-facing warrior with mace + wrench).
export const BIGALIEN_ANIM = { frames: 5, frameW: 327, frameH: 473, fps: 5 };
// Walker = small flying rocket. 6 frames (varying engine fire / propeller).
export const WALKER_ANIM = { frames: 6, frameW: 469, frameH: 239, fps: 8 };
export const SPR = {
  hud:     {x:45,   y:40,  w:440, h:285},
  heal:    {x:540,  y:48,  w:250, h:105},
  bluePad: {x:540,  y:205, w:215, h:120},
  base:    {x:875,  y:35,  w:590, h:285},
  robot:   {x:525,  y:370, w:290, h:275},
  arrow:   {x:880,  y:375, w:245, h:125},
  sign:    {x:1150, y:390, w:210, h:130},
  totem:   {x:1320, y:360, w:125, h:270},
  path:    {x:840,  y:575, w:330, h:125},
  flag:    {x:65,   y:640, w:240, h:270},
  treeA:   {x:292,  y:745, w:205, h:240},
  pine:    {x:525,  y:762, w:160, h:225},
  bush:    {x:705,  y:800, w:215, h:170},
  rock:    {x:979,  y:769, w:306, h:231},
  treeB:   {x:1299, y:669, w:223, h:290},
  stick:   {x:70,   y:368, w:240, h:185}
};
