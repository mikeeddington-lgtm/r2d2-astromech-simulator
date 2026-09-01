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
/* v1.69.1 — `releaseMs` and `ease` belong in that list and were missing from
   it. They are per-channel BENCH settings, exactly like speed and
   acceleration: how long a channel keeps pulsing after it has arrived, and
   the shape of the move. Both C headers carry them in the MpcaChannelDef row
   (pca-gen.js, setup-hw.js setupServosH) and both firmware doors consume
   them, and the whole-setup .json keeps them because it is a deep copy — so
   the ONLY two files that lost them were the two built on servoCfgFrom():
   R2-servos-*.json and R2-choreography-*.json. The second of those is the
   copy impChooseSave('servo') writes as the "save a copy first, then import"
   safety gate, which means the safety net was dropping the settings it exists
   to preserve, and saying nothing. Reading them back is free: servoCfgApply()
   copies only the keys a row actually defines, so a config written before
   this line still means "keep what is there" for both of them. */
const SERVO_CFG_FIELDS = ['name','min','max','home','homemode','neutral','range','speed','acceleration','releaseMs','ease','mode'];
/* v1.46.0 — `invert` is retired (chanEnds/chanAdoptInvert, playback.js): min
   is the shut end and max the open one, directed rather than sorted. It is
   still READ, because every servo config this app wrote before v1.46.0 has
   the column and a channel that carried `invert:true` has its two ends the
   other way round; servoCfgApply() adopts it into the min/max pair. It is no
   longer WRITTEN, because writing it would put a setting that no longer
   exists into a file somebody keeps for years. */
const SERVO_CFG_READ_FIELDS = SERVO_CFG_FIELDS.concat(['invert']);
const SERVO_CFG_KIND   = 'r2sim.servo-config';
const SERVO_CFG_VER    = 1;

/* =====================================================================
   ONE GATE FOR EVERY ROW THAT ARRIVES FROM OUTSIDE (v1.77.0, review H10)

   Every door a channel row can come through — this file's servo config,
   the whole-setup .json (app/setup-io.js), the choreography backup, and
   the browser's own store (servo-store.js) — copied the row's fields
   straight into the live table, thirteen of them, with no look at what
   they were. And nothing downstream looks either: every clamp between a
   target and the wire is a comparison (pcaSetTarget, pcaStepChannel,
   mstrRetargetFrame, the lint), and a comparison with NaN is false. So a
   hand-edited `min:"abc"` switched off every clamp on that channel —
   pcaSetTarget(E, ch, 16000) landed at 16000 and hw-host.js handed the
   wire the same number — and a quoted `min:"4000"`, the commonest
   hand-edit there is, made blockValueAt's `closed + n*(open-closed)`
   concatenate into targets of 40004000. The typed boxes on the bench
   enforce the 500–2500 µs band; the files never did. This is DATA-03's
   sim-side twin.

   So: ONE normaliser, applied at each of those doors and nowhere else —
   the bench edits the live table in place through boxes that already
   validate. Per field:
     · a pulse-width field (min, max, home, neutral, range) is a finite
       integer inside 0..16383, the quarter-µs width of the protocol
       itself. NOT the 500–2500 µs servo band: that one is a note the
       bench puts beside a number, and "it is your file" still holds.
     · speed 0..16383, acceleration 0..255, releaseMs 0..65535 — the
       widths MpcaChannelDef gives them (arduino/MaestroPCA), which is
       the narrowest thing any of them is ever written into.
     · mode from the table's own enum (export.js says why `Off` is in
       it), homemode from Pololu's, ease from EASE_KINDS, name and act
       strings, invert a boolean, i a channel number.
     · a NUMERIC STRING is read as its number ("4000" → 4000): that is
       the hand-edit this exists for, and its meaning is not in doubt.
       Nothing else is read at all — Number("") is 0 and Number(true) is
       1, which is exactly the kind of quiet coercion this gate refuses.

   What becomes of a field that cannot be read depends on the door:
     · a WHOLE row (`whole:true` — the store, the whole-setup file; the
       row IS the channel from now on) gets the field's default: the one
       HW.ensure() gives a padding row. For a mode that is Off and for a
       home mode Off, so a row nobody can read drives nothing at
       power-up; for speed and acceleration it is the starters' limit,
       because 0 is "unlimited", which on a panel means it slams. A field
       the engine reads raw (min, max, home…) is filled the same way when
       it is simply missing. The channel number is the row's position —
       hw-host.js: "index IS the channel number".
     · a PARTIAL row (this file's "import the travel only") has the field
       DROPPED, so the copier keeps what the table already holds — that
       is what an absent field has always meant at that door, and a
       number you calibrated should not lose to one nobody can read. A
       channel number that cannot be read is dropped too: `'x'|0` is 0,
       and the row used to land on channel 0.
   Either way the field is COUNTED and the count goes out in the door's
   own receipt, because a value changing under somebody is the thing this
   project says out loud (HANDOVER v1.43.0). The input is never mutated:
   the doors validate into scratch and commit afterwards (review H14).
   ===================================================================== */
const CHAN_QUS_MAX   = 16383;
const CHAN_MODES     = ['Servo','ServoMultiplied','Output','Input','Off'];
const CHAN_HOMEMODES = ['Off','Ignore','Goto'];
function chanNormalise(row, opts){
  const o = opts || {};
  const whole = !!o.whole;
  const src = (row && typeof row === 'object' && !Array.isArray(row)) ? row : {};
  /* a whole row carries its extras (calibrated, autoName…) across untouched;
     a partial row starts empty and only the fields below can reach the table */
  const out = whole ? Object.assign({}, src) : {};
  const notes = [];
  let fixed = 0;
  /* NaN says NaN — JSON.stringify would write null for it, and a .mstr's
     parseInt is exactly where a NaN comes from */
  const show = v => { if(typeof v === 'number') return String(v);
                      try{ const s = JSON.stringify(v); return (s === undefined ? String(v) : s).slice(0, 24); }catch(e){ return String(v); } };
  const bad  = (k, v, to)=>{ fixed++; notes.push(k + ' ' + show(v) + ' → ' + to); };
  const num  = v => (typeof v === 'number') ? v
                  : (typeof v === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(v)) ? Number(v)
                  : NaN;
  /* the unreadable case, both doors: the default on a whole row, gone on a
     partial one */
  const drop = (k, v, def)=>{
    if(whole && def !== undefined){ out[k] = def; bad(k, v, show(def)); }
    else{ delete out[k]; bad(k, v, 'kept as it was'); }
  };
  /* `fill`: a whole row that lacks the field gets `def` — the engine reads
     these raw. Without it an absent field stays absent, which every reader
     already handles (`c.speed|0`, pcaEaseNum(undefined), `if(c.act)`). */
  const int = (k, lo, hi, def, fill)=>{
    const v = src[k];
    if(v === undefined){ if(whole && fill && def !== undefined){ out[k] = def; bad(k, v, show(def)); } return; }
    const n = num(v);
    if(!Number.isFinite(n)){ drop(k, v, def); return; }
    const r = Math.max(lo, Math.min(hi, Math.round(n)));
    out[k] = r;
    if(r !== v) bad(k, v, r);          // quoted, fractional, or outside the band
  };
  const str = (k, def, fill, coerce)=>{
    const v = src[k];
    if(v === undefined){ if(whole && fill && def !== undefined){ out[k] = def; bad(k, v, show(def)); } return; }
    if(typeof v === 'string'){ out[k] = v; return; }
    if(coerce && (typeof v === 'number' || typeof v === 'boolean')){ out[k] = String(v); bad(k, v, show(String(v))); return; }
    drop(k, v, def);
  };
  const pick = (k, list, def, fill)=>{
    const v = src[k];
    if(v === undefined){ if(whole && fill && def !== undefined){ out[k] = def; bad(k, v, show(def)); } return; }
    const hit = (typeof v === 'string') ? list.find(x=>x.toLowerCase() === v.trim().toLowerCase()) : undefined;
    if(hit === undefined){ drop(k, v, def); return; }
    out[k] = hit;
    if(hit !== v) bad(k, v, hit);      // a case or a space the exporter would have refused
  };
  const bool = k=>{
    const v = src[k];
    if(v === undefined) return;
    if(typeof v === 'boolean'){ out[k] = v; return; }
    const s = String(v).trim().toLowerCase();
    if(s === 'true'  || s === '1'){ out[k] = true;  bad(k, v, 'true');  return; }
    if(s === 'false' || s === '0' || s === ''){ out[k] = false; bad(k, v, 'false'); return; }
    drop(k, v, false);
  };

  /* the channel number first — the whole-row name default reads it */
  if(whole && typeof o.i === 'number'){
    if(src.i !== undefined && src.i !== o.i) bad('i', src.i, o.i);
    out.i = o.i;
  }else int('i', 0, 65535, undefined, false);
  const easeIds = (typeof EASE_KINDS !== 'undefined') ? EASE_KINDS.map(x=>x.id) : ['none','soft','overshoot'];
  const spd = (typeof STARTER_SPEED === 'number') ? STARTER_SPEED : 0;
  const acc = (typeof STARTER_ACCEL === 'number') ? STARTER_ACCEL : 0;
  str ('name', 'Channel ' + (out.i === undefined ? '?' : out.i), true, true);
  pick('mode',     CHAN_MODES,     'Off', true);
  int ('min',      0, CHAN_QUS_MAX, DEFAULT_MIN,     true);
  int ('max',      0, CHAN_QUS_MAX, DEFAULT_MAX,     true);
  int ('home',     0, CHAN_QUS_MAX, DEFAULT_NEUTRAL, true);
  pick('homemode', CHAN_HOMEMODES, 'Off', true);
  int ('neutral',  0, CHAN_QUS_MAX, DEFAULT_NEUTRAL, true);
  int ('range',    0, CHAN_QUS_MAX, 1905,            true);
  int ('speed',        0, 16383, spd, true);
  int ('acceleration', 0, 255,   acc, true);
  int ('releaseMs',    0, 65535, 0,   false);
  pick('ease', easeIds, 'none', false);
  str ('act', '', false, false);
  bool('invert');
  /* a hole where a row should be — JSON.stringify writes null for one, and
     pcaCreate/chanPosReset throw on it — is ONE thing wrong, not eleven:
     the whole row is the padding row now, and the receipt says so once */
  if(!row || typeof row !== 'object' || Array.isArray(row)){
    notes.length = 0; fixed = 1;
    notes.push('row ' + show(row) + ' → ' + (whole ? 'a padding row' : 'nothing, kept as it was'));
  }
  return {c:out, fixed:fixed, notes:notes};
}
/* the receipt's one line for a count of repairs — every door says it the
   same way, so a builder who has seen it once knows it again */
function chanRepairNote(fixed, notes, where){
  if(!fixed) return '';
  const head = fixed + ' field' + (fixed === 1 ? '' : 's') + ' in ' + (where || 'that file')
    + ' ' + (fixed === 1 ? 'was' : 'were') + ' not a usable value and ' + (fixed === 1 ? 'was' : 'were') + ' repaired';
  const some = (notes || []).slice(0, 6);
  return head + (some.length ? ' — ' + some.join(', ') + (notes.length > some.length ? ', …' : '') : '');
}

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
  let n = 0, skipped = 0, repaired = 0;
  const notes = [];
  rows.forEach((raw, idx)=>{
    /* v1.77.0 (review H10) — THROUGH THE GATE FIRST, and only the fields the
       gate could read reach the table. A partial row, so a field that cannot
       be read is dropped here and the channel keeps what it had — the rule
       the v1.69.1 note below already states for an absent one. */
    const nz = chanNormalise(raw, {whole:false});
    const r = nz.c;
    repaired += nz.fixed;
    nz.notes.forEach(t=>{ if(notes.length < 12) notes.push('ch ' + (r.i === undefined ? idx : r.i) + ' ' + t); });
    const i = (r.i === undefined) ? idx : r.i;
    /* past the end of the board you actually have: count it and say so,
       rather than growing a table the hardware cannot address */
    if(i < 0 || i >= (typeof HW !== 'undefined' && HW.count ? HW.count() : 24)){ skipped++; return; }
    const c = (typeof HW !== 'undefined' && HW.ensure) ? HW.ensure(i) : MSTR.channels[i];
    if(!c){ skipped++; return; }
    SERVO_CFG_READ_FIELDS.forEach(k=>{ if(r[k] !== undefined) c[k] = r[k]; });
    /* v1.46.0 — a pre-v1.46 file may say `invert:true`, which meant "this
       channel's travel reads backwards". That is now expressed by min and max
       being the other way round, so the flag is adopted into the pair and
       cleared. chanAdoptInvert() lives in playback.js with chanEnds(); it is
       guarded because this module has to keep working in a tree that does not
       carry it yet, and the swap here is exactly what it does. */
    if(typeof chanAdoptInvert === 'function') chanAdoptInvert(c);
    else if(c.invert){ const t = c.min; c.min = c.max; c.max = t; c.invert = false; }
    /* `act` is this droid's wiring, not the file's — see the header */
    n++;
  });
  if(o.name !== '-') servoCfgNote('import', {name:o.name || '', n:n});
  if(typeof prefsSave === 'function') prefsSave();
  /* imported travel is now this browser's config — keep it across a refresh */
  if(typeof servoStoreSave === 'function') servoStoreSave();
  /* v1.69.1 — AND THE ENGINE, not only the three renders. The running engine
     is a COPY of this table, not a view of it: pcaCreate reads speed,
     acceleration, ease and `servo` (from mode) once, when it is built, and
     only min/max are read live off the shared array. Ending here at
     rebuildMaestroUI() therefore drew the imported numbers and ran the old
     ones — an imported speed limit was a number in a table while the board
     still slammed the panel across at full rate, and a channel this file had
     just turned INTO a servo could not be driven at all. No caller made up
     for it: every door here (ui-files.js, wizard.js, wizard-import.js,
     ui-pane.js) also ends at rebuildMaestroUI, and setup-hw-channels.js ends
     at setupRender().
     HW.changed() is rebuild(true) + the same redraw, so it replaces that call
     rather than joining it, and both hosts have one (PCA Studio's rebuilds
     its own engine and has no rebuildMaestroUI at all). It is safe to do here
     only since v1.69.0 taught rebuild(true) to carry `aim` across with the
     other four — before that this line would have flung every driven channel
     to its home position. */
  if(typeof HW !== 'undefined' && typeof HW.changed === 'function') HW.changed();
  else if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
  /* v1.77.0 (review H10) — the repairs are part of the receipt, in the log
     by field and in the toast by count, beside the fields a family change
     could not carry (servoCfgImportText's `dropped`). Same door, same
     user, same shape of news. */
  if(repaired && typeof lg === 'function'){
    lg('warn', 'servo config: ' + chanRepairNote(repaired, [], o.name || 'that file'));
    notes.forEach(t=>lg('sys', '  ' + t));
  }
  return {n:n, skipped:skipped, board:o.board || '', repaired:repaired, repairs:notes};
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
  fr.onload = async ()=>{
    try{
      /* v1.46.0 — Mike: "when selecting Servo prompt if settings have already
         been imported or created that they will be replaced and offer the
         option to cancel or save a copy of existing".

         The prompt belongs HERE, at the door, not only in the new chooser:
         this function is what every servo-config picker in the app goes
         through — #btnCfgImport on the Maestro pane, the bench's Channels
         step, the job wizard — and each of them replaced an afternoon of
         calibration without asking. impAskServo()/impChooseSave() live in
         maestro/wizard-import.js with the rest of the v1.46.0 chooser and are
         guarded, so a host that does not load it keeps the old behaviour
         rather than losing the import. */
      if(typeof impAskServo === 'function' && typeof impServoWorth === 'function'
         && impServoWorth().worth){
        const sh = (typeof impShape === 'function') ? impShape(String(fr.result), file.name) : null;
        if(sh && !sh.err){
          if(typeof IMPCH !== 'undefined') IMPCH.name = file.name;
          const way = await impAskServo(sh);
          if(way === 'cancel'){
            if(typeof lg === 'function') lg('sys','servo config import cancelled — nothing was touched');
            if(typeof toast === 'function') toast('Import cancelled — your servo config is untouched');
            return;
          }
          if(way === 'save' && typeof impChooseSave === 'function' && !impChooseSave('servo')) return;
        }
      }
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
      /* v1.77.0 (review H10) — and the fields the gate could not read, as a
         count; the log has them by name */
      const fixed = r.repaired ? ' · ' + r.repaired + ' field' + (r.repaired === 1 ? '' : 's')
        + ' could not be read and ' + (r.repaired === 1 ? 'was' : 'were') + ' repaired — see the log' : '';
      if(typeof toast === 'function')
        toast('Imported travel for '+r.n+' channel'+(r.n===1?'':'s')
          + (r.skipped ? ' — '+r.skipped+' did not fit this board' : '') + lost + fixed,
          (lost || fixed) ? 'warn' : '');
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
    /* v1.68.1 — the .h branch below has always named the choreography it
       leaves behind; this branch dropped exactly the same thing in silence.
       Same door, same user, same loss, one receipt. */
    const dropped = [];
    if((doc.sequences || []).length)
      dropped.push({field:'sequences', n:doc.sequences.length,
        why:doc.sequences.length + ' sequence(s) in that .mstr were not taken — this door imports servo TRAVEL only. '
          + 'Use the guided import to bring the choreography in as well.'});
    if((doc.scriptText || '').trim())
      dropped.push({field:'the Maestro script', n:0,
        why:'the compiled script is regenerated from your own loadout when you export, so the original board\'s subroutine numbering is not carried across.'});
    const r = Object.assign(servoCfgApply(rows, {board:doc.board, name:fileName || 'a .mstr'}),
                            {from:'mstr', dropped:dropped});
    if(typeof lg === 'function' && dropped.length){
      lg('sys','.mstr read: '+r.n+' channel(s) of travel from '+(fileName || 'a settings file'));
      lg('warn','  not carried across: '+dropped.map(d=>d.field).join(', '));
      dropped.forEach(d=>lg('sys','  '+d.field+' — '+d.why));
    }
    return r;
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
