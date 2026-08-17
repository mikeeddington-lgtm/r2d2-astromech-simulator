/* MaestroPCA SelfTest — no controller, no receiver, no droid required.
   The PCA9685 equivalent of R2_Maestro_SelfTest: on power-up it plays
   slot 0 (a wave across four servos), waits, homes, and repeats — proof
   the board, the wiring and the sequencer engine work before anything
   else is connected.

   Wiring: PCA9685 at 0x40 on I2C (Mega: SDA 20, SCL 21), servos on
   pins 0-3, V+ from a REAL 5-6 V servo supply (never the Arduino's 5V). */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <MaestroPCA.h>
#include "sequences.h"

Adafruit_PWMServoDriver pcaA(0x40);
Adafruit_PWMServoDriver* const PCA_BOARDS[] = { &pcaA };

MaestroPCA maestro(PCA_BOARDS, 1,
                   MPCA_CHANNEL_TABLE, MPCA_CHANNELS,
                   MPCA_SEQ_TABLE, MPCA_SEQUENCES);

unsigned long nextAt = 0;
uint8_t phase = 0;

void setup(){
  Wire.begin();
  Wire.setClock(400000);        /* 400 kHz keeps 16+ channel updates cheap */
  /* If pulse widths measure off, the board's RC oscillator isn't exactly
     25 MHz — calibrate: maestro.begin(26400000UL); etc. */
  maestro.begin();
}

void loop(){
  maestro.update();             /* THE rule: call every pass, never delay() */

  unsigned long now = millis();
  if(now >= nextAt && !maestro.scriptRunning()){
    if(phase == 0){ maestro.restartScript(MPCA_SLOT_WAVE_OPEN); phase = 1; }
    else          { maestro.restartScript(MPCA_SLOT_ALL_HOME);  phase = 0; }
    nextAt = now + 3000;
  }
}
