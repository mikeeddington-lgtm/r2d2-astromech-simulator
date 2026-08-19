'use strict';
/* =====================================================================
   SETUP WIZARD — "start a new model"

   The overlay used to be a paint picker. It is now the first thing a new
   builder answers: which model, then what is in your droid — eight hardware
   questions in the order Mike asked for them (nine until v1.34.0 merged the
   two servo ones) — then the wiring, then the droid itself.

   It only opens BY ITSELF when no build has been configured. After that
   the same content is a set of sections in the Config tab, and the header
   Setup button reopens the wizard at its review step.

   Every answer is applied immediately — pick hub motors and the sim
   switches to the only sketch that can drive them, right then, with the
   droid still visible behind the card. Nothing is deferred to a Finish
   button, so backing out half way still leaves a coherent sim.
   ===================================================================== */

/* The FIRST thing asked, since v1.32.0 (Mike, 2026-08-14: "move the model
   selection to the start of the setup page - with static images of each
   model"). It was previously only reachable from a stage button, which
   made it a thing you discovered rather than a thing you chose, and it is
   the answer every later question is really about: nine questions about
   dome motors read very differently once you know the thing on the stage
   is a 60 cm puppet head. */
const WIZ_MODEL = {key:'_model', title:'Model', q:'What are we setting up?',
  why:'One model stands on the stage at a time. It is the one the pad drives, the one the channel table describes and the one the sketch’s outputs are drawn on — and you can change it whenever you like.'};

const WIZ_EXTRA = [
  /* v1.37.0 — its own step, immediately after Firmware. Mike: "lets move
     this to after the firmware button." It used to be a section at the
     bottom of the servo hardware question, which put the PHYSICAL job
     underneath five paragraphs about which board to buy. It is a job, not
     an answer, so it gets a chip of its own. */
  {key:'_servoSet', title:'Servo setup', q:'Now let us make the servos move.',
   why:'Everything so far describes the droid. This is where you find out where each panel actually stops — and the first question is whether you have already done it once.'},
  /* v1.45.0 — the second sentence used to advertise the Boards cards ("the
     boards below are clickable"). Those are gone (Mike: "Remove the
     non-functional Wiring 'Boards' section" — see app/boards.js), so it names
     what is actually here now: a beta diagram and the printable sheet. */
  {key:'_wiring', title:'Wiring',  q:'Here is the loom this build needs.',
   why:'Control signals only — every V+ line is deliberately left off, because power distribution is your call. The diagrams are beta; the printable sheet below pairs every channel with the part it drives.'},
  {key:'_panels', title:'Panels',  q:'Which servo moves which panel?',
   why:'Assign a channel to each moving part. One channel per part; moving a part frees the channel it was on. The droid is beside you — press ▶ to prove the travel.'},
  {key:'_paint',  title:'Colours', q:'What does it look like?',
   why:'Roles first, then any individual part. The droid repaints as you go.'},
  {key:'_scene',  title:'Scene',   q:'Where is it standing?',
   why:'Somewhere to look at it, and somewhere to drive it. The practice circuit is laid out for the hangar deck.'},
  {key:'_done',   title:'Finish',  q:'That is your droid.',
   why:'Everything here stays changeable — reopen this from Setup in the header at any time.'}
];
function wizSteps(){ return [WIZ_MODEL].concat(BUILD_STEPS, WIZ_EXTRA); }
/* index of the hardware question `key` in the full step list — used by the
   review step's "change" buttons, which know the question but not where it
   sits once a step has been inserted in front of them */
function wizStepIndex(key){ return wizSteps().findIndex(s=>s.key === key); }

/* MODEL-AWARE WORDING (1.2a). "That is your droid" / "take me to my droid"
   only actually says droid when a droid is what got set up — the Finish
   step is the one place in the whole wizard where the copy names the
   thing on the stage by what it IS, so it has to follow the Model answer
   the same way the rest of the review already does. Scoped to the finish
   step on purpose: the other 1,000-odd "droid" mentions elsewhere in this
   file are about the droid's OWN hardware questions (servos, wiring…),
   which stay droid-specific regardless of what is standing on the stage
   right now — see wizModelBanner. */
const WIZ_MINE_NOUN = { droid:'droid', frik:'head', mouse:'Mouse', builder:'build' };
function wizMineNoun(model){ return WIZ_MINE_NOUN[model || 'droid'] || 'droid'; }

const WIZ = { i:0 };

/* Captured at SCRIPT LOAD TIME, straight off localStorage — before ANY
   app code runs. This matters: buildGet() fills in PREFS.build with the
   defaults the first time anything asks for it, and something harmless
   and unrelated already does that before boot ever reaches the wizard —
   config/workspaces.js's own wsInit() paints the header's workspace
   switcher, which asks wsReachable('seq'), which asks buildCanSequence(),
   which calls buildGet(). By the time buildStartup() first runs,
   PREFS.build already exists for EVERY session, first run included — so
   "PREFS.build is present" cannot be the grandfather signal at that
   point, it would grandfather every fresh install. What was actually
   SAVED, before this page touched anything, is read here instead. */
let WIZ_HAD_SAVED_BUILD = false;
try{
  const wizRaw = localStorage.getItem(typeof STORE_KEY !== 'undefined' ? STORE_KEY : 'r2sim.prefs.v1');
  if(wizRaw){
    const wizSaved = JSON.parse(wizRaw);
    WIZ_HAD_SAVED_BUILD = !!(wizSaved && wizSaved.build);
  }
}catch(e){ /* private mode / file:// restrictions — same as prefsLoad() */ }

/* -------------------------------------------------------- visited steps (1.5b)
   A fresh wizard shows a ✓ on every hardware chip because every question
   HAS an answer — the defaults. That is true and useless: an answer
   nobody has looked at is not a confirmation. So a step counts as VISITED
   once it has actually been on screen (rendered, in buildStartup below)
   or its answer changed while it was — both paths go through the same
   render, since every wizard control redraws immediately after it fires.

   PREFS.wizVisited is a plain {key:true} map, not a Set — it has to
   survive prefsSave()'s JSON.stringify. GRANDFATHER RULE: a build SAVED
   before this feature existed (see WIZ_HAD_SAVED_BUILD above) is treated
   as fully visited — every question in it already carries a real,
   once-considered answer, not a first run's untouched default. */
function wizVisitedInit(){
  if(PREFS.wizVisited) return PREFS.wizVisited;
  PREFS.wizVisited = {};
  if(WIZ_HAD_SAVED_BUILD){
    wizSteps().forEach(s=>{ if(s.key === '_model' || s.key.charAt(0) !== '_') PREFS.wizVisited[s.key] = true; });
  }
  return PREFS.wizVisited;
}
function wizVisited(key){ return !!wizVisitedInit()[key]; }
function wizMarkVisited(key){
  const v = wizVisitedInit();
  if(v[key]) return;
  v[key] = true;
  if(typeof prefsSave === 'function') prefsSave();
}
/* the rail is no longer one DOM child per step — the "jobs" divider
   (1.5c) sits between the ninth and tenth — so anything that wants A
   step's own chip asks by its logical wizSteps() index rather than the
   rail's raw children, which the divider would throw off by one from
   here on. */
function wizRailChip(i){ return document.querySelectorAll('#stprail .raildot')[i]; }

/* Steps where you need to SEE the droid while you work. The overlay gives up
   the right of the window and the app reflows the 3D stage into it, so a test
   click or a colour change is visible immediately. */
const WIZ_SPLIT = ['_panels','_paint','_scene'];
function wizSplit(on){
  const had = document.body.classList.contains('wizsplit');
  document.body.classList.toggle('wizsplit', !!on);
  /* the canvas is absolutely positioned and only resizes on a window event,
     so a layout change of ours has to say so explicitly */
  if(had !== !!on && typeof onResize === 'function'){
    requestAnimationFrame(()=>{
      onResize();
      /* the column is tall and narrow — frame the whole droid in it rather
         than leaving whatever the user was last looking at half off-screen */
      if(on && typeof viewFrame === 'function') viewFrame('full');
    });
  }
}

function wizOpen(at){
  const steps = wizSteps();
  /* "genuine first run" (1.2c) — true only for the very first wizOpen() of
     the session, and only if nothing was configured yet. Every OTHER way
     in — Setup in the header, Config's "open the setup" door, a step door
     elsewhere in the app — happens strictly after that one: until the
     wizard closes, nothing else is reachable on a real first run, so the
     boot trigger is by construction the first call. No flag has to be
     threaded in from main.js for this to hold. */
  WIZ.firstRun = !WIZ.everOpened && !buildConfigured();
  WIZ.everOpened = true;
  WIZ.i = (at !== undefined) ? at : (buildConfigured() ? steps.length-1 : 0);
  buildStartup();
  $('startup').classList.add('on');
}
function wizGo(i){
  const steps = wizSteps();
  WIZ.i = clamp(i, 0, steps.length-1);
  /* generate a starter the moment the wiring step needs channels to draw */
  if(steps[WIZ.i].key === '_wiring' || steps[WIZ.i].key === '_panels') buildEnsureMaestro();
  buildStartup();
}
function wizNext(){
  const steps = wizSteps();
  if(WIZ.i >= steps.length-1){ wizFinishAsked(); return; }
  wizGo(WIZ.i+1);
}

/* ==================================================== FINISH, AND KEEP IT
   Mike, 2026-08-16: "clicking finsh should prompt to export all settigns
   and config".

   The bench already asks this about the servo config on ITS Finish step
   (setup-hw.js), and for the same reason: an afternoon's work that exists
   only in one browser is an afternoon you will do again on the next
   machine. The build answers, the panel mapping, the colours and the scene
   were never covered by that prompt — they live in PREFS, which is not a
   file either.

   So the way out of the wizard offers the whole thing, once, as one .json:
   `setupExportObj()`'s file — the build answers, the channel table, the
   sequences, the mapping, the paint and the scene together.

   Two rules kept from the bench's version:
     · it OFFERS, it does not insist. "Not now" is a real answer and the
       Finish still finishes.
     · the ASK lives on the button, not in wizFinish(). wizFinish() is
       called directly by six suites and by wizNext(); a promise in the
       middle of it would leave a modal open across whatever ran next.
       Anything that wants the question asks for it by name. */
async function wizFinishAsked(){
  let save = false;
  if(typeof appConfirm === 'function'){
    const b = (typeof buildGet === 'function') ? buildGet() : {};
    const used = (typeof MSTR !== 'undefined' && MSTR.channels)
      ? MSTR.channels.filter(c=>c && /^servo/i.test(c.mode||'')).length : 0;
    const seqs = (typeof MSTR !== 'undefined' && MSTR.sequences) ? MSTR.sequences.length : 0;
    const bits = [];
    if(b && b.done !== undefined) bits.push('your hardware answers');
    if(used) bits.push(used + ' servo channel' + (used===1?'':'s'));
    if(seqs) bits.push(seqs + ' sequence' + (seqs===1?'':'s'));
    bits.push('the panel mapping, the colours and the scene');
    save = await appConfirm(
      /* NOT wizJoin() — that one ends with "or", which is right for a list
         of alternatives and wrong for a list of things all going in */
      'One file carries all of it — ' + (bits.length > 1
        ? bits.slice(0,-1).join(', ') + ' and ' + bits[bits.length-1] : bits.join('')) + '.\n\n'
      + 'It is kept in this browser as well, which is fine until you clear the cache, open the app on the '
      + 'workshop laptop, or want to send somebody your build. Saving takes a second.',
      {title:'Save your setup to a file?', yes:'Save it, then finish', no:'Not now'});
  }
  if(save && typeof setupExport === 'function') setupExport();
  wizFinish();
}
function wizBack(){ wizGo(WIZ.i-1); }
function wizFinish(){
  const model = (typeof modelGet === 'function') ? modelGet() : 'droid';
  const genuineFirstRun = !!WIZ.firstRun;
  buildGet().done = true;
  buildApply();
  prefsSave();
  lg('sys','build configured — '+buildSummaryRows().map(r=>r.title+': '+r.label).join(' · '));
  closeStartup();
  if(typeof buildConfig === 'function') buildConfig();
  /* land where the work is (1.2b) — finishing into the Builder opens the
     Builder pane itself rather than the bare Drive view the droid's own
     Controls list leaves on screen. mbOpenPane() is scene/builder.js's
     own door; guarded both for load order and for a build without it. */
  if(model === 'builder'){ typeof mbOpenPane === 'function' && mbOpenPane(); }
  /* the first-run "what next" card (1.2c) — a GENUINE first run only, and
     shown once ever */
  if(genuineFirstRun && !PREFS.seenNextCard) wizNextCardOpen(model);
}

/* ============================================================ 1.2c
   THE FIRST-RUN CARD — "where next?"

   A genuine first-run Finish lands on the stage with the droid built and
   nothing telling you what to actually DO with it. Three doors, worded
   for whatever got built: drive it, learn it, or go build a sequence —
   and for the Builder, the first door is the parts bin rather than a
   sketch of legs it does not have. JS-built, bottom-centre over the
   stage, a plain × to dismiss — the same "quiet, dismissible, over the
   stage" language as a toast, just bigger because there is a decision in
   it. Shown once: PREFS.seenNextCard flips the moment it is drawn, not
   the moment a door is chosen, so closing it with × still counts as seen.
   ===================================================================== */
function wizNextCardClose(){
  const h = $('wizNextCard');
  if(h) h.remove();
}
function wizNextCardOpen(model){
  PREFS.seenNextCard = true;
  if(typeof prefsSave === 'function') prefsSave();
  wizNextCardRender(model);
}
function wizNextCardRender(model){
  wizNextCardClose();
  const isBuilder = model === 'builder';
  const host = el('div','wiznext'); host.id = 'wizNextCard';

  const x = el('button','wiznextx','×'); x.title = 'close';
  x.addEventListener('click', wizNextCardClose);
  host.appendChild(x);
  host.appendChild(el('div','wiznexthead','Where next?'));

  const doors = el('div','wiznextdoors');

  const d1 = el('button','wiznextdoor');
  d1.dataset.door = isBuilder ? 'build' : 'drive';
  d1.appendChild(el('b',null, isBuilder ? 'Start building' : 'Drive it'));
  d1.appendChild(el('span',null, isBuilder
    ? 'opens the Builder pane — the parts bin lives there'
    : 'press START (Enter) to arm the feet'));
  d1.addEventListener('click',()=>{
    wizNextCardClose();
    if(isBuilder){ typeof mbOpenPane === 'function' && mbOpenPane(); }
    else if(typeof toast === 'function') toast('press START (Enter) to arm the feet');
  });
  doors.appendChild(d1);

  const d2 = el('button','wiznextdoor');
  d2.dataset.door = 'learn';
  d2.appendChild(el('b',null,'Learn to drive'));
  d2.appendChild(el('span',null,'the lessons — the full list, one at a time'));
  d2.addEventListener('click',()=>{
    wizNextCardClose();
    if(typeof setTutor === 'function') setTutor(true);
    const t = document.querySelector('#tabs button[data-p="pLearn"]');
    if(t) t.click();
  });
  doors.appendChild(d2);

  const d3 = el('button','wiznextdoor');
  d3.dataset.door = 'seq';
  d3.appendChild(el('b',null,'Build a sequence'));
  d3.appendChild(el('span',null,'the sequencer desk — bricks, timed, and put on the board'));
  d3.addEventListener('click',()=>{
    wizNextCardClose();
    if(typeof wsSet === 'function') wsSet('seq');
  });
  doors.appendChild(d3);

  host.appendChild(doors);
  ($('stage') || document.body).appendChild(host);
}

/* --------------------------------------------------------- option cards */
function wizOptionCard(host, key, opt, on, blockers, onPick){
  const c = el('div','optcard'+(on?' act':'')+(blockers && blockers.length?' blocked':''));
  /* the picture first, then the name, then what choosing it means — Mike,
     2026-08-16: "these boxes should be the board images with a description
     underneith". A photo when one has been dropped in src/art/boards/, the
     drawn stand-in otherwise, and nothing at all for an answer that is not
     a thing you can hold (config/board-art.js). */
  /* v1.45.0 — `opt.art` lets an answer BORROW another answer's picture. The
     servo step's family cards need it: "Pololu Maestro" is not itself a board
     you can photograph, so it shows a Mini 24 and the expander family shows a
     PCA9685. Everything else still asks by its own id. */
  const artId = opt.art || opt.id;
  const art = (typeof boardArtHtml === 'function') ? boardArtHtml(key, artId, opt.label) : '';
  if(art){
    const photo = (typeof boardArtIsPhoto === 'function') && boardArtIsPhoto(key, artId);
    const pic = el('div','optpic' + (photo ? ' photo' : ''));
    pic.innerHTML = art;
    c.appendChild(pic);
    c.classList.add('haspic');
  }
  const head = el('div','opthead');
  head.appendChild(el('b',null,opt.label));
  if(opt.sim === 'park')      head.appendChild(el('span','optbadge park','not simulated'));
  else if(opt.sim === 'sub')  head.appendChild(el('span','optbadge sub','stands in'));
  else if(on)                 head.appendChild(el('span','optbadge ok','selected'));
  c.appendChild(head);
  c.appendChild(el('div','optnote',opt.note));
  if(blockers && blockers.length){
    const b = el('div','optwhy');
    b.innerHTML = blockers.map(x=>'✕ '+x.why).join('<br>');
    c.appendChild(b);
  }
  c.addEventListener('click',()=>onPick(opt.id));
  c.tabIndex = 0;
  c.dataset.opt = key+':'+opt.id;
  c.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onPick(opt.id); } });
  host.appendChild(c);
  return c;
}

/* Collapsed, not hidden (v1.32.0). The question is still answerable and the
   answer is still kept — it describes the droid — but the step opens by
   saying it has nothing to do with what is on the stage, so nobody spends
   thought on a dome motor for a puppet head. Shared by both step renderers
   since the servo step got its own (v1.34.0). */
function wizModelBanner(host, step){
  const model = (typeof modelGet === 'function') ? modelGet() : 'droid';
  const unused = (typeof stepUsedByModel === 'function') && !stepUsedByModel(step.key, model);
  if(!unused) return false;
  const n = el('div','note na');
  n.innerHTML = '<b>Not used by the ' + modelById(model).label + '.</b> ' + modelUnusedWhy(model)
    + '. Your answer is kept for the droid and nothing here is lost — switch the model back on the '
    + '<b>Model</b> step and this question matters again.';
  const bar = el('div','conbar');
  const back = el('button','b','Back to the model');
  back.addEventListener('click',()=>wizGo(0));
  bar.appendChild(back);
  n.appendChild(bar);
  host.appendChild(n);
  return true;
}

/* ------------------------------------------ the roomy steps (v1.45.0)
   Mike: "Enlarge the Xbox 360 wireless image."

   The photo box is one size for all twenty-one board cards on purpose —
   that is what lets a row of cards where only some have photos still line
   up (css/07-startup.css, .optpic). Growing `img.optphoto` itself would
   have grown every one of them and taken the row rhythm with it.

   But the size is really a property of the STEP, not of the app: the
   controller step has three options and the whole width of the screen,
   while the servo and sound steps have seven cards fighting for it. So a
   step named here gets the bigger box, and nothing else changes. Add a key
   when a step earns it; the twenty-one cards are not affected either way. */
const WIZ_BIG_PIC = {controller:1};

function wizHardwareStep(host, step){
  const b = buildGet();
  const unused = wizModelBanner(host, step);

  const grid = el('div','optgrid' + (WIZ_BIG_PIC[step.key] ? ' bigpic' : '') + (unused ? ' na' : ''));
  BUILD_OPTIONS[step.key].forEach(o=>{
    /* the firmware step greys what the HARDWARE cannot run; every other step
       now greys what the chosen SKETCH cannot drive (v1.35.0) — the same
       service, pointing the other way, because the firmware is question 3 */
    const blockers = (step.key === 'firmware') ? firmwareBlockers(o.id, b)
                                               : optionBlockers(step.key, o.id, b);
    wizOptionCard(grid, step.key, o, b[step.key]===o.id, blockers, id=>{
      buildSet(step.key, id);
      buildStartup();
      if(typeof rebuildProfileUI === 'function' && step.key === 'firmware') rebuildProfileUI();
    });
  });
  host.appendChild(grid);

  if(step.key === 'firmware'){
    const rec = firmwareRecommend(b);
    const n = el('div','note cy');
    n.innerHTML = '<b>Recommended: '+buildLabel('firmware',rec.id)+'</b> — '+rec.why+'.'
      + (rec.clear.length ? '' : ' Nothing clears every check, so change a hardware answer below if you want a clean match.');
    host.appendChild(n);
    const bar = el('div','conbar');
    if(b.firmware !== rec.id){
      const bb = el('button','b prim','Use '+buildLabel('firmware',rec.id));
      bb.addEventListener('click',()=>{ buildSet('firmware', rec.id); buildStartup(); if(typeof rebuildProfileUI==='function') rebuildProfileUI(); });
      bar.appendChild(bb);
    }
    /* v1.35.0 — the question is asked BEFORE the hardware now, so a choice
       made here has to survive the answers that follow it. It does; this is
       the way back if you would rather the setup decided. */
    if(b.firmwarePinned){
      const ub = el('button','b','Let the setup choose');
      ub.title = 'stop holding this choice — the setup will pick whichever sketch your hardware answers point at, and keep it up to date as you change them';
      ub.addEventListener('click',()=>{ buildUnpinFirmware(); buildStartup(); if(typeof rebuildProfileUI==='function') rebuildProfileUI(); });
      bar.appendChild(ub);
    }
    if(bar.childNodes.length) host.appendChild(bar);
    const h = el('div','hint');
    h.innerHTML = b.firmwarePinned
      ? '<b>This choice is yours and the setup will not change it.</b> The hardware questions after this one grey out anything '
        + buildLabel('firmware', b.firmware) + ' cannot drive, and say why — so you can see the consequence before you buy the board.'
      : 'Pick one and it stays picked. Until you do, the setup keeps this in step with your hardware answers on its own.';
    host.appendChild(h);
  }
  if(step.key === 'firmware'){
    /* YOUR OWN sketches (v1.22.0). Each imported .ino is a firmware in its
       own right — listed above with the three ports — so this section is
       where you add another one or drop one you no longer want. */
    const my = (typeof sketchIds === 'function') ? sketchIds() : [];
    const ms = sect(host, 'Your own sketches', my.length ? my.length+' imported' : 'none yet');
    my.forEach(id=>{
      const r = el('div','lnkrow'+(b.firmware===id?' act':''));
      r.appendChild(el('div','lnkname', PROFILES[id].file));
      const rep = (SKETCH.byId[id] && PROFILES[id].hasMaestro) ? 'Maestro subroutines' : 'PCA9685 direct';
      r.appendChild(el('code','lnkfile', rep+' · '+PROFILES[id].audio));
      const x = el('button','b','Forget');
      x.title = 'remove this sketch — the .ino on your disk is untouched';
      x.addEventListener('click', async ()=>{
        const sure = await appConfirm('Remove "'+PROFILES[id].file+'" from the firmware list?\n\n'
          + 'Your .ino file is not touched — drop it in again any time.',
          {title:'Forget this sketch?', yes:'Forget', no:'Keep', danger:true});
        if(!sure) return;
        sketchForget(id);
        buildStartup();
        if(typeof rebuildProfileUI === 'function') rebuildProfileUI();
      });
      r.appendChild(x);
      ms.appendChild(r);
    });
    const drop = el('div','hint prose');
    drop.innerHTML = my.length
      ? 'Drop another <code>.ino</code> anywhere on the window to add it. Each one becomes its own firmware you can switch between.'
      : 'Drop a Padawan360-family <code>.ino</code> anywhere on the window and it is transpiled into a firmware of its own, right here beside the three ports. Nothing is guessed — anything the transpiler does not understand is refused by name and line.';
    ms.appendChild(drop);

    /* ONE LINK, for the sketch you actually chose (v1.37.0). Mike: "when a
       user selects which firmware only then should it provide a link to the
       correct firmware only others should be hidden." Three repo rows, two
       of which you are not going to flash, is three chances to flash the
       wrong one — and the whole point of the step above is that you have
       now decided. */
    const mine = BUILD_OPTIONS.firmware.find(o=>o.id === b.firmware && o.repo);
    if(mine){
      const sl = sect(host, 'Where to get it', mine.label);
      const r = el('div','lnkrow act');
      r.appendChild(el('div','lnkname', mine.label));
      const a = document.createElement('a');
      a.href = mine.repo; a.target = '_blank'; a.rel = 'noopener'; a.className = 'lnk';
      a.textContent = mine.repo.replace('https://github.com/','');
      r.appendChild(a);
      r.appendChild(el('code','lnkfile', mine.file));
      sl.appendChild(r);
      const hl = el('div','hint');
      hl.innerHTML = 'The simulator reproduces this sketch statement for statement, <b>bugs included</b> — that is the point. '
        + 'Check §4 of the handover before you flash: several confirmed defects are listed there with the fix. '
        + 'The other two sketches\' links appear here if you choose them instead.';
      sl.appendChild(hl);
    }else if(typeof isSketchProfile === 'function' && isSketchProfile(b.firmware)){
      const sl = sect(host, 'Where to get it', 'your own sketch');
      const hl = el('div','hint');
      hl.innerHTML = 'This one is yours — the <code>' + (PROFILES[b.firmware]||{}).file + '</code> you dropped on the window. '
        + 'The simulator runs exactly what that file says.';
      sl.appendChild(hl);
    }
  }
  if(step.key === 'bodyDrive'){
    const n = el('div','hint');
    n.innerHTML = 'This is the one still open on your build. Switching it here sets <b>FOOT_CONTROLLER</b> on the sketch and rebuilds the Outputs table — '
      + 'brushed speeds run 90/110/127 with a deadzone of 7, the hub speeds 30/38/50 with a deadzone of 22, so the feel is very different.';
    host.appendChild(n);
  }
  if(step.key === 'controller'){
    /* the RC set needs a device, its endpoints and a channel map before it
       can drive anything, and this is the moment the user said they have
       one — so the whole job is right here rather than somewhere to be
       found later (Mike, 2026-08-14: "we just need to calibrate it and
       assign channels") */
    if(b.controller === 'rc' && typeof rcSetupPanel === 'function'){
      rcSetupPanel(host, buildStartup);
    }
    const n = el('div','hint');
    n.innerHTML = b.controller === 'rc'
      ? 'The on-screen pad and the keyboard keep working alongside the transmitter, so you can still reach a button you have not assigned yet.'
      : 'Plug a real pad in and press a button — the on-screen controller mirrors it. The keyboard drives it too (see the Controls tab).';
    host.appendChild(n);
  }
}

/* -------------------------------------------------------------- model
   Three big picture cards. The artwork is hand-drawn SVG rather than a
   render — see config/model-art.js for why — and the card is the whole
   click target, not a radio button beside it. */
function wizModelStep(host){
  const cur = (typeof modelGet === 'function') ? modelGet() : 'droid';
  const grid = el('div','modelgrid');
  (typeof MODELS !== 'undefined' ? MODELS : []).forEach(m=>{
    const c = el('div','optcard modelcard' + (cur === m.id ? ' act' : ''));
    c.dataset.opt = 'model:' + m.id;
    c.tabIndex = 0;

    const pic = el('div','modelpic');
    pic.innerHTML = (typeof modelArtSvg === 'function') ? modelArtSvg(m.id) : '';
    c.appendChild(pic);

    const head = el('div','opthead');
    head.appendChild(el('b', null, m.label));
    if(cur === m.id) head.appendChild(el('span','optbadge ok','on the stage'));
    c.appendChild(head);
    c.appendChild(el('div','optnote', m.blurb));

    const pick = ()=>{ if(typeof modelSet === 'function') modelSet(m.id); buildStartup(); };
    c.addEventListener('click', pick);
    c.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
    grid.appendChild(c);
  });
  host.appendChild(grid);

  const na = (typeof modelSkippedSteps === 'function') ? modelSkippedSteps(cur) : [];
  if(na.length){
    const n = el('div','hint');
    n.innerHTML = 'The ' + modelById(cur).label + ' does not use ' + wizJoin(na.map(k=>{
      const s = BUILD_STEPS.find(x=>x.key === k);
      return '<b>' + (s ? s.title.toLowerCase() : k) + '</b>';
    })) + '. Those questions stay in the list, greyed, and your answers are kept — they describe your droid, '
      + 'and the droid is one card away.';
    host.appendChild(n);
  }

  const h = el('div','note');
  h.innerHTML = '<b>This picks what is on the stage, not what is switched on.</b> The sketch keeps running whichever model you choose — '
    + 'the serial console, the output tables and the automation timers all carry on. Only one model is shown, driven and mapped at a time, '
    + 'so what the channel table says is always what you are looking at.';
  host.appendChild(h);
}
/* "a, b and c" — used in a couple of places below */
function wizJoin(parts){
  if(parts.length <= 1) return parts.join('');
  return parts.slice(0,-1).join(', ') + ' or ' + parts[parts.length-1];
}

/* ======================================================== SERVOS (v1.34.0)
   Mike: "we should merge the Body / Dome servos into one - the user then
   sets whats controlling the Dome / Body and then hows its wired."

   Three blocks, in that order, and the order is the sentence:

     1. HOW MANY controllers — one for the droid, or one at each end.
     2. WHAT each end is — side by side, so the thing the two separate
        questions could never show (how the ends relate) is the thing you
        see first.
     3. HOW they reach the host — only a question when there are two of
        them on the host UART, because that is the only case with an
        answer worth having.

   Plus the co-processor chip, when an answer needs one. It sits here
   rather than being a question of its own for the same reason the two
   servo questions merged: it is part of "what is the board", not a
   separate decision.
   ===================================================================== */
/* A labelled <select>. Mike, 2026-08-14: "we should use drop down boxes to
   simplify the veiw" — and he is right about this step in particular: five
   of its six questions have one obvious answer and a couple of alternatives,
   which is what a dropdown is FOR. The one exception is the shape, and that
   gets pictures instead (wizTopoPicker). */
function wizField(host, label, hint, opts, cur, onPick){
  const row = el('div','svfield');
  const lab = el('label','svflab');
  lab.appendChild(el('b', null, label));
  if(hint) lab.appendChild(el('span','svfhint', hint));
  row.appendChild(lab);
  const sel = document.createElement('select');
  sel.className = 'svfsel';
  opts.forEach(o=>{
    const op = document.createElement('option');
    op.value = o.id; op.textContent = o.label + (o.suffix ? '  —  ' + o.suffix : '');
    if(o.id === cur) op.selected = true;
    sel.appendChild(op);
  });
  sel.addEventListener('change',()=>onPick(sel.value));
  row.appendChild(sel);
  host.appendChild(row);
  /* the chosen option's own note, under the control that chose it */
  const chosen = opts.find(o=>o.id === cur);
  if(chosen && chosen.note){
    const n = el('div','optnote svfnote', chosen.note);
    if(chosen.sim === 'park') n.classList.add('park');
    host.appendChild(n);
  }
  return sel;
}

/* One flow card: the arrangement drawn as a picture, whole card clickable
   (config/flow-art.js draws it from the topology's own `flow` array).

   v1.45.0 — pulled out of wizTopoPicker so the three picture questions on the
   servo step are literally the same card: the PCA9685 arrangement grid, the
   Maestro one-board/two-boards pair, and the advanced "how do two boards
   reach the droid" pair. `o.key`/`o.id` name the card for a test and for the
   step it belongs to; `o.label`/`o.note` let a card say what the QUESTION
   calls this arrangement rather than what the topology calls it. */
function wizFlowCard(grid, t, on, o){
  o = o || {};
  const c = el('div','flowcard' + (on ? ' act' : '') + (t.sim === 'park' ? ' park' : ''));
  c.dataset.opt = (o.key || 'servoTopo') + ':' + (o.id !== undefined ? o.id : t.id);
  c.tabIndex = 0;

  const head = el('div','opthead');
  head.appendChild(el('b', null, o.label || t.label));
  if(t.sim === 'park')     head.appendChild(el('span','optbadge park','not working yet'));
  else if(t.sim === 'sub') head.appendChild(el('span','optbadge sub','stands in'));
  else if(on)              head.appendChild(el('span','optbadge ok','selected'));
  c.appendChild(head);

  const pic = el('div','flowpic');
  pic.innerHTML = (typeof servoTopoSvg === 'function') ? servoTopoSvg(t) : '';
  c.appendChild(pic);

  c.appendChild(el('div','optnote', o.note || t.note));

  const pick = o.onPick || (()=>{ buildSet('servoTopo', t.id); buildStartup(); });
  c.addEventListener('click', pick);
  c.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
  grid.appendChild(c);
  return c;
}

/* The shape, as pictures. One card per arrangement the chosen device has. */
/* ================================= HOW MANY EXPANDERS (v1.54.0)
   Mike had three PCA9685s answering on the bench and the build could only
   say two, because "one expander" and "two expanders" were two separate
   arrangement CARDS. Cards are right for a shape — controller or no
   controller, one link or two — and wrong for a quantity: eight of them
   would be eight near-identical pictures differing by one rectangle.

   So the shape stays a card and the quantity becomes a number beside it,
   which is also what the bench's own Channels step has always used. The
   ceiling is the wire protocol's, not an arbitrary one, and the field says
   what the answer BUYS you — channels, and the highest channel number —
   because "6 boards" is not a thing anyone can picture and "96 channels" is.

   Only for shapes that carry a count (`counted`). `p0` is the mod2026 pair
   at two fixed addresses on the host's own bus, and `p2s`/`p1s` split their
   expanders across two links and are both sim:'park'; giving any of them a
   count would be offering an arrangement nothing drives. */
function wizPcaCountPicker(host, b){
  const topo = buildServoTopo(b);
  if(!topo.counted) return null;
  const n = Math.max(1, Math.min(PCA_MAX_BOARDS_UI, b.pcaBoards|0));
  const row = el('div','setrow pcacount');
  const lab = el('label');
  lab.appendChild(document.createTextNode('How many expander boards? '));
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '1'; inp.max = String(PCA_MAX_BOARDS_UI);
  inp.value = String(n); inp.id = 'wizPcaBoards';
  inp.title = 'Each PCA9685 is 16 channels. Up to ' + PCA_MAX_BOARDS_UI
            + ' of them on the one I2C bus — the addresses are found by a boot scan, '
            + 'so bridge whichever jumpers suit the build.';
  inp.addEventListener('change', ()=>{
    buildSet('pcaBoards', Math.max(1, Math.min(PCA_MAX_BOARDS_UI, +inp.value || 1)));
    buildStartup();
  });
  lab.appendChild(inp);
  row.appendChild(lab);
  const stat = el('span','stat');
  stat.textContent = (n*16) + ' channels · highest channel number ' + (n*16 - 1);
  row.appendChild(stat);
  host.appendChild(row);
  if(n > 2){
    const note = el('div','hint');
    note.innerHTML = 'More than two expanders needs the <b>current sketch</b> on the controller — '
      + 'PCA_Bridge 2 or MaestroReplacement 3 and later. Driving servos live from this app used to stop '
      + 'at channel 61 because the channel travelled in six bits; it travels in seven now. Exported '
      + 'sequences drive every channel either way.';
    host.appendChild(note);
  }
  return row;
}

function wizTopoPicker(host, b){
  const list = servoTopos(b.servoDevice);
  const cur  = buildServoTopo(b);
  const grid = el('div','flowgrid');
  list.forEach(t=>wizFlowCard(grid, t, t.id === cur.id));
  host.appendChild(grid);
  return grid;
}

/* ============================================ SERVO HARDWARE (v1.45.0)
   Mike: "Make Servo Hardware image-led: choose Maestro or PCA9685 first, then
   show relevant options." And: "Maestro: choose one or two boards. PCA9685:
   visual board-variation choice, defaulting to one controller and two
   expanders."

   WHAT THIS STEP USED TO BE. A dropdown of three devices, then a grid of
   wiring diagrams, then more dropdowns, then a photo strip. Everything was
   present at once and the first control was a <select> — so the question that
   decides the whole rest of the step ("which kind of board is it?") looked
   exactly as important as "which chip runs the co-processor", and the
   pictures, which are the part that actually tells you what you are looking
   at, came third.

   WHAT IT IS NOW. The family FIRST, as three picture cards using the real
   board photos — the same card the model step uses (Mike's own example of
   pictures beating lists), whole card clickable. Then, and only then, that
   family's own question:

     Maestro   → one board or two. That was implied by which wiring diagram
                 you clicked; it is the explicit question now and the shape is
                 derived from it (servoBoardCountTopo). How two boards reach
                 the droid — chained, or a port each — is the detail behind
                 the one advanced switch, collapsed rather than hidden, so
                 that answer is still there and still changeable.
     PCA9685   → the arrangement, as pictures, defaulting to one controller
                 and two expanders (SERVO_DEFAULT_TOPO).

   WHAT DID NOT CHANGE. buildNormaliseServos() is still the ONE place any of
   this is turned into domeServo/bodyServo/servoSplit/servoLink/PREFS.hw, and
   every control here goes through buildSet() to reach it. A saved build with
   any of the seven topologies still loads and still reads correctly, and the
   legacy `mixed` answer — a Maestro at one end and expanders at the other,
   which the pictures cannot draw — is still shown, still selected, and still
   replaced only when you choose something else.
   ===================================================================== */

/* Collapsed, not hidden: ONE switch, for the session, exactly as the Bench's
   own `advanced` tick works (maestro/setup-hw.js). Not a preference — it is a
   view state, and nobody wants yesterday's curiosity remembered. */
let WIZ_SERVO_ADV = false;

/* 1 · the family. Three cards, real photos, whole card is the click target. */
function wizServoFamilyPicker(host, b, unused){
  const grid = el('div','optgrid famgrid' + (unused ? ' na' : ''));
  servoDeviceOptions(b).forEach(d=>{
    wizOptionCard(grid, 'servoDevice', d, b.servoDevice === d.id, [],
      id=>{ buildSet('servoDevice', id); buildStartup(); });
  });
  host.appendChild(grid);
  return grid;
}

/* 2a · Maestro: one board or two — the question, not the consequence */
function wizMaestroCountPicker(host, b){
  const cur  = buildMaestroBoardCount(b);
  const grid = el('div','flowgrid pair');
  SERVO_BOARD_COUNTS.forEach(c=>{
    const t = servoTopoDef(servoBoardCountTopo(c.n, b));
    wizFlowCard(grid, t, cur === c.n, {
      key:'servoBoards', id:c.n, label:c.label, note:c.note,
      onPick:()=>{ buildSet('servoTopo', servoBoardCountTopo(c.n, b)); buildStartup(); }
    });
  });
  host.appendChild(grid);
  return grid;
}

/* 2b · and the detail behind the switch: how two of them reach the droid */
function wizServoLinkPicker(host, b){
  const cur  = buildServoTopo(b);
  const grid = el('div','flowgrid pair');
  servoTopos('maestro').filter(t=>t.boards > 1).forEach(t=>wizFlowCard(grid, t, t.id === cur.id));
  host.appendChild(grid);
  return grid;
}

/* the Maestro sizes, as dropdown options — no co-processor entries, because
   the device question has already ruled them in or out */
function wizMaestroSizes(key){
  return (BUILD_OPTIONS[key] || [])
    .filter(o=>o.family === 'maestro')
    .map(o=>({id:o.id, label:o.label, suffix:o.size, note:o.note, sim:o.sim}));
}

function wizServosStep(host, step){
  const b = buildGet();
  const unused = wizModelBanner(host, step);
  const topo = buildServoTopo(b);

  /* ------------------------------------------- 1 · the family, as pictures */
  const s1 = sect(host, 'Maestro, or PCA9685?', servoDeviceDef(b.servoDevice).label);
  const h1 = el('div','hint');
  h1.innerHTML = 'There are two ways to drive twenty-odd servos, and everything else on this step follows from '
    + 'which one is in your droid. Click the picture that looks like the board in your hand — the sizes and the '
    + 'wiring come after.';
  s1.appendChild(h1);
  wizServoFamilyPicker(s1, b, unused);

  if(b.servoDevice === 'mixed'){
    /* a saved build the pictures cannot draw — show what it IS, and leave it
       alone until the user replaces it themselves (v1.36.0) */
    const n = el('div','hint');
    n.innerHTML = '<b>' + buildLabel('domeServo', b.domeServo) + '</b> in the dome, <b>'
      + buildLabel('bodyServo', b.bodyServo) + '</b> in the body. That is a real arrangement and the simulator drives it — '
      + 'it just is not one of the shapes these pictures can draw. Choose a card above to replace it.';
    s1.appendChild(n);
    wizServoLinkWarning(host, b);
    return;
  }

  if(b.servoDevice === 'other'){
    const n = el('div','note');
    n.innerHTML = '<b>Nothing is modelled for this yet.</b> The answer is recorded and it will appear on the wiring sheet, '
      + 'but the simulator carries on driving whatever you had chosen before — otherwise picking it would take the whole '
      + 'sim down with it. Tell me what the board is and it can be added properly.';
    s1.appendChild(n);
    return;
  }

  /* ------------------------------- 2 · that family's own question, and only it */
  if(b.servoDevice === 'maestro'){
    /* Mike: "Maestro: choose one or two boards." The count IS the question now;
       the wiring shape is derived from it (config/hardware.js). */
    const s2 = sect(host, 'One Maestro, or one at each end?',
                    buildMaestroBoardCount(b) === 1 ? 'one board' : 'two boards');
    const h2 = el('div','hint');
    h2.innerHTML = 'The picture on each card is the path from the droid\'s own Arduino to a servo horn. '
      + 'Count the channels you need before you choose: the MK4 dome alone is 12 pies and 14 side panels.';
    s2.appendChild(h2);
    wizMaestroCountPicker(s2, b);

    /* ONE explicit switch, and the answer behind it stays answerable. Opened
       by default when the build is already ON the non-standard arrangement —
       hiding somebody's own answer from them would be worse than a tick box. */
    if(buildMaestroBoardCount(b) > 1){
      const open = WIZ_SERVO_ADV || buildServoTopo(b).link === 'separate';
      const lab = el('label','svadv');
      lab.title = 'how the two boards reach the droid: both on one serial line with device numbers, '
                + 'or a serial port each. Chained is the standard Pololu wiring and the only one the sketches open.';
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = open; chk.id = 'wizServoAdv';
      chk.addEventListener('change',()=>{ WIZ_SERVO_ADV = chk.checked; buildStartup(); });
      lab.appendChild(chk);
      lab.appendChild(document.createTextNode('advanced — how the two boards reach the droid'));
      s2.appendChild(lab);
      if(open) wizServoLinkPicker(s2, b);
    }
  }else{
    /* Mike: "PCA9685: visual board-variation choice, defaulting to one
       controller and two expanders" (SERVO_DEFAULT_TOPO, config/hardware.js) */
    const s2 = sect(host, 'How are the boards arranged?', topo.label);
    const h2 = el('div','hint');
    h2.innerHTML = 'Follow the arrows: this is the path from the droid\'s own Arduino to a servo horn. '
      + 'The difference between these is what sits in front of the expanders — a small board of their own that '
      + 'answers like a Maestro, or nothing at all.';
    s2.appendChild(h2);
    wizTopoPicker(s2, b);
    wizPcaCountPicker(s2, b);
  }

  /* ------------------------------------------- 3 · the sizes, and the boards */
  const s3 = sect(host, b.servoDevice === 'maestro' ? 'Which size?' : 'What is driving them?',
                  buildServoAnswer(b).short);
  const form = el('div','svform' + (unused ? ' na' : ''));

  if(b.servoDevice === 'maestro'){
    const two = buildMaestroBoardCount(b) > 1;
    wizField(form, two ? 'Maestro 1 — dome' : 'The Maestro',
      two ? 'the dome end — the pies and the side panels' : 'running the whole droid',
      wizMaestroSizes('domeServo'), b.servoSize1,
      id=>{ buildSet('servoSize1', id); buildStartup(); });
    if(two){
      wizField(form, 'Maestro 2 — body', 'doors, arms, dataport and chargebay',
        wizMaestroSizes('bodyServo'), b.servoSize2,
        id=>{ buildSet('servoSize2', id); buildStartup(); });
    }
  }else{
    const total = (topo.pca || 1) * (topo.links > 1 ? topo.links : 1);
    if(topo.direct){
      /* no controller at all: there is nothing to choose here, so say what the
         arrangement means instead of offering an answer it does not have */
      const n = el('div','hint');
      n.innerHTML = '<b>' + total + ' × PCA9685</b> — ' + (total * 16) + ' channels, straight off the droid\'s own '
        + 'I2C pins (SDA 20, SCL 21) at 0x40 and 0x41. Nothing in between, so nothing to choose — and nowhere to store '
        + 'movements either, which is why only the mod2026 sketch can drive it.';
      form.appendChild(n);
    }else{
      wizField(form, 'Controller', 'the board running MaestroReplacement, between the droid and the expanders',
        servoMcuOptions().map(m=>({id:m.id, label:m.label, suffix:'SDA '+m.sda+' · SCL '+m.scl, note:m.note})),
        b.servoMcu, id=>{ buildSet('servoMcu', id); buildStartup(); });
      const n = el('div','hint');
      n.innerHTML = '<b>' + total + ' × PCA9685</b> — ' + (total * 16) + ' channels. '
        + 'The expanders themselves have nothing to choose: they are all the same 16-channel board, and the second one '
        + 'in a pair just has its address jumper soldered so it answers as 0x41.';
      form.appendChild(n);
      /* the sentence the whole co-processor route rests on, kept where the
         controller is chosen rather than in a section of its own (v1.36.0) */
      const c = el('div','note cy');
      c.innerHTML = '<b>To the Padawan sketch this is a Maestro.</b> The controller holds the sequences itself and answers '
        + '<code>restartScript(n)</code> on the droid\'s UART exactly as a Pololu board does, so nothing in the firmware '
        + 'changes. Flash <b>MaestroReplacement</b> from <code>arduino/MaestroPCA/examples/</code> — <b>PCA_Bridge</b>, '
        + 'over in <code>pca-studio/</code>, is the bench tool you calibrate with, not the one the droid runs on.';
      form.appendChild(c);
    }
  }
  s3.appendChild(form);
  wizBoardPics(s3, b);

  /* --------------------------------------- 4 · the consequence, if any */
  wizServoLinkWarning(host, b);

  /* the physical job moved to its own step after Firmware in v1.37.0 —
     see WIZ_EXTRA._servoSet */
  const go = el('div','conbar');
  const gb = el('button','b','Set them up for real →');
  gb.title = 'the bench procedure: import an existing config, or measure the travel channel by channel';
  gb.addEventListener('click',()=>wizGo(wizStepIndex('_servoSet')));
  go.appendChild(gb);
  host.appendChild(go);
}

/* ------------------------------------------- the boards, as pictures
   The servo question is answered with dropdowns and a flow diagram, not
   the picture cards the other eight questions use — so this is where the
   photo goes: a strip of what you have just described, captioned with what
   each one IS. Mike asked for board pictures on "the selction boxes"
   (2026-08-16) and this question's boxes are the only ones that are not
   cards, which would have left the PCA9685s — the boards this whole route
   is about — as the one answer with no picture anywhere.

   Everything comes from config/board-art.js, so a photo dropped in
   src/art/boards/ lands here as well with nothing to change. */
function wizBoardPics(host, b){
  if(typeof boardArtHtml !== 'function') return null;
  const topo = buildServoTopo(b);
  const want = [];
  if(b.servoDevice === 'maestro'){
    want.push({step:'domeServo', id:b.servoSize1, cap:topo.boards > 1 ? 'Maestro 1 — the dome' : 'the Maestro'});
    if(topo.boards > 1) want.push({step:'bodyServo', id:b.servoSize2, cap:'Maestro 2 — the body'});
  }else{
    const mcu = servoMcuOptions().find(m=>m.id === b.servoMcu);
    want.push({step:'servoMcu', id:b.servoMcu, cap:'the controller' + (mcu ? ' — ' + mcu.label : '')});
    /* v1.54.0 — the count is an answer now, not a property of which card is
       lit, so the strip draws however many the build actually has */
    const per = topo.counted ? b.pcaBoards : (topo.pca || 1);
    const n = per * (topo.links > 1 ? topo.links : 1);
    want.push({step:'servos', id:servoCoprocId(n),
               cap:n + ' × PCA9685 — ' + (n*16) + ' channels'});
  }
  const strip = el('div','bpstrip');
  let any = false;
  want.forEach(w=>{
    if(!w.id) return;
    const art = boardArtHtml(w.step, w.id, w.cap);
    if(!art) return;
    any = true;
    const cell = el('div','bpcell');
    const pic = el('div','optpic'
      + (((typeof boardArtIsPhoto === 'function') && boardArtIsPhoto(w.step, w.id)) ? ' photo' : ''));
    pic.innerHTML = art;
    cell.appendChild(pic);
    cell.appendChild(el('div','bpcap', w.cap));
    strip.appendChild(cell);
  });
  if(!any) return null;
  host.appendChild(strip);
  return strip;
}

/* The consequence of the shape you picked, when there is one. This used to
   be a question of its own ("how do they reach the host?"); the flow picker
   answers it by construction now, so all that is left is the finding —
   which is the part that mattered. */
function wizServoLinkWarning(host, b){
  b = b||buildGet();
  if(!buildTwoMaestroLinks(b) || buildServoLink(b) !== 'chain') return null;
  const s = sect(host, 'One thing to know before you build it', 'chained boards');
  const w = el('div','note');
  w.innerHTML = '<b>Both boards will act on every command.</b> The sketches build the board as '
    + '<code>MiniMaestro maestro(Serial3)</code> — no device number — and with the library\'s default that means the '
    + '<b>compact protocol</b>: a bare command byte with no address in it. So <code>restartScript(2)</code> starts '
    + 'subroutine 2 on Maestro 1 <i>and</i> Maestro 2, and whichever sequence happens to be at index 2 on the other '
    + 'one runs too. Give each board a device number in the Maestro Control Center and pass it to the constructor, '
    + 'or run both ends off one board.';
  s.appendChild(w);
  return s;
}

/* ============================================ SET THEM UP FOR REAL (v1.35.0)
   Mike: "add the option to setup the servos pysically - we should add a link
   to the right firmware for setting up the servos maybe a walk throuh the
   steps too."

   Everything above this point is a description of a droid. This is the part
   where you put a horn on a spline and find out where the panel actually
   stops — and it is a different job with a different tool depending on what
   you just chose, which is exactly why it belongs HERE rather than in a
   general help page:

     · a Maestro is set up in Pololu's own Control Center, over its USB port,
       and the numbers live ON the board;
     · a co-processor is set up from this simulator over Web Serial, with
       PCA_Bridge flashed — and then you flash MaestroReplacement for the
       droid, with the numbers baked into sequences.h;
     · mod2026 has no calibration tool at all, because its endpoints are
       constants in the sketch — you set them here and export the .ino.

   The physical warnings are the same in all three and they are not
   decorative: a horn driven into a hard stop at full travel is a stripped
   gear, and it is the single most common way a first servo dies.
   ===================================================================== */
const SERVO_BENCH_STEPS = {
  maestro: [
    'Power the board from its own 5–6 V supply, not from the Arduino. Servos pull far more current than a USB port can give, and a brownout mid-move looks exactly like a code bug.',
    'Join the grounds. The Arduino, the servo supply and the board all need the same 0 V or nothing will be reliable.',
    'Plug the board into your laptop over USB and open <b>Maestro Control Center</b>. Set the serial mode to <i>UART, fixed baud rate 9600</i> — that is what the sketch expects, and getting it wrong is the classic silent failure.',
    'Connect ONE servo, with the horn taken OFF. Set its channel to Servo and drive it to 1500 µs — that is centre. Now fit the horn at the angle you want as the middle of the travel.',
    'Walk the slider out toward each end a little at a time and stop the moment the panel touches. Those two numbers are your min and max. Never leave a channel able to reach a hard stop.',
    'Name the channel for the part it moves, then repeat for the rest. Save to the board when you are done — the Maestro keeps its own settings.',
    'Back here: export the settings from Control Center and drop the .mstr on this simulator. The channel table, the sequencer and the wiring sheet then all describe your real board.'
  ],
  coproc: [
    'Power the PCA9685s from their own 5–6 V supply. The expander\'s V+ rail is the servo rail — it does not come from the Arduino, and it must not.',
    'Join the grounds: the co-processor, the expanders, the servo supply and the droid\'s Arduino all share 0 V.',
    'Wire the co-processor to the expanders — SDA and SCL, plus 3.3 V or 5 V logic power. If you have two boards, solder the A0 jumper on the second so it answers as 0x41.',
    'Flash <b>PCA_Bridge</b> from <code>pca-studio/PCA_Bridge/</code> for now. That is the bench sketch — it lives with PCA Studio rather than with the library, because it is a tool, not an example. It does nothing but take commands from this simulator over USB.',
    'Connect ONE servo, horn OFF, and press <b>Open the bench</b> below. Connect the board, then use the big dial: drive to centre, fit the horn, then walk out to each end and press Min and Max where the panel stops.',
    'Do the rest of the channels the same way, naming each one. The sweep limit starts conservative on purpose — unlocking the full range is a deliberate second click.',
    'When they are all set, generate <code>sequences.h</code> here and flash <b>MaestroReplacement</b> instead. That is the sketch the droid runs: it answers the Padawan sketch exactly as a Maestro does, with your numbers baked in.'
  ],
  direct: [
    'Power the PCA9685s from their own 5–6 V supply and join every ground — the Arduino, the expanders and the servo supply.',
    'Wire the expanders to the Arduino\'s I2C pins (SDA 20, SCL 21 on a Mega). Solder A0 on the second board so it answers as 0x41.',
    'There is no calibration tool for this arrangement, and that is not an oversight: the mod2026 sketch holds every endpoint as a constant in its own source. So the endpoints are set HERE.',
    'Press <b>Open the bench</b> below and use the dial exactly as you would on real hardware — the simulator models the two PCA9685s, so the numbers you capture are the numbers the sketch needs.',
    'Fit each horn with the servo commanded to centre, then walk out to each end and stop where the panel touches. Never let a channel reach a hard stop.',
    'Export the .ino from the Firmware panel when you are done. Your endpoints go out with it as the sketch\'s own constants.'
  ]
};

/* ==================================================== SERVO SETUP (v1.37.0)
   The step that follows Firmware. Four sections, and the ORDER is the
   whole design — Mike: "The first question on servo setup should be do you
   have an exsisting config to import if yes import the servo setup only …
   if theres no import we then guide the user to use either our tool or the
   maestro app."

   Asking about the import FIRST matters because measuring twenty-six
   channels by hand is an hour of work, and the person most likely to be
   standing here is somebody who already did it — on a previous build, on
   another droid, or in Control Center last Tuesday. Offering the hour-long
   path first and the ten-second one at the bottom would be the wrong way
   round.
   ===================================================================== */
function wizServoSetupStep(host, step){
  const b = buildGet();
  wizModelBanner(host, step);
  const fam = servoFamily(b.domeServo);
  const done = servoCfgConfigured();

  /* ------------------------------------------------ 1 · already got one?

     Mike, v1.39.0: "if we are starting from a setup the settings should be
     imported automatically or at least with a 'should we use the settings
     you just created' question."

     Automatically is what already happens, and that was the problem. The
     bench edits the LIVE channel table — there is no file in between and
     nothing to import — so a builder who had just spent an afternoon
     measuring came back to a step asking whether they had a config, as
     though the last hour had not happened. The fix is not machinery, it is
     candour: when the table already carries travel, say where it came from
     and offer to keep it, with importing something else and measuring again
     as the other two answers rather than the only two. */
  const story = (typeof servoCfgStory === 'function') ? servoCfgStory() : '';
  const s1 = sect(host,
                  done ? 'Use the settings you already have?' : 'Do you already have a servo config?',
                  done ? story : 'nothing measured yet');
  const grid = el('div','optgrid');

  if(done){
    const src  = (typeof servoCfgSrc === 'function') ? servoCfgSrc() : null;
    const kept = !!(src && src.kept);
    const cal  = (typeof HW !== 'undefined' && HW.channels)
      ? HW.channels().filter(c=>c && /^servo/i.test(c.mode) && c.calibrated).length : 0;
    const keep = el('div','optcard'+(kept?' act':''));
    keep.dataset.opt = 'servoCfg:keep';
    keep.tabIndex = 0;
    const kh = el('div','opthead');
    kh.appendChild(el('b',null, src && src.how === 'bench'
      ? 'Yes — use the ones you just measured'
      : 'Yes — use the ones already here'));
    keep.appendChild(kh);
    const knote = el('div','optnote');
    knote.innerHTML = '<b>They are already in this build</b> — the bench and the import both write the same channel '
      + 'table, so there is nothing to load. ' + (story ? story.charAt(0).toUpperCase()+story.slice(1)+'. ' : '')
      + (cal ? cal + ' of them you captured on the dial yourself. ' : '')
      + 'Keep them and carry on; the two answers beside this one replace them.';
    keep.appendChild(knote);
    const kb = el('div','conbar');
    const kbtn = el('button','b prim', kept ? '✓ Keeping these' : 'Keep these settings');
    kbtn.id = 'btnServoKeep';
    const useThem = ()=>{
      const bb = buildGet();
      if(!bb.servoCfg) bb.servoCfg = {how:'', name:'', n:0, when:''};
      bb.servoCfg.kept = true;
      if(typeof prefsSave === 'function') prefsSave();
      lg('sys','servo setup: keeping the '+servoCfgConfigured()+' channels already configured');
      toast('Keeping the servo settings already in this build');
      buildStartup();
    };
    kbtn.addEventListener('click', e=>{ e.stopPropagation(); useThem(); });
    keep.addEventListener('click', useThem);
    keep.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); useThem(); } });
    kb.appendChild(kbtn);
    keep.appendChild(kb);
    grid.appendChild(keep);
  }

  /* WHAT TO OFFER DEPENDS ON WHAT THEY HAVE (v1.38.0). Mike: "if they are
     using PCA's we should not offer meastro and in they are using maestro we
     should not offer PCA import - adjust wording based on there config."
     A Maestro builder has never seen this app's export; a PCA builder has
     never opened Control Center. Naming both is two thirds noise and one
     third "which of these am I?".

     The READER stays permissive on purpose — it is the same six fields
     either way, and somebody bringing a .mstr to a PCA build is doing
     something sensible, not something wrong. What narrows is the OFFER. */
  /* v1.45.0 — Mike: "Clarify whether native Maestro files as well as JSON
     are supported." The narrowing above stays (it is what he asked for), but
     the PCA branch now has TWO files of its own to name — the bench's servo
     config .json and a MaestroPCA servos.h / sequences.h, which the reader
     learned to read in v1.45.0 — and the gap between what is OFFERED and
     what is READ is stated out loud underneath rather than left for somebody
     to discover with a greyed-out file. The one canonical sentence lives in
     maestro/ui-files.js (IO_FORMATS_SENTENCE). */
  const cfgSrc = (fam === 'maestro')
    ? {file:'A Pololu <b>.mstr</b> or <b>.xml</b>', where:'the settings file Maestro Control Center saves',
       accept:'.mstr,.xml,text/xml', pick:'Choose a .mstr…'}
    : {file:'A <b>servo config .json</b> or a PCA9685 <b>servos.h</b>', where:'the file the bench exports at the end of this page, or the header you compiled from it',
       accept:'.json,.h,application/json', pick:'Choose a config…'};

  const imp = el('div','optcard');
  imp.dataset.opt = 'servoCfg:import';
  imp.tabIndex = 0;
  const ih = el('div','opthead');
  ih.appendChild(el('b',null, done ? 'Import a different one instead' : 'Yes — import it'));
  imp.appendChild(ih);
  const inote = el('div','optnote');
  inote.innerHTML = cfgSrc.file + ' — ' + cfgSrc.where + '. '
    + 'It brings in the travel ONLY — the names, min, centre, max, speed and acceleration — and leaves '
    + 'your board, your sequences and which panel each channel drives exactly as they are.';
  imp.appendChild(inote);
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = cfgSrc.accept;
  fi.style.display = 'none';
  fi.id = 'servoCfgFile';
  fi.addEventListener('change', async ()=>{
    const f = fi.files && fi.files[0];
    if(!f) return;
    try{
      const r = servoCfgImportText(await f.text(), f.name);
      const from = r.from === 'mstr' ? 'a Maestro settings file'
                 : r.from === 'pca'  ? 'a PCA9685 servos.h / sequences.h'
                 : r.from === 'cfg'  ? 'a servo config' : 'a whole-setup file';
      lg('sys','servo config imported from '+from+' — '+r.n+' channels'
        + (r.skipped ? ', '+r.skipped+' past the end of this board' : ''));
      /* v1.45.0 — crossing between the two board families drops fields, and
         they are named to the user rather than counted. */
      const lost = (r.dropped && r.dropped.length)
        ? ' · not carried across: ' + r.dropped.map(d=>d.field).join(', ') : '';
      toast('Imported '+r.n+' channels'+(r.skipped ? ' — '+r.skipped+' did not fit this board' : '')+lost,
        lost ? 'warn' : '');
      buildStartup();
    }catch(e){
      /* there is no appAlert in this app — appConfirm with one way out is
         the dialog it does have, and the message is the whole point */
      appConfirm(e.message, {title:'That file did not import', yes:'OK', no:''});
      lg('warn','servo config import failed — '+e.message);
    }
    fi.value = '';
  });
  imp.appendChild(fi);
  const ib = el('div','conbar');
  const ibtn = el('button','b prim', cfgSrc.pick);
  ibtn.addEventListener('click', e=>{ e.stopPropagation(); fi.click(); });
  ib.appendChild(ibtn);
  imp.appendChild(ib);
  /* v1.45.0 — the offer narrows by board family, the reader does not. Say so. */
  if(typeof SERVO_CFG_ACCEPT_NOTE === 'string'){
    const igap = el('div','optnote');
    igap.textContent = SERVO_CFG_ACCEPT_NOTE;
    imp.appendChild(igap);
  }
  imp.addEventListener('click',()=>fi.click());
  grid.appendChild(imp);

  /* ------------------------------------------------------ EDIT, not REDO

     Mike, 2026-08-16: "going back into Servo setup doesnt give me the
     option to adjust what I have already set, only 'No Measure them now'
     which does have my settings but not very user freindly — add an edit
     exsisting config".

     He was right on both counts. The card DID carry his settings — the
     bench edits the live table, so there was never anything to lose — but
     it was worded as though it did not: "Measure them again" is what you
     say to somebody who is starting over, and it was the only way back in
     to change one endpoint. And it opened the bench on step 1 (Controller),
     four clicks from the channel table, which is the only part anybody
     comes back for.

     So when there is a config, this is an EDIT: the words say so, and it
     opens the bench straight on Channels, which is where the table, the
     dial and the per-channel drive all live. Starting over is still here,
     as the small link underneath, because it is the rare answer. */
  const fresh = el('div','optcard');
  fresh.dataset.opt = 'servoCfg:fresh';
  fresh.tabIndex = 0;
  const fh = el('div','opthead');
  fh.appendChild(el('b',null, done ? 'Edit the servo config you have' : 'No — measure them now'));
  fresh.appendChild(fh);
  const fnote = el('div','optnote');
  fnote.innerHTML = fam === 'maestro'
    ? (done
        ? 'Open the channel table <b>with your settings in it</b> — rename a channel, retype an endpoint, or press '
          + '<b>configure…</b> on one row to put it back on the dial. Nothing is cleared, and nothing here touches '
          + 'the .mstr on your Maestro until you export one.'
        : 'Work down the channels in <b>Maestro Control Center</b> with a servo in front of you, finding where each panel '
          + 'actually stops, then bring the .mstr back here. It is the slow part of a build and there is no way round it '
          + 'the first time — but you only do it once.')
    : (done
        ? 'Opens the channel table <b>exactly as you left it</b> — every name, endpoint, speed and panel mapping still '
          + 'there. Change one row or twenty: rename it, retype a pulse width, or press <b>configure…</b> to put that '
          + 'channel back on the dial with the servo moving in front of you. It is a continuation, not a fresh start.'
        : 'Opens the <b>servo setup tool</b>, already carrying everything you answered above — your controller, your '
          + 'expanders and your channel count. Work down the channels with a servo in front of you, finding where each '
          + 'panel actually stops. It is the slow part of a build and there is no way round it the first time — but you '
          + 'only do it once, and it exports what you measured at the end.');
  fresh.appendChild(fnote);
  if(fam !== 'maestro'){
    const fb = el('div','conbar');
    const fbtn = el('button','b prim', done ? 'Edit the channel table' : 'Open the servo setup tool');
    fbtn.id = 'btnServoMeasure';
    /* the wizard is a full-page overlay and so is the bench — leave this one
       first, and tell the bench to come back here when it is done. Straight
       to Channels (step 5) when there is a table to edit; the four hardware
       questions before it were answered the first time round. */
    const go = ()=>{ closeStartup(); if(typeof setupOpen === 'function') setupOpen(done ? 4 : 0, {from:'wizard'}); };
    fbtn.addEventListener('click', e=>{ e.stopPropagation(); go(); });
    fresh.addEventListener('click', go);
    fresh.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    fb.appendChild(fbtn);
    if(done){
      /* the rare answer, and a destructive one — so it is a link, it names
         what it costs, and it asks */
      const over = el('button','b','Start the hardware questions again');
      over.id = 'btnServoRestart';
      over.title = 'back to step 1 of the bench — the controller, the expanders and the wiring. Your channel table is not cleared.';
      over.addEventListener('click', e=>{
        e.stopPropagation();
        closeStartup();
        if(typeof setupOpen === 'function') setupOpen(0, {from:'wizard'});
      });
      fb.appendChild(over);
    }
    fresh.appendChild(fb);
  }
  grid.appendChild(fresh);
  s1.appendChild(grid);

  if(done){
    const n = el('div','note cy');
    n.innerHTML = '<b>Importing replaces what is here, channel for channel</b> — travel only, and nothing else in '
      + 'your build is touched. <b>Editing</b> opens the same bench on the same table, on the channel step: it is a '
      + 'continuation, not a fresh start, so a half-done afternoon is safe to walk back into.';
    s1.appendChild(n);
  }

  /* ------------------------------------------------- 2 · which tool, and where */
  wizServoToolSect(host, b, fam);

  /* -------------------------------------------------------- 3 · the steps */
  wizServoBenchSect(host, b);

  /* ------------------------------------------------------- 4 · keep it */
  const s4 = sect(host, 'When you are done', 'so you never do it twice');
  const bar = el('div','conbar');
  const ex = el('button','b prim','Export the servo config');
  ex.id = 'btnServoCfgExport';
  ex.title = 'the channel travel on its own — a small file you can bring back into any build';
  ex.addEventListener('click',()=>servoCfgExport());
  bar.appendChild(ex);
  s4.appendChild(bar);
  const h4 = el('div','hint');
  h4.innerHTML = 'Travel only, in a file of its own — the same file the bench writes from <b>save servo config</b> on its '
    + 'Finish step, so there is one thing to keep and one thing to import. A servo config is the part of a build that '
    + 'outlives everything else about it: the panels do not move because you changed sketch. '
    + 'The filename carries the date and the time, so two exports in one afternoon are told apart by name.';
  s4.appendChild(h4);
  /* v1.45.0 — Mike: "Clarify whether native Maestro files as well as JSON are
     supported." This is the other place a builder decides what to keep, so
     the one canonical sentence belongs here too rather than a fourth
     paraphrase of it. Defined in maestro/ui-files.js. */
  if(typeof IO_FORMATS_SENTENCE === 'string'){
    const h5 = el('div','hint');
    h5.innerHTML = '<b>' + xmlEsc(IO_FORMATS_SENTENCE) + '</b>';
    s4.appendChild(h5);
  }
}

/* Which tool does the job, and the links to get it. "Holding links" — Mike
   asked for the firmwares needed to set the servos up to be listed here,
   and two of the three ship with this project rather than living at a URL,
   so they are shown as paths. Only what YOUR device needs is listed. */
const SERVO_TOOL_LINKS = {
  maestro: [
    {label:'Maestro Control Center', url:'https://www.pololu.com/docs/0J40',
     note:'Pololu\'s own software. This is where a Maestro is set up, and the .mstr it writes is what you import above.'}
  ],
  coproc: [
    {label:'PCA_Bridge', path:'pca-studio/PCA_Bridge/PCA_Bridge.ino',
     note:'The BENCH sketch. Flash this while you are measuring — it does nothing but take commands from this simulator over USB.'},
    {label:'MaestroReplacement', path:'arduino/MaestroPCA/examples/MaestroReplacement/',
     note:'The DROID sketch. Flash this when you are done, with your measured travel baked into sequences.h.'}
  ],
  direct: [
    {label:'Your droid sketch', path:'the .ino you chose on the Firmware step',
     note:'There is no separate servo tool for this arrangement — the endpoints are constants inside the sketch itself, so the bench below writes them and the Firmware panel exports the .ino.'}
  ]
};
function wizServoToolSect(host, b, fam){
  const links = SERVO_TOOL_LINKS[fam] || [];
  const s = sect(host, 'What you set them up with',
                 fam === 'maestro' ? 'Pololu Control Center' : 'the bench, here');
  const lead = el('div','hint');
  lead.innerHTML = fam === 'maestro'
    ? 'A Maestro is configured over its own USB port, in Pololu\'s software, and the numbers live on the board. '
      + 'This simulator does not drive one directly — it reads and writes the .mstr files Control Center saves.'
    : 'Everything happens here: the bench connects to your board over USB and drives one channel at a time '
      + 'while you watch the actual panel.';
  s.appendChild(lead);

  links.forEach(l=>{
    const r = el('div','lnkrow');
    r.appendChild(el('div','lnkname', l.label));
    if(l.url){
      const a = document.createElement('a');
      a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'lnk';
      a.textContent = l.url.replace(/^https?:\/\//,'');
      r.appendChild(a);
    }else{
      r.appendChild(el('code','lnk', l.path));
    }
    r.appendChild(el('div','lnkfile', l.note));
    s.appendChild(r);
  });
  return s;
}

function wizServoBenchSect(host, b){
  b = b||buildGet();
  const fam = servoFamily(b.domeServo);
  const other = servoFamily(b.bodyServo);
  const s = sect(host, 'Set the servos up for real', 'the physical job');

  const lead = el('div','note cy');
  lead.innerHTML = '<b>Everything above describes the droid. This is the part where you find out where the panels actually stop.</b> '
    + 'The steps below are for <b>' + servoFamilyDef(fam).label.replace(/^A /,'') + '</b>'
    + (fam !== other ? ' — your other end is ' + servoFamilyDef(other).label.replace(/^A /,'') + ', so run its list too' : '')
    + '. Nothing here changes your answers; it is the bench procedure, in order.';
  s.appendChild(lead);

  const list = el('ol','svsteps');
  (SERVO_BENCH_STEPS[fam] || []).forEach(t=>{
    const li = document.createElement('li');
    li.innerHTML = t;
    list.appendChild(li);
  });
  s.appendChild(list);

  /* the right tool, named and linked, for the family you actually chose */
  const bar = el('div','conbar');
  if(fam === 'maestro'){
    const a = document.createElement('a');
    a.href = 'https://www.pololu.com/docs/0J40'; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'b prim'; a.textContent = 'Maestro Control Center →';
    a.title = 'Pololu\'s own software — the tool that sets a Maestro up. The .mstr files it writes are the ones this simulator reads.';
    bar.appendChild(a);
  }else{
    const ob = el('button','b prim','Open the bench');
    ob.id = 'btnServoBench';
    ob.title = 'the channel table and the calibration dial — the same screen whether you are driving the simulator or a real board over USB';
    ob.addEventListener('click',()=>{
      /* the wizard is a full-page overlay and the bench is another one —
         two at once is a trap, so leave this one first. `from` is how the
         bench knows to bring you back here (v1.38.0). */
      closeStartup();
      if(typeof setupOpen === 'function') setupOpen(0, {from:'wizard'});
    });
    bar.appendChild(ob);
  }
  s.appendChild(bar);
  if(fam === 'coproc'){
    /* No link: the two sketches ship with this project rather than living at
       a URL, and inventing one would be worse than naming the folder. */
    const w = el('div','hint');
    w.innerHTML = 'Both sketches ship with this project, in two different places: <b>PCA_Bridge</b> is in '
      + '<code>pca-studio/PCA_Bridge/</code> (it is a tool, and it belongs with the tool), and '
      + '<b>MaestroReplacement</b> is in <code>arduino/MaestroPCA/examples/</code> (it is what the library is FOR).';
    s.appendChild(w);
  }

  const warn = el('div','note');
  warn.innerHTML = '<b>Three things that break servos, every time.</b> '
    + 'Fit the horn with the servo already commanded to centre, never by forcing it round. '
    + 'Find each endpoint by creeping up on it, and stop at the touch — a horn held against a hard stop strips its gears in seconds and does it quietly. '
    + 'And give the servos their own supply with a common ground: a droid that "randomly resets" is almost always a servo browning out its own Arduino.';
  s.appendChild(warn);
  return s;
}

/* ------------------------------------------------------------- wiring */
function wizWiringStep(host){
  const b = buildGet();
  const s = sect(host, 'Control signals', buildLabel('arduino', b.arduino));
  /* v1.45.0 — Mike: "Mark wiring images as Beta." The badge is drawn INTO the
     SVG (app/wiring.js, wiringBetaSvg) so it travels with the picture into the
     exported sheet; this line is the same sentence in prose, above the diagram,
     where it is read before the wire is cut rather than after. */
  const beta = el('div','note beta');
  beta.innerHTML = '<span class="betachip">beta</span> <b>These diagrams are beta.</b> '
    + 'They are drawn from the sketch you chose and the answers you gave in this setup, so '
    + WIRING_BETA_WHY + ' The channel tables on the wiring sheet are the part you can trust to the pin.';
  s.appendChild(beta);
  const wrap = el('div','wdwrap');
  wrap.innerHTML = (typeof systemDiagramSvg === 'function') ? systemDiagramSvg() : '';
  s.appendChild(wrap);

  const bar = el('div','conbar');
  const bH = el('button','b prim','Full wiring sheet');
  bH.title = 'the printable bench document: this diagram, plus every channel paired with its CAD part';
  bH.addEventListener('click',()=>{ const f = downloadWiring('html'); const m=$('wizMsg'); if(m) m.textContent='Saved '+f+'.'; });
  const bC = el('button','b','…as CSV');
  bC.addEventListener('click',()=>{ const f = downloadWiring('csv'); const m=$('wizMsg'); if(m) m.textContent='Saved '+f+'.'; });
  bar.appendChild(bH); bar.appendChild(bC);
  s.appendChild(bar);
  const msg = el('div','hint'); msg.id='wizMsg'; s.appendChild(msg);

  /* THE "BOARDS" SECTION IS GONE (v1.45.0). Mike: "Remove the non-functional
     Wiring 'Boards' section." It drew a card per board with clickable pins —
     and for the DEFAULT build it could not do the thing it promised: the
     labelled photos and pin maps (app/board-img.js) only ever covered the four
     Pololu Maestros, so a mod2026 or PCA9685 build got a bare numeric grid;
     the pin buttons deliberately did not open the picker for mod2026 (its map
     is compile-time constants); and every explanation it wanted to give was
     written to $('cadMsg'), which does not exist while this overlay is up — so
     those clicks were silent no-ops on the one build most people have.

     Do not put it back as it was. Which channel drives which part is asked and
     answered on the PANELS step (config/tab.js, buildAssignSect) and printed
     in full on the wiring sheet, both of which work for every build. */

  const h = el('div','note');
  h.innerHTML = '<b>No V+ lines are drawn, on purpose.</b> Servo and motor power is the most build-specific part of an astromech and the most dangerous to get from a diagram — '
    + 'fuse and distribute it to your own plan. What is drawn is every signal and its common ground, which is what actually has to match the sketch.';
  host.appendChild(h);
}

/* -------------------------------------------------------------- scene */
function wizSceneStep(host){
  const s = sect(host, 'Backdrop', envLabel(envGet()));
  const grid = el('div','optgrid');
  ENV_ORDER.forEach(id=>{
    const def = ENVS[id];
    const c = el('div','optcard'+(envGet()===id?' act':''));
    c.dataset.opt = 'env:'+id;
    const head = el('div','opthead');
    head.appendChild(el('b',null,def.label));
    if(envGet()===id) head.appendChild(el('span','optbadge ok','selected'));
    c.appendChild(head);
    c.appendChild(el('div','optnote',def.hint));
    c.addEventListener('click',()=>{ envSet(id); buildStartup(); });
    grid.appendChild(c);
  });
  s.appendChild(grid);

  /* Mike: the practice circuit and the lessons belong in the app, not in
     setup — they are things you DO, not things you configure. Both are one
     click away on the stage. */
  const h = el('div','hint');
  h.innerHTML = 'Switch backdrops any time from the stage button, bottom right. '
    + 'The <b>Track</b> and <b>Learn</b> buttons next to it are where you drive the practice circuit and work through the lessons — '
    + 'they live in the app, not in here.';
  s.appendChild(h);
}

/* ------------------------------------------------------------- review */
function wizReviewStep(host){
  const s = sect(host, 'Your build');
  const t = el('div','bsum');
  const model = (typeof modelGet === 'function') ? modelGet() : 'droid';

  /* the model first, matching the order the questions were asked in */
  const mrow = el('div','bsumrow');
  mrow.appendChild(el('div','bsk','Model'));
  mrow.appendChild(el('div','bsv', modelById(model).label));
  const med = el('button','b','change');
  med.addEventListener('click',()=>wizGo(0));
  mrow.appendChild(med);
  t.appendChild(mrow);

  buildSummaryRows().forEach(r=>{
    const na = (typeof stepUsedByModel === 'function') && !stepUsedByModel(r.key, model);
    const row = el('div','bsumrow' + (na ? ' na' : ''));
    row.appendChild(el('div','bsk', r.title));
    const v = el('div','bsv', r.label);
    if(r.sim === 'park')     v.appendChild(el('span','optbadge park','not simulated'));
    else if(r.sim === 'sub') v.appendChild(el('span','optbadge sub','stands in'));
    if(na) v.appendChild(el('span','optbadge park','not used by this model'));
    row.appendChild(v);
    const ed = el('button','b','change');
    ed.addEventListener('click',()=>wizGo(wizStepIndex(r.key)));
    row.appendChild(ed);
    t.appendChild(row);
  });
  s.appendChild(t);

  /* RC gets one line of its own here, because "RC transmitter" as an answer
     does not say whether it has actually been calibrated — and an
     uncalibrated transmitter is a droid that will not move */
  if(buildGet().controller === 'rc' && typeof rcSummary === 'function'){
    const n = el('div', rcCalMovedCount() ? 'hint' : 'note');
    n.innerHTML = '<b>Transmitter:</b> ' + rcSummary()
      + (rcCalMovedCount() ? '.' : ' — go back to <b>Controller</b> and calibrate it, or nothing will move.');
    s.appendChild(n);
  }

  const con = buildConflicts();
  const live = con.filter(c=>c.kind !== 'park');
  const park = con.filter(c=>c.kind === 'park');
  if(live.length){
    const n = el('div','note');
    n.innerHTML = '<b>These do not line up</b><br>' + live.map(c=>'· '+c.text).join('<br>');
    host.appendChild(n);
  }
  if(park.length){
    const n = el('div','hint');
    n.innerHTML = 'Recorded on the wiring sheet but not simulated: ' + park.map(c=>c.text).join('; ') + '.';
    host.appendChild(n);
  }
  if(!con.length){
    const n = el('div','note cy');
    n.innerHTML = '<b>Everything lines up.</b> The running sketch, the foot mode and the servo boards all match what you told me is in the '+wizMineNoun(model)+'.';
    host.appendChild(n);
  }

  const sIO = sect(host, 'Your setup', 'save it, move it, share it');
  if(typeof setupButtons === 'function'){
    setupButtons(sIO, null);
    const hIO = el('div','hint');
    hIO.innerHTML = 'One .json carries the whole configuration — including these answers. Loading one applies it immediately.';
    sIO.appendChild(hIO);
  }

  /* the big obvious way out — worded for whatever got built (1.2a) */
  const fin = el('div','finwrap');
  const fb = el('button','finbtn','Finish — take me to my '+wizMineNoun(model));
  fb.addEventListener('click',wizFinishAsked);
  fin.appendChild(fb);
  const fh = el('div','hint');
  fh.innerHTML = 'Reopen all of this from <b>Setup</b> in the header whenever you want.';
  fin.appendChild(fh);
  host.appendChild(fin);
}

/* =====================================================================
   PANELS STEP — the dome map, as a second door onto the same assignment

   Mike, having found the servo config import: "we also had a top-down
   Dome image to match servos with dome panels — where has that gone,
   and should it be an option for setting up servos?" It never left —
   maestro/dome-map.js draws it — but the only door onto it was the
   .mstr IMPORT wizard's Map step (maestro/wizard-import.js). This is
   the second door, from the Panels step, bound to the LIVE channel
   table (MSTR.channels) instead of an import's temporary one.

   buildDomeMap() itself never writes a channel — the import wizard's
   Map step and this both hand it opts.channels to read and an
   opts.onPick(key) to call back. The import wizard writes its temporary
   MSTR.channels[i].act directly, because there is nothing else on the
   table yet to protect. THIS door writes the table other parts of the
   app already depend on, so the assignment goes through HW.setPart —
   the same clear-then-set the Bench and the pin-first rows above use —
   so "one channel, one part" holds here too (hw-host.js).

   A full-page tool, so — like the servo-hardware bench — it must not
   just vanish through the wizard underneath it. But this one is not a
   trip away from the wizard the way the bench is: you are already
   standing on the step that asks the question. So it does NOT go
   through closeStartup()/setupOpen(0,{from:'wizard'}); it opens ABOVE
   #startup (z-index 120 — .dmoverlay in 08-import.css is 130) and
   closing it removes the overlay and re-renders the step underneath,
   the same "redraw" buildAssignSect's own rows already call. */
const DMAP = { open:false, sel:-1, hover:'', play:-1, timer:null };

/* ================================================== DRIVE IT FROM HERE
   Mike, 2026-08-16: "on the dome map add the abilty to drive real servos
   and a play button next to each Servo Channel".

   The map is where you answer "which panel is P11?" — and the only honest
   way to answer it is to make P11 move. Until now that meant closing the
   map, opening the bench, finding the row and dragging its slider, by
   which time you have lost your place on the dome.

   ▶ drives the channel through its own travel: one end, the other end,
   then back to its resting position, at the channel's own speed and
   acceleration and clamped to ITS endpoints — because it goes through
   HW.drive(), which is the engine, the model and (when a board is
   connected) the wire, in that order (hw-host.js). So the same button is
   "show me which panel this is" on the model and "wake that servo up" on
   the bench, with no mode to switch between: whether a real servo moves is
   decided by whether the cable is plugged in, and the bar at the top of
   the map says which of those you are looking at. */
function dmapPlayStop(){
  if(DMAP.timer){ clearTimeout(DMAP.timer); DMAP.timer = null; }
  DMAP.play = -1;
}
function dmapPlay(i){
  const c = MSTR.channels[i];
  if(!c || !/^servo/i.test(c.mode||'')) return;
  /* pressing ▶ on the channel already playing is a stop — it leaves the
     servo where it is rather than yanking it home, which is what you want
     when a linkage is binding and you reached for the button in a hurry */
  if(DMAP.play === i){ dmapPlayStop(); dmapRender(); return; }
  dmapPlayStop();
  const lo = Math.min(c.min, c.max), hi = Math.max(c.min, c.max);
  if(lo === hi){ lg('warn','channel '+i+' has no travel to play — set its ends first'); return; }
  const steps = [lo, hi, c.home || ((lo + hi) >> 1)];
  let at = 0;
  DMAP.play = i;
  const tick = ()=>{
    if(DMAP.play !== i || at >= steps.length){
      if(DMAP.play === i){ DMAP.play = -1; DMAP.timer = null; if(DMAP.open) dmapRender(); }
      return;
    }
    if(typeof HW !== 'undefined' && HW.drive) HW.drive(i, steps[at]);
    at++;
    DMAP.timer = setTimeout(tick, 1100);
  };
  tick();
  dmapRender();
}

/* first unmapped servo channel from `from` — same walk impwizNextUnmapped
   does in the import wizard, over the live table instead of an import's */
function dmapNextUnmapped(from){
  const ch = MSTR.channels;
  for(let k=1;k<=ch.length;k++){
    const c = ch[(Math.max(0,from)+k) % ch.length];
    if(/^servo/i.test(c.mode) && !c.act) return c.i;
  }
  return -1;
}
function dmapSelect(i){ DMAP.sel = i; dmapRender(); }

/* Esc closes the overlay, not the wizard underneath it — the wizard's own
   document-capture Escape handler below yields to $('dmapWrap') the same
   way it already yields to .dlgwrap and $('stagePick'). escGuard
   (core/dialog.js): the confirm dialog above still wins. */
const dmapEsc = escGuard(()=> !document.querySelector('.dlgwrap'), dmapClose);
function dmapOpen(){
  DMAP.open = true;
  DMAP.sel = dmapNextUnmapped(-1);
  DMAP.hover = '';
  dmapEsc.bind();
  dmapRender();
}
function dmapClose(){
  DMAP.open = false;
  dmapPlayStop();
  dmapEsc.unbind();
  const h = $('dmapWrap');
  if(h) h.remove();
  buildStartup();   // back to the Panels step — assignments show immediately
}

/* The board's own row, at the top of the map. Deliberately NOT the bench's
   full link bar (the monitor, the frequency box, the mode chip): standing
   on the dome map you need two things — is there a board, and can I have
   one. Everything else is a trip to the bench.

   It repaints through serialUiRegister like every other link surface, with
   a NAMED function so the registry's dedupe-by-identity works — an
   anonymous closure here would register a fresh copy on every render and
   the list would only ever grow (the v1.39.5 lesson, hw-ui.js). */
function dmapLinkSync(){ if(DMAP.open && $('dmapWrap')) dmapRender(); }
function dmapLinkBar(){
  const on = (typeof SER !== 'undefined') && !!SER.port;
  const bar = el('div','conbar dmaplink');
  const b = el('button','b'+(on?'':' prim'), on ? '⚡ Disconnect' : '⚡ Connect hardware');
  b.id = 'dmapConnect';
  b.title = on
    ? 'close the port — the servos hold their last position'
    : 'open a USB serial port to a board running PCA_Bridge, so ▶ moves the real servo';
  b.addEventListener('click', async ()=>{
    if(typeof SER === 'undefined' || typeof serialConnect !== 'function') return;
    if(SER.port) await serialDisconnect(); else await serialConnect();
    dmapLinkSync();
  });
  bar.appendChild(b);
  const chip = el('span','chip'+(on?' on':''), on ? (SER.blocked ? 'monitor only' : 'hardware') : 'sim only');
  bar.appendChild(chip);
  bar.appendChild(el('span','iwdim', on
    ? 'Press ▶ on a channel and the real servo moves — through the engine, so its speed, acceleration and your endpoints all apply.'
    : 'Press ▶ on a channel to move it on the model. Connect a board and the same button moves the actual servo.'));
  if(typeof serialUiRegister === 'function') serialUiRegister(dmapLinkSync);
  return bar;
}

function dmapRender(){
  if(!DMAP.open) return;
  let host = $('dmapWrap');
  if(!host){
    host = el('div','iwrap dmoverlay'); host.id = 'dmapWrap';
    document.body.appendChild(host);
  }
  host.innerHTML = '';

  const card = el('div','iwcard');
  const head = el('div','iwhead');
  head.appendChild(el('h2', null, 'Dome map'));
  head.appendChild(el('div','iwsub','the live channel table — click a channel, then click where it is'));
  const x = el('button','iwx','×'); x.title='close'; x.addEventListener('click',dmapClose);
  head.appendChild(x);
  card.appendChild(head);

  const body = el('div','iwbody');
  body.appendChild(dmapLinkBar());
  const split = el('div','iwsplit');

  /* ---- the diagram ---- */
  const left = el('div','iwdome');
  const sel = DMAP.sel>=0 ? MSTR.channels[DMAP.sel] : null;
  const cue = el('div','iwcue');
  cue.innerHTML = sel
    ? 'Placing <b>ch '+sel.i+' · '+xmlEsc(sel.name||'')+'</b> — click its panel'
    : 'Every servo channel is placed. Click a channel below to move it.';
  left.appendChild(cue);
  buildDomeMap(left, {
    channels: MSTR.channels,
    selected: DMAP.sel,
    hoverKey: DMAP.hover,
    onPick: (key)=>{
      if(DMAP.sel < 0) return;
      /* route through HW.setPart so the one-part-one-channel clear-then-set
         rule holds — same seam the pin-first Panels rows and the Bench use */
      if(typeof HW !== 'undefined' && typeof HW.setPart === 'function') HW.setPart(DMAP.sel, key);
      else MSTR.channels[DMAP.sel].act = key;   // no HW seam (e.g. a bare test page) — fall back
      DMAP.sel = dmapNextUnmapped(DMAP.sel);
      dmapRender();
    }
  });
  const key = el('div','iwkey');
  key.innerHTML = '<span class="k has"></span>mapped <span class="k dup"></span>two channels'+
                  ' <span class="k lit"></span>lighting on the reference <span class="k"></span>free';
  left.appendChild(key);
  split.appendChild(left);

  /* ---- the channel list ---- */
  const right = el('div','iwchans');
  const servos = MSTR.channels.filter(c=>/^servo/i.test(c.mode));
  const mapped = servos.filter(c=>c.act).length;
  const tally = el('div','iwtally');
  tally.innerHTML = '<b>'+mapped+'</b> of '+servos.length+' servo channel(s) placed.';
  right.appendChild(tally);

  const tbl = el('div','iwmap');
  servos.forEach(c=>{
    const r = el('div','iwmaprow'+(c.act?'':' un')+(c.i===DMAP.sel?' sel':''));
    r.addEventListener('mouseenter',()=>{
      if(DMAP.hover===c.act) return;
      DMAP.hover = c.act; dmapRender();
    });
    r.appendChild(el('span','ix', c.i));
    const nm = el('span','nm', c.name || '(unnamed)');
    nm.title = 'click to place this channel on the dome';
    nm.addEventListener('click',()=>dmapSelect(c.i));
    r.appendChild(nm);
    const st = el('span','iwdim', c.act
      ? (domeMapCovers(c.act) ? (typeof actPartLabel==='function' ? actPartLabel(c.act)||c.act : c.act)
                               : 'not a dome part')
      : 'not mapped');
    r.appendChild(st);
    /* ▶ — move this one, so you can see which it is (v1.43.0) */
    const play = el('button','b mini iwplay', DMAP.play === c.i ? '■' : '▶');
    play.dataset.play = String(c.i);
    play.title = DMAP.play === c.i
      ? 'stop — the servo holds wherever it has got to'
      : 'move this channel through its travel: one end, the other, then back to rest'
        + ((typeof SER !== 'undefined' && SER.port) ? '. A board is connected, so the real servo moves.'
                                                    : '. Nothing is connected, so only the model moves.');
    play.addEventListener('click', ev=>{ ev.stopPropagation(); dmapPlay(c.i); });
    r.appendChild(play);
    tbl.appendChild(r);
  });
  right.appendChild(tbl);
  split.appendChild(right);
  body.appendChild(split);
  card.appendChild(body);
  host.appendChild(card);
}

/* the button by the pie/side-panel section area — tab.js owns the group
   sections themselves (buildAssignSect), so this is drawn just above them,
   from the wizard side of the seam */
function wizDomeMapDoor(host){
  const s = sect(host, 'Prefer to see it on the dome?');
  const p = el('div','hint');
  p.textContent = 'The pie and side panel rows below take a channel by number. This opens the same top-down dome the .mstr import wizard uses — click a channel, then click its panel on the dome.';
  s.appendChild(p);
  const bar = el('div','conbar');
  const b = el('button','b','🗺 Dome map…');
  b.title = 'open the top-down dome map for the pie and side panels';
  b.addEventListener('click', dmapOpen);
  bar.appendChild(b);
  s.appendChild(bar);
}

/* ============================================================ RENDER */
function buildStartup(){
  const host = $('startupBody');
  if(!host) return;
  host.innerHTML = '';
  const steps = wizSteps();
  const step = steps[WIZ.i] || steps[0];
  const model = (typeof modelGet === 'function') ? modelGet() : 'droid';

  /* visited tracking (1.5b) — must run before anything below touches
     buildGet(), or the grandfather check (PREFS.build present, no
     wizVisited map yet) would already be moot: buildGet() CREATES
     PREFS.build the first time it is called, and the rail block a few
     lines down is exactly that first call on a genuine first run. */
  wizVisitedInit();
  /* the step actually on screen has, by definition, just been seen — and
     any answer changed on it fires this same redraw immediately
     afterward, so "seen" and "just changed" both land here */
  if(step.key === '_model' || step.key.charAt(0) !== '_') wizMarkVisited(step.key);

  /* head: light/dark lives up here so it is reachable from every step —
     Mike found it buried on the last one */
  const th = $('stpTheme');
  if(th){
    th.innerHTML = '';
    [['Dark','dark'],['Light','light']].forEach(([lab,mode])=>{
      const b = el('button','hbtn'+(PREFS.theme===mode?' act':''), lab);
      b.addEventListener('click',()=>{ applyTheme(mode); buildStartup(); });
      th.appendChild(b);
    });
  }

  /* head — the Finish step's own question and the Panels step's "press ▶"
     line both name the droid literally; both are model-aware now (1.2a,
     part of 1.3's copy fix) rather than lying when something else is on
     the stage */
  const t = $('stpTitle'), sub = $('stpSub');
  if(t) t.textContent = buildConfigured() ? step.title : 'Set your droid up — '+step.title;
  if(sub){
    const q = (step.key === '_done') ? 'That is your '+wizMineNoun(model)+'.' : step.q;
    const why = (step.key === '_panels' && model !== 'droid')
      ? step.why.replace('The droid is beside you', 'The model is beside you')
      : step.why;
    sub.innerHTML = '<b>'+q+'</b><br>'+why;
  }

  /* rail — a hardware QUESTION that has an answer wears a ✓ and shows the
     chosen option underneath, so the rail reads as progress + a summary.
     The extra steps (wiring, panels, colours, scene, finish) are places you
     go, not questions you answer: no tick, no subtitle.

     1.5b — the ✓ itself is now gated on wizVisited(), not merely on
     "has an answer": every question always has one (the default, if
     nothing else), so a tick on an untouched step claimed a confirmation
     nobody gave. The answer text still shows either way — it is real,
     just not yet looked at — with a hollow ○ standing in for the tick.

     1.5c — the nine QUESTIONS (model + BUILD_STEPS) are wizSteps()[0..8];
     the six JOBS (WIZ_EXTRA) are [9..14], always, because wizSteps()
     concatenates them in exactly that order. A small divider drops in
     between them — no reordering, just a label — right as the loop
     reaches the first job step. */
  const rail = $('stprail');
  if(rail){
    rail.innerHTML = '';
    const b = buildGet();
    steps.forEach((s,i)=>{
      if(s.key === '_servoSet'){
        const div = el('div','raildiv');
        div.appendChild(el('span','raildivlab','jobs — come back any time'));
        rail.appendChild(div);
      }
      /* buildStepAnswer, not buildOpt — a step may own more than one answer
         since v1.34.0 and the servo chip has to show both ends */
      const isModel = s.key === '_model';
      const isQuestion = isModel || s.key.charAt(0) !== '_';
      const opt = (isQuestion && !isModel) ? buildStepAnswer(s, b) : null;
      /* the model step IS a question, it just does not live in BUILD_STEPS —
         give it the same tick-and-answer treatment, or the first chip in the
         rail is the only one that never says what you chose */
      const mLab = (isModel && typeof modelById === 'function') ? modelById(modelGet()).short : '';
      /* greyed but still clickable: a question the model on the stage does
         not use (v1.32.0) */
      const na = !isModel && s.key.charAt(0) !== '_' && typeof stepUsedByModel === 'function'
              && !stepUsedByModel(s.key, modelGet());
      const seen = isQuestion && wizVisited(s.key);
      const d = el('button','raildot'+(i===WIZ.i?' act':'')+(i<WIZ.i?' done':'')
                 +((opt||isModel)?' ans':'')+(na?' na':''));
      const lab = el('span','raillab');
      if(opt || isModel) lab.appendChild(el('span','railtick'+(seen?'':' unseen'), seen?'✓':'○'));
      /* the title in its own span, not a bare text node (v1.45.0): the chips
         are all one fixed size now, so the label needs something to ellipsise
         inside rather than pushing the box wider — css/07-startup.css */
      lab.appendChild(el('span','railttl', s.title));
      d.appendChild(lab);
      /* EVERY chip gets the answer slot, even when it has nothing to put in
         it (v1.45.0). It is what stops a chip growing a line the moment it
         has an answer — the reserved height is in the CSS, so an empty slot
         costs nothing but the space it was always going to need. */
      if(opt)          d.appendChild(el('span','railans', opt.short || opt.label));
      else if(isModel) d.appendChild(el('span','railans', mLab));
      else             d.appendChild(el('span','railans', ''));
      d.title = 'Step '+(i+1)+' of '+steps.length+' — '+s.title
              + (opt ? ' · '+opt.label : (isModel ? ' · '+mLab : ''))
              + (isQuestion && !seen ? '\nNot visited yet — this is the default, not something you have confirmed.' : '')
              + (na ? '\nNot used by the '+modelById(modelGet()).label+' — your answer is kept for the droid.' : '');
      d.dataset.step = String(i);
      d.addEventListener('click',()=>wizGo(i));
      rail.appendChild(d);
    });
  }

  wizSplit(WIZ_SPLIT.indexOf(step.key) >= 0);

  /* body */
  if(step.key === '_model')       wizModelStep(host);
  else if(step.key === '_wiring') wizWiringStep(host);
  else if(step.key === '_panels'){
    wizDomeMapDoor(host);
    if(typeof buildAssignSect === 'function') buildAssignSect(host, buildStartup);
  }
  else if(step.key === '_paint'){ paintSchemeSect(host, buildStartup); paintSlotSect(host, buildStartup); favColorsSect(host); }
  else if(step.key === '_scene')   wizSceneStep(host);
  else if(step.key === '_done')    wizReviewStep(host);
  else if(step.key === '_servoSet') wizServoSetupStep(host, step);
  else if(step.key === 'servos')   wizServosStep(host, step);
  else                             wizHardwareStep(host, step);

  /* foot — 1.5c: "Step N of 15" was six jobs counted as questions. The
     nine questions now count against 9 of themselves; a job step names
     itself and says plainly that it is not one of the nine. Traversal
     (back/next) is unchanged — this only touches the label. */
  const back = $('btnStpBack'), next = $('btnStpNext'), go = $('btnStartupGo'), foot = $('stpFoot');
  const last = WIZ.i >= steps.length-1;
  const isQuestionStep = step.key === '_model' || step.key.charAt(0) !== '_';
  if(back) back.disabled = WIZ.i === 0;
  if(next){ next.textContent = last ? 'Finish' : 'Next →'; next.className = 'b prim'; }
  if(go){ go.textContent = buildConfigured() ? 'Close' : 'Skip the rest'; go.className = 'b'; }
  if(foot) foot.textContent = (isQuestionStep
      ? 'Question '+(WIZ.i+1)+' of 9'
      : step.title+' · a job, come back any time')
    + ' · every answer applies straight away, and nothing here is locked in.';
}

/* ============================================================ ESC (M7b)
   Esc is the Close button: once there is a configured droid — or the
   builder has already skipped out once (PREFS.seenStartup) — it leaves
   the wizard exactly as btnStartupX does. On a TRUE first run (no build
   configured, never skipped, the wizard opened itself at boot) Esc is
   swallowed instead: the wizard is the only route to a working config,
   and the honest ways out are the labelled "Skip the rest" / Close
   buttons, not a reflex key. Gating on buildConfigured() alone would
   break the skipped-but-unconfigured reopen that look-boards.test.js
   pins (reopened from Setup, Esc must close) — the boot trigger stays
   buildConfigured(), per HANDOVER §7; seenStartup only widens the Esc
   permission.

   Document CAPTURE + stopPropagation — the app-dialog containment
   pattern, via escGuard (core/dialog.js) — so a swallowed Esc cannot
   fall through to the window-level closeStartup listener in main.js or
   the part-deselect in select.js. Three guards leave the Esc to whoever
   sits ABOVE the wizard: the confirm dialog (Reset asks from inside the
   review step), a stage picker (reachable while the split layout shows
   the stage), and the Panels step's dome map (its own document-capture
   handler, dmapEsc, closes IT rather than the wizard underneath) each
   contain their own Esc, and all run on this same document node, so
   returning here is enough. Bound once, at load — this is the
   "listen permanently, check isOpen" style escGuard also covers,
   alongside the five overlays' bind-on-open/unbind-on-close. */
escGuard(
  ()=>{
    const st = $('startup');
    return !!(st && st.classList.contains('on'))
      && !document.querySelector('.dlgwrap') && !$('stagePick') && !$('dmapWrap');
  },
  ()=>{ if(buildConfigured() || PREFS.seenStartup) closeStartup(); }
).bind();
