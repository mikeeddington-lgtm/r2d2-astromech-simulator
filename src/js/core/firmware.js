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

/* ====================================================== A PROFILE THAT THREW
   (v1.77.0, review H6.) A firmware whose setup() or loop() throws is not
   left in the seat. Before this, an imported .ino calling one library
   method its adapter lacks was stored, made the build's answer and THEN
   run — so `loadProfile(bootFw)` threw inside main.js's load handler on
   every reload after, nothing past it ran (no loop, no header buttons) and
   the fix was clearing localStorage by hand. A throw in loop() was the
   same thing one frame later: frame()'s fixed-step while never reached
   `acc -= period`, so every frame threw on its first step, forever.

   This is the one recovery, called from the sketch profile's own wrappers
   (profiles/sketch-import.js) and from the boot try in main.js:
     · the setup's own recommendation is loaded — never a sketch, that is
       firmwareRecommend()'s rule, and never the profile that just threw;
     · if the BUILD named the crashed profile it is pointed at the fallback
       and unpinned, so the NEXT boot is clean and the setup chooses again —
       a pinned choice that cannot run is not a choice anybody made;
     · the log and the toast name what threw, in the sketch's own terms
       (sketchExplain: "calls mp3.playFolder, which the simulator's
       MD_YX5300 adapter does not have"), written AFTER the load so the
       log reset in loadProfile() cannot eat them.
   Deliberately not a catch in fwLoop(): the three hand ports must keep
   throwing loudly — every suite counts page errors, and a blanket catch
   here would turn a port regression into a toast. */
function fwFallback(id, e, where){
  const p = PROFILES[id];
  const label = p ? p.name : String(id);
  const what = (typeof sketchExplain === 'function' && typeof isSketchProfile === 'function' && isSketchProfile(id))
    ? sketchExplain(e, id)
    : ('threw: '+String((e && e.message) || e).split('\n')[0]);
  let fb = 'mod2026';
  if(typeof firmwareRecommend === 'function'){ try{ fb = firmwareRecommend().id; }catch(_){ fb = 'mod2026'; } }
  if(fb === id || !PROFILES[fb]) fb = 'mod2026';
  let buildFixed = false;
  if(typeof PREFS !== 'undefined' && PREFS.build && PREFS.build.firmware === id){
    PREFS.build.firmware = fb;
    PREFS.build.firmwarePinned = false;
    buildFixed = true;
    if(typeof prefsSave === 'function') prefsSave();
  }
  if(SIM.profile === id || !PROFILE || PROFILE.id === id) loadProfile(fb);
  const msg = label+' threw in '+where+' — it '+what+'. Unloaded; running '+PROFILES[fb].name+' instead'
    + (buildFixed ? ', and the build\'s firmware is back with the setup' : '')+'.';
  lg('warn', msg);
  if(typeof toast === 'function') toast(msg, 'err');
  if(typeof buildFwSelector === 'function') buildFwSelector();
  return fb;
}

/* ================================================================= DISPATCH */
function fwLoop(){
  SIM.ticks++;
  PROFILE.loop();
}
