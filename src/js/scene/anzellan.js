'use strict';
/* =====================================================================
   ANZELLAN HEAD — a second animatronic, built the same way the droid is

   Mike sent a photo of a silicone Anzellan ("Babu Frik") puppet head on a
   bench stand and asked whether the sim could model one. This is that: a
   fully procedural head — no mesh file, no licence attached — with an
   ELEVEN CHANNEL face rig that plugs into the same ACT table the droid's
   panels use, so it sequences, exports and wires exactly like everything
   else already does.

   Eleven is not an accident: it is what a Mini Maestro 12 drives with one
   channel to spare, which is the board you would actually put in a head
   this size.

   WHY PROCEDURAL. The MK4 geometry is MrBaddeley's paid design and cannot
   travel (see HANDOVER §1). Anything added to this project that might be
   shown to anyone else has to be geometry-in-code, the same rule
   `scene/env.js` follows. So the skull is a deformed sphere, the jowls are
   a lathe, and the whiskers come out of a seeded PRNG — identical on every
   machine, which is also what makes them testable.

   FRAME. Local metres, Y up, front = -Z, matching the droid. LEFT and
   RIGHT are the PUPPET'S own, as they are on the CAD: the puppet's left is
   sim -X, which is the VIEWER'S RIGHT when you are looking at its face.

   The stand stays on the ground; everything above the neck lives in
   ANZ.head, so head pan/tilt/nod carry the jowls with them the way a real
   skin does.
   ===================================================================== */

const ANZ = {
  root: new THREE.Group(),      // world-anchored: the stand is furniture, not part of R2
  head: new THREE.Group(),      // pan / tilt / nod pivot, at the top of the stand
  jaw:  new THREE.Group(),
  brow: {l:null, r:null},
  eye:  {l:null, r:null},       // one group per eyeball, pivoting on its own centre
  lid:  {ul:null, ll:null, ur:null, lr:null},
  lipU: null, lipL: null,
  skull: null, jowls: null,
  whisk: [],
  shown: false,
  idle: true,
  built: false,
  t: 0,                          // idle clock
  blinkAt: 1.8, blinkT: -1,      // next blink, and how far into one we are
  gazeAt: 2.6, gaze: {x:0.5, y:0.5}, gazeTo: {x:0.5, y:0.5},
  drift: {pan:0.5, tilt:0.5, nod:0.5, to:{pan:0.5, tilt:0.5, nod:0.5}}, driftAt: 3.0
};

/* ------------------------------------------------------------ the rig
   `home` is where the channel rests. Doors are honestly 0 = shut, but a
   face is not a door: a brow's rest position is halfway up its travel and
   an eye's is dead centre, so each actuator carries its own home and
   anzRegister() seeds ACT/ACT_T with it. Everything is still 0..1 across
   the servo's full travel, which is what the Maestro will send. */
const ANZ_ACTS = [
  {id:'anzJaw',   label:'Frik jaw',            home:0.00},
  {id:'anzLipU',  label:'Frik upper lip',      home:0.30},
  {id:'anzLipL',  label:'Frik lower lip',      home:0.30},
  {id:'anzBrowL', label:'Frik left brow',      home:0.35},
  {id:'anzBrowR', label:'Frik right brow',     home:0.35},
  {id:'anzLids',  label:'Frik eyelids',        home:0.10},
  {id:'anzEyeX',  label:'Frik eyes pan',       home:0.50},
  {id:'anzEyeY',  label:'Frik eyes tilt',      home:0.50},
  {id:'anzPan',   label:'Frik head pan',       home:0.50},
  {id:'anzTilt',  label:'Frik head tilt',      home:0.50},
  {id:'anzNod',   label:'Frik head nod',       home:0.50}
];
const ANZ_KEYS = ANZ_ACTS.map(a => a.id);
function anzHome(act){ const a = ANZ_ACTS.find(x => x.id === act); return a ? a.home : 0; }

/* ----------------------------------------------------------- materials
   COLOUR, and the trap that eats it. This renderer is set to
   `outputEncoding = sRGBEncoding` but predates ColorManagement, so a hex
   handed to a material is taken as LINEAR and gets a gamma curve applied on
   the way out — every colour renders lighter and flatter than the number
   says. R2 is white and blue so nobody notices; flesh very much is not, and
   the first build came out as a pale grey ghost. So every colour here is
   written as the sRGB you would pick in a colour picker and converted once,
   at build time, by anzHue(). Same family of bug as the canvas-texture note
   in HANDOVER §7 — declare your colour space or lose your colour. */
function anzHue(hex){
  const c = new THREE.Color(hex);
  return c.convertSRGBToLinear ? c.convertSRGBToLinear() : c;
}
const ANZ_SKIN = 0xd8a189;                 // the base flesh tone, in sRGB
const ANZ_MAT = {
  skin:   new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.78, metalness:0.0, vertexColors:true}),
  mouth:  new THREE.MeshStandardMaterial({color:anzHue(0x2b1512), roughness:0.6, metalness:0.0, side:THREE.DoubleSide}),
  lip:    new THREE.MeshStandardMaterial({color:anzHue(0x53302a), roughness:0.42, metalness:0.0}),
  sclera: new THREE.MeshStandardMaterial({color:anzHue(0xd9a326), roughness:0.20, metalness:0.05}),
  iris:   new THREE.MeshStandardMaterial({color:anzHue(0x22505e), roughness:0.13, metalness:0.10}),
  pupil:  new THREE.MeshStandardMaterial({color:anzHue(0x05070a), roughness:0.10, metalness:0.0}),
  glint:  new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xffffff, emissiveIntensity:0.75, roughness:0.1}),
  hair:   new THREE.MeshStandardMaterial({color:anzHue(0xbdb3a1), roughness:0.95, metalness:0.0}),
  gogMet: new THREE.MeshStandardMaterial({color:anzHue(0x8c4d22), roughness:0.62, metalness:0.45}),
  gogTrim:new THREE.MeshStandardMaterial({color:anzHue(0x5d646c), roughness:0.40, metalness:0.75}),
  gogLens:new THREE.MeshStandardMaterial({color:anzHue(0x141a20), roughness:0.25, metalness:0.35}),
  decal:  new THREE.MeshStandardMaterial({color:anzHue(0xc9c2b2), roughness:0.75, metalness:0.05}),
  stand:  new THREE.MeshStandardMaterial({color:anzHue(0xe4e2dc), roughness:0.85, metalness:0.03}),
  standR: new THREE.MeshStandardMaterial({color:anzHue(0xc9c6be), roughness:0.88, metalness:0.03})
};

/* ------------------------------------------------------------- helpers */
/* Seeded LCG. The whiskers and the wrinkle field are random-LOOKING, not
   random: a test that measures the silhouette has to get the same numbers
   on every run, and so does Mike when he reopens the file. */
function anzRand(seed){
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function anzDeform(geo, fn){
  const p = geo.attributes.position, v = new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p, i);
    fn(v, i);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
/* Every skin mesh carries a colour attribute, because the eye sockets, the
   crown and the flush on the jowls are SHADING, not separate parts — and
   one material with vertex colours is one draw call instead of five. */
function anzPaint(geo, fn){
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n*3), v = new THREE.Vector3(), c = new THREE.Color();
  for(let i=0;i<n;i++){
    v.fromBufferAttribute(p, i);
    c.set(ANZ_SKIN);
    fn(v, c, i);            // fn mixes in sRGB, which is how anyone thinks about it
    anzHue(c.getHex()).toArray(col, i*3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function anzMesh(geo, mat){
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/* smooth 0..1 bump centred on c with half-width w */
function anzBump(x, c, w){
  const d = Math.abs(x - c) / w;
  return d >= 1 ? 0 : (1 - d*d) * (1 - d*d);
}
const anzLerp = (a,b,t) => a + (b-a)*t;

/* ---------------------------------------------------------- dimensions */
const ANZ_D = {
  standH: 0.455,       // ground → neck pivot
  standR: 0.044,
  skullR: 0.072,
  skullY: 0.088,
  eyeX:   0.0335,
  eyeY:   0.0930,
  eyeZ:  -0.0495,
  eyeR:   0.0200,
  noseY:  0.0700,
  mouthY: 0.0390,
  jawY:   0.0720,
  jawZ:   0.0000,
  mouthZ:-0.0730,
  hemY:  -0.0950
};

/* ============================================================= geometry */
function anzBuildSkull(){
  const D = ANZ_D;
  const rnd = anzRand(0x5EED17);
  /* a low-frequency wrinkle field: three fixed sine lobes per axis, sampled
     with the seeded PRNG so the skin has creases without a texture */
  const lobes = [];
  for(let i=0;i<11;i++) lobes.push({f: 6 + rnd()*13, px: rnd()*6.283, py: rnd()*6.283, a: 0.0010 + rnd()*0.0018});

  const geo = new THREE.SphereGeometry(D.skullR, 72, 48);
  anzDeform(geo, v => {
    const n = v.clone().normalize();
    let r = 1;
    /* Anzellans are wide and low-browed: broaden across, flatten the crown
       a touch, and pull the whole face forward into a shallow dish. */
    r *= 1 + 0.055 * anzBump(n.y, 0.75, 0.55);          // slightly domed crown
    r *= 1 - 0.030 * anzBump(n.y, 1.00, 0.35);          // but not a point

    /* brow shelf — one continuous heavy ridge right across the face, which
       is the single feature that makes this read as an Anzellan and not as
       a generic puppet head */
    const front = Math.max(0, -n.z);
    r += 0.150 * front * anzBump(n.y, 0.26, 0.24) * anzBump(Math.abs(n.x), 0.30, 0.62);
    /* the sockets sink back in under it */
    r -= 0.130 * front * anzBump(n.y, 0.06, 0.22) * anzBump(Math.abs(n.x), 0.40, 0.34);
    /* the muzzle pouch: the soft mass carrying the nose and mouth. Run it
       wide and it becomes a bright dome that swallows the whole lower face —
       narrow, and the cheeks stay separate from it the way they should. */
    r += 0.115 * front * anzBump(n.y, -0.30, 0.42) * anzBump(Math.abs(n.x), 0.0, 0.62);
    /* the nose BRIDGE is part of the skull, not a blob glued to it: a thin
       central ridge from between the sockets down onto the muzzle. Modelled
       separately it reads as a stalk. */
    r += 0.055 * front * anzBump(n.x, 0, 0.16) * anzBump(n.y, 0.00, 0.34);
    /* temples pinch in above the cheeks */
    r -= 0.060 * anzBump(Math.abs(n.x), 0.94, 0.28) * anzBump(n.y, 0.42, 0.42);

    v.copy(n).multiplyScalar(D.skullR * r);
    v.x *= 1.34;                                         // wide, low skull
    v.z *= 0.98;
    if(v.y < 0) v.y *= 0.86;                             // no long chin — the jowls do that job
    if(v.y > 0) v.y *= 0.86;                             // flattened crown

    /* wrinkles */
    let w = 0;
    for(const L of lobes) w += L.a * Math.sin(n.x*L.f + L.px) * Math.sin(n.y*L.f*0.8 + L.py);
    const skin = v.clone().normalize();
    v.addScaledVector(skin, w * (0.4 + 0.6*front));

    v.y += D.skullY;
  });
  anzPaint(geo, (v, c) => {
    const y = v.y - D.skullY;
    /* darker, greyer crown — leathery, and where the goggles have rubbed */
    c.lerp(new THREE.Color(0x9c8271), 0.65 * anzBump(y, 0.052, 0.048));
    /* the sockets: a deep bruise-grey mask round each eye, which is most of
       what gives the face its age */
    for(const sx of [-1, 1]){
      const d = Math.hypot((v.x - sx*ANZ_D.eyeX)*0.85, (v.y - ANZ_D.eyeY)*1.15, (v.z - ANZ_D.eyeZ)*0.55);
      c.lerp(new THREE.Color(0x54423b), 0.95 * Math.max(0, 1 - d/0.048));
    }
    /* warm, pinker flesh across the muzzle and low on the cheeks */
    c.lerp(new THREE.Color(0xd9977f), 0.85 * Math.max(0, Math.min(1, (-y + 0.016)/0.05)) * Math.max(0, -v.z/0.06));
    /* everything below the mouth line sits in the shadow of the muzzle and
       runs into the neck fold — leave it the same tone as the cheeks and the
       lower face reads as a second, bigger nose */
    c.lerp(new THREE.Color(0x9c7263), 0.75 * Math.max(0, Math.min(1, (ANZ_D.mouthY - 0.004 - v.y)/0.020)) * Math.max(0, -v.z/0.050));
  });
  return anzMesh(geo, ANZ_MAT.skin);
}

/* the big flared skin bell the head sits in — a lathe, with a wavy hem so
   it reads as slumped silicone rather than a lampshade */
function anzBuildJowls(){
  const D = ANZ_D;
  const TOP = 0.034;
  /* TRAP: a LatheGeometry's winding follows the ORDER of the profile points.
     Listed top-down, every normal points into the bell — the front of the
     skirt gets backface-culled and you see the inside of the back of it
     instead, which reads as two enormous ears. The profile runs BOTTOM-UP. */
  const prof = [
    [0.1080, D.hemY - 0.008],                            // the hem rolls under
    [0.1155, D.hemY], [0.1170, -0.082], [0.1140, -0.062],
    [0.1055, -0.042], [0.0955, -0.024], [0.0855, -0.008],
    [0.0755,  0.010], [0.0655, TOP]
  ].map(([r,y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(prof, 80);
  anzDeform(geo, v => {
    const a = Math.atan2(v.x, v.z);
    const t = Math.max(0, Math.min(1, (TOP - v.y) / (TOP - D.hemY)));
    /* a gentle drape, not a frill. The first attempt ran this at 3 cm and
       the bell grew two ears. */
    const wob = 1 + t*t * (0.020*Math.sin(a*4 - 0.4) + 0.011*Math.sin(a*7 + 1.1));
    v.x *= wob; v.z *= wob;
    v.z += t*t * 0.008;                                  // slumps forward under the chin
  });
  anzPaint(geo, (v, c) => {
    const t = Math.max(0, Math.min(1, (TOP - v.y) / (TOP - ANZ_D.hemY)));
    c.lerp(new THREE.Color(0xe9bfab), 0.8*t);            // paler, pinker toward the hem
    c.lerp(new THREE.Color(0x9d7c6d), 0.55*anzBump(t, 0.06, 0.15));  // shadow in the neck fold
  });
  return anzMesh(geo, ANZ_MAT.skin);
}

function anzBuildEye(sx){
  const D = ANZ_D;
  const g = new THREE.Group();
  g.position.set(sx*D.eyeX, D.eyeY, D.eyeZ);
  const ball = anzMesh(new THREE.SphereGeometry(D.eyeR, 28, 20), ANZ_MAT.sclera);
  ball.castShadow = false;
  g.add(ball);
  /* the iris is a shallow cap on the front of the ball, not a flat disc —
     a disc catches the light wrong when the eye rolls */
  const iris = anzMesh(new THREE.SphereGeometry(D.eyeR*1.012, 24, 16, 0, Math.PI*2, 0, 0.50), ANZ_MAT.iris);
  iris.rotation.x = -Math.PI/2; iris.castShadow = false;
  g.add(iris);
  const pup = anzMesh(new THREE.SphereGeometry(D.eyeR*1.02, 20, 14, 0, Math.PI*2, 0, 0.24), ANZ_MAT.pupil);
  pup.rotation.x = -Math.PI/2; pup.castShadow = false;
  g.add(pup);
  const glint = anzMesh(new THREE.SphereGeometry(D.eyeR*0.14, 10, 8), ANZ_MAT.glint);
  /* one key light means one catchlight, on the SAME side of both eyes —
     mirror it and the face immediately stops looking alive */
  glint.position.set(-0.0055, 0.0060, -D.eyeR*0.97); glint.castShadow = false;
  g.add(glint);
  return g;
}

/* an eyelid is a sphere cap slightly larger than the ball, pivoting on the
   ball's own centre — exactly how a lid is built on a real puppet */
function anzBuildLid(sx, upper){
  const D = ANZ_D;
  const geo = new THREE.SphereGeometry(D.eyeR*1.10, 26, 14, 0, Math.PI*2, 0, 1.15);
  anzDeform(geo, v => { v.z *= 1.06; });
  anzPaint(geo, (v, c) => {
    c.set(0xc09079);
    c.lerp(new THREE.Color(0x8a6a5c), 0.5 * Math.max(0, Math.min(1, v.y/(D.eyeR*0.9))));
  });
  const lid = anzMesh(geo, ANZ_MAT.skin);
  lid.rotation.x = upper ? Math.PI : 0;                  // cap opening faces the other lid
  const g = new THREE.Group();
  g.position.set(sx*D.eyeX, D.eyeY, D.eyeZ);
  g.add(lid);
  return g;
}

function anzBuildNose(){
  const D = ANZ_D;
  const g = new THREE.Group();
  const R = 0.0165;
  const geo = new THREE.SphereGeometry(R, 26, 18);
  anzDeform(geo, v => {
    /* short, wide and FLAT — an Anzellan nose is a pad set into the muzzle,
       not a snout. The first pass was a beak. */
    v.x *= 0.92; v.y *= 1.15; v.z *= 0.42;
    /* a groove down the bridge, and a slight upturn at the tip */
    v.z += 0.0045 * anzBump(v.x/R, 0, 0.45) * Math.max(0, v.y/(R*1.05));
    if(v.z < 0) v.z *= 1.05;
  });
  anzPaint(geo, (v, c) => { c.lerp(new THREE.Color(0xc4907b), 0.5); });
  g.add(anzMesh(geo, ANZ_MAT.skin));
  for(const sx of [-1, 1]){
    const n = anzMesh(new THREE.SphereGeometry(0.0048, 12, 8), ANZ_MAT.mouth);
    n.position.set(sx*0.0072, -0.0155, -0.0060);
    n.scale.set(1.3, 0.7, 0.8); n.castShadow = false;
    g.add(n);
  }
  g.position.set(0, D.noseY, -0.0755);
  return g;
}

/* a lip is a flattened torus arc — the arc is what gives the pursed,
   turned-down Anzellan mouth without modelling teeth nobody will see */
/* A lip is a flattened torus ARC. The arc is what gives the wide, pursed,
   turned-down Anzellan mouth — and it means the whole mouth is two meshes
   and a cavity rather than a modelled jaw with teeth nobody will ever see. */
function anzBuildLip(upper){
  const arc = upper ? 2.30 : 2.15;
  const geo = new THREE.TorusGeometry(0.0300, upper ? 0.0038 : 0.0031, 10, 36, arc);
  anzDeform(geo, v => { v.y *= upper ? 0.34 : 0.42; v.z *= 0.95; });
  const m = anzMesh(geo, ANZ_MAT.lip);
  m.rotation.z = upper ? (Math.PI - arc)/2 + Math.PI : (Math.PI - arc)/2;
  m.rotation.x = upper ? -0.30 : 0.24;
  return m;
}

function anzBuildMouth(){
  const D = ANZ_D;
  const g = new THREE.Group();
  const cav = anzMesh(new THREE.SphereGeometry(0.019, 20, 14), ANZ_MAT.mouth);
  cav.scale.set(1.55, 0.22, 0.36); cav.castShadow = false;
  g.add(cav);
  g.position.set(0, D.mouthY, D.mouthZ);
  return g;
}

/* The brow is a fold of skin sitting ON the ridge, wide and shallow, so it
   reads as part of the face when it is down and as a raised crease when the
   channel drives it up. Make it a ball and it looks like a caterpillar. */
function anzBuildBrow(sx){
  const D = ANZ_D;
  const geo = new THREE.SphereGeometry(0.016, 22, 14);
  anzDeform(geo, v => {
    v.x *= 2.20; v.y *= 0.30; v.z *= 0.48;
    v.y -= 0.0032 * Math.abs(v.x/0.035);                 // droops at the outer end
  });
  anzPaint(geo, (v, c) => { c.lerp(new THREE.Color(0xb08f7c), 0.55); });
  const m = anzMesh(geo, ANZ_MAT.skin);
  const g = new THREE.Group();
  g.position.set(sx*(D.eyeX + 0.004), D.eyeY + 0.0195, D.eyeZ - 0.0135);
  g.rotation.z = -sx*0.13;
  g.add(m);
  return g;
}

/* The whiskers are the thing that makes the photo read as a puppet rather
   than a mask, so there are a lot of them and they are messy on purpose.
   Seeded, so "messy" is the same mess every time. */
function anzBuildWhiskers(parent){
  const D = ANZ_D;
  const rnd = anzRand(0xBABF21);
  const add = (origin, dir, len, r0) => {
    const geo = new THREE.CylinderGeometry(0.00022, r0, len, 4, 1, true);
    geo.translate(0, len/2, 0);
    const w = new THREE.Mesh(geo, ANZ_MAT.hair);
    w.position.copy(origin);
    w.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
    parent.add(w);
    ANZ.whisk.push(w);
  };
  /* Brow tufts — the signature. They sprout from the OUTER half of each
     brow and sweep up and back, so they break the silhouette at the temples
     the way the photo does. Fewer and finer than the first pass, which came
     out looking like broken glass. */
  for(const sx of [-1, 1]) for(let i=0;i<6;i++){
    const t = i/5;
    const o = new THREE.Vector3(
      sx*(0.040 + t*0.028) + (rnd()-0.5)*0.004,
      D.eyeY + 0.023 + (rnd()-0.5)*0.008,
      D.eyeZ - 0.012 + t*0.028 + (rnd()-0.5)*0.005);
    const d = new THREE.Vector3(sx*(1.15 + rnd()*0.75), 0.35 + rnd()*0.55, 0.10 + rnd()*0.50);
    add(o, d, 0.020 + rnd()*0.020, 0.00034 + rnd()*0.00018);
  }
  /* jowl whiskers — shorter, splaying sideways and down past the jaw */
  for(const sx of [-1, 1]) for(let i=0;i<5;i++){
    const t = i/4;
    const o = new THREE.Vector3(
      sx*(0.048 + t*0.012) + (rnd()-0.5)*0.004,
      D.mouthY - 0.002 - t*0.020 + (rnd()-0.5)*0.006,
      -0.042 + t*0.024 + (rnd()-0.5)*0.006);
    const d = new THREE.Vector3(sx*(0.95 + rnd()*0.5), -0.25 + rnd()*0.55, -0.20 + rnd()*0.45);
    add(o, d, 0.015 + rnd()*0.015, 0.00030 + rnd()*0.00016);
  }
  /* a few strays off the crown, escaping under the goggles */
  for(let i=0;i<3;i++){
    const a = 2.2 + rnd()*1.9;
    const o = new THREE.Vector3(Math.sin(a)*0.036, D.skullY + 0.046, Math.cos(a)*0.030 + 0.008);
    add(o, new THREE.Vector3(Math.sin(a)*0.6, 1, Math.cos(a)*0.6), 0.014 + rnd()*0.014, 0.00035);
  }
}

/* welding goggles shoved up onto the crown — the detail that dates the
   character. Extruded silhouette, so it stays faceted and machined-looking
   next to all that soft skin. */
function anzBuildGoggles(){
  const g = new THREE.Group();
  /* Silhouette in x-y, extruded back along z: a flat top with clipped
     shoulders, the way a stamped metal welding shield actually is. Low and
     wide — the first pass was a shoebox on his head. */
  const sh = new THREE.Shape();
  sh.moveTo(-0.080, -0.010);
  sh.lineTo(-0.080,  0.006);
  sh.lineTo(-0.046,  0.024);
  sh.lineTo( 0.000,  0.030);
  sh.lineTo( 0.046,  0.024);
  sh.lineTo( 0.080,  0.006);
  sh.lineTo( 0.080, -0.010);
  sh.lineTo(-0.080, -0.010);
  const geo = new THREE.ExtrudeGeometry(sh, {depth:0.072, bevelEnabled:true, bevelSize:0.0030,
                                             bevelThickness:0.0026, bevelSegments:2, curveSegments:1});
  geo.translate(0, 0, -0.050);
  g.add(anzMesh(geo, ANZ_MAT.gogMet));

  /* the dark lens band across the front lip */
  const lens = anzMesh(new THREE.BoxGeometry(0.120, 0.020, 0.010), ANZ_MAT.gogLens);
  lens.position.set(0, -0.001, -0.053);
  g.add(lens);
  const bez = anzMesh(new THREE.BoxGeometry(0.134, 0.028, 0.005), ANZ_MAT.gogTrim);
  bez.position.set(0, -0.001, -0.0565);
  g.add(bez);

  /* rivets down both shoulders */
  for(const sx of [-1, 1]) for(let i=0;i<3;i++){
    const r = anzMesh(new THREE.SphereGeometry(0.0036, 10, 8), ANZ_MAT.gogTrim);
    r.position.set(sx*0.069, 0.000, -0.034 + i*0.024);
    g.add(r);
  }
  /* the little striped decal on the puppet's right shoulder, like the photo */
  const dec = anzMesh(new THREE.BoxGeometry(0.024, 0.0014, 0.013), ANZ_MAT.decal);
  dec.position.set(0.030, 0.0232, -0.018);
  g.add(dec);
  for(let i=0;i<4;i++){
    const s = anzMesh(new THREE.BoxGeometry(0.0020, 0.0016, 0.013), ANZ_MAT.gogLens);
    s.position.set(0.023 + i*0.0050, 0.0236, -0.018);
    g.add(s);
  }
  /* the head strap, running back over the crown from each side. A torus arc
     stood straight up like a suitcase handle on the first pass — the axis
     has to lie ACROSS the head, not along it. */
  for(const sx of [-1, 1]){
    const st = anzMesh(new THREE.BoxGeometry(0.006, 0.0035, 0.062), ANZ_MAT.gogLens);
    st.position.set(sx*0.076, -0.002, 0.012);
    st.rotation.y = -sx*0.16;
    g.add(st);
  }

  g.position.set(0, ANZ_D.skullY + 0.050, 0.008);
  g.rotation.x = -0.24;                                   // tipped back off the eyes
  return g;
}

/* the bench stand: a stack of turned white rings, as in the photo */
function anzBuildStand(){
  const D = ANZ_D, g = new THREE.Group();
  const post = anzMesh(new THREE.CylinderGeometry(D.standR, D.standR*1.10, D.standH, 40, 1), ANZ_MAT.stand);
  post.position.y = D.standH/2;
  g.add(post);
  /* turned rings, but only on the part the skirt does not cover */
  for(let i=0;i<4;i++){
    const r = anzMesh(new THREE.TorusGeometry(D.standR*1.02, 0.0038, 8, 40), ANZ_MAT.standR);
    r.rotation.x = Math.PI/2; r.position.y = 0.052 + i*0.058;
    g.add(r);
  }
  const base = anzMesh(new THREE.CylinderGeometry(D.standR*1.75, D.standR*1.95, 0.016, 40), ANZ_MAT.stand);
  base.position.y = 0.008;
  g.add(base);
  return g;
}

function buildAnzellan(){
  if(ANZ.built) return ANZ.root;
  const D = ANZ_D;

  ANZ.root.add(anzBuildStand());
  ANZ.head.position.y = D.standH;
  ANZ.root.add(ANZ.head);

  ANZ.jowls = anzBuildJowls(); ANZ.head.add(ANZ.jowls);
  ANZ.skull = anzBuildSkull(); ANZ.head.add(ANZ.skull);
  ANZ.head.add(anzBuildNose());

  ANZ.eye.l = anzBuildEye(-1); ANZ.eye.r = anzBuildEye(1);
  ANZ.head.add(ANZ.eye.l); ANZ.head.add(ANZ.eye.r);
  ANZ.lid.ul = anzBuildLid(-1, true);  ANZ.lid.ll = anzBuildLid(-1, false);
  ANZ.lid.ur = anzBuildLid( 1, true);  ANZ.lid.lr = anzBuildLid( 1, false);
  for(const k of ['ul','ll','ur','lr']) ANZ.head.add(ANZ.lid[k]);

  ANZ.brow.l = anzBuildBrow(-1); ANZ.brow.r = anzBuildBrow(1);
  ANZ.head.add(ANZ.brow.l); ANZ.head.add(ANZ.brow.r);

  ANZ.head.add(anzBuildMouth());
  ANZ.lipU = anzBuildLip(true);
  ANZ.lipU.position.set(0, D.mouthY + 0.0088, D.mouthZ - 0.0035);
  ANZ.head.add(ANZ.lipU);

  /* the jaw pivots where a real one does — up behind the cheeks, not at
     the chin. Hinge it at the chin and the mouth slides instead of opening. */
  ANZ.jaw.position.set(0, D.jawY, D.jawZ);
  ANZ.head.add(ANZ.jaw);
  ANZ.lipL = anzBuildLip(false);
  ANZ.lipL.position.set(0, D.mouthY - 0.0092 - D.jawY, D.mouthZ - 0.0025 - D.jawZ);
  ANZ.jaw.add(ANZ.lipL);
  {
    const geo = new THREE.SphereGeometry(0.019, 24, 16);
    anzDeform(geo, v => { v.x *= 1.60; v.y *= 0.52; v.z *= 0.62; });
    anzPaint(geo, (v, c) => { c.lerp(new THREE.Color(0xb98974), 0.6); });
    const chin = anzMesh(geo, ANZ_MAT.skin);
    chin.position.set(0, D.mouthY - 0.0090 - D.jawY, D.mouthZ + 0.0065 - D.jawZ);
    ANZ.jaw.add(chin);
  }

  anzBuildWhiskers(ANZ.head);
  ANZ.head.add(anzBuildGoggles());

  /* stands to the viewer's right of the droid, turned in slightly so the
     face is readable from the default 3/4 camera */
  ANZ.root.position.set(-0.86, 0, 0.12);
  ANZ.root.rotation.y = 0.26;
  ANZ.root.visible = false;
  ANZ.built = true;
  return ANZ.root;
}

/* =========================================================== actuators
   The keys only exist while the head is on stage. ACT is what the Outputs
   table, the wiring sheet and the sequencer all read, and eleven dead face
   channels sitting in an R2-only build would be noise on every one of
   them. Registering on show and dropping on hide keeps that honest. */
function anzRegister(){
  for(const a of ANZ_ACTS){ ACT[a.id] = a.home; ACT_T[a.id] = a.home; }
}
function anzUnregister(){
  for(const a of ANZ_ACTS){ delete ACT[a.id]; delete ACT_T[a.id]; }
}
function anzIsAct(k){ return ANZ_KEYS.indexOf(k) >= 0; }

function anzSetShown(on){
  ANZ.shown = !!on;
  if(ANZ.shown && !ANZ.built) buildAnzellan();
  if(ANZ.root) ANZ.root.visible = ANZ.shown;
  if(ANZ.shown) anzRegister(); else anzUnregister();
  if(typeof modelSyncBtn === 'function') modelSyncBtn();
  /* the Outputs table is built from Object.keys(ACT), so it has to be told */
  if(typeof buildOutputs === 'function') buildOutputs();
  if(typeof lg === 'function') lg('sys', 'Anzellan head ' + (ANZ.shown ? 'on stage — 11 face channels registered' : 'off stage'));
}

/* Is a real board driving this channel? If it is, the idle loop keeps its
   hands off — the whole point of the simulator is that what you see is
   what the hardware would do, and a "lifelike" wobble laid over a Maestro
   sequence would be a lie about the servo. */
function anzOwned(act){
  if(typeof PROFILE === 'undefined' || !PROFILE.hasMaestro) return false;
  if(typeof blockChan !== 'function') return false;
  return !!blockChan(act);
}

/* ============================================================ animation */
function anzIdle(dt){
  ANZ.t += dt;
  const set = (k, v) => { if(!anzOwned(k)) ACT_T[k] = v; };

  /* blink — a fast close, a slower open, at irregular intervals */
  if(ANZ.blinkT >= 0){
    ANZ.blinkT += dt;
    const b = ANZ.blinkT < 0.09 ? ANZ.blinkT/0.09 : Math.max(0, 1 - (ANZ.blinkT-0.09)/0.17);
    set('anzLids', anzLerp(anzHome('anzLids'), 1, b));
    if(ANZ.blinkT > 0.28){ ANZ.blinkT = -1; ANZ.blinkAt = ANZ.t + 1.6 + Math.random()*4.2; }
  }else{
    set('anzLids', anzHome('anzLids') + 0.05*Math.sin(ANZ.t*0.7));
    if(ANZ.t >= ANZ.blinkAt) ANZ.blinkT = 0;
  }

  /* gaze — saccade to a new target, then hold */
  if(ANZ.t >= ANZ.gazeAt){
    ANZ.gazeTo.x = 0.5 + (Math.random()-0.5)*0.75;
    ANZ.gazeTo.y = 0.5 + (Math.random()-0.5)*0.45;
    ANZ.gazeAt = ANZ.t + 1.1 + Math.random()*3.0;
  }
  const gk = Math.min(1, dt*11);
  ANZ.gaze.x += (ANZ.gazeTo.x - ANZ.gaze.x)*gk;
  ANZ.gaze.y += (ANZ.gazeTo.y - ANZ.gaze.y)*gk;
  set('anzEyeX', ANZ.gaze.x); set('anzEyeY', ANZ.gaze.y);

  /* head drift — slow, so it reads as breathing rather than twitching */
  if(ANZ.t >= ANZ.driftAt){
    ANZ.drift.to.pan  = 0.5 + (Math.random()-0.5)*0.42;
    ANZ.drift.to.tilt = 0.5 + (Math.random()-0.5)*0.30;
    ANZ.drift.to.nod  = 0.5 + (Math.random()-0.5)*0.26;
    ANZ.driftAt = ANZ.t + 2.4 + Math.random()*4.5;
  }
  const dk = Math.min(1, dt*1.7);
  for(const k of ['pan','tilt','nod']){
    ANZ.drift[k] += (ANZ.drift.to[k] - ANZ.drift[k])*dk;
    set('anz' + k[0].toUpperCase() + k.slice(1), ANZ.drift[k] + (k==='nod' ? 0.012*Math.sin(ANZ.t*1.35) : 0));
  }

  /* talks along with the droid: the same SND.at window the logic displays
     use, so the two read as one conversation */
  const talking = (typeof SND !== 'undefined' && typeof SIM !== 'undefined') && (SIM.millis - SND.at) < 1400;
  if(talking){
    set('anzJaw', 0.16 + 0.52*Math.abs(Math.sin(ANZ.t*13.5)) * (0.5 + 0.5*Math.sin(ANZ.t*4.1)));
    set('anzLipU', 0.30 + 0.22*Math.abs(Math.sin(ANZ.t*9.0)));
    set('anzBrowL', 0.35 + 0.30*Math.abs(Math.sin(ANZ.t*3.3)));
    set('anzBrowR', 0.35 + 0.30*Math.abs(Math.sin(ANZ.t*3.3 + 0.6)));
  }else{
    set('anzJaw', 0.03 + 0.03*Math.max(0, Math.sin(ANZ.t*0.9)));
    set('anzLipU', anzHome('anzLipU'));
    set('anzBrowL', 0.35 + 0.10*Math.sin(ANZ.t*0.55));
    set('anzBrowR', 0.35 + 0.10*Math.sin(ANZ.t*0.55 + 0.35));
  }
}

/* ACT → pose. Everything here is a pure read of ACT, exactly like
   applyToModel() and applyCadActuators(): the servo model owns the value,
   this only decides what that value looks like. */
function applyAnzellan(dt){
  if(!ANZ.shown || !ANZ.built) return;
  if(ANZ.idle) anzIdle(dt);
  const A = k => { const v = ACT[k]; return v === undefined ? anzHome(k) : v; };
  const bi = k => (A(k) - 0.5) * 2;                       // bipolar channels

  ANZ.head.rotation.y =  bi('anzPan')  * 0.62;
  ANZ.head.rotation.z = -bi('anzTilt') * 0.34;
  ANZ.head.rotation.x =  bi('anzNod')  * 0.40;

  ANZ.jaw.rotation.x = A('anzJaw') * 0.46;

  ANZ.lipU.position.y = ANZ_D.mouthY + 0.0088 + (A('anzLipU') - 0.30) * 0.0075;
  ANZ.lipU.rotation.x = -0.30 - (A('anzLipU') - 0.30) * 0.55;
  ANZ.lipL.position.y = ANZ_D.mouthY - 0.0092 - ANZ_D.jawY - (A('anzLipL') - 0.30) * 0.0070;
  ANZ.lipL.rotation.x =  0.24 + (A('anzLipL') - 0.30) * 0.50;

  const brow = (g, v, sx) => {
    g.position.y = ANZ_D.eyeY + 0.0195 + (v - 0.35) * 0.0120;
    g.rotation.z = -sx*0.13 + (v - 0.35) * sx * 0.40;     // rises and angles outward
  };
  brow(ANZ.brow.l, A('anzBrowL'), -1);
  brow(ANZ.brow.r, A('anzBrowR'),  1);

  /* eyes: both balls roll on their own centres, so the highlights stay put
     relative to the iris the way real eyes do */
  const ex = bi('anzEyeX'), ey = bi('anzEyeY');
  for(const e of [ANZ.eye.l, ANZ.eye.r]){
    e.rotation.y = -ex * 0.42;
    e.rotation.x =  ey * 0.30;
  }

  /* one channel, two lids: the upper does most of the travel, as it does on
     a face and on any sensible one-servo lid mechanism */
  const lids = A('anzLids');
  ANZ.lid.ul.rotation.x = -0.55 + lids * 1.30;
  ANZ.lid.ur.rotation.x = -0.55 + lids * 1.30;
  ANZ.lid.ll.rotation.x =  0.62 - lids * 0.62;
  ANZ.lid.lr.rotation.x =  0.62 - lids * 0.62;
  /* the lids track the gaze, otherwise a rolled-up eye looks lidless */
  for(const k of ['ul','ur']) ANZ.lid[k].rotation.z = -ex * 0.10;
  for(const k of ['ll','lr']) ANZ.lid[k].rotation.z = -ex * 0.06;
}

/* the droid's Reset pose button should put the face back too */
function anzResetPose(){
  for(const a of ANZ_ACTS){ if(ACT[a.id] !== undefined){ ACT[a.id] = a.home; ACT_T[a.id] = a.home; } }
  ANZ.gaze = {x:0.5, y:0.5}; ANZ.gazeTo = {x:0.5, y:0.5};
  ANZ.drift = {pan:0.5, tilt:0.5, nod:0.5, to:{pan:0.5, tilt:0.5, nod:0.5}};
  ANZ.blinkT = -1;
}
