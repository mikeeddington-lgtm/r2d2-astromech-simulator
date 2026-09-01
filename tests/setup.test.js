/* window resize, audio-only playback, whole-setup export/import round trip */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser({audio:true});
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); setScheme('r2d2'); });
  const ev = f => page.evaluate(f);

  console.log('\n════ the stage follows the window ════');
  const w1 = await ev(()=>renderer.domElement.width);
  await page.setViewportSize({width:1050, height:700});
  await page.waitForTimeout(400);
  const w2 = await ev(()=>({c:renderer.domElement.width, stage:$('stage').clientWidth, aspect:+camera.aspect.toFixed(2)}));
  ok('shrinking the window shrinks the canvas', w2.c < w1 && w2.c===w2.stage, w1+' → '+w2.c);
  ok('camera aspect follows the new shape', await ev(()=>Math.abs(camera.aspect - $('stage').clientWidth/$('stage').clientHeight) < 0.01));
  await page.setViewportSize({width:1500, height:950});
  await page.waitForTimeout(400);
  const w3 = await ev(()=>renderer.domElement.width);
  ok('growing it grows back', w3===w1, w3+'');
  await ev(()=>applyUiScale(1.25));
  await page.setViewportSize({width:1200, height:800});
  await page.waitForTimeout(400);
  ok('resize still works with the UI scaled', await ev(()=>Math.abs(renderer.domElement.width - $('stage').clientWidth) <= 2));
  await ev(()=>applyUiScale(1.0));
  await page.setViewportSize({width:1500, height:950});
  await page.waitForTimeout(300);

  console.log('\n════ the player plays the track on its own ════');
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  await ev(async ()=>{
    const sr=22050, ctx=new OfflineAudioContext(1, sr*6, sr);
    for(let t=0.25;t<6;t+=0.5){ const o=ctx.createOscillator(),g=ctx.createGain();
      o.frequency.value=900; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.05); o.start(t); o.stop(t+0.06); }
    musicSetBuffer(await ctx.startRendering(),'solo.wav');
    setStripMode('seq');
    /* Since v1.27.0 opening the desk GENERATES a starter for the build's
       board (a PCA9685 arrangement here), so "no sequence at all" has to be
       arranged rather than assumed — which is the honest way to test it
       anyway: the music bar must not depend on there being one. */
    MSTR.loaded = false; MSTR.sequences = []; MSTR.channels = [];
    buildSequencer();
  });
  ok('Play is enabled with NO sequence at all', await ev(()=>{
    const b = Array.from($('musbar').querySelectorAll('button')).find(x=>/Play/.test(x.textContent));
    return b && !b.disabled && !MSTR.loaded;
  }));
  const solo = await ev(async ()=>{
    musicPlay(null);
    if(!MUSIC.playing) return {started:false};
    const state0 = MUSIC.playing.ctx.state;
    await new Promise(r=>setTimeout(r, 700));
    const t = MUSIC.playing ? (MUSIC.playing.ctx.currentTime - MUSIC.playing.t0) : -1;
    const msg = $('musstat').textContent;
    musicStop();
    return {started:true, state0, t, msg};
  });
  ok('audio-only playback runs on the audio clock', solo.started && solo.t > 0.4, 't='+solo.t);
  ok('the context is running, not suspended', solo.state0==='running', solo.state0);
  ok('the status says audio-only', /audio only/.test(solo.msg), solo.msg.slice(0,60));

  console.log('\n════ whole-setup round trip ════');
  // build a distinctive setup
  const snap = await ev(()=>{
    setBoard('mini18'); makeStarter('body','mini18');
    CFG.DRIVESPEED1 = 71;
    const g = groupCreate('Roundtrip');
    const fl = CAD.moving.find(m=>m.base==='FLBreadpanDoor');
    groupToggleMember(g.id, fl.name, true); groupSetColor(g.id, '#12ab34');
    setPartLabel(fl.name, 'left cheese hatch');
    setPartColor(fl.name, '#ba9812');
    setScheme('r2q5');
    PREFS.stageTheme='light'; applyStageTheme();
    hwGet().dome='micro6'; prefsSave();
    MSTR.channels[3].act='drawer';
    /* new in v1.45.0: four hand-made configs that were being dropped */
    // brick colour: set a custom colour for the 'drawer' action
    blkSetColor('drawer', '#ff00ff');
    // favourite swatch: set the first favourite to a distinctive colour
    favSet(0, '#aabbcc');
    // puppet cue: map the A button to the drawer action
    puppetSet(true);
    const drawerAct = cueCatalog().find(c=>c.kind==='act' && c.ref==='drawer');
    if(drawerAct) cueSet('A', drawerAct);
    // RC transmitter: fake a calibrated channel setup
    RC.padId = 'test-transmitter-001';
    RC.advanced = true;
    RC.chans = [
      {src:'axis', i:0, pad:'LX', mode:'norm', min:-0.95, max:0.95, mid:0, ctr:'rest', moved:true},
      {src:'axis', i:1, pad:'LY', mode:'norm', min:-1, max:1, mid:0, ctr:'rest', moved:true}
    ];
    rcPrefsSave();
    return JSON.stringify(setupExportObj());
  });
  ok('export captures the lot', (()=>{
    const o = JSON.parse(snap);
    return o.format==='r2sim-setup' && o.profile==='maestro25' && o.cfg.DRIVESPEED1===71
      && o.maestro.board==='mini18' && o.maestro.channels[3].act==='drawer'
      && o.prefs.parts.groups.some(g=>g.name==='Roundtrip' && g.color==='#12ab34')
      && o.prefs.hw.dome==='micro6' && o.prefs.paint.scheme==='r2q5'
      && o.prefs.blkColors && o.prefs.blkColors.drawer==='#ff00ff'
      && o.prefs.favColors && o.prefs.favColors[0]==='#aabbcc'
      && o.prefs.puppetCues && o.prefs.puppetCues.map && o.prefs.puppetCues.map.A
      && o.prefs.rc && o.prefs.rc.padId==='test-transmitter-001' && o.prefs.rc.chans.length===2;
  })());

  /* v1.45.0 — Mike: "Add date and time, without seconds, to saved/exported
     filenames." setupExport() is one of this file's two writers; the wiring
     sheet and its CSV are pinned in wiring.test.js. */
  ok('the exported file is named R2-setup-<profile>-YYYY-MM-DD-HHMM.json', await ev(()=>{
    const n = setupExport();
    return /^R2-setup-[a-z0-9]+-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(n)
        && n.indexOf(fileStamp())>0            // the shared stamp, local time
        && !/\d{4}-\d{2}-\d{2}-\d{6}/.test(n); // to the minute, no seconds
  }));

  // wreck everything, then import the snapshot
  const restored = await page.evaluate(async (text)=>{
    loadProfile('mod2026');
    CFG.DRIVESPEED1 = 90;
    PARTS.groups.length = 0; PARTS.overrides = {}; partsSave(); registerGroupAnims();
    setScheme('r2d2'); PREFS.stageTheme='follow'; hwGet().dome='mini24'; prefsSave();
    MSTR.loaded=false; MSTR.channels=[]; MSTR.sequences=[];
    // wipe the new configs
    PREFS.blkColors = {}; PREFS.favColors = null; PREFS.puppetCues = null; PREFS.rc = null;
    RC.padId = ''; RC.chans = [];
    CUE.map = {}; CUE.latch = {};
    const r = setupImportText(text, 'roundtrip.json');
    const fl = CAD.moving.find(m=>m.base==='FLBreadpanDoor');
    return { ok:r.ok,
      profile: PROFILE.id, ds: CFG.DRIVESPEED1,
      board: MSTR.board, chans: MSTR.channels.length, ch3: MSTR.channels[3] && MSTR.channels[3].act,
      subs: MSTR.subs.length,
      group: PARTS.groups.some(g=>g.name==='Roundtrip' && g.color==='#12ab34'),
      label: partLabel(fl.name), colour: effectivePartHex(fl.name),
      scheme: PAINT.scheme, stage: PREFS.stageTheme, hwDome: hwGet().dome,
      // new in v1.45.0: verify four hand-made configs came back
      blkCol: blkColor('drawer'), favCol: (PREFS.favColors||[])[0],
      rcPadId: RC.padId, rcChans: RC.chans.length,
      cueMapped: !!CUE.map.A, cueRef: CUE.map.A && CUE.map.A.ref };
  }, snap);
  ok('import restores the profile and constants', restored.ok && restored.profile==='maestro25' && restored.ds===71);
  ok('…the Maestro board, channels and mapping', restored.board==='mini18' && restored.chans===18 && restored.ch3==='drawer' && restored.subs>0);
  ok('…groups with their colours', restored.group);
  ok('…part labels and colour overrides', restored.label==='left cheese hatch' && restored.colour==='#ba9812',
     restored.label+' / '+restored.colour);
  ok('…paint scheme, stage theme and electronics', restored.scheme==='r2q5' && restored.stage==='light' && restored.hwDome==='micro6');
  ok('…brick colours for sequencer bricks', restored.blkCol==='#ff00ff', 'drawer block color: '+restored.blkCol);
  ok('…favourite paint swatches', restored.favCol==='#aabbcc', 'fav[0]: '+restored.favCol);
  ok('…RC transmitter calibration and mapping', restored.rcPadId==='test-transmitter-001' && restored.rcChans===2);
  ok('…controller puppet cue assignments', restored.cueMapped && restored.cueRef==='drawer');
  ok('a garbage file is refused with a reason', await ev(()=>{
    const r = setupImportText('{"hello":1}', 'junk.json');
    return !r.ok && /not an R2 setup/.test(r.error);
  }));
  ok('the buttons exist in Save & load and on the wizard\'s last step', await ev(()=>{
    saveLoadPopover();
    const inCfg = Array.from(document.querySelectorAll('.slpop button')).some(b=>/Export setup/.test(b.textContent));
    saveLoadClose();
    wizOpen(wizSteps().length-1);            // the wizard's review step
    const inStp = Array.from($('startupBody').querySelectorAll('button')).some(b=>/Export setup/.test(b.textContent));
    closeStartup();
    return inCfg && inStp;
  }));

  /* ================================================================
     2026-08-22 — A SETUP NAMING A FIRMWARE THIS SIM DOES NOT HAVE

     `loadProfile(id)` is `const p = PROFILES[id]; if(!p) return;` — it fails
     SILENTLY. The import used to shrug that off and carry on: it merged the
     FILE's constants into whatever profile happened to be loaded, pointed
     PREFS.build.firmware at the id it had just failed to load, and printed a
     receipt naming the profile that was already there. It read as success.

     This is not a corrupt-file case. An imported-sketch profile is registered
     at RUNTIME out of localStorage, and a setup file carries neither the .ino
     source nor any hint of where the id came from — so your own exported
     setup does this on another machine, or on this one after a Reset. The
     answer has to be the same one the Model Builder's import gives: land
     everything that can be landed, refuse the part that cannot, and say which
     — by name, with the way out of it.
     ================================================================ */
  console.log('\n════ a setup naming a firmware this sim does not have ════');
  const ghost = await ev(()=>{
    loadProfile('mod2026');
    CFG.DRIVESPEED1 = 90;
    delete CFG.MY_SKETCH_CONST;
    if(!PREFS.build) PREFS.build = {};
    PREFS.build.firmware = 'maestro25';
    PREFS.bestLap = null;
    const host = $('toasts'); if(host) host.remove();
    const at = LOG.length;
    const r = setupImportText(JSON.stringify({
      format:'r2sim-setup', version:1,
      profile:'sk_mydroid_ino',                       // an imported sketch that is not here
      cfg:{DRIVESPEED1:77, MY_SKETCH_CONST:42},       // its constants, which belong to it
      prefs:{bestLap:42.5}                            // ordinary settings, which do not
    }), 'mydroid-setup.json');
    const t = Array.from(document.querySelectorAll('#toasts .toastp'));
    return {ok:r.ok,
      profile:PROFILE.id, ds:CFG.DRIVESPEED1, sketchConst:CFG.MY_SKETCH_CONST,
      firmware:(PREFS.build||{}).firmware, registered:!!PROFILES['sk_mydroid_ino'],
      bestLap:PREFS.bestLap,
      toast:t.map(x=>x.textContent).join(' | '), toastKind:t.map(x=>x.className).join(' | '),
      log:LOG.slice(at).map(l=>l.k+': '+l.s)};
  });
  ok('the profile it names really is not registered here', !ghost.registered);
  ok('the current profile is left alone — an unknown id does not silently keep it',
     ghost.profile === 'mod2026', ghost.profile);
  ok('the file\'s constants are REFUSED, not merged onto the wrong sketch',
     ghost.ds === 90 && ghost.sketchConst === undefined,
     'DRIVESPEED1='+ghost.ds+' MY_SKETCH_CONST='+ghost.sketchConst);
  ok('PREFS.build.firmware is not left pointing at a profile that does not exist',
     ghost.firmware === 'maestro25', String(ghost.firmware));
  ok('everything else in the file still imports', ghost.bestLap === 42.5, String(ghost.bestLap));
  ok('the toast says so, as a warning, and names the missing profile',
     /warn/.test(ghost.toastKind) && /sk_mydroid_ino/.test(ghost.toast), ghost.toast);
  ok('…and tells the user what to do about it — the sketch first, then the setup',
     /\.ino/.test(ghost.toast) && /setup/i.test(ghost.toast), ghost.toast);
  ok('the log carries the same warning, by name',
     ghost.log.some(l=>/^warn: /.test(l) && /sk_mydroid_ino/.test(l)), ghost.log.join(' ~ '));
  ok('…and the receipt no longer reads as a plain success',
     ghost.log.some(l=>/setup imported/.test(l) && /sk_mydroid_ino/.test(l)), ghost.log.join(' ~ '));
  /* the other half of the rule: a profile this sim DOES have still merges */
  const known = await ev(()=>{
    const r = setupImportText(JSON.stringify({
      format:'r2sim-setup', version:1, profile:'maestro25', cfg:{DRIVESPEED1:63}
    }), 'known-setup.json');
    return {ok:r.ok, profile:PROFILE.id, ds:CFG.DRIVESPEED1, firmware:(PREFS.build||{}).firmware};
  });
  ok('a profile this sim does have still loads and still takes its constants',
     known.ok && known.profile === 'maestro25' && known.ds === 63 && known.firmware === 'maestro25',
     JSON.stringify(known));

  console.log('\n════ favourites, metals, and the Fusion colours ════');
  const doorName = await ev(()=>CAD.moving.find(m=>m.base==='FLBreadpanDoor').name);
  await page.evaluate(n=>selectPart(n), doorName);
  ok('six favourite swatches on the part card', await ev(()=>
    $('selcard').querySelectorAll('.favsw:not(.met)').length===6));
  ok('eight metal swatches too', await ev(()=>
    $('selcard').querySelectorAll('.favsw.met').length===8));
  ok('clicking a favourite paints the part', await page.evaluate(n=>{
    favSet(0,'#123456');
    $('selcard').querySelectorAll('.favsw:not(.met)')[0].click();
    return effectivePartHex(n)==='#123456';
  }, doorName));
  ok('favourites persist', await ev(()=>
    JSON.parse(localStorage.getItem('r2sim.prefs.v1')).favColors[0]==='#123456'));
  ok('a metal swatch sets colour AND a metallic finish on a rigged part', await page.evaluate(n=>{
    const gold = Array.from($('selcard').querySelectorAll('.favsw.met')).find(b=>/Gold/.test(b.title));
    gold.click();
    const m = CAD.moving.find(x=>x.name===n);
    return effectivePartHex(n)==='#d4af37' && PARTS.overrides[n].finish==='metal'
      && m.mesh.material.metalness > 0.9 && m.mesh.material !== CAD.slotMats[CAD.partIndex[n].slot];
  }, doorName));
  ok('clearing the finish returns the shared slot material', await page.evaluate(n=>{
    setPartFinish(n, null); setPartColor(n, null);
    const m = CAD.moving.find(x=>x.name===n);
    return m.mesh.material === CAD.slotMats[CAD.partIndex[n].slot];
  }, doorName));
  await ev(()=>deselectPart());
  ok('the Fusion scheme restores the original .mtl colours', await ev(()=>{
    setScheme('fusion');
    const blue = CAD.header.parts.find(p=>CAD.partIndex[p.name] && /Glossy_\(Blue\)/.test(CAD.header.materials[+CAD.partIndex[p.name].slot.split(':')[2]].name||''));
    const hex = effectivePartHex(blue.name);
    const orig = fusionPartHex(blue.name);
    setScheme('r2d2');
    return hex === orig && orig !== null;
  }));
  ok('Fusion appears as a scheme button on the wizard colours step', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_paint'));
    const found = Array.from($('startupBody').querySelectorAll('button.b')).some(b=>/Fusion/.test(b.textContent));
    closeStartup(); return found;
  }));

  /* ================================================================
     v1.77.0 — review H14: THE PREFS HALF WAS ON DISK BEFORE THE MAESTRO
     HALF COULD FAIL.

     setupImportObj() assigned PREFS.* and called applyTheme() (which
     saves), modelSet(), envApply() — and only then touched MSTR with no
     shape check. `"maestro":{"channels":"x"}` threw at
     MSTR.channels.map() with the file's build answers, paint and cues
     already persisted and the previous ones gone, MSTR half-written, and
     a toast that said "Could not load" as though nothing had happened.
     The whole file is read into scratch first now (setupImportRead); a
     refusal changes nothing, in memory or on disk, and the toast says so.
     Two files: one whose Maestro block is wrong in the first field read,
     one whose prefs half is fine and whose fault is deep in a sequence.
     ================================================================ */
  console.log('\n════ v1.77.0 — H14: a refused setup file changes nothing ════');
  const h14 = await ev(()=>{
    /* something of your own to lose, in every store the import writes */
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12');
    if(!MSTR.loaded) buildEnsureMaestro();
    MSTR.channels[0].name = 'MINE-H14';
    PREFS.bestLap = 31337;
    prefsSave(); servoStoreSave();
    const snap = ()=>({
      prefs: localStorage.getItem('r2sim.prefs.v1'),
      servo: localStorage.getItem('r2sim.servo.v1'),
      build: JSON.stringify(PREFS.build), chans: JSON.stringify(MSTR.channels),
      seqs: MSTR.sequences.length, bestLap: PREFS.bestLap, theme: PREFS.theme});
    const before = snap();
    const host = $('toasts'); if(host) host.remove();
    const toasts = ()=>Array.from(document.querySelectorAll('#toasts .toastp')).map(x=>x.textContent).join(' | ');
    /* a prefs half that WOULD land — a different build, a different theme,
       a different best lap — on top of a Maestro half that cannot */
    const evil = m=>JSON.stringify({format:'r2sim-setup', version:1, profile:'maestro25',
      prefs:{bestLap:1, theme:(PREFS.theme === 'light' ? 'dark' : 'light'),
             build:Object.assign({}, PREFS.build, {domeServo:'micro6', bodyServo:'micro6'})},
      maestro:m});
    const r1 = setupImportText(evil({board:'mini24', channels:'x', sequences:[]}), 'channels-string.json');
    const t1 = toasts();
    const mid = snap();
    const r2 = setupImportText(evil({board:MSTR.board, channels:JSON.parse(before.chans),
      sequences:[{name:'Broken', frames:{}}]}), 'frames-object.json');
    const t2 = toasts();
    const after = snap();
    return {before, mid, after, r1, r2, t1, t2};
  });
  ok('a file whose maestro.channels is a string is refused, and the reason names the field',
     !h14.r1.ok && /maestro\.channels/.test(h14.r1.error), h14.r1.error);
  ok('...and PREFS.build is exactly as it was', h14.mid.build === h14.before.build, h14.mid.build);
  ok('...and MSTR.channels is exactly as it was — not half-written',
     h14.mid.chans === h14.before.chans && /MINE-H14/.test(h14.mid.chans), h14.mid.chans.slice(0, 60));
  ok('...and localStorage did not move — neither the prefs key nor the servo store',
     h14.mid.prefs === h14.before.prefs && h14.mid.servo === h14.before.servo);
  ok('...so the theme and best lap the file carried did not land either',
     h14.mid.theme === h14.before.theme && h14.mid.bestLap === 31337, h14.mid.theme+' / '+h14.mid.bestLap);
  ok('the toast names the reason and promises nothing was changed',
     /maestro\.channels/.test(h14.t1) && /nothing was changed/.test(h14.t1), h14.t1);
  ok('a file whose prefs half is fine but whose sequences[0].frames is not a list is refused too, by name',
     !h14.r2.ok && /sequences\[0\]/.test(h14.r2.error) && /frames/.test(h14.r2.error), h14.r2.error);
  ok('...with PREFS.build, MSTR.channels, the library and localStorage all unchanged',
     h14.after.build === h14.before.build && h14.after.chans === h14.before.chans
     && h14.after.seqs === h14.before.seqs && h14.after.bestLap === 31337
     && h14.after.prefs === h14.before.prefs && h14.after.servo === h14.before.servo,
     'bestLap '+h14.after.bestLap+', seqs '+h14.after.seqs+' of '+h14.before.seqs);
  ok('...and that toast promises the same', /nothing was changed/.test(h14.t2), h14.t2);

  /* review H10 — the same gate, through THIS door: a whole row, so a field
     nobody can read is the padding-row default rather than NaN, and the
     bench engine is rebuilt on the new table so the clamp is real */
  console.log('\n════ v1.77.0 — H10 through the whole-setup door ════');
  const h10s = await ev(()=>{
    const host = $('toasts'); if(host) host.remove();
    const at = LOG.length;
    /* a table to start from — on a tree with H14 unfixed, the block above
       leaves MSTR.channels as the string "x", and this door's own fault
       should show as a FAIL here rather than as a crashed harness */
    if(!Array.isArray(MSTR.channels) || MSTR.channels.length < 2){ MSTR.loaded = false; MSTR.channels = []; buildEnsureMaestro(); }
    const chans = JSON.parse(JSON.stringify(MSTR.channels));
    chans[0].min = 'abc'; chans[0].max = '4000'; chans[1].speed = 'fast';
    const r = setupImportText(JSON.stringify({format:'r2sim-setup', version:1,
      maestro:{board:MSTR.board, channels:chans, sequences:[], loadout:[]}}), 'quoted.json');
    const c0 = MSTR.channels[0], c1 = MSTR.channels[1];
    const E = HW.engine(); pcaSetTarget(E, 0, 16000);
    return {ok:r.ok, repaired:r.repaired, min:c0.min, max:c0.max, speed:c1.speed, target:E.st[0].target,
      toast: Array.from(document.querySelectorAll('#toasts .toastp')).map(x=>x.textContent).join(' | '),
      log: LOG.slice(at).filter(l=>/repair/.test(l.s)).map(l=>l.k+': '+l.s).join(' ~ ')};
  });
  ok('a whole-setup file with a quoted max and an unreadable min still loads', h10s.ok === true);
  ok('...the unreadable min is the default and the quoted max its number',
     h10s.min === 4000 && h10s.max === 4000, JSON.stringify([h10s.min, h10s.max]));
  ok('...a speed nobody can read is the starter limit, not "unlimited"', h10s.speed === 120, String(h10s.speed));
  ok('...so the bench engine, rebuilt on the new table, clamps a 16000 target', h10s.target === 4000, String(h10s.target));
  ok('...and the receipt counts the three repairs, toast and log',
     h10s.repaired === 3 && /3 channel fields/.test(h10s.toast) && /repaired/.test(h10s.toast) && /3 fields/.test(h10s.log),
     h10s.toast);

  /* ================================================================
     v1.45.0 — Mike: "Make Reset clear hardware configuration too."

     Reset already removed both keys. What it did not do was empty the
     in-memory MSTR — and maestro/servo-store.js flushes MSTR to its key on
     `pagehide`, which is exactly what location.reload() fires. So the
     channel table was written back AFTER the wipe and restored at boot,
     which is the "hardware config survives a Reset" Mike kept seeing.

     This drives the real button and lets the RELOAD ACTUALLY HAPPEN —
     `location.reload` cannot be redefined in Chromium, and a stub would
     have missed the point anyway: the pagehide the reload fires is the
     whole bug. So the assertions are taken on the far side of it, which is
     also where Mike was standing when he saw his config come back.
     Deliberately LAST in this suite: it empties the stores and reboots.
     ================================================================ */
  console.log('\n════ Reset wipes the hardware configuration too ════');
  const before = await ev(()=>{
    /* a configuration worth losing: a Maestro build, plus a channel table
       carrying a name nobody but its owner would have typed */
    PREFS.seenStartup = true;
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12');
    if(!MSTR.loaded) buildEnsureMaestro();
    MSTR.channels[0].name = 'MIKE-CALIBRATED';
    MSTR.channels[0].mode = 'Servo';
    servoStoreSave(); prefsSave();
    window.__preReset = true;                    // gone the moment we get a new document
    return {prefs: !!localStorage.getItem('r2sim.prefs.v1'),
            servo: !!localStorage.getItem('r2sim.servo.v1'),
            named: !!(servoStoreInfo() && JSON.parse(localStorage.getItem('r2sim.servo.v1'))
                      .channels.some(c=>c.name==='MIKE-CALIBRATED'))};
  });
  ok('there was a saved config and a calibrated channel table to lose',
     before.prefs && before.servo && before.named, JSON.stringify(before));
  const asked = await ev(()=>{
    wizOpen(wizSteps().length-1);                // Save / Load / Reset live here
    const btn = Array.from($('startupBody').querySelectorAll('button.b.danger'))
      .find(b=>b.textContent==='Reset');
    if(!btn) return null;
    btn.click();
    const dlg = document.querySelector('.dlgwrap');
    return {title: btn.title, text: dlg ? dlg.textContent : ''};
  });
  ok('the confirm says the servo channel table goes as well', !!asked
     && /servo channel table/.test(asked.text) && /measured endpoint/.test(asked.text));
  ok('…and so do the build answers from this setup', !!asked && /build answers/.test(asked.text));
  ok('the button title says it too', !!asked && /servo hardware config/.test(asked.title)
     && /channel table/.test(asked.title), asked && asked.title);
  /* confirming reloads the page, so this evaluate loses its context */
  await ev(()=>{ const d = document.querySelector('.dlgwrap'); if(d) d.querySelector('.dlgyes').click(); })
    .catch(()=>{});
  await page.waitForFunction(
    'window.__preReset===undefined && typeof CAD!=="undefined" && CAD.loaded', {timeout:60000});
  const gone = await ev(()=>({
    servoKey: !!localStorage.getItem('r2sim.servo.v1'),
    restorable: !!servoStoreInfo(),
    name: (MSTR.channels[0]||{}).name || '',
    /* the prefs key is written again on the way up (applyTheme saves) — what
       matters is that it comes back EMPTY of everything that was in it */
    theme: PREFS.theme, seen: !!PREFS.seenStartup, configured: buildConfigured(),
    dome: (PREFS.hw||{}).dome || ''
  }));
  ok('the servo store is gone, and stayed gone through the reload',
     gone.servoKey === false && gone.restorable === false, JSON.stringify(gone));
  ok('…so the calibrated channel table did not come back', gone.name !== 'MIKE-CALIBRATED',
     'ch0 name after reset: "'+gone.name+'"');
  ok('…and neither did the build answers', gone.configured === false && gone.dome !== 'mini24',
     'hw.dome: "'+gone.dome+'"');
  ok('it really did restart fresh — first-run defaults are back',
     gone.seen === false && gone.theme === 'light');

  ok('no page errors', errs.length === 0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
