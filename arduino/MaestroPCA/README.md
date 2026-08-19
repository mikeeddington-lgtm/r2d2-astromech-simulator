# MaestroPCA

A Pololu-Maestro-style servo sequencer for the PCA9685, from the R2-D2
Simulator project.

The Maestro is a servo co-processor: the sketch sends `restartScript(n)` and
the board runs the whole choreography — timings, per-channel speed and
acceleration — by itself. The PCA9685 is a £5 PWM chip with no brain at all.
This library is the brain: it plays Maestro-style sequences from PROGMEM,
applies the Maestro's own speed/acceleration units, and drives one or more
PCA9685 boards over I2C.

## Beyond the Maestro

The Maestro compatibility is the *interface* — your sketch never changes.
Nothing obliges the *behaviour* to stop where a Maestro's does, and four
things earn their keep on a droid:

**Release when settled.** `releaseMs` per channel: stop pulsing that long
after arriving. A parked panel then draws nothing, makes no noise and does
not get hot — a servo holding a closed panel otherwise buzzes and cooks all
day. Re-driving a released channel eases from the remembered position
rather than snapping, because the part has not moved. **Only use it where
the part rests in place on its own** — a servo holding against gravity will
drop the moment it goes quiet. `0` = hold forever, which is a Maestro's
only mode.

**Background sequences that resume.** `MPCA_SEQ_BACKGROUND`: when something
borrows its channels, it steps aside and comes back by itself once they are
free. That is what makes a permanent holo idle practical — the panel button
no longer kills it. An explicit `stopScript()` still means stop.

**Oscillator and wander generators.** `MPCA_SEQ_OSC` eases lo → hi → lo
forever with zero velocity at each end, driving position directly — so it
**cannot be truncated by a frame that is too short**, which is the trap the
frame-based equivalent falls into. `MPCA_SEQ_WANDER` picks a fresh random
target every period and lets the channel's own speed and acceleration carry
it there, which is what reads as idle life rather than twitching. Both cost
five words per channel instead of frames, and `phase` offsets one entry
against another so a pan and a tilt need not swing together.

**Per-channel easing.** `MPCA_EASE_SOFT` ramps the acceleration itself in
over the first few ticks, so a move breathes into motion instead of stepping
into it. `MPCA_EASE_OVERSHOOT` aims a little past a large move and settles
back, which reads as weight rather than machinery. (Plain ease-in-out you
already had: an acceleration-limited move *is* an S-curve.)

The co-processor example also carries a **link watchdog** — if the host
crashes or the wire falls out, it returns to a safe state instead of
animating for ever, the same idea as the `setTimeout(950)` your Sabertooth
relies on.

## Several sequences at once, and looping

A real Maestro runs **one** script. This runs up to four at a time
(`MPCA_MAX_TRACKS`), on one rule: **sequences that drive disjoint channels
play together; one that claims a channel another is using displaces it.**

That exists for a specific R2 problem. You want a holoprojector idling back
and forth, or a magic panel breathing, *while* button presses fire the panel
choreography — and you do not want the button to kill the idle. Give the
idle sequence its own channels and it survives; give something the holo's
channels and it takes over cleanly, because two sequences fighting over one
servo would only jitter.

Mark a sequence `MPCA_SEQ_LOOP` in the generated table and it repeats until
stopped or displaced, keeping its leftover milliseconds each time round so
it does not drift slower. `stopScript()` clears everything;
`stopSequence(n)` clears just one.

```cpp
maestro.restartScript(SLOT_HOLO_IDLE);   /* loops on channels 4,5 only  */
maestro.restartScript(SLOT_PANELS);      /* channels 6-13 — both now run */
maestro.restartScript(SLOT_HOLO_HOME);   /* touches ch4: idle steps aside */
```

Within a single sequence the channels were always independent — a frame
only touches the channels it names, blank means "leave alone", and each
channel eases at its own speed. So one servo sweeping slowly across several
frames of quick panel moves needs no special support at all. Concurrency is
for things triggered at *different times*.

## Two ways to use it — pick deliberately

**A · In the host sketch.** Cheapest: no extra board. `maestro.update()` in
`loop()` steps the animation. It never blocks, but it is *cooperative* — if
anything else in your sketch stalls (`Usb.Task()` having a bad moment, a
`delay()`, a full serial buffer), the panels stall with it. Good enough for
many builds; see "Converting a Padawan360 Maestro sketch" below.

**B · On a second microcontroller — a true Maestro replacement.** Put this
library plus `MaestroLink` on a £4 Nano with a PCA9685, and it answers the
Maestro's *own serial protocol*. Your host sends `restartScript(2)`, two
bytes, and goes straight back to driving and sound; a different CPU runs the
choreography. **The host sketch needs no changes at all** — same
`PololuMaestro` library, same `MiniMaestro maestro(Serial3)`, same slot
numbers, same single wire. That isolation is what a Maestro actually sells
you, and no single-board arrangement reproduces it. See
`examples/MaestroReplacement`.

Option B is the one to choose if smooth panels matter while the droid is
busy, or if you have a Maestro with a dead serial input. On a Nano, an
18-channel dome with 8 sequences builds to about 18.5 KB of the 30 KB
available, using roughly half the RAM.

## Converting a Padawan360 Maestro sketch

```cpp
// BEFORE                                   // AFTER
#include <PololuMaestro.h>                  #include <Wire.h>
                                            #include <Adafruit_PWMServoDriver.h>
                                            #include <MaestroPCA.h>
                                            #include "sequences.h"   // generated by the sim
MiniMaestro maestro(Serial3);               Adafruit_PWMServoDriver pcaA(0x40);
                                            Adafruit_PWMServoDriver* const BOARDS[] = { &pcaA };
                                            MaestroPCA maestro(BOARDS, 1,
                                              MPCA_CHANNEL_TABLE, MPCA_CHANNELS,
                                              MPCA_SEQ_TABLE, MPCA_SEQUENCES);
void setup(){                               void setup(){
  Serial3.begin(9600);                        Wire.begin();
                                              Wire.setClock(400000);
                                              maestro.begin();
}                                           }
void loop(){                                void loop(){
  ...                                         maestro.update();   // ← the one new line
  maestro.restartScript(2);                   maestro.restartScript(2);   // unchanged
}                                           }
```

## Driving something other than a PCA9685

Nothing above the output is about a PCA9685. The sequences, the kinematics,
the easing and the Maestro protocol are all "put this channel at this many
quarter-microseconds", so the output is an interface and a different board is
a different subclass:

```cpp
class MpcaOutput {
  virtual void     begin(uint32_t oscillatorHz, float servoHz) = 0;
  virtual uint16_t code(uint16_t qus) const = 0;   // what goes on the wire
  virtual void     writeCode(uint8_t board, uint8_t pin, uint16_t code) = 0;
  virtual void     off(uint8_t board, uint8_t pin) = 0;
};
```

An ESP32 or Teensy driving pins directly implements these four and passes an
instance to the second constructor. The same `sequences.h`, the same editor,
the same slot numbers — only that one line changes. The PCA9685 version is
`MpcaPca9685Output`, and the original constructor still builds one for you, so
every sketch written before this existed compiles unchanged.

`code()` is the one that is not obviously necessary, and it earns its place: a
PCA9685 quantises to **4.88 µs** at 50 Hz, so dozens of distinct quarter-µs
targets land on the same tick. Deduping on the value that actually goes on the
wire is what stops a 100 Hz engine hammering the I2C bus with writes that
change nothing. A backend with finer resolution just returns the µs.

The interface costs **284 bytes of flash and 13 bytes of RAM** on an AVR —
under 1% of a Nano, measured with `avr-size` before and after.

### The ESP32 backend — `MpcaLedcOutput` (`MpcaEsp32.h`)

The first one written against that interface, and the reason it was worth
writing. The ESP32's LEDC peripheral gives **16 hardware PWM channels** at
**16-bit resolution at 50 Hz** — about **0.3 µs a step**, better than a
PCA9685's 4.88 µs and close to a Maestro's 0.25 µs. For sixteen servos or
fewer there is then no expander at all: no I2C, no address jumpers, no second
board.

```cpp
static const uint8_t SERVO_PINS[] = { 13,12,14,27,26,25,33,32 };
MpcaLedcOutput output(SERVO_PINS, 8);
MaestroPCA maestro(output, MPCA_CHANNEL_TABLE, MPCA_CHANNELS,
                   MPCA_SEQ_TABLE, MPCA_SEQUENCES);
```

Sixteen is a hard ceiling — it is how many LEDC channels the silicon has, and
`overflowed()` says so rather than letting the top channels go quietly dead.
Past that, use `MpcaPca9685Output`; the ESP32 is then a faster host with a
radio, which is the real reason to pick one anyway.

It handles both LEDC APIs: Arduino-ESP32 3.0 merged `ledcSetup` +
`ledcAttachPin` into `ledcAttach` and changed every `channel` argument to
`pin`. Both are alive in the wild, so both compile.

### Two boards, one engine — `MpcaSplitOutput`

Boards `0..localBoards-1` go to a local output; anything above goes down a
serial link to a second microcontroller that does nothing but make pulses.
**The channel table needs no change at all** — it already says which board
each channel is on, and nothing ever promised a "board" was a PCA9685.

```cpp
MpcaLedcOutput  local(SERVO_PINS, 16);
MpcaSplitOutput split(local, 1, Serial2);      // board 0 here, 1+ over there
MaestroPCA maestro(split, MPCA_CHANNEL_TABLE, MPCA_CHANNELS, ...);
```

The wire format is PCA Studio's own, unchanged: three bytes, high bit marking
the header so a dropped byte self-resyncs. **Quarter-microseconds cross the
wire, not duty counts** — the far end quantises for its own hardware, which is
the only place that knows how. That is why `code()` takes the channel: local
channels dedupe on the local quantisation, remote ones on the µs.

**When this is right, and it is a narrow case.** Not to get past 16 channels —
two PCA9685s do that for about the same money with no firmware, no second
binary to keep in step and no protocol to debug. It is for **distance**: I²C is
a short, capacitance-shy bus and a droid has a slip ring in the middle of it,
while a UART tolerates a long noisy run far better. If the body bank is at the
far end of the loom, this is the fix.

The far end is `examples/Esp32Slave` — a hundred lines that hold no sequences,
compute no easing and know nothing about your droid. Everything clever already
happened before the bytes left the other board.

See `examples/Esp32Droid` — the co-processor with a web page you can fire
slots from. **Not yet run on hardware:** the arithmetic, the channel mapping,
the ceiling and the engine integration are covered by
`test/ledc_test.cpp` against a faked peripheral, and the sketch is
compile-checked against a faked ESP32 (`test/esp32shim`), but nothing here
has met real silicon.

Everything else — button mapping, slot numbers, `setTarget` in
quarter-microseconds — is unchanged. Your tuned endpoints carry over exactly.

## Where sequences.h comes from

The R2-D2 Simulator generates it (Maestro tab → **Export PCA9685 header**)
from either a Maestro settings file (`.mstr`) or the sim's own sequencer
loadout. Slot numbers match what *Copy all Sequences to Script* would have
given `restartScript(n)` on a real Maestro, and your channel table
(names, min, max, home, speed, acceleration) is copied through verbatim.

## Rules that keep it working

- **Call `maestro.update()` every pass of `loop()`.** The engine is not
  interrupt-driven; a `delay()` freezes the animation for its duration.
  (This is already the law in the Padawan sketches — the `delay(750)` in the
  automation block is a known bug there for the same reason.)
- **Targets are quarter-microseconds** (6000 = 1500 µs), clamped to each
  channel's calibrated min/max. `setTarget(ch, 0)` stops the pulses — servo
  limp — exactly like a Maestro.
- **A frame target of 0 means "leave this channel alone"**, not "go to 0".
  First frames generated by the sim write every channel, so whichever slot
  fires first leaves the droid in a known pose (the homemode-Off doctrine).
- **Calibrate the oscillator.** The PCA9685's internal RC oscillator varies
  a few percent board to board, which skews every pulse width. If a scope
  (or the servo's centre) says the pulses are off, pass the measured value:
  `maestro.begin(26400000UL)`. Without calibration your quarter-µs endpoints
  are only nominal.
- **Servo power is separate.** V+ on the PCA9685 comes from a proper 5-6 V
  supply sized for your servo count; the logic side runs from the Arduino's
  5 V. Common ground, always.
- **I2C at 400 kHz** (`Wire.setClock(400000)`) keeps a full 18-channel
  update comfortably inside one 10 ms tick.

## Motion model

Maestro units, mirrored integer-for-integer in the simulator's JS twin
(`src/js/maestro/pcaseq.js`):

- speed — 0.25 µs per 10 ms (0 = unlimited)
- acceleration — 0.25 µs per 10 ms per 80 ms (0 = unlimited)

The engine runs a 10 ms tick with a trapezoidal profile that never
overshoots. A channel that is off (no pulses) snaps to its first target
with no ramp — same as a real Maestro, which also can't know where an
undriven servo is. Rule of thumb from the bench: a 2752-count throw at
speed 80 takes ≈350 ms before acceleration ramping — budget ≥400 ms per
full-throw frame, as with the real board.

## Memory

Sequence data lives in PROGMEM: roughly `frames × (channels + 1) × 2` bytes
per sequence (an 18-channel, 10-frame sequence ≈ 380 bytes). RAM cost is
~16 bytes per channel. Measured with avr-gcc on the real cores: the
18-channel, 8-sequence dome as a Nano co-processor is 18.5 KB flash of the
30 KB available and about half the 2 KB of RAM.

## The Maestro replacement in detail

`examples/MaestroReplacement` is the co-processor firmware. One signal wire
plus a shared ground:

```
  host TX (Mega Serial3 TX = pin 14) ──────► pin 8   Nano
  host RX ◄────────────────────────────────  pin 9   (only if the host
                                                      reads position back)
  host GND ────────────────────────────────  GND     ALWAYS
                                    Nano A4 ─► PCA9685 SDA
                                    Nano A5 ─► PCA9685 SCL
                                             PCA9685 V+ ◄── its own 5-6 V supply
```

`MaestroLink` implements the compact protocol a stock Padawan sketch emits
(`PololuMaestro` defaults to device number 255, so no address byte), the
addressed `0xAA` protocol, optional CRC, and Mini SSC. `restartScript(n)`
runs sequence slot n — the same numbering the generated `sequences.h` uses.

The usual "SoftwareSerial breaks PWM" warning does **not** apply on the
co-processor: it generates no PWM at all, the PCA9685 does. So the link can
live on pins 8/9 and leave USB free for flashing and diagnostics.

`MaestroLink` is deliberately transport-agnostic — `feed()` takes one byte
and hands back any reply — so moving to WiFi or BLE on an ESP32 means
changing only where the bytes come from.

**How many PCA9685s.** Eight, as of v1.54.0 — 128 channels. The bus is
scanned at boot and the drivers are bound to whatever answered, in
ascending address order, so board 0 is simply the lowest address on your
bus regardless of which jumpers you bridged. Which channels the flashed
sequences actually animate is still decided by `MPCA_CHANNELS` in
`sequences.h`; a board found beyond that is woken anyway and stays
live-drivable from PCA Studio, listed as `spare` in the `?` status.

Eight is the ceiling of the **live-drive wire format**, not of the library:
a frame's header byte spends its high bit marking the frame and the other
seven on the channel, so 0–127 is all there is, and 126/127 carry the
oscillator and servo rate. `MaestroPCA` itself indexes boards as
`channel >> 4` with no such limit. The banner reads `MAESTRO-PCA 3`; the
app keys the channel width off that number, and an older board is sent
nothing above channel 61 rather than something it would decode as the
wrong servo.

**The diagnostic a real Maestro cannot give you.** A Maestro that ignores
serial looks exactly like a dead droid, and that fault costs people days.
Open the co-processor's USB Serial Monitor at 115200: `?` gives an I2C scan
and a count of commands received from the host, `v` logs every command as it
arrives, `0`–`9` run a slot by hand and `t` sweeps a servo — so you can
prove the board with no host attached at all, and see instantly whether the
host's `restartScript()` is actually arriving.

## Testing it without a second board

`examples/LoopbackTest` proves the entire chain on **one** Mega. It plays
both parts — the droid's host writing out of Serial3, the co-processor
listening on Serial1 — with a single jumper closing the loop:

```
    pin 14 (TX3)  ─────────────►  pin 19 (RX1)
```

Pololu's real library emits the bytes, a real UART carries them,
`MaestroLink` parses them, and your actual servo moves. Everything the
Nano would do except the second CPU.

**No jumper?** It detects that on boot and routes the host's bytes into the
parser in software instead, so the protocol, engine, PCA9685 and servo are
still exercised. That fallback also lets the sketch run on a one-UART
board like an Uno.

Press `0`–`9` in the Serial Monitor and the host calls `restartScript(n)`
for real; the console then reports what the co-processor half received.

## Testing without any hardware at all

Two layers, neither needing a board.

`test/run.sh` is a **golden test against Pololu's own library**: it compiles
`maestro-arduino` unmodified for the host, points a real `MiniMaestro`
object at a loopback wired into `MaestroLink`, and checks the round trip
byte for byte — 40 assertions covering every command, CRC mode, addressed
mode, Mini SSC, and recovery from a command truncated by line noise. If
these pass, a host running `PololuMaestro` is understood exactly.

`test/run.sh` also runs `tracks_test.cpp` (14 checks on concurrency and
looping) and `features_test.cpp` (30 on release, background resume,
generators, easing, and that headers generated before these fields existed
still compile and behave as they used to).

`test/run.sh` also **compiles the sketches** against host shims —
`MaestroReplacement` (the one that ends up in the droid), `PCA_Bridge`, and
the two ESP32 sketches — and boots each one against a fake I2C bus. A
sketch nobody compiles in CI is a sketch that breaks in somebody's dome:
the ESP32 check was added in v1.33.0 and silently stopped working almost
immediately, because `run.sh` sent the compiler's stderr to `/dev/null` and
the only symptom was a step that printed nothing. That redirect is gone.

`bridge_test.cpp` additionally drives the live-drive frame decoder through
`loop()` against a real byte stream — channel 70 must reach board 4 pin 6
and not fold onto board 0 pin 6, 126/127 must configure and move nothing,
and a truncated frame must be abandoned at the next header.

`tests/pcaseq.test.js` in the simulator covers the engine itself (63
checks), and `pca-studio/smoke.test.js` the standalone app (27).
