'use strict';
/* =====================================================================
   PUPPET MODE — the controller stops driving the droid and becomes a
   marionette rig: every stick half, trigger and button is a SERVO input
   (Mike, 2026-08-02 — "change the controller to a servo input only").
   While it is on, the running sketch sees a centred, silent pad — the
   gate lives in getAnalogHat/getButtonPress/getButtonClick, so drive,
   automation and sounds all stand down together.

   Feel (Mike's choice): sticks SPRING BACK — deflection IS the position,
   so releasing a stick glides the part closed at the servo's real
   imported speed. Buttons are hold-to-open, or latching per channel.

   Recording (Mike's choice: 3-2-1 countdown) captures what you
   COMMANDED — the targets, not the eased positions — so a take plays
   back through the same speed/accel physics as any other sequence, on
   the sim and on the real board alike. Takes are saved as plain frame
   lists (no blocks), the same species as an imported sequence: they sit
   in the library under "Recorded", drop into sequences as bricks, and go
   on the board through Put on the board.
   ===================================================================== */
const PUPPET = {
  on:false,
  map:{},            // channel i -> control id ('LY+','L2','A',...)
  latch:{},          // channel i -> true = that button latches open
  held:{},           // latched state per channel
  pose:{},           // channel i -> last commanded target (quarter-us)
  play:null,         // {frames,i,t} — the little last-take player
  lastTake:null,     // name of the most recent take
  rec:{phase:'idle', ms:0, frames:null, last:null, quiet:0, take:1},
  RECMS:50,          // sample quantum — 20 Hz keyframes
  MAXMS:120000       // a take cannot run away past two minutes
};

/* ------------------------------------------------------ the control set
   Stick halves are separate inputs — up and down can puppet two different
   servos — and the triggers are true analog. START/BACK/XBOX stay out of
   the catalog: they are system buttons, not puppet strings. */
const PUP_CONTROLS = [
  {id:'LY+', label:'Left stick ↑',  kind:'axis'},
  {id:'LY-', label:'Left stick ↓',  kind:'axis'},
  {id:'LX+', label:'Left stick →',  kind:'axis'},
  {id:'LX-', label:'Left stick ←',  kind:'axis'},
  {id:'RY+', label:'Right stick ↑', kind:'axis'},
  {id:'RY-', label:'Right stick ↓', kind:'axis'},
  {id:'RX+', label:'Right stick →', kind:'axis'},
  {id:'RX-', label:'Right stick ←', kind:'axis'},
  {id:'L2',  label:'Left trigger',  kind:'axis'},
  {id:'R2',  label:'Right trigger', kind:'axis'},
  {id:'A',   label:'A button',      kind:'btn'},
  {id:'B',   label:'B button',      kind:'btn'},
  {id:'X',   label:'X button',      kind:'btn'},
  {id:'Y',   label:'Y button',      kind:'btn'},
  {id:'L1',  label:'LB bumper',     kind:'btn'},
  {id:'R1',  label:'RB bumper',     kind:'btn'},
  {id:'UP',  label:'D-pad ↑',       kind:'btn'},
  {id:'DOWN',label:'D-pad ↓',       kind:'btn'},
  {id:'LEFT',label:'D-pad ←',       kind:'btn'},
  {id:'RIGHT',label:'D-pad →',      kind:'btn'},
  {id:'L3',  label:'L3 (stick click)', kind:'btn'},
  {id:'R3',  label:'R3 (stick click)', kind:'btn'}
];
const PUP_CTL = {};
PUP_CONTROLS.forEach(c=>{ PUP_CTL[c.id]=c; });

/* current 0..1 value of one control, straight off the merged pad state */
function pupCtlValue(id){
  const h = XB.hat, p = XB.press;
  switch(id){
    case 'LY+': return Math.max(0,  h.LeftHatY/32767);
    case 'LY-': return Math.max(0, -h.LeftHatY/32767);
    case 'LX+': return Math.max(0,  h.LeftHatX/32767);
    case 'LX-': return Math.max(0, -h.LeftHatX/32767);
    case 'RY+': return Math.max(0,  h.RightHatY/32767);
    case 'RY-': return Math.max(0, -h.RightHatY/32767);
    case 'RX+': return Math.max(0,  h.RightHatX/32767);
    case 'RX-': return Math.max(0, -h.RightHatX/32767);
    case 'L2':  return (p.L2|0)/255;
    case 'R2':  return (p.R2|0)/255;
    default:    return p[id] > 0 ? 1 : 0;
  }
}

/* the channels that can be puppeted: servo mode, mapped to a real part */
function pupChannels(){
  if(!MSTR.loaded) return [];
  return MSTR.channels.filter(c=>c.act && /^servo/i.test(c.mode));
}

/* ---------------------------------------------------------- auto-map
   Most expressive inputs first: stick halves and triggers take the early
   channels, buttons mop up the rest. */
function puppetAutoMap(){
  const order = ['LY+','LY-','RY+','RY-','LX+','LX-','RX+','RX-','L2','R2',
                 'A','B','X','Y','L1','R1','UP','DOWN','LEFT','RIGHT','L3','R3'];
  PUPPET.map = {}; PUPPET.held = {};
  const chans = pupChannels();
  chans.forEach((c,k)=>{ if(k < order.length) PUPPET.map[c.i] = order[k]; });
  pupPrefsStore();
  lg('sys','puppet: auto-mapped '+Math.min(chans.length,order.length)+' of '+chans.length+' servos to the pad');
}

/* ------------------------------------------------------------ on / off */
function puppetSet(on){
  if(on === PUPPET.on) return;
  if(on){
    if(!MSTR.loaded && typeof buildEnsureMaestro === 'function') buildEnsureMaestro();
    if(!pupChannels().length){
      lg('warn','puppet: no servo channels are mapped to parts yet — generate or import a board first (Setup, or the Maestro tab)');
      return;
    }
    PUPPET.on = true;
    if(!Object.keys(PUPPET.map).length) puppetAutoMap();
    lg('sys','PUPPET MODE — the pad is servo input only; drive, automation and sounds are gated off');
  }else{
    if(PUPPET.rec.phase === 'rec') pupRecStop();          // never lose a take
    if(PUPPET.rec.phase === 'count') pupRecCancel();
    PUPPET.on = false;
    PUPPET.play = null;
    if(typeof cueStopAll === 'function') cueStopAll();
    /* hands off the strings: everything glides home at its own speed */
    for(const c of pupChannels()){
      if(PUPPET.map[c.i] !== undefined) ACT_T[c.act] = chanNorm(c, blockClosed(c));
    }
    PUPPET.held = {}; PUPPET.pose = {};
    lg('sys','puppet off — the controller is a controller again');
  }
  document.body.classList.toggle('pupmode', PUPPET.on);
  pupBuildBar(); pupBuildMap();
}

/* ------------------------------------------------------- per-frame tick
   Runs from the main loop right after pollInput(), BEFORE the sketch —
   reads the raw pad, writes the servo targets. The sketch never sees the
   pad because the xbox.js accessors are gated while PUPPET.on. */
function puppetTick(dtms){
  if(!PUPPET.on || !MSTR.loaded) return;

  /* the last-take player owns the strings while it runs */
  if(PUPPET.play){ pupPlayStep(dtms); }

  /* cues go BEFORE the strings so a servo that is somebody's string always
     wins its own channel back from a group or routine that also names it */
  if(typeof cueTick === 'function') cueTick(dtms);

  for(const c of pupChannels()){
    const ctl = PUPPET.map[c.i];
    if(ctl === undefined) continue;
    let v = pupCtlValue(ctl);
    const meta = PUP_CTL[ctl];
    if(meta && meta.kind === 'btn' && PUPPET.latch[c.i]){
      if(XB.click[ctl]){ XB.click[ctl] = false; PUPPET.held[c.i] = !PUPPET.held[c.i]; }
      v = PUPPET.held[c.i] ? 1 : 0;
    }
    const closed = blockClosed(c), open = blockOpen(c);
    const units = Math.round(closed + (open - closed) * clamp(v, 0, 1));
    PUPPET.pose[c.i] = units;
    /* a cue holding this same servo wins until it lets go — see cueOwns */
    if(typeof cueOwns === 'function' && cueOwns(c.act)) continue;
    if(!PUPPET.play) ACT_T[c.act] = chanNorm(c, units);
  }
  pupRecTick(dtms);
}

/* ---------------------------------------------------------- recording */
function pupRecArm(){
  if(!PUPPET.on || PUPPET.rec.phase !== 'idle') return;
  PUPPET.play = null;
  PUPPET.rec = {phase:'count', ms:3000, frames:null, last:null, quiet:0, take:PUPPET.rec.take};
  lg('mae','recording in 3…');
  pupBuildBar();
}
function pupRecCancel(){
  PUPPET.rec = {phase:'idle', ms:0, frames:null, last:null, quiet:0, take:PUPPET.rec.take};
  if(typeof cueRecCancel === 'function') cueRecCancel();
  lg('mae','recording cancelled');
  pupBuildBar(); pupCountShow(null);
}
function pupRecTick(dtms){
  const r = PUPPET.rec;
  if(r.phase === 'count'){
    const before = Math.ceil(r.ms/1000);
    r.ms -= dtms;
    const now = Math.ceil(Math.max(0, r.ms)/1000);
    if(now !== before && now > 0) lg('mae', now+'…');
    pupCountShow(now > 0 ? now : 'GO');
    if(r.ms <= 0){
      r.phase = 'rec'; r.ms = 0; r.frames = []; r.last = null; r.quiet = 0;
      if(typeof cueRecStart === 'function') cueRecStart();
      lg('mae','● recording — puppet away, press ■ when the take is done');
      setTimeout(()=>pupCountShow(null), 350);
      pupBuildBar();
    }
    return;
  }
  if(r.phase !== 'rec') return;
  if(typeof cueRecTick === 'function') cueRecTick(dtms);
  r.ms += dtms;
  while(r.ms >= PUPPET.RECMS){
    r.ms -= PUPPET.RECMS;
    pupRecSample();
  }
  const total = r.frames.reduce((a,f)=>a+f.duration, 0);
  if(total >= PUPPET.MAXMS){ lg('warn','two minutes — the take stops itself'); pupRecStop(); }
}
function pupRecSample(){
  const r = PUPPET.rec;
  const mapped = pupChannels().filter(c=>PUPPET.map[c.i] !== undefined);
  if(!r.frames.length){
    /* first frame carries the whole starting pose, so playback always
       begins from what the performance began from */
    const t = new Array(MSTR.servoCount).fill(0);
    mapped.forEach(c=>{ t[c.i] = PUPPET.pose[c.i] || blockClosed(c); });
    r.frames.push({name:'', duration:PUPPET.RECMS, targets:t});
    r.last = t.slice();
    return;
  }
  let changed = false;
  for(const c of mapped){
    const v = PUPPET.pose[c.i] || blockClosed(c);
    if(v !== r.last[c.i]){ changed = true; break; }
  }
  if(!changed){
    r.frames[r.frames.length-1].duration += PUPPET.RECMS;
    r.quiet += PUPPET.RECMS;
    return;
  }
  /* change-only keyframe — untouched channels stay 0 = "leave it alone",
     stored as a FULL zero-filled array so a save/load round-trip cannot
     turn sparse holes into nulls. This is the RECORDER's shape only: the
     take is densified before it reaches the library (pupRecStop →
     pupDensify), because 0 means "leave it alone" to the sim and "stop
     sending pulses" to the board (v1.77.0, review H7). */
  const t = new Array(MSTR.servoCount).fill(0);
  for(const c of mapped){
    const v = PUPPET.pose[c.i] || blockClosed(c);
    if(v !== r.last[c.i]){ t[c.i] = v; r.last[c.i] = v; }
  }
  r.frames.push({name:'', duration:PUPPET.RECMS, targets:t});
  r.quiet = 0;
}
function pupRecStop(){
  const r = PUPPET.rec;
  if(r.phase !== 'rec') return;
  /* a long motionless tail is not part of the performance — keep 300 ms
     of settle and cut the rest */
  if(r.quiet > 300){
    const f = r.frames[r.frames.length-1];
    f.duration = Math.max(PUPPET.RECMS, f.duration - (r.quiet - 300));
  }
  const frames = r.frames;
  const hadCues = (typeof cueRecActive === 'function') && cueRecActive();
  PUPPET.rec = {phase:'idle', ms:0, frames:null, last:null, quiet:0, take:r.take};
  pupCountShow(null);
  /* a take with cues in it is a performance even if no stick moved — only
     a silent strings-only take is nothing at all */
  if(!hadCues && (!frames || frames.length < 2)){
    if(typeof cueRecCancel === 'function') cueRecCancel();
    lg('mae','take discarded — nothing moved');
    pupBuildBar();
    return;
  }
  const nameEl = $('pupTake');
  let name = (nameEl && nameEl.value.trim()) || ('Take '+r.take);
  /* never silently overwrite an earlier take */
  while(MSTR.sequences.some(s=>s.name === name)) name = name + '·';

  /* THE TWO SPECIES OF TAKE
     Cues fired  → a BRICK ROUTINE: one brick per press, at the instant it
                   was pressed, for as long as it was held, with the stick
                   work nested as a single brick on the spine. It opens in
                   the sequencer, where it can be dragged, retimed, undone.
     Strings only → a plain frame list, the same species as an imported
                   sequence (pinned by tests) — DENSIFIED on the way in
                   (v1.77.0, review H7; see pupDensify below). It used to go
                   in exactly as recorded, change-only, and that shape is a
                   different sequence on the board than on the model. */
  let seq = null;
  if(hadCues){
    const mapped = pupChannels().filter(c=>PUPPET.map[c.i] !== undefined);
    seq = cueRecFinish(name, frames, mapped);
  }
  if(!seq){
    seq = {name, frames:pupDensify(frames), cat:'Recorded'};
    MSTR.sequences.push(seq);
  }
  if(typeof reindexSubs === 'function') reindexSubs();
  PUPPET.rec.take = r.take + 1;
  PUPPET.lastTake = seq.name;
  if(nameEl) nameEl.value = '';
  const total = seqTotal(seq);
  if(seq.blocks){
    lg('mae','■ saved as a sequence: '+seq.name+'  ('+seq.blocks.length+' bricks, '+(total/1000).toFixed(1)+' s) — opening it in the sequencer');
    pupOpenTake(seq);
    return;
  }
  lg('mae','■ saved to the library: '+seq.name+'  ('+seq.frames.length+' keyframes, '+(total/1000).toFixed(1)+' s) — find it under "Recorded" in the sequencer, or Put on the board to send it to the Maestro');
  pupBuildBar();
}
/* A STRINGS-ONLY TAKE IS DENSE (v1.77.0, review 2026-09-01 H7)
   The recorder writes change-only keyframes: a channel that did not move
   in a frame is 0, and the sim's player reads 0 as "leave it alone"
   (applyFrameTargets, playback.js) — so on the model the sparse take was
   exact. The BOARD does not read it that way. export.js's genSeqBody emits a
   target whenever a channel's value differs from the frame before, and a
   Maestro target of 0 is "stop sending pulses": a panel opened in one
   keyframe went limp at the next one it was not named in, and every servo
   the strings never touched was switched off at frame 0 — 22 of them on a
   Mini 24 with two strings mapped. The cued path already densified its
   nested string frames for the block compiler's sake (cueDensify, cues.js);
   this path stored the raw list and pinned it as a contract.

   So: every SERVO-MODE channel — mapped to a string or not — is carried
   through every frame, seeded at the channel's closed end, which is where
   blockCompile() starts every routine from (base[c.i] = blockClosed(c)) and
   where the puppet itself parks a released string. cueDensify() does the
   carry; the seed is the only thing it does not do, because its own caller
   nests the result inside a routine that supplies the base pose. Frame
   count and durations are untouched: keyframes still fall only where
   something changed, they just say where everything else is. */
function pupDensify(frames){
  if(!frames || !frames.length || typeof cueDensify !== 'function') return frames;
  const chans = (typeof BLKH !== 'undefined' && BLKH.servoChannels)
    ? BLKH.servoChannels() : MSTR.channels.filter(c=>/^servo/i.test(c.mode));
  const first = frames[0].targets.slice();
  chans.forEach(c=>{ if(!first[c.i]) first[c.i] = blockClosed(c); });
  const seeded = [{name:frames[0].name, duration:frames[0].duration, targets:first}].concat(frames.slice(1));
  return cueDensify(seeded, chans);
}
/* Mike's choice: a cued take lands you straight in the sequencer looking at
   it. setStripMode takes the puppet off on the way in — the two cannot both
   own the servos — so this is the end of the recording session. */
function pupOpenTake(seq){
  const at = MSTR.sequences.indexOf(seq);
  if(at < 0 || typeof setStripMode !== 'function'){ pupBuildBar(); return; }
  EDIT.seq = at;
  setStripMode('seq');
  if(typeof buildSequencer === 'function') buildSequencer();
  pupBuildBar();
}

/* ------------------------------------------------- play the last take */
function pupPlayLast(){
  const seq = MSTR.sequences.find(s=>s.name === PUPPET.lastTake);
  if(!seq){ lg('warn','no take recorded yet'); return; }
  PUPPET.play = {frames:seq.frames, i:-1, t:0};
  lg('mae','▶ '+seq.name);
}
function pupPlayStep(dtms){
  const s = PUPPET.play;
  if(s.i < 0){ s.i = 0; s.t = 0; if(s.frames[0]) applyFrameTargets(s.frames[0].targets, s.frames[0].speeds); }
  else s.t += dtms;
  while(s.frames[s.i] && s.t >= s.frames[s.i].duration){
    s.t -= s.frames[s.i].duration;
    s.i++;
    if(s.frames[s.i]) applyFrameTargets(s.frames[s.i].targets, s.frames[s.i].speeds);
  }
  if(!s.frames[s.i]){ PUPPET.play = null; pupBuildBar(); }
}

/* ------------------------------------------------------------- prefs */
function pupPrefsStore(){
  PREFS.puppetMap = {map:PUPPET.map, latch:PUPPET.latch};
  prefsSave();
}
function pupPrefsRestore(){
  const p = PREFS.puppetMap;
  if(p && p.map){ PUPPET.map = p.map; PUPPET.latch = p.latch || {}; }
  if(typeof cuePrefsRestore === 'function') cuePrefsRestore();
}

/* =====================================================================
   UI — the bar above the pad, the mapping table beside it, the countdown
   ===================================================================== */
function pupCountShow(v){
  const el = $('pupcount'); if(!el) return;
  el.classList.toggle('on', v !== null && v !== undefined);
  if(v !== null && v !== undefined) el.textContent = v;
}
function pupBuildBar(){
  const bar = $('pupbar'); if(!bar) return;
  /* the bar is rebuilt on arm, on GO and on stop — a name typed into the
     take field before pressing ● must survive all three, or you never get
     to name a take at all */
  const keepName = $('pupTake') ? $('pupTake').value : '';
  bar.innerHTML = '';
  const sw = document.createElement('label');
  sw.className = 'blkswitch pupsw';
  sw.title = 'the pad stops driving and becomes a marionette rig — every stick, trigger and button is a servo input';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.id = 'pupOn'; cb.checked = PUPPET.on;
  cb.addEventListener('change', ()=>puppetSet(cb.checked));
  sw.appendChild(cb);
  sw.appendChild(document.createTextNode('🎭 Puppet the servos'));
  bar.appendChild(sw);
  if(!PUPPET.on){
    const h = document.createElement('span');
    h.className = 'puphint';
    h.textContent = 'sticks play the servos, buttons fire whole actions — then record the performance into the sequencer';
    bar.appendChild(h);
    return;
  }
  const rec = PUPPET.rec;
  const bRec = document.createElement('button');
  bRec.className = 'b' + (rec.phase === 'rec' ? ' recing' : '');
  bRec.id = 'pupRec';
  bRec.textContent = rec.phase === 'idle' ? '● Record' : rec.phase === 'count' ? '…' : '■ Stop & save';
  bRec.title = rec.phase === 'idle' ? 'three-two-one, then everything you puppet is captured as a sequence'
             : rec.phase === 'count' ? 'counting down — click to cancel'
             : 'finish the take and save it to the library';
  bRec.addEventListener('click', ()=>{
    if(rec.phase === 'idle') pupRecArm();
    else if(rec.phase === 'count') pupRecCancel();
    else pupRecStop();
  });
  bar.appendChild(bRec);
  const nm = document.createElement('input');
  nm.type = 'text'; nm.id = 'pupTake';
  nm.placeholder = 'Take '+rec.take;
  nm.title = 'name the next take — blank means Take '+rec.take;
  nm.value = keepName;
  bar.appendChild(nm);
  if(PUPPET.lastTake){
    const bP = document.createElement('button');
    bP.className = 'b'; bP.id = 'pupPlay';
    bP.textContent = PUPPET.play ? '▶ playing…' : '▶ Last take';
    bP.title = 'replay '+PUPPET.lastTake+' through the servo physics';
    bP.addEventListener('click', pupPlayLast);
    bar.appendChild(bP);
  }
  const bMap = document.createElement('button');
  bMap.className = 'b'; bMap.id = 'pupAuto';
  bMap.textContent = 'Auto-map';
  bMap.title = 'deal the servos back out across the pad — sticks and triggers first, then buttons';
  bMap.addEventListener('click', ()=>{ puppetAutoMap(); pupBuildMap(); });
  bar.appendChild(bMap);
}
function pupBuildMap(){
  const host = $('pupside'); if(!host) return;
  host.innerHTML = '';
  if(!PUPPET.on) return;
  const h = document.createElement('h4');
  h.textContent = 'Who plays what';
  host.appendChild(h);
  for(const c of pupChannels()){
    const row = document.createElement('div');
    row.className = 'puprow';
    const lab = document.createElement('span');
    lab.className = 'pupname';
    lab.textContent = c.name || c.act;
    lab.title = 'channel '+c.i+' → '+c.act;
    row.appendChild(lab);
    const sel = document.createElement('select');
    const none = document.createElement('option');
    none.value = ''; none.textContent = '— not mapped';
    sel.appendChild(none);
    PUP_CONTROLS.forEach(ct=>{
      const o = document.createElement('option');
      o.value = ct.id; o.textContent = ct.label;
      sel.appendChild(o);
    });
    sel.value = PUPPET.map[c.i] !== undefined ? PUPPET.map[c.i] : '';
    sel.addEventListener('change', ()=>{
      if(sel.value === ''){ delete PUPPET.map[c.i]; ACT_T[c.act] = chanNorm(c, blockClosed(c)); }
      else {
        /* one control, one job — taking it back from a cue */
        if(typeof cueFree === 'function') cueFree(sel.value);
        PUPPET.map[c.i] = sel.value;
      }
      pupPrefsStore(); pupBuildMap();
    });
    row.appendChild(sel);
    const ctl = PUPPET.map[c.i];
    if(ctl && PUP_CTL[ctl] && PUP_CTL[ctl].kind === 'btn'){
      const bl = document.createElement('button');
      bl.className = 'b puplatch' + (PUPPET.latch[c.i] ? ' act' : '');
      bl.textContent = PUPPET.latch[c.i] ? 'latch' : 'hold';
      bl.title = 'hold: open while pressed · latch: press flips open/closed';
      bl.addEventListener('click', ()=>{
        if(PUPPET.latch[c.i]) delete PUPPET.latch[c.i]; else PUPPET.latch[c.i] = true;
        delete PUPPET.held[c.i];
        pupPrefsStore(); pupBuildMap();
      });
      row.appendChild(bl);
    }
    host.appendChild(row);
  }
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.style.marginTop = '8px';
  hint.textContent = 'Stick halves are separate strings — up and down can each play a different servo. Everything springs closed when you let go.';
  host.appendChild(hint);
  /* the other half of the rig: controls that fire whole actions */
  if(typeof cueBuildPanel === 'function') cueBuildPanel(host);
}

/* the bar exists from the start, showing just the switch */
window.addEventListener('load', ()=>{ pupBuildBar(); });
