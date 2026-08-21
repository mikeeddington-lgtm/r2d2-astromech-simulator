'use strict';
const STARTER_BODY = [
  'FL Breadpan Door','FR Breadpan Door','RL Breadpan Door','RR Breadpan Door',
  'Small Long Door','Dataport Door','Charging Bay Door',
  'Upper Utility Arm','Lower Utility Arm','Drawer',
  'Gripper Arm','Gripper Claw','Interface Arm','Interface Tool'
];
/* The real MK4 dome has SIX moving pies (the outer MainPies are printed as
   one piece with the dome) plus 14 side panels = 20 channels — fits a Mini 24
   with four spare. Pies first, panels fill the rest. */
const STARTER_DOME = []
  .concat(Array.from({length:6},(_,i)=>'Dome Pie '+(i+1)))
  .concat(Array.from({length:14},(_,i)=>'Dome Panel '+(i+1)));

/* Rough bytecode size, so the UI can warn before you paste a script the board
   cannot hold. The Maestro packs runs of consecutive literals behind one
   LITERAL_N opcode plus a count byte, so runs are counted, not tokens. This is
   an estimate — always trust Control Center's own figure over this one. */
function scriptBytesEstimate(src){
  const toks = src.split('\n').map(l=>{const i=l.indexOf('#'); return i<0?l:l.slice(0,i);})
                  .join('\n').split(/\s+/).filter(Boolean);
  let bytes = 0, run = [];
  const flushRun = ()=>{
    if(!run.length) return;
    const wide = run.some(v=>v<0 || v>255);
    bytes += 2 + run.length * (wide?2:1);   // opcode + count + payload
    run = [];
  };
  for(let i=0;i<toks.length;i++){
    const t = toks[i];
    if(/^-?\d+$/.test(t)){ run.push(parseInt(t,10)); continue; }
    flushRun();
    const lc = t.toLowerCase();
    if(lc==='sub'){ i++; continue; }                    // declaration, no code
    if(lc==='goto'||lc==='if'||lc==='while'||lc==='repeat'){ bytes += 3; continue; }
    bytes += /^[a-z_][a-z0-9_]*$/i.test(t) && !MAESTRO_KEYWORDS.has(lc) ? 3 : 1;  // sub call vs opcode
  }
  flushRun();
  return bytes;
}
const MAESTRO_KEYWORDS = new Set([
  'return','delay','servo','servo_8bit','speed','acceleration','get_position','get_moving_state',
  'led_on','led_off','dup','drop','swap','over','rot','roll','depth','plus','minus','times',
  'divide','mod','negate','abs','max','min','logical_and','logical_or','logical_not','bitwise_and',
  'bitwise_or','bitwise_not','bitwise_xor','shift_right','shift_left','get_ms','peek','poke',
  'serial_send_byte','begin','endif','else','end','quit','get_position']);

/* The Anzellan head's 11 face channels, in the order you would wire them:
   the mouth first (it is the one you will tune most), then the brows and
   lids, then the two gimbals. Eleven fits a Mini Maestro 12 with one spare,
   which is the board that actually goes in a head this size. */
const STARTER_ANZ = [
  'Frik Jaw','Frik Upper Lip','Frik Lower Lip',
  'Frik Left Brow','Frik Right Brow','Frik Eyelids',
  'Frik Eyes Pan','Frik Eyes Tilt',
  'Frik Head Pan','Frik Head Tilt','Frik Head Nod'
];

/* The servo rack (v1.57.0) is the one starter whose names are not a fixed
   list: it has exactly as many channels as the board has, they are all
   servos, and each one is called what it is. Generated rather than sliced,
   so a Micro 6 and eight PCA9685s both come out right. */
function starterRackNames(n){
  return Array.from({length:n}, (_,i)=>'Servo '+(i+1));
}
function starterNames(which, n){
  if(which==='rack') return starterRackNames(n);
  const list = (which==='dome') ? STARTER_DOME : (which==='anzellan') ? STARTER_ANZ : STARTER_BODY;
  return list.slice(0, n);
}
/* ============================================ THE STARTER SPEED LIMIT
   (v1.62.0)  Mike: "the servos are sounding and looking jerky - more so
   than previously."

   Every generated channel used to carry `speed:0, acceleration:0`, which on
   a Maestro and on the PCA bridge alike means UNLIMITED: each Set Target is
   chased as fast as the servo physically can. That is faithful to a factory
   Maestro and it was wrong here, because this app compiles ramps on the
   assumption that the board smooths them. blocks.js says so in as many
   words — a ramp is drawn as a run of steps about `BLK_RAMP_STEP_MS` apart
   (120 ms) "and the board's own acceleration rounds the corners anyway".
   With no acceleration there are no corners to round: the horn is commanded
   to a new position eight times a second and slams to each one. On screen
   that is a stepped panel; on a real servo it is an audible bang, eight
   times a second, and it is the noise Mike is hearing.

   v1.57.0's servo layout made it louder in two ways at once — it REGENERATES
   the whole channel table (so a tuned one is replaced by an unlimited one),
   and its Ripple and Wave routines put frames 70 and 110 ms apart, which is
   faster than any servo can track.

   THE NUMBERS, in Pololu's units (docs/0J40, and travel.js does the maths):
   speed 1 = 0.25 us per 10 ms; acceleration 1 = the speed changes by 1 every
   80 ms. Against the stock 4000-quarter-us span that gives:

     speed 120  →  vmax 12 quarter-us/ms
     accel 100  →  a 0.125 quarter-us/ms^2
     full endpoint-to-endpoint throw ≈ 430 ms, with ≈ 96 ms of accelerating
     at each end — which is the corner-rounding the compiler already assumes,
     and about what a real dome pie does.

   WHY NOT MIKE'S OWN NUMBERS. His dome Maestro runs speed 80 / accel 10,
   proven on real linkage (bench session 2026-07-29). That pair is
   acceleration-dominated — it never reaches vmax — and works out at a 1.1 s
   throw, which is smoother still and too slow to ship as a default, because
   blockMinTravelMs() would then floor every full-travel brick at 1.1 s. If
   his numbers should be the default, this line is the only edit.

   ONLY GENERATED CHANNELS GET THIS. A table you imported or measured carries
   your own numbers and is never touched — see servo-store.js. The bench's
   Speed and Acceleration columns edit them per channel, as before, and 0
   still means unlimited for anyone who wants it.

   An Input channel does not pulse, so it keeps 0: the pair is meaningless
   there and writing a number would only look like a setting that does
   something. */
const STARTER_SPEED = 120, STARTER_ACCEL = 100;

function blankChannel(i){
  return {i, name:'Channel '+i, mode:'Input', min:DEFAULT_MIN, max:DEFAULT_MAX,
    home:DEFAULT_NEUTRAL, homemode:'Ignore', neutral:DEFAULT_NEUTRAL, range:1905,
    speed:0, acceleration:0, act:'', invert:false};
}

/* Swap board without losing the mapping work: keep what fits, pad or trim the
   rest, and trim every sequence's target rows to match. */
function setBoard(id){
  const bd = boardById(id);
  const prev = MSTR.channels.length;
  MSTR.board = bd.id;
  if(!MSTR.loaded){ MSTR.servoCount = bd.ch; return {dropped:0, board:bd}; }
  let dropped = 0;
  if(prev > bd.ch){
    dropped = MSTR.channels.slice(bd.ch).filter(c=>c.act).length;
    MSTR.channels = MSTR.channels.slice(0, bd.ch);
  }else{
    for(let i=prev;i<bd.ch;i++) MSTR.channels.push(blankChannel(i));
  }
  MSTR.servoCount = bd.ch;
  MSTR.sequences.forEach(sq=>sq.frames.forEach(f=>{
    while(f.targets.length < bd.ch) f.targets.push(0);
    f.targets.length = bd.ch;
  }));
  while(EDIT.live.length < bd.ch) EDIT.live.push(DEFAULT_NEUTRAL);
  EDIT.live.length = bd.ch;
  MSTR.xmlText = '';               // header attributes change with the board
  if(typeof reindexSubs==='function') reindexSubs();   // sub table must match the resized sequences
  if(typeof servoStoreSave === 'function') servoStoreSave();
  lg('mae', `board → ${bd.product} (${prev} → ${bd.ch} channels`
     + (dropped ? `, ${dropped} mapped channel(s) dropped off the end)` : ')'));
  return {dropped, board:bd};
}

function makeStarter(which, boardId){
  const board = (which==='dome') ? 'dome' : (which==='anzellan') ? 'anzellan'
              : (which==='rack') ? 'rack' : 'body';
  const bd = boardById(boardId || MSTR.board);
  const names = starterNames(board, bd.ch);
  const channels = names.map((name,i)=>({
    i, name, mode:'Servo', min:DEFAULT_MIN, max:DEFAULT_MAX,
    home:DEFAULT_MIN, homemode:'Goto', neutral:DEFAULT_NEUTRAL, range:1905,
    /* not 0 — see THE STARTER SPEED LIMIT above. Every channel here is a
       Servo by construction, so there is no mode test to make. */
    speed:STARTER_SPEED, acceleration:STARTER_ACCEL,
    /* v1.59.0 — a servo-layout channel drives NOTHING on the model on
       purpose. There is no droid part called "Servo 3", the rkS actuators
       the v1.57.0 rack invented are gone, and the servo grid reads the
       CHANNEL (chanPosNorm) rather than an actuator — so guessing a part
       here would only mis-wire somebody's dome. */
    act: (board==='rack') ? '' : guessPart(name),
    invert:false
  }));
  for(let i=names.length;i<bd.ch;i++) channels.push(blankChannel(i));
  MSTR.channels = channels;
  MSTR.servoCount = channels.length;
  MSTR.board = bd.id;
  MSTR.header = {};
  MSTR.xmlText = '';   // force a full generated file
  const byAct={}; channels.forEach(c=>{ if(c.act) byAct[c.act]=c.i; });
  /* the servo layout has no acts at all, so its routines address channels
     directly: one synthetic key per channel, and mk() below is unchanged */
  if(board==='rack') channels.forEach(c=>{ byAct['ch'+c.i] = c.i; });
  const CLOSED=DEFAULT_MIN, OPEN=DEFAULT_MAX, MID=DEFAULT_NEUTRAL;
  const base = new Array(channels.length).fill(0);
  channels.forEach(c=>{ base[c.i] = /^servo/i.test(c.mode) ? CLOSED : 0; });
  /* A face is not a door. The droid's channels all rest SHUT, so CLOSED is
     the right base pose for them; a head's brows rest halfway up and its
     gimbals rest centred, so the base pose — and the board's power-on Goto —
     has to come from the actuator's own home or the head boots up staring at
     the floor with its eyes shut and its neck fully over. */
  const anzRest = act => (typeof anzHome === 'function' && typeof anzIsAct === 'function' && anzIsAct(act))
    ? Math.round(CLOSED + anzHome(act)*(OPEN-CLOSED)) : null;
  /* and a bare servo on the rack rests CENTRED for the same reason a face
     does and a door does not: mid-travel is where a servo horn with nothing
     bolted to it belongs, and it is where the case's centre tick is drawn
     (scene/rack.js), so a freshly generated rack lines up with its own
     markings instead of parked hard over at one end. */
  channels.forEach(c=>{
    const r = c.act ? anzRest(c.act) : null;
    if(r !== null){ base[c.i] = r; c.home = r; }
  });
  /* a bare servo with nothing bolted to it rests CENTRED, for the same reason
     a face does and a door does not — and unlike the anz case there is no
     actuator to ask, because a servo-layout channel deliberately has none. */
  if(board==='rack') channels.forEach(c=>{
    if(!/^servo/i.test(c.mode)) return;
    base[c.i] = MID; c.home = MID;
  });

  const mk=(name, steps)=>{
    const frames=[]; let cur=base.slice();
    steps.forEach(([dur, sets], k)=>{
      cur = cur.slice();
      for(const key in sets){ if(byAct[key]!==undefined) cur[byAct[key]] = sets[key]; }
      frames.push({name:'Frame '+k, duration:dur, targets:cur.slice()});
    });
    /* a small board may have nothing mapped for this sequence at all — keep it
       in the list so the subroutine numbers still line up with the sketch */
    if(!frames.length) frames.push({name:'Frame 0', duration:500, targets:base.slice()});
    return {name, frames};
  };
  /* A Maestro sequence is an absolute keyframe list, so a "close" sequence cannot
     just be the same steps in reverse — its first frame has to be the OPEN pose it
     is closing from, or the delta encoder collapses everything into bare delays.
     Reversing the frame list gives exactly that, and appending the base pose lands
     it fully shut. */
  const reverseOf=(name, seq)=>{
    const frames = seq.frames.slice().reverse().map((f,i)=>(
      {name:'Frame '+i, duration:f.duration, targets:f.targets.slice()}));
    frames.push({name:'Frame '+frames.length,
                 duration:frames.length?frames[frames.length-1].duration:500,
                 targets:base.slice()});
    return {name, frames};
  };

  let slots;
  if(board === 'anzellan'){
    /* Eight routines for the eight restartScript() slots, matching the eight
       frik_* stand-in animations one for one. Every one ENDS on the base
       (rest) pose, so the head never parks mid-expression. */
    const at = (act, v) => { const o={}; if(byAct[act]!==undefined) o[act] = Math.round(CLOSED + v*(OPEN-CLOSED)); return o; };
    const mix = (...os) => Object.assign({}, ...os);
    const talk = mk('Frik Talk', (()=>{
      const st=[];
      for(let i=0;i<9;i++) st.push([190 + (i%3)*45, mix(at('anzJaw', i%2?0.06:0.55+(i%3)*0.12), at('anzLipU', i%2?0.30:0.62))]);
      st.push([260, mix(at('anzJaw',0), at('anzLipU',0.30), at('anzBrowL',0.60), at('anzBrowR',0.60))]);
      st.push([320, mix(at('anzBrowL',0.35), at('anzBrowR',0.35))]);
      return st; })());
    const blink = mk('Frik Blink', [
      [110, at('anzLids',1)], [220, at('anzLids',0.10)],
      [110, at('anzLids',1)], [220, at('anzLids',0.10)]]);
    const lookL = mk('Frik Look Left',  [[220, at('anzEyeX',0.06)], [680, at('anzPan',0.20)],
                                         [300, mix(at('anzEyeX',0.5), at('anzPan',0.5))]]);
    const lookR = mk('Frik Look Right', [[220, at('anzEyeX',0.94)], [680, at('anzPan',0.80)],
                                         [300, mix(at('anzEyeX',0.5), at('anzPan',0.5))]]);
    const surprise = mk('Frik Surprise', [
      [90,  mix(at('anzLids',0), at('anzBrowL',1), at('anzBrowR',1), at('anzJaw',0.85), at('anzNod',0.30))],
      [640, at('anzJaw',0.20)],
      [260, mix(at('anzLids',0.10), at('anzBrowL',0.35), at('anzBrowR',0.35), at('anzJaw',0), at('anzNod',0.5))]]);
    const grumble = mk('Frik Grumble', [
      [200, mix(at('anzBrowL',0), at('anzBrowR',0), at('anzLids',0.45), at('anzLipL',0.85))],
      [220, mix(at('anzTilt',0.30), at('anzJaw',0.22))], [200, at('anzJaw',0.04)],
      [220, at('anzJaw',0.26)], [200, at('anzJaw',0.04)], [260, at('anzTilt',0.68)],
      [400, mix(at('anzTilt',0.5), at('anzLipL',0.30), at('anzBrowL',0.35), at('anzBrowR',0.35), at('anzLids',0.10), at('anzJaw',0))]]);
    const nod = mk('Frik Nod Yes', [
      [280, mix(at('anzNod',0.86), at('anzBrowL',0.62), at('anzBrowR',0.62))],
      [280, at('anzNod',0.24)], [280, at('anzNod',0.82)], [280, at('anzNod',0.28)],
      [280, mix(at('anzNod',0.5), at('anzBrowL',0.35), at('anzBrowR',0.35))]]);
    const shake = mk('Frik Shake No', [
      [300, mix(at('anzPan',0.16), at('anzBrowL',0.08), at('anzBrowR',0.08))],
      [300, at('anzPan',0.84)], [300, at('anzPan',0.18)], [300, at('anzPan',0.82)],
      [300, mix(at('anzPan',0.5), at('anzBrowL',0.35), at('anzBrowR',0.35))]]);
    MSTR.sequences = [talk, blink, lookL, lookR, surprise, grumble, nod, shake];
    slots = ['frik_talk','frik_blink','frik_look_left','frik_look_right',
             'frik_surprise','frik_grumble','frik_nod_yes','frik_shake_no'];
  }else if(board === 'rack'){
    /* EIGHT ROUTINES THAT SHOW YOU SOMETHING, which is the whole point of
       the rack: Mike's brief was "anyone can just use a sequencer and see
       simple movements", and a generated layout with no sequences in it
       would still leave the first-time user with a blank Play button.
       Every one starts and ends CENTRED, so they compose — play two in a row
       and the second does not begin from wherever the first happened to
       stop. `n` is however many servos the board actually has. */
    /* every servo channel on the board, addressed by index — see byAct above */
    const svc = channels.filter(c=>/^servo/i.test(c.mode)).map(c=>c.i);
    const n = svc.length;
    const key = k => 'ch' + svc[k-1];
    const all = v => { const o={}; for(let i=1;i<=n;i++) o[key(i)] = v; return o; };
    const one = (i, v) => { const o={}; o[key(i)] = v; return o; };
    const centre = [[420, all(MID)]];
    const sweep = mk('Servos Sweep', [
      [700, all(CLOSED)], [900, all(OPEN)], [900, all(CLOSED)], [700, all(MID)]]);
    const ripple = mk('Servo Ripple', (()=>{
      const st=[[300, all(MID)]];
      for(let i=1;i<=n;i++) st.push([70, one(i, OPEN)]);
      for(let i=1;i<=n;i++) st.push([70, one(i, MID)]);
      return st; })());
    const countUp = mk('Count Up', (()=>{
      /* one servo at a time, and only one moving at once — this is the one
         you play to find out which channel is which */
      const st=[[300, all(MID)]];
      for(let i=1;i<=n;i++){ st.push([260, one(i, OPEN)]); st.push([260, one(i, MID)]); }
      return st; })());
    const oddsEvens = mk('Odds and Evens', (()=>{
      const split = (a,b)=>{ const o={}; for(let i=1;i<=n;i++) o[key(i)] = (i%2 ? a : b); return o; };
      return [[500, split(OPEN, CLOSED)], [700, split(CLOSED, OPEN)],
              [700, split(OPEN, CLOSED)], [500, all(MID)]];
    })());
    const wave = mk('Servo Wave', (()=>{
      const st=[[300, all(MID)]];
      for(let f=0; f<12; f++){
        const o={};
        for(let i=1;i<=n;i++){
          const v = 0.5 + 0.42*Math.sin((f*0.62) - (i*0.55));
          o[key(i)] = Math.round(CLOSED + v*(OPEN-CLOSED));
        }
        st.push([110, o]);
      }
      st.push([420, all(MID)]);
      return st; })());
    const nudge = mk('Small Nudge', (()=>{
      /* deliberately gentle: the one to play with real servos armed, when
         you want to prove the wiring without swinging every horn end to end */
      const lo = Math.round(MID - (OPEN-CLOSED)*0.10), hi = Math.round(MID + (OPEN-CLOSED)*0.10);
      return [[400, all(lo)], [400, all(hi)], [400, all(lo)], [400, all(MID)]];
    })());
    MSTR.sequences = [
      mk('Servos Centre', centre),
      sweep,
      ripple,
      reverseOf('Servo Ripple Back', ripple),
      countUp,
      oddsEvens,
      wave,
      nudge
    ];
    slots = ['rack_centre','rack_sweep','rack_ripple','rack_ripple_back',
             'rack_count','rack_odds','rack_wave','rack_nudge'];
  }else if(board === 'dome'){
    /* however many actually fitted on this board */
    const pieN = channels.filter(c=>/^pie\d+$/.test(c.act)).length;
    const panN = channels.filter(c=>/^panel\d+$/.test(c.act)).length;
    const stagger = (pfx, n, val, step)=>{
      const out=[]; for(let i=0;i<n;i++){ const o={}; o[pfx+i]=val; out.push([step, o]); } return out;
    };
    const piesOpen   = mk('Dome Pies Open',   stagger('pie', pieN, OPEN, 90));
    const panelsOpen = mk('Dome Panels Open', stagger('panel', panN, OPEN, 90));
    const wave = ()=>{
      const st=[];
      for(let i=0;i<pieN;i++){ const o={}; o['pie'+i]=OPEN;   st.push([110,o]); }
      for(let i=0;i<pieN;i++){ const o={}; o['pie'+i]=CLOSED; st.push([110,o]); }
      return st;
    };
    const allOpen = mk('Whole Dome Open',
      stagger('pie', pieN, OPEN, 80).concat(stagger('panel', panN, OPEN, 80)));
    MSTR.sequences = [
      piesOpen,
      reverseOf('Dome Pies Close',   piesOpen),
      panelsOpen,
      reverseOf('Dome Panels Close', panelsOpen),
      mk('Dome Pie Wave', wave()),
      allOpen,
      reverseOf('Whole Dome Close',  allOpen),
      mk('Dome Flutter', (()=>{
        const st=[];
        for(let r=0;r<4;r++){
          const v = r%2 ? CLOSED : OPEN;
          for(let i=0;i<pieN;i++){ const o={}; o['pie'+i]=v; st.push([r===0&&i===0?200:35, o]); }
          st.push([220, {}]);
        }
        for(let i=0;i<pieN;i++){ const o={}; o['pie'+i]=CLOSED; st.push([35,o]); }
        return st; })())
    ];
    slots = ['pies_open','pies_close','panels_open','panels_close',
             'pies_wave','dome_open','dome_close','dome_flutter'];
  }else{
    const doorsOpen  = mk('Body Doors Open',  [[420,{doorL:OPEN}],[420,{doorR:OPEN}],[420,{doorRL:OPEN}],
                                               [420,{doorRR:OPEN}],[420,{smallDoor:OPEN}]]);
    const frontOpen  = mk('Front Doors Open', [[450,{doorL:OPEN}],[450,{doorR:OPEN}]]);
    const armsOut    = mk('Utility Arms Out', [[380,{utilUp:OPEN}],[380,{utilLo:OPEN}]]);
    const portsOpen  = mk('Ports Open',       [[400,{dataport:OPEN}],[400,{chargebay:OPEN}]]);
    MSTR.sequences = [
      doorsOpen,
      reverseOf('Body Doors Close',  doorsOpen),
      frontOpen,
      reverseOf('Front Doors Close', frontOpen),
      armsOut,
      reverseOf('Utility Arms In',   armsOut),
      portsOpen,
      reverseOf('Ports Close',       portsOpen)
    ];
    slots = ['doors_open','doors_close','front_doors_open','front_doors_close',
             'utils_out','utils_in','ports_open','ports_close'];
  }
  // point the built-in stand-ins at the same thing, slot for slot
  if(CFG.maestroScript) CFG.maestroScript = slots.slice();
  // a generated starter IS the board: its 8 sequences are subroutines 0-7
  loadoutReset();
  // rebuild the sub index table the same way an import would
  const script = genScript(loadoutSeqs(), enabledChannels());
  MSTR.scriptText = script;
  const raw = parseScriptSubs(script);
  MSTR.subs = raw.map(s=>({index:s.index,name:s.name,body:s.body,
    kind:/^frame_/i.test(s.name)?'frame':'sequence', seqIndex:-1}));
  MSTR.subs.forEach(s=>{ if(s.kind==='sequence'){
    s.seqIndex = MSTR.sequences.findIndex(q=>niceName(q.name).toLowerCase()===s.name.toLowerCase());
  }});
  MSTR.loaded = true;
  MSTR.fileName = (board==='dome') ? 'R2-dome-maestro-starter.mstr'
                : (board==='anzellan') ? 'R2-anzellan-maestro-starter.mstr'
                : (board==='rack') ? 'R2-servo-rack-starter.mstr'
                : 'R2-body-maestro-starter.mstr';
  EDIT.live = channels.map(c=>chanRest(c));   // 2026-08-18 — the one seeding that still read c.home
  /* CHPOS seeds from chanRest() too, and it has to happen HERE rather than at
     the `MSTR.channels =` above: the base-pose block in between is what sets
     `c.home`, so seeding earlier read every channel as parked at DEFAULT_MIN
     and a freshly generated servo layout came up hard over instead of centred */
  if(typeof chanPosReset === 'function') chanPosReset();
  EDIT.seq=0; EDIT.frame=-1;
  /* v1.43.0 — keep it. A starter that is not stored is a starter that gets
     regenerated on the next boot, over the top of whatever was done to it
     (maestro/servo-store.js). */
  if(typeof servoStoreSave === 'function') servoStoreSave();
  lg('mae',`generated a ${board} starter for the ${bd.product}: ${names.length} named servo channels, 8 sequences → subroutines 0-7`);
  const est = scriptBytesEstimate(script);
  if(bd.script > 0 && est > bd.script) // v1.39.5: a board with no script store gets no script-size warning
    lg('warn',`  that script is roughly ${est} bytes and the ${bd.label} holds ${bd.script} — trim sequences or move to a bigger board`);
  return MSTR;
}
