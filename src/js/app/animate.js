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
/* the same table the other way up: actuator id → which board and channel
   carries it, so a write to ACT_T can be turned back into a pulse */
const SERVO_ACT_DEF = (()=>{ const m={}; for(const b of [1,2]) SERVO_DEFS[b].forEach(d=>{ m[d.act]={board:b, def:d}; }); return m; })();

/* =====================================================================
   AN ACT_T WRITE ON A PCA-OWNED ACTUATOR IS A COMMAND TO THE BOARD
   (v1.61.0)

   Mike: "somethings broken when im in the sequncer and have r2 set as the
   model I dont see any of teh panels moving."

   It was broken on mod2026 and only on mod2026, and it is the second half of
   a bug whose first half was fixed in v1.39.3. That release found the
   sequence CLOCK shut behind `if(PROFILE.hasMaestro)` and opened it, because
   v1.27.0 had already opened the desk to PCA9685 builds — "every build",
   buildCanSequence(). The clock then ran. Nothing moved anyway, because the
   ACTUATOR path was still shut: on a hasServos profile the PCA9685 layer OWNS
   its 21 actuators — ACT is overwritten from servoTravel() every frame — so
   `applyFrameTargets()`'s `ACT_T[c.act] = ...` was written and then stamped
   flat one line later. A dome routine ran its whole length with the droid
   sitting perfectly still.

   The reason it surfaced NOW is v1.59.0: the Servo gauges read CHPOS, which
   is profile-blind, so the very same routine visibly sweeps every gauge. Play
   it, switch the model back to the droid, and nothing happens. That is the
   comparison Mike made.

   THE FIX, and why it is here rather than in the sequencer. There are a dozen
   writers of `ACT_T[act]` — the sequencer, the live pose, the free-lane
   overlay, cues, the puppet rig, the bench host, two importers — and teaching
   each one about PCA ownership is twelve chances to forget. cad/parts.js
   already solved this once for test actions (actSet(): "a test action must
   command the servo model through setPWM, exactly as the sketch would"). This
   is that same rule, applied at the one seam every writer already funnels
   through, one frame later.

   It is EDGE-TRIGGERED, and it has to be. If it commanded the board from
   ACT_T every frame, a stale ACT_T left over from an old sequence would fight
   the running sketch forever — the sketch would close a door and this would
   re-open it 60 times a second. So: only a CHANGE in ACT_T commands anything,
   and at the end of every frame ACT_T is mirrored back from where the board is
   actually headed (servoTargetTravel), which keeps the two in step whether the
   move came from a sketch, the pad, a group action or a routine. A side
   benefit: the Outputs table's "moving" flag compares ACT_T with ACT, and on
   mod2026 that comparison was reading a stale number. Now it is honest.

   The real hardware is not touched by any of this. setPWM() here is the
   simulated PCA9685, the same one the transpiled sketch calls. */
const SERVO_T_SEEN = {};
function servoTakeTargets(){
  for(const a in SERVO_ACT_DEF){
    const t = ACT_T[a];
    if(t === undefined) continue;
    const seen = SERVO_T_SEEN[a];
    if(seen === undefined){ SERVO_T_SEEN[a] = t; continue; }   // first sight is not a command
    if(Math.abs(t - seen) < 1e-6) continue;                    // nobody wrote it this frame
    SERVO_T_SEEN[a] = t;
    const e = SERVO_ACT_DEF[a], lo = CFG[e.def.lo], hi = CFG[e.def.hi];
    if(lo === undefined || hi === undefined || lo === hi) continue;
    setPWM(e.board, e.def.ch, 0, Math.round(lo + (hi - lo) * clamp(t, 0, 1)));
  }
}
/* THE RAMP RATE IS TYPED BY A HUMAN, SO IT IS VALIDATED WHERE IT IS USED.

   This was `(CFG.maestroRate || 2.2) * dt`, three times, straight out of a
   number box with no min and no max (panels.js). A NEGATIVE rate makes
   `Math.abs(d) <= step` false for every d, so instead of easing towards the
   target every actuator was stepped AWAY from it, without bound: typing -1
   and waiting eleven seconds left ACT.doorRL at -11.00, feeding
   R2.doorL.rotation.y = ACT.doorL*1.95 — doors turning continuously, with
   no way back short of reloading the profile. A typed 0 was silently
   ignored instead (`||` treats it as unset), which is its own small lie.

   `main.js` already does exactly this to CFG.loopHz — clamp(CFG.loopHz,
   20, 2000) — and this is the same argument. A rate that is not a positive
   number is not a rate, so it falls back to the default rather than being
   honoured; anything else is held inside limits a mechanism can survive.
   The panel inputs carry the same numbers as min/max, so the value can no
   longer be typed at all — but the clamp lives here, because a .json
   import, an older profile or a console poke never goes near that box. */
const ANIM_RATE_DEF = 2.2, ANIM_RATE_MIN = 0.05, ANIM_RATE_MAX = 60;
function animRate(){
  const r = Number(CFG.maestroRate);
  return clamp(isFinite(r) && r > 0 ? r : ANIM_RATE_DEF, ANIM_RATE_MIN, ANIM_RATE_MAX);
}

/* the per-CHANNEL readings (maestro/playback.js CHPOS) ease by the same rule
   and in the same breath as the actuators, so a gauge and a panel driven by
   one frame arrive together rather than a tick apart */
function stepChanPos(dt){
  if(typeof CHPOS === 'undefined') return;
  const step = animRate() * dt;
  for(let i = 0; i < CHPOS_T.length; i++){
    if(CHPOS_T[i] === undefined) continue;
    if(CHPOS[i] === undefined){ CHPOS[i] = CHPOS_T[i]; continue; }
    const d = CHPOS_T[i] - CHPOS[i];
    if(Math.abs(d) <= step) CHPOS[i] = CHPOS_T[i];
    else CHPOS[i] += Math.sign(d) * step;
  }
}
function syncActuators(dt){
  stepChanPos(dt);
  if(PROFILE.hasServos){
    servoTakeTargets();          // whatever wrote ACT_T since the last frame → the board
    stepServos(dt);
    /* ACT is where the horn IS; ACT_T is mirrored to where it is HEADED, so
       the next frame's edge test compares like with like — see above */
    for(const b of [1,2]) for(const d of SERVO_DEFS[b]){
      ACT[d.act] = servoTravel(b, d.ch);
      const tt = servoTargetTravel(b, d.ch);
      ACT_T[d.act] = tt; SERVO_T_SEEN[d.act] = tt;
    }
    // parts the PCA9685s don't own (side panels, rear doors, drawer) still
    // answer UI tests and group actions — ramp them like the Maestro path does
    const step = animRate()*dt;
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
    const step = animRate()*dt;
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
