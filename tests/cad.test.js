const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const t0 = Date.now();
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:30000});
  const loadMs = Date.now()-t0;
  const ev = f => page.evaluate(f);

  console.log('\n════ bundled CAD load ════');
  const st = await ev(()=>CAD.stats);
  ok('bundled payload decodes and builds', st.parts>0, JSON.stringify(st));
  ok('load completes in a sensible time', loadMs < 25000, loadMs+' ms (headless software GL)');
  ok('active by default, procedural body hidden', await ev(()=>CAD.active && !R2.body.visible));
  ok('draw calls stay modest', st.draws < 90, st.draws+' draws for '+st.tris.toLocaleString()+' tris');

  console.log('\n════ coordinate frame ════');
  const fr = await ev(()=>{
    // the radar eye must be at the FRONT (-Z) and the dome above the body
    const eye = CAD.header.parts.find(p=>/RadarEye/i.test(p.base));
    const skirt = CAD.header.parts.filter(p=>/^Skirt/i.test(p.base));
    const dome = CAD.header.parts.filter(p=>p.file==='dome');
    const body = CAD.header.parts.filter(p=>p.file==='body');
    const lsh = CAD.header.parts.find(p=>/LeftShoulderHub/i.test(p.base));
    const rsh = CAD.header.parts.find(p=>/RightShoulderHub/i.test(p.base));
    return {
      eyeZ: eye.centroid[2], eyeY: eye.centroid[1],
      skirtY: Math.min(...skirt.map(p=>p.bbox[1])),
      domeMinY: Math.min(...dome.map(p=>p.bbox[1])),
      bodyMaxY: Math.max(...body.map(p=>p.bbox[4])),
      leftX: lsh.centroid[0], rightX: rsh.centroid[0]
    };
  });
  ok('radar eye faces front (-Z)', fr.eyeZ < -0.1, 'eye z='+fr.eyeZ.toFixed(3));
  ok('dome sits above the body', fr.domeMinY > 0.4 && fr.domeMinY < fr.bodyMaxY + 0.1,
     'dome from '+fr.domeMinY.toFixed(3)+', body to '+fr.bodyMaxY.toFixed(3));
  ok('skirt is the lowest part', fr.skirtY < 0.0, 'skirt y='+fr.skirtY.toFixed(3));
  ok("R2's left shoulder is on -X (sim left)", fr.leftX < 0 && fr.rightX > 0,
     'L='+fr.leftX.toFixed(3)+'  R='+fr.rightX.toFixed(3));

  console.log('\n════ hinge axes came from the CAD ════');
  const rigs = await ev(()=>CAD.moving.map(m=>({name:m.name, act:m.act, kind:m.kind, src:m.rig.src,
                                                pivot:m.rig.pivot, axis:m.rig.axis, mode:m.rig.mode})));
  const fromCad = rigs.filter(r=>/^cad-hinge/.test(r.src));
  ok('the 4 breadpan doors, dataport and small door use real hinge bodies', fromCad.length===6,
     fromCad.map(r=>r.name).join(', '));
  // FL/FR and RL/RR hinge pivots must mirror across X
  const g = n => rigs.find(r=>r.name.toLowerCase().startsWith(n));
  const fl=g('flbread'), frr=g('frbread'), rl=g('rlbread'), rr=g('rrbread');
  ok('front door hinges mirror across the centre line',
     Math.abs(fl.pivot[0] + frr.pivot[0]) < 1e-3 && Math.abs(fl.pivot[2] - frr.pivot[2]) < 1e-3,
     `FL x=${fl.pivot[0]} FR x=${frr.pivot[0]}`);
  ok('rear door hinges mirror too',
     Math.abs(rl.pivot[0] + rr.pivot[0]) < 1e-3, `RL x=${rl.pivot[0]} RR x=${rr.pivot[0]}`);
  ok('all door hinges are vertical', [fl,frr,rl,rr].every(d=>Math.abs(Math.abs(d.axis[1])-1)<1e-6));
  ok('pies 1-4 PIVOT on their low outer edge; only Pie 5 is a vertical lifter',
     rigs.filter(r=>/^pie[0-3]$/.test(r.act)).every(r=>r.mode==='hinge') &&
     (()=>{ const p5=rigs.find(r=>r.act==='pie4');
            return p5 && p5.mode==='slide' && Math.abs(p5.axis[1]-1)<1e-6; })());
  ok('the drawer slides rather than hinges',
     rigs.find(r=>r.act==='drawer').mode==='slide');

  console.log('\n════ every moving part actually moves ════');
  const moved = await page.evaluate(async ()=>{
    const out=[];
    const snap = ()=>CAD.moving.map(m=>m.group.quaternion.toArray().concat(m.mesh.position.toArray()));
    for(const m of CAD.moving){
      if(!m.act) continue;
      const before = snap();
      const keep = ACT[m.act];
      ACT[m.act] = 1; applyCadActuators();
      const after = snap();
      let changed = 0;
      for(let i=0;i<after.length;i++) if(JSON.stringify(after[i])!==JSON.stringify(before[i])) changed++;
      out.push({name:m.name, act:m.act, changed});
      ACT[m.act] = keep; applyCadActuators();
    }
    return out;
  });
  const still = moved.filter(m=>m.changed===0);
  ok('all '+moved.length+' assigned parts respond to their actuator', still.length===0,
     still.length? still.map(s=>s.name).join(', ') : 'none stuck');
  ok('each actuator moves exactly the part(s) mapped to it',
     moved.every(m=>m.changed>=1 && m.changed<=2), JSON.stringify(moved.filter(m=>m.changed>2)));

  console.log('\n════ driven through the real firmware ════');
  await ev(()=>{ loadProfile('mod2026'); });
  await page.waitForTimeout(400);
  const hold=o=>page.evaluate(o=>{Object.assign(INPUT.virtual.btn,o.btn||{});},o);
  const clr =()=>page.evaluate(()=>{BTN_NAMES.forEach(n=>INPUT.virtual.btn[n]=0);});
  await hold({btn:{R2:255,UP:1}}); await page.waitForTimeout(1200); await clr();
  await page.waitForFunction('ACT.pie4 > 0.95', {timeout:20000});
  const pies = await ev(()=>CAD.moving.filter(m=>/^pie/.test(m.act)).map(m=>
    ({act:m.act, lift:+m.mesh.position.y.toFixed(3),
      rot:+(2*Math.acos(Math.min(1,Math.abs(m.group.quaternion.w)))).toFixed(3)})));
  ok('only 5 inner pies move — Pie6 is fixed on the real build',
     pies.length===5 && pies.every(p=>/^pie[0-4]$/.test(p.act)), pies.map(p=>p.act).join(','));
  ok('mod2026 opens all 5 — pies 1-4 rotate, Pie 5 rises ~10 cm', (()=>{
     const p5 = pies.find(p=>p.act==='pie4');
     const hinged = pies.filter(p=>p.act!=='pie4');
     return p5 && p5.lift>0.09 && p5.lift<=0.101 &&
            hinged.every(p=>Math.abs(p.lift)<0.02) && hinged.every(p=>p.rot>0.3);
   })(), JSON.stringify(pies));
  ok('the MainPies are static shell now', await ev(()=>
    !CAD.moving.some(m=>/^MainPie/.test(m.base)) &&
    CAD.header.parts.filter(p=>/^MainPie/.test(p.base)).every(p=>p.kind==='shell' && !p.rig)));
  ok('CAD Pie6 is static but stays its own pie-coloured part', await ev(()=>{
    const p6 = CAD.header.parts.find(p=>p.base==='Pie6');
    return p6 && !p6.rig && !p6.act && p6.kind==='pie' && !!CAD.partIndex[p6.name];
  }));
  ok("the pies wear Mike's numbers, anticlockwise with 1 left of the fixed 6", await ev(()=>{
    const labs = CAD.moving.filter(m=>/^pie/.test(m.act))
      .sort((a,b)=>a.pieOrder-b.pieOrder).map(m=>partLabel(m.name));
    const p6 = CAD.header.parts.find(p=>p.base==='Pie6');
    // anticlockwise in the front view = DECREASING azimuth from Pie6's 216.6°, wrapping
    const az = CAD.moving.filter(m=>/^pie/.test(m.act)).sort((a,b)=>a.pieOrder-b.pieOrder)
      .map(m=>((p6.azimuth - CAD.header.parts.find(x=>x.name===m.name).azimuth)+360)%360);
    return labs.join(',')==='Pie 1,Pie 2,Pie 3,Pie 4,Pie 5'
        && az.every((v,i)=>i===0 || v>az[i-1])
        && /^Pie 6/.test(partLabel(p6.name));
  }));

  console.log('\n════ utility arms are SIDE-hinged (checked against the real build) ════');
  const armRig = await ev(()=>CAD.moving.filter(m=>/^util/.test(m.act)).map(m=>{
    const hp = CAD.header.parts.find(x=>x.name===m.name);
    return {act:m.act, pivotX:m.rig.pivot[0], axis:m.rig.axis, bx0:hp.bbox[0], bx1:hp.bbox[3], src:m.rig.src};
  }));
  const aUp = armRig.find(a=>a.act==='utilUp'), aLo = armRig.find(a=>a.act==='utilLo');
  ok('upper pivots on the viewer-right edge (sim -X)', Math.abs(aUp.pivotX-aUp.bx0)<1e-4, 'pivot x='+aUp.pivotX);
  ok('lower pivots on the viewer-left edge (sim +X)',  Math.abs(aLo.pivotX-aLo.bx1)<1e-4, 'pivot x='+aLo.pivotX);
  ok('both hinge axes are vertical and opposed',
     Math.abs(aUp.axis[1]-1)<1e-6 && Math.abs(aLo.axis[1]+1)<1e-6 && !aUp.axis[0] && !aLo.axis[0]);

  await hold({btn:{L1:1,RIGHT:1}}); await page.waitForTimeout(600); await clr();
  await page.waitForFunction('ACT.utilUp > 0.95', {timeout:20000});
  const arms = await ev(()=>CAD.moving.filter(m=>/^util/.test(m.act)).map(m=>{
    const hp = CAD.header.parts.find(x=>x.name===m.name);
    // where does the FREE end go? rotate its local offset by the group quaternion
    const span = (hp.bbox[3]-hp.bbox[0]) * (m.act==='utilUp' ? 1 : -1);
    const v = new THREE.Vector3(span,0,0).applyQuaternion(m.group.quaternion);
    return {act:m.act, qy:+m.group.quaternion.y.toFixed(3), outZ:+v.z.toFixed(3), span:+span.toFixed(3)};
  }));
  ok('LB+▶ deploys both arms about vertical axes, opposite senses',
     arms.length===2 && arms.every(a=>Math.abs(a.qy)>0.3) && Math.sign(arms[0].qy)!==Math.sign(arms[1].qy),
     JSON.stringify(arms));
  ok('both free ends swing OUT of the body (toward -Z), like arms',
     arms.every(a=>a.outZ < -Math.abs(a.span)*0.5), arms.map(a=>a.act+' z='+a.outZ).join('  '));

  console.log('\n════ dome rotation and visibility ════');
  await ev(()=>{ R2.domeYaw = 1.0; updateCadTransform(); });
  ok('the CAD dome group follows domeYaw', Math.abs(await ev(()=>CAD.dome.rotation.y) - 1.0) < 1e-6);
  ok('dome parts live under the dome group, body parts do not',
     await ev(()=>{
       let dome=0, body=0;
       CAD.moving.forEach(m=>{
         let n=m.group, inDome=false;
         while(n){ if(n===CAD.dome) inDome=true; n=n.parent; }
         if(m.file==='dome') dome += inDome?1:0; else body += inDome?0:1;
       });
       return dome===CAD.moving.filter(m=>m.file==='dome').length &&
              body===CAD.moving.filter(m=>m.file==='body').length;
     }));
  await ev(()=>{ CAD.show.internal=true; applyCadVisibility(); });
  ok('internals toggle is inert in the shell build (they were stripped)',
     await ev(()=>Object.keys(CAD.kindGroups).filter(k=>k.startsWith('internal')).length===0));
  await ev(()=>{ CAD.show.internal=false; CAD.show.pie=false; applyCadVisibility(); });
  ok('hiding a group hides its meshes',
     await ev(()=>CAD.moving.filter(m=>m.kind==='pie').every(m=>!m.group.visible)));
  await ev(()=>{ CAD.show.pie=true; applyCadVisibility(); });

  console.log('\n════ the LowerRight body skin matches its siblings ════');
  /* Fusion exported LowerRight with the blue trim material, so it classified
     as `trim` and rendered blue in every scheme while TopRight, CentreRight
     and LowerFront were body-white. buildCad remaps it to CentreRight's
     material at load (Mike's spec, 2026-07-29). */
  const lr = await ev(()=>{
    const slot = n => CAD.partIndex[n] && CAD.partIndex[n].slot;
    return { sameSlot: slot('LowerRight')===slot('CentreRight'),
             role: PAINT.roleOf[slot('LowerRight')],
             hexLR: effectivePartHex('LowerRight'),
             hexCR: effectivePartHex('CentreRight'),
             hexTR: effectivePartHex('TopRight') };
  });
  ok('it shares CentreRight\'s paint slot', lr.sameSlot, JSON.stringify(lr));
  ok('its role is body, not trim', lr.role==='body', lr.role);
  ok('its colour equals the other principal body panels', lr.hexLR===lr.hexCR && lr.hexLR===lr.hexTR,
     lr.hexLR+' vs '+lr.hexCR+'/'+lr.hexTR);

  console.log('\n════ switching back to procedural ════');
  await ev(()=>setCadActive(false));
  ok('procedural body returns and CAD hides', await ev(()=>R2.body.visible && !CAD.root.visible));
  ok('procedural legs return to full scale', await ev(()=>R2.legGroup.scale.y===1));
  await ev(()=>setCadActive(true));
  ok('and back again', await ev(()=>CAD.active && !R2.body.visible && R2.legGroup.scale.y<1));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
