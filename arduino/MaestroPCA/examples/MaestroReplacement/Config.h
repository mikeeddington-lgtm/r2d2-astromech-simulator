/* =====================================================================
   Config.h  —  MaestroReplacement

   *** THIS IS THE ONLY FILE YOU EDIT. ***

   Everything below has a working default. Read down the page, change
   what is not true of your build, ignore the rest. If you are on a Mega,
   an ADK or a Leonardo and your host talks at 9600, you can change
   nothing at all and upload it as it stands.

   Nothing here is a pin number for the SERVOS. The PCA9685 does that,
   over I2C, on whichever pins your board calls SDA and SCL (Uno/Nano
   A4/A5, Mega 20/21, ESP32 21/22). You do not choose those and you do
   not need to.
   ===================================================================== */
#pragma once


/* --------------------------------------------------------------- 1/4
   THE LINK — the wire from your host board (Padawan, the bench console,
   whatever sends restartScript()) to this one.

   ON A MEGA / ADK / LEONARDO this is Serial1 and the pins are FIXED by
   the chip. You do not set them, you just wire them:

       host TX  ---->  pin 19   (this board's Serial1 RX)
       pin 18   ---->  host RX  (only needed if the host reads back)
       GND      -----  GND      (always, no exceptions)

   ON AN UNO / NANO there is no spare UART, so the sketch falls back to
   SoftwareSerial on the two pins below:

       host TX  ---->  pin 8    (LINK_RX_PIN)
       pin 9    ---->  host RX  (LINK_TX_PIN)
       GND      -----  GND

   LINK_BAUD must match what the host opened its port at. 9600 is what
   both example hosts use and what a stock Pololu Maestro ships at. */

#define LINK_BAUD      9600

/* Uno/Nano only — ignored entirely on a board with a spare UART. */
#define LINK_RX_PIN    8
#define LINK_TX_PIN    9

/* Uncomment to FORCE SoftwareSerial even where a hardware UART is free.
   On a Mega this will refuse to build unless LINK_RX_PIN is one of
   10-13, 50-53 or A8-A15 — the only Mega pins that can receive. That
   refusal is deliberate: pin 8 on a Mega opens, transmits, and never
   hears a single byte, with no error anywhere. */
/* #define LINK_FORCE_SOFT 1 */


/* --------------------------------------------------------------- 2/4
   THE CONSOLE — the USB Serial Monitor on this board, for watching what
   the host actually sends. Set the monitor to this speed.
   `v` toggles a live log of every command received; that is the fastest
   way to tell "the host never sent it" from "we ignored it". */

#define CONSOLE_BAUD   115200


/* --------------------------------------------------------------- 3/4
   THE SERVO DRIVERS.

   How many PCA9685 boards is worked out from the channel count in
   sequences.h — 48 channels means 3 boards — so it cannot silently
   disagree with your sequences. Uncomment only if you have MORE boards
   on the bus than your sequences use.

   Their I2C addresses are SCANNED at boot, so bridge whichever address
   jumpers you like; the sketch prints the map it settled on. */

/* #define PCA_BOARDS   3 */

/* Every PCA9685 has its own slightly-off internal oscillator, so a
   nominal 1500 us pulse may measure as 1480 or 1520. If your servo
   centres visibly off, put a scope or logic analyser on one output,
   measure a known 1500 us pulse, and scale this by the error:
       OSC_HZ_new = 25000000 * (1500 / measured_us)
   Leave it alone until you have actually measured something. */

#define OSC_HZ         25000000UL


/* --------------------------------------------------------------- 4/4
   THE WATCHDOG — what happens if the host crashes, resets, or the link
   wire falls out halfway through a sequence. Without this, the panels
   keep animating forever against a host that is gone.

   WATCHDOG_MS    milliseconds of silence before giving up.  0 disables.
   WATCHDOG_LIMP  true  = switch every output off (panels fall shut;
                          safest for anything that rests closed)
                  false = hold the home pose. */

#define WATCHDOG_MS    8000
#define WATCHDOG_LIMP  false
