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
  pts:[],              // sampled centreline {x,z,tx,tz,nx,nz}
  gates:[],            // {a,b,idx,lamps[]}
  barriers:[],         // {x,z,rail,post}
  cones:[],            // {x,z,mesh} — Track Builder markers, no collision
  shape:null, gateT:null, coneXZ:null,   // the data trackBuild() last used — see trackShapeData()
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
/* No two non-adjacent parts of the circuit may come within
   2 × (TRACK_HALF + barrier offset) of each other, or a barrier ends up
   standing in the middle of the neighbouring lane. The first draft had a
   double-apex that pinched to 1.1 m and did exactly that. */

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
/* PREFS is loaded at the very top of window 'load' (app/main.js), well
   before anything can call trackBuild() (it only ever runs lazily, off a
   button click or setTrack(true)) — but read it defensively anyway rather
   than assume boot order can never change under us. */
function trackShapeData(){
  const def = trackDefaultData();
  const t = (typeof PREFS !== 'undefined' && PREFS) ? PREFS.track : null;
  if(!t) return def;
  return {
    shape: trackShapeValid(t.shape) ? t.shape.map(p=>p.slice()) : def.shape,
    gates: trackGatesValid(t.gates) ? t.gates.slice() : def.gates,
    cones: trackConesValid(t.cones) ? t.cones.map(p=>p.slice()) : def.cones
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
    const tl = Math.hypot(tx,tz) || 1; tx/=tl; tz/=tl;
    out.push({x:p.x, z:p.z, tx, tz, nx:-tz, nz:tx});
  }
  return out;
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
  const s = [0];
  for(let i=1;i<N;i++) s.push(s[i-1] + Math.hypot(pts[i].x-pts[i-1].x, pts[i].z-pts[i-1].z));
  const total = s[N-1] + Math.hypot(pts[0].x-pts[N-1].x, pts[0].z-pts[N-1].z);
  const adjacentArc = Math.max(TRACK_MIN_SPACING*1.5, total*0.05);
  const bad = new Set();
  for(let i=0;i<N;i++){
    for(let j=i+1;j<N;j++){
      const gap = Math.abs(s[j]-s[i]);
      const arc = Math.min(gap, total-gap);
      if(arc < adjacentArc) continue;              // same stretch/corner, not a violation
      const d = Math.hypot(pts[j].x-pts[i].x, pts[j].z-pts[i].z);
      if(d < TRACK_MIN_SPACING){ bad.add(i); bad.add(j); }
    }
  }
  return {pts, bad};
}

function trackBuild(){
  if(TRACK.built) return;
  const data = trackShapeData();
  TRACK.shape = data.shape; TRACK.gateT = data.gates; TRACK.coneXZ = data.cones;
  TRACK.root = new THREE.Group();
  TRACK.pts = trackSample(TRACK.shape);
  const P = TRACK.pts, N = P.length;

  /* ---- surface ribbon ---- */
  const pos = [], idx = [], uv = [];
  for(let i=0;i<N;i++){
    const p = P[i];
    pos.push(p.x + p.nx*TRACK_HALF, 0.006, p.z + p.nz*TRACK_HALF);
    pos.push(p.x - p.nx*TRACK_HALF, 0.006, p.z - p.nz*TRACK_HALF);
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

  /* ---- kerbs: alternating red/white blocks along both edges ---- */
  const kerbR = new THREE.MeshStandardMaterial({color:0xc0392b, roughness:.7});
  const kerbW = new THREE.MeshStandardMaterial({color:0xe9edf2, roughness:.7});
  const kerbGeo = new THREE.BoxGeometry(0.16, 0.035, 0.30);
  for(let i=0;i<N;i+=3){
    const p = P[i];
    [1,-1].forEach(s=>{
      const m = new THREE.Mesh(kerbGeo, ((i/3)|0)%2 ? kerbR : kerbW);
      m.position.set(p.x + p.nx*s*(TRACK_HALF+0.09), 0.018, p.z + p.nz*s*(TRACK_HALF+0.09));
      m.rotation.y = Math.atan2(p.tx, p.tz);
      m.receiveShadow = true;
      TRACK.root.add(m);
    });
  }

  /* ---- barriers: posts with a rail, both edges ---- */
  const postMat = new THREE.MeshStandardMaterial({color:0x39414d, roughness:.6, metalness:.35});
  const railMat = new THREE.MeshStandardMaterial({color:0xf2a63c, roughness:.55, metalness:.2});
  const postGeo = new THREE.CylinderGeometry(0.028,0.034,0.30,8);
  const railGeo = new THREE.BoxGeometry(0.05, 0.09, 0.46);
  for(let i=0;i<N;i+=6){
    const p = P[i];
    [1,-1].forEach(s=>{
      const bx = p.x + p.nx*s*(TRACK_HALF+0.26), bz = p.z + p.nz*s*(TRACK_HALF+0.26);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(bx, 0.15, bz); post.castShadow = true;
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(bx, 0.24, bz);
      rail.rotation.y = Math.atan2(p.tx, p.tz);
      rail.castShadow = true;
      TRACK.root.add(post); TRACK.root.add(rail);
      TRACK.barriers.push({x:bx, z:bz, rail, post});
    });
  }

  /* ---- start / finish, chequered ---- */
  const sf = P[0];
  for(let k=0;k<8;k++){
    const t = (k/7 - 0.5) * TRACK_HALF*2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.006, 0.17),
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
    const i = Math.round(((t % 1 + 1) % 1) * N) % N;
    const p = P[i];
    const A = new THREE.Vector3(p.x + p.nx*(TRACK_HALF+0.26), 0, p.z + p.nz*(TRACK_HALF+0.26));
    const B = new THREE.Vector3(p.x - p.nx*(TRACK_HALF+0.26), 0, p.z - p.nz*(TRACK_HALF+0.26));
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
  TRACK.root = null; TRACK.gates = []; TRACK.barriers = []; TRACK.cones = [];
  TRACK.pts = []; TRACK.built = false;
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
  trackPaintGates();
}
function trackPaintGates(){
  TRACK.gates.forEach((g,i)=>{
    const m = (i===TRACK.next) ? TRACK.mats.on : (i<TRACK.next ? TRACK.mats.done : TRACK.mats.off);
    g.lamps.forEach(l=>{ l.material = m; });
  });
}
/* put the droid on the grid, facing down the straight */
function trackGrid(){
  if(!TRACK.pts.length) return;
  const p = TRACK.pts[TRACK.pts.length-6];
  R2.pos.x = p.x; R2.pos.z = p.z;
  R2.yaw = Math.atan2(-p.tx, -p.tz);
  if(R2.root){ R2.root.position.set(R2.pos.x, 0, R2.pos.z); R2.root.rotation.y = R2.yaw; }
  TRACK.prev = null;
}
function setTrack(on){
  TRACK.on = !!on;
  if(TRACK.on){
    trackBuild();
    TRACK.root.visible = true;
    TRACK.last = null; TRACK.laps = 0; TRACK.times = [];
    trackResetLap();
    trackGrid();
    /* the circuit is built for the hangar deck — take the droid there */
    if(typeof envSet === 'function' && typeof envGet === 'function' && envGet() === 'studio') envSet('hangar');
    lg('sys','practice circuit ON — arm the feet (START), cross the line and take the gates in order. A barrier costs 2 s.');
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

/* nearest sampled centreline point — index, distance and which side */
function trackNearest(x,z){
  let best = 0, bd = 1e9;
  const P = TRACK.pts;
  for(let i=0;i<P.length;i++){
    const dx = x-P[i].x, dz = z-P[i].z;
    const d = dx*dx + dz*dz;
    if(d < bd){ bd = d; best = i; }
  }
  const p = P[best];
  return {i:best, dist:Math.sqrt(bd), side:(x-p.x)*p.nx + (z-p.z)*p.nz, p};
}

function trackTick(dt){
  if(!TRACK.on || !TRACK.pts.length) return;
  const pos = {x:R2.pos.x, z:R2.pos.z};

  /* ---- barriers: you cannot leave the ribbon ---- */
  const near = trackNearest(pos.x, pos.z);
  const limit = TRACK_HALF + 0.16;                    // R2's footprint eats the rest
  if(near.dist > limit){
    const s = near.side >= 0 ? 1 : -1;
    R2.pos.x = near.p.x + near.p.nx * s * limit;
    R2.pos.z = near.p.z + near.p.nz * s * limit;
    if(R2.root) R2.root.position.set(R2.pos.x, 0, R2.pos.z);
    pos.x = R2.pos.x; pos.z = R2.pos.z;
    /* one penalty per excursion, not one per frame */
    if(!TRACK.off){
      TRACK.off = true; TRACK.penalty += 2000;
      lg('warn','practice circuit: barrier! +2 s');
    }
  }else if(near.dist < limit - 0.10){
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
        + (recent.length ? '<div class="hudrow"><div class="laplist">' + recent.map(l=>
            '<span class="lapn">lap '+l.n+'</span><span class="lapt'
            + (PREFS.bestLap && Math.round(l.ms)<=PREFS.bestLap ? ' best' : '') + '">'
            + trackFmt(l.ms) + '</span><span class="lappen">'
            + (l.pen ? '+'+(l.pen/1000)+'s' : '') + '</span>'
          ).join('') + '</div></div>' : '');
    }
  }
}
