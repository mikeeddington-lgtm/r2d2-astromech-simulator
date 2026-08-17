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
