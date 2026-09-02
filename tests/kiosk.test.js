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

  /* v1.78.0 (review M14) — Guide+LB+RB is the sketch's own Xbox.disconnect(0),
     and both firmware families honour it: the pad is released and the feet
     disarm on the next pass. On the bench the header chip re-syncs it with a
     click. In sim only the header is display:none and a real gamepadconnected
     is the only other writer of forceDisconnect=false — so a visitor mashing
     G/Q/E ended the exhibit until the operator typed the password. Real keys,
     because that is what a visitor has: both bumpers HELD, then the Guide
     click, which is the edge the sketch reads. The wait is on the LOG — the
     chord has one line whichever way xboxDisconnect() answers — so it is a
     state, not a guess about frame timing. */
  console.log('\n════ Guide+LB+RB is a bench control, not a public one ════');
  const logAt = await ev(()=>{ INPUT.keys = {}; return LOG.length; });
  await page.keyboard.down('KeyQ');
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyG');
  await page.waitForFunction(n=>LOG.slice(n).some(l=>/Xbox\.disconnect/.test(l.s)), logAt, {timeout:20000});
  await page.keyboard.up('KeyG');
  await page.keyboard.up('KeyE');
  await page.keyboard.up('KeyQ');
  const chord = await ev(n=>({
    connected: XB.controllerConnected, forced: INPUT.forceDisconnect,
    said: LOG.slice(n).filter(l=>/Xbox\.disconnect/.test(l.s)).map(l=>l.k+': '+l.s)
  }), logAt);
  ok('the chord leaves the pad connected while sim only is on',
     chord.connected === true && chord.forced === false, JSON.stringify(chord));
  ok('…and the log says it was ignored, so the operator can see somebody tried',
     chord.said.some(s=>/^sys: .*ignored/.test(s)), JSON.stringify(chord.said));
  /* the visitor's next move is to drive — so the pad has to still reach the
     sketch, and the feet have to still arm. A disconnected receiver zeroes
     both in pollInput() and mod2026's loop() forces isDriveEnabled false. */
  await ev(()=>{ INPUT.keys = {}; });
  await page.keyboard.down('KeyW');
  const stick = await page.waitForFunction(()=>XB.hat.LeftHatY > 30000 && getAnalogHat('LeftHatY') > 30000,
    null, {timeout:5000}).then(()=>true).catch(()=>false);
  ok('…a stick push still reaches the sketch afterwards', stick,
     await ev(()=>JSON.stringify({hat:XB.hat.LeftHatY, connected:XB.controllerConnected})));
  await ev(()=>virtualPress('START'));
  const armed = await page.waitForFunction(()=>FW.isDriveEnabled === true, null, {timeout:5000})
    .then(()=>true).catch(()=>false);
  const drove = armed && await page.waitForFunction(()=>MOT.drive > 0, null, {timeout:5000})
    .then(()=>true).catch(()=>false);
  ok('…START still arms the feet and the droid still drives', armed && drove,
     await ev(()=>JSON.stringify({armed:FW.isDriveEnabled, drive:MOT.drive, connected:XB.controllerConnected})));
  await page.keyboard.up('KeyW');
  await ev(()=>{ INPUT.keys = {}; FW.isDriveEnabled = false; });

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

  /* THE SIXTH GUARD. #stage is the one surface sim only leaves fully live —
     the public have to be able to drive — so the droid's own raycaster is
     the last funnel that can hand a stranger a configuration surface, and
     #selcard is a full one: a live position slider, the Port <select> that
     rewrites MSTR.channels[n].act, rename, colour, the pivot/travel editor
     and "+ New group with this part". Assert all three layers the other
     five guards have — the funnel, the shut-down pass on the way in, and
     the visible half in CSS. */
  console.log('\n════ the droid on the stage is drivable, not configurable ════');
  const pick = await ev(()=>{
    const n = Object.keys(CAD.partIndex)[0];
    selectPart(n);
    const card = $('selcard');
    return {n, sel:SEL.name, on:card.classList.contains('on')};
  });
  ok('selectPart() refuses the pick while sim only is on', pick.sel===null, JSON.stringify(pick));
  ok('…so the part card never opens', pick.on===false, JSON.stringify(pick));
  /* getComputedStyle, NOT the stylesheet text: under file:// a LINKED
     sheet's cssRules throws, so a rule-text assertion reads nothing on
     dev.html and passes anyway (HANDOVER §Traps). Force the card's own
     `.on` and ask the browser what it actually resolved to. */
  ok('…and the card is display:none in sim only even if something else opens it', await ev(()=>{
    const c = $('selcard'); c.classList.add('on');
    const d = getComputedStyle(c).display;
    c.classList.remove('on');
    return d === 'none';
  }));
  ok('a card already open when the laptop is handed over is shut on the way in', await ev(()=>{
    kioskLeave();
    const n = Object.keys(CAD.partIndex)[0];
    selectPart(n);
    const opened = SEL.name===n && $('selcard').classList.contains('on');
    kioskEnter('');
    return opened && SEL.name===null && !$('selcard').classList.contains('on');
  }));

  /* An appConfirm sits over a LIVE pad in sim only, and .dlgcard/.dlgmsg
     are plain divs: one click on the dialog's text moves focus to <body>
     and both of the mapper's guards (the closest('input,…,button') test
     and uiModalOpen()) are gone. The About box is explicitly a scroll
     region, so "click the text, press Down" is the natural way to read
     it — and it fired the D-pad at the running sketch. */
  console.log('\n════ a dialog over a live pad — no keystroke reaches the sketch ════');
  await ev(()=>{ window._c = appConfirm('A long message you would read by clicking into it and pressing Down.',
                                        {title:'Reading, not driving'}); });
  await page.waitForSelector('.dlgwrap .dlgyes', {timeout:10000});
  await page.click('.dlgmsg');
  await ev(()=>{ INPUT.keys = {}; });
  await page.keyboard.down('ArrowDown');
  const cDown = await ev(()=>({key:INPUT.keys.ArrowDown, active:document.activeElement.tagName}));
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('Space');
  const cSpace = await ev(()=>INPUT.keys.Space);
  await page.keyboard.up('Space');
  await ev(()=>{ document.querySelector('.dlgno').click(); return window._c; });
  ok('a click on an appConfirm’s text drops focus to the page', cDown.active==='BODY', JSON.stringify(cDown));
  ok('…and Down still cannot reach the D-pad', cDown.key!==1, JSON.stringify(cDown));
  ok('…nor Space the A button', cSpace!==1, String(cSpace));

  /* v1.70.0 — the kiosk used to inherit whatever camera the operator left
     behind, and one walkthrough's public view had no droid in it at all.
     There is no Follow, Reset pose or Front in here (they live in
     #stageTools, which sim only hides whole), so the first visitor to spin
     the wheel ended the exhibit until an operator typed the password.
     The camera is deliberately NOT locked — orbit and zoom are the point of
     handing the laptop over — so what the mode needs is a way BACK. */
  console.log('\n════ the camera the public gets ════');
  ok('a Re-centre control sits beside Exit in the kiosk bar', await ev(()=>{
    const b = $('btnKioskRecentre');
    return !!b && b.closest('#kioskBar') === $('kioskBar') && b.nextElementSibling === $('btnKioskExit');
  }));
  /* the containment: the bar is the one surface sim only ADDS, so what is
     on it is the shortest road back into the app. Two controls, and the
     way out is still the last of them. */
  ok('…and the bar carries exactly those two controls, the way out last', await ev(()=>{
    const bs = [...$('kioskBar').querySelectorAll('button')];
    return bs.length === 2 && bs[1] === $('btnKioskExit');
  }));
  ok('Re-centre puts the droid back in the picture and keeps it there', await ev(()=>{
    CAM.follow = false; CAM.dist = 13.5; CAM.target.set(6, 4, -6);   // spun off into the dark
    const b = $('btnKioskRecentre'); if(!b) return false;
    b.click();
    return CAM.follow === true && CAM.dist <= 3 &&
      Math.hypot(CAM.target.x - R2.pos.x, CAM.target.z - R2.pos.z) < 0.6;
  }));
  /* it moves the CAMERA. Nothing else — it must not become the seventh
     door, so assert the whole visible shape of the mode is unchanged. */
  ok('…and it is not a door back into the app: it moves the camera and nothing else', await ev(()=>{
    const snap = ()=>JSON.stringify({model:modelGet(), env:envGet(), ws:wsGet(), track:TRACK.on,
      kiosk:kioskOn(), body:document.body.className, seq:EDIT.active,
      head:getComputedStyle(document.querySelector('header')).display,
      side:getComputedStyle($('side')).display,
      tools:getComputedStyle($('stageTools')).display,
      startup:$('startup').classList.contains('on'), card:$('selcard').classList.contains('on')});
    const before = snap();
    const b = $('btnKioskRecentre'); if(!b) return false;
    b.click();
    return snap() === before;
  }));
  ok('entering composes the opening frame instead of inheriting the operator\'s camera', await ev(()=>{
    kioskLeave();
    CAM.follow = false; CAM.dist = 13.5; CAM.target.set(6, 4, -6);   // the operator's leftovers
    kioskEnter('');
    return CAM.follow === true && CAM.dist <= 3 &&
      Math.hypot(CAM.target.x - R2.pos.x, CAM.target.z - R2.pos.z) < 0.6;
  }));

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
  await page.waitForTimeout(150);
  ok('a wrong password does not open it', await ev(()=>
    kioskOn()===true && document.body.classList.contains('kiosk')));
  /* it used to close the dialog and drop a toast in the far bottom-left
     corner — feedback the operator is not looking at, and a prompt that
     has silently gone. Someone who keeps typing the password they think
     they are still typing is then typing at the LIVE pad. */
  ok('…the prompt stays up rather than vanishing', await ev(()=>
    !!document.querySelector('.dlgwrap .dlginp')));
  ok('…and it says which of the two it was, inline', await ev(()=>{
    const m = document.querySelector('.dlgwrap .dlgmsg');
    return !!m && /not the password/i.test(m.textContent);
  }));
  ok('…and the Serial console has the attempt', await ev(()=>
    LOG.some(l=>l.k==='warn' && /wrong password/i.test(l.s))));
  await ev(()=>{ INPUT.keys = {}; });
  await page.keyboard.down('KeyR');
  const rKey = await ev(()=>INPUT.keys.KeyR);
  await page.keyboard.up('KeyR');
  ok('…so a letter typed at the retry still cannot change gear', rKey!==1, String(rKey));
  await page.click('.dlgno');
  ok('cancelling the retry leaves it locked', await ev(()=>
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
