'use strict';
/* ============================================================== IMPORT */
function frameChannelsFromName(name){
  const m = /^frame_(.+)$/i.exec(name);
  if(!m) return null;
  const out=[];
  for(const part of m[1].split('_')){
    const r = /^(\d+)\.\.(\d+)$/.exec(part);
    if(r){ const a=+r[1], b=+r[2]; if(b<a) return null; for(let c=a;c<=b;c++) out.push(c); }
    else if(/^\d+$/.test(part)) out.push(+part);
    else return null;
  }
  return out;
}
/* the real pop order, read out of the frame_* subroutine body: "<ch> servo" … */
function framePushOrder(sub){
  const pop=[];
  for(let i=0;i<sub.body.length;i++){
    if(sub.body[i].toLowerCase()==='servo' && i>0 && /^\d+$/.test(sub.body[i-1])) pop.push(+sub.body[i-1]);
  }
  return pop.length ? pop.slice().reverse() : null;   // push order = reverse of pop order
}
function parseScriptSubs(src){
  const stripped = src.split('\n').map(l=>{ const i=l.indexOf('#'); return i>=0 ? l.slice(0,i) : l; }).join('\n');
  const toks = stripped.split(/\s+/).filter(Boolean);
  const subs=[];
  for(let i=0;i<toks.length;i++){
    if(toks[i].toLowerCase()!=='sub') continue;
    const name = toks[i+1] || ('sub_'+subs.length);
    const body=[]; let j=i+2;
    while(j<toks.length){
      const t=toks[j].toLowerCase();
      if(t==='sub') break;
      if(t==='return'){ j++; break; }
      body.push(toks[j]); j++;
    }
    subs.push({ index:subs.length, name, body });
    i = j-1;
  }
  return subs;
}
/* rebuild a frame list from a sequence subroutine's body */
function subToFrames(sub, subsByName, servoCount){
  const frames=[];
  let cur = new Array(servoCount).fill(0);
  let nums=[];
  for(const tkRaw of sub.body){
    if(/^-?\d+$/.test(tkRaw)){ nums.push(parseInt(tkRaw,10)); continue; }
    const tk = tkRaw.toLowerCase();
    if(tk==='delay'){
      frames.push({name:'Frame '+frames.length, duration:nums.length?nums[0]:0, targets:cur.slice()});
      nums=[]; continue;
    }
    let chans = null;
    const helper = subsByName[tk];
    if(helper && /^frame_/i.test(helper.name)) chans = framePushOrder(helper) || frameChannelsFromName(helper.name);
    if(!chans) chans = frameChannelsFromName(tkRaw);
    if(chans){
      const dur = nums.length?nums[0]:0;
      const targets = nums.slice(1);
      chans.forEach((c,k)=>{ if(targets[k]!==undefined && c>=0 && c<servoCount) cur[c]=targets[k]; });
      frames.push({name:'Frame '+frames.length, duration:dur, targets:cur.slice()});
      nums=[]; continue;
    }
    nums=[];   // some other command — reset the pending stack
  }
  return frames;
}

/* -------------------------------------------------- a <Frame> body
   NOT just N targets. Current Control Center writes THREE sections:

       <targets x N>  s  <speeds x N>  a  <accelerations x N>

   so an 18-channel board gives 56 tokens, not 18, and `s`/`a` are literal
   single-letter markers. Reading straight through and trusting the first N
   happens to work — but only until a board is mis-detected, and it silently
   throws away the speed and acceleration rows so they cannot round-trip.
   Split on the markers instead. A target of 0 means "this frame does not
   drive that channel", which is not the same as "go to zero". */
function parseFrameRow(text, servoCount){
  const raw = String(text||'').trim().split(/\s+/).filter(Boolean);
  const si = raw.indexOf('s'), ai = raw.indexOf('a');
  const grab = (from, to)=>{
    const v = raw.slice(from, to).map(x=>parseInt(x,10)||0);
    while(v.length < servoCount) v.push(0);
    return v.slice(0, servoCount);
  };
  const targets = grab(0, si >= 0 ? si : raw.length);
  const speeds  = si >= 0 ? grab(si+1, ai >= 0 ? ai : raw.length) : null;
  const accels  = ai >= 0 ? grab(ai+1, raw.length) : null;
  return {targets, speeds, accels, hadSA: si >= 0};
}

/* =====================================================================
   PARSE vs APPLY (v1.21.0 — Mike's sharing rule, 2026-08-08):

     "servo settings are unique to each person … a person imports another
      person's scripts / sequences and those play through the CURRENT
      builder's servo settings."

   mstrParse() only READS a file into a plain object. What happens next is
   a choice the caller owes the user whenever a config is already loaded:
     mstrApply(parsed)           — everything: the file's channel table
                                   (endpoints, homes, speeds) replaces
                                   yours. The wholesale path; needs the
                                   overwrite confirmation upstream.
     mstrAdoptSequences(parsed)  — sequences only: the file's sequences are
                                   RETARGETED onto your channel table and
                                   appended to the library. Your servo
                                   settings are never touched, and export
                                   keeps writing yours (genChannelsXml
                                   reads MSTR.channels and nothing else).
   ===================================================================== */
function parseMstr(text, fileName){
  return mstrApply(mstrParse(text, fileName));
}
/* v1.49.0 — a routine that arrived as poses is not a dead end any more,
   and the log a person is already reading after an import is the one place
   they will not think to look for that. Silent when everything came back
   as bricks. */
function traceOfferNote(){
  if(typeof MSTR === 'undefined' || !MSTR.sequences) return;
  const flat = MSTR.sequences.filter(s=>s && s.frames && s.frames.length && !s.blocks).length;
  if(!flat || typeof lg !== 'function') return;
  lg('mae','  '+flat+' routine(s) are hand-made frame lists — a Pololu file carries poses, not bricks. '
    + 'The sequencer can work the bricks back out of them, and will show you anything it cannot reproduce.');
}

/* ------------------------------------------------- the r2sim:acts sidecar
   Written by export.js (an XML comment) and pca-gen.js (a C comment); read
   here for both, because "which panel is this channel" is one question
   whatever family the file belongs to. Absent, malformed, or from a file
   that is not ours → null, and every channel keeps guessPart(). */
function actsUnpack(text, family){
  const re = (family === 'pca') ? /\/\* r2sim:acts ([A-Za-z0-9+/=]+) \*\//
                                : /<!--r2sim:acts ([A-Za-z0-9+/=]+)-->/;
  const m = re.exec(String(text || ''));
  if(!m) return null;
  try{
    const o = JSON.parse(decodeURIComponent(escape(atob(m[1].trim()))));
    return (o && o.v === 1 && Array.isArray(o.acts)) ? o.acts : null;
  }catch(e){ return null; }
}
function actsApply(channels, acts){
  if(!acts) return 0;
  let n = 0;
  channels.forEach((c,i)=>{
    if(i >= acts.length) return;
    const a = acts[i];
    if(a === undefined || a === null) return;
    c.act = a; n++;                       // '' is a real answer: mapped to nothing
  });
  return n;
}
function mstrParse(text, fileName){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('that file is not valid XML');
  const root = doc.documentElement;
  if(!root || root.nodeName!=='UscSettings') throw new Error('no <UscSettings> root — this does not look like a Maestro settings file');

  const header={};
  ['NeverSuspend','SerialMode','FixedBaudRate','SerialTimeout','EnableCrc','SerialDeviceNumber','SerialMiniSscOffset','EnablePullups']
    .forEach(k=>{ const e=root.getElementsByTagName(k)[0]; if(e) header[k]=e.textContent.trim(); });

  const chWrap = root.getElementsByTagName('Channels')[0];
  const chEls = chWrap ? chWrap.getElementsByTagName('Channel') : [];
  const channels=[];
  for(let i=0;i<chEls.length;i++){
    const c=chEls[i];
    const rawName = c.getAttribute('name');
    /* Control Center happily saves a channel with an empty name. Remember
       that it was empty: substituting "Channel 17" here and then counting
       blanks later finds none, and the user never gets told which channel
       the name matcher had nothing to read. */
    const named = !!(rawName && rawName.trim());
    const name = named ? rawName : ('Channel '+i);
    channels.push({
      i, name, autoName: !named,
      mode: c.getAttribute('mode') || 'Servo',
      min:  parseInt(c.getAttribute('min')||DEFAULT_MIN,10),
      max:  parseInt(c.getAttribute('max')||DEFAULT_MAX,10),
      home: parseInt(c.getAttribute('home')||DEFAULT_NEUTRAL,10),
      homemode: c.getAttribute('homemode') || 'Goto',
      neutral: parseInt(c.getAttribute('neutral')||DEFAULT_NEUTRAL,10),
      range: parseInt(c.getAttribute('range')||1905,10),
      speed: parseInt(c.getAttribute('speed')||0,10),
      acceleration: parseInt(c.getAttribute('acceleration')||0,10),
      /* v1.46.0 — `invert` is RETIRED as a setting (chanEnds/chanAdoptInvert,
         playback.js): min is the shut end and max the open one, directed
         rather than sorted. It stays here as a defined-falsy field only so a
         channel object has the same shape wherever it was made (starters.js,
         hw-host.js) — a .mstr has no column for it and never had. */
      act: guessPart(name), invert:false
    });
  }
  if(!channels.length) throw new Error('no <Channel> entries found');
  const servoCount = channels.length;
  /* which board wrote this file: the Micro tags itself with ServosAvailable,
     the Minis with MiniMaestroServoPeriod. Channel count is the fallback. */
  let board;
  if(chWrap){
    header.MiniMaestroServoPeriod = chWrap.getAttribute('MiniMaestroServoPeriod') || '80000';
    header.ServoMultiplier        = chWrap.getAttribute('ServoMultiplier') || '1';
    if(chWrap.getAttribute('ServoPeriod'))    header.ServoPeriod = chWrap.getAttribute('ServoPeriod');
    if(chWrap.getAttribute('ServosAvailable'))header.ServosAvailable = chWrap.getAttribute('ServosAvailable');
    if(chWrap.getAttribute('ServosAvailable') && !chWrap.getAttribute('MiniMaestroServoPeriod')) board = 'micro6';
  }
  if(!board) board = boardForCount(servoCount).id;
  header.__board = board;

  /* sequences straight out of the file */
  const sequences=[];
  const seqWrap = root.getElementsByTagName('Sequences')[0];
  if(seqWrap){
    const seqEls = seqWrap.getElementsByTagName('Sequence');
    for(let s=0;s<seqEls.length;s++){
      const name = seqEls[s].getAttribute('name') || ('Sequence '+s);
      const useSA = /^true$/i.test(seqEls[s].getAttribute('useSpeedAndAcceleration')||'');
      const frames=[];
      const frEls = seqEls[s].getElementsByTagName('Frame');
      for(let f=0;f<frEls.length;f++){
        const p = parseFrameRow(frEls[f].textContent, servoCount);
        const fr = {
          name: frEls[f].getAttribute('name') || ('Frame '+f),
          duration: parseInt(frEls[f].getAttribute('duration')||500,10),
          targets: p.targets
        };
        /* only carry the speed/acceleration rows when they say something.
           An all-zero block means "use the channel settings", which is the
           default, so keeping it would make a plain sequence unequal to
           itself across a round trip for no gain. */
        if(p.speeds && p.speeds.some(Boolean)) fr.speeds = p.speeds;
        if(p.accels && p.accels.some(Boolean)) fr.accels = p.accels;
        frames.push(fr);
      }
      const sq = {name, frames};
      if(useSA) sq.useSA = true;
      sequences.push(sq);
    }
  }

  /* the script — this is what restartScript(n) actually addresses */
  const scrEl = root.getElementsByTagName('Script')[0];
  const scriptText = scrEl ? (scrEl.textContent||'') : '';
  const rawSubs = parseScriptSubs(scriptText);
  const byName={}; rawSubs.forEach(s=>byName[s.name.toLowerCase()]=s);
  const subs = rawSubs.map(s=>({
    index:s.index, name:s.name, body:s.body,
    kind: /^frame_/i.test(s.name) ? 'frame' : 'sequence',
    seqIndex:-1, frames:null
  }));

  /* if the file carried no <Sequences>, rebuild them from the script subs

     — and "carried no <Sequences>" is the whole question, because the only
     way to ask it is to match a sub back to a routine, and the symbol a sub
     is written under STOPPED BEING niceName(name) in v1.68.1. The exporter
     now settles uniqueness on the emitted symbol (export.js scriptSubNames
     says why): a leading digit gets an `s_` in front, a clash gets `_2`,
     `_3`. Asking niceName() about `s_2001_Salute` gets "no such routine",
     the recovery path fires on a file that recovers nothing, and a phantom
     copy of the routine is appended under its own sub symbol — with
     identical frames, so nothing looks wrong until the library has grown
     3 → 5 → 7 over three saves and the loadout with it.

     So match on the symbols the exporter actually writes, by calling the
     function that writes them rather than keeping a second copy of the rule
     here — two copies of a naming rule is how this drifted in the first
     place. The niceName() pass stays as a FALLBACK: every file this app
     wrote before v1.68.1 carries the old symbols, and they must not start
     fabricating duplicates now. Only a sub that answers to neither is
     genuinely not in <Sequences> and is worth rebuilding. (v1.69.0) */
  let recovered = 0;
  const subSyms = ((typeof scriptSubNames === 'function')
                    ? scriptSubNames(sequences)
                    : sequences.map(q=>niceName(q.name))).map(n=>n.toLowerCase());
  const oldSyms = sequences.map(q=>niceName(q.name).toLowerCase());
  subs.forEach(s=>{
    if(s.kind!=='sequence') return;
    const sym = s.name.toLowerCase();
    let match = subSyms.indexOf(sym);
    if(match<0) match = oldSyms.indexOf(sym);
    if(match>=0){ s.seqIndex=match; return; }
    const fr = subToFrames(s, byName, servoCount);
    if(fr.length){
      sequences.push({name:s.name, frames:fr});
      s.seqIndex = sequences.length-1;
      recovered++;
    }
  });

  /* v1.48.1 — the part mapping our own export commented in, back out. A
     Pololu file has no column for it, so without this `guessPart(name)` is
     the ONLY answer and a wholesale import re-wires a droid whose channel
     names do not happen to match the CAD's numbering (export.js
     mstrActsComment says why). Authored beats guessed, per channel: an
     entry present in the comment wins, a missing one keeps the guess. */
  actsApply(channels, actsUnpack(text, 'mstr'));

  /* v1.48.0 — the bricks our own export commented in, back out. They are a
     CANDIDATE only: mstrApply()/mstrAdoptSequences() re-attach them through
     blocksTryAttach(), which requires the compile to reproduce the frames. */
  const bcm = /<!--r2sim:blocks ([A-Za-z0-9+/=]+)-->/.exec(text);
  const packedBlocks = (bcm && typeof blocksUnpack === 'function') ? blocksUnpack(bcm[1]) : null;
  if(packedBlocks) sequences.forEach(sq=>{ if(packedBlocks[sq.name]) sq.blocksCand = packedBlocks[sq.name]; });

  /* What the file was like BEFORE the sim touched anything. The wizard shows
     this, and it is the only chance to tell the user their board was never
     going to answer restartScript() — once we re-export, the evidence is
     gone. */
  const tr = (typeof scriptTraps==='function') ? scriptTraps(scriptText)
           : {hasCode:false,hasQuit:false,hasLoop:false,subs:[],seqSubs:[],frameSubs:[]};
  const report = {
    fileName: fileName||'settings.mstr',
    board, servoCount,
    seqInFile: seqWrap ? seqWrap.getElementsByTagName('Sequence').length : 0,
    seqRecovered: recovered,
    scriptEmpty: !scriptText.trim(),
    scriptLoop: tr.hasLoop,
    scriptFallThrough: !tr.hasLoop && !tr.hasQuit && tr.subs.length > 0,
    seqSubs: tr.seqSubs.slice(),
    frameSubs: tr.frameSubs.length,
    blankNames: channels.filter(c=>/^servo/i.test(c.mode) && c.autoName).length,
    dupNames: (function(){
      const seen={}, dup=[];
      channels.forEach(c=>{ if(!/^servo/i.test(c.mode)) return;
        const k=(c.name||'').trim().toLowerCase(); if(!k) return;
        if(seen[k]!==undefined && dup.indexOf(seen[k])<0) dup.push(seen[k]);
        if(seen[k]!==undefined) dup.push(c.i); else seen[k]=c.i; });
      return dup;
    })(),
    nonServo: channels.filter(c=>!/^servo/i.test(c.mode)).map(c=>c.i),
    mapped: channels.filter(c=>c.act).length
  };

  return { fileName: fileName||'settings.mstr', xmlText:text, servoCount,
           channels, sequences, subs, scriptText, header, board, report };
}

function mstrApply(P){
  MSTR.loaded=true; MSTR.fileName=P.fileName; MSTR.xmlText=P.xmlText;
  MSTR.servoCount=P.servoCount; MSTR.channels=P.channels; MSTR.sequences=P.sequences;
  if(typeof chanPosReset === 'function') chanPosReset();   // the table is a new table — CHPOS with it
  MSTR.subs=P.subs; MSTR.scriptText=P.scriptText; MSTR.header=P.header; MSTR.board=P.board;
  MSTR.report=P.report;
  /* v1.48.0 — bricks the file carried as a comment come back as bricks,
     when they honestly recompile to the file's own frames on the file's
     own table (which is now THE table — mstrApply is wholesale) */
  if(typeof blocksTryAttach === 'function'){
    let back = 0, kept = 0;
    MSTR.sequences.forEach(sq=>{
      const cand = sq.blocksCand; delete sq.blocksCand;
      if(!cand || !cand.length) return;
      if(blocksTryAttach(sq, cand)) back++; else kept++;
    });
    if(back) lg('mae','  '+back+' routine(s) restored EDITABLE — bricks intact from the file');
    if(kept) lg('mae','  '+kept+' routine(s) kept as plain frames — their bricks no longer recompile to the same motion');
    traceOfferNote();
  }
  if(typeof servoStoreSave === 'function') servoStoreSave();
  const {servoCount, channels, sequences, subs, board} = P;
  const fileName = P.fileName, recovered = P.report.seqRecovered;
  /* WHAT THE BOARD WAS ACTUALLY CARRYING (v1.69.0)

     This used to be loadoutReset() with "the file's own sequence order
     already IS its subroutine order" over it, which is true of exactly one
     file: the one whose loadout was the whole library, in library order.
     A curated loadout — a subset, in the order the builder chose on the
     Maestro tab — is not that file. <Sequences> carries the whole library
     because that is your Control Center sequence list; the <Script> carries
     the loadout, and the script is what defines the subroutines, so the
     script is what restartScript(n) is answered from. Resetting to the
     library threw the second one away and silently renumbered the first:
     a loadout of 0=Dome Flutter, 1=Whole Dome Open, 2=Dome Pies Close came
     back as the eight-routine library in library order, and the d-pad on
     the droid fired different routines than it had before the save.

     The script's sequence subs, in declaration order, ARE the loadout —
     pca-gen-sim.js pcaGenFromParsed has read them that way all along
     ("the script is the board's truth"). Fall back to the library only
     when there was no script to read, which is the one case the old
     comment was describing. A name is taken once: a file that names the
     same routine in two subs would otherwise compile it twice on the way
     back out, growing the loadout on every save. */
  const fromScript = subs
    .filter(s=>s.kind==='sequence' && s.seqIndex>=0)
    .map(s=>(sequences[s.seqIndex]||{}).name)
    .filter((n,i,a)=>n && a.indexOf(n)===i);
  if(fromScript.length) MSTR.loadout = fromScript; else loadoutReset();
  EDIT.live = channels.map(c=>chanRest(c));   // v1.45.0 — see chanRest() in maestro/boards.js
  EDIT.seq = 0; EDIT.frame = -1;

  lg('mae',`imported ${MSTR.fileName}: ${servoCount} channels, ${sequences.length} sequence(s), ${subs.length} subroutine(s)`);
  lg('mae',`  board detected as ${boardById(board).product}`);
  const seqSubs = subs.filter(s=>s.kind==='sequence');
  seqSubs.slice(0,12).forEach(s=>lg('mae',`  restartScript(${s.index}) → sub ${s.name}`));
  if(recovered) lg('mae',`  ${recovered} sequence(s) rebuilt from the script (file had no <Sequences> for them)`);
  const mapped = channels.filter(c=>c.act).length;
  lg('mae',`  auto-mapped ${mapped}/${servoCount} channels to droid parts by name`);
  return MSTR;
}

/* =====================================================================
   SEQUENCES-ONLY ADOPTION — another builder's art, your calibration.

   A frame target is an absolute quarter-µs number tuned against the
   AUTHOR's linkages. Played raw on a different droid it can slam a servo
   past its endpoint. So every adopted target is re-expressed as "how far
   through the author's closed→open throw was this?" and re-emitted at the
   same fraction of YOUR closed→open throw:

       n  = (t − closed_A) / (open_A − closed_A)      clamped 0..1
       t' = closed_Y + n · (open_Y − closed_Y)

   closed/open (not min/max) is what makes an INVERTED mounting come out
   right: if the author opens a pie by driving up and you open yours by
   driving down, the fraction is the same and the direction flips itself.

   Channel matching, most meaningful first:
     1. by ACT — both sides name the same droid part (pie3, gripper…)
     2. by channel NAME (trimmed, case-folded, non-auto names only)
     3. by channel NUMBER, servo-mode both sides
   Unmatched source channels are DROPPED from the frames and reported —
   a target with no home on your droid must not land on a random servo.

   Per-frame speed/accel rows are dropped on purpose: they are the
   author's physics. Your channel table's speed/accel governs, exactly as
   it does for every brick (blockMinTravelMs — HANDOVER §3).
   ===================================================================== */
function mstrMatchChannels(P){
  const mine = MSTR.channels, pairs = [], how = {act:0, name:0, index:0}, unmatched = [];
  const servo = c => /^servo/i.test(c.mode);
  const byAct = {}, byName = {};
  mine.forEach(c=>{
    if(!servo(c)) return;
    if(c.act) byAct[c.act] = c;
    if(c.name && !c.autoName) byName[c.name.trim().toLowerCase()] = c;
  });
  P.channels.forEach(a=>{
    if(!servo(a)) return;
    let dst = null, via = null;
    /* An EXACT name match outranks the act (2026-08-18): a src channel's
       act is always guessPart(name) — a GUESS — while a real name carried
       by both files is authored twice. Mike's table names a channel
       "Panel7" and wires it to the CAD lane `panel11` (his physical
       numbering is not the CAD's); the guess read "Panel7" as `panel6`
       and adoption cross-wired his own round-trip, swapping two panels'
       choreography. The name is the human's meaning; the guess is ours. */
    if(a.name && !a.autoName && byName[a.name.trim().toLowerCase()]){
      dst = byName[a.name.trim().toLowerCase()]; via = 'name';
    }
    else if(a.act && byAct[a.act]){ dst = byAct[a.act]; via = 'act'; }
    else if(mine[a.i] && servo(mine[a.i])){
      /* same-number fallback is for raw Pololu files with blank names —
         two channels that BOTH carry real names which DISAGREE are two
         different parts, and landing one on the other by coincidence of
         wiring order is exactly the accident this exists to prevent */
      const m = mine[a.i];
      const bothNamed = !a.autoName && !m.autoName && a.name && m.name;
      const clash = bothNamed && a.name.trim().toLowerCase() !== m.name.trim().toLowerCase();
      if(!clash){ dst = m; via = 'index'; }
    }
    if(dst){ pairs.push({src:a, dst}); how[via]++; }
    else unmatched.push(a.i);
  });
  return {pairs, how, unmatched};
}
/* A FOREIGN file's direction is unknowable from its pair: Control Center
   always stores min<max, so "which end is shut" has exactly one tell — the
   home its droid parks at. That heuristic lives HERE and only here
   (2026-08-18): our own table is the directed pair (blockClosed/blockOpen,
   v1.46.0 — min shut, max open, the bench's REV already baked in), so their
   home lands on my shut end and their far-from-home end on my open end.

   BUT the home is only a tell when the file actually MEASURED one — an
   explicit Goto home inside the pair. A MaestroPCA sequences.h stores
   home 0 for a homemode-Off channel (rest is computed, not stored) and
   the parser fills the hole with 6000, so trusting `home ||` here rescaled
   a round-trip of OUR OWN export through a fictional mid-travel "shut" —
   and on any pair asymmetric about 6000 the invented ends came out the
   wrong way round: every panel in the adopted copy reversed (Mike's
   2026-08-18 diff of R2choreography… against sequences…h found it). No
   measured home ⇒ the directed pair, which is exactly right for our own
   files and the only honest default for anyone else's. */
function mstrSrcEnds(c){
  const lo = Math.min(c.min, c.max), hi = Math.max(c.min, c.max);
  const home = +c.home || 0;
  if(!/^goto$/i.test(c.homemode || '') || home < lo || home > hi)
    return {shut: c.min, open: c.max};
  return {shut: home, open: (Math.abs(hi - home) >= Math.abs(home - lo)) ? hi : lo};
}
function mstrRetargetFrame(targets, pairs){
  const t = new Array(MSTR.servoCount).fill(0);
  for(const {src, dst} of pairs){
    const v = targets[src.i];
    if(!v) continue;                                 // 0 = untouched, stays untouched
    const eA = mstrSrcEnds(src);
    const cA = eA.shut, oA = eA.open;
    const cY = blockClosed(dst), oY = blockOpen(dst);
    let n = (oA === cA) ? 0 : (v - cA) / (oA - cA);
    n = Math.max(0, Math.min(1, n));
    let out = Math.round(cY + n * (oY - cY));
    const lo = Math.min(dst.min, dst.max), hi = Math.max(dst.min, dst.max);
    t[dst.i] = Math.max(lo, Math.min(hi, out));
  }
  return t;
}
function mstrAdoptSequences(P){
  if(!MSTR.loaded) throw new Error('no config of your own loaded yet — import everything first, then adopt other people\'s sequences on top');
  const {pairs, how, unmatched} = mstrMatchChannels(P);
  if(!pairs.length) throw new Error('none of that file\'s channels match yours — nothing its sequences say could land on the right servo');
  const cat = 'Imported · ' + (P.fileName || 'file').replace(/\.mstr$/i, '');
  let dropped = 0;
  const added = [];
  /* v1.46.0 — Mike, of the choreography merge: "add the imports as
     additions" and, on collisions, say "how any clash was named". The dot
     suffix below has always prevented the overwrite; what was missing was
     the receipt. So the renames are collected and handed back, not merely
     applied, and the chooser says them out loud. */
  const renamed = [];
  let bricksBack = 0, bricksKeptAsFrames = 0;
  P.sequences.forEach(sq=>{
    if(!sq.frames || !sq.frames.length) return;
    const frames = sq.frames.map(f=>{
      if(f.speeds || f.accels) dropped++;
      return {name:f.name || '', duration:f.duration, targets:mstrRetargetFrame(f.targets, pairs)};
    });
    let name = sq.name;
    while(MSTR.sequences.some(s=>s.name === name)) name = name + '·';
    if(name !== sq.name) renamed.push({from:sq.name, to:name});
    const adopted = {name, frames, cat};
    /* v1.48.0 — the file carried its BRICKS (our own choreography .json
       always did; a .mstr / sequences.h carries them as a comment now).
       Re-attach them only when they honestly recompile to these frames on
       THIS table — otherwise the frames stay the truth and the loss is
       counted, not silent. */
    const cand = sq.blocksCand || sq.blocks;
    if(cand && cand.length){
      if(typeof blocksTryAttach === 'function' && blocksTryAttach(adopted, cand)) bricksBack++;
      else bricksKeptAsFrames++;
    }
    MSTR.sequences.push(adopted);
    added.push(name);
  });
  if(typeof reindexSubs === 'function') reindexSubs();
  if(bricksBack) lg('mae','  '+bricksBack+' routine(s) came back EDITABLE — their bricks recompile to the same frames on your table');
  if(bricksKeptAsFrames) lg('mae','  '+bricksKeptAsFrames+' routine(s) kept as plain frames — their bricks would compile differently against your endpoints/speeds, so the frames won');
  /* NOT loadoutReset(): what reaches the board stays exactly what you chose */
  lg('mae','adopted '+added.length+' sequence(s) from '+P.fileName+' onto YOUR servo settings');
  traceOfferNote();
  lg('mae','  channels matched: '+how.act+' by part, '+how.name+' by name, '+how.index+' by number'
     + (unmatched.length ? ' · dropped source channel(s) '+unmatched.join(', ')+' (no match on your droid)' : ''));
  if(dropped) lg('mae','  per-frame speed/accel rows discarded — your channel settings govern the motion');
  if(renamed.length)
    lg('mae','  '+renamed.length+' name clash(es), renamed rather than overwritten: '
      + renamed.map(r=>r.from+' → '+r.to).join(', '));
  return {added, renamed, how, unmatched, cat};
}

/* =====================================================================
   A PCA9685 CONFIGURATION, READ BACK IN (v1.45.0)

   Mike: "Support importing and converting Maestro and PCA9685
   configurations, then exporting to either format."

   WHAT "A PCA9685 CONFIGURATION" IS. A PCA9685 is a dumb 16-channel PWM
   chip; it has no settings file, no names, no endpoints and nothing to
   save. So the phrase can only mean the file that the SKETCH driving one
   carries — and this project already defines that file twice over, in
   `arduino/MaestroPCA`: the `MpcaChannelDef` table (board, pin, min, max,
   home, speed, acceleration, releaseMs, ease) and the `MPCA_SEQ*` frame
   tables. `pca-gen.js` writes it as `sequences.h`, the bench writes the
   channel half of it as `servos.h` (setup-hw.js setupServosH), and both
   speak quarter-microseconds exactly as a Maestro does.

   So this reader reads back what we write. That is the only definition
   that can be tested against something real rather than guessed at, it
   closes the square (either family in, either family out), and it makes
   the pair of generators honest: a field that cannot survive a round trip
   through them is a field we are entitled to name out loud.

   WHAT IT DELIBERATELY DOES NOT ATTEMPT
     · Any OTHER project's PCA9685 sketch. There is no standard — every
       library invents its own struct — and a parser that guessed would
       land a stranger's numbers on real linkages. A file we do not
       recognise is refused with the reason, not half-read.
     · `#define SERVO_HZ` / `OSC_HZ` / `PCA_BOARDS`. They are real and they
       matter on the wire, but nothing in the sim's channel table has
       anywhere to keep them, and inventing a field to hold a number
       nothing reads is worse than saying we dropped it. Reported by name.
     · The oscillator/wander generator sequences (MPCA_SEQ_OSC,
       MPCA_SEQ_WANDER). They are five-number entries, not frames; the
       shape is readable but the sim's sequence model has no home for a
       generator that arrived from outside. Counted and reported, skipped.
     · Arduino C in general. This is not a compiler: it finds two known
       table shapes by name and refuses everything else.
   ===================================================================== */

/* the file, not the extension — a header renamed .txt is still a header,
   and a .h full of somebody else's struct is not one of ours */
function pcaHeaderLooksLike(text){
  const t = String(text || '');
  if(t.charAt(0) === '<') return false;                     // XML: the .mstr reader's business
  return /MpcaChannelDef\s+\w+\s*\[/.test(t) || /MPCA_CHANNEL_TABLE|SERVO_TABLE/.test(t);
}

/* every row of a `const MpcaChannelDef NAME[...] PROGMEM = { … };` table */
const PCA_ROW_RE = /\{\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*MPCA_EASE_(\w+)\s*\}\s*,?[ \t]*(?:\/\*([\s\S]*?)\*\/)?/g;

/* the trailing `/* ch 3 Btn — Input, unused *​/` comment is where the NAME
   lives — the struct itself has no room for one, so the generator puts it
   in the only place a C table can carry text. Both generators write the
   same shape (pca-gen.js and setup-hw.js setupServosH); setupServosH says
   "(not used)" where pca-gen.js says "— Input, unused". */
function pcaRowMeta(comment, i){
  /* THE MIRROR OF pcaCommentSafe() (v1.69.1). The generator turns every
     newline in a name into a space before the name reaches this comment, so
     the reader has to agree: a hand-edited header is the one file that never
     went through it, and without this a channel comes back with a newline
     inside its name. It is done to the WHOLE comment rather than to the name
     at the end, because the `ch N` prefix is stripped by a regexp whose `.`
     stops at a newline — sanitising afterwards would leave the prefix on and
     read back "ch 3 Dome Pie 3" where the writer wrote "Dome Pie 3". */
  const raw = String(comment || '').replace(/[\r\n]+/g,' ').trim();
  const m = /^ch\s*(\d+)\s*(.*)$/i.exec(raw);
  let rest = m ? m[2].trim() : raw;
  let mode = '';
  const um = /^(.*?)\s*[—-]\s*([A-Za-z]+)\s*,\s*unused\s*$/.exec(rest);
  if(um){ rest = um[1].trim(); mode = um[2]; }
  if(/^\(not used\)$/i.test(rest)){ rest = ''; mode = mode || 'Input'; }
  return {name: rest, mode: mode};
}

function pcaHeaderParse(text, fileName){
  const t = String(text || '');
  if(!pcaHeaderLooksLike(t))
    throw new Error('that is not a MaestroPCA header — no MpcaChannelDef channel table in it');

  /* ------------------------------------------------------- the channels */
  const tbl = /(?:MpcaChannelDef)\s+\w+\s*\[[^\]]*\]\s*(?:PROGMEM\s*)?=\s*\{([\s\S]*?)\n\s*\};/.exec(t);
  if(!tbl) throw new Error('the MpcaChannelDef table is there but its rows could not be read');
  const dNeutral = (typeof DEFAULT_NEUTRAL === 'number') ? DEFAULT_NEUTRAL : 6000;
  const channels = [];
  let row;
  PCA_ROW_RE.lastIndex = 0;
  while((row = PCA_ROW_RE.exec(tbl[1])) !== null){
    const i = channels.length;
    const pin = +row[2];
    const meta = pcaRowMeta(row[10], i);
    const servo = pin !== 255;
    const named = !!meta.name;
    channels.push({
      i, name: named ? meta.name : ('Channel ' + i), autoName: !named,
      mode: servo ? 'Servo' : (meta.mode || 'Input'),
      min: servo ? +row[3] : (typeof DEFAULT_MIN === 'number' ? DEFAULT_MIN : 4000),
      max: servo ? +row[4] : (typeof DEFAULT_MAX === 'number' ? DEFAULT_MAX : 8000),
      /* home 0 in the table means "do not drive it home on boot" — which is
         a Maestro `homemode` of Off, and is indistinguishable from Ignore */
      home: (servo && +row[5]) ? +row[5] : dNeutral,
      homemode: (servo && +row[5]) ? 'Goto' : 'Off',
      neutral: dNeutral, range: 1905,
      speed: servo ? +row[6] : 0,
      acceleration: servo ? +row[7] : 0,
      releaseMs: servo ? +row[8] : 0,
      ease: String(row[9] || 'NONE').toLowerCase(),
      act: (typeof guessPart === 'function') ? guessPart(named ? meta.name : '') : '',
      invert: false          // v1.46.0 — retired; see mstrParse above
    });
  }
  if(!channels.length) throw new Error('the MaestroPCA channel table is empty');
  /* v1.48.1 — authored part mapping beats guessPart(), same sidecar as the
     .mstr. Applied HERE, before report.mapped counts them. */
  actsApply(channels, actsUnpack(t, 'pca'));
  const declared = /#define\s+(?:MPCA_CHANNELS|SERVO_COUNT)\s+(\d+)/.exec(t);
  const servoCount = channels.length;

  /* ------------------------------------------------------ the sequences */
  const sequences = [];
  let generators = 0;
  /* WHICH SEQUENCES CARRY SPEEDS (v1.66.0). MPCA_SEQ_SPEEDS doubles a
     sequence's stride to 1 + 2*channels — duration, targets, then speeds —
     so this has to be known BEFORE the rows are walked. Reading it at the
     single stride does not fail, it silently yields twice as many frames of
     nonsense, which is exactly what the round-trip suite caught. */
  const speedSeqs = {};
  const flagPre = /\{\s*MPCA_SEQ(\d+)\s*,\s*\d+\s*,\s*([^}]*?)\}/g;
  let fp;
  while((fp = flagPre.exec(t)) !== null)
    if(/MPCA_SEQ_SPEEDS/.test(fp[2])) speedSeqs[+fp[1]] = true;
  const stride = servoCount + 1;
  const seqRe = /static\s+const\s+uint16_t\s+MPCA_SEQ(\d+)\s*\[\]\s*(?:PROGMEM\s*)?=\s*\{[ \t]*(?:\/\*([\s\S]*?)\*\/)?([\s\S]*?)\n\};/g;
  /* THE SLOT NUMBER IS NOT THE ARRAY INDEX (v1.69.0). A generator table is
     skipped below, so from the first one on, `MPCA_SEQ<k>` and
     `sequences[k]` mean different routines — and MPCA_SEQ_TABLE addresses
     its flags by k. Read at the array index, every loop and background flag
     after a generator landed one routine early: a header whose slot 0 was
     an oscillator gave "Beta Loop" no loop and looped "Gamma" instead, and
     the droid repeats the wrong routine until something displaces it. The
     speed flags above avoid this only because they are read into a map
     keyed on k and never touch the array, which is the same shape this
     needs. */
  const slotToIndex = {};
  let sm;
  while((sm = seqRe.exec(t)) !== null){
    const label = String(sm[2] || '').trim();
    const body  = String(sm[3] || '');
    /* a generator table is five numbers per ENTRY, not a frame — its own
       header comment says so, and pca-gen.js writes exactly that line */
    if(/\bch\s*,\s*lo\s*,\s*hi\s*,\s*period/i.test(body)){ generators++; continue; }
    const nums = body.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'')
                     .split(/[\s,]+/).filter(x=>/^-?\d+$/.test(x)).map(Number);
    const withSpeeds = !!speedSeqs[+sm[1]];
    const rowLen = withSpeeds ? (1 + 2*servoCount) : stride;
    const frames = [];
    for(let k=0; k + rowLen <= nums.length; k += rowLen){
      const fr = {name:'Frame '+frames.length, duration:nums[k],
                  targets:nums.slice(k+1, k+1+servoCount)};
      if(withSpeeds){
        /* 65535 is MPCA_SPEED_FREE — the firmware's way of saying "no limit
           for this move", which 0 cannot say because 0 already means "leave
           the channel's own setting alone". This app has no per-frame word
           for unlimited, so it comes back as 0 and the channel governs. */
        const sp = nums.slice(k+1+servoCount, k+rowLen).map(v=>v === 65535 ? 0 : v);
        if(sp.some(v=>v)) fr.speeds = sp;
      }
      frames.push(fr);
    }
    /* the name lost its spaces on the way out (pcaCName), so the comment is
       the only place the routine's real name survives */
    slotToIndex[+sm[1]] = sequences.length;
    sequences.push({name: label || ('Sequence '+sequences.length), frames});
  }
  /* MPCA_SEQ_TABLE carries the flags — loop and background are real
     sequence properties in this app, so they come back */
  const flagRe = /\{\s*MPCA_SEQ(\d+)\s*,\s*\d+\s*,\s*([^}]*?)\}/g;
  let fm;
  while((fm = flagRe.exec(t)) !== null){
    const q = sequences[slotToIndex[+fm[1]]];
    if(!q) continue;
    if(/MPCA_SEQ_LOOP/.test(fm[2]))       q.loop = true;
    if(/MPCA_SEQ_BACKGROUND/.test(fm[2])) q.background = true;
  }

  /* --------------------------------------------- what did NOT come across
     Mike's rule, already modelled by mstrAdoptSequences/mstrMatchChannels
     and pinned by mstr-share.test.js: nothing is discarded in silence. */
  const nonServo = channels.filter(c=>!/^servo/i.test(c.mode)).map(c=>c.i);
  const offHome  = channels.filter(c=>c.homemode === 'Off').length;
  const dropped = [
    {field:'neutral', n:servoCount,
     why:'a PCA9685 header has no neutral — it is a Maestro 8-bit protocol scaling value. Set to the default ' + dNeutral + ' quarter-µs on every channel.'},
    {field:'range', n:servoCount,
     why:'same: the Maestro range that pairs with neutral. Defaulted to 1905, which is what Control Center writes.'},
    {field:'homemode', n:offHome,
     why:'the header keeps a home TARGET only, so Off and Ignore both arrive as home 0 and cannot be told apart. ' + offHome + ' channel(s) read back as Off.'},
    {field:'invert', n:servoCount,
     why:'inverted travel was a simulator display setting and is retired in v1.46.0 — min is the shut end and max the open one, whatever their order. A panel that opens the wrong way is min and max the wrong way round; swap them.'},
    {field:'serial settings', n:0,
     why:'baud rate, device number, CRC and timeout are Maestro board settings. A .mstr exported from this config gets this app\'s defaults, not the original board\'s.'},
    {field:'per-frame acceleration', n:0,
     why:'since v1.66.0 a frame can carry a SPEED per channel, and reading this file recovers it. Acceleration never can — it stays the channel table\'s, which is what shapes the ends of every move.'},
    /* v1.68.1 — the old wording here said the speeds "survive the round trip
       both ways", and mstrAdoptSequences() has never carried them: they are
       computed from the SENDER's acceleration and travel, so on anyone
       else's droid they are the wrong numbers. Dropping them is right. Not
       saying so was not, because the consequence is invisible and lands two
       steps later — adopt, re-export, and the new header has no
       MPCA_SEQ_SPEEDS and no #error guard, so the ramp pacing is gone and
       the droid is jerky again with nothing to point at. */
    {field:'per-frame speed, if you ADOPT rather than replace', n:0,
     why:'taking this file wholesale keeps its frame speeds. Adopting the routines into a droid you have already configured does not: a frame speed is derived from the endpoints and acceleration it was authored against, so it is only true on the machine it came from. Re-export after an adopt and the header will pace those routines from the channel table instead.'}
  ];
  if(/#define\s+(?:SERVO_HZ|OSC_HZ|PCA_BOARDS)/.test(t))
    dropped.push({field:'oscillator and PWM frequency', n:0,
      why:'SERVO_HZ / OSC_HZ / PCA_BOARDS are real and they matter on the wire, but the channel table has nowhere to keep them. Keep the original header beside your sketch.'});
  if(generators)
    dropped.push({field:'generator sequences', n:generators,
      why:generators + ' oscillator/wander table(s) skipped: those are five-number entries rather than frames, and a generator that arrived from outside has no home in the sequence library.'});
  if(declared && +declared[1] !== servoCount)
    dropped.push({field:'declared channel count', n:+declared[1],
      why:'the file says ' + declared[1] + ' channels but ' + servoCount + ' rows were readable. The rows win; check the file was not truncated.'});

  const board = (typeof boardForCount === 'function') ? boardForCount(servoCount).id : 'mini24';
  const report = {
    fileName: fileName || 'sequences.h',
    board, servoCount,
    family: 'pca',
    seqInFile: sequences.length, seqRecovered: 0,
    /* a MaestroPCA header carries no Maestro script, and never could — the
       co-processor answers restartScript(n) by slot number instead. The
       .mstr exporter generates a real script on the way out. */
    scriptEmpty: true, scriptLoop: false, scriptFallThrough: false,
    seqSubs: [], frameSubs: 0,
    blankNames: channels.filter(c=>/^servo/i.test(c.mode) && c.autoName).length,
    dupNames: (function(){
      const seen = {}, dup = [];
      channels.forEach(c=>{ if(!/^servo/i.test(c.mode)) return;
        const k = (c.name||'').trim().toLowerCase(); if(!k) return;
        if(seen[k] !== undefined && dup.indexOf(seen[k]) < 0) dup.push(seen[k]);
        if(seen[k] !== undefined) dup.push(c.i); else seen[k] = c.i; });
      return dup;
    })(),
    nonServo,
    mapped: channels.filter(c=>c.act).length,
    dropped
  };
  /* v1.48.0 — the bricks our own generator commented in, back out (a
     CANDIDATE only; blocksTryAttach() decides — see mstrParse) */
  const bcm = /\/\* r2sim:blocks ([A-Za-z0-9+/=]+) \*\//.exec(t);
  const packedBlocks = (bcm && typeof blocksUnpack === 'function') ? blocksUnpack(bcm[1]) : null;
  if(packedBlocks) sequences.forEach(sq=>{ if(packedBlocks[sq.name]) sq.blocksCand = packedBlocks[sq.name]; });

  /* xmlText is deliberately null: there is no Pololu file behind this
     config, so buildMstrText() must GENERATE the whole .mstr rather than
     regex-patching one (export.js genFullMstr). */
  return { fileName: fileName || 'sequences.h', xmlText: null, servoCount,
           channels, sequences, subs: [], scriptText: '', header: {}, board,
           report, dropped };
}

/* ------------------------------------------- the other direction's losses
   Maestro table → PCA9685 header. Asymmetric with the list above, and the
   asymmetry is the point: speed and acceleration DO cross (the header has
   columns for them), while a channel's mode and homemode do not. */
function pcaExportDrops(channels, sequences){
  const list = Array.isArray(channels) ? channels : [];
  const seqs = Array.isArray(sequences) ? sequences : [];
  const servo = c => /^servo/i.test((c && c.mode) || '');
  const notGoto = list.filter(c=>servo(c) && /off|ignore/i.test(c.homemode || '')).length;
  const nonServo = list.filter(c=>c && !servo(c)).length;
  const inverted = list.filter(c=>c && c.invert).length;
  let saFrames = 0;
  seqs.forEach(q=>(q.frames||[]).forEach(f=>{ if(f.speeds || f.accels) saFrames++; }));
  return [
    {field:'homemode', n:notGoto,
     why:'the header carries a home TARGET only. Off and Ignore both become home 0, and the distinction is gone — ' + notGoto + ' channel(s) affected.'},
    {field:'neutral', n:list.length,
     why:'a Maestro 8-bit protocol scaling value with no PCA9685 equivalent. Not written.'},
    {field:'range', n:list.length,
     why:'the value that pairs with neutral. Not written.'},
    {field:'mode', n:nonServo,
     why:nonServo + ' channel(s) are Input or Output. A PCA9685 pin cannot read anything, so they keep their row (frame targets index by channel number) with pin 255 = unused, and their travel is written as zero.'},
    {field:'invert', n:inverted,
     why:'inverted travel is retired in v1.46.0. ' + inverted + ' channel(s) carry the old flag; it is adopted into their min/max pair on load and dropped here, which is the same movement.'},
    /* v1.68.1 — this said the whole row was dropped, and it had been false
       since v1.66.0: pca-gen.js writes the speeds, doubles the stride and
       flags the sequence MPCA_SEQ_SPEEDS, and pcaseq.js sets the speed
       BEFORE the target. It was printed on every single header export,
       including the ones that were writing the speeds it claimed to lose. */
    {field:'frame acceleration', n:saFrames,
     why:saFrames + ' frame(s) carry their own speed/acceleration rows. The SPEEDS are written (the stride doubles and the sequence is flagged MPCA_SEQ_SPEEDS, which needs MaestroPCA v1.66.0 or later); the accelerations are not, so the channel table\'s acceleration still shapes the ends of every move.'},
    {field:'the Maestro script', n:0,
     why:'a Maestro answers restartScript(n) by running a subroutine; the co-processor answers the same call by slot number. The script is not written, and does not need to be.'}
  ];
}
/* one sentence, names first — the shape Mike reads */
function pcaExportDropNote(list){
  const l = (list || pcaExportDrops(
    (typeof MSTR !== 'undefined' && MSTR.channels) || [],
    (typeof loadoutSeqs === 'function') ? loadoutSeqs() : []));
  return 'not carried into a PCA9685 header: ' + l.map(d=>d.field).join(', ')
       + ' — the log says what each one means.';
}
