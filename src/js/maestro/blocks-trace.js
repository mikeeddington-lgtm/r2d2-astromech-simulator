'use strict';
/* =====================================================================
   FRAMES BACK INTO BRICKS (v1.49.0)

   Mike, 2026-08-19, having asked whether importing a Maestro gives you a
   brick view and been told no: *"lets build it - but with two options the
   first is where we guess and another which highlights the issues and
   allows the user to use the bricks sequence to see them, accept them or
   change each issue"*.

   THE ASYMMETRY THIS EXISTS TO CLOSE. `blockCompile()` throws information
   away on purpose: a brick says "panel 3 opens over 300 ms, stays open for
   a second, shuts over 300 ms" and what comes out the other side is a list
   of absolute poses. Our OWN files carry the bricks along in a comment
   (v1.48.0) so nothing is lost there. Somebody else's `.mstr` — the whole
   point of the import — carries frames and nothing else, and until now
   that meant the sequencer could show it, play it and export it, but never
   let you EDIT it as bricks. The "Build this one with bricks" button was
   an empty start, not a conversion: drop one brick and the imported motion
   was gone.

   SO THIS IS A GUESS, AND IT SAYS SO. There is no unique brick routine
   behind a frame list — the same poses can be authored many ways, and some
   frame lists are not brick-shaped at all. Everything here is therefore
   built around one rule, the same one `blocksTryAttach()` uses:

       THE FRAMES ARE THE TRUTH. A brick is only worth having if it
       commands what the frames commanded.

   `blockTrace()` proposes; `blockTraceCheck()` measures the proposal
   against the original at every instant the original had an opinion; and
   the UI shows what does not agree rather than quietly rounding it off.
   Nothing here writes to a sequence — blocks-ui.js decides what to do with
   the proposal, and only after the user has.

   WHAT IT DOES NOT ATTEMPT
     · 'c' and 'co' bricks. Both describe a channel that is ALREADY open
       when the routine starts, and a compiled routine's base pose is shut
       (`blockCompile`), so no frame list that starts from rest can need
       one. Producing them would be inventing a shape to fit a curve that
       does not have it.
     · Overlapping bricks on one lane. Two bricks on the same channel
       layer into one curve (later wins) and that curve is what a frame
       list preserves; re-cutting it into the author's original two is
       guesswork with no evidence behind it. One excursion, one brick.
     · Nested sequence bricks. A dropped-in library sequence is
       indistinguishable, in the frames, from the same motion authored by
       hand — and guessing wrong would silently couple two routines.
   ===================================================================== */

/* Within this much of the shut end, a channel counts as shut. A Maestro
   target is a quarter-microsecond integer and a rounded ramp lands a count
   or two off its own ends, so an exact ==shut test would leave a hairline
   excursion at the end of every brick. 2% of travel is ~80 quarter-µs on a
   4000-wide pair: far below anything a panel can be seen to do. */
const TRACE_SHUT_EPS = 0.02;
/* Two samples this close in normalised travel are the same level — what
   makes the flat top of a brick one plateau rather than a staircase. */
const TRACE_FLAT_EPS = 0.01;
/* A difference at or under this many quarter-µs is not worth a person's
   attention: it is the rounding in `lerp()` coming back, not a wrong
   brick. About a fifth of a microsecond of pulse width. */
const TRACE_OK_QUS = 2;

/* ------------------------------------------------------------ the grid
   A frame COMMANDS its targets and then waits its duration, so the pose it
   carries is where the droid should be when that frame ENDS — the rule
   blockCompile() is built on, and the reason "Opens in 3 s" once meant
   three seconds of shut followed by a snap. The instants a frame list has
   an opinion about are therefore t=0 (at rest) and the END of every frame,
   and those are the only instants anything here compares. */
function blockTraceTimes(frames){
  const t = [0];
  let acc = 0;
  (frames || []).forEach(f=>{ acc += Math.max(0, Math.round(f.duration) || 0); t.push(acc); });
  return t;
}
/* One channel's curve over that grid, in 0..1 of its own travel. A target
   of 0 means "this channel is not commanded by this frame" (the same
   convention applyFrameTargets() reads), so the previous value carries. */
function blockTraceCurve(frames, c){
  const shut = blockClosed(c), open = blockOpen(c);
  const span = open - shut;
  const out = [0];
  let last = shut;
  (frames || []).forEach(f=>{
    const v = (f.targets && f.targets[c.i]) || 0;
    if(v) last = v;
    out.push(span === 0 ? 0 : Math.max(0, Math.min(1, (last - shut) / span)));
  });
  return out;
}

/* --------------------------------------------------------- excursions
   A run of samples away from the shut end, bracketed by the shut sample
   before it and the shut sample after. `open` marks one the routine never
   closes — that is an 'o' brick, not an 'oc' one with a missing fall. */
function blockTraceExcursions(curve){
  const out = [];
  let i = 1;                                  // index 0 is the base pose
  while(i < curve.length){
    if(curve[i] <= TRACE_SHUT_EPS){ i++; continue; }
    const s = i - 1;                          // the last shut sample
    let j = i;
    while(j < curve.length && curve[j] > TRACE_SHUT_EPS) j++;
    out.push({ s, e: Math.min(j, curve.length - 1), open: j >= curve.length });
    i = j;
  }
  return out;
}

/* ------------------------------------------------ one excursion, one brick
   The peak is the brick's amplitude; the first sample AT the peak ends the
   rise and the last one begins the fall. Every edge is taken from the grid
   rather than interpolated, so a routine that was bricks in the first place
   comes back with its own numbers instead of numbers near them. */
function blockTraceBrick(ref, times, curve, ex){
  let peak = 0;
  for(let k = ex.s; k <= ex.e; k++) if(curve[k] > peak) peak = curve[k];
  if(peak <= TRACE_SHUT_EPS) return null;
  let p0 = ex.e, p1 = ex.s;
  for(let k = ex.s; k <= ex.e; k++) if(curve[k] >= peak - TRACE_FLAT_EPS){ p0 = k; break; }
  for(let k = ex.e; k >= ex.s; k--) if(curve[k] >= peak - TRACE_FLAT_EPS){ p1 = k; break; }

  const t0 = times[ex.s];
  const b = { kind:'act', ref: ref, t0: t0, rise: Math.max(0, times[p0] - t0) };
  if(ex.open){
    /* it never comes back: the brick runs to the end of the routine and
       holds, which is exactly what mode 'o' means */
    b.mode = 'o';
    b.dur  = Math.max(120, times[times.length - 1] - t0);
    b.fall = b.rise;                          // unused by 'o', kept sane for editing
  }else{
    b.dur  = Math.max(120, times[ex.e] - t0);
    b.fall = Math.max(0, times[ex.e] - times[p1]);
  }
  if(peak < 0.999) b.amp = Math.max(0.05, Math.round(peak * 1000) / 1000);
  return b;
}

/* ============================================================ the proposal
   Returns {bricks, issues, note} and touches nothing. `issues` is what the
   review mode lists; each one names a channel, says what is wrong in
   plain words, and carries the anchor the UI needs to take you there. */
function blockTrace(seq){
  const out = { bricks: [], issues: [], moved: 0, skipped: 0 };
  if(!seq || !seq.frames || !seq.frames.length) return out;
  if(typeof BLKH === 'undefined' || !BLKH.loaded()) return out;

  const times = blockTraceTimes(seq.frames);
  const chans = BLKH.servoChannels();

  chans.forEach(c=>{
    const curve = blockTraceCurve(seq.frames, c);
    const exs = blockTraceExcursions(curve);
    if(!exs.length) return;                   // this channel never leaves rest
    out.moved++;
    /* A channel with no part cannot be a brick: a brick's ref IS an
       actuator, and there is nothing for this one to name. Its motion is
       real and would be dropped, so it is an issue with a door out of it
       (the bench's Channels step) rather than a silent omission. */
    if(!c.act){ out.skipped++; return; }   // blockTraceCheck() names it — see there
    exs.forEach(ex=>{
      const b = blockTraceBrick(c.act, times, curve, ex);
      if(b) out.bricks.push(b);
    });
  });

  out.bricks.sort((a,b)=>a.t0 - b.t0);
  out.bricks.forEach(b=>{ b.id = BLK_NEXT_ID++; });
  /* and now the only question that matters */
  blockTraceCheck(out.bricks, seq.frames).forEach(m=>out.issues.push(m));
  return out;
}

/* =========================================================== the measurement
   Evaluate the proposed bricks at every instant the original frame list had
   an opinion about, and report where they disagree. The evaluation mirrors
   blockCompile() exactly — start at base-closed, later bricks win, and a
   channel's value CARRIES when nothing covers it — because a check that
   evaluated them differently from the compiler would be measuring itself.

   One issue per CHANNEL, carrying its worst moment, because "panel 3 is
   wrong" is what a person can act on and forty rows of "wrong at 1.25 s,
   wrong at 1.37 s" is not. */
function blockTraceCheck(bricks, frames){
  const chans = BLKH.servoChannels();
  const times = blockTraceTimes(frames);
  const worst = {};                            // by channel index
  const last  = {};
  chans.forEach(c=>{ last[c.i] = blockClosed(c); });
  const orig  = {};
  chans.forEach(c=>{ orig[c.i] = blockClosed(c); });

  for(let k = 1; k < times.length; k++){
    const t  = times[k];
    const tg = {};
    chans.forEach(c=>{ tg[c.i] = last[c.i]; });
    bricks.forEach(b=>{
      const v = blockValueAt(b, t);
      const c = blockChan(b.ref);
      if(v !== null && c) tg[c.i] = v;
    });
    chans.forEach(c=>{
      last[c.i] = tg[c.i];
      const raw = (frames[k-1].targets && frames[k-1].targets[c.i]) || 0;
      if(raw) orig[c.i] = raw;
      if(!c.act) return;                        // reported whole, below, not by the microsecond
      const err = Math.abs(tg[c.i] - orig[c.i]);
      if(err > TRACE_OK_QUS && (!worst[c.i] || err > worst[c.i].err))
        worst[c.i] = { err: err, at: t, want: orig[c.i], got: tg[c.i] };
    });
  }

  const out = [];
  chans.forEach(c=>{
    /* A channel with no part cannot be a brick: a brick's ref IS an
       actuator and there is nothing here for it to name. Reporting that as
       a numeric mismatch would be true and useless — the number is the
       whole of its motion, and no amount of dragging will close it. So it
       is its own kind of issue, with the one door that fixes it. This
       lives HERE rather than in blockTrace() because review mode
       re-measures after every edit, and an issue only the first pass knew
       about would vanish on the second. */
    if(!c.act){
      const curve = blockTraceCurve(frames, c);
      const exs = blockTraceExcursions(curve);
      if(!exs.length) return;
      out.push({
        kind: 'unmapped', ch: c.i, ref: '',
        label: c.name || ('Channel ' + c.i),
        err: 0, pct: 0, at: times[exs[0].s],
        what: 'moves in this routine but is not mapped to a panel, so it cannot become a brick. '
            + 'Its motion is dropped from the conversion — map it to a panel and convert again to keep it.'
      });
      return;
    }
    const w = worst[c.i]; if(!w) return;
    const span = Math.abs(blockOpen(c) - blockClosed(c)) || 1;
    const pct  = Math.round(w.err / span * 100);
    /* Name the likeliest cause when there is an obvious one. A channel
       whose speed setting cannot deliver the ramp the frames ask for is
       the common case and reads as a mystery otherwise — blockEffRamps()
       floors every ramp at blockMinTravelMs(), so the brick is honest and
       the FILE was not. */
    const floorMs = (typeof blockMinTravelMs === 'function') ? blockMinTravelMs(c.act) : 0;
    const tooFast = floorMs > 0 && bricks.some(b=>b.ref === c.act && (b.rise < floorMs || b.fall < floorMs));
    out.push({
      kind: 'mismatch', ch: c.i, ref: c.act,
      label: (typeof BLKH !== 'undefined' && BLKH.label) ? BLKH.label(c.act) : c.act,
      err: w.err, pct: pct, at: w.at, want: w.want, got: w.got,
      what: tooFast
        ? ('is off by ' + w.err + ' (' + pct + '% of its travel) at ' + (w.at/1000).toFixed(2) + ' s. '
          + 'The frames move it faster than its own speed setting allows (' + floorMs + ' ms minimum), '
          + 'so the brick cannot be as quick as the file claimed to be.')
        : ('is off by ' + w.err + ' (' + pct + '% of its travel) at ' + (w.at/1000).toFixed(2) + ' s — '
          + 'the frames want ' + w.want + ' and the brick commands ' + w.got + '. '
          + 'Its motion is not the rise-hold-fall a brick describes.')
    });
  });
  return out;
}

/* Re-measure a routine that is already made of bricks against a frame list
   it is supposed to reproduce — what review mode calls after every edit,
   so the error readout is live rather than a verdict from a minute ago. */
function blockTraceReview(seq, origFrames){
  if(!seq || !blockIsRoutine(seq)) return [];
  return blockTraceCheck(blockList(seq), origFrames);
}
