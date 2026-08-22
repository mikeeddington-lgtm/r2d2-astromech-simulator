/* the four workspaces (v1.17.0, B1): the header switcher, the mod2026 gate
   on Sequence, both doors into the desk with prev-workspace restore, the
   Bench's Advanced switch, tab-hop, the retired-view migration, the setup
   .json round-trip of ws/adv, and the Stage-4 Esc pickups (impWiz/bldWiz).
   Ground truth: src/js/config/workspaces.js + the views.js shims. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };
/* the refusal only fires for a build with NO servo board at all now — see
   the v1.27.0 note below */
const REFUSAL = 'this build has no servo board yet — answer the servo questions in Setup first';

(async () => {
  const browser = await launchBrowser({audio:true});
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; prefsSave(); closeStartup(); });
  const ev = f => page.evaluate(f);
  /* the exact refusal wording, shared with the in-page assertions */
  await page.evaluate(r=>{ window.REFUSAL=r; }, REFUSAL);

  console.log('\n════ the switcher — four workspaces in the header ════');
  /* v1.59.0 briefly made it five; v1.60.0 put the servo gauges back where
     they belong, as a MODEL on the stage, and the header is four again */
  ok('four .wsbtn in #viewsel, in the fixed order', await ev(()=>{
    const ids=[...document.querySelectorAll('#viewsel .wsbtn')].map(b=>b.dataset.ws);
    return ids.join(',')==='drive,seq,config,bench';
  }));
  ok('a fresh boot lands Drive — exactly one .act, body wears ws-drive', await ev(()=>
    wsGet()==='drive' && document.body.classList.contains('ws-drive')
    && document.querySelectorAll('#viewsel .wsbtn.act').length===1
    && document.querySelector('#viewsel .wsbtn.act').dataset.ws==='drive'));
  ok('no retired view-* class survives on the body', await ev(()=>
    ![...document.body.classList].some(c=>/^view-/.test(c))));

  /* Until v1.27.0 this section asserted the opposite: mod2026 REFUSED the
     Sequence door, because a PCA9685 could not hold a sequence. It can now —
     arduino/MaestroPCA answers restartScript(n) — so the gate moved from
     "has a Pololu board" to "has any servo board", and mod2026 passes. The
     old assertions are kept in spirit: the door still has a gate, and the
     refusal still says something true when it fires. */
  console.log('\n════ mod2026 gets the Sequence door too, on the PCA route ════');
  ok('the boot profile is mod2026 and has no Maestro', await ev(()=>
    PROFILE.id==='mod2026' && !PROFILE.hasMaestro));
  ok('its build still has a board that can hold sequences', await ev(()=>
    buildSeqBoard()==='pca32' && buildCanSequence()===true && wsReachable('seq')===true));
  ok('so neither door is blocked', await ev(()=>{
    const w=document.querySelector('#viewsel .wsbtn[data-ws="seq"]');
    const s=document.querySelector('#stripmode .smbtn[data-m="seq"]');
    return !w.classList.contains('blocked') && s.disabled===false;
  }));
  await page.click('#viewsel .wsbtn[data-ws="seq"]');
  ok('clicking it actually enters the desk', await ev(()=>
    wsGet()==='seq' && document.body.classList.contains('ws-seq') && EDIT.active===true));
  ok('and it generated a 32-channel PCA starter to work on', await ev(()=>
    MSTR.loaded && MSTR.board==='pca32' && boardIsPca(MSTR.board)
    && MSTR.channels.length===32 && MSTR.sequences.length>0));
  ok('the build door carries the one build verb, whichever file this route flashes', await ev(()=>
    $('sqBuild').textContent==='⚙ Put on the board'));
  ok('the linter does not fault it for a script it does not have', await ev(()=>
    lintMaestro().counts.err===0));
  ok('the header it exports carries all 32 channels', await ev(()=>
    /#define MPCA_CHANNELS\s+32/.test(pcaGenFromLoadout())));
  await ev(()=>{ setStripMode('pad'); wsSet('drive'); const h=$('toasts'); if(h) h.remove(); });

  console.log('\n════ tab-hop — a synthetic click on a hidden tab hops over ════');
  ok('Drive hides the Model tab button outright', await ev(()=>
    $('tabCad').style.display==='none'));
  let realFailed = false;
  try{ await page.click('#tabCad', {timeout:1500}); }catch(e){ realFailed = true; }
  ok('a REAL click on the hidden tab still fails actionability', realFailed);
  ok('a synthetic click hops to Configure and opens the pane', await ev(()=>{
    $('tabCad').click();
    return wsGet()==='config' && document.body.classList.contains('ws-config')
        && $('pCad').classList.contains('act')
        && document.querySelector('#viewsel .wsbtn.act').dataset.ws==='config';
  }));
  ok('a Controls click hops back to Drive the same way', await ev(()=>{
    document.querySelector('#tabs button[data-p="pHelp"]').click();
    return wsGet()==='drive' && $('pHelp').classList.contains('act');
  }));
  ok('a Maestro click hops to the Bench', await ev(()=>{
    $('tabMae').click();
    return wsGet()==='bench' && $('pMae').classList.contains('act');
  }));
  ok('with Advanced on, a Serial click finds it on the Bench', await ev(()=>{
    wsSet('drive');
    PREFS.adv=true; prefsSave(); applyWs(wsGet());
    document.querySelector('#tabs button[data-p="pCon"]').click();
    const r = wsGet()==='bench' && $('pCon').classList.contains('act');
    PREFS.adv=false; prefsSave(); wsSet('drive');
    return r;
  }));
  ok('wsTabs answers the gate: pCon exists for the Bench only under adv', await ev(()=>{
    PREFS.adv=false;
    const off = wsTabs('bench').join(',');
    PREFS.adv=true;
    const on = wsTabs('bench').join(',');
    PREFS.adv=false;
    return off==='pMae,pServo' && on==='pMae,pServo,pCon' && wsTabs('drive').indexOf('pCon')<0;
  }));

  console.log('\n════ the retired view modes migrate, once ════');
  ok('view:"drive" is dropped, granting nothing', await ev(()=>{
    PREFS.view='drive'; PREFS.adv=false; wsMigrate();
    return PREFS.view===undefined && PREFS.adv===false;
  }));
  ok('view:"build" the same', await ev(()=>{
    PREFS.view='build'; wsMigrate();
    return PREFS.view===undefined && PREFS.adv===false;
  }));
  ok('view:"advanced" keeps the console — adv becomes true', await ev(()=>{
    PREFS.view='advanced'; wsMigrate();
    return PREFS.view===undefined && PREFS.adv===true;
  }));
  ok('an alien stored ws falls back to Drive during migration', await ev(()=>{
    PREFS.view='build'; PREFS.ws='bogus'; wsMigrate();
    return PREFS.ws==='drive';
  }));
  ok('a stored ws of "seq" never boots mid-desk', await ev(()=>{
    PREFS.ws='seq'; wsMigrate();
    return PREFS.ws==='drive';
  }));
  ok('the shims answer off the new state: viewGet is adv-or-build', await ev(()=>{
    PREFS.adv=true;  const hi = viewGet()==='advanced' && viewShows('pCon')===true;
    PREFS.adv=false; const lo = viewGet()==='build'    && viewShows('pCon')===false;
    return hi && lo && viewShows('pCad')===true;
  }));
  await ev(()=>{ PREFS.adv=false; PREFS.ws='drive'; prefsSave(); wsSet('drive'); applyWs(wsGet()); });

  console.log('\n════ the Sequence desk — two doors, one memory ════');
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForFunction('PROFILE.id==="maestro25"', {timeout:10000});
  ok('a Maestro profile keeps the door open too', await ev(()=>
    wsReachable('seq')===true
    && !document.querySelector('#viewsel .wsbtn[data-ws="seq"]').classList.contains('blocked')
    && document.querySelector('#stripmode .smbtn[data-m="seq"]').disabled===false));
  await ev(()=>{ makeStarter('dome'); rebuildMaestroUI(); });
  ok('door 1, the header, from Configure: entering IS the strip mode', await ev(()=>{
    wsSet('config');
    wsSet('seq');
    return wsGet()==='seq' && EDIT.active && document.body.classList.contains('ws-seq')
        && document.body.classList.contains('seqmode')
        && document.querySelector('#viewsel .wsbtn.act').dataset.ws==='seq';
  }));
  ok('the desk is never the saved place — PREFS.ws still says Configure', await ev(()=>
    PREFS.ws==='config' && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).ws==='config'));
  ok('in the desk a stray synthetic tab click hops nothing', await ev(()=>{
    $('tabCad').click();
    return wsGet()==='seq' && document.body.classList.contains('ws-seq');
  }));
  ok('leaving by the strip door restores Configure', await ev(()=>{
    document.querySelector('#stripmode .smbtn[data-m="pad"]').click();
    const tabs=[...document.querySelectorAll('#tabs button')].filter(b=>b.style.display!=='none').map(b=>b.dataset.p);
    return wsGet()==='config' && !EDIT.active && document.body.classList.contains('ws-config')
        && tabs.join(',')==='pCfg,pCad';
  }));
  ok('door 2, the strip, from Drive', await ev(()=>{
    wsSet('drive');
    document.querySelector('#stripmode .smbtn[data-m="seq"]').click();
    return wsGet()==='seq' && EDIT.active && PREFS.ws==='drive';
  }));
  await page.click('#viewsel .wsbtn[data-ws="bench"]');   // leave by the header instead
  ok('leaving by the header lands that workspace and shuts the desk', await ev(()=>
    wsGet()==='bench' && !EDIT.active && !document.body.classList.contains('seqmode')
    && PREFS.ws==='bench'
    && document.querySelector('#stripmode .smbtn[data-m="pad"]').classList.contains('act')));
  ok('the desk\'s own Back button is the strip door too', await ev(()=>{
    wsSet('config');
    wsSet('seq');
    $('sqBig').click();
    return wsGet()==='config' && !EDIT.active;
  }));

  console.log('\n════ the setup .json carries ws + adv ════');
  const round = await ev(()=>{
    wsSet('bench');
    PREFS.adv=true; prefsSave(); applyWs(wsGet());
    const file = JSON.stringify(setupExportObj());
    PREFS.adv=false; prefsSave(); wsSet('drive');
    const r = setupImportText(file, 'ws-bench.json');
    return { exported: JSON.parse(file).prefs,
             imported: r.ok, ws: wsGet(), adv: PREFS.adv,
             serial: document.querySelector('#tabs button[data-p="pCon"]').style.display!=='none' };
  });
  ok('an export from the Bench carries ws:"bench" and adv:true',
     round.exported.ws==='bench' && round.exported.adv===true, JSON.stringify(round.exported.ws)+' '+round.exported.adv);
  ok('importing it lands the Bench with the console gated back in',
     round.imported && round.ws==='bench' && round.adv===true && round.serial);
  ok('a file saved mid-desk carries "seq" but imports to Drive', await ev(()=>{
    document.querySelector('#stripmode .smbtn[data-m="seq"]').click();   // into the desk
    const file = JSON.stringify(setupExportObj());
    document.querySelector('#stripmode .smbtn[data-m="pad"]').click();   // and out
    wsSet('config');
    const r = setupImportText(file, 'mid-desk.json');
    return JSON.parse(file).prefs.ws==='seq' && r.ok && wsGet()==='drive' && !EDIT.active;
  }));
  ok('a legacy file with view:"advanced" grants adv and lands Drive', await ev(()=>{
    PREFS.adv=false; prefsSave(); wsSet('bench');
    const r = setupImportText(JSON.stringify({format:'r2sim-setup',version:1,prefs:{view:'advanced'}}), 'legacy-adv.json');
    return r.ok && PREFS.adv===true && wsGet()==='drive';
  }));
  ok('legacy view:"build" and view:"drive" grant nothing, land Drive', await ev(()=>{
    PREFS.adv=false; prefsSave(); wsSet('config');
    const r1 = setupImportText(JSON.stringify({format:'r2sim-setup',version:1,prefs:{view:'build'}}), 'legacy-build.json');
    const a = r1.ok && PREFS.adv===false && wsGet()==='drive';
    wsSet('config');
    const r2 = setupImportText(JSON.stringify({format:'r2sim-setup',version:1,prefs:{view:'drive'}}), 'legacy-drive.json');
    return a && r2.ok && PREFS.adv===false && wsGet()==='drive';
  }));
  await ev(()=>{ const h=$('toasts'); if(h) h.remove(); });

  console.log('\n════ Esc closes the overlays, dialogs first (Stage-4 pickup) ════');
  await ev(()=>impwizOpen());
  ok('the import wizard is up', await ev(()=>IMPWIZ.open && !$('impWiz').hidden));
  await page.keyboard.press('Escape');
  ok('Esc closes it', await ev(()=>!IMPWIZ.open && $('impWiz').hidden));
  await ev(()=>{ impwizOpen(); appConfirm('the dialog above the wizard owns the first Esc'); });
  await page.keyboard.press('Escape');
  ok('with a dialog up, Esc closes the dialog and leaves the wizard', await ev(()=>
    !document.querySelector('.dlgwrap') && IMPWIZ.open && !$('impWiz').hidden));
  await page.keyboard.press('Escape');
  ok('…and the next Esc closes the wizard', await ev(()=>!IMPWIZ.open && $('impWiz').hidden));
  await ev(()=>bldOpen());
  ok('Build your Maestro is up', await ev(()=>BLD.open && !$('bldWiz').hidden));
  await page.keyboard.press('Escape');
  ok('Esc closes the builder', await ev(()=>!BLD.open && $('bldWiz').hidden));
  await ev(()=>{ bldOpen(); appConfirm('same precedence over the builder'); });
  await page.keyboard.press('Escape');
  ok('the dialog above the builder takes the first Esc', await ev(()=>
    !document.querySelector('.dlgwrap') && BLD.open && !$('bldWiz').hidden));
  await page.keyboard.press('Escape');
  ok('…the second closes the builder', await ev(()=>!BLD.open && $('bldWiz').hidden));

  console.log('\n════ the header "?" button ════');
  await page.click('#btnKbd');
  ok('"?" opens the shortcuts overlay', await ev(()=>
    !!$('kbdHelp') && !!document.querySelector('#kbdHelp .kovcard')));
  /* the overlay covers the header, so the way back out is its own: a
     backdrop click (or Esc/?, pinned in keyboard.test.js) */
  await page.mouse.click(10, 10);
  ok('a backdrop click folds the overlay away', await ev(()=>!$('kbdHelp')));

  console.log('\n════ the Advanced switch, and what a reload remembers ════');
  await ev(()=>wsSet('bench'));
  ok('the switch shows on the Bench tab row only', await ev(()=>{
    const onBench = !$('wsAdvWrap').hidden && $('wsAdv').checked===false;
    return onBench && $('tabs').contains($('wsAdvWrap'));
  }));
  await page.click('#wsAdvWrap');
  ok('a real click on the label gates Serial in and persists adv', await ev(()=>
    $('wsAdv').checked && PREFS.adv===true
    && document.querySelector('#tabs button[data-p="pCon"]').style.display!=='none'
    && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).adv===true));
  await page.click('#tabs button[data-p="pCon"]');
  ok('the Serial pane opens on a real click now', await ev(()=>$('pCon').classList.contains('act')));
  await page.click('#wsAdvWrap');
  ok('switching it off with Serial open falls back — no blank sidebar', await ev(()=>{
    const act = document.querySelector('#tabs button.act');
    return !PREFS.adv && document.querySelector('#tabs button[data-p="pCon"]').style.display==='none'
        && act && act.style.display!=='none' && act.dataset.p!=='pCon';
  }));
  await page.click('#wsAdvWrap');                     // back on for the reload
  await page.reload();
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await ev(()=>closeStartup());
  ok('a reload boots into the remembered Bench with adv still on', await ev(()=>
    wsGet()==='bench' && document.body.classList.contains('ws-bench')
    && PREFS.adv===true && $('wsAdv').checked
    && document.querySelector('#viewsel .wsbtn.act').dataset.ws==='bench'
    && document.querySelector('#tabs button[data-p="pCon"]').style.display!=='none'));
  ok('the store carries ws + adv and no view key at all', await ev(()=>{
    const p = JSON.parse(localStorage.getItem('r2sim.prefs.v1'));
    return p.ws==='bench' && p.adv===true && !('view' in p);
  }));

  /* ══════════════════════════════════════════════════════════════════════
     A DRAGGED PANE EDGE HAS TO END UP UNDER THE POINTER

     The drag reads VIEWPORT px (getBoundingClientRect, ev.clientX) and
     stores the answer into --sideW, which #main consumes INSIDE the
     zoomed subtree — so at 150% every pixel of pointer travel moved the
     edge 1.5px, and the gap grew for as long as you dragged. Measured
     here the only way that means anything: where the edge actually is on
     the glass versus where the pointer actually is.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ splitters drag true at every ui scale ════');
  for(const z of [1.0, 1.5]){
    const drag = await (async()=>{
      await page.evaluate(s=>{ applyUiScale(s); splitReset('sideW'); }, z);
      await page.waitForTimeout(200);
      const v = await ev(()=>{ const r=$('splitV').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; });
      const targetX = Math.round(v[0] - 150);
      await page.mouse.move(v[0], v[1]);
      await page.mouse.down();
      await page.mouse.move(targetX, v[1], {steps:8});
      await page.mouse.up();
      await page.waitForTimeout(200);
      const got = await ev(()=>({
        edge: $('side').getBoundingClientRect().left,
        vis:  $('side').getBoundingClientRect().width,
        stored: PREFS.split.sideW
      }));
      return Object.assign({targetX, z}, got);
    })();
    console.log('      @'+z+'  pointer x='+drag.targetX+'  sidebar edge x='+Math.round(drag.edge)
              +'  visual width='+Math.round(drag.vis)+'  stored --sideW='+drag.stored);
    ok('the sidebar edge lands under the pointer at '+Math.round(z*100)+'%',
       Math.abs(drag.edge - drag.targetX) <= 10, JSON.stringify(drag));
    ok('…and the stored --sideW is the LAYOUT width, so the clamp means something at '+Math.round(z*100)+'%',
       Math.abs(drag.stored*z - drag.vis) <= 6, JSON.stringify(drag));
    ok('…and the clamp is still honoured at '+Math.round(z*100)+'%',
       await ev(()=>PREFS.split.sideW <= SPLIT_LIMITS.sideW.max && PREFS.split.sideW >= SPLIT_LIMITS.sideW.min),
       JSON.stringify(drag));
  }
  /* the strip handle drives a different variable on a different axis, and
     had the same bug — one assertion so the fix cannot be half-applied */
  const tall = await (async()=>{
    await page.evaluate(()=>{ applyUiScale(1.5); splitReset('padH'); });
    await page.waitForTimeout(200);
    const h = await ev(()=>{ const r=$('splitH').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; });
    const targetY = Math.round(h[1] - 110);
    await page.mouse.move(h[0], h[1]); await page.mouse.down();
    await page.mouse.move(h[0], targetY, {steps:8}); await page.mouse.up();
    await page.waitForTimeout(200);
    return Object.assign({targetY}, await ev(()=>({edge: $('padwrap').getBoundingClientRect().top})));
  })();
  console.log('      @1.5  pointer y='+tall.targetY+'  strip top y='+Math.round(tall.edge));
  ok('the strip edge lands under the pointer at 150% too',
     Math.abs(tall.edge - tall.targetY) <= 10, JSON.stringify(tall));
  await page.evaluate(()=>{ applyUiScale(1.0); splitReset('sideW'); splitReset('padH'); });
  await page.waitForTimeout(150);

  /* ══════════════════════════════════════════════════════════════════════
     `act` MEANS THE FEATURE IS ON — the Grid button said the opposite
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ the Grid button tells the truth about the grid ════');
  await ev(()=>{ envSet('studio'); });
  await page.waitForTimeout(150);
  ok('the grid starts visible and the button starts lit', await ev(()=>
    grid.visible === true && $('btnGrid').classList.contains('act')),
    await ev(()=>'grid.visible='+grid.visible+' act='+$('btnGrid').classList.contains('act')));
  await page.click('#btnGrid');
  await page.waitForTimeout(150);
  ok('one click hides the grid and the light goes OUT with it', await ev(()=>
    grid.visible === false && !$('btnGrid').classList.contains('act')),
    await ev(()=>'grid.visible='+grid.visible+' act='+$('btnGrid').classList.contains('act')));
  await page.click('#btnGrid');
  await page.waitForTimeout(150);
  ok('…and back on together', await ev(()=>
    grid.visible === true && $('btnGrid').classList.contains('act')));
  /* envApply() turns the grid off for every non-studio environment and knows
     nothing about this button, so picking Workshop used to leave the two
     permanently unrelated */
  await ev(()=>envSet('workshop'));
  await page.waitForTimeout(200);
  ok('picking an environment that hides the grid takes the light with it', await ev(()=>
    grid.visible === false && !$('btnGrid').classList.contains('act')),
    await ev(()=>'env='+ENV.id+' grid.visible='+grid.visible+' act='+$('btnGrid').classList.contains('act')));
  await ev(()=>envSet('studio'));
  await page.waitForTimeout(200);
  ok('…and going back to the studio puts both back', await ev(()=>
    grid.visible === true && $('btnGrid').classList.contains('act')),
    await ev(()=>'env='+ENV.id+' grid.visible='+grid.visible+' act='+$('btnGrid').classList.contains('act')));

  /* ══════════════════════════════════════════════════════════════════════
     AN ANIMATION RATE THE USER CAN TYPE MUST NOT BE ABLE TO RUN AWAY

     `(CFG.maestroRate||2.2)*dt` with no validation: a NEGATIVE rate makes
     `Math.abs(d) <= step` false forever, so every actuator is stepped AWAY
     from its target without bound — doors spinning continuously, with no
     recovery short of reloading the profile — and the input that sets it
     had no min or max, while main.js:26 clamps CFG.loopHz correctly.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ a typed anim rate cannot make the droid spin forever ════');
  /* an actuator the PCA9685s do NOT own — those are re-read from
     servoTravel() every frame, so they hide the ramp this is about. The
     side panels, rear doors and drawer are ramped by the same expression
     the Maestro path uses, which is the one that ran away. */
  const rateRun = await ev(()=>{
    const k = Object.keys(ACT).find(a=>typeof SERVO_ACT_SET==='undefined' || !SERVO_ACT_SET.has(a));
    const keep = CFG.maestroRate;
    const out = {act:k};
    /* open the door: target 1, start at 0, run 11 s of frames. Whatever a
       user managed to type into the box, the horn ends up AT the target and
       nowhere else — it may take longer or shorter, it may not diverge. */
    for(const rate of [-1, 0, NaN, 1e9, 2.2]){
      CFG.maestroRate = rate;
      ACT[k] = 0; ACT_T[k] = 1;
      for(let i=0;i<220;i++) syncActuators(0.05);      // 11 s of frames
      out[String(rate)] = +ACT[k].toFixed(3);
    }
    CFG.maestroRate = keep;
    ACT[k] = 0; ACT_T[k] = 0;
    return out;
  });
  console.log('      ACT.'+rateRun.act+' after 11 s chasing a target of 1: '+JSON.stringify(rateRun));
  ok('a NEGATIVE rate cannot walk the actuator away from its target for ever',
     Math.abs(rateRun['-1'] - 1) < 1e-6, JSON.stringify(rateRun));
  ok('nor can a typed 0, a NaN or an absurd rate — each still arrives at the target',
     ['0','NaN','1000000000','2.2'].every(k=>Math.abs(rateRun[k] - 1) < 1e-6), JSON.stringify(rateRun));
  ok('the Sim inputs carry a min and a max, the way loopHz always should have', await ev(()=>{
    wsSet('config');
    const rows = [...document.querySelectorAll('#pCfg .cfgrow')].filter(r=>{
      const l = r.querySelector('label');
      return l && /^(loopHz|maestroRate|servoSpeed|maxSpeed|maxYaw|domeRate)\b/.test(l.title||'');
    });
    return rows.length > 0 && rows.every(r=>{
      const i = r.querySelector('input[type=number]');
      return i && i.min !== '' && i.max !== '' && parseFloat(i.min) > 0;
    });
  }), await ev(()=>[...document.querySelectorAll('#pCfg .cfgrow')]
       .filter(r=>{const l=r.querySelector('label');return l && /^(loopHz|maestroRate|servoSpeed|maxSpeed|maxYaw|domeRate)\b/.test(l.title||'');})
       .map(r=>{const l=r.querySelector('label'),i=r.querySelector('input');return (l.title||'').split(' ')[0]+'['+i.min+'..'+i.max+']';}).join(' ')));
  ok('…and typing past a limit is pulled back rather than accepted', await ev(()=>{
    const row = [...document.querySelectorAll('#pCfg .cfgrow')]
      .find(r=>{ const l=r.querySelector('label'); return l && /^loopHz\b/.test(l.title||''); });
    if(!row) return false;
    const i = row.querySelector('input[type=number]');
    i.value = '-40';
    i.dispatchEvent(new Event('change'));
    const low = CFG.loopHz;
    i.value = '999999';
    i.dispatchEvent(new Event('change'));
    const high = CFG.loopHz;
    CFG.loopHz = PROFILE.defaults.loopHz; i.value = CFG.loopHz;
    return low >= parseFloat(i.min) && high <= parseFloat(i.max);
  }));
  /* maestroRate — the box that started this — only exists on a Maestro
     sketch's Sim list, so it is checked on one */
  const mRate = await ev(()=>{
    const was = PROFILE.id;
    loadProfile('maestro25');
    const row = [...document.querySelectorAll('#pCfg .cfgrow')]
      .find(r=>{ const l=r.querySelector('label'); return l && /^maestroRate\b/.test(l.title||''); });
    const i = row && row.querySelector('input[type=number]');
    let typed = null;
    if(i){ i.value = '-1'; i.dispatchEvent(new Event('change')); typed = CFG.maestroRate; }
    const got = i ? {min:i.min, max:i.max, typed, box:i.value} : {missing:true};
    loadProfile(was);
    return got;
  });
  console.log('      maestroRate box: '+JSON.stringify(mRate));
  ok('the anim-rate box itself refuses a negative rate at the door',
     !mRate.missing && parseFloat(mRate.min) > 0 && parseFloat(mRate.max) > parseFloat(mRate.min)
     && mRate.typed >= parseFloat(mRate.min), JSON.stringify(mRate));
  await ev(()=>wsSet('bench'));


  /* ══════════════════════════════════════════════════════════════════════
     THE STAGE TOOLBAR CANNOT LEAVE THE STAGE

     `#stageTools` was `position:absolute; bottom:10px; right:12px` with no
     left edge and no width, so its shrink-to-fit box was floored at its
     MIN-CONTENT width and grew LEFTWARDS out of #stage the moment the nine
     buttons stopped fitting. Follow / Grid / Reset pose — the only way back
     when the orbit camera loses the droid, which it does on the first
     successful drive — went with it: x=-161 at 800×600 with
     body.scrollWidth === clientWidth === 800, so nothing scrolled them
     back, and x=856 in the SEQUENCE workspace at the default 1440×900,
     94px inside the sequencer pane with no resizing at all.

     Every number here is a measured box. A stylesheet read would prove
     nothing: under file:// a LINKED sheet's cssRules throws, so an
     assertion on the CSS text passes on the dist and reads nothing at all
     on dev.html.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ the stage toolbar stays inside the stage, at every size ════');
  const enterWs = async ws => {
    await page.evaluate(w=>{
      if(w === 'seq'){ wsSet('drive'); document.querySelector('#stripmode .smbtn[data-m="seq"]').click(); }
      else { document.querySelector('#stripmode .smbtn[data-m="pad"]').click(); wsSet('drive'); }
    }, ws);
    await page.waitForTimeout(220);
  };
  /* the row's geometry against the pane it is supposed to live in */
  const toolbar = () => ev(()=>{
    const st = $('stage').getBoundingClientRect();
    const t  = $('stageTools');
    const tr = t.getBoundingClientRect();
    const r  = b => b.getBoundingClientRect();
    const btns = [...t.children].filter(b => r(b).width > 0);
    /* reachable = the row can be scrolled to either end and both ends are
       then inside the stage. A box that merely escapes cannot scroll. */
    t.scrollLeft = 0;
    const firstIn = r(btns[0]).left >= st.left - 0.5;
    t.scrollLeft = t.scrollWidth;
    const lr = r(btns[btns.length - 1]);
    const lastIn = lr.right <= st.right + 0.5 && lr.left >= st.left - 0.5;
    t.scrollLeft = 0;
    return {
      stageX: Math.round(st.left), stageW: Math.round(st.width),
      seqbig: document.body.classList.contains('seqbig'),
      first: btns[0].id, firstX: Math.round(r(btns[0]).left),
      maxH: Math.round(Math.max(...btns.map(b=>r(b).height))),
      escaped: btns.filter(b => r(b).left < st.left - 0.5).map(b => b.id),
      boxIn: tr.left >= st.left - 1 && tr.right <= st.right + 1,
      overflowX: getComputedStyle(t).overflowX,
      firstIn, lastIn,
      body: [document.body.scrollWidth, document.body.clientWidth]
    };
  });
  const TB = {};
  for(const ws of ['drive','seq']){
    await enterWs(ws);
    for(const [w,h] of [[1440,900],[1024,700],[800,600]]){
      await page.setViewportSize({width:w, height:h});
      await page.waitForTimeout(220);
      const m = await toolbar();
      TB[ws+' '+w+'×'+h] = m;
      console.log('      '+(ws+'        ').slice(0,6)+' '+(w+'×'+h+'   ').slice(0,9)
        +' stage x='+String(m.stageX).padStart(4)+' w='+String(m.stageW).padStart(4)
        +'   '+m.first+' x='+String(m.firstX).padStart(5)
        +'   overflow-x='+m.overflowX+'  tallest button '+m.maxH+'px'
        +'   escaped=['+m.escaped.join(' ')+']');
      ok('no stage button is drawn outside the stage — '+ws+' '+w+'×'+h,
         m.escaped.length === 0 && m.boxIn, JSON.stringify(m));
      ok('…and both ends of the row can be reached, with no button squashed — '+ws+' '+w+'×'+h,
         m.firstIn && m.lastIn && m.maxH <= 32
         && (m.overflowX === 'auto' || m.overflowX === 'scroll'), JSON.stringify(m));
      ok('…without the page itself growing a scrollbar — '+ws+' '+w+'×'+h,
         m.body[0] === m.body[1], JSON.stringify(m.body));
    }
  }
  await enterWs('drive');

  /* ══════════════════════════════════════════════════════════════════════
     ONE HEADER AT A TIME

     The Panels / Colours / Scene steps narrow the overlay so the droid is
     visible beside it — and left the whole APP header exposed and clickable
     at top right, inches from the overlay's own 📖 MANUAL | DARK | LIGHT |
     CLOSE, with the DRIVE tab guillotined to "VE" by the overlay's edge.
     elementFromPoint is the assertion, not opacity: the question is whether
     a second header can still take the click.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ a setup job that shows the droid does not show two headers ════');
  await page.setViewportSize({width:1440, height:900});
  await page.waitForTimeout(150);
  await ev(()=>{ wsSet('drive'); wizOpen(wizSteps().findIndex(s=>s.key==='_panels')); });
  await page.waitForTimeout(250);
  const hdrs = await ev(()=>{
    const live = ['hdrBezel','viewsel','btnSetup','btnKbd','btnAppMenu'].filter(id=>{
      const e = $(id); if(!e) return false;
      const r = e.getBoundingClientRect();
      if(r.width <= 0 || getComputedStyle(e).visibility === 'hidden') return false;
      const x = Math.min(r.left + r.width/2, innerWidth - 1), y = r.top + r.height/2;
      const hit = document.elementFromPoint(x, y);
      return !!(hit && (hit === e || e.contains(hit)));
    });
    /* the DRIVE tab straddles the overlay's edge whatever we do — the app
       header is as wide as the window. What must not happen is it being
       PAINTED there, half a word wide, next to a header that is not it. */
    const ws = document.querySelector('#viewsel .wsbtn[data-ws="drive"]');
    const wr = ws.getBoundingClientRect(), cr = $('startup').getBoundingClientRect();
    const shown = getComputedStyle(ws).visibility === 'visible' && wr.width > 0;
    return {split: document.body.classList.contains('wizsplit'), live, shown,
            cut: shown && wr.left < cr.right - 0.5 && wr.right > cr.right + 0.5,
            tab:[Math.round(wr.left), Math.round(wr.right)], overlayRight: Math.round(cr.right)};
  });
  console.log('      overlay right edge x='+hdrs.overlayRight+'  DRIVE tab '+JSON.stringify(hdrs.tab)
            +(hdrs.shown?' PAINTED':' not painted')+'  still clickable: ['+hdrs.live.join(' ')+']');
  ok('the Panels step really is the split layout', hdrs.split, JSON.stringify(hdrs));
  ok('no app-header control is left live beside the overlay\'s own header',
     hdrs.live.length === 0, JSON.stringify(hdrs));
  ok('…so nothing in it can be guillotined by the overlay\'s edge either',
     !hdrs.cut, JSON.stringify(hdrs));
  await ev(()=>closeStartup());
  await page.waitForTimeout(200);
  ok('closing the job hands the header back', await ev(()=>{
    const e = $('btnAppMenu'), r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    return getComputedStyle(e).visibility === 'visible' && !!hit && (hit === e || e.contains(hit));
  }));

  /* ══════════════════════════════════════════════════════════════════════
     A SPLITTER MINIMUM HAS TO KEEP THE PANE WORTH HAVING

     Dragged right, the sketch name overhung #side by 27px and read
     "Padawan360_mega_maestro_DYSV5W_PWM." — a filename that does not
     exist — with no ellipsis to say so. Dragged up, padH's static max of
     640 left a 17px stage at 1024×700, the HUD's DOME row hanging over the
     edge and the orbit hint printed through the toolbar. Dragged down, the
     pad was a 117×53 thumbnail.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ splitter minimums keep each pane usable ════');
  await ev(()=>loadProfile('maestro25'));
  await page.waitForFunction('PROFILE.id==="maestro25"', {timeout:10000});
  const fw = await ev(()=>{
    wsSet('drive');
    document.querySelector('#tabs button[data-p="pHelp"]').click();
    splitSet('sideW', 1);                                  // slam the handle right
    const code = [...document.querySelectorAll('#pHelp code')].find(e=>/Padawan360/.test(e.textContent));
    if(!code) return {missing:true, blurb:($('hwBlurb')||{}).textContent};
    const was = code.textContent;
    const read = () => {
      const cr = code.getBoundingClientRect(), sr = $('side').getBoundingClientRect();
      return {overhang: Math.round(cr.right - sr.right), clipped: code.scrollWidth > code.clientWidth + 1};
    };
    const real = read();
    /* the longest name the profiles actually ship — no minimum can promise
       to fit it, so it must END rather than be cut mid-word */
    code.textContent = 'Padawan360_body_mega_maestro_DY5_audioplayer_BETA.ino';
    const long = read();
    code.textContent = was;
    return {sideW: PREFS.split.sideW, side: $('side').clientWidth, text: was,
            ellipsis: getComputedStyle(code).textOverflow, real, long};
  });
  console.log('      '+(fw.missing?'NO SKETCH LINE — '+JSON.stringify(fw):'')+'sideW at its minimum = '+fw.sideW+'  (#side '+fw.side+'px)  "'+fw.text+'"'
            + '  overhang '+fw.real.overhang+'px   text-overflow:'+fw.ellipsis
            + '   52-char name overhang '+fw.long.overhang+'px');
  ok('dragged right, the sketch name still fits inside the sidebar',
     !fw.missing && fw.real.overhang <= 0, JSON.stringify(fw));
  ok('…and a name too long for any minimum ellipsises instead of being cut mid-word',
     !fw.missing && fw.ellipsis === 'ellipsis' && fw.long.overhang <= 0 && fw.long.clipped, JSON.stringify(fw));

  const pad = await ev(()=>{
    splitSet('padH', 1);                                   // slam the handle down
    const s = $('padsvg').getBoundingClientRect();
    return {padH: PREFS.split.padH, w: Math.round(s.width), h: Math.round(s.height)};
  });
  console.log('      padH at its minimum = '+pad.padH+'  → #padsvg '+pad.w+'×'+pad.h);
  ok('dragged down, the virtual pad is still a pad and not a thumbnail',
     pad.h >= 120, JSON.stringify(pad));

  await page.setViewportSize({width:1024, height:700});
  await page.waitForTimeout(200);
  const up = await ev(()=>{
    splitSet('padH', 99999);                               // slam the handle up
    const st = $('stage').getBoundingClientRect();
    const tl = $('hudTL').getBoundingClientRect();
    const t  = $('stageTools').getBoundingClientRect();
    const bl = $('hudBL');
    const br = bl.getBoundingClientRect();
    const hintUp = getComputedStyle(bl).display !== 'none' && br.width > 0;
    return {padH: PREFS.split.padH, stageH: Math.round(st.height),
            hudIn: tl.bottom <= st.bottom + 0.5,
            toolsIn: t.top >= st.top - 0.5 && t.bottom <= st.bottom + 0.5,
            collide: hintUp && !(br.right <= t.left || br.left >= t.right
                                 || br.bottom <= t.top || br.top >= t.bottom),
            hint: hintUp ? [Math.round(br.left), Math.round(br.right)] : null,
            tools: [Math.round(t.left), Math.round(t.right)]};
  });
  console.log('      1024×700, padH at its maximum = '+up.padH+'  → stage '+up.stageH+'px tall'
            + '   hint '+JSON.stringify(up.hint)+'  toolbar '+JSON.stringify(up.tools));
  ok('dragged up, the stage keeps enough height for its own HUD',
     up.stageH >= 200 && up.hudIn && up.toolsIn, JSON.stringify(up));
  ok('…and the orbit hint is never printed through the toolbar',
     !up.collide, JSON.stringify(up));

  /* the same wreck by the road a user actually takes: drag the strip out on
     a big screen, then make the window small. --padH is a FIXED row and the
     stage takes what is left, so a size stored at one window is a promise
     about a different one. */
  await page.setViewportSize({width:1440, height:900});
  await page.waitForTimeout(200);
  await ev(()=>splitSet('padH', 99999));
  const stored = await ev(()=>PREFS.split.padH);
  await page.setViewportSize({width:1024, height:700});
  await page.waitForTimeout(300);
  const shrunk = await ev(()=>{
    const st = $('stage').getBoundingClientRect();
    return {stored: PREFS.split.padH, applied: getComputedStyle(document.body).getPropertyValue('--padH').trim(),
            stageH: Math.round(st.height), strip: Math.round($('padwrap').getBoundingClientRect().height)};
  });
  console.log('      padH '+stored+' dragged at 1440×900, window then 1024×700 → stage '
            + shrunk.stageH+'px tall, strip '+shrunk.strip+'px, --padH '+shrunk.applied);
  ok('a size dragged on a big window is re-fitted when the window shrinks',
     shrunk.stageH >= 200, JSON.stringify(shrunk));
  ok('…without throwing the size the user chose away',
     shrunk.stored === stored, JSON.stringify(shrunk)+' stored was '+stored);

  await page.setViewportSize({width:1500, height:950});
  await page.waitForTimeout(150);
  await ev(()=>{ splitReset('sideW'); splitReset('padH'); splitReset('seqW'); });

  /* ══════════════════════════════════════════════════════════════════════
     THE TEXT-SIZE RANGE IS SYMMETRIC

     A+ went to 150% and A− stopped at 85 — and the smallest size is the one
     a cramped header is read at. Measured on the COMPUTED zoom, which is
     what the layout is actually laid out in.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ A− reaches 75% ════');
  const scale = await ev(()=>{
    applyUiScale(1.0);
    for(let i=0;i<14;i++) applyUiScale(PREFS.uiScale - 0.05);   // hold A− down
    const floor = {pref: PREFS.uiScale, zoom: getComputedStyle(document.body).zoom, lbl: $('uiScaleLbl').textContent};
    applyUiScale(1.0);
    for(let i=0;i<14;i++) applyUiScale(PREFS.uiScale + 0.05);   // and A+
    const ceil = {pref: PREFS.uiScale, zoom: getComputedStyle(document.body).zoom, lbl: $('uiScaleLbl').textContent};
    applyUiScale(1.0);
    return {floor, ceil};
  });
  console.log('      A− bottoms out at '+scale.floor.lbl+' (zoom '+scale.floor.zoom+')'
            + '   ·   A+ tops out at '+scale.ceil.lbl+' (zoom '+scale.ceil.zoom+')');
  ok('A− goes down to 75%, not 85',
     scale.floor.pref === 0.75 && parseFloat(scale.floor.zoom) === 0.75 && scale.floor.lbl === '75%',
     JSON.stringify(scale.floor));
  ok('…and A+ still tops out where it did',
     scale.ceil.pref === 1.5 && parseFloat(scale.ceil.zoom) === 1.5, JSON.stringify(scale.ceil));
  await ev(()=>{ wsSet('bench'); const h=$('toasts'); if(h) h.remove(); });

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
