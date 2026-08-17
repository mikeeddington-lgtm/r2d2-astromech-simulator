/* Host shim: records what would have gone out over I2C. */
#ifndef ADAFRUIT_PWM_SHIM
#define ADAFRUIT_PWM_SHIM
#include <stdint.h>
struct PwmWrite { uint8_t addr, pin; uint16_t off; };
extern PwmWrite  __pwmLog[4096];
extern int       __pwmCount;

class Adafruit_PWMServoDriver {
public:
  Adafruit_PWMServoDriver(uint8_t addr=0x40):_addr(addr){}
  void begin(){}
  void setOscillatorFrequency(uint32_t){}
  void setPWMFreq(float){}
  void setPWM(uint8_t pin, uint16_t, uint16_t off){
    if(__pwmCount < 4096) __pwmLog[__pwmCount++] = { _addr, pin, off };
  }
private:
  uint8_t _addr;
};
#endif
