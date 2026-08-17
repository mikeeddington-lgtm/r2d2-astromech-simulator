'use strict';
/* =====================================================================
   INPUT — real Xbox pad (Gamepad API) + on-screen pad + keyboard
   All three are merged into one XBOXRECV-shaped state each frame.
   ===================================================================== */
const INPUT = {
  gpIndex:null, gpName:'',
  forceDisconnect:false,
  virtual:{ btn:{}, LX:0, LY:0, RX:0, RY:0 },   // on-screen pad
  keys:{},
  prev:{},
  rawDeadzone:0.04
};
BTN_NAMES.forEach(n=>{ INPUT.virtual.btn[n]=0; INPUT.prev[n]=0; });

/* ------------------------------------------------------ gamepad discovery */
window.addEventListener('gamepadconnected', e=>{
  INPUT.gpIndex = e.gamepad.index;
  INPUT.gpName  = e.gamepad.id;
  INPUT.forceDisconnect = false;
  lg('sys',`XBOXRECV: controller 0 connected — ${e.gamepad.id}`);
});
window.addEventListener('gamepaddisconnected', e=>{
  if(INPUT.gpIndex===e.gamepad.index){ INPUT.gpIndex=null; INPUT.gpName=''; lg('warn','XBOXRECV: controller 0 lost'); }
});

/* ------------------------------------------------------------- keyboard */
const KEYMAP = {
  'KeyQ':'L1','KeyE':'R1','KeyZ':'L2','KeyC':'R2',
  'Space':'A','KeyB':'B','KeyV':'X','KeyY':'Y',
  'Enter':'START','KeyN':'BACK','KeyG':'XBOX',
  'KeyR':'L3','KeyF':'R3',
  'ArrowUp':'UP','ArrowDown':'DOWN','ArrowLeft':'LEFT','ArrowRight':'RIGHT'
};
const AXISKEYS = {'KeyW':1,'KeyS':1,'KeyA':1,'KeyD':1,'KeyI':1,'KeyK':1,'KeyJ':1,'KeyL':1};
window.addEventListener('keydown', e=>{
  // arrows inside a <select> must move the selection, and Enter on a focused
  // button must click it — not arm the feet. Widened past the plain tagName
  // check (v1.39.6): a <label>, an <a>, a contenteditable, or a custom div
  // control with its own tabIndex and keydown handler (the startup wizard's
  // option cards, for one) never matched INPUT|TEXTAREA|SELECT|BUTTON, so a
  // Space or a letter typed at one of those still fell through to the pad
  // map — closest() catches the control at or above the actual target.
  if(e.target && e.target.closest && e.target.closest('input,textarea,select,button,label,a,[contenteditable]')) return;
  // A full-page overlay (setup/build wizard, servo-hardware bench, import
  // wizard, hardware overlay) owns the keyboard while it is open. Its own
  // controls are covered by the guard above, but typing a channel NAME,
  // ticking a "use"/"boot" box or picking a mapping <select> is still a
  // keydown on `window`, and the sketch keeps looping underneath — without
  // this, "b"/"v"/"y" typed into a name field, or Space on a focused
  // checkbox, drove the pad and mp3.playTrack() fired from inside setup
  // (Mike, 2026-08-14: "selecting certain boxes it makes noises … stop
  // that"). See core/util.js uiModalOpen().
  if(typeof uiModalOpen === 'function' && uiModalOpen()) return;
  if(KEYMAP[e.code]||AXISKEYS[e.code]){ INPUT.keys[e.code]=1; e.preventDefault(); }
});
window.addEventListener('keyup', e=>{
  // NOT guarded by the target/overlay checks above: a key that went DOWN
  // while focus was elsewhere and the overlay closed (or a key that went
  // down just as the overlay opened) must still be able to clear itself,
  // or a button sticks pressed until the user happens to tap that key
  // again with the pad map active.
  if(KEYMAP[e.code]||AXISKEYS[e.code]){ INPUT.keys[e.code]=0; e.preventDefault(); }
});
window.addEventListener('blur', ()=>{ INPUT.keys={}; });
