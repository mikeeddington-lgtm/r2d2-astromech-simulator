/* the servo bench — PCA Studio folded into the sim
   -------------------------------------------------------------------------
   Three things moved out of Studio and into shared modules behind the HW
   seam: the channel table, the board link and the setup wizard. These
   assertions are the sim's half of that contract — that the seam reaches
   MSTR, that the bench engine is real, and that driving a channel moves the
   engine, the model and (when there is one) the wire, in that order. */
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
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w'); wizFinish(); });
  await ev(()=>{ makeStarter('dome'); rebuildMaestroUI(); });

  console.log('\n════ the HW seam reaches the sim\'s own channels ════');
  ok('HW exists and its channels ARE MSTR.channels', await ev(()=>
    typeof HW !== 'undefined' && HW.channels() === MSTR.channels));
  ok('the channel count follows the board, not the array', await ev(()=>
    HW.count() >= MSTR.servoCount && HW.count() >= 1));
  ok('ensure() fills a hole rather than returning undefined', await ev(()=>{
    const n = HW.count();
    const c = HW.ensure(n+3);
    return !!c && c.i === n+3 && MSTR.channels[n+3] === c;
  }));

  console.log('\n════ the bench engine ════');
  ok('the sim now has a pcaseq instance of its own', await ev(()=>{
    const E = HW.engine();
    return !!E && Array.isArray(E.st) && E.st.length >= HW.count();
  }));
  const drive = await ev(()=>{
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode) && c.act);
    const c = MSTR.channels[ch];
    ACT_T[c.act] = 0;
    HW.drive(ch, c.max);
    const target = HW.engine().st[ch].target;
    const mirrored = ACT_T[c.act];
    /* walk it there on the engine's own clock, not the browser's */
    for(let k=0;k<600;k++) HW.tick(10);
    return {ch, target, mirrored, landed:HW.pos(ch), max:c.max, min:c.min};
  });
  ok('driving a channel commands the engine', drive.target === drive.max,
     'target '+drive.target+' of '+drive.max);
  ok('…and the engine walks it there under its own speed law',
     drive.landed === drive.max, 'landed '+drive.landed);
  ok('…and the 3D droid mirrors it, so the model follows the bench',
     drive.mirrored > 0.9, 'ACT_T '+drive.mirrored);
  ok('0 means stop pulsing, not "go to zero"', await ev(()=>{
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    HW.drive(ch, 0);
    for(let k=0;k<40;k++) HW.tick(10);
    return HW.engine().st[ch].active === false;
  }));
  /* the engine is not free — a session that never opens the Bench and never
     plugs anything in must not pay for one every frame */
  /* since v1.31.1 the engine steps on its OWN 10 ms interval, not the
     animation frame — a fixed-rate engine driven from a variable-rate clock
     delivered 1,2,2 steps per frame and Mike felt it on real servos. The
     frame's only job now is to start and stop that heartbeat. */
  const clock = await ev(async ()=>{
    wsSet('drive'); hwClose(); hwTick();
    const idleRunning = hwClockRunning();
    wsSet('bench'); hwTick();
    const busyRunning = hwClockRunning();
    const t0 = HW.engine().ticks;
    await new Promise(r=>setTimeout(r, 300));
    const t1 = HW.engine().ticks;
    wsSet('drive'); hwTick();
    const stopped = !hwClockRunning();
    const t2 = HW.engine().ticks;
    await new Promise(r=>setTimeout(r, 200));
    return {idleRunning, busyRunning, stopped, ran:t1-t0, after:HW.engine().ticks-t2};
  });
  ok('the bench clock starts when something is watching and stops when not',
     clock.idleRunning === false && clock.busyRunning === true && clock.stopped === true,
     JSON.stringify(clock));
  ok('…and while it runs the engine ticks at ~10 ms, not at frame rate',
     clock.ran >= 20 && clock.ran <= 45 && clock.after === 0,
     clock.ran+' ticks in 300 ms, '+clock.after+' after stopping');

  /* v1.45.0: this used to drive #hwTable inside the #hwWrap overlay. That
     overlay was the duplicate Mike asked to be rid of, so the assertions
     move to the surface that absorbed it — the bench's own channel table,
     which is now the one place a channel is configured. hw-table.js itself
     is still shared and still exercised, by PCA Studio's suite, which is
     where its page furniture actually exists. */
  console.log('\n════ the bench channel table ════');
  const tbl = await ev(()=>{
    hwOpen();
    const out = {open:SETUP.open};
    const tab = ()=>$('setBody').querySelector('table.chtab');
    out.rows = $('setBody').querySelectorAll('tr[data-ch]').length;
    out.buildRows = HW.count();
    const head = tab().rows[0].textContent;
    out.us = /µs/.test(head);
    out.rev = /rev/i.test(head);
    out.ease = /ease/i.test(head);
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    const cell = k=>$('setBody').querySelector('tr[data-ch="'+ch+'"] [data-k='+k+']');
    const c = MSTR.channels[ch];
    out.shownMin = cell('minUs').value;
    out.storedMin = c.min;
    cell('minUs').value = '1100'; cell('minUs').dispatchEvent(new Event('input',{bubbles:true}));
    out.afterType = c.min;
    /* centre stays editable with boot off — boot is WHEN, not WHETHER */
    c.homemode = 'Off'; setupRender();
    out.homeEditable = !cell('ctrUs').disabled;
    /* reverse is drawn from the numbers, never stored */
    out.revBefore = {checked:cell('rev').checked, min:c.min, max:c.max};
    cell('rev').click();
    out.revAfter = {checked:cell('rev').checked, min:c.min, max:c.max};
    cell('rev').click();
    out.revBack = {min:c.min, max:c.max};
    /* the position bar and the µs readout move with the engine */
    HW.drive(ch, Math.max(c.min,c.max));
    for(let k=0;k<600;k++) HW.tick(10);
    hwTableSync();
    out.bar = $('spb'+ch).style.width;
    out.readout = $('sus'+ch).textContent;
    hwClose();
    out.closed = !SETUP.open;
    return out;
  });
  ok('the bench opens with one row per channel the build has',
     tbl.open && tbl.rows === tbl.buildRows && tbl.rows > 0 && tbl.closed, tbl.rows+' rows');
  ok('it carries the same columns Studio has — µs, rev and ease',
     tbl.us && tbl.rev && tbl.ease);
  ok('µs in, quarter-µs stored',
     tbl.shownMin === String(Math.round(tbl.storedMin/4)) && tbl.afterType === 4400,
     'showed '+tbl.shownMin+', typing 1100 stored '+tbl.afterType);
  ok('centre is editable with boot off', tbl.homeEditable);
  ok('reverse swaps the ends and the tick follows the numbers',
     tbl.revBefore.checked === false && tbl.revAfter.checked === true
     && tbl.revAfter.min === tbl.revBefore.max
     && tbl.revBack.min === tbl.revBefore.min,
     JSON.stringify(tbl.revAfter));
  ok('the position bar and the µs readout follow the engine',
     parseFloat(tbl.bar) > 95 && /µs/.test(tbl.readout), tbl.bar+' · '+tbl.readout);

  console.log('\n════ nothing rewrote the calibrated table ════');
  ok('opening and closing the bench changes no endpoint', await ev(()=>{
    const before = JSON.stringify(MSTR.channels.map(c=>c && [c.min,c.max,c.home]));
    hwOpen(); hwClose(); hwOpen(); hwClose();
    return JSON.stringify(MSTR.channels.map(c=>c && [c.min,c.max,c.home])) === before;
  }));

  console.log('\n════ the setup wizard, in the sim ════');
  const wiz = await ev(()=>{
    const out = {};
    setupOpen(4);
    out.open = SETUP.open && !!document.querySelector('.setcard');
    out.rows = document.querySelectorAll('#setBody tr[data-ch]').length;
    out.buildRows = HW.count();
    /* the dial drives the SIM's engine and the SIM's model */
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode) && c.act);
    const keep = [MSTR.channels[ch].min, MSTR.channels[ch].max, MSTR.channels[ch].home];
    setupCalOpen(ch);
    out.dial = !!document.getElementById('calDial');
    ACT_T[MSTR.channels[ch].act] = 0;
    calSet(6200);
    out.drove = HW.engine().st[ch].target;
    out.mirrored = ACT_T[MSTR.channels[ch].act];
    SETUP.cal.min = 4300; SETUP.cal.max = 7100; SETUP.cal.home = 5800;
    setupCalCommit();
    out.committed = [MSTR.channels[ch].min, MSTR.channels[ch].max, MSTR.channels[ch].home];
    /* the exports know which app they came out of */
    const h = setupServosH();
    out.hRows = (h.match(/MPCA_EASE_/g)||[]).length;
    out.hVer = /R2-D2 Simulator/.test(h);
    out.hGuard = /#error/.test(h);
    out.json = JSON.parse(setupJson()).kind;
    /* the other five steps came across too */
    setupGo(2); out.svg = /<svg/.test($('setBody').innerHTML);
    setupGo(3); out.cfg = /#define/.test($('setBody').textContent);
    setupGo(5); out.done = /Ready/.test($('setBody').textContent);
    const before = MSTR.channels.length;
    setupApply();
    out.applied = !SETUP.open;
    out.kept = MSTR.channels.length === before;
    /* put the channel back the way the rest of the suite found it */
    MSTR.channels[ch].min = keep[0]; MSTR.channels[ch].max = keep[1]; MSTR.channels[ch].home = keep[2];
    return out;
  });
  ok('the six-step wizard opens inside the sim', wiz.open);
  ok('its table is the BUILD\'s channel count, not the wizard\'s board answer',
     wiz.rows === wiz.buildRows && wiz.rows > 0, wiz.rows+' rows for a '+wiz.buildRows+'-channel build');
  ok('the dial drives the bench engine and the 3D droid',
     wiz.dial && wiz.drove === 6200 && wiz.mirrored > 0.2,
     'target '+wiz.drove+', ACT_T '+wiz.mirrored);
  ok('committing writes MSTR.channels — the wizard IS the endpoint editor now',
     wiz.committed.join() === '4300,7100,5800', wiz.committed.join());
  ok('servos.h comes out stamped with the sim, one row per channel, guarded',
     wiz.hVer && wiz.hRows === wiz.buildRows && wiz.hGuard, wiz.hRows+' rows');
  ok('the wiring diagram, the sketch config and Finish all came across',
     wiz.svg && wiz.cfg && wiz.done);
  ok('applying closes it and does NOT resize the droid\'s channel table',
     wiz.applied && wiz.kept);

  console.log('\n════ the bench\'s wide unlock widens the ENGINE range (v1.39.5) ════');
  const wide = await ev(()=>{
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode) && c.act);
    setupCalOpen(ch);
    SETUP.cal.wide = true; calApplyRange();
    HW.drive(ch, 9200);
    const wideTarget = HW.engine().st[ch].target;
    SETUP.cal.wide = false; calApplyRange();
    HW.drive(ch, 9200);
    const reClamped = HW.engine().st[ch].target;
    setupCalCancel();
    return {wideTarget, reClamped};
  });
  ok('ticking the wide unlock widens the engine range too — 9200 reaches the servo, not clamped to 8000',
     wide.wideTarget === 9200, JSON.stringify(wide));
  ok('unticking it re-clamps the engine back to the 8000 safe ceiling',
     wide.reClamped === 8000, JSON.stringify(wide));

  console.log('\n════ the board link ════');
  const link = await ev(async ()=>{
    /* serialFrame QUEUES and flushes on a microtask, exactly as it does
       against real hardware — so the reads below have to wait a turn */
    const flush = ()=>new Promise(r=>setTimeout(r,0));
    const out = {};
    hwOpen();
    out.bar   = !!$('bSetConnect') && !!$('serialChip') && !!$('bMon');
    out.chip  = $('serialChip').textContent;
    out.mon   = !!$('monOut') && $('secMon').classList.contains('hide');
    monShow(true);  out.monOpens  = !$('secMon').classList.contains('hide');
    monShow(false); out.monCloses = $('secMon').classList.contains('hide');

    /* the wire protocol, without a wire: stand a capture in for the writer.
       Three bytes per position — 0x80|channel, payload>>7, payload&0x7F —
       the high bit marking the header so a dropped byte self-resyncs. */
    const seen = [];
    SER.writer = { write:b=>{ seen.push(...b); return Promise.resolve(); } };
    SER.port = {};                       /* "connected" as far as serialWrite cares */
    SER.blocked = false;
    serialFrame(3, 6000);
    await flush();
    /* the engine is ticking on the page's own clock and writing too, so look
       for the frame IN the stream rather than expecting to own it */
    const want = [0x80|3, 6000>>7, 6000&0x7F];
    out.frame = seen.slice(0, 12);
    out.frameFound = seen.some((_,k)=>want.every((v,j)=>seen[k+j]===v));
    /* and the engine puts positions on the wire by itself */
    seen.length = 0;
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    HW.rebuild(true);
    SER.writer = { write:b=>{ seen.push(...b); return Promise.resolve(); } };
    HW.drive(ch, MSTR.channels[ch].home || 6000);
    for(let k=0;k<200;k++) HW.tick(10);
    await flush();
    out.wrote = seen.length;
    out.wroteHeader = seen.length ? (seen[0] & 0x80) === 0x80 : false;
    /* a co-processor's USB is a TEXT console — blocked must mean silent */
    /* "monitor only" is enforced in serialWrite, which is what everything
       upstream calls — serialFrame is the raw encoder below that gate */
    SER.blocked = true;
    await flush();
    seen.length = 0;
    serialWrite(ch, 5000); serialWrite(ch, 7000);
    for(let k=0;k<40;k++) HW.tick(10);
    await flush();
    out.blockedSilent = seen.length === 0;
    SER.blocked = false; SER.port = null; SER.writer = null;
    hwClose();
    return out;
  });
  ok('the bench carries a connect button, a chip and a monitor',
     link.bar && link.mon, 'chip reads "'+link.chip+'"');
  ok('the monitor opens and closes', link.monOpens && link.monCloses);
  ok('a position is three bytes: header, high, low — and the header self-resyncs',
     link.frameFound && (link.frame[0] & 0x80) === 0x80,
     JSON.stringify(link.frame));
  ok('the engine puts its own positions on the wire',
     link.wrote > 0 && link.wroteHeader, link.wrote+' bytes');
  ok('a monitor-only board is never streamed to — its USB is a text console',
     link.blockedSilent);

  console.log('\n════ the servo refresh rate reaches the wire ════');
  const freq = await ev(async ()=>{
    const flush = ()=>new Promise(r=>setTimeout(r,0));
    const seen = [];
    hwOpen();
    SER.writer = { write:b=>{ seen.push(...b); return Promise.resolve(); } };
    SER.port = {}; SER.blocked = false;
    const out = {def:HW.freq()};
    /* serialConfig used to hardcode 50 while the bridge sketch had accepted
       channel 63 all along — the wizard's answer never left the browser */
    seen.length = 0; serialConfig(); await flush();
    const want = [0x80|63, HW.freq()>>7, HW.freq()&0x7F];
    out.configCarries = seen.some((_,k)=>want.every((v,j)=>seen[k+j]===v));
    /* and it can be changed on a running board */
    seen.length = 0;
    serialSetFreq(200); await flush();
    const w2 = [0x80|63, 200>>7, 200&0x7F];
    out.set = HW.freq();
    out.sentLive = seen.some((_,k)=>w2.every((v,j)=>seen[k+j]===v));
    out.clamped = (serialSetFreq(9000), HW.freq());
    serialSetFreq(50);
    SER.port = null; SER.writer = null; hwClose();
    return out;
  });
  ok('serialConfig sends the configured rate, not a hardcoded 50',
     freq.configCarries, 'default '+freq.def+' Hz');
  ok('the rate can be changed on a running board', freq.set === 200 && freq.sentLive);
  ok('…and is clamped to something a servo might survive', freq.clamped === 400, freq.clamped+' Hz');

  console.log('\n════ serialTicksFor follows HW.freq() (v1.39.5) ════');
  const ticksFreq = await ev(()=>{
    serialSetFreq(200);
    const at200 = serialTicksFor(6000);
    serialSetFreq(50);
    const at50 = serialTicksFor(6000);
    return {at200, at50};
  });
  ok('serialTicksFor(6000) tracks the configured rate — 1229 ticks at 200 Hz',
     ticksFreq.at200 === 1229, JSON.stringify(ticksFreq));
  ok('…and 307 ticks back at 50 Hz, not a hardcoded 20000 µs period',
     ticksFreq.at50 === 307, JSON.stringify(ticksFreq));

  /* ================================================================
     v1.39.0 — Mike: "for the Sequencer we should have the option to
     drive the real servos too." The seam is playback.js, so this is
     tested where the wire is, not where the button is.
     ================================================================ */
  console.log('\n════ the sequencer can drive real servos ════');
  const live = await ev(async ()=>{
    const flush = ()=>new Promise(r=>setTimeout(r,0));
    const out = {};
    /* two channels: one mapped to a droid part, one board-only */
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode) && c.act);
    let bo = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode) && !c.act);
    if(bo < 0){ bo = MSTR.channels.findIndex((c,i)=>c && i!==ch && /^servo/i.test(c.mode));
                MSTR.channels[bo].act = ''; }
    const targets = [];
    const mid = c=>(Math.min(c.min,c.max)+Math.max(c.min,c.max))>>1;
    targets[ch] = mid(MSTR.channels[ch]);
    targets[bo] = mid(MSTR.channels[bo]);

    out.readyOff = liveReady();                 /* nothing connected yet */
    SER.port = {}; SER.blocked = false;
    SER.writer = { write:b=>Promise.resolve() };
    out.readyOn = liveReady();
    out.blockedNever = (SER.blocked = true, liveOn());
    SER.blocked = false;

    /* DISARMED: the model moves, the board does not */
    LIVE.on = false;
    HW.rebuild(true);
    applyFrameTargets(targets);
    out.quiet = !HW.engine().st[ch].active && !HW.engine().st[bo].active;

    /* ARMED: the same frame reaches the engine, and the engine owns the wire */
    LIVE.on = true;
    applyFrameTargets(targets);
    out.drove   = HW.engine().st[ch].target;
    out.boardOnly = HW.engine().st[bo].target;   /* no `act` is still a servo */
    out.model   = ACT_T[MSTR.channels[ch].act];

    /* a routine from another droid cannot drive this one past its stops */
    const c = MSTR.channels[ch], hi = Math.max(c.min,c.max);
    const wild = []; wild[ch] = hi + 4000;
    applyFrameTargets(wild);
    out.clamped = HW.engine().st[ch].target;
    out.hi = hi;

    /* 0 still means "leave this channel alone" */
    const zero = []; zero[ch] = 0;
    applyFrameTargets(zero);
    out.zeroKept = HW.engine().st[ch].target === hi;

    /* v1.39.4 — Mike: "comming out of sequencer shoudl dissable live mode."
       The arm is sequencer state, and an arm whose amber button is off
       screen is an arm you have forgotten. */
    setStripMode('seq');
    LIVE.on = true;
    setStripMode('pad');
    out.leftDesk = LIVE.on === false;
    out.stillConnected = liveReady();      /* the LINK stays — only the arm goes */

    /* the button says which of the three states it is in — re-armed, since
       walking back into the desk deliberately does NOT restore the arm */
    setStripMode('seq');
    LIVE.on = true;
    liveUiSync(); out.labelLive = $('sqLive').textContent;
    LIVE.on = false; liveUiSync(); out.labelIdle = $('sqLive').textContent;
    /* unplugging disarms — staying armed would mean the NEXT connect starts
       driving with nobody expecting it */
    LIVE.on = true;
    SER.port = null; SER.writer = null;
    serialUiSync();
    out.disarmed = LIVE.on === false;
    out.labelNone = $('sqLive').textContent;
    setStripMode('pad');
    await flush();
    return out;
  });
  ok('a board that is only a text console is never driven from here',
     live.readyOn && !live.readyOff && !live.blockedNever);
  ok('with the switch off a sequence moves the model and nothing else', live.quiet);
  ok('armed, a frame drives the engine — which is what owns the wire',
     live.drove > 0 && live.model > 0, 'target '+live.drove);
  ok('a channel mapped to no part is still a real servo and still moves',
     live.boardOnly > 0, 'target '+live.boardOnly);
  ok('targets are clamped into THIS droid\'s travel, not the routine\'s',
     live.clamped === live.hi, live.clamped+' vs '+live.hi);
  ok('a target of 0 still means "leave this channel alone"', live.zeroKept);
  ok('the button names the state it is in, all three of them',
     /Live/.test(live.labelLive) && /Sim only/.test(live.labelIdle) && /No board/.test(live.labelNone),
     [live.labelLive, live.labelIdle, live.labelNone].join(' · '));
  ok('unplugging the board disarms it', live.disarmed);
  ok('leaving the sequencer disarms it, without dropping the link',
     live.leftDesk && live.stillConnected);

  /* ================================================================
     v1.40.0 — Mike: "boot should not be auto ticked just because it's
     setup." Ticking USE turns a pin into a servo; ticking BOOT (drive to
     centre at power-up) is a separate, explicit opt-in. Two places used to
     tick it for you: setupUse() left a stale homemode in place when a
     channel was re-enabled, and setupCalCommit() forced 'Goto' onto every
     dial commit because the captured centre is almost never literally 0.
     ================================================================ */
  console.log('\n════ boot is opt-in, not automatic (v1.40.0) ════');
  const boot = await ev(()=>{
    const out = {};
    setupOpen(4);
    /* two channels nothing else in this suite reads by index — the
       trailing, unnamed padding rows a 24-channel dome starter leaves
       after its 20 named ones */
    const blank = ()=>HW.channels().map((c,k)=>[c,k])
      .filter(([c])=>c && !c.act && !/^servo/i.test(c.mode)).map(([,k])=>k);
    const [j1, j2] = blank();
    const save = i=>({mode:HW.channels()[i].mode, name:HW.channels()[i].name, homemode:HW.channels()[i].homemode});
    const before1 = save(j1), before2 = save(j2);

    /* the shape of the bug: a channel that WAS a servo with boot on, then
       got unticked — re-ticking used to leave the stale 'Goto' in place,
       so the box came back pre-ticked with no click on it */
    const c1 = HW.channels()[j1];
    c1.mode = 'Servo'; c1.homemode = 'Goto';
    setupUse(j1, false);           // untick "use"
    setupUse(j1, true);            // re-tick — a fresh opt-in, not a restore
    out.reenabled = c1.homemode;

    /* a channel that has never been used before defaults the same way,
       and the rendered table's own boot checkbox agrees */
    setupUse(j2, true);
    out.fresh = HW.channels()[j2].homemode;
    setupRender();
    const box = document.querySelector('#setBody tr[data-ch="'+j2+'"] [data-k="boot"]');
    out.boxTicked = box ? box.checked : null;

    /* calibrating on the dial is measuring travel, not answering "drive to
       centre at power-up?" — capturing a non-zero centre (the normal case)
       must not silently opt the channel into boot either */
    setupCalOpen(j2);
    SETUP.cal.min = 4200; SETUP.cal.max = 7800; SETUP.cal.home = 6100;
    setupCalCommit();
    out.afterCal = HW.channels()[j2].homemode;

    /* the apply bar's own default (untouched, "at power-up") is limp too */
    out.applyDefault = setupApplyDef('boot').def;

    /* leave both rows as this suite found them */
    const restore = (i, s)=>{ const c=HW.channels()[i]; c.mode=s.mode; c.name=s.name; c.homemode=s.homemode; };
    restore(j1, before1); restore(j2, before2);
    setupClose();
    return out;
  });
  ok('re-enabling a channel resets boot to Off — no stale Goto survives an untick/retick',
     boot.reenabled === 'Off', boot.reenabled);
  ok('a freshly-enabled channel defaults to homemode Off, boot unticked in the table',
     boot.fresh === 'Off' && boot.boxTicked === false, JSON.stringify(boot));
  ok('capturing endpoints on the dial does not auto-tick boot either',
     boot.afterCal === 'Off', boot.afterCal);
  ok('the apply-to-selected bar defaults "at power-up" to limp, not go-to-centre',
     boot.applyDefault === 'limp', boot.applyDefault);

  console.log('\n════ chPartOptions: the human label alone, the CAD name in `cad` (v1.40.0) ════');
  const parts = await ev(()=>{
    const list = chPartOptions();
    const named = list.filter(p=>!p.other);
    /* pie4 is one of the four CAD parts all literally called "Pie5" —
       the label must read "Pie 5", never "Pie 5  (Pie5)" */
    const pie = named.find(p=>p.act==='pie4');
    const others = list.filter(p=>p.other);
    return {
      total: list.length,
      anyParens: named.some(p=>/\(/.test(p.label)),
      allHaveCad: named.every(p=>!!p.cad),
      pieLabel: pie && pie.label,
      pieCad: pie && pie.cad,
      otherCount: others.length,
      otherLabels: others.map(p=>p.label),
      otherFlag: others.every(p=>p.other===true && !p.cad),
      hwPartsSame: HW.parts().length === list.length
    };
  });
  ok('no option label carries a parenthetical CAD name', !parts.anyParens);
  ok('every CAD-backed option carries its CAD name in `cad` instead', parts.allHaveCad);
  ok('pie4 reads "Pie 5" with "Pie5" riding along as `cad`, not in the label',
     parts.pieLabel === 'Pie 5' && parts.pieCad === 'Pie5', JSON.stringify([parts.pieLabel, parts.pieCad]));
  ok('the ten Others are appended, flagged, and carry no CAD name',
     parts.otherCount === 10 && parts.otherFlag, JSON.stringify(parts.otherLabels));
  ok('Other 1..Other 10, in order', parts.otherLabels.join(',') ===
     Array.from({length:10},(_,i)=>'Other '+(i+1)).join(','), parts.otherLabels.join(','));
  ok('HW.parts() is chPartOptions() — the same seam the bench dropdown reads',
     parts.hwPartsSame);

  /* ==================================================================
     v1.43.0 — THE CHANNEL TABLE SURVIVES A REFRESH (maestro/servo-store.js)

     Mike: "Going into Servo Hardware page seems to have overwritten my
     settings in 'Set up your servo hardware'." It had — by never storing
     them. HW.save() wrote PREFS, and PREFS has never held MSTR, so the
     whole servo config was session state and a reload regenerated a
     starter over the top of it: every channel back to 1000/1000/2000 with
     boot ticked, which is exactly what a wiped config looks like.
     ================================================================== */
  console.log('\n════ the servo config survives a reload ════');
  await ev(()=>{
    HW.ensure(2);
    const c = MSTR.channels[2];
    c.mode='Servo'; c.name='Dataport Door'; c.min=4400; c.max=7600; c.home=6000;
    c.speed=42; c.acceleration=7; c.calibrated=true;
    HW.setPart(2, 'dataportDoor');
    HW.save();
  });
  ok('HW.save() writes the channel table, not just PREFS', await ev(()=>{
    const raw = localStorage.getItem('r2sim.servo.v1');
    if(!raw) return false;
    const o = JSON.parse(raw);
    const c = (o.channels||[])[2];
    return !!c && c.name==='Dataport Door' && c.min===4400 && c.max===7600 && c.calibrated===true;
  }));
  await page.reload();
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const back = await ev(()=>{
    const c = MSTR.channels[2] || {};
    return {name:c.name, min:c.min, max:c.max, home:c.home, speed:c.speed, act:c.act,
            cal:!!c.calibrated, loaded:MSTR.loaded,
            engine: HW.engine() && !!HW.engine().st[2]};
  });
  ok('...and a reload comes back to the same names, endpoints and mapping',
     back.name==='Dataport Door' && back.min===4400 && back.max===7600 &&
     back.home===6000 && back.speed===42 && back.cal===true, JSON.stringify(back));
  ok('...with the part mapping intact, so a sequence still moves the right panel',
     back.act==='dataportDoor', back.act);
  ok('...and the engine is sized off the restored table', back.loaded===true && back.engine===true);
  ok('a starter is NOT generated over a table that has work in it', await ev(()=>{
    const before = MSTR.channels[2].name;
    buildEnsureMaestro();                    // the call that used to wipe it
    return MSTR.channels[2].name === before && before === 'Dataport Door';
  }));
  ok('the reset path forgets it, so Reset really is a reset', await ev(()=>{
    servoStoreClear();
    return !localStorage.getItem('r2sim.servo.v1');
  }));

  console.log('\n════ the link chip, and the words on the dial ════');
  ok('the header carries a board chip that takes a click', await ev(()=>{
    const e = $('chLink');
    if(!e) return false;
    linkChipSync();
    return e.classList.contains('clickable') && /No board/.test(e.textContent)
        && /Click to open a USB serial port/.test(e.title);
  }));
  ok('the three capture buttons say what they DO', await ev(()=>{
    makeStarter('dome','mini24');
    setupOpen(4); setupCalOpen(0);
    const t = $('calWrap').textContent;
    setupCalCancel(); setupClose();
    return /Set MIN/.test(t) && /Set CENTER/.test(t) && /Set MAX/.test(t);
  }));
  /* v1.45.0: the wording Mike asked for on 2026-08-16 lived on the folded-in
     overlay's own button. That overlay is gone, so it moved to the DOOR — the
     Bench pane's button (ui-pane.js), which is now the only thing standing
     between him and the bench. */
  ok('the bench pane offers to EDIT the config when there is one, not set it up', await ev(()=>{
    makeStarter('dome','mini24');
    buildMaestroPane();
    const b = Array.from($('maeHost').querySelectorAll('button'))
      .find(x=>/^(Edit current servo config|Set up servo hardware)/.test(x.textContent));
    return !!b && /Edit current servo config/.test(b.textContent);
  }));

  /* ==================================================================
     v1.45.0 — Mike's five bench items, in his words:
       "Keep Configure Servo visible; order columns: board pin, use, name,
        configure, drives."
       "Add dome-view panel selection for servo-channel assignments" /
        "Add the dome map to Servo Setup as well as Panels."
       "Remove or merge the duplicated Servo Bench into Servo Setup."
       "Disconnect hardware on exit from Servo Setup."
       ...and the two export buttons that threw ReferenceError in the sim.
     ================================================================== */
  console.log('\n════ the channel table in Mike\'s column order (v1.45.0) ════');
  const cols = await ev(()=>{
    setupOpen(4);
    const tab = $('setBody').querySelector('table.chtab');
    const head = Array.from(tab.rows[0].cells);
    const row  = Array.from($('setBody').querySelector('tr[data-ch]').cells);
    const at = sel=>row.findIndex(td=>td.querySelector(sel));
    const stick = head.filter(th=>th.classList.contains('cst')).length;
    const lefts = head.filter(th=>th.classList.contains('cst')).map(th=>th.style.left);
    const out = {
      /* the first cell is the pick-all tick, then Mike's order */
      order: head.slice(1, 7).map(th=>th.textContent.trim().toLowerCase()).join('|'),
      /* the cells are positionally paired with the headers, so they must
         agree — reordering one and not the other is the trap this checks */
      calAt:  at('[data-k=cal]'),
      partAt: at('[data-k=part]'),
      nameAt: at('[data-k=name]'),
      useAt:  at('[data-k=use]'),
      pickAt: at('[data-k=pick]'),
      stick, lefts,
      /* the pick-all tick still drives the apply bar */
      applyBefore: $('setBody').querySelector('[data-act=applysel]').disabled
    };
    const all = $('setBody').querySelector('[data-k=pickall]');
    all.checked = true; all.dispatchEvent(new Event('input',{bubbles:true}));
    out.picked = (SETUP.pick||[]).length;
    out.applyAfter = $('setBody').querySelector('[data-act=applysel]').disabled;
    out.applyLabel = $('setBody').querySelector('[data-act=applysel]').textContent;
    SETUP.pick = [];
    setupClose();
    return out;
  });
  ok('the headers read #, board·pin, use, name, configure, drives — Mike\'s order',
     cols.order === '#|board·pin|use|name|configure|drives', cols.order);
  ok('…and every cell sits under its own header, not one column adrift',
     cols.pickAt===0 && cols.useAt===3 && cols.nameAt===4 && cols.calAt===5 && cols.partAt===6,
     JSON.stringify([cols.pickAt,cols.useAt,cols.nameAt,cols.calAt,cols.partAt]));
  ok('the identity columns through configure are pinned, so configure cannot scroll off',
     cols.stick === 6 && cols.lefts.every(l=>/px$/.test(l))
     && parseFloat(cols.lefts[5]) > parseFloat(cols.lefts[4]),
     cols.stick+' sticky · '+cols.lefts.join(','));
  ok('the pick-all tick still arms the apply bar',
     cols.applyBefore === true && cols.applyAfter === false && cols.picked > 0,
     cols.picked+' picked · '+cols.applyLabel.trim());

  console.log('\n════ the dome map, on the bench\'s Channels step (v1.45.0) ════');
  const dome = await ev(()=>{
    const out = {};
    setupOpen(4);
    out.door = !!$('setBody').querySelector('[data-act=dome]');
    /* a body part the dome drawing cannot show, so the panel has to say so */
    const body = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    HW.setPart(body, 'dataportDoor');
    /* a dome part already claimed by another channel, so the panel has to
       say WHICH channel has it — the same thing the dropdown says */
    let other = MSTR.channels.findIndex((c,i)=>c && i!==body && /^servo/i.test(c.mode));
    HW.setPart(other, 'pie0');
    setupRender();
    $('setBody').querySelector('[data-act=dome]').click();
    out.open  = !!$('domeWrap') && !!$('domeWrap').querySelector('svg.domemap');
    /* the pie already claimed is drawn as claimed, and its tooltip names
       the channel that has it */
    const pie0 = $('domeWrap').querySelectorAll('g.dmpie')[0];
    out.pieHas = pie0.getAttribute('class').indexOf('has') >= 0;
    out.pieTitle = pie0.querySelector('title').textContent;
    /* which channels the diagram cannot place */
    out.strays = /dataport/i.test($('domeWrap').textContent);
    /* pick a free channel, click a panel, and the part is assigned */
    /* a dome starter maps every channel, so free one up deliberately rather
       than hoping for an unmapped row */
    let free = MSTR.channels.findIndex((c,i)=>c && /^servo/i.test(c.mode) && !c.act);
    if(free < 0){
      free = MSTR.channels.findIndex((c,i)=>c && i!==body && i!==other && /^servo/i.test(c.mode));
      HW.setPart(free, '');
    }
    SETUP.sel = free; setupDomeRender();
    const pie3 = $('domeWrap').querySelectorAll('g.dmpie')[3];
    pie3.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    out.assigned = MSTR.channels[free].act;
    out.free = free;
    /* closing the map leaves the bench open */
    $('domeWrap').querySelector('[data-dome=close]').click();
    out.closed = !$('domeWrap') || !$('domeWrap').querySelector('svg.domemap');
    out.benchStillOpen = SETUP.open;
    setupClose();
    return out;
  });
  ok('the Channels step has a door onto the dome map', dome.door);
  ok('…and it opens the same top-down dome the Panels step draws', dome.open);
  ok('a panel another channel already claims is drawn claimed, and names that channel',
     dome.pieHas && /channel\s*\d/.test(dome.pieTitle), JSON.stringify(dome.pieTitle));
  ok('it names the channels the diagram cannot place, rather than dropping them',
     dome.strays);
  ok('select a row, click a panel, and the channel drives it',
     dome.assigned === 'pie3', 'ch '+dome.free+' → '+dome.assigned);
  ok('closing the map leaves the bench where it was',
     dome.closed && dome.benchStillOpen);
  /* Esc has three jobs on this step now, and getting the order wrong would
     mean shutting a diagram hung up on a real board (setupExitHardware) */
  ok('Esc shuts the map, not the bench — and does not touch the link', await ev(()=>{
    setupOpen(4);
    SER.port = {}; SER.writer = { write:b=>Promise.resolve() }; SER.blocked = false;
    setupDomeOpen();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    const out = {mapShut: !(SETUP.dome && SETUP.dome.open), benchOpen: SETUP.open, kept: !!SER.port};
    SER.port = null; SER.writer = null; serialUiSync();
    setupClose();
    return out.mapShut && out.benchOpen && out.kept;
  }));

  console.log('\n════ one bench, not two (v1.45.0) ════');
  const fold = await ev(()=>{
    const out = {};
    /* the Bench pane's button lands on the SETUP wizard now — there is no
       second "Servo hardware" overlay to land on */
    hwOpen();
    out.benchOpen = SETUP.open && SETUP_STEPS[SETUP.step].key === 'channels';
    out.noSecondOverlay = !$('hwWrap') || !$('hwWrap').innerHTML;
    out.isOpen = (typeof hwIsOpen === 'function') && hwIsOpen();
    out.modal = uiModalOpen();
    /* the live half came across: a drive slider, a position bar, a µs
       readout and the four quick-move buttons */
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    const tr = $('setBody').querySelector('tr[data-ch="'+ch+'"]');
    out.slider = !!tr.querySelector('[data-k=slide]');
    out.bar    = !!$('spb'+ch) && !!$('spt'+ch);
    out.us     = !!$('sus'+ch);
    out.quick  = ['soff','slo','smid','shi'].every(k=>!!tr.querySelector('[data-k='+k+']'));
    /* and it MOVES — the same engine, the same clock */
    const c = MSTR.channels[ch];
    HW.drive(ch, Math.max(c.min,c.max));
    for(let k=0;k<600;k++) HW.tick(10);
    hwTableSync();
    out.barWidth = $('spb'+ch).style.width;
    out.readout  = $('sus'+ch).textContent;
    /* the serial chrome serial-link.js binds by id is here too */
    out.link = ['bSetConnect','serialChip','secMon','monOut','monIn','ckNl','ckFollow','bMon']
      .every(id=>!!$(id));
    /* all-home and all-off, the two things on the old bar that move servos */
    out.allHome = !!$('setBody').querySelector('[data-act=drvhome]');
    out.allOff  = !!$('setBody').querySelector('[data-act=drvoff]');
    hwClose();
    out.shut = !SETUP.open && !hwIsOpen() && !uiModalOpen();
    return out;
  });
  ok('the bench button opens the setup wizard on its Channels step',
     fold.benchOpen && fold.noSecondOverlay);
  ok('hwIsOpen() and uiModalOpen() both still tell the truth about it',
     fold.isOpen === true && fold.modal === true && fold.shut === true);
  ok('the live drive slider, position bar, µs readout and quick moves came across',
     fold.slider && fold.bar && fold.us && fold.quick, JSON.stringify(fold));
  ok('…and the bar follows the engine here, exactly as it did on the old bench',
     parseFloat(fold.barWidth) > 95 && /µs/.test(fold.readout),
     fold.barWidth+' · '+fold.readout);
  ok('the serial chrome serial-link.js binds by id is on the bench', fold.link);
  ok('all home and all off came across — nothing that drives a servo was lost',
     fold.allHome && fold.allOff);

  console.log('\n════ leaving the bench puts the hardware down (v1.45.0) ════');
  const exit = await ev(async ()=>{
    const out = {};
    const fake = ()=>{ SER.port = {}; SER.writer = { write:b=>Promise.resolve() };
                       SER.blocked = false; serialUiSync(); };
    setupOpen(4);
    fake(); LIVE.on = true;
    /* stepping between the bench's own steps is not leaving it */
    setupGo(2); setupGo(4);
    out.stepKept = !!SER.port;
    /* nor is cancelling the dial */
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    setupCalOpen(ch); setupCalCancel();
    out.dialKept = !!SER.port;
    /* the servos must be left holding, not released — remember the target */
    HW.drive(ch, MSTR.channels[ch].home || 6000);
    for(let k=0;k<80;k++) HW.tick(10);
    const held = HW.engine().st[ch].target;
    setupClose();
    await new Promise(r=>setTimeout(r,30));
    out.closedPort = SER.port === null;
    out.disarmed = LIVE.on === false;
    out.stillHeld = HW.engine().st[ch].target === held && HW.engine().st[ch].active === true;
    out.said = LOG.slice(-6).map(l=>l.s).join(' | ');
    /* and Esc does the same thing the × does */
    setupOpen(4); fake();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await new Promise(r=>setTimeout(r,30));
    out.escClosed = !SETUP.open && SER.port === null;
    SER.port = null; SER.writer = null; LIVE.on = false; serialUiSync();
    return out;
  });
  ok('stepping between the bench\'s own steps keeps the link', exit.stepKept);
  ok('cancelling the dial keeps it too', exit.dialKept);
  ok('closing the bench disconnects the board and disarms live drive',
     exit.closedPort && exit.disarmed, JSON.stringify([exit.closedPort, exit.disarmed]));
  ok('…and leaves the servos holding where they were, not released',
     exit.stillHeld);
  ok('…and says so, rather than going quiet on a link it just dropped',
     /disconnect/i.test(exit.said) && /hold/i.test(exit.said), exit.said);
  ok('Esc out of the bench puts the hardware down the same way', exit.escClosed);

  console.log('\n════ the bench\'s two exports work in the SIM (v1.45.0) ════');
  const exp = await ev(()=>{
    const seen = [];
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){ seen.push(this.download); };
    setupOpen(5);
    SETUP.adv = true; setupRender();
    /* click them, exactly as Mike does — a bare download() exists only in
       PCA Studio, so in the sim these two threw ReferenceError */
    const hit = a=>{ const b = $('setBody').querySelector('[data-act='+a+']'); if(b) b.click(); return !!b; };
    const okH = hit('exph');
    const okJ = hit('expjson');
    HTMLAnchorElement.prototype.click = real;
    SETUP.adv = false;
    setupClose();
    return {seen, okH, okJ};
  });
  ok('both buttons are there and neither throws', exp.okH && exp.okJ && exp.seen.length === 2,
     JSON.stringify(exp.seen));
  ok('servos.h and the bench .json are both stamped with the date and time',
     exp.seen.some(n=>/^servos-\d{4}-\d\d-\d\d-\d{4}\.h$/.test(n)) &&
     exp.seen.some(n=>/^servo-setup-\d{4}-\d\d-\d\d-\d{4}\.json$/.test(n)),
     JSON.stringify(exp.seen));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+(fail?fail+' FAILED':'0 failed'));
  await browser.close();
  process.exit(fail?1:0);
})();
