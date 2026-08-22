/* =====================================================================
   Config.h  —  R2 Bench Console

   *** THIS IS THE ONLY FILE YOU EDIT. ***

   Two things matter here and the rest have working defaults:

     1. WHICH BACK END you are driving       (section 1)
     2. WHAT YOUR CHANNELS ARE CALLED        (section 4)

   Get those two right and it works. Everything else is trim.
   ===================================================================== */
#pragma once


/* --------------------------------------------------------------- 1/5
   WHICH BACK END. Pick exactly one.

     BT_MAESTRO   a serial board that speaks the Pololu Maestro protocol.
                  That means a real Mini/Micro Maestro, AND it also means
                  a MaestroReplacement or an Esp32Droid — they answer the
                  same protocol on purpose. If there is a WIRE between
                  this board and the servo board, this is your answer.

     BT_PCA       PCA9685 driver board(s) wired to THIS board's own I2C
                  pins. No second processor, no serial link.

     BT_LEDC      ESP32 pins driving servos directly. 16 channels max —
                  that is the silicon, not a setting.

   THE COMMON MISTAKE: choosing BT_PCA when you have a MaestroReplacement
   on the other end of a serial cable. BT_PCA opens no serial port at
   all, so the link pins sit idle and not one byte ever leaves the board.
   Everything looks alive and nothing happens. Use BT_MAESTRO. */

#define BENCH_TARGET   BT_MAESTRO


/* --------------------------------------------------------------- 2/5
   THE CONSOLE — the USB Serial Monitor you type into. Set the monitor
   to this speed, and set its line ending to "Newline" so that both the
   one-key commands and the word commands work. */

#define CONSOLE_BAUD   9600
#define CONSOLE_ECHO   1        /* 0 if your monitor echoes what you type */


/* --------------------------------------------------------------- 3/5
   THE LINK (BT_MAESTRO only) — the wire out to the servo board.

   ON A MEGA / ADK / LEONARDO the port is Serial1 and its pins are fixed
   by the chip. You do not set them, you wire them:

       pin 18 (TX1) ----> the servo board's RX
       pin 19 (RX1) <---- the servo board's TX   (for read-back: p, err)
       GND ------------- GND                     (always)

   Talking to a MaestroReplacement on a second Mega, that is 18->19 and
   19->18 between the two boards. Talking to one on a Nano, it is
   18 -> Nano pin 8 and Nano pin 9 -> 19.

   ON AN UNO / NANO there is no spare UART, so SoftwareSerial is used on
   pins 10 (RX) and 11 (TX) instead.

   MAESTRO_BAUD must match the other end: a MaestroReplacement's
   LINK_BAUD, or a real Maestro's fixed baud rate. Note that a real
   Maestro must be set to "UART, fixed baud rate" with CRC disabled and
   Apply Settings pressed — a factory-reset board comes up in USB Dual
   Port mode and ignores its RX pin by design. */

#define MAESTRO_BAUD    9600
#define MAESTRO_IS_MINI 1       /* 0 for a 6-channel Micro Maestro */


/* --------------------------------------------------------------- 4/5
   YOUR CHANNELS (BT_MAESTRO only).

   One X(...) line per channel, in channel order, starting at 0:

       X( "name", min, max )

   min and max are QUARTER-MICROSECONDS — 6000 = 1500 us, the usual
   centre. They are this channel's travel endpoints, measured on your
   linkage. They are what `<`, `>`, `=`, `pct` and `flap` aim at, and
   what the console warns you about when a typed target falls outside.

   THE CONSOLE CANNOT ENFORCE THEM AND DOES NOT TRY — the BOARD clamps,
   silently, with no error. Ask for 4000 on a channel stored at 4544 and
   the servo stops at 4544 while the console still reports 4000. That
   reads exactly like a binding linkage or a dying servo, which is why
   the read-back wire is worth running: `p` is the only thing that tells
   those two apart.

   Add or remove lines freely. Nothing counts them but this list, so
   there is no second number to keep in step.

   What is here is Mike's dome Mini Maestro 18, measured on real
   linkages. IF THAT IS NOT YOUR DROID, THESE NUMBERS ARE NOT YOURS.
   Start every unknown channel at a safe 5000-7000 and open it out once
   you have watched the part move.

   Driving a MaestroReplacement? Its own endpoints live in ITS
   sequences.h, exported from the simulator. Copy the same numbers here
   so the console and the board agree about where the ends are. */

#define BENCH_CHANNEL_LIST \
  X( "PP5",     4544, 7296 )   /*  0  pie panel                        */ \
  X( "PP6",     4544, 7296 )   /*  1  pie panel                        */ \
  X( "PP1",     5056, 7744 )   /*  2  pie panel  (saber launcher)      */ \
  X( "PP2",     4544, 7296 )   /*  3  pie panel  (lifeform scanner)    */ \
  X( "HP3-1",   3968, 8000 )   /*  4  holo 3                           */ \
  X( "HP3-2",   3968, 8000 )   /*  5  holo 3                           */ \
  X( "P13",     4032, 7616 )   /*  6  side panel                       */ \
  X( "HP1-1",   3968, 8000 )   /*  7  holo 1                           */ \
  X( "HP1-2",   3968, 8000 )   /*  8  holo 1                           */ \
  X( "P1-Fix",  3968, 8000 )   /*  9  side panel                       */ \
  X( "P2",      4032, 7616 )   /* 10  side panel                       */ \
  X( "P3",      4032, 7360 )   /* 11  side panel                       */ \
  X( "P4",      3968, 7616 )   /* 12  side panel                       */ \
  X( "P7",      4416, 8000 )   /* 13  side panel                       */ \
  X( "HP2-1",   3776, 8000 )   /* 14  holo 2                           */ \
  X( "HP2-2",   3968, 8000 )   /* 15  holo 2                           */ \
  X( "P11",     4416, 7744 )   /* 16  side panel                       */ \
  X( "(spare)", 3968, 8000 )   /* 17  unnamed, no sequence drives it   */

/* The slot map, so `g 4` can say what it fired rather than just the
   number. Slot n here is the n in restartScript(n). Names only — get
   one wrong and the label is wrong, nothing else. */

#define BENCH_SLOT_LIST \
  X( "Dome Pies Open"   ) \
  X( "Dome Pies Close"  ) \
  X( "Dome Panels Open" ) \
  X( "Dome Panels Close") \
  X( "Whole Dome Open"  ) \
  X( "Whole Dome Close" ) \
  X( "Dome Wave"        ) \
  X( "Dome Home"        )


/* --------------------------------------------------------------- 5/5
   THE OTHER TWO BACK ENDS, and the feel of the console. Ignore all of
   this on BT_MAESTRO.

   On BT_PCA the channel names and endpoints are NOT set here — they are
   read straight out of the table in sequences.h, so the console and the
   sequences cannot disagree. Export that file from the simulator
   (Maestro tab -> Export PCA9685 header) and drop it in beside this one.

   The I2C addresses are scanned at boot, so bridge whichever jumpers
   you like. PCA_BOARDS_MAX is just how many to declare room for. */

#define PCA_BOARDS_MAX  2
#define PCA_OSC_HZ      25000000UL   /* trim only after measuring a pulse */
#define PCA_SERVO_HZ    50.0f

/* BT_LEDC only — the GPIO for each CHANNEL, in channel order, so
   LEDC_PINS_LIST[i] is where channel i comes out. Sixteen max: that is
   the LEDC peripheral's channel count, not a setting.

   Avoid 6-11 (wired to the flash chip), 34-39 (input only) and 0/2/12/15
   (strapping pins — they decide how the chip boots) unless you know what
   a servo holding that line at power-up will do. */
#define LEDC_PINS_LIST  13, 14, 27, 26, 25, 33, 32,  4, \
                        16, 17,  5, 18, 19, 21, 22, 23

/* How long to wait for a board that may not be wired to answer. Raise it
   if you are on a long or slow link; a silent board is REPORTED silent
   rather than hanging the sketch, which is most of why this exists. */
#define REPLY_MS        50

#define DEFAULT_NUDGE   100     /* quarter-us that + and - move (= 25 us) */
#define FLAP_HOLD_MS    1200    /* per throw of `flap`, in milliseconds   */
