/* Two arithmetic bounds that are checked one step too late.
   =====================================================================
   Neither of these is dramatic on the bench and both are wrong on a big
   droid, which is exactly the combination that survives a long time.

   1. MpcaSplitOutput's wire header carries board*16+pin in seven bits, so
      it rejects anything above 127. It computed the channel in a uint8_t
      FIRST, so board 16 arrives as 256, wraps to 0, sails past the test
      and transmits as CHANNEL 0 — a rejected channel that moves the first
      servo on the far board instead of moving nothing.

   2. update() clamps a long stall to 250 ms for the frame timers, then
      hands the kinematics at most 200 ms of it, because the tick
      accumulator was a uint8_t and 250 would not fit beside a remainder.
      So after a blocking sketch the frames have moved on further than the
      servos have — the animation slips against itself, which reads as a
      routine that lands in the wrong place rather than as a stall.

   Build/run:  arduino/MaestroPCA/test/run.sh
   ===================================================================== */
#include "Arduino.h"
#include "Adafruit_PWMServoDriver.h"
#include "../src/MaestroPCA.h"
#include <cstdio>
#include <cstring>

unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;
static int pass=0, fail=0;
static const char* numf(const char* f,long v){ static char b[8][40]; static int i=0; i=(i+1)&7; snprintf(b[i],40,f,v); return b[i]; }
static void ok(const char*n,bool c,const char*x=""){ c?pass++:fail++; printf("  %s  %s%s%s\n",c?"PASS":"FAIL",n,*x?"   ":"",x); }

/* the same recording Stream and local output split_test.cpp uses */
class WireTap : public Stream {
public:
  uint8_t buf[512]; int n = 0;
  size_t write(uint8_t b) override { if(n < (int)sizeof(buf)) buf[n++] = b; return 1; }
  int available() override { return 0; }
  int read() override { return -1; }
};
struct FakeLocal : public MpcaOutput {
  void begin(uint32_t, float) override {}
  uint16_t code(uint8_t, uint8_t, uint16_t qus) const override { return qus; }
  void writeCode(uint8_t, uint8_t, uint16_t) override {}
  void off(uint8_t, uint8_t) override {}
};

/* ch0 is local; the rest name boards whose channel number does not fit
   the wire's seven bits, one of them by wrapping a uint8_t */
#define NCH 4
/*   board pin   min   max  home  spd acc  releaseMs  ease */
const MpcaChannelDef TABLE[NCH] PROGMEM = {
  {  0, 0, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },   /* local            */
  {  8, 0, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },   /* channel 128      */
  { 16, 0, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },   /* 256 -> wraps to 0 */
  { 17, 0, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE }    /* 272 -> wraps to 16*/
};
static const uint16_t SEQ0[] PROGMEM = { 100, 6000, 0,0,0 };
const MpcaSeqDef SEQ[1] PROGMEM = { { SEQ0, 1, 0 } };

/* a table for the tick test: one channel, a speed that makes each 10 ms
   kinematics tick worth exactly 40 quarter-µs and nothing else */
#define TCH 1
const MpcaChannelDef TTABLE[TCH] PROGMEM = {
  {  0, 0, 4000, 8000, 6000, 40, 0, 0, MPCA_EASE_NONE }
};
Adafruit_PWMServoDriver pca(0x40);
Adafruit_PWMServoDriver* const B[] = { &pca };
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

int main(){
  printf("\n==== a channel the wire cannot address sends NOTHING ====\n");
  {
    FakeLocal local; WireTap tap;
    MpcaSplitOutput split(local, 1, tap);        /* board 0 local, rest remote */
    MaestroPCA m(split, TABLE, NCH, SEQ, 1);
    m.begin(25000000UL, 50.0f);
    /* homing already tried to place all four; nothing but board 0 is
       addressable, and board 0 is local, so the wire must be silent */
    ok("nothing was transmitted at all", tap.n == 0,
       numf("%ld bytes on the wire", (long)tap.n));

    tap.n = 0;
    m.setTarget(2, 7000); adv(m, 20);            /* board 16 -> 256 -> 0 */
    ok("board 16 (channel 256) sent nothing", tap.n == 0,
       tap.n ? numf("header 0x%02lX", (long)tap.buf[0]) : "");
    tap.n = 0;
    m.setTarget(3, 7000); adv(m, 20);            /* board 17 -> 272 -> 16 */
    ok("board 17 (channel 272) sent nothing", tap.n == 0,
       tap.n ? numf("header 0x%02lX", (long)tap.buf[0]) : "");
    tap.n = 0;
    m.setTarget(1, 7000); adv(m, 20);            /* board 8 -> 128, no wrap */
    ok("board 8 (channel 128) sent nothing either", tap.n == 0,
       numf("%ld bytes", (long)tap.n));
  }

  printf("\n==== a stall advances the servos as far as it advances the frames ====\n");
  {
    /* update() clamps elapsed to 250 ms and then steps the kinematics in
       10 ms ticks. 250 ms is 25 ticks, and at speed 40 that is exactly
       1000 quarter-µs of travel. Anything less means the accumulator threw
       part of the stall away while the frame timers kept it. */
    MaestroPCA m(B,1,TTABLE,TCH,SEQ,1);
    m.begin(25000000UL, 50.0f);
    m.setTarget(0, 8000);                        /* 2000 away, so no arrival */
    __fakeMillis += 250;
    m.update();
    ok("250 ms of stall is 25 ticks of travel", m.getPosition(0) == 7000,
       numf("pos %ld", (long)m.getPosition(0)));

    /* and the clamp itself still holds: a longer stall is no faster */
    MaestroPCA m2(B,1,TTABLE,TCH,SEQ,1);
    m2.begin(25000000UL, 50.0f);
    m2.setTarget(0, 8000);
    __fakeMillis += 5000;
    m2.update();
    ok("a 5 s stall is still clamped to the same 250 ms", m2.getPosition(0) == 7000,
       numf("pos %ld", (long)m2.getPosition(0)));
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
