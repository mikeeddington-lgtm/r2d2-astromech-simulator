/* the RC transmitter input layer — calibration, channel mapping, and the
   two destinations a channel can have
   ------------------------------------------------------------------
   There is no radio set plugged into a CI box, so the Gamepad API is
   replaced with one that returns whatever this test says it does. That is
   the honest boundary: everything from `navigator.getGamepads()` inwards
   is ours and is tested here; the browser's HID layer is not.

   The transmitter modelled below is deliberately AWKWARD, in exactly the
   ways real ones are:
     · ch1 travel is +0.94 / -0.71, not the textbook ±1
     · ch2 rests at 0.05, not 0.000
     · ch3 is a throttle that rests at the BOTTOM of its travel
     · ch4 is a two-position switch reported as an axis
   If the maths survives that, it survives a bench. */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };
const near=(a,b,e)=>Math.abs(a-b) <= (e===undefined?0.01:e);

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>{ await d.accept(); });
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);

  /* the fake radio. FAKE.ax is what the four gimbals are sending right now;
     the test moves them by writing to it. */
  await ev(()=>{
    window.FAKE = {id:'FS-i6X USB Joystick (Vendor: 0483 Product: 5750)', ax:[0,0.05,-1,-1], connected:true};
    navigator.getGamepads = function(){
      if(!FAKE.connected) return [];
      return [{
        index:0, id:FAKE.id, connected:true,
        axes:FAKE.ax.slice(),
        buttons:[{pressed:false,value:0},{pressed:false,value:0}]
      }];
    };
    /* the whole point of the RC layer is that it only drives when the build
       says this droid is flown with a radio */
    buildSet('controller','rc');
  });

  console.log('\n════ picking the device ════');
  ok('the panel can see the transmitter', await ev(()=> rcPads().length===1 && /FS-i6X/.test(rcPads()[0].id)));
  ok('nothing is enabled until a device is chosen', await ev(()=> !rcEnabled() && !rcOwns(rcPads()[0])));
  ok('choosing it builds a channel per axis and per button', await ev(()=>{
    rcSelect(FAKE.id); rcRead();
    return rcEnabled() && RC.chans.length===6 &&
           RC.chans.filter(c=>c.src==='axis').length===4 &&
           rcChanName(RC.chans[0])==='Ch 1';
  }));
  ok('the ordinary pad path lets go of it', await ev(()=> rcOwns(rcPads()[0])));
  ok('an RC answer of anything else disowns it again', await ev(()=>{
    buildSet('controller','xbox360');
    const off = !rcEnabled();
    buildSet('controller','rc');
    return off && rcEnabled();
  }));

  console.log('\n════ calibration ════');
  ok('a sweep of both stops learns the real endpoints', await ev(()=>{
    rcCalStart();
    /* sweep: ch1 to its two (uneven) stops, ch2 likewise, ch3 top to bottom,
       ch4 flicked both ways */
    [[ 0.94, 0.98, 1.00,  1.00],
     [-0.71,-0.93,-1.00, -1.00],
     [ 0.00, 0.05,-1.00, -1.00]].forEach(row=>{ FAKE.ax = row.slice(); rcRead(); });
    FAKE.ax = [0.00, 0.05, -1.00, -1.00];   // let everything go
    rcRead(); rcCalStop();
    const c = RC.chans;
    return Math.abs(c[0].max-0.94)<1e-9 && Math.abs(c[0].min+0.71)<1e-9 && c[0].moved;
  }));
  ok('the rest position is read at Done, not assumed to be zero', await ev(()=>
    Math.abs(RC.chans[1].mid - 0.05) < 1e-9));
  ok('a stick resting at one end is recognised as a throttle', await ev(()=>
    RC.chans[2].ctr === 'span' && RC.chans[1].ctr === 'rest'));
  ok('an axis that never moved is not marked live', await ev(()=>{
    /* buttons were untouched throughout */
    return RC.chans[4].moved === false && rcCalMovedCount() === 4;
  }));

  console.log('\n════ the maths ════');
  ok('full deflection reads 1.000 at BOTH stops despite uneven travel', await ev(()=>{
    const c = RC.chans[0];
    return Math.abs(rcNorm(c, 0.94) - 1) < 1e-6 && Math.abs(rcNorm(c, -0.71) + 1) < 1e-6;
  }));
  ok('a stick resting off-centre reads exactly zero', await ev(()=> rcNorm(RC.chans[1], 0.05) === 0));
  ok('the deadband is rescaled, not subtracted — mid-throw is still mid-throw', await ev(()=>{
    const c = RC.chans[0];
    /* halfway to the positive stop should read close to 0.5, not 0.5 minus
       the deadband */
    return Math.abs(rcNorm(c, 0.47) - 0.5) < 0.05;
  }));
  ok('a throttle spans -1..1 across its travel', await ev(()=>{
    const c = RC.chans[2];
    return Math.abs(rcNorm(c,-1)+1)<1e-6 && Math.abs(rcNorm(c,1)-1)<1e-6 && Math.abs(rcNorm(c,0))<0.08;
  }));
  ok('reverse flips it end for end', await ev(()=>{
    const c = RC.chans[0]; c.rev = true;
    const v = rcNorm(c, 0.94); c.rev = false;
    return Math.abs(v + 1) < 1e-6;
  }));

  console.log('\n════ assignment — the controller route ════');
  ok('"assign the usual four" maps Mode 2 onto the sticks', await ev(()=>{
    rcClearAssign();
    const n = rcAutoAssign();
    const c = RC.chans;
    return n===4 && c[0].pad==='RX' && c[1].pad==='RY' && c[2].pad==='LY' && c[3].pad==='LX' &&
           c.every(x=>x.mode==='off' || x.mode==='pad');
  }));
  ok('a dead channel is never assigned — a droid must not run away on a stuck axis', await ev(()=>{
    rcClearAssign();
    RC.chans[3].moved = false;
    rcAutoAssign();
    const wasSkipped = RC.chans[3].mode === 'off';
    RC.chans[3].moved = true; rcAutoAssign();
    return wasSkipped && RC.chans[3].pad === 'LX';
  }));
  ok('a stick push reaches the sketch as a hat value', await ev(()=>{
    FAKE.ax = [0, 0.05, 1.0, -1.0];       // throttle to the top
    rcRead(); pollInput();
    return XB.hat.LeftHatY > 30000 && getAnalogHat('LeftHatY') > 30000;
  }));
  ok('and back to rest is a centred stick, not a creep — the throttle trap', await ev(()=>{
    /* ch3 rests at the BOTTOM of its travel. Calibration calls that a
       full-span axis, which is right; auto-assigning it to the FEET and
       leaving it that way would mean "hands off" is full reverse. */
    FAKE.ax = [0, 0.05, -1.0, -1.0];
    rcRead(); pollInput();
    return RC.chans[2].ctr === 'rest' && rcRestValue(RC.chans[2]) === 0 &&
           XB.hat.LeftHatY === 0 && XB.hat.RightHatX === 0 && XB.hat.RightHatY === 0;
  }));
  ok('a channel left commanding something at rest is reported', await ev(()=>{
    const c = RC.chans[2];
    c.ctr = 'span';
    const flagged = rcRestWarnings().some(w=>w.idx===2 && Math.abs(w.rest+1)<0.01);
    c.ctr = 'rest';
    return flagged && rcRestWarnings().length === 0;
  }));
  ok('an unassigned channel does not pin a stick against the keyboard', await ev(()=>{
    rcClearAssign(); rcRead();
    INPUT.keys['KeyW'] = 1; pollInput(); INPUT.keys['KeyW'] = 0;
    const drove = XB.hat.LeftHatY > 30000;
    rcAutoAssign();
    return drove;
  }));
  ok('a switch channel above its threshold is a button press', await ev(()=>{
    const c = RC.chans[3]; c.mode='pad'; c.pad='A'; c.thr=0.5;
    FAKE.ax = [0,0.05,-1, 1.0]; rcRead(); pollInput();
    const on = getButtonPress('A') > 0;
    FAKE.ax = [0,0.05,-1,-1.0]; rcRead(); pollInput();
    return on && getButtonPress('A') === 0;
  }));

  console.log('\n════ assignment — the direct route (advanced) ════');
  ok('a channel bound to an output writes the motor, overriding the sketch', await ev(()=>{
    rcClearAssign();
    const c = RC.chans[2]; c.mode='out'; c.out='drive';
    FAKE.ax = [0,0.05,1.0,-1]; rcRead();
    MOT.drive = 0;
    const did = rcDirectApply();
    return did && MOT.drive > 100;
  }));
  ok('holding it keeps the packet clock alive rather than tripping the watchdog', await ev(()=>{
    SIM.millis += 5000;                 // far past SABER_TIMEOUT
    rcRead(); rcDirectApply(); motorWatchdog();
    return MOT.driveTO === false && effDrive() > 100;
  }));
  ok('under hub ESCs the same channel becomes two servo throttles', await ev(()=>{
    buildSet('bodyDrive','flipsky');
    MOT.leftFoot = MOT.rightFoot = 90;
    rcRead(); rcDirectApply();
    const both = MOT.leftFoot > 120 && MOT.rightFoot > 120;
    buildSet('bodyDrive','sabertooth');
    return both;
  }));
  ok('a servo binding drives an actuator', await ev(()=>{
    rcClearAssign();
    /* a rear door, deliberately: under mod2026 the PCA9685 layer owns the
       front doors and actSet() commands them through setPWM, so ACT_T for
       those is not where the answer lands (cad/parts.js). */
    const c = RC.chans[2]; c.mode='out'; c.out='act:doorRL';
    FAKE.ax = [0,0.05,1.0,-1]; rcRead(); rcDirectApply();
    return ACT_T.doorRL > 0.9;
  }));
  ok('nothing is written when RC is not the controller answer', await ev(()=>{
    buildSet('controller','xbox360');
    MOT.drive = 0; rcRead();
    const quiet = rcDirectApply() === false && MOT.drive === 0;
    buildSet('controller','rc');
    return quiet;
  }));

  console.log('\n════ it survives the bench ════');
  ok('unplugging it stops the channels without losing the calibration', await ev(()=>{
    rcClearAssign(); rcAutoAssign();
    FAKE.connected = false;
    const gone = !rcRead() && RC.live === false && rcContribute() === null;
    FAKE.connected = true; rcRead();
    return gone && RC.chans[0].max === 0.94 && RC.live === true;
  }));
  ok('a transmitter with a different axis count rebuilds rather than reading past the end', await ev(()=>{
    FAKE.ax = [0,0,0,0,0,0,0,0];
    rcRead();
    return RC.chans.filter(c=>c.src==='axis').length === 8 &&
           RC.norm.slice(0,8).every(v=>typeof v === 'number' && !isNaN(v));
  }));
  ok('the map survives a save and reload of prefs', await ev(()=>{
    /* A CALIBRATION IS A SEQUENCE OF READS, so it has to be the ONLY thing
       reading. The app's own frame() calls pollInput() → rcRead() on every
       animation frame with whatever FAKE.ax currently holds, so an extra
       frame landing between these lines records an endpoint the test never
       asked for and every normalised value downstream shifts by a few
       hundredths. That is the whole of the "container rc flake" this suite
       was blamed for: not slowness, an uninvited second reader. Same rule
       the model-integration suites already follow — stop the loop first. */
    const frame0 = frame; frame = function(){};
    FAKE.ax = [0,0.05,-1,-1]; rcRead();
    rcCalStart(); FAKE.ax=[0.9,0.9,0.9,0.9,0,0,0,0]; rcRead(); FAKE.ax=[0,0.05,-1,-1,0,0,0,0]; rcRead(); rcCalStop();
    frame = frame0;
    rcAutoAssign(); rcPrefsSave();
    const want = RC.chans[0].pad;
    RC.chans = []; RC.padId = '';
    rcPrefsRestore();
    return RC.padId === FAKE.id && RC.chans.length === 10 && RC.chans[0].pad === want;
  }));
  ok('the setup panel builds, lists the device and one row per live channel', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='controller'));
    const host = $('startupBody');
    return host.querySelectorAll('.rcdev').length === 1 &&
           host.querySelector('.rcdev').classList.contains('act') &&
           host.querySelectorAll('.rcrow[data-rc-chan]').length >= 4 &&
           !!$('rcAdvanced') && !!$('btnRcCal');
  }));
  /* THE BAR CARRIES THE LIVE VALUE — and the value is what rcNorm() says it
     is, not 0.5.

     This assertion has been red in the container for months and was written
     off as "the rc flake". It is not flaky: it is wrong, identically, every
     time. It hard-coded 0.5 for a raw axis reading of 0.47, which was true
     before channels grew a **deadband** — and rcNorm() rescales OUTSIDE the
     deadband rather than subtracting it, so 0.47 on a ±1 channel with
     dz 0.06 is (0.47 − 0.06) / (1 − 0.06) = 0.436. The bars were right and
     the test was measuring the wrong number.

     So it derives the expectation from the channel's own calibration now.
     That is also the assertion anyone actually wants here: the DOM shows
     what the normaliser produced, whatever the deadband happens to be. And
     it WAITS for it rather than counting animation frames, per the house
     rule — rcUiTick() repaints on the frame, and a frame is not a unit of
     time on a GPU-less runner. */
  await ev(()=>{ FAKE.ax = [0.47,0.05,-1,-1,0,0,0,0]; rcRead(); });
  const liveBars = await page.waitForFunction(()=>{
    if(RCUI.rows.length < 4) return false;
    const row = RCUI.rows.find(r=>r.idx === 0);
    if(!row) return false;
    const want = rcNorm(RC.chans[0], RC.raw[0]);
    const shown = parseFloat(row.val.textContent);
    const width = parseFloat(row.fill.style.width);
    return (Math.abs(shown - want) <= 0.005 && Math.abs(want) > 0.1 && width > 10)
      ? {shown:shown, want:+want.toFixed(3), width:+width.toFixed(1)} : false;
  }, {timeout:8000}).then(h=>h.jsonValue()).catch(()=>null);
  ok('the bars actually carry the live values', !!liveBars, JSON.stringify(liveBars));
  ok('the direct-output picker only exists once Advanced is ticked', await ev(()=>{
    const before = $('startupBody').querySelectorAll('select.rcmode').length;
    $('rcAdvanced').click();
    const after = $('startupBody').querySelectorAll('select.rcmode').length;
    $('rcAdvanced').click();
    return before === 0 && after >= 4;
  }));
  ok('the live bars stop redrawing once the panel leaves the page', await ev(async ()=>{
    wizGo(0);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return RCUI.raf === 0 && RCUI.host === null;
  }));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
