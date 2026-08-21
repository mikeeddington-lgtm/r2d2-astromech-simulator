# R2 Bench Console — drive your droid's servos by typing at them

No USB Host Shield, no Xbox controller, no Sabertooth, no audio player, no
droid. One Arduino, one wire to your servo hardware, and the Serial Monitor.
You ask the servo layer for anything Padawan would ever ask it — and, crucially,
you can see the answer.

It talks to **three different back ends with the same commands**, so a sequence
you proved on a bench Maestro can be proved again on a PCA9685 rig without
relearning anything. A difference in behaviour is then a difference in the
*hardware*, not in the test.

---

## What you need

| | |
|---|---|
| A board | Any Arduino. A **Mega / ADK / Leonardo** is easiest — it has a spare hardware serial port. |
| Something to drive | A **Pololu Mini/Micro Maestro**, or a **MaestroReplacement**, or **PCA9685** boards on this Arduino's own I2C pins |
| Software | The **Arduino IDE** |

---

## Step 1 — Install the library you need

**Tools → Manage Libraries…**, then install whichever matches your rig:

- Driving a **Maestro, a MaestroReplacement or an Esp32Droid** over a wire →
  **PololuMaestro** (by Pololu)
- Driving **PCA9685 boards on this Arduino's own I2C pins** →
  **Adafruit PWM Servo Driver Library** (by Adafruit), plus `Adafruit BusIO`
  if it offers

Installing both is fine. Everything else this sketch needs is already in
this folder.

## Step 2 — Put the folder in your sketchbook

Unzip it so you end up with:

```
Documents\Arduino\R2_Bench_Console\R2_Bench_Console.ino
```

**Not** inside `Documents\Arduino\libraries\` — everything under `libraries\` is
scanned as a library, so a sketch left there is compiled twice and produces a
wall of *multiple definition* errors.

## Step 3 — Make sure MaestroPCA is *not* also installed

If `Documents\Arduino\libraries\MaestroPCA\` exists, **move it out of
`libraries\` entirely**. This folder carries its own copy, and two copies means
every symbol reaches the linker twice.

Renaming the folder does not help — the IDE reads what is *inside* each folder
under `libraries\`, not what it is called.

## Step 4 — Edit `Config.h`, and nothing else

Open the `Config.h` tab. Two things there actually matter:

**1. `BENCH_TARGET` — which back end you are driving.**

| Your setup | Set it to |
|---|---|
| A serial cable to a Maestro, a MaestroReplacement or an Esp32Droid | `BT_MAESTRO` |
| PCA9685 boards wired to *this* Arduino's own SDA/SCL pins | `BT_PCA` |
| Servos straight off ESP32 pins | `BT_LEDC` |

> **The common mistake.** Choosing `BT_PCA` when there is a *serial cable*
> to a MaestroReplacement. `BT_PCA` opens no serial port at all, so the link
> pins sit idle and not one byte ever leaves the board. Everything looks
> alive and nothing happens. A MaestroReplacement answers the Maestro's own
> protocol on purpose — it is `BT_MAESTRO`.

**2. `BENCH_CHANNEL_LIST` — what your channels are called and how far they go.**

One line per channel, in channel order:

```c
X( "PP5", 4544, 7296 )   /* channel 0 */
```

Add or remove lines freely; nothing counts them but the list itself, so there is
no second number to keep in step. The numbers are **quarter-microseconds**
(6000 = 1500 µs, the usual centre) and they are *your* linkage's endpoints. The
list shipped here is Mike's dome Maestro — if that isn't your droid, those are
not your numbers. Start anything unknown at a safe `5000, 7000`.

Everything else in `Config.h` has a working default.

## Step 5 — Choose your board and upload

**Tools → Board**, **Tools → Port**, then the arrow.

## Step 6 — Wire it

**`BT_MAESTRO` on a Mega / ADK / Leonardo** — the port is `Serial1` and its pins
are fixed by the chip:

```
   pin 18 (TX1)  ---------->  the servo board's RX
   pin 19 (RX1)  <----------  the servo board's TX     (for read-back)
   GND           -----------  GND                       <- always
```

Two Megas — a bench console and a MaestroReplacement — is therefore
**18 → 19 and 19 → 18** between them. A Mega talking to a MaestroReplacement on a
Nano is `18 → Nano 8` and `Nano 9 → 19`.

**On an Uno / Nano** it falls back to SoftwareSerial on pins **10 (RX)** and
**11 (TX)**.

That return wire is optional but worth running: it is what makes `p`, `err` and
`state` able to answer at all, and it is the only way to catch a silent clamp.

**Driving a real Pololu Maestro?** Two things bite everyone:

- The Maestro must be set to serial mode **"UART, fixed baud rate"** at
  `MAESTRO_BAUD`, CRC disabled, and **Apply Settings pressed**. A factory-reset
  board comes up in *USB Dual Port* mode, which ignores its RX pin **by design** —
  every test on one is meaningless.
- **Do not wire TXIN.** The Mini Maestro has three serial pins: RX, TX and TXIN.
  TXIN is a daisy-chain input used only in USB Chained mode and is dead in UART
  mode. A wire on it is indistinguishable from a dead board.

**`BT_PCA`** — PCA9685 on this board's I2C (Mega SDA 20 / SCL 21, Uno A4/A5),
`V+` from a real 5–6 V servo supply, common ground, and 1000–4700 µF across
`V+`/`GND`.

## Step 7 — Type at it

Open **Tools → Serial Monitor** at **9600**, and set the line ending to
**"Newline"** so both command styles work at once.

| | |
|---|---|
| `?` | the full command list |
| `list` | the channel table, with each one's endpoints |
| `t 0 7296` | move channel 0 to 7296 quarter-µs |
| `< > =` | selected channel to min / max / centre |
| `+ -` | nudge it by the current step |
| `[ ]` | select the previous / next channel |
| `p` | read the position back — needs the return wire |
| `g 0` | fire sequence slot 0, exactly as `restartScript(0)` would |
| `flap` | throw a channel end to end, repeatedly, without blocking |
| `err` | the board's error flags (reading them clears them) |
| `state` | what's selected, what's moving, what the script is doing |
| `loopback` | jumper this board's TX to its own RX — proves the port itself |

Punctuation and bracket keys fire the instant you press them; word commands need
Enter. Start with `list`, then `t`, then `g 0`. If `t` moves a servo and `g 0` does
nothing, the link is fine and the problem is the sequence — a different and much
easier question.

---

## When it doesn't work

| What you see | What it is |
|---|---|
| `MaestroPCA.h: No such file or directory` | A file is missing from the folder, or you opened the `.ino` from somewhere else. All eight files must sit together. |
| Pages of `multiple definition of MaestroPCA::…` | `MaestroPCA` is also in `libraries\`, or you unzipped this into `libraries\`. See steps 2 and 3. |
| Everything looks alive, **nothing moves, no bytes leave the board** | `BENCH_TARGET` is `BT_PCA` but your servo board is on the *other end of a serial cable*. Set it to `BT_MAESTRO`. |
| `p`, `err` and `state` all say **"no reply"** | The return wire isn't there. That's a legitimate way to run — most droids are wired one wire, outbound only — but the read-back is the only thing that catches a silent clamp. |
| Console asks for 4000, servo stops short, no error | The **board** clamped it. Boards clamp silently, which reads exactly like a binding linkage or a dying servo. `p` is what tells them apart. |
| A real Maestro does nothing at all | It is almost certainly still in USB Dual Port mode, or you have a wire on TXIN. See step 6. |
| The sketch hangs the moment you type `p` | Not this sketch — it can't. Pololu's own library spins forever on a board that never answers; every read here is done against a `REPLY_MS` deadline and a silent board is *reported* silent. That is most of why this exists. |

---

## The files in here

`R2_Bench_Console.ino` is the console. `Config.h` is yours to edit.

`MpcaScan.h`, `MaestroPCA.h`, `MaestroPCA.cpp`, `MaestroLink.h` and
`MaestroLink.cpp` are copies of the MaestroPCA library, kept beside the sketch so
the folder compiles on its own. They are included **in quotes** on purpose: a
sketch folder is not on the compiler's include path for an `<angled>` include, so
`<MaestroPCA.h>` fails with the file sitting right next to the `.ino`.

`sequences.h` matters only on `BT_PCA` and `BT_LEDC`, where the channel names and
endpoints are read straight out of it so that the console and the sequences
cannot disagree. The one here is a **placeholder** — eight generic channels, so
something moves before you have exported anything. The real file comes out of the
R2-D2 Simulator: *Maestro tab → Export PCA9685 header*.
