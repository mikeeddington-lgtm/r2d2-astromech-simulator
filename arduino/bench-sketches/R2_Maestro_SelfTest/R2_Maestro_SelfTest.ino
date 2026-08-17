/* =====================================================================
   R2 DOME — MAESTRO SELF TEST
   For Mike's Mini Maestro 18 dome board, 2026-07-29.

   No controller. No USB Host Shield. No Sabertooth, no Syren, no audio
   player, no PololuMaestro library. Just the Mega, one wire, and the
   Maestro. If this moves PP5, the hardware path is good and the fault is
   somewhere in the big sketch or in the settings file. If it does NOT
   move PP5, nothing else is worth debugging until it does.

   WHAT IT DOES, in order, on power-up:

     1. Blinks the on-board LED so you know the sketch is running at all.
     2. OPTIONAL: asks the Maestro its firmware error flags and channel 0
        position. Needs Maestro TX wired back to Mega RX3 (pin 15). If you
        have not run that wire, it just reports "no reply" and carries on —
        that is not a failure.
     3. Moves PP5 (channel 0) from shut to open and back, FIVE times,
        using Set Target directly. This does NOT use the script at all,
        so it works even if the script was never applied to the board.
     4. Parks PP5 shut.
     5. Fires restartScript(0) once. If step 3 moved and step 5 does not,
        the script is not on the board — press Apply Settings in Control
        Center.

   WIRING (the only three things that matter):
     Mega TX3  pin 14  ->  Maestro RX
     Mega GND          ->  Maestro GND        <- the one people forget
     Maestro needs its own servo power, and logic power via the jumper

   Open the Serial Monitor at 115200 to watch it narrate.
   ===================================================================== */

// ---------------------------------------------------------------- config
#define MAESTRO_SERIAL Serial3   // change to Serial1 or Serial2 to test
                                 // another port without rewiring anything
const long MAESTRO_BAUD = 9600;  // must match the board's FixedBaudRate

const uint8_t  CHANNEL   = 0;     // PP5
const uint16_t TARGET_SHUT = 4544; // quarter-microseconds, from your .mstr
const uint16_t TARGET_OPEN = 7296;
const uint8_t  CYCLES    = 5;
const uint16_t HOLD_MS   = 1500;  // a full throw takes ~940 ms at speed 80
                                  // / accel 10, so give it room to arrive

const uint8_t LED_PIN = 13;

// ------------------------------------------------------- compact protocol
// Two bytes for a command, plus 7-bit-split data. No device number, which
// is exactly what MiniMaestro(Serial3) does in the real sketch: leaving
// deviceNumber at its default makes the library use the compact protocol.
void maestroSetTarget(uint8_t channel, uint16_t target) {
  MAESTRO_SERIAL.write(0x84);
  MAESTRO_SERIAL.write(channel);
  MAESTRO_SERIAL.write((uint8_t)(target & 0x7F));
  MAESTRO_SERIAL.write((uint8_t)((target >> 7) & 0x7F));
}
void maestroRestartScript(uint8_t sub) {
  MAESTRO_SERIAL.write(0xA7);
  MAESTRO_SERIAL.write(sub);
}
void maestroStopScript() {
  MAESTRO_SERIAL.write(0xA4);
}

// Reads two little-endian bytes back. Returns -1 on timeout, which just
// means the Maestro's TX is not wired to the Mega's RX.
long maestroRead16(uint16_t timeoutMs) {
  unsigned long t0 = millis();
  uint8_t got = 0, lo = 0, hi = 0;
  while (millis() - t0 < timeoutMs) {
    if (MAESTRO_SERIAL.available()) {
      uint8_t b = MAESTRO_SERIAL.read();
      if (got == 0) { lo = b; got = 1; }
      else          { hi = b; return ((long)hi << 8) | lo; }
    }
  }
  return -1;
}
long maestroGetPosition(uint8_t channel) {
  while (MAESTRO_SERIAL.available()) MAESTRO_SERIAL.read();   // flush
  MAESTRO_SERIAL.write(0x90);
  MAESTRO_SERIAL.write(channel);
  return maestroRead16(200);
}
long maestroGetErrors() {
  while (MAESTRO_SERIAL.available()) MAESTRO_SERIAL.read();
  MAESTRO_SERIAL.write(0xA1);
  return maestroRead16(200);
}

void blink(uint8_t times, uint16_t ms) {
  for (uint8_t i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(ms);
    digitalWrite(LED_PIN, LOW);  delay(ms);
  }
}

// ------------------------------------------------------------------ setup
void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);          // USB monitor. Safe here — nothing else is
                                 // on Serial in this sketch, unlike the real
                                 // one where the DY-SV5W lives on it.
  delay(600);                    // let the monitor attach
  blink(3, 120);

  Serial.println();
  Serial.println(F("=== R2 dome Maestro self test ==="));
  Serial.print(F("Maestro port baud: ")); Serial.println(MAESTRO_BAUD);
  Serial.println(F("Wire: Mega TX3 (pin 14) -> Maestro RX, and a COMMON GROUND."));
  Serial.println();

  MAESTRO_SERIAL.begin(MAESTRO_BAUD);
  delay(200);

  // Stop any running script so it cannot fight us for the channel.
  maestroStopScript();
  delay(50);

  // --- optional two-way check ------------------------------------------
  Serial.println(F("[1] Asking the Maestro for channel 0's position..."));
  long pos = maestroGetPosition(CHANNEL);
  if (pos < 0) {
    Serial.println(F("    no reply. That is EXPECTED unless you have also wired"));
    Serial.println(F("    Maestro TX -> Mega RX3 (pin 15). Not a failure."));
  } else {
    Serial.print(F("    reply: ")); Serial.print(pos);
    Serial.println(F(" quarter-us  <-- two-way comms confirmed, the board is alive"));
    long err = maestroGetErrors();
    Serial.print(F("    error flags: 0x"));
    Serial.println(err < 0 ? 0 : err, HEX);
    if (err > 0) Serial.println(F("    (non-zero. Reading them clears them.)"));
  }
  Serial.println();

  // --- the actual test --------------------------------------------------
  Serial.print(F("[2] Moving PP5 (channel ")); Serial.print(CHANNEL);
  Serial.print(F(") between ")); Serial.print(TARGET_SHUT);
  Serial.print(F(" and ")); Serial.print(TARGET_OPEN);
  Serial.print(F(", ")); Serial.print(CYCLES); Serial.println(F(" times."));
  Serial.println(F("    This uses Set Target directly and does NOT touch the script,"));
  Serial.println(F("    so it works even if the script was never applied."));

  for (uint8_t i = 1; i <= CYCLES; i++) {
    Serial.print(F("    cycle ")); Serial.print(i); Serial.println(F(" - open"));
    digitalWrite(LED_PIN, HIGH);
    maestroSetTarget(CHANNEL, TARGET_OPEN);
    delay(HOLD_MS);

    Serial.print(F("    cycle ")); Serial.print(i); Serial.println(F(" - shut"));
    digitalWrite(LED_PIN, LOW);
    maestroSetTarget(CHANNEL, TARGET_SHUT);
    delay(HOLD_MS);
  }

  Serial.println();
  Serial.println(F("[3] Parked shut."));
  maestroSetTarget(CHANNEL, TARGET_SHUT);
  delay(HOLD_MS);

  // --- now, and only now, test the script -------------------------------
  Serial.println(F("[4] Firing restartScript(0) - Dome Pies Open."));
  Serial.println(F("    If step 2 moved and this does nothing, the script is not"));
  Serial.println(F("    on the board: load the .mstr and press APPLY SETTINGS."));
  maestroRestartScript(0);

  Serial.println();
  Serial.println(F("=== done. Reset the Mega to run it again. ==="));
  Serial.println(F("If PP5 never moved in step 2:"));
  Serial.println(F("  - no common ground between Mega and Maestro (most likely)"));
  Serial.println(F("  - wire on the wrong pin: TX3 is pin 14, not 15"));
  Serial.println(F("  - servo power missing, or the logic-power jumper not fitted"));
  Serial.println(F("  - board not in UART fixed baud 9600 (check Serial Settings)"));
}

// A slow heartbeat afterwards, so a dead sketch is obvious at a glance.
void loop() {
  blink(1, 900);
}
