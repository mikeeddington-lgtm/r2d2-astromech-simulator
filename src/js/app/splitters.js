'use strict';
/* =====================================================================
   DRAGGABLE SPLITTERS

   Mike, 2026-07-27, pointing at the sidebar edge and the strip edge:
   "these should be draggable."

   Each handle is its own grid track (see 02-layout.css), so a drag is just
   a CSS custom-property write — no absolute positioning, nothing to
   recompute when the window resizes, and the panes keep their own
   min-height:0 so they can still shrink.

   Two handles, three variables, because #splitH changes axis with the
   layout:
     --sideW   #splitV  sidebar width
     --padH    #splitH  pad/sequencer strip height (normal layout)
     --seqW    #splitH  droid column width (body.seqbig, droid docked right)

   The canvas is absolutely positioned and only resizes on a window event,
   so every drag has to call onResize() itself.
   ===================================================================== */
const SPLIT_DEFAULTS = { sideW:372, padH:258, seqW:null };   // seqW null = the CSS 34%
/* A minimum is a promise that the pane is still worth having at it, and
   these were not. Measured, at each old minimum:
     sideW 260  the sketch name overhung #side by 27px and read
                `Padawan360_mega_maestro_DYSV5W_PWM.` — 320 fits it (274px
                of text in a 24px-padded pane), and 02-layout.css puts an
                ellipsis on anything longer
     padH  120  #padsvg was 117×53 — a thumbnail of a controller, not a
                controller. At 200 it is 293×133 and readable again.
     seqW  260  seqW IS the stage in body.seqbig, so it takes the stage's
                own minimum below. */
const SPLIT_LIMITS = {
  sideW:{min:320, max:820},
  padH: {min:200, max:640},
  seqW: {min:320, max:900}
};
/* What the pane on the OTHER side of the handle needs, in the same layout
   px the variables are consumed in. A static max cannot know this: at
   1024×700 padH's 640 left a 17px stage — the HUD's DOME row hanging past
   the bottom edge and the orbit hint printed straight through the toolbar —
   and at 800×600 sideW's 820 is wider than the whole window, so the drag
   could take the stage to nothing.
   The stage needs ~102px for the HUD stack and ~36 for the bottom band
   before there is anywhere to put the droid; 320×220 is that with something
   left to look at. */
const SPLIT_ROOM = { stageW:320, stageH:220, stripW:360 };
/* the live limits for one handle: the static pair, tightened by whatever
   the layout can actually spare right now. clientWidth/clientHeight, never
   a client RECT — a rect is viewport px once applyUiScale() has zoomed the
   body, and --sideW/--padH/--seqW are read INSIDE that zoom. */
function splitRoom(name){
  const lim = SPLIT_LIMITS[name];
  const main = $('main'), left = $('left');
  let max = lim.max;
  if(name === 'sideW' && main && main.clientWidth)  max = Math.min(max, main.clientWidth  - 5 - SPLIT_ROOM.stageW);
  if(name === 'padH'  && left && left.clientHeight) max = Math.min(max, left.clientHeight - 5 - SPLIT_ROOM.stageH);
  if(name === 'seqW'  && left && left.clientWidth)  max = Math.min(max, left.clientWidth  - 5 - SPLIT_ROOM.stripW);
  /* a window too small for both panes still gets the minimum — one usable
     pane beats two useless ones */
  return { min: lim.min, max: Math.max(lim.min, max) };
}

/* A stored size is only a promise about the window it was stored in. --padH
   is a FIXED grid row and the stage takes what is left, so a 637px strip
   dragged out at 1440×900 leaves a 20px stage the moment the window is 700
   tall — the same wreck as the drag, reached without dragging anything. So
   the APPLIED value is fitted to the room there is now, while PREFS keeps
   the size the user actually chose: make the window big again and it comes
   back. splitFit() re-runs this on resize (initSplitters). */
function splitApply(){
  if(!PREFS.split) PREFS.split = {};
  const b = document.body;
  ['sideW','padH','seqW'].forEach(k=>{
    const v = PREFS.split[k];
    if(v){ const lim = splitRoom(k); b.style.setProperty('--'+k, Math.round(clamp(v, lim.min, lim.max))+'px'); }
    else   b.style.removeProperty('--'+k);
  });
}
function splitSet(name, px){
  const lim = splitRoom(name);
  if(!PREFS.split) PREFS.split = {};
  PREFS.split[name] = Math.round(clamp(px, lim.min, lim.max));
  splitApply();
}
function splitReset(name){
  if(PREFS.split) delete PREFS.split[name];
  splitApply(); prefsSave();
  if(typeof onResize === 'function') requestAnimationFrame(onResize);
  lg('sys','layout: '+name+' reset');
}

/* which variable this handle drives right now, and which way it reads */
function splitRole(id){
  if(id === 'splitV') return {name:'sideW', axis:'x', from:'right'};
  if(document.body.classList.contains('seqbig')) return {name:'seqW', axis:'x', from:'right'};
  return {name:'padH', axis:'y', from:'bottom'};
}

function bindSplitter(id){
  const h = $(id); if(!h) return;
  let raf = 0;
  h.addEventListener('pointerdown', e=>{
    if(e.button !== 0) return;
    const role = splitRole(id);
    const main = $('main').getBoundingClientRect();
    const left = $('left').getBoundingClientRect();
    h.setPointerCapture(e.pointerId);
    h.classList.add('drag');
    /* the handle sits BETWEEN the panes, so the size we are setting is the
       distance from the far edge to the pointer, less half the handle.

       AND IT IS MEASURED IN THE WRONG UNITS UNTIL WE DIVIDE. Everything on
       the right of this expression is a VIEWPORT px — a client rect, a
       pointer coordinate — while --sideW / --padH / --seqW are consumed by
       #main and #left INSIDE the subtree applyUiScale() has zoomed, so they
       are LAYOUT px. At 150% the edge therefore moved 1.5px for every 1px
       of pointer travel and the gap grew for as long as you dragged: with
       the pointer at x=788 the sidebar's edge sat at x=432. It also made
       the clamp meaningless — SPLIT_LIMITS.sideW.max = 820 was being
       compared against a number that was already 1.5× too big. Divide by
       the zoom here and the stored value, the limits and the CSS variable
       are all in one space (uiZoomFactor(), app/hud.js). */
    const move = ev=>{
      const z = uiZoomFactor();
      const px = ((role.axis === 'x')
        ? (role.name === 'sideW' ? main.right - ev.clientX : left.right - ev.clientX)
        : left.bottom - ev.clientY) / z;
      splitSet(role.name, px);
      if(!raf) raf = requestAnimationFrame(()=>{ raf = 0; if(typeof onResize === 'function') onResize(); });
    };
    const up = ev=>{
      h.classList.remove('drag');
      h.releasePointerCapture(e.pointerId);
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      prefsSave();
      if(typeof onResize === 'function') requestAnimationFrame(onResize);
      lg('sys','layout: '+role.name+' = '+PREFS.split[role.name]+'px');
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
    e.preventDefault();
  });
  h.addEventListener('dblclick', ()=>splitReset(splitRole(id).name));
}

function initSplitters(){
  splitApply();
  bindSplitter('splitV');
  bindSplitter('splitH');
  /* the room changes without anyone touching a handle. main.js binds the
     canvas's own resize; this one only re-fits the variables, then lets the
     canvas follow on the next frame. */
  window.addEventListener('resize', ()=>{
    splitApply();
    if(typeof onResize === 'function') requestAnimationFrame(onResize);
  });
}
