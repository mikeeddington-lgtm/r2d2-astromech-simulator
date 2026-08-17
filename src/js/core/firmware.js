'use strict';
const FW = {};
function fwReset(){
  Object.assign(FW, {
    drivespeed: CFG.DRIVESPEED1,
    isLeftStickDrive: true,
    automateDelay: 6, turnDirection: CFG.turnDirection0!==undefined?CFG.turnDirection0:75,
    automateMillis: 0, automateAction: 0,
    isDriveEnabled:false, isInAutomationMode:false,
    driveThrottle:0, throttleStickValue:0, domeThrottle:0, turnThrottle:0,
    firstLoadOnConnect:false,
    throttleAxis:'LeftHatY', turnAxis:'LeftHatX', domeAxis:'RightHatX',
    speedSelectButton:'L3', hpLightToggleButton:'R3',
    isHPOn:false,
    // mod2026 only
    GripperAni1a:0, InterAni1a:0,
    lastUpperUtil:-1, lastLowerUtil:-1, lastDataport:-1, lastChargebay:-1,
    lastGripPhase:-1, lastInterPhase:-1,
    lastDriveThrottleSent:-1, lastTurnThrottleSent:-1,
    domeTurnMillis:0, isDomeTurningAuto:false, actualDomeTurnTime:1500, sameDirectionCount:0,
    piePanelMillis:0, currentPieIndex:-1, currentPieState:'PIE_IDLE',
    // maestro only
    RampingMillis:0, YDist:0, XDist:0, CalibrationMode:false,
    leftFoot:90, rightFoot:90,
    pendingAuto:false, pendingAutoUntil:0
  });
  FW.automateDelay = (SIM.profile==='mod2026') ? rnd(6,12) : rnd(5,20);
  applyStickMapping();
}
function applyStickMapping(){
  if(FW.isLeftStickDrive){
    FW.throttleAxis='LeftHatY'; FW.turnAxis='LeftHatX'; FW.domeAxis='RightHatX';
  }else{
    FW.throttleAxis='RightHatY'; FW.turnAxis='RightHatX'; FW.domeAxis='LeftHatX';
  }
  // NOTE: mod2026 swaps L3/R3 with the stick; both maestro sketches assign
  // L3/R3 identically in each branch, so they do NOT swap. Reproduced as written.
  if(PROFILE && PROFILE.swapsStickButtons && !FW.isLeftStickDrive){
    FW.speedSelectButton='R3'; FW.hpLightToggleButton='L3';
  }else{
    FW.speedSelectButton='L3'; FW.hpLightToggleButton='R3';
  }
}

/* ============================================================ CONFIG STORE */
let CFG = {};
let PROFILE = null;
function loadProfile(id, keepPose){
  const p = PROFILES[id]; if(!p) return;
  SIM.profile = id;
  PROFILE = p;
  CFG = JSON.parse(JSON.stringify(p.defaults));
  SIM.blockUntil = -1; SIM.blockedMs = 0;
  actReset();
  servoInit();
  fwReset();
  MOT.drive=MOT.turn=MOT.dome=0; MOT.leftFoot=MOT.rightFoot=90;
  MOT.driveAt=MOT.domeAt=MOT.footAt=-1e9;
  for(const k in MAESTRO.slot) delete MAESTRO.slot[k];
  for(const k in MAESTRO.restartBurst) delete MAESTRO.restartBurst[k];
  SND.track=0; SND.at=-1e9; SND.vol=CFG.vol; SND.chip=p.audio;
  LOG.length=0; logDirty=true;
  lg('sys','════ '+p.name+' ════');
  p.setup();
  if(typeof rebuildProfileUI==='function') rebuildProfileUI();
}

/* ================================================================= DISPATCH */
function fwLoop(){
  SIM.ticks++;
  PROFILE.loop();
}
