'use strict';
/* -------------------------------------------------------------- scene */
let renderer, scene, camera, grid, ground, shadowKey;
/* held in one place so the theme switch can retint them.
   keyOff is the key light's OFFSET from the droid (updateCamera keeps the
   shadow frustum centred on R2) — the stage-lighting pass (v1.18.0, B3)
   made it data so a theme or an environment can move the sun, not just
   retint it. */
const LIGHTS = { hemi:null, key:null, rim:null, fill:null, keyOff:null };
// theta is measured so that PI puts the camera in front of the droid (it faces -Z)
const CAM = { theta:Math.PI-0.62, phi:1.15, dist:2.25, target:V3(0,0.6,0), follow:false };

function initScene(){
  const stage = document.getElementById('stage');
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0d13, 7, 22);

  camera = new THREE.PerspectiveCamera(38, stage.clientWidth/stage.clientHeight, 0.05, 100);

  /* THE RIG (v1.18.0, B3 — "ground the hero"). Positions are chosen for the
     DEFAULT 3/4 camera (theta = PI-0.62, in front of the droid, screen-right
     of centre):
       · key    — high, camera side, screen-right: models the front, throws
                  the cast shadow compactly behind-left rather than in a
                  lake across the foreground
       · rim    — behind the subject over its screen-left shoulder, so the
                  shadow-side silhouette separates from the fog instead of
                  melting into it
       · fill   — low, screen-left, camera side: lifts the shade a touch
       · hemi   — the ambient bath; kept LOW enough that the key can model
     Intensities and colours here are only the boot values — applyStageTheme
     and envApply own them from the first frame (see THEME_3D / ENVS). */
  LIGHTS.hemi = new THREE.HemisphereLight(0x9dc0ff, 0x161b22, 0.42);
  scene.add(LIGHTS.hemi);
  LIGHTS.keyOff = V3(-2.4, 5.0, -2.0);
  shadowKey = new THREE.DirectionalLight(0xfff1de, 1.35);
  shadowKey.position.copy(LIGHTS.keyOff);
  shadowKey.castShadow = true;
  shadowKey.shadow.mapSize.set(2048,2048);
  const sc = shadowKey.shadow.camera;
  sc.left=-7.5; sc.right=7.5; sc.top=7.5; sc.bottom=-7.5; sc.near=0.5; sc.far=22;
  shadowKey.shadow.bias = -0.0008;
  scene.add(shadowKey);
  scene.add(shadowKey.target);
  LIGHTS.key = shadowKey;
  LIGHTS.rim = new THREE.DirectionalLight(0x59e2f2, 1.05); LIGHTS.rim.position.set(2.8,3.0,2.6); scene.add(LIGHTS.rim);
  LIGHTS.fill= new THREE.DirectionalLight(0x9db8d8, 0.30); LIGHTS.fill.position.set(3.0,0.9,-1.2); scene.add(LIGHTS.fill);

  /* the floor runs well past the fog so an environment never shows a hard
   horizon edge where the disc stops */
  ground = new THREE.Mesh(new THREE.CircleGeometry(60,72), new THREE.MeshStandardMaterial({color:0x141a22, roughness:.95, metalness:.05}));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
  grid = new THREE.GridHelper(24, 48, 0x2a3542, 0x1b232c);
  grid.material.opacity=.65; grid.material.transparent=true; grid.position.y=0.002;
  scene.add(grid);

  buildBody(); buildDome(); buildLegs();
  scene.add(R2.root);
  /* the Anzellan head is world-anchored furniture, not part of the droid —
     it stays on its stand when R2 drives off */
  scene.add(buildAnzellan());

  initContactShadows();

  window.addEventListener('resize', onResize);
  bindCamera(stage);
  onResize();
}

/* =====================================================================
   CONTACT SHADOWS (v1.18.0, B3)

   The directional key already casts a real PCF shadow map, but a sun
   shadow is thrown OFF to one side: the floor directly under the feet
   stays fully lit and the model reads as floating on a bright pool.
   What grounds an object is ambient occlusion at the contact — darkness
   in the crevice where foot meets floor, whatever direction the sun is.

   These are the cheap, honest version of that: ONE radial-gradient
   canvas texture (drawn once — never redrawn per frame, swiftshader
   renders this app in tests) on a handful of ground-hugging planes,
   one per point of real contact:

     · droid   — one blob per FOOT (three), plus a faint wide pool for
                 the body's own sky occlusion (a 0.5 m barrel 0.25 m off
                 the floor really does shade the ground under it)
     · frik    — one blob under the STAND's base ring. The head is
                 world-anchored furniture; the shadow belongs to the
                 stand, not the face.
     · mouse   — one blob for the four-wheel chassis (an RC car sits
                 low over its whole footprint), sized off the MEASURED
                 wheelbase/track once the payload has loaded
     · chariot — its own blob under its OWN axle only. The towbar rides
                 in the air at the hitch — painting contact under it
                 would claim a touch that is not there.

   shadowTick() (once a frame, from updateCamera) only moves groups to
   follow R2.pos / MOUSE.pos / chYaw and mirrors each model's visibility
   — the blobs are deliberately NOT parented into the model trees, so a
   payload rebuild (buildMouse disposes and remakes MOUSE.root) cannot
   take them down with it, and MOUSE.stats/CAD.stats draw counts stay
   exactly what the tests pin.

   Strength is a global scale (setShadowStrength) so the theme and the
   environments can sit the blobs into their own light levels; the shape
   never changes. Sits at y=0.0095 — above the grid (0.002) and the
   practice-track ribbon (0.006) — depthWrite off so it layers cleanly.
   ===================================================================== */
const SHADOW = { tex:null, droid:null, frik:null, mouse:null, chariot:null,
                 blobs:[], mouseBlob:null, chariotBlob:null,
                 strength:0.6, mouseSized:false };
const SHADOW_Y = 0.0095;

/* The gradient is an OPAQUE luminance canvas read through alphaMap, NOT an
   rgba canvas used as map. Found the hard way: a canvas with per-pixel
   ALPHA uploads as alpha=0 in this app under headless swiftshader (the
   identical texture works in a bare page — the difference is somewhere in
   the driver's canvas-unpremultiply path, and it cost most of a day), while
   opaque canvases upload correctly everywhere. alphaMap reads the GREEN
   channel, so the blob never touches canvas alpha at all.
   NOTE this texture deliberately does NOT declare sRGBEncoding: the §3 law
   is about COLOUR textures being decoded on output — an alphaMap is
   sampled raw as an alpha ramp, and tagging it sRGB would have the hardware
   gamma-decode the ramp and harden the falloff. */
function contactTexture(){
  if(SHADOW.tex) return SHADOW.tex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128,128,0, 128,128,128);
  /* dense centre, long feather — a linear ramp reads as a fuzzy ball */
  g.addColorStop(0.00,'#ebebeb');   // alpha 0.92
  g.addColorStop(0.40,'#b3b3b3');   // alpha 0.70
  g.addColorStop(0.68,'#4d4d4d');   // alpha 0.30
  g.addColorStop(0.88,'#171717');   // alpha 0.09
  g.addColorStop(1.00,'#000000');   // alpha 0 — plane corners clamp to this
  x.fillStyle = g; x.fillRect(0,0,256,256);
  SHADOW.tex = new THREE.CanvasTexture(c);
  return SHADOW.tex;
}
/* an elliptical blob: rx/rz are HALF-extents in metres, k the per-blob
   weight inside the global strength */
function contactBlob(parent, x, z, rx, rz, k){
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2,2),
    new THREE.MeshBasicMaterial({color:0x000000, alphaMap:contactTexture(),
                                 transparent:true, depthWrite:false,
                                 opacity:k*SHADOW.strength}));
  m.rotation.x = -Math.PI/2;
  m.scale.set(rx, rz, 1);
  m.position.set(x, SHADOW_Y, z);
  m.renderOrder = 2;              // after the (transparent) grid lines
  m.userData.k = k;
  SHADOW.blobs.push(m);
  parent.add(m);
  return m;
}

function initContactShadows(){
  /* droid — feet at the procedural/CAD stance: side feet ±0.33, the third
     leg planted forward */
  const d = SHADOW.droid = new THREE.Group();
  contactBlob(d, -0.33,  0.01, 0.14, 0.28, 0.85);
  contactBlob(d,  0.33,  0.01, 0.14, 0.28, 0.85);
  contactBlob(d,  0.00, -0.26, 0.12, 0.24, 0.80);
  contactBlob(d,  0.00, -0.05, 0.44, 0.50, 0.28);   // the body's sky occlusion
  scene.add(d);

  /* frik — under the stand's turned base ring (r = 0.086) */
  const f = SHADOW.frik = new THREE.Group();
  contactBlob(f, 0, 0, 0.155, 0.155, 0.85);
  scene.add(f);

  /* mouse + chariot — placeholders until the payload's measured chassis
     arrives (shadowSizeMouse) */
  const m = SHADOW.mouse = new THREE.Group();
  SHADOW.mouseBlob = contactBlob(m, 0, -0.17, 0.16, 0.42, 0.85);
  scene.add(m);
  const ch = SHADOW.chariot = new THREE.Group();
  SHADOW.chariotBlob = contactBlob(ch, 0, 0, 0.16, 0.14, 0.80);
  scene.add(ch);

  SHADOW.droid.visible = SHADOW.frik.visible = false;
  SHADOW.mouse.visible = SHADOW.chariot.visible = false;
}

/* size the vehicle blobs off the geometry the header MEASURED — same rule
   as the drive model: nothing here is a guessed number */
function shadowSizeMouse(){
  const S = MOUSE.spec, V = MOUSE.header && MOUSE.header.vehicle;
  if(!S || !V) return;
  const r = V.wheelR;
  const track = Math.max(S.trackF, S.trackR);
  const mb = SHADOW.mouseBlob;
  mb.scale.set(track/2 + r*0.9, S.wheelbase/2 + r*1.6, 1);
  mb.position.z = -S.wheelbase/2;          // between the axles (front = -Z of the rear-axle origin)
  const tw = V.wheels.filter(w=>w.trailer);
  if(tw.length){
    const xs = tw.map(w=>w.c[0]);
    const trTrack = Math.max.apply(null,xs) - Math.min.apply(null,xs);
    SHADOW.chariotBlob.scale.set(trTrack/2 + r*0.9, r*1.8, 1);
  }
  SHADOW.mouseSized = true;
}

/* the theme and the environments own how hard the contact reads */
function setShadowStrength(s){
  SHADOW.strength = s;
  for(const b of SHADOW.blobs) b.material.opacity = b.userData.k * s;
}

/* once a frame, from updateCamera — transforms and visibility only, no
   canvas work, no allocation */
function shadowTick(){
  if(!SHADOW.droid) return;
  const d = SHADOW.droid;
  d.visible = !!(typeof R2 !== 'undefined' && R2.root && R2.root.visible);
  if(d.visible){ d.position.set(R2.pos.x, 0, R2.pos.z); d.rotation.y = R2.yaw; }

  const f = SHADOW.frik;
  f.visible = !!(typeof ANZ !== 'undefined' && ANZ.root && ANZ.root.visible);
  if(f.visible){
    f.position.set(ANZ.root.position.x, 0, ANZ.root.position.z);
    f.rotation.y = ANZ.root.rotation.y;
  }

  const hasMouse = typeof MOUSE !== 'undefined' && MOUSE.loaded && MOUSE.root && MOUSE.root.visible;
  if(hasMouse && !SHADOW.mouseSized) shadowSizeMouse();
  SHADOW.mouse.visible = SHADOW.chariot.visible = !!(hasMouse && SHADOW.mouseSized);
  if(SHADOW.mouse.visible){
    SHADOW.mouse.position.set(MOUSE.pos.x, 0, MOUSE.pos.z);
    SHADOW.mouse.rotation.y = MOUSE.yaw;
    /* the chariot's blob sits under its own axle: hitch = hitchBack behind
       the rear axle along the TRACTOR's heading, axle = trailerLen further
       along the TRAILER's own world heading (chYaw) */
    const S = MOUSE.spec;
    const hx = MOUSE.pos.x + Math.sin(MOUSE.yaw)*S.hitchBack;
    const hz = MOUSE.pos.z + Math.cos(MOUSE.yaw)*S.hitchBack;
    SHADOW.chariot.position.set(hx + Math.sin(MOUSE.chYaw)*S.trailerLen, 0,
                                hz + Math.cos(MOUSE.chYaw)*S.trailerLen);
    SHADOW.chariot.rotation.y = MOUSE.chYaw;
  }
}

function onResize(){
  const stage = document.getElementById('stage');
  camera.aspect = stage.clientWidth/stage.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight);
}
