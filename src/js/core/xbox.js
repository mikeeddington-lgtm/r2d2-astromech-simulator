'use strict';
/* ================================================================ XBOXRECV */
const XB = {
  receiverConnected:false, controllerConnected:false,
  hat:{LeftHatX:0,LeftHatY:0,RightHatX:0,RightHatY:0},
  press:{}, click:{}, ledMode:'', ledOn:0
};
const BTN_NAMES = ['UP','DOWN','LEFT','RIGHT','A','B','X','Y','L1','R1','L2','R2','L3','R3','START','BACK','XBOX'];
BTN_NAMES.forEach(n=>{XB.press[n]=0; XB.click[n]=false;});
/* While puppet mode is on, the SKETCH sees a centred, silent pad through
   these accessors — the raw XB state stays live for the puppet rig and the
   on-screen pad mirror. Clicks are still consumed so a stale press cannot
   fire the moment puppet mode ends. */
function pupGated(){ return typeof PUPPET !== 'undefined' && PUPPET.on; }
function getAnalogHat(a){ if(pupGated()) return 0; return XB.hat[a]|0; }
function getButtonPress(b){ if(pupGated()) return 0; return XB.press[b]|0; }
function getButtonClick(b){ const v=XB.click[b]; XB.click[b]=false; return pupGated() ? false : v; }
function setLedMode(m){ if(XB.ledMode!==m){XB.ledMode=m; XB.ledOn=0; lg('sys',`Xbox.setLedMode(${m})`);} }
function setLedOn(l){ if(XB.ledOn!==l){XB.ledOn=l; XB.ledMode=''; lg('sys',`Xbox.setLedOn(LED${l})`);} }
function xboxDisconnect(){ lg('warn','Xbox.disconnect(0) — controller released'); INPUT.forceDisconnect = true; }

/* ================================================================ FW GLOBALS
   Superset of the variables the three sketches declare. Each profile resets
   and uses the ones it actually has.
   ======================================================================= */
