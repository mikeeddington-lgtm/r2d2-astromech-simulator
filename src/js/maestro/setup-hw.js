'use strict';
/* =====================================================================
   SETUP-HW — the six-step servo hardware wizard, and the dial

   Written for PCA Studio and moved here 2026-08-12 when Mike asked for the
   fold-in: "we should move all functionalty over but maintain both". One
   copy, two apps, everything host-specific through the HW seam
   (src/js/maestro/hw-host.js).

   In Studio it configures PROJ. In the sim it configures MSTR — the real
   droid's channels, calibrated against real linkages. That is deliberate
   and it is the whole point of the dial: the numbers it captures are the
   numbers sequences.h ships with.
   ===================================================================== */
/* =====================================================================
   SETUP — the wizard that builds a project from your actual hardware

   Mike, 2026-08-11: "we now need to build an initial setup screen … firstly
   it should ask for the components … include a wiring diagram … we should
   then offer the correct IDE sketch … the user should then be able to select
   which channels are in use and name them and set the same settings as the
   Maestro … for the end points we should use a large Dial with three buttons
   underneath Min / Center / Max."

   Six steps, and the last one is the point of the other five: a channel
   table with the same columns Pololu's Control Center has, filled in against
   a real servo on a real linkage rather than typed from a datasheet.

   THE CALIBRATION RULE. The dial drives the servo LIVE, and Min / Center /
   Max capture wherever it currently is. That is the only way to find an
   endpoint on a printed droid — you turn it until the panel is where you
   want it and record that number; you do not know it in advance. Two
   consequences:

     · While the dial is out, the channel's working range is opened to the
       sweep limit, because pcaSetTarget() clamps to min/max and a channel
       whose endpoints are still the defaults could not be moved past them.
       The old range is restored if you cancel.
     · The sweep limit starts CONSERVATIVE (1000–2000 µs) and unlocking the
       full 500–2500 µs is a deliberate second action. A horn driven into a
       hard stop at full travel is how you strip a gear, and the whole point
       of this screen is that there is a real linkage on the other end.

   Reversed linkages need no "invert" flag either — there is a REVERSE button
   that swaps the two ends, which is the whole of what reversing means. Nothing
   downstream cares which way round the pair is: it all takes Math.min and
   Math.max of it. One button, no concept.
   ===================================================================== */

const SETUP = {
  open:false, step:0,
  /* the answers */
  hw: null,
  /* calibration */
  cal: null,      /* {ch, saveMin, saveMax, saveHome, min, max, home, wide} */
  /* the dome map panel on the Channels step (v1.45.0) — null when shut.
     Its own state, not config/wizard.js's DMAP: that file is not loaded in
     PCA Studio, and one global namespace means one name per idea. */
  dome: null,     /* {open, hover} */
  sel: 0,
  pick: [],       /* channels ticked in the left-hand column, for apply-to-selected */
  ask: null,      /* the inline confirm strip: {msg, yes, fn, where} */
  apField: 'speed', apVal: undefined,
  /* ------------------------------------------------------ ADVANCED (v1.37.0)
     Mike: "make it a very simple wizzard with advance options hidden unless
     they tick an advance box", and when asked what should hide: "just the
     risky ones". So this is not a beginner mode — nothing is dumbed down and
     nothing is taken away. It hides the two controls that can damage
     hardware or invalidate a calibration you have already done:

       · the full 500–2500 µs sweep unlock — a horn driven into a hard stop
         at full travel strips its gears, quietly, in seconds;
       · the servo pulse frequency — an analogue servo fed 300 Hz gets hot.

     Everything else stays exactly where it was, because everything else is
     just the job. Each hidden control leaves a line saying what it is set to
     and where the tick is, so nobody is left wondering where it went. */
  adv: false,
  /* Where this was opened FROM, so Finish can go back there (v1.38.0). The
     bench is reachable two ways — the Bench tab, and the setup wizard's
     Servo setup step — and a full-page tool that dumps you somewhere else
     when you finish is a tool you stop trusting. */
  from: null
};
function setupAdv(){ return !!SETUP.adv; }
/* Has the measured travel been written to a file since it was last changed?
   Finish asks, because an hour of calibration that exists only in one
   browser's localStorage is an hour you are going to do again. */
function setupExported(){ return !!SETUP.exportedAt && SETUP.exportedAt >= (SETUP.changedAt || 0); }
function setupTouched(){ SETUP.changedAt = (SETUP.changedAt || 0) + 1; }

/* IS THERE ANYTHING HERE WORTH A FILE? (v1.38.3)

   Mike, having named and ticked four channels and walked out without being
   asked: "It didnt prompt me to save config when id finished."

   The old gate asked a narrower question — "has any channel got travel that
   differs from the default?" — and answered no, because he had set the
   channels up but had not yet been round the dial. That is precisely the
   session most worth saving: the naming and the mode picking is the fiddly
   part, and it was about to be thrown away silently.

   So the question is now "did somebody do work here", and four things count
   as work: a channel captured on the dial, a channel named something other
   than its number, travel that is not the factory pair, or any edit at all
   this session. An untouched table straight out of the profile still says
   nothing, because nagging about a file nobody has changed is how people
   learn to click through dialogs without reading them. */
function setupSaveWorth(){
  const used = (typeof HW !== 'undefined' && HW.channels)
    ? HW.channels().filter(c=>c && /^servo/i.test(c.mode)) : [];
  const cal   = used.filter(c=>c.calibrated).length;
  const named = used.filter(c=>c.name && !/^(channel\s*)?\d+$/i.test(String(c.name).trim())).length;
  const trav  = setupHasTravel();
  return {used:used.length, cal:cal, named:named, travel:trav,
          worth: !!(used.length && (cal || named || trav || (SETUP.changedAt || 0) > 0))};
}

const SETUP_STEPS = [
  {key:'board',    label:'Controller'},
  {key:'expander', label:'PCA9685s'},
  {key:'wiring',   label:'Wiring'},
  {key:'sketch',   label:'Sketch'},
  {key:'channels', label:'Channels'},
  {key:'done',     label:'Finish'}
];

/* ------------------------------------------------------- the hardware
   Only what changes an answer downstream: the I2C pins to draw, whether
   there is a spare hardware UART for the droid link (which decides between
   the two sketches without asking twice), and the 5 V rail's honesty. */
const SETUP_MCUS = [
  {id:'nano',   label:'Arduino Nano',       sda:'A4', scl:'A5', uarts:1, v3:false,
   note:'The £4 board this route was designed around. One UART, so the droid link uses SoftwareSerial on pins 8/9 — fine here, because this board generates no PWM itself.'},
  {id:'uno',    label:'Arduino Uno',        sda:'A4', scl:'A5', uarts:1, v3:false,
   note:'Same chip as the Nano in a bigger package. Identical wiring.'},
  {id:'mega',   label:'Arduino Mega 2560',  sda:'20', scl:'21', uarts:4, v3:false,
   note:'Four hardware UARTs, so the droid link can be a real Serial1 instead of SoftwareSerial. Overkill as a co-processor, but it is what most people already have on the bench.'},
  {id:'megaadk',label:'Arduino Mega ADK',   sda:'20', scl:'21', uarts:4, v3:false,
   note:'A Mega with the USB host on board — the Padawan host board. Use it as the HOST and give the servos their own co-processor.'},
  {id:'esp32',  label:'ESP32',              sda:'21', scl:'22', uarts:3, v3:true,
   note:'3.3 V logic. The PCA9685 reads 3.3 V as a valid high, so it works — but power the board from 5 V and never feed 5 V back into an ESP32 pin.'}
];
function setupMcu(id){ return SETUP_MCUS.find(m=>m.id===(id||SETUP.hw.mcu)) || SETUP_MCUS[0]; }

/* The BUILD answers this if it has a co-processor (v1.33.0) — `servoMcu`
   and the expander count are build questions now, and `buildSyncBench()`
   writes them straight into HW.setup(). Reading them here as the DEFAULT
   closes the other direction: a bench opened before the build was saved,
   or an HW.setup() wiped by a profile reload, still starts from what the
   droid actually is rather than from a guess. Same shape as `hwDefault()`
   reading the servo answers for PREFS.hw. */
function setupDefaults(){
  let mcu = 'nano', boards = 2;
  if(typeof buildUsesCoproc === 'function' && buildUsesCoproc()){
    mcu = servoMcuOpt().id;
    boards = buildCoprocBoards('dome') || buildCoprocBoards('body') || boards;
  }
  return {
    mcu:mcu,
    boards:boards,
    chain:'daisy',        /* daisy | star  — how the I2C/expander headers run */
    power:'shared',       /* shared | perboard — how V+ reaches each board */
    supplyA:10,           /* the servo supply's rated current, amps */
    freq:50,              /* servo pulse frequency, Hz */
    osc:25000000,
    sketch:'bridge'       /* bridge | coproc */
  };
}

/* Esc, via escGuard (core/dialog.js): while the calibration dial is out it
   cancels the dial and stays on the bench; while the dome map is out it
   shuts the map; otherwise it closes the bench. Every branch still
   preventDefault+stopPropagation (escGuard's contract) — only which action
   runs differs, exactly as the two explicit branches did before.

   The order is innermost first, and it matters more than it looks now that
   closing the bench also puts the hardware down (setupExitHardware): Esc
   out of a dome map must not disconnect a board. */
const setupEsc = escGuard(()=> SETUP.open, ()=>{
  /* v1.51.0 — the dial used to be the innermost thing Esc closed. It is the
     default view now, so closing it would reopen on the next render and Esc
     would look broken; reverting its ends silently would be worse. Esc is
     the map, then the bench. `cancel` on the dial is the undo. */
  if(SETUP.dome && SETUP.dome.open && typeof setupDomeClose === 'function') setupDomeClose();
  else setupClose();
});

/* ---------------------------------------------------------------- open */
function setupOpen(step, opts){
  SETUP.from = (opts && opts.from) || null;
  SETUP.hw = Object.assign(setupDefaults(), HW.setup() || {});
  SETUP.hw.osc = HW.osc() || SETUP.hw.osc;
  SETUP.open = true;
  SETUP.step = step || 0;
  setupEsc.bind();
  setupRender();
}
/* =============================================== PUT THE HARDWARE DOWN
   v1.45.0. Mike: "Disconnect hardware on exit from Servo Setup."

   Same class of mistake v1.39.4 fixed for the sequencer's live-drive arm: a
   connection you can no longer see is a connection you have forgotten. This
   bench is where the port gets opened — the dial is only honest with a real
   servo on the end of it — and walking out of it used to leave the link up
   with nothing on screen saying so. The next thing that streams then drives
   a real droid nobody is watching.

   Two rules it must not break:

     · The servos are NOT released. A limp servo holding a heavy panel open
       drops it, which is exactly why live-drive.js refuses to cut pulses on
       disarm. So nothing is driven to 0 and nothing is snapped home: they
       hold whatever position they are standing in, and the receipt says so.
     · Stepping between the bench's own steps is not leaving it, and neither
       is cancelling the dial. This is called from setupClose() and nowhere
       else, and setupClose() is the one function every real way out — the ×,
       Esc, and Finish — already went through.

   WHOSE PORT IS IT? A seam question, so the host answers it. In the sim the
   bench is the door onto the link and owns it (hw-ui.js). In PCA Studio the
   port belongs to the PAGE: the connect button is in its header, its monitor
   outlives this overlay, and closing a wizard there must not hang up on the
   board. Studio simply does not define the predicate, so the answer is no —
   the same shape as setupParts() and HW.setPart. */
function setupOwnsLink(){
  return typeof hwSetupOwnsLink === 'function' && hwSetupOwnsLink();
}
function setupExitHardware(){
  if(!setupOwnsLink()) return;
  const wasLive = (typeof LIVE !== 'undefined') && !!LIVE.on;
  const wasOn   = (typeof SER  !== 'undefined') && !!SER.port;
  if(!wasLive && !wasOn) return;          /* nothing was plugged in — say nothing */
  /* disarm BEFORE hanging up: an arm left standing over a dropped port is
     an arm that starts driving again the moment anything reconnects */
  if(wasLive && typeof liveSet === 'function')
    liveSet(false, {why:'live drive disarmed — you left the servo bench'});
  if(wasOn && typeof serialDisconnect === 'function') serialDisconnect();
  const what = [];
  if(wasOn)   what.push('the board is disconnected');
  if(wasLive) what.push('live drive is disarmed');
  HW.say('servo setup closed — '+what.join(' and ')+'. Every servo holds where it is: '
       + 'nothing was released and nothing was snapped home, so a loaded panel cannot drop on the way out.');
}

function setupClose(){
  setupCalLeave();          // leaving means keeping (setup-hw-cal.js)
  /* the map is a panel on a step that is about to stop existing */
  SETUP.dome = null;
  setupExitHardware();
  SETUP.open = false;
  setupEsc.unbind();
  const h = $('setupWrap'); if(h){ h.classList.add('hide'); h.innerHTML=''; }
  /* back where you came from. Only the wizard asks for this — the Bench tab
     is already behind the popout, so returning to it means doing nothing. */
  const from = SETUP.from; SETUP.from = null;
  if(from === 'wizard' && typeof wizOpen === 'function' && typeof wizStepIndex === 'function'){
    const i = wizStepIndex('_servoSet');
    if(i >= 0) wizOpen(i);
  }
}
function setupGo(i){
  SETUP.step = Math.max(0, Math.min(SETUP_STEPS.length-1, i));
  setupCalLeave();
  setupRender();
}

/* -------------------------------------------------------------- derived */
/* How many channels the table has. The two hosts genuinely disagree, so it
   is a seam call: Studio OWNS its hardware, so the answer is whatever you
   just said on step 2 and the project grows or shrinks to match. The sim's
   channel count is a BUILD answer made long before this wizard opened, and
   its rows carry names, actuator mappings and endpoints — so the wizard
   reads the build and says so on the Finish step if the two disagree. It
   never adds or deletes one of Mike's rows because of an answer here. */
function setupChannels(){ return HW.setupCount(); }
function setupAddr(b){ return 0x40 + b; }
function setupAddrHex(b){ return '0x' + setupAddr(b).toString(16).toUpperCase(); }
/* which A-jumpers to bridge for board b — the thing everyone gets wrong */
function setupJumpers(b){
  if(!b) return 'none — 0x40 is the address with no jumpers bridged';
  const bits = [];
  for(let i=0;i<6;i++) if(b & (1<<i)) bits.push('A'+i);
  return 'bridge ' + bits.join(' + ');
}
/* a stall-current sanity check. 1 A per hobby servo under load is the number
   people are surprised by; six panels moving at once is a real 6 A. */
function setupPowerCheck(){
  const used = HW.channels().filter(c=>c && /^servo/i.test(c.mode)).length || setupChannels();
  const worst = used * 1.0;
  const have = +SETUP.hw.supplyA || 0;
  return {used, worst, have, ok: have >= worst * 0.5,
    text: have >= worst
      ? 'Comfortable: '+have+' A for up to '+worst.toFixed(0)+' A of stall current.'
      : have >= worst*0.5
        ? 'Workable: '+have+' A against a theoretical '+worst.toFixed(0)+' A. Servos rarely all stall at once, but avoid moving everything in one frame.'
        : 'Thin: '+have+' A against a theoretical '+worst.toFixed(0)+' A. A brown-out resets the Arduino mid-sequence, which looks exactly like a firmware bug.'};
}

/* ============================================== THE PLACE YOU WERE LOOKING
   Mike, 2026-08-19: *"in Set up your servo hardware it jumps around when
   enabling servos"* — and again of the dome map, *"clicking one of the
   panels seems to jump around the screen, which means you lose track of
   what you're actually doing."*

   Both are the same bug and it is structural: `setupRender()` rebuilds the
   whole dialog by innerHTML, and a fresh element scrolls to the top. Every
   tick, every dropdown, every dome click therefore threw the reader back to
   the header — on a table of twenty-four channels that is the difference
   between working down a list and losing your place on every row.

   So the render is BRACKETED. Where you were looking is captured before the
   swap and put back after it, and so is the keyboard focus and the caret
   inside it: a name half-typed must survive the re-render that ticking its
   own row causes. Focus is restored by a STABLE description of the field
   (its row and its data-k, or its id) rather than by element identity,
   because the element it was is gone.

   This is the one place that can fix it for every control in the wizard.
   Doing it per-handler would mean remembering, in twelve call sites, a
   thing that is nothing to do with what any of them is for. */
function setupScrollSave(){
  const body = $('setBody');
  const st = {top: body ? body.scrollTop : 0, left: 0, foc: null};
  const sc = body && body.querySelector('.setscroll');
  if(sc) st.left = sc.scrollLeft;
  const a = document.activeElement;
  if(a && body && body.contains(a)){
    const row = a.closest ? a.closest('[data-ch]') : null;
    st.foc = {
      id: a.id || '',
      ch: row ? row.dataset.ch : '',
      k:  a.dataset ? (a.dataset.k || '') : '',
      s0: (a.selectionStart === undefined) ? null : a.selectionStart,
      s1: (a.selectionEnd === undefined) ? null : a.selectionEnd
    };
  }
  return st;
}
function setupScrollLoad(st){
  if(!st) return;
  const body = $('setBody'); if(!body) return;
  body.scrollTop = st.top;
  const sc = body.querySelector('.setscroll');
  if(sc) sc.scrollLeft = st.left;
  const f = st.foc; if(!f) return;
  let el2 = null;
  if(f.id) el2 = document.getElementById(f.id);
  if(!el2 && f.k){
    const row = f.ch !== '' ? body.querySelector('[data-ch="'+f.ch+'"]') : body;
    if(row) el2 = row.querySelector('[data-k="'+f.k+'"]');
  }
  if(!el2 || typeof el2.focus !== 'function') return;
  el2.focus();
  /* a caret only makes sense in a text-ish field, and setSelectionRange
     throws on the others (number inputs included, in some browsers) */
  if(f.s0 !== null && el2.setSelectionRange){
    try{ el2.setSelectionRange(f.s0, f.s1); }catch(e){}
  }
}

/* ================================================================ render */
function setupRender(){
  const host = $('setupWrap'); if(!host) return;
  if(!SETUP.open){ host.classList.add('hide'); return; }
  const keep = setupScrollSave();
  host.classList.remove('hide');
  const step = SETUP_STEPS[SETUP.step];
  let h = '<div class="setcard"><div class="sethead">'
    + '<h2>Set up your servo hardware</h2>'
    + '<div class="setsteps">'
    + SETUP_STEPS.map((s,i)=>'<button class="setstep'+(i===SETUP.step?' on':'')+(i<SETUP.step?' done':'')+'" data-go="'+i+'">'
        +'<b>'+(i+1)+'</b>'+s.label+'</button>').join('')
    + '</div>'
    + '<label class="setadv" title="Reveals the controls that can damage a servo or invalidate a calibration: the full 500-2500 microsecond sweep, and the pulse frequency.">'
    + '<input type="checkbox" id="setAdvChk"'+(setupAdv()?' checked':'')+'> advanced</label>'
    + '<button class="setx" data-act="close" title="close — nothing is lost, answers are kept">×</button></div>'
    + '<div class="setbody" id="setBody"></div>'
    + '<div class="setfoot">'
    + '<button class="mini" data-act="back"'+(SETUP.step?'':' disabled')+'>← back</button>'
    + '<span class="stat" id="setHint"></span><span class="sp" style="flex:1"></span>'
    + (SETUP.step === SETUP_STEPS.length-1
        ? '<button class="prim" data-act="apply">Build my project →</button>'
        : '<button class="prim" data-act="next">next →</button>')
    + '</div></div>';
  host.innerHTML = h;
  host.onclick = setupClick;
  /* the Advanced tick is a whole-wizard rerender, not a per-step one — the
     controls it reveals live on two different steps */
  const advChk = $('setAdvChk');
  if(advChk) advChk.onchange = e=>{
    SETUP.adv = e.target.checked;
    if(typeof lg === 'function') lg('sys','bench: advanced controls '+(SETUP.adv?'shown':'hidden'));
    setupRender();
  };
  const body = $('setBody');
  body.innerHTML = ({
    board:    setupStepBoard, expander: setupStepExpander, wiring: setupStepWiring,
    sketch:   setupStepSketch, channels: setupStepChannels, done: setupStepDone
  })[step.key]();
  /* The dial lives in #calWrap, which this rebuild has just emptied. Put it
     back if one is open — otherwise ticking any other control silently shut
     it AND left the channel's min/max at the wide working range setupCalOpen
     installs, because only cancel and commit restore them. */
  /* The dome map lives in #domeWrap for the same reason and with the same
     hazard: this rebuild just emptied it, and a map that vanished on the
     next keystroke would read as a crash (v1.45.0). The sim's fuller link
     row is put back here too — Studio has no hwLinkRender and therefore no
     #hwLink to fill. */
  if(step.key === 'channels'){
    setupBindLink(); setupBindChannels();
    if(typeof hwLinkRender === 'function' && $('hwLink')) hwLinkRender();
    /* v1.51.0 — the dial is the default view, not a mode you enter. It
       follows the selected channel, and setupCalEnsure's own cancel puts
       the previous one's ends back, so moving down the list never strands a
       widened working range. Only for a channel actually in use: there is
       nothing to calibrate on a pin with nothing plugged into it. */
    if(typeof setupCalEnsure === 'function'){
      const selC = HW.channels()[SETUP.sel];
      if(selC && /^servo/i.test(selC.mode||'')) setupCalEnsure(SETUP.sel);
      else setupCalLeave();
    }
    if(SETUP.cal) setupCalRender();
    if(SETUP.dome && SETUP.dome.open && typeof setupDomeRender === 'function') setupDomeRender();
  }
  if(step.key === 'wiring' || step.key === 'expander') setupBindSimple();
  if(step.key === 'board' || step.key === 'sketch' || step.key === 'done') setupBindSimple();
  setupScrollLoad(keep);          // put the reader back where they were
}

function setupClick(e){
  const b = e.target.closest('button'); if(!b) return;
  if(b.dataset.go !== undefined){ setupGo(+b.dataset.go); return; }
  const a = b.dataset.act;
  if(a === 'close') setupClose();
  else if(a === 'back') setupGo(SETUP.step-1);
  else if(a === 'next') setupGo(SETUP.step+1);
  else if(a === 'apply') setupFinish();
  else if(a === 'mstrfile') setupMaestroSettingsFile();
}

/* ------------------------------------------------------- 1 · controller */
function setupStepBoard(){
  return '<h3>What is driving the PCA9685s?</h3>'
    + '<p class="setp">This decides which pins the diagram draws, and whether the droid link '
    + 'can have a hardware UART of its own.</p>'
    + '<div class="setgrid">'
    + SETUP_MCUS.map(m=>'<label class="setopt'+(SETUP.hw.mcu===m.id?' on':'')+'">'
        + '<input type="radio" name="mcu" value="'+m.id+'" data-f="mcu"'+(SETUP.hw.mcu===m.id?' checked':'')+'>'
        + '<b>'+m.label+'</b>'
        + '<span class="sub">SDA '+m.sda+' · SCL '+m.scl+' · '+m.uarts+' UART'+(m.uarts>1?'s':'')
        + (m.v3?' · 3.3 V logic':'')+'</span>'
        + '<span class="why">'+m.note+'</span></label>').join('')
    + '</div>';
}

/* -------------------------------------------------------- 2 · expanders */
function setupStepExpander(){
  const n = SETUP.hw.boards;
  let rows = '';
  for(let b=0;b<n;b++){
    rows += '<tr><td class="pin">board '+b+'</td><td class="pin">'+setupAddrHex(b)+'</td>'
      + '<td>'+setupJumpers(b)+'</td>'
      + '<td class="pin">channels '+(b*16)+'–'+(b*16+15)+'</td></tr>';
  }
  /* ONE QUESTION (v1.50.0). Mike: *"under the tab for the PCA9685s — do we
     care? Why do we need to know whether there's… we just need to know how
     many boards there are. Unless we're testing for it, do we care if it's
     chained or in star? And we're not that worried about power either,
     because we're never going to tell people how to do the power as it
     currently stands."*

     He is right about what the APP needs: the board count is the only
     answer here that changes anything downstream — how many channels exist,
     which address jumpers to bridge, and what goes in the sketch. Chained
     versus star changes one drawing, and the power routing changes nothing
     at all; both were being asked as if the answer mattered to the setup,
     which is how a three-question step earns the same weight as a
     three-decision one.

     So they come off the step and go under ADVANCED, where the pulse
     frequency already lives — kept rather than deleted, because the Wiring
     diagram genuinely does draw the two layouts differently and somebody
     who wants the star version drawn should still be able to have it. The
     default stays chained, which is what the diagram drew before anyone
     answered. */
  return '<h3>How many PCA9685 boards?</h3>'
    + '<p class="setp">The only answer that changes anything: it decides how many channels there are and '
    + 'what goes in the sketch. Every board sits on the same I2C bus whatever the layout, and since v1.53.0 '
    + 'the sketches <b>scan for the boards</b> rather than insisting on particular addresses — so the '
    + 'jumper table below is a suggestion, not a requirement. Bridge whatever suits your build; the lowest '
    + 'address found becomes board 0.</p>'
    + '<div class="setrow"><label>Boards <input type="number" data-f="boards" min="1" max="8" value="'+n+'"></label>'
    + '<span class="stat">'+setupChannels()+' channels · highest channel number '+(setupChannels()-1)+'</span></div>'
    /* v1.54.0 — eight boards became possible here the day the wire protocol
       grew a seventh channel bit, and an already-flashed board does not know
       that. Said at the point of the decision, not discovered later when a
       channel quietly stops moving. */
    + (n > 2 ? '<p class="setp"><b>More than two boards needs the current sketch.</b> Driving servos live '
       + 'from this app used to top out at channel 61 — two boards — because the channel travelled in six '
       + 'bits. It travels in seven now, so 0–125 all reach real servos, but only if the board is running '
       + '<b>PCA_Bridge 2</b> or <b>MaestroReplacement 3</b> or later. Connect and the banner tells you which '
       + 'you have; an older one is simply sent nothing above channel 61, rather than something it would '
       + 'decode as the wrong servo. Exported sequences drive every channel either way.</p>' : '')
    + '<table class="settab"><tr><th>#</th><th>address</th><th>address jumpers</th><th>gives you</th></tr>'+rows+'</table>'
    + ((n > 1 && setupAdv()) ? '<div class="setsplit">'
      + '<div><h4>Signal — how the boards are joined</h4>'
      + '<label class="setopt sm'+(SETUP.hw.chain==='daisy'?' on':'')+'"><input type="radio" name="chain" value="daisy" data-f="chain"'+(SETUP.hw.chain==='daisy'?' checked':'')+'>'
      + '<b>Chained (in series)</b><span class="why">Board 0’s output header into board 1’s input, and so on. Four wires from the Arduino total. Neatest in a dome; one bad joint takes out everything downstream of it.</span></label>'
      + '<label class="setopt sm'+(SETUP.hw.chain==='star'?' on':'')+'"><input type="radio" name="chain" value="star" data-f="chain"'+(SETUP.hw.chain==='star'?' checked':'')+'>'
      + '<b>Star (in parallel)</b><span class="why">Every board wired back to the same four Arduino pins. More wire, but a failure is confined to one board — and easier to unplug one for testing.</span></label></div>'
      + '<div><h4>Power — how V+ reaches them</h4>'
      + '<label class="setopt sm'+(SETUP.hw.power==='shared'?' on':'')+'"><input type="radio" name="power" value="shared" data-f="power"'+(SETUP.hw.power==='shared'?' checked':'')+'>'
      + '<b>One supply, daisy-chained</b><span class="why">V+ passes board to board. Simple, but every amp for the far board flows through the near board’s terminal block — this is the arrangement that browns out.</span></label>'
      + '<label class="setopt sm'+(SETUP.hw.power==='perboard'?' on':'')+'"><input type="radio" name="power" value="perboard" data-f="power"'+(SETUP.hw.power==='perboard'?' checked':'')+'>'
      + '<b>A feed per board</b><span class="why">Each board’s V+ back to the supply on its own pair. What to do with four boards and a dozen servos moving at once. Grounds still common everywhere.</span></label></div>'
      + '</div>' : '')
    + (setupAdv()
        ? '<div class="setrow"><label>Servo supply <input type="number" data-f="supplyA" min="1" max="60" step="1" value="'+SETUP.hw.supplyA+'"> A</label>'
          + '<label>Pulse frequency <input type="number" data-f="freq" min="40" max="400" step="10" value="'+SETUP.hw.freq+'"> Hz</label>'
          + '<span class="stat">50 Hz is right for almost every analogue servo. Digital servos may take 200–333 Hz — check before raising it, an analogue servo fed 300 Hz gets hot.</span>'
          + '</div>'
        : '<div class="setrow"><span class="stat">Pulse rate <b>'+SETUP.hw.freq+' Hz</b>, signal <b>'
          + (SETUP.hw.chain==='daisy'?'chained':'star')+'</b>, '
          + (SETUP.hw.power==='shared'?'one supply':'a feed per board')+' at <b>'+SETUP.hw.supplyA+' A</b>. '
          + 'Tick <b>Advanced</b> in the header if any of that needs changing — the wiring diagram is drawn from it.</span></div>');
}

/* ============================================== THE BOARD, FROM HERE (v1.38.1)
   Mike: "under channels in Setup your servo hardware - shoudl we not have the
   connect to the Arduino button Aka Hardware connect".

   Yes — and its absence was worse than an omission. This step's whole
   premise is the one written at the top of this file: "The dial drives the
   servo LIVE, and Min / Center / Max capture wherever it currently is …
   that is the only way to find an endpoint on a printed droid." Without a
   port open, the dial drives a model of a servo. You can do the entire
   calibration, believe it, and have measured nothing.

   So the link lives HERE too, and the bar says which of the two you are
   doing rather than leaving you to infer it from a chip in a corner.

   `serialUiRegister` is why this can exist at all: connect/disconnect used
   to write straight into the Bench tab's elements, so calling it from this
   wizard threw part-way through and left a port open that nothing read. */
function setupLinkBar(){
  const on  = (typeof SER !== 'undefined') && !!SER.port;
  const mon = on && SER.blocked;
  /* v1.45.0 — the fold-in. In the sim this step now also carries the OLD
     bench's link row (hw-ui.js's hwLinkRender: the pulse rate, the serial
     monitor and the chip). It deliberately does NOT bring a second connect
     button with it: two identical connect buttons an inch apart is exactly
     the duplication Mike asked to be rid of, and THIS is the one to keep,
     because it is the one with the sentence beside it saying whether the
     dial is measuring a servo or a model. */
  return '<div class="setlink'+(on ? (mon ? ' mon' : ' on') : '')+'" id="setLink">'
    + '<button class="'+(on?'mini':'prim')+'" id="bSetConnect">'
    + (on ? '⚡ Disconnect' : '⚡ Connect hardware') + '</button>'
    + '<span class="setlinkstate">'
    + (on
        ? (mon ? '<b>Monitor only.</b> The board is talking but nothing is being streamed to it — '
                 + 'the dial is moving the model, not a servo.'
               : '<b>Live.</b> The dial drives the real servo, and Min / Centre / Max record where it '
                 + 'actually is.')
        : '<b>Not connected.</b> The dial will move the on-screen model only. To measure a real linkage, '
          + 'flash <b>PCA_Bridge</b>, plug the board in over USB and connect.')
    + '</span></div>';
}
function setupBindLink(){
  const b = $('bSetConnect');
  if(b) b.onclick = async ()=>{
    if(typeof SER === 'undefined'){ return; }
    if(SER.port) await serialDisconnect(); else await serialConnect();
    setupRender();
  };
  /* repaint when the link changes under us — an unplugged cable, or the
     header chip's own button. Registered whether or not the button above
     exists (v1.45.0): the SENTENCE has to follow the link's state even on a
     host where the button belongs to the row below it. */
  if(typeof serialUiRegister === 'function') serialUiRegister(setupLinkSync);
}
function setupLinkSync(){
  if(SETUP.open && SETUP_STEPS[SETUP.step] && SETUP_STEPS[SETUP.step].key === 'channels'){
    const host = $('setLink');
    if(host) host.outerHTML = setupLinkBar();
    setupBindLink();
  }
}

/* ------------------------------------------- the droid sketch, and its gate
   v1.38.0. Mike: "MaestroReplacement … should only be available when we have
   a valid config file for servo movements", and "we need to make it clear
   this is used once finished and you dont want to use the sim to control the
   real model anymore and you are ready for it to be contrlled by
   padewon360".

   Both halves of that are the same point. MaestroReplacement is the END of
   this process: it takes the link away from this app and hands it to the
   droid's own sketch. Flash it before the endpoints are measured and you
   have a co-processor confidently driving servos to numbers nobody checked —
   and no way to fix them without reflashing PCA_Bridge and starting again.
   So it is offered only once there is something to bake in. */
function setupHasTravel(){
  return (typeof servoCfgConfigured === 'function') ? servoCfgConfigured() : 0;
}
/* a link to a folder in this project, for a step that has spent five
   releases naming paths at people (v1.50.0). Opens in a new tab so the
   bench session — which may have a board connected — is not navigated
   away from; `noopener` because a new tab that can reach back into this
   one is a hazard we get nothing for. */
function setupRepoLink(path, text, tip){
  const repo = (typeof APP_REPO === 'string') ? APP_REPO : '';
  if(!repo) return '<code>'+path+'</code>';
  return '<a class="setlinkout" href="'+repo+'/tree/main/'+path+'" target="_blank" rel="noopener"'
    + ' title="'+(tip || ('open '+path+' on GitHub'))+'">'+(text || path)+'</a>';
}
function setupDroidCard(){
  const n = setupHasTravel();
  const on = SETUP.hw.sketch === 'coproc';
  if(!n){
    return '<label class="setopt locked" title="Measure the endpoints first — this sketch bakes them in.">'
      + '<input type="radio" name="sketch" value="coproc" disabled>'
      + '<b>MaestroReplacement</b><span class="sub">the droid — not yet · '
      + setupRepoLink('arduino/MaestroPCA/examples/MaestroReplacement','open the sketch ↗')+'</span>'
      + '<span class="why">Available once the servos have been measured. This is the sketch that ENDS the bench session: '
      + 'it holds the sequences itself, answers <code>restartScript(n)</code> exactly as a Pololu Maestro does, and hands '
      + 'control to Padawan360 — this app stops driving the droid. There is nothing to bake in yet, so there is nothing '
      + 'to flash.</span></label>';
  }
  return '<label class="setopt'+(on?' on':'')+'"><input type="radio" name="sketch" value="coproc" data-f="sketch"'+(on?' checked':'')+'>'
    + '<b>MaestroReplacement</b><span class="sub">the droid — when you are finished · '
    + setupRepoLink('arduino/MaestroPCA/examples/MaestroReplacement','open the sketch ↗')+'</span>'
    + '<span class="why"><b>This is the last step, not a step.</b> Flash it when the choreography is done and you no longer '
    + 'want the simulator driving the real droid: the co-processor holds the sequences itself and answers '
    + '<code>restartScript(n)</code> over the link exactly as a Pololu Maestro does, so <b>Padawan360 takes over</b> and '
    + 'the host sketch needs no changes. Your '+n+' measured channel'+(n===1?'':'s')+' are baked in. '
    + 'To change anything afterwards you flash PCA_Bridge again and come back here.</span></label>';
}

/* ----------------------------------------------------------- 3 · wiring */
function setupStepWiring(){
  return '<h3>Wire it like this</h3>'
    + '<p class="setp">Drawn from your answers. The one line people skip: <b>common ground</b> — '
    + 'the servo supply’s negative, the Arduino’s GND and every board’s GND must meet, '
    + 'or the PWM has no reference and the servos twitch.</p>'
    + setupWiringSvg()
    + '<div class="setnote"><b>V+ is not the Arduino’s 5 V pin.</b> The regulator on an Arduino '
    + 'will supply a few hundred milliamps; one servo under load wants an amp. V+ comes from the '
    + 'servo supply, always. The Arduino’s 5 V goes only to the board’s VCC (the logic side).</div>'
    + '<div class="setnote'+(setupPowerCheck().ok?'':' warn')+'">'+setupPowerCheck().text+'</div>';
}

function setupJumpShort(b){
  if(!b) return 'no jumpers';
  const bits=[]; for(let i=0;i<6;i++) if(b & (1<<i)) bits.push('A'+i);
  return 'bridge '+bits.join('+');
}
function setupWiringSvg(){
  const m = setupMcu();
  const n = SETUP.hw.boards;
  const star = SETUP.hw.chain === 'star';
  const perBoard = SETUP.hw.power === 'perboard';
  const BW = 300, BH = 62, GAP = 26;
  const BX = 560, BY = 70;                       /* boards column */
  const W = 1000, H = BY + n*(BH+GAP) + 70;   /* BY leaves room for the legend */
  const t = (x,y,txt,col,size,anchor)=>'<text x="'+x+'" y="'+y+'" fill="'+col+'" font-size="'+(size||12)
    + '" font-family="monospace"'+(anchor?' text-anchor="'+anchor+'"':'')+'>'+txt+'</text>';
  let s = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Wiring diagram generated from your answers">';
  s += '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">'
     + '<path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker></defs>';

  /* the controller */
  s += '<rect x="40" y="'+BY+'" width="210" height="104" rx="8" fill="var(--setHub)" stroke="var(--setEdge)"/>';
  s += t(145, BY+26, m.label, 'var(--setInk)', 14, 'middle');
  s += t(60,  BY+52, 'SDA '+m.sda+'   SCL '+m.scl, 'var(--setNeedle)', 12);
  s += t(60,  BY+72, '5V \u2192 VCC (logic only)', 'var(--setGood)', 11);
  s += t(60,  BY+90, 'GND', 'var(--setGood)', 11);

  /* the supply */
  const sy = H - 118;
  s += '<rect x="40" y="'+sy+'" width="210" height="58" rx="8" fill="var(--setHub)" stroke="var(--setBad)"/>';
  s += t(145, sy+24, 'SERVO SUPPLY', 'var(--setBad)', 13, 'middle');
  s += t(145, sy+42, '5\u20136 V \u00b7 '+SETUP.hw.supplyA+' A', 'var(--setDim)', 11, 'middle');

  for(let b=0;b<n;b++){
    const y = BY + b*(BH+GAP);
    s += '<rect x="'+BX+'" y="'+y+'" width="'+BW+'" height="'+BH+'" rx="8" fill="var(--setFace2)" stroke="var(--setEdge)"/>';
    s += t(BX+14, y+22, 'PCA9685 \u00b7 board '+b, 'var(--setInk)', 13);
    s += t(BX+14, y+40, setupAddrHex(b)+'  \u00b7  '+setupJumpShort(b), 'var(--setNeedle)', 12);
    s += t(BX+14, y+56, 'channels '+(b*16)+'\u2013'+(b*16+15), 'var(--setTick)', 11);

    /* --- signal (amber) --- */
    if(star || b === 0){
      const fromY = BY+52;
      s += '<path d="M250 '+fromY+' C '+(390+b*10)+' '+fromY+', '+(BX-140)+' '+(y+20)+', '+(BX-6)+' '+(y+20)+'" '
         + 'fill="none" stroke="var(--setNeedle)" stroke-width="2" color="var(--setNeedle)" marker-end="url(#ah)"/>';
    }else{
      /* chained: down the RIGHT of the column, clear of the boxes */
      const py = BY + (b-1)*(BH+GAP) + BH;
      const rx = BX + BW + 26;
      s += '<path d="M'+(BX+BW)+' '+(py-14)+' L '+rx+' '+(py-14)+' L '+rx+' '+(y+20)+' L '+(BX+BW+6)+' '+(y+20)+'" '
         + 'fill="none" stroke="var(--setNeedle)" stroke-width="2" color="var(--setNeedle)" marker-end="url(#ah)"/>';
      s += t(rx+8, (py+y)/2, 'I2C', 'var(--setTick)', 10);
    }

    /* --- power (red) --- */
    if(perBoard || b === 0){
      s += '<path d="M145 '+sy+' C 145 '+(y+180)+', '+(BX-200)+' '+(y+46)+', '+(BX-6)+' '+(y+46)+'" '
         + 'fill="none" stroke="var(--setBad)" stroke-width="2" color="var(--setBad)" marker-end="url(#ah)"/>';
    }else{
      /* daisy-chained V+: down the LEFT of the column, outside the boxes */
      const py = BY + (b-1)*(BH+GAP) + BH;
      const lx = BX - 26;
      s += '<path d="M'+lx+' '+(py-16)+' L '+lx+' '+(y+46)+' L '+(BX-6)+' '+(y+46)+'" '
         + 'fill="none" stroke="var(--setBad)" stroke-width="2" color="var(--setBad)" marker-end="url(#ah)"/>';
      s += t(lx-40, (py+y)/2, 'V+', 'var(--setTick)', 10);
    }
  }

  s += t(40, H-34, 'GND: supply \u2212  \u00b7  Arduino GND  \u00b7  every board GND \u2014 one common point', 'var(--setGood)', 12);
  /* the legend lives top-left, clear of the cable runs — it sat mid-canvas
     and the signal curve went straight through it */
  s += t(40, 26, (star ? 'signal: star \u2014 each board back to the Arduino'
                       : 'signal: chained board to board'), 'var(--setNeedle)', 11);
  s += t(40, 44, (perBoard ? 'power: a feed per board'
                           : 'power: one supply, daisy-chained'), 'var(--setBad)', 11);
  s += '</svg>';
  return s;
}

/* ----------------------------------------------------------- 4 · sketch */
function setupStepSketch(){
  const m = setupMcu();
  const esp = m.id === 'esp32';
  const link = m.uarts > 1
    ? 'a real hardware UART (Serial1) for the droid link'
    : 'SoftwareSerial on pins 8/9 for the droid link — safe here, because this board generates no PWM itself';
  /* An ESP32 gets a third option, and on that board it is usually the right
     one: same engine, same sequences, plus a web page you can fire a slot
     from without opening the dome. */
  const espCard = !esp ? '' :
      '<label class="setopt'+(SETUP.hw.sketch==='esp32'?' on':'')+'"><input type="radio" name="sketch" value="esp32" data-f="sketch"'+(SETUP.hw.sketch==='esp32'?' checked':'')+'>'
    + '<b>Esp32Droid</b><span class="sub">the droid, with a radio · '
    + setupRepoLink('arduino/MaestroPCA/examples/Esp32Droid','open the sketch ↗')+'</span>'
    + '<span class="why">MaestroReplacement plus WiFi. It answers <code>restartScript(n)</code> over the link exactly the same way, and also serves a page that lists your slots as buttons — join <b>R2-PCA</b> on a phone and fire a routine without opening the dome. '
    + (setupChannels() > 16
        ? 'With '+SETUP.hw.boards+' boards you are past the ESP32&rsquo;s 16 built-in PWM channels, so it drives your PCA9685s over I2C — set <code>MPCA_DIRECT_PINS 0</code>.'
        : 'At '+setupChannels()+' channels it could also drive the servos straight off its own pins at ~0.3 µs resolution — finer than a PCA9685 — with no expander at all. That is <code>MPCA_DIRECT_PINS 1</code>.')
    + '</span></label>';
  return '<h3>Which sketch to flash</h3>'
    + '<p class="setp"><b>PCA_Bridge</b> is in '
    + setupRepoLink('pca-studio/PCA_Bridge','pca-studio/PCA_Bridge/')
    + ' — it is a tool, so it lives with the tool. The droid sketches are in '
    + setupRepoLink('arduino/MaestroPCA/examples','arduino/MaestroPCA/examples/')
    + ', which is what the library is for; the library itself is '
    + setupRepoLink('arduino/MaestroPCA','arduino/MaestroPCA/')
    + '. Every link opens on GitHub in a new tab. '
    + 'You can change your mind later — they are the same wiring. '
    + '<b>Start with PCA_Bridge</b>: it is the one that lets this app drive your real servos, which is how you '
    + 'both check an imported config and measure a new one.</p>'
    + '<div class="setgrid">' + espCard
    + '<label class="setopt'+(SETUP.hw.sketch==='bridge'?' on':'')+'"><input type="radio" name="sketch" value="bridge" data-f="sketch"'+(SETUP.hw.sketch==='bridge'?' checked':'')+'>'
    + '<b>PCA_Bridge</b><span class="sub">the bench tool · '
    + setupRepoLink('pca-studio/PCA_Bridge','open the sketch ↗')+'</span>'
    + '<span class="why">A dumb pipe. This app runs the sequencer and streams positions over USB, so a slider here moves a real servo. Flash this first: it is how you calibrate the endpoints on the next step.</span></label>'
    + setupDroidCard()
    + '</div>'
    + '<h4>The lines to check in that sketch</h4>'
    + '<pre class="setpre">'+setupSketchConfig()+'</pre>'
    + '<div class="setrow"><button class="mini" data-act="copycfg">copy</button>'
    + '<span class="stat">'+link+'</span></div>';
}
function setupSketchConfig(){
  const m = setupMcu();
  const n = SETUP.hw.boards;
  const esp = SETUP.hw.sketch === 'esp32';
  let s = '';
  s += '/* generated by PCA Studio setup — '+m.label+', '+n+' PCA9685'+(n===1?'':'s')+' */\n';
  if(esp){
    /* The one line that decides everything on an ESP32: its own pins, or
       the expanders. Past 16 channels there is no choice — LEDC has 16. */
    s += '#define MPCA_DIRECT_PINS  ' + (setupChannels() > 16 ? '0' : '0')
      +  '   // 0 = your PCA9685s over I2C'
      +  (setupChannels() > 16 ? '  (16 channels is all LEDC has, so this is forced)' : '  — set 1 to use the ESP32\'s own pins instead')
      +  '\n';
  }
  s += '#define PCA_BOARDS   '+n+'      // 16 channels each, '+setupChannels()+' in total\n';
  s += '#define OSC_HZ       '+SETUP.hw.osc+'UL   // measured, not nominal — see the README\n';
  s += '#define SERVO_HZ     '+SETUP.hw.freq+'\n';
  if(esp){
    s += '\nWire.begin('+m.sda+', '+m.scl+');   // ESP32 I2C, in setup()\n';
    s += '#define LINK_RX_PIN  4\n#define LINK_TX_PIN  2   // Serial1 to the droid host\n';
    s += '#define LINK_BAUD    9600\n';
    s += '#define AP_SSID      "R2-PCA"   // its own access point if your network is absent\n';
  }
  else if(SETUP.hw.sketch === 'coproc'){
    s += m.uarts > 1
      ? '#define LINK_PORT    Serial1   // '+m.label+' has spare UARTs — use one\n'
      : '#define LINK_RX_PIN  8\n#define LINK_TX_PIN  9   // SoftwareSerial: this board makes no PWM\n';
    s += '#define LINK_BAUD    9600     // must match the host\'s Serial3.begin()\n';
  }
  /* v1.53.0 — Mike: "does the PCA sketches check for pca boards via a scan
     of all addresses as I and others may jumper them differently". They do
     now (MpcaScan.h), so these addresses are a STARTING POINT and the
     sketch re-addresses them at boot from what is actually on the bus.
     Saying so here matters: this block is what somebody copies, and until
     now it read as an instruction about which jumpers to bridge. */
  s += '\nAdafruit_PWMServoDriver pca[] = {\n';
  for(let b=0;b<n;b++) s += '  Adafruit_PWMServoDriver('+setupAddrHex(b)+')'+(b<n-1?',':'')+'   // '+setupJumpers(b)+'\n';
  s += '};\n';
  s += '/* The sketch SCANS the bus at boot (0x40-0x7F, minus the All Call)\n'
    +  '   and re-addresses these to whatever it finds, lowest address first.\n'
    +  '   Bridge whichever jumpers suit your build — the addresses above are\n'
    +  '   only what a board with no jumpers, then A0, then A1... would be. */\n';
  if(esp) s += '\n/* 3.3 V logic. A PCA9685 reads it as a valid high, so this works —\n'
            +  '   but its VCC is the ESP32\'s 3V3, V+ is still the servo supply, and\n'
            +  '   nothing may push 5 V back into an ESP32 pin. */\n';
  return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

/* every out-of-band end on the board, for the counts in the header and on
   the Finish step */
function pwAudit(){
  const out = {warn:[], bad:[]};
  (HW.channels()||[]).forEach((c,i)=>{
    if(!c || !/^servo/i.test(c.mode)) return;
    [c.min, c.max, c.home].forEach(q=>{
      const k = pwClass(q);
      if(k === 'bad'  && out.bad.indexOf(i)  < 0) out.bad.push(i);
      else if(k === 'warn' && out.warn.indexOf(i) < 0 && out.bad.indexOf(i) < 0) out.warn.push(i);
    });
  });
  return out;
}

/* ------------------------------------------------------ apply to selected
   The settings worth pushing at a bank of servos at once. `k` is either a
   channel field or one of the three synthetic ones the table also uses
   (minUs/ctrUs/maxUs in µs, boot, sleep) — setupApplyOne is the one place
   that knows the difference. */
const SETUP_APPLY = [
  {k:'speed',        label:'speed',           type:'num', min:0,   max:16000, step:1,   def:40},
  {k:'acceleration', label:'acceleration',    type:'num', min:0,   max:255,   step:1,   def:10},
  {k:'ease',         label:'ease',            type:'sel', opts:['none','soft','overshoot'], def:'none', tip:EASE_TIP},
  {k:'minUs',        label:'min (µs)',        type:'num', min:400, max:2600,  step:1,   def:1000},
  {k:'ctrUs',        label:'centre (µs)',     type:'num', min:400, max:2600,  step:1,   def:1500},
  {k:'maxUs',        label:'max (µs)',        type:'num', min:400, max:2600,  step:1,   def:2000},
  /* Mike, 2026-08-14: "boot should not be auto ticked just because it's
     setup" — ticking boot is the user's explicit opt-in, so the apply bar's
     own default (what "at power-up" shows before you touch it) is limp too,
     the same as a freshly-enabled channel (setupUse, below). */
  {k:'boot',         label:'at power-up',     type:'sel', opts:['go to centre','limp'],  def:'limp'},
  {k:'sleep',        label:'sleep when idle', type:'sel', opts:['off','on'],   def:'off'},
  {k:'sleepMs',      label:'idle time (ms)',  type:'num', min:100, max:60000, step:100, def:1200}
];
function setupApplyDef(k){ return SETUP_APPLY.find(x=>x.k===k) || SETUP_APPLY[0]; }
function setupApplyOne(c, k, v){
  setupTouched();
  if(k === 'minUs'){ c.min  = Math.round(v*4); return; }
  if(k === 'maxUs'){ c.max  = Math.round(v*4); return; }
  if(k === 'ctrUs'){ c.home = Math.round(v*4); return; }
  if(k === 'boot'){  c.homemode = (v === 'limp') ? 'Off' : 'Goto'; return; }
  if(k === 'sleep'){ c.releaseMs = (v === 'on') ? (c.releaseMs || 1200) : 0; return; }
  if(k === 'sleepMs'){ c.releaseMs = c.releaseMs ? (+v|0) : 0; return; }
  if(k === 'ease'){ c.ease = v; return; }
  c[k] = (+v|0);
}
/* the channels the apply bar will touch: selected AND actually in use */
function setupPicked(){
  return (SETUP.pick||[]).filter(i=>{
    const c = HW.channels()[i];
    return c && /^servo/i.test(c.mode);
  });
}

/* ------------------------------------------------------- inline confirm
   Not window.confirm(). A modal dialog blocks the page — and the test
   harness with it — and cannot say "12 channels" in the place you are
   looking. This is a strip that appears where the action was, names exactly
   what is about to happen, and goes away again. */
function setupAsk(msg, yes, fn, where){ SETUP.ask = {msg, yes, fn, where:where||'table'}; }
function setupAskClear(){ SETUP.ask = null; }
function setupAskHtml(where){
  const a = SETUP.ask; if(!a || a.where !== (where||'table')) return '';
  return '<div class="askbar"><span>'+a.msg+'</span><span class="sp" style="flex:1"></span>'
    + '<button class="mini" data-ask="no">cancel</button>'
    + '<button class="prim" data-ask="yes">'+a.yes+'</button></div>';
}

/* ------------------------------------------------------------ 6 · done */
function setupStepDone(){
  const used = HW.channels().filter(c=>c && /^servo/i.test(c.mode));
  /* "calibrated" means you captured it on the dial — not that the numbers
     differ from some default. A channel can be left on 4544–7296 because
     that is genuinely right for it, and one can be moved to 4000–8000 by
     hand and still be a guess. The flag is set by setupCalCommit(). */
  const uncal = used.filter(c=>!c.calibrated);
  return '<h3>Ready</h3>'
    + '<table class="settab"><tr><th>what</th><th>you said</th></tr>'
    + '<tr><td>Controller</td><td>'+setupMcu().label+'</td></tr>'
    + '<tr><td>PCA9685s</td><td>'+SETUP.hw.boards+' · '+Array.from({length:SETUP.hw.boards},(_,b)=>setupAddrHex(b)).join(', ')+'</td></tr>'
    + '<tr><td>Signal</td><td>'+(SETUP.hw.chain==='daisy'?'chained board to board':'star, each back to the Arduino')+'</td></tr>'
    + '<tr><td>Power</td><td>'+(SETUP.hw.power==='shared'?'one supply daisy-chained':'a feed per board')+' · '+SETUP.hw.supplyA+' A</td></tr>'
    + '<tr><td>Pulse rate</td><td>'+SETUP.hw.freq+' Hz · oscillator '+SETUP.hw.osc+' Hz</td></tr>'
    + '<tr><td>Sketch</td><td>'+({bridge:'PCA_Bridge (bench)', coproc:'MaestroReplacement (droid)',
        esp32:'Esp32Droid (droid, with WiFi)'})[SETUP.hw.sketch]+'</td></tr>'
    + '<tr><td>Channels in use</td><td>'+used.length+' of '+setupChannels()+'</td></tr>'
    + '</table>'
    + (()=>{
        /* the pulse-width audit, loudest first: a red channel is one you
           should look at before you power the droid, not after */
        const a = pwAudit();
        if(a.bad.length)
          return '<div class="setnote bad"><b>'+a.bad.length+' channel'+(a.bad.length===1?'':'s')+' outside 500–2500 µs</b> — '
            + 'ch '+a.bad.join(', ')+'. Most servos cannot reach these widths and will drive against their own end stop trying, '
            + 'which is how gears get stripped. Check them on the dial before you run anything.</div>'
            + (a.warn.length ? '<div class="setnote warn">'+a.warn.length+' more outside the standard 1000–2000 µs (ch '+a.warn.join(', ')+') — sweep them first.</div>' : '');
        if(a.warn.length)
          return '<div class="setnote warn"><b>'+a.warn.length+' channel'+(a.warn.length===1?'':'s')+' outside the standard 1000–2000 µs</b> — '
            + 'ch '+a.warn.join(', ')+'. Plenty of servos travel this far and some do not, so sweep them before you trust them in a sequence.</div>';
        return '';
      })()
    + (uncal.length
        ? '<div class="setnote warn"><b>'+uncal.length+' channel'+(uncal.length===1?' has':'s have')+' endpoints you have not set on the dial.</b> '
          + 'Whatever numbers are in the table are a guess until a real horn has been to both ends — go back and use <b>configure</b> before you run a sequence into a panel.</div>'
        : '<div class="setnote">Every channel in use has endpoints you captured yourself, on the dial, against the real linkage.</div>')
    + setupStepMaestro()
    + setupStepExports();
}

/* THE EXPORTS, IN ORDER OF WHO NEEDS THEM (v1.38.3)

   Mike: "why do we have two export methods .json and .h". Because they were
   sitting side by side as equals, and they are not equals — one of them is
   the file everybody needs and the other is for the handful of people
   compiling the co-processor sketch themselves. Presented as a pair, the
   only fair reading is that you are supposed to understand the difference
   before you can leave, which is a tax on the wrong person.

   So: ONE button by default — the servo config, the file this app reads
   back. servos.h appears only when you have chosen a sketch that has to be
   compiled with it, because that is the only moment it means anything. The
   whole-bench .json is a backup of this page rather than a servo config, so
   it lives under `advanced` with the other things you would only reach for
   deliberately.

   The default button is deliberately the SAME file the Finish prompt
   writes. Two buttons that both said ".json" and produced different files
   was the actual confusion underneath the question. */
function setupStepExports(){
  const drv  = SETUP.hw.sketch === 'coproc' || SETUP.hw.sketch === 'esp32';
  const name = ({coproc:'MaestroReplacement', esp32:'Esp32Droid'})[SETUP.hw.sketch] || 'the droid sketch';
  let s = '<div class="setrow"><button class="mini prim" data-act="expcfg">save servo config</button>'
    /* the way back in, beside the way out — an export whose import lives on
       another screen is how "where do I import this?" happens (v1.39.1) */
    + '<button class="mini" data-act="impcfg">import one…</button>'
    + '<span class="stat">the file worth keeping: every channel\'s name, travel, centre and speed. '
    + 'Import replaces the travel here, channel for channel, and touches nothing else.</span></div>';
  if(drv || setupAdv())
    s += '<div class="setrow"><button class="mini" data-act="exph">servos.h</button>'
      + '<span class="stat">only if you compile <b>'+name+'</b> yourself — the same numbers as C, to sit beside '
      + 'sequences.h. Endpoints are calibration and sequences are art: regenerate this when you recalibrate, not '
      + 'when you change a move.</span></div>';
  if(setupAdv())
    s += '<div class="setrow"><button class="mini" data-act="expjson">whole bench .json</button>'
      + '<span class="stat">a backup of this page rather than a servo config — boards, wiring, power, pulse rate '
      + 'and the channel table together.</span></div>';
  return s;
}

/* ------------------------------------------------------ writing a file out
   v1.45.0. The two buttons below called a bare `download()` — a helper that
   exists ONLY in PCA Studio (pca-studio/src/js/00-core.js). Both apps load
   this file, so in the sim `servos.h` and the bench .json threw
   ReferenceError the moment Mike pressed them: the only two exports in the
   app that did nothing at all, on the screen whose whole output they are.

   So the helper lives here, where both apps can reach it, and prefers the
   host's own when there is one — Studio's `download` is these same six
   lines and is what the rest of that app already uses, so nothing there
   changes behaviour. */
function setupDownload(name, text, mime){
  if(typeof download === 'function'){ download(name, text, mime); return name; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:mime || 'text/plain'}));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  return name;
}
/* ...and the names carry the moment they were written. `servos.h` and
   `servo-setup.json` are regenerated every time a calibration changes, so
   four of them pile up in one Downloads folder as servos.h, servos(1).h,
   servos(2).h — and which one holds the endpoints you measured after lunch
   is not a question a file name should make you open the file to answer.
   fileStamp() is the sim's (core/util.js, '2026-08-17-1532'); Studio has no
   clock helper of its own and gets the same shape from Date. */
function setupFileName(base, ext){
  const s = (typeof fileStamp === 'function')
    ? fileStamp()
    : new Date().toISOString().slice(0,16).replace('T','-').replace(':','');
  return base + '-' + s + '.' + ext;
}

/* ---------------------------------------------------------- the exports */
function setupJson(){
  return JSON.stringify({
    kind:'pca-studio-setup', ver:1, studio:HW.appVersion(),
    setup:SETUP.hw, osc:SETUP.hw.osc,
    channels:setupTable()
  }, null, 1);
}
/* servos.h — the channel table on its own. sequences.h carries a copy of it
   because the co-processor needs both in one place, but the two change for
   different reasons: endpoints are calibration and sequences are art. */
/* The table always covers every pin the boards HAVE, not just the ones you
   have filled in — a channel table shorter than the hardware is exactly the
   fault that reads as "that servo is dead", and it cost a bench session
   once already (v1.24.0, channels 16 and 31). */
function setupTable(){
  const n = setupChannels();
  const blank = setupBlank();
  return Array.from({length:n}, (_,i)=>HW.channels()[i] || blank);
}
/* the wizard's own idea of how many channels there are — boards × 16. The
   HOST may disagree (the sim's build has a board of its own), which is what
   HW.applied() reconciles, out loud rather than silently. */
function setupServosH(){
  const table = setupTable();
  const n = table.length;
  const m = setupMcu();
  let s = '/* servos.h — channel table, generated by PCA Studio '+HW.appVersion()+'\n';
  s += '   '+m.label+' · '+SETUP.hw.boards+' × PCA9685 ('+Array.from({length:SETUP.hw.boards},(_,b)=>setupAddrHex(b)).join(', ')+')\n';
  s += '   '+(SETUP.hw.chain==='daisy'?'signal chained':'signal star')+' · '
     + (SETUP.hw.power==='shared'?'one supply':'a feed per board')+' · '+SETUP.hw.supplyA+' A\n\n';
  s += '   Targets are QUARTER-MICROSECONDS (6000 = 1500 µs) — the Maestro unit,\n';
  s += '   so these numbers mean the same thing here, in sequences.h and in any\n';
  s += '   .mstr you export. Endpoints are YOUR calibration: captured against the\n';
  s += '   real linkage on the dial, not taken from a datasheet. Nothing that\n';
  s += '   generates a sequence is allowed to change them. */\n';
  s += '#pragma once\n#include <MaestroPCA.h>\n\n';
  s += '#define SERVO_HZ     '+SETUP.hw.freq+'\n';
  s += '#define OSC_HZ       '+SETUP.hw.osc+'UL\n';
  s += '#define PCA_BOARDS   '+SETUP.hw.boards+'\n';
  s += '#define SERVO_COUNT  '+n+'\n';
  s += '#if SERVO_COUNT > PCA_BOARDS * 16\n'
    +  '#error "more channels than the boards have pins — the top ones would never be driven"\n'
    +  '#endif\n\n';
  s += '/*  board pin    min    max   home  speed accel  release  ease */\n';
  s += 'const MpcaChannelDef SERVO_TABLE[SERVO_COUNT] PROGMEM = {\n';
  const pad = (v,w)=>String(v).padStart(w);
  table.forEach((c,i)=>{
    const servo = /^servo/i.test(c.mode);
    const home = (servo && !/off|ignore/i.test(c.homemode||'')) ? c.home : 0;
    s += '  { ' + pad(i>>4,2) + ', ' + pad(servo ? (i&15) : 255, 3) + ', '
      + pad(servo?c.min:0,5) + ', ' + pad(servo?c.max:0,5) + ', ' + pad(home,5) + ', '
      + pad(servo?c.speed:0,4) + ', ' + pad(servo?c.acceleration:0,4) + ', '
      + pad(servo?(c.releaseMs||0):0,7) + ', '
      + 'MPCA_EASE_' + String(servo?(c.ease||'none'):'none').toUpperCase().padEnd(9)
      + ' }' + (i<n-1?',':'') + '   /* ch' + pad(i,2) + ' ' + (servo ? c.name : '(not used)') + ' */\n';
  });
  s += '};\n';
  return s;
}

/* ------------------------------------------------------------- apply */
/* Finish, with the one question worth asking on the way out (v1.38.0).
   Mike: "clickign finish should warn if an export hasnt been done." An hour
   of calibration that exists only in one browser's localStorage is an hour
   you will do again after a cache clear, on another machine, or when you
   come back to the droid in a year. So Finish offers the file first — and
   it offers, it does not insist: a five-minute look at somebody else's
   config should not be held hostage. */
async function setupFinish(){
  const w = setupSaveWorth();
  if(w.worth && !setupExported() && typeof appConfirm === 'function'){
    /* say what is actually at stake, in the words of what was done: the
       measured channels if there are any, the set-up ones if there are not */
    const what = w.cal
      ? w.cal + ' channel' + (w.cal===1?'':'s') + ' measured on the dial'
        + (w.used > w.cal ? ' and ' + (w.used - w.cal) + ' more set up' : '')
      : w.used + ' channel' + (w.used===1?'':'s') + ' set up';
    const save = await appConfirm(
      'You have ' + what + ', and have not written them to a file.\n\n'
      + 'They are kept in this browser, which means they are one cache clear — or one other computer — '
      + 'away from being done all over again. Export takes a second.',
      {title:'Save the servo config first?', yes:'Export, then finish', no:'Finish without it'});
    if(save && typeof servoCfgExport === 'function'){
      servoCfgExport();
      SETUP.exportedAt = (SETUP.changedAt || 0);
    }
  }
  setupApply();
}

function setupApply(){
  setupCalLeave();          // leaving means keeping (setup-hw-cal.js)
  HW.setSetup(Object.assign({}, SETUP.hw));
  HW.setOsc(SETUP.hw.osc);
  /* trim the table to the boards you actually have — a channel with no pin
     behind it is the fault that reads as "that servo is dead" */
  setupFill(setupChannels());
  /* A brand-new project has nowhere to put a pose, so give it one sequence
     that parks everything at home. A host that already HAS sequences keeps
     them — this is calibration, and calibration must never eat choreography. */
  if(!HW.sequences().length){
    HW.addSequence({name:'All home', frames:[{name:'home', duration:600,
      targets:HW.channels().map(c=>c && /^servo/i.test(c.mode)
        ? (c.home || ((Math.min(c.min,c.max)+Math.max(c.min,c.max))>>1)) : 0)}]});
  }
  HW.save();
  HW.applied(SETUP.hw);
  const used0 = HW.channels().filter(c=>c && /^servo/i.test(c.mode)).length;
  /* remember that these numbers came from HERE, so the wizard can offer them
     back as "the ones you just measured" instead of asking for a file (v1.39.0) */
  if(used0 && typeof servoCfgNote === 'function') servoCfgNote('bench', {n:used0});
  setupClose();
  const used = HW.channels().filter(c=>c && /^servo/i.test(c.mode)).length;
  HW.say('setup applied — '+used+' channels on '+SETUP.hw.boards+' board'+(SETUP.hw.boards===1?'':'s')+'. Endpoints are yours; sequences build on top of them.');
}


/* ============================================ THE HALF THE WIRE CANNOT DO
   v1.56.0. The bench can now drive a real Pololu Maestro over its USB
   command port and read the positions back (maestro-link.js) — which
   covers everything you DO on a bench and nothing you SET on one. A
   channel's stored min, max, neutral, home and mode live behind the
   board's native USB interface, which a virtual COM port cannot reach
   (Pololu 0J40 §8).

   That is not a footnote to bury. It is the difference between "I measured
   my travel here and the droid has it" and "I measured my travel here and
   the board is quietly clamping every sequence to numbers I set months
   ago" — and the board does not say which of those is happening. So the
   Finish step says it out loud, on a Maestro build only, and hands over
   the one file that closes the gap.

   The file is the bench's ordinary .mstr export: `genChannelsXml()` already
   regenerates the <Channels> block from live channel state, so the endpoints
   you captured on the dial are already in it. Nothing new is written here —
   what was missing was anyone telling you WHY you would open it in Control
   Center, and in what order. */
function setupStepMaestro(){
  if(typeof serialBuildIsMaestro !== 'function' || !serialBuildIsMaestro()) return '';
  const a = (typeof mstrSettingsAdvice === 'function') ? mstrSettingsAdvice() : null;
  if(!a) return '';
  /* Anything the board was caught clamping while you were on the dial is
     named here, because those are exactly the channels whose stored limits
     are about to matter. */
  const clamped = (typeof MST !== 'undefined') ? Object.keys(MST.clamp || {}) : [];
  return '<div class="setnote"><b>Your Maestro\'s own settings still come from Control Center.</b> '
    + a.why + '</div>'
    + (clamped.length
        ? '<div class="setnote bad"><b>The board was clamping ' + clamped.length + ' channel'
          + (clamped.length === 1 ? '' : 's') + ' while you worked</b> — ch ' + clamped.join(', ')
          + '. Those channels did not reach the travel you measured, and they will not in a '
          + 'sequence either until the settings below are applied.</div>'
        : '')
    + '<div class="setnote"><b>Set once, in Control Center:</b><ul class="setul"><li>'
    + a.once.join('</li><li>') + '</li></ul>'
    + '<b>Then:</b><ol class="setul"><li>' + a.how.join('</li><li>') + '</li></ol></div>'
    + '<div class="setrow"><button class="mini" data-act="mstrfile">write the settings file '
    + 'for Control Center</button><span class="stat">a .mstr carrying the endpoints you '
    + 'captured here — open it with File → Open, then Apply Settings</span></div>';
}
/* One button, one file, and a toast that says the thing people forget:
   the port can only be held by one program at a time. */
function setupMaestroSettingsFile(){
  if(typeof exportMstr !== 'function'){
    HW.say('the .mstr writer is not loaded in this app', 'err');
    return;
  }
  exportMstr();
  HW.say('Disconnect here before you open it — Control Center and this app '
       + 'cannot hold the same COM port at once.', 'warn');
}
