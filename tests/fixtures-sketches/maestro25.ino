//Maestro_Mega_DYSV5W
//by Steve Baudains 2025
// edits by Steven Sloan to accomodate the Flipsky esc's and brushless hub motors
//This script allows for an Arduino Mega to control a Pololu Maestro board using hardware serial
// on Tx3 on a Mega or software serial on Tx11
// Please credit Dan Kraus for the original hard work on Padawan 360
// This sketch is to beta test the DY-SV5W audio player instead of sparkfun mp3

// Hub Drive Motors with individual PWM speed controllers
// This script allows selection between standard Sabertooth control of brushed motors for the foot drives,
// or the use of individual motor drivers (e.g. Flipsky FSESC6.7) with hub motors.


// =======================================================================================
// NOTE: DO NOT USE SoftwareSerial WITH PWM MOTORS.  SoftwareSerial USES INTERRUPTS WHICH DISRUPT THE PWM SIGNAL.
// =======================================================================================


// =======================================================================================
// /////////////////////////Padawan360 Body Code - Mega I2C v2.0 ////////////////////////////////////
// =======================================================================================
/*
  by Dan Kraus
  dskraus@gmail.com
  Astromech: danomite4047
  Project Site: https://github.com/dankraus/padawan360/
  Heavily influenced by DanF's Padwan code which was built for Arduino+Wireless PS2
  controller leveraging Bill Porter's PS2X Library. I was running into frequent disconnect
  issues with 4 different controllers working in various capacities or not at all. I decided
  that PS2 Controllers were going to be more difficult to come by every day, so I explored
  some existing libraries out there to leverage and came across the USB Host Shield and it's
  support for PS3 and Xbox 360 controllers. Bluetooth dongles were inconsistent as well
  so I wanted to be able to have something with parts that other builder's could easily track
  down and buy parts even at your local big box store.
  v2.0 Changes:
  - Makes left analog stick default drive control stick. Configurable between left or right stick via isLeftStickDrive
  Hardware:
***Arduino Mega 2560***
  USB Host Shield from circuits@home
  Microsoft Xbox 360 Controller
  Xbox 360 USB Wireless Reciver
  Sabertooth Motor Controller
  Syren Motor Controller
  Sparkfun MP3 Trigger
  This sketch supports I2C and calls events on many sound effect actions to control lights and sounds.
  It is NOT set up for Dan's method of using the serial packet to transfer data up to the dome
  to trigger some light effects.It uses Hardware Serial pins on the Mega to control Sabertooth and Syren
  Set Sabertooth 2x25/2x12 Dip Switches 1 and 2 Down, All Others Up
  For SyRen Simple Serial Set Switches 1 and 2 Down, All Others Up
  For SyRen Simple Serial Set Switchs 2 & 4 Down, All Others Up
  Placed a 10K ohm resistor between S1 & GND on the SyRen 10 itself
*/

// ************************** Options, Configurations, and Settings ***********************************

#define FOOT_CONTROLLER 1  //0 = Sabertooth Serial or 1 =individual ESC for PWM (HUB) motors
// PWM Hub Motor Mode settings...
#if FOOT_CONTROLLER == 1
#define leftFootPin 44         //connect this pin to motor controller for left foot (R/C mode)
#define rightFootPin 45        //connect this pin to motor controller for right foot (R/C mode)
#define leftDirection 1        //change this if left motor is spinning the wrong way
#define rightDirection 1       //change this if right motor is spinning the wrong way
int YDist = 0;                 // Initial Drive Stick Value.
int XDist = 0;                 // Initial Drive Stick Value.
int leftFoot = 90;             // Initial servo signal for motor speed (0 = full reverse, 90 = stop, 180 = full forward)
int rightFoot = 90;            // Initial servo signal for motor speed (0 = full reverse, 90 = stop, 180 = full forward)
int CalibrationSpeed = 127;    // To set the speed to maximum for calibration of the hub drive VESCs
bool CalibrationMode = false;  // set to TRUE when both triggers and both shoulder buttons are pressed
#endif

// SPEED AND TURN SPEEDS
//  For PWM Hub motors speeds are recommended as 30, 38 and 45.
//  ***** DO NOT USE GO ABOVE 60 FOR PWM CONTROL EXCEPT IN SETUP *****
//  For Sabertooth speeds are recommended as 50, 100 and 127
const byte DRIVESPEED1 = 30;
// set these 3 to whatever speeds work for you. 0-stop, 127-full speed.
// These may vary based on your drive system and power system
const byte DRIVESPEED2 = 38;
//Set to 0 if you only want 2 speeds.
const byte DRIVESPEED3 = 50;

// Default drive speed at startup
byte drivespeed = DRIVESPEED1;

// the higher this number the faster the droid will spin in place, lower - easier to control.
// Recommend beginner: 40 to 50, experienced: 50 $ up, I like 70
// This may vary based on your drive system and power system
const float TURNSPEED = 40;

// Set isLeftStickDrive to true for driving  with the left stick
// Set isLeftStickDrive to false for driving with the right stick (legacy and original configuration)
boolean isLeftStickDrive = true;

// If using a speed controller for the dome, sets the top speed. You'll want to vary it potenitally
// depending on your motor. My Pittman is really fast so I dial this down a ways from top speed.
// Use a number up to 127 for serial
const byte DOMESPEED = 127;

// Ramping- the lower this number the longer R2 will take to speedup or slow down,
// change this by incriments of 1
const byte RAMPING = 2;
unsigned long RampingMillis = 0;  //  Label for a timer to allow correct ramping while in the Deadzone
int RampingDeadzoneDelay = 200;   //  milliseconds in the DriveDeadzone before switching the speed to 0.  Recommend about 200

// Compensation is for deadband/deadzone checking. There's a little play in the neutral zone
// which gets a reading of a value of something other than 0 when you're not moving the stick.
// It may vary a bit across controllers and how broken in they are, sometimex 360 controllers
// develop a little bit of play in the stick at the center position. You can do this with the
// direct method calls against the Syren/Sabertooth library itself but it's not supported in all
// serial modes so just manage and check it in software here
// use the lowest number with no drift
// DOMEDEADZONERANGE for the left stick, DRIVEDEADZONERANGE for the right stick
const byte DOMEDEADZONERANGE = 20;
const byte DRIVEDEADZONERANGE = 22;  // Suggested 4-8 for Sabertooth, 15-25 for PWM Hubs

// Set the baude rate for the Sabertooth motor controller (feet)
// 9600 is the default baud rate for Sabertooth packet serial.
// for packetized options are: 2400, 9600, 19200 and 38400. I think you need to pick one that works
// and I think it varies across different firmware versions.
const int SABERTOOTHBAUDRATE = 9600;

// Set the baude rate for the Syren motor controller (dome)
// for packetized options are: 2400, 9600, 19200 and 38400. I think you need to pick one that works
// and I think it varies across different firmware versions.
const int DOMEBAUDRATE = 9600;

// Default sound volume at startup
// 0 = full volume, 255 off
byte vol = 25;


// Automation Delays
// set automateDelay to min and max seconds between sounds
byte automateDelay = random(5, 20);
//How much the dome may turn during automation.
int turnDirection = 20;

// Pin number to pull a relay high/low to trigger my upside down compressed air like R2's extinguisher
#define EXTINGUISHERPIN 3
#include <SoftwareSerial.h>
#include <Sabertooth.h>
//#include <MP3Trigger.h>
#include <DYPlayerArduino.h>
#include <Wire.h>
#include <XBOXRECV.h>

#include <Servo.h>
#include <Adafruit_PWMServoDriver.h>

#include <PololuMaestro.h>  // added the Maestro libray
//#include <SoftwareSerial.h>
// SoftwareSerial maestroSerial(10, 11);  //tx pin 11

MiniMaestro maestro(Serial3);  //hardware serial
//MiniMaestro maestrosserial(maestroSerial);  //software serial

/////////////////////////////////////////////////////////////////
#if FOOT_CONTROLLER == 0
Sabertooth Sabertooth2x(128, Serial1);
#endif
Sabertooth Syren10(128, Serial2);

// Satisfy IDE, which only needs to see the include statment in the ino.
#ifdef dobogusinclude
#include <spi4teensy3.h>
#endif

// Set some defaults for start up
// false = drive motors off ( right stick disabled ) at start
boolean isDriveEnabled = false;

// Automated functionality
// Used as a boolean to turn on/off automated functions like periodic random sounds and periodic dome turns
boolean isInAutomationMode = false;
unsigned long automateMillis = 0;
// Action number used to randomly choose a sound effect or a dome turn
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



//MP3Trigger mp3Trigger;
// Initialise the player, it defaults to using Serial.
DY::Player player;
USB Usb;
XBOXRECV Xbox(&Usb);

#if FOOT_CONTROLLER == 1
Servo leftFootSignal;   // Assign PWM signal for left foot drive ECS
Servo rightFootSignal;  // Assign PWM signal for right foot drive ECS
#endif

void setup() {

#if FOOT_CONTROLLER == 0
  Serial1.begin(SABERTOOTHBAUDRATE);
#endif
  Serial2.begin(DOMEBAUDRATE);
  Serial3.begin(9600); //start serial3 for the body Maestro
  // maestroSerial.begin(9600);

#if defined(SYRENSIMPLE)
  Syren10.motor(0);
#else
  Syren10.autobaud();
#endif

#if FOOT_CONTROLLER == 0
  Sabertooth2x.autobaud();
  // The Sabertooth won't act on mixed mode packet serial commands until
  // it has received power levels for BOTH throttle and turning, since it
  // mixes the two together to get diff-drive power levels for both motors.
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

  //mp3Trigger.setup();
  //mp3Trigger.setVolume(vol);

  player.begin();
  player.setVolume(vol);  // starting Volume

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

    speedSelectButton = L3;
    hpLightToggleButton = R3;
  }


  // Start I2C Bus. The body is the master.
  Wire.begin();

  //  Serial.begin(9600);
  // Wait for serial port to connect - used on Leonardo, Teensy and other boards with built-in USB CDC serial connection
  while (!Serial)
    ;
  if (Usb.Init() == -1) {
    //Serial.print(F("\r\nOSC did not start"));
    while (1)
      ;  //halt
  }
  // Serial.print(F("\r\nXbox Wireless Receiver Library Started"));
}


void loop() {
  Usb.Task();
  // if we're not connected, return so we don't bother doing anything else.
  // set all movement to 0 so if we lose connection we don't have a runaway droid!
  // a restraining bolt and jawa droid caller won't save us here!
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

    // If controller is disconnected, but was in automation mode, then droid will continue
    // to play random sounds and dome movements
    // if (isInAutomationMode) {
    //   triggerAutomation();
    // }
    // if (!manuallyDisabledController) {
    // }

    return;
  }

  // After the controller connects, Blink all the LEDs so we know drives are disengaged at start
  if (!firstLoadOnConnect) {
    firstLoadOnConnect = true;
    //mp3Trigger.play(21);
    player.playSpecified(21);
    Xbox.setLedMode(ROTATING, 0);
  }

  if (Xbox.getButtonClick(XBOX, 0)) {
    if (Xbox.getButtonPress(L1, 0) && Xbox.getButtonPress(R1, 0)) {
      Xbox.disconnect(0);
    }
  }

  // enable / disable right stick (droid movement) & play a sound to signal motor state
  if (Xbox.getButtonClick(START, 0)) {
    if (isDriveEnabled) {
      isDriveEnabled = false;
      Xbox.setLedMode(ROTATING, 0);
      player.playSpecified(53);
      // mp3Trigger.play(53);
      Serial.println("Start pressed");
    } else {
      isDriveEnabled = true;
      //mp3Trigger.play(52);
      player.playSpecified(52);
      Serial.println("Start pressed");
      // //When the drive is enabled, set our LED accordingly to indicate speed
      if (drivespeed == DRIVESPEED1) {
        Xbox.setLedOn(LED1, 0);
      } else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0)) {
        Xbox.setLedOn(LED2, 0);
      } else {
        Xbox.setLedOn(LED3, 0);
      }
    }
  }

  //Toggle automation mode with the BACK button
  if (Xbox.getButtonClick(BACK, 0)) {
    if (isInAutomationMode) {
      isInAutomationMode = false;
      automateAction = 0;
      //mp3Trigger.play(53);
      player.playSpecified(53);
      Serial.println("Back button pressed");
    } else {
      isInAutomationMode = true;
      //mp3Trigger.play(52);
      player.playSpecified(52);
      Serial.println("Back button pressed");
    }
  }

  // Plays random sounds or dome movements for automations when in automation mode
  if (isInAutomationMode) {
    unsigned long currentMillis = millis();

    if (currentMillis - automateMillis > (automateDelay * 1000)) {
      automateMillis = millis();
      automateAction = random(1, 5);

      if (automateAction > 1) {
        // mp3Trigger.play(random(32, 52));
        player.playSpecified(random(32, 52));
      }
      if (automateAction < 4) {
#if defined(SYRENSIMPLE)
        Syren10.motor(turnDirection);
#else
        Syren10.motor(1, turnDirection);
#endif

        delay(750);

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

      // sets the mix, max seconds between automation actions - sounds and dome movement
      automateDelay = random(3, 10);
    }
  }

  // Volume Control of MP3 Trigger
  // Hold R1 and Press Up/down on D-pad to increase/decrease volume
  if (Xbox.getButtonClick(UP, 0)) {
    // volume up
    if (Xbox.getButtonPress(R1, 0)) {
      if (vol > 0) {
        vol--;
        // mp3Trigger.setVolume(vol);
        player.setVolume(vol);
      }
    }
  }
  if (Xbox.getButtonClick(DOWN, 0)) {
    //volume down
    if (Xbox.getButtonPress(R1, 0)) {
      if (vol < 30) {
        vol++;
        //  mp3Trigger.setVolume(vol);
        player.setVolume(vol);
      }
    }
  }

  // Logic display brightness.
  /*  // Hold L1 and press up/down on dpad to increase/decrease brightness
    if (Xbox.getButtonClick(UP, 0)) {
      if (Xbox.getButtonPress(L1, 0)) {
        triggerI2C(10, 24);
      }
    }
    if (Xbox.getButtonClick(DOWN, 0)) {
      if (Xbox.getButtonPress(L1, 0)) {
        triggerI2C(10, 25);
      }
    }
  */
  //Maestro stuff here

  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(UP, 0)) {
      // maestrosserial.restartScript(0);
      maestro.restartScript(0);
    }
  }

  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(RIGHT, 0)) {
      // maestrosserial.restartScript(1);
      maestro.restartScript(1);
    }
  }
  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(DOWN, 0)) {
      // maestrosserial.restartScript(2);
      maestro.restartScript(2);
    }
  }

  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(LEFT, 0)) {
      // maestrosserial.restartScript(3);
      maestro.restartScript(3);
    }
  }
  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(UP, 0)) {
      // maestrosserial.restartScript(4);
      maestro.restartScript(4);
      //mp3Trigger.play(1);
    }
  }
  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(RIGHT, 0)) {
      // maestrosserial.restartScript(5);
      maestro.restartScript(5);
      // mp3Trigger.play(3);
      player.playSpecified(3);
    }
  }
  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(DOWN, 0)) {
      // maestrosserial.restartScript(6);
      maestro.restartScript(6);
    }
  }

  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonPress(LEFT, 0)) {
      // maestrosserial.restartScript(7);
      maestro.restartScript(7);
    }
  }



  /*
    //FIRE EXTINGUISHER
    // When holding L2-UP, extinguisher is spraying. WHen released, stop spraying

    // TODO: ADD SERVO DOOR OPEN FIRST. ONLY ALLOW EXTINGUISHER ONCE IT'S SET TO 'OPENED'
    // THEN CLOSE THE SERVO DOOR
    if (Xbox.getButtonPress(L1, 0)) {
      if (Xbox.getButtonPress(UP, 0)) {
        digitalWrite(EXTINGUISHERPIN, LOW);
      } else {
        digitalWrite(EXTINGUISHERPIN, HIGH);
      }
    }

  */
  // GENERAL SOUND PLAYBACK AND DISPLAY CHANGING

  // Y Button and Y combo buttons
  if (Xbox.getButtonClick(Y, 0)) {
    if (Xbox.getButtonPress(L1, 0)) {
      //mp3Trigger.play(8);
      player.playSpecified(8);
      //logic lights, random
      triggerI2C(10, 0);
    } else if (Xbox.getButtonPress(L2, 0)) {
      //mp3Trigger.play(2);
      player.playSpecified(2);
      //logic lights, random
      triggerI2C(10, 0);
    } else if (Xbox.getButtonPress(R1, 0)) {
      //mp3Trigger.play(9);
      player.playSpecified(9);
      //logic lights, random
      triggerI2C(10, 0);
    } else {
      // mp3Trigger.play(random(13, 17));

      player.playSpecified(random(13, 17));
      //logic lights, random
      triggerI2C(10, 0);
    }
  }

  // A Button and A combo Buttons
  if (Xbox.getButtonClick(A, 0)) {
    if (Xbox.getButtonPress(L1, 0)) {
      //mp3Trigger.play(6);
      player.playSpecified(6);
      //logic lights
      triggerI2C(10, 6);
      // HPEvent 11 - SystemFailure - I2C
      triggerI2C(25, 11);
      triggerI2C(26, 11);
      triggerI2C(27, 11);
    } else if (Xbox.getButtonPress(L2, 0)) {
      //mp3Trigger.play(1);
      player.playSpecified(1);
      //logic lights, alarm
      triggerI2C(10, 1);
      //  HPEvent 3 - alarm - I2C
      triggerI2C(25, 3);
      triggerI2C(26, 3);
      triggerI2C(27, 3);
    } else if (Xbox.getButtonPress(R1, 0)) {
      // mp3Trigger.play(11);
      player.playSpecified(11);
      //logic lights, alarm2Display
      triggerI2C(10, 11);
    } else {

      //mp3Trigger.play(random(17, 25));
      player.playSpecified(random(17, 25));
      //logic lights, random
      triggerI2C(10, 0);
    }
  }

  // B Button and B combo Buttons
  if (Xbox.getButtonClick(B, 0)) {
    if (Xbox.getButtonPress(L1, 0)) {
      //mp3Trigger.play(7);
      player.playSpecified(7);
      //logic lights, random
      triggerI2C(10, 0);
    } else if (Xbox.getButtonPress(L2, 0)) {
      //mp3Trigger.play(3);
      player.playSpecified(3);
      //logic lights, random
      triggerI2C(10, 0);
    } else if (Xbox.getButtonPress(R1, 0)) {
      //mp3Trigger.play(10);
      player.playSpecified(10);
      //logic lights bargrap
      triggerI2C(10, 10);
      // HPEvent 1 - Disco - I2C
      triggerI2C(25, 10);
      triggerI2C(26, 10);
      triggerI2C(27, 10);
    } else {
      //mp3Trigger.play(random(32, 52));
      player.playSpecified(random(32, 52));
      //logic lights, random
      triggerI2C(10, 0);
    }
  }

  // X Button and X combo Buttons
  if (Xbox.getButtonClick(X, 0)) {
    // leia message L1+X
    if (Xbox.getButtonPress(L1, 0)) {
      //mp3Trigger.play(5);
      player.playSpecified(5);
      //logic lights, leia message
      triggerI2C(10, 5);
      // Front HPEvent 1 - HoloMessage - I2C -leia message
      triggerI2C(25, 9);
    } else if (Xbox.getButtonPress(L2, 0)) {
      //mp3Trigger.play(4);
      player.playSpecified(4);
      //logic lights
      triggerI2C(10, 4);
    } else if (Xbox.getButtonPress(R1, 0)) {
      //mp3Trigger.play(12);
      player.playSpecified(12);
      //logic lights, random
      triggerI2C(10, 0);
    } else {
      //mp3Trigger.play(random(25, 32));
      player.playSpecified(random(32, 52));
      //logic lights, random
      triggerI2C(10, 0);
    }
  }

  // turn hp light on & off with Right Analog Stick Press (R3) for left stick drive mode
  // turn hp light on & off with Left Analog Stick Press (L3) for right stick drive mode
  if (Xbox.getButtonClick(hpLightToggleButton, 0)) {
    // if hp light is on, turn it off
    if (isHPOn) {
      isHPOn = false;
      // turn hp light off
      // Front HPEvent 2 - ledOFF - I2C
      triggerI2C(25, 2);
    } else {
      isHPOn = true;
      // turn hp light on
      // Front HPEvent 4 - whiteOn - I2C
      triggerI2C(25, 1);
    }
  }


  // Change drivespeed if drive is enabled
  // Press Left Analog Stick (L3) for left stick drive mode
  // Press Right Analog Stick (R3) for right stick drive mode
  // Set LEDs for speed - 1 LED, Low. 2 LED - Med. 3 LED High
  if (Xbox.getButtonClick(speedSelectButton, 0) && isDriveEnabled) {
    //if in lowest speed
    if (drivespeed == DRIVESPEED1) {
      //change to medium speed and play sound 3-tone
      drivespeed = DRIVESPEED2;
      Xbox.setLedOn(LED2, 0);
      // mp3Trigger.play(53);
      player.playSpecified(53);
      triggerI2C(10, 22);
    } else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0)) {
      //change to high speed and play sound scream
      drivespeed = DRIVESPEED3;
      Xbox.setLedOn(LED3, 0);
      //mp3Trigger.play(1);
      player.playSpecified(1);
      triggerI2C(10, 23);
    } else {
      //we must be in high speed
      //change to low speed and play sound 2-tone
      drivespeed = DRIVESPEED1;
      Xbox.setLedOn(LED1, 0);
      //mp3Trigger.play(52);
      player.playSpecified(52);
      triggerI2C(10, 21);
    }
  }



// FOOT DRIVES
// Xbox 360 analog stick values are signed 16 bit integer value
#if FOOT_CONTROLLER == 0
  // Sabertooth runs at 8 bit signed. -127 to 127 for speed (full speed reverse and  full speed forward)
  // Map the 360 stick values to our min/max current drive speed
  throttleStickValue = (map(Xbox.getAnalogHat(throttleAxis, 0), -32768, 32767, -drivespeed, drivespeed));

  if (throttleStickValue < -DRIVEDEADZONERANGE || throttleStickValue > DRIVEDEADZONERANGE) {
    RampingMillis = millis();
  }

  if (throttleStickValue > -DRIVEDEADZONERANGE && throttleStickValue < DRIVEDEADZONERANGE && (millis() - RampingMillis > RampingDeadzoneDelay)) {
    // stick is in dead zone - don't drive
    driveThrottle = 0;
    stopFeet();
  } else {
    if (isInAutomationMode) {  // Turn off automation if using the drive motors
      isInAutomationMode = false;
      automateAction = 0;
    }
    if (driveThrottle < throttleStickValue) {
      if (throttleStickValue - driveThrottle > (RAMPING)) {
        driveThrottle += RAMPING;
      } else {
        driveThrottle = throttleStickValue;
      }
    } else if (driveThrottle > throttleStickValue) {
      if (driveThrottle - throttleStickValue > (RAMPING)) {
        driveThrottle -= RAMPING;
      } else {
        driveThrottle = throttleStickValue;
      }
    }
  }

  turnThrottle = map(Xbox.getAnalogHat(turnAxis, 0), -32768, 32767, -TURNSPEED, TURNSPEED);

  // DRIVE!
  // right stick (drive)
  if (isDriveEnabled) {
    // Only do deadzone check for turning here. Our Drive throttle speed has some math applied
    // for RAMPING and stuff, so just keep it separate here
    if (turnThrottle > -DRIVEDEADZONERANGE && turnThrottle < DRIVEDEADZONERANGE) {
      // stick is in dead zone - don't turn
      turnThrottle = 0;
    }
    Sabertooth2x.turn(-turnThrottle);
    Sabertooth2x.drive(driveThrottle);
  }
#elif FOOT_CONTROLLER == 1
  //Experimental Hub Drive Code. Use at your own risk and test operation fully before going out in public.
  throttleStickValueraw = Xbox.getAnalogHat(throttleAxis, 0);
  turnThrottleraw = Xbox.getAnalogHat(turnAxis, 0);

  if (isDriveEnabled) {

    if ((Xbox.getButtonPress(L1, 0)) && (Xbox.getButtonPress(L2, 0)) && (Xbox.getButtonPress(R1, 0)) && (Xbox.getButtonPress(R2, 0)) && (drivespeed == DRIVESPEED3)) {
      CalibrationMode = true;
    } else {
      CalibrationMode = false;
    }

    if (CalibrationMode == false) {
      mixHubDrive(turnThrottleraw, throttleStickValueraw, drivespeed);  // Call function to get values for leftFoot and rightFoot
    } else {
      mixHubDrive(turnThrottleraw, throttleStickValueraw, CalibrationSpeed);  // Call function to get values for leftFoot and rightFoot using absolute max speed (127) for calibration
    }

    if ((isInAutomationMode) && ((leftFoot != 90) || (rightFoot != 90))) {  // Turn off automation if using the drive motors
      isInAutomationMode = false;
      automateAction = 0;
    }

    leftFootSignal.write(leftFoot);
    rightFootSignal.write(rightFoot);

    // }
  } else {
    stopFeet();
  }
#endif

  // DOME DRIVE!
  domeThrottle = (map(Xbox.getAnalogHat(domeAxis, 0), -32768, 32767, DOMESPEED, -DOMESPEED));
  if (domeThrottle > -DOMEDEADZONERANGE && domeThrottle < DOMEDEADZONERANGE) {
    //stick in dead zone - don't spin dome
    domeThrottle = 0;
  }

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

// =======================================================================================
// //////////////////////////Mixing Function for R/C Mode////////////////////////////////
// =======================================================================================
// Inspired by KnightShade's SHADOW code with contributions for PWM Motor Controllers by JoyMonkey/Paul Murphy and Brad/BHD
#if FOOT_CONTROLLER == 1
void mixHubDrive(int stickX, int stickY, byte maxDriveSpeed) {
  // 180,180 = both feet full speed forward.
  // 000,000 = both feet full speed reverse.
  // 180,000 = left foot full forward, right foot full reverse (spin droid clockwise)
  // 000,180 = left foot full reverse, right foot full forward (spin droid counter-clockwise)
  // 090,090 = no movement
  //  Ramping and Speed mode applied on the droid.

  if (stickX <= (-DRIVEDEADZONERANGE * 258) || stickX >= (DRIVEDEADZONERANGE * 258) || stickY <= (-DRIVEDEADZONERANGE * 258) || stickY >= (DRIVEDEADZONERANGE * 258)) {
    RampingMillis = millis();
  }

  if (stickX <= (-DRIVEDEADZONERANGE * 258) || stickX >= (DRIVEDEADZONERANGE * 258) || stickY <= (-DRIVEDEADZONERANGE * 258) || stickY >= (DRIVEDEADZONERANGE * 258) || (millis() - RampingMillis < RampingDeadzoneDelay)) {
    //  if movement outside deadzone then map stick value to  maxDriveSpeed
    //  Map to easy grid -100 to 100 in both axis, including deadzones.
    int Y_Stick_Normalised = 0;

    Y_Stick_Normalised = (map(stickY, -32768, 32767, -100, 100));  //  Map the up-down direction stick value to Drive speed

    if (YDist < Y_Stick_Normalised) {
      if (Y_Stick_Normalised - YDist > (RAMPING)) {
        YDist += RAMPING;
      } else {
        YDist = Y_Stick_Normalised;
      }
    } else if (YDist > Y_Stick_Normalised) {
      if (YDist - Y_Stick_Normalised > (RAMPING)) {
        YDist -= RAMPING;
      } else {
        YDist = Y_Stick_Normalised;
      }
    }

    XDist = (map(stickX, -32768, 32767, -100, 100));  //  Map the left-right direction stick value to Turn speed


    // Simple mixing of stick spped and turn values to give left and right values
    float RightSpeed = (YDist - (XDist * (TURNSPEED / 100)));
    float LeftSpeed = (YDist + (XDist * (TURNSPEED / 100)));

    int maxServoForward = map(maxDriveSpeed, 0, 127, 90, 180);  //drivespeed was defined as 0 to 127 for Sabertooth serial, now we want something in a servo range (90 to 180)
    int maxServoReverse = map(maxDriveSpeed, 0, 127, 90, 0);    //drivespeed was defined as 0 to 127 for Sabertooth serial, now we want something in a servo range (90 to 0)

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
      //  if stick positions have been in dead zone for >RampingDeadzoneDelay set foot speed to 90 i.e. stopped
      leftFoot = 90;
      rightFoot = 90;
    }
  }
}
#endif
