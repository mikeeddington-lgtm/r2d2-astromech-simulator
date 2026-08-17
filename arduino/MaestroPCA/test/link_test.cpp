/* Golden test: does MaestroLink understand the EXACT bytes a Padawan
   sketch emits?
   =====================================================================
   The oracle is Pololu's own maestro-arduino library, compiled here
   unmodified. A real MiniMaestro object is pointed at a loopback stream
   wired straight into MaestroLink, so calling host.restartScript(1) is
   the full round trip: the library's own bytes go out, our parser reads
   them, the engine acts, and replies come back through the library's own
   read path (its getters block on available(), so they exercise that too).

   If these pass, a host running PololuMaestro is understood byte for
   byte, with no changes to the host sketch.

   Build/run:  arduino/MaestroPCA/test/run.sh
   ===================================================================== */
#include "Arduino.h"
#include "Adafruit_PWMServoDriver.h"
#include "../src/MaestroPCA.h"
#include "../src/MaestroLink.h"
#include "PololuMaestro.h"
#include <cstdio>
#include <vector>

unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096];
int      __pwmCount = 0;

/* rotating buffers so several calls in one expression don't clash */
static const char* numf(const char* fmt, long v){
  static char b[8][40]; static int i = 0;
  i = (i + 1) & 7; snprintf(b[i], sizeof(b[i]), fmt, v); return b[i];
}

static int pass = 0, fail = 0;
static void ok(const char* name, bool cond, const char* extra = ""){
  if(cond) pass++; else fail++;
  printf("  %s  %s%s%s\n", cond ? "PASS" : "FAIL", name, *extra ? "   " : "", extra);
}

/* The wire. Whatever the host writes is fed straight to the parser, and
   any reply is queued where the host's own read() will find it. */
class Wire2Way : public Stream {
public:
  MaestroLink* parser = nullptr;
  std::vector<uint8_t> sent, rx;
  size_t write(uint8_t b) override {
    sent.push_back(b);
    if(parser){
      uint8_t out[2];
      uint8_t n = parser->feed(b, out);
      for(uint8_t i = 0; i < n; i++) rx.push_back(out[i]);
    }
    return 1;
  }
  int available() override { return (int)rx.size(); }
  int read() override {
    if(rx.empty()) return -1;
    uint8_t b = rx.front(); rx.erase(rx.begin()); return b;
  }
  void clear(){ sent.clear(); rx.clear(); }
};

/* ---- device under test: 4 channels, 2 slots ---- */
#define NCH 4
const MpcaChannelDef TABLE[NCH] PROGMEM = {
  /* board pin   min   max  home  spd acc */
  {  0, 0, 4544, 7296,    0,  80, 10 },   /* homemode Off  */
  {  0, 1, 4000, 8000, 6000,   0,  0 },   /* Goto, instant */
  {  0, 2, 4000, 8000,    0,   0,  0 },
  {  0, 3, 4000, 8000,    0,   0,  0 }
};
static const uint16_t SEQ0[] PROGMEM = {
  300, 7296, 8000, 0, 0,
  300, 4544, 4000, 0, 0
};
static const uint16_t SEQ1[] PROGMEM = { 200, 4544, 6000, 0, 0 };
const MpcaSeqDef SEQS[2] PROGMEM = { { SEQ0, 2 }, { SEQ1, 1 } };

Adafruit_PWMServoDriver pca(0x40);
Adafruit_PWMServoDriver* const BOARDS[] = { &pca };

/* run the engine forward in 10 ms ticks */
static void advance(MaestroPCA& m, int ms){
  for(int i = 0; i < ms; i += 10){ __fakeMillis += 10; m.update(); }
}

/* raw byte injection, for the robustness cases */
static void pump(MaestroLink& link, const std::vector<uint8_t>& in){
  for(size_t i = 0; i < in.size(); i++){ uint8_t out[2]; link.feed(in[i], out); }
}

int main(){
  Wire2Way wire;
  /* EXACTLY what a Padawan sketch declares: MiniMaestro on a serial port,
     default device number => compact protocol, CRC off */
  MiniMaestro host(wire);

  MaestroPCA  engine(BOARDS, 1, TABLE, NCH, SEQS, 2);
  MaestroLink link(engine);
  wire.parser = &link;
  engine.begin();

  printf("\n==== the bytes PololuMaestro actually emits ====\n");
  wire.clear();
  host.restartScript(1);
  /* compact protocol, CRC off: command byte + one 7-bit arg. No address. */
  ok("restartScript(1) is 2 bytes, compact protocol (no address byte)", wire.sent.size() == 2,
     numf("size %ld", (long)wire.sent.size()));
  ok("restartScript uses command 0xA7", wire.sent.size() && wire.sent[0] == 0xA7);
  ok("parser recognised exactly one command", link.commandCount() == 1);

  printf("\n==== restartScript -> the right sequence plays ====\n");
  ok("engine is running slot 1", engine.scriptRunning() && engine.currentScript() == 1);
  advance(engine, 40);
  ok("slot 1's frame applied ch1 -> 6000", engine.getPosition(1) == 6000,
     numf("pos %ld", (long)engine.getPosition(1)));
  advance(engine, 400);
  ok("sequence ends and the script stops", !engine.scriptRunning());

  printf("\n==== restartScript(n) picks slot n, and replaces a running one ====\n");
  host.restartScript(0);
  ok("slot 0 now running", engine.scriptRunning() && engine.currentScript() == 0);
  advance(engine, 20);
  host.restartScript(1);
  ok("a second restart replaces it (one script at a time)",
     engine.scriptRunning() && engine.currentScript() == 1);
  host.stopScript();
  ok("stopScript() halts it", !engine.scriptRunning());

  printf("\n==== setTarget: quarter-microseconds survive the wire ====\n");
  wire.clear();
  host.setTarget(0, 7296);
  ok("setTarget is 4 bytes starting 0x84", wire.sent.size() == 4 && wire.sent[0] == 0x84);
  advance(engine, 2000);
  ok("channel 0 reached 7296", engine.getPosition(0) == 7296,
     numf("pos %ld", (long)engine.getPosition(0)));

  /* the documented snap: a channel with no pulses has no known position,
     so its first target is taken instantly — same as a real Maestro */
  host.setTarget(0, 0);
  ok("target 0 switches the pulses off", engine.getPosition(0) == 0);
  host.setTarget(0, 6000);
  ok("the first target after off snaps, with no ramp", engine.getPosition(0) == 6000,
     numf("pos %ld", (long)engine.getPosition(0)));

  host.setTarget(0, 4544);
  advance(engine, 1000);
  ok("and travels back to 4544 under speed/accel", engine.getPosition(0) == 4544,
     numf("pos %ld", (long)engine.getPosition(0)));

  host.setTarget(0, 9999);                    /* beyond the calibrated max */
  advance(engine, 1000);
  ok("an out-of-range target clamps to the calibrated max", engine.getPosition(0) == 7296,
     numf("pos %ld", (long)engine.getPosition(0)));

  printf("\n==== speed and acceleration commands ====\n");
  wire.clear();
  host.setSpeed(2, 40);
  host.setAcceleration(2, 5);
  ok("setSpeed is 0x87, setAcceleration is 0x89",
     wire.sent.size() == 8 && wire.sent[0] == 0x87 && wire.sent[4] == 0x89);
  host.setTarget(2, 4000);
  host.setTarget(2, 8000);
  advance(engine, 200);
  ok("a channel given a speed now ramps instead of snapping",
     engine.getPosition(2) > 4000 && engine.getPosition(2) < 8000,
     numf("pos %ld", (long)engine.getPosition(2)));
  advance(engine, 4000);
  ok("and still lands exactly on target", engine.getPosition(2) == 8000,
     numf("pos %ld", (long)engine.getPosition(2)));

  printf("\n==== queries: the host's own read path gets valid answers ====\n");
  uint16_t p = host.getPosition(0);           /* blocks on available() — real round trip */
  ok("getPosition returns what the engine holds", p == engine.getPosition(0),
     numf("got %ld", (long)p));
  ok("getMovingState answers (0 once settled)", host.getMovingState() == 0);
  ok("getErrors answers 0 — nothing latches errors here", host.getErrors() == 0);
  ok("getScriptStatus: 1 = stopped", host.getScriptStatus() == 1);
  host.restartScript(0);
  ok("getScriptStatus: 0 = running", host.getScriptStatus() == 0);
  host.stopScript();

  printf("\n==== goHome and set-multiple-targets ====\n");
  host.goHome();
  ok("goHome: a homemode-Goto channel returns to its home pose", engine.getPosition(1) == 6000,
     numf("pos %ld", (long)engine.getPosition(1)));
  ok("goHome: a homemode-Off channel goes limp (reads 0)", engine.getPosition(0) == 0);

  uint16_t targets[3] = { 5000, 5500, 6500 };
  wire.clear();
  host.setMultiTarget(3, 1, targets);
  ok("setMultiTarget is 0x9F", wire.sent.size() && wire.sent[0] == 0x9F);
  advance(engine, 2000);
  ok("  ch1 = 5000", engine.getPosition(1) == 5000, numf("pos %ld", (long)engine.getPosition(1)));
  ok("  ch2 = 5500", engine.getPosition(2) == 5500, numf("pos %ld", (long)engine.getPosition(2)));
  ok("  ch3 = 6500", engine.getPosition(3) == 6500, numf("pos %ld", (long)engine.getPosition(3)));

  printf("\n==== Mini SSC (8-bit target across the channel's range) ====\n");
  host.setTargetMiniSSC(1, 0);
  advance(engine, 2000);
  ok("0 maps to the channel minimum", engine.getPosition(1) == 4000,
     numf("pos %ld", (long)engine.getPosition(1)));
  host.setTargetMiniSSC(1, 254);
  advance(engine, 2000);
  ok("254 maps to the channel maximum", engine.getPosition(1) == 8000,
     numf("pos %ld", (long)engine.getPosition(1)));

  printf("\n==== the Pololu protocol (device-numbered) also works ====\n");
  {
    Wire2Way w2;
    MaestroPCA  e2(BOARDS, 1, TABLE, NCH, SEQS, 2);
    MaestroLink l2(e2, 12);                   /* SerialDeviceNumber 12, like the dome board */
    w2.parser = &l2; e2.begin();
    MiniMaestro addressed(w2, Maestro::noResetPin, 12);
    addressed.restartScript(1);
    ok("addressed mode sends 0xAA, device, cmd & 0x7F",
       w2.sent.size() == 4 && w2.sent[0] == 0xAA && w2.sent[1] == 12 && w2.sent[2] == 0x27);
    ok("parser strips the header and runs slot 1", e2.scriptRunning() && e2.currentScript() == 1);

    Wire2Way w3;
    MaestroPCA  e3(BOARDS, 1, TABLE, NCH, SEQS, 2);
    MaestroLink l3(e3, 12);
    w3.parser = &l3; e3.begin();
    MiniMaestro other(w3, Maestro::noResetPin, 13);   /* a different board on the same wire */
    other.restartScript(0);
    ok("a command for another device number is ignored", !e3.scriptRunning());
  }

  printf("\n==== CRC mode ====\n");
  {
    Wire2Way w4;
    MaestroPCA  e4(BOARDS, 1, TABLE, NCH, SEQS, 2);
    MaestroLink l4(e4, 255, true);
    w4.parser = &l4; e4.begin();
    MiniMaestro crcHost(w4, Maestro::noResetPin, Maestro::deviceNumberDefault, true);

    /* UPSTREAM QUIRK, found by this test: PololuMaestro.h declares
       `uint8_t _CRCByte;` with no initialiser, and only zeroes it in
       writeCRC() AFTER a command goes out. So the FIRST CRC-enabled
       command a host ever sends carries a CRC seeded with whatever was in
       that byte — and a correct receiver must reject it. We do. Send one
       throwaway command to prime the accumulator, then test properly.
       (Harmless in practice: CRC is off by default on both the Maestro
       and every stock Padawan sketch, and a resend fixes it.) */
    crcHost.restartScript(1);      /* prime: outcome deliberately NOT asserted,
                                      it depends on uninitialised memory */
    e4.stopScript();               /* so priming cannot mask the real test */

    w4.clear();
    crcHost.restartScript(1);
    ok("CRC mode appends a third byte", w4.sent.size() == 3,
       numf("size %ld", (long)w4.sent.size()));
    ok("a good CRC is accepted", e4.scriptRunning() && e4.currentScript() == 1);

    std::vector<uint8_t> corrupt(w4.sent.begin(), w4.sent.end());
    corrupt[corrupt.size() - 1] ^= 0x7F;              /* wreck the CRC byte */
    MaestroPCA  e5(BOARDS, 1, TABLE, NCH, SEQS, 2);
    MaestroLink l5(e5, 255, true);
    e5.begin();
    pump(l5, corrupt);
    ok("a bad CRC is rejected, not acted on", !e5.scriptRunning() && l5.badCount() == 1);
  }

  printf("\n==== robustness on a noisy wire ====\n");
  {
    Wire2Way w6;
    MaestroPCA  e6(BOARDS, 1, TABLE, NCH, SEQS, 2);
    MaestroLink l6(e6);
    e6.begin();
    /* line noise, then a command cut off mid-flight */
    std::vector<uint8_t> noise = { 0x12, 0x7F, 0x00, 0x84, 0x01 };
    pump(l6, noise);
    w6.parser = &l6;
    MiniMaestro h(w6);
    h.restartScript(1);
    ok("resyncs after garbage and a truncated command, then obeys the next one",
       e6.scriptRunning() && e6.currentScript() == 1);
    ok("the truncated command was counted as bad, not acted on", l6.badCount() >= 1,
       numf("bad %ld", (long)l6.badCount()));

    uint8_t out[2];
    uint32_t badBefore = l6.badCount();
    l6.feed(0xB5, out);                               /* not a real command */
    ok("an unknown command is counted, not executed", l6.badCount() == badBefore + 1);
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail ? 1 : 0;
}
