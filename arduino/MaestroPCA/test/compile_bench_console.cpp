/* Compiles bench-sketches/R2_Bench_Console/R2_Bench_Console.ino for the host,
   against Pololu's REAL library — not a stand-in for it.
   ---------------------------------------------------------------------
   This is the sketch a human types at while a droid is on the bench, and
   until now it was the only sketch here with no compile check at all. It
   was also the one found MISSING MpcaScan.h, and the one whose BENCH_TARGET
   was left on the wrong back end for a whole evening. Both faults are the
   kind a compile plus a boot would not have caught on its own — but the
   guards beside this one now do, and this proves the sketch they guard
   still builds.

   Both back ends are compiled. run.sh does the second one by COPYING the
   sketch folder and editing BENCH_TARGET in the copy's Config.h — which is
   literally the edit a user makes, so the test exercises the documented
   route rather than a -D flag no reader will ever type. Compiling only the
   default is how a branch rots.

   A pass means: it is syntactically sound, every method it calls on
   Pololu's classes and on ours exists with the arguments it passes, the
   channel list in Config.h yields a table with no null rows, and setup()
   plus loop() run once without wandering off. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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

/* The console the human types at, and the port the servo board is on.
   The second one must be a real Stream: that is what PololuMaestro takes,
   and taking anything less would prove nothing about the real build. */
struct FakeSerial : public Stream {
  size_t write(uint8_t){ return 1; }
  int  available(){ return 0; }
  int  read(){ return -1; }
  void begin(unsigned long){}
  void print(const char*){}   void print(char){}          void print(int){}
  void print(unsigned){}      void print(long){}          void print(unsigned long){}
  void print(float){}         void print(int,int){}       void print(unsigned,int){}
  void print(unsigned long,int){}
  void println(){}            void println(const char*){} void println(char){}
  void println(int){}         void println(unsigned){}    void println(long){}
  void println(unsigned long){} void println(unsigned long,int){}
  void flush(){}
};
FakeSerial Serial;
FakeSerial Serial1;
#define SERIAL_PORT_HARDWARE_OPEN Serial1
#ifndef HEX
#define HEX 16
#endif

/* run.sh points this at a temp copy for the second back end. */
#ifndef BENCH_INO
#define BENCH_INO "../../bench-sketches/R2_Bench_Console/R2_Bench_Console.ino"
#endif
#include BENCH_INO

int main(){
  setup();
  loop();
  int fail = 0;
#if BENCH_TARGET == BT_MAESTRO
  /* The channel table is COUNTED from BENCH_CHANNEL_LIST rather than typed
     a second time. The fault that arrangement exists to prevent is a row
     with no name, which this console would then print. */
  if(chanCount() != 18){
    printf("  FAIL  chanCount() is %d, expected 18 from Config.h\n", (int)chanCount()); fail = 1; }
  for(uint8_t i = 0; i < chanCount(); i++){
    if(!CHAN[i].name || !*CHAN[i].name){
      printf("  FAIL  channel %d has no name — the list and the count disagree\n", (int)i); fail = 1; }
    if(CHAN[i].lo >= CHAN[i].hi){
      printf("  FAIL  channel %d has min >= max\n", (int)i); fail = 1; }
  }
  for(uint8_t i = 0; i < SLOT_COUNT; i++)
    if(!SLOT[i] || !*SLOT[i]){ printf("  FAIL  slot %d has no name\n", (int)i); fail = 1; }
  if(!fail) printf("  PASS  R2_Bench_Console.ino compiles and boots on BT_MAESTRO"
                   "  (%d channels, %d slots, no null rows)\n",
                   (int)chanCount(), (int)SLOT_COUNT);
#else
  if(!fail) printf("  PASS  R2_Bench_Console.ino compiles and boots on the PCA back end\n");
#endif
  return fail;
}
