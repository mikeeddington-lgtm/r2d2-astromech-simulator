# R2 Bench Console

A sketch you drive by typing at it, so a servo can be tested without a
Padawan360 build, a USB Host Shield, an Xbox controller or a droid.

One sketch, three back ends, **the same commands on all three** — so a
move proved on the bench Maestro is proved the same way on the PCA rig,
and a difference in behaviour is a difference in the *hardware* rather
than in the test.

| `BENCH_TARGET` | drives | needs |
|---|---|---|
| `BT_MAESTRO` *(default)* | a real Pololu Mini/Micro Maestro over a UART | `PololuMaestro` |
| `BT_PCA` | PCA9685 board(s) over I2C, via MaestroPCA | `MaestroPCA`, `Adafruit_PWMServoDriver`, `sequences.h` |
| `BT_LEDC` | ESP32 pins directly, no expander (16 channels max) | `MaestroPCA`, `sequences.h` |

Change the one `#define BENCH_TARGET` line near the top. Everything else
in section 2 is configuration: ports, baud, channel count, the flap
dwell, the nudge step.

## Wiring

**`BT_MAESTRO`** — three things, and only three:

```
Arduino TX  ->  Maestro RX      (they cross over)
Arduino GND ->  Maestro GND     <- the one people forget
Maestro servo power + logic power (the VSRV=VIN jumper does both)
```

Optional fourth wire, **Maestro TX -> Arduino RX**, and it is worth
running: it is what lets `p`, `err` and `state` answer at all, and it is
the only way to catch a silent clamp (below).

Mega / Mega ADK uses `Serial1`, so TX is pin 18. Leonardo uses `Serial1`,
pin 1. A Uno has no spare hardware UART and falls back to SoftwareSerial
on pin 11 — the sketch prints which it picked at boot.

The board must be in **UART, fixed baud rate** at `MAESTRO_BAUD`, CRC
disabled, and *Apply Settings* must have been clicked.

**`BT_PCA`** — PCA9685 on I2C (Mega SDA 20 / SCL 21, ESP32 21 / 22), V+
from a real 5–6 V servo supply and **never** the Arduino's 5 V, a common
ground, 1000–4700 µF across V+/GND. The bus is scanned at boot, so the
boards are found wherever you jumpered them.

**`BT_LEDC`** — servos on the GPIOs listed in `LEDC_PINS`. Sixteen
channels is the silicon's limit, not a setting.

## Typing at it

Open the serial monitor at 115200. Two styles work at once:

- **one key, no Enter** — every hotkey is a digit or punctuation, never a
  letter, so `home` can never be read as `h`,`o`,`m`,`e`. These work with
  the monitor set to *No line ending*.
- **words, then Enter** — set the monitor to *Newline* and both styles
  work together.

```
0-9  fire that script slot        !  stop the script
[ ]  select prev / next channel   /  go home
< >  selected to min / max        =  to the midpoint
+ -  nudge it by the step         *  flap it 3 times
#    state and counters           .  ALL channels limp
?    the command list
```

```
list                  the channel table
sel <ch>              choose the working channel
t <ch> <qus>          set target (0 = stop pulsing)
us <ch> <us>          set target in microseconds
pct <ch> <0-100>      set it as a % of min..max
p [ch]                read the position back
min|max|mid [ch]      drive to an endpoint
off [ch]              stop pulsing that one (limp)
all min|max|mid|home|off
flap [ch] [n]         throw it n times, non-blocking
nudge <qus>           set the + / - step
speed <ch> <v>        0 = unlimited   (RUNTIME only)
accel <ch> <v>        0 = unlimited   (RUNTIME only)
g <n>                 restartScript(n)
x                     stopScript
home                  goHome
state                 moving / script / counters
mon [ms]              stream the position; mon 0 stops
rate                  loop rate
err                   [Maestro] read AND CLEAR the error flags
raw <hex> <hex> ...   [Maestro] send bytes verbatim
loopback              [Maestro] TX->RX jumper test
scan                  [PCA] re-scan the I2C bus
```

Targets are **quarter-microseconds** throughout, exactly as a Maestro and
a `.mstr` use them: 6000 = 1500 µs.

## The four things this exists to catch

**A read that hangs forever.** `PololuMaestro::getPosition()` is written
`while (_stream->available() < 2);` — no timeout. Call it with the
Maestro's TX not wired back, which is how most droids are wired, and the
sketch stops dead in a way that looks exactly like a dead board. Every
read here is done by hand against `REPLY_MS` and a silent board is
*reported* as silent.

**The silent clamp.** A Set Target outside a channel's stored limits is
clamped with no error and no reply. The dial keeps turning, the panel
stops moving, and it reads precisely like a binding linkage or a dying
servo. The console warns when a target falls outside the endpoints it
knows about, and `p` is what proves where the servo actually went.

**`speed 0` / `accel 0`.** Zero means *unlimited* on a Maestro, on
MaestroPCA and on PCA_Bridge alike: full-torque lunge at every step of
every ramp, which is audible, visible, and stacks inrush when several
servos start together. The console says so when you set it.

**TXIN.** The Mini Maestro has three serial pins — RX, TX and TXIN. TXIN
is a daisy-chain input used only in USB Chained mode and is dead in UART
mode; a wire on it is indistinguishable from a dead board. A
factory-reset Maestro also comes up in USB Dual Port mode, which ignores
the RX pin by design, so every test on one is meaningless until Serial
Settings have been applied.

## The channel table

On `BT_PCA` / `BT_LEDC` the table lives in `sequences.h` and is read
straight out of PROGMEM, so the console and the sequences can never
disagree. The `sequences.h` shipped here is a **placeholder** — export
the real one from the simulator (Maestro tab → *Export PCA9685 header*)
or from PCA Studio.

On `BT_MAESTRO` the board holds its own limits and will not hand them
over the command port, so the sketch carries its own copy: Mike's dome
Mini Maestro 18, names and endpoints as measured on the droid. **That
table is read-only.** Nothing in this sketch rewrites it, and `speed` and
`accel` are runtime writes that a power cycle undoes.

## Compiled before delivery

- `BT_MAESTRO` — `avr-g++` for the ATmega2560 against the real Arduino
  core and Pololu's own library. Clean, no warnings.
- `BT_PCA` — same, against MaestroPCA and a stub `Adafruit_PWMServoDriver.h`.
- `BT_LEDC` — host `g++` against a faked ESP32, then `setup()` and
  `loop()` actually run, and a scripted session exercises the parser.
