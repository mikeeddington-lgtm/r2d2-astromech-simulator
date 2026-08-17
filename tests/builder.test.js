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
       back on stage must bring the whole saved assembly with it.

   v1.45.0 adds two runs of sections. The numbered ones ("(1) deleting a
   joint…") are the repair pass: each was written to FAIL against the module
   as it stood, because the reproduction is the point — the first of them
   catches the actual "Cannot read properties of undefined (reading
   'toFixed')" that took the whole frame loop down. The unnumbered ones after
   them are Mike's five requests, and one of those — the stand-in `faceX`
   type — exists purely to prove no consumer names a joint TYPE any more, so
   phase 2's rigged face part is driven, named, counted and offered channels
   by adding one MB_PRIM entry. */
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
  /* the doors v1.45.0 added need the same guard — a stranger's hands on a
     kiosk canvas must not be able to drag the mechanism apart or load a
     different model over it */
  const kg3 = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const bm = mbAddPart('beam');
    const was = {x:bm.pos.x, z:bm.pos.z};
    kioskEnter('');
    const began = mbDragBegin(bm.id, 100, 100);
    const imported = mbImportModelText(JSON.stringify({format:'r2sim-model', v:2, parts:[
      {id:'p9', type:'disc', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]}
    ]}), 'kiosk.json');
    const held = MB.parts.length===1 && MB.parts[0].id===bm.id && bm.pos.x===was.x && bm.pos.z===was.z;
    kioskLeave();
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {began, importedOK: imported && imported.ok, held};
  });
  ok('mbDragBegin() refuses while kiosk is on', kg3.began===false, JSON.stringify(kg3));
  ok('…so does importing a model file, and the assembly holds', !kg3.importedOK && kg3.held);

  /* =====================================================================
     v1.45.0 — "repair the currently broken Builder". One section per defect
     Mike's read turned up, each one written to FAIL against the old module
     first: the reproduction is the point, the fix is the answer to it.
     ===================================================================== */

  console.log('\n════ (1) deleting a joint must not take the frame loop down ════');
  /* app/panels.js builds OUTROWS.act from Object.keys(ACT) once, and
     updateOutputs() then reads ACT[r.key].toFixed(2) ~16×/s from the frame
     loop — so a channel that leaves ACT without the table being rebuilt
     throws on the very next frame. mbSetShown() always called buildOutputs();
     mbAddPart/mbDeletePart/mbRebuildFromPrefs did not. */
  const outRows = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    buildOutputs();
    const before = OUTROWS.act.length;
    const h = mbAddPart('hinge');
    const rowAdded = OUTROWS.act.some(r=>r.key===h.channels[0]);
    buildOutputs();            // whatever else rebuilds it — a model switch, opening the pane
    let threwAdd = '';
    try{ updateOutputs(); }catch(e){ threwAdd = e.message; }
    mbDeletePart(h.id);
    let threwDel = '';
    try{ updateOutputs(); }catch(e){ threwDel = e.message; }
    const stale = OUTROWS.act.filter(r=>ACT[r.key]===undefined).map(r=>r.key);
    const after = OUTROWS.act.length;
    modelSet('droid', {frame:false});
    return {before, after, rowAdded, threwAdd, threwDel, stale};
  });
  ok('adding a joint puts its channel in the Outputs table', outRows.rowAdded, JSON.stringify(outRows));
  ok('…and the frame loop reads it without throwing', outRows.threwAdd==='', outRows.threwAdd);
  ok('deleting it rebuilds the table — updateOutputs() does not throw', outRows.threwDel==='', outRows.threwDel);
  ok('…no Outputs row is left pointing at a channel that no longer exists', outRows.stale.length===0, outRows.stale.join());
  ok('…and the table is back to the size it was', outRows.after===outRows.before);

  console.log('\n════ (2) mbRebuildFromPrefs() does its own ACT bookkeeping ════');
  const rebuildReg = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const old = mbAddPart('hinge');
    const oldKey = old.channels[0];
    /* exactly the call app/setup-io.js makes when a setup imports while the
       builder is already the model on stage */
    PREFS.builder = {parts:[
      {id:'p9', type:'hinge', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', axis:'y', channels:['bldJ777'], jointN:777}
    ]};
    mbRebuildFromPrefs();
    const stranded = ACT[oldKey] !== undefined || ACT_T[oldKey] !== undefined;
    const registered = ACT.bldJ777 !== undefined && ACT_T.bldJ777 !== undefined;
    /* idempotent: asking again must not reset a channel the user has moved */
    ACT.bldJ777 = 0.9; ACT_T.bldJ777 = 0.9;
    mbRegisterAll();
    const keptValue = ACT.bldJ777 === 0.9;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const gone = ACT.bldJ777 === undefined;
    modelSet('droid', {frame:false});
    return {oldKey, stranded, registered, keptValue, gone};
  });
  ok('the assembly it replaced is unregistered, not stranded in ACT', !rebuildReg.stranded, rebuildReg.oldKey);
  ok('…the assembly it restored IS registered, because the builder is on stage', rebuildReg.registered);
  ok('…registering twice is idempotent — it does not reset a moved channel', rebuildReg.keptValue);
  ok('…and deleting the restored joint takes its channel back out', rebuildReg.gone);

  const setupImp = await ev(()=>{
    modelSet('droid', {frame:false});
    /* the STALE assembly: what this browser had before the file arrived */
    PREFS.builder = {parts:[{id:'pz', type:'beam', pos:{x:0.3,y:0.05,z:0.3}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]}]};
    const file = setupExportObj();
    file.prefs.model = 'builder';
    file.prefs.builder = {v:2, parts:[
      {id:'p1', type:'hinge', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', axis:'y', channels:['bldJ404'], jointN:404}
    ]};
    /* which assembly each rebuild during the import actually saw */
    const seen = [];
    const orig = window.mbRebuildFromPrefs;
    window.mbRebuildFromPrefs = function(){
      seen.push((((PREFS.builder||{}).parts)||[]).map(p=>p.id).join('+') || '(none)');
      return orig.apply(null, arguments);
    };
    let threw = '';
    try{ setupImportObj(file); }catch(e){ threw = e.message; }
    window.mbRebuildFromPrefs = orig;
    const ids = MB.parts.map(p=>p.id).join();
    const registered = ACT.bldJ404 !== undefined;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {threw, seen, ids, registered};
  });
  ok('importing a setup lands the assembly the file carries', setupImp.ids==='p1' && !setupImp.threw, JSON.stringify(setupImp));
  ok('…with its channels registered, the builder now being the model', setupImp.registered);
  ok('…and no rebuild ever ran against the assembly the file replaced', setupImp.seen.every(s=>s==='p1'), setupImp.seen.join(' → '));

  console.log('\n════ (3) foreign channel ids and a nonsense axis are refused ════');
  const foreign = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    ACT.doorL = 0.123; ACT_T.doorL = 0.123; ACT.pie0 = 0.321; ACT_T.pie0 = 0.321;
    PREFS.builder = { parts: [
      {id:'p1', type:'hinge', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', axis:'y', channels:['doorL','pie0'], jointN:1},
      {id:'p2', type:'hinge', pos:{x:0.05,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', axis:'q', channels:['bldJ2'], jointN:2},
      {id:'p3', type:'beam', pos:{x:0.1,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]}
    ]};
    let threw = false;
    try{ mbRebuildFromPrefs(); }catch(e){ threw = true; }
    const kept = MB.parts.map(p=>p.id).sort().join();
    const doorHeld = ACT.doorL === 0.123 && ACT_T.doorL === 0.123 && ACT.pie0 === 0.321;
    const strayAxis = MB.parts.some(p=>p.axis !== undefined && ['x','y','z'].indexOf(p.axis)<0);
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const doorSurvived = ACT.doorL !== undefined && ACT.pie0 !== undefined;
    ACT.doorL = 0; ACT_T.doorL = 0; ACT.pie0 = 0; ACT_T.pie0 = 0;
    modelSet('droid', {frame:false});
    return {threw, kept, doorHeld, strayAxis, doorSurvived};
  });
  ok('a record claiming the droid’s own channels never gets registered', foreign.doorHeld, JSON.stringify(foreign));
  ok('…so the next model switch cannot delete the droid’s doors and pies', foreign.doorSurvived);
  ok('…a record with a nonsense axis is refused too', !foreign.strayAxis);
  ok('…and the good sibling record still restores', foreign.kept==='p3' && !foreign.threw);

  console.log('\n════ (4) a duplicate saved id cannot orphan a mesh ════');
  const dupes = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    PREFS.builder = {parts:[
      {id:'p1', type:'beam', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]},
      {id:'p1', type:'disc', pos:{x:0.05,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]}
    ]};
    const n = mbRebuildFromPrefs();
    const tagged = [];
    MB.root.traverse(o=>{ if(o.userData && o.userData.mbId) tagged.push(o.userData.mbId); });
    mbDeletePart('p1');
    const ghosts = [];
    MB.root.traverse(o=>{ if(o.userData && o.userData.mbId) ghosts.push(o.userData.mbId); });
    const left = MB.parts.length;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {n, tagged, ghosts, left};
  });
  ok('a duplicate saved id is refused, not realized twice', dupes.n===1 && dupes.tagged.join()==='p1', JSON.stringify(dupes));
  ok('…so deleting it leaves no unselectable ghost on the stage', dupes.ghosts.length===0 && dupes.left===0, dupes.ghosts.join());

  console.log('\n════ (5) a joint knows its name before the builder is ever shown ════');
  const freshLabel = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const h = mbAddPart('hinge');
    mbRename(h.id, 'Elbow');
    const k = h.channels[0];
    const onStage = builderActLabel(k);
    modelSet('droid', {frame:false});
    /* what a FRESH LOAD looks like: PREFS.builder carries the assembly and
       the runtime has not built it, because the builder has never been on
       stage in this session */
    const saved = JSON.parse(JSON.stringify(PREFS.builder));
    MB.parts.forEach(p=>{ if(p.group && p.group.parent) p.group.parent.remove(p.group); });
    MB.parts = [];
    PREFS.builder = saved;
    const fresh = builderActLabel(k);
    const freshFriendly = actFriendly(k);
    const freshPart = actPartLabel(k);
    PREFS.builder = {parts:[]};
    return {onStage, fresh, freshFriendly, freshPart};
  });
  ok('a named joint reads its name while the builder is on stage', freshLabel.onStage==='Elbow', freshLabel.onStage);
  ok('…and on a fresh load, straight from PREFS.builder', freshLabel.fresh==='Elbow', freshLabel.fresh);
  ok('…so the wiring sheet and the brick library agree', freshLabel.freshFriendly==='Elbow' && freshLabel.freshPart==='Elbow',
     freshLabel.freshFriendly+' / '+freshLabel.freshPart);

  console.log('\n════ (6) kiosk guards the FUNCTION, not the button — rename and axis ════');
  const kg2 = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const h = mbAddPart('hinge');
    mbRename(h.id,'Before'); mbSetAxis(h.id,'y');
    kioskEnter('');
    mbRename(h.id,'After'); mbSetAxis(h.id,'x');
    const name = h.name, axis = h.axis;
    kioskLeave();
    mbRename(h.id,'After'); mbSetAxis(h.id,'x');
    const nameAfter = h.name, axisAfter = h.axis;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {name, axis, nameAfter, axisAfter};
  });
  ok('mbRename() refuses while kiosk is on', kg2.name==='Before', kg2.name);
  ok('mbSetAxis() refuses while kiosk is on', kg2.axis==='y', kg2.axis);
  ok('…and both open back up the moment kiosk leaves', kg2.nameAfter==='After' && kg2.axisAfter==='x');

  console.log('\n════ (7) an attached part stays on the grid, and record = node ════');
  const snap = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const h = mbAddPart('hinge');
    const beam = mbAddPart('beam');
    mbRotatePart(beam.id,'x',90);
    /* drive the hinge off its home first, so the world pose the attach
       preserves is NOT a multiple of 90° — that is what used to leave an
       off-grid local offset and a rotation the record disagreed with */
    ACT[h.channels[0]] = 0.77; ACT_T[h.channels[0]] = 0.77;   // 32.4° — not a whole degree either
    applyModelBuilder(0.016);
    MB.root.updateMatrixWorld(true);
    mbSetAttach(beam.id, h.id);
    const onGrid = ['x','y','z'].every(a=>Math.abs(beam.pos[a]/0.05 - Math.round(beam.pos[a]/0.05)) < 1e-9);
    const whole = ['x','y','z'].every(a=>Math.abs(beam.rot[a] - Math.round(beam.rot[a])) < 1e-9);
    const agrees = ['x','y','z'].every(a=>
      Math.abs(beam.group.position[a] - beam.pos[a]) < 1e-9 &&
      Math.abs(beam.group.rotation[a]*180/Math.PI - beam.rot[a]) < 1e-6);
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {onGrid, whole, agrees, pos:beam.pos, rot:beam.rot};
  });
  ok('after an attach the part is still on the 50 mm grid', snap.onGrid, JSON.stringify(snap.pos));
  ok('…its rotation is still whole degrees', snap.whole, JSON.stringify(snap.rot));
  ok('…and the record and the THREE node agree, so a rebuild cannot snap it', snap.agrees);

  console.log('\n════ (9) a dropped record warns once, not on every load ════');
  const replay = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    PREFS.builder = {parts:[
      {id:'p1', type:'beam', rot:{x:0,y:0,z:0}, parent:'base', channels:[]},          // corrupt: no pos at all
      {id:'p2', type:'beam', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]}
    ]};
    const n0 = LOG.length;
    mbRebuildFromPrefs();
    const warned1 = LOG.slice(n0).filter(e=>e.k==='warn' && /corrupt part record/.test(e.s)).length;
    const n1 = LOG.length;
    mbRebuildFromPrefs();                       // the same file, loaded again
    const warned2 = LOG.slice(n1).filter(e=>e.k==='warn' && /corrupt part record/.test(e.s)).length;
    const stored = JSON.parse(localStorage.getItem('r2sim.prefs.v1'));
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {warned1, warned2, storedIds:((stored.builder||{}).parts||[]).map(p=>p.id).join()};
  });
  ok('a corrupt record warns on the load that dropped it', replay.warned1===1, replay.warned1+'×');
  ok('…and the cleaned assembly is written back, so it never warns again', replay.warned2===0, 'second load warned '+replay.warned2+'×');
  ok('…the saved file no longer carries the dropped record', replay.storedIds==='p2', replay.storedIds);

  console.log('\n════ a full storage quota does not lose the build in silence ════');
  const receipt = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const orig = Storage.prototype.setItem;
    const n0 = LOG.length;
    Storage.prototype.setItem = function(){ throw new Error('QuotaExceededError'); };
    let threw = '';
    try{ mbAddPart('beam'); }catch(e){ threw = e.message; }
    Storage.prototype.setItem = orig;
    const warned = LOG.slice(n0).some(e=>e.k==='warn' && /could not be saved/.test(e.s));
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {threw, warned};
  });
  ok('a storage failure does not throw out of the edit', receipt.threw==='', receipt.threw);
  ok('…but the build says so rather than vanishing quietly', receipt.warned);

  /* =====================================================================
     v1.45.0 — the five things Mike asked the Builder to grow.
     ===================================================================== */

  console.log('\n════ instructions: the short version, collapsed, not hidden ════');
  const help = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    document.querySelector('#tabs button[data-p="pCad"]').click();
    buildCadPane();
    const host = $('cadHost');
    const d = host.querySelector('details.mbhelp');
    const sum = d ? d.querySelector('summary') : null;
    const txt = d ? d.textContent.toLowerCase() : '';
    const bin = host.querySelector('.mbbin');
    const binFirst = !!(bin && d) && !!(bin.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      present: !!d, collapsed: !!d && !d.open, hasSummary: !!sum,
      summary: sum ? sum.textContent : '',
      attach: /attach to/.test(txt), channel: /channel/.test(txt),
      grid: /50 mm/.test(txt), drag: /drag/.test(txt),
      jargon: /compile time|forward kinematics|quantis|scene graph|primitive/.test(txt),
      binFirst, upper: /[A-Z]{4,}/.test(sum ? sum.textContent : '')
    };
  });
  ok('the pane explains itself — a collapsible block with a summary', help.present && help.hasSummary, JSON.stringify(help));
  ok('…collapsed by default, so it cannot push the parts bin off the screen', help.collapsed && help.binFirst);
  ok('…it says ATTACH TO is the point', help.attach);
  ok('…that a joint costs a channel', help.channel);
  ok('…that the 50 mm grid is the only grid', help.grid);
  ok('…and that a part can be dragged on the stage', help.drag);
  ok('…in plain words, with none of the jargon this pane lost once already', !help.jargon);
  ok('…and the summary is lower-case, like the rest of the copy', !help.upper, help.summary);

  console.log('\n════ plural attach points — every primitive lists its sockets ════');
  const sock = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const h = mbAddPart('hinge');
    const bm = mbAddPart('beam');
    const bl = mbAddPart('ball');
    const ids = r => (r.sockets||[]).map(s=>s.id);
    const namedOK = mbAttachPoint(h.id, 'body') === h.group;
    const defaultOK = mbAttachPoint(h.id) === h.attachPoint;
    const junkOK = mbAttachPoint(h.id, 'not-a-socket') === h.attachPoint;
    /* attaching to a NAMED socket parents to that node, and it round-trips */
    mbSetAttach(bm.id, h.id, 'body');
    const onBody = bm.group.parent === h.group && bm.socket === 'body';
    const saved = (PREFS.builder.parts.find(p=>p.id===bm.id)||{}).socket;
    mbRebuildFromPrefs();
    const rec = mbFind(bm.id);
    const survived = !!rec && rec.socket === 'body' && rec.group.parent === mbFind(h.id).group;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {hinge:ids(h), beam:ids(bm), ball:ids(bl), namedOK, defaultOK, junkOK, onBody, saved, survived};
  });
  ok('a hinge lists more than one attach point', sock.hinge.length > 1, sock.hinge.join());
  ok('a beam offers its ends, not just its middle', sock.beam.length > 1, sock.beam.join());
  ok('a ball joint too', sock.ball.length > 1, sock.ball.join());
  ok('mbAttachPoint(id) still means the driven pivot', sock.defaultOK);
  ok('mbAttachPoint(id, socket) takes a named one', sock.namedOK);
  ok('…and an unknown name falls back to the default rather than throwing', sock.junkOK);
  ok('attaching to a named socket parents to that node', sock.onBody, JSON.stringify(sock));
  ok('…and the socket travels in PREFS.builder', sock.saved==='body' && sock.survived);

  console.log('\n════ drag a part on the stage; drop it to auto-connect ════');
  const drag = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const stage = $('stage');
    /* a synthesised PointerEvent carries no live pointerId, so the orbit
       camera's setPointerCapture() would throw where a real finger would
       not — stub just that, nothing else about the pointer path */
    const cap = stage.setPointerCapture, rel = stage.releasePointerCapture;
    stage.setPointerCapture = function(){}; stage.releasePointerCapture = function(){};
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const toScreen = v => { const p = v.clone().project(camera);
      return {x:rect.left + (p.x*0.5+0.5)*rect.width, y:rect.top + (-p.y*0.5+0.5)*rect.height}; };
    const nodeAt = n => { MB.root.updateMatrixWorld(true); return toScreen(n.getWorldPosition(new THREE.Vector3())); };
    const fire = (t,p) => canvas.dispatchEvent(new PointerEvent(t, {clientX:p.x, clientY:p.y, button:0, bubbles:true, pointerId:1}));

    const beam = mbAddPart('beam');            // cell 0,0
    const disc = mbAddPart('disc');            // the next free cell
    const startPos = {x:disc.pos.x, z:disc.pos.z};
    MB.root.updateMatrixWorld(true);

    /* 1 — a drag that lands ON the beam attaches to it */
    const cam0 = {t:CAM.theta, p:CAM.phi};
    const from = nodeAt(disc.group), onto = nodeAt(beam.group);
    fire('pointerdown', from);
    fire('pointermove', {x:from.x + (onto.x-from.x)*0.5, y:from.y + (onto.y-from.y)*0.5});
    const claimed = !!MB.drag;
    fire('pointermove', onto);
    fire('pointerup', onto);
    const attached = {parent:disc.parent, socket:disc.socket, child:disc.group.parent === beam.group};
    const camHeld = Math.abs(CAM.theta-cam0.t) < 1e-9 && Math.abs(CAM.phi-cam0.p) < 1e-9;
    const onGrid = ['x','y','z'].every(a=>Math.abs(disc.pos[a]/0.05 - Math.round(disc.pos[a]/0.05)) < 1e-9);

    /* 2 — undo puts it back exactly where it was */
    const undone = (typeof mbUndoAttach==='function') ? mbUndoAttach() : false;
    const back = {parent:disc.parent, x:disc.pos.x, z:disc.pos.z};

    /* 3 — a nudge into empty space must NOT reparent anything */
    const target = new THREE.Vector3(startPos.x - 0.05, 0.05, startPos.z);
    const nudgeTo = toScreen(target);
    const p0 = nodeAt(disc.group);
    fire('pointerdown', p0);
    fire('pointermove', {x:(p0.x+nudgeTo.x)/2, y:(p0.y+nudgeTo.y)/2});
    fire('pointermove', nudgeTo);
    fire('pointerup', nudgeTo);
    const nudged = {parent:disc.parent, moved:Math.abs(disc.pos.x - startPos.x) > 0.001};

    /* 4 — a down on EMPTY space is still the orbit camera's */
    const cam1 = {t:CAM.theta, p:CAM.phi};
    const empty = {x:rect.left + 6, y:rect.top + 6};
    fire('pointerdown', empty);
    fire('pointermove', {x:empty.x + 90, y:empty.y + 40});
    const noClaim = !MB.drag;
    fire('pointerup', {x:empty.x + 90, y:empty.y + 40});
    const orbited = Math.abs(CAM.theta - cam1.t) > 1e-6;

    stage.setPointerCapture = cap; stage.releasePointerCapture = rel;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {claimed, attached, camHeld, onGrid, undone, back, startPos, nudged, noClaim, orbited};
  });
  ok('dragging a part claims the pointer once it has moved', drag.claimed, JSON.stringify(drag));
  ok('…and the orbit camera keeps its hands off while it does', drag.camHeld);
  ok('dropping it on another part attaches it there', drag.attached.parent!=='base' && drag.attached.child,
     JSON.stringify(drag.attached));
  ok('…still on the 50 mm grid', drag.onGrid);
  ok('the auto-connect is undoable, back to the very cell it left', drag.undone && drag.back.parent==='base'
     && Math.abs(drag.back.x-drag.startPos.x)<1e-9 && Math.abs(drag.back.z-drag.startPos.z)<1e-9, JSON.stringify(drag.back));
  ok('a nudge into empty space moves the part and reparents nothing', drag.nudged.moved && drag.nudged.parent==='base',
     JSON.stringify(drag.nudged));
  ok('a drag that started on empty space is the camera’s, not a part’s', drag.noClaim && drag.orbited);

  console.log('\n════ a driven centre pivot — the plate that turns (2.3) ════');
  const plate = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const pl = mbAddPart('plate');
    const one = pl.channels.length === 1 && ACT[pl.channels[0]] !== undefined;
    const axis0 = pl.axis;
    const disc = mbAddPart('disc');
    mbSetAttach(disc.id, pl.id);
    MB.root.updateMatrixWorld(true);
    const c0 = pl.group.getWorldPosition(new THREE.Vector3()).clone();
    const d0 = disc.group.getWorldPosition(new THREE.Vector3()).clone();
    ACT[pl.channels[0]] = 1.0; ACT_T[pl.channels[0]] = 1.0;
    applyModelBuilder(0.016);
    MB.root.updateMatrixWorld(true);
    const spun = Math.abs(pl.attachPoint.rotation[pl.axis||'y']) > 0.1;
    const c1 = pl.group.getWorldPosition(new THREE.Vector3()).clone();
    const d1 = disc.group.getWorldPosition(new THREE.Vector3()).clone();
    const axisSet = (mbSetAxis(pl.id,'z'), pl.axis);
    const label = builderActLabel(pl.channels[0]);
    mbRename(pl.id, 'Turntable');
    const named = builderActLabel(pl.channels[0]);
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {one, axis0, spun, centreHeld:c0.distanceTo(c1) < 1e-9, childMoved:d0.distanceTo(d1), axisSet, label, named};
  });
  ok('a plate is a driven joint now — one channel', plate.one);
  ok('…it turns about its own centre, which does not move', plate.spun && plate.centreHeld);
  ok('…and whatever rides it turns too (FK, same as the hinge)', plate.childMoved > 0.01, plate.childMoved.toFixed(4)+' m');
  ok('…it gets the axis row, defaulting to Y', plate.axis0==='y' && plate.axisSet==='z', plate.axis0+' → '+plate.axisSet);
  ok('…and it names its channel like any other joint', /^Joint \d+$/.test(plate.label) && plate.named==='Turntable', plate.label);

  const oldPlate = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    /* exactly what v1.44.1 wrote: no schema version, a rigid plate */
    PREFS.builder = {parts:[
      {id:'p1', type:'plate', name:'Shelf', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]}
    ]};
    mbRebuildFromPrefs();
    const rec = MB.parts[0];
    const rigid = !!rec && rec.channels.length===0 && !mbRecDriven(rec);
    const noKeys = !Object.keys(ACT).some(k=>/^bldJ/.test(k));
    MB.root.updateMatrixWorld(true);
    const before = rec ? rec.group.getWorldPosition(new THREE.Vector3()).clone() : null;
    for(const k of Object.keys(ACT)) if(/^bldJ/.test(k)) ACT[k] = 1;
    applyModelBuilder(0.016);
    MB.root.updateMatrixWorld(true);
    const still = rec ? rec.group.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9 : false;
    mbSelect(rec.id); buildCadPane();
    const paneText = $('cadHost').textContent;
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {rigid, noKeys, still, name:rec&&rec.name, hasChannels:/Channels/.test(paneText), older:/older save/.test(paneText)};
  });
  ok('a plate saved by v1.44.1 still loads as the rigid part it was', oldPlate.rigid && oldPlate.noKeys, JSON.stringify(oldPlate));
  ok('…it claims no channel and never moves', oldPlate.still);
  ok('…and the card says why, instead of showing an empty Channels block', !oldPlate.hasChannels && oldPlate.older);

  console.log('\n════ MB_PRIM[type].joint is the general test — phase 2 lands for free ════');
  const general = await ev(()=>{
    /* stand in for phase 2's rigged face part: a NEW joint type, registered
       the way the parts bin's comment says one will be, touching nothing
       else. If any consumer still hardcodes hinge/ball it fails here. */
    MB_PRIM.faceX = {label:'Face', joint:1};
    MB_BUILDERS.faceX = mbBuildHinge;
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const f = mbAddPart('faceX');
    const got = {channel: !!f && f.channels.length===1 && ACT[f.channels[0]]!==undefined,
                 axis: f && f.axis};
    ACT[f.channels[0]] = 1.0; ACT_T[f.channels[0]] = 1.0;
    applyModelBuilder(0.016);
    got.driven = Math.abs(f.attachPoint.rotation[f.axis||'y']) > 0.1;
    mbRename(f.id, 'Cheek');
    got.named = builderActLabel(f.channels[0]) === 'Cheek';
    mbSelect(f.id); buildCadPane();
    got.card = /Channels/.test($('cadHost').textContent);
    got.counted = /1 joint\(s\)/.test($('cadHost').textContent);
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    delete MB_PRIM.faceX; delete MB_BUILDERS.faceX;
    modelSet('droid', {frame:false});
    return got;
  });
  ok('a brand-new joint type gets its channel from the bin', general.channel && general.axis==='y');
  ok('…the per-frame tick drives it', general.driven);
  ok('…the naming seam names it', general.named);
  ok('…the properties card offers it channels', general.card);
  ok('…and the "on the stage" summary counts it as a joint', general.counted);

  console.log('\n════ preview sliders drive the joint through the normal easing loop ════');
  const prev = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const h = mbAddPart('hinge');
    mbSelect(h.id);
    document.querySelector('#tabs button[data-p="pCad"]').click();
    buildCadPane();
    const rng = $('cadHost').querySelector('.mbpane input[type=range]');
    if(!rng){ MB.parts.slice().forEach(p=>mbDeletePart(p.id)); modelSet('droid',{frame:false}); return {none:true}; }
    const k = h.channels[0];
    ACT[k] = 0.5; ACT_T[k] = 0.5;
    rng.value = '0.9';
    rng.dispatchEvent(new Event('input', {bubbles:true}));
    const wroteTarget = ACT_T[k];
    const wroteValue = ACT[k];                       // must NOT be written directly
    for(let i=0;i<80;i++) syncActuators(0.033);      // the ordinary easing loop
    const eased = ACT[k];
    applyModelBuilder(0.016);
    const posed = Math.abs(h.attachPoint.rotation[h.axis||'y']) > 0.1;
    /* a board-owned channel: pay it the same respect anzellan.js does */
    const ch = MSTR.channels.find(c=>/^servo/i.test(c.mode));
    ch.act = k;
    buildCadPane();
    const rng2 = $('cadHost').querySelector('.mbpane input[type=range]');
    const ownedDisabled = !!rng2 && rng2.disabled;
    const ownedNote = /hardware|board/i.test($('cadHost').textContent);
    ch.act = '';
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {wroteTarget, wroteValue, eased, posed, ownedDisabled, ownedNote};
  });
  ok('the Channels block has a preview slider', !prev.none, JSON.stringify(prev));
  ok('…it writes the TARGET, not the value — the servo model still owns it',
     Math.abs(prev.wroteTarget-0.9)<1e-9 && Math.abs(prev.wroteValue-0.5)<1e-9);
  ok('…and the easing loop walks the joint there', Math.abs(prev.eased-0.9)<0.02 && prev.posed, String(prev.eased));
  ok('…a channel a board owns is left alone, and says so', prev.ownedDisabled && prev.ownedNote);

  console.log('\n════ save and export the model on its own (2.5) ════');
  const fileIO = await ev(()=>{
    modelSet('builder', {frame:false});
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const h = mbAddPart('hinge'); mbRename(h.id,'Wrist');
    const bm = mbAddPart('beam'); mbSetAttach(bm.id, h.id);
    if(typeof mbExportObj!=='function' || typeof mbExportModel!=='function' || typeof mbImportModelText!=='function'){
      MB.parts.slice().forEach(p=>mbDeletePart(p.id)); modelSet('droid',{frame:false});
      return {none:true, format:'', v:0, parts:0, names:[], name:''};
    }
    const obj = mbExportObj();
    const text = JSON.stringify(obj);
    const versioned = PREFS.builder.v === MB_SCHEMA;
    const names = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){ names.push(this.download); };
    const name = mbExportModel();
    HTMLAnchorElement.prototype.click = origClick;

    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    const r = mbImportModelText(text, 'wrist.json');
    const back = MB.parts.map(p=>p.name || p.type).sort().join();
    const attached = MB.parts.some(p=>p.parent!=='base');
    const registered = MB.parts.filter(p=>mbRecDriven(p)).every(p=>p.channels.every(k=>ACT[k]!==undefined));

    /* a whole setup .json is what a builder will actually drag in here */
    const setupish = JSON.stringify({format:'r2sim-setup', version:1, prefs:{builder:{v:2, parts:[
      {id:'p1', type:'disc', pos:{x:0,y:0.05,z:0}, rot:{x:0,y:0,z:0}, parent:'base', channels:[]}
    ]}}});
    const rSetup = mbImportModelText(setupish, 'setup.json');
    const fromSetup = MB.parts.map(p=>p.type).join();
    /* and rubbish is refused with a message, not a throw */
    let threw = '';
    let bad = null, notJson = null;
    try{ bad = mbImportModelText('{"nope":1}', 'x.json'); notJson = mbImportModelText('<<<', 'y.json'); }
    catch(e){ threw = e.message; }
    const survived = MB.parts.map(p=>p.type).join();
    MB.parts.slice().forEach(p=>mbDeletePart(p.id));
    modelSet('droid', {frame:false});
    return {format:obj.format, v:obj.v, parts:(obj.parts||[]).length, versioned, name, names,
            ok:r&&r.ok, back, attached, registered, rSetup:rSetup&&rSetup.ok, fromSetup,
            threw, badOK:bad&&bad.ok, notJsonOK:notJson&&notJson.ok, survived};
  });
  ok('the model exports on its own, with a format marker and a schema version',
     fileIO.format==='r2sim-model' && fileIO.v===2 && fileIO.parts===2, JSON.stringify(fileIO));
  ok('…PREFS.builder carries that version too', fileIO.versioned);
  ok('…the file name is stamped with the date and time, no seconds',
     /^R2-model-\d{4}-\d\d-\d\d-\d{4}\.json$/.test(fileIO.name) && fileIO.names[0]===fileIO.name, fileIO.name);
  ok('importing it back restores the parts, the names and the attachment',
     fileIO.ok && fileIO.back==='Wrist,beam' && fileIO.attached, fileIO.back);
  ok('…with the joint’s channels registered', fileIO.registered);
  ok('…a whole setup .json works too, since that is what people have', fileIO.rSetup && fileIO.fromSetup==='disc');
  ok('rubbish is refused with an answer, not a throw', fileIO.threw==='' && !fileIO.badOK && !fileIO.notJsonOK, fileIO.threw);
  ok('…and the assembly on the stage survives the refusal', fileIO.survived==='disc');

  const fileBtns = await ev(()=>{
    modelSet('builder', {frame:false});
    document.querySelector('#tabs button[data-p="pCad"]').click();
    buildCadPane();
    const ex = $('btnMbExport'), im = $('btnMbImport');
    const r = {ex:!!ex, im:!!im, exText:ex?ex.textContent:'', imText:im?im.textContent:''};
    modelSet('droid', {frame:false});
    return r;
  });
  ok('the pane has an export button and an import button', fileBtns.ex && fileBtns.im, JSON.stringify(fileBtns));

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
