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

/* matches Sequence.generateSubroutineList() in the SDK, plus the preamble */
function genScript(sequences, enabled){
  const needed=[]; let s=SCRIPT_PREAMBLE;
  for(const seq of sequences){
    s += '# '+seq.name+'\nsub '+niceName(seq.name)+'\n';
    s += genSeqBody(seq, enabled, needed);
    s += '  return\n';
  }
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
    return t;
  }
  return genFullMstr(seqXml, scriptXml);
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
    s += ind+'  <Channel name="'+xmlEsc(c.name)+'" mode="'+c.mode+'" min="'+c.min+'" max="'+c.max+
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
