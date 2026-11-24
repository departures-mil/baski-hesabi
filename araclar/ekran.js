#!/usr/bin/env node
/* Ekran görüntüleri: gerçek kabuk (Linux derlemesi, pencere açmaz) + başsız Chromium.
     PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node araclar/ekran.js <klasör>
   Kabuk yoksa derler (go gerekir). Dış ağ istekleri engellenir. */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'ekran'));
const PORT = 41790 + Math.floor(Math.random() * 100);

function buildShell() {
  execFileSync(process.execPath, [path.join(__dirname, 'paket.js')], { stdio: 'inherit' });
  const bin = path.join(os.tmpdir(), 'baski-hesabi-kabuk-' + process.pid);
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: path.join(ROOT, 'shell-exe'), stdio: 'inherit' });
  return bin;
}

async function startShell(bin, dir) {
  const p = spawn(bin, [], { env: Object.assign({}, process.env, { BASKI_PENCERE_YOK: '1', BASKI_PORT: String(PORT), BASKI_VERI: path.join(dir, 'veri'), BASKI_CIKTI: path.join(dir, 'cikti'), BASKI_TASIMA_YOK: '1' }), stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/__shell/info`); if (r.ok) return p; } catch (e) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  p.kill(); throw new Error('kabuk açılmadı');
}

/** Örnek veri (ekran için) */
async function seed(page) {
  await page.evaluate(async () => {
    const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const fil = await DB.all('filaments'), prn = await DB.all('printers');
    const cust = [{ id: 'c1', name: 'Atölye Kuzey' }, { id: 'c2', name: 'Ahmet Yılmaz' }];
    await DB.putMany('customers', cust);
    await DB.put('printers', { id: 'p2', name: 'Bambu P1S', watt: 350, price: 700, life: 6000 });
    const mk = (i, name, g, h, qty, pay, c) => ({ id: 'r' + i, partName: name, date: d(i * 3), customerId: c.id, customerName: c.name, printerId: prn[0].id, printerName: prn[0].name, filamentId: fil[0].id, filamentName: fil[0].name, payment: pay, grams: g, hours: h, minutes: 0, qty, kgPrice: 20, watt: 150, kwhPrice: 0.15, margin: 40, unitCost: g * 0.02 + h * 0.03, unitPrice: (g * 0.02 + h * 0.03) * 1.4, unitProfit: (g * 0.02 + h * 0.03) * 0.4, totalCost: (g * 0.02 + h * 0.03) * qty, totalPrice: (g * 0.02 + h * 0.03) * 1.4 * qty, totalProfit: (g * 0.02 + h * 0.03) * 0.4 * qty, totalGrams: g * qty, totalHours: h * qty, costFilament: g * 0.02, costPower: h * 0.0225, rateTry: 48.9, rateSyp: 122 });
    await DB.putMany('records', [mk(1, 'Dişli kutusu kapağı', 84, 5, 2, 'paid', cust[0]), mk(2, 'Telefon standı', 46, 3, 6, 'pending', cust[1]), mk(3, 'Drone kol bağlantısı', 22, 2, 8, 'deposit', cust[0]), mk(4, 'Kablo klipsi', 4, 0.5, 40, 'paid', cust[1])]);
    await DB.putMany('products', [{ id: 'u1', name: 'Telefon standı', qty: 4, unitCost: 1.3, location: 'Raf A' }, { id: 'u2', name: 'Kablo klipsi', qty: 32, unitCost: 0.1, location: 'Çekmece 2' }]);
    await DB.putMany('sales', [{ id: 's1', productId: 'u1', productName: 'Telefon standı', qty: 2, unitPrice: 3, unitCost: 1.3, date: d(1) }]);
    await reload(); render();
  });
}

const shots = [
  { name: 'tr-falcon-dark', lang: 'tr', theme: 'dark', scheme: 'falcon' },
  { name: 'ar-falcon-light', lang: 'ar', theme: 'light', scheme: 'falcon' },
  { name: 'tr-klasik', lang: 'tr', theme: 'dark', scheme: 'klasik' },
  { name: 'tr-falcon-dark-kayitlar', lang: 'tr', theme: 'dark', scheme: 'falcon', screen: 'records' },
  { name: 'tr-falcon-dark-ayarlar', lang: 'tr', theme: 'dark', scheme: 'falcon', screen: 'settings', tall: true },
  { name: 'ar-falcon-light-ayarlar', lang: 'ar', theme: 'light', scheme: 'falcon', screen: 'settings', tall: true },
  { name: 'tr-klasik-ayarlar', lang: 'tr', theme: 'dark', scheme: 'klasik', screen: 'settings', tall: true },
  { name: 'tr-eski-kabuk-kopru', lang: 'tr', theme: 'dark', scheme: 'falcon', legacy: true }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const bin = process.env.BASKI_KABUK || buildShell();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-ekran-'));
  const shell = await startShell(bin, tmp);
  const browser = await pw.chromium.launch();
  const errors = [];
  try {
    for (const s of shots) {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: s.tall ? 2000 : 940 }, deviceScaleFactor: 1 });
      await ctx.route(/^https:/, (r) => r.abort());
      if (s.legacy) {   // kabuk 1.x: host.js yok, /__shell/info eski biçimde
        await ctx.route(/\/__shell\/host\.js/, (r) => r.fulfill({ status: 404, body: 'yok' }));
        await ctx.route(/\/__shell\/info/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'desktop', version: '1.5', dataDir: 'C:\\Users\\Milen\\Downloads\\BaskiHesabi-veri', outDir: 'C:\\Users\\Milen\\Downloads\\BaskiHesabi-ciktilar' }) }));
      }
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(s.name + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::|404|Failed to load resource/.test(m.text())) errors.push(s.name + ' console: ' + m.text()); });
      await page.addInitScript((s) => {
        const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
        set('lang', s.lang); set('theme', s.theme); set('scheme', s.scheme); set('onboarding.done', true); set('whatsnew.seen', '1.14.0');
      }, s);
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForTimeout(1200);
      await page.evaluate(async (l) => { if (LANG !== l) await appLangChanged(l); }, s.lang);
      if (!s.legacy) { await seed(page); }
      if (s.screen) { await page.evaluate((sc) => { S.screen = sc; render(); }, s.screen); }
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, s.name + '.png') });
      await ctx.close();
      console.log('✓', s.name);
    }
  } finally {
    await browser.close();
    shell.kill();
  }
  if (errors.length) { console.error('HATALAR:\n' + errors.join('\n')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
