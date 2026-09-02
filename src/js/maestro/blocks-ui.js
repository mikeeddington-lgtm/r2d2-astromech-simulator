'use strict';
/* =====================================================================
   BLOCK SEQUENCER — the interface

   v1.12.0 reworked this into a show-control layout, with Daslight as the
   visual reference Mike gave: a proper multi-track timeline with a
   draggable playhead, music snapping you can see, a library that lives in
   its own panel, and an inspector column on the right.

     · top       transport, snap mode, the Advanced switch, Build your
                 Maestro (ui-sequencer.js binds those buttons)
     · centre    ONE scrolling timeline: sticky lane names, sticky ruler
                 with the beat grid drawn on it, a playhead the full
                 height, one lane per part
     · bottom    the parts library (drag a part in) and, in its own
                 panel, the sequence library — grouped and searchable;
                 CLICK describes a routine, DRAG inserts it
     · right     the inspector for the selected brick

   Everything still routes through blockSync(), so the export, preview and
   subroutine table never changed. Drag is POINTER-based, not HTML5 DnD:
   HTML5 DnD cannot follow the pointer smoothly, will not work on touch,
   and cannot resize.
   ===================================================================== */

const BLK = {
  pxms:0.14,        // timeline scale — VIEW ONLY, it never touches a timing
  sel:null, drag:null, laneH:34, seqName:'',
  cam:0.85,         // the CLOSEST the droid view will sit to the selected part
  tint:false,       // paint the model in the sequencer's part colours
  snapMode:'auto',  // auto | strong | all | off — restored from PREFS
  adv:false,        // the Advanced switch: per-brick speed overrides
  play:{t:0},       // the playhead, in ms
  raf:0, libq:'',
  /* the selected brick's part, MARKED on the model (2026-08-22). Adding a
     brick used to move the camera; it lights the part up instead, and the
     camera is left alone unless ZOOM TO THIS PART is pressed. Holds a CAD
     part name, or null. */
  mark:null,
  /* what the tint was before a preview borrowed it — see blkPlayTint() */
  playTint:null,
  /* multi-select (Mike, 2026-08-14): BLK.sel stays the single, scalar
     "primary" id — every existing reader of it keeps working untouched
     (see blkSelIds() below). selSet only ever holds MORE than one id; it
     is how a Shift/Ctrl-click builds on top of a plain click. */
  selSet: new Set(),
  /* the pending frames→bricks conversion under review (v1.49.0,
     blocks-trace.js). Null except between "Convert and review…" and
     Accept/Discard; holds the ORIGINAL frame list, which is the thing
     every measurement in review mode is measured against. */
  conv: null
};

/* the four MOTION shapes a brick can be — see blockValueAt's own comment
   in blocks.js for what each does inside the brick's window. Labels are
   Mike's, verbatim. */
const BLK_MOTION_MODES = [
  ['oc', 'Opens, then closes'],
  ['o',  'Opens'],
  ['c',  'Closes'],
  ['co', 'Closes, then opens']
];

/* ------------------------------------------------------------ multi-select
   Mike, 2026-08-14: "when building sequences we should have the ability
   to multi select to copy and delete." BLK.sel is read as a bare scalar
   id all over this file (grep it) — that has to keep working byte-for-
   byte, so it stays exactly what it always was: the single "primary"
   selection, set the same way by the same plain click as before. selSet
   is the ADDITIONAL state a Shift/Ctrl-click builds on top of it, and is
   only ever consulted through these helpers — nothing else should
   read BLK.selSet directly. No marquee/rubber-band; toggling is the
   whole gesture. */
function blkSelIds(){
  if(BLK.selSet && BLK.selSet.size > 1) return Array.from(BLK.selSet);
  return (BLK.sel !== null && BLK.sel !== undefined) ? [BLK.sel] : [];
}
function blkSelClear(){ if(BLK.selSet) BLK.selSet.clear(); }
/* Shift/Ctrl-click a brick: fold it into the selection, or drop it back
   out. The FIRST toggle seeds the set with today's single pick, so
   Shift-clicking a second brick right after a plain click grows to two
   rather than starting over. */
function blkSelToggle(id){
  if(!BLK.selSet) BLK.selSet = new Set();
  if(!BLK.selSet.size && BLK.sel !== null) BLK.selSet.add(BLK.sel);
  if(BLK.selSet.has(id)) BLK.selSet.delete(id); else BLK.selSet.add(id);
  if(!BLK.selSet.size) BLK.sel = null;
  else if(BLK.selSet.size === 1){ BLK.sel = Array.from(BLK.selSet)[0]; BLK.selSet.clear(); }
  else BLK.sel = id;                  // primary = the brick just touched
}
/* REMOVE / DUPLICATE for however many are selected — reuses blockAdd /
   blockRemove, the same model functions the single-brick inspector
   buttons already call, so a selection of one behaves exactly like today
   (used by the Delete/Backspace key for that case). ONE undo snapshot for
   the whole gesture, same contract as every other multi-brick edit
   (blockMakeShape, blockScaleTime). */
function blkMultiRemove(seq, ids){
  if(!seq || !ids || !ids.length) return;
  blockHistPush(seq);
  ids.forEach(id=>blockRemove(seq, id));
  BLK.sel = null;
  blkSelClear();
  blockSync(seq);
  buildSequencer();
}
function blkMultiDuplicate(seq, ids){
  if(!seq || !ids || !ids.length) return;
  const bricks = ids.map(id=>blockFind(seq, id)).filter(Boolean);
  if(!bricks.length) return;
  blockHistPush(seq);
  const selMin = Math.min(...bricks.map(b=>b.t0));
  const selEnd = Math.max(...bricks.map(b=>b.t0 + b.dur));
  const shift  = (selEnd + 200) - selMin;     // the whole group lands 200 ms after its own end
  const newIds = bricks.map(b=>
    blockAdd(seq, b.kind, b.ref, b.t0 + shift, {dur:b.dur, rise:b.rise, fall:b.fall, amp:b.amp, mode:b.mode}).id);
  BLK.selSet = new Set(newIds);
  BLK.sel = newIds[newIds.length - 1];
  blockSync(seq);
  buildSequencer();
}
/* Mike, 2026-08-18: "select multiple and copy, delete and extend the run
   time and even bulk change if its an open, open and close or just close".
   Duplicate and Remove already existed; these write the run time and the
   motion mode across the whole selection — one undo snapshot per gesture,
   selection kept, same model fields the single-brick inspector writes. */
function blkMultiDur(seq, ids, v){
  if(!seq || !ids || !ids.length) return;
  v = Math.max(200, Math.min(8000, Math.round(+v || 0)));
  blockHistPush(seq);
  ids.forEach(id=>{ const b = blockFind(seq, id); if(b) b.dur = v; });
  blockSync(seq);
  buildSequencer();
}
function blkMultiMode(seq, ids, mode){
  if(!seq || !ids || !ids.length) return;
  blockHistPush(seq);
  ids.forEach(id=>{
    const b = blockFind(seq, id);
    if(!b || b.kind === 'seq') return;          // a nested sequence has no motion of its own
    if(mode === 'oc') delete b.mode; else b.mode = mode;   // same contract as the single dropdown
  });
  blockSync(seq);
  buildSequencer();
}

function blkSeq(){ return MSTR.loaded ? MSTR.sequences[EDIT.seq] : null; }
function blkX(ms){ return ms * BLK.pxms; }
function blkMs(px){ return Math.max(0, Math.round(px / BLK.pxms)); }
function blkSnap(ms){ return Math.round(ms/50)*50; }
/* snapping threshold: a fixed 12 px at the current zoom, so it feels the
   same at every scale */
function blkSnapThreshold(){ return 12 / BLK.pxms; }
function blkTotal(seq){ return Math.max(4000, blockEnd(seq) + 2000); }

/* ------------------------------------------------- ONE WORD, ONE NUMBER
   (2026-08-22, cold-start walkthrough)

   "1 bricks" and "1 frames" appeared wherever a count was pasted next to a
   hard-coded plural, which was everywhere: the header, the library chip
   tooltips, the description card. blkPlural() is the one place that decides,
   and it is deliberately dumb — every word this pane counts takes a bare 's'.

   The LENGTH was worse, because the two readouts did not merely look
   different, they disagreed. The header printed seqTotal() (the sum of the
   COMPILED frames) and the inspector's summary printed blockEnd() (the end
   of the last brick on the timeline), forty pixels apart. Those are two
   different truths the moment a routine holds an unwired brick: the compiler
   skips it BY NAME (blockEndCompiled, blocks.js) while the timeline still has
   to draw it, so a two-brick routine read "1.0s" in one place and "3.0s" in
   the other. The one this desk is about is the EDITING length — what the ruler
   spans and what a drag can reach — so blockEnd() wins for a routine, and a
   hand-made frame list, which has no bricks at all, keeps seqTotal(). */
function blkPlural(n, word){ return n + ' ' + word + (n === 1 ? '' : 's'); }
function blkLengthMs(seq){
  if(!seq) return 0;
  return blockIsRoutine(seq) ? blockEnd(seq) : (typeof seqTotal === 'function' ? seqTotal(seq) : 0);
}

/* ============================================================= the pane */
function buildBlocks(){
  const host = $('seqblocks'); if(!host) return;
  blkUndoRedoSync();          // before the early returns — the buttons live in #seqtop
  /* WHERE THE TIMELINE WAS LOOKING (2026-08-22). This function replaces the
     whole pane, so both scrollers come back at 0,0 and blkScrollToSel() then
     re-centred on the selected brick. Committing a drag ends in exactly this
     rebuild, so the brick you had just moved was put back under the pointer
     and the timeline slid beneath it: the brick appeared not to have moved
     while the inspector said 2.40 s → 1.95 s, and the only way to know the
     edit had worked was to read the number. The view is not part of the edit,
     so it is carried across the rebuild instead. */
  const keep = blkScrollKeep(host);
  host.innerHTML = '';
  const seq = blkSeq();
  blkConvCheckSeq(seq);       // a pending conversion belongs to ONE routine (v1.49.0)

  if(!MSTR.loaded){
    const n = el('div','note cy');
    n.innerHTML = '<b>No Maestro settings yet.</b> The Maestro tab can generate a starter layout for your board, '
      + 'or drop a <b>.mstr</b> from Control Center anywhere on the window.';
    host.appendChild(n);
    blkInspectorRender(null);
    return;
  }
  if(seq && !blockIsRoutine(seq)){
    const n = el('div','note');
    n.innerHTML = '<b>“'+xmlEsc(seq.name)+'” is a hand-made sequence</b> ('+blkPlural(seq.frames.length,'frame')+') — '
      + 'a Pololu file carries poses and nothing else, so there are no bricks in it to read. '
      + 'You can keep editing it under <b>Frames</b>, work out the bricks behind it, or start again from empty.';
    const bar = el('div','conbar');
    /* v1.49.0 — Mike: "two options, the first is where we guess and another
       which highlights the issues and allows the user to use the bricks
       sequence to see them, accept them or change each issue." Both run the
       SAME analysis (blocks-trace.js); they differ only in whether you are
       shown the disagreements before it lands. */
    const bC = el('button','b prim','Work out the bricks');
    bC.title = 'Read the frames back into bricks and keep the result. The original frames are saved '
             + 'beside it as a copy, so nothing is lost either way.';
    bC.addEventListener('click',()=>blkConvRun(seq, false));
    const bR = el('button','b','Work them out and review…');
    bR.title = 'The same conversion, but it stops and shows you every channel the bricks do not reproduce '
             + 'so you can fix them on the timeline before accepting.';
    bR.addEventListener('click',()=>blkConvRun(seq, true));
    const b = el('button','b','Start fresh with bricks');
    b.title = 'An empty sequence under this name. The frames stay until you drop the first brick, and then '
            + 'this sequence is whatever the bricks say — the imported motion is not kept.';
    b.addEventListener('click',()=>{ blockAdopt(seq); buildSequencer(); });
    bar.appendChild(bC); bar.appendChild(bR); bar.appendChild(b);
    n.appendChild(bar);
    host.appendChild(n);
    blkInspectorRender(null);
    return;
  }

  host.appendChild(blkToolbar());
  blkConvBanner(host, seq);          // above the lanes: it is the question the pane is asking
  host.appendChild(blkTimeline(seq));
  blkUnwiredBanner(host, seq);
  host.appendChild(blkActionLib(seq));
  blkInspectorRender(seq);
  blkScrollRestore(host, keep);
  blkScrollToSel();
  blkLibMoreSync();
  blkPlayheadPlace();
}

/* the two scrollers this pane owns, read and written by position only —
   nothing here knows what is in them */
function blkScrollKeep(host){
  const o = {};
  ['.tlouter', '.blklib'].forEach(sel=>{
    const n = host.querySelector(sel);
    if(n) o[sel] = {x:n.scrollLeft, y:n.scrollTop};
  });
  return o;
}
function blkScrollRestore(host, keep){
  if(!keep) return;
  Object.keys(keep).forEach(sel=>{
    const n = host.querySelector(sel);
    if(n){ n.scrollLeft = keep[sel].x; n.scrollTop = keep[sel].y; }
  });
}

/* ---------------------------------------------------------- the toolbar
   View settings only — Mike, 2026-07-27: nothing here compiles into a
   frame. The identification tint restores itself the moment you leave the
   sequencer (spec, 2026-07-29). */
function blkToolbar(){
  const bar = el('div','blktools');

  const slider = (label, min, max, step, val, tip, fmt, oninput)=>{
    const w = el('div','blktool');
    const l = el('label',null,label); l.title = tip;
    const i = document.createElement('input');
    i.type='range'; i.min=min; i.max=max; i.step=step; i.value=val; i.title=tip;
    const v = el('span','blktoolv', fmt(val));
    /* no rebuild on input — replacing this node mid-drag would kill the drag */
    i.addEventListener('input',()=>{ v.textContent = fmt(+i.value); oninput(+i.value); });
    w.appendChild(l); w.appendChild(i); w.appendChild(v);
    return w;
  };

  const zoom = slider('Timeline', 0.03, 0.6, 0.005, BLK.pxms,
    'stretch or squeeze the timeline — this is a view setting, no timing changes',
    v=>(v/0.14).toFixed(1)+'×',
    v=>{ BLK.pxms = v; blkZoomApply(); });
  /* FIT TAKES THE WIDTH THE SLIDER GIVES UP (2026-08-22). The two controls do
     the same job — Fit is the one value of this slider that puts the whole
     routine on screen — so they share the space the slider had, and the
     toolbar keeps the same number of wrapped rows it always had. It matters:
     .blktools is flex-wrap, .tlouter takes what is left, and an extra toolbar
     row comes straight out of the lane area that fix 4 is about. */
  const zi = zoom.querySelector('input');
  if(zi) zi.style.width = '76px';
  const fit = el('button','b','Fit');
  fit.id = 'sqFit';
  fit.title = 'set the scale so the whole sequence fits the track at once — a view setting, no timing changes';
  fit.addEventListener('click', ()=>blkFitToContent());
  zoom.appendChild(fit);
  bar.appendChild(zoom);

  bar.appendChild(slider('Droid', 0.3, 3.0, 0.02, BLK.cam,
    'the CLOSEST the view will sit — “Zoom to this part” pulls further back than this when the '
    + 'part is big, so you always get the droid around it. Nothing here moves the camera on its own.',
    v=>v.toFixed(2)+'m',
    v=>{ BLK.cam = v; blkFocusApply(true); }));

  /* routine speed — rescales every brick, so Mexican wave and Breathe (and
     anything else) can be slowed down or sped up as one gesture */
  const seq0 = blkSeq();
  if(seq0 && blockIsRoutine(seq0) && blockList(seq0).length){
    const sp = el('div','blktool');
    const sl2 = el('label',null,'Speed');
    sl2.title = 'rescale the whole sequence — every brick\'s start, length and ramps together';
    sp.appendChild(sl2);
    const mk = (t, f, tip)=>{
      const b2 = el('button','b', t); b2.title = tip;
      b2.addEventListener('click',()=>{
        const end = blockScaleTime(seq0, f);
        lg('mae','sequence '+(f<1?'sped up':'slowed down')+' — now '+(end/1000).toFixed(1)+'s');
        buildSequencer();
      });
      return b2;
    };
    sp.appendChild(mk('− Slower', 1.25, 'stretch the sequence by a quarter'));
    sp.appendChild(mk('+ Faster', 0.8,  'tighten the sequence by a fifth — the imported servo speeds still set the floor'));
    sp.appendChild(el('span','blktoolv', (blkLengthMs(seq0)/1000).toFixed(1)+'s'));
    bar.appendChild(sp);
  }

  const sw = el('label','blkswitch');
  const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = BLK.tint;
  cb.id = 'sqTint';
  cb.title = 'paint every moving part in its sequencer colour — nothing is saved, '
           + 'switch it off (or leave the sequencer) and your paint scheme comes straight back.'
           + '\n▶ switches this on for as long as a preview runs, whatever it is set to here, '
           + 'and puts your setting back afterwards.';
  cb.addEventListener('change',()=>{
    BLK.tint = cb.checked;
    /* a deliberate change DURING a preview is the setting to come back to,
       not the one the preview borrowed over (blkPlayTint) */
    if(BLK.playTint) BLK.playTint.was = cb.checked;
    blkMarkApply();
    lg('sys', 'sequencer colours on the model: ' + (BLK.tint ? 'on' : 'off'));
  });
  sw.appendChild(cb);
  sw.appendChild(document.createTextNode('Colour the model to match'));
  bar.appendChild(sw);

  if(typeof MUSIC !== 'undefined' && MUSIC.loaded && BLK.snapMode !== 'off'){
    const chip = el('span','blktoolv snapchip','♪ snapping to '+(BLK.snapMode==='strong'?'strong beats':'beats'));
    chip.title = 'dragged bricks land on the musical grid — pick the mode in the top bar';
    bar.appendChild(chip);
  }

  /* ------------------------------------------------- CLEAR THE TIMELINE
     Mike, 2026-08-16: "The Sequenceer - Needs a delete all with a confirm
     when buildign new sequnce".

     Starting a routine over meant selecting bricks and pressing Delete,
     over and over, or making a NEW sequence and abandoning the one you had
     named. Neither is "clear this and let me start again".

     It asks — always, however few bricks there are — because the whole
     point of the button is that it is the destructive one, and a confirm
     that only sometimes appears is a confirm nobody reads. And it is ONE
     undo snapshot, like every other multi-brick gesture (blkMultiRemove,
     blockMakeShape), so Ctrl-Z puts the routine back if the answer was
     wrong. */
  const bricks = (seq0 && blockIsRoutine(seq0)) ? blockList(seq0) : [];
  if(bricks.length){
    const clr = el('button','b danger blkclear','🗑 Clear all');
    clr.id = 'sqClearAll';
    clr.title = 'remove every brick from this sequence and start it again — asks first, and one undo brings it back';
    clr.addEventListener('click', async ()=>{
      const n = blockList(seq0).length;
      if(!n) return;
      const yes = (typeof appConfirm === 'function')
        ? await appConfirm(
            'This removes all ' + n + ' brick' + (n===1?'':'s') + ' from “' + (seq0.name||'this sequence') + '”, '
            + 'leaving it empty and ready to build again.\n\n'
            + 'The sequence itself is kept, under the same name, and one undo (Ctrl-Z) puts the bricks back.',
            {title:'Clear every brick?', yes:'Clear it', no:'Keep them', danger:true})
        : true;
      if(!yes) return;
      blockHistPush(seq0);
      blockList(seq0).slice().forEach(b=>blockRemove(seq0, b.id));
      BLK.sel = null;
      blkSelClear();
      blockSync(seq0);
      buildSequencer();
      lg('mae','sequence “'+(seq0.name||'')+'” cleared — '+n+' brick'+(n===1?'':'s')+' removed (undo restores them)');
      if(typeof toast === 'function') toast('Cleared '+n+' brick'+(n===1?'':'s')+' — Ctrl-Z undoes it');
    });
    bar.appendChild(clr);
  }

  /* the camera is no longer moved by a selection (2026-08-22), so this line
     stopped being true the moment it said "zoomed to" — the part is MARKED
     on the model and the jump is the inspector's own button. */
  const sel = BLK.sel ? blockFind(blkSeq(), BLK.sel) : null;
  const who = el('div','blktoolwho', sel
    ? (sel.kind === 'seq' ? 'a whole sequence — no one part to point at' : 'lit up on the model: ' + blkLabel(sel.ref))
    : 'click a brick to light its part up on the model');
  bar.appendChild(who);
  return bar;
}

/* re-scale in place. Everything here is geometry the browser already has —
   rebuilding the pane instead would drop the slider out from under the
   pointer, which is the same bug that broke chip dragging. */
function blkZoomApply(){
  const host = $('seqblocks'); if(!host) return;
  const seq = blkSeq(); if(!seq) return;
  const total = blkTotal(seq);
  host.querySelectorAll('.blkruler').forEach(r=>{
    r.style.width = blkX(total)+'px';
    r.querySelectorAll('.blktick').forEach(t=>{ t.style.left = blkX(+t.dataset.t)+'px'; });
  });
  host.querySelectorAll('.blktrack').forEach(t=>{ t.style.width = blkX(total)+'px'; });
  host.querySelectorAll('.blkbrick').forEach(d=>{
    const b = blockFind(seq, +d.dataset.id); if(!b) return;
    d.style.left  = blkX(b.t0)+'px';
    d.style.width = Math.max(26, blkX(b.dur))+'px';
    const er = blockEffRamps(b);
    const r = d.querySelector('.blkrise'); if(r) r.style.width = blkX(er.rise)+'px';
    const f = d.querySelector('.blkfall'); if(f) f.style.width = blkX(er.fall)+'px';
  });
  blkPlayheadPlace();
  blkScrollToSel(true);       // a zoom is exactly the case that wants re-centring
}

/* ------------------------------------------------------------- FIT
   (2026-08-22, cold-start walkthrough) A brick stretched to 3.95 s ran off
   the right-hand edge of a 541 px track and there was nothing on screen that
   said so: the scroller has no arrows, and at 0.14 px/ms the routine simply
   ended somewhere out of sight. The Timeline slider could always have found
   the scale by hand — this is the same slider, told the one value that makes
   the whole routine visible at once, which is the value somebody dragging it
   is hunting for. A VIEW setting, like the slider: blkX/blkMs are the only
   readers of BLK.pxms and no timing is touched. */
function blkFitToContent(){
  const seq = blkSeq(); if(!seq) return 0;
  const sc = document.querySelector('#seqblocks .tlouter'); if(!sc) return 0;
  const room = sc.clientWidth - 118 - 6;      // the sticky lane column, and a hair
  const total = blkTotal(seq);
  if(room <= 0 || !total) return 0;
  BLK.pxms = Math.max(0.03, Math.min(0.6, room/total));
  buildSequencer();                            // the slider has to show what it now is
  const sc2 = document.querySelector('#seqblocks .tlouter');
  if(sc2) sc2.scrollLeft = 0;
  return BLK.pxms;
}
/* keep the selected brick in the middle of the view as the scale changes.
   FORCE is what a zoom wants — the brick stays centred while the ruler
   stretches around it. A plain rebuild does NOT: re-centring after every
   edit is what made a moved brick look stationary (see blkScrollKeep), so
   without force this only scrolls when the brick is not on screen at all,
   which is the case a rebuild genuinely has to answer — undo restoring a
   brick off to the right, or "jump to this issue". */
function blkScrollToSel(force){
  const host = $('seqblocks'); if(!host) return;
  const seq = blkSeq();
  const b = (seq && BLK.sel) ? blockFind(seq, BLK.sel) : null;
  if(!b) return;
  const x0 = blkX(b.t0), x1 = blkX(b.t0 + b.dur);
  host.querySelectorAll('.blkscroll').forEach(sc=>{
    if(!force && x0 >= sc.scrollLeft && x1 <= sc.scrollLeft + sc.clientWidth) return;
    sc.scrollLeft = Math.max(0, (x0 + x1)/2 - sc.clientWidth/2);
  });
}
/* =====================================================================
   WHICH PART IS THIS?  —  MARK IT, DO NOT CHASE IT  (2026-08-22)

   A builder's first brick was on Panel1, on the far side of the dome from
   the default camera. Dropping it AUTO-ZOOMED: CAM.target jumped to the
   part and CAM.dist snapped to the "Droid" slider, whatever the part was.
   Three chips into a show that had moved the view three times and never
   left a stable picture of the droid — and at the slider's closer end the
   framing filled the screen with one panel's own skin, which is a
   featureless grey surface and reads as "nothing happened".

   So the two halves are separated:

     · SELECTING a brick marks its part on the model and touches no camera
       state at all (blkMarkSel below). Everything that used to call
       blkFocusApply(true) as a side effect of an edit calls that instead.
     · JUMPING there is the inspector's own "Zoom to this part" button —
       an explicit request, and the only thing in this file that still
       moves the camera on its own.
   ===================================================================== */

/* the CAD part a brick's actuator drives, or null (a brick can name a part
   this droid does not have, and a whole-sequence brick names none) */
function blkPartName(ref){
  if(typeof CAD === 'undefined' || !CAD.loaded || !CAD.moving) return null;
  const m = CAD.moving.find(x=>x.act === ref);
  return m ? m.name : null;
}
/* the part's own size, in metres, from the CAD bounding box */
function blkPartSpan(name){
  if(typeof CAD === 'undefined' || !CAD.header || !CAD.header.parts) return 0;
  const hp = CAD.header.parts.find(p=>p.name === name);
  const b = hp && hp.bbox;
  if(!b) return 0;
  return Math.max(b[3]-b[0], b[4]-b[1], b[5]-b[2]);
}
/* HOW FAR BACK "ZOOM TO THIS PART" SITS. Not the slider's flat number: a
   fixed distance frames a pie and a breadpan door completely differently,
   and on the big movers it filled the frame with the part — no droid
   around it, nothing to tell you WHERE you are looking. The view spans
   about three times the part instead, so the part is roughly a third of
   the picture and the rest is context. BLK.cam stays as the floor, which
   is what "how close the view sits" now means: the closest it will go. */
function blkFrameDist(name){
  const span = blkPartSpan(name);
  if(!span) return BLK.cam;
  const fov = (typeof camera !== 'undefined' && camera.fov) ? camera.fov : 38;
  const d = (span * 3 / 2) / Math.tan(fov * Math.PI / 360);
  return Math.max(BLK.cam, d);
}

/* the mark itself. applyPaint() is the base coat AND the eraser — it
   repaints every part from effectivePartHex(), which is where the last
   mark gets wiped — so the mark is laid on top of it, every time. */
function blkMarkPaint(){
  const n = BLK.mark;
  if(!n || typeof paintPart !== 'function' || typeof THREE === 'undefined') return;
  if(typeof CAD === 'undefined' || !CAD.loaded || !CAD.partIndex || !CAD.partIndex[n]) return;
  const mv = CAD.moving.find(x=>x.name === n);
  const c = new THREE.Color((mv && mv.act) ? blkColor(mv.act)
                            : ((typeof effectivePartHex === 'function' && effectivePartHex(n)) || '#9ab'));
  c.lerp(new THREE.Color(0xffffff), 0.35);        // its own brick colour, lit
  paintPart(n, '#' + c.getHexString());
}
function blkMarkApply(){
  if(typeof applyPaint !== 'function') return;
  applyPaint();
  blkMarkPaint();
}
/* mark whatever the selection is now. A no-op when nothing changed, so it
   is safe on the end of every drag. */
function blkMarkSel(){
  const seq = blkSeq();
  const b = (seq && BLK.sel !== null && BLK.sel !== undefined) ? blockFind(seq, BLK.sel) : null;
  const want = (b && b.kind !== 'seq') ? blkPartName(b.ref) : null;
  if(want === BLK.mark) return;
  BLK.mark = want;
  blkMarkApply();
}

/* ============================ IS IT ROUND THE BACK?  (2026-08-22)
   The honest answer to "I pressed play and nothing moved" is often "it did,
   behind the dome". Worked out from the camera and the part's own position,
   both of which are already live: the horizontal bearing of the part from
   the droid's axis, against the horizontal bearing of the camera from the
   same axis. Negative dot product = opposite sides.

   Deliberately approximate. It does not know about the shell in between,
   and it says nothing at all about a part sitting on the droid's axis
   (there is no side to be on) or when it cannot read a position. Returns
   null when it cannot measure, so a caller cannot mistake "no" for
   "don't know". `theta` is the camera azimuth that puts that side in
   front, which is what the button next to the message uses. */
function blkFarSide(name){
  if(!name || typeof camera === 'undefined' || typeof partWorldPos !== 'function') return null;
  const p = partWorldPos(name);
  if(!p) return null;
  const cx = (typeof R2 !== 'undefined' && R2.pos) ? R2.pos.x : 0;
  const cz = (typeof R2 !== 'undefined' && R2.pos) ? R2.pos.z : 0;
  const px = p.x - cx, pz = p.z - cz;
  const pr = Math.hypot(px, pz);
  if(pr < 0.04) return null;                    // on the axis: no side to be on
  const vx = camera.position.x - cx, vz = camera.position.z - cz;
  const vr = Math.hypot(vx, vz);
  if(vr < 1e-4) return null;
  const cos = (px*vx + pz*vz) / (pr*vr);
  /* -0.15 is about 99° off — past square-on, not merely "a bit round the
     side", so a panel you can still half see does not nag */
  return { cos, far: cos < -0.15, theta: Math.atan2(px, pz) };
}
/* orbit to that side. NOTHING else moves — same distance, same target — so
   this cannot become the auto-zoom by another name. */
function blkTurnRound(name){
  const f = blkFarSide(name);
  if(!f || typeof CAM === 'undefined') return false;
  CAM.follow = false;
  if(typeof syncFollowBtn === 'function') syncFollowBtn();
  CAM.theta = f.theta;
  if(typeof updateCamera === 'function') updateCamera();
  blkFarSync();
  lg('sys','turned the view round to ' + ((typeof partLabel === 'function') ? partLabel(name) : name));
  return true;
}
/* the message is a snapshot of a thing that changes as the view is dragged,
   so it is re-asked rather than re-built — blkTick() calls this.
   NODE is passed by blkInspector, which asks while the row is still
   DETACHED: an id lookup would miss it (and could answer with the previous
   build's row, still in the pane until the swap). */
function blkFarSync(node){
  const n = node || $('sqFarSide');
  if(!n) return;
  const f = blkFarSide(n.dataset.part);
  n.classList.toggle('on', !!(f && f.far));
}

/* point the camera at the part the selected brick moves — "Zoom to this
   part" frames it IN CONTEXT (2026-08-22; it used to centre it close
   enough to inspect, spec 2026-07-29) */
function blkFocusApply(quiet){
  if(typeof CAM === 'undefined') return;
  const seq = blkSeq();
  const b = (seq && BLK.sel) ? blockFind(seq, BLK.sel) : null;
  if(!b || b.kind === 'seq'){ CAM.dist = Math.max(CAM.dist, BLK.cam); return; }
  if(typeof CAD === 'undefined' || !CAD.loaded) { CAM.dist = BLK.cam; return; }
  const m = CAD.moving.find(x=>x.act === b.ref);
  if(!m) { CAM.dist = BLK.cam; return; }
  const p = (typeof partWorldPos === 'function') ? partWorldPos(m.name) : null;
  if(!p) { CAM.dist = BLK.cam; return; }
  CAM.follow = false;
  if(typeof syncFollowBtn === 'function') syncFollowBtn();
  CAM.target.copy(p);
  CAM.dist = blkFrameDist(m.name);
  if(typeof updateCamera === 'function') updateCamera();
  blkFarSync();
  if(!quiet) lg('sys','zoomed to '+partLabel(m.name)+' — framed with the droid around it');
}

/* --------------------------------------------------------- the timeline
   ONE scroller. The lane names are sticky on the left, the ruler sticky
   on top, so every track shares one horizontal position and the playhead
   can be a single line down the whole thing. */
function blkTimeline(seq){
  const outer = el('div','tlouter blkscroll');
  const inner = el('div','tlinner');
  const lanes = blockLanes(seq);
  const total = blkTotal(seq);

  /* THE LANE AREA GROWS WITH THE LANES (2026-08-22). .tlouter takes the
     spare height as a flex item (F8, 09-sequencer.css) with a flat 140 px
     floor, which was fine while a routine had two or three lanes and wrong
     the moment it had seven: a Mexican Wave showed 4 of its 6 parts and the
     rest were behind a scroll nobody had been told about. The floor is the
     routine's own size now — one row per lane plus the ruler — and it is
     CAPPED, because a twenty-lane routine that pushed the parts library and
     the sequence library off the bottom of the screen would trade this
     problem for the one fix 1 is about. Past the cap .tlouter scrolls as it
     always did. Written as a property so the fallback stays in the
     stylesheet with the rest of the layout. */
  outer.style.setProperty('--tlmin', Math.min(lanes.length * (BLK.laneH + 1) + 30, 460)+'px');

  /* ruler — time ticks plus the beat grid when music is loaded.
     The corner cell IS the snap picker (Mike, 2026-08-18: "there should be
     a selector for Snap to nearest auto-snap next to the timeline timming
     line" — it had lived in the transport bar since v1.12.0, where he
     never found it; the control belongs beside the line it governs). */
  const rulerRow = el('div','tlrow hdr');
  const corner = el('div','blklane hdr');
  corner.id = 'sqSnapWrap';
  corner.title = 'how dragged bricks snap onto the timing line — to neighbouring bricks and the grid, and to the beat when music is loaded';
  if(typeof buildSnapPicker === 'function') buildSnapPicker(corner);
  rulerRow.appendChild(corner);
  const ruler = el('div','blkruler');
  ruler.style.width = blkX(total)+'px';
  for(let t=0; t<=total; t+=500){
    const tick = el('div','blktick'+(t%1000?'':' s'));
    tick.dataset.t = t;
    tick.style.left = blkX(t)+'px';
    if(t%1000===0) tick.appendChild(el('span',null,(t/1000)+'s'));
    ruler.appendChild(tick);
  }
  if(typeof MUSIC !== 'undefined' && MUSIC.loaded && typeof musicSnapBeats === 'function'){
    musicSnapBeats('all').forEach(b=>{
      const ms = Math.round(b.t*1000);
      if(ms > total) return;
      const tick = el('div','blktick beat'+(b.strong?' strong':''));
      tick.dataset.t = ms;
      tick.style.left = blkX(ms)+'px';
      tick.title = (b.strong?'strong beat (bar start)':'beat')+' '+b.n;
      ruler.appendChild(tick);
    });
  }
  /* the ruler is also the scrub strip — click or drag to move the playhead */
  ruler.addEventListener('pointerdown', ev=>blkScrubStart(ev, ruler));
  rulerRow.appendChild(ruler);
  inner.appendChild(rulerRow);

  /* one row per lane */
  lanes.forEach(lane=>{
    const row = el('div','tlrow');
    /* the lane name goes grey with its bricks (v1.46.0) — a wired lane and
       an unwired one reading the same would be the whole point missed */
    const laneUnwired = lane.kind !== 'seq' && !blockChan(lane.id);
    const name = el('div','blklane'+(lane.kind==='seq'?' seq':' pc')
      + (laneUnwired?' unwired':''), lane.label);
    if(lane.kind !== 'seq') name.style.setProperty('--pc', blkColor(lane.id));
    name.title = lane.kind==='seq' ? 'whole saved sequences, dropped in as one brick'
               : (laneUnwired ? lane.id + ' — no servo channel yet' : lane.id);
    row.appendChild(name);
    const track = el('div','blktrack');
    track.dataset.lane = lane.id;
    track.style.width = blkX(total)+'px';
    blockList(seq).forEach(b=>{
      const laneId = (b.kind==='seq') ? '_seq' : b.ref;
      if(laneId !== lane.id) return;
      track.appendChild(blkBrick(seq, b));
    });
    row.appendChild(track);
    inner.appendChild(row);
  });
  if(lanes.length <= 1){
    const empty = el('div','blkempty');
    empty.style.gridColumn = '1 / -1';
    empty.innerHTML = 'Drag a part up from the library below — it makes its own lane. '
      + 'Drag a saved sequence in from the <b>Sequence library</b> panel to drop the whole thing in as one brick.';
    inner.appendChild(empty);
  }

  /* the playhead and the snap indicator live over the whole grid */
  const play = el('div','tlplay'); play.id = 'tlPlayhead';
  const flag = el('i'); flag.title = 'the playhead — drag to scrub, the model follows';
  flag.addEventListener('pointerdown', ev=>blkScrubStart(ev, ruler));
  play.appendChild(flag);
  inner.appendChild(play);
  const snap = el('div','tlsnap'); snap.id = 'tlSnapline'; snap.style.display='none';
  snap.appendChild(el('span'));
  inner.appendChild(snap);

  outer.appendChild(inner);
  return outer;
}

function blkBrick(seq, b){
  /* v1.46.0 — `.unwired` is the grey/dashed state for a brick whose part has
     no servo channel yet. It is set here, in the ONE place a brick becomes
     DOM, so "grey wherever bricks are drawn" cannot be true in the timeline
     and false somewhere else. */
  const wired = blockWired(b);
  /* v1.49.0 — `.convbad` marks a brick a pending conversion does not
     reproduce. Set HERE for the same reason `.unwired` is: one place a
     brick becomes DOM, so the flag cannot be true in the timeline and
     missing somewhere else. */
  const bad = blkConvBadRefs();
  const isBad = !!(bad && b.kind === 'act' && bad[b.ref]);
  const d = el('div','blkbrick'+(b.kind==='seq'?' seq':' pc')
    + (wired?'':' unwired') + (isBad?' convbad':'') + (blkSelIds().indexOf(b.id)>=0?' sel':''));
  if(isBad) d.title = blkLabel(b.ref) + ' ' + bad[b.ref].what;
  if(b.kind !== 'seq'){
    const hex = blkColor(b.ref);
    d.style.setProperty('--pc', hex);
    d.style.setProperty('--pcBg', hex+'33');
  }
  d.style.left = blkX(b.t0)+'px';
  d.style.width = Math.max(26, blkX(b.dur))+'px';
  d.dataset.id = b.id;
  const label = (b.kind==='seq') ? b.ref : (blkLabel(b.ref));
  d.appendChild(el('span','blklbl', label));
  d.appendChild(el('span','blkdur', wired ? (b.dur/1000).toFixed(1)+'s' : 'not wired'));
  if(!wired){
    d.dataset.unwired = '1';
    d.title = label + ' has no servo channel yet, so this brick moves the MODEL only and is left out '
            + 'of the compiled frames. Give the panel a channel and it drives the real droid too — '
            + 'the brick keeps its timing in the meantime.';
  }
  /* the ramps, drawn — you can see the open and close speeds */
  if(b.kind !== 'seq'){
    const er = blockEffRamps(b);
    const r = el('i','blkrise'); r.style.width = blkX(er.rise)+'px';
    const f = el('i','blkfall'); f.style.width = blkX(er.fall)+'px';
    d.appendChild(r); d.appendChild(f);
  }
  d.appendChild(el('i','blkgrip l'));
  d.appendChild(el('i','blkgrip r'));
  d.addEventListener('pointerdown', ev=>blkDragStart(ev, seq, b, d));
  return d;
}

/* ------------------------------------------------------- move / resize */
function blkSnaplineShow(ms, label){
  const s = $('tlSnapline'); if(!s) return;
  s.style.display = 'block';
  s.style.left = (118 + blkX(ms))+'px';
  s.querySelector('span').textContent = label || '';
  s.querySelector('span').style.display = label ? 'block' : 'none';
}
function blkSnaplineHide(){ const s = $('tlSnapline'); if(s) s.style.display='none'; }

function blkDragStart(ev, seq, b, node){
  ev.preventDefault(); ev.stopPropagation();
  /* Shift/Ctrl-click: toggle this brick into (or out of) the selection
     and stop — no drag, no single-select. Everything below this is the
     plain-click path, byte-for-byte unchanged. */
  if(ev.shiftKey || ev.ctrlKey){
    blkSelToggle(b.id);
    buildSequencer();
    return;
  }
  const rect = node.getBoundingClientRect();
  const edge = (ev.clientX - rect.left < 8) ? 'l'
             : (rect.right - ev.clientX < 8) ? 'r' : null;
  BLK.sel = b.id;
  blkSelClear();               // a plain click on one brick collapses a multi-selection
  /* the move handler writes b.t0/b.dur LIVE, so the undo snapshot has to
     be captured now, before the first mousemove — commit() on pointerup
     records it only if the gesture actually moved something, so a plain
     click that merely selects the brick stays out of the history */
  const hist0 = blockHistCapture(seq);
  const start = {x:ev.clientX, t0:b.t0, dur:b.dur};
  /* capture keeps a fast real drag from escaping the brick; a synthetic
     pointer (the tests drive this gesture with dispatched PointerEvents)
     has no active id and setPointerCapture throws — the node-level move/up
     listeners below work either way, so the capture is best-effort */
  try{ node.setPointerCapture(ev.pointerId); }catch(e){}
  node.classList.add('drag');

  const move = e=>{
    const dms = blkMs(Math.abs(e.clientX - start.x)) * (e.clientX < start.x ? -1 : 1);
    if(edge === 'l'){
      const nt = blkSnap(Math.max(0, Math.min(start.t0 + dms, start.t0 + start.dur - 150)));
      b.dur = start.dur + (start.t0 - nt);
      b.t0  = nt;
    }else if(edge === 'r'){
      b.dur = Math.max(150, blkSnap(start.dur + dms));
    }else{
      /* a whole-brick move snaps: to a neighbour's edge, or to the beat
         grid in the chosen mode — and shows what it snapped to */
      const res = blockSnapResolve(start.t0 + dms, seq, b.id, blkSnapThreshold());
      b.t0 = res.t;
      if(res.kind==='edge' || res.kind==='beat' || res.kind==='strong') blkSnaplineShow(res.t, res.label);
      else blkSnaplineHide();
    }
    node.style.left = blkX(b.t0)+'px';
    node.style.width = Math.max(26, blkX(b.dur))+'px';
    const dl = node.querySelector('.blkdur'); if(dl) dl.textContent = (b.dur/1000).toFixed(1)+'s';
  };
  const up = ()=>{
    node.classList.remove('drag');
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', up);
    blkSnaplineHide();
    blockHistCommit(seq, hist0);        // one snapshot per completed drag/resize
    blockSync(seq);
    buildSequencer();
    blkMarkSel();                 // the brick you just grabbed lights its part up — the camera stays put
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
}

/* ------------------------------------------------- drag in from a library
   A chip is picked up, a ghost follows the pointer, and dropping it over
   the timeline adds a block at that time. Dropping anywhere else is a
   no-op — nothing is created until the pointer is actually over the grid. */
function blkChipDrag(ev, chip, onDrop){
  ev.preventDefault();
  const sx = ev.clientX, sy = ev.clientY;
  let ghost = null, moved = false;

  /* listeners go on the WINDOW, not the chip: onDrop rebuilds the strip and
     takes the chip node with it, and a listener on a removed node never
     fires its cleanup — which is how ghosts got stranded on screen */
  const move = e=>{
    if(!moved && Math.hypot(e.clientX-sx, e.clientY-sy) < 5) return;
    if(!moved){
      moved = true;
      ghost = el('div','blkghost', chip.textContent);
      document.body.appendChild(ghost);
    }
    ghost.style.left = e.clientX+'px'; ghost.style.top = e.clientY+'px';
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const track = t && t.closest && t.closest('.blktrack');
    document.querySelectorAll('.blktrack.over').forEach(x=>x.classList.remove('over'));
    if(track) track.classList.add('over');
  };
  const finish = e=>{
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if(ghost) ghost.remove();
    document.querySelectorAll('.blktrack.over').forEach(x=>x.classList.remove('over'));
    if(!moved){ onDrop(0, false); return; }            // it was a click
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const track = t && t.closest && t.closest('.blktrack');
    const grid  = t && t.closest && t.closest('.tlinner, .tlouter, .blkempty');
    if(!track && !grid) return;                        // dropped nowhere useful
    let at;
    if(track){
      const r = track.getBoundingClientRect();
      at = blkMs(e.clientX - r.left);
    }else{
      at = blockEnd(blkSeq());                         // empty area: append
    }
    /* dropped chips snap the same way dragged bricks do */
    at = blockSnapResolve(at, blkSeq(), -1, blkSnapThreshold()).t;
    onDrop(at, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

/* --------------------------------------------------- the action library */
function blkActionLib(seq){
  const host = el('div','blklib');
  const head = el('div','blklibhead');
  head.appendChild(el('b',null,'Parts'));
  /* THE GESTURE THAT ALWAYS WORKS IS NAMED FIRST (2026-08-22)
     This caption said "drag one onto the timeline" and nothing else, and a
     builder's two careful drags produced nothing at all — blkChipDrag needs
     5 px of movement before it arms a ghost, and a slow, deliberate press
     that lands back near where it started reads as a click. The click path
     has always worked and always appended a brick at the end; it was simply
     never mentioned, so the reliable gesture was the undocumented one and
     the documented one was the fragile one. Both are named now, cheapest
     first — and the chips carry the same sentence in their tooltip and a
     hover tail (09-sequencer.css) saying where a plain click will land, so
     that clicking a chip to find out what "Panel13" IS cannot be a silent
     edit somebody has to notice and undo. */
  head.appendChild(el('span','blklibhint',
    'click a part to add it at the end, or drag it where you want it · then stretch its edges'));
  host.appendChild(head);

  const row = el('div','blkchips');
  /* ONE drop path for every part chip (v1.46.0). A wired chip and a grey
     one differ in how the brick LOOKS and in whether it compiles — not in
     whether the drag works — so they must not be two handlers that could
     drift apart. */
  const chipDrop = (chip, act, label)=>{
    chip.addEventListener('pointerdown', ev=>blkChipDrag(ev, chip, (at, dropped)=>{
      if(!dropped){                                    // a click drops it at the end
        at = blockEnd(seq);
      }
      blockHistPush(seq);
      blockAdd(seq, 'act', act, at);
      const b = blockList(seq)[blockList(seq).length-1];
      BLK.sel = b.id;
      buildSequencer();
      blkMarkSel();               // ADDING A BRICK DOES NOT MOVE THE CAMERA (2026-08-22)
      lg('mae','added '+label+' at '+(at/1000).toFixed(2)+'s'
        + (blockWired(b) ? '' : ' — no channel yet, so it stays grey and compiles to nothing'));
    }));
  };
  blockActions().forEach(a=>{
    const c = el('div','blkchip pc', a.label);
    c.style.setProperty('--pc', blkColor(a.act));
    c.title = a.act+' · '+a.sub+'\nthis colour is this part, everywhere in the sequencer'
            + '\nclick me to add a brick at the end, or drag me onto the timeline where you want it';
    c.dataset.act = a.act;
    chipDrop(c, a.act, a.label);
    row.appendChild(c);
  });

  /* EVERY MOVING PANEL IS IN THIS LIST (v1.45.0)
     Mike: "Show every moving panel in the sequencer; render unconfigured
     ones in muted grey."

     A panel with no servo channel used to be simply ABSENT here, which is
     indistinguishable from a panel this droid does not have — so the one
     question the library could not answer was "where is my magic panel?".
     Every mover the model carries gets a chip now. The unconfigured ones go
     LAST (so the list still opens with things you can actually drag, and so
     `.blkchip.pc` still means "a part with a channel behind it" for every
     other reader of this DOM), and they are dimmed + dashed — the same
     visual language `.blkchip.seq.off` already uses for a sequence that is
     not on the board.

     WHAT A DRAG DOES (v1.46.0). It LANDS. Mike: "The user should be able to
     drag into the sequencer non mapped items but keep them grey - they may
     not have the servo setup in the real model yet but want to build a
     sequence". v1.45.0 refused it and offered to go and map it, which is the
     wrong answer to "I am writing the choreography first": a routine is a
     plan, and a plan may name a panel whose servo is still in its bag.

     Nothing is guessed on the user's behalf — the brick carries no channel
     number, stays grey wherever it is drawn, and is skipped by the compiler
     BY NAME (blockUnwiredNote, blocks.js). The moment that panel is given a
     channel the brick starts working with no further ceremony. */
  const movers = (typeof BLKH.movers === 'function') ? BLKH.movers() : [];
  const off = movers.filter(m=>!m.on);
  off.forEach(m=>{
    const c = el('div','blkchip off unconf', m.label);
    c.dataset.act = m.act;
    c.title = m.label + ' has no servo channel yet — click it to add a brick at the end, or drag it '
            + 'where you want it, and the brick stays grey until you map it; it moves the model in '
            + 'previews but compiles to nothing until then.'
            + (m.lit ? '\nprinted droid lists this one as ' + m.lit + ' rather than a servo; plenty of builds differ.' : '')
            + (m.cad ? '\nCAD: ' + m.cad : '');
    chipDrop(c, m.act, m.label);
    row.appendChild(c);
  });
  host.appendChild(row);
  if(off.length){
    const note = el('div','hint');
    const b = el('button','b','map one…');
    b.style.marginLeft = '6px';
    b.addEventListener('click',()=>blkMapPanelsOpen());
    note.appendChild(document.createTextNode(
      off.length + ' moving panel' + (off.length===1?'':'s') + ' on this droid ' +
      (off.length===1?'has':'have') + ' no servo channel yet — grey. '
      + 'You can still drag ' + (off.length===1?'it':'them') + ' in and build the sequence now.'));
    note.appendChild(b);
    host.appendChild(note);
  }

  /* groups and ready-made shapes: one click builds a whole figure */
  const groups = blockGroups();
  if(groups.length){
    const h2 = el('div','blklibhead');
    h2.appendChild(el('b',null,'Ready-made'));
    h2.appendChild(el('span','blklibhint','pick a set, pick a shape — it lands at the end of the sequence'));
    host.appendChild(h2);
    const row2 = el('div','blkchips');
    const sel = document.createElement('select'); sel.className='blksel'; sel.id='blkGroupSel';
    groups.forEach(g=>{ const o=document.createElement('option'); o.value=g.id; o.textContent=g.label+'  ('+g.members.length+')'; sel.appendChild(o); });
    row2.appendChild(sel);
    BLOCK_SHAPES.forEach(sh=>{
      const b = el('button','b', sh.label);
      b.title = sh.hint;
      b.addEventListener('click',()=>{
        const g = groups.find(x=>x.id === sel.value); if(!g) return;
        blockHistPush(seq);           // the whole figure is ONE gesture, one undo
        blockMakeShape(seq, sh.id, g.members);
        buildSequencer();
        lg('mae', sh.label+' built from '+g.label+' ('+g.members.length+' parts)');
      });
      row2.appendChild(b);
    });
    host.appendChild(row2);
  }
  blkLibMore(host);
  return host;
}

/* ===================================================== THE CLIPPED EDGE
   (2026-08-22, cold-start walkthrough)

   At 1440×900 this panel is 200 px tall against 325 px of content, and what
   it clipped was the middle of a sentence — the top halves of the letters of
   the line about panels with no servo channel. A half-line of type reads as
   the BOTTOM OF THE PANEL, not as "there is more below", so the whole
   READY-MADE row underneath it — the group picker and six shape buttons, one
   click of which builds an entire seven-brick dome wave — was invisible. It
   took the builder twenty-five minutes to find the one control that does the
   thing they had come to do.

   NOT A REORDER. Whether READY-MADE belongs above the part chips is a layout
   decision the owner has not made, and moving it would answer a different
   question than the one asked. What is wrong here is only that the clip is
   silent, so the clip is what changes: the panel now says it is a scroller
   (scrollbar-color, 09-sequencer.css), fades out under a sticky bar rather
   than stopping at a hard edge, and the bar NAMES what is below and takes you
   there. It fades out again once you are at the bottom, because a bar that
   claims there is more when there is not is the same lie in the other
   direction.

   It stays IN FLOW when it is not showing (opacity, never display) — a
   sticky footer that appears and disappears from layout changes scrollHeight,
   which is the very number blkLibMoreSync() measures, and that oscillates.

   WHAT THE BAR SAYS IS MEASURED, NOT TYPED (v1.78.0, review L9). It used to
   read "READY-MADE builds a whole figure in one click" as a fixed string
   whenever groups existed — including with READY-MADE's heading already
   scrolled into view and only its row of shape buttons still clipped, which
   is the bar promising something that is on screen. The label is set by
   blkLibMoreSync() from the first group heading whose top edge is actually
   past the fold; when no heading is (the clipped remainder is the tail of
   the section you are in) it says only that there is more. The click scrolls
   to that same heading, or to the bottom when there is none, so the button
   goes where it says. Writing the label costs no layout: .blkmore's bar is
   absolutely positioned, so a longer sentence cannot change the scrollHeight
   the sync is measuring. */
function blkLibMore(host){
  const more = el('div','blkmore');
  more.id = 'sqLibMore';
  const b = el('button','b', blkLibMoreLabel(null));   // named once laid out — blkLibMoreSync()
  b.title = 'scroll the rest of this panel into view';
  b.addEventListener('click',()=>{
    const lib = document.querySelector('#seqblocks .blklib'); if(!lib) return;
    const next = blkLibHeadBelow(lib);
    lib.scrollTop = next
      ? lib.scrollTop + (next.getBoundingClientRect().top - lib.getBoundingClientRect().top)
      : lib.scrollHeight;
    blkLibMoreSync();
  });
  const skin = el('i');            // the bar hangs off a zero-height sticky box
  skin.appendChild(b);
  more.appendChild(skin);
  host.appendChild(more);
}
/* the first group heading whose top edge is below the panel's visible
   bottom — a heading with a hairline showing counts as below too, since a
   hairline is exactly the "bottom of the panel" misreading this bar exists
   to correct. null when everything left to scroll is the tail of a section
   whose heading is already in view. */
function blkLibHeadBelow(lib){
  const foldY = lib.getBoundingClientRect().bottom;
  return Array.from(lib.querySelectorAll('.blklibhead'))
              .find(h=>h.getBoundingClientRect().top > foldY - 4) || null;
}
function blkLibMoreLabel(head){
  if(!head) return '▾ more below';
  const b = head.querySelector('b');
  const name = ((b ? b.textContent : head.textContent) || '').trim().toUpperCase();
  return '▾ more below — ' + name
       + (name === 'READY-MADE' ? ' builds a whole figure in one click' : '');
}
/* is there anything still below the fold? Cheap enough to run on every
   rebuild and on every scroll — three layout reads and a class toggle. */
function blkLibMoreSync(){
  const lib = document.querySelector('#seqblocks .blklib');
  const more = lib && lib.querySelector('.blkmore');
  if(!more) return;
  if(!lib._blkMoreBound){
    lib._blkMoreBound = true;
    lib.addEventListener('scroll', blkLibMoreSync, {passive:true});
  }
  more.classList.toggle('on', lib.scrollHeight - lib.clientHeight - lib.scrollTop > 4);
  /* the label follows the scroll position, so it names what is below NOW */
  const b = more.querySelector('button');
  if(b){
    const lab = blkLibMoreLabel(blkLibHeadBelow(lib));
    if(b.textContent !== lab) b.textContent = lab;
  }
}

/* ------------------------------------------------- the unwired warning
   v1.46.0. A grey brick moves nothing on play and contributes nothing to
   the compiled frames, and both of those are silent events — so the routine
   says which bricks they are, by name, right under the timeline they are
   sitting in. blockUnwiredNote() (blocks.js) owns the wording; this is only
   where it is shown, plus the way out of it. */
/* =====================================================================
   THE CONVERSION, AND THE REVIEW OF IT (v1.49.0)

   blocks-trace.js proposes the bricks and measures them; everything here
   is about what a person does with that. Two doors, one analysis:

     Work out the bricks          — apply it and keep it.
     Work them out and review…    — apply it, but hold the original frames
                                    alongside and show every channel the
                                    bricks do not reproduce, live, while
                                    you edit them on the real timeline.

   BOTH doors save the original frame list as a copy first (Mike's answer
   when asked how accepting should land). Accepting a conversion CHANGES
   WHAT THE DROID DOES wherever the bricks disagree, and a conversion is a
   guess by construction — so the thing it was guessing at has to survive
   in the library, under its own name, for comparison and for going back.
   ===================================================================== */

/* the copy, made before anything is replaced. Returns the name it used. */
function blkConvKeepOriginal(name, frames){
  let n = name + ' (frames)';
  while(MSTR.sequences.some(s=>s.name === n)) n = n + '·';
  MSTR.sequences.push({ name:n, frames: JSON.parse(JSON.stringify(frames)), cat:'Imported' });
  if(typeof reindexSubs === 'function') reindexSubs();
  return n;
}

function blkConvRun(seq, review){
  if(!seq || blockIsRoutine(seq)) return;
  const t = blockTrace(seq);
  if(!t.bricks.length){
    const why = t.moved
      ? 'every channel this sequence moves is unmapped, so there is no panel for a brick to name. '
        + 'Map them on the bench first.'
      : 'nothing in this sequence leaves its rest position, so there is nothing to make a brick out of.';
    if(typeof toast === 'function') toast('Nothing to convert — ' + why, 'warn');
    return;
  }
  const orig = JSON.parse(JSON.stringify(seq.frames));
  seq.blocks = t.bricks;
  /* A TRACED ROUTINE DRAWS AT THE FINE STEP (v1.66.0). Everywhere else the
     step is a smoothness choice and 500 ms is the better one. Here it is a
     FIDELITY choice: these bricks are a guess at somebody's imported frame
     list, the review door exists to measure that guess against the original
     at every instant the file had an opinion about, and a coarse staircase
     would round off the very detail being checked — the comparison stops
     disagreeing and the review waves everything through. */
  seq.stepMs = BLK_RAMP_STEP_MS;
  blockSync(seq);                       // the routine is now its bricks
  blockHistReset(seq);                  // a fresh history: undo must not reach behind the conversion

  if(review){
    /* THE COPY IS MADE HERE, NOT AT ACCEPT (2026-08-22). The header above has
       always said BOTH doors keep the original first; this one did not. It
       held `orig` in BLK.conv and nowhere else, while buildSequencer() ends in
       servoStoreTouch() and writes the CONVERTED routine to the browser store
       500 ms later — and pagehide writes it again. The only restore path,
       blkConvCheckSeq(), runs from buildBlocks(), which leaving the desk
       (setStripMode('pad')) never calls. So a review somebody walked away from
       replaced their imported frame list with a guess at it, invisibly, with
       nothing anywhere to go back to.

       Accepting simply keeps this copy. Discarding, and abandoning the review
       by opening another routine, take it away again — blkConvDropKept(). */
    const keptName = blkConvKeepOriginal(seq.name, orig);
    BLK.conv = { seq: seq, name: seq.name, orig: orig, issues: t.issues,
                 kept: MSTR.sequences.find(s=>s.name === keptName) || null };
    blkSelClear(); BLK.sel = null;
    if(typeof lg === 'function')
      lg('mae','conversion proposed for “'+seq.name+'”: '+t.bricks.length+' brick(s) from '+orig.length
        +' frame(s), '+t.issues.length+' issue(s) to review. Your original frames are kept as “'
        +keptName+'” while you decide.');
    buildSequencer();
    return;
  }

  const kept = blkConvKeepOriginal(seq.name, orig);
  const bad = t.issues.filter(i=>i.kind === 'mismatch');
  if(typeof HW !== 'undefined' && HW.save) HW.save();
  if(typeof lg === 'function'){
    lg('mae','converted “'+seq.name+'” to '+t.bricks.length+' brick(s); the frames are kept as “'+kept+'”');
    t.issues.forEach(i=>lg(i.kind === 'mismatch' ? 'warn' : 'mae','  '+i.label+' '+i.what));
  }
  if(typeof toast === 'function')
    toast(t.bricks.length + ' brick' + (t.bricks.length===1?'':'s') + ' from ' + orig.length + ' frames'
      + (t.issues.length ? ' — ' + t.issues.length + ' channel' + (t.issues.length===1?'':'s')
          + ' the bricks do not reproduce, see the log' : ' — every frame reproduced exactly')
      + '. Your original is kept as “' + kept + '”.',
      t.issues.length ? 'warn' : '');
  buildSequencer();
}

/* the copy the review door made, taken back out again. Discarding — and
   abandoning the review by opening something else — both mean "nothing
   changed", and a spare frame list nobody asked for is not nothing. Spliced
   by IDENTITY rather than by name, because the name is one somebody may since
   have typed themselves; EDIT.seq follows it, being a position in this very
   array. */
function blkConvDropKept(c){
  if(!c || !c.kept) return;
  const at = MSTR.sequences.indexOf(c.kept);
  if(at < 0) return;
  MSTR.sequences.splice(at, 1);
  if(typeof EDIT !== 'undefined' && EDIT.seq > at) EDIT.seq--;
  if(typeof reindexSubs === 'function') reindexSubs();
}

/* Leaving the routine abandons the review rather than stranding it: a
   pending conversion is a question about THIS routine, and a banner you
   cannot see is not a question. */
function blkConvCheckSeq(seq){
  if(!BLK.conv) return;
  if(BLK.conv.seq === seq) return;
  const c = BLK.conv; BLK.conv = null;
  blkConvDropKept(c);
  if(c.seq){ c.seq.frames = c.orig; delete c.seq.blocks; }
  if(typeof toast === 'function') toast('Conversion of “'+c.name+'” discarded — you left the sequence. '
    + 'It is plain frames again, exactly as it was.');
}

function blkConvAccept(){
  const c = BLK.conv; if(!c) return;
  /* the review door already made the copy — accepting keeps it, it does not
     make a second one. The fallback is for a BLK.conv that arrived without
     one, so this stays the place the promise is honoured either way. */
  const kept = c.kept ? c.kept.name : blkConvKeepOriginal(c.name, c.orig);
  BLK.conv = null;
  if(typeof HW !== 'undefined' && HW.save) HW.save();
  const left = blockTraceReview(c.seq, c.orig);
  if(typeof lg === 'function')
    lg('mae','conversion of “'+c.name+'” accepted with '+left.length+' difference(s); '
      + 'the original frames are kept as “'+kept+'”');
  if(typeof toast === 'function')
    toast(left.length
      ? 'Accepted with ' + left.length + ' channel' + (left.length===1?'':'s') + ' still different — '
        + 'the droid now does what the bricks say. Your original is “' + kept + '”.'
      : 'Accepted — the bricks reproduce every frame exactly. Your original is kept as “' + kept + '”.',
      left.length ? 'warn' : '');
  buildSequencer();
}
function blkConvDiscard(){
  const c = BLK.conv; if(!c) return;
  BLK.conv = null;
  blkConvDropKept(c);          // nothing changed, so nothing is left behind
  c.seq.frames = c.orig;
  delete c.seq.blocks;
  blockHistReset(c.seq);
  if(typeof HW !== 'undefined' && HW.save) HW.save();
  if(typeof lg === 'function') lg('mae','conversion of “'+c.name+'” discarded — nothing changed');
  if(typeof toast === 'function') toast('Discarded — “'+c.name+'” is exactly the frames it was.');
  buildSequencer();
}

/* which refs are currently wrong — read by blkBrick() so a flagged brick
   is flagged in the ONE place a brick becomes DOM */
function blkConvBadRefs(){
  if(!BLK.conv) return null;
  const set = {};
  BLK.conv.issues.forEach(i=>{ if(i.ref) set[i.ref] = i; });
  return set;
}

function blkConvBanner(host, seq){
  if(!BLK.conv || BLK.conv.seq !== seq) return;
  /* re-measure on every render, which is after every edit — the readout is
     the current truth, not a verdict from a minute ago */
  BLK.conv.issues = blockTraceReview(seq, BLK.conv.orig);
  const issues = BLK.conv.issues;
  const clean  = !issues.length;
  const nBad   = issues.filter(i=>i.kind === 'mismatch').length;
  const nUnmap = issues.length - nBad;
  const said   = [];
  if(nBad)   said.push(nBad + ' channel' + (nBad===1?'':'s') + ' the bricks do not reproduce yet');
  if(nUnmap) said.push(nUnmap + ' that cannot be a brick at all');

  const n = el('div','note blkconv' + (clean ? ' ok' : ''));
  const h = el('b', null, clean
    ? 'These bricks reproduce the original frames exactly.'
    : said.join(', ') + '.');
  n.appendChild(h);
  n.appendChild(document.createTextNode(clean
    ? ' Every instant the imported file had an opinion about, the bricks command the same pose. Accept it and '
      + 'the sequence is editable from now on; your original frames are kept beside it either way.'
    : ' Frames are not always brick-shaped, so this is a guess and these are the places it does not fit. '
      + 'Select one to jump to it — the brick is outlined on the timeline and the inspector shows the error as '
      + 'you drag. Accept anyway and the droid does what the BRICKS say from here on.'));

  if(issues.length){
    const ul = el('div','blkconvlist');
    issues.forEach(i=>{
      const row = el('div','blkconvrow' + (i.kind === 'unmapped' ? ' unmapped' : ''));
      row.appendChild(el('b','blkconvwho', i.label));
      row.appendChild(el('span','blkconvwhat', i.what));
      if(i.kind === 'unmapped'){
        const bm = el('button','b','map it…');
        bm.addEventListener('click',e=>{ e.stopPropagation(); blkMapPanelsOpen(); });
        row.appendChild(bm);
      }else{
        row.tabIndex = 0;
        row.addEventListener('click',()=>blkConvGoTo(i));
        row.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); blkConvGoTo(i); } });
      }
      ul.appendChild(row);
    });
    n.appendChild(ul);
  }

  const bar = el('div','conbar');
  const ok = el('button','b prim', clean ? 'Accept the conversion' : 'Accept anyway');
  ok.addEventListener('click', blkConvAccept);
  const no = el('button','b danger','Discard');
  no.title = 'Put the frames back exactly as they were.';
  no.addEventListener('click', blkConvDiscard);
  bar.appendChild(ok); bar.appendChild(no);
  n.appendChild(bar);
  host.appendChild(n);
}

/* jump to the brick behind an issue: select it, park the playhead on the
   worst moment, and scroll it into view — the three things you would
   otherwise do by hand before you could look at it */
function blkConvGoTo(issue){
  const seq = BLK.conv && BLK.conv.seq; if(!seq) return;
  const hit = blockList(seq).filter(b=>b.ref === issue.ref)
    .sort((a,b)=>Math.abs(a.t0 + a.dur/2 - issue.at) - Math.abs(b.t0 + b.dur/2 - issue.at))[0];
  if(hit){ blkSelClear(); BLK.sel = hit.id; }
  BLK.play.t = issue.at;
  buildSequencer();
  if(typeof blkScrollToSel === 'function') blkScrollToSel();
  if(typeof blkPlayheadPlace === 'function') blkPlayheadPlace();
}

/* the live error line in the inspector, for the brick you are dragging */
function blkConvInspectorLine(seq, b){
  if(!BLK.conv || BLK.conv.seq !== seq || !b || b.kind !== 'act') return null;
  const i = (BLK.conv.issues || []).find(x=>x.ref === b.ref);
  const d = el('div','blkconvline' + (i ? ' bad' : ' ok'));
  d.textContent = i
    ? 'against the original: off by ' + i.err + ' (' + i.pct + '%) at ' + (i.at/1000).toFixed(2) + ' s'
    : 'against the original: this channel matches';
  return d;
}

function blkUnwiredBanner(host, seq){
  const note = blockUnwiredNote(seq);
  if(!note) return;
  const n = el('div','note blkunwired');
  n.appendChild(el('b',null, note));
  n.appendChild(document.createTextNode(
    ' They keep their place and their timing, and are left out of the frames this compiles to '
    + '— nothing on the board or in the model moves for them until the panel has a channel.'));
  const bar = el('div','conbar');
  const b = el('button','b','map them…');
  b.addEventListener('click',()=>blkMapPanelsOpen());
  bar.appendChild(b);
  n.appendChild(bar);
  host.appendChild(n);
}

/* Where a panel GETS a channel. The bench's Channels step is the one table
   with a part column per row and a Test button beside it, so that is the
   door — the same one ui-pane.js's servo-config button opens. The build
   wizard's Panels step is the fallback for a build that has no bench. */
function blkMapPanelsOpen(){
  if(typeof setupOpen === 'function'){ setupOpen(4); return true; }
  if(typeof wizOpen === 'function' && typeof wizStepIndex === 'function'){
    const i = wizStepIndex('_panels');
    if(i >= 0){ wizOpen(i); return true; }
  }
  return false;
}
/* One line, then a way out — never a bare refusal. v1.46.0: nothing REFUSES
   any more (a grey brick is allowed to exist), so this is now reached from
   the brick's own inspector, by someone who has decided to go and wire it. */
async function blkUnconfOffer(m){
  const why = m.label + ' has no servo channel yet, so its bricks stay grey and move nothing.'
            + (m.lit ? '\n\nPrinted Droid lists this one as ' + m.lit + ' rather than a servo — plenty of builds differ.' : '');
  if(typeof appConfirm !== 'function'){ if(typeof toast === 'function') toast(why,'warn'); return; }
  const go = await appConfirm(why, {title:'not wired yet', yes:'map it now…', no:'not now'});
  if(go) blkMapPanelsOpen();
}

/* ------------------------------------------------------- the inspector
   Lives in its own column (#seqinsp). The duration is always editable;
   the per-brick opening and closing speeds are EXPERT settings behind the
   Advanced switch, because they override the imported servo configuration
   — and when they do, the override is badged and one click restores the
   imported value (spec, 2026-07-29). */
function blkInspectorRender(seq){
  const host = $('seqinsp');
  if(!host) return;
  host.innerHTML = '';
  host.appendChild(blkInspector(seq));
}
/* the compact card for >1 selected — DUPLICATE and REMOVE act on the
   whole selection, reusing blockAdd/blockRemove exactly as the
   single-brick buttons below do */
function blkInspectorMulti(seq, ids){
  const host = el('div','blkinsp');
  const head = el('div','blkinsphead');
  head.appendChild(el('b',null, ids.length+' bricks selected'));
  host.appendChild(head);
  const bar = el('div','conbar');
  const bDup = el('button','b','Duplicate');
  bDup.addEventListener('click',()=>blkMultiDuplicate(seq, ids));
  const bDel = el('button','b danger','Remove');
  bDel.addEventListener('click',()=>blkMultiRemove(seq, ids));
  bar.appendChild(bDup); bar.appendChild(bDel);
  host.appendChild(bar);

  /* the two bulk edits (Mike, 2026-08-18) — run time for every selected
     brick, and the motion shape for every selected act brick */
  const bricks = ids.map(id=>blockFind(seq, id)).filter(Boolean);
  const durs = bricks.map(b=>b.dur);
  const durUniform = durs.length && durs.every(d=>d===durs[0]);
  const dr = el('div','blkfield');
  const dl = el('label',null,'Runs for');
  dl.title = 'set how long EVERY selected brick lasts, in one go';
  dr.appendChild(dl);
  const di = document.createElement('input');
  di.type='number'; di.min=200; di.max=8000; di.step=50;
  di.dataset.multi = 'dur';
  di.value = durUniform ? durs[0] : Math.max(...durs);
  di.addEventListener('change',()=>{ blkMultiDur(seq, ids, +di.value); });
  dr.appendChild(di);
  dr.appendChild(el('span','blkval', durUniform ? 'ms' : 'ms · mixed'));
  host.appendChild(dr);

  const actBricks = bricks.filter(b=>b.kind !== 'seq');
  if(actBricks.length){
    const modes = actBricks.map(b=>b.mode || 'oc');
    const modeUniform = modes.every(m=>m===modes[0]);
    const mr = el('div','blkfield');
    const ml = el('label',null,'Motion');
    ml.title = 'what every selected brick does inside its own window — opens, opens then closes, or just closes';
    mr.appendChild(ml);
    const ms = document.createElement('select'); ms.className = 'blksel';
    ms.dataset.multi = 'mode';
    if(!modeUniform){
      const o = document.createElement('option');
      o.value=''; o.textContent='— mixed —'; o.disabled=true; o.selected=true;
      ms.appendChild(o);
    }
    BLK_MOTION_MODES.forEach(([v,l])=>{
      const o = document.createElement('option'); o.value = v; o.textContent = l;
      if(modeUniform && modes[0]===v) o.selected = true;
      ms.appendChild(o);
    });
    ms.addEventListener('change',()=>{ if(ms.value) blkMultiMode(seq, ids, ms.value); });
    mr.appendChild(ms);
    host.appendChild(mr);
  }

  const h = el('div','blkinsphint');
  h.textContent = 'Shift+click (or Ctrl+click) another brick to add it to the selection. '
    + 'A plain click, or Esc, drops back to one.';
  host.appendChild(h);
  return host;
}
function blkInspector(seq){
  const selIds = seq ? blkSelIds().filter(id=>blockFind(seq, id)) : [];
  if(seq && selIds.length > 1) return blkInspectorMulti(seq, selIds);
  const host = el('div','blkinsp');
  const b = (seq && BLK.sel) ? blockFind(seq, BLK.sel) : null;
  if(!b){
    /* Q6 (2026-07-30): with a routine open but nothing selected, the
       column describes the ROUTINE instead of sitting empty — name,
       length, brick count, the parts used with their lane colours, the
       slowest imported throw, and whether it is actually on the board
       (the library is not the board — HANDOVER §"The library…"). */
    if(seq && blockIsRoutine(seq)){
      const bricks = blockList(seq);
      const head = el('div','blkinsphead');
      head.appendChild(el('b',null, seq.name));
      head.appendChild(el('span','blkinspsub','sequence'));
      host.appendChild(head);

      const fact = (lab, val)=>{
        const r = el('div','blkfield');
        r.appendChild(el('label',null,lab));
        r.appendChild(el('span'));
        r.appendChild(el('span','blkval', val));
        host.appendChild(r);
      };
      fact('Length', (blkLengthMs(seq)/1000).toFixed(1)+'s');   // the same number the header prints
      fact('Bricks', String(bricks.length));

      /* the parts it moves, wearing the same colours as their lanes */
      const acts = [];
      bricks.forEach(x=>{ if(x.kind==='act' && acts.indexOf(x.ref)<0) acts.push(x.ref); });
      fact('Parts', String(acts.length));
      if(acts.length){
        const chips = el('div','blkchips');
        acts.forEach(a=>{
          const c = el('div','blkchip pc', blkLabel(a));
          c.style.setProperty('--pc', blkColor(a));
          c.title = a+' — this colour is this part, everywhere in the sequencer';
          chips.appendChild(c);
        });
        host.appendChild(chips);
      }else if(bricks.length){
        host.appendChild(el('div','blkimp','whole-sequence bricks only'));
      }

      /* the physical floor: the slowest imported throw among used channels */
      const slowest = acts.reduce((m,a)=>Math.max(m, blockMinTravelMs(a)), 0);
      if(slowest){
        const sr = el('div','blkfield');
        const sl = el('label',null,'Slowest');
        sl.title = 'the longest throw among this sequence\'s channels at their own speed and acceleration — nothing here can move faster than that';
        sr.appendChild(sl);
        sr.appendChild(el('span','blkimp','~'+slowest+' ms at these channels\' speeds'));
        host.appendChild(sr);
      }

      /* the library is not the board — say which side of that line it is on */
      const br2 = el('div','blkfield');
      br2.appendChild(el('label',null,'Board'));
      const slot = (typeof loadoutIndex === 'function') ? loadoutIndex(seq.name) : -1;
      if(slot >= 0){
        const wrap = el('span');
        const badge = el('span','bldslot', String(slot));
        badge.title = 'restartScript('+slot+') plays it';
        wrap.appendChild(badge);
        wrap.appendChild(document.createTextNode(' '));
        wrap.appendChild(el('span','blkimp','on the board as sub '+slot));
        br2.appendChild(wrap);
      }else{
        br2.appendChild(el('span','blkimp','not on the board — ⚙ '
          + ((typeof bldTitle === 'function') ? bldTitle() : 'Put on the board') + ' adds it'));
      }
      host.appendChild(br2);
    }
    host.appendChild(el('div','blkinsphint','Click a brick to set how long it runs'
      + (BLK.adv ? ' and how fast it opens and closes.' : '. Its servo moves at that channel\'s own speed and acceleration.')));
    return host;
  }
  const label = (b.kind==='seq') ? b.ref : (blkLabel(b.ref));
  const head = el('div','blkinsphead');
  head.appendChild(el('b',null,label));
  head.appendChild(el('span','blkinspsub', 'starts at '+(b.t0/1000).toFixed(2)+'s'));
  host.appendChild(head);

  /* v1.49.0 — under review, the error against the original frames sits at
     the top of the fields you are about to drag, and is re-measured on
     every rebuild. Watching it go to "matches" IS the fix. */
  const cline = blkConvInspectorLine(seq, b);
  if(cline) host.appendChild(cline);

  /* v1.46.0 — a grey brick says so where you are already looking when you
     click it, and offers the one thing that fixes it. Its timing fields
     below stay live: retiming a brick you have not wired yet is exactly the
     work Mike asked to be possible. */
  if(!blockWired(b)){
    const w = el('div','blkimp blkunwiredfield');
    w.textContent = 'not wired to a channel yet — this brick moves nothing and is left out of the compiled frames.';
    host.appendChild(w);
    const bar0 = el('div','conbar');
    const mb = el('button','b','map it now…');
    mb.addEventListener('click',()=>blkUnconfOffer({label:blkLabel(b.ref), lit:(BLKH.litNote?BLKH.litNote(b.ref):'')}));
    bar0.appendChild(mb);
    host.appendChild(bar0);
  }

  /* undo: every mutation rebuilds this inspector (each 'change' handler ends
     in buildSequencer()), so the state at BUILD time is the state just
     before the next slider gesture — captured once here, committed by the
     field's 'change'. The 'input' events in between are one gesture. */
  const hist0 = blockHistCapture(seq);

  const num = (lab, val, min, max, step, set, tip, badge)=>{
    const r = el('div','blkfield');
    const l = el('label',null,lab); if(tip) l.title = tip;
    if(badge) l.appendChild(el('span','blkovr','override'));
    r.appendChild(l);
    const i = document.createElement('input');
    i.type='range'; i.min=min; i.max=max; i.step=step; i.value=val;
    const v = el('span','blkval', (val/1000).toFixed(2)+'s');
    i.addEventListener('input',()=>{ v.textContent=(i.value/1000).toFixed(2)+'s'; set(+i.value); blockSync(seq); });
    i.addEventListener('change',()=>{ blockHistCommit(seq, hist0); buildSequencer(); });
    r.appendChild(i); r.appendChild(v);
    host.appendChild(r);
    return i;
  };
  if(b.kind !== 'seq'){
    const cr = el('div','blkfield');
    const cl = el('label',null,'Colour');
    cl.title = 'this part\'s colour through the whole sequencer — and on the model when '
             + '"Colour the model to match" is on';
    cr.appendChild(cl);
    const ci = document.createElement('input');
    ci.type = 'color'; ci.value = blkColor(b.ref); ci.className = 'blkcol';
    ci.addEventListener('input',()=>{ blkSetColor(b.ref, ci.value); });
    ci.addEventListener('change',()=>{ buildSequencer(); });
    cr.appendChild(ci);
    const cb2 = el('button','b','reset');
    cb2.title = 'back to the colour this part gets from its channel';
    cb2.addEventListener('click',()=>{ blkSetColor(b.ref, null); buildSequencer(); });
    cr.appendChild(cb2);
    host.appendChild(cr);

    const fr = el('div','blkfield');
    fr.appendChild(el('label',null,'Find it'));
    const fb = el('button','b','Zoom to this part');
    fb.title = 'frame this part in the model view — the part with the droid around it, not filling the screen';
    fb.addEventListener('click',()=>blkFocusApply(false));
    fr.appendChild(fb);
    fr.appendChild(el('span',null,''));
    host.appendChild(fr);

    /* …AND WHEN IT IS BEHIND THE DROID, SAY SO (2026-08-22). "I pressed ▶
       and nothing moved" is usually "it moved, round the back". The line
       hides itself the instant that stops being true — blkFarSync(), off
       the follow loop — so it cannot claim a part is hidden while you are
       looking straight at it. */
    const pn = blkPartName(b.ref);
    if(pn){
      const far = el('div','blkfar');
      far.id = 'sqFarSide';
      far.dataset.part = pn;
      far.appendChild(el('span','blkfarwho', blkLabel(b.ref) + ' is on the far side'));
      const tb = el('button','b','turn the droid round');
      tb.title = 'orbit the view to that side of the droid — the same distance, the same target, '
               + 'nothing else moves';
      tb.addEventListener('click',()=>blkTurnRound(pn));
      far.appendChild(tb);
      host.appendChild(far);
      blkFarSync(far);               // hidden unless it is true right now
    }
  }
  num('Runs for', b.dur, 200, 8000, 50, v=>{ b.dur = v; }, 'how long this brick lasts');

  if(b.kind !== 'seq'){
    /* how far open — the Breathe control. 100% is the full throw; a
       breathing panel sits around 20%. */
    const ar = el('div','blkfield');
    const al = el('label',null,'Opens to');
    al.title = 'how far open this brick goes — 100% is the channel\'s full travel; Breathe uses about 20%';
    ar.appendChild(al);
    const ai = document.createElement('input');
    ai.type='range'; ai.min=5; ai.max=100; ai.step=5;
    ai.value = Math.round(((b.amp === undefined) ? 1 : b.amp) * 100);
    const av = el('span','blkval', ai.value+'%');
    ai.addEventListener('input',()=>{
      av.textContent = ai.value+'%';
      const v = (+ai.value)/100;
      if(v >= 1) delete b.amp; else b.amp = v;
      blockSync(seq);
    });
    ai.addEventListener('change',()=>{ blockHistCommit(seq, hist0); buildSequencer(); });
    ar.appendChild(ai); ar.appendChild(av);
    host.appendChild(ar);

    /* the MOTION mode (Mike, 2026-08-14): "clicking a panel brick should
       offer: Opens then closes / just Opens / just Closes / Closes then
       opens — default Open then closes." A creative control like "Opens
       to" above it, not an expert setting, so it sits here rather than
       behind Advanced. */
    const mr = el('div','blkfield');
    const ml = el('label',null,'Motion');
    ml.title = 'what this brick does inside its own window — the default opens, holds, then closes';
    mr.appendChild(ml);
    const ms = document.createElement('select'); ms.className = 'blksel';
    BLK_MOTION_MODES.forEach(([v,l])=>{
      const o = document.createElement('option'); o.value = v; o.textContent = l;
      if((b.mode || 'oc') === v) o.selected = true;
      ms.appendChild(o);
    });
    ms.addEventListener('change',()=>{
      blockHistPush(seq);                 // a discrete choice — one snapshot, not a drag
      if(ms.value === 'oc') delete b.mode; else b.mode = ms.value;
      blockSync(seq);
      buildSequencer();
    });
    mr.appendChild(ms);
    host.appendChild(mr);
  }

  if(b.kind !== 'seq'){
    const impMs = blockDefaultRamp(b.ref);
    const lim   = blockMinTravelMs(b.ref, b.amp);
    const isOvr = (b.rise !== impMs || b.fall !== impMs);
    const mode  = b.mode || 'oc';
    if(BLK.adv){
      /* 'c' never rises, 'o' never falls — the slider for the ramp that
         mode does not use would just be dead */
      if(mode !== 'c') num('Opens in', b.rise, 0, 3000, 20, v=>{ b.rise = v; },
          'the opening speed for THIS brick only — an override of the imported configuration; '
          + 'the part in the library and the same part in another sequence are untouched',
          b.rise !== impMs);
      if(mode !== 'o') num('Closes in', b.fall, 0, 3000, 20, v=>{ b.fall = v; },
          'the closing speed for THIS brick only — an override of the imported configuration',
          b.fall !== impMs);
      const rr = el('div','blkfield');
      const rl = el('label',null,'Imported');
      rr.appendChild(rl);
      const note = el('span','blkimp', lim
        ? '~'+lim+' ms at your speed/accel settings'
        : 'no speed limit set on this channel');
      rr.appendChild(note);
      const rb = el('button','b blkrestore','restore');
      rb.title = 'back to the imported value — '+impMs+' ms each way';
      rb.disabled = !isOvr;
      rb.addEventListener('click',()=>{ blockHistPush(seq); b.rise = impMs; b.fall = impMs; blockSync(seq); buildSequencer(); });
      rr.appendChild(rb);
      host.appendChild(rr);
      if(lim){
        const h2 = el('div','blkinsphint');
        h2.textContent = 'Your imported settings need ~'+lim+' ms for this throw — the preview and the board '
          + 'will not move faster than that, whatever the override asks for.';
        host.appendChild(h2);
      }
    }else{
      const h2 = el('div','blkinsphint');
      h2.innerHTML = (isOvr ? '<span class="blkovr">override</span> This brick carries its own speeds. ' : '')
        + 'Opens and closes at your <b>imported</b> servo settings'
        + (lim ? ' (~'+lim+' ms per throw)' : '')
        + '. Turn on <b>Advanced</b> in the top bar to override for this brick.';
      host.appendChild(h2);
    }
  }
  const bar = el('div','conbar');
  const bDup = el('button','b','Duplicate');
  bDup.addEventListener('click',()=>{
    blockHistPush(seq);
    /* `mode` travels with the copy, exactly as it does in blkMultiDuplicate.
       Leaving it out did not fail loudly — blockMode() reads an absent mode as
       'oc' — so a duplicated "Closes" or "Closes then opens" silently came
       back as "Opens then closes", which is the brick doing the opposite of
       what the one it was copied from does. */
    blockAdd(seq, b.kind, b.ref, b.t0 + b.dur, {dur:b.dur, rise:b.rise, fall:b.fall, amp:b.amp, mode:b.mode});
    buildSequencer();
  });
  const bDel = el('button','b danger','Remove');
  bDel.addEventListener('click',()=>{ blockHistPush(seq); blockRemove(seq, b.id); BLK.sel=null; buildSequencer(); });
  bar.appendChild(bDup); bar.appendChild(bDel);
  host.appendChild(bar);

  const h = el('div','blkinsphint');
  h.textContent = 'These settings belong to this brick. The same part dropped somewhere else keeps its own.';
  host.appendChild(h);
  return host;
}

/* -------------------------------------------------------- the playhead
   A line the full height of the timeline. Drag it (or the ruler) to
   scrub — the model takes the pose of that instant — and during any
   preview it follows the playback clock. */
function blkPlayheadPlace(){
  const p = $('tlPlayhead'); if(!p) return;
  p.style.left = (118 + blkX(BLK.play.t))+'px';
  const tl = $('sqTime'); if(tl) tl.textContent = (BLK.play.t/1000).toFixed(2)+'s';
}
function blkPlayheadSet(ms, pose){
  const seq = blkSeq(); if(!seq) return;
  BLK.play.t = clamp(Math.round(ms), 0, blkTotal(seq));
  blkPlayheadPlace();
  if(pose !== false) blockPoseAt(seq, BLK.play.t);
}
/* called by whatever is actually playing (preview slot, music clock) */
function blkPlayheadFollow(ms){
  if(!EDIT.active) return;
  BLK.play.t = Math.max(0, Math.round(ms));
  blkPlayheadPlace();
}
function blkScrubStart(ev, ruler){
  ev.preventDefault(); ev.stopPropagation();
  const setFrom = e=>{
    const r = ruler.getBoundingClientRect();
    blkPlayheadSet(blkMs(e.clientX - r.left));
  };
  setFrom(ev);
  const move = e=>setFrom(e);
  const up = ()=>{
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
/* the follow loop: while the sequencer is open, track whatever is playing.
   The edit-slot preview advances in sim time (seqStepPlayback), so the
   elapsed time is the sum of the frames already played plus the offset
   into the current one. */
function blkTick(){
  BLK.raf = 0;
  if(!EDIT.active) return;
  const slot = (typeof MAESTRO !== 'undefined') && MAESTRO.slot && MAESTRO.slot.edit;
  if(slot && slot.kind === 'seq' && slot.frames){
    let t = slot.t || 0;
    for(let i=0; i<slot.i && i<slot.frames.length; i++) t += slot.frames[i].duration;
    blkPlayheadFollow(t);
    /* unwired bricks preview on the MODEL (2026-08-18) — the compiled
       frames the slot is playing cannot carry them (no channel index),
       so the follow loop lays their envelope over ACT_T at the same
       instant. Model only: nothing here can reach liveWrite. */
    const seq = blkSeq();
    if(seq && blockIsRoutine(seq) && typeof blockFreeAt === 'function' && typeof ACT_T !== 'undefined'){
      const free = blockFreeAt(seq, t);
      let any = false;
      for(const a in free){ ACT_T[a] = free[a]; any = true; }
      BLK.freeLive = any ? seq : null;
    }
  } else if(BLK.freeLive){
    /* the preview ended — the home frame parks every WIRED channel shut;
       park the free lanes the same way, once */
    const seq = BLK.freeLive; BLK.freeLive = null;
    if(typeof blockFreeAt === 'function' && typeof ACT_T !== 'undefined'){
      const free = blockFreeAt(seq, -1);        // outside every brick = closed
      for(const a in free) ACT_T[a] = free[a];
    }
  }
  /* both of these ask a question about the CAMERA and the model, which
     nothing rebuilds the pane for — so they are re-asked per frame rather
     than drawn once and left to go stale */
  blkPlayTint(!!(slot && slot.kind === 'seq' && slot.frames));
  blkFarSync();
  BLK.raf = requestAnimationFrame(blkTick);
}
function blkTickStart(){ if(!BLK.raf) BLK.raf = requestAnimationFrame(blkTick); }
function blkTickStop(){
  if(BLK.raf){ cancelAnimationFrame(BLK.raf); BLK.raf = 0; }
  /* leaving the desk drops the mark and hands the tint back BEFORE
     setStripMode's own applyPaint() runs — a borrowed setting that
     outlives the screen it was borrowed on is a setting nobody is
     watching (same reasoning as the live-drive disarm) */
  blkPlayTint(false);
  BLK.mark = null;
}

/* ============ WHAT IS MOVING, WHILE IT MOVES  (2026-08-22)

   "▶ three times, watched the droid, saw nothing move" — because the one
   brick was on a panel behind the dome. The sequencer already had the
   answer: "Colour the model to match" paints every driven part in its own
   brick colour, and it is off by default.

   Making it the permanent default would overrule somebody who deliberately
   switched it off, so it is SCOPED TO PLAYBACK: ▶ borrows it for as long
   as a preview runs and hands their setting straight back when the preview
   ends. Their own change made DURING a preview wins over the loan (see the
   checkbox's change handler) — otherwise switching it off mid-play would
   silently switch back on the next frame.

   Idempotent, and called every frame: `BLK.playTint` is the loan record,
   so the applyPaint() only happens on the two edges. */
function blkPlayTint(on){
  if(on){
    if(BLK.playTint) return;
    BLK.playTint = {was: BLK.tint};
    if(BLK.tint) return;                  // already on: nothing borrowed, nothing to give back
    BLK.tint = true;
    blkMarkApply();
    blkTintBoxSync();
    lg('sys','preview: the model is coloured to match, so the parts the sequence drives show up '
            + 'wherever the camera is pointing');
  }else{
    const loan = BLK.playTint;
    if(!loan) return;
    BLK.playTint = null;
    if(BLK.tint === loan.was) return;
    BLK.tint = loan.was;
    blkMarkApply();
    blkTintBoxSync();
  }
}
/* the checkbox must not say "off" while the model is plainly coloured */
function blkTintBoxSync(){
  const cb = $('sqTint');
  if(cb) cb.checked = BLK.tint;
}

/* --------------------------------------------------------- undo / redo
   The buttons live in #seqtop (↶ / ↷, before the Bricks/Pose/Frames
   trio) and disable themselves when their stack is empty — which is also
   the whole story for a hand-made frame list, where undo is a no-op by
   design. After a restore: selection is dropped if the selected brick no
   longer exists, and buildSequencer() rebuilds the lanes, the inspector
   and the frame views from the recompiled frames. */
function blkUndoRedoSync(){
  const u = $('sqUndo'), r = $('sqRedo');
  if(!u || !r) return;
  const seq = (typeof MSTR !== 'undefined' && MSTR.loaded) ? blkSeq() : null;
  u.disabled = !seq || !blockCanUndo(seq);
  r.disabled = !seq || !blockCanRedo(seq);
}
function blkAfterRestore(seq, what){
  if(BLK.sel !== null && !blockFind(seq, BLK.sel)) BLK.sel = null;
  buildSequencer();
  lg('mae', what+' — "'+seq.name+'" back to '+blockList(seq).length+' brick(s), '
    + (blockEnd(seq)/1000).toFixed(1)+'s');
}
function blkUndo(){
  const seq = blkSeq();
  if(!seq || !blockUndo(seq)) return false;
  blkAfterRestore(seq, 'undo');
  return true;
}
function blkRedo(){
  const seq = blkSeq();
  if(!seq || !blockRedo(seq)) return false;
  blkAfterRestore(seq, 'redo');
  return true;
}
if($('sqUndo') && $('sqRedo')){
  $('sqUndo').addEventListener('click', blkUndo);
  $('sqRedo').addEventListener('click', blkRedo);
}
/* Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) — sequencer strip mode ONLY. The
   guard list, in order: not our mode; a field where Ctrl+Z means "undo my
   typing" (INPUT/TEXTAREA/SELECT, same exemption pattern as
   input/gamepad.js — BUTTON is deliberately NOT exempt here: Enter on a
   button must click it, but Ctrl+Z on a focused button has no native
   meaning, and exempting it would kill the shortcut the moment someone
   clicks ↶); the app dialog (its Enter/Esc capture handler must keep the
   room — it ignores Ctrl+Z, so it has to be checked for, not raced); and
   the full-screen overlays (setup wizard, import wizard, Build your
   Maestro) that sit over the sequencer — and, v1.78.0, EVERY overlay
   uiModalOpen() (core/util.js) knows about. The list here was written by
   hand and missed the servo bench (#setupWrap, class `hide`, not `iwrap`),
   which "map one…" opens straight over a live sequencer: brick selected,
   bench open, focus on one of its buttons, Delete — and the brick was gone
   under the overlay with nothing on screen to show it (review M15). The
   hand-written checks stay for the surfaces uiModalOpen() does not list
   (the app dialog, the dome map's .iwrap); the shared predicate covers the
   rest, so the next overlay added to it is guarded here for free. */
function blkOverlayUp(){
  if(document.querySelector('.dlgwrap')) return true;
  if(document.querySelector('.iwrap:not([hidden])')) return true;
  const st = $('startup'); if(st && st.classList.contains('on')) return true;
  return typeof uiModalOpen === 'function' && uiModalOpen();
}
window.addEventListener('keydown', e=>{
  if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = (e.key || '').toLowerCase();
  if(k !== 'z' && k !== 'y') return;
  if(typeof EDIT === 'undefined' || !EDIT.active) return;
  if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if(blkOverlayUp()) return;
  e.preventDefault();
  if(k === 'y' || e.shiftKey) blkRedo(); else blkUndo();
});

/* Esc / Delete / Backspace — the rest of multi-select's keyboard surface
   (Mike, 2026-08-14). Esc drops a multi-selection back to its primary
   brick, the same place a plain click already lands. Delete/Backspace
   removes whatever is selected, one or many — same "sequencer has focus,
   no input/textarea/select is focused" containment as gamepad.js:39, plus
   the dialog/wizard guards Ctrl+Z above already needed for the same
   reason — blkOverlayUp(), so the two can never disagree about which
   overlays count (v1.78.0, review M15: they did, and the bench was the
   one both had missed). */
function blkKeyGuarded(e){
  if(typeof EDIT === 'undefined' || !EDIT.active) return true;
  if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return true;
  return blkOverlayUp();
}
window.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    if(blkKeyGuarded(e)) return;
    if(!BLK.selSet || BLK.selSet.size <= 1) return;
    blkSelClear();
    buildSequencer();
    return;
  }
  if(e.key === 'Delete' || e.key === 'Backspace'){
    if(blkKeyGuarded(e)) return;
    const seq = blkSeq(); if(!seq) return;
    const ids = blkSelIds(); if(!ids.length) return;
    e.preventDefault();
    blkMultiRemove(seq, ids);
  }
});

/* -------------------------------------------------------------- explode
   The UI half of blockExplode() (blocks.js): add the bricks it returns,
   log what happened, and say something about channels it had to leave
   out. Callers take their own undo snapshot around this — it can run
   inside a gesture that also does a blockAdopt(). */
function blkExplodeLeftoverNote(n){
  if(!n) return;
  const msg = n+' channels have no part assigned — left out (assign in Panels)';
  if(typeof toast === 'function') toast(msg, 'warn');
  lg('warn', msg);
}
function blkExplodeInto(seq, refName, at){
  const exp = blockExplode(refName, at);
  exp.bricks.forEach(spec=>blockAdd(seq, 'act', spec.ref, spec.t0,
    {dur:spec.dur, rise:spec.rise, fall:spec.fall, amp:spec.amp, mode:spec.mode}));
  blockSync(seq);
  lg('mae','exploded "'+refName+'" at '+(at/1000).toFixed(2)+'s — '+exp.bricks.length+' brick(s)');
  blkExplodeLeftoverNote(exp.leftover);
  return exp;
}

/* ---------------------------------------------------- sequence library
   Its own panel, lower-left — grouped, searchable, and built to hold many
   routines. CLICK a chip and you get a description card; DRAG it onto the
   timeline to insert it. Clicking never closes, replaces or clears the
   routine being edited (spec, 2026-07-29). */
function blkLibGroupOf(s){
  if(s.cat) return s.cat;
  return blockIsRoutine(s) ? 'My sequences' : 'Imported';
}
function buildSeqLib(){
  const host = $('seqlib'); if(!host) return;
  host.innerHTML = '';
  blkLibPreviewClose();
  if(!MSTR.loaded) return;

  const top = el('div','libtop');
  top.appendChild(el('b',null,'Sequence library'));
  const search = document.createElement('input');
  search.type='search'; search.className='libsearch'; search.placeholder='search sequences…';
  /* THE FILTER IS THIS SITTING'S, NOT THIS BUILD'S (2026-08-22). BLK.libq is
     deliberately in-memory — nothing in this file writes it to PREFS or the
     servo store — but a text field the app never names is one the BROWSER
     will happily hand back on the next load from its own form restoration,
     and a restored filter is indistinguishable from a library that has lost
     nineteen sequences. autocomplete=off is the only thing that closes that
     door, and it belongs next to the value assignment it protects. */
  search.setAttribute('autocomplete','off');
  search.value = BLK.libq;
  search.addEventListener('input',()=>{
    BLK.libq = search.value;
    buildSeqLib();
    const host = $('seqlib');
    if(host){
      const s2 = host.querySelector('.libsearch');
      if(s2){ s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }  // v1.39.5: the rebuild must not steal the caret
    }
  });
  top.appendChild(search);
  /* …and while it IS filtering, the way out is beside the box rather than
     "select the text and delete it", which is the gesture somebody who has
     not noticed they are filtering will never think to make. */
  if(BLK.libq.trim()){
    const bClr = el('button','b libclear','clear filter');
    bClr.title = 'show the whole library again';
    bClr.addEventListener('click',()=>{ BLK.libq = ''; buildSeqLib(); });
    top.appendChild(bClr);
  }
  top.appendChild(el('span','blklibhint','click for details · drag onto the timeline'));

  const bNew = el('button','b','＋ New sequence');
  bNew.addEventListener('click',()=>{
    EDIT.seq = blockNewRoutine();
    BLK.sel = null; buildSequencer(); buildMaestroPane();
  });
  const nameIn = document.createElement('input');
  nameIn.type='text'; nameIn.className='blkname'; nameIn.placeholder='name this sequence…';
  nameIn.value = (blkSeq() && blkSeq().name) || '';
  const bSave = el('button','b prim','Save');
  bSave.title = 'store the sequence you are building under this name — in your library, not on the board';
  /* SAVING ONTO A NAME SOMEBODY ELSE ALREADY HAS (2026-08-22)

     blockSaveAs() replaces BY NAME, and this handler set seq.name FIRST — so
     typing the name of another sequence handed blockSaveAs the WRONG routine
     to overwrite. findIndex found the victim, the victim's slot was filled
     with a copy of the routine being edited, and the routine being edited kept
     the new name too: library ['Wave','Dance'] became ['Wave','Wave'], both
     board slots fired the same thing, and the real Wave was gone from the
     library, the loadout and the board at once. No confirm, no log, no undo.

     So a clash is a question now, in the shape CLEAR EVERY BRICK asks it:
     name the victim, say what is in it, say what survives either way. */
  bSave.addEventListener('click', async ()=>{
    const seq = blkSeq(); if(!seq) return;
    const old = seq.name;
    let n = (nameIn.value||'').trim() || seq.name;
    const clash = MSTR.sequences.find(s=>s.name === n && s !== seq);
    let drop = null;
    if(clash){
      /* seqUniqueName() (blocks.js) is what "Keep both" needs — a free name to
         put this one under. Where it is not there, Keep both can only mean
         "nothing happens", and the toast says so rather than pretending. */
      const free = (typeof seqUniqueName === 'function') ? seqUniqueName(n) : '';
      const nb = clash.frames.length;
      const yes = (typeof appConfirm === 'function')
        ? await appConfirm(
            '“' + n + '” is already a sequence in your library — ' + nb + ' frame' + (nb===1?'':'s')
            + ', ' + (seqTotal(clash)/1000).toFixed(1) + 's. Saving “' + old + '” under that name '
            + 'replaces it, and nothing brings it back.\n\n'
            + (free
                ? 'Keep both saves what you are editing as “' + free + '” and leaves “' + n + '” alone.'
                : 'Keep both saves nothing — pick a name of its own and press Save again.'),
            {title:'Replace “'+n+'”?', yes:'Replace it', no:'Keep both', danger:true})
        : false;
      if(yes){
        drop = clash;                       // deliberate: one name, one sequence
      }else if(free){
        n = free;
      }else{
        if(typeof toast === 'function')
          toast('Nothing saved — “'+n+'” belongs to another sequence. Give this one a name of its own.','warn');
        return;
      }
    }
    /* the loadout is a list of NAMES, so a replace has already pointed the
       victim's slot at whatever takes the name next. Renaming this routine's
       own slot into it as well would put one sequence on the board twice —
       it gives its slot up instead. Read before the splice, while the name
       still resolves to the victim. */
    const victimOnBoard = !!drop && !!MSTR.loadout && MSTR.loadout.indexOf(n) >= 0;
    if(drop){
      const at = MSTR.sequences.indexOf(drop);
      MSTR.sequences.splice(at, 1);
      if(EDIT.seq > at) EDIT.seq--;         // EDIT.seq is a position in that array
      lg('mae','“'+n+'” replaced — the sequence that had that name ('+drop.frames.length+' frames) is gone');
    }
    if(old !== n && typeof loadoutIndex === 'function' && loadoutIndex(old) >= 0){
      if(victimOnBoard && typeof loadoutDrop === 'function') loadoutDrop(old);
      else if(typeof loadoutRename === 'function') loadoutRename(old, n);
    }
    seq.name = n;
    blockSaveAs(seq, n);
    if(old !== n && typeof reindexSubs === 'function') reindexSubs();  // v1.39.5: renaming via Save must not drop the routine off the board
    buildSequencer(); buildMaestroPane();
  });
  top.appendChild(bNew); top.appendChild(nameIn); top.appendChild(bSave);
  host.appendChild(top);

  const q = BLK.libq.trim().toLowerCase();
  const groups = {};   // name -> [{s, i}]
  /* A FILTERED COUNT IS NOT A COUNT (2026-08-22). The heading printed the
     number of chips it was about to draw — "MY SEQUENCES (2)" after typing
     "Convention" over a library of twenty-one — which is true of the list and
     false of the library, and reads as nineteen routines lost. The group's
     real size is counted first, unfiltered, so the heading can say what the
     number is a count OF. */
  const total = {};
  MSTR.sequences.forEach(s=>{ const g = blkLibGroupOf(s); total[g] = (total[g]||0) + 1; });
  MSTR.sequences.forEach((s,i)=>{
    if(q && s.name.toLowerCase().indexOf(q) < 0) return;
    const g = blkLibGroupOf(s);
    (groups[g] = groups[g] || []).push({s, i});
  });
  const names = Object.keys(groups).sort();
  if(!names.length){
    host.appendChild(el('div','libempty', q ? 'nothing matches "'+BLK.libq+'"' : 'no sequences yet — ＋ New sequence starts one'));
  }
  names.forEach(gname=>{
    const grp = el('div','libgrp');
    if(names.length > 1 || q) grp.appendChild(el('div','libgrph', gname + '  ('
      + (q ? groups[gname].length + ' of ' + total[gname] : groups[gname].length) + ')'));
    const row = el('div','blkchips');
    groups[gname].forEach(({s,i})=>{
      const onBoard = (typeof loadoutIndex === 'function') ? loadoutIndex(s.name) : i;
      const c = el('div','blkchip seq'+(i===EDIT.seq?' act':'')+(onBoard<0?' off':''), s.name);
      c.title = blkPlural(s.frames.length,'frame')+' · '+seqTotal(s)+' ms'+(blockIsRoutine(s)?'  (built from bricks)':'')
        + (onBoard>=0 ? '\non the board as sub '+onBoard
                      : '\nnot on the board — ⚙ Put on the board adds it')
        + '\nclick for details, drag onto the timeline to explode it into bricks';
      c.dataset.seq = String(i);
      /* Click-vs-drag decided on pointerup (see the 2026-07-27 bug note in
         blkChipDrag). A CLICK opens the description card and nothing else —
         the routine on the timeline is untouched. A DROP now EXPLODES it
         (Mike, 2026-08-14: "expanded into each servo's block so they can
         be edited, not just a single block") — the card's own buttons are
         where the old single-brick behaviour still lives. */
      c.addEventListener('pointerdown', ev=>{
        blkChipDrag(ev, c, (at, dropped)=>{
          if(!dropped){ blkLibPreview(i, c); return; }
          const seq = blkSeq();
          if(!seq || seq === s){
            lg('warn','a sequence cannot contain itself — open a different one first');
            return;
          }
          blockAdopt(seq);            // adopt first — a frame list has no history
          blockHistPush(seq);
          blkExplodeInto(seq, s.name, at);
          buildSequencer();
        });
      });
      row.appendChild(c);
    });
    grp.appendChild(row);
    host.appendChild(grp);
  });

  /* Mike, 2026-07-27: what you do in here must not rewrite the board. Say so,
     and say where the board is set. */
  const note = el('div','blklibhint'); note.style.padding = '0 8px 6px';
  note.innerHTML = 'Saving keeps a sequence in <b>your library</b> — it does not change the Maestro script. '
    + '<b>⚙ ' + ((typeof bldTitle === 'function') ? bldTitle() : 'Put on the board')
    + '</b> (top bar, or the Maestro tab) chooses what goes on the board, and in what order. '
    + 'A faded chip is one that is not loaded.';
  host.appendChild(note);
}

/* the description card — click describes, drag inserts */
function blkLibPreviewClose(){
  const p = document.querySelector('.libprev');
  if(p) p.remove();
  window.removeEventListener('pointerdown', blkLibPreviewAway, true);
}
function blkLibPreviewAway(e){
  const p = document.querySelector('.libprev');
  if(p && !p.contains(e.target)) blkLibPreviewClose();
}
function blkLibPreview(i, anchor){
  blkLibPreviewClose();
  const s = MSTR.sequences[i]; if(!s) return;
  const card = el('div','libprev');

  card.appendChild(el('h5',null,s.name));
  const onBoard = (typeof loadoutIndex === 'function') ? loadoutIndex(s.name) : -1;
  card.appendChild(el('div','meta',
    blkPlural(s.frames.length,'frame')+' · '+(blkLengthMs(s)/1000).toFixed(1)+'s'
    + (blockIsRoutine(s) ? ' · '+blkPlural(blockList(s).length,'brick') : ' · hand-made frames')
    + (onBoard>=0 ? ' · on the board as sub '+onBoard : ' · not on the board')));

  /* which parts it moves, with their colours */
  const acts = new Set();
  if(blockIsRoutine(s)) blockList(s).forEach(b=>{ if(b.kind==='act') acts.add(b.ref); });
  else (s.frames||[]).forEach(f=>(f.targets||[]).forEach((t,ch)=>{
    if(!t) return;
    const c = MSTR.channels.find(x=>x.i===ch);
    if(c && c.act) acts.add(c.act);
  }));
  if(acts.size){
    const parts = el('div','parts');
    Array.from(acts).slice(0,14).forEach(a=>{
      const chip = el('i',null,blkLabel(a));
      chip.style.setProperty('--pc', blkColor(a));
      parts.appendChild(chip);
    });
    if(acts.size>14) parts.appendChild(el('i',null,'+'+(acts.size-14)+' more'));
    card.appendChild(parts);
  }

  const bar = el('div','conbar');
  const bOpen = el('button','b','Open for editing');
  bOpen.title = 'switch the timeline to this sequence';
  bOpen.addEventListener('click',()=>{
    blkLibPreviewClose();
    EDIT.seq = i; EDIT.frame = -1; BLK.sel = null; BLK.play.t = 0;
    buildSequencer();
  });
  const bPrev = el('button','b','▶ Preview');
  bPrev.title = 'play it on the model without opening it';
  bPrev.addEventListener('click',()=>{
    if(s.frames.length) seqStart('edit', s.frames, 'preview');
  });
  /* ＋ Insert now explodes, matching the timeline drop's new default
     (Mike, 2026-08-14); "Insert as one brick" is the second choice that
     keeps the old single-brick behaviour reachable. */
  const bIns = el('button','b','＋ Insert');
  bIns.title = 'explode it into the sequence you are editing — one act brick per part, so it can be edited';
  bIns.disabled = (blkSeq() === s) || !blkSeq();
  bIns.addEventListener('click',()=>{
    const seq = blkSeq(); if(!seq || seq === s) return;
    blockAdopt(seq);
    blockHistPush(seq);
    blkExplodeInto(seq, s.name, blockEnd(seq));
    blkLibPreviewClose();
    buildSequencer();
  });
  const bInsOne = el('button','b','Insert as one brick');
  bInsOne.title = 'append it to the sequence you are editing, as one whole-sequence brick — not exploded';
  bInsOne.disabled = (blkSeq() === s) || !blkSeq();
  bInsOne.addEventListener('click',()=>{
    const seq = blkSeq(); if(!seq || seq === s) return;
    blockAdopt(seq);
    blockHistPush(seq);
    blockAdd(seq, 'seq', s.name, blockEnd(seq));
    blkLibPreviewClose();
    buildSequencer();
  });
  bar.appendChild(bOpen); bar.appendChild(bPrev); bar.appendChild(bIns); bar.appendChild(bInsOne);
  card.appendChild(bar);

  /* THE LIBRARY WAS WRITE-ONLY (2026-08-22). Every ＋ New sequence committed a
     permanent entry, empty ones included, and this card — the only place a
     sequence describes itself — offered Open, Preview, Insert, Insert as one
     brick and a group field. There was nothing here that could take one back
     out, so one walkthrough finished holding twenty-one routines, among them
     Sequence 9, Sequence 10 and Sequence 21, and the only door out was the
     Maestro pane, which acts on whichever sequence happens to be open rather
     than on the one you are looking at. The two verbs go where the naming
     already is. WHEN a new sequence is committed is untouched — whether an
     empty one should exist at all is the owner's call and has not been made. */
  const bar2 = el('div','conbar');
  const bRen = el('button','b','Rename…');
  bRen.title = 'give this sequence another name — the board slot and any brick that plays it follow along';
  bRen.addEventListener('click',()=>blkLibRename(i));
  const bDel = el('button','b danger','Delete');
  bDel.title = 'take this sequence out of your library — asks first, and there is no undo behind it';
  bDel.addEventListener('click',()=>blkLibDelete(i));
  bar2.appendChild(bRen); bar2.appendChild(bDel);
  card.appendChild(bar2);

  const catRow = el('div','catrow');
  catRow.appendChild(el('span',null,'group'));
  const cat = document.createElement('input');
  cat.type='text'; cat.placeholder = blkLibGroupOf(s);
  cat.value = s.cat || '';
  cat.title = 'name a group for this sequence — sequences with the same group sit together in the library';
  cat.addEventListener('change',()=>{
    const v = cat.value.trim();
    if(v) s.cat = v; else delete s.cat;
    buildSeqLib();
  });
  catRow.appendChild(cat);
  card.appendChild(catRow);

  document.body.appendChild(card);
  const r = anchor.getBoundingClientRect();
  card.style.left = Math.min(r.left, window.innerWidth - 264)+'px';
  card.style.top  = Math.max(8, r.top - card.offsetHeight - 6)+'px';
  setTimeout(()=>window.addEventListener('pointerdown', blkLibPreviewAway, true), 0);
}

/* ============================ RENAME AND DELETE, FROM THE CARD (2026-08-22)

   Both of these already exist in the Maestro pane's sequence list, and both
   of them there act on MSTR.sequences[EDIT.seq] — the sequence that happens
   to be OPEN, not the one you are pointing at. From the sequencer that is the
   wrong target: you are looking at a description card for "Sequence 14" while
   editing something else entirely. So these take an index, and everything
   else they need they CALL rather than copy.

   In particular they call paneSeqRefs() (ui-pane.js), which v1.70.0 wrote to
   answer exactly the question these two have to ask — which whole-sequence
   bricks, in which routines, name this sequence. A second scanner here would
   be a second thing to keep true; typeof-guarded like every other
   cross-module call in this file, so a build without the pane degrades to
   "no warning" rather than to a thrown error. */
function blkLibRefs(name){
  return (typeof paneSeqRefs === 'function') ? paneSeqRefs(name) : [];
}
async function blkLibRename(i){
  const s = MSTR.sequences[i]; if(!s) return false;
  const v = (typeof appPrompt === 'function')
    ? await appPrompt('Sequence name (becomes the sub name):',
        {title:'Rename “'+s.name+'”', value:s.name, yes:'Rename'})
    : null;
  if(v === null || v === undefined) return false;          // cancel keeps the old name
  const n = String(v).trim();
  if(!n || n === s.name) return false;
  /* A NAME IS AN ADDRESS (seqUniqueName, blocks.js): two sequences sharing one
     makes the second unreachable from the board while a slot fires the first.
     Renaming ONTO a name in use is refused rather than silently uniquified —
     the person typing it meant that name, and they should be told it is taken
     rather than handed "Wave 2" they did not ask for. */
  if(MSTR.sequences.some(x=>x !== s && x.name === n)){
    if(typeof toast === 'function')
      toast('Not renamed — “'+n+'” already belongs to another sequence. A name is how the board finds it, so two cannot share one.','warn');
    return false;
  }
  const was = s.name;
  if(typeof loadoutRename === 'function') loadoutRename(was, n);
  s.name = n;
  /* the same re-pointing the pane's Rename does, for the same reason: a brick
     holding the old string finds nothing on its next compile and plays silence */
  const hits = blkLibRefs(was);
  hits.forEach(h=>{ h.b.ref = n; });
  const held = [];
  hits.forEach(h=>{ if(held.indexOf(h.seq) < 0) held.push(h.seq); });
  if(typeof blockSync === 'function') held.forEach(x=>blockSync(x));
  if(typeof reindexSubs === 'function') reindexSubs();
  blkLibPreviewClose();
  lg('mae','renamed “'+was+'” → “'+n+'”'
    + (hits.length ? ' — '+blkPlural(hits.length,'brick')+' in '+blkPlural(held.length,'other sequence')
                     +' re-pointed and recompiled: '+held.map(x=>x.name).join(', ') : ''));
  buildSequencer();
  if(typeof buildMaestroPane === 'function') buildMaestroPane();
  return true;
}
async function blkLibDelete(i){
  const s = MSTR.sequences[i]; if(!s) return false;
  /* the same floor the pane keeps: the library is never empty, because
     EDIT.seq is a position in it and there would be nothing to open */
  if(MSTR.sequences.length <= 1){
    if(typeof toast === 'function')
      toast('“'+s.name+'” is the only sequence you have — 🗑 Clear all empties it without taking it away.','warn');
    return false;
  }
  /* WHAT ELSE PLAYS IT. A rename can be followed through; a deletion cannot,
     because there is no name left to point at (v1.69.1, ui-pane.js). */
  const hits = blkLibRefs(s.name);
  const held = [];
  hits.forEach(h=>{ if(h.seq !== s && held.indexOf(h.seq.name) < 0) held.push(h.seq.name); });
  const slot = (typeof loadoutIndex === 'function') ? loadoutIndex(s.name) : -1;
  const what = blockIsRoutine(s) ? blkPlural(blockList(s).length,'brick')
                                 : blkPlural(s.frames.length,'frame');
  /* CLEAR EVERY BRICK? is the shape: name the count, name the target, say what
     survives, and label the buttons with the verbs rather than Yes/No. */
  const msg =
      'This takes “' + s.name + '” — ' + what + ', ' + (blkLengthMs(s)/1000).toFixed(1) + 's — '
    + 'out of your library, and there is no undo behind it.\n\n'
    + (held.length
        ? blkPlural(hits.length,'brick') + ' in ' + blkPlural(held.length,'other sequence') + ' — '
          + held.join(', ') + ' — play' + (hits.length===1?'s':'') + ' it. Those bricks stay on their '
          + 'timelines, keeping their length and their labels, and compile to a held pose instead of '
          + 'the moves they play now. Rename it instead and they follow it.\n\n'
        : '')
    + (slot >= 0 ? 'It is on the board as sub ' + slot + '; that slot is given up, and ⚙ '
                   + ((typeof bldTitle === 'function') ? bldTitle() : 'Put on the board')
                   + ' fills it with whatever you put there next.\n\n' : '')
    + 'The other ' + blkPlural(MSTR.sequences.length - 1, 'sequence') + ' in your library are '
    + 'untouched, and so is the sequence you have open on the timeline'
    + (i === EDIT.seq ? ' — which is this one, so the library opens the sequence before it instead.' : '.');
  const yes = (typeof appConfirm === 'function')
    ? await appConfirm(msg, {title:'Delete “'+s.name+'”?', yes:'Delete it', no:'Keep it', danger:true})
    : true;
  if(!yes) return false;

  /* a review pending on the sequence being deleted has nothing left to be a
     review OF — drop it before the splice, while its copy is still findable */
  if(BLK.conv && BLK.conv.seq === s){ const c = BLK.conv; BLK.conv = null; blkConvDropKept(c); }
  if(typeof loadoutDrop === 'function') loadoutDrop(s.name);
  const at = MSTR.sequences.indexOf(s);
  MSTR.sequences.splice(at, 1);
  /* EDIT.seq is a POSITION in that array, so it moves with the splice — and if
     what went was the sequence open on the timeline, the desk lands on its
     neighbour rather than on whatever slid into the hole. */
  if(EDIT.seq === at){ EDIT.seq = Math.max(0, at - 1); EDIT.frame = -1; BLK.sel = null; blkSelClear(); }
  else if(EDIT.seq > at) EDIT.seq--;
  if(typeof reindexSubs === 'function') reindexSubs();
  blkLibPreviewClose();
  lg('mae','deleted “'+s.name+'” from the library'
    + (held.length ? ' — '+blkPlural(hits.length,'brick')+' in '+held.join(', ')
                     +' now name a sequence that is not there and compile to a held pose' : ''));
  if(held.length && typeof toast === 'function')
    toast('Deleted “'+s.name+'” — '+blkPlural(hits.length,'brick')+' in '+held.join(', ')+' now play a held pose.','warn');
  buildSequencer();
  if(typeof buildMaestroPane === 'function') buildMaestroPane();
  return true;
}
