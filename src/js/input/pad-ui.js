'use strict';
/* --------------------------------------------------------- on-screen pad */
const svg = document.getElementById('padsvg');
function bindPadButton(id, name){
  const g = document.getElementById('g_'+id);
  if(!g) return;
  g.addEventListener('pointerdown', e=>{
    INPUT.virtual.btn[name] = (name==='L2'||name==='R2')?255:1;
    e.preventDefault();
    const pid = e.pointerId;           // two-finger chords: only THIS finger releases
    const up = ev=>{
      if(ev.pointerId!==undefined && ev.pointerId!==pid) return;
      INPUT.virtual.btn[name]=0;
      window.removeEventListener('pointerup',up);
      window.removeEventListener('pointercancel',up);
    };
    window.addEventListener('pointerup',up);
    window.addEventListener('pointercancel',up);
  });
}
['UP','DOWN','LEFT','RIGHT','A','B','X','Y','LB','RB','LT','RT','START','BACK','XBOX'].forEach(id=>{
  const name = id==='LB'?'L1' : id==='RB'?'R1' : id==='LT'?'L2' : id==='RT'?'R2' : id;
  bindPadButton(id, name);
});

/* CHANGE 2 (2026-08-15, UX item 1.5a) — the DRIVE chip becomes a button
   (hud.js binds the click). It must go through the SAME INPUT.virtual.btn
   path bindPadButton() above drives for every on-screen button, never poke
   FW.isDriveEnabled directly: the sketch's own START handler is what flips
   the LEDs, plays the arm/disarm track and logs the Serial line, and it
   only runs off a real button EDGE (getButtonClick(), core/xbox.js). A
   click has no press-then-release duration of its own, so the two are
   collapsed into one call: pollInput() latches the rising edge into
   XB.click on the first call, then the second lets the press fall — the
   same shape a real tap of the on-screen button produces across two
   animation frames. */
function virtualPress(name){
  INPUT.virtual.btn[name] = (name==='L2'||name==='R2') ? 255 : 1;
  pollInput();
  INPUT.virtual.btn[name] = 0;
  pollInput();
}

function bindStick(id, ax, ay, cx, cy){
  const el = document.getElementById(id);
  const MAXR = 27;
  let dragging=false, moved=false;
  const pt = svg.createSVGPoint();
  const toSvg = e=>{ pt.x=e.clientX; pt.y=e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  el.addEventListener('pointerdown', e=>{
    dragging=true; moved=false; el.classList.add('drag');
    el.setPointerCapture(e.pointerId); e.preventDefault();
  });
  el.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const p = toSvg(e);
    let dx=p.x-cx, dy=p.y-cy;
    const d=Math.hypot(dx,dy);
    if(d>MAXR){ dx=dx/d*MAXR; dy=dy/d*MAXR; }
    if(d>2) moved=true;
    INPUT.virtual[ax] =  dx/MAXR;
    INPUT.virtual[ay] = -dy/MAXR;   // svg y is down; XBOXRECV hat Y is up-positive
  });
  const rel = e=>{
    if(!dragging) return;
    dragging=false; el.classList.remove('drag');
    INPUT.virtual[ax]=0; INPUT.virtual[ay]=0;
    // a click (no drag) presses the stick = L3 / R3
    if(!moved){
      const n = id==='s_L'?'L3':'R3';
      INPUT.virtual.btn[n]=1;
      setTimeout(()=>{INPUT.virtual.btn[n]=0;},60);
    }
  };
  el.addEventListener('pointerup', rel);
  el.addEventListener('pointercancel', rel);
}
bindStick('s_L','LX','LY',158,146);
bindStick('s_R','RX','RY',406,204);

/* ------------------------------------------------------------- polling */
function dz(v){ return Math.abs(v)<INPUT.rawDeadzone ? 0 : v; }

/* CHANGE 1 — THE HINT (2026-08-15, UX item 1.5a). The feet boot DISARMED
   (correct — both firmware families do it), but pushing a drive input
   while disarmed does NOTHING VISIBLE: the only explanations live in a
   console line (each profile's setup(), e.g. profiles/mod2026.js) and
   lesson 1 (app/tutor.js's 'arm' entry, Learn tab). Neither is where a new
   user is looking.

   Seam: driveHintCheck() is called from inside pollInput() below, right
   after LX/LY have been merged from keyboard + on-screen pad + a real
   gamepad — the three sources the review calls out by name — and BEFORE
   the RC transmitter or the Polar Mouse (mouseTakeSticks) get a say. That
   merge point is the ONE place all three sources converge on a single
   number, so one check here covers every source with no per-source
   duplication anywhere else. RC and the mouse are deliberately excluded:
   RC has its own calibration UI and its own "why is nothing happening"
   story, and while the mouse holds the sticks the feet are not what is
   being driven.

   Workshop only — kiosk has its own guards, and this hint (the header
   chip it sits beside) is hidden there anyway (10-kiosk.css) — and never
   over a modal overlay (uiModalOpen(), core/util.js: the startup/build
   wizard, the servo-hardware bench, the import wizard, the "Build your
   Maestro" wizard, the servo hardware overlay all cover the whole
   viewport, so this is redundant with them physically blocking the
   pad/HUD but cheap insurance against a future non-full-bleed overlay).

   Rate-limited: shown once, then not again until the feet arm or 30s
   pass — whichever comes first. Reuses the existing toast (core/toast.js)
   rather than a new widget: its own ~3.5s life is close enough to the
   ~4s the spec asks for, and arming dismisses it early through the same
   toastDrop() a click on the plate itself uses. */
const DRIVEHINT = { shownAt:-Infinity, plate:null };
function driveHintCheck(lx, ly){
  if(FW.isDriveEnabled){
    if(DRIVEHINT.plate && typeof toastDrop==='function') toastDrop(DRIVEHINT.plate);
    DRIVEHINT.plate = null;
    DRIVEHINT.shownAt = -Infinity;           // armed — the next disarm starts its own fresh window
    return;
  }
  if(INPUT.forceDisconnect) return;          // a different "why is nothing happening" — not this hint's job
  if(Math.abs(lx)<=INPUT.rawDeadzone && Math.abs(ly)<=INPUT.rawDeadzone) return;
  if(typeof kioskOn==='function' && kioskOn()) return;
  if(typeof uiModalOpen==='function' && uiModalOpen()) return;
  const now = SIM.millis;
  if(DRIVEHINT.shownAt!==-Infinity && now-DRIVEHINT.shownAt<30000) return;
  DRIVEHINT.shownAt = now;
  if(typeof toast==='function') DRIVEHINT.plate = toast('Feet are disarmed — press START (Enter) to arm.', 'warn');
}

function pollInput(){
  const V = INPUT.virtual, K = INPUT.keys;
  let LX=0, LY=0, RX=0, RY=0;
  const btn = {}; BTN_NAMES.forEach(n=>btn[n]=0);

  /* on-screen */
  LX=V.LX; LY=V.LY; RX=V.RX; RY=V.RY;
  BTN_NAMES.forEach(n=>{ if(V.btn[n]) btn[n]=Math.max(btn[n],V.btn[n]); });

  /* keyboard */
  if(K['KeyD']) LX=1; if(K['KeyA']) LX=-1;
  if(K['KeyW']) LY=1; if(K['KeyS']) LY=-1;
  if(K['KeyL']) RX=1; if(K['KeyJ']) RX=-1;
  if(K['KeyI']) RY=1; if(K['KeyK']) RY=-1;
  for(const code in KEYMAP){
    if(K[code]){ const n=KEYMAP[code]; btn[n]=Math.max(btn[n],(n==='L2'||n==='R2')?255:1); }
  }

  /* real pad — skipping the RC transmitter, which has its own map.
     Running a radio set through the Xbox button table produces nonsense
     (axis 4 is a trigger, a two-position switch is a stuck A button) and
     on a bench where the transmitter is the ONLY device it is exactly the
     pad this scan would pick. */
  let live=false;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp=null;
  const rcHere = (typeof rcOwns === 'function') && (typeof rcEnabled === 'function') && rcEnabled();
  for(const p of pads){ if(p && p.connected){ if(rcHere && rcOwns(p)) continue; gp=p; break; } }
  if(gp){
    live=true;
    INPUT.gpIndex=gp.index; INPUT.gpName=gp.id;
    const a=gp.axes, b=gp.buttons;
    const ax0=dz(a[0]||0), ax1=dz(a[1]||0), ax2=dz(a[2]||0), ax3=dz(a[3]||0);
    if(ax0) LX=ax0;  if(ax1) LY=-ax1;
    if(ax2) RX=ax2;  if(ax3) RY=-ax3;
    const bp=(i)=> b[i] ? (b[i].pressed?1:0) : 0;
    const bv=(i)=> b[i] ? Math.round((b[i].value||0)*255) : 0;
    const m={0:'A',1:'B',2:'X',3:'Y',4:'L1',5:'R1',8:'BACK',9:'START',10:'L3',11:'R3',12:'UP',13:'DOWN',14:'LEFT',15:'RIGHT',16:'XBOX'};
    for(const i in m) btn[m[i]] = Math.max(btn[m[i]], bp(+i));
    btn.L2 = Math.max(btn.L2, bv(6));
    btn.R2 = Math.max(btn.R2, bv(7));
    // some drivers report triggers on axes 4/5 instead
    if(a.length>5 && !b[6]){
      btn.L2 = Math.max(btn.L2, Math.round(clamp((a[4]+1)/2,0,1)*255));
      btn.R2 = Math.max(btn.R2, Math.round(clamp((a[5]+1)/2,0,1)*255));
    }
  } else if(INPUT.gpIndex!==null){ INPUT.gpIndex=null; INPUT.gpName=''; }

  /* keyboard + on-screen pad + real pad are now fully merged into LX/LY —
     see driveHintCheck() above for why this is the seam. */
  driveHintCheck(LX, LY);

  /* RC transmitter (v1.32.0). rcRead() runs whether or not RC is the
     controller answer — the calibration panel needs live bars while the
     answer is still being made — but only rcContribute() reaches the
     sketch, and only when the build says RC is what this droid is flown
     with. Assigned channels OVERWRITE rather than max-with: a calibrated
     stick is an absolute position, and maxing it against the on-screen
     pad's resting 0 would make a channel unable to command anything
     negative. Unassigned targets are absent from the object entirely, so
     an unmapped channel cannot pin a stick at zero and fight the
     keyboard. */
  if(typeof rcRead === 'function' && rcRead()){
    const rc = (typeof rcContribute === 'function') ? rcContribute() : null;
    if(rc){
      live = true;
      if(rc.ax.LX !== undefined) LX = rc.ax.LX;
      if(rc.ax.LY !== undefined) LY = rc.ax.LY;
      if(rc.ax.RX !== undefined) RX = rc.ax.RX;
      if(rc.ax.RY !== undefined) RY = rc.ax.RY;
      for(const n in rc.btn) btn[n] = Math.max(btn[n], rc.btn[n]);
    }
  }

  /* trigger noise floor */
  if(btn.L2<25) btn.L2=0;
  if(btn.R2<25) btn.R2=0;

  /* -------- push into the XBOXRECV stub -------- */
  const connected = !INPUT.forceDisconnect;
  XB.receiverConnected   = connected;
  XB.controllerConnected = connected;

  if(!connected){
    BTN_NAMES.forEach(n=>{ XB.press[n]=0; XB.click[n]=false; INPUT.prev[n]=0; });
    XB.hat.LeftHatX=XB.hat.LeftHatY=XB.hat.RightHatX=XB.hat.RightHatY=0;
    INPUT.live = live;
    return;
  }

  /* Who has the sticks. On a real bench the Polar Mouse is a separate
     receiver, so while it is the one being driven the SKETCH must see the
     sticks CENTRED — otherwise the droid drives off across the room while
     you are steering the trolley. Buttons are deliberately not gated: sounds
     and sequences are not driving. */
  if(typeof mouseTakeSticks === 'function' && mouseTakeSticks(LX, LY, RX, RY)){
    LX = 0; LY = 0; RX = 0; RY = 0;
  }

  XB.hat.LeftHatX  = Math.round(clamp(LX,-1,1)*32767);
  XB.hat.LeftHatY  = Math.round(clamp(LY,-1,1)*32767);
  XB.hat.RightHatX = Math.round(clamp(RX,-1,1)*32767);
  XB.hat.RightHatY = Math.round(clamp(RY,-1,1)*32767);

  for(const n of BTN_NAMES){
    const v = btn[n];
    const wasDown = INPUT.prev[n]>0, isDown = v>0;
    if(isDown && !wasDown) XB.click[n] = true;      // rising edge → click flag
    XB.press[n] = v;
    INPUT.prev[n] = v;
  }
  INPUT.live = live;
}

/* re-sync after an Xbox+LB+RB disconnect */
document.getElementById('chGamepad').addEventListener('click', ()=>{
  if(INPUT.forceDisconnect){
    INPUT.forceDisconnect=false;
    lg('sys','XBOXRECV: re-synced — press START to re-arm the feet');
  }
});
