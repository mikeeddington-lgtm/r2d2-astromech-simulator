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
    hwClockFire((typeof performance !== 'undefined') ? performance.now() : HWCLK.last + HW_CLOCK_MS);
  }, HW_CLOCK_MS);
}

/* ONE FIRE OF THE HEARTBEAT, at wall time `now` — real elapsed time, not the
   nominal interval: a coalesced or throttled timer must not slow the droid
   down, it must catch up. Split out of the interval so a test can drive it
   with a clock of its own.

   THE REMAINDER IS CARRIED (v1.78.0, review M18). This used to hand the
   engine `now - last` and move `last` to `now`; the engine takes whole
   milliseconds (pcaTick's `dtms|0`, the firmware's uint32 millis), so the
   fraction of every fire was thrown away — a setInterval(10) that really
   fires every 10.7 ms lost 0.7 ms a fire, 1.94 % over 300 fires, and every
   ramp over PCA_Bridge finished late by that margin. Now `last` advances by
   the whole milliseconds actually delivered and the fraction waits for the
   next fire, so what the engine is handed sums to the wall clock within a
   millisecond however the timer jitters. This is where that belongs, not in
   the engine: pcaseq.js mirrors MaestroPCA.cpp integer-for-integer and the
   firmware has no fractions to carry — turning wall time into whole ms is
   the clock's job (pcaTick says the same). The 250 cap keeps its old
   meaning: a stall longer than that is handed 250 and the rest is dropped,
   fraction included — a backgrounded tab does not fast-forward. */
function hwClockFire(now){
  const dt = now - HWCLK.last;
  if(!(dt > 0)){ HWCLK.last = now; return; }        /* a clock that went backwards: resync, deliver nothing */
  if(dt > 250){ HWCLK.last = now; HW.tick(250); return; }
  const whole = Math.floor(dt);
  if(!whole) return;                                /* under a millisecond so far — it accrues */
  HWCLK.last += whole;
  HW.tick(whole);
}

function hwClockStop(){
  if(!HWCLK.id) return;
  clearInterval(HWCLK.id);
  HWCLK.id = 0;
}
