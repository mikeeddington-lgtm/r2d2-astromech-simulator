#!/bin/bash
# Compiles MaestroPCA + MaestroLink for the HOST, alongside Pololu's own
# maestro-arduino library, and checks we understand the exact bytes it
# emits. Needs g++, a copy of pololu/maestro-arduino, and zip/unzip for
# the packs step at the bottom.
set -e
cd "$(dirname "$0")"

# v1.79.0 / TOOL-02 — this header used to promise only "g++ and the Pololu
# library". zip and unzip are needed too (make-packs.sh, called at the very
# end, zips each pack and reads its listing back to print the file count),
# and neither was ever checked — so a box missing one ran every compile in
# this file, forty-odd PASS lines deep, before dying on the last step with
# no hint what was missing. Checked here, before the first g++, so a
# missing tool is the FIRST line printed, not the last.
for tool in g++ zip unzip; do
  case "$tool" in
    g++)   why="to compile the tests" ;;
    zip)   why="to build the sketch packs" ;;
    unzip) why="to read back what a sketch pack contains" ;;
  esac
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool not found on PATH — needed $why"; exit 1; }
done

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
echo "== protocol: the one command that announces its own length =="
# 0x9F is the only command whose argument count comes off the wire, so it
# is the only one that can be told to walk off the end of _arg — and the
# parser's own self-resync is what turns a single dropped byte into the
# two bytes that do it. Compiled a SECOND time under AddressSanitizer,
# because the first version of this bug executed happily and silently in
# a normal build and only a sanitizer said where the reads went.
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim link_multi_test.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
    -o /tmp/maestromulti_test
timeout 30 /tmp/maestromulti_test
g++ -std=c++11 -O1 -g -fsanitize=address -Wall -Wno-unused-variable \
    -I shim link_multi_test.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
    -o /tmp/maestromulti_asan
# v1.79.0 / M20 — this used to be `timeout 60 … > /dev/null && echo PASS`.
# Under `set -e`, a failing command that is not the LAST one in an `&&` list
# does not exit the script: `bash -c 'set -e; false && echo x; echo y'`
# prints "y" and exits 0. So an ASan report — the exact thing this second
# build exists to catch, and the thing that found §8.1 in August — printed
# straight to the terminal and the run kept going green, because the PASS
# line was gated on a command whose failure this script was silently
# willing to survive. Split into two statements: the run's own exit status
# is what fails the script now, same as every other `timeout … /tmp/...`
# line above it; the PASS is only printed once that has already succeeded.
timeout 60 /tmp/maestromulti_asan > /dev/null
echo "  PASS  and again under AddressSanitizer, with nothing to report"

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
echo "== engine: disjoint sequences on a THREE-BOARD rig =="
# Everything above runs on one board, and the channel mask used to be one
# uint32_t with every channel from 31 up folded into bit 31 — so a suite
# that never went past 16 channels could not see that "several sequences
# at once, on disjoint channels" had stopped working on every rig with
# three PCA9685s on it. 48 channels, which is what the README describes.
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim mask_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestromask_test
timeout 30 /tmp/maestromask_test

echo
echo "== engine: sequence slots past 127 =="
# A track's `seq` doubles as "this track is free" by going negative, so
# slot 128 in an int8_t was a track that was born free: it never played,
# and sequenceRunning() matched the truncated value and said it had.
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim slots_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestroslots_test
timeout 30 /tmp/maestroslots_test

echo
echo "== engine: the ESP32's direct-pin backend, on BOTH arduino-esp32 cores =="
# TWICE, and that is the point. 2.x makes you pick an LEDC CHANNEL and hang
# a pin on it; 3.x hides channels and addresses everything by pin. Until
# v1.68.0 only the 3.x spelling had ever been compiled by anything, and the
# 2.x branch used the GPIO NUMBER as the channel — so twelve of the sixteen
# default servo pins asked for channels that do not exist, the writes went
# to a channel with no pin on it, and not one servo would have moved. The
# fake peripheral refuses exactly what the silicon refuses, so the same
# assertions run through both and neither can drift.
for core in 3 2; do
  g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
      -I shim -I . -DMPCA_TEST_CORE=$core \
      ledc_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestroledc_test_$core
  echo "   -- arduino-esp32 core $core --"
  timeout 30 /tmp/maestroledc_test_$core
done

echo
echo "== what the SERVO is shown: LEDC vs PCA9685, and a blocked loop =="
# Not a unit test — a measurement, kept because the answer is the reason
# Esp32Droid ships with its radio off. See the header of ripple_test.cpp.
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim -I . ripple_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestroripple_test
timeout 90 /tmp/maestroripple_test

echo
echo "== engine: split across two boards, one down a wire =="
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim split_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestrosplit_test
timeout 30 /tmp/maestrosplit_test

echo
echo "== two bounds that used to be checked one step too late =="
# The split link's channel number, computed in a uint8_t before being
# tested against 127 — so board 16 wrapped to 0 and a channel the wire
# cannot address went out as channel 0. And update()'s stall clamp, which
# gave the frame timers 250 ms and the kinematics 200 of it.
g++ -std=c++11 -O1 -Wall -Wno-unused-variable \
    -I shim bounds_test.cpp ../src/MaestroPCA.cpp -o /tmp/maestrobounds_test
timeout 30 /tmp/maestrobounds_test

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
BENCH=../../bench-sketches/R2_Bench_Console
E32=../examples/Esp32Droid
COPIES="MpcaScan.h MaestroPCA.h MaestroPCA.cpp MaestroLink.h MaestroLink.cpp"
# R2_Bench_Console carries the same five, and is checked for the same reason —
# it was found MISSING MpcaScan.h entirely, which is the failure this guard is
# for: not a copy that drifted, a copy that was never there. The sketch
# compiled anyway for as long as the library happened to be installed, and
# stopped the moment it was not.
#
# MpcaEsp32.h is carried ONLY by the two that include it — the bench console
# on BT_LEDC and Esp32Droid. MaestroReplacement neither includes nor carries
# it, deliberately: a copy nobody compiles is a copy that rots unnoticed.
drift=0
check_copies(){
  d=$1; shift
  for f in "$@"; do
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
}
check_copies "$SKETCH" $COPIES
check_copies "$BENCH"  $COPIES MpcaEsp32.h
check_copies "$E32"    $COPIES MpcaEsp32.h

# and every one of our includes must be QUOTED: an <angled> include is only
# found on the LIBRARY path, so a folder carrying its own copies cannot use
# it. MpcaEsp32 was added to this list in v1.68.0 — it had been missing from
# it since the guard was written, and BOTH ESP sketches were including it
# with angles the whole time, in front of a green suite.
for d in "$SKETCH" "$BENCH" "$E32"; do
  for f in "$d"/*.ino; do
    bad=$(grep -n '#include *<\(MaestroPCA\|MaestroLink\|MpcaScan\|MpcaEsp32\)\.h>' "$f" || true)
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
#
# Esp32Droid is now built FROM ITS OWN FOLDER, with no -I at ../src — the
# route a builder takes with the pack. And on every combination that
# changes which code is compiled: two cores x radio on/off x pins/expander.
# Each one is reached by editing a COPY of Config.h, because that is how a
# user reaches it; a -D flag would test a route nobody takes.
for core in 3 2; do
  for wifi in 0 1; do
    for direct in 1 0; do
      rm -rf /tmp/e32pack
      cp -r ../examples/Esp32Droid /tmp/e32pack
      sed -i "s/^#define ESP_WIFI           0/#define ESP_WIFI           $wifi/" /tmp/e32pack/Config.h
      sed -i "s/^#define MPCA_DIRECT_PINS   1/#define MPCA_DIRECT_PINS   $direct/" /tmp/e32pack/Config.h
      grep -q "^#define ESP_WIFI           $wifi" /tmp/e32pack/Config.h || {
        echo "  FAIL  could not switch ESP_WIFI in Config.h — has the line moved?"; exit 1; }
      grep -q "^#define MPCA_DIRECT_PINS   $direct" /tmp/e32pack/Config.h || {
        echo "  FAIL  could not switch MPCA_DIRECT_PINS in Config.h — has the line moved?"; exit 1; }
      g++ -std=c++11 -O0 -w \
          -I shim -I esp32shim -I /tmp/e32pack \
          -DMPCA_SHIM_CORE=$core -DESP32_INO='"/tmp/e32pack/Esp32Droid.ino"' \
          esp32shim/compile_esp32.cpp /tmp/e32pack/MaestroPCA.cpp /tmp/e32pack/MaestroLink.cpp \
          -o /tmp/maestroesp32_compile
      printf "   core %s · ESP_WIFI %s · MPCA_DIRECT_PINS %s   " "$core" "$wifi" "$direct"
      timeout 30 /tmp/maestroesp32_compile
    done
  done
  g++ -std=c++11 -O0 -w \
      -I shim -I esp32shim -I ../src -DMPCA_SHIM_CORE=$core \
      esp32shim/compile_esp32_slave.cpp ../src/MaestroPCA.cpp ../src/MaestroLink.cpp \
      -o /tmp/maestroesp32slave_compile
  printf "   core %s   " "$core"
  timeout 30 /tmp/maestroesp32slave_compile
done

# THE CEILING IS A COMPILE ERROR, not a comment. Sixteen is the LEDC
# peripheral's channel count; a bigger table used to leave the top channels
# quietly dead with only a runtime warning nobody reads on a droid with no
# serial monitor attached. Asserted to FIRE, because a guard that has
# stopped working looks exactly like a guard that is not needed.
rm -rf /tmp/e32big && cp -r ../examples/Esp32Droid /tmp/e32big
sed -i 's/^#define MPCA_CHANNELS  8/#define MPCA_CHANNELS  24/' /tmp/e32big/sequences.h
if g++ -std=c++11 -O0 -w -I shim -I esp32shim -I /tmp/e32big \
       -DESP32_INO='"/tmp/e32big/Esp32Droid.ino"' esp32shim/compile_esp32.cpp -fsyntax-only 2>/dev/null; then
  echo "  FAIL  a 24-channel table on ESP32 pins BUILT — the ceiling guard is not working"
  exit 1
else
  echo "  PASS  a table bigger than LEDC can drive refuses to build"
fi

echo
echo "== the bench console compiles, on ALL THREE back ends =="
# The sketch a human types at with a droid on the bench, compiled against
# Pololu's REAL library rather than a stand-in for it. It had no compile
# check at all until v1.67.0 — and it is the sketch that was found missing
# MpcaScan.h, and the one left pointing at the wrong back end for an
# evening. A compile would not have caught either on its own; the guards
# above catch those. This catches everything after them.
g++ -std=c++11 -O0 -w \
    -I shim -I . -I "$POLOLU" -I ../../bench-sketches/R2_Bench_Console \
    compile_bench_console.cpp "$POLOLU/PololuMaestro.cpp" -o /tmp/bench_maestro
timeout 30 /tmp/bench_maestro

# The OTHER back ends, reached the way a user reaches them: copy the folder,
# edit BENCH_TARGET in Config.h. A -D flag would test a route nobody takes.
#
# BT_LEDC had NO compile check of any kind until v1.68.0 — "BOTH back ends"
# meant BT_MAESTRO and BT_PCA, and the third was the one carrying an
# <angled> include of a header that lives beside the sketch.
bench_backend(){                 # $1 = BT_*, $2 = extra g++ flags, $3 = label
  rm -rf /tmp/bench_alt
  cp -r ../../bench-sketches/R2_Bench_Console /tmp/bench_alt
  sed -i "s/^#define BENCH_TARGET   BT_MAESTRO/#define BENCH_TARGET   $1/" /tmp/bench_alt/Config.h
  grep -q "^#define BENCH_TARGET   $1" /tmp/bench_alt/Config.h || {
    echo "  FAIL  could not switch BENCH_TARGET to $1 in Config.h — has the line moved?"; exit 1; }
  g++ -std=c++11 -O0 -w \
      -I shim -I . -I "$POLOLU" -I /tmp/bench_alt $2 \
      -DBENCH_INO='"/tmp/bench_alt/R2_Bench_Console.ino"' \
      compile_bench_console.cpp /tmp/bench_alt/MaestroPCA.cpp /tmp/bench_alt/MaestroLink.cpp \
      -o /tmp/bench_alt_bin
  printf "%s" "${3:-}"
  timeout 30 /tmp/bench_alt_bin
}
bench_backend BT_PCA  ""                                  ""
bench_backend BT_LEDC "-DBENCH_LEDC -DMPCA_SHIM_CORE=3"   "   core 3 "
bench_backend BT_LEDC "-DBENCH_LEDC -DMPCA_SHIM_CORE=2"   "   core 2 "

# and the same ceiling, in the console this time
rm -rf /tmp/bench_big && cp -r ../../bench-sketches/R2_Bench_Console /tmp/bench_big
sed -i 's/^#define BENCH_TARGET   BT_MAESTRO/#define BENCH_TARGET   BT_LEDC/' /tmp/bench_big/Config.h
sed -i 's/^#define MPCA_CHANNELS  8/#define MPCA_CHANNELS  32/' /tmp/bench_big/sequences.h
if g++ -std=c++11 -O0 -w -I shim -I . -I "$POLOLU" -I /tmp/bench_big -DBENCH_LEDC \
       -DBENCH_INO='"/tmp/bench_big/R2_Bench_Console.ino"' \
       compile_bench_console.cpp -fsyntax-only 2>/dev/null; then
  echo "  FAIL  32 channels on BT_LEDC BUILT — the ceiling guard is not working"
  exit 1
else
  echo "  PASS  32 channels on BT_LEDC refuses to build"
fi

echo
echo "== the downloadable packs still build =="
# The two zips the README links to are GENERATED from the sketch folders
# above — there is no second copy in the repository to go stale. This runs
# the same script the release workflow runs, so a change that would ship a
# broken pack fails here instead of on a stranger's bench.
#
# CALLED THROUGH bash ON PURPOSE, not as ./make-packs.sh. The executable bit
# is not something a checkout can be relied on to carry — it is absent on a
# Windows clone with core.filemode false, absent from a downloaded zip, and it
# was absent from the commit that first added this line, which failed the
# v1.67.0 release with `exit code 126` and no explanation on the page. The
# mode bit is set in the index as well; this is so losing it again cannot
# matter.
bash ../../packs/make-packs.sh
