/* The bits a real Maestro cannot do.
   =====================================================================
   release-when-settled · background layer that resumes · oscillator and
   wander generators · easing profiles.

   Build/run:  arduino/MaestroPCA/test/run.sh
   ===================================================================== */
#include "Arduino.h"
#include "Adafruit_PWMServoDriver.h"
#include "../src/MaestroPCA.h"
#include <cstdio>
unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;
static int pass=0, fail=0;
static const char* numf(const char* f,long v){ static char b[8][40]; static int i=0; i=(i+1)&7; snprintf(b[i],40,f,v); return b[i]; }
static void ok(const char*n,bool c,const char*x=""){ c?pass++:fail++; printf("  %s  %s%s%s\n",c?"PASS":"FAIL",n,*x?"   ":"",x); }

#define NCH 6
/*  board pin   min   max  home  spd acc  releaseMs  ease */
const MpcaChannelDef TABLE[NCH] PROGMEM = {
  { 0,0, 4000, 8000, 6000, 40,  0,  500, MPCA_EASE_NONE },      /* releases after 500 ms */
  { 0,1, 4000, 8000, 6000, 40,  0,    0, MPCA_EASE_NONE },      /* holds forever         */
  { 0,2, 4000, 8000, 6000, 40, 10,    0, MPCA_EASE_OVERSHOOT }, /* overshoots            */
  { 0,3, 4000, 8000, 6000, 40, 10,    0, MPCA_EASE_SOFT },      /* soft launch           */
  { 0,4, 4000, 8000, 6000, 40, 10,    0, MPCA_EASE_NONE },      /* generator channel     */
  { 0,5, 4000, 8000, 6000, 40, 10,    0, MPCA_EASE_NONE }       /* generator channel     */
};
/* 0: panels (ch0,1)   1: holo idle OSC (ch4,5, background)
   2: holo gesture (ch4)  3: wander (ch4, background)   4: ease pair (ch2,3) */
static const uint16_t PANELS[] PROGMEM = {
  300, 8000, 8000, 0,0,0,0,
  300, 4000, 4000, 0,0,0,0
};
static const uint16_t HOLO_OSC[] PROGMEM = {   /* ch, lo, hi, period, phase */
  4, 4000, 8000, 2000,   0,
  5, 4000, 8000, 2000,  90
};
static const uint16_t HOLO_GESTURE[] PROGMEM = { 400, 0,0,0,0, 7000, 0 };
static const uint16_t WANDER[] PROGMEM = { 4, 4000, 8000, 300, 0 };
static const uint16_t EASEPAIR[] PROGMEM = { 800, 0,0, 8000, 8000, 0,0 };
const MpcaSeqDef SEQ[5] PROGMEM = {
  { PANELS,       2, 0 },
  { HOLO_OSC,     2, MPCA_SEQ_OSC | MPCA_SEQ_BACKGROUND },
  { HOLO_GESTURE, 1, 0 },
  { WANDER,       1, MPCA_SEQ_WANDER | MPCA_SEQ_BACKGROUND },
  { EASEPAIR,     1, 0 }
};
Adafruit_PWMServoDriver pca(0x40);
Adafruit_PWMServoDriver* const B[] = { &pca };
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

int main(){
  printf("\n==== release when settled ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQ,5); m.begin();
    m.setTarget(0, 8000); m.setTarget(1, 8000);
    adv(m, 2000);
    ok("both channels arrived", m.getPosition(1) == 8000);
    ok("the releasing channel has gone quiet", m.isReleased(0));
    ok("  and reads position 0 (no pulses)", m.getPosition(0) == 0);
    ok("the holding channel is still driven", !m.isReleased(1) && m.getPosition(1) == 8000);

    /* re-driving a released channel must EASE from where it was, not snap */
    m.setTarget(0, 4000);
    uint16_t first = m.getPosition(0);
    ok("re-driving resumes from the remembered position, no snap",
       first > 7000, numf("pos %ld", (long)first));
    adv(m, 1200);           /* 4000 counts at speed 40 = 1000 ms travel */
    ok("and travels to the new target", m.getPosition(0) == 4000,
       numf("pos %ld", (long)m.getPosition(0)));
    adv(m, 800);            /* then the 500 ms release timer runs again */
    ok("then releases again once it has settled", m.isReleased(0));

    /* an explicit off means we no longer know where it is */
    m.setTarget(0, 0);
    m.setTarget(0, 7000);
    ok("after an explicit off, the next target snaps again", m.getPosition(0) == 7000);
  }

  printf("\n==== background layer resumes ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQ,5); m.begin();
    m.restartScript(1);                       /* holo idle, ch4+5, background */
    adv(m, 900);
    ok("the idle is running", m.sequenceRunning(1));
    uint16_t before = m.getPosition(4);
    adv(m, 300);
    ok("  and is actually sweeping", m.getPosition(4) != before);

    m.restartScript(2);                       /* a gesture claims ch4 */
    ok("the gesture displaces the idle", !m.sequenceRunning(1) && m.sequenceRunning(2));
    adv(m, 600);
    ok("the gesture finished", !m.sequenceRunning(2));
    ok("THE IDLE CAME BACK BY ITSELF", m.sequenceRunning(1));
    before = m.getPosition(4);
    adv(m, 300);
    ok("  and is sweeping again", m.getPosition(4) != before);

    m.stopScript();
    adv(m, 600);
    ok("an explicit stopScript really stops it (no resume)", !m.scriptRunning());
  }

  printf("\n==== oscillator generator ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQ,5); m.begin();
    m.restartScript(1);
    uint16_t lo4=65535, hi4=0, lo5=65535, hi5=0;
    bool phaseDiffer = false;
    for(int i=0;i<6000;i+=10){
      __fakeMillis+=10; m.update();
      uint16_t a=m.getPosition(4), b=m.getPosition(5);
      if(a<lo4) lo4=a;
      if(a>hi4) hi4=a;
      if(b<lo5) lo5=b;
      if(b>hi5) hi5=b;
      if(a>b+200 || b>a+200) phaseDiffer = true;
    }
    ok("ch4 sweeps the full range", lo4==4000 && hi4==8000, numf("hi %ld",(long)hi4));
    ok("ch5 sweeps the full range too", lo5==4000 && hi5==8000);
    ok("the 90-degree phase really offsets them", phaseDiffer);
    ok("it never ends on its own", m.sequenceRunning(1));

    /* the point of a generator: it cannot be truncated the way a
       too-short frame truncates a frame-based sweep */
    ok("full travel reached despite no frame long enough to hold it",
       (hi4 - lo4) == 4000, numf("range %ld", (long)(hi4-lo4)));
  }

  printf("\n==== wander generator ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQ,5); m.begin();
    m.restartScript(3);
    uint16_t lo=65535, hi=0; int changes=0; uint16_t last=0;
    for(int i=0;i<8000;i+=10){
      __fakeMillis+=10; m.update();
      uint16_t p=m.getPosition(4);
      if(p<lo) lo=p;
      if(p>hi) hi=p;
      if(last && p!=last) changes++;
      last=p;
    }
    ok("wander stays inside its range", lo>=4000 && hi<=8000, numf("hi %ld",(long)hi));
    ok("wander explores a good part of it", (hi-lo) > 1000, numf("spread %ld",(long)(hi-lo)));
    ok("it keeps moving (idle life, not a twitch)", changes > 100, numf("%ld changes",(long)changes));
  }

  printf("\n==== easing ====\n");
  {
    /* OVERSHOOT: the position must go PAST the target and come back */
    MaestroPCA m(B,1,TABLE,NCH,SEQ,5); m.begin();
    m.setTarget(2, 8000);
    uint16_t peak=0;
    for(int i=0;i<4000;i+=10){ __fakeMillis+=10; m.update(); uint16_t p=m.getPosition(2); if(p>peak)peak=p; }
    /* 8000 is the endpoint so it cannot physically go past — aim lower */
    MaestroPCA m2(B,1,TABLE,NCH,SEQ,5); m2.begin();
    m2.setTarget(2, 7000);
    peak=0;
    for(int i=0;i<4000;i+=10){ __fakeMillis+=10; m2.update(); uint16_t p=m2.getPosition(2); if(p>peak)peak=p; }
    ok("overshoot goes past the target", peak > 7000, numf("peak %ld",(long)peak));
    ok("  and settles back exactly on it", m2.getPosition(2) == 7000,
       numf("final %ld",(long)m2.getPosition(2)));
    ok("  it stays inside the calibrated endpoints", peak <= 8000);

    /* SOFT vs NONE: the soft channel must be behind early on, but both
       must still land exactly */
    MaestroPCA m3(B,1,TABLE,NCH,SEQ,5); m3.begin();
    m3.setTarget(3, 8000);      /* SOFT  */
    m3.setTarget(1, 8000);      /* NONE, same speed */
    adv(m3, 150);
    uint16_t soft=m3.getPosition(3), plain=m3.getPosition(1);
    ok("a soft-eased move launches more gently", soft < plain,
       numf("soft %ld", (long)soft));
    adv(m3, 5000);
    ok("both still land exactly on target", m3.getPosition(3)==8000 && m3.getPosition(1)==8000);
  }

  printf("\n==== the position never leaves the calibrated range ====\n");
  {
    /* Regression, 2026-08-10. Only the TARGET used to be clamped, so a
       reversal with residual velocity — or an overshoot-eased move aimed
       past its target — could integrate the position a little outside
       [min,max]. Those endpoints are exactly what stop a panel binding
       against the shell, so "a little" is not acceptable. */
    MaestroPCA m4(B,1,TABLE,NCH,SEQ,5); m4.begin();
    uint16_t lo = 65535, hi = 0;
    const uint8_t WATCH[] = { 1, 2, 3 };            /* none, overshoot, soft */
    for(int round = 0; round < 24; round++){
      uint16_t t = (round & 1) ? 4000 : 8000;
      for(uint8_t k = 0; k < 3; k++) m4.setTarget(WATCH[k], t);
      /* the dwell walks, so reversals happen at every phase of the move —
         early with speed still in it, and late right on an endpoint */
      int dwell = 120 + (round % 12) * 130;
      for(int i = 0; i < dwell; i += 10){
        __fakeMillis += 10; m4.update();
        for(uint8_t k = 0; k < 3; k++){
          uint16_t q = m4.getPosition(WATCH[k]);
          if(q < lo) lo = q;
          if(q > hi) hi = q;
        }
      }
    }
    ok("no channel ever read below its minimum", lo >= 4000, numf("lowest %ld", (long)lo));
    ok("no channel ever read above its maximum", hi <= 8000, numf("highest %ld", (long)hi));
    adv(m4, 4000);
    ok("and they still settle exactly on target",
       m4.getPosition(1)==4000 && m4.getPosition(2)==4000 && m4.getPosition(3)==4000);
  }

  printf("\n==== the output is an interface, not a PCA9685 ====\n");
  {
    /* The point of MpcaOutput: an ESP32 or Teensy driving pins directly is a
       different SUBCLASS, not a different engine. This double is what such a
       backend looks like — microsecond resolution, no board concept — and the
       whole library drives it with no idea it is not a PCA9685. */
    struct DirectPins : public MpcaOutput {
      uint16_t last[NCH];
      int writes, begins;
      uint32_t osc; float hz;
      DirectPins() : writes(0), begins(0), osc(0), hz(0) {
        for(int i=0;i<NCH;i++) last[i] = 0xFFFF;
      }
      void begin(uint32_t oscillatorHz, float servoHz) override {
        begins++; osc = oscillatorHz; hz = servoHz;
      }
      /* a board with real hardware timers has no 4.88 µs quantisation to
         dedupe against, so the µs IS the code */
      uint16_t code(uint8_t board, uint8_t pin, uint16_t qus) const override {
        (void)board; (void)pin; return qus / 4;
      }
      void writeCode(uint8_t board, uint8_t pin, uint16_t us) override {
        (void)board; if(pin < NCH){ last[pin] = us; writes++; }
      }
      void off(uint8_t board, uint8_t pin) override {
        (void)board; if(pin < NCH){ last[pin] = 0; writes++; }
      }
    };
    DirectPins pins;
    MaestroPCA m5(pins, TABLE, NCH, SEQ, 5);
    m5.begin(25000000UL, 50.0f);
    ok("begin() reaches the backend", pins.begins == 1);
    ok("  and passes the pulse rate through", pins.hz == 50.0f);
    /* channel 1 homes to 6000 quarter-µs = 1500 µs */
    ok("homing writes microseconds, not PCA9685 ticks", pins.last[1] == 1500,
       numf("wrote %ld", (long)pins.last[1]));

    m5.setTarget(1, 8000);
    adv(m5, 3000);
    ok("a move lands exactly on target through the interface", pins.last[1] == 2000,
       numf("wrote %ld", (long)pins.last[1]));

    /* the dedupe is the backend's business: identical codes must not
       reach the wire twice, or a 100 Hz engine floods whatever bus it has */
    int before = pins.writes;
    adv(m5, 500);
    ok("a settled channel stops writing", pins.writes == before);

    m5.restartScript(0);
    adv(m5, 1200);
    ok("sequences run against it unchanged", pins.last[0] > 0 && pins.last[1] > 0);
    m5.setTarget(1, 0);
    ok("and pulses-off reaches it too", pins.last[1] == 0);
  }

  printf("\n==== old headers still work (fields appended, not inserted) ====\n");
  {
    /* a table written before releaseMs/ease existed: 7 initialisers */
    static const MpcaChannelDef OLD[2] PROGMEM = {
      { 0,0, 4000, 8000, 6000, 40, 0 },
      { 0,1, 4000, 8000,    0,  0, 0 }
    };
    static const uint16_t S[] PROGMEM = { 200, 7000, 7000 };
    static const MpcaSeqDef SS[1] PROGMEM = { { S, 1 } };     /* no flags either */
    MaestroPCA m(B,1,OLD,2,SS,1); m.begin();
    m.restartScript(0);
    adv(m, 3000);
    ok("an older channel table defaults to hold-forever and no easing",
       m.getPosition(0) == 7000 && !m.isReleased(0));
    ok("a sequence with no flags word plays once and stops", !m.scriptRunning());
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
