/* practice track, music status, port picker, boards viz + channel picker,
   version tag, reset button, UI scale, stage theme */
const { chromium } = require('playwright');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required','--mute-audio']
  });
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
  ok('it has barriers down both edges, just outside the ribbon', await ev(()=>
    TRACK.barriers.length >= 100 &&
    /* nearest() snaps to the closest SAMPLE, so a tight corner reads a
       little short — assert the band, not the exact offset */
    TRACK.barriers.every(b=>{ const d = trackNearest(b.x,b.z).dist; return d > TRACK_HALF && d < TRACK_HALF+0.40; })));
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
  await ev(()=>{ loadProfile('mod2026'); });
  await page.waitForTimeout(400);
  await page.evaluate(n=>selectPart(n), doorName);
  ok('mod2026 shows its fixed port instead', await ev(()=>{
    const p = $('selcard').querySelector('.selport');
    return p && /0x40/.test(p.textContent) && /ch 0/.test(p.textContent);
  }));
  await ev(()=>deselectPart());

  console.log('\n════ boards: clickable pins ↔ the model ════');
  /* the boards moved again in v1.4.0 — they are the wizard's wiring step now */
  const bcard = ()=>$('startupBody').querySelectorAll('.boardcard');
  await ev(()=>wizOpen(wizSteps().findIndex(s=>s.key==='_wiring')));
  ok('two board cards render (dome + body)', await ev(()=>$('startupBody').querySelectorAll('.boardcard').length===2));
  ok('the mod2026 body card is live on this profile', await ev(()=>
    /PCA9685 0x40/.test($('startupBody').querySelectorAll('.boardcard')[1].textContent) &&
    $('startupBody').querySelectorAll('.boardcard')[1].classList.contains('live')));
  ok('clicking a mapped pin selects the part on the model', await ev(()=>{
    const body = $('startupBody').querySelectorAll('.boardcard')[1];
    const pin0 = body.querySelectorAll('.pinbtn')[0];      // ch0 = left body door
    pin0.click();
    return SEL.name === CAD.moving.find(m=>m.act==='doorL').name;
  }));
  ok('selecting a part lights its pin', await ev(()=>{
    const body = $('startupBody').querySelectorAll('.boardcard')[1];
    return body.querySelectorAll('.pinbtn')[0].classList.contains('sel');
  }));
  ok('the electronics choice is a build question in the setup', await ev(()=>{
    /* one step for both ends since v1.34.0, and a FORM plus flow diagrams
       since v1.36.0 — dropdowns for the device and the boards, pictures for
       the shape (config/wizard.js, wizServosStep) */
    wizGo(wizStepIndex('servos'));
    const host = $('startupBody');
    const sels  = host.querySelectorAll('select.svfsel').length;
    const flows = host.querySelectorAll('.flowcard svg.flow').length;
    const want  = servoTopos(buildGet().servoDevice).length;
    wizGo(wizSteps().findIndex(s=>s.key==='_wiring'));
    return sels >= 2 && flows === want && want >= 3;
  }));
  ok('the choice persists', await ev(()=>{
    hwGet().dome='mini12'; prefsSave();
    const saved = JSON.parse(localStorage.getItem('r2sim.prefs.v1')).hw.dome==='mini12';
    hwGet().dome='mini24'; prefsSave();
    return saved;
  }));

  console.log('\n════ board photos + channel picker ════');
  /* the six confirms are the in-app appConfirm dialog now (v1.14.0, Q7) —
     tests drive its Confirm/Cancel buttons instead of capturing native
     dialogs. The dialog opens synchronously inside the change handler;
     the handler's continuation runs on a microtask after the click, so a
     0 ms tick is enough to observe the outcome. */

  ok('all four Maestro photos are embedded (Pololu labelled views)', await ev(()=>
    ['micro6','mini12','mini18','mini24'].every(k=>/^data:image\/jpeg;base64,/.test(BOARD_IMG[k]))));
  ok('every pin map covers its whole board, mini18/24 incl. the bottom edge', await ev(()=>
    [['micro6',6],['mini12',12],['mini18',18],['mini24',24]].every(([k,n])=>{
      const chans=new Set();
      BOARD_PINMAP[k].banks.forEach(b=>{ for(let i=0;i<b.n;i++) chans.add(b.ch0+i); });
      return chans.size===n;
    }) && BOARD_PINMAP.mini18.banks.some(b=>b.horiz&&b.rev)
       && BOARD_PINMAP.mini24.banks.some(b=>b.horiz&&b.rev)));
  ok('24 strips land on the dome mini24 photo, 6 along the bottom', await ev(()=>{
    wizGo(wizSteps().findIndex(s=>s.key==='_wiring'));
    const card = $('startupBody').querySelectorAll('.boardcard')[0];
    return card.querySelectorAll('.pinstrip').length===24
        && card.querySelectorAll('.pinstrip.h').length===6;
  }));
  // planned board (profile is mod2026, so the dome mini24 is "planned")
  const srcCh = await ev(()=>{ const ps=hwPins('dome').pins; return ps.findIndex(p=>p.act); });
  const srcAct = await page.evaluate(i=>hwPins('dome').pins[i].act, srcCh);
  ok('clicking a strip opens the picker showing the connection + a pick list', await page.evaluate(i=>{
    const card = $('startupBody').querySelectorAll('.boardcard')[0];
    card.querySelectorAll('.pinstrip')[i].click();
    const pk = document.querySelector('.chpick');
    return !!(pk && pk.querySelector('select') && new RegExp('ch '+i+' ').test(pk.textContent)
              && pk.querySelector('select').value!=='');
  }, srcCh));
  ok('— unassigned — clears the channel and saves it in prefs', await page.evaluate(i=>{
    const sel = document.querySelector('.chpick select');
    sel.value=''; sel.dispatchEvent(new Event('change'));
    return hwPins('dome').pins[i].act===''
        && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).hwMap.dome[i]==='';
  }, srcCh));
  const freeCh = await page.evaluate(i=>{ const ps=hwPins('dome').pins; return ps.findIndex((p,k)=>k!==i && !p.act); }, srcCh);
  ok('assigning a free part warns nobody and sticks', await page.evaluate(([b,act])=>{
    wizGo(wizSteps().findIndex(s=>s.key==='_wiring'));
    const card = $('startupBody').querySelectorAll('.boardcard')[0];
    card.querySelectorAll('.pinbtn')[b].click();
    const sel = document.querySelector('.chpick select');
    sel.value=act; sel.dispatchEvent(new Event('change'));
    const warned = !!document.querySelector('.dlgwrap');
    return !warned && hwPins('dome').pins[b].act===act;
  }, [freeCh, srcAct]));
  const thirdCh = await page.evaluate(([a,b])=>{ const ps=hwPins('dome').pins; return ps.findIndex((p,k)=>k!==a&&k!==b); }, [srcCh,freeCh]);
  ok('stealing a part that is in use pops the warning and moves it', await page.evaluate(async ([c,b,act])=>{
    wizGo(wizSteps().findIndex(s=>s.key==='_wiring'));
    const card = $('startupBody').querySelectorAll('.boardcard')[0];
    card.querySelectorAll('.pinbtn')[c].click();
    const sel = document.querySelector('.chpick select');
    sel.value=act; sel.dispatchEvent(new Event('change'));
    const dlg = document.querySelector('.dlgwrap');
    const asked = !!dlg && /already on/.test(dlg.textContent);
    if(dlg) dlg.querySelector('.dlgyes').click();
    await new Promise(r=>setTimeout(r,0));
    const ps = hwPins('dome').pins;
    return asked && !document.querySelector('.dlgwrap') && ps[c].act===act && ps[b].act==='';
  }, [thirdCh, freeCh, srcAct]));

  // live board: a matching .mstr makes the card editable straight into MSTR
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  await ev(()=>{ hwGet().body='mini18'; prefsSave(); makeStarter('body','mini18'); rebuildMaestroUI(); wizGo(wizSteps().findIndex(s=>s.key==='_wiring')); });
  ok('a matching .mstr makes the body card live with 18 strips', await ev(()=>{
    const body = $('startupBody').querySelectorAll('.boardcard')[1];
    return body.classList.contains('live') && body.querySelectorAll('.pinstrip').length===18;
  }));
  const liveMv = await ev(async ()=>{
    const pins = hwPins('body').pins;
    const a = pins.findIndex(p=>p.act);
    let b = pins.findIndex((p,k)=>k!==a && !p.act); if(b<0) b=(a+1)%pins.length;
    const act = pins[a].act;
    const body = $('startupBody').querySelectorAll('.boardcard')[1];
    body.querySelectorAll('.pinbtn')[b].click();
    const sel = document.querySelector('.chpick select');
    sel.value=act; sel.dispatchEvent(new Event('change'));
    /* the part is already on another channel, so the move asks first */
    const dlg = document.querySelector('.dlgwrap');
    if(dlg){ dlg.querySelector('.dlgyes').click(); await new Promise(r=>setTimeout(r,0)); }
    return {act, a, b, now:MSTR.channels.findIndex(c=>c.act===act), count:MSTR.channels.filter(c=>c.act===act).length};
  });
  ok('a live-board pick writes straight into the Maestro channels', liveMv.now===liveMv.b && liveMv.count===1, JSON.stringify(liveMv));
  await ev(()=>{ chPickerClose(); PREFS.hwMap={}; prefsSave(); loadProfile('mod2026'); });
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
  await ev(()=>{ PREFS.stageTheme='light'; applyStageTheme(); });
  /* an environment overrides fog/ground/lights by design, so these check
     the STUDIO, which is the look the theme owns */
  await ev(()=>{ envSet('studio'); PREFS.stageTheme='light'; applyStageTheme(); });
  ok('the stage can hold light while the frame stays dark', await ev(()=>
    scene.fog.color.getHex()===THEME_3D.light.fog && !document.body.classList.contains('light')));
  await ev(()=>{ PREFS.stageTheme='follow'; applyStageTheme(); });
  ok('and follows the frame again', await ev(()=>scene.fog.color.getHex()===THEME_3D.dark.fog));

  console.log('\n════ track builder ════');
  /* PREFS.track data path (app/track.js) — absent or invalid falls back to
     the stock circuit, one field at a time */
  const fallbackAbsent = await ev(()=>{
    delete PREFS.track; prefsSave();
    trackDispose(); trackBuild();
    const same = TRACK.shape.length===TRACK_SHAPE.length &&
      TRACK.shape.every((p,i)=>p[0]===TRACK_SHAPE[i][0] && p[1]===TRACK_SHAPE[i][1]);
    return {same, gatesOk:TRACK.gates.length===TRACK_GATES, conesLen:TRACK.cones.length};
  });
  ok('with no PREFS.track at all, the stock circuit builds', fallbackAbsent.same &&
     fallbackAbsent.gatesOk && fallbackAbsent.conesLen===0, JSON.stringify(fallbackAbsent));
  const fallbackInvalid = await ev(()=>{
    // a corrupt gates array (out of 0..1) must not also throw away a good shape
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
    PREFS.track = null; prefsSave(); trackDispose();
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
    PREFS.track = null; prefsSave();
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
    PREFS.track = null; prefsSave();
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
    PREFS.track = null; prefsSave();
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
    PREFS.track = null; prefsSave();
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
    PREFS.track = null; prefsSave();
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
    PREFS.track = null; prefsSave();
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
    PREFS.track = null; prefsSave();
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

  // leave things clean for whatever runs next
  await ev(()=>{ PREFS.track = null; prefsSave(); trackDispose(); });

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
