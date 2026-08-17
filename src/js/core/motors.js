'use strict';
const MOT = {
  drive:0, turn:0, dome:0,               // last commanded values
  driveAt:-1e9, domeAt:-1e9,             // last packet timestamps
  driveTO:true, domeTO:true,             // watchdog expired?
  leftFoot:90, rightFoot:90,             // PWM hub mode (0-180 servo units)
  footAt:-1e9
};
const SABER_TIMEOUT = 950;
const Sabertooth2x = {
  drive(v){ MOT.driveAt=SIM.millis; if(MOT.drive!==v){ MOT.drive=v; lg('sab',`Sabertooth2x.drive(${v})`);} },
  turn(v) { MOT.driveAt=SIM.millis; if(MOT.turn !==v){ MOT.turn =v; lg('sab',`Sabertooth2x.turn(${v})`);} }
};
const Syren10 = {
  motor(m,v){ MOT.domeAt=SIM.millis; if(MOT.dome!==v){ MOT.dome=v; lg('syr',`Syren10.motor(${m}, ${v})`);} }
};
const leftFootSignal  = { write(v){ MOT.footAt=SIM.millis; if(MOT.leftFoot !==v){ MOT.leftFoot =v; lg('pwmf',`leftFootSignal.write(${v})`);} } };
const rightFootSignal = { write(v){ MOT.footAt=SIM.millis; if(MOT.rightFoot!==v){ MOT.rightFoot=v; lg('pwmf',`rightFootSignal.write(${v})`);} } };
function motorWatchdog(){
  MOT.driveTO = (SIM.millis - MOT.driveAt) > SABER_TIMEOUT;
  MOT.domeTO  = (SIM.millis - MOT.domeAt)  > SABER_TIMEOUT;
}
/* what the motors are actually doing, after the watchdog */
function effDrive(){ return (PROFILE.footPWM && PROFILE.footPWM()) ? 0 : (MOT.driveTO?0:MOT.drive); }
function effTurn() { return (PROFILE.footPWM && PROFILE.footPWM()) ? 0 : (MOT.driveTO?0:MOT.turn ); }
function effDome() { return MOT.domeTO?0:MOT.dome; }
