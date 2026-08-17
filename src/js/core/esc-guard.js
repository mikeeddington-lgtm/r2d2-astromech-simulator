'use strict';
/* =====================================================================
   ESC GUARD — one Escape pattern, six overlays (2.3, 2026-08-15
   code-quality review).

   The dome map, the import wizard, the builder workspace, the hw bench
   and the track editor each hand-rolled the same document-CAPTURE
   keydown listener: yield if something above them (an appConfirm/
   appPrompt .dlgwrap, a nested overlay) owns the key, otherwise
   preventDefault + stopPropagation — so a swallowed Esc can never fall
   through to the gamepad mapper or a plainer layer underneath — and
   close. The startup wizard's Esc is the same shape wearing a different
   binding style: installed once at load rather than per open/close.

   escGuard(isOpen, close) covers both:
     isOpen()  — true when THIS handler should act on the Escape. Fold
                 in whatever "something above me wins" checks the site
                 needs (.dlgwrap, a sibling overlay's wrap element, its
                 own open flag) — escGuard does not assume any of that,
                 because the six sites don't all need the same checks.
     close()   — called once isOpen() is true. Free to itself decide to
                 do nothing (the startup wizard's true-first-run swallow)
                 or to act on a nested state instead of closing outright
                 (the hw bench's calibration-dial cancel).

   Returns {bind, unbind, handler}:
     bind()/unbind()  — document.addEventListener/removeEventListener
                         the pair most call sites want, one on open and
                         the other on close.
     handler          — the raw listener function, for a call site that
                         needs to fold Esc handling into a keydown
                         listener of its own (the track editor also
                         stops propagation on every OTHER key, not just
                         Escape, to keep typing out of the pad mapper).

   Every call site keeps deciding its own isOpen/close — this only lifts
   out the "is it Escape, is it mine to take, contain it, act" shape
   that was identical six times over.

   ------------------------------------------------- why its own file
   Split out of core/dialog.js on 2026-08-16. It lived beside appConfirm
   because that is where it was written, and the two have nothing to do
   with each other: appConfirm is a dialog, this is four lines of keyboard
   containment. That accident of filing broke PCA STUDIO — Studio loads
   maestro/setup-hw.js (the shared six-step wizard) but not
   core/dialog.js, so `setupOpen()` threw ReferenceError on `escGuard`
   and Studio's hardware wizard could not be opened at all. It had been
   failing at that line since the wizard was shared, unnoticed, because
   Studio's smoke test is not in ./test.sh.

   A helper that a SHARED module depends on has to be as shared as the
   module is. It is in both manifests now. */

function escGuard(isOpen, close){
  function onKey(e){
    if(e.key !== 'Escape') return;
    if(!isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }
  return {
    handler: onKey,
    bind(){ document.addEventListener('keydown', onKey, true); },
    unbind(){ document.removeEventListener('keydown', onKey, true); }
  };
}
