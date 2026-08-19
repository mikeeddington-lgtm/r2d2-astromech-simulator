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

/* the sketch talks to a Serial the host does not have */
struct FakeSerial {
  void begin(unsigned long){}
  int  available(){ return 0; }
  int  read(){ return -1; }
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

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail ? 1 : 0;
}
