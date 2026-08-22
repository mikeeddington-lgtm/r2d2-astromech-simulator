'use strict';
/* =====================================================================
   MODEL BUILDER — the fourth stage model, and the only one you make
   yourself (v1.41.0, phase 1)

   The droid, the Anzellan head and the Polar Mouse are all fixed rigs —
   geometry someone measured or modelled once and the sim drives forever.
   This is the opposite: a small parts bin (beam, plate, disc, hinge,
   ball joint) and a base plate, and whatever you snap together out of
   them IS the model. It follows the same one-model-at-a-time seam as
   the other three (scene/models.js) and the same "a second animatronic,
   built the same way the droid is" precedent as the Anzellan head
   (scene/anzellan.js) — its own channels, registered only while it is
   on stage, driven purely by reading ACT.

   NAMING TRAP, so nobody reintroduces it: `maestro/builder.js` (the
   "Build your Maestro" overlay) already owns the global `BLD` and every
   `bld*` top-level name. This file is a SEPARATE feature that happens to
   share the word "builder" — everything here is `MB` / `mb*` instead,
   on purpose, so the two scripts can never collide at parse time. The
   servo/ACT channel ids this file registers are still literally
   `bldJ<n>` / `bldJ<n>t`, per the spec that named them — those are
   plain strings living as ACT/ACT_T object keys, not identifiers, so
   they carry none of that risk.

   MIKE'S LOCKED DECISIONS (2026-08-15):
     · 50 mm fixed grid — every part's position snaps to it, no other
       grid size is offered.
     · ~8 parts is the soft target for one mechanism; 12 is the hard cap.
     · a joint can own TWO channels (a ball = pan + tilt), same as the
       Anzellan eye gimbal.
     · forward kinematics ONLY, through the THREE scene graph itself —
       a part snapped onto another becomes its CHILD, so rotating a
       hinge carries its whole subtree with it. No solver, ever.
     · face parts are PHASE 2 and are not built here — but the part
       record (`type`, and the geometry/pivot MB_BUILDERS dispatches
       through) is shaped so a rigged sub-assembly can become a sixth
       bin entry later without changing anything above it.

   WHAT v1.45.0 ADDED, and the one rule that runs through all of it:
     · a repair pass — the Outputs table is rebuilt on every change to the
       key set (mbSyncOutputs), the rebuild does its own ACT bookkeeping and
       saves its result, foreign channel ids and duplicate ids are refused,
       and an attached part is snapped back onto the grid.
     · plural ATTACH POINTS per part (mbSocket/mbAttachPoint), drag and drop
       on the stage with a conservative auto-connect (mbDragBegin…mbDragDrop,
       mbUndoAttach), a DRIVEN centre pivot for the plate (mbBuildPlate),
       preview sliders in the pane, and the model as a file of its own
       (mbExportModel/mbImportModelText) with a schema version on the record.
     · nothing outside this file names a joint TYPE any more: mbJointCount()
       asks what a type claims, mbRecDriven() asks whether a record is
       actually driven, and phase 2's rigged part will be driven, named,
       counted and offered channels by adding one MB_PRIM entry and one
       MB_BUILDERS entry — builder.test.js proves that with a stand-in type.

   FRAME. Local metres, Y up, matching everything else on the stage. The
   base plate sits at the world origin with its TOP FACE at y = 0 — new
   parts land on that surface, on the grid.
   ===================================================================== */

const MB_GRID = 0.05;                 // 50 mm — Mike's fixed grid unit
const MB_SOFT_CAP = 8;
const MB_HARD_CAP = 12;
const MB_HINGE_TRAVEL = 60;           // degrees, ± about the channel's 0.5 home
const MB_PLATE_SPIN = 90;             // degrees — the driven centre pivot's half-sweep (v1.45.0)
const MB_BALL_PAN = 30;               // degrees
const MB_BALL_TILT = 25;              // degrees
/* how close a DROPPED part has to land to a socket before the drop counts as
   "onto that". Three quarters of a cell: a part dropped in the same cell as a
   socket attaches, a part nudged into the NEXT cell (a full 50 mm away) never
   does, so a nudge cannot reparent by accident. */
const MB_SNAP = MB_GRID * 0.75;
const MB_DRAG_PX = 6;                 // the same click-vs-drag threshold mbInitPick() already used
const MB_FORMAT = 'r2sim-model';      // the marker on an exported model file
const MB_DEG2RAD = Math.PI / 180;
/* the saved-record shape's own version, so a later change to it has a
   migration handle — PREFS.builder had none (contrast SETUP_VERSION in
   app/setup-io.js). v1 = anything saved before v1.45.0. */
const MB_SCHEMA = 2;

/* the parts bin. `joint` counts the channels a primitive of this type
   claims — absent for the rigid ones — and `chan` names them in the
   properties card. PHASE 2's rigged sub-assemblies are meant to add another
   key here (their own builder in MB_BUILDERS below) without anything else in
   this file changing; mbJointCount()/mbRecDriven() are what make that true
   now that nothing downstream names hinge or ball.

   v1.45.0, Mike: "support centre pivoting, such as for plates". The plate
   becomes a DRIVEN type — a turntable on its own centre — because its mesh
   was already centred on the group origin and the only thing missing was a
   pivot a channel could turn. A plate saved before this version has no
   channels, so it goes on loading as the rigid part it was: see
   mbRecDriven(). The rigid flat parts in the bin are the beam and the disc. */
const MB_PRIM = {
  beam:  {label:'Beam'},
  plate: {label:'Plate',      joint:1, chan:['Spin']},
  disc:  {label:'Disc'},
  hinge: {label:'Hinge',      joint:1, chan:['Joint']},
  ball:  {label:'Ball joint', joint:2, chan:['Pan','Tilt']}
};
const MB_PRIM_ORDER = ['beam','plate','disc','hinge','ball'];
/* IS THIS A TYPE THIS BUILD HAS? (v1.46.0)
   `MB_PRIM[type]` was the test everywhere, and MB_PRIM is a plain object
   literal — so `MB_PRIM['constructor']` is Object, `MB_PRIM['toString']` is a
   function, and a saved record naming any Object.prototype key validated as a
   real part. mbBuildGeometry then dispatched through the same hole
   (`MB_BUILDERS['constructor']` → Object), handed back something with no
   `.group`, and mbRealize threw on it — inside the one function whose docblock
   says it MUST NEVER THROW, after the live assembly had already been torn
   down. An own-property test is the whole fix, and every "is this a type"
   question in this file goes through here so there is one place to get it
   right. mbJointCount/mbTypeLabel read MB_PRIM[type] AFTER this has said yes,
   or fall through harmlessly on their own `|| 0` / `|| type`. */
function mbPrimHas(type){
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(MB_PRIM, type);
}

/* ------------------------------------------------------------- runtime */
const MB = {
  root: new THREE.Group(),   // world-anchored, exactly like ANZ.root
  base: null,                // {id:'base', group, attachPoint, mesh}
  parts: [],                 // live part records — see mbAddPart()
  shown: false, built: false,
  sel: null, selHelper: null,
  nextId: 1, nextJoint: 1,
  drag: null,                // a part being dragged on the stage — mbDragBegin()
  undo: null,                // one step back for the drop's auto-connect — mbUndoAttach()
  saveWarn: false            // the storage receipt is once per session — mbSaveState()
};

/* ------------------------------------------------------------ materials
   Same sRGB-conversion trap as anzellan.js / mouse.js: this renderer
   predates ColorManagement, so a hex handed to a material is read as
   LINEAR unless converted once at build time. */
function mbHue(hex){
  const c = new THREE.Color(hex);
  return c.convertSRGBToLinear ? c.convertSRGBToLinear() : c;
}
const MB_MAT = {
  part:  new THREE.MeshStandardMaterial({color:mbHue(0x6fa8dc), roughness:0.55, metalness:0.12}),
  base:  new THREE.MeshStandardMaterial({color:mbHue(0x3c4148), roughness:0.85, metalness:0.05}),
  joint: new THREE.MeshStandardMaterial({color:mbHue(0x9199a1), roughness:0.50, metalness:0.35}),
  flag:  new THREE.MeshStandardMaterial({color:mbHue(0xf2a63c), roughness:0.40, metalness:0.20})
};
function mbMesh(geo, mat){
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ---------------------------------------------------------------- geometry
   Every builder returns {group, attachPoint, sockets[, panPivot]}. `group` is
   the part's own placement frame — position/rotation from the properties card
   land on it directly. `attachPoint` is where a CHILD part parents to by
   default: for a rigid primitive that is `group` itself; for a joint it is
   the innermost pivot, so a child snapped onto a hinge, a ball or a spin
   plate rides the joint's own rotation — that IS the forward-kinematics rule,
   expressed as "which THREE node do I add(this) to".

   PLURAL ATTACH POINTS (v1.45.0, for Mike's "sensible auto-connections"):
   one attach point per part is enough when a dropdown names the PART, but
   "nearest compatible" needs somewhere to be nearest TO. So each primitive
   now describes its SOCKETS — {id, node, label} — and mbAttachPoint(id,
   socket), the single indirection every caller already went through, takes
   one. Socket 0 is the default and is deliberately the same node
   `attachPoint` was before, so every older call site and every saved record
   keeps its old meaning. The sockets are empty Groups, not meshes: they cost
   nothing to draw and they give a child a sensible LOCAL origin (drop a part
   on a beam's end and it sits at that end, at local 0,0,0). */
function mbSocket(id, node, label){ return {id, node, label}; }
function mbPointOn(parent, x, y, z){
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function mbBuildBase(){
  const group = new THREE.Group();
  const mesh = mbMesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), MB_MAT.base);
  mesh.position.y = -0.01;             // top face sits at y = 0
  mesh.castShadow = false;
  group.add(mesh);
  return {id:'base', type:'base', group, attachPoint:group, mesh,
          sockets:[mbSocket('top', group, 'base plate')]};
}
function mbBuildSimple(type){
  const group = new THREE.Group();
  let geo, sockets;
  if(type === 'beam'){
    geo = new THREE.BoxGeometry(0.05, 0.05, 0.25);
    sockets = [mbSocket('body', group, 'middle'),
               mbSocket('end1', mbPointOn(group, 0, 0,  0.125), 'far end'),
               mbSocket('end2', mbPointOn(group, 0, 0, -0.125), 'near end')];
  }else if(type === 'plate'){
    geo = new THREE.BoxGeometry(0.15, 0.01, 0.15);       // kept for any non-joint use
    sockets = [mbSocket('body', group, 'face')];
  }else{
    geo = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 24);   // disc — r 0.05 washer
    sockets = [mbSocket('body', group, 'face')];
  }
  group.add(mbMesh(geo, MB_MAT.part));
  return {group, attachPoint:group, sockets};
}
/* 1-DOF: a static base block, and a flag on a pivot that a channel drives.
   The AXIS choice (x/y/z) decides which local axis of that same pivot the
   channel turns — the geometry itself does not change with the choice,
   which is a deliberate phase-1 simplification. */
function mbBuildHinge(){
  const group = new THREE.Group();
  group.add(mbMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), MB_MAT.joint));
  const flagPivot = new THREE.Group();
  group.add(flagPivot);
  const flag = mbMesh(new THREE.BoxGeometry(0.10, 0.01, 0.05), MB_MAT.flag);
  flag.position.set(0.05, 0, 0);       // the paddle extends out from the pivot
  flagPivot.add(flag);
  return {group, attachPoint:flagPivot, sockets:[
    mbSocket('flag', flagPivot, 'flag'),
    mbSocket('tip',  mbPointOn(flagPivot, 0.10, 0, 0), 'flag tip'),
    mbSocket('body', group, 'body (does not move)')
  ]};
}
/* 1-DOF, driven CENTRE pivot — Mike's "centre pivoting, such as for plates"
   (v1.45.0). Mirrors mbBuildHinge exactly: a static collar that carries the
   part's placement, then a pivot the channel turns, with the plate riding it.
   The plate mesh is centred on that pivot's origin, so it spins about its own
   middle and its centre never travels. */
function mbBuildPlate(){
  const group = new THREE.Group();
  const collar = mbMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), MB_MAT.joint);
  collar.position.y = -0.009;          // under the plate, so the plate reads as the moving part
  group.add(collar);
  const spinPivot = new THREE.Group();
  group.add(spinPivot);
  spinPivot.add(mbMesh(new THREE.BoxGeometry(0.15, 0.01, 0.15), MB_MAT.part));
  const mark = mbMesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), MB_MAT.flag);
  mark.position.set(0.055, 0.001, 0);  // so you can SEE which way it is pointing
  spinPivot.add(mark);
  return {group, attachPoint:spinPivot, sockets:[
    mbSocket('spin', spinPivot, 'turntable'),
    mbSocket('edge', mbPointOn(spinPivot, 0.05, 0.005, 0), 'plate edge'),
    mbSocket('body', group, 'collar (does not move)')
  ]};
}
/* 2-DOF: pan on the outer pivot, tilt on the inner one — same rig shape as
   ANZ.eye's gimbal in scene/anzellan.js. attachPoint is the INNER (tilt)
   pivot, so a child rides both rotations. */
function mbBuildBall(){
  const group = new THREE.Group();
  group.add(mbMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), MB_MAT.joint));
  const panPivot = new THREE.Group();
  group.add(panPivot);
  const tiltPivot = new THREE.Group();
  panPivot.add(tiltPivot);
  tiltPivot.add(mbMesh(new THREE.SphereGeometry(0.022, 16, 12), MB_MAT.flag));
  const pointer = mbMesh(new THREE.BoxGeometry(0.010, 0.010, 0.060), MB_MAT.flag);
  pointer.position.set(0, 0, 0.030);
  tiltPivot.add(pointer);
  return {group, attachPoint:tiltPivot, panPivot, sockets:[
    mbSocket('tilt', tiltPivot, 'pointer'),
    mbSocket('tip',  mbPointOn(tiltPivot, 0, 0, 0.060), 'pointer tip'),
    mbSocket('body', group, 'body (does not move)')
  ]};
}
/* the dispatch table PHASE 2's rigged sub-assemblies are meant to extend */
const MB_BUILDERS = {beam:mbBuildSimple, plate:mbBuildPlate, disc:mbBuildSimple, hinge:mbBuildHinge, ball:mbBuildBall};
function mbBuildGeometry(type){
  /* own-property, for the same reason mbPrimHas() exists: `MB_BUILDERS` is a
     plain object literal too, so `MB_BUILDERS['constructor']` was Object and
     `MB_BUILDERS['toString']` a function — both of which return something
     that is not a part. A type this file does not build falls back to the
     simple primitive, which is what the `||` always meant. */
  const fn = Object.prototype.hasOwnProperty.call(MB_BUILDERS, type) ? MB_BUILDERS[type] : mbBuildSimple;
  return fn(type);
}

/* ------------------------------------------------------------ bookkeeping */
function mbFind(id){
  if(!id) return null;
  if(id === 'base') return MB.base;
  return MB.parts.find(p => p.id === id) || null;
}
/* WHICH NODE a child parents to. `socket` is optional and always has been:
   omit it and you get the part's default (driven) attach point, exactly as
   before v1.45.0; name one that does not exist and you get the same, because
   a saved file or a stale dropdown must never be able to leave a part
   unparented. mbSocketId() is the matching "what did I actually get", so the
   record saves the socket it is really on rather than the one it asked for. */
function mbAttachPoint(id, socket){
  const rec = mbFind(id);
  if(!rec) return MB.base && MB.base.attachPoint;
  if(socket && rec.sockets){
    const s = rec.sockets.find(x => x.id === socket);
    if(s && s.node) return s.node;
  }
  return rec.attachPoint || (MB.base && MB.base.attachPoint);
}
function mbSocketId(id, socket){
  const rec = mbFind(id);
  if(!rec || !rec.sockets || !rec.sockets.length) return '';
  const s = socket && rec.sockets.find(x => x.id === socket);
  return s ? s.id : rec.sockets[0].id;
}
/* every id that (directly or transitively) hangs off `id` — the ATTACH TO
   dropdown must never offer one of these, or the scene graph loops */
function mbDescendants(id){
  const out = new Set();
  let changed = true;
  while(changed){
    changed = false;
    for(const p of MB.parts){
      if(out.has(p.id)) continue;
      if(p.parent === id || out.has(p.parent)){ out.add(p.id); changed = true; }
    }
  }
  return out;
}
function mbTypeLabel(type){ return (MB_PRIM[type] && MB_PRIM[type].label) || type; }
/* THE GENERAL TEST for "is this a joint" (v1.45.0). Four places used to
   hardcode `type==='hinge' || type==='ball'` — mbApplyJoint,
   applyModelBuilder, builderActLabel and three spots in cad/ui.js — which is
   exactly the kind of list that leaves a NEW joint type behind: the spin
   plate below, and phase 2's rigged face part after it. MB_PRIM[type].joint
   is how many channels a TYPE claims; mbRecDriven() is whether a RECORD is
   actually driven, which needs the channels to be there as well. The two are
   not the same question, and the difference is what lets a `plate` saved by
   v1.44.1 — when the type was rigid, so the record has no channels — go on
   loading as the rigid part its owner saved. */
function mbJointCount(type){ return (MB_PRIM[type] && MB_PRIM[type].joint) || 0; }
function mbRecDriven(rec){
  return !!(rec && mbJointCount(rec.type) && rec.channels && rec.channels.length);
}
function mbPartLabel(rec){
  if(!rec) return '';
  if(rec.id === 'base') return 'Base plate';
  if(rec.name) return rec.name;
  const idx = MB.parts.filter(p => p.type === rec.type).indexOf(rec) + 1;
  return mbTypeLabel(rec.type) + ' ' + idx;
}

function mbDisposeGroup(group){
  if(!group) return;
  group.traverse(o => { if(o.isMesh && o.geometry) o.geometry.dispose(); });
}
/* the selection outline, freed rather than dropped (v1.46.0). MB.selHelper was
   simply overwritten on the next click, and a BoxHelper owns a BufferGeometry
   AND a LineBasicMaterial of its own — 200 clicks round a mechanism made 200
   of each and freed none, on the one model in the app the user sits and
   fiddles with for an hour. Both call sites that drop it come through here.
   (Keeping ONE helper and setFromObject()ing it would work too, but a helper
   is built around the object it wraps, so it would have to be rebuilt on every
   change of selection anyway.) */
function mbDropSelHelper(){
  const h = MB.selHelper;
  MB.selHelper = null;
  if(!h) return;
  if(MB.root) MB.root.remove(h);
  if(h.geometry && h.geometry.dispose) h.geometry.dispose();
  if(h.material && h.material.dispose) h.material.dispose();
}

/* place `rec.group`, tag it, and park it under the base plate — callers
   that want a different parent reparent afterward (mbReparent). Always
   starting under base means a part is never, even briefly, unparented.

   RETURNS whether the part was realized (v1.46.0). mbPrimHas() closes the
   one hole that could get a typeless record this far, but this is the last
   place a part becomes real and mbRebuildFromPrefs — its main caller — MUST
   NEVER THROW, so a builder that hands back something with no `.group`
   loses its record here, loudly, instead of throwing halfway through
   posing it and leaving the assembly it had already torn down in pieces. */
function mbRealize(rec){
  const built = mbBuildGeometry(rec.type);
  if(!built || !built.group){
    if(typeof lg === 'function')
      lg('warn', 'Model Builder: no geometry for part type "'+rec.type+'" — "'+rec.id+'" was dropped');
    return false;
  }
  rec.group = built.group;
  rec.attachPoint = built.attachPoint;
  /* the sockets live on the RECORD, so mbAttachPoint(id, socket) — and the
     drop test that goes looking for the nearest one — never has to know which
     builder made the part (v1.45.0) */
  rec.sockets = (built.sockets && built.sockets.length)
    ? built.sockets
    : [mbSocket('body', built.attachPoint || built.group, 'body')];
  if(built.panPivot) rec.panPivot = built.panPivot;
  rec.group.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
  rec.group.rotation.set(rec.rot.x * MB_DEG2RAD, rec.rot.y * MB_DEG2RAD, rec.rot.z * MB_DEG2RAD);
  rec.group.userData.mbId = rec.id;
  MB.base.attachPoint.add(rec.group);
  return true;
}
/* reparent onto `parentId`. `preserveWorld` uses THREE's own .attach() —
   the world pose stays exactly where it was and the LOCAL pos/rot are
   whatever falls out (the "transforms preserved" the spec asks for).
   Without it, the SAVED local pos/rot are re-applied instead — that is
   the rebuild-from-prefs path, which wants the numbers it saved back
   verbatim, not a recomputation. */
function mbReparent(rec, parentId, preserveWorld, socket){
  const target = mbAttachPoint(parentId, socket);
  if(!target) return;
  if(preserveWorld && typeof target.attach === 'function'){
    /* the world matrices .attach() reads are only current if a frame has
       drawn — under ?norender nothing draws, so refresh them here rather than
       assume it (the same rule the suites follow) */
    if(MB.root) MB.root.updateMatrixWorld(true);
    target.attach(rec.group);
    mbSyncRecTransform(rec);
  }else{
    if(rec.group.parent) rec.group.parent.remove(rec.group);
    target.add(rec.group);
    rec.group.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
    rec.group.rotation.set(rec.rot.x * MB_DEG2RAD, rec.rot.y * MB_DEG2RAD, rec.rot.z * MB_DEG2RAD);
  }
  rec.parent = parentId;
  rec.socket = mbSocketId(parentId, socket);
}
/* Read the live node back into the record AND write the quantised answer back
   to the node, so the two can never disagree.
   v1.45.0 — this used to round the ROTATION to whole degrees and leave the
   node holding the unrounded one, and not quantise the POSITION at all. Two
   consequences, both after a mbSetAttach() (which preserves the world pose,
   so the local numbers that fall out are arbitrary): the part visibly snapped
   by up to 0.5° per axis at the next rebuild-from-prefs, because that is when
   the record's rounded numbers were finally applied; and "everything is on
   the 50 mm grid" — Mike's first locked decision — silently held only for
   parts that had never been attached to anything. Snapping here means the one
   small movement happens once, in front of the user, at the moment they
   attached the part. */
function mbSyncRecTransform(rec){
  const q = v => Math.round(v / MB_GRID) * MB_GRID;
  rec.pos = {x:q(rec.group.position.x), y:q(rec.group.position.y), z:q(rec.group.position.z)};
  rec.rot = {
    x: Math.round(rec.group.rotation.x / MB_DEG2RAD),
    y: Math.round(rec.group.rotation.y / MB_DEG2RAD),
    z: Math.round(rec.group.rotation.z / MB_DEG2RAD)
  };
  rec.group.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
  rec.group.rotation.set(rec.rot.x * MB_DEG2RAD, rec.rot.y * MB_DEG2RAD, rec.rot.z * MB_DEG2RAD);
}

/* next free (x,z) grid cell on the base plate, spiralling out from the
   centre — good enough for a ~12-part bin */
function mbCellKey(x, z){ return Math.round(x / MB_GRID) + ',' + Math.round(z / MB_GRID); }
function mbNextCell(){
  const used = new Set(MB.parts.filter(p => p.parent === 'base').map(p => mbCellKey(p.pos.x, p.pos.z)));
  for(let radius = 0; radius < 30; radius++){
    for(let gx = -radius; gx <= radius; gx++){
      for(let gz = -radius; gz <= radius; gz++){
        if(Math.max(Math.abs(gx), Math.abs(gz)) !== radius) continue;
        const key = gx + ',' + gz;
        if(!used.has(key)) return {x:gx * MB_GRID, y:MB_GRID, z:gz * MB_GRID};
      }
    }
  }
  return {x:0, y:MB_GRID, z:0};
}

/* ============================================================= build once */
function buildModelBuilder(){
  if(MB.built) return MB.root;
  MB.base = mbBuildBase();
  MB.root.add(MB.base.group);
  MB.root.visible = false;
  MB.built = true;
  /* MOUSE.root adds itself to the scene the same way, from inside its own
     build function — see scene/mouse.js buildMouse(). Doing it here means
     scene/scene.js never has to know this model exists. */
  if(typeof scene !== 'undefined') scene.add(MB.root);
  return MB.root;
}

/* ===================================================== actuators (ACT)
   Exactly the ANZ_ACTS register/unregister rule (scene/anzellan.js): a
   channel only exists in ACT/ACT_T while its part is on a mechanism that
   is ON STAGE. Unlike the fixed ANZ_ACTS list, the set here is dynamic —
   it is whatever joints the builder currently has — so registration is
   per PART, not a fixed table walked once. */
/* IDEMPOTENT on purpose (v1.45.0): registration now happens from more than
   one place — the show edge, a rebuild from prefs, a model-file import — and
   re-registering a channel that already exists must not yank it back to its
   0.5 home under a preview slider or a running sequence. "Does this key
   exist in ACT" is the whole state; setting it twice is a no-op. */
function mbRegisterPart(rec){
  if(!rec.channels || !rec.channels.length) return;
  rec.channels.forEach(k => {
    if(ACT[k] === undefined) ACT[k] = 0.5;
    if(ACT_T[k] === undefined) ACT_T[k] = 0.5;
  });
}
function mbUnregisterPart(rec){
  if(!rec.channels) return;
  rec.channels.forEach(k => { delete ACT[k]; delete ACT_T[k]; });
}
function mbRegisterAll(){ MB.parts.forEach(mbRegisterPart); }
function mbUnregisterAll(){ MB.parts.forEach(mbUnregisterPart); }
function mbIsAct(k){ return /^bldJ\d+t?$/.test(k || ''); }

/* THE ONE THING THAT MADE THE BUILDER "BROKEN" (v1.45.0, Mike)
   app/panels.js builds OUTROWS.act ONCE from Object.keys(ACT), and
   updateOutputs() then reads ACT[r.key].toFixed(2) about sixteen times a
   second from the frame loop (app/main.js). So a bldJ channel that leaves
   ACT while a row still points at it does not degrade — it throws
   "Cannot read properties of undefined" on the very next frame and takes
   the whole loop down with it. mbSetShown() always remembered to rebuild the
   table; mbAddPart(), mbDeletePart() and mbRebuildFromPrefs() did not. Every
   one of them goes through here now, so the rule lives in one place. */
function mbSyncOutputs(){
  if(typeof buildOutputs === 'function') buildOutputs();
}

/* ---------------------------------------------------------- persistence
   PREFS.builder = {v, parts:[{id,type,pos,rot,parent,socket,axis,channels,name,jointN}]}
   Saved on every edit — mirrors how PARTS/PAINT/etc. write straight
   through prefsSave() rather than batching.

   `v` is new in v1.45.0 and exists for the same reason SETUP_VERSION does
   (app/setup-io.js): the record shape had no version at all, so a future
   change to it would have had nothing to hang a migration off. v1 is
   "everything saved before v1.45.0" — no `socket`, and a `plate` that was
   still a rigid primitive; see mbRecDriven() for how that one keeps
   loading as the rigid part it was saved as. */
function mbSaveState(){
  if(typeof PREFS === 'undefined') return;
  PREFS.builder = {
    v: MB_SCHEMA,
    parts: MB.parts.map(p => ({
      id:p.id, type:p.type, name:p.name || '',
      pos:{x:p.pos.x, y:p.pos.y, z:p.pos.z},
      rot:{x:p.rot.x, y:p.rot.y, z:p.rot.z},
      parent:p.parent, socket:p.socket || '', axis:p.axis,
      channels:(p.channels || []).slice(), jointN:p.jointN
    }))
  };
  if(typeof prefsSave !== 'function') return;
  prefsSave();
  /* A RECEIPT, because prefsSave() cannot give one (v1.45.0). Its whole body
     is `try{ localStorage.setItem(...) }catch(e){}` (look/prefs.js) — a full
     or blocked quota is swallowed, and for the one model on the stage that
     the user MADE themselves that is the worst silence in the app: you keep
     building, nothing complains, and the next reload has none of it. So read
     the write back and say so. Once per session: a quota does not un-fill
     itself, and a toast per stepper click would be its own fault. */
  if(mbStateStored() || MB.saveWarn) return;
  MB.saveWarn = true;
  if(typeof lg === 'function') lg('warn', 'Model Builder: the build could not be saved — browser storage is full or blocked');
  if(typeof toast === 'function') toast('could not save the build — browser storage is full', 'err');
}
function mbStateStored(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return !!(o && o.builder && Array.isArray(o.builder.parts) && o.builder.parts.length === MB.parts.length);
  }catch(e){ return false; }
}
/* per-record validation for the restore path below — same field-by-field
   spirit as app/track.js's trackShapeData() applies to PREFS.track, just
   per RECORD instead of per field: one bad joint must never take the rest
   of a saved assembly down with it, and a hand-edited or foreign setup
   .json is exactly the input this has to survive without throwing. */
function mbVec3Valid(v){
  return !!v && typeof v === 'object' &&
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
/* v1.45.0 — the block above promises a hand-edited or foreign .json is
   exactly the input this survives, and it was only half true: `channels` was
   checked for being an Array and never for what was IN it, and `axis` was not
   checked at all.
     · channels:['doorL','pie0'] used to sail through — mbRegisterPart() then
       overwrote the DROID's own doorL/pie0 with 0.5, and the next model
       switch DELETED them, so the droid lost its doors and its pie panels
       until a reload. Only this file's own bldJ<n>[t] ids may be claimed.
     · axis:'q' wrote a stray property on a THREE.Euler and the hinge then
       silently never moved.
   Both refuse the RECORD, one at a time, named in its own warn — the same
   "one bad joint must never take the rest of the assembly down" rule the
   missing-pos case already followed. A guessed correction would be worse:
   there is no honest way to know which channel a foreign record meant. */
function mbAxisValid(a){
  return a === undefined || a === null || ['x','y','z'].indexOf(a) >= 0;
}
function mbChannelsValid(ch){
  if(ch === undefined || ch === null) return true;
  if(!Array.isArray(ch)) return false;
  return ch.every(k => typeof k === 'string' && mbIsAct(k));
}
function mbSavedPartValid(sp){
  return !!sp && typeof sp.id === 'string' && !!sp.id && mbPrimHas(sp.type) &&
    mbVec3Valid(sp.pos) && mbVec3Valid(sp.rot) &&
    mbChannelsValid(sp.channels) && mbAxisValid(sp.axis) &&
    (sp.socket === undefined || sp.socket === null || typeof sp.socket === 'string');
}
/* WHY a record was refused, in the words the reader needs (v1.46.0). "Skipped
   a corrupt part record" was the answer to every refusal, and for by far the
   commonest one it was simply untrue: a record naming a type this build has
   never had — the shipped examples/R2-model-simple-face.json is six of them,
   all phase 2's — is not corrupt, it is a part this sim cannot make, and the
   only useful thing to say about it is WHICH type. The import refusal
   (mbImportModelText) and the restore warning both read from here, so the two
   can never describe the same record differently. */
function mbSavedPartWhy(sp){
  const who = (sp && typeof sp.id === 'string' && sp.id) ? ' ("'+sp.id+'")' : '';
  if(!sp || typeof sp !== 'object' || typeof sp.id !== 'string' || !sp.id)
    return 'skipped a corrupt part record';
  if(!mbPrimHas(sp.type))
    return 'skipped'+who+' — this build has no part type "'+mbTypeName(sp.type)+'"';
  return 'skipped a corrupt part record'+who;
}
/* a foreign record's `type` may be any JSON value at all, and it goes into a
   message — so name it without pretending it was a string */
function mbTypeName(type){
  if(typeof type === 'string') return type;
  return (type === undefined) ? '(none)' : String(type);
}
/* tear down every live part and rebuild the whole assembly from
   PREFS.builder — called once per show (mbSetShown) and once after a
   setup .json import (app/setup-io.js), so "on load and on model
   switch" both go through the one path. MUST NEVER THROW and must never
   leave the graph with a detached cycle — this is reading a JSON file
   that a person, not just this file's own mbSaveState(), may have
   written. */
function mbRebuildFromPrefs(){
  buildModelBuilder();
  mbDropSelHelper();
  /* ACT BOOKKEEPING, both halves (v1.45.0). This used to do none, which was
     survivable only on the one call site that sandwiched it between
     mbUnregisterAll() and mbRegisterAll() (mbSetShown's false→true edge) and
     wrong everywhere else: app/setup-io.js calls it straight when a setup
     imports while the builder is already on stage, and that stranded the
     REPLACED assembly's bldJ keys in ACT/ACT_T forever while never
     registering the new one's. So the function owns both ends itself now and
     is safe to call from anywhere — registration is idempotent
     (mbRegisterPart), so the sandwich that already existed still works. */
  mbUnregisterAll();
  MB.parts.forEach(p => {
    if(p.group && p.group.parent) p.group.parent.remove(p.group);
    mbDisposeGroup(p.group);
  });
  MB.parts = [];
  MB.sel = null;
  MB.undo = null;
  MB.nextId = 1; MB.nextJoint = 1;

  const saved = (typeof PREFS !== 'undefined' && PREFS.builder && Array.isArray(PREFS.builder.parts))
    ? PREFS.builder.parts : [];
  /* null-prototype maps (v1.46.0): on a plain {}, `byId['constructor']` is
     Object and `byId['toString']` a function, so a record whose id was any
     Object.prototype key was refused as a duplicate of nothing, and a record
     naming one as its PARENT sailed through the "does that parent exist"
     filter in pass 2. An id is a string a person chose; it does not get to
     mean anything else. See mbPrimHas() for the same trap on the type. */
  const byId = Object.create(null), srcOf = Object.create(null);
  /* pass 1 — realize every record, parented to base for now (a part may
     name a parent that has not been created yet). Two ways a record does
     NOT get realized: the hard cap, re-checked live exactly the way
     mbAddPart() checks it (stops the moment a restore would exceed it —
     ONE warn for the whole dropped tail, not one per record), and
     per-record validation (skipped one at a time, named in its own warn).
     A THIRD, added v1.45.0: a DUPLICATE id. Nothing deduped `sp.id`, so two
     records sharing one built two groups and pushed two records — and
     mbDeletePart() then removed the first match's group while filtering BOTH
     records out, leaving a visible, unselectable, undeletable ghost mesh that
     no later cleanup loop could reach (mbFind/mbDescendants/mbDeletePart all
     key off the id, and there was no longer a record carrying it). First
     record wins; the second is named in its own warn. */
  let capWarned = false;
  saved.forEach(sp => {
    if(mbAtHardCap()){
      if(!capWarned){
        if(typeof lg === 'function') lg('warn', 'Model Builder restore: stopped at the '+MB_HARD_CAP+'-part cap — the rest of the saved assembly was dropped');
        capWarned = true;
      }
      return;
    }
    if(!mbSavedPartValid(sp)){
      if(typeof lg === 'function') lg('warn', 'Model Builder restore: '+mbSavedPartWhy(sp));
      return;
    }
    if(Object.prototype.hasOwnProperty.call(byId, sp.id)){
      if(typeof lg === 'function') lg('warn', 'Model Builder restore: skipped a second part record sharing the id "'+sp.id+'"');
      return;
    }
    const rec = {
      id:sp.id, type:sp.type, name:sp.name || '',
      pos:{x:sp.pos.x, y:sp.pos.y, z:sp.pos.z},
      rot:{x:sp.rot.x, y:sp.rot.y, z:sp.rot.z},
      parent:'base', socket:'', axis:sp.axis,
      /* never more channels than the primitive claims — a foreign record that
         hangs a channel off a rigid beam would otherwise register a key with
         nothing driving it, and it is also what keeps a PLATE saved by
         v1.44.1 (rigid, no channels) rigid now that the type can be driven */
      channels:(sp.channels || []).slice(0, mbJointCount(sp.type)), jointN:sp.jointN
    };
    if(!mbRealize(rec)) return;        // it said why; the rest of the assembly goes on
    byId[rec.id] = rec;
    srcOf[rec.id] = sp;
    MB.parts.push(rec);
    const n = parseInt(String(sp.id).replace(/^p/, ''), 10);
    if(!isNaN(n) && n >= MB.nextId) MB.nextId = n + 1;
    if(sp.jointN && sp.jointN >= MB.nextJoint) MB.nextJoint = sp.jointN + 1;
  });
  /* pass 2 — re-parent onto the SAVED parent, restoring the saved local
     transform exactly (preserveWorld = false). A live mbSetAttach() can
     only ever refuse ONE edge at a time, because it only ever APPLIES one
     edge at a time — but a saved file can name a cycle that never went
     through mbSetAttach() at all (two records naming EACH OTHER as
     parent), and checking edges one at a time in array order would only
     catch whichever one the array happens to list second, leaving the
     first half-attached to it. So this runs in three small steps instead
     of one combined loop, so every check sees the WHOLE saved shape:

       2a. bookkeeping — set every candidate's `.parent` to what it was
           SAVED as (not yet touching the live THREE graph), so the graph
           mbDescendants() reads below is the full saved shape, cycle and
           all, not whatever has been reparented so far.
       2b. detection — the same `target === id || mbDescendants(id).has(target)`
           refusal mbSetAttach() makes live, run for every candidate against
           that ONE frozen shape from 2a (nothing is mutated inside this
           step), so a cycle refuses every member that is in it, symmetrically.
       2c. apply — actually reparent the live THREE graph for whatever 2b
           did not refuse; a refused record's `.parent` goes back to
           'base', which is where pass 1 already put its live group, so
           nothing more has to move for it. */
  /* driven off the records that were actually REALIZED (srcOf), not off
     `saved` — a duplicate id that pass 1 refused must not get to reparent the
     record that won it (v1.45.0) */
  const candidates = MB.parts
    .map(rec => ({sp: srcOf[rec.id], rec}))
    .filter(c => c.sp && c.sp.parent && c.sp.parent !== 'base' && byId[c.sp.parent]);
  candidates.forEach(c => { c.rec.parent = c.sp.parent; });                          // 2a
  const refused = new Set();
  candidates.forEach(c => {
    if(c.sp.parent === c.rec.id || mbDescendants(c.rec.id).has(c.sp.parent)) refused.add(c.rec.id);
  });                                                                                // 2b
  candidates.forEach(c => {                                                          // 2c
    if(refused.has(c.rec.id)){
      c.rec.parent = 'base';
      if(typeof lg === 'function') lg('warn', 'Model Builder restore: "'+c.rec.id+'" named a parent that would cycle the assembly — left on the base plate');
      return;
    }
    mbReparent(c.rec, c.sp.parent, false, c.sp.socket);
  });
  /* and now the housekeeping this function used to leave to its callers
     (v1.45.0): register what is on stage, rebuild the Outputs table around
     the new key set, and WRITE THE RESULT BACK. That last one is why a file
     whose records were dropped at the cap, refused for a cycle or skipped as
     corrupt used to replay the same warnings on every single load until some
     unrelated edit happened to rewrite it — saving here means the warning is
     the receipt for a repair that actually stuck. */
  if(MB.shown) mbRegisterAll();
  mbSaveState();
  mbSyncOutputs();
  return MB.parts.length;
}

/* ---------------------------------------------------------------- CRUD */
function mbAtHardCap(){ return MB.parts.length >= MB_HARD_CAP; }
function mbSoftCapNote(){
  return MB.parts.length > MB_SOFT_CAP
    ? 'getting big for one mechanism — ' + MB_HARD_CAP + ' is the cap'
    : '';
}
function mbAddPart(type){
  if(typeof kioskOn === 'function' && kioskOn()) return null;
  if(!mbPrimHas(type) || mbAtHardCap()) return null;
  if(!MB.built) buildModelBuilder();
  const cell = mbNextCell();
  const id = 'p' + (MB.nextId++);
  const rec = {
    id, type, name:'',
    pos:{x:cell.x, y:cell.y, z:cell.z},
    rot:{x:0, y:0, z:0},
    parent:'base', socket:'',
    /* a 1-DOF joint picks which local axis its channel turns; a ball's two
       axes are fixed by its gimbal, and a rigid part has none. That is the
       general test now, so the spin plate got its axis for free (v1.45.0) */
    axis: (mbJointCount(type) === 1) ? 'y' : undefined,
    channels: [], jointN: undefined
  };
  if(mbJointCount(type)){
    rec.jointN = MB.nextJoint++;
    rec.channels = (mbJointCount(type) > 1)
      ? ['bldJ' + rec.jointN, 'bldJ' + rec.jointN + 't']
      : ['bldJ' + rec.jointN];
  }
  if(!mbRealize(rec)) return null;
  MB.parts.push(rec);
  if(MB.shown) mbRegisterPart(rec);
  mbSaveState();
  mbSyncOutputs();             // a new joint means a new Outputs row — see mbSyncOutputs()
  mbSelect(rec.id);
  return rec;
}
function mbDeletePart(id){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  const rec = mbFind(id);
  if(!rec || id === 'base') return false;
  /* an orphaned subtree stays on the stage, on the base — it does not
     vanish just because its parent did */
  MB.parts.filter(p => p.parent === id).forEach(p => mbReparent(p, 'base', true));
  mbUnregisterPart(rec);
  if(rec.group && rec.group.parent) rec.group.parent.remove(rec.group);
  mbDisposeGroup(rec.group);
  MB.parts = MB.parts.filter(p => p.id !== id);
  if(MB.undo && MB.undo.id === id) MB.undo = null;
  if(MB.sel === id) mbSelect(null);
  mbSaveState();
  mbSyncOutputs();             // the deleted joint's row must go with it — see mbSyncOutputs()
  return true;
}
/* the kiosk guard belongs on BOTH of these too (v1.45.0): the file's own rule
   is "guard the function, not the button" (mbSelect's comment), six mutators
   carried it and these two did not — and #side being hidden is not a guard,
   because the name field and the axis dropdown are reachable from any
   direct call and from a pane that was already open when kiosk started. */
function mbRename(id, name){
  if(typeof kioskOn === 'function' && kioskOn()) return;
  const rec = mbFind(id);
  if(!rec || id === 'base') return;
  rec.name = String(name || '').slice(0, 40);
  mbSaveState();
}
function mbMovePart(id, axis, delta){
  if(typeof kioskOn === 'function' && kioskOn()) return;
  const rec = mbFind(id);
  if(!rec || id === 'base') return;
  rec.pos[axis] = Math.round((rec.pos[axis] + delta) / MB_GRID) * MB_GRID;
  rec.group.position[axis] = rec.pos[axis];
  mbSaveState();
}
function mbRotatePart(id, axis, delta){
  if(typeof kioskOn === 'function' && kioskOn()) return;
  const rec = mbFind(id);
  if(!rec || id === 'base') return;
  rec.rot[axis] = (((rec.rot[axis] + delta) % 360) + 360) % 360;
  rec.group.rotation[axis] = rec.rot[axis] * MB_DEG2RAD;
  mbSaveState();
}
function mbSetAxis(id, axis){
  if(typeof kioskOn === 'function' && kioskOn()) return;
  const rec = mbFind(id);
  if(!rec || mbJointCount(rec.type) !== 1 || ['x','y','z'].indexOf(axis) < 0) return;
  rec.axis = axis;
  mbSaveState();
}
function mbSetAttach(id, parentId, socket){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  const rec = mbFind(id);
  if(!rec || id === 'base') return false;
  const target = (parentId && (parentId === 'base' || mbFind(parentId))) ? parentId : 'base';
  if(target === rec.id || mbDescendants(rec.id).has(target)) return false;   // no cycles
  mbReparent(rec, target, true, socket);
  mbSaveState();
  return true;
}

/* -------------------------------------------------------------- selection
   Click-to-select on the STAGE, kept entirely separate from the CAD
   picking path in cad/select.js (that file is not touched by this one) —
   its own raycaster, its own pointerdown/pointerup pair on #stage, gated
   on PREFS.model==='builder' so it never fires over the droid. Follows
   the same click-vs-drag law: a pointerup only counts as a pick if the
   pointer barely moved and came back quickly — anything else was the
   orbit camera's drag, which owns #stage's pointer capture already
   (cad/select.js's own comment on this is the reference). */
const MB_RAY = (typeof THREE !== 'undefined') ? new THREE.Raycaster() : null;
const MB_NDC = (typeof THREE !== 'undefined') ? new THREE.Vector2() : null;
const MB_PLANE = (typeof THREE !== 'undefined') ? new THREE.Plane() : null;
const MB_UP = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 1, 0) : null;
/* one place that turns a client point into a world ray, so the pick and the
   drag can never disagree about where the pointer is */
function mbAimRay(clientX, clientY){
  if(!MB.shown || typeof renderer === 'undefined' || typeof camera === 'undefined') return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if(!rect.width || !rect.height) return null;
  MB_NDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  MB_NDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  camera.updateMatrixWorld();
  MB_RAY.setFromCamera(MB_NDC, camera);
  return MB_RAY;
}
function mbPickAt(clientX, clientY){
  if(!mbAimRay(clientX, clientY)) return null;
  MB.root.updateMatrixWorld(true);     // ?norender draws nothing — see mbReparent()
  const targets = [];
  MB.root.traverse(o => { if(o.isMesh && o.visible) targets.push(o); });
  const hits = MB_RAY.intersectObjects(targets, false);
  for(const h of hits){
    let n = h.object;
    while(n && n !== MB.root){
      if(n.userData && n.userData.mbId) return n.userData.mbId;
      n = n.parent;
    }
  }
  return null;
}
/* ================================================ drag and drop (v1.45.0)
   Mike: "support drag-and-drop components with sensible auto-connections."

   THE POINTER LAW IS UNCHANGED, deliberately. pointerdown already remembered
   where it went down; it now also remembers WHAT it went down on
   (mbPickAt(d0.x, d0.y)), and only a down that hit a part can ever become a
   part drag. A down on empty space — the base plate, the backdrop — is still
   the orbit camera's, exactly as before, which is the whole reason the hit
   test happens at DOWN time and not at move time.

   While a part is being dragged the camera must not also orbit. bindCamera()
   listens on the same #stage element (scene/camera.js) and that file is not
   this one's to edit — but this listener is registered FIRST, at this
   script's parse time, and camera.js's is registered later from
   initScene(), so stopping the rest of that one pointermove event here is
   enough and needs no change over there.

   AUTO-CONNECT is deliberately conservative. A dropped part looks for the
   NEAREST COMPATIBLE SOCKET (mbNearestSocket) within MB_SNAP — three quarters
   of a cell — so a part dropped in the same cell as a socket attaches and a
   part nudged into the next cell, a full 50 mm away, never does. Compatible
   means the same refusal mbSetAttach() makes live: not itself, not one of its
   own descendants. Ties go to the EARLIER socket, which is each primitive's
   driven pivot, so "dropped on a hinge" predictably means "driven by the
   hinge". Nothing about it is silent: the drop says what it attached to, and
   mbUndoAttach() puts the part back on its old parent, socket, cell and
   rotation in one click. */
function mbDragPlanePoint(clientX, clientY, y){
  const ray = mbAimRay(clientX, clientY);
  if(!ray) return null;
  MB_PLANE.setFromNormalAndCoplanarPoint(MB_UP, new THREE.Vector3(0, y, 0));
  return ray.ray.intersectPlane(MB_PLANE, new THREE.Vector3());
}
function mbDragBegin(id, clientX, clientY){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  const rec = mbFind(id);
  if(!rec || id === 'base' || !rec.group) return false;
  MB.root.updateMatrixWorld(true);
  const world = rec.group.getWorldPosition(new THREE.Vector3());
  /* the drag runs on a horizontal plane through the part's CURRENT height, so
     a drag moves a part around the mechanism without also lifting it — height
     stays the Position stepper's job, on the grid */
  const grabbed = mbDragPlanePoint(clientX, clientY, world.y);
  MB.drag = {
    id, y: world.y, moved: false,
    grab: grabbed ? new THREE.Vector3().subVectors(world, grabbed) : new THREE.Vector3(),
    from: {parent: rec.parent, socket: rec.socket || '',
           pos: {x:rec.pos.x, y:rec.pos.y, z:rec.pos.z},
           rot: {x:rec.rot.x, y:rec.rot.y, z:rec.rot.z}}
  };
  mbSelect(id);
  return true;
}
function mbDragTo(clientX, clientY){
  if(!MB.drag) return false;
  const rec = mbFind(MB.drag.id);
  if(!rec || !rec.group){ MB.drag = null; return false; }
  const p = mbDragPlanePoint(clientX, clientY, MB.drag.y);
  if(!p) return false;
  p.add(MB.drag.grab);
  /* quantise in the part's OWN PARENT space: a part riding a hinge is on that
     hinge's grid, not the world's — 50 mm is the only grid either way */
  const parent = rec.group.parent;
  const local = parent ? parent.worldToLocal(p) : p;
  rec.pos.x = Math.round(local.x / MB_GRID) * MB_GRID;
  rec.pos.z = Math.round(local.z / MB_GRID) * MB_GRID;
  rec.group.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
  MB.drag.moved = true;
  MB.root.updateMatrixWorld(true);
  return true;
}
function mbNearestSocket(id){
  const rec = mbFind(id);
  if(!rec || !rec.group) return null;
  MB.root.updateMatrixWorld(true);
  const here = rec.group.getWorldPosition(new THREE.Vector3());
  const skip = mbDescendants(id); skip.add(id);
  const tmp = new THREE.Vector3();
  let best = null;
  for(const p of MB.parts){
    if(skip.has(p.id) || !p.sockets) continue;
    for(const s of p.sockets){
      if(!s.node) continue;
      const d = s.node.getWorldPosition(tmp).distanceTo(here);
      if(d <= MB_SNAP && (!best || d < best.d)) best = {id:p.id, socket:s.id, label:s.label || s.id, d};
    }
  }
  return best;
}
function mbDragDrop(){
  const d = MB.drag;
  MB.drag = null;
  if(!d) return null;
  const rec = mbFind(d.id);
  if(!rec) return null;
  const near = d.moved ? mbNearestSocket(d.id) : null;
  let landed = null;
  if(near && (near.id !== rec.parent || near.socket !== (rec.socket || ''))){
    MB.undo = {id: rec.id, parent: d.from.parent, socket: d.from.socket, pos: d.from.pos, rot: d.from.rot};
    if(mbSetAttach(rec.id, near.id, near.socket)){
      landed = near;
      if(typeof toast === 'function')
        toast('attached to ' + mbPartLabel(mbFind(near.id)).toLowerCase() + ' — ' + near.label + ' · undo it in the pane');
      if(typeof lg === 'function') lg('sys', 'Model Builder: '+rec.id+' attached to '+near.id+' ('+near.socket+')');
    }else{
      MB.undo = null;
    }
  }else if(d.moved){
    mbSaveState();
  }
  if(typeof modelGet === 'function' && modelGet() === 'builder' && typeof buildCadPane === 'function') buildCadPane();
  return landed;
}
function mbDragCancel(){
  if(!MB.drag) return;
  const rec = mbFind(MB.drag.id), from = MB.drag.from;
  MB.drag = null;
  if(!rec) return;
  rec.pos = {x:from.pos.x, y:from.pos.y, z:from.pos.z};
  rec.group.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
}
/* one step back, for the auto-connect only: parent, socket, cell and rotation
   together, so an attach that surprised you is one click from undone. The
   ATTACH TO dropdown is its own undo — it already names every legal parent —
   so this exists for the drop, which the user did not type. */
function mbUndoAttach(){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  const u = MB.undo;
  if(!u) return false;
  MB.undo = null;
  const rec = mbFind(u.id);
  if(!rec) return false;
  rec.pos = {x:u.pos.x, y:u.pos.y, z:u.pos.z};
  rec.rot = {x:u.rot.x, y:u.rot.y, z:u.rot.z};
  mbReparent(rec, u.parent, false, u.socket);      // false: re-apply the saved local transform verbatim
  mbSaveState();
  if(typeof modelGet === 'function' && modelGet() === 'builder' && typeof buildCadPane === 'function') buildCadPane();
  return true;
}

/* the selection entry point — the stage raycaster (mbInitPick() below)
   funnels every click here, so one guard closes both the pointer path and
   any direct call. Sim only freezes whatever was on the stage when it was
   entered (app/kiosk.js) rather than clearing it, so the builder's own
   canvas can still be sitting there, fully clickable, under a stranger's
   hands even with #side (and its Selected part card) hidden wholesale —
   the same "guard the function, not the button" reasoning as
   openStartup(), wsSet(), setStripMode('seq') and the file-drop door
   (app/kiosk.js, look/startup.js, config/workspaces.js,
   maestro/ui-sequencer.js) — this is the fifth guard in that style. */
function mbSelect(id){
  if(typeof kioskOn === 'function' && kioskOn()) return;
  MB.sel = id || null;
  mbDropSelHelper();
  const rec = MB.sel ? mbFind(MB.sel) : null;
  if(rec && rec.group && typeof THREE !== 'undefined' && THREE.BoxHelper){
    MB.selHelper = new THREE.BoxHelper(rec.group, 0x4fd8e8);
    MB.root.add(MB.selHelper);
  }
  if(typeof modelGet === 'function' && modelGet() === 'builder' && typeof buildCadPane === 'function') buildCadPane();
}

function mbInitPick(){
  const stage = (typeof $ === 'function') ? $('stage') : null;
  if(!stage) return;
  let d0 = null;
  stage.addEventListener('pointerdown', e => {
    if(typeof PREFS === 'undefined' || PREFS.model !== 'builder' || e.target.tagName !== 'CANVAS'){ d0 = null; return; }
    d0 = {x:e.clientX, y:e.clientY, t:performance.now(), b:e.button,
          hit: (e.button === 0) ? mbPickAt(e.clientX, e.clientY) : null};
  });
  stage.addEventListener('pointermove', e => {
    if(typeof PREFS === 'undefined' || PREFS.model !== 'builder') return;
    if(!d0 || d0.b !== 0 || !d0.hit) return;        // a down on empty space is the camera's
    if(!MB.drag){
      if(Math.hypot(e.clientX - d0.x, e.clientY - d0.y) <= MB_DRAG_PX) return;   // not yet a drag
      if(!mbDragBegin(d0.hit, d0.x, d0.y)){ d0.hit = null; return; }             // kiosk, or the part went away
    }
    mbDragTo(e.clientX, e.clientY);
    e.stopImmediatePropagation();          // the orbit camera stays out of it — see the block above
    if(e.cancelable && e.preventDefault) e.preventDefault();
  });
  stage.addEventListener('pointerup', e => {
    if(typeof PREFS === 'undefined' || PREFS.model !== 'builder') return;
    if(MB.drag){ mbDragDrop(); d0 = null; return; }   // a drag is a placement, never a click
    if(!d0 || d0.b !== 0) return;
    const moved = Math.hypot(e.clientX - d0.x, e.clientY - d0.y);
    const dt = performance.now() - d0.t;
    d0 = null;
    if(moved > MB_DRAG_PX || dt > 500) return;     // that was an orbit drag
    mbSelect(mbPickAt(e.clientX, e.clientY));
  });
  stage.addEventListener('pointercancel', () => { mbDragCancel(); d0 = null; });
}
mbInitPick();
window.addEventListener('keydown', e => {
  if(e.key !== 'Escape' || !MB.sel) return;
  if(typeof PREFS === 'undefined' || PREFS.model !== 'builder') return;
  const st = (typeof $ === 'function') ? $('startup') : null;
  if(st && st.classList.contains('on')) return;
  mbSelect(null);
});

/* ====================================== the model as a file of its own
   Mike: "add save and export for models" (v1.45.0).

   The assembly already travelled inside the whole-setup .json
   (app/setup-io.js) — everything that makes the sim yours in one file. This
   is the smaller thing that was missing: the MODEL on its own, so a build can
   be shared, kept as a dated snapshot, or dropped into another droid's config
   without shipping a whole firmware profile, Maestro layout and paint scheme
   with it. Shape and manners are setupExport()/setupImportText()'s, one size
   down: a format marker, a schema version (MB_SCHEMA — PREFS.builder had
   none, contrast SETUP_VERSION), a toast for a receipt, and a refusal that
   answers instead of throwing.

   The loader is mbRebuildFromPrefs(), which is already the one path that
   reads records nobody in this file wrote — so an imported model gets the
   same per-record validation, the same cap, the same cycle refusal and the
   same ACT bookkeeping as a setup import or a fresh load, for free.

   fileStamp() (core/util.js) puts the date and the time, without seconds, in
   the name — Mike asked for that on every saved file. */
function mbExportObj(){
  mbSaveState();
  const saved = (typeof PREFS !== 'undefined' && PREFS.builder) ? PREFS.builder : {};
  return {format: MB_FORMAT, v: MB_SCHEMA, parts: (saved.parts || []).slice()};
}
function mbExportModel(){
  const text = JSON.stringify(mbExportObj(), null, 1);
  const name = 'R2-model-' + (typeof fileStamp === 'function' ? fileStamp() : 'model') + '.json';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if(typeof lg === 'function') lg('sys', 'Model Builder exported: '+name+' — '+MB.parts.length+' part(s)');
  /* the pane may be scrolled away by the time the download lands — same
     reasoning as setupExport()'s own toast */
  if(typeof toast === 'function') toast('exported '+name+' — the assembly on its own');
  return name;
}
/* what shape did this file arrive in? A model file is {parts}; a whole setup
   .json carries the same records under prefs.builder, and that is the file
   most people actually have on disk, so take it rather than making them dig
   the block out by hand. */
function mbModelPartsFrom(o){
  if(!o || typeof o !== 'object') return null;
  if(Array.isArray(o.parts)) return {parts:o.parts, v:+o.v || 1};
  if(o.prefs && o.prefs.builder && Array.isArray(o.prefs.builder.parts))
    return {parts:o.prefs.builder.parts, v:+o.prefs.builder.v || 1};
  return null;
}
function mbImportModelText(text, name){
  if(typeof kioskOn === 'function' && kioskOn()) return {ok:false, error:'the kiosk is on'};
  const where = name || 'file';
  let got = null;
  try{ got = mbModelPartsFrom(JSON.parse(text)); }
  catch(e){
    if(typeof lg === 'function') lg('warn', 'Model Builder import failed ('+where+'): '+e.message);
    if(typeof toast === 'function') toast('could not read '+where+' — that is not a model file', 'err');
    return {ok:false, error:e.message};
  }
  if(!got){
    if(typeof lg === 'function') lg('warn', 'Model Builder import failed ('+where+'): no parts list in the file');
    if(typeof toast === 'function') toast('no builder model in '+where, 'err');
    return {ok:false, error:'no parts list'};
  }
  /* a file from a LATER sim: say so and read it anyway. setupImportObj()
     refuses its own newer files outright, but a model is only a parts list
     and every record goes through mbSavedPartValid() regardless — so the
     honest answer is "some of this may not have survived", not "no". */
  if(got.v > MB_SCHEMA){
    if(typeof lg === 'function') lg('warn', 'Model Builder import: '+where+' was saved by a newer sim (v'+got.v+') — anything it added may be dropped');
    if(typeof toast === 'function') toast(where+' comes from a newer sim — parts it does not share may be dropped', 'warn');
  }
  /* READ THE FILE BEFORE COMMITTING TO IT (v1.46.0).
     This used to assign PREFS.builder and call mbRebuildFromPrefs() straight
     off — and that function tears the live assembly down (mbUnregisterAll();
     MB.parts = []) before it reads the first record, skips whatever fails
     validation, and SAVES the result. So a file with nothing this build can
     make destroyed the assembly on the stage, saved the emptiness over the
     one the user had, and reported "loaded 0 part(s)" — a success word for
     total destruction, with no undo. The app's own
     examples/R2-model-simple-face.json is exactly that file: six phase-2
     types, and a `v` of 2 that matches MB_SCHEMA so not even the newer-sim
     warning fired.
     So: validate into a scratch list first, and only then commit. Nothing is
     touched unless at least one record survives — and the refusal says which
     types this build does not have, because that is the one thing the reader
     cannot work out for themselves. */
  const check = mbImportCheck(got.parts);
  if(!check.good.length){
    const why = check.unknown.length
      ? 'nothing in it is a part this build can make — unknown type(s): '+check.unknown.join(', ')
      : 'no usable part records in it';
    if(typeof lg === 'function') lg('warn', 'Model Builder import refused ('+where+'): '+why);
    if(typeof toast === 'function') toast('nothing loaded from '+where+' — '+why+'. Your assembly is untouched.', 'err');
    return {ok:false, error:why, unknown:check.unknown.slice()};
  }
  if(typeof PREFS !== 'undefined') PREFS.builder = {v: got.v, parts: check.good};
  const n = mbRebuildFromPrefs();
  mbSelect(null);
  const dropped = check.dropped;
  if(typeof lg === 'function'){
    lg('sys', 'Model Builder imported '+n+' part(s) from '+where);
    if(dropped) lg('warn', 'Model Builder import: '+dropped+' record(s) in '+where+' were dropped'
                          + (check.unknown.length ? ' — unknown type(s): '+check.unknown.join(', ') : ''));
  }
  if(typeof toast === 'function')
    toast('loaded '+n+' part(s) from '+where
          + (dropped ? ' — '+dropped+' dropped'
                     + (check.unknown.length ? ' ('+check.unknown.join(', ')+')' : '') : ''),
          dropped ? 'warn' : undefined);
  if(typeof modelGet === 'function' && modelGet() === 'builder' && typeof buildCadPane === 'function') buildCadPane();
  return {ok:true, count:n, dropped:dropped, unknown:check.unknown.slice()};
}
/* what an incoming parts list actually offers, with nothing on the stage
   touched: the records this build can make, how many it cannot, and the
   NAMES of the types it did not recognise. Validation is mbSavedPartValid()'s,
   the same one mbRebuildFromPrefs() applies, so the scratch list can never
   promise more than the rebuild will deliver. */
function mbImportCheck(parts){
  const good = [], unknown = [];
  let dropped = 0;
  (Array.isArray(parts) ? parts : []).forEach(sp => {
    if(mbSavedPartValid(sp)){ good.push(sp); return; }
    dropped++;
    if(sp && typeof sp === 'object' && !mbPrimHas(sp.type)){
      const t = mbTypeName(sp.type);
      if(unknown.indexOf(t) < 0) unknown.push(t);
    }
  });
  return {good, dropped, unknown};
}
/* THE FILE DOOR, and the only place a person actually stands (v1.46.0).
   Importing REPLACES the assembly, so a non-empty one gets the same ask
   maestro/ui-files.js's drop path makes before it adopts sequences over
   something you already have. It lives here rather than in
   mbImportModelText() on purpose: appConfirm() is a promise, and that
   function's answer — {ok, count} — is read synchronously by its callers and
   by the suites. The text-level import stays a plain, testable transform;
   the door asks. */
function mbImportModelFile(file){
  const fr = new FileReader();
  fr.onload = async () => {
    if(MB.parts.length && typeof appConfirm === 'function'){
      const go = await appConfirm(
        'Import ' + file.name + ' over the ' + MB.parts.length + ' part(s) on the stage? '
        + 'The assembly you have now is replaced, and that cannot be undone.',
        {title:'replace the assembly?', yes:'replace it', no:'keep mine'});
      if(!go){
        if(typeof toast === 'function') toast('import cancelled — your assembly is untouched');
        return;
      }
    }
    mbImportModelText(fr.result, file.name);
  };
  fr.readAsText(file);
}

/* ============================================================ show/hide
   The seam scene/models.js drives — the only entry point that flips
   MB.shown, registers/unregisters channels, and (only on the false→true
   edge) rebuilds from PREFS.builder, so a setup import that lands while
   the builder is off-stage is picked up the moment it comes back on. */
function mbSetShown(on){
  const was = MB.shown;
  MB.shown = !!on;
  if(MB.shown && !MB.built) buildModelBuilder();
  /* THE LAST LINE OF DEFENCE (v1.46.0). mbRebuildFromPrefs()'s docblock says
     it must never throw, and it now does not — but it is reading a file a
     person may have written, and this is where a throw would do the most
     damage: modelApply() calls straight through here, and at boot that call
     lives inside main.js's `mouseReady.then(() => modelApply(...))`. One bad
     saved record therefore became an UNHANDLED REJECTION and an empty stage
     on every single reload, with nothing said anywhere. A model that will not
     rebuild costs the builder; it must not cost the whole stage. */
  if(MB.shown && !was){
    try{ mbRebuildFromPrefs(); }
    catch(e){
      if(typeof lg === 'function') lg('warn', 'Model Builder: the saved assembly could not be rebuilt — '+e.message);
      if(typeof toast === 'function') toast('the saved Builder assembly could not be rebuilt — see the log', 'err');
    }
  }
  if(MB.root) MB.root.visible = MB.shown;
  if(MB.shown && !was) mbRegisterAll();
  else if(!MB.shown && was) mbUnregisterAll();
  if(typeof modelSyncBtn === 'function') modelSyncBtn();
  if(typeof buildOutputs === 'function') buildOutputs();
  if(typeof lg === 'function') lg('sys', 'Model Builder ' + (MB.shown ? 'on stage — ' + MB.parts.length + ' part(s)' : 'off stage'));
}

/* ================================================================ doors
   Two ways INTO the builder's own UI that live outside cad/ui.js's pane,
   which is not this file's to own the markup of — the logic behind both
   buttons lives here instead.

   1) mbOpenFirmwareSetup() — the door out of the mod2026 channels wall.
      mod2026 wires its servo channels at compile time (app/boards.js's
      fixed SERVO_DEFS table), so a Builder joint has nowhere live to
      attach on that firmware; the Selected part card's channels section
      (cad/ui.js's mbPropsCard) says so in plain words now and hands over
      this door rather than just the wall. Same wizStepIndex()+wizOpen()
      pair maestro/setup-hw.js's setupClose() uses to land back on a named
      step (there, `_servoSet`; here, `firmware`) — and the same "call
      wizOpen() straight, no kiosk guard needed" the Config tab's Open the
      setup button uses (app/panels.js): this card only exists inside
      #side, which body.kiosk hides wholesale already.

   2) mbInstallStageButton()/mbSyncStageButton()/mbOpenPane() — a second
      door, this one where the user is STANDING rather than in the Model
      tab they may not have found yet. A sibling of the model chip itself,
      built the same way app/track-edit.js's trackEditInstallButton() puts
      ✎ EDIT beside btnTrack: a child of #stageTools, so kiosk hides it
      automatically with the rest of the stage chrome. It only makes sense
      while the builder IS the model on stage, so scene/models.js's
      modelSyncBtn() — the one place that already repaints the chip on
      every model-apply — calls mbSyncStageButton() right after; the two
      can never drift apart because they share that one call site.
      mbOpenPane() lands on the Model tab the same way cad/ui.js's own
      "Open Config" button does: wsSet('config') (config/workspaces.js)
      raises the Configure workspace, then a synthetic click on the pCad
      tab button — exactly what buildCadPane()'s own callers and the
      suites already do — opens the pane itself. */
function mbOpenFirmwareSetup(){
  const i = (typeof wizStepIndex === 'function') ? wizStepIndex('firmware') : -1;
  if(typeof wizOpen === 'function') wizOpen(i >= 0 ? i : 0);
}
function mbOpenPane(){
  if(typeof wsSet === 'function') wsSet('config');
  const t = document.querySelector('#tabs button[data-p="pCad"]');
  if(t) t.click();
  if(typeof buildCadPane === 'function') buildCadPane();
}
function mbInstallStageButton(){
  const anchor = (typeof $ === 'function') ? $('btnModel') : null;
  if(!anchor || $('btnMbBuild')) return;
  const b = el('button', 'sbtn', '🔧 BUILD');
  b.id = 'btnMbBuild';
  b.title = 'Open the Builder pane';
  b.addEventListener('click', mbOpenPane);
  anchor.insertAdjacentElement('afterend', b);
  mbSyncStageButton();
}
function mbSyncStageButton(){
  const b = (typeof $ === 'function') ? $('btnMbBuild') : null;
  if(!b) return;
  b.hidden = !(typeof modelGet === 'function' && modelGet() === 'builder');
}

/* ============================================================ animation
   ACT 0..1 -> the joint's travel, bipolar about the channel's 0.5 home —
   the same bi() shape scene/anzellan.js uses for its head gimbal. Pure
   read of ACT: the servo model owns the value, this only poses it. */
function mbA(key){ const v = ACT[key]; return v === undefined ? 0.5 : v; }
function mbTravelRad(key, deg){ return (mbA(key) - 0.5) * 2 * deg * MB_DEG2RAD; }
/* how far each 1-DOF type swings, ± about its channel's 0.5 home. A type
   missing from here gets the hinge's throw, which is what phase 2's rigged
   parts want until they say otherwise. */
const MB_JOINT_TRAVEL = {hinge:MB_HINGE_TRAVEL, plate:MB_PLATE_SPIN};
function mbApplyJoint(rec){
  if(mbJointCount(rec.type) > 1){          // two channels: a gimbal, pan then tilt
    if(rec.panPivot) rec.panPivot.rotation.y = mbTravelRad(rec.channels[0], MB_BALL_PAN);
    rec.attachPoint.rotation.x = mbTravelRad(rec.channels[1], MB_BALL_TILT);
    return;
  }
  const rad = mbTravelRad(rec.channels[0], MB_JOINT_TRAVEL[rec.type] || MB_HINGE_TRAVEL);
  rec.attachPoint.rotation.set(0, 0, 0);
  rec.attachPoint.rotation[rec.axis || 'y'] = rad;
}
/* the per-frame tick — wired into app/animate.js's applyToModel() right
   next to applyAnzellan(), the same seam anzellan uses */
function applyModelBuilder(dt){
  if(!MB.shown || !MB.built) return;
  for(const rec of MB.parts){
    if(mbRecDriven(rec)) mbApplyJoint(rec);      // the general test — see mbRecDriven()
  }
  if(MB.selHelper) MB.selHelper.update();
}

/* ================================================== the naming seam
   DONE, both ends — nothing to add anywhere else (comment corrected
   v1.45.0). The guard this used to ask a future reader to write is already
   in both consumers, and both reach it through mbIsAct():

       cad/naming.js:58   actPartLabel()  — bricks, dropdowns, table cells
       app/wiring.js:207  actFriendly()   — the wiring sheet

   so a third copy would only be a second place to forget. If a NEW consumer
   ever needs a human name for a channel it does not recognise, the call is
   `mbIsAct(act) && builderActLabel(act)` — the same shape as the /^oth(\d+)$/
   guard sitting beside it in both files.

   The lookup itself reads MB.parts first and PREFS.builder second. That
   second half is v1.45.0: MB.parts is EMPTY until the builder has been on
   stage once (mbSetShown → mbRebuildFromPrefs), so on a fresh load every
   wired joint read "Joint 1" — in the brick library, on the wiring sheet and
   in every dropdown — until the user happened to visit the Builder pane. The
   saved assembly knows the name the whole time; ask it. */
function builderActLabel(act){
  const m = /^bldJ(\d+)(t)?$/.exec(act || '');
  if(!m) return '';
  const n = +m[1], isTilt = !!m[2];
  let rec = MB.parts.find(p => p.jointN === n && mbRecDriven(p));
  if(!rec){
    const saved = (typeof PREFS !== 'undefined' && PREFS.builder && Array.isArray(PREFS.builder.parts))
      ? PREFS.builder.parts : [];
    rec = saved.find(p => p && p.jointN === n && mbSavedPartValid(p) && mbRecDriven(p)) || null;
  }
  const base = (rec && rec.name) ? rec.name : ('Joint ' + n);
  if(isTilt) return base + ' tilt';
  return (rec && mbJointCount(rec.type) > 1) ? base + ' pan' : base;
}
