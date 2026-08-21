'use strict';
/* =====================================================================
   WORKSPACES — what you are DOING decides what the app shows  (B1, v1.17.0)

   The 2026-07-30 review's first bold finding: the app had grown THREE
   navigation systems that all answered the same question — the view modes
   (drive/build/advanced) gating tabs, the Controller/Sequencer strip
   switch, and seven sidebar tabs. This file replaces the trichotomy with
   FOUR workspaces, named for the activity rather than the audience:

     drive    — use the droid. Controls, Outputs, Learn.
     seq      — the sequencer desk. Not a tab set: entering IS
                setStripMode('seq'), the full-screen show-control layout.
     config   — set the droid up. Config, Model.
     bench    — the Maestro workshop. Maestro, Outputs, and — behind the
                Advanced switch in the tabs row — the Serial console.

   Outputs appears in BOTH Drive and Bench on purpose: it is the "what are
   the servos doing" answer, and both activities ask it.

   The rule the view modes obeyed carries over unchanged: **a hidden pane
   never changes behaviour, only visibility.** The sketch runs identically
   in all four workspaces.

   Two doors into the Sequence desk, ONE state: the header button here and
   the strip's Controller|Sequencer switch both funnel through
   setStripMode(), whose last line calls wsStripSync(m) — one-way, strip →
   header, so every entrance (strip door, sequence card, dropped audio,
   import wizard) lands the header right and there is no loop.

   Prev-workspace memory: PREFS.ws only ever holds the last NON-Sequence
   workspace. Entering the desk never writes it — it IS the memory — so
   leaving by either door restores where you were, and a reload never
   lands mid-desk. The runtime answer is WS.cur, which CAN be 'seq'.

   The legacy view-* body classes are removed at apply time. Nothing in
   the CSS keys on them (verified: only views.js ever touched them), so
   they simply stop existing.
   ===================================================================== */

const WORKSPACES = [
  {id:'drive',  label:'Drive',     hint:'use the droid — the pad, the outputs and the lessons',
   tabs:['pHelp','pServo','pLearn']},
  {id:'seq',    label:'Sequence',  hint:'the sequencer desk — build sequences out of bricks and put them on the board',
   tabs:[]},
  {id:'config', label:'Configure', hint:'set the droid up — the sketch constants and the model',
   tabs:['pCfg','pCad']},
  {id:'bench',  label:'Board',     hint:'the board, the outputs, and (Advanced) the serial console',
   tabs:['pMae','pServo','pCon']}
  /* v1.59.0 briefly added a fifth here — the servo gauges — and v1.60.0 took
     it back out: they are a MODEL on the stage now (scene/models.js), so the
     way in is the stage chip and Configure → Model like the Polar Mouse, and
     a header button that behaved differently from the four beside it was the
     wrong shape for it. */
];

const WS = { cur:'drive' };                     // runtime answer — CAN be 'seq'

function wsDef(id){ return WORKSPACES.find(w=>w.id===id) || WORKSPACES[0]; }
function wsGet(){ return WORKSPACES.some(w=>w.id===WS.cur) ? WS.cur : 'drive'; }
/* the last non-Sequence workspace — what a reload and the desk's exit restore */
function wsPrev(){
  const id = PREFS.ws;
  return (id !== 'seq' && WORKSPACES.some(w=>w.id===id)) ? id : 'drive';
}

/* a workspace's tab list under the current Advanced switch — pCon (Serial)
   is Bench's expert pane and only exists while PREFS.adv is on */
function wsTabs(id){
  const t = wsDef(id).tabs;
  return PREFS.adv ? t.slice() : t.filter(p=>p !== 'pCon');
}

/* can this workspace be entered right now? Only Sequence has a gate, and
   since v1.27.0 it is about the BUILD: any build with a servo board that
   can hold sequences gets the desk, Pololu or PCA9685. In practice that is
   every build, so this only ever refuses a half-configured one. */
function wsReachable(id){
  if(id !== 'seq') return true;
  /* v1.27.0: a PCA9685 build can hold sequences too — they run on the
     MaestroPCA co-processor. The question is the BUILD's servo boards, not
     which firmware profile is loaded. */
  if(typeof buildCanSequence === 'function') return buildCanSequence();
  return typeof PROFILE === 'undefined' || !PROFILE || !!PROFILE.hasMaestro;
}

function wsSet(id){
  /* sim only hides this switcher entirely (10-kiosk.css), so this is
     belt-and-braces — but a workspace change would put the sidebar or the
     sequencer desk back under a stranger's hands, and the whole mode is
     only worth having if it holds when something calls a function it
     cannot see. Same reasoning as the drop and openStartup guards. */
  if(typeof kioskOn === 'function' && kioskOn()) return;
  if(!WORKSPACES.some(w=>w.id===id)) id = 'drive';
  if(WS.cur === id) return;                     // incl. 'seq' while already in the desk
  if(id === 'seq'){
    /* same refusal, same words, as the strip door (panels.js disables that
       button with this exact title) — the header button stays clickable so
       the refusal can SAY why */
    if(!wsReachable('seq')){
      toast('this build has no servo board yet — answer the servo questions in Setup first','warn');
      return;
    }
    /* the desk owns its own entry — wsStripSync (setStripMode's last line)
       lands WS.cur and the header. PREFS.ws is deliberately NOT written. */
    setStripMode('seq');
    return;
  }
  const fromSeq = (WS.cur === 'seq');
  WS.cur = id;
  PREFS.ws = id;                                // only ever a NON-Sequence workspace
  prefsSave();
  /* leaving the desk via the header is the same exit as "Back to workshop" —
     WS.cur is already the destination, so the sync below is a no-op */
  if(fromSeq && typeof EDIT !== 'undefined' && EDIT.active) setStripMode('pad');
  applyWs(id);
  lg('sys','workspace → '+wsDef(id).label+' ('+wsDef(id).hint+')');
}

function applyWs(id){
  const def = wsDef(id);
  /* the retired view-* classes go here too, so a migrated session cannot
     carry one across — nothing in the CSS reads them (verified) */
  document.body.classList.remove('ws-drive','ws-seq','ws-config','ws-bench',
                                 'view-drive','view-build','view-advanced');
  document.body.classList.add('ws-'+def.id);

  if(def.id !== 'seq'){
    /* tab gating — applyView's exact mechanism: hide the buttons this
       workspace does not offer, and if the pane that is currently open is
       one of them, fall back to the first tab rather than leaving the
       sidebar blank. (In the desk the sidebar is display:none wholesale —
       03-pad.css — so the buttons keep the previous workspace's state.) */
    const tabs = wsTabs(def.id);
    let openIsHidden = false;
    document.querySelectorAll('#tabs button').forEach(b=>{
      const show = tabs.indexOf(b.dataset.p) >= 0;
      b.style.display = show ? '' : 'none';
      if(!show && b.classList.contains('act')) openIsHidden = true;
    });
    if(openIsHidden){
      const first = document.querySelector('#tabs button[data-p="'+tabs[0]+'"]');
      if(first) first.click();
    }
  }

  /* the Advanced switch belongs to the Bench — everywhere else it is noise */
  const aw = $('wsAdvWrap'); if(aw) aw.hidden = (def.id !== 'bench');
  const ac = $('wsAdv'); if(ac) ac.checked = !!PREFS.adv;

  buildWsSel();
}

/* the header switcher — four .wsbtn buttons in the old #viewsel host */
function buildWsSel(){
  const host = $('viewsel'); if(!host) return;
  host.innerHTML = '';
  WORKSPACES.forEach(w=>{
    const blocked = !wsReachable(w.id);
    const b = el('button','wsbtn'+(w.id===WS.cur?' act':'')+(blocked?' blocked':''), w.label);
    b.dataset.ws = w.id;
    b.title = blocked
      ? 'this build has no servo board yet — answer the servo questions in Setup first'
      : w.hint;
    b.addEventListener('click',()=>wsSet(w.id));
    host.appendChild(b);
  });
}

/* ONE-WAY sync, strip → header. Called as the last line of setStripMode()
   so every door into (and out of) the desk lands the header right. It never
   calls setStripMode back — the strip already IS in mode m. */
function wsStripSync(m){
  if(m === 'seq'){
    if(WS.cur === 'seq') return;
    WS.cur = 'seq';                             // PREFS.ws untouched — it IS the way back
    applyWs('seq');
  }else{
    if(WS.cur !== 'seq') return;
    WS.cur = wsPrev();                          // either exit door restores the memory
    applyWs(WS.cur);
  }
}

/* Capture-phase tab hop: a click on a tab the current workspace does not
   offer pulls the workspace over to the first one that does, BEFORE the
   tab's own click handler opens the pane. Programmatic .click() calls
   (hud.js's "open Serial →", the suites) keep working across workspaces.
   Skipped in the desk — its sidebar is hidden, and a stray synthetic click
   must not yank the workspace out from under the sequencer. */
function wsTabHop(e){
  const b = e.target && e.target.closest && e.target.closest('#tabs button');
  if(!b || !b.dataset.p) return;
  if(WS.cur === 'seq') return;
  if(wsTabs(WS.cur).indexOf(b.dataset.p) >= 0) return;
  const to = WORKSPACES.find(w => w.id !== 'seq' && wsTabs(w.id).indexOf(b.dataset.p) >= 0);
  if(to) wsSet(to.id);
}

/* one-time localStorage migration from the retired view modes */
function wsMigrate(){
  if(PREFS.view !== undefined){
    if(PREFS.view === 'advanced') PREFS.adv = true;   // they had the console — keep it
    if(!WORKSPACES.some(w=>w.id===PREFS.ws)) PREFS.ws = 'drive';
    delete PREFS.view;
    prefsSave();
  }
  if(PREFS.ws === 'seq'){ PREFS.ws = 'drive'; prefsSave(); }   // never boot mid-desk
}

function wsInit(){
  wsMigrate();
  WS.cur = wsPrev();
  const a = $('wsAdv');
  if(a){
    a.checked = !!PREFS.adv;
    a.addEventListener('change',()=>{
      PREFS.adv = a.checked;
      prefsSave();
      applyWs(WS.cur);          // re-gates Serial, incl. the fallback when it was open
      lg('sys','bench advanced '+(PREFS.adv ? 'ON — the serial console is available' : 'off — the serial console is hidden'));
    });
  }
  document.addEventListener('click', wsTabHop, true);
  applyWs(WS.cur);
}
