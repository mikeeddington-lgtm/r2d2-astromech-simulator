#!/bin/bash
# Compiles MaestroPCA + MaestroLink for the HOST, alongside Pololu's own
# maestro-arduino library, and checks we understand the exact bytes it
# emits. Needs g++ and a copy of pololu/maestro-arduino.
set -e
cd "$(dirname "$0")"
POLOLU="${POLOLU_DIR:-/tmp/maestro-arduino}"
if [ ! -f "$POLOLU/PololuMaestro.cpp" ]; then
  echo "maestro-arduino not found at $POLOLU"
  echo "  git clone --depth 1 https://github.com/pololu/maestro-arduino.git $POLOLU"
  echo "  (or set POLOLU_DIR)"
  exit 1
fi
echo "== protocol: golden test against Pololu's own library =="
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim -I "$POLOLU" \
    link_test.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp "$POLOLU/PololuMaestro.cpp" \
    -o /tmp/maestrolink_test
timeout 30 /tmp/maestrolink_test

echo
echo "== engine: beyond the Maestro =="
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim features_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestrofeat_test
timeout 30 /tmp/maestrofeat_test

echo
echo "== engine: concurrent tracks and looping =="
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim tracks_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestrotracks_test
timeout 30 /tmp/maestrotracks_test

echo
echo "== engine: the ESP32's direct-pin backend (peripheral faked) =="
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim ledc_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestroledc_test
timeout 30 /tmp/maestroledc_test

echo
echo "== engine: split across two boards, one down a wire =="
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim split_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestrosplit_test
timeout 30 /tmp/maestrosplit_test

echo
echo "== the I2C bus scan: the All Call trap, and the address order =="
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim scan_test.cpp -o /tmp/maestroscan_test
timeout 30 /tmp/maestroscan_test

echo
echo "== the ESP32 sketches compile (against a faked ESP32) =="
g++ -std=c++11 -O0 -w \
    -I shim -I esp32shim -I ../src \
    esp32shim/compile_esp32.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
    -o /tmp/maestroesp32_compile 2>/dev/null
timeout 30 /tmp/maestroesp32_compile
g++ -std=c++11 -O0 -w \
    -I shim -I esp32shim -I ../src \
    esp32shim/compile_esp32_slave.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
    -o /tmp/maestroesp32slave_compile 2>/dev/null
timeout 30 /tmp/maestroesp32slave_compile
