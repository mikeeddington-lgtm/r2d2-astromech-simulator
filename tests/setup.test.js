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

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
