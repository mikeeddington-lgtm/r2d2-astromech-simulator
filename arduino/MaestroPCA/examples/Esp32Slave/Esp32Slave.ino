/* Esp32Slave — the far end of MpcaSplitOutput. Sixteen more servos,
   down a wire, on a second board.

   ⚠ UNTESTED ON HARDWARE, like its master. The protocol and the routing
   are covered by arduino/MaestroPCA/test/split_test.cpp; the LEDC calls
   have not met silicon.

   ------------------------------------------------------------ what it is
   Deliberately stupid. It holds no sequences, computes no easing and knows
   nothing about your droid. The MASTER runs the whole engine and sends
   positions; this makes pulses. That is the entire job, and it is why the
   sketch is a hundred lines rather than a thousand: everything clever
   already happened before the bytes left the other board.

   ------------------------------------------------------ when to use it
   NOT to get past 16 channels. Two PCA9685s do that for about the same
   money, with no firmware to flash, no second binary to keep in step, and
   no link to debug. Use this for DISTANCE: I2C is a short, capacitance-shy
   bus and a droid has a slip ring in the middle of it. A UART tolerates a
   long noisy run far better. If the body bank is at the far end of the
   loom, this is the right fix.

   ---------------------------------------------------------------- wiring
     master TX -> LINK_RX_PIN         master GND -- this board's GND
     (one wire, plus ground. Nothing comes back — the master never asks.)

     servo signal <- the GPIOs in SERVO_PINS
     servo V+     <- its own supply, near THESE servos, not dragged
                     down the loom from the master's end
     GND          -- supply, this board and the master, one common point

   ------------------------------------------------------------- protocol
   PCA Studio's, unchanged. Three bytes, high bit marking the header so a
   dropped byte self-resyncs on the next one:

     byte0   0x80 | channel      channel = board*16 + pin, as the table says
     byte1   qus >> 7
     byte2   qus & 0x7F

   Quarter-microseconds, and 0 means stop pulsing. This board does its own
   quantising, which is exactly why the master sends µs and not duty counts.
                                                                       */

#include "MaestroPCA.h"
#include <MpcaEsp32.h>

/* ============================================================== config */
#define FIRST_CHANNEL   16      /* the master's channel number for our pin 0 */
#define LINK_RX_PIN     4
#define LINK_TX_PIN     2       /* unused today; wired for future replies   */
#define LINK_BAUD       115200
#define SERVO_HZ        50

/* GPIO per LOCAL servo, in order. Local index 0 is master channel
   FIRST_CHANNEL, index 1 is FIRST_CHANNEL+1, and so on. */
static const uint8_t SERVO_PINS[] = {
  13, 12, 14, 27, 26, 25, 33, 32,
  23, 22, 21, 19, 18,  5, 17, 16
};
#define NLOCAL  (sizeof(SERVO_PINS)/sizeof(SERVO_PINS[0]))

/* If the master goes quiet — a cut wire, a reset, a flat battery at the
   other end — what should these servos do?

     HOLD (default) keeps the last position. Safest for a panel that would
     fall shut, or an arm that would drop, and it is what a Maestro does
     when its host stops talking.
     LIMP stops pulsing. Right if your linkages rest closed on their own
     and you would rather they went quiet than sat buzzing for an hour.

   There is no correct answer for every droid, which is why it is a
   #define and not a decision made for you. */
#define ON_LINK_LOSS_HOLD   1
#define LINK_TIMEOUT_MS     3000

MpcaLedcOutput out(SERVO_PINS, NLOCAL);

uint8_t  st = 0, ch = 0, hi = 0;       /* the 3-byte frame state machine */
uint32_t lastByteMs = 0, frames = 0, strays = 0;
bool     seenMaster = false, quiet = false;

void applyLimp(){
  for(uint8_t i = 0; i < NLOCAL; i++) out.off(0, i);
}

void setup(){
  Serial.begin(115200);
  Serial1.begin(LINK_BAUD, SERIAL_8N1, LINK_RX_PIN, LINK_TX_PIN);
  out.begin(25000000UL, SERVO_HZ);
  /* No pulses until the master says something. Same reasoning as
     homemode Off: nothing here knows where these servos physically are,
     and a guess at power-up is a guess that moves a panel. */
  applyLimp();
  Serial.println(F("MAESTRO-PCA-SLAVE 1"));
  Serial.print(F("  "));   Serial.print((int)NLOCAL);
  Serial.print(F(" channels, master numbers "));
  Serial.print(FIRST_CHANNEL); Serial.print(F("–"));
  Serial.println(FIRST_CHANNEL + (int)NLOCAL - 1);
  Serial.print(F("  link: RX pin ")); Serial.print(LINK_RX_PIN);
  Serial.print(F(" at ")); Serial.print(LINK_BAUD); Serial.println(F(" baud"));
  Serial.println(F("  keys: ? status   x all off"));
}

void loop(){
  while(Serial1.available()){
    uint8_t b = (uint8_t)Serial1.read();
    lastByteMs = millis(); seenMaster = true; quiet = false;

    if(b & 0x80){                      /* header — always restarts the frame */
      ch = (uint8_t)(b & 0x7F);
      st = 1;
      continue;
    }
    if(st == 1){ hi = b; st = 2; continue; }
    if(st == 2){
      st = 0;
      uint16_t qus = (uint16_t)((uint16_t)hi << 7) | b;
      /* channels outside our bank are not ours — on a shared line they are
         another slave's, and either way they are not an error */
      if(ch >= FIRST_CHANNEL && ch < FIRST_CHANNEL + (int)NLOCAL){
        uint8_t local = (uint8_t)(ch - FIRST_CHANNEL);
        if(qus) out.writeCode(0, local, out.code(0, local, qus));
        else    out.off(0, local);
        frames++;
      }
      continue;
    }
    strays++;                          /* a payload byte with no header yet */
  }

  if(seenMaster && !quiet && millis() - lastByteMs > LINK_TIMEOUT_MS){
    quiet = true;
#if ON_LINK_LOSS_HOLD
    Serial.println(F("!! master quiet — HOLDING last positions"));
#else
    applyLimp();
    Serial.println(F("!! master quiet — pulses off"));
#endif
  }

  while(Serial.available()){
    char c = Serial.read();
    if(c == '?'){
      Serial.println(F("--- slave ---"));
      Serial.print(F("  frames: ")); Serial.print(frames);
      Serial.print(F("   strays: ")); Serial.println(strays);
      Serial.print(F("  master: "));
      Serial.println(!seenMaster ? F("never heard from")
                                 : (quiet ? F("QUIET") : F("talking")));
      Serial.print(F("  resolution: ")); Serial.print(out.bits());
      Serial.println(F("-bit"));
    }
    else if(c == 'x'){ applyLimp(); Serial.println(F("all off")); }
  }
}
