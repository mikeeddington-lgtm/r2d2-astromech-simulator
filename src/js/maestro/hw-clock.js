'use strict';
/* =====================================================================
   HW CLOCK — the engine's own heartbeat, off the animation frame

   Mike, 2026-08-12, after driving real servos from PCA Studio: *"my only
   thought was it felt a little jerky."* It was not imagination. Here is
   the arithmetic.

   The engine integrates in fixed 10 ms quanta and carries the remainder,
   exactly as the AVR does — so its POSITION is right at any instant. But
   it was stepped from requestAnimationFrame, and at 60 Hz the accumulator
   turns 16.667 ms into:

        1, 2, 2, 1, 2, 2, 1, 2, 2 …   steps per frame

   The average is correct. The DELIVERY is not: the servo is commanded a
   new position every frame, and that position advances one step, then
   two, then two. That is a 2:1 ripple in commanded velocity repeating
   every three frames — 20 Hz, which is squarely where a human reads
   "rough" rather than "fast".

   A real Maestro, and the MaestroPCA co-processor, do not have this: they
   step on a fixed 10 ms timer, so every step is exactly one. The ripple
   was purely an artefact of driving a fixed-rate engine from a
   variable-rate clock.

   So the engine now runs on its own interval and the animation frame only
   PAINTS. With real elapsed time still feeding the accumulator the average
   rate is unchanged — what changes is that almost every fire advances one
   step instead of alternating one and two.

   ---------------------------------------------------------------- note
   This does NOT fix the other source of stepping, which is the board's:
   a PCA9685 at 50 Hz resolves 20000/4096 = 4.88 µs, and one engine step at
   speed 10 is 2.5 µs — half a count. At low speeds the board therefore
   holds a value for two ticks and then jumps a whole count, and no amount
   of clock discipline here changes that. Raising the servo frequency is
   what changes it: at 100 Hz a count is 2.44 µs, at 200 Hz 1.22 µs. That
   is a hardware answer and it belongs to the servos, not to this file.
   ===================================================================== */

let HWCLK = { id:0, last:0 };

/* 10 ms, matching the engine's quantum and the AVR's loop */
const HW_CLOCK_MS = 10;

function hwClockRunning(){ return !!HWCLK.id; }

function hwClockStart(){
  if(HWCLK.id) return;
  HWCLK.last = (typeof performance !== 'undefined') ? performance.now() : 0;
  HWCLK.id = setInterval(()=>{
    const now = (typeof performance !== 'undefined') ? performance.now() : HWCLK.last + HW_CLOCK_MS;
    /* real elapsed time, not the nominal interval — a coalesced or throttled
       timer must not slow the droid down, it must catch up */
    let dt = now - HWCLK.last;
    HWCLK.last = now;
    if(dt < 0) dt = 0;
    if(dt > 250) dt = 250;          /* a backgrounded tab does not fast-forward */
    HW.tick(dt);
  }, HW_CLOCK_MS);
}

function hwClockStop(){
  if(!HWCLK.id) return;
  clearInterval(HWCLK.id);
  HWCLK.id = 0;
}
