'use strict';
const SERVO_DEFS = {
  1:[
    {ch:0, name:'Left body door',    lo:'LeftDoorClose',      hi:'LeftDoorOpen',      act:'doorL'},
    {ch:1, name:'Right body door',   lo:'RightDoorClose',     hi:'RightDoorOpen',     act:'doorR'},
    {ch:2, name:'Gripper arm',       lo:'GripperArmIn',       hi:'GripperArmOut',     act:'gripArm'},
    {ch:3, name:'Gripper claw',      lo:'GripperOpen',        hi:'GripperClose',      act:'claw'},
    {ch:4, name:'Lower utility arm', lo:'LowerUtilIn',        hi:'LowerUtilOut',      act:'utilLo'},
    {ch:5, name:'Upper utility arm', lo:'UpperUtilIn',        hi:'UpperUtilOut',      act:'utilUp'},
    {ch:6, name:'Interface arm',     lo:'InterArmIn',         hi:'InterArmOut',       act:'interArm'},
    {ch:7, name:'Interface tool',    lo:'InterIn',            hi:'InterOut',          act:'interTool'},
    {ch:8, name:'Dataport door',     lo:'dataportDoorClose',  hi:'dataportDoorOpen',  act:'dataport'},
    {ch:9, name:'Chargebay door',    lo:'chargebayDoorClose', hi:'chargebayDoorOpen', act:'chargebay'}
  ],
  2:[]
};
for(let i=0;i<11;i++) SERVO_DEFS[2].push({ch:i, name:'Dome pie '+(i+1), lo:'pieClose', hi:'pieOpen', act:'pie'+i});

const SERVO = {1:{},2:{}};
function servoInit(){
  for(const b of [1,2]) for(const d of SERVO_DEFS[b]){
    const start = (CFG[d.lo]!==undefined) ? CFG[d.lo] : 0;
    SERVO[b][d.ch] = {def:d, target:start, pulse:start, moving:false};
  }
}
function setPWM(board, ch, on, off){
  const s = SERVO[board][ch]; if(!s) return;
  if(s.target !== off) lg('pwm', `pwm${board}.setPWM(${ch}, 0, ${off})  ${s.def.name}`);
  s.target = off;
}
const pwm1 = { setPWM:(c,a,b)=>setPWM(1,c,a,b) };
const pwm2 = { setPWM:(c,a,b)=>setPWM(2,c,a,b) };
function servoTravel(board, ch){
  const s = SERVO[board][ch]; if(!s) return 0;
  const a = CFG[s.def.lo], b = CFG[s.def.hi];
  if(a===b) return 0;
  return clamp((s.pulse - a)/(b - a), 0, 1);
}

/* ====================================================== MOTOR CONTROLLERS
   Both sketches call setTimeout(950) on the Sabertooth and the Syren, so a
   controller that stops receiving packets cuts its motor after 950 ms. The
   watchdog below models that — it is fed on every call, not just on change.
   ======================================================================= */
