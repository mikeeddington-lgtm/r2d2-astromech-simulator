'use strict';
/* =====================================================================
   THE ONE SENTENCE ABOUT FORMATS (v1.45.0)

   Mike: "Clarify whether native Maestro files as well as JSON are
   supported." He means it literally — the app never said plainly what it
   eats. The drop target listed a .mstr but not the servo-config .json it
   has accepted since v1.39.1; the servo-config picker narrowed by build
   family while its reader stayed wider; the build wizard named one family
   per build; and after v1.45.0's format work a PCA9685 header goes in too
   and was named nowhere at all. Five strings, five slightly different
   answers, none of them complete.

   So there is ONE canonical sentence, it lives here, and every other
   string in the app is derived from it or made consistent with it. If a
   reader learns a new format, this string is the thing that has to change
   and every door changes with it.
   ===================================================================== */
const IO_FORMATS_IN =
  'a pololu maestro .mstr or .xml, a servo config .json, a whole-setup .json, '
  + 'or a PCA9685 servos.h or sequences.h';
const IO_FORMATS_OUT =
  'a .mstr for a maestro, sequences.h for a PCA9685, and a servo config .json from either';
const IO_FORMATS_SENTENCE = 'imports: ' + IO_FORMATS_IN + '. exports: ' + IO_FORMATS_OUT + '.';
function ioFormatsIn(){ return IO_FORMATS_IN; }
function ioFormatsOut(){ return IO_FORMATS_OUT; }

function isAudioFile(f){ return /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name) || /^audio\//.test(f.type); }
/* --- drag & drop anywhere ---
   "Anywhere" is the point of this: a builder should be able to throw a
   .mstr, a sketch or a whole setup .json at the window and have it land.
   It is also the one door SIM ONLY cannot close by hiding a control
   (app/kiosk.js) — a stranger dragging a file onto the page would
   reconfigure the droid out from under Mike at a show. So the mode is
   asked here, at the handler, and the drop is refused outright rather
   than silently ignored: e.preventDefault() still runs, or the browser
   NAVIGATES AWAY to the dropped file and the kiosk is gone entirely. */
let dragDepth=0;
window.addEventListener('dragenter',e=>{
  e.preventDefault(); if(typeof kioskOn==='function' && kioskOn()) return;
  dragDepth++; $('dropzone').classList.add('on');
});
window.addEventListener('dragover', e=>{ e.preventDefault(); });
window.addEventListener('dragleave',e=>{ dragDepth=Math.max(0,dragDepth-1); if(!dragDepth) $('dropzone').classList.remove('on'); });
window.addEventListener('drop', e=>{
  e.preventDefault(); dragDepth=0; $('dropzone').classList.remove('on');
  if(typeof kioskOn==='function' && kioskOn()){
    if(typeof toast==='function') toast('sim only — files are not accepted while the public are driving','warn');
    return;
  }
  const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
  const f = files[0];
  if(!f) return;
  /* a zip, or SEVERAL audio files at once, is the sound pack; a single
     audio file is a music track for the sequencer */
  if(/\.zip$/i.test(f.name) || (files.length>1 && files.every(isAudioFile))){
    sbankLoadFiles(files); return;
  }
  if(/\.r2m$|\.r2m\.gz$/i.test(f.name)) loadCadFromFile(f);
  else if(/\.ino$/i.test(f.name) && typeof readInoFile==='function') readInoFile(f);   // a sketch — transpile it
  else if(isAudioFile(f)){ musicLoadFile(f); if(!EDIT.active) setStripMode('seq'); }
  /* TWO KINDS OF .json COME OUT OF THIS APP. The whole-setup file and the
     servo config, and until v1.39.1 a dropped servo config went to the setup
     importer and was refused as "not a setup file" — the app rejecting a file
     it had written itself an hour earlier. Sniff the kind, then route. */
  else if(/\.json$/i.test(f.name)) jsonDropRoute(f);
  /* v1.45.0 — a MaestroPCA header dropped on the window used to be handed
     to the .mstr wizard, which told the user their own generated file was
     not valid XML. It is a THIRD family of config now (import.js
     pcaHeaderParse), so it gets its own reader — same sniff-the-content
     rule as the two .json shapes above, because a header renamed .txt is
     still a header and somebody else's PCA sketch is not one of ours. */
  else if(/\.h$|\.hpp$/i.test(f.name)) pcaHeaderDropRoute(f);
  else if(typeof impwizOpen==='function'){ impwizOpen(); impwizRead(f); }
  else readMstrFile(f);
});

/* Read it once, decide from the CONTENT. The extension cannot tell these
   apart and neither can the name — `R2-servos-2026-08-14.json` is a servo
   config, `servo-setup.json` is a bench backup, and either may have been
   renamed by whoever mailed it to you. */
function jsonDropRoute(file){
  const fr = new FileReader();
  fr.onload = ()=>{
    const text = String(fr.result);
    if(typeof servoCfgLooksLikeCfg === 'function' && servoCfgLooksLikeCfg(text)){
      try{
        const r = servoCfgImportText(text, file.name);
        if(typeof toast === 'function')
          toast('Servo config: travel imported for '+r.n+' channel'+(r.n===1?'':'s')+' — nothing else touched');
        if(typeof lg === 'function') lg('sys','dropped servo config '+file.name+' — '+r.n+' channels, travel only');
      }catch(e){
        if(typeof toast === 'function') toast('Could not read '+file.name+': '+e.message,'err');
      }
      return;
    }
    if(typeof setupImportText === 'function') setupImportText(text, file.name);
  };
  fr.readAsText(file);
}

/* A dropped .h. Travel goes in through the servo-config reader (which is
   where a channel table belongs whatever family it arrived in); if the
   header also carries sequences the guided import is offered, because
   adopting somebody else's choreography is a decision, not a side effect
   of dropping a file. (v1.45.0) */
function pcaHeaderDropRoute(file){
  const fr = new FileReader();
  fr.onload = async ()=>{
    const text = String(fr.result);
    if(typeof pcaHeaderLooksLike !== 'function' || !pcaHeaderLooksLike(text)){
      if(typeof toast === 'function')
        toast(file.name + ' is not a MaestroPCA header — no MpcaChannelDef table in it', 'err');
      return;
    }
    try{
      const r = servoCfgImportText(text, file.name);
      if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
      const seqs = (r.dropped || []).find(d=>d.field === 'sequences');
      if(!seqs) return;
      if(typeof appConfirm !== 'function') return;
      const go = await appConfirm(
        file.name + ' also carries ' + seqs.n + ' sequence(s). Travel is already in. '
        + 'Bring the sequences in as well, played through YOUR endpoints?',
        {title:'sequences too?', yes:'adopt them', no:'travel only'});
      if(!go) return;
      const P = pcaHeaderParse(text, file.name);
      mstrAdoptSequences(P);
      if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
      if(typeof toast === 'function')
        toast('Adopted ' + P.sequences.length + ' sequence(s) from ' + file.name
              + ' — playing through YOUR servo settings');
    }catch(e){
      if(typeof toast === 'function') toast('Could not read ' + file.name + ': ' + e.message, 'err');
    }
  };
  fr.readAsText(file);
}

function rebuildMaestroUI(){
  buildMaestroPane();
  if(EDIT.active) buildSequencer();
  buildOutputs();
}
