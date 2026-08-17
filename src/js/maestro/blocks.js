'use strict';
/* =====================================================================
   BLOCK SEQUENCER — the model

   Mike, 2026-07-27: "build sequences with drag-and-drop … appending them
   in order like Lego blocks", with Lego Mindstorms as the reference for
   how simple it should feel.

   The Maestro itself only understands FRAMES: an absolute pose per
   channel plus a duration. That is what has to be exported, and it is a
   terrible thing to author by hand — which is why this layer exists.

   A routine is a list of BLOCKS on a timeline:

     {kind:'act', ref:'pie0', lane, t0, dur, rise, fall}
        one moving part, open for `dur` ms, taking `rise` ms to open and
        `fall` ms to close. rise/fall are the per-instance speed overrides
        Mike asked for — they live on the BLOCK, so changing one does not
        touch the action in the library or the same action in another
        sequence.

     {kind:'seq', ref:'Dome pies open', lane:0, t0, dur}
        a whole library sequence dropped in as one brick. Its own frames
        are replayed from t0.

   `blockCompile()` turns that back into frames by collecting every event
   BOUNDARY (a block starting, finishing its ramp, beginning to close,
   ending), evaluating every channel at each boundary, and emitting one
   frame per boundary. Because frames are absolute, that is exact — no
   delta encoding to get wrong.

   The blocks live on the sequence object as `seq.blocks`. A sequence
   without them is a hand-made frame list and is left completely alone, so
   an imported .mstr still opens and edits the old way.

   NOTHING IN HERE KNOWS ABOUT R2-D2. Everything from the surroundings —
   the channel table, the library, labels, colours, the beat grid — comes
   through `BLKH`, defined by whichever app loaded this file (blocks-host.js
   in the sim, 45-blocks-host.js in PCA Studio). That is what lets the same
   compiler run in both, instead of one being a copy that drifts.
   ===================================================================== */

const BLK_DEFAULTS = { dur:1200, rise:300, fall:300 };
let BLK_NEXT_ID = 1;

/* A human name for an actuator. The part label wins (it is what the builder
   typed), then the friendly name from PART_LIST — a channel can be wired to
   an actuator with no CAD geometry, and "pie5" on a brick reads like a bug. */
function blkLabel(act){ return BLKH.label(act); }

/* ------------------------------------------------------------- colours
   Mike, 2026-07-27: "the Parts should be colour coded, maybe just different
   colours for each one … and also a slider that sets the part on the model
   to the same colour as set in the sequencer for easy identification."

   The colour is derived from the CHANNEL the part is plugged into, so it is
   stable across rebuilds and two neighbouring channels never land on the
   same hue. A part with no channel falls back to a hash of its id, so it
   still gets a colour of its own. Either can be overridden by hand from the
   inspector, and the override is remembered in PREFS.

   Nothing here writes to PARTS.overrides — the model tint is a LAYER that
   effectivePartHex() consults while it is switched on, so turning it off
   puts the paint scheme straight back. */
const BLK_PALETTE = [
  '#4fd8e8','#ffb454','#7ee787','#ff7b72','#a78bfa','#f472b6',
  '#59c2ff','#ffd866','#6ee7b7','#fb923c','#93c5fd','#c3e88d',
  '#e879f9','#facc15','#34d399','#f87171'
];
function blkColorMap(){ return BLKH.colorMap(); }
function blkColor(act){
  if(!act) return BLK_PALETTE[0];
  const saved = blkColorMap()[act];
  if(saved) return saved;
  let i = BLKH.colorIndex(act);
  if(i === null || i === undefined){ i = 0; for(let k=0;k<act.length;k++) i = (i*31 + act.charCodeAt(k)) | 0; }
  return BLK_PALETTE[Math.abs(i) % BLK_PALETTE.length];
}
function blkSetColor(act, hex){
  const m = blkColorMap();
  if(hex) m[act] = hex; else delete m[act];
  BLKH.saveColors();
}
/* the tint layer, read by effectivePartHex() */
function blkTintHex(name){
  if(typeof BLK === 'undefined' || !BLK.tint) return null;
  return BLKH.tintHex ? BLKH.tintHex(name) : null;
}

/* ---------------------------------------------------------- the library
   The actions you can drag in: every channel that drives a droid part,
   named the way the builder named it. */
function blockActions(){ return BLKH.actions(); }
/* groups make useful bricks too — "all the pies" as one drag */
function blockGroups(){ return BLKH.groups(); }

/* ------------------------------------------------------------ channels */
function blockChan(act){ return BLKH.chanFor(act); }

/* ================ A BRICK THAT IS NOT WIRED TO A CHANNEL YET (v1.46.0)
   Mike: "The user should be able to drag into the sequencer non mapped items
   but keep them grey - they may not have the servo setup in the real model
   yet but want to build a sequence"

   v1.45.0 put every moving panel in the library and REFUSED the drag on the
   unwired ones. Refusing is the wrong answer to "I am building the routine
   before I have wired the droid": choreography is a plan, and a plan may
   name a panel whose servo is still in its bag.

   So the drop lands and the brick is real — it just has no channel behind
   it, which is a fact about the DROID, not about the brick. Two rules keep
   that honest:
     · IT IS GREY EVERYWHERE IT IS DRAWN, and the reason is on the brick
       (blocks-ui.js .unwired). A brick that moves nothing must never look
       like one that does.
     · IT IS SKIPPED AT COMPILE TIME, BY NAME. blockValueAt() already
       returned null with no channel, so no frame ever carried a target for
       it — but blockBoundaries() still opened frame boundaries around it,
       and blockEnd() still stretched the frame list to cover it. Both now
       ignore it, so a routine compiles byte-for-byte the same as it would
       without the brick at all: no frame row that drives nothing, nothing
       new in the .mstr or in sequences.h. blockUnwiredNote() is what says
       so out loud, and the moment that panel is given a channel the brick
       starts compiling with no further ceremony.

   Host-agnostic on purpose (BLKH is the seam, and PCA Studio has its own
   host): "is there a channel" is asked through blockChan() exactly as the
   compiler already asks it. In Studio every ref IS a channel, so all of
   this is inert there. */
function blockWired(b){
  if(!b) return false;
  if(b.kind === 'seq') return true;      // a dropped-in sequence carries its own targets
  return !!blockChan(b.ref);
}
/* the bricks with no channel behind them, in timeline order */
function blockUnwired(seq){
  return blockList(seq).filter(b=>!blockWired(b))
    .map(b=>({id:b.id, ref:b.ref, label:blkLabel(b.ref) || b.ref}));
}
/* the warning, named — "2 bricks are not wired to a channel yet: Pie 4,
   Panel 9". Named, because "some bricks were skipped" sends you hunting
   through a timeline for which. Empty string when there is nothing to say,
   so a caller can use it as its own condition. */
function blockUnwiredNote(seq){
  const un = blockUnwired(seq);
  if(!un.length) return '';
  const names = [];
  un.forEach(u=>{ if(names.indexOf(u.label) < 0) names.push(u.label); });
  return un.length + ' brick' + (un.length === 1 ? ' is' : 's are')
       + ' not wired to a channel yet: ' + names.join(', ');
}
/* the routine's end AS IT COMPILES. blockEnd() is the EDITING length — it
   has to include an unwired brick or the timeline would not have room to
   draw it and a dropped chip would land on top of it — but the frame list
   must stop where the last DRIVEN brick stops. */
function blockEndCompiled(seq){
  return blockList(seq).reduce((m,b)=>blockWired(b) ? Math.max(m, b.t0 + b.dur) : m, 0);
}
/* closed is the home pose; open is whichever endpoint is further from it */
function blockClosed(c){ return c.home || c.neutral || BLKH.neutral(); }
function blockOpen(c){
  const home = blockClosed(c);
  const lo = Math.min(c.min, c.max), hi = Math.max(c.min, c.max);
  return (Math.abs(hi - home) >= Math.abs(home - lo)) ? hi : lo;
}

/* ------------------------------------------- the imported travel limits
   The user's .mstr carries a speed and an acceleration per channel, tuned
   against real linkages. Those are AUTHORITATIVE (Mike, 2026-07-29): a brick
   may ask for a faster ramp, but the board will not deliver it, so the sim
   must not show it either. blockMinTravelMs() is the physical floor — the
   time the imported settings need for the closed↔open throw — and the
   compiler ramps never go below it. 0 means the channel is unlimited. */
function blockMinTravelMs(ref, amp){
  const c = blockChan(ref);
  if(!c) return 0;
  const a = (amp === undefined) ? 1 : amp;
  return Math.ceil(BLKH.travelMs(c, (blockOpen(c) - blockClosed(c)) * a));
}
/* the ramp a fresh brick gets: the stock default, or the imported minimum
   when the channel is slower than that — so a new brick is honest from the
   moment it lands */
function blockDefaultRamp(ref){
  return Math.max(BLK_DEFAULTS.rise, blockMinTravelMs(ref));
}
/* the ramps the compiler actually uses: the brick's own rise/fall, floored
   at the imported travel time, capped at half the brick as before */
function blockEffRamps(b){
  const lim = (b.kind === 'act') ? blockMinTravelMs(b.ref, b.amp) : 0;
  return {
    rise: Math.min(Math.max(b.rise, lim), b.dur/2),
    fall: Math.min(Math.max(b.fall, lim), b.dur/2)
  };
}

/* --------------------------------------------------- how a ramp is drawn
   A ramp is NOT two keyframes. A frame commands its targets and then waits
   its duration, so between two keyframes the servo travels at whatever its
   own speed setting allows — instantly, on a channel with no speed set. Two
   keyframes therefore made "Opens in 3 s" mean "opens AFTER 3 s": three
   seconds of the shut pose, then a snap. Mike found it on the bench,
   2026-08-12, and his reading was the right one — the number is how long
   the move TAKES.

   So each ramp is drawn as a run of steps. That makes the time real in the
   preview, in an exported `.mstr` and in `sequences.h` alike, whatever the
   channel's speed says — and the floor above still stops a brick asking for
   faster than the board can deliver.

   Steps cost frames, and frames cost Maestro script space, so the count is
   bounded: about one step per BLK_RAMP_STEP_MS, never more than
   BLK_RAMP_MAX_STEPS. 125 ms apart is finer than a panel can be seen to
   step, and the board's own acceleration rounds the corners anyway. The
   `script-size` lint rule is what warns when a routine gets near the
   board's limit. */
const BLK_RAMP_STEP_MS  = 120;
const BLK_RAMP_MAX_STEPS = 24;
function blockRampSteps(ms){
  if(!(ms > 0)) return 0;
  return Math.max(1, Math.min(BLK_RAMP_MAX_STEPS, Math.round(ms / BLK_RAMP_STEP_MS)));
}

/* --------------------------------------------------------- the routine */
function blockList(seq){ return (seq && seq.blocks) || []; }
function blockIsRoutine(seq){ return !!(seq && seq.blocks); }
function blockEnd(seq){
  return blockList(seq).reduce((m,b)=>Math.max(m, b.t0 + b.dur), 0);
}
/* lanes are per actuator, created in the order you drop things, with lane
   0 reserved for whole-sequence bricks so they read as the spine */
function blockLanes(seq){
  const lanes = [{id:'_seq', label:'Sequences', kind:'seq'}];
  blockList(seq).forEach(b=>{
    if(b.kind === 'seq') return;
    if(lanes.some(l=>l.id === b.ref)) return;
    lanes.push({id:b.ref, kind:'act',
      label:blkLabel(b.ref)});
  });
  return lanes;
}
function blockAdd(seq, kind, ref, t0, opts){
  if(!seq) return null;
  if(!seq.blocks) seq.blocks = [];
  const o = opts || {};
  const ramp = (kind === 'act') ? blockDefaultRamp(ref) : BLK_DEFAULTS.rise;
  const b = {
    id: BLK_NEXT_ID++,
    kind, ref,
    t0: Math.max(0, Math.round(t0||0)),
    dur: Math.max(120, Math.round(o.dur || (kind === 'seq' ? blockSeqDur(ref) : BLK_DEFAULTS.dur))),
    rise: o.rise !== undefined ? o.rise : ramp,
    fall: o.fall !== undefined ? o.fall : ramp
  };
  /* partial travel — how far open this brick goes (1 = the full throw).
     What "Breathe" is made of: a panel that only ever swells a fifth of the
     way open reads as breathing, not as a door opening. */
  if(o.amp !== undefined && o.amp < 1) b.amp = Math.max(0.05, o.amp);
  /* the motion mode (Mike, 2026-08-14): "clicking a panel brick should
     offer: Opens then closes / just Opens / just Closes / Closes then
     opens — default Open then closes". Stored only when it differs from
     the default, same terseness as `amp` above — an absent b.mode IS
     'oc', for every brick saved before this existed. */
  if(kind === 'act' && o.mode && o.mode !== 'oc') b.mode = o.mode;
  seq.blocks.push(b);
  blockSync(seq);
  return b;
}
function blockRemove(seq, id){
  if(!seq || !seq.blocks) return;
  seq.blocks = seq.blocks.filter(b=>b.id !== id);
  blockSync(seq);
}
function blockFind(seq, id){ return blockList(seq).find(b=>b.id === id) || null; }
function blockSeqDur(name){
  const s = BLKH.sequences().find(x=>x.name === name);
  return s ? Math.max(200, seqTotal(s)) : 1000;
}

/* --------------------------------------------------------- compilation */
/* which mode a brick is in — absent means 'oc', for back-compat with
   every brick saved before per-brick MOTION existed */
function blockMode(b){ return (b && b.mode) || 'oc'; }
/* the intermediate instants a ramp needs — that is what makes it a ramp
   rather than a delay followed by a jump. Shared by blockBoundaries for
   every mode: only WHERE a ramp sits (start vs end of the brick) changes
   between them, never how it is stepped. */
function blkAddRampSteps(set, start, ms){
  const n = blockRampSteps(ms);
  for(let k=1;k<=n;k++) set.add(Math.round(start + ms*k/n));
}
/* every instant where something changes */
function blockBoundaries(seq){
  const set = new Set([0]);
  blockList(seq).forEach(b=>{
    if(b.kind === 'seq'){
      const ref = BLKH.sequences().find(x=>x.name === b.ref);
      let t = b.t0;
      set.add(t);
      const end = b.t0 + b.dur;  // v1.39.5: a resized brick must not compile frames past its own end
      (ref ? ref.frames : []).forEach(f=>{ t += f.duration; if(t < end) set.add(t); });
      set.add(end);
    }else{
      /* v1.46.0 — an unwired brick opens no frame boundaries. It compiles
         to nothing (blockValueAt returns null with no channel), so a
         boundary here would be a frame row that drives nothing. */
      if(!blockWired(b)) return;
      const r  = blockEffRamps(b);
      const mode = blockMode(b);
      set.add(b.t0);
      set.add(b.t0 + b.dur);
      /* 'oc' (unchanged) and 'o' both open across [t0, t0+rise] */
      if(mode === 'oc' || mode === 'o'){
        blkAddRampSteps(set, b.t0, r.rise);
        set.add(b.t0 + r.rise);
      }
      /* 'oc' (unchanged) closes across [t0+dur-fall, t0+dur]; 'c' and 'co'
         close at THE START instead — the stepped ramp sits on [t0, t0+fall] */
      if(mode === 'oc'){
        const t2 = b.t0 + b.dur - r.fall;
        set.add(t2);
        blkAddRampSteps(set, t2, r.fall);
      }else if(mode === 'c' || mode === 'co'){
        set.add(b.t0 + r.fall);
        blkAddRampSteps(set, b.t0, r.fall);
      }
      /* 'co' also opens again at THE END — [t0+dur-rise, t0+dur], so both
         of its ramps get stepped instants */
      if(mode === 'co'){
        const t3 = b.t0 + b.dur - r.rise;
        set.add(t3);
        blkAddRampSteps(set, t3, r.rise);
      }
    }
  });
  return Array.from(set).filter(t=>t >= 0).sort((a,c)=>a-c);
}
/* what one act block commands at time t, or null if it is not active.
   Four MOTION shapes inside the brick's own window [t0, t0+dur] (Mike,
   2026-08-14 — "clicking a panel brick should offer: Opens then closes /
   just Opens / just Closes / Closes then opens"):
     'oc' (default) 0→amp over rise, hold, amp→0 over fall ending at dur —
          unchanged from before MOTION existed.
     'o'  0→amp over rise, then holds amp to the brick's own end — no
          fall. Nothing here resets it; blockCompile's carry is what lets
          the channel STAY open past this brick (see its own note).
     'c'  amp→0 over fall starting at t0, then holds 0 — the brick
          asserts the part starts open (typically because a preceding
          'o'/'co' brick left it that way).
     'co' amp→0 over fall at the start, holds 0, then 0→amp over rise
          ending at dur. */
function blockValueAt(b, t){
  if(t < b.t0 || t > b.t0 + b.dur) return null;
  const c = blockChan(b.ref); if(!c) return null;
  const closed = blockClosed(c);
  const amp = (b.amp === undefined) ? 1 : b.amp;
  const open = Math.round(closed + (blockOpen(c) - closed) * amp);
  const {rise, fall} = blockEffRamps(b);
  const local = t - b.t0;
  const lerp = (from, to, frac) => Math.round(from + (to-from)*frac);
  const mode = blockMode(b);
  if(mode === 'o'){
    if(rise > 0 && local < rise) return lerp(closed, open, local/rise);
    return open;
  }
  if(mode === 'c'){
    if(fall > 0 && local < fall) return lerp(open, closed, local/fall);
    return closed;
  }
  if(mode === 'co'){
    if(fall > 0 && local < fall) return lerp(open, closed, local/fall);
    const rstart = b.dur - rise;
    if(rise > 0 && local >= rstart) return lerp(closed, open, (local - rstart)/rise);
    return closed;
  }
  /* 'oc' — today's shape, unchanged */
  if(rise > 0 && local < rise) return lerp(closed, open, local/rise);
  if(fall > 0 && local > b.dur - fall) return lerp(open, closed, (local - (b.dur-fall))/fall);
  return open;
}
/* what a dropped-in sequence commands at time t: the frame it is inside */
function blockSeqTargetsAt(b, t){
  const ref = BLKH.sequences().find(x=>x.name === b.ref);
  if(!ref || t < b.t0 || t > b.t0 + b.dur) return null;
  let at = b.t0;
  for(const f of ref.frames){
    if(t >= at && t <= at + f.duration) return f.targets;
    at += f.duration;
  }
  return ref.frames.length ? ref.frames[ref.frames.length-1].targets : null;
}

function blockCompile(seq){
  if(!blockIsRoutine(seq) || !BLKH.loaded()) return seq ? seq.frames : [];
  const chans = BLKH.servoChannels();
  const base = {};
  chans.forEach(c=>{ base[c.i] = blockClosed(c); });

  const bounds = blockBoundaries(seq);
  const total = blockEndCompiled(seq);      // v1.46.0 — an unwired brick must not stretch the frame list
  if(!bounds.length || total <= 0){
    /* an empty routine still has to emit ONE frame, or the subroutine
       numbering stops lining up with the sketch */
    const t = []; chans.forEach(c=>{ t[c.i] = base[c.i]; });
    return [{name:'home', duration:200, targets:t}];
  }
  if(bounds[bounds.length-1] < total) bounds.push(total);

  /* a channel's value CARRIES between frames (Mike, 2026-08-14 — the MOTION
     modes need it: a brick left open by 'o'/'co' must still be open at the
     NEXT boundary, not snapped shut just because nothing covers it there
     any more). `last` starts at base-closed once, each interval's targets
     start from it rather than from base, covering bricks are applied on
     top exactly as before, and `last` is updated from the result. An
     'oc'-only routine always resolves every covered channel to base-closed
     by the end of its own covering interval (that shape never leaves
     anything open), so `last` is always base-closed the moment a channel
     goes uncovered there too — this compiles byte-for-byte the same as
     reading straight from `base` did (proved in a node harness, see the
     handover). */
  const last = {};
  chans.forEach(c=>{ last[c.i] = base[c.i]; });

  const frames = [];
  for(let i=0;i<bounds.length;i++){
    const t = bounds[i];
    const next = (i+1 < bounds.length) ? bounds[i+1] : t + 200;
    const targets = [];
    chans.forEach(c=>{ targets[c.i] = last[c.i]; });
    /* A frame COMMANDS its targets and then waits its duration, so the pose
       a frame carries is where the droid should be when that frame ENDS —
       not where it starts. Sampling at `t` put every ramp one whole interval
       late, which is why an "Opens in 3 s" brick spent its first three
       seconds shut (Mike, 2026-08-12). Act bricks are therefore read at the
       END of the interval; a nested sequence is read at its MIDDLE, which
       names the sub-frame covering this interval without the ambiguity of
       landing exactly on one of its own boundaries. */
    const mid = t + (next - t)/2;
    /* later blocks win, so a deliberate overlap behaves like a layer */
    blockList(seq).forEach(b=>{
      if(b.kind === 'seq'){
        const tg = blockSeqTargetsAt(b, mid);
        if(tg) chans.forEach(c=>{ if(tg[c.i]) targets[c.i] = tg[c.i]; });
      }else{
        const v = blockValueAt(b, next);
        const c = blockChan(b.ref);
        if(v !== null && c) targets[c.i] = v;
      }
    });
    chans.forEach(c=>{ last[c.i] = targets[c.i]; });
    frames.push({name:'t'+Math.round(t), duration:Math.max(0, Math.round(next - t)), targets});
  }
  /* land on the home pose so the close is real and not a delta artefact */
  const home = []; chans.forEach(c=>{ home[c.i] = base[c.i]; });
  frames.push({name:'home', duration:200, targets:home});
  return frames;
}

/* recompile and push into everything that reads frames */
function blockSync(seq){
  if(!blockIsRoutine(seq)) return;
  seq.frames = blockCompile(seq);
  BLKH.changed();
}

/* ---------------------------------------------------- ready-made shapes
   Mike: "support creating simple actions, such as wave sequences, and
   adding them to the reusable sequence library." */
const BLOCK_SHAPES = [
  {id:'wave',      label:'Wave',      hint:'one after another, opening in turn'},
  {id:'mexwave',   label:'Mexican wave', hint:'a smooth wave travelling round the ring — each part rises as its neighbour peaks, in physical order'},
  {id:'chase',     label:'Chase',     hint:'a tighter wave — each opens as the last is closing'},
  {id:'alternate', label:'Alternate', hint:'odds, then evens'},
  {id:'together',  label:'All at once', hint:'everything opens and closes as one'},
  {id:'breathe',   label:'Breathe',   hint:'the whole set swells gently in and out, like breathing — four slow cycles at a fifth of the travel'}
];
/* physical ring order for a set of actuators. pieN and panelN are numbered
   by position round the droid (that is the whole point of the sim's own
   IDs), so the trailing number IS the ring — a Mexican wave that ran in
   CHANNEL order would jump about the dome. */
function blockRingOrder(members){
  const num = a => { const m = /(\d+)$/.exec(a); return m ? +m[1] : 999; };
  return members.slice().sort((a,b)=>num(a)-num(b) || a.localeCompare(b));
}
function blockMakeShape(seq, shape, members, step){
  if(!seq || !members.length) return;
  step = step || 260;
  const t0 = blockEnd(seq);
  if(shape === 'mexwave'){
    /* the crowd wave: each part is a smooth rise-and-fall bell (ramps meet
       in the middle, no hold), starting a third of a bell after its ring
       neighbour, so two or three parts are always mid-air */
    const ring = blockRingOrder(members);
    const dur = 1500, lag = 500;
    ring.forEach((act, i)=>{
      blockAdd(seq, 'act', act, t0 + i*lag, {dur, rise:dur/2, fall:dur/2});
    });
    blockSync(seq);
    return;
  }
  if(shape === 'breathe'){
    /* gentle in-out: everything together, four slow cycles, only a fifth of
       the travel — ramps meet in the middle so the motion never sits still,
       which is what makes it read as breathing */
    const cycle = 3000, cycles = 4, amp = 0.22;
    for(let k=0; k<cycles; k++){
      members.forEach(act=>{
        blockAdd(seq, 'act', act, t0 + k*cycle, {dur:cycle, rise:cycle/2, fall:cycle/2, amp});
      });
    }
    blockSync(seq);
    return;
  }
  members.forEach((act, i)=>{
    let at = t0, dur = BLK_DEFAULTS.dur;
    if(shape === 'wave')       at = t0 + i*step;
    else if(shape === 'chase'){ at = t0 + i*step; dur = step*2; }
    else if(shape === 'alternate') at = t0 + (i%2)*step*2;
    blockAdd(seq, 'act', act, at, {dur});
  });
  blockSync(seq);
}

/* ---------------------------------------------------------------- explode
   Mike, 2026-08-14: "imported routines when placed on the timeline should
   be expanded into each servo's block so they can be edited, not just a
   single block." A dropped-in "seq" brick plays a library sequence's
   frames wholesale but is opaque — one brick, nothing to drag or retime.
   blockExplode reads the referenced sequence's own FRAMES — one absolute
   pose per channel, sparse, 0/undefined meaning "leave this channel
   alone" (applyFrameTargets' rule, playback.js) — and turns each
   channel's activity into its own act brick, one per contiguous span
   above ~0, shaped the way blockAdd would have made it by hand.

   Pure and read-only: it touches no seq and takes no undo snapshot of its
   own. The caller (the timeline drop handler, the library card's Insert)
   adds the returned bricks and takes the ONE snapshot for the whole
   gesture — same contract as blockMakeShape. */
const BLK_EXPLODE_EPS  = 0.05;   // "leaves ~0" — the same floor blockAdd's own amp uses
const BLK_EXPLODE_NEAR = 0.02;   // "~max" — how close a ramp's peak breakpoint has to land
/* a raw target's value, 0..1, against THIS channel's own closed→open
   throw — the exact span blockValueAt's amp is measured against. NOT
   chanNorm (playback.js): that answers a different question, "where is
   this on the MODEL", against the channel's whole min→max travel, and a
   brick's amp feeds straight back into blockValueAt's raw-target maths,
   which is measured from `home` and is not necessarily that whole span.
   (v1.46.0: this used to say chanNorm "folds in invert, a DISPLAY-only
   concern". There is no invert any more — min is the shut end and max the
   open one, whatever their order. Nothing here needs to change for that,
   and nothing here may call chanNorm: this file is shared with PCA Studio,
   which does not load playback.js.) */
function blockChanFrac(c, v){
  const closed = blockClosed(c), open = blockOpen(c);
  if(open === closed) return 0;
  return clamp((v - closed) / (open - closed), 0, 1);
}
function blockExplode(refName, t0){
  const out = {bricks:[], leftover:0};
  const ref = BLKH.sequences().find(s=>s.name === refName);
  if(!ref || !ref.frames || !ref.frames.length) return out;
  const at = Math.max(0, Math.round(t0||0));

  BLKH.servoChannels().forEach(c=>{
    /* the value-over-time curve for this one channel: a breakpoint per
       frame boundary, carried forward exactly like a sparse frame list is
       read everywhere else — a frame that does not set this channel
       leaves it at whatever it already was */
    const pts = [{t:0, v:0}];
    let last = 0, t = 0;
    ref.frames.forEach(f=>{
      t += f.duration;
      const raw = f.targets ? f.targets[c.i] : undefined;
      if(raw) last = blockChanFrac(c, raw);
      pts.push({t, v:last});
    });

    let hadSpan = false, inSpan = false, spanPts = [];
    const emit = (openEnd)=>{
      hadSpan = true;
      if(!c.act) return;                 // no part to put a brick on — counted once, below
      const max = spanPts.reduce((m,p)=>Math.max(m,p.v), 0);
      const thresh = max - BLK_EXPLODE_NEAR;
      let first=null, lastAt=null;
      spanPts.forEach(p=>{ if(p.v >= thresh){ if(first===null) first=p.t; lastAt=p.t; } });
      const start = spanPts[0].t, end = spanPts[spanPts.length-1].t;
      const brick = {
        ref: c.act,
        t0: Math.round(at + start),
        dur: Math.max(1, Math.round(end - start)),
        rise: Math.max(0, Math.round(first - start)),
        fall: Math.max(0, Math.round(end - lastAt))
      };
      const amp = Math.round(max*100)/100;
      if(amp < 0.99) brick.amp = amp;
      if(openEnd) brick.mode = 'o';       // still open when the sequence ends
      out.bricks.push(brick);
    };
    for(let i=0;i<pts.length-1;i++){
      const a = pts[i], b = pts[i+1];
      if(!inSpan && a.v <= BLK_EXPLODE_EPS && b.v > BLK_EXPLODE_EPS){
        const frac = (BLK_EXPLODE_EPS - a.v) / (b.v - a.v);
        inSpan = true;
        spanPts = [{t: a.t + frac*(b.t-a.t), v:BLK_EXPLODE_EPS}];
      }
      if(inSpan && a.v > BLK_EXPLODE_EPS && b.v <= BLK_EXPLODE_EPS){
        const frac = (a.v - BLK_EXPLODE_EPS) / (a.v - b.v);
        spanPts.push({t: a.t + frac*(b.t-a.t), v:BLK_EXPLODE_EPS});
        emit(false);
        inSpan = false; spanPts = [];
        continue;
      }
      if(inSpan) spanPts.push({t:b.t, v:b.v});
    }
    if(inSpan) emit(true);
    if(hadSpan && !c.act) out.leftover++;      // one count per CHANNEL, not per span
  });
  return out;
}

/* ------------------------------------------------------- routine speed
   Rescale the whole routine — every brick's start, length and ramps — by
   one factor. f = 0.8 plays faster, f = 1.25 slower. Destructive on
   purpose: the timeline you see IS the timing that exports, and the
   imported-speed floors still apply on compile, so a routine can be asked
   to go faster than the servos allow but the preview and the board will
   both refuse together. */
function blockScaleTime(seq, f){
  if(!blockIsRoutine(seq) || !(f > 0)) return 0;
  /* destructive by design, so it snapshots itself — every caller (the
     toolbar buttons, a test) gets an undo step without asking */
  const before = blockHistCapture(seq);
  blockList(seq).forEach(b=>{
    b.t0   = Math.max(0,   Math.round(b.t0  *f/10)*10);
    b.dur  = Math.max(120, Math.round(b.dur *f/10)*10);
    b.rise = Math.max(0,   Math.round(b.rise*f/10)*10);
    b.fall = Math.max(0,   Math.round(b.fall*f/10)*10);
  });
  blockHistCommit(seq, before);
  blockSync(seq);
  return blockEnd(seq);
}

/* save the routine into the library under a name of its own */
function blockSaveAs(seq, name){
  if(!seq || !name) return null;
  const copy = {
    name: name,
    frames: JSON.parse(JSON.stringify(seq.frames)),
    blocks: JSON.parse(JSON.stringify(blockList(seq)))
  };
  const lib = BLKH.sequences();
  const at = lib.findIndex(s=>s.name === name);
  if(at >= 0) lib[at] = copy; else lib.push(copy);
  BLKH.changed();
  BLKH.log('mae','saved to the library: '+name+'  ('+copy.frames.length+' frames, '+copy.blocks.length+' blocks)');
  return copy;
}
/* start a fresh, empty routine */
function blockNewRoutine(name){
  const lib = BLKH.sequences();
  const n = name || ('Sequence '+(lib.length+1));
  const seq = {name:n, frames:[], blocks:[]};
  lib.push(seq);
  blockSync(seq);
  BLKH.changed();
  return lib.length - 1;
}
/* an imported frame-list sequence can be adopted into the block world by
   giving it an empty routine — its frames are kept until you drop a brick */
function blockAdopt(seq){
  if(!seq || seq.blocks) return;
  seq.blocks = [];
}

/* ------------------------------------------------------------ undo/redo
   M6 of the UI overhaul (review F10): deleting a brick, dragging one
   somewhere wrong, resizing, an inspector edit and the deliberately-
   destructive − Slower / + Faster were all irreversible. "Ctrl+Z is the
   difference between experimenting freely and moving carefully."

   SNAPSHOT-based, not command-based, because it can be: blockCompile()
   regenerates the frames from the blocks on every edit, so the `blocks`
   array IS the whole editable state of a routine — everything else the
   compiler reads (the channel table, referenced library sequences) is
   deliberately not ours to touch. A snapshot is one deep copy of that
   array, taken ONCE per completed user gesture (pointerup after a drag,
   an inspector commit, an add/delete/duplicate, a ready-made insert,
   Slower/Faster, Snap to beats) — never per mousemove.

   The history follows the routine being EDITED and resets when that
   routine changes: BLKHIST.seq is compared by object identity, so
   opening another routine (or replacing this one via save-over) starts a
   fresh history rather than replaying one routine's past into another.
   Hand-made frame lists (no `blocks` array — HANDOVER §3) have no
   history BY DESIGN: undo there is a disabled button and a no-op.
   Nothing in here reads or writes MSTR.loadout or MSTR.channels — the
   library is not the board, and undo must not become a back door. */
const BLKHIST = { seq:null, undo:[], redo:[], depth:20 };
function blockHistReset(seq){
  BLKHIST.seq = seq || null;
  BLKHIST.undo.length = 0;
  BLKHIST.redo.length = 0;
}
/* a deep copy of the routine's editable state, or null for a frame list */
function blockHistCapture(seq){
  return blockIsRoutine(seq) ? JSON.parse(JSON.stringify(seq.blocks)) : null;
}
function blkHistSame(seq){ if(BLKHIST.seq !== seq) blockHistReset(seq); }
function blkHistStore(seq, snap){
  blkHistSame(seq);
  BLKHIST.undo.push(snap);
  while(BLKHIST.undo.length > BLKHIST.depth) BLKHIST.undo.shift();   // drop the oldest
  BLKHIST.redo.length = 0;                    // a new edit forks history — redo dies
}
/* BEFORE an atomic gesture (add, delete, duplicate, ready-made, restore) */
function blockHistPush(seq){
  if(!blockIsRoutine(seq)) return;
  blkHistStore(seq, blockHistCapture(seq));
}
/* AFTER a continuous gesture (drag, resize, a slider), given the copy that
   was captured when the gesture STARTED — a gesture that changed nothing
   (a plain click on a brick) records nothing */
function blockHistCommit(seq, before){
  if(!blockIsRoutine(seq) || !before) return;
  if(JSON.stringify(before) === JSON.stringify(seq.blocks)) return;
  blkHistStore(seq, before);
}
function blockCanUndo(seq){ return !!(blockIsRoutine(seq) && BLKHIST.seq === seq && BLKHIST.undo.length); }
function blockCanRedo(seq){ return !!(blockIsRoutine(seq) && BLKHIST.seq === seq && BLKHIST.redo.length); }
function blockUndo(seq){
  if(!blockCanUndo(seq)) return false;
  BLKHIST.redo.push(blockHistCapture(seq));
  seq.blocks = BLKHIST.undo.pop();
  blockSync(seq);                             // frames regenerate from the blocks
  return true;
}
function blockRedo(seq){
  if(!blockCanRedo(seq)) return false;
  BLKHIST.undo.push(blockHistCapture(seq));
  seq.blocks = BLKHIST.redo.pop();
  blockSync(seq);
  return true;
}

/* ------------------------------------------------------------- snapping
   Where a dragged brick wants to land. Two families of candidate:

     EDGES  the start and end of every OTHER brick — either aligned with a
            neighbour (same t0) or butted against it (start where it ends).
     BEATS  the musical grid, when a track is loaded, filtered by the snap
            mode the user picked (auto / strong / all / off).

   The threshold is given in ms by the caller (a fixed number of PIXELS at
   the current zoom, so snapping feels the same at every scale). The brick
   stays freely draggable — a candidate only wins while the pointer is
   within the threshold of it. */
function blockEdgeTimes(seq, exceptId){
  const out = [];
  blockList(seq).forEach(b=>{
    if(b.id === exceptId) return;
    out.push({t:b.t0,        kind:'edge', label:'aligned with '+(b.kind==='seq'?b.ref:blkLabel(b.ref))});
    out.push({t:b.t0+b.dur,  kind:'edge', label:'after '+(b.kind==='seq'?b.ref:blkLabel(b.ref))});
  });
  return out;
}
function blockSnapResolve(ms, seq, exceptId, thresholdMs){
  const th = thresholdMs || 80;
  const cands = blockEdgeTimes(seq, exceptId);
  const mode = (typeof BLK !== 'undefined' && BLK.snapMode) || 'auto';
  if(mode !== 'off'){
    BLKH.musicBeats(mode).forEach(b=>{
      cands.push({t:Math.round(b.t*1000), kind:b.strong?'strong':'beat',
                  label:(b.strong?'bar ':'beat ')+b.n});
    });
  }
  let best = null;
  for(const c of cands){
    const d = Math.abs(c.t - ms);
    if(d > th) continue;
    const bd = best ? Math.abs(best.t - ms) : Infinity;
    /* ties go to the MUSICAL candidate — in a beat-snap mode the user asked
       for the grid, and "beat 4" is a better answer than "after Pie 2" */
    if(d < bd || (d === bd && best.kind === 'edge' && c.kind !== 'edge')) best = c;
  }
  if(best) return {t:Math.max(0, best.t), kind:best.kind, label:best.label};
  if(mode === 'off') return {t:Math.max(0, Math.round(ms/10)*10), kind:'free', label:''};
  return {t:Math.max(0, Math.round(ms/50)*50), kind:'grid', label:''};
}
/* snap every brick's start to the beat grid — the block-world equivalent of
   musicSnapSequence(). Returns how many bricks moved. */
function blockSnapToBeats(seq){
  if(!blockIsRoutine(seq) || !BLKH.musicLoaded()) return 0;
  const mode = (typeof BLK !== 'undefined' && BLK.snapMode) || 'auto';
  const beats = BLKH.musicBeats(mode === 'off' ? 'all' : mode).map(b=>Math.round(b.t*1000));
  if(!beats.length) return 0;
  const before = blockHistCapture(seq);      // one gesture, one undo step
  let moved = 0;
  blockList(seq).forEach(b=>{
    let best = beats[0];
    for(const t of beats) if(Math.abs(t - b.t0) < Math.abs(best - b.t0)) best = t;
    if(best !== b.t0){ b.t0 = best; moved++; }
  });
  if(moved){ blockHistCommit(seq, before); blockSync(seq); }
  return moved;
}

/* --------------------------------------------------------- the playhead
   The pose of the routine at one instant, for scrubbing.

   A ROUTINE is read from its bricks, not from its compiled frames. The
   frames are a quantised rendering of the bricks — steps of up to
   BLK_RAMP_STEP_MS, each carrying the pose at its END — so walking them
   lands the playhead up to one step out, and at ms=0 it would apply the
   first step's pose rather than the closed one. The bricks are the exact,
   continuous answer, and they are what the timeline draws, so scrubbing
   agrees with the picture by construction.

   A plain imported sequence has no bricks: frames are all there is. Those
   are absolute but SPARSE (0 = leave the channel alone), so walk them from
   the start applying each in turn — by the time we reach ms every channel
   holds what the board would be holding. */
function blockPoseAt(seq, ms){
  if(!seq) return;
  if(blockIsRoutine(seq)){
    const chans = BLKH.servoChannels();
    const targets = [];
    chans.forEach(c=>{ targets[c.i] = blockClosed(c); });
    blockList(seq).forEach(b=>{
      if(b.kind === 'seq'){
        const tg = blockSeqTargetsAt(b, ms);
        if(tg) chans.forEach(c=>{ if(tg[c.i]) targets[c.i] = tg[c.i]; });
      }else{
        const v = blockValueAt(b, ms);
        const c = blockChan(b.ref);
        if(v !== null && c) targets[c.i] = v;
      }
    });
    BLKH.applyPose(targets);
    return;
  }
  if(!seq.frames || !seq.frames.length) return;
  let at = 0;
  for(const f of seq.frames){
    BLKH.applyPose(f.targets);
    at += f.duration;
    if(at > ms) break;
  }
}
