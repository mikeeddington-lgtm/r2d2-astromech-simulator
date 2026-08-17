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
       nothing to put back.

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
  if(typeof appMenuClose === 'function') appMenuClose();
  if(typeof saveLoadClose === 'function') saveLoadClose();
  if(typeof stagePickerClose === 'function') stagePickerClose();
  if(typeof kbdHelpClose === 'function') kbdHelpClose();
  if(typeof closeStartup === 'function' && $('startup') && $('startup').classList.contains('on')) closeStartup();
  const iw = $('impWiz'); if(iw) iw.hidden = true;
  const bw = $('bldWiz'); if(bw) bw.hidden = true;

  KIOSK.on   = true;
  KIOSK.pass = (pass === undefined || pass === null) ? null : (String(pass) || null);
  document.body.classList.add('kiosk');
  kioskSyncBar();
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
  const typed = (typeof appPrompt === 'function')
    ? await appPrompt('Type the password to put the full app back.',
                      {title:'Sim only — locked', password:true, placeholder:'password', yes:'Unlock'})
    : null;
  if(typed === null) return false;                 // cancelled — stay locked, say nothing
  if(typed !== KIOSK.pass){
    lg('warn','sim only — wrong password');
    if(typeof toast === 'function') toast('that is not the password','warn');
    return false;
  }
  return kioskLeave();
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
