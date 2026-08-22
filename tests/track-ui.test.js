/* practice track, music status, port picker, boards viz + channel picker,
   version tag, reset button, UI scale, stage theme */
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
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); });
  const ev = f => page.evaluate(f);

  console.log('\n════ practice circuit ════');
  await page.click('#btnTrack');
  ok('the stage button builds the circuit', await ev(()=>
    TRACK.on && TRACK.gates.length===TRACK_GATES && TRACK.pts.length===TRACK_SAMPLES && TRACK.root.visible));
  /* v1.45.0: the band is no longer a fixed 0.60–1.00 m. On the inside of a
     corner tighter than TRACK_OUTER the whole stack squeezes (trackSqueeze),
     and the stock lap's hairpin is R≈0.70 m — the old fixed 0.86 m offset
     put those posts INSIDE the racing line. What must hold is the ORDER of
     the rings: a barrier is always outside the droid's clamp at that
     sample, and never further out than its own nominal offset. */
  ok('it has barriers down both edges, always outside the droid\'s lane', await ev(()=>
    TRACK.barriers.length >= 100 &&
    /* nearest() snaps to the closest SAMPLE, so a tight corner reads a
       little short — assert the band, not the exact offset */
    TRACK.barriers.every(b=>{
      const n = trackNearest(b.x,b.z);
      return n.dist > trackLimitAt(n.p, n.side>=0?1:-1) && n.dist < TRACK_OUTER + 0.02;
    })));
  ok('switching it on moves the droid to the hangar deck', await ev(()=>ENV.id==='hangar'));
  ok('…and puts it on the grid, on the track', await ev(()=>trackNearest(R2.pos.x,R2.pos.z).dist < TRACK_HALF));
  /* the track and the lessons moved OUT of setup into the app (Mike,
     2026-07-27) — the stage button is the only switch now */
  ok('the stage button is the switch, and the setup no longer offers it', await ev(()=>{
    const onStage = $('btnTrack').classList.contains('act');
    wizOpen(wizSteps().findIndex(s=>s.key==='_scene'));
    const inWiz = Array.from($('startupBody').querySelectorAll('button.b')).some(x=>x.textContent==='Practice track');
    closeStartup();
    return onStage && !inWiz;
  }));
  ok('the lap HUD is up', await ev(()=>$('hudTrack').style.display!=='none'));
  // drive two laps by following the circuit's own centreline
  const lap = await ev(async ()=>{
    TRACK.laps=0; TRACK.times=[]; TRACK.prev=null; TRACK.t0=0; TRACK.next=0;
    for(let l=0;l<2;l++) for(let i=0;i<TRACK.pts.length;i++){
      const p = TRACK.pts[i];
      R2.pos.x=p.x; R2.pos.z=p.z; R2.root.position.set(p.x,0,p.z);
      trackTick(0.02);
    }
    return {laps:TRACK.laps, last:TRACK.last, best:PREFS.bestLap, times:TRACK.times.length};
  });
  ok('gates count in order and a lap closes', lap.laps===1 && lap.last!==null, JSON.stringify(lap));
  ok('every lap is kept, not just the best', lap.times===lap.laps);
  ok('best lap is persisted', lap.best>0 && await ev(()=>JSON.parse(localStorage.getItem('r2sim.prefs.v1')).bestLap>0));
  const wall = await ev(()=>{
    const pen0 = TRACK.penalty;
    R2.pos.x = 0; R2.pos.z = 0; R2.root.position.set(0,0,0);   // the middle is off-track
    trackTick(0.02);
    return {pen:TRACK.penalty-pen0, back:trackNearest(R2.pos.x,R2.pos.z).dist <= TRACK_HALF+0.17};
  });
  ok('a barrier pushes the droid back on and costs +2 s', wall.pen===2000 && wall.back, JSON.stringify(wall));
  ok('…and only charges once per excursion', await ev(()=>{
    const pen0 = TRACK.penalty;
    R2.pos.x = 0; R2.pos.z = 0; R2.root.position.set(0,0,0); trackTick(0.02);
    return TRACK.penalty === pen0;
  }));
  await ev(()=>setTrack(false));
  ok('switching off hides course and HUD', await ev(()=>!TRACK.root.visible && $('hudTrack').style.display==='none'));

  console.log('\n════ model warnings ════');
  /* entering Track with a non-droid model shows a toast once per activation */
  await ev(()=>{ modelSet('mouse',{frame:false}); TRACK.modelWarned=false; });
  await ev(()=>setTrack(true));
  ok('entering Track with mouse model shows the model warning toast', await ev(()=>{
    const toasts = $('toasts');
    return toasts && toasts.textContent.includes('practice circuit drives the R2');
  }));
  ok('calling setTrack(true) again while active does not repeat the toast', await ev(()=>{
    const toastCount = ($('toasts')?.querySelectorAll('.toastp').length || 0);
    setTrack(true);  // call again while already on
    return ($('toasts')?.querySelectorAll('.toastp').length || 0) === toastCount;
  }));
  await ev(()=>setTrack(false));
  await page.waitForTimeout(4000);  // wait for toasts to auto-dismiss (3.5s + 0.5s buffer)
  /* entering Track with droid model does not show a warning */
  await ev(()=>{
    const h = $('toasts'); if(h) h.remove();  // clear any lingering toasts
    modelSet('droid',{frame:false});
    TRACK.modelWarned=false;
  });
  await ev(()=>setTrack(true));
  ok('entering Track with droid model does not show the warning', await ev(()=>{
    const toasts = $('toasts');
    const hasWarning = toasts && toasts.textContent.includes('practice circuit drives the R2');
    setTrack(false);
    return !hasWarning;
  }));

  /* entering Learn with a non-droid model shows a toast once per activation */
  await ev(()=>{
    const h = $('toasts'); if(h) h.remove();  // clear toasts
  });
  await page.waitForTimeout(500);
  await ev(()=>{ modelSet('frik',{frame:false}); TUTOR.modelWarned=false; });
  await ev(()=>setTutor(true));
  ok('entering Learn with frik model shows the model warning toast', await ev(()=>{
    const toasts = $('toasts');
    return toasts && toasts.textContent.includes('lessons teach the R2\'s controls');
  }));
  ok('calling setTutor(true) again while active does not repeat the toast', await ev(()=>{
    const toastCount = ($('toasts')?.querySelectorAll('.toastp').length || 0);
    setTutor(true);  // call again while already on
    return ($('toasts')?.querySelectorAll('.toastp').length || 0) === toastCount;
  }));
  await ev(()=>setTutor(false));
  await page.waitForTimeout(4000);  // wait for toasts to auto-dismiss
  /* entering Learn with droid model does not show a warning */
  await ev(()=>{
    const h = $('toasts'); if(h) h.remove();  // clear any lingering toasts
    modelSet('droid',{frame:false});
    TUTOR.modelWarned=false;
  });
  await ev(()=>setTutor(true));
  ok('entering Learn with droid model does not show the warning', await ev(()=>{
    const toasts = $('toasts');
    const hasWarning = toasts && toasts.textContent.includes('lessons teach the R2\'s controls');
    setTutor(false);
    return !hasWarning;
  }));

  console.log('\n════ music has a visible status line ════');
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  await ev(async ()=>{
    const sr=22050, ctx=new OfflineAudioContext(1, sr*8, sr);
    for(let t=0.25;t<8;t+=0.5){ const o=ctx.createOscillator(),g=ctx.createGain();
      o.frequency.value=900; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.05); o.start(t); o.stop(t+0.06); }
    musicSetBuffer(await ctx.startRendering(),'status-check.wav');
    setStripMode('seq'); buildSequencer();
  });
  ok('loading a track reports BPM and beats in the bar', await ev(()=>
    $('musstat') && /BPM/.test($('musstat').textContent)));
  ok('Build with NO settings loaded auto-generates a starter instead of failing', await ev(()=>{
    const r = musicBuildSequence('pies','chase',1,8);
    return !r.error && MSTR.loaded && r.seq.frames.length>0;
  }));
  ok('and the status line says a routine was built', await ev(()=>/built/.test($('musstat').textContent)));
  ok('a decode failure would surface in red', await ev(()=>{
    musicStatus('could not decode x.m4a — test', true);
    return $('musstat').classList.contains('err');
  }));

  console.log('\n════ port picker on the selection card ════');
  const doorName = await ev(()=>CAD.moving.find(m=>m.base==='FLBreadpanDoor').name);
  await page.evaluate(n=>{ makeStarter('body','mini18'); rebuildMaestroUI(); selectPart(n); }, doorName);
  ok('a Maestro profile shows a channel dropdown', await ev(()=>
    $('selcard').querySelectorAll('select').length>=1));
  const moved = await ev(()=>{
    const sel = $('selcard').querySelector('.selrow select');
    const before = MSTR.channels.findIndex(c=>c.act==='doorL');
    sel.value = '9'; sel.dispatchEvent(new Event('change'));
    return {before, now: MSTR.channels.findIndex(c=>c.act==='doorL')};
  });
  ok('picking a port moves the mapping to that channel', moved.now===9 && moved.before!==9, JSON.stringify(moved));
  ok('the old channel is released — one channel per part', await ev(()=>
    MSTR.channels.filter(c=>c.act==='doorL').length===1));
  /* v1.46.0 — mod2026 owns a FIXED pin map, and it only has one when the
     expanders hang off the droid's own I2C pins. That arrangement stopped
     being the shipped default this release (Mike put two expanders behind a
     co-processor there), so the fixture has to ask for it rather than inherit
     it — otherwise this asserts the sketch's map against a build the sketch
     cannot drive, and reads as a regression in the readout. */
  await ev(()=>{ buildSet('servoTopo','p0'); buildSet('domeServo','mod2026'); loadProfile('mod2026'); });
  await page.waitForTimeout(400);
  await page.evaluate(n=>selectPart(n), doorName);
  ok('mod2026 shows its fixed port instead', await ev(()=>{
    const p = $('selcard').querySelector('.selport');
    return p && /0x40/.test(p.textContent) && /ch 0/.test(p.textContent);
  }));
  await ev(()=>deselectPart());

  console.log('\n════ channel ↔ part mapping, with no board cards (v1.45.0) ════');
  /* THE BOARD CARDS ARE GONE. Mike, v1.45.0: "Remove the non-functional
     Wiring 'Boards' section." It drew a card per board on the wizard's wiring
     step with a labelled photo, a clickable strip over every channel and a row
     of pin buttons — and on a mod2026 or PCA9685 build, which is the DEFAULT
     build, there was no photo, no pin map, no picker on a pin click, and its
     error messages went to $('cadMsg'), which does not exist while the setup
     overlay is up. js/app/boards.js carries the full note. chPicker() went
     with it: nothing else opened that popover.

     THE MAPPING RULES STAY, AND SO DOES THEIR COVERAGE. hwPins(), chAssign(),
     chFindUse(), chRelease() and chPartOptions() are what the Panels step's
     dropdowns, app/panels.js, the wiring sheet and the Bench's `drives` column
     read. The assertions below are the same ones this suite has always made
     about them — one channel per part, planned edits into PREFS.hwMap, live
     edits straight into MSTR — driven through the functions instead of through
     pin strips that no longer exist. */
  await ev(()=>{ wizOpen(wizSteps().findIndex(s=>s.key==='_wiring')); });
  ok('the wiring step draws the diagram and nothing else claims to draw a board', await ev(()=>
    $('startupBody').querySelectorAll('.boardcard, .pinstrip, .pinbtn').length===0 &&
    $('startupBody').querySelectorAll('.wdwrap svg').length===1 &&
    typeof buildBoardsSect==='undefined' && typeof chPicker==='undefined'));
  ok('hwPins still reports a board at each end, and knows which one is live', await ev(()=>{
    /* v1.46.0 — the two 16-channel PCA9685s at 0x40/0x41 are what mod2026
       drives directly; the shipped default is now a 32-channel co-processor,
       so this names the build it is describing. */
    buildSet('servoTopo','p0'); buildSet('domeServo','mod2026');
    const d = hwPins('dome'), b = hwPins('body');
    return d.pins.length===16 && b.pins.length===16 &&
           /PCA9685 0x41/.test(d.title) && /PCA9685 0x40/.test(b.title) && b.live===true;
  }));
  ok('the electronics choice is a build question in the setup', await ev(()=>{
    /* one step for both ends since v1.34.0; image-led since v1.45.0 — the
       family is picture cards, and only that family's own questions follow
       (config/wizard.js, wizServosStep) */
    wizGo(wizStepIndex('servos'));
    const host = $('startupBody');
    const fams = host.querySelectorAll('.famgrid .optcard').length;
    const shape = host.querySelectorAll('.flowcard, .optcard[data-opt^="servoBoards"]').length;
    wizGo(wizSteps().findIndex(s=>s.key==='_wiring'));
    return fams===servoDeviceOptions().length && fams>=3 && shape>=2;
  }));
  ok('the choice persists', await ev(()=>{
    hwGet().dome='mini12'; prefsSave();
    const saved = JSON.parse(localStorage.getItem('r2sim.prefs.v1')).hw.dome==='mini12';
    hwGet().dome='mini24'; prefsSave();
    return saved;
  }));

  console.log('\n════ the board photos, and the one-channel-per-part rule ════');
  /* the four Pololu photos are still the real thing — they are what a Maestro
     card shows on the servo step now (config/board-art.js, boardArtPololu) */
  ok('all four Maestro photos are embedded (Pololu labelled views)', await ev(()=>
    ['micro6','mini12','mini18','mini24'].every(k=>/^data:image\/jpeg;base64,/.test(BOARD_IMG[k]))));
  ok('...and a Maestro card shows one rather than a drawing', await ev(()=>
    /^<img class="optphoto"/.test(boardArtHtml('domeServo','mini24','Mini Maestro 24'))));

  // the dome mini24 is a PLANNED board here (the profile is mod2026), so its
  // edits belong in PREFS.hwMap rather than in MSTR
  const srcCh = await ev(()=>{ const ps=hwPins('dome').pins; return ps.findIndex(p=>p.act); });
  const srcAct = await page.evaluate(i=>hwPins('dome').pins[i].act, srcCh);
  ok('a planned board starts from the starter layout, so something is mapped',
     srcCh >= 0 && !!srcAct, 'ch '+srcCh+' → '+srcAct);
  ok('clearing a channel saves the edit in prefs', await page.evaluate(i=>{
    chAssign('dome', i, '');
    return hwPins('dome').pins[i].act===''
        && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).hwMap.dome[i]==='';
  }, srcCh));
  const freeCh = await page.evaluate(i=>{ const ps=hwPins('dome').pins; return ps.findIndex((p,k)=>k!==i && !p.act); }, srcCh);
  ok('assigning a free part clashes with nothing and sticks', await page.evaluate(([b,act])=>{
    const use = chFindUse(act, 'dome', b);
    chAssign('dome', b, act);
    return !use && hwPins('dome').pins[b].act===act;
  }, [freeCh, srcAct]));
  const thirdCh = await page.evaluate(([a,b])=>{ const ps=hwPins('dome').pins; return ps.findIndex((p,k)=>k!==a&&k!==b); }, [srcCh,freeCh]);
  ok('moving a part that is already wired reports the clash and releases the old channel', await page.evaluate(([c,b,act])=>{
    /* what the picker's confirm used to sit in front of: find the use, tell
       the user, release it, then assign */
    const use = chFindUse(act, 'dome', c);
    const found = !!use && use.ch===b && !use.fixed;
    chRelease(use);
    chAssign('dome', c, act);
    const ps = hwPins('dome').pins;
    return found && ps[c].act===act && ps[b].act==='' &&
           ps.filter(p=>p.act===act).length===1;
  }, [thirdCh, freeCh, srcAct]));
  ok('a mod2026 channel is reported as fixed — the sketch owns that map', await ev(()=>{
    buildSet('servoTopo','p0'); buildSet('domeServo','mod2026');   // v1.46.0: not the default any more
    const p = hwPins('body').pins.find(x=>x.act);
    const use = chFindUse(p.act, 'dome', 0);
    return !!use && use.loc==='body' && use.fixed===true && chAssign('body', p.pin, '')===false;
  }));

  // live board: a matching .mstr means the edit goes straight into MSTR
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  await ev(()=>{ hwGet().body='mini18'; prefsSave(); makeStarter('body','mini18'); rebuildMaestroUI(); });
  ok('a matching .mstr makes the body board the live one', await ev(()=>
    hwPins('body').live===true && MSTR.board==='mini18' && MSTR.channels.length===18));
  const liveMv = await ev(()=>{
    const pins = hwPins('body').pins;
    const a = pins.findIndex(p=>p.act);
    let b = pins.findIndex((p,k)=>k!==a && !p.act); if(b<0) b=(a+1)%pins.length;
    const act = pins[a].act;
    chAssign('body', b, act);
    return {act, a, b, now:MSTR.channels.findIndex(c=>c.act===act), count:MSTR.channels.filter(c=>c.act===act).length};
  });
  ok('a live-board edit writes straight into the Maestro channels', liveMv.now===liveMv.b && liveMv.count===1, JSON.stringify(liveMv));
  await ev(()=>{ closeStartup(); PREFS.hwMap={}; prefsSave(); loadProfile('mod2026'); });
  await page.waitForTimeout(400);

  console.log('\n════ version tag + reset button ════');
  ok('the version is published top-left', await ev(()=>
    $('verTag').textContent==='v'+APP_VERSION && /^\d+\.\d+\.\d+$/.test(APP_VERSION)));
  ok('Reset sits next to Save/Load and asks first — cancel keeps everything', await (async()=>{
    const r = await ev(async ()=>{
      wizOpen(wizSteps().length-1);           // Save / Load / Reset sit on the review step
      const btn = $('startupBody').querySelector('button.b.danger');
      if(!btn || btn.textContent!=='Reset') return {found:false};
      window.__stillHere = true;
      btn.click();
      const dlg = document.querySelector('.dlgwrap');
      const asked = !!dlg && /Are you sure/.test(dlg.textContent) && !!dlg.querySelector('.dlgcard.danger');
      if(dlg) dlg.querySelector('.dlgno').click();          // cancel
      await new Promise(r2=>setTimeout(r2,0));
      closeStartup();
      return {found:true, asked, gone: !document.querySelector('.dlgwrap'),
              kept: !!localStorage.getItem('r2sim.prefs.v1')};
    });
    return r.found && r.asked && r.gone && r.kept
      && await ev(()=>window.__stillHere===true);
  })());

  console.log('\n════ UI scale + stage theme ════');
  await ev(()=>applyUiScale(1.2));
  ok('A+ scales the whole frame and persists', await ev(()=>
    document.body.style.zoom==='1.2' && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).uiScale===1.2));
  await ev(()=>applyUiScale(1.0));
  /* v1.45.0 — the frame now boots LIGHT (look/prefs.js, Mike: "Default to
     light mode"), so the two-tone assertion below has to say which frame
     theme it is testing against instead of assuming the boot default. Dark
     frame + light stage is still the pair worth checking: it is the case the
     BG picker exists for. */
  await ev(()=>applyTheme('dark'));
  await ev(()=>{ PREFS.stageTheme='light'; applyStageTheme(); });
  /* an environment overrides fog/ground/lights by design, so these check
     the STUDIO, which is the look the theme owns */
  await ev(()=>{ envSet('studio'); PREFS.stageTheme='light'; applyStageTheme(); });
  ok('the stage can hold light while the frame stays dark', await ev(()=>
    scene.fog.color.getHex()===THEME_3D.light.fog && !document.body.classList.contains('light')));
  await ev(()=>{ PREFS.stageTheme='follow'; applyStageTheme(); });
  ok('and follows the frame again', await ev(()=>scene.fog.color.getHex()===THEME_3D.dark.fog));
  ok('...and the same the other way, with the light frame it now boots into', await ev(()=>{
    applyTheme('light');
    const followed = scene.fog.color.getHex()===THEME_3D.light.fog
                  && document.body.classList.contains('light');
    PREFS.stageTheme='dark'; applyStageTheme();
    const held = scene.fog.color.getHex()===THEME_3D.dark.fog
              && document.body.classList.contains('light');
    PREFS.stageTheme='follow'; applyStageTheme(); applyTheme('dark');
    return followed && held;
  }));

  console.log('\n════ track builder ════');
  /* PREFS.track data path (app/track.js) — absent or invalid falls back to
     the stock circuit, one field at a time */
  const fallbackAbsent = await ev(()=>{
    trackLibReset(); delete PREFS.track; delete PREFS.tracks; prefsSave();
    trackDispose(); trackBuild();
    const same = TRACK.shape.length===TRACK_SHAPE.length &&
      TRACK.shape.every((p,i)=>p[0]===TRACK_SHAPE[i][0] && p[1]===TRACK_SHAPE[i][1]);
    return {same, gatesOk:TRACK.gates.length===TRACK_GATES, conesLen:TRACK.cones.length};
  });
  ok('with no PREFS.track at all, the stock circuit builds', fallbackAbsent.same &&
     fallbackAbsent.gatesOk && fallbackAbsent.conesLen===0, JSON.stringify(fallbackAbsent));
  const fallbackInvalid = await ev(()=>{
    // a corrupt gates array (out of 0..1) must not also throw away a good shape
    delete PREFS.tracks;      // no library — the v1.44.1 single-layout path
    PREFS.track = {shape:[[1,1],[2,2],[3,3]], gates:['nope'], cones:[[99,99]]};
    prefsSave();
    trackDispose(); trackBuild();
    const shapeIsStock = TRACK.shape.length===TRACK_SHAPE.length &&
      TRACK.shape.every((p,i)=>p[0]===TRACK_SHAPE[i][0] && p[1]===TRACK_SHAPE[i][1]);
    return {shapeIsStock, gatesOk:TRACK.gates.length===TRACK_GATES, conesLen:TRACK.cones.length};
  });
  ok('an invalid shape (<4 points), gates and cones each fall back independently',
     fallbackInvalid.shapeIsStock && fallbackInvalid.gatesOk && fallbackInvalid.conesLen===0,
     JSON.stringify(fallbackInvalid));

  /* the editor opens a JS-built full-page overlay and is covered by
     uiModalOpen() (core/util.js) so pad keys stay gated while it is up */
  const openClose = await ev(()=>{
    trackLibReset(); trackDispose();   /* v1.45.0: trackLibReset() clears the layout library and its PREFS.track mirror */
    const before = !!document.getElementById('trackEdit');
    const modalBefore = uiModalOpen();
    trackEditOpen();
    const afterOpen = !!document.getElementById('trackEdit');
    const canvasThere = !!document.getElementById('teCanvas');
    const modalDuring = uiModalOpen();
    trackEditCancel();
    const afterClose = !!document.getElementById('trackEdit');
    const modalAfter = uiModalOpen();
    return {before, modalBefore, afterOpen, canvasThere, modalDuring, afterClose, modalAfter};
  });
  ok('trackEditOpen() builds a full-page overlay; trackEditCancel() removes it, discarding the edit',
     !openClose.before && !openClose.modalBefore && openClose.afterOpen && openClose.canvasThere &&
     openClose.modalDuring && !openClose.afterClose && !openClose.modalAfter, JSON.stringify(openClose));
  ok('the EDIT door sits right beside the stage TRACK button', await ev(()=>{
    const b = $('btnTrackEdit');
    return !!b && b.previousElementSibling === $('btnTrack') && b.closest('#stageTools') === $('stageTools');
  }));

  /* round trip: trackEditSave() — the exact function SAVE calls — writes
     PREFS.track, then trackBuild() consumes it: the curve and the gates
     move to match */
  const roundTrip = await ev(()=>{
    trackLibReset();   /* v1.45.0: clears the layout library and its PREFS.track mirror */
    trackEditOpen();
    TE.shape = [[0,6],[6,0],[0,-6],[-6,0]];
    TE.gates = [0, 0.25, 0.5, 0.75];
    TE.cones = [[3,3]];
    trackEditSave();                 // TRACK.built was false, so nothing to rebuild yet
    setTrack(true);                  // forces a fresh build off the saved PREFS.track
    const p0 = TRACK.pts[0];
    const savedShape = JSON.parse(localStorage.getItem('r2sim.prefs.v1')).track.shape;
    const r = {gatesLen:TRACK.gates.length, conesLen:TRACK.cones.length,
      p0Close:(Math.abs(p0.x-0)<0.4 && Math.abs(p0.z-6)<0.4), savedShapeLen:savedShape.length};
    setTrack(false);
    return r;
  });
  ok('SAVE (the same API the editor calls) writes PREFS.track; trackBuild() consumes it — curve and gates move',
     roundTrip.gatesLen===4 && roundTrip.conesLen===1 && roundTrip.p0Close && roundTrip.savedShapeLen===4,
     JSON.stringify(roundTrip));

  /* a real drag: pointer capture on the canvas, pointermove redraws in
     place, one commit — no different from a person doing it, synthetic
     PointerEvents dispatched straight on the canvas (same pattern as
     blocks-ui.js's brick drag, sequencer-ui.test.js) */
  const drag = await ev(()=>{
    trackLibReset();   /* v1.45.0: clears the layout library and its PREFS.track mirror */
    trackEditOpen();
    const idx = 0;
    const before = TE.shape[idx].slice();
    const [px,py] = teWorldToPx(before[0], before[1]);
    const r = TE.canvas.getBoundingClientRect();
    const toClient = (x,y)=>[r.left + x*(r.width/TE.size), r.top + y*(r.height/TE.size)];
    const [cx,cy] = toClient(px,py);
    const [dx,dy] = toClient(px+60, py+30);
    const fire = (type,x,y)=>TE.canvas.dispatchEvent(new PointerEvent(type,
      {bubbles:true, clientX:x, clientY:y, pointerId:5, button:0}));
    fire('pointerdown', cx, cy);
    fire('pointermove', dx, dy);
    const midDrag = TE.shape[idx].slice();       // redrawn IN PLACE, live, before pointerup
    fire('pointerup', dx, dy);
    const moved = TE.shape[idx].slice();
    trackEditSave();
    const saved = PREFS.track.shape[idx].slice();
    return {before, midDrag, moved, saved};
  });
  ok('dragging a control point moves it live (pointer capture, redraw in place)',
     (drag.midDrag[0]!==drag.before[0] || drag.midDrag[1]!==drag.before[1]) &&
     drag.moved[0]===drag.midDrag[0] && drag.moved[1]===drag.midDrag[1], JSON.stringify(drag));
  ok('SAVE persists the dragged point into PREFS.track',
     Math.abs(drag.saved[0]-drag.moved[0])<1e-6 && Math.abs(drag.saved[1]-drag.moved[1])<1e-6, JSON.stringify(drag));

  /* the 2.4 m rule (TRACK_MIN_SPACING) — WARNS, never blocks */
  const pinch = await ev(()=>{
    trackLibReset();   /* v1.45.0: clears the layout library and its PREFS.track mirror */
    trackEditOpen();
    // a deliberate pinch: the leg back at z=2 runs 1 m under the outbound
    // leg at z=3, well inside TRACK_MIN_SPACING (2.4 m)
    TE.shape = [[-5,3],[5,3],[5,-3],[5,2],[-5,2],[-5,-3]];
    teRedraw();
    const violating = TE.warnEl.classList.contains('on');
    const msg = TE.warnEl.textContent;
    trackEditSave();                 // must NOT be blocked by the warning
    const savedOk = !!PREFS.track && PREFS.track.shape.length===6;
    return {violating, msg, savedOk};
  });
  ok('a pinched shape is highlighted with a one-line reason, and the save is never blocked',
     pinch.violating && /2\.4 m/.test(pinch.msg) && /allowed/.test(pinch.msg) && pinch.savedOk,
     JSON.stringify(pinch));

  /* toolbar modes: Gates and Cones place on click, remove on a second
     click at the same spot */
  const gateMode = await ev(()=>{
    trackLibReset();   /* v1.45.0: clears the layout library and its PREFS.track mirror */
    trackEditOpen();
    teSetMode('gates');
    const before = TE.gates.length;
    const pts = trackSample(TE.shape);
    const p = pts[Math.round(0.42*pts.length)];        // well clear of any default gate
    const [px,py] = teWorldToPx(p.x, p.z);
    const r = TE.canvas.getBoundingClientRect();
    const cx = r.left + px*(r.width/TE.size), cy = r.top + py*(r.height/TE.size);
    const fire = ()=>TE.canvas.dispatchEvent(new PointerEvent('pointerdown',
      {bubbles:true, clientX:cx, clientY:cy, pointerId:9, button:0}));
    fire();
    const afterAdd = TE.gates.length;
    fire();                          // the same spot, second click — removes it
    const afterRemove = TE.gates.length;
    trackEditCancel();
    return {before, afterAdd, afterRemove};
  });
  ok('Gates mode: a click on the curve adds a gate, the same click again removes it',
     gateMode.afterAdd===gateMode.before+1 && gateMode.afterRemove===gateMode.before, JSON.stringify(gateMode));
  const coneMode = await ev(()=>{
    trackLibReset();   /* v1.45.0: clears the layout library and its PREFS.track mirror */
    trackEditOpen();
    teSetMode('cones');
    const before = TE.cones.length;
    const [px,py] = teWorldToPx(2, 2);
    const r = TE.canvas.getBoundingClientRect();
    const cx = r.left + px*(r.width/TE.size), cy = r.top + py*(r.height/TE.size);
    const fire = ()=>TE.canvas.dispatchEvent(new PointerEvent('pointerdown',
      {bubbles:true, clientX:cx, clientY:cy, pointerId:11, button:0}));
    fire();
    const afterAdd = TE.cones.length;
    fire();
    const afterRemove = TE.cones.length;
    trackEditCancel();
    return {before, afterAdd, afterRemove};
  });
  ok('Cones mode: a click places a cone, the same click again removes it',
     coneMode.afterAdd===coneMode.before+1 && coneMode.afterRemove===coneMode.before, JSON.stringify(coneMode));

  /* right-click: add a point on the curve, remove one under the cursor,
     never below the floor of 4 */
  const rightClick = await ev(()=>{
    trackLibReset();   /* v1.45.0: clears the layout library and its PREFS.track mirror */
    trackEditOpen();
    const before = TE.shape.length;
    const r = TE.canvas.getBoundingClientRect();
    const toClient = (x,y)=>[r.left + x*(r.width/TE.size), r.top + y*(r.height/TE.size)];
    const rc = (cx,cy)=>TE.canvas.dispatchEvent(new MouseEvent('contextmenu',
      {bubbles:true, clientX:cx, clientY:cy, cancelable:true}));
    const a = TE.shape[0], b = TE.shape[1];
    const [mx,my] = teWorldToPx((a[0]+b[0])/2, (a[1]+b[1])/2);
    rc(...toClient(mx,my));                              // empty curve — inserts
    const afterInsert = TE.shape.length;
    const [nx,ny] = teWorldToPx(TE.shape[1][0], TE.shape[1][1]);
    rc(...toClient(nx,ny));                               // on the new point — removes it
    const afterRemove = TE.shape.length;
    while(TE.shape.length > 4) TE.shape.pop();
    const atFloor = TE.shape.length;
    const [fx,fy] = teWorldToPx(TE.shape[0][0], TE.shape[0][1]);
    rc(...toClient(fx,fy));                                // at the floor — refused
    const afterFloorAttempt = TE.shape.length;
    trackEditCancel();
    return {before, afterInsert, afterRemove, atFloor, afterFloorAttempt};
  });
  ok('right-click adds a point on the curve; right-click on a point removes it, down to a floor of 4',
     rightClick.afterInsert===rightClick.before+1 && rightClick.afterRemove===rightClick.before &&
     rightClick.atFloor===4 && rightClick.afterFloorAttempt===4, JSON.stringify(rightClick));

  /* RESET TO DEFAULT restores the stock lap; SAVE persists it */
  const resetDefault = await ev(()=>{
    trackLibReset();   /* v1.45.0: clears the layout library and its PREFS.track mirror */
    trackEditOpen();
    TE.shape = [[0,6],[6,0],[0,-6],[-6,0]];
    TE.gates = [0,0.5];
    TE.cones = [[1,1]];
    teResetDefault();
    const isStockShape = TE.shape.length===TRACK_SHAPE.length &&
      TE.shape.every((p,i)=>p[0]===TRACK_SHAPE[i][0] && p[1]===TRACK_SHAPE[i][1]);
    const isStockGates = TE.gates.length===TRACK_GATES && TE.cones.length===0;
    trackEditSave();
    setTrack(true);
    const stockLap = trackNearest(TRACK_SHAPE[0][0], TRACK_SHAPE[0][1]).dist < 0.05
      && TRACK.gates.length===TRACK_GATES;
    setTrack(false);
    return {isStockShape, isStockGates, stockLap};
  });
  ok('RESET TO DEFAULT restores the stock lap, and SAVE persists it',
     resetDefault.isStockShape && resetDefault.isStockGates && resetDefault.stockLap, JSON.stringify(resetDefault));

  console.log('\n════ small tracks: furniture that fits (v1.45.0) ════');
  /* the constants live on the page, so pull the handful this side compares
     against over once rather than repeating them here and letting them rot */
  const K = await ev(()=>({OUTER:TRACK_OUTER, HALF:TRACK_HALF, STOCK:TRACK_STOCK_ID, GATES:TRACK_GATES}));
  /* Mike's screenshot: a tight hand-drawn lap where the kerbs and the rails
     piled into each other and into the racing line. The geometry rules are
     written down in app/track.js beside the constants; these are the probes
     for them. The helpers go on the page once — every check below needs the
     same "do two pieces on one ring touch" answer. */
  await ev(()=>{
    window.__ends = pc=>{
      const dx = Math.sin(pc.ang)*pc.len/2, dz = Math.cos(pc.ang)*pc.len/2;
      return [{x:pc.x-dx, z:pc.z-dz}, {x:pc.x+dx, z:pc.z+dz}];
    };
    window.__minGap = list=>{
      const pd = (p,q,r)=>{
        const vx=r.x-q.x, vz=r.z-q.z, L=vx*vx+vz*vz||1e-12;
        let t=((p.x-q.x)*vx+(p.z-q.z)*vz)/L; t=Math.max(0,Math.min(1,t));
        return Math.hypot(p.x-(q.x+vx*t), p.z-(q.z+vz*t));
      };
      const cross = (p1,p2,p3,p4)=>{
        const dn=(p2.x-p1.x)*(p4.z-p3.z)-(p2.z-p1.z)*(p4.x-p3.x);
        if(Math.abs(dn)<1e-12) return false;
        const t=((p3.x-p1.x)*(p4.z-p3.z)-(p3.z-p1.z)*(p4.x-p3.x))/dn;
        const u=((p3.x-p1.x)*(p2.z-p1.z)-(p3.z-p1.z)*(p2.x-p1.x))/dn;
        return t>=0&&t<=1&&u>=0&&u<=1;
      };
      let m = Infinity;
      for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++){
        const A = window.__ends(list[i]), B = window.__ends(list[j]);
        const d = cross(A[0],A[1],B[0],B[1]) ? 0
          : Math.min(pd(A[0],B[0],B[1]), pd(A[1],B[0],B[1]), pd(B[0],A[0],A[1]), pd(B[1],A[0],A[1]));
        if(d < m) m = d;
      }
      return m;
    };
    /* one report for any layout: does anything overlap, invert or fold, and
       is the lane still driveable along its own centreline */
    window.__probe = (shape, gates)=>{
      trackLibReset();
      PREFS.tracks = {v:1, active:'p', list:[{id:'p', name:'probe', shape, gates:gates||[0,0.5], cones:[]}]};
      prefsSave();
      trackDispose(); setTrack(true);
      const P = TRACK.pts;
      let minLane = Infinity, fold = 0, minR = Infinity;
      P.forEach(p=>{
        [1,-1].forEach(s=>{ if(1 - s*p.k*trackHalfAt(p,s) <= 0) fold++; });
        const lane = trackHalfAt(p,1) + trackHalfAt(p,-1);
        if(lane < minLane) minLane = lane;
        if(Math.abs(p.k) > 1e-6 && 1/Math.abs(p.k) < minR) minR = 1/Math.abs(p.k);
      });
      const inLane = TRACK.barriers.filter(b=>{
        const n = trackNearest(b.x,b.z);
        return n.dist <= trackLimitAt(n.p, n.side>=0?1:-1);
      }).length;
      /* drive the centreline: the clamp must never touch the droid, and the
         gates must still count round */
      TRACK.laps=0; TRACK.times=[]; TRACK.prev=null; TRACK.t0=0; TRACK.next=0;
      TRACK.penalty=0; TRACK.nearI=null;
      let shoved = 0;
      for(let l=0;l<2;l++) for(let i=0;i<P.length;i++){
        const p = P[i];
        R2.pos.x=p.x; R2.pos.z=p.z; R2.root.position.set(p.x,0,p.z);
        trackTick(0.02);
        if(Math.abs(R2.pos.x-p.x)>1e-9 || Math.abs(R2.pos.z-p.z)>1e-9) shoved++;
      }
      /* the independent check on the barriers: put the droid at the far
         EDGE of its lane — exactly on the clamp, the furthest out it can
         legally be — at every sample on both sides, and measure how close
         that ever comes to a rail. Pure geometry, no ticking, so there is
         nothing here to go flaky on a hairline. */
      const pd = (p,q,r2)=>{
        const vx=r2.x-q.x, vz=r2.z-q.z, L=vx*vx+vz*vz||1e-12;
        let t=((p.x-q.x)*vx+(p.z-q.z)*vz)/L; t=Math.max(0,Math.min(1,t));
        return Math.hypot(p.x-(q.x+vx*t), p.z-(q.z+vz*t));
      };
      const ends = TRACK.barriers.map(b=>window.__ends(b));
      let clear = Infinity;
      P.forEach(p=>{
        [1,-1].forEach(s=>{
          const o = trackLimitAt(p, s);
          const w = {x:p.x + p.nx*s*o, z:p.z + p.nz*s*o};
          ends.forEach(E=>{ const d = pd(w, E[0], E[1]); if(d < clear) clear = d; });
        });
      });
      const r = {lap:P.lap, minR, rails:TRACK.barriers.length, kerbs:TRACK.kerbs.length,
        railGap:window.__minGap(TRACK.barriers), kerbGap:window.__minGap(TRACK.kerbs),
        inLane, fold, minLane, shoved, clear, penalty:TRACK.penalty, laps:TRACK.laps};
      setTrack(false);
      return r;
    };
  });
  const tiny = await ev(()=>window.__probe([[0,0.5],[0.5,0],[0,-0.5],[-0.5,0]]));
  ok('a 3 m lap really is tiny and really is tighter than the barrier ring',
     tiny.lap < 3.2 && tiny.minR < K.OUTER, JSON.stringify(tiny));
  ok('…it still gets kerbs and barriers, and no two on one edge interpenetrate',
     tiny.rails > 0 && tiny.kerbs > 0 && tiny.railGap > 0 && tiny.kerbGap > 0, JSON.stringify(tiny));
  ok('…no barrier ends up inside the droid\'s lane (the ring cannot invert)',
     tiny.inLane === 0, JSON.stringify(tiny));
  ok('…the road ribbon does not fold over, and the lane stays driveable',
     tiny.fold === 0 && tiny.minLane > 0.4, JSON.stringify(tiny));
  ok('…and a lap still closes, with the droid never shoved off its own centreline',
     tiny.shoved === 0 && tiny.penalty === 0 && tiny.laps === 1, JSON.stringify(tiny));
  ok('…and the droid at the far edge of that lane still clears every rail',
     tiny.clear > 0, JSON.stringify(tiny));

  /* a full-size lap with savage control-point corners AND two passes 1 m
     apart — the same geometry rules, plus the lane-memory fix (the hint
     trackNearest() now takes) that stops the clamp flipping the droid from
     one pass to the other */
  const pinchy = await ev(()=>window.__probe([[-5,3],[5,3],[5,-3],[5,2],[-5,2],[-5,-3]]));
  ok('a big lap with savage corners: nothing interpenetrates, nothing inverts, nothing folds',
     pinchy.railGap > 0 && pinchy.kerbGap > 0 && pinchy.inLane === 0 && pinchy.fold === 0,
     JSON.stringify(pinchy));
  ok('…and two passes 1 m apart no longer teleport the droid across the track',
     pinchy.shoved === 0 && pinchy.penalty === 0 && pinchy.clear > 0, JSON.stringify(pinchy));

  const stockFit = await ev(()=>{
    trackLibReset(); trackDispose(); setTrack(true);
    const r = {rails:TRACK.barriers.length, kerbs:TRACK.kerbs.length,
      railGap:window.__minGap(TRACK.barriers), kerbGap:window.__minGap(TRACK.kerbs),
      inLane:TRACK.barriers.filter(b=>{
        const n = trackNearest(b.x,b.z);
        return n.dist <= trackLimitAt(n.p, n.side>=0?1:-1);
      }).length};
    setTrack(false);
    return r;
  });
  ok('the stock lap keeps its furniture count and stops overlapping at the hairpin',
     stockFit.rails >= 100 && stockFit.kerbs >= 200 && stockFit.railGap > 0 &&
     stockFit.kerbGap > 0 && stockFit.inLane === 0, JSON.stringify(stockFit));

  /* the pinch warning used to switch itself off below a 7.2 m lap: arc can
     never exceed total/2, so every pair read as "the same stretch" */
  const tinyWarn = await ev(()=>{
    trackLibReset();
    trackEditOpen();
    TE.shape = [[0,0.5],[0.5,0],[0,-0.5],[-0.5,0]];
    teRedraw();
    const v = trackSpacingViolations(TE.shape);
    const r = {on:TE.warnEl.classList.contains('on'), msg:TE.warnEl.textContent,
               bad:v.bad.size, tight:v.tight.size, lap:v.pts.lap};
    trackEditCancel();
    return r;
  });
  ok('the pinch warning tells the truth on a 3 m lap instead of silently passing it',
     tinyWarn.lap < 3.2 && tinyWarn.bad > 0 && tinyWarn.on && /2\.4 m/.test(tinyWarn.msg),
     JSON.stringify(tinyWarn));
  /* the stock lap is exactly this case: a hairpin at R≈0.70 m, nothing else
     within 2.4 m of anything */
  ok('a tight corner on an otherwise roomy lap says the furniture squeezes', await ev(()=>{
    trackLibReset();
    trackEditOpen();
    teRedraw();
    const v = trackSpacingViolations(TE.shape);
    const r = v.bad.size === 0 && v.tight.size > 0 &&
      TE.warnEl.classList.contains('on') && /squeeze/.test(TE.warnEl.textContent);
    trackEditCancel();
    return r;
  }));

  /* gate order: array order was crossing order, so a gate added on the start
     straight became the last gate of the lap */
  const gateOrder = await ev(()=>{
    trackLibReset();
    trackEditOpen();
    TE.shape = [[0,6],[6,0],[0,-6],[-6,0]];
    TE.gates = [0.6, 0.1, 0.9, 0.35];        // clicked in any old order
    trackEditSave();
    setTrack(true);
    const built = TRACK.gateT.slice();
    const r = {built, saved:PREFS.track.gates.slice(),
      sorted: built.every((t,i)=>i===0 || t >= built[i-1]),
      laps: (()=>{
        TRACK.laps=0; TRACK.times=[]; TRACK.prev=null; TRACK.t0=0; TRACK.next=0;
        for(let l=0;l<2;l++) for(let i=0;i<TRACK.pts.length;i++){
          const p = TRACK.pts[i];
          R2.pos.x=p.x; R2.pos.z=p.z; R2.root.position.set(p.x,0,p.z);
          trackTick(0.02);
        }
        return TRACK.laps;
      })()};
    setTrack(false);
    return r;
  });
  ok('gates are sorted into track order on save, so driving the lap takes them in sequence',
     gateOrder.sorted && gateOrder.saved[0] === 0.1 && gateOrder.laps === 1, JSON.stringify(gateOrder));

  /* the painted start/finish was nailed to pts[0] and the grid to pts[N-6]
     while the lap closes on gates[0], wherever the editor put it */
  const startAgree = await ev(()=>{
    trackLibReset();
    trackEditOpen();
    TE.shape = [[0,6],[6,0],[0,-6],[-6,0]];
    TE.gates = [0.5, 0.75];                   // the lap line is NOT at t=0
    trackEditSave();
    setTrack(true);
    const N = TRACK.pts.length;
    const gi = trackSampleIndex(TRACK.gateT[0], N);
    const p = TRACK.pts[gi], g0 = TRACK.gates[0];
    const mid = {x:(g0.a.x+g0.b.x)/2, z:(g0.a.z+g0.b.z)/2};
    trackGrid();
    const gridI = trackNearest(R2.pos.x, R2.pos.z).i;
    const r = {gi, startI:TRACK.startI, painted:Math.hypot(mid.x-p.x, mid.z-p.z),
      gridArc: TRACK.pts.lap * (((gi - gridI) + N) % N) / N};
    setTrack(false);
    return r;
  });
  ok('the painted line, the timing line and the grid all sit on gate 0',
     startAgree.startI === startAgree.gi && startAgree.painted < 1e-6 &&
     startAgree.gridArc > 0 && startAgree.gridArc < 1.2, JSON.stringify(startAgree));

  console.log('\n════ named track layouts (v1.45.0) ════');
  /* Mike: "allow Save as New Track and loading an existing track" — one
     list, the current layout obvious, saving a copy one click */
  const libRow = await ev(()=>{
    trackLibReset();
    trackEditOpen();
    const sel = document.getElementById('teLayout');
    const r = {sel:!!sel, opts:sel ? sel.options.length : 0, value:sel ? sel.value : null,
      onStage: sel ? /on stage/.test(sel.options[sel.selectedIndex].textContent) : false,
      saveAs:!!document.getElementById('teSaveAs'),
      renameOff: document.getElementById('teRename').disabled,
      deleteOff: document.getElementById('teDelete').disabled};
    trackEditCancel();
    return r;
  });
  ok('the editor carries one layout list; on the stock lap it cannot be renamed or deleted',
     libRow.sel && libRow.opts === 1 && libRow.value === K.STOCK && libRow.onStage &&
     libRow.saveAs && libRow.renameOff && libRow.deleteOff, JSON.stringify(libRow));

  const saveAs = await ev(()=>{
    trackLibReset();
    const a = trackLibAdd('diamond', {shape:[[0,5],[5,0],[0,-5],[-5,0]], gates:[0,0.5], cones:[[1,1]]});
    const b = trackLibAdd('square',  {shape:[[4,4],[4,-4],[-4,-4],[-4,4]], gates:[0,0.25,0.5], cones:[]});
    const lib = trackLibLoad();
    return {aOk:a.ok, bOk:b.ok, n:lib.list.length, active:lib.active, aId:a.id, bId:b.id,
      names:lib.list.map(e=>e.name),
      stockOffList: !lib.list.some(e=>e.id===TRACK_STOCK_ID),
      listed: trackLibNames(lib).length,
      stored: (JSON.parse(localStorage.getItem('r2sim.prefs.v1')).tracks||{list:[]}).list.length,
      mirror: !!(PREFS.track && PREFS.track.shape && PREFS.track.shape.length===4)};
  });
  ok('Save as new keeps a copy without touching the others; the stock lap stays off the list',
     saveAs.aOk && saveAs.bOk && saveAs.n === 2 && saveAs.active === saveAs.bId &&
     saveAs.stockOffList && saveAs.listed === 3 && saveAs.stored === 2 && saveAs.mirror,
     JSON.stringify(saveAs));

  const load = await ev(()=>{
    const lib = trackLibLoad();
    const a = lib.list[0], b = lib.list[1];
    setTrack(true);
    const wasB = TRACK.shape.length === b.shape.length && TRACK.gates.length === 3;
    trackLibSelect(a.id);
    const nowA = TRACK.shape.length === a.shape.length && TRACK.gates.length === 2 &&
                 TRACK.cones.length === 1 && TRACK.layout.name === 'diamond';
    trackLibSelect(TRACK_STOCK_ID);
    const nowStock = TRACK.shape.length === TRACK_SHAPE.length && TRACK.gates.length === TRACK_GATES;
    setTrack(false);
    return {wasB, nowA, nowStock, active:trackLibLoad().active};
  });
  ok('loading a layout switches the stage geometry, and the stock lap is always there to go back to',
     load.wasB && load.nowA && load.nowStock && load.active === K.STOCK, JSON.stringify(load));

  const del = await ev(()=>{
    trackLibReset();
    const a = trackLibAdd('keep', {shape:[[0,5],[5,0],[0,-5],[-5,0]], gates:[0], cones:[]});
    const b = trackLibAdd('go',   {shape:[[4,4],[4,-4],[-4,-4],[-4,4]], gates:[0], cones:[]});
    setTrack(true);
    const r1 = trackLibDelete(b.id);                     // the ACTIVE one
    const lib = trackLibLoad();
    const orphan = lib.active !== TRACK_STOCK_ID && !trackLibEntry(lib, lib.active);
    const onA = TRACK.shape.length === 4 && TRACK.layout.id === lib.active;
    const r2 = trackLibDelete(a.id);                     // the last one left
    const lib2 = trackLibLoad();
    const onStock = TRACK.shape.length === TRACK_SHAPE.length;
    setTrack(false);
    return {r1:r1.ok, r2:r2.ok, afterFirst:lib.active, n:lib.list.length, orphan, onA,
            afterLast:lib2.active, n2:lib2.list.length, onStock,
            stockSafe: trackLibDelete(TRACK_STOCK_ID).ok === false};
  });
  ok('deleting the active layout cannot orphan it, and deleting the last one lands on the stock lap',
     del.r1 && del.r2 && !del.orphan && del.onA && del.n === 1 &&
     del.afterLast === K.STOCK && del.n2 === 0 && del.onStock && del.stockSafe,
     JSON.stringify(del));

  ok('rename changes the name and nothing else; the stock lap refuses', await ev(()=>{
    trackLibReset();
    const a = trackLibAdd('before', {shape:[[0,5],[5,0],[0,-5],[-5,0]], gates:[0,0.5], cones:[]});
    const r = trackLibRename(a.id, '  after  ');
    const lib = trackLibLoad();
    return r.ok && lib.list[0].name === 'after' && lib.list[0].shape.length === 4 &&
      trackLibRename(TRACK_STOCK_ID, 'nope').ok === false &&
      trackLibRename(a.id, '   ').ok === false;
  }));

  const corrupt = await ev(()=>{
    trackLibReset();
    PREFS.tracks = {v:1, active:'good', list:[
      {id:'bad', name:'too few points', shape:[[1,1],[2,2]]},          // skipped
      null,                                                           // skipped
      'nonsense',                                                     // skipped
      {id:'good', name:'good', shape:[[0,5],[5,0],[0,-5],[-5,0]], gates:'nope', cones:[[99,99]]}
    ]};
    prefsSave();
    const lib = trackLibLoad();
    trackDispose(); trackBuild();
    return {n:lib.list.length, id:lib.list[0] && lib.list[0].id, active:lib.active,
      shapeLen:TRACK.shape.length, gates:TRACK.gates.length, cones:TRACK.cones.length};
  });
  ok('a corrupt entry is skipped, not fatal — and a corrupt gates array still keeps its good shape',
     corrupt.n === 1 && corrupt.id === 'good' && corrupt.active === 'good' &&
     corrupt.shapeLen === 4 && corrupt.gates === K.GATES && corrupt.cones === 0,
     JSON.stringify(corrupt));

  const upgrade = await ev(()=>{
    trackLibReset();
    delete PREFS.tracks;                    // exactly what v1.44.1 left behind
    PREFS.track = {shape:[[0,5],[5,0],[0,-5],[-5,0]], gates:[0,0.5], cones:[[1,1]]};
    prefsSave();
    const lib = trackLibLoad();
    const d = trackShapeData();
    return {n:lib.list.length, name:lib.list[0] && lib.list[0].name, active:lib.active,
      shapeLen:d.shape.length, gates:d.gates.length, cones:d.cones.length};
  });
  ok('a lap edited in v1.44.1 arrives as a named layout instead of being lost',
     upgrade.n === 1 && upgrade.active === 't1' && upgrade.name === 'my track' &&
     upgrade.shapeLen === 4 && upgrade.gates === 2 && upgrade.cones === 1, JSON.stringify(upgrade));

  /* prefsSave() swallows quota errors (look/prefs.js) — a layout that cannot
     fit must not look like it worked */
  const quota = await ev(()=>{
    trackLibReset();
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function(){ throw new Error('QuotaExceededError'); };
    let r;
    try{ r = trackLibAdd('will not fit', {shape:[[0,5],[5,0],[0,-5],[-5,0]], gates:[0], cones:[]}); }
    finally{ Storage.prototype.setItem = real; }
    const lib = trackLibLoad();
    return {ok:r.ok, n:lib.list.length, active:lib.active,
      warned: LOG.slice(-4).some(l=>/no room/.test(l.s))};
  });
  ok('a layout that will not fit in storage says so instead of pretending it saved',
     quota.ok === false && quota.n === 0 && quota.active === K.STOCK && quota.warned,
     JSON.stringify(quota));

  /* SAVE on the stock lap forks a copy rather than overwriting it; SAVE on a
     named layout writes back into that one */
  const forkAndWrite = await ev(()=>{
    trackLibReset();
    trackEditOpen();
    TE.shape = [[0,5],[5,0],[0,-5],[-5,0]];
    trackEditSave();                              // stock was active — forks
    const lib1 = trackLibLoad();
    trackEditOpen();
    TE.shape = [[0,4],[4,0],[0,-4],[-4,0],[0,-1]];
    trackEditSave();                              // "my track" was active — writes back
    const lib2 = trackLibLoad();
    return {n1:lib1.list.length, name1:lib1.list[0] && lib1.list[0].name,
            n2:lib2.list.length, len2:lib2.list[0] && lib2.list[0].shape.length,
            active:lib2.active};
  });
  ok('SAVE forks the stock lap into a copy, then writes back into that copy',
     forkAndWrite.n1 === 1 && forkAndWrite.name1 === 'my track' &&
     forkAndWrite.n2 === 1 && forkAndWrite.len2 === 5, JSON.stringify(forkAndWrite));

  /* the list IS the load gesture: change it and the stage follows */
  const listLoad = await ev(async ()=>{
    trackLibReset();
    trackLibAdd('one', {shape:[[0,5],[5,0],[0,-5],[-5,0]], gates:[0], cones:[]});
    trackLibAdd('two', {shape:[[4,4],[4,-4],[-4,-4],[-4,4],[0,5]], gates:[0], cones:[]});
    setTrack(true);
    trackEditOpen();
    const sel = document.getElementById('teLayout');
    const target = Array.from(sel.options).find(o=>/^one/.test(o.textContent));
    sel.value = target.value;
    sel.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,0));
    const r = {opts:sel.options.length, editing:TE.shape.length,
      onStage:TRACK.shape.length === 4 && TRACK.layout.name === 'one',
      active:trackLibLoad().active === target.value};
    trackEditCancel();
    setTrack(false);
    return r;
  });
  ok('picking a layout in the list loads it into the editor and onto the stage',
     listLoad.opts === 3 && listLoad.editing === 4 && listLoad.onStage && listLoad.active,
     JSON.stringify(listLoad));

  /* the whole point of a library: it is still there after a reload */
  await ev(()=>{
    trackLibReset();
    trackLibAdd('survivor', {shape:[[0,5],[5,0],[0,-5],[-5,0],[0,2]], gates:[0,0.4], cones:[[2,2]]});
  });
  await page.reload();
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await ev(()=>{ PREFS.seenStartup=true; closeStartup(); });
  const reloaded = await ev(()=>{
    const lib = trackLibLoad();
    setTrack(true);
    const r = {n:lib.list.length, name:lib.list[0] && lib.list[0].name, active:lib.active,
      shapeLen:TRACK.shape.length, gates:TRACK.gates.length, cones:TRACK.cones.length,
      onStage:TRACK.layout && TRACK.layout.name};
    setTrack(false);
    return r;
  });
  ok('layouts persist across a reload and the active one is what builds',
     reloaded.n === 1 && reloaded.name === 'survivor' && reloaded.shapeLen === 5 &&
     reloaded.gates === 2 && reloaded.cones === 1 && reloaded.onStage === 'survivor',
     JSON.stringify(reloaded));

  // leave things clean for whatever runs next
  await ev(()=>{ trackLibReset(); trackDispose(); });

  ok('no page errors', errs.length === 0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
