# MaestroReplacement — flashing it

This folder is **self-contained**. Open `MaestroReplacement.ino` in the Arduino
IDE and press Verify; nothing from this repository needs installing first.

## What you have to install

One thing, from Library Manager:

- **Adafruit PWM Servo Driver Library** (by Adafruit)

`Wire` and `SoftwareSerial` come with the board core.

## The five files beside the sketch

`MpcaScan.h`, `MaestroPCA.h`, `MaestroPCA.cpp`, `MaestroLink.h` and
`MaestroLink.cpp` are **copies of `../../src/`**, kept here so the folder
compiles on its own.

The sketch includes them **in quotes**, and that part is not cosmetic. A sketch
folder is *not* on the compiler's include path for an `<angled>` include — the
IDE will tell you `MpcaScan.h: No such file or directory` with the file sitting
right beside the `.ino`. A quoted include searches this directory first and the
library path afterwards, so it finds the copies here **and** still finds the
library for anyone who deletes them. If you re-add an include, quote it.

If you would rather use the library properly, install `arduino/MaestroPCA/`
through *Sketch → Include Library → Add .ZIP Library* and **delete these five
files**. Keeping both is fine; keeping the library and a STALE copy is not.

**A copy is a liability, so it is not left as a promise.**
`arduino/MaestroPCA/test/run.sh` asserts all five are byte-identical to
`../../src/` and compiles this folder with `../../src` deliberately off the
include path. If a copy drifts, the test names the file and prints the one
command that fixes it. Edit the library, not the copy.

## `sequences.h` is yours

`sequences.h` is **generated** — the simulator's Maestro tab writes it, sized to
your build, with your endpoints and your routines in it. It is not a file to
hand-edit and nothing in this repository will overwrite it for you. Regenerate
it and re-flash whenever you add a board or change a routine; `MPCA_CHANNELS`
inside it is fixed at the moment you flash, which is why a PCA9685 added to the
bus afterwards is found and woken but no routine reaches it.
