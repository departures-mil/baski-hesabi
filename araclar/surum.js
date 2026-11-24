#!/usr/bin/env node
/* Sürüm tek kaynaktan: package.json. Yazılan yerler: app/js/ui.js (APP_VERSION), shell-exe/main.go (appVersion varsayılanı;
   CI ayrıca -ldflags ile verir). Notlar: release-notes.json (latest.json) + app/js/kabuk.js NEWS (elle).
     node araclar/surum.js 1.15.0 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('kullanım: node araclar/surum.js X.Y.Z'); process.exit(1); }
function edit(rel, re, rep) {
  const p = path.join(ROOT, rel), s = fs.readFileSync(p, 'utf8'), n = s.replace(re, rep);
  if (n === s && !s.includes(v)) throw new Error('değişmedi: ' + rel);
  fs.writeFileSync(p, n);
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
pkg.version = v;
fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
edit('app/js/ui.js', /window\.APP_VERSION = "[^"]*";/, `window.APP_VERSION = "${v}";`);
edit('shell-exe/main.go', /var appVersion = "[^"]*"/, `var appVersion = "${v}"`);
console.log('sürüm', v, '— release-notes.json ve app/js/kabuk.js NEWS notlarını da yazın.');
