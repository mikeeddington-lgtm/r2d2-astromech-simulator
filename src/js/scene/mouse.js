'use strict';
/* =====================================================================
   POLAR MOUSE + CHARIOT — a second DRIVABLE vehicle

   Mike's `Polar+Mouse+with+Chariot.obj`: a printed mouse droid on a proper
   RC chassis, towing a Mandalorian chariot. `cad/mouse.py` turns the 139 MB
   export into the same .r2m container the MK4 uses, strips the two thirds of
   it that is gears and bearings sealed inside the body, decimates the tyres
   (35,726 triangles each) and MEASURES the chassis on the way past — the
   wheelbase, the track, the wheel radius and the hitch pin all come out of
   the geometry and travel in the header's `vehicle` block. Nothing here is
   a guessed number.

   WHY IT IS NOT DRIVEN LIKE THE DROID
   R2 is skid-steer: two driven feet, turns on the spot. This thing has a
   steering rack — SteerBar, kingpins, servo horns — a differential and a
   fixed rear axle. So it gets a BICYCLE MODEL about the rear axle, with
   Ackermann geometry on the front pair, and it cannot turn on the spot. If
   it could, the model on screen would be lying about the chassis in the CAD.

   THE PAD BELONGS TO ONE VEHICLE AT A TIME
   On a real bench the mouse is a separate receiver. So while it has the
   sticks, the SKETCH sees them centred (`mouseTakeSticks()`, called from
   pollInput) — otherwise R2 would drive off across the room while you are
   steering the trolley. Buttons always reach the sketch: sounds and
   sequences are not driving.

   FRAME. Same as everything else: metres, Y up, front = -Z, the vehicle's
   left = -X. `MOUSE.root`'s origin is the REAR AXLE, because that is the
   point the bicycle model pivots about.
   ===================================================================== */

const MOUSE = {
  loaded:false, header:null, spec:null,
  root:null, chassis:null, chariot:null,
  wheels:{},                 // id -> {group (steers), mesh (spins), c, r}
  mats:[], stats:null,
  /* state */
  pos:new THREE.Vector3(1.75, 0, 0.95), yaw:-0.55,
  speed:0, throttle:0, steer:0, steerCmd:0,
  chYaw:-0.55,               // the trailer's own WORLD yaw
  spin:0, chSpin:0           // accumulated wheel angles, tractor and trailer
};

/* Who has the sticks. Deliberately a one-of, not a pair of flags: two
   vehicles both listening to the same stick is exactly the bug this
   prevents. */
const DRV = { who:'r2' };

/* ---------------------------------------------------------------- limits
   Sized off the chassis rather than picked: a 34 cm wheelbase on 155 mm
   wheels is a big RC car, and this is what a big RC car does. */
const MOUSE_LIM = {
  vMax:      1.85,    // m/s forward
  vRev:      0.95,    // m/s in reverse
  accel:     2.60,    // m/s^2 under power
  brake:     4.20,    // m/s^2 against the direction of travel
  coast:     1.15,    // m/s^2 with the stick centred
  steerMax:  0.55,    // rad at the kingpin, ~31 degrees
  steerRate: 3.20,    // rad/s — the steering servo's slew
  jack:      1.75     // rad: how far the chariot may fold before it stops
};

/* ------------------------------------------------------------ materials
   The .mtl this OBJ names — 5a14f924-….mtl — is NOT in the project folder,
   so there are no Kd values to read: every material would default to the same
   grey and the whole vehicle renders as one lump of putty. Colour therefore
   comes from the material NAME plus the part's own role, which is the honest
   fallback and is easy to throw away the day the .mtl turns up (drop it next
   to the OBJ and cad/mouse.py will pick it up on its own).

   Colours are written as sRGB and converted once, for the same reason
   scene/anzellan.js does it — this renderer predates ColorManagement and
   treats a material hex as linear. See HANDOVER §7. */
function mouseHue(hex){
  const c = new THREE.Color(hex);
  return c.convertSRGBToLinear ? c.convertSRGBToLinear() : c;
}
const MOUSE_MAT_BY_NAME = {
  'paint_-_enamel_glossy_(white)': {hex:0xdfe3e7, metalness:0.10, roughness:0.32},
  'steel_-_satin':                 {hex:0x9aa0a8, metalness:0.78, roughness:0.36},
  'steel_-_satin_1':               {hex:0x767c84, metalness:0.80, roughness:0.34},
  'steel_-_satin_2':               {hex:0x878d95, metalness:0.76, roughness:0.38}
};
/* Role beats material. Steel_-_Satin_2 covers 92 parts — the tyres AND the
   hubs AND half the chassis — so painting by material alone puts rubber and
   polished aluminium in the same grey. */
const MOUSE_ROLE = [
  [/tyre/i,                {hex:0x1e2124, metalness:0.02, roughness:0.95}],   // rubber
  [/wheelring|outerwheel|innerwheel|wheelplug/i,
                           {hex:0xb6bcc4, metalness:0.85, roughness:0.28}],   // rim
  [/hub|bumper|mudflap/i,  {hex:0x5f656c, metalness:0.70, roughness:0.45}],
  [/mando|rearseat|side$/i,{hex:0x8d939b, metalness:0.55, roughness:0.48}]
];
function mouseRole(base){
  for(const [re] of MOUSE_ROLE) if(re.test(base)) return re.source;
  return '';
}
function mouseMaterialFor(matDef, base){
  let spec = MOUSE_MAT_BY_NAME[(matDef.name||'').toLowerCase()]
          || {hex:0x9aa0a8, metalness:0.55, roughness:0.45};
  for(const [re, s] of MOUSE_ROLE) if(re.test(base)){ spec = s; break; }
  /* if the .mtl ever does show up, its Kd wins for everything but the roles */
  const kd = matDef.color;
  const useKd = kd && !(Math.abs(kd[0]-0.72)<1e-6 && Math.abs(kd[2]-0.74)<1e-6) && !mouseRole(base);
  const mat = new THREE.MeshStandardMaterial({
    color: useKd ? new THREE.Color(kd[0],kd[1],kd[2]) : mouseHue(spec.hex),
    metalness: spec.metalness, roughness: spec.roughness
  });
  mat.name = (matDef.name||'mat') + (mouseRole(base) ? ' · role' : '');
  return mat;
}

/* ---------------------------------------------------------------- build */
/* One merged mesh per (member, material). A wheel's geometry is baked around
   its own centre so the mesh can spin, and the chariot's around the hitch pin
   so the group can swing — same trick the CAD's rigged parts use. */
function buildMouse(decoded){
  const {header, pos, nrm, idx} = decoded;
  const V = header.vehicle;
  if(!V) throw new Error('this .r2m has no vehicle block — rebuild it with cad/mouse.py');

  if(MOUSE.root){ scene.remove(MOUSE.root); disposeTree(MOUSE.root); }
  MOUSE.header = header;
  MOUSE.mats = [];
  MOUSE.wheels = {};

  MOUSE.root = new THREE.Group();
  MOUSE.chassis = new THREE.Group();
  MOUSE.root.add(MOUSE.chassis);

  /* the rear axle is the origin of the drive model, so shift the whole model
     back by however far it sits from the CAD's own zero */
  const rear = V.wheels.filter(w=>w.id[0]==='R');
  const rearZ = rear.reduce((s,w)=>s+w.c[2],0) / Math.max(1, rear.length);
  MOUSE.chassis.position.z = -rearZ;

  const hitch = V.hitch;
  MOUSE.chariot = new THREE.Group();
  MOUSE.chariot.position.set(hitch[0], hitch[1], hitch[2]);
  MOUSE.chassis.add(MOUSE.chariot);

  const wheelSpec = {}; V.wheels.forEach(w=>{ wheelSpec[w.id] = w; });
  const wheelGroup = {};
  for(const w of V.wheels){
    const g = new THREE.Group();          // steers
    g.position.set(w.c[0], w.c[1], w.c[2]);
    const s = new THREE.Group();          // spins
    g.add(s);
    (w.trailer ? MOUSE.chariot : MOUSE.chassis).add(g);
    if(w.trailer) g.position.set(w.c[0] - hitch[0], w.c[1] - hitch[1], w.c[2] - hitch[2]);
    wheelGroup[w.id] = s;
    MOUSE.wheels[w.id] = {group:g, spin:s, mesh:null, c:w.c, r:w.r,
                          steer:!!w.steer, trailer:!!w.trailer};
  }

  /* origin each part is baked around, in model space */
  const originOf = p => {
    if(p.kind === 'wheel'){ const w = wheelSpec[p.member]; return w ? w.c : [0,0,0]; }
    if(p.kind === 'chariot') return hitch;
    return [0,0,0];
  };
  const parentOf = p => {
    if(p.kind === 'wheel') return wheelGroup[p.member] || MOUSE.chassis;
    if(p.kind === 'chariot') return MOUSE.chariot;
    return MOUSE.chassis;
  };

  const bucket = {};
  let tris = 0;
  for(const p of header.parts){
    const key = p.kind + ':' + p.member + ':' + p.mat + ':' + mouseRole(p.base);
    const b = bucket[key] || (bucket[key] = {pos:[],nrm:[],idx:[],n:0,part:p});
    const o = originOf(p);
    for(let i=0;i<p.vCount;i++){
      b.pos.push(pos[(p.vOff+i)*3] - o[0], pos[(p.vOff+i)*3+1] - o[1], pos[(p.vOff+i)*3+2] - o[2]);
      b.nrm.push(nrm[(p.vOff+i)*3], nrm[(p.vOff+i)*3+1], nrm[(p.vOff+i)*3+2]);
    }
    for(let i=0;i<p.iCount;i++) b.idx.push(idx[p.iOff+i] - p.vOff + b.n);
    b.n += p.vCount;
    tris += p.tris;
  }
  let draws = 0;
  for(const key in bucket){
    const b = bucket[key];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos),3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(b.nrm),3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(b.idx),1));
    const mat = mouseMaterialFor(header.materials[b.part.mat] || {}, b.part.base);
    MOUSE.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.member = b.part.member;
    parentOf(b.part).add(mesh);
    if(b.part.kind === 'wheel' && MOUSE.wheels[b.part.member]) MOUSE.wheels[b.part.member].mesh = mesh;
    draws++;
  }

  MOUSE.spec = {
    wheelbase: V.wheelbase,
    trackF: V.trackF, trackR: V.trackR, wheelR: V.wheelR,
    /* how far the pin sits BEHIND the rear axle, and from the pin to the
       trailer's own axle — the two lengths the tracking model needs */
    hitchBack: hitch[2] - rearZ,
    trailerLen: (()=>{
      const c = V.wheels.filter(w=>w.trailer);
      const z = c.reduce((s,w)=>s+w.c[2],0) / Math.max(1,c.length);
      return z - hitch[2];
    })(),
    rearZ
  };
  MOUSE.stats = {parts:header.parts.length, verts:header.vertexCount, tris, draws};
  MOUSE.loaded = true;
  scene.add(MOUSE.root);
  mouseResetPose();
  lg('sys', `Polar Mouse loaded — ${header.parts.length} parts, ${tris.toLocaleString()} tris, `
          + `wheelbase ${(V.wheelbase*1000).toFixed(0)} mm, track ${(V.trackF*1000).toFixed(0)} mm`);
  if(typeof mouseSyncBtn === 'function') mouseSyncBtn();
  return MOUSE.root;
}

async function loadMouseFromPayload(){
  if(typeof MOUSE_PAYLOAD === 'undefined' || !MOUSE_PAYLOAD) return false;
  try{
    const buf = await inflateB64(MOUSE_PAYLOAD);
    buildMouse(decodeR2M(buf));
    return true;
  }catch(e){
    lg('warn','the bundled Polar Mouse failed to load: '+e.message);
    return false;
  }
}

/* ------------------------------------------------------------ the driver */
function mouseSetDriver(who){
  const next = (who === 'mouse' && MOUSE.loaded) ? 'mouse' : 'r2';
  if(next === DRV.who) return;
  DRV.who = next;
  /* Whoever is handed over stops where they are. The droid's own stop comes
     for free — the sketch sees centred sticks the moment the mouse has them
     — but the mouse has no firmware to tell it, so say it here. */
  if(next === 'r2'){ MOUSE.throttle = 0; MOUSE.steerCmd = 0; }
  lg('sys', next === 'mouse'
      ? 'the pad now drives the Polar Mouse — the sketch sees centred sticks'
      : 'the pad is back on the droid');
  if(typeof mouseSyncBtn === 'function') mouseSyncBtn();
}
function mouseToggleDriver(){ mouseSetDriver(DRV.who === 'mouse' ? 'r2' : 'mouse'); }
function mouseIsDriving(){ return DRV.who === 'mouse' && MOUSE.loaded; }

/* Called from pollInput() with the merged stick values. Returns true when it
   has taken them, which is the caller's cue to hand the sketch zeros. */
function mouseTakeSticks(LX, LY, RX, RY){
  if(!mouseIsDriving()) return false;
  MOUSE.throttle = clamp(LY, -1, 1);
  MOUSE.steerCmd = clamp(-LX, -1, 1);       // stick right -> steer right -> negative yaw
  return true;
}

function mouseResetPose(){
  MOUSE.pos.set(1.75, 0, 0.95); MOUSE.yaw = -0.55; MOUSE.chYaw = -0.55;
  MOUSE.speed = 0; MOUSE.steer = 0; MOUSE.steerCmd = 0; MOUSE.throttle = 0;
  MOUSE.spin = 0; MOUSE.chSpin = 0;
  if(MOUSE.root){ MOUSE.root.position.copy(MOUSE.pos); MOUSE.root.rotation.y = MOUSE.yaw; }
}

/* ---------------------------------------------------------- the physics */
const _wrapPi = a => { while(a >  Math.PI) a -= Math.PI*2;
                       while(a < -Math.PI) a += Math.PI*2; return a; };

function mouseStep(dt){
  if(!MOUSE.loaded || !MOUSE.root) return;
  const L = MOUSE_LIM, S = MOUSE.spec;
  const driving = mouseIsDriving();
  const thr = driving ? MOUSE.throttle : 0;

  /* --- longitudinal --- */
  const want = thr >= 0 ? thr * L.vMax : thr * L.vRev;
  let a;
  if(Math.abs(thr) < 0.02)            a = -Math.sign(MOUSE.speed) * L.coast;
  else if(want * MOUSE.speed < -1e-6) a = Math.sign(want) * L.brake;   // stick against travel
  else                                a = Math.sign(want - MOUSE.speed) * L.accel;
  const before = MOUSE.speed;
  MOUSE.speed += a * dt;
  if(Math.abs(thr) < 0.02 && before * MOUSE.speed < 0) MOUSE.speed = 0;   // coast to a stop, not backwards
  if(a > 0) MOUSE.speed = Math.min(MOUSE.speed, want > 0 ? want : L.vMax);
  if(a < 0) MOUSE.speed = Math.max(MOUSE.speed, want < 0 ? want : -L.vRev);

  /* --- steering: a servo, so it slews, it does not snap --- */
  const target = (driving ? MOUSE.steerCmd : 0) * L.steerMax;
  const ds = clamp(target - MOUSE.steer, -L.steerRate*dt, L.steerRate*dt);
  MOUSE.steer += ds;

  /* --- bicycle model about the rear axle --- */
  const yawRate = (Math.abs(MOUSE.steer) < 1e-5) ? 0
                : MOUSE.speed * Math.tan(MOUSE.steer) / S.wheelbase;
  MOUSE.yaw += yawRate * dt;
  MOUSE.pos.x += -Math.sin(MOUSE.yaw) * MOUSE.speed * dt;
  MOUSE.pos.z += -Math.cos(MOUSE.yaw) * MOUSE.speed * dt;
  MOUSE.pos.x = clamp(MOUSE.pos.x, -11, 11);
  MOUSE.pos.z = clamp(MOUSE.pos.z, -11, 11);
  MOUSE.root.position.set(MOUSE.pos.x, 0, MOUSE.pos.z);
  MOUSE.root.rotation.y = MOUSE.yaw;

  /* --- the trailer tracks; it is not dragged rigidly ---
     Standard tractor-trailer constraint with the pin `hitchBack` behind the
     driven axle: the trailer's axle may only move along its own heading.
        psi' = ( v*sin(theta-psi) - d*theta'*cos(theta-psi) ) / Lt
     Forwards this pulls it straight; in reverse the same equation diverges,
     which is the jack-knife, and it is real, so it is kept — only clamped so
     it cannot fold through the towbar. */
  const rel0 = _wrapPi(MOUSE.yaw - MOUSE.chYaw);
  const psiDot = (MOUSE.speed * Math.sin(rel0) - S.hitchBack * yawRate * Math.cos(rel0)) / S.trailerLen;
  MOUSE.chYaw += psiDot * dt;
  let rel = _wrapPi(MOUSE.yaw - MOUSE.chYaw);
  if(Math.abs(rel) > L.jack){ rel = Math.sign(rel) * L.jack; MOUSE.chYaw = MOUSE.yaw - rel; }
  MOUSE.chariot.rotation.y = -rel;          // the group is a child of the tractor

  /* --- wheels --- */
  MOUSE.spin  -= (MOUSE.speed / S.wheelR) * dt;
  /* the trailer's wheels see only the component of the tractor's speed along
     the trailer's own heading, which is why they slow through a tight turn */
  MOUSE.chSpin -= (MOUSE.speed * Math.cos(rel) / S.wheelR) * dt;
  /* Ackermann: both front wheels have to share one turn centre, so the inner
     one turns TIGHTER. Steer them by the same angle and the model scrubs its
     tyres on every corner. The formula handles either direction on its own —
     in a right-hand turn R goes negative and dR comes out the larger. */
  let dL = MOUSE.steer, dR = MOUSE.steer;
  if(Math.abs(MOUSE.steer) > 1e-4){
    const R = S.wheelbase / Math.tan(MOUSE.steer);        // +ve = turning left
    dL = Math.atan(S.wheelbase / (R - S.trackF/2));
    dR = Math.atan(S.wheelbase / (R + S.trackF/2));
  }
  for(const id in MOUSE.wheels){
    const w = MOUSE.wheels[id];
    if(w.steer) w.group.rotation.y = (id === 'FL') ? dL : dR;      // FL is -X, the left
    w.spin.rotation.x = w.trailer ? MOUSE.chSpin : MOUSE.spin;
  }
}

/* ------------------------------------------------------------------ view */
/* where the camera should sit when it is following whoever is driving */
function driverPos(){
  if(mouseIsDriving()) return new THREE.Vector3(MOUSE.pos.x, 0.28, MOUSE.pos.z);
  return new THREE.Vector3(R2.pos.x, 0.6, R2.pos.z);
}
function mouseSetShown(on){
  if(!MOUSE.root) return;
  MOUSE.root.visible = !!on;
  if(!on && mouseIsDriving()) mouseSetDriver('r2');
}

/* the stage button carries the whole selection now — see scene/models.js */
function mouseSyncBtn(){ if(typeof modelSyncBtn === 'function') modelSyncBtn(); }
