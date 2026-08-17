'use strict';
/* =====================================================================
   ENVIRONMENTS — where the droid is standing

   Mike, 2026-07-27: "lets add some cool backgrounds for the droid …
   industrial type and desert type and in a space craft type".

   Everything here is PROCEDURAL — geometry built in code and textures
   painted onto a <canvas> at load. No image assets, so the distributable
   stays one self-contained HTML and nothing has a licence attached to it.

   An environment owns four things:
     · the fog and clear colour            (the sense of depth)
     · the ground material and its texture (what you are standing on)
     · the four lights                     (what time of day it is)
     · a prop group                        (walls, rocks, gantries)

   The studio environment is the original stage, so the light/dark theme
   still works exactly as it did — `applyStageTheme()` paints the studio
   look and then hands over to `envApply()` if a real environment is set.
   Prop groups are built once and cached; switching just toggles visibility.
   ===================================================================== */

const ENV_ORDER = ['studio','workshop','desert','hangar'];
const ENV = { id:'studio', groups:{}, built:{} };

/* ------------------------------------------------------ canvas textures */
function envCanvas(size, draw){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  /* the renderer outputs sRGB, so a colour texture has to SAY it is sRGB or
     it is treated as linear and every surface comes out washed-out white.
     This cost a rebuild — the concrete looked like paper. */
  if(THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
  return t;
}
/* value noise, splatted — cheap and good enough for concrete and sand */
function envNoise(ctx, size, n, minR, maxR, colors, alpha){
  for(let i=0;i<n;i++){
    const x = Math.random()*size, y = Math.random()*size;
    const r = minR + Math.random()*(maxR-minR);
    ctx.globalAlpha = alpha*(0.4+Math.random()*0.6);
    ctx.fillStyle = colors[(Math.random()*colors.length)|0];
    ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

let ENV_TEX = null;
function envTextures(){
  if(ENV_TEX) return ENV_TEX;
  ENV_TEX = {
    /* poured concrete with control joints */
    concrete: envCanvas(512,(x,s)=>{
      x.fillStyle='#6d7076'; x.fillRect(0,0,s,s);
      envNoise(x,s,2600,1,7,['#797d84','#63666c','#7f838a','#5b5e64'],0.5);
      x.strokeStyle='rgba(40,42,46,.55)'; x.lineWidth=3;
      x.beginPath(); x.moveTo(0,s/2); x.lineTo(s,s/2); x.moveTo(s/2,0); x.lineTo(s/2,s); x.stroke();
    }),
    /* corrugated steel cladding */
    rib: envCanvas(256,(x,s)=>{
      for(let i=0;i<s;i+=16){
        const g = x.createLinearGradient(i,0,i+16,0);
        g.addColorStop(0,'#41474f'); g.addColorStop(.45,'#5b626b'); g.addColorStop(.55,'#5b626b'); g.addColorStop(1,'#353a41');
        x.fillStyle=g; x.fillRect(i,0,16,s);
      }
      envNoise(x,s,300,1,4,['#2c3138','#666d76'],0.25);
    }),
    /* wind-rippled sand */
    sand: envCanvas(512,(x,s)=>{
      x.fillStyle='#c8a271'; x.fillRect(0,0,s,s);
      for(let i=0;i<70;i++){
        x.strokeStyle='rgba(178,140,94,'+(0.10+Math.random()*0.18)+')';
        x.lineWidth = 2+Math.random()*7;
        x.beginPath();
        const y0 = Math.random()*s;
        x.moveTo(0,y0);
        for(let px=0;px<=s;px+=32) x.lineTo(px, y0 + Math.sin(px/54 + i)*13);
        x.stroke();
      }
      envNoise(x,s,2200,1,4,['#d8b386','#b78f5f','#e0bd8a'],0.35);
    }),
    /* hangar deck: dark plate, painted guide lines, hazard chevrons */
    deck: envCanvas(512,(x,s)=>{
      x.fillStyle='#1b2027'; x.fillRect(0,0,s,s);
      envNoise(x,s,1500,1,6,['#232932','#161a20','#2a313b'],0.5);
      x.strokeStyle='rgba(10,13,17,.85)'; x.lineWidth=4;
      for(let i=0;i<=s;i+=128){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,s); x.moveTo(0,i); x.lineTo(s,i); x.stroke(); }
      x.strokeStyle='rgba(230,236,244,.34)'; x.lineWidth=6;
      x.beginPath(); x.moveTo(0,s*0.5); x.lineTo(s,s*0.5); x.stroke();
      x.fillStyle='rgba(242,166,60,.30)';
      for(let i=0;i<s;i+=48) x.fillRect(i, s-26, 24, 18);
    })
  };
  return ENV_TEX;
}

/* ------------------------------------------------------------- helpers */
function envMat(o){ return new THREE.MeshStandardMaterial(o); }
function envBox(g, w,h,d, x,y,z, mat, ry){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); if(ry) m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m); return m;
}
/* Walls and roofs are the SHELL of a room, and a solid one traps the orbit
   camera: pull back or up and you end up staring at the outside of a box.
   BackSide does NOT fix this — a closed box is opaque from every angle,
   you just see its inner surface instead. So shells are tagged and CULLED
   when the camera leaves the room (see envCull), which gives a real
   cutaway. They also cast no shadow; a wall dropping a shadow across the
   whole floor from a low key light looked like a bug. */
function envShell(g, w,h,d, x,y,z, mat, ry){
  const m = envBox(g, w,h,d, x,y,z, mat, ry);
  m.castShadow = false;
  (g.userData.shells || (g.userData.shells = [])).push(m);
  return m;
}

/* ------------------------------------------------------- the four looks */
const ENVS = {
  studio:{
    label:'Studio', hint:'the plain stage — light or dark, grid on',
    grid:true, usesTheme:true
  },

  workshop:{
    label:'Workshop', hint:'concrete floor, clad walls, gantry and pipework',
    grid:false, bounds:{x:8.5, y:4.1, z:8.5},
    fog:0x23262c, fogNear:7, fogFar:26,
    ground:{color:0xc2c7cd, roughness:0.94, metalness:0.04, map:'concrete', repeat:30},
    lights:{ hemiSky:0x9db4cf, hemiGround:0x24272c, hemi:0.30,
             key:0xffeed6, keyI:0.80, rim:0x7ea8c8, rimI:0.30, fill:0xffb45e, fillI:0.26,
             blob:0.55 },
    build(g){
      const wall = envMat({color:0xffffff, map:envTextures().rib, roughness:.72, metalness:.28});
      wall.map = wall.map.clone(); wall.map.needsUpdate = true;
      wall.map.repeat.set(9,1.6);
      const steel = envMat({color:0x39404a, roughness:.55, metalness:.55});
      const paint = envMat({color:0xf2a63c, roughness:.6, metalness:.1});
      const crate = envMat({color:0x4a5361, roughness:.8, metalness:.1});

      /* four clad walls — close enough that the room reads at normal zoom */
      [[0,-8.5,0],[0,8.5,0],[-8.5,0,Math.PI/2],[8.5,0,-Math.PI/2]].forEach(([x,z,ry])=>{
        envShell(g, 17.4, 4.0, 0.22, x, 2.0, z, wall, ry);
      });
      /* roof trusses + pipework */
      for(let z=-7.5; z<=7.5; z+=2.5){
        envBox(g, 17, 0.14, 0.14, 0, 3.9, z, steel);
      }
      [3.45, 3.62].forEach((y,i)=>{
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09-i*0.02, 0.09-i*0.02, 17, 10), steel);
        p.rotation.z = Math.PI/2; p.position.set(0, y, -5.4 - i*0.40); p.castShadow = true; g.add(p);
      });
      /* a bench run and some stacked crates, back left */
      envBox(g, 3.6, 0.09, 0.8, -6.2, 0.90, -7.4, steel);
      for(let i=0;i<3;i++) envBox(g, 0.09, 0.88, 0.09, -7.8+i*1.6, 0.44, -7.4, steel);
      [[6.0,-7.2,0.52],[6.0,-6.1,0.52],[6.4,-6.65,1.58]].forEach(([x,z,y],i)=>
        envBox(g, 1.0, 1.0, 1.0, x, y, z, crate, i*0.4));
      /* hazard stripe along the wall foot */
      for(let x=-7.6; x<=7.6; x+=1.2) envBox(g, 0.55, 0.02, 0.45, x, 0.012, -8.0, paint, 0.5);
    }
  },

  desert:{
    label:'Desert flats', hint:'twin-sun glare, dunes and wind-cut rock',
    grid:false,
    fog:0xc9a97e, fogNear:16, fogFar:58,
    ground:{color:0xe8cfa8, roughness:1.0, metalness:0.0, map:'sand', repeat:34},
    lights:{ hemiSky:0xffe9c4, hemiGround:0x9a744a, hemi:0.44,
             key:0xfff2da, keyI:1.05, rim:0xffcf93, rimI:0.30, fill:0xffdcae, fillI:0.18,
             blob:0.42 },
    build(g){
      const rock = envMat({color:0xa7886a, roughness:.95, metalness:.0});
      const rock2= envMat({color:0x8f7350, roughness:.95, metalness:.0});
      /* dunes: big flattened spheres sunk into the sand */
      for(let i=0;i<18;i++){
        const a = (i/18)*6.283 + 0.2, r = 17 + (i%3)*6;
        const s = 5 + (i%4)*2.5;
        const d = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 8), i%2?rock:rock2);
        d.position.set(Math.sin(a)*r, -s*0.80, Math.cos(a)*r);
        d.scale.y = 0.34;
        g.add(d);
      }
      /* wind-cut outcrops, sunk so they sit IN the sand, not on it */
      [[-6.6,-7.4,1.5],[7.4,-6.2,1.1],[-8.2,4.4,0.95],[6.2,6.8,1.35],[-3.2,-9.5,0.7]].forEach(([x,z,s],i)=>{
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), i%2?rock:rock2);
        m.position.set(x, s*0.34, z);
        m.rotation.set(0.2+i*0.3, i*1.7, 0.15);
        m.scale.set(1.15, 0.62, 1.0);
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
      });
      /* scattered stones near the droid, for a sense of scale */
      for(let i=0;i<22;i++){
        const a = i*2.4, r = 3 + (i%7)*1.1;
        const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06 + (i%3)*0.05, 0), i%2?rock:rock2);
        st.position.set(Math.sin(a)*r, 0.02, Math.cos(a)*r);
        st.scale.y = 0.5; st.castShadow = true;
        g.add(st);
      }
      /* the two suns, low and hazy */
      [[0xffe9c0, 26, 4.2, -34, 2.2],[0xffc98a, 30, 3.0, -33, 1.4]].forEach(([c,x,y,z,r])=>{
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14),
          new THREE.MeshBasicMaterial({color:c, fog:false, transparent:true, opacity:.85}));
        s.position.set(x, y, z); g.add(s);
      });
    }
  },

  hangar:{
    label:'Hangar bay', hint:'deck plate, guide strips and an open bay onto space',
    grid:false, bounds:{x:8.7, y:5.9, z:9.3},
    fog:0x070a10, fogNear:9, fogFar:34,
    ground:{color:0xc9d2dc, roughness:0.55, metalness:0.45, map:'deck', repeat:22},
    lights:{ hemiSky:0x6f8cc0, hemiGround:0x0b0f16, hemi:0.34,
             key:0xdfe9ff, keyI:0.95, rim:0x4fd8e8, rimI:0.80, fill:0x88a8ff, fillI:0.26,
             blob:0.70 },
    build(g){
      const hull  = envMat({color:0x272d36, roughness:.52, metalness:.62});
      const dark  = envMat({color:0x161b22, roughness:.6,  metalness:.5});

      const strip = new THREE.MeshBasicMaterial({color:0x62e6f4, fog:false});
      const lamp  = new THREE.MeshBasicMaterial({color:0xe9f4ff, fog:false});

      /* side walls, ribbed with structural buttresses */
      [-1,1].forEach(sx=>{
        envShell(g, 0.5, 5.8, 19, sx*8.6, 2.9, 0, hull);
        for(let z=-8.5; z<=8.5; z+=2.4){
          envBox(g, 0.8, 5.4, 0.5, sx*8.0, 2.7, z, dark);
          const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.2, 0.13), strip);
          l.position.set(sx*7.6, 2.6, z); g.add(l);
        }
      });
      /* back wall + roof with light bars */
      envShell(g, 19, 5.8, 0.5, 0, 2.9, -9.2, hull);
      envShell(g, 19, 0.5, 19, 0, 5.9, 0, dark);
      for(let z=-7.6; z<=6; z+=3.0){
        const l = new THREE.Mesh(new THREE.BoxGeometry(7, 0.10, 0.30), lamp);
        l.position.set(0, 5.6, z); g.add(l);
        g.userData.shells.push(l);          // ceiling kit hides with the roof
      }
      /* the open bay: a magnetic shield glow with stars beyond */
      const bay = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 5.0),
        new THREE.MeshBasicMaterial({color:0x081227, fog:false}));
      bay.position.set(0, 2.5, 9.2); g.add(bay);
      const shield = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 5.0),
        new THREE.MeshBasicMaterial({color:0x3f7fd0, transparent:true, opacity:0.14, fog:false}));
      shield.position.set(0, 2.5, 9.16); g.add(shield);
      const starGeo = new THREE.BufferGeometry();
      const sp = [];
      for(let i=0;i<360;i++) sp.push((Math.random()-0.5)*11, 0.2+Math.random()*4.8, 9.1);
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp,3));
      g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff, size:0.04, fog:false})));
      /* bay door frame */
      envBox(g, 19, 1.4, 0.6, 0, 5.6, 9.2, hull);
      [-1,1].forEach(sx=> envBox(g, 3.6, 5.8, 0.6, sx*7.6, 2.9, 9.2, hull));

      /* two docked craft, abstract angular wedges — enough to read as a
         hangar without copying anybody's ship */
      [[-6.2, -6.6, 0.5],[6.2, -6.6, -0.5]].forEach(([x,z,ry])=>{
        const c = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 2.2, 6), hull);
        body.rotation.x = Math.PI/2; body.castShadow = true; c.add(body);
        [-1,1].forEach(s=>{
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 2.6), dark);
          w.position.set(s*1.5, 0, 0); w.rotation.z = s*0.16; w.castShadow = true; c.add(w);
        });
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), strip);
        eye.position.set(0, 0, 1.15); c.add(eye);
        c.position.set(x, 1.7, z); c.rotation.y = ry;
        g.add(c);
        /* landing gantry under it */
        envBox(g, 3.0, 0.16, 3.0, x, 0.5, z, dark);
        [-1,1].forEach(s=>[-1,1].forEach(t=>envBox(g, 0.14, 1.0, 0.14, x+s*1.3, 0.25, z+t*1.3, dark)));
      });
      /* deck guide strips running to the bay */
      [-3.4, 3.4].forEach(x=>{
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 17), strip);
        l.position.set(x, 0.008, 0); g.add(l);
      });
    }
  }
};

/* --------------------------------------------------------------- apply */
function envGet(){ return PREFS.env && ENVS[PREFS.env] ? PREFS.env : 'studio'; }
function envLabel(id){ return (ENVS[id]||ENVS.studio).label; }

function envBuildGroup(id){
  if(ENV.built[id]) return ENV.groups[id];
  const def = ENVS[id];
  const g = new THREE.Group();
  g.userData.bounds = def.bounds || null;
  if(def.build) def.build(g);
  g.visible = false;
  scene.add(g);
  ENV.groups[id] = g; ENV.built[id] = true;
  return g;
}

function envApply(id){
  if(typeof scene === 'undefined' || !scene) return;
  id = ENVS[id] ? id : 'studio';
  PREFS.env = id;
  ENV.id = id;
  const def = ENVS[id];

  /* every other environment's props go away */
  ENV_ORDER.forEach(k=>{ if(ENV.groups[k]) ENV.groups[k].visible = (k === id); });

  if(def.usesTheme){
    /* the studio IS the theme — applyStageTheme() owns fog, ground and
       lights and calls us back at the end, so all we do is put the grid and
       the untextured floor back */
    if(grid) grid.visible = ENV.gridWanted !== false;
    if(ground){ ground.material.map = null; ground.material.needsUpdate = true; }
    if(scene.fog){ scene.fog.near = 7; scene.fog.far = 22; }
    envSyncUI();
    return;
  }

  envBuildGroup(id).visible = true;
  if(grid) grid.visible = false;

  scene.fog.color.setHex(def.fog);
  scene.fog.near = def.fogNear; scene.fog.far = def.fogFar;
  if(renderer) renderer.setClearColor(def.fog, 1);

  if(ground && def.ground){
    const t = envTextures()[def.ground.map];
    const m = ground.material;
    m.map = t; m.map.repeat.set(def.ground.repeat, def.ground.repeat);
    m.color.setHex(def.ground.color);
    m.roughness = def.ground.roughness; m.metalness = def.ground.metalness;
    m.needsUpdate = true;
  }
  const L = def.lights;
  if(LIGHTS.hemi){ LIGHTS.hemi.color.setHex(L.hemiSky); LIGHTS.hemi.groundColor.setHex(L.hemiGround); LIGHTS.hemi.intensity = L.hemi; }
  if(LIGHTS.key){ LIGHTS.key.color.setHex(L.key); LIGHTS.key.intensity = L.keyI; }
  if(LIGHTS.rim){ LIGHTS.rim.color.setHex(L.rim); LIGHTS.rim.intensity = L.rimI; }
  if(LIGHTS.fill){ LIGHTS.fill.color.setHex(L.fill); LIGHTS.fill.intensity = L.fillI; }
  /* the sun's direction and the contact-shadow weight are part of an
     environment's light too (v1.18.0). No keyPos in the def means "keep the
     stage theme's sun" — resolved here, not left stale from the last env. */
  if(LIGHTS.keyOff){
    const tm = (PREFS.stageTheme==='follow') ? PREFS.theme : PREFS.stageTheme;
    const base = (typeof THEME_3D !== 'undefined') ? THEME_3D[tm==='light'?'light':'dark'].keyPos : null;
    const kp = L.keyPos || base;
    if(kp) LIGHTS.keyOff.fromArray(kp);
  }
  if(typeof setShadowStrength === 'function' && L.blob !== undefined) setShadowStrength(L.blob);
  envSyncUI();
}

function envSet(id){
  /* the studio look is the theme's job; every other environment overrides
     it. Going BACK to studio therefore has to repaint the theme. */
  if(ENVS[id] && ENVS[id].usesTheme){
    envApply(id);          // clears the ground texture and puts the grid back
    applyStageTheme();     // then repaints fog, floor colour and the lights
  }else envApply(id);
  prefsSave();
  lg('sys','environment → '+envLabel(ENV.id));
}
function envCycle(){
  const i = ENV_ORDER.indexOf(envGet());
  envSet(ENV_ORDER[(i+1) % ENV_ORDER.length]);
}
/* Hide the room shell when the camera is outside it, so pulling back or
   lifting over the roof gives a cutaway instead of the outside of a box.
   Called once a frame from updateCamera. */
function envCull(){
  const g = ENV.groups[ENV.id];
  if(!g || !g.visible || !g.userData.shells || !g.userData.bounds) return;
  const b = g.userData.bounds, p = camera.position;
  const inside = Math.abs(p.x) < b.x && Math.abs(p.z) < b.z && p.y < b.y;
  if(g.userData.inside === inside) return;
  g.userData.inside = inside;
  g.userData.shells.forEach(m=>{ m.visible = inside; });
}

function envSyncUI(){
  const b = $('btnEnv');
  if(b) b.textContent = envLabel(ENV.id);
}

/* v1.15.0 (M3) — the option list for the stage picker: every environment,
   in cycle order, with its one-line hint for the row tooltip */
function envOptions(){
  return ENV_ORDER.map(id => ({id, label:ENVS[id].label, hint:ENVS[id].hint}));
}
