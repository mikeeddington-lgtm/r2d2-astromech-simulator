'use strict';
/* =====================================================================
   SETUP EXPORT / IMPORT — the whole configuration in one .json

   Everything that makes the sim YOURS travels in one file: the firmware
   profile and its edited constants, the Maestro board + channels +
   sequences, the CAD part mapping (actuators, flips, ride height), your
   part labels/colours/groups, the paint scheme, themes, UI scale, the
   electronics choice and the best lap. Move machines, share with another
   builder, or keep dated snapshots as the build progresses.

   localStorage still autosaves the light stuff; this file is the
   portable, complete version.
   ===================================================================== */
const SETUP_FORMAT = 'r2sim-setup';
const SETUP_VERSION = 1;

function setupExportObj(){
  return {
    format: SETUP_FORMAT, version: SETUP_VERSION,
    profile: PROFILE.id,
    cfg: JSON.parse(JSON.stringify(CFG)),
    isLeftStickDrive: FW.isLeftStickDrive,
    prefs: {
      theme: PREFS.theme, stageTheme: PREFS.stageTheme, uiScale: PREFS.uiScale,
      paint: PREFS.paint || null, parts: PREFS.parts || null,
      hw: PREFS.hw || null, hwMap: PREFS.hwMap || null, bestLap: PREFS.bestLap || null,
      model: PREFS.model || 'droid',      // which model is on the stage
      env: PREFS.env || null,             // v1.39.5: the popover promises the backdrop travels — now it does
      /* v1.41.0 — the Model Builder's assembly (parts, joints, channels)
         travels with the rest of the build. `track` is the practice-circuit
         agent's field, added here in parallel: that agent cannot touch this
         file, so both keys land in the same hunk. */
      builder: PREFS.builder || null,
      track: PREFS.track || null,
      /* v1.45.0 — the named track layouts (PREFS.tracks, app/track.js's
         LAYOUT LIBRARY). `track` above stays as the mirror of the active
         one, so a file written here still imports into v1.44.1. */
      tracks: PREFS.tracks || null,
      /* workspaces (v1.17.0): where the app is open, and whether the Bench's
         Advanced switch (the Serial console) is on. ws is the RUNTIME answer,
         so a file saved from the sequencer desk carries 'seq' — the import
         lands that on Drive, because the desk is a mode, not a place to boot */
      ws: (typeof wsGet==='function') ? wsGet() : (PREFS.ws || 'drive'),
      adv: !!PREFS.adv,
      /* the build answers — what is actually bolted into this droid */
      build: PREFS.build || null,
      /* RC transmitter calibration and channel assignments (v1.45.0) */
      rc: PREFS.rc || null,
      /* sequencer brick colours (v1.45.0) */
      blkColors: PREFS.blkColors || null,
      /* favourite paint swatches (v1.45.0) */
      favColors: PREFS.favColors || null,
      /* controller puppet cue mappings (v1.45.0) */
      puppetCues: PREFS.puppetCues || null
    },
    cad: (typeof CAD!=='undefined' && CAD.loaded) ? {
      yOffset: CAD.yOffset,
      moving: CAD.moving.map(m=>({name:m.name, act:m.act, flip:!!m.flip}))
    } : null,
    maestro: MSTR.loaded ? {
      board: MSTR.board, fileName: MSTR.fileName,
      header: JSON.parse(JSON.stringify(MSTR.header)),
      channels: JSON.parse(JSON.stringify(MSTR.channels)),
      sequences: JSON.parse(JSON.stringify(MSTR.sequences)),
      loadout: MSTR.loadout ? MSTR.loadout.slice() : null
    } : null
  };
}
function setupExport(){
  const text = JSON.stringify(setupExportObj(), null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  /* v1.45.0 — Mike: "Add date and time, without seconds, to saved/exported
     filenames." Three snapshots taken in one afternoon used to be
     R2-setup-mod2026(1).json and friends, which is the browser naming them,
     not you. fileStamp() (core/util.js) is local time to the minute — the
     minute is the useful grain for a build session, and dropping the seconds
     keeps the name readable and sortable. */
  a.download = 'R2-setup-' + PROFILE.id + '-' + fileStamp() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  lg('sys','setup exported: '+a.download+' — profile, config, Maestro, mapping, paint, groups, themes');
  /* the buttons that call this live in popovers and panes that may already
     be closed by the time the download lands — the receipt goes on stage */
  toast('Exported '+a.download+' — the whole setup in one file');
  return a.download;
}

/* =====================================================================
   READ THE WHOLE FILE BEFORE COMMITTING TO ANY OF IT (v1.77.0, review H14)

   setupImportObj() used to be one long walk down the file, writing as it
   went: assign PREFS.paint, PREFS.parts, PREFS.hw, PREFS.build …, call
   modelSet() and applyTheme() — each of which SAVES — and only then reach
   the Maestro block, which took `m.channels` on trust and handed it to
   `.map()`. So `"maestro":{"channels":"x"}` threw a TypeError with the
   file's build answers, paint, RC map and cues already on disk and the
   previous ones gone, MSTR.board/header/channels half-written so every
   per-tick reader threw after it, and a toast that said "Could not load"
   as though nothing had happened. The format marker was the only check.

   This is the reader. It looks at EVERYTHING the importer is about to
   touch and throws, naming the field, before a single thing is written —
   the pattern scene/builder.js's mbImportModelText() already follows ("read
   the file before committing to it"). It returns a plan: the halves of the
   file, checked, with the channel rows already through chanNormalise()
   (servo-cfg.js, review H10 — a whole row, so a field nobody can read
   becomes the padding-row default and is counted). setupImportObj() then
   commits PREFS and MSTR at ONE point, and only after that calls anything
   that applies or saves. `untouched` on the error is the promise the toast
   makes: a refusal from here changed nothing, in memory or on disk.

   The prefs checks are SHAPE, not content: an object where an object is
   read, a word where a word is read, a number where a number is. The
   consumers (partsLoad, initPaint, rcPrefsRestore, trackLibLoad …) already
   cope with an unknown id or a missing key; what they cannot cope with is a
   string where they index a record. The Maestro checks go deeper, because
   nothing below them copes at all: genScript walks every frame of every
   sequence in the loadout and the engine reads every target raw.
   ===================================================================== */
function setupImportRead(o){
  const refuse = msg=>{ const e = new Error(msg); e.untouched = true; return e; };
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const isStr = v => typeof v === 'string';
  const kind  = v => v === undefined ? 'missing' : v === null ? 'null' : Array.isArray(v) ? 'a list'
                   : typeof v === 'object' ? 'an object' : 'a ' + typeof v;
  /* absent and null both mean "keep current" everywhere below — only a
     value that IS there has to be the right shape */
  const want  = (path, v, test, what)=>{
    if(v !== undefined && v !== null && !test(v)) throw refuse('"' + path + '" should be ' + what + ', not ' + kind(v));
  };
  if(!isObj(o) || o.format !== SETUP_FORMAT) throw refuse('not an R2 setup file (missing "'+SETUP_FORMAT+'" marker)');
  if(o.version > SETUP_VERSION) throw refuse('this setup file is from a newer sim (v'+o.version+') — update the sim first');
  const plan = {missingProfile:null, prefs:null, maestro:null, cad:null, repaired:0, repairs:[]};

  want('profile', o.profile, isStr, 'a firmware profile id');
  want('cfg',     o.cfg,     isObj, 'an object of constants');
  plan.missingProfile = (o.profile && !PROFILES[o.profile]) ? o.profile : null;

  if(o.prefs !== undefined && o.prefs !== null){
    want('prefs', o.prefs, isObj, 'an object');
    const pf = o.prefs;
    ['paint','parts','hw','hwMap','build','builder','tracks','track','rc','blkColors','puppetCues']
      .forEach(k=>want('prefs.'+k, pf[k], isObj, 'an object'));
    ['theme','stageTheme','model','env','ws','view'].forEach(k=>want('prefs.'+k, pf[k], isStr, 'a word'));
    want('prefs.uiScale',   pf.uiScale,   isNum, 'a number');
    want('prefs.bestLap',   pf.bestLap,   isNum, 'a number of milliseconds');
    want('prefs.favColors', pf.favColors, Array.isArray, 'a list of colours');
    plan.prefs = pf;
  }

  if(o.maestro !== undefined && o.maestro !== null){
    want('maestro', o.maestro, isObj, 'an object');
    const m = o.maestro;
    want('maestro.board',     m.board,     isStr, 'a board id');
    want('maestro.fileName',  m.fileName,  isStr, 'a file name');
    want('maestro.header',    m.header,    isObj, 'an object');
    want('maestro.channels',  m.channels,  Array.isArray, 'a list of channels');
    want('maestro.sequences', m.sequences, Array.isArray, 'a list of sequences');
    want('maestro.loadout',   m.loadout,   v=>Array.isArray(v) && v.every(isStr), 'a list of sequence names');
    const channels = (m.channels || []).map((row, k)=>{
      const nz = chanNormalise(row, {whole:true, i:k});
      plan.repaired += nz.fixed;
      nz.notes.forEach(t=>{ if(plan.repairs.length < 12) plan.repairs.push('ch ' + k + ' ' + t); });
      return nz.c;
    });
    /* a sequence is a frame list, or a generator (pcaseq.js: {gen, entries})
       — either way a name, and a shape genScript() and the engine can walk */
    (m.sequences || []).forEach((q, k)=>{
      const at = 'maestro.sequences[' + k + ']';
      if(!isObj(q)) throw refuse('"' + at + '" should be a sequence, not ' + kind(q));
      if(!isStr(q.name)) throw refuse('"' + at + '" has no name');
      const nm = at + ' (“' + q.name + '”)';
      if(q.gen === 'osc' || q.gen === 'wander'){
        if(!Array.isArray(q.entries)) throw refuse(nm + ': entries should be a list, not ' + kind(q.entries));
        return;
      }
      if(!Array.isArray(q.frames)) throw refuse(nm + ': frames should be a list of frames, not ' + kind(q.frames));
      q.frames.forEach((f, j)=>{
        const fat = nm + ' frame ' + j;
        if(!isObj(f)) throw refuse(fat + ' should be a frame, not ' + kind(f));
        if(!isNum(f.duration)) throw refuse(fat + ': duration should be a number of milliseconds, not ' + kind(f.duration));
        if(!Array.isArray(f.targets)) throw refuse(fat + ': targets should be a list, not ' + kind(f.targets));
        /* a hole is 0 = untouched (genFrameRow); anything that is not a
           number is the NaN that switches the clamps off (review H10) */
        if(!f.targets.every(t=>t == null || isNum(t))) throw refuse(fat + ': every target should be a number');
      });
    });
    plan.maestro = {
      board: m.board || boardForCount(channels.length).id,
      header: m.header || {},
      channels: channels,
      sequences: m.sequences || [],
      loadout: m.loadout || null,
      fileName: m.fileName || 'imported-setup.mstr'
    };
  }

  if(o.cad !== undefined && o.cad !== null){
    want('cad', o.cad, isObj, 'an object');
    want('cad.yOffset', o.cad.yOffset, isNum, 'a number');
    want('cad.moving',  o.cad.moving,  v=>Array.isArray(v) && v.every(isObj), 'a list of parts');
    plan.cad = o.cad;
  }
  return plan;
}

function setupImportObj(o){
  /* everything below this line has been read and refused-or-not already;
     from here the file is committed, then applied, then saved (v1.77.0,
     review H14 — the note above setupImportRead) */
  const plan = setupImportRead(o);
  const missingProfile = plan.missingProfile;

  /* profile + constants.

     A PROFILE THIS SIM DOES NOT HAVE IS REFUSED, NOT SHRUGGED OFF (2026-08-22).
     `loadProfile(id)` is `const p = PROFILES[id]; if(!p) return;` — it fails
     SILENTLY, and the two lines below used to carry on regardless: the FILE's
     constants were merged into whatever profile happened to already be loaded,
     and PREFS.build.firmware (further down) was pointed at the id that had just
     failed to load. The receipt then named the profile that WAS loaded, so the
     whole thing read as a success.

     This is not the corrupt-file case. Imported-sketch profiles are registered
     at runtime out of localStorage (profiles/sketch-import.js), and a setup
     file carries neither the .ino source nor any hint of where its id came
     from — so this is what your own exported setup does on another machine, or
     on this one after a Reset has wiped the store. CFG belongs to a profile:
     merging one sketch's constants onto another's is not a partial import, it
     is a wrong one, and DRIVESPEED1 lands on the throttle either way.

     So the constants and the build's firmware answer are held back together,
     the loaded profile is left exactly as it was, and `missingProfile` carries
     the id out to the receipt — everything else in the file still imports.
     (None of this is a store: CFG and the loaded profile live in memory, and
     the build's firmware answer is written with the rest of PREFS below.) */
  if(o.profile && !missingProfile) loadProfile(o.profile);
  if(o.cfg && !missingProfile) Object.assign(CFG, o.cfg);
  if(o.isLeftStickDrive !== undefined){ FW.isLeftStickDrive = o.isLeftStickDrive; applyStickMapping(); }
  if(CFG.DRIVESPEED1 !== undefined) FW.drivespeed = CFG.DRIVESPEED1;
  if(CFG.vol !== undefined) SND.vol = CFG.vol;

  /* ------------------------------------------------------------- COMMIT
     PREFS and MSTR, together, and nothing in this stretch calls anything
     that could throw on the file or write to a store — the applies and
     the saves come after, once both halves are in. */
  const pf = plan.prefs;
  let wsTouched = false;
  if(pf){
    /* prefs: themes, scale, paint, parts, hardware */
    if(pf.paint) PREFS.paint = pf.paint;
    if(pf.parts) PREFS.parts = pf.parts;
    if(pf.hw) PREFS.hw = pf.hw;
    if(pf.hwMap) PREFS.hwMap = pf.hwMap;
    /* build BEFORE hw would be wrong: buildGet() fills gaps from the default,
       and PREFS.hw is the store the two servo answers write through to. Taking
       the file's hw first and its build second keeps them agreeing. */
    if(pf.build) PREFS.build = pf.build;
    if(pf.bestLap) PREFS.bestLap = pf.bestLap;
    if(pf.stageTheme) PREFS.stageTheme = pf.stageTheme;
    /* v1.45.0 — PREFS.builder is assigned BEFORE modelSet(), because
       modelSet('builder') crosses the off->on-stage edge and rebuilds the
       assembly from PREFS on the way through (scene/builder.js's mbSetShown →
       mbRebuildFromPrefs). Landing the file's assembly afterwards meant a
       builder-model file rebuilt twice, the first time from whatever assembly
       this browser had BEFORE the import — replaying that one's restore
       warnings, and (now that a rebuild writes its result back) saving it.
       (v1.77.0: every assignment now lands before every apply, so this holds
       by construction — the note stays because it is the reason it must.) */
    if(pf.builder !== undefined) PREFS.builder = pf.builder;
    /* v1.45.0 — the layout library is what trackShapeData() reads; `track`
       is only its mirror. A file from v1.44.1 carries `track` and no
       `tracks`, so clear the library and let trackLibLoad() upgrade that
       single layout into it, exactly as a v1.44.1 browser's own prefs are. */
    if(pf.tracks !== undefined) PREFS.tracks = pf.tracks;
    else if(pf.track !== undefined) PREFS.tracks = null;
    if(pf.track !== undefined) PREFS.track = pf.track;
    /* workspaces (v1.17.0). Three shapes of file land here:
       — a current file: ws + adv. ws==='seq' (saved mid-desk) lands on Drive.
       — a pre-workspace file carrying the retired `view`: 'advanced' means
         they had the console, so it becomes adv=true; any view lands on Drive.
       — an adv-only file (hand-trimmed): the workspace stays put, but
         applyWs() re-runs so the Serial tab is re-gated either way. */
    if(pf.ws !== undefined || pf.adv !== undefined || pf.view !== undefined){
      wsTouched = true;
      if(pf.view === 'advanced') PREFS.adv = true;
      if(pf.view !== undefined) PREFS.ws = 'drive';
      if(pf.adv !== undefined) PREFS.adv = !!pf.adv;
      if(pf.ws !== undefined) PREFS.ws = (pf.ws === 'seq') ? 'drive' : pf.ws;
      PREFS.ws = ['drive','config','bench'].indexOf(PREFS.ws) >= 0 ? PREFS.ws : 'drive';
    }
    /* RC transmitter config: padId, advanced mode, channel calibration & mapping.
       Absent key = keep current; old files stay loadable. */
    if(pf.rc !== undefined) PREFS.rc = pf.rc;
    /* sequencer brick colours: per-action custom hex overrides. */
    if(pf.blkColors !== undefined) PREFS.blkColors = pf.blkColors;
    /* favourite paint swatches: user's six most-used hex values. */
    if(pf.favColors !== undefined) PREFS.favColors = pf.favColors;
    /* controller puppet cue mappings: button/stick → part/group/routine. */
    if(pf.puppetCues !== undefined) PREFS.puppetCues = pf.puppetCues;
  }
  /* the file's profile is authoritative — it is what its constants belong to,
     so a hand-edited build block never silently reloads a different sketch.
     Unless it is a profile this sim does not have: then it is not authoritative
     over anything, and writing it here would persist a dangling id into the
     build answers (see the note by the refusal above). */
  if(o.profile && !missingProfile && PREFS.build) PREFS.build.firmware = o.profile;

  /* Maestro settings, whole — the rows already through the gate */
  const mp = plan.maestro;
  if(mp){
    MSTR.board = mp.board;
    MSTR.header = mp.header;
    MSTR.channels = mp.channels;
    MSTR.sequences = mp.sequences;
    MSTR.loadout = mp.loadout;
    MSTR.servoCount = MSTR.channels.length;
    MSTR.fileName = mp.fileName;
    MSTR.xmlText = '';
    MSTR.loaded = true;
  }

  /* -------------------------------------------------------------- APPLY
     the same calls, in the same order they were always made — only now
     every one of them runs against a table and a prefs block that are
     both fully in */
  if(pf){
    if(pf.model && typeof modelSet === 'function') modelSet(pf.model, {frame:false});
    if(pf.env && typeof envApply === 'function') envApply(pf.env);  // v1.39.5: the popover promises the backdrop travels — now it does
    /* v1.41.0 — same "absent key = keep current" rule as env above. The
       Builder rebuilds its scene graph from PREFS.builder itself the next
       time it is on stage (mbSetShown()/mbRebuildFromPrefs(), scene/builder.js)
       — but if it is ALREADY the active model when a setup imports, that
       show-transition has already happened, so ask for the rebuild here too.
       `track` is carried for the practice-circuit agent, who owns its shape
       and its own apply path — this file only has to not drop the key. */
    if(pf.builder !== undefined){
      if(typeof modelGet === 'function' && modelGet() === 'builder' && typeof mbRebuildFromPrefs === 'function') mbRebuildFromPrefs();
    }
    if((pf.tracks !== undefined || pf.track !== undefined) && typeof trackRebuild === 'function') trackRebuild();
    if(wsTouched && typeof wsSet === 'function'){
      if(wsGet() !== PREFS.ws) wsSet(PREFS.ws);
      else applyWs(PREFS.ws);               // adv may have changed — re-gate Serial
    }
    if(pf.uiScale) applyUiScale(pf.uiScale);
    applyTheme(pf.theme || PREFS.theme);
    if(typeof rcPrefsRestore === 'function') rcPrefsRestore();
    if(typeof cuePrefsRestore === 'function') cuePrefsRestore();
  }
  if(mp){
    if(typeof chanDropRetiredActs === 'function') chanDropRetiredActs(MSTR.channels);
    if(typeof chanPosReset === 'function') chanPosReset();   // the table is a new table — CHPOS with it
    EDIT.live = MSTR.channels.map(c=>chanRest(c));   // v1.45.0 — doors rest shut, gimbals rest centred
    EDIT.seq = 0; EDIT.frame = -1;
    if(!MSTR.loadout) loadoutReset();          // an older setup file predates the loadout
    if(typeof reindexSubs==='function') reindexSubs();
    /* an imported setup IS this browser's servo config from now on */
    if(typeof servoStoreSave === 'function') servoStoreSave();
    /* AND THE ENGINE (v1.77.0). The bench engine is a COPY of the table,
       built once from the array it was handed (pcaCreate), and this door
       has just replaced that array wholesale — so a bench opened before the
       import went on driving the OLD droid's channels, limits and all,
       until some unrelated edit rebuilt it. servo-cfg.js fixed the same
       thing for its own door in v1.69.1 and says why `true` (carry the
       positions across) is the safe argument; the store's boot restore is
       the only rebuild(false), because at boot there is nothing to carry. */
    if(typeof HW !== 'undefined' && typeof HW.rebuild === 'function') HW.rebuild(true);
  }

  /* CAD mapping */
  if(plan.cad && typeof CAD!=='undefined' && CAD.loaded){
    CAD.yOffset = plan.cad.yOffset !== undefined ? plan.cad.yOffset : CAD.yOffset;
    (plan.cad.moving||[]).forEach(sm=>{
      const m = CAD.moving.find(x=>x.name===sm.name);
      if(m){ m.act = sm.act||''; m.flip = !!sm.flip; }
    });
  }

  /* labels, colours, groups — pruned against the loaded model as usual */
  if(typeof partsLoad==='function'){ partsLoad(); registerGroupAnims(); }
  if(typeof initPaint==='function') initPaint();
  prefsSave();

  /* every pane that shows any of this */
  if(typeof rebuildProfileUI==='function') rebuildProfileUI();
  if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
  if(typeof buildCadPane==='function') buildCadPane();
  if(missingProfile)
    lg('warn','setup import: firmware profile “'+missingProfile+'” is not installed in this sim. An imported '
      + 'sketch is registered from THIS browser, not carried inside a setup file, so its constants have no '
      + 'sketch to belong to here — they were left out, and so was the build\'s firmware answer. “'
      + PROFILE.short+'” is still loaded, exactly as it was. Drop the .ino in first, then import this setup again.');
  /* v1.77.0 (review H10) — the repaired channel fields are part of the
     receipt, by name in the log and as a count in the toast */
  if(plan.repaired){
    lg('warn','setup import: ' + (typeof chanRepairNote === 'function'
      ? chanRepairNote(plan.repaired, [], 'the file\'s channel table') : plan.repaired + ' channel field(s) repaired')
      + '. Check those channels on the bench before you run a sequence.');
    plan.repairs.forEach(t=>lg('sys','  ' + t));
  }
  lg('sys','setup imported — profile '+PROFILE.short
    + (missingProfile ? ' (unchanged; the file asked for “'+missingProfile+'”, which is not installed here, '
                        + 'so its constants were skipped — see the warning above)' : '')+', '
    + (mp ? MSTR.channels.length+' Maestro channels, '+MSTR.sequences.length+' sequences, ' : '')
    + Object.keys((pf&&pf.parts&&pf.parts.overrides)||{}).length+' part label/colour override(s)');
  return {ok:true, missingProfile:missingProfile, repaired:plan.repaired};
}
function setupImportText(text, name){
  try{
    const r = setupImportObj(JSON.parse(text)) || {};
    /* a drop imports with no pane open at all — the toast is the answer, and
       a part that did not land has to be part of that answer or it is not an
       answer at all (2026-08-22 — see the refusal note in setupImportObj) */
    /* v1.77.0 (review H10) — a count of repaired channel fields rides on
       whichever receipt is going out; the log names them */
    const fixed = r.repaired ? ' — ' + r.repaired + ' channel field' + (r.repaired === 1 ? '' : 's')
      + ' could not be read and ' + (r.repaired === 1 ? 'was' : 'were') + ' repaired, see the log' : '';
    if(r.missingProfile)
      toast('Setup loaded from '+(name||'file')+' — but its firmware “'+r.missingProfile+'” is not installed '
        + 'here, so its constants were left out and “'+PROFILE.short+'” is still loaded. Import the .ino '
        + 'sketch first, then load this setup again.' + fixed, 'warn');
    else toast('Setup loaded from '+(name||'file') + fixed, fixed ? 'warn' : '');
    return {ok:true, missingProfile:r.missingProfile || null, repaired:r.repaired || 0};
  }catch(e){
    lg('warn','setup import failed ('+(name||'file')+'): '+e.message);
    /* v1.77.0 (review H14) — a refusal from the reader is a promise, and
       the toast makes it: nothing in memory or on disk is different */
    toast('Could not load '+(name||'file')+': '+e.message + (e.untouched ? ' — nothing was changed' : ''), 'err');
    return {ok:false, error:e.message, untouched:!!e.untouched};
  }
}
function setupImportFile(file){
  const fr = new FileReader();
  fr.onload = ()=>{
    const r = setupImportText(fr.result, file.name);
    const m = $('expMsg') || $('cadMsg');
    if(m) m.textContent = !r.ok ? 'Could not load '+file.name+': '+r.error
      : r.missingProfile
        ? 'Setup loaded from '+file.name+', except its firmware “'+r.missingProfile+'” — that sketch is not '
          + 'installed here, so its constants were left out. Import the .ino first, then load this setup again.'
        : 'Setup loaded from '+file.name+'.';
    if(typeof buildStartup==='function' && $('startup').classList.contains('on')) buildStartup();
  };
  fr.readAsText(file);
}

/* buttons for a host bar — used by the Config tab and the startup screen */
function setupButtons(host, msgEl){
  const bar = el('div','conbar');
  const bSave = el('button','b prim','Export setup (.json)');
  bSave.title = 'everything in one file: profile, constants, Maestro, part mapping, names, colours, groups, themes';
  bSave.addEventListener('click',()=>{ const f=setupExport(); if(msgEl) msgEl.textContent='Exported '+f+' — the whole configuration in one file.'; });
  const bLoad = el('button','b','Import setup');
  const fin = document.createElement('input'); fin.type='file'; fin.accept='.json,application/json'; fin.style.display='none';
  fin.addEventListener('change',()=>{ if(fin.files[0]) setupImportFile(fin.files[0]); fin.value=''; });
  bLoad.addEventListener('click',()=>fin.click());
  const bReset = el('button','b danger','Reset');
  /* v1.45.0 — Mike: "Make Reset clear hardware configuration too." The button
     already called servoStoreClear(), and the store really was empty for the
     three lines that followed — but the servo channel table came back anyway,
     with every name and measured endpoint intact.

     WHY. maestro/servo-store.js listens for `pagehide` and `visibilitychange`
     and flushes MSTR to its key so a tab closed mid-edit keeps the last 500 ms
     of work. `location.reload()` fires `pagehide`. So the sequence was:
     remove the key → remove the servo key → reload → pagehide → the flush
     writes the still-populated in-memory MSTR straight back into the key we
     had just deleted → boot restores it. The clear was real; the resurrection
     happened afterwards, which is why reading the store between the two
     showed nothing wrong.

     THE FIX is to empty the thing that gets flushed, not to fight the flush:
     servoStoreSave() refuses to write a table with no servo channels in it
     (servoStoreWorth()), so a blanked MSTR makes the on-the-way-out flush a
     no-op — and any pending servoStoreTouch() debounce with it. The listeners
     stay exactly as they are; they are right for every other exit.

     (Not the reader: buildEnsureMaestro() is innocent here. It regenerates a
     starter only when nothing is loaded, and a starter's channels are named
     after panels with factory endpoints — v1.43.0's trap — which is not what
     Mike saw. He saw HIS names come back. That is a restore, not a starter.) */
  bReset.title = 'wipe every saved preference AND the servo hardware config — paint, names, groups, '
    + 'electronics choice, the build answers, the servo channel table with its measured endpoints, '
    + 'best lap — and restart fresh';
  bReset.addEventListener('click',async ()=>{
    if(!await appConfirm('Are you sure? This wipes ALL saved settings — paint scheme, part names, groups, '
      + 'UI scale, best lap — and restarts the sim.\n\n'
      + 'It also wipes the hardware configuration: the build answers from this setup (what board is where, '
      + 'which sketch, which sound module) and the servo channel table with every name, part mapping and '
      + 'measured endpoint you calibrated, plus the sequences built on them.\n\n'
      + 'Setup .json files you have saved to disk are NOT touched; you can Load one afterwards.',
      {title:'Reset everything', yes:'Wipe and restart', no:'Cancel', danger:true})) return;
    /* the in-memory table first — see the note above */
    if(typeof MSTR !== 'undefined'){
      MSTR.loaded = false; MSTR.channels = []; MSTR.sequences = []; MSTR.subs = [];
      if(typeof chanPosReset === 'function') chanPosReset();   // the table is a new table — CHPOS with it
      MSTR.loadout = null; MSTR.xmlText = ''; MSTR.fileName = ''; MSTR.header = {};
    }
    if(typeof servoStoreClear === 'function') servoStoreClear();
    try{ localStorage.removeItem(STORE_KEY); }catch(e){}
    location.reload();
  });
  bar.appendChild(bSave); bar.appendChild(bLoad); bar.appendChild(bReset); bar.appendChild(fin);
  host.appendChild(bar);
}
