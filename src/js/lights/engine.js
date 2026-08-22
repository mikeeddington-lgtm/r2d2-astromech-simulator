'use strict';
/* =====================================================================
   ASTROPIXELS — the LogicEngine: one display, one frame at a time
   =====================================================================

   A logic display is not a video screen with an animation played onto it.
   It is ninety independent little state machines, each walking its own way
   along a shared colour ramp at its own randomised pace, and an EFFECT is
   just something that leans on that walk — brightens half of it, holds it
   still, shifts its hue, or bypasses it and writes pixels directly.

   Understanding that one sentence is the difference between a simulation
   that looks like an AstroPixels dome and one that looks like a phone.

   ------------------------------------------------------------ the walk

   Each LED carries two bytes: where it is in a 90-state ping-pong along a
   46-entry HSV ramp, and how many frames it must wait before moving. When
   its pause expires it steps one place, picks up the colour there, and
   draws a new pause: a long random one (0..delay-1) at every fifth entry,
   a short fixed one (fade) everywhere else. Nothing synchronises them, so
   the panel scintillates.

   THE CONSEQUENCE THAT CATCHES PEOPLE: a paused LED is not written at all.
   An effect that turns the brightness down does not darken the panel — it
   darkens each LED as and when that LED next happens to step. That is why
   the flip-flops and the march "dissolve" across the display over a few
   tenths of a second instead of switching cleanly, and why the same effect
   looks lazy on the rear logic (delay 40) and snappy on the front (10).
   Write the pixels unconditionally and every effect loses its character.

   ---------------------------------------------------------- the clock

   The board's animate() is gated to 10 ms and counts FRAMES, not
   milliseconds. So this engine takes real elapsed time and drains it in
   fixed 10 ms quanta — exactly the way MaestroPCA::update() drains servo
   motion, and for the same reason: a frame-counting animation driven off
   requestAnimationFrame deltas runs at a different speed on every machine,
   and this one would visibly change character between a 60 Hz laptop and a
   144 Hz monitor.

   `flipFlop` is the second clock: one boolean per display that inverts
   every `tick` ms. Effects read it two ways — as a square wave (each half
   lasts `tick`, so a cycle is 2x tick) or as a one-shot they consume by
   forcing it false, which makes their step rate `tick` exactly. Both are
   in use, so both are supported; leFlipTake() is the consuming read.
   ===================================================================== */

/* One display's whole world. `board` is a key into LE_BOARDS, so a builder
   who bought the toolbox FLD gets a 20x9 panel and every effect adapts —
   nothing downstream may assume 9x10. */
function leMakeDisplay(spec){
  const b = LE_BOARDS[spec.board] || LE_BOARDS.fld;
  const d = {
    key: spec.key, id: spec.id, label: spec.label, short: spec.short,
    pin: spec.pin, boardKey: spec.board, kind: b.kind,
    w: b.w, h: b.h, count: b.count, map: b.map(),
    /* live settings, and the board defaults they are restored to on every
       effect change. The pair matters: a command that sets a hue must not
       leave the dome permanently recoloured once the effect ends. */
    set: {fade:spec.fade, hue:0, delay:spec.delay, pal:spec.pal, bri:spec.bri},
    def: {fade:spec.fade, hue:0, delay:spec.delay, pal:spec.pal, bri:spec.bri},
    defEffect: leSequence(spec.def || 0, 0, 0, 0),
    colors: null,
    num: new Uint8Array(b.count),        // position in the 90-state walk
    pause: new Uint8Array(b.count),      // frames left before it may step
    rgb: new Uint8Array(b.count * 3),    // what each LED is showing
    effect: 0, prevEffect: -1, startMs: 0, ms: 0,
    tick: 0, tickAt: 0, flip: false,
    obj: null, d1: 0, d2: 0, d3: 0, d4: 0,
    text: '', range: 1,
    acc: 0, frames: 0, dirty: true
  };
  d.effect = d.defEffect;
  d.colors = leColors(d.set.pal, d.set.bri);
  /* Power-up scatter: a random place in the walk and a pause of up to 255
     frames. Some LEDs therefore sit frozen for two and a half seconds
     after boot — that settling is part of what a real dome looks like when
     you switch it on, and starting them all at zero looks like a test rig. */
  for(let i = 0; i < d.count; i++){
    d.num[i] = leRand(LE_TOTALWBIZ);
    d.pause[i] = leRand(256);
  }
  return d;
}

/* The engine's own PRNG seam. A test that wants a repeatable panel swaps
   leRandFn; everything random in the lighting layer goes through here so
   there is exactly one thing to swap. */
let leRandFn = n => Math.floor(Math.random() * n);
const leRand = n => (n <= 0 ? 0 : leRandFn(n) | 0);
function leSeed(seed){
  /* mulberry32 — small, fast, and the same sequence on every machine, which
     is the only property a test needs. */
  let a = seed >>> 0;
  leRandFn = n => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}
const leUnseed = () => { leRandFn = n => Math.floor(Math.random() * n); };

/* ------------------------------------------------------------- reading
   the packed command. Four fields in one integer; the effect number is
   allowed four digits so that a text-message selector could ride above it,
   which is why the modulo is 100000000 and not 100000. */
const leSeq    = d => Math.floor((d.effect % 100000000) / 10000);
const leColour = d => Math.floor(d.effect / 1000) % 10;
const leSpeed  = d => Math.floor(d.effect / 100) % 10;
const leSecs   = d => d.effect % 100;
const leHue    = d => leHueOf(leColour(d));
const leMs     = d => d.ms;
const leChanged = d => d.effect !== d.prevEffect;

/* ------------------------------------------------------------ settings
   Every one of these is a live-only change: restoreSettings() on the next
   effect change puts the board's own values back. */
function leSetPalHue(d, pal, hue){
  d.set.pal = pal; d.set.hue = hue & 0xFF;
  d.colors = leColors(d.set.pal, d.set.bri);
}
function leSetBri(d, b){ d.set.bri = b & 0xFF; d.colors = leColors(d.set.pal, d.set.bri); }
function leSetFade(d, f){ d.set.fade = f & 0xFF; }
function leSetDelay(d, n){ d.set.delay = n & 0xFF; }
function leSetTick(d, ms){ d.tick = ms | 0; }
function leSetText(d, s){ d.text = String(s == null ? '' : s); }
/* The square wave, read two ways. leFlip() peeks; leFlipTake() consumes,
   which is how the stepping effects turn a 2x tick wave into a 1x tick
   metronome. */
const leFlip = d => d.flip;
function leFlipTake(d){ if(!d.flip) return false; d.flip = false; return true; }

/* ---------------------------------------------------------- the pixels */
function leWrite(d, i, h, s, v){
  const c = lHsv2rgb(h, s, v), o = i * 3;
  d.rgb[o] = c[0]; d.rgb[o + 1] = c[1]; d.rgb[o + 2] = c[2];
  d.dirty = true;
}
/* ONE LED, ONE FRAME — the whole look lives here. See the header. */
function leStepLED(d, i, hueVal, briVal){
  if(d.pause[i] !== 0){ d.pause[i]--; return; }
  let n = d.num[i] + 1;
  if(n >= LE_TOTALWBIZ) n = 0;
  d.num[i] = n;
  /* The ping-pong fold: 0..45 up the ramp, then 44..1 back down, so one
     stored byte carries both a position and a direction. */
  const real = (n >= LE_TOTAL) ? (LE_TOTAL - 2) - (n - LE_TOTAL) : n;
  /* `% 5`, not "is this one of the four keys". The library tests the walk
     position rather than the ramp position, so eighteen of the ninety
     steps take the long pause, not four — every fifth entry in BOTH
     directions. That is what makes the fade stutter instead of gliding,
     and it is deliberate here even though it was probably not there. */
  d.pause[i] = (n % 5 === 0) ? leRand(d.set.delay) : d.set.fade;
  const c = d.colors[real];
  const v = (briVal === 255) ? c[2] : lMap8(briVal, 0, c[2]);
  leWrite(d, i, (c[0] + hueVal) & 0xFF, c[1], v);
}
/* Every LED, one frame. bri defaults to the board's own, which is applied
   for the SECOND time here — calculateAllColors already baked it into the
   ramp. The double application is not a mistake to correct: it is why the
   dome is dimmer than the palette table reads, and undoing it makes the
   whole thing glare. */
function leDraw(d, bri){
  const b = (bri === undefined) ? d.set.bri : bri;
  for(let i = 0; i < d.count; i++) leStepLED(d, i, d.set.hue, b);
  leClip(d);
}
function leDrawSplitHalf(d, topB, botB){
  const half = d.count >> 1;
  for(let i = 0; i < d.count; i++) leStepLED(d, i, d.set.hue, i < half ? topB : botB);
  leClip(d);
}
/* Blocks of width/3 alternating brightness. With three blocks to a row the
   phase inverts on every row, so it comes out a checkerboard — which is
   the march and the flip-flop-alt. A panel whose width is not a multiple
   of three cannot do it and falls back to split-half, exactly as the
   library does; the 8-wide non-AstroPixel FLD is the case that hits. */
function leDrawSplitThirds(d, aB, bB){
  if(d.w % 3 !== 0) return leDrawSplitHalf(d, aB, bB);
  const blk = d.w / 3;
  for(let i = 0; i < d.count; i++){
    const on = (Math.floor(i / blk) % 2 === 0);
    leStepLED(d, i, d.set.hue, on ? aB : bB);
  }
  leClip(d);
}
/* Direct write, bypassing the walk — how every scan line, scroll and
   glyph draws. The hue is added to ramp entry 0's, which after the
   palette-2 switch those effects all do first is simply "hue 0, fully
   saturated", so this reads as "the effect colour at this brightness". */
function leSetPixel(d, x, y, hue, bri){
  if(x < 0 || y < 0 || y >= d.h || x >= Math.floor(d.range * d.w)) return;
  const i = d.map[y * d.w + x];
  if(i >= d.count) return;                 // a hole in the board, not a pixel
  const c = d.colors[0];
  leWrite(d, i, (c[0] + hue) & 0xFF, c[1], bri & 0xFF);
}
function leClear(d){ d.rgb.fill(0); d.dirty = true; }
/* The external controller can mask off the right-hand part of a panel.
   Normally range is 1 and this does nothing at all. */
function leClip(d){
  if(d.range >= 1) return;
  const from = Math.floor(d.range * d.w);
  for(let y = 0; y < d.h; y++) for(let x = from; x < d.w; x++){
    const i = d.map[y * d.w + x];
    if(i < d.count){ const o = i * 3; d.rgb[o] = d.rgb[o+1] = d.rgb[o+2] = 0; }
  }
  d.dirty = true;
}
/* What the renderer reads: the colour of a CELL, or null where the board
   has no LED fitted. Corners of a PSI are holes, not black pixels — they
   must show board, or the PSI reads as a square instead of an octagon. */
function leCell(d, x, y){
  const i = d.map[y * d.w + x];
  if(i >= d.count) return null;
  const o = i * 3;
  return [d.rgb[o], d.rgb[o + 1], d.rgb[o + 2]];
}

/* ------------------------------------------------------------ commands */
function leSelect(d, packed){ d.effect = packed | 0; }
function leSelectSeq(d, seq, colour, speed, secs){
  leSelect(d, leSequence(seq, colour || 0, speed || 0, secs || 0));
}
function leRestore(d){
  d.set.fade = d.def.fade; d.set.hue = d.def.hue; d.set.delay = d.def.delay;
  d.set.pal = d.def.pal; d.set.bri = d.def.bri;
  d.range = 1;
  d.colors = leColors(d.set.pal, d.set.bri);
}

/* ------------------------------------------------------------- a frame
   One 10 ms quantum. Kept separate from leAdvance() so a test can step a
   display frame by frame without inventing a clock. */
function leFrame(d){
  d.frames++;
  if(d.tick <= 0 || (d.frames * 10 - d.tickAt) >= d.tick){
    d.tickAt = d.frames * 10;
    d.flip = !d.flip;
  }
  const changed = leChanged(d);
  if(changed){
    d.obj = null; d.d1 = d.d2 = d.d3 = d.d4 = 0;
    leRestore(d);
    /* 1500 ms is only a default — nearly every effect overwrites it on its
       own first frame. It matters for the handful that do not. */
    d.tick = 1500; d.tickAt = d.frames * 10;
    d.startMs = d.frames * 10;
  }
  d.ms = d.frames * 10 - d.startMs;
  let seq = leSeq(d);
  /* RANDOM re-rolls to a real effect at dispatch. The library's range test
     is `> 25` where it means `>= 25`, which walks one entry off the end of
     a 25-entry table — undefined behaviour on the board and a crash here,
     so this is the one place the simulation deliberately does NOT
     reproduce what the hardware does. */
  if(seq === LE_SEQ.RANDOM) seq = leRand(25);
  if(seq >= 25 || seq < 0) seq = LE_SEQ.NORMAL;
  const fn = LFX[seq] || LFX[LE_SEQ.NORMAL];
  const keep = fn(d, changed);
  d.prevEffect = d.effect;
  const secs = leSecs(d);
  if(keep === false || (secs > 0 && secs * 1000 < d.ms)){
    if(leSeq(d) === LE_SEQ.RANDOM) d.prevEffect = ~d.effect;   // force a re-roll
    else d.effect = d.defEffect;
  }
}
/* Real elapsed time in, whole frames out. The remainder is carried, so a
   30 fps machine and a 144 fps machine run the animation at the same rate
   and only differ in how many frames they draw at once. */
function leAdvance(d, dtMs){
  d.acc += dtMs;
  /* A tab that has been in the background for a minute must not now run
     six thousand frames in one go. Cap the catch-up at a quarter second
     and drop the rest: a light display has no state worth replaying. */
  if(d.acc > 250) d.acc = 250;
  let n = 0;
  while(d.acc >= 10 && n < 25){ d.acc -= 10; leFrame(d); n++; }
  return n;
}

/* The effect table. effects.js fills it; keeping the declaration here
   means engine.js can be loaded and stepped on its own, and a missing
   effect falls back to NORMAL rather than throwing every frame. */
const LFX = {};
