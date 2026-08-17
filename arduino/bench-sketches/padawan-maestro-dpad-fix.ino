// =====================================================================
//  PATCH for Maestro_Mega_DYSV5W (Steve Baudains 2025 / Steven Sloan)
//  The d-pad dispatch block.
//
//  WHAT IS WRONG WITH THE ORIGINAL
//
//  The Maestro triggers use getButtonPress() on the d-pad, which is TRUE
//  for as long as the direction is held. loop() runs at roughly 500-1000 Hz
//  on a Mega, and a compact-protocol restartScript() is two bytes — about
//  2 ms on the wire at 9600 baud. So holding R2+UP sends "restart the
//  script" every couple of milliseconds: the script is thrown back to its
//  first instruction before it can finish frame 0, and only the FIRST
//  panel in the sequence ever moves. Let go and the rest finally run.
//
//  Symptom: the sequence half-works, or works "sometimes", or only the
//  first panel opens. It is not a wiring fault and not a Maestro fault.
//
//  WHY THE AUTHOR COULDN'T JUST USE getButtonClick()
//
//  Because the volume block sits ABOVE the Maestro block and calls
//  getButtonClick(UP) / getButtonClick(DOWN) unconditionally. In the
//  USB Host Shield library, getButtonClick() CLEARS the click flag:
//
//      bool click = (ButtonClickState[controller] & button);
//      ButtonClickState[controller] &= ~button;   // clear "click" event
//      return click;
//
//  So the volume block consumed the UP/DOWN click every pass — with or
//  without R1 held — and a getButtonClick() in the Maestro block below
//  would never have fired. Hence getButtonPress, hence the restart storm.
//
//  THE FIX: read each d-pad click ONCE, into a local, before anything can
//  eat it. Then dispatch from the locals. One restart per press.
//
//  HOW TO APPLY: delete the existing "Volume Control of MP3 Trigger"
//  block AND the eight "Maestro stuff here" if-blocks, and paste this in
//  their place. Nothing else in the sketch changes.
// =====================================================================

  // ---- read every d-pad CLICK once, before anything consumes it -------
  bool dpadUp    = Xbox.getButtonClick(UP, 0);
  bool dpadDown  = Xbox.getButtonClick(DOWN, 0);
  bool dpadLeft  = Xbox.getButtonClick(LEFT, 0);
  bool dpadRight = Xbox.getButtonClick(RIGHT, 0);

  // L2 and R2 are ANALOG on this controller — getButtonPress returns 0-255,
  // not a boolean. A worn trigger can rest at a few counts, so use a
  // threshold rather than "non-zero".
  bool modR1 = Xbox.getButtonPress(R1, 0);
  bool modR2 = (Xbox.getButtonPress(R2, 0) > 40);
  bool modL2 = (Xbox.getButtonPress(L2, 0) > 40);

  // ---- volume: hold R1, tap up / down ---------------------------------
  // The DY-SV5W runs 0..30 with 30 the LOUDEST, so UP must INCREASE it.
  // The original had this inverted — it is left over from the MP3Trigger,
  // where 0 was full volume and 255 was off.
  if (dpadUp   && modR1) { if (vol < 30) { vol++; player.setVolume(vol); } }
  if (dpadDown && modR1) { if (vol >  0) { vol--; player.setVolume(vol); } }

  // ---- Maestro sequences: exactly one restart per press ---------------
  // Slot numbers are subroutine indices in DECLARATION ORDER in the
  // Maestro script, counting from 0 and ignoring the top-level quit.
  if (modR2 && !modR1) {
    if (dpadUp)    maestro.restartScript(0);   // Dome Pies Open
    if (dpadRight) maestro.restartScript(1);   // Dome Pies Close
    if (dpadDown)  maestro.restartScript(2);   // Dome Panels Open
    if (dpadLeft)  maestro.restartScript(3);   // Dome Panels Close
  }
  if (modL2 && !modR1) {
    if (dpadUp)    maestro.restartScript(4);   // Whole Dome Open
    if (dpadRight) { maestro.restartScript(5); player.playSpecified(3); }
    if (dpadDown)  maestro.restartScript(6);   // Dome Wave
    if (dpadLeft)  maestro.restartScript(7);   // Dome Home
  }


// =====================================================================
//  FOUR MORE, WHILE YOU ARE IN THERE
// =====================================================================
//
//  1. Serial.println() is corrupting your audio.
//     "DY::Player player;" defaults to Serial — the same UART the four
//     Serial.println("Start pressed") / ("Back button pressed") calls
//     write to. Every one of them injects bytes into the DY-SV5W's
//     command stream. Delete them, or move the player to another UART
//     with DY::Player player(&Serial1).
//
//  2. delay(750) in the automation block stops the world.
//     No controller polling, no motor updates, no Maestro commands, for
//     three quarters of a second. If you want the dome turn, do it on a
//     millis() timer instead of blocking.
//
//  3. isLeftStickDrive does not actually swap anything.
//     Both branches assign the same two buttons:
//         speedSelectButton  = L3;
//         hpLightToggleButton = R3;
//     The false branch should be L3 -> R3 and R3 -> L3, or the setting
//     does nothing at all.
//
//  4. Bare X plays the wrong bank.
//     The else branch is player.playSpecified(random(32, 52)) — the same
//     as bare B. The commented-out line above it says random(25, 32),
//     which is the whistle bank and is what was intended.
//
//
//  AND ONE THING THAT IS FINE, SO DO NOT "FIX" IT
//
//  MiniMaestro maestro(Serial3) leaves deviceNumber at its default of 255,
//  which the library reads as "not supplied" and so it uses the COMPACT
//  protocol — two bytes, no address. That is why your board's
//  SerialDeviceNumber of 12 does not need to match anything, and why
//  UART_FIXED_BAUD_RATE at 9600 with CRC off is the correct board setting.
//  This part of the sketch is right.
//
//  while (!Serial); in setup() is dead code on a Mega — the AVR core's
//  HardwareSerial::operator bool() just returns true, so it falls straight
//  through. Harmless here, but it WILL hang forever on any board with
//  native USB (Leonardo, Micro, Due). Worth deleting.
