'use strict';
/* =====================================================================
   BUILD CONFIGURATION — what hardware is actually in this droid

   Until now the sim asked you to know which firmware profile you wanted
   and then edit constants to match. That is backwards: a builder knows
   what is BOLTED IN, not which .ino line to change. So this module is
   the source of truth for the build, and the firmware profile, the
   FOOT_CONTROLLER flag and the Maestro board size are DERIVED from it.

   THE ORDER (v1.35.0, revised v1.36.0). Mike moved the controller board up
   to sit beside the controller, tried the firmware there too, and then moved
   it back: "good point about firmware - lets move to after Sound when key
   questions have been answered."

   So: what you drive it with, what runs the code, then the hardware, and the
   sketch LAST — narrowed by everything above it, which is the argument this
   question was built on. The one thing kept from the experiment is
   `firmwarePinned`: a sketch you picked yourself is still never silently
   swapped, it is just no longer the common case.

     1 controller    — everything else assumes a wireless Xbox 360 pad
     2 controller bd — the board running the sketch; Mega ADK has the USB
                       host on-die
     3 servo hw      — what the servos plug into, how many, and how the
                       data reaches them. Owns domeServo + bodyServo.
     4 dome motor    — Syren10 on Serial2 in all three sketches
     5 dome lights   — AstroPixels for now, more later
     6 foot drive    — Sabertooth (serial) vs Flipsky/hub (PWM 44/45)
     7 sound         — DY-SV5W or MD-YX5300
     8 firmware      — LAST, because it is the only answer that follows from
                       the others. See `firmwarePinned`.

   Nine questions until v1.34.0 merged the two servo ones.

   Every option carries `sim`, which says how faithfully the simulator
   reproduces it:  'full'   modelled and driven
                   'sub'    stands in for something equivalent
                   'park'   choosable, recorded on the wiring sheet, but
                            no firmware for it yet (the RC transmitter)
   ===================================================================== */

const BUILD_STEPS = [
  {key:'controller', title:'Controller',      q:'What are you driving it with?',
   why:'The three sketches all talk to a wireless Xbox 360 receiver through the USB host. Anything else needs its own input layer.'},
  {key:'arduino',    title:'Controller board', q:'What is running the sketch?',
   why:'The sketches need four hardware UARTs and a USB host. The Mega ADK has the host built in — an Arduino is not the only way to get there, but it is the only one these three sketches are written for.'},
  /* v1.34.0 — ONE servo question, not two. Mike: "we should merge the Body /
     Dome servos into one - the user then sets whats controlling the Dome /
     Body and then hows its wired." Renamed to "Servo hardware" and simplified
     to family-first in v1.35.0: "its not very easy to understand make it
     simpler".

     The two questions had the same option list and were answered a step
     apart, which made the one thing you actually want to see — how the two
     ends relate — the one thing you could not.

     `answers` is what makes this work for the generic machinery: a step may
     own more than one build key, and the rail, the review table and the
     parked-option scan all read it instead of assuming `step.key` is an
     answer. `domeServo` and `bodyServo` survive UNCHANGED as build answers —
     every saved setup .json, PREFS.hw, the wiring sheet and the firmware
     rules keep working; only the QUESTION merged. */
  {key:'servos',     title:'Servo hardware',  q:'What are the servos plugged into?',
   answers:['domeServo','bodyServo'],
   why:'Every moving panel, door and arm is a servo, and something has to send it a pulse. Say what that something is, pick the arrangement whose picture matches your droid, and — when you are ready — set them up for real at the bottom of this page.'},
  {key:'domeMotor',  title:'Dome motor',      q:'What spins the dome?',
   why:'All three sketches drive the dome from Serial2 with the Syren/Sabertooth packetised protocol at address 128.'},
  {key:'domeLights', title:'Dome lighting',   q:'What lights the dome?',
   why:'Logics, PSIs and holoprojectors. Only the wiring is recorded for now — no lighting firmware is simulated yet.'},
  {key:'bodyDrive',  title:'Foot drive',      q:'What drives the feet?',
   why:'This is the open decision on your build, and it is the one thing that changes which sketch you can run.'},
  {key:'sound',      title:'Sound',           q:'Which sound board?',
   why:'Both boards are single-channel and take a track number; they differ in protocol and in which way the volume runs.'},
  /* Last again as of v1.36.0. Mike tried it at position 3 and moved it back:
     "good point about firmware - lets move to after Sound when key questions
     have been answered." Which is the argument this question was built on —
     it is the one answer that is a CONSEQUENCE of all the others, and asking
     it before the hardware means greying out most of the list for reasons
     the builder has not given yet. `firmwarePinned` stays: an explicit
     choice is still never silently swapped, it is just no longer the common
     case. */
  {key:'firmware',   title:'Firmware',        q:'Which code will you flash?',
   why:'The last question, because it is the only one that follows from the others: this list is narrowed to what the hardware you just described can actually run, and anything greyed out says which answer is blocking it.'}
];

/* ------------------------------------------- what each model actually uses
   v1.32.0. The nine questions are the DROID's. Put the Anzellan head or the
   Polar Mouse on the stage and most of them describe hardware that is not
   there — a puppet head has no feet and the mouse has no dome.

   Mike's call (2026-08-14) was to keep every question askable rather than
   hide it: "ask all nine, but collapsed". So this map only says which ones
   are NOT used by a given model. Those steps stay in the rail, greyed, with
   a line at the top of the step saying why, and the answer is kept — it is
   still the truth about the droid you are building, and the droid is one
   click away on the model step.

   Nothing here changes what the sim DOES. It is a reading aid, not a gate:
   `buildApply()` still derives the profile and the foot mode from the
   answers whatever is on the stage, because the sketch runs regardless
   (scene/models.js, "WHAT THIS IS NOT"). */
const MODEL_UNUSED_STEPS = {
  droid: [],
  frik:  ['domeMotor','domeLights','bodyDrive','sound'],
  /* the servos step covers both ends now, so the mouse skips the one entry
     rather than the two it used to */
  mouse: ['domeMotor','servos','domeLights','sound'],
  /* v1.41.0 — the Model Builder is architecturally the same shape as the
     Anzellan head: a bench mechanism whose joints go through a servo board
     like anything else, with no dome and no feet of its own. */
  builder: ['domeMotor','domeLights','bodyDrive','sound']
};
const MODEL_UNUSED_WHY = {
  frik:  'the Anzellan head is a bench-stand puppet — eleven face channels on a servo board, no dome and no feet',
  mouse: 'the Polar Mouse is a wheeled trolley — a drive and a steering channel, no dome and no body panels',
  builder: 'a Builder mechanism is whatever parts and joints you have placed — no dome, no feet and no fixed foot drive, but its joints still go through a servo board like any other channel'
};
function modelSkippedSteps(model){
  return MODEL_UNUSED_STEPS[model || (typeof modelGet === 'function' ? modelGet() : 'droid')] || [];
}
/* Does this hardware question describe what is currently on the stage? */
function stepUsedByModel(key, model){
  return modelSkippedSteps(model).indexOf(key) < 0;
}
function modelUnusedWhy(model){
  return MODEL_UNUSED_WHY[model || (typeof modelGet === 'function' ? modelGet() : 'droid')] || '';
}

const BUILD_OPTIONS = {
  controller:[
    {id:'xbox360', label:'Xbox 360 wireless', sim:'full',
     note:'Wireless receiver on the USB host. What all three sketches expect, and what the on-screen pad mirrors.'},
    {id:'xboxusb', label:'Xbox 360 wired',    sim:'sub',
     note:'Same button map through XBOXUSB instead of XBOXRECV — one #include and one object name in the sketch. Simulated as the wireless pad.'},
    /* v1.32.0 — promoted park → sub, and only that far. The SIM now reads a
       transmitter properly: pick the device, calibrate its real endpoints,
       assign its channels (input/rc.js). What has not changed is the
       FIRMWARE — none of the three sketches has a PPM/SBUS input layer, they
       read an Xbox receiver — so a calibrated channel stands in for a stick
       rather than arriving the way it would on the real droid. Full needs
       code that does not exist yet. */
    {id:'rc',      label:'RC transmitter',    sim:'sub',
     note:'A radio set in USB/simulator mode. Calibrate it and assign its channels below; they stand in for the Xbox map, so the sketch runs unchanged. Advanced: a channel can instead be bound straight to a motor or servo, which bypasses the sketch.'}
  ],
  domeMotor:[
    {id:'syren10',  label:'Syren10',            sim:'full',
     note:'The standard dome drive. Serial2 @ 9600, address 128, setTimeout(950).'},
    {id:'sabertooth_dome', label:'2nd Sabertooth', sim:'sub',
     note:'A spare Sabertooth channel doing the dome instead. Same packet protocol, so the sketch does not care.'},
    {id:'none',     label:'No dome motor yet',  sim:'sub',
     note:'Dome fixed for now. The sim still shows what the Syren would have been sent.'}
  ],
  domeServo:[
    {id:'mini24',  label:'Mini Maestro 24', sim:'full', hw:'mini24', maestroProtocol:true, short:'Mini 24', family:'maestro', size:'24 channels',
     note:'The usual dome board. The MK4 dome has 12 pie panels and 14 side panels — that is 26, so two of them stay fixed or go elsewhere.'},
    {id:'mini18',  label:'Mini Maestro 18', sim:'full', hw:'mini18', maestroProtocol:true, short:'Mini 18', family:'maestro', size:'18 channels',
     note:'Enough for the 12 pies and six of the side panels.'},
    {id:'mini12',  label:'Mini Maestro 12', sim:'full', hw:'mini12', maestroProtocol:true, short:'Mini 12', family:'maestro', size:'12 channels',
     note:'The 12 pie panels and nothing else.'},
    {id:'micro6',  label:'Micro Maestro 6',  sim:'full', hw:'micro6', maestroProtocol:true, short:'Micro 6', family:'maestro', size:'6 channels',
     note:'The small one. Different chip inside: no pull-up resistors, and room for about an eighth as much stored movement as a Mini.'},
    /* v1.33.0 — the co-processor route as a BUILD answer. Mike: "we need to
       add the additional option / set up for using an Arduino / ESP for the
       PCA9685's — as a reminder they will use the same output from the
       Padawan as a Maestro." That last clause is the whole point and it is
       why these live here rather than beside mod2026: to the HOST sketch
       this is a Maestro. Same UART, same 9600, same restartScript(n). The
       PCA9685s are behind the co-processor, on ITS I2C bus, not the Mega's.
       `maestroProtocol` is therefore true and `pcaBoards` records how many
       expanders hang off it. */
    {id:'mpca32',  label:'PCA9685 ×2 + co-processor', sim:'full', hw:'pca32',
     maestroProtocol:true, pcaBoards:2, mcu:true, short:'PCA ×2 + coproc', family:'coproc', size:'32 channels',
     note:'Two expander boards, 32 channels — the whole MK4 dome with six to spare. About £10 of expander.'},
    {id:'mpca16',  label:'PCA9685 ×1 + co-processor', sim:'full', hw:'pca16',
     maestroProtocol:true, pcaBoards:1, mcu:true, short:'PCA ×1 + coproc', family:'coproc', size:'16 channels',
     note:'One expander board, 16 channels — the pies and a few panels.'},
    {id:'mod2026', label:'PCA9685 @ 0x41',   sim:'full', hw:'mod2026', pca:true, short:'PCA9685 direct', family:'direct', size:'16 channels',
     note:'The dome half of the mod2026 arrangement: 16 channels, 11 of them wired to pie panels by the sketch.'}
  ],
  domeLights:[
    {id:'astropixels', label:'AstroPixels', sim:'park',
     note:'NeoPixel logics, PSIs and HPs on a single data line. Wiring recorded; no lighting sequences are simulated yet.'},
    {id:'teeces',      label:'Teeces',      sim:'park',
     note:'The classic MAX7219 chain. Recorded for the wiring sheet.'},
    {id:'none',        label:'None yet',    sim:'park',
     note:'Dome lighting still to come.'}
  ],
  bodyDrive:[
    {id:'sabertooth', label:'Sabertooth 2x25', sim:'full',
     note:'Brushed motors over Serial1 @ 9600, address 128, setTimeout(950). FOOT_CONTROLLER 0.'},
    {id:'flipsky',    label:'Flipsky FSESC + hub motors', sim:'full',
     note:'Brushless hub motors, one ESC each, R/C-mode PWM on pins 44 and 45, mixed in software. FOOT_CONTROLLER 1.'}
  ],
  bodyServo:[
    {id:'mod2026', label:'PCA9685 @ 0x40',   sim:'full', hw:'mod2026', pca:true, short:'PCA9685 direct', family:'direct', size:'16 channels',
     note:'The body half of the mod2026 arrangement: 10 servos on fixed channels chosen by the sketch.'},
    {id:'mini12',  label:'Mini Maestro 12', sim:'full', hw:'mini12', maestroProtocol:true, short:'Mini 12', family:'maestro', size:'12 channels',
     note:'The common body board — four breadpan doors, both utility arms and the small hatches.'},
    {id:'mini18',  label:'Mini Maestro 18', sim:'full', hw:'mini18', maestroProtocol:true, short:'Mini 18', family:'maestro', size:'18 channels',
     note:'Room for the body and six spare channels.'},
    {id:'mini24',  label:'Mini Maestro 24', sim:'full', hw:'mini24', maestroProtocol:true, short:'Mini 24', family:'maestro', size:'24 channels',
     note:'More than the body needs. Useful if one board is doing the whole droid.'},
    {id:'micro6',  label:'Micro Maestro 6',  sim:'full', hw:'micro6', maestroProtocol:true, short:'Micro 6', family:'maestro', size:'6 channels',
     note:'Enough for the front doors and the arms, and nothing more.'},
    /* the same two co-processor answers as the dome — see the note there.
       A body co-processor and a dome co-processor are separate boards on a
       real droid: the slip ring is the reason, and it is why these two
       questions are answered independently rather than once. */
    {id:'mpca16',  label:'PCA9685 ×1 + co-processor', sim:'full', hw:'pca16',
     maestroProtocol:true, pcaBoards:1, mcu:true, short:'PCA ×1 + coproc', family:'coproc', size:'16 channels',
     note:'One expander board, 16 channels — comfortable for the body.'},
    {id:'mpca32',  label:'PCA9685 ×2 + co-processor', sim:'full', hw:'pca32',
     maestroProtocol:true, pcaBoards:2, mcu:true, short:'PCA ×2 + coproc', family:'coproc', size:'32 channels',
     note:'Two expander boards, 32 channels. More than the body needs, but the spare channels cost nothing.'}
  ],
  sound:[
    {id:'dysv5w',   label:'DY-SV5W',   sim:'full',
     note:'Serial0 via DYPlayerArduino. 30 is loudest. Watch out: the sketch’s own Serial.println() shares this UART.'},
    {id:'mdyx5300', label:'MD-YX5300', sim:'full',
     note:'Serial0 at 9600, the module the mod2026 sketch uses.'},
    {id:'mp3trigger', label:'MP3Trigger', sim:'park',
     note:'The original Padawan board. Parked — the volume convention is inverted against both boards above, which is where that inherited bug came from.'}
  ],
  arduino:[
    {id:'megaadk',  label:'Mega ADK',                sim:'full',
     note:'What you should have. USB host on the board, four hardware UARTs, and the pin numbering the sketches assume.'},
    {id:'mega2560', label:'Mega 2560 + USB host shield', sim:'full',
     note:'Same silicon, host on a shield. Identical from the sketch’s point of view.'},
    {id:'due',      label:'Due',                     sim:'park',
     note:'Parked. 3.3 V logic and a different Servo/USB stack — every serial and PWM assumption would need re-checking.'},
    {id:'teensy',   label:'Teensy 4.1',              sim:'park',
     note:'Parked. Plenty of UARTs and fast, but 3.3 V logic and a different USB-host story — every serial and PWM assumption needs re-checking.'},
    {id:'other',    label:'Something else',          sim:'park',
     note:'Recorded on the wiring sheet. The sketches need four hardware UARTs and a USB host, so check yours has both.'}
  ],
  firmware:[
    {id:'mod2026',   label:'padawan360 mod2026', sim:'full',
     note:'PCA9685 servos, Sabertooth feet, MD-YX5300 sound.',
     repo:'https://github.com/sel-uis/Astromech-padawan360-mod2026',
     file:'padawan_secure _mode.ino'},
    {id:'maestro25', label:'Maestro 2025 (PWM)', sim:'full',
     note:'Maestro scripts, DY-SV5W sound, and the only sketch that can drive hub motors.',
     repo:'https://github.com/Imperiallandm/Padawan360_mega_maestro_DYSV5W',
     file:'Padawan360_mega_maestro_DYSV5W_PWM.ino'},
    {id:'maestro22', label:'Maestro 2022 BETA',  sim:'full',
     note:'Maestro scripts, DY-SV5W sound, Sabertooth only.',
     repo:'https://github.com/Imperiallandm/Padawan360_mega_maestro_DYSV5W',
     file:'Padawan360_mega_maestro_DY5_BETA.ino'}
  ],
  /* the sound pack every sketch's track numbers refer to */
  _links:[
    {label:'Padawan sound pack (53 MP3s)', url:'https://github.com/Imperiallandm/r2sounds',
     note:'Drop the zip on the sim to hear the real thing. Its read.me asks visitors to consider a donation to firstinspires.org.'},
    {label:'Pololu Maestro Control Center', url:'https://www.pololu.com/docs/0J40',
     note:'The .mstr settings files this sim imports and exports are Control Center\'s own format.'}
  ]
};

/* ------------------------------------------------------------------ state */
/* The starting answers are deliberately SELF-CONSISTENT — an all-PCA9685,
   Sabertooth, MD-YX5300 droid running mod2026 — so a brand-new user opens
   the wizard with zero conflicts showing and every warning they then see is
   one they caused. It is not a recommendation, it is a clean slate. */
function buildDefault(){
  return {
    done:false, step:0,
    controller:'xbox360', domeMotor:'syren10', domeServo:'mod2026',
    domeLights:'astropixels', bodyDrive:'sabertooth', bodyServo:'mod2026',
    sound:'mdyx5300', arduino:'megaadk', firmware:'mod2026',
    /* v1.34.0 — the merged servo question's two extra answers. `servoSplit`
       is 'one' when a single controller runs the whole droid; `servoLink` is
       how two of them reach the host. Both are ignored when they cannot
       apply, rather than being cleared — change your mind back and the old
       answer is still there. */
    servoSplit:'two', servoLink:'chain',
    /* v1.36.0 — the SHAPE, and the two board sizes it needs. servoSplit and
       servoLink are derived from these now (buildNormaliseServos); they are
       kept as answers because everything downstream already speaks them. */
    servoDevice:'pca', servoTopo:'p0',
    servoSize1:'mini24', servoSize2:'mini12',
    /* v1.35.0 — set the moment YOU choose a firmware. The question moved to
       step 3, ahead of the hardware it has to match, so a later hardware
       answer silently re-picking it would delete a deliberate choice made a
       moment earlier. Pinned, the contradiction is REPORTED instead. */
    firmwarePinned:false,
    /* v1.33.0 — which chip runs a MaestroPCA co-processor, when one is
       chosen. NOT a BUILD_STEP: it is a follow-on to the two servo
       questions, shown only when the answer needs it, and it is meaningless
       otherwise. The Bench wizard reads it back (see buildSet). */
    servoMcu:'nano'
  };
}
/* which build answer corresponds to an already-saved PREFS.hw entry */
function buildServoFromHw(hw){
  const o = (BUILD_OPTIONS.domeServo || []).find(x => x.hw === hw);
  return o ? o.id : hw;
}

/* ------------------------------------------------- the servo answers
   The two servo questions share an option vocabulary, so ask them once
   here rather than string-matching ids at each call site. Three facts,
   and they are genuinely independent:

     maestroProtocol — the HOST talks to it over a UART with the Maestro
                       protocol. True for every Pololu board AND for a
                       MaestroPCA co-processor, which is exactly Mike's
                       point: "they will use the same output from the
                       Padawan as a Maestro."
     pca             — there is a PCA9685 in the chain somewhere.
     pcaBoards       — how many, and (by being set at all) that the
                       expanders are behind a CO-PROCESSOR rather than on
                       the host's own I2C bus.

   mod2026 is pca without maestroProtocol; a Mini 24 is maestroProtocol
   without pca; a co-processor is both. */
function servoOpt(id){ return (BUILD_OPTIONS.domeServo || []).find(o => o.id === id) || null; }
function servoSpeaksMaestro(id){ const o = servoOpt(id); return !!(o && o.maestroProtocol); }
function servoUsesPca(id){ const o = servoOpt(id); return !!(o && (o.pca || o.pcaBoards)); }
function servoCoprocBoards(id){ const o = servoOpt(id); return (o && o.pcaBoards) || 0; }
function servoShort(id){ const o = servoOpt(id); return (o && (o.short || o.label)) || id; }

/* ------------------------------------------------ families (v1.35.0)
   Mike, on the merged servo step: "its not very easy to understand make it
   simpler."

   Seven cards per end, each naming a board by model number, is a wall. But
   there are only THREE arrangements, and the arrangement is the decision
   that actually matters — it changes which sketches can run, where the
   wires go and what you flash. The size within a family is a detail you
   pick once you know which family you are in.

   So the step asks the family first, in words rather than part numbers,
   and only then offers the sizes inside it. `family` on each option is the
   whole of the mechanism; nothing else in the file changed. */
const SERVO_FAMILIES = [
  {id:'maestro', label:'A Pololu Maestro',
   sub:'the usual choice — a ready-made board you set up in Pololu\'s own software',
   note:'A servo controller that stores its own movements. The droid\'s Arduino just says "run number 3" down a serial wire and the Maestro does the rest. You set the endpoints up once in Maestro Control Center, on a laptop, with the servo moving in front of you.'},
  {id:'coproc',  label:'PCA9685 expanders, on their own Arduino',
   sub:'the cheap route — and the sketch cannot tell it from a Maestro',
   note:'A spare Arduino or ESP32 runs MaestroReplacement and drives one or two PCA9685 expander boards. It answers the droid\'s Arduino exactly as a Maestro does, over the same wire, so no code on the droid changes — for about a tenth of the money.'},
  {id:'direct',  label:'PCA9685 expanders, on the droid\'s own Arduino',
   sub:'no extra board — but only the mod2026 sketch can drive it',
   note:'The expanders hang straight off the main Arduino\'s I2C pins and the droid\'s own sketch writes every pulse itself. Nothing else to buy or flash. The catch: there is nowhere to store movements, so the two Maestro sketches cannot use it.'}
];
function servoFamily(id){ const o = servoOpt(id); return (o && o.family) || 'maestro'; }
function servoFamilyDef(fam){ return SERVO_FAMILIES.find(f=>f.id === fam) || SERVO_FAMILIES[0]; }
/* the size options inside a family, for one end */
function servoSizes(key, fam){
  return (BUILD_OPTIONS[key] || []).filter(o=>o.family === fam);
}

/* ------------------------------------------ one controller, or one each end
   v1.34.0. "One board does both" was not expressible before: answering both
   servo questions `mini24` meant TWO Mini 24s, and there was no way to say
   the one board in the body also runs the dome — which is what a body-only
   test rig, and plenty of finished droids without a slip ring, actually are.

   It is only offered for boards the HOST addresses over a UART. mod2026 is
   the exception on purpose: it is not "a board", it is the sketch driving
   two fixed expanders at 0x40 and 0x41 on its own I2C bus, and calling that
   one controller would be a fiction. Choosing mod2026 therefore forces the
   split back to two, in `buildNormaliseServos()`. */
function servoSharable(id){ return servoSpeaksMaestro(id); }
/* ================================================== SERVO TOPOLOGY (v1.36.0)
   Mike drew the arrangements out by hand:

     Maestro
       Padawan > Maestro 1 > Servo
       Padawan > Maestro 1 > Maestro 2 > Servo
       Padawan > Maestro 1 > Servo  AND  Padawan > Maestro 2 > Servo,
         as separate channels from the Padawan — not working yet as the
         sketch isn't configured

     PCA9685
       Padawan > Controller 1 > PCA 1 > Servo
       Padawan > Controller 1 > PCA 1 > PCA 2 > Servo
       Padawan > Controller 1 > PCA 2 > Servo  AND
         Padawan > Controller 2 > PCA 1 > Servo, separate channels — not yet
       Padawan > Controller 1 > PCA 2 > Servo  AND
         Padawan > Controller 1 > PCA 1 > Servo, separate channels — not yet

   THE POINT OF MODELLING IT THIS WAY. "Which board" and "how many" were
   already answers; what was missing is the SHAPE — whether the second board
   hangs off the first or off the host, which is the difference between a
   working droid and two boards both answering every command (see
   buildConflicts). Naming the shape once, as a picture, is what lets the
   step be four dropdowns instead of fourteen cards.

   `flow` is what the diagram draws, one array per link from the Padawan.
   `sim` is the usual honesty flag — three of these seven are arrangements
   the stock sketches simply cannot address, and they say so on the card
   rather than being left out.

   domeServo / bodyServo / servoSplit / servoLink are all DERIVED from this
   in buildNormaliseServos(). Nothing downstream changed. */
/* v1.45.0 — Mike: "Make Servo Hardware image-led: choose Maestro or PCA9685
   first, then show relevant options." This list was already the right first
   question; what it lacked was a picture, so `art` names the board whose photo
   stands for the whole family — a Mini 24 for the Maestros, a PCA9685 for the
   expanders (config/board-art.js resolves it, so a photo dropped in
   src/art/boards/ lands here with nothing to change). It is deliberately a
   REPRESENTATIVE, not a claim: choosing "Pololu Maestro" does not choose a
   Mini 24, that is the size question further down the step.

   Why this list and not SERVO_FAMILIES: the families are maestro / coproc /
   direct, which is a taxonomy of BOARDS — and two of its three entries are
   PCA9685 arrangements. Asked first it would put "is there a co-processor in
   between?" ahead of "is it a Maestro at all?", which is the opposite of what
   Mike asked for. That distinction IS asked, second, as the PCA9685 shape.
   servoFamily() still uses the families to read a board answer back into a
   shape (buildNormaliseServos). */
const SERVO_DEVICES = [
  {id:'maestro', label:'Pololu Maestro', sim:'full', art:'mini24',
   note:'A ready-made servo controller that stores its own movements. The droid says "run number 3" down a serial wire and the board does the rest.'},
  {id:'pca',     label:'PCA9685 expanders', sim:'full', art:'mpca16',
   note:'Cheap 16-channel expander boards. They need something to drive them — either a spare Arduino/ESP32 that answers like a Maestro, or the droid\'s own board.'},
  {id:'other',   label:'Something else', sim:'park', art:'other',
   note:'Recorded, and nothing more — there is no model for it yet. The simulator carries on with whatever you had before, so the rest of the setup still works.'}
];
/* NOT offered in the dropdown — it is what a build looks like when the two
   ends are different KINDS, which the old two-question setup allowed and
   plenty of real droids are (a Maestro in the dome, the mod2026 expanders in
   the body). The picker cannot express it, and quietly rewriting somebody's
   saved build to something it is not would be worse than admitting that. So
   it is preserved, shown, and replaced the moment a device is chosen. */
const SERVO_MIXED = {id:'mixed', label:'Different at each end', sim:'sub', art:'other',
  note:'This build has one kind of board in the dome and another in the body — from a saved setup, or from the days when they were two separate questions. It still works; the picker below just cannot draw it. Choosing a device replaces it.'};
function servoDeviceDef(id){
  return SERVO_DEVICES.find(d=>d.id === id) || (id === 'mixed' ? SERVO_MIXED : SERVO_DEVICES[0]);
}
function servoDeviceOptions(b){
  b = b||buildGet();
  const list = SERVO_DEVICES.slice();
  if(b.servoDevice === 'mixed') list.push(SERVO_MIXED);
  return list;
}

const SERVO_TOPOS = [
  /* ------------------------------------------------------------- Maestro */
  {id:'m1', device:'maestro', label:'One Maestro', sim:'full',
   boards:1, links:1, link:'chain',
   flow:[['Padawan','Maestro','Servos']],
   note:'Everything on one board. Nothing to address, nothing to chain — the simplest thing that works, and the right answer whenever the channel count allows it.'},
  {id:'m2c', device:'maestro', label:'Two, chained', sim:'sub',
   boards:2, links:1, link:'chain',
   flow:[['Padawan','Maestro 1','Maestro 2','Servos']],
   note:'The second board hangs off the first, both on the one line from the droid. Standard Pololu wiring — but read the warning below, because the stock sketch does not address them apart.'},
  {id:'m2s', device:'maestro', label:'Two, one link each', sim:'park',
   boards:2, links:2, link:'separate',
   flow:[['Padawan','Maestro 1','Servos'],['Padawan','Maestro 2','Servos']],
   note:'Each board on its own serial port from the droid — unambiguous, and the arrangement you would want. Not working yet: the sketch opens exactly one Maestro port, and all four of the Mega\'s UARTs are already spoken for.'},
  /* ------------------------------------------------------------- PCA9685 */
  {id:'p0', device:'pca', label:'Straight off the droid\'s board', sim:'full',
   boards:0, links:1, pca:2, direct:true, link:'chain',
   flow:[['Padawan','PCA9685 ×2','Servos']],
   note:'No controller in between — the expanders hang off the droid\'s own I2C pins and its sketch writes every pulse itself. Nothing extra to buy or flash, but there is nowhere to store movements, so only the mod2026 sketch can drive it.'},
  {id:'p1', device:'pca', label:'One controller, one expander', sim:'full',
   boards:1, links:1, pca:1, link:'chain',
   flow:[['Padawan','Controller','PCA9685','Servos']],
   note:'16 channels behind one small board. The controller answers the droid exactly as a Maestro would, so no code on the droid changes.'},
  {id:'p1x2', device:'pca', label:'One controller, two expanders', sim:'full',
   boards:1, links:1, pca:2, link:'chain',
   flow:[['Padawan','Controller','PCA9685 1','PCA9685 2','Servos']],
   note:'32 channels. The second expander shares the first\'s I2C wires with its address jumper soldered, so it is still one controller and one link from the droid.'},
  {id:'p2s', device:'pca', label:'Two controllers, one link each', sim:'park',
   boards:2, links:2, pca:1, link:'separate',
   flow:[['Padawan','Controller 1','PCA9685 1','Servos'],['Padawan','Controller 2','PCA9685 2','Servos']],
   note:'One controller and one expander at each end of the droid, each on its own port. Not working yet: the sketch opens one servo port, not two.'},
  {id:'p1s', device:'pca', label:'One controller, two links', sim:'park',
   boards:1, links:2, pca:2, link:'separate',
   flow:[['Padawan','Controller','PCA9685 1','Servos'],['Padawan','Controller','PCA9685 2','Servos']],
   note:'One controller holding both expanders, but addressed as two separate destinations from the droid. Not working yet, for the same reason — and the co-processor firmware would need a second link too.'}
];
function servoTopos(device){ return SERVO_TOPOS.filter(t=>t.device === (device || buildGet().servoDevice)); }
function servoTopoDef(id){ return SERVO_TOPOS.find(t=>t.id === id) || SERVO_TOPOS[0]; }

/* ------------------------------------ the shape each family starts from
   v1.45.0. Mike, on the PCA9685 arrangement: "defaulting to one controller
   and two expanders." That is `p1x2`: 32 channels behind one small board,
   one link from the droid, and the arrangement most people actually build —
   whereas `p0` (straight off the droid's own I2C pins) is the cheap special
   case that only the mod2026 sketch can drive.

   It is the DEFAULT OF THE QUESTION, not of the app: choose the PCA9685
   family and this is the shape you land on. `buildDefault()` still ships
   `p0`, on purpose — the starting build is the all-mod2026 clean slate whose
   sketch IS the no-controller arrangement (see the note there), and having
   the two disagree would mean a brand-new wizard opening on a contradiction
   it would then "fix" by re-picking the firmware. Changing the shipped
   default is a one-word change here if Mike would rather have it.

   Maestro starts at one board for the obvious reason: nothing to address,
   nothing to chain. */
const SERVO_DEFAULT_TOPO = {maestro:'m1', pca:'p1x2'};
function servoDefaultTopo(device){
  const list = servoTopos(device === 'other' ? 'maestro' : device);
  const want = SERVO_DEFAULT_TOPO[device === 'other' ? 'maestro' : device];
  return list.some(t=>t.id === want) ? servoTopoDef(want) : list[0];
}
/* the chosen shape, guarded against an id that does not belong to the chosen
   device (which is what a half-finished change of mind looks like) */
function buildServoTopo(b){
  b = b||buildGet();
  const dev = (b.servoDevice === 'other') ? 'maestro' : b.servoDevice;
  const list = servoTopos(dev);
  return list.some(t=>t.id === b.servoTopo) ? servoTopoDef(b.servoTopo) : servoDefaultTopo(dev);
}

/* --------------------------------- one Maestro, or one at each end (v1.45.0)
   Mike: "Maestro: choose one or two boards."

   The count was IMPLIED before — it was whichever wiring picture you clicked,
   so "how many boards have I got?" was answered by looking at three diagrams
   and counting the rectangles. It is the explicit question now and the shape
   is DERIVED from it: one board is `m1`, two boards is `m2c` (both on the one
   host link — the standard Pololu wiring) unless the build already says
   `m2s`, in which case that stays, because it is a real answer somebody gave
   and the advanced switch on the step is where they gave it.

   Nothing new is stored. The count is a view of `servoTopo`, which is still
   the single answer buildNormaliseServos() derives everything else from. */
const SERVO_BOARD_COUNTS = [
  {n:1, id:'one', label:'One board', sim:'full',
   note:'One Maestro running the whole droid — dome panels, body doors and arms. Nothing to address, nothing to chain, and the right answer whenever the channel count allows it. Every dome lead has to cross the slip ring.'},
  {n:2, id:'two', label:'Two boards', sim:'full',
   note:'One in the dome and one in the body — the usual arrangement on a finished droid, because the slip ring is the thing you do not want twenty-six servo wires crossing. Read what it says below about telling two boards apart.'}
];
/* which shape a count means, for THIS build */
function servoBoardCountTopo(n, b){
  b = b||buildGet();
  if(n === 1) return 'm1';
  const cur = servoTopoDef(b.servoTopo);
  return (cur.device === 'maestro' && cur.boards > 1) ? cur.id : 'm2c';
}
/* and the count the build is currently on */
function buildMaestroBoardCount(b){
  b = b||buildGet();
  return buildServoTopo(b).boards > 1 ? 2 : 1;
}

const SERVO_SPLIT_OPTIONS = [
  {id:'two', label:'One at each end', sim:'full',
   note:'A controller in the dome and another in the body — the usual arrangement on a finished droid, because the slip ring is the thing you do not want twenty-six servo wires crossing.'},
  {id:'one', label:'One for the whole droid', sim:'full',
   note:'A single board running the panels, the doors and the arms. The cheapest thing that works on a bench or a body-only test rig, and fine on a droid whose dome is fixed — you just have to get every dome lead across the slip ring.'}
];
function buildServoSplit(b){
  b = b||buildGet();
  return (b.servoSplit === 'one' && servoSharable(b.domeServo)) ? 'one' : 'two';
}
/* The physical boards this build has. EVERYTHING that used to walk
   `['dome','body']` walks this instead, so a one-controller droid draws one
   board card, one wiring row and one channel list rather than the same thing
   twice. 'both' is a location like any other — `hwAt()` resolves it. */
function buildServoLocs(b){ return buildServoSplit(b) === 'one' ? ['both'] : ['dome','body']; }
function servoLocLabel(loc){
  return loc === 'both' ? 'Dome + body' : (loc === 'dome' ? 'Dome' : 'Body');
}

/* Two Maestro-protocol boards have to reach the host somehow, and the answer
   is not free — see buildConflicts() for why `chain` is a warning rather
   than a detail. Only meaningful when there ARE two of them. */
const SERVO_LINK_OPTIONS = [
  {id:'chain',    label:'Both on the one host link', sim:'sub',
   note:'The standard Pololu arrangement — one TTL line, boards told apart by device number. It is also the only one the three sketches are wired for, since they open exactly one Maestro port. Read the warning below before you build it.'},
  {id:'separate', label:'A serial port each',        sim:'park',
   note:'A second UART for the second board. Cleaner, and unambiguous — but all four of the Mega\'s hardware UARTs are already spoken for (feet, dome, Maestro, sound) and none of the three sketches opens a second Maestro port. Recorded on the wiring sheet; not simulated.'}
];
/* Register the merged step's own two answers in the option catalogue, so
   `buildOpt`/`buildLabel` and the "every option explains itself" check reach
   them like any other. They are declared down here rather than inside the
   BUILD_OPTIONS literal because they belong with the logic that reads them. */
BUILD_OPTIONS.servoSplit  = SERVO_SPLIT_OPTIONS;
BUILD_OPTIONS.servoLink   = SERVO_LINK_OPTIONS;
BUILD_OPTIONS.servoDevice = SERVO_DEVICES;
BUILD_OPTIONS.servoTopo   = SERVO_TOPOS;

function buildServoLink(b){
  b = b||buildGet();
  return SERVO_LINK_OPTIONS.some(o=>o.id === b.servoLink) ? b.servoLink : 'chain';
}
/* is the link question even live? two boards, both on the host UART */
function buildTwoMaestroLinks(b){
  b = b||buildGet();
  return buildServoSplit(b) === 'two'
      && servoSpeaksMaestro(b.domeServo) && servoSpeaksMaestro(b.bodyServo);
}

/* the co-processor chip. SETUP_MCUS (maestro/setup-hw.js) is the catalogue —
   one list, so the build and the Bench cannot disagree about what an ESP32's
   SDA pin is. The Mega ADK is filtered out on purpose: it is the HOST board,
   and using the one board with the USB host on it as a servo expander is not
   an arrangement worth offering. */
function servoMcuOptions(){
  const src = (typeof SETUP_MCUS !== 'undefined') ? SETUP_MCUS : [];
  return src.filter(m => m.id !== 'megaadk')
            .map(m => ({id:m.id, label:m.label, note:m.note, sim:'full', sda:m.sda, scl:m.scl, uarts:m.uarts}));
}
function servoMcuOpt(id){
  const list = servoMcuOptions();
  return list.find(m => m.id === (id || buildGet().servoMcu)) || list[0] || {id:'nano', label:'Arduino Nano'};
}
function buildGet(){
  if(!PREFS.build){
    PREFS.build = buildDefault();
    /* carry an existing electronics choice into the new wizard rather than
       silently overwriting it — prefs saved before this feature have hw but
       no build block */
    if(PREFS.hw){
      if(PREFS.hw.dome) PREFS.build.domeServo = buildServoFromHw(PREFS.hw.dome);
      if(PREFS.hw.body) PREFS.build.bodyServo = buildServoFromHw(PREFS.hw.body);
      if(firmwareBlockers(PREFS.build.firmware, PREFS.build).length){
        PREFS.build.firmware = firmwareRecommend(PREFS.build).id;
        /* and the sound board that firmware actually drives — otherwise an
           upgrading user is met by a conflict they never chose, purely
           because the old prefs file had no opinion about audio */
        const au = (PROFILES[PREFS.build.firmware]||{}).audio;
        if(au) PREFS.build.sound = (au === 'DY-SV5W') ? 'dysv5w' : 'mdyx5300';
      }
    }
  }
  /* fill gaps rather than replacing, so a partial block keeps its answers */
  const d = buildDefault();
  for(const k in d) if(PREFS.build[k] === undefined) PREFS.build[k] = d[k];
  return PREFS.build;
}
/* ---------------------------------------------- a step's answer(s), v1.34.0
   A step used to BE an answer: `step.key` was a key of `PREFS.build`. The
   merged servo step is not, so anything that wants "what did the user say to
   this step" asks here instead of indexing the build directly. Simple steps
   are unchanged; only the servo step takes the composite path. */
function stepAnswerKeys(step){ return step.answers || [step.key]; }
function buildStepAnswer(step, b){
  b = b||buildGet();
  if(step.answers) return buildServoAnswer(b);
  const o = buildOpt(step.key, b[step.key]);
  return o ? {label:o.label, short:o.label, note:o.note, sim:o.sim} : null;
}
/* the servo step, as one answer: a long form for the review table and the
   wiring sheet, a short one for the rail chip */
function buildServoAnswer(b){
  b = b||buildGet();
  if(b.servoDevice === 'other')
    return {label:'Something else — recorded only', short:'Other', note:'', sim:'park'};
  if(b.servoDevice === 'mixed')
    return {label: buildLabel('domeServo', b.domeServo) + ' (dome) · ' + buildLabel('bodyServo', b.bodyServo) + ' (body)',
            short: servoShort(b.domeServo) + ' · ' + servoShort(b.bodyServo),
            note:'', sim:'sub'};
  const topo = buildServoTopo(b);
  const mcu  = buildUsesCoproc(b) ? ' · ' + servoMcuOpt(b.servoMcu).label : '';
  if(b.servoDevice === 'maestro'){
    const two = topo.boards > 1;
    return {label: servoDeviceDef('maestro').label + ' — ' + topo.label.toLowerCase() + ' · '
                 + buildLabel('domeServo', b.domeServo) + (two ? ' + ' + buildLabel('bodyServo', b.bodyServo) : ''),
            short: two ? servoShort(b.domeServo)+' + '+servoShort(b.bodyServo) : servoShort(b.domeServo),
            note:'', sim: topo.sim};
  }
  const n = (topo.pca || 1) * (topo.links > 1 ? topo.links : 1);
  return {label: 'PCA9685 × ' + n + ' — ' + topo.label.toLowerCase() + mcu,
          short: 'PCA ×' + n + (topo.links > 1 ? ' · 2 links' : ''),
          note:'', sim: topo.sim};
}

function buildOpt(key, id){
  return (BUILD_OPTIONS[key]||[]).find(o=>o.id===id) || null;
}
function buildLabel(key, id){ const o = buildOpt(key, id); return o ? o.label : (id||'—'); }
/* has this droid ever been configured? drives the first-run wizard */
function buildConfigured(){ return !!(PREFS.build && PREFS.build.done); }

/* --------------------------------------------------------- derived facts */
function buildFootPWM(b){ return (b||buildGet()).bodyDrive === 'flipsky'; }
/* "does anything on this droid answer restartScript() over a UART?" —
   which is the question every firmware check is really asking. A MaestroPCA
   co-processor counts, because that is precisely what it is built to do. */
function buildUsesMaestro(b){
  b = b||buildGet();
  return servoSpeaksMaestro(b.domeServo) || servoSpeaksMaestro(b.bodyServo);
}
function buildUsesPCA(b){
  b = b||buildGet();
  return servoUsesPca(b.domeServo) || servoUsesPca(b.bodyServo);
}
/* is there a MaestroPCA co-processor anywhere in this build? (v1.33.0) */
function buildUsesCoproc(b){
  b = b||buildGet();
  return !!(servoCoprocBoards(b.domeServo) || servoCoprocBoards(b.bodyServo));
}
/* how many PCA9685s hang off the co-processor at a location */
function buildCoprocBoards(loc, b){
  b = b||buildGet();
  return servoCoprocBoards(loc === 'dome' ? b.domeServo : b.bodyServo);
}
/* the board the host talks to over the Maestro link, if any — dome first,
   it is the bigger board on a normal build and the one the starter is
   generated for. Returns a BOARD id (`mini24`, `pca32`), which for a
   co-processor is not the same string as the build answer. */
function buildMaestroBoard(b){
  b = b||buildGet();
  for(const key of ['domeServo','bodyServo']){
    const o = servoOpt(b[key]);
    if(o && o.maestroProtocol) return o.hw;
  }
  return null;
}
/* The board the SEQUENCER should be built for — a Maestro if the build has
   one, otherwise the PCA9685 arrangement the build implies.

   Before v1.27.0 this was just buildMaestroBoard(), so a PCA-only build had
   no sequencer at all: the desk was gated on PROFILE.hasMaestro and the
   button was simply dead. That was true when a PCA9685 could not run a
   stored routine. It can now — arduino/MaestroPCA is a co-processor that
   answers restartScript(n) exactly as a Maestro does — so the gate is about
   whether the build has ANY board that can hold sequences, which every
   build does. */
function buildSeqBoard(b){
  b = b||buildGet();
  const mae = buildMaestroBoard(b);
  if(mae) return mae;
  if(!buildUsesPCA(b)) return null;
  /* dome and body both on PCA9685s is the mod2026 arrangement: two boards,
     0x40 and 0x41, 32 channels between them */
  return (b.domeServo === 'mod2026' && b.bodyServo === 'mod2026') ? 'pca32' : 'pca16';
}
/* Can this build hold sequences at all? Drives the sequencer desk's door. */
function buildCanSequence(b){ return !!buildSeqBoard(b); }

/* -------------------------------------------------- firmware suitability
   Returns [] when a profile can run this build, or a list of {why, w}
   objections. Reasons are shown against the greyed-out option so nobody has
   to guess what is blocking it.

   The WEIGHT matters when nothing fits cleanly. A sound-board mismatch is a
   £15 module swap; a servo-board or foot-drive mismatch means the sketch
   physically cannot speak to what is bolted in. Ranking by count alone would
   let a sound objection outvote a drive one and recommend the wrong sketch. */
const BLOCK_HARD = 4, BLOCK_SOFT = 1;
function firmwareBlockers(fwId, b){
  b = b||buildGet();
  const out = [];
  const no = (why, w)=>out.push({why, w});
  /* An IMPORTED sketch (v1.22.0) is judged from what the transpiler actually
     found in it — which libraries it instantiates, whether it writes servo
     PWM for the feet, which sound board it opens — never from the
     assumptions below, which are about the three hand ports. Detected,
     not guessed: the same rule as everywhere else in this file. */
  if(typeof isSketchProfile === 'function' && isSketchProfile(fwId)){
    const p = PROFILES[fwId];
    if(!p) return out;
    if(p.hasMaestro && !buildUsesMaestro(b))
      no('this sketch fires Maestro subroutines, and nothing here answers them — the expanders are on the host\'s own I2C bus. A PCA9685 + co-processor answer would give it something to fire at', BLOCK_HARD);
    if(!p.hasMaestro && buildUsesMaestro(b))
      no('this sketch drives PCA9685 boards directly; it never opens a serial port to a Maestro', BLOCK_HARD);
    if(b.bodyDrive === 'flipsky' && !p.footPWM())
      no('no PWM foot output was found in this sketch — hub ESCs need one', BLOCK_HARD);
    const wants = (p.audio === 'DY-SV5W') ? 'dysv5w' : (p.audio === 'MD-YX5300') ? 'mdyx5300' : null;
    if(wants && b.sound !== wants)
      no('this sketch drives a '+p.audio, BLOCK_SOFT);
    return out;
  }
  if(fwId === 'mod2026'){
    if(b.bodyDrive === 'flipsky')
      no('mod2026 only talks to a Sabertooth over Serial1 — it has no PWM foot output for hub ESCs', BLOCK_HARD);
    if(buildUsesMaestro(b))
      no(buildUsesCoproc(b)
        ? 'mod2026 writes servo pulses itself over its OWN I2C bus — it never opens a serial port, so it cannot reach expanders that live behind a co-processor. Either put the PCA9685s on the host, or run one of the Maestro sketches'
        : 'mod2026 drives PCA9685 boards directly; it never opens a serial port to a Maestro', BLOCK_HARD);
    if(b.sound === 'dysv5w')
      no('mod2026 drives an MD-YX5300, not a DY-SV5W', BLOCK_SOFT);
  }else{
    if(!buildUsesMaestro(b))
      no('this sketch fires Maestro subroutines, and nothing here answers them — the expanders are on the host\'s own I2C bus. Putting them behind a MaestroPCA co-processor would give it something to fire at', BLOCK_HARD);
    if(b.sound === 'mdyx5300')
      no('both Maestro sketches drive a DY-SV5W', BLOCK_SOFT);
    if(fwId === 'maestro22' && b.bodyDrive === 'flipsky')
      no('the 2022 BETA is Sabertooth-only — hub motors need the 2025 sketch', BLOCK_HARD);
  }
  return out;
}
function firmwareCost(id, b){ return firmwareBlockers(id, b).reduce((a,x)=>a+x.w, 0); }
/* the best profile for a build, and why */
function firmwareRecommend(b){
  b = b||buildGet();
  /* imported sketches are SELECTABLE but never RECOMMENDED: the sim has
     walked the three ports line by line and can vouch for them; somebody's
     transpiled fork is their choice to make, not ours to push. */
  const pool = PROFILE_ORDER.filter(id=>!(typeof isSketchProfile === 'function' && isSketchProfile(id)));
  const clear = pool.filter(id=>firmwareBlockers(id, b).length === 0);
  if(clear.length){
    /* prefer 2025 over 2022 — same hardware, fewer bugs */
    const id = clear.indexOf('maestro25') >= 0 ? 'maestro25' : clear[0];
    return {id, why: firmwareWhy(id, b), clear};
  }
  /* nothing fits cleanly: cheapest set of objections wins, and the UI says so */
  const ranked = pool.slice().sort((a,c)=>firmwareCost(a,b) - firmwareCost(c,b));
  return {id:ranked[0], why:'nothing matches your hardware exactly — this is the closest', clear:[]};
}
function firmwareWhy(id, b){
  b = b||buildGet();
  if(typeof isSketchProfile === 'function' && isSketchProfile(id))
    return 'your own transpiled sketch — the sim runs exactly what the file says, including its bugs';
  if(id === 'mod2026') return 'PCA9685 servos, Sabertooth feet and an MD-YX5300 — exactly what this sketch drives';
  /* with a co-processor, "Maestro subroutines" needs one more sentence: the
     sketch is unchanged, and that IS the feature */
  const cop = buildUsesCoproc(b)
    ? ' — and your PCA9685s answer restartScript() through the co-processor, so the sketch cannot tell it is not a Pololu board'
    : '';
  if(id === 'maestro25') return (buildFootPWM(b)
    ? 'the only sketch with a PWM foot mode for your hub ESCs'
    : 'Maestro subroutines and a DY-SV5W, with the fewest outstanding bugs of the two Maestro sketches') + cop;
  return 'Maestro subroutines and a DY-SV5W, Sabertooth feet' + cop;
}

/* ----------------------------------------------------------- conflicts
   Things that are wrong RIGHT NOW between the saved build and the running
   sim. Shown in the Config tab and at the end of the wizard. */
function buildConflicts(b){
  b = b||buildGet();
  const out = [];
  firmwareBlockers(b.firmware, b).forEach(r=>out.push({kind:'fw', text:r.why, w:r.w}));
  /* say WHY the mismatch is still sitting there — it is sitting there because
     the builder chose that sketch on purpose (v1.35.0) */
  if(b.firmwarePinned && firmwareBlockers(b.firmware, b).length)
    out.push({kind:'fw', w:BLOCK_SOFT,
      text:'you chose '+buildLabel('firmware', b.firmware)+' yourself, so the setup has left it alone rather than swapping it — change the hardware above, or press "let the setup choose" on the Firmware step'});
  if(typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id !== b.firmware)
    out.push({kind:'live', text:'the sim is running '+PROFILE.short+' but your build says '+buildLabel('firmware', b.firmware)});
  if(b.firmware === 'maestro25' && typeof CFG !== 'undefined' &&
     CFG.FOOT_CONTROLLER !== undefined && CFG.FOOT_CONTROLLER !== (buildFootPWM(b)?1:0))
    out.push({kind:'live', text:'FOOT_CONTROLLER is '+CFG.FOOT_CONTROLLER+' but your feet are '+buildLabel('bodyDrive', b.bodyDrive)});
  const want = buildMaestroBoard(b);
  if(want && typeof MSTR !== 'undefined' && MSTR.loaded && MSTR.board !== want)
    out.push({kind:'live', text:'the loaded Maestro settings are a '+boardById(MSTR.board).label+', your build says '+boardById(want).label});
  /* a step may own more than one answer since v1.34.0, so scan the keys it
     declares rather than assuming step.key is one */
  BUILD_STEPS.forEach(s=>stepAnswerKeys(s).forEach(k=>{
    const o = buildOpt(k, b[k]);
    if(o && o.sim === 'park') out.push({kind:'park', text:s.title+': '+o.label});
  }));

  /* ---------------------------------------------- two boards, one host link
     This is the kind of thing the simulator exists to find. Both Maestro
     sketches construct the board as `MiniMaestro maestro(Serial3)` — no
     device number — and with the library's default the host emits the
     COMPACT protocol: a bare command byte with no address (verified against
     Pololu's own maestro-arduino library; see arduino/MaestroPCA/src/
     MaestroLink.h). Every board on that line therefore acts on every
     command, so `restartScript(2)` starts subroutine 2 on the dome board AND
     the body board. */
  /* the shape itself can be parked (v1.36.0) — three of the seven are
     arrangements the stock sketches cannot address */
  const topo = buildServoTopo(b);
  if(b.servoDevice === 'other')
    out.push({kind:'park', text:'Servo hardware: something other than a Maestro or a PCA9685 — recorded only'});
  else if(b.servoDevice === 'mixed'){ /* a real arrangement, just not one the picker draws */ }
  else if(topo.sim === 'park')
    out.push({kind:'park', text:'Servo hardware: '+topo.label.toLowerCase()+' — the sketch opens one servo port, not two'});

  if(buildTwoMaestroLinks(b)){
    if(buildServoLink(b) === 'chain')
      out.push({kind:'fw', w:BLOCK_SOFT, text:'both servo boards share the host link, and the sketch builds its Maestro with no device number — so it sends the compact protocol, which has no address in it. Every board on that line acts on every restartScript(). Give each board a device number and pass it to the constructor, or run both ends off one board'});
    else
      out.push({kind:'park', text:'Servos: a serial port each — the three sketches only ever open one Maestro port'});
  }
  return out;
}

/* ------------------------------------------------------------- applying
   Push the build into the running simulation. This is the whole point of
   the feature: the answers are not documentation, they ARE the config. */
function buildSet(key, id, opts){
  const b = buildGet();
  /* CHOOSING is not the same as CHANGING. Clicking the firmware card that is
     already selected is the user saying "this one, hold it" — and the early
     return below meant that click did nothing at all, so the card you picked
     was the one arrangement that never got pinned. Record the intent first. */
  if(key === 'firmware') b.firmwarePinned = true;
  if(b[key] === id){ if(key === 'firmware') prefsSave(); return b; }
  b[key] = id;
  /* keep PREFS.hw — which the Boards section and every saved setup .json
     already speak — in step with the two servo-controller answers, and keep
     the merged question's own invariants (v1.34.0) */
  if(key === 'domeServo' || key === 'bodyServo' || key === 'servoSplit' ||
     key === 'servoDevice' || key === 'servoTopo' ||
     key === 'servoSize1'  || key === 'servoSize2') buildNormaliseServos(b, key);
  /* ...and the BENCH wizard's own answers (v1.33.0). The build owns which
     chip the co-processor is and how many expanders it drives; setup-hw.js
     asks the same two questions on its Controller and PCA9685s steps, and
     a hand-kept second copy is a copy that eventually differs — the lesson
     `blocks.js` and the HW seam already taught this repo. Write through,
     exactly as PREFS.hw does above. */
  if(key === 'domeServo' || key === 'bodyServo' || key === 'servoMcu') buildSyncBench(b);
  /* v1.35.0 — the firmware is an ANCHOR now, not a consequence.
     It used to be re-picked whenever a hardware change invalidated it,
     which was reasonable while it was the LAST question: everything above
     it was already settled, so the re-pick was the answer catching up. It
     is question 3 now, and the same line would mean choosing hub motors on
     step 7 silently threw away the sketch you chose on step 3.

     So: once you have picked one yourself, it stays. The clash shows up in
     buildConflicts(), on the option card that caused it, and on the review
     — and `buildUnpinFirmware()` hands the decision back. Until then (a
     fresh build that has never been asked) the old behaviour stands, so a
     default build still converges on something runnable. */
  if(key === 'firmware') b.firmwarePinned = true;
  else if(!b.firmwarePinned && firmwareBlockers(b.firmware, b).length)
    b.firmware = firmwareRecommend(b).id;
  prefsSave();
  if(!opts || opts.apply !== false) buildApply();
  return b;
}

/* Hand the firmware decision back to the setup. Used by the "let the setup
   choose" button, and by Reset. */
function buildUnpinFirmware(){
  const b = buildGet();
  b.firmwarePinned = false;
  const rec = firmwareRecommend(b);
  if(b.firmware !== rec.id){ b.firmware = rec.id; buildApply(); }
  prefsSave();
  return b.firmware;
}

/* ---------------------------------------- would THIS answer break the sketch?
   v1.35.0. With the firmware chosen up front, the hardware steps that follow
   have to say which of their options the chosen sketch cannot drive — the
   same service the firmware step has always done in the other direction.
   Returns only the objections this answer would ADD, so an option is not
   blamed for a clash that is already there. */
function optionBlockers(key, id, b){
  b = b||buildGet();
  if(key === 'firmware' || !b.firmwarePinned) return [];
  if(b[key] === id) return [];
  const before = firmwareBlockers(b.firmware, b).map(x=>x.why);
  const trial = Object.assign({}, b);
  trial[key] = id;
  if(key === 'domeServo' && buildServoSplit(b) === 'one') trial.bodyServo = id;
  if(key === 'bodyServo' && buildServoSplit(b) === 'one') trial.domeServo = id;
  return firmwareBlockers(b.firmware, trial).filter(x=>before.indexOf(x.why) < 0);
}

/* ------------------------------------------------- the servo invariants
   Two answers and a split flag can disagree, and the disagreements are not
   symmetric — so fix them in ONE place rather than at each control:

     · split 'one' means both ends are the same board, so `bodyServo`
       mirrors `domeServo`. It is a mirror, not a merge: flip back to two
       and the body answer is simply whatever the dome's was, which is a
       sane starting point rather than an empty one.
     · mod2026 cannot be shared — it is the sketch driving two fixed
       expanders on its own bus, not a board you address — so choosing it
       forces the split back to two.

   Then PREFS.hw is written for BOTH locations either way, because the
   Boards section, the wiring sheet and every saved .json read it. */
function buildNormaliseServos(b, changed){
  b = b||buildGet();

  /* ------------------------------------------- BACKWARDS: answer → shape
     `buildSet('domeServo','mini24')` has to go on working. It is the setter
     six other suites use to get a Maestro build, it is what a loaded .json
     effectively does, and it was the only setter this step had for two
     years. So a direct board answer is READ BACK into the shape rather than
     being overwritten by it — otherwise the forward derivation below would
     silently undo the caller a line later, which is the worst kind of API:
     one that accepts your value and ignores it. */
  if(changed === 'domeServo' || changed === 'bodyServo'){
    const famD = servoFamily(b.domeServo), famB = servoFamily(b.bodyServo);
    if(famD !== famB){
      b.servoDevice = 'mixed';
    }else if(famD === 'maestro'){
      b.servoDevice = 'maestro';
      if(changed === 'domeServo') b.servoSize1 = b.domeServo;
      else                        b.servoSize2 = b.bodyServo;
      const two = b.domeServo !== b.bodyServo
               || (buildServoTopo(b).device === 'maestro' && buildServoTopo(b).boards > 1);
      if(two){ if(servoTopoDef(b.servoTopo).boards < 2 || servoTopoDef(b.servoTopo).device !== 'maestro') b.servoTopo = 'm2c'; }
      else b.servoTopo = 'm1';
      b.servoSize1 = b.domeServo; b.servoSize2 = b.bodyServo;
    }else{
      b.servoDevice = 'pca';
      b.servoTopo = (famD === 'direct') ? 'p0'
                  : (b.domeServo === 'mpca32') ? 'p1x2' : 'p1';
    }
  }

  /* ------------------------------------------- FORWARDS: shape → answers
     Everything the rest of the app reads — domeServo, bodyServo, servoSplit,
     servoLink, PREFS.hw — is derived here from the four small answers the
     step actually asks. Doing it in one place is what let the UI become a
     form and a set of diagrams without a single change downstream. */
  if(b.servoDevice === 'maestro' || b.servoDevice === 'pca'){
    const topo = buildServoTopo(b);
    if(b.servoTopo !== topo.id) b.servoTopo = topo.id;

    if(b.servoDevice === 'maestro'){
      const ok1 = servoOpt(b.servoSize1) && servoFamily(b.servoSize1) === 'maestro';
      const ok2 = servoOpt(b.servoSize2) && servoFamily(b.servoSize2) === 'maestro';
      b.servoSize1 = ok1 ? b.servoSize1 : 'mini24';
      b.servoSize2 = ok2 ? b.servoSize2 : 'mini12';
      b.domeServo  = b.servoSize1;
      b.bodyServo  = (topo.boards > 1) ? b.servoSize2 : b.servoSize1;
    }else{
      /* one co-processor answer per LINK, sized by the expanders it holds;
         `direct` is the no-controller shape, which IS mod2026 */
      const per = topo.direct ? 'mod2026'
                : (topo.pca === 2 && topo.links === 1) ? 'mpca32' : 'mpca16';
      b.domeServo = per;
      b.bodyServo = per;
    }
    /* TWO BOARDS, not two links. `links` is how many wires leave the droid;
       `boards` is how many things have servo headers on them — and it is
       the second that decides whether the sim has one channel map or two.
       Getting this the wrong way round made "two, chained" collapse into a
       single board, which silently took the compact-protocol warning with
       it: the very finding that arrangement exists to carry. */
    b.servoSplit = (topo.boards > 1 || topo.links > 1) ? 'two' : 'one';
    b.servoLink  = topo.link || 'chain';
  }else{
    /* 'other' and 'mixed' both leave the two answers exactly where they are.
       Mike: "Other wont do anythign just yet" — and blanking them would take
       the running simulator down with the question. */
    b.servoSplit = 'two';
  }

  /* a shared board has to BE shareable; the mod2026 expanders never are —
     they are two fixed addresses on the host bus, not one board */
  if(b.servoSplit === 'one' && !servoSharable(b.domeServo)) b.servoSplit = 'two';
  if(b.servoSplit === 'one') b.bodyServo = b.domeServo;

  const hw = hwGet();
  const d = buildOpt('domeServo', b.domeServo), y = buildOpt('bodyServo', b.bodyServo);
  if(d) hw.dome = d.hw;
  if(y) hw.body = y.hw;
  return b;
}

/* Push the co-processor answers into the Bench wizard's store. Only when
   the build actually HAS a co-processor: a Maestro build has no opinion
   about what chip is bolted to a PCA9685, and overwriting the bench's
   answer with a default would be inventing one. */
function buildSyncBench(b){
  b = b||buildGet();
  if(typeof HW === 'undefined' || !HW.setSetup) return false;
  if(!buildUsesCoproc(b)) return false;
  const hw = Object.assign({}, HW.setup() || {});
  hw.mcu = servoMcuOpt(b.servoMcu).id;
  /* the dome is the bigger board on a normal build; fall back to the body */
  hw.boards = buildCoprocBoards('dome', b) || buildCoprocBoards('body', b) || hw.boards || 1;
  /* THE BENCH OPENS ON PCA_Bridge (v1.38.0). It used to pre-select the droid
     sketch, which is the one you flash LAST — after the endpoints exist. Mike:
     "once the servo hardware is open we should default to the PCA Bridge -
     then we can test the imported file in safe manor or guide the user to the
     initial setup of the servos". Both jobs need this app driving the board,
     and only PCA_Bridge lets it. Never overwrite a deliberate choice. */
  if(!hw.sketch) hw.sketch = 'bridge';
  HW.setSetup(hw);
  return true;
}

/* returns a list of what it actually changed, for the log and the UI */
function buildApply(){
  const b = buildGet();
  const did = [];

  if(typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id !== b.firmware && PROFILES[b.firmware]){
    loadProfile(b.firmware);
    did.push('firmware → '+PROFILE.short);
  }
  if(typeof CFG !== 'undefined' && CFG.FOOT_CONTROLLER !== undefined){
    const want = buildFootPWM(b) ? 1 : 0;
    if(CFG.FOOT_CONTROLLER !== want){
      CFG.FOOT_CONTROLLER = want;
      MOT.leftFoot = MOT.rightFoot = 90; MOT.drive = MOT.turn = 0;
      MOT.driveAt = MOT.footAt = -1e9;
      did.push('FOOT_CONTROLLER = '+want+(want?' (hub ESCs on 44/45)':' (Sabertooth on Serial1)'));
      if(typeof buildOutputs === 'function') buildOutputs();
    }
  }
  const want = buildMaestroBoard(b);
  if(want && typeof MSTR !== 'undefined' && MSTR.loaded && MSTR.board !== want && typeof setBoard === 'function'){
    setBoard(want);
    did.push('Maestro board → '+boardById(want).label);
    if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
  }
  /* HW.setup() lives on CFG, and loadProfile() above replaces CFG wholesale —
     so the co-processor answers have to be put back after it, not only when
     they are first chosen. */
  buildSyncBench(b);
  prefsSave();
  if(did.length) lg('sys','build config applied — '+did.join(' · '));
  return did;
}

/* generate a starter .mstr for the board this build calls for, if there is
   nothing loaded yet — so the wizard's wiring step has channels to draw */
function buildEnsureMaestro(){
  const want = buildSeqBoard();
  if(!want || typeof makeStarter !== 'function') return false;
  /* ONLY when there is nothing to work with. It used to also regenerate when
     the loaded board disagreed with the build's Maestro answer, which was
     harmless while a mod2026 build wanted no board at all — it returned
     above. Now that such a build wants `pca32`, that same line would throw
     away a Maestro settings file the moment anything touched the wizard's
     wiring step. Keeping a loaded config in step with the build is
     setBoard()'s job (see buildLiveIssues), and it asks first. */
  if(MSTR.loaded) return false;
  /* ...and never over the top of a table somebody has worked on, whatever
     `loaded` says. `loaded` is set by an import or a starter, so a table
     built up channel-by-channel in the bench never had it — and a starter
     generated here would then quietly replace every name, endpoint and
     mapping with the factory pair (v1.43.0, maestro/servo-store.js). */
  if(typeof servoStoreWorth === 'function' && servoStoreWorth()){
    MSTR.loaded = true;
    return false;
  }
  /* A PCA build's 32 channels are the dome-and-body arrangement, and the
     dome layout (pies first, side panels filling the rest) is the one worth
     starting from — the body layout would leave two thirds of them unnamed. */
  const kind = (buildGet().domeServo !== 'mod2026' || boardById(want).pca) ? 'dome' : 'body';
  makeStarter(kind, want);
  if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
  return true;
}

/* ------------------------------------------------------------- summary
   One row per answer — used by the Config tab, the wizard's review step
   and the wiring sheet header. */
function buildSummaryRows(b){
  b = b||buildGet();
  /* ONE ROW PER STEP, always — the Config tab and three suites count on it,
     and it is also just true: a row is an answer to a question. The merged
     servo step folds both ends and the co-processor chip into its label. */
  return BUILD_STEPS.map(s=>{
    const a = buildStepAnswer(s, b);
    return {key:s.key, title:s.title, id:b[s.key],
            label:a ? a.label : b[s.key], note:a ? (a.note||'') : '',
            sim:a ? a.sim : 'full'};
  });
}
