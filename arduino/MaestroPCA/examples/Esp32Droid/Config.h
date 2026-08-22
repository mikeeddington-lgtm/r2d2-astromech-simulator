/* =====================================================================
   Config.h  —  Esp32Droid

   *** THIS IS THE ONLY FILE YOU EDIT. ***

   Everything below has a working default. Read down the page, change
   what is not true of your build, ignore the rest. On a DevKitC with
   sixteen servos or fewer wired to the pins in 1/6, you can change
   nothing at all and upload it as it stands.

   The channel table itself is NOT here — it is in sequences.h, which you
   export from the R2-D2 Simulator (Maestro tab -> Export PCA9685 header)
   or from PCA Studio. That file carries YOUR measured endpoints, so this
   sketch and your sequencer cannot disagree about them.
   ===================================================================== */
#pragma once


/* --------------------------------------------------------------- 1/6
   WHERE THE SERVOS ARE.

   1 = straight off this ESP32's own pins. No expander, no I2C, no
       address jumpers. SIXTEEN CHANNELS MAX — that is the LEDC
       peripheral's channel count, not a setting — and the sketch refuses
       to build rather than leaving the top ones quietly dead.

   0 = PCA9685 driver boards on I2C (SDA 21, SCL 22). Use this above
       sixteen channels. Their addresses are SCANNED at boot, so bridge
       whichever jumpers you like.

   Direct pins are also the SMOOTHER of the two, measurably, and only on
   slow moves: LEDC quantises to 0.305 us where a PCA9685 quantises to
   4.88, and on a gentle ten-second panel open a PCA9685 servo is
   standing still for more than half of its 20 ms frames while an ESP32
   pin glides. On fast moves the two are indistinguishable — the engine's
   10 ms tick dominates. Measured in test/ripple_test.cpp.              */

#define MPCA_DIRECT_PINS   1

/* SERVO_PINS[i] is the GPIO for CHANNEL i — the `pin` column of the
   table in sequences.h. Ignored entirely when MPCA_DIRECT_PINS is 0.

   Avoid 6-11 (they are wired to the flash chip), 34-39 (input only) and
   0/2/12/15 (strapping pins — they decide how the chip boots). These are
   a sane default on a DevKitC / WROOM-32. */
#define SERVO_PINS_LIST    13, 12, 14, 27, 26, 25, 33, 32, \
                           23, 22, 21, 19, 18,  5, 17, 16

#define SERVO_HZ           50          /* what your servos expect        */

/* PCA9685 only: every board's internal oscillator is slightly off, so a
   nominal 1500 us pulse may measure 1480. Scope one output, then
   OSC_HZ_new = 25000000 * (1500 / measured_us). Leave it alone until you
   have actually measured something. Ignored on direct pins. */
#define OSC_HZ             25000000UL


/* --------------------------------------------------------------- 2/6
   THE DROID LINK — the wire from your host board (Padawan, the bench
   console, whatever calls restartScript()) to this one.

       host TX  ---->  LINK_RX_PIN      GND  -----  GND   (always)
       LINK_TX_PIN --> host RX          (only if the host reads back)

   LINK_BAUD must match what the host opened its port at. 9600 is what
   both example hosts use and what a stock Pololu Maestro ships at. */

#define LINK_RX_PIN        4
#define LINK_TX_PIN        2
#define LINK_BAUD          9600


/* --------------------------------------------------------------- 3/6
   THE CONSOLE — the USB Serial Monitor on this board. Set the monitor to
   this speed. Keys: ? status · v verbose · t sweep · w walk · 0-9 slot ·
   x stop and go limp. */

#define CONSOLE_BAUD       115200


/* --------------------------------------------------------------- 4/6
   THE RADIO — fire a routine from your phone without opening the dome.

   *** OFF BY DEFAULT, AND NOT JUST TO SAVE FLASH. ***

   `web.handleClient()` is a BLOCKING call, and arduino-esp32's WebServer
   waits up to FIVE SECONDS for a client that has opened a socket and not
   finished its request — which browsers do routinely, without anybody
   pressing anything. While it waits, maestro.update() is not being
   called, so every servo mid-move holds still and then lurches when the
   loop comes back. Measured: blocking the loop for 120 ms in every 200
   takes velocity ripple from 0.08 to 2.18 and turns a 20 us frame step
   into 210 us. Past 250 ms the routine also runs LONG, a millisecond
   for every millisecond lost, so it drifts out of step with its sound.

   None of that is a reason never to have a radio — it is a reason not to
   run the web server in the same loop as the motion. Turning this on as
   it stands gives you the page and the judder together. Doing it
   properly means putting handleClient() on its own FreeRTOS task and
   handing slot numbers back to loop() through a mailbox, which is a
   afternoon's work and is not done yet.

   So: 1 gives you the page, knowing the above. 0 compiles none of it. */

#define ESP_WIFI           0

#if ESP_WIFI
/* Leave WIFI_SSID empty to skip joining a network and raise an access
   point of this sketch's own instead — which is what you want at an
   event, where there is no network you trust and you just need your
   phone on it. */
#define WIFI_SSID          ""
#define WIFI_PASS          ""
#define AP_SSID            "R2-PCA"
#define AP_PASS            "astromech"   /* >= 8 characters, or no AP    */
#define WIFI_JOIN_MS       12000
#endif


/* --------------------------------------------------------------- 5/6
   A SECOND BOARD FOR THE FAR END. Set this to how many PCA9685 boards
   live HERE; everything above that goes down SPLIT_TX_PIN to an
   Esp32Slave. 0 turns the whole idea off.

   To be clear about when this is worth doing: NOT to get past sixteen
   channels — two PCA9685s manage that for the same money with no
   firmware and no protocol. It is for DISTANCE. I2C is a short,
   capacitance-shy bus and a droid has a slip ring in the middle of it;
   a UART tolerates a long noisy run far better. If the body bank is at
   the end of the loom, split it.

       SPLIT_TX_PIN ---> the slave's LINK_RX_PIN     one wire, plus
       GND ------------- the slave's GND             ground. Nothing
                                                     comes back.        */

#define MPCA_SPLIT_LOCAL   0
#define SPLIT_TX_PIN       17
#define SPLIT_RX_PIN       16          /* unused today — see above      */
#define SPLIT_BAUD         115200


/* --------------------------------------------------------------- 6/6
   THE WATCHDOG — what happens if the host crashes, resets, or the link
   wire falls out halfway through a sequence. Without it the panels keep
   animating forever against a host that is gone.

   It only ARMS once the host has talked at least once, so a bench
   session with no droid attached is never cut off. 0 disables it. */

#define WATCHDOG_MS        8000
