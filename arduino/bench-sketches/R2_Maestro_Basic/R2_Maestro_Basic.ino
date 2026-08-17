/* =====================================================================
   BACK TO BASICS  —  Pololu's own Basic example, unchanged in substance.

   This is deliberately as close to
     https://github.com/pololu/maestro-arduino  examples/Basic
   as it can be while still driving YOUR channel between YOUR endpoints.
   Nothing else. No controller, no USB Host Shield, no Sabertooth, no
   Syren, no audio player, no I2C, no Servo library, no scripts.

   If this does not move PP5, nothing built on top of it ever will, and
   you can take that to Pololu as a clean reproduction: their example
   sketch, their library, their recommended settings.

   ---------------------------------------------------------------------
   MAESTRO SETTINGS  (Serial Settings tab -> then click Apply Settings)
     Serial mode : UART, fixed baud rate
     Baud rate   : 9600
     CRC         : disabled
   Yours already reads like this. Apply Settings must have been clicked.

   ---------------------------------------------------------------------
   WIRING  — three things, and only three

     Arduino TX  ->  Maestro RX      (TX to RX, they cross over)
     Arduino GND ->  Maestro GND
     Maestro needs servo power, and logic power (the VSRV=VIN jumper
     links them so one supply does both)

   WHICH ARDUINO PIN?  The line below picks it for you:

       #define maestroSerial SERIAL_PORT_HARDWARE_OPEN

     Mega 2560 / Mega ADK -> Serial1, so Arduino pin 18 is TX
     Leonardo / Micro     -> Serial1, so pin 1 is TX
     Uno / Nano           -> no spare hardware port, so it falls back to
                             SoftwareSerial and TX is pin 11

     The sketch prints which one it chose on the USB monitor at startup.

   ---------------------------------------------------------------------
   WATCH OUT FOR "TXIN".  The Mini Maestro has THREE serial pins: RX, TX
   and TXIN. TXIN is a daisy-chain input used only in USB Chained mode
   and does nothing at all in UART mode. Landing on it looks exactly
   like a dead board. Make sure the wire is on the pin marked RX.
   ===================================================================== */

#include <PololuMaestro.h>

#ifdef SERIAL_PORT_HARDWARE_OPEN
  #define maestroSerial SERIAL_PORT_HARDWARE_OPEN
  #define USING_HW_SERIAL 1
#else
  #include <SoftwareSerial.h>
  SoftwareSerial maestroSerial(10, 11);   // RX pin 10, TX pin 11
  #define USING_HW_SERIAL 0
#endif

/* You have the 18-channel board, so MiniMaestro. (Pololu's example ships
   with MicroMaestro uncommented — that is the 6-channel one.) */
MiniMaestro maestro(maestroSerial);

/* PP5 is channel 0. These are your own tuned endpoints, straight out of
   your settings file: 4544 = 1136 us shut, 7296 = 1824 us open. */
const uint8_t  CHANNEL = 0;
const uint16_t SHUT    = 4544;
const uint16_t OPEN    = 7296;

void setup()
{
  Serial.begin(9600);            // USB monitor. Nothing else is on it here.
  delay(600);
  Serial.println();
  Serial.println(F("=== Maestro Basic — Pololu's example, your endpoints ==="));
#if USING_HW_SERIAL
  Serial.println(F("Using a HARDWARE serial port (SERIAL_PORT_HARDWARE_OPEN)."));
  Serial.println(F("  Mega 2560 / ADK : that is Serial1  -> TX is PIN 18"));
  Serial.println(F("  Leonardo / Micro: that is Serial1  -> TX is PIN 1"));
#else
  Serial.println(F("No spare hardware port, so SoftwareSerial."));
  Serial.println(F("  TX is PIN 11  ->  Maestro RX"));
#endif
  Serial.println(F("Maestro RX <- Arduino TX, and a COMMON GROUND."));
  Serial.println(F("Board must be UART / fixed 9600 / CRC off, and Applied."));
  Serial.println();

  maestroSerial.begin(9600);
}

void loop()
{
  maestro.setTarget(CHANNEL, OPEN);
  Serial.println(F("setTarget(0, 7296)   open  = 1824 us"));
  delay(2000);

  maestro.setTarget(CHANNEL, SHUT);
  Serial.println(F("setTarget(0, 4544)   shut  = 1136 us"));
  delay(2000);
}
