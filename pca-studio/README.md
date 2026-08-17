# PCA Studio

A standalone PCA9685 sequencer and tester. **One file, no server, no
droid** — open `PCA-Studio.html` in Chrome and iterate.

It is now BUILT, from `pca-studio/manifest.json`, by the repo's own
`./build.sh`. The output is still a single self-contained file you open from
disk; what changed is that the engine, the travel model, the `sequences.h`
generator and the whole block sequencer are now the sim's real modules
rather than hand-kept copies of them. Edit under `pca-studio/src/`, run
`./build.sh`, refresh. The built file is committed (unlike the sim's 6 MB
dist) so a clone can still just open it.

Born out of the R2-D2 Simulator's PCA9685 route (v1.23.0): same engine, same
generated `sequences.h`, none of the weight. The sim stays the place where
firmware is proven against the full droid; this is the bench tool.

## Start here: Setup

**⚙ Setup** in the header is the screen that builds a project out of your
actual hardware, in six steps: the controller, how many PCA9685s and how they
are joined, a wiring diagram drawn from those answers, which sketch to flash,
then the channels themselves.

The last step is the point of the other five. Tick the pins that have
something plugged into them, name them, and press **set ends** — a large dial
drives that servo *live* and **MIN / CENTER / MAX** record wherever it is.
That is the only honest way to find an endpoint on a printed droid: you turn
it until the panel is where you want it and record that number. While the dial
is out the channel's working range is opened, or you could never move past the
endpoints you are trying to replace, and the sweep starts at a cautious
1000–2000 µs — unlocking the full 500–2500 µs is a deliberate second action,
because a horn driven into a hard stop is how you strip a gear.

If the part runs the wrong way, press **⇄ reverse** — it swaps the two ends,
which is all a reversed linkage ever means. There is no invert setting.

The dial drags, and it is as fine as the unit allows: ±0.25, ±1 and ±5 µs
nudges, arrow keys when the dial has focus (0.25 µs a press, 10× with shift),
and a box for an exact pulse width. 0.25 µs is the floor because that is the
Maestro unit the whole project speaks.

Each channel also gets **sleep when idle** — stop pulsing this long after
arriving, so a parked panel is silent and draws nothing. Only for parts that
rest in place on their own; a servo holding against gravity drops.

Setup exports two things, both separate from `sequences.h`:
`servo-setup.json` reloads everything here (and drops back in through **Load
project** without touching your sequences), and `servos.h` is the channel
table alone for the sketch. Endpoints are calibration and sequences are art —
they change for different reasons, so they are different files.

## What it does

- **Channel table** — name, min/max/home endpoints, speed, acceleration, all
  in Maestro units (quarter-µs; speed 0.25 µs/10 ms; accel per 80 ms).
  Board/pin assignment is automatic: channel i → PCA9685 i/16, pin i%16.
- **Live drive** — a slider and min/mid/max/off buttons per channel, with an
  animated position bar showing what the engine (and a real servo) is doing:
  targets snap-from-off, ramp under speed/accel, never overshoot.
- **Bricks** — the simulator's drag-and-drop sequencer, on channels instead
  of droid parts. Drop a channel onto a lane, drag it about, pull its edges
  to resize, and set its rise/fall ramps and partial travel in the
  inspector. Ready-made shapes (wave, Mexican wave, chase, alternate, all
  at once, breathe) build a whole routine from a group in one click, and a
  whole other sequence can be dropped in as a single brick. Ctrl+Z undoes.
  The frames underneath are REGENERATED on every edit, so the two views can
  never disagree about what exports.
- **Frames** — the same sequence as the grid the board actually runs:
  duration + one target cell per channel, blank = not driven (the Maestro
  convention). 📷 captures the current pose into a frame. Play runs the real
  engine — slot n here is exactly `restartScript(n)` on the droid.
- **Import .mstr** — channels and sequences from a Maestro settings file,
  slots ordered by the file's *script* (the real board's truth).
- **Export sequences.h** — byte-compatible with the sim's export, for the
  MaestroPCA Arduino library.
- **Projects** — everything autosaves to the browser; Save/Load produces a
  portable `.pcastudio.json`.

## Serial monitor and STOP

The board's own output appears in the **Serial monitor** panel — you cannot
have the Arduino Serial Monitor open at the same time, since only one
program can hold the port, so without this connecting here makes the board
go quiet from your point of view. The send box types back to it.

**STOP ALL** (or the <kbd>Esc</kbd> key, from anywhere) halts every
sequence and switches every output off, on screen and on the hardware.

On connect it identifies the board — pulsing DTR to force a reset, and if
that produces nothing, asking with `?` (the status key on both sketches).
Waiting for a boot banner alone is not enough: unlike the Arduino IDE, Web
Serial does not reset the board when it opens a port, so one that was
already running never announces itself.

**Both sketches accept live drive.** `PCA_Bridge` is the dumb pipe.
`MaestroReplacement` (v2 and later) shares its USB port properly: the
binary protocol has a frame state machine, so a payload byte can never be
mistaken for a console keypress. Streaming to it takes the servos off the
board — it stops animating while the PC drives, and running a slot (from
the console, or from the droid over the Maestro link) hands them back.

If nothing identifies itself, PCA Studio does **not** stream anyway. Sending
the position protocol to the wrong firmware is what makes servos move on
their own, so it stays monitor-only and asks you to choose.

## Hardware mode

Flash `PCA_Bridge/PCA_Bridge.ino` on any Arduino (Mega/Uno) with the
PCA9685(s) on I2C, then click **⚡ Connect hardware** (Chrome/Edge — Web
Serial). The browser runs the sequencer and streams only *changed* channel
positions as 3-byte frames at 115200 baud; the bridge is a dumb pipe.
Move a slider → a real servo moves. Tune endpoints and speeds live, then
export `sequences.h` and flash MaestroPCA for the standalone droid.

The oscillator box (header bar) trims the PCA9685's RC clock — boards are
only nominally 25 MHz, and until it's calibrated the quarter-µs values are
approximate on the wire.

**Servo power:** V+ on the PCA9685 from a real 5–6 V supply, never the
Arduino's 5 V pin. Common ground everywhere.

## The one rule about the engine

The kinematics has TWO copies, not three: `src/js/maestro/pcaseq.js` (which
this app is built from) and `arduino/MaestroPCA/src/MaestroPCA.cpp` (the
real thing). Change one, change the other, or the sim stops being evidence
about the droid.

It used to be three. The endpoint-clamp fix in v1.25.1 landed in two of them
before anyone noticed the third, which is what prompted making this a built
artifact — see `pca-studio/manifest.json` for what is shared.

The block sequencer is shared the same way, through one seam: `BLKH` in
`pca-studio/src/js/45-blocks-host.js` is everything the model needs to know
about its surroundings, and the sim's equivalent is
`src/js/maestro/blocks-host.js`. If you find yourself writing a RULE in
either host file, it belongs in `blocks.js` instead — otherwise the two
tools quietly start behaving differently.

## Testing

`node pca-studio/smoke.test.js` (needs the repo's Playwright setup) — 45
checks, a few seconds. Deliberately **not** wired into the sim's `test.sh`;
the whole point of this folder is fast iteration. The block compiler itself
is covered by the sim's `tests/sequencer.test.js`, since it is the same
code — the smoke test only proves the seam is wired up.
