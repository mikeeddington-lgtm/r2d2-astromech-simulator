/* SIM ONLY — the public driving mode (v1.28.0): the bar and what it hides,
   the session-only password, the exit's three answers (cancel / wrong /
   right), the four guards that survive hiding a control (file drop,
   openStartup, wsSet, the sequencer door), and the promise that nothing
   about it is remembered.
   Ground truth: src/js/app/kiosk.js + src/css/10-kiosk.css. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser({audio:true});
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; prefsSave(); closeStartup(); });
  /* takes an argument, unlike the other suites' ev — the show/hide checks
     are the same three lines against a dozen selectors */
  const ev = (f,a) => page.evaluate(f,a);
  const shown = sel => ev(s=>{
    const e=document.querySelector(s);
    return !!e && getComputedStyle(e).display!=='none' && e.getBoundingClientRect().width>0;
  }, sel);

  console.log('\n════ before it is enabled, nothing has changed ════');
  ok('the app does not boot into sim only', await ev(()=>
    kioskOn()===false && !document.body.classList.contains('kiosk')));
  ok('the bar is not on screen', !(await shown('#kioskBar')));
  ok('the header is', await shown('header'));
  ok('the way in is one button in the app menu', await ev(()=>{
    const b=$('btnKiosk');
    return !!b && b.closest('#appMenu')!==null && /sim only/i.test(b.textContent);
  }));

  console.log('\n════ enabling it — the mode, not the scene ════');
  /* freeze what the stage is showing so "locked to what you set" can be
     asserted as an identity, not a guess */
  const before = await ev(()=>({model:modelGet(), env:envGet(), track:TRACK.on, fw:PROFILE.id, ms:SIM.millis}));
  ok('kioskEnter with no password returns true', await ev(()=>kioskEnter('')===true));
  ok('the body wears .kiosk and the bar is row 1', await ev(()=>
    document.body.classList.contains('kiosk') && kioskOn()===true));
  ok('the bar is on screen', await shown('#kioskBar'));
  ok('…and it says it is NOT locked', await ev(()=>/anyone can leave/i.test($('kioskState').textContent)));

  console.log('\n════ what it takes away ════');
  for(const [what, sel] of [['the header (Setup, Menu, workspaces)','header'],
                            ['the sidebar and every tab','#side'],
                            ['the sidebar splitter','#splitV'],
                            ['the stage pickers (model, backdrop, track)','#stageTools'],
                            ['the door to the sequencer','#stripmode']]){
    ok(what+' is gone', !(await shown(sel)));
  }
  /* the stage/pad splitter is hidden by VISIBILITY, not display: #left
     auto-places its three children, and taking the splitter out of the
     grid entirely promotes #padwrap into the splitter's row and collapses
     the whole controller strip to nothing. Assert both halves — invisible,
     and still holding its row open. */
  ok('the stage/pad splitter is invisible and cannot be dragged', await ev(()=>{
    const s = getComputedStyle($('splitH'));
    return s.visibility==='hidden' && s.pointerEvents==='none';
  }));
  ok('…but the controller strip still has its full height', await ev(()=>
    $('padwrap').getBoundingClientRect().height > 120));
  console.log('\n════ …and what it keeps ════');
  ok('the stage is still there, and wider than the window minus a sidebar', await ev(()=>{
    const r=$('stage').getBoundingClientRect();
    return r.width > window.innerWidth - 40;
  }));
  ok('the on-screen pad is still drivable', await shown('#padstage'));
  ok('the keyboard legend is still there', await shown('#padside'));
  ok('the drive HUD is still there', await shown('#hudTL'));

  console.log('\n════ the scene is frozen, and the sketch never stopped ════');
  ok('the same model, backdrop and track state as before', await ev(b=>
    modelGet()===b.model && envGet()===b.env && TRACK.on===b.track, before));
  ok('the same firmware is loaded', await ev(b=>PROFILE.id===b.fw, before));
  /* the whole point of the sim: the public drive the REAL loop() */
  await page.waitForFunction(ms=>SIM.millis > ms + 400, before.ms, {timeout:20000});
  ok('loop() is still running — SIM.millis advanced', true);

  console.log('\n════ the guards that survive hiding a control ════');
  await ev(()=>openStartup());
  ok('openStartup() will not raise the setup wizard', await ev(()=>
    !$('startup').classList.contains('on')));
  await ev(()=>wsSet('bench'));
  ok('wsSet() will not pull a workspace back', await ev(()=>
    wsGet()!=='bench' && !document.body.classList.contains('ws-bench')));
  await ev(()=>setStripMode('seq'));
  ok('the sequencer desk refuses to open', await ev(()=>
    EDIT.active===false && !document.body.classList.contains('seqmode')));
  /* a dropped .json is setupImportFile() — the one door display:none
     cannot close. Spy on it rather than let a real import run. */
  ok('a file dropped on the window is refused', await ev(async ()=>{
    const real = window.setupImportFile; let called = 0;
    window.setupImportFile = ()=>{ called++; };
    const dt = new DataTransfer();
    dt.items.add(new File(['{}'], 'someone-elses.json', {type:'application/json'}));
    window.dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true, cancelable:true}));
    await new Promise(r=>setTimeout(r,60));
    window.setupImportFile = real;
    return called === 0;
  }));
  ok('…and it says why rather than swallowing it', await ev(()=>
    [...document.querySelectorAll('.toastp')].some(t=>/sim only/i.test(t.textContent))));

  console.log('\n════ leaving with no password set — a confirm, not a lock ════');
  await ev(()=>{ window._x = kioskExit(); });
  await page.waitForSelector('.dlgwrap .dlgyes', {timeout:10000});
  ok('it asks before putting the workshop back', await ev(()=>
    !!document.querySelector('.dlgwrap') && !document.querySelector('.dlginp')));
  await page.click('.dlgno');
  ok('Stay leaves it in sim only', await ev(()=>window._x.then(r=>r===false && kioskOn()===true)));
  await ev(()=>{ window._x = kioskExit(); });
  await page.waitForSelector('.dlgwrap .dlgyes', {timeout:10000});
  await page.click('.dlgyes');
  ok('Leave puts it back', await ev(()=>window._x.then(r=>r===true && kioskOn()===false)));
  ok('the header is back', await shown('header'));
  ok('the sidebar is back', await shown('#side'));

  console.log('\n════ with a password — the exit is the lock ════');
  ok('enabling with one says so on the bar', await ev(()=>
    kioskEnter('  droid42  ')===true && /locked/i.test($('kioskState').textContent)));
  ok('the password is stored as typed, trimmed by the caller not the store', await ev(()=>
    KIOSK.pass==='  droid42  '));
  await ev(()=>kioskLeave());

  ok('re-enabling through the trimming door stores the trimmed one', await ev(async ()=>{
    /* kioskAsk() is what the menu button calls — it trims */
    const p = kioskAsk();
    await new Promise(r=>setTimeout(r,50));
    document.querySelector('.dlginp').value = '  droid42  ';
    document.querySelector('.dlgyes').click();
    await p;
    return KIOSK.pass === 'droid42';
  }));
  ok('the field the public sees is masked', await ev(async ()=>{
    window._x = kioskExit();
    await new Promise(r=>setTimeout(r,50));
    return document.querySelector('.dlginp').type === 'password';
  }));
  await page.fill('.dlginp','nope');
  await page.click('.dlgyes');
  ok('a wrong password does not open it', await ev(()=>
    window._x.then(r=>r===false && kioskOn()===true && document.body.classList.contains('kiosk'))));
  ok('…and it says so', await ev(()=>
    [...document.querySelectorAll('.toastp.warn')].some(t=>/not the password/i.test(t.textContent))));

  await ev(()=>{ window._x = kioskExit(); });
  await page.waitForSelector('.dlgwrap .dlginp', {timeout:10000});
  await page.click('.dlgno');
  ok('cancelling the prompt leaves it locked', await ev(()=>
    window._x.then(r=>r===false && kioskOn()===true)));

  await ev(()=>{ window._x = kioskExit(); });
  await page.waitForSelector('.dlgwrap .dlginp', {timeout:10000});
  await page.fill('.dlginp','droid42');
  await page.click('.dlgyes');
  ok('the right password does open it', await ev(()=>
    window._x.then(r=>r===true && kioskOn()===false)));
  ok('and the password does not survive the exit', await ev(()=>KIOSK.pass===null));

  console.log('\n════ entering from the sequencer desk closes it first ════');
  await ev(()=>{ wsSet('seq'); });
  ok('the desk is open', await ev(()=>EDIT.active===true));
  await ev(()=>kioskEnter(''));
  ok('enabling sim only left the desk', await ev(()=>
    EDIT.active===false && !document.body.classList.contains('seqmode')
    && document.body.classList.contains('kiosk')));
  await ev(()=>kioskLeave());

  console.log('\n════ temporary means temporary ════');
  await ev(()=>kioskEnter('showday'));
  ok('nothing about it reaches the prefs store', await ev(()=>{
    const raw = localStorage.getItem('r2sim.prefs.v1') || '';
    const p = JSON.parse(raw||'{}');
    return !/showday/.test(raw) && !('kiosk' in p) && p.kioskPass===undefined;
  }));
  ok('nor the setup .json export', await ev(()=>{
    const j = JSON.stringify(typeof setupExportObj==='function' ? setupExportObj() : {});
    return !/showday/.test(j) && !/kiosk/i.test(j);
  }));
  await page.reload();
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await ev(()=>closeStartup());
  ok('a reload comes back in the workshop, not locked out', await ev(()=>
    kioskOn()===false && KIOSK.pass===null && !document.body.classList.contains('kiosk')));
  ok('…with the header and the sidebar back', await shown('header') && await shown('#side'));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
