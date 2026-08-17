/* MpcaSplitOutput — some channels local, the rest down a wire.
   =====================================================================
   The case this exists for is DISTANCE, not channel count: two PCA9685s
   get you past 16 for the same money with no firmware. A UART tolerates a
   long noisy run through a slip ring far better than I2C does.

   What matters here is that the channel table needs no change at all. It
   already says which board each channel is on; this just decides that
   boards past a threshold live somewhere else.

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

/* a Stream that just records what was written to it */
class WireTap : public Stream {
public:
  uint8_t buf[512]; int n = 0;
  size_t write(uint8_t b) override { if(n < (int)sizeof(buf)) buf[n++] = b; return 1; }
  int available() override { return 0; }
  int read() override { return -1; }
};
/* the local half: 16 channels of "PCA9685", recorded */
struct FakeLocal : public MpcaOutput {
  uint16_t last[16]; int writes = 0, begins = 0;
  FakeLocal(){ memset(last, 0, sizeof last); }
  void begin(uint32_t, float) override { begins++; }
  uint16_t code(uint8_t, uint8_t, uint16_t qus) const override { return qus / 5; }  /* coarse, like ticks */
  void writeCode(uint8_t b, uint8_t p, uint16_t c) override { if(!b && p < 16){ last[p] = c; writes++; } }
  void off(uint8_t b, uint8_t p) override { if(!b && p < 16){ last[p] = 0xFFFF; writes++; } }
};

#define NCH 20            /* 16 local + 4 on the far board */
/*  board pin   min   max  home  spd acc  releaseMs  ease */
const MpcaChannelDef TABLE[NCH] PROGMEM = {
  { 0, 0, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 1, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 2, 4000, 8000,    0, 0,0, 0, MPCA_EASE_NONE },
  { 0, 3, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 4, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 5, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 6, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 7, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 8, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0, 9, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,10, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,11, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,12, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,13, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,14, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,15, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 1, 0, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },   /* ch16 — over the wire */
  { 1, 1, 4000, 8000,    0, 0,0, 0, MPCA_EASE_NONE },   /* ch17 — homemode Off  */
  { 1, 2, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 1, 3, 4000, 8000, 6000,40,10, 0, MPCA_EASE_NONE }   /* ch19 — eased         */
};
static const uint16_t WAVE[] PROGMEM = {
  300, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 8000, 0,0,0,
  300, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 4000, 0,0,0
};
const MpcaSeqDef SEQ[1] PROGMEM = { { WAVE, 2, 0 } };
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

/* find the last frame for a channel in the tap */
static bool lastFrame(WireTap& t, uint8_t ch, uint16_t* qus){
  bool found = false;
  for(int i = 0; i + 2 < t.n; i++){
    if((t.buf[i] & 0x80) && (t.buf[i] & 0x7F) == ch
       && !(t.buf[i+1] & 0x80) && !(t.buf[i+2] & 0x80)){
      *qus = (uint16_t)(t.buf[i+1] << 7) | t.buf[i+2];
      found = true;
    }
  }
  return found;
}

int main(){
  printf("\n==== routing: board 0 stays here, board 1 goes down the wire ====\n");
  FakeLocal local; WireTap tap;
  MpcaSplitOutput split(local, 1, tap);
  MaestroPCA m(split, TABLE, NCH, SEQ, 1);
  m.begin(25000000UL, 50.0f);

  ok("begin() reaches the local output", local.begins == 1);
  ok("a local channel homes through the local output", local.last[0] == split.code(0,0,6000),
     numf("wrote %ld", (long)local.last[0]));
  ok("  and its code is the LOCAL quantisation, not the µs",
     split.code(0,0,6000) == 6000/5);
  ok("a remote channel's code is the quarter-µs, for the far end to round",
     split.code(1,0,6000) == 6000);
  /* compute BEFORE ok(), because C++ does not promise which argument is
     evaluated first — an out-parameter read in the message can print the
     value from before the call that sets it */
  uint16_t q = 0;
  bool got16 = lastFrame(tap, 16, &q);
  ok("homing sent a frame for the remote channel", got16 && q == 6000, numf("qus %ld", (long)q));
  uint16_t q17 = 0;
  bool got17 = lastFrame(tap, 17, &q17);
  ok("  and a homemode-Off remote channel was told 0, not left guessing", got17 && q17 == 0);
  uint16_t q0 = 0;
  ok("nothing local leaked onto the wire", !lastFrame(tap, 0, &q0));

  printf("\n==== the frame is PCA Studio's, byte for byte ====\n");
  tap.n = 0;
  m.setTarget(18, 7000);
  adv(m, 50);
  ok("three bytes, header first, 7 bits each", tap.n >= 3
     && (tap.buf[0] & 0x80) && !(tap.buf[1] & 0x80) && !(tap.buf[2] & 0x80));
  ok("  header carries board*16+pin", (tap.buf[0] & 0x7F) == 18);
  ok("  payload reassembles to the target", (uint16_t)((tap.buf[1] << 7) | tap.buf[2]) == 7000,
     numf("got %ld", (long)((tap.buf[1] << 7) | tap.buf[2])));

  printf("\n==== the engine cannot tell, and neither can the table ====\n");
  tap.n = 0; local.writes = 0;
  m.restartScript(0);
  adv(m, 200);                       /* inside frame 0, which drives ch16 high */
  uint16_t qs = 0;
  bool gotSeq = lastFrame(tap, 16, &qs);
  ok("a sequence drives a remote channel over the wire", gotSeq && qs == 8000,
     numf("qus %ld", (long)qs));
  adv(m, 500);                       /* frame 1 brings it back down */
  uint16_t qs2 = 0;
  lastFrame(tap, 16, &qs2);
  ok("  and the next frame crosses too", qs2 == 4000, numf("qus %ld", (long)qs2));
  int sentBefore = tap.n;
  adv(m, 400);
  ok("a settled remote channel stops sending", tap.n == sentBefore);

  /* easing is computed on the master — the far end only ever makes pulses */
  tap.n = 0;
  m.setTarget(19, 8000);
  adv(m, 60);
  uint16_t mid = 0; lastFrame(tap, 19, &mid);
  adv(m, 4000);
  uint16_t end = 0; lastFrame(tap, 19, &end);
  ok("an eased remote channel ramps over the wire, not in one jump",
     mid > 6000 && mid < 8000 && end == 8000, numf("mid %ld", (long)mid));

  tap.n = 0;
  m.setTarget(16, 0);
  uint16_t qoff = 1;
  bool gotOff = lastFrame(tap, 16, &qoff);
  ok("pulses-off crosses as qus 0", gotOff && qoff == 0);
  ok("the link counts what it sent, so a sketch can tell it is alive",
     split.framesSent() > 0, numf("%ld frames", (long)split.framesSent()));

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
