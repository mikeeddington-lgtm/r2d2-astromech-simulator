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
const SPLIT_LIMITS = {
  sideW:{min:260, max:820},
  padH: {min:120, max:640},
  seqW: {min:260, max:900}
};

function splitApply(){
  if(!PREFS.split) PREFS.split = {};
  const b = document.body;
  ['sideW','padH','seqW'].forEach(k=>{
    const v = PREFS.split[k];
    if(v) b.style.setProperty('--'+k, v+'px');
    else  b.style.removeProperty('--'+k);
  });
}
function splitSet(name, px){
  const lim = SPLIT_LIMITS[name];
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
}
