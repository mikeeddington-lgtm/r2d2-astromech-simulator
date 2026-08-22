#!/bin/bash
# Runs every suite against the distributable, then against dev.html, so a
# module that only works in one of the two builds cannot slip through.
#
# PCA Studio's smoke test runs LAST and takes no target: it has its own
# build (pca-studio/PCA-Studio.html) and its own manifest, and leaving it
# out of this script is exactly how its hardware wizard stayed broken for
# four versions (v1.43.0 — escGuard was in core/dialog.js, which Studio
# does not load). A check nobody runs is not a check.
#
# ── Why every suite's exit status is captured by hand (v1.69.0) ──
#
# This script could not fail. Every suite ran as
#
#     node "$s" 2>&1 | grep -E '^[0-9]+ passed|FAIL' || echo '(no summary)'
#
# and a pipeline reports GREP's status, not node's — so the 37 suites'
# process.exit(fail ? 1 : 0) was thrown away at the pipe. The trailing
# `|| echo` then made the whole compound succeed unconditionally, so `set -e`
# had nothing to fire on, and that same construct was the last statement in
# the file, which is what the script exited with. `./test.sh` returned 0 with
# FAIL lines scrolling past it. So did `npm test`, the pre-push hook and CI:
# the safety net reported success for every commit it was ever asked about.
#
# Note that `set -o pipefail` alone would NOT have fixed this — the `||` still
# swallows the status. The fix has to keep node's status before anything else
# touches it:
#
#     out=$(node "$s" 2>&1) || rc=$?     # $? captured, set -e held off
#     echo "$out" | grep ...             # display only; status discarded
#
# `bad` accumulates across every suite and every target and becomes the exit
# status, and the run ends with a plain-text PASS/FAIL verdict so a human
# reading the tail does not have to count. Suites are NOT aborted on the first
# failure — one broken module usually breaks several suites, and the shape of
# the wreckage is the diagnosis.
#
# A suite that dies before printing anything (bad require, syntax error,
# browser that will not launch) now fails too, on its non-zero exit status,
# and prints (no output) rather than the (no summary) that a green-but-oddly-
# worded run gets. Those two used to be the same line.
#
# ── Why Studio's build is verified first (v1.69.0) ──
#
# pca-studio/PCA-Studio.html is generated but tracked, and the note has always
# said it is tracked "so ./test.sh fails loudly on a stale one" — which it
# never did. pca-studio/smoke.test.js asserts against the checked-in artefact,
# so a stale Studio passes its own smoke test by definition. It sat stale for
# three releases. tools/check-studio.js runs the real generator with its write
# intercepted and compares in memory; it never touches the tracked file,
# because a check that rebuilds what it is inspecting cannot fail twice.
set -e
cd "$(dirname "$0")"
SUITES="tests/firmware.test.js tests/profiles.test.js tests/maestro.test.js tests/maestro-import.test.js tests/maestro-link.test.js tests/mstr-share.test.js tests/roundtrip.test.js tests/blocks-trace.test.js tests/setup-bench.test.js tests/cad.test.js tests/look-boards.test.js tests/wiring.test.js tests/select.test.js tests/music.test.js tests/track-ui.test.js tests/setup.test.js tests/sounds.test.js tests/build-config.test.js tests/rc.test.js tests/sequencer.test.js tests/sequencer-ui.test.js tests/puppet.test.js tests/cues.test.js tests/sketch.test.js tests/pcaseq.test.js tests/anzellan.test.js tests/mouse.test.js tests/chrome.test.js tests/keyboard.test.js tests/workspaces.test.js tests/kiosk.test.js tests/hw.test.js tests/builder.test.js tests/servos.test.js tests/ramp-step.test.js tests/export-guards.test.js tests/lights.test.js"
TARGETS=("$@"); [ ${#TARGETS[@]} -eq 0 ] && TARGETS=(R2D2-Simulator.html dev.html)
bad=0; ran=0; failed=0; failures=""

note_fail() { bad=1; failed=$((failed + 1)); failures="$failures
  $1"; }

echo "──────── generated files"
printf '  %-24s ' "build is current"
rc=0; out=$(node tools/check-studio.js 2>&1) || rc=$?
if [ $rc -eq 0 ]; then
  echo "PCA-Studio.html up to date"
else
  echo ""
  echo "$out" | sed 's/^/  /'
  note_fail "pca-studio/PCA-Studio.html is stale — run ./build.sh"
fi

# run_suite <label-for-the-list> <command...> — runs one suite, shows its
# summary or FAIL lines, and records a failure on any non-zero status. Node's
# status is taken before anything else runs, because a pipe would replace it.
run_suite() {
  local tag="$1"; shift
  local rc=0 out=""
  ran=$((ran + 1))
  out=$("$@" 2>&1) || rc=$?
  if [ -z "$out" ]; then
    echo '(no output)'
    [ $rc -eq 0 ] || echo "  ↳ exited $rc without printing anything"
  elif echo "$out" | grep -E '^[0-9]+ passed|FAIL'; then
    :
  else
    echo '(no summary)'
    # Died before it could report — a crashed suite must not read like a quiet
    # green one, so show what it did say: the thrown error if it named one
    # (node's stack starts with loader boilerplate that says nothing), else
    # the first few lines.
    [ $rc -eq 0 ] || { echo "$out" | grep -m3 -E '[A-Za-z]*Error\b|Cannot find' \
      || echo "$out" | grep -v '^[[:space:]]*$' | head -3; } | sed 's/^/  ↳ /'
  fi
  [ $rc -eq 0 ] || note_fail "$tag exited $rc"
}

for target in "${TARGETS[@]}"; do
  echo "──────── $target"
  for s in $SUITES; do
    printf '  %-12s ' "$s"
    run_suite "$s [$target]" env R2_TARGET="$target" node "$s"
  done
done

echo "──────── pca-studio/PCA-Studio.html"
printf '  %-12s ' "pca-studio/smoke.test.js"
run_suite "pca-studio/smoke.test.js" node pca-studio/smoke.test.js

echo "────────"
if [ $bad -eq 0 ]; then
  echo "PASS — $ran suite runs, all green, and the tracked PCA-Studio.html is current."
else
  echo "FAIL — $failed problem(s) across $ran suite runs:$failures"
  echo ""
  echo "Nothing here is green. Fix the above, then run ./test.sh again."
fi
exit $bad
