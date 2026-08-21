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

### You must have ONE of the two, never both

If `MaestroPCA` is **also installed** in your Arduino `libraries` folder, the
build fails at the LINK step with pages of *multiple definition of
`MaestroPCA::…`*, ending in:

    note: type 'struct MaestroPCA' itself violates the C++ One Definition Rule

Quoting the includes is not enough to prevent this, and that is worth
understanding: the **compiler** finds the header next door, but the **builder**
separately resolves `MaestroPCA.h` against the library index, finds the
installed library and compiles *its* `.cpp` files too. Two copies of every
symbol reach the linker. There is no include-style trick that avoids it.

So pick one:

- **Self-contained (this folder).** Move the installed library **out of
  `libraries\` altogether** — to `Documents\Arduino\_disabled-libraries\`,
  say. The five files here are the current ones.

  **Renaming it in place does nothing.** `MaestroPCA` → `MaestroPCAold` still
  gets scanned and still supplies `MaestroPCA.h`, because the IDE reads what is
  INSIDE each folder under `libraries\`, not what the folder is called. The
  error looks identical afterwards, just with the new name in the path — which
  is exactly how this was found.
- **Library route.** Delete the five copies from this folder and install
  `arduino/MaestroPCA/` through *Sketch → Include Library → Add .ZIP Library*.

**Check which one you are actually compiling.** An installed library that is
months old looks exactly like a working setup right up until a symbol moves —
if `libraries\MaestroPCA\src\MaestroPCA.h` puts `class MaestroPCA` anywhere
other than line 243, it is not this version.

**A copy is a liability, so it is not left as a promise.**
`arduino/MaestroPCA/test/run.sh` asserts all five are byte-identical to
`../../src/` and compiles this folder with `../../src` deliberately off the
include path. If a copy drifts, the test names the file and prints the one
command that fixes it. Edit the library, not the copy.

## And put this folder in the SKETCHBOOK, not in `libraries\`

`Documents\Arduino\MaestroReplacement\MaestroReplacement.ino` is right.
`Documents\Arduino\libraries\MaestroReplacement\…` is not: everything under
`libraries\` is scanned as a library, so the sketch ends up compiled twice —
once as your sketch and once as a library — and you get the same wall of
*multiple definition* errors from a completely different cause.

## `sequences.h` is yours

`sequences.h` is **generated** — the simulator's Maestro tab writes it, sized to
your build, with your endpoints and your routines in it. It is not a file to
hand-edit and nothing in this repository will overwrite it for you. Regenerate
it and re-flash whenever you add a board or change a routine; `MPCA_CHANNELS`
inside it is fixed at the moment you flash, which is why a PCA9685 added to the
bus afterwards is found and woken but no routine reaches it.
