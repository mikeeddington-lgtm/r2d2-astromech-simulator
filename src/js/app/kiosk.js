'use strict';
/* =====================================================================
   SIM ONLY — the public driving mode  (v1.28.0)

   Mike, 2026-08-12: *"Need to add a Sim only which displays the Droid and
   its background / track and when enabled has the option to set a
   temporary password — this will allow the public to have a go at driving
   the Droids."*

   So: a kiosk. Hand the laptop to a stranger at a show, they drive the
   droid round the circuit, and nothing they can reach re-configures the
   build, re-maps a channel or opens the sequencer. The way out asks for
   the password you set on the way in.

   WHAT IT IS NOT. It is not a fifth workspace, and it is deliberately not
   built on top of one. A workspace answers "what am I doing"; this answers
   "who is holding the laptop", and it has to survive being answered
   wrongly. Workspaces are a preference the app remembers and restores;
   this is a *lock*, and a lock that a reload could restore is a lock that
   can strand Mike out of his own droid at a show. Hence:

     · KIOSK lives HERE, not in PREFS. Nothing writes it to localStorage,
       nothing puts it in the setup .json. Close the tab and it is gone,
       password and all — that is the whole meaning of "temporary" (Mike's
       choice, 2026-08-12).
     · the sketch is untouched. Same rule as the model selector and the
       old view modes (§3): hiding a pane never changes behaviour. loop()
       runs, the Maestro steps, the automation timers tick. The public are
       driving the real firmware, which is the entire point of the sim.
     · what is on the stage is FROZEN, not reset. Whatever model, backdrop,
       environment and track state were live when you enabled it are what
       they get. Entering changes nothing about the scene, so leaving has
       nothing to put back. The CAMERA is the one exception, since v1.70.0
       — see kioskRecentre() below. It is a viewpoint, not the scene, and
       an inherited one can be pointing at an empty corner of the deck.

   The guards are the interesting part. Hiding a control is cosmetic — a
   determined visitor with a keyboard and a mouse still has the window. The
   two doors that survive hiding the chrome are both closed here rather
   than in CSS:

     · DRAG AND DROP (maestro/ui-files.js). The window accepts a .json, an
       .ino, an .r2m or a .mstr dropped anywhere and reconfigures itself
       from it. That is the single most destructive thing a stranger could
       do by accident, and no amount of display:none stops it.
     · openStartup() (look/startup.js). The Setup button is hidden, but the
       function is one call away from anything.

   Both consult kioskOn(). Guarding at the function, not at the button, is
   what makes "locked" true rather than decorative.

   The exit is #kioskBar's button, in the row the header vacates: with the
   bar shown and the header display:none, #app's `38px 1fr` grid is
   unchanged and the bar simply takes the header's track. No grid maths,
   no absolute positioning over the stage's pointer handling.

   THE BAR IS THE ONE SURFACE SIM ONLY ADDS, so anything put on it is the
   shortest road back into the app. Both of its controls are held to the
   same rule as the guards above: Exit is the door and asks for the
   password; Re-centre touches CAM and nothing else. Nothing else goes on
   this bar without the same test.
   ===================================================================== */

/* Session-only, on purpose. `pass` is the plain string as typed: this
   guards a laptop on a table from curious fingers, it is not a secret —
   pretending otherwise by hashing it in the page would be theatre. */
const KIOSK = { on:false, pass:null };

function kioskOn(){ return !!KIOSK.on; }

/* ------------------------------------------------------------ entering */
/* pass: '' or null means "no lock, anyone can leave". */
function kioskEnter(pass){
  if(KIOSK.on) return false;

  /* leave anything that owns the screen BEFORE the class lands, so nothing
     is left half-open underneath the kiosk. The sequencer desk in
     particular hides the sidebar itself and would fight the CSS. */
  if(typeof EDIT !== 'undefined' && EDIT.active && typeof setStripMode === 'function') setStripMode('pad');
  if(typeof PUPPET !== 'undefined' && PUPPET.on && typeof puppetSet === 'function') puppetSet(false);
  /* v1.60.0 — and the SERVO GAUGES. They are a MODEL now, so unlike v1.59.0's
     workspace the kiosk's own rules DO reach the furniture around them — but
     the model itself would stay selected, and sim only is a public DRIVING
     mode: a queue of people at a con should get the droid, not a wall of
     gauges they cannot drive. #stageTools is hidden in kiosk, so there would
     be no way back to it either. */
  if(typeof modelGet === 'function' && modelGet() === 'servos'
     && typeof modelSet === 'function') modelSet('droid');
  /* v1.61.0 — and the PART CARD. selectPart() is guarded from here on
     (cad/select.js), but a card that was already open when the laptop was
     handed over would simply stay open, with every control on it live. The
     card is the one piece of furniture the STAGE owns rather than #side, so
     hiding the sidebar wholesale never reached it. */
  if(typeof deselectPart === 'function') deselectPart();
  if(typeof appMenuClose === 'function') appMenuClose();
  if(typeof saveLoadClose === 'function') saveLoadClose();
  if(typeof stagePickerClose === 'function') stagePickerClose();
  if(typeof kbdHelpClose === 'function') kbdHelpClose();
  /* v1.71.0 — the wizard is shut, but NOT at the cost of the user's consent.
     closeStartup() sets PREFS.seenStartup, and since v1.71.0 that flag is what
     stops the wizard reopening at question 1 on every boot. Here it is the APP
     force-closing an overlay to hand the laptop over — nobody dismissed
     anything — so spending it would mean a fresh install that once entered sim
     only never sees setup again. Put it back exactly as it was found. */
  if(typeof closeStartup === 'function' && $('startup') && $('startup').classList.contains('on')){
    const wasSeen = (typeof PREFS !== 'undefined') ? PREFS.seenStartup : undefined;
    closeStartup();
    if(typeof PREFS !== 'undefined' && !wasSeen){
      PREFS.seenStartup = wasSeen;
      if(typeof prefsSave === 'function') prefsSave();
    }
  }
  const iw = $('impWiz'); if(iw) iw.hidden = true;
  const bw = $('bldWiz'); if(bw) bw.hidden = true;

  KIOSK.on   = true;
  KIOSK.pass = (pass === undefined || pass === null) ? null : (String(pass) || null);
  document.body.classList.add('kiosk');
  kioskSyncBar();
  /* compose the opening frame rather than inherit the operator's (v1.70.0).
     One walkthrough's public view had no droid in it at all, because the
     camera was wherever the last piece of workshop business left it. This
     is the only thing entering changes about the stage, it is one call, and
     leaving needs no restoration pass for it — Follow, Reset pose and Front
     are all back in #stageTools the moment the header is. */
  kioskRecentre();
  lg('sys','sim only ON — public driving'+(KIOSK.pass ? ', the way out is locked' : ', no password set'));
  if(typeof toast === 'function'){
    toast(KIOSK.pass
      ? 'Sim only. The way out needs the password.'
      : 'Sim only. No password — anyone can leave.');
  }
  /* the stage just grew by the header and the whole sidebar */
  if(typeof onResize === 'function') setTimeout(onResize, 0);
  return true;
}

/* ------------------------------------------------------------- leaving */
/* The unconditional exit. Nothing in the UI calls this directly while a
   password is set — kioskExit() is the door — but the suites and the
   console need a way past the prompt. */
function kioskLeave(){
  if(!KIOSK.on) return false;
  KIOSK.on = false; KIOSK.pass = null;
  document.body.classList.remove('kiosk');
  kioskSyncBar();
  lg('sys','sim only off — back to the full app');
  if(typeof onResize === 'function') setTimeout(onResize, 0);
  return true;
}

/* The exit button's handler. Async because both branches ask a question;
   a wrong answer says so and leaves the mode exactly as it was. */
async function kioskExit(){
  if(!KIOSK.on) return false;
  if(!KIOSK.pass){
    const go = (typeof appConfirm === 'function')
      ? await appConfirm('This puts the full app back — the setup, the board and the sequencer.',
                         {title:'Leave sim only?', yes:'Leave', no:'Stay'})
      : true;
    if(!go) return false;
    return kioskLeave();
  }
  /* A wrong password used to close the prompt and drop a toast, which is
     the wrong shape twice over. The message lands bottom-left over the
     stage while the operator is looking at the middle of the screen, and
     z-index 7 puts it UNDER .dlgwrap's 300 — so the only moment it is
     visible is the moment the thing it is about has vanished. Worse, the
     prompt going away silently is itself a leak: someone who fat-fingers
     their own password and keeps typing is now typing at a LIVE pad, and
     the w and the r in it drive the droid and change gear.

     So the question is asked again, in place, with the answer to the last
     attempt at the top of it. No lockout and no counter — this is a laptop
     on a table at a convention, not a bank; the operator has to be able to
     get back in, and the password is a session string they typed ten
     minutes ago, not a secret. Cancel still means "never mind, stay in sim
     only", so nothing that awaits this can hang. */
  const ASK  = 'Type the password to put the full app back.';
  const MISS = 'That is not the password — have another go. '
             + 'It is the one you typed when you started sim only, and it is only for this session. '
             + 'Cancel stays in sim only.';
  if(typeof appPrompt !== 'function') return false;
  let msg = ASK;
  for(;;){
    const typed = await appPrompt(msg, {title:'Sim only — locked', password:true,
                                        placeholder:'password', yes:'Unlock'});
    if(typed === null) return false;               // cancelled — stay locked, say nothing
    if(typed === KIOSK.pass) return kioskLeave();
    lg('warn','sim only — wrong password');
    msg = MISS;
  }
}

/* ---------------------------------------------------------- the enable */
/* From the app menu. One dialog: blank means no lock, Cancel means never
   mind. Deliberately a PASSWORD field even though it is not a secret —
   you are typing it in front of the people it is meant to keep out. */
async function kioskAsk(){
  if(KIOSK.on) return false;
  if(typeof appMenuClose === 'function') appMenuClose();
  const p = (typeof appPrompt === 'function')
    ? await appPrompt('Full-screen droid, the pad and the HUD — and nothing that can change the build. '
                    + 'Set a password and only it puts the full app back. Leave it blank and anyone can. '
                    + 'Either way it is forgotten when this page closes.',
                      {title:'Sim only — let the public drive', password:true,
                       placeholder:'temporary password (optional)', yes:'Start', no:'Cancel'})
    : '';
  if(p === null) return false;
  return kioskEnter(p.trim());
}

/* --------------------------------------------------------- the way back */
/* RE-CENTRE (v1.70.0). Sim only hides #stageTools whole, and Follow, Reset
   pose and Front are all in it — so the first visitor to spin the mouse
   wheel could put the droid off screen and end the exhibit until an
   operator typed the password. The camera is deliberately NOT locked;
   orbit and zoom are the point of handing the laptop over. What the mode
   needed was a way BACK, and this is it: frame whatever model is on the
   stage (modelFrame — the three are wildly different sizes) and turn
   Follow on, so it stays framed while they drive.

   It is on the bar, so it is held to the bar's rule: it touches CAM and
   nothing else. No panel, no picker, no pref, nothing that could
   reconfigure the build — which is what keeps it from being a seventh
   door. syncFollowBtn() writes to #btnFollow, which is inside the hidden
   #stageTools; that is a class on a hidden button, not a way to reach it,
   and it keeps the workshop's own Follow lamp honest on the way out. */
function kioskRecentre(){
  if(typeof CAM === 'undefined') return false;
  if(typeof modelFrame === 'function' && typeof modelGet === 'function') modelFrame(modelGet());
  else if(typeof viewFrame === 'function') viewFrame('full');
  /* modelFrame/viewFrame both drop Follow — this is the half that says
     "and keep it there", which is the whole point at a show */
  CAM.follow = true;
  if(typeof syncFollowBtn === 'function') syncFollowBtn();
  return true;
}

/* the bar's own state — the padlock only claims a lock when there is one */
function kioskSyncBar(){
  const t = $('kioskState');
  if(t) t.textContent = KIOSK.on
    ? (KIOSK.pass ? '🔒 locked — the password puts the full app back' : 'unlocked — anyone can leave')
    : '';
  const b = $('btnKioskExit');
  if(b) b.title = KIOSK.pass
    ? 'leave sim only — asks for the password'
    : 'leave sim only and put the full app back';
}

/* ------------------------------------------------------------ bindings */
/* Bound here rather than in main.js: this module owns every control it
   adds, and main.js's boot block is already the longest function in the
   app. Both IDs are static markup (body.html), so one binding at parse
   time is enough — the same contract #appMenu's controls have. */
if($('btnKioskExit')) $('btnKioskExit').addEventListener('click', ()=>kioskExit());
if($('btnKiosk'))     $('btnKiosk').addEventListener('click', ()=>kioskAsk());

/* Re-centre is BUILT here rather than written into body.html — that file
   belongs to another agent this stage — the same way app/track-edit.js
   builds its EDIT button next to the stage TRACK one. It goes before Exit
   so the way out stays the last thing on the bar. Nothing extra is needed
   to keep it out of the workshop: it is a child of #kioskBar, which
   10-kiosk.css hides whole with `body:not(.kiosk) #kioskBar{display:none}`. */
function kioskInstallRecentre(){
  const exit = $('btnKioskExit');
  if(!exit || $('btnKioskRecentre')) return;
  const b = el('button', null, 'Re-centre');
  b.id = 'btnKioskRecentre';
  b.type = 'button';
  b.title = 'put the droid back in the middle of the picture and keep it there — '
          + 'you can still orbit and zoom';
  b.addEventListener('click', ()=>kioskRecentre());
  exit.insertAdjacentElement('beforebegin', b);
}
kioskInstallRecentre();
