'use strict';
/* =====================================================================
   ACTUATORS → 3D, and the profile-aware UI
   ===================================================================== */
let blinkT = 0, lastSpeedForAccel = 0;

/* mod2026 drives the PCA9685s; the maestro sketches drive script timelines */
function stepServos(dt){
  const step = CFG.servoSpeed*dt;
  for(const b of [1,2]) for(const ch in SERVO[b]){
    const s=SERVO[b][ch];
    const d = s.target - s.pulse;
    if(Math.abs(d) <= step){ s.pulse = s.target; s.moving=false; }
    else { s.pulse += Math.sign(d)*step; s.moving=true; }
  }
}
const SERVO_ACT_SET = (()=>{ const s=new Set(); for(const b of [1,2]) SERVO_DEFS[b].forEach(d=>s.add(d.act)); return s; })();
function syncActuators(dt){
  if(PROFILE.hasServos){
    stepServos(dt);
    for(const b of [1,2]) for(const d of SERVO_DEFS[b]) ACT[d.act] = servoTravel(b, d.ch);
    // parts the PCA9685s don't own (side panels, rear doors, drawer) still
    // answer UI tests and group actions — ramp them like the Maestro path does
    const step = (CFG.maestroRate||2.2)*dt;
    for(const k in ACT){
      if(SERVO_ACT_SET.has(k)) continue;
      const d = ACT_T[k] - ACT[k];
      if(Math.abs(d) <= step) ACT[k] = ACT_T[k];
      else ACT[k] += Math.sign(d)*step;
    }
  }else{
    // NOTE: the timelines are advanced inside the firmware tick loop, not here,
    // so a held button that keeps calling restartScript() pins them at t≈0 the
    // same way it would against a real Maestro.
    const step = (CFG.maestroRate||2.2)*dt;
    for(const k in ACT){
      const d = ACT_T[k] - ACT[k];
      if(Math.abs(d) <= step) ACT[k] = ACT_T[k];
      else ACT[k] += Math.sign(d)*step;
    }
  }
}

/* what the feet are actually doing, whichever drive path is active */
function driveVector(){
  if(PROFILE.footPWM()){
    if(SIM.millis - MOT.footAt > 3000) return {f:0,y:0};
    const l=(MOT.leftFoot-90)/90, r=(MOT.rightFoot-90)/90;
    return { f:(l+r)/2, y:-(l-r)/2 };
  }
  return { f: effDrive()/127, y: effTurn()/127 };
}

function applyToModel(dt){
  R2.doorL.rotation.y =  ACT.doorL*1.95;
  R2.doorR.rotation.y = -ACT.doorR*1.95;
  R2.gripArm.position.z = ARM_BASE - ACT.gripArm*ARM_SPAN;
  R2.gripFingerA.position.x = -0.020 - (1-ACT.claw)*0.024;
  R2.gripFingerB.position.x =  0.020 + (1-ACT.claw)*0.024;
  R2.interArm.position.z = ARM_BASE - ACT.interArm*ARM_SPAN;
  R2.interTool.rotation.y = ACT.interTool*7.0;
  R2.interTool.position.z = -0.225 - ACT.interTool*0.040;
  R2.utilLower.rotation.x = ACT.utilLo*1.45;
  R2.utilUpper.rotation.x = ACT.utilUp*1.45;
  R2.dataport.rotation.x  = ACT.dataport*1.75;
  R2.chargebay.rotation.x = ACT.chargebay*1.75;
  for(let i=0;i<11;i++) R2.pies[i].quaternion.setFromAxisAngle(R2.pies[i].userData.axis, ACT['pie'+i]*0.62);

  /* --- motion --- */
  const dv = driveVector();
  const fwd  = dv.f * CFG.maxSpeed;
  const yawR = dv.y * CFG.maxYaw;
  R2.yaw += yawR*dt;
  R2.pos.x += -Math.sin(R2.yaw)*fwd*dt;
  R2.pos.z += -Math.cos(R2.yaw)*fwd*dt;
  R2.pos.x = clamp(R2.pos.x,-11,11); R2.pos.z = clamp(R2.pos.z,-11,11);
  R2.root.position.set(R2.pos.x,0,R2.pos.z);
  R2.root.rotation.y = R2.yaw;

  const spin = fwd/0.055*dt;
  for(const w of R2.wheels) w.rotation.y += spin;
  const accel = (fwd - lastSpeedForAccel)/Math.max(dt,1e-3);
  lastSpeedForAccel = fwd;
  R2.pitch += (clamp(accel*0.012,-0.13,0.13) - R2.pitch)*Math.min(1,dt*6);
  R2.body.rotation.x = R2.pitch;
  /* Mike, 2026-07-27: "when turning left or right the model leans, it
     shouldn't — keep it flat." A real astromech's body does not roll into a
     turn; it pivots on two driven feet. The pitch under acceleration stays,
     because that one is real — the whole thing tips back on the third leg. */
  R2.body.rotation.z = 0;

  R2.domeYaw += (effDome()/127)*CFG.domeRate*dt;
  R2.dome.rotation.y = R2.domeYaw;

  /* --- lights --- */
  blinkT += dt;
  const talking = (SIM.millis - SND.at) < 1400;
  for(let i=0;i<R2.logic.length;i++){
    const f = talking ? (0.35+0.65*Math.abs(Math.sin(blinkT*(9+i*3.5)))) : (0.18+0.12*Math.sin(blinkT*2.1+i));
    R2.logic[i].material.emissiveIntensity = f*2.0;
  }
  R2.psi[0].material.emissiveIntensity = (Math.sin(blinkT*1.7)>0?1.8:0.25);
  R2.psi[1].material.emissiveIntensity = (Math.sin(blinkT*1.1+1.2)>0?1.8:0.25);
  if(typeof applyAnzellan === 'function') applyAnzellan(dt);
  /* the Model Builder's per-frame pose — same seam, right next to it
     (scene/builder.js applyModelBuilder(); gated on MB.shown internally) */
  if(typeof applyModelBuilder === 'function') applyModelBuilder(dt);
  R2.eye.material.emissiveIntensity = FW.isDriveEnabled ? 2.4 : 0.7;
  for(const h of R2.hp){
    if(FW.isHPOn){ h.material.emissive.setHex(0x9fe4ff); h.material.emissiveIntensity = 1.5+0.5*Math.sin(blinkT*5); }
    else { h.material.emissive.setHex(0x000000); h.material.emissiveIntensity = 0; }
  }
}

/* =====================================================================
   UI
   ===================================================================== */
