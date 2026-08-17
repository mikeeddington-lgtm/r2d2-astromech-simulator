/* copy captures into remotion/public and write src/assets.js with burst counts */
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, 'remotion', 'public');
fs.mkdirSync(pub, { recursive: true });

const counts = {};
for (const e of fs.readdirSync(path.join(__dirname, 'captures'), { withFileTypes: true })) {
  if (e.name === 'cast_test' || e.name.startsWith('probe')) continue;
  const src = path.join(__dirname, 'captures', e.name);
  if (e.isDirectory()) {
    const dst = path.join(pub, e.name);
    fs.mkdirSync(dst, { recursive: true });
    const files = fs.readdirSync(src).filter(f => f.endsWith('.jpg')).sort();
    files.forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
    counts[e.name] = files.length;
  } else if (e.name.endsWith('.jpg')) {
    fs.copyFileSync(src, path.join(pub, e.name));
  }
}
fs.writeFileSync(path.join(__dirname, 'remotion', 'src', 'assets.js'),
  'export const COUNTS = ' + JSON.stringify(counts, null, 2) + ';\n');
console.log('assets:', JSON.stringify(counts));
