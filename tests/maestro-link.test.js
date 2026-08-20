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
    SER.lastTicks = {}; SER.warnedWide = false;
    MST.on = true; MST.chCount = 18;
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
    return {first, dedup:same === 1 || window.__tx.length >= 1, sameLen:same, off, past, cfg};
  });
  ok('a target is 0x84, channel, then the 7-bit halves',
     JSON.stringify(routed.first) === '[132,2,112,46]', JSON.stringify(routed.first));
  ok('the same value twice is sent once', routed.sameLen === 1, String(routed.sameLen));
  ok('"off" is target 0, the Maestro\'s own way of saying it',
     JSON.stringify(routed.off) === '[132,2,0,0]', JSON.stringify(routed.off));
  ok('a channel past the board\'s count is DROPPED, not folded', routed.past === true);
  ok('and the PCA9685 config frames are never sent to a Maestro', routed.cfg === true);

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

  await ev(()=>{ SER.port = null; SER.kind = ''; mstrReset(); });
  ok('no page errors', errs.length === 0, errs.join(' | '));

  console.log('\n' + (fail ? 'FAILED ' + fail : 'ALL PASS') + '   (' + pass + ' assertions)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
