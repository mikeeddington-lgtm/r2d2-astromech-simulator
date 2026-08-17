'use strict';
/* ====================================================== PLAYBACK / DRIVE */

/* ==================== THE MODEL'S OWN TRAVEL MODEL (v1.46.0)
   Mike: "For the sequencer it should always assume that the initial setting
   on the low of a servo is Closed and whatever its set to is the max open on
   the model - the settings for min and max on a real servo are only really
   for the real model and not for the sim - this way we avoid a poor physical
   setup ruining the sims look and functionality - they may have had to use a
   weird offset or something"

   THE RULE, in one line: on the MODEL, `c.min` is SHUT (0) and `c.max` is
   FULLY OPEN (1). Directed, never sorted. Whatever the two numbers are — a
   200 µs span, 700 µs of offset, or the higher number first — the panel on
   screen sits shut at min and stands wide open at max. A weird trim on a
   real linkage can no longer make the droid on screen look wrong.

   WHICH CONVENTION WON, AND WHY THE OTHER IS GONE. There were two ways to
   say "this one runs backwards" and they disagreed:
     · THE PAIR'S ORDER — the bench's own convention (hw-table.js, the REV
       tick in setup-hw-channels.js, the calibration dial): reversing a
       linkage IS min and max the other way round, and there is deliberately
       no flag. It is reachable, it is one number pair, and it cannot drift
       out of step with what the table shows. It wins.
     · `c.invert` — a stored boolean nothing in the bench ever sets, so it
       was unreachable and could only arrive in one of our own .json exports.
   The old chanNorm() did BOTH: it took Math.min/Math.max of the pair (which
   throws the pair's direction away) and then applied `invert`. So a droid
   whose panel servo was reversed the bench's way — min = the shut end = the
   HIGHER number — showed that panel wide open on screen while the real one
   was shut. That is exactly the class of fault Mike is describing, and it is
   why the sort is gone.

   WHAT HAPPENS TO A FILE THAT CARRIES `invert:true`. It is not ignored —
   ignoring it would silently open every affected panel backwards. It is
   ADOPTED, once, into the surviving convention: the channel's two ends are
   swapped and the flag is cleared (chanAdoptInvert below), which is the same
   physical result the flag used to produce, said the one way the rest of the
   app understands. After that the channel obeys the rule like any other, and
   nothing ever writes the flag again.

   THE REAL BOARD IS NOT TOUCHED. Nothing here changes a pulse width. The
   µs a frame carries goes to liveWrite() exactly as authored — a poor
   physical setup is fixed at the bench, on the servo, never by this file
   quietly sending a different number. */

/* one-time adoption of the retired flag, logged so it is never silent. Lazy — this is the seam every reader below already goes through,
   so a legacy channel is adopted whichever door it came in by (a .json
   restore, a drag-and-drop, a test) with no second place to keep in step.
   Idempotent, and after the first read it costs one falsy property test on
   a 60 Hz path. */
function chanAdoptInvert(c){
  /* GUARDED HERE, not only at the call sites (v1.46.0, caught in the merge).
     Two modules landed on this function in the same release: chanEnds() below
     asks `if(c.invert)` first, and servo-cfg.js's importer called it for every
     channel in the file — so every imported channel had its two ends swapped
     and a straight round-trip of our own export came back reversed. A function
     called "adopt the retired flag" has to be a no-op when there is no flag;
     that way it cannot matter which caller remembers to check. Returns whether
     it did anything. */
  if(!c || !c.invert) return false;
  const t = c.min; c.min = c.max; c.max = t;
  c.invert = false;
  const msg = 'channel ' + c.i + ' (' + (c.name || '?') + ') carried the retired "invert travel" flag — '
            + 'its min and max have been swapped instead, which is the same movement said the way the '
            + 'bench says it. min is shut, max is open.';
  if(typeof lg === 'function') lg('warn', msg); else if(typeof console !== 'undefined') console.warn(msg);
  return true;
}
/* the shut end and the open end of a channel, in quarter-µs. THE one place
   that decides which is which. */
function chanEnds(c){
  if(c.invert) chanAdoptInvert(c);
  return {shut:c.min, open:c.max};
}
/* quarter-µs → 0..1 on the model */
function chanNorm(c, target){
  const e = chanEnds(c);
  if(e.open === e.shut) return 0;
  return clamp((target - e.shut)/(e.open - e.shut), 0, 1);
}
/* 0..1 → quarter-µs, the exact inverse. chanRest() (boards.js) and the
   music routine builder go through this rather than sorting the pair again. */
function chanDenorm(c, t){
  const e = chanEnds(c);
  return Math.round(e.shut + clamp(t,0,1) * (e.open - e.shut));
}
/* push a frame's targets into the droid
   ------------------------------------
   TWO DROIDS, one loop. `ACT_T` is the model on screen; `liveWrite()` is the
   servo on the bench, when the sequencer has been armed for it (v1.39.0,
   maestro/live-drive.js). They are separate conditions on purpose:
   · a channel with no `act` moves nothing on screen and can still be a real
     servo — board-only channels used to be skipped by this loop entirely,
     which would have made them the one kind that never went live;
   · a channel mapped to a part still updates the model when nothing is
     connected, which is the normal case and must cost nothing. */
function applyFrameTargets(targets){
  for(const c of MSTR.channels){
    const v = targets[c.i];
    if(v===undefined || v===0) continue;      // 0 = channel off / untouched
    if(c.act) ACT_T[c.act] = chanNorm(c, v);
    if(typeof liveWrite === 'function') liveWrite(c, v);
  }
}
function applyLivePose(){
  for(const c of MSTR.channels){
    if(c.act) ACT_T[c.act] = chanNorm(c, EDIT.live[c.i]);
    if(typeof liveWrite === 'function') liveWrite(c, EDIT.live[c.i]);
  }
}
/* a sequence being played back — used by restartScript() and by the editor */
function seqStart(slotKey, frames, label){
  MAESTRO.slot[slotKey] = {kind:'seq', frames, i:-1, t:0, label:label||'sequence'};
}
function seqStepPlayback(slotKey, s, dtms){
  if(s.i<0){ s.i=0; s.t=0; if(s.frames[0]) applyFrameTargets(s.frames[0].targets); }
  else s.t += dtms;
  while(s.frames[s.i] && s.t >= s.frames[s.i].duration){
    s.t -= s.frames[s.i].duration;
    s.i++;
    if(s.frames[s.i]) applyFrameTargets(s.frames[s.i].targets);
  }
  if(!s.frames[s.i]) delete MAESTRO.slot[slotKey];
}
function seqTotal(seq){ return seq.frames.reduce((a,f)=>a+f.duration,0); }
