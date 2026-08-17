'use strict';
/* ====================================================== PLAYBACK / DRIVE */
function chanNorm(c, target){
  const lo=Math.min(c.min,c.max), hi=Math.max(c.min,c.max);
  if(hi===lo) return 0;
  let t = (target-lo)/(hi-lo);
  t = clamp(t,0,1);
  return c.invert ? 1-t : t;
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
