'use strict';
/* =====================================================================
   SERIAL LINK — Web Serial to a real board, shared by the sim and Studio

   Written for PCA Studio, moved here 2026-08-12 with the fold-in. Both
   apps load THIS file; everything host-specific goes through HW.

   Until this landed the sim touched no hardware at all — it modelled a
   droid beautifully and could not move one. Now the same drive slider,
   the same dial and the same sequence that move the model also move the
   servo, because the engine's onWrite goes down the wire.
   ===================================================================== */
/* ============================================================ WEB SERIAL
   3-byte frames to the PCA_Bridge sketch @115200:
     byte0 0x80|ch   byte1 ticks>>7   byte2 ticks&0x7F
   ticks 0..4096 = setPWM; 8191 = pulses OFF.

   TWO PROTOCOL WIDTHS, AND WHY THE APP HAS TO KNOW WHICH (v1.54.0).
   The header byte's high bit marks the frame. The old sketches read the
   channel out of only SIX of the remaining seven bits and spent 62 and 63
   on configuration, which capped live drive at 32 channels — two boards.
   The current sketches read all seven: channels 0..125 drive servos, 126
   is the oscillator and 127 the servo rate. Eight boards.

   This matters because the difference is INVISIBLE on the wire. Send
   channel 70 to an old board and it decodes 70 & 0x3F = 6 and moves a
   completely different servo — no error, no clue, just the wrong panel
   opening. So the width is decided by the BANNER, once, at connect:
   PCA-BRIDGE 2+ or MAESTRO-PCA 3+ is wide, anything else (including a
   board that would not identify itself) is narrow, and a channel the
   connected board cannot decode is DROPPED with one plain warning rather
   than sent somewhere it will do harm.

   Nothing needs re-flashing to keep working; re-flashing is what unlocks
   channels 32 and up. */
const SER = { port:null, writer:null, reader:null, q:[], flushing:false,
              lastTicks:{}, lastSpeed:{}, blocked:false, banner:'',
              /* narrow until a banner proves otherwise — the safe default,
                 because guessing wide at a v1 board misaddresses servos */
              wide:false, chMax:61, cfgOsc:62, cfgServo:63, warnedWide:false,
              /* WHICH board is on the other end. '' until something proves it.
                 'bridge'/'coproc'/'coproc-live' speak this file's own three-byte
                 frames; 'maestro' speaks Pololu's protocol (maestro-link.js) and
                 shares nothing with them but the port. */
              kind:'' };

/* SER.wide, and everything that follows from it, in one place so the
   encoder, the guard and the config frames can never disagree. */
function serialSetWidth(wide){
  SER.wide      = !!wide;
  SER.chMax     = wide ? 125 : 61;   /* highest servo channel this board decodes */
  SER.cfgOsc    = wide ? 126 : 62;
  SER.cfgServo  = wide ? 127 : 63;
  SER.warnedWide = false;
}
/* Read the width straight out of the banner. Kept separate from
   serialWhat() because "which sketch" and "how wide is its channel field"
   are different questions with different version thresholds. */
function serialBannerWide(){
  const b = /PCA-BRIDGE[^0-9]*(\d+)/i.exec(SER.banner);
  if(b) return +b[1] >= 2;
  const m = /MAESTRO-PCA[^0-9]*(\d+)/i.exec(SER.banner);
  if(m) return +m[1] >= 3;
  return false;
}

/* ------------------------------------------------- the link's own chrome
   v1.38.1. connect/disconnect used to poke `$('serialChip')`, `$('bConnect')`
   and `$('monPort')` directly, which quietly assumed the Bench TAB was
   rendered. It is not the only place you can be: the setup wizard's Channels
   step drives a real servo with the dial and now has a connect button of its
   own, and calling `serialConnect()` from there threw on the first
   `$('bConnect').textContent` — the port opened, then the code died before
   `serialRead()`, leaving a connected board nothing was listening to.

   So every surface REGISTERS itself and this repaints whichever of them
   happen to exist. Missing ones are skipped, which is the whole point. */
const SER_UI = [];
function serialUiRegister(fn){ if(SER_UI.indexOf(fn) < 0) SER_UI.push(fn); }
function serialUiSync(){
  const on = !!SER.port;
  const chip = $('serialChip');
  if(chip){ chip.textContent = on ? (SER.blocked?'monitor only':'hardware') : 'virtual';
            chip.classList.toggle('on', on); }
  const b = $('bConnect'); if(b) b.textContent = on ? '⚡ Disconnect' : '⚡ Connect hardware';
  const mp = $('monPort'); if(mp) mp.textContent = on ? '115200 8N1' : 'not connected';
  SER_UI.forEach(fn=>{ try{ fn(on); }catch(e){} });
}

/* ---- the monitor ---- */
const MON = { buf:'', lines:0 };
function monAppend(text, cls){
  const out = $('monOut');
  if(!out) return;
  const span = document.createElement('span');
  if(cls) span.className = cls;
  span.textContent = text;
  out.appendChild(span);
  /* keep it bounded — a chatty board would otherwise grow without limit */
  while(out.childNodes.length > 600) out.removeChild(out.firstChild);
  const fol = $('ckFollow');
  if(fol && fol.checked) out.scrollTop = out.scrollHeight;
}
function monShow(on){
  /* the monitor lives on the Bench tab, which is not necessarily rendered —
     the setup wizard can hold the port too (v1.38.1) */
  const sec = $('secMon'); if(!sec) return;
  sec.classList.toggle('hide', !on);
  const fol = $('ckFollow');
  if(on && fol && fol.checked){ const o=$('monOut'); if(o) o.scrollTop=o.scrollHeight; }
}
function monWarn(html){
  const w = $('monWarn'); if(!w) return;
  w.innerHTML = html || '';
  w.classList.toggle('on', !!html);
  /* v1.39.5: wired HERE, not by whoever set the html — #monWarn gets
     rebuilt out from under its buttons (hwLinkRender's re-render is one
     caller of several), so wiring lives with the markup instead of with
     whichever caller happened to write it first */
  const fs = $('bForceStream'), sm = $('bStayMon');
  if(fs) fs.onclick = ()=>serialSetMode('stream', '');
  if(sm) sm.onclick  = ()=>monWarn('Monitor only. Nothing is being streamed to the board.');
  const mz = $('bIsMaestro');
  if(mz) mz.onclick  = ()=>serialTryMaestro();
  /* v1.63.0 — the third board's way out, wired here for the reason the
     note above gives: #monWarn is rebuilt under its own buttons. */
  const gs = $('bGenSeqH');
  if(gs) gs.onclick  = ()=>{ if(typeof exportPcaHeader === 'function') exportPcaHeader(); };
  const mb = $('bMatchBoards');
  if(mb) mb.onclick  = ()=>serialAdoptBoardCount(serialBoardReport().driven.length);
  const mq = $('bMstQuiet');
  if(mq) mq.onclick  = ()=>{
    if(typeof mstrQuiet !== 'function') return;
    mstrQuiet(!MST.quiet);
    HW.say(MST.quiet
      ? 'the board\'s speed and acceleration are set to unlimited — the sim is shaping the moves now. A power cycle restores the board\'s own values.'
      /* NOT "the board's own values are back" (v1.62.0). mstrQuiet(false)
         writes what the SIM's channel table says, which is a different
         thing and used to be 0 on any generated table — so the message
         said "restored" while leaving every channel unlimited. Only a
         power cycle brings back what the board itself has stored. */
      : 'the speed and acceleration from your channel table have been written to the board. '
        + 'Only a power cycle brings back the board\'s own stored values.');
    if(typeof mstrReadoutSync === 'function') mstrReadoutSync();
  };
}

/* Read whatever the board says. Without this, connecting PCA Studio makes
   the board go silent from your point of view — and you cannot open the
   Arduino Serial Monitor at the same time, because only one program can
   hold the port. */
async function serialRead(){
  const dec = new TextDecoder();
  while(SER.port && SER.port.readable){
    try{
      SER.reader = SER.port.readable.getReader();
      for(;;){
        const {value, done} = await SER.reader.read();
        if(done) break;
        /* A Maestro answers in BINARY. Two bytes of position decoded as text
           are mojibake in the monitor AND gone from whoever asked for them,
           so the raw bytes go to the query plumbing first; the monitor only
           ever sees what nobody claimed. mstrRx() returns false when there is
           no Maestro and no pending query, which is every byte a sketch sends. */
        if(typeof mstrRx === 'function' && mstrRx(value)) continue;
        const text = dec.decode(value, {stream:true});
        SER.banner += text;
        if(SER.banner.length > 4000) SER.banner = SER.banner.slice(-2000);
        monAppend(text);
      }
    }catch(e){
      if(SER.port) monAppend('\n[read stopped: '+e.message+']\n','sys');
      break;
    }finally{
      try{ SER.reader.releaseLock(); }catch(e){}
      SER.reader = null;
    }
    if(!SER.port) break;
  }
  /* v1.39.5: an unplug must not leave the app claiming a link */
  if(SER.port) serialDisconnect();
}

const sleep = ms => new Promise(r=>setTimeout(r, ms));

/* Which sketch is on the board?
   Waiting for the power-up banner is not enough: unlike the Arduino IDE,
   Web Serial does not pulse DTR when it opens a port, so a board that was
   already running stays quiet and identifies as nothing. So do both —
   pulse DTR to force an AVR auto-reset, and if that yields nothing, ASK.
   '?' is the status key on BOTH sketches and is plain ASCII, so it cannot
   trip the co-processor's binary guard. */
function serialWhat(){
  /* MaestroReplacement version 2 and later share their USB port properly:
     the binary protocol has a frame state machine, so payload bytes can
     never be mistaken for console keypresses. Version 1 could not, so it
     stays monitor-only. */
  const m = /MAESTRO-PCA[^0-9]*(\d+)/i.exec(SER.banner);
  if(m) return (+m[1] >= 2) ? 'coproc-live' : 'coproc';
  if(/Maestro replacement/i.test(SER.banner)) return 'coproc';
  if(/PCA-BRIDGE|PCA bridge/i.test(SER.banner)) return 'bridge';
  return '';
}
/* =====================================================================
   WHAT THE BOARD SAYS IT IS DRIVING  (v1.63.0)

   Mike: "I setup three pca's and I was only able to configure the first two
   - all three where seen in the serial monitor."

   Both halves of that are true at once, and the board says so in plain words
   if anybody reads them. The BUS SCAN (v1.53.0) finds every PCA9685 on the
   wire and MaestroReplacement lists all of them — which is why all three
   showed up. What each one is FOR is a different question, and it is
   answered by `MPCA_CHANNELS` in the generated `sequences.h`, which is fixed
   when you flash. Generate that header on a two-board build, bolt on a
   third, and the sketch prints the third as:

       board 2 = 0x42   spare - live drive only, no slots use it

   Exactly two boards configured, all three seen. The remedy is to regenerate
   sequences.h and re-flash, and until now nothing in the app said so — the
   line was in the monitor among thirty others, phrased for somebody who
   already knew what MPCA_CHANNELS was.

   So the banner is parsed rather than skimmed. It was already being kept
   whole (SER.banner, 4000 chars) and read for one thing: the channel width.
   These are the rest of the facts in it. Both sketches are covered because
   both print a board list, in different words:

     MaestroReplacement    I2C: 3 PCA9685(s) on the bus
                             board 0 = 0x40   channels 0-15
                             board 2 = 0x42   spare - live drive only...
                           channels 32   slots 8
     PCA_Bridge              0x40  channels 0-15   FOUND

   Everything is optional: an older sketch, a Maestro or a board that never
   answered gives {} and every caller treats that as "no opinion", never as
   "no boards". */
function serialBoardReport(){
  const b = SER.banner || '';
  const out = {onBus:null, driven:[], spare:[], channels:null, slots:null};
  let m;
  /* --- MaestroReplacement ------------------------------------------- */
  if((m = /I2C:\s*(\d+)\s*PCA9685/i.exec(b))) out.onBus = +m[1];
  const mrDriven = /board\s+(\d+)\s*=\s*0x([0-9a-f]+)\s+channels\s+(\d+)\s*-\s*(\d+)/ig;
  while((m = mrDriven.exec(b))) out.driven.push({board:+m[1], addr:'0x'+m[2].toUpperCase(), from:+m[3], to:+m[4]});
  const mrSpare = /board\s+(\d+)\s*=\s*0x([0-9a-f]+)\s+spare/ig;
  while((m = mrSpare.exec(b))) out.spare.push({board:+m[1], addr:'0x'+m[2].toUpperCase()});
  if((m = /^\s*channels\s+(\d+)\s+slots\s+(\d+)/im.exec(b))){ out.channels = +m[1]; out.slots = +m[2]; }
  /* --- PCA_Bridge: no sequences.h, so everything it binds is driven --- */
  if(!out.driven.length){
    const brg = /0x([0-9a-f]+)\s+channels\s+(\d+)\s*-\s*(\d+)\s+FOUND/ig;
    while((m = brg.exec(b))) out.driven.push({board:out.driven.length, addr:'0x'+m[1].toUpperCase(), from:+m[2], to:+m[3]});
  }
  /* "N more board(s) on the bus than this sketch drives" — the only place a
     sketch older than its own bus limit says how many it left behind */
  if(out.onBus === null && (m = /(\d+)\s+more board\(s\) on the bus/i.exec(b)))
    out.onBus = out.driven.length + (+m[1]);
  if(out.onBus === null && (out.driven.length || out.spare.length))
    out.onBus = out.driven.length + out.spare.length;
  return out;
}
/* Is "use N expanders" an answer this build can even take? Only a shape that
   CARRIES a count (buildServoTopo().counted) — a Maestro build that happens to
   have a bridge plugged in for the bench is not a build with expanders, and
   `p0` is the mod2026 pair at two fixed addresses, which is not a count at
   all. Offering it there would be offering to break somebody's build. */
function serialCanAdoptBoards(){
  if(typeof buildGet !== 'function' || typeof buildServoTopo !== 'function') return false;
  const t = buildServoTopo(buildGet());
  return !!(t && t.counted);
}
/* Take the board's word for how many expanders there are. GROWS the channel
   table and never shrinks it — HW.trim() is a deliberate no-op for the reason
   it states, and this is the same rule: rows carry names, part mappings and
   endpoints measured against real linkage, and "the board only answered at
   three addresses today" is not a reason to delete row 40. A board that
   dropped off the bus must never cost you the calibration. */
function serialAdoptBoardCount(n){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  if(!serialCanAdoptBoards()) return false;
  n = Math.max(1, Math.min(PCA_MAX_BOARDS_UI, n|0));
  const was = HW.count();
  if(n * 16 <= was){
    HW.say('the build already has ' + was + ' channels — nothing to add', 'warn');
    return false;
  }
  buildSet('pcaBoards', n);
  /* buildApply(), NOT wizFinish(). wizFinish() is the wizard's EXIT: it marks
     the build done, closes the startup card and burns the once-ever first-run
     card, none of which anybody asked for by pressing "add the missing rows".
     buildSet() has already applied the build by the time we get here; what
     this wants is the re-derivation that follows it, which is buildApply()
     alone — the rest was an idiom copied out of the test suites. */
  if(typeof buildApply === 'function') buildApply();
  if(typeof buildEnsureMaestro === 'function') buildEnsureMaestro();
  HW.save();
  if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
  if(typeof boardVizSync === 'function') boardVizSync();
  /* the new rows arrive as Input, the same way rows nobody named have always
     arrived — an unused channel does not pulse. Say the next step rather than
     leaving sixteen inert rows and a satisfied-looking toast. */
  HW.say('build set to ' + n + ' PCA9685 expanders — ' + was + ' channels → ' + HW.count()
       + '. Nothing that was already there was changed. The new rows start as Input: set the '
       + 'Mode column to Servo on the ones you have wired.');
  if(typeof toast === 'function') toast(n + ' expanders — channels ' + was + '-' + (HW.count()-1) + ' are yours to name now');
  monWarn('');
  return true;
}
/* THE ONE SENTENCE MIKE NEEDED, said where he is standing rather than in the
   scrollback. Returns the html it showed, or '' when the board and the build
   agree — so a test can assert on it and a caller can decide whether to
   interrupt. Never guesses: an empty report says nothing at all. */
function serialBoardCheck(){
  const r = serialBoardReport();
  const have = (typeof HW !== 'undefined' && HW.count) ? HW.count() : 0;
  const bits = [];
  if(r.spare.length){
    bits.push('<b>' + r.spare.length + ' PCA9685' + (r.spare.length===1?' is':'s are')
      + ' on the bus that the flashed firmware does not animate</b> ('
      + r.spare.map(x=>x.addr).join(', ') + '). The channel count is baked into '
      + '<code>sequences.h</code> when you flash it, so a board added afterwards is found, '
      + 'woken and live-drivable — but no routine reaches it. '
      + '<b>Regenerate <code>sequences.h</code> and re-flash the co-processor</b> and it joins in. '
      /* the door, not just the instruction — exportPcaHeader() is the same
         button the Maestro tab carries, and being sent to go and find it is
         how a warning gets read and then ignored. Wired in monWarn(). */
      + '<button class="mini" id="bGenSeqH">generate sequences.h now</button>');
  }
  const driven = r.driven.length;
  if(r.onBus !== null && driven && r.onBus > driven + r.spare.length){
    bits.push('<b>' + (r.onBus - driven - r.spare.length) + ' board(s) on the bus that this sketch '
      + 'cannot drive at all.</b> Re-flash the current PCA_Bridge or MaestroReplacement — they reach eight.');
  }
  if(r.channels !== null && have && r.channels < have){
    bits.push('The flashed firmware drives <b>' + r.channels + ' channels</b>; this build has <b>'
      + have + '</b>. Channels ' + r.channels + '-' + (have-1) + ' will not move from a routine '
      + 'until <code>sequences.h</code> is regenerated and re-flashed.');
  }
  /* THE OTHER DIRECTION, and the commoner one by far (v1.64.0). Mike's own
     bridge, three boards, nothing wrong with any of it:

         0x40  channels 0-15   FOUND
         0x48  channels 16-31  FOUND
         0x50  channels 32-47  FOUND

     PCA_Bridge has no sequences.h — it binds everything it finds, so all
     three were live and pulsing. The BUILD still said two expanders, so the
     channel table had 32 rows and the third board had nowhere to be
     configured. "I was only able to configure the first two."

     v1.63.0 checked firmware-has-FEWER-than-build and was silent here, which
     is backwards: adding hardware and not telling the app is the thing people
     actually do. Nobody adds a board and then removes it from the build. */
  const top = driven ? Math.max.apply(null, r.driven.map(x=>x.to)) : -1;
  const boardCh = top + 1;
  if(boardCh > 0 && have && boardCh > have && serialCanAdoptBoards()){
    bits.push('The board is driving <b>' + boardCh + ' channels</b> across <b>' + driven
      + ' PCA9685' + (driven===1?'':'s') + '</b> (' + r.driven.map(x=>x.addr).join(', ')
      + '); this build has <b>' + have + '</b>. Channels ' + have + '-' + (boardCh-1)
      + ' are wired and pulsing, but there is no row to name or calibrate them on. '
      + '<button class="mini" id="bMatchBoards">use ' + driven + ' expanders</button>');
  }
  if(!bits.length) return '';
  const html = bits.join(' ');
  /* ADDED to whatever the mode already said, never instead of it — the
     mode message is why streaming is on or off, and this is about which
     boards answer. Losing either one to the other would be a worse
     monitor than the scrollback this replaces. */
  monWarn(((SER.modeWarn || '') + ' ' + html).trim());

  monAppend('[' + html.replace(/<[^>]+>/g,'') + ']\n', 'sys');
  HW.say(boardCh > have && have
    ? ('the connected board drives ' + boardCh + ' channels; this build has ' + have)
    : r.spare.length
    ? (r.spare.length + ' PCA9685(s) found on the bus but not in the flashed sequences.h — regenerate and re-flash')
    : 'the flashed firmware drives fewer channels than this build has', 'warn');
  if(typeof toast === 'function') toast(boardCh > have && have
    ? ('The board has ' + boardCh + ' channels, this build has ' + have + ' — see the Serial pane')
    : 'A board on the bus is not in the flashed firmware — see the Serial pane');
  return html;
}

async function serialIdentify(){
  SER.banner = '';
  monAppend('[identifying: resetting the board to hear its banner]\n','sys');
  try{
    await SER.port.setSignals({dataTerminalReady:false, requestToSend:false});
    await sleep(120);
    await SER.port.setSignals({dataTerminalReady:true,  requestToSend:true});
  }catch(e){
    monAppend('[this adapter will not toggle DTR — cannot reset it from here]\n','sys');
  }
  await sleep(1800);                       /* AVR bootloader, then the banner */
  if(serialWhat()) return serialWhat();

  monAppend('[no banner — asking with "?"]\n','sys');
  try{
    await SER.writer.write(new TextEncoder().encode('?'));
  }catch(e){}
  await sleep(900);
  return serialWhat();
}

async function serialSendText(t){
  if(!SER.writer || !t) return;
  monAppend(t + ($('ckNl').checked ? '\n' : ''), 'tx');
  const enc = new TextEncoder();
  try{ await SER.writer.write(enc.encode(t + ($('ckNl').checked ? '\n' : ''))); }
  catch(e){ monAppend('\n[write failed: '+e.message+']\n','sys'); }
}
async function serialConnect(){
  if(SER.port){ await serialDisconnect(); return; }
  if(!navigator.serial){ HW.say('Web Serial needs Chrome or Edge','err'); return; }
  try{
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:115200});
    SER.port=port; SER.writer=port.writable.getWriter();
    SER.lastTicks={}; SER.lastSpeed={}; SER.blocked=false; SER.banner='';
    serialSetWidth(false);              /* until a banner says otherwise */
    serialUiSync();
    monShow(true);
    monWarn('');
    monAppend('\n--- connected, listening ---\n','sys');
    serialRead();                       /* runs until disconnect */

    /* The co-processor's USB is a TEXT CONSOLE where single keys run
       slots, and the streamed protocol's payload bytes land in the
       '0'..'9' range constantly — so streaming at it fires sequences at
       random. Identify before sending anything binary. */
    const what = await serialIdentify();
    serialSetWidth(serialBannerWide());
    if(SER.wide) monAppend('[7-bit channels — up to 8 boards, 126 channels]\n','sys');
    else if(what) monAppend('[6-bit channels — this sketch decodes 0-61 only; '
                          + 're-flash for more than two boards]\n','sys');

    if(what === 'coproc-live'){
      serialSetMode('stream', 'Connected to the <b>MaestroReplacement</b> co-processor. '
        + 'Moving anything here takes the servos off the board — it stops animating while '
        + 'the PC drives. Run a slot (<code>0</code>-<code>9</code> below, or a button on the '
        + 'droid) to hand them back.');
      serialBoardCheck();
      return;
    }
    if(what === 'coproc'){
      serialSetMode('monitor', 'This is an <b>older MaestroReplacement (v1)</b>, which cannot share '
        + 'its USB port safely — back then a streamed payload byte could be mistaken for a '
        + 'console keypress and fire slots at random, so streaming is disabled. The monitor '
        + 'and send box still work (<code>?</code> status, <code>0</code>-<code>9</code> run a '
        + 'slot, <code>x</code> stop). <b>Re-flash the current MaestroReplacement</b> for live '
        + 'sliders, or use PCA_Bridge.');
      serialBoardCheck();
      return;
    }
    if(what === 'bridge'){
      serialSetMode('stream', '');
      serialBoardCheck();
      return;
    }
    /* Neither sketch answered — which is exactly what a real Pololu Maestro
       looks like, because a Maestro has no banner to print and does not
       answer '?'. So this is where the Maestro question gets asked.

       WHY IT IS ASKED HERE AND NOT FIRST. The Maestro's opening question is
       Get Errors, 0xA1 — and 0xA1 has its HIGH BIT SET, which to PCA_Bridge
       is a frame header: it would read channel 0x21, swallow the next two
       bytes as a position and MOVE A SERVO. There is no harmless probe for
       one that is not a live command to the other, so the text identify goes
       first always, and the binary question is only asked once a sketch has
       had its chance to answer and did not. */
    if(serialBuildIsMaestro()){
      monAppend('[no sketch answered, and this build is a Pololu Maestro — asking the board directly]\n','sys');
      if(await serialTryMaestro()) return;
    }
    /* Still nothing. Do not guess — streaming into the wrong sketch is what
       makes servos move on their own. Stay in monitor mode and let the user
       decide, with the Maestro now among the answers. */
    serialSetMode('monitor',
        '<b>The board did not identify itself.</b> It may not be running either sketch, or '
        + 'this adapter cannot reset it. Streaming is held OFF for now, because sending the '
        + 'position protocol to the wrong sketch makes servos move on their own. '
        + 'Try the reset button, or type <code>?</code> below and see what answers — '
        + 'then choose: <button class="mini" id="bForceStream">stream anyway (it is PCA_Bridge)</button> '
        + '<button class="mini" id="bIsMaestro">it is a Pololu Maestro</button> '
        + '<button class="mini" id="bStayMon">stay monitor-only</button>');
    /* the buttons above are wired by monWarn() itself now (v1.39.5) — it
       just wrote them, so it is the one place that can wire them and
       still be right after a re-render */
  }catch(e){ HW.say('serial: '+e.message,'err'); }
}
/* one place that decides whether we are streaming, so the chip, the
   warning bar and the guard can never disagree */
function serialSetMode(mode, warnHtml){
  SER.blocked = (mode !== 'stream');
  SER.modeWarn = warnHtml || '';
  serialUiSync();
  monWarn(warnHtml || '');
  if(!SER.blocked){
    SER.lastTicks = {};
    serialConfig();
    serialSyncAll();
    if(SER.kind === 'maestro'){
      monAppend('[Pololu Maestro — driving, and reading positions back]\n','sys');
      HW.say('Maestro connected — driving and reading back');
    }else{
      monAppend('[PCA_Bridge — streaming live positions]\n','sys');
      HW.say('bridge connected — streaming live positions');
    }
  }else{
    HW.say('monitor only — nothing is being streamed to the board','warn');
  }
}

async function serialDisconnect(){
  const port = SER.port;
  SER.port = null;                      /* stops the read loop re-arming */
  try{ if(SER.reader) await SER.reader.cancel(); }catch(e){}
  try{ if(SER.writer) SER.writer.releaseLock(); }catch(e){}
  try{ if(port) await port.close(); }catch(e){}
  SER.writer=null; SER.reader=null; SER.blocked=false;
  SER.kind='';
  /* the mode banner goes with the link it describes. hwLinkRender() ends with
     monWarn(SER.modeWarn) and runs on every setupRender() — so a message left
     standing here comes back on the next keystroke on the Channels step,
     saying "the board draws the ramps" beside a chip reading "No board" and
     offering buttons with nothing on the other end to press them at. */
  SER.modeWarn='';
  if(typeof mstrReset === 'function') mstrReset();
  serialUiSync();
  monWarn('');
  monAppend('\n--- disconnected ---\n','sys');
  HW.say('bridge disconnected — virtual only');
}
/* The one door out for anything that is NOT a three-byte frame — the
   Pololu protocol, which has its own lengths and its own replies. Port
   ownership stays here; maestro-link.js never touches SER.writer. */
function serialRaw(bytes){
  if(!SER.writer) return;
  const buf = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
  SER.writer.write(buf).catch(e=>{
    HW.say('serial write failed: '+e.message,'err');
    serialDisconnect();
  });
}
function serialFrame(ch, val){          /* val = 14-bit payload */
  if(!SER.writer) return;
  SER.q.push(0x80|(ch&0x7F), (val>>7)&0x7F, val&0x7F);
  if(!SER.flushing){
    SER.flushing=true;
    Promise.resolve().then(async()=>{
      const buf=new Uint8Array(SER.q); SER.q=[]; SER.flushing=false;
      try{ await SER.writer.write(buf); }
      catch(e){ HW.say('serial write failed: '+e.message,'err'); serialDisconnect(); }
    });
  }
}
function serialConfig(){
  if(SER.blocked) return;
  /* channels 126/127 are a PCA_Bridge idea. On a Maestro they are two
     perfectly valid Set Target commands aimed at channels that do not
     exist, which is a protocol error flag for nothing. */
  if(SER.kind === 'maestro') return;
  serialFrame(SER.cfgOsc,   Math.round(HW.osc()/10000));
  serialFrame(SER.cfgServo, HW.freq());
}
/* Change the servo refresh rate on a running board. The bridge sketch calls
   setPWMFreq() the moment this arrives, which reprograms the prescaler — so
   the outputs glitch for an instant. Everything is stopped first, because a
   glitch delivered to a servo mid-travel is a twitch you can hear.

   Why anyone would: resolution is the period ÷ 4096. At 50 Hz one count is
   4.88 µs, which at low speed settings is COARSER than the engine's own step
   (speed 5 moves 1.25 µs per tick), so the board holds a value for several
   ticks and then jumps a whole count — visible stepping that no amount of
   software smoothing can remove. 200 Hz makes a count 1.22 µs and the
   stepping goes away.

   Why anyone would not: most ANALOGUE servos are built for 50 Hz and will
   get hot, buzz, or refuse to hold at 200. Digital ones are usually fine.
   This is a per-rig experiment, not a default. */
function serialSetFreq(hz){
  hz = Math.max(40, Math.min(400, hz|0));
  if(SER.kind === 'maestro'){
    HW.say('the servo rate is a PCA9685 setting — a Maestro\'s period is its own, '
         + 'and this board is a Maestro', 'warn');
    return;
  }
  HW.setFreq(hz);
  HW.save();
  if(!SER.port || SER.blocked){ HW.say('servo rate set to '+hz+' Hz — takes effect when a board is connected'); return; }
  serialAllOff();
  SER.lastTicks = {};
  serialFrame(SER.cfgServo, hz);
  HW.say('servo rate → '+hz+' Hz · one PCA9685 count is now '
         + (1000000/hz/4096).toFixed(2) + ' µs. Everything was stopped first; drive a channel to wake it.');
}
/* stop pulsing everything, on the board and in the engine — used before any
   change that reprograms the PCA9685 underneath a moving servo */
function serialAllOff(){
  const E = HW.engine();
  E.channels.forEach((c,i)=>{ if(E.st[i] && E.st[i].servo) HW.drive(i, 0); });
}
/* v1.39.5: the tick period follows HW.freq() */
function serialTicksFor(qus){ return (qus==null) ? 8191 : pcaQusToTicks(qus, 1000000/HW.freq()); }
/* ===================================================== TWO BOARDS, TWO DOORS
   Does the board on the other end interpolate for ITSELF? (v1.66.2)

   A Pololu Maestro does. Speed and acceleration are its own, a Set Target
   starts a ramp it runs on the board, and it will draw that ramp whether or
   not anything else arrives — so the right traffic is ONE Set Speed and ONE
   Set Target per move, and then silence.

   PCA_Bridge does not, and deliberately: it computes board and pin and calls
   setPWM, with no position, no velocity and no stepping loop anywhere in the
   sketch. Its own header opens "The BROWSER runs …". So the right traffic
   there is the engine's 100 Hz stream — measured at 41 stepped positions for
   one full-throw move.

   The two therefore look completely different on the wire, and that is the
   correct answer rather than a compromise: each board is being asked for the
   thing it is good at. `serialWrite()` below is the STREAM; `serialMove()` is
   the PACED door. `mstrQuiet` picks between them on a Maestro — quiet means
   the board has been zeroed and the sim is shaping, which is the streamed
   case again. */
function serialPaces(){
  return SER.kind === 'maestro' && typeof MST !== 'undefined' && !MST.quiet;
}
/* THE PACED DOOR. Sending the speed the frame asked for is not optional and
   not free: a Maestro ramps at whatever speed it has STORED, so a 500 ms frame
   on a channel Mike tuned to 80 (a 1.1 s throw) overruns and the routine drifts
   further behind with every brick. Writing it is the only way the authored
   timing can land — and it is a RUNTIME write to a board he tuned by hand, so
   the Serial pane says so and a power cycle brings his numbers back. Pololu
   have no Get Speed, so it cannot be read first and put back afterwards.

   With no frame speed (a bench dial, a group action) the channel table's own
   goes down instead, which leaves the board in a state the sim can predict
   rather than whatever the last routine happened to need. */
function serialMove(ch, qus, speed){
  if(!SER.port || SER.blocked || !serialPaces()) return false;
  if(ch >= MST.chCount) return false;          /* serialWrite says so, once */
  const t  = (qus == null) ? 0 : (qus|0);
  const c  = (typeof MSTR !== 'undefined' && MSTR.channels) ? MSTR.channels[ch] : null;
  const sp = (speed > 0) ? (speed|0) : ((c && c.speed) | 0);
  if(SER.lastSpeed[ch] !== sp){ SER.lastSpeed[ch] = sp; mstrSetSpeed(ch, sp); }
  if(SER.lastTicks[ch] === t) return true;     /* spare the wire */
  SER.lastTicks[ch] = t;
  mstrSetTarget(ch, t);
  return true;
}
function serialWrite(ch, qus){          /* qus null = off */
  if(!SER.port || SER.blocked) return;
  /* ---- a real Pololu Maestro. Same unit, different envelope: the target
     IS quarter-µs, so there is nothing to convert. 0 means "stop pulsing"
     on a Maestro exactly as 8191 does on the bridge (0J40 §5.e). */
  if(SER.kind === 'maestro'){
    if(ch >= MST.chCount){
      if(!SER.warnedWide){
        SER.warnedWide = true;
        const msg = 'channel ' + ch + ' is not being sent: this Maestro has '
                  + MST.chCount + ' channels (0-' + (MST.chCount-1) + ')';
        HW.say(msg, 'warn');
        monAppend('[' + msg + ']\n','sys');
      }
      return;
    }
    const t = (qus == null) ? 0 : (qus|0);
    /* PACED: the board is drawing the ramp itself, so the engine's per-tick
       stream is NOT the door — serialMove() is, once per move. An OFF is the
       exception and still goes through here: "stop pulsing" is an event, not
       a position, and nothing else would ever send it. */
    if(serialPaces() && qus != null) return;
    if(SER.lastTicks[ch] === t) return;   /* spare the wire, as below */
    SER.lastTicks[ch] = t;
    mstrSetTarget(ch, t);
    return;
  }
  /* Above the connected board's ceiling: DROP it, do not fold it. The old
     mask would have turned channel 70 into channel 6 and moved the wrong
     servo silently. Said once, because this fires per frame. */
  if(ch > SER.chMax){
    if(!SER.warnedWide){
      SER.warnedWide = true;
      const msg = SER.wide
        ? ('channel ' + ch + ' is past 125 — the wire protocol tops out there '
           + '(126 and 127 carry the board configuration)')
        : ('channel ' + ch + ' is not being sent: this board is running the OLDER sketch, '
           + 'which only decodes channels 0-61 (two PCA9685s). Re-flash PCA_Bridge or '
           + 'MaestroReplacement to drive up to eight boards.');
      HW.say(msg, 'warn');
      monAppend('[' + msg + ']\n','sys');
    }
    return;
  }
  const ticks = serialTicksFor(qus);
  if(SER.lastTicks[ch]===ticks) return; /* spare the wire, like the AVR does */
  SER.lastTicks[ch]=ticks;
  serialFrame(ch, ticks);
}
function serialSyncAll(){
  const E = HW.engine();
  E.channels.forEach((c,i)=>{
    if(!E.st[i] || !E.st[i].servo) return;
    const qus = E.st[i].active ? pcaPos(E,i) : null;
    /* through whichever door this board uses — a resync on a paced Maestro
       must carry the channel's speed too, or the first move after connecting
       runs at whatever the board was last left with */
    if(serialPaces() && qus != null) serialMove(i, qus);
    else serialWrite(i, qus);
  });
}


/* ===================================================================== MAESTRO
   Does the BUILD say the board on the other end is a real Pololu Maestro?
   Only the four Pololu boards count: a MaestroPCA co-processor answers to
   `boardIsPca` and speaks this file's frames, not Pololu's protocol. PCA
   Studio has no Maestro in its catalogue at all, so this is false there and
   the whole path stays dark — which is what it should be. */
function serialBuildIsMaestro(){
  return typeof boardIsPca === 'function'
      && typeof MSTR !== 'undefined'
      && !boardIsPca(MSTR.board);
}
/* Ask the board Pololu's own question and, if it answers, become a Maestro
   link. Returns whether it did, so the connect flow can fall through to the
   "nothing identified" warning when it did not. */
async function serialTryMaestro(){
  if(typeof mstrProbe !== 'function' || !SER.port) return false;
  const ok = await mstrProbe();
  if(!ok){
    monAppend('[no answer to Get Errors — this is not a Maestro command port. '
            + 'If the board is in USB Chained mode, or you picked the TTL port '
            + 'of a Dual Port pair, neither will answer here]\n','sys');
    return false;
  }
  MST.on = true;
  MST.chCount = mstrChCount();
  SER.kind = 'maestro';
  SER.chMax = MST.chCount - 1;
  SER.warnedWide = false;
  const errs = mstrErrText(MST.err);
  monAppend('[Pololu Maestro on the command port — ' + MST.chCount + ' channels; '
          + (errs.length ? 'errors, now cleared: ' + errs.join(', ') : 'no errors') + ']\n','sys');
  serialSetMode('stream',
      'Connected to a <b>Pololu Maestro</b> over its USB command port, so the bench '
    + 'reads positions back and can tell you when the board <b>clamps</b> one. '
    + '<b>The port drives but it does not configure</b>: each channel\'s stored min, '
    + 'max, neutral, home and mode still come from Control Center. '
    + '<b>The board draws the ramps</b>, which is what a Maestro is for: each move goes out as one '
    + 'Set Speed and one Set Target, sized so it lasts exactly as long as the sequencer says. '
    + 'That <b>writes this channel table\'s speed to the board</b> as it goes — a runtime write, so '
    + 'a power cycle brings your own numbers back, and Pololu have no Get Speed for us to read them '
    + 'first. The board\'s <b>acceleration</b> is left alone and still shapes the ends of every move. '
    + 'Prefer the simulator to shape them instead, streaming positions the way the PCA bridge is '
    + 'driven? <button class="mini" id="bMstQuiet">let the sim shape the moves</button>');
  return true;
}
