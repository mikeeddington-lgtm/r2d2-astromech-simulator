'use strict';
/* =====================================================================
   SERVO STORE — the channel table survives a refresh

   Mike, 2026-08-16: "Going into Servo Hardware page seems to have
   overwritten my settings in 'Set up your servo hardware'."

   It had. Not by writing over them — by never keeping them in the first
   place. `HW.save()` called `prefsSave()`, and PREFS holds the theme, the
   build answers, the RC map and a dozen other light things but has never
   held MSTR: the channel table, its names, its measured endpoints, its
   part mapping and the sequences built on top. So the whole servo config
   was SESSION state. Close the tab, refresh, or let the machine sleep the
   page out, and it was gone — and because `buildEnsureMaestro()`
   regenerates a starter whenever `MSTR.loaded` is false, what came back in
   its place was a pristine starter table: every channel named after its
   panel, 1000/1000/2000 µs, boot ticked. Which is EXACTLY what a wiped
   config looks like from the outside, and exactly what Mike photographed.

   The comment on the Finish step — "an hour of calibration that exists
   only in one browser's localStorage" — described a thing that was not
   happening. Now it is.

   ---------------------------------------------------------------- rules

   · ITS OWN KEY, not a corner of PREFS. A big .mstr plus a library of
     routines is orders of magnitude larger than the rest of PREFS put
     together, and `prefsSave()` swallows quota errors — so folding this in
     would mean one oversized sequence library silently taking the theme,
     the build answers and the RC calibration down with it. Separate key,
     separate failure.

   · WRITE-THROUGH, not autosave-on-a-timer. `HW.save()` is already called
     by every edit surface (the bench table, the dial, the wizard's channel
     step, HW.setPart) — it is the seam that means "this changed". It now
     writes both.

   · A RESTORE NEVER LOSES WORK. `servoStoreLoad()` runs once at boot,
     before anything can generate a starter, and refuses to overwrite a
     table that already has channels in it.

   · THE FILE IS STILL THE BACKUP. This is a convenience, not an archive:
     one browser, one machine, one cache clear away from gone. Finish still
     offers the export, and now says why.
   ===================================================================== */

const SERVO_STORE_KEY = 'r2sim.servo.v1';
const SERVO_STORE_VERSION = 1;

/* Is there anything here worth writing? An empty table is not a config,
   and saving one over a good save is how a half-loaded page eats an
   afternoon. */
function servoStoreWorth(){
  if(typeof MSTR === 'undefined' || !MSTR.channels) return false;
  return MSTR.channels.some(c=>c && (/^servo/i.test(c.mode||'') || c.act || c.calibrated));
}

function servoStoreObj(){
  return {
    v: SERVO_STORE_VERSION,
    at: Date.now(),
    board: MSTR.board,
    servoCount: MSTR.servoCount,
    fileName: MSTR.fileName || '',
    header: MSTR.header || {},
    channels: MSTR.channels || [],
    sequences: MSTR.sequences || [],
    loadout: MSTR.loadout || null
  };
}

/* Write. Returns true if something was stored. Quota failures are reported
   ONCE per session and then stay quiet — a full disk should not turn every
   keystroke in a name field into a log line. */
let servoStoreWarned = false;
function servoStoreSave(){
  if(typeof localStorage === 'undefined') return false;
  if(!servoStoreWorth()) return false;
  try{
    localStorage.setItem(SERVO_STORE_KEY, JSON.stringify(servoStoreObj()));
    servoStoreWarned = false;
    return true;
  }catch(e){
    if(!servoStoreWarned){
      servoStoreWarned = true;
      if(typeof lg === 'function'){
        lg('warn','the servo config could not be saved in this browser ('+e.name+') — '
          + 'export it to a file before you close the tab');
      }
    }
    return false;
  }
}

/* The coalescing door, for the surfaces that change the table or the
   sequence library many times in a row — dragging a brick, typing in the
   sequencer. `HW.save()` still writes straight through, because that is the
   seam that means "the user just committed something". */
let servoStoreTimer = null;
function servoStoreTouch(){
  if(servoStoreTimer) return;
  servoStoreTimer = setTimeout(()=>{ servoStoreTimer = null; servoStoreSave(); }, 500);
}
function servoStoreFlush(){
  if(servoStoreTimer){ clearTimeout(servoStoreTimer); servoStoreTimer = null; }
  servoStoreSave();
}
/* a tab closed or hidden mid-edit still keeps the last 500 ms of work */
if(typeof window !== 'undefined'){
  window.addEventListener('pagehide', servoStoreFlush);
  window.addEventListener('visibilitychange', ()=>{ if(document.hidden) servoStoreFlush(); });
}

function servoStoreRead(){
  if(typeof localStorage === 'undefined') return null;
  try{
    const raw = localStorage.getItem(SERVO_STORE_KEY);
    if(!raw) return null;
    const o = JSON.parse(raw);
    if(!o || !Array.isArray(o.channels) || !o.channels.length) return null;
    return o;
  }catch(e){ return null; }
}

/* ------------------------------------------------- retired actuator ids
   v1.57.0's servo rack gave every slot an `rkS<n>` actuator and wired real
   channels to it. v1.59.0 replaced the rack with a view that reads the
   CHANNEL directly (app/servos.js), so those actuators no longer exist —
   and a channel whose Part column still names one is worse than an unwired
   channel, because it LOOKS wired: `actPartLabel()` has nothing to return,
   so the cell goes blank while `c.act` stays truthy, and every "is this
   wired" test in the app answers yes.

   So a table arriving from before that change has them cleared, once, where
   it arrives. Deliberately narrow — one regexp, one release's mistake — and
   it counts what it did rather than doing it silently, because a mapping
   changing under somebody is the one thing this project has learned to say
   out loud (HANDOVER v1.43.0). */
function chanDropRetiredActs(chans){
  const list = chans || (typeof MSTR !== 'undefined' ? MSTR.channels : null);
  if(!Array.isArray(list)) return 0;
  let n = 0;
  list.forEach(c=>{ if(c && /^rkS\d+$/.test(c.act || '')){ c.act = ''; n++; } });
  if(n && typeof lg === 'function')
    lg('warn', 'servo config: ' + n + ' channel(s) were wired to a servo view that no longer exists — '
             + 'their Part column has been cleared. The Servos view shows every channel whether it drives a part or not.');
  return n;
}

/* Restore at boot. Called from main.js AFTER prefsLoad() and before
   anything asks for a starter. */
function servoStoreLoad(){
  if(typeof MSTR === 'undefined') return false;
  /* never over the top of a table that already carries work — an import
     dropped on the window during boot, a test that built its own */
  if(MSTR.channels && MSTR.channels.length && servoStoreWorth()) return false;
  const o = servoStoreRead();
  if(!o) return false;

  /* v1.77.0 (review H10) — THE STORED BLOB IS NOT TRUSTED EITHER. It is
     localStorage, which anything on this origin can edit and which this app
     wrote from a table that, until this release, took a hand-edited
     `min:"abc"` straight from a file — so the store can already HOLD one,
     and restoring it at boot switched off every clamp on that channel
     before the first pane was drawn. chanNormalise() (servo-cfg.js) is the
     one gate every row from outside goes through; a whole row, so a field
     nobody can read becomes the padding-row default rather than staying
     unreadable, and the count is said in the restore line below. */
  let repaired = 0; const repairs = [];
  const channels = o.channels.map((row, k)=>{
    const nz = (typeof chanNormalise === 'function') ? chanNormalise(row, {whole:true, i:k}) : {c:row, fixed:0, notes:[]};
    repaired += nz.fixed;
    nz.notes.forEach(t=>{ if(repairs.length < 12) repairs.push('ch ' + k + ' ' + t); });
    return nz.c;
  });

  MSTR.board      = o.board || MSTR.board;
  MSTR.channels   = channels;
  chanDropRetiredActs(MSTR.channels);                      // v1.57.0's rkS ids — see above
  if(typeof chanPosReset === 'function') chanPosReset();   // the table is a new table — CHPOS with it
  MSTR.servoCount = o.servoCount || o.channels.length;
  MSTR.sequences  = Array.isArray(o.sequences) ? o.sequences : [];
  MSTR.loadout    = o.loadout || null;
  MSTR.fileName   = o.fileName || '';
  MSTR.header     = o.header || {};
  MSTR.xmlText    = '';               /* regenerate the file from the table */
  MSTR.loaded     = true;

  /* the engine, the sub table and the live pose all sized off the table */
  if(typeof reindexSubs === 'function') reindexSubs();
  if(typeof EDIT !== 'undefined'){
    EDIT.live = MSTR.channels.map(c=>chanRest(c));   // v1.45.0 — see chanRest() in maestro/boards.js
  }
  if(typeof HW !== 'undefined' && HW.rebuild) HW.rebuild(false);

  const used = MSTR.channels.filter(c=>c && /^servo/i.test(c.mode||'')).length;
  if(typeof lg === 'function'){
    lg('sys','servo config restored — '+used+' channel'+(used===1?'':'s')
       + ' on '+((typeof boardById === 'function' && boardById(MSTR.board).label) || MSTR.board)
       + '. It lives in this browser; export it to keep it.');
    if(repaired){
      lg('warn', 'servo config: ' + (typeof chanRepairNote === 'function'
        ? chanRepairNote(repaired, [], 'the saved table') : repaired + ' field(s) repaired')
        + '. Check those channels on the bench before you run a sequence.');
      repairs.forEach(t=>lg('sys', '  ' + t));
    }
  }
  /* a repaired table is the table now — write it back so the next boot
     restores clean rows rather than repairing the same ones again */
  if(repaired) servoStoreSave();
  return true;
}

/* Forget it — the reset path (setup-io.js clears PREFS the same way). */
function servoStoreClear(){
  try{ localStorage.removeItem(SERVO_STORE_KEY); }catch(e){}
}

/* Does this browser hold a saved config, and what is in it? The wizard's
   servo step says so rather than asking for a file you have already got. */
function servoStoreInfo(){
  const o = servoStoreRead();
  if(!o) return null;
  return {at:o.at || 0, n:o.channels.filter(c=>c && /^servo/i.test(c.mode||'')).length,
          board:o.board || ''};
}
