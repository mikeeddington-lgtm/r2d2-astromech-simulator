/* The Polar Mouse — the second drivable vehicle.
   -------------------------------------------------------------------------
   Most of this is arithmetic, not pixels: the point of giving the thing a
   bicycle model instead of reusing the droid's skid-steer is that the numbers
   have to come out right. So the tests measure the path it actually drives and
   compare it against the geometry cad/mouse.py measured off the CAD.

   Two of these are regressions waiting to happen:
     · it MUST NOT be able to turn on the spot. The moment someone "fixes"
       the steering by reusing effTurn(), the model on screen starts lying
       about a chassis that has a steering rack and a fixed rear axle.
     · while the mouse has the sticks the SKETCH must see them CENTRED,
       or the droid drives off across the room while you steer the trolley. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };
const near=(a,b,t)=>Math.abs(a-b)<=t;

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof MOUSE!=="undefined" && MOUSE.loaded', {timeout:60000});
  const ev = f => page.evaluate(f);
  const evA = (f,a) => page.evaluate(f,a);
  /* Stop the render loop before measuring anything. This suite integrates the
     vehicle BY HAND so the arithmetic is deterministic, and frame() would be
     doing two things behind its back: stepping the model again with a real
     wall-clock dt, and — through pollInput() — resetting the throttle to
     whatever the untouched on-screen stick says. Leave it running and the
     same turn settles at a different angle every run. */
  await ev(()=>{
    if(typeof closeStartup==='function') closeStartup();
    frame = function(){};
    mouseResetPose();
  });

  /* drive it: n steps of dt with the stick held at (LX, LY) */
  const drive = (n, dt, LX, LY) => evA(([n,dt,LX,LY])=>{
    for(let i=0;i<n;i++){ mouseTakeSticks(LX, LY, 0, 0); mouseStep(dt); }
    return {x:MOUSE.pos.x, z:MOUSE.pos.z, yaw:MOUSE.yaw, v:MOUSE.speed,
            steer:MOUSE.steer, chYaw:MOUSE.chYaw, spin:MOUSE.spin, chSpin:MOUSE.chSpin};
  }, [n,dt,LX,LY]);

  console.log('\n════ it loaded, and it is not enormous ════');
  const st = await ev(()=>MOUSE.stats);
  ok('the bundled payload decodes and builds', st.parts>100 && st.tris>0, JSON.stringify(st));
  ok('triangles stay in the MK4\'s league after stripping and decimating',
     st.tris < 260000, st.tris.toLocaleString()+' tris');
  ok('draw calls stay low — everything is merged per member and material',
     st.draws < 40, st.draws+' draws');
  ok('the internals really were dropped', await ev(()=>MOUSE.header.dropped > 50),
     await ev(()=>MOUSE.header.dropped+' groups'));
  ok('no gear, bearing or differential survived into the payload', await ev(()=>
    !MOUSE.header.parts.some(p=>/gear|bearing|diffgear|driveshaft/i.test(p.base))));

  console.log('\n════ the chassis was measured, not guessed ════');
  const S = await ev(()=>MOUSE.spec);
  ok('wheelbase came off the axles', near(S.wheelbase, 0.343, 0.004), S.wheelbase.toFixed(4)+' m');
  ok('front and rear track agree', near(S.trackF, S.trackR, 0.002), S.trackF.toFixed(4)+' m');
  ok('wheel radius is the tyre\'s own', near(S.wheelR, 0.0775, 0.002), (S.wheelR*2000).toFixed(0)+' mm dia');
  ok('the pin sits BEHIND the driven axle', S.hitchBack > 0.05, S.hitchBack.toFixed(4)+' m back');
  ok('the trailer is longer than the tractor\'s wheelbase', S.trailerLen > S.wheelbase,
     S.trailerLen.toFixed(4)+' m pin to axle');

  const wh = await ev(()=>MOUSE.header.vehicle.wheels.map(w=>({id:w.id,y:w.c[1],steer:w.steer,tr:w.trailer})));
  ok('six wheels: two steer, two trailer', wh.length===6 &&
     wh.filter(w=>w.steer).length===2 && wh.filter(w=>w.tr).length===2, wh.map(w=>w.id).join(','));
  ok('every wheel centre sits exactly one radius off the ground',
     wh.every(w=>near(w.y, S.wheelR, 1e-4)));
  const box = await ev(()=>{ const b=new THREE.Box3().setFromObject(MOUSE.root); return {lo:b.min.toArray(), hi:b.max.toArray()}; });
  ok('and the whole vehicle stands ON the floor', near(box.lo[1], 0, 0.01), 'y min '+box.lo[1].toFixed(4));

  console.log('\n════ the pad belongs to one vehicle at a time ════');
  ok('the droid has it to start with', await ev(()=>DRV.who==='r2' && !mouseIsDriving()));
  ok('the button hands it over', await ev(()=>{ mouseToggleDriver(); return mouseIsDriving(); }));
  /* REGRESSION: if the sketch keeps seeing the sticks, R2 drives off while
     you are steering the mouse. */
  const gated = await ev(()=>{
    INPUT.virtual.LX = 0.9; INPUT.virtual.LY = 0.9;
    pollInput();
    const seen = {lx:XB.hat.LeftHatX, ly:XB.hat.LeftHatY};
    const got = {thr:MOUSE.throttle, str:MOUSE.steerCmd};
    INPUT.virtual.LX = 0; INPUT.virtual.LY = 0; pollInput();
    return {seen, got};
  });
  ok('the sketch sees the sticks CENTRED while the mouse has them',
     gated.seen.lx===0 && gated.seen.ly===0, JSON.stringify(gated.seen));
  ok('and the mouse gets them instead', gated.got.thr>0.5 && gated.got.str<-0.5, JSON.stringify(gated.got));
  ok('buttons are deliberately NOT gated — sound is not driving', await ev(()=>{
    INPUT.virtual.btn.A = 1; pollInput();
    const p = XB.press.A; INPUT.virtual.btn.A = 0; pollInput();
    return p > 0;
  }));
  ok('the droid does not move while the mouse is being driven', await ev(()=>{
    const x0=R2.pos.x, z0=R2.pos.z;
    for(let i=0;i<60;i++){ mouseTakeSticks(0, 1, 0, 0); mouseStep(1/60); applyToModel(1/60); }
    return Math.abs(R2.pos.x-x0)<1e-9 && Math.abs(R2.pos.z-z0)<1e-9;
  }));
  await ev(()=>mouseResetPose());

  console.log('\n════ it drives like a car, because it is one ════');
  const straight = await drive(180, 1/60, 0, 1);
  ok('full throttle reaches the top speed', near(straight.v, 1.85, 0.05), straight.v.toFixed(3)+' m/s');
  ok('and drives straight ahead', near(straight.yaw, -0.55, 1e-9), 'yaw held');
  const rolled = Math.hypot(straight.x-1.75, straight.z-0.95);
  ok('the wheels rolled the distance travelled, not some other number',
     near(Math.abs(straight.spin)*(await ev(()=>MOUSE.spec.wheelR)), rolled, 0.02),
     (Math.abs(straight.spin)*0.0775).toFixed(3)+' m of tread vs '+rolled.toFixed(3)+' m driven');

  /* REGRESSION: a steering rack cannot pivot the vehicle on the spot. */
  await ev(()=>mouseResetPose());
  const still = await drive(120, 1/60, 1, 0);
  ok('IT CANNOT TURN ON THE SPOT — stationary, full lock, no yaw',
     near(still.yaw, -0.55, 1e-9) && near(still.x, 1.75, 1e-9), 'yaw '+still.yaw.toFixed(6));
  ok('but the steering did move to full lock', near(Math.abs(still.steer), 0.55, 0.01),
     (still.steer*180/Math.PI).toFixed(1)+'°');

  await ev(()=>mouseResetPose());
  const slew = await drive(4, 1/60, -1, 0);
  ok('the steering SLEWS like a servo instead of snapping',
     Math.abs(slew.steer) > 0.01 && Math.abs(slew.steer) < 0.55,
     (slew.steer*180/Math.PI).toFixed(1)+'° after 4 frames');

  /* the turn radius the bicycle model promises: R = wheelbase / tan(delta) */
  await ev(()=>mouseResetPose());
  await drive(200, 1/60, -1, 1);                     // settle speed and lock
  const arc = await evA(([n,dt])=>{
    const p0 = {x:MOUSE.pos.x, z:MOUSE.pos.z, yaw:MOUSE.yaw};
    for(let i=0;i<n;i++){ mouseTakeSticks(-1, 1, 0, 0); mouseStep(dt); }
    const dyaw = MOUSE.yaw - p0.yaw;
    const dist = Math.hypot(MOUSE.pos.x-p0.x, MOUSE.pos.z-p0.z);
    /* chord -> radius for a circular arc */
    const R = Math.abs(dist / (2*Math.sin(Math.abs(dyaw)/2)));
    return {R, dyaw, want: MOUSE.spec.wheelbase/Math.tan(Math.abs(MOUSE.steer))};
  }, [60, 1/60]);
  ok('the turn radius matches wheelbase / tan(steer)', near(arc.R, arc.want, arc.want*0.04),
     'drove R='+arc.R.toFixed(3)+' m, model says '+arc.want.toFixed(3)+' m');
  ok('a turn that tight is a real vehicle, not a tank', arc.want > 0.5, arc.want.toFixed(2)+' m');

  console.log('\n════ the chariot tracks, it is not welded on ════');
  await ev(()=>mouseResetPose());
  await ev(()=>{ MOUSE.chYaw = MOUSE.yaw + 0.9; });     // start it folded
  const pulled = await drive(240, 1/60, 0, 1);
  ok('driving forward pulls a folded trailer straight',
     Math.abs(pulled.yaw - pulled.chYaw) < 0.05,
     'fold '+((pulled.yaw-pulled.chYaw)*180/Math.PI).toFixed(1)+'° after 4 s');

  await ev(()=>mouseResetPose());
  await drive(300, 1/60, -1, 1);
  const turning = await ev(()=>({fold: MOUSE.yaw - MOUSE.chYaw, steer: MOUSE.steer}));
  ok('in a steady turn it sits at an angle, INSIDE the corner',
     Math.abs(turning.fold) > 0.15 && Math.sign(turning.fold) === Math.sign(turning.steer),
     'fold '+(turning.fold*180/Math.PI).toFixed(1)+'°');
  const settled = await drive(120, 1/60, -1, 1);
  ok('and that angle settles rather than winding up',
     near(settled.chYaw - settled.yaw, turning.fold*-1, 0.05));

  /* reversing a trailer diverges — that is the real behaviour, so it is kept,
     but it must not fold through the towbar */
  await ev(()=>mouseResetPose());
  await ev(()=>{ MOUSE.chYaw = MOUSE.yaw + 0.15; });
  const jack = await drive(600, 1/60, -0.6, -1);
  const fold = Math.abs(jack.yaw - jack.chYaw);
  ok('reversing jack-knifes it, like the real thing', fold > 0.6, (fold*180/Math.PI).toFixed(0)+'°');
  ok('but it is clamped before it folds through the towbar',
     fold <= 1.76, (fold*180/Math.PI).toFixed(0)+'° vs the 100° limit');

  console.log('\n════ Ackermann on the front pair ════');
  /* pin BOTH the commanded and the actual steering: mouseStep() slews the
     actual toward the command every call, so setting only one of them leaves
     the last drive's stick still pulling */
  const ack = await evA(([lock])=>{
    mouseTakeSticks(0, 0, 0, 0);
    MOUSE.steer = lock; MOUSE.steerCmd = lock/0.55; MOUSE.speed = 0; mouseStep(1/60);
    return {L: MOUSE.wheels.FL.group.rotation.y, R: MOUSE.wheels.FR.group.rotation.y,
            rl: MOUSE.wheels.RL.group.rotation.y};
  }, [0.55]);
  ok('turning LEFT, the left (inner) wheel turns tighter',
     ack.L > ack.R && ack.R > 0, 'L '+(ack.L*180/Math.PI).toFixed(1)+'° vs R '+(ack.R*180/Math.PI).toFixed(1)+'°');
  const ackR = await evA(([lock])=>{
    MOUSE.steer = lock; MOUSE.steerCmd = lock/0.55; MOUSE.speed = 0; mouseStep(1/60);
    return {L: MOUSE.wheels.FL.group.rotation.y, R: MOUSE.wheels.FR.group.rotation.y};
  }, [-0.55]);
  ok('turning RIGHT, the right one does — the formula handles both',
     Math.abs(ackR.R) > Math.abs(ackR.L) && ackR.R < 0);
  ok('the rear wheels never steer', near(ack.rl, 0, 1e-9));
  const straightAck = await evA(([lock])=>{
    MOUSE.steer = lock; MOUSE.steerCmd = lock; mouseStep(1/60);
    return {L: MOUSE.wheels.FL.group.rotation.y, R: MOUSE.wheels.FR.group.rotation.y};
  }, [0]);
  ok('and they point dead ahead at zero lock',
     near(straightAck.L, 0, 1e-9) && near(straightAck.R, 0, 1e-9));

  console.log('\n════ back to the droid ════');
  await ev(()=>mouseResetPose());
  ok('handing the pad back stops the mouse dead', await ev(()=>{
    mouseTakeSticks(0, 1, 0, 0);
    mouseSetDriver('r2');
    return MOUSE.throttle === 0 && MOUSE.steerCmd === 0 && DRV.who === 'r2';
  }));
  ok('and the sketch sees the sticks again', await ev(()=>{
    INPUT.virtual.LY = 0.8; pollInput();
    const y = XB.hat.LeftHatY; INPUT.virtual.LY = 0; pollInput();
    return y > 1000;
  }));
  ok('a coasting mouse rolls to a stop and stays stopped', await ev(()=>{
    MOUSE.speed = 1.2;
    for(let i=0;i<300;i++) mouseStep(1/60);
    return Math.abs(MOUSE.speed) < 1e-9;
  }));
  ok('Follow tracks whoever is driving', await ev(()=>{
    mouseSetDriver('mouse'); const m = driverPos();
    mouseSetDriver('r2');    const r = driverPos();
    return Math.abs(m.x - MOUSE.pos.x) < 1e-6 && Math.abs(r.x - R2.pos.x) < 1e-6;
  }));
  ok('Reset pose puts it back on its mark', await ev(()=>{
    MOUSE.pos.set(5,0,5); MOUSE.speed=1; MOUSE.chYaw=2;
    $('btnReset').click();
    return Math.abs(MOUSE.pos.x-1.75)<1e-9 && MOUSE.speed===0;
  }));

  console.log('\n════ one model on the stage at a time ════');
  /* Mike, 2026-07-29: "put a selection thing so that only one model is
     displayed and works." One selection drives visibility, the pad AND the
     channel registration — the three used to be able to disagree. */
  ok('five models to choose from', await ev(()=>MODEL_IDS.join()==='droid,frik,mouse,builder,servos'));
  ok('the droid is what you get out of the box', await ev(()=>{
    delete PREFS.model; return modelGet()==='droid';
  }));
  const shows = {};
  for(const id of ['droid','frik','mouse']){
    shows[id] = await evA(([id])=>{
      modelSet(id, {frame:false});
      return {r2:R2.root.visible, frik:ANZ.root.visible, mouse:MOUSE.root.visible,
              drv:DRV.who, anzActs:Object.keys(ACT).filter(k=>/^anz/.test(k)).length,
              pref:PREFS.model, btn:($('btnModel')||{}).textContent};
    }, [id]);
  }
  ok('picking the droid shows only the droid',
     shows.droid.r2 && !shows.droid.frik && !shows.droid.mouse, JSON.stringify(shows.droid));
  ok('picking the head shows only the head',
     !shows.frik.r2 && shows.frik.frik && !shows.frik.mouse);
  ok('picking the mouse shows only the mouse',
     !shows.mouse.r2 && !shows.mouse.frik && shows.mouse.mouse);
  ok('the pad follows the selection — the mouse only has it when it is on stage',
     shows.droid.drv==='r2' && shows.frik.drv==='r2' && shows.mouse.drv==='mouse');
  ok('and so do the ACT channels, so the Outputs table describes what you see',
     shows.droid.anzActs===0 && shows.frik.anzActs===11 && shows.mouse.anzActs===0);
  ok('the selection is remembered', shows.mouse.pref==='mouse');
  ok('the stage button names what is on the stage', shows.mouse.btn==='Polar Mouse');
  ok('cycling walks round all five and comes home', await ev(()=>{
    modelSet('droid', {frame:false});
    const seen=[modelGet()];
    for(let i=0;i<5;i++){ modelCycle(); seen.push(modelGet()); }
    return seen.join()==='droid,frik,mouse,builder,servos,droid';
  }));
  ok('the Model tab shows that model\'s panel and none of the droid\'s', await ev(()=>{
    setView('advanced');
    document.querySelector('#tabs button[data-p="pCad"]').click();
    modelSet('mouse', {frame:false});
    const t = $('cadHost').textContent;
    return /Polar Mouse/.test(t) && !/Ride height/.test(t) && !/Moving parts/.test(t);
  }));
  ok('and the droid gets its own back', await ev(()=>{
    modelSet('droid', {frame:false});
    const t = $('cadHost').textContent;
    return /Ride height/.test(t) && /Moving parts/.test(t) && /On the stage/.test(t);
  }));
  ok('THE SKETCH KEEPS RUNNING whatever is on the stage', await ev(()=>{
    modelSet('mouse', {frame:false});
    const t0 = SIM.millis;
    for(let i=0;i<40;i++){ SIM.millis += 4; fwLoop(); }
    const ran = SIM.millis > t0 && typeof PROFILE.name === 'string';
    modelSet('droid', {frame:false});
    return ran;
  }));
  ok('the stage selection travels in the setup .json', await ev(()=>{
    modelSet('frik', {frame:false});
    const j = setupExportObj();
    modelSet('droid', {frame:false});
    return j.prefs && j.prefs.model === 'frik';
  }));

  console.log('\n════ nothing leaked into the droid ════');
  ok('the mouse owns no ACT channels', await ev(()=>
    !Object.keys(ACT).some(k=>/^mouse|^mse/i.test(k))));
  ok('the firmware is untouched by any of this', await ev(()=>
    typeof effDrive === 'function' && effDrive() === 0 && !FW.isDriveEnabled));
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
