'use strict';
/* =====================================================================
   BRICK TIMELINE — PCA Studio's view onto the shared block sequencer

   The model, the compiler, the ready-made shapes, undo and snapping are
   src/js/maestro/blocks.js, exactly as the simulator runs it. This file is
   only the drawing and the pointer handling; the sim's own blocks-ui.js is
   the equivalent for its sequencer pane, which lives in a very different
   shell (3D model, music track, part inspector). Sharing the LOGIC is what
   matters — that is where the bugs live.

   A routine's `blocks` array is the editable state. `seq.frames` is
   REGENERATED from it on every change by blockSync(), so the frame grid
   next door is always the truth about what exports, and the two views can
   never disagree. A sequence with no `blocks` array is a hand-made frame
   list and is left completely alone until you adopt it.
   ===================================================================== */

const BLK = {
  view: 'bricks',     /* 'bricks' | 'frames' */
  sel: null,          /* selected brick id */
  pxPerMs: 0.16,
  snapMode: 'auto',
  tint: false,        /* no model here; the flag exists for shared code */
  drag: null
};
const TL_LANE_LABEL = 118;   /* must match .lane .lname in the CSS */

function blkSeq(){ return PROJ.sequences[curSeq] || null; }
function blkIsBrickable(seq){ return !!(seq && !seq.gen); }

/* blocks.js calls BLKH.changed() after every model edit — that is our one
   entry point for "the routine moved, redraw everything that reads it". */
function blkAfterChange(){
  projSave();
  if(typeof rebuildEngine === 'function') rebuildEngine(true);
  if(typeof buildFrames === 'function') buildFrames();
  if(typeof buildSeqTabs === 'function') buildSeqTabs();
  blkDraw();
}

/* ==================== A COLOUR IS VALIDATED, NOT ESCAPED (2026-08-23)

   blkColor() only returns one of BLK_PALETTE's hexes until somebody sets an
   override; after that it returns whatever sits in PROJ.blkColors, which is
   read straight out of an imported project JSON or out of localStorage. That
   value is then spliced into style="background:...".

   Escaping the double quote would close the attribute break and stop there,
   and stopping there is not enough. Whatever survives escaping is still CSS,
   and CSS inside a style attribute is not inert: url(...) reaches the
   network, a position and a z-index cover the page with something that looks
   like our own UI. An escaper says "say anything you like, just not that one
   character" — the wrong sentence for a value whose entire legal vocabulary
   is a hex colour.

   So this whitelists instead: #rgb through #rrggbbaa is passed through, and
   anything else becomes the neutral grey the sequence bricks already wear.
   A bad colour then looks wrong, which is the correct outcome — the project
   file that carried it is lying about being a colour. */
function safeColor(v){ return /^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : '#6b7a88'; }

/* ------------------------------------------------------------- library */
function blkBuildLib(){
  const host = $('libList');
  if(!host) return;
  let h = '';
  const acts = blockActions();
  acts.forEach(a=>{
    h += '<div class="libitem" draggable="true" data-kind="act" data-ref="'+a.act+'">'
      +  '<span class="sw" style="background:'+safeColor(blkColor(a.act))+'"></span>'
      +  '<span>'+esc(a.label)+'</span><span class="sub">'+esc(a.sub)+'</span></div>';
  });
  const groups = blockGroups();
  if(groups.length){
    h += '<div class="libgrp">Groups — dropped as a shape</div>';
    groups.forEach(g=>{
      /* g.id is 'w-' + the first word of a channel NAME (45-blocks-host.js),
         so it is user text wearing a prefix: a channel called x"onmouseover=…
         ends the data-ref attribute and writes a handler beside it. g.label
         on the next line was already escaped; this half was not (2026-08-23). */
      h += '<div class="libitem" data-kind="group" data-ref="'+esc(g.id)+'">'
        +  '<span class="sw" style="background:'+safeColor(blkColor(g.members[0]))+'"></span>'
        +  '<span>'+esc(g.label)+'</span><span class="sub">×'+g.members.length+'</span></div>';
    });
  }
  /* every OTHER sequence can be dropped in whole, as one brick */
  const others = PROJ.sequences.filter((s,i)=>i !== curSeq && !s.gen && s.frames && s.frames.length);
  if(others.length){
    h += '<div class="libgrp">Sequences — dropped whole</div>';
    others.forEach(s=>{
      h += '<div class="libitem" draggable="true" data-kind="seq" data-ref="'+esc(s.name)+'">'
        +  '<span class="sw" style="background:#6b7a88"></span>'
        +  '<span>'+esc(s.name)+'</span><span class="sub">'+s.frames.length+'f</span></div>';
    });
  }
  host.innerHTML = h || '<div class="libitem"><span class="sub">no servo channels yet</span></div>';

  host.onclick = e=>{
    const it = e.target.closest('.libitem'); if(!it) return;
    const seq = blkSeq();
    if(!blkAdoptable(seq)){
      log(blkNeedsAdopting(seq)
        ? 'that sequence is a hand-made frame list — choose how to convert it first'
        : 'this kind of sequence has no frames to build', 'warn');
      return;
    }
    if(it.dataset.kind === 'group'){
      const g = blockGroups().find(x=>x.id === it.dataset.ref);
      if(g){ blockHistPush(seq); blockMakeShape(seq, $('selShape').value || 'wave', g.members); }
    }else{
      blockHistPush(seq);
      blockAdd(seq, it.dataset.kind, it.dataset.ref, blockEnd(seq));
    }
  };
  host.ondragstart = e=>{
    const it = e.target.closest('.libitem'); if(!it) return;
    e.dataTransfer.setData('text/plain', it.dataset.kind+'|'+it.dataset.ref);
    e.dataTransfer.effectAllowed = 'copy';
  };
}

/* A routine has to exist before a brick can go into it — but adopting a
   sequence that already HAS frames is destructive: the first brick to land
   makes blockCompile() regenerate the whole frame list, and an imported
   .mstr sequence is somebody's hand-tuned choreography. So a frame list is
   only adopted when it is empty, or when the user has said so out loud via
   the notice blkDraw() puts in the timeline. */
function blkAdoptable(seq, force){
  if(!blkIsBrickable(seq)) return false;
  if(!blockIsRoutine(seq)){
    if(!force && seq.frames && seq.frames.length) return false;
    blockAdopt(seq);
    blockHistReset(seq);
  }
  return true;
}
function blkNeedsAdopting(seq){
  return blkIsBrickable(seq) && !blockIsRoutine(seq) && !!(seq.frames && seq.frames.length);
}

/* ------------------------------------------------------------- drawing */
function blkDraw(){
  const bricks = (BLK.view === 'bricks');
  const seq = blkSeq();
  const wrap = $('brickWrap'), fr = $('frWrap'), tools = $('brickTools');
  if(!wrap) return;
  /* a generator sequence has no frames to build, so it has no bricks */
  const on = bricks && blkIsBrickable(seq);
  wrap.classList.toggle('hide', !on);
  fr.classList.toggle('hide', on);
  tools.classList.toggle('hide', !on);
  document.querySelectorAll('#viewSeg button').forEach(b=>
    b.classList.toggle('on', b.dataset.v === BLK.view));
  if(!on) return;

  blkBuildLib();
  blkBuildShapePickers();

  const tl = $('tl');
  if(blkNeedsAdopting(seq)){
    /* say what will be lost, in frames, before anything is lost */
    tl.style.width = '100%';
    tl.innerHTML = '<div class="adoptnote">'
      + '<b>' + esc(seq.name) + '</b> is a hand-made frame list — '
      + seq.frames.length + ' frames, probably imported.<br>'
      + 'Bricks generate the frames, so building this one out of bricks '
      + '<b>replaces</b> what is there now.'
      + '<div class="row"><button class="mini" id="bAdopt">Rebuild it as bricks</button>'
      + '<button class="mini" id="bAdoptCopy">Copy to a new sequence first</button>'
      + '<span class="stat">or switch to ▦ Frames to edit it as it is</span></div></div>';
    $('tlHead').innerHTML = '';
    $('bAdopt').onclick = ()=>{ blkAdoptable(seq, true); seq.frames = []; blockSync(seq); };
    $('bAdoptCopy').onclick = ()=>{
      const copy = {name: seq.name + ' (bricks)', frames: [], blocks: []};
      PROJ.sequences.push(copy);
      curSeq = PROJ.sequences.length - 1;
      blockHistReset(copy);
      blockSync(copy);
      log('made "'+copy.name+'" as slot '+curSeq+' — the original is untouched');
    };
    blkDrawInspector();
    $('brickStat').textContent = '';
    $('bUndo').disabled = $('bRedo').disabled = true;
    return;
  }
  const total = Math.max(2000, blockEnd(seq) + 800);
  const w = Math.round(total * BLK.pxPerMs);
  const lanes = blockLanes(seq);
  let h = '';
  lanes.forEach((l, li)=>{
    h += '<div class="lane'+(li%2?' alt':'')+'" data-lane="'+esc(l.id)+'" style="width:'+(w+TL_LANE_LABEL)+'px">'
      +  '<div class="lname" title="'+esc(l.label)+'">'+esc(l.label)+'</div>';
    blockList(seq).forEach(b=>{
      const lane = (b.kind === 'seq') ? '_seq' : b.ref;
      if(lane !== l.id) return;
      h += blkBrickHtml(b);
    });
    h += '</div>';
  });
  if(!blockList(seq).length){
    h += '<div class="lane" style="width:100%"><div class="lname">—</div>'
      +  '<span class="stat" style="padding-left:12px;line-height:34px">'
      +  'Empty routine. Click a channel on the left to append a brick, or drag one onto a lane.</span></div>';
  }
  tl.style.width = (w + TL_LANE_LABEL) + 'px';
  tl.innerHTML = h;

  /* the ruler */
  const head = $('tlHead');
  let step = 500;
  while(step * BLK.pxPerMs < 60) step *= 2;
  let hh = '';
  for(let t = 0; t <= total; t += step){
    hh += '<div class="tick" style="left:'+(TL_LANE_LABEL + t*BLK.pxPerMs)+'px"><span>'+(t/1000).toFixed(step<1000?1:0)+'s</span></div>';
  }
  head.innerHTML = hh;
  head.scrollLeft = $('tlScroll').scrollLeft;

  blkDrawInspector();
  const n = blockList(seq).length;
  $('brickStat').textContent = n
    ? n+' brick'+(n===1?'':'s')+' · '+(blockEnd(seq)/1000).toFixed(2)+'s · '+seq.frames.length+' frames'
    : '';
  $('bUndo').disabled = !blockCanUndo(seq);
  $('bRedo').disabled = !blockCanRedo(seq);
}

function blkBrickHtml(b){
  const x = Math.round(b.t0 * BLK.pxPerMs) + TL_LANE_LABEL;
  const w = Math.max(8, Math.round(b.dur * BLK.pxPerMs));
  if(b.kind === 'seq'){
    return '<div class="brick seqbrick'+(BLK.sel===b.id?' sel':'')+'" data-id="'+b.id+'" '
      + 'style="left:'+x+'px;width:'+w+'px" title="'+esc(b.ref)+'">'
      + '<span class="grip l"></span>'+esc(b.ref)+'<span class="grip r"></span></div>';
  }
  const r = blockEffRamps(b);
  const amp = (b.amp === undefined) ? 1 : b.amp;
  return '<div class="brick'+(BLK.sel===b.id?' sel':'')+'" data-id="'+b.id+'" '
    + 'style="left:'+x+'px;width:'+w+'px;background:'+safeColor(blkColor(b.ref))+'" '
    + 'title="'+esc(blkLabel(b.ref))+' — '+b.dur+' ms, ramps '+Math.round(r.rise)+'/'+Math.round(r.fall)+'">'
    + '<span class="grip l"></span>'
    + '<span class="ramp l" style="width:'+Math.round(r.rise*BLK.pxPerMs)+'px"></span>'
    + '<span class="ramp r" style="width:'+Math.round(r.fall*BLK.pxPerMs)+'px"></span>'
    + (amp < 1 ? Math.round(amp*100)+'% ' : '') + esc(blkLabel(b.ref))
    + '<span class="grip r"></span></div>';
}

function blkBuildShapePickers(){
  const s = $('selShape');
  if(s && !s.options.length){
    s.innerHTML = BLOCK_SHAPES.map(x=>'<option value="'+x.id+'" title="'+esc(x.hint)+'">'+x.label+'</option>').join('');
  }
  const on = $('selShapeOn');
  if(!on) return;
  const keep = on.value;
  const groups = blockGroups();
  /* the same group id in a value="" attribute, escaped for the same reason
     as the library row above (2026-08-23). */
  on.innerHTML = groups.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.label)+'</option>').join('');
  if(keep && groups.some(g=>g.id === keep)) on.value = keep;
}

/* ----------------------------------------------------------- inspector */
function blkDrawInspector(){
  const host = $('brickInsp'), seq = blkSeq();
  const b = BLK.sel ? blockFind(seq, BLK.sel) : null;
  if(!b){ host.classList.add('hide'); return; }
  host.classList.remove('hide');
  if(b.kind === 'seq'){
    host.innerHTML = '<span class="title">'+esc(b.ref)+'</span>'
      + '<label>start <input type="number" data-k="t0" value="'+b.t0+'" step="10" min="0"> ms</label>'
      + '<label>length <input type="number" data-k="dur" value="'+b.dur+'" step="10" min="120"> ms</label>'
      + '<button class="mini" data-k="dup">duplicate</button>'
      + '<button class="mini" data-k="del">✕ delete</button>';
  }else{
    const floor = Math.round(blockMinTravelMs(b.ref, b.amp));
    const amp = (b.amp === undefined) ? 1 : b.amp;
    host.innerHTML = '<span class="title">'+esc(blkLabel(b.ref))+'</span>'
      + '<label>start <input type="number" data-k="t0" value="'+b.t0+'" step="10" min="0"> ms</label>'
      + '<label>length <input type="number" data-k="dur" value="'+b.dur+'" step="10" min="120"> ms</label>'
      + '<label title="How long it takes to open">rise <input type="number" data-k="rise" value="'+Math.round(b.rise)+'" step="10" min="0"></label>'
      + '<label title="How long it takes to close">fall <input type="number" data-k="fall" value="'+Math.round(b.fall)+'" step="10" min="0"></label>'
      + '<label title="How far open this brick goes. A panel that only ever swells a fifth of the way reads as breathing, not as a door.">travel '
      +   '<input type="number" data-k="amp" value="'+Math.round(amp*100)+'" step="5" min="5" max="100">%</label>'
      + (floor > 0 ? '<span class="floor" title="This channel\'s own speed and acceleration cannot move it faster than this, so the compiler will not pretend otherwise.">floor '+floor+' ms</span>' : '')
      + '<button class="mini" data-k="dup">duplicate</button>'
      + '<button class="mini" data-k="del">✕ delete</button>';
  }
  host.oninput = e=>{
    const k = e.target.dataset.k; if(!k) return;
    const seq2 = blkSeq(), bb = blockFind(seq2, BLK.sel); if(!bb) return;
    const before = blockHistCapture(seq2);
    const v = +e.target.value;
    if(k === 'amp') bb.amp = Math.max(0.05, Math.min(1, v/100));
    else if(k === 'dur') bb.dur = Math.max(120, v|0);
    else bb[k] = Math.max(0, v|0);
    blockHistCommit(seq2, before);
    blockSync(seq2);
  };
  host.onclick = e=>{
    const b2 = e.target.closest('button'); if(!b2) return;
    const seq2 = blkSeq(), bb = blockFind(seq2, BLK.sel); if(!bb) return;
    if(b2.dataset.k === 'del'){
      blockHistPush(seq2); BLK.sel = null; blockRemove(seq2, bb.id);
    }else if(b2.dataset.k === 'dup'){
      blockHistPush(seq2);
      const copy = blockAdd(seq2, bb.kind, bb.ref, bb.t0 + bb.dur,
        {dur:bb.dur, rise:bb.rise, fall:bb.fall, amp:bb.amp});
      if(copy) BLK.sel = copy.id;
      blkDraw();
    }
  };
}

/* -------------------------------------------------------------- gestures
   Move and resize. The model is only committed on pointerup — one undo
   step per gesture, not one per mousemove — but the DOM follows the
   pointer live, so it still feels direct. */
function blkTimeAt(clientX){
  const sc = $('tlScroll');
  const r = sc.getBoundingClientRect();
  const px = clientX - r.left + sc.scrollLeft - TL_LANE_LABEL;
  return Math.max(0, px / BLK.pxPerMs);
}
function blkBindTimeline(){
  const tl = $('tl'), sc = $('tlScroll');
  sc.addEventListener('scroll', ()=>{ $('tlHead').scrollLeft = sc.scrollLeft; });

  tl.addEventListener('pointerdown', e=>{
    const el = e.target.closest('.brick'); if(!el) return;
    const seq = blkSeq(), b = blockFind(seq, +el.dataset.id); if(!b) return;
    BLK.sel = b.id;
    const grip = e.target.classList.contains('grip')
      ? (e.target.classList.contains('l') ? 'l' : 'r') : null;
    BLK.drag = {
      id: b.id, mode: grip || 'move',
      t: blkTimeAt(e.clientX), t0: b.t0, dur: b.dur,
      before: blockHistCapture(seq), moved: false
    };
    el.setPointerCapture(e.pointerId);
    blkDraw();
    e.preventDefault();
  });

  tl.addEventListener('pointermove', e=>{
    const d = BLK.drag; if(!d) return;
    const seq = blkSeq(), b = blockFind(seq, d.id); if(!b) return;
    const dt = blkTimeAt(e.clientX) - d.t;
    if(Math.abs(dt) > 4) d.moved = true;
    if(d.mode === 'move'){
      const snap = blockSnapResolve(d.t0 + dt, seq, b.id, 60/BLK.pxPerMs);
      b.t0 = snap.t;
      blkSnapHint(snap);
    }else if(d.mode === 'r'){
      b.dur = Math.max(120, Math.round((d.dur + dt)/10)*10);
    }else{
      const t0 = Math.max(0, Math.round((d.t0 + dt)/10)*10);
      const end = d.t0 + d.dur;
      b.t0 = Math.min(t0, end - 120);
      b.dur = end - b.t0;
    }
    blkLiveMove(b);
  });

  const finish = ()=>{
    const d = BLK.drag; if(!d) return;
    BLK.drag = null;
    blkSnapHint(null);
    const seq = blkSeq();
    if(d.moved){ blockHistCommit(seq, d.before); blockSync(seq); }
    else blkDraw();
  };
  tl.addEventListener('pointerup', finish);
  tl.addEventListener('pointercancel', finish);

  /* dropping a library item onto a lane places it where you let go */
  tl.addEventListener('dragover', e=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
  tl.addEventListener('drop', e=>{
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain'); if(!data) return;
    const seq = blkSeq();
    if(!blkAdoptable(seq)){ log('convert this sequence to bricks first','warn'); return; }
    const bar = data.indexOf('|');
    const kind = data.slice(0, bar), ref = data.slice(bar+1);
    blockHistPush(seq);
    const t = blockSnapResolve(blkTimeAt(e.clientX), seq, null, 60/BLK.pxPerMs).t;
    const b = blockAdd(seq, kind, ref, t);
    if(b) BLK.sel = b.id;
    blkDraw();
  });
}
/* redraw ONE brick during a drag — the whole timeline every mousemove is
   what makes a browser timeline feel like treacle */
function blkLiveMove(b){
  const el = $('tl').querySelector('.brick[data-id="'+b.id+'"]');
  if(!el) return;
  el.style.left = (Math.round(b.t0*BLK.pxPerMs) + TL_LANE_LABEL) + 'px';
  el.style.width = Math.max(8, Math.round(b.dur*BLK.pxPerMs)) + 'px';
  if(b.kind !== 'seq'){
    const r = blockEffRamps(b);
    const l = el.querySelector('.ramp.l'), rr = el.querySelector('.ramp.r');
    if(l)  l.style.width  = Math.round(r.rise*BLK.pxPerMs)+'px';
    if(rr) rr.style.width = Math.round(r.fall*BLK.pxPerMs)+'px';
  }
  /* keep the inspector honest while the brick is still under the pointer —
     a panel reading "start 0" during a drag to 780 ms is just wrong */
  const insp = $('brickInsp');
  if(insp && !insp.classList.contains('hide')){
    const t0 = insp.querySelector('[data-k=t0]'), du = insp.querySelector('[data-k=dur]');
    if(t0 && document.activeElement !== t0) t0.value = b.t0;
    if(du && document.activeElement !== du) du.value = b.dur;
  }
}
function blkSnapHint(snap){
  const tl = $('tl');
  let el = tl.querySelector('.tlsnap');
  if(!snap || !snap.label){ if(el) el.remove(); return; }
  if(!el){ el = document.createElement('div'); el.className='tlsnap'; tl.appendChild(el); }
  el.style.left = (Math.round(snap.t*BLK.pxPerMs) + TL_LANE_LABEL) + 'px';
  el.innerHTML = '<span>'+esc(snap.label)+'</span>';
}

/* --------------------------------------------------------------- wiring */
function blkBindUI(){
  $('viewSeg').onclick = e=>{
    const b = e.target.closest('button'); if(!b) return;
    BLK.view = b.dataset.v; blkDraw();
  };
  $('bShape').onclick = ()=>{
    const seq = blkSeq();
    if(!blkAdoptable(seq)){ log('convert this sequence to bricks first','warn'); return; }
    const g = blockGroups().find(x=>x.id === $('selShapeOn').value);
    if(!g){ log('no channels to build a shape from','warn'); return; }
    blockHistPush(seq);
    blockMakeShape(seq, $('selShape').value, g.members);
    log('added "'+$('selShape').value+'" across '+g.members.length+' channels');
  };
  $('bSlower').onclick = ()=>{ const s=blkSeq(); if(blockIsRoutine(s)) blockScaleTime(s, 1.25); };
  $('bFaster').onclick = ()=>{ const s=blkSeq(); if(blockIsRoutine(s)) blockScaleTime(s, 0.8); };
  $('bUndo').onclick  = ()=>{ const s=blkSeq(); if(blockUndo(s)) blkDraw(); };
  $('bRedo').onclick  = ()=>{ const s=blkSeq(); if(blockRedo(s)) blkDraw(); };
  blkBindTimeline();

  document.addEventListener('keydown', e=>{
    if(/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName||''))) return;
    const seq = blkSeq();
    if((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)){
      e.preventDefault();
      if(e.shiftKey){ if(blockRedo(seq)) blkDraw(); }
      else if(blockUndo(seq)) blkDraw();
      return;
    }
    if((e.key === 'Delete' || e.key === 'Backspace') && BLK.sel && blockIsRoutine(seq)){
      e.preventDefault();
      blockHistPush(seq);
      const id = BLK.sel; BLK.sel = null;
      blockRemove(seq, id);
    }
  });
}
