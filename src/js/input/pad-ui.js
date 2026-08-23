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
   user is looking. Four cold-start walkthroughs stopped dead here; one of
   them concluded the app was broken and closed it.

   Seam: driveHintCheck() is called from inside pollInput() below, AFTER
   every source has been merged into LX/LY — keyboard, the on-screen pad, a
   real gamepad and the RC transmitter. It used to sit one block earlier,
   before the RC merge, on the reasoning that "RC has its own story"; it
   does not have one for THIS, so a radio set pushed forward on a disarmed
   droid was silent by construction. One check at the last merge point
   covers every door with no per-source duplication.

   THE THINGS THAT ARE NOT THIS (2026-08-22). Nothing is worse here than a
   confident wrong answer, so the hint names its own cause — DISARMED — and
   yields to every other reason the feet are inert:
     · no foot controller CHOSEN — Q7's `undecided` answer, added to
       config/hardware.js in this same release. That one is not merely
       skipped, it is HANDED OVER to: see driveFootUndecided() and the
       hand-off below.
     · the Polar Mouse holding the sticks — mouseIsDriving(); the feet are
       not what is being driven, so arming would change nothing.
     · puppet mode — the sketch is handed a centred pad on purpose
       (pupGated(), core/xbox.js), so the feet stay still whether or not
       they are armed.
   Plus kiosk (its own guards, and the header chip this hint sits beside is
   hidden there anyway — 10-kiosk.css) and a modal overlay (uiModalOpen(),
   core/util.js), which are physical rather than logical exclusions.

   HOW OFTEN (rewritten 2026-08-22). pollInput() runs once a frame, so a
   check with no edge in it is a toast sixty times a second. The RISING
   edge of an attempt-burst — centred to pushed — is still what fires it,
   and two pushes closer together than DRIVEHINT_BURST still read as one
   attempt, so a stick hunting around the deadzone cannot machine-gun
   plates. What is GONE is the "you already know this" half. It used to
   widen the gap to a full minute the moment the user had armed the feet
   even once, and the armed branch re-stamped that window on EVERY armed
   frame, so the minute only started counting from the disarm — arm,
   disarm, push the stick, silence. That is the case Mike reported, and his
   ruling is that the prompt belongs on every attempt made while the feet
   are disarmed. Having armed once is not evidence that you remember; it is
   usually the reason you are surprised. So this hint keeps no score of who
   has learned what, and the armed branch below drops the standing plate
   and forgets the push without starting any quiet timer.

   WHICH CLOCK. The burst window runs on WALL clock, not SIM.millis, for
   the reason core/toast.js gives at the top of that file: simulated time
   stalls behind wall time under load and stops dead while a blocking
   delay() holds the loop, so a SIM.millis window quietly stretches into
   minutes of real silence in exactly the moments the droid feels most
   broken. The plate this is rate-limiting already lives on wall clock;
   two clocks disagreeing about the same second is not worth the trouble.

   THE D-PAD IS AN ATTEMPT TOO. UP/DOWN/LEFT/RIGHT arrive as BUTTONS and
   nothing in this file merges them into LX/LY, so a D-pad push used to
   reach this check as a perfectly centred stick and say nothing at all.
   Somebody thumbing the D-pad at a droid that will not move is trying to
   drive, so the seam hands their press state in beside the sticks as a
   second kind of attempt. Only to THIS check, deliberately: merging the
   D-pad into LX/LY would change what MOVES the droid, and Mike asked about
   what PROMPTS.

   WHY "hold". A tap of ↵ can fall entirely between two pollInput() calls
   and never produce the rising edge getButtonClick('START') needs. The old
   wording said "press START (Enter)", which is both the advice that does
   not always work and the pad's name for a key the reviewer only ever saw
   labelled ↵.

   Reuses the existing toast (core/toast.js) rather than a new widget: its
   ~3.5s life is close enough to the ~4s the review asks for, and arming
   dismisses it early through the same toastDrop() a click on the plate
   itself uses. */
const DRIVEHINT_MSG   = 'Feet are disarmed — hold Enter (Start) to arm.';
const DRIVEHINT_BURST = 1500;    // ms of WALL clock — two attempts closer than this are one attempt
const DRIVEHINT = { shownAt:-Infinity, plate:null, pushing:false };

/* The wall clock the burst window is measured on — see WHICH CLOCK above.
   performance.now() where the host has it, Date.now() where it does not;
   only differences are ever taken, so the two origins never have to agree. */
function driveHintWall(){
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/* "Has this build said what drives the feet at all?" — Q7's third answer,
   added in config/hardware.js in the same release. buildFootUndecided() is
   THAT change's own predicate and it is the one asked: the id it tests for
   (`undecided`) belongs to it and is free to move, and a private copy of
   the string here would be a second opinion about somebody else's answer.
   The fallback below is for a host that loads this file without
   config/hardware.js, and reads the SHAPE of the answer instead — absent,
   parked, or explicitly flagged. It is wrong only in the safe direction:
   an answer it cannot recognise silences this hint and leaves the other
   explanation to speak. */
function driveFootUndecided(){
  if(typeof buildFootUndecided === 'function') return !!buildFootUndecided();
  if(typeof buildGet !== 'function') return false;
  const id = buildGet().bodyDrive;
  if(!id) return true;
  const o = (typeof buildOpt === 'function') ? buildOpt('bodyDrive', id) : null;
  return !o || o.undecided === true || o.sim === 'park';
}

function driveHintCheck(lx, ly, dpad){
  if(FW.isDriveEnabled){
    if(DRIVEHINT.plate && typeof toastDrop==='function') toastDrop(DRIVEHINT.plate);
    DRIVEHINT.plate = null;
    DRIVEHINT.pushing = false;               // drop the plate, forget the push, start NO quiet window
    return;
  }
  /* NOT AN ATTEMPT AT ALL, so the edge is not latched either and a stick
     still held when the overlay closes counts as a fresh attempt: the pad
     is unplugged, the Polar Mouse has the sticks (the feet are not what is
     being driven, so arming would change nothing), puppet mode is handing
     the sketch a centred pad on purpose, the kiosk has its own guards, or a
     full-bleed overlay is already covering the stage. */
  if(INPUT.forceDisconnect) return;
  if(typeof mouseIsDriving==='function' && mouseIsDriving()) return;
  if(typeof PUPPET!=='undefined' && PUPPET.on) return;
  if(typeof kioskOn==='function' && kioskOn()) return;
  if(typeof uiModalOpen==='function' && uiModalOpen()) return;

  const pushing = Math.abs(lx)>INPUT.rawDeadzone || Math.abs(ly)>INPUT.rawDeadzone || !!dpad;
  const rising  = pushing && !DRIVEHINT.pushing;
  DRIVEHINT.pushing = pushing;
  if(!rising) return;

  /* A REAL ATTEMPT, BUT NOT THIS CAUSE. With no foot controller chosen,
     arming the feet buys nothing — there is nothing on the other end of
     Serial1 to arm — so saying "hold Enter" would send a beginner down a
     dead end. That change's own gate (buildFootGate, config/hardware.js)
     only speaks on frames where the sketch is COMMANDING the feet, which
     cannot happen while they are disarmed; so rather than going quiet and
     recreating the silence this whole fix is about, hand the moment to its
     own voice. Its words, its jump back to question 7, its rate limit —
     this file says nothing here. */
  if(driveFootUndecided()){
    if(typeof buildFootUnsetSay==='function') buildFootUnsetSay();
    return;
  }

  const now = driveHintWall();
  if(now - DRIVEHINT.shownAt < DRIVEHINT_BURST) return;
  DRIVEHINT.shownAt = now;
  if(typeof toast==='function') DRIVEHINT.plate = toast(DRIVEHINT_MSG, 'warn');
  /* and TEACH it, which is the owner's ruling on this fix: the attempt is
     the moment the lesson makes sense, so it goes to the lessons that
     already exist (app/tutor.js) rather than growing a second teaching
     surface here. tutorArmTip() decides for itself whether this user is
     new enough to be shown them. */
  if(typeof tutorArmTip==='function') tutorArmTip();
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

  /* EVERY drive door has now landed in LX/LY — keyboard, on-screen pad,
     real gamepad, RC — and the D-pad's four buttons, which never merge into
     the sticks, ride along as their own attempt flag rather than being
     mixed in (that would change what drives). This is the seam; see
     driveHintCheck() above. */
  driveHintCheck(LX, LY, btn.UP || btn.DOWN || btn.LEFT || btn.RIGHT);

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
