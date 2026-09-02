'use strict';
/* =====================================================================
   TOASTS — quiet actions answer back (Stage 3, M5a)

   Export, import, sound-pack loads: actions whose only confirmation used
   to be a Serial line or an inline status caption in a pane you may not
   even have open. toast(msg, kind) puts a small plate bottom-left over
   the stage — the .hudrow visual language: mono, tokened colours,
   translucent plate with backdrop blur, so body.light follows for free
   (styles in 08-import.css).

   Rules:
   - kind is 'ok' | 'warn' | 'err' (default 'ok') and only colours the
     plate's edge — a toast is a receipt, not an alarm.
   - at most THREE at once; a fourth pushes the oldest out immediately.
   - auto-dismisses after ~3.5 s of WALL clock, deliberately not
     SIM.millis: simulated time stalls behind wall time under load (and
     stops entirely while a blocking delay() holds the loop), and a
     receipt must never stick around because the sketch is busy.
   - click dismisses.
   - the HOST is pointer-events:none; only the plates themselves take the
     pointer, so the stage's orbit/select handling underneath never
     changes.
   - built on demand, host removed when the last plate goes, so nothing
     sits over the stage between toasts.

   NOT for high-frequency traffic: nothing per-frame, nothing
   per-serial-line — those belong to the console. One toast per user
   action.
   ===================================================================== */
const TOAST_MS  = 3500;   // wall-clock life of a plate
const TOAST_MAX = 3;      // plates on screen at once

/* WHERE THE HOST LIVES (v1.78.0, review L17). It was always a child of
   #stage, and #toasts is z 7 there — under every full-page overlay this app
   has (the setup wizard is z 120 and opaque, the bench 80, the import and
   build wizards 60). So a receipt fired from INSIDE one of them — the
   servo-import receipt with its dropped-field list, "Keeping the servo
   settings…" (config/wizard.js) — was drawn behind the overlay and expired
   there, unread. While uiModalOpen() (core/util.js) says an overlay is up,
   the host hangs off <body> instead, position:fixed at the same bottom-left
   offsets the stylesheet gives it, and at z 290: over every overlay and
   popover in the stack (07-startup.css, 08-import.css, 13-track-edit.css
   top out at 250) and deliberately UNDER the app dialog's 300, because a
   question being asked must not be covered by a receipt. Inline style, not
   a class, so the stylesheet's own #toasts rule keeps every other property.
   The decision is re-made on every toast: one host, re-parented as the
   overlay comes and goes, so plates already on it move with it rather than
   being split across two hosts. Otherwise it stays in the stage, where the
   chrome suite measures it. */
function toastHost(){
  let h = $('toasts');
  if(!h){ h = el('div'); h.id = 'toasts'; }
  const modal = typeof uiModalOpen === 'function' && uiModalOpen();
  const want = (modal ? null : $('stage')) || document.body;
  if(h.parentNode !== want) want.appendChild(h);
  h.style.position = modal ? 'fixed' : '';
  h.style.zIndex   = modal ? '290'   : '';
  return h;
}

function toastDrop(p){
  if(p._toastGone) return;
  p._toastGone = true;
  clearTimeout(p._toastTimer);
  p.classList.add('out');
  setTimeout(()=>{
    p.remove();
    const h = $('toasts');
    if(h && !h.childElementCount) h.remove();   // nothing lingers over the stage
  }, 180);
}

function toast(msg, kind){
  const k = (kind === 'warn' || kind === 'err') ? kind : 'ok';
  const host = toastHost();
  /* An evicted plate has to take its 3.5 s timer with it. This was a bare
     `.remove()`, which bypassed toastDrop() and left every pushed-out plate
     holding a live timeout on a node that was no longer in the document.
     Deliberately NOT a toastDrop() call: that fades for 180 ms before it
     removes anything, so the loop would never see childElementCount fall
     and would spin. Clear the timer by hand instead, and mark the plate
     dropped so a click or a stray toastDrop() on it is a no-op. */
  while(host.childElementCount >= TOAST_MAX){
    const old = host.firstElementChild;
    old._toastGone = true;
    clearTimeout(old._toastTimer);
    old.remove();
  }
  const p = el('div','toastp ' + k, String(msg));
  p.title = 'click to dismiss';
  p.addEventListener('click', ()=>toastDrop(p));
  host.appendChild(p);
  p._toastTimer = setTimeout(()=>toastDrop(p), TOAST_MS);
  return p;
}
