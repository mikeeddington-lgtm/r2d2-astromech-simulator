'use strict';
/* =====================================================================
   TRACK BUILDER — top-down 2D circuit editor (v1.41.0)

   Mike's locked decisions: top-down 2D, drag the control points,
   right-click adds/removes a point, place gates and cones, the 2.4 m
   non-adjacent rule (TRACK_MIN_SPACING, app/track.js) WARNS but never
   BLOCKS — highlight the offending stretch red with a one-line reason.
   SAVE persists into PREFS.track and the sim drives the edited track.

   Built entirely in JS at open time (no body.html markup — that file
   belongs to another agent this stage) and REMOVED on close, same rule
   as the stage pickers, the app dialog and the "?" shortcuts card
   (core/dialog.js, app/shortcuts.js, app/main.js's stagePicker()): a
   closed overlay must never sit over the stage's pointer handling.

   Everything the preview draws — the curve, the spacing check — reuses
   app/track.js's OWN functions (trackSample/trackCurve/
   trackSpacingViolations) rather than a lookalike, so the picture can
   never disagree with what SAVE actually builds.

   TE is null while the editor is closed; non-null (the working state —
   a plain object, not PREFS) while it is open. Cancel discards it,
   Save copies it into PREFS.track.
   ===================================================================== */
let TE = null;

/* -------------------------------------------------------------------
   uiModalOpen() (core/util.js) is what gates the gamepad/keyboard while
   a full-page overlay owns the screen (input/gamepad.js's keydown
   guard). Wrapped here rather than editing util.js — not this stage's
   file — same convention hud.js uses for lg(): track-edit.js loads
   after util.js (manifest order), so every caller through the shared
   global `uiModalOpen` binding sees this addition. */
const _teModalOpen = uiModalOpen;
uiModalOpen = function(){
  return !!TE || _teModalOpen();
};

/* ===================================================================
   geometry helpers — hit-testing and insertion, all in WORLD metres
   =================================================================== */
function teClampM(v){ return Math.max(-7, Math.min(7, v)); }

function teSampleIndex(t, N){
  return Math.round(((t % 1 + 1) % 1) * N) % N;
}

function teHitPoint(x, z){
  const r = 10 / TE.scale;
  let best = -1, bd = r;
  TE.shape.forEach((p,i)=>{
    const d = Math.hypot(p[0]-x, p[1]-z);
    if(d < bd){ bd = d; best = i; }
  });
  return best;
}
function teHitGate(x, z, pts){
  const r = 14 / TE.scale;
  let best = -1, bd = r;
  TE.gates.forEach((t,gi)=>{
    const p = pts[teSampleIndex(t, pts.length)];
    const d = Math.hypot(p.x-x, p.z-z);
    if(d < bd){ bd = d; best = gi; }
  });
  return best;
}
function teHitCone(x, z){
  const r = 10 / TE.scale;
  let best = -1, bd = r;
  TE.cones.forEach((c,i)=>{
    const d = Math.hypot(c[0]-x, c[1]-z);
    if(d < bd){ bd = d; best = i; }
  });
  return best;
}
/* nearest point ON the control polygon (not the smoothed curve, but the
   straight lines between the same points that drive it) — good enough
   to say "insert here" without re-deriving the curve's own parameter
   space, and the new point becomes a real control point either way */
function teNearestShapeSegment(x, z){
  const S = TE.shape;
  let best = -1, bd = Infinity, bx = 0, bz = 0;
  for(let i=0;i<S.length;i++){
    const a = S[i], b = S[(i+1)%S.length];
    const abx = b[0]-a[0], abz = b[1]-a[1];
    const len2 = abx*abx + abz*abz || 1e-9;
    let t = ((x-a[0])*abx + (z-a[1])*abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0]+abx*t, pz = a[1]+abz*t;
    const d = Math.hypot(x-px, z-pz);
    if(d < bd){ bd = d; best = i; bx = px; bz = pz; }
  }
  return {segIdx:best, x:bx, z:bz};
}
/* nearest CURVE parameter (0..1) — what a new gate is placed at */
function teNearestGateT(x, z){
  const pts = trackSample(TE.shape);
  let best = 0, bd = Infinity;
  pts.forEach((p,i)=>{
    const d = Math.hypot(p.x-x, p.z-z);
    if(d < bd){ bd = d; best = i; }
  });
  return best / pts.length;
}

/* ===================================================================
   canvas mapping — ±7 m maps to the canvas, 1:1 aspect
   =================================================================== */
function teWorldToPx(x, z){
  return [TE.cx0 + x*TE.scale, TE.cy0 - z*TE.scale];
}
function tePxToWorld(px, pz){
  return [(px-TE.cx0)/TE.scale, (TE.cy0-pz)/TE.scale];
}
function teEventWorld(e){
  const r = TE.canvas.getBoundingClientRect();
  const px = (e.clientX-r.left) * (TE.size / r.width);
  const pz = (e.clientY-r.top)  * (TE.size / r.height);
  return tePxToWorld(px, pz);
}
function teToken(name){
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

/* ===================================================================
   drawing — cleared and redrawn IN PLACE on every edit; the canvas host
   itself is never rebuilt mid-drag
   =================================================================== */
function teDrawGrid(ctx){
  ctx.save();
  ctx.strokeStyle = teToken('--line'); ctx.lineWidth = 1;
  for(let m=-7;m<=7;m++){
    const [x0,y0] = teWorldToPx(m,-7), [x1,y1] = teWorldToPx(m,7);
    ctx.beginPath(); ctx.moveTo(x0+.5,y0); ctx.lineTo(x1+.5,y1); ctx.stroke();
    const [xa,ya] = teWorldToPx(-7,m), [xb,yb] = teWorldToPx(7,m);
    ctx.beginPath(); ctx.moveTo(xa,ya+.5); ctx.lineTo(xb,yb+.5); ctx.stroke();
  }
  ctx.strokeStyle = teToken('--line2'); ctx.lineWidth = 1.5;
  const [zx0,zy0] = teWorldToPx(0,-7), [zx1,zy1] = teWorldToPx(0,7);
  ctx.beginPath(); ctx.moveTo(zx0,zy0); ctx.lineTo(zx1,zy1); ctx.stroke();
  const [zx2,zy2] = teWorldToPx(-7,0), [zx3,zy3] = teWorldToPx(7,0);
  ctx.beginPath(); ctx.moveTo(zx2,zy2); ctx.lineTo(zx3,zy3); ctx.stroke();
  ctx.restore();
}
function teDrawScaleBar(ctx){
  const x0 = 16, y0 = TE.size-16, x1 = x0 + TE.scale;
  ctx.save();
  ctx.strokeStyle = teToken('--dim'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0,y0-4); ctx.lineTo(x0,y0+4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1,y0-4); ctx.lineTo(x1,y0+4); ctx.stroke();
  ctx.fillStyle = teToken('--dim'); ctx.font = '10px '+teToken('--mono');
  ctx.fillText('1 m', x0, y0-8);
  ctx.restore();
}
function teDrawCurve(ctx, viol){
  const {pts, bad} = viol;
  const normal = teToken('--cta'), badC = teToken('--rd');
  ctx.save(); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for(let i=0;i<pts.length;i++){
    const a = pts[i], b = pts[(i+1)%pts.length];
    const [ax,ay] = teWorldToPx(a.x,a.z), [bx,by] = teWorldToPx(b.x,b.z);
    ctx.strokeStyle = (bad.has(i) || bad.has((i+1)%pts.length)) ? badC : normal;
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
  }
  ctx.restore();
}
function teDrawStartLine(ctx, pts){
  const p = pts[0];
  const [x0,y0] = teWorldToPx(p.x+p.nx*TRACK_HALF, p.z+p.nz*TRACK_HALF);
  const [x1,y1] = teWorldToPx(p.x-p.nx*TRACK_HALF, p.z-p.nz*TRACK_HALF);
  ctx.save();
  ctx.strokeStyle = teToken('--txt'); ctx.lineWidth = 3; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
  ctx.restore();
}
function teDrawGates(ctx, pts){
  ctx.save();
  ctx.strokeStyle = teToken('--am'); ctx.fillStyle = teToken('--am'); ctx.lineWidth = 2.5;
  ctx.font = '600 11px '+teToken('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  TE.gates.forEach((t,gi)=>{
    const p = pts[teSampleIndex(t, pts.length)];
    const [x0,y0] = teWorldToPx(p.x+p.nx*(TRACK_HALF+0.3), p.z+p.nz*(TRACK_HALF+0.3));
    const [x1,y1] = teWorldToPx(p.x-p.nx*(TRACK_HALF+0.3), p.z-p.nz*(TRACK_HALF+0.3));
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    const [lx,ly] = teWorldToPx(p.x, p.z);
    ctx.fillText(String(gi+1), lx, ly-10);
  });
  ctx.restore();
}
function teDrawCones(ctx){
  ctx.save();
  ctx.fillStyle = teToken('--am'); ctx.strokeStyle = teToken('--ink'); ctx.lineWidth = 1;
  TE.cones.forEach(([cx,cz])=>{
    const [x,y] = teWorldToPx(cx,cz);
    ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}
function teDrawPoints(ctx){
  ctx.save();
  TE.shape.forEach((p,i)=>{
    const [x,y] = teWorldToPx(p[0],p[1]);
    ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2);
    ctx.fillStyle = (i===TE.dragIdx) ? teToken('--am') : teToken('--cy');
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = teToken('--ink'); ctx.stroke();
  });
  ctx.restore();
}
function teRedraw(){
  if(!TE) return;
  const ctx = TE.ctx;
  ctx.clearRect(0,0,TE.size,TE.size);
  teDrawGrid(ctx);
  const viol = trackSpacingViolations(TE.shape);
  teDrawCurve(ctx, viol);
  teDrawStartLine(ctx, viol.pts);
  teDrawGates(ctx, viol.pts);
  teDrawCones(ctx);
  teDrawPoints(ctx);
  teDrawScaleBar(ctx);
  const violating = viol.bad.size > 0;
  TE.warnEl.textContent = violating
    ? 'two passes closer than 2.4 m here — barriers may overlap (allowed)' : '';
  TE.warnEl.classList.toggle('on', violating);
}

/* ===================================================================
   interaction — pointer capture on the canvas itself (same convention
   as app/splitters.js's drag handles): pointermove redraws in place,
   the canvas host is never rebuilt mid-drag
   =================================================================== */
function teSetMode(mode){
  TE.mode = mode;
  Object.keys(TE.modeBtns).forEach(k=>TE.modeBtns[k].classList.toggle('act', k===mode));
}
function teResetDefault(){
  if(!TE) return;
  const d = trackDefaultData();
  TE.shape = d.shape; TE.gates = d.gates; TE.cones = d.cones; TE.dragIdx = -1;
  teRedraw();
}
function teBindCanvas(){
  const c = TE.canvas;
  c.addEventListener('pointerdown', e=>{
    if(e.button !== 0) return;
    const [x,z] = teEventWorld(e);
    if(TE.mode === 'draw'){
      const idx = teHitPoint(x,z);
      if(idx >= 0){
        TE.dragIdx = idx;
        /* capture keeps a fast real drag from escaping the canvas; a
           synthetic pointer (the tests drive this gesture with dispatched
           PointerEvents, same as blocks-ui.js's brick drag) has no active
           id and setPointerCapture throws — the canvas's own move/up
           listeners work either way, so the capture is best-effort */
        try{ c.setPointerCapture(e.pointerId); }catch(err){ /* synthetic pointer — see above */ }
        c.classList.add('tedrag');
      }
    }else if(TE.mode === 'gates'){
      const pts = trackSample(TE.shape);
      const hit = teHitGate(x,z,pts);
      if(hit >= 0){ if(TE.gates.length > 1) TE.gates.splice(hit,1); }
      else TE.gates.push(teNearestGateT(x,z));
      teRedraw();
    }else if(TE.mode === 'cones'){
      const hit = teHitCone(x,z);
      if(hit >= 0) TE.cones.splice(hit,1);
      else TE.cones.push([Math.round(teClampM(x)*100)/100, Math.round(teClampM(z)*100)/100]);
      teRedraw();
    }
    e.preventDefault();
  });
  c.addEventListener('pointermove', e=>{
    if(TE.dragIdx < 0) return;
    const [x,z] = teEventWorld(e);
    TE.shape[TE.dragIdx] = [teClampM(x), teClampM(z)];
    teRedraw();
  });
  const endDrag = e=>{
    if(TE.dragIdx < 0) return;
    try{ c.releasePointerCapture(e.pointerId); }catch(err){ /* already released */ }
    TE.dragIdx = -1;
    c.classList.remove('tedrag');
  };
  c.addEventListener('pointerup', endDrag);
  c.addEventListener('pointercancel', endDrag);
  /* right-click: add a point on the curve, or remove one under the cursor
     (min 4) — a shape-editing gesture available in every mode, since it
     never collides with what a left-click does in gates/cones mode */
  c.addEventListener('contextmenu', e=>{
    e.preventDefault();
    const [x,z] = teEventWorld(e);
    const idx = teHitPoint(x,z);
    if(idx >= 0){
      if(TE.shape.length > 4) TE.shape.splice(idx,1);
    }else{
      const near = teNearestShapeSegment(x,z);
      TE.shape.splice(near.segIdx+1, 0, [Math.round(near.x*100)/100, Math.round(near.z*100)/100]);
    }
    teRedraw();
  });
}

/* ===================================================================
   open / close / save / cancel
   =================================================================== */
/* the escGuard (core/dialog.js) half of Esc — see the fuller comment
   where TE.onKey wraps this, below. No dialog can open over the track
   editor today, so unlike the other five sites this isOpen has nothing
   to yield to; it only confirms the editor is still the thing open. */
const trackEditEsc = escGuard(()=> !!TE, trackEditCancel);
function trackEditOpen(){
  if(TE) return;
  /* never stack over another full-page overlay, and never open under a
     stranger's hands at a show — same guard kiosk.js asks openStartup()
     to make (app/kiosk.js: "guarding at the function, not at the
     button, is what makes locked true rather than decorative") */
  if(typeof kioskOn === 'function' && kioskOn()) return;
  if(_teModalOpen()) return;

  const data = trackShapeData();
  TE = {
    shape: data.shape.map(p=>p.slice()),
    gates: data.gates.slice(),
    cones: data.cones.map(p=>p.slice()),
    mode: 'draw', dragIdx: -1,
    size: 600
  };
  TE.scale = TE.size/14; TE.cx0 = TE.size/2; TE.cy0 = TE.size/2;

  const wrap = el('div','tewrap'); wrap.id = 'trackEdit';
  const card = el('div','tecard');

  const head = el('div','tehead');
  head.appendChild(el('h2',null,'Track Builder'));
  head.appendChild(el('div','tesub',
    'drag a point to move it · right-click the curve to add a point, right-click a point to remove it (min 4) · ±7 m'));
  card.appendChild(head);

  const toolbar = el('div','tetools');
  const modeBtns = {};
  [['draw','Draw'],['gates','Gates'],['cones','Cones']].forEach(([id,label])=>{
    const b = el('button', 'b'+(id==='draw' ? ' act' : ''), label);
    b.id = 'teMode'+id[0].toUpperCase()+id.slice(1);
    b.title = id==='draw' ? 'drag the control points'
      : id==='gates' ? 'click the curve to place a gate, click a gate to remove it'
      : 'click to place a cone, click a cone to remove it';
    b.addEventListener('click', ()=>teSetMode(id));
    modeBtns[id] = b;
    toolbar.appendChild(b);
  });
  toolbar.appendChild(el('div','tegap'));
  const bReset = el('button','b danger','Reset to default'); bReset.id = 'teReset';
  bReset.title = 'put back the stock circuit — Save to keep it';
  bReset.addEventListener('click', teResetDefault);
  const bSave = el('button','b prim','Save'); bSave.id = 'teSave';
  bSave.addEventListener('click', trackEditSave);
  const bCancel = el('button','b','Cancel'); bCancel.id = 'teCancel';
  bCancel.addEventListener('click', trackEditCancel);
  toolbar.appendChild(bReset); toolbar.appendChild(bSave); toolbar.appendChild(bCancel);
  card.appendChild(toolbar);

  const frame = el('div','teframe');
  const canvas = document.createElement('canvas');
  canvas.id = 'teCanvas'; canvas.width = TE.size; canvas.height = TE.size;
  frame.appendChild(canvas);
  card.appendChild(frame);

  const foot = el('div','tefoot');
  const warn = el('span','tewarn'); warn.id = 'teWarnMsg';
  foot.appendChild(warn);
  card.appendChild(foot);

  wrap.appendChild(card);
  document.body.appendChild(wrap);

  TE.root = wrap; TE.canvas = canvas; TE.ctx = canvas.getContext('2d');
  TE.modeBtns = modeBtns; TE.warnEl = warn;

  teBindCanvas();

  /* Esc cancels — the app dialog pattern (core/dialog.js): document
     capture + stopPropagation on every key, so nothing the editor does
     not itself handle can reach the pad mapper underneath. escGuard
     supplies the Escape-specific piece (contained via its own
     preventDefault+stopPropagation); every OTHER key still needs
     stopping here too, which is why this wraps escGuard's raw `handler`
     in a listener of its own rather than binding it directly like the
     other five sites do. */
  TE.onKey = e=>{
    e.stopPropagation();
    trackEditEsc.handler(e);
  };
  document.addEventListener('keydown', TE.onKey, true);
  /* nothing leaks through to the stage underneath (the dialog rule) */
  ['pointerdown','pointerup','click'].forEach(t=>
    wrap.addEventListener(t, e=>e.stopPropagation()));
  wrap.addEventListener('click', e=>{ if(e.target === wrap) trackEditCancel(); });

  teRedraw();
  lg('sys','track builder: opened');
}
function trackEditClose(){
  if(!TE) return;
  document.removeEventListener('keydown', TE.onKey, true);
  TE.root.remove();
  TE = null;
}
function trackEditCancel(){
  if(!TE) return;
  trackEditClose();
  lg('sys','track builder: cancelled — nothing changed');
}
function trackEditSave(){
  if(!TE) return;
  const violating = trackSpacingViolations(TE.shape).bad.size > 0;
  PREFS.track = {
    shape: TE.shape.map(p=>p.slice()),
    gates: TE.gates.slice(),
    cones: TE.cones.map(p=>p.slice())
  };
  prefsSave();
  trackRebuild();     // updates the stage immediately if the circuit is on
  lg('sys','track builder: saved — '+TE.shape.length+' points, '+TE.gates.length+' gates, '
    +TE.cones.length+' cones'+(violating ? ' (spacing warning noted — not blocked)' : ''));
  trackEditClose();
}

/* -------------------------------------------------------------------
   the door — a small EDIT button beside the stage TRACK button. Called
   once at boot by the one line in app/main.js: that file owns the stage
   buttons and wires btnTrack's own click handler, but the button markup
   itself lives in body.html (another agent's file this stage), so the
   door is built here instead and inserted next to it. #stageTools is
   already hidden whole in kiosk mode (10-kiosk.css) — nothing extra
   needed for that, since this button is a child of it. */
function trackEditInstallButton(){
  const anchor = $('btnTrack');
  if(!anchor || $('btnTrackEdit')) return;
  const b = el('button','sbtn','✎ EDIT');
  b.id = 'btnTrackEdit';
  b.title = 'Track Builder — move the control points, gates and cones';
  b.addEventListener('click', trackEditOpen);
  anchor.insertAdjacentElement('afterend', b);
}
