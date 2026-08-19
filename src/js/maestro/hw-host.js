'use strict';
/* =====================================================================
   HW — the hardware seam, and the SIMULATOR's implementation of it

   Three things now live in one copy and run in two apps: the live channel
   table, the Web Serial link, and the six-step setup wizard with its
   calibration dial. They were PCA Studio's; the sim asked for them
   (Mike, 2026-08-12: "lets fold the PCA Studio into the Simulator").

   Copying them would have been quicker and wrong — a hand-kept copy is a
   copy that eventually differs, which is the lesson `blocks.js` and the
   `BLKH` seam already taught this repo. So they are written against HW,
   the smallest contract that describes what a HOST provides, and each app
   implements it once:

     the sim     THIS FILE                       over MSTR
     PCA Studio  pca-studio/src/js/44-hw-host.js over PROJ

   Everything in the contract is something the two hosts genuinely disagree
   about. Anything they agree on does not belong here — it belongs in the
   shared module.

   ------------------------------------------------------------ the engine
   The sim had NO pcaseq instance before this. It loaded the engine and
   never called pcaCreate(): the droid moved because the firmware profiles
   wrote ACT_T and the model eased toward it. That is a fine model of a
   droid and a useless model of a BOARD, and a calibration dial, a position
   bar and a serial stream all need the board.

   So the sim now runs a bench engine — HW.engine() — whose job is to be
   what the PCA9685s are doing. The 3D droid follows it: HW.drive() writes
   the engine AND mirrors into ACT_T for whichever actuator that channel is
   mapped to, so turning the dial moves the model and, if a board is
   plugged in, the actual servo. One command, three places, in that order.

   The bench engine is deliberately NOT the thing the firmware profiles
   drive. Those still own the droid during Drive and Sequence; this owns it
   while you are at the Bench with a servo in your hand.
   ===================================================================== */

/* the bench engine. Null until something needs it — most sessions never
   open the Bench, and building one costs a table walk per channel. */
let HWE = null;

const HW = {
  /* ------------------------------------------------------- the channels
     The live array, index IS the channel number. The sim's is MSTR's, and
     it is the one Mike calibrated against real linkages — the wizard is
     allowed to write it because the wizard is HIM writing it, with the
     servo moving in front of him (2026-08-12). Nothing here may rewrite it
     on its own initiative. */
  channels(){ return MSTR.channels; },
  count(){
    const b = boardById(MSTR.board);
    return Math.max(MSTR.servoCount|0, b.ch|0) || 24;
  },
  /* Fills every index up to i, not just i. `arr[9] = x` on a 4-long array
     leaves FIVE HOLES, and a hole is invisible until something walks the
     array — JSON.stringify writes null, forEach skips it, and pcaCreate
     produces a sparse engine whose st[] has gaps. That was "it worked the
     first time and not the second" in Studio 0.7.1 and it is the same trap
     here. */
  ensure(i){
    const list = MSTR.channels;
    const mk = k=>({i:k, name:'Channel '+k, mode:'Off',
                    min:DEFAULT_MIN, max:DEFAULT_MAX, home:DEFAULT_NEUTRAL, homemode:'Off',
                    neutral:DEFAULT_NEUTRAL, range:1905, speed:0, acceleration:0,
                    act:'', invert:false});
    for(let k=0;k<=i;k++) if(!list[k]) list[k] = mk(k);
    if(list[i].i === undefined) list[i].i = i;
    return list[i];
  },
  /* how many PCA9685s the current build has — the board·pin column, and
     the channel-count guard in servos.h, are both about this */
  boards(){
    const b = boardById(MSTR.board);
    return b.boards || Math.max(1, Math.ceil(this.count()/16));
  },

  trim(n){
    /* the sim NEVER shortens its own channel table from the wizard. Mike's
       rows carry names, actuator mappings and endpoints tuned against real
       linkages; "you said two boards" is not a reason to delete row 33. The
       Finish step says so instead. */
  },
  /* the BUILD decides how many channels this droid has — not an answer typed
     into step 2 of a wizard. HW.applied() says so out loud when they differ. */
  setupCount(){ return this.count(); },
  sequences(){ return MSTR.sequences || (MSTR.sequences = []); },
  addSequence(seq){ this.sequences().push(seq); if(typeof reindexSubs === 'function') reindexSubs(); },

  /* --------------------------------------------------- the wizard's answers
     Studio's answers ARE its project. The sim already has a build — "two
     PCA9685s" is something its setup wizard asked long ago — so these are
     kept beside it and reconciled OUT LOUD on the Finish step rather than
     silently overwriting a droid's configuration. */
  setup(){ return (CFG && CFG.hwSetup) || null; },
  setSetup(hw){ if(CFG) CFG.hwSetup = hw; },
  appVersion(){ return APP_VERSION + ' (R2-D2 Simulator)'; },
  applied(hw){
    this.rebuild(true);
    if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
    if(typeof hwIsOpen === 'function' && hwIsOpen()) hwRender();
    /* the one thing worth saying out loud: the wizard's board count and the
       BUILD's board can disagree, and the build is what the wiring sheet and
       the exports read */
    const want = pcaSeqBoardId(hw && hw.boards);
    if(hw && boardIsPca(MSTR.board) && MSTR.board !== want){
      this.say('setup says '+hw.boards+' board(s), but this build is set to '
             + boardById(MSTR.board).label + ' — change it in the build setup if that is wrong');
    }
  },

  /* --------------------------------------------------------- the engine */
  engine(){
    if(!HWE) this.rebuild(false);
    return HWE;
  },
  rebuild(keep){
    const old = HWE;
    HWE = pcaCreate(MSTR.channels, MSTR.sequences || []);
    if(keep && old){
      for(let i=0;i<Math.min(old.st.length, HWE.st.length);i++){
        const o = old.st[i], s = HWE.st[i];
        if(!o || !s || !s.servo) continue;   /* a hole on either side is not a channel */
        s.active = o.active; s.pos256 = o.pos256; s.vel256 = o.vel256; s.target = o.target;
        const c = MSTR.channels[i]; if(!c) continue;
        const lo = Math.min(c.min,c.max)<<8, hi = Math.max(c.min,c.max)<<8;
        if(s.active){ s.pos256 = clamp(s.pos256, lo, hi); s.target = clamp(s.target, lo>>8, hi>>8); }
      }
    }
    /* every position the engine writes goes down the wire, if there is one */
    HWE.onWrite = (ch, qus)=>{ if(typeof serialWrite === 'function') serialWrite(ch, qus); };
    if(typeof serialSyncAll === 'function' && typeof SER !== 'undefined' && SER.port) serialSyncAll();
  },
  /* One command, three places: the engine (which is the board's model and
     the position bar's source), the wire, and the 3D droid. The wire is
     the engine's onWrite, so it happens by itself. */
  drive(ch, qus){
    pcaSetTarget(this.engine(), ch, qus);
    const c = MSTR.channels[ch];
    if(c && c.act && typeof ACT_T !== 'undefined' && typeof chanNorm === 'function'){
      if(qus) ACT_T[c.act] = chanNorm(c, qus);
    }
  },
  pos(ch){ return pcaPos(this.engine(), ch); },

  /* ------------------------------------------- which part a channel drives
     v1.39.2. The panel↔servo mapping had three homes, all of them inside the
     setup overlay or the 3D selection card, and none of them where you are
     standing when you are naming channels on a bench. Mike, having found the
     servo config import: "ok where do I assign servos to panels?"

     The seam matters here: `act` is a SIM idea. PCA Studio has no droid, no
     CAD and no parts, and loads the same setup-hw.js — so it simply does not
     define these two, and the bench hides the column. A host that cannot
     answer "what parts are there" is not a host with no parts; it is a host
     the question does not apply to. */
  parts(){
    return (typeof chPartOptions === 'function') ? chPartOptions() : [];
  },
  partAt(ch){ const c = MSTR.channels[ch]; return (c && c.act) || ''; },
  setPart(ch, act){
    const c = MSTR.channels[ch]; if(!c) return false;
    /* one channel per part, always — two channels claiming the same panel is
       the bug that reads as "it moves twice as far" (cad/select.js does the
       same clear-then-set for the same reason) */
    if(act) MSTR.channels.forEach(x=>{ if(x && x.act === act) x.act = ''; });
    c.act = act || '';
    if(act && !/^servo/i.test(c.mode || '')) c.mode = 'Servo';
    this.save();
    this.rebuild(true);
    if(typeof boardVizSync === 'function') boardVizSync();
    if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
    return true;
  },
  /* the bench engine only runs while the Bench is looking at it — see
     hwTick() below */
  tick(dtMs){ if(HWE) pcaTick(HWE, dtMs); },

  /* ---------------------------------------------------------- the board */
  osc(){ return (CFG && CFG.pcaOsc) || 25000000; },
  setOsc(hz){ if(CFG) CFG.pcaOsc = hz|0; },
  /* The PCA9685's servo refresh rate, and the ONLY lever on its output
     resolution: one count is the period ÷ 4096, so 50 Hz resolves 4.88 µs
     and 200 Hz resolves 1.22 µs. It is a wizard answer that until v1.31.2
     never reached the wire — serialConfig() hardcoded 50 while the bridge
     sketch had accepted it on channel 63 all along. */
  freq(){ const hw = this.setup(); return (hw && hw.freq) || 50; },
  setFreq(hz){ const hw = this.setup() || {}; hw.freq = hz|0; this.setSetup(hw); },

  /* ----------------------------------------------------------- the host */
  say(msg, cls){ if(typeof lg === 'function') lg(cls === 'err' ? 'err' : 'mae', msg); },
  /* Two stores, because they hold two different kinds of thing and fail
     differently: PREFS is the light stuff, and the CHANNEL TABLE is the
     hour of calibration (maestro/servo-store.js). Until v1.43.0 this line
     only saved the first one, so every name, endpoint and part mapping
     was session state that a refresh silently replaced with a starter. */
  save(){
    if(typeof prefsSave === 'function') prefsSave();
    if(typeof servoStoreSave === 'function') servoStoreSave();
  },
  /* the sim redraws far more than Studio does when the table changes —
     the channel map, the wiring sheet and the sequencer all read it */
  changed(){
    this.rebuild(true);
    if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
  }
};

/* ------------------------------------------------------- the bench clock
   The engine steps on the sim's own animation frame, but ONLY while there
   is a reason: the Bench workspace is open, or a board is connected and
   wants to be told where things are. Otherwise a session that never goes
   near the Bench pays nothing. */
function hwWanted(){
  if(typeof SER !== 'undefined' && SER.port) return true;
  return (typeof wsGet === 'function') && wsGet() === 'bench';
}
/* Called from the animation frame. It does NOT step the engine — a fixed-rate
   engine driven off a variable-rate clock ripples (hw-clock.js). All this does
   is start and stop the heartbeat as the reason to have one comes and goes,
   and repaint what the heartbeat moved. */
function hwTick(){
  const want = hwWanted();
  if(want && !hwClockRunning()) hwClockStart();
  if(!want && hwClockRunning()) hwClockStop();
  if(want && typeof hwTableSync === 'function') hwTableSync();
}
