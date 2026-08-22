'use strict';
/* =====================================================================
   PRACTICE CIRCUIT — a proper closed track on the hangar deck

   The point is still practising the DRIVE FEEL: the ramping, deadzones and
   turn authority of whichever firmware profile is active. But Mike sent a
   picture of a real toy circuit — hairpins, kerbs, barriers down both
   sides — and asked for a lap timer per lap, in a hangar bay. So:

     · the centreline is a closed Catmull-Rom curve through hand-placed
       control points: a long start straight, a fast right-hander, a
       hairpin and a chicane, sized to fit the deck (~±6 m)
     · the surface is a ribbon generated along it, with red/white kerbs on
       both edges and a chequered start/finish
     · BARRIERS are posts and rails along both edges. Touching one costs
       2 s and the droid is pushed back on — you cannot cut the course
     · sector gates are sampled off the curve, so they always sit square to
       the direction of travel however the shape is edited
     · every lap is timed and kept: the last five in the HUD, best persisted

   Arm the feet (START) first — the circuit does nothing the firmware
   would not allow.
   ===================================================================== */
const TRACK = {
  on:false, built:false, root:null,
  pts:[],              // sampled centreline {x,z,tx,tz,nx,nz,seg,s,k}
  gates:[],            // {a,b,idx,lamps[]}
  barriers:[],         // {x,z,ang,len,side,rail,post}
  kerbs:[],            // {x,z,ang,len,side} — the same plan the meshes were built from
  cones:[],            // {x,z,mesh} — Track Builder markers, no collision
  shape:null, gateT:null, coneXZ:null,   // the data trackBuild() last used — see trackShapeData()
  layout:null,         // the named layout it came from — see the LAYOUT LIBRARY below
  startI:0,            // the sample the painted start/finish is on = gate 0's sample
  nearI:null,          // which stretch the droid was last on — see trackNearest()
  next:0, t0:0, last:null, penalty:0, laps:0, times:[],
  prev:null, uiAcc:0, off:false, modelWarned:false
};
const TRACK_HALF = 0.60;          // half the driveable width, metres
const TRACK_SAMPLES = 360;
const TRACK_GATES = 6;
/* Track Builder (v1.41.0): two non-adjacent stretches of circuit closer
   than this can plant a barrier in the middle of the neighbouring lane —
   see the note under TRACK_SHAPE below. track-edit.js recomputes this on
   every edit and highlights the offending stretch red; it WARNS, it never
   blocks a save (Mike's call, 2026-08-15). */
const TRACK_MIN_SPACING = 2.4;

/* =====================================================================
   GEOMETRY RULES (v1.45.0) — Mike: "fix overlapping/crashing barriers on
   small tracks", from a screenshot of a tight hand-drawn lap where the
   kerbs, the rails and the racing line all piled into each other.

   Everything below hangs off TRACK_HALF and these five offsets. If you
   change TRACK_HALF, these are what depend on it:

     · LAYERS. Four rings on each side, in this order outward from the
       centreline: ribbon edge (TRACK_HALF), kerb (+KERB_OUT), the
       droid's clamp (+R2_OUT), barrier (+RAIL_OUT). TRACK_OUTER is the
       outermost of them and the one the squeeze is sized on, so the
       ORDER of the four can never flip however hard the track bends.

     · SQUEEZE. An offset curve d off a centreline of radius R has
       arc-length scale (1 − d/R) on the inside of the corner: at d = R
       it collapses to a point and past that it INVERTS, which is how the
       old code put barrier posts inside the racing line and folded the
       road ribbon over on itself. So on the inside of a corner every
       offset on that side is multiplied by trackSqueeze(), which keeps
       the outermost ring at or under TRACK_FIT (80%) of the local radius.
       One factor for all four layers = the layering above survives, and
       the cross-sections scale with it too (mesh scale.x), so clearances
       stay proportional instead of closing up.

     · PITCH. Kerb blocks and barrier rails are a FIXED size, so their
       spacing has to be measured in metres along the ring they actually
       sit on — trackRing()/trackPieces() — not every Nth centreline
       sample. A sample stride crowds the inside of a hairpin (the ring
       is shorter there) and stretches on a long lap; a fixed pitch on
       the ring's own length does neither.

     · SELF-INTERSECTION. trackPieces() spaces n pieces evenly on the
       ring, so the spacing is known before anything is drawn: a piece is
       then shortened to that gap (less 2×TRACK_PIECE_GAP), and to
       TRACK_PIECE_ARC × the ring's local radius so a straight box cannot
       bulge off a tight ring into the road. Under the minimum length a
       piece is DROPPED — bare is better than drawn through its
       neighbour. Two more passes finish the job, because a ring can
       double back on itself without ever inverting LOCALLY (a lap only
       3 m round has its inner ring passing clean through the far side):
       trackPlaced() throws away a piece whose offset is no longer honest
       — some other stretch of centreline is nearer than the offset it was
       drawn at — or, for a barrier, that has ended up inside anybody's
       driveable lane; and trackTrim() then drops any piece that would
       still touch one already kept.

     · NOTHING IS FORBIDDEN. There is still no minimum lap length, corner
       radius or control-point separation: the furniture adapts to the
       track instead. trackSpacingViolations() warns and never blocks
       (Mike's locked call, 2026-08-15).
   ===================================================================== */
const TRACK_KERB_OUT = 0.09;      // kerb ring, outside TRACK_HALF
const TRACK_R2_OUT   = 0.16;      // the droid's clamp — its footprint eats the rest
const TRACK_RAIL_OUT = 0.26;      // barrier ring, the outermost thing we place
const TRACK_OUTER    = TRACK_HALF + TRACK_RAIL_OUT;
const TRACK_FIT      = 0.80;      // no ring may pass this fraction of the local radius
const TRACK_KERB_LEN = 0.30, TRACK_KERB_PITCH = 0.33, TRACK_KERB_MIN = 0.07;
const TRACK_RAIL_LEN = 0.46, TRACK_RAIL_PITCH = 0.65, TRACK_RAIL_MIN = 0.10;
const TRACK_PIECE_GAP = 0.02;     // clear air between two pieces on one ring
const TRACK_PIECE_ARC = 1.2;      // piece length ceiling, × the ring's local radius
const TRACK_TRIM_TOL  = 0.03;     // slop in trackPlaced(): chord-vs-arc + nearest-SAMPLE snap
const TRACK_K_SPAN = 3;           // curvature stencil, in samples either side

/* The circuit, anticlockwise from the start/finish on the near straight.
   Plain control points so the shape can be redrawn without touching any of
   the code below — everything else is generated from the sampled curve. */
const TRACK_SHAPE = [
  [ 0.0,  5.4], [ 2.9,  5.2], [ 5.2,  4.1], [ 6.0,  2.0],
  [ 4.9,  0.4], [ 5.3, -1.6], [ 6.1, -3.5], [ 4.7, -5.1],
  [ 2.1, -5.6], [-0.8, -5.4], [-3.4, -4.6], [-5.4, -3.0],
  [-6.1, -0.9], [-4.7,  0.7], [-5.3,  2.5], [-3.7,  4.2],
  [-1.7,  5.2]
];
/* Two non-adjacent parts of a circuit closer than 2 × (TRACK_HALF +
   TRACK_RAIL_OUT) used to leave a barrier standing in the middle of the
   neighbouring lane — the first draft had a double-apex that pinched to
   1.1 m and did exactly that. Since v1.45.0 the furniture gives way
   instead (trackPlaced()/trackTrim(), the geometry rules above), so the
   2.4 m rule is a WARNING about how the lane will feel, not a promise the
   geometry needs. It is still worth honouring when drawing a shape. */

/* =====================================================================
   TRACK BUILDER DATA PATH (v1.41.0)

   TRACK_SHAPE above is now only the DEFAULT. Mike: "the sim drives the
   edited track" — PREFS.track carries an optional override, written by
   track-edit.js's SAVE and read here every time the circuit is (re)built:

     PREFS.track = {
       shape: [[x,z], ...]   ≥4 points, each within ±7 m
       gates: [t, ...]       curve parameter 0..1, one per gate
       cones: [[x,z], ...]   markers only — no collision, no lap logic
     }

   Anything missing or out of range falls back to the stock circuit ONE
   FIELD AT A TIME — a corrupt gates array must not also throw away a
   good shape. trackShapeData() is the single place that decides; every
   other function reads TRACK.shape / TRACK.gateT / TRACK.coneXZ, which
   trackBuild() fills in from here.
   ===================================================================== */
function trackShapeValid(shape){
  return Array.isArray(shape) && shape.length>=4 && shape.every(p=>
    Array.isArray(p) && p.length===2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0])<=7 && Math.abs(p[1])<=7);
}
function trackGatesValid(gates){
  return Array.isArray(gates) && gates.length>=1 && gates.every(t=>
    Number.isFinite(t) && t>=0 && t<1);
}
function trackConesValid(cones){
  return Array.isArray(cones) && cones.every(p=>
    Array.isArray(p) && p.length===2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0])<=7 && Math.abs(p[1])<=7);
}
/* the stock lap — what RESET TO DEFAULT in the editor puts back, and what
   trackShapeData() falls back to, field by field */
function trackDefaultData(){
  return {
    shape: TRACK_SHAPE.map(p=>p.slice()),
    gates: Array.from({length:TRACK_GATES}, (_,gi)=>gi/TRACK_GATES),
    cones: []
  };
}
/* =====================================================================
   LAYOUT LIBRARY (v1.45.0) — "Allow Save as New Track and loading an
   existing track." (Mike). Phase 2 of docs/DESIGN-builder-and-track.md.

     PREFS.tracks = {
       v: TRACK_LIB_VERSION,
       active: '<id>' | 'stock',
       list: [ {id, name, shape:[[x,z]…], gates:[t…]|null, cones:[[x,z]…]|null} ]
     }

   The stock circuit is NOT in the list. It is always available under the
   id 'stock' and can never be overwritten or deleted — which is also why
   SAVE on top of it forks a copy instead (trackEditSave()).

   PREFS.track stays written as a MIRROR of the active layout, so a
   downgrade to v1.44.1 still finds a lap and app/setup-io.js's `track`
   key keeps carrying one. The library is the authority when it is there;
   when it is not — someone upgrading from v1.44.1 — the single
   PREFS.track layout is upgraded into it rather than lost.

   A corrupt ENTRY is skipped, never fatal, and inside a surviving entry a
   corrupt gates array still must not throw away a good shape: that is why
   gates/cones are kept as null here and filled from trackDefaultData()
   one field at a time in trackShapeData(), exactly as before.
   ===================================================================== */
const TRACK_LIB_VERSION = 1;
const TRACK_STOCK_ID = 'stock';

function trackLibNorm(raw){
  const out = {v:TRACK_LIB_VERSION, active:TRACK_STOCK_ID, list:[]};
  const src = (raw && Array.isArray(raw.list)) ? raw.list : [];
  const seen = Object.create(null);
  src.forEach(e=>{
    if(!e || typeof e !== 'object') return;                 // junk entry — skipped
    if(!trackShapeValid(e.shape)) return;                   // no usable shape — skipped
    let id = (typeof e.id === 'string' && e.id && e.id !== TRACK_STOCK_ID) ? e.id : ('t'+(out.list.length+1));
    while(seen[id]) id += 'x';
    seen[id] = 1;
    const nm = (typeof e.name === 'string') ? e.name.trim().slice(0,40) : '';
    out.list.push({
      id, name: nm || ('layout '+(out.list.length+1)),
      shape: e.shape.map(p=>p.slice()),
      gates: trackGatesValid(e.gates) ? e.gates.slice() : null,
      cones: trackConesValid(e.cones) ? e.cones.map(p=>p.slice()) : null
    });
  });
  const want = (raw && typeof raw.active === 'string') ? raw.active : TRACK_STOCK_ID;
  out.active = (want === TRACK_STOCK_ID || out.list.some(e=>e.id===want)) ? want
    : (out.list.length ? out.list[0].id : TRACK_STOCK_ID);
  return out;
}
/* PREFS is loaded at the very top of window 'load' (app/main.js), well
   before anything can call trackBuild() (it only ever runs lazily, off a
   button click or setTrack(true)) — but read it defensively anyway rather
   than assume boot order can never change under us. */
function trackLibLoad(){
  const P = (typeof PREFS !== 'undefined' && PREFS) ? PREFS : null;
  if(!P) return trackLibNorm(null);
  if(P.tracks && typeof P.tracks === 'object') return trackLibNorm(P.tracks);
  /* v1.44.1 and earlier kept exactly one layout in PREFS.track — somebody
     upgrading must find their edited lap still there, as a named one */
  if(P.track && trackShapeValid(P.track.shape)){
    return trackLibNorm({v:TRACK_LIB_VERSION, active:'t1', list:[{
      id:'t1', name:'my track',
      shape:P.track.shape, gates:P.track.gates, cones:P.track.cones}]});
  }
  return trackLibNorm(null);
}
function trackLibEntry(lib, id){
  if(!lib || id === TRACK_STOCK_ID) return null;
  return lib.list.find(e=>e.id===id) || null;
}
/* what the editor's one list shows: the stock lap first, then the saved
   ones, with the active one marked so it is obvious which is on stage */
function trackLibNames(lib){
  const L = lib || trackLibLoad();
  return [{id:TRACK_STOCK_ID, name:'Stock circuit', stock:true, active:L.active===TRACK_STOCK_ID}]
    .concat(L.list.map(e=>({id:e.id, name:e.name, stock:false, active:L.active===e.id})));
}
function trackLibMirror(lib){
  const e = trackLibEntry(lib, lib.active);
  if(!e) return null;
  const d = trackDefaultData();
  return {shape:e.shape.map(p=>p.slice()),
          gates:(e.gates || d.gates).slice(),
          cones:(e.cones || d.cones).map(p=>p.slice())};
}
/* prefsSave() SWALLOWS a quota error (look/prefs.js) — so a layout that
   cannot fit would look saved and be gone on the next reload. Read the
   store back and check, and put PREFS back the way it was if it did not
   land, so what is on screen and what is on disk never disagree. */
function trackLibPersist(lib){
  const wasTracks = PREFS.tracks, wasTrack = PREFS.track;
  PREFS.tracks = lib;
  PREFS.track = trackLibMirror(lib);
  prefsSave();
  let landed = false;
  try{
    const back = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const t = back && back.tracks;
    landed = !!t && t.active === lib.active && Array.isArray(t.list) && t.list.length === lib.list.length;
  }catch(e){ landed = false; }
  if(!landed){
    PREFS.tracks = wasTracks; PREFS.track = wasTrack;
    lg('warn','track builder: could not save — the browser said no room. delete a layout and try again.');
    if(typeof toast === 'function') toast('Could not save the track — no room left in this browser. Delete a layout and try again.', 'err');
  }
  return landed;
}
function trackLibData(d){
  return {
    shape: trackShapeValid(d && d.shape) ? d.shape.map(p=>p.slice()) : trackDefaultData().shape,
    gates: trackGatesValid(d && d.gates) ? d.gates.slice().sort((a,b)=>a-b) : null,
    cones: trackConesValid(d && d.cones) ? d.cones.map(p=>p.slice()) : null
  };
}
/* SAVE AS NEW — the one click. Never touches an existing entry. */
function trackLibAdd(name, d){
  const lib = trackLibLoad();
  let id = 't' + (Date.now().toString(36)) + Math.floor(Math.random()*1e4).toString(36);
  while(lib.list.some(e=>e.id===id)) id += 'x';
  const nm = String(name==null ? '' : name).trim().slice(0,40) || ('layout '+(lib.list.length+1));
  lib.list.push(Object.assign({id, name:nm}, trackLibData(d)));
  lib.active = id;
  const ok = trackLibPersist(lib);
  if(ok) trackRebuild();
  return {ok, id, name:nm};
}
function trackLibUpdate(id, d){
  const lib = trackLibLoad();
  const e = trackLibEntry(lib, id);
  if(!e) return {ok:false};                     // the stock lap, or gone — never overwritten
  Object.assign(e, trackLibData(d));
  lib.active = id;
  const ok = trackLibPersist(lib);
  if(ok) trackRebuild();
  return {ok, id, name:e.name};
}
function trackLibRename(id, name){
  const lib = trackLibLoad();
  const e = trackLibEntry(lib, id);
  if(!e) return {ok:false};
  const nm = String(name==null ? '' : name).trim().slice(0,40);
  if(!nm) return {ok:false};
  e.name = nm;
  return {ok:trackLibPersist(lib), id, name:nm};
}
/* deleting the layout that is ON STAGE must not orphan it: the active id
   falls back to the next saved layout, or to the stock lap */
function trackLibDelete(id){
  const lib = trackLibLoad();
  const at = lib.list.findIndex(e=>e.id===id);
  if(at < 0) return {ok:false, active:lib.active};
  const wasActive = lib.active === id;
  lib.list.splice(at,1);
  if(wasActive) lib.active = lib.list.length ? lib.list[Math.min(at, lib.list.length-1)].id : TRACK_STOCK_ID;
  const ok = trackLibPersist(lib);
  if(ok && wasActive) trackRebuild();
  return {ok, active:lib.active};
}
/* LOAD AN EXISTING TRACK — switches the stage geometry, nothing else */
function trackLibSelect(id){
  const lib = trackLibLoad();
  if(id !== TRACK_STOCK_ID && !trackLibEntry(lib, id)) return {ok:false, active:lib.active};
  lib.active = id;
  const ok = trackLibPersist(lib);
  if(ok) trackRebuild();
  return {ok, active:lib.active};
}
/* back to "no saved layouts at all" — what a fresh browser looks like */
function trackLibReset(){
  PREFS.tracks = null; PREFS.track = null;
  prefsSave();
  return trackLibLoad();
}
function trackShapeData(){
  const def = trackDefaultData();
  const lib = trackLibLoad();
  const e = trackLibEntry(lib, lib.active);
  if(!e) return def;                            // the stock lap
  return {
    shape: trackShapeValid(e.shape) ? e.shape.map(p=>p.slice()) : def.shape,
    gates: trackGatesValid(e.gates) ? e.gates.slice().sort((a,b)=>a-b) : def.gates,
    cones: trackConesValid(e.cones) ? e.cones.map(p=>p.slice()) : def.cones,
    id: e.id, name: e.name
  };
}

function trackCurve(shape){
  const v = (shape || TRACK_SHAPE).map(([x,z])=>new THREE.Vector3(x,0,z));
  return new THREE.CatmullRomCurve3(v, true, 'centripetal', 0.5);
}

/* sample the centreline once — every geometry and the collision test read
   this same table, so nothing can disagree about where the track is.
   track-edit.js calls this with its own working shape so the editor's
   preview is drawn from the EXACT same maths, not a lookalike. */
function trackSample(shape){
  const curve = trackCurve(shape);
  const pts = curve.getSpacedPoints(TRACK_SAMPLES);
  const out = [];
  for(let i=0;i<TRACK_SAMPLES;i++){
    const p = pts[i], q = pts[(i+1)%TRACK_SAMPLES];
    let tx = q.x-p.x, tz = q.z-p.z;
    const tl = Math.hypot(tx,tz), u = tl || 1; tx/=u; tz/=u;
    /* seg/s/k (v1.45.0) join the record rather than being recomputed by
       each caller: every geometry rule above divides by a radius or
       measures a length in metres, and there must be exactly one answer
       to "how long is this lap" (`pts.lap`). */
    out.push({x:p.x, z:p.z, tx, tz, nx:-tz, nz:tx, seg:tl, s:0, k:0});
  }
  let acc = 0;
  for(let i=0;i<TRACK_SAMPLES;i++){ out[i].s = acc; acc += out[i].seg; }
  out.lap = acc;                       // the closed lap length, metres
  const k = trackTurnRate(out);
  for(let i=0;i<TRACK_SAMPLES;i++) out[i].k = k[i];
  return out;
}

/* signed curvature of a closed polyline of {x,z}, 1/metres, one value per
   vertex — positive where the curve turns toward +n (n = (-tz,tx)), so
   trackSqueeze() can ask "is my side the inside of this corner". Measured
   over a ±TRACK_K_SPAN stencil, not one segment: 360 samples of a
   hand-dragged curve are noisy and every rule above divides by this. */
function trackTurnRate(q){
  const N = q.length, k = new Array(N).fill(0);
  if(N < 4) return k;
  const seg = [], tx = [], tz = [];
  for(let i=0;i<N;i++){
    const a = q[i], b = q[(i+1)%N];
    const dx = b.x-a.x, dz = b.z-a.z, L = Math.hypot(dx,dz);
    seg.push(L);
    if(L > 1e-9){ tx.push(dx/L); tz.push(dz/L); }
    else { tx.push(i ? tx[i-1] : 1); tz.push(i ? tz[i-1] : 0); }
  }
  const turn = [];
  for(let i=0;i<N;i++){
    const j = (i+1)%N;
    turn.push(Math.atan2(tx[i]*tz[j]-tz[i]*tx[j], tx[i]*tx[j]+tz[i]*tz[j]));
  }
  const M = Math.min(TRACK_K_SPAN, Math.floor(N/4));
  for(let i=0;i<N;i++){
    let ang = 0, arc = 0;
    for(let m=-M;m<M;m++){
      const j = ((i+m)%N+N)%N;
      ang += turn[j]; arc += seg[j];
    }
    k[i] = arc > 1e-9 ? ang/arc : 0;
  }
  return k;
}

/* how far in the furniture on `side` has to pull at this sample so that
   nothing we place can invert — the SQUEEZE rule above. 1 on a straight
   and on the outside of every corner, which is the whole stock lap bar
   its hairpin. */
function trackSqueeze(p, side){
  const kk = (p && p.k ? p.k : 0) * (side >= 0 ? 1 : -1);
  if(!(kk > 0)) return 1;
  const room = TRACK_FIT / (kk * TRACK_OUTER);
  return room < 1 ? room : 1;
}
/* the two rings the rest of the app asks about by name: the ribbon edge
   and the droid's clamp, at one sample and one side */
function trackHalfAt(p, side){ return TRACK_HALF * trackSqueeze(p, side); }
function trackLimitAt(p, side){ return (TRACK_HALF + TRACK_R2_OUT) * trackSqueeze(p, side); }
/* the curve parameter a gate sits at → its sample index */
function trackSampleIndex(t, N){
  return Math.round(((t % 1 + 1) % 1) * N) % N;
}

/* one layer of furniture's own polyline: the centreline offset by `off`,
   squeezed, with the arc length and curvature OF THAT RING. Pitch and
   piece length are measured here, never on the centreline — that is what
   stops the inside of a hairpin crowding. */
function trackRing(P, side, off){
  const N = P.length, q = [], s = [], f = [], d = [];
  for(let i=0;i<N;i++){
    const p = P[i], sq = trackSqueeze(p, side), dd = off * sq;
    q.push({x:p.x + p.nx*side*dd, z:p.z + p.nz*side*dd});
    f.push(sq); d.push(dd);
  }
  let acc = 0;
  for(let i=0;i<N;i++){
    s.push(acc);
    const a = q[i], b = q[(i+1)%N];
    acc += Math.hypot(b.x-a.x, b.z-a.z);
  }
  return {q, s, f, d, side, total:acc, k:trackTurnRate(q)};
}

/* n evenly spaced pieces along one ring, n from the ring's OWN length:
   a short ring gets fewer pieces rather than the same number overlapping.
   The spacing is therefore known before anything is drawn, so a piece can
   be shortened to fit it — and to what its local radius can carry — and
   dropped outright if even the stub would not fit. Returns the plan;
   trackBuild() turns it into meshes and keeps it on TRACK for the tests. */
function trackPieces(ring, pitch, len, minLen){
  const total = ring.total, N = ring.q.length;
  if(!(total > 0) || N < 2) return [];
  let n = Math.round(total / pitch);
  if(n < 1) n = Math.floor(total / (minLen + TRACK_PIECE_GAP));
  while(n > 1 && total/n - TRACK_PIECE_GAP < minLen) n--;
  if(n < 1) return [];
  const step = total / n;
  /* total/4 is the closed-ring backstop: a straight box longer than that
     on a ring this short would chord across it whatever its radius says */
  const room = Math.min(len, step - TRACK_PIECE_GAP*2, total/4);
  if(room < minLen) return [];
  const out = [];
  let i = 0;
  for(let j=0;j<n;j++){
    const target = j * step;
    while(i < N-1 && ring.s[i+1] <= target) i++;
    const a = ring.q[i], b = ring.q[(i+1)%N];
    const segEnd = (i+1 < N) ? ring.s[i+1] : total;
    const segLen = segEnd - ring.s[i];
    const u = segLen > 1e-9 ? (target - ring.s[i]) / segLen : 0;
    const kk = Math.abs(ring.k[i]);
    const use = Math.min(room, kk > 1e-6 ? TRACK_PIECE_ARC/kk : Infinity);
    if(use < minLen) continue;          // too tight for even a stub — leave it out
    out.push({
      x: a.x + (b.x-a.x)*u, z: a.z + (b.z-a.z)*u,
      ang: Math.atan2(b.x-a.x, b.z-a.z),
      len: use, f: ring.f[i], side: ring.side, i, n:j,
      d: ring.d[i] + (ring.d[(i+1)%N] - ring.d[i])*u
    });
  }
  return out;
}

/* is this piece still standing where it was meant to? The offset is only
   HONEST while no other stretch of centreline is nearer than the offset it
   was drawn at: nearer means the ring has doubled back and the piece is on
   somebody else's road. `lane` additionally requires it to clear the
   droid's clamp — a barrier post inside the racing line is the exact thing
   Mike photographed; kerbs are meant to be inside it. */
function trackPlaced(plan, lane){
  return plan.filter(pc=>{
    const n = trackNearest(pc.x, pc.z);
    if(!n.p) return true;
    /* TRACK_TRIM_TOL, not zero: the piece sits on the ring's CHORD and
       n.dist is measured to the nearest SAMPLE, so an honest offset still
       reads a millimetre or two short. This pass only has to catch the
       grossly swallowed pieces — trackTrim() below is the exact one. */
    if(n.dist < pc.d - TRACK_TRIM_TOL) return false;
    if(lane && n.dist <= trackLimitAt(n.p, n.side >= 0 ? 1 : -1)) return false;
    return true;
  });
}
/* the last gate: whatever the ring said, two pieces that would still touch
   cannot both be drawn. Each piece is a line of discs of its own half
   width, so an end-to-end pair is judged on the gap between their ends and
   a side-by-side pair on the gap between their flanks — one measure, both
   ways round. Greedy in ring order, so the FIRST of a colliding pair
   stays. */
function trackPieceDiscs(pc, w){
  const r = Math.max(0.005, w*pc.f/2);
  const cnt = Math.max(2, Math.min(8, Math.round(pc.len/(2*r))));
  const ux = Math.sin(pc.ang), uz = Math.cos(pc.ang);
  const span = Math.max(0, pc.len/2 - r);
  const out = [];
  for(let i=0;i<cnt;i++){
    const t = (-1 + 2*i/(cnt-1)) * span;
    out.push({x:pc.x + ux*t, z:pc.z + uz*t, r});
  }
  return out;
}
function trackTrim(plan, w){
  const kept = [], discs = [];
  plan.forEach(pc=>{
    const mine = trackPieceDiscs(pc, w);
    const clear = discs.every(other=>mine.every(a=>other.every(b=>
      Math.hypot(a.x-b.x, a.z-b.z) - a.r - b.r >= TRACK_PIECE_GAP)));
    if(clear){ kept.push(pc); discs.push(mine); }
  });
  return kept;
}

/* Track Builder's 2.4 m rule (TRACK_MIN_SPACING) — reads the same sampled
   centreline trackBuild() itself uses, so the editor's warning can never
   disagree with what the barriers actually do. Arc length, not sample
   index, decides what counts as "the same stretch": an odd control-point
   count would otherwise skew an index-based window. WARNS ONLY — nothing
   here stops a build or a save (Mike's call). */
function trackSpacingViolations(shape){
  const pts = trackSample(shape);
  const N = pts.length;
  const total = pts.lap;
  /* v1.45.0 — "the same stretch" has to be a FRACTION of the lap as well
     as a floor in metres. `arc` is min(gap, total-gap), so it can never
     exceed total/2: on any lap under 2×3.6 m every pair was skipped as
     adjacent and this returned an empty set every time. The tiny layouts
     that break worst got no warning at all, and teRedraw() drew a clean
     canvas over them (Mike's small-track report). */
  const adjacentArc = Math.min(total*0.35, Math.max(TRACK_MIN_SPACING*1.5, total*0.05));
  const bad = new Set();
  for(let i=0;i<N;i++){
    for(let j=i+1;j<N;j++){
      const gap = Math.abs(pts[j].s - pts[i].s);
      const arc = Math.min(gap, total-gap);
      if(arc < adjacentArc) continue;              // same stretch/corner, not a violation
      const d = Math.hypot(pts[j].x-pts[i].x, pts[j].z-pts[i].z);
      if(d < TRACK_MIN_SPACING){ bad.add(i); bad.add(j); }
    }
  }
  /* corners tighter than the barrier ring itself: nothing is blocked and
     nothing overlaps any more (the furniture squeezes — see the geometry
     rules), but the lane there will feel tight, so say so */
  const tight = new Set();
  for(let i=0;i<N;i++) if(Math.abs(pts[i].k) * TRACK_OUTER > TRACK_FIT) tight.add(i);
  return {pts, bad, tight};
}

function trackBuild(){
  if(TRACK.built) return;
  const data = trackShapeData();
  TRACK.shape = data.shape; TRACK.gateT = data.gates; TRACK.coneXZ = data.cones;
  TRACK.layout = data.id ? {id:data.id, name:data.name} : {id:TRACK_STOCK_ID, name:'Stock circuit'};
  TRACK.root = new THREE.Group();
  TRACK.pts = trackSample(TRACK.shape);
  const P = TRACK.pts, N = P.length;

  /* ---- surface ribbon — per side, per sample: on the inside of a corner
     tighter than the ribbon is wide the old fixed TRACK_HALF folded the
     road over itself (v1.45.0, see the geometry rules) ---- */
  const pos = [], idx = [], uv = [];
  for(let i=0;i<N;i++){
    const p = P[i], hA = trackHalfAt(p, 1), hB = trackHalfAt(p, -1);
    pos.push(p.x + p.nx*hA, 0.006, p.z + p.nz*hA);
    pos.push(p.x - p.nx*hB, 0.006, p.z - p.nz*hB);
    uv.push(0, i/8, 1, i/8);
  }
  for(let i=0;i<N;i++){
    const a=i*2, b=i*2+1, c=((i+1)%N)*2, d=((i+1)%N)*2+1;
    idx.push(a,c,b, b,c,d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  const surface = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color:0x2b2f36, roughness:.92, metalness:.05, side:THREE.DoubleSide
  }));
  surface.receiveShadow = true;
  TRACK.root.add(surface);

  /* ---- kerbs: alternating red/white blocks along both edges. Placed by
     metres along the kerb ring, not every 3rd sample — see PITCH in the
     geometry rules. scale.x carries the squeeze so the block never grows
     over the road edge it is supposed to sit against. ---- */
  const kerbR = new THREE.MeshStandardMaterial({color:0xc0392b, roughness:.7});
  const kerbW = new THREE.MeshStandardMaterial({color:0xe9edf2, roughness:.7});
  const kerbW0 = 0.16;
  const kerbGeo = new THREE.BoxGeometry(kerbW0, 0.035, TRACK_KERB_LEN);
  /* both edges are planned, then judged TOGETHER — a lap that doubles back
     puts one edge's ring against the other's, not just against itself */
  const kerbPlan = trackTrim(trackPlaced(
    [].concat(trackPieces(trackRing(P,  1, TRACK_HALF+TRACK_KERB_OUT), TRACK_KERB_PITCH, TRACK_KERB_LEN, TRACK_KERB_MIN),
              trackPieces(trackRing(P, -1, TRACK_HALF+TRACK_KERB_OUT), TRACK_KERB_PITCH, TRACK_KERB_LEN, TRACK_KERB_MIN)),
    false), kerbW0);
  kerbPlan.forEach(pc=>{
    const m = new THREE.Mesh(kerbGeo, pc.n%2 ? kerbR : kerbW);
    m.position.set(pc.x, 0.018, pc.z);
    m.rotation.y = pc.ang;
    m.scale.set(pc.f, 1, pc.len/TRACK_KERB_LEN);
    m.receiveShadow = true;
    TRACK.root.add(m);
    TRACK.kerbs.push({x:pc.x, z:pc.z, ang:pc.ang, len:pc.len, side:pc.side});
  });

  /* ---- barriers: posts with a rail, both edges, same plan ---- */
  const postMat = new THREE.MeshStandardMaterial({color:0x39414d, roughness:.6, metalness:.35});
  const railMat = new THREE.MeshStandardMaterial({color:0xf2a63c, roughness:.55, metalness:.2});
  const postGeo = new THREE.CylinderGeometry(0.028,0.034,0.30,8);
  const railW0 = 0.068;                 // the rail box, plus the post it hangs on
  const railGeo = new THREE.BoxGeometry(0.05, 0.09, TRACK_RAIL_LEN);
  const railPlan = trackTrim(trackPlaced(
    [].concat(trackPieces(trackRing(P,  1, TRACK_HALF+TRACK_RAIL_OUT), TRACK_RAIL_PITCH, TRACK_RAIL_LEN, TRACK_RAIL_MIN),
              trackPieces(trackRing(P, -1, TRACK_HALF+TRACK_RAIL_OUT), TRACK_RAIL_PITCH, TRACK_RAIL_LEN, TRACK_RAIL_MIN)),
    true), railW0);
  railPlan.forEach(pc=>{
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(pc.x, 0.15, pc.z);
    post.scale.set(pc.f, 1, pc.f);
    post.castShadow = true;
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(pc.x, 0.24, pc.z);
    rail.rotation.y = pc.ang;
    rail.scale.set(pc.f, 1, pc.len/TRACK_RAIL_LEN);
    rail.castShadow = true;
    TRACK.root.add(post); TRACK.root.add(rail);
    TRACK.barriers.push({x:pc.x, z:pc.z, ang:pc.ang, len:pc.len, side:pc.side, rail, post});
  });

  /* ---- start / finish, chequered — painted ON GATE 0, wherever the
     editor put it. It used to be nailed to P[0] while the lap actually
     closes on gates[0], so the painted line and the timing line could
     disagree by most of a lap (v1.45.0, Mike). ---- */
  TRACK.startI = trackSampleIndex((TRACK.gateT && TRACK.gateT.length) ? TRACK.gateT[0] : 0, N);
  const sf = P[TRACK.startI];
  const sfA = trackHalfAt(sf, 1), sfB = trackHalfAt(sf, -1);
  const sq = Math.min(0.17, (sfA+sfB)/7);
  for(let k=0;k<8;k++){
    const t = -sfB + (k/7)*(sfA+sfB);
    const m = new THREE.Mesh(new THREE.BoxGeometry(sq, 0.006, sq),
      new THREE.MeshStandardMaterial({color: k%2 ? 0x11151a : 0xe9edf2, roughness:.8}));
    m.position.set(sf.x + sf.nx*t, 0.012, sf.z + sf.nz*t);
    m.rotation.y = Math.atan2(sf.tx, sf.tz);
    TRACK.root.add(m);
  }

  /* ---- sector gates, at TRACK.gateT's curve parameters — evenly spaced
     by default (trackDefaultData()), or wherever the editor put them ---- */
  const matOff  = new THREE.MeshStandardMaterial({color:0x2a3542, roughness:.5});
  const matOn   = new THREE.MeshStandardMaterial({color:0x43d9e8, emissive:0x1fb4c4, emissiveIntensity:1.3});
  const matDone = new THREE.MeshStandardMaterial({color:0x37b06b, emissive:0x1d5e3a, emissiveIntensity:0.9});
  TRACK.mats = {off:matOff, on:matOn, done:matDone};
  TRACK.gateT.forEach((t,gi)=>{
    const i = trackSampleIndex(t, N);
    const p = P[i];
    /* squeezed like every other ring, so the masts cannot end up inside
       the racing line — the gate line still spans the whole corridor,
       because the droid's clamp squeezes by the same factor */
    const dA = TRACK_OUTER * trackSqueeze(p, 1), dB = TRACK_OUTER * trackSqueeze(p, -1);
    const A = new THREE.Vector3(p.x + p.nx*dA, 0, p.z + p.nz*dA);
    const B = new THREE.Vector3(p.x - p.nx*dB, 0, p.z - p.nz*dB);
    const lamps = [];
    [A,B].forEach(Q=>{
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.055,10,8), matOff);
      lamp.position.set(Q.x, 0.42, Q.z);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.018,0.40,7), postMat);
      mast.position.set(Q.x, 0.20, Q.z);
      TRACK.root.add(lamp); TRACK.root.add(mast);
      lamps.push(lamp);
    });
    TRACK.gates.push({a:A, b:B, lamps, idx:gi});
  });

  /* ---- cones: Track Builder markers, decorative only — no collision, no
     lap logic. The stock circuit carries none. ---- */
  const coneMat = new THREE.MeshStandardMaterial({color:0xe8862c, roughness:.6, metalness:.05});
  const coneGeo = new THREE.ConeGeometry(0.09, 0.22, 10);
  TRACK.coneXZ.forEach(([cx,cz])=>{
    const m = new THREE.Mesh(coneGeo, coneMat);
    m.position.set(cx, 0.11, cz);
    m.castShadow = true;
    TRACK.root.add(m);
    TRACK.cones.push({x:cx, z:cz, mesh:m});
  });

  scene.add(TRACK.root);
  TRACK.built = true;
}

/* the editor's SAVE calls this — drop the stale geometry so the next
   build picks up trackShapeData()'s new answer instead of no-op'ing on
   TRACK.built. Only rebuilds RIGHT NOW if the circuit is on stage; if it
   is off, TRACK.built is left false and the next setTrack(true) builds
   fresh off the new PREFS.track — trackBuild() itself never rebuilds an
   already-built circuit. */
function trackDispose(){
  if(TRACK.root){
    scene.remove(TRACK.root);
    if(typeof disposeTree === 'function') disposeTree(TRACK.root);
  }
  TRACK.root = null; TRACK.gates = []; TRACK.barriers = []; TRACK.kerbs = []; TRACK.cones = [];
  TRACK.pts = []; TRACK.built = false; TRACK.nearI = null; TRACK.startI = 0;
}
function trackRebuild(){
  if(!TRACK.built) return;              // never built yet — nothing stale to replace
  const wasOn = TRACK.on;
  trackDispose();
  if(wasOn){
    trackBuild();
    TRACK.root.visible = true;
    TRACK.last = null; TRACK.laps = 0; TRACK.times = [];
    trackResetLap();
    trackGrid();
  }
}

function trackResetLap(){
  TRACK.next = 0; TRACK.t0 = 0; TRACK.penalty = 0; TRACK.prev = null; TRACK.off = false;
  TRACK.nearI = null;                   // no lane to remember yet — see trackNearest()
  trackPaintGates();
}
function trackPaintGates(){
  TRACK.gates.forEach((g,i)=>{
    const m = (i===TRACK.next) ? TRACK.mats.on : (i<TRACK.next ? TRACK.mats.done : TRACK.mats.off);
    g.lamps.forEach(l=>{ l.material = m; });
  });
}
/* put the droid on the grid, facing down the straight — a short way BACK
   from the painted line, which is gate 0's sample, so the first thing the
   droid crosses is the line the lap timer is watching. Backed off in
   METRES, not 6 samples: on a 3 m lap 6 samples is 5 cm (v1.45.0). */
function trackGrid(){
  if(!TRACK.pts.length) return;
  const P = TRACK.pts, N = P.length;
  const back = Math.min(0.65, (P.lap || N*0.1)/8);
  const si = TRACK.startI || 0;
  let i = si, walked = 0;
  while(walked < back){
    const j = (i-1+N)%N;
    walked += P[j].seg; i = j;
    if(i === si) break;                 // a lap shorter than the back-off
  }
  const p = P[i];
  R2.pos.x = p.x; R2.pos.z = p.z;
  R2.yaw = Math.atan2(-p.tx, -p.tz);
  if(R2.root){ R2.root.position.set(R2.pos.x, 0, R2.pos.z); R2.root.rotation.y = R2.yaw; }
  TRACK.prev = null; TRACK.nearI = null;
}

/* COMPOSE THE OPENING FRAME (v1.71.1). trackGrid() above puts the droid on
   the grid; this is the half that points the camera at it. A cold-start
   walkthrough turned Track on and got a picture of empty deck: the grid is
   metres away across the hangar and the camera was still wherever the last
   piece of workshop business left it, so the droid was simply off screen —
   with the feet disarmed and a penalty accruing, the first thirty seconds of
   the practice circuit were "cannot see it, cannot move it, losing points".

   v1.70.0 gave sim only the same treatment for the same reason, so this is
   kioskRecentre() (app/kiosk.js) rather than a second opinion about framing:
   frame whatever model is on the stage — the three are wildly different
   sizes — and turn Follow ON, which is what keeps it framed once they do
   start driving. Its Follow lamp bookkeeping comes along for free.

   The one thing added on top is the SNAP. kiosk's droid is at the origin,
   which is where modelFrame()'s preset points; a circuit's start line is
   metres from it, and Follow only lerps 12% a frame — so inherited or not,
   the opening half second would still be a pan across empty floor. driverPos()
   (scene/mouse.js) is the very target updateCamera() lerps toward, so setting
   it here is the same frame arriving on frame one instead of frame thirty. */
function trackFrameStart(){
  if(typeof CAM === 'undefined') return false;
  if(typeof kioskRecentre === 'function') kioskRecentre();
  else CAM.follow = true;
  CAM.target.copy((typeof driverPos === 'function') ? driverPos() : V3(R2.pos.x, 0.6, R2.pos.z));
  return true;
}

function setTrack(on){
  TRACK.on = !!on;
  if(TRACK.on){
    trackBuild();
    TRACK.root.visible = true;
    TRACK.last = null; TRACK.laps = 0; TRACK.times = [];
    trackResetLap();
    trackGrid();
    trackFrameStart();
    /* the circuit is built for the hangar deck — take the droid there */
    if(typeof envSet === 'function' && typeof envGet === 'function' && envGet() === 'studio') envSet('hangar');
    lg('sys','practice circuit ON ('+((TRACK.layout && TRACK.layout.name) || 'Stock circuit')
      +') — arm the feet (START), cross the line and take the gates in order. A barrier costs 2 s.');
    /* warn if the current model is not the droid, but only once per entry */
    if(!TRACK.modelWarned && typeof PREFS !== 'undefined' && PREFS.model && PREFS.model !== 'droid'){
      TRACK.modelWarned = true;
      toast('The practice circuit drives the R2 — put it on the stage (model button, bottom right) to take a lap.');
    }
  }else if(TRACK.built){
    TRACK.root.visible = false;
    TRACK.modelWarned = false;
    lg('sys','practice circuit off');
  }
  const h=$('hudTrack'); if(h) h.style.display = TRACK.on ? '' : 'none';
  const b=$('btnTrack'); if(b) b.classList.toggle('act', TRACK.on);
}

/* 2D segment intersection on the floor plane */
function segCross(p1,p2,p3,p4){
  const d = (p2.x-p1.x)*(p4.z-p3.z) - (p2.z-p1.z)*(p4.x-p3.x);
  if(Math.abs(d) < 1e-12) return false;
  const t = ((p3.x-p1.x)*(p4.z-p3.z) - (p3.z-p1.z)*(p4.x-p3.x)) / d;
  const u = ((p3.x-p1.x)*(p2.z-p1.z) - (p3.z-p1.z)*(p2.x-p1.x)) / d;
  const e = 1e-9;                       // a path ending exactly ON the line still counts
  return t>=-e && t<=1+e && u>=-e && u<=1+e;
}
function trackFmt(ms){
  if(ms===null || ms===undefined) return '—';
  return (ms/1000).toFixed(2)+'s';
}

/* nearest sampled centreline point — index, distance and which side.

   `hint` (v1.45.0) is the sample the caller was last on. With it, the
   search starts in a window around that stretch and only falls back to
   the whole lap when the answer there is further away than
   TRACK_MIN_SPACING — i.e. we really have lost the track. Without it, two
   stretches of a tight layout within 2×(TRACK_HALF+TRACK_R2_OUT) of each
   other made the global search flip lanes mid-corner: the clamp below
   then teleported the droid across the track and charged it +2 s (Mike's
   small-track report). Called with two arguments it is still the plain
   global search, which is what a one-off query wants. */
function trackNearest(x, z, hint){
  const P = TRACK.pts, N = P.length;
  if(!N) return {i:0, dist:Infinity, side:0, p:null};
  const scan = (from, count)=>{
    let best = 0, bd = Infinity;
    for(let c=0;c<count;c++){
      const i = ((from + c) % N + N) % N;
      const dx = x-P[i].x, dz = z-P[i].z;
      const d = dx*dx + dz*dz;
      if(d < bd){ bd = d; best = i; }
    }
    return {i:best, d2:bd};
  };
  let r = null;
  if(Number.isInteger(hint) && hint >= 0 && hint < N){
    const w = Math.max(8, Math.round(N/24));
    const local = scan(hint - w, Math.min(N, w*2+1));
    if(local.d2 <= TRACK_MIN_SPACING*TRACK_MIN_SPACING) r = local;   // still this stretch
  }
  if(!r) r = scan(0, N);
  const p = P[r.i];
  return {i:r.i, dist:Math.sqrt(r.d2), side:(x-p.x)*p.nx + (z-p.z)*p.nz, p};
}

function trackTick(dt){
  if(!TRACK.on || !TRACK.pts.length) return;
  const pos = {x:R2.pos.x, z:R2.pos.z};

  /* ---- barriers: you cannot leave the ribbon. The lane the droid was on
     last frame is the hint (see trackNearest), and the clamp squeezes with
     the ribbon so it can never reach past the inside of a tight corner
     (v1.45.0 — TRACK_HALF+0.16 was a straight line's answer). ---- */
  const near = trackNearest(pos.x, pos.z, TRACK.nearI);
  TRACK.nearI = near.i;
  const side = near.side >= 0 ? 1 : -1;
  const limit = trackLimitAt(near.p, side);
  if(near.dist > limit){
    R2.pos.x = near.p.x + near.p.nx * side * limit;
    R2.pos.z = near.p.z + near.p.nz * side * limit;
    if(R2.root) R2.root.position.set(R2.pos.x, 0, R2.pos.z);
    pos.x = R2.pos.x; pos.z = R2.pos.z;
    /* one penalty per excursion, not one per frame — and NOT BEFORE THE RUN
       HAS BEGUN (v1.71.1). The wall is physical either way and the droid is
       pushed back on above, but the 2 s is a LAP TIME penalty, and until gate
       0 is crossed there is no lap: TRACK.t0 is 0 and the HUD is still asking
       for the line. A beginner's first wobble off the grid was charging them
       for a lap that had not started — the clock read "cross the line" and
       "PEN +2s" at the same time. TRACK.t0 is the run, so it is the gate. */
    if(!TRACK.off){
      TRACK.off = true;
      if(TRACK.t0){ TRACK.penalty += 2000; lg('warn','practice circuit: barrier! +2 s'); }
      else lg('sys','practice circuit: barrier — no charge, the lap has not started yet');
    }
  }else if(near.dist < limit - Math.min(0.10, limit*0.25)){
    /* the hysteresis has to scale too, or a squeezed limit never clears */
    TRACK.off = false;
  }

  if(TRACK.prev){
    const g = TRACK.gates[TRACK.next];
    if(g && segCross(TRACK.prev, pos, g.a, g.b)){
      if(TRACK.next===0){
        if(TRACK.t0){                                     // closing a lap
          const lap = performance.now() - TRACK.t0 + TRACK.penalty;
          TRACK.last = lap; TRACK.laps++;
          TRACK.times.push({n:TRACK.laps, ms:lap, pen:TRACK.penalty});
          const best = PREFS.bestLap;
          if(!best || lap < best){ PREFS.bestLap = Math.round(lap); prefsSave();
            lg('sys','practice circuit: LAP '+TRACK.laps+' '+trackFmt(lap)+' — new best'); }
          else lg('sys','practice circuit: lap '+TRACK.laps+' '+trackFmt(lap)+' (best '+trackFmt(best)+')');
        }
        TRACK.t0 = performance.now(); TRACK.penalty = 0;
      }
      TRACK.next = (TRACK.next+1) % TRACK.gates.length;
      trackPaintGates();
    }
  }
  TRACK.prev = pos;

  TRACK.uiAcc += dt;
  if(TRACK.uiAcc > 0.1){
    TRACK.uiAcc = 0;
    const h = $('hudTrack');
    if(h){
      const run = TRACK.t0 ? (performance.now()-TRACK.t0+TRACK.penalty) : null;
      const recent = TRACK.times.slice(-5).reverse();
      /* THE FEET (v1.71.1). "Holding W does nothing" was a third of the same
         walkthrough. input/pad-ui.js's driveHintCheck() already says this as
         a toast, and this is deliberately NOT a second copy of that voice:
         that one is a MOMENT — it fires on the rising edge of an attempt and
         fades in 3.5 s — and this is a STATE, on the surface the mode already
         put in front of the driver. It is the same sentence's advice half, so
         a person who sees both is told one thing twice, not two things.
         It clears itself the instant the feet are armed, or it is furniture.

         Same yields as that hint, and for its reason: with the Polar Mouse on
         the sticks or puppet mode handing the sketch a centred pad, the feet
         are not what is being driven and arming them would change nothing.
         Kiosk is NOT excluded — sim only hides the pad's hint surface, not
         this one, and START is on the visitor's pad. */
      const disarmed = !FW.isDriveEnabled
        && !(typeof mouseIsDriving === 'function' && mouseIsDriving())
        && !(typeof PUPPET !== 'undefined' && PUPPET.on);
      /* every value sits on a .hudrow PLATE (02-layout.css: shadow + border +
         blur), same as the Drive/Loop rows top-left — bare cyan mono straight
         over a bright deck or desert sand was unreadable */
      h.innerHTML =
        '<div class="hudrow">'
        + '<span class="k">LAP '+(TRACK.laps+1)+'</span><span class="v big">'+ (run!==null ? trackFmt(run) : 'cross the line') +'</span>'
        + '<span class="k">GATE</span><span class="v">'+ (TRACK.next+1) +'/'+ TRACK.gates.length +'</span>'
        + '<span class="k">BEST</span><span class="v am">'+ trackFmt(PREFS.bestLap||null) +'</span>'
        + (TRACK.penalty ? '<span class="k">PEN</span><span class="v rd">+'+(TRACK.penalty/1000)+'s</span>' : '')
        + '</div>'
        + (disarmed ? '<div class="hudrow"><span class="k">FEET</span>'
            + '<span class="v am">disarmed — hold Enter (Start) to arm</span></div>' : '')
        + (recent.length ? '<div class="hudrow"><div class="laplist">' + recent.map(l=>
            '<span class="lapn">lap '+l.n+'</span><span class="lapt'
            + (PREFS.bestLap && Math.round(l.ms)<=PREFS.bestLap ? ' best' : '') + '">'
            + trackFmt(l.ms) + '</span><span class="lappen">'
            + (l.pen ? '+'+(l.pen/1000)+'s' : '') + '</span>'
          ).join('') + '</div></div>' : '');
    }
  }
}
