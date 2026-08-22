'use strict';
/* =====================================================================
   "?" — THE KEYBOARD SHORTCUTS OVERLAY (Stage 3, M7c)

   Shift+/ summons a full-screen reference card of every key the sim
   listens for; ? or Esc dismisses it. It is display, not control —
   nothing in it rebinds anything.

   Rules it obeys:

   - The driving table HARDCODES the same map the pad strip's legend
     shows (#padside in body.html) and gamepad.js implements. Mirroring
     the strip's markup at runtime would tie a reference card to the
     strip's layout; if KEYMAP/AXISKEYS ever change, change both tables.

   - '?' respects the key mapper's own exemption (gamepad.js): a key
     pressed while typing in an input/textarea/select belongs to the
     field, not to us. Unlike the mapper, a focused BUTTON does not
     block it — Tab parks focus on buttons and '?' types nothing there.

   - It never opens over a surface that owns the keyboard — the confirm
     dialog, plus whatever uiModalOpen() names (the setup wizard, the
     servo bench, the import wizard, Build your Maestro, the job chooser,
     the track builder) — because two things answering the same Esc is
     how containment bugs start. And when one is raised UNDER the card
     anyway, Esc stops IMMEDIATELY here: see kbdHelpOpen().

   - While open, Esc and ? are CONTAINED: document capture +
     stopPropagation, the app-dialog pattern (core/dialog.js). Every
     other key falls through on purpose — the card describes the
     driving keys, so holding W to feel what it does while reading is
     allowed. Same philosophy as the click-blur in main.js: the
     keyboard keeps driving the droid.

   - Built on demand and REMOVED on close (the stage-picker rule), so a
     closed overlay cannot sit over anyone's pointer handling.

   kbdHelpToggle() is the public entry for a future header "?" button
   (body.html belongs to another agent this stage).
   ===================================================================== */

const KBD = { open:false, wrap:null, onKey:null };

/* one column per key family; a key spec is space-separated caps and a
   '+' inside a token renders as a chord (Ctrl+Z) */
const KBD_COLS = [
  {h:'Driving — the pad', rows:[
    ['Left stick',      'W A S D'],
    ['Right stick',     'I J K L'],
    ['D-pad',           '↑ ↓ ← →'],
    ['LB / RB',         'Q E'],
    ['LT / RT',         'Z C'],
    ['A / B / X / Y',   'Spc B V Y'],
    ['Start / Back',    '↵ N'],
    ['L3 / R3',         'R F'],
    ['Guide',           'G']
  ]},
  {h:'Sequencer', rows:[
    ['Undo',            'Ctrl+Z'],
    ['Redo',            'Ctrl+Y']
  ]},
  {h:'App', rows:[
    ['This card — open or close',        '?'],
    ['Close dialog · menu · picker',     'Esc'],
    ['Close the setup (once configured)','Esc'],
    ['Deselect the picked part',         'Esc']
  ]}
];

function kbdKeycaps(spec){
  const span = el('span');
  spec.split(' ').forEach(tok=>{
    tok.split('+').forEach((k,j)=>{
      if(j) span.appendChild(document.createTextNode('+'));
      span.appendChild(el('kbd',null,k));
    });
  });
  return span;
}

/* a surface that owns the keyboard is up — '?' stays out of its way.

   This hand-rolled four of the checks, and the copy drifted: it never
   learned the servo bench (#setupWrap) or the job chooser (#jobWiz), both
   of which uiModalOpen() (core/util.js) has enumerated since v1.45.0. The
   bench is the one that hurt — #kbdHelp is z-index 250 against its 80, so
   the card drew over a live channel table, and the Esc that dismissed it
   also reached setupEsc and put the hardware down. Asking the one function
   that owns the question is the only version that stays true: track-edit.js
   even WRAPS uiModalOpen() to fold the track builder in, which a private
   copy here could never see. `typeof` because a host may load this file
   without core/util.js, and .dlgwrap stays because uiModalOpen() answers
   for full-page surfaces and says nothing about the app dialog. */
function kbdHelpBlocked(){
  if(document.querySelector('.dlgwrap')) return true;                        // confirm dialog
  return typeof uiModalOpen === 'function' && uiModalOpen();
}

function kbdHelpOpen(){
  if(KBD.open) return;
  const wrap = el('div'); wrap.id = 'kbdHelp';
  const card = el('div','kovcard');
  card.appendChild(el('h4',null,'Keyboard shortcuts'));
  const cols = el('div','kovcols');
  KBD_COLS.forEach(c=>{
    const col = el('div','kovcol');
    col.appendChild(el('h5',null,c.h));
    c.rows.forEach(([lab,keys])=>{
      const row = el('div','kbrow');
      row.appendChild(el('span',null,lab));
      row.appendChild(kbdKeycaps(keys));
      col.appendChild(row);
    });
    cols.appendChild(col);
  });
  card.appendChild(cols);
  card.appendChild(el('div','hint kovfoot',
    'Esc or ? closes · sticks are held keys, buttons are taps · plug a real pad in and the on-screen one mirrors it'));
  wrap.appendChild(card);

  /* containment: Esc and ? are ours while the card is up; everything
     else still reaches the page (the driving keys keep driving) */
  KBD.onKey = e=>{
    if(e.key !== 'Escape' && e.key !== '?') return;
    /* stopIMMEDIATEPropagation, not stopPropagation. The overlays that own
       Esc — setupEsc on the servo bench above all — listen on this same
       document node in this same capture phase, and stopPropagation only
       keeps the event from the NEXT node: a listener co-registered here
       still runs. That is how one Esc closed the card AND hung up on the
       board. Blocking the card over those surfaces (kbdHelpBlocked) shuts
       the ordinary door, but nothing traps focus while the card is up, so
       a control underneath can still raise one UNDER it — and then the
       card is the topmost thing, and the key is the card's alone. */
    e.preventDefault(); e.stopImmediatePropagation();
    kbdHelpClose();
  };
  document.addEventListener('keydown', KBD.onKey, true);
  /* nothing leaks through to the page underneath (the dialog rule) */
  ['pointerdown','pointerup','click'].forEach(t=>
    wrap.addEventListener(t, e=>e.stopPropagation()));
  wrap.addEventListener('click', e=>{ if(e.target === wrap) kbdHelpClose(); });

  document.body.appendChild(wrap);
  KBD.open = true; KBD.wrap = wrap;
}

function kbdHelpClose(){
  if(!KBD.open) return;
  document.removeEventListener('keydown', KBD.onKey, true);
  if(KBD.wrap) KBD.wrap.remove();
  KBD.open = false; KBD.wrap = null; KBD.onKey = null;
}

function kbdHelpToggle(){
  if(KBD.open) kbdHelpClose();
  else if(!kbdHelpBlocked()) kbdHelpOpen();
}

window.addEventListener('keydown', e=>{
  if(e.key !== '?') return;
  if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;   // typing, not asking
  if(e.target && e.target.isContentEditable) return;
  if(KBD.open) return;               // the capture handler above owns the close
  if(kbdHelpBlocked()) return;
  e.preventDefault();
  kbdHelpOpen();
});
