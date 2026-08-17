'use strict';
/* =====================================================================
   SERVO HARDWARE — the sim's surface for the folded-in PCA Studio

   PCA Studio is a whole page: a channel table you drive, a link to a real
   board, and a setup wizard. The sim has no room for a whole page, and its
   sidebar panes are 300 px wide — a sixteen-column channel table does not
   go in a sidebar.

   So it gets an overlay, on the same furniture the import and build
   wizards already use (.iwrap / .iwcard), reached from the Bench. That is
   deliberate: Bench is "the Maestro workshop — the board, the outputs and
   the serial console", and this is the bench for the OTHER board.

   What is on it is not a copy of Studio. The table is literally Studio's
   table (src/js/maestro/hw-table.js) and the numbers it edits are
   MSTR.channels — the ones calibrated against real linkages. Driving a row
   moves the engine, the 3D droid, and the servo if one is plugged in.
   ===================================================================== */

function hwOpen(){
  const w = $('hwWrap'); if(!w) return;
  w.hidden = false;
  HW.rebuild(true);
  hwRender();
  hwTableSync();
}
function hwClose(){
  const w = $('hwWrap'); if(!w) return;
  w.hidden = true;
}
function hwIsOpen(){ const w = $('hwWrap'); return !!w && !w.hidden; }

function hwRender(){
  const w = $('hwWrap'); if(!w) return;
  const chans = HW.channels().filter(c=>c && /^servo/i.test(c.mode||''));
  const audit = (typeof pwAudit === 'function') ? pwAudit() : {warn:[], bad:[]};
  const chn = n=>n+' channel'+(n===1?'':'s');
  const flag = (audit.bad.length ? '<span class="pwflag bad">'+chn(audit.bad.length)+' outside 500–2500 µs</span>' : '')
             + (audit.warn.length ? '<span class="pwflag warn">'+chn(audit.warn.length)+' outside 1000–2000 µs</span>' : '');

  w.innerHTML = '<div class="iwcard hwcard"><div class="iwhead">'
    + '<h2>Servo hardware</h2>'
    + '<p class="iwsub">The channel table, live. Drag a <b>drive</b> slider and the bar beside it '
    + 'shows where that servo actually is — the model of the board if nothing is plugged in, the '
    + 'servo itself if something is. These are the same numbers the sequencer and '
    + '<code>sequences.h</code> use.</p>'
    + '<button class="iwx" data-hw="close" title="close">×</button>'
    + '</div>'
    + '<div class="iwbody hwbody">'
    + '<div id="hwLink"></div>'
    + '<div class="conbar hwbar">'
    + '<label class="sw"><input type="checkbox" id="hwOnlyUsed"'+(HWT.only==='used'?' checked':'')
    + '> only channels in use</label>'
    + '<span class="dim">'+chans.length+' of '+HW.count()+' channels</span>'
    + flag
    + '<span class="sp" style="flex:1"></span>'
    /* "Edit current servo config", not "Set up hardware" (Mike,
       2026-08-16) — it lands on the Channels step of a wizard whose first
       four questions were answered long ago, so on a build that HAS a
       config the old label promised a setup it was not going to run. */
    + '<button class="b prim" data-hw="setup" title="the channel table and the dial, on step 5 of the hardware wizard — your names, endpoints and mappings are already in it">'
    + (chans.length ? 'Edit current servo config…' : 'Set up hardware…') + '</button>'
    + '<button class="b" data-hw="allhome" title="drive every channel to its home">All home</button>'
    + '<button class="b danger" data-hw="alloff" title="stop pulsing every channel — everything goes limp">All off</button>'
    + '</div>'
    + '<div class="hwscroll"><table class="settab hwtab" id="hwTable"></table></div>'
    + '<div class="hint prose">Endpoints here are <b>yours</b> — they came from your <code>.mstr</code> '
    + 'or from the dial, and nothing in the sim rewrites them on its own. <b>release</b> and <b>ease</b> '
    + 'were exportable into <code>sequences.h</code> long before there was anywhere to set them; this is '
    + 'that place.</div>'
    + '</div></div>';

  hwTableBuild('hwTable');
  if(typeof hwLinkRender === 'function') hwLinkRender();

  w.onclick = e=>{
    const b = e.target.closest('[data-hw]'); if(!b) return;
    const a = b.dataset.hw;
    if(a === 'close') hwClose();
    if(a === 'setup'){ setupOpen(4); }      /* straight to Channels — the sim already knows its boards */
    if(a === 'allhome'){
      HW.channels().forEach((c,i)=>{ if(c && /^servo/i.test(c.mode||'') && c.home) HW.drive(i, c.home); });
      HW.say('every channel driven to its home');
    }
    if(a === 'alloff'){
      HW.channels().forEach((c,i)=>{ if(c && /^servo/i.test(c.mode||'')) HW.drive(i, 0); });
      HW.say('all pulses stopped — every servo is limp');
    }
  };
  const only = $('hwOnlyUsed');
  if(only) only.onchange = ()=>{ HWT.only = only.checked ? 'used' : 'all'; hwRender(); };
}

/* ------------------------------------------------------------- the link
   The shared serial module (serial-link.js) drives a fixed set of element
   ids — it was written against Studio's page furniture and moved here
   verbatim. Rather than rewrite 220 lines of working, hardware-tested code
   to take selectors as arguments, the sim renders the SAME ids inside the
   bench card. The module cannot tell which app it is in, which is the
   point. */
function hwLinkRender(){
  const host = $('hwLink'); if(!host) return;
  const on = (typeof SER !== 'undefined') && !!SER.port;
  /* v1.39.5: a re-render must not eat the monitor or the warn bar — this
     runs on every connect/mode-change sync, sometimes moments after
     serialConnect opened the monitor and put the force-stream/stay-monitor
     buttons in #monWarn, before the user got a chance to click either */
  const prevMonText = $('monOut') ? $('monOut').textContent : '';
  const monWasOpen = !!$('secMon') && !$('secMon').classList.contains('hide');
  host.innerHTML =
      '<div class="conbar hwlink">'
    + '<button class="b" id="bConnect">'+(on?'⚡ Disconnect':'⚡ Connect hardware')+'</button>'
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

  /* connect/disconnect both repaint this bar when they finish — the module
     updates the chip and the button text itself, so all this adds is the
     rest of the row */
  $('bConnect').onclick = async ()=>{
    if(SER.port) await serialDisconnect(); else await serialConnect();
    /* no hwLinkRender() here (v1.39.5) — the module already repaints via
       serialUiSync() → the registered callback below, and doing it again
       here was the second render that stomped the warn bar */
  };
  /* ...and repaint when the link changes from somewhere else — the setup
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
