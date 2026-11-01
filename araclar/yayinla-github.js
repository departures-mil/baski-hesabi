#!/usr/bin/env node
/**
 * Güncelleme yayınlayıcı (GitHub kanalı).
 * app/ klasörünü surum.json olarak paketler; dosya depoya işlenince
 * uygulamalar açılışta görür.
 *
 *   node yayinla-github.js --version 1.3 --notes "Neler değişti" --out ../kanal/surum.json
 */
const fs = require("fs");
const path = require("path");

const arg = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const appDir = path.resolve(arg("app", path.join(__dirname, "..", "app")));
const version = arg("version");
const notes = arg("notes", "");
const out = path.resolve(arg("out", path.join(__dirname, "..", "kanal", "surum.json")));

if (!version) {
  console.error('Kullanim: node yayinla-github.js --version 1.3 [--notes "..."] [--app ../app] [--out ../kanal/surum.json]');
  process.exit(1);
}

const TEXT = new Set([".html", ".js", ".css", ".json", ".svg"]);
function collect(dir, base, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (fs.statSync(full).isDirectory()) { collect(full, base, acc); continue; }
    if (!TEXT.has(path.extname(name).toLowerCase())) { console.warn("  atlandi:", rel); continue; }
    acc[rel] = fs.readFileSync(full, "utf8");
  }
  return acc;
}

const files = collect(appDir, appDir, {});
/* sürüm numarasını paketin içine de yaz */
if (files["js/ui.js"]) {
  files["js/ui.js"] = files["js/ui.js"].replace(
    /window\.APP_VERSION\s*=\s*"[^"]*"/, `window.APP_VERSION = "${version}"`);
}

const manifest = { version, notes, publishedAt: new Date().toISOString(), files };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(manifest));

const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`surum.json yazildi: v${version}, ${Object.keys(files).length} dosya, ${kb} KB`);
console.log(`Simdi depoya isle:  git add surum.json && git commit -m "v${version}" && git push`);
