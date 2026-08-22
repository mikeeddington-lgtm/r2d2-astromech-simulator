/* Sequence slots above 127.
   =====================================================================
   A track remembers which sequence it is playing in Track::seq, and the
   SAME field doubles as "this track is free" by going negative. Stored
   in an int8_t, slot 128 stores as -128 — so the track is born free.
   update() skips it, scriptRunning() and runningCount() never see it,
   and the routine simply never plays.

   What makes this worse than a routine that does nothing is the report:
   sequenceRunning(n) compares against the same truncated value, so it
   MATCHES, and the board answers "yes, 128 is running" about a routine
   that will never move a servo. A droid that says it is doing the thing
   and is not is the worst of the three outcomes — silence would at least
   send somebody looking.

   The tables are built at runtime for the reason mask_test.cpp gives:
   PROGMEM is a no-op in the host shim, and 130 hand-written sequence
   literals would be 130 lines of noise around the two that matter.

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

#define NCH    4
#define NSEQ   130                /* past the int8_t cliff at 128 */
#define STRIDE (1 + NCH)

static MpcaChannelDef TABLE[NCH];
static uint16_t DATA[NSEQ][STRIDE];
static MpcaSeqDef SEQS[NSEQ];

Adafruit_PWMServoDriver pca(0x40);
Adafruit_PWMServoDriver* const B[] = { &pca };
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

int main(){
  for(uint8_t i=0;i<NCH;i++){
    TABLE[i].board = 0; TABLE[i].pin = i;
    TABLE[i].min = 4000; TABLE[i].max = 8000; TABLE[i].home = 6000;
    TABLE[i].speed = 0; TABLE[i].accel = 0; TABLE[i].releaseMs = 0;
    TABLE[i].ease = MPCA_EASE_NONE;
  }
  /* Every slot drives ONE channel to a place of its own for 4 s, so which
     slot is playing can be read straight off the servo. Slot n takes
     channel n&3, so consecutive slots are disjoint and can play together —
     which is what makes "two high slots, two tracks" a fair question. */
  for(int n=0;n<NSEQ;n++){
    memset(DATA[n], 0, sizeof DATA[n]);
    DATA[n][0] = 4000;                                    /* ms */
    DATA[n][1 + (n & 3)] = (uint16_t)(4200 + n * 20);     /* its own channel */
    SEQS[n] = { DATA[n], 1, 0 };
  }

  printf("\n==== a low slot, for comparison ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQS,NSEQ); m.begin();
    m.restartScript(5);
    adv(m, 50);
    ok("slot 5 is running", m.runningCount() == 1 && m.scriptRunning());
    ok("  currentScript() names it", m.currentScript() == 5,
       numf("got %ld", (long)m.currentScript()));
    ok("  sequenceRunning(5) agrees", m.sequenceRunning(5));
    ok("  and the servo went where slot 5 asked", m.getPosition(1) == 4300,
       numf("pos %ld", (long)m.getPosition(1)));
  }

  printf("\n==== slot 128 — the first one past the cliff ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQS,NSEQ); m.begin();
    m.restartScript(128);
    adv(m, 50);
    ok("slot 128 is running", m.runningCount() == 1 && m.scriptRunning(),
       numf("running %ld", (long)m.runningCount()));
    ok("  currentScript() names it", m.currentScript() == 128,
       numf("got %ld", (long)m.currentScript()));
    ok("  sequenceRunning(128) agrees", m.sequenceRunning(128));
    ok("  and the servo went where slot 128 asked", m.getPosition(0) == 4200 + 128*20,
       numf("pos %ld", (long)m.getPosition(0)));   /* 128 & 3 == 0 */
    m.stopSequence(128);
    ok("  stopSequence(128) stops it", !m.sequenceRunning(128) && !m.scriptRunning());
  }

  printf("\n==== and the top of the table ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQS,NSEQ); m.begin();
    m.restartScript(129);
    adv(m, 50);
    ok("slot 129 is running and drove the servo",
       m.sequenceRunning(129) && m.runningCount() == 1
       && m.getPosition(1) == 4200 + 129*20,     /* 129 & 3 == 1 */
       numf("pos %ld", (long)m.getPosition(1)));
    /* the guard that was already there must still hold */
    m.restartScript(NSEQ);
    ok("a slot past the end of the table is still ignored",
       m.runningCount() == 1 && m.sequenceRunning(129));
  }

  printf("\n==== a high slot never reports itself as free ====\n");
  {
    /* The real damage: a truncated seq is negative, which every "is this
       track free" test reads as free — so a high slot both fails to run
       AND leaves its track available to be handed out again. */
    MaestroPCA m(B,1,TABLE,NCH,SEQS,NSEQ); m.begin();
    m.restartScript(128); m.restartScript(129);
    adv(m, 50);
    ok("two high slots occupy two tracks",
       m.runningCount() == 2, numf("running %ld", (long)m.runningCount()));
    ok("  and both are reported running",
       m.sequenceRunning(128) && m.sequenceRunning(129));
    m.stopScript();
    ok("stopScript clears them", !m.scriptRunning() && m.runningCount() == 0);
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
