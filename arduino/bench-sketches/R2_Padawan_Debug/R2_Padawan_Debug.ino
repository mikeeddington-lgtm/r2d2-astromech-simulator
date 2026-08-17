//Maestro_Mega_DYSV5W  —  DEBUG BUILD
//by Steve Baudains 2025, edits by Steven Sloan, Padawan360 by Dan Kraus
//
// ============================================================================
//  WHAT IS DIFFERENT IN THIS BUILD
//
//  1. THE SERIAL MONITOR ACTUALLY WORKS.
//     "DY::Player player;" defaults to Serial — the SAME UART as the USB
//     monitor. Every Serial.println in the original was injecting bytes into
//     the audio module's command stream, and the audio module's replies were
//     littering the monitor. AUDIO_ON_SERIAL3 below moves the player to
//     Serial3 (pin 14) and leaves Serial clean for you.
//
//  2. YOU CAN FIRE THE MAESTRO FROM THE KEYBOARD.
//     Type 0-7 in the monitor to call restartScript(0..7) with no controller
//     involved at all. Type 'o' / 'c' to drive PP5 open / shut directly,
//     bypassing the script entirely. This is the test that tells you whether
//     the problem is the Maestro, the wire, or the button handling.
//
//  3. THE D-PAD RESTART STORM IS FIXED.
//     The original used getButtonPress() on the d-pad, which is true for as
//     long as you HOLD it. loop() runs ~500-1000 Hz, so holding R2+UP sent
//     "restart the script" every couple of milliseconds and the script never
//     got past its first frame. It now fires once per press. The monitor
//     prints a count so you can see it.
//
//  4. It tells you what it sees: controller state, trigger values, every
//     restartScript call, and a heartbeat so a hung sketch is obvious.
//
//  Set DEBUG to 0 when you are done and it all compiles away.
// ============================================================================

#define DEBUG            1     // 0 = silent, no monitor code compiled in
#define DEBUG_BAUD       115200
#define AUDIO_ON_SERIAL3 1     // 1 = DY-SV5W moves to Serial3 (TX pin 14), so
                               //     the monitor on Serial is clean. MOVE THE
                               //     AUDIO MODULE'S RX WIRE TO PIN 14.
                               // 0 = audio stays on Serial. Monitor still works
                               //     but the two will interfere with each other.
#define MAESTRO_READBACK 0     // 1 = also wire Maestro TX -> Mega RX1 (pin 19)
                               //     and the sketch can read positions/errors

// PORT MAP for this build
//   Serial  (0/1)   USB monitor only            <- was the audio player
//   Serial1 (18/19) MAESTRO                     <- TX is pin 18
//   Serial2 (16/17) Syren10 dome motor
//   Serial3 (14/15) DY-SV5W audio               <- was unused

#define FOOT_CONTROLLER 1  //0 = Sabertooth Serial, 1 = individual ESC for PWM (HUB) motors
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

// DY-SV5W volume is 0..30 and 30 is the LOUDEST. The original comment said
// "0 = full volume, 255 off", which is the MP3Trigger convention and is why
// the volume buttons were inverted.
byte vol = 25;

byte automateDelay = random(5, 20);
int turnDirection = 20;

#define EXTINGUISHERPIN 3

#include <Sabertooth.h>
#include <DYPlayerArduino.h>
#include <Wire.h>
#include <XBOXRECV.h>
#include <Servo.h>
#include <Adafruit_PWMServoDriver.h>
#include <PololuMaestro.h>

// ---- the Maestro. Leaving deviceNumber at its default makes the library use
//      the COMPACT protocol (2 bytes, no address), which is why the board's
//      SerialDeviceNumber does not have to match anything.
MiniMaestro maestro(Serial1);

// PP5 is channel 0. Endpoints straight out of your .mstr.
const uint8_t  PP5_CHANNEL = 0;
const uint16_t PP5_OPEN    = 7296;
const uint16_t PP5_SHUT    = 4544;

#if FOOT_CONTROLLER == 0
Sabertooth Sabertooth2x(128, Serial1);   // NOTE: excluded, we are on mode 1
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

#if AUDIO_ON_SERIAL3
DY::Player player(&Serial3);
#else
DY::Player player;
#endif

USB Usb;
XBOXRECV Xbox(&Usb);

#if FOOT_CONTROLLER == 1
Servo leftFootSignal;
Servo rightFootSignal;
#endif

// Forward declarations. The Arduino IDE normally generates these for you,
// but being explicit costs nothing and makes the file compile anywhere.
void triggerI2C(byte deviceID, byte eventID);
void stopFeet();
#if FOOT_CONTROLLER == 1
void mixHubDrive(int stickX, int stickY, byte maxDriveSpeed);
#endif
void fireScript(uint8_t slot, const __FlashStringHelper *why);
void pp5(uint16_t target);

// ---------------------------------------------------------------- debug ----
#if DEBUG
  #define DBG(x)    Serial.print(x)
  #define DBGLN(x)  Serial.println(x)
  unsigned long dbgScriptCalls = 0;    // how many restartScript() we have sent
  unsigned long dbgLastStatus  = 0;
  unsigned long dbgLoops       = 0;
  boolean       dbgWasConnected = false;
#else
  #define DBG(x)
  #define DBGLN(x)
#endif

// Send restartScript and say so. Everything goes through here so the count
// is honest.
void fireScript(uint8_t slot, const __FlashStringHelper *why) {
  maestro.restartScript(slot);
#if DEBUG
  dbgScriptCalls++;
  Serial.print(F("[maestro] restartScript("));
  Serial.print(slot);
  Serial.print(F(")  #"));
  Serial.print(dbgScriptCalls);
  Serial.print(F("  <- "));
  Serial.println(why);
#endif
}

// Drive PP5 directly with Set Target. Does NOT use the script, so this works
// even if the script was never applied to the board.
void pp5(uint16_t target) {
  maestro.setTarget(PP5_CHANNEL, target);
#if DEBUG
  Serial.print(F("[maestro] setTarget(ch"));
  Serial.print(PP5_CHANNEL);
  Serial.print(F(", "));
  Serial.print(target);
  Serial.println(F(") - straight to the servo, no script involved"));
#endif
}

#if DEBUG
void dbgHelp() {
  Serial.println();
  Serial.println(F("---- keyboard commands (no controller needed) ----"));
  Serial.println(F("  0-7  restartScript(n)   fire that Maestro subroutine"));
  Serial.println(F("  o    PP5 OPEN           setTarget, bypasses the script"));
  Serial.println(F("  c    PP5 SHUT           setTarget, bypasses the script"));
  Serial.println(F("  f    PP5 flap 3x        open/shut, bypasses the script"));
  Serial.println(F("  s    stop the script"));
#if MAESTRO_READBACK
  Serial.println(F("  e    read the Maestro's error flags   (needs TX->pin 19)"));
  Serial.println(F("  p    read PP5's position              (needs TX->pin 19)"));
#endif
  Serial.println(F("  ?    this help"));
  Serial.println(F("--------------------------------------------------"));
  Serial.println(F("If 'o' and 'c' move PP5 but 0-7 do nothing, the script is"));
  Serial.println(F("not on the board: load the .mstr and press APPLY SETTINGS."));
  Serial.println(F("If NOTHING moves PP5, it is the wire, the ground, the servo"));
  Serial.println(F("power, or the board - not the sketch."));
  Serial.println();
}

#if MAESTRO_READBACK
long maestroRead16(uint16_t timeoutMs) {
  unsigned long t0 = millis();
  uint8_t got = 0, lo = 0;
  while (millis() - t0 < timeoutMs) {
    if (Serial1.available()) {
      uint8_t b = Serial1.read();
      if (got == 0) { lo = b; got = 1; }
      else          { return ((long)b << 8) | lo; }
    }
  }
  return -1;
}
#endif

void dbgSerialCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c >= '0' && c <= '7') { fireScript(c - '0', F("typed in the monitor")); }
    else if (c == 'o' || c == 'O') pp5(PP5_OPEN);
    else if (c == 'c' || c == 'C') pp5(PP5_SHUT);
    else if (c == 'f' || c == 'F') {
      Serial.println(F("[test] flapping PP5 three times..."));
      for (uint8_t i = 0; i < 3; i++) { pp5(PP5_OPEN); delay(1500); pp5(PP5_SHUT); delay(1500); }
      Serial.println(F("[test] done"));
    }
    else if (c == 's' || c == 'S') { maestro.stopScript(); Serial.println(F("[maestro] stopScript()")); }
#if MAESTRO_READBACK
    else if (c == 'e' || c == 'E') {
      while (Serial1.available()) Serial1.read();
      Serial1.write(0xA1);
      long v = maestroRead16(200);
      Serial.print(F("[maestro] error flags: "));
      if (v < 0) Serial.println(F("no reply - is Maestro TX wired to pin 19?"));
      else { Serial.print(F("0x")); Serial.println(v, HEX); }
    }
    else if (c == 'p' || c == 'P') {
      while (Serial1.available()) Serial1.read();
      Serial1.write(0x90); Serial1.write(PP5_CHANNEL);
      long v = maestroRead16(200);
      Serial.print(F("[maestro] PP5 position: "));
      if (v < 0) Serial.println(F("no reply - is Maestro TX wired to pin 19?"));
      else { Serial.print(v); Serial.println(F(" quarter-us")); }
    }
#endif
    else if (c == '?') dbgHelp();
  }
}

void dbgStatus() {
  unsigned long now = millis();
  if (now - dbgLastStatus < 1000) return;
  dbgLastStatus = now;

  boolean conn = (Xbox.XboxReceiverConnected && Xbox.Xbox360Connected[0]);
  Serial.print(F("[status] loop "));
  Serial.print(dbgLoops);
  Serial.print(F(" Hz | pad "));
  Serial.print(conn ? F("CONNECTED") : F("--"));
  if (conn) {
    Serial.print(F(" | L2 "));  Serial.print(Xbox.getButtonPress(L2, 0));
    Serial.print(F(" R2 "));    Serial.print(Xbox.getButtonPress(R2, 0));
    Serial.print(F(" | dpad "));
    Serial.print(Xbox.getButtonPress(UP, 0)    ? F("U") : F("."));
    Serial.print(Xbox.getButtonPress(DOWN, 0)  ? F("D") : F("."));
    Serial.print(Xbox.getButtonPress(LEFT, 0)  ? F("L") : F("."));
    Serial.print(Xbox.getButtonPress(RIGHT, 0) ? F("R") : F("."));
    Serial.print(F(" | drive "));
    Serial.print(isDriveEnabled ? F("ARMED") : F("off"));
  }
  Serial.print(F(" | scripts sent "));
  Serial.println(dbgScriptCalls);
  dbgLoops = 0;
}
#endif  // DEBUG

// ------------------------------------------------------------------ setup --
void setup() {
#if DEBUG
  Serial.begin(DEBUG_BAUD);
  delay(600);
  Serial.println();
  Serial.println(F("================================================"));
  Serial.println(F(" R2 body - Padawan / Maestro DEBUG build"));
  Serial.println(F("================================================"));
  Serial.println(F(" Serial   USB monitor"));
  Serial.println(F(" Serial1  MAESTRO        TX = pin 18"));
  Serial.println(F(" Serial2  Syren10 dome   TX = pin 16"));
#if AUDIO_ON_SERIAL3
  Serial.println(F(" Serial3  DY-SV5W audio  TX = pin 14  <- MOVE THE WIRE"));
#else
  Serial.println(F(" Serial   DY-SV5W audio  - sharing with the monitor,"));
  Serial.println(F("          expect both to misbehave. Set AUDIO_ON_SERIAL3 1."));
#endif
  Serial.println(F(" Common ground between the Mega and the Maestro is NOT"));
  Serial.println(F(" optional. Without it you get exactly this fault."));
#endif

#if FOOT_CONTROLLER == 0
  Serial1.begin(SABERTOOTHBAUDRATE);
#endif
  Serial2.begin(DOMEBAUDRATE);
  Serial1.begin(9600);      // the Maestro. Must match its FixedBaudRate.

#if defined(SYRENSIMPLE)
  Syren10.motor(0);
#else
  Syren10.autobaud();
#endif

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

  Syren10.setTimeout(950);

  pinMode(EXTINGUISHERPIN, OUTPUT);
  digitalWrite(EXTINGUISHERPIN, HIGH);

  player.begin();
  player.setVolume(vol);

  if (isLeftStickDrive) {
    throttleAxis = LeftHatY;  turnAxis = LeftHatX;  domeAxis = RightHatX;
    speedSelectButton = L3;   hpLightToggleButton = R3;
  } else {
    throttleAxis = RightHatY; turnAxis = RightHatX; domeAxis = LeftHatX;
    // the original assigned L3/R3 in BOTH branches, so this setting did
    // nothing at all. Swapped here, which is what it was meant to do.
    speedSelectButton = R3;   hpLightToggleButton = L3;
  }

  Wire.begin();

  // NOTE: the original had "while (!Serial);" here with Serial.begin()
  // commented out. Harmless on a Mega (HardwareSerial::operator bool()
  // just returns true) but it hangs forever on any board with native USB.
  // Removed.

  if (Usb.Init() == -1) {
    DBGLN(F("[FATAL] USB Host Shield did not start. Halted."));
    while (1) ;
  }
#if DEBUG
  Serial.println(F("[ok] USB Host Shield started."));
  Serial.println(F("[ok] Ready. The Maestro can be tested WITHOUT a controller:"));
  dbgHelp();
#endif
}

// ------------------------------------------------------------------- loop --
void loop() {
  Usb.Task();
#if DEBUG
  dbgLoops++;
  dbgSerialCommands();     // keyboard works whether or not a pad is connected
  dbgStatus();
#endif

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
#if DEBUG
    if (dbgWasConnected) { Serial.println(F("[pad] DISCONNECTED")); dbgWasConnected = false; }
#endif
    return;
  }
#if DEBUG
  if (!dbgWasConnected) { Serial.println(F("[pad] connected")); dbgWasConnected = true; }
#endif

  if (!firstLoadOnConnect) {
    firstLoadOnConnect = true;
    player.playSpecified(21);
    Xbox.setLedMode(ROTATING, 0);
  }

  if (Xbox.getButtonClick(XBOX, 0)) {
    if (Xbox.getButtonPress(L1, 0) && Xbox.getButtonPress(R1, 0)) Xbox.disconnect(0);
  }

  if (Xbox.getButtonClick(START, 0)) {
    if (isDriveEnabled) {
      isDriveEnabled = false;
      Xbox.setLedMode(ROTATING, 0);
      player.playSpecified(53);
      DBGLN(F("[pad] START - drive DISARMED"));
    } else {
      isDriveEnabled = true;
      player.playSpecified(52);
      DBGLN(F("[pad] START - drive ARMED"));
      if (drivespeed == DRIVESPEED1)                              Xbox.setLedOn(LED1, 0);
      else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0))   Xbox.setLedOn(LED2, 0);
      else                                                        Xbox.setLedOn(LED3, 0);
    }
  }

  if (Xbox.getButtonClick(BACK, 0)) {
    isInAutomationMode = !isInAutomationMode;
    automateAction = 0;
    player.playSpecified(isInAutomationMode ? 52 : 53);
    DBG(F("[pad] BACK - automation ")); DBGLN(isInAutomationMode ? F("ON") : F("off"));
  }

  if (isInAutomationMode) {
    unsigned long currentMillis = millis();
    if (currentMillis - automateMillis > (automateDelay * 1000)) {
      automateMillis = millis();
      automateAction = random(1, 5);
      if (automateAction > 1) player.playSpecified(random(32, 52));
      if (automateAction < 4) {
#if defined(SYRENSIMPLE)
        Syren10.motor(turnDirection);
#else
        Syren10.motor(1, turnDirection);
#endif
        // NOTE: the original had delay(750) here, which stops the entire
        // sketch - no controller polling, no motor updates, no Maestro
        // commands - for three quarters of a second. Left in place so this
        // build behaves like yours, but it is worth replacing with a timer.
        delay(750);
#if defined(SYRENSIMPLE)
        Syren10.motor(0);
#else
        Syren10.motor(1, 0);
#endif
        turnDirection = (turnDirection > 0) ? -45 : 45;
      }
      automateDelay = random(3, 10);
    }
  }

  // ==========================================================================
  //  D-PAD DISPATCH
  //  Read every click ONCE, into a local, before anything else can eat it.
  //  getButtonClick() CLEARS the flag inside the library:
  //      ButtonClickState[controller] &= ~button;   // clear "click" event
  //  so whichever block calls it first wins. In the original, the volume
  //  block consumed UP and DOWN every pass - with or without R1 held - which
  //  is why the Maestro triggers had to use getButtonPress, and that is what
  //  made a held d-pad restart the script every couple of milliseconds.
  // ==========================================================================
  bool dpadUp    = Xbox.getButtonClick(UP, 0);
  bool dpadDown  = Xbox.getButtonClick(DOWN, 0);
  bool dpadLeft  = Xbox.getButtonClick(LEFT, 0);
  bool dpadRight = Xbox.getButtonClick(RIGHT, 0);

  // L2 and R2 are ANALOG - getButtonPress returns 0-255, not a boolean - so
  // use a threshold rather than "non-zero", which a worn trigger can satisfy
  // at rest.
  bool modR1 = Xbox.getButtonPress(R1, 0);
  bool modR2 = (Xbox.getButtonPress(R2, 0) > 40);
  bool modL2 = (Xbox.getButtonPress(L2, 0) > 40);

#if DEBUG
  if (dpadUp || dpadDown || dpadLeft || dpadRight) {
    Serial.print(F("[pad] dpad "));
    if (dpadUp) Serial.print(F("UP "));
    if (dpadDown) Serial.print(F("DOWN "));
    if (dpadLeft) Serial.print(F("LEFT "));
    if (dpadRight) Serial.print(F("RIGHT "));
    Serial.print(F("| R1 ")); Serial.print(modR1);
    Serial.print(F(" R2 "));  Serial.print(Xbox.getButtonPress(R2, 0));
    Serial.print(F(" L2 "));  Serial.println(Xbox.getButtonPress(L2, 0));
  }
#endif

  // volume: hold R1, tap up / down. DY-SV5W is 0..30 with 30 the LOUDEST,
  // so UP must INCREASE it. The original had this the wrong way round.
  if (dpadUp   && modR1) { if (vol < 30) { vol++; player.setVolume(vol); DBG(F("[audio] vol ")); DBGLN(vol); } }
  if (dpadDown && modR1) { if (vol >  0) { vol--; player.setVolume(vol); DBG(F("[audio] vol ")); DBGLN(vol); } }

  // Maestro: exactly one restart per press.
  if (modR2 && !modR1) {
    if (dpadUp)    fireScript(0, F("R2 + UP"));
    if (dpadRight) fireScript(1, F("R2 + RIGHT"));
    if (dpadDown)  fireScript(2, F("R2 + DOWN"));
    if (dpadLeft)  fireScript(3, F("R2 + LEFT"));
  }
  if (modL2 && !modR1) {
    if (dpadUp)    fireScript(4, F("L2 + UP"));
    if (dpadRight) { fireScript(5, F("L2 + RIGHT")); player.playSpecified(3); }
    if (dpadDown)  fireScript(6, F("L2 + DOWN"));
    if (dpadLeft)  fireScript(7, F("L2 + LEFT"));
  }

  // ---- sounds -------------------------------------------------------------
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
    // the original played random(32,52) here, the same bank as bare B. The
    // commented-out line above it said random(25,32) - the whistles - which
    // is what was intended.
    else                                 { player.playSpecified(random(25, 32)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(hpLightToggleButton, 0)) {
    isHPOn = !isHPOn;
    triggerI2C(25, isHPOn ? 1 : 2);
  }

  if (Xbox.getButtonClick(speedSelectButton, 0) && isDriveEnabled) {
    if (drivespeed == DRIVESPEED1) {
      drivespeed = DRIVESPEED2; Xbox.setLedOn(LED2, 0); player.playSpecified(53); triggerI2C(10, 22);
    } else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0)) {
      drivespeed = DRIVESPEED3; Xbox.setLedOn(LED3, 0); player.playSpecified(1);  triggerI2C(10, 23);
    } else {
      drivespeed = DRIVESPEED1; Xbox.setLedOn(LED1, 0); player.playSpecified(52); triggerI2C(10, 21);
    }
    DBG(F("[pad] drive speed ")); DBGLN(drivespeed);
  }

  // ---- feet ---------------------------------------------------------------
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
        && (Xbox.getButtonPress(R2, 0)) && (drivespeed == DRIVESPEED3)) CalibrationMode = true;
    else CalibrationMode = false;

    if (CalibrationMode == false) mixHubDrive(turnThrottleraw, throttleStickValueraw, drivespeed);
    else                          mixHubDrive(turnThrottleraw, throttleStickValueraw, CalibrationSpeed);

    if ((isInAutomationMode) && ((leftFoot != 90) || (rightFoot != 90))) {
      isInAutomationMode = false; automateAction = 0;
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
}

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
    int Y_Stick_Normalised = (map(stickY, -32768, 32767, -100, 100));
    if (YDist < Y_Stick_Normalised) {
      if (Y_Stick_Normalised - YDist > (RAMPING)) YDist += RAMPING; else YDist = Y_Stick_Normalised;
    } else if (YDist > Y_Stick_Normalised) {
      if (YDist - Y_Stick_Normalised > (RAMPING)) YDist -= RAMPING; else YDist = Y_Stick_Normalised;
    }
    XDist = (map(stickX, -32768, 32767, -100, 100));

    // NOTE: LeftSpeed/RightSpeed can reach +/-140 from a +/-100 map, so the
    // map() below overshoots the speed cap by ~19% at full deflection. Only
    // Servo::write()'s 180 clamp stops it. Constrained here.
    float RightSpeed = constrain((YDist - (XDist * (TURNSPEED / 100))), -100, 100);
    float LeftSpeed  = constrain((YDist + (XDist * (TURNSPEED / 100))), -100, 100);

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
    if (millis() - RampingMillis > RampingDeadzoneDelay) { leftFoot = 90; rightFoot = 90; }
  }
}
#endif
