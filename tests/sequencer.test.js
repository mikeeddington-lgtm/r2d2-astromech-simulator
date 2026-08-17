/* the brick sequencer, the workspaces, and the four bugs from Mike's handoff
   -------------------------------------------------------------------------
   The block layer's whole job is to compile back down to Maestro FRAMES, so
   most of these assertions read the compiled frames rather than the DOM. */
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
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(400);

  console.log('\n════ workspaces ════');
  /* v1.17.0: the three view modes became four WORKSPACES (config/workspaces.js);
     the same spirit is asserted — navigation is gated, the gating persists,
     and hiding a pane never touches the running sketch */
  ok('four workspaces in the top bar', await ev(()=>
    WORKSPACES.length===4 && WORKSPACES.map(w=>w.id).join()==='drive,seq,config,bench' &&
    document.querySelectorAll('#viewsel .wsbtn').length===4));
  const vis = ()=>ev(()=>Array.from(document.querySelectorAll('#tabs button'))
    .filter(b=>b.style.display!=='none').map(b=>b.dataset.p));
  await ev(()=>wsSet('drive'));
  const d = await vis();
  ok('Drive is the pad, the outputs and the lessons — nothing else',
     d.join()==='pHelp,pServo,pLearn', d.join());
  await ev(()=>wsSet('config'));
  const c = await vis();
  ok('Configure is the sketch constants and the model',
     c.join()==='pCfg,pCad', c.join());
  await ev(()=>{ PREFS.adv=false; prefsSave(); wsSet('bench'); });
  const b = await vis();
  ok('Bench is the Maestro and the outputs — Serial only behind the Advanced switch',
     b.join()==='pMae,pServo' && b.indexOf('pCon')<0, b.join());
  ok('the Advanced switch lives on the Bench tab row and nowhere else', await ev(()=>{
    const onBench = !$('wsAdvWrap').hidden;
    wsSet('drive');
    const offDrive = $('wsAdvWrap').hidden;
    wsSet('bench');
    return onBench && offDrive;
  }));
  const a = await ev(()=>{
    const w=$('wsAdv'); w.checked=true; w.dispatchEvent(new Event('change'));
    return Array.from(document.querySelectorAll('#tabs button'))
      .filter(x=>x.style.display!=='none').map(x=>x.dataset.p);
  });
  ok('switching it on adds the Serial console', a.join()==='pMae,pServo,pCon' && (await ev(()=>PREFS.adv===true)), a.join());
  ok('Outputs is offered in Drive AND Bench — both activities ask it',
     d.indexOf('pServo')>=0 && b.indexOf('pServo')>=0 && a.indexOf('pServo')>=0);
  ok('switching away from an open pane does not leave a blank sidebar', await ev(()=>{
    document.querySelector('#tabs button[data-p="pCon"]').click();
    wsSet('drive');
    const act = document.querySelector('#tabs button.act');
    return act && act.style.display !== 'none' && $(act.dataset.p).style.display !== 'none';
  }));
  ok('the choice persists as ws + adv — never view', await ev(()=>{
    wsSet('bench');
    const p = JSON.parse(localStorage.getItem('r2sim.prefs.v1'));
    return p.ws==='bench' && p.adv===true && p.view===undefined;
  }));
  ok('a hidden pane changes nothing about the running sketch', await ev(()=>{
    const before = {p:PROFILE.id, hz:CFG.loopHz, foot:CFG.FOOT_CONTROLLER};
    wsSet('drive');
    const same = PROFILE.id===before.p && CFG.loopHz===before.hz && CFG.FOOT_CONTROLLER===before.foot;
    wsSet('bench');
    return same;
  }));
  await ev(()=>{ PREFS.adv=false; prefsSave(); applyWs(wsGet()); });   // the rest of the suite runs with the switch off

  console.log('\n════ save & load is a top-level control ════');
  ok('the header button opens a popover with export and import', await ev(()=>{
    saveLoadPopover();
    const t = document.querySelector('.slpop');
    const txt = t ? t.textContent : '';
    const okk = !!t && /Export setup/.test(txt) && /Import setup/.test(txt);
    saveLoadClose();
    return okk && !document.querySelector('.slpop');
  }));

  console.log('\n════ sequence mode ════');
  await ev(()=>{ makeStarter('dome'); rebuildMaestroUI(); });
  await ev(()=>setStripMode('seq'));
  await page.waitForTimeout(400);
  ok('opening it goes straight into the expanded layout', await ev(()=>
    EDIT.active && document.body.classList.contains('seqmode') && document.body.classList.contains('seqbig')));
  ok('the way out says Back to Drive', await ev(()=>/Back to Drive/i.test($('sqBig').textContent)));
  ok('…and it actually leaves sequence mode', await ev(()=>{
    $('sqBig').click();
    const out = !EDIT.active && !document.body.classList.contains('seqbig');
    setStripMode('seq');
    return out;
  }));
  ok('the pad SVG gets out of the way, so nothing is squashed', await ev(()=>
    getComputedStyle($('padstage')).display === 'none'));
  ok('the frame-editing buttons moved out of the top bar', await ev(()=>
    $('seqframebar').contains($('sqCapture')) && !$('seqtop').contains($('sqCapture'))));
  ok('three views on the same routine', await ev(()=>{
    setSeqView('table');
    const t = getComputedStyle($('seqblocks')).display==='none';
    setSeqView('blocks');
    return t && getComputedStyle($('seqblocks')).display!=='none';
  }));

  console.log('\n════ the sequence library ════');
  ok('it opens on the library, with one chip per saved sequence', await ev(()=>
    $('seqlib').querySelectorAll('.blkchip.seq').length === MSTR.sequences.length));
  ok('the Maestro pane leads with the library too', await ev(()=>{
    buildMaestroPane();
    const first = $('maeHost').querySelector('.sect h3');
    return /Sequences/.test(first.textContent);
  }));
  ok('the Maestro board picker is gone — it is a setup answer', await ev(()=>
    !/Maestro board/.test($('maeHost').textContent)));
  ok('a new routine can be started and named', await ev(()=>{
    const n = MSTR.sequences.length;
    EDIT.seq = blockNewRoutine('Test routine');
    return MSTR.sequences.length===n+1 && MSTR.sequences[EDIT.seq].name==='Test routine' && blockIsRoutine(MSTR.sequences[EDIT.seq]);
  }));

  console.log('\n════ bricks compile to Maestro frames ════');
  const one = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    seq.blocks = [];
    const b = blockAdd(seq, 'act', 'pie0', 0, {dur:1000, rise:200, fall:200});
    const c = blockChan('pie0');
    return {
      frames: seq.frames.length,
      total: seqTotal(seq),
      closed: blockClosed(c), open: blockOpen(c),
      at0:  seq.frames[0].targets[c.i],
      mid:  seq.frames.find(f=>f.name==='t200').targets[c.i],
      end:  seq.frames[seq.frames.length-1].targets[c.i],
      ch: c.i, id: b.id
    };
  });
  ok('one brick becomes a ramp-up, a hold, a ramp-down and a home frame',
     one.frames>=5 && one.mid===one.open && one.end===one.closed,
     JSON.stringify(one));
  /* A frame commands its targets and then waits, so the FIRST frame must
     already be asking for movement. It used to carry the shut pose for the
     whole of the ramp, which turned "opens in 200 ms" into "opens after
     200 ms" — the bug Mike found on the bench, 2026-08-12. */
  ok('the very first frame is already opening, not holding shut',
     one.at0 > Math.min(one.closed, one.open) && one.at0 < Math.max(one.closed, one.open),
     'first target '+one.at0+' (closed '+one.closed+', open '+one.open+')');
  ok('the routine is as long as the bricks say', one.total >= 1000, one.total+' ms');

  /* the same defect at the scale Mike hit it: a 6.1 s brick opening over
     3 s, on a channel with NO speed limit, so nothing but the frames
     themselves can shape the ramp */
  const ramp = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    seq.blocks = [];
    const c = blockChan('pie0');
    const sp = c.speed, ac = c.acceleration;
    c.speed = 0; c.acceleration = 0;                 // "no speed limit set on this channel"
    blockAdd(seq, 'act', 'pie0', 0, {dur:6100, rise:3000, fall:3000});
    /* where the compiled frames have this channel at a wall-clock instant:
       a frame's targets are reached at the END of that frame */
    const at = ms=>{
      let t = 0, v = seq.frames[0].targets[c.i];
      for(const f of seq.frames){ t += f.duration; v = f.targets[c.i] || v; if(t >= ms) break; }
      return v;
    };
    const out = {closed:blockClosed(c), open:blockOpen(c),
                 t500:at(500), t1500:at(1500), t3000:at(3000), t4600:at(4600), t6100:at(6100),
                 frames:seq.frames.length};
    c.speed = sp; c.acceleration = ac;
    /* put the routine back the way the next tests expect to find it */
    seq.blocks = [];
    blockAdd(seq, 'act', 'pie0', 0, {dur:1000, rise:200, fall:200});
    return out;
  });
  const span = ramp.open - ramp.closed;
  ok('a 3 s "opens in" ramps for three seconds instead of waiting three seconds',
     Math.abs(ramp.t1500 - (ramp.closed + span/2)) < Math.abs(span)*0.1,
     'half way at 1.5 s: '+ramp.t1500+' (want ~'+Math.round(ramp.closed+span/2)+') — '+JSON.stringify(ramp));
  ok('…moving from the very start, fully open exactly when the ramp ends',
     Math.abs(ramp.t500 - (ramp.closed + span/6)) < Math.abs(span)*0.1 && ramp.t3000===ramp.open,
     'at 0.5 s '+ramp.t500+', at 3.0 s '+ramp.t3000);
  ok('…and closes over the last three seconds, shut on the brick\'s right edge',
     Math.abs(ramp.t4600 - (ramp.closed + span/2)) < Math.abs(span)*0.1 && ramp.t6100===ramp.closed,
     'at 4.6 s '+ramp.t4600+', at 6.1 s '+ramp.t6100);

  const two = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    blockAdd(seq, 'act', 'pie1', 500, {dur:1000});
    return {lanes:blockLanes(seq).length, end:blockEnd(seq), frames:seq.frames.length};
  });
  ok('a second part makes its own lane', two.lanes===3, JSON.stringify(two));
  ok('overlapping bricks both survive into the frames', two.end===1500 && two.frames>5);

  console.log('\n════ per-brick speeds are per-instance ════');
  const speeds = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const a = blockList(seq)[0], b2 = blockList(seq)[1];
    a.rise = 600; blockSync(seq);
    return {aRise:a.rise, bRise:b2.rise, def:BLK_DEFAULTS.rise};
  });
  ok('changing one brick\'s opening speed leaves the other alone',
     speeds.aRise===600 && speeds.bRise===speeds.def, JSON.stringify(speeds));
  ok('…and leaves the library action untouched', await ev(()=>{
    const lib = blockActions().find(x=>x.act==='pie0');
    return lib && lib.rise === undefined;      // the library has no speed at all
  }));
  ok('a longer opening speed really does open more slowly', await ev(()=>{
    /* the value the compiler produces PART WAY through the ramp is the whole
       point of the per-brick speed, so measure it directly */
    const seq = MSTR.sequences[EDIT.seq];
    const a = blockList(seq)[0];
    const c = blockChan(a.ref);
    const span = blockOpen(c) - blockClosed(c);
    a.rise = 600; blockSync(seq);
    const slow = blockValueAt(a, a.t0 + 300);
    a.rise = 100; blockSync(seq);
    const fast = blockValueAt(a, a.t0 + 300);
    a.rise = 600; blockSync(seq);
    /* half way at 600 ms, already fully open at 100 ms */
    return Math.abs(slow - (blockClosed(c)+span/2)) < Math.abs(span)*0.12
        && fast === blockOpen(c);
  }));

  console.log('\n════ ready-made shapes ════');
  const wave = await ev(()=>{
    EDIT.seq = blockNewRoutine('Wave test');
    const seq = MSTR.sequences[EDIT.seq];
    const g = blockGroups().find(x=>x.id==='all-pies');
    blockMakeShape(seq, 'wave', g.members);
    const t0s = blockList(seq).map(b=>b.t0);
    return {n:blockList(seq).length, t0s, rising:t0s.every((v,i)=>i===0||v>t0s[i-1]), frames:seq.frames.length};
  });
  ok('a wave staggers every part in turn', wave.rising && wave.n>=5, JSON.stringify(wave.t0s));
  ok('…and compiles to real frames', wave.frames > wave.n);

  console.log('\n════ dropping a whole sequence in ════');
  const nest = await ev(()=>{
    EDIT.seq = blockNewRoutine('Nested');
    const seq = MSTR.sequences[EDIT.seq];
    const src = MSTR.sequences.find(s=>s.name==='Wave test');
    blockAdd(seq, 'seq', src.name, 0);
    const first = blockList(seq)[0];
    blockAdd(seq, 'seq', src.name, first.t0 + first.dur);   // appended, Lego-style
    return {n:blockList(seq).length, lane:blockList(seq).every(b=>b.kind==='seq'),
            gap: blockList(seq)[1].t0 - (blockList(seq)[0].t0+blockList(seq)[0].dur),
            frames: seq.frames.length};
  });
  ok('two routines append end to end like bricks', nest.n===2 && nest.gap===0, JSON.stringify(nest));
  ok('the nested routine contributes its own frames', nest.frames > 4);

  console.log('\n════ saving back to the library ════');
  ok('save under a name adds it to the library', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const n = MSTR.sequences.length;
    blockSaveAs(seq, 'Saved routine');
    return MSTR.sequences.length===n+1 && MSTR.sequences.some(s=>s.name==='Saved routine');
  }));
  ok('the saved copy keeps its bricks, so it can be edited again', await ev(()=>{
    const s = MSTR.sequences.find(x=>x.name==='Saved routine');
    return blockIsRoutine(s) && s.blocks.length===2 && s.frames.length>0;
  }));
  ok('saving over the same name replaces rather than duplicates', await ev(()=>{
    const n = MSTR.sequences.filter(s=>s.name==='Saved routine').length;
    blockSaveAs(MSTR.sequences[EDIT.seq], 'Saved routine');
    return n===1 && MSTR.sequences.filter(s=>s.name==='Saved routine').length===1;
  }));
  ok('it exports in the .mstr like any other sequence', await ev(()=>
    /Saved_routine|Saved routine/.test(buildMstrText())));

  console.log('\n════ an empty routine still emits a frame ════');
  ok('so the subroutine numbering cannot drift', await ev(()=>{
    const i = blockNewRoutine('Empty');
    return MSTR.sequences[i].frames.length===1;
  }));

  console.log('\n════ hand-made frame lists are left alone ════');
  ok('an imported sequence keeps its frames until you adopt it', await ev(()=>{
    const s = {name:'Hand made', frames:[{name:'a',duration:500,targets:[]}]};
    MSTR.sequences.push(s);
    return !blockIsRoutine(s) && blockCompile(s).length===1;
  }));

  console.log('\n════ the four reported defects ════');
  ok('light mode: the stage buttons take a light plate', await ev(()=>{
    applyTheme('light');
    const bg = getComputedStyle($('btnTrack')).backgroundColor;
    const fg = getComputedStyle($('btnTrack')).color;
    const lum = c=>{ const m=c.match(/[\d.]+/g).map(Number); return (0.299*m[0]+0.587*m[1]+0.114*m[2])/255; };
    const good = lum(bg) > 0.6 && lum(fg) < 0.4;      // dark text on a light plate
    applyTheme('dark');
    return good;
  }));
  ok('the wiring sheet lists BOTH configured boards', await ev(()=>{
    const r = wiringRows().filter(x=>x.board);
    return r.some(x=>/dome/.test(x.board)) && r.some(x=>/body/.test(x.board));
  }));
  ok('the setup calls it a Controller board, with Arduino inside', await ev(()=>
    BUILD_STEPS.find(s=>s.key==='arduino').title==='Controller board' &&
    BUILD_OPTIONS.arduino.some(o=>/Mega/.test(o.label))));
  ok('the firmware step links the repo and the file for every sketch', await ev(()=>
    BUILD_OPTIONS.firmware.every(o=>/^https:\/\/github\.com\//.test(o.repo) && /\.ino$/.test(o.file))));
  ok('…and shows the link for the one you chose', await ev(()=>{
    /* v1.37.0 — one row, not three. Mike: "when a user selects which
       firmware only then should it provide a link to the correct firmware
       only others should be hidden." */
    wizOpen(wizStepIndex('firmware'));
    const links = Array.from($('startupBody').querySelectorAll('a.lnk'));
    const want = BUILD_OPTIONS.firmware.find(o=>o.id===buildGet().firmware);
    closeStartup();
    return links.length === 1 && !!want && links[0].href === want.repo;
  }));
  ok('panels can be renamed where they are assigned', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    const inp = $('startupBody').querySelector('.asname');
    if(!inp) return false;
    inp.value = 'left cheek panel';
    inp.dispatchEvent(new Event('change'));
    const renamed = Object.values(PARTS.overrides).some(o=>o.label==='left cheek panel');
    closeStartup();
    return renamed;
  }));
  ok('the scene step is scenes only', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_scene'));
    const t = $('startupBody').textContent;
    const cards = $('startupBody').querySelectorAll('.optcard').length;
    closeStartup();
    return cards===4 && !/Teach me to operate/.test(t) && !/Practice track/.test(t);
  }));

  console.log('\n════ every part has its own colour ════');
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  await ev(()=>{ setBoard('mini24'); makeStarter('dome','mini24'); setStripMode('seq'); });
  await page.waitForTimeout(300);
  ok('neighbouring parts never share a colour', await ev(()=>{
    const a = blockActions().slice(0,8).map(x=>blkColor(x.act));
    return new Set(a).size === a.length;
  }));
  ok('the colour is stable — asking twice gives the same answer', await ev(()=>{
    const a = blockActions()[0].act;
    return blkColor(a) === blkColor(a);
  }));
  ok('a brick wears its part’s colour', await ev(()=>{
    /* the starters are hand-made frame lists — adopt one so the brick pane,
       and with it the part library, actually builds */
    const seq = MSTR.sequences[EDIT.seq];
    blockAdopt(seq); seq.blocks = [];
    const act = blockActions()[2].act;
    blockAdd(seq, 'act', act, 0);
    buildSequencer();
    const b = document.querySelector('.blkbrick.pc');
    return b && b.style.getPropertyValue('--pc') === blkColor(act);
  }));
  ok('every part chip is painted', await ev(()=>{
    const c = document.querySelectorAll('#seqblocks .blkchip.pc');
    return c.length === blockActions().length &&
      Array.from(c).every(x=>/^#/.test(x.style.getPropertyValue('--pc')));
  }));
  ok('and so does its lane', await ev(()=>{
    const l = document.querySelector('.blklane.pc');
    return l && /^#/.test(l.style.getPropertyValue('--pc'));
  }));
  ok('a hand-picked colour wins and is remembered', await ev(()=>{
    const act = blockActions()[2].act;
    blkSetColor(act, '#ff00aa');
    const saved = JSON.parse(localStorage.getItem('r2sim.prefs.v1')).blkColors || {};
    const won = blkColor(act) === '#ff00aa' && saved[act] === '#ff00aa';
    blkSetColor(act, null);
    return won && blkColor(act) !== '#ff00aa';
  }));

  console.log('\n════ the model can wear the sequencer colours ════');
  ok('switching the tint on repaints the actuated parts', await ev(()=>{
    const m = CAD.moving.find(x=>x.act && MSTR.channels.some(c=>c.act===x.act));
    const before = effectivePartHex(m.name);
    BLK.tint = true; applyPaint();
    const on = effectivePartHex(m.name);
    return on === blkColor(m.act) && on !== before;
  }));
  ok('nothing was written to the part overrides', await ev(()=>{
    const m = CAD.moving.find(x=>x.act && MSTR.channels.some(c=>c.act===x.act));
    return !(PARTS.overrides[m.name] && PARTS.overrides[m.name].color);
  }));
  ok('switching it off puts the paint scheme straight back', await ev(()=>{
    const m = CAD.moving.find(x=>x.act && MSTR.channels.some(c=>c.act===x.act));
    const tinted = effectivePartHex(m.name);
    BLK.tint = false; applyPaint();
    return effectivePartHex(m.name) !== tinted;
  }));

  console.log('\n════ the timeline zoom is a view setting ════');
  ok('the toolbar is there', await ev(()=>
    !!document.querySelector('#seqblocks .blktools input[type=range]')));
  const zoom = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const timings = JSON.stringify(blockList(seq).map(b=>[b.t0,b.dur]));
    const frames  = JSON.stringify(seq.frames);
    const w0 = document.querySelector('.blkbrick').style.width;
    BLK.pxms = 0.45; blkZoomApply();
    const w1 = document.querySelector('.blkbrick').style.width;
    BLK.pxms = 0.14; blkZoomApply();
    return {wider: parseFloat(w1) > parseFloat(w0)*2,
            timings: timings === JSON.stringify(blockList(seq).map(b=>[b.t0,b.dur])),
            frames: frames === JSON.stringify(seq.frames),
            back: document.querySelector('.blkbrick').style.width === w0};
  });
  ok('zooming in stretches the bricks', zoom.wider);
  ok('and changes no timing', zoom.timings);
  ok('and recompiles no frame', zoom.frames);
  ok('and goes back exactly', zoom.back);
  ok('selecting a brick points the camera at its part', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    BLK.sel = b.id; BLK.cam = 0.7;
    const m = CAD.moving.find(x=>x.act === b.ref);
    if(!m) return true;                       // no CAD part for that channel
    blkFocusApply(true);
    const p = partWorldPos(m.name);
    return Math.abs(CAM.dist-0.7) < 1e-6 && CAM.target.distanceTo(p) < 1e-4;
  }));

  console.log('\n════ the sequencer does not write the Maestro script ════');
  const lo = await ev(()=>{
    const before = MSTR.scriptText;
    const i = blockNewRoutine('Bench routine');
    EDIT.seq = i; BLK.sel = null;
    const seq = MSTR.sequences[i];
    blockAdd(seq, 'act', blockActions()[0].act, 0);
    blockSaveAs(seq, 'Bench routine');
    return {inLibrary: MSTR.sequences.some(s=>s.name==='Bench routine'),
            inScript: /Bench_routine/.test(MSTR.scriptText),
            inMstr:   /Bench_routine/.test(buildMstrText()),
            inXml:    /<Sequence name="Bench routine"/.test(buildMstrText()),
            scriptUntouched: MSTR.scriptText === before,
            subs: MSTR.subs.filter(s=>s.kind==='sequence').length};
  });
  ok('a routine saved in the sequencer joins the library', lo.inLibrary);
  ok('but not the script', !lo.inScript && lo.scriptUntouched);
  ok('the .mstr still carries it as a sequence for Control Center', lo.inXml);
  ok('and gives it no subroutine', !lo.inMstr && lo.subs===8, lo.subs+' subs');
  ok('the sequence chip shows it is not loaded', await ev(()=>{
    buildSequencer();
    return Array.from(document.querySelectorAll('#seqlib .blkchip.seq'))
      .some(c=>c.classList.contains('off') && c.textContent==='Bench routine');
  }));

  console.log('\n════ the loadout is the separate, deliberate step ════');
  ok('loading it onto the board gives it the next subroutine', await ev(()=>{
    loadoutAdd('Bench routine');
    return loadoutIndex('Bench routine')===8 && /Bench_routine/.test(MSTR.scriptText);
  }));
  ok('moving it up renumbers the subroutines', await ev(()=>{
    loadoutMove('Bench routine', -1);
    return loadoutIndex('Bench routine')===7 &&
      MSTR.subs.filter(s=>s.kind==='sequence')[7].name==='Bench_routine';
  }));
  ok('taking it off the board leaves it in the library', await ev(()=>{
    loadoutDrop('Bench routine');
    return loadoutIndex('Bench routine')<0 &&
      MSTR.sequences.some(s=>s.name==='Bench routine') &&
      !/Bench_routine/.test(MSTR.scriptText);
  }));
  ok('renaming a loaded sequence keeps it loaded', await ev(()=>{
    const n = loadoutNames()[0];
    loadoutRename(n, n+' v2');
    MSTR.sequences.find(s=>s.name===n).name = n+' v2';
    reindexSubs();
    const okk = loadoutIndex(n+' v2')===0;
    loadoutRename(n+' v2', n);
    MSTR.sequences.find(s=>s.name===n+' v2').name = n;
    reindexSubs();
    return okk;
  }));
  ok('the Maestro pane lists the loadout in order', await ev(()=>{
    document.querySelector('#tabs button[data-p="pMae"]').click();
    buildMaestroPane();
    const rows = Array.from(document.querySelectorAll('.ldrow .nm')).map(x=>x.textContent);
    return rows.length===loadoutNames().length && rows.join('|')===loadoutNames().join('|');
  }));
  ok('"Load everything" puts the whole library on the board', await ev(()=>{
    loadoutReset(); reindexSubs();
    return loadoutNames().length===MSTR.sequences.length;
  }));

  console.log('\n════ how a part moves — the advanced editor ════');
  const mv = await ev(()=>{
    const m = CAD.moving.find(x=>x.rig.mode==='hinge' && x.act);
    selectPart(m.name); SEL.adv = true; buildSelCard();
    const opened = !!document.querySelector('#selcard .seladv');
    const kinds  = document.querySelectorAll('#selcard .seladv select').length;
    const world = ()=>{ CAD.body.updateMatrixWorld(true); CAD.dome.updateMatrixWorld(true);
      return m.mesh.localToWorld(new THREE.Vector3(0,0,0)).toArray().map(v=>+v.toFixed(4)).join(); };
    ACT[m.act]=0; applyCadActuators(); const shut = world();
    setPartMotion(m.name, {kind:'slide_y', pivot:'bottom', amount:12});
    ACT[m.act]=0; applyCadActuators(); const shutAfter = world();
    ACT[m.act]=1; applyCadActuators();
    CAD.body.updateMatrixWorld(true); CAD.dome.updateMatrixWorld(true);
    const lift = m.mesh.localToWorld(new THREE.Vector3(0,0,0)).y - m.rig0.pivot[1] - CAD.yOffset;
    const mode = m.rig.mode, range = m.rig.range;
    const saved = (JSON.parse(localStorage.getItem('r2sim.prefs.v1')).parts.overrides[m.name]||{}).motion;
    setPartMotion(m.name, null);
    ACT[m.act]=0; applyCadActuators(); const restored = world();
    return {opened, kinds, mode, range:+range.toFixed(4), lift:+lift.toFixed(3),
            shutSame: shut===shutAfter, restored: restored===shut,
            saved, rigBack:m.rig.mode, cleared:!partMotion(m.name)};
  });
  ok('the popup has an Advanced section for a moving part', mv.opened);
  ok('it offers a motion and a pivot', mv.kinds===2, mv.kinds+' dropdowns');
  ok('a hinge can be made a slide', mv.mode==='slide' && mv.range===0.12, mv.mode+' '+mv.range);
  ok('changing the pivot does not move the part when it is shut', mv.shutSame);
  ok('the slider decides how far it travels', Math.abs(mv.lift-0.12)<0.002, mv.lift+'m');
  ok('the override is saved with the labels and colours', mv.saved && mv.saved.amount===12);
  ok('"CAD rig" throws the override away', mv.cleared && mv.rigBack==='hinge' && mv.restored);
  ok('a static part gets no Advanced section', await ev(()=>{
    const stat = Object.keys(CAD.partIndex).find(n=>!CAD.moving.some(m=>m.name===n));
    selectPart(stat); SEL.adv = true; buildSelCard();
    const none = !document.querySelector('#selcard .seladv');
    deselectPart(); SEL.adv = false;
    return none;
  }));

  /* ================================================================
     v1.39.3 — Mike: "pressing play on the sequencer doesnt appear to
     do anything." The desk opened to PCA9685 builds in v1.27.0; the
     CLOCK that steps a preview stayed behind `PROFILE.hasMaestro` in
     main.js, so Play armed a slot nothing ever stepped.
     ================================================================ */
  console.log('\n════ Play runs on a build with no Pololu Maestro ════');
  const wasProfile = await ev(()=>PROFILE.id);
  ok('mod2026 really is a no-Maestro profile — otherwise this proves nothing', await ev(()=>{
    loadProfile('mod2026');
    return PROFILE.hasMaestro === false && buildCanSequence() === true;
  }));
  await ev(()=>{
    /* a rear door: under mod2026 the PCA9685 layer owns the pies and the
       front doors, and a part it drives every loop would mask the preview */
    const ch = MSTR.channels.find(c=>c && /^servo/i.test(c.mode));
    ch.act = 'doorRL';
    ACT_T.doorRL = 0;
    seqStart('edit', [
      {name:'open',  duration:90, targets:(()=>{const t=[];t[ch.i]=Math.max(ch.min,ch.max);return t;})()},
      /* the last frame is the MIDPOINT, not the shut end: a target of min
         normalises to 0, and "did it move?" cannot be asked of a 0 that is
         also the value it started at */
      {name:'half',  duration:90, targets:(()=>{const t=[];t[ch.i]=(Math.min(ch.min,ch.max)+Math.max(ch.min,ch.max))>>1;return t;})()}
    ], 'clock test');
  });
  const ran = await page.waitForFunction('!MAESTRO.slot.edit', {timeout:6000}).then(()=>true,()=>false);
  ok('the preview slot is stepped and runs to the end', ran);
  /* no `|| something-always-true` fallback here: this assertion has to be
     able to fail, and it does — with the old gate the target never arrives */
  ok('...and the frame reached the model on the way through', await ev(()=>
    ACT_T.doorRL > 0));
  await ev(id=>{ delete MAESTRO.slot.edit; loadProfile(id); }, wasProfile);

  /* ================================================================
     v1.40.0 — Mike, 2026-08-14: "clicking a panel brick should offer:
     Opens then closes / just Opens / just Closes / Closes then opens".
     b.mode drives blockValueAt's shape; absent means 'oc', unchanged.
     ================================================================ */
  console.log('\n════ per-brick MOTION modes ════');
  /* NOT hardcoded to 'pie0': the "no Pololu Maestro" section just above
     reassigned one real channel's .act to 'doorRL', which can steal
     whichever actuator happened to be on that channel — blockActions()[0]
     is whatever is actually mapped right now, same defensive style the
     "every part has its own colour" section already uses further up. */
  const modeShapes = await ev(()=>{
    const act = blockActions()[0].act;
    const c = blockChan(act);
    const closed = blockClosed(c), open = blockOpen(c);
    const mk = mode => ({id:9001, kind:'act', ref:act, t0:0, dur:600, rise:200, fall:200, mode});
    const sample = (b, ...ts) => ts.map(lt=>blockValueAt(b, b.t0+lt));
    return {
      closed, open,
      o:  sample(mk('o'),  0,100,200,300,600),
      c:  sample(mk('c'),  0,100,200,300,600),
      co: sample(mk('co'), 0,100,200,300,400,500,600)
    };
  });
  {
    const {closed, open} = modeShapes;
    const mid = (closed+open)/2, tol = Math.abs(open-closed)*0.15;
    const near = (v,want)=>Math.abs(v-want) <= tol;
    ok("mode 'o': opens over rise, then holds open to the brick's own end — never falls",
       modeShapes.o[0]===closed && near(modeShapes.o[1],mid) &&
       modeShapes.o[2]===open && modeShapes.o[3]===open && modeShapes.o[4]===open,
       JSON.stringify(modeShapes.o)+' closed='+closed+' open='+open);
    ok("mode 'c': starts open (asserts the part starts that way), falls, then holds shut",
       modeShapes.c[0]===open && near(modeShapes.c[1],mid) &&
       modeShapes.c[2]===closed && modeShapes.c[3]===closed && modeShapes.c[4]===closed,
       JSON.stringify(modeShapes.c));
    ok("mode 'co': falls from open at the start, holds shut, then rises to open exactly at dur",
       modeShapes.co[0]===open && near(modeShapes.co[1],mid) &&
       modeShapes.co[2]===closed && modeShapes.co[3]===closed && modeShapes.co[4]===closed &&
       near(modeShapes.co[5],mid) && modeShapes.co[6]===open,
       JSON.stringify(modeShapes.co));
  }

  console.log('\n════ …and blockCompile carries it — \'o\' stays open past the brick ════');
  const carry = await ev(()=>{
    EDIT.seq = blockNewRoutine('Mode carry test');
    const seq = MSTR.sequences[EDIT.seq];
    const acts = blockActions();
    const act0 = acts[0].act, act1 = acts[1].act;
    const c = blockChan(act0);
    blockAdd(seq, 'act', act0, 0, {dur:600, rise:200, fall:200, mode:'o'});
    blockAdd(seq, 'act', act1, 1000, {dur:400});   // a later brick on ANOTHER channel — just to add a boundary well past 600
    const at = ms=>{
      let t = 0, v = seq.frames[0].targets[c.i];
      for(const f of seq.frames){ t += f.duration; v = f.targets[c.i] || v; if(t >= ms) break; }
      return v;
    };
    return {closed:blockClosed(c), open:blockOpen(c), at600:at(600), at700:at(700), at999:at(999), frames:seq.frames.length};
  });
  ok("an 'o' brick's channel is still open long after the brick's own [t0,t0+dur] window — nothing resets it to closed",
     carry.at600===carry.open && carry.at700===carry.open && carry.at999===carry.open,
     JSON.stringify(carry));

  /* the 'oc' compile-identical proof (Mike's "prove it") lives in a node
     harness outside this Playwright suite — see the handover; it diffs
     blockCompile's frames for an 'oc'-only routine before and after the
     carry-forward change and finds them byte-for-byte the same. This
     assertion is the in-app corroboration: an 'oc'-only routine still
     lands on base-closed the moment nothing covers a channel. */
  console.log('\n════ …and an \'oc\'-only routine still resets to closed when uncovered ════');
  const ocCarry = await ev(()=>{
    EDIT.seq = blockNewRoutine('OC carry check');
    const seq = MSTR.sequences[EDIT.seq];
    const acts = blockActions();
    const act0 = acts[0].act, act1 = acts[1].act;
    const c = blockChan(act0);
    blockAdd(seq, 'act', act0, 0, {dur:600, rise:200, fall:200});     // default 'oc'
    blockAdd(seq, 'act', act1, 1000, {dur:400});
    const at = ms=>{
      let t = 0, v = seq.frames[0].targets[c.i];
      for(const f of seq.frames){ t += f.duration; v = f.targets[c.i] || v; if(t >= ms) break; }
      return v;
    };
    return {closed:blockClosed(c), at700:at(700), at999:at(999)};
  });
  ok("an 'oc' brick's channel is back at closed once it is no longer covered — unaffected by the carry",
     ocCarry.at700===ocCarry.closed && ocCarry.at999===ocCarry.closed, JSON.stringify(ocCarry));

  /* ================================================================
     v1.40.0 — Mike: "imported routines when placed on the timeline
     should be expanded into each servo's block so they can be edited,
     not just a single block."
     ================================================================ */
  console.log('\n════ EXPLODE a dropped-in sequence into per-channel bricks ════');
  const explode = await ev(()=>{
    const acts = blockActions();
    const act0 = acts[0].act, act1 = acts[1].act;
    const c0 = blockChan(act0), c1 = blockChan(act1);
    const closed0 = blockClosed(c0), open0 = blockOpen(c0);
    const closed1 = blockClosed(c1), open1 = blockOpen(c1);
    /* a third servo channel, temporarily unmapped, to prove the leftover
       count — "channels with activity but no act cannot become bricks" */
    const bare = MSTR.channels.find(ch=>ch && /^servo/i.test(ch.mode) && ch!==c0 && ch!==c1);
    const savedAct = bare.act;
    bare.act = '';
    const closedB = blockClosed(bare), openB = blockOpen(bare);

    const synth = { name:'Explode source', frames:[
      {name:'a', duration:300, targets:(()=>{ const t=[];
        t[c0.i] = Math.round(closed0 + (open0-closed0)*0.5);
        t[bare.i] = Math.round(closedB + (openB-closedB)*0.7);
        return t; })()},
      {name:'b', duration:200, targets:(()=>{ const t=[]; t[c0.i] = open0; return t; })()},
      {name:'c', duration:400, targets:(()=>{ const t=[];
        t[c0.i] = open0;
        t[c1.i] = Math.round(closed1 + (open1-closed1)*0.6);
        return t; })()},
      {name:'d', duration:200, targets:(()=>{ const t=[]; t[c0.i] = closed0; return t; })()}
      /* pie1 and the bare channel are NEVER reset — both are still above
         the ~0 threshold when this source sequence ends */
    ]};
    MSTR.sequences.push(synth);

    const exp = blockExplode('Explode source', 500);   // dropped at 500 ms
    bare.act = savedAct;                                // restore what we borrowed
    const b0 = exp.bricks.find(b=>b.ref===act0);
    const b1 = exp.bricks.find(b=>b.ref===act1);

    /* the returned specs really are brick material — blockAdd takes them
       as-is and they compile like any other brick */
    const rt = MSTR.sequences[blockNewRoutine('Exploded, for real')];
    const added = b0 && blockAdd(rt, 'act', b0.ref, b0.t0, {dur:b0.dur, rise:b0.rise, fall:b0.fall, amp:b0.amp, mode:b0.mode});
    const compiles = !!added && rt.frames.length > 1;

    return {
      n: exp.bricks.length, leftover: exp.leftover,
      b0, b1, compiles
    };
  });
  ok('one brick per channel WITH a part — the bare channel is not one of them',
     explode.n===2 && !!explode.b0 && !!explode.b1, JSON.stringify(explode));
  ok('the unmapped-but-active channel is counted as a leftover, not silently dropped',
     explode.leftover===1, 'leftover='+explode.leftover);
  ok("pie0's brick starts ~30 ms after the drop point (500), amp omitted (it reaches full open) and ends closed ('oc')",
     Math.abs(explode.b0.t0 - 530) < 60 && explode.b0.amp===undefined && explode.b0.mode===undefined,
     JSON.stringify(explode.b0));
  ok("pie0's rise/fall land near where the source actually ramped (≈470 ms up, ≈190 ms down)",
     Math.abs(explode.b0.rise - 470) < 80 && Math.abs(explode.b0.fall - 190) < 80,
     JSON.stringify(explode.b0));
  ok("pie1's brick carries its partial amp (~0.6) and mode 'o' — it is still open when the source ends",
     Math.abs(explode.b1.amp - 0.6) < 0.05 && explode.b1.mode==='o',
     JSON.stringify(explode.b1));
  ok('exploded bricks are real bricks — blockAdd accepts them and they compile',
     explode.compiles);

  /* ================================================================
     2.6 — every blockExplode test above (this one and the multi-select
     UI suite's) fed it either a HAND-AUTHORED synth sequence or a
     straight import — never a sequence that was itself COMPILED from
     mode bricks (blockCompile via blockSync) and saved to the library,
     the exact path a real "Save" takes (blockSaveAs, blocks.js — frames
     are seq.frames, i.e. blockCompile's own output, copied verbatim).
     That matters: blockCompile's zero-baseline carry has to survive
     many short ramp-stepped frames here, not the hand-built test's
     two or three.

     It also surfaces a real, worth-pinning-down fact rather than the
     naive assumption: blockCompile ALWAYS appends a closing 'home'
     frame (blocks.js, "land on the home pose so the close is real and
     not a delta artefact"), UNCONDITIONALLY — regardless of what mode
     the routine's own bricks end on. So an 'o'-mode brick (opens,
     holds, never falls) that is the last thing on its channel does
     NOT come back out of blockExplode as mode:'o' once it has made the
     round trip through the library: it comes back as an ordinary
     close, because the ROUTINE itself really does return home when it
     finishes — that is correct, not a bug. blockExplode is reading
     exactly what is really in ref.frames, and asserting mode==='o'
     here would be asserting something false of the data (contrast the
     hand-authored "Explode source" sequence above, which never resets
     pie1, and correctly explodes it as mode:'o' — the two cases differ
     because the SOURCE differs, not because blockExplode is
     inconsistent). The checks below are the ones a real regression
     WOULD break: the span survives the longer carry at all, amp is
     recovered off the back of it, no second/fabricated span appears
     for the home frame's own close, and that close is reported as a
     close — not fabricated as "still open", a real risk given the
     home frame's brief 200 ms ramp sits right at blockExplode's own
     near-max/epsilon thresholds. */
  console.log('\n════ EXPLODE fed a sequence that was itself compiled from a mode brick (2.6) ════');
  const explodeRoutine = await ev(()=>{
    EDIT.seq = blockNewRoutine('Compiled o-mode source');
    const seq = MSTR.sequences[EDIT.seq];
    const act = blockActions()[0].act;
    const brick = blockAdd(seq, 'act', act, 0, {dur:900, rise:300, mode:'o', amp:0.6});
    const saved = blockSaveAs(seq, 'Compiled o-mode source (saved)');
    const exp = blockExplode('Compiled o-mode source (saved)', 0);
    return {act, brick, exp, framesN: saved.frames.length};
  });
  ok('the library copy really is blockCompile output — several ramp-stepped frames, not a hand-built two or three',
     explodeRoutine.framesN >= 5, 'framesN='+explodeRoutine.framesN);
  ok('the span for that channel is detected exactly once — no fabricated extra spans',
     explodeRoutine.exp.bricks.length===1 && explodeRoutine.exp.bricks[0].ref===explodeRoutine.act && explodeRoutine.exp.leftover===0,
     JSON.stringify(explodeRoutine.exp));
  ok("amp survives the zero-baseline carry across the compiled frame list (~0.6, the brick's own amp)",
     Math.abs(explodeRoutine.exp.bricks[0].amp - 0.6) < 0.05, JSON.stringify(explodeRoutine.exp.bricks[0]));
  ok("t0/rise land near where the source brick actually opened (t0≈0, rise≈300)",
     explodeRoutine.exp.bricks[0].t0 < 80 && Math.abs(explodeRoutine.exp.bricks[0].rise - 300) < 80,
     JSON.stringify(explodeRoutine.exp.bricks[0]));
  ok("mode 'o' is NOT fabricated — the routine really does return home when it ends (blockCompile's own "
     +"unconditional closing frame), so the honest extraction reports a real fall, not an invented \"still open\"",
     explodeRoutine.exp.bricks[0].mode===undefined && explodeRoutine.exp.bricks[0].fall > 100,
     JSON.stringify(explodeRoutine.exp.bricks[0]));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
