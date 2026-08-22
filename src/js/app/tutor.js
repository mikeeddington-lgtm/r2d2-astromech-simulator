'use strict';
/* =====================================================================
   TEACH ME TO OPERATE MY DROID

   Mike, 2026-07-27: "we should add a teach me to operate my Robot where we
   give the user a bunch of tasks to learn — driving, running the
   sequences, kicking off sounds, turning on Automation etc."

   Every lesson is DETECTED FROM THE RUNNING FIRMWARE, never from the
   button that was pressed. `done()` is asked once a frame and looks at the
   same state the sketch itself sets — FW.isDriveEnabled, SND.track,
   MAESTRO.slot, ACT, MOT. That means the lesson only ticks when the droid
   actually did the thing, which is the whole point: you are learning to
   operate the droid, not to click the simulator.

   Consequences worth knowing:
     · lessons that depend on a profile's features are FILTERED OUT on the
       other profiles (Maestro sequences do not exist under mod2026), so
       the list is always achievable as it stands
     · progress is per lesson id and persists in PREFS.tutor, so closing
       the app does not lose the badge
     · the prompt is a HUD card on the stage; the checklist is the Learn
       tab. Both read the same LESSONS array.
   ===================================================================== */

const TUTOR = { on:false, i:0, done:{}, since:0, flash:0, seen:{}, base:null, t0:0,
                modelWarned:false, tipped:false };

/* Some state is already true the moment you start — the sketch plays its
   boot sound on connect, so "make some noise" would tick before the user
   touched anything. Lessons that measure a CHANGE compare against this
   snapshot, taken when the lessons are switched on. */
function tutorBaseline(){
  TUTOR.t0 = SIM.millis;
  TUTOR.base = {
    vol: CFG.vol,
    drivespeed: FW.drivespeed,
    hp: !!FW.isHPOn,
    auto: !!FW.isInAutomationMode,
    armed: !!FW.isDriveEnabled
  };
}

/* helpers the checks lean on */
function tzAnyPie(){ return ['pie0','pie1','pie2','pie3','pie4'].some(k=>ACT[k] > 0.5); }
function tzAnyDoor(){ return ['doorL','doorR','doorRL','doorRR'].some(k=>ACT[k] > 0.5); }
function tzSeqRunning(){ return Object.keys(MAESTRO.slot).some(k=>MAESTRO.slot[k]); }

const LESSONS = [
  /* "Press START" was true and useless: START is the pad's name for the ↵
     key, which this lesson never said, and a quick tap can fall entirely
     between two pollInput() calls and produce no button edge at all — so
     the one instruction a first-time user follows first could fail
     silently. Say HOLD, and name the key. (2026-08-22, UX review §1.1) */
  { id:'arm', title:'Wake the feet up',
    how:'<b>Hold START</b> — the <b>↵</b> key — for a moment. Nothing drives until you do: that is deliberate, and it is the same on the real droid.',
    why:'Both firmware families boot disarmed. A tap can be missed, because the sketch only sees the button between one loop and the next — hold it. If the feet ever move before you arm them, something is wrong with your build.',
    done:()=>FW.isDriveEnabled && !TUTOR.base.armed },

  { id:'drive', title:'Drive forward and back',
    how:'Push the <b>left stick</b> up and down. Keys <b>W</b> and <b>S</b> work too.',
    why:'Watch the ramping: the sketch does not jump to the commanded speed, it walks towards it. That is what stops the droid tipping.',
    done:()=>Math.abs(MOT.drive) > 20 || Math.abs(MOT.leftFoot-90) > 15 },

  { id:'turn', title:'Turn on the spot',
    how:'Push the <b>left stick</b> left or right (<b>A</b> / <b>D</b>).',
    why:'Turn authority is a separate constant from drive speed. If your droid darts on turn-in, TURNSPEED is the number to lower.',
    done:()=>Math.abs(MOT.turn) > 20 || Math.abs(MOT.leftFoot - MOT.rightFoot) > 25 },

  { id:'speed', title:'Change gear',
    how:'Click the <b>left stick in</b> (<b>L3</b>, key <b>R</b>) to cycle drive speed 1 → 2 → 3.',
    why:'Speed 1 is for a crowd, 3 is for an empty hall. The sketch plays a different sound for each so you can hear which you are in.',
    done:()=>FW.drivespeed !== TUTOR.base.drivespeed },

  { id:'dome', title:'Spin the dome',
    how:'Push the <b>right stick</b> left or right (<b>J</b> / <b>L</b>).',
    why:'The dome is always live, even with the feet disarmed — it is on its own controller and its own deadzone.',
    done:()=>Math.abs(MOT.dome) > 15 },

  { id:'sound', title:'Make some noise',
    how:'Press <b>Y</b>, <b>A</b>, <b>B</b> or <b>X</b>. Hold a bumper or trigger first for a specific track instead of a random one.',
    why:'Each face button owns a bank of sounds. Sixteen combinations in all — the Controls tab lists every one.',
    /* SND.at is stamped from SIM.millis on every trigger, so this is
       "a sound since the lesson started", not "a sound has ever played" */
    done:()=>SND.track > 0 && SND.at > TUTOR.t0 },

  { id:'vol', title:'Turn it down',
    how:'Hold <b>RB</b> and press <b>▲</b> or <b>▼</b>.',
    why:'On the Maestro sketches this is backwards — ▲ makes it quieter, because the constant was inherited from a board where 0 was loudest.',
    done:()=>CFG.vol !== TUTOR.base.vol },

  { id:'panels', title:'Open the dome',
    how:'Tap <b>RT + ▲</b>. Tap, do not hold — a held d-pad restarts the sequence forever.',
    why:'This is the bug the simulator found: the trigger uses getButtonPress, so holding it restarts the sequence every pass and it never gets past its first frames.',
    profiles:['maestro25','maestro22'],
    done:()=>tzAnyPie() },

  { id:'doors', title:'Open the body doors',
    how:'Tap <b>RT + ▲</b> for the body doors.',
    profiles:['mod2026'],
    why:'On mod2026 the PCA9685 channels are compile-time constants, so ch0 and ch1 are always the front pair.',
    done:()=>tzAnyDoor() },

  { id:'seq', title:'Run a stored sequence',
    how:'Tap any <b>RT</b> or <b>LT</b> + d-pad combination. The Outputs tab shows which slot fired.',
    why:'The sequence itself lives on the Maestro, not in the sketch — the Arduino only sends restartScript(n). Set what each slot does in the setup.',
    profiles:['maestro25','maestro22'],
    done:()=>tzSeqRunning() },

  { id:'hp', title:'Light the holoprojectors',
    how:'Click the <b>right stick in</b> (<b>R3</b>, key <b>F</b>).',
    why:'A single toggle line — worth checking early, because it is the cheapest thing on the droid to get wrong.',
    done:()=>FW.isHPOn && !TUTOR.base.hp },

  { id:'auto', title:'Let it run itself',
    how:'Press <b>BACK</b> to arm automation, then leave it alone for a few seconds.',
    why:'Automation picks random sounds and dome turns. On both Maestro sketches the dome turn blocks the whole loop for 750 ms — the HUD flags it.',
    done:()=>FW.isInAutomationMode && !TUTOR.base.auto },

  { id:'disarm', title:'Put it to sleep',
    how:'Press <b>START</b> again.',
    why:'Finish every session disarmed. On the 2022 BETA a controller dropout does NOT disarm, so the droid can re-arm itself on reconnect.',
    done:()=>!FW.isDriveEnabled && TUTOR.seen.arm }
];

function tutorList(){
  return LESSONS.filter(l=>!l.profiles || l.profiles.indexOf(SIM.profile) >= 0);
}
function tutorLoad(){ TUTOR.done = PREFS.tutor || (PREFS.tutor = {}); }
function tutorSave(){ PREFS.tutor = TUTOR.done; prefsSave(); }
function tutorReset(){
  /* tipped goes with the progress: somebody who has reset their badges is a
     first-run user again, and the arming tip is theirs to be shown once more */
  TUTOR.done = {}; TUTOR.seen = {}; TUTOR.i = 0; TUTOR.tipped = false;
  if(TUTOR.on) tutorBaseline();
  tutorSave(); buildTutor(); tutorHud();
  lg('sys','lessons reset');
}
function tutorProgress(){
  const L = tutorList();
  return {done:L.filter(l=>TUTOR.done[l.id]).length, total:L.length};
}
function tutorCurrent(){
  const L = tutorList();
  return L[Math.min(TUTOR.i, L.length-1)] || null;
}

function setTutor(on){
  TUTOR.on = !!on;
  if(TUTOR.on) tutorBaseline();
  const L = tutorList();
  /* start at the first thing they have not done yet */
  TUTOR.i = Math.max(0, L.findIndex(l=>!TUTOR.done[l.id]));
  if(TUTOR.i < 0) TUTOR.i = 0;
  const b = $('btnTutor'); if(b) b.classList.toggle('act', TUTOR.on);
  const h = $('hudTutor'); if(h) h.style.display = TUTOR.on ? '' : 'none';
  if(TUTOR.on){
    lg('sys','lessons ON — '+tutorProgress().done+'/'+tutorProgress().total+' done. The prompt is on the stage; the full list is the Learn tab.');
    /* warn if the current model is not the droid, but only once per entry */
    if(!TUTOR.modelWarned && typeof PREFS !== 'undefined' && PREFS.model && PREFS.model !== 'droid'){
      TUTOR.modelWarned = true;
      toast('The lessons teach the R2\'s controls — put it on the stage to follow along.');
    }
  }else{
    TUTOR.modelWarned = false;
  }
  buildTutor(); tutorHud();
}

/* THE TEACHABLE MOMENT (2026-08-22, UX review §1.1). Mike, on the fix for
   "pushing the stick while disarmed says nothing": *"Prompt the user if
   they try to use the Controller to press start — a great lesson tip."*

   input/pad-ui.js's driveHintCheck() puts one line over the stage the
   instant a drive input arrives on disarmed feet. That announces. This
   TEACHES, and it does it through the lessons that already exist rather
   than a second mechanism: the attempt is exactly when lesson 1 makes
   sense, so the lessons come on standing at lesson 1, with its own why
   ("both firmware families boot disarmed") on the stage card. Pressing
   START then ticks it off through the ordinary done() check — nothing here
   watches the button, same as every other lesson.

   Who gets it, and how often:
     · ONCE a session (TUTOR.tipped), because the toast beside it already
       repeats on its own schedule and two of anything is nagging.
     · only on a TRUE first run — nobody who has ever completed a lesson
       has the lessons switched on underneath them. TUTOR.done is loaded
       from PREFS, so this survives a reload the way the badges do.
     · if the lessons are ALREADY on, it only walks the card to the arming
       lesson: they asked for this, so do not re-announce it, just answer
       the question they are standing in front of. */
function tutorArmTip(){
  if(TUTOR.tipped) return;
  TUTOR.tipped = true;
  const L = tutorList();
  const i = L.findIndex(l=>l.id === 'arm');
  if(i < 0) return;                       // no arming lesson on this profile
  if(!TUTOR.on){
    if(Object.keys(TUTOR.done).length) return;   // not a first run — leave them alone
    setTutor(true);
  }
  TUTOR.i = i;
  TUTOR.flash = 1.6;
  buildTutor(); tutorHud();
}

/* called once a frame from the main loop */
function tutorTick(dt){
  if(!TUTOR.on) return;
  if(!TUTOR.base) tutorBaseline();
  const L = tutorList();
  if(!L.length) return;
  /* mark ANY satisfied lesson, not just the current one — somebody who
     presses START and immediately drives should get both */
  let changed = false;
  L.forEach(l=>{
    let ok = false;
    try{ ok = !!l.done(); }catch(e){ ok = false; }
    if(ok) TUTOR.seen[l.id] = true;
    if(ok && !TUTOR.done[l.id]){
      TUTOR.done[l.id] = true; changed = true;
      TUTOR.flash = 1.6;
      lg('sys','lesson done: '+l.title);
    }
  });
  if(changed){
    tutorSave();
    const nx = L.findIndex(l=>!TUTOR.done[l.id]);
    TUTOR.i = nx < 0 ? L.length-1 : nx;
    buildTutor();
  }
  if(TUTOR.flash > 0) TUTOR.flash -= dt;
  TUTOR.since += dt;
  if(TUTOR.since > 0.25){ TUTOR.since = 0; tutorHud(); }
}

function tutorHud(){
  const h = $('hudTutor'); if(!h) return;
  if(!TUTOR.on){ h.style.display='none'; return; }
  const L = tutorList(), p = tutorProgress(), cur = tutorCurrent();
  const allDone = p.done >= p.total;
  h.className = 'hud' + (TUTOR.flash > 0 ? ' pop' : '');
  h.innerHTML = allDone
    ? '<div class="tuh"><b>You can drive it.</b><span>'+p.done+'/'+p.total+'</span></div>'
      + '<div class="tub">Every lesson done. Try the practice circuit next — the Track button, bottom right.</div>'
    : '<div class="tuh"><b>'+cur.title+'</b><span>'+p.done+'/'+p.total+'</span></div>'
      + '<div class="tub">'+cur.how+'</div>'
      + '<div class="tuw">'+cur.why+'</div>';
}

/* ------------------------------------------------------------- the pane */
function buildTutor(){
  const host = $('tutorHost'); if(!host) return;
  host.innerHTML = '';
  const L = tutorList(), p = tutorProgress();
  /* v1.57.0 — the whole thing IS written down, and this is the tab somebody
     opens once they have decided they need help. It goes above the lessons
     rather than below them. app/manual.js owns the URL.

     THE NUMBERS COME OFF THE LIST (2026-08-22, UX review). This one screen
     used to carry four counts for two things: "the thirteen lessons below",
     the section's own "N of M" beside it, the stage card's "N/M", and
     "21 chapters" — and 13 + 20 is not 21. LESSONS has thirteen ENTRIES but
     tutorList() filters by profile, so what is actually below this line is
     eleven on mod2026 and twelve on either Maestro sketch; the literal was
     never right on any of them. p.total is that list's own length, which is
     what the other two counts already used.

     The chapter count is NOT restated here either. manualCard() puts
     "21 chapters · 8 clips" in its own section header two lines below, from
     app/manual.js, which owns that document — a second number here could
     only ever be a copy waiting to go stale, which is precisely what "the
     other twenty chapters" was. */
  if(typeof manualCard === 'function')
    manualCard(host, {id:'btnManualLearn', note:false,
      blurb:'The ' + p.total + ' lessons below teach you to <b>drive</b> it. The manual is the rest of the story — '
          + 'the setup questions, <b>the servo bench</b> to try a sequence on, finding your servo end stops, '
          + 'bricks, live drive, and what to do when nothing moves.'});

  const s = sect(host, 'Lessons', p.done+' of '+p.total);
  const bar = el('div','conbar');
  const bOn = el('button','b'+(TUTOR.on?' act prim':' prim'), TUTOR.on ? 'Lessons on' : 'Start lessons');
  bOn.addEventListener('click',()=>setTutor(!TUTOR.on));
  const bReset = el('button','b','Reset progress');
  bReset.addEventListener('click',tutorReset);
  bar.appendChild(bOn); bar.appendChild(bReset);
  s.appendChild(bar);

  const meter = el('div','tumeter');
  const fill = el('i'); fill.style.width = (p.total ? p.done/p.total*100 : 0)+'%';
  meter.appendChild(fill); s.appendChild(meter);

  L.forEach((l,i)=>{
    const row = el('div','turow'+(TUTOR.done[l.id]?' done':'')+(TUTOR.on && i===TUTOR.i?' cur':''));
    const tick = el('div','tutick', TUTOR.done[l.id] ? '✓' : String(i+1));
    row.appendChild(tick);
    /* v1.15.0 M1 — the checklist reads as prose (sans, --fs-body) with the
       lesson title at --fs-title; the on-stage HUD card (.tub/.tuw) keeps
       its own compact type because it floats over the 3D view */
    const body = el('div','tubody');
    body.appendChild(el('div','tutitle ttl', l.title));
    const how = el('div','tuhow prose'); how.innerHTML = l.how; body.appendChild(how);
    const why = el('div','tuwhy prose'); why.innerHTML = l.why; body.appendChild(why);
    row.appendChild(body);
    row.addEventListener('click',()=>{ TUTOR.i = i; if(!TUTOR.on) setTutor(true); else { buildTutor(); tutorHud(); } });
    s.appendChild(row);
  });

  const h = el('div','note cy prose');
  h.innerHTML = '<b>Nothing here watches your buttons.</b> Each lesson checks the droid itself — whether the feet are armed, '
    + 'whether a sound is playing, whether a panel actually moved. So it ticks when the <i>droid</i> did the thing, which is '
    + 'the same test you will use on the bench. Lessons that need a feature your firmware does not have are left out of the list.';
  host.appendChild(h);
}
