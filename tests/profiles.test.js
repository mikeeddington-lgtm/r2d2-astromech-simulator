const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

/* --- reference implementation of mixHubDrive(), transcribed straight from the .ino --- */
function refMix(stickX, stickY, maxDriveSpeed, C, st){
  /* C's map(): the QUOTIENT is truncated (integer division, toward zero) and
     out_min is added to the result. This copy used to truncate the SUM, the
     same off-by-one core/util.js carried until 2026-08-22 — so the reference
     agreed with the sim only because both were wrong in the same place, on
     every reverse reading. A transcription that reproduces the bug is not a
     transcription. See the map_() note in core/util.js. */
  const map_=(x,a,b,c,d)=>Math.trunc((x-a)*(d-c)/(b-a))+c;
  const DZ=C.DRIVEDEADZONERANGE*258;
  if(stickX<=-DZ||stickX>=DZ||stickY<=-DZ||stickY>=DZ) st.RampingMillis=st.now;
  if(stickX<=-DZ||stickX>=DZ||stickY<=-DZ||stickY>=DZ||(st.now-st.RampingMillis<C.RampingDeadzoneDelay)){
    const Yn=map_(stickY,-32768,32767,-100,100);
    if(st.YDist<Yn){ if(Yn-st.YDist>C.RAMPING) st.YDist+=C.RAMPING; else st.YDist=Yn; }
    else if(st.YDist>Yn){ if(st.YDist-Yn>C.RAMPING) st.YDist-=C.RAMPING; else st.YDist=Yn; }
    st.XDist=map_(stickX,-32768,32767,-100,100);
    const R=st.YDist-(st.XDist*(C.TURNSPEED/100));
    const L=st.YDist+(st.XDist*(C.TURNSPEED/100));
    const fwd=map_(maxDriveSpeed,0,127,90,180), rev=map_(maxDriveSpeed,0,127,90,0);
    st.leftFoot =Math.max(0,Math.min(180,map_(L,-100,100,rev,fwd)));
    st.rightFoot=Math.max(0,Math.min(180,map_(R,-100,100,rev,fwd)));
  }else if(st.now-st.RampingMillis>C.RampingDeadzoneDelay){ st.leftFoot=90; st.rightFoot=90; }
  return st;
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForTimeout(1800);
  const ev = f => page.evaluate(f);
  const hold = o => page.evaluate(o=>{Object.assign(INPUT.virtual.btn,o.btn||{});if(o.ax)Object.assign(INPUT.virtual,o.ax);},o);
  const clr  = () => page.evaluate(()=>{BTN_NAMES.forEach(n=>INPUT.virtual.btn[n]=0);INPUT.virtual.LX=INPUT.virtual.LY=INPUT.virtual.RX=INPUT.virtual.RY=0;});
  const prof = id => page.evaluate(id=>{loadProfile(id);buildFwSelector();},id);
  /* the page is much heavier now the CAD is bundled, so headless software GL
     advances SIM.millis well behind the wall clock — wait on simulated time. */
  const waitSim = async (ms, cap=90000)=>{
    const t0 = await ev(()=>SIM.millis);
    const start = Date.now();
    while(Date.now()-start < cap){
      if((await ev(()=>SIM.millis)) - t0 >= ms) return true;
      await page.waitForTimeout(80);
    }
    return false;
  };
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});

  const arm = async()=>{
    if(await ev(()=>FW.isDriveEnabled)) return;
    await hold({btn:{START:1}}); await page.waitForTimeout(140); await clr(); await page.waitForTimeout(220);
  };
  const start = arm;

  console.log('\n════ profile A · mod2026 ════');
  await prof('mod2026'); await page.waitForTimeout(400);
  await start();
  ok('START arms', await ev(()=>FW.isDriveEnabled));

  // the Sabertooth watchdog starvation
  await hold({ax:{LY:1}}); await page.waitForTimeout(700);
  const midRamp = await ev(()=>({d:MOT.drive, to:MOT.driveTO}));
  ok('packets flow while the throttle is still ramping', !midRamp.to, JSON.stringify(midRamp));
  await waitSim(1400);   // throttle now pinned at DRIVESPEED1, nothing changes
  const starved = await ev(()=>({d:MOT.drive, to:MOT.driveTO, eff:effDrive(), gap:Math.round(SIM.millis-MOT.driveAt)}));
  ok('holding a steady full throttle starves the 950 ms watchdog', starved.to && starved.d===90 && starved.eff===0, JSON.stringify(starved));
  await clr(); await page.waitForTimeout(500);

  console.log('\n════ profile B · Maestro 2025 (PWM hub) ════');
  await prof('maestro25'); await page.waitForTimeout(500);
  const cfgB = await ev(()=>({fc:CFG.FOOT_CONTROLLER,d1:CFG.DRIVESPEED1,d2:CFG.DRIVESPEED2,d3:CFG.DRIVESPEED3,
                              t:CFG.TURNSPEED,dz:CFG.DRIVEDEADZONERANGE,ddz:CFG.DOMEDEADZONERANGE,
                              rdd:CFG.RampingDeadzoneDelay,cal:CFG.CalibrationSpeed,vol:CFG.vol,ramp:CFG.RAMPING}));
  ok('constants match the sketch', cfgB.fc===1&&cfgB.d1===30&&cfgB.d2===38&&cfgB.d3===50&&cfgB.t===40
     &&cfgB.dz===22&&cfgB.ddz===20&&cfgB.rdd===200&&cfgB.cal===127&&cfgB.vol===25&&cfgB.ramp===2, JSON.stringify(cfgB));

  await start();
  ok('feet idle at 90/90 before the stick moves', await ev(()=>MOT.leftFoot===90&&MOT.rightFoot===90));

  // hub mixing vs the reference transcription
  const mixCases = [[0,32767],[32767,32767],[-32767,32767],[16000,-20000],[0,-32767],[3000,3000]];
  let mixOk = true, detail='';
  for(const [sx,sy] of mixCases){
    const gotSeq = await page.evaluate(async ([sx,sy])=>{
      FW.YDist=0; FW.XDist=0; FW.RampingMillis=SIM.millis; FW.leftFoot=90; FW.rightFoot=90;
      const out=[];
      for(let i=0;i<80;i++){ mixHubDrive(sx,sy,CFG.DRIVESPEED1); out.push([FW.leftFoot,FW.rightFoot]); }
      return out;
    },[sx,sy]);
    const C = cfgB; const st={YDist:0,XDist:0,RampingMillis:0,now:0,leftFoot:90,rightFoot:90};
    const refSeq=[];
    for(let i=0;i<80;i++){ refMix(sx,sy,C.d1,{DRIVEDEADZONERANGE:C.dz,RampingDeadzoneDelay:C.rdd,RAMPING:C.ramp,TURNSPEED:C.t},st); refSeq.push([st.leftFoot,st.rightFoot]); }
    const same = JSON.stringify(gotSeq)===JSON.stringify(refSeq);
    if(!same){ mixOk=false; detail += ` [${sx},${sy}] got ${JSON.stringify(gotSeq[79])} ref ${JSON.stringify(refSeq[79])}`; }
  }
  ok('mixHubDrive() matches a straight transcription of the .ino over 6 stick cases', mixOk, detail);

  // the speed-cap overshoot
  const over = await ev(()=>{
    FW.YDist=0;FW.XDist=0;FW.RampingMillis=SIM.millis;
    for(let i=0;i<80;i++) mixHubDrive(32767,32767,CFG.DRIVESPEED3);
    return {left:FW.leftFoot, cap:map_(CFG.DRIVESPEED3,0,127,90,180)};
  });
  ok('full-throttle turn overshoots the speed-3 servo cap', over.left>over.cap, `leftFoot=${over.left} cap=${over.cap}`);

  // calibration mode
  await ev(()=>{FW.drivespeed=CFG.DRIVESPEED3;});
  await hold({btn:{L1:1,R1:1,L2:255,R2:255},ax:{LY:1}}); await page.waitForTimeout(700);
  const cal = await ev(()=>({cal:FW.CalibrationMode,left:MOT.leftFoot}));
  ok('L1+L2+R1+R2 at speed 3 enters calibration mode', cal.cal===true, JSON.stringify(cal));
  await clr(); await waitSim(500);
  ok('releasing the stick returns the feet to 90/90', await ev(()=>MOT.leftFoot===90&&MOT.rightFoot===90));

  // DY volume inversion
  const v0 = await ev(()=>CFG.vol);
  await hold({btn:{R1:1}}); await page.waitForTimeout(60);
  await hold({btn:{R1:1,UP:1}}); await page.waitForTimeout(90); await clr(); await page.waitForTimeout(200);
  const v1 = await ev(()=>CFG.vol);
  ok('D-pad UP runs vol-- on the DY-SV5W (inverted)', v1===v0-1, `${v0} → ${v1}`);

  // held maestro script restarts and never completes
  await hold({btn:{R2:255,UP:1}}); await page.waitForTimeout(900);
  // slot 0 is the door script: doorL fires at t=0, smallDoor not until 560 ms
  const held = await ev(()=>({t:MAESTRO.slot[0]?Math.round(MAESTRO.slot[0].t):-1,
                              first:ACT_T.doorL, last:ACT_T.smallDoor}));
  ok('holding RT+▲ pins the script at t≈0 — only the first step ever fires',
     held.t<40 && held.first===1 && held.last===0, JSON.stringify(held));
  await clr(); await waitSim(1700);
  const released = await ev(()=>({first:ACT_T.doorL, last:ACT_T.smallDoor}));
  ok('after release the sequence runs to completion', released.last===1, JSON.stringify(released));
  // blocking delay(750) — drive the retry in-page because automateAction =
  // random(1,5) and only 1-3 actually turn the dome
  await hold({btn:{BACK:1}}); await page.waitForTimeout(120); await clr();
  const blocked = await page.evaluate(()=> new Promise(res=>{
    FW.isInAutomationMode = true;
    let tries = 0;
    const id = setInterval(()=>{
      if(FW.pendingAuto){
        clearInterval(id);
        res({pending:true, blocked:SIM.millis < SIM.blockUntil, dome:MOT.dome, act:FW.automateAction, tries});
        return;
      }
      if(++tries > 300){ clearInterval(id); res({pending:false, tries}); return; }
      FW.automateDelay=0; FW.automateMillis=0; FW.turnDirection=45; SIM.blockUntil=-1;
    }, 25);
  }));
  ok('automation blocks the loop and holds the Syren at turnDirection',
     blocked.pending && blocked.blocked && blocked.dome!==0, JSON.stringify(blocked));
  const after = await page.evaluate(()=> new Promise(res=>{
    let tries=0;
    const id=setInterval(()=>{
      if(!FW.pendingAuto || ++tries>400){
        clearInterval(id);
        res({pending:FW.pendingAuto, dome:MOT.dome, dir:FW.turnDirection, tries});
      }
    }, 25);
  }));
  ok('after the 750 ms block the dome stops and the direction flips to \u2213 45',
     !after.pending && after.dome===0 && after.dir===-45, JSON.stringify(after));
  await ev(()=>{FW.isInAutomationMode=false;});

  // FOOT_CONTROLLER live toggle
  await ev(()=>{CFG.FOOT_CONTROLLER=0; buildOutputs();});
  await page.waitForTimeout(200);
  await arm();
  await hold({ax:{LY:1}}); await page.waitForTimeout(900);
  const fc0 = await ev(()=>({d:MOT.drive,to:MOT.driveTO,lf:MOT.leftFoot}));
  ok('FOOT_CONTROLLER 0 switches to Sabertooth packets', fc0.d!==0&&fc0.lf===90, JSON.stringify(fc0));
  await page.waitForTimeout(1400);
  ok('…and its watchdog stays fed (packets sent every pass)', await ev(()=>!MOT.driveTO));
  await clr();

  console.log('\n════ profile C · Maestro 2022 BETA ════');
  await prof('maestro22'); await page.waitForTimeout(500);
  const cfgC = await ev(()=>({d1:CFG.DRIVESPEED1,d2:CFG.DRIVESPEED2,d3:CFG.DRIVESPEED3,t:CFG.TURNSPEED,
                              dome:CFG.DOMESPEED,ramp:CFG.RAMPING,dz:CFG.DRIVEDEADZONERANGE}));
  ok('constants match the BETA sketch', cfgC.d1===60&&cfgC.d2===100&&cfgC.d3===127&&cfgC.t===50
     &&cfgC.dome===80&&cfgC.ramp===5&&cfgC.dz===20, JSON.stringify(cfgC));

  await start();
  await hold({ax:{LY:1}}); await page.waitForTimeout(500);
  await ev(()=>{INPUT.forceDisconnect=true;}); await page.waitForTimeout(500);
  const lost = await ev(()=>({armed:FW.isDriveEnabled, d:MOT.drive}));
  ok('BETA keeps isDriveEnabled through a dropout (2025 sketch clears it)', lost.armed===true && lost.d===0, JSON.stringify(lost));
  await clr(); await ev(()=>{INPUT.forceDisconnect=false;}); await page.waitForTimeout(400);
  ok('so it re-arms itself on reconnect with no START press', await ev(()=>FW.isDriveEnabled===true));

  console.log('\n════ shared ════');
  const stick = await ev(()=>{
    const before = FW.speedSelectButton+'/'+FW.hpLightToggleButton;
    FW.isLeftStickDrive=false; applyStickMapping();
    const after = FW.speedSelectButton+'/'+FW.hpLightToggleButton;
    FW.isLeftStickDrive=true; applyStickMapping();
    return {before, after};
  });
  ok('maestro sketches do NOT swap L3/R3 with isLeftStickDrive', stick.before===stick.after, JSON.stringify(stick));
  await prof('mod2026'); await page.waitForTimeout(400);
  const stick2 = await ev(()=>{
    FW.isLeftStickDrive=false; applyStickMapping();
    const after = FW.speedSelectButton+'/'+FW.hpLightToggleButton;
    FW.isLeftStickDrive=true; applyStickMapping();
    return after;
  });
  ok('mod2026 does swap them', stick2==='R3/L3', stick2);

  /* ================================================================
     2026-08-22 — map_() IS ARDUINO'S map(), ON BOTH HALVES OF THE STICK

     Arduino's is, in C:
         long map(x, a, b, c, d){ return (x - a) * (d - c) / (b - a) + c; }
     where the DIVISION truncates toward zero and `+ c` happens afterwards.
     core/util.js truncated the SUM instead, and Math.trunc(q + c) equals
     Math.trunc(q) + c only once q + c has reached zero — so every reading
     from the negative half of a stick came out one short of the sketch's.
     Reverse throttle, reverse turn, dome-left and the leftDirection===0
     foot-PWM path are all on the wrong side of that line (the call sites are
     in profiles/maestro-shared.js and profiles/mod2026.js).

     One off-by-one is not much of a droid problem; it is a total problem for
     an app whose whole premise is that its numbers ARE the sketch's numbers.
     So this sweeps every input rather than sampling, in all three shapes the
     call sites use: a symmetric signed range, a REVERSED one (dome, where
     out_min > out_max), and the unconstrained overshoot the foot PWM relies
     on going outside its input range.
     ================================================================ */
  console.log('\n════ map_() matches Arduino across the whole stick ════');
  const mp = await ev(()=>{
    /* Arduino's map() with C's integer semantics spelled out: truncate the
       QUOTIENT (C integer division truncates toward zero), then add out_min. */
    const ref = (x,a,b,c,d)=>Math.trunc((x-a)*(d-c)/(b-a)) + c;
    const sweep = (lo,hi,a,b,c,d)=>{
      let bad = 0, first = null;
      for(let x=lo; x<=hi; x++){
        const g = map_(x,a,b,c,d), r = ref(x,a,b,c,d);
        if(g !== r){ bad++; if(!first) first = {x, got:g, want:r}; }
      }
      return {bad, first};
    };
    return {
      throttle: sweep(-32768,32767,-32768,32767,-50,50),   // map_(hat, …, -drivespeed, drivespeed)
      dome:     sweep(-32768,32767,-32768,32767,80,-80),   // map_(hat, …, DOMESPEED, -DOMESPEED)
      hub:      sweep(-32768,32767,-32768,32767,-100,100), // mixHubDrive()'s XDist/YDist
      foot:     sweep(-200,200,-100,100,132,48),           // map_(LeftSpeed,-100,100,fwd,rev), overshoot and all
      one:      map_(-1,-32768,32767,-50,50),
      ends:     [map_(-32768,-32768,32767,-50,50), map_(32767,-32768,32767,-50,50)],
      centre:   map_(0,-32768,32767,-50,50)
    };
  });
  ok('every one of the 65,536 throttle positions agrees with the sketch',
     mp.throttle.bad === 0, mp.throttle.bad+' mismatches, first '+JSON.stringify(mp.throttle.first));
  ok('…and every one of the dome\'s, where the output range runs backwards',
     mp.dome.bad === 0, mp.dome.bad+' mismatches, first '+JSON.stringify(mp.dome.first));
  ok('…and mixHubDrive()\'s own -100..100 stick distances',
     mp.hub.bad === 0, mp.hub.bad+' mismatches, first '+JSON.stringify(mp.hub.first));
  ok('…and the foot-PWM servo mix, past both ends of its input range',
     mp.foot.bad === 0, mp.foot.bad+' mismatches, first '+JSON.stringify(mp.foot.first));
  ok('one click below centre reads -1, not 0 — the whole negative half was off by one',
     mp.one === -1, String(mp.one));
  ok('the ends still land exactly on the output range and centre is still centre',
     mp.ends[0] === -50 && mp.ends[1] === 50 && mp.centre === 0,
     JSON.stringify(mp.ends)+' centre '+mp.centre);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
