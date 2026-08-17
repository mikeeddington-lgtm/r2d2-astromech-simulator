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

function toastHost(){
  let h = $('toasts');
  if(!h){
    h = el('div'); h.id = 'toasts';
    ($('stage') || document.body).appendChild(h);
  }
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
  while(host.childElementCount >= TOAST_MAX) host.firstElementChild.remove();
  const p = el('div','toastp ' + k, String(msg));
  p.title = 'click to dismiss';
  p.addEventListener('click', ()=>toastDrop(p));
  host.appendChild(p);
  p._toastTimer = setTimeout(()=>toastDrop(p), TOAST_MS);
  return p;
}
