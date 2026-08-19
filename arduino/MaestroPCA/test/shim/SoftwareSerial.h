/* Host shim: enough SoftwareSerial for MaestroReplacement to compile.
   The link's BYTES are already covered by link_test.cpp against Pololu's
   own library; what this stands in for is only the transport, so that the
   sketch that actually goes in the droid gets a compile check at all. */
#ifndef SOFTWARESERIAL_SHIM
#define SOFTWARESERIAL_SHIM
#include <stdint.h>
class SoftwareSerial {
public:
  SoftwareSerial(uint8_t, uint8_t){}
  void begin(unsigned long){}
  int  available(){ return 0; }
  int  read(){ return -1; }
  size_t write(uint8_t){ return 1; }
  size_t write(const uint8_t* , size_t n){ return n; }
  void listen(){}
};
#endif
