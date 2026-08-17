# The RTrobot servo controller — is it worth buying?

*Written 2026-08-10 from `Servo Motor Controller Instructions for use, Ver 4.0`
(rtrobot.org), against what the R2-D2 Simulator and the MaestroPCA route
already do. Nothing here is tested on hardware — Mike does not own one — so
treat the manual's claims as claims.*

## What it is

A 32-bit servo controller in three sizes (16, 24 or 32 channels) with 16 MB of
flash, a USB port, a 5 V TTL UART, a PS2 wireless-joystick header and a Windows
configuration app. It stores up to **255 "action groups"** in flash and runs
them on command, or automatically at power-up. Control precision is quoted at
1 µs, and it drives 9 g to 55 g servos.

The important part, and the reason it is worth taking seriously: it is a
**fire-and-forget sequencer**, the same shape as a Pololu Maestro. The host
sends four bytes and goes back to driving.

## The protocol, in full

This is the whole instruction set — it is genuinely this small. ASCII, 9600
baud by default on the UART (4800–115200 selectable), 115200 over USB, 8N1,
terminated `\r\n`, and the board answers `OK`.

| Instruction | Meaning |
|---|---|
| `#1P1500T1000D800\r\n` | channel 1 to 1500 µs, taking 1000 ms, then wait 800 ms |
| `#1P1500#2P2000T1000D0\r\n` | several channels in one move, all sharing the T and D |
| `G3F1\r\n` | run stored action group 3, once (`F0` = forever) |
| `~ST` | stop the running group — a stop, not a pause |
| `~RE` | restart the CPU |

`P` is **microseconds**, 500–2500. `T` is the time the whole move takes,
0–9999 ms. `D` is a delay after it, 0–9999 ms.

Action groups are edited in their Windows app, saved to a **plain text file**
(Export/Import), and pushed to the board with Download. The text file is just
those `#…P…T…D…` lines, one per step — which is why this was worth reading
carefully.

## What maps cleanly from what we already have

Better than I expected. Our frame model is *absolute targets plus a duration*,
which is exactly what a step of an action group is.

- **Frames → steps.** One frame becomes one `#chPpos…T<duration>D0` line.
- **"This frame does not drive this channel"** — our `target 0` convention —
  maps perfectly, because you only list the channels you want to move. No
  special case needed.
- **Slots.** `G<n>F<r>` is `restartScript(n)` with a repeat count. Our loadout
  order would become group numbers, and a Padawan sketch would send
  `Serial3.print("G3F1\r\n")` where it currently calls
  `maestro.restartScript(3)`. That is a one-line change per call site.
- **Units.** Their microseconds are our quarter-µs ÷ 4. Mike's endpoints
  (4544–7296 qus = 1136–1824 µs) sit comfortably inside their 500–2500 range.
- **Repeat.** `F0` runs a group forever — our `MPCA_SEQ_LOOP` in one character.
- **Power-up pose.** Per-servo initial values, and an optional auto-run group
  at boot, both set in their app. That is our `homemode`/home column and a
  boot sequence.

So an exporter is a genuinely small job: walk the loadout, emit one text file,
he imports and downloads it. If he buys one, that is maybe an afternoon.

## What does not map, and this is the real answer

Four things we have built and use, that this board has no concept of.

**No per-channel speed or acceleration.** This is the big one. Their `T` is a
move time for the whole step, and the board interpolates. Mike's channel table
carries a speed and an acceleration per channel, tuned against real linkages,
and the whole sim treats those as authoritative — the linter is built on them,
the brick sequencer floors its ramps at them. On this board those numbers have
nowhere to go. You would re-tune everything as per-step `T` values, by hand,
per sequence, and a channel that is geared differently from its neighbour has
to be given its own step.

**No concurrency.** An action group is a linear list: step, step, step. There
is no way to have a dome panel sweeping while something else happens, which is
the thing that made the concurrency work worth doing — and the thing Mike
objected to in the Padawan servo loops in the first place. You can approximate
it by interleaving steps into one group, but then the two motions share a
timeline and you cannot start one without restarting the other.

**No background layer, no release, no easing.** No equivalent of
`MPCA_SEQ_BACKGROUND` (the idle that resumes by itself), none of `releaseMs`
(the parked panel that goes silent), and no easing profiles. Their motion is
linear over `T`. Whether that reads as robotic on a dome panel is a question
only the bench answers, but a Maestro's acceleration limit is doing more work
than people realise.

**No pulse-off.** Nothing in the instruction set says "stop pulsing this
channel". Every servo holds, and holds noisily, which is exactly the behaviour
`releaseMs` exists to avoid.

Two smaller ones: the PS2 joystick stops working while USB is plugged in, and
the manual says a settings change needs a controller restart to take effect.

## Against the two routes you already have

| | Pololu Mini 24 | **PCA9685 + MaestroPCA** | RTrobot 32 |
|---|---|---|---|
| Channels | 24 | 16 per board, 32 across two | 32 on one board |
| Rough cost | ~£40 | ~£10 (2 × PCA9685 + a Nano) | ~£25–35 |
| Boards to wire | 1 | 3 | 1 |
| Fire-and-forget | `restartScript(n)` | `restartScript(n)` — identical | `G<n>F<r>` |
| Per-channel speed/accel | yes | yes | **no** |
| Concurrent sequences | no | **yes, 4 tracks** | no |
| Background idle that resumes | no | **yes** | no |
| Release when parked (silent) | no | **yes** | no |
| Easing profiles | accel curve | accel + soft + overshoot | linear only |
| Sequence storage | 8 KB script | flash on the co-processor | 16 MB, 255 groups |
| Authored where | Control Center | the sim / PCA Studio | their Windows app |
| Firmware you can change | no | **yes, it is ours** | no |

## What I would actually say

**The one thing it beats both on is tidiness.** One board, 32 channels, one
UART, no co-processor to flash, no I²C. If you were starting from nothing and
wanted a droid wired in an afternoon, that is a real argument.

**It is behind on everything the last fortnight has been about.** Concurrency,
background idles, release-when-parked and easing are the four things we
deliberately went *past* the Maestro to get, and this board has none of them.
It is closer to a Maestro-minus than a Maestro-plus. Buying it would mean
authoring in a Windows app rather than in your own sequencer, against a channel
table that cannot carry your calibration.

**And it is a closed box.** The MaestroPCA route's real advantage is not the
£10 — it is that the firmware is ours. When the bench said overshoot needed
headroom, or that a channel could walk past its endpoint, we changed the
engine. On the RTrobot board you get what it does.

**So: probably not, for your droid.** The case for buying one is if you want a
second, simpler rig — a standalone prop, or something to lend someone — where
32 channels on one board and no flashing matters more than the animation
quality. If that ever comes up, the exporter is small and I would write it.

One thing worth doing either way: if anyone in the community already runs one,
the text-file format above is enough to convert their action groups **into**
the sim, so their existing choreography could be imported, previewed against
the 3D droid, and re-exported to whichever board they end up on. That is
useful independently of whether you buy the hardware.
