/* MpcaLedcOutput — the ESP32's direct-pin backend, checked on the host.
   =====================================================================
   What this CAN prove: the duty arithmetic, the channel mapping, the
   ceiling at 16, and that the engine drives it end to end with no idea it
   is not a PCA9685.

   What it CANNOT prove: that ledcAttach/ledcWrite do the right thing on
   real silicon. Those are faked below. Until someone runs the sketch on a
   board, treat the peripheral calls as unverified — the maths is not.

   Build/run:  arduino/MaestroPCA/test/run.sh
   ===================================================================== */
#include "Arduino.h"
#include "Adafruit_PWMServoDriver.h"
#include <cstdio>
#include <cstring>

/* the fake peripheral — recorded, then asserted */
struct LedcCall { uint8_t gpio, idx; uint16_t duty; };
static LedcCall g_last[32];
static int g_calls = 0;
static void mpcaLedcFake(uint8_t gpio, uint8_t idx, uint16_t duty){
  if(idx < 32){ g_last[idx].gpio = gpio; g_last[idx].idx = idx; g_last[idx].duty = duty; }
  g_calls++;
}
#define MPCA_TEST_LEDC 1
#include "../src/MpcaEsp32.h"

unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;
static int pass=0, fail=0;
static const char* numf(const char* f,long v){ static char b[8][40]; static int i=0; i=(i+1)&7; snprintf(b[i],40,f,v); return b[i]; }
static void ok(const char*n,bool c,const char*x=""){ c?pass++:fail++; printf("  %s  %s%s%s\n",c?"PASS":"FAIL",n,*x?"   ":"",x); }

#define NCH 4
/*  board pin   min   max  home  spd acc  releaseMs  ease */
const MpcaChannelDef TABLE[NCH] PROGMEM = {
  { 0,0, 4000, 8000, 6000, 0, 0, 0, MPCA_EASE_NONE },   /* unlimited: lands at once */
  { 0,1, 4000, 8000, 6000, 0, 0, 0, MPCA_EASE_NONE },
  { 0,2, 4000, 8000,    0, 0, 0, 0, MPCA_EASE_NONE },   /* homemode Off */
  { 0,3, 4000, 8000, 6000,40,10, 0, MPCA_EASE_NONE }
};
static const uint16_t WAVE[] PROGMEM = {
  300, 8000, 0, 0, 0,
  300, 4000, 0, 0, 0
};
const MpcaSeqDef SEQ[1] PROGMEM = { { WAVE, 2, 0 } };
static const uint8_t PINS[NCH] = { 13, 12, 14, 27 };
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

int main(){
  printf("\n==== duty arithmetic: 16 bits at 50 Hz ====\n");
  {
    MpcaLedcOutput out(PINS, NCH);
    out.begin(25000000UL, 50.0f);
    ok("16-bit resolution is available at 50 Hz", out.bits() == 16);
    /* 1500 µs of a 20000 µs period = 7.5% of 65536 = 4915.2 */
    ok("1500 µs → 4915 counts", out.code(0, 0, 6000) == 4915, numf("got %ld", (long)out.code(0, 0, 6000)));
    ok("500 µs  → 1638 counts", out.code(0, 0, 2000) == 1638, numf("got %ld", (long)out.code(0, 0, 2000)));
    ok("2500 µs → 8192 counts", out.code(0, 0, 10000) == 8192, numf("got %ld", (long)out.code(0, 0, 10000)));
    ok("0 is genuinely no pulse", out.code(0, 0, 0) == 0);
    /* one count is 20000/65536 = 0.305 µs, so a quarter-µs step is
       sometimes visible and never lost to rounding by more than one */
    int distinct = 0;
    uint16_t prev = out.code(0, 0, 6000);
    for(uint16_t q = 6001; q <= 6008; q++){ uint16_t c = out.code(0, 0, q); if(c != prev){ distinct++; prev = c; } }
    ok("a quarter-µs move changes the duty most of the time", distinct >= 5,
       numf("%ld of 8 steps landed on a new count", (long)distinct));
  }

  printf("\n==== a servo rate the ESP32 cannot do at 16 bits ====\n");
  {
    MpcaLedcOutput out(PINS, NCH);
    out.begin(25000000UL, 2000.0f);      /* 2000 × 65536 > 80 MHz */
    ok("it steps the resolution down rather than misbehaving", out.bits() < 16 && out.bits() >= 8,
       numf("%ld bits", (long)out.bits()));
    ok("  and the arithmetic still lands mid-scale", out.code(0, 0, 1000) > 0);
  }

  printf("\n==== sixteen channels is a ceiling, not a suggestion ====\n");
  {
    static const uint8_t many[20] = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20};
    MpcaLedcOutput out(many, 20);
    ok("it caps at the silicon's 16 LEDC channels", out.channels() == 16);
    ok("  and says so, instead of driving four servos in silence", out.overflowed());
  }

  printf("\n==== the engine drives it, knowing nothing about ESP32s ====\n");
  {
    g_calls = 0;
    memset(g_last, 0, sizeof(g_last));
    MpcaLedcOutput out(PINS, NCH);
    MaestroPCA m(out, TABLE, NCH, SEQ, 1);
    m.begin(25000000UL, 50.0f);
    ok("homing writes the home pose as duty counts", g_last[0].duty == 4915,
       numf("ch0 duty %ld", (long)g_last[0].duty));
    ok("  to the GPIO the pin array names, not the channel number", g_last[0].gpio == 13);
    ok("a homemode-Off channel is left with no pulse", g_last[2].duty == 0);

    m.setTarget(1, 8000);
    adv(m, 200);
    ok("a move reaches the right channel's GPIO", g_last[1].gpio == 12 && g_last[1].duty == out.code(0, 0, 8000),
       numf("duty %ld", (long)g_last[1].duty));

    int before = g_calls;
    adv(m, 500);
    ok("a settled channel stops writing", g_calls == before);

    m.restartScript(0);
    adv(m, 700);
    ok("sequences run against it unchanged", g_last[0].duty != 4915);
    adv(m, 400);

    m.setTarget(1, 0);
    ok("pulses off means duty 0, which is limp", g_last[1].duty == 0);

    /* the eased channel proves the kinematics is untouched by the backend */
    m.setTarget(3, 8000);
    adv(m, 60);
    uint16_t mid = g_last[3].duty;
    adv(m, 4000);
    ok("an eased channel ramps rather than jumping",
       mid > out.code(0, 0, 6000) && mid < out.code(0, 0, 8000) && g_last[3].duty == out.code(0, 0, 8000),
       numf("mid %ld", (long)mid));
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
