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
  /* WAIT FOR THE HEADER TO HAVE SEEN THIS SIZE.
     What the status cluster sheds is measured by main.js on the UI tick (and
     on `resize`), not decided by a media query, because a media query cannot
     see applyUiScale()'s body zoom. So a read after a viewport or scale
     change has to wait for the app's own answer to be current: main.js
     caches the fit under a key whose first field is exactly
     "<clientWidth>/<zoom>". This waits for that to agree with the live
     values — and fails loudly rather than quietly reading a stale layout. */
  const settled = ()=>page.waitForFunction(()=> typeof HDR_FITKEY === 'string'
    && HDR_FITKEY.split('|')[0] === document.documentElement.clientWidth + '/' + uiZoomFactor(),
    null, {timeout:8000});
  await settled();

  console.log('\n════ nothing clips on a 1280×780 laptop ════');
  ok('the document is no wider than the viewport', await ev(()=>
    document.documentElement.scrollWidth <= window.innerWidth),
    await ev(()=>document.documentElement.scrollWidth+' vs '+window.innerWidth));
  /* four again since v1.60.0 — the servo gauges are a model, not a
     workspace. Still the same question: they are the widest thing in the
     header and a 1280 laptop is the tightest case. */
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
  await settled();
  ok('still nothing clips at 1150', await ev(()=>
    document.documentElement.scrollWidth <= window.innerWidth
    && Math.round($('tabCad').getBoundingClientRect().right) <= window.innerWidth),
    await ev(()=>document.documentElement.scrollWidth+' vs '+window.innerWidth));

  await page.setViewportSize({ width: 1500, height: 950 });
  await settled();
  ok('chip labels and the version tag return on a wide screen', await ev(()=>
    getComputedStyle($('chDrive').lastElementChild).display!=='none'
    && getComputedStyle($('verTag')).display!=='none'));
  await page.setViewportSize({ width: 1280, height: 780 });
  await settled();

  /* ══════════════════════════════════════════════════════════════════════
     THE STATUS CHIPS HAVE TO BE READABLE, AT EVERY SIZE AND EVERY UI SCALE

     Four first-time walkthroughs all stalled in the same place: the droid
     would not move, and the one always-visible statement of why — the
     Drive chip — read `DRIVE O_`. Every chip truncated mid-word at the
     DEFAULT 1440×900/100%, and at 150% two of them showed no characters at
     all, because `text-overflow:ellipsis` let the cells shrink to nothing
     while the only rule that sheds the words (a max-width media query) is
     blind to `body{zoom}` — the media query measures the un-zoomed
     viewport, so at 1.5 it thinks there is 1440px of room when the layout
     has 960.

     So these assertions are all MEASURED GEOMETRY on the rendered spans,
     never stylesheet text: under file:// a linked stylesheet's cssRules
     throws, and a rule-reading assertion would pass on the dist and read
     nothing at all on dev.html.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ the header status chips fit instead of truncating ════');
  await ev(()=>{
    /* what a chip is actually SHOWING: the label spans that are not
       display:none, their text, and whether the box clips them */
    window.__chips = ()=>['chGamepad','chDrive','chAuto','chSpeed','chHP','chLink'].map(id=>{
      const e = document.getElementById(id);
      if(!e) return {id, missing:true};
      const spans = [...e.children].filter(s=>!s.classList.contains('dot'));
      const vis = spans.filter(s=>getComputedStyle(s).display!=='none');
      return {
        id,
        shown: vis.map(s=>s.textContent).join(' ').trim(),
        clipped: vis.some(s=>s.scrollWidth > s.clientWidth + 0.5),
        title: e.title || ''
      };
    });
  });
  /* The tier is chosen on the 0.06 s UI tick, so a read has to wait for the
     sync to have SEEN this width and this zoom — not for an arbitrary
     number of milliseconds. main.js caches the fit under a key whose first
     field is exactly "<clientWidth>/<zoom>", so waiting for that to agree
     with the live values is waiting for the app's own answer to be current,
     and it fails loudly rather than silently reading a stale layout. */
  const chipsAt = async (w,h,scale)=>{
    await page.setViewportSize({ width:w, height:h });
    await page.evaluate(s=>{ applyUiScale(s); }, scale);
    await settled();
    return ev(()=>window.__chips());
  };
  const say = (tag,rows)=>console.log('      '+tag+'  '+rows.map(r=>r.id.replace('ch','')+'="'+r.shown+'"'+(r.clipped?'✂':'')).join('  '));

  for(const [w,h] of [[1440,900],[1024,700],[800,600]]){
    for(const s of [0.9,1.0,1.15,1.5]){
      const rows = await chipsAt(w,h,s);
      say(w+'×'+h+' @'+s, rows);
      ok('no chip label is cut off at '+w+'×'+h+' / '+Math.round(s*100)+'%',
         rows.every(r=>!r.clipped), JSON.stringify(rows.filter(r=>r.clipped).map(r=>r.id)));
      ok('every chip still names itself at '+w+'×'+h+' / '+Math.round(s*100)+'% — words or a tooltip',
         rows.every(r=>r.shown || r.title), JSON.stringify(rows.filter(r=>!r.shown && !r.title).map(r=>r.id)));
    }
  }
  /* THE FEET ARE THE PRIORITY. Armed or not is the difference between a
     droid that drives and one that sits there, and this chip is the only
     always-visible statement of it — every stalled walkthrough was stuck on
     exactly this. So it is the LAST cell to give up its words: wherever any
     chip in the cluster still has text, this one does, and it is still
     saying which state it is in — never a bare name like "FEET". */
  for(const [w,h] of [[1440,900],[1024,700],[800,600]]){
    for(const s of [0.9,1.0,1.15,1.5]){
      const rows = await chipsAt(w,h,s);
      const d = rows.find(r=>r.id==='chDrive');
      const others = rows.filter(r=>r.id!=='chDrive');
      ok('the Drive chip outlasts every other chip\'s words at '+w+'×'+h+' / '+Math.round(s*100)+'%',
         !others.some(r=>r.shown) || /off|armed/i.test(d.shown),
         JSON.stringify({drive:d.shown, others:others.filter(r=>r.shown).map(r=>r.shown)}));
      ok('…and never shows a name without its state at '+w+'×'+h+' / '+Math.round(s*100)+'%',
         !d.shown || /off|armed/i.test(d.shown), JSON.stringify(d));
    }
  }
  /* the default window, the default text size — the one every screenshot and
     every first run is taken at. Words, not dots. */
  const dflt = await chipsAt(1440,900,1.0);
  ok('at the default 1440×900 / 100% the Drive chip says it in words',
     /off|armed/i.test(dflt.find(r=>r.id==='chDrive').shown),
     JSON.stringify(dflt.find(r=>r.id==='chDrive')));
  ok('…and so does every other chip in the cluster',
     dflt.every(r=>r.shown), JSON.stringify(dflt.map(r=>r.shown)));
  await ev(()=>{ FW.isDriveEnabled = true; updateHUD(); });
  await page.waitForTimeout(220);
  ok('…and it changes to the armed word when the feet arm', await ev(()=>
    /armed/i.test(window.__chips().find(r=>r.id==='chDrive').shown)),
    await ev(()=>window.__chips().find(r=>r.id==='chDrive').shown));
  await ev(()=>{ FW.isDriveEnabled = false; updateHUD(); });
  /* every chip that IS down to a dot has to be nameable some other way —
     this is the fallback the shed tiers lean on */
  const dots = await chipsAt(1024,700,1.5);
  say('1024×700 @1.5 titles', dots);
  ok('a chip that is down to its dot still names itself in a tooltip',
     dots.every(r=>r.shown || r.title), JSON.stringify(dots.map(r=>[r.id,r.title])));
  ok('…and the two click-chips, whose title says what a click does, carry their state as an aria-label',
     await ev(()=>['chDrive','chLink'].every(id=>{
       const e = $(id);
       return (e.getAttribute('aria-label')||'') === e.lastElementChild.textContent;
     })),
     await ev(()=>['chDrive','chLink'].map(id=>$(id).getAttribute('aria-label')).join(' | ')));

  /* ══════════════════════════════════════════════════════════════════════
     POPOVERS LAND ON THEIR BUTTON, NOT 360px AWAY

     #stagePick and #faultPop are position:fixed and appended to the body —
     which carries `zoom` — but were positioned from getBoundingClientRect()
     and innerWidth, which are the UN-zoomed viewport. At 1.5 a picker
     anchored on a button at x=600 rendered at x=900. Both numbers are
     measured after the fact here, in the one space that matters: where the
     boxes actually end up on the glass.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ the stage picker and the fault popover follow their button under zoom ════');
  await page.setViewportSize({ width: 1440, height: 900 });
  for(const s of [1.0, 1.5]){
    await page.evaluate(sc=>{ applyUiScale(sc); }, s);
    await page.waitForTimeout(150);
    const sp = await ev(()=>{
      stagePickerClose();
      $('btnEnv').click();
      const p = $('stagePick').getBoundingClientRect(), b = $('btnEnv').getBoundingClientRect();
      const r = {pop:[p.left,p.top,p.right,p.bottom].map(n=>Math.round(n)),
                 btn:[b.left,b.top,b.right,b.bottom].map(n=>Math.round(n)), iw:innerWidth, ih:innerHeight};
      stagePickerClose();
      return r;
    });
    console.log('      @'+s+'  picker '+JSON.stringify(sp.pop)+'  button '+JSON.stringify(sp.btn));
    ok('the stage picker is right-aligned on its button at '+Math.round(s*100)+'%',
       Math.abs(sp.pop[2]-sp.btn[2]) <= 3, JSON.stringify(sp));
    ok('…sits directly above it, not over the stage, at '+Math.round(s*100)+'%',
       Math.abs(sp.pop[3]-sp.btn[1]) <= 14, JSON.stringify(sp));
    ok('…and stays inside the viewport at '+Math.round(s*100)+'%',
       sp.pop[0] >= 0 && sp.pop[2] <= sp.iw, JSON.stringify(sp));
  }
  for(const s of [1.0, 1.5]){
    await page.evaluate(sc=>{ applyUiScale(sc); }, s);
    await page.waitForTimeout(150);
    const fp = await ev(()=>{
      SIM.blockUntil = SIM.millis + 60000;      // a blocking delay() lights #chFault
      updateHUD();
      faultPopClose();
      $('chFault').click();
      const p = $('faultPop').getBoundingClientRect(), c = $('chFault').getBoundingClientRect();
      const r = {pop:[p.left,p.top,p.right,p.bottom].map(n=>Math.round(n)),
                 chip:[c.left,c.top,c.right,c.bottom].map(n=>Math.round(n)), iw:innerWidth};
      faultPopClose();
      SIM.blockUntil = 0; updateHUD();
      return r;
    });
    console.log('      @'+s+'  faultPop '+JSON.stringify(fp.pop)+'  chip '+JSON.stringify(fp.chip));
    ok('the fault popover hangs off the fault chip at '+Math.round(s*100)+'%',
       Math.abs(fp.pop[1]-fp.chip[3]) <= 14, JSON.stringify(fp));
    ok('…starts at the chip\'s left edge, not a third of a screen away, at '+Math.round(s*100)+'%',
       Math.abs(fp.pop[0]-fp.chip[0]) <= 26, JSON.stringify(fp));
    ok('…and stays inside the viewport at '+Math.round(s*100)+'%',
       fp.pop[0] >= 0 && fp.pop[2] <= fp.iw, JSON.stringify(fp));
  }
  await ev(()=>applyUiScale(1.0));
  await page.setViewportSize({ width: 1280, height: 780 });
  await settled();

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
  /* v1.45.0 — the frame boots LIGHT now (Mike: "Default to light mode"), so
     the first press of this button goes light → dark rather than the other
     way. What the assertion is actually about is the BUTTON: it swaps the
     theme and renames itself to the one you would go to next. So it is
     checked in both directions, from wherever the app happened to start,
     which is also what stops it silently depending on the default again. */
  const was = await ev(()=>({theme:PREFS.theme, label:$('btnTheme').textContent}));
  ok('the button offers the theme you are NOT in', was.label===(was.theme==='light'?'Dark':'Light'),
     was.theme+' → "'+was.label+'"');
  await page.click('#btnTheme');
  const flipped = await ev(()=>({theme:PREFS.theme, light:document.body.classList.contains('light'),
                                 label:$('btnTheme').textContent}));
  ok('the theme toggle works from the menu', flipped.theme!==was.theme
     && flipped.light===(flipped.theme==='light')
     && flipped.label===(flipped.theme==='light'?'Dark':'Light'), JSON.stringify(flipped));
  await page.click('#btnTheme');
  ok('...and back again, from the same button', await page.evaluate(t=>
    PREFS.theme===t && document.body.classList.contains('light')===(t==='light'), was.theme));
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
        && ids.join(',')==='droid,frik,mouse,builder,servos';
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


  console.log('\n════ the builder’s manual — one URL, four doors (v1.57.0) ════');
  /* Mike: "make the manual really prominent on the sim". Four places open it,
     and the thing worth pinning is not that the buttons exist but that all
     four go through the SAME constant: four hardcoded copies of a release URL
     is four things to forget when the repository moves, and the one that gets
     forgotten is always the one somebody actually clicks. */
  const man = await ev(()=>{
    const got = {url: (typeof MANUAL_URL === 'string') ? MANUAL_URL : ''};
    got.https   = /^https:\/\/github\.com\//.test(got.url);
    got.release = /\/releases\/latest\/download\//.test(got.url);
    got.file    = got.url.endsWith('R2D2-Simulator-Manual.html');

    /* door 1 — the header, beside ? */
    const hdr = $('btnManual');
    got.header = !!hdr;
    got.inHeader = !!(hdr && hdr.closest('header'));
    got.byTheQuestionMark = !!(hdr && hdr.nextElementSibling && hdr.nextElementSibling.id === 'btnKbd');

    /* door 2 — the setup screen's HEAD, so it is on every step and not just one */
    const stp = $('btnManualStp');
    got.setup = !!stp;
    got.setupInHead = !!(stp && stp.closest('.stphead'));
    got.setupNotAStep = !!(stp && !stp.closest('#startupBody'));

    /* door 3 — the Learn tab */
    document.querySelector('#tabs button[data-p="pLearn"]').click();
    buildTutor();
    got.learn = !!$('btnManualLearn');
    got.learnAboveLessons = (()=>{
      const host = $('tutorHost'), b = $('btnManualLearn');
      if(!host || !b) return false;
      const lessons = host.textContent.indexOf('Lessons');
      return lessons > host.textContent.indexOf('manual');
    })();

    /* door 4 — the ? / Controls panel */
    document.querySelector('#tabs button[data-p="pHelp"]').click();
    got.help = !!$('btnManualHelp');
    got.helpFirst = !!(function(){
      const p = $('pHelp'); if(!p) return false;
      return p.querySelector('.sect') === $('secManual');
    })();

    /* every one of them says the same thing about the same document */
    got.labels = ['btnManual','btnManualStp','btnManualLearn','btnManualHelp']
      .map(id=>{ const b=$(id); return b ? /manual/i.test(b.textContent) : false; });
    return got;
  });
  ok('there is ONE manual URL, and it is the release download',
     man.https && man.release && man.file, man.url);
  ok('door 1 — a Manual button in the header, beside the ?',
     man.header && man.inHeader && man.byTheQuestionMark, JSON.stringify(man));
  ok('door 2 — on the setup screen’s head, so every step has it, not just one',
     man.setup && man.setupInHead && man.setupNotAStep);
  ok('door 3 — in the Learn tab, above the lessons', man.learn && man.learnAboveLessons);
  ok('door 4 — first thing in the ? panel', man.help && man.helpFirst);
  ok('all four say "manual"', man.labels.every(Boolean), JSON.stringify(man.labels));

  /* the kiosk. The header is display:none in sim only, but this file's
     standing rule is guard the FUNCTION, not the button — a public terminal
     at a con must not have a door out to a browser tab, however it is
     reached. */
  const manKiosk = await ev(()=>{
    let opened = 0;
    const real = window.open;
    window.open = () => { opened++; return null; };
    kioskEnter('');
    const refused = manualOpen();
    const duringKiosk = opened;
    /* kioskExit() is async and puts a confirm dialog up; kioskLeave() is the
       half that actually leaves, which is what this assertion is about */
    kioskLeave();
    const allowed = manualOpen();
    window.open = real;
    return {refused, duringKiosk, allowed, after: opened, off: !kioskOn()};
  });
  ok('manualOpen() refuses while sim only is on, and opens nothing',
     manKiosk.refused === false && manKiosk.duringKiosk === 0, JSON.stringify(manKiosk));
  ok('…and works again once you leave it',
     manKiosk.off && manKiosk.allowed === true && manKiosk.after === 1, JSON.stringify(manKiosk));
  /* The header is display:none in sim only, so every box in the status
     cluster measures ZERO — which reads as "nothing is clipped" and would
     re-fit the whole cluster onto the widest tier. Arm the feet while it is
     hidden, so the words change and a re-fit really is attempted with
     nothing to measure, then come back out. */
  await ev(()=>kioskEnter(''));
  /* arm the feet WHILE it is hidden: the words change, so a re-fit is
     genuinely attempted against boxes that all measure zero */
  await page.waitForTimeout(200);
  await ev(()=>{ FW.isDriveEnabled = true; });
  await page.waitForTimeout(200);
  /* …and come back out without touching the words again, so nothing but the
     header reappearing can be what triggers the re-measure */
  await ev(()=>kioskLeave());
  await settled();
  await page.waitForTimeout(200);
  ok('the status cluster re-fits on the way out of sim only, rather than keeping the tier it "fitted" while invisible',
     await ev(()=>window.__chips().every(r=>!r.clipped)),
     await ev(()=>JSON.stringify(window.__chips().map(r=>[r.id,r.shown,r.clipped]))));
  await ev(()=>{ FW.isDriveEnabled = false; });
  await ev(()=>{ document.querySelector('#tabs button[data-p="pHelp"]').click(); });

  /* ══════════════════════════════════════════════════════════════════════
     ONE MARK, ONE MEANING (v1.71.1)
     A walkthrough read the app menu as SIM ONLY_, CREDITS_, SAVE & LOAD_ and
     could not tell an ellipsis from a truncation — which matters because the
     chrome truncates in the same face.

     The glyph is NOT missing. IBM Plex Mono carries U+2026, document.fonts
     .check() agrees, and the character measures the mono 0.6em advance
     rather than a fallback's — so no font swap fixes anything. What is
     missing is PIXELS: at the 10px tracked caps these labels are set in, the
     ellipsis' three dots are ~1.7px apart and antialias into a single 6×1px
     bar — the identical box `_` occupies, and the identical box
     text-overflow:ellipsis paints when a label really is cut off.

     Two facts, one mark. So the mark belongs to the fact the app cannot
     spell any other way — truncation, which CSS draws and no label can opt
     out of — and no label prints a literal one. The first assertion is the
     premise, measured off the button's own computed font: if type ever grows
     enough for the dots to resolve, it fails and the rule is worth revisiting.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ an ellipsis and a truncation are one mark, so only truncation may use it ════');
  const ink = await ev(async ()=>{
    await document.fonts.ready;
    const cs = getComputedStyle($('btnKiosk'));
    const W=64, H=48, c=document.createElement('canvas');
    c.width=W; c.height=H;
    const x=c.getContext('2d');
    x.font = cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
    /* the INK box, not the advance box: how many separate marks the glyph
       actually leaves on the pixel grid, and how tall they are */
    const box = ch=>{
      x.clearRect(0,0,W,H); x.fillStyle='#000'; x.textBaseline='alphabetic';
      x.fillText(ch, 8, 32);
      const d = x.getImageData(0,0,W,H).data, col=[], row=[];
      for(let px=0;px<W;px++){ let a=0; for(let y=0;y<H;y++) a=Math.max(a,d[(y*W+px)*4+3]); col.push(a); }
      for(let y=0;y<H;y++){ let a=0; for(let px=0;px<W;px++) a=Math.max(a,d[(y*W+px)*4+3]); row.push(a); }
      let runs=0, on=false;
      col.forEach(a=>{ if(a>32){ if(!on){ runs++; on=true; } } else on=false; });
      const ys=row.map((a,i)=>a>32?i:-1).filter(i=>i>=0), xs=col.map((a,i)=>a>32?i:-1).filter(i=>i>=0);
      return {runs, h: ys.length?ys[ys.length-1]-ys[0]+1:0, w: xs.length?xs[xs.length-1]-xs[0]+1:0,
              top: ys[0], sized: cs.fontSize};
    };
    return {font:x.font, plex: document.fonts.check(cs.fontSize+' "IBM Plex Mono"','…'),
            ell: box('…'), us: box('_'), M: box('M')};
  });
  ok('the mono face HAS the ellipsis — this was never a missing glyph',
     ink.plex && ink.font.indexOf('IBM Plex Mono') >= 0, JSON.stringify({plex:ink.plex, font:ink.font}));
  ok('…but at label size it draws one bar, not three dots — the same box "_" fills',
     ink.M.h >= 5 && ink.ell.runs < 3 && ink.ell.h <= 2
     && ink.ell.h === ink.us.h && ink.ell.w === ink.us.w && ink.ell.runs === ink.us.runs,
     JSON.stringify(ink));
  ok('so no chrome label prints a literal ellipsis — the mark means "cut off" and nothing else',
     await ev(()=>{
       const bad = [...document.querySelectorAll('header .hbtn, #appMenu .hbtn, #appMenu .amlbl, .smbtn, .wsbtn, .sbtn')]
         .filter(e=>e.textContent.indexOf('…') >= 0)
         .map(e=>(e.id||e.className)+': '+JSON.stringify(e.textContent));
       window.__ellip = bad;
       return bad.length === 0;
     }), await ev(()=>JSON.stringify(window.__ellip)));

  /* ══════════════════════════════════════════════════════════════════════
     ONE KEYBOARD LEGEND (v1.71.1)
     #padside printed its own key → control list beside the "?" card's
     (app/shortcuts.js KBD_COLS). v1.71.0 made the card authoritative — it
     gained the arming fact and rewrote its driving rows — and this static
     copy was not rewritten with it, so the app taught two different things
     depending on which one you happened to read. There is no mechanism that
     could have kept a hand-written list in body.html in step with a table in
     a JS file, which is why the answer is one legend and a door, not two
     legends that agree today.
     ══════════════════════════════════════════════════════════════════════ */
  console.log('\n════ one keyboard legend, and a door to it ════');
  await ev(()=>wsSet('drive'));
  await page.waitForTimeout(60);
  ok('the pad strip prints no second key legend', await ev(()=>{
    const p = $('padside');
    return !!p && p.querySelectorAll('kbd').length === 0 && p.querySelectorAll('.kbrow').length === 0;
  }), await ev(()=>{ const p=$('padside'); return p ? p.querySelectorAll('kbd').length+' <kbd>, '
     +p.querySelectorAll('.kbrow').length+' rows' : 'no #padside'; }));
  ok('…in fact the closed app holds no key caps at all — there is one legend, and it is the card',
     await ev(()=>!$('kbdHelp') && document.querySelectorAll('kbd').length === 0),
     await ev(()=>document.querySelectorAll('kbd').length+' <kbd> in the document'));
  ok('…and the strip keeps a visible door to it where the list was', await ev(()=>{
    const b = $('btnPadKbd'), p = $('padside');
    if(!b || !p || !p.contains(b)) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none';
  }));
  await page.click('#btnPadKbd');
  ok('…which opens the SAME card the header "?" opens, through kbdHelpToggle()', await ev(()=>
    !!$('kbdHelp') && !!document.querySelector('#kbdHelp .kovcard')));
  ok('…the one that carries the arming fact the old list left out', await ev(()=>{
    const t = $('kbdHelp').textContent;
    return /boot DISARMED/.test(t) && /HOLD it to arm the feet/.test(t)
        && /drive \+ turn, once armed/.test(t);
  }));
  await page.keyboard.press('Escape');
  ok('…and Esc folds it away again', await ev(()=>!$('kbdHelp')));
  /* the strip's door is the ONLY one in sim only — the header, and its "?",
     are display:none there, and a public terminal is exactly where nobody
     knows to press a key they were never told about */
  await ev(()=>kioskEnter(''));
  await page.waitForTimeout(150);
  ok('the door survives sim only, where the header "?" does not', await ev(()=>{
    const hidden = $('btnKbd').getBoundingClientRect().width === 0;
    const b = $('btnPadKbd').getBoundingClientRect();
    return hidden && b.width > 0 && b.height > 0;
  }));
  await page.click('#btnPadKbd');
  ok('…and still opens the card there', await ev(()=>!!document.querySelector('#kbdHelp .kovcard')));
  await page.keyboard.press('Escape');
  await ev(()=>kioskLeave());
  await settled();

  ok('no page errors', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
