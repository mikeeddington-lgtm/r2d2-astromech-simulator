#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   EVERY PACK THE BUILDER MAKES MUST BE ATTACHED TO THE RELEASE

   Found 2026-08-23 by review: arduino/packs/make-packs.sh has built three
   sketch packs since v1.68.0, README.md links all three, and
   .github/workflows/release.yml attached two. So the prominent download for
   the ESP32 route pointed at a file no release had ever produced — and
   everything else was green, because the pack COMPILED perfectly in CI. It
   was built, tested, and then dropped on the floor.

   That is not a bug you fix once. It is the shape of the mistake that
   happens every time a fourth pack is added, so this is a guard rather than
   a patch: the pack builder's own PACKS list is the source of truth, and the
   workflow has to carry every name in it — in the `files:` block, so the
   asset exists, AND in the release `body:`, so somebody is told it exists.

   Runs from ./test.sh, not only in CI, because a guard you only see after
   pushing a tag is a guard that tells you too late.
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');
const MAKER = path.join(ROOT, 'arduino', 'packs', 'make-packs.sh');
const FLOW  = path.join(ROOT, '.github', 'workflows', 'release.yml');

function die(msg){ console.error('check-packs: ' + msg); process.exit(1); }

for(const f of [MAKER, FLOW]) if(!fs.existsSync(f)) die('cannot find ' + path.relative(ROOT, f));

const maker = fs.readFileSync(MAKER, 'utf8');
const flow  = fs.readFileSync(FLOW,  'utf8');

/* PACKS="name:dir:extras\n name:dir:extras ..." — one entry per line, the
   name is everything before the first colon. Parsed rather than duplicated,
   which is the entire point: a list written down twice is a list that drifts. */
const packsBlockMatch = maker.match(/\nPACKS="([\s\S]*?)"/);
if(!packsBlockMatch) die('could not find the PACKS="..." block in make-packs.sh — has it been renamed?');

const packs = packsBlockMatch[1].split('\n').map(l=>l.trim()).filter(Boolean).map(l=>l.split(':')[0]);
if(!packs.length) die('the PACKS block parsed to zero packs — the format has changed');

/* the files: block of the release step, so a name mentioned only in prose
   does not count as attached */
const filesBlock = (flow.match(/\n\s*files:\s*\|\s*\n([\s\S]*?)\n\s*(?:body|generate_release_notes|tag_name|name):/) || [])[1] || '';
const bodyBlock  = (flow.match(/\n\s*body:\s*\|\s*\n([\s\S]*?)\n\s*generate_release_notes:/) || [])[1] || '';
if(!filesBlock) die('could not find the files: | block in release.yml');
if(!bodyBlock)  die('could not find the body: | block in release.yml');

/* the other direction: an attachment for a pack the builder no longer makes
   would fail the release itself, late and confusingly */
const attached = (filesBlock.match(/arduino\/packs\/dist\/([A-Za-z0-9_.-]+)\.zip/g) || [])
  .map(s => s.replace(/^.*\//, '').replace(/\.zip$/, ''));
/* Release copy names downloadable files in backticks. Parse those exact
   filenames rather than searching substrings: a future `Droid` pack must not
   be falsely satisfied by the mention of `Esp32Droid.zip`. */
const announced = Array.from(bodyBlock.matchAll(/`([A-Za-z0-9_.-]+)\.zip`/g), m=>m[1]);
const attachedSet = new Set(attached);
const announcedSet = new Set(announced);
const missingFile = packs.filter(p => !attachedSet.has(p));
const missingBody = packs.filter(p => !announcedSet.has(p));
const orphaned = attached.filter(a => packs.indexOf(a) < 0);

let bad = 0;
if(missingFile.length){
  bad = 1;
  console.error('check-packs: BUILT BUT NOT ATTACHED — ' + missingFile.join(', '));
  console.error('  make-packs.sh builds ' + packs.length + ' packs; release.yml attaches ' + attached.length + '.');
  console.error('  Add to the files: block:  arduino/packs/dist/<name>.zip');
}
if(missingBody.length){
  bad = 1;
  console.error('check-packs: ATTACHED BUT UNANNOUNCED — ' + missingBody.join(', '));
  console.error('  The release body does not name ' + (missingBody.length === 1 ? 'it' : 'them') + ', so nobody is told the download exists.');
}
if(orphaned.length){
  bad = 1;
  console.error('check-packs: ATTACHED BUT NOT BUILT — ' + orphaned.join(', '));
  console.error('  The release would fail looking for a file make-packs.sh no longer produces.');
}
if(bad) process.exit(1);

console.log('  packs        ' + packs.length + ' built, ' + packs.length + ' attached and announced — ' + packs.join(', '));
