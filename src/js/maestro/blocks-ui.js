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
  cam:0.85,         // how close the droid view sits to the selected part
  tint:false,       // paint the model in the sequencer's part colours
  snapMode:'auto',  // auto | strong | all | off — restored from PREFS
  adv:false,        // the Advanced switch: per-brick speed overrides
  play:{t:0},       // the playhead, in ms
  raf:0, libq:'',
  /* multi-select (Mike, 2026-08-14): BLK.sel stays the single, scalar
     "primary" id — every existing reader of it keeps working untouched
     (see blkSelIds() below). selSet only ever holds MORE than one id; it
     is how a Shift/Ctrl-click builds on top of a plain click. */
  selSet: new Set()
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

function blkSeq(){ return MSTR.loaded ? MSTR.sequences[EDIT.seq] : null; }
function blkX(ms){ return ms * BLK.pxms; }
function blkMs(px){ return Math.max(0, Math.round(px / BLK.pxms)); }
function blkSnap(ms){ return Math.round(ms/50)*50; }
/* snapping threshold: a fixed 12 px at the current zoom, so it feels the
   same at every scale */
function blkSnapThreshold(){ return 12 / BLK.pxms; }
function blkTotal(seq){ return Math.max(4000, blockEnd(seq) + 2000); }

/* ============================================================= the pane */
function buildBlocks(){
  const host = $('seqblocks'); if(!host) return;
  blkUndoRedoSync();          // before the early returns — the buttons live in #seqtop
  host.innerHTML = '';
  const seq = blkSeq();

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
    n.innerHTML = '<b>“'+xmlEsc(seq.name)+'” is a hand-made frame list</b> ('+seq.frames.length+' frames). '
      + 'You can keep editing it under <b>Frames</b>, or start building it out of bricks — its frames stay until you drop the first one.';
    const bar = el('div','conbar');
    const b = el('button','b prim','Build this one with bricks');
    b.addEventListener('click',()=>{ blockAdopt(seq); buildSequencer(); });
    bar.appendChild(b); n.appendChild(bar);
    host.appendChild(n);
    blkInspectorRender(null);
    return;
  }

  host.appendChild(blkToolbar());
  host.appendChild(blkTimeline(seq));
  host.appendChild(blkActionLib(seq));
  blkInspectorRender(seq);
  blkScrollToSel();
  blkPlayheadPlace();
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

  bar.appendChild(slider('Timeline', 0.03, 0.6, 0.005, BLK.pxms,
    'stretch or squeeze the timeline — this is a view setting, no timing changes',
    v=>(v/0.14).toFixed(1)+'×',
    v=>{ BLK.pxms = v; blkZoomApply(); }));

  bar.appendChild(slider('Droid', 0.3, 3.0, 0.02, BLK.cam,
    'how close the view sits — click a brick first and it zooms to that part',
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
    sp.appendChild(el('span','blktoolv', (blockEnd(seq0)/1000).toFixed(1)+'s'));
    bar.appendChild(sp);
  }

  const sw = el('label','blkswitch');
  const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = BLK.tint;
  cb.title = 'paint every moving part in its sequencer colour — nothing is saved, '
           + 'switch it off (or leave the sequencer) and your paint scheme comes straight back';
  cb.addEventListener('change',()=>{
    BLK.tint = cb.checked;
    if(typeof applyPaint === 'function') applyPaint();
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

  const sel = BLK.sel ? blockFind(blkSeq(), BLK.sel) : null;
  const who = el('div','blktoolwho', sel
    ? (sel.kind === 'seq' ? 'a whole sequence — nothing to zoom to' : 'zoomed to ' + blkLabel(sel.ref))
    : 'click a brick to zoom to its part');
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
  blkScrollToSel();
}
/* keep the selected brick in the middle of the view as the scale changes */
function blkScrollToSel(){
  const host = $('seqblocks'); if(!host) return;
  const seq = blkSeq();
  const b = (seq && BLK.sel) ? blockFind(seq, BLK.sel) : null;
  if(!b) return;
  const x = blkX(b.t0 + b.dur/2);
  host.querySelectorAll('.blkscroll').forEach(sc=>{
    sc.scrollLeft = Math.max(0, x - sc.clientWidth/2);
  });
}
/* point the camera at the part the selected brick moves — "Zoom to this
   part" centres it close enough to inspect (spec, 2026-07-29) */
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
  CAM.dist = BLK.cam;
  if(!quiet) lg('sys','zoomed to '+partLabel(m.name));
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

  /* ruler — time ticks plus the beat grid when music is loaded */
  const rulerRow = el('div','tlrow hdr');
  rulerRow.appendChild(el('div','blklane hdr','time'));
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
    const name = el('div','blklane'+(lane.kind==='seq'?' seq':' pc'), lane.label);
    if(lane.kind !== 'seq') name.style.setProperty('--pc', blkColor(lane.id));
    name.title = lane.kind==='seq' ? 'whole saved sequences, dropped in as one brick' : lane.id;
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
  const d = el('div','blkbrick'+(b.kind==='seq'?' seq':' pc')+(blkSelIds().indexOf(b.id)>=0?' sel':''));
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
  d.appendChild(el('span','blkdur', (b.dur/1000).toFixed(1)+'s'));
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
    blkFocusApply(true);          // the brick you just grabbed is the part you want to see
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
  head.appendChild(el('span','blklibhint','drag one onto the timeline · then stretch its edges · each part has its own colour'));
  host.appendChild(head);

  const row = el('div','blkchips');
  blockActions().forEach(a=>{
    const c = el('div','blkchip pc', a.label);
    c.style.setProperty('--pc', blkColor(a.act));
    c.title = a.act+' · '+a.sub+'\nthis colour is this part, everywhere in the sequencer'
            + '\ndrag me onto the timeline';
    c.dataset.act = a.act;
    c.addEventListener('pointerdown', ev=>blkChipDrag(ev, c, (at, dropped)=>{
      if(!dropped){                                    // a click drops it at the end
        at = blockEnd(seq);
      }
      blockHistPush(seq);
      blockAdd(seq, 'act', a.act, at);
      BLK.sel = blockList(seq)[blockList(seq).length-1].id;
      buildSequencer();
      blkFocusApply(true);
      lg('mae','added '+a.label+' at '+(at/1000).toFixed(2)+'s');
    }));
    row.appendChild(c);
  });
  host.appendChild(row);

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
  return host;
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
      fact('Length', (blockEnd(seq)/1000).toFixed(1)+'s');
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
        sl.title = 'the longest throw among this sequence\'s channels at your imported speed and acceleration — nothing here can move faster than that';
        sr.appendChild(sl);
        sr.appendChild(el('span','blkimp','~'+slowest+' ms at your imported speeds'));
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
          + ((typeof bldTitle === 'function') ? bldTitle() : 'Build your Maestro') + ' puts it there'));
      }
      host.appendChild(br2);
    }
    host.appendChild(el('div','blkinsphint','Click a brick to set how long it runs'
      + (BLK.adv ? ' and how fast it opens and closes.' : '. Its servo moves at your imported speed and acceleration.')));
    return host;
  }
  const label = (b.kind==='seq') ? b.ref : (blkLabel(b.ref));
  const head = el('div','blkinsphead');
  head.appendChild(el('b',null,label));
  head.appendChild(el('span','blkinspsub', 'starts at '+(b.t0/1000).toFixed(2)+'s'));
  host.appendChild(head);

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
    fb.title = 'centre this part in the model view, close enough to inspect';
    fb.addEventListener('click',()=>blkFocusApply(false));
    fr.appendChild(fb);
    fr.appendChild(el('span',null,''));
    host.appendChild(fr);
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
    blockAdd(seq, b.kind, b.ref, b.t0 + b.dur, {dur:b.dur, rise:b.rise, fall:b.fall, amp:b.amp});
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
  }
  BLK.raf = requestAnimationFrame(blkTick);
}
function blkTickStart(){ if(!BLK.raf) BLK.raf = requestAnimationFrame(blkTick); }
function blkTickStop(){ if(BLK.raf){ cancelAnimationFrame(BLK.raf); BLK.raf = 0; } }

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
   Maestro) that sit over the sequencer. */
window.addEventListener('keydown', e=>{
  if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = (e.key || '').toLowerCase();
  if(k !== 'z' && k !== 'y') return;
  if(typeof EDIT === 'undefined' || !EDIT.active) return;
  if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if(document.querySelector('.dlgwrap')) return;
  if(document.querySelector('.iwrap:not([hidden])')) return;
  const st = $('startup'); if(st && st.classList.contains('on')) return;
  e.preventDefault();
  if(k === 'y' || e.shiftKey) blkRedo(); else blkUndo();
});

/* Esc / Delete / Backspace — the rest of multi-select's keyboard surface
   (Mike, 2026-08-14). Esc drops a multi-selection back to its primary
   brick, the same place a plain click already lands. Delete/Backspace
   removes whatever is selected, one or many — same "sequencer has focus,
   no input/textarea/select is focused" containment as gamepad.js:39, plus
   the dialog/wizard guards Ctrl+Z above already needed for the same
   reason. */
function blkKeyGuarded(e){
  if(typeof EDIT === 'undefined' || !EDIT.active) return true;
  if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return true;
  if(document.querySelector('.dlgwrap')) return true;
  if(document.querySelector('.iwrap:not([hidden])')) return true;
  const st = $('startup'); if(st && st.classList.contains('on')) return true;
  return false;
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
  bSave.addEventListener('click',()=>{
    const seq = blkSeq(); if(!seq) return;
    const old = seq.name;
    const n = (nameIn.value||'').trim() || seq.name;
    if(old !== n && typeof loadoutRename === 'function' && typeof loadoutIndex === 'function' && loadoutIndex(old) >= 0) loadoutRename(old, n);
    seq.name = n;
    blockSaveAs(seq, n);
    if(old !== n && typeof reindexSubs === 'function') reindexSubs();  // v1.39.5: renaming via Save must not drop the routine off the board
    buildSequencer(); buildMaestroPane();
  });
  top.appendChild(bNew); top.appendChild(nameIn); top.appendChild(bSave);
  host.appendChild(top);

  const q = BLK.libq.trim().toLowerCase();
  const groups = {};   // name -> [{s, i}]
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
    if(names.length > 1 || q) grp.appendChild(el('div','libgrph', gname+'  ('+groups[gname].length+')'));
    const row = el('div','blkchips');
    groups[gname].forEach(({s,i})=>{
      const onBoard = (typeof loadoutIndex === 'function') ? loadoutIndex(s.name) : i;
      const c = el('div','blkchip seq'+(i===EDIT.seq?' act':'')+(onBoard<0?' off':''), s.name);
      c.title = s.frames.length+' frames · '+seqTotal(s)+' ms'+(blockIsRoutine(s)?'  (built from bricks)':'')
        + (onBoard>=0 ? '\non the board as subroutine '+onBoard
                      : '\nnot on the board — Build your Maestro puts it there')
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
    + '<b>⚙ ' + ((typeof bldTitle === 'function') ? bldTitle() : 'Build your Maestro')
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
    s.frames.length+' frames · '+(seqTotal(s)/1000).toFixed(1)+'s'
    + (blockIsRoutine(s) ? ' · '+blockList(s).length+' bricks' : ' · hand-made frames')
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
