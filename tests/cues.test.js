/* Cues — the controller as a sequence recorder (v1.19.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-07: "we should add the ability to use the controller as a
   sequence recorder … you assign the actions, maybe using the default,
   maybe by customising the buttons to actions, and then you can record the
   movements into sequencer — so as a puppet you record the actions and the
   sequencer plays them back."

   Covers: the action catalog, one-control-one-job, hold-to-perform for
   parts and groups, analog partial travel, a routine cue playing live,
   auto-cue, and the recorder producing a BRICK ROUTINE — bricks at the
   instant of each press, stick work nested on the spine — that opens in
   the sequencer and compiles to frames.

   Timing note (same trap as puppet.test.js): headless rAF is ~10 fps, so a
   take cannot be driven with real-time waits. Every performance below runs
   inside ONE page.evaluate with a synthetic clock — repeated puppetTick(ms)
   with pollInput() between input changes — which rAF cannot interleave. */
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(300);
  await ev(()=>{ setBoard('mini24'); makeStarter('dome','mini24'); });
  await page.waitForTimeout(300);

  console.log('\n════ the action catalog ════');
  const cat = await ev(()=>{
    puppetSet(true);
    const c = cueCatalog();
    return {
      n: c.length,
      parts: c.filter(x=>x.kind==='act').length,
      groups: c.filter(x=>x.kind==='grp').length,
      routines: c.filter(x=>x.kind==='seq').length,
      keyed: c.every(x=>cueParse(cueKey(x)).ref === x.ref)
    };
  });
  ok('a cue can be a part, a group or a saved routine',
     cat.parts>0 && cat.groups>0 && cat.routines>0, JSON.stringify(cat));
  ok('every entry round-trips through its key', cat.keyed);
  ok('the cue section appears in the mapping panel', await ev(()=>{
    pupBuildMap();
    return !!$('pupside').querySelector('.pupcues') && !!$('cueAuto');
  }));
  ok('the servo rows are untouched — strings and cues are two sections', await ev(()=>{
    const chans = MSTR.channels.filter(c=>c.act && /^servo/i.test(c.mode));
    return $('pupside').querySelectorAll('.puprow').length === chans.length;
  }));

  console.log('\n════ one control, one job ════');
  const job = await ev(()=>{
    const grp = cueCatalog().find(c=>c.kind==='grp');
    /* A is a string at this point (auto-map deals buttons after sticks) */
    const before = Object.keys(PUPPET.map).find(i=>PUPPET.map[i]==='A');
    cueSet('A', grp);
    const after = Object.keys(PUPPET.map).find(i=>PUPPET.map[i]==='A');
    return {wasString: before!==undefined, freed: after===undefined, cued: !!CUE.map.A, grp:grp.ref};
  });
  ok('giving a control a cue frees it from the servos', job.wasString && job.freed && job.cued, JSON.stringify(job));
  ok('…and the servo picker takes it back', await ev(()=>{
    const c = pupChannels()[0];
    const keep = PUPPET.map[c.i];
    cueFree('A');
    const gone = !CUE.map.A;
    const grp = cueCatalog().find(x=>x.kind==='grp');
    cueSet('A', grp);
    PUPPET.map[c.i] = keep;                      // put the rig back as it was
    return gone && !!CUE.map.A;
  }));
  ok('a cue on a free control does not disturb the strings', await ev(()=>{
    const n = Object.keys(PUPPET.map).length;
    const free = cueFreeControls();
    if(!free.length) return true;
    cueSet(free[0].id, cueCatalog().find(c=>c.kind==='act'));
    const same = Object.keys(PUPPET.map).length === n;
    cueClear(free[0].id);
    return same;
  }));

  console.log('\n════ perform a cue ════');
  const perform = await ev(()=>{
    window.__cue = {};
    const grp = cueCatalog().find(c=>c.kind==='grp');
    __cue.members = cueMembers(grp);
    cueSet('A', grp);
    CUE.latch.A = false;
    const step = (v, ms)=>{ INPUT.virtual.btn.A = v; pollInput(); for(let t=0;t<ms;t+=25) puppetTick(25); };
    step(1, 200);
    const openAll = __cue.members.every(a=>{
      const c = blockChan(a);
      return Math.abs(ACT_T[a] - chanNorm(c, blockOpen(c))) < 0.02;
    });
    step(0, 200);
    const homeAll = __cue.members.every(a=>{
      const c = blockChan(a);
      return Math.abs(ACT_T[a] - chanNorm(c, blockClosed(c))) < 0.02;
    });
    return {n:__cue.members.length, openAll, homeAll};
  });
  ok('holding a group cue opens every member at once', perform.n>1 && perform.openAll, JSON.stringify(perform));
  ok('letting go sends the whole group home', perform.homeAll);

  /* v1.46.0 — a cue on a REVERSED channel. Mike: min is Closed and max is
     fully open ON THE MODEL, whatever the two numbers are. chanNorm() used
     to sort the pair, so a panel whose linkage runs backwards (min > max,
     the bench's own convention — hw-table.js) stood wide open on screen
     while the real one was shut, and a cue that "opened" it shut it. */
  ok('a cue on a reversed channel opens the panel on the model, not shuts it', await ev(()=>{
    const a = cueCatalog().find(c=>c.kind==='act');
    const c = blockChan(a.ref);
    const keep = {min:c.min, max:c.max, home:c.home};
    c.min = 8000; c.max = 4000; c.home = 8000;        // shut high, open low
    cueSet('B', a);
    CUE.latch.B = false;
    const step = (v, ms)=>{ INPUT.virtual.btn.B = v; pollInput(); for(let t=0;t<ms;t+=25) puppetTick(25); };
    step(1, 200);
    const open = ACT_T[a.ref];
    step(0, 200);
    const shut = ACT_T[a.ref];
    cueClear('B');
    c.min = keep.min; c.max = keep.max; c.home = keep.home;
    return open > 0.95 && shut < 0.05;
  }));

  ok('an analog control on a cue gives partial travel', await ev(()=>{
    const act = cueCatalog().find(c=>c.kind==='act');
    cueSet('L2', act);
    INPUT.virtual.btn.L2 = 128; pollInput();          // the trigger is 0..255
    for(let t=0;t<200;t+=25) puppetTick(25);
    const c = blockChan(act.ref);
    const want = chanNorm(c, Math.round(blockClosed(c) + (blockOpen(c)-blockClosed(c))*(128/255)));
    const good = Math.abs(ACT_T[act.ref] - want) < 0.03;
    INPUT.virtual.btn.L2 = 0; pollInput();
    for(let t=0;t<200;t+=25) puppetTick(25);
    cueClear('L2');
    return good;
  }));

  ok('a routine cue launches the routine and it runs to its own end', await ev(()=>{
    const rt = cueCatalog().find(c=>c.kind==='seq');
    cueSet('B', rt);
    INPUT.virtual.btn.B = 1; pollInput(); puppetTick(25);
    const started = CUE.play.length === 1 && CUE.play[0].name === rt.ref;
    INPUT.virtual.btn.B = 0; pollInput();
    let guard = 0;
    while(CUE.play.length && guard++ < 4000) puppetTick(50);   // release does NOT stop a cue
    const finished = CUE.play.length === 0;
    cueClear('B');
    return started && finished;
  }));

  console.log('\n════ auto-cue ════');
  const auto = await ev(()=>{
    const n = cueAutoMap();
    return {n, ids:Object.keys(CUE.map), clash:Object.keys(CUE.map).some(id=>Object.values(PUPPET.map).includes(id))};
  });
  ok('auto-cue deals the ready-made actions across the buttons', auto.n>0 && auto.ids.length===auto.n, JSON.stringify(auto));
  ok('nothing it claimed is still a string', !auto.clash);
  ok('the cue map persists in prefs', await ev(()=>{
    cuePrefsStore();
    const saved = JSON.parse(JSON.stringify(PREFS.puppetCues));
    const want = Object.keys(saved.map).length;
    CUE.map = {}; CUE.latch = {};
    PREFS.puppetCues = saved;
    cuePrefsRestore();
    return want > 0 && Object.keys(CUE.map).length === want;
  }));

  console.log('\n════ record the performance into the sequencer ════');
  const take = await ev(()=>{
    const out = {};
    /* a known rig: A = a group cue, the left stick = a string */
    Object.keys(CUE.map).forEach(cueClear);
    const grp = cueCatalog().find(c=>c.kind==='grp');
    const single = cueCatalog().find(c=>c.kind==='act' && !cueMembers(grp).includes(c.ref));
    cueSet('A', grp); cueSet('X', single);
    out.members = cueMembers(grp).length;
    const stick = pupChannels().find(c=>PUPPET.map[c.i]==='LY+');
    out.hasStick = !!stick;

    $('pupTake').value = 'Cued take';           // must survive the bar rebuilds
    pupRecArm();
    puppetTick(30);
    out.nameKept = $('pupTake').value === 'Cued take';
    puppetTick(3200);                                  // the 3-2-1 elapses
    out.rolling = PUPPET.rec.phase === 'rec';

    const hold = (ms)=>{ for(let t=0;t<ms;t+=25) puppetTick(25); };
    const set = (o)=>{ Object.assign(INPUT.virtual, o.hat||{});
                       Object.assign(INPUT.virtual.btn, o.btn||{}); pollInput(); };
    /* 0–500  : nothing, the stick rides up
       500–1000: A held  (the group)
       1000–1500: X held (the single part), stick back down */
    set({hat:{LY:1}});                hold(500);
    set({btn:{A:1}});                 hold(500);
    set({btn:{A:0, X:1}, hat:{LY:0}});hold(500);
    set({btn:{X:0}});                 hold(200);
    out.bricksBeforeStop = CUE.rec.bricks.length;
    pupRecStop();

    const seq = MSTR.sequences.find(s=>s.name === 'Cued take');
    if(!seq){ out.seq = null; return out; }
    const spine = (seq.blocks||[]).filter(b=>b.kind==='seq');
    const acts  = (seq.blocks||[]).filter(b=>b.kind==='act');
    out.seq = {
      cat: seq.cat,
      isRoutine: blockIsRoutine(seq),
      blocks: seq.blocks.length,
      spine: spine.length,
      spineAtZero: spine.length ? spine[0].t0 === 0 : false,
      acts: acts.length,
      firstGroupT0: Math.min(...acts.filter(b=>cueMembers(grp).includes(b.ref)).map(b=>b.t0)),
      singleT0: (acts.find(b=>b.ref === single.ref)||{}).t0,
      singleDur: (acts.find(b=>b.ref === single.ref)||{}).dur,
      compiled: seq.frames.length,
      opened: EDIT.seq === MSTR.sequences.indexOf(seq),
      inSeqMode: EDIT.active,
      puppetOff: !PUPPET.on
    };
    /* the nested strings take must be a real library sequence with a full
       pose in every frame — a hole would send a still-open servo home when
       the compiler samples it at a boundary */
    if(spine.length){
      const st = MSTR.sequences.find(s=>s.name === spine[0].ref);
      const stick2 = pupChannels().find(c=>PUPPET.map[c.i]==='LY+');
      out.strings = st ? {
        exists:true, cat:st.cat, frames:st.frames.length,
        dense: st.frames.every(f=>f.targets[stick2.i] > 0)
      } : {exists:false};
    }
    return out;
  });
  ok('the take rolled with cues and a string mapped', take.rolling && take.hasStick && take.bricksBeforeStop>=2,
     JSON.stringify({rolling:take.rolling, stick:take.hasStick, bricks:take.bricksBeforeStop}));
  ok('a name typed before ● survives the countdown', take.nameKept);
  ok('a cued take saves as a BRICK ROUTINE, not a frame list',
     !!take.seq && take.seq.isRoutine && take.seq.cat==='Recorded', JSON.stringify(take.seq));
  ok('a group cue becomes one brick per member', take.seq && take.seq.acts >= take.members+1,
     take.seq && (take.seq.acts+' act bricks for '+take.members+' members + 1'));
  ok('the stick work is nested as ONE brick on the spine at t0 0',
     take.seq && take.seq.spine===1 && take.seq.spineAtZero);
  ok('the nested take is a real library sequence with full poses',
     !!take.strings && take.strings.exists && take.strings.dense && take.strings.cat==='Recorded',
     JSON.stringify(take.strings));
  ok('each press landed at the moment it was pressed',
     take.seq && take.seq.firstGroupT0>=400 && take.seq.firstGroupT0<=700,
     take.seq && ('group at '+take.seq.firstGroupT0+' ms'));
  ok('…and lasts as long as it was held',
     take.seq && take.seq.singleT0>=900 && take.seq.singleT0<=1200
              && take.seq.singleDur>=400 && take.seq.singleDur<=700,
     take.seq && ('single at '+take.seq.singleT0+' for '+take.seq.singleDur+' ms'));
  ok('the routine compiles to frames the board can run', take.seq && take.seq.compiled > 2,
     take.seq && take.seq.compiled+' frames');
  ok('it opens in the sequencer, and the puppet lets go',
     take.seq && take.seq.opened && take.seq.inSeqMode && take.seq.puppetOff);
  ok('the sequencer library shows it under Recorded', await ev(()=>{
    buildSequencer();
    const t = $('seqlib').textContent;
    return /Recorded/.test(t) && /Cued take/.test(t);
  }));
  /* Scrub the compiled routine and watch the model follow. Use the SINGLE
     part cue (X, pressed at 1000 ms) rather than a group member: the group
     shares its channels with the stick strings, so a group member would be
     open at t=0 from the nested strings brick and prove nothing. */
  const scrub = await ev(()=>{
    const seq = MSTR.sequences.find(s=>s.name==='Cued take');
    const b = seq.blocks.find(x=>x.kind==='act' && x.t0 >= 900);
    const act = b.ref, ch = blockChan(act);
    blockPoseAt(seq, b.t0 - 50);
    const shut = ACT_T[act];
    blockPoseAt(seq, b.t0 + Math.round(b.dur*0.8));
    const open = ACT_T[act];
    const full = Math.abs(chanNorm(ch, blockOpen(ch)) - chanNorm(ch, blockClosed(ch)));
    return {act, t0:b.t0, dur:b.dur, shut, open, full};
  });
  /* not necessarily ALL the way open — a brick shorter than the channel's
     imported travel time is a partial throw, exactly as the real board
     would play the same frames */
  ok('the sequencer plays it back — the playhead poses the model',
     Math.abs(scrub.open - scrub.shut) > scrub.full * 0.25, JSON.stringify(scrub));

  console.log('\n════ a strings-only take is still a plain frame list ════');
  const plain = await ev(()=>{
    setStripMode('pad');
    Object.keys(CUE.map).forEach(cueClear);
    puppetSet(true);
    const out = {on:PUPPET.on, field:!!$('pupTake')};
    if($('pupTake')) $('pupTake').value = 'Strings only';
    pupRecArm(); puppetTick(30); puppetTick(3200);
    out.rolling = PUPPET.rec.phase === 'rec';
    const step = (ly, ms)=>{ INPUT.virtual.LY = ly; pollInput(); for(let t=0;t<ms;t+=25) puppetTick(25); };
    step(1, 400); step(0, 400);
    out.name = $('pupTake') ? $('pupTake').value : '(gone)';
    pupRecStop();
    const seq = MSTR.sequences.find(s=>s.name==='Strings only');
    out.found = !!seq;
    out.names = MSTR.sequences.slice(-3).map(s=>s.name);
    if(seq) out.seq = {blocks:!!seq.blocks, cat:seq.cat, frames:seq.frames.length};
    return out;
  });
  ok('no cues fired means the original behaviour, untouched',
     plain.found && !plain.seq.blocks && plain.seq.cat==='Recorded' && plain.seq.frames>=2,
     JSON.stringify(plain));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
