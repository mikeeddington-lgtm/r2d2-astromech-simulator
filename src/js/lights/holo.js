'use strict';
/* =====================================================================
   HOLOPROJECTORS — the FlthyMcNasty HP light show, seven pixels at a time
   =====================================================================

   Same provenance as the rest of this folder. Nothing is ported: the HP
   controller lives in ReelTwo as HoloLights.h, which is LGPL-2.1 against
   this project's MIT (scoped — see CREDITS.md), so what we have is
   `_spec/holo.md`, a behavioural reading of that file with every piece of
   non-obvious arithmetic already tabulated. This file is written from those
   tables, which is why the tables are restated in the comments here: the
   prose is the provenance, exactly as in pcb.js.

   A holoprojector is seven WS2812s behind one lens — 0-5 a ring, 6 the
   centre. Six of the seven effects paint all seven identically, so they
   read as one blob that changes colour; only Cycle (a dot chasing the ring
   with the centre forced dark) and Rainbow (a hue gradient by index) care
   where a pixel physically is.

   --------------------------------------------------- what actually ships

   Almost every interesting thing about this board contradicts its own
   documentation, and the contradictions are what make it look right. A holo
   built from the published docs looks wrong on the dome. Implemented below
   as the hardware behaves, not as the manual reads:

     · Dim pulse's "brightness" is a DIVISOR — 255/(8*frames) — so it peaks
       at a stored 31 and decays hyperbolically, and each cycle opens with a
       100 ms dead zone nothing draws into.
     · Dim pulse also has its OWN colour table, in which 8 is white and both
       9 and 0 are black. Some perfectly legal commands render nothing.
     · Short circuit runs 21 on/off pairs, not 20, and ends LIT.
     · Cycle walks six pixels with no blank step: a 3450 ms loop, not 4025.
     · The rainbow wheel starts on green and runs green -> red -> blue.
     · Any active sequence blocks that holo's twitch for as long as it runs,
       and most sequences never end.

   ----------------------------------------------------------- the clock

   The board's animate() is not gated at all — it runs at whatever rate the
   sketch loops, and every effect is written as "sample millis(), decide what
   to draw now". That is a problem for a simulator, because the shortest
   interval in the file is 10 ms and a browser frame is 16: the first flashes
   of a short circuit get swallowed. So we do what engine.js does and drain
   real elapsed time in fixed 10 ms quanta, and `now` is simply the frame
   count times ten. Same accumulator, same catch-up cap, same reason.
   ===================================================================== */

const HP_PIXELS = 7;                 // 0-5 ring, 6 centre
const HP_BRIGHT = 100;               // the private BRIGHT constant setup() applies
const HP_DEFAULT_COLOUR = 5;         // blue, for every sequence except...
const HP_SHORT_COLOUR = 7;           // ...short circuit, which defaults to orange
const HP_DIM_SPEED = 5;              // when the speed digit is omitted on sequence 3
const HP_CYCLE_MS = 575;             // fixed; sequence 4 ignores the speed digit
const HP_RAINBOW_MS = 10;            // one wheel step, so 2560 ms per rotation
const HP_RAINBOW_RESET = 1280;       // five full turns before the counter is re-sampled
const HP_SC_MAX_LOOPS = 20;          // a <= test against a zero-based counter: 21 pairs

/* Arduino's random(a, b) is [a, b-1] — the upper bound is EXCLUSIVE, and
   several of the ranges below only make sense once you have absorbed that
   (randRange(15, 25) is 15..24, not 15..25). Everything random in the
   lighting layer goes through leRand so a test has one seam to seed. */
const hpRandRange = (a, b) => a + leRand(b - a);
/* Arduino's map(), which is integer and truncates TOWARD ZERO. The dim
   pulse maps a speed onto an inverted range, so the quotient is negative
   and the rounding direction is visible in the table: speed 5 gives 37 ms,
   which a floor() would make 36. */
const hpMap = (x, inLo, inHi, outLo, outHi) =>
  Math.trunc((x - inLo) * (outHi - outLo) / (inHi - inLo)) + outLo;
const hpRGB = (r, g, b) => ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);

/* ---------------------------------------------------------- the palette
   basicColor(colour, variant): the colour digit picks a row, the variant
   picks a column, and this one table is where every colour in the file
   comes from except Rainbow and Dim Pulse, which each have their own
   generator and do not agree with it.

   Columns 0-2 are the pure base colour, 3 is white, 4-6 are tints, 7-9 are
   black. So an effect that draws variant = randRange(0, 10) per pixel gets
   30% base, 10% white, 30% tint, 30% OFF — and that 30% black is the whole
   reason Leia scintillates instead of glowing.

   Row 0 is not "pick a random colour": it is a fixed row of eight hues plus
   two blacks. Passing variant 0 against it yields plain red.

   The tints are not consistently ordered between rows — blue's palest is
   column 4 while red's palest is column 6 — so the table is transcribed
   verbatim rather than synthesised from the base colour. */
const HP_COLORS = [
  [0xFF0000, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0xFF00FF, 0x800080, 0xFFFFFF, 0x000000, 0x000000],
  [0xFF0000, 0xFF0000, 0xFF0000, 0xFFFFFF, 0xFFA0A0, 0xFD5555, 0xFFD3D3, 0x000000, 0x000000, 0x000000],
  [0xFFFF00, 0xFFFF00, 0xFFFF00, 0xFFFFFF, 0xFDFD43, 0xFFFF82, 0xFFFFBA, 0x000000, 0x000000, 0x000000],
  [0x00FF00, 0x00FF00, 0x00FF00, 0xFFFFFF, 0x57FC57, 0x80FC80, 0xBDFFB1, 0x000000, 0x000000, 0x000000],
  [0x00FFFF, 0x00FFFF, 0x00FFFF, 0xFFFFFF, 0x38FFFF, 0x71FDFD, 0xA4FDFD, 0x000000, 0x000000, 0x000000],
  [0x0000FF, 0x0000FF, 0x0000FF, 0xFFFFFF, 0xACACFF, 0x7676FF, 0x5A5AFF, 0x000000, 0x000000, 0x000000],
  [0xFF00FF, 0xFF00FF, 0xFF00FF, 0xFFFFFF, 0xFB3BFB, 0xFD75FD, 0xFD9EFD, 0x000000, 0x000000, 0x000000],
  [0xFF8000, 0xFF8000, 0xFF8000, 0xFFFFFF, 0xFB9B3A, 0xFFBE7D, 0xFCD2A7, 0x000000, 0x000000, 0x000000],
  [0x800080, 0x800080, 0x800080, 0xFFFFFF, 0xA131A1, 0x9B449B, 0xBD5FBD, 0x000000, 0x000000, 0x000000],
  [0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xB7B6B6, 0x858484, 0xA09F9F, 0x000000, 0x000000, 0x000000]
];
/* The board bounds-checks neither index — an unset option1 is 255 and reads
   straight off the end of the table. It is unreachable in practice because
   no effect runs without a valid colour, but reading out of bounds here
   returns undefined and then NaN, which would poison the pixel buffer for
   the rest of the session. Wrapping is the divergence; the hardware reads
   whatever byte happens to follow the array. */
function hpBasicColor(colour, variant){
  const row = HP_COLORS[((colour | 0) % 10 + 10) % 10];
  return row[((variant | 0) % 10 + 10) % 10];
}

/* dimColorVal() — sequence 3's private generator, and the reason a dim
   pulse command does not mean what the colour table says it means. It is
   an INVERSE brightness: `b` is a divisor, so the larger the number the
   dimmer the pixel, and the curve 255/b is hyperbolic. Peak stored value is
   31 (at b = 8) and after the global scale that is about 12 on the wire.
   Dim pulse is meant to be barely there.

   The numbering disagrees with HP_COLORS in three places, all of them
   visible to a user: 8 renders WHITE here and purple there, 9 renders
   nothing here and white there, and orange's green channel is 180/b rather
   than the 128 of kOrange. HPF00390 — dim pulse, "random" colour — is a
   black holo whenever the draw lands on 0 or 9. */
function hpDimColor(colour, b){
  if(b <= 0) return 0;
  const v = Math.floor(255 / b), o = Math.floor(180 / b);
  switch(colour | 0){
    case 1: return hpRGB(v, 0, 0);
    case 2: return hpRGB(v, v, 0);
    case 3: return hpRGB(0, v, 0);
    case 4: return hpRGB(0, v, v);
    case 5: return hpRGB(0, 0, v);
    case 6: return hpRGB(v, 0, v);
    case 7: return hpRGB(v, o, 0);
    case 8: return hpRGB(v, v, v);
    default: return 0;
  }
}

/* Not Adafruit's wheel. This one starts on GREEN and runs green -> red ->
   blue -> green, so a rainbow holo and a rainbow logic display are a third
   of a turn out of phase with each other. All three ramps stay inside a
   byte: 85 * 3 is exactly 255. */
function hpWheel(pos){
  let p = pos & 0xFF;
  if(p < 85) return hpRGB(p * 3, 255 - p * 3, 0);
  if(p < 170){ p -= 85; return hpRGB(255 - p * 3, 0, p * 3); }
  p -= 170;
  return hpRGB(0, p * 3, 255 - p * 3);
}

/* --------------------------------------------------------- one projector
   `spec` is a row of LE_HOLOS. The twitch timer is armed here rather than
   at first frame because the constructor does the same, and the difference
   is observable: a holo built and left alone twitches 45-179 s later.

   (The member initialisers say the first LED twitch is 3.8-4.7 s and the
   first servo twitch 4 s. Both are dead — the constructor body overwrites
   them immediately with the interval draws — so they are not implemented.
   Nobody should re-add them from the "HPs start 4 seconds after boot"
   comment they are attached to.) */
function leMakeHolo(spec){
  const h = {
    key: spec.key, letter: spec.letter, label: spec.label, pin: spec.pin,
    count: HP_PIXELS,
    rgb: new Uint8Array(HP_PIXELS * 3),
    bright: HP_BRIGHT,
    dirty: true,

    /* `counter` and `interval` are shared by every effect, which is not the
       tidy design it looks like — see hpVarResets. */
    counter: 0, interval: 100,
    frame: 0,                             // cycle's step
    scLoop: 0, scFlag: false, scInterval: 10,

    ledFn: 255, ledOpt1: 255, ledOpt2: 255,
    ledHalt: -1, ledHaltTime: 0,

    /* 0 off, 1 fire the default command, 2 fire a random one. On from boot,
       unlike the servo twitch, which is off until something enables it. */
    twitchOn: 1, twitchStart: 1,
    twitchEvery: [45, 180], twitchRun: [5, 25],
    twitchDefault: [1, HP_DEFAULT_COLOUR, 0],
    twitchAt: 0, twitchRunFor: 0,

    acc: 0, frames: 0
  };
  h.twitchAt = 1000 * hpRandRange(h.twitchEvery[0], h.twitchEvery[1]);
  return h;
}

/* ------------------------------------------------------------ the pixels */
function hpPaint(h, i, c){
  const o = i * 3;
  h.rgb[o] = (c >> 16) & 0xFF;
  h.rgb[o + 1] = (c >> 8) & 0xFF;
  h.rgb[o + 2] = c & 0xFF;
  h.dirty = true;
}
function hpFill(h, c){
  for(let i = 0; i < h.count; i++) hpPaint(h, i, c);
}
function hpOff(h){ h.rgb.fill(0); h.dirty = true; }

/* What the 3D renderer reads. The global brightness is NOT baked into the
   stored pixels on the board — both driver backends apply it as a scale at
   push time — so h.rgb holds the raw effect output and the scale lands
   here, in Adafruit's form. Skip it and dim pulse comes out three times too
   bright, which is enough to make it look like an ordinary fade. */
function hpCell(h, i){
  const o = i * 3, b = (h.bright & 0xFF) + 1;
  return [(h.rgb[o] * b) >> 8, (h.rgb[o + 1] * b) >> 8, (h.rgb[o + 2] * b) >> 8];
}

/* --------------------------------------------------------------- state
   varResets() — every new command and every twitch fire runs this.

   `counter` is deliberately absent: it keeps whatever timestamp the last
   effect left in it. Every effect's first pass therefore sees a huge
   elapsed and fires immediately, which is what makes Cycle, Leia and Short
   Circuit start instantly instead of after a beat. Zero it "helpfully" and
   all three gain a dead first step. */
function hpVarResets(h){
  h.frame = 0;
  h.scFlag = false; h.scLoop = 0; h.scInterval = 10;
  h.interval = 100;
  hpOff(h);
}
/* flushLEDState() — go idle. The real one first tests an `offColor` field
   for a permanent idle glow (LED function 100), but offColor is -1 and has
   no setter anywhere in the library, so that branch and function 100 are
   both unreachable: not implemented, and not to be re-added from the docs. */
function hpFlushLED(h){
  h.ledFn = 255; h.ledOpt2 = 255; h.ledHalt = -1;
}
function hpResetTwitch(h, now){
  hpOff(h);
  h.twitchAt = now + 1000 * hpRandRange(h.twitchEvery[0], h.twitchEvery[1]);
}
/* Both setters are silently ignored unless min < max — no error, no clamp,
   the call simply does nothing. Reproduced because a caller that gets the
   arguments backwards on the board sees the defaults, not a swap. */
function hpSetTwitchInterval(h, min, max){
  if(!(min < max)) return;
  h.twitchEvery = [min | 0, max | 0];
  hpResetTwitch(h, h.frames * 10);
}
function hpSetTwitchRunInterval(h, min, max){
  if(!(min < max)) return;
  /* The board also seeds a run time here, in MILLISECONDS, while the fire
     path recomputes it in seconds. The seeded value is never read; storing
     it would be storing a unit bug. */
  h.twitchRun = [min | 0, max | 0];
}
function hpSetTwitchDefault(h, seq, colour, speed){
  h.twitchDefault = [seq | 0, colour | 0, speed | 0];
}

/* ------------------------------------------------------------- effects
   Sequences 1 and 2 are one effect. Sequence 1 hard-codes blue and throws
   away the colour digit the parser went to the trouble of reading; sequence
   2 is the same code with the digit honoured. Each pixel draws its own
   variant, so roughly two of the seven are dark in any given field, and the
   field is redrawn every 50-149 ms — about 10 Hz, jittered. */
function hpFxProjector(h, now, colour){
  if(now - h.counter <= h.interval) return;
  for(let i = 0; i < h.count; i++) hpPaint(h, i, hpBasicColor(colour, hpRandRange(0, 10)));
  h.counter = now;
  h.interval = hpRandRange(50, 150);
}

/* Sequence 3. The only one that reads the speed digit, and the only one
   whose maths needs the table in front of you:

     speed  0   1   2   3   4   5   6   7   8   9
     inter  75  68  60  52  44  37  29  21  13  5     ms per step
     cycle  4800 ... 2368 (default speed 5) ... 320   ms per 64 steps

   `frames` triangles 0 -> 32 -> 0 across those 64 steps and the value handed
   to the generator is 8x that, i.e. 0 -> 256 -> 0. Because the generator
   divides BY it, the result is: snap on to 31, hyperbolic decay to black at
   mid-cycle, hyperbolic rise back to 31, snap off.

   THE 100 ms DEAD ZONE is the outer gate. It compares against the shared
   `interval`, which varResets left at 100 and which this effect never
   updates — so nothing is drawn during the first 100 ms of every cycle and
   the pixels hold black. At speed 9 that eats 31% of the cycle and `frames`
   jumps straight from 0 to 20, which turns the breathe into a ramp-and-cut.
   It looks like a bug and it is the effect's character.

   One thing the 10 ms quantum costs us: at speeds 8 and 9 the step interval
   is 13 and 5 ms, so some steps land inside a frame and are skipped, and at
   speed 9 the peak value of 31 falls between samples and never renders. The
   board, looping at kilohertz, catches them. Fixing it would mean giving
   this one effect its own sub-quantum clock, and the visible difference at
   4 ms of a 320 ms cycle is nothing. */
function hpFxDimPulse(h, now, colour, speed){
  const inter = hpMap(speed, 0, 9, 75, 5);
  if(now - h.counter <= h.interval) return;
  const elapsed = now - h.counter;
  let frames = Math.floor(elapsed / inter);
  if(frames >= 64) h.counter = now;
  if(frames > 32) frames = 64 - frames;
  /* Entering the effect with a stale counter makes elapsed enormous, so the
     mirror above goes strongly negative and the board divides 255 by a
     negative number, storing whatever the byte cast makes of it — one dark
     garbage frame, then a clean cycle. In JS that is a negative channel and
     a poisoned Uint8Array, so this is the divergence: clamp to 0 and draw
     the black frame the hardware effectively shows anyway. */
  if(frames < 0) frames = 0;
  if(elapsed >= inter) hpFill(h, hpDimColor(colour, frames * 8));
}

/* Sequence 4. A single lit pixel chasing the ring at a fixed 575 ms — the
   speed digit is ignored — in the pure base colour, so colour 0 is red
   rather than anything random.

   ASTROPIXELS is #defined unconditionally at the top of the library file,
   so the centre-skip branch is the one that ships: the walk is 0,1,2,3,4,5
   and straight back to 0 with NO blank step, because frame 6 is bumped to 7
   and immediately wrapped. Six steps, 3450 ms a lap. A port that leaves the
   blank step in runs a whole 575 ms per lap too slow and the chase visibly
   hitches once round. (The 12-pixel OLED variants take the other branch and
   are not modelled here.)

   Rounded up to the 10 ms quantum the step is 580 ms and the lap 3480, half
   a percent slow. That is the price of the fixed accumulator and it is paid
   by every gated effect in the folder. */
function hpFxCycle(h, now, colour){
  if(now - h.counter <= HP_CYCLE_MS) return;
  h.counter = now;
  const lit = hpBasicColor(colour, 0);
  hpPaint(h, 6, 0);                        // the centre is never part of the chase
  if(h.frame === 6) h.frame++;
  if(h.frame >= 7) h.frame = 0;
  for(let i = 0; i < 6; i++) hpPaint(h, i, i === h.frame ? lit : 0);
  h.frame++;
}

/* Sequence 6. One wheel step per 10 ms, offset around the ring by
   floor(i * 256 / 7) — 0, 36, 73, 109, 146, 182, 219 — and the centre pixel
   takes the last of those, so rainbow is the one effect that lights it.

   The counter re-sample after 1281 steps draws nothing for that single
   pass: an invisible hiccup every 12.8 s. It is invisible because the wheel
   index is masked to a byte and the phase is continuous across it, so this
   could be dropped — it is kept because keeping it costs nothing and means
   the frame counts line up if anyone ever diffs against a board. */
function hpFxRainbow(h, now){
  const elapsed = now - h.counter;
  const frames = Math.floor(elapsed / HP_RAINBOW_MS);
  if(frames > HP_RAINBOW_RESET){ h.counter = now; return; }
  for(let i = 0; i < h.count; i++){
    hpPaint(h, i, hpWheel(Math.floor(i * 256 / h.count) + frames));
  }
}

/* Sequence 7, the only self-terminating one. A stuttering flash whose
   half-period grows as 10 + n * U{15..24} ms, so it starts as a 10 ms
   flicker and ends as a lazy half-second blink.

   Two things everyone gets wrong. First, the interval is recomputed on the
   OFF transition only, so each ON phase INHERITS the duration of the OFF
   phase before it — it is a symmetric square wave, not an accelerating
   stutter with fixed flashes. Second, the guard admits scLoop 0 through 20
   inclusive: 21 pairs, about 8.6 s, and the last event is an ON.

   So the effect stops with the holo LIT, holding its final speckle
   indefinitely, and because ledFn stays 7 (which is <= 99) it also blocks
   this holo's twitch forever. "Flickers, dies, then sits there glowing" is
   the correct behaviour; "flickers out and dies" is the naive port. */
function hpFxShortCircuit(h, now, colour){
  if(h.scLoop > HP_SC_MAX_LOOPS) return;
  if(now - h.counter <= h.scInterval) return;
  if(!h.scFlag){
    hpFill(h, 0);
    h.scFlag = true;
    h.scInterval = 10 + h.scLoop * hpRandRange(15, 25);
  } else {
    for(let i = 0; i < h.count; i++) hpPaint(h, i, hpBasicColor(colour, hpRandRange(0, 10)));
    h.scFlag = false;
    h.scLoop++;
  }
  h.counter = now;
  h.dirty = true;
}

/* ------------------------------------------------------------- a frame
   One 10 ms quantum, in the order the board's animate() does it, because
   the order is observable: the twitch check runs AFTER the dispatch, so a
   twitch that fires on this frame draws nothing until the next one. */
function hpFrame(h){
  h.frames++;
  const now = h.frames * 10;

  /* The |seconds runtime, and also how a twitch ends. Note it re-arms the
     twitch timer, which is the second time that timer is set for a twitch
     that fired — and this one wins. That is why the documented 45-180 s
     interval is measured from the END of the previous twitch: 5-24 s of
     light, then 45-179 s of dark. */
  if(h.ledHalt !== -1 && h.ledHaltTime + h.ledHalt * 1000 < now){
    hpFlushLED(h);
    hpOff(h);
    hpResetTwitch(h, now);
  }

  switch(h.ledFn){
    case 1: hpFxProjector(h, now, HP_DEFAULT_COLOUR); break;   // Leia: colour digit ignored
    case 2: hpFxProjector(h, now, h.ledOpt1); break;
    case 3: hpFxDimPulse(h, now, h.ledOpt1, h.ledOpt2); break;
    case 4: hpFxCycle(h, now, h.ledOpt1); break;
    case 5: hpFill(h, hpBasicColor(h.ledOpt1, 0)); break;      // repainted every pass
    case 6: hpFxRainbow(h, now); break;
    case 7: hpFxShortCircuit(h, now, h.ledOpt1); break;
    /* 96-99 are state commands, not animations: they run for exactly one
       pass and then flush themselves to idle. Each also writes an
       offColorOverride flag — true for 96/97, false for 98/99, the opposite
       way round from what the doc-comment claims — which nothing anywhere
       reads, so it is not stored here. */
    case 96: case 98:
      h.twitchOn = 0;
      hpResetTwitch(h, now); hpFlushLED(h);
      break;
    case 97: case 99:
      h.twitchOn = (h.ledOpt1 === 1 || h.ledOpt1 === 2) ? h.ledOpt1 : h.twitchStart;
      hpResetTwitch(h, now); hpFlushLED(h);
      break;
    /* Function 0 is what a truncated command like `HPF` produces. It is not
       an effect — the pixels were cleared by varResets and nothing repaints
       them — but it is <= 99, so it also parks the twitch. "Dark and staying
       dark" is a real, reachable, undocumented state. 255 is idle: nothing
       drawn, pixels hold whatever the last effect left. */
    default: break;
  }

  /* The idle gate is `> 99`, and ledFunction is a byte whose "no function"
     sentinel is -1 stored as 255. So ANY running sequence — including one
     that has finished but left its number behind, like short circuit —
     suppresses the twitch for as long as it is set. Issue a non-terminating
     sequence without a |seconds and that holo never twitches again. */
  if(now > h.twitchAt && h.twitchOn >= 1 && h.ledFn > 99){
    h.twitchAt = now + 1000 * hpRandRange(h.twitchEvery[0], h.twitchEvery[1]);
    h.twitchRunFor = hpRandRange(h.twitchRun[0], h.twitchRun[1]);
    hpFlushLED(h);
    h.ledHaltTime = now;
    hpVarResets(h);
    if(h.twitchOn === 2){
      /* Random mode draws 2..6 and 1..8: Leia and short circuit can never
         be twitched into, and neither can white or the random-hue row. */
      h.ledFn = hpRandRange(2, 7);
      h.ledOpt1 = hpRandRange(1, 9);
      h.ledOpt2 = hpRandRange(1, 9);
    } else {
      h.ledFn = h.twitchDefault[0];
      h.ledOpt1 = h.twitchDefault[1];
      h.ledOpt2 = h.twitchDefault[2];
    }
    h.ledHalt = h.twitchRunFor;
  }
}

/* Real elapsed time in, whole frames out — the same accumulator and the
   same catch-up cap as leAdvance, and for the same reason: a backgrounded
   tab must not come back and run ten minutes of short circuit at once. */
function hpAdvance(h, dtMs){
  h.acc += dtMs;
  if(h.acc > 250) h.acc = 250;
  let n = 0;
  while(h.acc >= 10 && n < 25){ h.acc -= 10; hpFrame(h); n++; }
  return n;
}

/* ------------------------------------------------------------- commands
   The fields of a parsed HP command, already split out by whoever read the
   string. Absent means null or undefined; the defaults applied here are the
   board's, not the documentation's, and they are not symmetrical:

     · no colour digit gives orange on sequence 7 and blue on everything
       else, because short circuit has its own default;
     · a literal 0 colour digit is replaced by a draw from 0..8, so the
       "random" colour can never be white and CAN be the random-hue row;
     · the speed digit is read into a local and thrown away unless the
       sequence is 3.

   `random` is the same option slot under the name it goes by on functions
   96-99, where the digit means 1 = default twitch sequences, 2 = random.
   It takes the 0-rewrite too, which is why HPA0970 enables the twitch about
   two times in nine and otherwise falls back to the boot setting. */
function hpCommand(h, cmd){
  const c = cmd || {};
  const now = h.frames * 10;
  const seq = (c.seq == null) ? 0 : (c.seq | 0);

  let opt = (c.random != null && seq >= 96) ? (c.random | 0)
          : (c.colour == null ? null : (c.colour | 0));
  if(opt === null) opt = (seq === 7) ? HP_SHORT_COLOUR : HP_DEFAULT_COLOUR;
  else if(opt === 0) opt = hpRandRange(0, 9);

  const speed = (c.speed == null) ? HP_DIM_SPEED : (c.speed | 0);
  const secs = c.secs | 0;

  /* The flush first, then the overwrite. On the board the flush's only
     lasting effect on this path is clearing the halt and option 2 — the
     function it sets is thrown away on the very next line. */
  hpFlushLED(h);
  h.ledFn = seq;
  h.ledOpt1 = opt;
  h.ledOpt2 = (seq === 3) ? speed : 255;
  h.ledHalt = (secs >= 1) ? secs : -1;
  h.ledHaltTime = now;
  hpVarResets(h);
}
