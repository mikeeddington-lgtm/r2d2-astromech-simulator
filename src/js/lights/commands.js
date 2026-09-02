'use strict';
/* =====================================================================
   ASTROPIXELS — the wire: what can be said to the dome, and over what
   =====================================================================

   The four firmwares in Darren Poulson's repository are not four flavours
   of the same thing. They listen on DIFFERENT DOORS, and which door a
   builder has is the difference between a command working and vanishing
   with no error anywhere:

     standard      i2c 0x0A  AND  Serial2 @ 9600, both taking native
                   LE…/HP… commands (CommandEventSerial).
     standard-md   Serial2 @ 9600 taking JAWALITE from a Marcduino slave
                   port — `@1T3`, `:SE01` and so on. Native commands only
                   reach it wrapped in `*RT` or `@AP`.
     imperial      i2c 0x0A ONLY. Its main.cpp declares I2CReceiver and
     r2kt          no CommandEventSerial at all, so a serial command sent
                   to one of those two boards is not refused — it is not
                   read. Nothing blinks, nothing complains.

   That last one is exactly the class of failure this simulator exists to
   catch, so the transport is modelled rather than assumed: apxSend()
   refuses what the CONFIGURED firmware could not have heard, and says
   which door it would have needed. A simulator that accepts every command
   on every build teaches you a dome that does not exist.

   ------------------------------------------------------------- the grammar

     LE<logic><effect><colour><speed><time>
        logic  0 all · 1 FLD · 3 RLD · 4 front PSI · 5 rear PSI
        effect two digits, 00-24 and 99
        colour one digit, 0-9 (0 = leave the board's own palette alone)
        speed  one digit, 0 fastest
        time   two digits of seconds, 00 = continuous

     HP<who><type><seq><colour><speed><random><position>
        who    F R T front/rear/top · D radar eye · O other
               A all · X front+rear · Y front+top · Z rear+top · S sequences
        type   0 LEDs · 1 servos

   "Drop any leading 0s" is the documented rule and it is the source of
   most hand-typed command failures: LE30000 is logic 3, effect 00, colour
   0, speed 0, time 0 — seven characters, not eight. The parser below reads
   from the RIGHT for exactly that reason.
   ===================================================================== */

const LE_FIRMWARE = [
  {id:'standard',    label:'Standard',            doors:['i2c','serial'], native:true,  jawa:false,
   note:'i2c 0x0A and Serial2 at 9600, both taking native LE/HP commands'},
  {id:'standard-md', label:'Standard + Marcduino', doors:['i2c','serial'], native:false, jawa:true,
   note:'Serial2 takes Jawalite from a Marcduino slave port; native commands need a *RT or @AP wrapper'},
  {id:'imperial',    label:'Imperial',            doors:['i2c'],          native:true,  jawa:false,
   hue:255, pal:2, note:'i2c only — the sketch never opens a serial command port'},
  {id:'r2kt',        label:'R2-KT',               doors:['i2c'],          native:true,  jawa:false,
   hue:220, pal:2, note:'i2c only — the sketch never opens a serial command port'}
];
const LE_IFACES = [
  {id:'i2c',      label:'i2c @ 0x0A',   note:'Two wires plus ground onto the same bus as the PCA9685s'},
  {id:'serial',   label:'Serial2 @ 9600', note:'GPIO 16/17 on the AstroPixels breakout; S to R, - to G'},
  {id:'none',     label:'Not connected', note:'The boards run their own default effects and take no commands'}
];

/* The dome's whole lighting state. `iface` is what the builder actually
   wired; `firmware` is what is flashed. Both are answered in the build
   wizard and BOTH are needed — the pair is what decides whether a command
   arrives. */
const APX = {
  built:false, on:false,
  /* the build's Dome lighting answer the boards were last initialised
     against — what buildApply() compares before deciding to re-run
     apxInit() (v1.78.0, review M2) */
  domeLights:'',
  firmware:'standard', iface:'serial',
  fldBoard:'fld', psiBoard:'psi',
  disp:{}, order:[], holo:{}, holoOrder:[],
  log:[], rx:0, refused:0, lastRefusal:'',
  fldText:['', '']              // the two halves the Jawalite text commands fill
};

/* ------------------------------------------------------------ building */
function apxBuild(opts){
  const o = opts || {};
  if(o.firmware) APX.firmware = o.firmware;
  if(o.iface) APX.iface = o.iface;
  if(o.fldBoard) APX.fldBoard = o.fldBoard;
  if(o.psiBoard) APX.psiBoard = o.psiBoard;
  const fw = apxFirmware();
  APX.disp = {}; APX.order = [];
  for(const spec of LE_DISPLAYS){
    const s = Object.assign({}, spec);
    if(s.key === 'fld') s.board = APX.fldBoard;
    if(s.key === 'fpsi' || s.key === 'rpsi') s.board = APX.psiBoard;
    /* The imperial and R2-KT sketches are the stock one with a custom
       LogicEngineSettings: palette 2 (monotone) and a hue of 255 or 220,
       which is the whole of the difference between a blue droid and a red
       one. The PSIs keep their own defaults in both — those two sketches
       only override the LOGICS. */
    if(fw.pal !== undefined && s.key !== 'fpsi' && s.key !== 'rpsi'){
      s.pal = fw.pal; s.hue = fw.hue;
    }
    const d = leMakeDisplay(s);
    if(fw.hue !== undefined && s.key !== 'fpsi' && s.key !== 'rpsi'){
      d.def.hue = fw.hue; d.set.hue = fw.hue;
    }
    APX.disp[d.key] = d; APX.order.push(d.key);
  }
  APX.holo = {}; APX.holoOrder = [];
  for(const spec of LE_HOLOS){
    const h = leMakeHolo(spec);
    APX.holo[h.key] = h; APX.holoOrder.push(h.key);
  }
  APX.built = true;
  /* Every one of the four sketches ends setup() the same way: scrolling
     text on both logics and one HP command. Booting silent would be the
     simulation's own invention. */
  apxBoot();
  return APX;
}
function apxFirmware(){
  return LE_FIRMWARE.find(f => f.id === APX.firmware) || LE_FIRMWARE[0];
}
function apxBoot(){
  const fw = apxFirmware();
  const banner = fw.id === 'standard-md' ? '... AP-MD ....' : '... AstroPixels ....';
  const front = fw.id === 'imperial' ? '... Long Live The Empire ...'
              : fw.id === 'r2kt'     ? '... R2KT ...'
              : '... R2D2 ...';
  const rld = APX.disp.rld, fld = APX.disp.fld;
  if(rld){ leSetText(rld, banner); leSelectSeq(rld, LE_SEQ.TEXTSCROLLLEFT, 6, 0, 15); }
  if(fld){ leSetText(fld, front);  leSelectSeq(fld, LE_SEQ.TEXTSCROLLLEFT, 1, 0, 15); }
  apxApplyHP('A', {type:0, seq:6, colour:0, secs:20});
}

/* ------------------------------------------------------------- the clock
   One call a frame from app/animate.js. Everything inside counts 10 ms
   quanta of its own, so a slow machine gets fewer draws, never a slower
   animation. */
function apxTick(dtMs){
  if(!APX.built || !APX.on) return;
  for(const k of APX.order) leAdvance(APX.disp[k], dtMs);
  for(const k of APX.holoOrder) hpAdvance(APX.holo[k], dtMs);
}

/* --------------------------------------------------------- the mic input
   ALARM, MICBRIGHT and MICRAINBOW read a microphone. There is no
   microphone here — but on a real droid that mic is taped next to the
   speaker and is listening to the droid's own voice, which the simulator
   does know about. So the level is derived from what is playing: a fast
   noisy envelope while a sound is running, zero when it is not.

   It is an approximation and it is labelled as one. What it is NOT is
   silence, which is what returning 0 would have made those three effects
   do — MICBRIGHT with no level draws a black panel, and a builder would
   have reported the effect as broken. */
function leMicLevel(){
  if(typeof SND === 'undefined' || typeof SIM === 'undefined') return 0;
  const since = SIM.millis - SND.at;
  if(since < 0 || since > 1400) return 0;
  const t = since / 90;
  const env = Math.min(1, since / 120) * Math.max(0, 1 - since / 1400);
  const v = env * (0.55 + 0.45 * Math.abs(Math.sin(t) * Math.sin(t * 0.37 + 1.1)));
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/* ------------------------------------------------------------ the doors
   apxSend() is the WIRE. It is what a controller — a Marcduino, a
   sketch, a sequencer cue, the console — puts on the link, and it can be
   refused. apxCommand() is what the board does once a command has
   actually arrived, and never refuses on transport grounds. Keep them
   apart: the whole value of modelling this is being able to say "that
   command is fine, your wiring cannot carry it". */
function apxSend(str, opts){
  const o = opts || {};
  const s = String(str || '').trim();
  if(!s) return apxRefuse('empty command');
  const fw = apxFirmware();
  const via = o.via || APX.iface;
  if(via === 'none')
    return apxRefuse('the build says the AstroPixels are not connected to anything — they will run their own default effects and nothing else');
  if(fw.doors.indexOf(via) < 0)
    return apxRefuse('this dome is running the ' + fw.label + ' firmware, and ' + fw.note +
      '. A command sent over ' + (via === 'i2c' ? 'i2c' : 'Serial2') + ' is not refused by that sketch — it is never read');
  /* ...and the other way round (v1.78.0, review M4). Jawalite — `@1T3`,
     `:SE01`, `*ON01`, and the `*RT`/`@AP` wrappers, which are Marcduino
     verbs themselves — is what a MARCDUINO puts on the wire, and only the
     standard-md sketch has one in front of it. The other three take the
     native grammar on CommandEventSerial or the i2c receiver, and an
     `@1T3` arriving there is not a command they have ever read. `jawa` was
     declared on every entry above and then never consulted, so the Standard
     sketch cheerfully put the logics on ALARM for a string it could not
     have parsed — the exact false positive the header says this module
     exists to prevent. The command box's own placeholder offers `@1T3`. */
  if(/^[@:*]/.test(s) && !fw.jawa)
    return apxRefuse('this dome is running the ' + fw.label + ' firmware, and there is no Marcduino in front of it — ' +
      s + ' is Jawalite, which that sketch has never read. It takes the native LE… and HP… commands' +
      (fw.doors.indexOf('serial') < 0 ? ', over i2c' : '') + '; the Standard + Marcduino sketch is the one that speaks this');
  /* A Marcduino build speaks Jawalite. Native LE/HP still gets through,
     but only inside the two pass-through actions the standard-md sketch
     declares, and a builder who forgets the prefix sees nothing happen. */
  const native = /^(LE|HP)/i.test(s);
  if(native && via === 'serial' && !fw.native && !o.wrapped)
    return apxRefuse('the standard-md sketch takes Jawalite on Serial2. Send this as *RT' + s + ' or @AP' + s + ' and the Marcduino will pass it through');
  return apxCommand(s, {via:via});
}
function apxRefuse(why){
  APX.refused++; APX.lastRefusal = why;
  apxLog('✗ ' + why);
  return {ok:false, why:why};
}
function apxLog(line){
  APX.log.push(line);
  if(APX.log.length > 200) APX.log.shift();
}

/* --------------------------------------------------------- the parsing */
function apxCommand(str, opts){
  const o = opts || {};
  let s = String(str || '').trim();
  if(!s) return {ok:false, why:'empty command'};
  APX.rx++;
  /* The two Marcduino pass-throughs. `*RT` and `@AP` both mean "the rest
     of this is a ReelTwo command, hand it straight over". */
  const wrap = s.match(/^(\*RT|@AP)(.+)$/i);
  if(wrap) return apxCommand(wrap[2], {via:o.via, wrapped:true});
  if(/^LE/i.test(s)) return apxLE(s);
  if(/^HP/i.test(s)) return apxHP(s);
  if(/^[@:*]/.test(s)) return apxJawa(s);
  /* Commands the AstroPixels boards genuinely do not implement, which the
     stock reset sequence nevertheless sends. Saying so is more use than
     silently ignoring them: a builder tracing why FSOFF does nothing
     deserves the answer. */
  if(/^(FS|BM|CB|DP)/i.test(s))
    return {ok:true, ignored:true, why:s.slice(0,2).toUpperCase() +
      ' addresses a fire stripe, bad motivator, charge bay or data panel — no AstroPixels board answers it'};
  return {ok:false, why:'not a command this dome understands: ' + s};
}

/* LE<logic><effect><colour><speed><time> — read from the RIGHT, because
   the documented rule is "drop any leading zeros" and that makes the
   LEFT-hand fields the variable-width ones. Time is the last two, speed
   the one before, colour the one before that, and whatever is left over
   at the front is the logic digit plus the effect. */
function apxLE(str){
  const body = str.slice(2).replace(/\|/g, '');
  if(!/^\d+$/.test(body)) return {ok:false, why:'LE takes digits only, got "' + body + '"'};
  const n = body.length;
  if(n < 3) return {ok:false, why:'LE needs at least a logic, an effect and a colour'};
  /* Right-aligned means the third digit from the end is ALWAYS the speed
     and the fourth ALWAYS the colour, whenever they exist at all. These two
     were gated one digit late (v1.78.0, review L19): speed wanted four
     digits and colour five, so LE100 parsed as speed 0 and LE1234 dropped
     its colour — a typed digit vanishing on exactly the short forms the
     "drop the leading zeros" rule tells a builder to type. `head` below was
     already right, which is how the mismatch hid: the seven-digit commands
     everything else sends have every field present. */
  const time   = parseInt(body.slice(-2), 10);
  const speed  = parseInt(body.slice(-3, -2), 10);
  const colour = n >= 4 ? parseInt(body.slice(-4, -3), 10) : 0;
  const head   = body.slice(0, Math.max(0, n - 4));
  /* The head is the logic digit followed by the effect. One character
     means the effect was dropped to nothing, i.e. effect 0. */
  const logic  = head.length ? parseInt(head[0], 10) : 0;
  const effect = head.length > 1 ? parseInt(head.slice(1), 10) : 0;
  const targets = apxLogicTargets(logic);
  if(!targets.length) return {ok:false, why:'no logic board is numbered ' + logic};
  for(const d of targets) leSelectSeq(d, effect, colour, speed, time);
  apxLog('LE ' + (LE_SEQ_NAME[effect] || ('effect ' + effect)) +
    ' · ' + LE_COLOUR_NAME[colour] + ' · ' + targets.map(d => d.short).join(' '));
  return {ok:true, logic:logic, effect:effect, colour:colour, speed:speed, time:time,
          targets:targets.map(d => d.key)};
}
/* 0 is all four — and note that 2 addresses nothing at all. The library
   numbers the logics 1 and 3 with the PSIs at 4 and 5; there is no board
   2, and a builder who assumes "1 front, 2 rear" gets silence. */
function apxLogicTargets(logic){
  const all = APX.order.map(k => APX.disp[k]);
  if(logic === 0) return all;
  return all.filter(d => d.id === logic);
}

/* HP<who><type><seq><colour><speed><random><position> — everything after
   the sequence is optional, and a trailing |<seconds> sets a duration. */
function apxHP(str){
  const m = String(str).slice(2).match(/^([FRTDOAXYZS])(\d*)(?:\|(\d+))?$/i);
  if(!m) return {ok:false, why:'HP wants a designation letter then digits, got "' + str + '"'};
  const who = m[1].toUpperCase(), digits = m[2] || '', secs = m[3] ? parseInt(m[3], 10) : 0;
  const type = digits.length >= 1 ? parseInt(digits[0], 10) : 0;
  const seq  = digits.length >= 3 ? parseInt(digits.slice(1, 3), 10)
             : digits.length === 2 ? parseInt(digits[1], 10) : 0;
  const colour = digits.length >= 4 ? parseInt(digits[3], 10) : 0;
  const speed  = digits.length >= 5 ? parseInt(digits[4], 10) : 0;
  const rand   = digits.length >= 6 ? parseInt(digits[5], 10) : 0;
  const pos    = digits.length >= 7 ? parseInt(digits[6], 10) : -1;
  /* Type 1 is the servo side — a holoprojector on two servos, pointed at
     one of nine positions. This simulator already models servos properly,
     with travel limits and this droid's own calibration, so a lighting
     module inventing a second, worse servo path would be the wrong shape
     entirely. Recorded and reported; not acted on here. */
  if(type === 1)
    return {ok:true, servo:true, who:who, position:pos,
            why:'HP servo moves belong on a servo channel — map the holoprojector to one on the Panels step and it will move with everything else'};
  const r = apxApplyHP(who, {type:type, seq:seq, colour:colour, speed:speed, random:rand, secs:secs});
  apxLog('HP ' + who + ' · sequence ' + seq + ' · ' + LE_COLOUR_NAME[colour]);
  return Object.assign({ok:true, who:who, seq:seq, colour:colour, speed:speed, secs:secs}, r);
}
/* The designation letters, as the code reads them rather than as the page
   describes them: A is ALL FIVE holo positions, not "all 3", and D and O
   name the radar eye and a spare that need hardware most domes do not
   have. Addressing one we do not model is not an error — it is a command
   that would have gone somewhere real on a fuller dome. */
function apxHoloTargets(who){
  const g = {F:['front'], R:['rear'], T:['top'], A:['front','rear','top'],
             X:['front','rear'], Y:['front','top'], Z:['rear','top'],
             D:[], O:[], S:[]}[who] || [];
  return g.map(k => APX.holo[k]).filter(Boolean);
}
function apxApplyHP(who, cmd){
  const targets = apxHoloTargets(who);
  if(!targets.length)
    return {applied:0, why:who === 'D' ? 'the radar eye is separate hardware this dome does not have'
                        : who === 'O' ? 'no "other" holoprojector is fitted'
                        : who === 'S' ? 'HP sequences (S) are declared in the library but not implemented'
                        : 'no holoprojector answers to ' + who};
  for(const h of targets) hpCommand(h, cmd);
  return {applied:targets.length};
}

/* ---------------------------------------------------------- Jawalite
   What a Marcduino actually sends. `@<board><letter><n>`, where the board
   digit is the Marcduino's own numbering — which does NOT match the LE
   numbering, and that mismatch is worth stating plainly: on the LE side
   the rear logic is 3, here it is 2.

   `T` selects a logic sequence, `P` a PSI sequence — except on the FLD
   and RLD, where P60/P61 pick the font instead, so the same letter means
   two different things depending on the number after it. That is the
   library's, not ours. */
const LE_JAWA_SEQ = {1:LE_SEQ.NORMAL, 2:LE_SEQ.FLASHCOLOR, 3:LE_SEQ.ALARM, 4:LE_SEQ.FAILURE,
                     5:LE_SEQ.REDALERT, 6:LE_SEQ.LEIA, 11:LE_SEQ.MARCH};
function apxJawa(str){
  const s = String(str);
  /* :SE<nn> — a whole show. The stock ones set both logics screaming and
     hand the panels off to the Marcduino, which owns them; the panel half
     is not ours to run, so it is reported rather than faked. */
  let m = s.match(/^:SE(\d+)$/i);
  if(m){
    const n = parseInt(m[1], 10);
    if(n === 1 || n === 50){
      apxLE('LE3010003'); apxLE('LE1010003');
      return {ok:true, sequence:n, why:'scream — both logics on alarm for three seconds; the panel half is the Marcduino\'s'};
    }
    return {ok:true, sequence:n, panels:true,
            why:'sequence ' + n + ' is a panel show — the Marcduino runs it, the lights are untouched'};
  }
  /* Text: @1M top half of the front logic, @2M bottom half, @3M rear. The
     front logic carries the two as ONE string with a newline between
     them, which is why both halves are kept here and re-joined on every
     write — send only @2M and the top half keeps whatever it had. */
  m = s.match(/^@([123])M(.*)$/i);
  if(m){
    const which = parseInt(m[1], 10), text = m[2];
    if(which === 3){
      const d = APX.disp.rld;
      if(d){ leSetText(d, text); leSelectSeq(d, LE_SEQ.TEXTSCROLLLEFT, leRand(9) + 1, 0, 0); }
      return {ok:true, text:text, target:'rld'};
    }
    APX.fldText[which - 1] = text;
    const d = APX.disp.fld;
    if(d){ leSetText(d, APX.fldText.join('\n')); leSelectSeq(d, LE_SEQ.TEXTSCROLLLEFT, leRand(9) + 1, 0, 0); }
    return {ok:true, text:text, target:'fld', half:which};
  }
  m = s.match(/^@(\d)(T|P|D)(\d*)$/i);
  if(m){
    const board = parseInt(m[1], 10), letter = m[2].toUpperCase();
    const n = m[3] === '' ? 0 : parseInt(m[3], 10);
    /* @6/@7/@8 are the holoprojectors on the Marcduino's numbering, and
       `D` there means off rather than "data panel". */
    const holo = {6:'F', 7:'T', 8:'R'}[board];
    if(holo){
      if(letter === 'D') return apxHP('HP' + holo + '0014');
      return apxHP('HP' + holo + '0011');
    }
    if(letter === 'P' && (n === 60 || n === 61))
      return {ok:true, font:(n === 60 ? 'latin' : 'aurabesh'),
              why:'font selection — this simulator draws Latin only'};
    const seq = LE_JAWA_SEQ[n];
    if(seq === undefined) return {ok:false, why:'no Jawalite sequence ' + n};
    /* Marcduino board 1 is the front, 2 the rear, 0 both — for the logics
       under T and for the PSIs under P. */
    const keys = letter === 'T' ? (board === 0 ? ['fld','rld'] : board === 1 ? ['fld'] : ['rld'])
                                : (board === 0 ? ['fpsi','rpsi'] : board === 1 ? ['fpsi'] : ['rpsi']);
    for(const k of keys){ const d = APX.disp[k]; if(d) leSelectSeq(d, seq, 0, 0, 0); }
    apxLog('@ ' + (LE_SEQ_NAME[seq] || seq) + ' · ' + keys.join(' '));
    return {ok:true, effect:seq, targets:keys};
  }
  /* *ON/*OF/*HPS… — the Marcduino's own holo verbs. */
  m = s.match(/^\*(ON|OF|HPS|HRS|RD|ST|HW|HN|HP)(\w*)$/i);
  if(m){
    const verb = m[1].toUpperCase(), rest = m[2] || '';
    const num = {'01':'F', '02':'R', '03':'T', '04':'D', '00':'A'}[rest.slice(-2)] || 'A';
    if(verb === 'ON') return apxHP('HP' + num + '0011');
    if(verb === 'OF' || verb === 'ST') return apxHP('HP' + num + '0014');
    if(verb === 'HPS' || verb === 'HRS'){
      const seq = parseInt(rest[0], 10) || 3;
      return apxHP('HP' + num + '00' + seq);
    }
    return {ok:true, servo:true,
            why:verb + ' moves the holoprojector servos — map them to servo channels on the Panels step'};
  }
  return {ok:false, why:'not a Jawalite command this dome answers: ' + s};
}

/* ------------------------------------------------------------ shortcuts
   What the rest of the app calls. Everything funnels through apxSend()
   so that a cue fired from the sequencer is refused by the same rule as
   one typed into the console — there is no back door that works when the
   wiring says it should not. */
function apxEffect(logicDigit, seq, colour, speed, secs){
  return apxSend('LE' + logicDigit + (seq < 10 ? '0' + seq : seq) +
    (colour || 0) + (speed || 0) + (secs ? (secs < 10 ? '0' + secs : secs) : '00'));
}
function apxHolo(who, seq, colour, speed, secs){
  return apxSend('HP' + who + '0' + (seq < 10 ? '0' + seq : seq) +
    (colour || 0) + (speed || 0) + (secs ? '|' + secs : ''));
}
function apxReset(){
  apxSend('LE000000');
  apxSend('HPA000');
}

/* ------------------------------------------------------------- start-up
   Called once from boot (app/main.js), from apxSetOption() below when the
   sketch or a board variant changes, and from buildApply() in
   config/hardware.js whenever the build's Dome lighting answer changes
   (v1.78.0, review M2). That last caller is new: this comment used to
   promise a re-run "whenever the build answer changes" and nothing made
   the promise good — the wizard's tick wrote `domeLights` through
   buildSet() and APX.on, which only this function writes, kept its old
   value until a reload. Rebuilding is cheap and it is the only way a change
   of board variant can take effect — the pixel grids are sized at build
   time.

   APX.on follows the BUILD, not this pane: a droid whose dome lighting
   answer is Teeces or "none yet" gets the stand-in's idle blink, because
   showing him AstroPixels effects on a dome that has none would be the
   simulator telling him something untrue about his own droid. */
function apxInit(){
  const b = (typeof buildGet === 'function') ? buildGet() : null;
  const saved = (typeof PREFS !== 'undefined' && PREFS.lights) ? PREFS.lights : {};
  apxBuild({
    firmware: saved.firmware || 'standard',
    iface:    saved.iface    || 'serial',
    fldBoard: saved.fldBoard || 'fld',
    psiBoard: saved.psiBoard || 'psi'
  });
  APX.domeLights = b ? (b.domeLights || '') : '';
  APX.on = !!(b && b.domeLights === 'astropixels');
  return APX;
}
function apxSetOption(key, value){
  if(typeof PREFS !== 'undefined'){
    PREFS.lights = Object.assign({}, PREFS.lights || {});
    PREFS.lights[key] = value;
    if(typeof prefsSave === 'function') prefsSave();
  }
  /* A firmware change is a reflash: the boards come up with that sketch's
     own defaults and its boot banner, which is exactly what rebuilding
     does. Patching the live displays instead would leave whatever effect
     was running on them, which no reflash has ever done. */
  const wasOn = APX.on;
  apxInit();
  APX.on = wasOn;
  /* A board variant is a different pixel grid — the toolbox front logic is
     20x9 where the stock one is 9x10 — and the textures and the panels on
     the dome were sized to the old one. They have to go, and lrReset() is
     the one door out of that cache (render3d.js). What stood here before
     tested `LR.built`, `LR.rig` and `LR.panels`, three fields render3d.js
     has never had, so it was never once taken: a changed board kept its
     old texture and the next upload wrote 720 bytes at a 360-byte buffer
     (v1.78.0, review M3). The sketch and the wiring answer change nothing
     about the grid, so they leave the rig where it is; the palette they do
     change reaches it through the next dirty upload. */
  if((key === 'fldBoard' || key === 'psiBoard') && typeof lrReset === 'function') lrReset();
  return APX;
}
