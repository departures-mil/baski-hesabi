#!/usr/bin/env node
/* ESKİ KANAL KÖPRÜSÜ (kabuk 1.x taşınabilir exe'ler; v1.13 ve öncesi).
   Eski arayüz her açılışta depodaki surum-ozet.json / surum.json'u (raw.githubusercontent.com, main) okur ve
   "bütün dosyalar JSON içinde" paketini eski kabuğa yazdırır (yalnız arayüz değişir, exe değişmez; imza/SHA yok).
   Bu betik yeni arayüzü o biçimde yazar: eski kabukta açılınca "Yeni kurulum gerekli" penceresi kurulum programını
   (win-setup) indirtir; yeni kurulum eski klasördeki kayıtları ilk açılışta kendisi taşır.
   Yalnız metin dosyaları girer (yazı tipleri eski kabukta yoksa sistem yazı tipi kullanılır).
   Sürüm package.json'dan; eski karşılaştırma ("1.14.0" > "1.13") yeni sürümü daha yeni görür.
   Release yayımlandıktan SONRA çalıştırın (kurulum bağlantısı yayında olmalı):
     node araclar/eski-kanal.js            → surum.json + surum-ozet.json (depo kökü) → git commit + push (main)
     node araclar/eski-kanal.js --zorla    → release denetimini atla */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const v = require('../package.json').version;
const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'release-notes.json'), 'utf8'));

const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);
function collect(dir, acc) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = path.relative(APP, full).split(path.sep).join('/');
    if (fs.statSync(full).isDirectory()) { collect(full, acc); continue; }
    if (!TEXT.has(path.extname(name).toLowerCase())) continue;
    acc[rel] = fs.readFileSync(full, 'utf8');
  }
  return acc;
}

function build(publishedAt) {
  const files = collect(APP, {});
  files['surum.json'] = JSON.stringify({ app: 'baski-hesabi', version: v }) + '\n';
  if (!/window\.APP_VERSION = "/.test(files['js/ui.js'] || '')) throw new Error('ui.js APP_VERSION yok');
  const manifest = { version: v, notes: 'v' + v + ': ' + notes.tr, publishedAt, files };
  const json = JSON.stringify(manifest);
  const ozet = JSON.stringify({ version: v, notes: manifest.notes, publishedAt, size: Buffer.byteLength(json) });
  return { json, ozet, files };
}
module.exports = { build };

if (require.main === module) (async () => {
  if (!process.argv.includes('--zorla')) {
    const url = `https://github.com/departures-mil/baski-hesabi/releases/download/v${v}/BaskiHesabi-Setup-${v}.exe`;
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual' }).catch((e) => ({ status: 0, e }));
    if (!(r.status === 302 || r.status === 200)) { console.error('Kurulum yayında değil (' + r.status + '): ' + url + '\nÖnce release yayımlanmalı.'); process.exit(1); }
  }
  const { json, ozet, files } = build(new Date().toISOString());
  fs.writeFileSync(path.join(ROOT, 'surum.json'), json);
  fs.writeFileSync(path.join(ROOT, 'surum-ozet.json'), ozet);
  console.log(`köprü: surum.json v${v}, ${Object.keys(files).length} dosya, ${(json.length / 1024).toFixed(0)} KB`);
  console.log(`Şimdi: git add surum.json surum-ozet.json && git commit -m "Eski kanal köprüsü v${v}" && git push origin main`);
})();
