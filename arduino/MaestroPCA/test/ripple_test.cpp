/* What the SERVO is shown — the two back ends measured, not asserted about.
   =====================================================================
   Added v1.68.0, when Mike asked whether the ESP32 was going to have the
   same jerkiness the ramp work spent three releases on. It does not, and
   this is how that is known rather than believed.

   THE SERVO IS MODELLED HONESTLY. It samples the pin once per 20 ms frame
   and holds whatever duty was last written to it. That matters twice:
   sub-frame detail is invisible no matter how fine the output is, and a
   loop() that does not run writes nothing, so the servo holds still and
   then jumps.

   The measure is velocity-ripple CV over the moving part of the travel —
   the same one used to settle the ramp-step question in v1.66.0. Lower is
   smoother. A CV near zero is a glide; a CV above 1 means the frame-to-
   frame steps vary more than they average, which is a servo that is
   stepping rather than moving.

   Build/run:  arduino/MaestroPCA/test/run.sh
   ===================================================================== */
#include "Arduino.h"
#include "Adafruit_PWMServoDriver.h"
#include <cstdio>
#include <cstring>
#include <cmath>
#include <vector>

#define MPCA_FAKE_CORE 3
#include "esp32shim/ledcfake.h"
#define ESP_ARDUINO_VERSION_MAJOR 3
#define MPCA_TEST_LEDC 1
#include "../src/MpcaEsp32.h"

unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;
static int pass = 0, fail = 0;
static const char* numf(const char* f, double v){ static char b[8][48]; static int i=0; i=(i+1)&7;
  snprintf(b[i],48,f,v); return b[i]; }
static void ok(const char* n, bool c, const char* x=""){ c?pass++:fail++;
  printf("  %s  %s%s%s\n", c?"PASS":"FAIL", n, *x?"   ":"", x); }

static const uint8_t PINS[1] = { 13 };
static const uint16_t WAVE[] PROGMEM = { 1200, 8000, 1200, 4000 };
const MpcaSeqDef SEQ[1] PROGMEM = { { WAVE, 2, 0 } };

/* ------------------------------------------------------------ measuring */
struct Trace { double cv, worstStep, meanV; int frames, stalledFrames; };

static Trace analyse(std::vector<double>& pos){
  std::vector<double> v; double worst = 0; int held = 0;
  for(size_t i = 1; i < pos.size(); i++){
    if(pos[i] >= 1999.0 && pos[i-1] >= 1999.0) break;      /* arrived */
    double d = pos[i] - pos[i-1];
    v.push_back(d);
    if(d > worst) worst = d;
    if(d == 0.0) held++;
  }
  double sum = 0; for(double d : v) sum += d;
  double mean = v.empty() ? 0 : sum / v.size(), var = 0;
  for(double d : v) var += (d - mean) * (d - mean);
  double sd = v.empty() ? 0 : std::sqrt(var / v.size());
  return { mean ? sd / mean : 0, worst, mean / 0.020, (int)v.size(), held };
}

/* One full 4000-quarter-us throw, sampled at the servo's own 50 Hz.
   stallEvery/stallMs model a loop() that is not being called.            */
static Trace ledcRun(uint8_t speed, int stallEvery, int stallMs, int totalMs){
  mpcaFakeReset();
  MpcaChannelDef tbl[1] = { { 0,0, 4000, 8000, 6000, speed, 0, 0, MPCA_EASE_NONE } };
  MpcaLedcOutput out(PINS, 1);
  MaestroPCA m(out, tbl, 1, SEQ, 1);
  m.begin(25000000UL, 50.0f);
  m.setTarget(0, 4000);
  for(int t = 0; t < 12000; t += 10){ __fakeMillis += 10; m.update(); }
  __fakeMillis = 0; m.setTarget(0, 8000);
  std::vector<double> pos;
  for(uint32_t t = 1; t <= (uint32_t)totalMs; t++){
    __fakeMillis = t;
    bool stalled = stallEvery && (int)((t - 1) % stallEvery) < stallMs;
    if(!stalled) m.update();
    if(t % 20 == 0) pos.push_back(mpcaFakeDuty(13) * 20000.0 / 65536.0);
  }
  return analyse(pos);
}

static Trace pcaRun(uint8_t speed, int totalMs){
  __pwmCount = 0;
  MpcaChannelDef tbl[1] = { { 0,0, 4000, 8000, 6000, speed, 0, 0, MPCA_EASE_NONE } };
  Adafruit_PWMServoDriver b0(0x40);
  Adafruit_PWMServoDriver* const boards[] = { &b0 };
  MpcaPca9685Output out(boards, 1);
  MaestroPCA m(out, tbl, 1, SEQ, 1);
  m.begin(25000000UL, 50.0f);
  m.setTarget(0, 4000);
  for(int t = 0; t < 12000; t += 10){ __fakeMillis += 10; m.update(); }
  __fakeMillis = 0; __pwmCount = 0; m.setTarget(0, 8000);
  std::vector<double> pos; uint16_t last = 0;
  for(uint32_t t = 1; t <= (uint32_t)totalMs; t++){
    __fakeMillis = t; m.update();
    if(t % 20 == 0){
      for(int i = __pwmCount - 1; i >= 0; i--) if(__pwmLog[i].pin == 0){ last = __pwmLog[i].off; break; }
      pos.push_back(last * 20000.0 / 4096.0);
    }
  }
  return analyse(pos);
}

/* how long a 2400 ms two-frame routine actually takes, with one stall in it */
static int routineMs(int stallMs){
  mpcaFakeReset();
  MpcaChannelDef tbl[1] = { { 0,0, 4000, 8000, 6000, 40, 10, 0, MPCA_EASE_NONE } };
  MpcaLedcOutput out(PINS, 1);
  MaestroPCA m(out, tbl, 1, SEQ, 1);
  m.begin(25000000UL, 50.0f);
  m.setTarget(0, 4000);
  for(int t = 0; t < 12000; t += 10){ __fakeMillis += 10; m.update(); }
  __fakeMillis = 0; m.restartScript(0);
  for(uint32_t t = 1; t <= 8000; t++){
    __fakeMillis = t;
    if(!(t > 400 && t <= (uint32_t)(400 + stallMs))) m.update();
    if(!m.scriptRunning() && t > 100) return (int)t;
  }
  return -1;
}

int main(){
  printf("\n==== the same throw on both back ends, at four speeds ====\n");
  printf("     LEDC quantises at 0.305 us a count, a PCA9685 at 4.88\n\n");
  const uint8_t SPEEDS[] = { 40, 10, 4, 2 };
  Trace slowL{}, slowP{};
  for(int i = 0; i < 4; i++){
    Trace l = ledcRun(SPEEDS[i], 0, 0, 26000);
    Trace p = pcaRun(SPEEDS[i], 26000);
    printf("  a %5.1f s throw   LEDC: CV %5.3f  worst step %6.2f us  frozen frames %3d/%-3d"
           "   |   PCA9685: CV %5.3f  worst step %5.2f us  frozen frames %3d/%-3d\n",
           1000.0 / (SPEEDS[i] * 25.0),
           l.cv, l.worstStep, l.stalledFrames, l.frames,
           p.cv, p.worstStep, p.stalledFrames, p.frames);
    if(SPEEDS[i] == 4){ slowL = l; slowP = p; }
  }

  printf("\n==== the back end must not change the authored timing ====\n");
  {
    Trace l = ledcRun(40, 0, 0, 6000), p = pcaRun(40, 6000);
    ok("both back ends take the same time over the same throw",
       std::abs(l.frames - p.frames) <= 1, numf("%.0f frames apart", (double)std::abs(l.frames - p.frames)));
    ok("  and travel at the same average speed",
       std::abs(l.meanV - p.meanV) < 15.0, numf("%.1f us/s apart", std::abs(l.meanV - p.meanV)));
  }

  printf("\n==== a SLOW move is where the resolution shows up ====\n");
  {
    /* 4.88 us is bigger than the distance a 100 us/s crawl covers in one
       20 ms frame, so a PCA9685 servo stands still and then steps. This is
       the gentle panel open that gets reported as jerky. */
    ok("LEDC never freezes a frame on a 10 s throw", slowL.stalledFrames == 0,
       numf("%.0f frozen", (double)slowL.stalledFrames));
    ok("  a PCA9685 freezes more than half of them", slowP.stalledFrames > slowP.frames / 2,
       numf("%.0f frozen", (double)slowP.stalledFrames));
    ok("LEDC glides (CV below 0.4)", slowL.cv < 0.4, numf("CV %.3f", slowL.cv));
    ok("  a PCA9685 steps (CV above 0.8)", slowP.cv > 0.8, numf("CV %.3f", slowP.cv));
    ok("and LEDC's worst single frame step is the smaller",
       slowL.worstStep < slowP.worstStep,
       numf("%.2f us", slowL.worstStep));
  }

  printf("\n==== a FAST move looks the same on both — the engine dominates ====\n");
  {
    Trace l = ledcRun(40, 0, 0, 6000), p = pcaRun(40, 6000);
    printf("     (10 ms engine tick + 20 ms servo frame swamp any us quantising)\n");
    ok("neither freezes a frame", l.stalledFrames == 0 && p.stalledFrames == 0);
    ok("and the two ripple figures are within 0.1 of each other",
       std::abs(l.cv - p.cv) < 0.1, numf("%.3f apart", std::abs(l.cv - p.cv)));
  }

  printf("\n==== a blocked loop() is the ESP32's own risk ====\n");
  printf("     WiFi is OFF by default in Esp32Droid for exactly this reason:\n");
  printf("     arduino-esp32's WebServer waits up to 5000 ms for a client.\n\n");
  {
    Trace base = ledcRun(40, 0, 0, 6000);
    printf("       never blocked                CV %5.3f   worst frame step %6.2f us\n",
           base.cv, base.worstStep);
    const int PAT[][2] = { {200,20}, {200,50}, {200,120} };
    Trace worst = base;
    for(auto& s : PAT){
      Trace b = ledcRun(40, s[0], s[1], 6000);
      printf("       blocked %3d ms every %3d ms   CV %5.3f   worst frame step %6.2f us\n",
             s[1], s[0], b.cv, b.worstStep);
      worst = b;
    }
    ok("blocking the loop measurably roughens the motion",
       worst.cv > base.cv * 2.0, numf("CV %.3f vs baseline", worst.cv));
    ok("  and turns a small frame step into a lurch",
       worst.worstStep > base.worstStep * 2.0, numf("%.2f us in one 20 ms frame", worst.worstStep));
  }

  printf("\n==== update()'s 250 ms clamp — where a stall starts costing TIME ====\n");
  {
    /* update() does `if(elapsed > 250) elapsed = 250`, so a stall shorter
       than that is caught up in full and a longer one silently loses the
       difference. A routine that runs long is a routine out of step with
       its sound. Pinned here so the cliff cannot move unnoticed.          */
    int clean = routineMs(0);
    printf("     authored 2400 ms, measured %d ms with no stall\n", clean);
    for(int st : { 100, 200, 250, 400, 600 })
      printf("       one %3d ms stall  ->  %d ms  (%+d)\n", st, routineMs(st), routineMs(st) - clean);
    ok("a stall inside the clamp costs no time at all", routineMs(200) <= clean + 2,
       numf("%.0f ms", (double)routineMs(200)));
    ok("  and past it, every extra millisecond is lost 1:1",
       std::abs((routineMs(600) - clean) - 350) <= 12,
       numf("%.0f ms late", (double)(routineMs(600) - clean)));
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail ? 1 : 0;
}
