/* A stand-in for a generated sequences.h, small enough to read.
   The real thing comes out of PCA Studio; this exists so the ESP32 sketch
   can be compile-checked without dragging a 32-channel bench header into
   the test folder. Eight channels, two slots — the shapes are what matter,
   not the numbers. */
#pragma once
#include "MaestroPCA.h"

#define MPCA_CHANNELS  8
#define MPCA_SEQUENCES 2

/*  board pin    min    max   home  speed accel  release  ease */
const MpcaChannelDef MPCA_CHANNEL_TABLE[MPCA_CHANNELS] PROGMEM = {
  {  0,   0,  4000,  8000,  6000,   40,   10,       0, MPCA_EASE_NONE      },
  {  0,   1,  4000,  8000,  6000,   40,   10,    1200, MPCA_EASE_SOFT      },
  {  0,   2,  4000,  8000,     0,   40,   10,       0, MPCA_EASE_OVERSHOOT },
  {  0,   3,  4000,  8000,  6000,   40,   10,       0, MPCA_EASE_NONE      },
  {  0,   4,  4000,  8000,  6000,   40,   10,       0, MPCA_EASE_NONE      },
  {  0,   5,  4000,  8000,  6000,   40,   10,       0, MPCA_EASE_NONE      },
  {  0,   6,  4000,  8000,  6000,   40,   10,       0, MPCA_EASE_NONE      },
  {  0,   7,  4000,  8000,  6000,   40,   10,       0, MPCA_EASE_NONE      }
};

static const uint16_t MPCA_SEQ0[] PROGMEM = {
  400, 8000, 8000, 0, 0, 0, 0, 0, 0,
  400, 4000, 4000, 0, 0, 0, 0, 0, 0
};
static const uint16_t MPCA_SEQ1[] PROGMEM = {   /* ch, lo, hi, period, phase */
  4, 4000, 8000, 3000, 0
};
const MpcaSeqDef MPCA_SEQ_TABLE[MPCA_SEQUENCES] PROGMEM = {
  { MPCA_SEQ0, 2, 0 },
  { MPCA_SEQ1, 1, MPCA_SEQ_BACKGROUND | MPCA_SEQ_OSC }
};

#define MPCA_SLOT_PANELS 0
#define MPCA_SLOT_IDLE   1
