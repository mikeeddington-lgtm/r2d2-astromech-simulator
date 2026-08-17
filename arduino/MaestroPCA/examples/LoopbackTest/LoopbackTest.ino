/* LoopbackTest — prove the whole Maestro-replacement chain on ONE board.

   You do not need a second microcontroller to test this. A Mega has four
   UARTs, so it can play BOTH parts: the droid's host talking out of
   Serial3, and the co-processor listening on Serial1. One jumper wire
   closes the loop — the same trick that proved your Mega's TX during the
   Maestro fault-finding.

        jumper:   pin 14 (TX3)  ────────►  pin 19 (RX1)

   What that proves, on real hardware:
     Pololu's own library emits the bytes  ->  a real UART carries them
     ->  MaestroLink parses them  ->  MaestroPCA runs the animation
     ->  the PCA9685 moves your actual servo.
   Everything the £4 Nano would do, minus only the second CPU.

   NO JUMPER? NO PROBLEM. On boot this sketch tests for the wire itself.
   Without it, it falls back to routing the host's bytes straight into the
   parser in software — so it still exercises the protocol, the engine,
   the PCA9685 and the servo. It just doesn't cross a real UART. That
   fallback also makes this run on a one-UART board like an Uno.

   ------------------------------------------------------------- needs
   Libraries: Adafruit PWM Servo Driver, and "PololuMaestro" (Library
   Manager) — we deliberately use Pololu's REAL library as the sender, so
   the bytes on the wire are exactly what your droid emits.

   Wiring: PCA9685 on I2C (Mega 20/21), servo on channel 0, V+ from its
   own 5-6 V supply, grounds common.

   ---------------------------------------------------------- console
   Serial Monitor @ 115200:
     0-9  the HOST calls restartScript(n) — the real thing, over the wire
     h    host goHome()        s  host stopScript()
     m    host setTarget(0, mid-travel)
     ?    status          p  positions        x  everything off
                                                                       */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <PololuMaestro.h>
#include <MaestroPCA.h>
#include <MaestroLink.h>
#include "sequences.h"

/* ------------------------------------------------------------ config */
#if defined(HAVE_HWSERIAL3) || defined(ARDUINO_AVR_MEGA2560) || defined(ARDUINO_AVR_ADK)
  #define HOST_PORT  Serial3          /* what the droid's sketch uses     */
  #define LINK_PORT  Serial1          /* the co-processor's ear           */
  #define HAS_TWO_UARTS 1
#else
  #define HAS_TWO_UARTS 0             /* Uno etc — software loopback only */
#endif
#define LINK_BAUD  9600

Adafruit_PWMServoDriver pcaA(0x40);
Adafruit_PWMServoDriver pcaB(0x41);
Adafruit_PWMServoDriver* const BOARDS[] = { &pcaA, &pcaB };

#ifndef PCA_BOARDS
#define PCA_BOARDS  ((MPCA_CHANNELS + 15) / 16)   /* 1 board per 16 channels */
#endif
MaestroPCA  engine(BOARDS, PCA_BOARDS, MPCA_CHANNEL_TABLE, MPCA_CHANNELS,
                   MPCA_SEQ_TABLE, MPCA_SEQUENCES);
MaestroLink parser(engine);

bool wireMode = false;

/* The host's serial port. In wire mode it really is a UART; otherwise the
   bytes go straight into the parser, which is the same path minus the
   physical wire. Either way the HOST above it is Pololu's own library and
   has no idea which is happening. */
class HostPort : public Stream {
public:
  size_t write(uint8_t b) override {
#if HAS_TWO_UARTS
    if(wireMode) return HOST_PORT.write(b);
#endif
    uint8_t out[2];
    uint8_t n = parser.feed(b, out);
    for(uint8_t i = 0; i < n && _n < sizeof(_rx); i++) _rx[_n++] = out[i];
    return 1;
  }
  int available() override { return _n - _r; }
  int read() override { return (_r < _n) ? _rx[_r++] : -1; }
  int peek() override { return (_r < _n) ? _rx[_r] : -1; }
  void flush() override {}
private:
  uint8_t _rx[4]; uint8_t _n = 0, _r = 0;
};
HostPort hostPort;

/* EXACTLY what a Padawan sketch declares */
MiniMaestro host(hostPort);

bool probe(uint8_t a){ Wire.beginTransmission(a); return Wire.endTransmission() == 0; }

void status(){
  Serial.println(F("--- loopback test ---"));
  /* scan the bus, not just what this config expects */
  for(uint8_t a = 0x40; a <= 0x4F; a++){
    bool here = probe(a);
    bool used = (uint8_t)(a - 0x40) < PCA_BOARDS;
    if(!here && !used) continue;
    Serial.print(F("  PCA9685 0x")); Serial.print(a, HEX);
    if(here && used)      Serial.println(F("   FOUND, in use"));
    else if(here)         Serial.println(F("   found, not used by this config"));
    else                  Serial.println(F("   MISSING — the config needs it"));
  }
  Serial.print(F("  mode: "));
  if(wireMode) Serial.println(F("REAL UART  (jumper pin 14 -> pin 19 detected)"));
  else{
#if HAS_TWO_UARTS
    Serial.println(F("software loopback — add a jumper from pin 14 to pin 19"));
    Serial.println(F("        to send the bytes over a real UART instead"));
#else
    Serial.println(F("software loopback (this board has one UART)"));
#endif
  }
  Serial.print(F("  commands parsed: ")); Serial.print(parser.commandCount());
  Serial.print(F("   bad: ")); Serial.println(parser.badCount());
  Serial.print(F("  channels ")); Serial.print(MPCA_CHANNELS);
  Serial.print(F("   slots ")); Serial.println(MPCA_SEQUENCES);
  Serial.print(F("  script: "));
  if(engine.scriptRunning()){ Serial.print(F("running slot ")); Serial.println(engine.currentScript()); }
  else Serial.println(F("idle"));
  Serial.println(F("  keys: 0-9 restartScript  h home  s stop  m mid  p pos  x off  ? this"));
}

void positions(){
  for(uint8_t i = 0; i < MPCA_CHANNELS; i++){
    uint16_t q = engine.getPosition(i);
    Serial.print(F("  ch")); Serial.print(i); Serial.print(F("  "));
    if(q){ Serial.print(q); Serial.print(F(" qus = ")); Serial.print(q / 4); Serial.println(F(" us")); }
    else Serial.println(F("off"));
  }
}

void setup(){
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);
  delay(50);
  engine.begin();

#if HAS_TWO_UARTS
  HOST_PORT.begin(LINK_BAUD);
  LINK_PORT.begin(LINK_BAUD);
  /* Is the jumper there? Send a byte the parser ignores anyway (data
     bytes are 7-bit and mean nothing outside a command) and see if it
     comes back round. */
  while(LINK_PORT.available()) LINK_PORT.read();
  HOST_PORT.write((uint8_t)0x00);
  HOST_PORT.flush();
  delay(20);
  if(LINK_PORT.available()){
    wireMode = true;
    while(LINK_PORT.available()) LINK_PORT.read();
  }
#endif

  Serial.println(F("MAESTRO-LOOPBACK 1"));
  status();
}

void loop(){
#if HAS_TWO_UARTS
  /* the co-processor half: bytes off the wire, into the parser */
  while(wireMode && LINK_PORT.available()){
    uint8_t out[2];
    uint8_t n = parser.feed(LINK_PORT.read(), out);
    if(n) LINK_PORT.write(out, n);       /* replies need a return jumper 18 -> 15 */
  }
#endif

  engine.update();                       /* THE rule: every pass, never delay() */

  while(Serial.available()){
    char c = Serial.read();
    if(c >= '0' && c <= '9'){
      uint8_t n = c - '0';
      if(n >= MPCA_SEQUENCES){ Serial.println(F("no such slot")); continue; }
      uint32_t before = parser.commandCount();
      host.restartScript(n);             /* <-- Pololu's real library, real bytes */
      Serial.print(F("host: restartScript(")); Serial.print(n); Serial.println(F(")"));
      if(!wireMode && parser.commandCount() == before)
        Serial.println(F("  !! parser saw nothing — that would be a bug"));
    }
    else if(c == 'h'){ host.goHome();     Serial.println(F("host: goHome()")); }
    else if(c == 's'){ host.stopScript(); Serial.println(F("host: stopScript()")); }
    else if(c == 'm'){ host.setTarget(0, 6000); Serial.println(F("host: setTarget(0, 6000)")); }
    else if(c == 'p') positions();
    else if(c == '?') status();
    else if(c == 'x'){
      host.stopScript();
      for(uint8_t i = 0; i < MPCA_CHANNELS; i++) host.setTarget(i, 0);
      Serial.println(F("all off"));
    }
  }

  /* in wire mode the bytes take a moment to arrive, so report slightly late */
  static uint32_t seen = 0;
  if(parser.commandCount() != seen){
    seen = parser.commandCount();
    Serial.print(F("  -> co-processor received 0x"));
    Serial.print(parser.lastCommand(), HEX);
    if(parser.lastCommand() == 0xA7){
      Serial.print(F("  restartScript(")); Serial.print(parser.lastArg()); Serial.print(F(")"));
    }
    Serial.println();
  }
}
