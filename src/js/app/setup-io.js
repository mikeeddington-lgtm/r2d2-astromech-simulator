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

function setupImportObj(o){
  if(!o || o.format !== SETUP_FORMAT) throw new Error('not an R2 setup file (missing "'+SETUP_FORMAT+'" marker)');
  if(o.version > SETUP_VERSION) throw new Error('this setup file is from a newer sim (v'+o.version+') — update the sim first');

  /* profile + constants */
  if(o.profile && PROFILES[o.profile]) loadProfile(o.profile);
  if(o.cfg) Object.assign(CFG, o.cfg);
  if(o.isLeftStickDrive !== undefined){ FW.isLeftStickDrive = o.isLeftStickDrive; applyStickMapping(); }
  if(CFG.DRIVESPEED1 !== undefined) FW.drivespeed = CFG.DRIVESPEED1;
  if(CFG.vol !== undefined) SND.vol = CFG.vol;

  /* prefs: themes, scale, paint, parts, hardware */
  if(o.prefs){
    const pf = o.prefs;
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
       warnings, and (now that a rebuild writes its result back) saving it. */
    if(pf.builder !== undefined) PREFS.builder = pf.builder;
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
    /* v1.45.0 — the layout library is what trackShapeData() reads; `track`
       is only its mirror. A file from v1.44.1 carries `track` and no
       `tracks`, so clear the library and let trackLibLoad() upgrade that
       single layout into it, exactly as a v1.44.1 browser's own prefs are. */
    if(pf.tracks !== undefined) PREFS.tracks = pf.tracks;
    else if(pf.track !== undefined) PREFS.tracks = null;
    if(pf.track !== undefined) PREFS.track = pf.track;
    if((pf.tracks !== undefined || pf.track !== undefined) && typeof trackRebuild === 'function') trackRebuild();
    /* workspaces (v1.17.0). Three shapes of file land here:
       — a current file: ws + adv. ws==='seq' (saved mid-desk) lands on Drive.
       — a pre-workspace file carrying the retired `view`: 'advanced' means
         they had the console, so it becomes adv=true; any view lands on Drive.
       — an adv-only file (hand-trimmed): the workspace stays put, but
         applyWs() re-runs so the Serial tab is re-gated either way. */
    if(pf.ws !== undefined || pf.adv !== undefined || pf.view !== undefined){
      if(pf.view === 'advanced') PREFS.adv = true;
      if(pf.view !== undefined) PREFS.ws = 'drive';
      if(pf.adv !== undefined) PREFS.adv = !!pf.adv;
      if(pf.ws !== undefined) PREFS.ws = (pf.ws === 'seq') ? 'drive' : pf.ws;
      if(typeof wsSet === 'function'){
        const target = ['drive','config','bench'].indexOf(PREFS.ws) >= 0 ? PREFS.ws : 'drive';
        PREFS.ws = target;
        if(wsGet() !== target) wsSet(target);
        else applyWs(target);               // adv may have changed — re-gate Serial
      }
    }
    if(pf.uiScale) applyUiScale(pf.uiScale);
    applyTheme(pf.theme || PREFS.theme);
    /* RC transmitter config: padId, advanced mode, channel calibration & mapping.
       Absent key = keep current; old files stay loadable. */
    if(pf.rc !== undefined) PREFS.rc = pf.rc;
    if(typeof rcPrefsRestore === 'function') rcPrefsRestore();
    /* sequencer brick colours: per-action custom hex overrides. */
    if(pf.blkColors !== undefined) PREFS.blkColors = pf.blkColors;
    /* favourite paint swatches: user's six most-used hex values. */
    if(pf.favColors !== undefined) PREFS.favColors = pf.favColors;
    /* controller puppet cue mappings: button/stick → part/group/routine. */
    if(pf.puppetCues !== undefined) PREFS.puppetCues = pf.puppetCues;
    if(typeof cuePrefsRestore === 'function') cuePrefsRestore();
  }

  /* Maestro settings, whole */
  if(o.maestro){
    const m = o.maestro;
    MSTR.board = m.board || boardForCount((m.channels||[]).length).id;
    MSTR.header = m.header || {};
    MSTR.channels = m.channels || [];
    MSTR.sequences = m.sequences || [];
    MSTR.loadout = m.loadout || null;
    MSTR.servoCount = MSTR.channels.length;
    MSTR.fileName = m.fileName || 'imported-setup.mstr';
    MSTR.xmlText = '';
    MSTR.loaded = true;
    EDIT.live = MSTR.channels.map(c=>chanRest(c));   // v1.45.0 — doors rest shut, gimbals rest centred
    EDIT.seq = 0; EDIT.frame = -1;
    if(!MSTR.loadout) loadoutReset();          // an older setup file predates the loadout
    if(typeof reindexSubs==='function') reindexSubs();
    /* an imported setup IS this browser's servo config from now on */
    if(typeof servoStoreSave === 'function') servoStoreSave();
  }

  /* CAD mapping */
  if(o.cad && typeof CAD!=='undefined' && CAD.loaded){
    CAD.yOffset = o.cad.yOffset !== undefined ? o.cad.yOffset : CAD.yOffset;
    (o.cad.moving||[]).forEach(sm=>{
      const m = CAD.moving.find(x=>x.name===sm.name);
      if(m){ m.act = sm.act||''; m.flip = !!sm.flip; }
    });
  }

  /* the file's profile is authoritative — it is what its constants belong to,
     so a hand-edited build block never silently reloads a different sketch */
  if(o.profile && PREFS.build) PREFS.build.firmware = o.profile;

  /* labels, colours, groups — pruned against the loaded model as usual */
  if(typeof partsLoad==='function'){ partsLoad(); registerGroupAnims(); }
  if(typeof initPaint==='function') initPaint();
  prefsSave();

  /* every pane that shows any of this */
  if(typeof rebuildProfileUI==='function') rebuildProfileUI();
  if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
  if(typeof buildCadPane==='function') buildCadPane();
  lg('sys','setup imported — profile '+PROFILE.short+', '
    + (o.maestro ? MSTR.channels.length+' Maestro channels, '+MSTR.sequences.length+' sequences, ' : '')
    + Object.keys((o.prefs&&o.prefs.parts&&o.prefs.parts.overrides)||{}).length+' part label/colour override(s)');
  return true;
}
function setupImportText(text, name){
  try{
    setupImportObj(JSON.parse(text));
    /* a drop imports with no pane open at all — the toast is the answer */
    toast('Setup loaded from '+(name||'file'));
    return {ok:true};
  }catch(e){
    lg('warn','setup import failed ('+(name||'file')+'): '+e.message);
    toast('Could not load '+(name||'file')+': '+e.message, 'err');
    return {ok:false, error:e.message};
  }
}
function setupImportFile(file){
  const fr = new FileReader();
  fr.onload = ()=>{
    const r = setupImportText(fr.result, file.name);
    const m = $('expMsg') || $('cadMsg');
    if(m) m.textContent = r.ok ? 'Setup loaded from '+file.name+'.' : 'Could not load '+file.name+': '+r.error;
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
      MSTR.loadout = null; MSTR.xmlText = ''; MSTR.fileName = ''; MSTR.header = {};
    }
    if(typeof servoStoreClear === 'function') servoStoreClear();
    try{ localStorage.removeItem(STORE_KEY); }catch(e){}
    location.reload();
  });
  bar.appendChild(bSave); bar.appendChild(bLoad); bar.appendChild(bReset); bar.appendChild(fin);
  host.appendChild(bar);
}
