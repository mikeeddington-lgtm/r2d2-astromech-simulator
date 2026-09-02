# Host tests

`run.sh` compiles MaestroPCA + MaestroLink for the **host** (not an
Arduino) alongside Pololu's own `maestro-arduino` library, and checks that
the exact bytes that library emits are understood byte for byte.

    git clone --depth 1 https://github.com/pololu/maestro-arduino.git /tmp/maestro-arduino
    ./run.sh                       # or POLOLU_DIR=/path/to/it ./run.sh

It needs `g++`, and — for the last step, which builds and reads back the
three sketch packs — `zip` and `unzip`. The script checks for all three
before it compiles anything, and says which is missing (v1.79.0).

`shim/` holds the few headers needed to build Arduino code on a PC:
`Arduino.h` (types, a *settable* millis() so tests control time, PROGMEM
macros as plain memory), `Stream.h`, and an `Adafruit_PWMServoDriver` that
records what would have gone out over I2C instead of sending it.

The shims are for TESTING ONLY — nothing here is flashed to a board.
