/* THE BUS SCAN — MpcaScan.h
   ---------------------------------------------------------------------
   Mike, 2026-08-19: "does the PCA sketches check for pca boards via a scan
   of all addresses as I and others may jumper them differently".

   Two things here are worth a test and the rest is arithmetic:

     · THE ALL-CALL. A PCA9685 answers 0x70 as well as its own address, out
       of the box. A sweep that does not know that turns one board into two,
       the phantom being every board at once — so a write meant for "board 1"
       would move every servo on the droid. That is the assertion this file
       exists for.
     · THE ORDER. Boards map to board numbers in ascending address order, so
       0x40 + 0x42 behaves exactly as 0x40 + 0x41 does. "Jumper them however
       you like" is worth nothing if the mapping is not deterministic.
   ===================================================================== */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "shim/Wire.h"
#include "shim/Adafruit_PWMServoDriver.h"
#include "../src/MpcaScan.h"

uint8_t  __wireAck[32];
int      __wireAckCount = 0;
int      __wireProbes   = 0;
TwoWire  Wire;
PwmWrite __pwmLog[4096];
int      __pwmCount = 0;

static int pass = 0, fail = 0;
static void ok(const char* n, bool c, const char* x = ""){
  if(c) pass++; else fail++;
  printf("  %s  %s%s%s\n", c ? "PASS" : "FAIL", n, *x ? "   " : "", x);
}
static void setBus(const uint8_t* a, int n){
  memcpy(__wireAck, a, n); __wireAckCount = n; __wireProbes = 0;
}

int main(){
  uint8_t found[8];

  printf("\n== the addresses a PCA9685 answers that are not its own ==\n");
  ok("0x70, the All Call, is excluded", mpcaAddrReserved(0x70));
  ok("so are the three sub-call addresses",
     mpcaAddrReserved(0x71) && mpcaAddrReserved(0x72) && mpcaAddrReserved(0x73));
  ok("a real board address is not", !mpcaAddrReserved(0x40) && !mpcaAddrReserved(0x42)
     && !mpcaAddrReserved(0x6F) && !mpcaAddrReserved(0x74) && !mpcaAddrReserved(0x7F));

  printf("\n== one board, answering on its own address AND the All Call ==\n");
  { const uint8_t a[] = {0x40, 0x70};
    setBus(a, 2);
    uint8_t n = mpcaScan(found, 8);
    ok("it is ONE board, not two", n == 1, n == 1 ? "" : "counted the All Call");
    ok("and it is the one that was jumpered", n >= 1 && found[0] == 0x40);
  }

  printf("\n== jumpered however you like ==\n");
  { const uint8_t a[] = {0x42, 0x70};       /* A1 bridged, not A0 */
    setBus(a, 2);
    uint8_t n = mpcaScan(found, 8);
    ok("a lone board at 0x42 is found at all", n == 1 && found[0] == 0x42);
  }
  { const uint8_t a[] = {0x40, 0x42, 0x70};
    setBus(a, 3);
    uint8_t n = mpcaScan(found, 8);
    ok("0x40 + 0x42 is two boards", n == 2);
    ok("…in ascending address order, so 0x42 is board 1 and drives channels 16-31",
       found[0] == 0x40 && found[1] == 0x42);
  }
  { const uint8_t a[] = {0x7F, 0x40, 0x6A, 0x70};   /* deliberately unsorted */
    setBus(a, 4);
    uint8_t n = mpcaScan(found, 8);
    ok("the far end of the range is reachable — A0-A5 is 0x40 to 0x7F",
       n == 3 && found[0] == 0x40 && found[1] == 0x6A && found[2] == 0x7F);
  }

  printf("\n== an empty bus, and a bus with more than you asked for ==\n");
  { setBus(nullptr, 0);
    ok("nothing on the bus is nothing found", mpcaScan(found, 8) == 0);
    ok("…and it looked at every address a PCA9685 can have, minus the four reserved",
       __wireProbes == (0x7F - 0x40 + 1) - 4, "");
  }
  { const uint8_t a[] = {0x40, 0x41, 0x42, 0x43, 0x70};
    setBus(a, 5);
    uint8_t n = mpcaScan(found, 2);
    ok("the TOTAL is returned even when it will not fit", n == 4,
       "so a sketch can say it found more boards than its table has room for");
    ok("…and the first two are still the two lowest", found[0] == 0x40 && found[1] == 0x41);
  }

  printf("\n== binding the drivers to what was found ==\n");
  { Adafruit_PWMServoDriver p0(0x40), p1(0x41);
    Adafruit_PWMServoDriver* const B[] = { &p0, &p1 };
    const uint8_t f[] = {0x40, 0x42};
    uint8_t n = mpcaBind(B, 2, f, 2);
    __pwmCount = 0;
    B[0]->setPWM(3, 0, 300);
    B[1]->setPWM(4, 0, 400);
    ok("two bound", n == 2);
    ok("board 0 writes to 0x40", __pwmCount == 2 && __pwmLog[0].addr == 0x40);
    ok("board 1 writes to 0x42 — the address it was actually found at, not 0x41",
       __pwmCount == 2 && __pwmLog[1].addr == 0x42);
  }
  { Adafruit_PWMServoDriver p0(0x40), p1(0x41);
    Adafruit_PWMServoDriver* const B[] = { &p0, &p1 };
    const uint8_t f[] = {0x44};
    ok("one board found for a two-board table binds one, and says so",
       mpcaBind(B, 2, f, 1) == 1);
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail ? 1 : 0;
}
