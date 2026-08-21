/* =====================================================================
   STARTER DATA for R2_Bench_Console on the PCA9685 / ESP32 back ends.

   *** THIS IS A PLACEHOLDER. REPLACE IT. ***

   The real file comes out of the R2-D2 Simulator: Maestro tab -> Export
   PCA9685 header. That copies YOUR calibrated channel table through
   verbatim and writes your sequences alongside it, so the console, the
   sequencer and the droid all agree about where a channel's endpoints
   are. PCA Studio exports the same file.

   What is here instead is eight deliberately conservative generic
   channels (1250-1750 us) on one board, and three slots, so the sketch
   compiles and something moves before you have exported anything.

   Not needed at all on the BT_MAESTRO back end - a real Maestro holds
   its own table and its own scripts.

   Targets are QUARTER-MICROSECONDS: 6000 = 1500 us.
   ===================================================================== */
#pragma once
#include "MaestroPCA.h"

#define MPCA_CHANNELS  8
#define MPCA_SEQUENCES 3

/* board pin   min   max  home speed accel   releaseMs ease
   speed 120 / accel 100 is the project's starter pair: a ~429 ms throw
   across a 4000-quarter-us span, with ~96 ms easing at each end. ZERO
   means UNLIMITED on this engine, on a Maestro and on a PCA_Bridge
   alike, and unlimited is what makes a rack of servos lunge and judder. */
const MpcaChannelDef MPCA_CHANNEL_TABLE[MPCA_CHANNELS] PROGMEM = {
  { 0, 0, 5000, 7000, 0, 120, 100 },   /* ch0  - home 0 = limp at boot */
  { 0, 1, 5000, 7000, 0, 120, 100 },   /* ch1 */
  { 0, 2, 5000, 7000, 0, 120, 100 },   /* ch2 */
  { 0, 3, 5000, 7000, 0, 120, 100 },   /* ch3 */
  { 0, 4, 5000, 7000, 0, 120, 100 },   /* ch4 */
  { 0, 5, 5000, 7000, 0, 120, 100 },   /* ch5 */
  { 0, 6, 5000, 7000, 0, 120, 100 },   /* ch6 */
  { 0, 7, 5000, 7000, 0, 120, 100 },   /* ch7 */
};

/* Slot 0 "Wave open" - stride is 1 duration + 8 targets per frame.
   A target of 0 means "this frame does not drive this channel", which is
   the Maestro sequencer's convention and NOT "go to zero". The first
   frame drives EVERY channel on purpose: nothing can know where a servo
   with homemode Off is until something tells it. */
static const uint16_t MPCA_SEQ0[] PROGMEM = {
/* dur    ch0   ch1   ch2   ch3   ch4   ch5   ch6   ch7 */
   400,  7000, 5000, 5000, 5000, 5000, 5000, 5000, 5000,
   300,     0, 7000,    0,    0,    0,    0,    0,    0,
   300,     0,    0, 7000,    0,    0,    0,    0,    0,
   300,     0,    0,    0, 7000,    0,    0,    0,    0,
   300,     0,    0,    0,    0, 7000,    0,    0,    0,
   300,     0,    0,    0,    0,    0, 7000,    0,    0,
   300,     0,    0,    0,    0,    0,    0, 7000,    0,
   600,     0,    0,    0,    0,    0,    0,    0, 7000,
   600,  5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000,
};

/* Slot 1 "All home" - one frame, everything shut. */
static const uint16_t MPCA_SEQ1[] PROGMEM = {
   600,  5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000,
};

/* Slot 2 "All open" - the other half of the pair. */
static const uint16_t MPCA_SEQ2[] PROGMEM = {
   600,  7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000,
};

const MpcaSeqDef MPCA_SEQ_TABLE[MPCA_SEQUENCES] PROGMEM = {
  { MPCA_SEQ0, 9 },   /* 0: Wave open */
  { MPCA_SEQ1, 1 },   /* 1: All home  */
  { MPCA_SEQ2, 1 },   /* 2: All open  */
};
