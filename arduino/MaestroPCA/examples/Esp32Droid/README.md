# Esp32Droid — a servo brain on an ESP32

Unzip this folder into your sketchbook (`Documents\Arduino\Esp32Droid\`),
open `Esp32Droid.ino`, **edit `Config.h`**, upload. That is the whole
setup. Everything the sketch needs is in this folder except one library
from Library Manager.

> ⚠ **This sketch has not been run on real hardware yet.** Everything in it
> compiles from the same library the Nano version does, on both
> arduino-esp32 cores, and the parts that can be checked without a board
> are checked. What no test can prove is whether the silicon then emits the
> pulse. Flash it expecting to find something, and please say what you find.

## What you need

* An ESP32 dev board — a DevKitC or WROOM-32 is what the default pin list
  assumes — and its USB driver (CP2102 or CH340, depending on the board).
* **Arduino IDE → Boards Manager → `esp32` by Espressif.** Either the 2.x
  or the 3.x core works; they address the PWM peripheral completely
  differently and the sketch handles both.
* **Library Manager → `Adafruit PWM Servo Driver Library`** — needed only
  if you set `MPCA_DIRECT_PINS 0`. On direct pins nothing else is required.
* A servo supply of its own, 5–6 V. **Never power servos from the ESP32's
  pins**, and tie every ground together at one point.

## Two ways to drive servos, and which to pick

| | `MPCA_DIRECT_PINS 1` | `MPCA_DIRECT_PINS 0` |
|---|---|---|
| wiring | servo signal straight to a GPIO | PCA9685 boards on SDA 21 / SCL 22 |
| channels | **16 max** (the LEDC peripheral's count) | 16 per board, scanned at boot |
| step size | 0.305 µs | 4.88 µs |
| extra parts | none | one board per 16 channels |

Sixteen channels or fewer: use the pins. It needs no expander, no I2C, no
address jumpers, and it is the smoother of the two — though **only on slow
moves**. On a gentle ten-second panel open a PCA9685 servo is standing
still for more than half its 20 ms frames while an ESP32 pin glides; on a
one-second move the two are indistinguishable, because the engine's 10 ms
tick dominates either way. Measured in
`arduino/MaestroPCA/test/ripple_test.cpp`.

Above sixteen channels LEDC runs out and you are back to PCA9685s. The
sketch refuses to build rather than leaving the top channels quietly dead.

## The sequences

`sequences.h` in this folder is a **placeholder** — eight generic channels
so that something moves before you have exported anything. The real file
comes out of the R2-D2 Simulator (Maestro tab → Export PCA9685 header) or
PCA Studio, and carries your own measured endpoints. Replace it.

## Wiring

```
DIRECT PINS (MPCA_DIRECT_PINS 1)
  servo signal  <- the GPIOs in SERVO_PINS_LIST, one per channel
  servo V+      <- its own 5-6 V supply, NEVER the ESP32's pins
  GND           -- supply, ESP32 and every servo, one common point

PCA9685 (MPCA_DIRECT_PINS 0)
  SDA 21 - SCL 22  -> the board's SDA/SCL   3.3 V logic is a valid high for
  3V3 -> VCC (logic only)                   a PCA9685; do not feed 5 V back
  V+  <- the servo supply                   into an ESP32 pin

THE DROID LINK — where restartScript(n) arrives from
  host TX -> LINK_RX_PIN        host GND -- ESP32 GND
  LINK_TX_PIN -> host RX        (only if the host reads position back)
```

## The console

Serial Monitor at `CONSOLE_BAUD` (115200 by default):

| key | what it does |
|---|---|
| `?` | status — output, channels, resolution, link, watchdog |
| `v` | log every command the host sends |
| `t` | sweep channel 0 back and forth |
| `w` | walk every channel in turn — the fastest wiring check there is |
| `0`–`9` | run that slot |
| `x` | stop everything, all outputs off |

**Start with `?` then `w`.** If a servo does not move on `w`, the fault is
in that one channel's wiring or its row in `sequences.h`, and you have
found it in ten seconds rather than in the middle of a routine.

## The radio is off

`ESP_WIFI` is `0` in `Config.h`. Turning it on gives you a page on your
phone that fires any slot — and, as the sketch stands, a stutter in the
motion, because `web.handleClient()` blocks the same loop the servos are
driven from and arduino-esp32's web server will wait up to five seconds
for a client that has gone quiet. Section 4/6 of `Config.h` has the
numbers and says what a proper fix looks like. It is on the list.
