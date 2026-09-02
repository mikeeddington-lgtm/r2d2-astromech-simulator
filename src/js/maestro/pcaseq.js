'use strict';
/* ================================================================ PCA SEQ
   The JS twin of arduino/MaestroPCA — a servo sequencer for the PCA9685
   that speaks Maestro. The kinematics here is duplicated
   INTEGER-FOR-INTEGER from MaestroPCA.cpp: change one, change both, or
   the sim stops being evidence about the real droid. PCA Studio no longer
   carries a third copy — it is BUILT from this file (see
   pca-studio/manifest.json), which is what killed that whole class of
   drift. `E.onWrite(ch, qus)` is the hook Studio hangs live hardware off;
   null in the sim, where `E.writes` alone is what the tests count. Its
   opposite number in the C++ is `MpcaOutput` — same seam, same reason, and
   the C++ one also carries `code()` because a PCA9685 quantises and this
   twin does not have a bus to spare.

   Maestro units throughout:
     targets       quarter-µs (6000 = 1500 µs); 0 = channel off / limp
     speed         0.25 µs per 10 ms tick; 0 = unlimited
     acceleration  0.25 µs per 10 ms per 80 ms; 0 = unlimited

   It keeps the Maestro's INTERFACE but deliberately goes past its
   BEHAVIOUR where a droid benefits: several sequences at once, looping
   and background sequences, oscillator/wander generators, release when
   settled, and per-channel easing. See the library README.
   ===================================================================== */

const PCA_MAX_TRACKS = 4;

/* per-channel easing. Channel rows carry it as a NAME ('soft',
   'overshoot') because that is what the UI and the .json project store;
   the engine works in the same numbers the C++ uses. */
const PCA_EASE_NONE = 0, PCA_EASE_SOFT = 1, PCA_EASE_OVERSHOOT = 2;
function pcaEaseNum(v){
  if(typeof v === 'number') return v|0;
  return v === 'soft' ? PCA_EASE_SOFT : v === 'overshoot' ? PCA_EASE_OVERSHOOT : PCA_EASE_NONE;
}

/* sequence flags — mirror MPCA_SEQ_* */
const PCA_SEQ_LOOP = 1, PCA_SEQ_BACKGROUND = 2, PCA_SEQ_OSC = 4, PCA_SEQ_WANDER = 8;
const PCA_SEQ_GENERATOR = PCA_SEQ_OSC | PCA_SEQ_WANDER;

function pcaIsqrt32(v){
  v = v >>> 0;
  let r = 0, bit = 1 << 30;
  while(bit > v) bit >>>= 2;
  while(bit){
    if(v >= r + bit){ v -= r + bit; r = (r >>> 1) + bit; }
    else r >>>= 1;
    bit >>>= 2;
  }
  return r;
}

/* 0..255 tracing lo → hi → lo across one period, easing to a stop at each
   end (smoothstep over a triangle) so the turn never jerks */
function pcaPingPong(t, period, phaseDeg){
  if(!period) return 0;
  const off = Math.floor((phaseDeg % 360) * period / 360);
  const p   = Math.floor(((t + off) % period) * 65536 / period);
  const u   = p < 32768 ? p * 2 : (65535 - p) * 2;
  let   un  = u >> 8;
  if(un > 255) un = 255;
  return Math.floor((un * un * (765 - 2 * un)) / 65025);
}

/* a sequence is either {name, loop, background, frames:[{duration,targets[]}]}
   or a generator {name, gen:'osc'|'wander', entries:[{ch,lo,hi,period,phase}]} */
function pcaSeqFlags(seq){
  return (seq.loop ? PCA_SEQ_LOOP : 0)
       | (seq.background ? PCA_SEQ_BACKGROUND : 0)
       | (seq.gen === 'osc' ? PCA_SEQ_OSC : 0)
       | (seq.gen === 'wander' ? PCA_SEQ_WANDER : 0);
}
function pcaIsGen(seq){ return seq && (seq.gen === 'osc' || seq.gen === 'wander'); }

function pcaFire(E, ch, qus){ E.writes++; if(E.onWrite) E.onWrite(ch, qus); }

function pcaCreate(channels, sequences){
  const E = {
    channels, sequences,
    st: channels.map(c=>({
      pos256:0, vel256:0, target:0, aim:0,
      speed: c.speed|0, accel: c.acceleration|0,
      ease: pcaEaseNum(c.ease), releaseMs: c.releaseMs|0,
      settled:0, launch:0,
      active:false, known:false, servo:/^servo/i.test(c.mode||'Servo'),
      /* the bench dial's window past the stored ends — null everywhere
         else, see pcaBounds() */
      free:null
    })),
    tracks: Array.from({length:PCA_MAX_TRACKS},()=>({seq:-1, frame:-1, frameT:0, mask:pcaMaskNew(), started:0})),
    bgWait: new Array(PCA_MAX_TRACKS).fill(-1),
    startCount:0, tickAcc:0, ms:0, rng:0x2545F491,
    writes:0, ticks:0, frameLog:[], onWrite:null
  };
  /* `E.seq` stayed meaningful when one-script-at-a-time became several:
     it reads as the most recently started sequence, or -1 for idle. */
  Object.defineProperty(E, 'seq', { get(){ return pcaCurrent(E); }, enumerable:false });
  pcaGoHome(E);
  return E;
}

/* THE CHANNEL MASK IS FOUR WORDS, NOT ONE (v1.69.0) — MaestroPCA.h's
   `struct Mask`, mirrored integer-for-integer like everything else in this
   file. It was a single uint32_t with every channel from 31 up folded into
   bit 31, which the C++ note calls not a limit but a LIE, and it was: on
   three PCA9685s two sequences that shared no servo at all read as
   overlapping, so each displaced the other. "Several sequences at once, on
   disjoint channels" is the whole reason this engine exists rather than a
   Maestro, and it stopped working on exactly the rigs big enough to want it.

   Two things moved with the width. The fold was at `c < 31`, so channel 31
   — a perfectly ordinary channel on a two-board droid — was thrown in with
   the overflow as well; the C++ boundary is `c < 32` and so is this one.
   And the mask is now an OBJECT, so `t.mask & mask` and `busy |= t.mask` no
   longer say anything: every reader of a mask goes through the helpers
   below, which are the C++ methods by their own names.

   A channel at or above 128 never joins a mask at all, exactly as in the
   firmware — that loses it the collision check rather than handing it
   somebody else's, and nothing in this project can produce one anyway. */
const PCA_MASK_WORDS = 4;
const PCA_MAX_MASK_CHANNELS = PCA_MASK_WORDS * 32;

function pcaMaskNew(){ return new Array(PCA_MASK_WORDS).fill(0); }
function pcaMaskSet(m, c){ if(c >= 0 && c < PCA_MAX_MASK_CHANNELS) m[c >>> 5] |= 1 << (c & 31); }
function pcaMaskHas(m, c){
  return c >= 0 && c < PCA_MAX_MASK_CHANNELS && (m[c >>> 5] & (1 << (c & 31))) !== 0;
}
function pcaMaskEmpty(m){ for(let i=0;i<PCA_MASK_WORDS;i++) if(m[i]) return false; return true; }
function pcaMaskAdd(m, o){ for(let i=0;i<PCA_MASK_WORDS;i++) m[i] |= o[i]; }
function pcaMaskOverlaps(m, o){
  for(let i=0;i<PCA_MASK_WORDS;i++) if(m[i] & o[i]) return true;
  return false;
}

/* which channels does sequence n ever drive? */
function pcaSeqMask(E, n){
  const seq = E.sequences[n];
  const mask = pcaMaskNew();
  if(!seq) return mask;
  if(pcaIsGen(seq)){
    (seq.entries||[]).forEach(g=>{ if(g.ch < E.channels.length) pcaMaskSet(mask, g.ch|0); });
    return mask;
  }
  for(const fr of seq.frames)
    for(let c=0;c<E.channels.length;c++)
      if(fr.targets[c]) pcaMaskSet(mask, c);
  return mask;
}
function pcaRunning(E){ return E.tracks.some(t=>t.seq>=0); }
function pcaSeqRunning(E, n){ return E.tracks.some(t=>t.seq===n); }
function pcaRunningCount(E){ return E.tracks.filter(t=>t.seq>=0).length; }
function pcaCurrent(E){
  let best=-1, newest=0;
  E.tracks.forEach(t=>{ if(t.seq>=0 && t.started>=newest){ newest=t.started; best=t.seq; } });
  return best;
}
function pcaReleased(E, ch){ const s=E.st[ch]; return !!s && !s.active && s.known; }

function pcaHomeQus(c){
  /* homemode Off (and Ignore) = no pulses at power-up; encoded as home 0,
     unambiguous because 0 already means "off" everywhere */
  return (/off|ignore/i.test(c.homemode||'') ? 0 : (c.home|0));
}

function pcaGoHome(E){
  E.channels.forEach((c,i)=>{
    const s = E.st[i];
    if(!s.servo) return;
    const h = pcaHomeQus(c);
    if(h){
      s.target=h; s.aim=h; s.pos256=h<<8; s.vel256=0;
      s.active=true; s.known=true; s.settled=0; s.launch=0;
      pcaFire(E,i,h);
    }else{
      s.target=0; s.aim=0; s.active=false; s.known=false;
      pcaFire(E,i,null);
    }
  });
}

/* ========================================== THE BOUNDS A CHANNEL MOVES IN
   Its calibrated min/max, either way round — the same Math.min/Math.max the
   firmware takes — EXCEPT while the bench dial is measuring it (v1.76.0).
   `s.free` is a {lo, hi} in quarter-µs that the dial opens around a channel
   for exactly as long as the dial is on it (setup-hw-cal.js calDrive /
   setupCalLeave); every clamp in this file reads it here, so the dial can
   reach past the very ends it exists to find. Before this, pcaSetTarget()
   honoured the widened range and pcaStepChannel() then clamped the position
   back to the stored ends on the next tick — the first turn of the dial on a
   fresh channel worked (nothing had driven it, so it snapped) and the second
   did not, which read as flaky and made re-measuring a narrowed channel over
   PCA_Bridge impossible.

   PARITY NOTE: MaestroPCA.cpp has no dial and no `free`. With `free` null,
   which it is on every path but the dial's, this is Math.min/Math.max of
   the channel's own pair, integer-for-integer as before. */
function pcaBounds(c, s){
  if(s && s.free) return {lo:s.free.lo, hi:s.free.hi};
  return {lo:Math.min(c.min,c.max), hi:Math.max(c.min,c.max)};
}

/* ================================ CARRYING STATE ACROSS A REBUILD (v1.76.0)
   A host rebuilds the engine whenever the channel table changes — a renamed
   channel, a typed endpoint, a ticked boot, a finished wizard — and a
   rebuild is a fresh pcaCreate() + pcaGoHome(). What must survive it is
   where every servo IS and where it is GOING, or the droid lurches on a
   keystroke:

     · `pos256`/`vel256`/`active`/`target` — v1.31.x
     · `aim` — v1.66.3: `target` is where the channel was ASKED to go, `aim`
       is where pcaStepChannel actually steers (they differ under
       PCA_EASE_OVERSHOOT). Carrying four of the five left the new engine
       holding pcaGoHome's aim, so every driven channel ramped to its HOME
       on the next tick — and on a `homemode:'Off'` channel that home is 0,
       which drives it hard into c.min and PINS it there.
     · `known` — v1.76.0: a channel released by `releaseMs` is
       `active:false, known:true`, which is what makes its next command
       EASE from where it stopped instead of snapping. Dropping it turned
       every bench edit into a snap on the next move.
     · `free` — the dial's window, above, or a rebuild while the dial is
       open would clamp the servo back to the stored ends mid-measurement.

   It lives HERE, in the engine both hosts are built from, because it used
   to live in the sim's hw-host.js — and PCA Studio's 30-project.js carried
   its own copy that had never received the `aim` fix. In Studio a rename
   keystroke therefore walked every driven servo to its stop, three
   releases after the sim was fixed. One carry, two hosts.

   Only channels that were servos on BOTH sides are carried: a channel that
   has just been made a servo has never held a position, and the freshly
   homed state IS where it now is (2026-08-22). */
function pcaCarryState(old, E, channels){
  if(!old || !E) return;
  for(let i=0;i<Math.min(old.st.length, E.st.length);i++){
    const o = old.st[i], s = E.st[i];
    if(!o || !s || !s.servo || !o.servo) continue;
    s.active = o.active; s.pos256 = o.pos256; s.vel256 = o.vel256;
    s.target = o.target; s.aim = o.aim; s.known = o.known;
    s.free = o.free || null;
    const c = channels ? channels[i] : E.channels[i]; if(!c) continue;
    /* the endpoints may have just been narrowed — that is one of the edits
       that brings us here — and a position, target or aim outside them is
       the same drive-into-the-stop as a lost aim */
    const b = pcaBounds(c, s);
    const lo = b.lo<<8, hi = b.hi<<8;
    if(s.active){
      s.pos256 = Math.max(lo, Math.min(hi, s.pos256));
      s.target = Math.max(b.lo, Math.min(b.hi, s.target));
      s.aim    = Math.max(b.lo, Math.min(b.hi, s.aim));
    }
  }
}

function pcaSetTarget(E, ch, qus){
  const c = E.channels[ch], s = E.st[ch];
  if(!c || !s || !s.servo) return;
  if(!qus){
    /* asked for deliberately, so we no longer claim to know where it is */
    s.target=0; s.aim=0; s.active=false; s.known=false; s.vel256=0;
    pcaFire(E,ch,null);
    return;
  }
  const b = pcaBounds(c, s), lo = b.lo, hi = b.hi;
  if(qus < lo) qus = lo;
  if(qus > hi) qus = hi;

  if(!s.active && !s.known){
    /* nothing has ever driven this channel: snap, like a real Maestro */
    s.pos256 = qus<<8; s.vel256 = 0;
    s.active = true; s.known = true;
    s.target = qus; s.aim = qus; s.settled = 0; s.launch = 0;
    pcaFire(E,ch,qus);
    return;
  }
  if(!s.active && s.known) s.active = true;   /* released, resume from here */

  if(s.target !== qus){ s.settled = 0; s.launch = 0; }
  s.target = qus;

  if(s.ease === PCA_EASE_OVERSHOOT){
    const d = qus - ((s.pos256 + 128) >> 8);
    const dist = Math.abs(d);
    if(dist > (hi - lo) / 8){
      const over = Math.floor(dist / 12);
      s.aim = Math.max(lo, Math.min(hi, qus + (d > 0 ? over : -over)));
      return;
    }
  }
  s.aim = qus;
}

/* generators own the position outright — the waveform IS the motion */
function pcaDrive(E, ch, qus){
  const c = E.channels[ch], s = E.st[ch];
  if(!c || !s || !s.servo) return;
  const lo=Math.min(c.min,c.max), hi=Math.max(c.min,c.max);
  qus = Math.max(lo, Math.min(hi, qus));
  if(!s.active){ s.active = true; s.known = true; }
  s.pos256 = qus<<8; s.vel256 = 0;
  s.target = qus; s.aim = qus; s.settled = 0;
  pcaFire(E,ch,qus);
}

function pcaSetSpeed(E, ch, v){ if(E.st[ch]) E.st[ch].speed = v|0; }
function pcaSetAccel(E, ch, v){ if(E.st[ch]) E.st[ch].accel = v|0; }
function pcaSetRelease(E, ch, ms){ if(E.st[ch]) E.st[ch].releaseMs = ms|0; }
function pcaSetEase(E, ch, e){ if(E.st[ch]) E.st[ch].ease = e|0; }
function pcaPos(E, ch){ const s=E.st[ch]; return (s && s.active) ? (s.pos256+128)>>8 : 0; }
function pcaMoving(E){ return E.st.some(s=>s.active && s.pos256 !== (s.aim<<8)) ? 1 : 0; }

function pcaRestart(E, n){
  if(n<0 || n>=E.sequences.length) return;
  const mask = pcaSeqMask(E, n);
  let slot = -1;
  E.tracks.forEach((t,i)=>{
    if(t.seq<0){ if(slot<0) slot=i; return; }
    if(t.seq===n || pcaMaskOverlaps(t.mask, mask)){
      const old = E.sequences[t.seq];
      if(old && old.background && t.seq !== n) pcaBgRemember(E, t.seq);
      /* ITS SPEEDS GO BACK WITH ITS CHANNELS (v1.78.0, review M5b) —
         MaestroPCA.cpp restartScript() has had this line since per-frame
         speeds existed; this twin released speeds when a track ENDED or was
         STOPPED and not when it was DISPLACED, so a routine that lost its
         channels to another left its frame speeds on them: the newcomer
         ran at the old routine's pace, and a channel the newcomer never
         touched kept a speed the table does not know about. The firmware
         runs the newcomer at the table's speed, so Studio's preview of a
         displacing routine was wrong about the droid. */
      pcaReleaseSpeeds(E, t.mask);
      t.seq=-1;
      if(slot<0) slot=i;
    }
  });
  if(slot<0){
    slot = 0;
    for(let i=1;i<E.tracks.length;i++) if(E.tracks[i].started < E.tracks[slot].started) slot=i;
  }
  /* asking for it again cancels any pending resume of the same thing */
  for(let i=0;i<E.bgWait.length;i++) if(E.bgWait[i]===n) E.bgWait[i]=-1;
  E.tracks[slot] = {seq:n, frame:-1, frameT:0, mask, started:++E.startCount};
}
function pcaBgRemember(E, n){
  if(E.bgWait.indexOf(n) >= 0) return;
  const i = E.bgWait.indexOf(-1);
  if(i >= 0) E.bgWait[i] = n;
}
function pcaBgResume(E){
  for(let i=0;i<E.bgWait.length;i++){
    const n = E.bgWait[i];
    if(n < 0) continue;
    const mask = pcaSeqMask(E, n);
    const busy = pcaMaskNew();
    E.tracks.forEach(t=>{ if(t.seq>=0) pcaMaskAdd(busy, t.mask); });
    if(pcaMaskOverlaps(mask, busy)) continue;   /* still borrowed — wait */
    E.bgWait[i] = -1;
    pcaRestart(E, n);
  }
}
function pcaStop(E){
  E.tracks.forEach(t=>{ if(t.seq>=0) pcaReleaseSpeeds(E, t.mask); t.seq=-1; t.frame=-1; t.frameT=0; });
  E.bgWait.fill(-1);                      /* an explicit stop means stop */
}
function pcaStopSeq(E, n){
  E.tracks.forEach(t=>{ if(t.seq===n){ pcaReleaseSpeeds(E, t.mask); t.seq=-1; t.frame=-1; t.frameT=0; } });
  for(let i=0;i<E.bgWait.length;i++) if(E.bgWait[i]===n) E.bgWait[i]=-1;
}

function pcaApplyFrame(E, ti, f){
  const t = E.tracks[ti];
  if(t.seq<0) return;
  const fr = E.sequences[t.seq].frames[f];
  if(!fr) return;
  E.frameLog.push({t:E.ms, seq:t.seq, frame:f});
  for(let c=0;c<E.channels.length;c++){
    const v = fr.targets[c];
    if(!v || !E.st[c]) continue;              /* 0 = frame leaves channel alone */
    /* PER-FRAME SPEED (v1.66.0). The compiler sizes it so the move fills the
       frame's own duration, which is what lets a ramp be ONE target instead
       of a staircase. Set it BEFORE the target: pcaStepChannel reads the
       speed on the tick after the command, and a target given at the old
       speed would take its first tick at the wrong pace. */
    if(fr.speeds && fr.speeds[c]){ E.st[c].seqSpeed = true; pcaSetSpeed(E, c, fr.speeds[c]); }
    pcaSetTarget(E, c, v);
  }
}
/* Put back what the channel table says (v1.66.0). A per-frame speed is the
   ROUTINE's, not the channel's, and a Set Speed persists on a Maestro and
   here alike — so a routine that ended would otherwise leave the pad, the
   bench dial and every group action running at whatever pace its last frame
   happened to need. Called wherever a track lets go of its channels. */
function pcaReleaseSpeeds(E, mask){
  for(let c=0;c<E.channels.length;c++){
    const s = E.st[c];
    if(!s || !s.seqSpeed) continue;
    /* an EMPTY mask means "every channel", as in releaseSeqSpeeds() — a
       track that claimed nothing still has to give its speeds back */
    if(mask && !pcaMaskEmpty(mask) && !pcaMaskHas(mask, c)) continue;
    s.seqSpeed = false;
    pcaSetSpeed(E, c, (E.channels[c] && E.channels[c].speed) | 0);
  }
}

function pcaNextRandom(E, lo, hi){
  let x = E.rng;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;  x >>>= 0;
  E.rng = x;
  if(hi <= lo) return lo;
  return lo + ((x >>> 8) % (hi - lo + 1));
}

/* one engine step of `dtms` milliseconds — mirrors MaestroPCA::update() */
function pcaTick(E, dtms){
  let elapsed = dtms|0;
  if(elapsed <= 0) return;
  if(elapsed > 250) elapsed = 250;
  E.ms += elapsed;

  for(let i=0;i<E.tracks.length;i++){
    const t = E.tracks[i];
    if(t.seq < 0) continue;
    const seq = E.sequences[t.seq];

    if(pcaIsGen(seq)){
      const before = t.frameT;
      t.frameT += elapsed;
      (seq.entries||[]).forEach(g=>{
        if(g.ch >= E.channels.length || !g.period) return;
        if(seq.gen === 'osc'){
          const s = pcaPingPong(t.frameT, g.period, g.phase|0);
          pcaDrive(E, g.ch, g.lo + Math.floor((g.hi - g.lo) * s / 255));
        }else{
          const off = Math.floor(((g.phase|0) % 360) * g.period / 360);
          if(before === 0 || Math.floor((before+off)/g.period) !== Math.floor((t.frameT+off)/g.period))
            pcaSetTarget(E, g.ch, pcaNextRandom(E, g.lo, g.hi));
        }
      });
      continue;                            /* generators never end alone */
    }

    const frames = seq.frames;
    if(!frames.length){ pcaReleaseSpeeds(E, t.mask); t.seq = -1; continue; }
    if(t.frame < 0){ t.frame=0; t.frameT=0; pcaApplyFrame(E,i,0); }
    else t.frameT += elapsed;

    while(t.frame < frames.length){
      const dur = frames[t.frame].duration|0;
      if(t.frameT < dur) break;
      t.frameT -= dur;
      t.frame++;
      if(t.frame < frames.length) pcaApplyFrame(E, i, t.frame);
    }

    if(t.frame >= frames.length){
      if(seq.loop){
        /* keep the leftover milliseconds, so a looping idle does not
           drift a few ms slower on every pass round */
        t.frame = 0;
        pcaApplyFrame(E, i, 0);
      }else{
        pcaReleaseSpeeds(E, t.mask);
        t.seq = -1;
      }
    }
  }

  pcaBgResume(E);                          /* an idle picks up once it can */

  /* THE SAME elapsed the frame timers above were given (v1.78.0, review
     M5a) — clamped once, at the top, and not a second time here. This line
     used to read `(elapsed > 200) ? 200 : elapsed`, a mirror of the C++'s
     old uint8_t accumulator that could not hold 250 beside a remainder;
     MaestroPCA.cpp:468 dropped its second clamp in v1.69.0 (bounds_test.cpp
     pins 25 ticks for one 250 ms call) and this twin kept it, so one 250 ms
     tick stepped the servos 200 ms while the frames moved 250 — an
     animation that slips against itself lands in the wrong place rather
     than merely stuttering. The only clamp an engine step gets is the
     firmware's own 250 at the top; deciding what a stalled tab should be
     HANDED at all — the 250 cap, dropping a backgrounded tab's backlog,
     carrying fractional milliseconds — is the CLOCK's job (hw-clock.js),
     because it is the clock that turns wall time into dtms. The engine's
     job is to spend what it is given exactly once, and the same for the
     frames as for the servos. */
  E.tickAcc += elapsed;
  while(E.tickAcc >= 10){
    E.tickAcc -= 10; E.ticks++;
    /* `E.st[c] &&` is a guard, not kinematics — it has no counterpart in the
       C++, where the table is fixed at compile time and cannot grow. Here
       E.channels is a LIVE reference to the host's channel array, and PCA
       Studio's setup screen adds channels to it. Without this, one tick
       after a channel is added throws inside requestAnimationFrame, which
       kills the loop and freezes the whole app — a missing state should
       cost that channel, not the application. */
    for(let c=0;c<E.channels.length;c++)
      if(E.st[c] && E.st[c].active) pcaStepChannel(E, c);
  }
}

function pcaStepChannel(E, ch){
  const s = E.st[ch];
  const T = s.aim<<8;
  const d = T - s.pos256;

  if(d===0 && s.vel256===0){
    /* arrived. If we overshot deliberately, come back to the real target;
       otherwise start counting toward release. */
    if(s.aim !== s.target){ s.aim = s.target; s.launch = 0; return; }
    if(s.releaseMs){
      if(s.settled < 0xFFFF) s.settled++;
      if(s.settled * 10 >= s.releaseMs){
        /* stop pulsing: silent, cool, no current — but remember where it
           is, so the next command eases from here instead of snapping */
        s.active = false;
        pcaFire(E,ch,null);
      }
    }
    return;
  }
  s.settled = 0;
  if(s.launch < 0xFFFF) s.launch++;

  const speed = s.speed, accel = s.accel;
  if(speed===0 && accel===0){
    s.pos256 = T; s.vel256 = 0; pcaFire(E,ch,(s.pos256+128)>>8);
    return;
  }
  const dir = d>=0 ? 1 : -1;
  const dist = d>=0 ? d : -d;
  const vmax = speed ? (speed<<8) : 0x20000000;

  if(accel===0){
    const step = dist < vmax ? dist : vmax;
    s.pos256 += dir*step;
    s.vel256 = 0;
  }else{
    let a = accel<<5;                       /* accel × 256 / 8 ticks-per-80ms */
    /* PCA_EASE_SOFT: let the acceleration itself come in over the first
       8 ticks, so the move breathes into motion rather than stepping */
    if(s.ease === PCA_EASE_SOFT && s.launch < 8){
      a = Math.floor(a * (s.launch + 1) / 8);
      if(a < 1) a = 1;
    }
    let v = dir*s.vel256;
    v += a;
    if(v > vmax) v = vmax;
    /* overshoot guard at quarter-µs granularity: v ≤ 128·√(accel·distq)+256
       — identical to the AVR build, which must stay inside 32 bits */
    const dq = dist>>8;
    const vstop = 128*pcaIsqrt32(accel*dq) + 256;
    if(v > vstop) v = vstop;
    if(v > dist) v = dist;
    s.pos256 += dir*v;
    s.vel256 = dir*v;
  }
  /* Clamp the POSITION, not just the target — reversing with residual
     velocity can otherwise carry a channel past its calibrated endpoint,
     and endpoints are what stop a panel binding against the shell. */
  const b2 = pcaBounds(E.channels[ch], s);
  const clo = b2.lo<<8, chi = b2.hi<<8;
  if(s.pos256 < clo){ s.pos256 = clo; s.vel256 = 0; }
  if(s.pos256 > chi){ s.pos256 = chi; s.vel256 = 0; }
  if(s.pos256===T) s.vel256 = 0;
  pcaFire(E,ch,(s.pos256+128)>>8);
}

/* quarter-µs → 12-bit PCA9685 ticks at 50 Hz — matches
   MaestroPCA::qusToTicks with usPerPeriod 20000 */
function pcaQusToTicks(qus, usPerPeriod){
  const denom = (usPerPeriod||20000)*4;
  return Math.floor((qus*4096 + denom/2)/denom);
}
