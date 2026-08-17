#pragma once
/* =====================================================================
   MpcaLedcOutput — drive servos straight off ESP32 pins, no expander

   The ESP32 has 16 hardware PWM channels (LEDC: 8 high-speed, 8 low-speed,
   across 4 timers). At 50 Hz it can run them at 16-bit resolution, which
   is about 0.3 µs a step — BETTER than a PCA9685's 4.88 µs and close to a
   Maestro's 0.25 µs. So for a rig of sixteen servos or fewer there is no
   reason for an I2C expander at all: no address jumpers, no bus, no second
   board.

   Sixteen is a hard ceiling, not a soft one — it is how many LEDC channels
   the silicon has. Past that, use MpcaPca9685Output as before; the ESP32 is
   then just a faster host with a radio, which is still the main reason to
   pick one.

   The channel table's `pin` field indexes the array you pass in, so
   `pins[3]` is the GPIO that channel 3 comes out of. `board` must be 0 —
   there is only one "board" here, and a table generated for two PCA9685s
   would be quietly driving nothing above channel 15, so it is checked.

   Nothing else in the library changes. Same sequences.h, same editor, same
   restartScript(n), same kinematics — this is one MpcaOutput subclass.

   ------------------------------------------------------------- testing
   Defining MPCA_TEST_LEDC compiles this for the HOST against fakes, which
   is how the arithmetic below is checked without an ESP32 on the desk.
   The peripheral calls themselves cannot be proven that way and are marked
   UNTESTED ON HARDWARE until someone runs it.
   ===================================================================== */

#include "MaestroPCA.h"

#if defined(ESP32) || defined(MPCA_TEST_LEDC)

#if defined(ESP32)
  #include <Arduino.h>
  /* Arduino-ESP32 3.0 merged ledcSetup + ledcAttachPin into ledcAttach and
     changed every `channel` argument to `pin`. Both spellings are alive in
     the wild — people's IDEs are on whichever core they installed — so this
     compiles on either rather than making the version somebody else's
     problem. */
  #if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    #define MPCA_LEDC_ATTACH(pin, hz, bits)  ledcAttach((pin), (hz), (bits))
    #define MPCA_LEDC_WRITE(pin, idx, duty)  ledcWrite((pin), (duty))
  #else
    #define MPCA_LEDC_ATTACH(pin, hz, bits)  do{ ledcSetup((pin), (hz), (bits)); \
                                                 ledcAttachPin((pin), (pin)); }while(0)
    #define MPCA_LEDC_WRITE(pin, idx, duty)  ledcWrite((idx), (duty))
  #endif
#endif

#ifndef MPCA_LEDC_MAX
#define MPCA_LEDC_MAX 16          /* the silicon's channel count */
#endif

class MpcaLedcOutput : public MpcaOutput {
public:
  /* pins[i] is the GPIO for CHANNEL i — the `pin` column of the table. */
  MpcaLedcOutput(const uint8_t* pins, uint8_t count)
    : _pins(pins),
      _count(count > MPCA_LEDC_MAX ? MPCA_LEDC_MAX : count),
      _bits(16), _full(65536UL), _usPerPeriod(20000UL), _over(count > MPCA_LEDC_MAX) {}

  void begin(uint32_t oscillatorHz, float servoHz) override {
    (void)oscillatorHz;                 /* an RC trim on a chip we are not using */
    if(servoHz < 20.0f) servoHz = 20.0f;
    _usPerPeriod = (uint32_t)(1000000.0f / servoHz + 0.5f);
    /* LEDC's duty resolution is bounded by its 80 MHz clock: freq × 2^bits
       must fit. 16 bits is good to about 1220 Hz, which covers every servo
       anyone drives; step down rather than silently misbehave above that. */
    _bits = 16;
    while(_bits > 8 && (float)(1UL << _bits) * servoHz > 80000000.0f) _bits--;
    _full = 1UL << _bits;
    for(uint8_t i = 0; i < _count; i++){
#if defined(ESP32)
      MPCA_LEDC_ATTACH(_pins[i], servoHz, _bits);
#endif
    }
  }

  /* quarter-µs → LEDC duty counts. At 50 Hz / 16 bits one count is
     20000 / 65536 = 0.305 µs, so the engine's dedupe on this value still
     spares work without ever quantising a move away. */
  uint16_t code(uint8_t board, uint8_t pin, uint16_t qus) const override {
    (void)board; (void)pin;
    uint32_t denom = _usPerPeriod * 4UL;
    return (uint16_t)(((uint32_t)qus * _full + denom / 2) / denom);
  }

  void writeCode(uint8_t board, uint8_t pin, uint16_t duty) override {
    if(board != 0 || pin >= _count) return;
#if defined(ESP32)
    MPCA_LEDC_WRITE(_pins[pin], pin, duty);
#else
    mpcaLedcFake(_pins[pin], pin, duty);
#endif
  }

  /* duty 0 is genuinely no pulse — the servo goes limp, which is what
     `homemode Off` and releaseMs both want. No special case needed. */
  void off(uint8_t board, uint8_t pin) override { writeCode(board, pin, 0); }

  uint8_t  channels() const { return _count; }
  uint8_t  bits() const     { return _bits; }
  /* true if the table asks for more channels than the silicon has — the
     sketch prints this rather than driving a third of the droid in silence */
  bool     overflowed() const { return _over; }

private:
  const uint8_t* _pins;
  uint8_t  _count;
  uint8_t  _bits;
  uint32_t _full;
  uint32_t _usPerPeriod;
  bool     _over;
};

#endif  /* ESP32 || MPCA_TEST_LEDC */
