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
  const r = b.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
  const top = r.top - 6 - pop.offsetHeight;
  pop.style.top = (top >= 8 ? top : r.bottom + 6) + 'px';
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

/* Below 1400px the header chips hide their text (02-layout.css) and the words
   live in the tooltip instead. hud.js rewrites the chip text every UI tick,
   so the titles are synced here on the same cadence — CSS cannot do it. */
/* chDrive is deliberately left out (2026-08-15, UX 1.5a — see hud.js): it
   is a button now and carries its own fixed action title ("arm / disarm
   the foot motors (START)") instead of a state mirror. Syncing it here
   on the same cadence would clobber that title back to the visible text
   every tick. */
const CHIP_IDS = ['chFault','chGamepad','chAuto','chSpeed','chHP'];
function syncChipTitles(){
  for(const id of CHIP_IDS){
    const e = $(id); if(!e || !e.lastElementChild) continue;
    const t = e.lastElementChild.textContent;
    if(e.title !== t) e.title = t;
  }
}

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
  if($('btnManualHelp')) $('btnManualHelp').addEventListener('click', manualOpen);
  if($('btnManualStp'))  $('btnManualStp').addEventListener('click', manualOpen);
  $('btnModel').addEventListener('click',()=>stagePicker('btnModel', modelOptions(), modelGet(), id=>modelSet(id)));
  modelSyncBtn();
  $('btnScaleUp').addEventListener('click',()=>applyUiScale(PREFS.uiScale+0.05));
  $('btnScaleDn').addEventListener('click',()=>applyUiScale(PREFS.uiScale-0.05));
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
    if(!buildConfigured()) wizOpen(0);
    /* re-apply, do NOT re-frame: the camera is where the user left it */
    mouseReady.then(()=>modelApply({frame:false}));
  });
});
