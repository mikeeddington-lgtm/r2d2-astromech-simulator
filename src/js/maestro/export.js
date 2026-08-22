'use strict';
/* ============================================================== EXPORT */
function frameSubName(chs){
  let name='frame_', idx=0;
  while(true){
    let end=idx+1;
    while(end<chs.length && chs[end-1]+1===chs[end]) end++;
    const a=chs[idx], b=chs[end-1];
    if(b===a) name+=a;
    else if(b===a+1) name+=a+'_'+b;
    else name+=a+'..'+b;
    if(end===chs.length) return name;
    idx=end; name+='_';
  }
}
function genFrameSub(chs){
  let s='sub '+frameSubName(chs)+'\n';
  for(let i=chs.length-1;i>=0;i--) s+='  '+chs[i]+' servo\n';
  s+='  delay\n  return\n';
  return s;
}
function genSeqBody(seq, enabled, neededLists){
  let s='', last=null;
  for(const fr of seq.frames){
    const chs=[], tg=[];
    for(const c of enabled){
      if(last===null || fr.targets[c]!==last.targets[c]){ chs.push(c); tg.push(fr.targets[c]); }
    }
    last=fr;
    if(tg.length){
      const key=chs.join(',');
      if(!neededLists.some(l=>l.join(',')===key)) neededLists.push(chs.slice());
    }
    s+='  '+fr.duration+' ';
    if(!tg.length) s+='delay';
    else{
      let n=0;
      for(const t of tg){
        if(n===6){ s+='\n  '; n=0; }
        n++; s+=t+' ';
      }
      s+=frameSubName(chs);
    }
    s+=' # '+fr.name+'\n';
  }
  return s;
}
/* A script made only of subroutines FALLS THROUGH. With no top-level code
   the program counter starts at 0, runs straight into the first subroutine's
   body, and hits its `return` with an empty call stack — Maestro error
   0x0080, "Subroutine call overflow/underflow" — while the droid physically
   performs that first sequence. Control Center's Run Script button is what
   exposes it. One bare `quit` above the first `sub` stops it dead, and
   because `quit` is not a subroutine it does not shift restartScript()
   numbering by one. Confirmed on Mike's Mini 18, 2026-07-29. */
const SCRIPT_PREAMBLE =
  '# No main program: every sequence below is a subroutine, called by\n' +
  '# restartScript(0..7) from the microcontroller. The bare quit stops\n' +
  '# Run Script falling through into the first sequence and returning\n' +
  '# with an empty call stack, which is error 0x0080.\n' +
  'quit\n\n';

/* ------------------------------------------------- UNIQUE SUB SYMBOLS
   niceName() strips every character that is not a letter, a digit or an
   underscore — which is the right rule for a Maestro identifier and the
   wrong one to leave unguarded, because it makes DIFFERENT routine names
   collapse onto the SAME symbol:

     "Dome Wave"  and  "Dome_Wave"   — both typed by hand
     "Wave"       and  "Wave·"       — the suffix mstrAdoptSequences adds
                                       so an import renames rather than
                                       overwrites (import.js)

   Two `sub Dome_Wave` blocks is a compile error in Control Center, and in
   here it was worse than an error: the sub index resolved both by name, so
   both pointed at the FIRST routine and restartScript(1) played routine 0.

   Uniqueness is settled HERE, on the emitted symbol, and never on the
   library name — the name in the sequencer is the user's and is not ours
   to rewrite. A clash appends _2, _3 … in loadout order, so the routine
   that was already on the board keeps the symbol it had. A symbol that
   would start with a digit gets an s_ in front for the same reason a bare
   `2` cannot be a subroutine name: the compiler reads it as a literal.
   (v1.68.1) */
function scriptSubNames(sequences){
  const used = Object.create(null), out = [];
  for(const seq of (sequences || [])){
    let base = niceName((seq && seq.name) || '') || 'sequence';
    if(/^[0-9]/.test(base)) base = 's_' + base;
    let name = base, n = 2;
    while(used[name.toLowerCase()]) name = base + '_' + (n++);
    used[name.toLowerCase()] = true;
    out.push(name);
  }
  return out;
}
/* the symbol a routine will actually be exported under, for the three places
   that SHOW it — the pane, the loadout builder and the sequencer header. A
   routine that is not on the board has no subroutine yet, so it shows the
   name it would get if it were added last. */
function scriptSubNameFor(seq){
  const load = (typeof loadoutSeqs === 'function') ? loadoutSeqs() : [];
  const k = load.indexOf(seq);
  if(k >= 0) return scriptSubNames(load)[k];
  return scriptSubNames(load.concat([seq]))[load.length];
}

/* matches Sequence.generateSubroutineList() in the SDK, plus the preamble */
function genScript(sequences, enabled){
  const needed=[]; let s=SCRIPT_PREAMBLE;
  const names = scriptSubNames(sequences);
  (sequences || []).forEach((seq,k)=>{
    s += '# '+seq.name+'\nsub '+names[k]+'\n';
    s += genSeqBody(seq, enabled, needed);
    s += '  return\n';
  });
  for(const cl of needed) s += '\n'+genFrameSub(cl);
  return s;
}
/* A <Frame> body is THREE sections, not one:
       <targets x N>  s  <speeds x N>  a  <accelerations x N>
   with `s` and `a` as literal markers. Control Center has written frames
   this way for years; the sim used to emit only the targets, which parses
   but does not match what the user's own file looks like, and loses any
   per-frame speed/acceleration they set. */
function genFrameRow(fr, n){
  const pad = (a)=>{ const v=[]; for(let i=0;i<n;i++){ const x=a && a[i]; v.push((x==null)?0:x); } return v.join(' '); }; // v1.39.5: a hole in a compiled frame must serialise as 0, or the row loses a column and a round-trip drives the wrong servos
  return pad(fr.targets)+' s '+pad(fr.speeds)+' a '+pad(fr.accels);
}
function genSequencesXml(sequences, indent){
  const p=indent||'  ';
  const n=MSTR.servoCount||MSTR.channels.length;
  let s=p+'<Sequences>\n';
  for(const seq of sequences){
    s+=p+'  <Sequence name="'+xmlEsc(seq.name)+'" useSpeedAndAcceleration="'+(seq.useSA?'true':'false')+'">\n';
    for(const fr of seq.frames){
      s+=p+'    <Frame name="'+xmlEsc(fr.name)+'" duration="'+fr.duration+'">'+genFrameRow(fr,n)+'</Frame>\n';
    }
    s+=p+'  </Sequence>\n';
  }
  s+=p+'</Sequences>';
  return s;
}
/* Pololu's own byte conventions, so a generated file is indistinguishable
   from one Control Center saved: no BOM, CRLF for the XML structure, bare LF
   inside the <Script> body, and no trailing newline after </UscSettings>. */
function mstrBytes(text){
  let t = String(text).replace(/\r\n/g,'\n');
  const MARK = '<Script';
  const i = t.indexOf(MARK);
  if(i < 0) return t.replace(/\n/g,'\r\n').replace(/\r\n$/,'');
  const open = t.indexOf('>', i) + 1;
  const close = t.indexOf('<\/Script>', open);   // escaped so the inliner leaves it alone
  if(open <= 0 || close < 0) return t.replace(/\n/g,'\r\n').replace(/\r\n$/,'');
  const head = t.slice(0, open).replace(/\n/g,'\r\n');
  const body = t.slice(open, close);                       // LF inside the script
  const tail = t.slice(close).replace(/\n/g,'\r\n').replace(/\r\n$/,'');
  return head + body + tail;
}
/* ============================================================ THE LOADOUT
   Mike, 2026-07-27: "playing in the sequencer shouldn't change the Maestro
   scripts — that should be a separate operation. In the sequencer you can
   save, load etc… then we have a separate step under the Maestro tab to
   select and order which sequences are loaded."

   So the LIBRARY and the BOARD are two different things:

     MSTR.sequences  every routine you have ever saved. Building, playing,
                     renaming and saving in the sequencer only ever touches
                     this. It is what the .mstr's <Sequences> block carries,
                     which is also what Control Center shows you.

     MSTR.loadout    an ordered list of names — the routines that actually
                     get compiled into the <Script>. Because the script is
                     what defines the subroutines, THIS list decides which
                     number restartScript(n) hits. Nothing adds itself to it
                     from the sequencer; you put it there on the Maestro tab.

   `null` means "all of them", which is the right answer for a file that has
   just been imported: its own order is already the subroutine order. Every
   place that replaces the whole sequence list calls loadoutReset() to turn
   that into an explicit list, so a routine saved afterwards stays off the
   board until it is added. */
function loadoutNames(){
  if(!MSTR.loadout) return MSTR.sequences.map(s=>s.name);
  return MSTR.loadout.filter(n=>MSTR.sequences.some(s=>s.name === n));
}
function loadoutSeqs(){
  return loadoutNames().map(n=>MSTR.sequences.find(s=>s.name === n)).filter(Boolean);
}
function loadoutReset(){ MSTR.loadout = MSTR.sequences.map(s=>s.name); }
/* THE sub index — the table restartScript(n) is answered from. It was
   written out twice, here and in starters.js, and both copies resolved a
   sub back to its routine by NAME, which is precisely the lookup that
   scriptSubNames() exists to stop trusting. The k-th sequence subroutine is
   the k-th routine in the LOADOUT, because that is the order genScript()
   emits them in — no searching required. (v1.68.1) */
function rebuildSubIndex(){
  const load = loadoutSeqs();
  const script = genScript(load, enabledChannels());
  MSTR.scriptText = script;
  const raw = (typeof parseScriptSubs === 'function') ? parseScriptSubs(script) : [];
  let k = 0;
  MSTR.subs = raw.map(s=>{
    const kind = /^frame_/i.test(s.name) ? 'frame' : 'sequence';
    const seqIndex = (kind === 'sequence') ? MSTR.sequences.indexOf(load[k++]) : -1;
    return {index:s.index, name:s.name, body:s.body, kind:kind, seqIndex:seqIndex};
  });
}
function loadoutIndex(name){ return loadoutNames().indexOf(name); }
function loadoutAdd(name){
  if(!MSTR.loadout) loadoutReset();
  if(MSTR.loadout.indexOf(name) < 0) MSTR.loadout.push(name);
  if(typeof reindexSubs === 'function') reindexSubs();
}
function loadoutDrop(name){
  if(!MSTR.loadout) loadoutReset();
  const i = MSTR.loadout.indexOf(name);
  if(i >= 0) MSTR.loadout.splice(i, 1);
  if(typeof reindexSubs === 'function') reindexSubs();
}
function loadoutMove(name, dir){
  if(!MSTR.loadout) loadoutReset();
  const i = MSTR.loadout.indexOf(name); if(i < 0) return;
  const j = i + dir; if(j < 0 || j >= MSTR.loadout.length) return;
  const t = MSTR.loadout[i]; MSTR.loadout[i] = MSTR.loadout[j]; MSTR.loadout[j] = t;
  if(typeof reindexSubs === 'function') reindexSubs();
}
/* a rename in the library has to follow through, or the routine silently
   falls off the board */
function loadoutRename(oldName, newName){
  if(!MSTR.loadout) return;
  const i = MSTR.loadout.indexOf(oldName);
  if(i >= 0) MSTR.loadout[i] = newName;
}

/* =====================================================================
   THE CHOREOGRAPHY BACKUP (v1.46.0)

   Mike, today, on the import chooser: "When importing Choreography give
   them the option to save existing and replace" — and, asked what "save"
   means: a download. So the sequence library needs a file of its own. It
   had none: `exportMstr()` writes the library inside a Pololu settings
   file (no good to a PCA builder, and it drags the channel table along),
   and `setupExport()` writes the whole droid.

   IT IS NOT A NEW FORMAT. The routines and the channel table they were
   choreographed against go under `maestro`, which is the shape
   servoCfgImportText() already reads (from:'setup') and impShape()
   already understands — so this file goes back in through the one reader
   and through the chooser like any other. A backup the app cannot read
   back would be a worse trap than no backup at all.

   The channel table rides along because a frame target is a number tuned
   against particular endpoints: without them the routines in this file
   cannot be re-expressed onto anybody's droid, including yours after the
   next recalibration.
   ===================================================================== */
const SEQ_LIB_KIND = 'r2sim.choreography';
const SEQ_LIB_VER  = 1;
function seqLibExportObj(){
  const chans = (typeof MSTR !== 'undefined' && MSTR.channels) ? MSTR.channels : [];
  const seqs  = (typeof MSTR !== 'undefined' && MSTR.sequences) ? MSTR.sequences : [];
  return {
    kind: SEQ_LIB_KIND,
    version: SEQ_LIB_VER,
    app: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '',
    board: (typeof MSTR !== 'undefined') ? MSTR.board : '',
    count: seqs.length,
    maestro: {
      board: (typeof MSTR !== 'undefined') ? MSTR.board : '',
      /* `act` is carried here and NOWHERE else it could do harm: the reader
         never copies it into a channel (servo-cfg.js says why), but the
         retargeter matches on it first, so a routine saved today lands on
         the right panel when it is read back onto a re-wired board. */
      channels: chans.map((c,i)=>Object.assign({i:i},
        (typeof servoCfgFrom === 'function') ? servoCfgFrom(c || {}) : {},
        {act:(c && c.act) || ''})),
      sequences: JSON.parse(JSON.stringify(seqs)),
      loadout: (typeof loadoutNames === 'function') ? loadoutNames() : []
    }
  };
}
/* Returns the filename it wrote, and THROWS if it could not write one.
   "save existing, then replace" only means something if a failed write
   stops the replace — impChooseSave() in wizard-import.js relies on both. */
function seqLibExport(){
  const obj  = seqLibExportObj();
  const text = JSON.stringify(obj, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  /* the same stamp every other writer in the app uses (fileStamp(),
     core/util.js) — local time to the minute, so two saves in one
     afternoon are told apart by their names rather than by "(1)" */
  a.download = 'R2-choreography-' + fileStamp() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  if(typeof lg === 'function')
    lg('sys','choreography exported: '+a.download+' — '+obj.count+' routine(s), the library and the endpoints behind it');
  if(typeof toast === 'function')
    toast('Exported '+a.download+' — '+obj.count+' routine'+(obj.count===1?'':'s')+', with the endpoints they were built on');
  return a.download;
}
/* is this text one of OUR choreography backups? Same question, same shape
   as servoCfgLooksLikeCfg() — the drop handler asks before it sends a
   .json anywhere, because the extension cannot tell these apart. */
function seqLibLooksLike(text){
  const t = String(text || '');
  if(t.indexOf(SEQ_LIB_KIND) >= 0) return true;
  try{ const j = JSON.parse(t); return !!(j && j.kind === SEQ_LIB_KIND); }catch(e){ return false; }
}

function enabledChannels(){
  return MSTR.channels.filter(c=>/^servo/i.test(c.mode)).map(c=>c.i);
}

function buildMstrText(){
  const enabled = enabledChannels();
  /* the whole library goes into <Sequences> — that is your Control Center
     sequence list — but only the LOADOUT is compiled into the script, which
     is what actually runs on the board */
  const seqXml = genSequencesXml(MSTR.sequences, '  ');
  const script = genScript(loadoutSeqs(), enabled);
  // NOTE: the closing tag is written as '<\/Script>' so the HTML parser does not
  // mistake it for the end of this <script> block.
  const scriptXml = '  <Script ScriptDone="true">'+xmlEsc(script)+'<\/Script>';

  if(MSTR.xmlText){
    // keep every other setting exactly as the Control Center wrote it — but the
    // <Channels> block must be regenerated, or edits made here (All to Servo,
    // endpoint changes) ship a script that targets channels the settings still
    // declare as Input, and nothing moves on the bench
    let t = MSTR.xmlText;
    t = t.replace(/[ \t]*<Channels\b[\s\S]*?<\/Channels>/, ()=>genChannelsXml('  '));
    t = t.replace(/[ \t]*<Sequences\s*\/>|[ \t]*<Sequences>[\s\S]*?<\/Sequences>/, ()=>seqXml);
    t = t.replace(/[ \t]*<Script\b[^>]*\/>|[ \t]*<Script\b[^>]*>[\s\S]*?<\/Script>/, ()=>scriptXml); // v1.39.5: replacement is a function so $ in a user's name is not a pattern
    if(t.indexOf('<Sequences>')<0) t = t.replace('</UscSettings>', ()=>seqXml+'\n</UscSettings>');
    if(t.indexOf('<Script')<0)     t = t.replace('</UscSettings>', ()=>scriptXml+'\n</UscSettings>');
    return mstrSidecar(t);
  }
  return mstrSidecar(genFullMstr(seqXml, scriptXml));
}
/* both of our comments, in one place, so a new one cannot be added to one
   branch of buildMstrText() and forgotten in the other */
function mstrSidecar(t){ return mstrActsComment(mstrBlocksComment(t)); }

/* =====================================================================
   THE PART MAPPING RIDES THE .mstr TOO (v1.48.1)

   A Pololu settings file has no column for "which panel is this?" — it
   never had one, and `<Channel>` is name, mode, travel, speed,
   acceleration and nothing else. So `mstrParse()` has always re-derived
   the mapping with `guessPart(name)`, and for a wholesale import
   (`mstrApply()`, which IS the table) that guess REPLACES whatever the
   builder assigned by hand.

   On the starter table nobody notices, because the names ARE the guess.
   On Mike's they are not — he names a channel "Panel7" and wires it to
   the CAD lane `panel5`, because his physical panel numbering is not the
   CAD's — and a round trip through his own file came back with channels
   11 and 12 BOTH claiming `panel6`, `panel5` and `panel11` driven by
   nothing, and every brick naming either of them unwired. The frames were
   still exact, which is exactly why it went unseen until v1.48.0 gave the
   bricks a way home and `blocksTryAttach()` started refusing them.

   Same trick as the bricks, same reasons: an XML comment Control Center
   ignores, base64 so no `--` and no user's name can break the file, any
   older copy stripped first. Written by CHANNEL INDEX because that is
   what the <Channels> block is keyed by, and an empty string is a channel
   deliberately mapped to nothing.
   ===================================================================== */
function actsPack(channels){
  /* v1.68.1 — a channel that is not a Servo emits no pulses, so claiming a
     droid part on it is a claim the file cannot keep. It happens routinely:
     un-ticking a channel on the bench sets mode Input and clears the name
     but deliberately KEEPS the act, so re-ticking it gets the part back.
     That is right for the table and wrong for the file, so the filter lives
     here rather than in setupUse(). Mike's 2026-08-21 header claimed nine
     panels on nine pin-255 rows. */
  const acts = (channels || []).map(c=>(c && /^servo/i.test(c.mode || '') && c.act) || '');
  if(!acts.some(a=>a)) return '';
  return btoa(unescape(encodeURIComponent(JSON.stringify({v:1, acts:acts}))));
}
function mstrActsComment(t){
  t = t.replace(/[ \t]*<!--r2sim:acts [A-Za-z0-9+/=]+-->\n?/g, '');
  const packed = actsPack(MSTR.channels);
  if(!packed) return t;
  return t.replace('</UscSettings>', ()=>'  <!--r2sim:acts '+packed+'-->\n</UscSettings>');
}
/* v1.48.0 — the bricks ride the .mstr as an XML comment (Control Center
   ignores comments), so a round trip through our own file can come back
   EDITABLE. Any older copy of the comment is stripped first. base64, so
   neither `--` (illegal inside an XML comment) nor a user's name can break
   the file. blocksPack()/blocksTryAttach() in maestro/blocks.js. */
function mstrBlocksComment(t){
  t = t.replace(/[ \t]*<!--r2sim:blocks [A-Za-z0-9+/=]+-->\n?/g, '');
  const packed = (typeof blocksPack === 'function') ? blocksPack(MSTR.sequences) : '';
  if(!packed) return t;
  return t.replace('</UscSettings>', ()=>'  <!--r2sim:blocks '+packed+'-->\n</UscSettings>');
}
/* Pololu's ChannelMode enum is Servo | ServoMultiplied | Output | Input, and
   nothing else deserializes. `Off` is a HOMEMODE value, and it reaches the
   channel table legitimately — HW.ensure() marks a padding row `Off` because
   "not configured yet" is exactly what it means, and /^servo/i says no to it
   everywhere the app asks. It is only a lie in the FILE. Normalising here,
   at the boundary, rather than in hw-host.js keeps the in-app meaning and
   catches every other source of a mode we did not think of. (v1.68.1 —
   Control Center refuses the whole file over one of these.) */
const POLOLU_MODES = ['Servo','ServoMultiplied','Output','Input'];
function pololuMode(m){
  const v = String(m || '');
  return POLOLU_MODES.find(k=>k.toLowerCase() === v.toLowerCase()) || 'Input';
}
/* ================================================ THE TWO EXPORT NOTES
   Both written once, here, because there are two export doors and the
   2026-08-21 audit found them saying different things about the same file.

   THE PORTABILITY NOTE. Mike, 2026-08-21: "people can't just send an export
   to someone, it will have to be passed through the receiver's Sim to do the
   reconfiguring." He is right, and until now the app only said so on IMPORT
   — inside a dialog the person mailing the file never sees. The machinery to
   do it properly already exists (mstrMatchChannels + mstrRetargetFrame,
   import.js): the receiver picks "choreography only" and every target is
   normalised through the sender's travel and back out through theirs. This
   is the sentence that tells them to.

   THE LINT NOTE. Nothing refuses an export — "it is your file" — but a file
   written over an outstanding error should say so on the way out. The PCA
   door did not lint at all, which is how seven of nine routines in a real
   header came to drive nine channels that had been un-ticked. */
const EXPORT_PORTABILITY_NOTE =
  ' <b>This file describes your droid, not the routine.</b> The targets are '
  + 'quarter-microsecond pulse widths against YOUR endpoints, the channel numbers '
  + 'are YOUR wiring, and the speed, acceleration, home and release columns are '
  + 'YOUR servos. Only the timing travels unchanged. To share the moves, have the '
  + 'other builder drop this into their own copy and pick <b>choreography only</b> '
  + '\u2014 that re-expresses every target through their endpoints and says out '
  + 'loud what it could not match.';

function exportLintNote(){
  if(typeof lintMaestro !== 'function') return '';
  let rep;
  try{ rep = lintMaestro(); }catch(e){ return ''; }
  const n = (rep && rep.counts && rep.counts.err) || 0;
  if(!n) return '';
  const first = (rep.items || []).find(i=>i.level === 'err');
  return ' <b style="color:var(--rd,#c33)">Written with '+n+' validation error'
       + (n===1?'':'s')+' outstanding'+(first ? ': '+first.msg : '')+'</b>'
       + ' \u2014 it is your file, but check the Validate panel before you flash it.';
}

/* the <Channels> block, regenerated from live channel state */
function genChannelsXml(ind){
  const h = MSTR.header;
  const bd = boardById(MSTR.board);
  let s;
  if(bd.mini)
    s = ind+'<Channels MiniMaestroServoPeriod="'+(h.MiniMaestroServoPeriod||'80000')+'" ServoMultiplier="'+(h.ServoMultiplier||'1')+'">\n';
  else
    s = ind+'<Channels ServosAvailable="'+bd.ch+'" ServoPeriod="'+(h.ServoPeriod||'156')+'">\n';
  s += ind+'  <!--Period = 20.00 ms-->\n';
  for(const c of MSTR.channels){
    s += ind+'  <!--Channel '+c.i+'-->\n';
    s += ind+'  <Channel name="'+xmlEsc(c.name)+'" mode="'+pololuMode(c.mode)+'" min="'+c.min+'" max="'+c.max+
         '" homemode="'+c.homemode+'" home="'+c.home+'" speed="'+c.speed+'" acceleration="'+c.acceleration+
         '" neutral="'+c.neutral+'" range="'+c.range+'" />\n';
  }
  s += ind+'</Channels>';
  return s;
}

function genFullMstr(seqXml, scriptXml){
  const h = MSTR.header;
  let s = '<!--Pololu Maestro servo controller settings file, http://www.pololu.com/catalog/product/1350-->\n';
  s += '<!--Generated by the R2-D2 simulator. WARNING: min/max/home values are simulator placeholders,\n      NOT measured on your servos. Verify every channel\'s endpoints and direction in Control Center\n      at low speed before running sequences - a wrong endpoint can stall a servo against the shell.-->\n';
  s += '<UscSettings version="1">\n';
  s += '  <NeverSuspend>'+(h.NeverSuspend||'false')+'</NeverSuspend>\n';
  s += '  <SerialMode>'+(h.SerialMode||'UART_FIXED_BAUD_RATE')+'</SerialMode>\n';
  s += '  <FixedBaudRate>'+(h.FixedBaudRate||'9600')+'</FixedBaudRate>\n';
  s += '  <SerialTimeout>'+(h.SerialTimeout||'0')+'</SerialTimeout>\n';
  s += '  <EnableCrc>'+(h.EnableCrc||'false')+'</EnableCrc>\n';
  s += '  <SerialDeviceNumber>'+(h.SerialDeviceNumber||'12')+'</SerialDeviceNumber>\n';
  s += '  <SerialMiniSscOffset>'+(h.SerialMiniSscOffset||'0')+'</SerialMiniSscOffset>\n';
  s += genChannelsXml('  ')+'\n';
  s += seqXml+'\n';
  s += scriptXml+'\n';
  s += '</UscSettings>\n';
  return s;
}

/* -------------------------- starter file for an R2 Maestro -------------- */
/* Listed in priority order: a smaller board just takes the front of the list,
   so the channels you are most likely to wire first land on the low pins. */
