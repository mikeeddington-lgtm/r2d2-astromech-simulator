#!/usr/bin/env node
/* Fails if dev.html or R2D2-Simulator.html is not what the current sources
 * would generate — i.e. if somebody edited a module, the manifest or the
 * markup and did not run ./build.sh before testing.
 *
 * WHY (v1.79.0, review BUILD-01 / deep dive 2026-08-23). tools/check-studio.js
 * has guarded the tracked PCA-Studio.html since v1.70.0, and nothing guarded
 * the two main targets: they are gitignored, so git cannot notice them going
 * stale, and every suite loads whichever bytes happen to be on disk. The
 * 2026-08-23 review found 1.74.1 deliverables beside 1.75.0 sources and ran the
 * suites against them — missing-global crashes that looked like real bugs
 * until the tree was rebuilt. CI is safe (it builds first); a laptop is not.
 *
 * Same mechanism as check-studio.js, for the same reason: run the REAL
 * generator with fs.writeFileSync intercepted for exactly the two output
 * paths, keep what it produces in memory, and compare. Rebuild-and-diff would
 * repair the staleness it is meant to report and could never fail twice.
 *
 * A missing target is reported as such rather than as stale — a fresh clone
 * has neither, and "run ./build.sh" is the answer either way.
 *
 * Run: node tools/check-build.js        (exit 1 on any stale or missing target)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = {
  'dev.html':            path.join(ROOT, 'dev.html'),
  'R2D2-Simulator.html': path.join(ROOT, 'R2D2-Simulator.html')
};
const REMEDY = 'run ./build.sh (or npm run build)';

const realWriteFileSync = fs.writeFileSync;
const built = {};
const PKG = path.join(ROOT, 'package.json');
fs.writeFileSync = function (file, data, ...rest) {
  let target;
  try { target = path.resolve(String(file)); } catch (e) { target = null; }
  for (const name in TARGETS) if (TARGETS[name] === target) { built[name] = Buffer.from(data); return; }
  /* the builder also syncs package.json's version to APP_VERSION (v1.79.0);
     a CHECK must not write anything, so that one is swallowed too — the real
     build will do it */
  if (target === PKG || target === path.join(ROOT, 'package-lock.json')) return;
  return realWriteFileSync.call(fs, file, data, ...rest);
};

let finished = false;
process.on('exit', code => {
  if (code !== 0 && !finished)
    console.error('FAIL  the build itself failed (above); nothing to compare.');
});

const quietLog = console.log;
console.log = () => {};                       /* swallow the builder's size banner */
try {
  require('./build.js');
} finally {
  console.log = quietLog;
  fs.writeFileSync = realWriteFileSync;
}
finished = true;

let bad = 0;
for (const name in TARGETS) {
  const file = TARGETS[name];
  if (!built[name]) {
    console.error('FAIL  ' + name + ' — tools/build.js wrote nothing to ' + path.relative(ROOT, file)
      + '; the builder\'s output path moved, fix tools/check-build.js to match.');
    bad++; continue;
  }
  if (!fs.existsSync(file)) {
    console.error('FAIL  ' + name + ' is missing — ' + REMEDY + '.');
    bad++; continue;
  }
  const onDisk = fs.readFileSync(file);
  if (onDisk.equals(built[name])) {
    console.log('  ' + name.padEnd(24) + 'current  (' + (built[name].length / 1024).toFixed(0) + ' KB)');
    continue;
  }
  /* point at the first difference and, for the dist, the module it is in */
  let at = 0;
  const min = Math.min(onDisk.length, built[name].length);
  while (at < min && onDisk[at] === built[name][at]) at++;
  const line = onDisk.slice(0, at).toString('utf8').split('\n').length;
  const marks = built[name].slice(0, at).toString('utf8').match(/<script>\/\* (src\/.+?) \*\//g);
  const where = marks && marks.length ? marks[marks.length - 1].replace(/^<script>\/\* | \*\/$/g, '') : null;
  console.error('FAIL  ' + name + ' is STALE — every suite below would be asserting against yesterday\'s app.');
  console.error('      on disk ' + onDisk.length + ' bytes, rebuilt ' + built[name].length + ' bytes;'
    + ' first difference at byte ' + at + ' (line ' + line + ')' + (where ? ', in ' + where : '') + '. ' + REMEDY + '.');
  bad++;
}
process.exit(bad ? 1 : 0);
