/* Compiles examples/MaestroReplacement/MaestroReplacement.ino for the host.
   ---------------------------------------------------------------------
   This is the sketch that ends up in the droid, and until v1.54.0 it was
   the only one here with no compile check at all — the ESP32 pair got
   theirs in v1.33.0 and PCA_Bridge got one in v1.53.0. It carries the
   live-drive frame decoder, the bus scan, the watchdog and the console,
   and a typo in any of them is a thing you discover with the dome on.

   A pass means: it is syntactically sound, every method it calls on our
   classes exists with the arguments it passes, and setup() + loop() run
   once against a fake bus without wandering off. */
#include <stdio.h>
#include "shim/Arduino.h"
#include "shim/Wire.h"
#include "shim/Adafruit_PWMServoDriver.h"

unsigned long __fakeMillis = 0;
uint8_t  __wireAck[32] = {0x40, 0x41, 0x42};
int      __wireAckCount = 3;
int      __wireProbes   = 0;
TwoWire  Wire;
PwmWrite __pwmLog[4096];
int      __pwmCount = 0;

struct FakeSerial {
  void begin(unsigned long){}
  int  available(){ return 0; }
  int  read(){ return -1; }
  void print(const char*){} void print(int){} void print(unsigned){}
  void print(long){} void print(unsigned long){} void print(int,int){}
  void print(unsigned,int){} void print(char){} void print(float){}
  void println(){} void println(const char*){} void println(int){}
  void println(unsigned){} void println(unsigned long){} void println(long){}
  void flush(){}
};
FakeSerial Serial;
#ifndef HEX
#define HEX 16
#endif

#include "../examples/MaestroReplacement/MaestroReplacement.ino"

int main(){
  setup();
  loop();
  int fail = 0;
  /* the eight-board ceiling is declared here, not assumed elsewhere */
  if(PCA_MAX_BOARDS != 8){ printf("  FAIL  PCA_MAX_BOARDS is %d, expected 8\n", (int)PCA_MAX_BOARDS); fail = 1; }
  if(boardsOnBus != 3){ printf("  FAIL  the boot scan found %d boards, expected 3\n", (int)boardsOnBus); fail = 1; }
  if(!boardLive[2]){ printf("  FAIL  the third board on the bus was not woken\n"); fail = 1; }
  if(!fail) printf("  PASS  MaestroReplacement.ino compiles, links and boots onto 3 of 8 boards\n");
  return fail;
}
