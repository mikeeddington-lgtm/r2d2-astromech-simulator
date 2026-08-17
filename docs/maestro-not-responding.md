# SOLVED (board fault): Mini Maestro 18 works over USB but is completely deaf to the Arduino

**RESOLUTION: it was the board.** The same simple sketch and the same simple
script, on the same wire and pin, work on a **replacement Mini Maestro 18**. The
original is faulty — it accepts everything over USB and receives nothing on its
TTL RX pin. Everything below is the elimination that got there, kept because the
method may be useful to someone else and because a second builder has hit the
same thing (see the forum thread at the end).

---

**Short version:** the Maestro does everything correctly over USB — connects, plays
sequences, moves servos from the Status tab sliders — but ignores every byte the
Arduino sends. I have proved the Arduino is transmitting valid data on the right
pin at the right baud, proved the Maestro is in the right serial mode with no
error flags, and proved that a **Set Target command from the Arduino does not
change the Maestro's own internal Target register**. The byte is not reaching the
receiver.

---

## Hardware

| | |
|---|---|
| Microcontroller | Arduino **Mega ADK** (ATmega2560) |
| Servo controller | **Pololu Mini Maestro 18**, firmware **1.03**, serial #00471640 |
| Sketch | Padawan360 derivative — `Maestro_Mega_DYSV5W` (Steve Baudains 2025, hub-motor edits by Steven Sloan) |
| Library | `PololuMaestro`, `MiniMaestro maestro(Serial1)` |
| Foot drives | Flipsky ESCs / brushless hub motors (`FOOT_CONTROLLER 1`) |
| Audio | DY-SV5W |

The Maestro is the **dome** board: 4 pie panels, 3 holoprojectors (pan + tilt),
7 lower dome panels, one spare channel. All 18 channels are `mode="Servo"`,
`homemode="Off"`, `speed="80"`, `acceleration="10"`.

## Maestro serial settings (verified on screen, Apply Settings greyed out = in sync)

- Serial mode: **UART, fixed baud rate — 9600**
- Enable CRC: **unchecked**
- Device Number: 12
- Mini SSC offset: 0
- Timeout: 0.00
- Never sleep: unchecked
- **Error code: 0x0000**

## Wiring

- Arduino **TX1 (pin 18)** → Maestro **RX**
- Both the Mega and the Maestro are plugged into the **same PC by USB**, so their
  grounds are common through the computer
- Also tried the whole thing on **Serial3 (pin 14)** first — identical result

---

## The symptom

- Control Center: everything works. Connects, sequences play, Status tab sliders
  move the servos.
- From the Arduino: **nothing at all**, ever. Not `restartScript()`, not
  `setTarget()`.
- Maestro error code stays at **0x0000** throughout.

---

## What I have ruled out, and how

I added a serial-monitor debug layer to the sketch so it reports what it is
actually doing rather than what it is supposed to be doing.

**1. The sketch isn't running / hangs in setup.**
Ruled out. It narrates every stage of `setup()` to completion and reaches
`loop()`, which then ticks at a steady **241 Hz**.

**2. The USB Host Shield fails to init (the sketch has a silent `while(1)` halt
if it does).**
Ruled out. `Usb.Init()` returns OK, the controller connects and reports live
button states.

**3. The button combos are wrong / the code never calls the Maestro.**
Ruled out. The monitor shows the trigger and d-pad state and a per-second count
of calls. One tap of L2+UP produces:

```
[status] 241 Hz | pad CONNECTED | L2 255 R2 0 | dpad U... | drive ARMED
   -> restartScript(4) fired 55 times in the last second
```

(That 55 is a separate issue — the stock sketch uses `getButtonPress` on the
d-pad so a held direction re-fires every pass. Worth fixing, but it is not the
cause here: even a single deliberate call does nothing.)

**4. The Arduino's UART or the TX pin is dead.**
Ruled out by loopback. Jumper **pin 18 → pin 19**, send a byte pattern out TX1,
read it back on RX1:

```
   sent 0x55    got 0x55
   sent 0xAA    got 0xAA
   sent 0x00    got 0x00
   sent 0xFF    got 0xFF
   sent 0x0F    got 0x0F
   sent 0xF0    got 0xF0
   sent 0x52    got 0x52
   sent 0x32    got 0x32
   *** PASS *** all 8 bytes came back.
```

So the port is open, configured at 9600, the pin is alive, and the chip really
is transmitting.

**5. Wrong serial mode on the Maestro** (a USB mode would ignore the RX pin
entirely). Ruled out — see settings above, screenshot available.

**6. CRC mismatch.** Ruled out — disabled on the board, and the library sends none.

**7. Device-number mismatch.** Not applicable. `MiniMaestro maestro(Serial1)`
leaves `deviceNumber` at its default of 255, which the library treats as "not
supplied", so it uses the **compact protocol** — no address byte. The board's
Device Number of 12 is irrelevant in that mode.

**8. Baud mismatch.** Both ends 9600, and the loopback confirms the Arduino's
actual line rate.

**9. Common ground.** Both devices share the PC's USB ground.

**10. Something wrong with my script.** Bypassed entirely — I send **Set Target
(0x84)** directly, which needs no script at all. Also tried a settings file whose
script is a bare `begin / servo / delay / repeat` main program with "Run script
on startup" ticked, which needs no serial at all.

**11. The script itself is malformed.** Verified independently: 8 sequence
subroutines in declaration order, a top-level `quit` so `restartScript` numbering
isn't shifted, no `begin/repeat` wrapper, 716 bytes of the 8192 available.

---

## Where that leaves me

Every link in the chain is proven except one: **whether the Maestro's TTL RX pin
is actually receiving.** A damaged RX input would explain everything — USB is a
completely separate path and would keep working perfectly, and a dead input
receives nothing, so there is nothing for the error flags to report. Hence
`0x0000`.

There is a thread describing what looks like exactly this fault:
<https://forum.pololu.com/t/problems-controlling-maestro-mini-18/25780> — also an
R2 build, also a Mini Maestro 18, works over USB, deaf to the Arduino. When that
builder swapped the two boards over, **the fault followed the physical board.**
They also reported **two short orange flashes** on the bad one. That thread is
unresolved.

---

## Two of my open questions now have answers

**"What do two short orange/yellow flashes mean?"** — nothing bad. Straight from
the user's guide: *"Once the Maestro is ready to drive servos, the yellow LED
will periodically flash briefly. A single flash indicates no servos enabled; a
double flash indicates at least one servo enabled or output driven high."* The
double blink reported in the forum thread is **normal operation**, not a fault
code. Worth knowing before anyone else chases it.

**"Is there any way to test the RX pin without a second Maestro?"** — yes, and it
needs nothing but a jumper wire and the board's own USB cable:

1. Serial Settings → **USB Dual Port** → Apply Settings. In this mode the TTL
   Port COM port is wired straight through to the physical RX and TX pins.
2. **Jumper the Maestro's own TX pin to its own RX pin.**
3. Open the **TTL Port** COM port (not the Command Port) at 9600 in the Pololu
   Serial Transmitter utility — <https://www.pololu.com/docs/0J23>
4. Send a byte, e.g. `0x55`.

It leaves on TX, goes round the jumper, arrives on RX, and comes back to the PC
on the TTL Port. **Byte returns → the RX pin is alive. Nothing returns → RX is
dead**, proven on the board by itself.

**I ran it on both boards. Same jumper, same utility, same bytes:**

```
SUSPECT BOARD
  02:26:30 PM   sent 55 4A          (nothing received)
  02:26:40 PM   sent 55 4A          (nothing received)

KNOWN-GOOD BOARD
  02:27:02 PM   sent 55 4A
                received:  55 'U'   4A 'J'
```

The good board loops both bytes straight back. The suspect board transmits the
same two bytes and hears nothing on its own RX pin. **The RX input is dead** —
with no Arduino, no sketch, no script and no external wiring involved at all.
The USB path is completely unaffected, which is exactly why the board looked
healthy for the whole investigation.

## Still open

1. **Has anyone else seen a Mini Maestro's TTL RX input fail while USB carried on
   working normally?** Is this a recognised failure mode?
2. **What kills it?** My working theory is a **ground that came loose while both
   boards were powered** — with the common ground open, the Arduino's output
   current has to return through the RX pin's protection diodes, which kills the
   input while leaving everything else intact. Servo voltage onto the signal
   line, or hot-plugging with a ground offset, would do the same.

   Two habits that would have prevented it, and that I am adopting on the
   replacement:
   - **Ground first, ground last.** Connect ground before signal and disconnect
     it after. On a connector, put ground where it cannot part company alone.
   - **A series resistor on the signal line**, 220 Ω to 1 kΩ between the
     Arduino's TX and the Maestro's RX. Invisible at 9600 baud, and it limits
     fault current to something an input can survive.

   If anyone knows the actual failure mechanism rather than my guess at it, I
   would like to hear it.

## The test that settles it — done, and it failed

Watching **channel 0's Target box on Control Center's Status tab** while the
Arduino sends a Set Target. That reads the Maestro's *own internal state*, so it
is independent of whether a servo is attached, powered, or working at all.

Arduino side, from the serial monitor — the commands definitely left the chip:

```
[key] stopScript()
[key] flapping PP5 three times...
[key] done
[key] setTarget(ch0, 7296)  PP5 OPEN - no script involved
[key] setTarget(ch0, 4544)  PP5 SHUT - no script involved
[status] 241 Hz | pad --
```

Maestro side: **channel 0's Target never moved.** Not once, across a nine-second
flap and two single Set Target commands. It should have alternated between
1824.00 µs and 1136.00 µs.

That is as clean as this gets. The Arduino transmits verified-correct bytes on a
verified-working pin at a verified-correct baud; the Maestro is in UART mode at
that baud with CRC off and no error flags; and the board's internal target
register does not change. **The data is not reaching the receiver.**

## How it was finally confirmed

**Board swap.** Pololu's own `examples/Basic` sketch (only change: `MiniMaestro`
instead of `MicroMaestro`, and my own endpoints) plus a six-line Maestro script:

```
quit

sub PP5
  7296 0 servo   1500 delay
  4544 0 servo   1500 delay
  return
```

Same Arduino, same pin, same wire, same settings. **Original board: nothing.
Replacement board: works.**

A multimeter at the Arduino end was inconclusive, and worth explaining why: pin
18 read the same ~5 V whether the Maestro was connected or not. That rules out a
*shorted* input — a blown-low input would drag the line down — but it looks
identical to a broken wire or an internally *open* input, because neither loads
the line. Measuring at the Maestro's own RX pad, or the USB Dual Port loopback
above, is what actually distinguishes them.

## Earlier next steps, for the record

1. **Multimeter on the RX line.** Pololu's spec says RX is non-inverted TTL and
   needs >4 V to read as HIGH. Idle serial is high, so:
   - Mega pin 18, wire disconnected → expect ~5 V
   - Mega pin 18, wire connected → if it collapses toward 0 V, the Maestro is
     pulling the line down, which means a damaged input
   - Maestro RX pad, wire connected → if the Mega end reads 5 V and this reads
     0 V, it's a broken wire or a bad joint
2. **Swap in the second Mini Maestro 18** (the body board) on the same wire, same
   pin, same sketch. If it responds, the fault is the board.

If anyone has a better idea before I order a replacement, I am all ears —
particularly on questions 1 and 2 above.
