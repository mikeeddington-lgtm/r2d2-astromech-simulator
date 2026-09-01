'use strict';
/* =====================================================================
   TRAVEL MODEL — how long a channel physically takes to move

   Pure functions, no globals, no DOM. Shared by the linter, the block
   sequencer's ramp floors and PCA Studio, because all three have to agree
   about what the board can actually deliver: a brick may ASK for a 100 ms
   ramp, but a channel whose imported speed needs 400 ms will take 400 ms,
   and a preview that shows otherwise is lying.
   ===================================================================== */

/* ------------------------------------------------------- travel model
   Pololu's units, from docs/0J40:
     speed        1 = (0.25 us)/(10 ms)  → 0.1 quarter-us per ms
     acceleration 1 = the speed changes by 1 every 80 ms
   0 means "unlimited" for both. */
function chanTravelMs(c, dist){
  const d = Math.abs(dist || 0);
  if(!d) return 0;
  const vmax = (c.speed || 0) * 0.1;
  const a    = (c.acceleration || 0) * 0.1 / 80;
  if(!vmax && !a) return 0;                       // unlimited — one 20 ms servo frame
  if(!a)          return d / vmax;                // speed-limited only
  if(!vmax)       return 2 * Math.sqrt(d / a);    // acceleration-limited only
  const dRamp = vmax * vmax / a;                  // accelerate to vmax and back down again
  if(d <= dRamp)  return 2 * Math.sqrt(d / a);    // triangular — never reaches vmax
  return 2 * (vmax / a) + (d - dRamp) / vmax;     // trapezoid
}

/* ---------------------------------------------- THE INVERSE (v1.66.0)
   The speed that makes a move of `dist` take exactly `ms`, given the
   channel's own acceleration. This is what lets the compiler hand the
   board ONE Set Target per edge instead of a staircase and still keep the
   authored duration honest — "the number is how long the move TAKES"
   (Mike, bench, 2026-08-12) has to stay true whoever draws the curve.

   Solving chanTravelMs() for vmax in the trapezoid case:

       T = v/a + d/v      →      v² - a·T·v + a·d = 0

   The SMALLER root is the trapezoid; the larger one is not a real profile
   (it is the branch where the ramps alone are longer than the move).

   A NEGATIVE DISCRIMINANT means this acceleration physically cannot cover
   the distance in the time asked. That is not an error to swallow: it is
   the accel-limited case, so we return the triangular peak — the fastest
   this channel can go — and blockMinTravelMs() is what stops a brick
   asking for it in the first place. Returns 0 for "nothing to limit".

   NEVER ABOVE THE CHANNEL'S OWN SPEED (v1.77.0, review H8). The table's
   speed is the ceiling the builder set against real linkage — "those are
   AUTHORITATIVE" (Mike, 2026-07-29; blockMinTravelMs says the same) — and
   this function used to ignore it: the only cap was Pololu's 16000. The
   act-brick path never noticed, because its ramps are floored at the
   travel time and the answer stays under the table by construction. A
   nested `seq` brick has no such floor: a library routine with a 100 ms
   full-throw frame asked for 4000 quarter-µs in 100 ms and got speed 224
   on a speed-120 channel (400 with acceleration 0) — written under
   MPCA_SEQ_SPEEDS and sent as Set Speed, so the droid outran the limit its
   own table had set while the preview (which ignores speeds) showed
   nothing. A speed the board cannot honestly deliver is not an answer, so
   the ceiling is min(16000, c.speed) whenever the table has one; 0 still
   means unlimited and keeps the 16000. The DURATION is not stretched here
   or anywhere: an authored 100 ms frame stays 100 ms, the horn simply
   arrives when the table says it can — which is what it did anyway. */
function chanSpeedForMs(c, dist, ms){
  const d = Math.abs(dist || 0);
  if(!d || !(ms > 0)) return 0;
  const a = ((c && c.acceleration) || 0) * 0.1 / 80;
  const lim = (c && c.speed > 0) ? Math.min(16000, Math.round(c.speed)) : 16000;
  const cap = sp => Math.max(1, Math.min(lim, sp));
  if(!a) return cap(Math.round(10 * d / ms));
  const disc = a*a*ms*ms - 4*a*d;
  const v = (disc <= 0) ? Math.sqrt(a*d) : (a*ms - Math.sqrt(disc)) / 2;
  return cap(Math.round(10 * v));
}
