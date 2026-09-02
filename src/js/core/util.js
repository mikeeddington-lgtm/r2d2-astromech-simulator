'use strict';
/* =====================================================================
   R2-D2 SIMULATOR — shared core
   Peripherals, the XBOXRECV stub and the actuator layer are shared;
   each firmware profile plugs its own setup()/loop() in on top.
   ===================================================================== */

/* Shown top-left in the header so a stale copy is obvious at a glance.
   BUMP THIS on every delivery (HANDOVER §change log gets the same number). */
const APP_VERSION = '1.79.0';
/* The licence the app's own About box states — one string, one place.
   Scoped on purpose: MIT covers THIS project's code and artwork, and the
   About box has to say so rather than implying it covers the geometry, the
   BSD-3-Clause firmware lineage or the manufacturers' photographs, none of
   which are ours to license (v1.44.0; see LICENSE and CREDITS.md). */
const APP_LICENCE = 'MIT';
/* WHERE THIS PROJECT LIVES — one string, one place (v1.50.0). The setup
   wizard names four sketch folders and, until now, offered no way to reach
   any of them: Mike, of the Sketch step, *"can we provide links to the
   sketches?"* A path is only an instruction if you already have the repo.
   No trailing slash; every caller appends `/tree/main/<path>`. */
const APP_REPO = 'https://github.com/mikeeddington-lgtm/r2d2-astromech-simulator';

/* ------------------------------------------------------- download stamps
   Every file this app saves carries the moment it was saved, to the minute:
   `R2-servos-2026-08-17-1532.json`. Mike, v1.45.0 — a date alone collided on
   the same-day re-export (three attempts at one calibration are three files
   called the same thing, and the browser silently renames them (1), (2)),
   and a name with no stamp at all is worse: you cannot tell which of two
   downloads is the newer one without opening both.

   LOCAL time, not UTC — the stamp exists to be recognised by the person who
   pressed the button. Seconds are deliberately left off: they add noise to a
   name a human reads, and nobody exports the same file twice inside a minute.
   `fileStamp()` is the whole API; pass a Date to stamp a specific moment. */
function fileStamp(d){
  const t = (d instanceof Date) ? d : new Date();
  const p = n => String(n).padStart(2,'0');
  return t.getFullYear() + '-' + p(t.getMonth()+1) + '-' + p(t.getDate()) +
         '-' + p(t.getHours()) + p(t.getMinutes());
}

/* -------------------------------------------------------- arduino helpers */
/* map() — and it has to be Arduino's, not a rounding of the same idea. In C:

       long map(x, a, b, c, d){ return (x - a) * (d - c) / (b - a) + c; }

   Every term is a long, so the DIVISION truncates toward zero and `+ c`
   happens to the already-truncated quotient. This used to truncate the SUM
   instead — `Math.trunc(q + c)` — which is the same answer only once q + c
   has reached zero. Below that, truncating toward zero rounds the wrong way,
   and the result is one HIGHER than the sketch's: over a hat's full travel
   into `-drivespeed .. drivespeed`, 32,765 of the 65,536 positions disagreed,
   all of them on the reverse half. `map_(-1,-32768,32767,-50,50)` gave 0
   where an Arduino gives -1 (2026-08-22).

   Reverse throttle, reverse turn, dome-left and the leftDirection===0 foot
   PWM all read through here (profiles/maestro-shared.js, profiles/mod2026.js),
   so this is the difference between a droid that behaves like the sketch and
   one that nearly does — which is the entire premise of the app. Truncate the
   quotient; add out_min afterwards; keep it unconstrained, as Arduino's is. */
const map_ = (x,a,b,c,d)=>Math.trunc((x-a)*(d-c)/(b-a))+c;   // integer, unconstrained — same as Arduino
const rnd  = (a,b)=>Math.floor(Math.random()*(b-a))+a;        // random(min,max), max exclusive
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

const SIM = { millis:0, ticks:0, hz:0, fixDomeBug:false, blockUntil:-1, blockedMs:0, profile:'mod2026' };

/* ------------------------------------------------------------ ?norender
   Skip the GPU draw, keep everything else. `SIM.draw = false` stops the one
   thing a headless test never looks at — the picture — while the firmware,
   the actuators, the model transforms and every assertion carry on exactly
   as before.

   Why it exists: on a machine with no GPU, three.js falls back to a SOFTWARE
   rasteriser and one frame of the droid scene costs the better part of a
   second. Every page.evaluate() in the test harness queues behind a frame,
   so each assertion was paying ~800 ms for a rendering nothing read, and the
   suite took the best part of an hour. Measured, 2026-08-12: 20 trivial
   evaluates against a rendering page, 23.9 s.

   The world matrices are still updated (renderer.render() is what normally
   does that) because raycast picking and viewFocusPart() read them. */
if(typeof location !== 'undefined' && /[?&#]norender\b/.test(location.search + location.hash)) SIM.draw = false;
if(SIM.draw === undefined) SIM.draw = true;

/* ------------------------------------------------------- DOM shorthands
   Declared here so every later script can use them. */
const $  = id=>document.getElementById(id);
const el = (t,c,x)=>{const e=document.createElement(t); if(c)e.className=c; if(x!==undefined)e.textContent=x; return e;};
/* ============================ NAMES ARE TEXT  (v1.75.1, 2026-08-23)
   This built its heading with innerHTML, so any caller passing a value that
   came from a person or a file was handing that file a script tag. It was
   REPRODUCED, not theorised: a Model Builder part renamed
   `<img src=x onerror=…>` executed in the page that holds the Web Serial
   handle to a servo board. `right` is the one most callers use for a name —
   mbPartLabel(), a channel, a file — so it is the one that mattered.

   Text nodes, not escaping. An escaper is a thing the next caller can
   forget; a text node cannot be talked into being markup. All 64 call sites
   were checked first and not one passes a tag, so nothing was lost — the
   single site that passed an HTML ENTITY (`Speed &amp; feel`) is now a
   plain ampersand, which is what it always meant. */
function sect(host, title, right){
  const s=el('div','sect'); const h=el('h3');
  h.appendChild(document.createTextNode(title == null ? '' : String(title)));
  if(right){ const sp=el('span'); sp.textContent = String(right); h.appendChild(sp); }
  s.appendChild(h); host.appendChild(s); return s;
}

/* ------------------------------------------------------------- overlays
   Any full-page surface that owns the app — the startup/build wizard, the
   servo-hardware bench, the import wizard, "Build your Maestro", the servo
   hardware overlay. While one of these is open, the droid underneath must
   not be driven and no cue must fire: a click or keystroke aimed at a
   control drawn on the overlay (a checkbox, a name field, an option card)
   is not a request to arm a thruster or bark a sound file. gamepad.js's
   keydown handler consults this in addition to its own-target guard,
   because the overlay's controls sit in the SAME document and a keydown
   the overlay does not itself swallow still bubbles to window. */
function uiModalOpen(){
  const st = $('startup');   if(st && st.classList.contains('on'))    return true; // setup / build wizard
  const sw = $('setupWrap'); if(sw && !sw.classList.contains('hide')) return true; // servo-hardware bench
  const iw = $('impWiz');    if(iw && !iw.hidden)                     return true; // import wizard
  const bw = $('bldWiz');    if(bw && !bw.hidden)                     return true; // Build your Maestro
  const jw = $('jobWiz');    if(jw && !jw.hidden)                     return true; // build/import/export/assign chooser (v1.45.0)
  /* #hwWrap was the second servo bench, folded into #setupWrap in v1.45.0.
     The lookup stays because it costs nothing and the id is gone rather than
     renamed — but the bench above is what guards that surface now. */
  const hw = $('hwWrap');    if(hw && !hw.hidden)                     return true; // (retired) servo hardware overlay
  return false;
}

/* --------------------------------------------------------------- logging */
const LOG_MAX = 600;
const LOG = [];
let logDirty = false;
function lg(kind, text){
  LOG.push({t:SIM.millis, k:kind, s:text});
  if(LOG.length>LOG_MAX) LOG.shift();
  logDirty = true;
}

/* ================================================================ ACTUATORS
   One normalised 0..1 value per moving part. Profile A derives these from
   PCA9685 pulses; profile B drives them from Maestro script timelines.
   ======================================================================= */
