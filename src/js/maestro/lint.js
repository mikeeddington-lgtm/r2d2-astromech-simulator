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
  const add = (level, code, msg, fix)=>out.push({level, code, msg, fix:fix||''});
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
          'Name it in Control Center — the name is what the part matcher reads.');
      return;
    }
    (seen[k] = seen[k] || []).push(c.i);
  });
  Object.keys(seen).forEach(k=>{
    if(seen[k].length > 1){
      const chs = seen[k];
      add('err','chan-dup','Channels '+chs.join(' and ')+' are both named "'+byIndex[chs[0]].name+'".',
          'Two channels with one name is ambiguous everywhere — the wiring sheet, the part map and any sequence you write by name. Rename one.');
    }
  });
  servos.forEach(c=>{
    if(c.min >= c.max)
      add('err','chan-range','Channel '+c.i+' ('+c.name+') has min '+c.min+' >= max '+c.max+'.',
          'Fix the endpoints in Control Center before running anything.');
    // v1.39.5: home=0 on an Off channel is the file format, not a mistake — match pcaHomeQus
    if(!/off|ignore/i.test(c.homemode||'') && (c.home < Math.min(c.min,c.max) || c.home > Math.max(c.min,c.max)))
      add('warn','chan-home','Channel '+c.i+' ('+c.name+') has home '+c.home+' outside its '+c.min+'-'+c.max+' range.','');
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

  /* ---------------------------------------------------- sequence targets */
  let outOfRange = 0, onNonServo = 0, emptyFrames = 0;
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
          add('err','tgt-mode','"'+seq.name+'" drives channel '+ch+' ('+c.name+'), which is set to '+c.mode+'.',
              'A non-Servo channel emits no pulses, so nothing moves. Switch it to Servo, or take it out of the sequence.');
          return;
        }
        if(t < Math.min(c.min,c.max) || t > Math.max(c.min,c.max)){
          outOfRange++;
          add('err','tgt-range','"'+seq.name+'" sends channel '+ch+' ('+c.name+') to '+t+', outside its '+c.min+'-'+c.max+' limits.',
              'The board clamps it, so the pose you see in the sim is not the pose you get.');
        }
      });
      if(!driven) emptyFrames++;
    });
  });
  if(emptyFrames)
    add('note','frame-empty',emptyFrames+' frame(s) drive no channel at all — those compile to a bare delay.','');

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
