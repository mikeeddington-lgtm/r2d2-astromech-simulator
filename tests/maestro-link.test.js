/* TALKING TO A REAL MAESTRO (v1.56.0)
   ---------------------------------------------------------------------
   Mike: *"if a maestro is directly connected can you control / read from
   it?"* — then: *"I'm thinking if we can link to it for help setting it
   up via the simulator and skipping the maestro app altogether?"*

   Mostly, yes. The Maestro's USB command port is a virtual COM port and
   Web Serial opens it like any other, so the same dial that drives a
   PCA9685 through PCA_Bridge can drive a Pololu board directly — and,
   unlike the bridge, it can ASK the board where the servo actually is.

   There is no serial port in a headless browser, so what this suite does
   is own the wire: `serialRaw` is replaced by a capture, and replies are
   pushed back in through `mstrRx` exactly as the read loop would. That
   covers every part of this feature that can be wrong quietly, which is
   the part worth testing:

     · THE TWO ENCODINGS ARE NOT THE SAME. A target goes out 7 bits at a
       time; a position comes back 8 bits at a time. Confuse them and
       every value below 1024 quarter-µs still works, so the bug hides
       until you touch a real servo.
     · A STALE REPLY MUST NOT ANSWER THE NEXT QUESTION. A timed-out Get
       Position landing late would be read as an error word, or as the
       next channel's place.
     · THE CLAMP MUST BE SEEN. The board silently refuses a target
       outside its own stored limits. That is the whole reason for the
       read-back, and the one thing Control Center does not tell you.
     · A MAESTRO MUST NOT BE SENT BRIDGE FRAMES, and a bridge must not be
       sent Pololu commands — 0xA1 is a frame header to PCA_Bridge and
       would move a servo just to ask a question.
   ===================================================================== */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const URL_ = 'file://' + path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html') + R2_Q;
let pass = 0, fail = 0;
const ok = (n,c,x='') => { c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto(URL_);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ PREFS.seenStartup=true; if(typeof closeStartup==='function') closeStartup(); });
  await ev(()=>{ buildSet('domeServo','mini18'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await ev(()=>{ loadProfile('maestro25'); setBoard('mini18'); makeStarter('dome','mini18'); });
  await page.waitForTimeout(300);

  /* THE FAKE WIRE. Everything below rides on this: serialRaw becomes a
     capture, so no port is ever opened, and replies are injected through
     the same door the read loop uses. */
  await ev(()=>{
    window.__tx = [];
    window.__reply = null;                       /* bytes to answer the next ask with */
    window.serialRaw = function(bytes){
      const a = Array.from(bytes);
      window.__tx.push(a);
      if(window.__reply){ const r = window.__reply; window.__reply = null;
                          setTimeout(()=>mstrRx(new Uint8Array(r)), 0); }
    };
  });
  const txLast = () => ev(()=>window.__tx[window.__tx.length-1] || null);
  const txReset = () => ev(()=>{ window.__tx = []; });

  console.log('\n════ the two encodings, which are not the same ════');
  const enc = await ev(()=>({
    split6000: mstrSplit(6000),
    join6000:  mstrJoin(0x70, 0x17),
    joinIsNot7bit: mstrJoin(0x70, 0x17) !== (0x70 | (0x17 << 7)),
    split0:    mstrSplit(0),
    clampHigh: mstrSplit(99999)
  }));
  /* 6000 quarter-µs = 1500 µs = 0x1770. Out: low seven bits 0x70, next
     seven 0x2E. Back: low EIGHT bits 0x70, high eight 0x17. */
  ok('a target splits into 7-bit halves', JSON.stringify(enc.split6000) === '[112,46]', JSON.stringify(enc.split6000));
  ok('a position joins from 8-bit halves', enc.join6000 === 6000, String(enc.join6000));
  ok('and the two are genuinely different', enc.joinIsNot7bit === true);
  ok('zero splits to zero', JSON.stringify(enc.split0) === '[0,0]');
  ok('an out-of-range value is clamped, not wrapped', JSON.stringify(enc.clampHigh) === '[127,127]', JSON.stringify(enc.clampHigh));

  console.log('\n════ the envelope ════');
  const env = await ev(()=>{
    MST.proto = 'compact';
    const c = mstrEnvelope(0x84, [5, 112, 46]);
    MST.proto = 'pololu'; MST.dev = 12;
    const p = mstrEnvelope(0x84, [5, 112, 46]);
    MST.proto = 'compact';
    return {c, p};
  });
  ok('compact protocol is the bare command', JSON.stringify(env.c) === '[132,5,112,46]', JSON.stringify(env.c));
  ok('Pololu protocol prefixes 0xAA and the device', JSON.stringify(env.p) === '[170,12,4,5,112,46]', JSON.stringify(env.p));
  ok('and it strips the command byte\'s high bit', env.p[2] === 0x04);

  console.log('\n════ asking, and hearing back ════');
  await txReset();
  const pos = await ev(async ()=>{
    window.__reply = [0x70, 0x17];               /* 6000 */
    return await mstrGetPos(3);
  });
  ok('Get Position asks 0x90 for the channel', JSON.stringify(await txLast()) === '[144,3]', JSON.stringify(await txLast()));
  ok('and reads 1500 µs back off the wire', pos === 6000, String(pos));

  const errWord = await ev(async ()=>{
    window.__reply = [0x21, 0x01];               /* bits 0, 5 and 8 */
    return await mstrGetErrors();
  });
  ok('Get Errors is a two-byte word', errWord === 0x121, String(errWord));
  const names = await ev(()=>mstrErrText(0x121));
  ok('bit 0 is the serial signal error', names[0] === 'serial signal error', JSON.stringify(names));
  ok('bit 5 is the serial timeout', names.indexOf('serial timeout') >= 0);
  ok('bit 8 is in the HIGH byte and still decodes',
     names.indexOf('script program counter error') >= 0, JSON.stringify(names));
  ok('a clean board names nothing', (await ev(()=>mstrErrText(0))).length === 0);

  console.log('\n════ a stale reply must not answer the next question ════');
  const stale = await ev(async ()=>{
    /* a byte nobody claimed — the tail of a query that timed out */
    MST.rx.length = 0; MST.on = true; MST.rx.push(0xEE);
    window.__reply = [0x70, 0x17];
    const p = await mstrGetPos(0);
    MST.on = false;
    return p;
  });
  ok('the unclaimed byte is dropped, not prefixed', stale === 6000, String(stale));

  console.log('\n════ a timeout answers null and does not wedge the link ════');
  const after = await ev(async ()=>{
    window.__reply = null;                       /* nothing comes back */
    const dead = await mstrAsk([0x90, 0], 2, 120);
    window.__reply = [0x88, 0x13];               /* 5000 */
    const live = await mstrGetPos(1);
    return {dead, live};
  });
  ok('a silent board answers null', after.dead === null, JSON.stringify(after.dead));
  ok('and the very next question still works', after.live === 5000, String(after.live));

  console.log('\n════ THE CLAMP, WHICH IS THE POINT ════');
  const clamp = await ev(()=>{
    MST.asked = {}; MST.pos = {}; MST.clamp = {};
    MST.asked[4] = 4000; MST.pos[4] = 4544;      /* asked 1000 µs, sat at 1136 */
    const flagged = mstrClampCheck(4);
    const note = mstrClampNote(4);
    MST.asked[5] = 6000; MST.pos[5] = 6004;      /* 1 µs out — a loaded servo */
    const near = mstrClampCheck(5);
    MST.asked[6] = 7296; MST.pos[6] = 6800;      /* stopped short of the top */
    mstrClampCheck(6);
    return {flagged:!!flagged, note, near, top:mstrClampNote(6),
            offPulse:(MST.asked[7]=6000, MST.pos[7]=0, mstrClampCheck(7))};
  });
  ok('a servo that settles off its target is flagged', clamp.flagged === true);
  ok('the note gives both numbers in µs', /1000 µs/.test(clamp.note) && /1136 µs/.test(clamp.note), clamp.note);
  ok('and names the stored MINIMUM when it was held high', /stored minimum/.test(clamp.note), clamp.note);
  ok('and the stored MAXIMUM when it was held low', /stored maximum/.test(clamp.top), clamp.top);
  ok('it says the serial port cannot widen it', /cannot widen/.test(clamp.note));
  ok('1 µs of slop is not a clamp', clamp.near === null);
  ok('a channel that is not pulsing is not a clamp', clamp.offPulse === null);

  console.log('\n════ what goes down the wire for each kind of board ════');
  await txReset();
  const routed = await ev(()=>{
    SER.port = {}; SER.blocked = false; SER.kind = 'maestro';
    SER.lastTicks = {}; SER.lastSpeed = {}; SER.warnedWide = false;
    MST.on = true; MST.chCount = 18;
    /* THIS BLOCK IS ABOUT THE STREAM, so it asks for the streamed mode out
       loud (v1.66.2). serialWrite() is the streamed door; on a Maestro that
       is drawing its own ramps the positions go through serialMove() instead,
       once per move, and serialWrite deliberately says nothing. `quiet` is
       what picks between them — it means the board has been zeroed and the
       simulator is shaping, which is the streamed case. The paced door has
       its own coverage below and in tests/ramp-step.test.js. */
    MST.quiet = true;
    serialWrite(2, 6000);
    const first = window.__tx[window.__tx.length-1];
    serialWrite(2, 6000);                        /* same value again */
    const same = window.__tx.length;
    serialWrite(2, null);                        /* stop pulsing */
    const off = window.__tx[window.__tx.length-1];
    const before = window.__tx.length;
    serialWrite(30, 6000);                       /* past this board's 18 */
    const past = window.__tx.length === before;
    serialConfig();                              /* a PCA9685 idea */
    const cfg = window.__tx.length === before;
    return {first, sameLen:same, off, past, cfg};
  });
  ok('a target is 0x84, channel, then the 7-bit halves',
     JSON.stringify(routed.first) === '[132,2,112,46]', JSON.stringify(routed.first));
  ok('the same value twice is sent once', routed.sameLen === 1, String(routed.sameLen));
  ok('"off" is target 0, the Maestro\'s own way of saying it',
     JSON.stringify(routed.off) === '[132,2,0,0]', JSON.stringify(routed.off));
  ok('a channel past the board\'s count is DROPPED, not folded', routed.past === true);
  ok('and the PCA9685 config frames are never sent to a Maestro', routed.cfg === true);

  /* THE OTHER DOOR (v1.66.2). A Maestro left to draw its own ramps takes one
     Set Speed and one Set Target per move — the engine's 100 Hz stream is
     suppressed for it, because the board does not need to be told the middle
     of a ramp it is already drawing. An OFF is the exception: "stop pulsing"
     is an event rather than a position, so it still goes through the stream. */
  await txReset();
  const paced = await ev(()=>{
    SER.port = {}; SER.blocked = false; SER.kind = 'maestro';
    SER.lastTicks = {}; SER.lastSpeed = {}; SER.warnedWide = false;
    MST.on = true; MST.chCount = 18; MST.quiet = false;
    const paces = serialPaces();
    window.__tx.length = 0;
    serialWrite(2, 6000);                        /* a streamed position: ignored */
    const streamSaid = window.__tx.length;
    serialMove(2, 6000, 94);                     /* the paced door */
    const cmds = window.__tx.slice();
    window.__tx.length = 0;
    serialWrite(2, null);                        /* an off still goes */
    const offSaid = window.__tx.length;
    MST.quiet = true;
    return {paces, streamSaid, cmds, offSaid};
  });
  ok('a Maestro drawing its own ramps IS paced, and the stream says nothing to it',
     paced.paces === true && paced.streamSaid === 0, JSON.stringify(paced));
  ok('the paced door sends Set Speed 0x87 then Set Target 0x84',
     paced.cmds.length === 2 && paced.cmds[0][0] === 0x87 && paced.cmds[1][0] === 0x84,
     JSON.stringify(paced.cmds));
  ok('but an OFF is an event, not a position, and still reaches it',
     paced.offSaid === 1, String(paced.offSaid));

  console.log('\n════ which board the build says is out there ════');
  const which = await ev(()=>{
    const asMaestro = serialBuildIsMaestro();
    const was = MSTR.board;
    setBoard('pca32');
    const asPca = serialBuildIsMaestro();
    setBoard(was);
    return {asMaestro, asPca};
  });
  ok('a Mini 18 build expects a Maestro', which.asMaestro === true);
  ok('a PCA9685 build does not', which.asPca === false);

  console.log('\n════ the read-back on screen ════');
  await ev(()=>setupOpen(4));
  await page.waitForTimeout(300);
  const ro = await ev(()=>{
    MST.on = false; mstrReadoutSync();
    const hidden = $('calBoard') ? $('calBoard').className : 'missing';
    MST.on = true; MST.watchCh = 4; MST.pos[4] = 6000; MST.settle = 2;
    MST.clamp = {}; MST.err = 0; MST.quiet = false;
    mstrReadoutSync();
    const clean = $('calBoard').textContent;
    MST.asked[4] = 4000; MST.pos[4] = 4544; mstrClampCheck(4); mstrReadoutSync();
    const bad = {cls:$('calBoard').className, text:$('calBoard').textContent};
    MST.on = false; MST.clamp = {}; mstrUnwatch();
    return {hidden, clean, bad};
  });
  ok('nothing is shown when the board cannot be asked', ro.hidden === 'calboard', ro.hidden);
  ok('a Maestro shows the position it read back', /1500 µs/.test(ro.clean), ro.clean);
  ok('and says whether it has settled', /settled/.test(ro.clean));
  ok('a clamped channel turns the panel bad', /bad/.test(ro.bad.cls), ro.bad.cls);
  ok('and prints the sentence you can act on', /clamping/.test(ro.bad.text));

  console.log('\n════ the half the wire cannot do, said once ════');
  const adv = await ev(()=>mstrSettingsAdvice());
  ok('the advice names the native USB limit', /native usb/i.test(adv.why), adv.why.slice(0,60));
  ok('it insists on USB Dual Port', adv.once.join(' ').indexOf('Dual Port') >= 0);
  ok('it warns the port must be free first', /only be held by one|Close this link/.test(adv.how.join(' ')));

  console.log('\n════ Finish says what the wire cannot do ════');
  const fin = await ev(()=>{
    MST.clamp = {}; MST.clamp[4] = {asked:4000, got:4544};
    const withClamp = setupStepMaestro();
    MST.clamp = {};
    const plain = setupStepMaestro();
    const was = MSTR.board;
    setBoard('pca32');
    const onPca = setupStepMaestro();
    setBoard(was);
    return {withClamp, plain, onPca};
  });
  ok('a Maestro build is told its settings come from Control Center',
     /Control Center/.test(fin.plain), fin.plain.slice(0, 70));
  ok('and is offered the file that carries them', /data-act="mstrfile"/.test(fin.plain));
  ok('the one-time list insists on USB Dual Port', /Dual Port/.test(fin.plain));
  ok('a channel caught being clamped is named on the way out',
     /clamping 1 channel/.test(fin.withClamp) && /ch 4/.test(fin.withClamp));
  ok('and none of it appears on a PCA9685 build', fin.onPca === '', fin.onPca.slice(0, 40));

  console.log('\n════ leaving stops the polling ════');
  const stopped = await ev(()=>{
    MST.on = true; mstrWatch(2);
    const running = MST.watchTimer !== null && MST.watchCh === 2;
    setupCalLeave();
    const after = MST.watchTimer === null && MST.watchCh === null;
    MST.on = false;
    return {running, after};
  });
  ok('the dial starts a poll on its own channel', stopped.running === true);
  ok('and leaving the dial stops it', stopped.after === true);

  /* ════ THE CACHE THAT OUTLIVED THE SPEEDS IT REMEMBERS (v1.66.3)
     serialMove() de-duplicates Set Speed against SER.lastSpeed, so the second
     paced move on a channel is a bare Set Target. mstrQuiet() rewrites the
     board's speed and acceleration on EVERY channel and never goes near that
     cache — so after the "let the sim shape the moves" toggle the cache still
     names a speed the board no longer holds, the next move is suppressed
     against it, and a channel whose table speed is 0 runs at FULL SPEED while
     the sequencer is still timing the brick against the ramp it asked for. */
  console.log('\n════ rewriting the board\'s speeds forgets what it was told ════');
  await txReset();
  const cache = await ev(()=>{
    SER.port = {}; SER.blocked = false; SER.kind = 'maestro';
    SER.lastTicks = {}; SER.lastSpeed = {};
    MST.on = true; MST.chCount = 18; MST.quiet = false;
    /* table speed 0 = unlimited, which is what a generated table gives you
       until somebody tunes the channel — the case that runs away */
    if(MSTR.channels && MSTR.channels[5]) MSTR.channels[5].speed = 0;
    serialMove(5, 6000, 300);                    /* the frame's own speed */
    const first = window.__tx.slice();
    mstrQuiet(true); mstrQuiet(false);           /* the board's speeds rewritten */
    const cached = SER.lastSpeed[5];
    const cleared = Object.keys(SER.lastSpeed).length === 0;
    window.__tx.length = 0;
    serialMove(5, 4000, 300);                    /* the same speed, a new move */
    const replay = window.__tx.slice();
    MST.quiet = false;
    return {first, cleared, replay, cached};
  });
  ok('the first paced move states its speed', cache.first.length === 2 && cache.first[0][0] === 0x87,
     JSON.stringify(cache.first));
  ok('rewriting the board\'s speeds drops the Set Speed cache', cache.cleared === true,
     'lastSpeed5 = ' + cache.cached);
  ok('so the next move states it again instead of trusting the board',
     cache.replay.some(t=>t[0] === 0x87), JSON.stringify(cache.replay));

  /* The mode banner is WHY streaming is on, and it outlived the link: nothing
     cleared SER.modeWarn on disconnect, so the next hwLinkRender() — one per
     setupRender(), i.e. per keystroke on the Channels step — painted "the
     board draws the ramps" and its live buttons back beside a chip reading
     "No board", with nothing on the other end to press them at. */
  console.log('\n════ disconnecting takes the banner with it ════');
  const banner = await ev(async ()=>{
    SER.port = {}; SER.blocked = false; SER.kind = 'maestro'; MST.on = true;
    serialSetMode('stream', 'Connected to a <b>Pololu Maestro</b> — the board draws the ramps');
    const held = SER.modeWarn;
    await serialDisconnect();
    return {held, after:SER.modeWarn};
  });
  ok('a live link remembers why it is streaming', /Pololu Maestro/.test(banner.held), banner.held);
  ok('and disconnecting forgets it, so no re-render can put it back',
     banner.after === '', banner.after);

  /* "use N expanders" is an ADD-ROWS button. It was calling wizFinish(), the
     wizard's EXIT path — which marks the build done, closes the startup card
     and burns the once-ever first-run card. What it wants is the post-buildSet
     re-derivation, which is buildApply(). */
  console.log('\n════ "use N expanders" adds rows, it does not end setup ════');
  const adopt = await ev(()=>{
    /* only a counted PCA shape can take a board count at all */
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2'); buildSet('pcaBoards',2);
    buildGet().done = false;
    const was = HW.count();
    const took = serialAdoptBoardCount(3);
    return {took, was, now:HW.count(), done:!!buildGet().done};
  });
  ok('adopting the board\'s count grows the channel table',
     adopt.took === true && adopt.now > adopt.was, adopt.was + ' → ' + adopt.now);
  ok('and it does not declare the build finished', adopt.done === false);
  const adoptCalls = await ev(()=>{
    const realWiz = window.wizFinish, realApply = window.buildApply;
    /* the ORDER, not a count: buildSet() applies the build itself, so what
       tells the two apart is what follows it — a second re-derivation, or the
       wizard's exit path. wizFinish is counted and NOT called through, because
       running the exit path here is the very thing under test. */
    const log = [];
    window.wizFinish  = function(){ log.push('wizFinish'); };
    window.buildApply = function(){ log.push('buildApply'); return realApply.apply(this, arguments); };
    const took = serialAdoptBoardCount(4);
    window.wizFinish = realWiz; window.buildApply = realApply;
    return {took, log};
  });
  ok('it re-derives the build rather than finishing the wizard',
     JSON.stringify(adoptCalls.log) === '["buildApply","buildApply"]',
     JSON.stringify(adoptCalls.log));

  /* ════ A QUIET-BUT-OPEN PORT MUST NOT BUILD A BACKLOG (2026-08-22)
     The watcher was a setInterval that did not wait for its own fire. Every
     ask chains on MST.busy behind a 400 ms timeout, so a board that never
     answers services 2.5 asks a second while the timer queues 6.25: the
     chain grows without bound, the readout goes staler the longer you stand
     there, and bytes keep going at the board. It self-healed only when a
     WRITE failed — and quiet-but-open is exactly the port where writes
     always succeed: a Maestro in the wrong serial mode, or the TTL half of
     a Dual Port pair.

     THE PROOF IS WHAT HAPPENS AFTER THE STOP. What is already queued on
     MST.busy is beyond clearInterval's reach, so on the old poller the wire
     kept talking for seconds after mstrUnwatch() — one write per backlogged
     ask, at a board nobody is watching any more. A poller that re-arms
     itself has nothing queued: at most one ask is ever outstanding, and
     stopping mid-flight is the only case there is. */
  console.log('\n════ a silent board must not build a backlog of asks ════');
  const quiet = await ev(async ()=>{
    const sleep = ms => new Promise(r=>setTimeout(r, ms));
    SER.port = {}; SER.blocked = false; SER.kind = 'maestro';
    MST.on = true; window.__reply = null;        /* writes land, nothing answers */
    window.__tx.length = 0;
    mstrWatch(2);
    await sleep(2000);                           /* long enough for a backlog to build */
    const during = window.__tx.length;
    mstrUnwatch();                               /* and it is mid-ask, by construction */
    const atStop = window.__tx.length;
    await sleep(2000);
    const out = {during, after: window.__tx.length - atStop,
                 timer: MST.watchTimer, ch: MST.watchCh};
    MST.on = false; window.__tx.length = 0;
    return out;
  });
  ok('stopping the poll stops the traffic — nothing queued outlives it',
     quiet.after === 0, quiet.after + ' more write(s) after mstrUnwatch(), '
     + quiet.during + ' during');
  ok('…and nothing is left armed, mid-flight or not',
     quiet.timer === null && quiet.ch === null, 'timer=' + quiet.timer + ' ch=' + quiet.ch);

  /* the other half of the same change: a board that DOES answer is still
     polled, and the poller still re-arms itself after each reply */
  const lively = await ev(async ()=>{
    const sleep = ms => new Promise(r=>setTimeout(r, ms));
    const real = window.serialRaw;
    let asks = 0;
    window.serialRaw = function(){               /* every ask answered, always */
      asks++;
      setTimeout(()=>mstrRx(new Uint8Array([0x70, 0x17])), 0);   /* 6000 */
    };
    SER.port = {}; SER.kind = 'maestro'; MST.on = true; MST.pos = {};
    mstrWatch(7);
    await sleep(900);
    const out = {asks, pos:MST.pos[7], ch:MST.watchCh, armed:MST.watchTimer !== null};
    mstrUnwatch(); window.serialRaw = real; MST.on = false;
    return out;
  });
  ok('a board that answers is polled every cycle, and the readback lands',
     lively.asks >= 3 && lively.pos === 6000, JSON.stringify(lively));
  ok('…and the poller re-arms for the next one', lively.armed === true && lively.ch === 7,
     JSON.stringify(lively));

  await ev(()=>{ SER.port = null; SER.kind = ''; mstrReset(); });
  ok('no page errors', errs.length === 0, errs.join(' | '));

  /* the shape test.sh greps for (`^[0-9]+ passed|FAIL`). "ALL PASS (51
     assertions)" matched neither, so a fully green run reported `(no summary)`
     — byte-identical to what the runner prints when this suite dies before it
     gets here, e.g. its 40 s waitForFunction timing out. This is the only
     suite that pins the serial protocol; a crash in it must not read as a pass. */
  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
