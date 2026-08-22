'use strict';
/* =====================================================================
   ASTROPIXELS — the twenty-five effects
   =====================================================================

   Every entry in LFX is handed the display and a flag that is true on the
   one frame the effect started, and answers "keep me" or "I am done". The
   engine has already restored the board's own settings and rebuilt the
   colour ramp by the time the first call arrives, so an effect's first
   frame is where it states what it wants — palette, hue, brightness, tick
   — and every later frame just leans on the walk.

   Three shapes of effect live here and it is worth naming them, because
   confusing them is how the timings go wrong:

     · the ones that only change SETTINGS and then call leDraw(). They do
       not draw anything themselves; the per-LED walk draws, at its own
       scattered pace, which is why they dissolve rather than switch.
     · the ones that read the tick as a SQUARE WAVE — leFlip(). One full
       cycle is two ticks, each half one tick.
     · the ones that CONSUME the tick — leFlipTake(). They step once and
       force the wave low, so the next rise re-arms them and their step
       rate is one tick, not two. Every scan line, scroll, wipe and the
       fire are this kind, and between steps they draw nothing at all: the
       panel simply holds whatever was last written.

   ------------------------------------------------------ fidelity notes

   The constants here are not tunable taste, they are the dome. Where the
   real board does something that reads as a bug, this file does the same
   thing and says so at the site — the dead blank-in, the roaming pixel's
   missing `+1`, the wrap test that buys it an extra tick a row, the scan
   lines dwelling two ticks at each end, ALARM restoring settings without
   rebuilding the ramp it is meant to be alternating with.

   Two things in this file deliberately do NOT follow it, both because a
   browser cannot: FIRE's interpolation counter, which runs away without
   bound on the board, is clamped; and the text renderer's line feed uses
   the font's own height rather than the hard-coded 5 that overlaps rows
   of the four-row font. Both are commented where they bite. (The third
   such divergence, the effect table's off-by-one overrun, is engine.js's
   and is commented there.)

   The one thing that is genuinely OURS rather than transcribed is the
   FIRE mask pair — see the note there. Everything else is the published
   behaviour, re-implemented.
   ===================================================================== */

/* ------------------------------------------------------------ the mic
   ALARM, LEIA, REDALERT, MICBRIGHT and MICRAINBOW are all driven by the
   board's microphone peak detector, and a simulator has no microphone.
   Another module is expected to define leMicLevel(); until one does — and
   in a headless test there never will be — this returns 0, which is a
   real hardware state too (a silent room), so every caller has to behave
   sensibly at zero rather than assume sound. What zero looks like is
   noted at each effect, and some of those answers are "a black panel" —
   ALARM has nothing but the peak to light it. That is correct, not a
   failure, and a simulator that wants those five effects to do something
   should synthesise a level rather than have them fake one. */
function lePeak(){
  if(typeof leMicLevel !== 'function') return 0;
  const v = leMicLevel() | 0;
  return v < 0 ? 0 : (v > 255 ? 255 : v);
}

/* Arduino's map(), which is integer and truncates toward zero, and which
   several effects call with the input range REVERSED to get a descending
   ramp. Do not "fix" that by swapping the arguments at the call site: the
   reversal is how FAILURE fades out. */
function leMapRange(x, inLo, inHi, outLo, outHi){
  if(inHi === inLo) return outLo;
  return Math.trunc((x - inLo) * (outHi - outLo) / (inHi - inLo)) + outLo;
}

/* The board's setBrightness() only stores the number; the ramp is not
   rebuilt until something else calls calculateAllColors(). Nearly every
   effect follows it immediately with setPaletteHue(), so the engine's
   leSetBri() rebuilding is harmless there — but FAILURE and LEIA set a
   brightness that must reach the pixels through the per-pixel path alone,
   and rebuilding the ramp underneath them would apply the fade twice and
   run it to black in half the time. Hence this. */
function leBriOnly(d, b){ d.set.bri = b & 0xFF; }

/* restoreSettings() on the board puts the numbers back but does NOT
   recalculate the ramp, so whatever palette was last computed stays on
   screen. Only ALARM depends on that (§8.1's second quirk) and the
   engine's leRestore() does rebuild, so ALARM needs its own. */
function leRestoreNoRamp(d){
  d.set.fade = d.def.fade; d.set.hue = d.def.hue; d.set.delay = d.def.delay;
  d.set.pal = d.def.pal; d.set.bri = d.def.bri;
  d.range = 1;
}

/* --------------------------------------------------------------- text
   The three font brightnesses the glyph renderer draws with — and they
   really are this dim. V is squared on its way to RGB, so V=1 lands on
   black and V=16 on nearly black; only the top level is properly visible.
   Text on a logic display is a whisper compared with the patterns, which
   is exactly how the real thing reads. */
const LE_FONT_BRI = [1, 16, 64];

/* With no message set the board falls back to a literal, and so do we —
   an empty panel would look like a broken effect rather than a display
   nobody has told what to say. (The library also has a message-index
   digit in the command word, but it overlaps the sequence digits and is
   unreachable in practice; the simulator sets text through leSetText.) */
const leMsgOf = d => (d.text ? d.text : 'STAR WARS');

/* renderText: clear the panel, then walk the string laying glyphs left to
   right with a one-column gap. Clipping is per pixel, which is what makes
   a half-scrolled message look right at the edges — the glyph is not
   skipped, its off-panel columns simply do not land.

   A newline returns to the starting column and drops one glyph height.
   The board hard-codes a drop of 5 there whatever font it is using, which
   overlaps consecutive lines of the 4-row rear font; we use the font's
   own height instead. That is a deliberate difference and the only one in
   the text path. */
function leRenderText(d, x, y, hue){
  const tall = leTallFont(d);
  const msg = leMsgOf(d);
  const lineH = tall ? LE_FONT_TALL_H : LE_FONT_SHORT_H;
  leClear(d);
  let cx = x, cy = y;
  for(let i = 0; i < msg.length; i++){
    const ch = msg.charAt(i);
    if(ch === '\n'){ cx = x; cy += lineH; continue; }
    if(cy >= d.h) break;                     // nothing below here can land
    const g = leGlyph(ch, tall);
    if(cx < d.w){
      for(let gx = 0; gx < g.w; gx++) for(let gy = 0; gy < g.h; gy++){
        const lv = leGlyphLevel(g, gx, gy);
        if(lv) leSetPixel(d, cx + gx, cy + gy, hue, LE_FONT_BRI[lv - 1]);
      }
    }
    cx += g.w + 1;
  }
}
const leMsgW = d => leTextWidth(leMsgOf(d), leTallFont(d));
const leMsgH = d => leTextHeight(leMsgOf(d), leTallFont(d));

/* -------------------------------------------------------------- rows
   Whole-row and whole-column writes, the primitive every scan line and
   wipe is made of. They take the panel's real width and height so a 27x4
   rear logic running a vertical scan draws a four-pixel bar and a 10x10
   slant draws a ten-pixel one; nothing here may assume a shape. */
function leRow(d, y, hue, bri){ for(let x = 0; x < d.w; x++) leSetPixel(d, x, y, hue, bri); }
function leCol(d, x, hue, bri){ for(let y = 0; y < d.h; y++) leSetPixel(d, x, y, hue, bri); }

/* ===================================================================== */

/* 0 NORMAL — the idle animation, and the thing every other effect is a
   modification of. Nothing to set up: the engine's restore has already
   put the board's own palette back, and from here it is ninety little
   state machines crawling the ramp. The colour and speed digits are
   ignored entirely; a command that wants a coloured idle wants SOLIDCOLOR. */
LFX[LE_SEQ.NORMAL] = function(d, first){
  leDraw(d);
  return true;
};

/* 1 ALARM — the colour, then red, then the colour, at mic brightness.
   Two quirks, both kept. The opening setPaletteHue is pointless because
   the flip-flop branch overwrites it on the same frame, and we still make
   the call because dropping it would hide that the library makes it. And
   the colour-0 branch restores settings WITHOUT rebuilding the ramp, so
   the monotone red stays on screen and "alternating" with the default is
   invisible — ALARM with no colour is a red mic meter and nothing else.
   With no microphone the peak is 0 and the panel is black. */
LFX[LE_SEQ.ALARM] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetPalHue(d, 2, d.id === 1 ? 170 : 72);
    leSetTick(d, 250 * (leSpeed(d) + 1));
  }
  if(leFlip(d)){
    if(leColour(d) === 0) leRestoreNoRamp(d);
    else leSetPalHue(d, 2, hue);
  } else {
    leSetPalHue(d, 2, 0);
  }
  leDraw(d, lePeak());
  return true;
};

/* 2 FAILURE — scored to the scream. fade and delay both drop to zero so
   every LED steps every frame and the whole 90-state walk takes 0.9 s: a
   fast shimmer instead of a scintillation. Then the hue runs away, then
   it fades out over two seconds, and then it sits BLACK for ten seconds
   before handing back at eighteen. That dead tail is not a mistake in the
   transcription — the code really does return true until 18 s while the
   sequence it is scored to finished at 8. */
LFX[LE_SEQ.FAILURE] = function(d, first){
  if(first){ leSetFade(d, 0); leSetDelay(d, 0); }
  const t = leMs(d);
  if(t > 1800 && t < 6000) d.set.hue = (d.set.hue + 1) & 0xFF;
  if(t >= 6000 && t < 8000) leBriOnly(d, leMapRange(t - 6000, 2000, 0, 0, 255));
  leDraw(d);
  return t < 18000;
};

/* 3 LEIA — the hologram, 34 s to match the message audio. The entire
   46-entry ramp is rebuilt every frame here, at 100 Hz, because the
   brightness tracks the microphone and the board bakes brightness into
   the ramp. Wasteful and completely deliberate.

   updateDisplay(255) is the point: at 255 the per-pixel scale is skipped
   and the ramp's own V is used verbatim, so the mic level arrives once
   rather than squared. Silence gives a still hue-60 panel at V=50, which
   is the flickering blue-green it settles to between words. */
LFX[LE_SEQ.LEIA] = function(d, first){
  if(first) leSetPalHue(d, 2, 60);
  const peak = Math.min(lePeak(), 100);
  const hue = 60 + leMapRange(peak, 0, 100, 0, 20);
  leBriOnly(d, leMapRange(peak, 0, 100, 50, 255));
  leSetPalHue(d, 2, hue);
  leDraw(d, 255);
  return leMs(d) < 34000;
};

/* 4 MARCH — 48.3 seconds cut to the Imperial March, which opens with half
   a second of silence, which is why segment one is the long one. The hue
   walks 0, 32, 64 … a segment at a time, but ONLY if no colour was asked
   for; a commanded colour keeps its hue and gets just the last segment's
   speed-up to 175 ms, the strobe over the final three seconds.

   The window tests are strict at both ends, so on the exact boundary
   millisecond no segment matches and the hue holds. Harmless, and copied.

   The thirds split is what makes it read as marching: three blocks to a
   row means the phase inverts on every row and the panel checkerboards.
   A panel whose width is not a multiple of three cannot do that and falls
   back to a top/bottom swap — the 27-wide rear logic checkerboards in
   9-wide blocks, the 20-wide toolbox front does not checkerboard at all. */
LFX[LE_SEQ.MARCH] = function(d, first){
  const speed = leSpeed(d);
  if(first){ leSetPalHue(d, 2, leHue(d)); leSetTick(d, 150 * (speed + 1)); }
  const t = leMs(d), plain = (leColour(d) === 0);
  if(t < 9800){ if(plain) leSetPalHue(d, 2, 0); }
  else if(t > 9800 && t < 14500){ if(plain) leSetPalHue(d, 2, 32); }
  else if(t > 14500 && t < 19300){ if(plain) leSetPalHue(d, 2, 64); }
  else if(t > 19300 && t < 28800){ if(plain) leSetPalHue(d, 2, 96); }
  else if(t > 28800 && t < 38300){ if(plain) leSetPalHue(d, 2, 128); }
  else if(t > 38300 && t < 45300){ if(plain) leSetPalHue(d, 2, 160); }
  else if(t > 45300 && t < 48300){
    if(plain) leSetPalHue(d, 2, 192);
    leSetTick(d, 175);
  }
  const on = leFlip(d);
  leDrawSplitThirds(d, on ? 255 : 50, on ? 50 : 255);
  return t < 48300;
};

/* 5 SOLIDCOLOR — not solid. It is the ordinary walk over the monotone
   palette with a hue offset, and palette 2's first fifteen entries are
   all black, so a third of every LED's cycle is spent dark. That is the
   twinkle, and it is the reason "solid red" on a logic display looks like
   embers rather than a red rectangle. */
LFX[LE_SEQ.SOLIDCOLOR] = function(d, first){
  if(first) leSetPalHue(d, 2, leHue(d));
  leDraw(d);
  return true;
};

/* 6 FLASHCOLOR — the whole panel between full ramp V and a fiftieth-ish
   of it, one tick each way. Because a paused LED is not written, the
   change washes across the panel over a few tenths of a second instead of
   snapping; on the rear logic (delay 40) it is visibly lazier. */
LFX[LE_SEQ.FLASHCOLOR] = function(d, first){
  if(first){ leSetPalHue(d, 2, leHue(d)); leSetTick(d, 250 * (leSpeed(d) + 1)); }
  leDraw(d, leFlip(d) ? 255 : 50);
  return true;
};

/* 7 FLIPFLOPCOLOR — top half bright, bottom half dim, swapping each tick.
   The split is by LED INDEX rather than by row, which for a serpentine
   map comes to the same thing on every stock board. */
LFX[LE_SEQ.FLIPFLOPCOLOR] = function(d, first){
  if(first){ leSetPalHue(d, 2, leHue(d)); leSetTick(d, 200 * (leSpeed(d) + 1)); }
  const on = leFlip(d);
  leDrawSplitHalf(d, on ? 255 : 50, on ? 50 : 255);
  return true;
};

/* 8 FLIPFLOPALTCOLOR — the same thing in thirds, so it checkerboards. */
LFX[LE_SEQ.FLIPFLOPALTCOLOR] = function(d, first){
  if(first){ leSetPalHue(d, 2, leHue(d)); leSetTick(d, 200 * (leSpeed(d) + 1)); }
  const on = leFlip(d);
  leDrawSplitThirds(d, on ? 255 : 50, on ? 50 : 255);
  return true;
};

/* 9 COLORSWAP — the colour and its exact complement, half a wheel apart.
   Only the additive hue offset moves, so the ramp is never rebuilt and
   the swap costs nothing; and because paused LEDs keep their old colour
   the panel crossfades through the change LED by LED. */
LFX[LE_SEQ.COLORSWAP] = function(d, first){
  const hue = leHue(d);
  if(first){ leSetPalHue(d, 2, 0); leSetTick(d, 350 * (leSpeed(d) + 1)); }
  d.set.hue = leFlip(d) ? hue : (hue >= 128 ? hue - 128 : hue + 128);
  leDraw(d);
  return true;
};

/* 10 RAINBOW — +20 hue on EVERY flip-flop transition, both edges, so the
   step rate is one tick even though nothing consumes the wave. 256/20 is
   12.8 ticks to the wheel, about 2.5 s at speed 0. The colour digit only
   picks where the rotation starts. */
LFX[LE_SEQ.RAINBOW] = function(d, first){
  if(first){
    leSetPalHue(d, 2, leHue(d));
    leSetTick(d, 200 * (leSpeed(d) + 1));
    d.d1 = leFlip(d) ? 1 : 0;
  }
  const now = leFlip(d) ? 1 : 0;
  if(now !== d.d1){ d.set.hue = (d.set.hue + 20) & 0xFF; d.d1 = now; }
  leDraw(d);
  return true;
};

/* 11 REDALERT — the board's own colours until the room gets loud enough,
   then the alert colour. The threshold is speed*256/10, and note what the
   two ends of that do: at speed 0 the threshold is 0, `peak < 0` is never
   true and the display is permanently in alert; at any other speed with
   no microphone fitted it is permanently calm. There is no speed at which
   a silent simulator alternates. */
LFX[LE_SEQ.REDALERT] = function(d, first){
  const threshold = Math.floor(leSpeed(d) * 256 / 10);
  if(lePeak() < threshold) leRestore(d);
  else leSetPalHue(d, 2, leHue(d));
  leDraw(d);
  return true;
};

/* 12 MICBRIGHT — the panel as a VU meter, with the speed digit setting a
   floor under the level so it never goes fully dark.

   Two quirks worth knowing before wiring a microphone up to this. With no
   colour the restore runs AFTER the brightness is set and throws it away,
   so colour 0 does not respond to sound at all — it is the board default
   at board brightness. With a colour, the level is baked into the ramp
   and then applied a second time per pixel, so loudness reads roughly
   quadratic before hsv2rgb squares it again. Silent, the panel sits at
   whatever the speed digit's floor is: black at speed 0. */
LFX[LE_SEQ.MICBRIGHT] = function(d, first){
  const threshold = Math.floor(leSpeed(d) * 256 / 10);
  leBriOnly(d, Math.max(lePeak(), threshold));
  if(leColour(d) === 0) leRestore(d);
  else leSetPalHue(d, 2, leHue(d));
  leDraw(d);
  return true;
};

/* 13 MICRAINBOW — hue tracks the microphone directly, offset by the
   chosen colour, every frame with no tick involved. Silence pins the hue
   at the colour digit's own, so with no microphone this is SOLIDCOLOR. */
LFX[LE_SEQ.MICRAINBOW] = function(d, first){
  const hue = leHue(d);
  if(first) leSetPalHue(d, 2, hue);
  d.set.hue = (lePeak() + hue) & 0xFF;
  leDraw(d);
  return true;
};

/* 14 LIGHTSOUT — black, but not stopped. Every LED still steps and still
   burns its pause underneath, so leaving LIGHTSOUT resumes the walk
   mid-stride rather than from where it went dark. That is why the lights
   coming back on looks like the dome waking up instead of a freeze-frame. */
LFX[LE_SEQ.LIGHTSOUT] = function(d, first){
  if(first){ leSetBri(d, 0); leSetPalHue(d, 2, leHue(d)); }
  leDraw(d, 0);
  return true;
};

/* 15 TEXT — drawn once, then left alone. Nothing steps, nothing fades;
   the pixels written on the first frame are still there a minute later,
   which is why this one is normally issued with a seconds field.

   The library begins this and nine others by arming a 2000 ms black
   fade-in off hasEffectChangedType(), which compares a member that is
   never assigned to one that is assigned from it — it is true once at
   power-on and false for the rest of the board's life. The blank-in never
   happens on real hardware, so it does not happen here either. */
LFX[LE_SEQ.TEXT] = function(d, first){
  const hue = leHue(d);
  if(first){ leSetBri(d, 0); leSetPalHue(d, 2, hue); d.d1 = 0; }
  if(!d.d1){
    leRenderText(d, Math.floor(d.w / 2) - Math.floor(leMsgW(d) / 2), 0, hue);
    d.d1 = 1;
  }
  return true;
};

/* 16 TEXTSCROLLLEFT — one pixel per tick, 20 px/s at speed 0 down to 2
   px/s at speed 9, and it ENDS when the last column leaves the panel:
   returning false hands the display back to NORMAL rather than looping.
   Between ticks nothing is drawn at all, so the panel holds the frame. */
LFX[LE_SEQ.TEXTSCROLLLEFT] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, hue);
    leSetTick(d, 50 * (leSpeed(d) + 1));
    d.d1 = d.w;
  }
  if(leFlipTake(d)){
    leRenderText(d, d.d1, 0, hue);
    d.d1 -= 1;
    if(d.d1 + leMsgW(d) <= 0) return false;
  }
  return true;
};

/* 17 TEXTSCROLLRIGHT — the mirror: it starts fully off the left edge and
   ends once its left column has passed the right one. */
LFX[LE_SEQ.TEXTSCROLLRIGHT] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, hue);
    leSetTick(d, 50 * (leSpeed(d) + 1));
    d.d1 = -leMsgW(d);
  }
  if(leFlipTake(d)){
    leRenderText(d, d.d1, 0, hue);
    d.d1 += 1;
    if(d.d1 > d.w) return false;
  }
  return true;
};

/* 18 TEXTSCROLLUP — horizontally centred and rising out of the top. On a
   four-row rear logic the whole glyph height is the panel, so this is a
   single line of text sliding through; on a ten-row front it is a proper
   crawl. */
LFX[LE_SEQ.TEXTSCROLLUP] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, hue);
    leSetTick(d, 50 * (leSpeed(d) + 1));
    d.d1 = d.h;
  }
  if(leFlipTake(d)){
    leRenderText(d, Math.floor(d.w / 2) - Math.floor(leMsgW(d) / 2), d.d1, hue);
    d.d1 -= 1;
    if(d.d1 + leMsgH(d) <= 0) return false;
  }
  return true;
};

/* 19 ROAMINGPIXEL — a bar growing across a row, because nothing is ever
   erased between steps: the "pixel" leaves its whole trail behind it and
   only the row wipe at the end of the line clears it.

   Two things here are wrong on the board and kept. The delay is 50*speed
   with no `+1` — the only effect in the table missing it — so speed 0
   means a tick of zero, the flip-flop toggles every frame and the bar
   grows at a hundred cells a second. And the wrap test is `x > width`
   rather than `>=`, which buys one extra tick per row: the write at
   x == width falls off the edge and is silently clipped, and the wipe
   happens a tick later than it otherwise would. That spare tick is the
   only moment the finished row is ever seen whole — with `>=` the row
   would be erased on the same tick that completed it. */
LFX[LE_SEQ.ROAMINGPIXEL] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, hue);
    leSetTick(d, 50 * leSpeed(d));
    d.d1 = 0; d.d2 = 0;
  }
  if(leFlipTake(d)){
    leSetPixel(d, d.d1, d.d2, hue, 200);
    d.d1 += 1;
    if(d.d1 > d.w){
      leRow(d, d.d2, hue, 0);
      d.d1 = 0; d.d2 += 1;
    }
    if(d.d2 >= d.h){ d.d1 = 0; d.d2 = 0; }
  }
  return true;
};

/* 20 HORIZONTALSCANLINE — one full-width bar bouncing top to bottom, one
   row per tick. The previous row is erased only when it differs from the
   current one, and the bounce leaves the bar on the row it just drew, so
   the top and bottom rows are drawn twice running and are not erased in
   between: the bar DWELLS for two ticks at each end. It is what makes the
   sweep look mechanical rather than like a sine. */
LFX[LE_SEQ.HORIZONTALSCANLINE] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, hue);
    leSetTick(d, 50 * (leSpeed(d) + 1));
    d.d1 = 0; d.d2 = 0; d.d3 = 0;            // y, prevY, dir
  }
  if(leFlipTake(d)){
    if(d.d2 !== d.d1) leRow(d, d.d2, hue, 0);
    leRow(d, d.d1, hue, 200);
    d.d2 = d.d1;
    d.d1 += d.d3 ? -1 : 1;
    if(d.d1 >= d.h){ d.d3 = 1; d.d1 -= 1; }
    if(d.d1 < 0){ d.d3 = 0; d.d1 = 0; }
  }
  return true;
};

/* 21 VERTICALSCANLINE — the same bar with the axes exchanged, and the
   same two-tick dwell at each edge. On the 27x4 rear logic the bar is
   four pixels tall and takes 27 columns to cross; on the 9x10 front it is
   ten tall and crosses in nine. Both are correct — the bar is the panel's
   height, whatever that is. */
LFX[LE_SEQ.VERTICALSCANLINE] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, hue);
    leSetTick(d, 50 * (leSpeed(d) + 1));
    d.d1 = 0; d.d2 = 0; d.d3 = 0;            // x, prevX, dir
  }
  if(leFlipTake(d)){
    if(d.d2 !== d.d1) leCol(d, d.d2, hue, 0);
    leCol(d, d.d1, hue, 200);
    d.d2 = d.d1;
    d.d1 += d.d3 ? -1 : 1;
    if(d.d1 >= d.w){ d.d3 = 1; d.d1 -= 1; }
    if(d.d1 < 0){ d.d3 = 0; d.d1 = 0; }
  }
  return true;
};

/* ---------------------------------------------------------------- fire
   The two masks. The library carries them as literal 10x24 tables, and
   those tables are LGPL data that this project cannot copy — so these are
   generated from the profile the tables describe: an eight-wide U shape
   that tiles across the panel, scaled by how deep the row is.

   Generating rather than transcribing buys two things beyond the licence.
   The literal table is 24 columns wide and every AstroPixel rear logic is
   27, so the board reads off the end of each mask row into the next row's
   numbers; and it is ten rows tall, so a four-row panel only ever sees
   the top of the taper. Ours tiles any width and stretches to any height,
   which is the only way one fire looks like fire on 9x10, 27x4 and 5x5.

   valueMask is subtracted from the interpolated heat, so it is the shape
   of the flame: nothing at the newest line but a little at the edges,
   growing to the full U at the oldest, which is what pinches the flame in
   as it rises. hueMask is the colour, 25 (orange) at the base falling to
   0 (red) at the tips. */
const LE_FIRE_V = [255, 192, 160, 128, 128, 160, 192, 255];
const LE_FIRE_H = [1, 11, 19, 25, 25, 22, 11, 1];
function leFireVal(x, y, rows){
  const c = LE_FIRE_V[x & 7];
  const f = (rows > 1) ? (y / (rows - 1)) : 1;
  const v = Math.round(c * f);
  /* The newest row is not blank at its edges even though it is blank in
     the middle — the flame is already narrowing at the moment it is born,
     which is what stops the base looking like a lit bar. */
  const edge = ((x & 7) === 0 || (x & 7) === 7);
  return (edge && v < 32) ? 32 : v;
}
function leFireHue(x, y, rows){
  const f = (rows > 1) ? (1 - y / (rows - 1)) : 1;
  return Math.round(LE_FIRE_H[x & 7] * f);
}
/* Heat lives in the LED status bytes, exactly as it does on the board:
   the grid in the walk-position byte (indexed THROUGH the LED map) and
   the not-yet-shifted line in the pause byte (indexed raw, so only the
   first `width` LEDs have one). It is a filthy trick and we keep it,
   because the visible consequence is the point — when fire ends, the
   colour walk resumes from whatever heat values were left in those bytes
   and the panel re-scatters for a second before it settles. Clean arrays
   would lose that.

   A PSI has holes where no LED is fitted; those cells have no byte to
   live in, so they read 0 and swallow writes. */
function leHeatAt(d, x, y){
  const i = d.map[y * d.w + x];
  return (i < d.count) ? d.num[i] : 0;
}
function leHeatSet(d, x, y, v){
  const i = d.map[y * d.w + x];
  if(i < d.count) d.num[i] = v & 0xFF;
}

/* 22 FIRE — heat scrolls up the panel and is drawn flipped, so the newest
   line is the bottom row and the oldest is the tip.

   THE ONE PLACE THIS FILE DELIBERATELY DIVERGES. `pcnt` is the crossfade
   percentage between the current grid and the shifted one, and the board
   never resets it: after the first shift it adds 20 to 100 and keeps
   going, so (100 - pcnt) goes negative, the eight-bit writes wrap, and
   within a couple of seconds the fire is flickering noise on real
   hardware. We clamp it at 100 instead. That keeps the board's actual
   cadence — five ticks of crossfade and then a shift on every tick
   thereafter — without an unbounded counter and without the wrap. The
   alternative, resetting it to 0 as the code plainly meant to, gives a
   smooth crossfade but shifts only every fifth tick, which is far too
   slow to read as fire. */
LFX[LE_SEQ.FIRE] = function(d, first){
  const rows = d.h, cols = d.w;
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, leHue(d));
    leSetTick(d, 100 * (leSpeed(d) + 1));
    d.d1 = 0;                                 // pcnt
    for(let y = 0; y < rows; y++) for(let x = 0; x < cols; x++) leHeatSet(d, x, y, 0);
    for(let x = 0; x < cols && x < d.count; x++) d.pause[x] = 64 + leRand(191);
  }
  if(leFlipTake(d)){
    const p = d.d1;
    if(p >= 100){
      for(let y = rows - 1; y >= 1; y--)
        for(let x = 0; x < cols; x++) leHeatSet(d, x, y, leHeatAt(d, x, y - 1));
      for(let x = 0; x < cols; x++){
        leHeatSet(d, x, 0, (x < d.count) ? d.pause[x] : 0);
        if(x < d.count) d.pause[x] = 64 + leRand(191);
      }
    }
    for(let y = rows - 1; y >= 1; y--) for(let x = 0; x < cols; x++){
      let v = Math.floor(((100 - p) * leHeatAt(d, x, y) + p * leHeatAt(d, x, y - 1)) / 100)
              - leFireVal(x, y, rows);
      if(v < 0) v = 0;
      leSetPixel(d, x, rows - 1 - y, leFireHue(x, y, rows), v);
    }
    /* The newest line has no mask and no clamp — it is the raw heat, and
       it is the brightest thing on the panel. */
    for(let x = 0; x < cols; x++){
      const nl = (x < d.count) ? d.pause[x] : 0;
      const v = Math.floor(((100 - p) * leHeatAt(d, x, 0) + p * nl) / 100);
      leSetPixel(d, x, rows - 1, leFireHue(x, 0, rows), v);
    }
    d.d1 = Math.min(100, p + 20);
  }
  return true;
};

/* 23 PSICOLORWIPE — the front PSI's own idle, imitated on a logic panel:
   a column sweeps across painting one colour, bounces, and paints the
   complementary one on the way back, parking at the ends and sometimes
   sticking in the middle. Nothing is ever erased — the erase is commented
   out in the original — so the panel fills, and the "wipe" is the newer
   colour eating the older one column by column.

   The alternate colour is a table of pairs, and it is not symmetric:
   magenta maps to "default", which is hue 0 (red), while purple maps to
   magenta. So purple wipes to magenta but magenta does not wipe back. */
const LE_PSI_ALT_HUE = [0, 170, 128, 85, 42, 26, 0, 213, 0, 170];
LFX[LE_SEQ.PSICOLORWIPE] = function(d, first){
  const speed = leSpeed(d), hue = leHue(d);
  const alt = LE_PSI_ALT_HUE[leColour(d)] || 0;
  if(first){
    leSetPalHue(d, 2, hue);
    leSetTick(d, 50 * (speed + 1));
    d.d1 = 0; d.d2 = 0;                       // x, dir
  }
  if(leFlipTake(d)){
    leCol(d, d.d1, d.d2 ? alt : hue, 200);
    const was = d.d2;
    d.d1 += d.d2 ? -1 : 1;
    if(d.d1 >= d.w){ d.d2 = 1; d.d1 -= 1; }
    if(d.d1 < 0){ d.d2 = 0; d.d1 = 0; }
    /* Parking at the ends is most of this effect's character: a PSI does
       not sweep steadily, it sits at one side for a second or three and
       then wipes across. The mid-sweep stall fires on six of every
       hundred ticks, which is often enough to look alive and rare enough
       not to look broken. */
    if(d.d2 !== was) leSetTick(d, 1000 + 2000 * leRand(3));
    else if(leRand(100) <= 5) leSetTick(d, 1000 + 2000 * leRand(3));
    else leSetTick(d, 50 * (speed + 1));
  }
  return true;
};

/* 24 PULSE — a filled square growing and shrinking from the middle. Not a
   circle: the test is Chebyshev on both axes, so the shape is a square
   whatever the aspect ratio, and on a panel that is much wider than it is
   tall the radius runs to half the WIDTH, which means a 27x4 rear logic
   spends most of its cycle fully lit with only a brief pinch at the
   centre. That is what the effect does there; it is a front-logic effect.

   The whole panel is rewritten every tick, so unlike the scan lines this
   one leaves no trail. */
LFX[LE_SEQ.PULSE] = function(d, first){
  const hue = leHue(d);
  if(first){
    leSetBri(d, 0); leSetPalHue(d, 2, hue);
    leSetTick(d, 70 * (leSpeed(d) + 1));
    d.d1 = 0; d.d2 = 0;                       // radius, dir
  }
  if(leFlipTake(d)){
    const xm = Math.floor(d.w / 2), ym = Math.floor(d.h / 2), r = d.d1;
    for(let y = 0; y < d.h; y++) for(let x = 0; x < d.w; x++){
      const on = (Math.abs(y - ym) <= r && Math.abs(x - xm) <= r);
      leSetPixel(d, x, y, hue, on ? 150 : 0);
    }
    d.d1 += d.d2 ? -1 : 1;
    /* Integer division on the bound, as the board computes it — on the
       9-wide front logic that caps the radius at 4, so the top row and
       the left column never quite light. */
    if(d.d1 > Math.floor(d.w / 2) || d.d1 < 1) d.d2 = d.d2 ? 0 : 1;
  }
  return true;
};
