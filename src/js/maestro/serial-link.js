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
     byte0 0x80|ch(0..63)   byte1 ticks>>7   byte2 ticks&0x7F
   ticks 0..4096 = setPWM; 8191 = pulses OFF.
   ch62 payload = oscillator Hz / 10000; ch63 payload = servo Hz. */
const SER = { port:null, writer:null, reader:null, q:[], flushing:false,
              lastTicks:{}, blocked:false, banner:'' };

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
    SER.lastTicks={}; SER.blocked=false; SER.banner='';
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

    if(what === 'coproc-live'){
      serialSetMode('stream', 'Connected to the <b>MaestroReplacement</b> co-processor. '
        + 'Moving anything here takes the servos off the board — it stops animating while '
        + 'the PC drives. Run a slot (<code>0</code>-<code>9</code> below, or a button on the '
        + 'droid) to hand them back.');
      return;
    }
    if(what === 'coproc'){
      serialSetMode('monitor', 'This is an <b>older MaestroReplacement (v1)</b>, which cannot share '
        + 'its USB port safely — back then a streamed payload byte could be mistaken for a '
        + 'console keypress and fire slots at random, so streaming is disabled. The monitor '
        + 'and send box still work (<code>?</code> status, <code>0</code>-<code>9</code> run a '
        + 'slot, <code>x</code> stop). <b>Re-flash the current MaestroReplacement</b> for live '
        + 'sliders, or use PCA_Bridge.');
      return;
    }
    if(what === 'bridge'){
      serialSetMode('stream', '');
      return;
    }
    /* Neither answered. Do not guess — streaming into the wrong sketch is
       what makes servos move on their own. Stay in monitor mode and let
       the user decide. */
    serialSetMode('monitor',
        '<b>The board did not identify itself.</b> It may not be running either sketch, or '
        + 'this adapter cannot reset it. Streaming is held OFF for now, because sending the '
        + 'position protocol to the wrong sketch makes servos move on their own. '
        + 'Try the reset button, or type <code>?</code> below and see what answers — '
        + 'then choose: <button class="mini" id="bForceStream">stream anyway (it is PCA_Bridge)</button> '
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
    monAppend('[PCA_Bridge — streaming live positions]\n','sys');
    HW.say('bridge connected — streaming live positions');
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
  serialUiSync();
  monWarn('');
  monAppend('\n--- disconnected ---\n','sys');
  HW.say('bridge disconnected — virtual only');
}
function serialFrame(ch, val){          /* val = 14-bit payload */
  if(!SER.writer) return;
  SER.q.push(0x80|(ch&63), (val>>7)&0x7F, val&0x7F);
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
  serialFrame(62, Math.round(HW.osc()/10000));
  serialFrame(63, HW.freq());
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
  HW.setFreq(hz);
  HW.save();
  if(!SER.port || SER.blocked){ HW.say('servo rate set to '+hz+' Hz — takes effect when a board is connected'); return; }
  serialAllOff();
  SER.lastTicks = {};
  serialFrame(63, hz);
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
function serialWrite(ch, qus){          /* qus null = off */
  if(!SER.port || SER.blocked || ch>61) return;
  const ticks = serialTicksFor(qus);
  if(SER.lastTicks[ch]===ticks) return; /* spare the wire, like the AVR does */
  SER.lastTicks[ch]=ticks;
  serialFrame(ch, ticks);
}
function serialSyncAll(){
  const E = HW.engine();
  E.channels.forEach((c,i)=>{ if(E.st[i] && E.st[i].servo) serialWrite(i, E.st[i].active?pcaPos(E,i):null); });
}
