'use strict';
/* =====================================================================
   LIVE DRIVE — the sequencer moves the real droid

   Mike, 2026-08-14: "for the Sequencer we should have the option to drive
   the real servos too."

   Everything needed for this already existed and none of it was joined
   up. `serial-link.js` says so in its own header — "the same drive slider,
   the same dial and the same sequence that move the model also move the
   servo, because the engine's onWrite goes down the wire" — but only the
   dial and the slider ever called `HW.drive()`. The sequencer drove
   `ACT_T`, which is the 3D model and nothing else. You could build an
   afternoon of choreography, watch it play perfectly on screen, and have
   never once moved a horn.

   WHERE THIS HOOKS IN. Not the sequencer. `applyFrameTargets()` and
   `applyLivePose()` in playback.js are the two functions every routine
   goes through — the sequencer's preview, a pad cue, a music track, a
   brick routine. Putting the seam there means "drive the real servos" is
   one arm switch for all of them instead of four half-implementations
   that disagree about what stop means.

   WHY IT GOES THROUGH THE ENGINE. `HW.drive()` sets a target on the bench
   engine and the engine writes positions down the wire; it does NOT write
   the target straight to the board. That matters for three reasons:
     · the channel's speed and acceleration are applied, so a frame that
       jumps 90° ramps rather than snaps — which is what the droid will do
       when the sketch plays the same sequence;
     · targets are clamped into each channel's own min/max, so a routine
       built on a different droid cannot drive this one past its stops;
     · the position stream is rate-limited and de-duplicated by
       `serialWrite()`, so a 60 Hz UI cannot flood a 115200 baud link.

   THE ONE THING IT WILL NOT DO IS PRETEND. Armed with no board connected,
   the button says so and offers to connect. It never quietly downgrades
   to "virtual" while claiming to be live — that is the failure mode that
   makes someone believe an untested routine is safe.
   ===================================================================== */

const LIVE = {
  on: false,
  /* the warning is per-arm, not per-session: recalibrating between two
     arms is exactly when you want to be asked again */
  asked: false
};

/* Is there a board that will actually take positions? `SER.blocked` is the
   monitor-only state — a MaestroReplacement build talks a command protocol,
   not a position stream, and driving it from here would be shouting in the
   wrong language. */
function liveReady(){
  return typeof SER !== 'undefined' && !!SER.port && !SER.blocked;
}
/* Kiosk is a public driving mode: someone else is holding the laptop, and
   they did not agree to move your droid. Never live. */
function liveOn(){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  return !!LIVE.on && liveReady();
}
/* channels that would move: in use, and endpoints nobody has been round */
function liveUnmeasured(){
  if(typeof HW === 'undefined' || !HW.channels) return [];
  return HW.channels().filter(c=>c && /^servo/i.test(c.mode) && !c.calibrated);
}

/* ------------------------------------------------------------- the seam
   Called for every channel of every frame. Cheap and silent when disarmed,
   because it is on the playback path of a 60 Hz loop. */
function liveWrite(c, qus){
  if(!LIVE.on || !c || !/^servo/i.test(c.mode || '')) return;
  if(!liveOn()) return;
  if(!qus) return;                     /* 0 means "leave this channel alone" */
  if(typeof HW !== 'undefined' && HW.drive) HW.drive(c.i, qus);
}

/* --------------------------------------------------------- arm / disarm */
async function liveSet(on, opts){
  const o = opts || {};
  if(!on){
    LIVE.on = false; LIVE.asked = false;
    liveUiSync();
    /* Deliberately NOT cutting the pulses. A released servo is a dead
       servo, and a dead servo holding a heavy panel open drops it. The
       droid keeps the last position it was given; the bench's own
       all-off is one click away for anyone who wants it limp. */
    if(typeof lg === 'function')
      lg('mae','live drive off — the board keeps its last positions. Use the bench to release them.');
    /* said out loud when it was NOT you who clicked the button — leaving the
       desk disarms (v1.39.4), and a droid that quietly stops following is
       worse than one that says why it stopped */
    if(o.why && typeof toast === 'function') toast(o.why);
    return false;
  }
  if(!liveReady()){
    /* one button, the obvious next step: offer the port rather than a
       sentence about how to go and find it */
    if(typeof serialConnect === 'function' && typeof appConfirm === 'function'){
      const go = await appConfirm(
        'Nothing is connected yet. Live drive streams positions to a board running <b>PCA_Bridge</b> over USB.',
        {title:'Connect a board first?', yes:'Connect hardware', no:'Not now', html:true});
      if(go){ await serialConnect(); }
    }
    if(!liveReady()){ liveUiSync(); return false; }
  }
  /* THE WARNING THAT IS WORTH A CLICK. Two facts, both of which have cost
     somebody a servo: a channel nobody has measured has endpoints that are
     a guess, and the first target on a channel SNAPS because the board has
     no idea where the horn is standing. */
  const un = liveUnmeasured();
  if(!LIVE.asked && typeof appConfirm === 'function'){
    const body = (un.length
        ? '<b>' + un.length + ' channel' + (un.length===1?' has':'s have') + ' endpoints nobody has measured.</b> '
          + 'A sequence built on a guess is about to be played into real linkage. '
        : 'Every channel in use has endpoints you captured yourself. ')
      + 'The first move on each channel is a <b>jump, not a ramp</b> — the board does not know where the horn is '
      + 'standing until something tells it. Have a hand near the power.';
    const go = await appConfirm(body, {title:'Drive the real servos?', yes:'Yes — go live', no:'Cancel', html:true});
    if(!go){ liveUiSync(); return false; }
    LIVE.asked = true;
  }
  LIVE.on = true;
  liveUiSync();
  if(typeof lg === 'function')
    lg('mae','LIVE — sequences now drive the board as well as the model'
      + (un.length ? ' ('+un.length+' unmeasured channel'+(un.length===1?'':'s')+')' : ''));
  if(typeof toast === 'function') toast('Live: the real servos follow the sequencer');
  return true;
}
function liveToggle(){ return liveSet(!LIVE.on); }

/* ------------------------------------------------------------ the button
   Three states, and the button says which one it is in rather than looking
   the same in two of them: no board · board but sim only · live. */
function liveUiSync(){
  const b = (typeof $ === 'function') ? $('sqLive') : null;
  if(!b) return;
  const ready = liveReady(), on = liveOn();
  b.classList.toggle('act', on);
  b.classList.toggle('warn', on);
  /* "Sim only", not "Model only" (Mike, 2026-08-16) — the app already
     calls its hand-the-laptop-over mode Sim only, and the droid on the
     stage is "the model", so "Model only" read as a MODE the model was in
     rather than "this is going nowhere near your hardware". */
  b.textContent = on ? '⚡ Live servos' : (ready ? '⚡ Sim only' : '⚡ No board');
  b.title = on
    ? 'The sequencer is driving the real board. Click to go back to sim only — the servos hold their last position.'
    : ready
      ? 'A board is connected. Click to let sequences drive the real servos as well as the model.'
      : 'Nothing connected. Click to open a board running PCA_Bridge, then go live.';
}
/* the link's own chrome repaints every surface that asked to be told —
   including this one, so unplugging the board cannot leave a button
   claiming to be live (v1.38.1's registry, used as intended) */
if(typeof serialUiRegister === 'function') serialUiRegister(function(){
  /* a link that goes away takes the arm with it: silently staying armed
     would mean the next connect starts driving with no one expecting it */
  if(LIVE.on && !liveReady()){ LIVE.on = false; LIVE.asked = false; }
  liveUiSync();
});
