'use strict';
/* =====================================================================
   SERVO UNITS — what a servo will take, and what "ease" means

   Two definitions that BOTH apps and both channel tables have to agree
   about, so they live in one file the sim and PCA Studio each load. They
   were in Studio's own core until the fold-in (2026-08-12); a const
   referenced across scripts in load order is a trap waiting for the day
   somebody calls one at module scope.
   ===================================================================== */

/* ------------------------------------------------- what a servo will take
   Two bands, and the difference between them matters.

   1000–2000 µs is what every hobby servo accepts and what "standard" means.
   Plenty of digital servos travel further and people deliberately open them
   up, so going outside it is a NOTE, not an error — amber.

   500–2500 µs is the outer edge of what almost anything accepts. Past it you
   are commanding a pulse the servo will either ignore or answer by driving
   the horn into its own end stop and sitting there stalled, which is how
   gears get stripped and how a panel bends a linkage. Red.

   Both are held in quarter-µs, the unit everything downstream speaks. */
const PW_STD  = {lo:4000, hi:8000};    /* 1000–2000 µs */
const PW_ABS  = {lo:2000, hi:10000};   /* 500–2500 µs  */
function pwClass(qus){
  if(!qus) return '';                                   /* 0 is "no pulse", not a width */
  if(qus < PW_ABS.lo || qus > PW_ABS.hi) return 'bad';
  if(qus < PW_STD.lo || qus > PW_STD.hi) return 'warn';
  return '';
}
function pwTitle(qus){
  const k = pwClass(qus);
  const us = (qus/4).toFixed(0);
  if(k === 'bad')  return us+' µs is outside 500–2500 µs — most servos cannot reach it and will stall against their own stop trying. Check this end before you run a sequence.';
  if(k === 'warn') return us+' µs is outside the standard 1000–2000 µs. Many servos travel this far; some do not. Sweep it before you trust it.';
  return us+' µs · '+qus+' quarter-µs';
}

/* --------------------------------------------------------------- ease
   The shape of a move, not its speed — which is the thing the one-word
   column name never manages to say. Kept here so the table, the tooltips
   and the apply bar all describe it the same way. */
const EASE_TIP = 'The shape of a move, not its speed. Speed and acceleration decide how fast; ease decides how it starts and finishes.';
const EASE_KINDS = [
  {id:'none',      hint:'Plain: accelerate, run at speed, stop dead on the number. What a Maestro does.'},
  {id:'soft',      hint:'The acceleration itself comes in over the first 80 ms, so the part breathes into motion instead of jerking off the mark. Kindest to a long linkage or a heavy panel.'},
  {id:'overshoot', hint:'Aims about a twelfth of the way past the target and settles back — what makes a panel read as SNAPPING open. Only on moves worth more than an eighth of the travel, and never past your endpoints, so a move to MIN or MAX looks the same as none.'}
];
