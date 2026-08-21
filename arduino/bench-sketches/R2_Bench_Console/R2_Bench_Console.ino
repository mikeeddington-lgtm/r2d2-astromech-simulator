/* =====================================================================
   R2 BENCH CONSOLE  -  drive the droid's servo hardware by typing at it

   Mike, 2026-08-21: *"for my testing I dont want to use a full Padawan
   360 on Arduino, can you create a sketch I can drive via a serial
   connection that fires the commands?"*

   So: no USB Host Shield, no Xbox controller, no Sabertooth, no Syren,
   no audio player, no droid. One board, one wire to the servo hardware,
   and the USB serial monitor. Everything Padawan would ever ask of the
   servo layer, you ask by hand - and, crucially, you can see the answer.

   It talks to any ONE of three back ends, chosen by a single #define:

     BT_MAESTRO   a real Pololu (Mini/Micro) Maestro over a UART
     BT_PCA       MaestroPCA driving PCA9685 board(s) over I2C
     BT_LEDC      MaestroPCA driving ESP32 pins directly (no expander)

   The COMMANDS ARE THE SAME on all three. That is the point: `t 0 7296`
   moves channel 0 whichever board is under it, so a sequence you proved
   on the bench Maestro can be proved again on the PCA rig without
   relearning anything, and a difference in behaviour is a difference in
   the HARDWARE rather than in the test.

   ---------------------------------------------------------------------
   THE ONE THING THIS DOES THAT THE LIBRARIES DO NOT

   `PololuMaestro`'s read commands are written `while (_stream->available()
   < 2);` - a bare spin with no timeout. Call `getPosition()` with the
   Maestro's TX not wired back (which is how most droids are wired: one
   wire, outbound only) and the sketch hangs there forever. It looks
   exactly like a dead board, which is the family of fault that cost this
   project a whole bench session already.

   So every read here is done by hand against a deadline (REPLY_MS) and a
   silent board is REPORTED as silent. The library is still used for the
   writes, which are fine.

   ---------------------------------------------------------------------
   WIRING

   BT_MAESTRO - three things, and only three:
     Arduino TX  ->  Maestro RX      (they cross over)
     Arduino GND ->  Maestro GND     <- the one people forget
     Maestro servo power + logic power (the VSRV=VIN jumper does both)
   Optional fourth, and worth it: Maestro TX -> Arduino RX, which is what
   makes `p`, `err` and `state` able to answer at all.

   *** MIND "TXIN" ***  The Mini Maestro has THREE serial pins: RX, TX and
   TXIN. TXIN is a daisy-chain input used only in USB Chained mode and is
   dead in UART mode. A wire on it is indistinguishable from a dead board.
   The Maestro must also be in Serial mode "UART, fixed baud rate" at
   MAESTRO_BAUD with CRC disabled, and Apply Settings must have been
   clicked. A factory-reset board comes up in USB Dual Port mode, which
   ignores the RX pin BY DESIGN - every test on one is meaningless.

   BT_PCA - PCA9685 on I2C (Mega: SDA 20 / SCL 21; ESP32: 21 / 22 by
   default), V+ from a REAL 5-6 V servo supply, never the Arduino's 5 V,
   common ground, and 1000-4700 uF across V+/GND. The bus is SCANNED at
   boot (0x40-0x7F, All Call 0x70 excluded) so it finds your boards
   wherever you jumpered them; `scan` re-runs it and prints the map.

   BT_LEDC - servos straight off ESP32 pins listed in LEDC_PINS. Sixteen
   channels maximum; that is the silicon, not a setting.

   ---------------------------------------------------------------------
   TYPING AT IT

   Open the monitor at CONSOLE_BAUD. Both styles work at once:

     * one-key commands fire the instant you press them, so they work
       with the monitor's line ending set to "No line ending". They are
       all digits or punctuation, never letters.
     * word commands need Enter. Set the line ending to "Newline" (or
       "Both NL & CR") and both styles work together.

   `?` prints the whole list. Nothing here blocks: `flap` is a state
   machine, not a loop full of delay(), because MaestroPCA's engine dies
   quietly if update() stops being called.
   ===================================================================== */


/* ============================ 1. WHICH BACK END ==================== */

#define BT_MAESTRO 1      /* a real Pololu Maestro, over a UART        */
#define BT_PCA     2      /* MaestroPCA + PCA9685(s), over I2C         */
#define BT_LEDC    3      /* MaestroPCA + ESP32 pins direct (16 max)   */

#ifndef BENCH_TARGET
#define BENCH_TARGET BT_MAESTRO       /* <<<<<< CHANGE THIS ONE LINE */
#endif


/* ============================ 2. CONFIGURATION ===================== */

#define CONSOLE        Serial         /* where you type                */
#define CONSOLE_BAUD   115200
#define CONSOLE_ECHO   1              /* 0 if your monitor echoes too   */

#define REPLY_MS       50             /* how long to wait for a board
                                         that may not be wired to answer */
#define DEFAULT_NUDGE  100            /* quarter-us for + / -  (= 25 us) */
#define FLAP_HOLD_MS   1200           /* per throw; a full travel at
                                         speed 80 / accel 10 is ~1.1 s   */

#if BENCH_TARGET == BT_MAESTRO
  /* Leave MAESTRO_PORT undefined to let the board pick: Mega/ADK and
     Leonardo get Serial1, a Uno falls back to SoftwareSerial on pin 11.
     On an ESP32 name the port yourself and give begin() its pins below. */
  /* #define MAESTRO_PORT Serial1 */
  #define MAESTRO_BAUD    9600        /* must match FixedBaudRate       */
  #define MAESTRO_IS_MINI 1           /* 0 for a 6-channel Micro Maestro */
  #define MAESTRO_CHANNELS 18         /* channels on YOUR board          */
#endif

#if BENCH_TARGET == BT_PCA
  #define PCA_BOARDS_MAX  2           /* how many drivers to declare     */
  #define PCA_OSC_HZ      25000000UL  /* trim if pulses measure off      */
  #define PCA_SERVO_HZ    50.0f
#endif

#if BENCH_TARGET == BT_LEDC
  /* LEDC_PINS[i] is the GPIO for CHANNEL i - the `pin` column of the
     table indexes THIS array. Avoid the strapping pins (0, 2, 12, 15)
     if a servo can hold a line at boot; they are left out here. */
  static const uint8_t LEDC_PINS[] = { 13, 14, 27, 26, 25, 33, 32, 4,
                                       16, 17,  5, 18, 19, 21, 22, 23 };
#endif


/* ============================ 3. INCLUDES ========================== */

#if BENCH_TARGET == BT_MAESTRO
  #include <PololuMaestro.h>
  #ifndef MAESTRO_PORT
    #ifdef SERIAL_PORT_HARDWARE_OPEN
      #define MAESTRO_PORT SERIAL_PORT_HARDWARE_OPEN
    #else
      #include <SoftwareSerial.h>
      SoftwareSerial maestroSoft(10, 11);   /* RX 10, TX 11 */
      #define MAESTRO_PORT maestroSoft
      #define MAESTRO_SOFT 1
    #endif
  #endif
  #if MAESTRO_IS_MINI
    MiniMaestro maestro(MAESTRO_PORT);
  #else
    MicroMaestro maestro(MAESTRO_PORT);
  #endif
#else
  #include <MaestroPCA.h>
  #include "sequences.h"              /* the sim's export, or the starter */
  #if BENCH_TARGET == BT_PCA
    #include <Wire.h>
    #include <Adafruit_PWMServoDriver.h>
    #include <MpcaScan.h>
    Adafruit_PWMServoDriver pcaA(0x40);
    #if PCA_BOARDS_MAX > 1
      Adafruit_PWMServoDriver pcaB(0x41);
      Adafruit_PWMServoDriver* const PCA_BOARDS[] = { &pcaA, &pcaB };
    #else
      Adafruit_PWMServoDriver* const PCA_BOARDS[] = { &pcaA };
    #endif
    uint8_t pcaFound[PCA_BOARDS_MAX];
    uint8_t pcaOnBus = 0, pcaBound = 0;
    MaestroPCA maestro(PCA_BOARDS, PCA_BOARDS_MAX,
                       MPCA_CHANNEL_TABLE, MPCA_CHANNELS,
                       MPCA_SEQ_TABLE, MPCA_SEQUENCES);
  #else
    #include <MpcaEsp32.h>
    MpcaLedcOutput ledcOut(LEDC_PINS, sizeof(LEDC_PINS));
    MaestroPCA maestro(ledcOut,
                       MPCA_CHANNEL_TABLE, MPCA_CHANNELS,
                       MPCA_SEQ_TABLE, MPCA_SEQUENCES);
  #endif
#endif


/* ============================ 4. THE CHANNEL TABLE =================

   On the PCA back ends the table already exists, in sequences.h, and is
   read straight out of PROGMEM - one source of truth, so the console can
   never disagree with the sequences about where a channel's endpoints
   are.

   On a real Maestro the board holds its own limits and will not tell you
   what they are over the command port (0J40 s8: the port drives, it does
   not configure), so the sketch needs its own copy. What is below is
   Mike's dome Mini Maestro 18, tuned against real linkages.

   *** THIS TABLE IS READ-ONLY. *** The names and endpoints were measured
   on the droid. Nothing here rewrites them, and neither should you.

   The endpoints matter for exactly two reasons: `<`, `>`, `=`, `flap`
   and `pct` need somewhere to aim, and the sketch warns when a typed
   target falls outside them. It cannot ENFORCE them and does not try -
   the BOARD clamps, silently and with no error, which is precisely the
   fault `p` exists to catch. Ask for 4000 on a channel stored at 4544
   and the servo stops at 4544 while the console still says 4000: that
   reads exactly like a binding linkage or a dying servo, and the
   read-back is the only thing that tells them apart.
   =================================================================== */

#if BENCH_TARGET == BT_MAESTRO
struct BenchChan { const char* name; uint16_t lo, hi; };
const BenchChan CHAN[MAESTRO_CHANNELS] = {
  { "PP5",    4544, 7296 },   /*  0  pie panel                        */
  { "PP6",    4544, 7296 },   /*  1  pie panel                        */
  { "PP1",    5056, 7744 },   /*  2  pie panel  (saber launcher)      */
  { "PP2",    4544, 7296 },   /*  3  pie panel  (lifeform scanner)    */
  { "HP3-1",  3968, 8000 },   /*  4  holo 3                           */
  { "HP3-2",  3968, 8000 },   /*  5  holo 3                           */
  { "P13",    4032, 7616 },   /*  6  side panel                       */
  { "HP1-1",  3968, 8000 },   /*  7  holo 1                           */
  { "HP1-2",  3968, 8000 },   /*  8  holo 1                           */
  { "P1-Fix", 3968, 8000 },   /*  9  side panel                       */
  { "P2",     4032, 7616 },   /* 10  side panel                       */
  { "P3",     4032, 7360 },   /* 11  side panel                       */
  { "P4",     3968, 7616 },   /* 12  side panel                       */
  { "P7",     4416, 8000 },   /* 13  side panel                       */
  { "HP2-1",  3776, 8000 },   /* 14  holo 2                           */
  { "HP2-2",  3968, 8000 },   /* 15  holo 2                           */
  { "P11",    4416, 7744 },   /* 16  side panel                       */
  { "(spare)",3968, 8000 },   /* 17  unnamed, no sequence drives it   */
};

/* The slot map of R2-dome-padawan.mstr, so `g 4` can say what it fired. */
const char* const SLOT[] = {
  "Dome Pies Open", "Dome Pies Close", "Dome Panels Open",
  "Dome Panels Close", "Whole Dome Open", "Whole Dome Close",
  "Dome Wave", "Dome Home"
};
#define SLOT_COUNT 8
#endif


static uint8_t chanCount(){
#if BENCH_TARGET == BT_MAESTRO
  return MAESTRO_CHANNELS;
#else
  return MPCA_CHANNELS;
#endif
}

#if BENCH_TARGET != BT_MAESTRO
/* One read of the PROGMEM row; the caller takes what it needs. */
static void chanRow(uint8_t ch, MpcaChannelDef* out){
  memcpy_P(out, &MPCA_CHANNEL_TABLE[ch], sizeof(MpcaChannelDef));
}
#endif

static uint16_t chanLo(uint8_t ch){
#if BENCH_TARGET == BT_MAESTRO
  return CHAN[ch].lo;
#else
  MpcaChannelDef d; chanRow(ch, &d); return d.min;
#endif
}
static uint16_t chanHi(uint8_t ch){
#if BENCH_TARGET == BT_MAESTRO
  return CHAN[ch].hi;
#else
  MpcaChannelDef d; chanRow(ch, &d); return d.max;
#endif
}
static void chanName(uint8_t ch){
#if BENCH_TARGET == BT_MAESTRO
  CONSOLE.print(CHAN[ch].name);
#else
  CONSOLE.print(F("ch")); CONSOLE.print(ch);
#endif
}


/* ============================ 5. THE BACK-END SHIM =================

   Ten calls. Everything above this line is the console; everything below
   it is the board. Adding a fourth back end means adding ten functions
   and nothing else.
   =================================================================== */

#define NO_REPLY 0xFFFFFFFFUL

/* F() yields a __FlashStringHelper* on a real board and a plain char* in
   the host-side compile harness, so anything that PASSES one needs a name
   for the type that is right in both. */
#if defined(ARDUINO) || defined(__AVR__)
  #define FSTR const __FlashStringHelper*
#else
  #define FSTR const char*
#endif

#if BENCH_TARGET == BT_MAESTRO
  #define BACKEND_NAME "real Pololu Maestro over a UART"
#elif BENCH_TARGET == BT_PCA
  #define BACKEND_NAME "MaestroPCA on PCA9685"
#else
  #define BACKEND_NAME "MaestroPCA on ESP32 pins (LEDC)"
#endif

static void hwBegin();
static void hwUpdate();
static void hwTarget(uint8_t ch, uint16_t qus);
static void hwSpeed(uint8_t ch, uint16_t v);
static void hwAccel(uint8_t ch, uint8_t v);
static void hwScript(uint8_t n);
static void hwStopScript();
static void hwHome();
static uint32_t hwPosition(uint8_t ch);   /* NO_REPLY if it stayed silent */
static int32_t  hwMoving();               /* -1 = it would not say        */


#if BENCH_TARGET == BT_MAESTRO

/* --- raw, bounded reads. See the header: the library's own spin forever
       on a board that is not wired to answer, which is the whole fault
       this sketch exists to make visible rather than fatal. --------- */
static void maestroFlush(){ while(MAESTRO_PORT.available()) MAESTRO_PORT.read(); }

static int32_t maestroRead(uint8_t want, uint8_t* into){
  uint8_t got = 0;
  uint32_t t0 = millis();
  while(got < want && (uint32_t)(millis() - t0) < REPLY_MS)
    if(MAESTRO_PORT.available()) into[got++] = (uint8_t)MAESTRO_PORT.read();
  return (got == want) ? got : -1;
}

static void hwBegin(){
  MAESTRO_PORT.begin(MAESTRO_BAUD);
  delay(50);
}
static void hwUpdate(){}
static void hwTarget(uint8_t ch, uint16_t qus){ maestro.setTarget(ch, qus); }
static void hwSpeed(uint8_t ch, uint16_t v){ maestro.setSpeed(ch, v); }
static void hwAccel(uint8_t ch, uint8_t v){ maestro.setAcceleration(ch, v); }
static void hwScript(uint8_t n){ maestro.restartScript(n); }
static void hwStopScript(){ maestro.stopScript(); }
static void hwHome(){ maestro.goHome(); }

static uint32_t hwPosition(uint8_t ch){
  uint8_t b[2];
  maestroFlush();                       /* a stale reply must never answer
                                           the next question */
  MAESTRO_PORT.write((uint8_t)0x90);    /* Get Position */
  MAESTRO_PORT.write((uint8_t)(ch & 0x7F));
  if(maestroRead(2, b) < 0) return NO_REPLY;
  /* a POSITION comes back 8 bits at a time, low byte first - a TARGET
     goes out 7 bits at a time. Confuse the two and everything under
     1024 still works, so the bug hides until a servo is on the end. */
  return (uint32_t)b[0] | ((uint32_t)b[1] << 8);
}

static int32_t hwMoving(){
  uint8_t b[1];
  maestroFlush();
  MAESTRO_PORT.write((uint8_t)0x93);    /* Get Moving State */
  if(maestroRead(1, b) < 0) return -1;
  return b[0];
}

static int32_t hwScriptStatus(){        /* 0 = running, 1 = stopped */
  uint8_t b[1];
  maestroFlush();
  MAESTRO_PORT.write((uint8_t)0xAE);
  if(maestroRead(1, b) < 0) return -1;
  return b[0];
}

static uint32_t hwErrors(){
  uint8_t b[2];
  maestroFlush();
  /* 0xA1 CLEARS the flags it reports, so there is exactly one reader and
     this is it. (It is also why this is a command and not something the
     sketch polls in the background: a poller would eat the evidence.) */
  MAESTRO_PORT.write((uint8_t)0xA1);
  if(maestroRead(2, b) < 0) return NO_REPLY;
  return (uint32_t)b[0] | ((uint32_t)b[1] << 8);
}

#else   /* ---------------- BT_PCA and BT_LEDC ---------------- */

static void hwBegin(){
#if BENCH_TARGET == BT_PCA
  Wire.begin();
  Wire.setClock(400000);              /* 400 kHz keeps 16+ channels cheap */
  delay(50);
  pcaOnBus = mpcaScan(pcaFound, PCA_BOARDS_MAX);
  pcaBound = mpcaBind(PCA_BOARDS, PCA_BOARDS_MAX, pcaFound, pcaOnBus);
  /* bind BEFORE begin(): recent Adafruit versions allocate the I2C device
     inside begin(), and re-addressing after that strands it. */
  maestro.begin(PCA_OSC_HZ, PCA_SERVO_HZ);
#else
  maestro.begin();
#endif
}
static void hwUpdate(){ maestro.update(); }   /* THE rule: every pass */
static void hwTarget(uint8_t ch, uint16_t qus){ maestro.setTarget(ch, qus); }
static void hwSpeed(uint8_t ch, uint16_t v){ maestro.setSpeed(ch, v); }
static void hwAccel(uint8_t ch, uint8_t v){ maestro.setAcceleration(ch, v); }
static void hwScript(uint8_t n){ maestro.restartScript(n); }
static void hwStopScript(){ maestro.stopScript(); }
static void hwHome(){ maestro.goHome(); }
static uint32_t hwPosition(uint8_t ch){ return maestro.getPosition(ch); }
static int32_t  hwMoving(){ return maestro.getMovingState(); }

#endif


/* ============================ 6. CONSOLE STATE ===================== */

#if BENCH_TARGET == BT_MAESTRO
  #define BENCH_CHANNELS MAESTRO_CHANNELS
#else
  #define BENCH_CHANNELS MPCA_CHANNELS
#endif

char     line[64];
uint8_t  lineLen = 0;
uint8_t  sel = 0;                     /* the working channel            */
uint16_t nudge = DEFAULT_NUDGE;
uint32_t monEvery = 0, monNext = 0;   /* streaming read-back            */
uint32_t loops = 0, loopRate = 0, rateAt = 0;
uint32_t cmds = 0;

struct { bool on; uint8_t ch, left; bool atHi; uint32_t next; } flap =
  { false, 0, 0, false, 0 };

/* What we last ASKED for, per channel. Not what the servo did - the board
   clamps silently and this sketch cannot see that without the read-back
   wire. It is here so `+` and `-` have something to count from on a droid
   wired the usual one-wire way, where every read comes back empty and
   nudging would otherwise reset to the midpoint every time. */
uint16_t asked[BENCH_CHANNELS];
bool     replyHintShown = false;


/* ============================ 7. HELPERS =========================== */

static bool okCh(long ch){
  if(ch >= 0 && ch < (long)chanCount()) return true;
  CONSOLE.print(F("  no channel ")); CONSOLE.print(ch);
  CONSOLE.print(F(" - this build has 0..")); CONSOLE.println(chanCount() - 1);
  return false;
}

static void say(uint8_t ch, FSTR what, long v){
  CONSOLE.print(F("  ch")); CONSOLE.print(ch);
  CONSOLE.print(F(" ")); chanName(ch);
  CONSOLE.print(F("  ")); CONSOLE.print(what);
  CONSOLE.print(F(" ")); CONSOLE.println(v);
}

/* Set a target, and say so - including when it is outside the endpoints
   this sketch knows about, because the board will clamp it without a
   word and the servo stopping short looks like a mechanical fault. */
static void setTargetSaying(uint8_t ch, long qus){
  if(qus < 0) qus = 0;
  if(qus > 16383) qus = 16383;
  hwTarget(ch, (uint16_t)qus);
  if(ch < BENCH_CHANNELS) asked[ch] = (uint16_t)qus;
  say(ch, F("target"), qus);
  if(qus != 0 && (qus < chanLo(ch) || qus > chanHi(ch))){
    CONSOLE.print(F("  ! outside this channel's endpoints ("));
    CONSOLE.print(chanLo(ch)); CONSOLE.print(F("..")); CONSOLE.print(chanHi(ch));
    CONSOLE.println(F(") - the board clamps silently. Check with `p`."));
  }
}

static void fireScript(long n){
  if(n < 0 || n > 255){ CONSOLE.println(F("  script 0..255")); return; }
  hwScript((uint8_t)n);
  CONSOLE.print(F("  restartScript(")); CONSOLE.print(n); CONSOLE.print(F(")"));
#if BENCH_TARGET == BT_MAESTRO
  if(n < SLOT_COUNT){ CONSOLE.print(F("  ")); CONSOLE.print(SLOT[n]); }
  CONSOLE.println();
  CONSOLE.println(F("  (a silent board here means the script is not ON it -"
                    " press Apply Settings in Control Center)"));
#else
  if(n >= MPCA_SEQUENCES){
    CONSOLE.print(F("  - but sequences.h only has 0.."));
    CONSOLE.print(MPCA_SEQUENCES - 1);
  }
  CONSOLE.println();
#endif
}

static void showPosition(uint8_t ch){
  uint32_t p = hwPosition(ch);
  CONSOLE.print(F("  ch")); CONSOLE.print(ch);
  CONSOLE.print(F(" ")); chanName(ch); CONSOLE.print(F("  "));
  if(p == NO_REPLY){
    CONSOLE.println(F("no reply"));
#if BENCH_TARGET == BT_MAESTRO
    if(!replyHintShown){
      replyHintShown = true;      /* said once, not once per `mon` tick */
      CONSOLE.println(F("  (Get Position needs the Maestro's TX wired back"
                        " to this board's RX. One wire, and it is worth it:"
                        " it is the only way to catch a silent clamp.)"));
    }
#endif
    return;
  }
  if(p == 0){ CONSOLE.println(F("0 - not being driven (no pulse)")); return; }
  CONSOLE.print(p); CONSOLE.print(F(" qus = "));
  CONSOLE.print(p / 4); CONSOLE.print(F(".")); CONSOLE.print((p % 4) * 25);
  CONSOLE.println(F(" us"));
}

static void listChannels(){
  CONSOLE.println(F("  ch  name      min    max   (quarter-microseconds)"));
  for(uint8_t i = 0; i < chanCount(); i++){
    CONSOLE.print(i == sel ? F(" >") : F("  "));
    CONSOLE.print(i); CONSOLE.print(i < 10 ? F("   ") : F("  "));
    chanName(i); CONSOLE.print(F("\t"));
    CONSOLE.print(chanLo(i)); CONSOLE.print(F("   ")); CONSOLE.println(chanHi(i));
  }
}

static void showState(){
  CONSOLE.print(F("  selected ch")); CONSOLE.print(sel);
  CONSOLE.print(F(" ")); chanName(sel);
  CONSOLE.print(F("   last asked ")); CONSOLE.print(asked[sel]);
  CONSOLE.print(F("   nudge ")); CONSOLE.print(nudge);
  CONSOLE.print(F(" qus   loop ")); CONSOLE.print(loopRate);
  CONSOLE.print(F(" Hz   commands ")); CONSOLE.println(cmds);
  int32_t m = hwMoving();
  CONSOLE.print(F("  moving: "));
  CONSOLE.println(m < 0 ? F("no reply") : (m ? F("yes") : F("no")));
#if BENCH_TARGET == BT_MAESTRO
  int32_t s = hwScriptStatus();
  CONSOLE.print(F("  script: "));
  CONSOLE.println(s < 0 ? F("no reply") : (s ? F("stopped") : F("RUNNING")));
#else
  CONSOLE.print(F("  script: "));
  if(maestro.scriptRunning()){
    CONSOLE.print(F("RUNNING  slot ")); CONSOLE.print(maestro.currentScript());
    CONSOLE.print(F("  tracks ")); CONSOLE.println(maestro.runningCount());
  } else CONSOLE.println(F("stopped"));
  #if BENCH_TARGET == BT_PCA
  CONSOLE.print(F("  PCA9685: ")); CONSOLE.print(pcaBound);
  CONSOLE.print(F(" bound of ")); CONSOLE.print(pcaOnBus);
  CONSOLE.println(F(" on the bus"));
  #endif
#endif
}

#if BENCH_TARGET == BT_MAESTRO
static void showErrors(){
  uint32_t e = hwErrors();
  if(e == NO_REPLY){
    CONSOLE.println(F("  no reply - Maestro TX is not wired back to this"
                      " board's RX, so it cannot answer."));
    return;
  }
  CONSOLE.print(F("  error flags 0x")); CONSOLE.println(e, HEX);
  if(!e){ CONSOLE.println(F("  clean.")); return; }
  static const char* const NAMES[] = {
    "serial signal", "serial overrun", "serial RX buffer full",
    "serial CRC", "serial protocol", "serial timeout",
    "script stack", "script call stack", "script program counter" };
  for(uint8_t i = 0; i < 9; i++)
    if(e & (1UL << i)){ CONSOLE.print(F("   - ")); CONSOLE.println(NAMES[i]); }
  CONSOLE.println(F("  (reading them CLEARS them - ask again to see them"
                    " come back)"));
}

/* Jumper this board's TX to its own RX and send a pattern. Proves the
   port is open, the baud is right, the pin is alive and the chip really
   is transmitting - which is the test that turns "the Maestro is dead"
   into "the Maestro is dead OR my Arduino never spoke". */
static void loopbackTest(){
  static const uint8_t PATTERN[] = { 0x55, 0xAA, 0x00, 0xFF, 0x84, 0x01, 0x02, 0x03 };
  CONSOLE.println(F("  loopback: jumper this board's TX to its own RX first."));
  maestroFlush();
  for(uint8_t i = 0; i < sizeof(PATTERN); i++) MAESTRO_PORT.write(PATTERN[i]);
  uint8_t got[sizeof(PATTERN)];
  uint8_t n = 0;
  uint32_t t0 = millis();
  while(n < sizeof(PATTERN) && (uint32_t)(millis() - t0) < 200)
    if(MAESTRO_PORT.available()) got[n++] = (uint8_t)MAESTRO_PORT.read();
  if(n == 0){ CONSOLE.println(F("  nothing came back - no jumper, or the"
                                " port is not transmitting.")); return; }
  bool ok = (n == sizeof(PATTERN));
  for(uint8_t i = 0; i < n; i++) if(got[i] != PATTERN[i]) ok = false;
  CONSOLE.print(F("  ")); CONSOLE.print(n); CONSOLE.print(F("/"));
  CONSOLE.print((int)sizeof(PATTERN));
  CONSOLE.println(ok ? F(" bytes returned intact - the port is good.")
                     : F(" bytes back, and they do not match. Check the baud."));
}

static void rawSend(char* rest){
  uint8_t n = 0;
  for(char* t = strtok(rest, " ,\t"); t; t = strtok(NULL, " ,\t")){
    long v = strtol(t, NULL, 16);
    MAESTRO_PORT.write((uint8_t)v);
    n++;
  }
  CONSOLE.print(F("  sent ")); CONSOLE.print(n); CONSOLE.println(F(" byte(s)"));
  CONSOLE.println(F("  (nothing is read back - use `p`, `err` or `state`"
                    " if you expect a reply)"));
}
#endif

#if BENCH_TARGET == BT_PCA
static void busScan(){
  pcaOnBus = mpcaScan(pcaFound, PCA_BOARDS_MAX);
  CONSOLE.print(F("  scanned 0x40-0x7F (All Call 0x70 and the sub-calls"
                  " excluded): "));
  CONSOLE.print(pcaOnBus); CONSOLE.println(F(" board(s)"));
  for(uint8_t i = 0; i < pcaOnBus && i < PCA_BOARDS_MAX; i++){
    CONSOLE.print(F("   board ")); CONSOLE.print(i);
    CONSOLE.print(F(" = 0x")); CONSOLE.println(pcaFound[i], HEX);
  }
  if(pcaOnBus == 0)
    CONSOLE.println(F("   nothing there. Check SDA/SCL, VCC, and a SHARED"
                      " GROUND."));
  CONSOLE.println(F("  (boards are numbered in ascending address order, so"
                    " one dropping off renumbers the rest)"));
}
#endif


/* ============================ 8. THE COMMANDS ====================== */

static void help(){
  CONSOLE.println();
  CONSOLE.println(F("R2 BENCH CONSOLE - " BACKEND_NAME));
  CONSOLE.println(F("Targets are QUARTER-microseconds throughout: 6000 = 1500 us."));
  CONSOLE.println();
  CONSOLE.println(F("ONE KEY, no Enter needed:"));
  CONSOLE.println(F("  0-9  fire that script slot        !  stop the script"));
  CONSOLE.println(F("  [ ]  select prev / next channel   /  go home"));
  CONSOLE.println(F("  < >  selected to min / max        =  to the midpoint"));
  CONSOLE.println(F("  + -  nudge it by the step         *  flap it 3 times"));
  CONSOLE.println(F("  #    state and counters           .  ALL channels limp"));
  CONSOLE.println(F("  ?    this list"));
  CONSOLE.println();
  CONSOLE.println(F("WORDS, then Enter:"));
  CONSOLE.println(F("  list                  the channel table"));
  CONSOLE.println(F("  sel <ch>              choose the working channel"));
  CONSOLE.println(F("  t <ch> <qus>          set target (0 = stop pulsing)"));
  CONSOLE.println(F("  us <ch> <us>          set target in microseconds"));
  CONSOLE.println(F("  pct <ch> <0-100>      set it as a % of min..max"));
  CONSOLE.println(F("  p [ch]                read the position back"));
  CONSOLE.println(F("  min|max|mid [ch]      drive to an endpoint"));
  CONSOLE.println(F("  off [ch]              stop pulsing that one (limp)"));
  CONSOLE.println(F("  all min|max|mid|home|off"));
  CONSOLE.println(F("  flap [ch] [n]         throw it n times, non-blocking"));
  CONSOLE.println(F("  nudge <qus>           set the + / - step"));
  CONSOLE.println(F("  speed <ch> <v>        0 = unlimited  (RUNTIME only)"));
  CONSOLE.println(F("  accel <ch> <v>        0 = unlimited  (RUNTIME only)"));
  CONSOLE.println(F("  g <n>                 restartScript(n)"));
  CONSOLE.println(F("  x                     stopScript"));
  CONSOLE.println(F("  home                  goHome"));
  CONSOLE.println(F("  state                 moving / script / counters"));
  CONSOLE.println(F("  mon [ms]              stream the position; mon 0 stops"));
  CONSOLE.println(F("  rate                  loop rate"));
#if BENCH_TARGET == BT_MAESTRO
  CONSOLE.println(F("  err                   read AND CLEAR the error flags"));
  CONSOLE.println(F("  raw <hex> <hex> ...   send bytes verbatim"));
  CONSOLE.println(F("  loopback              TX->RX jumper test"));
#endif
#if BENCH_TARGET == BT_PCA
  CONSOLE.println(F("  scan                  re-scan the I2C bus"));
#endif
  CONSOLE.println();
  CONSOLE.println(F("speed and accel are RUNTIME writes: a power cycle brings"));
  CONSOLE.println(F("the board's own stored values back. Nothing here ever"));
  CONSOLE.println(F("writes your calibration."));
  CONSOLE.println();
}

static void allTo(const char* what){
  for(uint8_t i = 0; i < chanCount(); i++){
    if(!strcmp(what, "min"))      hwTarget(i, chanLo(i));
    else if(!strcmp(what, "max")) hwTarget(i, chanHi(i));
    else if(!strcmp(what, "mid")) hwTarget(i, (uint16_t)((chanLo(i) + chanHi(i)) / 2));
    else if(!strcmp(what, "off")) hwTarget(i, 0);
  }
  if(!strcmp(what, "home")) hwHome();
  CONSOLE.print(F("  all channels -> ")); CONSOLE.println(what);
}

static void startFlap(uint8_t ch, uint8_t times){
  flap.on = true; flap.ch = ch; flap.left = times * 2; flap.atHi = false;
  flap.next = millis();
  CONSOLE.print(F("  flapping ch")); CONSOLE.print(ch);
  CONSOLE.print(F(" ")); chanName(ch);
  CONSOLE.print(F(" ")); CONSOLE.print(times);
  CONSOLE.println(F(" times - any command stops it"));
}
static void stopFlap(){ flap.on = false; }

static void serviceFlap(){
  if(!flap.on) return;
  if((int32_t)(millis() - flap.next) < 0) return;
  if(flap.left == 0){ flap.on = false; CONSOLE.println(F("  flap done")); return; }
  flap.atHi = !flap.atHi;
  hwTarget(flap.ch, flap.atHi ? chanHi(flap.ch) : chanLo(flap.ch));
  flap.left--;
  flap.next = millis() + FLAP_HOLD_MS;
}

/* --- the one-key commands ------------------------------------------ */

static bool isHotkey(char c){
  return (c >= '0' && c <= '9') || strchr("?!#.[]<>+-=*/", c) != NULL;
}

static void runHotkey(char c){
  cmds++;
  if(c != '*') stopFlap();
  if(c >= '0' && c <= '9'){ fireScript(c - '0'); return; }
  switch(c){
    case '?': help(); break;
    case '!': hwStopScript(); CONSOLE.println(F("  stopScript")); break;
    case '#': showState(); break;
    case '/': hwHome(); CONSOLE.println(F("  goHome")); break;
    case '.': allTo("off"); break;
    case '[': if(sel) sel--; else sel = chanCount() - 1; showState(); break;
    case ']': sel = (uint8_t)((sel + 1) % chanCount()); showState(); break;
    case '<': setTargetSaying(sel, chanLo(sel)); break;
    case '>': setTargetSaying(sel, chanHi(sel)); break;
    case '=': setTargetSaying(sel, (chanLo(sel) + chanHi(sel)) / 2); break;
    case '*': startFlap(sel, 3); break;
    case '+': case '-': {
      /* Step from the last TARGET, not from where the servo happens to be
         at this instant: ten presses then move ten steps even while it is
         still travelling, which is what a jog control has to do. It also
         means the key behaves identically on a one-wire Maestro that can
         never answer a read. Where it actually got to is what `p` is for.
         Fall back to the live position, then to the midpoint, because a
         nudge off an unknown position is a lunge. */
      uint32_t p = asked[sel];
      if(p == 0){
        uint32_t live = hwPosition(sel);
        if(live != NO_REPLY) p = live;
      }
      if(p == 0){
        p = (uint32_t)((chanLo(sel) + chanHi(sel)) / 2);
        CONSOLE.println(F("  (nothing driven yet - starting at the midpoint)"));
      }
      setTargetSaying(sel, (long)p + (c == '+' ? nudge : -(long)nudge));
      break;
    }
  }
}

/* --- the word commands --------------------------------------------- */

static bool eq(const char* a, const char* b){ return strcmp(a, b) == 0; }

static long argN(long dflt){
  char* t = strtok(NULL, " \t");
  return t ? strtol(t, NULL, 10) : dflt;
}

static void runLine(char* s){
  cmds++;
  stopFlap();
  for(char* p = s; *p; p++) if(*p >= 'A' && *p <= 'Z') *p += 32;

  char* cmd = strtok(s, " \t");
  if(!cmd) return;

  /* --- no arguments --- */
  if(eq(cmd,"help")  || eq(cmd,"h")){ help();          return; }
  if(eq(cmd,"list")  || eq(cmd,"l")){ listChannels();  return; }
  if(eq(cmd,"state") || eq(cmd,"s")){ showState();     return; }
  if(eq(cmd,"rate")){
    CONSOLE.print(F("  loop ")); CONSOLE.print(loopRate);
    CONSOLE.println(F(" Hz"));
    return;
  }
  if(eq(cmd,"home")){ hwHome();       CONSOLE.println(F("  goHome"));     return; }
  if(eq(cmd,"x") || eq(cmd,"stop")){
    hwStopScript(); CONSOLE.println(F("  stopScript"));
    return;
  }

  /* --- one argument --- */
  if(eq(cmd,"sel")){
    long c = argN(-1);
    if(okCh(c)){ sel = (uint8_t)c; showState(); }
    return;
  }
  if(eq(cmd,"nudge")){
    long v = argN(nudge);
    if(v > 0 && v < 4000) nudge = (uint16_t)v;
    CONSOLE.print(F("  step ")); CONSOLE.print(nudge);
    CONSOLE.println(F(" qus"));
    return;
  }
  if(eq(cmd,"g") || eq(cmd,"script")){ fireScript(argN(-1)); return; }

  /* --- targets --- */
  if(eq(cmd,"t")){
    long c = argN(-1), v = argN(-1);
    if(okCh(c) && v >= 0) setTargetSaying((uint8_t)c, v);
    return;
  }
  if(eq(cmd,"us")){
    long c = argN(-1), v = argN(-1);
    if(okCh(c) && v >= 0) setTargetSaying((uint8_t)c, v * 4);
    return;
  }
  if(eq(cmd,"pct")){
    long c = argN(-1), v = argN(-1);
    if(!okCh(c)) return;
    if(v < 0)   v = 0;
    if(v > 100) v = 100;
    long lo = chanLo((uint8_t)c), hi = chanHi((uint8_t)c);
    setTargetSaying((uint8_t)c, lo + (hi - lo) * v / 100);
    return;
  }
  if(eq(cmd,"p") || eq(cmd,"pos")){
    long c = argN(sel);
    if(okCh(c)) showPosition((uint8_t)c);
    return;
  }
  if(eq(cmd,"min")){
    long c = argN(sel);
    if(okCh(c)) setTargetSaying((uint8_t)c, chanLo((uint8_t)c));
    return;
  }
  if(eq(cmd,"max")){
    long c = argN(sel);
    if(okCh(c)) setTargetSaying((uint8_t)c, chanHi((uint8_t)c));
    return;
  }
  if(eq(cmd,"mid")){
    long c = argN(sel);
    if(okCh(c)) setTargetSaying((uint8_t)c,
                  (chanLo((uint8_t)c) + chanHi((uint8_t)c)) / 2);
    return;
  }
  if(eq(cmd,"off")){
    long c = argN(sel);
    if(okCh(c)) setTargetSaying((uint8_t)c, 0);
    return;
  }
  if(eq(cmd,"all")){
    char* w = strtok(NULL, " \t");
    if(w && (eq(w,"min") || eq(w,"max") || eq(w,"mid") ||
             eq(w,"home") || eq(w,"off")))  allTo(w);
    else CONSOLE.println(F("  all min|max|mid|home|off"));
    return;
  }
  if(eq(cmd,"flap") || eq(cmd,"f")){
    long c = argN(sel);
    if(!okCh(c)) return;
    long n = argN(3);
    if(n < 1)   n = 1;
    if(n > 100) n = 100;
    startFlap((uint8_t)c, (uint8_t)n);
    return;
  }

  /* --- runtime motion limits. These are WRITES to the board, and on a
         real Maestro they override its stored values until it is power
         cycled. They never touch the settings file. --- */
  if(eq(cmd,"speed") || eq(cmd,"v")){
    long c = argN(-1), v = argN(-1);
    if(!okCh(c) || v < 0) return;
    hwSpeed((uint8_t)c, (uint16_t)v);
    say((uint8_t)c, F("speed"), v);
    if(v == 0)
      CONSOLE.println(F("  ! 0 means UNLIMITED - full-torque lunge at every"
                        " step. That is this project's most expensive"
                        " default; 120 / 100 is a sane bench start."));
    return;
  }
  if(eq(cmd,"accel") || eq(cmd,"a")){
    long c = argN(-1), v = argN(-1);
    if(!okCh(c) || v < 0) return;
    hwAccel((uint8_t)c, (uint8_t)v);
    say((uint8_t)c, F("accel"), v);
    if(v == 0) CONSOLE.println(F("  ! 0 means UNLIMITED."));
    return;
  }

  if(eq(cmd,"mon")){
    long ms = argN(200);
    monEvery = (ms <= 0) ? 0 : (uint32_t)ms;
    monNext  = millis();
    CONSOLE.print(F("  monitor "));
    if(monEvery){
      CONSOLE.print(F("ch"));       CONSOLE.print(sel);
      CONSOLE.print(F(" every "));  CONSOLE.print(monEvery);
      CONSOLE.println(F(" ms - `mon 0` stops it"));
    } else CONSOLE.println(F("off"));
    return;
  }

#if BENCH_TARGET == BT_MAESTRO
  if(eq(cmd,"err")){      showErrors();   return; }
  if(eq(cmd,"loopback")){ loopbackTest(); return; }
  if(eq(cmd,"raw")){
    char* rest = strtok(NULL, "");
    if(rest) rawSend(rest);
    else CONSOLE.println(F("  raw 84 00 70 2e   (hex, space separated)"));
    return;
  }
#endif
#if BENCH_TARGET == BT_PCA
  if(eq(cmd,"scan")){ busScan(); return; }
#endif

  CONSOLE.print(F("  ? "));  CONSOLE.print(cmd);
  CONSOLE.println(F("  - press ? for the list"));
}


/* ============================ 9. THE LOOP ========================== */

static void pumpConsole(){
  while(CONSOLE.available()){
    int c = CONSOLE.read();
    if(c < 0) return;
    if(c == '\r' || c == '\n'){
      if(lineLen){ line[lineLen] = 0; lineLen = 0;
                   if(CONSOLE_ECHO) CONSOLE.println();
                   runLine(line); }
      continue;
    }
    if(c == 8 || c == 127){ if(lineLen) lineLen--; continue; }
    /* A hotkey only fires when nothing is half-typed, which is why every
       one of them is a digit or punctuation and never a letter: `home`
       must not become h + o + m + e. */
    if(lineLen == 0 && isHotkey((char)c)){
      if(CONSOLE_ECHO){ CONSOLE.write((char)c); CONSOLE.println(); }
      runHotkey((char)c);
      continue;
    }
    if(lineLen < sizeof(line) - 1){
      line[lineLen++] = (char)c;
      if(CONSOLE_ECHO) CONSOLE.write((char)c);
    }
  }
}

void setup(){
  CONSOLE.begin(CONSOLE_BAUD);
  delay(200);
  hwBegin();
  CONSOLE.println();
  CONSOLE.println(F("=== R2 BENCH CONSOLE ==="));
#if BENCH_TARGET == BT_MAESTRO
  CONSOLE.print(F("back end: real Pololu Maestro at "));
  CONSOLE.print(MAESTRO_BAUD); CONSOLE.println(F(" baud"));
  #ifdef MAESTRO_SOFT
    CONSOLE.println(F("port: SoftwareSerial, TX on pin 11 (no spare UART"
                      " on this board)"));
  #else
    CONSOLE.println(F("port: a hardware UART - Mega/ADK Serial1 = TX pin 18,"
                      " Leonardo Serial1 = TX pin 1"));
  #endif
  CONSOLE.println(F("the board must be in UART fixed-baud mode, CRC off,"
                    " Apply Settings clicked"));
#elif BENCH_TARGET == BT_PCA
  CONSOLE.println(F("back end: MaestroPCA on PCA9685"));
  busScan();
  if(pcaBound == 0)
    CONSOLE.println(F("!! no board bound - nothing will move. Check SDA/SCL,"
                      " VCC and the ground."));
#else
  CONSOLE.println(F("back end: MaestroPCA on ESP32 pins (LEDC)"));
  CONSOLE.print(F("channels: ")); CONSOLE.print(ledcOut.channels());
  CONSOLE.print(F("  resolution: ")); CONSOLE.print(ledcOut.bits());
  CONSOLE.println(F(" bits"));
  if(ledcOut.overflowed())
    CONSOLE.println(F("!! the table asks for more channels than the silicon"
                      " has - everything above 15 is driving nothing."));
#endif
  CONSOLE.print(F("channels 0..")); CONSOLE.println(chanCount() - 1);
  CONSOLE.println(F("press ? for the command list"));
  CONSOLE.println();
  rateAt = millis();
}

void loop(){
  hwUpdate();            /* MaestroPCA's rule: every pass, and never delay() */
  pumpConsole();
  serviceFlap();

  uint32_t now = millis();
  if(monEvery && (int32_t)(now - monNext) >= 0){
    monNext = now + monEvery;
    showPosition(sel);
  }
  loops++;
  if((uint32_t)(now - rateAt) >= 1000){ loopRate = loops; loops = 0; rateAt = now; }
}
