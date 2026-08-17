/* header chrome (v1.14.0): the 1280px laptop clip, the app menu, status
   chips that no longer dress like buttons, and the --cta primary colour */
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
  /* the whole point: a 1280×780 laptop, the size the clip was reported at */
  const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); });
  const ev = f => page.evaluate(f);

  console.log('\n════ nothing clips on a 1280×780 laptop ════');
  ok('the document is no wider than the viewport', await ev(()=>
    document.documentElement.scrollWidth <= window.innerWidth),
    await ev(()=>document.documentElement.scrollWidth+' vs '+window.innerWidth));
  ok('all four workspace buttons are fully on screen', await ev(()=>
    document.querySelectorAll('#viewsel .wsbtn').length===4 &&
    [...document.querySelectorAll('#viewsel .wsbtn')].every(b=>{
      const r=b.getBoundingClientRect();
      return r.width>0 && Math.round(r.right) <= window.innerWidth;
    })));
  /* boot lands the Drive workspace, where the Model tab is hidden — enter
     Configure (synthetically; a real click cannot reach a hidden tab) so
     the no-clip measurement is of a tab that is actually shown */
  await ev(()=>wsSet('config'));
  ok('the Model tab button is fully on screen', await ev(()=>{
    /* flex rounding can overhang by 1/64px — round to the CSS pixel */
    const r = $('tabCad').getBoundingClientRect();
    return r.width > 0 && Math.round(r.right) <= window.innerWidth;
  }));
  await page.click('#tabCad');
  ok('…and clicking it opens the Model pane', await ev(()=>$('pCad').classList.contains('act')));
  ok('the Menu button is on screen too', await ev(()=>{
    const r = $('btnAppMenu').getBoundingClientRect();
    return r.width > 0 && r.right <= window.innerWidth;
  }));
  ok('status chips shed their text below 1400px, keeping the dot', await ev(()=>{
    const c = $('chDrive');
    return getComputedStyle(c.lastElementChild).display==='none'
        && getComputedStyle(c.querySelector('.dot')).display!=='none';
  }));
  /* chDrive is the one chip this general rule no longer covers — it became
     a button (UX item 1.5a, 2026-08-15) and keeps a fixed action title
     instead of mirroring its hidden text (main.js's CHIP_IDS, hud.js), so
     the generic "words move into the tooltip" check reads a different
     chip; chDrive's own title is asserted right after. */
  await page.waitForFunction('document.getElementById("chAuto").title.length > 0', {timeout:20000});
  ok('…and the words move into the tooltip', await ev(()=>
    /Auto/.test($('chAuto').title) && /off|on/.test($('chAuto').title)));
  ok('chDrive keeps its fixed action title instead — it is a button now (UX 1.5a)', await ev(()=>
    $('chDrive').title === 'arm / disarm the foot motors (START)'));
  ok('a shed chip still shows its state by colour', await ev(()=>{
    /* chGamepad is warn (virtual pad) at boot — its dot must not be the idle grey */
    const dot = getComputedStyle($('chGamepad').querySelector('.dot')).backgroundColor;
    const idle = getComputedStyle($('chDrive').querySelector('.dot')).backgroundColor;
    return dot !== idle;
  }));
  ok('the version tag hides at this width', await ev(()=>
    getComputedStyle($('verTag')).display==='none'));

  await page.setViewportSize({ width: 1150, height: 780 });
  ok('still nothing clips at 1150', await ev(()=>
    document.documentElement.scrollWidth <= window.innerWidth
    && Math.round($('tabCad').getBoundingClientRect().right) <= window.innerWidth),
    await ev(()=>document.documentElement.scrollWidth+' vs '+window.innerWidth));

  await page.setViewportSize({ width: 1500, height: 950 });
  ok('chip labels and the version tag return on a wide screen', await ev(()=>
    getComputedStyle($('chDrive').lastElementChild).display!=='none'
    && getComputedStyle($('verTag')).display!=='none'));
  await page.setViewportSize({ width: 1280, height: 780 });

  console.log('\n════ the app menu ════');
  await page.click('#btnAppMenu');
  ok('the Menu button opens the app menu', await ev(()=>!$('appMenu').hidden));
  ok('it holds the theme, text-size and save/load controls', await ev(()=>{
    const m = $('appMenu');
    return ['btnTheme','btnScaleDn','uiScaleLbl','btnScaleUp','btnSaveLoad']
      .every(id=>{ const e=$(id); return !!e && m.contains(e); });
  }));
  ok('it opens fully inside the viewport, under the button', await ev(()=>{
    const r = $('appMenu').getBoundingClientRect(), b = $('btnAppMenu').getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth && r.top >= b.bottom;
  }));
  await page.click('#btnScaleUp');
  ok('A+ works from inside the menu and keeps it open', await ev(()=>
    PREFS.uiScale===1.05 && $('uiScaleLbl').textContent==='105%' && !$('appMenu').hidden));
  await ev(()=>applyUiScale(1.0));
  await page.click('#btnTheme');
  ok('the theme toggle works from the menu', await ev(()=>
    document.body.classList.contains('light') && $('btnTheme').textContent==='Dark'));
  await ev(()=>applyTheme('dark'));
  await page.keyboard.press('Escape');
  ok('Esc closes the menu', await ev(()=>$('appMenu').hidden));
  await page.click('#btnAppMenu');
  await page.click('header .brand');
  ok('an outside click closes it', await ev(()=>$('appMenu').hidden));
  await page.click('#btnAppMenu');
  await page.click('#btnSaveLoad');
  ok('Save & load opens its popover and the menu folds away', await ev(()=>{
    const p = document.querySelector('.slpop');
    return !!p && /Export setup/.test(p.textContent) && /Import setup/.test(p.textContent)
        && $('appMenu').hidden;
  }));
  await page.keyboard.press('Escape');
  ok('Esc closes the popover too', await ev(()=>!document.querySelector('.slpop')));
  ok('the popover still works when driven headless, menu shut', await ev(()=>{
    saveLoadPopover();
    const p = document.querySelector('.slpop');
    const okk = !!p && /Export setup/.test(p.textContent);
    saveLoadClose();
    return okk && !document.querySelector('.slpop');
  }));

  console.log('\n════ status is not dressed as an action ════');
  ok('a status chip has no border and no plate', await ev(()=>{
    const s = getComputedStyle($('chDrive'));
    return s.borderTopWidth==='0px' && s.backgroundColor==='rgba(0, 0, 0, 0)';
  }));
  ok('an action button has a visible plate and a border', await ev(()=>{
    const s = getComputedStyle($('btnSetup'));
    return s.backgroundImage.indexOf('linear-gradient') >= 0 && s.borderTopWidth==='1px';
  }));
  ok('so the two read differently', await ev(()=>{
    const c = getComputedStyle($('chDrive')), b = getComputedStyle($('btnSetup'));
    return c.backgroundColor !== b.backgroundColor || c.backgroundImage !== b.backgroundImage;
  }));

  console.log('\n════ the primary action is the R2 blue, amber means warning ════');
  const probe = t => page.evaluate(theme=>{
    applyTheme(theme);
    const mk = css => { const d=document.createElement('div'); d.style.cssText=css; document.body.appendChild(d); return d; };
    const dc = mk('background:var(--cta)'), da = mk('background:var(--am)');
    const prim = document.querySelector('button.b.prim');
    const r = { prim: getComputedStyle(prim).backgroundColor,
                cta:  getComputedStyle(dc).backgroundColor,
                am:   getComputedStyle(da).backgroundColor,
                onCta: getComputedStyle(prim).color };
    dc.remove(); da.remove();
    return r;
  }, t);
  const dark = await probe('dark');
  ok('.prim wears the --cta token in the dark theme', dark.prim===dark.cta, dark.prim+' vs '+dark.cta);
  ok('…which is not amber', dark.prim!==dark.am, dark.prim+' vs '+dark.am);
  /* v1.18.0 (B2 re-skin): the CTA moved from the generic teal to the
     droid's panel blue — dark #3e6fc4, light #2b5aa7, white text on both */
  ok('…and the dark theme CTA is the filled R2 blue', dark.cta==='rgb(62, 111, 196)', dark.cta);
  const light = await probe('light');
  ok('.prim follows --cta in the light theme too', light.prim===light.cta && light.prim!==light.am,
     light.prim+' / cta '+light.cta+' / am '+light.am);
  ok('the light CTA is the deeper panel blue with light text', light.cta==='rgb(43, 90, 167)' && light.onCta==='rgb(255, 255, 255)',
     light.cta+' / '+light.onCta);
  await ev(()=>applyTheme('dark'));
  ok('amber itself is untouched where it means warning', await ev(()=>{
    /* the note style and the sound number still key off --am */
    const d=document.createElement('div'); d.className='note'; d.textContent='x';
    document.body.appendChild(d);
    const col = getComputedStyle(d).borderLeftColor; d.remove();
    const am=document.createElement('div'); am.style.background='var(--am)';
    document.body.appendChild(am);
    const amc = getComputedStyle(am).backgroundColor; am.remove();
    return col === amc;
  }));

  console.log('\n════ the stage pickers (M3) ════');
  /* The BG / environment / model buttons cycled blind; clicking one now
     opens a popover listing every option. The cycle FUNCTIONS live on.
     Real-input clicks stay on the STUDIO stage: swiftshader renders the
     textured environments slowly enough that Playwright's actionability
     checks starve on this 2-core box (the serial-suite lesson again), so
     once Workshop is applied the rest drives the same handlers with
     synthetic events — which is also what they get from a synthetic
     el.click() anywhere else in the app. */
  await ev(()=>{ envSet('studio'); modelSet('droid',{frame:false}); setStageTheme('follow'); });
  await page.click('#btnEnv');
  ok('clicking the environment button opens a picker', await ev(()=>!!$('stagePick')));
  ok('it lists all four environments in cycle order', await ev(()=>{
    const ids=[...document.querySelectorAll('#stagePick .sprow')].map(r=>r.dataset.id);
    return ids.join(',')==='studio,workshop,desert,hangar';
  }));
  ok('…by name, with only the current one ticked', await ev(()=>{
    const rows=[...document.querySelectorAll('#stagePick .sprow')];
    const names=rows.map(r=>r.textContent);
    return document.querySelectorAll('#stagePick .sprow.cur').length===1
        && rows[0].classList.contains('cur') && rows[0].dataset.id==='studio'
        && /Studio/.test(names[0]) && /Workshop/.test(names[1])
        && /Desert flats/.test(names[2]) && /Hangar bay/.test(names[3]);
  }));
  ok('it sits above the button, fully inside the viewport', await ev(()=>{
    const p=$('stagePick').getBoundingClientRect(), b=$('btnEnv').getBoundingClientRect();
    return p.bottom <= b.top && p.left >= 0 && p.right <= window.innerWidth && p.top >= 0;
  }));
  await page.click('#stagePick .sprow[data-id="workshop"]');
  ok('choosing Workshop applies it and closes the picker', await ev(()=>
    ENV.id==='workshop' && !$('stagePick') && $('btnEnv').textContent==='Workshop'));
  ok('reopened, the tick has moved to Workshop', await ev(()=>{
    $('btnEnv').click();
    const cur=document.querySelector('#stagePick .sprow.cur');
    return cur && cur.dataset.id==='workshop';
  }));
  await page.keyboard.press('Escape');
  ok('Esc closes it with no change', await ev(()=>!$('stagePick') && ENV.id==='workshop'));
  await ev(()=>envSet('studio'));                    // back to the fast stage
  ok('a press anywhere else closes it, also with no change', await ev(()=>{
    $('btnEnv').click();
    document.querySelector('header .brand')
      .dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    return !$('stagePick') && ENV.id==='studio';
  }));
  ok('clicking the button again folds its picker away', await ev(()=>{
    $('btnEnv').click(); $('btnEnv').click();
    return !$('stagePick');
  }));

  ok('opening the model picker closes the environment one — one at a time', await ev(()=>{
    $('btnEnv').click(); $('btnModel').click();
    const ids=[...document.querySelectorAll('#stagePick .sprow')].map(r=>r.dataset.id);
    return document.querySelectorAll('#stagePick').length===1
        && ids.join(',')==='droid,frik,mouse,builder';
  }));
  ok('the droid is ticked as what is on the stage', await ev(()=>{
    const cur=document.querySelector('#stagePick .sprow.cur');
    return cur && cur.dataset.id==='droid';
  }));
  ok('choosing the Anzellan head applies and closes', await ev(()=>{
    document.querySelector('#stagePick .sprow[data-id="frik"]').click();
    return PREFS.model==='frik' && !$('stagePick') && $('btnModel').textContent==='Frik head';
  }));
  await ev(()=>$('btnModel').click());
  await page.keyboard.press('Escape');
  ok('Esc leaves the model alone', await ev(()=>PREFS.model==='frik' && !$('stagePick')));
  await ev(()=>modelSet('droid',{frame:false}));

  ok('the BG picker lists auto, dark and light — auto ticked', await ev(()=>{
    $('btnStageBG').click();
    const ids=[...document.querySelectorAll('#stagePick .sprow')].map(r=>r.dataset.id);
    const cur=document.querySelector('#stagePick .sprow.cur');
    return ids.join(',')==='follow,dark,light' && cur && cur.dataset.id==='follow';
  }));
  ok('choosing Light holds the stage light and closes', await ev(()=>{
    document.querySelector('#stagePick .sprow[data-id="light"]').click();
    return PREFS.stageTheme==='light' && !$('stagePick') && $('btnStageBG').textContent==='BG: light';
  }));
  await ev(()=>$('btnStageBG').click());
  await page.keyboard.press('Escape');
  ok('Esc leaves the BG choice alone', await ev(()=>
    PREFS.stageTheme==='light' && !$('stagePick')));
  await ev(()=>{ setStageTheme('follow'); envSet('studio'); });
  ok('the cycle functions still step and relabel the buttons', await ev(()=>{
    envCycle();
    const a = ENV.id==='workshop' && $('btnEnv').textContent==='Workshop';
    envSet('studio');
    cycleStageTheme();
    const b = PREFS.stageTheme==='light' && $('btnStageBG').textContent==='BG: light';
    setStageTheme('follow');
    const c = modelCycle()==='frik' && $('btnModel').textContent==='Frik head';
    modelSet('droid',{frame:false});
    return a && b && c;
  }));

  console.log('\n════ toasts (M5a) ════');
  ok('toast() renders a plate bottom-left over the stage', await ev(()=>{
    toast('hello toast');
    const h=$('toasts'), p=h && h.lastElementChild;
    if(!p) return false;
    const hr=h.getBoundingClientRect(), sr=$('stage').getBoundingClientRect();
    return p.textContent==='hello toast'
        && hr.left >= sr.left && hr.bottom <= sr.bottom
        && (hr.left - sr.left) < sr.width/2;
  }));
  ok('the host never takes the pointer; each plate does', await ev(()=>
    getComputedStyle($('toasts')).pointerEvents==='none'
    && getComputedStyle($('toasts').lastElementChild).pointerEvents==='auto'));
  ok('warn and err colour the edge from the tokens', await ev(()=>{
    const probe=v=>{ const d=document.createElement('i'); d.style.color=v; document.body.appendChild(d);
                     const c=getComputedStyle(d).color; d.remove(); return c; };
    const w=toast('careful','warn'), e=toast('broken','err');
    return getComputedStyle(w).borderLeftColor===probe('var(--am)')
        && getComputedStyle(e).borderLeftColor===probe('var(--rd)');
  }));
  ok('the stack caps at three — the oldest drops', await ev(()=>{
    toast('fourth');
    const texts=[...$('toasts').children].map(c=>c.textContent);
    return texts.length===3 && !texts.includes('hello toast') && texts[2]==='fourth';
  }));
  ok('a toast reads right in body.light — the plate follows the tokens', await ev(()=>{
    applyTheme('light');
    const p = toast('light check');
    const bg = getComputedStyle(p).backgroundColor;   // --sbtnBg, 06-theme-light.css
    applyTheme('dark');
    return bg === 'rgba(255, 255, 255, 0.9)';
  }));
  ok('a click dismisses a plate at once', await ev(()=>{
    /* the stack now holds broken · fourth · light check */
    const p=[...$('toasts').children].find(c=>c.textContent==='fourth');
    p.click();
    return p.classList.contains('out');   // fade starts synchronously — not the 3.5s timer
  }));
  /* the 3.5 s life is WALL clock on purpose (SIM time stalls under load) —
     a bounded waitForFunction on removal, not a blind waitForTimeout */
  await page.waitForFunction(()=>!document.getElementById('toasts'), {timeout:15000});
  ok('the rest auto-dismiss and the empty host leaves the stage', true);

  console.log('\n════ quiet actions answer back (M5a wiring) ════');
  ok('a setup export fires a toast', await ev(()=>{
    setupExport();
    const h=$('toasts');
    return !!h && /Exported R2-setup-.*\.json/.test(h.lastElementChild.textContent);
  }));
  ok('a refused setup import toasts the reason as err', await ev(()=>{
    const r = setupImportText('{"nope":1}', 'junk.json');
    const p = $('toasts').lastElementChild;
    return !r.ok && /Could not load junk\.json/.test(p.textContent)
        && p.classList.contains('err');
  }));
  await ev(()=>{ const h=$('toasts'); if(h) h.remove(); });

  console.log('\n════ the fault chip answers "why?" (M5b) ════');
  await ev(()=>{ lg('warn','test fault line'); SIM.blockUntil = SIM.millis + 1e9; });
  await page.waitForFunction('document.getElementById("chFault").style.display !== "none"', {timeout:20000});
  ok('the lit chip reads as clickable', await ev(()=>
    getComputedStyle($('chFault')).cursor==='pointer'));
  ok('the wrapped lg() keeps feeding the console too', await ev(()=>
    LOG.some(e=>e.k==='warn' && e.s==='test fault line')));
  await page.click('#chFault');
  ok('clicking it opens the popover under the chip', await ev(()=>{
    const p=$('faultPop'); if(!p) return false;
    const r=p.getBoundingClientRect(), c=$('chFault').getBoundingClientRect();
    return r.top>=c.bottom && r.left>=0 && r.right<=window.innerWidth;
  }));
  ok('…listing the warn line with a SIM timestamp', await ev(()=>{
    const rows=[...document.querySelectorAll('#faultPop .fprow')];
    return rows.some(x=>/test fault line/.test(x.textContent)
                     && /\d+\.\d{3} s/.test(x.querySelector('.t').textContent));
  }));
  ok('Advanced off means no Serial pane, so no "open Serial" row', await ev(()=>
    !PREFS.adv && viewGet()==='build' && !viewShows('pCon')
    && !document.querySelector('#faultPop .fpser')));
  await page.keyboard.press('Escape');
  ok('Esc closes it', await ev(()=>!$('faultPop')));
  /* the retired-view shim: 'advanced' = Advanced ON + the Bench workspace */
  await ev(()=>applyView('advanced'));
  ok('applyView("advanced") lands the Bench with the switch on', await ev(()=>
    wsGet()==='bench' && PREFS.adv===true && viewGet()==='advanced'));
  await page.click('#chFault');
  ok('with the console available the popover offers "open Serial"', await ev(()=>
    !!document.querySelector('#faultPop .fpser')));
  await page.click('#faultPop .fpser');
  ok('…which lands on the Serial tab and closes the popover', await ev(()=>
    $('pCon').classList.contains('act') && !$('faultPop')));
  ok('an outside press closes a reopened popover', await ev(()=>{
    $('chFault').click();
    document.querySelector('header .brand')
      .dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    return !$('faultPop');
  }));
  ok('the ring buffer holds the last 12 warn/sys lines only', await ev(()=>{
    for(let i=0;i<15;i++) lg('warn','flood '+i);
    lg('pwm','not for the buffer');
    return FAULTBUF.length===12 && FAULTBUF[11].s==='flood 14'
        && !FAULTBUF.some(e=>e.s==='not for the buffer');
  }));
  await ev(()=>{ SIM.blockUntil=-1; applyView('build'); });
  await page.waitForFunction('document.getElementById("chFault").style.display === "none"', {timeout:20000});
  ok('the chip goes out when the fault clears', true);
  ok('applyView("build") lands Drive but deliberately keeps the Advanced switch', await ev(()=>
    wsGet()==='drive' && PREFS.adv===true && viewGet()==='advanced'));
  await ev(()=>{ PREFS.adv=false; prefsSave(); applyWs(wsGet()); });   // switch back off for the rest

  console.log('\n════ appPrompt() kills the native prompt() (M5c) ════');
  await ev(()=>{ groupCreate('Rename me'); buildCadPane(); });
  /* the group rows live on the Model pane — Drive does not offer it, so
     enter Configure before the real click on the tab */
  await ev(()=>wsSet('config'));
  await page.click('#tabCad');
  /* the REAL rename path: the group row's name in the Model tab */
  await page.click('#cadHost .grprow .cn');
  ok('clicking a group name opens the styled prompt, value loaded', await ev(()=>{
    const w=document.querySelector('.dlgwrap'), i=document.querySelector('.dlginp');
    return !!w && !!i && i.value==='Rename me';
  }));
  ok('the input is focused with the name preselected', await ev(()=>{
    const i=document.querySelector('.dlginp');
    return document.activeElement===i && i.selectionStart===0 && i.selectionEnd===i.value.length;
  }));
  await page.keyboard.type('Front hatches');       // replaces the selection, like the native prompt
  await page.keyboard.down('KeyW');
  ok('a key held inside the dialog never reaches the gamepad mapper', await ev(()=>!INPUT.keys.KeyW));
  await page.keyboard.up('KeyW');
  await ev(()=>{ const i=document.querySelector('.dlginp'); i.value=i.value.replace(/w$/,''); });
  await page.keyboard.press('Enter');
  ok('Enter applies the new name through the real handler', await ev(()=>
    PARTS.groups.some(g=>g.name==='Front hatches') && !document.querySelector('.dlgwrap')));
  ok('…and the rebuilt pane shows it', await ev(()=>
    /Front hatches/.test($('cadHost').textContent)));
  await page.click('#cadHost .grprow .cn');
  await page.keyboard.type('should not stick');
  await page.keyboard.press('Escape');
  ok('Esc cancels — the name stays', await ev(()=>
    PARTS.groups.some(g=>g.name==='Front hatches')
    && !PARTS.groups.some(g=>g.name==='should not stick')
    && !document.querySelector('.dlgwrap')));
  await page.click('#cadHost .grprow .cn');
  await ev(()=>{ document.querySelector('.dlginp').value=''; });
  await page.keyboard.press('Enter');
  ok('an empty name keeps the old one — same contract as prompt()', await ev(()=>
    PARTS.groups.some(g=>g.name==='Front hatches')));
  ok('no native prompt() call survives in the build', await ev(()=>{
    /* every rename path goes through appPrompt now; a stray native prompt
       would hang a headless run, so assert the sources really are clean */
    const srcs=[...document.scripts].map(s=>s.textContent).join('');
    return !/[^a-zA-Z.]prompt\(\s*['"`]/.test(srcs);
  }));
  await ev(()=>{ const g=PARTS.groups.find(x=>x.name==='Front hatches'); if(g) groupDelete(g.id); buildCadPane(); });

  /* ==================================================================
     v1.44.0 — THE CREDITS TRAVEL WITH THE FILE (app/about.js)

     The simulator is one self-contained HTML you hand to another builder
     on a memory stick, so the people running it mostly never see the
     repository. MrBaddeley's permission, Padawan360's BSD-3-Clause notice
     and three.js's MIT line have to be IN the app, not only in a
     CREDITS.md they will never open.
     ================================================================== */
  console.log('\n════ the About box ════');
  ok('the Menu offers it', await ev(()=>{
    const b = $('btnAbout');
    return !!b && !!b.closest('#appMenu') && /Credits/.test(b.textContent);
  }));
  await ev(()=>{ $('btnAbout').click(); });
  await page.waitForFunction('!!document.querySelector(".dlgwrap")');
  const about = await ev(()=>{
    const d = document.querySelector('.dlgwrap'), t = d.textContent;
    return {
      wide: d.querySelector('.dlgcard').classList.contains('about'),
      buttons: [...d.querySelectorAll('.dlgbar button')].map(b=>b.textContent),
      version: t.indexOf(APP_VERSION) >= 0,
      baddeley: /MrBaddeley/.test(t) && /with his permission/.test(t)
                && /does not extend to redistributing/.test(t),
      padawan: /Padawan360/.test(t) && /BSD-3-Clause/.test(t),
      three: /three\.js/.test(t) && /MIT/.test(t),
      menuClosed: $('appMenu').hidden
    };
  });
  ok('it names MrBaddeley, the permission, and its limit', about.baddeley);
  ok('...and the Padawan360 lineage with its BSD-3-Clause notice', about.padawan);
  ok('...and three.js under MIT', about.three);
  ok('...and the version the file actually is', about.version);
  ok('a message with nothing to decide has ONE way out, not an OK and a Cancel',
     about.buttons.length === 1 && /Close/.test(about.buttons[0]), about.buttons.join(' · '));
  ok('opening it folds the menu away behind it', about.menuClosed);
  await ev(()=>{ document.querySelector('.dlgwrap .dlgyes').click(); });
  await page.waitForFunction('!document.querySelector(".dlgwrap")');
  ok('Close closes it', await ev(()=>!document.querySelector('.dlgwrap')));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
