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
  /* v1.50.0: the settings left the table. A channel's identity is a row and
     its configuration is the panel below (setup-hw-channels.js says why), so
     the same assertions now select the channel and read #chCfg — the surface
     moved, the contract did not. */
  console.log('\n════ the bench channel table, and its panel ════');
  const tbl = await ev(()=>{
    hwOpen();
    const out = {open:SETUP.open};
    const tab = ()=>$('setBody').querySelector('table.chtab');
    out.rows = $('setBody').querySelectorAll('tr[data-ch]').length;
    out.buildRows = HW.count();
    const head = tab().rows[0].textContent;
    out.listPlain = !/µs|rev|ease/i.test(head);          // identity only
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    SETUP.sel = ch; setupRender();
    const panel = ()=>$('chCfg').textContent;
    out.us   = /µs/.test(panel());
    out.rev  = /reversed/i.test(panel());
    out.ease = /ease/i.test(panel());
    const cell = k=>$('setBody').querySelector('#chCfg [data-k='+k+']');
    const c = MSTR.channels[ch];
    out.shownMin = cell('minUs').value;
    out.storedMin = c.min;
    /* v1.51.0 — the dial is open on the selected channel by default, and
       the panel's three travel numbers ARE its pending ends. Typing stages;
       `save servo setting` (or leaving the channel) writes. */
    cell('minUs').value = '1100'; cell('minUs').dispatchEvent(new Event('input',{bubbles:true}));
    out.staged = SETUP.cal ? SETUP.cal.min : -1;
    out.beforeSave = c.min;
    setupCalCommit(); setupRender();
    out.afterType = c.min;
    /* centre stays editable with boot off — boot is WHEN, not WHETHER */
    c.homemode = 'Off'; setupRender();
    out.homeEditable = !cell('ctrUs').disabled;
    /* reverse is drawn from the numbers, never stored. With the dial open it
       swaps the DIAL's pending pair (v1.51.0), so the assertion reads there. */
    const pair = ()=>SETUP.cal ? {min:SETUP.cal.min, max:SETUP.cal.max} : {min:c.min, max:c.max};
    out.revBefore = Object.assign({checked:cell('rev').checked}, pair());
    cell('rev').click();
    out.revAfter = Object.assign({checked:cell('rev').checked}, pair());
    cell('rev').click();
    out.revBack = pair();
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
  ok('the list is identity only — no setting left in it', tbl.listPlain);
  ok('and the panel carries them all — µs, reversed and ease',
     tbl.us && tbl.rev && tbl.ease, JSON.stringify({us:tbl.us,rev:tbl.rev,ease:tbl.ease}));
  ok('µs in, quarter-µs stored',
     tbl.shownMin === String(Math.round(tbl.storedMin/4)) && tbl.afterType === 4400,
     'showed '+tbl.shownMin+', typing 1100 then saving stored '+tbl.afterType);
  ok('…and typing STAGED it on the dial rather than writing it straight through',
     tbl.staged === 4400 && tbl.beforeSave !== 4400, JSON.stringify([tbl.staged, tbl.beforeSave]));
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

  /* v1.51.0 — the widening is one call long now (calDrive), not one session
     long, because the dial is the default view and a range left open would
     be written over the builder's travel by the next HW.save(). The
     contract it keeps is the same: the dial reaches where calRange() says. */
  console.log('\n════ the dial reaches past the endpoints without moving them (v1.51.0) ════');
  const wide = await ev(()=>{
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode) && c.act);
    const c = MSTR.channels[ch];
    c.min = 4532; c.max = 7292; HW.save(); HW.rebuild(true);
    setupCalOpen(ch);
    const kept = {min:c.min, max:c.max};          // untouched by opening
    SETUP.cal.wide = true;
    calDrive(ch, 9200);
    const wideTarget = HW.engine().st[ch].target;
    const after = {min:c.min, max:c.max};          // and untouched by driving
    SETUP.cal.wide = false;
    calDrive(ch, 9200);
    const reClamped = HW.engine().st[ch].target;
    setupCalCancel();
    return {wideTarget, reClamped, kept, after, ended:{min:c.min, max:c.max}};
  });
  ok('opening the dial does not touch the channel’s ends',
     wide.kept.min === 4532 && wide.kept.max === 7292, JSON.stringify(wide.kept));
  ok('with the wide unlock ticked, 9200 reaches the servo rather than clamping',
     wide.wideTarget === 9200, JSON.stringify(wide));
  ok('…and driving there STILL did not touch the channel’s ends',
     wide.after.min === 4532 && wide.after.max === 7292, JSON.stringify(wide.after));
  ok('unticking it clamps back to the 8000 safe ceiling',
     wide.reClamped === 8000, JSON.stringify(wide));
  ok('and the ends survive the whole exchange',
     wide.ended.min === 4532 && wide.ended.max === 7292, JSON.stringify(wide.ended));

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

  /* ================================================================
     v1.54.0 — Mike, with three PCA9685s on the bench and a bridge
     saying "32 channels max": "Is this a true limit? for the dome I
     need two and one for the body - 4 pcas would future proof me."

     It was not. The frame header's high bit marks the frame and only
     six of the other seven bits were being read, so the channel field
     capped at 32 usable channels. It reads seven now — eight boards.

     THE DANGER THIS SECTION EXISTS FOR: the two widths are
     indistinguishable on the wire. A wide channel sent to a narrow
     board is not rejected, it is FOLDED — 70 & 0x3F is 6 — and a servo
     the user was not touching moves instead. So the app must decide the
     width from the banner and drop what the board cannot decode.
     ================================================================ */
  console.log('\n════ the wire is only as wide as the board on the end of it ════');
  const width = await ev(async ()=>{
    const flush = ()=>new Promise(r=>setTimeout(r,0));
    const has = (seen, want) => seen.some((_,k)=>want.every((v,j)=>seen[k+j]===v));
    const out = {};
    const seen = [];
    hwOpen();
    SER.writer = { write:b=>{ seen.push(...b); return Promise.resolve(); } };
    SER.port = {}; SER.blocked = false;

    /* the banner is the only evidence there is */
    SER.banner = 'PCA-BRIDGE 1\n--- PCA bridge ---';   out.v1bridge  = serialBannerWide();
    SER.banner = 'PCA-BRIDGE 2\n--- PCA bridge ---';   out.v2bridge  = serialBannerWide();
    SER.banner = 'MAESTRO-PCA 2';                      out.v2coproc  = serialBannerWide();
    SER.banner = 'MAESTRO-PCA 3';                      out.v3coproc  = serialBannerWide();
    SER.banner = 'some other board saying hello';      out.unknown   = serialBannerWide();

    /* Match WHOLE frames, not lone header bytes: the engine is ticking on
       the page's own clock and writing channels of its own, so "did a byte
       0x86 appear" is not evidence about channel 6. `frame(ch)` is the
       exact three bytes this call would produce. */
    const tk = serialTicksFor(6000);
    const frame = ch => [0x80|(ch&0x7F), tk>>7, tk&0x7F];

    /* NARROW: 61 is the last servo channel, config sits at 62/63 */
    serialSetWidth(false);
    out.narrowMax = SER.chMax; out.narrowCfg = [SER.cfgOsc, SER.cfgServo];
    seen.length = 0; SER.lastTicks = {};
    serialWrite(61, 6000); await flush();
    out.narrow61 = has(seen, frame(61));
    seen.length = 0; SER.lastTicks = {};
    serialWrite(70, 6000); serialWrite(120, 6000); await flush();
    /* the fold this prevents: 70 & 0x3F = 6, 120 & 0x3F = 56 */
    out.narrowDropped = !has(seen, frame(70)) && !has(seen, frame(6))
                     && !has(seen, frame(120)) && !has(seen, frame(56));
    seen.length = 0; serialConfig(); await flush();
    out.narrowCfgOnWire = has(seen, [0x80|63, HW.freq()>>7, HW.freq()&0x7F]);

    /* WIDE: everything up to 125, config moved to 126/127 */
    serialSetWidth(true);
    out.wideMax = SER.chMax; out.wideCfg = [SER.cfgOsc, SER.cfgServo];
    seen.length = 0; SER.lastTicks = {};
    serialWrite(70, 6000); await flush();
    out.wide70 = has(seen, frame(70)) && !has(seen, frame(6));
    seen.length = 0; SER.lastTicks = {};
    serialWrite(125, 6000); await flush();
    out.wide125 = has(seen, frame(125));
    seen.length = 0; SER.lastTicks = {};
    serialWrite(126, 6000); serialWrite(127, 6000); await flush();
    out.wideCfgProtected = !has(seen, frame(126)) && !has(seen, frame(127));
    seen.length = 0; serialConfig(); await flush();
    out.wideCfgOnWire = has(seen, [0x80|127, HW.freq()>>7, HW.freq()&0x7F])
                     && !has(seen, [0x80|63, HW.freq()>>7, HW.freq()&0x7F]);

    /* every channel either side of the ceiling encodes to exactly one
       header byte — no channel can ever be mistaken for another */
    const headers = new Set();
    for(let c=0; c<=127; c++) headers.add(0x80 | (c & 0x7F));
    out.headersUnique = headers.size === 128;

    serialSetWidth(false);
    SER.banner=''; SER.port=null; SER.writer=null; hwClose();
    return out;
  });
  ok('a PCA-BRIDGE 1 banner means the narrow protocol, PCA-BRIDGE 2 the wide one',
     width.v1bridge === false && width.v2bridge === true);
  ok('MAESTRO-PCA 2 is narrow, 3 is wide — a different threshold, same idea',
     width.v2coproc === false && width.v3coproc === true);
  ok('a board that says nothing recognisable is assumed NARROW, never wide',
     width.unknown === false);
  ok('narrow: 61 channels, config on 62/63',
     width.narrowMax === 61 && width.narrowCfg[0] === 62 && width.narrowCfg[1] === 63);
  ok('narrow: channel 61 still goes out', width.narrow61);
  ok('narrow: a channel past 61 is DROPPED, not folded onto channel 6',
     width.narrowDropped);
  ok('narrow: the config still rides on channel 63', width.narrowCfgOnWire);
  ok('wide: 125 channels, config on 126/127',
     width.wideMax === 125 && width.wideCfg[0] === 126 && width.wideCfg[1] === 127);
  ok('wide: channel 70 goes out as 70, not as 6', width.wide70);
  ok('wide: channel 125 — the top servo channel — goes out', width.wide125);
  ok('wide: 126 and 127 are the config channels, so a servo write there is refused',
     width.wideCfgProtected);
  ok('wide: the config moves to 127 and stops using 63', width.wideCfgOnWire);
  ok('all 128 channels encode to distinct header bytes', width.headersUnique);

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
    /* v1.50.0 — boot is in the Configure panel now, so the assertion has to
       select the channel it is asking about. Same box, same contract. */
    SETUP.sel = j2; setupRender();
    const box = document.querySelector('#chCfg [data-k="boot"]');
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
  console.log('\n════ the channel list, and where its settings went (v1.50.0) ════');
  const cols = await ev(()=>{
    setupOpen(4);
    const tab = $('setBody').querySelector('table.chtab');
    const head = Array.from(tab.rows[0].cells);
    const row  = Array.from($('setBody').querySelector('tr[data-ch]').cells);
    const at = sel=>row.findIndex(td=>td.querySelector(sel));
    const out = {
      /* the first cell is the pick-all tick, then Mike's order */
      order: head.slice(1, 7).map(th=>th.textContent.trim().toLowerCase()).join('|'),
      /* the cells are positionally paired with the headers, so they must
         agree — reordering one and not the other is the trap this checks */
      testAt: at('[data-k=test]'),
      partAt: at('[data-k=part]'),
      nameAt: at('[data-k=name]'),
      useAt:  at('[data-k=use]'),
      pickAt: at('[data-k=pick]'),
      /* v1.51.0 — the dial is not behind a button at all: it is on screen
         for whatever channel is selected, which is the promise the pinning
         used to keep, kept better */
      calInPanel: !!$('setBody').querySelector('#calWrap .calpanel'),
      calInRow:   at('[data-k=cal]'),
      sticky: $('setBody').querySelectorAll('.chtab .cst').length,
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
  ok('the headers read #, board·pin, use, name, drives, test — identity only',
     cols.order === '#|board·pin|use|name|drives|test', cols.order);
  ok('…and every cell sits under its own header, not one column adrift',
     cols.pickAt===0 && cols.useAt===3 && cols.nameAt===4 && cols.partAt===5 && cols.testAt===6,
     JSON.stringify([cols.pickAt,cols.useAt,cols.nameAt,cols.partAt,cols.testAt]));
  ok('the dial is simply there, for the selected channel, behind no button at all',
     cols.calInPanel && cols.calInRow === -1, JSON.stringify([cols.calInPanel, cols.calInRow]));
  ok('…so the pinned-column machinery is gone with the table that needed it',
     cols.sticky === 0, String(cols.sticky));
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
       readout and the four quick-move buttons. v1.50.0 — they live in the
       Configure panel now, one channel at a time, so the channel has to be
       selected first. Same engine, same ids, same clock. */
    const ch = MSTR.channels.findIndex(c=>c && /^servo/i.test(c.mode));
    SETUP.sel = ch; setupRender();
    const pan = $('chCfg');
    out.slider = !!pan.querySelector('[data-k=slide]');
    out.bar    = !!$('spb'+ch) && !!$('spt'+ch);
    out.us     = !!$('sus'+ch);
    out.quick  = ['soff','slo','smid','shi'].every(k=>!!pan.querySelector('[data-k='+k+']'));
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

  /* ═══════════════════════════════════════════════════════════════════
     WHAT THE BOARD SAYS IT IS DRIVING  (v1.63.0)
     Mike: "I setup three pca's and I was only able to configure the first
     two - all three where seen in the serial monitor." Both true at once:
     the boot scan finds every board, but MPCA_CHANNELS in the generated
     sequences.h is fixed at flash time, so a board added afterwards is
     printed as "spare - live drive only, no slots use it". These pin the
     parse of that, and the sentence that now says it out loud. */
  console.log('\n════ the banner says which boards are actually driven ════');
  const MR3 = 'MAESTRO-PCA 3\n--- Maestro replacement ---\n'
            + '  I2C: 3 PCA9685(s) on the bus\n'
            + '    board 0 = 0x40   channels 0-15\n'
            + '    board 1 = 0x41   channels 16-31\n'
            + '    board 2 = 0x45   spare - live drive only, no slots use it\n'
            + '  channels 32   slots 8\n';
  const BR3 = 'PCA-BRIDGE 2\n--- PCA bridge ---\n'
            + '  0x40  channels 0-15   FOUND\n'
            + '  0x42  channels 16-31   FOUND\n'
            + '  0x45  channels 32-47   FOUND\n';
  const OLD = 'PCA-BRIDGE 1\n--- PCA bridge ---\n'
            + '  0x40  channels 0-15   FOUND\n'
            + '  0x41  channels 16-31   FOUND\n'
            + '  1 more board(s) on the bus than this sketch drives (2 boards, 32 channels max)\n';
  const rep = await page.evaluate(([mr, br, old])=>{
    buildSet('servoTopo','p1x2'); buildSet('pcaBoards',3); wizFinish();
    /* say the board out loud: this suite has already loaded a Maestro table,
       and buildEnsureMaestro() deliberately will not replace one (HW.trim()
       never shortens somebody's tuned rows). Three expanders is 48 channels. */
    setBoard('pca48'); makeStarter('dome','pca48');
    const look = bn => { SER.banner = bn; SER.modeWarn = '';
      const r = serialBoardReport();
      return {onBus:r.onBus, driven:r.driven.length, spare:r.spare.map(x=>x.addr),
              chans:r.channels, slots:r.slots,
              addrs:r.driven.map(x=>x.addr),
              warnHtml: (serialBoardCheck() || ''),
              warn: (serialBoardCheck() || '').replace(/<[^>]+>/g,'')};
    };
    const out = {build: HW.count(), hasExport: typeof exportPcaHeader === 'function',
                 mr: look(mr), br: look(br), old: look(old), none: look('')};
    SER.banner = ''; SER.modeWarn = '';
    return out;
  }, [MR3, BR3, OLD]);
  ok('a third board the flashed sequences.h does not know about is read as SPARE',
     rep.mr.onBus === 3 && rep.mr.driven === 2 && rep.mr.spare.join() === '0x45',
     JSON.stringify(rep.mr));
  ok('…and the channel count the firmware was flashed with is read too',
     rep.mr.chans === 32 && rep.mr.slots === 8, JSON.stringify(rep.mr));
  ok('…and it offers the way out rather than describing it',
     /id="bGenSeqH"/.test(rep.mr.warnHtml) && typeof rep.hasExport === 'boolean' && rep.hasExport,
     rep.mr.warnHtml.slice(-120));
  ok('…and it says so, naming the board and the remedy',
     /0x45/.test(rep.mr.warn) && /sequences\.h/.test(rep.mr.warn) && /re-flash/i.test(rep.mr.warn),
     rep.mr.warn.slice(0,120));
  ok('…including that the build has more channels than the firmware drives',
     new RegExp('32').test(rep.mr.warn) && new RegExp(String(rep.build)).test(rep.mr.warn),
     'build '+rep.build+' · '+rep.mr.warn.slice(-140));

  /* the bridge has no sequences.h at all, so everything it binds is driven —
     three boards on jumpered, NON-consecutive addresses and not a word */
  ok('PCA_Bridge driving all three says nothing, whatever the addresses are',
     rep.br.driven === 3 && rep.br.spare.length === 0 && rep.br.warn === '',
     JSON.stringify(rep.br));
  ok('…and the addresses are read as found, not assumed from 0x40',
     rep.br.addrs.join() === '0x40,0x42,0x45', JSON.stringify(rep.br.addrs));

  ok('a sketch too old to drive the third board says THAT instead',
     rep.old.driven === 2 && rep.old.onBus === 3
     && /cannot drive at all/.test(rep.old.warn) && /Re-flash/i.test(rep.old.warn),
     JSON.stringify(rep.old));

  /* a Maestro, a silent board or a sketch with no board list must produce
     NO OPINION — an empty report is not a report of zero boards */
  ok('no banner means no opinion, never "no boards"',
     rep.none.onBus === null && rep.none.driven === 0 && rep.none.warn === '',
     JSON.stringify(rep.none));

  /* ═══ THE OTHER DIRECTION, and the commoner one (v1.64.0)
     Mike's actual bridge, pasted verbatim — three boards on jumpered
     addresses, all three bound, nothing wrong with any of it. The BUILD said
     two, so the table had 32 rows and the third board had nowhere to be
     configured. v1.63.0 only checked firmware-has-FEWER and was silent. */
  console.log('\n════ the board has more channels than the build ════');
  const MIKE = 'PCA-BRIDGE 2\n--- PCA bridge ---\n'
             + '  0x40  channels 0-15   FOUND\n'
             + '  0x48  channels 16-31   FOUND\n'
             + '  0x50  channels 32-47   FOUND\n'
             + '\n  oscillator 25000000 Hz   servo 50 Hz\n';
  const more = await page.evaluate(bn=>{
    /* the co-processor build asked for by its ANSWER. `servoTopo` alone is not
       enough: hardware.js reads a direct board answer BACK into the shape, so
       the mini24 this suite set earlier would put the topology straight back. */
    buildSet('domeServo','mpca32'); buildSet('bodyServo','mpca32'); wizFinish();
    setBoard('pca32'); makeStarter('dome','pca32');
    /* a row with an hour of somebody's life in it, which must survive */
    const c = MSTR.channels[7];
    c.name='Mike tuned'; c.min=4321; c.max=7654; c.act='pie3'; c.speed=80; c.acceleration=10;
    SER.banner = bn; SER.modeWarn = '';
    const warn = (serialBoardCheck() || '');
    const before = HW.count();
    const took = serialAdoptBoardCount(serialBoardReport().driven.length);
    const k = MSTR.channels[7];
    const out = {warn: warn.replace(/<[^>]+>/g,''), hasBtn: /id="bMatchBoards"/.test(warn),
                 before, took, after: HW.count(), boards: buildGet().pcaBoards,
                 kept: [k.name, k.min, k.max, k.act, k.speed, k.acceleration].join('|'),
                 row47: !!MSTR.channels[47],
                 quietNow: (serialBoardCheck() || '(SILENT)')};
    /* a board that dropped off the bus must never cost you rows */
    out.shrank = serialAdoptBoardCount(1);
    out.afterShrink = HW.count();
    SER.banner=''; SER.modeWarn='';
    return out;
  }, MIKE);
  ok('a bridge driving more channels than the build has is reported',
     /48 channels/.test(more.warn) && /3 PCA9685s/.test(more.warn) && /this build has/.test(more.warn),
     more.warn.slice(0,130));
  ok('…naming the addresses it actually found, not 0x40/0x41/0x42',
     /0x40, 0x48, 0x50/.test(more.warn), more.warn.slice(0,90));
  ok('…and saying which channels have nowhere to be configured',
     /32-47/.test(more.warn), more.warn.slice(0,130));
  ok('…with a button that takes the board\'s word for it', more.hasBtn, String(more.hasBtn));
  ok('the button grows the table to match', more.took && more.before === 32 && more.after === 48
     && more.boards === 3 && more.row47, JSON.stringify(more));
  ok('…without touching a row somebody calibrated',
     more.kept === 'Mike tuned|4321|7654|pie3|80|10', more.kept);
  ok('…and then it has nothing left to say', more.quietNow === '(SILENT)', more.quietNow);
  ok('a board that dropped off the bus never SHRINKS the table',
     more.shrank === false && more.afterShrink === 48, JSON.stringify({s:more.shrank, n:more.afterShrink}));

  /* a Maestro build with a bridge plugged in for the bench is not a build
     with expanders — offering to renumber it would be offering to break it */
  const notOffered = await page.evaluate(bn=>{
    buildSet('domeServo','mini24'); wizFinish();
    SER.banner = bn; SER.modeWarn = '';
    const out = {counted: serialCanAdoptBoards(), adopt: serialAdoptBoardCount(3),
                 warn: (serialBoardCheck() || '(SILENT)')};
    SER.banner=''; SER.modeWarn='';
    return out;
  }, MIKE);
  ok('a Maestro build is never offered an expander count', notOffered.counted === false
     && notOffered.adopt === false && !/bMatchBoards/.test(notOffered.warn),
     JSON.stringify(notOffered).slice(0,120));

  /* and the generated header no longer names addresses the scan may never
     use — v1.53.0 made them scanned, this comment had not caught up */
  const hdr = await page.evaluate(()=>pcaGenHeader(MSTR.channels, MSTR.sequences, {}));
  ok('the generated sequences.h does not claim board 1 is 0x41',
     !/board 1 -> I2C address 0x41/.test(hdr) && /ASCENDING I2C ADDRESS/.test(hdr));
  ok('…and it warns that MPCA_CHANNELS is fixed at flash time',
     /MPCA_CHANNELS BELOW IS FIXED WHEN YOU FLASH/.test(hdr) && /regenerate this file, re-flash/.test(hdr));


  /* ==================================================================
     v1.66.3 — WHAT A BENCH EDIT MUST NOT DO TO A SERVO

     Three of these are the same shape of fault: something the bench knows
     (where a channel is, what its endpoints are, what rate the board is
     running at) not reaching the place that actually moves the horn. They
     are grouped because the evidence for each is the same — read the
     ENGINE and read the WIRE, and check they agree with the table.
     ================================================================== */
  console.log('\n════ a bench edit never moves a servo on its own ════');

  /* HW.rebuild(true) is what EVERY bench edit ends with — a tick on boot,
     a typed endpoint, a saved dial, a part assignment, Finish. It copied
     four of the five fields that say where a channel is and left `aim`,
     which is the one pcaStepChannel actually integrates toward. So the new
     engine's aim was pcaGoHome's, and a channel whose boot mode is Off
     homes to 0 — which clamps to c.min and stays there. */
  const aimKeep = await ev(()=>{
    const ch = 12;
    HW.ensure(ch);
    const c = MSTR.channels[ch];
    const save = Object.assign({}, c);
    c.mode='Servo'; c.min=4000; c.max=8000; c.homemode='Off'; c.home=0;
    HW.rebuild(false);
    HW.drive(ch, 7000);
    for(let k=0;k<600;k++) HW.tick(10);
    const s = ()=>({pos:HW.pos(ch), aim:HW.engine().st[ch].aim, target:HW.engine().st[ch].target});
    const before = s();
    HW.rebuild(true);                       /* ANY bench edit lands here */
    const after = s();
    for(let k=0;k<600;k++) HW.tick(10);
    const settled = HW.pos(ch);
    Object.assign(c, save); HW.rebuild(false);
    return {before, after, settled, min:4000};
  });
  ok('a rebuild carries `aim`, not just target — the field the engine steers by',
     aimKeep.after.aim === 7000, JSON.stringify(aimKeep));
  ok('…so a bench edit does not walk a boot-Off channel down onto its minimum',
     aimKeep.settled === 7000 && aimKeep.settled !== aimKeep.min,
     'settled at '+aimKeep.settled+' (was '+aimKeep.before.pos+')');

  /* THE OTHER SIDE OF THE SAME KEEP-LOOP (2026-08-22). It guarded on the
     NEW state's `servo` only, so a channel that was an Input a moment ago
     and has just been made a Servo — a bench edit, or the servo-config
     import that rebuilds after writing the table — had its freshly-homed
     state overwritten by the old row's zeros: active false, pos256 0, and
     `known` (never copied) left true by pcaCreate's own pcaGoHome. There is
     nothing in a non-servo row worth carrying: it has never held a
     position, and the home the new row asks for is the truth about where
     that channel is. It recovered on the next drive+tick, so what this
     pins is the moment in between — read the engine straight after the
     rebuild, no tick. */
  const becameServo = await ev(()=>{
    const ch = 16;
    HW.ensure(ch);
    const c = MSTR.channels[ch];
    const save = Object.assign({}, c);
    c.mode='Input'; c.min=4000; c.max=8000; c.home=6000; c.homemode='Off';
    HW.rebuild(false);                      /* the engine as it was: not a servo */
    const was = {pos:HW.pos(ch), servo:HW.engine().st[ch].servo};
    c.mode='Servo'; c.homemode='Goto';      /* what the edit/import writes */
    HW.rebuild(true);                       /* …and what it ends with */
    const s = HW.engine().st[ch];
    const out = {was, pos:HW.pos(ch), aim:s.aim, target:s.target,
                 active:s.active, known:s.known, home:6000};
    Object.assign(c, save); HW.rebuild(false);
    return out;
  });
  ok('a channel that was not a servo has nothing to carry over',
     becameServo.was.servo === false && becameServo.was.pos === 0, JSON.stringify(becameServo.was));
  ok('…so one that has just BECOME a Servo reports its home, not 0, before any tick',
     becameServo.pos === becameServo.home && becameServo.active === true,
     JSON.stringify(becameServo));
  ok('…with the engine steering there too, and the channel known',
     becameServo.aim === becameServo.home && becameServo.target === becameServo.home
     && becameServo.known === true, JSON.stringify(becameServo));

  /* HW.drive() clamped into the channel's own min/max on the way to the
     ENGINE and then handed the raw, unclamped number to the wire. Both
     halves looked right — the model, the position bar and the bench all
     read the clamped value — while the servo was commanded past its stops.
     live-drive.js promises the opposite in prose. */
  const wireClamp = await ev(()=>{
    const ch = 13;
    HW.ensure(ch);
    const c = MSTR.channels[ch];
    const save = Object.assign({}, c);
    c.mode='Servo'; c.min=4800; c.max=6400; c.homemode='Off'; c.home=0;
    HW.rebuild(false);
    const keptKind = SER.kind, keptQuiet = MST.quiet;
    SER.writer = { write:b=>Promise.resolve() };
    SER.port = {}; SER.blocked = false;
    SER.kind = 'maestro'; MST.quiet = false; MST.chCount = 24;
    SER.lastTicks = {}; SER.lastSpeed = {}; MST.asked = {};
    HW.drive(ch, 8000);                     /* a frame built on another droid */
    const out = {asked: MST.asked[ch], engine: HW.engine().st[ch].target, max: c.max};
    SER.kind = keptKind; MST.quiet = keptQuiet;
    SER.port = null; SER.writer = null; MST.asked = {};
    Object.assign(c, save); HW.rebuild(false);
    return out;
  });
  ok('the engine clamps a foreign frame into the channel\'s calibrated travel',
     wireClamp.engine === wireClamp.max, 'engine '+wireClamp.engine+' of '+wireClamp.max);
  ok('…and the WIRE carries that same clamped number, not the raw one',
     wireClamp.asked === wireClamp.max, 'wire asked for '+wireClamp.asked
     + ', engine '+wireClamp.engine+', channel max '+wireClamp.max);

  /* the calibration dial deliberately widens c.min/c.max for exactly one
     HW.drive() call (setup-hw-cal.js calDrive) and puts them back in a
     finally. Reading the clamp off the LIVE channel is what keeps that
     working — a clamp cached anywhere else would lock the dial inside the
     ends it is there to move. */
  const dialStillFree = await ev(()=>{
    const ch = 13;
    HW.ensure(ch);
    const c = MSTR.channels[ch];
    const save = Object.assign({}, c);
    c.mode='Servo'; c.min=4800; c.max=6400; c.homemode='Off'; c.home=0;
    HW.rebuild(false);
    const keptKind = SER.kind, keptQuiet = MST.quiet;
    SER.writer = { write:b=>Promise.resolve() };
    SER.port = {}; SER.blocked = false;
    SER.kind = 'maestro'; MST.quiet = false; MST.chCount = 24;
    SER.lastTicks = {}; SER.lastSpeed = {}; MST.asked = {};
    setupCalOpen(ch, {quiet:true});
    calDrive(ch, 7200);                     /* past the ends, on purpose */
    const out = {asked: MST.asked[ch], engine: HW.engine().st[ch].target,
                 minBack: c.min, maxBack: c.max};
    SETUP.cal = null;
    SER.kind = keptKind; MST.quiet = keptQuiet;
    SER.port = null; SER.writer = null; MST.asked = {};
    Object.assign(c, save); HW.rebuild(false);
    return out;
  });
  ok('the calibration dial still reaches past the stored ends, wire included',
     dialStillFree.asked === 7200 && dialStillFree.engine === 7200
     && dialStillFree.minBack === 4800 && dialStillFree.maxBack === 6400,
     JSON.stringify(dialStillFree));

  /* HW.applied() rebuilds and re-streams every position through
     serialTicksFor(), which divides by the NEW HW.freq(). Nothing on that
     path writes the board's config frame, so a 50 Hz board was being fed
     200 Hz tick maths — 1500 µs asked for, 6001 µs emitted, and then the
     wizard closed. */
  const applyFreq = await ev(async ()=>{
    const flush = ()=>new Promise(r=>setTimeout(r,0));
    const seen = [];
    const keptKind = SER.kind, keptHw = CFG.hwSetup, keptOsc = CFG.pcaOsc;
    serialSetWidth(false);
    SER.kind = 'bridge';
    SER.writer = { write:b=>{ seen.push(...b); return Promise.resolve(); } };
    SER.port = {}; SER.blocked = false;
    HW.setFreq(50); HW.setOsc(25000000);
    hwTick();                               /* the frame sees the board, at 50 Hz */
    serialConfig(); await flush();          /* …which is what connecting sends */

    /* now the wizard's Apply: setSetup, setOsc, applied */
    seen.length = 0;
    HW.setFreq(200);
    HW.applied(HW.setup());
    await flush();
    const want = [0x80|SER.cfgServo, 200>>7, 200&0x7F];
    const out = {rateSent: seen.some((_,k)=>want.every((v,j)=>seen[k+j]===v)),
                 wrote: seen.length};

    /* …and applying with nothing changed must NOT stop a moving droid */
    seen.length = 0;
    HW.applied(HW.setup());
    await flush();
    out.quietWhenSame = !seen.some((_,k)=>want.every((v,j)=>seen[k+j]===v));

    SER.kind = keptKind; SER.port = null; SER.writer = null;
    CFG.hwSetup = keptHw; CFG.pcaOsc = keptOsc;
    hwTick();
    HW.rebuild(false);
    return out;
  });
  ok('applying a new servo rate CONFIGURES the board before it streams at it',
     applyFreq.rateSent, JSON.stringify(applyFreq));
  ok('…and applying with the rate unchanged writes no config at all',
     applyFreq.quietWhenSame, JSON.stringify(applyFreq));

  /* chAssign()'s live branch writes MSTR.channels and redraws three
     surfaces, and until now saved none of it. servoStoreSave() is the only
     writer of r2sim.servo.v1, so every panel→channel assignment made on the
     Panels step or the Outputs panel was gone on the next reload. */
  const assignSaved = await ev(()=>{
    const loc = hwLocs().find(l=>hwAt(l) === MSTR.board);
    if(!loc) return {noLoc:true};
    const ch = 14;
    HW.ensure(ch);
    const c = MSTR.channels[ch];
    const save = Object.assign({}, c);
    c.mode='Servo'; c.act='';
    HW.save();                              /* the store as it stands: no act */
    const took = chAssign(loc, ch, 'oth9');
    const o = JSON.parse(localStorage.getItem('r2sim.servo.v1') || '{}');
    const stored = ((o.channels||[])[ch] || {}).act;
    const out = {took, live: c.act, stored};
    Object.assign(c, save); HW.save(); HW.rebuild(false);
    return out;
  });
  ok('chAssign writes the part mapping into the live table', assignSaved.live === 'oth9',
     JSON.stringify(assignSaved));
  ok('…and SAVES it, so the next reload still knows which panel that channel drives',
     assignSaved.stored === 'oth9', JSON.stringify(assignSaved));

  /* a reloaded table has explicit NULLS where the JSON had holes
     (JSON.stringify writes null for a sparse slot — servo-store.js), and
     forEach VISITS an explicit null even though it skips a real hole. So
     chAssign's clear-then-set walk threw before it had written anything and
     the assignment was simply lost. HW.setPart guards for exactly this.

     Scope: the RENDER that follows still throws on a null row — ui-pane.js's
     channel map reads c.mode unguarded, and HW.setPart reaches it the same
     way — so this asserts what chAssign itself owns, that the write lands. */
  const assignHole = await ev(()=>{
    const loc = hwLocs().find(l=>hwAt(l) === MSTR.board);
    if(!loc) return {noLoc:true};
    const ch = 14, hole = 15;
    HW.ensure(hole);
    const c = MSTR.channels[ch], h = MSTR.channels[hole];
    const save = Object.assign({}, c);
    c.mode='Servo'; c.act='';
    MSTR.channels[hole] = null;
    let threw = '';
    try{ chAssign(loc, ch, 'oth8'); }catch(e){ threw = e.message; }
    const out = {threw, act:c.act};
    MSTR.channels[hole] = h;
    Object.assign(c, save); HW.save(); HW.rebuild(false);
    return out;
  });
  ok('a null row in the table does not cost the assignment its write',
     assignHole.act === 'oth8', JSON.stringify(assignHole));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+(fail?fail+' FAILED':'0 failed'));
  await browser.close();
  process.exit(fail?1:0);
})();
