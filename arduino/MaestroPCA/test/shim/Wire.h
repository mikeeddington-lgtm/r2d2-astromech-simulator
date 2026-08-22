/* Host shim: an I2C bus you can populate, so a scan can be tested.
   __wireAck lists the addresses that ACK; everything else does not. */
#ifndef WIRE_SHIM
#define WIRE_SHIM
#include <stdint.h>
extern uint8_t __wireAck[32];
extern int     __wireAckCount;
extern int     __wireProbes;          /* how many addresses were tried */

class TwoWire {
public:
  void begin(){}
  /* ESP32 picks its own SDA/SCL: Wire.begin(21, 22). Without this
     overload the PCA9685 route of Esp32Droid could not be compiled on the
     host at all — and it never had been, which is why nothing said so
     until v1.68.0 tried it. */
  void begin(int sda, int scl){ (void)sda; (void)scl; }
  void setClock(uint32_t){}
  void beginTransmission(uint8_t a){ _at = a; __wireProbes++; }
  uint8_t endTransmission(){
    for(int i=0;i<__wireAckCount;i++) if(__wireAck[i] == _at) return 0;
    return 2;                         /* NACK on address, as a real bus does */
  }
private:
  uint8_t _at = 0;
};
extern TwoWire Wire;
#endif
