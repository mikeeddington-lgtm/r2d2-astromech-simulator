'use strict';
/* =====================================================================
   WIRING REFERENCE

   The bench document. It answers the one question the sim cannot answer
   from the screen: I am holding a servo lead — which channel does it go to,
   and which flap will it move?

   Rows are built from whatever is actually driving the droid right now, so
   the sheet follows the active firmware profile: PCA9685 board/channel for
   mod2026, Maestro board/channel for the two Maestro sketches.
   ===================================================================== */

/* =====================================================================
   SYSTEM DIAGRAM — the control loom

   The servo table below answers "which channel is this flap on". This
   answers the question before it: which wire goes from the Arduino to
   each board, and which pin does it leave from.

   Buses come from the ACTIVE SKETCH, not from a generic astromech
   drawing, because that is the whole point — Serial3 for the Maestro on
   the 2025 sketch but SoftwareSerial(10,11) on the 2022 BETA, Serial1
   for the Sabertooth but pins 44/45 for hub ESCs. Pin numbers are the
   Mega's: Serial0 TX 1, Serial1 TX 18, Serial2 TX 16, Serial3 TX 14,
   I2C SDA 20 / SCL 21.

   A link the chosen sketch does not actually drive (dome lighting, or a
   Maestro while running mod2026) is drawn dashed and labelled, rather
   than left off — it is still a wire you have to run.
   ===================================================================== */

/* =====================================================================
   BETA (v1.45.0) — Mike: "Mark wiring images as Beta."

   Both diagrams are DERIVED: the buses come from whichever sketch is
   loaded and the channels from the build answers, so they are right about
   the sim and only as right about your droid as the answers you gave.
   Nobody should find that out with a stripped wire in their hand — so the
   badge goes on the picture itself, in the app AND in the exported sheet
   (which is the copy that ends up printed on a bench, away from any of
   this UI), with one plain sentence saying what beta means here.

   Amber is --am, the warning token that already exists (01-tokens.css);
   the SVG asks for it with a hard fallback because the exported sheet is a
   standalone file with none of the app's tokens in it.
   ===================================================================== */
const WIRING_BETA_WHY = 'the picture is a guide, not a datasheet — check it against '
  + 'the board\'s own pinout before you cut a wire.';
const WIRING_BETA_AM = 'var(--am,#f2a63c)';
/* THE BADGE, top right. Right-anchored because both diagrams put a title and
   a profile line down the left, and those grow with the sketch's filename. */
function wiringBetaBadge(rightX, y){
  const w = 46, h = 16;
  return '<g class="wdbeta">'
    + '<rect x="'+(rightX-w)+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="4" fill="none" stroke="'+WIRING_BETA_AM+'" stroke-width="1.4"/>'
    + '<text x="'+(rightX-w/2)+'" y="'+(y+11.5)+'" font-size="9.5" font-weight="700" letter-spacing=".12em" '
    + 'text-anchor="middle" fill="'+WIRING_BETA_AM+'">BETA</text></g>';
}
/* AND THE SENTENCE, on a line of its own at the foot of the picture. It went
   under the badge first, which put it straight through the profile line on any
   build whose sketch has a long filename — and a warning you cannot read is
   not a warning. Its own row, left-aligned with everything else, above the
   legend. Both diagrams reserve WIRING_BETA_H for it. */
const WIRING_BETA_H = 18;
function wiringBetaLine(x, y){
  return '<text class="wdbeta" x="'+x+'" y="'+y+'" font-size="9.5" fill="'+WIRING_BETA_AM+'">'
    + WIRING_BETA_WHY.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</text>';
}
function systemLinks(){
  const b = (typeof buildGet === 'function') ? buildGet() : null;
  const p = (typeof PROFILE !== 'undefined' && PROFILE) ? PROFILE : null;
  const L = [];
  const add = (o)=>L.push(Object.assign({live:true, dir:'out'}, o));

  /* input */
  add({name: b ? buildLabel('controller', b.controller) : 'Xbox 360 wireless',
       sub:'controller', bus:'USB host', pins:'on-board USB (ADK) or host shield', dir:'in',
       live: !b || b.controller !== 'rc',
       why: (b && b.controller === 'rc') ? 'no RC input layer exists in any of the three sketches yet' : ''});

  /* feet */
  const pwm = (typeof CFG !== 'undefined' && CFG.FOOT_CONTROLLER === 1) || (b && b.bodyDrive === 'flipsky');
  if(pwm){
    add({name:'Left FSESC + hub motor',  sub:'foot drive', bus:'PWM', pins:'pin 44 (R/C mode)',
         live: !!(p && p.footPWM && p.footPWM())});
    add({name:'Right FSESC + hub motor', sub:'foot drive', bus:'PWM', pins:'pin 45 (R/C mode)',
         live: !!(p && p.footPWM && p.footPWM())});
  }else{
    add({name:'Sabertooth 2x25', sub:'foot drive', bus:'Serial1 @ 9600', pins:'TX1 pin 18 → S1',
         extra:'address 128 · setTimeout(950)', live: !(p && p.footPWM && p.footPWM())});
  }

  /* dome rotation */
  if(!b || b.domeMotor !== 'none')
    add({name: b ? buildLabel('domeMotor', b.domeMotor) : 'Syren10', sub:'dome rotation',
         bus:'Serial2 @ 9600', pins:'TX2 pin 16 → S1', extra:'address 128 · setTimeout(950)'});

  /* servo boards */
  const maeBus = (p && p.id === 'maestro22')
    ? {bus:'SoftwareSerial', pins:'pins 10 (RX) / 11 (TX)'}
    : {bus:'Serial3 @ 9600',  pins:'TX3 pin 14 → RX'};
  const servoLink = (loc, label) => {
    const hw = b ? b[loc === 'body' ? 'bodyServo' : 'domeServo'] : (loc==='dome'?'mini24':'mod2026');
    if(hw === 'mod2026'){
      add({name:'PCA9685 '+(loc==='body'?'0x40':'0x41'), sub:label, bus:'I2C @ 60 Hz',
           pins:'SDA pin 20 · SCL pin 21', live: !!(p && p.hasServos),
           why: (p && !p.hasServos) ? 'this sketch drives a Maestro, not PCA9685 boards' : ''});
      return;
    }
    /* v1.33.0 — the MaestroPCA co-processor. From the HOST's side this row
       is identical to a Maestro's, which is the entire point; what differs
       is that the servos are one hop further out, so the row grows a CHAIN
       box rather than pretending the expanders are on this UART. */
    const boards = (typeof servoCoprocBoards === 'function') ? servoCoprocBoards(hw) : 0;
    if(boards){
      const mcu = (typeof servoMcuOpt === 'function') ? servoMcuOpt() : {label:'Arduino Nano', sda:'A4', scl:'A5'};
      add({name:'MaestroPCA co-processor — '+mcu.label, sub:label, bus:maeBus.bus, pins:maeBus.pins,
           live: !!(p && p.hasMaestro),
           extra:'subroutines fired by restartScript(0-7) — a drop-in Maestro',
           chain:{name:boards+' × PCA9685'+(boards>1?' (0x40 + 0x41)':' (0x40)'),
                  bus:'I2C · SDA '+mcu.sda+' · SCL '+mcu.scl,
                  /* the gap between the two boxes is 40 px — enough for the
                     bus NAME and nothing else, so the pins travel with the
                     box instead of running under the arrowhead */
                  busShort:'I2C',
                  sub:(boards*16)+' servo channels · SDA '+mcu.sda+' · SCL '+mcu.scl},
           why: (p && !p.hasMaestro) ? 'mod2026 never opens a serial port to a Maestro' : ''});
      return;
    }
    add({name: boardById(hw).product, sub:label, bus:maeBus.bus, pins:maeBus.pins,
         live: !!(p && p.hasMaestro),
         extra: 'subroutines fired by restartScript(0-7)',
         why: (p && !p.hasMaestro) ? 'mod2026 never opens a serial port to a Maestro' : ''});
  };
  /* one row per BOARD. A shared controller is one row — which is also the
     honest drawing, since there is one wire (v1.34.0). */
  const locs = (typeof buildServoLocs === 'function') ? buildServoLocs() : ['dome','body'];
  locs.forEach(loc=>servoLink(loc,
    loc === 'both' ? 'dome panels, body doors & arms'
    : loc === 'dome' ? 'dome panels' : 'body doors & arms'));

  /* sound */
  add({name: b ? buildLabel('sound', b.sound) : (p ? p.audio : 'DY-SV5W'), sub:'sound',
       bus:'Serial0 @ 9600', pins:'TX0 pin 1 → RX',
       extra: (p && p.audio === 'DY-SV5W') ? '⚠ the sketch also prints to this UART' : '',
       live: !b || !p || buildLabel('sound', b.sound) === p.audio,
       why: (b && p && buildLabel('sound', b.sound) !== p.audio) ? 'this sketch drives a '+p.audio : ''});

  /* lights + odds */
  if(b && b.domeLights !== 'none')
    add({name: buildLabel('domeLights', b.domeLights), sub:'dome lighting',
         bus: b.domeLights === 'astropixels' ? 'single data line' : 'SPI-style chain',
         pins:'a spare digital pin', live:false,
         why:'no lighting code in any of the three sketches — run the wire, drive it separately for now'});
  add({name:'Fire extinguisher relay', sub:'prop', bus:'digital', pins:'pin 3 (held HIGH)', live:true});

  return L;
}

function systemDiagramSvg(){
  const links = systemLinks();
  const b = (typeof buildGet === 'function') ? buildGet() : null;
  const mcu = b ? buildLabel('arduino', b.arduino) : 'Arduino Mega';
  const rowH = 54, top = 58;
  /* A co-processor row has one more hop in it — host → co-processor → the
     expanders — so the canvas gains a third column rather than squeezing
     that fact into the peripheral box's subtitle. Only when something
     actually needs it: a Maestro-or-mod2026 build draws exactly as before,
     at exactly the old width. */
  const chained = links.some(k => k.chain);
  const chainX = 990, chainW = 300;
  const W = chained ? (chainX + chainW + 30) : 980;
  const H = top + links.length*rowH + 26 + WIRING_BETA_H;   // v1.45.0 — room for the beta line
  const mcuX = 30, mcuW = 190;
  const boxX = 560, boxW = 390;
  const midX = 380;
  const mcuY = top + 6, mcuH = links.length*rowH - 22;
  const esc = s => String(s===undefined||s===null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const clip = (t,n) => { t = String(t||''); return t.length>n ? t.slice(0,n-1)+'…' : t; };

  let s = '<svg class="wd sysd" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,Consolas,monospace">';
  s += '<text x="'+mcuX+'" y="22" font-size="14" font-weight="700">Control signals — '+esc(mcu)+'</text>';
  s += '<text x="'+mcuX+'" y="38" font-size="10" fill="#777">'
     + esc((typeof PROFILE!=='undefined'&&PROFILE) ? PROFILE.name+' · '+PROFILE.file : '')
     + ' — signal and ground only, no V+ lines</text>';
  s += wiringBetaBadge(W-24, 10);                     // v1.45.0 — see WIRING_BETA_WHY
  s += '<rect x="'+mcuX+'" y="'+mcuY+'" width="'+mcuW+'" height="'+mcuH+'" rx="8" fill="#1c4d2e" stroke="#333" stroke-width="1.5"/>';
  s += '<text x="'+(mcuX+mcuW/2)+'" y="'+(mcuY+mcuH/2-4)+'" font-size="12" fill="#e8f2ea" text-anchor="middle">'+esc(mcu)+'</text>';
  s += '<text x="'+(mcuX+mcuW/2)+'" y="'+(mcuY+mcuH/2+12)+'" font-size="9" fill="#9dc3ab" text-anchor="middle">4 hardware UARTs · USB host</text>';

  links.forEach((k,i)=>{
    const y = top + i*rowH + rowH/2;
    const col = k.live ? 'hsl('+((i*53)%360)+',58%,40%)' : '#999';
    const dash = k.live ? '' : ' stroke-dasharray="5 4"';
    const px = mcuX + mcuW;
    /* elbow from the board edge out to the peripheral */
    s += '<path d="M'+px+' '+y+' H '+boxX+'" fill="none" stroke="'+col+'" stroke-width="'+(k.live?1.8:1.3)+'"'+dash+'/>';
    /* arrow head: which way the bytes go */
    const ax = k.dir === 'in' ? px + 12 : boxX - 12;
    const dx = k.dir === 'in' ? -9 : 9;
    s += '<path d="M'+ax+' '+(y-4)+' L'+(ax+dx)+' '+y+' L'+ax+' '+(y+4)+' Z" fill="'+col+'"/>';
    /* bus label sits on the line */
    s += '<rect x="'+(midX-100)+'" y="'+(y-19)+'" width="252" height="17" fill="#fff" opacity=".92"/>';
    s += '<text x="'+(midX-96)+'" y="'+(y-7)+'" font-size="9.5" fill="#333">'+esc(clip(k.bus+' · '+k.pins, 46))+'</text>';
    if(k.extra) s += '<text x="'+(midX-96)+'" y="'+(y+13)+'" font-size="8.5" fill="#888">'+esc(clip(k.extra, 50))+'</text>';
    /* peripheral box */
    s += '<rect x="'+boxX+'" y="'+(y-17)+'" width="'+boxW+'" height="34" rx="5" fill="'+(k.live?'#f6f8fa':'#f0f0f0')+'" stroke="'+(k.live?'#8a949e':'#c4c4c4')+'"/>';
    s += '<text x="'+(boxX+10)+'" y="'+(y-3)+'" font-size="10.5" font-weight="600" fill="'+(k.live?'#111':'#777')+'">'+esc(k.name)+'</text>';
    /* SVG will not wrap, and an over-long note ran out past the box edge */
    s += '<text x="'+(boxX+10)+'" y="'+(y+11)+'" font-size="8.5" fill="#777">'+esc(clip(k.sub + (k.why? ' — '+k.why : ''), 62))+'<title>'+esc(k.sub+(k.why?' — '+k.why:''))+'</title></text>';
    /* the second hop, when there is one */
    if(k.chain){
      s += '<path d="M'+(boxX+boxW)+' '+y+' H '+chainX+'" fill="none" stroke="'+col+'" stroke-width="'+(k.live?1.8:1.3)+'"'+dash+'/>';
      s += '<path d="M'+(chainX-12)+' '+(y-4)+' L'+(chainX-3)+' '+y+' L'+(chainX-12)+' '+(y+4)+' Z" fill="'+col+'"/>';
      s += '<text x="'+(boxX+boxW+6)+'" y="'+(y-6)+'" font-size="8" fill="#333">'+esc(k.chain.busShort || clip(k.chain.bus, 6))+'</text>';
      s += '<rect x="'+chainX+'" y="'+(y-17)+'" width="'+chainW+'" height="34" rx="5" fill="'+(k.live?'#f6f8fa':'#f0f0f0')+'" stroke="'+(k.live?'#8a949e':'#c4c4c4')+'"/>';
      s += '<text x="'+(chainX+10)+'" y="'+(y-3)+'" font-size="10.5" font-weight="600" fill="'+(k.live?'#111':'#777')+'">'+esc(k.chain.name)+'</text>';
      s += '<text x="'+(chainX+10)+'" y="'+(y+11)+'" font-size="8.5" fill="#777">'+esc(clip(k.chain.sub, 44))+'<title>'+esc(k.chain.bus)+'</title></text>';
    }
  });
  s += wiringBetaLine(mcuX, H-26);
  s += '<g font-size="9.5"><line x1="'+mcuX+'" y1="'+(H-8)+'" x2="'+(mcuX+28)+'" y2="'+(H-8)+'" stroke="#2a7" stroke-width="1.8"/>'
     + '<text x="'+(mcuX+34)+'" y="'+(H-5)+'">driven by this sketch</text>'
     + '<line x1="'+(mcuX+190)+'" y1="'+(H-8)+'" x2="'+(mcuX+218)+'" y2="'+(H-8)+'" stroke="#999" stroke-width="1.3" stroke-dasharray="5 4"/>'
     + '<text x="'+(mcuX+224)+'" y="'+(H-5)+'">wire it, but this sketch does not talk to it</text>'
     + '<text x="'+(mcuX+610)+'" y="'+(H-5)+'" fill="#b00">all grounds common — no V+ shown</text></g>';
  s += '</svg>';
  return s;
}

/* every actuator worth a row, in an order that matches how you would wire it */
const WIRING_ORDER = [
  'doorL','doorR','doorRL','doorRR','smallDoor','dataport','chargebay','drawer',
  'utilUp','utilLo','gripArm','claw','interArm','interTool'
].concat(Array.from({length:PIE_COUNT},  (_,i)=>'pie'+i))
 .concat(Array.from({length:PANEL_COUNT},(_,i)=>'panel'+i));

function actFriendly(act){
  const hit = PART_LIST.find(p => p[1] === act);
  if(hit) return hit[0];
  /* v1.40.0: 'Other N' placeholders are not in PART_LIST — same rule as
     actPartLabel, so the wiring sheet and brick lanes never show raw ids */
  const oth = /^oth(\d+)$/.exec(act || '');
  if(oth) return 'Other ' + oth[1];
  /* v1.41.0: Builder joints, same seam */
  if(typeof mbIsAct === 'function' && mbIsAct(act) && typeof builderActLabel === 'function')
    return builderActLabel(act);
  return act;
}

/* Where this actuator's signal comes from.
   BUG FIXED 2026-07-27 (Mike): this used to consult only `MSTR`, the ONE
   loaded settings file. A build with a Maestro in the dome AND one in the
   body therefore printed the dome board and silently dropped every body
   channel from the sheet. It now walks BOTH configured locations through
   hwPins(), which is the same source the Boards cards read, so whatever you
   can see on a board card appears on the sheet. */
function wiringSource(act){
  /* Every board this build actually has, dome first. The sheet follows the
     BUILD, not the running sketch: it is a bench document, and what matters
     at the bench is which board the lead plugs into. A PCA9685 short-circuit
     used to sit above this and made the sheet ignore the build's answer. */
  if(typeof hwPins === 'function' && typeof hwGet === 'function'){
    for(const loc of (typeof hwLocs === 'function' ? hwLocs() : ['dome','body'])){
      let info;
      try{ info = hwPins(loc); }catch(e){ continue; }
      const p = info.pins.find(x => x.act === act);
      if(!p) continue;
      const hw = hwAt(loc);
      if(hw === 'mod2026'){
        const board = (loc === 'body') ? 1 : 2;
        const d = SERVO_DEFS[board].find(x => x.act === act);
        return {
          board: 'PCA9685 ' + (board === 1 ? '0x40' : '0x41') + ' · ' + loc,
          ch: p.pin, name: p.name,
          travel: (d && CFG[d.lo]!==undefined && CFG[d.hi]!==undefined)
            ? CFG[d.lo]+'–'+CFG[d.hi]+' ticks (≈'+Math.round(CFG[d.lo]*4.069)+'–'+Math.round(CFG[d.hi]*4.069)+' µs)'
            : '',
          invert: ''
        };
      }
      /* a Maestro: take the endpoints from the loaded settings when this is
         the live board, otherwise say so rather than inventing numbers */
      const live = PROFILE.hasMaestro && MSTR.loaded && MSTR.board === hw;
      const c = live ? MSTR.channels[p.pin] : null;
      return {
        board: boardById(hw).label + ' · ' + loc,
        ch: p.pin, name: p.name,
        travel: c ? (Math.round(Math.min(c.min,c.max)/4) + '–' + Math.round(Math.max(c.min,c.max)/4) + ' µs')
                  : 'set on the board',
        invert: c && c.invert ? 'yes' : ''
      };
    }
  }
  /* Deliberately NO fallback to the loaded .mstr here. If an actuator is
     mapped in the settings file but is not on either board this build has,
     it is not driven — and saying so puts it in the sheet's "rigged but
     nothing drives them" section, which is the truth a builder needs. A
     fallback would have printed a board that is not in the droid. */
  return null;
}

function wiringRows(){
  /* v1.41.0: Builder joints print on the sheet like everything else (Mike's
     decision — a finished build gets a full wiring sheet). WIRING_ORDER is
     static and bldJ* acts only exist while a build is on the stage, so the
     extension has to happen at row time, not at load. */
  const order = WIRING_ORDER.concat(
    Object.keys(ACT).filter(k => /^bldJ\d+t?$/.test(k) && WIRING_ORDER.indexOf(k) < 0));
  return order.map(act => {
    const parts = actCadParts(act);
    const az = actAzimuth(act);
    const src = wiringSource(act);
    return {
      act,
      friendly: actFriendly(act),
      cad: parts.map(p => (typeof partHasLabel==='function' && partHasLabel(p.name)) ? p.base+' \u201c'+partLabel(p.name)+'\u201d' : p.base).join(' + '),
      kind: parts.length ? parts[0].kind : '',
      az, azWord: azWord(az),
      board: src ? src.board : '',
      ch: src ? src.ch : '',
      chName: src ? src.name : '',
      travel: src ? src.travel : '',
      invert: src ? src.invert : ''
    };
  }).filter(r => r.cad || r.board);   // drop actuators that exist in neither
}

function wiringCsv(){
  const rows = wiringRows();
  const head = ['Actuator','Part','CAD name','Group','Bearing','Position','Board','Channel','Channel name','Travel','Inverted'];
  const esc = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  return [head.join(',')].concat(rows.map(r => [
    r.act, r.friendly, r.cad, r.kind,
    r.az === null ? '' : r.az.toFixed(0) + '°', r.azWord,
    r.board, r.ch === '' ? '' : r.ch, r.chName, r.travel, r.invert
  ].map(esc).join(','))).join('\n') + '\n';
}

/* schematic wiring diagram: board on the left, one servo block per driven
   channel on the right, SIGNAL and GROUND lines only — power distribution is
   deliberately left to the builder (Mike's call: too build-specific).

   ONE BOX PER BOARD (2026-08-22). This drew a single board and hung every
   channel off it, taking the whole sheet's title from `wired[0].board`.
   That was survivable while wiringSource() only ever answered from one
   location; it stopped being survivable when wiringSource() was fixed to
   walk BOTH board locations, because the default build is a two-board build
   (servoSplit:'two'). The picture then showed two physically separate
   boards as one component and printed the pin column as 0,0,1,1,2,2… —
   every channel number appearing twice, on the page a builder prints and
   wires from at the bench. Two boards means two boxes, each with its own
   pins, its own ground bus and its own name over it. */
function wiringDiagramSvg(rows){
  const wired = rows.filter(r=>r.board);
  if(!wired.length) return '';
  /* group in first-seen order — wiringSource() walks the locations dome
     first, so the sections come out in the order the build lists them */
  const groups = [];
  wired.forEach(r=>{
    let g = groups.find(x=>x.board === r.board);
    if(!g){ g = {board:r.board, rows:[]}; groups.push(g); }
    g.rows.push(r);
  });
  groups.forEach(g=>g.rows.sort((a,b)=>(a.ch===''?99:a.ch)-(b.ch===''?99:b.ch)));

  const rowH = 34, W = 980, headH = 46, sectGap = 22;
  const boardX = 40, boardW = 190;
  const sx = boardX + boardW;                          // pin exit x
  const gndBusX = sx + 40;
  const servoX = 700, servoW = 240;
  const hue = i => 'hsl('+(i*47)%360+',60%,42%)';
  const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');

  const sectH = g => headH + g.rows.length*rowH + sectGap;
  const H = 14 + groups.reduce((n,g)=>n+sectH(g), 0) + 40 + WIRING_BETA_H;

  let s = '<svg class="wd" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,Consolas,monospace">';
  s += wiringBetaBadge(W-24, 10);                     // v1.45.0 — see WIRING_BETA_WHY

  let y0 = 14;
  groups.forEach(g=>{
    const n = g.rows.length;
    const top = y0 + headH;
    const boardH = Math.max(90, n*rowH*0.75);
    const boardY = top + (n*rowH - boardH)/2;
    /* the group carries the board's own name so nothing downstream — a
       reader, a test, a future renderer — has to infer which box a channel
       belongs to from its position on the page */
    s += '<g data-board="'+esc(g.board)+'">';
    s += '<text x="'+boardX+'" y="'+(y0+22)+'" font-size="14" font-weight="700">'+ esc(g.board) +'</text>';
    s += '<text x="'+boardX+'" y="'+(y0+36)+'" font-size="10" fill="#777">'+ n +' channel'+(n===1?'':'s')
       + ' — signal + ground only, power distribution is your build\'s business</text>';
    s += '<rect x="'+boardX+'" y="'+boardY+'" width="'+boardW+'" height="'+boardH+'" rx="8" fill="#1c4d2e" stroke="#333" stroke-width="1.5"/>';
    s += '<text x="'+(boardX+boardW/2)+'" y="'+(boardY+boardH/2)+'" font-size="11" fill="#cde" text-anchor="middle">'+ esc(g.board) +'</text>';
    g.rows.forEach((r,i)=>{
      const y = top + i*rowH + rowH/2;
      const pinY = boardY + 14 + i*((boardH-28)/Math.max(1,n-1||1));
      // pin stub + label
      s += '<circle cx="'+sx+'" cy="'+pinY+'" r="3.5" fill="#ddd" stroke="#333"/>';
      s += '<text class="pin" x="'+(sx-8)+'" y="'+(pinY+3)+'" font-size="9" fill="#fff" text-anchor="end">'+r.ch+'</text>';
      // signal line: pin -> elbow -> servo block
      const c = hue(i);
      s += '<path d="M'+(sx+4)+' '+pinY+' H '+(gndBusX+30+i*9)+' V '+y+' H '+servoX+'" fill="none" stroke="'+c+'" stroke-width="1.6"/>';
      // servo block
      s += '<rect x="'+servoX+'" y="'+(y-13)+'" width="'+servoW+'" height="26" rx="4" fill="#f4f4f4" stroke="#888"/>';
      const label = (r.friendly||r.act) + (r.cad ? '' : '  (no CAD part)');
      s += '<text x="'+(servoX+8)+'" y="'+(y-1)+'" font-size="10" font-weight="600">'+esc(label)+'</text>';
      s += '<text x="'+(servoX+8)+'" y="'+(y+10)+'" font-size="8.5" fill="#666">ch '+r.ch+' · SIG '+(r.travel||'')+'</text>';
      // ground line from servo block to the ground bus
      s += '<path d="M'+servoX+' '+(y+8)+' H '+gndBusX+'" fill="none" stroke="#555" stroke-width="1.1" stroke-dasharray="4 3"/>';
    });
    /* this board's OWN ground bus — the boards do not share one here, and
       drawing them joined would be a claim about the loom we cannot make */
    const busTop = top + rowH/2 + 8, busBot = top + (n-1)*rowH + rowH/2 + 8;
    s += '<path d="M'+gndBusX+' '+busTop+' V '+Math.max(busBot, boardY+boardH-10)+' H '+(sx+4)+'" fill="none" stroke="#555" stroke-width="1.6"/>';
    s += '<text x="'+(gndBusX+5)+'" y="'+(busTop-6)+'" font-size="9" fill="#555">GND bus → board GND</text>';
    s += '</g>';
    y0 += sectH(g);
  });

  s += wiringBetaLine(boardX, H-32);
  // legend
  s += '<g font-size="9.5">'
    + '<line x1="'+boardX+'" y1="'+(H-14)+'" x2="'+(boardX+30)+'" y2="'+(H-14)+'" stroke="'+hue(0)+'" stroke-width="1.6"/><text x="'+(boardX+36)+'" y="'+(H-11)+'">signal</text>'
    + '<line x1="'+(boardX+100)+'" y1="'+(H-14)+'" x2="'+(boardX+130)+'" y2="'+(H-14)+'" stroke="#555" stroke-width="1.1" stroke-dasharray="4 3"/><text x="'+(boardX+136)+'" y="'+(H-11)+'">ground</text>'
    + '<text x="'+(boardX+220)+'" y="'+(H-11)+'" fill="#b00">no V+ lines shown — fuse and distribute servo power per your own plan</text></g>';
  s += '</svg>';
  const title = groups.length > 1
    ? 'Wiring diagram — signal &amp; ground, ' + groups.length + ' boards'
    : 'Wiring diagram — signal &amp; ground';
  return '<h2>' + title + ' <span class="bmark">beta</span></h2>' + s;
}

function wiringHtml(){
  const rows = wiringRows();
  /* three disjoint groups — a row must appear exactly once */
  const wired     = rows.filter(r => r.board && r.cad);
  const orphanCad = rows.filter(r => r.cad && !r.board);
  const orphanCh  = rows.filter(r => r.board && !r.cad);
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  /* LOCAL time, like the filename this document arrives under. fileStamp()
     (core/util.js) is explicitly local — "the stamp exists to be recognised
     by the person who pressed the button" — and this line was UTC, so an
     export at 09:00 in UTC+10 downloaded as `…-0900.html` and then printed
     "generated 2026-08-21 23:00": a different clock time and a different
     date, on the same sheet. Derived from fileStamp() rather than
     re-implemented, so the two can never drift apart again. */
  const fs = fileStamp();
  const stamp = fs.slice(0,10) + ' ' + fs.slice(11,13) + ':' + fs.slice(13,15);

  const tr = r => `<tr${r.board ? '' : ' class="un"'}>
    <td class="m act">${esc(r.act)}</td>
    <td>${esc(r.friendly)}</td>
    <td class="m cad">${esc(r.cad) || '<span class="none">no CAD part</span>'}</td>
    <td class="n">${r.az === null ? '' : r.az.toFixed(0) + '&deg;'}</td>
    <td class="w">${esc(r.azWord)}</td>
    <td>${esc(r.board) || '<span class="none">not driven</span>'}</td>
    <td class="n b">${r.ch === '' ? '' : esc(r.ch)}</td>
    <td class="m">${esc(r.chName)}</td>
    <td class="n">${esc(r.travel)}</td>
    <td class="n">${esc(r.invert)}</td>
    <td class="tick"></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>R2-D2 wiring reference — ${esc(PROFILE.short || PROFILE.name)}</title>
<style>
  *{box-sizing:border-box}
  body{font:12px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:22px;max-width:1100px}
  h1{font-size:19px;margin:0 0 2px}
  .sub{color:#555;font-size:11px;margin-bottom:14px}
  .note{background:#fff8e6;border-left:3px solid #d9a300;padding:8px 11px;font-size:11px;margin:0 0 16px;line-height:1.6}
  table{border-collapse:collapse;width:100%;margin-bottom:22px}
  th{text-align:left;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#666;
     border-bottom:1.5px solid #333;padding:5px 6px;white-space:nowrap}
  td{border-bottom:1px solid #e3e3e3;padding:4px 6px;vertical-align:top}
  tr:nth-child(even) td{background:#fafafa}
  .m{font-family:ui-monospace,Consolas,monospace;font-size:11px}
  .cad{color:#0a5}
  .n{text-align:right;white-space:nowrap}
  .b{font-weight:700}
  .w{color:#666;font-size:11px}
  .none{color:#b00;font-style:italic}
  tr.un td{background:#fff4f4}
  .tick{width:34px;border-left:1px solid #ccc}
  h2{font-size:13px;margin:20px 0 6px}
  footer{color:#777;font-size:10px;border-top:1px solid #ddd;padding-top:8px;margin-top:8px}
  .wd{width:100%;height:auto;border:1px solid #ddd;border-radius:6px;background:#fff;margin-bottom:18px}
  table.bld{width:auto;min-width:60%}
  table.bld th{text-align:left;width:130px;border-bottom:1px solid #eee;text-transform:none;font-size:11px;color:#333}
  table.bld td{font-size:11px}
  .park{color:#b26b00;font-size:10px;border:1px solid #e8c37a;border-radius:3px;padding:0 4px}
  /* v1.45.0 — the diagrams are beta, and this is the copy that gets printed
     and taken to the bench, so it says so here as well as on screen */
  .bmark{color:#b26b00;font-family:ui-monospace,Consolas,monospace;font-size:9px;letter-spacing:.12em;
     text-transform:uppercase;border:1px solid #e8c37a;border-radius:9px;padding:1px 6px;vertical-align:2px}
  .note.beta{background:#fff4e2;border-left-color:#b26b00}
  @media print{ body{margin:0;max-width:none} .note{background:none} tr:nth-child(even) td{background:none} }
</style></head><body>
<h1>R2-D2 MK4 — wiring reference</h1>
<div class="sub">${esc(PROFILE.name)} &middot; ${esc(PROFILE.file || '')} &middot; generated ${stamp}</div>

<p class="note beta"><span class="bmark">beta</span> <b>The two diagrams below are beta.</b>
They are drawn from the sketch that is loaded and the answers you gave in the setup, so
${esc(WIRING_BETA_WHY)} The tables are the part you can trust to the channel.</p>

${typeof buildSummaryRows === 'function' ? `<h2>The build</h2>
<table class="bld"><tbody>
${buildSummaryRows().map(r=>`<tr><th>${esc(r.title)}</th><td>${esc(r.label)}${r.sim==='park'?' <span class="park">not simulated</span>':''}</td><td class="w">${esc(r.note)}</td></tr>`).join('\n')}
</tbody></table>` : ''}

${typeof systemDiagramSvg === 'function' ? '<h2>Control signals <span class="bmark">beta</span></h2>' + systemDiagramSvg() : ''}

<p class="note"><b>Two naming systems.</b> <b>CAD name</b> is from the Fusion model
(MrBaddeley MK4) and is what the printed part is called. <b>Actuator</b> is the
simulator's ID, numbered <b>by position around the droid</b>, front first —
so they deliberately do not match: <code>pie0</code> is <code>MainPie3</code>.
Wire to the channel, label the loom with the CAD name, and use the bearing to
find it on the droid. <b>Bearing</b> is degrees clockwise from the front.</p>

<h2>Driven — ${wired.length} channel${wired.length===1?'':'s'}</h2>
<table><thead><tr>
<th>Actuator</th><th>Part</th><th>CAD name</th><th>Bearing</th><th>Position</th>
<th>Board</th><th>Ch</th><th>Channel name</th><th>Travel</th><th>Inv</th><th>&#10003;</th>
</tr></thead><tbody>
${wired.map(tr).join('\n')}
</tbody></table>

${orphanCad.length ? `<h2>Rigged in the model but nothing drives them — ${orphanCad.length}</h2>
<table><thead><tr>
<th>Actuator</th><th>Part</th><th>CAD name</th><th>Bearing</th><th>Position</th>
<th>Board</th><th>Ch</th><th>Channel name</th><th>Travel</th><th>Inv</th><th>&#10003;</th>
</tr></thead><tbody>
${orphanCad.map(tr).join('\n')}
</tbody></table>` : ''}

${orphanCh.length ? `<h2>Driven, but not in the CAD exports — ${orphanCh.length}</h2>
<p class="sub">The firmware has channels for these, but the geometry for them was
never exported from Fusion, so there is nothing to check them against on screen.</p>
<table><thead><tr>
<th>Actuator</th><th>Part</th><th>CAD name</th><th>Bearing</th><th>Position</th>
<th>Board</th><th>Ch</th><th>Channel name</th><th>Travel</th><th>Inv</th><th>&#10003;</th>
</tr></thead><tbody>
${orphanCh.map(tr).join('\n')}
</tbody></table>` : ''}

${wiringDiagramSvg(rows)}

<footer>Generated by the R2-D2 Astromech Simulator. Travel figures are the
endpoints currently set in the sim, not measured on the droid — check each one
against its mechanical limits before running it at speed. Geometry: MrBaddeley
Printed Droid MK4.</footer>
</body></html>
`;
}

function downloadWiring(kind){
  const csv  = (kind === 'csv');
  const text = csv ? wiringCsv() : wiringHtml();
  const blob = new Blob([text], {type: csv ? 'text/csv' : 'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  /* v1.45.0 — Mike: "Add date and time, without seconds, to saved/exported
     filenames." A wiring sheet is a bench document you re-export every time
     the loom changes, so which one is on the printer matters; fileStamp()
     (core/util.js) is local time to the minute. */
  a.download = 'R2-wiring-' + (PROFILE.id || 'profile') + '-' + fileStamp() + (csv ? '.csv' : '.html');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  const rows = wiringRows();
  lg('sys', 'wiring reference exported: ' + a.download + ' — ' + rows.filter(r=>r.board).length
     + ' driven, ' + rows.filter(r=>!r.board).length + ' unassigned');
  return a.download;
}
