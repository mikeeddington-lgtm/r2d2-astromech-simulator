/* THE RAMP STEP, AND THE SPEED THAT FILLS IT (v1.66.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-21, after being shown that the board STOPS at every
   waypoint of a compiled staircase rather than rounding its corners:
   *"would setting the frame rate before building a sequence help - maybe
   default to .5 sec for every frame"*, then *"allow the user to change the
   step size - and could we do the maths to smooth it out say the user sets
   it to .25 or .75 of a second"*.

   TWO HALVES OF ONE LEVER, and the whole point of this suite is that
   neither works alone. Measured on a full throw over a second at
   acceleration 100 — velocity ripple CV, lower is smoother:

       step     without a per-frame speed     with one
       100 ms            0.56                   0.55
       250 ms            1.00                   0.36
       500 ms            1.33                   0.24
       750 ms +          1.68                   0.13

   Coarsen the step alone and it gets WORSE, monotonically: fewer waypoints
   means bigger jumps, each still chased flat out. So the assertions below
   are as much about the speed riding with the step as about the step.

   AND THE PROPERTY THAT MUST NOT MOVE: targets and durations are unchanged
   by any of this. A routine written before v1.66.0 carries no step, means
   120, and must recompile to the frames it already has — otherwise every
   exported file on Mike's disk stops re-attaching its own bricks. That is
   what most of the second half of this suite is guarding.
   ===================================================================== */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const URL_ = 'file://' + path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html') + R2_Q;
let pass = 0, fail = 0;
const ok = (n,c,x='') => { c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  await page.goto(URL_);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ buildSet('domeServo','mini24'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); });
  await page.waitForTimeout(300);
  const ev = f => page.evaluate(f);

  console.log('════ the step is the routine\'s own, and a new one gets the new default ════');
  const made = await ev(()=>{
    const s = MSTR.sequences[blockNewRoutine('Step probe')];
    blockAdd(s,'act','pie0',0,{dur:2000, rise:800, fall:800});
    return { step: s.stepMs, frames: s.frames.length };
  });
  ok('a routine created now draws at the 500 ms step', made.step === 500, JSON.stringify(made));
  ok('so a 2 s brick with 800 ms ramps is a handful of frames, not seventeen',
     made.frames > 2 && made.frames < 10, 'frames='+made.frames);

  const legacy = await ev(()=>{
    const s = MSTR.sequences[blockNewRoutine('Legacy probe')];
    s.stepMs = BLK_RAMP_STEP_MS;                       // written before v1.66.0
    blockAdd(s,'act','pie0',0,{dur:2000, rise:800, fall:800});
    return { step: blockStepMs(s), frames: s.frames.length };
  });
  ok('a routine carrying the legacy 120 still draws the old staircase',
     legacy.step === 120 && legacy.frames >= 15, JSON.stringify(legacy));
  ok('…and blockStepMs does NOT hoist that 120 to the UI floor — a stored step is a fact '
     +'about frames that already exist, not advice', legacy.step === 120, 'got '+legacy.step);
  ok('the Advanced control clamps what a PERSON may type, though',
     await ev(()=>blockStepClamp(50)===BLK_STEP_MIN && blockStepClamp(9999)===BLK_STEP_MAX
                 && blockStepClamp(250)===250));

  console.log('\n════ every moving channel gets a speed sized to its own frame ════');
  const sp = await ev(()=>{
    const s = MSTR.sequences[blockNewRoutine('Speed probe')];
    blockAdd(s,'act','pie0',0,{dur:2000, rise:800, fall:800});
    const c = blockChan('pie0');
    /* the distance a frame moves is its target MINUS the one before it —
       a ramp step is a fraction of the throw, not the whole of it */
    const moving = [];
    let prev = blockClosed(c);
    s.frames.forEach(f=>{
      const t = f.targets[c.i];
      if(f.speeds && f.speeds[c.i]) moving.push({
        dur: f.duration, speed: f.speeds[c.i], dist: Math.abs(t - prev),
        actual: Math.round(chanTravelMs({speed:f.speeds[c.i], acceleration:c.acceleration},
                                        Math.abs(t - prev)))
      });
      if(t !== undefined) prev = t;
    });
    return { ch: c.i, moving, still: s.frames.filter(f=>!f.speeds).length };
  });
  ok('the frames that move it carry a speed; the ones that hold it do not',
     sp.moving.length >= 2 && sp.still >= 1, JSON.stringify(sp));
  ok('and that speed really does make the move last the frame — within 10 %',
     sp.moving.every(m=>Math.abs(m.actual - m.dur) <= m.dur*0.10 + 20), JSON.stringify(sp.moving));

  console.log('\n════ the maths follows whatever step the user picks ════');
  const picks = await ev(()=>[250, 500, 750].map(step=>{
    const s = MSTR.sequences[blockNewRoutine('Pick '+step)];
    s.stepMs = step;
    blockAdd(s,'act','pie0',0,{dur:3000, rise:1000, fall:1000});
    const c = blockChan('pie0');
    const err = []; let prev = blockClosed(c), moves = 0;
    s.frames.forEach(f=>{
      const t = f.targets[c.i];
      if(f.speeds && f.speeds[c.i]){
        moves++;
        const took = chanTravelMs({speed:f.speeds[c.i], acceleration:c.acceleration}, Math.abs(t - prev));
        err.push(Math.abs(took - f.duration) / f.duration);
      }
      if(t !== undefined) prev = t;
    });
    return { step, frames: s.frames.length, moves,
             worstErr: +(Math.max.apply(null, err.concat(0))*100).toFixed(1) };
  }));
  picks.forEach(p=>console.log('  '+JSON.stringify(p)));
  ok('0.25 / 0.5 / 0.75 s all compile, and coarser really is fewer frames',
     picks[0].frames > picks[1].frames && picks[1].frames >= picks[2].frames, JSON.stringify(picks));
  ok('the authored duration survives every one of them — worst error under 12 %',
     picks.every(p=>p.worstErr < 12), JSON.stringify(picks));

  console.log('\n════ the step rides the file, so an old routine still comes home ════');
  const trip = await ev(()=>{
    const s = MSTR.sequences[blockNewRoutine('Trip')];
    blockAdd(s,'act','pie0',0,{dur:2000, rise:800, fall:800});
    const packed = blocksPack([s]);
    const cand = blocksUnpack(packed)['Trip'];
    const target = { name:'Trip', frames: JSON.parse(JSON.stringify(s.frames)) };
    const attached = blocksTryAttach(target, cand);
    return { candStep: cand.stepMs, attached, targetStep: target.stepMs,
             bricks: (target.blocks||[]).length };
  });
  ok('blocksPack carries the step and blocksTryAttach uses it',
     trip.candStep === 500 && trip.attached && trip.targetStep === 500 && trip.bricks === 1,
     JSON.stringify(trip));

  const v1 = await ev(()=>{
    /* exactly what a file written before v1.66.0 holds: v:1, bare arrays */
    const s = MSTR.sequences[blockNewRoutine('Old file')];
    s.stepMs = BLK_RAMP_STEP_MS;
    blockAdd(s,'act','pie0',0,{dur:2000, rise:800, fall:800});
    const bricks = s.blocks.map(b=>{ const nb=Object.assign({},b); delete nb.id; return nb; });
    const legacyPayload = btoa(unescape(encodeURIComponent(JSON.stringify({v:1, seqs:{'Old file':bricks}}))));
    const cand = blocksUnpack(legacyPayload)['Old file'];
    const target = { name:'Old file', frames: JSON.parse(JSON.stringify(s.frames)) };
    return { hasStep: cand.stepMs === undefined, attached: blocksTryAttach(target, cand),
             step: target.stepMs, frames: target.frames.length };
  });
  ok('a v1 payload has no step, and re-attaches at the legacy 120 exactly as before',
     v1.hasStep && v1.attached && v1.step === 120, JSON.stringify(v1));

  console.log('\n════ nothing else moved ════');
  const same = await ev(()=>{
    const s = MSTR.sequences[blockNewRoutine('Shape')];
    s.stepMs = BLK_RAMP_STEP_MS;
    blockAdd(s,'act','pie0',0,{dur:1600, rise:400, fall:400});
    const withSpeeds = JSON.parse(JSON.stringify(s.frames));
    return { anySpeeds: withSpeeds.some(f=>f.speeds),
             targetsAreNumbers: withSpeeds.every(f=>Array.isArray(f.targets)),
             durationsPositive: withSpeeds.every(f=>f.duration >= 0) };
  });
  ok('speeds ride ALONGSIDE targets and durations — neither is disturbed',
     same.anySpeeds && same.targetsAreNumbers && same.durationsPositive, JSON.stringify(same));

  console.log('\n════ a speed never exceeds the channel\'s own (v1.77.0, review H8) ════');
  /* The table's speed is the ceiling the builder set against real linkage
     (Mike, 2026-07-29 — AUTHORITATIVE). An act brick's ramp is floored at
     the travel time, so the speed that fills a step was always under it; a
     nested `seq` brick has no floor, and a library routine with a 100 ms
     full-throw frame compiled to speed 224 on a speed-120 channel (400 with
     acceleration 0), which pca-gen wrote under MPCA_SEQ_SPEEDS and
     serial-link sent as Set Speed. The 3D preview ignores speeds, so the
     model showed nothing while the droid outran its own table. Two halves:
     chanSpeedForMs() is capped at c.speed, and an interval a seq brick
     commanded carries the nested frame's own speed (or 0) rather than one
     synthesised for it. The nested DURATION is deliberately NOT stretched:
     100 ms authored stays 100 ms in the file. */
  const cap = await ev(()=>{
    const c0 = blockChan('pie0'), c1 = blockChan('pie1');
    const shut = blockClosed(c0), open = blockOpen(c0);
    /* a library routine with a 100 ms full-throw frame, exactly the shape
       that produced 224 — then closes in 100 ms too */
    const t0 = []; t0[c0.i] = open;  const t1 = []; t1[c0.i] = shut;
    MSTR.sequences.push({name:'Snap probe', frames:[
      {name:'f0', duration:100, targets:t0}, {name:'f1', duration:100, targets:t1}]});
    const s = MSTR.sequences[blockNewRoutine('Nest probe')];
    blockAdd(s,'seq','Snap probe',0,{});
    blockAdd(s,'act','pie1',0,{dur:2000, rise:800, fall:800});   // an ordinary brick alongside
    blockSync(s);
    const chans = MSTR.channels.filter(c=>/^servo/i.test(c.mode));
    const over = [];
    s.frames.forEach((f,k)=>chans.forEach(c=>{
      if(f.speeds && f.speeds[c.i] && !(f.speeds[c.i] <= (c.speed || Infinity)))
        over.push({frame:k, ch:c.i, speed:f.speeds[c.i], limit:c.speed});
    }));
    /* the interval that carries the nested 100 ms full throw on pie0 */
    const snap = s.frames.find(f=>f.targets[c0.i] === open);
    const actMoves = s.frames.filter(f=>f.speeds && f.speeds[c1.i]).length;
    const actOver  = s.frames.some(f=>f.speeds && f.speeds[c1.i] > c1.speed);
    return {
      chanSpeed: c0.speed, accel: c0.acceleration, frames: s.frames.length, over,
      snap: snap ? {duration: snap.duration, speed: (snap.speeds && snap.speeds[c0.i]) || 0} : null,
      actMoves, actOver,
      /* the maths on its own: a full throw asked in 100 ms */
      direct: chanSpeedForMs(c0, open - shut, 100),
      noAccel: chanSpeedForMs({speed:c0.speed, acceleration:0}, open - shut, 100),
      unlimited: chanSpeedForMs({speed:0, acceleration:0}, open - shut, 100)
    };
  });
  console.log('  '+JSON.stringify(cap));
  ok('no compiled frame carries a speed above the channel\'s own — every channel, every frame',
     cap.over.length === 0, JSON.stringify(cap.over.slice(0,3)));
  ok('the nested 100 ms full-throw frame gets NO synthesised speed, and keeps its 100 ms',
     !!cap.snap && cap.snap.speed === 0 && cap.snap.duration === 100, JSON.stringify(cap.snap));
  ok('chanSpeedForMs() itself is capped at c.speed, with and without acceleration',
     cap.direct <= cap.chanSpeed && cap.noAccel === cap.chanSpeed,
     'direct '+cap.direct+', no-accel '+cap.noAccel+', limit '+cap.chanSpeed);
  ok('…and an unlimited channel (speed 0) is still unlimited — 4000 in 100 ms is 400',
     cap.unlimited === 400, String(cap.unlimited));
  ok('the act brick beside it is unchanged: its ramp frames still carry frame-filling speeds',
     cap.actMoves >= 2 && !cap.actOver, 'moving frames '+cap.actMoves);

  console.log('\n════ the Advanced control ════');
  const ui = await ev(()=>{
    EDIT.seq = blockNewRoutine('UI probe');
    const seq = MSTR.sequences[EDIT.seq];
    blockAdd(seq,'act','pie0',0,{dur:2000, rise:800, fall:800});
    BLK.adv = false; sqAdvViews();
    const hiddenPlain = $('sqStepWrap').classList.contains('hide');
    BLK.adv = true;  sqAdvViews();
    const shown = !$('sqStepWrap').classList.contains('hide');
    const values = Array.from($('sqStep').options).map(o=>+o.value);
    return { hiddenPlain, shown, values, selected: +$('sqStep').value,
             frames: seq.frames.length };
  });
  ok('the step control is Advanced-only', ui.hiddenPlain && ui.shown, JSON.stringify(ui));
  ok('it offers 0.25 / 0.5 / 0.75 / 1 s and shows the routine\'s own',
     ui.values.join() === '250,500,750,1000' && ui.selected === 500, JSON.stringify(ui));

  const changed = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const before = seq.frames.length;
    $('sqStep').value = '250';
    $('sqStep').dispatchEvent(new Event('change'));
    const after = MSTR.sequences[EDIT.seq];
    /* read the CHANGED state before undoing it — the same object is mutated
       in place, so reading after the undo just reports the undo twice */
    const mid = after.stepMs, frames = after.frames.length;
    const undone = blockUndo(after);
    return { before, mid, frames,
             undone, backTo: after.stepMs, backFrames: after.frames.length };
  });
  ok('choosing a finer step recompiles the routine there and then',
     changed.mid === 250 && changed.frames > changed.before, JSON.stringify(changed));
  ok('and UNDO puts the step back with the bricks — a snapshot carries both',
     changed.undone && changed.backTo === 500 && changed.backFrames === changed.before,
     JSON.stringify(changed));

  ok('a frame list has no ramps to draw, so it is not offered the control',
     await ev(()=>{
       const s = MSTR.sequences[EDIT.seq];
       const frames = JSON.parse(JSON.stringify(s.frames));
       delete s.blocks; s.frames = frames;      // now it is an import
       BLK.adv = true; sqAdvViews();
       return $('sqStepWrap').classList.contains('hide');
     }));

  console.log('\n════ the wire carries the authored timing (v1.66.1) ════');
  /* PCA_Bridge has NO speed command and needs none: it writes raw PCA9685
     ticks and never interpolates. The bench engine is what interpolates, and
     its onWrite IS the wire — one frame target already goes down as ~40
     stepped positions at 100 Hz. What was missing is that it paced them at the
     CHANNEL's speed rather than the FRAME's, so a 500 ms ramp step was crossed
     at whatever rate the bench happened to be set to and then waited. */
  const wire = await ev(()=>{
    const E = HW.engine();
    const c = MSTR.channels.find(x=>/^servo/i.test(x.mode) && x.act);
    const span = Math.abs(c.max - c.min);
    const run = speed => {
      pcaSetSpeed(E, c.i, c.speed|0);
      pcaSetTarget(E, c.i, Math.min(c.min,c.max));
      for(let i=0;i<60;i++) pcaStepChannel(E, c.i);
      let writes = 0; const real = E.onWrite;
      E.onWrite = (ch)=>{ if(ch === c.i) writes++; };
      LIVE.on = true;
      HW.drive(c.i, Math.max(c.min,c.max), speed);
      let ticks = 0;
      while(E.st[c.i].pos256 !== (E.st[c.i].aim<<8) && ticks < 500){ pcaStepChannel(E, c.i); ticks++; }
      E.onWrite = real;
      return { writes, ms: ticks*10 };
    };
    const none = run(0);
    const p500 = run(chanSpeedForMs(c, span, 500));
    const p900 = run(chanSpeedForMs(c, span, 900));
    HW.releaseDriveSpeeds();
    LIVE.on = false;
    return { chanSpeed: c.speed, none, p500, p900, restored: E.st[c.i].speed };
  });
  console.log('  '+JSON.stringify(wire));
  ok('one frame target is already ~40 stepped positions on the wire — the bridge '
     +'never needed a speed command', wire.none.writes > 20, JSON.stringify(wire.none));
  ok('a frame speed paces the wire to the frame: 500 ms asked, 500 ms taken',
     Math.abs(wire.p500.ms - 500) <= 60, JSON.stringify(wire.p500));
  ok('…and 900 ms asked, 900 ms taken — it follows the number, not a constant',
     Math.abs(wire.p900.ms - 900) <= 80 && wire.p900.writes > wire.p500.writes,
     JSON.stringify(wire.p900));
  ok('without a frame speed it still runs at the channel\'s own, unchanged',
     Math.abs(wire.none.ms - 410) <= 80, JSON.stringify(wire.none));
  ok('and disarming hands every channel back to the channel table',
     wire.restored === wire.chanSpeed, JSON.stringify(wire));

  console.log('\n════ a Maestro is the other case — it ramps for itself (v1.66.2) ════');
  /* The bridge writes raw ticks and never interpolates, so it wants the
     engine's 100 Hz stream. A Maestro does interpolate: Set Target starts a
     ramp it runs on the board. So it wants ONE Set Speed and ONE Set Target
     per move, and then silence. The two look nothing alike on the wire, which
     is right rather than a compromise — each board is asked for the thing it
     is good at. */
  const mst = await ev(()=>{
    const bytes = [];
    serialRaw = arr => bytes.push(Array.from(arr));
    SER.port = {fake:true}; SER.kind = 'maestro'; SER.blocked = false;
    SER.lastTicks = {}; SER.lastSpeed = {};
    MST.on = true; MST.chCount = 24; MST.quiet = false; MST.proto = 'compact';
    LIVE.on = true;
    const E = HW.engine();
    const c = MSTR.channels.find(x=>/^servo/i.test(x.mode) && x.act);
    const open = Math.max(c.min,c.max), shut = Math.min(c.min,c.max);
    const val = f => f[2] | (f[3] << 7);              // Pololu compact: low 7, high 7
    const grab = fn => { bytes.length = 0; fn();
                         for(let i=0;i<120;i++) pcaStepChannel(E, c.i);
                         return bytes.slice(); };

    const p500 = grab(()=>HW.drive(c.i, open, chanSpeedForMs(c, open-shut, 500)));
    pcaSetTarget(E, c.i, shut); for(let i=0;i<120;i++) pcaStepChannel(E,c.i);
    SER.lastTicks = {}; SER.lastSpeed = {};
    const p900 = grab(()=>HW.drive(c.i, open, chanSpeedForMs(c, open-shut, 900)));
    const again = grab(()=>HW.drive(c.i, open, chanSpeedForMs(c, open-shut, 900)));
    const off   = grab(()=>serialWrite(c.i, null));

    MST.quiet = true;                                  // the sim shapes instead
    SER.lastTicks = {}; SER.lastSpeed = {};
    pcaSetTarget(E, c.i, shut); for(let i=0;i<120;i++) pcaStepChannel(E,c.i);
    const streamed = grab(()=>HW.drive(c.i, open, chanSpeedForMs(c, open-shut, 500)));
    MST.quiet = false; LIVE.on = false; SER.port = null; SER.kind = '';

    return {
      p500: { n:p500.length, cmds:p500.map(f=>f[0]), speed:p500[0] && val(p500[0]),
              target:p500[1] && val(p500[1]) },
      p900speed: p900[0] && val(p900[0]),
      repeatBytes: again.length,
      offCmds: off.map(f=>f[0]),
      streamed: { n:streamed.length, anySetSpeed: streamed.some(f=>f[0]===0x87) },
      open
    };
  });
  console.log('  '+JSON.stringify(mst));
  ok('a paced Maestro gets ONE Set Speed then ONE Set Target — not a stream',
     mst.p500.n === 2 && mst.p500.cmds[0] === 0x87 && mst.p500.cmds[1] === 0x84,
     JSON.stringify(mst.p500));
  ok('the target on the wire is the frame\'s, decoded from Pololu\'s two 7-bit halves',
     mst.p500.target === mst.open, JSON.stringify(mst.p500));
  ok('and the speed is the FRAME\'s — a longer frame sends a slower one',
     mst.p500.speed > mst.p900speed && mst.p900speed > 0,
     '500ms→'+mst.p500.speed+'  900ms→'+mst.p900speed);
  ok('the same move twice says nothing the second time', mst.repeatBytes === 0,
     String(mst.repeatBytes));
  ok('an OFF is an event, not a position — it still reaches a paced board',
     mst.offCmds.length === 1 && mst.offCmds[0] === 0x84, JSON.stringify(mst.offCmds));
  ok('and with the sim shaping instead, it is a stream again with no Set Speed',
     mst.streamed.n > 20 && !mst.streamed.anySetSpeed, JSON.stringify(mst.streamed));

  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
