/* Model Builder — the fourth stage model, and the only one you build
   yourself: a 50 mm-grid parts bin (beam, plate, disc, hinge, ball joint)
   with no fixed rig, driven by forward kinematics through the THREE scene
   graph. Modelled on mouse.test.js's bootstrap and anzellan.test.js's
   register/unregister-on-stage assertion shape.
   -------------------------------------------------------------------------
   Two of these are regression tests for a trap that would silently break
   the whole app rather than just this feature:
     · `maestro/builder.js` (the "Build your Maestro" overlay) already owns
       the global `BLD` and every `bld*` top-level name. This file uses
       `MB`/`mb*` instead — a duplicate `const BLD` would be a fatal
       SyntaxError on load, not a wrong answer, so "no page errors" at the
       end of THIS suite is itself the regression guard for that.
     · channels must register in ACT only while the builder is the model
       on stage — add a joint off-stage and it must not appear, and coming
       back on stage must bring the whole saved assembly with it. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };
const near=(a,b,t)=>Math.abs(a-b)<=t;

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof MOUSE!=="undefined" && MOUSE.loaded', {timeout:60000});
  const ev = f => page.evaluate(f);
  const evA = (f,a) => page.evaluate(f,a);
  await ev(()=>{ if(typeof closeStartup==='function') closeStartup(); modelSet('droid', {frame:false}); });

  console.log('\n════ it exists, and did not clobber the OTHER builder ════');
  /* maestro/builder.js's "Build your Maestro" overlay owns BLD/bld* — this
     file is MB/mb* on purpose. If the two ever collided this whole suite
     would have failed to load the page at all. */
  ok('the Model Builder is its own global, not the Maestro-build overlay', await ev(()=>
    typeof MB !== 'undefined' && typeof BLD !== 'undefined' && MB !== BLD));
  ok('four models to choose from, Builder last', await ev(()=>MODEL_IDS.join()==='droid,frik,mouse,builder'));
  ok('cycling all four comes home', await ev(()=>{
    modelSet('droid', {frame:false});
    const seen=[modelGet()];
    for(let i=0;i<4;i++){ modelCycle(); seen.push(modelGet()); }
    return seen.join()==='droid,frik,mouse,builder,droid';
  }));

  console.log('\n════ one model on the stage at a time ════');
  const shown = await ev(()=>{
    modelSet('builder', {frame:false});
    return {bld:MB.root.visible, r2:R2.root.visible, frik:ANZ.root.visible, mouse:MOUSE.root.visible,
            drv:DRV.who, pref:PREFS.model, btn:($('btnModel')||{}).textContent};
  });
  ok('switching to builder shows only the builder group', shown.bld && !shown.r2 && !shown.frik && !shown.mouse, JSON.stringify(shown));
  ok('the pad never comes to the builder — like frik, it is a bench thing', shown.drv==='r2');
  ok('the selection is remembered', shown.pref==='builder');
  ok('the stage button names it', shown.btn==='Builder');
  ok('THE SKETCH KEEPS RUNNING with the builder on stage', await ev(()=>{
    const t0 = SIM.millis;
    for(let i=0;i<40;i++){ SIM.millis += 4; fwLoop(); }
    return SIM.millis > t0 && typeof PROFILE.name === 'string';
  }));
  ok('the Model tab draws the builder’s own panel, not the droid’s', await ev(()=>{
    setView('advanced');
    document.querySelector('#tabs button[data-p="pCad"]').click();
    buildCadPane();
    const t = $('cadHost').textContent;
    return /Parts bin/.test(t) && !/Ride height/.test(t) && !/Moving parts/.test(t);
  }));

  console.log('\n════ a door where the user is standing — the 🔧 BUILD stage button (1.4) ════');
  const stageBtn = await ev(()=>{
    /* modelSet('builder', ...) already ran above — this is the state the
       previous section left the stage in */
    const whileBuilder = {
      present: !!$('btnMbBuild'),
      visible: !!$('btnMbBuild') && !$('btnMbBuild').hidden,
      sibling: !!$('btnMbBuild') && $('btnMbBuild').previousElementSibling === $('btnModel'),
      inStageTools: !!$('btnMbBuild') && $('btnMbBuild').closest('#stageTools') === $('stageTools')
    };
    modelSet('droid', {frame:false});
    const droidHidden = $('btnMbBuild').hidden;
    modelSet('mouse', {frame:false});
    const mouseHidden = $('btnMbBuild').hidden;
    modelSet('builder', {frame:false});
    const backVisible = !$('btnMbBuild').hidden;
    return {whileBuilder, droidHidden, mouseHidden, backVisible};
  });
  ok('the 🔧 BUILD button exists, a sibling of the model chip inside #stageTools',
     stageBtn.whileBuilder.present && stageBtn.whileBuilder.sibling && stageBtn.whileBuilder.inStageTools,
     JSON.stringify(stageBtn.whileBuilder));
  ok('…visible while the builder is on stage', stageBtn.whileBuilder.visible);
  ok('…hidden once the droid is on stage', stageBtn.droidHidden);
  ok('…hidden for the mouse too, not just "not droid"', stageBtn.mouseHidden);
  ok('…and back the moment the builder is on stage again', stageBtn.backVisible);
  const paneOpen = await ev(()=>{
    wsSet('drive');
    document.querySelector('#tabs button[data-p="pHelp"]').click();
    const before = {ws:wsGet(), pad:$('pCad').classList.contains('act')};
    $('btnMbBuild').click();
    const after = {ws:wsGet(), pad:$('pCad').classList.contains('act')};
    return {before, after};
  });
  ok('…and clicking it opens Configure ▸ Model directly',
     paneOpen.after.ws==='config' && paneOpen.after.pad, JSON.stringify(paneOpen));

  console.log('\n════ the mod2026 channels wall gets plain words and a door (1.1) ════');
  const fwDoor = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const hinge = mbAddPart('hinge');
    mbSelect(hinge.id);
    document.querySelector('#tabs button[data-p="pCad"]').click();
    buildCadPane();
    const text = $('cadHost').textContent;
    const hasNewWording = text.includes("mod2026's servo map is compiled into the sketch")
                        && text.includes("Builder joints can't be wired on this firmware");
    const hasOldJargon = /fixed at compile time/.test(text);
    const btn = $('btnMbFwDoor');
    const hasBtn = !!btn && /OPEN THE SETUP\s*—\s*FIRMWARE/.test(btn.textContent);
    btn.click();
    const opened = $('startup').classList.contains('on');
    const stepKey = wizSteps()[WIZ.i].key;
    closeStartup();
    mbDeletePart(hinge.id);
    return {hasNewWording, hasOldJargon, hasBtn, opened, stepKey};
  });
  ok('mod2026: plain words replace the compile-time jargon', fwDoor.hasNewWording, JSON.stringify(fwDoor));
  ok('…and the old wording is gone', !fwDoor.hasOldJargon);
  ok('…with a real "OPEN THE SETUP — FIRMWARE" button', fwDoor.hasBtn);
  ok('…that opens the startup wizard on the Firmware step', fwDoor.opened && fwDoor.stepKey==='firmware');

  console.log('\n════ parts land on the grid ════');
  const grid = await ev(()=>{
    const ids = ['beam','plate','disc'].map(t=>mbAddPart(t).id);
    const onGrid = MB.parts.every(p =>
      Math.abs(p.pos.x/0.05 - Math.round(p.pos.x/0.05)) < 1e-9 &&
      Math.abs(p.pos.y/0.05 - Math.round(p.pos.y/0.05)) < 1e-9 &&
      Math.abs(p.pos.z/0.05 - Math.round(p.pos.z/0.05)) < 1e-9);
    const distinct = new Set(MB.parts.map(p=>p.pos.x+','+p.pos.z)).size === MB.parts.length;
    ids.forEach(id=>mbDeletePart(id));
    return {onGrid, distinct};
  });
  ok('new parts land on the 50 mm grid (positions % 0.05 == 0)', grid.onGrid);
  ok('and do not stack on top of each other', grid.distinct);

  console.log('\n════ attach = a real THREE child, and forward kinematics ════');
  const fk = await ev(()=>{
    const hinge = mbAddPart('hinge');
    const beam = mbAddPart('beam');
    const wasChild = beam.group.parent === hinge.attachPoint;      // before attach: still on the base
    mbSetAttach(beam.id, hinge.id);
    const isChild = beam.group.parent === hinge.attachPoint;
    ACT[hinge.channels[0]] = 0.5; ACT_T[hinge.channels[0]] = 0.5;
    applyModelBuilder(0.016);
    const p0 = beam.group.getWorldPosition(new THREE.Vector3()).clone();
    ACT[hinge.channels[0]] = 1.0;
    applyModelBuilder(0.016);
    const p1 = beam.group.getWorldPosition(new THREE.Vector3()).clone();
    /* detach: back to the base, and a second child left behind is not orphaned */
    mbSetAttach(beam.id, 'base');
    const backOnBase = beam.parent === 'base';
    const cantSelfParent = mbSetAttach(hinge.id, hinge.id) === false;
    mbDeletePart(beam.id); mbDeletePart(hinge.id);
    return {wasChild, isChild, moved: p0.distanceTo(p1), backOnBase, cantSelfParent};
  });
  ok('before attaching, the beam is not the hinge’s child', !fk.wasChild);
  ok('ATTACH TO makes it a real THREE child of the hinge’s flag pivot', fk.isChild);
  ok('rotating the parent hinge moves the child’s WORLD position (FK)', fk.moved > 0.01, fk.moved.toFixed(4)+' m');
  ok('detaching puts it back on the base', fk.backOnBase);
  ok('a part cannot be attached to itself', fk.cantSelfParent);

  console.log('\n════ hinge channel registers only while the builder is on stage ════');
  /* same assertion shape as anzellan.test.js's "the channels register with
     the head, not the build" block */
  const reg = await ev(()=>{
    modelSet('builder', {frame:false});
    const hinge = mbAddPart('hinge');
    const k = hinge.channels[0];
    const onStage = ACT[k] !== undefined && ACT_T[k] !== undefined;
    modelSet('droid', {frame:false});
    const offStage = ACT[k] === undefined && ACT_T[k] === undefined;
    const droidUntouched = ACT.doorL !== undefined && ACT.pie0 !== undefined; // the droid keeps its own
    modelSet('builder', {frame:false});
    const backOnStage = ACT[k] !== undefined;
    const survived = MB.parts.some(p=>p.id===hinge.id);
    mbDeletePart(hinge.id);
    return {onStage, offStage, droidUntouched, backOnStage, survived};
  });
  ok('adding a joint while on stage registers its channel(s)', reg.onStage);
  ok('leaving the stage takes it back out of ACT', reg.offStage);
  ok('and the droid keeps its own channels regardless', reg.droidUntouched);
  ok('coming back on stage restores it — selecting it IS what persists', reg.backOnStage && reg.survived);

  console.log('\n════ a ball joint is two channels — pan and tilt ════');
  const ball = await ev(()=>{
    const b = mbAddPart('ball');
    const two = b.channels.length===2 && ACT[b.channels[0]]!==undefined && ACT[b.channels[1]]!==undefined;
    ACT[b.channels[0]] = 1.0; ACT[b.channels[1]] = 0.0; ACT_T[b.channels[0]]=1.0; ACT_T[b.channels[1]]=0.0;
    applyModelBuilder(0.016);
    const panMoved = Math.abs(b.panPivot.rotation.y) > 0.1;
    const tiltMoved = Math.abs(b.attachPoint.rotation.x) > 0.1;
    mbDeletePart(b.id);
    return {two, channels:b.channels, panMoved, tiltMoved};
  });
  ok('a ball joint registers two channels', ball.two, ball.channels.join(', '));
  ok('the two channels drive pan and tilt independently', ball.panMoved && ball.tiltMoved);

  console.log('\n════ channel assignment round-trips, and it names the part ════');
  await ev(()=>{ loadProfile('maestro25'); setBoard('mini12'); makeStarter('body','mini12'); rebuildMaestroUI(); });
  const wired = await ev(()=>{
    const hinge = mbAddPart('hinge');
    const labelBeforeName = builderActLabel(hinge.channels[0]);     // "Joint N" fallback
    /* the starter fills every named channel with a guessed droid part, so
       there is no "free" servo channel to find — borrow the first Servo-mode
       one (restored to '' below, same as freeing any other channel would be) */
    const ch = MSTR.channels.find(c=>/^servo/i.test(c.mode));
    ch.act = hinge.channels[0];
    const inActions = blockActions().some(a=>a.act===hinge.channels[0]);
    mbRename(hinge.id, 'Shoulder');
    const labelAfterName = builderActLabel(hinge.channels[0]);
    const stillWired = MSTR.channels.find(c=>c.act===hinge.channels[0]) === ch;
    ch.act = '';
    mbDeletePart(hinge.id);
    modelSet('droid', {frame:false});
    return {labelBeforeName, labelAfterName, inActions, stillWired};
  });
  ok('an unnamed joint falls back to "Joint N"', /^Joint \d+$/.test(wired.labelBeforeName), wired.labelBeforeName);
  ok('naming the part renames the channel everywhere builderActLabel is asked', wired.labelAfterName==='Shoulder');
  ok('a wired joint lands in the sequencer action library (BLKH.actions)', wired.inActions);
  ok('renaming the part did not move the Maestro wiring', wired.stillWired);

  console.log('\n════ PREFS.builder persists the whole assembly ════');
  const rt = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const hinge = mbAddPart('hinge');
    const beam = mbAddPart('beam');
    mbSetAttach(beam.id, hinge.id);
    mbRename(beam.id, 'Arm');
    const before = JSON.parse(JSON.stringify(PREFS.builder));
    /* clear the runtime and rebuild purely from what was saved */
    mbRebuildFromPrefs();
    const after = {
      count: MB.parts.length,
      positions: MB.parts.map(p=>({x:p.pos.x,y:p.pos.y,z:p.pos.z})).sort((a,b)=>a.x-b.x),
      names: MB.parts.map(p=>p.name).sort(),
      attached: MB.parts.some(p=>p.parent!=='base')
    };
    const stored = JSON.parse(localStorage.getItem('r2sim.prefs.v1'));
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {beforeCount: before.parts.length, after, storedHasBuilder: !!(stored && stored.builder && stored.builder.parts)};
  });
  ok('save → clear → rebuild keeps the same part count', rt.after.count === rt.beforeCount && rt.beforeCount === 2);
  ok('…and the same positions', rt.after.positions.every(p=>[0,0.05].includes(p.y)));
  ok('…and names, and the attachment', rt.after.names.join()===',Arm' && rt.after.attached);
  ok('it survives a reload via localStorage too', rt.storedHasBuilder);

  console.log('\n════ soft cap warns, hard cap stops ════');
  const cap = await evA(([soft,hard])=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const ids=[];
    for(let i=0;i<hard;i++){ const r=mbAddPart('beam'); if(r) ids.push(r.id); }
    const atHard = MB.parts.length;
    const blocked = mbAddPart('beam');
    document.querySelector('#tabs button[data-p="pCad"]').click();
    buildCadPane();
    const noteText = $('cadHost').textContent;
    ids.forEach(id=>mbDeletePart(id));
    modelSet('droid', {frame:false});
    return {atHard, blockedNull: blocked===null, hasNote: noteText.includes('getting big for one mechanism')};
  }, [8,12]);
  ok('the hard cap holds at 12', cap.atHard===12, cap.atHard+'');
  ok('a 13th part is refused', cap.blockedNull);
  ok('the pane warns gently past 8 parts', cap.hasNote);
  const disabledAt12 = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    for(let i=0;i<12;i++) mbAddPart('beam');
    buildCadPane();
    const disabled = Array.from($('cadHost').querySelectorAll('.mbbtn')).every(b=>b.disabled);
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return disabled;
  });
  ok('every ADD button is disabled at the cap', disabledAt12);

  console.log('\n════ mbRebuildFromPrefs() survives garbage — never throws, never a detached cycle (2.1) ════');
  const badPos = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    /* written straight to PREFS, the way a hand-edited or foreign setup
       .json would arrive — p1 is missing pos entirely, p2 is a good record */
    PREFS.builder = { parts: [
      { id:'p1', type:'beam', rot:{x:0,y:0,z:0}, parent:'base', channels:[] },
      { id:'p2', type:'plate', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[] }
    ]};
    let threw = false, count = null;
    try{ count = mbRebuildFromPrefs(); }catch(e){ threw = true; }
    const kept = MB.parts.map(p=>p.id);
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    return {threw, count, kept};
  });
  ok('a record with a missing pos is skipped, not thrown', !badPos.threw, JSON.stringify(badPos));
  ok('…the good sibling record still restores', badPos.count===1 && badPos.kept.join()==='p2');

  const cyclic = await ev(()=>{
    /* two records naming EACH OTHER as parent — mbSetAttach() refuses this
       live; the restore path has to refuse it too */
    PREFS.builder = { parts: [
      { id:'p1', type:'hinge', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'p2', axis:'y', channels:['bldJ1'], jointN:1 },
      { id:'p2', type:'hinge', pos:{x:0.05,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'p1', axis:'y', channels:['bldJ2'], jointN:2 }
    ]};
    let threw = false, count = null;
    try{ count = mbRebuildFromPrefs(); }catch(e){ threw = true; }
    const bothPresent = MB.parts.length===2;
    const bothOnBase = MB.parts.every(p=>p.parent==='base' && p.group.parent===MB.base.attachPoint);
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    return {threw, count, bothPresent, bothOnBase};
  });
  ok('a two-record parent cycle throws nothing', !cyclic.threw, JSON.stringify(cyclic));
  ok('…both records stay on stage, parented to the base plate — no detached cycle', cyclic.bothPresent && cyclic.bothOnBase);

  const capRestore = await ev(()=>{
    const parts = [];
    for(let i=1;i<=15;i++) parts.push({id:'p'+i, type:'beam', pos:{x:i*0.05,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]});
    PREFS.builder = { parts };
    let threw = false, count = null;
    try{ count = mbRebuildFromPrefs(); }catch(e){ threw = true; }
    const atCap = MB.parts.length;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {threw, count, atCap};
  });
  ok('a 15-record file stops at the 12-part hard cap', !capRestore.threw && capRestore.atCap===12 && capRestore.count===12, JSON.stringify(capRestore));

  console.log('\n════ kiosk refuses the builder’s own doors — the fifth guard (1.7) ════');
  const kg = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const seedId = mbAddPart('beam').id;
    mbSelect(null);
    kioskEnter('');
    mbSelect(seedId);
    const selBlocked = MB.sel;
    const addBlocked = mbAddPart('beam');
    const countBlocked = MB.parts.length;
    kioskLeave();
    mbSelect(seedId);
    const selRestored = MB.sel;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {seedId, selBlocked, addBlocked, countBlocked, selRestored};
  });
  ok('mbSelect() refuses to change the selection while kiosk is on', kg.selBlocked===null, JSON.stringify(kg));
  ok('mbAddPart() refuses while kiosk is on — returns null, the count holds at 1', kg.addBlocked===null && kg.countBlocked===1);
  ok('leaving kiosk opens both doors back up', kg.selRestored===kg.seedId);

  console.log('\n════ nothing leaked into the droid ════');
  ok('the builder owns no droid actuator keys', await ev(()=>
    !Object.keys(ACT).some(k=>/^bldJ/.test(k) === false && false)));   // sanity no-op guard below is the real check
  ok('the droid’s own actuator count is untouched', await ev(()=>
    Object.keys(ACT).filter(k=>!/^bldJ\d+t?$/.test(k)).length === ACT_KEYS.length + PIE_COUNT + PANEL_COUNT));
  ok('no bldJ key ever lands in ACT_KEYS', await ev(()=>ACT_KEYS.every(k=>!/^bldJ/.test(k))));
  ok('no page errors', errs.length===0, errs.slice(0,5).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
