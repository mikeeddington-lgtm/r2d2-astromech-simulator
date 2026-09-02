const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok = (n,c,extra='') => { c?pass++:fail++;
  console.log((c?'  PASS':'  FAIL')+'  '+n+(extra?'   '+extra:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForTimeout(1800);
  const ev = f => page.evaluate(f);
  const hold = o => page.evaluate(o=>{Object.assign(INPUT.virtual.btn,o.btn||{});if(o.ax)Object.assign(INPUT.virtual,o.ax);},o);
  const clr  = () => page.evaluate(()=>{BTN_NAMES.forEach(n=>INPUT.virtual.btn[n]=0);INPUT.virtual.LX=INPUT.virtual.LY=INPUT.virtual.RX=INPUT.virtual.RY=0;});

  console.log('\n== ported firmware semantics ==');

  // Arduino integer map() reproduced exactly
  const m = await ev(()=>[ map_(32767,-32768,32767,-90,90), map_(-32768,-32768,32767,-90,90),
                           map_(0,-32768,32767,-90,90),     map_(1000,-32768,32767,-127,127) ]);
  ok('map() matches Arduino integer maths', m[0]===90 && m[1]===-90 && m[2]===0, JSON.stringify(m));

  // drive is latched off until START
  await hold({ax:{LY:1}}); await page.waitForTimeout(500);
  const notArmed = await ev(()=>({drive:MOT.drive, dt:FW.driveThrottle}));
  ok('feet stay silent until START (drive cmd never sent)', notArmed.drive===0, JSON.stringify(notArmed));
  ok('driveThrottle still ramps internally while disarmed', notArmed.dt>0, 'dt='+notArmed.dt);
  await clr(); await page.waitForTimeout(300);

  // START arms it
  await hold({btn:{START:1}}); await page.waitForTimeout(100); await clr(); await page.waitForTimeout(200);
  ok('START arms the feet', await ev(()=>FW.isDriveEnabled));

  /* "RAMPING" IS NOT A RAMP (v1.78.0, review 2026-09-01, M13). This used to
     say "from 0 the throttle must climb in steps of 2 per loop" and then
     assert only the peak — which is how a claim that was never true sat
     here unchallenged. mod2026.ino:391-397, ported verbatim:

       if (throttleStickValue - driveThrottle < (RAMPING + 1)) driveThrottle += RAMPING;
       else driveThrottle = throttleStickValue;

     The comparison is backwards: a change BIGGER than RAMPING jumps to the
     target in one pass, and only a change of RAMPING or less is stepped —
     which overshoots a one-unit change and flips it ±RAMPING for ever
     (9,7,9,7… at RAMPING 2; the 2022 BETA buzzes ±5 on the Sabertooth wire
     the same way). The 2025 sketch fixed it (`> RAMPING`). The sim
     reproduces the bug on purpose — the bugs are the product — so what is
     pinned here is the REAL shape, driven pass by pass through
     PROFILE.loop() inside one evaluate so no frame can land in between,
     and the note that now tells the builder (asserted with the other
     notes, below). */
  await ev(()=>{FW.driveThrottle=0; FW.lastDriveThrottleSent=-1;});
  await hold({ax:{LY:1}});
  const ramp = await page.evaluate(()=> new Promise(res=>{
    const s=[]; const t0=SIM.ticks;
    const id=setInterval(()=>{ s.push(FW.driveThrottle); if(SIM.ticks-t0>200){clearInterval(id);res(s);} },16);
  }));
  ok('full stick lands at DRIVESPEED1 and stays there', ramp[ramp.length-1]===90 && ramp.every(v=>v===0||v===90),
     'peak='+ramp[ramp.length-1]+' values seen: '+JSON.stringify([...new Set(ramp)]));
  const shape = await ev(()=>{
    const passes = (hat, from, n)=>{
      INPUT.virtual.LY = hat/32767; XB.hat.LeftHatY = hat;   // the pad writes XB.hat each frame; set both so loop() sees it now
      FW.driveThrottle = from;
      const out = [];
      for(let i=0;i<n;i++){ PROFILE.loop(); out.push(FW.driveThrottle); }
      return out;
    };
    const r = { ramping: CFG.RAMPING,
                jump: passes(32767, 0, 1),               // 0 → 90: one pass
                jumpStick: FW.throttleStickValue,
                buzz: passes(3000, 7, 4),                // stick reads 8, throttle is 7: never lands
                buzzStick: FW.throttleStickValue,
                twoWide: passes(3000, 6, 3) };           // a change of exactly RAMPING does land
    INPUT.virtual.LY = 1; XB.hat.LeftHatY = 32767;
    return r;
  });
  ok('a 0 → 90 stick change lands at 90 in ONE pass — a jump, not a climb (RAMPING='+shape.ramping+')',
     shape.jumpStick===90 && shape.jump[0]===90, JSON.stringify(shape.jump));
  ok('a 7 → 8 change never lands: 9, 7, 9, 7 — the ±RAMPING buzz, reproduced as the sketch has it',
     shape.buzzStick===8 && JSON.stringify(shape.buzz)==='[9,7,9,7]', JSON.stringify(shape.buzz)+' (stick reads '+shape.buzzStick+')');
  ok('…while a change of exactly RAMPING (6 → 8) does land and stay',
     JSON.stringify(shape.twoWide)==='[8,8,8]', JSON.stringify(shape.twoWide));
  await clr(); await page.waitForTimeout(900);

  // deadzone
  await hold({ax:{LY:0.06}}); await page.waitForTimeout(400);
  const dzv = await ev(()=>({tsv:FW.throttleStickValue, dt:FW.driveThrottle}));
  ok('DRIVEDEADZONERANGE swallows small stick', dzv.dt===0, JSON.stringify(dzv));
  await clr(); await page.waitForTimeout(400);

  // dome is live even when the feet are disarmed
  await hold({btn:{START:1}}); await page.waitForTimeout(100); await clr(); await page.waitForTimeout(200);
  await hold({ax:{RX:1}}); await page.waitForTimeout(400);
  const domeOff = await ev(()=>({armed:FW.isDriveEnabled, dome:MOT.dome}));
  ok('dome turns with the feet disarmed', !domeOff.armed && domeOff.dome!==0, JSON.stringify(domeOff));
  ok('dome axis is inverted (stick right → negative Syren cmd)', domeOff.dome<0, 'dome='+domeOff.dome);
  await clr(); await page.waitForTimeout(300);

  // emergency brake on controller loss
  await hold({ax:{LY:1}}); await page.waitForTimeout(200);
  await ev(()=>{INPUT.forceDisconnect=true;}); await page.waitForTimeout(400);
  const brake = await ev(()=>({d:MOT.drive,t:MOT.turn,dome:MOT.dome,armed:FW.isDriveEnabled,first:FW.firstLoadOnConnect}));
  ok('controller loss → all motors zeroed and drive de-armed',
     brake.d===0&&brake.t===0&&brake.dome===0&&!brake.armed&&!brake.first, JSON.stringify(brake));
  await clr();
  await ev(()=>{INPUT.forceDisconnect=false;}); await page.waitForTimeout(400);
  ok('re-sync replays the startup track 21', await ev(()=>SND.track===21));

  console.log('\n== the dome-automation collision ==');
  // force the automation timer to fire immediately
  await hold({btn:{BACK:1}}); await page.waitForTimeout(100); await clr();
  await ev(()=>{FW.automateDelay=0; FW.automateMillis=0;});
  await page.waitForTimeout(800);
  const stock = await ev(()=>({auto:FW.isInAutomationMode, turning:FW.isDomeTurningAuto, dir:FW.turnDirection, dome:MOT.dome}));
  ok('stock firmware: auto-turn armed but Syren gets 0 (bug reproduced)',
     stock.auto && stock.turning && stock.dome===0, JSON.stringify(stock));

  /* v1.75.0 — the dome-automation fix moved to the setup's Firmware step,
     behind that step's Advanced tick, with the rest of the sketch's own
     business. Open the door the user opens rather than reaching for an id
     that is only rendered while it is open. */
  await ev(()=>{ closeStartup(); wizOpen(wizStepIndex('firmware')); WIZ_ADV.firmware = true; buildStartup(); });
  await ev(()=>{const c=document.getElementById('cbFixDome'); c.checked=true; c.dispatchEvent(new Event('change'));});
  await ev(()=>{FW.automateDelay=0; FW.automateMillis=0; FW.isDomeTurningAuto=false;});
  await page.waitForTimeout(900);
  const fixed = await ev(()=>({turning:FW.isDomeTurningAuto, dome:MOT.dome}));
  ok('with the fix: Syren actually receives ±75', Math.abs(fixed.dome)===75, JSON.stringify(fixed));
  /* (v1.78.0, M13) the Firmware step's Advanced box is where the sketch's
     bug notes are rendered — the same list HANDOVER §4 keeps — and until
     now nothing in it said that RAMPING is not a ramp. Read from the DOM
     the builder sees, not from the profile object. */
  const notes = await ev(()=>Array.from(document.querySelectorAll('#startupBody .note')).map(n=>n.textContent));
  const rampNote = notes.find(t=>/RAMPING is not a ramp/.test(t)) || '';
  ok('the mod2026 notes say RAMPING is not a ramp — the jump, the 9,7,9,7 buzz, and that the 2025 sketch fixed it',
     /one pass/.test(rampNote) && /9, 7, 9, 7/.test(rampNote) && /2025 sketch fixed/.test(rampNote),
     rampNote ? rampNote.slice(0,120)+'…' : notes.length+' note(s), none about RAMPING');
  ok('…and the profile carries it as a warn note, in the shape of the others',
     await ev(()=>PROFILES.mod2026.notes.some(n=>n.k==='warn' && /RAMPING is not a ramp/.test(n.h))));
  await ev(()=>{const c=document.getElementById('cbFixDome'); c.checked=false; c.dispatchEvent(new Event('change'));});
  await ev(()=>closeStartup());

  console.log('\n== servo endpoints round-trip ==');
  const cfgOk = await ev(()=>{
    const pairs=[[1,0,'LeftDoorClose','LeftDoorOpen'],[1,1,'RightDoorClose','RightDoorOpen'],
                 [1,2,'GripperArmIn','GripperArmOut'],[1,6,'InterArmIn','InterArmOut'],
                 [1,8,'dataportDoorClose','dataportDoorOpen'],[1,9,'chargebayDoorClose','chargebayDoorOpen']];
    return pairs.every(([b,c,lo,hi]) => SERVO[b][c].def.lo===lo && SERVO[b][c].def.hi===hi);
  });
  ok('every channel is bound to the right .ino constant pair', cfgOk);

  const chNames = await ev(()=>SERVO_DEFS[1].map(d=>d.ch+':'+d.name).join(' | '));
  console.log('  0x40 →', chNames);

  ok('no page errors', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
