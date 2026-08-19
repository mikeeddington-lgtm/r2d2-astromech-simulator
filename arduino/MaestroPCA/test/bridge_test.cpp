/* PCA_BRIDGE — it compiles, and its inlined scan has not drifted
   ---------------------------------------------------------------------
   PCA_Bridge is the one sketch in this project that is not a library
   example: it lives in `pca-studio/` because it is a TOOL, and it has
   always built with nothing installed but Wire and Adafruit_PWMServoDriver.
   So it carries its own copy of the bus scan rather than including
   MpcaScan.h — see the long comment at the top of the .ino for why.

   A copy is a liability. This file is the reason it is an acceptable one:
   it compiles the sketch and then runs BOTH scans over the same buses,
   asserting they agree answer for answer. Change one and this tells you
   about the other — which is the only thing that makes "it's a copy" a
   decision rather than a hazard.

   It also gives PCA_Bridge a compile check, which it has never had. The
   ESP32 sketches got theirs in v1.33.0 and it silently stopped working
   almost immediately (v1.53.0 found it); a tool nobody compiles in CI is
   a tool that breaks in somebody's dome.
   ===================================================================== */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "shim/Arduino.h"
#include "shim/Wire.h"
#include "shim/Adafruit_PWMServoDriver.h"

/* the shims' globals */
unsigned long __fakeMillis = 0;
uint8_t  __wireAck[32];
int      __wireAckCount = 0;
int      __wireProbes   = 0;
TwoWire  Wire;
PwmWrite __pwmLog[4096];
int      __pwmCount = 0;

/* the sketch talks to a Serial the host does not have.
   v1.54.0: it can be FED now, so loop() can be run against a real byte
   stream and the wire protocol tested where it is actually decoded. */
static uint8_t __rx[512];
static int     __rxN = 0, __rxAt = 0;
static void feed(const uint8_t* b, int n){
  __rxN = 0; __rxAt = 0;
  for(int i = 0; i < n && i < 512; i++) __rx[__rxN++] = b[i];
}
struct FakeSerial {
  void begin(unsigned long){}
  int  available(){ return __rxN - __rxAt; }
  int  read(){ return __rxAt < __rxN ? __rx[__rxAt++] : -1; }
  void print(const char*){} void print(int){} void print(unsigned){}
  void print(long){} void print(unsigned long){} void print(int,int){}
  void print(unsigned,int){} void print(char){}
  void println(){} void println(const char*){} void println(int){}
  void println(unsigned){} void println(unsigned long){}
  void flush(){}
};
FakeSerial Serial;
#ifndef HEX
#define HEX 16
#endif

/* the sketch itself, compiled as the tool it is */
#include "../../../pca-studio/PCA_Bridge/PCA_Bridge.ino"

/* and the original, to measure the copy against */
#include "../src/MpcaScan.h"

static int pass = 0, fail = 0;
static void ok(const char* n, bool c, const char* x = ""){
  if(c) pass++; else fail++;
  printf("  %s  %s%s%s\n", c ? "PASS" : "FAIL", n, *x ? "   " : "", x);
}
static void setBus(const uint8_t* a, int n){
  memcpy(__wireAck, a, n); __wireAckCount = n; __wireProbes = 0;
}
/* both scans, same bus, same answer? */
static bool agree(const uint8_t* busAddrs, int busN, const char** why){
  static char buf[120];
  uint8_t mine[8], theirs[8];
  setBus(busAddrs, busN);
  uint8_t a = bridgeScan(mine, 8);
  setBus(busAddrs, busN);
  uint8_t b = mpcaScan(theirs, 8);
  if(a != b){ snprintf(buf, sizeof buf, "counts differ: bridge %u, library %u", a, b); *why = buf; return false; }
  for(uint8_t i = 0; i < a && i < 8; i++)
    if(mine[i] != theirs[i]){
      snprintf(buf, sizeof buf, "board %u: bridge 0x%02X, library 0x%02X", i, mine[i], theirs[i]);
      *why = buf; return false;
    }
  *why = "";
  return true;
}

int main(){
  printf("\n== PCA_Bridge compiles, and setup() runs against a fake bus ==\n");
  { const uint8_t a[] = {0x40, 0x42, 0x70};
    setBus(a, 3);
    setup();
    ok("it found the two boards that are there, not the two it expected",
       nFound == 2 && present[0] && present[1]);
    ok("…and bound them to the addresses they answered at",
       ADDR[0] == 0x40 && ADDR[1] == 0x42);
    __pwmCount = 0;
    pca[1].setPWM(5, 0, 300);
    ok("…so a write to board 1 goes to 0x42", __pwmCount == 1 && __pwmLog[0].addr == 0x42);
  }
  { const uint8_t a[] = {0x70};          /* an All Call and nothing else */
    setBus(a, 1);
    setup();
    ok("a bus with only the All Call on it is an EMPTY bus",
       nFound == 0 && !present[0] && !present[1]);
  }

  printf("\n== the inlined copy has not drifted from MpcaScan.h ==\n");
  { const char* why = "";
    const uint8_t empty[1] = {0};
    ok("an empty bus", agree(empty, 0, &why), why);
    const uint8_t one[]   = {0x40, 0x70};                 agree(one, 2, &why);
    ok("one board plus its All Call", agree(one, 2, &why), why);
    const uint8_t odd[]   = {0x42, 0x70};
    ok("a lone board on a different jumper", agree(odd, 2, &why), why);
    const uint8_t two[]   = {0x40, 0x42, 0x70};
    ok("two boards, non-consecutive", agree(two, 3, &why), why);
    const uint8_t far_[]  = {0x40, 0x6A, 0x7F, 0x70};
    ok("the far end of the range", agree(far_, 4, &why), why);
    const uint8_t sub[]   = {0x40, 0x70, 0x71, 0x72, 0x73};
    ok("the sub-call addresses are excluded by both", agree(sub, 5, &why), why);
    const uint8_t many[]  = {0x40,0x41,0x42,0x43,0x44,0x70};
    ok("more boards than either will store", agree(many, 6, &why), why);
  }
  printf("\n== and they look at exactly the same addresses ==\n");
  { const uint8_t empty[1] = {0};
    setBus(empty, 0); bridgeScan(nullptr, 0); int mine = __wireProbes;
    setBus(empty, 0); mpcaScan(nullptr, 0);   int theirs = __wireProbes;
    char b[80]; snprintf(b, sizeof b, "%d vs %d", mine, theirs);
    ok("same sweep, same exclusions", mine == theirs && mine == (0x7F-0x40+1) - 4, b);
  }

  /* =================================================================
     v1.54.0 — Mike had three PCA9685s on the bench and this sketch said
     "32 channels max". That ceiling was never the hardware: the frame
     header's high bit marks the frame and only SIX of the remaining
     seven bits were being read as the channel, with 62 and 63 spent on
     configuration. Reading seven gives 0..127 — eight boards.

     What follows is the decoder, exercised through loop() against a real
     byte stream, because the failure mode of getting this wrong is not a
     crash: it is channel 70 folding to channel 6 and a servo the user
     never touched swinging across.
     ================================================================= */
  printf("\n== protocol 2: seven bits of channel, config at the top ==\n");
  { const uint8_t bus[] = {0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x70};
    setBus(bus, 9);
    setup();
    ok("eight boards on the bus, eight boards bound",
       nFound == 8 && nBound == 8 && present[7] && ADDR[7] == 0x47);

    /* channel 70 = board 4, pin 6 — the one that used to fold to ch 6 */
    __pwmCount = 0;
    const uint8_t f70[] = { (uint8_t)(0x80|70), (uint8_t)(300>>7), (uint8_t)(300&0x7F) };
    feed(f70, 3); loop();
    ok("channel 70 drives board 4 pin 6, not board 0 pin 6",
       __pwmCount == 1 && __pwmLog[0].addr == 0x44 && __pwmLog[0].pin == 6
       && __pwmLog[0].off == 300);

    /* channel 125 — the top servo channel */
    __pwmCount = 0;
    const uint8_t f125[] = { (uint8_t)(0x80|125), (uint8_t)(400>>7), (uint8_t)(400&0x7F) };
    feed(f125, 3); loop();
    ok("channel 125 drives board 7 pin 13 — the top servo channel",
       __pwmCount == 1 && __pwmLog[0].addr == 0x47 && __pwmLog[0].pin == 13);

    /* 62 and 63 are ordinary servo channels now */
    __pwmCount = 0;
    const uint8_t f62[] = { (uint8_t)(0x80|62), (uint8_t)(350>>7), (uint8_t)(350&0x7F) };
    feed(f62, 3); loop();
    ok("channel 62 is a SERVO now (board 3 pin 14), not the oscillator",
       __pwmCount == 1 && __pwmLog[0].addr == 0x43 && __pwmLog[0].pin == 14);

    /* the config channels moved to the top and drive nothing */
    __pwmCount = 0; oscHz = 0; servoHz = 0;
    const uint8_t fcfg[] = { (uint8_t)(0x80|126), (uint8_t)(2500>>7), (uint8_t)(2500&0x7F),
                             (uint8_t)(0x80|127), (uint8_t)(50>>7),   (uint8_t)(50&0x7F) };
    feed(fcfg, 6); loop();
    ok("channel 126 sets the oscillator and moves nothing",
       oscHz == 25000000UL && __pwmCount == 0);
    ok("channel 127 sets the servo rate and moves nothing",
       (int)servoHz == 50 && __pwmCount == 0);

    /* 8191 is still "stop pulsing", on any channel */
    __pwmCount = 0;
    const uint8_t foff[] = { (uint8_t)(0x80|70), (uint8_t)(8191>>7), (uint8_t)(8191&0x7F) };
    feed(foff, 3); loop();
    ok("8191 still means pulses OFF, on a high channel too",
       __pwmCount == 1 && __pwmLog[0].off == 4096 && __pwmLog[0].addr == 0x44);

    /* a lost byte must resync on the next header, not smear */
    __pwmCount = 0;
    const uint8_t frag[] = { (uint8_t)(0x80|70), (uint8_t)(300>>7),      /* truncated */
                             (uint8_t)(0x80|33), (uint8_t)(310>>7), (uint8_t)(310&0x7F) };
    feed(frag, 5); loop();
    ok("a truncated frame is abandoned at the next header, not smeared",
       __pwmCount == 1 && __pwmLog[0].addr == 0x42 && __pwmLog[0].pin == 1
       && __pwmLog[0].off == 310);
  }
  { /* the honest limit: a bus with more than eight boards */
    const uint8_t bus[] = {0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x70};
    setBus(bus, 10);
    setup();
    ok("nine boards on the bus: eight bound, and it KNOWS about the ninth",
       nFound == 9 && nBound == 8);
    /* the ninth is genuinely unreachable, and this is why: board 8 would
       need channel 128, and 128 needs the eighth bit of the header —
       which is the frame marker itself. Eight boards is the ceiling of
       this frame format, not an arbitrary array size. */
    bool ninthBound = false;
    for(uint8_t b = 0; b < 8; b++) if(ADDR[b] == 0x48) ninthBound = true;
    ok("…and the ninth board (0x48) is bound to nothing — no channel reaches it",
       !ninthBound && ADDR[7] == 0x47);
  }
  { /* THE BENCH THAT STARTED THIS. Mike's bus answered at 0x40, 0x48 and
       one more; the old sketch drove two of them and reported the third
       as surplus. All three bind now, and the addresses are as jumpered,
       not as assumed. */
    const uint8_t bus[] = {0x40, 0x48, 0x50, 0x70};
    setBus(bus, 4);
    setup();
    ok("Mike's bench: all three boards bind, in address order",
       nFound == 3 && nBound == 3
       && ADDR[0] == 0x40 && ADDR[1] == 0x48 && ADDR[2] == 0x50);
    __pwmCount = 0;
    const uint8_t f33[] = { (uint8_t)(0x80|33), (uint8_t)(320>>7), (uint8_t)(320&0x7F) };
    feed(f33, 3); loop();
    ok("…and channel 33 reaches the third board, which used to be unaddressable",
       __pwmCount == 1 && __pwmLog[0].addr == 0x50 && __pwmLog[0].pin == 1);
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail ? 1 : 0;
}
