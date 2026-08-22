/* theme + paint + startup + Maestro board variants + channel mapping */
const { launchBrowser } = require('./harness');
const path = require('path');
/* This suite runs with the picture OFF like every other one. Set
   R2_UPDATE_SHOTS=1 to switch it back on for the two documentation screenshots
   at the bottom. Software rendering costs ~740 ms a frame on a GPU-less box,
   so ordinary assertion runs do not pay for frames they never inspect.
   R2_DRAW=1 renders throughout. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const SHOTS = process.env.R2_UPDATE_SHOTS === '1';
let pass=0, fail=0;
const CAD_MATS_MIN = 11;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ window.__r2draw0 = SIM.draw; });

  /* ================================================================
     v1.45.0 — Mike: "Default to light mode." This has to be asserted
     FIRST, before anything in this suite touches the theme or writes a
     preference: it is a statement about the first run, and the first run
     is the only moment the default is observable.
     ================================================================ */
  console.log('\n════ a first run opens light ════');
  ok('this page really is a first run — nothing seen, nothing configured', await ev(()=>
    !PREFS.seenStartup && !buildConfigured()));
  ok('...so the default theme is light, frame and all', await ev(()=>
    PREFS.theme==='light' && document.body.classList.contains('light')));
  ok('...the stage follows it rather than holding dark', await ev(()=>
    PREFS.stageTheme==='follow' && scene.fog.color.getHex()===THEME_3D.light.fog));
  ok('...and the header button offers the way back to dark', await ev(()=>
    $('btnTheme').textContent==='Dark'));
  ok('a saved DARK choice still beats the light default on load', await ev(()=>{
    /* the whole of "someone who chose dark keeps dark": the store is written
       by applyTheme() and read back over the defaults by prefsLoad() */
    applyTheme('dark');
    const stored = JSON.parse(localStorage.getItem('r2sim.prefs.v1')).theme==='dark';
    PREFS.theme = 'light';                      // as a fresh boot would start
    prefsLoad();
    const back = PREFS.theme==='dark';
    applyTheme('light');
    return stored && back;
  }));

  console.log('\n════ setup wizard ════');
  ok('opens by itself when the droid has not been configured', await ev(()=>$('startup').classList.contains('on') && !buildConfigured()));
  /* v1.32.0 — the first question is what is ON THE STAGE; the nine hardware
     answers follow it (config/wizard.js, WIZ_MODEL) */
  ok('starts on the first question', await ev(()=>WIZ.i===0 && $('stpTitle').textContent.indexOf('Model')>=0));
  ok('offers every paint scheme on its colours step', await ev(()=>{
    wizGo(wizSteps().findIndex(s=>s.key==='_paint'));
    return $('startupBody').querySelectorAll('button.b').length >= Object.keys(PAINT_SCHEMES).length+1;
  }));
  ok('one colour picker per paint role', await ev(()=>$('startupBody').querySelectorAll('.swcell input[type=color]').length===PAINT_ROLES.length));
  await ev(()=>wizGo(0));
  await page.click('#btnStartupGo');
  ok('closes and records that it has been seen', await ev(()=>!$('startup').classList.contains('on') && PREFS.seenStartup));
  ok('remembered in localStorage', await ev(()=>JSON.parse(localStorage.getItem('r2sim.prefs.v1')).seenStartup===true));
  await page.click('#btnSetup');
  ok('reopens from the header Setup button', await ev(()=>$('startup').classList.contains('on')));
  await page.keyboard.press('Escape');
  ok('Escape closes it', await ev(()=>!$('startup').classList.contains('on')));
  ok('the paint sections live on the wizard colours step', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_paint'));
    const n = $('startupBody').querySelectorAll('.swcell input[type=color]').length;
    closeStartup();
    return n===PAINT_ROLES.length;
  }));

  console.log('\n════ paint ════');
  const nSlots = await ev(()=>CAD.slots.length);
  ok('materials are split into paintable part groups', nSlots > CAD_MATS_MIN, nSlots+' slots from '+await ev(()=>CAD.mats.length)+' Fusion materials');
  ok('every slot got a role', await ev(()=>CAD.slots.every(s=>!!PAINT.roleOf[s.key])));
  ok('the dome shell is not lumped in with the legs', await ev(()=>
    PAINT.roleOf['shell:dome:0']==='dome' && PAINT.roleOf['leg:body:0']==='legs'),
    'both are Steel_-_Satin in Fusion');
  ok('the pies and side panels get their own roles', await ev(()=>
    Object.keys(PAINT.roleOf).some(k=>k.startsWith('pie:') && PAINT.roleOf[k]==='pies') &&
    PAINT.roleOf['panel:dome:0']==='panels'));
  ok('the window material stays an unpainted lens', await ev(()=>
    Object.values(PAINT.roleOf).includes('glass')));

  // paint now lives per VERTEX (part colours), materials stay white
  const domePart = await ev(()=>CAD.header.parts.find(p=>CAD.partIndex[p.name] && CAD.partIndex[p.name].slot==='shell:dome:0').name);
  const before = await ev(()=>Object.keys(CAD.partIndex).slice(0,40).map(n=>effectivePartHex(n)));
  await ev(()=>setScheme('r2q5'));
  const after = await ev(()=>Object.keys(CAD.partIndex).slice(0,40).map(n=>effectivePartHex(n)));
  ok('switching to R2-Q5 repaints the model', before.join()!==after.join());
  ok('the dome went black', await page.evaluate(n=>effectivePartHex(n)==='#26292e', domePart));
  ok('painted slot materials are white so vertex colours carry the paint', await ev(()=>
    CAD.slotMats['shell:dome:0'].color.getHexString()==='ffffff' && CAD.slotMats['shell:dome:0'].vertexColors===true));
  await ev(()=>setRoleColor('pies','#ff0000'));
  ok('one role recolours only its own parts', await ev(()=>
    Object.keys(CAD.partIndex).every(n=>{
      const isPie = CAD.partIndex[n].slot.startsWith('pie:') && PAINT.roleOf[CAD.partIndex[n].slot]==='pies';
      return !isPie || effectivePartHex(n)==='#ff0000';
    })));
  ok('finishes: dome reads as aluminium, body as paint, hardware as chrome', await ev(()=>{
    const bodySlot = CAD.slots.find(s=>PAINT.roleOf[s.key]==='body');
    const metalSlot = CAD.slots.find(s=>PAINT.roleOf[s.key]==='metal');
    return CAD.slotMats['shell:dome:0'].metalness > 0.6      // spun aluminium, like the real dome
        && CAD.slotMats[bodySlot.key].metalness < 0.3        // painted shell
        && CAD.slotMats[metalSlot.key].metalness > 0.8;      // chrome hardware
  }));
  ok('a hand edit marks the scheme custom and is saved', await ev(()=>
    PAINT.scheme==='custom' && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).paint.colors.pies==='#ff0000'));
  ok('a slot can be reassigned by hand and it sticks', await ev(()=>{
    setSlotRole('leg:body:0','metal');
    return PAINT.roleOf['leg:body:0']==='metal'
      && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).paint.roleOf['leg:body:0']==='metal';
  }));
  await ev(()=>{ setSlotRole('leg:body:0','legs'); setScheme('r2d2'); });

  console.log('\n════ light / dark theme ════');
  await ev(()=>applyTheme('light'));
  ok('body carries the light class', await ev(()=>document.body.classList.contains('light')));
  ok('scene fog and ground follow the theme', await ev(()=>
    scene.fog.color.getHex()===THEME_3D.light.fog && ground.material.color.getHex()===THEME_3D.light.ground));
  ok('lights are retinted, not just the CSS', await ev(()=>
    LIGHTS.hemi.intensity===THEME_3D.light.hemi && LIGHTS.rim.color.getHex()===THEME_3D.light.rim));
  ok('the grid is rebuilt and still in the scene', await ev(()=>scene.children.includes(grid)));
  ok('the header button now offers Dark', await ev(()=>$('btnTheme').textContent==='Dark'));
  ok('text has real contrast on the light panel', await ev(()=>{
    const gv=n=>getComputedStyle(document.body).getPropertyValue(n).trim();
    const lum=h=>{h=h.replace('#','');const f=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
      const [r,g,b]=[0,2,4].map(i=>f(parseInt(h.substr(i,2),16)));
      return 0.2126*r+0.7152*g+0.0722*b;};
    const cr=(a,b)=>{let x=lum(a),y=lum(b); if(x<y)[x,y]=[y,x]; return (x+0.05)/(y+0.05);};
    return cr(gv('--txt'),gv('--panel'))>=10 && cr(gv('--dim'),gv('--panel'))>=4.5;
  }));
  /* Screenshot regeneration is opt-in: ordinary tests must not rewrite
     generated documentation or make a clean checkout dirty. */
  if(SHOTS){
    await ev(()=>{ SIM.draw = true; });
    await page.waitForTimeout(2500);
    await page.screenshot({path:'docs/shots/shot-light.png'});
  }
  await ev(()=>applyTheme('dark'));
  ok('and back to dark', await ev(()=>!document.body.classList.contains('light') && scene.fog.color.getHex()===THEME_3D.dark.fog));
  if(SHOTS){
    await page.waitForTimeout(2500);
    await page.screenshot({path:'docs/shots/shot-dark.png'});
    await ev(()=>{ SIM.draw = !!window.__r2draw0; });
    console.log('  (documentation screenshots rewritten — R2_UPDATE_SHOTS=1)');
  }

  console.log('\n════ typography — mono for data, sans for prose (M1) ════');
  /* v1.15.0: labels/values/tables stay mono; real paragraphs carry .prose
     (sans, --fs-body). These pin the split so a restyle can't silently put
     the Config bug notes back into 10px caps. */
  ok('the Config pane bug notes are sans prose at body size (≥13px)', await ev(()=>{
    const p = $('cfgHost').querySelector('.note.prose');
    if(!p) return false;
    const cs = getComputedStyle(p);
    return !/mono|Menlo|Consolas/i.test(cs.fontFamily) && parseFloat(cs.fontSize) >= 13;
  }));
  ok('the Maestro pane explainer is sans prose too', await ev(()=>{
    const p = $('maeHost').querySelector('.prose');
    if(!p) return false;
    const cs = getComputedStyle(p);
    return !/mono|Menlo|Consolas/i.test(cs.fontFamily) && parseFloat(cs.fontSize) >= 13;
  }));
  ok('a .sect h3 label stays small uppercase mono (≤11px)', await ev(()=>{
    const h = document.querySelector('#cfgHost .sect > h3');
    if(!h) return false;
    const cs = getComputedStyle(h);
    return /mono|Menlo|Consolas/i.test(cs.fontFamily) && parseFloat(cs.fontSize) <= 11
      && cs.textTransform === 'uppercase';
  }));
  ok('the Outputs table keeps its density (mono, ≤11px)', await ev(()=>{
    const td = document.querySelector('#outHost table.srv td');
    if(!td) return false;
    const cs = getComputedStyle(td);
    return /mono|Menlo|Consolas/i.test(cs.fontFamily) && parseFloat(cs.fontSize) <= 11;
  }));
  await ev(()=>applyTheme('light'));
  ok('prose body text keeps ≥7:1 on the light panels', await ev(()=>{
    const lum=([r,g,b])=>{const f=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
      return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
    const cr=(a,b)=>{let x=lum(a),y=lum(b); if(x<y)[x,y]=[y,x]; return (x+0.05)/(y+0.05);};
    const px=s=>s.match(/\d+/g).slice(0,3).map(Number);
    const hx=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.substr(i,2),16));};
    const gv=n=>getComputedStyle(document.body).getPropertyValue(n).trim();
    const c = px(getComputedStyle($('cfgHost').querySelector('.prose')).color);
    return cr(c,hx(gv('--panel')))>=7 && cr(c,hx(gv('--bg2')))>=7;
  }));
  await ev(()=>applyTheme('dark'));

  console.log('\n════ Maestro board variants ════');
  ok('all four Pololu boards offered', await ev(()=>MAESTRO_BOARDS.map(b=>b.ch).join()==='6,12,18,24'));
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(300);
  await ev(()=>{ setBoard('mini24'); makeStarter('dome'); rebuildMaestroUI(); });
  const d24 = await ev(()=>({ch:MSTR.channels.length, pies:MSTR.channels.filter(c=>/^pie/.test(c.act)).length,
                             pans:MSTR.channels.filter(c=>/^panel/.test(c.act)).length}));
  ok('a Mini 24 dome starter carries the real dome: 6 pies + 14 panels', d24.ch===24 && d24.pies===6 && d24.pans===14, JSON.stringify(d24));

  await ev(()=>{ setBoard('mini12'); makeStarter('dome'); rebuildMaestroUI(); });
  const d12 = await ev(()=>({ch:MSTR.channels.length, pies:MSTR.channels.filter(c=>/^pie/.test(c.act)).length,
                             pans:MSTR.channels.filter(c=>/^panel/.test(c.act)).length}));
  ok('a Mini 12 dome starter is 6 pies then 6 panels', d12.ch===12 && d12.pies===6 && d12.pans===6, JSON.stringify(d12));

  await ev(()=>{ setBoard('mini18'); makeStarter('body'); rebuildMaestroUI(); });
  ok('a Mini 18 body starter names 14 and blanks the rest', await ev(()=>
    MSTR.channels.length===18 && MSTR.channels.filter(c=>c.act).length===14));

  await ev(()=>{ setBoard('micro6'); });
  const shrink = await ev(()=>({ch:MSTR.channels.length, live:EDIT.live.length,
                                frames:MSTR.sequences[0].frames[0].targets.length}));
  ok('dropping to a Micro 6 trims channels, pose and every sequence row',
     shrink.ch===6 && shrink.live===6 && shrink.frames===6, JSON.stringify(shrink));

  console.log('\n════ exported file matches the board ════');
  const micro = await ev(()=>{ makeStarter('body','micro6'); return buildMstrText(); });
  ok('a Micro export writes ServosAvailable, not MiniMaestroServoPeriod',
     /ServosAvailable="6"/.test(micro) && /ServoPeriod="156"/.test(micro) && !/MiniMaestroServoPeriod/.test(micro));
  ok('and drops EnablePullups, which the Micro has no hardware for', !/EnablePullups/.test(micro));
  ok('it emits exactly six channels', (micro.match(/<Channel /g)||[]).length===6);
  const mini = await ev(()=>{ makeStarter('dome','mini24'); return buildMstrText(); });
  ok('a Mini export keeps the Mini attributes',
     /MiniMaestroServoPeriod="80000"/.test(mini) && /ServoMultiplier="1"/.test(mini) && !/ServosAvailable/.test(mini));
  ok('it emits twenty-four channels', (mini.match(/<Channel /g)||[]).length===24);
  ok('a Micro export round-trips back as a Micro', await ev(()=>{
    const t = (makeStarter('body','micro6'), buildMstrText());
    parseMstr(t,'x.mstr'); return MSTR.board==='micro6' && MSTR.channels.length===6;
  }));
  ok('a Mini export round-trips back as a Mini 24', await ev(()=>{
    const t = (makeStarter('dome','mini24'), buildMstrText());
    parseMstr(t,'x.mstr'); return MSTR.board==='mini24' && MSTR.channels.length===24;
  }));

  console.log('\n════ script size against board memory ════');
  const sz = await ev(()=>{
    makeStarter('dome','mini24');
    const big = scriptBytesEstimate(genScript(MSTR.sequences, enabledChannels()));
    makeStarter('body','micro6');
    const small = scriptBytesEstimate(genScript(MSTR.sequences, enabledChannels()));
    return {big, small, microCap:boardById('micro6').script, miniCap:boardById('mini24').script};
  });
  ok('the estimate scales with the sequence content', sz.big > sz.small, JSON.stringify(sz));
  ok('a full dome script fits a Mini 8 KB', sz.big < sz.miniCap, sz.big+' of '+sz.miniCap+' bytes');

  console.log('\n════ mapping outputs to parts that move ════');
  await ev(()=>{ setBoard('mini24'); makeStarter('dome','mini24'); rebuildMaestroUI(); });
  const rows = await page.$$('#maeHost .maerow.wide');
  ok('one row per named servo channel plus a header', rows.length===21, rows.length+' rows (6 pies + 14 panels + header)');
  ok('the Part column reports real CAD geometry', await ev(()=>
    Array.from($('maeHost').querySelectorAll('.mv.ok')).length >= 12));

  // drag channel 0's test slider and watch the model
  const pose = ()=>ev(()=>{
    const m = CAD.moving.find(m=>m.act===MSTR.channels[0].act);
    return m ? JSON.stringify(m.group.quaternion.toArray().concat(m.mesh.position.toArray())) : null;
  });
  const startAng = await pose();
  await ev(()=>{
    const sl = $('maeHost').querySelectorAll('.maerow.wide input[type=range]')[0];
    sl.value = sl.max;
    sl.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction('ACT["'+await ev(()=>MSTR.channels[0].act)+'"] > 0.9', {timeout:20000});
  const endAng = await pose();
  ok('dragging a test slider actually moves that part', startAng!==null && endAng!==startAng,
     'pose changed (pies slide now, doors rotate)');
  ok('invert flips the travel', await ev(()=>{
    const c = MSTR.channels[0];
    const a = chanNorm(c, c.max); c.invert = true;
    const b = chanNorm(c, c.max); c.invert = false;
    return Math.abs(a-1)<1e-9 && Math.abs(b)<1e-9;
  }));

  await ev(()=>{ MSTR.channels.forEach(c=>c.act=''); rebuildMaestroUI(); });
  ok('Clear all leaves the sliders disabled', await ev(()=>
    Array.from($('maeHost').querySelectorAll('.maerow.wide input[type=range]')).every(s=>s.disabled)));
  await ev(()=>{ $('maeHost').querySelectorAll('button.b').forEach(b=>{ if(b.textContent==='Auto-map by name') b.click(); }); });
  ok('Auto-map recovers the mapping from the channel names', await ev(()=>
    MSTR.channels.filter(c=>c.act).length===20));

  ok('no page errors', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
