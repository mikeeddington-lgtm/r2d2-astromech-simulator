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
  return true;
}

/* the button, wherever it goes. `cls` picks up the host's own button
   styling (hbtn in the header, b elsewhere) so this never has to know what
   a button looks like in four places. */
function manualButton(cls, label){
  const b = document.createElement('button');
  b.className = cls || 'b';
  b.textContent = label || '📖 Manual';
  b.title = 'The builder’s manual — twenty-one chapters and eight clips, on getting a real droid '
          + 'moving with this. Opens ' + MANUAL_FILE + ' from the latest release.';
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
    + 'the nine setup questions, <b>a rack of servos</b> to try a sequence on, finding your servo end stops, '
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
