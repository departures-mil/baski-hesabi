#!/usr/bin/env node
/* Arayüz paketi (win-app kanalı): app/ klasörü + surum.json → dist/app.zip
   Belirleyici: dosyalar sıralı, tarih sabit (1980-01-01), sabit sıkıştırma; aynı girdi → bayt bayt aynı zip.
   CI bu dosyayı hem exe'ye gömer (shell-exe/app.zip) hem release'e win-app asset'i olarak yükler — yama kaynağı odur.
     node araclar/paket.js [çıktı.zip]          (varsayılan dist/app.zip; ayrıca shell-exe/app.zip'e kopyalar) */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function list(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...list(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

function version() { return require(path.join(ROOT, 'package.json')).version; }

/** entries: [{name, data}] → zip Buffer (deflate, sabit tarih) */
function makeZip(entries) {
  const locals = [], centrals = [];
  let off = 0;
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01 00:00
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useStore = comp.length >= data.length;
    const body = useStore ? data : comp;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);   // UTF-8 adlar
    lh.writeUInt16LE(useStore ? 0 : 8, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(useStore ? 0 : 8, 10); ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    centrals.push(ch, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

function build() {
  const v = version();
  const entries = list(APP).filter((n) => n !== 'surum.json').map((n) => ({ name: n, data: fs.readFileSync(path.join(APP, n)) }));
  entries.push({ name: 'surum.json', data: Buffer.from(JSON.stringify({ app: 'baski-hesabi', version: v }) + '\n') });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { zip: makeZip(entries), version: v, files: entries.map((e) => e.name) };
}

module.exports = { build, makeZip, list, crc32 };

if (require.main === module) {
  const out = process.argv[2] || path.join(ROOT, 'dist', 'app.zip');
  const { zip, version: v, files } = build();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip);
  fs.writeFileSync(path.join(ROOT, 'shell-exe', 'app.zip'), zip);
  const sha = require('crypto').createHash('sha256').update(zip).digest('hex');
  console.log(`app.zip v${v}: ${files.length} dosya, ${zip.length} bayt, sha256 ${sha}`);
}
