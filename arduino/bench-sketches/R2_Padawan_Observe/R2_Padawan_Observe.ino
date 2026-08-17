//Maestro_Mega_DYSV5W  —  PURE OBSERVATION BUILD
//by Steve Baudains 2025, edits by Steven Sloan, Padawan360 by Dan Kraus
//
// ============================================================================
//  THIS IS YOUR SKETCH. I HAVE CHANGED NO BEHAVIOUR.
//
//  Everything runs exactly as it does in your build, including the things I
//  said were wrong. They are deliberately still here:
//
//    - the d-pad still uses getButtonPress, so a held direction still
//      restarts the script every couple of milliseconds
//    - the volume buttons are still inverted
//    - isLeftStickDrive still assigns L3/R3 in both branches
//    - bare X still plays random(32,52)
//    - the automation block still has delay(750)
//    - while (!Serial); is still there
//    - the DY-SV5W player is still on Serial
//
//  The ONLY additions are Serial.print calls, a counter, and keyboard
//  commands. Nothing in the control path was touched.
//
//  THE ONE UNAVOIDABLE CHANGE: Serial.begin(115200) is now called, where
//  yours has it commented out. You cannot observe a serial port without
//  opening it. Because DY::Player is also on Serial, you will see occasional
//  binary junk in the monitor - that is your sketch talking to the audio
//  module, and it is proof those calls are happening.
//
//  HOW THE COUNTER WORKS: restartScript calls are COUNTED, not printed at
//  the call site. Printing inside the loop would slow it down and mask the
//  very thing we are looking for. The per-second status line reports how
//  many fired in the last second. Tap R2+UP once: if slot 0 reports 300+,
//  that is the restart storm, measured on your own hardware.
// ============================================================================

// 9600, NOT 115200 — and this matters.
//
// DY::Player defaults to Serial, and player.begin() calls Serial.begin(9600).
// Open the monitor at 115200 and the moment player.begin() runs it drops the
// port to 9600 mid-sentence: the line is chopped off, you get one corrupt
// byte, and everything after it is invisible. It looks exactly like a hang.
// It is not — the sketch is still running, just talking at a baud you are no
// longer listening on.
//
// Matching it from the start means player.begin() changes nothing and the
// whole run stays readable. SET YOUR SERIAL MONITOR TO 9600.
#define OBS_BAUD 9600

#define FOOT_CONTROLLER 1  //0 = Sabertooth Serial or 1 =individual ESC for PWM (HUB) motors
#if FOOT_CONTROLLER == 1
#define leftFootPin 44
#define rightFootPin 45
#define leftDirection 1
#define rightDirection 1
int YDist = 0;
int XDist = 0;
int leftFoot = 90;
int rightFoot = 90;
int CalibrationSpeed = 127;
bool CalibrationMode = false;
#endif

const byte DRIVESPEED1 = 30;
const byte DRIVESPEED2 = 38;
const byte DRIVESPEED3 = 50;
byte drivespeed = DRIVESPEED1;
const float TURNSPEED = 40;
boolean isLeftStickDrive = true;
const byte DOMESPEED = 127;
const byte RAMPING = 2;
unsigned long RampingMillis = 0;
int RampingDeadzoneDelay = 200;
const byte DOMEDEADZONERANGE = 20;
const byte DRIVEDEADZONERANGE = 22;
const int SABERTOOTHBAUDRATE = 9600;
const int DOMEBAUDRATE = 9600;
byte vol = 25;
byte automateDelay = random(5, 20);
int turnDirection = 20;

#define EXTINGUISHERPIN 3
#include <SoftwareSerial.h>
#include <Sabertooth.h>
#include <DYPlayerArduino.h>
#include <Wire.h>
#include <XBOXRECV.h>
#include <Servo.h>
#include <Adafruit_PWMServoDriver.h>
#include <PololuMaestro.h>

MiniMaestro maestro(Serial1);  //hardware serial

#if FOOT_CONTROLLER == 0
Sabertooth Sabertooth2x(128, Serial1);
#endif
Sabertooth Syren10(128, Serial2);

#ifdef dobogusinclude
#include <spi4teensy3.h>
#endif

boolean isDriveEnabled = false;
boolean isInAutomationMode = false;
unsigned long automateMillis = 0;
byte automateAction = 0;

int driveThrottle = 0;
int throttleStickValue = 0;
#if FOOT_CONTROLLER == 1
int throttleStickValueraw = 0;
#endif
int domeThrottle = 0;
int turnThrottle = 0;
#if FOOT_CONTROLLER == 1
int turnThrottleraw = 0;
#endif

boolean firstLoadOnConnect = false;

AnalogHatEnum throttleAxis;
AnalogHatEnum turnAxis;
AnalogHatEnum domeAxis;
ButtonEnum speedSelectButton;
ButtonEnum hpLightToggleButton;
boolean isHPOn = false;

DY::Player player;      // still on Serial, exactly as in your build
USB Usb;
XBOXRECV Xbox(&Usb);

#if FOOT_CONTROLLER == 1
Servo leftFootSignal;
Servo rightFootSignal;
#endif

void triggerI2C(byte deviceID, byte eventID);
void stopFeet();
#if FOOT_CONTROLLER == 1
void mixHubDrive(int stickX, int stickY, byte maxDriveSpeed);
#endif

// ======================= OBSERVATION ONLY - no control path ================
const uint8_t  PP5_CHANNEL = 0;
const uint16_t PP5_OPEN    = 7296;   // from your .mstr
const uint16_t PP5_SHUT    = 4544;

volatile unsigned long obsSlot[8]     = {0,0,0,0,0,0,0,0};
unsigned long          obsSlotPrev[8] = {0,0,0,0,0,0,0,0};
unsigned long obsLoops = 0, obsLastStatus = 0;
boolean       obsWasConnected = false;

void obsLoopback();
void obsCarrier();

void obsHelp() {
  Serial.println();
  Serial.println(F("---- keyboard commands (no controller needed) ----"));
  Serial.println(F("  0-7  restartScript(n)  fire that Maestro subroutine"));
  Serial.println(F("  o    PP5 OPEN          setTarget - bypasses the script"));
  Serial.println(F("  c    PP5 SHUT          setTarget - bypasses the script"));
  Serial.println(F("  f    flap PP5 3 times  setTarget - bypasses the script"));
  Serial.println(F("  s    stopScript"));
  Serial.println(F("  l    LOOPBACK TEST     jumper pin 18 -> pin 19 first"));
  Serial.println(F("  t    transmit 10s      put an LED on pin 18 and watch"));
  Serial.println(F("  ?    this help"));
  Serial.println(F("-------------------------------------------------"));
  Serial.println(F("o/c move PP5 but 0-7 do nothing  -> script not on the board,"));
  Serial.println(F("                                    press APPLY SETTINGS"));
  Serial.println(F("nothing moves PP5 at all         -> wire, ground, servo power"));
  Serial.println(F("                                    or the board itself"));
  Serial.println();
}

void obsCommands() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch >= '0' && ch <= '7') {
      maestro.restartScript(ch - '0');
      Serial.print(F("[key] restartScript(")); Serial.print(ch - '0'); Serial.println(F(")"));
    } else if (ch == 'o' || ch == 'O') {
      maestro.setTarget(PP5_CHANNEL, PP5_OPEN);
      Serial.println(F("[key] setTarget(ch0, 7296)  PP5 OPEN - no script involved"));
    } else if (ch == 'c' || ch == 'C') {
      maestro.setTarget(PP5_CHANNEL, PP5_SHUT);
      Serial.println(F("[key] setTarget(ch0, 4544)  PP5 SHUT - no script involved"));
    } else if (ch == 'f' || ch == 'F') {
      Serial.println(F("[key] flapping PP5 three times..."));
      for (uint8_t i = 0; i < 3; i++) {
        maestro.setTarget(PP5_CHANNEL, PP5_OPEN); delay(1500);
        maestro.setTarget(PP5_CHANNEL, PP5_SHUT); delay(1500);
      }
      Serial.println(F("[key] done"));
    } else if (ch == 's' || ch == 'S') {
      maestro.stopScript();
      Serial.println(F("[key] stopScript()"));
    } else if (ch == 'l' || ch == 'L') {
      obsLoopback();
    } else if (ch == 't' || ch == 'T') {
      obsCarrier();
    } else if (ch == '?') obsHelp();
  }
}

// ===========================================================================
//  SERIAL1 LOOPBACK  —  proves the Mega's UART and pin 18 with the Maestro
//  entirely out of the picture.
//
//  Jumper Mega pin 18 (TX1) straight to pin 19 (RX1). The sketch writes a
//  byte pattern out of TX1 and reads it back on RX1. If those bytes come
//  home, the UART is configured, the port is open, the pin is alive and the
//  Mega is genuinely transmitting - so anything still broken is on the wire
//  or the Maestro, and no amount of sketch editing will touch it.
//
//  Pull the Maestro's wire off pin 18 first, so a half-finished command
//  cannot leave its parser in a strange state.
// ===========================================================================
void obsLoopback() {
  const uint8_t pattern[] = {0x55, 0xAA, 0x00, 0xFF, 0x0F, 0xF0, 'R', '2'};
  const uint8_t n = sizeof(pattern);
  uint8_t got[sizeof(pattern)];
  uint8_t nGot = 0;

  Serial.println();
  Serial.println(F("---- Serial1 LOOPBACK TEST ----"));
  Serial.println(F("Jumper Mega pin 18 (TX1) -> pin 19 (RX1)."));
  Serial.println(F("Take the Maestro's wire off pin 18 first."));
  Serial.println(F("Sending 8 bytes at 9600..."));

  while (Serial1.available()) Serial1.read();        // drain anything stale

  for (uint8_t i = 0; i < n; i++) Serial1.write(pattern[i]);
  Serial1.flush();                                   // wait for TX to finish

  unsigned long t0 = millis();
  while (nGot < n && (millis() - t0) < 500) {
    if (Serial1.available()) got[nGot++] = Serial1.read();
  }

  boolean allMatch = (nGot == n);
  for (uint8_t i = 0; i < n; i++) {
    Serial.print(F("   sent 0x"));
    if (pattern[i] < 0x10) Serial.print('0');
    Serial.print(pattern[i], HEX);
    Serial.print(F("    got "));
    if (i < nGot) {
      Serial.print(F("0x"));
      if (got[i] < 0x10) Serial.print('0');
      Serial.print(got[i], HEX);
      if (got[i] != pattern[i]) { Serial.print(F("   MISMATCH")); allMatch = false; }
    } else {
      Serial.print(F("--          NOTHING"));
    }
    Serial.println();
  }

  Serial.println();
  if (allMatch) {
    Serial.println(F("   *** PASS *** all 8 bytes came back."));
    Serial.println(F("   The UART, the port and pin 18 are all good, and the Mega"));
    Serial.println(F("   really is transmitting. Whatever is wrong is downstream:"));
    Serial.println(F("     - the wire from pin 18 to the Maestro's RX"));
    Serial.println(F("     - the common ground"));
    Serial.println(F("     - the Maestro's Serial Settings mode (a USB mode IGNORES"));
    Serial.println(F("       the RX pin completely - it must be UART, fixed 9600)"));
    Serial.println(F("     - the Maestro's logic power / VSRV=VIN jumper"));
  } else if (nGot == 0) {
    Serial.println(F("   *** NOTHING CAME BACK ***"));
    Serial.println(F("   Either the jumper between pin 18 and pin 19 is not on, or"));
    Serial.println(F("   pin 18 is not transmitting. Check the jumper first - it is"));
    Serial.println(F("   far more often the jumper. If the jumper is definitely on,"));
    Serial.println(F("   the Mega's TX1 pin is damaged: change MiniMaestro(Serial1)"));
    Serial.println(F("   and Serial1.begin() to Serial3 and move to pin 14."));
  } else {
    Serial.println(F("   *** GARBLED *** bytes came back but wrong."));
    Serial.println(F("   That is a baud or wiring-integrity problem, not a dead pin."));
  }
  Serial.println(F("-------------------------------"));
  Serial.println();
}

// Hammer bytes out of TX1 for ten seconds, so you can put a scope, a logic
// probe, or just an LED and a resistor on pin 18 and SEE it working.
void obsCarrier() {
  Serial.println(F("[key] transmitting on pin 18 for 10 seconds."));
  Serial.println(F("      Put an LED (with a resistor) from pin 18 to GND and it"));
  Serial.println(F("      will glow dim. A meter on DC will read well under 5 V."));
  unsigned long t0 = millis();
  while (millis() - t0 < 10000) {
    Serial1.write(0x55);            // 01010101 - the busiest pattern there is
    delayMicroseconds(200);
  }
  Serial.println(F("[key] done."));
}

void obsStatus() {
  unsigned long now = millis();
  if (now - obsLastStatus < 1000) return;
  obsLastStatus = now;

  boolean conn = (Xbox.XboxReceiverConnected && Xbox.Xbox360Connected[0]);
  Serial.print(F("[status] ")); Serial.print(obsLoops); Serial.print(F(" Hz | pad "));
  Serial.print(conn ? F("CONNECTED") : F("--"));
  if (conn) {
    Serial.print(F(" | L2 ")); Serial.print(Xbox.getButtonPress(L2, 0));
    Serial.print(F(" R2 "));   Serial.print(Xbox.getButtonPress(R2, 0));
    Serial.print(F(" | dpad "));
    Serial.print(Xbox.getButtonPress(UP, 0)    ? F("U") : F("."));
    Serial.print(Xbox.getButtonPress(DOWN, 0)  ? F("D") : F("."));
    Serial.print(Xbox.getButtonPress(LEFT, 0)  ? F("L") : F("."));
    Serial.print(Xbox.getButtonPress(RIGHT, 0) ? F("R") : F("."));
    Serial.print(F(" | drive ")); Serial.print(isDriveEnabled ? F("ARMED") : F("off"));
  }
  Serial.println();
  obsLoops = 0;

  // Only report a slot that actually fired, and report HOW MANY times. This
  // is the number that matters: one press should be one call.
  for (uint8_t i = 0; i < 8; i++) {
    unsigned long d = obsSlot[i] - obsSlotPrev[i];
    if (!d) continue;
    obsSlotPrev[i] = obsSlot[i];
    Serial.print(F("   -> restartScript(")); Serial.print(i);
    Serial.print(F(") fired ")); Serial.print(d);
    Serial.print(F(" time")); Serial.print(d == 1 ? F("") : F("s"));
    Serial.print(F(" in the last second   (total ")); Serial.print(obsSlot[i]);
    Serial.println(F(")"));
    if (d > 20) Serial.println(F("      ^^ that is the restart storm. The script is being"
                                 " thrown back to its first instruction before it can finish."));
  }
}
// ===========================================================================

void setup() {
  Serial.begin(OBS_BAUD);          // the one unavoidable addition
  delay(600);
  Serial.println();
  Serial.println(F("=================================================="));
  Serial.println(F(" R2 body - PURE OBSERVATION build"));
  Serial.println(F(" Your sketch, unmodified. Prints only."));
  Serial.println(F(" MONITOR MUST BE AT 9600."));
  Serial.println(F("=================================================="));
  Serial.println(F("[setup] Serial up. Starting the rest..."));

#if FOOT_CONTROLLER == 0
  Serial1.begin(SABERTOOTHBAUDRATE);
#endif
  Serial2.begin(DOMEBAUDRATE);
  Serial1.begin(9600); //start serial1 for the body Maestro
  Serial.println(F("[setup] Serial1 (Maestro, TX pin 18) and Serial2 (Syren) open."));

#if defined(SYRENSIMPLE)
  Syren10.motor(0);
#else
  Syren10.autobaud();
#endif
  Serial.println(F("[setup] Syren autobaud sent."));

#if FOOT_CONTROLLER == 0
  Sabertooth2x.autobaud();
  Sabertooth2x.drive(0);
  Sabertooth2x.turn(0);
  Sabertooth2x.setTimeout(950);
#elif FOOT_CONTROLLER == 1
  leftFootSignal.attach(leftFootPin);
  rightFootSignal.attach(rightFootPin);
  stopFeet();
#endif
  Serial.println(F("[setup] Foot ESC signals attached, feet stopped."));

  Syren10.setTimeout(950);

  pinMode(EXTINGUISHERPIN, OUTPUT);
  digitalWrite(EXTINGUISHERPIN, HIGH);

  Serial.println(F("[setup] calling player.begin(). It will call Serial.begin(9600)"));
  Serial.println(F("        underneath, because DY::Player defaults to Serial. We are"));
  Serial.println(F("        already at 9600, so nothing breaks."));
  Serial.flush();          // finish the line before the player takes the port
  player.begin();
  player.setVolume(vol);
  Serial.println(F("[setup] player.begin() returned - port survived."));

  if (isLeftStickDrive) {
    throttleAxis = LeftHatY;
    turnAxis = LeftHatX;
    domeAxis = RightHatX;
    speedSelectButton = L3;
    hpLightToggleButton = R3;
  } else {
    throttleAxis = RightHatY;
    turnAxis = RightHatX;
    domeAxis = LeftHatX;
    speedSelectButton = L3;          // unchanged - yes, same as the other branch
    hpLightToggleButton = R3;
  }

  Wire.begin();
  Serial.println(F("[setup] Wire (I2C) started."));

  //  Serial.begin(9600);
  Serial.println(F("[setup] about to hit 'while (!Serial);' - on a Mega this falls"));
  Serial.println(F("        straight through. If this is the last line you see, you"));
  Serial.println(F("        are not on a Mega and that is your bug."));
  while (!Serial)
    ;
  Serial.println(F("[setup] passed while(!Serial)."));

  Serial.println(F("[setup] calling Usb.Init() ..."));
  if (Usb.Init() == -1) {
    Serial.println(F("[setup] *** Usb.Init() FAILED - USB Host Shield did not start."));
    Serial.println(F("[setup] *** YOUR sketch halts here, silently, and loop() NEVER"));
    Serial.println(F("[setup] *** RUNS - so not one byte ever reaches the Maestro."));
    Serial.println(F("[setup] *** Reseat the shield / check the ICSP header."));
    while (1)
      ;  //halt
  }
  Serial.println(F("[setup] Usb.Init() OK."));
  Serial.println(F("[setup] COMPLETE - entering loop()."));
  obsHelp();
}


void loop() {
  Usb.Task();
  obsLoops++;
  obsCommands();
  obsStatus();

  if (!Xbox.XboxReceiverConnected || !Xbox.Xbox360Connected[0]) {
#if FOOT_CONTROLLER == 0
    Sabertooth2x.drive(0);
    Sabertooth2x.turn(0);
#elif FOOT_CONTROLLER == 1
    stopFeet();
#endif
    Syren10.motor(1, 0);
    isDriveEnabled = false;
    firstLoadOnConnect = false;
    if (obsWasConnected) { Serial.println(F("[pad] DISCONNECTED")); obsWasConnected = false; }
    return;
  }
  if (!obsWasConnected) { Serial.println(F("[pad] connected")); obsWasConnected = true; }

  if (!firstLoadOnConnect) {
    firstLoadOnConnect = true;
    player.playSpecified(21);
    Xbox.setLedMode(ROTATING, 0);
  }

  if (Xbox.getButtonClick(XBOX, 0)) {
    if (Xbox.getButtonPress(L1, 0) && Xbox.getButtonPress(R1, 0)) {
      Xbox.disconnect(0);
    }
  }

  if (Xbox.getButtonClick(START, 0)) {
    if (isDriveEnabled) {
      isDriveEnabled = false;
      Xbox.setLedMode(ROTATING, 0);
      player.playSpecified(53);
      Serial.println("Start pressed");
    } else {
      isDriveEnabled = true;
      player.playSpecified(52);
      Serial.println("Start pressed");
      if (drivespeed == DRIVESPEED1) {
        Xbox.setLedOn(LED1, 0);
      } else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0)) {
        Xbox.setLedOn(LED2, 0);
      } else {
        Xbox.setLedOn(LED3, 0);
      }
    }
  }

  if (Xbox.getButtonClick(BACK, 0)) {
    if (isInAutomationMode) {
      isInAutomationMode = false;
      automateAction = 0;
      player.playSpecified(53);
      Serial.println("Back button pressed");
    } else {
      isInAutomationMode = true;
      player.playSpecified(52);
      Serial.println("Back button pressed");
    }
  }

  if (isInAutomationMode) {
    unsigned long currentMillis = millis();
    if (currentMillis - automateMillis > (automateDelay * 1000)) {
      automateMillis = millis();
      automateAction = random(1, 5);
      if (automateAction > 1) {
        player.playSpecified(random(32, 52));
      }
      if (automateAction < 4) {
#if defined(SYRENSIMPLE)
        Syren10.motor(turnDirection);
#else
        Syren10.motor(1, turnDirection);
#endif
        delay(750);                      // still here, still blocking
#if defined(SYRENSIMPLE)
        Syren10.motor(0);
#else
        Syren10.motor(1, 0);
#endif
        if (turnDirection > 0) {
          turnDirection = -45;
        } else {
          turnDirection = 45;
        }
      }
      automateDelay = random(3, 10);
    }
  }

  // Volume - unchanged, including the inversion and the fact that this
  // consumes the UP/DOWN click before the Maestro block below can see it.
  if (Xbox.getButtonClick(UP, 0)) {
    if (Xbox.getButtonPress(R1, 0)) {
      if (vol > 0) {
        vol--;
        player.setVolume(vol);
      }
    }
  }
  if (Xbox.getButtonClick(DOWN, 0)) {
    if (Xbox.getButtonPress(R1, 0)) {
      if (vol < 30) {
        vol++;
        player.setVolume(vol);
      }
    }
  }

  //Maestro stuff here - UNCHANGED. getButtonPress, so a held d-pad still
  //restarts the script every pass. The only addition is obsSlot[n]++.

  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(UP, 0)) {
      maestro.restartScript(0);
      obsSlot[0]++;
    }
  }

  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(RIGHT, 0)) {
      maestro.restartScript(1);
      obsSlot[1]++;
    }
  }
  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(DOWN, 0)) {
      maestro.restartScript(2);
      obsSlot[2]++;
    }
  }

  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(LEFT, 0)) {
      maestro.restartScript(3);
      obsSlot[3]++;
    }
  }
  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(UP, 0)) {
      maestro.restartScript(4);
      obsSlot[4]++;
    }
  }
  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(RIGHT, 0)) {
      maestro.restartScript(5);
      obsSlot[5]++;
      player.playSpecified(3);
    }
  }
  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(DOWN, 0)) {
      maestro.restartScript(6);
      obsSlot[6]++;
    }
  }

  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(LEFT, 0)) {
      maestro.restartScript(7);
      obsSlot[7]++;
    }
  }

  if (Xbox.getButtonClick(Y, 0)) {
    if (Xbox.getButtonPress(L1, 0))      { player.playSpecified(8);  triggerI2C(10, 0); }
    else if (Xbox.getButtonPress(L2, 0)) { player.playSpecified(2);  triggerI2C(10, 0); }
    else if (Xbox.getButtonPress(R1, 0)) { player.playSpecified(9);  triggerI2C(10, 0); }
    else                                 { player.playSpecified(random(13, 17)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(A, 0)) {
    if (Xbox.getButtonPress(L1, 0))      { player.playSpecified(6); triggerI2C(10, 6);
                                           triggerI2C(25, 11); triggerI2C(26, 11); triggerI2C(27, 11); }
    else if (Xbox.getButtonPress(L2, 0)) { player.playSpecified(1); triggerI2C(10, 1);
                                           triggerI2C(25, 3); triggerI2C(26, 3); triggerI2C(27, 3); }
    else if (Xbox.getButtonPress(R1, 0)) { player.playSpecified(11); triggerI2C(10, 11); }
    else                                 { player.playSpecified(random(17, 25)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(B, 0)) {
    if (Xbox.getButtonPress(L1, 0))      { player.playSpecified(7);  triggerI2C(10, 0); }
    else if (Xbox.getButtonPress(L2, 0)) { player.playSpecified(3);  triggerI2C(10, 0); }
    else if (Xbox.getButtonPress(R1, 0)) { player.playSpecified(10); triggerI2C(10, 10);
                                           triggerI2C(25, 10); triggerI2C(26, 10); triggerI2C(27, 10); }
    else                                 { player.playSpecified(random(32, 52)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(X, 0)) {
    if (Xbox.getButtonPress(L1, 0))      { player.playSpecified(5); triggerI2C(10, 5); triggerI2C(25, 9); }
    else if (Xbox.getButtonPress(L2, 0)) { player.playSpecified(4); triggerI2C(10, 4); }
    else if (Xbox.getButtonPress(R1, 0)) { player.playSpecified(12); triggerI2C(10, 0); }
    else                                 { player.playSpecified(random(32, 52)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(hpLightToggleButton, 0)) {
    if (isHPOn) { isHPOn = false; triggerI2C(25, 2); }
    else        { isHPOn = true;  triggerI2C(25, 1); }
  }

  if (Xbox.getButtonClick(speedSelectButton, 0) && isDriveEnabled) {
    if (drivespeed == DRIVESPEED1) {
      drivespeed = DRIVESPEED2; Xbox.setLedOn(LED2, 0); player.playSpecified(53); triggerI2C(10, 22);
    } else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0)) {
      drivespeed = DRIVESPEED3; Xbox.setLedOn(LED3, 0); player.playSpecified(1);  triggerI2C(10, 23);
    } else {
      drivespeed = DRIVESPEED1; Xbox.setLedOn(LED1, 0); player.playSpecified(52); triggerI2C(10, 21);
    }
  }

#if FOOT_CONTROLLER == 0
  throttleStickValue = (map(Xbox.getAnalogHat(throttleAxis, 0), -32768, 32767, -drivespeed, drivespeed));
  if (throttleStickValue < -DRIVEDEADZONERANGE || throttleStickValue > DRIVEDEADZONERANGE) RampingMillis = millis();
  if (throttleStickValue > -DRIVEDEADZONERANGE && throttleStickValue < DRIVEDEADZONERANGE
      && (millis() - RampingMillis > RampingDeadzoneDelay)) {
    driveThrottle = 0;
    stopFeet();
  } else {
    if (isInAutomationMode) { isInAutomationMode = false; automateAction = 0; }
    if (driveThrottle < throttleStickValue) {
      if (throttleStickValue - driveThrottle > (RAMPING)) driveThrottle += RAMPING;
      else driveThrottle = throttleStickValue;
    } else if (driveThrottle > throttleStickValue) {
      if (driveThrottle - throttleStickValue > (RAMPING)) driveThrottle -= RAMPING;
      else driveThrottle = throttleStickValue;
    }
  }
  turnThrottle = map(Xbox.getAnalogHat(turnAxis, 0), -32768, 32767, -TURNSPEED, TURNSPEED);
  if (isDriveEnabled) {
    if (turnThrottle > -DRIVEDEADZONERANGE && turnThrottle < DRIVEDEADZONERANGE) turnThrottle = 0;
    Sabertooth2x.turn(-turnThrottle);
    Sabertooth2x.drive(driveThrottle);
  }
#elif FOOT_CONTROLLER == 1
  throttleStickValueraw = Xbox.getAnalogHat(throttleAxis, 0);
  turnThrottleraw = Xbox.getAnalogHat(turnAxis, 0);

  if (isDriveEnabled) {
    if ((Xbox.getButtonPress(L1, 0)) && (Xbox.getButtonPress(L2, 0)) && (Xbox.getButtonPress(R1, 0))
        && (Xbox.getButtonPress(R2, 0)) && (drivespeed == DRIVESPEED3)) {
      CalibrationMode = true;
    } else {
      CalibrationMode = false;
    }
    if (CalibrationMode == false) mixHubDrive(turnThrottleraw, throttleStickValueraw, drivespeed);
    else                          mixHubDrive(turnThrottleraw, throttleStickValueraw, CalibrationSpeed);

    if ((isInAutomationMode) && ((leftFoot != 90) || (rightFoot != 90))) {
      isInAutomationMode = false;
      automateAction = 0;
    }
    leftFootSignal.write(leftFoot);
    rightFootSignal.write(rightFoot);
  } else {
    stopFeet();
  }
#endif

  domeThrottle = (map(Xbox.getAnalogHat(domeAxis, 0), -32768, 32767, DOMESPEED, -DOMESPEED));
  if (domeThrottle > -DOMEDEADZONERANGE && domeThrottle < DOMEDEADZONERANGE) domeThrottle = 0;
  Syren10.motor(1, domeThrottle);
}  // END loop()

void triggerI2C(byte deviceID, byte eventID) {
  Wire.beginTransmission(deviceID);
  Wire.write(eventID);
  Wire.endTransmission();
}

void stopFeet() {
#if FOOT_CONTROLLER == 0
  Sabertooth2x.drive(0);
  Sabertooth2x.turn(0);
#elif FOOT_CONTROLLER == 1
  leftFootSignal.write(90);
  rightFootSignal.write(90);
#endif
}

#if FOOT_CONTROLLER == 1
void mixHubDrive(int stickX, int stickY, byte maxDriveSpeed) {
  if (stickX <= (-DRIVEDEADZONERANGE * 258) || stickX >= (DRIVEDEADZONERANGE * 258)
   || stickY <= (-DRIVEDEADZONERANGE * 258) || stickY >= (DRIVEDEADZONERANGE * 258)) {
    RampingMillis = millis();
  }
  if (stickX <= (-DRIVEDEADZONERANGE * 258) || stickX >= (DRIVEDEADZONERANGE * 258)
   || stickY <= (-DRIVEDEADZONERANGE * 258) || stickY >= (DRIVEDEADZONERANGE * 258)
   || (millis() - RampingMillis < RampingDeadzoneDelay)) {
    int Y_Stick_Normalised = 0;
    Y_Stick_Normalised = (map(stickY, -32768, 32767, -100, 100));
    if (YDist < Y_Stick_Normalised) {
      if (Y_Stick_Normalised - YDist > (RAMPING)) YDist += RAMPING;
      else YDist = Y_Stick_Normalised;
    } else if (YDist > Y_Stick_Normalised) {
      if (YDist - Y_Stick_Normalised > (RAMPING)) YDist -= RAMPING;
      else YDist = Y_Stick_Normalised;
    }
    XDist = (map(stickX, -32768, 32767, -100, 100));

    float RightSpeed = (YDist - (XDist * (TURNSPEED / 100)));   // unchanged
    float LeftSpeed  = (YDist + (XDist * (TURNSPEED / 100)));   // unchanged

    int maxServoForward = map(maxDriveSpeed, 0, 127, 90, 180);
    int maxServoReverse = map(maxDriveSpeed, 0, 127, 90, 0);
#if leftDirection == 0
    leftFoot = map(LeftSpeed, -100, 100, maxServoForward, maxServoReverse);
#else
    leftFoot = map(LeftSpeed, -100, 100, maxServoReverse, maxServoForward);
#endif
#if rightDirection == 0
    rightFoot = map(RightSpeed, -100, 100, maxServoForward, maxServoReverse);
#else
    rightFoot = map(RightSpeed, -100, 100, maxServoReverse, maxServoForward);
#endif
  } else {
    if (millis() - RampingMillis > RampingDeadzoneDelay) {
      leftFoot = 90;
      rightFoot = 90;
    }
  }
}
#endif
