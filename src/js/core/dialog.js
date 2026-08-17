'use strict';
/* =====================================================================
   APP CONFIRM — the styled replacement for window.confirm().

   Q7 of the 2026-07-30 UI review: six actions asked their question
   through the browser's native confirm(), which looks like a fault next
   to an interface that styles everything else. appConfirm() asks the
   same question in the app's own voice and returns a Promise<boolean>,
   so a call site converts from   if(!confirm(x)) return;
   to                            if(!await appConfirm(x, {...})) return;
   and keeps its exact behaviour on cancel.

   One overlay, built on demand and removed when answered. Esc and a
   click on the backdrop are Cancel; Enter is Confirm (the confirm
   button also takes focus, so the keyboard default is the affirmative,
   same as the native dialog). danger:true gives the confirm button the
   red treatment for destructive actions — Reset and the channel steals.

   Clicks inside the overlay are stopped from reaching the page: the
   channel picker closes itself on any document click, and "Cancel" has
   to leave it open, exactly as the blocking native dialog did.

   Styles live in 08-import.css with the other overlays — tokens only,
   so body.light follows for free.
   ===================================================================== */

function appConfirm(message, opts){
  const o = opts || {};
  return new Promise(resolve=>{
    /* one question at a time — a new one cancels a stale one */
    const old = document.querySelector('.dlgwrap');
    if(old && old._dlgCancel) old._dlgCancel();

    const wrap = el('div','dlgwrap');
    const card = el('div','dlgcard'+(o.danger ? ' danger' : '')+(o.cls ? ' '+o.cls : ''));
    card.appendChild(el('h4',null, o.title || 'Are you sure?'));
    /* text by default — a message built from a file name or a channel name
       must never be able to inject markup. `html:true` is opt-in, for the
       call sites that write their own sentence and want a word of it bold
       (v1.39.0: the live-drive warning, where "jump, not a ramp" is the
       part somebody skim-reading has to see). */
    const msg = el('div','dlgmsg');
    if(o.html) msg.innerHTML = message || ''; else msg.textContent = message || '';
    card.appendChild(msg);
    const bar  = el('div','dlgbar');
    /* `no:''` means there IS no second answer — a message with an OK, not a
       question. It used to fall through to `|| 'Cancel'` and put a Cancel
       button on an error report, which asks the reader to decide something
       there is nothing to decide (v1.44.0). Esc and a click outside still
       resolve false, so nothing that awaits this can hang. */
    const oneWay = (o.no === '');
    const bNo  = oneWay ? null : el('button','b dlgno', o.no || 'Cancel');
    const bYes = el('button','b dlgyes', o.yes || 'OK');
    if(bNo) bar.appendChild(bNo);
    bar.appendChild(bYes);
    card.appendChild(bar);
    wrap.appendChild(card);

    const settle = v=>{
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(v);
    };
    wrap._dlgCancel = ()=>settle(false);

    const onKey = e=>{
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); settle(false); }
      else if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); settle(true); }
    };
    document.addEventListener('keydown', onKey, true);

    /* nothing leaks through to the page underneath */
    ['pointerdown','pointerup','click'].forEach(t=>
      wrap.addEventListener(t, e=>e.stopPropagation()));
    wrap.addEventListener('click', e=>{ if(e.target === wrap) settle(false); });
    if(bNo) bNo.addEventListener('click', ()=>settle(false));
    bYes.addEventListener('click', ()=>settle(true));

    document.body.appendChild(wrap);
    bYes.focus();
  });
}

/* =====================================================================
   APP PROMPT — the styled replacement for window.prompt()  (Stage 3, M5c)

   appPrompt(message, {title, value, placeholder, yes, no}) resolves the
   typed string on confirm and NULL on cancel — exactly prompt()'s
   contract, so every call site keeps its own empty-string-vs-null
   handling (several treat '' as "keep the old name" on purpose).

   Same overlay and the same keydown containment as appConfirm above:
   Enter confirms, Esc cancels, both intercepted on document CAPTURE with
   stopPropagation — otherwise Enter would reach the gamepad mapper and
   ARM THE FEET. Every OTHER key is also stopped from propagating past
   the dialog (the default action still types into the field), so a
   letter typed into a name can never drive the virtual pad, even if
   focus has strayed off the input. The input opens focused with its
   value preselected, matching the native prompt's type-to-replace feel.

   password:true (v1.28.0, for Sim only) swaps the field to type=password
   and drops the preselect — there is nothing to type over, and selecting
   an existing value in a masked field only invites overtyping it blind.
   Everything else, including the Enter/Esc containment, is unchanged:
   sim-only's unlock prompt sits over a LIVE pad, so a stray keystroke
   reaching the mapper would arm the feet under a stranger's hands.
   ===================================================================== */
function appPrompt(message, opts){
  const o = opts || {};
  return new Promise(resolve=>{
    /* one question at a time — a new one cancels a stale one */
    const old = document.querySelector('.dlgwrap');
    if(old && old._dlgCancel) old._dlgCancel();

    const wrap = el('div','dlgwrap');
    const card = el('div','dlgcard');
    card.appendChild(el('h4',null, o.title || 'Type a name'));
    if(message) card.appendChild(el('div','dlgmsg', message));
    const inp = document.createElement('input');
    inp.type = o.password ? 'password' : 'text'; inp.className = 'dlginp';
    inp.value = (o.value !== undefined && o.value !== null) ? String(o.value) : '';
    if(o.placeholder) inp.placeholder = o.placeholder;
    card.appendChild(inp);
    const bar  = el('div','dlgbar');
    const bNo  = el('button','b dlgno',  o.no  || 'Cancel');
    const bYes = el('button','b dlgyes', o.yes || 'OK');
    bar.appendChild(bNo); bar.appendChild(bYes);
    card.appendChild(bar);
    wrap.appendChild(card);

    const settle = v=>{
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(v);
    };
    wrap._dlgCancel = ()=>settle(null);

    const onKey = e=>{
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); settle(null); }
      else if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); settle(inp.value); }
      else e.stopPropagation();   // typing still lands (default action), the mapper never hears it
    };
    document.addEventListener('keydown', onKey, true);

    /* nothing leaks through to the page underneath */
    ['pointerdown','pointerup','click'].forEach(t=>
      wrap.addEventListener(t, e=>e.stopPropagation()));
    wrap.addEventListener('click', e=>{ if(e.target === wrap) settle(null); });
    bNo.addEventListener('click', ()=>settle(null));
    bYes.addEventListener('click', ()=>settle(inp.value));

    document.body.appendChild(wrap);
    inp.focus();
    if(!o.password) inp.select();
  });
}
