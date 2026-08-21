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
echo "== the droid sketch carries its own copy of the library =="
# MaestroReplacement/ holds a copy of MpcaScan.h, MaestroPCA.{h,cpp} and
# MaestroLink.{h,cpp} so it compiles with nothing installed but Adafruit's
# driver — you unzip the folder and press Verify.
#
# A COPY IS A LIABILITY, and this project has paid for that once already:
# v1.53.0 gave PCA_Bridge its own copy of the bus scan and v1.53.1 had to
# prove the two agreed rather than promise it. So the copies are not left as
# a promise either. They must be BYTE-IDENTICAL to ../src, and the moment
# they are not, this says which file and how to fix it — because a drifted
# copy in the sketch that ends up in the droid is the worst place for one.
SKETCH=../examples/MaestroReplacement
COPIES="MpcaScan.h MaestroPCA.h MaestroPCA.cpp MaestroLink.h MaestroLink.cpp"
# R2_Bench_Console carries the same five, and is checked for the same reason —
# it was found MISSING MpcaScan.h entirely, which is the failure this guard is
# for: not a copy that drifted, a copy that was never there. The sketch
# compiled anyway for as long as the library happened to be installed, and
# stopped the moment it was not.
BENCH=../../bench-sketches/R2_Bench_Console
drift=0
for d in "$SKETCH" "$BENCH"; do
  for f in $COPIES; do
    if [ ! -f "$d/$f" ]; then
      echo "  FAIL  $(basename $d)/$f is MISSING            —   cp ../src/$f $d/$f"
      drift=1
    elif cmp -s "../src/$f" "$d/$f"; then
      echo "  PASS  $(basename $d)/$f matches ../src"
    else
      echo "  FAIL  $(basename $d)/$f has drifted from ../src   —   cp ../src/$f $d/$f"
      drift=1
    fi
  done
done
# and every one of our includes must be QUOTED: an <angled> include is only
# found on the LIBRARY path, so a folder carrying its own copies cannot use it
for d in "$SKETCH" "$BENCH"; do
  for f in "$d"/*.ino; do
    bad=$(grep -n '#include *<\(MaestroPCA\|MaestroLink\|MpcaScan\)\.h>' "$f" || true)
    if [ -n "$bad" ]; then
      echo "  FAIL  $(basename $f) includes ours with <angles>, which the sketch folder is not searched for:"
      echo "$bad" | sed 's/^/          /'
      drift=1
    else
      echo "  PASS  $(basename $f) includes ours in quotes"
    fi
  done
done
[ $drift -eq 0 ] || { echo "  a sketch is compiling something other than the library beside it"; exit 1; }

echo
echo "== …and compiles from that folder ALONE (nothing installed) =="
# deliberately NO -I ../src here: this is the whole point of the copies
g++ -std=c++11 -O0 -w \
    -I shim -I . -I "$SKETCH" \
    compile_maestro_replacement.cpp "$SKETCH/MaestroPCA.cpp" "$SKETCH/MaestroLink.cpp" \
    -o /tmp/maestrorepl_selfcontained
timeout 30 /tmp/maestrorepl_selfcontained

echo
echo "== the link port: both branches, and the Mega guard =="
# THE MEGA TRAP. SoftwareSerial's RX needs a pin-change interrupt and digital 8
# on a Mega2560 (PH5) has none: the port opens, the sketch runs, and not one
# byte is ever received, with no error anywhere. So the sketch takes a hardware
# UART wherever one is spare, and REFUSES to build on a Mega if somebody forces
# it back onto a pin that cannot receive. Both paths are compiled here because
# the harness would otherwise only ever exercise the fallback.
cat > /tmp/mpca_hwport.h <<'HDR'
#pragma once
#include <stddef.h>
#include <stdint.h>
struct __HwPort { void begin(unsigned long){} int available(){return 0;} int read(){return -1;}
                  size_t write(const uint8_t*,size_t){return 0;} size_t write(uint8_t){return 0;} };
extern __HwPort Serial1;
#define SERIAL_PORT_HARDWARE_OPEN Serial1
HDR
echo '#include "/tmp/mpca_hwport.h"' > /tmp/mpca_hwport.cpp
echo '__HwPort Serial1;'            >> /tmp/mpca_hwport.cpp
g++ -std=c++11 -O0 -w -I shim -I . -I ../examples/MaestroReplacement -include /tmp/mpca_hwport.h \
    compile_maestro_replacement.cpp /tmp/mpca_hwport.cpp \
    ../src/MaestroPCA.cpp ../src/MaestroLink.cpp -o /tmp/maestrorepl_hw
timeout 30 /tmp/maestrorepl_hw

if g++ -std=c++11 -O0 -w -D__AVR_ATmega2560__ -DLINK_FORCE_SOFT -I shim -I . \
       -I ../examples/MaestroReplacement compile_maestro_replacement.cpp -fsyntax-only 2>/dev/null; then
  echo "  FAIL  a Mega forced onto LINK_RX_PIN 8 BUILT — the guard is not working"
  exit 1
else
  echo "  PASS  a Mega forced onto a pin that cannot receive refuses to build"
fi

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
