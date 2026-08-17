/* click-to-select, rename, per-part colour, and groups */
const { chromium } = require('playwright');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); setScheme('r2d2'); });
  await page.waitForTimeout(500);
  const ev = f => page.evaluate(f);

  console.log('\n════ every part is individually addressable ════');
  ok('the part index covers the whole model', await ev(()=>
    Object.keys(CAD.partIndex).length === CAD.header.parts.length),
    await ev(()=>Object.keys(CAD.partIndex).length+' parts'));
  ok('merged static meshes carry their face ranges', await ev(()=>{
    let ranged=0, meshes=0;
    CAD.root.traverse(o=>{ if(o.isMesh && o.userData.ranges){ meshes++; ranged+=o.userData.ranges.length; } });
    return meshes>0 && ranged>0;
  }));
  ok('ranges tile their mesh exactly — no triangle unowned', await ev(()=>{
    let good=true;
    CAD.root.traverse(o=>{
      if(!o.isMesh || !o.userData.ranges) return;
      let at=0;
      for(const r of o.userData.ranges){ if(r.iStart!==at){good=false;} at=r.iStart+r.iCount; }
      if(at !== o.geometry.index.count) good=false;
    });
    return good;
  }));
  ok('draw calls did not grow — statics are still merged', await ev(()=>CAD.stats.draws < 90),
    await ev(()=>CAD.stats.draws+' draws'));

  console.log('\n════ picking ════');
  /* click the middle of the STAGE, measured — a hard-coded viewport pixel
     broke the moment the layout gained a 5px splitter track, and would break
     again on any future pane change */
  const mid = await page.evaluate(()=>{
    const r = $('stage').getBoundingClientRect();
    return [Math.round(r.x + r.width*0.46), Math.round(r.y + r.height*0.5)];
  });
  await page.mouse.click(mid[0], mid[1]);
  await page.waitForTimeout(250);
  const picked = await ev(()=>SEL.name);
  ok('a click on the droid selects a part', !!picked, picked||'nothing');
  ok('the card opens and shows the CAD name', await ev(()=>
    $('selcard').classList.contains('on') && $('selcard').textContent.includes(partBase(SEL.name))));
  // a drag must not change the selection
  await page.mouse.move(700,400); await page.mouse.down();
  await page.mouse.move(880,430,{steps:8}); await page.mouse.up();
  await page.waitForTimeout(150);
  ok('an orbit drag does not re-select', await ev(()=>SEL.name)===picked);
  await page.keyboard.press('Escape');
  ok('Escape deselects and closes the card', await ev(()=>
    SEL.name===null && !$('selcard').classList.contains('on')));
  ok('a hit on a merged mesh resolves through the ranges', await ev(()=>{
    // synthetic: resolve a fake hit in the middle of a known range
    let target=null;
    CAD.root.traverse(o=>{ if(!target && o.isMesh && o.userData.ranges && o.userData.ranges.length>2) target=o; });
    const r = target.userData.ranges[2];
    const name = partFromHit({object:target, faceIndex:(r.iStart + Math.floor(r.iCount/2))/3|0});
    return name === r.name;
  }));

  console.log('\n════ rename: your name rides on top, CAD name untouched ════');
  const doorName = await ev(()=>CAD.moving.find(m=>m.base==='DataPortDoor').name);
  await page.evaluate(n=>{ selectPart(n); setPartLabel(n,'diagnostic hatch'); }, doorName);
  ok('the label shows everywhere partLabel is asked', await page.evaluate(n=>
    partLabel(n)==='diagnostic hatch' && partBase(n)==='DataPortDoor', doorName));
  ok('it survives a reload via localStorage', await ev(()=>
    JSON.parse(localStorage.getItem('r2sim.prefs.v1')).parts.overrides[SEL.name].label==='diagnostic hatch'));
  ok('the wiring sheet prints both names', await ev(()=>
    /DataPortDoor “diagnostic hatch”/.test(wiringHtml())));
  await page.evaluate(n=>setPartLabel(n,''), doorName);
  ok('clearing the label falls back to the CAD name', await page.evaluate(n=>
    partLabel(n)==='DataPortDoor', doorName));

  console.log('\n════ per-part colour ════');
  await ev(()=>deselectPart());   // the highlight owns the vertex range while selected
  await page.evaluate(n=>setPartColor(n,'#e0b100'), doorName);
  ok('an override wins over the paint scheme', await page.evaluate(n=>
    effectivePartHex(n)==='#e0b100', doorName));
  ok('only that part changed', await page.evaluate(n=>{
    const other = CAD.moving.find(m=>m.base==='ChargingBayDoor').name;
    return effectivePartHex(other)!=='#e0b100';
  }, doorName));
  ok('the override is written into the vertex colours', await page.evaluate(n=>{
    const pi = CAD.partIndex[n];
    const a = pi.mesh.geometry.getAttribute('color');
    const c = new THREE.Color('#e0b100');
    return Math.abs(a.getX(pi.vStart)-c.r)<0.01 && Math.abs(a.getY(pi.vStart)-c.g)<0.01;
  }, doorName));
  await page.evaluate(n=>setPartColor(n,null), doorName);
  ok('clearing it returns the part to the scheme', await page.evaluate(n=>
    effectivePartHex(n)===PAINT.colors[PAINT.roleOf[CAD.partIndex[n].slot]], doorName));

  console.log('\n════ groups ════');
  const gid = await ev(()=>{
    const g = groupCreate('Front doors');
    ['FLBreadpanDoor','FRBreadpandoor'].forEach(b=>{
      groupToggleMember(g.id, CAD.moving.find(m=>m.base===b).name, true);
    });
    return g.id;
  });
  ok('a group holds its members', await page.evaluate(id=>groupById(id).members.length===2, gid));
  await page.evaluate(id=>groupSetColor(id,'#c0392b'), gid);
  ok('a group colour paints every member', await ev(()=>
    ['FLBreadpanDoor','FRBreadpandoor'].every(b=>
      effectivePartHex(CAD.moving.find(m=>m.base===b).name)==='#c0392b')));
  ok('a per-part override still beats the group', await ev(()=>{
    const n = CAD.moving.find(m=>m.base==='FLBreadpanDoor').name;
    setPartColor(n,'#00ff00');
    const win = effectivePartHex(n)==='#00ff00';
    setPartColor(n,null);
    return win;
  }));
  ok('groups persist', await ev(()=>
    JSON.parse(localStorage.getItem('r2sim.prefs.v1')).parts.groups.some(g=>g.name==='Front doors' && g.members.length===2)));

  console.log('\n════ groups drive the droid ════');
  await page.evaluate(id=>groupSet(id,1), gid);
  await page.waitForFunction('ACT.doorL > 0.95 && ACT.doorR > 0.95', {timeout:20000});
  ok('group open moves both doors on the model', true);
  await page.evaluate(id=>groupSet(id,0), gid);
  await page.waitForFunction('ACT.doorL < 0.05 && ACT.doorR < 0.05', {timeout:20000});
  ok('group close brings them back', true);
  ok('the group registers as animations for the firmware slots', await page.evaluate(id=>
    ANIM_IDS.includes('grp_'+id+'_open') && ANIMS['grp_'+id+'_open'].steps.length===2, gid));

  console.log('\n════ groups become Maestro sequences ════');
  ok('without a settings file it explains itself', await page.evaluate(id=>{
    const r = groupToSequences(id);
    return r && /no Maestro settings/.test(r.error||'');
  }, gid));
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  await ev(()=>{ setBoard('mini24'); makeStarter('body','mini24'); });
  const seqR = await page.evaluate(id=>{
    const before = MSTR.sequences.length;
    const r = groupToSequences(id);
    return {r, added: MSTR.sequences.length-before,
            names: MSTR.sequences.slice(-2).map(s=>s.name),
            subs: MSTR.subs.filter(s=>s.kind==='sequence').length};
  }, gid);
  ok('one click appends an Open + Close pair', seqR.added===2 && seqR.names.join()==='Front doors Open,Front doors Close',
     JSON.stringify(seqR.names));
  ok('the pair round-trips through the .mstr exporter', await ev(()=>{
    const t = buildMstrText();
    return /Front_doors_Open/.test(t) && /Front_doors_Close/.test(t);
  }));
  ok('the close sequence lands on the closed base pose', await ev(()=>{
    const close = MSTR.sequences[MSTR.sequences.length-1];
    const last = close.frames[close.frames.length-1].targets;
    return MSTR.channels.filter(c=>/^servo/i.test(c.mode)).every(c=>last[c.i]===c.home);
  }));

  console.log('\n════ stale state cannot come back ════');
  await ev(()=>{ groupDelete(PARTS.groups[0].id); });
  ok('deleting a group clears its colour from the model', await ev(()=>
    effectivePartHex(CAD.moving.find(m=>m.base==='FRBreadpandoor').name)!=='#c0392b'));
  ok('and unregisters its animations', await ev(()=>!ANIM_IDS.some(k=>/^grp_/.test(k))));

  console.log('\n════ Port row: the taken-note never shows a raw act id (change 2) ════');
  // give some OTHER channel the 'pie3' actuator, then open a different part's
  // Port row and read the option that names that channel
  const pie3Ch = await ev(()=>{
    MSTR.channels.forEach(c=>{ if(c.act==='pie3') c.act=''; });   // one channel per part
    const c = MSTR.channels.find(c=>/^servo/i.test(c.mode) && c.act!=='pie3');
    c.act = 'pie3';
    return c.i;
  });
  await page.evaluate(n=>selectPart(n), doorName);        // doorName's own act is 'dataport', not 'pie3'
  await page.waitForTimeout(150);
  const portNote = await page.evaluate(ch=>{
    const sel = Array.from($('selcard').querySelectorAll('select'))
      .find(s=>/which Maestro channel/.test(s.title||''));
    if(!sel) return null;
    const opt = Array.from(sel.options).find(o=>o.value===String(ch));
    return opt ? opt.textContent : null;
  }, pie3Ch);
  ok('the note names the part driven by the taken channel', !!portNote && /Pie/.test(portNote), portNote);
  ok('and never the raw actuator id', !!portNote && !/\bpie3\b/.test(portNote), portNote);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
