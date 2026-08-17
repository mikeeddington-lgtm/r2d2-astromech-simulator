#!/usr/bin/env node
/* Generates both outputs from src/manifest.json.
 *
 *   dev.html   — references every module by path. Edit a file, hit refresh.
 *                Works straight off disk; no server, no rebuild.
 *   dist       — R2D2-Simulator.html, one self-contained file with three.js,
 *                the CAD payload and every module inlined. This is the thing
 *                you copy to another machine or hand to someone else.
 *
 * Each module becomes its OWN <script> tag in both builds, which is what keeps
 * their semantics identical: top-level const/let live in the shared global
 * lexical scope either way, and a syntax error in one file cannot swallow the
 * next one.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');
const man  = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

const read = p => fs.readFileSync(path.join(SRC, p), 'utf8');
/* Inline modules must not contain a literal </script>, or the HTML parser
   ends the block early. Escaping it is right — but the escape used to be a
   fixed lowercase string, which silently rewrote any JS literal spelling it
   with different case. mstrBytes() compares against Pololu's "</Script>"
   and quietly stopped matching in the distributable build only. Keep the
   original casing. */
const esc  = s => s.replace(/<\/script>/gi, m => '<\\/' + m.slice(2));

const missing = [...man.css, ...man.js, ...man.vendor, man.body]
  .filter(p => !fs.existsSync(path.join(SRC, p)));
if (missing.length) {
  console.error('manifest lists files that do not exist:\n  ' + missing.join('\n  '));
  process.exit(1);
}
const listed = new Set([...man.css, ...man.js, ...man.vendor, man.body]);
const onDisk = [];
(function walk(dir){
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(js|css|html)$/.test(e.name)) {
      onDisk.push(path.relative(SRC, full).split(path.sep).join('/'));
    }
  }
})(SRC);
/* A module can sit in src/ looking perfectly healthy and never run, because
   the manifest is the ONLY thing that loads it. This was a warning until
   2026-08-08, and it sat unread while four modules the rest of the source
   depended on were missing from the manifest — the app half-worked and four
   test suites crashed. A warning nobody reads is not a check. */
const orphans = onDisk.filter(p => !listed.has(p));
if (orphans.length) {
  console.error('BUILD FAILED — these files are in src/ but not in src/manifest.json,\n' +
    'so nothing loads them:\n  ' + orphans.join('\n  ') +
    '\n\nAdd each one to the "js" or "css" list in src/manifest.json (order matters —\n' +
    'a module may only use what an earlier one defined), or delete it.');
  process.exit(1);
}

/* ============================================ the board photo drop folder
 * (v1.43.0) Mike: "LEts add imaages of the COntrol borads ARdiunos / syren
 * 10 / Flipsky ESC's / Hub motors PCA's DY-SV5W ect - get stocl images and
 * place them on the selction boxes ... these boxes should be the board
 * images with a description underneith".
 *
 * Photos cannot live in the source tree as <img src> paths: the whole point
 * of R2D2-Simulator.html is that it is ONE file you can copy to the workshop
 * laptop, and a relative image path breaks the moment it travels. So every
 * file dropped in src/art/boards/ is read here and inlined as a data URL,
 * into BOTH builds, exactly the way the Pololu board photos in
 * js/app/board-img.js already are.
 *
 * The file NAME is the whole API — no manifest, no registration:
 *
 *     src/art/boards/<option-id>.jpg          e.g. syren10.jpg
 *     src/art/boards/<step>-<option-id>.jpg   e.g. bodyDrive-flipsky.jpg
 *
 * The second form only matters where one id appears under two questions
 * (mod2026 is an answer to the dome, the body AND the firmware). Drop a
 * file in, run ./build.sh, and that card has a photo; delete it and the
 * card goes back to the drawn one. Nothing else to edit.
 *
 * .svg is inlined as text/plain-ish data URL too, so hand-drawn art can be
 * swapped in the same way.
 */
const ART_DIR = path.join(SRC, 'art', 'boards');
const ART_MIME = {'.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
                  '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml'};
function boardPhotos(){
  const out = {};
  if (!fs.existsSync(ART_DIR)) return out;
  let bytes = 0;
  for (const name of fs.readdirSync(ART_DIR).sort()) {
    const ext = path.extname(name).toLowerCase();
    const mime = ART_MIME[ext];
    if (!mime) continue;                     /* README.md and friends */
    const buf = fs.readFileSync(path.join(ART_DIR, name));
    out[path.basename(name, ext)] = 'data:' + mime + ';base64,' + buf.toString('base64');
    bytes += buf.length;
  }
  const n = Object.keys(out).length;
  if (n) console.log('board photos      ' + n + ' inlined  (' + (bytes/1024).toFixed(0) + ' KB)');
  return out;
}
const BOARD_PHOTO_JS = 'const BOARD_PHOTOS = ' + JSON.stringify(boardPhotos()) + ';\n';

const head = (extra) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${man.title}</title>
${extra}
</head>
`;

/* ----------------------------------------------------------------- dev */
{
  const css = man.css.map(p => `<link rel="stylesheet" href="src/${p}">`).join('\n');
  const js  = '<script>/* generated from src/art/boards/ by tools/build.js */\n'
            + BOARD_PHOTO_JS + '</script>\n'
            + [...man.vendor, ...man.js].map(p => `<script src="src/${p}"></script>`).join('\n');
  const out = head(css)
    + read(man.body).replace(/\s*$/, '\n')
    + js + '\n</body>\n</html>\n';
  fs.writeFileSync(path.join(ROOT, 'dev.html'), out);
  console.log('dev.html          ' + (out.length / 1024).toFixed(0) + ' KB  (' +
    (man.css.length + man.vendor.length + man.js.length) + ' files referenced)');
}

/* ---------------------------------------------------------------- dist */
{
  const css = '<style>\n' + man.css.map(read).join('\n') + '\n</style>';
  const js  = [
    '<script>/* generated from src/art/boards/ by tools/build.js */\n' + BOARD_PHOTO_JS + '</script>',
    ...man.vendor.map(p => '<script>/*! ' + path.basename(p) +
      ' — bundled so the sim runs offline */\n' + read(p) + '\n</script>'),
    ...man.js.map(p => '<script>/* src/' + p + ' */\n' + esc(read(p)) + '</script>')
  ].join('\n');
  const out = head(css)
    + read(man.body).replace(/\s*$/, '\n')
    + js + '\n</body>\n</html>\n';
  fs.writeFileSync(path.join(ROOT, 'R2D2-Simulator.html'), out);
  console.log('R2D2-Simulator.html ' + (out.length / 1048576).toFixed(2) + ' MB  (self-contained)');
}
