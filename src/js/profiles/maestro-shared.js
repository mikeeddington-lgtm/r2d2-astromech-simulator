'use strict';
/* ═══════════════ B/C · Maestro + DY-SV5W (shared loop body) ═══════════════ */
const MAESTRO_MAP = {
  'Primary':[['Left stick','Drive + turn (feet) — armed only'],['Right stick X','Dome (Syren10) — always live'],
    ['START','Arm / disarm the foot motors'],['BACK','Automation mode'],['L3','Cycle drive speed 1→2→3'],
    ['R3','Holoprojector lights (I2C 25)'],['Guide + LB + RB','Disconnect controller']],
  'Maestro scripts':[
    ['RT + ▲','restartScript(0) — body doors open'],['RT + ▶','restartScript(1) — body doors close'],
    ['RT + ▼','restartScript(2) — dome pies open'],['RT + ◀','restartScript(3) — dome pies close'],
    ['LT + ▲','restartScript(4) — utility arms out'],['LT + ▶','restartScript(5) — utility arms in, + track 3'],
    ['LT + ▼','restartScript(6) — whole dome open'],['LT + ◀','restartScript(7) — whole dome close'],
    ['RB + ▲','Volume DOWN (vol--)'],['RB + ▼','Volume UP (vol++)']],
  'Sounds':[['Y','random 13–16'],['LB+Y','8'],['LT+Y','2'],['RB+Y','9'],
    ['A','random 17–24'],['LB+A','6'],['LT+A','1'],['RB+A','11'],
    ['B','random 32–51'],['LB+B','7'],['LT+B','3'],['RB+B','10'],
    ['X','random 32–51 ⚠'],['LB+X','5'],['LT+X','4'],['RB+X','12']]
};

function maestroLoopBody(P){
  // resume point for the blocking delay(750) in the automation block
  if(FW.pendingAuto && SIM.millis >= FW.pendingAutoUntil){
    FW.pendingAuto = false;
    Syren10.motor(1, 0);
    FW.turnDirection = (FW.turnDirection>0) ? -45 : 45;
    FW.automateDelay = rnd(3,10);
  }

  if(!XB.receiverConnected || !XB.controllerConnected){
    if(P.footPWM()) stopFeetPWM(); else { Sabertooth2x.drive(0); Sabertooth2x.turn(0); }
    Syren10.motor(1,0);
    // NOTE: the 2022 BETA does NOT clear isDriveEnabled here — see profile notes
    if(P.disarmOnLoss) FW.isDriveEnabled = false;
    FW.firstLoadOnConnect = false;
    return;
  }
  if(!FW.firstLoadOnConnect){ FW.firstLoadOnConnect=true; player.playSpecified(21); setLedMode('ROTATING'); }
  if(getButtonClick('XBOX')){ if(getButtonPress('L1')&&getButtonPress('R1')) xboxDisconnect(); }

  if(getButtonClick('START')){
    if(FW.isDriveEnabled){
      FW.isDriveEnabled=false; setLedMode('ROTATING'); player.playSpecified(53);
      lg('warn','Serial.println("Start pressed") — printed onto the same UART the DY-SV5W listens on');
    }else{
      FW.isDriveEnabled=true; player.playSpecified(52);
      lg('warn','Serial.println("Start pressed") — printed onto the same UART the DY-SV5W listens on');
      if(FW.drivespeed===CFG.DRIVESPEED1) setLedOn(1);
      else if(FW.drivespeed===CFG.DRIVESPEED2 && CFG.DRIVESPEED3!==0) setLedOn(2);
      else setLedOn(3);
    }
  }
  if(getButtonClick('BACK')){
    if(FW.isInAutomationMode){ FW.isInAutomationMode=false; FW.automateAction=0; player.playSpecified(53); }
    else { FW.isInAutomationMode=true; player.playSpecified(52); }
  }

  /* --- automation: random sound and/or a 750 ms BLOCKING dome turn --- */
  if(FW.isInAutomationMode){
    const cur = SIM.millis;
    if(cur - FW.automateMillis > FW.automateDelay*1000){
      FW.automateMillis = cur;
      FW.automateAction = rnd(1,5);
      if(FW.automateAction > 1) player.playSpecified(rnd(32,52));
      if(FW.automateAction < 4){
        Syren10.motor(1, FW.turnDirection);
        // delay(750) — the whole sketch stops here, nothing else is serviced
        FW.pendingAuto = true;
        FW.pendingAutoUntil = SIM.millis + 750;
        SIM.blockUntil = FW.pendingAutoUntil;
        SIM.blockedMs += 750;
        lg('warn','delay(750) in automation — loop blocked, no controller polling or motor updates');
        return;
      }
      FW.automateDelay = rnd(3,10);
    }
  }

  /* --- DY-SV5W volume: UP decrements, DOWN increments (as written) --- */
  if(getButtonClick('UP'))  { if(getButtonPress('R1')){ if(CFG.vol>0 ){ CFG.vol--; player.setVolume(CFG.vol); } } }
  if(getButtonClick('DOWN')){ if(getButtonPress('R1')){ if(CFG.vol<30){ CFG.vol++; player.setVolume(CFG.vol); } } }

  /* --- Maestro scripts. getButtonPress, so a held d-pad restarts every pass --- */
  if(getButtonPress('R2')){
    if(getButtonPress('UP'))    maestro.restartScript(0);
    if(getButtonPress('RIGHT')) maestro.restartScript(1);
    if(getButtonPress('DOWN'))  maestro.restartScript(2);
    if(getButtonPress('LEFT'))  maestro.restartScript(3);
  }
  if(getButtonPress('L2')){
    if(getButtonPress('UP'))    maestro.restartScript(4);
    if(getButtonPress('RIGHT')){ maestro.restartScript(5); player.playSpecified(3); }
    if(getButtonPress('DOWN'))  maestro.restartScript(6);
    if(getButtonPress('LEFT'))  maestro.restartScript(7);
  }

  if(getButtonClick('Y')){
    if(getButtonPress('L1'))      { player.playSpecified(8);  triggerI2C(10,0); }
    else if(getButtonPress('L2')) { player.playSpecified(2);  triggerI2C(10,0); }
    else if(getButtonPress('R1')) { player.playSpecified(9);  triggerI2C(10,0); }
    else                          { player.playSpecified(rnd(13,17)); triggerI2C(10,0); }
  }
  if(getButtonClick('A')){
    if(getButtonPress('L1'))      { player.playSpecified(6);  triggerI2C(10,6); triggerI2C(25,11); triggerI2C(26,11); triggerI2C(27,11); }
    else if(getButtonPress('L2')) { player.playSpecified(1);  triggerI2C(10,1); triggerI2C(25,3);  triggerI2C(26,3);  triggerI2C(27,3);  }
    else if(getButtonPress('R1')) { player.playSpecified(11); triggerI2C(10,11); }
    else                          { player.playSpecified(rnd(17,25)); triggerI2C(10,0); }
  }
  if(getButtonClick('B')){
    if(getButtonPress('L1'))      { player.playSpecified(7);  triggerI2C(10,0); }
    else if(getButtonPress('L2')) { player.playSpecified(3);  triggerI2C(10,0); }
    else if(getButtonPress('R1')) { player.playSpecified(10); triggerI2C(10,10); triggerI2C(25,10); triggerI2C(26,10); triggerI2C(27,10); }
    else                          { player.playSpecified(rnd(32,52)); triggerI2C(10,0); }
  }
  if(getButtonClick('X')){
    if(getButtonPress('L1'))      { player.playSpecified(5);  triggerI2C(10,5); triggerI2C(25,9); }
    else if(getButtonPress('L2')) { player.playSpecified(4);  triggerI2C(10,4); }
    else if(getButtonPress('R1')) { player.playSpecified(12); triggerI2C(10,0); }
    // ↓ as written: the whistle bank random(25,32) was replaced by random(32,52)
    else                          { player.playSpecified(rnd(32,52)); triggerI2C(10,0); }
  }

  if(getButtonClick(FW.hpLightToggleButton)){
    if(FW.isHPOn){ FW.isHPOn=false; triggerI2C(25,2); }
    else         { FW.isHPOn=true;  triggerI2C(25,1); }
  }

  if(getButtonClick(FW.speedSelectButton) && FW.isDriveEnabled){
    if(FW.drivespeed===CFG.DRIVESPEED1){ FW.drivespeed=CFG.DRIVESPEED2; setLedOn(2); player.playSpecified(53); triggerI2C(10,22); }
    else if(FW.drivespeed===CFG.DRIVESPEED2 && CFG.DRIVESPEED3!==0){ FW.drivespeed=CFG.DRIVESPEED3; setLedOn(3); player.playSpecified(1); triggerI2C(10,23); }
    else { FW.drivespeed=CFG.DRIVESPEED1; setLedOn(1); player.playSpecified(52); triggerI2C(10,21); }
  }

  /* ------------------------------- FOOT DRIVES ------------------------------- */
  if(!P.footPWM()){
    /* FOOT_CONTROLLER == 0 : Sabertooth */
    FW.throttleStickValue = map_(getAnalogHat(FW.throttleAxis), -32768, 32767, -FW.drivespeed, FW.drivespeed);

    if(P.rampDeadzoneDelay){
      if(FW.throttleStickValue < -CFG.DRIVEDEADZONERANGE || FW.throttleStickValue > CFG.DRIVEDEADZONERANGE) FW.RampingMillis = SIM.millis;
      if(FW.throttleStickValue > -CFG.DRIVEDEADZONERANGE && FW.throttleStickValue < CFG.DRIVEDEADZONERANGE
         && (SIM.millis - FW.RampingMillis > CFG.RampingDeadzoneDelay)){
        FW.driveThrottle = 0;
        stopFeetSaber();
      }else{
        if(FW.isInAutomationMode){ FW.isInAutomationMode=false; FW.automateAction=0; lg('sys','automation cancelled — drive stick moved'); }
        if(FW.driveThrottle < FW.throttleStickValue){
          if(FW.throttleStickValue - FW.driveThrottle > CFG.RAMPING) FW.driveThrottle += CFG.RAMPING;
          else FW.driveThrottle = FW.throttleStickValue;
        }else if(FW.driveThrottle > FW.throttleStickValue){
          if(FW.driveThrottle - FW.throttleStickValue > CFG.RAMPING) FW.driveThrottle -= CFG.RAMPING;
          else FW.driveThrottle = FW.throttleStickValue;
        }
      }
    }else{
      /* 2022 BETA: plain ramping, no deadzone delay */
      if(FW.throttleStickValue > -CFG.DRIVEDEADZONERANGE && FW.throttleStickValue < CFG.DRIVEDEADZONERANGE){
        FW.driveThrottle = 0;
      }else{
        if(FW.driveThrottle < FW.throttleStickValue){
          if(FW.throttleStickValue - FW.driveThrottle < (CFG.RAMPING+1)) FW.driveThrottle += CFG.RAMPING;
          else FW.driveThrottle = FW.throttleStickValue;
        }else if(FW.driveThrottle > FW.throttleStickValue){
          if(FW.driveThrottle - FW.throttleStickValue < (CFG.RAMPING+1)) FW.driveThrottle -= CFG.RAMPING;
          else FW.driveThrottle = FW.throttleStickValue;
        }
      }
    }

    FW.turnThrottle = map_(getAnalogHat(FW.turnAxis), -32768, 32767, -CFG.TURNSPEED, CFG.TURNSPEED);
    if(FW.isDriveEnabled){
      if(FW.turnThrottle > -CFG.DRIVEDEADZONERANGE && FW.turnThrottle < CFG.DRIVEDEADZONERANGE) FW.turnThrottle = 0;
      // sent every pass — the watchdog stays fed, unlike mod2026
      Sabertooth2x.turn(-FW.turnThrottle);
      Sabertooth2x.drive(FW.driveThrottle);
    }
  }else{
    /* FOOT_CONTROLLER == 1 : individual ESCs, hub motors */
    const rawY = getAnalogHat(FW.throttleAxis);
    const rawX = getAnalogHat(FW.turnAxis);
    if(FW.isDriveEnabled){
      FW.CalibrationMode = (getButtonPress('L1') && getButtonPress('L2') && getButtonPress('R1') && getButtonPress('R2')
                            && FW.drivespeed===CFG.DRIVESPEED3);
      mixHubDrive(rawX, rawY, FW.CalibrationMode ? CFG.CalibrationSpeed : FW.drivespeed);
      if(FW.isInAutomationMode && (FW.leftFoot!==90 || FW.rightFoot!==90)){
        FW.isInAutomationMode=false; FW.automateAction=0; lg('sys','automation cancelled — drive stick moved');
      }
      leftFootSignal.write(FW.leftFoot);
      rightFootSignal.write(FW.rightFoot);
    }else{
      stopFeetPWM();
    }
  }

  /* -------------------------------- DOME DRIVE ------------------------------- */
  FW.domeThrottle = map_(getAnalogHat(FW.domeAxis), -32768, 32767, CFG.DOMESPEED, -CFG.DOMESPEED);
  if(FW.domeThrottle > -CFG.DOMEDEADZONERANGE && FW.domeThrottle < CFG.DOMEDEADZONERANGE) FW.domeThrottle = 0;
  Syren10.motor(1, FW.domeThrottle);
}

function stopFeetSaber(){ Sabertooth2x.drive(0); Sabertooth2x.turn(0); }
function stopFeetPWM(){ FW.leftFoot=90; FW.rightFoot=90; leftFootSignal.write(90); rightFootSignal.write(90); }

/* mixHubDrive() — ported exactly, including the unconstrained map() overshoot */
function mixHubDrive(stickX, stickY, maxDriveSpeed){
  const DZ = CFG.DRIVEDEADZONERANGE * 258;
  if(stickX <= -DZ || stickX >= DZ || stickY <= -DZ || stickY >= DZ) FW.RampingMillis = SIM.millis;

  if(stickX <= -DZ || stickX >= DZ || stickY <= -DZ || stickY >= DZ
     || (SIM.millis - FW.RampingMillis < CFG.RampingDeadzoneDelay)){
    const Yn = map_(stickY, -32768, 32767, -100, 100);
    if(FW.YDist < Yn){
      if(Yn - FW.YDist > CFG.RAMPING) FW.YDist += CFG.RAMPING; else FW.YDist = Yn;
    }else if(FW.YDist > Yn){
      if(FW.YDist - Yn > CFG.RAMPING) FW.YDist -= CFG.RAMPING; else FW.YDist = Yn;
    }
    FW.XDist = map_(stickX, -32768, 32767, -100, 100);

    const RightSpeed = FW.YDist - (FW.XDist * (CFG.TURNSPEED/100));
    const LeftSpeed  = FW.YDist + (FW.XDist * (CFG.TURNSPEED/100));

    const maxServoForward = map_(maxDriveSpeed, 0, 127, 90, 180);
    const maxServoReverse = map_(maxDriveSpeed, 0, 127, 90, 0);

    // leftDirection / rightDirection are both 1 in the sketch → this branch
    FW.leftFoot  = CFG.leftDirection ===0 ? map_(LeftSpeed, -100,100, maxServoForward, maxServoReverse)
                                          : map_(LeftSpeed, -100,100, maxServoReverse, maxServoForward);
    FW.rightFoot = CFG.rightDirection===0 ? map_(RightSpeed,-100,100, maxServoForward, maxServoReverse)
                                          : map_(RightSpeed,-100,100, maxServoReverse, maxServoForward);
    // Servo::write() constrains to 0..180 for values below MIN_PULSE_WIDTH
    FW.leftFoot  = clamp(FW.leftFoot, 0,180);
    FW.rightFoot = clamp(FW.rightFoot,0,180);
  }else{
    if(SIM.millis - FW.RampingMillis > CFG.RampingDeadzoneDelay){ FW.leftFoot=90; FW.rightFoot=90; }
  }
}

const MAESTRO_CFG_COMMON = {
  scripts:[['maestroScript','Maestro slots']],
  sim:[['loopHz','Loop rate Hz'],['maestroRate','Anim rate /s'],['maxSpeed','Max drive m/s'],['maxYaw','Max yaw rad/s'],['domeRate','Dome rad/s']]
};
