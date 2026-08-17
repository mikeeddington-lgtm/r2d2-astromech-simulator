/* The Anzellan head — geometry, the eleven-channel face rig, and the way it
   plugs into the tables the droid already uses.
   -------------------------------------------------------------------------
   Two things here are REGRESSION tests for bugs that cost real time and will
   come back the moment anyone edits the geometry:

     · the jowl lathe's WINDING. Listed top-down, every normal points inward,
       the front of the skirt is backface-culled and you see the inside of the
       back of it — which renders as two enormous ears. The test measures a
       real normal against the outward radial.

     · the bipolar channels' HOME. A face is not a door: pan/tilt/nod and the
       eyes rest at 0.5, not 0. Seed them at 0 and the head boots up staring
       at the floor with its neck fully over. */
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
  await page.waitForFunction('typeof ANZ!=="undefined" && ANZ.built', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ if(typeof closeStartup==='function') closeStartup(); anzSetShown(true); ANZ.idle=false; anzResetPose(); });

  console.log('\n════ it exists, and it is procedural ════');
  ok('the head builds without a mesh file', await ev(()=>
    ANZ.built && !!ANZ.skull && !!ANZ.jowls && !!ANZ.jaw && !!ANZ.eye.l && !!ANZ.eye.r));
  ok('eleven face channels, no more', await ev(()=>ANZ_ACTS.length===11), await ev(()=>ANZ_ACTS.length+''));
  ok('eleven fits a Mini Maestro 12 with one spare', await ev(()=>
    ANZ_ACTS.length < boardById('mini12').ch));
  const wh = await ev(()=>ANZ.whisk.length);
  ok('whiskers came out of the seeded PRNG', wh > 20 && wh < 40, wh+' strands');
  ok('the same seed gives the same whiskers', await ev(()=>{
    const r1 = anzRand(0xBABF21), r2 = anzRand(0xBABF21);
    for(let i=0;i<50;i++) if(r1() !== r2()) return false;
    return true;
  }));

  console.log('\n════ where it stands ════');
  const geo = await ev(()=>{
    const box = new THREE.Box3().setFromObject(ANZ.root);
    const r2b = new THREE.Box3().setFromObject(R2.root);
    return {min:box.min.toArray(), max:box.max.toArray(),
            r2min:r2b.min.toArray(), r2max:r2b.max.toArray(),
            px:ANZ.root.position.x, py:ANZ.root.position.y};
  });
  ok('the stand sits ON the ground, not through it', near(geo.min[1], 0, 0.02), 'y min '+geo.min[1].toFixed(3));
  ok('shorter than the droid, tall enough to read', geo.max[1] > 0.45 && geo.max[1] < 0.95,
     'top at '+geo.max[1].toFixed(3)+' m vs the dome at '+geo.r2max[1].toFixed(2));
  ok('clear of the droid — nothing intersects', geo.max[0] < geo.r2min[0] + 0.02,
     'head x max '+geo.max[0].toFixed(2)+' vs droid x min '+geo.r2min[0].toFixed(2));
  ok('world-anchored: it does not ride the droid', await ev(()=>{
    R2.pos.set(2, 0, 2); R2.root.position.set(2, 0, 2);
    const x = ANZ.root.getWorldPosition(new THREE.Vector3()).x;
    R2.pos.set(0,0,0); R2.root.position.set(0,0,0);
    return Math.abs(x - ANZ.root.position.x) < 1e-6;
  }));

  console.log('\n════ the jowl lathe is wound the right way round ════');
  /* REGRESSION: profile points listed top-down give inward normals, the front
     of the bell is culled and the skirt renders as two ears. */
  const wind = await ev(()=>{
    const g = ANZ.jowls.geometry, p = g.attributes.position, n = g.attributes.normal;
    let outward = 0, total = 0;
    for(let i=0;i<p.count;i+=7){
      const px = p.getX(i), pz = p.getZ(i);
      const rl = Math.hypot(px, pz);
      if(rl < 1e-4) continue;
      const dot = (n.getX(i)*px + n.getZ(i)*pz) / rl;
      total++; if(dot > 0) outward++;
    }
    return {outward, total};
  });
  ok('every jowl normal points OUT of the bell', wind.outward === wind.total,
     wind.outward+'/'+wind.total+' outward');

  console.log('\n════ the channels register with the head, not the build ════');
  ok('showing the head registers all eleven in ACT', await ev(()=>
    ANZ_ACTS.every(a => ACT[a.id] !== undefined && ACT_T[a.id] !== undefined)));
  ok('each seeds at its OWN home, not at zero', await ev(()=>
    ANZ_ACTS.every(a => Math.abs(ACT[a.id] - a.home) < 1e-9)));
  ok('the bipolar channels rest CENTRED', await ev(()=>
    ['anzPan','anzTilt','anzNod','anzEyeX','anzEyeY'].every(k => anzHome(k) === 0.5)));
  ok('hiding it takes all eleven back out again', await ev(()=>{
    anzSetShown(false);
    return ANZ_ACTS.every(a => ACT[a.id] === undefined) && !ANZ.root.visible;
  }));
  ok('and the droid keeps its own', await ev(()=>
    ACT.doorL !== undefined && ACT.pie0 !== undefined));
  await ev(()=>{ anzSetShown(true); ANZ.idle=false; anzResetPose(); });
  /* since v1.9.0 the thing that persists is the STAGE SELECTION, not a
     per-model toggle — anzSetShown() is the switch underneath it */
  ok('selecting it on the stage is what persists', await ev(()=>{
    modelSet('frik', {frame:false});
    const remembered = PREFS.model === 'frik' && ANZ.root.visible && !R2.root.visible;
    modelSet('droid', {frame:false});
    anzSetShown(true); ANZ.idle=false; anzResetPose();
    return remembered;
  }));

  console.log('\n════ the rig — every channel moves the thing it names ════');
  const pose = (k, v) => page.evaluate(([k,v])=>{ ACT[k]=v; ACT_T[k]=v; applyAnzellan(0.016);
    const q = o => o.quaternion.toArray();
    return { jaw:ANZ.jaw.rotation.x,
             browLy:ANZ.brow.l.position.y, browRy:ANZ.brow.r.position.y,
             lidU:ANZ.lid.ul.rotation.x, lidL:ANZ.lid.ll.rotation.x,
             eyeY:ANZ.eye.l.rotation.y, eyeX:ANZ.eye.l.rotation.x,
             pan:ANZ.head.rotation.y, tilt:ANZ.head.rotation.z, nod:ANZ.head.rotation.x,
             lipUy:ANZ.lipU.position.y, lipLy:ANZ.lipL.position.y };
  }, [k,v]);
  const rest = await pose('anzJaw', 0);
  ok('at rest the head is square-on', near(rest.pan,0,1e-9) && near(rest.tilt,0,1e-9) && near(rest.nod,0,1e-9));
  ok('at rest the jaw is shut', near(rest.jaw, 0, 1e-9));

  const jawOpen = await pose('anzJaw', 1);
  ok('anzJaw opens the jaw', jawOpen.jaw > 0.35, jawOpen.jaw.toFixed(3)+' rad');
  await pose('anzJaw', 0);

  const browUp = await pose('anzBrowL', 1);
  ok('anzBrowL lifts the LEFT brow only',
     browUp.browLy > rest.browLy + 0.004 && near(browUp.browRy, rest.browRy, 1e-9));
  const browDn = await pose('anzBrowL', 0);
  ok('and drives it back down below rest', browDn.browLy < rest.browLy - 0.003);
  await pose('anzBrowL', 0.35);

  const shut = await pose('anzLids', 1);
  const open = await pose('anzLids', 0);
  ok('anzLids closes both lids toward each other',
     shut.lidU > open.lidU && shut.lidL < open.lidL,
     'upper '+open.lidU.toFixed(2)+'→'+shut.lidU.toFixed(2));
  ok('one channel, and the upper lid does most of the travel',
     Math.abs(shut.lidU-open.lidU) > Math.abs(shut.lidL-open.lidL));
  await pose('anzLids', 0.10);

  const lookL = await pose('anzEyeX', 0);
  const lookR = await pose('anzEyeX', 1);
  ok('anzEyeX rolls the eyes, and 0.5 is dead ahead',
     lookL.eyeY > 0 && lookR.eyeY < 0 && near(rest.eyeY, 0, 1e-9));
  await pose('anzEyeX', 0.5);
  const up = await pose('anzEyeY', 1);
  ok('anzEyeY tilts them', Math.abs(up.eyeX) > 0.15);
  await pose('anzEyeY', 0.5);

  const panL = await pose('anzPan', 0);
  const panR = await pose('anzPan', 1);
  ok('anzPan turns the head both ways about centre',
     panL.pan < -0.4 && panR.pan > 0.4 && near(panL.pan, -panR.pan, 1e-9));
  await pose('anzPan', 0.5);
  const tilt = await pose('anzTilt', 1);
  ok('anzTilt rolls it ear-to-shoulder', Math.abs(tilt.tilt) > 0.2);
  await pose('anzTilt', 0.5);
  const nod = await pose('anzNod', 1);
  ok('anzNod pitches it', Math.abs(nod.nod) > 0.25);
  await pose('anzNod', 0.5);
  const lipU = await pose('anzLipU', 1);
  ok('anzLipU moves the upper lip', Math.abs(lipU.lipUy - rest.lipUy) > 0.003);
  await pose('anzLipU', 0.30);
  const lipL = await pose('anzLipL', 1);
  ok('anzLipL moves the lower lip', Math.abs(lipL.lipLy - rest.lipLy) > 0.003);
  await pose('anzLipL', 0.30);

  ok('the jowls ride the head, so the skin never tears off the neck', await ev(()=>{
    ACT.anzPan = 1; applyAnzellan(0.016);
    const p = ANZ.jowls.getWorldQuaternion(new THREE.Quaternion());
    const h = ANZ.head.getWorldQuaternion(new THREE.Quaternion());
    ACT.anzPan = 0.5; applyAnzellan(0.016);
    return Math.abs(p.y - h.y) < 1e-9 && Math.abs(h.y) > 0.1;
  }));

  console.log('\n════ the idle loop, and where it stops ════');
  await ev(()=>{ ANZ.idle = true; ANZ.t = 0; });
  const drifted = await ev(async ()=>{
    const before = ACT_T.anzEyeX;
    for(let i=0;i<220;i++) anzIdle(0.02);
    return {before, after: ACT_T.anzEyeX, jaw: ACT_T.anzJaw};
  });
  ok('idle brings the face to life when nothing owns it',
     Math.abs(drifted.after - drifted.before) > 0.001 || drifted.jaw !== 0,
     'eyes '+drifted.before.toFixed(3)+'→'+drifted.after.toFixed(3));

  console.log('\n════ the Maestro side ════');
  await ev(()=>{ loadProfile('maestro25'); setBoard('mini12'); makeStarter('anzellan','mini12'); rebuildMaestroUI(); });
  const st = await ev(()=>({
    mapped: MSTR.channels.filter(c=>c.act && anzIsAct(c.act)).map(c=>c.act),
    seqs: MSTR.sequences.map(s=>s.name),
    homes: MSTR.channels.filter(c=>c.act && anzIsAct(c.act)).map(c=>({act:c.act, home:c.home})),
    lo: DEFAULT_MIN, hi: DEFAULT_MAX
  }));
  ok('the starter maps all eleven by NAME through guessPart()',
     st.mapped.length===11 && new Set(st.mapped).size===11, st.mapped.join(','));
  ok('eight routines for the eight restartScript() slots', st.seqs.length===8, st.seqs.join(' · '));
  /* REGRESSION: a bipolar channel homed at the endpoint means the board slams
     the neck fully over the moment it powers up. */
  const pan = st.homes.find(h=>h.act==='anzPan');
  ok('the board homes the gimbals MID-TRAVEL, not at an endpoint',
     pan && near(pan.home, (st.lo+st.hi)/2, 40), pan ? pan.home+' vs mid '+((st.lo+st.hi)/2) : 'missing');
  const jawH = st.homes.find(h=>h.act==='anzJaw');
  ok('but the jaw still homes SHUT, because that one really is a door',
     jawH && near(jawH.home, st.lo, 4), jawH ? jawH.home+'' : 'missing');
  ok('every routine ends on the rest pose', await ev(()=>{
    const restRow = MSTR.channels.map(c=>c.home);
    return MSTR.sequences.every(s=>{
      const last = s.frames[s.frames.length-1].targets;
      return MSTR.channels.every((c,i)=>!c.act || !anzIsAct(c.act) || last[i]===restRow[i]);
    });
  }));
  ok('the face lands in the sequencer action library', await ev(()=>
    blockActions().filter(a=>anzIsAct(a.act)).length === 11));
  ok('and in the Outputs actuator table', await ev(()=>{
    buildOutputs();
    return OUTROWS.act.filter(r=>anzIsAct(r.key)).length === 11;
  }));
  ok('the channel picker offers them by a human name', await ev(()=>
    PART_LIST.some(p=>p[1]==='anzJaw' && /jaw/i.test(p[0])) &&
    PART_LIST.filter(p=>anzIsAct(p[1])).length === 11));
  ok('"Frik Lower Lip" is not read as a lower utility arm', await ev(()=>
    guessPart('Frik Lower Lip')==='anzLipL' && guessPart('Lower Utility Arm')==='utilLo'));
  ok('"Frik Left Brow" is not read as a left door', await ev(()=>
    guessPart('Frik Left Brow')==='anzBrowL' && guessPart('FL Breadpan Door')==='doorL'));

  console.log('\n════ idle keeps its hands off a driven channel ════');
  const owned = await ev(()=>{
    anzResetPose(); ANZ.idle = true; ANZ.t = 0;
    const jawCh = MSTR.channels.find(c=>c.act==='anzJaw');
    const free  = MSTR.channels.find(c=>c.act==='anzEyeX');
    free.act = '';                          // unplug the eyes, leave the jaw wired
    /* sentinels: idle either overwrites the target or it does not */
    ACT_T.anzJaw = 0.777; ACT_T.anzEyeX = 0.123;
    for(let i=0;i<120;i++) anzIdle(0.02);
    const out = {jaw: ACT_T.anzJaw, eye: ACT_T.anzEyeX, wired: !!jawCh};
    free.act = 'anzEyeX';
    return out;
  });
  ok('a channel the board drives is left alone', owned.wired && owned.jaw === 0.777, 'jaw held at '+owned.jaw);
  ok('an unwired channel still gets the idle', owned.eye !== 0.123, 'eyes now '+owned.eye.toFixed(3));
  await ev(()=>{ ANZ.idle = false; anzResetPose(); });

  console.log('\n════ the stand-in animations ════');
  const anims = await ev(()=>Object.keys(ANIMS).filter(k=>/^frik_/.test(k)));
  ok('eight frik_* animations, one per starter slot', anims.length===8, anims.join(','));
  ok('the stand-in slots point at them', await ev(()=>
    CFG.maestroScript.filter(s=>/^frik_/.test(s)).length === 8));
  ok('restartScript() drives the face through ACT_T', await ev(async ()=>{
    CFG.maestroSource = 'builtin';
    ACT_T.anzJaw = 0; MAESTRO.slot = {};
    maestroRestart(0);                       // frik_talk
    for(let i=0;i<10;i++) maestroStep(0.05);
    return ACT_T.anzJaw > 0.1;
  }));
  ok('every frik_* animation ends on a rest pose, not at zero', await ev(()=>{
    return Object.keys(ANIMS).filter(k=>/^frik_/.test(k)).every(k=>{
      const last = {};
      ANIMS[k].steps.forEach(([,act,v])=>{ last[act] = v; });
      return Object.keys(last).every(a => Math.abs(last[a] - anzHome(a)) < 1e-9);
    });
  }));

  console.log('\n════ nothing leaked into the droid ════');
  /* was a literal 14 for the body keys, which meant legitimately adding an
     actuator to the DROID failed a test about the HEAD not leaking. Derive it
     from ACT_KEYS instead — the point of the check is that no anz* key is in
     there, not that the droid's part count never changes. (The six
     holoprojector axes landed 2026-07-29.) */
  ok('the droid\'s own actuator count is untouched', await ev(()=>
    Object.keys(ACT).filter(k=>!anzIsAct(k)).length === ACT_KEYS.length + PIE_COUNT + PANEL_COUNT));
  ok('and no head channel leaked into ACT_KEYS', await ev(()=>ACT_KEYS.every(k=>!anzIsAct(k))));
  ok('the wiring sheet still only walks the droid\'s parts', await ev(()=>
    WIRING_ORDER.every(a=>!anzIsAct(a))));
  ok('no page errors', errs.length===0, errs.slice(0,3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
