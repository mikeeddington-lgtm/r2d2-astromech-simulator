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
   Walks a sequence keeping, per channel, the target it was last given and
   how long ago. Flags any channel handed a NEW target before it can have
   reached the previous one. Returns [] when the sequence is clean. */
function seqTimingIssues(seq){
  const out = [];
  if(!seq || !seq.frames) return out;
  const byIndex = {};
  MSTR.channels.forEach(c=>{ byIndex[c.i] = c; });
  const last = {};                       // ch -> {target, sinceMs}
  seq.frames.forEach((fr, fi)=>{
    (fr.targets || []).forEach((t, ch)=>{
      if(!t) return;                     // 0 = this frame does not drive the channel
      const c = byIndex[ch];
      if(!c || !/^servo/i.test(c.mode)) return;
      const prev = last[ch];
      if(prev && prev.target !== t){
        const need = chanTravelMs(c, t - prev.target);
        if(prev.sinceMs + 0.5 < need){
          out.push({ frame:fi, frameName:fr.name, ch, name:c.name,
                     had:Math.round(prev.sinceMs), need:Math.round(need) });
        }
      }
      last[ch] = { target:t, sinceMs:0 };
    });
    Object.keys(last).forEach(k=>{ last[k].sinceMs += (fr.duration || 0); });
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
     channel in prose but not in a field is a line nothing can act on. */
  const add = (level, code, msg, fix, ch)=>{
    const it = {level, code, msg, fix:fix||''};
    if(typeof ch === 'number') it.ch = ch;
    out.push(it);
  };
  if(!MSTR.loaded){ return { items:out, stats:{}, counts:{err:0,warn:0,note:0} }; }

  const bd     = boardById(MSTR.board);
  const servos = MSTR.channels.filter(c=>/^servo/i.test(c.mode));
  const byIndex= {}; MSTR.channels.forEach(c=>{ byIndex[c.i]=c; });

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
    if(c.min >= c.max)
      add('err','chan-range','Channel '+c.i+' ('+c.name+') has min '+c.min+' >= max '+c.max+'.',
          'Fix the endpoints in Control Center before running anything.', c.i);
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
      add('err','seq-empty', onBoard.length+' routine(s) on the board have no frames: '+
          emptySeqs.map(s=>'"'+s.name+'"').join(', ')+'.',
          'A routine with nothing in it is left out of the generated file, and everything after it moves down a slot — so restartScript(n) stops matching this list. Give it frames or take it off the board.');
    else
      add('warn','seq-empty', emptySeqs.length+' routine(s) in the library have no frames: '+list+'.',
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
  const isPca = typeof boardIsPca === 'function' && boardIsPca(MSTR.board);
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
  if(load.length > 8)
    add('warn','slots','The loadout has '+load.length+' sequences, but the stock sketches only call restartScript(0) through (7).',
        'Sequences past slot 7 are on the board and reachable over serial, but no button fires them. Reorder so the eight you want are first.');
  if(!load.length && (MSTR.sequences||[]).length)
    add('warn','slots-empty','Nothing is in the script loadout, so the exported file would carry no sequence subroutines at all.','Add sequences to the board in the Sequences list.');

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
