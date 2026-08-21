'use strict';
/* ------------------------------------------------------ bottom sequencer */
/* Sequence mode is now a MODE, not a strip: it opens straight into the
   expanded layout (Mike — "opening Sequence Mode should immediately enter
   its expanded layout"), and the way out is one button, "Back to workshop".
   The old ⛶ Expand / Restore toggle is gone; having sequence mode and
   expanded-ness as two independent states is what let it end up squashed. */
function setStripMode(m){
  /* the desk is the biggest thing sim only takes away, and it has more
     doors than any other surface (the strip switch, the header, a dropped
     audio file, a sequence card). Refusing entry here closes all of them
     at once. Leaving — setStripMode('pad') — is never refused: kioskEnter
     itself uses it to get out of the desk on the way in. */
  if(m === 'seq' && typeof kioskOn === 'function' && kioskOn()) return;
  const wasActive = EDIT.active;
  EDIT.active = (m==='seq');
  document.body.classList.toggle('seqmode', EDIT.active);
  document.body.classList.toggle('seqbig', EDIT.active);
  document.querySelectorAll('#stripmode .smbtn').forEach(b=>b.classList.toggle('act', b.dataset.m===m));
  if(EDIT.active){
    /* the sequencer and the puppet rig cannot both own the servos */
    if(typeof PUPPET !== 'undefined' && PUPPET.on) puppetSet(false);
    if(!MSTR.loaded && typeof buildEnsureMaestro === 'function') buildEnsureMaestro();
    sqBuildLabel();
    if(typeof liveUiSync === 'function') liveUiSync();
    buildSequencer(); applyLivePose();
    viewFrame('head');                            // sequencing is mostly dome work
    if(typeof blkTickStart === 'function') blkTickStart();
  }else if(wasActive){
    /* LEAVING DISARMS THE REAL SERVOS (v1.39.4). Mike: "comming out of
       sequencer shoudl dissable live mode."

       Right, and for the same reason the tint is dropped two lines down:
       live drive is sequencer state, and state that outlives the screen it
       was armed on is state nobody is watching. The arm is deliberately
       loud while you are at the desk — an amber, pulsing button — and the
       moment you press Back to workshop that signal is off screen while a
       pad cue or a music track could still be reaching the board through
       the same seam. An arm you cannot see is an arm you have forgotten.

       The servos keep their last position rather than going limp; that is
       liveSet(false)'s own rule, because a released servo drops whatever it
       was holding up. */
    if(typeof liveSet === 'function' && typeof LIVE !== 'undefined' && LIVE.on)
      liveSet(false, {why:'Live drive off — you left the sequencer. The servos hold where they are.'});
    /* leaving the sequencer restores the model's normal colours — the
       identification tint is sequencer-only state and must not follow you
       back to the controller (spec, 2026-07-29) */
    if(typeof blkTickStop === 'function') blkTickStop();
    if(typeof blkLibPreviewClose === 'function') blkLibPreviewClose();
    if(typeof BLK !== 'undefined' && BLK.tint){
      BLK.tint = false;
      if(typeof applyPaint === 'function') applyPaint();
      lg('sys','left the sequencer — paint scheme restored');
    }
    if(typeof MUSIC !== 'undefined' && MUSIC.playing && typeof musicStop === 'function') musicStop();
  }
  /* LAST line, by contract (config/workspaces.js): one-way sync, strip →
     header. Every door into and out of the desk goes through setStripMode,
     so this is the single place the workspace switcher learns about it.
     wsStripSync never calls back — the strip already IS in mode m. */
  if(typeof wsStripSync === 'function') wsStripSync(m);
  setTimeout(onResize, 0);
}
document.querySelectorAll('#stripmode .smbtn').forEach(b=>{
  b.addEventListener('click',()=>setStripMode(b.dataset.m));
});
$('sqBig').addEventListener('click',()=>setStripMode('pad'));
$('sqVHead').addEventListener('click',()=>viewFrame('head'));
$('sqVBody').addEventListener('click',()=>viewFrame('body'));
$('sqVFull').addEventListener('click',()=>viewFrame('full'));

function buildSequencer(){
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null;
  $('seqName').textContent = seq
    ? (seq.name + '  ·  ' + (blockIsRoutine(seq) ? blockList(seq).length+' bricks' : seq.frames.length+' frames')
       + '  ·  ' + (seqTotal(seq)/1000).toFixed(1) + 's'
       + (BLK.adv ? '  ·  sub ' + niceName(seq.name) : ''))
    : 'no settings file — the Maestro tab can generate a starter';
  /* the snap picker is built by blkTimeline() into the ruler's corner cell
     (v1.47.0) — no separate call needed here */
  if(typeof buildSeqLib==='function') buildSeqLib();
  if(typeof buildBlocks==='function') buildBlocks();
  buildTimeline(); buildPose(); buildFrameTable();
  if(typeof musicRebuildUI==='function') musicRebuildUI();
  /* the library and the routine being built are part of the servo config —
     coalesced, because this runs on every drag (maestro/servo-store.js) */
  if(typeof servoStoreTouch==='function') servoStoreTouch();
}
/* the snap-mode picker in the top bar — the explicit choice Mike's spec
   asks for: Auto, strong beats only, all beats, or off/manual */
const SNAP_MODES = [
  ['auto',  'Auto-snap',      'snap to the nearest beat when music is loaded, and to neighbouring bricks'],
  ['strong','Strong beats',   'snap only to the strong (bar-start) beats'],
  ['all',   'All beats',      'snap to every beat'],
  ['off',   'Off / manual',   'no snapping — place bricks freely']
];
function buildSnapPicker(hostNode){
  /* v1.47.0 — the picker lives in the timeline ruler's corner cell, which
     blkTimeline() builds DETACHED and passes in; the id lookup remains as
     the fallback for any caller that still has a live wrap in the DOM. */
  const host = hostNode || $('sqSnapWrap'); if(!host) return;
  host.innerHTML = '';
  const hasMusic = (typeof MUSIC !== 'undefined') && MUSIC.loaded;
  host.appendChild(el('span',null,'snap'));
  const sel = document.createElement('select');
  SNAP_MODES.forEach(([v,l,tip])=>{
    const o = document.createElement('option');
    o.value = v; o.textContent = l; o.title = tip;
    if(BLK.snapMode === v) o.selected = true;
    sel.appendChild(o);
  });
  sel.title = hasMusic
    ? 'placement is snapping to the musical timing of the loaded track'
    : 'no music loaded — Auto snaps to neighbouring bricks and a 50 ms grid';
  sel.addEventListener('change',()=>{
    BLK.snapMode = sel.value;
    PREFS.seqSnap = sel.value; prefsSave();
    buildSequencer();
  });
  host.appendChild(sel);
  if(hasMusic && BLK.snapMode !== 'off') host.appendChild(el('span','snapchip','♪'));
}
/* three views on the same routine: the bricks, a live pose, the frames it
   compiles to. Body class drives the layout so nothing has to be hidden
   one element at a time.

   v1.52.0 — Mike: *"Pose and Frames should only be displayed when advanced
   is ticked."* Which is his standing brief applied to the one place it had
   not been: BRICKS is how you author a routine, and the other two are ways
   of looking underneath it — a live pose you set channel by channel, and
   the frame list the bricks compile to. Both are useful and neither is a
   beginner's first move, so they go behind the same Advanced tick that
   already reveals the per-brick speed overrides.

   Hidden, never orphaning: if Advanced goes off while you are standing in
   one of them, the view comes back to the bricks rather than leaving you
   on a pane whose only door has just been removed. */
function sqAdvViews(){
  const on = !!BLK.adv;
  [['sqViewPose','pose'], ['sqViewTable','table']].forEach(([id])=>{
    const b = $(id); if(b) b.classList.toggle('hide', !on);
  });
  if(!on && (EDIT.view === 'pose' || EDIT.view === 'table')) setSeqView('blocks');
}
function setSeqView(v){
  EDIT.view = v;
  document.body.classList.remove('seqv-blocks','seqv-pose','seqv-table');
  document.body.classList.add('seqv-'+v);
  [['blocks','sqViewBlocks'],['pose','sqViewPose'],['table','sqViewTable']].forEach(([k,id])=>{
    const b=$(id); if(b) b.classList.toggle('act', k===v);
  });
}
function buildTimeline(){
  const host=$('seqtl'); host.innerHTML='';
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null;
  if(!seq) return;
  seq.frames.forEach((f,i)=>{
    const d=el('div','tlf'+(i===EDIT.frame?' sel':''));
    d.style.width = Math.max(44, Math.min(150, f.duration/8))+'px';
    d.appendChild(el('b',null,String(i)));
    const dur=document.createElement('input');
    dur.type='number'; dur.value=f.duration; dur.min=0; dur.step=50;
    dur.style.cssText='width:100%;font-family:var(--mono);font-size:9px;background:#0a0e14;color:var(--am);border:1px solid #202834;border-radius:2px;text-align:right;padding:0 2px';
    dur.addEventListener('click',e=>e.stopPropagation());
    dur.addEventListener('change',()=>{ f.duration=Math.max(0,parseInt(dur.value,10)||0); buildTimeline(); buildMaestroPane(); });
    d.appendChild(dur);
    d.addEventListener('click',()=>{
      EDIT.frame=i;
      EDIT.live = f.targets.slice();
      applyLivePose();
      buildSequencer();
    });
    host.appendChild(d);
  });
}
/* WHAT THE DESK SHOWS (v1.39.3)
   Mike: "in the sequncer only parts that are assigned to servos should be
   displayed."

   The brick library already worked this way — `BLKH.actions()` has always
   filtered to servo channels WITH an actuator, because a brick for a channel
   that drives nothing is a brick that does nothing. Pose and Frames did not:
   they listed every channel in Servo mode, mapped or not, and handed the
   unmapped ones a "map it to move it" hint. On a 24- or 32-channel board
   that is a column of dead rows between you and the ones you came for.

   So they follow the library now. Nothing is silently swallowed: the count
   is stated under the list and one click brings them back, because a
   board-only channel IS real — it just has nothing on this model to move,
   and since v1.39.0 it can still be driven live. */
function seqShowUnmapped(){ return !!EDIT.showUnmapped; }
function seqPoseChans(){
  const all = MSTR.loaded ? MSTR.channels.filter(c=>c && /^servo/i.test(c.mode)) : [];
  return seqShowUnmapped() ? all : all.filter(c=>c.act);
}
function seqUnmappedNote(host, n){
  if(!n) return;
  const d = el('div','hint');
  const b = el('button','b', seqShowUnmapped() ? 'hide them' : 'show them');
  b.style.marginLeft = '6px';
  b.addEventListener('click',()=>{ EDIT.showUnmapped = !EDIT.showUnmapped; buildSequencer(); });
  d.appendChild(document.createTextNode(
    n + ' channel' + (n===1?'':'s') + ' in use ' + (n===1?'drives':'drive') + ' nothing on this model'
    + (seqShowUnmapped() ? '.' : ' and are hidden.')));
  d.appendChild(b);
  host.appendChild(d);
}
function buildPose(){
  const host=$('seqpose'); host.innerHTML='';
  if(!MSTR.loaded) return;
  seqPoseChans().forEach(c=>{
    const r=el('div','chrow'+(c.act?'':' unmapped'));
    const nm=el('div','nm',c.i+' '+c.name); nm.title=c.name+(c.act?'':'  (not mapped to a droid part)');
    r.appendChild(nm);
    /* a slider that drives nothing has no user value (spec, 2026-07-29):
       an unmapped channel gets a hint instead of a dead control. Its
       targets can still be typed under Frames for a board-only channel. */
    if(!c.act){
      const hint=el('div','qv','map it to move it');
      hint.title='this channel drives nothing on the model — map it in the channel map (or the import wizard) and a slider appears. Values can still be typed under Frames.';
      hint.style.width='auto';
      r.appendChild(hint);
      host.appendChild(r);
      return;
    }
    const sl=document.createElement('input');
    sl.type='range'; sl.min=Math.min(c.min,c.max); sl.max=Math.max(c.min,c.max); sl.step=4;
    sl.value=EDIT.live[c.i]||c.home;
    const qv=el('div','qv',qus(sl.value));
    sl.addEventListener('input',()=>{
      EDIT.live[c.i]=parseInt(sl.value,10);
      qv.textContent=qus(sl.value);
      applyLivePose();
    });
    r.appendChild(sl); r.appendChild(qv);
    host.appendChild(r);
  });
  seqUnmappedNote(host, MSTR.channels.filter(c=>c && /^servo/i.test(c.mode) && !c.act).length);
  const tools=el('div','conbar'); tools.style.width='100%'; tools.style.padding='4px 0 0';
  const bHome=el('button','b','All home');
  /* v1.45.0 — chanRest(), not c.home: a channel with homemode Off has no
     number worth obeying, and mid-travel left every pie panel half open. */
  bHome.addEventListener('click',()=>{ MSTR.channels.forEach(c=>{EDIT.live[c.i]=chanRest(c);}); applyLivePose(); buildPose(); });
  /* v1.46.0 — a channel's OWN min and max, not the numerically lower and
     higher of the pair. min is the shut end and max the open one whatever
     their order (chanNorm(), playback.js), so on a reversed channel "All
     min" used to fling that panel wide open. */
  const bMin=el('button','b','All min');
  bMin.title='every channel to its min end — shut, on the model';
  bMin.addEventListener('click',()=>{ MSTR.channels.forEach(c=>{EDIT.live[c.i]=chanEnds(c).shut;}); applyLivePose(); buildPose(); });
  const bMax=el('button','b','All max');
  bMax.title='every channel to its max end — fully open, on the model';
  bMax.addEventListener('click',()=>{ MSTR.channels.forEach(c=>{EDIT.live[c.i]=chanEnds(c).open;}); applyLivePose(); buildPose(); });
  tools.appendChild(bHome); tools.appendChild(bMin); tools.appendChild(bMax);
  host.appendChild(tools);
}
function buildFrameTable(){
  const host=$('seqtable'); host.innerHTML='';
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null;
  if(!seq) return;
  /* the same rule as Pose and the brick library — see seqPoseChans() */
  const chans = seqPoseChans();
  const t=el('table','tbl');
  const th=el('thead'); const tr0=el('tr');
  tr0.appendChild(el('th','l','Frame'));
  tr0.appendChild(el('th',null,'ms'));
  chans.forEach(c=>{ const e=el('th',null,String(c.i)); e.title=c.name; tr0.appendChild(e); });
  th.appendChild(tr0); t.appendChild(th);
  const tb=el('tbody');
  seq.frames.forEach((f,i)=>{
    const tr=el('tr'); if(i===EDIT.frame) tr.className='sel';
    const nd=el('td','l',i+' · '+f.name); nd.style.cursor='pointer';
    nd.addEventListener('click',()=>{ EDIT.frame=i; EDIT.live=f.targets.slice(); applyLivePose(); buildSequencer(); });
    tr.appendChild(nd);
    const dtd=el('td');
    const di=document.createElement('input'); di.type='number'; di.value=f.duration; di.step=50;
    di.addEventListener('change',()=>{ f.duration=Math.max(0,parseInt(di.value,10)||0); buildTimeline(); buildMaestroPane(); });
    dtd.appendChild(di); tr.appendChild(dtd);
    chans.forEach(c=>{
      const td=el('td');
      const inp=document.createElement('input'); inp.type='number'; inp.value=f.targets[c.i]||0; inp.step=4;
      inp.addEventListener('change',()=>{
        f.targets[c.i]=Math.max(0,parseInt(inp.value,10)||0);
        if(i===EDIT.frame){ EDIT.live=f.targets.slice(); applyLivePose(); }
        buildMaestroPane();
      });
      td.appendChild(inp); tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb); host.appendChild(t);
  const h=el('div','hint');
  h.innerHTML='Quarter-microseconds — 6000 = 1500 µs neutral, 0 means “leave this channel alone”.'
    + ' Columns are the channels that drive a part; a hidden one keeps whatever target it already had.';
  host.appendChild(h);
  seqUnmappedNote(host, MSTR.channels.filter(c=>c && /^servo/i.test(c.mode) && !c.act).length);
}

/* --- transport --- */
$('sqPlay').addEventListener('click',()=>{
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null;
  if(!seq || !seq.frames.length) return;
  if(typeof blkPlayheadSet==='function') blkPlayheadSet(0, false);
  seqStart('edit', seq.frames, 'preview');
  lg('mae','preview: '+seq.name+'  ('+seqTotal(seq)+' ms)');
  /* v1.47.2 — a grey brick DOES move the model in the preview now (Mike:
     unmapped panels "should 'Work' on the sim"); what it cannot do is
     reach the board. Still named, at the moment you are watching. */
  const un = (typeof blockUnwiredNote==='function') ? blockUnwiredNote(seq) : '';
  if(un){
    if(typeof toast==='function') toast(un+' — they move the model only until they are mapped', 'warn');
    lg('warn','preview: '+un+' — model only, nothing reaches a board for them');
  }
});
$('sqStop').addEventListener('click',()=>{
  if(typeof MAESTRO!=='undefined' && MAESTRO.slot) delete MAESTRO.slot.edit;
  if(typeof MUSIC!=='undefined' && MUSIC.playing && typeof musicStop==='function') musicStop();
});
/* Mike: "for the Sequencer we should have the option to drive the real servos
   too." The switch is here, beside the transport, because this is where you
   are standing when you decide to trust a routine — but the seam it arms is
   playback.js, so a pad cue and a music track follow the same arm rather than
   being three different ideas of what live means. */
$('sqLive').addEventListener('click',()=>{ if(typeof liveToggle === 'function') liveToggle(); });
if(typeof liveUiSync === 'function') liveUiSync();
$('sqBuild').addEventListener('click',()=>{ if(typeof bldOpen==='function') bldOpen(); });

/* ------------------------------------------- IMPORT, FROM THE SEQUENCER
   Mike, v1.46.0: "in the sequencer we should have the import sequence
   button available".

   It goes on the sequencer's own top bar, next to ⚙ Build — the two file
   ends of the desk, one bringing choreography in and one sending it to the
   board — rather than sending you back to the workshop to find it.

   THE BUTTON IS BUILT HERE, IN SCRIPT, and not in html/body.html: the
   import chooser is being built in the same release and the markup is a
   file two people would otherwise both be editing. It also means the
   sequencer owns its own control.

   IT IS NOT A FOURTH COPY OF THE IMPORT LOGIC. There are already three
   doors into importing and a fourth implementation is how they drift. So it
   CALLS, defensively: the chooser when the chooser exists, and the job
   wizard's own import job when it does not. Whichever is present answers;
   nothing here knows how to read a file. */
function sqImportOpen(){
  if(typeof impChooseOpen === 'function'){ impChooseOpen({kind:'choreography', from:'sequencer'}); return 'chooser'; }
  if(typeof jobwizOpen === 'function'){ jobwizOpen(); jobwizGo('import'); return 'jobwiz'; }
  if(typeof toast === 'function') toast('no import screen in this build','warn');
  return '';
}
(function sqImportButton(){
  const bar = $('seqtop'), build = $('sqBuild');
  if(!bar || !build || $('sqImport')) return;
  const b = document.createElement('button');
  b.className = 'b'; b.id = 'sqImport';
  b.textContent = '⤓ Import sequence';
  b.title = 'bring in a sequence from a .mstr settings file, a saved routine or a sketch — it lands in the sequence library';
  b.addEventListener('click', sqImportOpen);
  bar.insertBefore(b, build);
})();
/* the button says what it will actually produce — "Build your Maestro" on a
   PCA9685 build would be a lie, and the thing it lies about (which file you
   end up flashing) is the whole point of pressing it */
function sqBuildLabel(){
  const b = $('sqBuild'); if(!b) return;
  b.textContent = '⚙ ' + ((typeof bldTitle === 'function') ? bldTitle() : 'Build your Maestro');
}
$('sqAdv').addEventListener('change',()=>{
  BLK.adv = $('sqAdv').checked;
  PREFS.seqAdv = BLK.adv; prefsSave();
  sqAdvViews();
  buildSequencer();
  lg('sys','sequencer advanced options: '+(BLK.adv?'on — per-brick speed overrides editable':'off — each channel\'s own speed applies'));
});
function blkWarnHandEdit(seq){
  if(!blockIsRoutine(seq)) return false;
  return !confirm('“'+seq.name+'” is built from bricks, and the frames are generated from them — '
    + 'editing a frame by hand will be overwritten the next time you move a brick.\n\n'
    + 'Carry on anyway?');
}
$('sqCapture').addEventListener('click',()=>{
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null; if(!seq) return;
  if(blkWarnHandEdit(seq)) return;
  const at = EDIT.frame>=0 ? EDIT.frame+1 : seq.frames.length;
  seq.frames.splice(at,0,{name:'Frame '+seq.frames.length, duration:500, targets:EDIT.live.slice()});
  EDIT.frame=at; reindexSubs(); buildSequencer(); buildMaestroPane();
});
$('sqUpdate').addEventListener('click',()=>{
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null; if(!seq) return;
  const f=seq.frames[EDIT.frame]; if(!f) return;
  f.targets = EDIT.live.slice();
  reindexSubs(); buildSequencer(); buildMaestroPane();
});
$('sqDel').addEventListener('click',()=>{
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null; if(!seq) return;
  if(EDIT.frame<0 || seq.frames.length<=1) return;
  seq.frames.splice(EDIT.frame,1);
  EDIT.frame=Math.min(EDIT.frame, seq.frames.length-1);
  reindexSubs(); buildSequencer(); buildMaestroPane();
});
$('sqDup').addEventListener('click',()=>{
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null; if(!seq) return;
  const f=seq.frames[EDIT.frame]; if(!f) return;
  seq.frames.splice(EDIT.frame+1,0,{name:f.name+' copy', duration:f.duration, targets:f.targets.slice()});
  EDIT.frame++; reindexSubs(); buildSequencer(); buildMaestroPane();
});
$('sqViewBlocks').addEventListener('click',()=>setSeqView('blocks'));
$('sqViewPose').addEventListener('click',()=>setSeqView('pose'));
$('sqViewTable').addEventListener('click',()=>setSeqView('table'));
setSeqView('blocks');
sqAdvViews();          /* Pose and Frames are Advanced-only (v1.52.0) */

/* restore the sequencer's remembered switches — called from main.js AFTER
   prefsLoad(), because PREFS itself lives in a later module (classic
   scripts: a const in look/prefs.js does not exist while this file runs) */
function blkPrefsRestore(){
  BLK.snapMode = PREFS.seqSnap || 'auto';
  BLK.adv = !!PREFS.seqAdv;
  const a = $('sqAdv'); if(a) a.checked = BLK.adv;
  sqAdvViews();
}
