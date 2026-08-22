const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForTimeout(1800);
  const ev = (f,a) => page.evaluate(f,a);
  const hold = o => page.evaluate(o=>{Object.assign(INPUT.virtual.btn,o.btn||{});if(o.ax)Object.assign(INPUT.virtual,o.ax);},o);
  const clr  = () => page.evaluate(()=>{BTN_NAMES.forEach(n=>INPUT.virtual.btn[n]=0);});
  /* headless software rendering advances SIM.millis slower than wall clock,
     so wait for the playback slot to actually drain rather than guessing a delay */
  const drain = async (slot, capMs=90000)=>{
    const t0=Date.now();
    while(Date.now()-t0 < capMs){
      if(await page.evaluate(s=>!MAESTRO.slot[s], slot)) return true;
      await page.waitForTimeout(120);
    }
    return false;
  };

  await ev(()=>{loadProfile('maestro25');buildFwSelector();});
  await page.waitForTimeout(400);

  console.log('\n════ frame subroutine naming (SDK algorithm) ════');
  const names = await ev(()=>[
    frameSubName([1]), frameSubName([2,3]), frameSubName([4,5,6]),
    frameSubName([1,3,4,6,7,8]), frameSubName([0]), frameSubName([0,1,2,3,4])
  ]);
  ok('frame_1 / frame_2_3 / frame_4..6', names[0]==='frame_1'&&names[1]==='frame_2_3'&&names[2]==='frame_4..6', names.slice(0,3).join(' '));
  ok('the SDK\'s own documented example frame_1_3_4_6..8', names[3]==='frame_1_3_4_6..8', names[3]);
  ok('single and long runs', names[4]==='frame_0'&&names[5]==='frame_0..4', names[4]+' '+names[5]);
  const rt = await ev(()=>['frame_1','frame_2_3','frame_4..6','frame_1_3_4_6..8'].map(n=>frameChannelsFromName(n)));
  ok('names decode back to the same channel lists',
     JSON.stringify(rt)===JSON.stringify([[1],[2,3],[4,5,6],[1,3,4,6,7,8]]), JSON.stringify(rt));

  console.log('\n════ generated script shape ════');
  const gen = await ev(()=>{
    MSTR.channels=[0,1,2].map(i=>({i,name:'C'+i,mode:'Servo',min:4000,max:8000,home:6000,homemode:'Goto',neutral:6000,range:1905,speed:0,acceleration:0,act:'',invert:false}));
    MSTR.servoCount=3;
    MSTR.sequences=[{name:'Test Seq',frames:[
      {name:'F0',duration:500,targets:[6000,6000,6000]},
      {name:'F1',duration:300,targets:[8000,6000,6000]},
      {name:'F2',duration:250,targets:[8000,6000,6000]},
      {name:'F3',duration:400,targets:[4000,4000,6000]}
    ]}];
    return genScript(MSTR.sequences, enabledChannels());
  });
  console.log(gen.split('\n').map(l=>'    '+l).join('\n'));
  ok('sequence becomes "sub Test_Seq" with a # name comment', /# Test Seq\nsub Test_Seq\n/.test(gen));
  ok('first frame writes every channel (frame_0..2)', /500 6000 6000 6000 frame_0\.\.2 # F0/.test(gen));
  ok('later frames are delta-encoded (only ch0 changed)', /300 8000 frame_0 # F1/.test(gen));
  ok('a frame with no change compiles to a bare delay', /250 delay # F2/.test(gen));
  ok('multi-channel change reuses frame_0_1', /400 4000 4000 frame_0_1 # F3/.test(gen));
  ok('frame helper pops in descending channel order', /sub frame_0_1\n  1 servo\n  0 servo\n  delay\n  return/.test(gen));
  ok('helpers are emitted after all sequence subs', gen.indexOf('sub Test_Seq') < gen.indexOf('sub frame_'));

  console.log('\n════ genFrameRow serialises holes as 0 (v1.39.5) ════');
  const holeRow = await ev(()=>genFrameRow({targets:(()=>{const a=[];a[0]=6000;a[2]=7000;return a;})(), speeds:[], accels:[]}, 3));
  ok('a hole in targets serialises as 0, not dropped as an empty column',
     holeRow === '6000 0 7000 s 0 0 0 a 0 0 0', holeRow);

  console.log('\n════ starter file + round trip ════');
  const start = await ev(()=>{ makeStarter(); CFG.maestroSource='imported'; rebuildMaestroUI();
    return {ch:MSTR.channels.length, servo:MSTR.channels.filter(c=>/^servo/i.test(c.mode)).length,
            seq:MSTR.sequences.length, subs0to7:MSTR.subs.slice(0,8).map(s=>s.name)}; });
  ok('starter is a 14-channel body board (the sketch drives one Maestro on Serial3)',
     start.servo===14 && start.ch===24, JSON.stringify({ch:start.ch,servo:start.servo}));
  ok('8 sequences → subroutines 0-7, four open/close pairs starting with the doors',
     start.seq===8 && start.subs0to7[0]==='Body_Doors_Open' && start.subs0to7[1]==='Body_Doors_Close'
     && start.subs0to7[7]==='Ports_Close',
     start.subs0to7.join(', '));
  ok('every channel auto-maps to a droid part', await ev(()=>MSTR.channels.filter(c=>/^servo/i.test(c.mode)&&!c.act).length===0));

  const roundTrip = await ev(()=>{
    const before = JSON.parse(JSON.stringify({ch:MSTR.channels.map(c=>[c.name,c.mode,c.min,c.max,c.home]), seq:MSTR.sequences}));
    const text = buildMstrText();
    // wipe and re-import
    MSTR.loaded=false; MSTR.channels=[]; MSTR.sequences=[]; MSTR.subs=[];
    parseMstr(text, 'roundtrip.mstr');
    const after = JSON.parse(JSON.stringify({ch:MSTR.channels.map(c=>[c.name,c.mode,c.min,c.max,c.home]), seq:MSTR.sequences}));
    return {chSame:JSON.stringify(before.ch)===JSON.stringify(after.ch),
            seqSame:JSON.stringify(before.seq)===JSON.stringify(after.seq),
            xmlLen:text.length, nSeq:after.seq.length,
            firstFrame:after.seq[0].frames[0], lastSeqName:after.seq[7].name};
  });
  ok('exported .mstr re-imports with identical channels', roundTrip.chSame);
  ok('exported .mstr re-imports with identical sequences and frames', roundTrip.seqSame,
     roundTrip.nSeq+' sequences, first frame dur '+roundTrip.firstFrame.duration);
  ok('sequence names survive the round trip', roundTrip.lastSeqName==='Ports Close', roundTrip.lastSeqName);

  console.log('\n════ script-only recovery (no <Sequences> in the file) ════');
  const recov = await ev(()=>{
    makeStarter();
    const full = buildMstrText();
    const stripped = full.replace(/<Sequences>[\s\S]*?<\/Sequences>/, '<Sequences />');
    const expect = JSON.parse(JSON.stringify(MSTR.sequences));
    MSTR.loaded=false; MSTR.sequences=[]; MSTR.subs=[];
    parseMstr(stripped, 'script-only.mstr');
    const got = MSTR.sequences;
    // compare frame durations and targets; names come from the sub, not the sequence
    const same = got.length===expect.length && got.every((g,i)=>
      g.frames.length===expect[i].frames.length &&
      g.frames.every((f,k)=> f.duration===expect[i].frames[k].duration &&
                             JSON.stringify(f.targets)===JSON.stringify(expect[i].frames[k].targets)));
    return {same, n:got.length, names:got.map(g=>g.name).slice(0,3),
            frames0:got[0]?got[0].frames.length:0, dur0:got[0]?got[0].frames[0].duration:0};
  });
  ok('all 8 sequences rebuilt by decoding the sub blocks', recov.n===8, JSON.stringify(recov.names));
  ok('recovered frame durations and targets match the originals exactly', recov.same,
     recov.frames0+' frames, first dur '+recov.dur0);

  console.log('\n════ restartScript(n) drives the droid ════');
  await ev(()=>{ makeStarter(); CFG.maestroSource='imported'; rebuildMaestroUI(); });
  await page.waitForTimeout(300);
  await hold({btn:{R2:255,UP:1}}); await page.waitForTimeout(90); await clr();
  const done0 = await drain(0);
  const fired = await ev(()=>({L:ACT_T.doorL, R:ACT_T.doorR, RL:ACT_T.doorRL, RR:ACT_T.doorRR, S:ACT_T.smallDoor}));
  ok('RT+▲ plays subroutine 0 and opens all four body doors plus the small door',
     done0 && fired.L===1 && fired.R===1 && fired.RL===1 && fired.RR===1 && fired.S===1, JSON.stringify(fired));
  await hold({btn:{R2:255,RIGHT:1}}); await page.waitForTimeout(90); await clr();
  const done1 = await drain(1);
  const shut = await ev(()=>({L:ACT_T.doorL, R:ACT_T.doorR, RL:ACT_T.doorRL, RR:ACT_T.doorRR, S:ACT_T.smallDoor}));
  ok('RT+▶ plays subroutine 1 and shuts them again',
     done1 && Object.values(shut).every(v=>v===0), JSON.stringify(shut));

  const badSub = await ev(()=>{
    const before = LOG.length;
    CFG.maestroScript && 0;
    maestroRestart(9);     // a frame_* helper
    return LOG.slice(before).map(e=>e.s).join(' | ');
  });
  ok('firing a slot that lands on a frame_ helper is reported, not silently played', /frame helper/.test(badSub), badSub.slice(0,90));

  console.log('\n════ editor ════');
  const edit = await ev(()=>{
    makeStarter();
    EDIT.seq=6; EDIT.frame=-1;                        // "Ports Open"
    const n0 = MSTR.sequences[6].frames.length;
    EDIT.live = MSTR.channels.map(c=>c.home);
    const ch = MSTR.channels.find(c=>c.act==='chargebay');
    EDIT.live[ch.i] = 7777;
    // capture
    const at = EDIT.frame>=0?EDIT.frame+1:MSTR.sequences[6].frames.length;
    MSTR.sequences[6].frames.splice(at,0,{name:'Frame X',duration:640,targets:EDIT.live.slice()});
    reindexSubs();
    const text = buildMstrText();
    MSTR.loaded=false; MSTR.sequences=[];
    parseMstr(text,'edited.mstr');
    const f = MSTR.sequences[6].frames;
    return {n0, n1:f.length, dur:f[f.length-1].duration, val:f[f.length-1].targets[ch.i], chIdx:ch.i};
  });
  ok('a captured frame survives export → re-import with its duration and target',
     edit.n1===edit.n0+1 && edit.dur===640 && edit.val===7777, JSON.stringify(edit));

  /* v1.46.0 — the `invert` leg of this assertion is gone. `invert` is retired
     (chanEnds/chanAdoptInvert, maestro/playback.js): a channel that reads
     backwards is min and max the other way round, which is a property of the
     pair and not a flag beside it. What chanNorm owes the caller either way is
     the mapping below. */
  const norm = await ev(()=>{
    const c={i:0,min:4000,max:8000};
    return [chanNorm(c,4000), chanNorm(c,6000), chanNorm(c,8000), chanNorm(c,9999)];
  });
  ok('quarter-us → travel maps min→0, mid→0.5, max→1 and clamps',
     norm[0]===0 && Math.abs(norm[1]-0.5)<1e-9 && norm[2]===1 && norm[3]===1, JSON.stringify(norm));

  console.log('\n════ import robustness ════');
  const bad = await ev(()=>{
    const r=[];
    try{ parseMstr('not xml at all <<<','x.mstr'); r.push('no-throw'); }catch(e){ r.push('threw'); }
    try{ parseMstr('<Foo><Bar/></Foo>','x.mstr'); r.push('no-throw'); }catch(e){ r.push('threw:'+/UscSettings/.test(e.message)); }
    try{ parseMstr('<UscSettings version="1"><Channels/></UscSettings>','x.mstr'); r.push('no-throw'); }catch(e){ r.push('threw-nochan'); }
    return r;
  });
  ok('garbage / wrong-root / empty files are rejected with a message',
     bad[0]==='threw' && bad[1]==='threw:true' && bad[2]==='threw-nochan', JSON.stringify(bad));

  console.log('\n════ Drives dropdown: CAD-driven labels, not PART_LIST\'s (change 1) ════');
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const optFor = (act)=>page.evaluate(a=>{
    const sel = Array.from($('maeHost').querySelectorAll('select'))
      .find(s=>Array.from(s.options).some(o=>o.value===a));
    const opt = sel && Array.from(sel.options).find(o=>o.value===a);
    return opt ? opt.textContent : null;
  }, act);
  await ev(()=>{ makeStarter('dome'); CFG.maestroSource='imported'; rebuildMaestroUI(); });
  const pieOptBefore = await optFor('pie0');
  ok('lists the CAD-driven label "Pie 1", not PART_LIST\'s hand-written "Dome pie 1"',
     pieOptBefore==='Pie 1', pieOptBefore);

  console.log('\n════ Drives dropdown learns a part rename (change 1) ════');
  const pieName = await ev(()=>CAD.moving.find(m=>m.act==='pie0').name);
  await page.evaluate(n=>{ setPartLabel(n,'Front Pie Panel'); rebuildMaestroUI(); }, pieName);
  const pieOptRenamed = await optFor('pie0');
  ok('a rename via setPartLabel (PARTS.overrides) shows up on rebuild, no reload needed',
     pieOptRenamed==='Front Pie Panel', pieOptRenamed);
  await page.evaluate(n=>{ setPartLabel(n,''); rebuildMaestroUI(); }, pieName);   // leave PARTS clean


  /* =================================================================
     v1.45.0 — Mike: "Add date and time, without seconds, to
     saved/exported filenames." A date alone collides the second time
     you export on the same afternoon, which is exactly when you are
     iterating and most need to tell two files apart.
     ================================================================= */
  console.log('\n════ v1.45.0 — saved filenames carry the date AND the time ════');
  const stamps = await ev(()=>{
    const seen=[];
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){ seen.push(this.download); };
    try{
      makeStarter('dome'); CFG.maestroSource='imported'; reindexSubs();
      servoCfgExport(); exportMstr(); exportPcaHeader();
    }catch(e){ seen.push('threw: '+e.message); }
    HTMLAnchorElement.prototype.click = real;
    return {seen, stamp:(typeof fileStamp==='function')?fileStamp():'no-fileStamp'};
  });
  ok('the servo config .json is stamped to the minute, not just the day',
     /^R2-servos-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(stamps.seen[0]||'')
     && (stamps.seen[0]||'').indexOf(stamps.stamp)>0, stamps.seen[0]);
  ok('the .mstr export is stamped too',
     /-\d{4}-\d{2}-\d{2}-\d{4}\.mstr$/.test(stamps.seen[1]||'')
     && (stamps.seen[1]||'').indexOf(stamps.stamp)>0, stamps.seen[1]);
  ok('the PCA9685 sequences.h is stamped too',
     /-\d{4}-\d{2}-\d{2}-\d{4}\.h$/.test(stamps.seen[2]||'')
     && (stamps.seen[2]||'').indexOf(stamps.stamp)>0, stamps.seen[2]);

  /* =================================================================
     v1.45.0 — Mike: "Put build/import/export/assign-panel actions in a
     guided wizard." One door with four jobs behind it, the specialist
     outputs behind Advanced, and nothing that used to be reachable
     stops being reachable.
     ================================================================= */
  console.log('\n════ v1.45.0 — one guided front door for build / import / export / assign ════');
  await ev(()=>{ loadProfile('maestro25'); makeStarter('dome'); CFG.maestroSource='imported'; rebuildMaestroUI(); });
  ok('the pane leads with one door', await ev(()=>
     !!$('btnJobWiz') && typeof jobwizOpen === 'function'));
  ok('the chooser offers exactly the four jobs Mike named', await ev(()=>{
    if(typeof jobwizOpen !== 'function') return false;
    jobwizOpen();
    const cards = Array.from(document.querySelectorAll('#jobWiz .jwjob')).map(c=>c.dataset.job);
    jobwizClose();
    return cards.length===4 && ['build','import','export','assign'].every(k=>cards.indexOf(k)>=0);
  }));
  ok('picking a job walks that job, it does not just close', await ev(()=>{
    if(typeof jobwizOpen !== 'function') return false;
    jobwizOpen();
    document.querySelector('#jobWiz .jwjob[data-job="export"]').click();
    const r = JOBWIZ.job==='export' && /servo config/i.test($('jobWiz').textContent);
    jobwizClose(); return r;
  }));
  ok('the specialist outputs are behind Advanced, not beside the file most people want', await ev(()=>{
    if(typeof jobwizOpen !== 'function') return false;
    jobwizOpen(); jobwizGo('export');
    const adv = $('jobWiz').querySelector('.jwadv');
    const txt = adv ? adv.textContent : '';
    const prim = $('jobWiz').querySelector('button.prim');
    const r = !!adv && /\.mstr/.test(txt) && /sequences\.h/.test(txt) && /whole/i.test(txt)
           && !!prim && /servo config/i.test(prim.textContent)
           && !/sequences\.h/.test(prim.textContent);
    jobwizClose(); return r;
  }));
  ok('every button that existed before is still in the pane', await ev(()=>{
    rebuildMaestroUI();
    const labels = Array.from($('maeHost').querySelectorAll('button')).map(b=>b.textContent);
    return !!$('btnCfgImport') && !!$('btnAssignPanels') && !!$('btnExpPca')
        && labels.indexOf('Export .mstr')>=0 && labels.indexOf('Export servo config')>=0
        && labels.indexOf('Body starter')>=0 && labels.indexOf('Dome starter')>=0;
  }));
  ok('...and each of them is at most two clicks away', await ev(()=>{
    const d = $('maeAdvIO');
    if(!d) return false;
    const wasOpen = d.open;
    d.open = true;                                   // click one: the disclosure
    const reachable = ['btnCfgImport','btnAssignPanels','btnExpPca']
      .every(id=>{ const b=$(id); return b && d.contains(b); });
    d.open = wasOpen;
    return reachable;
  }));

  console.log('\n════ v1.45.0 — the one canonical sentence about formats ════');
  ok('there is exactly one sentence and it names both families, in and out', await ev(()=>
     typeof IO_FORMATS_SENTENCE === 'string'
     && /\.mstr/.test(IO_FORMATS_SENTENCE) && /\.json/.test(IO_FORMATS_SENTENCE)
     && /servos\.h/.test(IO_FORMATS_SENTENCE) && /sequences\.h/.test(IO_FORMATS_SENTENCE)));
  ok('...and it is where the import/export job is chosen', await ev(()=>{
    if(typeof jobwizOpen !== 'function') return false;
    jobwizOpen(); jobwizGo('import');
    const a = $('jobWiz').textContent.indexOf(IO_FORMATS_SENTENCE) >= 0;
    jobwizGo('export');
    const b = $('jobWiz').textContent.indexOf(IO_FORMATS_SENTENCE) >= 0;
    jobwizClose(); return a && b;
  }));

  console.log('\n════ v1.45.0 — the servo bench door says which door it is ════');
  /* WHAT COUNTS AS "you already have one" — setupSaveWorth(), the same gate
     Mike settled in v1.38.3 when a travel-only test decided that four named,
     ticked channels were nothing. A table with names and parts in it is a
     config you EDIT; measured travel is sufficient but not necessary. */
  ok('the label follows whether this build already has a servo config worth editing', await ev(()=>{
    rebuildMaestroUI();
    const b = Array.from($('maeHost').querySelectorAll('button'))
      .find(x=>/Edit current servo config…|Set up servo hardware…/.test(x.textContent));
    if(!b) return false;
    const w = (typeof setupSaveWorth === 'function') ? setupSaveWorth() : null;
    const have = w ? !!w.worth : !!servoCfgConfigured();
    return have
      ? b.textContent === 'Edit current servo config…'
      : b.textContent === 'Set up servo hardware…';
  }));
  ok('…and a table of named channels with factory travel still reads as EDIT', await ev(()=>{
    makeStarter('dome','mini24');       // names and parts, nobody near the dial yet
    rebuildMaestroUI();
    const b = Array.from($('maeHost').querySelectorAll('button'))
      .find(x=>/Edit current servo config…|Set up servo hardware…/.test(x.textContent));
    return !!b && b.textContent === 'Edit current servo config…' && !servoCfgConfigured();
  }));
  ok('...and it opens the six-step bench on its Channels step, not the old overlay', await ev(()=>{
    const b = Array.from($('maeHost').querySelectorAll('button'))
      .find(x=>/Edit current servo config…|Set up servo hardware…/.test(x.textContent));
    if(!b) return false;
    b.click();
    const key = (typeof SETUP_STEPS!=='undefined' && SETUP_STEPS[SETUP.step]) ? SETUP_STEPS[SETUP.step].key : '';
    if(typeof setupClose==='function') setupClose();
    return key === 'channels';
  }));

  /* =================================================================
     v1.46.0 — `invert` is retired. On the model min is shut and max is
     fully open, directed rather than sorted, so "this linkage runs the
     other way" is the two ends swapped — which is what the bench's own
     REV tick already did. The channel table's tick now does the same
     thing rather than setting a flag beside the pair.
     ================================================================= */
  console.log('\n════ v1.46.0 — the channel table reverses a linkage by swapping its ends ════');
  const rev = await ev(()=>{
    makeStarter('dome'); CFG.maestroSource='imported'; rebuildMaestroUI();
    const row = $('maeHost').querySelector('.chrow') || $('maeHost');
    const cb = Array.from($('maeHost').querySelectorAll('input[type=checkbox]'))
      .find(x=>/revers/i.test(x.title||''));
    if(!cb) return {missing:true, titles:Array.from($('maeHost').querySelectorAll('input[type=checkbox]')).map(x=>x.title)};
    const c = MSTR.channels[0];
    const before = [c.min, c.max];
    cb.checked = true; cb.dispatchEvent(new Event('change'));
    const after = [c.min, c.max];
    cb.checked = false; cb.dispatchEvent(new Event('change'));
    return {before, after, back:[c.min,c.max], title:cb.title,
            says:/invert/i.test(cb.title||'')};
  });
  ok('the tick is a REVERSE tick, and its words say what it does to the two ends',
     !rev.missing && /swaps/.test(rev.title||'') && rev.says===false,
     rev.missing ? JSON.stringify(rev.titles) : rev.title);
  ok('...and ticking it swaps min and max rather than setting a flag',
     !rev.missing && rev.after[0]===rev.before[1] && rev.after[1]===rev.before[0]
     && rev.back[0]===rev.before[0] && rev.back[1]===rev.before[1],
     JSON.stringify([rev.before, rev.after, rev.back]));
  ok('nothing in the import path still calls inverted travel a live setting', await ev(()=>{
    const drops = pcaExportDrops(MSTR.channels, loadoutSeqs());
    const d = drops.find(x=>x.field==='invert');
    return !!d && /retired in v1\.46\.0/.test(d.why);
  }));

  /* =================================================================
     v1.46.0 — the choreography backup. Mike, asked what "save existing"
     means on the import chooser: a download. The sequence library had no
     file of its own — exportMstr() buries it in a Pololu settings file
     and setupExport() writes the whole droid — so this is it, stamped
     like everything else and readable back through the ONE reader.
     ================================================================= */
  console.log('\n════ v1.46.0 — the choreography library has a file of its own ════');
  const cho = await ev(()=>{
    makeStarter('dome','mini24'); CFG.maestroSource='imported'; reindexSubs();
    const seen = [];
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){ seen.push(this.download); };
    let name = '';
    try{ name = seqLibExport(); }catch(e){ seen.push('threw: '+e.message); }
    HTMLAnchorElement.prototype.click = real;
    const text = JSON.stringify(seqLibExportObj());
    const sh = (typeof impShape === 'function') ? impShape(text, 'R2-choreography.json') : null;
    return {seen, name, stamp:fileStamp(), sniff:seqLibLooksLike(text),
            notCfg:(typeof servoCfgLooksLikeCfg==='function') ? servoCfgLooksLikeCfg(text) : null,
            routines:JSON.parse(text).count, mine:MSTR.sequences.length,
            shape: sh ? {from:sh.from, servo:sh.servo, choreo:sh.choreo} : null,
            readable:(function(){ try{ return servoCfgImportText(text,'R2-choreography.json').from; }
                                  catch(e){ return 'threw: '+e.message; } })()};
  });
  ok('it is written as a timestamped .json, to the minute like every other writer',
     /^R2-choreography-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(cho.seen[0]||'')
     && (cho.seen[0]||'').indexOf(cho.stamp)>0 && cho.name===cho.seen[0], cho.seen[0]);
  ok('it carries the whole library', cho.routines===cho.mine && cho.routines>0,
     cho.routines+' of '+cho.mine);
  ok('it is sniffed as ours and NOT confused with a servo config',
     cho.sniff===true && cho.notCfg===false);
  ok('the one reader reads it back, and the chooser sees both halves in it',
     cho.readable==='setup' && cho.shape && cho.shape.servo>0 && cho.shape.choreo>0,
     cho.readable+' · '+JSON.stringify(cho.shape));

  /* =================================================================
     2026-08-22 — WHERE A CHANNEL RESTS is a question about WORDS

     v1.45.0 closed "the panels are half open" by making the resting pose a
     question about the ACTUATOR: a door rests shut, a bipolar actuator rests
     centred. The predicate that decided which was an UNANCHORED substring
     test, and `pan` is a substring of `panel0` … `panel13` — so all fourteen
     dome side panels answered "bipolar", rested at 6000, and stood half open
     on the model exactly as before. Nothing caught it because nothing here
     had ever asked the question of a panel.

     So this asks it of EVERY actuator id the build can put on a channel, and
     pins the whole answer rather than one example: the bipolar set is the six
     holoprojector axes and nothing else.
     ================================================================= */
  console.log('\n════ a dome side panel rests SHUT, not half open ════');
  const rst = await ev(()=>{
    /* every id that can reach actRestNorm(): the actuator table (ACT_KEYS
       plus the twelve pies and the fourteen side panels), the PCA servo
       definitions, and whatever the loaded CAD claims. The Anzellan rig and
       the Builder joints are intercepted before the predicate, so they are
       deliberately not in this list. */
    const ids = [...new Set([].concat(
      Object.keys(ACT),
      [].concat(SERVO_DEFS[1], SERVO_DEFS[2]).map(d=>d.act),
      (typeof CAD !== 'undefined' && CAD.loaded) ? CAD.moving.map(m=>m.act) : []
    ).filter(Boolean))];
    const centred = ids.filter(a=>actRestNorm(a) === 0.5).sort();
    const shut    = ids.filter(a=>actRestNorm(a) === 0).sort();
    /* the same question through the ONE reader, on a channel carrying the
       stale measured `home:6000, homemode:'Goto'` v1.45.0's note is about */
    const ch = a => chanRest({act:a, min:4000, max:8000, home:6000, homemode:'Goto', neutral:6000});
    return {n:ids.length, centred, panels:shut.filter(a=>/^panel\d+$/.test(a)).length,
            panel0:ch('panel0'), panel13:ch('panel13'),
            pie:ch('pie0'), door:ch('doorL'), hp:ch('hp1Pan'),
            compound:actRestNorm('pantilt'), bare:actRestNorm('nod'), oth:actRestNorm('oth1')};
  });
  ok('every actuator id in the build was asked', rst.n >= 56, rst.n+' ids');
  ok('the fourteen dome side panels are not bipolar — every one rests shut',
     rst.panels === 14 && !rst.centred.some(a=>/^panel/.test(a)), JSON.stringify(rst.centred));
  ok('the only bipolar actuators left are the six holoprojector axes',
     rst.centred.join(',') === 'hp1Pan,hp1Tilt,hp2Pan,hp2Tilt,hp3Pan,hp3Tilt', rst.centred.join(','));
  ok('…so panel0 and panel13 park at their shut end, not at mid-travel',
     rst.panel0 === 4000 && rst.panel13 === 4000, rst.panel0+' / '+rst.panel13);
  ok('pies and doors are unchanged, and a holo axis still centres',
     rst.pie === 4000 && rst.door === 4000 && rst.hp === 6000,
     [rst.pie, rst.door, rst.hp].join(' / '));
  ok('a bare centred word, and two of them run together with no separator, both centre',
     rst.bare === 0.5 && rst.compound === 0.5, rst.bare+' / '+rst.compound);
  ok('an off-model placeholder is a door, not a gimbal', rst.oth === 0, String(rst.oth));


  /* =================================================================
     2026-08-22 — THE FOUR DOORS IN THE MAESTRO PANE THAT LOSE WORK

     Everything below is about maestro/ui-pane.js and nothing else. The
     pane's own buttons — the three starter generators, Rename, Delete
     and "+ Sequence" — were the last controls in the app that could
     discard an afternoon with one click and no question, or leave a
     name pointing at nothing. The sequencer suites cover the bricks
     themselves; these cover the PANE, because that is where the
     handlers live.
     ================================================================= */

  console.log('\n════ a starter button asks before it discards the library ════');
  /* makeStarter() replaces MSTR.channels and MSTR.sequences wholesale and
     then calls servoStoreSave(), so the browser backup goes in the same
     click. Three buttons in this pane called it with no confirmation at
     all — the "expand all N file buttons and see what Dome starter does"
     click cost every measured endpoint and every routine. */
  const starterGate = await ev(async ()=>{
    const out = {};
    const real = window.appConfirm;
    let asked = [];
    const click = async label=>{
      const b = Array.from($('maeHost').querySelectorAll('button')).find(x=>x.textContent===label);
      if(!b) return false;
      b.click();
      await new Promise(r=>setTimeout(r,80));
      return true;
    };
    window.appConfirm = (msg,o)=>{ asked.push({msg:String(msg), o:o||{}}); return Promise.resolve(false); };

    /* (1) a fresh app has nothing to lose, so the question is not asked */
    MSTR.loaded=false; MSTR.channels=[]; MSTR.sequences=[]; MSTR.subs=[]; MSTR.loadout=null;
    rebuildMaestroUI();
    out.freshFound = await click('Body starter');
    out.freshAsked = asked.length;
    out.freshSeq   = MSTR.sequences.length;
    out.freshCh    = MSTR.channels.length;

    /* (2) an afternoon of work: measured travel on a channel and a routine
           of your own on top of the starter's eight */
    makeStarter('body');
    MSTR.channels[0].min = 4321; MSTR.channels[0].calibrated = true;
    MSTR.sequences.push({name:'My Show', frames:[{name:'F0',duration:500,targets:MSTR.channels.map(()=>6000)}]});
    rebuildMaestroUI();
    asked = [];
    const before = {ch:MSTR.channels.length, seq:MSTR.sequences.length, file:MSTR.fileName, min0:MSTR.channels[0].min};
    for(const l of ['Body starter','Dome starter','Frik head starter']) await click(l);
    out.asked = asked.length;
    out.qs = asked.map(a=>({msg:a.msg, title:a.o.title||'', yes:a.o.yes||'', no:a.o.no||'', danger:!!a.o.danger}));
    out.kept = {ch:MSTR.channels.length, seq:MSTR.sequences.length, file:MSTR.fileName, min0:MSTR.channels[0].min};
    out.before = before;

    /* (3) …and the destructive answer still generates the starter */
    window.appConfirm = ()=>Promise.resolve(true);
    await click('Dome starter');
    out.went = {seq:MSTR.sequences.length, file:MSTR.fileName, ch:MSTR.channels.length};
    window.appConfirm = real;
    return out;
  });
  ok('with nothing loaded there is nothing to lose, so a starter is generated without a question',
     starterGate.freshFound && starterGate.freshAsked===0 && starterGate.freshSeq===8 && starterGate.freshCh>0,
     starterGate.freshAsked+' question(s), '+starterGate.freshSeq+' sequences');
  ok('over a table with measured travel and a routine of your own, all three starters ask first',
     starterGate.asked===3, starterGate.asked+' of 3 asked');
  ok('the question names the counts, names the starter, and answers with verbs rather than Yes/No',
     starterGate.qs.length===3 && starterGate.qs.every(q=>
       /24 channel/.test(q.msg) && /9 sequence/.test(q.msg) && q.danger
       && !/^(yes|no|ok|cancel)$/i.test(q.yes) && !/^(yes|no|ok)$/i.test(q.no))
     && /body/i.test((starterGate.qs[0]||{title:'',msg:''}).title+(starterGate.qs[0]||{msg:''}).msg)
     && /dome/i.test((starterGate.qs[1]||{title:'',msg:''}).title+(starterGate.qs[1]||{msg:''}).msg)
     && /frik|anzellan/i.test((starterGate.qs[2]||{title:'',msg:''}).title+(starterGate.qs[2]||{msg:''}).msg),
     JSON.stringify(starterGate.qs[1]||null));
  ok('...and it says what survives the answer either way',
     starterGate.qs.length===3 && starterGate.qs.every(q=>/export|backup|keep/i.test(q.msg)),
     JSON.stringify((starterGate.qs[0]||{}).msg));
  ok('answering the keep verb leaves every routine, the measured endpoint and the file name alone',
     starterGate.kept.seq===starterGate.before.seq && starterGate.kept.min0===4321
     && starterGate.kept.file===starterGate.before.file,
     JSON.stringify(starterGate.kept));
  ok('answering the destructive verb still generates the starter it named',
     /dome/i.test(starterGate.went.file) && starterGate.went.seq===8,
     starterGate.went.file+' · '+starterGate.went.seq+' sequences');

  console.log('\n════ rename and delete do not leave bricks pointing at nothing ════');
  /* A whole-sequence brick resolves its target BY NAME every time it
     compiles (blockBoundaries, blockSeqTargetsAt), and both of them fail
     SILENTLY: the brick keeps its place and its length on the timeline and
     compiles to a single held pose. Renaming the sequence it names was
     enough to empty a Show and say nothing. */
  const refs = await ev(async ()=>{
    makeStarter('body'); CFG.maestroSource='imported';
    const row = (a,b)=>{ const t=MSTR.channels.map(()=>4000); t[0]=a; t[1]=b; return t; };
    const wave = {name:'Wave', frames:[
      {name:'F0',duration:300,targets:row(8000,4000)},
      {name:'F1',duration:300,targets:row(4000,8000)},
      {name:'F2',duration:300,targets:row(4000,4000)}]};
    MSTR.sequences.push(wave);
    const show = {name:'Show', frames:[], blocks:[]};
    MSTR.sequences.push(show);
    blockAdd(show,'seq','Wave',0);
    const sig = s => s.frames.map(f=>'t'+f.duration+'['+f.targets[0]+','+f.targets[1]+']').join(' · ');
    const before = sig(show);

    EDIT.seq = MSTR.sequences.indexOf(wave); EDIT.frame=-1;
    rebuildMaestroUI();
    const realPrompt = window.appPrompt;
    window.appPrompt = ()=>Promise.resolve('Wave Two');
    const bRen = Array.from($('maeHost').querySelectorAll('button')).find(x=>x.textContent==='Rename');
    bRen.click();
    await new Promise(r=>setTimeout(r,80));
    window.appPrompt = realPrompt;
    const sh = MSTR.sequences.find(s=>s.name==='Show');
    const after = sig(sh);
    blockSync(sh);                    // the next edit to Show, whenever it comes
    const recompiled = sig(sh);
    const brick = blockList(sh)[0];

    /* now DELETE the routine that brick names */
    const realConfirm = window.appConfirm;
    const asked = [];
    window.appConfirm = (msg,o)=>{ asked.push({msg:String(msg), o:o||{}}); return Promise.resolve(false); };
    EDIT.seq = MSTR.sequences.findIndex(s=>s.name==='Wave Two'); EDIT.frame=-1;
    rebuildMaestroUI();
    const bDel = Array.from($('maeHost').querySelectorAll('button')).find(x=>x.textContent==='Delete');
    bDel.click();
    await new Promise(r=>setTimeout(r,80));
    const survived = !!MSTR.sequences.find(s=>s.name==='Wave Two');
    window.appConfirm = realConfirm;
    return {before, after, recompiled, ref:brick?brick.ref:'(no brick)',
            asked:asked.length, q:asked[0]||null, survived,
            names:MSTR.sequences.map(s=>s.name)};
  });
  ok('renaming a sequence re-points every whole-sequence brick that named it',
     refs.ref==='Wave Two', refs.ref);
  ok('...so the routine containing it still holds the moves it held before',
     refs.after===refs.before, refs.before+'   →   '+refs.after);
  ok('...and still compiles to them the next time anything edits it',
     refs.recompiled===refs.before, refs.recompiled);
  ok('deleting a sequence a brick names asks first, and names the count and the routine',
     refs.asked===1 && refs.q && /1 brick/.test(refs.q.msg) && /Show/.test(refs.q.msg),
     refs.asked+' asked · '+(refs.q?JSON.stringify(refs.q.msg):'—'));
  ok('...and answering keep leaves the sequence and its bricks where they were',
     refs.survived, JSON.stringify(refs.names));

  console.log('\n════ the pane\'s + Sequence cannot mint a name the library already holds ════');
  /* A NAME IS AN ADDRESS (blocks.js): loadoutSeqs() resolves a board slot
     by name, so two routines sharing one makes the second unreachable
     while a slot silently fires the first. blocks.js has seqUniqueName()
     for exactly this; the pane's + was counting instead. */
  const mint = await ev(()=>{
    makeStarter('body');
    MSTR.sequences = []; MSTR.loadout = null; EDIT.seq = 0; EDIT.frame = -1;
    rebuildMaestroUI();
    const paneAdd = ()=>{
      const b = Array.from($('maeHost').querySelectorAll('button')).find(x=>x.textContent==='+ Sequence');
      if(b) b.click();
    };
    paneAdd();                       // the pane's door
    blockNewRoutine();               // the library's door
    paneAdd();                       // the pane's door again
    const names = MSTR.sequences.map(s=>s.name);
    return {names, unique:names.length === new Set(names).size,
            reachable:names.filter((n,i)=>names.indexOf(n)===i).length};
  });
  ok('three "new sequence" doors in a row mint three names the board can tell apart',
     mint.unique && mint.names.length===3, JSON.stringify(mint.names));

  console.log('\n════ every file button says what its file is ════');
  const fileBtns = await ev(()=>{
    loadProfile('maestro25'); buildFwSelector();
    makeStarter('body'); CFG.maestroSource='imported'; rebuildMaestroUI();
    const d = $('maeAdvIO');
    if(!d) return {missing:true};
    const btns = Array.from(d.querySelectorAll('button'));
    const t = label => { const b = btns.find(x=>x.textContent===label); return b ? b.title : null; };
    const pca = $('btnExpPca');
    return {n:btns.length,
            untitled: btns.filter(b=>!(b.title||'').trim()).map(b=>b.textContent),
            cfgIn: t('Import servo config…'), cfgOut: t('Export servo config'),
            mstr: t('Export .mstr'),
            starter: t('Dome starter'),
            pca: pca ? {label:pca.textContent, title:pca.title} : null};
  });
  ok('every one of the nine buttons in the collapsed row carries a line of its own',
     !fileBtns.missing && fileBtns.untitled.length===0,
     fileBtns.untitled ? JSON.stringify(fileBtns.untitled) : 'no #maeAdvIO');
  ok('the servo-config pair names R2-servos-*.json and says it is travel only',
     /R2-servos/.test(fileBtns.cfgIn||'') && /R2-servos/.test(fileBtns.cfgOut||'')
     && /travel/i.test(fileBtns.cfgIn||'') && /travel/i.test(fileBtns.cfgOut||''),
     JSON.stringify([fileBtns.cfgIn, fileBtns.cfgOut]));
  ok('...and tells it apart from the whole-setup R2-setup-*.json',
     /R2-setup/.test(fileBtns.cfgIn||''), String(fileBtns.cfgIn));
  ok('the .mstr button says it is the file that goes on a Maestro',
     /\.mstr/.test(fileBtns.mstr||'') && /Control Center|Maestro/.test(fileBtns.mstr||''),
     String(fileBtns.mstr));
  ok('a starter button warns, on hover, that it replaces the table it lands on',
     /replace/i.test(fileBtns.starter||''), String(fileBtns.starter));
  /* This one is not disabled on a Maestro build — a builder migrating the
     other way needs it, and tests/pcaseq.test.js pins it as enabled with a
     config loaded. So it takes the other half of the offer: the LABEL says
     which route it is for, and names the file it writes, so it cannot be
     mistaken for the export a Maestro builder wants. */
  ok('the PCA9685 header button names its route AND its file in its own label',
     fileBtns.pca && /PCA/i.test(fileBtns.pca.label) && /sequences\.h/i.test(fileBtns.pca.label)
     && /not (the|a) .*maestro|instead of a Maestro/i.test(fileBtns.pca.title||''),
     fileBtns.pca ? fileBtns.pca.label+' — '+fileBtns.pca.title : 'missing');

  // leave it in a sane state
  await ev(()=>{ makeStarter(); CFG.maestroSource='imported'; rebuildMaestroUI(); });

  ok('no page errors', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
