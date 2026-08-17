// ************************** Options, Configurations, and Settings ***********************************

// SPEED AND TURN SPEEDS
const byte DRIVESPEED1 = 90;
const byte DRIVESPEED2 = 110;
const byte DRIVESPEED3 = 127;

byte drivespeed = DRIVESPEED1;
const byte TURNSPEED = 70;
boolean isLeftStickDrive = true; 
const byte DOMESPEED = 127;
const byte RAMPING = 2;

const byte DOMEDEADZONERANGE = 7;
const byte DRIVEDEADZONERANGE = 7;

const int SABERTOOTHBAUDRATE = 9600;
const int DOMEBAUDRATE = 9600;

int vol = 14;
byte automateDelay = random(6, 12); 
int turnDirection = 75; 

#define EXTINGUISHERPIN 3

#include <Sabertooth.h>
#include <MD_YX5300.h>
#include <Wire.h>
#include <XBOXRECV.h>
#include <Adafruit_PWMServoDriver.h>

// USAMOS SERIAL NATIVO (Pines 0 y 1)
#define MP3Stream Serial  

MD_YX5300 mp3(MP3Stream);

Adafruit_PWMServoDriver pwm1 = Adafruit_PWMServoDriver(0x40);
Adafruit_PWMServoDriver pwm2 = Adafruit_PWMServoDriver(0x41);
uint8_t servonum = 0;

// Puertas del cuerpo (Breadpan)
int LeftDoorOpen=300;     
int LeftDoorClose=487;    
int RightDoorOpen=320;    
int RightDoorClose=170;   

// Brazos y herramientas
int GripperOpen=270;        
int GripperClose=360;       
int GripperArmIn=170;       
int GripperArmOut=620;      
int InterOut=430;           
int InterIn=140;            
int InterArmIn=620;         
int InterArmOut=190;        
int UpperUtilOut = 535;     
int UpperUtilIn = 130;       
int LowerUtilOut =535;      
int LowerUtilIn = 130;      
int dataportDoorOpen=360;   
int dataportDoorClose=180;  
int chargebayDoorOpen=180;  
int chargebayDoorClose=310; 

// Paneles del Domo (Zona 2)
int pieChannel[] = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
int pieOpen[] = { 420,420,420,420,420,420,420,420,420,420,420 };
int pieClose[] = { 180,180,180,180,180,180,180,180,180,180,180 };

Sabertooth Sabertooth2x(128, Serial1);
Sabertooth Syren10(128, Serial2);

#ifdef dobogusinclude
#include <spi4teensy3.h>
#endif

boolean isDriveEnabled = false;
boolean isInAutomationMode = false;
unsigned long automateMillis = 0;

int driveThrottle = 0;
int throttleStickValue = 0;
int domeThrottle = 0;
int turnThrottle = 0;

boolean firstLoadOnConnect = false;

AnalogHatEnum throttleAxis;
AnalogHatEnum turnAxis;
AnalogHatEnum domeAxis;

ButtonEnum speedSelectButton;
ButtonEnum hpLightToggleButton;

boolean isHPOn = false;

int GripperAni1a = 0; 
int InterAni1a = 0; 

int lastUpperUtil = -1;
int lastLowerUtil = -1;
int lastDataport = -1;
int lastChargebay = -1;
int lastGripPhase = -1;
int lastInterPhase = -1;

int lastDriveThrottleSent = -1;
int lastTurnThrottleSent = -1;

USB Usb;
XBOXRECV Xbox(&Usb);

// VARIABLES PARA CONTROLAR LOS PANELES Y EL DOMO SIN DELAY
unsigned long domeTurnMillis = 0;
boolean isDomeTurningAuto = false;
unsigned long actualDomeTurnTime = 1500; 
int sameDirectionCount = 0;             
unsigned long piePanelMillis = 0;
int currentPieIndex = -1; 
enum PieState { PIE_IDLE, PIE_OPENING, PIE_CLOSING };
PieState currentPieState = PIE_IDLE;

void setup() {
  MP3Stream.begin(MD_YX5300::SERIAL_BPS);
  mp3.begin();
  mp3.volume(vol);
  Serial1.begin(SABERTOOTHBAUDRATE);
  Serial2.begin(DOMEBAUDRATE);

  pwm1.begin();
  pwm1.setPWMFreq(60);  
  pwm2.begin();
  pwm2.setPWMFreq(60);  
  
#if defined(SYRENSIMSIMPLE)
  Syren10.motor(0);
#else
  Syren10.autobaud();
#endif

  Sabertooth2x.autobaud();
  Sabertooth2x.drive(0);
  Sabertooth2x.turn(0);

  Sabertooth2x.setTimeout(950);
  Syren10.setTimeout(950);

  pinMode(EXTINGUISHERPIN, OUTPUT);
  digitalWrite(EXTINGUISHERPIN, HIGH);

  if(isLeftStickDrive) {
    throttleAxis = LeftHatY;
    turnAxis = LeftHatX;
    domeAxis = RightHatX;
    speedSelectButton = L3;
    hpLightToggleButton = R3;
  } else {
    throttleAxis = RightHatY;
    turnAxis = RightHatX;
    domeAxis = LeftHatX;
    speedSelectButton = R3;
    hpLightToggleButton = L3;
  }

  Wire.begin();
  Wire.setClock(100000); 

  randomSeed(analogRead(0)); 

  delay(500); 
  if (Usb.Init() == -1) {
    // No bloqueamos
  }
}

void loop() {
  Usb.Task();
  mp3.check(); 

  // CORREGIDO: FRENO DE EMERGENCIA BLINDADO "ANTI-ACCIDENTES"
  if (!Xbox.XboxReceiverConnected || !Xbox.Xbox360Connected[0]) {
    Sabertooth2x.drive(0); // Frena ruedas al instante
    Sabertooth2x.turn(0);
    Syren10.motor(1, 0);   // Frena el domo al instante
    
    // Reseteamos todas las memorias y filtros a cero para evitar tirones al reconectar
    driveThrottle = 0;
    turnThrottle = 0;
    throttleStickValue = 0;
    lastDriveThrottleSent = 0;
    lastTurnThrottleSent = 0;
    
    // Bloqueo de seguridad: Desactiva los motores (requiere pulsar START de nuevo al reconectar)
    isDriveEnabled = false; 
    isInAutomationMode = false;
    isDomeTurningAuto = false;
    
    firstLoadOnConnect = false;
    return;
  }

  if (!firstLoadOnConnect) {
    firstLoadOnConnect = true;
    mp3.playTrack(21);
    Xbox.setLedMode(ROTATING, 0);
  }
  
  if (Xbox.getButtonClick(XBOX, 0)) {
    if(Xbox.getButtonPress(L1, 0) && Xbox.getButtonPress(R1, 0)){ 
      Xbox.disconnect(0);
    }
  }

  if (Xbox.getButtonClick(START, 0)) {
    if (isDriveEnabled) {
      isDriveEnabled = false;
      Xbox.setLedMode(ROTATING, 0);
      mp3.playTrack(53);
      Sabertooth2x.drive(0);
      Sabertooth2x.turn(0);
      lastDriveThrottleSent = 0;
      lastTurnThrottleSent = 0;
    } else {
      isDriveEnabled = true;
      mp3.playTrack(52);
      if (drivespeed == DRIVESPEED1) { Xbox.setLedOn(LED1, 0); } 
      else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0)) { Xbox.setLedOn(LED2, 0); } 
      else { Xbox.setLedOn(LED3, 0); }
    }
  }

  if (Xbox.getButtonClick(BACK, 0)) {
    if (isInAutomationMode) { isInAutomationMode = false; mp3.playTrack(53); } 
    else { isInAutomationMode = true; mp3.playTrack(52); }
  }

  // AUTOMATIZACIÓN 
  if (isInAutomationMode) {
    unsigned long currentMillis = millis();

    if (!isDomeTurningAuto) {
      if (currentMillis - automateMillis > (automateDelay * 1000)) {
        automateMillis = currentMillis; 
        mp3.playTrack(random(32, 52));
        int newDirection = (random(0, 2) == 0) ? 75 : -75;

        if (newDirection == turnDirection) {
          sameDirectionCount++;
          if (sameDirectionCount >= 2) {
            newDirection = -newDirection;
            sameDirectionCount = 0;
          }
        } else {
          sameDirectionCount = 0;
        }
        
        turnDirection = newDirection;
        actualDomeTurnTime = random(1200, 2201);
        domeTurnMillis = currentMillis; 
        isDomeTurningAuto = true;       
      }
    }

    if (isDomeTurningAuto) {
      if (currentMillis - domeTurnMillis < actualDomeTurnTime) {
        Syren10.motor(1, turnDirection); 
      } 
      else {
        Syren10.motor(1, 0); 
        isDomeTurningAuto = false;
        automateMillis = currentMillis; 
        automateDelay = random(6, 14);  
      }
    }
  }

  // CONTROL DE VOLUMEN
  if(Xbox.getButtonClick(UP, 0)){
    if(Xbox.getButtonPress(R1, 0)){ if (vol < 30){ vol = vol + 2; mp3.volume(vol); } }
  }
  if(Xbox.getButtonClick(DOWN, 0)){
    if(Xbox.getButtonPress(R1, 0)){ if (vol > 0){ vol = vol - 2; mp3.volume(vol); } }
  }

  // Brazos de utilidad (L1 + Cruceta)
  if (Xbox.getButtonPress(L1, 0)) {
    if (Xbox.getButtonPress(LEFT, 0)) {
      if(lastUpperUtil != UpperUtilIn) { pwm1.setPWM(5,0,UpperUtilIn); lastUpperUtil = UpperUtilIn; }
      if(lastLowerUtil != LowerUtilIn) { pwm1.setPWM(4,0,LowerUtilIn); lastLowerUtil = LowerUtilIn; }
    } 
    if (Xbox.getButtonPress(RIGHT, 0)) {
      if(lastUpperUtil != UpperUtilOut) { pwm1.setPWM(5,0,UpperUtilOut); lastUpperUtil = UpperUtilOut; }
      if(lastLowerUtil != LowerUtilOut) { pwm1.setPWM(4,0,LowerUtilOut); lastLowerUtil = LowerUtilOut; }
      if(lastChargebay != chargebayDoorClose) { pwm1.setPWM(9,0,chargebayDoorClose); lastChargebay = chargebayDoorClose; }
      if(lastDataport != dataportDoorClose) { pwm1.setPWM(8,0,dataportDoorClose); lastDataport = dataportDoorClose; }
    } 
  }

  // ACTIVADORES DE ANIMACIÓN
  if (Xbox.getButtonPress(L2, 0)) {
    if (Xbox.getButtonClick(LEFT, 0)) { GripperAni1a = 1000; } 
    if (Xbox.getButtonClick(RIGHT, 0)) { InterAni1a = 1000; } 
  }

  // Dataports y Zona 2 (R2 + Cruceta)
  if (Xbox.getButtonPress(R2, 0)) {
    if (Xbox.getButtonPress(LEFT, 0)) {
      if(lastDataport != dataportDoorOpen) { pwm1.setPWM(8,0,dataportDoorOpen); lastDataport = dataportDoorOpen; }
    } 
    if (Xbox.getButtonPress(RIGHT, 0)) {
      if(lastChargebay != chargebayDoorOpen) { pwm1.setPWM(9,0,chargebayDoorOpen); lastChargebay = chargebayDoorOpen; }
    } 
    if (Xbox.getButtonPress(UP, 0)) {
      zona2Open(); 
    }
    if (Xbox.getButtonPress(DOWN, 0)) {
      zona2Close(); 
    }
  }

  // Animación Gripper Arm 
  if(GripperAni1a > 0) {
    GripperAni1a--;
    if(GripperAni1a < 2) { if(lastGripPhase != 1) { pwm1.setPWM(1,0,RightDoorClose); lastGripPhase = 1; } }
    else if (GripperAni1a < 150) { if(lastGripPhase != 2) { pwm1.setPWM(2,0,GripperArmIn); lastGripPhase = 2; } }
    else if (GripperAni1a < 250) { if(lastGripPhase != 3) { pwm1.setPWM(3,0,GripperClose); lastGripPhase = 3; } }
    else if (GripperAni1a < 350) { if(lastGripPhase != 4) { pwm1.setPWM(3,0,GripperOpen); lastGripPhase = 4; } }
    else if (GripperAni1a < 450) { if(lastGripPhase != 5) { pwm1.setPWM(3,0,GripperClose); lastGripPhase = 5; } }
    else if (GripperAni1a < 550) { if(lastGripPhase != 6) { pwm1.setPWM(3,0,GripperOpen); lastGripPhase = 6; } }
    else if (GripperAni1a < 800) { if(lastGripPhase != 7) { pwm1.setPWM(2,0,GripperArmOut); lastGripPhase = 7; } }
    else if (GripperAni1a < 900) { if(lastGripPhase != 8) { pwm1.setPWM(1,0,RightDoorOpen); lastGripPhase = 8; } }
  } else { lastGripPhase = -1; }

  // Animación Interface Arm 
  if(InterAni1a > 0) {
    InterAni1a--;
    if(InterAni1a < 2) { if(lastInterPhase != 1) { pwm1.setPWM(0,0,LeftDoorClose); lastInterPhase = 1; } }
    else if (InterAni1a < 150) { if(lastInterPhase != 2) { pwm1.setPWM(6,0,InterArmIn); lastInterPhase = 2; } }
    else if (InterAni1a < 250) { if(lastInterPhase != 3) { pwm1.setPWM(7,0,InterIn); lastInterPhase = 3; } }
    else if (InterAni1a < 350) { if(lastInterPhase != 4) { pwm1.setPWM(7,0,InterOut); lastInterPhase = 4; } }
    else if (InterAni1a < 450) { if(lastInterPhase != 5) { pwm1.setPWM(7,0,InterIn); lastInterPhase = 5; } }
    else if (InterAni1a < 550) { if(lastInterPhase != 6) { pwm1.setPWM(7,0,InterOut); lastInterPhase = 6; } }
    else if (InterAni1a < 800) { if(lastInterPhase != 7) { pwm1.setPWM(6,0,InterArmOut); lastInterPhase = 7; } }
    else if (InterAni1a < 900) { if(lastInterPhase != 8) { pwm1.setPWM(0,0,LeftDoorOpen); lastInterPhase = 8; } }
  } else { lastInterPhase = -1; }

  // REPRODUCCIÓN DE SONIDOS CON BOTONES (Y, A, B, X)
  if (Xbox.getButtonClick(Y, 0)) {
    if (Xbox.getButtonPress(L1, 0)) { mp3.playTrack(8); triggerI2C(10, 0); } 
    else if (Xbox.getButtonPress(L2, 0)) { mp3.playTrack(2); triggerI2C(10, 0); } 
    else if (Xbox.getButtonPress(R1, 0)) { mp3.playTrack(9); triggerI2C(10, 0); } 
    else { mp3.playTrack(random(13, 17)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(A, 0)) {
    if (Xbox.getButtonPress(L1, 0)) { mp3.playTrack(6); triggerI2C(10, 6); } 
    else if (Xbox.getButtonPress(L2, 0)) { mp3.playTrack(1); triggerI2C(10, 1); } 
    else if (Xbox.getButtonPress(R1, 0)) { mp3.playTrack(11); triggerI2C(10, 11); } 
    else { mp3.playTrack(random(17, 25)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(B, 0)) {
    if (Xbox.getButtonPress(L1, 0)) { mp3.playTrack(7); triggerI2C(10, 0); } 
    else if (Xbox.getButtonPress(L2, 0)) { mp3.playTrack(3); triggerI2C(10, 0); } 
    else if (Xbox.getButtonPress(R1, 0)) { mp3.playTrack(10); triggerI2C(10, 10); } 
    else { mp3.playTrack(random(32, 52)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(X, 0)) {
    if (Xbox.getButtonPress(L1, 0)) { mp3.playTrack(5); triggerI2C(10, 5); } 
    else if (Xbox.getButtonPress(L2, 0)) { mp3.playTrack(4); triggerI2C(10, 4); } 
    else if (Xbox.getButtonPress(R1, 0)) { mp3.playTrack(12); triggerI2C(10, 0); } 
    else { mp3.playTrack(random(25, 32)); triggerI2C(10, 0); }
  }

  if (Xbox.getButtonClick(hpLightToggleButton, 0))  {
    if (isHPOn) { isHPOn = false; } else { isHPOn = true; }
  }

  if (Xbox.getButtonClick(speedSelectButton, 0) && isDriveEnabled) {
    if (drivespeed == DRIVESPEED1) { drivespeed = DRIVESPEED2; Xbox.setLedOn(LED2, 0); mp3.playTrack(53); triggerI2C(10, 22); } 
    else if (drivespeed == DRIVESPEED2 && (DRIVESPEED3 != 0)) { drivespeed = DRIVESPEED3; Xbox.setLedOn(LED3, 0); mp3.playTrack(1); triggerI2C(10, 23); } 
    else { drivespeed = DRIVESPEED1; Xbox.setLedOn(LED1, 0); mp3.playTrack(52); triggerI2C(10, 21); }
  }

  // MOVIMIENTO MOTORES DE LOS PIES
  throttleStickValue = (map(Xbox.getAnalogHat(throttleAxis, 0), -32768, 32767, -drivespeed, drivespeed));
  if (throttleStickValue > -DRIVEDEADZONERANGE && throttleStickValue < DRIVEDEADZONERANGE) {
    driveThrottle = 0;
  } else {
    if (driveThrottle < throttleStickValue) {
      if (throttleStickValue - driveThrottle < (RAMPING + 1) ) { driveThrottle += RAMPING; } 
      else { driveThrottle = throttleStickValue; }
    } else if (driveThrottle > throttleStickValue) {
      if (driveThrottle - throttleStickValue < (RAMPING + 1) ) { driveThrottle -= RAMPING; } 
      else { driveThrottle = throttleStickValue; }
    }
  }

  turnThrottle = map(Xbox.getAnalogHat(turnAxis, 0), -32768, 32767, -TURNSPEED, TURNSPEED);

  if (isDriveEnabled) {
    if (turnThrottle > -DRIVEDEADZONERANGE && turnThrottle < DRIVEDEADZONERANGE) { turnThrottle = 0; }
    if (driveThrottle != lastDriveThrottleSent || turnThrottle != lastTurnThrottleSent) {
      Sabertooth2x.turn(-turnThrottle);
      Sabertooth2x.drive(driveThrottle);
      lastDriveThrottleSent = driveThrottle;
      lastTurnThrottleSent = turnThrottle;
    }
  }

  // MOVIMIENTO MOTOR DEL DOMO MANUAL 
  domeThrottle = (map(Xbox.getAnalogHat(domeAxis, 0), -32768, 32767, DOMESPEED, -DOMESPEED));
  if (domeThrottle > -DOMEDEADZONERANGE && domeThrottle < DOMEDEADZONERANGE) { domeThrottle = 0; }
  Syren10.motor(1, domeThrottle);

  // CONTROL PROGRESIVO DE LOS PANELES DEL DOMO (ZONA 2)
  if (currentPieState == PIE_OPENING) {
    if (millis() - piePanelMillis >= 30) { 
      piePanelMillis = millis();
      pwm2.setPWM(pieChannel[currentPieIndex], 0, pieOpen[currentPieIndex]);
      currentPieIndex++;
      if (currentPieIndex > 10) { currentPieState = PIE_IDLE; }
    }
  }
  else if (currentPieState == PIE_CLOSING) {
    if (millis() - piePanelMillis >= 30) { 
      piePanelMillis = millis();
      pwm2.setPWM(pieChannel[currentPieIndex], 0, pieClose[currentPieIndex]);
      currentPieIndex--;
      if (currentPieIndex < 0) { currentPieState = PIE_IDLE; }
    }
  }
}

// FUNCIONES DE INICIO ASÍNCRONO DEL DOMO
void zona2Open() {
  if (currentPieState != PIE_OPENING) {
    currentPieState = PIE_OPENING;
    currentPieIndex = 0;
    piePanelMillis = millis();
  }
}

void zona2Close() {
  if (currentPieState != PIE_CLOSING) {
    currentPieState = PIE_CLOSING;
    currentPieIndex = 10;
    piePanelMillis = millis();
  }
}

// COMPROBADOR DE SEGURIDAD EXCLUSIVO PARA LA DIRECCIÓN 10
void triggerI2C(byte device, byte command) {
  Wire.beginTransmission(device);
  byte error = Wire.endTransmission(); 
  
  if (error == 0) { 
    Wire.beginTransmission(device);
    Wire.write(command);
    Wire.endTransmission(); 
  }
}
        
