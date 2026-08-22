'use strict';
/* =====================================================================
   THE BUILDER'S MANUAL — one URL, four doors (v1.57.0)

   Mike: "make the manual really prominent on the sim."

   The manual is twenty-one chapters with eight screen-capture clips in it,
   and it is a SEPARATE 5 MB file (docs/manual/, built by
   docs/manual/src/build.py). It is not inlined here on purpose: the
   simulator is already 8 MB, the clips in the manual are captured FROM a
   built simulator — so bundling it would mean building this file twice —
   and a manual attached to the release is always the current one, while an
   inlined copy would go stale the moment either half moved. That is the
   same reasoning that keeps R2D2-Simulator.html itself out of the repo.

   So this file owns ONE constant and the four places that open it. The
   constant is the point: four hardcoded copies of a URL is four things to
   forget when the repository moves, and the one that gets forgotten is
   always the one somebody actually clicks.

   WHERE THE FOUR DOORS ARE, and why each one:
     · the HEADER — beside ? and Menu, visible from every tab, every
       workspace, all the time. The prominent one.
     · the SETUP screen's head — beside light/dark, so it is on every one
       of the fifteen steps rather than only the first. Somebody stuck on
       question six is exactly who needs it.
     · the LEARN tab — where a person who has decided they need help goes.
     · the ? panel — where a person mid-task goes for a lookup.

   THE KIOSK. Sim only hides the header buttons in CSS, and this one is a
   sibling of #btnKbd so it goes with them. manualOpen() carries the guard
   as well, because this file's own rule everywhere else is guard the
   FUNCTION, not the button — a public terminal at a con should not have a
   door out to a browser tab.
   ===================================================================== */

/* The release download, not a blob or a tree path: `releases/latest`
   always resolves to the manual built alongside whatever simulator the
   person is running, and it is the same URL README.md hands out. */
const MANUAL_URL = 'https://github.com/mikeeddington-lgtm/r2d2-astromech-simulator'
                 + '/releases/latest/download/R2D2-Simulator-Manual.html';
const MANUAL_FILE = 'R2D2-Simulator-Manual.html';

/* =====================================================================
   THE BLANK TAB (v1.71.1)

   A workshop walkthrough: click 📖 MANUAL, a tab opens, and it never
   resolves. No error, no fallback, nothing said in the app — and the
   biggest, bluest button on the first panel a new user reads is the one
   that did it. The catch above could never have caught it: window.open()
   only throws when the browser refuses to open a tab at all, which is rare.
   The common failure is the opposite shape — the tab opens PERFECTLY and
   then cannot LOAD, because the machine is offline or GitHub is
   unreachable. That is a garage with no wifi, which is exactly where a
   builder is standing, and this file is the app's only documentation.

   WHAT CAN ACTUALLY BE PROBED FROM HERE — measured, not assumed. This page
   is usually opened from file://, so its origin is `null`:

     fetch(MANUAL_URL, {method:'HEAD'})            TypeError, always.
       CORS. github.com sends no Access-Control-Allow-Origin for a null
       origin, so the response is refused before we can read anything from
       it. It fails identically online and off — worthless as a probe, and
       the obvious thing to have reached for.
     new Image().src = …/favicon.ico                onerror, even online.
       Not an image by the time the redirects finish. Worthless too.
     fetch(MANUAL_URL, {method:'HEAD', mode:'no-cors'})     THE ONE.
       no-cors asks for no readable response, so nothing is refused: an
       OPAQUE response comes back when the request reached GitHub, and a
       TypeError when the network did not carry it. We cannot read the
       status — a 404 looks like a 200 — but reachability is the question,
       and HEAD means the 5 MB body is never fetched.

   So the shape is: open the tab on the click (synchronously — a popup
   blocker only trusts a window.open inside the user's own gesture, and the
   probe is far too slow to wait for), and probe ALONGSIDE it. If the probe
   says the manual is not there, say so IN THE APP.

   WHY A DIALOG and not a toast. The new tab takes focus. A 3.5 s plate
   bottom-left of a window the user is no longer looking at is a message
   nobody reads — the same silence in a different costume. The dialog is
   still there when they come back from the blank tab, which is the moment
   the answer is wanted. The toast is kept for the two cases where it is
   honest: when the answer is a shrug (nothing to probe with, or the probe
   never came back), and when a modal is already up and must not be stolen.

   A PROBE IS NOT PROOF, so it never blocks the tab: no-cors cannot see a
   404, a corporate proxy can answer for GitHub, and navigator.onLine is a
   famous liar in both directions. Everything here only ever ADDS a voice.
   ===================================================================== */
const MANUAL_PROBE_MS = 8000;    // ms — past this the answer is "no answer", not "no manual"

/* true = reached it, false = definitely did not, null = could not tell. */
function manualReach(){
  /* the cheap certainty first: a machine that knows it has no network needs
     no round trip. Only trusted in the negative — onLine true means little
     more than "a cable is in". */
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(false);
  if(typeof fetch !== 'function') return Promise.resolve(null);
  return new Promise(resolve=>{
    let done = false;
    const settle = v=>{ if(!done){ done = true; resolve(v); } };
    setTimeout(()=>settle(null), MANUAL_PROBE_MS);
    fetch(MANUAL_URL, {method:'HEAD', mode:'no-cors', cache:'no-store'})
      .then(()=>settle(true), ()=>settle(false));
  });
}

/* What to do about it, which is the half a bare error message leaves out:
   the manual is a separate file on the Releases page, and one download
   while you still have a connection makes it yours for good. */
function manualSayUnreachable(sure){
  const what = sure
    ? 'That tab is blank because this machine cannot reach GitHub right now. '
    : 'If that tab is blank, this machine cannot reach GitHub. ';
  const todo = 'The manual is not inside the simulator — it is a separate page on the '
             + 'Releases page, and it needs a connection at the moment you click. '
             + 'Next time you are online, download ' + MANUAL_FILE + ' once and keep it beside '
             + 'this file: it is one self-contained page and it opens offline for ever after.';
  if(typeof lg === 'function') lg('warn', 'the builder’s manual could not be reached — ' + MANUAL_URL);
  /* One question at a time is appConfirm()'s own rule — a new one CANCELS a
     stale one — and this arrives on a timer the user did not start, so it is
     the one thing here that could take something away: an answer they were
     halfway through giving. If a card is already up, this waits its turn as
     a toast instead. The setup overlay is deliberately not in that test:
     .dlgwrap is z-index 300 against #startup's 120, so door 2's message is
     seen rather than buried under the wizard it was clicked from. */
  if(sure && !document.querySelector('.dlgwrap') && typeof appConfirm === 'function'){
    appConfirm(what + todo + '\n\n' + MANUAL_URL,
               {title:'The manual lives online', yes:'Close', no:''});
  }else if(typeof toast === 'function'){
    toast(what + todo + ' — ' + MANUAL_URL, 'warn');
  }
}

function manualOpen(){
  if(typeof kioskOn === 'function' && kioskOn()){
    if(typeof toast === 'function') toast('sim only — leave it first', 'warn');
    return false;
  }
  if(typeof lg === 'function') lg('sys', 'opening the builder’s manual — ' + MANUAL_URL);
  try{
    window.open(MANUAL_URL, '_blank', 'noopener,noreferrer');
  }catch(e){
    /* a browser that refuses window.open from a file:// page is a real
       possibility, and a button that silently does nothing is worse than
       one that tells you what to type. Say the URL. */
    if(typeof toast === 'function') toast('could not open a tab — the manual is at ' + MANUAL_URL, 'warn');
    return false;
  }
  /* and then the failure the catch above cannot see. Deliberately not
     awaited: the click is answered by the tab opening, and this file's
     callers (four buttons and chrome.test.js) all read a plain boolean. */
  manualReach().then(r=>{ if(r !== true) manualSayUnreachable(r === false); });
  return true;
}

/* the button, wherever it goes. `cls` picks up the host's own button
   styling (hbtn in the header, b elsewhere) so this never has to know what
   a button looks like in four places. */
function manualButton(cls, label){
  const b = document.createElement('button');
  b.className = cls || 'b';
  b.textContent = label || '📖 Manual';
  /* the connection caveat used to be small print in the Controls sidebar
     only — which is not where the header button is, and the header is the
     one three of the four doors' users never open a panel to find. Every
     door carries it now, in the one string all four already share. */
  b.title = 'The builder’s manual — twenty-one chapters and eight clips, on getting a real droid '
          + 'moving with this. Opens ' + MANUAL_FILE + ' from the latest release, so it needs a '
          + 'connection at the moment you click — download it once to keep it offline.';
  b.addEventListener('click', manualOpen);
  return b;
}

/* the block form — a heading, a line of prose and the button — for the
   three panes that have room for it. One function so the three cannot
   drift into three different descriptions of the same document. */
function manualCard(host, opts){
  const o = opts || {};
  const s = (typeof sect === 'function' && o.section !== false)
    ? sect(host, 'The builder’s manual', '21 chapters · 8 clips')
    : host;
  const p = el('div', 'hint prose');
  p.innerHTML = o.blurb || ('Everything this simulator is for, written for somebody with a half-built droid: '
    + 'the nine setup questions, <b>the servo bench</b> to try a sequence on, finding your servo end stops, '
    + 'bricks, getting it onto the board, and what to do when nothing moves. '
    + 'It opens in a new tab from the latest release.');
  s.appendChild(p);
  const bar = el('div', 'conbar');
  const b = manualButton('b prim', '📖 Open the manual');
  b.id = o.id || '';
  bar.appendChild(b);
  s.appendChild(bar);
  if(o.note !== false){
    const n = el('div', 'hint dim',
      'Needs a connection at the moment you click. Keep ' + MANUAL_FILE + ' beside this file '
      + 'if you want it offline — it is one self-contained page too.');
    s.appendChild(n);
  }
  return s;
}

/* door 1 — the header. Bound once at boot from app/main.js, next to the
   other header buttons, so it survives every pane rebuild. */
function manualInstallHeader(){
  const kbd = (typeof $ === 'function') ? $('btnKbd') : null;
  if(!kbd || !kbd.parentNode || document.getElementById('btnManual')) return;
  const b = manualButton('hbtn', '📖 Manual');
  b.id = 'btnManual';
  kbd.parentNode.insertBefore(b, kbd);
  return b;
}
