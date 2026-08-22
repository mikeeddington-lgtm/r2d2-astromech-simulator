#!/usr/bin/env bash
# =====================================================================
#  Build the ready-to-run sketch packs the README links to.
#
#  A pack is ONE FOLDER a stranger unzips into Documents\Arduino\, opens,
#  edits Config.h in, and uploads. One library from Library Manager and
#  nothing else to download. That is the whole promise, and it is why the
#  five library files are copied in beside each sketch.
#
#  THE PACKS ARE GENERATED. NEVER EDIT ONE.
#  Their contents ARE the real sketch folders in this repository — the same
#  files ../MaestroPCA/test/run.sh compiles and guards on every push. There
#  is no second copy to keep in step, which is the entire reason this script
#  exists instead of two checked-in zips. A zip in git would go stale the
#  first time somebody fixed a bug in the sketch, and nothing would say so.
#
#  Run by .github/workflows/release.yml, which attaches the output to the
#  release so that
#      releases/latest/download/R2_Bench_Console.zip
#  resolves. Run it by hand to see exactly what a release would ship.
#
#  Output:  arduino/packs/dist/*.zip   (gitignored)
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

SRC=../MaestroPCA/src
OUT=dist
COPIES="MpcaScan.h MaestroPCA.h MaestroPCA.cpp MaestroLink.h MaestroLink.cpp"

# name : folder : any EXTRA library files that folder needs beyond $COPIES.
#
# MpcaEsp32.h is carried only by the two sketches that actually include it.
# MaestroReplacement does not, and deliberately does not carry it: a copy
# nobody compiles is a copy that rots without anything noticing, which is
# the whole reason these are checked byte-for-byte rather than trusted.
PACKS="R2_Bench_Console:../bench-sketches/R2_Bench_Console:MpcaEsp32.h
MaestroReplacement:../MaestroPCA/examples/MaestroReplacement:
Esp32Droid:../MaestroPCA/examples/Esp32Droid:MpcaEsp32.h"

rm -rf "$OUT"; mkdir -p "$OUT"
fail=0

for entry in $PACKS; do
  name=${entry%%:*}
  rest=${entry#*:}
  dir=${rest%%:*}
  extras=${rest#*:}
  packcopies="$COPIES $extras"

  echo "── $name  ($dir)"

  # ---- a pack that is missing a file is worse than no pack at all: it
  #      fails on the stranger's machine, with an error about OUR header.
  for f in $packcopies; do
    if [ ! -f "$dir/$f" ]; then
      echo "   FAIL  $f is missing          —   cp $SRC/$f $dir/$f"; fail=1
    elif ! cmp -s "$SRC/$f" "$dir/$f"; then
      echo "   FAIL  $f has drifted from src —   cp $SRC/$f $dir/$f"; fail=1
    fi
  done

  # ---- Config.h is the promise. "Edit one file" is only true if it is
  #      there and the sketch actually reads it.
  ino="$dir/$name.ino"
  [ -f "$dir/Config.h" ] || { echo "   FAIL  Config.h is missing — the pack's whole premise"; fail=1; }
  [ -f "$dir/README.md" ] || { echo "   FAIL  README.md is missing"; fail=1; }
  grep -q '#include "Config.h"' "$ino" || {
    echo "   FAIL  $name.ino does not include Config.h, so editing it does nothing"; fail=1; }

  # ---- THE MANIFEST IS EXPLICIT, not a glob. A working folder collects
  #      scratch — sequencesold.h sat beside the sketch for four days —
  #      and a glob ships it to strangers. Name what goes in; anything else
  #      stays behind.
  MANIFEST="$name.ino Config.h sequences.h README.md $packcopies"
  for f in $MANIFEST; do
    [ -f "$dir/$f" ] || { echo "   FAIL  $f is missing from $dir"; fail=1; }
  done

  # ---- quoted includes, across everything that SHIPS. A sketch folder is
  #      NOT on the include path for an <angled> include, so <MaestroPCA.h>
  #      fails with the file sitting right beside the .ino. This has cost a
  #      bench session already.
  for f in $MANIFEST; do
    [ -f "$dir/$f" ] || continue
    if grep -q '#include *<\(MaestroPCA\|MaestroLink\|MpcaScan\|MpcaEsp32\)\.h>' "$dir/$f"; then
      echo "   FAIL  $name/$f includes ours with <angles>"; fail=1
    fi
  done

  [ $fail -eq 0 ] || continue

  # ---- zip the folder itself, so unzipping makes Documents\Arduino\<name>\
  #      and the .ino is already in a folder of its own name, which is what
  #      the Arduino IDE insists on.
  rm -rf "$OUT/$name"
  mkdir -p "$OUT/$name"
  for f in $MANIFEST; do cp "$dir/$f" "$OUT/$name/$f"; done
  ( cd "$OUT" && zip -rq "$name.zip" "$name" )
  rm -rf "$OUT/$name"
  echo "   ok    $OUT/$name.zip  ($(unzip -l "$OUT/$name.zip" | tail -1 | awk '{print $2}') files)"
done

if [ $fail -ne 0 ]; then
  echo
  echo "  a pack would have shipped broken — nothing written"
  exit 1
fi

echo
echo "  packs built:"
ls -1sh "$OUT"/*.zip
