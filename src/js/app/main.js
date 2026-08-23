'use strict';
let camIdx=0;
const CAMS=[['3/4',Math.PI-0.62,1.15,2.25],['Front',Math.PI,1.22,2.1],['Side',Math.PI/2,1.22,2.3],['Dome',Math.PI-0.5,1.30,1.1],['Above',Math.PI-0.4,0.42,3.0]];
$('btnCam').addEventListener('click',e=>{
  camIdx=(camIdx+1)%CAMS.length;
  const [,t,p,d]=CAMS[camIdx];
  CAM.theta=t; CAM.phi=p; CAM.dist=d;
  e.target.textContent=CAMS[(camIdx+1)%CAMS.length][0];
});

/* =====================================================================
   MAIN LOOP
   ===================================================================== */
let acc=0, lastT=0, hzAcc=0, hzTicks=0, uiAcc=0;
function frame(now){
  requestAnimationFrame(frame);
  if(!lastT){ lastT=now; return; }
  let dt=(now-lastT)/1000; lastT=now;
  dt=Math.min(dt,0.1);

  pollInput();
  /* the puppet rig reads the raw pad and writes the servo targets BEFORE
     the sketch runs — the sketch itself is gated inside the XB accessors */
  if(typeof puppetTick === 'function') puppetTick(dt*1000);

  const period = 1000/clamp(CFG.loopHz,20,2000);
  acc += dt*1000;
  let guard=0;
  while(acc>=period && guard<400){
    SIM.millis += period;
    // a blocking delay() in the sketch means loop() simply does not run
    if(SIM.millis >= SIM.blockUntil) fwLoop();
    /* THE SEQUENCE CLOCK, and it is not only the Maestro's (v1.39.3).
       Mike: "pressing play on the sequencer doesnt appear to do anything."
       It did nothing because this line read `if(PROFILE.hasMaestro)`, which
       was true when only a Pololu board could hold a routine. v1.27.0 opened
       the desk to PCA9685 builds — `buildCanSequence()`, "every build" — and
       the door opened while the clock behind it stayed shut: Play set
       MAESTRO.slot.edit and nothing ever stepped it. Same for the Frik head
       animation, which cad/ui.js parks in the same slot table.
       maestroStep() itself is profile-agnostic — it walks whatever slots
       exist — so on a sketch with no Maestro it costs one empty for-in. */
    maestroStep(period/1000);
    acc-=period; guard++; hzTicks++;
  }
  /* An RC channel bound straight to an output (input/rc.js, advanced mode)
     lands HERE — after the sketch's loop() so it genuinely overrides what
     the firmware just commanded, and before the watchdog so a held stick
     keeps the Sabertooth packet clock alive instead of timing out mid-hold.
     Does nothing at all unless the build's controller answer is RC and a
     channel is bound. */
  if(typeof rcDirectApply === 'function') rcDirectApply();
  motorWatchdog();
  /* THE FEET, WHEN NOTHING HAS BEEN CHOSEN TO DRIVE THEM (v1.70.0).
     Q7 has a third answer now — "Not decided yet" — and this is the seam
     where it costs something: the sketch, an RC channel bound straight to an
     output and the Polar Mouse have all had their say by this line, so one
     call here covers every source instead of one per source. It clamps the
     foot commands to nothing and puts the reason on screen with a door back
     to the question; see buildFootGate() in config/hardware.js for why it
     belongs here and not inside the profiles. On any build that HAS chosen a
     foot controller — which is every build by default — it is one string
     compare and returns. */
  if(typeof buildFootGate === 'function') buildFootGate();
  /* the bench engine — the sim's model of what the PCA9685s are doing.
     Only steps when the Bench is open or a board is connected, so a
     session that never goes near it pays nothing (hwWanted()). */
  if(typeof hwTick === "function") hwTick();
  hzAcc+=dt;
  if(hzAcc>=0.5){ SIM.hz=Math.round(hzTicks/hzAcc); hzTicks=0; hzAcc=0; }

  syncActuators(dt);
  applyToModel(dt);
  if(typeof mouseStep==='function') mouseStep(dt);
  if(typeof TRACK!=='undefined' && TRACK.on) trackTick(dt);
  if(typeof TUTOR!=='undefined' && TUTOR.on) tutorTick(dt);
  if(CAD.loaded){ applyCadActuators(); updateCadTransform(); }
  updateCamera();
  /* SIM.draw is false only under ?norender — see util.js. render() is also
     what refreshes the world matrices, so do that either way or picking and
     the camera framing start reading last frame's positions. */
  /* v1.60.0 — the servo gauges cover the stage with a flat screen and the
     canvas is display:none under them, so rendering is drawing a 3D scene
     nobody can see. updateMatrixWorld still runs, for the same reason it
     does under ?norender: render() is also what refreshes the world
     matrices, and picking and framing read them. */
  if(SIM.draw && !(typeof SV !== 'undefined' && SV.shown)) renderer.render(scene,camera);
  else scene.updateMatrixWorld(true);

  /* THE GAUGES ARE THE PICTURE, NOT A READOUT  (v1.62.0)
     v1.60.0 put this on the 0.06 s UI tick beside the Outputs table, calling
     it "a readout, not a render". That was true of v1.59.0's side panel and
     stopped being true the moment the gauges BECAME the model: sixteen
     needle positions a second is visibly stepped, and v1.57.0's 3D rack —
     the thing they replaced — drew at the full frame rate. So it moves here,
     next to renderer.render(), because that is what it is now standing in
     for. It costs at most 128 attribute writes, it is gated on SV.shown
     inside svTick(), and while it IS shown the renderer above is skipped
     entirely — so this is the cheapest frame the app ever draws. */
  if(typeof svTick==='function') svTick();

  uiAcc+=dt;
  if(uiAcc>=0.06){ uiAcc=0; updateHUD(); updatePad(); updateOutputs(); renderConsole(); syncChipTitles(); }
}

/* =====================================================================
   STAGE PICKERS (v1.15.0, review F7 / M3)

   The three cycling stage buttons — BG, environment, model — were slot
   machines: the only way to discover the options was to click through
   them, changing the stage each time. Clicking one now opens a small
   popover ABOVE the button naming every option, current one ticked;
   choosing applies it (envSet / modelSet / setStageTheme) and closes.
   Esc or a press anywhere else closes without changing anything, and
   only one picker is open at a time.

   envCycle() / modelCycle() / cycleStageTheme() survive untouched —
   tests and other code call them directly, and the button label still
   names the current value exactly as before.

   The popover is built on demand and REMOVED on close, so a closed
   picker cannot sit over the 3D stage's pointer handling. Dismiss
   listeners go on the DOCUMENT, never the canvas: bindCamera()'s
   setPointerCapture retargets pointer events to the stage div, so a
   canvas listener would never hear them (HANDOVER §7). Esc is handled
   on document CAPTURE with stopPropagation, same containment as the
   app dialog, so it cannot fall through to the wizard or the mapper.
   ===================================================================== */
let SPICK = null;
function stagePickerClose(){
  if(!SPICK) return;
  document.removeEventListener('pointerdown', SPICK.onDown, true);
  document.removeEventListener('keydown', SPICK.onKey, true);
  SPICK.pop.remove();
  const b = $(SPICK.btnId); if(b) b.classList.remove('picking');
  SPICK = null;
}
function stagePicker(btnId, items, cur, pick){
  if(SPICK && SPICK.btnId === btnId){ stagePickerClose(); return; }   // same button = toggle shut
  stagePickerClose();                                                 // one open at a time
  const b = $(btnId); if(!b) return;
  const pop = el('div'); pop.id = 'stagePick';
  items.forEach(it=>{
    const row = el('button','sprow'+(it.id===cur ? ' cur' : ''));
    row.dataset.id = it.id;
    if(it.hint) row.title = it.hint;
    row.appendChild(el('span','spmark','✓'));
    row.appendChild(el('span',null,it.label));
    row.addEventListener('click',e=>{ e.stopPropagation(); stagePickerClose(); pick(it.id); });
    pop.appendChild(row);
  });
  document.body.appendChild(pop);
  /* anchor above the button, right edges aligned, clamped to the viewport;
     stageTools sits at the bottom of the stage so above is the open side */
  /* THE ANCHOR IS IN VIEWPORT px, THE `left`/`top` WE WRITE ARE NOT.
     #stagePick is position:fixed but it hangs off the body, which carries
     applyUiScale()'s zoom, so a length set on it is a LAYOUT px and is
     multiplied by the zoom on its way to the glass, while
     getBoundingClientRect() and innerWidth are already on it. At 150% that
     put the picker 267px right of its button and 200px down, over the
     stage. Divide the anchor back into layout px — pop.offsetWidth/Height
     are already layout px — and the whole calculation, viewport clamp
     included, is in one unit system. */
  const z = (typeof uiZoomFactor === 'function') ? uiZoomFactor() : 1;
  const r = b.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(innerWidth/z - pop.offsetWidth - 8, r.right/z - pop.offsetWidth)) + 'px';
  const top = r.top/z - 6 - pop.offsetHeight;
  pop.style.top = (top >= 8 ? top : r.bottom/z + 6) + 'px';
  const onDown = e=>{
    const t = e.target;
    if(t && t.closest && (t.closest('#stagePick') || t.closest('#'+btnId))) return;
    stagePickerClose();
  };
  const onKey = e=>{
    if(e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    stagePickerClose();
  };
  /* the opening click has already finished (click fires after pointerup),
     so this gesture cannot re-enter the handler and shut what it opened */
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  SPICK = { btnId, pop, onDown, onKey };
  b.classList.add('picking');
}

/* clicking a chrome button must not steal the keyboard from the droid */
document.addEventListener('click', e=>{
  const b = e.target.closest && e.target.closest('#stageTools button, header button, #stripmode button, #appMenu button');
  if(b) b.blur();
});

/* =====================================================================
   THE HEADER STATUS CLUSTER HAS TO BE READABLE — AT EVERY SIZE AND SCALE

   Four first-time walkthroughs stalled in the same place: the droid would
   not move, and the one always-visible statement of WHY read `DRIVE O_`.
   At the default 1440×900/100% all six chips truncated mid-word; at 150%
   two of them showed no characters at all. Two separate causes, both here:

     · `text-overflow:ellipsis` (02-layout.css) let the cells shrink to
       nothing rather than the cluster giving up its words. An ellipsis is
       the right answer for prose; for a six-word instrument cluster it
       turns every reading into a guess.
     · the only rule that DID shed the words was a `max-width` media query,
       and a media query cannot see `body{zoom}`. At 150% it still believed
       there was 1440px of room when the layout had 960.

   So the cluster now has TIERS — full words, compact words, dot only — and
   which one is showing is decided by MEASURING the rendered boxes and
   stepping down until nothing is clipped, not by guessing a breakpoint.
   That is inherently zoom-correct, because the measurement happens inside
   the zoomed subtree, and it re-measures when the words change length as
   well as when the window does.

   The compact label rides in a span IN FRONT of the state words, never in
   place of them: a chip's LAST span stays exactly the state text that
   hud.js, maestro/hw-ui.js and the suites all read.
   ===================================================================== */
/* chDrive is deliberately left out of the TITLE sync (2026-08-15, UX 1.5a
   — see hud.js): it is a button now and carries its own fixed action title
   ("arm / disarm the foot motors (START)") instead of a state mirror.
   Syncing it here on the same cadence would clobber that title back to the
   visible text every tick. #chLink is out for the same reason — hw-ui.js
   gives it a title that says what a click does. Both still get their state
   as an aria-label below, and #chDrive keeps its words a tier longer than
   anything else, because feet-armed-or-not is the state a first-time user
   cannot get past. */
const CHIP_IDS  = ['chFault','chGamepad','chAuto','chSpeed','chHP'];
const HDR_CHIPS = ['chFault','chGamepad','chDrive','chAuto','chSpeed','chHP','chLink'];

/* The compact form of every state word the cluster can carry. Derived from
   the words a chip ALREADY shows rather than written next to each of them,
   because one of the seven cells (#chLink) is painted by maestro/hw-ui.js —
   this way a chip written by another module gets a compact label for free,
   and there is one table to read instead of three. Where a label has to
   lose something it loses the NAME, never the state word: `Spd 1 · 90`
   becomes `SPD 1`, but `Drive off` becomes `FEET OFF`. */
const CHIP_AB = [
  [/^Virtual pad$/i,  'PAD'],
  [/^Pad\b/i,         'PAD'],
  [/^Disconnected/i,  'NO PAD'],
  [/^Drive armed$/i,  'FEET ARMED'],
  [/^Drive off$/i,    'FEET OFF'],
  [/^Auto on$/i,      'AUTO ON'],
  [/^Auto off$/i,     'AUTO'],
  [/^Spd\s*(\d)/i,    'SPD $1'],
  [/^HP on$/i,        'HP ON'],
  [/^HP off$/i,       'HP OFF'],
  [/^No board$/i,     'NO BOARD'],
  [/^Board linked$/i, 'LINKED'],
  [/^Monitor only$/i, 'MONITOR'],
  [/^LOOP BLOCKED/i,  'BLOCKED'],
  [/^S\/T TIMEOUT/i,  'TIMEOUT']
];
function chipAb(text){
  for(const pair of CHIP_AB){
    const m = text.match(pair[0]);
    if(m) return pair[1].replace('$1', m[1] || '');
  }
  return text;
}

/* the tiers, widest first — see 02-layout.css for what each one hides */
/* v1.75.0 — 'hdrjob' is a tier ABOVE hdrshort that sheds exactly one thing:
   the word on the job wizard's new header button. A button added in 2026
   must not cost the status chips the labels they have always had at a
   normal window size, so the newcomer gives up its word first and the
   ladder only starts abbreviating the chips once that has not been enough. */
const HDR_TIERS = ['', 'hdrjob', 'hdrshort', 'hdrdots', 'hdrtiny', 'hdrbare'];
let HDR_FITKEY = '';

/* is any label the cluster is currently SHOWING cut off? The spans carry
   overflow:hidden, so a clipped one reports scrollWidth > clientWidth —
   measured geometry, in the zoomed subtree, which is the only reading that
   survives both a window resize and a ui-scale change. */
function hdrChipsClipped(){
  for(const id of HDR_CHIPS){
    const e = $(id); if(!e || e.style.display === 'none') continue;
    for(const s of e.children){
      if(s.classList.contains('dot')) continue;
      if(getComputedStyle(s).display === 'none') continue;
      if(s.scrollWidth > s.clientWidth + 0.5) return true;
    }
  }
  return false;
}
function syncHeaderFit(){
  const b = document.body;
  for(const tier of HDR_TIERS){
    b.classList.remove('hdrjob','hdrshort','hdrdots','hdrtiny','hdrbare');
    if(tier) b.classList.add(tier);
    if(!hdrChipsClipped()) return;
  }
}

function syncChipTitles(){
  /* the fit is only re-measured when something that can change the answer
     has changed: the viewport, the ui scale, or the words themselves. Every
     other tick this is seven string compares. */
  let key = document.documentElement.clientWidth + '/' + uiZoomFactor();
  for(const id of HDR_CHIPS){
    const e = $(id); if(!e || !e.lastElementChild) continue;
    const t = e.lastElementChild.textContent;
    key += '|' + (e.style.display === 'none' ? '-' : t);
    let ab = e.querySelector('.chipab');
    if(!ab){ ab = el('span','chipab'); e.insertBefore(ab, e.lastElementChild); }
    const s = chipAb(t);
    if(ab.textContent !== s) ab.textContent = s;
    /* the tightest reading of the one chip that keeps its words longest:
       the state word with the name stripped off it entirely. Only #chDrive
       carries this — it is the chip a stuck user is looking for, and 20px
       of "OFF" is the difference between a readable header and six
       anonymous dots on a small screen at a large text size. */
    if(id === 'chDrive'){
      let st = e.querySelector('.chipst');
      if(!st){ st = el('span','chipst'); e.insertBefore(st, ab); }
      const w = /armed/i.test(t) ? 'ARMED' : 'OFF';
      if(st.textContent !== w) st.textContent = w;
    }
    if(CHIP_IDS.indexOf(id) >= 0 && e.title !== t) e.title = t;
    /* a chip down to its dot has nothing but the tooltip left, and the two
       chips whose title says what a CLICK does would otherwise have nothing
       at all naming their state */
    if(e.getAttribute('aria-label') !== t) e.setAttribute('aria-label', t);
  }
  /* sim-only mode hides the whole header (10-kiosk.css), and every box in it
     then measures zero — which reads as "nothing is clipped" and would leave
     the cluster parked on the widest tier when the header comes back. So the
     fit is not measured while it is not rendered, and the key is poisoned so
     that returning always re-measures. */
  const hdr = document.querySelector('header');
  if(!hdr || hdr.offsetParent === null){ HDR_FITKEY = 'hidden'; return; }
  if(key !== HDR_FITKEY){ HDR_FITKEY = key; syncHeaderFit(); }
}
/* the UI tick is 0.06 s, which is a visible lag on a window drag and a race
   for anything that resizes and reads in the same breath */
window.addEventListener('resize', syncChipTitles);

/* ---- boot ---- */
window.addEventListener('load',()=>{
  prefsLoad();
  if(typeof blkPrefsRestore==='function') blkPrefsRestore();
  if(typeof pupPrefsRestore==='function') pupPrefsRestore();
  /* the RC channel map is parsed before PREFS exists (manifest order), so
     it comes back here rather than at the top of input/rc.js */
  if(typeof rcPrefsRestore==='function') rcPrefsRestore();
  /* imported sketches come back as their own firmwares BEFORE loadProfile
     below reads the build's answer — otherwise a droid configured to run
     one boots into a firmware that does not exist yet */
  if(typeof sketchRestore==='function') sketchRestore();
  /* the servo channel table — names, measured endpoints, part mapping and
     the sequences on top of them — comes back BEFORE anything can generate
     a starter over it (maestro/servo-store.js, v1.43.0) */
  if(typeof servoStoreLoad==='function') servoStoreLoad();
  /* the board's own chip in the header bezel (maestro/hw-ui.js) */
  if(typeof linkChipInit==='function') linkChipInit();
  if($('verTag')) $('verTag').textContent = 'v'+APP_VERSION;
  sbankBindUI(); sbankInit();
  /* the AstroPixels layer, before the first frame: apxInit() reads the
     build's dome-lighting answer and the remembered sketch, sizes every
     pixel grid and runs the boot banner. The 3D rig itself is built lazily
     on the first sync, because it needs the dome that initScene() is about
     to make. (lights/commands.js) */
  if(typeof apxInit === 'function') apxInit();
  initScene();
  applyTheme(PREFS.theme);
  /* the build config decides which sketch runs — a returning user gets the
     droid they configured, a new one gets the default until the wizard says
     otherwise */
  /* a build can name a firmware that is gone — a sketch forgotten, or one
     that no longer transpiles. Fall back rather than boot into nothing. */
  let bootFw = buildConfigured() ? buildGet().firmware : 'mod2026';
  if(!PROFILES[bootFw]){
    lg('warn','the configured firmware "'+bootFw+'" is not available — falling back');
    bootFw = (typeof firmwareRecommend==='function') ? firmwareRecommend().id : 'mod2026';
  }
  loadProfile(bootFw);
  buildFwSelector();
  syncFollowBtn();

  $('btnTheme').addEventListener('click',()=>applyTheme(PREFS.theme==='light'?'dark':'light'));
  /* the three cycling buttons open pickers now — the cycle functions live
     on, called directly by tests and anything else that wants the old step */
  $('btnStageBG').addEventListener('click',()=>stagePicker('btnStageBG', stageBGOptions(), stageBGGet(), setStageTheme));
  $('btnEnv').addEventListener('click',()=>stagePicker('btnEnv', envOptions(), envGet(), envSet));
  $('btnTutor').addEventListener('click',()=>setTutor(!TUTOR.on));
  $('btnTrack').addEventListener('click',()=>setTrack(!TRACK.on));
  if(typeof trackEditInstallButton==='function') trackEditInstallButton();   // app/track-edit.js's door
  if(typeof mbInstallStageButton==='function') mbInstallStageButton();       // scene/builder.js's door
  /* the manual's four doors (app/manual.js): the header button is built
     here, and the two STATIC ones in body.html are bound here for the same
     reason every other static button is — the panes they live in are shown
     and hidden, never rebuilt, so binding once at boot is binding forever */
  if(typeof manualInstallHeader==='function') manualInstallHeader();
  /* the servo grid's Esc — deselects the open channel card, the same key
     that deselects a part on the model (cad/select.js). It only ever acts
     while that view is up and a tile is selected. */
  if(typeof svKey==='function') document.addEventListener('keydown', svKey);
  if(typeof svRestore==='function') svRestore();
  /* the job wizard's top-bar door (v1.75.0). Static markup, bound once at
     boot like every other header button; jobwizOpen() is maestro's, so the
     typeof guard keeps this file honest in a build without it. */
  if($('btnJobs')) $('btnJobs').addEventListener('click',()=>{
    if(typeof jobwizOpen === 'function') jobwizOpen();
  });
  if($('btnManualHelp')) $('btnManualHelp').addEventListener('click', manualOpen);
  if($('btnManualStp'))  $('btnManualStp').addEventListener('click', manualOpen);
  $('btnModel').addEventListener('click',()=>stagePicker('btnModel', modelOptions(), modelGet(), id=>modelSet(id)));
  modelSyncBtn();
  /* the header cluster re-fits on the 0.06 s UI tick, which is a whole
     frame of truncated chips on the one gesture whose entire purpose is to
     change the text size — so the two buttons that do it say so at once */
  $('btnScaleUp').addEventListener('click',()=>{ applyUiScale(PREFS.uiScale+0.05); syncChipTitles(); });
  $('btnScaleDn').addEventListener('click',()=>{ applyUiScale(PREFS.uiScale-0.05); syncChipTitles(); });
  applyUiScale(PREFS.uiScale);
  bindUiScaleReset();
  /* workspaces replaced the three view modes in v1.17.0 — wsInit() does the
     one-time migration, binds the Bench Advanced switch and paints the
     selector. buildViewSel()/applyView() still exist as shims (config/views.js)
     but must not be the boot path: they cannot run the migration. */
  wsInit();
  $('btnAppMenu').addEventListener('click',appMenuToggle);
  /* Save & load sits inside the menu now: position its popover off the
     button while the menu is still open, THEN fold the menu away */
  $('btnSaveLoad').addEventListener('click',()=>{ saveLoadPopover(); appMenuClose(); });
  /* the header "?" — kbdHelpToggle() was written for it in v1.16.0 and
     had no button until the markup came back (Stage-4 pickup) */
  if($('btnKbd')) $('btnKbd').addEventListener('click',()=>kbdHelpToggle());
  $('btnSetup').addEventListener('click',()=>openStartup());
  $('btnStartupX').addEventListener('click',closeStartup);
  /* "Skip the rest" / "Close" — leaves the answers so far applied, but does
     not mark the build as configured, so the wizard still offers itself. */
  $('btnStartupGo').addEventListener('click',closeStartup);
  $('btnStpBack').addEventListener('click',wizBack);
  $('btnStpNext').addEventListener('click',wizNext);
  $('startup').addEventListener('mousedown',e=>{ if(e.target===$('startup')) closeStartup(); });
  window.addEventListener('keydown',e=>{ if(e.key==='Escape' && $('startup').classList.contains('on')) closeStartup(); });

  initSelect();
  initSplitters();
  tutorLoad(); buildTutor();
  envApply(envGet());
  requestAnimationFrame(frame);
  /* both payloads have to be in before the stage selection can be applied —
     it decides what is visible, who has the pad and which channels exist */
  const mouseReady = loadMouseFromPayload();
  loadCadFromPayload().then(ok=>{
    if(!ok) buildCadPane();
    partsLoad();            // labels/groups first — paint resolves group colours
    motionApplyAll();       // then any hand-set pivots and travels
    registerGroupAnims();
    initPaint();
    if(buildConfigured()) buildApply();      // re-assert foot mode / board size
    /* first run means "no droid configured yet", not "never seen a screen" —
       the wizard is the thing that gets you a working config */
    /* ...but "no droid configured yet" is not the same as "has never been
       asked" (v1.70.0). `done` is set by the Finish job and by nothing else,
       and answering all nine questions then pressing "Skip the rest" is a
       complete, deliberate pass through the setup that never reaches it. So
       this line reopened the wizard at Question 1 on EVERY load, forever, with
       a ✓ beside every answer — five reloads, five wizards, in a cold-start
       walkthrough. closeStartup() already records the dismissal in
       PREFS.seenStartup (look/startup.js); it was read for the Escape key and
       nowhere else. Read it here too, and the boot trigger becomes what it
       always meant: nobody has been through this yet.
       A genuinely fresh profile still gets it — seenStartup defaults to false
       (look/prefs.js) and only closeStartup() ever sets it — and every other
       door in (Setup in the header, Config's own link) is untouched, because
       they call wizOpen()/openStartup() directly rather than through here. */
    if(!buildConfigured() && !PREFS.seenStartup) wizOpen(0);
    /* re-apply, do NOT re-frame: the camera is where the user left it */
    mouseReady.then(()=>modelApply({frame:false}));
  });
});
