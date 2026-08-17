'use strict';
/* =====================================================================
   VIEW MODES — retired in v1.17.0, shimmed here.

   The three top-bar view modes (No config / Simple / Advanced) were one
   of THREE navigation systems answering the same question; the four
   WORKSPACES in config/workspaces.js replaced all of them (review B1).
   This file keeps the old global names alive as thin delegates so no
   caller — hud.js's viewShows('pCon'), anything scripted against
   setView() — has to know the trichotomy is gone:

     viewGet()      answers off PREFS.adv: 'advanced' when the Bench's
                    Advanced switch is on, 'build' otherwise. 'drive' is
                    no longer a mode, so it is never returned.
     viewShows(p)   the union of every workspace's tabs under the current
                    Advanced switch — which is everything, except pCon
                    (Serial) exactly when PREFS.adv is off.
     setView(id)    'drive'/'build' → the Drive workspace;
                    'advanced'      → Advanced ON + the Bench workspace.
     applyView(id)  delegates to setView.
     buildViewSel() delegates to buildWsSel — same #viewsel host.

   VIEWS itself stays as inert legacy data: nothing reads it to make a
   decision any more, but suites and scripts may still reference it.
   ===================================================================== */

const VIEWS = [
  {id:'drive',    label:'No config', hint:'the pad, the outputs and the lessons — nothing that can break the droid',
   tabs:['pHelp','pServo','pLearn']},
  {id:'build',    label:'Simple',    hint:'adds the sequence work and the model — where a build actually happens',
   tabs:['pHelp','pServo','pLearn','pMae','pCad']},
  {id:'advanced', label:'Advanced',  hint:'everything, including the serial console and the sketch constants',
   tabs:['pHelp','pServo','pLearn','pMae','pCad','pCon','pCfg']}
];

function viewGet(){ return PREFS.adv ? 'advanced' : 'build'; }
function viewShows(paneId){ return paneId === 'pCon' ? !!PREFS.adv : true; }

function setView(id){
  if(id === 'advanced'){
    PREFS.adv = true;
    prefsSave();
    wsSet('bench');
    applyWs(wsGet());        // even if Bench was already current — re-gate Serial
  }else{
    wsSet('drive');          // 'drive' and 'build' both land on the Drive workspace
  }
}
function applyView(id){ setView(id); }
function buildViewSel(){ buildWsSel(); }

/* ------------------------------------------------------- App menu (v1.14.0)
   Save & load, the three text-size controls and the theme toggle were six
   top-level header items; they fold into ONE Menu button. The popover is
   the STATIC #appMenu block in body.html — shown and placed here, never
   rebuilt, so the control IDs inside it survive for main.js's one-time
   bindings and for the suites that reference them. Closes on outside click
   and on Esc, same contract as the save/load popover below. */
function appMenuOpen(){
  const m = $('appMenu'), b = $('btnAppMenu');
  if(!m || !b) return;
  m.hidden = false;
  const r = b.getBoundingClientRect();
  m.style.top = (r.bottom + 6) + 'px';
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  b.classList.add('act');
  /* defer, or the click that opened it instantly closes it */
  setTimeout(()=>document.addEventListener('click', appMenuDocClick), 0);
  document.addEventListener('keydown', appMenuKey);
}
function appMenuClose(){
  const m = $('appMenu');
  if(!m || m.hidden) return;
  m.hidden = true;
  const b = $('btnAppMenu'); if(b) b.classList.remove('act');
  document.removeEventListener('click', appMenuDocClick);
  document.removeEventListener('keydown', appMenuKey);
}
function appMenuToggle(){
  const m = $('appMenu'); if(!m) return;
  if(m.hidden) appMenuOpen(); else appMenuClose();
}
/* a click INSIDE the menu (A−/A+, theme…) keeps it open; anything else closes */
function appMenuDocClick(e){
  const t = e.target;
  if(t && t.closest && (t.closest('#appMenu') || t.closest('#btnAppMenu'))) return;
  appMenuClose();
}
function appMenuKey(e){ if(e.key === 'Escape') appMenuClose(); }

/* ------------------------------------------------------- Save & load
   Mike asked for the whole-setup export/import to be a top-level control
   rather than something you find at the bottom of a tab. Since v1.14.0 the
   button lives inside the app menu, but this popover — and its function
   names — are unchanged: sequencer.test.js and setup.test.js drive it
   directly. */
function saveLoadKey(e){ if(e.key === 'Escape') saveLoadClose(); }
function saveLoadClose(){
  const p = document.querySelector('.slpop');
  if(p) p.remove();
  document.removeEventListener('click', saveLoadClose);
  document.removeEventListener('keydown', saveLoadKey);
}
function saveLoadPopover(){
  if(document.querySelector('.slpop')){ saveLoadClose(); return; }
  const pop = el('div','slpop');
  pop.addEventListener('click',e=>e.stopPropagation());
  pop.appendChild(el('div','slh','Your setup'));
  const msg = el('div','hint');
  if(typeof setupButtons === 'function') setupButtons(pop, msg);
  pop.appendChild(msg);
  const h = el('div','hint');
  h.innerHTML = 'One <b>.json</b> carries everything: the build answers, the sketch constants, the Maestro board, channels and sequences, '
    + 'your part names, colours and groups, the paint scheme and the backdrop. Drop one anywhere on the window to import it.';
  pop.appendChild(h);
  document.body.appendChild(pop);

  /* anchor to the button when it has a box (menu open); when driven headless
     with the menu shut, its rect is 0×0 — hang the popover off the Menu
     button's corner of the header instead of the top-left of the screen */
  const src = $('btnSaveLoad'), alt = $('btnAppMenu');
  let r = src ? src.getBoundingClientRect() : null;
  if((!r || (!r.width && !r.height)) && alt) r = alt.getBoundingClientRect();
  if(r){
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left - 60)) + 'px';
  }
  setTimeout(()=>document.addEventListener('click', saveLoadClose), 0);
  document.addEventListener('keydown', saveLoadKey);
}
