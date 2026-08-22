'use strict';
/* =====================================================================
   MAESTRO LINK — the Pololu serial protocol, spoken straight at a board

   v1.56.0. Until this, "connect hardware" meant one thing: a PCA9685
   behind an Arduino running PCA_Bridge, and this app's own three-byte
   frame protocol (serial-link.js). A real Pololu Maestro was the one
   board the simulator could model in detail and could not talk to — you
   set it up in Maestro Control Center, then came back here and typed the
   numbers in again.

   It can now. The Maestro's USB **Command Port** is a virtual COM port;
   Web Serial opens it exactly as it opens the bridge's, and the protocol
   is documented (Pololu 0J40 §5.e). The unit is even the same: a
   Maestro target is in QUARTER-MICROSECONDS, which is what this app has
   spoken since its first .mstr import. `serialWrite(ch, qus)` therefore
   needs no conversion at all — it needs a different envelope.

   WHAT THIS CANNOT DO, AND WHY THAT MATTERS MORE THAN WHAT IT CAN
   The serial port DRIVES; it does not CONFIGURE. Pololu's guide is
   explicit (0J40 §8): "the native USB interface provides more features
   than the serial port, such as the ability to change configuration
   parameters." A channel's stored min/max, its neutral, its home, its
   mode and the board's serial mode cannot be written from here. Control
   Center writes those, once. See mstrSettingsAdvice().

   That asymmetry is a TRAP, not an inconvenience. The board clamps a Set
   Target to its own stored limits **silently** — no error, no reply, and
   Set Target has no acknowledgement to carry one. Ask for 1000 µs on a
   channel whose stored minimum is 1136 and the servo stops at 1136: the
   dial keeps turning, the panel stops moving, and it reads exactly like
   a binding linkage or a dying servo. This is the same family as every
   other trap in this project's bench notes — the failure that looks like
   a different failure.

   So the read-back is not a nicety. `mstrWatch()` polls Get Position on
   the channel being worked on, and when the board has settled somewhere
   other than where it was asked, `mstrClampNote()` says so in µs and
   names the stored limit as the cause. That is the one thing this link
   does that Control Center does not.

   PORT OWNERSHIP lives in serial-link.js. This file never opens, closes
   or reads the port; it hands bytes to `serialRaw()` and is handed bytes
   back by `mstrRx()`. Two files, one port, one direction of dependency.
   ===================================================================== */

const MST = {
  on:false,          /* the open port is a Maestro command port          */
  proto:'compact',   /* 'compact' (no address) | 'pololu' (0xAA + device)*/
  dev:12,            /* device number, only read when proto==='pololu'   */
  chCount:24,        /* how many channels the board has                  */
  err:0,             /* the last error word read off the board           */
  errAt:0,           /* SIM-independent wall stamp of that read          */
  pos:{},            /* ch -> last position read back, quarter-µs        */
  asked:{},          /* ch -> last target we sent, quarter-µs            */
  clamp:{},          /* ch -> {asked, got} when the board refused to go  */
  rx:[],             /* unclaimed inbound bytes                          */
  waiter:null,       /* {want, resolve, timer}                           */
  busy:Promise.resolve(),
  watchCh:null, watchTimer:null, settle:0, lastPos:null,
  quiet:false        /* true once speed/accel have been zeroed           */
};

/* --------------------------------------------------------- the commands
   Compact protocol is the default and needs no address, exactly as the
   Arduino library's MiniMaestro does when it is built without a device
   number (see HANDOVER — that is why the board's SerialDeviceNumber of 12
   never had to match anything). The Pololu protocol is here for the day a
   second board shares one line. */
const MST_CMD = {
  target:0x84, speed:0x87, accel:0x89,
  getPos:0x90, moving:0x93, getErr:0xA1, goHome:0xA2, multi:0x9F
};
function mstrEnvelope(cmd, data){
  const d = data || [];
  return (MST.proto === 'pololu')
    ? [0xAA, MST.dev & 0x7F, cmd & 0x7F].concat(d)
    : [cmd].concat(d);
}
/* Pololu's 7-bit split: low seven bits, then the next seven. Used by Set
   Target, Set Speed and Set Acceleration alike. */
function mstrSplit(v){
  v = Math.max(0, Math.min(16383, v|0));
  return [v & 0x7F, (v >> 7) & 0x7F];
}
/* the inverse, for a Get Position reply — which is plain little-endian
   EIGHT-bit, not the 7-bit split. Getting these two the wrong way round
   is a bug that only shows above 1023 quarter-µs, i.e. everywhere. */
function mstrJoin(lo, hi){ return (lo & 0xFF) | ((hi & 0xFF) << 8); }

/* --------------------------------------------------------------- errors
   0J40 §4.e. Nine flags in two bytes, and READING THEM CLEARS THEM — so
   there is exactly one reader (mstrPoll) and everything else looks at
   MST.err. A second reader would race the first for the only copy. */
const MST_ERRS = [
  'serial signal error', 'serial overrun', 'serial buffer full',
  'serial CRC error', 'serial protocol error', 'serial timeout',
  'script stack error', 'script call stack error', 'script program counter error'
];
function mstrErrText(word){
  const out = [];
  for(let i=0;i<MST_ERRS.length;i++) if(word & (1<<i)) out.push(MST_ERRS[i]);
  return out;
}

/* ------------------------------------------------------ asking and hearing
   Set Target has no reply, so most traffic is one-way. The four queries
   that DO reply are serialised through MST.busy, because two overlapping
   asks would each take the other's bytes.

   Stale bytes are the subtle half. A query that timed out may still have
   its reply in flight; arriving late, it would answer the NEXT question
   with the last one's data — a position for an error word, off by a whole
   channel. So every ask drops whatever is unclaimed before it writes. */
function mstrRx(bytes){
  if(!MST.waiter && !MST.on) return false;   /* nobody is listening */
  for(let i=0;i<bytes.length;i++) MST.rx.push(bytes[i]);
  const w = MST.waiter;
  if(w && MST.rx.length >= w.want){
    const got = MST.rx.splice(0, w.want);
    MST.waiter = null;
    clearTimeout(w.timer);
    w.resolve(got);
  }
  return true;
}
function mstrAsk(tx, want, ms){
  const run = ()=> new Promise(resolve=>{
    MST.rx.length = 0;                        /* drop anything unclaimed */
    if(MST.waiter){ MST.waiter.resolve(null); clearTimeout(MST.waiter.timer); }
    MST.waiter = {want, resolve, timer:setTimeout(()=>{
      if(MST.waiter && MST.waiter.resolve === resolve){ MST.waiter = null; resolve(null); }
    }, ms || 400)};
    if(typeof serialRaw === 'function') serialRaw(tx);
    else { clearTimeout(MST.waiter.timer); MST.waiter = null; resolve(null); }
  });
  MST.busy = MST.busy.then(run, run);
  return MST.busy;
}
function mstrTell(tx){ if(typeof serialRaw === 'function') serialRaw(tx); }

/* ------------------------------------------------------------- the verbs */
function mstrSetTarget(ch, qus){
  MST.asked[ch] = qus|0;
  mstrTell(mstrEnvelope(MST_CMD.target, [ch & 0x7F].concat(mstrSplit(qus))));
}
function mstrSetSpeed(ch, v){ mstrTell(mstrEnvelope(MST_CMD.speed, [ch & 0x7F].concat(mstrSplit(v)))); }
function mstrSetAccel(ch, v){ mstrTell(mstrEnvelope(MST_CMD.accel, [ch & 0x7F].concat(mstrSplit(v)))); }
function mstrGoHome(){ mstrTell(mstrEnvelope(MST_CMD.goHome, [])); }
async function mstrGetPos(ch){
  const r = await mstrAsk(mstrEnvelope(MST_CMD.getPos, [ch & 0x7F]), 2, 400);
  return r ? mstrJoin(r[0], r[1]) : null;
}
async function mstrGetErrors(){
  const r = await mstrAsk(mstrEnvelope(MST_CMD.getErr, []), 2, 400);
  return r ? mstrJoin(r[0], r[1]) : null;
}

/* ------------------------------------------------------------- the probe
   Get Errors is the right question to open with: it is the only query
   that needs no channel, it moves nothing, and a board that answers two
   bytes to it is a Maestro. A board that answers nothing is not.

   WHY THIS IS NOT TRIED FIRST ON EVERY CONNECT. 0xA1 has its high bit
   set, and to PCA_Bridge a byte with the high bit set is a FRAME HEADER —
   it would read channel 0x21 and then swallow the next two bytes as a
   position. Probing a bridge for a Maestro would move a servo. So
   serial-link.js only comes here when it already knows, or when the text
   identify has drawn a blank and the user has said which board it is. */
async function mstrProbe(){
  const w = await mstrGetErrors();
  if(w === null) return false;
  MST.err = w; MST.errAt = Date.now();
  return true;
}

/* --------------------------------------------------- how many channels
   The build knows, when the build is a Maestro build. When it is not —
   somebody has plugged a Maestro into a PCA9685 build — 24 is the widest
   Maestro there is, so nothing addressable gets refused for being past a
   ceiling we guessed too low. */
function mstrChCount(){
  if(typeof boardById !== 'function' || typeof MSTR === 'undefined') return 24;
  if(typeof boardIsPca === 'function' && boardIsPca(MSTR.board)) return 24;
  const b = boardById(MSTR.board);
  return (b && b.ch) || 24;
}

/* --------------------------------------------- letting the sim shape the move
   A Maestro applies its OWN stored speed and acceleration to every target
   it is given, and the sim's engine has already shaped the move before the
   target goes out. Both at once is not dangerous, it is just slower than
   either — which reads as "the model and the droid disagree", the one
   thing this simulator exists not to do.

   Zeroing them (0 = unlimited, 0J40 §5.e) hands the shaping to the engine
   alone, so the panel on screen and the panel on the droid move together.
   It is a RUNTIME write — the board's stored values come back on the next
   power cycle — but it is still a change to a board Mike tuned by hand, so
   it is opt-in and it says what it did. */
function mstrQuiet(on){
  const n = mstrChCount();
  for(let ch=0; ch<n; ch++){
    if(on){ mstrSetSpeed(ch, 0); mstrSetAccel(ch, 0); }
    else {
      const c = (typeof MSTR !== 'undefined' && MSTR.channels) ? MSTR.channels[ch] : null;
      if(!c) continue;
      mstrSetSpeed(ch, c.speed|0); mstrSetAccel(ch, c.acceleration|0);
    }
  }
  MST.quiet = !!on;
  /* The board's speeds have just been rewritten on every channel, so what
     serialMove() remembers sending is no longer what the board holds — and it
     de-duplicates Set Speed against exactly that memory. Left standing, the
     first move after this toggle would be a bare Set Target and the board
     would draw the ramp at whatever this loop just left it with: on a channel
     whose table speed is 0, full speed, while the sequencer still times the
     brick against the ramp it asked for. Cleared HERE rather than in the
     button's handler (serial-link.js) so that any future caller is covered
     too — the same reason serialSetMode() clears SER.lastTicks itself. */
  if(typeof SER !== 'undefined') SER.lastSpeed = {};
}

/* ================================================== THE CLAMP, MADE VISIBLE
   The whole reason the read-back exists. Poll the channel being worked on;
   when its position has stopped changing, compare where it stands with
   where it was asked to go. A settled servo that is not on its target has
   been clamped by the board's own stored limits, and nothing else on the
   wire will ever mention it.

   TOLERANCE. One PCA9685 count at 50 Hz is ~4.9 µs and a Maestro's own
   resolution is finer, but a loaded servo sits a little off its commanded
   pulse and a cheap one hunts. 8 quarter-µs (2 µs) is below anything a
   stored limit would differ by — Pololu's own defaults are 992 and 2000 —
   and above the noise. SETTLE is two identical reads in a row. */
const MST_CLAMP_TOL = 8;
function mstrClampCheck(ch){
  const asked = MST.asked[ch], got = MST.pos[ch];
  if(asked == null || got == null) return null;
  if(!asked || !got) return null;                 /* 0 = not pulsing, not a position */
  if(Math.abs(asked - got) <= MST_CLAMP_TOL){ delete MST.clamp[ch]; return null; }
  MST.clamp[ch] = {asked, got};
  return MST.clamp[ch];
}
/* The sentence a builder can act on. Deliberately says which direction it
   was clamped in and what to do about it, because "clamped" on its own
   sends people back to the linkage. */
function mstrClampNote(ch){
  const c = MST.clamp[ch]; if(!c) return '';
  const us = q => (q/4).toFixed(0);
  const dir = c.got > c.asked ? 'minimum' : 'maximum';
  return 'Channel ' + ch + ' was asked for ' + us(c.asked) + ' µs and settled at '
       + us(c.got) + ' µs. The board is clamping it: this channel\'s stored '
       + dir + ' on the Maestro is narrower than the travel you are measuring. '
       + 'The serial port cannot widen it — write the settings from the bench '
       + 'and apply them once in Control Center.';
}

/* ------------------------------------------------------------ the poller
   5 Hz, one channel, and only while something is looking. A Maestro will
   answer far faster than this; the limit is that every reply is two bytes
   through a promise chain shared with everything else on the link, and a
   bench that polls harder than it repaints is spending the wire on nothing.

   It reads the ERROR word too, on every fourth pass — the only reader
   there is, because Get Errors clears what it reads. */
function mstrWatch(ch){
  mstrUnwatch();
  if(!MST.on || ch == null) return;
  MST.watchCh = ch; MST.settle = 0; MST.lastPos = null;
  let n = 0;
  MST.watchTimer = setInterval(async ()=>{
    if(!MST.on || MST.watchCh == null) return mstrUnwatch();
    const p = await mstrGetPos(MST.watchCh);
    if(p != null){
      MST.pos[MST.watchCh] = p;
      if(p === MST.lastPos){ if(MST.settle < 3) MST.settle++; } else MST.settle = 0;
      MST.lastPos = p;
      if(MST.settle >= 2) mstrClampCheck(MST.watchCh);
    }
    if((++n & 3) === 0){
      const w = await mstrGetErrors();
      if(w != null){ MST.err = w; MST.errAt = Date.now(); }
    }
    if(typeof mstrReadoutSync === 'function') mstrReadoutSync();
  }, 200);
}
function mstrUnwatch(){
  if(MST.watchTimer) clearInterval(MST.watchTimer);
  MST.watchTimer = null; MST.watchCh = null; MST.settle = 0; MST.lastPos = null;
}
function mstrReset(){
  mstrUnwatch();
  MST.on = false; MST.err = 0; MST.errAt = 0; MST.quiet = false;
  MST.pos = {}; MST.asked = {}; MST.clamp = {};
  MST.rx.length = 0;
  if(MST.waiter){ clearTimeout(MST.waiter.timer); MST.waiter.resolve(null); MST.waiter = null; }
}

/* ============================================ THE HALF THE WIRE CANNOT DO
   One place that says what Control Center is still for, so the bench, the
   Finish step and the monitor cannot each describe it differently. */
function mstrSettingsAdvice(){
  return {
    why:'A Maestro\'s stored settings — each channel\'s min, max, neutral, home '
      + 'and mode, and the board\'s serial mode — live behind its NATIVE USB '
      + 'interface, not the command port this link speaks (Pololu 0J40 §8). '
      + 'Everything that MOVES the droid can be done from here; everything '
      + 'that CONFIGURES it is written once, in Control Center.',
    once:[
      'Serial mode: <b>USB Dual Port</b> — anything else and the command port ignores this app.',
      'Every channel you drive: mode <b>Servo</b>.',
      'Set each channel\'s min and max to the travel you measured here (or to the '
        + 'full 992–2000 µs and let the bench own the endpoints) — the board clamps '
        + 'to these and says nothing when it does.'
    ],
    how:['Close this link (the port can only be held by one program).',
         'Maestro Control Center → File → Open the settings file the bench writes.',
         'Check the Channel Settings tab, then <b>Apply Settings</b>.',
         'Close Control Center and connect here again.']
  };
}

/* =========================================================== THE READOUT
   The sentence the bench shows while you turn the dial. It lives here, with
   the poller that produces it, for the same reason monWarn() wires its own
   buttons: whoever writes the words is the only one who can still be right
   after the panel around them has been rebuilt.

   Silent on every board that is not a Maestro — PCA Studio and every
   PCA9685 build reach this function and get an empty node, because a bridge
   cannot be asked where a servo is and pretending otherwise would be the
   worst thing on this page. */
function mstrReadoutSync(){
  const host = (typeof $ === 'function') ? $('calBoard') : null;
  if(!host) return;
  if(!MST.on){ host.innerHTML = ''; host.className = 'calboard'; return; }
  const ch  = MST.watchCh;
  const pos = (ch == null) ? null : MST.pos[ch];
  const us  = q => (q/4).toFixed(0);
  const bits = [];

  bits.push('<b>the board says</b>');
  if(pos == null)     bits.push('<span class="stat">waiting for a reply…</span>');
  else if(!pos)       bits.push('<span class="stat">channel ' + ch + ' is not pulsing</span>');
  else                bits.push('<span class="calbnum">' + us(pos) + ' µs</span>'
                              + '<span class="stat">channel ' + ch
                              + (MST.settle >= 2 ? ' · settled' : ' · moving') + '</span>');

  const clamp = (ch == null) ? null : MST.clamp[ch];
  if(clamp) bits.push('<span class="calbbad">' + mstrClampNote(ch) + '</span>');

  const errs = mstrErrText(MST.err);
  if(errs.length) bits.push('<span class="calbwarn">board errors since the last check: '
                          + errs.join(', ') + '</span>');

  if(MST.quiet) bits.push('<span class="stat">board speed and acceleration set to unlimited — '
                        + 'the sim is shaping these moves. A power cycle puts the board\'s own back.</span>');

  host.className = 'calboard on' + (clamp ? ' bad' : '');
  host.innerHTML = bits.join(' ');
}
