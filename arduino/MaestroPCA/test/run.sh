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
echo "== PCA_Bridge compiles, and its inlined scan matches MpcaScan.h =="
g++ -std=c++11 -O1 -w \
    -I shim bridge_test.cpp -o /tmp/maestrobridge_test
timeout 30 /tmp/maestrobridge_test

echo
echo "== MaestroReplacement.ino compiles and boots (the sketch in the droid) =="
g++ -std=c++11 -O0 -w \
    -I shim -I . -I ../src -I ../examples/MaestroReplacement \
    compile_maestro_replacement.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
    -o /tmp/maestrorepl_compile
timeout 30 /tmp/maestrorepl_compile

echo
echo "== the ESP32 sketches compile (against a faked ESP32) =="
# NOTE: no 2>/dev/null here, deliberately. It used to be there, and it hid a
# compile check that had stopped working the moment it was written (v1.33.0
# added it, v1.53.0 found it): the only symptom of a broken step was a step
# that printed no PASS, which is exactly what a silent step looks like.
g++ -std=c++11 -O0 -w \
    -I shim -I esp32shim -I ../src \
    esp32shim/compile_esp32.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
    -o /tmp/maestroesp32_compile
timeout 30 /tmp/maestroesp32_compile
g++ -std=c++11 -O0 -w \
    -I shim -I esp32shim -I ../src \
    esp32shim/compile_esp32_slave.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
    -o /tmp/maestroesp32slave_compile
timeout 30 /tmp/maestroesp32slave_compile
