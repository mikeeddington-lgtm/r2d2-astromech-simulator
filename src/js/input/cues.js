'use strict';
/* =====================================================================
   CUES — the second half of the puppet rig (Mike, 2026-08-07):
   "assign the actions … by customising the buttons to actions and then
   you can record the movements into sequencer — so as a puppet you
   record the actions and the sequencer plays them back."

   Puppet mode already made every control a STRING: one stick half, one
   servo, spring-back. That is a marionette. This adds the other kind of
   control a puppeteer wants — a CUE: a button that fires a whole named
   ACTION (a part, a group of parts, or a saved routine) rather than a
   raw channel.

   ONE rig, per-control choice (Mike's decision): the mapping table beside
   the pad now has two sections, "Who plays what" (strings, unchanged) and
   "Cues on the pad". A control is one or the other, never both — assigning
   a cue frees that control from PUPPET.map and vice versa.

   AND — the point of the whole thing — the recorder now produces a BRICK
   ROUTINE, not a flat frame list. Every press becomes a brick at the
   instant you pressed it, as long as you held it, so the take opens in the
   sequencer as something you can drag, retime and undo. Continuous stick
   work in the same pass is captured as one nested take on the spine lane.

   The old behaviour is untouched when no cue fires: a strings-only take
   still saves as a plain frame list, the same species as an imported
   sequence (that contract is pinned by tests/puppet.test.js).
   ===================================================================== */
const CUE = {
  map:{},        // control id -> {kind:'act'|'grp'|'seq', ref}
  latch:{},      // control id -> true = press flips, rather than hold
  held:{},       // control id -> latched state
  live:{},       // control id -> {amp} while the cue is being held
  play:[],       // routine cues currently running: {name,frames,i,t,owns}
  owned:{},      // actuator id -> true, rebuilt every tick (see cueOwns)
  rec:null       // {t, bricks:[], open:{}} while a take is rolling
};

/* WHO WINS A SHARED CHANNEL.
   A control does one job, but a CHANNEL can be both somebody's string and a
   member of a cued group. While the cue is actually holding it, the cue
   wins — otherwise a resting stick would stamp the servo shut the instant
   you pressed the group button, and holding "All pies" would do nothing.
   The string keeps commanding (PUPPET.pose still follows it, so the take
   records what the puppeteer meant); it just does not write the target
   until the cue lets go. */
function cueOwns(act){ return !!CUE.owned[act]; }

/* how far a control has to move before it counts as a press — a resting
   stick reads a few hundred counts of noise on a real pad */
const CUE_DEAD = 0.12;

/* ------------------------------------------------------------ catalog
   Exactly the palette the sequencer already offers, so a cue and a brick
   mean the same thing: one part, a group of parts, or a saved routine. */
function cueCatalog(){
  const out = [];
  if(!MSTR.loaded) return out;
  (typeof blockActions === 'function' ? blockActions() : []).forEach(a=>{
    out.push({kind:'act', ref:a.act, label:a.label || a.act, group:'Parts'});
  });
  (typeof blockGroups === 'function' ? blockGroups() : []).forEach(g=>{
    out.push({kind:'grp', ref:g.id, label:g.label, group:'Groups'});
  });
  MSTR.sequences.forEach(s=>{
    if(!s.frames || !s.frames.length) return;
    out.push({kind:'seq', ref:s.name, label:s.name, group:(s.cat || 'Routines')});
  });
  return out;
}
function cueFind(kind, ref){ return cueCatalog().find(c=>c.kind===kind && c.ref===ref) || null; }
function cueKey(c){ return c ? c.kind+':'+c.ref : ''; }
function cueParse(key){
  const i = key.indexOf(':');
  return i < 0 ? null : {kind:key.slice(0,i), ref:key.slice(i+1)};
}
/* the actuators a cue drives — a routine drives whatever its frames say,
   so it has no member list of its own */
function cueMembers(c){
  if(!c) return [];
  if(c.kind === 'act') return [c.ref];
  if(c.kind === 'grp'){
    const g = (typeof blockGroups === 'function' ? blockGroups() : []).find(x=>x.id === c.ref);
    return g ? g.members.slice() : [];
  }
  return [];
}
function cueLabel(c){
  if(!c) return '';
  const hit = cueFind(c.kind, c.ref);
  if(hit) return hit.label;
  return c.ref + ' (missing)';
}

/* ------------------------------------------------------------ mapping
   A control does one job. Claiming it for a cue drops its string, and
   pupBuildMap's servo picker drops the cue the same way (cueFree). */
function cueSet(ctl, c){
  if(!ctl) return;
  if(!c){ cueClear(ctl); return; }
  for(const i in PUPPET.map){                       // it was a string — no longer
    if(PUPPET.map[i] === ctl){
      const ch = pupChannels().find(x=>String(x.i) === String(i));
      delete PUPPET.map[i];
      if(ch) ACT_T[ch.act] = chanNorm(ch, blockClosed(ch));
    }
  }
  CUE.map[ctl] = {kind:c.kind, ref:c.ref};
  cuePrefsStore();
}
function cueClear(ctl){
  const c = CUE.map[ctl];
  if(c) cueHome(c);
  delete CUE.map[ctl];
  delete CUE.latch[ctl];
  delete CUE.held[ctl];
  delete CUE.live[ctl];
  cuePrefsStore();
}
/* called by the string picker: this control is a servo now */
function cueFree(ctl){ if(CUE.map[ctl]) cueClear(ctl); }
function cueHome(c){
  cueMembers(c).forEach(act=>{
    const ch = (typeof blockChan === 'function') ? blockChan(act) : null;
    if(ch) ACT_T[act] = chanNorm(ch, blockClosed(ch));
  });
}
/* every control that is free to take a cue */
function cueFreeControls(){
  const used = new Set(Object.values(PUPPET.map));
  return PUP_CONTROLS.filter(c=>!used.has(c.id) && !CUE.map[c.id]);
}

/* ---------------------------------------------------------- auto-cue
   The "default" Mike asked for: deal the ready-made ACTIONS across the
   face buttons and the d-pad, leaving the sticks and triggers as strings.
   Groups first (they read as one gesture), then saved routines, then
   single parts if there is still a button spare. */
function cueAutoMap(){
  const btns = ['A','B','X','Y','UP','DOWN','LEFT','RIGHT','L1','R1','L3','R3'];
  const cat = cueCatalog();
  const picks = [
    ...cat.filter(c=>c.kind === 'grp'),
    ...cat.filter(c=>c.kind === 'seq' && c.group !== 'Recorded'),
    ...cat.filter(c=>c.kind === 'act')
  ];
  if(!picks.length){
    lg('warn','no actions to cue yet — import or generate a board, or save a routine first');
    return 0;
  }
  Object.keys(CUE.map).forEach(cueClear);
  let n = 0;
  for(const id of btns){
    if(n >= picks.length) break;
    cueSet(id, picks[n]);
    CUE.latch[id] = false;
    n++;
  }
  cuePrefsStore();
  lg('sys','puppet: '+n+' cue'+(n===1?'':'s')+' on the buttons — hold to perform, then record');
  return n;
}

/* ============================================================ the tick
   Called from puppetTick BEFORE the strings, so a servo that is somebody's
   string always wins its own channel back from a cue that shares it. */
function cueTick(dtms){
  CUE.owned = {};
  if(!PUPPET.on || !MSTR.loaded) return;
  cuePlayStep(dtms);
  for(const id in CUE.map){
    const c = CUE.map[id];
    const meta = PUP_CTL[id];
    if(!c || !meta) continue;
    let v = pupCtlValue(id);
    if(meta.kind === 'btn' && CUE.latch[id]){
      if(XB.click[id]){ XB.click[id] = false; CUE.held[id] = !CUE.held[id]; }
      v = CUE.held[id] ? 1 : 0;
    }
    const on = v > CUE_DEAD;
    const was = !!CUE.live[id];

    if(c.kind === 'seq'){
      /* a routine cue is a one-shot: the press launches it and it runs to
         its own end. Releasing does not stop it — that is what makes it a
         cue rather than a string. */
      if(on && !was){ CUE.live[id] = {amp:1}; cueLaunch(c.ref); cueRecPress(id, c, 1); }
      else if(!on && was) delete CUE.live[id];
      continue;
    }

    /* a part or a group is hold-to-open, and an ANALOG control gives you
       partial travel — the same thing b.amp means on a brick.
       The member list is resolved ONCE, on the press: cueMembers() rebuilds
       the whole group catalog, which is not something to do every frame. */
    if(on){
      if(!was){ CUE.live[id] = {amp:v, members:cueMembers(c)}; cueRecPress(id, c, v); }
      else if(v > CUE.live[id].amp){ CUE.live[id].amp = v; cueRecAmp(id, v); }
      const members = CUE.live[id].members;
      members.forEach(a=>{ CUE.owned[a] = true; });
      if(!PUPPET.play) cueDrive(members, v);
    }else if(was){
      const members = CUE.live[id].members;
      delete CUE.live[id];
      cueRecRelease(id);
      if(!PUPPET.play) cueDrive(members, 0);
    }
  }
}
function cueDrive(members, v){
  members.forEach(act=>{
    const ch = blockChan(act); if(!ch) return;
    const closed = blockClosed(ch), open = blockOpen(ch);
    ACT_T[act] = chanNorm(ch, Math.round(closed + (open - closed) * clamp(v, 0, 1)));
  });
}

/* ------------------------------------------- running a routine cue live
   Several can overlap; later frames win the channels they name, and a
   channel nobody names is simply left where it was. Re-pressing the same
   cue restarts it rather than stacking a second copy. */
function cueLaunch(name){
  const s = MSTR.sequences.find(x=>x.name === name);
  if(!s || !s.frames || !s.frames.length){ lg('warn','cue: "'+name+'" has no frames to play'); return; }
  CUE.play = CUE.play.filter(p=>p.name !== name);
  /* everything this routine ever touches stays the routine's for as long as
     it runs, so a resting string cannot fight it between keyframes */
  const owns = [];
  MSTR.channels.forEach(c=>{
    if(c.act && s.frames.some(f=>f.targets[c.i])) owns.push(c.act);
  });
  CUE.play.push({name, frames:s.frames, i:-1, t:0, owns});
  lg('mae','▶ cue: '+name);
}
function cuePlayStep(dtms){
  if(!CUE.play.length) return;
  CUE.play.forEach(p=>p.owns.forEach(a=>{ CUE.owned[a] = true; }));
  if(PUPPET.play) return;
  for(const p of CUE.play){
    if(p.i < 0){ p.i = 0; p.t = 0; if(p.frames[0]) applyFrameTargets(p.frames[0].targets); }
    else p.t += dtms;
    while(p.frames[p.i] && p.t >= p.frames[p.i].duration){
      p.t -= p.frames[p.i].duration;
      p.i++;
      if(p.frames[p.i]) applyFrameTargets(p.frames[p.i].targets);
    }
  }
  CUE.play = CUE.play.filter(p=>!!p.frames[p.i]);
}
function cueStopAll(){
  CUE.play = [];
  Object.keys(CUE.live).forEach(id=>{ const c = CUE.map[id]; if(c) cueHome(c); });
  CUE.live = {}; CUE.held = {}; CUE.owned = {};
}

/* ========================================================== recording
   The bricks are gathered here; puppet.js's sampler keeps gathering the
   string frames alongside. Nothing is written to the library until the
   take stops, so a cancelled countdown leaves no trace. */
function cueRecStart(){ CUE.rec = {t:0, bricks:[], open:{}}; }
function cueRecCancel(){ CUE.rec = null; }
function cueRecTick(dtms){ if(CUE.rec) CUE.rec.t += dtms; }
function cueRecActive(){ return !!(CUE.rec && CUE.rec.bricks.length); }
function cueRecPress(id, c, amp){
  if(!CUE.rec) return;
  const b = {kind:c.kind, ref:c.ref, t0:Math.round(CUE.rec.t), dur:0, amp:clamp(amp, 0.05, 1)};
  CUE.rec.bricks.push(b);
  if(c.kind !== 'seq') CUE.rec.open[id] = b;
}
/* pushing the stick further mid-hold opens the brick further — the take
   keeps the FURTHEST you got, which is what the eye remembers */
function cueRecAmp(id, v){
  const b = CUE.rec && CUE.rec.open[id];
  if(b && v > b.amp) b.amp = clamp(v, 0.05, 1);
}
function cueRecRelease(id){
  const b = CUE.rec && CUE.rec.open[id];
  if(!b) return;
  b.dur = Math.max(120, Math.round(CUE.rec.t - b.t0));
  delete CUE.rec.open[id];
}

/* a change-only take is exact when it is played frame by frame, but the
   block compiler samples a nested sequence at ARBITRARY boundary times
   and only overlays the channels that frame names — so a hole would send
   a still-open servo home. Carry every mapped channel forward. */
function cueDensify(frames, chans){
  const carry = [];
  return frames.map(f=>{
    const t = new Array(MSTR.servoCount).fill(0);
    chans.forEach(c=>{
      if(f.targets[c.i]) carry[c.i] = f.targets[c.i];
      if(carry[c.i]) t[c.i] = carry[c.i];
    });
    return {name:f.name || '', duration:f.duration, targets:t};
  });
}
function cueUniqueName(name){
  let n = name;
  while(MSTR.sequences.some(s=>s.name === n)) n = n + '·';
  return n;
}

/* Build the routine. Returns the sequence, or null when no cue fired —
   in which case puppet.js keeps its original plain-frame-list path. */
function cueRecFinish(name, stringFrames, mapped){
  const rec = CUE.rec;
  CUE.rec = null;
  if(!rec || !rec.bricks.length) return null;
  /* anything still held when you hit ■ ends there */
  Object.keys(rec.open).forEach(id=>{
    const b = rec.open[id];
    b.dur = Math.max(120, Math.round(rec.t - b.t0));
  });

  const seq = {name:cueUniqueName(name), cat:'Recorded', frames:[], blocks:[]};
  MSTR.sequences.push(seq);

  /* the stick work, if there was any, as ONE nested brick on the spine —
     a hybrid performance in a single pass (Mike's choice) */
  let strings = null;
  if(stringFrames && stringFrames.length > 1 && mapped && mapped.length){
    const frames = cueDensify(stringFrames, mapped);
    const total = frames.reduce((a,f)=>a+f.duration, 0);
    strings = {name:cueUniqueName(seq.name+' · strings'), frames, cat:'Recorded'};
    MSTR.sequences.push(strings);
    blockAdd(seq, 'seq', strings.name, 0, {dur:total});
  }

  rec.bricks.forEach(b=>{
    if(b.kind === 'seq'){ blockAdd(seq, 'seq', b.ref, b.t0, {dur:blockSeqDur(b.ref)}); return; }
    cueMembers({kind:b.kind, ref:b.ref}).forEach(act=>{
      blockAdd(seq, 'act', act, b.t0, {dur:b.dur, amp:b.amp});
    });
  });
  blockSync(seq);
  return seq;
}

/* ------------------------------------------------------------- prefs */
function cuePrefsStore(){
  PREFS.puppetCues = {map:CUE.map, latch:CUE.latch};
  if(typeof prefsSave === 'function') prefsSave();
}
function cuePrefsRestore(){
  const p = PREFS.puppetCues;
  if(p && p.map){ CUE.map = p.map; CUE.latch = p.latch || {}; }
}

/* =====================================================================
   UI — the second section of the mapping panel beside the pad
   ===================================================================== */
function cueBuildPanel(host){
  if(!host) return;
  const wrap = document.createElement('div');
  wrap.className = 'pupcues';
  const h = document.createElement('h4');
  h.textContent = 'Cues on the pad';
  wrap.appendChild(h);

  const cat = cueCatalog();
  if(!cat.length){
    const e = document.createElement('div');
    e.className = 'hint';
    e.textContent = 'no actions to cue yet — generate or import a board first.';
    wrap.appendChild(e);
    host.appendChild(wrap);
    return;
  }

  const ids = Object.keys(CUE.map);
  if(!ids.length){
    const e = document.createElement('div');
    e.className = 'hint';
    e.textContent = 'a cue is a button that fires a whole action — a part, a group, or a saved routine. Hold it to perform it; the recorder turns each press into a brick.';
    wrap.appendChild(e);
  }
  ids.forEach(id=>{
    const c = CUE.map[id];
    const row = document.createElement('div');
    row.className = 'pupcuerow';
    const lab = document.createElement('span');
    lab.className = 'pupname';
    lab.textContent = (PUP_CTL[id] ? PUP_CTL[id].label : id);
    row.appendChild(lab);
    row.appendChild(cuePicker(cat, c, v=>{
      const parsed = cueParse(v);
      if(parsed) cueSet(id, parsed);
      pupBuildMap();
    }));
    if(PUP_CTL[id] && PUP_CTL[id].kind === 'btn' && c.kind !== 'seq'){
      const bl = document.createElement('button');
      bl.className = 'b puplatch' + (CUE.latch[id] ? ' act' : '');
      bl.textContent = CUE.latch[id] ? 'latch' : 'hold';
      bl.title = 'hold: the action runs while you hold the button · latch: press flips it open, press again closes';
      bl.addEventListener('click', ()=>{
        CUE.latch[id] = !CUE.latch[id];
        delete CUE.held[id];
        cuePrefsStore(); pupBuildMap();
      });
      row.appendChild(bl);
    }
    const x = document.createElement('button');
    x.className = 'b pupcuex';
    x.textContent = '✕';
    x.title = 'give this control back to the servos';
    x.addEventListener('click', ()=>{ cueClear(id); pupBuildMap(); });
    row.appendChild(x);
    wrap.appendChild(row);
  });

  /* the add row — only controls that are not already doing a job */
  const free = cueFreeControls();
  if(free.length){
    const row = document.createElement('div');
    row.className = 'pupcuerow pupcueadd';
    const sel = document.createElement('select');
    sel.id = 'cueAddCtl';
    const none = document.createElement('option');
    none.value = ''; none.textContent = '＋ add a cue…';
    sel.appendChild(none);
    free.forEach(ct=>{
      const o = document.createElement('option');
      o.value = ct.id; o.textContent = ct.label;
      sel.appendChild(o);
    });
    /* a new cue starts on the most useful thing available — a group reads as
       one gesture — and the row's own picker changes it from there */
    const seed = cat.find(c=>c.kind==='grp') || cat.find(c=>c.kind==='seq') || cat[0];
    sel.addEventListener('change', ()=>{
      if(!sel.value) return;
      cueSet(sel.value, seed);
      pupBuildMap();
    });
    row.appendChild(sel);
    wrap.appendChild(row);
  }

  const bAuto = document.createElement('button');
  bAuto.className = 'b'; bAuto.id = 'cueAuto';
  bAuto.textContent = 'Auto-cue the buttons';
  bAuto.title = 'deal the ready-made actions across the face buttons and the d-pad — groups first, then saved routines';
  bAuto.addEventListener('click', ()=>{ cueAutoMap(); pupBuildMap(); });
  wrap.appendChild(bAuto);

  host.appendChild(wrap);
}
function cuePicker(cat, cur, onPick){
  const sel = document.createElement('select');
  sel.className = 'pupcuesel';
  const groups = {};
  cat.forEach(c=>{ (groups[c.group] || (groups[c.group] = [])).push(c); });
  Object.keys(groups).forEach(g=>{
    const og = document.createElement('optgroup');
    og.label = g;
    groups[g].forEach(c=>{
      const o = document.createElement('option');
      o.value = cueKey(c); o.textContent = c.label;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  sel.value = cueKey(cur);
  if(sel.value !== cueKey(cur)){          // the action went away with a re-import
    const o = document.createElement('option');
    o.value = cueKey(cur); o.textContent = cueLabel(cur);
    sel.appendChild(o);
    sel.value = cueKey(cur);
  }
  sel.addEventListener('change', ()=>onPick(sel.value));
  return sel;
}
