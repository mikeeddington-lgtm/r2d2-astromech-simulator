'use strict';
/* =====================================================================
   3D — procedural R2 unit + scene + custom orbit camera
   ===================================================================== */
const V3 = (x,y,z)=>new THREE.Vector3(x,y,z);
const DOME_R = 0.25;
const BODY_R = 0.25;
const BODY_H = 0.66;
const BODY_Y = 0.585;                 // body centre height
const BODY_TOP = BODY_Y + BODY_H/2;   // 0.915
const ARM_BASE = 0.075;               // retracted arm origin (fully inside the barrel)
const ARM_SPAN = 0.320;               // travel from fully in to fully out
/* front-face layout (body spans y 0.255 → 0.915) */
const UTIL_UP_Y = 0.880;              // upper utility arm hinge
const UTIL_LO_Y = 0.748;              // lower utility arm hinge
const DOOR_Y    = 0.505;              // breadpan door + arm centreline
const SMALL_Y   = 0.362;              // dataport / chargebay hinge

const MAT = {
  white:  new THREE.MeshStandardMaterial({color:0xe9edf1, metalness:.25, roughness:.42}),
  silver: new THREE.MeshStandardMaterial({color:0xb9c2cb, metalness:.75, roughness:.32}),
  steel:  new THREE.MeshStandardMaterial({color:0x8d97a3, metalness:.85, roughness:.28}),
  blue:   new THREE.MeshStandardMaterial({color:0x2b6bb0, metalness:.35, roughness:.42}),
  dblue:  new THREE.MeshStandardMaterial({color:0x1d4a7d, metalness:.35, roughness:.45}),
  dark:   new THREE.MeshStandardMaterial({color:0x1b1f26, metalness:.5,  roughness:.55}),
  black:  new THREE.MeshStandardMaterial({color:0x0d1014, metalness:.4,  roughness:.6}),
  red:    new THREE.MeshStandardMaterial({color:0xc0392b, metalness:.3,  roughness:.5}),
  gold:   new THREE.MeshStandardMaterial({color:0xc9a227, metalness:.85, roughness:.3}),
  lens:   new THREE.MeshStandardMaterial({color:0x101418, metalness:.2, roughness:.15, emissive:0x220000, emissiveIntensity:1}),
  glowR:  new THREE.MeshStandardMaterial({color:0x220000, emissive:0xff3b2f, emissiveIntensity:2, roughness:.4}),
  glowB:  new THREE.MeshStandardMaterial({color:0x001622, emissive:0x35c6ff, emissiveIntensity:1.6, roughness:.4}),
  glowY:  new THREE.MeshStandardMaterial({color:0x221a00, emissive:0xffc23b, emissiveIntensity:1.6, roughness:.4}),
  glowOff:new THREE.MeshStandardMaterial({color:0x161a20, emissive:0x000000, roughness:.6})
};

function box(w,h,d,m,x=0,y=0,z=0){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o;}
/* place a group on a sphere of radius r and aim its -Z axis outward.
   theta = angle down from +Y, phi = around Y with 0 = front (-Z).
   Must be called BEFORE the group is parented (lookAt then works in local space). */
function faceOut(g, theta, phi, r){
  const st=Math.sin(theta), ct=Math.cos(theta);
  g.position.set(st*Math.sin(phi)*r, ct*r, -st*Math.cos(phi)*r);
  // NOTE: for non-camera objects three.js lookAt() aims +Z at the target,
  // so spin 180° to leave the group's -Z (where the fittings are built) outward.
  g.lookAt(g.position.clone().multiplyScalar(3));
  g.rotateY(Math.PI);
}
/* 4 thin bars forming an opening outline, so arms can pass through cleanly */
function recessFrame(parent,x,y,z,w,h,t=0.010){
  parent.add(box(w+t*2, t, 0.014, MAT.dark, x, y+h/2+t/2, z));
  parent.add(box(w+t*2, t, 0.014, MAT.dark, x, y-h/2-t/2, z));
  parent.add(box(t, h, 0.014, MAT.dark, x-w/2-t/2, y, z));
  parent.add(box(t, h, 0.014, MAT.dark, x+w/2+t/2, y, z));
}
function cyl(rt,rb,h,m,seg=24,x=0,y=0,z=0){const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o;}
function sph(r,m,seg=20){const o=new THREE.Mesh(new THREE.SphereGeometry(r,seg,seg/2),m);o.castShadow=true;return o;}

/* ---------------------------------------------------------------- droid */
const R2 = {
  root:new THREE.Group(),
  body:new THREE.Group(),
  dome:new THREE.Group(),
  pies:[], hp:[], psi:[], logic:[],
  /* the GROUPS the stand-in's logic and PSI lights live in, so the
     AstroPixels layer can hide the whole fitting — bezel included — and
     put its own pixel panels on the dome instead. Hiding only the glowing
     face leaves the black surround behind, floating where the real board
     is not. (lights/render3d.js) */
  logicG:[], psiG:[],
  doorL:null, doorR:null,
  gripArm:null, gripFingerA:null, gripFingerB:null,
  interArm:null, interTool:null,
  utilUpper:null, utilLower:null,
  dataport:null, chargebay:null,
  wheels:[], eye:null,
  yaw:0, pos:new THREE.Vector3(0,0,0), pitch:0, domeYaw:0, speed:0
};

function buildDome(){
  const d = R2.dome;

  // shell
  const shell = new THREE.Mesh(new THREE.SphereGeometry(DOME_R,48,24,0,Math.PI*2,0,Math.PI/2), MAT.white);
  shell.castShadow = true; shell.receiveShadow = true;
  d.add(shell);
  // inner dark shell so open panels don't show through to nothing
  const inner = new THREE.Mesh(new THREE.SphereGeometry(DOME_R*0.955,32,16,0,Math.PI*2,0,Math.PI/2), MAT.dark);
  inner.material.side = THREE.BackSide; d.add(inner);
  // base ring
  d.add(cyl(DOME_R*1.02, DOME_R*1.02, 0.028, MAT.silver, 40, 0,-0.014,0));

  // blue radial stripes on the lower dome
  for(let i=0;i<6;i++){
    const a = i*Math.PI/3 + Math.PI/12;
    const st = new THREE.Mesh(new THREE.SphereGeometry(DOME_R*1.004,10,6,a,0.20,1.00,0.57), MAT.blue);
    d.add(st);
  }

  // pie panels (11 → pwm2 ch0-10)
  const N=11, seg=(Math.PI*2)/N, gap=seg*0.12;
  const thetaStart=0.32, thetaLen=0.40;
  // dark band under the panel ring so the seams read when everything is shut
  d.add(new THREE.Mesh(new THREE.SphereGeometry(DOME_R*1.002,48,8,0,Math.PI*2,thetaStart-0.02,thetaLen+0.04), MAT.dark));
  for(let i=0;i<N;i++){
    const phiStart = -Math.PI/2 + i*seg + gap/2;
    const geo = new THREE.SphereGeometry(DOME_R*1.008, 10, 5, phiStart, seg-gap, thetaStart, thetaLen);
    geo.computeBoundingBox();
    // hinge = centre of the lowest edge of the panel
    const pos = geo.attributes.position;
    let minY=Infinity;
    for(let v=0;v<pos.count;v++) minY=Math.min(minY,pos.getY(v));
    let hx=0,hz=0,n=0;
    for(let v=0;v<pos.count;v++){
      if(Math.abs(pos.getY(v)-minY)<1e-4){ hx+=pos.getX(v); hz+=pos.getZ(v); n++; }
    }
    const hinge = V3(hx/n, minY, hz/n);
    geo.translate(-hinge.x,-hinge.y,-hinge.z);
    const mesh = new THREE.Mesh(geo, MAT.white.clone());
    mesh.material.side = THREE.DoubleSide;
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.position.copy(hinge);
    g.add(mesh);
    const radial = V3(hinge.x,0,hinge.z).normalize();
    g.userData.axis = V3(0,1,0).cross(radial).normalize();
    d.add(g);
    R2.pies.push(g);
  }

  // radar eye on top
  const rad = new THREE.Group(); rad.position.set(0.058,DOME_R*0.955,-0.058);
  rad.add(cyl(0.014,0.014,0.05,MAT.steel,10,0,0.025,0));
  rad.add(cyl(0.038,0.022,0.022,MAT.silver,14,0,0.058,0));
  rad.rotation.z = -0.18; rad.rotation.x = 0.18;
  d.add(rad);

  // front main eye / radar lens (below the pie-panel band)
  const eye = new THREE.Group();
  faceOut(eye, 1.18, 0, DOME_R*0.945);
  const barrel = cyl(0.049,0.052,0.052,MAT.silver,26); barrel.rotation.x=Math.PI/2; eye.add(barrel);
  const lens = cyl(0.039,0.039,0.012,MAT.lens,26); lens.rotation.x=Math.PI/2; lens.position.z=-0.030; eye.add(lens);
  const pupil = cyl(0.012,0.012,0.008,MAT.glowR.clone(),14); pupil.rotation.x=Math.PI/2; pupil.position.z=-0.036; eye.add(pupil);
  R2.eye = pupil;
  d.add(eye);

  // holoprojectors: 1 top + 2 at the sides
  const mkHP = (theta, phi)=>{
    const g = new THREE.Group();
    faceOut(g, theta, phi, DOME_R*0.955);
    const housing = cyl(0.026,0.030,0.018,MAT.silver,16); housing.rotation.x=Math.PI/2; g.add(housing);
    const lamp = sph(0.017, MAT.glowOff.clone(), 14); lamp.position.z = -0.009; g.add(lamp);
    R2.hp.push(lamp);
    d.add(g);
  };
  mkHP(0.06,  0);            // top HP
  mkHP(0.80, -1.35);         // left HP
  mkHP(0.80,  1.35);         // right HP

  // logic displays: front bar above the lens, rear bar on the back
  const mkLogic=(theta,phi,w,h)=>{
    const g=new THREE.Group();
    faceOut(g, theta, phi, DOME_R*0.985);
    g.add(box(w+0.012,h+0.012,0.006,MAT.black,0,0,0));
    const lite = box(w,h,0.004,MAT.glowB.clone(),0,0,-0.004);
    g.add(lite); R2.logic.push(lite); R2.logicG.push(g);
    d.add(g);
  };
  mkLogic(0.86, 0,       0.098, 0.020);
  mkLogic(1.00, Math.PI, 0.084, 0.018);

  // process state indicators, flanking the lens
  const mkPSI=(phi,mat)=>{
    const g=new THREE.Group();
    faceOut(g, 1.04, phi, DOME_R*0.985);
    const p=cyl(0.019,0.019,0.008,MAT.black,16); p.rotation.x=Math.PI/2; g.add(p);
    const l=cyl(0.015,0.015,0.006,mat.clone(),16); l.rotation.x=Math.PI/2; l.position.z=-0.005; g.add(l);
    d.add(g); R2.psi.push(l); R2.psiG.push(g);
  };
  mkPSI(-0.68, MAT.glowB);
  mkPSI( 0.68, MAT.glowR);

  d.position.y = BODY_TOP;
  R2.body.add(d);
}

function buildBody(){
  const b = R2.body;

  const shell = cyl(BODY_R, BODY_R, BODY_H, MAT.white, 48, 0, BODY_Y, 0);
  b.add(shell);
  // dark interior so open bays read as cavities, not holes in the world
  const inner = cyl(BODY_R*0.955, BODY_R*0.955, BODY_H*0.99, MAT.dark, 32, 0, BODY_Y, 0);
  inner.material = MAT.dark.clone(); inner.material.side = THREE.BackSide; inner.castShadow=false;
  b.add(inner);
  // shoulder / neck rings
  b.add(cyl(BODY_R*1.015, BODY_R*1.015, 0.03, MAT.silver, 48, 0, BODY_TOP-0.015, 0));
  b.add(cyl(BODY_R*1.015, BODY_R*1.015, 0.045, MAT.silver, 48, 0, BODY_Y-BODY_H/2+0.022, 0));
  // vertical blue trim strips — rear + sides only, the front face carries the bays
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5 + Math.PI/10;
    if(Math.abs(Math.atan2(Math.sin(a),-Math.cos(a))) < 1.15) continue;  // skip the front arc
    const s = box(0.040,BODY_H*0.70,0.012, MAT.blue, Math.sin(a)*BODY_R*0.995, BODY_Y+0.01, Math.cos(a)*BODY_R*0.995);
    s.rotation.y = a; b.add(s);
  }
  // rear octagon detail
  const oct = cyl(0.062,0.062,0.012,MAT.dblue,8, 0, BODY_Y+0.14, BODY_R*0.99); oct.rotation.x=Math.PI/2; b.add(oct);

  /* ---- breadpan doors : hinge on the OUTER vertical edge ---- */
  const mkDoor=(side)=>{  // side -1 = interface bay (-x), +1 = gripper bay (+x)
    const w=0.115,h=0.170,t=0.012;
    const g=new THREE.Group();
    const hingeX = side*0.185;
    g.position.set(hingeX, DOOR_Y, -BODY_R*0.965);
    const panel = box(w,h,t,MAT.white);
    panel.position.x = -side*w/2;      // panel sits inboard of the hinge
    panel.add(box(w*0.7,h*0.12,0.004,MAT.blue,0,-h*0.30,-t*0.8));
    g.add(panel);
    b.add(g);
    recessFrame(b, hingeX-side*w/2, DOOR_Y, -BODY_R*0.955, w, h);
    return g;
  };
  R2.doorL = mkDoor(-1);   // interface arm bay  (pwm1 ch0)
  R2.doorR = mkDoor( 1);   // gripper arm bay    (pwm1 ch1)

  /* ---- gripper arm (behind right door) ----
     retracted the whole assembly sits inside the barrel; ARM_BASE/ARM_SPAN in the
     animation step slide it forward through the open door. */
  {
    const g=new THREE.Group();
    g.position.set(0.185-0.115/2, DOOR_Y, ARM_BASE);
    g.add(box(0.034,0.034,0.20,MAT.steel,0,0,-0.10));
    g.add(box(0.048,0.048,0.028,MAT.silver,0,0,-0.212));
    const fa = box(0.013,0.046,0.068,MAT.steel,-0.020,0,-0.258);
    const fb = box(0.013,0.046,0.068,MAT.steel, 0.020,0,-0.258);
    g.add(fa); g.add(fb);
    R2.gripFingerA=fa; R2.gripFingerB=fb;
    b.add(g); R2.gripArm=g;
  }
  /* ---- interface arm (behind left door) ---- */
  {
    const g=new THREE.Group();
    g.position.set(-0.185+0.115/2, DOOR_Y, ARM_BASE);
    g.add(box(0.034,0.034,0.20,MAT.steel,0,0,-0.10));
    const tool= cyl(0.027,0.027,0.052,MAT.gold,16,0,0,-0.225); tool.rotation.x=Math.PI/2; g.add(tool);
    const tip = cyl(0.011,0.011,0.045,MAT.silver,12,0,0,-0.272); tip.rotation.x=Math.PI/2; g.add(tip);
    R2.interTool = tool;
    b.add(g); R2.interArm=g;
  }

  /* ---- utility arms (upper + lower, front face, hinged along the top edge) ---- */
  const mkUtil=(y)=>{
    const L=0.115;
    const g=new THREE.Group();
    g.position.set(0, y, -BODY_R*0.945);
    g.add(box(0.086,L,0.024,MAT.silver, 0,-L/2,0));
    g.add(box(0.074,0.030,0.028,MAT.dblue, 0,-L+0.018,0.003));
    b.add(g);
    b.add(box(0.094,L+0.010,0.014,MAT.dark, 0, y-L/2, -BODY_R*0.915));
    return g;
  };
  R2.utilUpper = mkUtil(UTIL_UP_Y);
  R2.utilLower = mkUtil(UTIL_LO_Y);

  /* ---- dataport + chargebay doors (small, lower front) ---- */
  const mkSmall=(x)=>{
    const g=new THREE.Group();
    g.position.set(x, SMALL_Y, -BODY_R*0.955);
    g.add(box(0.072,0.052,0.009,MAT.white,0,-0.026,0));
    b.add(g);
    b.add(box(0.078,0.058,0.012,MAT.dark, x, SMALL_Y-0.026, -BODY_R*0.92));
    return g;
  };
  R2.dataport  = mkSmall(-0.088);
  R2.chargebay = mkSmall( 0.088);

  R2.root.add(b);
}

function buildLegs(){
  const legGroup = new THREE.Group();
  R2.legGroup = legGroup;

  /* a foot whose LOCAL ORIGIN sits exactly on the ground plane */
  const mkFoot=(w,len)=>{
    const f=new THREE.Group();
    f.add(box(w,0.075,len,MAT.white,0,0.128,0));
    f.add(box(w+0.010,0.034,len+0.020,MAT.silver,0,0.086,0));
    f.add(box(w+0.004,0.036,0.055,MAT.blue,0,0.130,-len*0.42));
    for(const [r,zz] of [[0.055,0],[0.036,-len*0.30],[0.036,len*0.30]]){
      const wl = cyl(r,r,0.044,MAT.black,18, 0, r, zz);
      wl.rotation.z = Math.PI/2;
      f.add(wl); R2.wheels.push(wl);
    }
    return f;
  };

  const SHOULDER_Y = BODY_TOP - 0.10;   // 0.815

  const mkSideLeg=(sx)=>{
    const g=new THREE.Group();
    g.position.set(sx*BODY_R*0.98, SHOULDER_Y, 0);
    // shoulder disc
    const sh = cyl(0.115,0.115,0.055,MAT.silver,26); sh.rotation.z=Math.PI/2; sh.position.x=sx*0.028; g.add(sh);
    const shd= cyl(0.076,0.076,0.064,MAT.dblue,20);  shd.rotation.z=Math.PI/2; shd.position.x=sx*0.034; g.add(shd);
    const shc= cyl(0.030,0.030,0.070,MAT.steel,14);  shc.rotation.z=Math.PI/2; shc.position.x=sx*0.038; g.add(shc);
    // upper leg  (world 0.445 → 0.805)
    g.add(box(0.062,0.36,0.150,MAT.white,  sx*0.086, -0.190, 0));
    g.add(box(0.066,0.048,0.156,MAT.blue,  sx*0.086, -0.348, 0));
    // lower leg  (world 0.165 → 0.465)
    g.add(box(0.072,0.30,0.132,MAT.silver, sx*0.086, -0.500, 0));
    g.add(box(0.076,0.030,0.138,MAT.dark,  sx*0.086, -0.652, 0));
    // foot — origin on the ground
    const foot = mkFoot(0.106, 0.30);
    foot.position.set(sx*0.086, -SHOULDER_Y, 0.005);
    g.add(foot);
    legGroup.add(g);
  };
  mkSideLeg(-1); mkSideLeg(1);

  // centre (third) leg — deploys forward from the body underside
  {
    const LEAN = 0.42;
    const g=new THREE.Group();
    g.position.set(0, 0.300, -BODY_R*0.50);
    g.rotation.x = LEAN;
    g.add(box(0.108,0.215,0.088,MAT.white,  0,-0.100,0));
    g.add(box(0.112,0.030,0.092,MAT.blue,   0,-0.196,0));
    g.add(box(0.094,0.115,0.078,MAT.silver, 0,-0.268,0));
    const yl = -0.300/Math.cos(LEAN);          // land the foot exactly on y = 0
    const foot = mkFoot(0.114, 0.28);
    foot.position.set(0, yl, 0);
    foot.rotation.x = -LEAN;
    g.add(foot);
    legGroup.add(g);
  }

  R2.root.add(legGroup);
}
