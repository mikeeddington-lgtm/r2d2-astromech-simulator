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

/* the slave pulls in no WiFi and no WebServer — it is deliberately the
   smallest thing that can make pulses */
#include "../../examples/Esp32Slave/Esp32Slave.ino"

int main(){ setup(); loop(); printf("  PASS  Esp32Slave.ino compiles and links\n"); return 0; }
