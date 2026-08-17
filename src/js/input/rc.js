'use strict';
/* =====================================================================
   RC TRANSMITTER — a USB radio set as an input device

   Mike, 2026-08-14: "I have a RC controller that connects via USB and
   appears as a game controller - so we just need to calibrate it and
   assign channels."

   A transmitter in simulator/trainer mode enumerates through the same
   Gamepad API as an Xbox pad, and that is where the resemblance stops:

     · four to sixteen axes, no agreed order, and no buttons at all on
       many sets — the two- and three-position switches come back as
       axes that rest at -1, 0 or +1;
     · sticks that do not return to 0.000. A gimbal at rest reads
       0.02-0.08 and stays there, so the Xbox path's fixed 0.04 deadzone
       is either a permanent creep or eats a third of the throw;
     · a throttle stick that rests at the BOTTOM of its travel, not the
       middle, so "centre" is not a single idea (see `ctr` below);
     · endpoints that depend on the transmitter's own travel adjust, so
       full deflection might be 0.71 on one channel and 1.00 on the next.

   Hence: pick the device, learn its real endpoints, then say what each
   channel does. Nothing is guessed from the device id — RC dongles all
   report as some variant of "USB Joystick", and no map can be inferred
   from that.

   TWO DESTINATIONS, and the difference matters (Mike chose both,
   switchable, 2026-08-14):

     · `mode:'pad'` — the DEFAULT. A channel feeds the XBOXRECV stub, so
       the running sketch sees a stick move and everything downstream —
       the firmware, its sequences, its sounds, the HUD — behaves exactly
       as if a pad were plugged in. This is what you want almost always:
       the sim is here to exercise the FIRMWARE, and this route keeps the
       firmware in the loop.

     · `mode:'out'` — advanced, off by default. A channel is written
       straight to a motor or a servo AFTER the sketch has run, which
       means it overrides whatever the sketch decided. That is how an
       RC-only droid actually behaves, and it is genuinely useful for
       bench-testing a surface. It also takes the firmware out of the
       loop, so the UI says so in as many words and the mode is behind
       an Advanced switch.

   HONESTY. The build's RC answer is `sim:'sub'`, not `'full'`. The
   simulator now reads your transmitter, but none of the three sketches
   has an RC input layer — they read an Xbox receiver. In pad mode the
   channels STAND IN for that receiver. Promoting the answer to 'full'
   needs firmware that speaks PPM/SBUS, which does not exist yet
   (HANDOVER §3, "never silently promote a park").

   Load order: this module is parsed BEFORE look/prefs.js, so nothing
   here may touch PREFS at the top level — `rcPrefsRestore()` is called
   from main.js once prefsLoad() has run.
   ===================================================================== */

const RC = {
  padId:'',            // Gamepad.id of the chosen transmitter ('' = none)
  chans:[],            // one record per axis, then per button
  raw:[], norm:[],     // live values, parallel to chans, refreshed each frame
  live:false,          // is the chosen device actually present right now?
  hot:-1,              // channel moving most this frame — the UI highlights it
  advanced:false,      // has the direct-to-output mode been unlocked?
  cal:{on:false, since:0}
};

/* What a channel can be pointed at in pad mode. The four hats first,
   because they are what a transmitter's gimbals obviously are. */
const RC_PAD_AXES = [
  {id:'LX', label:'Left stick X — turn'},
  {id:'LY', label:'Left stick Y — drive'},
  {id:'RX', label:'Right stick X — dome'},
  {id:'RY', label:'Right stick Y'}
];
const RC_AXIS_IDS = RC_PAD_AXES.map(a=>a.id);
/* the triggers take a proportional 0-255, everything else is a press */
const RC_ANALOG_BTNS = ['L2','R2'];

/* Direct outputs. The three motors are named for what they do rather
   than for the board that drives them, because which board that is
   depends on the build's foot-drive answer. */
const RC_OUT_MOTORS = [
  {id:'drive', label:'Feet — forward / back'},
  {id:'turn',  label:'Feet — turn'},
  {id:'dome',  label:'Dome rotation'}
];

/* --------------------------------------------------------- discovery */
function rcPads(){
  const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
  const out = [];
  for(const p of pads) if(p && p.connected) out.push(p);
  return out;
}
function rcGamepad(){
  if(!RC.padId) return null;
  const pads = rcPads();
  for(const p of pads) if(p.id === RC.padId) return p;
  return null;
}
/* Does the RC layer own this gamepad? pollInput() asks before it applies
   the Xbox button map — a transmitter run through that map is nonsense
   (axis 4 becomes a trigger, a switch becomes a stuck A button), and on a
   bench where the transmitter is the ONLY device it would be the pad the
   scan picks. */
function rcOwns(gp){ return !!(gp && RC.padId && gp.id === RC.padId); }

/* Is the RC layer allowed to drive anything? Choosing a device is not
   enough — the build has to say RC is what this droid is flown with, so
   an experiment in the wizard cannot leave a transmitter quietly wired to
   the feet of an Xbox build. */
function rcEnabled(){
  if(!RC.padId) return false;
  if(typeof buildGet === 'function' && buildGet().controller !== 'rc') return false;
  return true;
}

function rcSelect(id){
  if(RC.padId === id) return;
  RC.padId = id || '';
  RC.chans = []; RC.raw = []; RC.norm = [];
  RC.cal.on = false;
  if(id && typeof lg === 'function') lg('sys','RC: using "'+id+'"');
  rcPrefsSave();
}

/* ------------------------------------------------------------ channels */
function rcNewChan(src, i){
  return {
    src:src, i:i,
    min: src === 'axis' ? -1 : 0,
    max: 1,
    mid: 0,               // rest position, captured when calibration stops
    ctr: 'rest',          // 'rest' = self-centring gimbal · 'span' = throttle
    rev: false,
    dz: 0.06,
    moved: false,         // did it actually move during calibration?
    mode: 'off',          // 'off' | 'pad' | 'out'
    pad: '',              // pad target when mode==='pad'
    out: '',              // output target when mode==='out'
    thr: 0.5              // switch threshold, for a channel driving a button
  };
}
function rcChannelsFor(gp){
  const out = [];
  for(let i=0;i<gp.axes.length;i++)     out.push(rcNewChan('axis', i));
  for(let i=0;i<gp.buttons.length;i++)  out.push(rcNewChan('button', i));
  return out;
}
/* A saved channel list belongs to the pad it was made for. Swap the
   transmitter for one with a different axis count and the stored records
   point at axes that no longer exist — rebuild rather than read undefined. */
function rcChansStale(gp){
  const ax = RC.chans.filter(c=>c.src==='axis').length;
  const bt = RC.chans.filter(c=>c.src==='button').length;
  return ax !== gp.axes.length || bt !== gp.buttons.length;
}
function rcChanName(ch){
  if(ch.src === 'axis')  return 'Ch ' + (ch.i + 1);
  return 'Sw ' + (ch.i + 1);
}

/* ---------------------------------------------------------- maths
   Raw axis → -1..1, using the endpoints and the rest point this
   transmitter actually has. Split about the centre on purpose: a gimbal
   whose travel is +0.98 / -0.71 should still read full deflection in
   both directions, and averaging the two ends would clip one of them. */
function rcMid(ch){
  if(ch.ctr === 'span') return (ch.min + ch.max) / 2;
  return clamp(ch.mid, ch.min, ch.max);
}
function rcNorm(ch, raw){
  const lo = ch.min, hi = ch.max, mid = rcMid(ch);
  let v = 0;
  if(raw >= mid) v = (hi - mid) > 1e-4 ? (raw - mid) / (hi - mid) : 0;
  else           v = (mid - lo) > 1e-4 ? (raw - mid) / (mid - lo) : 0;
  v = clamp(v, -1, 1);
  const dz = ch.dz || 0;
  /* rescale outside the deadband rather than subtracting it, so a
     calibrated stick still reaches 1.000 at the stop */
  if(Math.abs(v) <= dz) v = 0;
  else v = (v > 0 ? (v - dz) : (v + dz)) / (1 - dz);
  return ch.rev ? -v : v;
}

/* ------------------------------------------------------- calibration */
function rcCalStart(){
  const gp = rcGamepad();
  if(!gp) return false;
  if(!RC.chans.length || rcChansStale(gp)) RC.chans = rcChannelsFor(gp);
  RC.chans.forEach((ch,idx)=>{
    const raw = rcRawOf(gp, ch);
    ch.min = raw; ch.max = raw; ch.moved = false;
    RC.raw[idx] = raw;
  });
  RC.cal.on = true;
  RC.cal.since = (typeof SIM !== 'undefined') ? SIM.millis : 0;
  if(typeof lg === 'function') lg('sys','RC: calibrating — move every stick and switch to both stops');
  return true;
}
function rcCalStop(){
  if(!RC.cal.on) return false;
  RC.cal.on = false;
  RC.chans.forEach((ch,idx)=>{
    /* rest position is wherever it is NOW — the instruction is "let go,
       then press Done", and a throttle resting at its stop is exactly the
       case `ctr:'span'` exists for */
    const raw = (RC.raw[idx] === undefined) ? 0 : RC.raw[idx];
    ch.mid = clamp(raw, ch.min, ch.max);
    ch.moved = (ch.max - ch.min) > 0.25;
    /* a stick that rests within a whisker of one end is a throttle, not a
       self-centring gimbal — say so rather than making the user notice */
    if(ch.moved && ch.src === 'axis'){
      const span = ch.max - ch.min;
      const off  = Math.min(ch.mid - ch.min, ch.max - ch.mid) / span;
      ch.ctr = (off < 0.15) ? 'span' : 'rest';
    }
  });
  const n = RC.chans.filter(c=>c.moved).length;
  if(typeof lg === 'function') lg('sys','RC: calibrated — '+n+' channel'+(n===1?'':'s')+' moved');
  rcPrefsSave();
  return true;
}
function rcCalMovedCount(){ return RC.chans.filter(c=>c.moved).length; }

/* Mode 2 is what almost every set is set up as, and the mapping below is
   the one a droid wants out of it: throttle drives, rudder turns, aileron
   spins the dome. Only channels that were seen to move are assigned —
   binding a dead axis to the feet is how a droid runs away on the bench. */
const RC_MODE2 = ['RX','RY','LY','LX'];
function rcAutoAssign(){
  const ax = RC.chans.filter(c=>c.src === 'axis');
  let n = 0;
  ax.forEach((ch,i)=>{
    if(i >= RC_MODE2.length) return;
    if(!ch.moved) return;
    ch.mode = 'pad'; ch.pad = RC_MODE2[i];
    /* THE THROTTLE TRAP. Channel 3 on a Mode 2 set rests at the BOTTOM of
       its travel, and the calibration correctly calls that a full-span
       axis — top to bottom is -1 to +1. Wire that straight to the feet and
       the droid drives away at full reverse the moment you stop touching
       it, which is precisely the bench accident this whole panel exists to
       avoid. So anything auto-assigned to a stick is forced back to
       rest-is-zero: throttle up drives forward, throttle down does
       nothing, hands off stops.

       This is only the AUTOMATIC assignment. The per-channel Full span
       button is still there for a gimbal with the ratchet taken out, where
       bidirectional really is what you want. */
    if(rcRestValue(ch) !== 0) ch.ctr = 'rest';
    n++;
  });
  rcPrefsSave();
  return n;
}
/* what this channel reads with nothing touched — 0 for a sane assignment */
function rcRestValue(ch){ return rcNorm(ch, clamp(ch.mid, ch.min, ch.max)); }
/* channels that would command something with your hands off the set */
function rcRestWarnings(){
  const out = [];
  RC.chans.forEach((ch,idx)=>{
    if(ch.mode === 'off' || (!ch.pad && !ch.out)) return;
    const v = rcRestValue(ch);
    if(Math.abs(v) > 0.08) out.push({idx:idx, ch:ch, rest:v});
  });
  return out;
}
function rcClearAssign(){
  RC.chans.forEach(ch=>{ ch.mode = 'off'; ch.pad = ''; ch.out = ''; });
  rcPrefsSave();
}

/* ------------------------------------------------------------ reading */
function rcRawOf(gp, ch){
  if(ch.src === 'axis') return (gp.axes[ch.i] === undefined) ? 0 : gp.axes[ch.i];
  const b = gp.buttons[ch.i];
  return b ? (b.value || (b.pressed ? 1 : 0)) : 0;
}
/* Called every frame from pollInput(), whether or not RC is enabled — the
   calibration panel needs live bars while the answer is still being made. */
function rcRead(){
  const gp = rcGamepad();
  RC.live = !!gp;
  if(!gp){ RC.hot = -1; return false; }
  if(!RC.chans.length || rcChansStale(gp)) RC.chans = rcChannelsFor(gp);
  let hot = -1, hotv = 0.15;
  RC.chans.forEach((ch,idx)=>{
    const raw = rcRawOf(gp, ch);
    RC.raw[idx] = raw;
    if(RC.cal.on){
      if(raw < ch.min) ch.min = raw;
      if(raw > ch.max) ch.max = raw;
    }
    const v = rcNorm(ch, raw);
    RC.norm[idx] = v;
    if(Math.abs(v) > hotv){ hotv = Math.abs(v); hot = idx; }
  });
  RC.hot = hot;
  return true;
}

/* What the pad-mode channels want the merged input state to be. Returns
   null when RC is not driving, so pollInput() can skip the merge entirely.
   Only ASSIGNED targets appear — an unassigned channel must not push a
   stick to zero and fight the keyboard. */
function rcContribute(){
  if(!rcEnabled() || !RC.live) return null;
  const ax = {}, btn = {};
  RC.chans.forEach((ch,idx)=>{
    if(ch.mode !== 'pad' || !ch.pad) return;
    const v = RC.norm[idx] || 0;
    if(RC_AXIS_IDS.indexOf(ch.pad) >= 0){ ax[ch.pad] = v; return; }
    if(RC_ANALOG_BTNS.indexOf(ch.pad) >= 0){
      btn[ch.pad] = Math.round(clamp((v + 1) / 2, 0, 1) * 255);
      return;
    }
    const thr = (ch.thr === undefined) ? 0.5 : ch.thr;
    btn[ch.pad] = (v >= thr) ? 1 : 0;
  });
  return {ax:ax, btn:btn};
}

/* ------------------------------------------- direct-to-output (advanced)
   Runs from the frame loop AFTER the sketch's loop() and BEFORE the motor
   watchdog, so a bound channel overrides what the firmware just commanded
   and keeps the Sabertooth packet clock alive while it holds a value. */
function rcDirectApply(){
  if(!rcEnabled() || !RC.live) return false;
  let drive = null, turn = null, dome = null, did = false;
  RC.chans.forEach((ch,idx)=>{
    if(ch.mode !== 'out' || !ch.out) return;
    const v = RC.norm[idx] || 0;
    if(ch.out === 'drive')      { drive = v; did = true; }
    else if(ch.out === 'turn')  { turn  = v; did = true; }
    else if(ch.out === 'dome')  { dome  = v; did = true; }
    else if(ch.out.indexOf('act:') === 0 && typeof actSet === 'function'){
      actSet(ch.out.slice(4), clamp((v + 1) / 2, 0, 1));
      did = true;
    }
  });
  if(drive !== null || turn !== null){
    const d = drive || 0, t = turn || 0;
    /* which pair of numbers that is depends on the foot-drive answer,
       exactly as it does for the sketch: a Sabertooth takes signed
       drive/turn, hub ESCs take two servo-unit throttles */
    if(typeof buildFootPWM === 'function' && buildFootPWM()){
      MOT.leftFoot  = Math.round(clamp(90 + (d + t) * 45, 0, 180));
      MOT.rightFoot = Math.round(clamp(90 + (d - t) * 45, 0, 180));
      MOT.footAt = SIM.millis;
    }else{
      MOT.drive = Math.round(clamp(d, -1, 1) * 127);
      MOT.turn  = Math.round(clamp(t, -1, 1) * 127);
      MOT.driveAt = SIM.millis;
    }
  }
  if(dome !== null){
    MOT.dome = Math.round(clamp(dome, -1, 1) * 127);
    MOT.domeAt = SIM.millis;
  }
  return did;
}

/* Everything a channel can be pointed at, for the assignment picker. */
function rcPadOptions(){
  const out = [{id:'', label:'— not assigned —'}];
  RC_PAD_AXES.forEach(a=>out.push({id:a.id, label:a.label}));
  out.push({id:'L2', label:'Left trigger (proportional)'});
  out.push({id:'R2', label:'Right trigger (proportional)'});
  (typeof BTN_NAMES !== 'undefined' ? BTN_NAMES : []).forEach(n=>{
    if(RC_ANALOG_BTNS.indexOf(n) >= 0) return;
    out.push({id:n, label:'Button ' + n});
  });
  return out;
}
function rcOutOptions(){
  const out = [{id:'', label:'— not assigned —'}];
  RC_OUT_MOTORS.forEach(m=>out.push({id:m.id, label:m.label}));
  /* the same names the Maestro channel table and the wiring sheet use —
     "pie0" means nothing at the bench, "Dome pie 1" does */
  const list = (typeof PART_LIST !== 'undefined') ? PART_LIST : [];
  list.forEach(row=>{
    const label = row[0], key = row[1];
    if(!key) return;
    out.push({id:'act:'+key, label:'Servo — ' + label});
  });
  return out;
}

/* ---------------------------------------------------------- persistence */
function rcPrefsSave(){
  if(typeof PREFS === 'undefined') return;
  PREFS.rc = {padId:RC.padId, advanced:RC.advanced, chans:RC.chans};
  if(typeof prefsSave === 'function') prefsSave();
}
function rcPrefsRestore(){
  if(typeof PREFS === 'undefined' || !PREFS.rc) return;
  const p = PREFS.rc;
  RC.padId = p.padId || '';
  RC.advanced = !!p.advanced;
  RC.chans = Array.isArray(p.chans) ? p.chans.map(c=>Object.assign(rcNewChan(c.src||'axis', c.i|0), c)) : [];
  RC.raw = []; RC.norm = [];
}

/* A one-line description of the state, for the wizard rail and the log. */
function rcSummary(){
  if(!RC.padId) return 'no transmitter chosen';
  const n = RC.chans.filter(c=>c.mode !== 'off' && (c.pad || c.out)).length;
  if(!RC.live) return RC.padId + ' — not connected';
  if(!n) return RC.padId + ' — nothing assigned yet';
  return n + ' channel' + (n===1?'':'s') + ' assigned';
}
