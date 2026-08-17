'use strict';
/* =====================================================================
   SERVO CONFIG — the channel table on its own, in and out

   Mike, 2026-08-14: "The first question on servo setup should be do you
   have an exsisting config to import if yes import the servo setup only,
   Start end cetner speed ect… once the servos are configured we then
   export the settings for future use."

   THE POINT IS THE WORD "ONLY". The app already imports two things that
   contain a channel table — a Pololu `.mstr` and the whole-setup `.json`
   — and both of them bring a great deal else with them: sequences, a
   board size, a firmware profile, paint, part names. On the servo setup
   step none of that is wanted. You are standing at a bench with a droid
   whose panels you have already assigned, and the one thing you want
   back is the travel you measured last time: min, centre, max, speed,
   acceleration, and what you called the channel.

   So this module reads those SIX FIELDS and nothing else, and writes a
   file that contains those six fields and nothing else. A servo config
   is not a build; keeping them apart is what makes "import the servo
   setup only" a sentence the code can honour rather than a hope.

   WHAT IT DELIBERATELY DOES NOT TOUCH
     · the board (`MSTR.board`) — the channel count comes from your build
     · sequences, the loadout, the header — a different file's business
     · `act` (which part a channel drives) — that is the Panels step's
       answer, and it belongs to THIS droid, not to the file. A config
       carried from another builder would otherwise silently re-wire your
       panels. Names come across; wiring does not.
   ===================================================================== */

/* the fields a servo config is made of. Anything else in the file is
   ignored on the way in and absent on the way out. */
const SERVO_CFG_FIELDS = ['name','min','max','home','homemode','neutral','range','speed','acceleration','mode','invert'];
const SERVO_CFG_KIND   = 'r2sim.servo-config';
const SERVO_CFG_VER    = 1;

function servoCfgFrom(c){
  const out = {};
  SERVO_CFG_FIELDS.forEach(k=>{ if(c[k] !== undefined) out[k] = c[k]; });
  return out;
}

/* How many channels have actually been measured — i.e. carry travel that is
   not simply the default a fresh table is born with. Drives the "do you
   already have one?" question, and it has to be a COUNT rather than a
   boolean because a partly-done bench session is the normal state to come
   back to. */
/* Mike, 2026-08-14: "It didnt prompt me to save config when id finished."
   It didn't, because this counted only channels whose numbers DIFFER from
   the default — and a channel you took to both ends on the dial can land
   back on 4000–8000 and be perfectly, deliberately right. `calibrated` is
   the honest signal (setupCalCommit sets it); non-default travel is the
   fallback for a table typed in by hand or imported from a .mstr. Either
   one means somebody did work here. */
function servoCfgConfigured(){
  if(typeof MSTR === 'undefined' || !MSTR.channels) return 0;
  const dMin = (typeof DEFAULT_MIN === 'number') ? DEFAULT_MIN : 4000;
  const dMax = (typeof DEFAULT_MAX === 'number') ? DEFAULT_MAX : 8000;
  return MSTR.channels.filter(c=>c && /^servo/i.test(c.mode || '') &&
    (c.calibrated || c.min !== dMin || c.max !== dMax)).length;
}

/* ------------------------------------------------------------ provenance
   Mike, 2026-08-14: "if we are starting from a setup the settings should be
   imported automatically or at least with a 'should we use the settings you
   just created' question."

   The reason that question could not be asked before is that nothing
   remembered WHERE the numbers in the channel table came from. They are the
   live table either way — the bench edits it in place, an import writes into
   it — so "already got a config?" was being asked of a build that plainly
   had one, with no way to say so out loud.

   This is one line of history, deliberately not a log: how (bench · import ·
   starter), what it was called, when, and how many channels. Enough for a
   sentence a builder recognises as their own afternoon. */
function servoCfgNote(how, info){
  if(typeof buildGet !== 'function') return null;
  const b = buildGet(); if(!b) return null;
  const o = info || {};
  b.servoCfg = {how:how, name:o.name || '', n:(o.n|0),
                when:(typeof Date !== 'undefined') ? new Date().toISOString() : ''};
  if(typeof prefsSave === 'function') prefsSave();
  return b.servoCfg;
}
function servoCfgSrc(){
  if(typeof buildGet !== 'function') return null;
  const b = buildGet();
  return (b && b.servoCfg && b.servoCfg.how) ? b.servoCfg : null;
}
/* "a moment ago" beats a timestamp for the only question being asked here:
   is this the thing I was just doing, or something from a previous life? */
function servoCfgWhen(iso){
  if(!iso) return '';
  const t = Date.parse(iso); if(!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if(m < 2)    return 'a moment ago';
  if(m < 60)   return m + ' minutes ago';
  if(m < 120)  return 'an hour ago';
  if(m < 1440) return Math.round(m/60) + ' hours ago';
  if(m < 2880) return 'yesterday';
  return 'on ' + iso.slice(0,10);
}
/* the sentence the wizard leads with when there is already a config here */
function servoCfgStory(){
  const s = servoCfgSrc();
  const n = servoCfgConfigured();
  if(!n) return '';
  const when = s ? servoCfgWhen(s.when) : '';
  const head = !s ? 'already in this build'
    : s.how === 'bench'  ? 'measured on the bench' + (when ? ' ' + when : '')
    : s.how === 'import' ? 'imported' + (s.name ? ' from ' + s.name : '') + (when ? ' ' + when : '')
    : s.how === 'starter'? 'from the starter table for this build'
    : 'already in this build';
  return head + ' — ' + n + ' channel' + (n===1?'':'s') + ' carrying travel';
}

/* --------------------------------------------------------------- export */
function servoCfgExportObj(){
  const list = (typeof MSTR !== 'undefined' && MSTR.channels) ? MSTR.channels : [];
  return {
    kind: SERVO_CFG_KIND,
    version: SERVO_CFG_VER,
    app: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '',
    /* recorded so a mismatch can be REPORTED on import, never enforced —
       a 12-channel config is perfectly good input for a 24-channel board */
    board: (typeof MSTR !== 'undefined') ? MSTR.board : '',
    count: list.length,
    channels: list.map((c,i)=>Object.assign({i:i}, servoCfgFrom(c || {})))
  };
}
function servoCfgExport(){
  const text = JSON.stringify(servoCfgExportObj(), null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  /* v1.45.0 — Mike: "Add date and time, without seconds, to saved/exported
     filenames." A date alone COLLIDES: re-export after ten minutes on the
     bench and the browser writes `R2-servos-2026-08-17 (1).json`, which is
     the one filename that tells you nothing about which is which. fileStamp()
     is local time to the minute (core/util.js) and is the same stamp every
     other writer in the app uses. */
  a.download = 'R2-servos-' + fileStamp() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  if(typeof lg === 'function') lg('sys','servo config exported: '+a.download+' — '+servoCfgExportObj().count+' channels, travel only');
  if(typeof toast === 'function') toast('Exported '+a.download+' — the servo travel, nothing else');
  /* the bench's Finish check reads this: "written out since it last
     changed", not "written out ever" */
  if(typeof SETUP !== 'undefined') SETUP.exportedAt = (SETUP.changedAt || 0);
  return a.download;
}

/* --------------------------------------------------------------- import
   Returns {n, skipped, note} or throws with a sentence a builder can act
   on. Both accepted shapes end up here as the same array. */
function servoCfgApply(rows, opts){
  /* v1.45.0 — a failure string has to say what WAS expected, or the only
     move left is guessing. One sentence, and it names the formats. */
  if(!Array.isArray(rows) || !rows.length)
    throw new Error('there are no channels in that file. It should be ' + ioFormatsIn() + '.');
  if(typeof MSTR === 'undefined' || !MSTR.channels) throw new Error('there is no channel table to import into yet');
  const o = opts || {};
  let n = 0, skipped = 0;
  rows.forEach((r, idx)=>{
    const i = (r.i === undefined) ? idx : (r.i|0);
    /* past the end of the board you actually have: count it and say so,
       rather than growing a table the hardware cannot address */
    if(i < 0 || i >= (typeof HW !== 'undefined' && HW.count ? HW.count() : 24)){ skipped++; return; }
    const c = (typeof HW !== 'undefined' && HW.ensure) ? HW.ensure(i) : MSTR.channels[i];
    if(!c){ skipped++; return; }
    SERVO_CFG_FIELDS.forEach(k=>{ if(r[k] !== undefined) c[k] = r[k]; });
    /* `act` is this droid's wiring, not the file's — see the header */
    n++;
  });
  if(o.name !== '-') servoCfgNote('import', {name:o.name || '', n:n});
  if(typeof prefsSave === 'function') prefsSave();
  /* imported travel is now this browser's config — keep it across a refresh */
  if(typeof servoStoreSave === 'function') servoStoreSave();
  if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
  return {n:n, skipped:skipped, board:o.board || ''};
}

/* ------------------------------------------------------- the way back in
   Mike, 2026-08-14: "where do I import the PCA servo setup I exported, the
   only thing I see the mestro one".

   Fair. Until now the ONLY door for a servo config was the setup wizard's
   Servo setup step — which you reach by re-opening the build wizard, on a
   step about a job you have already done. Everywhere else offered the
   Maestro settings import, which is a different file doing a different job.
   An export with no visible import is a trap, so this is the one picker,
   used by the bench's Finish step and the Maestro/Bench pane as well.

   The ACCEPT follows the build (a Maestro builder has never seen our .json;
   a PCA builder has never opened Control Center), the READER does not — the
   same six fields arrive either way, and somebody bringing a .mstr to a PCA
   build is doing something sensible. */

/* ONE TABLE, TWO CONSUMERS (v1.45.0)
   Mike: "Clarify whether native Maestro files as well as JSON are
   supported." The picker's `accept` and the reader's actual capability had
   drifted — the accept list never mentioned the servo-config .json on a
   Maestro build even though the reader took it, and neither of them
   mentioned a PCA9685 header once the reader learned to read one. They are
   generated from the same list now, and `maestro-import.test.js` fails if
   one grows a format the other has not heard of. */
/* `maestro:true` = a file a Pololu builder recognises. Everything else is
   OURS or the co-processor's. Note that the build's own family word for a
   PCA9685 co-processor is 'coproc', not 'pca' (config/hardware.js
   servoFamily) — so the question this list answers is deliberately the
   binary one, "is this a Maestro build", exactly as it was before. */
const SERVO_CFG_FORMATS = [
  {ext:'.mstr', maestro:true,  mime:'text/xml',
   what:'a pololu maestro settings file, saved from control center'},
  {ext:'.xml',  maestro:true,  mime:'text/xml',
   what:'the same file under its other extension'},
  {ext:'.json', maestro:false, mime:'application/json',
   what:'a servo config this app exported, or a whole-setup backup'},
  {ext:'.h',    maestro:false, mime:'text/plain',
   what:'a PCA9685 servos.h or sequences.h for the MaestroPCA library'}
];
/* what the READER can actually do, whatever the picker chose to offer */
function servoCfgReadable(){ return SERVO_CFG_FORMATS.map(f=>f.ext); }
/* THE GAP, STATED (v1.45.0). It is deliberate, so it is written down rather
   than merely tolerated — a builder who has been handed a file the picker
   is not showing needs to know it will still go in. */
const SERVO_CFG_ACCEPT_NOTE =
  'the file picker offers your own build\'s formats first, but the reader takes all of them — '
  + 'if the file you were sent is greyed out, choose "all files" and it will still be read.';
function servoCfgAccept(){
  const fam = (typeof buildGet === 'function' && typeof servoFamily === 'function')
    ? servoFamily(buildGet().domeServo) : 'maestro';
  const isMae = (fam === 'maestro');
  const mine = SERVO_CFG_FORMATS.filter(f=>!!f.maestro === isMae);
  const rest = SERVO_CFG_FORMATS.filter(f=>!!f.maestro !== isMae);
  return mine.map(f=>f.ext).concat(rest.map(f=>f.ext),
    [(mine[0] && mine[0].mime) || 'text/xml']).join(',');
}
function servoCfgImportFile(file, done){
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      const r = servoCfgImportText(String(fr.result), file.name);
      const from = r.from === 'mstr' ? 'a Maestro settings file'
                 : r.from === 'pca'  ? 'a PCA9685 servos.h / sequences.h'
                 : r.from === 'cfg'  ? 'a servo config' : 'a whole-setup file';
      if(typeof lg === 'function')
        lg('sys','servo config imported from '+from+' — '+r.n+' channels'
          + (r.skipped ? ', '+r.skipped+' past the end of this board' : ''));
      /* v1.45.0 — a conversion between families loses fields, and the user
         is told WHICH by name in the receipt, not only in the log */
      const lost = (r.dropped && r.dropped.length)
        ? ' · not carried across: ' + r.dropped.map(d=>d.field).join(', ') : '';
      if(typeof toast === 'function')
        toast('Imported travel for '+r.n+' channel'+(r.n===1?'':'s')
          + (r.skipped ? ' — '+r.skipped+' did not fit this board' : '') + lost,
          lost ? 'warn' : '');
      if(typeof done === 'function') done(r);
    }catch(e){
      if(typeof lg === 'function') lg('warn','servo config import failed — '+e.message);
      if(typeof appConfirm === 'function')
        appConfirm(e.message, {title:'That file did not import', yes:'OK', no:''});
      else if(typeof toast === 'function') toast(e.message, 'err');
    }
  };
  fr.readAsText(file);
}
/* a hidden input, clicked. Kept out of the DOM tree of whatever pane calls
   it so a rebuild mid-dialog cannot orphan the change event. */
function servoCfgPick(done){
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = servoCfgAccept(); fi.style.display = 'none';
  fi.addEventListener('change', ()=>{
    const f = fi.files && fi.files[0];
    if(f) servoCfgImportFile(f, done);
    fi.remove();
  });
  document.body.appendChild(fi);
  fi.click();
}
/* is this text one of OUR servo configs? The drop handler asks before it
   sends a .json to the whole-setup importer — dropping the file this app
   just wrote and being told it is not a setup file is the kind of small
   betrayal that stops people trusting the drop target at all. */
function servoCfgLooksLikeCfg(text){
  const t = String(text || '');
  if(t.indexOf(SERVO_CFG_KIND) >= 0) return true;
  try{ const j = JSON.parse(t); return j && j.kind === SERVO_CFG_KIND; }catch(e){ return false; }
}

/* one text blob, either shape, worked out from the content rather than the
   file extension — a .mstr renamed .txt is still a .mstr */
function servoCfgImportText(text, fileName){
  const t = String(text || '').trim();
  if(t.charAt(0) === '<'){
    if(typeof mstrParse !== 'function') throw new Error('the Maestro reader is not loaded');
    const doc = mstrParse(t, fileName || 'settings.mstr');
    const rows = (doc.channels || []).map((c,i)=>Object.assign({i:i}, servoCfgFrom(c)));
    return Object.assign(servoCfgApply(rows, {board:doc.board, name:fileName || 'a .mstr'}), {from:'mstr'});
  }
  /* v1.45.0 — the third family. A MaestroPCA header is C, not JSON, so it
     has to be sniffed before JSON.parse gets a chance to fail on it. Travel
     ONLY, exactly like the other two routes: the sequences a sequences.h
     carries are the full importer's business, and they are named in the drop
     list rather than quietly left behind. */
  if(typeof pcaHeaderLooksLike === 'function' && pcaHeaderLooksLike(t)){
    if(typeof pcaHeaderParse !== 'function') throw new Error('the PCA9685 header reader is not loaded');
    const doc = pcaHeaderParse(t, fileName || 'sequences.h');
    const rows = (doc.channels || []).map((c,i)=>Object.assign({i:i}, servoCfgFrom(c)));
    const dropped = (doc.dropped || []).slice();
    if((doc.sequences || []).length)
      dropped.push({field:'sequences', n:doc.sequences.length,
        why:doc.sequences.length + ' sequence(s) in that header were not taken — this door imports servo TRAVEL only. '
          + 'Use the guided import to bring the choreography in as well.'});
    const r = Object.assign(servoCfgApply(rows, {board:doc.board, name:fileName || 'a PCA9685 header'}),
                            {from:'pca', dropped:dropped});
    /* named, never merely counted — the contract mstrAdoptSequences() set
       and mstr-share.test.js pins */
    if(typeof lg === 'function'){
      lg('sys','PCA9685 header read: '+r.n+' channel(s) of travel from '+(fileName || 'a header'));
      lg('warn','  not carried across: '+dropped.map(d=>d.field).join(', '));
      dropped.forEach(d=>lg('sys','  '+d.field+' — '+d.why));
    }
    return r;
  }
  let j;
  try{ j = JSON.parse(t); }
  /* v1.45.0 — the message keeps its opening (it is the sentence a builder
     recognises, and build-config.test.js pins it) and gains the whole list,
     so "what SHOULD I have given it?" is answered in the same breath. */
  catch(e){ throw new Error('that is neither a Maestro .mstr nor a servo config — it should be '+ioFormatsIn()+'.'); }
  /* our own export, or the whole-setup .json (whose maestro block carries
     the same table). Take the channels and leave the rest of it alone. */
  const rows = j.channels ? j.channels
             : (j.maestro && j.maestro.channels) ? j.maestro.channels
             : null;
  if(!rows) throw new Error('that JSON has no channel table in it — a servo config has a '
    + '"channels" list and a whole-setup backup has one under "maestro". Otherwise: ' + ioFormatsIn() + '.');
  return Object.assign(servoCfgApply(rows, {board:j.board || (j.maestro && j.maestro.board),
                                            name:fileName || 'a servo config'}),
                       {from: j.kind === SERVO_CFG_KIND ? 'cfg' : 'setup'});
}
