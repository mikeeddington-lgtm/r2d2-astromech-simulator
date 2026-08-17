#ifndef MAESTRO_LINK_H
#define MAESTRO_LINK_H
/* =====================================================================
   MaestroLink — makes a MaestroPCA answer the Pololu Maestro's own
   serial protocol, so a microcontroller running this IS a Maestro as
   far as the host sketch is concerned.

   The point: on a Padawan droid the host sends `maestro.restartScript(2)`
   — three bytes — and gets on with driving, sound and controller polling.
   A SEPARATE processor then runs the whole panel choreography. That
   isolation is the thing a Maestro actually sells you, and no amount of
   careful single-board code reproduces it: if the host stalls on
   Usb.Task() or a delay(), a single-board animation stalls with it.

   So: put this + MaestroPCA + a PCA9685 on a £4 Nano, wire the host's
   TX to its RX, and the host sketch needs NO CHANGES AT ALL — same
   PololuMaestro library, same MiniMaestro object, same slot numbers.

   Command bytes verified against Pololu's own maestro-arduino library
   (PololuMaestro.h), not from documentation:
     0x84 set target        0x87 set speed      0x89 set acceleration
     0x8A set PWM           0x90 get position   0x93 get moving state
     0x9F set multi target  0xA1 get errors     0xA2 go home
     0xA4 stop script       0xA7 restart script at subroutine
     0xA8 restart w/ param  0xAE get script status
     0xAA Pololu-protocol header    0xFF Mini SSC
   Data bytes are 7-bit; 14-bit values are low-7 then high-7. With the
   library's default deviceNumber (255) the host uses the COMPACT
   protocol — a bare command byte, no address — which is what a stock
   Padawan sketch emits.

   TRANSPORT-AGNOSTIC ON PURPOSE. feed() takes one byte and hands back
   any reply, so the byte source can be a UART today and WiFi/BLE on an
   ESP32 tomorrow without touching this file.
   ===================================================================== */

#include <stdint.h>

class MaestroPCA;

class MaestroLink {
public:
  /* deviceNumber only matters if the host uses the Pololu protocol
     (0xAA header). 255 = answer any address. CRC off matches the
     Maestro's factory default and every stock Padawan sketch. */
  MaestroLink(MaestroPCA& engine, uint8_t deviceNumber = 255, bool crcEnabled = false);

  /* Feed one received byte. Returns the number of REPLY bytes written
     into out[] (0, 1 or 2) — send those straight back to the host. */
  uint8_t feed(uint8_t b, uint8_t* out);

  void reset();                                    /* abandon a part-received command */

  /* --- diagnostics: the thing a real Maestro cannot tell you ---
     A Maestro that ignores serial looks identical to a dead droid.
     These let the sketch print "restartScript(2) received", which turns
     a silent fault into an obvious one. */
  uint8_t  lastCommand()  const { return _lastCmd; }
  uint8_t  lastArg()      const { return _lastArg; }
  uint32_t commandCount() const { return _count; }
  uint32_t badCount()     const { return _bad; }   /* CRC failures + unknown commands */

private:
  enum State : uint8_t { S_IDLE, S_POL_DEV, S_POL_CMD, S_ARGS, S_CRC };

  MaestroPCA& _engine;
  uint8_t  _deviceNumber;
  bool     _crcEnabled;

  State    _state;
  uint8_t  _cmd;
  uint8_t  _need;        /* arg bytes still expected (0xFF = not yet known) */
  uint8_t  _got;
  uint8_t  _arg[52];     /* set-multiple-targets is the long one: 2 + 24*2 */
  uint8_t  _crc;

  uint8_t  _lastCmd, _lastArg;
  uint32_t _count, _bad;

  void     startByte(uint8_t b);
  void     begin(uint8_t cmd);
  uint8_t  execute(uint8_t* out);
  uint16_t val14(uint8_t i) const { return (uint16_t)_arg[i] | ((uint16_t)_arg[i+1] << 7); }
  void     crcAdd(uint8_t b);
  static uint8_t argsFor(uint8_t cmd);
};

#endif
