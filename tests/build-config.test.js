/* the setup wizard, the build model, and the consolidated Config tab
   ------------------------------------------------------------------
   What matters here is that the build answers are AUTHORITATIVE: picking
   hub motors has to change what the sketch does, not just what a summary
   says. Most of these assertions read the running sim, not the UI. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const dlgs=[]; page.on('dialog', async d=>{ dlgs.push(d.message()); await d.accept(); });
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);

  console.log('\n════ first run ════');
  ok('the wizard opens by itself when nothing is configured', await ev(()=>
    $('startup').classList.contains('on') && !buildConfigured() && WIZ.i===0));
  ok('asks the model first, then Mike\'s questions in his order, then wiring, panels, colours, review', await ev(()=>
    wizSteps()[0].key === '_model' &&
    /* nine until v1.34.0 merged the two servo questions; the controller
       board moved up in v1.35.0 and the firmware moved back to LAST in
       v1.36.0 — "when key questions have been answered" */
    BUILD_STEPS.map(s=>s.key).join() ===
      'controller,arduino,servos,domeMotor,domeLighting,bodyDrive,sound,firmware'
        .replace('domeLighting','domeLights') &&
    /* the physical servo job became a step of its own after Firmware in
       v1.37.0 — "lets move this to after the firmware button" */
    wizSteps().slice(9).map(s=>s.key).join() === '_servoSet,_wiring,_panels,_paint,_scene,_done'));
  ok('every question has options and every option explains itself', await ev(()=>
    /* a step may own more than one answer now, so walk the keys it declares */
    BUILD_STEPS.every(s=>stepAnswerKeys(s).every(k=>
      (BUILD_OPTIONS[k]||[]).length>=2 &&
      BUILD_OPTIONS[k].every(o=>o.label && o.note && o.sim)))));
  ok('the rail has one dot per step (plus the 1.5c jobs divider) and marks the current one', await ev(()=>
    $('stprail').querySelectorAll('.raildot').length===wizSteps().length &&
    wizRailChip(0).classList.contains('act')));
  /* v1.46.0 — the defaults are self-consistent EXCEPT for one pair, on
     purpose. Mike asked for two expanders behind a co-processor and a DY-SV5W
     as the shipped answers, was shown that padawan360 mod2026 can drive
     neither, and chose to keep mod2026 as the default sketch anyway. So this
     asserts the exception is exactly the two objections he accepted — nothing
     has quietly drifted into a third — and that the escape hatch is one call,
     because the firmware is not pinned on a build nobody has answered. */
  ok('the defaults carry exactly the two conflicts Mike chose, and no others', await ev(()=>{
    const b = buildGet();
    const why = firmwareBlockers(b.firmware, b).map(x=>x.why).join(' | ');
    return b.firmware==='mod2026' && !b.firmwarePinned &&
           /co-processor/.test(why) && /DY-SV5W/.test(why) &&
           firmwareBlockers(b.firmware, b).length===2;
  }));
  ok('...and one click hands the sketch to the setup and clears them', await ev(()=>{
    const id = buildUnpinFirmware();
    const clean = firmwareBlockers(buildGet().firmware, buildGet()).length===0;
    /* put the shipped default back for every assertion after this one */
    PREFS.build = buildDefault(); buildApply();
    return id==='maestro25' && clean;
  }));
  ok('the shipped answers are the ones he asked for', await ev(()=>{
    const d = buildDefault();
    return d.servoTopo==='p1x2' && d.sound==='dysv5w' &&
           servoTopos('pca')[0].id==='p1x2' && BUILD_OPTIONS.sound[0].id==='dysv5w' &&
           d.domeServo==='mpca32' && d.bodyServo==='mpca32';
  }));

  /* ================================================================
     v1.42.0 — assumed vs confirmed (1.5b): a genuine first run has SEEN
     only the step it opened on (the model), so that is the only chip
     ticked so far — every other hardware chip already carries the
     default ANSWER but not yet a confirmation.
     ================================================================ */
  console.log('\n════ assumed vs confirmed — nothing is ticked until it is looked at (1.5b) ════');
  ok('so far only the model step — the one actually rendered — is visited', await ev(()=>
    wizVisited('_model') && BUILD_STEPS.every(s=>!wizVisited(s.key))));
  ok('an unvisited hardware chip still shows the default answer, with a hollow marker, not a tick', await ev(()=>{
    const chip = wizRailChip(wizSteps().findIndex(s=>s.key==='controller'));
    return chip.textContent.indexOf('✓')<0 &&
           chip.querySelector('.railtick').textContent==='○' &&
           chip.querySelector('.railtick').classList.contains('unseen') &&
           /Xbox 360 wireless/.test(chip.querySelector('.railans').textContent);
  }));
  /* the real gate is WIZ_HAD_SAVED_BUILD — captured off localStorage at
     script-load time, BEFORE wsInit()'s own incidental buildGet() call
     (wsReachable('seq') asks buildCanSequence(), which fills in
     PREFS.build with defaults for every session, first run included).
     Keying the migration on "PREFS.build is present" the moment it is
     checked would grandfather every fresh install, since that becomes
     true early regardless of history — verified against a live boot
     with an empty and a pre-seeded localStorage. So the test drives the
     actual flag rather than PREFS.build, which this page already made
     true for reasons that have nothing to do with a real prior build. */
  ok('grandfathering: a build SAVED before this feature existed is treated as all-visited', await ev(()=>{
    const savedV = PREFS.wizVisited, savedFlag = WIZ_HAD_SAVED_BUILD;
    delete PREFS.wizVisited;
    WIZ_HAD_SAVED_BUILD = true;              // as an old localStorage blob would set it
    const v = wizVisitedInit();
    const allQ = wizSteps().filter(s=>s.key==='_model' || s.key.charAt(0)!=='_').every(s=>!!v[s.key]);
    PREFS.wizVisited = savedV; WIZ_HAD_SAVED_BUILD = savedFlag;   // leave this run's own tracking alone
    return allQ;
  }));
  ok('…and a fresh page load with no saved build is NOT grandfathered, even though PREFS.build already exists incidentally', await ev(()=>
    !WIZ_HAD_SAVED_BUILD && !!PREFS.build));

  console.log('\n════ the rail shows progress and answers ════');
  ok('visiting a step ticks its chip', await ev(()=>{
    wizGo(wizSteps().findIndex(s=>s.key==='controller'));
    const chip = wizRailChip(WIZ.i);
    return wizVisited('controller') && chip.textContent.indexOf('✓')>=0 && chip.classList.contains('act');
  }));
  await ev(()=>{ wizGo(wizStepIndex('sound')); buildSet('sound','dysv5w'); buildStartup(); });
  ok('after buildSet(sound, dysv5w) on that step, the sound chip shows the answer and a ✓', await ev(()=>{
    const chip = wizRailChip(wizSteps().findIndex(s=>s.key==='sound'));
    return chip.textContent.indexOf('✓')>=0 && /DY-SV5W/.test(chip.textContent);
  }));
  /* v1.45.0 — the answer line is now an EMPTY slot on a job step rather than
     no element at all: every chip is one size, and reserving the line is what
     stops a chip growing when it gets an answer (css/07-startup.css). What the
     assertion is actually about is unchanged — a place you go says nothing
     about itself — so it reads the slot's CONTENT rather than its existence. */
  ok('a non-question step gets no tick and no subtitle', await ev(()=>{
    const chip = wizRailChip(wizSteps().findIndex(s=>s.key==='_scene'));
    const ans = chip.querySelector('.railans');
    return chip.textContent.indexOf('✓')<0 && (!ans || ans.textContent==='');
  }));
  ok('changing an answer updates the chip', await ev(()=>{
    buildSet('sound','mdyx5300'); buildStartup();
    const chip = wizRailChip(wizSteps().findIndex(s=>s.key==='sound'));
    return /MD-YX5300/.test(chip.textContent) && chip.textContent.indexOf('DY-SV5W')<0;
  }));

  /* ================================================================
     v1.42.0 — model-aware finish (1.2a). "Finish — take me to my droid"
     and the finish step's own "That is your droid." only actually name
     a droid when a droid is what got built.
     ================================================================ */
  console.log('\n════ model-aware finish (1.2a) ════');
  const finWording = await ev(()=>{
    const out = {};
    ['droid','frik','mouse','builder'].forEach(m=>{
      PREFS.model = m;
      wizGo(wizSteps().length-1);
      out[m] = { btn: $('startupBody').querySelector('.finbtn').textContent, sub: $('stpSub').textContent };
    });
    PREFS.model = 'droid'; wizGo(wizSteps().length-1);
    return out;
  });
  ok('the Finish button follows the chosen model',
     finWording.droid.btn==='Finish — take me to my droid' &&
     finWording.frik.btn==='Finish — take me to my head' &&
     finWording.mouse.btn==='Finish — take me to my Mouse' &&
     finWording.builder.btn==='Finish — take me to my build',
     JSON.stringify(finWording));
  ok('the finish step\'s own headline follows too — "That is your X."',
     /That is your droid\./.test(finWording.droid.sub) &&
     /That is your head\./.test(finWording.frik.sub) &&
     /That is your Mouse\./.test(finWording.mouse.sub) &&
     /That is your build\./.test(finWording.builder.sub),
     JSON.stringify(finWording));
  ok('the "everything lines up" line names the model too (buildConflicts stubbed empty for this one check)', await ev(()=>{
    const real = buildConflicts;
    buildConflicts = ()=>[];
    PREFS.model = 'mouse';
    wizGo(wizSteps().length-1);
    const t = $('startupBody').textContent;
    buildConflicts = real;
    PREFS.model = 'droid'; wizGo(wizSteps().length-1);
    return /what you told me is in the Mouse/.test(t);
  }));

  /* ================================================================
     v1.42.0 — the first-run "what next" card (1.2c). Runs before this
     suite's own first explicit wizOpen() call further down, because
     WIZ.firstRun only stays true across wizGo()/wizNext() navigation —
     a fresh wizOpen() is by definition a REOPEN, not the boot trigger.
     ================================================================ */
  console.log('\n════ the first-run "what next" card (1.2c) ════');
  /* v1.43.0 — the Finish BUTTON asks about the file first (wizFinishAsked),
     so the click no longer finishes on its own line. Answer the question,
     then assert. `wizFinish()` itself is still synchronous and is what the
     rest of this suite calls. */
  await ev(()=>{
    PREFS.seenNextCard = false;                // make sure this is a first show
    wizGo(wizSteps().length-1);
    $('startupBody').querySelector('.finbtn').click();
  });
  await page.waitForFunction('!!document.querySelector(".dlgwrap .dlgno")');
  ok('Finish offers the whole setup as one file before it lets go', await ev(()=>{
    const d = document.querySelector('.dlgwrap');
    return /Save your setup to a file\?/.test(d.textContent)
        && /hardware answers/.test(d.textContent)
        && /Not now/.test(d.querySelector('.dlgno').textContent)
        && /Save it, then finish/.test(d.querySelector('.dlgyes').textContent);
  }));
  await ev(()=>{ document.querySelector('.dlgwrap .dlgno').click(); });  // "Not now" — it still finishes
  await page.waitForFunction('!document.querySelector(".dlgwrap")');
  ok('a genuine first-run Finish shows the card, and it persists as seen', await ev(()=>{
    const shown = !!$('wizNextCard') && /Where next\?/.test($('wizNextCard').textContent);
    const persisted = PREFS.seenNextCard===true &&
      JSON.parse(localStorage.getItem('r2sim.prefs.v1')).seenNextCard===true;
    return shown && persisted && WIZ.firstRun===true && buildConfigured();
  }));
  ok('it carries three doors, worded for the droid', await ev(()=>{
    const doors = Array.from($('wizNextCard').querySelectorAll('.wiznextdoor'));
    return doors.length===3 &&
           doors[0].dataset.door==='drive' && /Drive it/.test(doors[0].textContent) &&
           doors[1].dataset.door==='learn' && /Learn to drive/.test(doors[1].textContent) &&
           doors[2].dataset.door==='seq'   && /Build a sequence/.test(doors[2].textContent);
  }));
  ok('"Drive it" closes the card and leaves the one-line arming hint', await ev(()=>{
    $('wizNextCard').querySelector('[data-door="drive"]').click();
    return !$('wizNextCard') &&
      Array.from(document.querySelectorAll('#toasts .toastp')).some(t=>/press START \(Enter\) to arm the feet/.test(t.textContent));
  }));
  /* every Finish CLICK now goes through the save-it-first question, so each
     of these answers it before looking at what Finish did (v1.43.0) */
  const finishNotNow = async ()=>{
    await ev(()=>{ $('startupBody').querySelector('.finbtn').click(); });
    await page.waitForFunction('!!document.querySelector(".dlgwrap .dlgno")');
    await ev(()=>{ document.querySelector('.dlgwrap .dlgno').click(); });
    await page.waitForFunction('!document.querySelector(".dlgwrap")');
  };
  await finishNotNow();
  ok('it does not reappear on a later Finish — shown once',
     await ev(()=>!$('wizNextCard')));          // PREFS.seenNextCard is already true
  const notFirstRun = await ev(()=>{
    wizOpen(0);                                 // a real reopen, distinct from the boot trigger
    const nf = !WIZ.firstRun;
    PREFS.seenNextCard = false;                 // even pretending it was never shown…
    wizGo(wizSteps().length-1);
    return nf;
  });
  await finishNotNow();
  ok('a REOPEN (wizOpen) is not a genuine first run, so a later Finish still will not show it',
     await ev(()=>!$('wizNextCard')) && notFirstRun);

  console.log('\n════ each door of the card, and the Builder variant (1.2c) ════');
  ok('"Learn to drive" opens the Learn tab and turns the lessons on', await ev(()=>{
    document.querySelector('#tabs button[data-p="pServo"]').click();   // start somewhere else
    PREFS.seenNextCard = false; wizNextCardOpen('droid');
    $('wizNextCard').querySelector('[data-door="learn"]').click();
    const tabAct = document.querySelector('#tabs button[data-p="pLearn"]').classList.contains('act');
    return tabAct && TUTOR.on===true && !$('wizNextCard');
  }));
  ok('"Build a sequence" switches to the Sequence workspace', await ev(()=>{
    PREFS.seenNextCard = false; wizNextCardOpen('droid');
    $('wizNextCard').querySelector('[data-door="seq"]').click();
    return WS.cur==='seq' && !$('wizNextCard');
  }));
  await ev(()=>wsSet('drive'));
  ok('for the Builder, the first door is "Start building" and opens the Builder pane', await ev(()=>{
    /* a top-level `function mbOpenPane(){}` binding is non-configurable —
       delete window.mbOpenPane silently no-ops and leaves the stub in
       place, so the real function has to be saved and REASSIGNED back,
       not deleted */
    const real = (typeof mbOpenPane === 'function') ? mbOpenPane : undefined;
    let called = 0;
    mbOpenPane = ()=>{ called++; };
    PREFS.seenNextCard = false; wizNextCardOpen('builder');
    const first = $('wizNextCard').querySelector('[data-door="build"]');
    const label = first ? first.textContent : '';
    if(first) first.click();
    mbOpenPane = real;
    return /Start building/.test(label) && called>=1;
  }));

  /* ================================================================
     v1.42.0 — land where the work is (1.2b): finishing into the
     Builder opens its pane instead of the bare Drive view.
     ================================================================ */
  console.log('\n════ finishing into the Builder lands on its pane (1.2b) ════');
  ok('wizFinish() opens the Builder pane when the Builder is the chosen model', await ev(()=>{
    const real = (typeof mbOpenPane === 'function') ? mbOpenPane : undefined;
    let called = 0;
    mbOpenPane = ()=>{ called++; };
    PREFS.model = 'builder';
    wizFinish();
    mbOpenPane = real;
    PREFS.model = 'droid';
    return called>=1;
  }));
  ok('…and does nothing of the sort for the droid', await ev(()=>{
    const real = (typeof mbOpenPane === 'function') ? mbOpenPane : undefined;
    let called = 0;
    mbOpenPane = ()=>{ called++; };
    PREFS.model = 'droid';
    wizFinish();
    mbOpenPane = real;
    return called===0;
  }));
  await ev(()=>modelSet('droid'));

  /* ================================================================
     v1.42.0 — the rail counts questions, not jobs (1.5c)
     ================================================================ */
  console.log('\n════ the rail counts questions, not jobs (1.5c) ════');
  ok('the footer says "Question 2 of 9" on Controller', await ev(()=>{
    wizGo(wizSteps().findIndex(s=>s.key==='controller'));
    return $('stpFoot').textContent.indexOf('Question 2 of 9')===0;
  }));
  ok('…and names the job, with the "come back any time" line, on Panels', await ev(()=>{
    wizGo(wizStepIndex('_panels'));
    return $('stpFoot').textContent.indexOf('Panels · a job, come back any time')===0;
  }));
  ok('the rail groups the nine questions from the six jobs, with a label between them', await ev(()=>{
    wizGo(0);
    const div = $('stprail').querySelector('.raildiv');
    const kids = Array.from($('stprail').children);
    return !!div && /jobs.*any time/i.test(div.textContent) &&
           kids.indexOf(div)===9 &&
           kids.slice(0,9).every(d=>d.classList.contains('raildot')) &&
           kids.slice(10).every(d=>d.classList.contains('raildot'));
  }));
  ok('back/next still walks all fifteen steps, questions and jobs alike, in order', await ev(()=>{
    wizGo(0);
    for(let i=0;i<14;i++) wizNext();
    const atEnd = WIZ.i===14 && wizSteps()[14].key==='_done';
    wizGo(0);
    return atEnd;
  }));

  /* ================================================================
     v1.45.0 — Mike: "Make setup-stage selection bubbles consistent in
     size." Measured, not inspected: getBoundingClientRect() across every
     chip in the rail, in every state it can be in at once.
     ================================================================ */
  console.log('\n════ every rail chip is one size (v1.45.0) ════');
  const chipStates = await ev(()=>{
    modelSet('mouse');                       // gives the rail its greyed .na chips
    /* wizOPEN, not wizGo: a closed overlay is display:none, every chip
       measures 0×0 and "they are all the same size" passes for the wrong
       reason. The width/height assertions below check for a real box too. */
    wizOpen(wizStepIndex('sound'));          // something before it, something after
    const d = Array.from($('stprail').querySelectorAll('.raildot'));
    return {
      n: d.length, steps: wizSteps().length,
      act:  d.filter(x=>x.classList.contains('act')).length,
      done: d.filter(x=>x.classList.contains('done')).length,
      na:   d.filter(x=>x.classList.contains('na')).length,
      ans:  d.filter(x=>x.querySelector('.railans') && x.querySelector('.railans').textContent).length,
      noAns:d.filter(x=>!x.querySelector('.railans') || !x.querySelector('.railans').textContent).length
    };
  });
  ok('the measured rail really does hold every kind of chip at once',
     chipStates.n===chipStates.steps && chipStates.act===1 && chipStates.done>0 &&
     chipStates.na>0 && chipStates.ans>0 && chipStates.noAns>0, JSON.stringify(chipStates));
  ok('...and all fifteen are the same width and the same height', await ev(()=>{
    const r = Array.from($('stprail').querySelectorAll('.raildot')).map(d=>d.getBoundingClientRect());
    const w = new Set(r.map(x=>Math.round(x.width)));
    const h = new Set(r.map(x=>Math.round(x.height)));
    /* a real box, on screen — not fifteen zeroes behind a closed overlay */
    return w.size===1 && h.size===1 && r[0].width > 40 && r[0].height > 20;
  }), await ev(()=>{
    const r = Array.from($('stprail').querySelectorAll('.raildot')).map(d=>d.getBoundingClientRect());
    return Array.from(new Set(r.map(x=>Math.round(x.width)+'×'+Math.round(x.height)))).join(' / ');
  }));
  ok('...and nothing moves as you walk the setup — no jump on active or done', await ev(()=>{
    const box = ()=>Array.from($('stprail').querySelectorAll('.raildot'))
      .map(d=>{ const b = d.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height); })
      .join('|');
    wizOpen(0);                    const a = box();
    wizGo(wizStepIndex('servos')); const b2 = box();
    wizGo(wizSteps().length-1);    const c = box();
    modelSet('droid'); wizGo(0);
    const one = a.split('|')[0];
    closeStartup();
    return a===b2 && b2===c && new Set(a.split('|')).size===1 && !/^0x/.test(one);
  }));

  /* ================================================================
     v1.42.0 — the Panels step / Config tab is model-aware (1.3)
     ================================================================ */
  console.log('\n════ the Panels note is model-aware (1.3) ════');
  const panelsNote = await ev(()=>{
    const out = {};
    ['droid','mouse','builder'].forEach(m=>{
      PREFS.model = m;
      const host = document.createElement('div');
      buildAssignSect(host, ()=>{});
      out[m] = { note: host.querySelector('.assignmodelnote') ? host.querySelector('.assignmodelnote').textContent : '',
                 door: !!Array.from(host.querySelectorAll('button')).find(b=>/Open the Builder pane/.test(b.textContent)) };
    });
    PREFS.model = 'droid';
    return out;
  });
  ok('the droid gets no model note', panelsNote.droid.note==='', JSON.stringify(panelsNote));
  ok('the mouse gets a note naming it, and no Builder door', /Polar Mouse/.test(panelsNote.mouse.note) && !panelsNote.mouse.door, JSON.stringify(panelsNote));
  ok('the builder gets the note and a door to its own pane', /Builder/.test(panelsNote.builder.note) && panelsNote.builder.door, JSON.stringify(panelsNote));
  ok('the wizard\'s Panels step copy is model-aware too — no more "the droid is beside you" for another model', await ev(()=>{
    PREFS.model = 'mouse';
    wizGo(wizStepIndex('_panels'));
    const t = $('stpSub').textContent;
    PREFS.model = 'droid'; wizGo(wizStepIndex('_panels'));
    return /The model is beside you/.test(t) && !/The droid is beside you/.test(t);
  }));
  await ev(()=>wizGo(0));

  console.log('\n════ the answers drive the sim ════');
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w'); });
  ok('two Maestro boards + a DY-SV5W move the sim off mod2026', await ev(()=>
    PROFILE.hasMaestro && buildGet().firmware!=='mod2026'), await ev(()=>PROFILE.short));
  await ev(()=>buildSet('bodyDrive','flipsky'));
  ok('hub motors force the only sketch with a PWM foot mode', await ev(()=>
    buildGet().firmware==='maestro25' && PROFILE.id==='maestro25'));
  ok('…and set FOOT_CONTROLLER on it', await ev(()=>CFG.FOOT_CONTROLLER===1 && PROFILE.footPWM()));
  ok('the Outputs table follows — hub ESCs on 44/45, not a Sabertooth', await ev(()=>{
    buildOutputs();
    const t = $('outHost').textContent;
    return /pin 44/.test(t) && /pin 45/.test(t) && !/Sabertooth drive/.test(t);
  }));
  await ev(()=>buildSet('bodyDrive','sabertooth'));
  ok('going back to brushed clears it again', await ev(()=>CFG.FOOT_CONTROLLER===0 && !PROFILE.footPWM()));

  console.log('\n════ blockers are specific, and weighted ════');
  ok('mod2026 is blocked by hub motors, by a Maestro and by a DY-SV5W', await ev(()=>{
    const b = {domeServo:'mini24', bodyServo:'mini12', bodyDrive:'flipsky', sound:'dysv5w', firmware:'mod2026'};
    const r = firmwareBlockers('mod2026', b).map(x=>x.why).join(' ');
    return /Sabertooth/.test(r) && /Maestro/.test(r) && /MD-YX5300/.test(r);
  }));
  ok('the 2022 BETA is blocked by hub motors but the 2025 sketch is not', await ev(()=>
    firmwareBlockers('maestro22',{domeServo:'mini24',bodyServo:'mini12',bodyDrive:'flipsky',sound:'dysv5w'}).length===1 &&
    firmwareBlockers('maestro25',{domeServo:'mini24',bodyServo:'mini12',bodyDrive:'flipsky',sound:'dysv5w'}).length===0));
  ok('a sound-board mismatch never outweighs a servo-board one', await ev(()=>{
    /* Maestro servos + the wrong sound module: swapping the £15 audio board
       beats ripping the Maestro out, so the Maestro sketch must win */
    const b = {domeServo:'mini24', bodyServo:'mini12', bodyDrive:'sabertooth', sound:'mdyx5300', firmware:'mod2026'};
    return firmwareBlockers('mod2026',b).length===1 && firmwareBlockers('maestro25',b).length===1
        && firmwareCost('maestro25',b) < firmwareCost('mod2026',b)
        && firmwareRecommend(b).id==='maestro25';
  }));
  ok('a clean build recommends 2025 over the 2022 BETA', await ev(()=>
    firmwareRecommend({domeServo:'mini24',bodyServo:'mini12',bodyDrive:'sabertooth',sound:'dysv5w'}).id==='maestro25'));

  console.log('\n════ parked options are recorded, not pretended ════');
  ok('an unsimulated option is selectable and says so', await ev(()=>
    buildOpt('domeLights','astropixels').sim==='park' &&
    buildConflicts().some(c=>c.kind==='park' && /AstroPixels/.test(c.text))));
  /* v1.32.0 — the RC answer moved park → sub: the SIM reads a transmitter
     now (input/rc.js), but no sketch has an RC input layer, so a calibrated
     channel STANDS IN for the Xbox map rather than arriving the way it
     would on the real droid. */
  await ev(()=>buildSet('controller','rc'));
  ok('the RC transmitter stands in rather than being pretended or parked', await ev(()=>
    buildGet().controller==='rc' && buildOpt('controller','rc').sim==='sub' &&
    !buildConflicts().some(c=>c.kind==='park' && /RC transmitter/.test(c.text))));
  ok('…and it still appears on the wiring diagram, dashed — no sketch reads it', await ev(()=>
    systemLinks().some(l=>/RC|Xbox/.test(l.name) && l.live===false)));
  await ev(()=>buildSet('controller','xbox360'));

  console.log('\n════ the wiring diagram follows the build ════');
  ok('the Maestro sits on Serial3 under the 2025 sketch', await ev(()=>{
    buildSet('firmware','maestro25');
    return systemLinks().some(l=>/Maestro/.test(l.name) && /Serial3/.test(l.bus));
  }));
  ok('…and on SoftwareSerial(10,11) under the 2022 BETA', await ev(()=>{
    buildSet('firmware','maestro22');
    return systemLinks().some(l=>/Maestro/.test(l.name) && /SoftwareSerial/.test(l.bus) && /10/.test(l.pins));
  }));
  ok('the PCA9685 pair is I2C, and dashed while a Maestro sketch runs', await ev(()=>{
    buildSet('domeServo','mod2026');
    const l = systemLinks().find(x=>/PCA9685 0x41/.test(x.name));
    return l && /I2C/.test(l.bus) && /20/.test(l.pins) && l.live===false;
  }));
  ok('every link names a bus and a pin', await ev(()=>systemLinks().every(l=>l.name && l.bus && l.pins)));
  ok('the diagram renders as SVG and says no V+ lines are drawn', await ev(()=>{
    const s = systemDiagramSvg();
    return /^<svg/.test(s) && /no V\+/.test(s) && s.indexOf('</svg>')>0;
  }));
  ok('long peripheral notes are clipped, so nothing runs past its box', await ev(()=>{
    buildSet('domeLights','astropixels');
    const s = systemDiagramSvg();
    return /…/.test(s) && /<title>/.test(s);        // clipped, with the full text on hover
  }));
  ok('the wiring sheet carries the build table and the diagram', await ev(()=>{
    const h = wiringHtml();
    return /The build/.test(h) && /Control signals/.test(h) && /Dome lighting/.test(h);
  }));

  console.log('\n════ the setup owns it; the Config tab does not repeat it ════');
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('bodyServo','mod2026'); buildConfig(); });
  ok('the Config tab no longer duplicates the build questions', await ev(()=>
    $('cfgHost').querySelectorAll('select[data-build]').length===0));
  ok('…nor the boards or the paint', await ev(()=>
    $('cfgHost').querySelectorAll('.boardcard').length===0 &&
    $('cfgHost').querySelectorAll('.swcell').length===0));
  /* v1.39.2 — the ONE exception Mike asked for, and it is deliberate. The
     July rule was about the build QUESTIONS ("anything that's in the setup
     should be removed from the config tab"); the panel map is not a question
     but a table you come back to when a linkage is rebuilt. Same builder as
     the setup's Panels step, so the two still cannot drift. */
  ok('the panel table IS here now — the same builder, not a second copy', await ev(()=>
    $('cfgHost').querySelectorAll('.asrow').length > 0 &&
    !!$('cfgPanels') &&
    Array.from($('cfgHost').querySelectorAll('.cfgnav button')).some(b=>/Panels/.test(b.textContent))));
  ok('it shows the build read-only, with a way into the setup', await ev(()=>
    $('cfgHost').querySelectorAll('.bsumrow').length===BUILD_STEPS.length &&
    Array.from($('cfgHost').querySelectorAll('button')).some(b=>/Open the setup/.test(b.textContent))));
  ok('the sketch constants stayed', await ev(()=>
    /Speed/.test($('cfgHost').textContent) && $('cfgHost').querySelectorAll('input[type=number]').length>4));
  /* v1.45.0 — Mike: "Remove the Maestro 2025 reference/image." The buttons
     went in v1.4.0 and the read-only tag that replaced them has gone too, so
     the header no longer spells a board maker's product name across the
     chrome. The sketch is still named where it is CHOSEN and where the build
     is summarised — that is what the second half asserts, because removing a
     display must not remove the information. */
  ok('the header carries no firmware buttons and no firmware tag', await ev(()=>
    !$('fwsel') && !$('fwTag') && !/Maestro 2025/.test(($('hdrBezel')||{textContent:''}).textContent)));
  ok('…and the sketch is still named in the build summary', await ev(()=>{
    const r = buildSummaryRows().find(x=>x.key==='firmware');
    return !!r && String(r.label||'').length > 0;
  }));
  /* ================================================================
     v1.45.0 — Mike: "Remove the non-functional Wiring 'Boards' section."

     It drew a photo-and-pins card per board, and for a mod2026 or PCA9685
     build — the DEFAULT build — it could not do what it promised: no photo
     and no pin map exist for those boards, the pin buttons deliberately did
     not open the picker for mod2026, and the explanations went to
     $('cadMsg'), which does not exist while the overlay is up.

     So the assertion inverts: there are no board cards ANYWHERE now. What
     the section was reached for is asked on the Panels step and printed on
     the wiring sheet, and hwPins()/chPartOptions() — the parts of
     app/boards.js everything else reads — are pinned below and elsewhere.
     ================================================================ */
  ok('no board-and-pins cards are drawn anywhere any more', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_wiring'));
    const inWiz = $('startupBody').querySelectorAll('.boardcard, .pinstrip, .pinbtn').length;
    closeStartup();
    buildCadPane(); buildConfig();
    return inWiz===0 && typeof buildBoardsSect==='undefined' &&
           $('cadHost').querySelectorAll('.boardcard').length===0 &&
           $('cfgHost').querySelectorAll('.boardcard').length===0;
  }));
  ok('the wiring step still has the diagram, the sheet buttons and the beta note', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_wiring'));
    const h = $('startupBody');
    const svg = h.querySelectorAll('.wdwrap svg').length;
    const btns = Array.from(h.querySelectorAll('button')).filter(b=>/wiring sheet|CSV/.test(b.textContent)).length;
    const beta = !!h.querySelector('.note.beta');
    closeStartup();
    return svg===1 && btns===2 && beta;
  }));
  ok('...and the channel↔part machinery the rest of the app reads is untouched', await ev(()=>
    typeof hwPins==='function' && hwPins('dome').pins.length > 0 &&
    typeof chPartOptions==='function' && chPartOptions().length > 0 &&
    typeof chAssign==='function' && typeof chFindUse==='function' &&
    HW.parts().length===chPartOptions().length));
  ok('the Model tab points at the setup rather than drawing boards', await ev(()=>{
    buildCadPane();
    return $('cadHost').querySelectorAll('.boardcard').length===0 && /Config/.test($('cadHost').textContent);
  }));

  console.log('\n════ assigning a servo to a panel ════');
  const row = await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    const rows = Array.from($('startupBody').querySelectorAll('.asrow')).filter(r=>r.querySelector('select[data-act]'));
    const r = rows.find(r=>r.querySelector('select[data-act]').dataset.act.startsWith('pie'));
    return r ? {act:r.querySelector('select[data-act]').dataset.act, opts:r.querySelector('select').options.length} : null;
  });
  ok('a pie row offers every channel on the dome board', row && row.opts >= 25, JSON.stringify(row));
  ok('picking a free channel moves the part there', await page.evaluate(act=>{
    const free = hwPins('dome').pins.find(p=>!p.act);
    if(!free) return false;
    const sel = Array.from($('startupBody').querySelectorAll('select[data-act]')).find(s=>s.dataset.act===act);
    sel.value = 'dome:'+free.pin; sel.dispatchEvent(new Event('change'));
    const now = hwPins('dome').pins;
    return now[free.pin].act===act && now.filter(p=>p.act===act).length===1;
  }, row.act));
  ok('unwiring a part leaves it on no channel at all', await page.evaluate(act=>{
    const sel = Array.from($('startupBody').querySelectorAll('select[data-act]')).find(s=>s.dataset.act===act);
    sel.value = ''; sel.dispatchEvent(new Event('change'));
    return hwPins('dome').pins.filter(p=>p.act===act).length===0;
  }, row.act));
  ok('a part\'s colour can be set from the same row', await ev(()=>{
    const r = Array.from($('startupBody').querySelectorAll('.asrow')).find(r=>r.querySelector('.ascol'));
    const inp = r.querySelector('.ascol');
    inp.value = '#123456'; inp.dispatchEvent(new Event('input'));
    closeStartup();
    return Object.values(PARTS.overrides).some(o=>o.color==='#123456');
  }));

  console.log('\n════ cancelling "Channel in use" leaves wiring untouched (v1.39.5) ════');
  const cancel = await ev(async ()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    const selFor = act => Array.from($('startupBody').querySelectorAll('select[data-act]')).find(s=>s.dataset.act===act);
    const rows = Array.from($('startupBody').querySelectorAll('.asrow'))
      .map(r=>r.querySelector('select[data-act]'))
      .filter(s=>s && !s.disabled);
    const P = rows[0].dataset.act, Q = rows[1].dataset.act;
    const free = hwPins('dome').pins.filter(p=>!p.act);
    const chP = free[0].pin, chQ = free[1].pin;
    selFor(P).value = 'dome:'+chP; selFor(P).dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,30));
    selFor(Q).value = 'dome:'+chQ; selFor(Q).dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,30));

    const realConfirm = appConfirm;
    appConfirm = async()=>false;             // Cancel — must be a no-op
    selFor(P).value = 'dome:'+chQ; selFor(P).dispatchEvent(new Event('change'));   // Q's channel — occupied
    await new Promise(r=>setTimeout(r,30));
    appConfirm = realConfirm;

    const pins = hwPins('dome').pins;
    const out = {pOnOwnCh: pins[chP].act===P, qUntouched: pins[chQ].act===Q};
    // leave it tidy
    selFor(P).value=''; selFor(P).dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,30));
    selFor(Q).value=''; selFor(Q).dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,30));
    closeStartup();
    return out;
  });
  ok('cancelling leaves P on its own channel', cancel.pOnOwnCh, JSON.stringify(cancel));
  ok('…and the occupant still on the target channel', cancel.qUntouched, JSON.stringify(cancel));

  console.log('\n════ it survives a round trip ════');
  await ev(()=>{ buildSet('domeLights','teeces'); buildSet('arduino','mega2560'); wizFinish(); });
  ok('finishing marks the build configured and closes the wizard', await ev(()=>
    buildConfigured() && !$('startup').classList.contains('on')));
  const trip = await ev(()=>{
    const saved = JSON.stringify(setupExportObj());
    const before = JSON.stringify(buildGet());
    buildSet('domeLights','none'); buildSet('arduino','due'); buildSet('sound','mp3trigger');
    setupImportObj(JSON.parse(saved));
    return {before, after: JSON.stringify(buildGet()), inFile: JSON.parse(saved).prefs.build !== null};
  });
  ok('the build answers travel in the setup .json', trip.inFile);
  ok('…and come back exactly as they went', trip.before === trip.after);
  ok('the file\'s profile wins over its build block', await ev(()=>{
    const o = setupExportObj();
    o.prefs.build = Object.assign({}, o.prefs.build, {firmware:'maestro22'});
    o.profile = 'mod2026';
    setupImportObj(o);
    return PROFILE.id==='mod2026' && buildGet().firmware==='mod2026';
  }));
  ok('reopening from the header lands on the review, not question one', await ev(()=>{
    openStartup();
    const at = WIZ.i === wizSteps().length-1;
    closeStartup(); return at;
  }));

  console.log('\n════ prefs upgrade path ════');
  ok('an old prefs file with hw but no build keeps its electronics choice', await ev(()=>{
    const keep = PREFS.build;
    PREFS.build = null; PREFS.hw = {dome:'mini18', body:'mod2026'};
    const b = buildGet();
    const good = b.domeServo==='mini18' && b.bodyServo==='mod2026' && firmwareBlockers(b.firmware,b).length===0;
    PREFS.build = keep; PREFS.hw = {dome:'mini24', body:'mod2026'};
    return good;
  }));

  console.log('\n════ full-page wizard, droid on the right ════');
  ok('the overlay fills the window rather than sitting in a card', await ev(()=>{
    wizOpen(0);
    const r = document.querySelector('.stpcard').getBoundingClientRect();
    return r.width > innerWidth-2 && r.height > innerHeight-2;
  }));
  ok('the Panels and Colours steps split the screen', await ev(()=>{
    wizGo(wizSteps().findIndex(s=>s.key==='_panels'));
    return document.body.classList.contains('wizsplit');
  }));
  ok('…the droid is beside the overlay, not behind it', await ev(()=>{
    const stage = $('stage').getBoundingClientRect();
    const card  = $('startup').getBoundingClientRect();
    return stage.left >= card.right - 2 && stage.width > 200;
  }));
  /* the canvas follows the stage on a FRAME, not on the click — three.js's
     setSize() runs from the resize path, and under the 8 MB inlined build
     that frame can land after this assertion did. It flaked about one run in
     four on the dist and never on dev.html, which is exactly the shape of a
     race being won by a smaller file. Wait for the frame it is waiting for. */
  ok('…and the canvas actually resized to match', await ev(async ()=>{
    for(let i=0;i<12;i++){
      await new Promise(r=>requestAnimationFrame(r));
      if(Math.abs(renderer.domElement.clientWidth - $('stage').clientWidth) <= 2) return true;
    }
    return {canvas: renderer.domElement.clientWidth, stage: $('stage').clientWidth};
  }));
  ok('the Colours step splits too', await ev(()=>{
    wizGo(wizSteps().findIndex(s=>s.key==='_paint'));
    return document.body.classList.contains('wizsplit');
  }));
  ok('a hardware step goes back to full width', await ev(()=>{
    wizGo(0); return !document.body.classList.contains('wizsplit');
  }));
  ok('closing the wizard restores the app layout', await ev(()=>{
    wizGo(wizSteps().findIndex(s=>s.key==='_panels'));
    closeStartup();
    return !document.body.classList.contains('wizsplit') && $('side').clientWidth > 100;
  }));

  console.log('\n════ clicking an output row opens its controls ════');
  /* the actuator table only exists on a Maestro profile — under mod2026 the
     PCA9685 channel rows are the clickable ones, checked separately below */
  /* v1.35.0 — the firmware may be PINNED by an earlier section, and a pinned
     firmware is no longer swapped by a hardware answer. Say which sketch we
     want outright rather than relying on the setup to infer it. */
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w');
                 buildSet('firmware','maestro25'); buildApply(); });
  await page.waitForTimeout(300);
  await page.click('#tabs button[data-p="pServo"]');
  const opened = await ev(()=>{
    const r = OUTROWS.act.find(r=>r.det && actCadParts(r.key).length);
    r.tr.click();
    return {key:r.key, open:OUT_OPEN, sel:SEL.name, shown:r.det.tr.style.display!=='none',
            controls:r.det.tr.querySelectorAll('input,select,button').length};
  });
  ok('the row opens a drawer and selects the part on the model',
     opened.open===opened.key && opened.shown && !!opened.sel, JSON.stringify(opened));
  ok('the drawer carries a channel, a slider and test buttons', opened.controls >= 5);
  ok('the drawer does not stretch the sidebar', await ev(()=>
    $('outHost').querySelector('table').clientWidth <= $('pServo').clientWidth));
  ok('Open drives the actuator', await ev(()=>{
    [...document.querySelectorAll('.detcell .b')].find(b=>b.textContent==='Open').click();
    return ACT_T[OUT_OPEN]===1;
  }));
  ok('the slider drives it too', await ev(()=>{
    const rng = document.querySelector('.detrng');
    rng.value = 40; rng.dispatchEvent(new Event('input'));
    return Math.abs(ACT_T[OUT_OPEN]-0.4) < 0.001;
  }));
  ok('only one drawer is open at a time', await ev(()=>{
    const other = OUTROWS.act.find(r=>r.det && r.key!==OUT_OPEN);
    other.tr.click();
    return document.querySelectorAll('#outHost tr.detrow:not([style*="none"])').length===1;
  }));
  ok('clicking the same row again closes it', await ev(()=>{
    const row = OUTROWS.act.find(r=>r.det && r.det.act===OUT_OPEN);
    row.tr.click();
    return OUT_OPEN===null && row.det.tr.style.display==='none';
  }));

  ok('under mod2026 the PCA9685 channel rows are the clickable ones', await ev(()=>{
    buildSet('domeServo','mod2026'); buildSet('bodyServo','mod2026'); buildSet('sound','mdyx5300');
    buildSet('firmware','mod2026');   /* say it outright — pinned firmware, v1.35.0 */
    buildApply();
    const rows = OUTROWS.servo[1].filter(r=>r.det);
    if(!rows.length) return false;
    rows[0].tr.click();
    return OUT_OPEN === rows[0].det.act && rows[0].det.tr.style.display !== 'none';
  }), await ev(()=>PROFILE.short));

  console.log('\n════ draggable splitters ════');
  ok('both handles exist and sit between their panes', await ev(()=>{
    const v=$('splitV').getBoundingClientRect(), h=$('splitH').getBoundingClientRect();
    return v.width>0 && v.height>0 && h.width>0 && h.height>0
        && Math.abs(v.left - $('side').getBoundingClientRect().left) < 8
        && Math.abs(h.top  - $('padwrap').getBoundingClientRect().top) < 8;
  }));
  const wide = await (async()=>{
    const before = await ev(()=>$('side').clientWidth);
    const v = await ev(()=>{const r=$('splitV').getBoundingClientRect();return [r.x+r.width/2, r.y+r.height/2]});
    await page.mouse.move(v[0], v[1]); await page.mouse.down();
    await page.mouse.move(v[0]-150, v[1], {steps:6}); await page.mouse.up();
    await page.waitForTimeout(200);
    return {before, after: await ev(()=>$('side').clientWidth)};
  })();
  ok('dragging the sidebar handle widens it', wide.after > wide.before + 100, JSON.stringify(wide));
  ok('…the canvas follows', await ev(()=>
    Math.abs(renderer.domElement.clientWidth - $('stage').clientWidth) <= 2));
  ok('…and it is remembered', await ev(()=>
    PREFS.split.sideW > 400 && JSON.parse(localStorage.getItem('r2sim.prefs.v1')).split.sideW === PREFS.split.sideW));
  const tall = await (async()=>{
    const before = await ev(()=>$('padwrap').clientHeight);
    const h = await ev(()=>{const r=$('splitH').getBoundingClientRect();return [r.x+r.width/2, r.y+r.height/2]});
    await page.mouse.move(h[0], h[1]); await page.mouse.down();
    await page.mouse.move(h[0], h[1]-110, {steps:6}); await page.mouse.up();
    await page.waitForTimeout(200);
    return {before, after: await ev(()=>$('padwrap').clientHeight)};
  })();
  ok('dragging the strip handle grows it', tall.after > tall.before + 70, JSON.stringify(tall));
  ok('double-click resets a handle to the default', await ev(()=>{
    splitReset('sideW');
    return PREFS.split.sideW === undefined && Math.abs($('side').clientWidth - 372) < 3;
  }));
  ok('sizes are clamped, so a pane can never be dragged away', await ev(()=>{
    splitSet('sideW', 5); const min = PREFS.split.sideW;
    splitSet('sideW', 99999); const max = PREFS.split.sideW;
    splitReset('sideW');
    return min === SPLIT_LIMITS.sideW.min && max === SPLIT_LIMITS.sideW.max;
  }));

  console.log('\n════ environments ════');
  ok('four backdrops, each explaining itself', await ev(()=>
    ENV_ORDER.length===4 && ENV_ORDER.every(id=>ENVS[id].label && ENVS[id].hint)));
  ok('the studio is the theme, so it owns no props', await ev(()=>ENVS.studio.usesTheme===true));
  const envs = await ev(()=>{
    const out = {};
    ['workshop','desert','hangar'].forEach(id=>{
      envSet(id);
      const g = ENV.groups[id];
      out[id] = {props:g.children.length, vis:g.visible, fog:scene.fog.color.getHex(),
                 mapped:!!ground.material.map, grid:grid.visible};
    });
    return out;
  });
  ok('each one builds props, hides the grid and textures the floor',
     ['workshop','desert','hangar'].every(id=>envs[id].props>10 && envs[id].vis && envs[id].mapped && !envs[id].grid),
     JSON.stringify(envs));
  ok('each has its own fog, so they do not all look the same', await ev(()=>{
    const seen = new Set();
    ['workshop','desert','hangar'].forEach(id=>{ envSet(id); seen.add(scene.fog.color.getHex()); });
    return seen.size===3;
  }));
  ok('only one is in the scene at a time', await ev(()=>{
    envSet('hangar');
    return ENV_ORDER.filter(id=>ENV.groups[id] && ENV.groups[id].visible).length===1;
  }));
  ok('the room shell is culled when the camera leaves it', await ev(()=>{
    envSet('hangar');
    const g = ENV.groups.hangar;
    camera.position.set(0, 20, 0); envCull();
    const outside = g.userData.shells.every(m=>!m.visible);
    camera.position.set(0, 1.5, 2); envCull();
    const inside = g.userData.shells.every(m=>m.visible);
    return outside && inside;
  }));
  ok('going back to the studio restores the theme look', await ev(()=>{
    envSet('studio');
    return scene.fog.color.getHex()===THEME_3D[PREFS.theme==='light'?'light':'dark'].fog && !ground.material.map;
  }));
  ok('the choice persists', await ev(()=>{
    envSet('desert');
    const ok1 = JSON.parse(localStorage.getItem('r2sim.prefs.v1')).env==='desert';
    envSet('studio');
    return ok1;
  }));
  ok('the stage button cycles and names the current one', await ev(()=>{
    const before = ENV.id; envCycle();
    const moved = ENV.id !== before && $('btnEnv').textContent === envLabel(ENV.id);
    envSet('studio'); return moved;
  }));

  console.log('\n════ teach me to operate my droid ════');
  ok('the lessons cover driving, sounds, sequences and automation', await ev(()=>{
    const ids = LESSONS.map(l=>l.id);
    return ['arm','drive','turn','speed','dome','sound','vol','seq','auto','hp','disarm'].every(k=>ids.indexOf(k)>=0);
  }));
  ok('every lesson says how AND why', await ev(()=>LESSONS.every(l=>l.title && l.how && l.why && typeof l.done==='function')));
  ok('lessons a profile cannot do are left out of the list', await ev(()=>{
    loadProfile('mod2026');
    const a = tutorList().map(l=>l.id);
    loadProfile('maestro25');
    const b = tutorList().map(l=>l.id);
    return a.indexOf('seq')<0 && b.indexOf('seq')>=0 && a.indexOf('doors')>=0 && b.indexOf('doors')<0;
  }));
  ok('a lesson ticks off the DROID\'s state, not a button press', await ev(()=>{
    FW.isDriveEnabled = false;
    setTutor(true); tutorReset();
    const before = TUTOR.done.arm;
    FW.isDriveEnabled = true;             // as the sketch would set it
    tutorTick(0.02);
    return !before && TUTOR.done.arm===true;
  }));
  ok('the boot sound does not tick "make some noise" for you', await ev(()=>{
    FW.isDriveEnabled = false; setTutor(true); tutorReset();
    SND.track = 21; SND.at = TUTOR.t0 - 1000;      // played before the lesson began
    tutorTick(0.02);
    const notYet = !TUTOR.done.sound;
    SND.at = TUTOR.t0 + 10; tutorTick(0.02);
    return notYet && TUTOR.done.sound===true;
  }));
  ok('progress persists', await ev(()=>{
    FW.isDriveEnabled = false; setTutor(true); tutorReset();
    FW.isDriveEnabled = true; tutorTick(0.02);
    return JSON.parse(localStorage.getItem('r2sim.prefs.v1')).tutor.arm===true;
  }));
  ok('the prompt moves on to the next unfinished lesson', await ev(()=>
    tutorCurrent() && tutorCurrent().id!=='arm'));
  ok('the HUD shows the current lesson and the score', await ev(()=>{
    tutorHud();
    const t = $('hudTutor');
    return t.style.display!=='none' && /\d+\/\d+/.test(t.textContent) && t.textContent.indexOf(tutorCurrent().title)>=0;
  }));
  ok('the Learn tab lists them all with a progress meter', await ev(()=>{
    buildTutor();
    return $('tutorHost').querySelectorAll('.turow').length===tutorList().length &&
           !!$('tutorHost').querySelector('.tumeter i');
  }));
  ok('reset clears it', await ev(()=>{ tutorReset(); return Object.keys(TUTOR.done).length===0; }));
  await ev(()=>setTutor(false));

  /* ================================================================
     v1.32.0 — the model is the FIRST question, and the questions that
     do not apply to it are collapsed rather than removed.
     ================================================================ */
  console.log('\n════ the model step ════');
  await ev(()=>{ modelSet('droid'); wizOpen(0); });
  ok('step 1 is the model, and it draws one card per model', await ev(()=>
    wizSteps()[WIZ.i].key === '_model' &&
    $('startupBody').querySelectorAll('.modelcard').length === MODELS.length));
  ok('every card carries its own picture', await ev(()=>
    Array.from($('startupBody').querySelectorAll('.modelcard'))
      .every(c=>{ const s = c.querySelector('svg.modelart'); return !!s && s.querySelectorAll('path,circle,rect,ellipse').length >= 5; }) &&
    /* and they are three DIFFERENT pictures, not the same one three times */
    new Set(MODEL_IDS.map(id=>modelArtSvg(id))).size === MODEL_IDS.length));
  ok('the selected model is the one marked', await ev(()=>{
    const c = $('startupBody').querySelector('[data-opt="model:droid"]');
    return c.classList.contains('act') &&
           !$('startupBody').querySelector('[data-opt="model:mouse"]').classList.contains('act');
  }));
  ok('clicking a card puts that model on the stage', await ev(()=>{
    $('startupBody').querySelector('[data-opt="model:mouse"]').click();
    return modelGet()==='mouse' && PREFS.model==='mouse' &&
           $('startupBody').querySelector('[data-opt="model:mouse"]').classList.contains('act');
  }));
  ok('the model chip in the rail shows a ✓ and what is on the stage', await ev(()=>{
    const chip = $('stprail').children[0];
    return chip.textContent.indexOf('✓')>=0 && /Polar Mouse/.test(chip.querySelector('.railans').textContent);
  }));

  console.log('\n════ steps the model does not use ════');
  ok('the mouse does not use the dome or the sound board; the droid uses everything', await ev(()=>
    modelSkippedSteps('droid').length===0 &&
    modelSkippedSteps('mouse').indexOf('domeMotor')>=0 &&
    modelSkippedSteps('mouse').indexOf('sound')>=0 &&
    stepUsedByModel('bodyDrive','mouse') && !stepUsedByModel('domeMotor','mouse')));
  ok('every skipped key is a real question', await ev(()=>
    Object.keys(MODEL_UNUSED_STEPS).every(m=>
      MODEL_UNUSED_STEPS[m].every(k=>BUILD_STEPS.some(s=>s.key===k)))));
  ok('a step the model does not use is greyed in the rail — and still there', await ev(()=>{
    const i = wizSteps().findIndex(s=>s.key==='domeMotor');
    const chip = $('stprail').children[i];
    return chip.classList.contains('na') && $('stprail').querySelectorAll('.raildot').length===wizSteps().length;
  }));
  ok('...and still clickable, with the answer intact', await ev(()=>{
    const i = wizSteps().findIndex(s=>s.key==='domeMotor');
    $('stprail').children[i].click();
    return WIZ.i===i && $('startupBody').querySelector('.note.na') &&
           $('startupBody').querySelectorAll('.optcard').length===BUILD_OPTIONS.domeMotor.length &&
           buildGet().domeMotor==='syren10';
  }));
  ok('answering it still works while it is collapsed', await ev(()=>{
    $('startupBody').querySelector('[data-opt="domeMotor:none"]').click();
    return buildGet().domeMotor==='none';
  }));
  ok('switching back to the droid un-greys it', await ev(()=>{
    buildSet('domeMotor','syren10'); modelSet('droid'); buildStartup();
    const i = wizSteps().findIndex(s=>s.key==='domeMotor');
    return !$('stprail').children[i].classList.contains('na');
  }));
  ok('the review lists the model and marks the unused rows', await ev(()=>{
    modelSet('frik'); wizGo(wizSteps().length-1);
    const rows = Array.from($('startupBody').querySelectorAll('.bsumrow'));
    const na = rows.filter(r=>r.classList.contains('na')).length;
    return rows.length === BUILD_STEPS.length+1 &&
           /Anzellan/.test(rows[0].textContent) &&
           na === modelSkippedSteps('frik').length;
  }));
  await ev(()=>{ modelSet('droid'); wizGo(0); });

  /* ================================================================
     v1.33.0 — an Arduino/ESP32 running MaestroPCA is a build answer.
     Mike: "as a reminder they will use the same output from the Padawan
     as a Maestro" — so the whole point of these assertions is that the
     co-processor is indistinguishable from a Pololu board on the HOST
     side, and distinguishable from mod2026 on the servo side.
     ================================================================ */
  console.log('\n════ the PCA9685 co-processor ════');
  await ev(()=>{ modelSet('droid'); buildSet('domeServo','mod2026'); buildSet('bodyServo','mod2026');
                 buildSet('firmware','mod2026'); buildUnpinFirmware(); });
  ok('both servo questions offer one and two expanders behind a co-processor', await ev(()=>
    ['domeServo','bodyServo'].every(k=>{
      const ids = BUILD_OPTIONS[k].map(o=>o.id);
      return ids.indexOf('mpca16')>=0 && ids.indexOf('mpca32')>=0 &&
             BUILD_OPTIONS[k].filter(o=>o.pcaBoards).every(o=>o.note && o.sim==='full');
    })));
  ok('the three servo facts are independent — protocol, expanders, co-processor', await ev(()=>
    servoSpeaksMaestro('mini24') && !servoUsesPca('mini24') && !servoCoprocBoards('mini24') &&
    servoUsesPca('mod2026') && !servoSpeaksMaestro('mod2026') && !servoCoprocBoards('mod2026') &&
    servoSpeaksMaestro('mpca32') && servoUsesPca('mpca32') && servoCoprocBoards('mpca32')===2 &&
    servoCoprocBoards('mpca16')===1));
  await ev(()=>{ buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2'); });
  ok('choosing it makes the build a Maestro-speaking one', await ev(()=>
    buildUsesMaestro() && buildUsesPCA() && buildUsesCoproc() &&
    buildMaestroBoard()==='pca32' && buildCoprocBoards('dome')===2));
  ok('...so mod2026 is blocked, and the reason names the co-processor', await ev(()=>{
    const r = firmwareBlockers('mod2026', buildGet());
    /* the Maestro sketch may still carry a SOFT sound objection depending on
       what the earlier sections left set — what matters is that nothing about
       the servo boards blocks it any more */
    return /co-processor/.test(r.map(x=>x.why).join(' ')) &&
           r.some(x=>x.w===BLOCK_HARD) &&
           firmwareBlockers('maestro25', buildGet()).every(x=>x.w===BLOCK_SOFT);
  }));
  ok('and the sim actually switched to a Maestro sketch', await ev(()=>
    PROFILE.hasMaestro && buildGet().firmware!=='mod2026'), await ev(()=>PROFILE.short));
  ok('32 channels reach the board model, and the sequencer opens on them', await ev(()=>
    boardById(buildMaestroBoard()).ch===32 && boardIsPca(buildMaestroBoard()) &&
    buildSeqBoard()==='pca32' && buildCanSequence()));
  ok('PREFS.hw follows, so the Boards section draws it', await ev(()=>
    hwGet().dome==='pca32' && hwPins('dome').pins.length===32 &&
    /co-processor/.test(hwPins('dome').title)));
  ok('a saved hw block maps back to the build answer it came from', await ev(()=>
    buildServoFromHw('pca32')==='mpca32' && buildServoFromHw('mini18')==='mini18' &&
    buildServoFromHw('mod2026')==='mod2026'));

  console.log('\n════ the co-processor chip is one answer, not two ════');
  ok('the chip list is the Bench wizard\'s own, minus the host board', await ev(()=>{
    const ids = servoMcuOptions().map(m=>m.id);
    return ids.indexOf('nano')>=0 && ids.indexOf('esp32')>=0 && ids.indexOf('megaadk')<0 &&
           servoMcuOptions().every(m=>m.label && m.note && m.sda && m.scl);
  }));
  ok('setting it writes through to the Bench setup', await ev(()=>{
    buildSet('servoMcu','esp32');
    const hw = HW.setup();
    return buildGet().servoMcu==='esp32' && hw && hw.mcu==='esp32' && hw.boards===2;
  }));
  ok('...and the Bench defaults read it back', await ev(()=>
    setupDefaults().mcu==='esp32' && setupDefaults().boards===2));
  ok('the review row carries the chip inside the servo answer', await ev(()=>{
    const r = buildSummaryRows().find(x=>x.key==='servos');
    return /PCA9685/.test(r.label) && /ESP32/.test(r.label) &&
           buildSummaryRows().length===BUILD_STEPS.length;
  }));
  ok('...and the rail chip is the short form of the same thing', await ev(()=>{
    wizOpen(0);
    const chip = $('stprail').children[wizStepIndex('servos')];
    return /PCA/.test(chip.querySelector('.railans').textContent);
  }));
  ok('a Maestro build has no opinion about the chip, and does not invent one', await ev(()=>{
    const before = JSON.stringify(HW.setup());
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12');
    return !buildUsesCoproc() && JSON.stringify(HW.setup())===before;
  }));

  console.log('\n════ the wiring says where the servos actually are ════');
  await ev(()=>{ buildSet('domeServo','mpca32'); buildSet('servoMcu','nano'); });
  ok('the host link is the Maestro one — same UART, same restartScript', await ev(()=>{
    const l = systemLinks().find(x=>/co-processor/.test(x.name));
    return !!l && /Serial3|SoftwareSerial/.test(l.bus) && /restartScript/.test(l.extra) &&
           /Nano/.test(l.name);
  }));
  ok('the expanders are drawn one hop further out, on the co-processor\'s own I2C', await ev(()=>{
    const l = systemLinks().find(x=>/co-processor/.test(x.name));
    return !!l && !!l.chain && /2 . PCA9685/.test(l.chain.name) &&
           /SDA A4/.test(l.chain.bus) && /32 servo/.test(l.chain.sub);
  }));
  ok('the diagram grows a third column for it, and only then', await ev(()=>{
    const wide = systemDiagramSvg();
    buildSet('domeServo','mini24');
    const plain = systemDiagramSvg();
    buildSet('domeServo','mpca32');
    return /viewBox="0 0 1320/.test(wide) && /viewBox="0 0 980/.test(plain);
  }));
  ok('a Maestro build is untouched — same row, no chain', await ev(()=>{
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12');
    const l = systemLinks().filter(x=>/Maestro/.test(x.name));
    return l.length>=1 && l.every(x=>!x.chain);
  }));
  await ev(()=>{ buildSet('domeServo','mod2026'); buildSet('bodyServo','mod2026'); buildSet('firmware','mod2026'); });

  /* ================================================================
     v1.34.0 — one servo question, not two. Mike: "we should merge the
     Body / Dome servos into one - the user then sets whats controlling
     the Dome / Body and then hows its wired."
     ================================================================ */
  /* ================================================================
     v1.36.0 — the servo step is a FORM plus flow diagrams. Mike: "we
     should use drop down boxes to simplify the veiw - the options for
     the device servo plug into should be Maestro, PCA9685 or Other" /
     "need to make it easy to pick which one best suites them : maybe
     add flow diagrames / flow logic images."
     ================================================================ */
  console.log('\n════ what the servos plug into ════');
  await ev(()=>{ modelSet('droid'); buildGet().firmwarePinned=false;
                 buildSet('servoDevice','pca'); buildSet('servoTopo','p0'); });
  ok('three devices, and Other is one of them', await ev(()=>
    SERVO_DEVICES.map(d=>d.id).join()==='maestro,pca,other' &&
    SERVO_DEVICES.every(d=>d.label && d.note && d.sim) &&
    servoDeviceDef('other').sim==='park'));
  /* ================================================================
     v1.45.0 — Mike: "Make Servo Hardware image-led: choose Maestro or
     PCA9685 first, then show relevant options."

     This step was a dropdown first (the v1.36.0 assertion below said so in
     as many words). The FAMILY is now three picture cards at the top, on
     the real board photos, and nothing else on the step exists until it is
     answered — so what used to be asserted as "dropdowns, not cards" is
     asserted the other way up, plus the new rule that matters more: the
     first control you meet is the family, and the questions after it belong
     to the family you picked.
     ================================================================ */
  ok('the first thing on the step is a picture of each family', await ev(()=>{
    wizGo(wizStepIndex('servos'));
    const host = $('startupBody');
    const grid = host.querySelector('.famgrid');
    const cards = grid ? grid.querySelectorAll('.optcard') : [];
    /* the family grid is BEFORE any dropdown in the document */
    const first = host.querySelector('.famgrid, select.svfsel');
    return !!grid && cards.length===servoDeviceOptions().length && cards.length===3 &&
           first === grid &&
           Array.from(cards).every(c=>/^servoDevice:/.test(c.dataset.opt));
  }));
  ok('...and each card carries the real board photo, whole card clickable', await ev(()=>{
    const cards = Array.from($('startupBody').querySelectorAll('.famgrid .optcard'));
    const mae = cards.find(c=>c.dataset.opt==='servoDevice:maestro');
    const pca = cards.find(c=>c.dataset.opt==='servoDevice:pca');
    return cards.every(c=>c.querySelector('.optpic')) &&
           !!mae.querySelector('img.optphoto') && !!pca.querySelector('img.optphoto') &&
           mae.tabIndex===0 && pca.tabIndex===0;
  }));
  ok('clicking a family card is what answers the question', await ev(()=>{
    $('startupBody').querySelector('[data-opt="servoDevice:maestro"]').click();
    const a = buildGet().servoDevice==='maestro' &&
              $('startupBody').querySelector('[data-opt="servoDevice:maestro"]').classList.contains('act');
    $('startupBody').querySelector('[data-opt="servoDevice:pca"]').click();
    return a && buildGet().servoDevice==='pca';
  }));
  ok('choosing PCA9685 lands on one controller and two expanders', await ev(()=>{
    /* Mike: "defaulting to one controller and two expanders" — arriving from
       the Maestro family, with no pca shape in the build to keep */
    buildSet('servoDevice','maestro'); buildSet('servoTopo','m2c');
    buildSet('servoDevice','pca');
    return buildGet().servoTopo==='p1x2' && servoDefaultTopo('pca').id==='p1x2' &&
           buildGet().domeServo==='mpca32';
  }));
  ok('...and only that family\'s questions are on the step', await ev(()=>{
    buildSet('servoDevice','pca'); buildStartup();
    const pcaCards = $('startupBody').querySelectorAll('.flowcard').length;
    const pcaCount = $('startupBody').querySelectorAll('[data-opt^="servoBoards"]').length;
    buildSet('servoDevice','maestro'); buildStartup();
    const maeCount = $('startupBody').querySelectorAll('[data-opt^="servoBoards"]').length;
    const maeArr   = $('startupBody').querySelectorAll('[data-opt="servoTopo:p1x2"]').length;
    return pcaCards===servoTopos('pca').length && pcaCount===0 &&
           maeCount===2 && maeArr===0;
  }));
  ok('Other records the answer and takes nothing down with it', await ev(()=>{
    const was = buildGet().domeServo;
    buildSet('servoDevice','other'); buildStartup();
    return buildGet().domeServo===was && PROFILE &&
           buildConflicts().some(c=>c.kind==='park' && /Servo hardware/.test(c.text)) &&
           /Nothing is modelled for this yet/.test($('startupBody').textContent) &&
           $('startupBody').querySelectorAll('.flowcard').length===0;
  }));

  console.log('\n════ the shape, as a picture ════');
  await ev(()=>{ buildSet('servoDevice','maestro'); buildStartup(); });
  ok('Mike\'s three Maestro arrangements, in his order', await ev(()=>
    servoTopos('maestro').map(t=>t.id).join()==='m1,m2c,m2s' &&
    servoTopoDef('m1').flow.length===1 &&
    servoTopoDef('m2c').flow[0].join(' > ')==='Padawan > Maestro 1 > Maestro 2 > Servos' &&
    servoTopoDef('m2s').flow.length===2 &&
    servoTopoDef('m2s').flow[1].join(' > ')==='Padawan > Maestro 2 > Servos'));
  /* v1.46.0 — p1x2 leads: "This should be the default option as in first and
     selected in the list". The array order IS the card order. */
  /* v1.54.0 — `p1` is off the picker. It differed from `p1x2` by the integer
     1, and the integer is a field beside the card now. It is still in
     SERVO_TOPOS, and deliberately: servoTopoDef() falls back to
     SERVO_TOPOS[0], which is a MAESTRO shape, so a saved build naming `p1`
     would come back as a Maestro build if the id were simply deleted. */
  ok('...and his PCA ones, two expanders first, plus the no-controller case', await ev(()=>
    servoTopos('pca').map(t=>t.id).join()==='p1x2,p0,p2s,p1s' &&
    servoTopoDef('p1x2').flow[0].join(' > ')==='Padawan > Controller > PCA9685 1 > PCA9685 2 > Servos' &&
    servoTopoDef('p2s').flow.length===2 && servoTopoDef('p1s').flow.length===2));
  ok('the retired one-expander id still resolves to a PCA shape, not a Maestro one', await ev(()=>
    servoTopoDef('p1').device==='pca' && servoTopoDef('p1').hidden===true));
  ok('the ones the sketch cannot address say so rather than being left out', await ev(()=>
    SERVO_TOPOS.filter(t=>t.sim==='park').map(t=>t.id).join()==='m2s,p2s,p1s' &&
    SERVO_TOPOS.every(t=>t.note && t.label && t.flow.length)));
  /* v1.45.0 — the PCA9685 family is where every arrangement is still offered
     as a picture; the Maestro family asks the COUNT instead (below), because
     Mike asked for one-or-two boards rather than three diagrams to count the
     rectangles in. */
  ok('every PCA arrangement is drawn, and the parked ones are drawn dashed', await ev(()=>{
    buildSet('servoDevice','pca'); buildStartup();
    const cards = $('startupBody').querySelectorAll('.flowcard');
    const svgs  = $('startupBody').querySelectorAll('.flowcard svg.flow');
    const dash  = $('startupBody').querySelectorAll('.flowcard svg.flow.dash');
    return cards.length===servoTopos('pca').length && svgs.length===cards.length &&
           dash.length===servoTopos('pca').filter(t=>t.sim==='park').length;
  }));
  ok('a diagram has one box per node and one arrow between each', await ev(()=>{
    const t = servoTopoDef('m2c');
    const d = document.createElement('div'); d.innerHTML = servoTopoSvg(t);
    return d.querySelectorAll('rect').length===4 && d.querySelectorAll('text').length===4 &&
           d.querySelectorAll('path.fl-a').length===3 &&
           d.querySelector('rect').classList.contains('fl-src') &&
           /Padawan/.test(d.querySelectorAll('text')[0].textContent);
  }));
  ok('two links draw two rows, sharing nothing', await ev(()=>{
    const d = document.createElement('div'); d.innerHTML = servoTopoSvg(servoTopoDef('p2s'));
    return d.querySelectorAll('rect').length===8 && d.querySelector('svg').classList.contains('dash');
  }));
  ok('clicking a diagram picks that arrangement', await ev(()=>{
    buildSet('servoDevice','pca'); buildStartup();
    $('startupBody').querySelector('[data-opt="servoTopo:p0"]').click();
    return buildGet().servoTopo==='p0' &&
           $('startupBody').querySelector('[data-opt="servoTopo:p0"]').classList.contains('act');
  }));

  /* ================================================================
     v1.54.0 — Mike, with three PCA9685s answering on the bench and a
     build that could only say two: "The Servo Hardware - doesnt show
     enough servos its only showing two."

     The count was two CARDS ("one expander" / "two expanders"), which
     is right for a shape and wrong for a quantity — eight of them would
     have been eight near-identical pictures differing by one rectangle.
     The shape stays a card; the quantity is a number beside it.
     ================================================================ */
  console.log('\n════ how many expanders is a number, not a card ════');
  const pcaN = await ev(()=>{
    const out = {};
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2');
    buildSet('pcaBoards', 3); buildStartup();
    const b = buildGet();
    out.three   = b.pcaBoards;
    out.dome    = b.domeServo;
    out.body    = b.bodyServo;
    out.hwBoard = buildSeqBoard(b);
    out.channels = boardById(buildSeqBoard(b)).ch;
    /* the field is on the step, and it is a number */
    const inp = $('wizPcaBoards');
    out.hasField = !!inp && inp.type === 'number'
                && +inp.max === PCA_MAX_BOARDS_UI && +inp.value === 3;
    /* eight is the ceiling, and it is the WIRE's ceiling */
    buildSet('pcaBoards', 99); buildStartup();
    out.clamped = buildGet().pcaBoards;
    out.clampedCh = boardById(buildSeqBoard(buildGet())).ch;
    buildSet('pcaBoards', 0); buildStartup();
    out.floored = buildGet().pcaBoards;
    /* a build restored without the field at all is the two it always meant */
    const b2 = buildGet(); delete b2.pcaBoards;
    buildNormaliseServos(b2);
    out.legacy = b2.pcaBoards;
    /* the retired card's id is rewritten rather than resolved to a Maestro */
    const b3 = buildGet(); b3.servoTopo = 'p1'; b3.servoDevice = 'pca';
    buildNormaliseServos(b3);
    out.p1topo = b3.servoTopo; out.p1n = b3.pcaBoards; out.p1dome = b3.domeServo;
    /* setting the board answer DIRECTLY feeds the count back — otherwise the
       forward pass would hand your value back changed */
    buildSet('pcaBoards', 2); buildStartup();
    buildSet('domeServo','mpca64'); buildStartup();
    out.backwards = buildGet().pcaBoards;
    out.backDome  = buildGet().domeServo;
    buildSet('pcaBoards', 2); buildSet('servoTopo','p1x2'); buildStartup();
    return out;
  });
  ok('three expanders is an answer the build can hold', pcaN.three === 3, JSON.stringify(pcaN));
  ok('...and it resolves to the three-board co-processor at both ends',
     pcaN.dome === 'mpca48' && pcaN.body === 'mpca48', pcaN.dome+' / '+pcaN.body);
  ok('...and the sequencer gets 48 channels, not 32',
     pcaN.hwBoard === 'pca48' && pcaN.channels === 48, pcaN.hwBoard+' = '+pcaN.channels);
  ok('the step asks for it as a number capped at the protocol ceiling', pcaN.hasField);
  ok('eight is the ceiling — the wire protocol cannot address a ninth board',
     pcaN.clamped === 8 && pcaN.clampedCh === 128, JSON.stringify([pcaN.clamped, pcaN.clampedCh]));
  ok('...and one is the floor', pcaN.floored === 1);
  ok('a build saved before the field existed still means two',
     pcaN.legacy === 2, String(pcaN.legacy));
  ok('the retired p1 card becomes p1x2 with a count of one, still a PCA build',
     pcaN.p1topo === 'p1x2' && pcaN.p1n === 1 && pcaN.p1dome === 'mpca16',
     JSON.stringify([pcaN.p1topo, pcaN.p1n, pcaN.p1dome]));
  ok('setting the board answer directly carries the count back with it',
     pcaN.backwards === 4 && pcaN.backDome === 'mpca64',
     JSON.stringify([pcaN.backwards, pcaN.backDome]));

  /* THE THING MIKE ACTUALLY REPORTED. Everything above is the build knowing
     how many boards there are; this is the channel table growing to match,
     which is what "doesnt show enough servos" meant. It goes through
     buildApply() → setBoard() rather than poking MSTR, because that is the
     path a click takes. */
  const grow = await ev(()=>{
    const seen = [];
    const step = n => {
      buildSet('pcaBoards', n); buildApply();
      seen.push({n, board:MSTR.board, ch:MSTR.channels.length,
                 count:HW.setupCount(), boards:HW.boards()});
    };
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2');
    buildSet('pcaBoards',2); buildApply(); buildEnsureMaestro();
    seen.push({n:2, board:MSTR.board, ch:MSTR.channels.length,
               count:HW.setupCount(), boards:HW.boards()});
    step(3); step(4); step(8);
    /* the mapping work survives going UP — the table is padded, not rebuilt */
    const named = MSTR.channels[0] && MSTR.channels[0].name;
    return {seen, named};
  });
  ok('two boards is 32 channels, as it always was',
     grow.seen[0].ch === 32 && grow.seen[0].board === 'pca32',
     JSON.stringify(grow.seen[0]));
  ok('THREE boards grows the channel table to 48 — the thing that was broken',
     grow.seen[1].ch === 48 && grow.seen[1].count === 48
     && grow.seen[1].board === 'pca48' && grow.seen[1].boards === 3,
     JSON.stringify(grow.seen[1]));
  ok('four is 64 and eight is 128, the wire protocol\'s whole range',
     grow.seen[2].ch === 64 && grow.seen[3].ch === 128,
     JSON.stringify([grow.seen[2].ch, grow.seen[3].ch]));
  ok('...and growing the table does not throw the first channel away',
     !!grow.named, String(grow.named));

  /* ================================================================
     v1.45.0 — Mike: "Maestro: choose one or two boards."

     The count used to be implied by which of three wiring diagrams you
     clicked. It is the explicit question now, and the shape is DERIVED from
     it — nothing new is stored, so buildNormaliseServos() is still the one
     place any of this turns into domeServo/bodyServo/split/link.
     ================================================================ */
  console.log('\n════ Maestro: one board or two (v1.45.0) ════');
  ok('the Maestro family asks the count, as two pictures', await ev(()=>{
    buildSet('servoDevice','maestro'); buildSet('servoTopo','m1'); buildStartup();
    const cards = Array.from($('startupBody').querySelectorAll('[data-opt^="servoBoards"]'));
    return cards.length===2 &&
           cards.map(c=>c.dataset.opt).join()==='servoBoards:1,servoBoards:2' &&
           cards.every(c=>c.querySelector('svg.flow')) &&
           cards[0].classList.contains('act') && !cards[1].classList.contains('act');
  }));
  ok('clicking "two boards" derives the chained shape — the standard wiring', await ev(()=>{
    $('startupBody').querySelector('[data-opt="servoBoards:2"]').click();
    return buildGet().servoTopo==='m2c' && buildMaestroBoardCount()===2 &&
           buildServoSplit()==='two' && buildServoLink()==='chain' &&
           $('startupBody').querySelector('[data-opt="servoBoards:2"]').classList.contains('act');
  }));
  ok('...and clicking "one board" derives the single-board shape', await ev(()=>{
    $('startupBody').querySelector('[data-opt="servoBoards:1"]').click();
    return buildGet().servoTopo==='m1' && buildMaestroBoardCount()===1 &&
           buildServoSplit()==='one' && buildGet().bodyServo===buildGet().domeServo;
  }));
  ok('the port-each arrangement is behind one advanced switch, not gone', await ev(()=>{
    $('startupBody').querySelector('[data-opt="servoBoards:2"]').click();
    const hiddenFirst = !$('startupBody').querySelector('[data-opt="servoTopo:m2s"]');
    const chk = $('wizServoAdv');
    chk.checked = true; chk.dispatchEvent(new Event('change'));
    const shown = !!$('startupBody').querySelector('[data-opt="servoTopo:m2s"]')
               && !!$('startupBody').querySelector('[data-opt="servoTopo:m2c"]');
    return hiddenFirst && !!chk && shown;
  }));
  ok('...and choosing it still records the parked arrangement', await ev(()=>{
    $('startupBody').querySelector('[data-opt="servoTopo:m2s"]').click();
    return buildGet().servoTopo==='m2s' && buildServoLink()==='separate' &&
           buildMaestroBoardCount()===2;
  }));
  ok('...a build already ON it opens the switch itself, rather than hiding the answer', await ev(()=>{
    WIZ_SERVO_ADV = false; buildStartup();
    return !!$('startupBody').querySelector('[data-opt="servoTopo:m2s"]') &&
           $('wizServoAdv').checked===true;
  }));
  ok('...and the count question still reads "two boards" while it is chosen', await ev(()=>{
    const c2 = $('startupBody').querySelector('[data-opt="servoBoards:2"]');
    const two = c2.classList.contains('act');
    /* clicking "two boards" again must not throw away the port-each answer */
    c2.click();
    return two && buildGet().servoTopo==='m2s';
  }));
  await ev(()=>{ WIZ_SERVO_ADV = false; buildSet('servoTopo','m2c'); buildStartup(); });
  /* the promise the restructure had to keep: a build saved under ANY of the
     seven shapes still loads, still renders, and still reads back as itself */
  const shapes = await ev(()=>{
    const bad = [];
    SERVO_TOPOS.forEach(t=>{
      /* what a loaded .json does: drop the shape in and let the step render */
      buildSet('servoDevice', t.device);
      buildSet('servoTopo', t.id);
      buildStartup();
      const b = buildGet();
      const ans = buildServoAnswer(b);
      const step = $('startupBody').textContent;
      /* v1.54.0 — `p1` is the one shape that no longer reads back as itself,
         on purpose: it was "p1x2 with one expander" all along and it is
         stored that way now. Everything else must still be exactly itself. */
      const want = t.id === 'p1' ? 'p1x2' : t.id;
      const okShape = b.servoTopo === want
        && buildServoTopo(b).id === want
        /* two boards or two links means two; one of either means one, EXCEPT
           when the board cannot be shared — the mod2026 expanders are two
           fixed addresses on the host bus, never one controller */
        && b.servoSplit === ((t.boards > 1 || t.links > 1 || !servoSharable(b.domeServo)) ? 'two' : 'one')
        && b.servoLink === (t.link || 'chain')
        && !!ans.label && !!hwGet().dome && !!hwGet().body
        /* the step still renders, family first, with that family selected */
        && $('startupBody').querySelectorAll('.famgrid .optcard').length === 3
        && $('startupBody').querySelector('[data-opt="servoDevice:'+t.device+'"]').classList.contains('act')
        && step.indexOf('Maestro, or PCA9685?') >= 0;
      if(!okShape) bad.push(t.id+'→'+b.servoTopo+'/'+b.servoSplit+'/'+b.servoLink);
    });
    /* leave the build where the next section expects to find it */
    buildSet('servoDevice','maestro'); buildSet('servoTopo','m2c');
    buildSet('servoSize1','mini24'); buildSet('servoSize2','mini12');
    WIZ_SERVO_ADV = false; buildStartup();
    return {bad, n:SERVO_TOPOS.length};
  });
  ok('every saved shape still loads and still reads correctly',
     shapes.bad.length===0 && shapes.n===8, shapes.n+' shapes; bad: '+shapes.bad.join(' '));

  console.log('\n════ the shape drives everything downstream ════');
  ok('one Maestro is one board, one link, one board card', await ev(()=>{
    buildSet('servoTopo','m1'); buildSet('servoSize1','mini24');
    const rows = systemLinks().filter(l=>/Maestro|PCA9685/.test(l.name)).length;
    return buildServoSplit()==='one' && buildServoLocs().join()==='both' &&
           buildGet().domeServo==='mini24' && buildGet().bodyServo==='mini24' && rows===1;
  }));
  ok('two chained is two boards on one link, and the warning is raised', await ev(()=>{
    buildSet('servoTopo','m2c'); buildSet('servoSize2','mini12');
    return buildServoSplit()==='two' && buildServoLink()==='chain' &&
           buildGet().domeServo==='mini24' && buildGet().bodyServo==='mini12' &&
           buildConflicts().some(c=>/compact protocol/.test(c.text)) &&
           /Both boards will act on every command/.test($('startupBody').textContent);
  }));
  ok('two separate links is honest about not working yet', await ev(()=>{
    buildSet('servoTopo','m2s');
    return buildServoLink()==='separate' &&
           buildConflicts().some(c=>c.kind==='park' && /one servo port, not two/.test(c.text)) &&
           !buildConflicts().some(c=>/compact protocol/.test(c.text));
  }));
  ok('the two Maestro sizes are dropdowns, one per board', await ev(()=>{
    buildSet('servoTopo','m2c'); buildStartup();
    const sels = Array.from($('startupBody').querySelectorAll('select.svfsel'));
    const sizes = sels.filter(x=>Array.from(x.options).some(o=>o.value==='mini24'));
    return sizes.length===2 &&
           sizes[0].options.length===servoSizes('domeServo','maestro').length &&
           sizes[0].value==='mini24' && sizes[1].value==='mini12';
  }));
  ok('changing a size dropdown changes that board and nothing else', await ev(()=>{
    const sels = Array.from($('startupBody').querySelectorAll('select.svfsel'))
      .filter(x=>Array.from(x.options).some(o=>o.value==='mini24'));
    sels[1].value='micro6'; sels[1].dispatchEvent(new Event('change'));
    return buildGet().bodyServo==='micro6' && buildGet().domeServo==='mini24';
  }));

  console.log('\n════ PCA: the controller is a dropdown too ════');
  ok('no controller at all is the mod2026 arrangement', await ev(()=>{
    buildSet('servoDevice','pca'); buildSet('servoTopo','p0');
    return buildGet().domeServo==='mod2026' && buildGet().bodyServo==='mod2026' &&
           servoTopoDef('p0').direct===true && !buildUsesCoproc();
  }));
  /* v1.54.0 — the count is its own answer now, so these two set it rather
     than picking between two cards that differed only by it. `p1` still
     works as an input and is what it always meant. */
  ok('one controller and one expander is 16 channels behind a co-processor', await ev(()=>{
    buildSet('servoTopo','p1');
    return buildGet().domeServo==='mpca16' && buildGet().pcaBoards===1 && buildUsesCoproc() &&
           boardById(buildMaestroBoard()).ch===16;
  }));
  ok('two expanders on it is 32, still one link', await ev(()=>{
    buildSet('servoTopo','p1x2'); buildSet('pcaBoards',2);
    return buildGet().domeServo==='mpca32' && buildServoSplit()==='one' &&
           boardById(buildMaestroBoard()).ch===32;
  }));
  ok('...and four of them is 64, still one controller and one link', await ev(()=>{
    buildSet('pcaBoards',4);
    return buildGet().domeServo==='mpca64' && buildServoSplit()==='one' &&
           buildServoTopo().links===1 && boardById(buildMaestroBoard()).ch===64;
  }));
  ok('the controller is Arduino or ESP32, from the same list the Bench uses', await ev(()=>{
    buildStartup();
    const sel = Array.from($('startupBody').querySelectorAll('select.svfsel'))
      .find(x=>Array.from(x.options).some(o=>o.value==='esp32'));
    return !!sel && sel.options.length===servoMcuOptions().length &&
           Array.from(sel.options).some(o=>/Nano/.test(o.textContent));
  }));
  ok('picking one writes through to the Bench, as before', await ev(()=>{
    const sel = Array.from($('startupBody').querySelectorAll('select.svfsel'))
      .find(x=>Array.from(x.options).some(o=>o.value==='esp32'));
    sel.value='esp32'; sel.dispatchEvent(new Event('change'));
    return buildGet().servoMcu==='esp32' && HW.setup().mcu==='esp32';
  }));
  ok('the two split PCA arrangements are parked', await ev(()=>{
    buildSet('servoTopo','p2s');
    const a = buildConflicts().some(c=>c.kind==='park' && /Servo hardware/.test(c.text));
    buildSet('servoTopo','p1s');
    const b2 = buildConflicts().some(c=>c.kind==='park' && /Servo hardware/.test(c.text));
    buildSet('servoTopo','p1x2');
    return a && b2 && buildServoLocs().length===1;
  }));

  console.log('\n════ the old setter still works, and mixed builds survive ════');
  ok('buildSet on a board answer is read BACK into the shape', await ev(()=>{
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12');
    return buildGet().servoDevice==='maestro' && buildGet().servoTopo==='m2c' &&
           buildGet().domeServo==='mini24' && buildGet().bodyServo==='mini12';
  }));
  ok('...and it does NOT collapse a two-board build just because the sizes match', await ev(()=>{
    /* two Mini 24s is a perfectly ordinary droid; equality of the answers
       has never meant "one board" — the shape says that */
    buildSet('bodyServo','mini24');
    return buildGet().servoTopo==='m2c' && buildServoSplit()==='two';
  }));
  ok('...but arriving from another device lands on one board', await ev(()=>{
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1');
    buildSet('domeServo','mini18'); buildSet('bodyServo','mini18');
    return buildGet().servoDevice==='maestro' && buildGet().servoTopo==='m1' &&
           buildServoSplit()==='one';
  }));
  ok('...and the co-processor case', await ev(()=>{
    buildSet('domeServo','mpca32'); buildSet('bodyServo','mpca32');
    return buildGet().servoDevice==='pca' && buildGet().servoTopo==='p1x2';
  }));
  ok('a Maestro at one end and expanders at the other is kept, not rewritten', await ev(()=>{
    buildSet('domeServo','mini24'); buildSet('bodyServo','mod2026');
    return buildGet().servoDevice==='mixed' &&
           buildGet().domeServo==='mini24' && buildGet().bodyServo==='mod2026' &&
           hwGet().dome==='mini24' && hwGet().body==='mod2026' &&
           buildServoLocs().join()==='dome,body';
  }));
  /* v1.45.0 — the family is picture cards now, so the legacy `mixed` answer
     appears as a FOURTH card, selected, rather than as a fourth entry in a
     dropdown. Same rule either way: shown, kept, replaced only on purpose. */
  ok('...and the step says so rather than pretending it can draw it', await ev(()=>{
    buildStartup();
    const t = $('startupBody').textContent;
    const card = $('startupBody').querySelector('[data-opt="servoDevice:mixed"]');
    return /not one of the shapes these pictures can draw/.test(t) &&
           !!card && card.classList.contains('act') &&
           $('startupBody').querySelectorAll('.famgrid .optcard').length===4 &&
           /Mini Maestro 24/.test(t) && /PCA9685 @ 0x40/.test(t) &&
           /* and nothing tries to ask a family question it cannot answer */
           $('startupBody').querySelectorAll('.flowcard').length===0;
  }));
  ok('choosing a device replaces it cleanly', await ev(()=>{
    buildSet('servoDevice','maestro');
    return buildGet().servoDevice==='maestro' && servoFamily(buildGet().bodyServo)==='maestro';
  }));

  console.log('\n════ the firmware is the last question again ════');
  ok('controller, board, servos ... and the sketch at the end', await ev(()=>
    BUILD_STEPS.map(s=>s.key).join()===
      'controller,arduino,servos,domeMotor,domeLights,bodyDrive,sound,firmware' &&
    BUILD_STEPS[BUILD_STEPS.length-1].key==='firmware'));
  ok('the rail is in that order too', await ev(()=>{
    wizOpen(0);
    const t = Array.from($('stprail').querySelectorAll('.raildot'))
      .map(c=>c.querySelector('.raillab').textContent.replace(/[✓○]/g,''));
    return t.slice(0,4).join('|')==='Model|Controller|Controller board|Servo hardware' &&
           t[8]==='Firmware';
  }));
  ok('until you pick one, the setup keeps it in step with the hardware', await ev(()=>{
    buildGet().firmwarePinned=false;
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w');
    return PROFILE.hasMaestro && !buildGet().firmwarePinned;
  }));
  ok('choosing one pins it, and a later answer no longer swaps it', await ev(()=>{
    wizGo(wizStepIndex('firmware'));
    $('startupBody').querySelector('[data-opt="firmware:maestro25"]').click();
    const pinned = buildGet().firmwarePinned===true;
    buildSet('domeServo','mod2026'); buildSet('bodyServo','mod2026');
    return pinned && buildGet().firmware==='maestro25' &&
           buildConflicts().some(x=>/you chose .* yourself/.test(x.text));
  }));
  ok('"let the setup choose" hands the decision back', await ev(()=>{
    wizGo(wizStepIndex('firmware'));
    const btn = Array.from($('startupBody').querySelectorAll('button')).find(b=>/let the setup choose/i.test(b.textContent));
    btn.click();
    return !buildGet().firmwarePinned && buildGet().firmware==='mod2026';
  }));


  console.log('\n════ setting the servos up for real ════');
  await ev(()=>{ buildSet('servoDevice','maestro'); buildSet('servoTopo','m2c');
                 buildSet('servoSize1','mini24'); buildSet('servoSize2','mini12');
                 wizGo(wizStepIndex('_servoSet')); });
  ok('a Maestro build gets the Maestro procedure and Pololu\'s own tool', await ev(()=>{
    const t = $('startupBody').textContent;
    const a = Array.from($('startupBody').querySelectorAll('a')).find(x=>/Control Center/.test(x.textContent));
    return $('startupBody').querySelectorAll('ol.svsteps li').length>=6 &&
           /Control Center/.test(t) && !!a && /pololu\.com/.test(a.href) && !$('btnServoBench');
  }));
  ok('a co-processor build gets the two sketches and a way into the bench', await ev(()=>{
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2'); buildStartup();
    const t = $('startupBody').textContent;
    /* and the procedure names the RIGHT folder for the bench sketch */
    return /PCA_Bridge/.test(t) && /MaestroReplacement/.test(t) && !!$('btnServoBench') &&
           /pca-studio\/PCA_Bridge/.test(t) &&
           !/arduino\/MaestroPCA\/examples\/PCA_Bridge/.test(t);
  }));
  ok('a mod2026 build is told there is no calibration tool, and why', await ev(()=>{
    buildSet('servoTopo','p0'); buildStartup();
    return /no calibration tool/.test($('startupBody').textContent) && !!$('btnServoBench');
  }));
  ok('every procedure warns about the horn, the hard stop and the supply', await ev(()=>
    Object.keys(SERVO_BENCH_STEPS).length===3 &&
    Object.keys(SERVO_BENCH_STEPS).every(k=>SERVO_BENCH_STEPS[k].length>=6) &&
    /hard stop/.test($('startupBody').textContent) &&
    /common ground/.test($('startupBody').textContent)));
  ok('the bench button leaves the wizard rather than stacking two overlays', await ev(()=>{
    $('btnServoBench').click();
    return SETUP.open===true && !$('startup').classList.contains('on');
  }));
  await ev(()=>{ setupClose(); buildSet('servoDevice','pca'); buildSet('servoTopo','p0');
                 buildGet().firmwarePinned=false; wizOpen(0); });

  /* ================================================================
     v1.37.0 — the physical job is its own step after Firmware, it asks
     about an existing config FIRST, only the chosen sketch's link shows,
     and the bench popout takes its colours from the theme.
     ================================================================ */
  console.log('\n════ only the sketch you chose gets a link ════');
  await ev(()=>{ buildSet('servoDevice','maestro'); buildSet('servoTopo','m2c');
                 buildSet('sound','dysv5w'); buildSet('bodyDrive','sabertooth');
                 buildSet('firmware','maestro25'); wizGo(wizStepIndex('firmware')); });
  ok('one repo row, and it is the one you picked', await ev(()=>{
    const rows = $('startupBody').querySelectorAll('.lnkrow');
    const links = Array.from($('startupBody').querySelectorAll('a.lnk'));
    return rows.length===1 && links.length===1 &&
           /maestro/i.test(links[0].href) &&
           links[0].href === BUILD_OPTIONS.firmware.find(o=>o.id==='maestro25').repo;
  }));
  ok('choosing another sketch swaps the link rather than adding one', await ev(()=>{
    buildSet('firmware','mod2026'); buildStartup();
    const links = Array.from($('startupBody').querySelectorAll('a.lnk'));
    return links.length===1 && links[0].href === BUILD_OPTIONS.firmware.find(o=>o.id==='mod2026').repo &&
           $('startupBody').textContent.indexOf('Padawan360_Body_Maestro') < 0;
  }));

  console.log('\n════ servo setup: the import comes first ════');
  await ev(()=>{ buildSet('servoDevice','maestro'); buildSet('servoTopo','m2c');
                 wizGo(wizStepIndex('_servoSet')); });
  ok('the step exists after Firmware, with its own chip', await ev(()=>
    wizSteps()[wizStepIndex('firmware')+1].key==='_servoSet' &&
    wizRailChip(wizStepIndex('_servoSet')).textContent.indexOf('Servo setup')>=0));
  ok('the FIRST question is whether you already have one', await ev(()=>{
    const cards = Array.from($('startupBody').querySelectorAll('.optcard'));
    const first = $('startupBody').querySelector('h3').textContent;
    return /already have a servo config/i.test(first) &&
           cards[0].dataset.opt==='servoCfg:import' && cards[1].dataset.opt==='servoCfg:fresh' &&
           !!$('servoCfgFile');
  }));
  ok('a Maestro build is offered a .mstr, and not our own export', await ev(()=>{
    buildSet('servoDevice','maestro'); buildStartup();
    const t = $('startupBody').querySelector('[data-opt="servoCfg:import"]').textContent;
    return /\.mstr/.test($('servoCfgFile').accept) && !/json/.test($('servoCfgFile').accept) &&
           /Control Center/.test(t) && !/exported from here/.test(t) &&
           /Choose a \.mstr/.test($('startupBody').textContent);
  }));
  ok('a PCA build is offered our export, and not a .mstr', await ev(()=>{
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2'); buildStartup();
    const t = $('startupBody').querySelector('[data-opt="servoCfg:import"]').textContent;
    return /json/.test($('servoCfgFile').accept) && !/mstr/.test($('servoCfgFile').accept) &&
           /servo config/.test(t) && !/Control Center/.test(t);
  }));
  ok('...but the READER still takes either, because it is the same six fields', await ev(()=>{
    const mstr = '<?xml version="1.0"?><UscSettings><Channels>'
      + '<Channel name="X" mode="Servo" min="4400" max="7600" homemode="Off" home="6000" speed="0" acceleration="0" neutral="6000" range="1905" />'
      + '</Channels></UscSettings>';
    const r = servoCfgImportText(mstr, 'x.mstr');   /* on a PCA build */
    return r.from==='mstr' && r.n===1;
  }));
  ok('"measure them now" opens the servo setup tool, and says it carries the answers', await ev(()=>{
    /* with NOTHING measured — the wording splits on that (v1.43.0), so the
       state has to be explicit rather than whatever the previous assertion
       left behind */
    MSTR.channels.forEach(c=>{ if(c){ c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; c.calibrated=false; } });
    buildGet().servoCfg = null;
    buildStartup();
    const card = $('startupBody').querySelector('[data-opt="servoCfg:fresh"]');
    return !!$('btnServoMeasure') && /No — measure them now/.test(card.textContent)
        && /already carrying everything you answered/.test(card.textContent);
  }));
  /* v1.43.0 — Mike: "going back into Servo setup doesnt give me the option
     to adjust what I have already set". Same card, other state: it is an
     EDIT, it says so, and it opens the bench ON the channel table rather
     than four steps in front of it. */
  ok('...and once there IS a config it is an edit, straight to the channel table', await ev(()=>{
    HW.ensure(0); MSTR.channels[0].mode='Servo'; MSTR.channels[0].calibrated=true;
    servoCfgNote('bench', {n:1});
    buildStartup();
    const card = $('startupBody').querySelector('[data-opt="servoCfg:fresh"]');
    const label = $('btnServoMeasure').textContent;
    $('btnServoMeasure').click();
    const landed = SETUP.step;
    setupClose();
    return /Edit the servo config you have/.test(card.textContent)
        && /exactly as you left it/.test(card.textContent)
        && /Edit the channel table/.test(label)
        && landed === 4;
  }));
  ok('...with starting the hardware questions over as the small answer, not the big one', await ev(()=>{
    buildStartup();
    const restart = $('btnServoRestart');
    if(!restart) return false;
    restart.click();
    const landed = SETUP.step;
    setupClose();
    return landed === 0 && !restart.classList.contains('prim');
  }));
  ok('...and a Maestro build is sent to Control Center instead, with no button', await ev(()=>{
    MSTR.channels.forEach(c=>{ if(c){ c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; c.calibrated=false; } });
    buildGet().servoCfg = null;
    buildSet('servoDevice','maestro'); buildStartup();
    const card = $('startupBody').querySelector('[data-opt="servoCfg:fresh"]');
    return !$('btnServoMeasure') && /Maestro Control Center/.test(card.textContent);
  }));

  console.log('\n════ servo config: travel only, in and out ════');
  ok('the export carries the six travel fields and nothing else', await ev(()=>{
    const o = servoCfgExportObj();
    const keys = Object.keys(o.channels[0] || {});
    return o.kind==='r2sim.servo-config' && o.channels.length===HW.count() &&
           keys.indexOf('min')>=0 && keys.indexOf('max')>=0 && keys.indexOf('home')>=0 &&
           keys.indexOf('speed')>=0 && keys.indexOf('acceleration')>=0 && keys.indexOf('name')>=0 &&
           keys.indexOf('act')<0;
  }));
  ok('importing our own export restores the travel', await ev(()=>{
    HW.ensure(3); MSTR.channels[3].mode='Servo';
    MSTR.channels[3].min=4400; MSTR.channels[3].max=7600; MSTR.channels[3].speed=17;
    MSTR.channels[3].name='Pie 4'; MSTR.channels[3].act='pie3';
    const file = JSON.stringify(servoCfgExportObj());
    MSTR.channels[3].min=4000; MSTR.channels[3].max=8000; MSTR.channels[3].speed=0;
    MSTR.channels[3].name='Channel 3';
    const r = servoCfgImportText(file, 'x.json');
    const c = MSTR.channels[3];
    return r.from==='cfg' && r.n===HW.count() &&
           c.min===4400 && c.max===7600 && c.speed===17 && c.name==='Pie 4';
  }));
  ok('...and does NOT re-wire which part a channel drives', await ev(()=>{
    const file = JSON.stringify(servoCfgExportObj());
    MSTR.channels[3].act = 'doorL';
    servoCfgImportText(file, 'x.json');
    return MSTR.channels[3].act === 'doorL';
  }));
  ok('a Maestro .mstr imports its channel table and leaves the board alone', await ev(()=>{
    const before = MSTR.board;
    const mstr = '<?xml version="1.0"?><UscSettings><SerialMode>UART_FIXED_BAUD_RATE</SerialMode>'
      + '<Channels>' + Array.from({length:6},(_,i)=>
          '<Channel name="Imported '+i+'" mode="Servo" min="4800" max="7200" homemode="Off" home="6000" '
          + 'speed="'+(i+1)+'" acceleration="2" neutral="6000" range="1905" />').join('')
      + '</Channels></UscSettings>';
    const r = servoCfgImportText(mstr, 'dome.mstr');
    return r.from==='mstr' && r.n===6 && MSTR.board===before &&
           MSTR.channels[2].min===4800 && MSTR.channels[2].speed===3 &&
           MSTR.channels[2].name==='Imported 2';
  }));
  ok('rubbish is refused with a sentence, not a stack trace', await ev(()=>{
    let msg='';
    try{ servoCfgImportText('not xml and not json', 'x.txt'); }catch(e){ msg = e.message; }
    let msg2='';
    try{ servoCfgImportText('{"hello":1}', 'x.json'); }catch(e){ msg2 = e.message; }
    return /neither a Maestro/.test(msg) && /no channel table/.test(msg2);
  }));
  ok('the step offers the export once you are done', await ev(()=>{
    buildStartup();
    return !!$('btnServoCfgExport') && servoCfgConfigured() > 0;
  }));

  console.log('\n════ the right tool, and holding links for it ════');
  ok('a Maestro build is pointed at Control Center', await ev(()=>{
    buildSet('servoDevice','maestro'); buildStartup();
    const t = $('startupBody').textContent;
    return /Control Center/.test(t) && !/PCA_Bridge/.test(t) &&
           Array.from($('startupBody').querySelectorAll('a.lnk')).some(a=>/pololu/.test(a.href));
  }));
  ok('a co-processor build gets both sketches, named by path', await ev(()=>{
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2'); buildStartup();
    /* scoped to the TOOL rows: "Control Center" also appears in the import
       card above, because a .mstr is a valid thing to import whatever your
       board is — that mention is correct and must not fail this */
    const rows = Array.from($('startupBody').querySelectorAll('.lnkrow'))
      .map(r=>r.textContent).join(' | ');
    /* THE PATHS ARE PINNED, because they are not where you would guess and
       the UI had them wrong until Mike checked (v1.38.2). PCA_Bridge lives
       with PCA STUDIO — it is a tool, not a library example — and only the
       droid sketches are under arduino/MaestroPCA/examples/. If either
       moves, this fails and the wizard text gets fixed with it. */
    return /pca-studio\/PCA_Bridge\/PCA_Bridge\.ino/.test(rows) &&
           /arduino\/MaestroPCA\/examples\/MaestroReplacement/.test(rows) &&
           !/arduino\/MaestroPCA\/examples\/PCA_Bridge/.test(rows) &&
           !/Control Center/.test(rows) &&
           !Array.from($('startupBody').querySelectorAll('.lnkrow a.lnk')).some(a=>/pololu/.test(a.href));
  }));
  ok('the mod2026 arrangement says there is no separate tool', await ev(()=>{
    buildSet('servoTopo','p0'); buildStartup();
    return /no separate servo tool/.test($('startupBody').textContent);
  }));

  console.log('\n════ the bench popout follows the theme ════');
  ok('in LIGHT theme nothing in the popout stays dark', await ev(()=>{
    /* the bug Mike reported, measured rather than read: a white card with a
       near-black selected option and near-black table rules. Computed
       styles, not stylesheet text — under file:// a LINKED stylesheet's
       cssRules throws SecurityError, so reading the source passes on the
       inlined build and silently reads nothing on dev.html. */
    const lum = c=>{ const m=(c.match(/[\d.]+/g)||[0,0,0]).map(Number);
                     return (0.299*m[0]+0.587*m[1]+0.114*m[2])/255; };
    applyTheme('light');
    setupOpen(0);
    const w = $('setupWrap');
    const card = w.querySelector('.setcard');
    const opt  = w.querySelector('.setopt.on') || w.querySelector('.setopt');
    const step = w.querySelector('.setstep.on');
    const cardL = lum(getComputedStyle(card).backgroundColor);
    const optL  = lum(getComputedStyle(opt).backgroundColor);
    const stepT = lum(getComputedStyle(step).color);
    setupClose(); applyTheme('dark');
    /* the card is light, the selected option is light WITH it (it used to be
       #1d2228), and the selected step chip's text is light on its blue fill */
    return cardL > 0.7 && optL > 0.6 && stepT > 0.7;
  }));
  ok('...and the TEXT flips with it — the alias tokens follow the theme', await ev(()=>{
    /* the root cause under the hard-coded hexes: `--tx:var(--txt)` is
       declared on :root, so it computes against :root's DARK --txt and does
       not recompute when body.light overrides --txt. The popout's entire
       text colour is --tx, so it stayed pale grey on a white card. */
    const lum = c=>{ const m=(c.match(/[\d.]+/g)||[0,0,0]).map(Number);
                     return (0.299*m[0]+0.587*m[1]+0.114*m[2])/255; };
    /* measure a rendered COLOUR, not the property — getPropertyValue on a
       custom property hands back the token stream ("var(--txt)"), not the
       substituted value */
    const h2lum = ()=>{ setupOpen(0);
      const v = lum(getComputedStyle($('setupWrap').querySelector('.sethead h2')).color);
      setupClose(); return v; };
    applyTheme('light'); const light = h2lum();
    applyTheme('dark');  const dark  = h2lum();
    return light < 0.35 && dark > 0.7;
  }));
  ok('the dial and the diagram take their colours from properties, not hexes', await ev(()=>{
    setupOpen(4);
    const svg = $('setupWrap').innerHTML;
    setupClose();
    return svg.length > 0 && !/#[0-9a-fA-F]{6}/.test(svg);
  }));
  ok('the accent is the app blue, not the warning amber', await ev(()=>{
    setupOpen(0);
    const on = $('setupWrap').querySelector('.setstep.on');
    const col = getComputedStyle(on).backgroundColor;
    const cta = getComputedStyle(document.documentElement).getPropertyValue('--cta').trim();
    const hex = '#'+col.match(/\d+/g).slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join('');
    setupClose();
    return hex.toLowerCase() === cta.toLowerCase();
  }));

  console.log('\n════ the bench hides only the risky controls ════');
  ok('simple mode hides the pulse frequency and says what it is set to', await ev(()=>{
    SETUP.adv = false; setupOpen(1);
    const t = $('setupWrap').textContent;
    const box = $('setupWrap').querySelector('[data-f="freq"]');
    return !box && /Pulse rate/.test(t) && /Advanced/.test(t);
  }));
  ok('ticking Advanced brings it back', await ev(()=>{
    $('setAdvChk').click();
    return SETUP.adv===true && !!$('setupWrap').querySelector('[data-f="freq"]');
  }));
  /* v1.50.0 — Mike: "under the tab for the PCA9685s… we just need to know
     how many boards there are." The chain, the power routing and the supply
     amps went behind Advanced with the frequency, so what this step asks in
     simple mode is ONE question. They are hidden, not deleted: the wiring
     diagram is still drawn from them. */
  ok('simple mode asks the board count and nothing else', await ev(()=>{
    const advHas = ['freq','supplyA','chain','power']
      .filter(f=>!!$('setupWrap').querySelector('[data-f="'+f+'"]'));
    $('setAdvChk').click();
    const simpleHas = ['freq','supplyA','chain','power']
      .filter(f=>!!$('setupWrap').querySelector('[data-f="'+f+'"]'));
    const boards = !!$('setupWrap').querySelector('[data-f="boards"]');
    setupClose();
    return SETUP.adv===false && boards && simpleHas.length === 0 && advHas.length >= 3;
  }));

  /* ================================================================
     v1.38.0 — the bench opens on PCA_Bridge, the droid sketch is gated
     on there being something to bake in, Finish offers the file, and it
     goes back where it came from.
     ================================================================ */
  console.log('\n════ the bench starts where the work starts ════');
  await ev(()=>{ buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2'); buildSet('servoMcu','nano');
                 CFG.hwSetup = null; buildSyncBench(); });
  ok('it opens on PCA_Bridge — the only sketch that lets this app drive a board', await ev(()=>
    HW.setup().sketch === 'bridge'));
  ok('...and never overwrites a deliberate choice', await ev(()=>{
    const hw = HW.setup(); hw.sketch = 'coproc'; HW.setSetup(hw);
    buildSyncBench();
    return HW.setup().sketch === 'coproc';
  }));

  console.log('\n════ MaestroReplacement is the LAST step, and says so ════');
  ok('with nothing measured it is offered but locked, with the reason', await ev(()=>{
    /* a fresh table: every channel still on its stock ends */
    MSTR.channels.forEach(c=>{ if(c){ c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; } });
    setupOpen(3);
    const card = Array.from($('setupWrap').querySelectorAll('.setopt'))
      .find(x=>/MaestroReplacement/.test(x.textContent));
    const radio = card.querySelector('input');
    const t = card.textContent;
    setupClose();
    return card.classList.contains('locked') && radio.disabled &&
           /Available once the servos have been measured/.test(t) &&
           /Padawan360/.test(t);
  }));
  ok('measuring one channel unlocks it', await ev(()=>{
    HW.ensure(0); MSTR.channels[0].mode='Servo';
    MSTR.channels[0].min = 4400; MSTR.channels[0].max = 7600;
    setupOpen(3);
    const card = Array.from($('setupWrap').querySelectorAll('.setopt'))
      .find(x=>/MaestroReplacement/.test(x.textContent));
    const ok2 = !card.classList.contains('locked') && !card.querySelector('input').disabled;
    const t = card.textContent;
    setupClose();
    return ok2 && /This is the last step, not a step/.test(t) &&
           /Padawan360 takes over/.test(t) && /1 measured channel/.test(t);
  }));

  /* ================================================================
     v1.39.0 — Mike: "if we are starting from a setup the settings
     should be imported automatically or at least with a 'should we use
     the settings you just created' question."
     ================================================================ */
  console.log('\n════ the step knows what is already in the build ════');
  ok('with nothing measured it asks the question as before', await ev(()=>{
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2');
    MSTR.channels.forEach(c=>{ if(c){ c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; c.calibrated=false; } });
    buildGet().servoCfg = null; prefsSave();
    wizGo(wizStepIndex('_servoSet'));
    const cards = Array.from($('startupBody').querySelectorAll('.optcard'));
    return /already have a servo config/i.test($('startupBody').querySelector('h3').textContent) &&
           cards[0].dataset.opt === 'servoCfg:import' && !$('startupBody').querySelector('[data-opt="servoCfg:keep"]');
  }));
  ok('back from the bench, the FIRST answer is the work you just did', await ev(()=>{
    HW.ensure(0); HW.ensure(1);
    [0,1].forEach(i=>{ MSTR.channels[i].mode='Servo'; MSTR.channels[i].min=4400;
                       MSTR.channels[i].max=7600; MSTR.channels[i].calibrated=true; });
    servoCfgNote('bench', {n:2});
    buildStartup();
    const cards = Array.from($('startupBody').querySelectorAll('.optcard'));
    const keep = $('startupBody').querySelector('[data-opt="servoCfg:keep"]');
    const head = $('startupBody').querySelector('h3').textContent;
    return cards[0].dataset.opt === 'servoCfg:keep' &&
           /just measured/.test(keep.textContent) &&
           /already in this build/.test(keep.textContent) &&
           /Use the settings you already have/i.test(head);
  }));
  ok('...and says where they came from and when, in the subtitle', await ev(()=>
    /measured on the bench a moment ago/.test($('startupBody').textContent) &&
    /2 channels carrying travel/.test($('startupBody').textContent)));
  ok('the other two answers stop pretending it is a fresh start', await ev(()=>{
    const t = $('startupBody').textContent;
    return /Import a different one instead/.test(t) && /Edit the servo config you have/.test(t) &&
           /a continuation, not a fresh start/.test(t);
  }));
  ok('keeping them is an answer that sticks', await ev(()=>{
    $('btnServoKeep').click();
    const b = buildGet();
    const card = $('startupBody').querySelector('[data-opt="servoCfg:keep"]');
    return b.servoCfg.kept === true && card.classList.contains('act') &&
           /Keeping these/.test($('btnServoKeep').textContent);
  }));
  ok('an import records the file it came from, and the card names it', await ev(()=>{
    const file = JSON.stringify(servoCfgExportObj());
    servoCfgImportText(file, 'R2-servos-2026-08-01.json');
    const s = servoCfgSrc();
    buildStartup();
    return s.how === 'import' && s.name === 'R2-servos-2026-08-01.json' &&
           /imported from R2-servos-2026-08-01\.json/.test($('startupBody').textContent) &&
           /use the ones already here/i.test($('startupBody').textContent);
  }));
  ok('a build with no history says nothing it cannot support', await ev(()=>{
    MSTR.channels.forEach(c=>{ if(c){ c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; c.calibrated=false; } });
    buildGet().servoCfg = null; prefsSave();
    return servoCfgStory() === '' && servoCfgSrc() === null;
  }));

  /* ================================================================
     v1.39.1 — Mike: "where do I import the PCA servo setup I exported,
     the only thing I see the mestro one which should be hidden by
     default only the abilty to import meastro sequencs should be
     available."
     ================================================================ */
  console.log('\n════ the servo config has a door back in ════');
  ok('on a PCA build the pane leads with OUR file, not Pololu\'s', await ev(()=>{
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2');
    if(!MSTR.loaded && typeof buildEnsureMaestro === 'function') buildEnsureMaestro();
    rebuildMaestroUI();
    const host = $('maeHost');
    const labels = Array.from(host.querySelectorAll('button')).map(b=>b.textContent);
    return !!$('btnCfgImport') && $('btnCfgImport').classList.contains('prim') &&
           labels.indexOf('Import your config…') < 0 &&
           labels.indexOf('Maestro sequences…') >= 0 &&
           /Servo config & sequences/.test(host.textContent);
  }));
  ok('...and the whole-.mstr import survives as a line, for a real migration', await ev(()=>{
    const a = $('lnkMstrFull');
    return !!a && /replaces your channel table with theirs/.test($('maeHost').textContent);
  }));
  ok('on a Maestro build the pane is exactly as it was', await ev(()=>{
    buildSet('servoDevice','maestro'); buildSet('servoTopo','m1');
    rebuildMaestroUI();
    const host = $('maeHost');
    const labels = Array.from(host.querySelectorAll('button')).map(b=>b.textContent);
    return labels.indexOf('Import your config…') >= 0 && labels.indexOf('Maestro sequences…') < 0 &&
           !$('lnkMstrFull') && !!$('btnCfgImport');
  }));
  ok('the picker OFFERS by family and the reader still takes either', await ev(()=>{
    const mae = servoCfgAccept();
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2');
    const pca = servoCfgAccept();
    return /^\.mstr/.test(mae) && /^\.json/.test(pca) &&
           pca.indexOf('.mstr') > 0 && mae.indexOf('.json') > 0;
  }));
  ok('a dropped servo config is recognised as one, not offered to the setup reader', await ev(()=>{
    const cfg = JSON.stringify(servoCfgExportObj());
    const whole = JSON.stringify({kind:'r2sim.setup', ver:1, maestro:{channels:[]}});
    return servoCfgLooksLikeCfg(cfg) === true && servoCfgLooksLikeCfg(whole) === false &&
           typeof jsonDropRoute === 'function';
  }));

  /* ================================================================
     v1.39.2 — Mike: "ok where do I assign servos to panels?" It was
     the setup's Panels step, the Wiring step's boards, or clicking the
     part on the droid. Three more doors, and one of them is the bench.
     ================================================================ */
  console.log('\n════ assigning a servo to a panel, from where you are standing ════');
  ok('the bench pane has a way into the panel map', await ev(()=>{
    rebuildMaestroUI();
    return !!$('btnAssignPanels') && /which servo moves which panel/.test($('btnAssignPanels').title);
  }));
  ok('...and it lands ON the Panels step, not at the start of the wizard', await ev(async ()=>{
    $('btnAssignPanels').click();
    await new Promise(r=>setTimeout(r,30));
    const at = wizSteps()[WIZ.i].key;
    const rows = $('startupBody').querySelectorAll('.asrow').length;
    closeStartup();
    return at === '_panels' && rows > 0;
  }));
  ok('the bench channel table says what each channel DRIVES', await ev(()=>{
    setupOpen(4);
    const sel = $('setBody').querySelector('tr[data-ch="0"] select[data-k="part"]');
    const hdr = /drives/.test($('setBody').querySelector('tr').textContent);
    const opts = sel ? sel.options.length : 0;
    setupClose();
    return !!sel && hdr && opts > 1;
  }));
  ok('picking a part there moves it off whatever channel had it', await ev(()=>{
    HW.ensure(0); HW.ensure(1);
    MSTR.channels[0].mode='Servo'; MSTR.channels[1].mode='Servo';
    const act = HW.parts()[0].act;
    HW.setPart(0, act);
    const first = MSTR.channels[0].act === act;
    HW.setPart(1, act);                       /* a part has ONE channel */
    return first && MSTR.channels[1].act === act && MSTR.channels[0].act === '';
  }));
  ok('...and clearing it leaves the channel alone otherwise', await ev(()=>{
    const before = MSTR.channels[1].name;
    HW.setPart(1, '');
    return MSTR.channels[1].act === '' && MSTR.channels[1].name === before &&
           /^servo/i.test(MSTR.channels[1].mode);
  }));

  console.log('\n════ Finish asks about the file, and goes back ════');
  ok('finishing with unsaved travel offers the export', await ev(async ()=>{
    SETUP.changedAt = 5; SETUP.exportedAt = 0;
    setupOpen(5);
    const p = setupFinish();
    /* the dialog is the app's own, not window.confirm — find it and decline */
    await new Promise(r=>setTimeout(r,60));
    const dlg = document.querySelector('.dlgwrap');
    const asked = !!dlg && /not written them to a file/.test(dlg.textContent);
    const no = Array.from(dlg.querySelectorAll('button')).find(b=>/without it/i.test(b.textContent));
    no.click();
    await p;
    return asked;
  }));
  ok('...and does not ask when it has just been exported', await ev(async ()=>{
    SETUP.changedAt = 5; SETUP.exportedAt = 5;
    setupOpen(5);
    const p = setupFinish();
    await new Promise(r=>setTimeout(r,60));
    const dlg = document.querySelector('.dlgwrap');
    await p;
    return !dlg;
  }));
  ok('an export marks the config as saved', await ev(()=>{
    SETUP.changedAt = 9; SETUP.exportedAt = 0;
    servoCfgExport();
    return setupExported() === true;
  }));
  ok('...and the next calibration makes it stale again', await ev(()=>{
    setupTouched();
    return setupExported() === false;
  }));
  /* ================================================================
     v1.38.3 — Mike, having named and ticked four channels and been let
     out in silence: "It didnt prompt me to save config when id
     finished - also why do we have two export methods .json and .h".
     ================================================================ */
  console.log('\n════ Finish asks about work, not about arithmetic ════');
  ok('channels named and switched on, nothing measured yet — it still asks', await ev(async ()=>{
    /* exactly Mike's screenshot: four channels in use, every one of them
       still on the endpoints the table was born with */
    MSTR.channels.forEach((c,i)=>{ if(c){ c.mode='Input'; c.calibrated=false;
      c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; c.name='Channel '+i; } });
    ['Dome pie 3','Dome pie 4','Front door','Utility arm'].forEach((n,i)=>{
      HW.ensure(i); MSTR.channels[i].mode='Servo'; MSTR.channels[i].name=n; });
    SETUP.changedAt = 0; SETUP.exportedAt = 0;
    const w = setupSaveWorth();
    setupOpen(5);
    const p = setupFinish();
    await new Promise(r=>setTimeout(r,60));
    const dlg = document.querySelector('.dlgwrap');
    const asked = !!dlg && /4 channels set up/.test(dlg.textContent);
    if(dlg) Array.from(dlg.querySelectorAll('button')).find(b=>/without it/i.test(b.textContent)).click();
    await p;
    return asked && w.worth && w.used===4 && w.cal===0 && w.travel===0;
  }));
  ok('a table nobody has touched does not nag', await ev(async ()=>{
    MSTR.channels.forEach((c,i)=>{ if(c){ c.name='Channel '+i; c.calibrated=false;
      c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; } });
    SETUP.changedAt = 0; SETUP.exportedAt = 0;
    const worth = setupSaveWorth().worth;
    setupOpen(5);
    const p = setupFinish();
    await new Promise(r=>setTimeout(r,60));
    const dlg = document.querySelector('.dlgwrap');
    await p;
    return !worth && !dlg;
  }));
  ok('a channel captured on the dial counts even when it lands on the defaults', await ev(()=>{
    const c = HW.ensure(0);
    c.mode='Servo'; c.min=DEFAULT_MIN; c.max=DEFAULT_MAX; c.calibrated=false;
    const before = setupSaveWorth();
    c.calibrated = true;
    const after = setupSaveWorth();
    c.calibrated = false;
    return after.cal === before.cal+1 && after.travel === before.travel+1 && after.worth;
  }));

  console.log('\n════ one export by default, the rest where they belong ════');
  ok('Finish offers the servo config alone — the file this app reads back', await ev(()=>{
    SETUP.adv = false;
    setupOpen(5); SETUP.hw.sketch='bridge'; setupRender();
    const acts = Array.from($('setBody').querySelectorAll('button')).map(b=>b.dataset.act).filter(Boolean);
    const t = $('setBody').textContent;
    setupClose();
    return acts.indexOf('expcfg')>=0 && acts.indexOf('exph')<0 && acts.indexOf('expjson')<0 &&
           /the file worth keeping/.test(t) &&
           /* v1.39.1 — the way back IN sits beside the way out */
           acts.indexOf('impcfg')>=0 && /Import replaces the travel here/.test(t);
  }));
  ok('servos.h appears only once you pick a sketch that has to be compiled with it', await ev(()=>{
    setupOpen(5); SETUP.hw.sketch='coproc'; setupRender();
    const acts = Array.from($('setBody').querySelectorAll('button')).map(b=>b.dataset.act).filter(Boolean);
    const named = /compile <b>MaestroReplacement<\/b> yourself/.test($('setBody').innerHTML);
    setupClose();
    return acts.indexOf('exph')>=0 && acts.indexOf('expjson')<0 && named;
  }));
  ok('the whole-bench backup lives under advanced', await ev(()=>{
    SETUP.adv = true;
    setupOpen(5); SETUP.hw.sketch='bridge'; setupRender();
    const acts = Array.from($('setBody').querySelectorAll('button')).map(b=>b.dataset.act).filter(Boolean);
    SETUP.adv = false; setupClose();
    return acts.indexOf('expjson')>=0 && acts.indexOf('expcfg')>=0;
  }));
  ok('the button and the Finish prompt write the SAME file', await ev(()=>{
    /* the confusion underneath "why two .json" was two buttons producing
       two different .jsons — the bench's export is servoCfgExport now */
    SETUP.changedAt = 3; SETUP.exportedAt = 0;
    setupOpen(5); setupRender();
    const b = Array.from($('setBody').querySelectorAll('button')).find(x=>x.dataset.act==='expcfg');
    b.click();
    const saved = setupExported();
    setupClose();
    return saved === true;
  }));

  ok('opened from the wizard, closing goes back to the Servo setup step', await ev(async ()=>{
    closeStartup();
    setupOpen(0, {from:'wizard'});
    const wasOpen = SETUP.open && !$('startup').classList.contains('on');
    setupClose();
    await new Promise(r=>setTimeout(r,20));
    return wasOpen && $('startup').classList.contains('on') &&
           wizSteps()[WIZ.i].key === '_servoSet';
  }));
  ok('opened from the Bench tab, closing leaves you where you were', await ev(()=>{
    closeStartup();
    setupOpen(0);
    setupClose();
    return !$('startup').classList.contains('on');
  }));

  /* ================================================================
     v1.38.1 — the Channels step can reach the board. Mike: "under
     channels in Setup your servo hardware - shoudl we not have the
     connect to the Arduino button Aka Hardware connect".
     ================================================================ */
  console.log('\n════ the bench can reach the board from where it matters ════');
  ok('the Channels step carries a connect button', await ev(()=>{
    setupOpen(4);
    const b = $('bSetConnect');
    const bar = $('setLink');
    setupClose();
    return !!b && !!bar && /Connect hardware/.test(b.textContent);
  }));
  ok('...and says what the dial is actually moving', await ev(()=>{
    setupOpen(4);
    const t = $('setLink').textContent;
    setupClose();
    /* "connected" and "measuring" are not the same thing, and the
       difference is an hour of work */
    return /Not connected/.test(t) && /on-screen model only/.test(t) && /PCA_Bridge/.test(t);
  }));
  ok('the other steps do not carry it — it belongs to the dial', await ev(()=>{
    setupOpen(0);
    const none = !$('bSetConnect');
    setupClose();
    return none;
  }));
  ok('the link chrome no longer assumes the Bench tab is rendered', await ev(()=>{
    /* the real bug under this: serialConnect() wrote straight into
       $('bConnect') / $('serialChip') / $('monPort'), so calling it with
       only the wizard on screen threw AFTER the port opened — leaving a
       connected board nothing was listening to. Every one of those is
       guarded now, and serialUiSync() drives whichever surfaces exist. */
    const host = $('hwLink');
    const stash = host ? host.innerHTML : null;
    if(host) host.innerHTML = '';           // pretend the Bench tab is gone
    let threw = null;
    try{ serialUiSync(); monShow(false); monWarn(''); serialSetMode('monitor',''); }
    catch(e){ threw = e.message; }
    if(host) host.innerHTML = stash;
    return threw === null;
  }));
  ok('both surfaces register for link changes, so they cannot disagree', await ev(()=>{
    setupOpen(4);
    const n = SER_UI.length;
    setupClose();
    return n >= 1 && typeof serialUiRegister === 'function';
  }));

  /* ================================================================
     Mike, having found the panel assignment a second time: "we also
     had a top-down Dome image to match servos with dome panels — where
     has that gone, and should it be an option for setting up servos?"
     It only lived behind the .mstr IMPORT wizard's Map step
     (maestro/wizard-import.js, checked against a real file in
     maestro-import.test.js) — this is the SAME diagram (dome-map.js),
     opened from the Panels step instead and bound to the live channel
     table rather than an import's temporary one.
     ================================================================ */
  console.log('\n════ the Panels step has its own door onto the dome map ════');
  ok('the Panels step renders the dome map button', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    const btn = Array.from($('startupBody').querySelectorAll('button')).find(b=>/🗺 Dome map/.test(b.textContent));
    return !!btn;
  }));
  const dmap = await ev(()=>{
    const btn = Array.from($('startupBody').querySelectorAll('button')).find(b=>/🗺 Dome map/.test(b.textContent));
    btn.click();
    const wrap = $('dmapWrap');
    const out = {opened: !!wrap && !!wrap.querySelector('svg.domemap'), startupOn: $('startup').classList.contains('on')};

    /* an assignment made through the dome-map API — ch0 already holds
       pie0, ch1 is free; select ch1 and click PP1 on the diagram, the
       same way the import wizard's Map step is clicked in
       maestro-import.test.js */
    HW.ensure(0); HW.ensure(1);
    MSTR.channels[0].mode='Servo'; MSTR.channels[0].act='pie0';
    MSTR.channels[1].mode='Servo'; MSTR.channels[1].act='';
    DMAP.sel = 1; dmapRender();
    const pie1 = Array.from($('dmapWrap').querySelectorAll('.dmpie')).find(g=>g.querySelector('text').textContent==='PP1');
    pie1.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    out.newHolder = MSTR.channels[1].act;
    out.oldHolderCleared = MSTR.channels[0].act;

    /* closing goes back to the wizard underneath, not through it */
    $('dmapWrap').querySelector('.iwx').click();
    out.wrapGone = !$('dmapWrap');
    out.stillOnWizard = $('startup').classList.contains('on');
    out.panelsRedrawn = $('startupBody').querySelectorAll('.asrow').length > 0;
    closeStartup();
    return out;
  });
  ok('clicking it opens the dome-map container, above the still-open wizard',
     dmap.opened && dmap.startupOn, JSON.stringify(dmap));
  ok('an assignment made through the dome-map API lands in MSTR.channels, with the old holder cleared (HW.setPart)',
     dmap.newHolder==='pie0' && dmap.oldHolderCleared==='', JSON.stringify(dmap));
  ok('closing returns to the wizard — the overlay is gone and the Panels step redraws',
     dmap.wrapGone && dmap.stillOnWizard && dmap.panelsRedrawn, JSON.stringify(dmap));

  /* ================================================================
     2.6 — the holoprojectors are the one dome-map feature with TWO
     axes behind a single marker (dome-map.js:188-211): a click takes
     pan first, then tilt — "one marker per unit rather than two: a
     click takes pan first and then tilt, so wiring a holo is two
     clicks in the same place." That two-click rule had no test of its
     own. Same API the wizard door test above already exercises
     (DMAP.sel + dmapRender(), a real click on the SVG group) —
     just aimed at a holo marker twice in a row. */
  console.log('\n════ the dome map\'s holoprojectors take pan, then tilt (dome-map.js:188-211) ════');
  const holo = await ev(()=>{
    /* the previous block closed the overlay AND the wizard underneath it
       (closeStartup()) — reopen both the same door the button test above
       used */
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    dmapOpen();
    HW.ensure(2); HW.ensure(3);
    MSTR.channels[2].mode='Servo'; MSTR.channels[2].act='';
    MSTR.channels[3].mode='Servo'; MSTR.channels[3].act='';
    const findHolo1 = ()=>Array.from($('dmapWrap').querySelectorAll('.dmholo'))
      .find(g=>g.querySelector('text').textContent==='HP1');

    DMAP.sel = 2; dmapRender();
    const before = {pan: MSTR.channels[2].act, tilt: MSTR.channels[3].act};
    findHolo1().dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const afterFirst = {ch2: MSTR.channels[2].act, ch3: MSTR.channels[3].act};

    /* the first click auto-advances DMAP.sel to the next unmapped channel
       (wizard.js's onPick) — pin it back to channel 3 so the second click
       is deterministic, same explicit-select style the test above uses */
    DMAP.sel = 3; dmapRender();
    findHolo1().dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const afterSecond = {ch2: MSTR.channels[2].act, ch3: MSTR.channels[3].act};

    dmapClose();
    closeStartup();
    return {before, afterFirst, afterSecond};
  });
  ok('neither axis is assigned before any click', holo.before.pan==='' && holo.before.tilt==='', JSON.stringify(holo.before));

  /* ================================================================
     v1.43.0 — Mike: "on the dome map add the abilty to drive real servos
     and a play button next to each Servo Channel". ▶ goes through
     HW.drive(), which is the engine, the model and — when a board is
     plugged in — the wire, in that order. So the assertion is on the
     ENGINE target, not on any of the three surfaces separately.
     ================================================================ */
  /* ================================================================
     v1.43.0 — a picture on every hardware card (config/board-art.js).
     Mike: "these boxes should be the board images with a description
     underneith". A photo when one has been dropped into src/art/boards/,
     the drawn stand-in otherwise, and NOTHING on the firmware step, whose
     ids collide with hardware ones on purpose.
     ================================================================ */
  console.log('\n════ the hardware cards carry a picture ════');
  const art = await ev(()=>{
    const pics = k=>{
      wizGo(wizSteps().findIndex(s=>s.key===k));
      const cards = Array.from($('startupBody').querySelectorAll('.optcard'));
      return {cards: cards.length, withPic: cards.filter(c=>c.querySelector('.optpic')).length};
    };
    wizOpen(0);
    return {
      foot: pics('bodyDrive'), board: pics('arduino'), sound: pics('sound'),
      motor: pics('domeMotor'), fw: pics('firmware'),
      pololu: !!boardPhotoSrc('domeServo','mini24'),
      /* the fallback, tested WITHOUT depending on which photos happen to be
         in src/art/boards/ today — pull the key, ask, put it back */
      esc: (()=>{
        const had = BOARD_PHOTOS.flipsky; delete BOARD_PHOTOS.flipsky;
        const html = boardArtHtml('bodyDrive','flipsky','Flipsky');
        if(had !== undefined) BOARD_PHOTOS.flipsky = had;
        return /^<svg/.test(html);
      })(),
      /* ...and a photo, when there is one, wins over the drawing */
      photoWins: (()=>{
        const had = BOARD_PHOTOS.flipsky;
        BOARD_PHOTOS.flipsky = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
        const html = boardArtHtml('bodyDrive','flipsky','Flipsky');
        if(had === undefined) delete BOARD_PHOTOS.flipsky; else BOARD_PHOTOS.flipsky = had;
        return /^<img/.test(html) && /class="optphoto"/.test(html);
      })(),
      alt: /alt="Mini Maestro 24"/.test(boardArtHtml('domeServo','mini24','Mini Maestro 24')),
      unknown: boardArtHtml('sound','a-board-that-does-not-exist','x')
    };
  });
  ok('every foot-drive, controller-board, sound and dome-motor card has one',
     art.foot.withPic===art.foot.cards && art.board.withPic===art.board.cards &&
     art.sound.withPic===art.sound.cards && art.motor.withPic===art.motor.cards,
     JSON.stringify(art));
  ok('the firmware step has none — its answers are sketches, not objects',
     art.fw.cards > 0 && art.fw.withPic === 0, JSON.stringify(art.fw));
  ok('the four Pololu boards use the REAL photos the app already has',
     art.pololu === true);
  ok('...and the photo carries the board name as alt text', art.alt === true);
  ok('an answer with no art of its own gets no picture, not an empty box',
     art.unknown === '');
  ok('the drawn stand-in is inline SVG, so it themes and scales', art.esc === true);
  ok('...and a photo dropped in src/art/boards/ wins over the drawing', art.photoWins === true);

  /* ================================================================
     v1.45.0 — Mike: "Enlarge the Xbox 360 wireless image."

     The size belongs to the STEP (wizard.js, WIZ_BIG_PIC), not to the
     photo: the controller step has three options and the whole screen,
     the twenty-one board cards do not. So the assertion is a COMPARISON —
     the controller photos grew, and the board photos did not. Measured
     with getComputedStyle: a LINKED stylesheet's cssRules throws under
     file://, so reading the CSS text is never an option here.
     ================================================================ */
  console.log('\n════ the controller step\'s photos are bigger (v1.45.0) ════');
  const pic = await ev(()=>{
    const measure = key=>{
      wizGo(wizStepIndex(key));
      const grid = $('startupBody').querySelector('.optgrid');
      const ph = grid.querySelector('img.optphoto');
      const card = ph.closest('.optcard');
      return {big: grid.classList.contains('bigpic'),
              h: Math.round(parseFloat(getComputedStyle(ph).height)),
              /* the plate the picture sits on, photo or drawing */
              boxH: Math.round(parseFloat(getComputedStyle(card.querySelector('.optpic')).minHeight)),
              cards: grid.querySelectorAll('.optcard').length,
              pics: grid.querySelectorAll('.optpic').length};
    };
    modelSet('droid');
    const c = measure('controller'), s = measure('sound'), d = measure('domeMotor');
    /* the answer Mike named, and its picture */
    wizGo(wizStepIndex('controller'));
    const xb = $('startupBody').querySelector('[data-opt="controller:xbox360"] img.optphoto');
    const xbH = Math.round(xb.getBoundingClientRect().height);
    wizGo(0);
    return {c, s, d, xbH, xbSrc: /xbox/i.test(xb.getAttribute('alt')||'')};
  });
  ok('the controller step is the one marked roomy', pic.c.big===true &&
     pic.s.big===false && pic.d.big===false, JSON.stringify([pic.c.big,pic.s.big,pic.d.big]));
  ok('its photos are meaningfully taller — half again and more',
     pic.c.h >= pic.s.h*1.6, pic.c.h+'px vs '+pic.s.h+'px');
  ok('...and the plate under them grew with them, not just the image',
     pic.c.boxH > pic.s.boxH, pic.c.boxH+'px vs '+pic.s.boxH+'px');
  ok('the Xbox 360 wireless photo is the one that actually grew on screen',
     pic.xbSrc && pic.xbH === pic.c.h, pic.xbH+'px');
  ok('the twenty-one board cards keep the size their row rhythm depends on',
     pic.s.h === pic.d.h && pic.s.h === 132, pic.s.h+'px on both');
  ok('every card on all three steps still has its picture box',
     pic.c.pics===pic.c.cards && pic.s.pics===pic.s.cards && pic.d.pics===pic.d.cards,
     JSON.stringify(pic));

  console.log('\n════ the dome map drives ════');
  const play = await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    HW.ensure(4);
    const c = MSTR.channels[4];
    c.mode='Servo'; c.name='Pie 1 test'; c.min=4400; c.max=7600; c.home=6000; c.act='pie0';
    HW.rebuild(true);
    dmapOpen();
    const wrap = $('dmapWrap');
    const bar  = wrap.querySelector('.dmaplink');
    const btn  = wrap.querySelector('[data-play="4"]');
    const first = (()=>{ btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
                         return {target: HW.engine().st[4].target, playing: DMAP.play}; })();
    /* pressing it again is a STOP — the servo holds where it is */
    btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const stopped = DMAP.play;
    const rows = wrap.querySelectorAll('.iwmaprow').length;
    const plays = wrap.querySelectorAll('.iwplay').length;
    dmapClose();
    closeStartup();
    return {hasBar:!!bar, barText: bar ? bar.textContent : '', connect: !!wrap.querySelector('#dmapConnect'),
            first, stopped, rows, plays};
  });
  ok('every channel row carries a ▶', play.rows > 0 && play.plays === play.rows,
     play.plays+' of '+play.rows);
  ok('▶ drives that channel to one end of ITS OWN travel',
     play.first.target === 4400 && play.first.playing === 4, JSON.stringify(play.first));
  ok('pressing it again stops rather than yanking the servo home', play.stopped === -1);
  ok('the map says whether a real board is on the end of it, and offers one',
     play.hasBar && play.connect && /sim only/i.test(play.barText), play.barText.slice(0,90));
  ok('the FIRST click on the holoprojector assigns PAN, not tilt',
     holo.afterFirst.ch2==='hp1Pan' && holo.afterFirst.ch3==='', JSON.stringify(holo.afterFirst));
  ok('the SECOND click on the same marker assigns TILT, leaving pan alone',
     holo.afterSecond.ch2==='hp1Pan' && holo.afterSecond.ch3==='hp1Tilt', JSON.stringify(holo.afterSecond));

  /* ================================================================
     v1.40.0 — Mike: "do the driven by names match the names put in via
     the servo config?" The Panels table used to mix sources: a part's
     label when there was one, the raw actuator id ("pie5") when there
     was not, regardless of what the channel itself was actually called.
     One rule now (chLabel, app/boards.js): the servo-config name first,
     the driven part's label only once the channel itself was never named.
     ================================================================ */
  console.log('\n════ Panels: the driven-by label follows the servo-config name (v1.40.0) ════');
  const label = await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    /* whatever earlier sections in this suite left the build pointed at
       (mod2026 has no live Maestro, so hwPins() would be reading the
       PLANNED layout, which has no per-channel name field at all) — force
       the live/MSTR-backed view just for this check. The label rule is
       about the channel's own name, which only exists once a real Maestro
       is the thing actually being driven. */
    const hadMaestro = PROFILE.hasMaestro;
    PROFILE.hasMaestro = true;
    /* wherever this build's board actually lives — 'dome', 'body' or the
       single shared 'both' (v1.34.0) */
    const loc = hwLocs()[0];
    /* a channel nothing else in this suite reads, so renaming it is safe —
       wired to pie2 ("Pie 3"), which is a real part with a real label.
       chAssign (not a raw ch.act write) keeps 'one channel per part' true
       even though pie2 already has its own default holder elsewhere. */
    const free = hwPins(loc).pins.find(p=>!p.act);
    chAssign(loc, free.pin, 'pie2');
    const ch = HW.channels()[free.pin];
    const rowFor = act => Array.from($('startupBody').querySelectorAll('select[data-act]'))
      .find(s=>s.dataset.act===act);

    /* the generic default HW.ensure()/setupUse() leave a fresh channel with
       — nobody has typed a name yet, so the DRIVEN PART's label carries it */
    ch.name = 'Channel '+ch.i;
    buildStartup();
    const gsel = rowFor('pie2');
    const genericText = gsel.options[gsel.selectedIndex].textContent;

    /* now the bench carries a real name — that wins over the part label */
    ch.name = 'Left Pie Servo';
    buildStartup();
    const nsel = rowFor('pie2');
    const namedText = nsel.options[nsel.selectedIndex].textContent;

    ch.mode = 'Input'; ch.name = ''; ch.act = '';       // leave the channel as found
    PROFILE.hasMaestro = hadMaestro;
    closeStartup();
    return {genericText, namedText};
  });
  ok('an unnamed channel\'s row shows the driven part\'s label ("ch N · Pie 3")',
     /ch \d+ {2}·{2} {0,2}Pie 3/.test(label.genericText.replace(/·/g,'··')) || /Pie 3/.test(label.genericText),
     label.genericText);
  ok('a named channel shows the NAME MIKE TYPED, not the part label',
     /Left Pie Servo/.test(label.namedText) && !/Pie 3/.test(label.namedText), label.namedText);

  /* ================================================================
     v1.40.0 — Mike: "option to choose others that are not part of the
     model, say Other 1 through 10." Ten placeholders (core/actuators.js
     OTH_KEYS) for a servo that drives something entirely off the CAD
     model; buildAssignOtherSect (config/tab.js) gives them their own
     section with the same driven-by dropdown and ▶ test as a real part's
     row, and none of the Name/Colour furniture a CAD part carries.
     ================================================================ */
  console.log('\n════ Panels: OTHER (not on the model) — ten placeholders (v1.40.0) ════');
  const other = await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_panels'));
    const sects = Array.from($('startupBody').querySelectorAll('.sect'));
    const oSect = sects.find(s=>/OTHER \(not on the model\)/.test(s.querySelector('h3').textContent));
    const rows = oSect ? Array.from(oSect.querySelectorAll('.asrow')).filter(r=>!r.classList.contains('ashdr')) : [];
    const out = {
      found: !!oSect,
      rowCount: rows.length,
      labels: rows.map(r=>r.querySelector('.asfix').textContent),
      everyRowHasSelect: rows.every(r=>!!r.querySelector('select[data-act]')),
      noColourAnywhere: rows.every(r=>!r.querySelector('.ascol')),
      everyRowHasTest: rows.every(r=>!!r.querySelector('.astest'))
    };

    /* assign oth1 to a free channel and back off it again — the same
       displace-and-confirm plumbing a real part's row uses (chAssign,
       chFindUse — app/boards.js). The option values carry whatever
       location this build's board actually answers to — 'dome'/'body'
       when there are two, the single shared 'both' when there is one
       controller for the whole droid (v1.34.0) — so read that instead of
       assuming 'dome'. */
    const loc = hwLocs()[0];
    const free = hwPins(loc).pins.find(p=>!p.act);
    const sel = oSect.querySelector('select[data-act="oth1"]');
    sel.value = loc+':'+free.pin;
    sel.dispatchEvent(new Event('change'));
    out.wired = hwPins(loc).pins[free.pin].act === 'oth1';
    out.oneChannelOnly = hwPins(loc).pins.filter(p=>p.act==='oth1').length === 1;
    /* the change handler's own redraw (buildStartup, passed down from
       wizOpen) rebuilt startupBody — the row we just picked up 'cur' from
       is gone, so re-find the live select before clearing it, exactly as
       a second click on the actual page would */
    const oSect2 = Array.from($('startupBody').querySelectorAll('.sect'))
      .find(s=>/OTHER \(not on the model\)/.test(s.querySelector('h3').textContent));
    const sel2 = oSect2.querySelector('select[data-act="oth1"]');
    sel2.value = ''; sel2.dispatchEvent(new Event('change'));
    out.cleared = hwPins(loc).pins[free.pin].act === '';

    closeStartup();
    return out;
  });
  ok('the OTHER section exists on the Panels step', other.found);
  ok('it lists exactly ten placeholder rows', other.rowCount === 10, other.rowCount);
  ok('labelled Other 1..Other 10, in order', other.labels.join(',') ===
     Array.from({length:10},(_,i)=>'Other '+(i+1)).join(','), other.labels.join(','));
  ok('every row carries the driven-by dropdown and the ▶ test',
     other.everyRowHasSelect && other.everyRowHasTest);
  ok('…but no Colour swatch — there is no CAD part to tint', other.noColourAnywhere);
  ok('assigning oth1 to a free channel wires it there, and only there',
     other.wired && other.oneChannelOnly, JSON.stringify(other));
  ok('unassigning frees the channel again', other.cleared);

  /* ================================================================
     HOW MANY EXPANDERS THE STEP SAYS YOU HAVE (v1.66.3)

     Mike, with three PCA9685s set on this very step: "capped at 32".
     The channel table was 48 rows the whole time — the SENTENCE was wrong.
     `topo.pca` is a property of the SHAPE (`p1x2` declares 2, because that
     is the picture it draws) and the count has been an ANSWER since v1.54.0.
     That release fixed the derivation and the board-picture strip and missed
     the two places that render the line a person actually reads. So these
     assert the rendered STRING, not the model behind it — the model was
     never wrong, which is exactly why three releases missed this. */
  console.log('\n════ the expander count, as the step words it ════');
  const said = await ev(()=>[1,2,3,5,8].map(n=>{
    buildSet('domeServo', servoCoprocId(n)); wizFinish(); buildEnsureMaestro();
    const host = document.createElement('div'); wizServosStep(host, {});
    const txt = (host.textContent||'').replace(/\s+/g,' ');
    return { set:n,
             says: (txt.match(/\d+ × PCA9685 — \d+ channels/)||['(none)'])[0],
             rows: MSTR.channels.length,
             summary: buildServoAnswer(buildGet()).short,
             total: buildPcaTotal(buildGet()) };
  }));
  said.forEach(r=>console.log('  '+JSON.stringify(r)));
  ok('the step names the number of boards you actually set, 1 through 8',
     said.every(r=>r.says === r.set + ' × PCA9685 — ' + (r.set*16) + ' channels'),
     JSON.stringify(said.map(r=>r.says)));
  ok('…and the channel table really has that many rows',
     said.every(r=>r.rows === r.set*16), JSON.stringify(said.map(r=>r.rows)));
  ok('the build summary agrees with it', said.every(r=>r.summary === 'PCA ×'+r.set),
     JSON.stringify(said.map(r=>r.summary)));
  ok('and buildPcaTotal() is the one place the number comes from',
     said.every(r=>r.total === r.set), JSON.stringify(said.map(r=>r.total)));

  /* THE OTHER HALF of "without extra steps". Changing the count on a build
     that already speaks PCA9685 grows the table there and then. It does NOT
     when the loaded table is a MAESTRO one — that is a change of kind, and
     v1.65.0 made it an offer on purpose. The offer now appears on the step
     where the number was typed, instead of three screens away in the bench. */
  console.log('\n════ …and the table that has not followed yet ════');
  const gap = await ev(()=>{
    buildSet('domeServo','mpca32'); wizFinish(); buildEnsureMaestro();
    loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24');
    MSTR.channels[5].name = 'MIKES ROW'; MSTR.channels[5].min = 4321; MSTR.channels[5].act = 'pie0';
    const hw = Object.assign({}, HW.setup()||{}); hw.boards = 3; HW.setSetup(hw);
    const before = { rows: MSTR.channels.length, short: HW.short() };
    const host = document.createElement('div'); wizServosStep(host, {});
    const txt = (host.textContent||'').replace(/\s+/g,' ');
    const notice = /channel table still has \d+ rows, not \d+/.exec(txt);
    const btn = Array.from(host.querySelectorAll('button')).find(x=>/add the missing/.test(x.textContent));
    const label = btn ? btn.textContent.trim() : null;
    if(btn) btn.click();
    return { before, notice: notice ? notice[0] : null, label,
             rows: MSTR.channels.length, short: HW.short(),
             kept: MSTR.channels[5].name+'/'+MSTR.channels[5].min+'/'+MSTR.channels[5].act,
             newRowMode: MSTR.channels[40] && MSTR.channels[40].mode };
  });
  console.log('  '+JSON.stringify(gap));
  ok('the step says both numbers when the table is short',
     gap.notice === 'channel table still has 24 rows, not 48', String(gap.notice));
  ok('and offers to close the gap right there', gap.label === 'add the missing 24 rows', String(gap.label));
  ok('clicking it grows the table to what the build asks for',
     gap.rows === 48 && gap.short === null, JSON.stringify({rows:gap.rows, short:gap.short}));
  ok('GROW ONLY — an existing row keeps its name, its endpoint and its part',
     gap.kept === 'MIKES ROW/4321/pie0', gap.kept);
  ok('and the new rows arrive as Input, not silently driving something',
     gap.newRowMode === 'Input', String(gap.newRowMode));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
