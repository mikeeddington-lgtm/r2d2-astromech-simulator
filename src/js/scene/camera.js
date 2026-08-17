'use strict';
function bindCamera(stage){
  let down=false, btn=0, px=0, py=0;
  stage.addEventListener('pointerdown', e=>{
    if(e.target.tagName!=='CANVAS') return;
    down=true; btn=e.button; px=e.clientX; py=e.clientY; stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e=>{
    if(!down) return;
    const dx=e.clientX-px, dy=e.clientY-py; px=e.clientX; py=e.clientY;
    if(btn===2 || e.shiftKey){
      const right = V3().setFromMatrixColumn(camera.matrix,0);
      const up    = V3().setFromMatrixColumn(camera.matrix,1);
      CAM.target.addScaledVector(right, -dx*CAM.dist*0.0016);
      CAM.target.addScaledVector(up,     dy*CAM.dist*0.0016);
      CAM.follow=false; syncFollowBtn();
    }else{
      CAM.theta -= dx*0.006;
      CAM.phi    = clamp(CAM.phi - dy*0.006, 0.18, Math.PI/2 - 0.02);
    }
  });
  const up=()=>{down=false;};
  stage.addEventListener('pointerup',up); stage.addEventListener('pointercancel',up);
  stage.addEventListener('contextmenu', e=>e.preventDefault());
  stage.addEventListener('wheel', e=>{ CAM.dist = clamp(CAM.dist*(1+Math.sign(e.deltaY)*0.10), 0.7, 14); e.preventDefault(); }, {passive:false});
}

/* frame presets — sequencing wants the dome big, driving wants everything */
function viewFrame(which){
  CAM.follow = false; if(typeof syncFollowBtn==='function') syncFollowBtn();
  if(which==='head'){ CAM.target.set(0,0.90,0); CAM.dist=1.15; CAM.phi=1.30; }
  else if(which==='body'){ CAM.target.set(0,0.45,0); CAM.dist=1.55; CAM.phi=1.25; }
  else { CAM.target.set(0,0.60,0); CAM.dist=2.25; CAM.phi=1.15; }
}
/* where a CAD part actually is in the world right now. The centroid in the
   header is in the model's own space, so it has to go through the group it
   hangs off — the dome's, if it is a dome part, because that one spins. */
function partWorldPos(name){
  if(typeof CAD === 'undefined' || !CAD.loaded || !CAD.header) return null;
  const hp = CAD.header.parts.find(p=>p.name === name);
  if(!hp || !hp.centroid) return null;
  const g = (hp.file === 'dome') ? CAD.dome : CAD.body;
  if(!g) return null;
  g.updateMatrixWorld(true);
  return new THREE.Vector3(hp.centroid[0], hp.centroid[1], hp.centroid[2]).applyMatrix4(g.matrixWorld);
}
function viewFocusPart(name, dist){
  const p = partWorldPos(name); if(!p) return false;
  CAM.follow = false; if(typeof syncFollowBtn === 'function') syncFollowBtn();
  CAM.target.copy(p);
  CAM.dist = dist || 0.85;
  return true;
}
function updateCamera(){
  /* Follow means "follow whoever I am driving" — chasing the parked droid
     while the mouse disappears off the back of the stage is not follow. */
  if(CAM.follow){
    const t = (typeof driverPos === 'function') ? driverPos() : V3(R2.pos.x, 0.6, R2.pos.z);
    CAM.target.lerp(t, 0.12);
  }
  const s=Math.sin(CAM.phi);
  camera.position.set(
    CAM.target.x + CAM.dist*s*Math.sin(CAM.theta),
    CAM.target.y + CAM.dist*Math.cos(CAM.phi),
    CAM.target.z + CAM.dist*s*Math.cos(CAM.theta)
  );
  camera.lookAt(CAM.target);
  if(typeof envCull === 'function') envCull();
  /* the key light rides with the droid so the shadow frustum never runs off
     the stage; its OFFSET is the rig's (theme/environment) sun direction */
  const ko = LIGHTS.keyOff;
  shadowKey.position.set(R2.pos.x+ko.x, ko.y, R2.pos.z+ko.z);
  shadowKey.target.position.set(R2.pos.x, 0.4, R2.pos.z);
  if(typeof shadowTick === 'function') shadowTick();
}
