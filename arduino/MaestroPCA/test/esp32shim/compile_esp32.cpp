/* Compiles examples/Esp32Droid/Esp32Droid.ino against the fake environment.
   A pass here means the sketch is syntactically sound and every method it
   calls on OUR classes exists with the arguments it passes. */
#include "esp32env.h"
#include "Adafruit_PWMServoDriver.h"
FakeWiFi WiFi;
FakeSerial Serial, Serial1;
/* the host shim's globals — the sketch never uses them (it is on LEDC),
   but MaestroPCA.cpp still carries the PCA9685 backend */
unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;

/* the .ino's own includes resolve through -I, and Arduino.h is the host
   shim the rest of the tests use */
#include "../../examples/Esp32Droid/Esp32Droid.ino"

int main(){ setup(); loop(); printf("  PASS  Esp32Droid.ino compiles and links\n"); return 0; }
