/* The sketch transpiler (v1.21.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-08: "can we build a sketch importer based on the
   padawan360 code that can re-import other variations … or will that
   need an LLM?" — deterministic transpiler, no LLM, fails loudly.

   GOLDEN INPUTS (tests/fixtures-sketches/): the EXACT .ino sources the
   three hand ports were made from, plus the canonical Dan Kraus body
   sketch. The bar:
     · all four transpile with zero residue and instantiate;
     · the transpiled mod2026 drives the SAME external outputs as the
       hand port under the same scripted pad input (black-box A/B — the
       hand port is the oracle);
     · residue is loud, named and line-numbered, and a fragment without
       loop() is refused. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const fs = require('fs');
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

const FIX = f => fs.readFileSync(path.join(__dirname, 'fixtures-sketches', f), 'utf8');

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForTimeout(1800);
  const ev = (f, a) => page.evaluate(f, a);
  const hold = o => page.evaluate(o=>{Object.assign(INPUT.virtual.btn,o.btn||{});if(o.ax)Object.assign(INPUT.virtual,o.ax);},o);
  const clr  = () => page.evaluate(()=>{BTN_NAMES.forEach(n=>INPUT.virtual.btn[n]=0);INPUT.virtual.LX=INPUT.virtual.LY=INPUT.virtual.RX=INPUT.virtual.RY=0;});

  console.log('\n════ the dialect, feature by feature ════');
  const unit = await ev(()=>{
    const src = [
      '#define SPEED 90',
      '#define FOOT_CONTROLLER 1',
      '#if FOOT_CONTROLLER == 0',
      'int wrongBranch = 1;',
      '#elif FOOT_CONTROLLER == 1',
      'int rightBranch = 1;',
      '#else',
      'int elseBranch = 1;',
      '#endif',
      'enum Mode { M_A, M_B, M_C };',
      'Mode m = M_B;',
      'int arr[] = { 5, 6, 7 };',
      'int total = 0;',
      'void helper(int a, int b);',                       // prototype
      'void loop() {',
      '  int x = 7; int y = 2;',
      '  total = x / y;',                                 // int division → 3
      '  total += (int)(7.9);',                           // cast → 7
      '  total += sizeof(arr) / sizeof(int);',            // idiom → 3
      '  total += m;',                                    // enum value 1
      '  total += rightBranch;',
      '  helper(1, 2);',
      '}',
      'void helper(int a, int b) { total += a - b; }'
    ].join('\n');
    const t = skTranspile(src, 'unit.ino');
    const inst = skInstantiate(t.js);
    inst.loop();
    /* total = 3 + 7 + 3 + 1 + 1 + (1-2) = 14 — reachable only via a
       second loop()'s accumulation? no: single pass */
    const again = skTranspile(src, 'unit.ino');
    return { js: t.js, deterministic: again.js === t.js,
             consts: t.cfgConsts.map(c=>c.name).sort().join(',') };
  });
  ok('int division truncates, casts truncate, sizeof idiom, enums, #elif',
     /__idiv\(x, y\)/.test(unit.js) && /Math\.trunc/.test(unit.js) && /arr\.length/.test(unit.js)
     && /const M_A = 0, M_B = 1, M_C = 2/.test(unit.js) && /rightBranch/.test(unit.js) && !/wrongBranch|elseBranch/.test(unit.js),
     unit.js.split('\n').slice(0,4).join(' | '));
  ok('same input, same output — byte-identical retranspile', unit.deterministic);
  ok('numeric #defines and const ints surface for the Config tab',
     unit.consts.includes('SPEED'), unit.consts);

  /* =================================================================
     v1.78.0 — THE SKETCH'S map() IS ARDUINO'S (review 2026-09-01, M10)

     The transpiler's map adapter truncated the SUM — the exact off-by-one
     core/util.js map_() was cured of in v1.69.0 §7.1 — so an imported
     sketch read the reverse half of every stick one unit hot: 32,760 of
     the hat's 65,536 positions, -32767 → -89 where the board says -90. And
     Arduino's map() takes longs, so a float argument is truncated toward
     zero before the arithmetic starts (maestro25.ino hands it `float
     LeftSpeed`). Pinned THROUGH the transpile, because what is under test
     is which function `map` is in sketch scope, then swept across the whole
     hat against map_(). The A/B golden below drives the same half of the
     stick through the real fixture. */
  console.log('\n════ the sketch\'s map() is Arduino\'s map() ════');
  const amap = await ev(()=>{
    const src = [
      'void setup() { }',
      'void loop() {',
      '  Serial.println(map(-32767, -32768, 32767, -90, 90));',
      '  Serial.println(map(-138.8, -100, 100, 69, 111));',
      '  Serial.println(map(-1, -32768, 32767, -50, 50));',
      '}'
    ].join('\n');
    const inst = skInstantiate(skTranspile(src, 'map.ino'));
    LOG.length = 0;                       // Serial.println lands in the log as 'fw'
    inst.loop();
    const printed = LOG.filter(l=>l.k==='fw').map(l=>l.s);
    let bad = 0, first = null;
    for(let x=-32768; x<=32767; x++){
      const g = __amap(x,-32768,32767,-90,90), r = map_(x,-32768,32767,-90,90);
      if(g !== r){ bad++; if(!first) first = {x, got:g, want:r}; }
    }
    return {printed, bad, first};
  });
  ok('map(-32767, -32768, 32767, -90, 90) prints -90 from a transpiled sketch — exactly',
     amap.printed[0] === '-90', JSON.stringify(amap.printed));
  ok('a float argument is truncated toward zero FIRST, as a long parameter is: map(-138.8, -100, 100, 69, 111) is 62',
     amap.printed[1] === '62', JSON.stringify(amap.printed));
  ok('one click below centre is -1, not 0', amap.printed[2] === '-1', JSON.stringify(amap.printed));
  ok('every one of the hat\'s 65,536 positions agrees with map_()',
     amap.bad === 0, amap.bad+' mismatches, first '+JSON.stringify(amap.first));

  console.log('\n════ residue is loud, named, line-numbered ════');
  ok('an unknown library name refuses with the name and line', await ev(()=>{
    try{ skTranspile('void loop() { FluxCapacitor.charge(88); }', 'bad.ino'); return false; }
    catch(e){ return /FluxCapacitor/.test(e.message) && /line 1/.test(e.message); }
  }));
  ok('a fragment without loop() is refused as not-a-sketch', await ev(()=>{
    try{ skTranspile('void helper() { }', 'frag.ino'); return false; }
    catch(e){ return /no loop\(\)/.test(e.message); }
  }));
  ok('a function-like macro is refused, not guessed', await ev(()=>{
    try{ skTranspile('#define SQ(x) ((x)*(x))\nvoid loop(){ }', 'mac.ino'); return false; }
    catch(e){ return /function-like macro/.test(e.message); }
  }));

  console.log('\n════ the four real sketches transpile clean ════');
  const sources = {
    mod2026: FIX('mod2026.ino'), maestro25: FIX('maestro25.ino'),
    maestro22: FIX('maestro22.ino'), canonical: FIX('canonical-body.ino')
  };
  for(const k of Object.keys(sources)){
    const r = await ev((a)=>{
      try{ const t = skTranspile(a.src, a.name+'.ino'); skInstantiate(t);
           return {ok:true, fns:t.report.functions.length, consts:t.cfgConsts.length}; }
      catch(e){ return {ok:false, msg:e.message.split('\n').slice(0,3).join(' | ')}; }
    }, {src:sources[k], name:k});
    ok(k+' — zero residue, factory instantiates', r.ok, r.ok ? r.fns+' fns, '+r.consts+' consts' : r.msg);
  }

  console.log('\n════ GOLDEN A/B — transpiled mod2026 vs the hand port ════');
  /* the same deterministic script runs against both; the hand port is the
     oracle. External outputs only — MOT, SND, XB leds, the PCA9685 —
     because that is what "the same firmware" MEANS. rnd() paths (sound
     randoms, automation) are deliberately not in the script. */
  const script = async ()=>{
    const snap = {};
    /* generous settle: the transpiled sketch FAITHFULLY serves setup()'s
       delay(500) — sim-blocked, the hand port folds it away — and headless
       rAF is slow, so give both runs the same long runway */
    await clr(); await page.waitForTimeout(1600);
    snap.boot = await ev(()=>({drive:MOT.drive, turn:MOT.turn, dome:MOT.dome, vol:SND.vol}));
    /* START arms the drive: track 52, LED per speed */
    await hold({btn:{START:1}}); await page.waitForTimeout(120); await clr(); await page.waitForTimeout(250);
    snap.armed = await ev(()=>({track:SND.track, led:XB.ledOn}));
    /* full stick forward, let the ramp finish */
    await hold({ax:{LY:1}}); await page.waitForTimeout(1200);
    snap.fwd = await ev(()=>({drive:MOT.drive, turn:MOT.turn}));
    await clr(); await page.waitForTimeout(900);
    /* (v1.78.0, M10) full stick BACK and dome LEFT together — the negative
       half of the hat, where the transpiler's map() was one unit hot
       (-89 for -90, 126 for 127) and the forward-only script never looked.
       "RAMPING" is a jump (M13), so once the command is non-zero it IS the
       settled value: wait on that, not on a clock. */
    await hold({ax:{LY:-1, RX:-1}});
    await page.waitForFunction(()=>MOT.drive < 0 && MOT.dome > 0, {timeout:20000});
    snap.rev = await ev(()=>({drive:MOT.drive, turn:MOT.turn, dome:MOT.dome}));
    await clr();
    await page.waitForFunction(()=>MOT.drive === 0 && MOT.dome === 0, {timeout:20000});
    /* dome spin */
    await hold({ax:{RX:1}}); await page.waitForTimeout(400);
    snap.dome = await ev(()=>({dome:MOT.dome}));
    await clr(); await page.waitForTimeout(400);
    /* volume down with R1 held (deterministic: −2) */
    snap.v0 = await ev(()=>SND.vol);
    await hold({btn:{R1:1, DOWN:1}}); await page.waitForTimeout(150); await clr(); await page.waitForTimeout(200);
    snap.v1 = await ev(()=>SND.vol);
    /* utility arms: L1+LEFT → pwm1 ch5/ch4 to UpperUtilIn/LowerUtilIn */
    await hold({btn:{L1:1, LEFT:1}}); await page.waitForTimeout(200);
    snap.util = await ev(()=>({u:SERVO[1][5] && SERVO[1][5].target, l:SERVO[1][4] && SERVO[1][4].target}));
    await clr(); await page.waitForTimeout(300);
    return snap;
  };

  await ev(()=>loadProfile('mod2026'));
  await page.waitForTimeout(600);
  const oracle = await script();

  const reg = await ev((a)=>{
    try{ const p = sketchRegister(a, 'mod2026-golden.ino'); loadProfile(p.id); return {ok:true, id:p.id}; }
    catch(e){ return {ok:false, msg:e.message.slice(0,200)}; }
  }, sources.mod2026);
  ok('the real mod2026 source registers and loads as a profile', reg.ok, reg.msg||'');
  await page.waitForTimeout(600);
  const subject = await script();

  const close = (a,b,tol)=>Math.abs((a===undefined?-9999:a)-(b===undefined?-9999:b))<=tol;
  ok('boot: everything quiet in both', JSON.stringify(oracle.boot)===JSON.stringify(subject.boot),
     JSON.stringify({oracle:oracle.boot, subject:subject.boot}));
  ok('START: same arming track and LED', oracle.armed.track===subject.armed.track && oracle.armed.led===subject.armed.led,
     JSON.stringify({oracle:oracle.armed, subject:subject.armed}));
  /* (v1.78.0, M10) these were ±4 "for tick phase" — a hedge against
     sampling mid-ramp. There is no ramp to be mid of: mod2026's RAMPING
     jumps to the target in one pass (M13), the dome has none, and the
     runway above is long enough for either run to land. The same firmware
     under the same input must give the same number, so exact — which is
     also the only tolerance that could have caught the map() off-by-one. */
  ok('full-stick drive lands on the same command — exactly',
     close(oracle.fwd.drive, subject.fwd.drive, 0) && close(oracle.fwd.turn, subject.fwd.turn, 0),
     JSON.stringify({oracle:oracle.fwd, subject:subject.fwd}));
  ok('full REVERSE and dome LEFT land on the same commands — exactly (the transpiler\'s map() was one unit hot here)',
     close(oracle.rev.drive, subject.rev.drive, 0) && close(oracle.rev.turn, subject.rev.turn, 0)
     && close(oracle.rev.dome, subject.rev.dome, 0),
     JSON.stringify({oracle:oracle.rev, subject:subject.rev}));
  ok('dome command matches in sign and size — exactly', close(oracle.dome.dome, subject.dome.dome, 0)
     && Math.sign(oracle.dome.dome||0)===Math.sign(subject.dome.dome||0),
     JSON.stringify({oracle:oracle.dome, subject:subject.dome}));
  ok('R1+DOWN steps the volume identically', (oracle.v0-oracle.v1)===(subject.v0-subject.v1) && subject.v1===oracle.v1,
     JSON.stringify({oracle:[oracle.v0,oracle.v1], subject:[subject.v0,subject.v1]}));
  ok('L1+LEFT sends the same PCA9685 utility-arm targets',
     JSON.stringify(oracle.util)===JSON.stringify(subject.util),
     JSON.stringify({oracle:oracle.util, subject:subject.util}));

  /* =================================================================
     v1.78.0 — A CONFIG EDIT ON A SKETCH IS A RE-FLASH (review 2026-09-01, M11)

     A hand port reads CFG.X on every pass; a transpiled sketch reads its
     constants ONCE, when its closure is built (`let X = __cfg("X", d)`),
     the way a #define is baked in at compile time. So typing a new
     DRIVESPEED1 into the Speed & feel grid wrote CFG, logged it, and
     changed nothing the droid did until the profile was next loaded —
     while "Copy .ino constants" already printed the new number. Now the
     edit re-flashes the running sketch (sketchReflash): setup() runs again,
     the mutable globals start over (the feet come up DISARMED, as on a
     board you had just flashed) and the edited constants survive
     loadProfile()'s reset of CFG. Driven through the box's own change
     event, in the setup step the grid lives on; every wait is on state. */
  console.log('\n════ a Config edit on a sketch is a re-flash ════');
  /* the A/B left the subject armed; disarm it first so both trees start
     from the same place (a re-flash also lands disarmed) */
  await ev((id)=>{ if(SIM.profile !== id) loadProfile(id); }, reg.id);
  if(await ev(()=>XB.ledOn > 0)){
    await hold({btn:{START:1}});
    await page.waitForFunction(()=>XB.ledOn === 0, {timeout:20000});
    await clr();
  }
  const edit = await ev((id)=>{
    /* the Speed & feel grid is the setup's Foot drive step, behind its Advanced tick */
    closeStartup(); wizOpen(wizStepIndex('bodyDrive')); WIZ_ADV.bodyDrive = true; buildStartup();
    const row = Array.from(document.querySelectorAll('#startupBody .cfgrow'))
      .find(r=>r.querySelector('label') && r.querySelector('label').textContent === 'DRIVESPEED1');
    if(!row) return {found:false};
    const box = row.querySelector('input');
    const wasTrack = SND.track;
    box.value = '50';
    box.dispatchEvent(new Event('change'));
    return {found:true, wasTrack, cfg:CFG.DRIVESPEED1, box:box.value, profile:SIM.profile,
            logged: LOG.filter(l=>/config: DRIVESPEED1 = 50/.test(l.s)).map(l=>l.s)};
  }, reg.id);
  ok('the Speed & feel grid has the sketch\'s DRIVESPEED1 box', edit.found, JSON.stringify(edit));
  ok('the edit survives the re-flash: CFG.DRIVESPEED1 is 50 and the box still says 50',
     edit.cfg === 50 && edit.box === '50' && edit.profile === reg.id, JSON.stringify(edit));
  ok('the log says the sketch was re-flashed',
     edit.logged.some(l=>/re-flashed/.test(l) && /mod2026-golden\.ino/.test(l)), edit.logged.join(' ~ '));
  /* setup() ran again: the sketch replays the connect track (21) on its
     first pass — a thing that only happens after a (re)flash */
  let reflashed = true;
  try{ await page.waitForFunction(()=>SND.track === 21, {timeout:15000}); }catch(e){ reflashed = false; }
  ok('…and the sketch really started over: the connect track 21 replayed', reflashed,
     'SND.track='+(await ev(()=>SND.track))+' (was '+edit.wasTrack+')');
  await ev(()=>closeStartup());
  /* arm it and hold the stick: the drive must settle at the NEW constant */
  await hold({btn:{START:1}});
  await page.waitForFunction(()=>XB.ledOn === 1, {timeout:20000});
  await clr();
  await hold({ax:{LY:1}});
  await page.waitForFunction(()=>MOT.drive !== 0, {timeout:20000});
  const settled = await ev(()=>MOT.drive);
  ok('full stick forward settles at the edited DRIVESPEED1 (50), not the sketch\'s 90', settled === 50, 'MOT.drive='+settled);
  await clr();
  await page.waitForFunction(()=>MOT.drive === 0, {timeout:20000});
  /* and a HAND PORT is left alone — it reads CFG live and needs no re-flash:
     the log is not emptied and the drive stays armed across the edit */
  const port = await ev(()=>{
    loadProfile('mod2026');
    FW.isDriveEnabled = true;
    for(let k=0;k<12;k++) lg('sys','filler '+k);
    const n0 = LOG.length;
    closeStartup(); wizOpen(wizStepIndex('bodyDrive')); WIZ_ADV.bodyDrive = true; buildStartup();
    const row = Array.from(document.querySelectorAll('#startupBody .cfgrow'))
      .find(r=>r.querySelector('label') && r.querySelector('label').title.indexOf('DRIVESPEED2 ') === 0);
    const box = row && row.querySelector('input');
    if(box){ box.value = '111'; box.dispatchEvent(new Event('change')); }
    closeStartup();
    const r = {found:!!box, cfg:CFG.DRIVESPEED2, armed:FW.isDriveEnabled, logKept: LOG.length >= n0,
               logged: LOG.filter(l=>/config: DRIVESPEED2 = 111/.test(l.s)).map(l=>l.s)};
    CFG.DRIVESPEED2 = PROFILE.defaults.DRIVESPEED2;
    return r;
  });
  ok('a hand port is not re-flashed by an edit: log kept, still armed, plain log line',
     port.found && port.cfg === 111 && port.armed && port.logKept
     && port.logged.length === 1 && !/re-flashed/.test(port.logged[0]), JSON.stringify(port));

  console.log('\n════ the other two run without erroring ════');
  for(const k of ['maestro25','maestro22']){
    const r = await ev((a)=>{
      try{ const p = sketchRegister(a.src, a.name+'.ino'); loadProfile(p.id); return true; }catch(e){ return e.message.slice(0,120); }
    }, {src:sources[k], name:k});
    await page.waitForTimeout(500);
    ok(k+' transpiled runs for half a second of loop() without throwing', r===true && errs.length===0, String(r));
  }

  console.log('\n════ each sketch is its OWN firmware ════');
  const many = await ev(()=>({
    ids: sketchIds(),
    inOrder: sketchIds().every(id=>PROFILE_ORDER.indexOf(id) >= 0),
    inSetup: sketchIds().every(id=>BUILD_OPTIONS.firmware.some(o=>o.id===id)),
    distinct: new Set(sketchIds()).size === sketchIds().length,
    ports: ['mod2026','maestro25','maestro22'].every(id=>PROFILE_ORDER.indexOf(id) >= 0),
    labels: sketchIds().map(id=>PROFILES[id].file)
  }));
  ok('three imports stand as three separate firmwares', many.ids.length===3 && many.distinct, JSON.stringify(many.labels));
  ok('…each in PROFILE_ORDER and in the setup\'s Firmware question', many.inOrder && many.inSetup);
  ok('…without displacing the three hand ports', many.ports);
  ok('the same file twice gets its own id, never a silent overwrite', await ev((a)=>{
    const before = sketchIds().length;
    const p = sketchRegister(a, 'maestro22.ino');           // same NAME as one already in
    return sketchIds().length === before+1 && p.id !== 'sketch:maestro22' && /maestro22-2/.test(p.id);
  }, sources.maestro22));

  console.log('\n════ suitability is judged from the sketch, not assumed ════');
  const suit = await ev(()=>{
    const maes = sketchIds().find(id=>PROFILES[id].hasMaestro);
    const pca  = sketchIds().find(id=>!PROFILES[id].hasMaestro);
    const b = JSON.parse(JSON.stringify(buildGet()));
    /* 'mod2026' IS the PCA9685-direct answer for both servo questions
       (hardware.js buildUsesMaestro) — no Maestro anywhere in this build */
    b.domeServo = 'mod2026'; b.bodyServo = 'mod2026'; b.servoTopo = 'p0';
    const rec = firmwareRecommend(b);
    /* v1.46.0 — this section is about the SERVO objection, and the shipped
       default sound board changed to a DY-SV5W (Mike's call), which an
       imported PCA sketch may also object to. So "clears" means no servo
       objection, not zero objections — otherwise an unrelated default makes
       this read as a suitability regression. */
    const servoWhy = id => firmwareBlockers(id, b)
      .map(x=>x.why).filter(w=>/servo|Maestro|PCA9685|expander|I2C/i.test(w));
    return {
      maesBlocked: maes ? servoWhy(maes).length > 0 : null,
      pcaClear:    pca  ? servoWhy(pca).length === 0 : null,
      recIsPort:   !/^sketch:/.test(rec.id),
      recId: rec.id
    };
  });
  ok('a Maestro sketch is blocked on a PCA-only build', suit.maesBlocked !== false, JSON.stringify(suit));
  ok('a PCA sketch clears that same build', suit.pcaClear !== false);
  ok('an imported sketch is never auto-RECOMMENDED over a vetted port', suit.recIsPort, suit.recId);

  console.log('\n════ persistence and forgetting ════');
  ok('every sketch survives in storage and all come back on "reload"', await ev(()=>{
    const raw = localStorage.getItem('r2sim.sketches.v2');
    const saved = JSON.parse(raw||'null');
    if(!Array.isArray(saved) || saved.length < 3) return false;
    sketchForget();                                        // all of them; clears storage
    if(sketchIds().length || localStorage.getItem('r2sim.sketches.v2') !== '[]') return false;
    localStorage.setItem('r2sim.sketches.v2', raw);        // a reload is storage + restore
    sketchRestore();
    return sketchIds().length === saved.length;
  }));
  ok('forgetting ONE leaves the others standing', await ev(()=>{
    const before = sketchIds();
    sketchForget(before[0]);
    return sketchIds().length === before.length-1 && !PROFILES[before[0]]
        && !BUILD_OPTIONS.firmware.some(o=>o.id===before[0]);
  }));
  ok('forgetting the RUNNING sketch falls back to a real firmware, not nothing', await ev(()=>{
    const id = sketchIds()[0];
    buildSet('firmware', id); loadProfile(id);
    sketchForget(id);
    return !!PROFILES[SIM.profile] && !/^sketch:/.test(SIM.profile) && PREFS.build.firmware !== id;
  }));
  ok('a v1 single-slot sketch migrates into the new list', await ev((a)=>{
    sketchForget();
    localStorage.removeItem('r2sim.sketches.v2');
    localStorage.setItem('r2sim.sketch.v1', JSON.stringify({src:a, fileName:'legacy.ino'}));
    sketchRestore();
    return sketchIds().length===1 && PROFILES[sketchIds()[0]].file==='legacy.ino'
        && !localStorage.getItem('r2sim.sketch.v1');
  }, sources.canonical));

  /* =================================================================
     v1.77.0 — A SKETCH THAT THROWS AT RUN TIME (review 2026-09-01, H6)

     The identifier accounting ignores method names on purpose — the
     adapter owns those — so a sketch calling `mp3.playFolder(1, 2)`
     (a real MD_YX5300 library call the sim's adapter does not carry)
     transpiles residue-free and throws a TypeError the first time it
     runs. Before this it was stored and made the build's firmware BEFORE
     it ran, so `loadProfile(bootFw)` threw inside the boot handler on
     every reload and nothing after it ran: no loop, no header buttons,
     until localStorage was cleared by hand.

     Three fences, each pinned here through the real door: the drop door
     trial-runs the sketch and refuses it by method; a registered sketch
     that throws in loop() is unloaded by its own wrapper and the build
     is pointed back at the setup's choice; and a boot into a stored bad
     sketch survives, with everything after loadProfile() still bound.
     Toasts are read by TEXT, never by order; every wait is on state. */
  console.log('\n════ a sketch that throws is refused at the door, not booted into ════');
  const BAD_SETUP = [
    '#include <MD_YX5300.h>',
    'MD_YX5300 mp3(Serial1);',
    'void setup() { mp3.begin(); mp3.playFolder(1, 2); }',
    'void loop() { }'
  ].join('\n');
  const toastsNow = () => ev(()=>Array.from(document.querySelectorAll('#toasts .toastp')).map(p=>p.className+'|'+p.textContent));
  const before = await ev((src)=>{
    const b = { stored: localStorage.getItem('r2sim.sketches.v2'),
                fw: PREFS.build.firmware, pinned: !!PREFS.build.firmwarePinned,
                ids: sketchIds().slice(), profile: SIM.profile };
    document.querySelectorAll('#toasts .toastp').forEach(p=>p.remove());
    readInoFile(new File([src], 'bad.ino', {type:'text/plain'}));   // FileReader: the door answers asynchronously
    return b;
  }, BAD_SETUP);
  await page.waitForFunction(()=>!!document.querySelector('#toasts .toastp'), {timeout:15000});
  const refused = await ev(()=>({
    stored: localStorage.getItem('r2sim.sketches.v2'),
    fw: PREFS.build.firmware, pinned: !!PREFS.build.firmwarePinned,
    ids: sketchIds().slice(), profile: SIM.profile,
    inProfiles: Object.keys(PROFILES).some(id=>/bad/.test(id)),
    inSetup: BUILD_OPTIONS.firmware.some(o=>/bad/.test(o.id)),
    running: !!PROFILES[SIM.profile]
  }));
  refused.toasts = await toastsNow();
  ok('a setup() that calls a method the adapter lacks is refused — not stored under r2sim.sketches.v2',
     refused.stored === before.stored && !/bad\.ino/.test(refused.stored||''),
     String(refused.stored).slice(0,80));
  ok('…not registered as a firmware, not offered in the setup',
     !refused.inProfiles && !refused.inSetup && refused.ids.join()===before.ids.join());
  ok('…the build\'s firmware answer is untouched',
     refused.fw === before.fw && refused.pinned === before.pinned, before.fw+' → '+refused.fw);
  ok('…the toast names the file, the phase and the method — and says nothing changed',
     refused.toasts.some(t=>/err/.test(t) && /bad\.ino/.test(t) && /setup\(\)/.test(t)
                          && /mp3\.playFolder/.test(t) && /MD_YX5300/.test(t) && /nothing was changed/.test(t)),
     refused.toasts.join(' ~ '));
  ok('…and the firmware that was running is still running', refused.running && refused.profile === before.profile,
     before.profile+' → '+refused.profile);

  console.log('\n════ a registered sketch that throws in loop() is unloaded, not run again every frame ════');
  /* throws on the FIFTH pass — past the trial's three, so the door accepts
     it and the fence has to earn its keep at run time */
  const BAD_LOOP = [
    '#include <MD_YX5300.h>',
    'MD_YX5300 mp3(Serial1);',
    'int passes = 0;',
    'void setup() { mp3.begin(); }',
    'void loop() { passes++; if(passes >= 5) mp3.playFolder(1, 2); }'
  ].join('\n');
  await ev((src)=>{
    document.querySelectorAll('#toasts .toastp').forEach(p=>p.remove());
    readInoFile(new File([src], 'badloop.ino', {type:'text/plain'}));
  }, BAD_LOOP);
  /* accepted by the trial: registered, chosen and running. "Chosen" is read
     from the door's own receipt rather than from PREFS.build — the fifth
     frame can throw between two evaluates, and by then the fence has already
     pointed the build back (that is the next assertion's job) */
  await page.waitForFunction(()=>sketchIds().some(x=>/badloop/.test(x)), {timeout:15000});
  const accepted = await ev(()=>({
    id: sketchIds().find(x=>/badloop/.test(x)),
    chosen: Array.from(document.querySelectorAll('#toasts .toastp'))
      .some(p=>/toastp ok/.test(p.className) && /Transpiled badloop\.ino/.test(p.textContent) && /now running/.test(p.textContent))
  }));
  /* …then the fifth frame throws and the wrapper unloads it */
  await page.waitForFunction(()=>!/badloop/.test(SIM.profile), {timeout:30000});
  const after = await ev(()=>({profile: SIM.profile, fw: PREFS.build.firmware, pinned: !!PREFS.build.firmwarePinned, ticks: SIM.ticks}));
  /* …and the sim keeps ticking afterwards */
  await page.waitForFunction((t)=>SIM.ticks > t + 3, after.ticks, {timeout:30000});
  const fenced = await ev((id)=>({
    ticks: SIM.ticks,
    logged: LOG.filter(l=>/badloop/.test(l.s) && /mp3\.playFolder/.test(l.s)).map(l=>l.s),
    stillRegistered: !!PROFILES[id]
  }), accepted.id);
  fenced.toasts = await toastsNow();
  ok('a loop() that throws only on pass 5 gets past the trial: registered and chosen',
     !!accepted.id && accepted.chosen, JSON.stringify(accepted));
  ok('…the throw unloads it: SIM.profile is no longer the sketch, and is a real firmware',
     after.profile !== accepted.id && !/^sketch:/.test(after.profile), after.profile);
  ok('…the build\'s firmware is pointed back at the setup\'s choice, unpinned',
     after.fw !== accepted.id && !/^sketch:/.test(after.fw) && !after.pinned, JSON.stringify(after));
  ok('…SIM.ticks keeps advancing — the frame loop survived', fenced.ticks > after.ticks + 3,
     after.ticks+' → '+fenced.ticks);
  ok('…the toast and the log name the sketch and the method, once',
     fenced.toasts.some(t=>/err/.test(t) && /badloop/.test(t) && /loop\(\)/.test(t) && /mp3\.playFolder/.test(t))
     && fenced.logged.length === 1, fenced.toasts.join(' ~ ')+' // '+fenced.logged.length+' log line(s)');
  ok('…and the sketch itself is still registered: unloaded, not forgotten', fenced.stillRegistered);
  ok('…with no page error from any of it', errs.length === 0, errs.join(' | '));

  console.log('\n════ boot survives a stored sketch that throws ════');
  /* the exact shape the review reproduced: the bad sketch is already in
     storage AND is the configured build's firmware. Stored by hand — the
     door would refuse it now — then a real reload. */
  const stored = await ev((src)=>{
    const p = sketchRegister(src, 'boot-bad.ino');       // no trial: exactly what the old door left behind
    const b = buildGet();
    b.firmware = p.id; b.firmwarePinned = true; b.done = true;
    prefsSave();
    return {id:p.id, saved: JSON.parse(localStorage.getItem('r2sim.prefs.v1')).build.firmware,
            inStore: /boot-bad\.ino/.test(localStorage.getItem('r2sim.sketches.v2')||'')};
  }, BAD_SETUP);
  ok('(setup) the bad sketch is in storage and is the build\'s firmware', stored.saved === stored.id && stored.inStore,
     JSON.stringify(stored));
  const errsBeforeReload = errs.length;
  await page.reload();
  /* boot is done when the frame loop is ticking — the one thing that never
     happened before the fix */
  let booted = true;
  try{ await page.waitForFunction(()=>typeof SIM!=='undefined' && SIM.ticks > 5, {timeout:30000}); }
  catch(e){ booted = false; }
  ok('after a reload the sim ticks — boot got past loadProfile()', booted);
  const boot = await ev((id)=>({
    profile: SIM.profile, isPort: !!PROFILES[SIM.profile] && !/^sketch:/.test(SIM.profile),
    fw: PREFS.build.firmware, pinned: !!PREFS.build.firmwarePinned,
    saved: JSON.parse(localStorage.getItem('r2sim.prefs.v1')).build.firmware,
    logged: LOG.filter(l=>/boot-bad/.test(l.s) && /mp3\.playFolder/.test(l.s)).length,
    stillRegistered: !!PROFILES[id],
    theme: PREFS.theme
  }), stored.id);
  ok('…into a real firmware, not the sketch', boot.isPort && boot.profile !== stored.id, boot.profile);
  ok('…the build now names that fallback — the NEXT boot is clean without clearing storage',
     boot.fw !== stored.id && boot.saved === boot.fw && !boot.pinned, JSON.stringify({fw:boot.fw, saved:boot.saved}));
  ok('…the log says which sketch and which method', boot.logged === 1, boot.logged+' line(s)');
  ok('…the sketch is still registered, so it can be looked at or forgotten', boot.stillRegistered);
  /* the rest of the load handler ran: the header buttons are bound. The
     button sits inside the folded app menu, so its click is dispatched
     rather than aimed — what is under test is the listener, not the menu */
  await ev(()=>$('btnTheme').click());
  const themed = await ev(()=>PREFS.theme);
  ok('…and the header is alive — #btnTheme toggles the theme', themed !== boot.theme, boot.theme+' → '+themed);
  ok('…with no page error at boot', errs.length === errsBeforeReload, errs.slice(errsBeforeReload).join(' | '));

  console.log('\n════ no page errors ════');
  ok('nothing threw across every transpile and run', errs.length===0, errs.slice(0,3).join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
