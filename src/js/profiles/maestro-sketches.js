'use strict';
/* ─────────────── B · Maestro DY-SV5W PWM (2025, Steve Baudains) ─────────────── */
const PROFILE_MAESTRO_PWM = {
  id:'maestro25',
  name:'Maestro · DY-SV5W · PWM hub',
  short:'Maestro 2025',
  file:'Padawan360_mega_maestro_DYSV5W_PWM.ino',
  repo:'Imperiallandm/Padawan360_mega_maestro_DYSV5W',
  audio:'DY-SV5W',
  swapsStickButtons:false,
  disarmOnLoss:true,
  rampDeadzoneDelay:true,
  hasServos:false, hasMaestro:true,
  footPWM:()=>CFG.FOOT_CONTROLLER===1,
  blurb:'Mega 2560 · Pololu MiniMaestro on Serial3 · DY-SV5W on Serial0 · Syren10 + (Sabertooth | Flipsky FSESC hub motors)',
  defaults:{
    FOOT_CONTROLLER:1,
    DRIVESPEED1:30, DRIVESPEED2:38, DRIVESPEED3:50,
    TURNSPEED:40, DOMESPEED:127, RAMPING:2,
    DOMEDEADZONERANGE:20, DRIVEDEADZONERANGE:22,
    RampingDeadzoneDelay:200, CalibrationSpeed:127,
    leftDirection:1, rightDirection:1,
    vol:25, turnDirection0:20,
    maestroScript:['doors_open','doors_close','pies_open','pies_close','utils_out','utils_in','dome_open','dome_close'],
    maestroSource:'builtin',
    loopHz:250, maestroRate:2.2, maxSpeed:2.4, maxYaw:2.4, domeRate:3.6
  },
  cfg:{
    speed:[['FOOT_CONTROLLER','Foot mode 0=ST 1=PWM'],
           ['DRIVESPEED1','Drive speed 1'],['DRIVESPEED2','Drive speed 2'],['DRIVESPEED3','Drive speed 3'],
           ['TURNSPEED','Turn speed'],['DOMESPEED','Dome speed'],['RAMPING','Ramping'],
           ['DRIVEDEADZONERANGE','Drive deadzone'],['DOMEDEADZONERANGE','Dome deadzone'],
           ['RampingDeadzoneDelay','Deadzone delay ms'],['CalibrationSpeed','Calibration speed'],
           ['leftDirection','leftDirection'],['rightDirection','rightDirection'],['vol','Volume 0-30']],
    sim:MAESTRO_CFG_COMMON.sim
  },
  notes:[
    {k:'warn', h:'<b>delay(750) inside automation.</b> The dome turn blocks the whole sketch for three quarters of a second — no controller polling, no ESC or Sabertooth updates, no script servicing. With the feet armed the droid keeps its last drive command for the entire block. The HUD shows a <b>LOOP BLOCKED</b> flag when it happens.'},
    {k:'warn', h:'<b>Serial.println() collides with the DY-SV5W.</b> <b>DY::Player player;</b> defaults to <b>Serial</b>, and the START / BACK handlers call <b>Serial.println("…")</b> on that same UART. Those bytes go straight into the audio module\'s command stream. Drop the prints, or move the player to another hardware serial.'},
    {k:'warn', h:'<b>mixHubDrive() overshoots the speed cap.</b> <b>LeftSpeed</b> can reach ±140 at full stick, but it is mapped from a ±100 range with an unconstrained <b>map()</b>. At speed 3 (50) the cap should be servo 125, yet a full-throttle turn produces 139 — about 19% over. It only stops climbing because <b>Servo::write()</b> clamps at 180.'},
    {k:'info', h:'<b>Volume is inverted.</b> D-pad ▲ runs <b>vol--</b> and ▼ runs <b>vol++</b>. That was right for the MP3Trigger (0 = loudest) but on the DY-SV5W 30 is loudest, so ▲ makes it quieter.'},
    {k:'info', h:'<b>X on its own plays the wrong bank.</b> The bare-X branch calls <b>random(32,52)</b>, the same as bare B — the commented-out original was <b>random(25,32)</b>, the whistle bank.'},
    {k:'info', h:'<b>isLeftStickDrive does not swap L3/R3.</b> Both branches of the <b>if</b> in setup() assign <b>speedSelectButton = L3</b> and <b>hpLightToggleButton = R3</b>, so switching to right-stick drive leaves the stick-click functions where they were.'},
    {k:'info', h:'<b>Held d-pad restarts the script forever.</b> The Maestro triggers use <b>getButtonPress</b>, not <b>getButtonClick</b>, so holding RT + ▲ calls <b>restartScript(0)</b> every loop pass and the sequence never gets past its first few milliseconds. It only runs once you let go. Tap, don\'t hold.'}
  ],
  map:MAESTRO_MAP,
  setup(){
    lg('sys','Serial3 @ 9600 → Pololu MiniMaestro');
    lg('sys','Serial2 @ 9600 → Syren10 (128) · setTimeout(950)');
    if(CFG.FOOT_CONTROLLER===0) lg('sys','Serial1 @ 9600 → Sabertooth 2x25 (128) · setTimeout(950)');
    else lg('sys','leftFootSignal→pin 44, rightFootSignal→pin 45 (ESC R/C mode), stopFeet()');
    lg('sys','player.begin() · DY-SV5W on Serial0');
    player.setVolume(CFG.vol);
    lg('sys','EXTINGUISHERPIN 3 → HIGH · Usb.Init()');
    lg('sys','— press START to arm the feet —');
  },
  loop(){ maestroLoopBody(this); }
};

/* ─────────────── C · Maestro DY5 BETA (2022, Sabertooth only) ─────────────── */
const PROFILE_MAESTRO_BETA = {
  id:'maestro22',
  name:'Maestro · DY5 audioplayer BETA',
  short:'Maestro 2022',
  file:'Padawan360_body_mega_maestro_DY5_audioplayer_BETA.ino',
  repo:'Imperiallandm/Padawan360_mega_maestro_DYSV5W',
  audio:'DY-SV5W',
  swapsStickButtons:false,
  disarmOnLoss:false,
  rampDeadzoneDelay:false,
  hasServos:false, hasMaestro:true,
  footPWM:()=>false,
  blurb:'Mega 2560 · MiniMaestro on SoftwareSerial(10,11) · DY-SV5W on Serial0 · Sabertooth 2x25 + Syren10',
  defaults:{
    FOOT_CONTROLLER:0,
    DRIVESPEED1:60, DRIVESPEED2:100, DRIVESPEED3:127,
    TURNSPEED:50, DOMESPEED:80, RAMPING:5,
    DOMEDEADZONERANGE:20, DRIVEDEADZONERANGE:20,
    RampingDeadzoneDelay:0, CalibrationSpeed:127,
    leftDirection:1, rightDirection:1,
    vol:25, turnDirection0:20,
    maestroScript:['doors_open','doors_close','pies_open','pies_close','utils_out','utils_in','dome_open','dome_close'],
    maestroSource:'builtin',
    loopHz:250, maestroRate:2.2, maxSpeed:2.4, maxYaw:2.4, domeRate:3.6
  },
  cfg:{
    speed:[['DRIVESPEED1','Drive speed 1'],['DRIVESPEED2','Drive speed 2'],['DRIVESPEED3','Drive speed 3'],
           ['TURNSPEED','Turn speed'],['DOMESPEED','Dome speed'],['RAMPING','Ramping'],
           ['DRIVEDEADZONERANGE','Drive deadzone'],['DOMEDEADZONERANGE','Dome deadzone'],['vol','Volume 0-30']],
    sim:MAESTRO_CFG_COMMON.sim
  },
  notes:[
    {k:'warn', h:'<b>The feet stay armed through a dropout.</b> The controller-lost block zeroes the motors but never clears <b>isDriveEnabled</b>. The moment the pad re-syncs the droid is live again with no START press — the 2025 sketch and mod2026 both fix this.'},
    {k:'warn', h:'<b>delay(750) inside automation</b> — same blocking dome turn as the 2025 sketch.'},
    {k:'warn', h:'<b>Serial.println() collides with the DY-SV5W</b> on Serial0, same as the 2025 sketch.'},
    {k:'info', h:'<b>Volume is inverted</b> (▲ = <b>vol--</b>), and <b>bare X plays random(32,52)</b> instead of the whistle bank — both inherited by the 2025 sketch.'},
    {k:'info', h:'<b>Motor packets go out every pass here.</b> Unlike mod2026 there is no change-guard, so the Sabertooth\'s 950 ms watchdog never starves.'},
    {k:'info', h:'<b>Driving does not cancel automation</b> in this version — that check only arrived in the 2025 sketch.'}
  ],
  map:MAESTRO_MAP,
  setup(){
    lg('sys','SoftwareSerial(10,11) @ 9600 → Pololu MiniMaestro');
    lg('sys','Serial1 @ 9600 → Sabertooth 2x25 (128) · setTimeout(950)');
    lg('sys','Serial2 @ 9600 → Syren10 (128) · setTimeout(950)');
    lg('sys','player.begin() · DY-SV5W on Serial0');
    player.setVolume(CFG.vol);
    lg('sys','EXTINGUISHERPIN 3 → HIGH · Usb.Init()');
    lg('sys','— press START to arm the feet —');
  },
  loop(){ maestroLoopBody(this); }
};
