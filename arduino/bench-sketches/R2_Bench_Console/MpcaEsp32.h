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
   is how the arithmetic below is checked without an ESP32 on the desk. The
   fakes stand in for the REAL calls — ledcSetup/ledcAttachPin/ledcWrite on
   a 2.x core, ledcAttach/ledcWrite on 3.x — so the channel-and-pin
   bookkeeping is checked too, on both. What no fake can prove is whether
   the silicon then emits the pulse: UNTESTED ON HARDWARE until someone
   runs it.
   ===================================================================== */

#include "MaestroPCA.h"

#if defined(ESP32) || defined(MPCA_TEST_LEDC)

#if defined(ESP32)
  #include <Arduino.h>
#endif

/* ------------------------------------------------- WHICH LEDC API, and
   THE DISTINCTION THE FIRST VERSION OF THIS GOT WRONG.

   A GPIO NUMBER AND AN LEDC CHANNEL NUMBER ARE NOT THE SAME THING. The
   peripheral has 16 channels, numbered 0-15, and any of them can be
   pointed at any output pin. Arduino-ESP32 3.0 hid that by making every
   call pin-addressed — you name the GPIO and the core allocates a channel
   behind your back — and 2.x does not: there, YOU pick the channel and
   then attach a pin to it.

       2.x   ledcSetup(uint8_t channel, uint32_t freq, uint8_t bits)
             ledcAttachPin(uint8_t pin, uint8_t channel)
             ledcWrite(uint8_t channel, uint32_t duty)
       3.x   ledcAttach(uint8_t pin, uint32_t freq, uint8_t bits)
             ledcWrite(uint8_t pin, uint32_t duty)

   Until v1.68.0 the 2.x branch passed the GPIO where the CHANNEL belongs
   and then wrote to a third number again, so it configured channel 27 for
   a pin (there is no channel 27 — twelve of the sixteen default servo
   GPIOs are above 15 and ledcSetup simply fails on them) and then wrote
   the duty to a channel nothing had been attached to. Not one servo would
   have moved, on any pin, with no error printed anywhere.

   So the channel is now the CHANNEL INDEX — 0..count-1, which is 0..15 by
   construction because MPCA_LEDC_MAX is the silicon's channel count — and
   the pin is the GPIO. Both branches take both and use the one they mean.
   `ledc_test.cpp` runs the same assertions through BOTH branches against a
   fake peripheral that refuses an out-of-range channel and an unattached
   write, which is what makes this a checked claim rather than a comment. */
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  #define MPCA_LEDC_ATTACH(pin, idx, hz, bits)  ledcAttach((pin), (hz), (bits))
  #define MPCA_LEDC_WRITE(pin, idx, duty)       ledcWrite((pin), (duty))
#else
  #define MPCA_LEDC_ATTACH(pin, idx, hz, bits)  do{ ledcSetup((idx), (hz), (bits)); \
                                                    ledcAttachPin((pin), (idx)); }while(0)
  #define MPCA_LEDC_WRITE(pin, idx, duty)       ledcWrite((idx), (duty))
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
    for(uint8_t i = 0; i < _count; i++)
      MPCA_LEDC_ATTACH(_pins[i], i, servoHz, _bits);
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
    /* `pin` is the CHANNEL index here — the table's pin column — and
       `_pins[pin]` is the GPIO. Both go to the macro; see above. */
    MPCA_LEDC_WRITE(_pins[pin], pin, duty);
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
