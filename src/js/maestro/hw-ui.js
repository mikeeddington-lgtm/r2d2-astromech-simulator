'use strict';
/* =====================================================================
   SERVO HARDWARE — the sim's doors onto the bench, and the header chip

   HISTORY, because the shape of this file is the story of it. PCA Studio is
   a whole page: a channel table you drive, a link to a real board, and a
   setup wizard. The sim has no room for a whole page, so when Studio was
   folded in (2026-08-12) it got TWO surfaces instead of one — a "Servo
   hardware" overlay (#hwWrap) with the live table and the serial console,
   and the six-step setup wizard (#setupWrap) with the channel table and the
   dial. Both edited MSTR.channels. Both had a connect button. Both called
   themselves the bench, and each had one thing the other did not.

   v1.45.0. Mike: "Remove or merge the duplicated Servo Bench into Servo
   Setup." He chose fold it in, so this file no longer draws a surface: the
   bench IS the setup wizard's Channels step, and there is exactly one place
   a channel is configured. What #hwWrap had and #setupWrap did not has gone
   ACROSS rather than away —

     · the live drive slider, position bar, µs readout and quick moves are
       three columns on the shared channel table now (setup-hw-channels.js);
     · the board link row and the serial monitor are still drawn HERE, by
       hwLinkRender() below, into a #hwLink host the Channels step puts up
       when the host has one to fill. They cannot move into the shared file:
       serial-link.js binds a fixed set of element ids (bConnect, serialChip,
       secMon, monOut …) and PCA Studio's own PAGE already carries every one
       of them, so a shared copy would be two elements with one id in one of
       the two apps;
     · "all home" and "all off" are two buttons on the step's own drive row.

   What is left in this file is the three doors (hwOpen / hwClose /
   hwIsOpen — other modules ask whether a hardware surface is open and a
   door and its guards are one feature), the link row, and the header chip.
   ===================================================================== */

/* Which step IS the bench. By key, not by the number 4 — the step list is
   allowed to grow and this is the one place that has to be right. */
function hwBenchStep(){
  const i = (typeof SETUP_STEPS !== 'undefined')
    ? SETUP_STEPS.findIndex(s=>s.key === 'channels') : -1;
  return i >= 0 ? i : 4;
}
/* The door. #bHw in the Bench pane calls this, and so does anything else
   that used to mean "show me the servo hardware": it lands on the bench's
   Channels step, where the names, endpoints, mappings and the dial are. */
function hwOpen(step){
  if(typeof setupOpen !== 'function') return;
  setupOpen(typeof step === 'number' ? step : hwBenchStep());
}
function hwClose(){
  if(typeof SETUP !== 'undefined' && SETUP.open && typeof setupClose === 'function') setupClose();
}
/* Kept honest rather than kept around: util.js's uiModalOpen(), hw-host.js's
   HW.applied() and the sounds suite all ask this, and after the fold-in the
   truthful answer is "is the bench open", not "is a div called hwWrap
   showing". */
function hwIsOpen(){ return typeof SETUP !== 'undefined' && !!SETUP.open; }
/* HW.applied() repaints whatever hardware surface is up. That is the bench's
   own render now. */
function hwRender(){ if(hwIsOpen() && typeof setupRender === 'function') setupRender(); }

/* WHOSE PORT IS IT? (v1.45.0 — see setupExitHardware in setup-hw.js)
   In the sim the link exists for this bench: the dial's whole premise is a
   real servo on the end of it, and leaving the bench with the port open is
   how you forget a connected droid. So the sim answers yes, and closing the
   bench disarms and disconnects. PCA Studio does not define this at all —
   its port belongs to its page, whose header holds the connect button and
   whose monitor outlives any overlay. */
function hwSetupOwnsLink(){ return true; }

/* ------------------------------------------------------------- the link
   The shared serial module (serial-link.js) drives a fixed set of element
   ids — it was written against Studio's page furniture and moved here
   verbatim. Rather than rewrite 220 lines of working, hardware-tested code
   to take selectors as arguments, the sim renders the SAME ids inside the
   bench card. The module cannot tell which app it is in, which is the
   point.

   v1.45.0: the host it fills is #hwLink on the bench's Channels step
   (setup-hw-channels.js), not the overlay this file used to draw. It stays
   in a SIM-ONLY file precisely because of those fixed ids — Studio's page
   already has every one of them, and a shared copy would duplicate them. */
function hwLinkRender(){
  const host = $('hwLink'); if(!host) return;
  const on = (typeof SER !== 'undefined') && !!SER.port;
  /* v1.39.5: a re-render must not eat the monitor or the warn bar — this
     runs on every connect/mode-change sync, sometimes moments after
     serialConnect opened the monitor and put the force-stream/stay-monitor
     buttons in #monWarn, before the user got a chance to click either */
  const prevMonText = $('monOut') ? $('monOut').textContent : '';
  const monWasOpen = !!$('secMon') && !$('secMon').classList.contains('hide');
  /* v1.45.0: no connect button here. The step's own #bSetConnect is two
     lines above this row with the sentence that says what the dial is
     actually moving, and one card with two ⚡ Connect buttons in it is the
     duplication the fold-in was for. `bConnect` is Studio's page furniture
     and serialUiSync() skips it when it is absent — which it now is, here. */
  host.innerHTML =
      '<div class="conbar hwlink">'
    + '<span class="chip" id="serialChip">'+(on ? (SER.blocked?'monitor only':'hardware') : 'virtual')+'</span>'
    + '<button class="b" id="bMon">Serial monitor</button>'
    + '<span class="dim" id="monPort">'+(on?'115200 8N1':'not connected')+'</span>'
    + '<label class="sw" title="Servo refresh rate — and the only lever on the PCA9685\u2019s output resolution: one count is the period \u00f7 4096. Most DIGITAL servos take 200 Hz; most analogue ones do not.">rate '
    + '<input type="number" id="hwFreq" min="40" max="400" step="10" value="'+HW.freq()+'" style="width:64px"> Hz</label>'
    + '<span class="dim">1 count = '+(1000000/HW.freq()/4096).toFixed(2)+' µs</span>'
    + '<span class="sp" style="flex:1"></span>'
    + '<span class="dim">a bridge sketch turns this page into the droid\u2019s control surface</span>'
    + '</div>'
    + '<div id="secMon" class="hwmon hide">'
    + '<div class="conbar">'
    + '<label class="sw"><input type="checkbox" id="ckFollow" checked> follow</label>'
    + '<label class="sw"><input type="checkbox" id="ckNl" checked> newline</label>'
    + '<button class="b" id="bMonClear">clear</button>'
    + '<button class="b" id="bMonHide">hide</button>'
    + '</div>'
    + '<div id="monWarn"></div>'
    + '<pre id="monOut"></pre>'
    + '<div class="conbar">'
    + '<input type="text" id="monIn" placeholder="send to the board — ? for status, x to stop, 0-9 to run a slot">'
    + '<button class="b" id="bMonSend">send</button>'
    + '</div></div>';

  /* connect and disconnect belong to #bSetConnect above this row now
     (setupBindLink, v1.45.0). This bar only has to FOLLOW the link, which
     it does through the registry below — and deliberately not by calling
     hwLinkRender() from a click handler, which was the second render that
     stomped the warn bar (v1.39.5).
     ...so: repaint when the link changes from somewhere else — the setup
     wizard's Channels step can open and close the same port (v1.38.1).
     A NAMED function, so serialUiRegister's dedupe-by-identity actually
     works — an anonymous closure here registered a fresh copy on every
     render and never matched, so the callback list only ever grew
     (v1.39.5; see setup-hw.js's setupLinkSync / live-drive.js for the
     same pattern). */
  if(typeof serialUiRegister === 'function') serialUiRegister(hwLinkSyncCb);
  $('hwFreq').onchange  = e=>{ serialSetFreq(+e.target.value|0); hwLinkRender(); };
  $('bMon').onclick     = ()=>monShow($('secMon').classList.contains('hide'));
  $('bMonHide').onclick = ()=>monShow(false);
  $('bMonClear').onclick= ()=>{ $('monOut').textContent=''; };
  $('bMonSend').onclick = ()=>{ serialSendText($('monIn').value); $('monIn').value=''; };
  $('monIn').onkeydown  = e=>{ if(e.key==='Enter'){ serialSendText($('monIn').value); $('monIn').value=''; } };

  /* restore what the rebuild above just wiped: the transcript, whether the
     monitor was open, and whatever warning (with its buttons — monWarn()
     wires them itself now) was showing */
  const mo = $('monOut'); if(mo) mo.textContent = prevMonText;
  if(typeof monWarn === 'function' && typeof SER !== 'undefined') monWarn(SER.modeWarn);
  if(monWasOpen) monShow(true);
}
/* v1.39.5: hoisted so serialUiRegister(hwLinkSyncCb) always registers the
   SAME function object — dedupe by identity only works on a named,
   module-scope function, not a closure created fresh per render */
function hwLinkSyncCb(){ if($('hwLink')) hwLinkRender(); }

/* ===================================================================== 
   THE LINK CHIP — the board's state, on the main screen (v1.43.0)

   Mike: "on the ain screen add teh box that allos connection /
   disconnection and show the status of the connection to the PCA bridge".

   Both doors onto the serial link were behind a full-page overlay: the
   Servo hardware bench and the setup wizard's Channels step. So the one
   question you ask constantly while a droid is on the bench — *is it
   plugged in and listening?* — could only be answered by opening a tool
   you did not otherwise want open, and connecting meant the same trip.

   It is a header chip, not a bar, because that is where this app already
   answers "what state is the hardware in" (pad, drive, automation, speed).
   Everything it knows comes from serial-link.js, and it repaints through
   the same serialUiRegister registry as every other surface — so
   connecting from the bench lights this up, and unplugging the cable
   clears it, with no polling.
   ===================================================================== */
function linkChipText(){
  if(typeof SER === 'undefined' || !SER.port) return {cls:'', text:'No board'};
  if(SER.blocked) return {cls:'warn', text:'Monitor only'};
  return {cls:'on', text:'Board linked'};
}
function linkChipSync(){
  const e = (typeof $ === 'function') ? $('chLink') : null;
  if(!e || !e.lastElementChild) return;
  const s = linkChipText();
  e.className = 'chip clickable' + (s.cls ? ' ' + s.cls : '');
  e.lastElementChild.textContent = s.text;
  /* the title is FIXED, not a mirror of the text — it says what a click
     does, which the text cannot (main.js's syncChipTitles leaves #chLink
     out for the same reason it leaves #chDrive out) */
  e.title = (typeof SER !== 'undefined' && SER.port)
    ? 'Connected to a board running PCA_Bridge. Click to disconnect — the servos hold their last position.'
    : 'No board. Click to open a USB serial port to the PCA bridge (Chrome or Edge, over USB).';
}
function linkChipInit(){
  const e = (typeof $ === 'function') ? $('chLink') : null;
  if(!e) return;
  e.addEventListener('click', async ()=>{
    if(typeof SER === 'undefined' || typeof serialConnect !== 'function'){
      if(typeof toast === 'function') toast('no serial layer in this build');
      return;
    }
    /* Web Serial is Chromium-only and needs a user gesture — this IS the
       gesture. serialConnect() puts its own failure on the log and the
       chip repaints itself either way through the registry below. */
    if(SER.port) await serialDisconnect(); else await serialConnect();
  });
  if(typeof serialUiRegister === 'function') serialUiRegister(linkChipSync);
  linkChipSync();
}
