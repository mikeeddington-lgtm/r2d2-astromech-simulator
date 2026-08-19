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
     y   same sweep on channel 16 (second board, 0x41)
     x   stop the sweep and switch every output off

   --- binary protocol from PCA Studio, 115200 baud, 3-byte frames ---
     byte0  0x80 | channel (0..63)       — high bit marks a frame start,
     byte1  payload >> 7   (7 bits)        so a lost byte self-resyncs
     byte2  payload & 0x7F (7 bits)
   channel 0..31  payload = PCA9685 ticks 0..4096; 8191 = pulses OFF
                  board = channel/16 (0x40, 0x41), pin = channel%16
   channel 62     payload = oscillator Hz / 10000 (e.g. 2500 = 25 MHz)
   channel 63     payload = servo frequency in Hz (normally 50)
   Typed commands are all < 0x80, so they can never collide with a frame.

   Wiring: PCA9685 V+ from a real 5-6 V servo supply, never the Arduino.
   Common ground between Arduino, PCA9685 and the servo supply. */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <MpcaScan.h>            /* the bus scan — MaestroPCA library      */

/* v1.53.0 — the addresses are FOUND, not assumed. A PCA9685 has six
   address jumpers and which of them you bridge is a soldering decision
   made inside a dome; this sketch used to insist on 0x40 and 0x41 and
   report anything else as "not present" while the board sat there
   answering. MpcaScan.h has the whole argument, including why the All
   Call address has to be excluded from the sweep. */
uint8_t ADDR[2] = { 0x40, 0x41 };      /* overwritten by the scan */
Adafruit_PWMServoDriver pca[2] = {
  Adafruit_PWMServoDriver(0x40),
  Adafruit_PWMServoDriver(0x41)
};
Adafruit_PWMServoDriver* const BOARDS[2] = { &pca[0], &pca[1] };
bool present[2] = { false, false };
uint8_t nFound = 0;                    /* everything on the bus, not just ours */

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
  for(uint8_t b=0; b<2; b++){
    if(!present[b]) continue;
    pca[b].setOscillatorFrequency(oscHz);
    pca[b].setPWMFreq(servoHz);
  }
}

void allOff(){
  for(uint8_t b=0; b<2; b++){
    if(!present[b]) continue;
    for(uint8_t p=0; p<16; p++) pca[b].setPWM(p, 0, 4096);
  }
}

void status(){
  Serial.println(F("--- PCA bridge ---"));
  for(uint8_t b=0; b<2; b++){
    Serial.print(F("  0x")); Serial.print(ADDR[b], HEX);
    Serial.print(F("  channels ")); Serial.print(b*16);
    Serial.print(F("-")); Serial.print(b*16+15);
    Serial.println(present[b] ? F("   FOUND") : F("   not present"));
  }
  if(nFound > 2){
    Serial.print(F("  ")); Serial.print(nFound - 2);
    Serial.println(F(" more board(s) on the bus than this sketch drives (32 channels max)"));
  }
  Serial.print(F("  oscillator ")); Serial.print(oscHz);
  Serial.print(F(" Hz   servo ")); Serial.print((int)servoHz); Serial.println(F(" Hz"));
  if(!present[0] && !present[1]){
    Serial.println(F("  NOTHING ON THE BUS. Check: SDA/SCL not swapped"));
    Serial.println(F("  (Mega 20/21, Uno A4/A5), VCC to 5V, GND shared."));
    Serial.println(F("  Note VCC powers the CHIP; servo V+ is separate."));
  }
  Serial.println(F("  keys:  ? status   t sweep ch0   y sweep ch16   x off"));
}

void startSweep(uint8_t ch){
  uint8_t b = ch >> 4;
  if(!present[b]){
    Serial.print(F("no board for channel ")); Serial.println(ch);
    return;
  }
  sweepCh = ch; sweepPos = SWEEP_LO; sweepDir = 1;
  sweepOn = true; sweepAt = millis();
  Serial.print(F("sweeping channel ")); Serial.print(ch);
  Serial.println(F(" between 1250 and 1750 us — press x to stop"));
  Serial.println(F("if nothing moves: servo V+ supply, or the servo is on another pin"));
}

void setup(){
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);
  delay(50);

  /* SCAN, then bind, then begin — in that order. mpcaBind() re-addresses
     the driver objects and Adafruit allocates its I2C device inside
     begin(), so binding afterwards would strand the allocation. */
  uint8_t found[2];
  nFound = mpcaScan(found, 2);
  uint8_t n = mpcaBind(BOARDS, 2, found, nFound);
  for(uint8_t b=0; b<2; b++){
    present[b] = (b < n);
    if(present[b]){ ADDR[b] = found[b]; pca[b].begin(); }
  }
  applyClock();
  allOff();          /* everything off until told otherwise — no surprise lunges */

  Serial.println(F("PCA-BRIDGE 1"));
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
      ch = b & 0x3F; payload = 0; st = 1;
      continue;
    }
    if(st == 1){ payload = (uint16_t)b << 7; st = 2; continue; }
    if(st == 2){
      payload |= b; st = 0;
      if(ch == 62){ oscHz = (uint32_t)payload * 10000UL; applyClock(); }
      else if(ch == 63){ servoHz = payload; applyClock(); }
      else if(ch < 32){
        uint8_t board = ch >> 4, pin = ch & 15;
        if(!present[board]) continue;
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
