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

  // RAMPING: from 0 the throttle must climb in steps of 2 per loop
  await ev(()=>{FW.driveThrottle=0; FW.lastDriveThrottleSent=-1;});
  await hold({ax:{LY:1}});
  const ramp = await page.evaluate(()=> new Promise(res=>{
    const s=[]; const t0=SIM.ticks;
    const id=setInterval(()=>{ s.push(FW.driveThrottle); if(SIM.ticks-t0>200){clearInterval(id);res(s);} },16);
  }));
  ok('drive ramps up (RAMPING=2/loop), tops out at DRIVESPEED1', ramp[ramp.length-1]===90, 'peak='+ramp[ramp.length-1]);
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
