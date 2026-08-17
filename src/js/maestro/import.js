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

  /* if the file carried no <Sequences>, rebuild them from the script subs */
  let recovered = 0;
  subs.forEach(s=>{
    if(s.kind!=='sequence') return;
    const match = sequences.findIndex(q=>niceName(q.name).toLowerCase()===s.name.toLowerCase());
    if(match>=0){ s.seqIndex=match; return; }
    const fr = subToFrames(s, byName, servoCount);
    if(fr.length){
      sequences.push({name:s.name, frames:fr});
      s.seqIndex = sequences.length-1;
      recovered++;
    }
  });

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
  MSTR.subs=P.subs; MSTR.scriptText=P.scriptText; MSTR.header=P.header; MSTR.board=P.board;
  MSTR.report=P.report;
  if(typeof servoStoreSave === 'function') servoStoreSave();
  const {servoCount, channels, sequences, subs, board} = P;
  const fileName = P.fileName, recovered = P.report.seqRecovered;
  /* the file's own sequence order already IS its subroutine order, so
     everything it carries starts out loaded onto the board */
  loadoutReset();
  EDIT.live = channels.map(c=>c.home||c.neutral||DEFAULT_NEUTRAL);
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
    if(a.act && byAct[a.act]){ dst = byAct[a.act]; via = 'act'; }
    else if(a.name && !a.autoName && byName[a.name.trim().toLowerCase()]){
      dst = byName[a.name.trim().toLowerCase()]; via = 'name';
    }
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
function mstrRetargetFrame(targets, pairs){
  const t = new Array(MSTR.servoCount).fill(0);
  for(const {src, dst} of pairs){
    const v = targets[src.i];
    if(!v) continue;                                 // 0 = untouched, stays untouched
    const cA = blockClosed(src), oA = blockOpen(src);
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
  P.sequences.forEach(sq=>{
    if(!sq.frames || !sq.frames.length) return;
    const frames = sq.frames.map(f=>{
      if(f.speeds || f.accels) dropped++;
      return {name:f.name || '', duration:f.duration, targets:mstrRetargetFrame(f.targets, pairs)};
    });
    let name = sq.name;
    while(MSTR.sequences.some(s=>s.name === name)) name = name + '·';
    MSTR.sequences.push({name, frames, cat});          // plain frame list — never blocks
    added.push(name);
  });
  if(typeof reindexSubs === 'function') reindexSubs();
  /* NOT loadoutReset(): what reaches the board stays exactly what you chose */
  lg('mae','adopted '+added.length+' sequence(s) from '+P.fileName+' onto YOUR servo settings');
  lg('mae','  channels matched: '+how.act+' by part, '+how.name+' by name, '+how.index+' by number'
     + (unmatched.length ? ' · dropped source channel(s) '+unmatched.join(', ')+' (no match on your droid)' : ''));
  if(dropped) lg('mae','  per-frame speed/accel rows discarded — your channel settings govern the motion');
  return {added, how, unmatched, cat};
}
