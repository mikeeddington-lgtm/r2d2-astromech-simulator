# MaestroReplacement — a £10 board that answers like a Pololu Maestro

An Arduino plus a PCA9685 servo driver, pretending to be a Pololu Mini Maestro.
Your droid's host board sends `restartScript(2)` exactly as it always did; this
board runs the whole panel choreography on its own processor, so the host can
stall on USB or audio and the panels keep easing.

**Your host sketch needs no changes.** Same library, same slot numbers, same
three bytes on the wire. Only the box on the other end changes.

---

## What you need

| | |
|---|---|
| A board | Arduino **Mega, ADK or Leonardo** (easiest — it has a spare hardware serial port), or a Nano/Uno |
| A driver | One or more **PCA9685** 16-channel servo boards |
| Power | A **real 5–6 V servo supply** for the PCA9685's `V+`. Not the Arduino's 5 V pin. |
| Software | The **Arduino IDE** |

Three PCA9685s stacked on the same I2C bus gives you 48 channels. Their address
jumpers can be bridged however you like — the boards are found by a bus scan at
boot.

---

## Step 1 — Install the one library

In the Arduino IDE: **Tools → Manage Libraries…**, search for and install:

> **Adafruit PWM Servo Driver Library** — by Adafruit

If it offers to install `Adafruit BusIO` alongside it, say yes.

That is the only install. `Wire` and `SoftwareSerial` already come with your
board. **Everything else this sketch needs is in this folder.**

## Step 2 — Put the folder in your sketchbook

Unzip it so you end up with:

```
Documents\Arduino\MaestroReplacement\MaestroReplacement.ino
```

**Not** inside `Documents\Arduino\libraries\`. Everything under `libraries\` is
scanned as a library, so a sketch left there gets compiled twice and you get a
wall of *multiple definition* errors from a cause that has nothing to do with
your code.

## Step 3 — Make sure MaestroPCA is *not* also installed

Look in `Documents\Arduino\libraries\`. If there is a `MaestroPCA` folder there,
**move it out of `libraries\` entirely** — to `Documents\Arduino\_disabled\`,
say. This folder already carries its own copy of the library.

Two copies means every symbol reaches the linker twice:

```
multiple definition of `MaestroPCA::setTarget(unsigned char, unsigned int)'
note: type 'struct MaestroPCA' itself violates the C++ One Definition Rule
```

**Renaming the folder does nothing.** `MaestroPCA` → `MaestroPCAold` is still
scanned and still supplies `MaestroPCA.h`, because the IDE reads what is *inside*
each folder under `libraries\`, not what the folder is called. It has to leave
`libraries\` altogether.

## Step 4 — Edit `Config.h`, and nothing else

Open the `Config.h` tab in the IDE. Every setting is there, in four short
sections, with a default that already works. On a Mega talking to a host at
9600 baud you can change nothing at all.

The one setting most people touch is `LINK_BAUD`, which must match whatever the
host opened its serial port at.

## Step 5 — Choose your board and upload

**Tools → Board**, **Tools → Port**, then the arrow. If it compiles and uploads,
the hard part is over.

## Step 6 — Wire it

**On a Mega / ADK / Leonardo** the link is the hardware port `Serial1`, and its
pins are fixed by the chip:

```
   host TX  ---------->  pin 19        (Serial1 RX)
   pin 18   ---------->  host RX       (only if the host reads back)
   GND      -----------  GND           <- always
```

**On a Nano / Uno** it falls back to SoftwareSerial on `LINK_RX_PIN` /
`LINK_TX_PIN`:

```
   host TX  ---------->  pin 8
   pin 9    ---------->  host RX
   GND      -----------  GND
```

And the servo driver, on either:

```
   SDA  ->  PCA9685 SDA        (Uno/Nano A4, Mega 20, ESP32 21)
   SCL  ->  PCA9685 SCL        (Uno/Nano A5, Mega 21, ESP32 22)
   5V   ->  PCA9685 VCC        (logic only)
   GND  ->  PCA9685 GND
   PCA9685 V+  <-  your 5-6 V servo supply, sharing that same GND
```

Put **1000–4700 µF** across `V+` and `GND` at the driver board. A rack of servos
starting together will brown out a supply that measures fine at rest.

## Step 7 — Prove it works, before involving the host

Open **Tools → Serial Monitor** at **115200**. The board prints what it found on
the I2C bus. Then type:

| key | what it does |
|---|---|
| `?` | status — the I2C scan, link counters, what the host last sent |
| `t` | sweep channel 0 — proves servo and power with no host at all |
| `w` | walk every channel in turn — shows you which servo is which |
| `0`–`9` | run that sequence slot, exactly as `restartScript(n)` would |
| `v` | toggle a live log of every command the host sends |
| `x` | stop, and switch everything off |

`t` working means your servos and power are right. Then plug the host in and
press `v`: if the host's `restartScript()` never arrives, **you see that here**,
which is the difference between debugging the wire and debugging the sketch.

---

## When it doesn't work

| What you see | What it is |
|---|---|
| `MpcaScan.h: No such file or directory` | A file is missing from the folder, or you opened the `.ino` from somewhere else. All nine files must sit together. |
| Pages of `multiple definition of MaestroPCA::…` | `MaestroPCA` is *also* in your `libraries\` folder, or you unzipped this into `libraries\`. See steps 2 and 3. |
| Uploads fine, console answers, **host commands never arrive** | On a Mega: you are on the SoftwareSerial pins. SoftwareSerial's RX needs a pin-change interrupt and Mega pin 8 (PH5) has none — the port opens, transmits happily, and never receives one byte, with no error of any kind. Use `Serial1`: pins 18/19. This cost the project an evening. |
| `#error "LINK_RX_PIN cannot receive on a Mega…"` | The guard for exactly the fault above, doing its job. Take `LINK_FORCE_SOFT` back out. |
| Servos twitch, reset, or lose the bus | Power. `V+` is not the Arduino's 5 V pin, and it wants that capacitor. |
| Pulses measure ~2% off on a scope | Each PCA9685's oscillator is slightly off. Measure a nominal 1500 µs pulse and set `OSC_HZ` in `Config.h` to `25000000 × (1500 / measured)`. Don't touch it until you've measured. |
| A board you added is found but nothing drives it | `MPCA_CHANNELS` is fixed when you flash. Regenerate `sequences.h` with the new channel count and re-flash. |

---

## `sequences.h` is *yours*

`sequences.h` holds your channel table and your routines. It is **generated** —
the R2-D2 Simulator's Maestro tab (or PCA Studio) writes it, sized to your build,
with your measured endpoints in it. It is not a file to hand-edit.

The one shipped here is a 48-channel dome as an example. Replace it with your
own export and re-flash.

## About the five library files in here

`MpcaScan.h`, `MaestroPCA.h`, `MaestroPCA.cpp`, `MaestroLink.h` and
`MaestroLink.cpp` are copies of the MaestroPCA library, kept beside the sketch so
this folder compiles on its own.

They are included **in quotes**, and that is not cosmetic: a sketch folder is not
on the compiler's include path for an `<angled>` include, so `<MpcaScan.h>` fails
with the file sitting right next to the `.ino`. If you ever re-add an include,
quote it.

If you would rather use the library properly, delete those five files and install
`arduino/MaestroPCA/` through **Sketch → Include Library → Add .ZIP Library**.
One or the other — never both.
