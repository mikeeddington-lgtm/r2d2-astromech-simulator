'use strict';
/* ============================================================== PCA GEN
   Generates the sequences.h consumed by arduino/MaestroPCA — the cheap
   PCA9685 route for people who don't want to buy a Maestro. ONE generator,
   two front-ends:

     pcaGenFromLoadout()   the sim's own state: MSTR.channels verbatim +
                           the LOADOUT in order, so slot numbers match the
                           .mstr script this sim would export — the sketch
                           does not care which board it is talking to.
     pcaGenFromParsed(P)   a freshly parsed .mstr (mstrParse result). Slot
                           order follows the SCRIPT's sequence subroutines
                           when the file has a script — that is what
                           restartScript(n) actually addressed on the real
                           board — and falls back to <Sequences> order.

   The channel table is copied through VERBATIM (names, min, max, home,
   speed, acceleration): endpoints are personal calibration and this
   generator has no opinions about them.

   This file is SHARED with PCA Studio, which is built from it — the two
   tools must emit byte-identical headers from the same project, and a
   copy is not a guarantee. The sim-only front-ends live in pca-gen-sim.js
   because they read MSTR/LOADOUT, which Studio does not have.
   ===================================================================== */

function pcaCName(s){
  const t = String(s).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return t || 'SEQ';
}

/* A NAME IS ABOUT TO BECOME PART OF A C COMMENT (v1.69.0).

   Two characters in a name break this file, and both were reproduced from a
   routine somebody could plausibly type:

     `* /`   ends the comment early. Everything after it becomes CODE — the
             rest of the name, the next `* /`, and whatever the user wrote —
             so the header stops compiling, or worse, compiles.
     newline splits the comment across the line the parser reads it from.

   Neither is only a compile problem, because these comments are not
   decoration: pcaHeaderParse reads the routine's real name back OUT of the
   one after the opening brace (pcaCName has stripped the spaces from the
   symbol, so this is the only place it survives), and blocksTryAttach()
   matches its bricks on that name. A name truncated at a `* /` therefore
   loses the routine its editable blocks as well as its label — the reader
   never sees an error, it just gets a different, shorter name.

   The acts and blocks sidecars at the foot of the file are base64 for
   exactly this reason, and the comment above them says so. This path had
   the same problem and none of the same care. One function, used by every
   place a name reaches a comment, and MIRRORED by pcaRowMeta in import.js so
   the reader agrees about what a name may contain. `* /` becomes `* /` with
   a space: it is still readable as what the user typed, it cannot close a
   comment, and it survives the round trip byte-for-byte. */
function pcaCommentSafe(name){
  return String(name == null ? '' : name)
           .replace(/\*\//g,'* /')
           .replace(/[\r\n]+/g,' ');
}

/* board/pin assignment: channel i → PCA9685 (i>>4) pin (i&15). Non-servo
   channels keep their row (frame targets index by channel number) but get
   pin 255 = unused. */
function pcaGenHeader(channels, sequences, meta){
  const m = meta || {};
  const n = channels.length;
  const boards = Math.max(1, Math.ceil(n/16));
  const src = m.source || 'sim';
  /* A ROUTINE WITH NO FRAMES IS NOT A ROUTINE (v1.69.0). Control Center
     writes `<Sequence name="X"></Sequence>` for one you created and never
     filled in; it imports as zero frames and loadoutReset() puts it on the
     board with everything else. Writing it out produced

         static const uint16_t MPCA_SEQ3[] PROGMEM = {
         };

     which is not legal C++ — a zero-length array — so the whole header
     stopped compiling, on a line nobody had authored, over a routine the
     builder never mentioned. The slot table then carried `{ MPCA_SEQ3, 0, 0 }`
     for it, which the library would have walked as a sequence with no frames
     and dropped on its first update() anyway.

     So it is left out. That RENUMBERS every slot after it, which is a real
     consequence and not one to bury: the dropped names are printed in the
     header where the next reader of the file will find them, and lint.js has
     a `seq-empty` rule so the builder says it BEFORE the export rather than
     the compiler saying something else afterwards. A generator sequence
     legitimately has no `frames` — it carries `entries` — and is kept. */
  const isGen = q => !!q && (q.gen === 'osc' || q.gen === 'wander');
  const hasBody = q => !!q && (isGen(q) ? true : !!((q.frames||[]).length));
  const seqAll  = sequences || [];
  const seqs    = seqAll.filter(hasBody);
  const skipped = seqAll.filter(q=>!hasBody(q));
  let s = '';
  const ver = m.appVersion
    || (typeof APP_VERSION    !== 'undefined' ? APP_VERSION    : null)
    || (typeof STUDIO_VERSION !== 'undefined' ? STUDIO_VERSION : '?');
  s += '/* sequences.h — generated by the R2-D2 Simulator v'+ver+'\n';
  s += '   Source: '+src+' ('+n+' channels, '+seqs.length+' sequence'+(seqs.length===1?'':'s')+')\n';
  if(skipped.length){
    s += '\n   NOT WRITTEN — '+skipped.length+' routine'+(skipped.length===1?'':'s')+' with no frames:\n';
    skipped.forEach(q=>{ s += '     "'+pcaCommentSafe(q && q.name)+'"\n'; });
    s += '   A zero-frame routine has nothing to compile to, so it is left out\n';
    s += '   and the slots below it move DOWN by one each. Check any\n';
    s += '   restartScript(n) numbers hard-coded in your sketch against the\n';
    s += '   MPCA_SLOT_* defines at the foot of this file.\n';
  }
  s += '   Consumed by the MaestroPCA library (arduino/MaestroPCA).\n';
  s += '\n';
  s += '   Wiring: channel i lives on PCA9685 board (i/16), pin (i%16).\n';
  /* v1.63.0 — this used to print "board 0 -> 0x40, board 1 -> 0x41" and so
     on, which stopped being true in v1.53.0 when the sketches started
     FINDING their boards instead of assuming consecutive addresses from
     0x40. Mike's own question is why they scan: "I and others may jumper
     them differently". A generated header that names addresses the boot
     scan may never use is worse than one that names none — somebody wires
     to the comment. So it says what decides it instead. */
  for(let b=0;b<boards;b++) s += '     board '+b+' -> channels '+(b*16)+'..'+Math.min(n-1,b*16+15)+'\n';
  s += '     Board numbers are ASCENDING I2C ADDRESS as found by the boot\n';
  s += '     scan (0x40-0x7F, All Call excluded) — bridge whichever jumpers\n';
  s += '     suit the build. The sketch prints the mapping it settled on.\n';
  s += '\n';
  s += '   MPCA_CHANNELS BELOW IS FIXED WHEN YOU FLASH THIS. A PCA9685 added\n';
  s += '   to the bus afterwards is found and woken, and live drive reaches\n';
  s += '   it, but no routine does — the sketch prints it as "spare". Add a\n';
  s += '   board, regenerate this file, re-flash.\n';
  s += '   Targets are QUARTER-MICROSECONDS (6000 = 1500 us), straight from\n';
  s += '   the Maestro channel table — endpoints are YOUR calibration.\n';
  s += '   Calibrate the PCA9685 oscillator (maestro.begin(<hz>)) or these\n';
  s += '   values are only nominal on the wire. */\n';
  /* QUOTED, not <angled> (v1.66.4). An angled include is only ever found on
     the LIBRARY path, so a generated header that uses one cannot be compiled
     from a sketch folder carrying its own copy of MaestroPCA — the IDE answers
     "MaestroPCA.h: No such file or directory" with the file sitting two lines
     away in the same directory. A quoted include searches the including file's
     own folder FIRST and the library path afterwards, so it works both ways.
     Found by Mike's compiler on a real flash, twice: once in the .ino and then
     again here, because this file writes its own include and never read it. */
  s += '#pragma once\n#include "MaestroPCA.h"\n\n';
  /* THE GUARD (v1.66.0). A header WITHOUT speeds works against any version of
     the library, so it gets no guard and nothing changes for anybody. A header
     WITH them read by a library that predates MPCA_SEQ_SPEEDS is the dangerous
     direction and it is silent: the old code would walk the rows with the
     single stride, read speeds as targets, and drive channels to numbers
     nobody asked for. There is no runtime tell — the frames just look wrong —
     so it has to fail at COMPILE time, next to the fix. */
  const anySpeeds = seqs.some(q=>
    !isGen(q) &&
    ((q && q.frames) || []).some(fr=>fr.speeds && fr.speeds.some(v=>v)));
  if(anySpeeds){
    s += '/* This file carries a SPEED per channel per frame, which needs a\n';
    s += '   MaestroPCA library of v1.66.0 or later. An older copy would read the\n';
    s += '   rows at the wrong stride and drive the wrong channels, quietly. */\n';
    s += '#ifndef MPCA_SEQ_SPEEDS\n';
    s += '#error "This sequences.h needs MaestroPCA v1.66.0 or later (MPCA_SEQ_SPEEDS). Update arduino/MaestroPCA in your libraries folder, or regenerate this file from a build that does not use per-frame speeds."\n';
    s += '#endif\n\n';
  }
  s += '#define MPCA_CHANNELS  '+n+'\n';
  s += '#define MPCA_SEQUENCES '+seqs.length+'\n';
  /* Pololu's restartScript() sends the subroutine number as 7-BIT data
     (write7BitData masks with 0x7F), so over the serial link slot 130
     would silently fire slot 2.

     WHAT THE SECOND SENTENCE USED TO SAY (and why it changed, v1.69.0). It
     said "Direct restartScript() calls on this board are unaffected", which
     was true of the code in this repository and false of the code on the
     droid. v1.69.0 widened Track::seq to int16_t precisely BECAUSE it was
     false: in an int8_t a slot of 128 is negative, and negative is how a
     track says it is free, so update() skipped the track and the routine
     never played — while sequenceRunning() compared against the same
     truncated value, matched it, and reported the thing as running. A board
     that says it is doing something and is not is the worst of the three
     outcomes, and a generated header that promises it is worse still.

     So the sentence names the version instead of the API, and the #warning
     is backed by a hard #error. A #warning is the wrong instrument here:
     it scrolls past in the IDE, and this route's whole point is a droid
     with no serial monitor attached. The guard keys on MPCA_MASK_WORDS
     because that symbol is defined by exactly the library revision that
     also stores Track::seq as an int16_t (arduino/MaestroPCA/src/
     MaestroPCA.h) — there is no version macro to test, and a symbol that
     arrived with the same change is a truer test than one anyway. A file
     inside 128 sequences carries neither, so nothing changes for anybody
     who is not standing on this edge. */
  if(seqs.length > 128){
    s += '#warning More than 128 sequences: over the Maestro serial protocol the\n'
       + '// subroutine number is 7-bit, so slots above 127 wrap (130 -> 2). Direct\n'
       + '// restartScript() calls DO reach slots 128-255, but only on a MaestroPCA\n'
       + '// that stores a track\'s sequence number in an int16_t. An older copy\n'
       + '// truncates it: the slot stores negative, the track reads as FREE so the\n'
       + '// routine never plays, and sequenceRunning() matches the same truncated\n'
       + '// value and reports it as running anyway.\n';
    s += '#ifndef MPCA_MASK_WORDS\n';
    s += '#error "This sequences.h has more than 128 sequences. Slots 128-255 need a MaestroPCA that stores Track::seq as an int16_t (the same version that defines MPCA_MASK_WORDS). Update arduino/MaestroPCA, or keep the table to 128 sequences or fewer."\n';
    s += '#endif\n';
  }
  s += '\n';

  s += '/* releaseMs: stop pulsing this long after arriving — a parked panel\n';
  s += '   then draws nothing and makes no noise. ONLY safe where the part\n';
  s += '   rests in place on its own; a servo holding against gravity drops.\n';
  s += '   0 = hold forever, which is a real Maestro\'s only behaviour. */\n';
  s += '/*  board pin    min    max   home  speed accel  release  ease */\n';
  s += 'const MpcaChannelDef MPCA_CHANNEL_TABLE[MPCA_CHANNELS] PROGMEM = {\n';
  const EASE = {soft:'MPCA_EASE_SOFT', overshoot:'MPCA_EASE_OVERSHOOT'};
  channels.forEach((c,i)=>{
    const servo = /^servo/i.test(c.mode||'Servo');
    const home = servo ? (/off|ignore/i.test(c.homemode||'') ? 0 : (c.home|0)) : 0;
    const pad = (v,w)=>String(v).padStart(w);
    const ease = servo ? (EASE[c.ease] || 'MPCA_EASE_NONE') : 'MPCA_EASE_NONE';
    s += '  { '+pad(i>>4,2)+', '+pad(servo? (i&15):255,3)+', '+pad(servo?c.min|0:0,5)+', '+pad(servo?c.max|0:0,5)+', '
       + pad(home,5)+', '+pad(servo?c.speed|0:0,4)+', '+pad(servo?c.acceleration|0:0,4)+', '
       + pad(servo?c.releaseMs|0:0,7)+', '+ease.padEnd(19)+' },'
       + '   /* ch'+String(i).padStart(2)+' '+pcaCommentSafe(c.name||'')+(servo?'':' — '+(c.mode||'')+', unused')+' */\n';
  });
  s += '};\n\n';

  s += '/* Frame stride = 1 duration + '+n+' targets — or 1 + '+n+' targets + '+n+'\n';
  s += '   speeds on a sequence flagged MPCA_SEQ_SPEEDS, which is how a ramp is\n';
  s += '   paced so the move fills its frame instead of being chased flat out.\n';
  s += '   A speed of 0 there means the channel keeps its own setting.\n';
  s += '   0 = channel not driven\n';
  s += '   by that frame (the Maestro sequencer convention).\n';
  s += '   Sequences on disjoint channels play AT THE SAME TIME; one that\n';
  s += '   claims a channel another is using displaces it. MPCA_SEQ_LOOP\n';
  s += '   repeats until stopped or displaced. */\n';
  const seqNames = [];
  const seqSpeeds = [];
  const seqRows   = [];        /* rows actually emitted — NOT frames, see below */
  seqs.forEach((seq,k)=>{
    if(isGen(seq)){
      s += 'static const uint16_t MPCA_SEQ'+k+'[] PROGMEM = {   /* '+pcaCommentSafe(seq.name)
         + ' — '+(seq.gen==='osc'?'oscillator':'wander')+' */\n';
      s += '  /* ch, lo, hi, periodMs, phase */\n';
      (seq.entries||[]).forEach(g=>{
        s += '  '+String(g.ch|0).padStart(3)+', '+String(g.lo|0).padStart(5)+', '
           + String(g.hi|0).padStart(5)+', '+String(g.period|0).padStart(6)+', '
           + String(g.phase|0).padStart(4)+',\n';
      });
      s += '};\n';
      seqNames.push(seq.name);
      return;
    }
    /* THE SPEEDS RIDE WITH THE TARGETS (v1.66.0), when the compiler put any
       there. The stride doubles and MPCA_SEQ_SPEEDS tells the library so —
       see MaestroPCA.h. A routine with no speeds writes exactly the rows it
       always did, so nothing that does not need this changes at all. */
    const hasSpeeds = seq.frames.some(fr=>fr.speeds && fr.speeds.some(v=>v));
    seqSpeeds[k] = hasSpeeds;
    /* the comment after the brace is the ONLY place the routine's real name
       survives (pcaCName strips the spaces out of the symbol), and
       pcaHeaderParse reads it back as the name — so nothing else may go in
       it. Adding "— duration, targets, then speeds" here renamed every
       imported routine and cost it its bricks; the stride is explained once,
       above the sequences, where it belongs. */
    s += 'static const uint16_t MPCA_SEQ'+k+'[] PROGMEM = {   /* '+pcaCommentSafe(seq.name)+' */\n';
    /* A FRAME LONGER THAN 65535 ms IS SPLIT, NOT CLAMPED (v1.69.0). The
       duration column is one uint16 and always was, so a 90 s hold used to
       leave here as 65.5 s — Math.min() with nothing said anywhere, not in
       the receipt, not in the log, not in the file. The droid then held the
       pose for two thirds of the time the sequencer showed, and the only
       way to find out was to stand there with a stopwatch.

       Splitting is exact rather than approximate, which is why it is worth
       doing instead of merely reporting. A frame is `duration, targets…`
       and a target of 0 means THIS FRAME DOES NOT DRIVE THIS CHANNEL — the
       Maestro convention the whole table is built on — so a row of all
       zeros is a pure delay that touches nothing. A target already given
       persists until something else changes it, on the real Maestro, on the
       co-processor and in pcaseq.js alike. So one 90000 ms frame becomes
       65535 with the targets on it, then 24465 with none: identical
       commands at identical times, and identical total length. Nothing is
       lost and nothing has to be explained to the user afterwards.

       It costs the sequence extra ROWS, which is why the slot table below
       counts what was emitted rather than seq.frames.length — getting that
       wrong would run the sequence off the end of its own array. Reading
       the file back gives the two rows as two frames, which is the same
       motion in the same time; the sequencer's own frame is unchanged
       because nothing here writes back to it. */
    let rows = 0;
    seq.frames.forEach(fr=>{
      const tg = [];
      for(let c=0;c<n;c++) tg.push(Math.max(0, Math.min(65535, fr.targets[c]|0)));
      const sp = [];
      if(hasSpeeds) for(let c=0;c<n;c++){
        const v = (fr.speeds && fr.speeds[c]) | 0;
        /* 0 means "leave the channel's own speed alone", so a frame that
           genuinely wants no limit has to say MPCA_SPEED_FREE instead */
        sp.push(v > 0 ? Math.min(16000, v) : 0);
      }
      const zeros = tg.map(()=>0);
      let left = Math.max(0, fr.duration|0);
      let first = true;
      do{
        const dur  = Math.min(65535, left);
        /* the commands ride on the FIRST row; the continuations are the
           same hold, spelled as the delay it always was */
        const cells = first ? tg : zeros;
        let row = '  '+String(dur).padStart(5)+', '+cells.join(', ');
        if(hasSpeeds) row += ',   ' + (first ? sp : zeros).join(', ');
        s += row + ',\n';
        rows++;
        left -= dur;
        first = false;
      }while(left > 0);
    });
    seqRows[k] = rows;
    s += '};\n';
    seqNames.push(seq.name);
  });
  s += '\nconst MpcaSeqDef MPCA_SEQ_TABLE[MPCA_SEQUENCES] PROGMEM = {\n';
  seqs.forEach((seq,k)=>{
    const f = [];
    if(seq.loop) f.push('MPCA_SEQ_LOOP');
    if(seq.background) f.push('MPCA_SEQ_BACKGROUND');
    if(seq.gen === 'osc') f.push('MPCA_SEQ_OSC');
    if(seq.gen === 'wander') f.push('MPCA_SEQ_WANDER');
    if(seqSpeeds[k]) f.push('MPCA_SEQ_SPEEDS');
    /* the number of ROWS in MPCA_SEQ<k>, which is seq.frames.length only
       when no frame had to be split — see the note by the split above */
    const count = isGen(seq) ? (seq.entries||[]).length : seqRows[k];
    const note = [seq.gen === 'osc' ? 'sweeps' : null,
                  seq.gen === 'wander' ? 'wanders' : null,
                  (seq.loop && !isGen(seq)) ? 'loops' : null,
                  seq.background ? 'background — resumes when its channels free up' : null
                 ].filter(Boolean).join(', ');
    s += '  { MPCA_SEQ'+k+', '+count+', '+(f.length?f.join(' | '):'0')+' },'
       + '   /* '+k+': '+pcaCommentSafe(seq.name)+(note?' ('+note+')':'')+' */\n';
  });
  s += '};\n\n';

  /* slot defines — restartScript(MPCA_SLOT_...) reads better than a bare n */
  const used = {};
  seqNames.forEach((nm,k)=>{
    let id = 'MPCA_SLOT_'+pcaCName(nm);
    while(used[id]) id += '_';
    used[id] = true;
    s += '#define '+id+' '+k+'\n';
  });
  /* v1.48.0 — the bricks ride along as a comment the compiler ignores, so
     importing this file back gives EDITABLE routines when the endpoints
     still agree (blocksPack()/blocksTryAttach(), maestro/blocks.js).
     base64: `* /` cannot occur, so the comment cannot end early. */
  const packed = (typeof blocksPack === 'function') ? blocksPack(seqs) : '';
  if(packed) s += '\n/* r2sim:blocks '+packed+' */\n';
  /* v1.48.1 — and the part mapping, for the same reason and by the same
     means: a MaestroPCA table has no column for "which panel", so without
     this a wholesale import re-derives it with guessPart(name) and re-wires
     a droid whose channel names disagree with the CAD's numbering
     (export.js mstrActsComment carries the whole argument). */
  const packedActs = (typeof actsPack === 'function') ? actsPack(channels) : '';
  if(packedActs) s += '\n/* r2sim:acts '+packedActs+' */\n';
  return s;
}
