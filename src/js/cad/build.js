'use strict';
/* ------------------------------------------------------------------- build */
function cadMaterial(m){
  const n = (m.name||'').toLowerCase();
  const metal = /steel|stainless|alum|metal|chrome/.test(n);
  const glass = /glass/.test(n);
  const c = m.color || [0.75,0.75,0.75];
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(c[0], c[1], c[2]),
    metalness: metal ? 0.85 : 0.25,
    roughness: metal ? 0.30 : 0.52,
    transparent: glass, opacity: glass ? 0.45 : 1.0
  });
  mat.name = m.name || 'mat';
  return mat;
}

function slotKey(kind, file, mat){ return kind+':'+file+':'+mat; }
function slotMat(kind, file, mat, tris){
  const k = slotKey(kind, file, mat);
  let s = CAD.slotMats[k];
  if(!s){
    const base = CAD.mats[mat] || CAD.mats[0];
    s = CAD.slotMats[k] = base.clone();
    s.name = base.name + ' · ' + kind + '/' + file;
    /* colour lives per VERTEX so one merged mesh can carry many part colours;
       the material colour multiplies it, so painted slots go white and the
       paint layer writes the real colour into each part's vertex range */
    s.vertexColors = true;
    CAD.slots.push({key:k, kind, file, mat, matName:(base.name||'mat'), tris:0, parts:0});
  }
  const rec = CAD.slots.find(x=>x.key===k);
  rec.tris += (tris||0); rec.parts++;
  return s;
}

/* Rig corrections checked against the PHYSICAL build (Mike, 2026-07-26).
   The geometry heuristic read the utility arms as top/bottom clamshell flaps
   hinged on their rear edge. The real MK4 arms are SIDE-hinged and swing out
   horizontally like arms: viewed from the front, the UPPER arm pivots on the
   viewer's right (sim -X, R2's left) and the LOWER on the viewer's left
   (sim +X). Applied at load so the bundled payload and any dropped .r2m both
   get it; cad/rig.py carries the same rule for future regenerations. */
/* On the REAL MK4 build (Mike, 2026-07-26) the six outer MainPie panels are
   printed as one piece with the dome — they do not open. Only the inner
   pies move. So the MainPies join the dome shell (static, dome colour, rotate
   with the dome). */
const STATIC_ON_REAL_BUILD = ['MainPie1','MainPie2','MainPie3','MainPie4','MainPie5','MainPie6'];

/* CAD "Pie6" does NOT move on the real build (Mike, 2026-07-27) — five
   lifters, not six. Unlike the MainPies it stays its own selectable,
   pie-coloured part; it just loses its rig and actuator. It also anchors
   Mike's pie numbering below. */
const STATIC_KEEP_PART = ['Pie6'];

/* Pie motion on the real build (Mike, 2026-07-27, superseding 2026-07-26):
   Pies 1-4 PIVOT — they keep the .r2m's geometry hinge (low outer edge,
   opening up and outward). ONLY Mike's Pie 5 is a lifter, rising straight
   up ~10 cm. Pie 6 does not move at all (STATIC_KEEP_PART above). The
   lifter is picked by pieOrder AFTER the numbering pass below, because
   "Pie 5" is Mike's number, not a CAD base name. */
const PIE_LIFT = p => ({mode:'slide',
  pivot:[(p.bbox[0]+p.bbox[3])/2,(p.bbox[1]+p.bbox[4])/2,(p.bbox[2]+p.bbox[5])/2],
  axis:[0,1,0], range:0.10, src:'build:pie-lifter (rises straight up)'});

const RIG_CORRECTIONS = {
  'UpperUtilityArm': p => ({mode:'hinge',
    pivot:[p.bbox[0], (p.bbox[1]+p.bbox[4])/2, (p.bbox[2]+p.bbox[5])/2],
    axis:[0,1,0], range:1.40, src:'build:side-hinge (upper pivots viewer-right)'}),
  'LowerUtilityArm': p => ({mode:'hinge',
    pivot:[p.bbox[3], (p.bbox[1]+p.bbox[4])/2, (p.bbox[2]+p.bbox[5])/2],
    axis:[0,-1,0], range:1.40, src:'build:side-hinge (lower pivots viewer-left)'}),
};

function buildCad(decoded, fileName){
  const {header, pos, nrm, idx} = decoded;

  if(CAD.root){ R2.root.remove(CAD.root); disposeTree(CAD.root); disposeCadMats(); }
  CAD.root = new THREE.Group();
  CAD.dome = new THREE.Group();
  CAD.body = new THREE.Group();
  CAD.root.add(CAD.body); CAD.root.add(CAD.dome);
  CAD.moving = []; CAD.kindGroups = {};
  CAD.mats = header.materials.map(cadMaterial);
  /* Fusion hands us one Steel_-_Satin covering 128 parts, so a material on its
     own is useless for painting: the dome shell and the leg greebles share it.
     Every mesh instead gets a material cloned per (kind, file, material) slot,
     which is exactly the granularity the meshes are already batched at — no
     extra draw calls, but the dome, the pies and the legs can be painted apart. */
  CAD.slotMats = {}; CAD.slots = [];
  /* name -> {mesh, vStart, vCount, slot} — the bridge from a raycast hit or a
     paint call back to ONE part, even inside the merged static meshes */
  CAD.partIndex = {};

  const parent = p => (p.file === 'dome' ? CAD.dome : CAD.body);
  const kindGroup = (kind, file) => {
    const key = kind + ':' + file;
    if(!CAD.kindGroups[key]){
      const g = new THREE.Group();
      g.userData.kind = kind;
      (file === 'dome' ? CAD.dome : CAD.body).add(g);
      CAD.kindGroups[key] = g;
    }
    return CAD.kindGroups[key];
  };

  /* one BufferGeometry per part; rigged parts get their own mesh, the rest are
     merged per (kind, file, material) to keep the draw-call count sane */
  const bucket = {};      // key -> {pos:[],nrm:[],idx:[],n:0}
  let movingTris = 0, staticTris = 0;

  /* physical-build corrections, then renumber the surviving pies */
  for(const p of header.parts){
    if(p.rig && RIG_CORRECTIONS[p.base]) p.rig = RIG_CORRECTIONS[p.base](p);
    if(STATIC_ON_REAL_BUILD.includes(p.base)){ delete p.rig; delete p.act; p.kind='shell'; }
    if(STATIC_KEEP_PART.includes(p.base)){ delete p.rig; delete p.act; }
  }
  /* Fusion exported the LowerRight body skin with the BLUE trim material
     (Opaque 49,51,196) while TopRight, CentreRight, LowerFront and the rest
     of the skins carry the white one — so that single panel classified as
     `trim` and rendered blue in every scheme (Mike's spec, 2026-07-29: make
     it match the other principal body panels). Remap it to whatever material
     CentreRight actually carries, so it lands in the same paint slot as its
     siblings — self-healing if the model is ever re-exported. */
  {
    const ref = header.parts.find(q=>(q.base||q.name)==='CentreRight');
    const lr  = header.parts.find(q=>(q.base||q.name)==='LowerRight');
    if(ref && lr && lr.mat !== ref.mat) lr.mat = ref.mat;
  }
  /* Mike's pie numbering (2026-07-27): the fixed Pie6 anchors the ring; the
     five movers are "Pie 1".."Pie 5" going ANTICLOCKWISE with Pie 1
     immediately to the left of Pie 6, as you stand IN FRONT of the droid
     looking down at the dome. In that view increasing azimuth sweeps
     clockwise (front → droid-right is bottom → viewer-left), so
     anticlockwise = DECREASING azimuth: 1 = 149.5° (rear-right),
     2 = 88.8° (right), 3 = 28.9° (front-right), 4 = 328.9° (front-left),
     5 = 263.5° (left), 6 = 216.6° fixed. Actuator pieI drives "Pie I+1".
     (If Mike ever says the numbers run the wrong way round, swap the two
     operands of the subtraction below — nothing else changes.) */
  const pieAnchor = header.parts.find(p=>p.base==='Pie6');
  const azAnchor = (pieAnchor && pieAnchor.azimuth) || 216.6;
  const pieRel = p => ((azAnchor - (p.azimuth||0)) + 360) % 360;
  header.parts.filter(p=>p.kind==='pie' && p.rig)
    .sort((a,b)=>pieRel(a) - pieRel(b))
    .forEach((p,i)=>{
      p.act='pie'+i; p.pieOrder=i; p.label='Pie '+(i+1);
      if(i===4) p.rig = PIE_LIFT(p);          // only Mike's Pie 5 rises; 1-4 keep their hinge
    });
  if(pieAnchor) pieAnchor.label = 'Pie 6 (fixed)';

  for(const p of header.parts){
    const vs = p.vOff, vc = p.vCount, is = p.iOff, ic = p.iCount;
    const rigged = !!p.rig;

    if(rigged){
      const geo = new THREE.BufferGeometry();
      const lp = new Float32Array(vc*3), ln = new Float32Array(vc*3);
      const piv = p.rig.pivot;
      for(let i=0;i<vc;i++){
        lp[i*3  ] = pos[(vs+i)*3  ] - piv[0];
        lp[i*3+1] = pos[(vs+i)*3+1] - piv[1];
        lp[i*3+2] = pos[(vs+i)*3+2] - piv[2];
        ln[i*3  ] = nrm[(vs+i)*3  ]; ln[i*3+1] = nrm[(vs+i)*3+1]; ln[i*3+2] = nrm[(vs+i)*3+2];
      }
      const li = new Uint32Array(ic);
      for(let i=0;i<ic;i++) li[i] = idx[is+i] - vs;
      geo.setAttribute('position', new THREE.BufferAttribute(lp,3));
      geo.setAttribute('normal',   new THREE.BufferAttribute(ln,3));
      geo.setIndex(new THREE.BufferAttribute(li,1));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vc*3).fill(1),3));
      const mesh = new THREE.Mesh(geo, slotMat(p.kind, p.file, p.mat, p.tris));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.partName = p.name;
      CAD.partIndex[p.name] = {mesh, vStart:0, vCount:vc, slot:slotKey(p.kind,p.file,p.mat)};
      const grp = new THREE.Group();
      grp.position.set(piv[0], piv[1], piv[2]);
      grp.add(mesh);
      grp.userData.kind = p.kind;
      parent(p).add(grp);
      CAD.moving.push({
        name:p.name, base:p.base, kind:p.kind, file:p.file,
        group:grp, mesh:mesh, rig:p.rig,
        /* the pivot the geometry was baked against, and the mesh offset that
           a hand-set pivot needs — see setPartMotion() in cad/parts.js.
           (NOT `base`: that is already the part's CAD base name.) */
        rig0:JSON.parse(JSON.stringify(p.rig)), mOff:[0,0,0],
        act:p.act || '', pieOrder:(p.pieOrder!==undefined?p.pieOrder:null),
        panelOrder:(p.panelOrder!==undefined?p.panelOrder:null),
        flip:false, tris:p.tris
      });
      movingTris += p.tris;
    }else{
      const key = p.kind + ':' + p.file + ':' + p.mat;
      const b = bucket[key] || (bucket[key] = {pos:[],nrm:[],idx:[],n:0,kind:p.kind,file:p.file,mat:p.mat,ranges:[]});
      b.ranges.push({name:p.name, vStart:b.n, vCount:vc, iStart:b.idx.length, iCount:ic});
      for(let i=0;i<vc;i++){
        b.pos.push(pos[(vs+i)*3], pos[(vs+i)*3+1], pos[(vs+i)*3+2]);
        b.nrm.push(nrm[(vs+i)*3], nrm[(vs+i)*3+1], nrm[(vs+i)*3+2]);
      }
      for(let i=0;i<ic;i++) b.idx.push(idx[is+i] - vs + b.n);
      b.n += vc;
      staticTris += p.tris;
    }
  }

  for(const key in bucket){
    const b = bucket[key];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos),3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(b.nrm),3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(b.idx),1));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.pos.length).fill(1),3));
    const mesh = new THREE.Mesh(geo, slotMat(b.kind, b.file, b.mat, 0));
    mesh.castShadow = true; mesh.receiveShadow = true;
    /* faceIndex -> part: ranges are appended in order, so a hit resolves by
       binary search over iStart */
    mesh.userData.ranges = b.ranges;
    const sk = slotKey(b.kind, b.file, b.mat);
    b.ranges.forEach(r=>{ CAD.partIndex[r.name] = {mesh, vStart:r.vStart, vCount:r.vCount, slot:sk}; });
    kindGroup(b.kind, b.file).add(mesh);
  }

  /* statics are merged, so count the slots from the source parts instead */
  CAD.slots.forEach(s=>{ s.parts=0; s.tris=0; });
  header.parts.forEach(p=>{
    const r = CAD.slots.find(x=>x.key===slotKey(p.kind,p.file,p.mat));
    if(r){ r.parts++; r.tris += p.tris; }
  });

  R2.root.add(CAD.root);
  CAD.header = header; CAD.loaded = true; CAD.fileName = fileName || (header.source||[]).join(' + ');
  CAD.stats = {parts:header.parts.length, tris:header.triCount, verts:header.vertexCount,
               moving:CAD.moving.length, movingTris, staticTris,
               draws:CAD.moving.length + Object.keys(bucket).length};

  // default pie mapping order comes from the container; sort for a tidy UI
  CAD.moving.sort((a,b)=>(a.kind+a.name).localeCompare(b.kind+b.name));
  applyCadVisibility();
  fitProcLegs();
  lg('sys',`CAD: ${CAD.stats.parts} parts, ${CAD.stats.tris} triangles, ${CAD.stats.moving} moving, ~${CAD.stats.draws} draw calls`);
  return CAD;
}

function disposeTree(obj){
  obj.traverse(o=>{ if(o.geometry) o.geometry.dispose(); });
}
/* re-importing an .r2m rebuilds every material — free the old GPU programs */
function disposeCadMats(){
  (CAD.mats||[]).forEach(m=>m.dispose());
  for(const k in (CAD.slotMats||{})) CAD.slotMats[k].dispose();
}
