/* The channel mask, above 32 channels.
   =====================================================================
   "Several sequences at once, on disjoint channels" is the headline this
   engine has over a real Maestro, and the ONLY thing that decides whether
   two sequences are disjoint is the per-track channel mask. A mask that
   cannot count past 32 does not fail loudly on a big rig — it reports
   every high channel as the same channel, so two routines that share no
   servo at all displace each other, and the feature quietly stops
   existing on exactly the builds that need it most.

   Three PCA9685s is the configuration the project's own README describes,
   and that is 48 channels. This runs on 48.

   The second half of the same bug is releaseSeqSpeeds(): it uses the same
   bit to decide whose per-frame speed to put back, so on a big rig a
   finishing routine restores the speed of channels it never touched.

   The tables are built at RUNTIME rather than written out as literals.
   PROGMEM is a no-op in the host shim, so this changes nothing about what
   is under test — and a 48-channel frame is 49 words, of which 48 are
   zero. WHICH channel each sequence touches is the entire subject here,
   and a wall of zeros is the one way to hide it.

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

#define NCH    48                 /* three PCA9685s, as the README describes */
#define STRIDE (1 + NCH)          /* duration + one target per channel       */
#define SSTRIDE (1 + 2*NCH)       /* ...and a speed per channel, with SPEEDS */

static MpcaChannelDef TABLE[NCH];

/* one-frame sequences, each touching exactly the channels named */
static uint16_t D_LOW3[STRIDE], D_LOW10[STRIDE];
static uint16_t D_CH31[STRIDE], D_CH32[STRIDE];
static uint16_t D_CH33[STRIDE], D_CH40[STRIDE], D_CH33_34[STRIDE];
static uint16_t D_SP33[SSTRIDE], D_SP40[SSTRIDE];
static MpcaSeqDef SEQS[9];
enum { S_LOW3, S_LOW10, S_CH31, S_CH32, S_CH33, S_CH40, S_CH33_34, S_SP33, S_SP40 };

static void frameOne(uint16_t* row, uint16_t durMs, uint8_t ch, uint16_t target){
  memset(row, 0, STRIDE * sizeof(uint16_t));
  row[0] = durMs; row[1 + ch] = target;
}
/* a frame that carries a speed as well as a target — stride doubles */
static void frameSpeed(uint16_t* row, uint16_t durMs, uint8_t ch, uint16_t target, uint16_t speed){
  memset(row, 0, SSTRIDE * sizeof(uint16_t));
  row[0] = durMs; row[1 + ch] = target; row[1 + NCH + ch] = speed;
}

Adafruit_PWMServoDriver pcaA(0x40), pcaB(0x41), pcaC(0x42);
Adafruit_PWMServoDriver* const B[] = { &pcaA, &pcaB, &pcaC };
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

int main(){
  for(uint8_t i=0;i<NCH;i++){
    TABLE[i].board = (uint8_t)(i >> 4); TABLE[i].pin = (uint8_t)(i & 15);
    TABLE[i].min = 4000; TABLE[i].max = 8000; TABLE[i].home = 6000;
    TABLE[i].speed = 20; TABLE[i].accel = 0; TABLE[i].releaseMs = 0;
    TABLE[i].ease = MPCA_EASE_NONE;
  }
  frameOne(D_LOW3,    2000,  3, 7000);
  frameOne(D_LOW10,   2000, 10, 7000);
  frameOne(D_CH31,    2000, 31, 7000);
  frameOne(D_CH32,    2000, 32, 7000);
  frameOne(D_CH33,    2000, 33, 7000);
  frameOne(D_CH40,    2000, 40, 7000);
  memset(D_CH33_34, 0, sizeof D_CH33_34);
  D_CH33_34[0] = 2000; D_CH33_34[1+33] = 7000; D_CH33_34[1+34] = 7000;
  frameSpeed(D_SP33, 600, 33, 8000, 111);
  frameSpeed(D_SP40, 600, 40, 8000, 222);
  SEQS[S_LOW3]    = { D_LOW3,    1, 0 };
  SEQS[S_LOW10]   = { D_LOW10,   1, 0 };
  SEQS[S_CH31]    = { D_CH31,    1, 0 };
  SEQS[S_CH32]    = { D_CH32,    1, 0 };
  SEQS[S_CH33]    = { D_CH33,    1, 0 };
  SEQS[S_CH40]    = { D_CH40,    1, 0 };
  SEQS[S_CH33_34] = { D_CH33_34, 1, 0 };
  SEQS[S_SP33]    = { D_SP33,    1, MPCA_SEQ_SPEEDS };
  SEQS[S_SP40]    = { D_SP40,    1, MPCA_SEQ_SPEEDS };

  printf("\n==== the control: two sequences on LOW channels play together ====\n");
  {
    MaestroPCA m(B,3,TABLE,NCH,SEQS,9); m.begin();
    m.restartScript(S_LOW3);
    m.restartScript(S_LOW10);
    ok("channels 3 and 10 are disjoint, so both run",
       m.runningCount() == 2, numf("running %ld", (long)m.runningCount()));
  }

  printf("\n==== and so must two on HIGH channels ====\n");
  {
    MaestroPCA m(B,3,TABLE,NCH,SEQS,9); m.begin();
    m.restartScript(S_CH33);
    ok("the first one is running", m.runningCount() == 1);
    m.restartScript(S_CH40);
    ok("channels 33 and 40 are disjoint, so BOTH run",
       m.runningCount() == 2, numf("running %ld", (long)m.runningCount()));
    ok("  the first was not displaced", m.sequenceRunning(S_CH33));
    ok("  and the second is running too", m.sequenceRunning(S_CH40));
    adv(m, 400);
    ok("  both channels actually moved",
       m.getPosition(33) > 6000 && m.getPosition(40) > 6000,
       numf("ch33 %ld", (long)m.getPosition(33)));
  }

  printf("\n==== the off-by-one: channel 31 and channel 32 are not the same ====\n");
  {
    MaestroPCA m(B,3,TABLE,NCH,SEQS,9); m.begin();
    m.restartScript(S_CH31);
    m.restartScript(S_CH32);
    ok("31 and 32 are disjoint, so both run",
       m.runningCount() == 2, numf("running %ld", (long)m.runningCount()));
  }

  printf("\n==== a genuine overlap up there still displaces ====\n");
  {
    MaestroPCA m(B,3,TABLE,NCH,SEQS,9); m.begin();
    m.restartScript(S_CH33);
    m.restartScript(S_CH33_34);              /* really does share channel 33 */
    ok("the overlapping one displaced it",
       !m.sequenceRunning(S_CH33) && m.sequenceRunning(S_CH33_34));
    ok("  and only one is running", m.runningCount() == 1);
  }

  printf("\n==== a finishing routine puts back ITS OWN speeds, not everyone's ====\n");
  {
    /* Both carry per-frame speeds, on channels that share nothing. When the
       one on channel 40 ends, channel 33 is still being driven by a routine
       that asked for its own pace — and a mask that folds every high channel
       into one bit hands channel 33's speed back to the table underneath a
       running sequence. */
    MaestroPCA m(B,3,TABLE,NCH,SEQS,9); m.begin();
    m.restartScript(S_SP33);
    m.restartScript(S_SP40);
    adv(m, 100);
    ok("both speed-carrying routines are running",
       m.runningCount() == 2, numf("running %ld", (long)m.runningCount()));
    m.stopSequence(S_SP40);                  /* channel 40 lets go of its speed */
    /* Channel 33 is still owned by S_SP33, so its frame speed must stand.
       There is no getter for speed, so it is measured: at 111 the channel
       covers ~1110 quarter-µs in 100 ms, and at the table's 20 it would
       cover 200. */
    uint16_t p0 = m.getPosition(33);
    adv(m, 100);
    uint16_t p1 = m.getPosition(33);
    ok("  channel 33 is STILL running at its routine's speed",
       (p1 - p0) > 400, numf("moved %ld in 100 ms", (long)(p1 - p0)));
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
