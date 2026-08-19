/* PCA_Bridge — the hardware end of PCA Studio's live mode, and a
   standalone bench tester in its own right.

   Flash this, open the Arduino Serial Monitor at 115200, and it tells you
   what it found on the I2C bus and lets you sweep a servo with one
   keystroke — no browser needed. Once that works, close the monitor,
   open PCA Studio in Chrome and click "Connect hardware": every slider
   move and sequence frame then drives the real servos. The BROWSER runs
   the sequencer engine; this sketch is a dumb, fast pipe (deliberately —
   iterate in the app, then flash MaestroPCA + the exported sequences.h
   for the standalone droid).

   ONLY ONE PROGRAM CAN HOLD THE PORT. Close the Serial Monitor before
   connecting from Chrome, or the browser will not see the board.

   --- typed commands (Serial Monitor, no line ending needed) ---
     ?   status: which PCA9685s answered, oscillator, servo frequency
     t   sweep channel 0 gently (1250–1750 µs) — proves wiring + power
     y   same sweep on channel 16 (the second board found)
     x   stop the sweep and switch every output off

   --- binary protocol from PCA Studio, 115200 baud, 3-byte frames ---
     byte0  0x80 | channel (0..127)      — high bit marks a frame start,
     byte1  payload >> 7   (7 bits)        so a lost byte self-resyncs
     byte2  payload & 0x7F (7 bits)
   channel 0..125 payload = PCA9685 ticks 0..4096; 8191 = pulses OFF
                  board = channel/16 (0..7), pin = channel%16
   channel 126    payload = oscillator Hz / 10000 (e.g. 2500 = 25 MHz)
   channel 127    payload = servo frequency in Hz (normally 50)
   Typed commands are all < 0x80, so they can never collide with a frame.

   PROTOCOL 2, AND WHY THE NUMBERS MOVED. Version 1 read the channel as
   `b & 0x3F` — six bits — and put its two config channels at 62 and 63,
   which capped the whole thing at 32 servo channels: two boards. That is
   fine for a dome and nothing else. A droid with a dome, a second dome
   board and a body wants four, and there is no reason to stop there: the
   header byte's high bit is the frame marker and the other SEVEN bits
   were never all being used. Reading `b & 0x7F` costs nothing and gives
   0..127 — eight boards.

   The config channels move to the top of the new range, 126 and 127, and
   the honest cost is that board 7's last two pins (channels 126 and 127)
   cannot be driven live from the browser. They still work perfectly on
   the standalone droid sketch, which does not use this wire format. If
   you have eight boards and need those two pins live, put the servos
   that matter on lower channels — every other channel is unaffected.

   The banner says PCA-BRIDGE 2 and the app reads that number: a browser
   that meets an older PCA-BRIDGE 1 falls back to six-bit frames and
   refuses to send it a channel it cannot decode, rather than sending
   channel 70 and watching channel 6 move. Flashing this sketch is what
   unlocks the wide range; nothing else needs changing.

   Wiring: PCA9685 V+ from a real 5-6 V servo supply, never the Arduino.
   Common ground between Arduino, PCA9685 and the servo supply. */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

/* ================================================== THE BUS SCAN, INLINE
   v1.53.1. The addresses are FOUND, not assumed: a PCA9685 has six address
   jumpers and which of them you bridge is a soldering decision made inside
   a dome. This sketch used to insist on 0x40 and 0x41 and report anything
   else as "not present" while the board sat there on the bus answering.

   WHY THIS IS A COPY OF `arduino/MaestroPCA/src/MpcaScan.h` AND NOT AN
   INCLUDE OF IT. PCA_Bridge is the one sketch here that is not a library
   example — it lives in `pca-studio/` because it is a TOOL, the thing you
   flash to let the app drive your servos, and it has always compiled with
   nothing installed but Wire and Adafruit_PWMServoDriver. Making it depend
   on the MaestroPCA library to do a bus scan would mean the first sketch a
   builder flashes now needs a library it does not otherwise use, and the
   failure mode is a compile error on a file they did not write.

   A copy is a liability, so it is not left as a promise:
   `arduino/MaestroPCA/test/bridge_test.cpp` compiles THIS FILE and asserts,
   over the same set of buses, that the copy still agrees with the original
   answer for answer. Change one and the test tells you about the other.

   THE ALL CALL is the part that is not obvious. A PCA9685 answers address
   0x70 out of the box — MODE1 powers up with ALLCALL set and Adafruit's
   begin() sets it again — so one chip ACKs at BOTH its own address and
   0x70. A sweep that does not know that turns one board into two, the
   phantom being every board at once: a write meant for "board 1" would
   move every servo on the droid. 0x71-0x73 are the sub-call addresses,
   off by default and excluded for the same reason.
   ===================================================================== */
bool bridgeAddrReserved(uint8_t a){
  return a == 0x70 || (a >= 0x71 && a <= 0x73);
}
/* Returns the TOTAL found (which may exceed `max`), filling `out` with the
   first `max` in ascending address order — so board 0 is the lowest
   address on the bus, whatever its jumpers say. */
uint8_t bridgeScan(uint8_t* out, uint8_t max){
  uint8_t n = 0;
  for(uint8_t a = 0x40; a <= 0x7F; a++){
    if(bridgeAddrReserved(a)) continue;
    Wire.beginTransmission(a);
    if(Wire.endTransmission() != 0) continue;
    if(n < max) out[n] = a;
    n++;
  }
  return n;
}

/* Eight boards, 128 channels. Two of those channels (126, 127) are spent
   on configuration, so 0..125 drive servos — see the note at the top. */
const uint8_t BRIDGE_BOARDS = 8;
const uint8_t BRIDGE_CH_CFG_OSC   = 126;
const uint8_t BRIDGE_CH_CFG_SERVO = 127;

uint8_t ADDR[BRIDGE_BOARDS];           /* filled by the scan */
Adafruit_PWMServoDriver pca[BRIDGE_BOARDS];
bool present[BRIDGE_BOARDS];
uint8_t nBound = 0;                    /* boards this sketch drives */
uint8_t nFound = 0;                    /* everything on the bus, ours or not */

uint32_t oscHz   = 25000000UL;
float    servoHz = 50.0f;

/* ticks = µs × 4096 / 20000 at 50 Hz */
const uint16_t SWEEP_LO = 256;   /* 1250 µs — deliberately short of the */
const uint16_t SWEEP_HI = 358;   /* 1750 µs   ends, so a linkage cannot bind */

bool     sweepOn  = false;
uint8_t  sweepCh  = 0;
uint32_t sweepAt  = 0;
int16_t  sweepPos = SWEEP_LO;
int8_t   sweepDir = 1;

void applyClock(){
  for(uint8_t b=0; b<BRIDGE_BOARDS; b++){
    if(!present[b]) continue;
    pca[b].setOscillatorFrequency(oscHz);
    pca[b].setPWMFreq(servoHz);
  }
}

void allOff(){
  for(uint8_t b=0; b<BRIDGE_BOARDS; b++){
    if(!present[b]) continue;
    for(uint8_t p=0; p<16; p++) pca[b].setPWM(p, 0, 4096);
  }
}

void status(){
  Serial.println(F("--- PCA bridge ---"));
  for(uint8_t b=0; b<nBound; b++){
    Serial.print(F("  0x")); Serial.print(ADDR[b], HEX);
    Serial.print(F("  channels ")); Serial.print(b*16);
    Serial.print(F("-")); Serial.print(b*16+15);
    Serial.println(F("   FOUND"));
  }
  if(nFound > BRIDGE_BOARDS){
    Serial.print(F("  ")); Serial.print(nFound - BRIDGE_BOARDS);
    Serial.println(F(" more board(s) on the bus than this sketch drives (8 boards, 128 channels max)"));
  }
  Serial.print(F("  oscillator ")); Serial.print(oscHz);
  Serial.print(F(" Hz   servo ")); Serial.print((int)servoHz); Serial.println(F(" Hz"));
  if(nBound == 0){
    Serial.println(F("  NOTHING ON THE BUS. Check: SDA/SCL not swapped"));
    Serial.println(F("  (Mega 20/21, Uno A4/A5), VCC to 5V, GND shared."));
    Serial.println(F("  Note VCC powers the CHIP; servo V+ is separate."));
  }
  Serial.println(F("  keys:  ? status   t sweep ch0   y sweep ch16   x off"));
}

void startSweep(uint8_t c){
  uint8_t b = c >> 4;
  if(b >= BRIDGE_BOARDS || !present[b]){
    Serial.print(F("no board for channel ")); Serial.println(c);
    return;
  }
  sweepCh = c; sweepPos = SWEEP_LO; sweepDir = 1;
  sweepOn = true; sweepAt = millis();
  Serial.print(F("sweeping channel ")); Serial.print(c);
  Serial.println(F(" between 1250 and 1750 us — press x to stop"));
  Serial.println(F("if nothing moves: servo V+ supply, or the servo is on another pin"));
}

void setup(){
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);
  delay(50);

  /* SCAN, then re-address, then begin — in that order. A driver is
     re-addressed by assigning a fresh one over it, and Adafruit allocates
     its I2C device inside begin(): doing this afterwards would strand that
     allocation and leave the object talking to its old address through
     it. */
  uint8_t found[BRIDGE_BOARDS];
  nFound = bridgeScan(found, BRIDGE_BOARDS);
  nBound = nFound > BRIDGE_BOARDS ? BRIDGE_BOARDS : nFound;
  for(uint8_t b=0; b<BRIDGE_BOARDS; b++){
    present[b] = (b < nBound);
    if(!present[b]) continue;
    ADDR[b] = found[b];
    pca[b] = Adafruit_PWMServoDriver(found[b]);
    pca[b].begin();
  }
  applyClock();
  allOff();          /* everything off until told otherwise — no surprise lunges */

  Serial.println(F("PCA-BRIDGE 2"));
  status();
}

uint8_t  st = 0;        /* 0 = idle, 1..2 = payload bytes of a binary frame */
uint8_t  ch = 0;
uint16_t payload = 0;

void loop(){
  while(Serial.available()){
    uint8_t b = Serial.read();

    if(b & 0x80){                       /* --- binary frame header --- */
      if(sweepOn){ sweepOn = false; }   /* the app is driving now */
      ch = b & 0x7F; payload = 0; st = 1;
      continue;
    }
    if(st == 1){ payload = (uint16_t)b << 7; st = 2; continue; }
    if(st == 2){
      payload |= b; st = 0;
      if(ch == BRIDGE_CH_CFG_OSC){ oscHz = (uint32_t)payload * 10000UL; applyClock(); }
      else if(ch == BRIDGE_CH_CFG_SERVO){ servoHz = payload; applyClock(); }
      else {
        uint8_t board = ch >> 4, pin = ch & 15;
        if(board >= BRIDGE_BOARDS || !present[board]) continue;
        if(payload == 8191) pca[board].setPWM(pin, 0, 4096);   /* full off */
        else                pca[board].setPWM(pin, 0, payload > 4096 ? 4096 : payload);
      }
      continue;
    }

    /* --- idle: a typed command (always < 0x80, never a frame byte) --- */
    if(b=='?')                 status();
    else if(b=='t')            startSweep(0);
    else if(b=='y')            startSweep(16);
    else if(b=='x'){ sweepOn=false; allOff(); Serial.println(F("all outputs off")); }
  }

  if(sweepOn && millis() - sweepAt >= 20){
    sweepAt = millis();
    sweepPos += sweepDir * 2;
    if(sweepPos >= SWEEP_HI){ sweepPos = SWEEP_HI; sweepDir = -1; }
    if(sweepPos <= SWEEP_LO){ sweepPos = SWEEP_LO; sweepDir =  1; }
    pca[sweepCh >> 4].setPWM(sweepCh & 15, 0, sweepPos);
  }
}
