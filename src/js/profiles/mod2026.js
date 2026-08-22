'use strict';
/* =====================================================================
   FIRMWARE PROFILES — each is a line-for-line JS port of one sketch
   ===================================================================== */

/* ═════════════════════ A · padawan360 mod2026 (PCA9685) ═════════════════════ */
const PROFILE_MOD2026 = {
  id:'mod2026',
  name:'padawan360 mod2026',
  short:'mod2026',
  /* the name a checkout actually has — the stray space in
     `padawan_secure _mode.ino` was carried into the wiring diagram's
     subtitle and the exported sheet's header, which are the two copies a
     builder reads away from this app. config/hardware.js fixed the same
     typo in the firmware ANSWER; this is the profile's own copy of it. */
  file:'padawan_secure_mode.ino',
  repo:'sel-uis/Astromech-padawan360-mod2026',
  audio:'MD-YX5300',
  swapsStickButtons:true,
  footPWM:()=>false,
  hasServos:true, hasMaestro:false,
  blurb:'Mega ADK · Sabertooth 2x25 + Syren10 · 2× PCA9685 (0x40 body, 0x41 dome pies) · MD-YX5300 on Serial0',
  defaults:{
    DRIVESPEED1:90, DRIVESPEED2:110, DRIVESPEED3:127,
    TURNSPEED:70, DOMESPEED:127, RAMPING:2,
    DOMEDEADZONERANGE:7, DRIVEDEADZONERANGE:7, vol:14, turnDirection0:75,
    LeftDoorOpen:300, LeftDoorClose:487, RightDoorOpen:320, RightDoorClose:170,
    GripperOpen:270, GripperClose:360, GripperArmIn:170, GripperArmOut:620,
    InterOut:430, InterIn:140, InterArmIn:620, InterArmOut:190,
    UpperUtilOut:535, UpperUtilIn:130, LowerUtilOut:535, LowerUtilIn:130,
    dataportDoorOpen:360, dataportDoorClose:180,
    chargebayDoorOpen:180, chargebayDoorClose:310,
    pieOpen:420, pieClose:180,
    loopHz:250, servoSpeed:900, maxSpeed:2.4, maxYaw:2.4, domeRate:3.6
  },
  cfg:{
    speed:[['DRIVESPEED1','Drive speed 1'],['DRIVESPEED2','Drive speed 2'],['DRIVESPEED3','Drive speed 3'],
           ['TURNSPEED','Turn speed'],['DOMESPEED','Dome speed'],['RAMPING','Ramping'],
           ['DRIVEDEADZONERANGE','Drive deadzone'],['DOMEDEADZONERANGE','Dome deadzone'],['vol','Volume 0-30']],
    body:[['LeftDoorOpen','L door open'],['LeftDoorClose','L door close'],['RightDoorOpen','R door open'],['RightDoorClose','R door close'],
          ['GripperArmOut','Grip arm out'],['GripperArmIn','Grip arm in'],['GripperOpen','Gripper open'],['GripperClose','Gripper close'],
          ['InterArmOut','Inter arm out'],['InterArmIn','Inter arm in'],['InterOut','Inter tool out'],['InterIn','Inter tool in'],
          ['UpperUtilOut','Upper util out'],['UpperUtilIn','Upper util in'],['LowerUtilOut','Lower util out'],['LowerUtilIn','Lower util in'],
          ['dataportDoorOpen','Dataport open'],['dataportDoorClose','Dataport close'],
          ['chargebayDoorOpen','Chargebay open'],['chargebayDoorClose','Chargebay close']],
    pie:[['pieOpen','Pie open'],['pieClose','Pie close']],
    sim:[['loopHz','Loop rate Hz'],['servoSpeed','Servo speed u/s'],['maxSpeed','Max drive m/s'],['maxYaw','Max yaw rad/s'],['domeRate','Dome rad/s']]
  },
  notes:[
    {k:'warn', h:'<b>Sabertooth watchdog starvation.</b> The drive block only sends a packet when <b>driveThrottle</b> or <b>turnThrottle</b> <i>changes</i>, but <b>setup()</b> calls <b>Sabertooth2x.setTimeout(950)</b>. Hold a steady throttle — especially at full deflection, where the mapped value pins to DRIVESPEED and stops changing — and no packet goes out for 950 ms, so the Sabertooth cuts the motors until you move the stick again. Watch the <b>S/T TIMEOUT</b> flag in the HUD.'},
    {k:'warn', h:'<b>Automation dome turn never reaches the Syren.</b> The automation block calls <b>Syren10.motor(1, turnDirection)</b>, then the manual dome block at the end of the same pass calls <b>Syren10.motor(1, domeThrottle)</b> unconditionally. Last packet wins. Toggle the fix below.'},
    {k:'info', h:'<b>setup() never homes the servos.</b> Neither PCA9685 is written until something first commands a channel, so on a real boot every door and arm stays wherever it was left, unpowered.'}
  ],
  map:{
    'Primary':[['Left stick','Drive + turn (feet) — armed only'],['Right stick X','Dome (Syren10) — always live'],
      ['START','Arm / disarm the foot motors'],['BACK','Automation mode'],['L3','Cycle drive speed 1→2→3'],
      ['R3','Holoprojector lights'],['Guide + LB + RB','Disconnect controller']],
    'Body & dome':[['LB + ◀','Utility arms IN'],['LB + ▶','Utility arms OUT (+ closes dataport & chargebay)'],
      ['LT + ◀','Gripper arm sequence'],['LT + ▶','Interface arm sequence'],
      ['RT + ◀','Dataport door open'],['RT + ▶','Chargebay door open'],
      ['RT + ▲','Dome pie panels open'],['RT + ▼','Dome pie panels close'],
      ['RB + ▲ / ▼','Volume up / down (±2)']],
    'Sounds':[['Y','random 13–16'],['LB+Y','8'],['LT+Y','2'],['RB+Y','9'],
      ['A','random 17–24'],['LB+A','6'],['LT+A','1'],['RB+A','11'],
      ['B','random 32–51'],['LB+B','7'],['LT+B','3'],['RB+B','10'],
      ['X','random 25–31'],['LB+X','5'],['LT+X','4'],['RB+X','12']]
  },

  setup(){
    mp3.volume(CFG.vol);
    lg('sys','MP3Stream.begin(9600) · mp3.begin()   [MD-YX5300 on Serial0]');
    lg('sys','Serial1 @ 9600 → Sabertooth 2x25 (128) · setTimeout(950)');
    lg('sys','Serial2 @ 9600 → Syren10 (128) · setTimeout(950)');
    lg('sys','pwm1 0x40 / pwm2 0x41 @ 60 Hz');
    lg('sys','EXTINGUISHERPIN 3 → HIGH · Usb.Init()');
    lg('sys','— press START to arm the feet —');
  },

  loop(){
    if(!XB.receiverConnected || !XB.controllerConnected){
      Sabertooth2x.drive(0); Sabertooth2x.turn(0); Syren10.motor(1,0);
      FW.driveThrottle=0; FW.turnThrottle=0; FW.throttleStickValue=0;
      FW.lastDriveThrottleSent=0; FW.lastTurnThrottleSent=0;
      FW.isDriveEnabled=false; FW.isInAutomationMode=false; FW.isDomeTurningAuto=false;
      FW.firstLoadOnConnect=false;
      return;
    }
    if(!FW.firstLoadOnConnect){ FW.firstLoadOnConnect=true; mp3.playTrack(21); setLedMode('ROTATING'); }
    if(getButtonClick('XBOX')){ if(getButtonPress('L1')&&getButtonPress('R1')) xboxDisconnect(); }

    if(getButtonClick('START')){
      if(FW.isDriveEnabled){
        FW.isDriveEnabled=false; setLedMode('ROTATING'); mp3.playTrack(53);
        Sabertooth2x.drive(0); Sabertooth2x.turn(0);
        FW.lastDriveThrottleSent=0; FW.lastTurnThrottleSent=0;
      }else{
        FW.isDriveEnabled=true; mp3.playTrack(52);
        if(FW.drivespeed===CFG.DRIVESPEED1) setLedOn(1);
        else if(FW.drivespeed===CFG.DRIVESPEED2 && CFG.DRIVESPEED3!==0) setLedOn(2);
        else setLedOn(3);
      }
    }
    if(getButtonClick('BACK')){
      if(FW.isInAutomationMode){ FW.isInAutomationMode=false; mp3.playTrack(53); }
      else { FW.isInAutomationMode=true; mp3.playTrack(52); }
    }

    if(FW.isInAutomationMode){
      const cur=SIM.millis;
      if(!FW.isDomeTurningAuto){
        if(cur-FW.automateMillis > FW.automateDelay*1000){
          FW.automateMillis=cur;
          mp3.playTrack(rnd(32,52));
          let nd=(rnd(0,2)===0)?75:-75;
          if(nd===FW.turnDirection){ FW.sameDirectionCount++; if(FW.sameDirectionCount>=2){ nd=-nd; FW.sameDirectionCount=0; } }
          else FW.sameDirectionCount=0;
          FW.turnDirection=nd; FW.actualDomeTurnTime=rnd(1200,2201);
          FW.domeTurnMillis=cur; FW.isDomeTurningAuto=true;
        }
      }
      if(FW.isDomeTurningAuto){
        if(cur-FW.domeTurnMillis < FW.actualDomeTurnTime) Syren10.motor(1, FW.turnDirection);
        else { Syren10.motor(1,0); FW.isDomeTurningAuto=false; FW.automateMillis=cur; FW.automateDelay=rnd(6,14); }
      }
    }

    if(getButtonClick('UP'))  { if(getButtonPress('R1')){ if(CFG.vol<30){CFG.vol+=2; mp3.volume(CFG.vol);} } }
    if(getButtonClick('DOWN')){ if(getButtonPress('R1')){ if(CFG.vol>0 ){CFG.vol-=2; mp3.volume(CFG.vol);} } }

    if(getButtonPress('L1')){
      if(getButtonPress('LEFT')){
        if(FW.lastUpperUtil!==CFG.UpperUtilIn){ pwm1.setPWM(5,0,CFG.UpperUtilIn); FW.lastUpperUtil=CFG.UpperUtilIn; }
        if(FW.lastLowerUtil!==CFG.LowerUtilIn){ pwm1.setPWM(4,0,CFG.LowerUtilIn); FW.lastLowerUtil=CFG.LowerUtilIn; }
      }
      if(getButtonPress('RIGHT')){
        if(FW.lastUpperUtil!==CFG.UpperUtilOut){ pwm1.setPWM(5,0,CFG.UpperUtilOut); FW.lastUpperUtil=CFG.UpperUtilOut; }
        if(FW.lastLowerUtil!==CFG.LowerUtilOut){ pwm1.setPWM(4,0,CFG.LowerUtilOut); FW.lastLowerUtil=CFG.LowerUtilOut; }
        if(FW.lastChargebay!==CFG.chargebayDoorClose){ pwm1.setPWM(9,0,CFG.chargebayDoorClose); FW.lastChargebay=CFG.chargebayDoorClose; }
        if(FW.lastDataport !==CFG.dataportDoorClose ){ pwm1.setPWM(8,0,CFG.dataportDoorClose ); FW.lastDataport =CFG.dataportDoorClose;  }
      }
    }
    if(getButtonPress('L2')){
      if(getButtonClick('LEFT'))  FW.GripperAni1a=1000;
      if(getButtonClick('RIGHT')) FW.InterAni1a  =1000;
    }
    if(getButtonPress('R2')){
      if(getButtonPress('LEFT') && FW.lastDataport!==CFG.dataportDoorOpen){ pwm1.setPWM(8,0,CFG.dataportDoorOpen); FW.lastDataport=CFG.dataportDoorOpen; }
      if(getButtonPress('RIGHT')&& FW.lastChargebay!==CFG.chargebayDoorOpen){ pwm1.setPWM(9,0,CFG.chargebayDoorOpen); FW.lastChargebay=CFG.chargebayDoorOpen; }
      if(getButtonPress('UP'))   zona2Open();
      if(getButtonPress('DOWN')) zona2Close();
    }

    if(FW.GripperAni1a>0){
      FW.GripperAni1a--; const g=FW.GripperAni1a;
      if(g<2)       { if(FW.lastGripPhase!==1){ pwm1.setPWM(1,0,CFG.RightDoorClose); FW.lastGripPhase=1; } }
      else if(g<150){ if(FW.lastGripPhase!==2){ pwm1.setPWM(2,0,CFG.GripperArmIn);   FW.lastGripPhase=2; } }
      else if(g<250){ if(FW.lastGripPhase!==3){ pwm1.setPWM(3,0,CFG.GripperClose);   FW.lastGripPhase=3; } }
      else if(g<350){ if(FW.lastGripPhase!==4){ pwm1.setPWM(3,0,CFG.GripperOpen);    FW.lastGripPhase=4; } }
      else if(g<450){ if(FW.lastGripPhase!==5){ pwm1.setPWM(3,0,CFG.GripperClose);   FW.lastGripPhase=5; } }
      else if(g<550){ if(FW.lastGripPhase!==6){ pwm1.setPWM(3,0,CFG.GripperOpen);    FW.lastGripPhase=6; } }
      else if(g<800){ if(FW.lastGripPhase!==7){ pwm1.setPWM(2,0,CFG.GripperArmOut);  FW.lastGripPhase=7; } }
      else if(g<900){ if(FW.lastGripPhase!==8){ pwm1.setPWM(1,0,CFG.RightDoorOpen);  FW.lastGripPhase=8; } }
    } else FW.lastGripPhase=-1;

    if(FW.InterAni1a>0){
      FW.InterAni1a--; const g=FW.InterAni1a;
      if(g<2)       { if(FW.lastInterPhase!==1){ pwm1.setPWM(0,0,CFG.LeftDoorClose); FW.lastInterPhase=1; } }
      else if(g<150){ if(FW.lastInterPhase!==2){ pwm1.setPWM(6,0,CFG.InterArmIn);    FW.lastInterPhase=2; } }
      else if(g<250){ if(FW.lastInterPhase!==3){ pwm1.setPWM(7,0,CFG.InterIn);       FW.lastInterPhase=3; } }
      else if(g<350){ if(FW.lastInterPhase!==4){ pwm1.setPWM(7,0,CFG.InterOut);      FW.lastInterPhase=4; } }
      else if(g<450){ if(FW.lastInterPhase!==5){ pwm1.setPWM(7,0,CFG.InterIn);       FW.lastInterPhase=5; } }
      else if(g<550){ if(FW.lastInterPhase!==6){ pwm1.setPWM(7,0,CFG.InterOut);      FW.lastInterPhase=6; } }
      else if(g<800){ if(FW.lastInterPhase!==7){ pwm1.setPWM(6,0,CFG.InterArmOut);   FW.lastInterPhase=7; } }
      else if(g<900){ if(FW.lastInterPhase!==8){ pwm1.setPWM(0,0,CFG.LeftDoorOpen);  FW.lastInterPhase=8; } }
    } else FW.lastInterPhase=-1;

    if(getButtonClick('Y')){
      if(getButtonPress('L1'))      { mp3.playTrack(8);  triggerI2C(10,0); }
      else if(getButtonPress('L2')) { mp3.playTrack(2);  triggerI2C(10,0); }
      else if(getButtonPress('R1')) { mp3.playTrack(9);  triggerI2C(10,0); }
      else                          { mp3.playTrack(rnd(13,17)); triggerI2C(10,0); }
    }
    if(getButtonClick('A')){
      if(getButtonPress('L1'))      { mp3.playTrack(6);  triggerI2C(10,6); }
      else if(getButtonPress('L2')) { mp3.playTrack(1);  triggerI2C(10,1); }
      else if(getButtonPress('R1')) { mp3.playTrack(11); triggerI2C(10,11); }
      else                          { mp3.playTrack(rnd(17,25)); triggerI2C(10,0); }
    }
    if(getButtonClick('B')){
      if(getButtonPress('L1'))      { mp3.playTrack(7);  triggerI2C(10,0); }
      else if(getButtonPress('L2')) { mp3.playTrack(3);  triggerI2C(10,0); }
      else if(getButtonPress('R1')) { mp3.playTrack(10); triggerI2C(10,10); }
      else                          { mp3.playTrack(rnd(32,52)); triggerI2C(10,0); }
    }
    if(getButtonClick('X')){
      if(getButtonPress('L1'))      { mp3.playTrack(5);  triggerI2C(10,5); }
      else if(getButtonPress('L2')) { mp3.playTrack(4);  triggerI2C(10,4); }
      else if(getButtonPress('R1')) { mp3.playTrack(12); triggerI2C(10,0); }
      else                          { mp3.playTrack(rnd(25,32)); triggerI2C(10,0); }
    }

    if(getButtonClick(FW.hpLightToggleButton)) FW.isHPOn = !FW.isHPOn;

    if(getButtonClick(FW.speedSelectButton) && FW.isDriveEnabled){
      if(FW.drivespeed===CFG.DRIVESPEED1){ FW.drivespeed=CFG.DRIVESPEED2; setLedOn(2); mp3.playTrack(53); triggerI2C(10,22); }
      else if(FW.drivespeed===CFG.DRIVESPEED2 && CFG.DRIVESPEED3!==0){ FW.drivespeed=CFG.DRIVESPEED3; setLedOn(3); mp3.playTrack(1); triggerI2C(10,23); }
      else { FW.drivespeed=CFG.DRIVESPEED1; setLedOn(1); mp3.playTrack(52); triggerI2C(10,21); }
    }

    FW.throttleStickValue = map_(getAnalogHat(FW.throttleAxis), -32768, 32767, -FW.drivespeed, FW.drivespeed);
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
    FW.turnThrottle = map_(getAnalogHat(FW.turnAxis), -32768, 32767, -CFG.TURNSPEED, CFG.TURNSPEED);

    if(FW.isDriveEnabled){
      if(FW.turnThrottle > -CFG.DRIVEDEADZONERANGE && FW.turnThrottle < CFG.DRIVEDEADZONERANGE) FW.turnThrottle = 0;
      // ↓ the change-guard that starves the Sabertooth watchdog
      if(FW.driveThrottle !== FW.lastDriveThrottleSent || FW.turnThrottle !== FW.lastTurnThrottleSent){
        Sabertooth2x.turn(-FW.turnThrottle);
        Sabertooth2x.drive(FW.driveThrottle);
        FW.lastDriveThrottleSent = FW.driveThrottle;
        FW.lastTurnThrottleSent  = FW.turnThrottle;
      }
    }

    FW.domeThrottle = map_(getAnalogHat(FW.domeAxis), -32768, 32767, CFG.DOMESPEED, -CFG.DOMESPEED);
    if(FW.domeThrottle > -CFG.DOMEDEADZONERANGE && FW.domeThrottle < CFG.DOMEDEADZONERANGE) FW.domeThrottle = 0;
    if(!(SIM.fixDomeBug && FW.isDomeTurningAuto && FW.domeThrottle===0)) Syren10.motor(1, FW.domeThrottle);

    if(FW.currentPieState==='PIE_OPENING'){
      if(SIM.millis - FW.piePanelMillis >= 30){
        FW.piePanelMillis = SIM.millis;
        pwm2.setPWM(FW.currentPieIndex, 0, CFG.pieOpen);
        FW.currentPieIndex++;
        if(FW.currentPieIndex>10) FW.currentPieState='PIE_IDLE';
      }
    } else if(FW.currentPieState==='PIE_CLOSING'){
      if(SIM.millis - FW.piePanelMillis >= 30){
        FW.piePanelMillis = SIM.millis;
        pwm2.setPWM(FW.currentPieIndex, 0, CFG.pieClose);
        FW.currentPieIndex--;
        if(FW.currentPieIndex<0) FW.currentPieState='PIE_IDLE';
      }
    }
  }
};
function zona2Open(){
  if(FW.currentPieState!=='PIE_OPENING'){ FW.currentPieState='PIE_OPENING'; FW.currentPieIndex=0; FW.piePanelMillis=SIM.millis; lg('sys','zona2Open()'); }
}
function zona2Close(){
  if(FW.currentPieState!=='PIE_CLOSING'){ FW.currentPieState='PIE_CLOSING'; FW.currentPieIndex=10; FW.piePanelMillis=SIM.millis; lg('sys','zona2Close()'); }
}
