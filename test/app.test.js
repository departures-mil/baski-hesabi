// Duman testleri (Node, bağımlılıksız): sürüm tutarlılığı, çekirdek kopyası, paket, kurtarma birleştirme kuralı, çeviriler.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const VER = require('../package.json').version;

test('sürüm: package.json = ui.js = main.go = kabuk.js NEWS; semver', () => {
  assert.match(VER, /^\d+\.\d+\.\d+$/);
  assert.match(read('app/js/ui.js'), new RegExp('window\\.APP_VERSION = "' + VER.replace(/\./g, '\\.') + '"'));
  assert.match(read('shell-exe/main.go'), new RegExp('var appVersion = "' + VER.replace(/\./g, '\\.') + '"'));
  assert.ok(read('app/js/kabuk.js').includes("'" + VER + "': {"), 'NEWS kaydı');
  const n = JSON.parse(read('release-notes.json'));
  for (const l of ['tr', 'en', 'ar']) assert.ok(n[l] && n[l].length > 20, 'release-notes ' + l);
});

test('çekirdek kopyası: VERSION ebec004+, dosyalar yerinde, ayrı agent kopyası yok', () => {
  assert.match(read('cekirdek/VERSION'), /^ortak-cekirdek [0-9a-f]{40}\n/);
  for (const f of ['app/cekirdek/fc-core.js', 'app/cekirdek/css/tokens.css', 'app/cekirdek/css/core.css', 'app/cekirdek/fonts/inter-latin-400-normal.woff2', 'app/cekirdek/fonts/noto-sans-arabic-arabic-400-normal.woff2', 'cekirdek/fcdelta.js'])
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const html = read('app/index.html');
  assert.ok(!/fc-agent\.js|agent-baslat|admin-iletisim|kullanim\.js|duyuru\.js|indirme-ilerleme/.test(html), 'eski modüller index.html\'de');
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/js/fc-agent.js')));
  assert.ok(html.indexOf('cekirdek/fc-core.js') < html.indexOf('js/ui.js'));
  assert.ok(html.indexOf('/__shell/host.js') < html.indexOf('cekirdek/fc-core.js'), 'fcHost çekirdekten önce');
  assert.ok(!/Noto Naskh/.test(read('app/css/app.css')), 'yazı tipi çekirdekten');
});

test('paket: belirleyici zip, bütün app dosyaları + surum.json', () => {
  const paket = require('../araclar/paket.js');
  const a = paket.build(), b = paket.build();
  assert.strictEqual(crypto.createHash('sha256').update(a.zip).digest('hex'), crypto.createHash('sha256').update(b.zip).digest('hex'));
  const files = paket.list(path.join(ROOT, 'app'));
  for (const f of files) assert.ok(a.files.includes(f), f);
  assert.ok(a.files.includes('surum.json'));
  assert.ok(a.files.includes('index.html'));
  assert.strictEqual(a.version, VER);
  // yerel başlık imzası ve UTF-8 bayrağı
  assert.strictEqual(a.zip.readUInt32LE(0), 0x04034b50);
});

function loadKurtarma() { return require('../app/js/kurtarma.js'); }

test('kurtarma: örnek kategoriler çoğalmaz, kimlik eşlenir, eksikler eklenir', () => {
  const K = loadKurtarma();
  const t0 = '2026-01-01T00:00:00.000Z', t1 = '2026-02-01T00:00:00.000Z';
  const local = {
    filaments: [{ id: 'L1', name: 'PLA', price: 20, color: '#45C8BE', updatedAt: t0 }],
    printers: [{ id: 'P1', name: 'Ender 3', watt: 150, price: 400, life: 5000, updatedAt: t0 }],
    records: [], meta: []
  };
  const inc = {
    filaments: [{ id: 'X1', name: 'PLA', price: 20, color: '#45C8BE', updatedAt: t1 }, { id: 'X2', name: 'PETG özel', price: 30, color: '#000000', updatedAt: t1 }],
    printers: [{ id: 'XP', name: 'Ender 3', watt: 150, price: 400, life: 5000, updatedAt: t1 }],
    records: [{ id: 'R1', partName: 'Kapak', filamentId: 'X1', printerId: 'XP', updatedAt: t1 }],
    meta: [{ id: 'settings', lang: 'ar', defFilamentId: 'X1', fb: { projectId: 'p' }, updatedAt: t1 }, { id: 'pendingUpdate', files: {} }]
  };
  const p = K.plan(local, inc);
  assert.deepStrictEqual(p.idMap, { X1: 'L1', XP: 'P1' });
  const ids = p.puts.map((x) => x.store + ':' + x.doc.id).sort();
  assert.deepStrictEqual(ids, ['filaments:X2', 'meta:settings', 'records:R1']);
  const rec = p.puts.find((x) => x.doc.id === 'R1').doc;
  assert.strictEqual(rec.filamentId, 'L1'); assert.strictEqual(rec.printerId, 'P1');
  assert.strictEqual(p.puts.find((x) => x.doc.id === 'settings').doc.defFilamentId, 'L1');
  assert.strictEqual(p.conflicts.length, 0);
});

test('kurtarma: çakışmada yeni olan kalır, eskisi yedeğe; değişmiş örnek kategori gerçek veridir', () => {
  const K = loadKurtarma();
  const local = { records: [{ id: 'R1', partName: 'Eski ad', updatedAt: '2026-01-01T00:00:00Z' }, { id: 'R2', partName: 'Yeni', updatedAt: '2026-03-01T00:00:00Z' }], filaments: [] };
  const inc = { records: [{ id: 'R1', partName: 'Yeni ad', updatedAt: '2026-02-01T00:00:00Z' }, { id: 'R2', partName: 'Daha eski', updatedAt: '2026-01-01T00:00:00Z' }], filaments: [{ id: 'F', name: 'PLA', price: 25, color: '#45C8BE', updatedAt: 'x' }] };
  const p = K.plan(local, inc);
  assert.strictEqual(p.conflicts.length, 2);
  const c1 = p.conflicts.find((c) => c.id === 'R1'); assert.strictEqual(c1.kept.partName, 'Yeni ad'); assert.strictEqual(c1.lost.partName, 'Eski ad');
  const c2 = p.conflicts.find((c) => c.id === 'R2'); assert.strictEqual(c2.kept.partName, 'Yeni'); assert.strictEqual(c2.lost.partName, 'Daha eski');
  assert.ok(p.puts.some((x) => x.doc.id === 'R1' && x.doc.partName === 'Yeni ad'));
  assert.ok(!p.puts.some((x) => x.doc.id === 'R2'));
  assert.ok(p.puts.some((x) => x.doc.id === 'F'), 'fiyatı değişmiş PLA eklenir');
});

test('kurtarma: ayarlar — yeni olan esas, boş alanlar eskiden dolar', () => {
  const K = loadKurtarma();
  const local = { meta: [{ id: 'settings', lang: 'tr', fb: null, rateTry: 50, updatedAt: '2026-03-01T00:00:00Z' }] };
  const inc = { meta: [{ id: 'settings', lang: 'ar', fb: { projectId: 'benim' }, rateTry: 40, updatedAt: '2026-01-01T00:00:00Z' }] };
  const p = K.plan(local, inc);
  const s = p.puts[0].doc;
  assert.strictEqual(s.lang, 'tr'); assert.strictEqual(s.rateTry, 50); assert.deepStrictEqual(s.fb, { projectId: 'benim' });
});

test('çeviriler: tr/en/ar aynı anahtarlar, Arapça RTL', () => {
  const ctx = { window: {}, document: {} }; vm.createContext(ctx);
  vm.runInContext(read('app/js/i18n.js') + ';this.I=I18N', ctx);
  const I = ctx.I;
  for (const l of ['en', 'ar']) assert.deepStrictEqual(Object.keys(I.tr).filter((k) => !(k in I[l])), [], l + ' eksik');
  assert.strictEqual(I.ar._dir, 'rtl');
});

test('eski güncelleyici kapalı: surum.json yolu ve gömülü dosya JSON güncellemesi kaldırıldı', () => {
  const sync = read('app/js/sync.js');
  assert.ok(!/checkUpdate|surum\.json|raw\.githubusercontent/.test(sync));
  assert.match(read('shell-exe/main.go'), /ESKI_GUNCELLEME_KAPALI/);
  assert.match(read('app/js/kabuk.js'), /setupChannel: 'win-setup'/);
});
