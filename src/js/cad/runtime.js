'use strict';
/* --------------------------------------------------------------- animation */
const _cadAxis = new THREE.Vector3();
const ZERO3 = [0,0,0];
function applyCadActuators(){
  if(!CAD.loaded) return;
  for(const m of CAD.moving){
    let t = m.act ? (ACT[m.act] !== undefined ? ACT[m.act] : 0) : 0;
    if(m.flip) t = -t;
    const r = m.rig;
    /* m.base is the mesh's resting offset. It is [0,0,0] until the part gets
       a hand-set pivot, at which point the group moves to the new pivot and
       the mesh is pushed back by the same amount — see motionRebind(). */
    const b = m.mOff || ZERO3;
    if(r.mode === 'slide'){
      m.mesh.position.set(b[0] + r.axis[0]*r.range*t,
                          b[1] + r.axis[1]*r.range*t,
                          b[2] + r.axis[2]*r.range*t);
    }else{
      _cadAxis.set(r.axis[0], r.axis[1], r.axis[2]);
      m.group.quaternion.setFromAxisAngle(_cadAxis, t*r.range);
    }
  }
}
/* the CAD stops at the skirt, so the procedural legs stand in below it.
   Scale them so their shoulder pivot meets the CAD's shoulder hubs. */
const PROC_SHOULDER_Y = 0.815, PROC_SHOULDER_X = 0.245;
function fitProcLegs(){
  if(!CAD.loaded || !R2.legGroup) return;
  const hub = CAD.header.parts.filter(p=>/ShoulderHub/i.test(p.base));
  if(!hub.length){ R2.legGroup.scale.set(1,1,1); return; }
  let sy=0, sx=0;
  for(const p of hub){ sy += p.centroid[1]; sx += Math.abs(p.centroid[0]); }
  sy = (sy/hub.length + CAD.yOffset) / PROC_SHOULDER_Y;
  sx = (sx/hub.length) / PROC_SHOULDER_X;
  R2.legGroup.scale.set(sx, sy, sy);
}

function updateCadTransform(){
  if(!CAD.loaded || !CAD.root) return;
  if(CAD.root.position.y !== CAD.yOffset){ CAD.root.position.y = CAD.yOffset; fitProcLegs(); }
  CAD.root.rotation.copy(R2.body.rotation);
  CAD.dome.rotation.y = R2.domeYaw;
}
/* A KIND NOBODY LISTED IS SHOWN, NOT HIDDEN (v1.46.0).
   `!!CAD.show[kind]` made hidden the default for every kind outside the seven
   the MK4 happens to have, and the Show section only ever offered those seven
   — so a container with any other vocabulary loaded, and then stood there
   completely invisible with no checkbox to bring it back and nothing logged
   as wrong. The project's own second container does exactly that: the Polar
   Mouse .r2m (which maestro/ui-files.js routes here by extension) is
   {body, wheel, chariot}, 130 parts, an empty stage.
   `!== false` keeps `internal` and `outlier` — the two that are deliberately
   off in CAD.show — exactly as they were, and keeps every checkbox the user
   ticks working the same way, while an unknown kind is visible until someone
   says otherwise. cad/ui.js builds the checkbox list from the kinds actually
   present, so there is always a way back. */
function cadShown(kind){ return CAD.show[kind] !== false; }
function applyCadVisibility(){
  for(const key in CAD.kindGroups){
    const kind = key.split(':')[0];
    CAD.kindGroups[key].visible = cadShown(kind);
  }
  for(const m of CAD.moving) m.group.visible = cadShown(m.kind);
}
function setCadActive(on){
  CAD.active = on && CAD.loaded;
  if(CAD.root) CAD.root.visible = CAD.active;
  // the procedural body+dome hide when the CAD stands in for them
  R2.body.visible = !CAD.active;
  if(R2.legGroup){
    R2.legGroup.visible = CAD.active ? CAD.procLegs : true;
    if(CAD.active) fitProcLegs(); else R2.legGroup.scale.set(1,1,1);
  }
  if(typeof buildCadPane === 'function') buildCadPane();
}

/* -------------------------------------------------------------- ingestion */
async function loadCadFromPayload(){
  if(typeof CAD_PAYLOAD === 'undefined' || !CAD_PAYLOAD) return false;
  try{
    const buf = await inflateB64(CAD_PAYLOAD);
    buildCad(decodeR2M(buf), 'MK4 (bundled)');
    setCadActive(true);
    return true;
  }catch(e){
    lg('warn','bundled CAD failed to load: '+e.message);
    return false;
  }
}
async function loadCadFromFile(file){
  try{
    let buf = await file.arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if(!(head[0]===0x52 && head[1]===0x32 && head[2]===0x4d)){    // not 'R2M…' → try gunzip
      if(head[0]===0x1f && head[1]===0x8b){
        const ds = new DecompressionStream('gzip');
        buf = await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
      }
    }
    buildCad(decodeR2M(buf), file.name);
    if(typeof partsLoad==='function'){ partsLoad(); registerGroupAnims(); }
    if(typeof motionApplyAll==='function') motionApplyAll();
    if(typeof initPaint==='function') initPaint();   // fresh slot mats = fresh classify + repaint
    setCadActive(true);
    lg('sys','CAD loaded from '+file.name);
  }catch(e){
    /* buildCad rolls its own state back now (cad/build.js), so the model that
       was on the stage before the drop is still the one CAD describes and
       CAD.loaded is still true about it — which is why this does NOT blank
       the flag wholesale. What it must never do is leave CAD claiming a model
       it has not got, so say so when there is nothing to fall back on
       (v1.46.0). */
    if(!CAD.root || !CAD.header) CAD.loaded = false;
    lg('warn','could not read '+file.name+': '+e.message);
    const el = $('cadMsg'); if(el){ el.style.color='var(--rd)'; el.textContent='Could not read that file: '+e.message; }
    if(typeof toast === 'function') toast('could not read '+file.name+' — '+e.message, 'err');
  }
}
