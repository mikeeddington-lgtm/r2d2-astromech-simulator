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

   FRAME. Local metres, Y up, matching everything else on the stage. The
   base plate sits at the world origin with its TOP FACE at y = 0 — new
   parts land on that surface, on the grid.
   ===================================================================== */

const MB_GRID = 0.05;                 // 50 mm — Mike's fixed grid unit
const MB_SOFT_CAP = 8;
const MB_HARD_CAP = 12;
const MB_HINGE_TRAVEL = 60;           // degrees, ± about the channel's 0.5 home
const MB_BALL_PAN = 30;               // degrees
const MB_BALL_TILT = 25;              // degrees
const MB_DEG2RAD = Math.PI / 180;

/* the parts bin. `joint` counts the channels a primitive of this type
   claims — absent for the three rigid ones. PHASE 2's rigged
   sub-assemblies are meant to add a fourth key here (their own builder
   in MB_BUILDERS below) without anything else in this file changing. */
const MB_PRIM = {
  beam:  {label:'Beam'},
  plate: {label:'Plate'},
  disc:  {label:'Disc'},
  hinge: {label:'Hinge',      joint:1},
  ball:  {label:'Ball joint', joint:2}
};
const MB_PRIM_ORDER = ['beam','plate','disc','hinge','ball'];

/* ------------------------------------------------------------- runtime */
const MB = {
  root: new THREE.Group(),   // world-anchored, exactly like ANZ.root
  base: null,                // {id:'base', group, attachPoint, mesh}
  parts: [],                 // live part records — see mbAddPart()
  shown: false, built: false,
  sel: null, selHelper: null,
  nextId: 1, nextJoint: 1
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
   Every builder returns {group, attachPoint[, panPivot]}. `group` is the
   part's own placement frame — position/rotation from the properties
   card land on it directly. `attachPoint` is where a CHILD part parents
   to: for the two rigid primitives that is `group` itself; for a joint
   it is the innermost pivot, so a child snapped onto a hinge or a ball
   rides the joint's own rotation — that IS the forward-kinematics rule,
   expressed as "which THREE node do I add(this) to". */
function mbBuildBase(){
  const group = new THREE.Group();
  const mesh = mbMesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), MB_MAT.base);
  mesh.position.y = -0.01;             // top face sits at y = 0
  mesh.castShadow = false;
  group.add(mesh);
  return {id:'base', type:'base', group, attachPoint:group, mesh};
}
function mbBuildSimple(type){
  const group = new THREE.Group();
  let geo;
  if(type === 'beam')       geo = new THREE.BoxGeometry(0.05, 0.05, 0.25);
  else if(type === 'plate') geo = new THREE.BoxGeometry(0.15, 0.01, 0.15);
  else                       geo = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 24);   // disc — r 0.05 washer
  group.add(mbMesh(geo, MB_MAT.part));
  return {group, attachPoint:group};
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
  return {group, attachPoint:flagPivot};
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
  return {group, attachPoint:tiltPivot, panPivot};
}
/* the dispatch table PHASE 2's rigged sub-assemblies are meant to extend */
const MB_BUILDERS = {beam:mbBuildSimple, plate:mbBuildSimple, disc:mbBuildSimple, hinge:mbBuildHinge, ball:mbBuildBall};
function mbBuildGeometry(type){
  const fn = MB_BUILDERS[type] || mbBuildSimple;
  return fn(type);
}

/* ------------------------------------------------------------ bookkeeping */
function mbFind(id){
  if(!id) return null;
  if(id === 'base') return MB.base;
  return MB.parts.find(p => p.id === id) || null;
}
function mbAttachPoint(id){
  const rec = mbFind(id);
  return (rec && rec.attachPoint) ? rec.attachPoint : (MB.base && MB.base.attachPoint);
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

/* place `rec.group`, tag it, and park it under the base plate — callers
   that want a different parent reparent afterward (mbReparent). Always
   starting under base means a part is never, even briefly, unparented. */
function mbRealize(rec){
  const built = mbBuildGeometry(rec.type);
  rec.group = built.group;
  rec.attachPoint = built.attachPoint;
  if(built.panPivot) rec.panPivot = built.panPivot;
  rec.group.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
  rec.group.rotation.set(rec.rot.x * MB_DEG2RAD, rec.rot.y * MB_DEG2RAD, rec.rot.z * MB_DEG2RAD);
  rec.group.userData.mbId = rec.id;
  MB.base.attachPoint.add(rec.group);
}
/* reparent onto `parentId`. `preserveWorld` uses THREE's own .attach() —
   the world pose stays exactly where it was and the LOCAL pos/rot are
   whatever falls out (the "transforms preserved" the spec asks for).
   Without it, the SAVED local pos/rot are re-applied instead — that is
   the rebuild-from-prefs path, which wants the numbers it saved back
   verbatim, not a recomputation. */
function mbReparent(rec, parentId, preserveWorld){
  const target = mbAttachPoint(parentId);
  if(!target) return;
  if(preserveWorld && typeof target.attach === 'function'){
    target.attach(rec.group);
    mbSyncRecTransform(rec);
  }else{
    if(rec.group.parent) rec.group.parent.remove(rec.group);
    target.add(rec.group);
    rec.group.position.set(rec.pos.x, rec.pos.y, rec.pos.z);
    rec.group.rotation.set(rec.rot.x * MB_DEG2RAD, rec.rot.y * MB_DEG2RAD, rec.rot.z * MB_DEG2RAD);
  }
  rec.parent = parentId;
}
function mbSyncRecTransform(rec){
  rec.pos = {x:rec.group.position.x, y:rec.group.position.y, z:rec.group.position.z};
  rec.rot = {
    x: Math.round(rec.group.rotation.x / MB_DEG2RAD),
    y: Math.round(rec.group.rotation.y / MB_DEG2RAD),
    z: Math.round(rec.group.rotation.z / MB_DEG2RAD)
  };
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
function mbRegisterPart(rec){
  if(!rec.channels || !rec.channels.length) return;
  rec.channels.forEach(k => { ACT[k] = 0.5; ACT_T[k] = 0.5; });
}
function mbUnregisterPart(rec){
  if(!rec.channels) return;
  rec.channels.forEach(k => { delete ACT[k]; delete ACT_T[k]; });
}
function mbRegisterAll(){ MB.parts.forEach(mbRegisterPart); }
function mbUnregisterAll(){ MB.parts.forEach(mbUnregisterPart); }
function mbIsAct(k){ return /^bldJ\d+t?$/.test(k || ''); }

/* ---------------------------------------------------------- persistence
   PREFS.builder = {parts:[{id,type,pos,rot,parent,axis,channels,name,jointN}]}
   Saved on every edit — mirrors how PARTS/PAINT/etc. write straight
   through prefsSave() rather than batching. */
function mbSaveState(){
  if(typeof PREFS === 'undefined') return;
  PREFS.builder = {
    parts: MB.parts.map(p => ({
      id:p.id, type:p.type, name:p.name || '',
      pos:{x:p.pos.x, y:p.pos.y, z:p.pos.z},
      rot:{x:p.rot.x, y:p.rot.y, z:p.rot.z},
      parent:p.parent, axis:p.axis,
      channels:(p.channels || []).slice(), jointN:p.jointN
    }))
  };
  if(typeof prefsSave === 'function') prefsSave();
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
function mbSavedPartValid(sp){
  return !!sp && typeof sp.id === 'string' && !!sp.id && !!MB_PRIM[sp.type] &&
    mbVec3Valid(sp.pos) && mbVec3Valid(sp.rot) &&
    (sp.channels === undefined || Array.isArray(sp.channels));
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
  if(MB.selHelper){ MB.root.remove(MB.selHelper); MB.selHelper = null; }
  MB.parts.forEach(p => {
    if(p.group && p.group.parent) p.group.parent.remove(p.group);
    mbDisposeGroup(p.group);
  });
  MB.parts = [];
  MB.sel = null;
  MB.nextId = 1; MB.nextJoint = 1;

  const saved = (typeof PREFS !== 'undefined' && PREFS.builder && Array.isArray(PREFS.builder.parts))
    ? PREFS.builder.parts : [];
  const byId = {};
  /* pass 1 — realize every record, parented to base for now (a part may
     name a parent that has not been created yet). Two ways a record does
     NOT get realized: the hard cap, re-checked live exactly the way
     mbAddPart() checks it (stops the moment a restore would exceed it —
     ONE warn for the whole dropped tail, not one per record), and
     per-record validation (skipped one at a time, named in its own warn). */
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
      if(typeof lg === 'function') lg('warn', 'Model Builder restore: skipped a corrupt part record'+(sp && sp.id ? ' ("'+sp.id+'")' : ''));
      return;
    }
    const rec = {
      id:sp.id, type:sp.type, name:sp.name || '',
      pos:{x:sp.pos.x, y:sp.pos.y, z:sp.pos.z},
      rot:{x:sp.rot.x, y:sp.rot.y, z:sp.rot.z},
      parent:'base', axis:sp.axis,
      channels:(sp.channels || []).slice(), jointN:sp.jointN
    };
    mbRealize(rec);
    byId[rec.id] = rec;
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
  const candidates = saved
    .map(sp => ({sp, rec: byId[sp.id]}))
    .filter(c => c.rec && c.sp.parent && c.sp.parent !== 'base' && byId[c.sp.parent]);
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
    mbReparent(c.rec, c.sp.parent, false);
  });
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
  if(!MB_PRIM[type] || mbAtHardCap()) return null;
  if(!MB.built) buildModelBuilder();
  const cell = mbNextCell();
  const id = 'p' + (MB.nextId++);
  const rec = {
    id, type, name:'',
    pos:{x:cell.x, y:cell.y, z:cell.z},
    rot:{x:0, y:0, z:0},
    parent:'base',
    axis: (type === 'hinge') ? 'y' : undefined,
    channels: [], jointN: undefined
  };
  if(MB_PRIM[type].joint){
    rec.jointN = MB.nextJoint++;
    rec.channels = (type === 'ball') ? ['bldJ' + rec.jointN, 'bldJ' + rec.jointN + 't'] : ['bldJ' + rec.jointN];
  }
  mbRealize(rec);
  MB.parts.push(rec);
  if(MB.shown) mbRegisterPart(rec);
  mbSaveState();
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
  if(MB.sel === id) mbSelect(null);
  mbSaveState();
  return true;
}
function mbRename(id, name){
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
  const rec = mbFind(id);
  if(!rec || rec.type !== 'hinge' || ['x','y','z'].indexOf(axis) < 0) return;
  rec.axis = axis;
  mbSaveState();
}
function mbSetAttach(id, parentId){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  const rec = mbFind(id);
  if(!rec || id === 'base') return false;
  const target = (parentId && (parentId === 'base' || mbFind(parentId))) ? parentId : 'base';
  if(target === rec.id || mbDescendants(rec.id).has(target)) return false;   // no cycles
  mbReparent(rec, target, true);
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
function mbPickAt(clientX, clientY){
  if(!MB.shown || typeof renderer === 'undefined' || typeof camera === 'undefined') return null;
  const rect = renderer.domElement.getBoundingClientRect();
  MB_NDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  MB_NDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  MB_RAY.setFromCamera(MB_NDC, camera);
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
  if(MB.selHelper){ MB.root.remove(MB.selHelper); MB.selHelper = null; }
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
    d0 = {x:e.clientX, y:e.clientY, t:performance.now(), b:e.button};
  });
  stage.addEventListener('pointerup', e => {
    if(typeof PREFS === 'undefined' || PREFS.model !== 'builder') return;
    if(!d0 || d0.b !== 0) return;
    const moved = Math.hypot(e.clientX - d0.x, e.clientY - d0.y);
    const dt = performance.now() - d0.t;
    d0 = null;
    if(moved > 6 || dt > 500) return;     // that was an orbit drag
    mbSelect(mbPickAt(e.clientX, e.clientY));
  });
}
mbInitPick();
window.addEventListener('keydown', e => {
  if(e.key !== 'Escape' || !MB.sel) return;
  if(typeof PREFS === 'undefined' || PREFS.model !== 'builder') return;
  const st = (typeof $ === 'function') ? $('startup') : null;
  if(st && st.classList.contains('on')) return;
  mbSelect(null);
});

/* ============================================================ show/hide
   The seam scene/models.js drives — the only entry point that flips
   MB.shown, registers/unregisters channels, and (only on the false→true
   edge) rebuilds from PREFS.builder, so a setup import that lands while
   the builder is off-stage is picked up the moment it comes back on. */
function mbSetShown(on){
  const was = MB.shown;
  MB.shown = !!on;
  if(MB.shown && !MB.built) buildModelBuilder();
  if(MB.shown && !was) mbRebuildFromPrefs();
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
function mbApplyJoint(rec){
  if(rec.type === 'hinge'){
    const rad = mbTravelRad(rec.channels[0], MB_HINGE_TRAVEL);
    rec.attachPoint.rotation.set(0, 0, 0);
    rec.attachPoint.rotation[rec.axis || 'y'] = rad;
  }else if(rec.type === 'ball'){
    if(rec.panPivot) rec.panPivot.rotation.y = mbTravelRad(rec.channels[0], MB_BALL_PAN);
    rec.attachPoint.rotation.x = mbTravelRad(rec.channels[1], MB_BALL_TILT);
  }
}
/* the per-frame tick — wired into app/animate.js's applyToModel() right
   next to applyAnzellan(), the same seam anzellan uses */
function applyModelBuilder(dt){
  if(!MB.shown || !MB.built) return;
  for(const rec of MB.parts){
    if(rec.type === 'hinge' || rec.type === 'ball') mbApplyJoint(rec);
  }
  if(MB.selHelper) MB.selHelper.update();
}

/* ================================================== the naming seam
   Exactly the /^oth(\d+)$/ guard cad/naming.js's actPartLabel() already
   carries for OTH_KEYS (core/actuators.js) — a bldJ<n> channel needs the
   same treatment so the sequencer lanes, the Outputs table and (once
   wiring.js is updated — see the coordinator's report) the wiring sheet
   all name it the same way. cad/naming.js is NOT owned by this file, so
   the guard is not added there; this function is the thing to call from
   it:

       const bld = /^bldJ(\d+)(t)?$/.exec(act || '');
       if(bld && typeof builderActLabel === 'function') return builderActLabel(act);

   dropped in right beside the existing `oth` guard. */
function builderActLabel(act){
  const m = /^bldJ(\d+)(t)?$/.exec(act || '');
  if(!m) return '';
  const n = +m[1], isTilt = !!m[2];
  const rec = MB.parts.find(p => p.jointN === n && (p.type === 'hinge' || p.type === 'ball'));
  const base = (rec && rec.name) ? rec.name : ('Joint ' + n);
  if(isTilt) return base + ' tilt';
  return (rec && rec.type === 'ball') ? base + ' pan' : base;
}
