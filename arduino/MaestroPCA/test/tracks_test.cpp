/* Concurrency + looping.
   =====================================================================
   The R2 case this exists for: a holoprojector idle-sweep must keep
   running when a button fires the panel sequence, and must stop when
   something genuinely needs its channels. Sequences that touch disjoint
   channels play together; overlapping ones displace.

   Build/run:  arduino/MaestroPCA/test/run.sh
   ===================================================================== */
#include "Arduino.h"
#include "Adafruit_PWMServoDriver.h"
#include "../src/MaestroPCA.h"
#include <cstdio>
unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;
static int pass=0, fail=0;
static void ok(const char*n,bool c,const char*x=""){ c?pass++:fail++; printf("  %s  %s%s%s\n",c?"PASS":"FAIL",n,*x?"   ":"",x); }

#define NCH 6
const MpcaChannelDef TABLE[NCH] PROGMEM = {
  { 0,0, 4000, 8000, 6000, 20, 0 },   /* ch0 holo pan  - slow, starts homed */
  { 0,1, 4000, 8000, 6000, 20, 0 },   /* ch1 holo tilt */
  { 0,2, 4000, 8000, 4000,  0, 0 },   /* ch2..5 panels - instant */
  { 0,3, 4000, 8000, 4000,  0, 0 },
  { 0,4, 4000, 8000, 4000,  0, 0 },
  { 0,5, 4000, 8000, 4000,  0, 0 }
};
/* slot 0: holo idle sweep, channels 0-1 only, LOOPS */
static const uint16_t HOLO[] PROGMEM = {
  600, 8000, 8000, 0,0,0,0,
  600, 4000, 4000, 0,0,0,0
};
/* slot 1: panels, channels 2-5 only */
static const uint16_t PANELS[] PROGMEM = {
  200, 0,0, 8000, 8000, 4000, 4000,
  200, 0,0, 4000, 4000, 8000, 8000,
  200, 0,0, 4000, 4000, 4000, 4000
};
/* slot 2: touches ch1 - overlaps the holo sweep, so must displace it */
static const uint16_t HOLOHOME[] PROGMEM = { 200, 0, 6000, 0,0,0,0 };
const MpcaSeqDef SEQS[3] PROGMEM = {
  { HOLO,     2, MPCA_SEQ_LOOP },
  { PANELS,   3, 0 },
  { HOLOHOME, 1, 0 }
};
Adafruit_PWMServoDriver pca(0x40);
Adafruit_PWMServoDriver* const B[] = { &pca };
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

int main(){
  MaestroPCA m(B,1,TABLE,NCH,SEQS,3);
  m.begin();

  printf("\n==== a looping sequence keeps going ====\n");
  m.restartScript(0);
  adv(m, 300);
  uint16_t mid = m.getPosition(0);
  ok("holo sweep is mid-travel, not snapped", mid > 6000 && mid < 8000);
  adv(m, 5000);
  ok("still running after 5 s (it loops)", m.sequenceRunning(0));
  ok("and still moving", m.getMovingState() == 1);

  printf("\n==== a panel sequence runs ALONGSIDE it ====\n");
  uint16_t before = m.getPosition(0);
  m.restartScript(1);
  ok("both sequences now running", m.runningCount() == 2, m.runningCount()==2?"":"count wrong");
  ok("the holo sweep was NOT displaced", m.sequenceRunning(0));
  adv(m, 100);
  ok("panels moved", m.getPosition(2) == 8000 || m.getPosition(3) == 8000);
  ok("holo kept sweeping through it", m.getPosition(0) != before);
  adv(m, 700);
  ok("panel sequence finished on its own", !m.sequenceRunning(1));
  ok("holo sweep is STILL looping", m.sequenceRunning(0));

  printf("\n==== an overlapping sequence displaces it ====\n");
  m.restartScript(2);                    /* touches ch1, which the holo owns */
  ok("holo sweep displaced by the overlapping sequence", !m.sequenceRunning(0));
  ok("the new one is running", m.sequenceRunning(2));
  adv(m, 3000);
  ok("it finished and nothing is left running", !m.scriptRunning());

  printf("\n==== stopScript clears everything ====\n");
  m.restartScript(0); m.restartScript(1);
  ok("two running again", m.runningCount() == 2);
  m.stopScript();
  ok("all stopped", !m.scriptRunning());

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
