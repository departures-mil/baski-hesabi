// Kabuk (Go) testleri: go vet + go test (FCD1, Node üreticisinin taze vektörleriyle), gerçek kabuk süreci:
// güncelleme uçları (yama / tam / bozuk yama / kurulum kanalı), pencere API'si, köken denetimi, açılışta paket seçimi;
// tarayıcıyla (Playwright varsa): arayüz + çekirdek, eski oturum kayıtlarının kurtarılması, taşınabilir → kurulum taşıması.
// go yoksa atlanır. CI (ubuntu): setup-go + playwright-core chromium.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHELL = path.join(ROOT, 'shell-exe');
const hasGo = spawnSync('go', ['version']).status === 0;
let pw = null;
try { pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'); } catch (e) { }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-test-'));
const BIN = path.join(TMP, 'baski-hesabi-kabuk');
let basePort = 42000 + Math.floor(Math.random() * 2000);
const nextPort = () => ++basePort;

function freePort() { return new Promise((res) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }

async function startShell(o) {
  const port = o.port || nextPort();
  const env = Object.assign({}, process.env, { BASKI_PENCERE_YOK: '1', BASKI_PORT: String(port) }, o.env || {});
  const p = spawn(o.bin || BIN, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.out = () => out; p.port = port; p.url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(p.url + '/__shell/info'); if (r.ok) { p.info = await r.json(); return p; } } catch (e) { }
    if (p.exitCode != null) break;
    await sleep(100);
  }
  p.kill(); throw new Error('kabuk açılmadı: ' + out);
}
const stop = (p) => new Promise((res) => { if (!p || p.exitCode != null) return res(); p.once('exit', res); p.kill(); });

test('go vet + go test (FCD1: Node üreticisinin taze vektörleri)', { skip: !hasGo && 'go yok', timeout: 240000 }, () => {
  execFileSync(process.execPath, [path.join(ROOT, 'araclar', 'paket.js'), path.join(TMP, 'app.zip')], { stdio: 'inherit' });
  const vec = path.join(TMP, 'vektor');
  execFileSync(process.execPath, [path.join(ROOT, 'araclar', 'fcd1-vektor.js'), vec], { stdio: 'inherit' });
  execFileSync('go', ['vet', './...'], { cwd: SHELL, stdio: 'inherit' });
  execFileSync('go', ['test', './...'], { cwd: SHELL, stdio: 'inherit', env: Object.assign({}, process.env, { FCD1_TESTDATA: vec }) });
  execFileSync('go', ['test', './...'], { cwd: SHELL, stdio: 'inherit' });   // depodaki vektörler
  execFileSync('go', ['build', '-o', BIN, '.'], { cwd: SHELL, stdio: 'inherit' });
  const w = spawnSync('go', ['vet', './...'], { cwd: SHELL, env: Object.assign({}, process.env, { GOOS: 'windows', GOARCH: 'amd64' }), encoding: 'utf8' });
  assert.strictEqual(w.status, 0, 'windows derlemesi: ' + w.stderr);
});

/** Paketin bir sonraki sürümünü üretir (index.html'e işaret, surum.json'da yeni sürüm). */
function nextBundle(version, mark) {
  const paket = require('../araclar/paket.js');
  const files = paket.list(path.join(ROOT, 'app'));
  const entries = files.map((n) => {
    let data = fs.readFileSync(path.join(ROOT, 'app', n));
    if (n === 'index.html') data = Buffer.from(String(data).replace('</body>', '<!-- ' + mark + ' --></body>'));
    return { name: n, data };
  });
  entries.push({ name: 'surum.json', data: Buffer.from(JSON.stringify({ app: 'baski-hesabi', version }) + '\n') });
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  return paket.makeZip(entries);
}

test('güncelleme uçları: FCD1 yama, bozuk yama, yanlış SHA, açılışta indirilen paket, kurulum kanalı', { skip: !hasGo && 'go yok', timeout: 120000 }, async () => {
  assert.ok(fs.existsSync(BIN), 'kabuk derlenmedi');
  const fcdelta = require('../cekirdek/fcdelta.js');
  const dir = path.join(TMP, 'g1');
  const env = { BASKI_VERI: path.join(dir, 'veri'), BASKI_CIKTI: path.join(dir, 'cikti'), BASKI_TASIMA_YOK: '1' };
  let p = await startShell({ env });
  try {
    assert.strictEqual(p.info.app, 'baski-hesabi');
    assert.strictEqual(p.info.shell, 2);
    assert.strictEqual(p.info.bundle, require('../package.json').version);
    const cur = fs.readFileSync(path.join(SHELL, 'app.zip'));
    const next = nextBundle('99.0.0', 'YAMA-TESTI');
    const patch = await fcdelta.make(cur, next);
    assert.ok(patch.length < next.length / 4, "yama küçük olmalı: " + patch.length);
    const meta = { version: '99.0.0', channel: 'win-app', targetSha256: sha(next), targetSize: next.length, file: 'BaskiHesabi-99.0.0-win-app.zip', patchSha256: sha(patch) };
    const H = (m) => ({ 'Content-Type': 'application/octet-stream', 'X-Meta': encodeURIComponent(JSON.stringify(m)) });

    // bozuk yama → reddedilir, paket değişmez
    const bad = Buffer.from(patch); bad[bad.length - 8] ^= 0xff;
    let r = await fetch(p.url + '/__shell/guncelle/yama', { method: 'POST', headers: H(Object.assign({}, meta, { patchSha256: '' })), body: bad });
    assert.strictEqual(r.status, 409, await r.text());
    assert.strictEqual((await (await fetch(p.url + '/__shell/info')).json()).bundle, p.info.bundle);
    // yanlış hedef SHA (tam dosya) → reddedilir
    r = await fetch(p.url + '/__shell/guncelle/tam', { method: 'POST', headers: H(Object.assign({}, meta, { targetSha256: sha(Buffer.from('x')) })), body: next });
    assert.strictEqual(r.status, 500); assert.match(await r.text(), /BAD_HASH/);
    // başka siteden istek → yasak
    r = await fetch(p.url + '/__shell/guncelle/yama', { method: 'POST', headers: Object.assign({ Origin: 'https://kotu.example' }, H(meta)), body: patch });
    assert.strictEqual(r.status, 403);
    // doğru yama
    r = await fetch(p.url + '/__shell/guncelle/yama', { method: 'POST', headers: H(meta), body: patch });
    assert.strictEqual(r.status, 200, await r.text());
    assert.strictEqual((await (await fetch(p.url + '/__shell/info')).json()).bundle, '99.0.0');
    assert.match(await (await fetch(p.url + '/')).text(), /YAMA-TESTI/);
    assert.strictEqual(sha(fs.readFileSync(path.join(dir, 'veri', 'paket', 'app.zip'))), sha(next));
    // eski "bütün dosyalar JSON" güncellemesi kapalı
    r = await fetch(p.url + '/__shell/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"version":"9","files":{"index.html":"x"}}' });
    assert.strictEqual(r.status, 410);
    // pencere API (Linux'ta benzetim)
    r = await (await fetch(p.url + '/__shell/pencere/kaydet', { method: 'POST', body: '{"iz":"abc12345"}' })).json();
    assert.strictEqual(r.bulundu, true);
    let s = await (await fetch(p.url + '/__shell/pencere/orta', { method: 'POST', body: '{}' })).json();
    assert.deepStrictEqual([s.fullscreen, s.half], [false, true]);
    s = await (await fetch(p.url + '/__shell/pencere/orta', { method: 'POST', body: '{}' })).json();
    assert.deepStrictEqual([s.fullscreen, s.half], [true, false]);
    s = await (await fetch(p.url + '/__shell/pencere/kucult', { method: 'POST', body: '{}' })).json();
    assert.strictEqual(s.minimized, true);
    s = await (await fetch(p.url + '/__shell/pencere/tam-ac', { method: 'POST', body: '{}' })).json();
    assert.deepStrictEqual([s.fullscreen, s.minimized], [true, false]);
  } finally { await stop(p); }

  // yeniden açılış: indirilen (daha yeni) paket sunulur
  p = await startShell({ env });
  try {
    assert.strictEqual(p.info.bundle, '99.0.0');
    // kurulum kanalı: exe doğrulanır, yazılır, (Linux'ta çalıştırılmaz) ve kabuk kapanır
    const exe = Buffer.from('MZ sahte kurulum');
    const r = await fetch(p.url + '/__shell/guncelle/tam', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Meta': encodeURIComponent(JSON.stringify({ version: '99.0.1', channel: 'win-setup', targetSha256: sha(exe), targetSize: exe.length, file: 'BaskiHesabi-99.0.1-win-setup.exe' })) }, body: exe });
    assert.strictEqual(await r.text(), 'restarting');
    for (let i = 0; i < 40 && p.exitCode == null; i++) await sleep(100);
    assert.notStrictEqual(p.exitCode, null, 'kurulumdan sonra kabuk kapanmalı');
    assert.match(p.out(), /kurulum \(calistirilmadi\):.*BaskiHesabi-99\.0\.1-win-setup\.exe/);
  } finally { await stop(p); }
});

/** Eski kabuk 1 gibi: rastgele portta açılan bir oturumda IndexedDB'ye kayıt yazar (aynı tarayıcı profili). */
async function oldSession(profile, port, records) {
  const srv = http.createServer((q, a) => { a.setHeader('content-type', 'text/html'); a.end('<!doctype html><title>eski</title>'); });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const ctx = await pw.chromium.launchPersistentContext(profile, { headless: true });
  try {
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate((recs) => new Promise((res, rej) => {
      const STORES = ['meta', 'filaments', 'printers', 'customers', 'groups', 'expenses', 'records', 'spools', 'files', 'products', 'sales'];
      const r = indexedDB.open('baski-hesabi', 2);
      r.onupgradeneeded = (e) => STORES.forEach((s) => e.target.result.createObjectStore(s, { keyPath: 'id' }));
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const db = r.result, tx = db.transaction(STORES, 'readwrite'), now = new Date().toISOString();
        const sfx = Math.random().toString(36).slice(2, 7);
        tx.objectStore('filaments').put({ id: 'f' + sfx, name: 'PLA', price: 20, color: '#45C8BE', updatedAt: now });
        tx.objectStore('filaments').put({ id: 'g' + sfx, name: 'PETG', price: 24, color: '#6C9BF0', updatedAt: now });
        tx.objectStore('filaments').put({ id: 'h' + sfx, name: 'ABS', price: 22, color: '#F0876A', updatedAt: now });
        tx.objectStore('printers').put({ id: 'p' + sfx, name: 'Ender 3', watt: 150, price: 400, life: 5000, updatedAt: now });
        recs.forEach((x) => tx.objectStore('records').put(Object.assign({ filamentId: 'f' + sfx, updatedAt: now }, x)));
        tx.objectStore('meta').put({ id: 'settings', lang: 'tr', rateTry: 51.5, autoRates: false, updatedAt: now });
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    }), records);
  } finally { await ctx.close(); srv.close(); }
}

async function openApp(profile, url, fn) {
  const ctx = await pw.chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1400, height: 900 } });
  const errors = [];
  try {
    await ctx.route(/^https:/, (r) => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => typeof S !== 'undefined' && S.settings && document.querySelector('.topbar-actions'), null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    return await fn(page, errors);
  } finally { await ctx.close(); }
}

test('tarayıcı: eski oturum kayıtları kurtarılır (örnekler çoğalmaz), çekirdek arayüzü, ayarlar sırası', { skip: (!hasGo && 'go yok') || (!pw && 'playwright-core yok'), timeout: 180000 }, async () => {
  const dir = path.join(TMP, 'k1');
  const profile = path.join(dir, 'veri', 'pencere');
  const p1 = await freePort(), p2 = await freePort();
  await oldSession(profile, p1, [{ id: 'eski-1', partName: 'Dişli kapağı', date: '2026-05-01', qty: 2 }]);
  await oldSession(profile, p2, [{ id: 'eski-2', partName: 'Telefon standı', date: '2026-06-01', qty: 5 }]);
  const idb = fs.readdirSync(path.join(profile, 'Default', 'IndexedDB'));
  assert.ok(idb.some((n) => n.includes('_' + p1 + '.indexeddb')) && idb.some((n) => n.includes('_' + p2 + '.indexeddb')), 'eski kökenler: ' + idb);

  const sh = await startShell({ env: { BASKI_VERI: path.join(dir, 'veri'), BASKI_CIKTI: path.join(dir, 'cikti'), BASKI_TASIMA_YOK: '1' } });
  try {
    const liste = await (await fetch(sh.url + '/__shell/kurtar/liste')).json();
    assert.deepStrictEqual(liste.portlar.slice().sort(), [p1, p2].sort());
    const r = await openApp(profile, sh.url + '/', async (page, errors) => {
      await page.waitForFunction(() => S.records && S.records.length >= 2, null, { timeout: 30000 });
      const o = await page.evaluate(async () => ({
        records: S.records.map((x) => x.id).sort(),
        filaments: (await DB.all('filaments')).map((f) => f.name).sort(),
        printers: (await DB.all('printers')).length,
        rate: S.settings.rateTry,
        host: FC.host.kind, can: FC.host.can,
        win: [...document.querySelectorAll('.topbar-actions [data-win]')].map((b) => b.dataset.win),
        version: APP_VERSION, scheme: document.documentElement.dataset.scheme || 'falcon',
        klasik: [...FC.look.schemes ? FC.look.schemes() : []]
      }));
      await page.evaluate(() => { S.screen = 'settings'; render(); });
      await page.waitForTimeout(800);
      o.cards = await page.evaluate(() => [...document.querySelectorAll('#setGrid > *')].map((c) => c.dataset.fcCard || c.dataset.bhCard));
      o.errors = errors.slice();
      // Pencere düğmeleri kabuğa gider (Linux'ta benzetim): Orta → yarım, tekrar → tam ekran
      o.half = await page.evaluate(async () => { await FC.host.window.half(); const a = await FC.host.window.state(); await FC.host.window.half(); const b = await FC.host.window.state(); return [a.half, b.half, b.fullscreen]; });
      // İndirme yalnız GitHub adreslerinden
      o.dl = await page.evaluate(() => FC.host.net.download('https://example.com/x').then(() => 'ok', (e) => e.code));
      // fcHost.update.applyPatch: çekirdeğin güncelleyicisinin kullandığı yol (yama → kabuk → yeni paket → sayfa yenilenir)
      const fcdelta = require('../cekirdek/fcdelta.js');
      const cur = fs.readFileSync(path.join(SHELL, 'app.zip')), next = nextBundle('98.0.0', 'TARAYICI-YAMA');
      const patch = await fcdelta.make(cur, next);
      const meta = { version: '98.0.0', channel: 'win-app', targetSha256: sha(next), targetSize: next.length, file: 'BaskiHesabi-98.0.0-win-app.zip', patchSha256: sha(patch) };
      o.apply = await page.evaluate(async ([b64, meta]) => {
        const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return FC.host.update.applyPatch(u, meta);
      }, [patch.toString('base64'), meta]);
      await page.waitForTimeout(2500);
      o.after = await page.evaluate(() => document.documentElement.outerHTML.includes('TARAYICI-YAMA'));
      return o;
    });
    console.log(r);
    assert.deepStrictEqual(r.errors, []);
    assert.deepStrictEqual(r.half, [true, false, true]);
    assert.strictEqual(r.dl, 'URL_NOT_ALLOWED');
    assert.strictEqual(r.apply, 'restarting');
    assert.strictEqual(r.after, true, 'yeni paket yüklendi');
    assert.strictEqual((await (await fetch(sh.url + '/__shell/info')).json()).bundle, '98.0.0');
    assert.deepStrictEqual(r.records, ['eski-1', 'eski-2']);
    assert.deepStrictEqual(r.filaments, ['ABS', 'PETG', 'PLA'], 'örnek kategoriler çoğalmamalı');
    assert.strictEqual(r.printers, 1);
    assert.strictEqual(r.rate, 51.5, 'ayarlar kurtarıldı');
    assert.strictEqual(r.host, 'electron');
    assert.deepStrictEqual(r.win, ['minimize', 'half', 'fullscreen', 'close']);
    assert.ok(r.can.update);
    assert.ok(r.klasik.includes('klasik'));
    assert.strictEqual(r.cards[r.cards.length - 1], 'contact', 'Admin ile iletişim EN SON');
    assert.strictEqual(r.cards[0], 'look');
    assert.ok(r.cards.includes('usage') && r.cards.includes('crash') && r.cards.includes('about') && r.cards.includes('agent'));
    const done = JSON.parse(fs.readFileSync(path.join(dir, 'veri', 'kurtarilan.json'), 'utf8'));
    assert.ok(done[String(p1)] && done[String(p2)], 'kurtarılan portlar kaydedildi');
    assert.deepStrictEqual((await (await fetch(sh.url + '/__shell/kurtar/liste')).json()).portlar, []);
    // eski köken klasörleri silinmez
    assert.ok(fs.readdirSync(path.join(profile, 'Default', 'IndexedDB')).some((n) => n.includes('_' + p1 + '.indexeddb')));
  } finally { await stop(sh); }
});

test('taşınabilir → kurulum: eski klasör bulunur, profil kopyalanır (eski yerinde kalır), kayıtlar açılır', { skip: (!hasGo && 'go yok') || (!pw && 'playwright-core yok'), timeout: 180000 }, async () => {
  const root = path.join(TMP, 'k2');
  const old = path.join(root, 'Kullanici', 'Downloads', 'BaskiHesabi-veri');
  const port = await freePort();
  await oldSession(path.join(old, 'pencere'), port, [{ id: 'tasinan-1', partName: 'Kablo klipsi', date: '2026-07-01', qty: 40 }]);
  // kurulum klasörü: exe + Kaldir.exe (NSIS kaldırıcısı) → kurulumlu düzen
  const inst = path.join(root, 'Programs', 'BaskiHesabi');
  fs.mkdirSync(inst, { recursive: true });
  const exe = path.join(inst, 'BaskiHesabi');
  fs.copyFileSync(BIN, exe); fs.chmodSync(exe, 0o755);
  fs.writeFileSync(path.join(inst, 'Kaldir.exe'), 'x');
  const sh = await startShell({ bin: exe, env: { BASKI_ESKI_ARA: path.join(root, 'Kullanici') } });
  try {
    assert.strictEqual(sh.info.tasima.durum, 'tamam', JSON.stringify(sh.info.tasima));
    assert.strictEqual(sh.info.tasima.kaynak, old);
    const own = path.join(inst, 'BaskiHesabi-veri', 'pencere', 'Default', 'IndexedDB');
    assert.ok(fs.readdirSync(own).some((n) => n.includes('_' + port + '.indexeddb')), 'profil kopyalandı');
    assert.ok(fs.existsSync(path.join(old, 'pencere', 'Default', 'IndexedDB')), 'eski klasör yerinde');
    const ids = await openApp(path.join(inst, 'BaskiHesabi-veri', 'pencere'), sh.url + '/', async (page) => {
      await page.waitForFunction(() => S.records && S.records.length >= 1, null, { timeout: 30000 });
      return page.evaluate(() => S.records.map((r) => r.id));
    });
    assert.deepStrictEqual(ids, ['tasinan-1']);
  } finally { await stop(sh); }
  // ikinci açılış: taşıma tekrar yapılmaz
  const sh2 = await startShell({ bin: exe, env: { BASKI_ESKI_ARA: path.join(root, 'Kullanici') } });
  try { assert.strictEqual(sh2.info.tasima.durum, 'tamam'); } finally { await stop(sh2); }
});

test('eski kanal köprüsü: eski kabuk 1.x (git f1c59bc) yeni arayüzü surum.json biçiminden kurar, "Yeni kurulum gerekli" açılır', { skip: (!hasGo && 'go yok') || (!pw && 'playwright-core yok') || (spawnSync('git', ['cat-file', '-e', 'f1c59bc:shell-exe/main.go'], { cwd: ROOT }).status !== 0 && 'git geçmişi yok'), timeout: 180000 }, async () => {
  const src = path.join(TMP, 'eski-kabuk');
  fs.mkdirSync(src, { recursive: true });
  // v1.13'teki kabuk (1.5) ve arayüz, git geçmişinden
  execFileSync('sh', ['-c', `git archive f1c59bc shell-exe app | tar -x -C "${src}"`], { cwd: ROOT });
  fs.cpSync(path.join(src, 'app'), path.join(src, 'shell-exe', 'app'), { recursive: true });
  const oldBin = path.join(TMP, 'eski-kabuk-bin');
  execFileSync('go', ['build', '-o', oldBin, '.'], { cwd: path.join(src, 'shell-exe'), stdio: 'inherit' });
  const run = path.join(TMP, 'eski-calisma'); fs.mkdirSync(run, { recursive: true });
  const exe = path.join(run, 'BaskiHesabi-v1.13'); fs.copyFileSync(oldBin, exe); fs.chmodSync(exe, 0o755);
  const p = spawn(exe, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  try {
    let url = null;
    for (let i = 0; i < 50 && !url; i++) { const m = /pencere: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out); if (m) url = m[1]; else await sleep(100); }
    assert.ok(url, 'eski kabuk adresi: ' + out);
    const info = await (await fetch(url + '__shell/info')).json();
    assert.strictEqual(info.version, '1.5');
    // eski arayüzün karşılaştırması: yeni sürüm "daha yeni" görünmeli
    const ctx0 = { window: {}, t: (k) => k, DB: {}, IndirmeIlerleme: {} }; vm0(ctx0);
    const { json } = require('../araclar/eski-kanal.js').build(new Date().toISOString());
    const man = JSON.parse(json);
    assert.ok(ctx0.cmpVer(man.version, '1.13') > 0, 'eski cmpVer yeni sürümü görmeli');
    // eski kabuğun güncelleme ucu (eski güncelleyicinin yaptığı)
    const r = await fetch(url + '__shell/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: man.version, files: man.files }) });
    assert.strictEqual(r.status, 200, await r.text());
    const ctx = await pw.chromium.launchPersistentContext(path.join(TMP, 'eski-profil'), { headless: true });
    const errors = [];
    try {
      await ctx.route(/^https:/, (rt) => rt.abort());
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForSelector('.bh-bridge', { timeout: 20000 });
      const o = await page.evaluate(() => ({ v: APP_VERSION, host: FC.host.kind, legacy: Kabuk.isLegacy, text: document.querySelector('.bh-bridge').textContent, setup: Kabuk.setupUrl() }));
      assert.strictEqual(o.v, require('../package.json').version);
      assert.strictEqual(o.host, 'browser');
      assert.strictEqual(o.legacy, true);
      assert.match(o.setup, /\/releases\/download\/v\d+\.\d+\.\d+\/BaskiHesabi-Setup-\d+\.\d+\.\d+\.exe$/);
      assert.match(o.text, /BaskiHesabi-veri/);
      assert.deepStrictEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { p.kill(); }
});

/** Eski arayüzün (v1.13 sync.js) sürüm karşılaştırmasını yükler. */
function vm0(ctx) {
  const vm = require('vm');
  const code = execFileSync('git', ['show', 'f1c59bc:app/js/sync.js'], { cwd: ROOT, encoding: 'utf8' });
  vm.createContext(ctx);
  vm.runInContext(code + ';this.cmpVer = cmpVer;', ctx);
}
