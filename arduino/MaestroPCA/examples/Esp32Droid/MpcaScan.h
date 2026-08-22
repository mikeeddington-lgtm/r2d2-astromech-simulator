#ifndef MPCA_SCAN_H
#define MPCA_SCAN_H
#include <stdint.h>

/* =====================================================================
   FIND THE BOARDS THAT ARE ACTUALLY THERE

   Mike, 2026-08-19: *"does the PCA sketches check for pca boards via a
   scan of all addresses as I and others may jumper them differently"*.

   They did not. Every sketch in this library assumed the boards were at
   CONSECUTIVE addresses starting at 0x40 — `pcaA(0x40)`, `pcaB(0x41)` —
   and the two that probed at all probed only those, to decide whether to
   talk to a board they had already decided existed. Bridge A1 instead of
   A0 and your board answers at 0x42: the sketch reports "board 1 not
   present", channels 16-31 silently do nothing, and nothing says that the
   board it cannot see is sitting right there on the bus.

   A PCA9685 has SIX address jumpers, A0-A5, so it can be anywhere from
   0x40 to 0x7F. Which of them you bridge is a soldering decision made
   inside a dome, and it is not the sketch's business to have an opinion
   about it. So: scan, take what is there in address order, and say the
   mapping out loud.

   ------------------------------------------------------ THE ALL-CALL
   THE ONE THING THAT MAKES A NAIVE SWEEP LIE. A PCA9685 answers the
   **All Call** address 0x70 out of the box — MODE1 powers up with ALLCALL
   set, and Adafruit's `begin()` sets it again — so a bus with a single
   chip on it ACKs at BOTH its own address and 0x70. Sweep 0x40-0x7F
   without knowing that and one board reads as two, the second of them
   being every board at once: writes meant for "board 1" would go to every
   output on the droid simultaneously. 0x71-0x73 are the sub-call
   addresses, disabled by default but excluded for the same reason.

   That is the whole of the difference between this file and four lines of
   `Wire.beginTransmission()` in each sketch, and it is why it is one file
   rather than four copies.

   ---------------------------------------------------------- THE ORDER
   Found boards map to board numbers IN ASCENDING ADDRESS ORDER: the
   lowest address found is board 0 and drives channels 0-15, the next is
   board 1, and so on. So 0x40 + 0x42 behaves exactly as 0x40 + 0x41
   does, which is what "jumper them however you like" has to mean.

   The cost of that choice, stated plainly because it is real: if a board
   drops off the bus, everything above it renumbers. That is why every
   sketch using this prints the mapping it settled on at boot, and says
   so loudly when it found fewer boards than its channel table needs.
   ===================================================================== */

static const uint8_t MPCA_ADDR_FIRST = 0x40;   /* no jumpers bridged      */
static const uint8_t MPCA_ADDR_LAST  = 0x7F;   /* A0-A5 all bridged       */

/* the addresses a PCA9685 answers that are NOT its own identity */
inline bool mpcaAddrReserved(uint8_t a){
  return a == 0x70          /* All Call — every board on the bus answers */
      || (a >= 0x71 && a <= 0x73);   /* SUBADR1-3, off by default        */
}

typedef bool (*MpcaProbeFn)(uint8_t addr);

/* Returns the TOTAL number of boards on the bus, and fills `out` with the
   first `max` of them in ascending address order. The return value can
   therefore be LARGER than `max` — that is how a caller knows it found
   more boards than its channel table has room for, which is worth saying
   out loud rather than discarding. */
inline uint8_t mpcaScanWith(MpcaProbeFn probe, uint8_t* out, uint8_t max){
  uint8_t n = 0;
  for(uint8_t a = MPCA_ADDR_FIRST; a <= MPCA_ADDR_LAST; a++){
    if(mpcaAddrReserved(a)) continue;
    if(!probe(a)) continue;
    if(n < max) out[n] = a;
    n++;
  }
  return n;
}

#ifndef MPCA_NO_WIRE
#include <Wire.h>
inline bool mpcaProbe(uint8_t addr){
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}
inline uint8_t mpcaScan(uint8_t* out, uint8_t max){
  return mpcaScanWith(mpcaProbe, out, max);
}

#include <Adafruit_PWMServoDriver.h>
/* Point the driver objects at the addresses the scan actually found.

   ORDER MATTERS AND IT IS THE ONE TRAP HERE: this must run BEFORE
   `begin()` on any of them. A driver is re-addressed by assigning a fresh
   one over it, and recent Adafruit versions allocate their I2C device
   inside `begin()` — re-addressing after that would strand the allocation
   and leave the object talking to its old address through it.

   Returns how many boards were bound, which is min(found, want). */
inline uint8_t mpcaBind(Adafruit_PWMServoDriver* const* boards, uint8_t want,
                        const uint8_t* found, uint8_t nFound){
  uint8_t n = (nFound < want) ? nFound : want;
  for(uint8_t i = 0; i < n; i++) *boards[i] = Adafruit_PWMServoDriver(found[i]);
  return n;
}
#endif  /* MPCA_NO_WIRE */

#endif
