/* Puppet mode (v1.14.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-02: "change the controller to a servo input only and each
   servo is controlled by a stick or button … then record those actions."
   Covers: the mode switch and mapping table, auto-map, spring-back stick
   feel, the sketch gate (drive/sounds see a silent pad), hold vs latch
   buttons, the 3-2-1 recorder capturing real puppeteering into a
   frame-list sequence in the library, replay, and the sequencer handshake. */
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

  console.log('\n════ the mode switch ════');
  ok('the bar sits above the pad with the switch, off by default', await ev(()=>
    !!$('pupbar') && !!$('pupOn') && !$('pupOn').checked && !PUPPET.on));
  const on = await ev(()=>{
    puppetSet(true);
    const chans = MSTR.channels.filter(c=>c.act && /^servo/i.test(c.mode));
    return {
      on: PUPPET.on,
      cls: document.body.classList.contains('pupmode'),
      chans: chans.length,
      mapped: chans.filter(c=>PUPPET.map[c.i]!==undefined).length,
      rows: $('pupside').querySelectorAll('.puprow').length,
      recBtn: !!$('pupRec')
    };
  });
  ok('switching on auto-maps the servos across the pad', on.on && on.cls && on.mapped>0, JSON.stringify(on));
  ok('every servo channel gets a mapping row', on.rows===on.chans, on.rows+' rows / '+on.chans+' channels');
  ok('sticks and triggers are dealt before buttons', await ev(()=>{
    const first = MSTR.channels.filter(c=>c.act && /^servo/i.test(c.mode))[0];
    return PUPPET.map[first.i]==='LY+';
  }));
  ok('record controls appear', on.recBtn);

  console.log('\n════ spring-back puppeteering ════');
  const spring = await ev(()=>{
    window.__pup = {};
    const chans = MSTR.channels.filter(c=>c.act && /^servo/i.test(c.mode));
    __pup.cLY = chans.find(c=>PUPPET.map[c.i]==='LY+');
    INPUT.virtual.LY = 1;                       // push the left stick up
    return !!__pup.cLY;
  });
  await page.waitForTimeout(250);
  ok('push the stick — the mapped part is commanded OPEN', spring && await ev(()=>{
    const c = __pup.cLY;
    return Math.abs(ACT_T[c.act] - chanNorm(c, blockOpen(c))) < 0.02;
  }));
  await ev(()=>{ INPUT.virtual.LY = 0; });      // let go
  await page.waitForTimeout(250);
  ok('let go — it springs back closed', await ev(()=>{
    const c = __pup.cLY;
    return Math.abs(ACT_T[c.act] - chanNorm(c, blockClosed(c))) < 0.02;
  }));
  ok('half a stick is half the throw', await ev(async ()=>{
    INPUT.virtual.LY = 0.5;
    await new Promise(r=>setTimeout(r,200));
    const c = __pup.cLY;
    const closed = blockClosed(c), open = blockOpen(c);
    const want = chanNorm(c, Math.round(closed + (open-closed)*0.5));
    const good = Math.abs(ACT_T[c.act] - want) < 0.03;
    INPUT.virtual.LY = 0;
    return good;
  }));

  console.log('\n════ the sketch sees a silent pad ════');
  const gate = await ev(async ()=>{
    INPUT.virtual.LY = 1; INPUT.virtual.btn.START = 1;
    await new Promise(r=>setTimeout(r,150));
    const r = {
      raw: XB.hat.LeftHatY,
      sketch: getAnalogHat('LeftHatY'),
      press: getButtonPress('A'),
      drive: FW.driveThrottle,
      armed: FW.isDriveEnabled
    };
    INPUT.virtual.LY = 0; INPUT.virtual.btn.START = 0;
    return r;
  });
  ok('the raw pad is live (the mirror still works)', gate.raw>30000, 'raw '+gate.raw);
  ok('…but the sketch reads a centred stick', gate.sketch===0);
  ok('…and silent buttons — START cannot arm the feet', gate.press===0 && gate.drive===0 && !gate.armed);

  console.log('\n════ buttons: hold and latch ════');
  const btn = await ev(async ()=>{
    const chans = MSTR.channels.filter(c=>c.act && /^servo/i.test(c.mode));
    let c = chans.find(x=>PUPPET.map[x.i]==='A');
    if(!c){ c = chans[chans.length-1]; PUPPET.map[c.i]='A'; }
    __pup.cA = c;
    INPUT.virtual.btn.A = 1;
    await new Promise(r=>setTimeout(r,150));
    const held = Math.abs(ACT_T[c.act] - chanNorm(c, blockOpen(c))) < 0.02;
    INPUT.virtual.btn.A = 0;
    await new Promise(r=>setTimeout(r,150));
    const released = Math.abs(ACT_T[c.act] - chanNorm(c, blockClosed(c))) < 0.02;
    return {held, released};
  });
  ok('hold: open while pressed, closed on release', btn.held && btn.released, JSON.stringify(btn));
  const latch = await ev(async ()=>{
    const c = __pup.cA;
    PUPPET.latch[c.i] = true;
    INPUT.virtual.btn.A = 1; await new Promise(r=>setTimeout(r,120));
    INPUT.virtual.btn.A = 0; await new Promise(r=>setTimeout(r,200));
    const stays = Math.abs(ACT_T[c.act] - chanNorm(c, blockOpen(c))) < 0.02;
    INPUT.virtual.btn.A = 1; await new Promise(r=>setTimeout(r,120));
    INPUT.virtual.btn.A = 0; await new Promise(r=>setTimeout(r,200));
    const flips = Math.abs(ACT_T[c.act] - chanNorm(c, blockClosed(c))) < 0.02;
    delete PUPPET.latch[c.i]; delete PUPPET.held[c.i];
    return {stays, flips};
  });
  ok('latch: press flips open, next press flips closed', latch.stays && latch.flips, JSON.stringify(latch));

  console.log('\n════ record a performance ════');
  /* The whole take runs inside ONE evaluate with a synthetic clock —
     rAF in headless is ~10 fps, far too slow to countdown in real time,
     and a single evaluate cannot be interleaved by rAF ticks, so the
     timing below is exact. */
  const take = await ev(()=>{
    const out = {};
    pupRecArm();
    puppetTick(30);
    out.armed = PUPPET.rec.phase==='count' && $('pupcount').classList.contains('on');
    puppetTick(3200);                              // the 3-2-1 elapses
    out.rolling = PUPPET.rec.phase==='rec';
    /* the performance: stick up, hold, release, half, done */
    const step = (ly, ms)=>{
      INPUT.virtual.LY = ly; pollInput();
      for(let t=0; t<ms; t+=25) puppetTick(25);
    };
    step(1, 450); step(0, 450); step(0.5, 300); step(0, 250);
    pupRecStop();
    const seq = MSTR.sequences.find(s=>s.name==='Take 1');
    if(!seq){ out.take = null; return out; }
    const c = __pup.cLY;
    const total = seq.frames.reduce((a,f)=>a+f.duration,0);
    const first = seq.frames[0];
    const mapped = MSTR.channels.filter(x=>x.act && /^servo/i.test(x.mode) && PUPPET.map[x.i]!==undefined);
    const lo=Math.min(c.min,c.max), hi=Math.max(c.min,c.max);
    let sawOpen=false, inRange=true;
    seq.frames.forEach(f=>{
      const v=f.targets[c.i];
      if(v){ if(v<lo||v>hi) inRange=false; if(Math.abs(v-blockOpen(c))<40) sawOpen=true; }
    });
    out.take = {
      cat: seq.cat, frames: seq.frames.length, total,
      firstFull: mapped.every(x=>first.targets[x.i]>0),
      sawOpen, inRange, noBlocks: !seq.blocks,
      nextTake: PUPPET.rec.take, playBtn: !!$('pupPlay')
    };
    return out;
  }).then(o=>{ ok('arming starts the 3-2-1, overlay showing', o.armed);
               ok('after the countdown it is rolling', o.rolling);
               return o.take; });
  ok('the take lands in the library under "Recorded"', !!take && take.cat==='Recorded', JSON.stringify(take));
  ok('it is a plain frame list — same species as an imported sequence', take && take.noBlocks);
  ok('keyframes only where something changed', take && take.frames>=3 && take.frames<40, take && take.frames+' frames');
  ok('the length matches the performance', take && take.total>=1300 && take.total<=1700, take && take.total+' ms');
  ok('first frame carries the whole starting pose', take && take.firstFull);
  ok('the stick-up moment was captured at full throw, all values legal', take && take.sawOpen && take.inRange);
  ok('the next take numbers itself, ▶ Last take appears', take && take.nextTake===2 && take.playBtn);

  console.log('\n════ replay ════');
  const rep = await ev(()=>{
    pupPlayLast();
    const started = PUPPET.play !== null;
    let followed = false;
    const c = __pup.cLY;
    for(let t=0; t<3000 && PUPPET.play; t+=50){
      puppetTick(50);
      if(Math.abs(ACT_T[c.act] - chanNorm(c, blockOpen(c))) < 0.02) followed = true;
    }
    return {started, followed, done: PUPPET.play===null};
  });
  ok('▶ Last take replays through the servo physics', rep.started && rep.followed, JSON.stringify(rep));
  ok('…and finishes on its own', rep.done);

  console.log('\n════ handshakes ════');
  ok('entering the sequencer takes the puppet off', await ev(()=>{
    setStripMode('seq');
    return !PUPPET.on && !document.body.classList.contains('pupmode');
  }));
  ok('the take shows in the sequencer library, grouped Recorded', await ev(()=>{
    buildSequencer();
    const t = $('seqlib').textContent;
    return /Recorded/.test(t) && /Take 1/.test(t);
  }));
  await ev(()=>{ setStripMode('pad'); });
  ok('switching puppet off frees the sketch', await ev(async ()=>{
    puppetSet(true); puppetSet(false);
    INPUT.virtual.LY = 1;
    await new Promise(r=>setTimeout(r,150));
    const live = getAnalogHat('LeftHatY');
    INPUT.virtual.LY = 0;
    return live > 30000;
  }));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
