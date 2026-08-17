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
const { chromium } = require('playwright');
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
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']
  });
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
  ok('full-stick drive lands on the same command (±4 for tick phase)',
     close(oracle.fwd.drive, subject.fwd.drive, 4) && close(oracle.fwd.turn, subject.fwd.turn, 4),
     JSON.stringify({oracle:oracle.fwd, subject:subject.fwd}));
  ok('dome command matches in sign and size (±4)', close(oracle.dome.dome, subject.dome.dome, 4)
     && Math.sign(oracle.dome.dome||0)===Math.sign(subject.dome.dome||0),
     JSON.stringify({oracle:oracle.dome, subject:subject.dome}));
  ok('R1+DOWN steps the volume identically', (oracle.v0-oracle.v1)===(subject.v0-subject.v1) && subject.v1===oracle.v1,
     JSON.stringify({oracle:[oracle.v0,oracle.v1], subject:[subject.v0,subject.v1]}));
  ok('L1+LEFT sends the same PCA9685 utility-arm targets',
     JSON.stringify(oracle.util)===JSON.stringify(subject.util),
     JSON.stringify({oracle:oracle.util, subject:subject.util}));

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
    b.domeServo = 'mod2026'; b.bodyServo = 'mod2026';
    const rec = firmwareRecommend(b);
    return {
      maesBlocked: maes ? firmwareBlockers(maes, b).length > 0 : null,
      pcaClear:    pca  ? firmwareBlockers(pca,  b).length === 0 : null,
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

  console.log('\n════ no page errors ════');
  ok('nothing threw across every transpile and run', errs.length===0, errs.slice(0,3).join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
