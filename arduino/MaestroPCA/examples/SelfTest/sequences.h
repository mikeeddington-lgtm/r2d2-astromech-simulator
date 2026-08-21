/* Demo data for the MaestroPCA SelfTest example — FOUR GENERIC CHANNELS.
   These endpoints are deliberately conservative placeholders (1250–1750 µs).
   Real data comes from the R2-D2 Simulator: Maestro tab → Export PCA9685
   header, which copies YOUR calibrated channel table through verbatim.

   Layout: one PCA9685 at 0x40, servos on pins 0..3. */
#pragma once
#include "MaestroPCA.h"

#define MPCA_CHANNELS  4
#define MPCA_SEQUENCES 2

/*  board pin   min   max  home  speed accel        (quarter-microseconds) */
const MpcaChannelDef MPCA_CHANNEL_TABLE[MPCA_CHANNELS] PROGMEM = {
  { 0, 0, 5000, 7000, 0, 80, 10 },   /* ch0 — homemode Off (limp at boot) */
  { 0, 1, 5000, 7000, 0, 80, 10 },   /* ch1 */
  { 0, 2, 5000, 7000, 0, 80, 10 },   /* ch2 */
  { 0, 3, 5000, 7000, 0, 80, 10 },   /* ch3 */
};

/* Slot 0 "Wave open": channels open one after another, then all close.
   Stride per frame = 1 duration + 4 targets. 0 = channel not driven. */
static const uint16_t MPCA_SEQ0[] PROGMEM = {
  /* dur   ch0   ch1   ch2   ch3 */
   400,   7000, 5000, 5000, 5000,   /* frame 0 writes EVERY channel (homemode Off doctrine) */
   400,   0,    7000, 0,    0,
   400,   0,    0,    7000, 0,
   600,   0,    0,    0,    7000,
   500,   5000, 5000, 5000, 5000,
};

/* Slot 1 "All home": one frame, everything to the closed pose. */
static const uint16_t MPCA_SEQ1[] PROGMEM = {
   500,   5000, 5000, 5000, 5000,
};

const MpcaSeqDef MPCA_SEQ_TABLE[MPCA_SEQUENCES] PROGMEM = {
  { MPCA_SEQ0, 5 },   /* 0: Wave open  */
  { MPCA_SEQ1, 1 },   /* 1: All home   */
};

#define MPCA_SLOT_WAVE_OPEN 0
#define MPCA_SLOT_ALL_HOME  1
