/* Minimal Arduino shim so the library (and Pololu's own) compile on the
   host for tests. Not for flashing — see test/README.md. */
#ifndef ARDUINO_H_SHIM
#define ARDUINO_H_SHIM
#include <stdint.h>
#include <stddef.h>
#include <string.h>

extern unsigned long __fakeMillis;
inline unsigned long millis(){ return __fakeMillis; }
inline void delay(unsigned long ms){ __fakeMillis += ms; }
inline void pinMode(uint8_t, uint8_t){}
inline void digitalWrite(uint8_t, uint8_t){}
#define LOW 0
#define HIGH 1
#define INPUT 0
#define OUTPUT 1
#define PROGMEM
#define F(x) (x)
#define pgm_read_word(p)  (*(const uint16_t*)(p))
#define pgm_read_ptr(p)   (*(void* const*)(p))
#define memcpy_P memcpy

class Stream {
public:
  virtual ~Stream(){}
  virtual size_t write(uint8_t) = 0;
  virtual int available() = 0;
  virtual int read() = 0;
};
#endif
