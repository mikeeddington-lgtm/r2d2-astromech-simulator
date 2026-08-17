#!/bin/bash
# Runs every suite against the distributable, then against dev.html, so a
# module that only works in one of the two builds cannot slip through.
#
# PCA Studio's smoke test runs LAST and takes no target: it has its own
# build (pca-studio/PCA-Studio.html) and its own manifest, and leaving it
# out of this script is exactly how its hardware wizard stayed broken for
# four versions (v1.43.0 — escGuard was in core/dialog.js, which Studio
# does not load). A check nobody runs is not a check.
set -e
cd "$(dirname "$0")"
SUITES="tests/firmware.test.js tests/profiles.test.js tests/maestro.test.js tests/maestro-import.test.js tests/mstr-share.test.js tests/cad.test.js tests/look-boards.test.js tests/wiring.test.js tests/select.test.js tests/music.test.js tests/track-ui.test.js tests/setup.test.js tests/sounds.test.js tests/build-config.test.js tests/rc.test.js tests/sequencer.test.js tests/sequencer-ui.test.js tests/puppet.test.js tests/cues.test.js tests/sketch.test.js tests/pcaseq.test.js tests/anzellan.test.js tests/mouse.test.js tests/chrome.test.js tests/keyboard.test.js tests/workspaces.test.js tests/kiosk.test.js tests/hw.test.js tests/builder.test.js"
TARGETS=("$@"); [ ${#TARGETS[@]} -eq 0 ] && TARGETS=(R2D2-Simulator.html dev.html)
for target in "${TARGETS[@]}"; do
  echo "──────── $target"
  for s in $SUITES; do
    printf '  %-12s ' "$s"
    R2_TARGET="$target" node "$s" 2>&1 | grep -E '^[0-9]+ passed|FAIL' || echo '(no summary)'
  done
done
echo "──────── pca-studio/PCA-Studio.html"
printf '  %-12s ' "pca-studio/smoke.test.js"
node pca-studio/smoke.test.js 2>&1 | grep -E '^[0-9]+ passed|FAIL' || echo '(no summary)'
