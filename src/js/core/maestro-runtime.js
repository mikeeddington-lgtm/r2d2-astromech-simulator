'use strict';
const MAESTRO = {
  slot:{},              // n -> {id, t, i}
  restartBurst:{},      // n -> {count, from}
  lastFired:-1, lastFiredAt:-1e9
};
function maestroRestart(n){
  const b = MAESTRO.restartBurst[n] || (MAESTRO.restartBurst[n]={count:0, from:SIM.millis, logged:false});
  b.count++; b.last = SIM.millis;
  MAESTRO.lastFired = n; MAESTRO.lastFiredAt = SIM.millis;

  /* imported settings file: restartScript(n) addresses subroutine n of the real script */
  if(CFG.maestroSource==='imported' && MSTR.loaded){
    const sub = MSTR.subs[n];
    if(!sub){
      if(!b.logged){ b.logged=true; lg('warn',`restartScript(${n}) — the imported script has no subroutine ${n} (${MSTR.subs.length} defined)`); }
      return;
    }
    if(sub.kind==='frame'){
      if(!b.logged){ b.logged=true; lg('warn',`restartScript(${n}) → sub ${sub.name} is a frame helper, not a sequence. On a real Maestro it would run with an empty stack.`); }
      return;
    }
    const seq = MSTR.sequences[sub.seqIndex];
    if(!seq || !seq.frames.length){
      if(!b.logged){ b.logged=true; lg('warn',`restartScript(${n}) → sub ${sub.name} has no frames the sim could decode`); }
      return;
    }
    if(!b.logged){ b.logged=true; lg('mae',`maestro.restartScript(${n})  → sub ${sub.name}  (${seq.frames.length} frames, ${seqTotal(seq)} ms)`); }
    seqStart(n, seq.frames, sub.name);
    return;
  }

  /* built-in stand-in animations */
  const id = CFG.maestroScript ? CFG.maestroScript[n] : 'none';
  if(!b.logged){ b.logged=true; lg('mae', `maestro.restartScript(${n})  → ${ANIMS[id]?ANIMS[id].label:id}`); }
  MAESTRO.slot[n] = {kind:'anim', id, t:0, i:0};
}
function maestroStep(dt){
  // a burst that has stopped: report how many restarts happened
  for(const n in MAESTRO.restartBurst){
    const b = MAESTRO.restartBurst[n];
    if(b.logged && SIM.millis - b.last > 120){
      if(b.count>1) lg('mae', `script ${n} was restarted ${b.count}× over ${Math.round(b.last-b.from)} ms — held button, so it only ran after release`);
      delete MAESTRO.restartBurst[n];
    }
  }
  const dtms = dt*1000;
  for(const n in MAESTRO.slot){
    const s = MAESTRO.slot[n];
    if(s.kind==='seq'){ seqStepPlayback(n, s, dtms); continue; }
    const a = ANIMS[s.id]; if(!a){ delete MAESTRO.slot[n]; continue; }
    s.t += dtms;
    while(s.i < a.steps.length && a.steps[s.i][0] <= s.t){
      const [,key,val] = a.steps[s.i];
      ACT_T[key] = val;
      s.i++;
    }
    if(s.t > a.dur + 200) delete MAESTRO.slot[n];
  }
}
const maestro = { restartScript:maestroRestart };
