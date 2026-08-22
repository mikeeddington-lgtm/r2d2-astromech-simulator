/* Compiles examples/Esp32Droid/Esp32Droid.ino against the fake environment,
   FROM ITS OWN FOLDER — its Config.h, its sequences.h and its own copies of
   the library, with no -I at ../src. That is the route a builder takes: a
   pack unzipped into the sketchbook with nothing installed.

   A pass means the sketch is syntactically sound and every method it calls
   on OUR classes exists with the arguments it passes. run.sh builds it on
   both arduino-esp32 cores, because they address LEDC differently. */
#include "esp32env.h"
#include "Adafruit_PWMServoDriver.h"
FakeWiFi WiFi;
FakeSerial Serial, Serial1;
/* the host shim's globals — the sketch never uses them (it is on LEDC),
   but MaestroPCA.cpp still carries the PCA9685 backend */
unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;

/* an I2C bus with three PCA9685s on it, for the MPCA_DIRECT_PINS 0 route.
   That route had never been compiled on the host at all before v1.68.0 —
   the shim's Wire had no two-argument begin(), which is how an ESP32 names
   its SDA/SCL, so it could not have been. */
#include "Wire.h"
uint8_t  __wireAck[32] = {0x40, 0x41, 0x42};
int      __wireAckCount = 3;
int      __wireProbes   = 0;
TwoWire  Wire;

/* THE PATH IS A -D, NOT A LITERAL, and that is not tidiness.
   A QUOTED include searches the INCLUDING FILE'S OWN DIRECTORY FIRST. So
   when this file named the sketch by a relative path, the .ino's own
   `#include "Config.h"` resolved against the real sketch folder and every
   -I pointing at a modified COPY was silently ignored — three variations
   of Config.h all compiled the same original and all "passed". Naming the
   copy here is what makes a copy testable at all.                        */
#ifndef ESP32_INO
#define ESP32_INO "../../examples/Esp32Droid/Esp32Droid.ino"
#endif
#include ESP32_INO

int main(){ setup(); loop(); printf("  PASS  Esp32Droid.ino compiles and links\n"); return 0; }
