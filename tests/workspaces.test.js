/* the four workspaces (v1.17.0, B1): the header switcher, the mod2026 gate
   on Sequence, both doors into the desk with prev-workspace restore, the
   Bench's Advanced switch, tab-hop, the retired-view migration, the setup
   .json round-trip of ws/adv, and the Stage-4 Esc pickups (impWiz/bldWiz).
   Ground truth: src/js/config/workspaces.js + the views.js shims. */
const { chromium } = require('playwright');
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
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required','--mute-audio']
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; prefsSave(); closeStartup(); });
  const ev = f => page.evaluate(f);
  /* the exact refusal wording, shared with the in-page assertions */
  await page.evaluate(r=>{ window.REFUSAL=r; }, REFUSAL);

  console.log('\n════ the switcher — four workspaces in the header ════');
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
     Sequence door, because a PCA9685 could not hold a routine. It can now —
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
  ok('the build button says what it will actually produce', await ev(()=>
    $('sqBuild').textContent.indexOf('sequences.h')>=0));
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

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
