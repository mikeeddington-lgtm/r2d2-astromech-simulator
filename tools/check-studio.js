#!/usr/bin/env node
/* Fails if the tracked pca-studio/PCA-Studio.html is not what the current
 * sources would generate — i.e. if somebody edited a module and did not run
 * ./build.sh.
 *
 * PCA-Studio.html is a GENERATED file that is nonetheless tracked, on
 * purpose: it is the one file you hand to someone with no toolchain, so it
 * has to exist in the tree. The standing note has always said it is tracked
 * "so ./test.sh fails loudly on a stale one" — except that nothing ever
 * checked. pca-studio/smoke.test.js loads the checked-in artefact and
 * asserts against it, so a stale Studio passes its own smoke test by
 * definition: the tests agree with the build because they ARE the build.
 * That is how Studio shipped three releases (v1.31.0 through v1.33.0) with
 * a PCA-Studio.html generated before the travel.js rewrite — green suites
 * the whole way, and the only symptom was on a real bench.
 *
 * It is easy to get stale by accident and hard to notice: half of Studio's
 * manifest is shared with the sim (src/js/maestro/*, src/js/core/esc-guard.js,
 * src/css/12-setup-hw.css), so editing a module for the sim, rebuilding with
 * `npm run build`, and never opening Studio leaves it behind. That npm script
 * ran tools/build.js only, while build.sh runs both generators; it now points
 * at ./build.sh so the two cannot diverge.
 *
 * MECHANISM — why this does not just rebuild and diff:
 *
 * tools/build-studio.js takes no output path. It resolves the destination
 * itself and writes pca-studio/PCA-Studio.html, full stop. Rebuilding in
 * place and diffing afterwards is therefore useless: the rebuild overwrites
 * the very artefact under test, so the check would repair the staleness it
 * is meant to report and could never fail twice. (Copy-aside-and-restore has
 * the same disease with worse failure modes: interrupt it and the tree is
 * left holding the wrong file.)
 *
 * So we run the real generator with fs.writeFileSync intercepted for that
 * one path, keep the bytes it produces in memory, and compare. Nothing on
 * disk is touched. Using the generator itself rather than a re-implementation
 * of it is the point — a second copy of the concatenation rules would be
 * exactly the hand-kept duplicate that tools/build-studio.js exists to kill.
 */
const fs = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const TRACKED = path.join(ROOT, 'pca-studio', 'PCA-Studio.html');
const REMEDY  = 'run ./build.sh (or npm run build) and commit the result';

/* Intercept the generator's single write. Anything it writes elsewhere is
   passed through untouched, so this stays a lie only about the file we are
   inspecting. */
const realWriteFileSync = fs.writeFileSync;
let built = null;
fs.writeFileSync = function (file, data, ...rest) {
  let target;
  try { target = path.resolve(String(file)); } catch (e) { target = null; }
  if (target === TRACKED) { built = Buffer.from(data); return; }
  return realWriteFileSync.call(fs, file, data, ...rest);
};

/* build-studio.js reports its own failures (missing files, orphaned modules)
   and calls process.exit(1). That kills us before any finally block runs, so
   say what the non-zero status means on the way out. */
let finished = false;
process.on('exit', code => {
  if (code !== 0 && !finished) {
    console.error('FAIL  PCA-Studio.html — the Studio build itself failed (above); nothing to compare.');
  }
});

const quietLog = console.log;
console.log = () => {};                       /* swallow the builder's size banner */
try {
  require('./build-studio.js');
} finally {
  console.log = quietLog;
  fs.writeFileSync = realWriteFileSync;
}
finished = true;

if (built === null) {
  console.error('FAIL  PCA-Studio.html — tools/build-studio.js wrote nothing to');
  console.error('      ' + path.relative(ROOT, TRACKED) + ', so this check cannot vouch for it.');
  console.error('      The builder\'s output path moved; fix tools/check-studio.js to match.');
  process.exit(1);
}
if (!fs.existsSync(TRACKED)) {
  console.error('FAIL  PCA-Studio.html is missing — ' + REMEDY);
  process.exit(1);
}

const tracked = fs.readFileSync(TRACKED);
if (tracked.equals(built)) {
  console.log('  ' + 'PCA-Studio.html'.padEnd(24) + 'current  (' + (built.length / 1024).toFixed(0) + ' KB)');
  process.exit(0);
}

/* Point at the first difference: "it changed" is not actionable, "it changed
   at line 4127, inside src/js/maestro/pca-gen.js" is. */
let at = 0;
const min = Math.min(tracked.length, built.length);
while (at < min && tracked[at] === built[at]) at++;
const line = tracked.slice(0, at).toString('utf8').split('\n').length;
const marks = built.slice(0, at).toString('utf8').match(/<script>\/\* (.+?) \*\//g);
const where = marks && marks.length ? marks[marks.length - 1].replace(/^<script>\/\* | \*\/$/g, '') : null;

console.error('FAIL  pca-studio/PCA-Studio.html is STALE.');
console.error('      The tracked build does not match what the current sources generate,');
console.error('      so every Studio test below is asserting against yesterday\'s app.');
console.error('      tracked ' + tracked.length + ' bytes, rebuilt ' + built.length + ' bytes;' +
              ' first difference at byte ' + at + ' (line ' + line + ')' +
              (where ? ', in ' + where : '') + '.');
console.error('      REMEDY: ' + REMEDY + '.');
process.exit(1);
