#!/usr/bin/env node
/* FCD1 test vektörleri: çekirdeğin Node üreticisiyle (cekirdek/fcdelta.js) yama üretir, Go testleri
   (shell-exe/fcd1/fcd1_test.go) bunları uygular. Çıktı: shell-exe/fcd1/testdata/<ad>.{src,dst,bin}
   Belirleyici (sabit tohumlu) veri kullanır; yeniden çalıştırmak aynı dosyaları üretir.
     node araclar/fcd1-vektor.js [klasör] */
'use strict';
const fs = require('fs');
const path = require('path');
const fcdelta = require('../cekirdek/fcdelta.js');

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'shell-exe', 'fcd1', 'testdata');

function rng(seed) {
  let x = BigInt(seed) || 1n;
  return () => { x ^= (x << 13n) & 0xffffffffffffffffn; x ^= x >> 7n; x ^= (x << 17n) & 0xffffffffffffffffn; return Number(x & 0xffn); };
}
function randomBytes(n, seed) { const r = rng(seed), b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = r(); return b; }
function text(n, seed) {
  const r = rng(seed), words = ['baskı', 'filament', 'yazıcı', 'kâr', 'maliyet', 'PLA', 'PETG', 'satış', 'ürün', 'kayıt', 'function', 'const', '{', '}', '\n'];
  let s = ''; while (s.length < n) s += words[r() % words.length] + ' ';
  return Buffer.from(s.slice(0, n));
}

async function vector(name, src, dst) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p + '.src', src);
  fs.writeFileSync(p + '.dst', dst);
  await fcdelta.makeFile(p + '.src', p + '.dst', p + '.bin');
  const patch = fs.readFileSync(p + '.bin');
  const back = fcdelta.apply(src, patch);
  if (!Buffer.from(back).equals(dst)) throw new Error('node apply mismatch: ' + name);
  console.log(name, src.length, '→', dst.length, 'yama', patch.length);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 1) FORMAT.md test vektörü: boş kaynak → "abc"
  await vector('bos-abc', Buffer.alloc(0), Buffer.from('abc'));
  // 2) metin: ortasına ekleme, silme, sona ekleme
  const a = text(200000, 7);
  const b = Buffer.concat([a.subarray(0, 50000), Buffer.from('YENİ SATIR\n'.repeat(40)), a.subarray(52000, 150000), a.subarray(160000), Buffer.from('son')]);
  await vector('metin', a, b);
  // 3) ikili: bloklar yer değiştirir, bazı baytlar değişir
  const c = randomBytes(300000, 99);
  const d = Buffer.concat([c.subarray(150000), c.subarray(0, 150000)]); d[1234] ^= 0xff; d[200000] ^= 0x55;
  await vector('ikili', c, d);
  // 4) aynı dosya
  await vector('ayni', a, Buffer.from(a));
  // 5) bambaşka dosya
  await vector('farkli', randomBytes(5000, 3), randomBytes(7000, 4));
})().catch((e) => { console.error(e); process.exit(1); });
