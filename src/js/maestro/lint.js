'use strict';
/* =====================================================================
   MAESTRO LINT

   Every rule in this file was paid for on Mike's own bench on 2026-07-29,
   working a real Mini Maestro 18 out of a dome. They are the difference
   between a settings file that looks right in Control Center and one that
   actually does something when the Mega sends restartScript(n).

   The four that cost the most time, in order:

     1. A script that is nothing but subroutines FALLS THROUGH. With no
        top-level code the program counter starts at 0, runs into the first
        subroutine's body, and hits its `return` with an empty call stack —
        error 0x0080, "Subroutine call overflow/underflow". One bare `quit`
        above the first `sub` fixes it. See scriptTraps().

     2. "Copy Sequence to Script" (singular) wraps ONE sequence in
        `begin … repeat` and declares no subroutine for it, so
        restartScript(0) lands on the first frame_* helper and underflows.
        The other sequences never reach the board at all.

     3. `acceleration` is the binding constraint, not `speed`. At speed 80
        / accel 10 a full throw is ~940 ms, not the ~344 ms that speed alone
        suggests, because the servo spends the whole move accelerating and
        decelerating. Frames sized off `speed` come out visibly short.

     4. A channel that is re-targeted before it has ARRIVED never completes
        its travel. Staggered opens are fine — a target persists, so a panel
        keeps travelling after its frame ends — but anything that reverses a
        channel (a wave) must leave it a full throw's worth of time.

   Pure functions. No DOM, no globals written. lintMaestro() is safe to call
   as often as the UI likes.
   ===================================================================== */

/* The travel model lives in travel.js — it is shared with PCA Studio,
   which needs the same physical floor on a brick's ramps. */
function chanFullThrowMs(c){ return chanTravelMs(c, (c.max||0) - (c.min||0)); }

/* The slowest full throw on the board — the number to size a reversing
   frame (a wave step) against. */
function boardSlowestThrowMs(){
  let worst = 0;
  MSTR.channels.forEach(c=>{ if(/^servo/i.test(c.mode)) worst = Math.max(worst, chanFullThrowMs(c)); });
  return worst;
}

/* ------------------------------------------------- per-sequence timing
   Walks a sequence keeping, per channel, the MOVE it is in the middle of:
   where it set off from, which way it is going, and how long ago it set
   off. Flags a channel sent BACK THE OTHER WAY before that move can have
   finished — a reversal is the one re-target that throws travel away.
   Returns [] when the sequence is clean.

   A RUN OF SAME-DIRECTION RE-TARGETS IS ONE MOVE (v1.78.0, review M9b).
   This rule used to compare every re-target against the travel time of
   the step from the PREVIOUS target, from rest — and a compiled ramp is a
   staircase that re-targets before each step has arrived BY DESIGN
   (blocks.js, "how a ramp is drawn"): the board carries the servo's speed
   across the re-targets, so the horn crosses the whole ramp at a steady
   rate and lands on time. Judged step by step from rest, one plain 'oc'
   brick at Mike's 80/10 (accel-dominated, 939 ms a full throw) drew three
   timing warnings on a routine that arrives exactly when the brick says,
   and every brick on his channels did the same — the real ones (a wave
   that turns a panel round at 250 ms) were buried under them. So a run of
   re-targets in one direction is judged ONCE, when something reverses it:
   the run's whole travel, from the target it set off from to the last one
   it was given, against the time from its first command to the reversal.
   The sequence's END closes nothing — a target persists, so a panel keeps
   travelling after its last frame (rule 4 above).

   WHERE THE FIRST MOVE SETS OFF FROM. A compiled routine starts every
   channel at base-closed — blockCompile's `base`, and its home frame puts
   it back there — so that is the origin, and the first step of a ramp is
   a move in a known direction. A plain frame list starts wherever the
   channel rests: its home, when that lies inside its endpoints (the live
   dome's channels rest on their home = min even with homemode Off, and a
   Goto channel is put there by the board). A home outside the endpoints
   is already the chan-home warning; there the first command has no
   direction and the first re-target simply starts a run. */
function seqTimingIssues(seq){
  const out = [];
  if(!seq || !seq.frames) return out;
  const byIndex = {};
  MSTR.channels.forEach(c=>{ byIndex[c.i] = c; });
  const isRoutine = typeof blockIsRoutine === 'function' && blockIsRoutine(seq);
  const origin = c=>{
    if(isRoutine) return (typeof blockClosed === 'function') ? blockClosed(c) : c.min;
    const lo = Math.min(c.min, c.max), hi = Math.max(c.min, c.max);
    return (c.home >= lo && c.home <= hi) ? c.home : null;
  };
  const sign = d => d > 0 ? 1 : d < 0 ? -1 : 0;
  const run = {};                        // ch -> {target, from, dir, sinceMs}
  seq.frames.forEach((fr, fi)=>{
    (fr.targets || []).forEach((t, ch)=>{
      if(!t) return;                     // 0 = this frame does not drive the channel
      const c = byIndex[ch];
      if(!c || !/^servo/i.test(c.mode)) return;
      const r = run[ch];
      if(!r){
        /* the first command: a move from wherever the channel rests, when
           we know where that is; otherwise a target with no direction yet */
        const o = origin(c);
        const dir = (o === null) ? 0 : sign(t - o);
        run[ch] = { target:t, from:(o === null ? t : o), dir, sinceMs:0 };
        return;
      }
      if(t === r.target) return;         /* the same target again — a hold frame restating it — is not a move, and does not restart the clock */
      const dir = sign(t - r.target);
      if(r.dir === dir){ r.target = t; return; }      /* same way on: the run grows, the clock keeps counting */
      if(r.dir !== 0){
        /* a REVERSAL: the run it cuts short must have had time to finish */
        const need = chanTravelMs(c, r.target - r.from);
        if(r.sinceMs + 0.5 < need){
          out.push({ frame:fi, frameName:fr.name, ch, name:c.name,
                     had:Math.round(r.sinceMs), need:Math.round(need) });
        }
      }
      run[ch] = { target:t, from:r.target, dir, sinceMs:0 };
    });
    Object.keys(run).forEach(k=>{ run[k].sinceMs += (fr.duration || 0); });
  });
  return out;
}

/* ------------------------------------------------------- script traps
   Reads a raw script the way the board will, not the way it looks. */
function scriptTraps(text){
  const src = String(text || '');
  const noComments = src.split('\n').map(l=>{ const i=l.indexOf('#'); return i>=0 ? l.slice(0,i) : l; }).join('\n');
  /* everything before the first `sub` is the main program */
  const firstSub = noComments.search(/(^|\s)sub\s/);
  const main = (firstSub >= 0 ? noComments.slice(0, firstSub) : noComments);
  const mainToks = main.split(/\s+/).filter(Boolean);
  const subNames = [];
  const re = /(?:^|\s)sub\s+(\S+)/g; let m;
  while((m = re.exec(noComments))) subNames.push(m[1]);
  return {
    hasCode:   mainToks.length > 0,
    hasQuit:   mainToks.some(t=>t.toLowerCase() === 'quit'),
    hasLoop:   mainToks.some(t=>t.toLowerCase() === 'begin') || mainToks.some(t=>t.toLowerCase() === 'repeat'),
    subs:      subNames,
    seqSubs:   subNames.filter(n=>!/^frame_/i.test(n)),
    frameSubs: subNames.filter(n=>/^frame_/i.test(n))
  };
}

/* ============================================================ THE REPORT
   Levels: 'err'  this will not work on the board
           'warn' it will run, but not the way you meant
           'note' worth knowing */
function lintMaestro(opts){
  const o = opts || {};
  const out = [];
  /* `ch` is optional and is the channel the item is ABOUT, when it is about
     exactly one. It is not decoration: the builder's validate panel hangs
     its "Fix channel N" button off it, and a report line that names a
     channel in prose but not in a field is a line nothing can act on.

     `slot` is the same idea for the OTHER thing a line can be about
     (v1.70.1): the loadout position restartScript(n) hits. It is worth
     having for exactly the reason `ch` was — the panel that shows this
     report is one door away from the list you would go and reorder, and a
     line that names slot 8 in prose only is a line nothing can hang a
     "show me slot 8" button off. It is data here and nothing consumes it
     yet: builder.js's bldAddFixChannel() is the shape a bldAddFixSlot()
     would take, and that file is not this change's to touch. */
  const add = (level, code, msg, fix, ch, slot)=>{
    const it = {level, code, msg, fix:fix||''};
    if(typeof ch === 'number') it.ch = ch;
    if(typeof slot === 'number') it.slot = slot;
    out.push(it);
  };
  if(!MSTR.loaded){ return { items:out, stats:{}, counts:{err:0,warn:0,note:0} }; }

  const bd     = boardById(MSTR.board);
  const servos = MSTR.channels.filter(c=>/^servo/i.test(c.mode));
  const byIndex= {}; MSTR.channels.forEach(c=>{ byIndex[c.i]=c; });
  /* which droid this file is for — it decides the script rules below and,
     since v1.78.0, whether a reversed pair is worth a word at all */
  const isPca = typeof boardIsPca === 'function' && boardIsPca(MSTR.board);

  /* ---------------------------------------------------------- channels */
  const seen = {};
  servos.forEach(c=>{
    const k = c.autoName ? '' : (c.name||'').trim().toLowerCase();
    if(!k){
      add('warn','chan-blank','Channel '+c.i+' is a servo with no name.',
          'Name it in Control Center — the name is what the part matcher reads.', c.i);
      return;
    }
    (seen[k] = seen[k] || []).push(c.i);
  });
  Object.keys(seen).forEach(k=>{
    if(seen[k].length > 1){
      const chs = seen[k];
      add('err','chan-dup','Channels '+chs.join(' and ')+' are both named "'+byIndex[chs[0]].name+'".',
          'Two channels with one name is ambiguous everywhere — the wiring sheet, the part map and any sequence you write by name. Rename one.',
          chs[0]);
    }
  });
  servos.forEach(c=>{
    /* A REVERSED PAIR IS NOT AN ERROR (v1.78.0, review M9a). This rule read
       `min >= max` and called it one — "Fix the endpoints in Control Center
       before running anything" — while the bench RECORDS a reversed linkage
       by swapping min and max (the REV tick, setup-hw-channels.js; it is
       the one convention, see playback.js chanEnds) and every reader takes
       Math.min/Math.max of the pair. So a droid with one panel wired the
       other way round exported with "Written with N validation errors
       outstanding" on every file and an export button relabelled "Export
       anyway", for a channel that was set up exactly as the app asked.
       min === max is still an error: that channel has no travel at all.
       min > max on a Pololu build is a WARNING, because the pair goes to
       the file as stored and Control Center's own editor wants min <= max
       — the file loads, it just reads oddly in there. On a PCA9685 build
       there is no Control Center and the firmware sorts the pair itself
       (MaestroPCA.cpp setTarget), so there is nothing to say. */
    if(c.min === c.max)
      add('err','chan-range','Channel '+c.i+' ('+c.name+') has min and max both at '+c.min+' — no travel at all.',
          'Fix the endpoints in Control Center (or the bench) before running anything.', c.i);
    else if(c.min > c.max && !isPca)
      add('warn','chan-rev','Channel '+c.i+' ('+c.name+') is reversed: min '+c.min+' is above max '+c.max+'.',
          'That is how the bench records a linkage that runs the other way, and the file carries the pair exactly as '
          + 'stored — the board and the sim both take the lower number as the low end, so it plays correctly. '
          + 'Control Center\'s own channel editor expects min <= max, so the row reads oddly there; nothing to fix unless you edit it in Control Center.', c.i);
    // v1.39.5: home=0 on an Off channel is the file format, not a mistake — match pcaHomeQus
    if(!/off|ignore/i.test(c.homemode||'') && (c.home < Math.min(c.min,c.max) || c.home > Math.max(c.min,c.max)))
      add('warn','chan-home','Channel '+c.i+' ('+c.name+') has home '+c.home+' outside its '+c.min+'-'+c.max+' range.','', c.i);
  });

  /* homemode=Off means limp at power-up: SOMETHING has to write every
     channel or the droid boots with no targets at all. */
  const offs = servos.filter(c=>/^off$/i.test(c.homemode||''));
  if(offs.length){
    const seqs = MSTR.sequences || [];
    const covers = seqs.some(s=>(s.frames||[]).some(f=>offs.every(c=>(f.targets||[])[c.i])));
    if(!covers)
      add('warn','no-home','All '+offs.length+' servo channel(s) have homemode="Off", so they are limp at power-up — and no single frame writes all of them.',
          'Add a home sequence whose first frame drives every channel, and fire it once after power-on. Without it the droid boots with no targets and the first script it runs starts from wherever the panels were left.');
    else
      add('note','home-ok','homemode="Off" throughout — servos are limp until a script runs, and one sequence does write every channel. Fire that one first after power-up.','');
  }

  /* ---------------------------------------------------- sequence targets
     ONE LINE PER (CHANNEL, RULE), NOT ONE PER FRAME (v1.69.0). A walkthrough
     of the builder's validate panel read "ERRORS 129" where 129 was one
     channel with limits nobody had updated, restated once for every frame
     that touched it. That is not a report, it is a wall — the nine warnings
     underneath it were unreachable, and the one fact a reader needs (WHICH
     CHANNEL) was buried in prose repeated 129 times.

     The grouping lives HERE rather than in the panel that showed it because
     the report has four consumers — the builder's step 3, the job wizard's
     review step, exportLintNote() on both export doors, and counts.err,
     which is what decides the export button's own label. Collapsing in one
     view would have left the other three counting frames and calling them
     errors. The frame count is not lost, it moves into the line and into
     the item's own `n`, so nothing that wants the raw figure has to go
     looking for it. stats.outOfRange / stats.onNonServo still count FRAMES,
     as they always did; items now count PROBLEMS. */
  let outOfRange = 0, onNonServo = 0, emptyFrames = 0;
  const tgtGroups = [];                  /* in first-seen order, for stable output */
  const tgtByKey  = {};
  const tgtHit = (code, ch, seqName, t)=>{
    const k = code + ':' + ch;
    let g = tgtByKey[k];
    if(!g){ g = tgtByKey[k] = {code, ch, n:0, seqs:[], worst:t}; tgtGroups.push(g); }
    g.n++;
    if(g.seqs.indexOf(seqName) < 0) g.seqs.push(seqName);
    /* the furthest offender is the one worth quoting — a target 30 qus over
       is a rounding argument, one 3000 over is a panel through the shell */
    const c = byIndex[ch];
    if(c && Math.abs(t - c.home) > Math.abs(g.worst - c.home)) g.worst = t;
  };
  (MSTR.sequences||[]).forEach(seq=>{
    (seq.frames||[]).forEach(fr=>{
      let driven = 0;
      (fr.targets||[]).forEach((t,ch)=>{
        if(!t) return;
        driven++;
        const c = byIndex[ch];
        if(!c) return;
        if(!/^servo/i.test(c.mode)){
          onNonServo++;
          tgtHit('tgt-mode', ch, seq.name, t);
          return;
        }
        if(t < Math.min(c.min,c.max) || t > Math.max(c.min,c.max)){
          outOfRange++;
          tgtHit('tgt-range', ch, seq.name, t);
        }
      });
      if(!driven) emptyFrames++;
    });
  });
  /* the routines behind a group, named — a count on its own tells you the
     size of the problem but not where to go and edit it */
  const namesOf = g => g.seqs.slice(0,4).map(n=>'"'+n+'"').join(', ')
                     + (g.seqs.length > 4 ? ' and '+(g.seqs.length-4)+' more' : '');
  tgtGroups.forEach(g=>{
    const c = byIndex[g.ch];
    const where = 'channel '+g.ch+' ('+c.name+')';
    const many  = g.n + ' frame' + (g.n===1?'':'s');
    if(g.code === 'tgt-mode')
      add('err','tgt-mode', many+' drive '+where+', which is set to '+c.mode+'.',
          'A non-Servo channel emits no pulses, so nothing moves. Switch it to Servo, or take it out of '
          + namesOf(g) + '.', g.ch);
    else
      add('err','tgt-range', many+' send '+where+' outside its '+c.min+'-'+c.max+' limits — the furthest is '+g.worst+'.',
          'The board clamps them, so the pose you see in the sim is not the pose you get. In '
          + namesOf(g) + '. Either widen the channel\'s endpoints or bring the targets inside them.', g.ch);
    out[out.length-1].n = g.n;
  });
  if(emptyFrames)
    add('note','frame-empty',emptyFrames+' frame(s) drive no channel at all — those compile to a bare delay.','');

  /* ============ A CHANNEL SWITCHED OFF MID-SEQUENCE (v1.77.0, review H7)
     A frame target of 0 means two different things to the two droids. The
     sim reads it as "leave this channel alone" (applyFrameTargets,
     playback.js), and so did every rule above (`if(!t) return`). The board
     reads it as a TARGET: 0 is the Maestro's own "stop sending pulses", and
     export.js's genSeqBody emits a target whenever a channel's value differs
     from the frame before — so a change-only frame list plays perfectly on
     the model and goes limp on the bench at the first keyframe that does not
     name the channel. A strings-only puppet take used to be exactly that
     list (the recorder densifies it now, input/puppet.js); this rule is for
     every other door a sparse list can still come in by — a hand-edited
     .mstr, a take restored from an older saved setup — and it says what the
     board will do, which nothing did before.

     WARNING, not error: the file compiles and Control Center accepts it; the
     sequence just does not do on the droid what it does on screen. One line
     per (sequence, channel), at the first frame it happens. A channel that is
     0 in EVERY frame is not touched by the sequence at all and is left alone
     — that is how every non-servo column and every never-mapped channel
     reads, and it is not this rule's business. */
  (MSTR.sequences||[]).forEach(seq=>{
    const frames = seq.frames || [];
    const had = {}, offAt = {};
    frames.forEach((fr, fi)=>{
      const t = fr.targets || [];
      servos.forEach(c=>{
        if(t[c.i]){ had[c.i] = true; return; }
        if(had[c.i] && offAt[c.i] === undefined) offAt[c.i] = fi;
      });
    });
    Object.keys(offAt).forEach(k=>{
      const c = byIndex[+k], fi = offAt[k];
      add('warn','pulses-off',
          '"'+seq.name+'" drives channel '+c.i+' ('+c.name+') and then sends it a target of 0 at frame '+fi
          + (frames[fi].name ? ' ('+frames[fi].name+')' : '')+'.',
          'On the board a target of 0 means "stop sending pulses": the servo goes limp at that frame and holds '
          + 'nothing, so a panel it was holding open drops. The sim reads 0 as "leave it alone" and will not show '
          + 'this. Give that frame the position the channel should hold, or take the channel out of the sequence.',
          c.i);
    });
  });

  /* A SEQUENCE WITH NO FRAMES (v1.69.0). Control Center writes
     `<Sequence name="X"></Sequence>` for one you made and never filled in,
     it imports as a routine with zero frames, and loadoutReset() puts it
     straight on the board. On the Pololu route that compiles to a
     subroutine that returns immediately — a slot that silently does
     nothing. On the PCA9685 route it was worse: pcaGenHeader wrote
     `static const uint16_t MPCA_SEQn[] PROGMEM = {\n};`, which is not legal
     C++ at all, so the whole header stopped compiling over a routine the
     builder never mentioned. The generator now skips them, which RENUMBERS
     the slots after it — so this has to be said before the export, not
     after. A generator sequence legitimately has no `frames`; it carries
     `entries` instead, and is not this. */
  const emptySeqs = (MSTR.sequences||[]).filter(s=>
    s && !(s.gen === 'osc' || s.gen === 'wander') && !((s.frames||[]).length));
  if(emptySeqs.length){
    const onBoardNames = (typeof loadoutNames==='function') ? loadoutNames() : [];
    const onBoard = emptySeqs.filter(s=>onBoardNames.indexOf(s.name) >= 0);
    const list = emptySeqs.map(s=>'"'+s.name+'"').join(', ');
    if(onBoard.length)
      add('err','seq-empty', onBoard.length+' sequence(s) on the board have no frames: '+
          emptySeqs.map(s=>'"'+s.name+'"').join(', ')+'.',
          'A sequence with nothing in it is left out of the generated file, and everything after it moves down a slot — so restartScript(n) stops matching this list. Give it frames or take it off the board.');
    else
      add('warn','seq-empty', emptySeqs.length+' sequence(s) in the library have no frames: '+list+'.',
          'They are not on the board, so nothing is generated for them and no slot moves. Fill them in or delete them.');
  }

  /* ------------------------------------------------------------ timing */
  const slowest = boardSlowestThrowMs();
  let timingHits = 0;
  (MSTR.sequences||[]).forEach(seq=>{
    const issues = seqTimingIssues(seq);
    if(!issues.length) return;
    timingHits += issues.length;
    const worst = issues.reduce((a,b)=>b.need-b.had > a.need-a.had ? b : a, issues[0]);
    add('warn','timing','"'+seq.name+'": '+issues.length+' move(s) are cut short — the worst is '+worst.name+
        ' at frame '+worst.frame+', given '+worst.had+' ms of a '+worst.need+' ms travel.',
        'Lengthen the frame, or space the reversal further apart. At these speed/acceleration settings a full throw takes up to '+Math.round(slowest)+' ms.');
  });

  /* ------------------------------------------------------------ script
     Pololu only. A PCA9685 build has no script: the loadout compiles into a
     PROGMEM table in sequences.h and the co-processor walks it, so every
     trap below (top-level loops, missing quit, subroutine underflow, the
     1 KB/8 KB script space) is about a machine that isn't there. Its own
     limits are different and are checked after this block — a script-size
     error against `script: 0` was the first thing a PCA build saw. */
  const scriptText = isPca ? '' : ((o.script !== undefined) ? o.script : MSTR.scriptText);
  const tr = scriptTraps(scriptText);
  if(tr.hasLoop)
    add('err','script-loop','The script has a begin/repeat loop at the top level and no subroutine wrapping it.',
        'That is what "Copy Sequence to Script" (singular) produces. restartScript(0) then lands on the first frame_* helper and faults with 0x0080. Use "Copy all Sequences to Script", or export from here.');
  else if(!tr.hasQuit && tr.subs.length)
    add('err','script-fallthrough','The script has no top-level quit, so Run Script falls through into "'+tr.subs[0]+'" and returns with an empty call stack.',
        'Error 0x0080, "Subroutine call overflow/underflow" — and the droid performs that first sequence while it happens. One bare quit above the first sub fixes it.');
  if(!tr.seqSubs.length && tr.subs.length)
    add('err','script-nosubs','The script declares '+tr.frameSubs.length+' frame helper(s) but no sequence subroutine.',
        'restartScript(n) counts subroutines in declaration order, so every slot the sketch calls would hit a frame helper and underflow the stack.');

  if(tr.subs.length > 126)
    add('err','sub-limit',tr.subs.length+' subroutines — the Maestro holds 126.','Drop sequences from the loadout until it fits.');
  else if(tr.subs.length > 100)
    add('note','sub-near',tr.subs.length+' of 126 subroutines used.','');

  const bytes = (typeof scriptBytesEstimate==='function' && scriptText) ? scriptBytesEstimate(scriptText) : 0;
  if(isPca){
    /* what actually bites on this route: the slot byte in the Maestro
       protocol the co-processor speaks, and the channel count the board
       arrangement has pins for */
    const load0 = (typeof loadoutNames==='function') ? loadoutNames() : [];
    if(load0.length > 128)
      add('err','pca-slots', load0.length+' sequences — restartScript() addresses 128.',
          'Drop sequences from the loadout, or split them across two co-processors.');
    const top = servos.reduce((m,c)=>Math.max(m, c.i), -1);
    if(top >= bd.ch)
      add('err','pca-channels','Channel '+top+' is past the '+bd.label+"'s "+bd.ch+' channels.',
          'Channel i lives on PCA9685 board i/16, pin i%16 — a channel past the last board has no pin to come out of. Add a board, or move the part down.');
  }
  else if(bytes > bd.script)
    add('err','script-size','The script is about '+bytes+' bytes and the '+bd.label+' holds '+bd.script+'.',
        'This is an estimate — Control Center reports the real figure — but it is over by enough to be worth shortening.');
  else if(bytes > bd.script*0.8)
    add('warn','script-size-near','The script is about '+bytes+' bytes of the '+bd.label+"'s "+bd.script+'.','');

  /* ------------------------------------------------------- the loadout */
  const load = (typeof loadoutNames==='function') ? loadoutNames() : [];
  /* ============ A SLOT NO BUTTON REACHES (v1.70.1)
     Eight stock routines fill 0-7 and the first routine a builder writes
     lands at 8. The panel said SLOTS USED 9 / ERRORS 0, the sketch page
     said the d-pad fires restartScript(0)-(7), and nothing joined them up:
     you flash the droid and the one routine you wrote is the one nothing
     plays.

     There WAS a rule here and it counted instead of naming — "the loadout
     has 9 sequences" is a size, not an address, and the reader's next
     question ("which one, and where did it go?") had no answer on the
     line. One item per slot past the d-pad's reach now, each naming its
     routine and carrying the slot as a field.

     WARNING, NOT ERROR, and that is the whole point of the rule rather
     than an apology for it: slot 8 is perfectly valid for anything that
     calls restartScript(n) directly — a whole-sequence brick, the serial
     console, a sketch of your own — so refusing the export would be
     wrong. It is advice, in the app's standing posture. The count stays
     available as stats.loadout for anything that wants the number. */
  const DPAD_SLOTS = 8;
  load.forEach((name, slot)=>{
    if(slot < DPAD_SLOTS) return;
    add('warn','slot-nodpad','"'+name+'" is on slot '+slot+', past the '+DPAD_SLOTS+
        ' the stock sketches fire: the d-pad only calls restartScript(0) through ('+(DPAD_SLOTS-1)+').',
        'It is on the board and restartScript('+slot+') still plays it — over serial, from a whole-sequence '
        + 'brick, or from a sketch of your own. If it is meant to be a d-pad show, move it into the first '
        + DPAD_SLOTS + ' in the Sequences list; something already there has to come off the board to make room.',
        undefined, slot);
  });
  if(!load.length && (MSTR.sequences||[]).length)
    add('warn','slots-empty','Nothing is in the script loadout, so the exported file would carry no sequence subroutines at all.','Add sequences to the board in the Sequences list.');

  /* ============ A SHOW BUILT ON PARTS THAT WILL NOT MOVE (v1.71.0)
     Ten movers on the stock droid have no servo channel. The sequencer
     shows them all, greys them, and INVITES the drag — "You can still drag
     them in and build the routine now" — which is the right answer to "I am
     writing the choreography before I have wired the dome". The brick is
     real, it moves the model in a preview, and it compiles to nothing.

     Nothing said so at the moment it mattered. A whole show can be built
     out of parts that do nothing on the real droid, and the build dialog
     reported ERRORS 0 — truthfully, because it is not an error. It is
     still the one thing you would want said before you flash the board.

     Same shape as slot-nodpad above, and for the same reasons: it NAMES
     the routine and the bricks rather than counting them, because "3
     bricks are unwired" is a size and the reader's next question is which
     ones; and it carries the `slot` when the routine is on the board, so
     the panel showing this is one field away from the list you would go
     and look at. WARNING, NOT ERROR — building ahead of your wiring is
     legitimate and this app advises rather than refuses.

     blockUnwired() (maestro/blocks.js) is the one definition of "no
     channel behind this brick"; it loads after this file and is only ever
     reached at call time, so the guard is a typeof, not a load order. */
  if(typeof blockIsRoutine === 'function' && typeof blockUnwired === 'function'){
    (MSTR.sequences||[]).forEach(seq=>{
      if(!seq || !blockIsRoutine(seq)) return;
      const un = blockUnwired(seq);
      if(!un.length) return;
      const names = [];
      un.forEach(u=>{ if(names.indexOf(u.label) < 0) names.push(u.label); });
      const slot = load.indexOf(seq.name);
      add('warn','brick-nochan',
          '"'+seq.name+'" has '+un.length+' brick'+(un.length===1?'':'s')+' on part'+
          (names.length===1?'':'s')+' with no servo channel: '+names.join(', ')+'. '+
          (slot >= 0 ? 'It is on the board as slot '+slot+', so that much of it does nothing on the real droid.'
                     : 'It is not on the board yet.'),
          'The bricks are real and they move the model in a preview — they just compile to nothing, so the '
          + 'panels stay shut when the droid runs it. Give ' + (names.length===1?'it':'them')
          + ' a channel in the channel map, or take those bricks out. Building the sequence before the wiring '
          + 'is done is fine; this is only so the export cannot be quiet about it.',
          undefined, slot >= 0 ? slot : undefined);
    });
  }

  /* ------------------------------------------------------ part mapping */
  const mapped = MSTR.channels.filter(c=>c.act).length;
  const unmapped = servos.filter(c=>!c.act);
  if(unmapped.length)
    add('note','map-gap',unmapped.length+' servo channel(s) drive nothing in the sim: '+
        unmapped.slice(0,6).map(c=>c.name||('ch'+c.i)).join(', ')+(unmapped.length>6?'…':'')+'.',
        'They still export and still work on the board — you just get no picture. Set them in the channel map.');
  const dupAct = {};
  MSTR.channels.forEach(c=>{ if(c.act) (dupAct[c.act]=dupAct[c.act]||[]).push(c.i); });
  Object.keys(dupAct).forEach(k=>{
    if(dupAct[k].length > 1)
      add('warn','map-dup','Channels '+dupAct[k].join(', ')+' all drive "'+k+'".',
          'One part cannot follow two channels — the last one written wins on screen.');
  });

  const counts = {err:0, warn:0, note:0};
  out.forEach(i=>counts[i.level]++);
  return {
    items: out, counts,
    stats: {
      board: bd.label, channels: MSTR.channels.length, servos: servos.length,
      mapped, sequences:(MSTR.sequences||[]).length, loadout: load.length,
      subs: tr.subs.length, seqSubs: tr.seqSubs.length, bytes, scriptMax: bd.script,
      slowestThrowMs: Math.round(slowest), timingHits, outOfRange, onNonServo
    }
  };
}
