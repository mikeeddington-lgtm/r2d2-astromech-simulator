/* keyboard & focus (Stage 3, M7): the --focus ring painted by
   :focus-visible only, Esc consistency on the setup wizard, and the
   "?" shortcuts overlay */
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
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); });
  const ev = f => page.evaluate(f);
  /* a real TRUSTED click without the actionability spin: this suite runs on
     a 2-core box that sibling suites may share, and page.click()'s
     stability polling starves there (AGENTS.md lesson). page.mouse.click
     dispatches the same trusted input at the element's centre. */
  const mclick = async sel => {
    const p = await page.evaluate(s=>{
      const r = document.querySelector(s).getBoundingClientRect();
      return {x:r.x+r.width/2, y:r.y+r.height/2};
    }, sel);
    await page.mouse.click(p.x, p.y);
  };

  console.log('\n════ M7a · the focus ring ════');
  /* Tab from the body until a control takes focus — real keyboard, so the
     ring must be up (:focus-visible matches keyboard-driven focus) */
  let hit = null;
  for(let i=0; i<10 && !hit; i++){
    await page.keyboard.press('Tab');
    hit = await ev(()=>{
      const a = document.activeElement;
      if(!a || a===document.body || !a.matches(':focus-visible')) return null;
      const cs = getComputedStyle(a);
      return {tag:a.tagName, cls:String(a.className), w:cs.outlineWidth,
              style:cs.outlineStyle, col:cs.outlineColor, off:cs.outlineOffset};
    });
  }
  ok('Tab reaches a control and it matches :focus-visible', !!hit, JSON.stringify(hit));
  /* the first Tab stop is now a workspace button (v1.17.0), whose ring is
     deliberately INSET (outline-offset:-2px): #viewsel{overflow:hidden}
     would clip an outside ring. Everything else keeps the 2px offset. */
  ok('the ring is the 2px solid --focus outline (inset on a .wsbtn)', !!hit &&
     hit.w==='2px' && hit.style==='solid' && hit.col==='rgb(67, 217, 232)'
     && hit.off===(/\bwsbtn\b/.test(hit.cls) ? '-2px' : '2px'),
     hit ? hit.cls+' · '+hit.w+' '+hit.style+' '+hit.col+' '+hit.off : '');
  ok('the light theme repoints the token at its teal', await ev(()=>{
    applyTheme('light');
    const v = getComputedStyle(document.body).getPropertyValue('--focus').trim();
    applyTheme('dark');
    return v==='#0c7d8b';
  }));
  ok('a programmatic .click() paints no ring — :focus-visible only', await ev(()=>{
    const b = $('btnGrid');
    b.click(); b.click();                       // toggle and restore
    const cs = getComputedStyle(b);
    /* NOT outlineWidth: getComputedStyle returns the COMPUTED width (3px)
       even when the style is none — Chromium 151 changed this; older builds
       returned the used value, 0px. `outlineStyle === 'none'` is the real
       assertion, because nothing is painted whatever the width says, and the
       positive case above still pins the ring at 2px solid. */
    return !b.matches(':focus-visible') && cs.outlineStyle==='none';
  }));
  await mclick('#btnGrid');
  ok('a real click still blurs the button — the keyboard keeps driving', await ev(()=>
    document.activeElement===document.body));
  await mclick('#btnGrid');                     // grid back to where it was

  console.log('\n════ M7c · the "?" overlay ════');
  await page.keyboard.press('?');
  ok('? opens the shortcuts overlay', await ev(()=>
    !!$('kbdHelp') && !!document.querySelector('#kbdHelp .kovcard')));
  ok('driving, sequencer and app keys are all on the card', await ev(()=>{
    const t = $('kbdHelp').textContent;
    return /Left stick/.test(t) && /WASD/.test(t) && /IJKL/.test(t)
        && /Ctrl\+Z/.test(t) && /Ctrl\+Y/.test(t) && /Esc/.test(t) && /Guide/.test(t);
  }));
  ok('the key caps reuse the <kbd> treatment', await ev(()=>
    $('kbdHelp').querySelectorAll('.kbrow kbd').length >= 20));
  await page.keyboard.press('?');
  ok('? closes it again', await ev(()=>!$('kbdHelp')));
  await page.keyboard.press('?');
  await page.keyboard.press('Escape');
  ok('Esc closes it and the node is removed', await ev(()=>
    !$('kbdHelp') && !document.querySelector('.kovcard')));

  /* the key-mapper exemption: typing in a field is typing, not asking */
  await ev(()=>{ makeStarter('body','mini18'); setStripMode('seq'); });
  ok('the sequencer strip is up with the routine-name field', await ev(()=>
    !!document.querySelector('.blkname')));
  await ev(()=>{ document.querySelector('.blkname').focus(); });
  await page.keyboard.press('?');
  ok('? typed into the name field stays a character — no overlay', await ev(()=>{
    const i = document.querySelector('.blkname');
    return !$('kbdHelp') && i===document.activeElement && i.value.indexOf('?')>=0;
  }));
  await ev(()=>{
    const i = document.querySelector('.blkname');
    i.value = i.value.replace(/\?/g,''); i.blur();
    setStripMode('pad');
  });

  /* it stays out of the confirm dialog's way */
  await ev(()=>{ appConfirm('the question mark must not open over me'); });
  await page.keyboard.press('?');
  ok('? does not open over the confirm dialog', await ev(()=>
    !$('kbdHelp') && !!document.querySelector('.dlgwrap')));
  await page.keyboard.press('Escape');
  ok('Esc still cancels that dialog', await ev(()=>!document.querySelector('.dlgwrap')));

  console.log('\n════ M7b · Esc and the setup wizard ════');
  await ev(()=>{ buildGet().done = true; prefsSave(); wizOpen(); });
  ok('a configured droid reopens the wizard from Setup', await ev(()=>
    $('startup').classList.contains('on')));
  await page.keyboard.press('?');
  ok('? does not open over the wizard', await ev(()=>!$('kbdHelp')));
  await page.keyboard.press('Escape');
  ok('Esc closes the wizard when a droid is configured', await ev(()=>
    !$('startup').classList.contains('on')));

  /* a stage picker raised over the split wizard owns its own Esc */
  await ev(()=>{ wizOpen(wizSteps().findIndex(s=>s.key==='_scene')); $('btnEnv').click(); });
  ok('the scene step splits and a stage picker opens over it', await ev(()=>
    document.body.classList.contains('wizsplit') && !!$('stagePick')));
  await page.keyboard.press('Escape');
  ok('Esc shuts the picker, not the wizard', await ev(()=>
    !$('stagePick') && $('startup').classList.contains('on')));
  await page.keyboard.press('Escape');
  ok('…and the next Esc shuts the wizard', await ev(()=>
    !$('startup').classList.contains('on')));

  /* the confirm dialog raised over the wizard owns its own Esc too */
  await ev(()=>{ wizOpen(); appConfirm('Esc belongs to me first'); });
  await page.keyboard.press('Escape');
  ok('Esc cancels a dialog over the wizard and leaves the wizard open', await ev(()=>
    !document.querySelector('.dlgwrap') && $('startup').classList.contains('on')));
  await page.keyboard.press('Escape');
  ok('…then the wizard', await ev(()=>!$('startup').classList.contains('on')));

  /* a TRUE first run: never configured, never skipped — the wizard is the
     only route to a working config, so Esc is swallowed */
  await ev(()=>{ buildGet().done = false; PREFS.seenStartup = false; prefsSave(); wizOpen(0); });
  await page.keyboard.press('Escape');
  ok('on a true first run Esc does NOT close it', await ev(()=>
    $('startup').classList.contains('on') && !buildConfigured()));
  await mclick('#btnStartupGo');
  ok('the labelled way out still works — Skip the rest', await ev(()=>
    !$('startup').classList.contains('on') && PREFS.seenStartup===true));
  /* skipped once, still unconfigured: a reopen closes on Esc again —
     the contract look-boards.test.js pins */
  await ev(()=>wizOpen());
  await page.keyboard.press('Escape');
  ok('skipped-but-unconfigured, a reopened wizard closes on Esc', await ev(()=>
    !$('startup').classList.contains('on') && !buildConfigured()));

  console.log('\n════ M7d · the bench must not drive the droid (Mike, 2026-08-14) ════');
  /* "when in setup mode and selecting certain boxes it makes noises from
     the sound files — stop that." Root cause: gamepad.js's keydown map
     only skipped INPUT/TEXTAREA/SELECT/BUTTON targets, so a key that
     landed on a <label>, an <a>, or a custom div control (the startup
     wizard's .optcard, focusable and its own keydown handler) still fell
     through to the pad map, AND the sketch keeps looping under a
     full-page overlay — so mp3.playTrack()/player.playSpecified() fired
     from inside setup. Fixed by gating gamepad.js's keydown on
     uiModalOpen() (core/util.js) in addition to a widened target guard. */
  await ev(()=>{ closeStartup(); PREFS.seenStartup = true; });
  ok('overlay CLOSED: "w" still reaches INPUT.keys — normal driving is untouched', await ev(()=>{
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    const drove = INPUT.keys.KeyW === 1;
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    return drove && INPUT.keys.KeyW === 0;
  }));
  ok('overlay CLOSED: Space (pad A) still reaches the sketch — a new mp3 log line', await ev(()=>{
    const before = LOG.filter(l=>l.k==='mp3').length;
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'Space', key:' ', bubbles:true, cancelable:true}));
    pollInput(); fwLoop();
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'Space', key:' ', bubbles:true, cancelable:true}));
    pollInput(); fwLoop();
    return LOG.filter(l=>l.k==='mp3').length > before;
  }));
  ok('overlay OPEN (the bench): "w"/Space are swallowed — no INPUT.keys change, no new mp3 log line', await ev(()=>{
    setupOpen(4);
    const beforeKeys = JSON.stringify(INPUT.keys);
    const beforeLog = LOG.filter(l=>l.k==='mp3').length;
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'Space', key:' ', bubbles:true, cancelable:true}));
    pollInput(); fwLoop();
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'Space', key:' ', bubbles:true, cancelable:true}));
    const afterKeys = JSON.stringify(INPUT.keys);
    const afterLog = LOG.filter(l=>l.k==='mp3').length;
    const stillOpen = SETUP.open;
    setupClose();
    return stillOpen && beforeKeys === afterKeys && afterLog === beforeLog;
  }));
  ok('overlay closes again: "w" drives once more — the gate does not stick', await ev(()=>{
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    const drove = INPUT.keys.KeyW === 1;
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    return drove;
  }));

  console.log('\n════ M8 · the arming hint + the DRIVE chip (UX item 1.5a, 2026-08-15) ════');
  /* "pushing a stick while disarmed does nothing and nothing says why."
     Isolate from whatever the suite above left behind: a clean disarmed
     boot state, no drive-hint cooldown in effect, no stray toast plate.
     DRIVEHINT (input/pad-ui.js) may not exist on a pre-change tree — that
     is exactly the point of the RED run, so this reset is guarded rather
     than assumed. */
  await ev(()=>{
    FW.isDriveEnabled = false;
    if(typeof DRIVEHINT !== 'undefined'){ DRIVEHINT.shownAt = -Infinity; DRIVEHINT.plate = null; }
    document.querySelectorAll('#toasts .toastp').forEach(p=>p.remove());
  });
  ok('boot state for this block: disarmed', await ev(()=>!FW.isDriveEnabled));

  ok('W held while disarmed shows the hint, with the exact wording, via the toast host', await ev(()=>{
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    pollInput();
    const p = document.querySelector('#toasts .toastp');
    const text = p ? p.textContent : null;
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    pollInput();
    return text === 'Feet are disarmed — press START (Enter) to arm.';
  }));

  await ev(()=>{
    // START, the same way M7d above presses Space — a real keydown/keyup
    // pair on window, with pollInput()/fwLoop() driven manually so the
    // sketch actually consumes the click instead of waiting on a frame.
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'Enter', key:'Enter', bubbles:true, cancelable:true}));
    pollInput(); fwLoop();
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'Enter', key:'Enter', bubbles:true, cancelable:true}));
    pollInput(); fwLoop();
  });
  ok('START arms the feet', await ev(()=>FW.isDriveEnabled));
  // toastDrop() starts a 180ms fade before the node is actually removed —
  // ".out" is the immediate, synchronous evidence that arming dismissed it
  ok('arming dismisses the hint', await ev(()=>{
    const p = document.querySelector('#toasts .toastp');
    return !p || p.classList.contains('out');
  }));
  await page.waitForFunction(`document.getElementById('chDrive').lastElementChild.textContent === 'Drive armed'`);
  ok('…and the DRIVE chip reads armed', await ev(()=>
    $('chDrive').lastElementChild.textContent === 'Drive armed'));

  await mclick('#chDrive');
  await ev(()=>{ fwLoop(); });                  // consume the click deterministically, no frame wait
  ok('clicking the chip disarms — a real START edge, not a poke at sketch state', await ev(()=>!FW.isDriveEnabled));
  await page.waitForFunction(`document.getElementById('chDrive').lastElementChild.textContent === 'Drive off'`);
  ok('…and the chip text flips back', await ev(()=>
    $('chDrive').lastElementChild.textContent === 'Drive off'));
  ok('the chip looks clickable and says what a click does', await ev(()=>
    getComputedStyle($('chDrive')).cursor === 'pointer'
    && $('chDrive').title === 'arm / disarm the foot motors (START)'));

  await ev(()=>{
    if(typeof DRIVEHINT !== 'undefined'){ DRIVEHINT.shownAt = -Infinity; DRIVEHINT.plate = null; }
    document.querySelectorAll('#toasts .toastp').forEach(p=>p.remove());
    wizOpen();
  });
  ok('the wizard is open (a modal overlay)', await ev(()=>$('startup').classList.contains('on')));
  ok('W held while a modal overlay is open shows no hint', await ev(()=>{
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    pollInput();
    const present = !!document.querySelector('#toasts .toastp');
    window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyW', key:'w', bubbles:true, cancelable:true}));
    pollInput();
    return !present;
  }));
  await ev(()=>{ closeStartup(); PREFS.seenStartup = true; });

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
