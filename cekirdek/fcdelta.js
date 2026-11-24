#!/usr/bin/env node
'use strict';
/*
 * fcdelta — FCD1 ikili yama (delta) aracı. Sıfır bağımlılık, Node 18+.
 * Format: ../FORMAT.md
 *
 * Kütüphane:
 *   const fcd = require('./fcdelta.js');
 *   await fcd.makeFile(oldPath, newPath, patchPath)      -> stats
 *   await fcd.applyFile(oldPath, patchPath, outPath)     -> { dstLen, dstSha256 }
 *   await fcd.make(oldBuf, newBuf)                       -> Buffer (yama)
 *   fcd.apply(oldBuf, patchBuf)                          -> Buffer (yeni dosya)
 *   fcd.readHeader(bufOrPath)                            -> başlık bilgisi
 *
 * CLI:
 *   fcdelta make   <old> <new> <patch>
 *   fcdelta apply  <old> <patch> <out>
 *   fcdelta verify <old> <patch> <new>     (uyuşmazlıkta çıkış kodu 1)
 *   fcdelta info   <patch>
 *
 * Bellek: make iki dosyayı da belleğe alır (2x), yamayı akış halinde yazar.
 * apply sabit bellekle çalışır (eski dosya seek+read, çıktı akış halinde).
 */

const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const path = require('path');
const { once } = require('events');

// Electron içinde app.asar'ı "dosya" olarak okumak için original-fs şart
// (normal fs asar'ı klasör gibi gösterir).
let fs;
try {
  fs = process.versions && process.versions.electron ? require('original-fs') : require('fs');
} catch (_) {
  fs = require('fs');
}

const MAGIC = Buffer.from('FCD1', 'ascii');
const CODEC_ZLIB = 0x01;
const HEADER_LEN = 85;
const OP_END = 0x00, OP_COPY = 0x01, OP_INSERT = 0x02;

const MIN_CHUNK = 2 * 1024;
const MAX_CHUNK = 64 * 1024;
const MASK = 0xFFF80000; // üst 13 bit -> ortalama ~8 KiB
const IO_BLOCK = 1 << 20;

// ---- Gear tablosu (xorshift64, alt 32 bit) ----
const GEAR = (() => {
  const g = new Uint32Array(256);
  let x = 0x9E3779B97F4A7C15n;
  const M = (1n << 64n) - 1n;
  for (let i = 0; i < 256; i++) {
    x ^= (x << 13n) & M;
    x ^= x >> 7n;
    x ^= (x << 17n) & M;
    g[i] = Number(x & 0xFFFFFFFFn);
  }
  return g;
})();

/** start konumundan başlayan parçanın bitiş konumunu (hariç) döndürür. */
function nextCut(d, start) {
  const n = d.length;
  const lim = Math.min(n, start + MAX_CHUNK);
  const first = start + MIN_CHUNK - 1; // sınır kontrolünün başladığı ilk bayt
  if (first >= lim) return lim;
  let h = 0;
  // h yalnızca son 32 bayta bağlı; ısınma için 32 bayt önceden başla
  for (let j = Math.max(start, first - 32); j < first; j++) h = ((h << 1) + GEAR[d[j]]) >>> 0;
  for (let i = first; i < lim; i++) {
    h = ((h << 1) + GEAR[d[i]]) >>> 0;
    if ((h & MASK) === 0) return i + 1;
  }
  return lim;
}

function chunkKey(d, off, len) {
  return crypto.createHash('sha256').update(d.subarray(off, off + len)).digest('latin1') + len;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function writeU64(buf, off, v) {
  buf.writeUInt32LE(v % 0x100000000, off);
  buf.writeUInt32LE(Math.floor(v / 0x100000000), off + 4);
}
function readU64(buf, off) {
  const lo = buf.readUInt32LE(off), hi = buf.readUInt32LE(off + 4);
  if (hi >= 0x200000) throw new Error('FCD1: uzunluk çok büyük');
  return hi * 0x100000000 + lo;
}

function buildHeader(srcLen, srcHash, dstLen, dstHash) {
  const h = Buffer.alloc(HEADER_LEN);
  MAGIC.copy(h, 0);
  h[4] = CODEC_ZLIB;
  writeU64(h, 5, srcLen);
  srcHash.copy(h, 13);
  writeU64(h, 45, dstLen);
  dstHash.copy(h, 53);
  return h;
}

function parseHeader(h) {
  if (!h || h.length < HEADER_LEN) throw new Error('FCD1: yama çok kısa');
  if (!h.subarray(0, 4).equals(MAGIC)) throw new Error('FCD1: yama dosyası değil (magic)');
  if (h[4] !== CODEC_ZLIB) throw new Error('FCD1: bilinmeyen codec ' + h[4]);
  return {
    magic: 'FCD1',
    codec: 'zlib',
    srcLen: readU64(h, 5),
    srcSha256: Buffer.from(h.subarray(13, 45)).toString('hex'),
    dstLen: readU64(h, 45),
    dstSha256: Buffer.from(h.subarray(53, 85)).toString('hex'),
  };
}

// ---------------------------------------------------------------------------
// MAKE
// ---------------------------------------------------------------------------

/** Op baytlarını küçük bir ara bellekte toplar, büyük INSERT verisini doğrudan geçirir. */
class OpWriter {
  constructor(sink) {
    this.sink = sink; // async (Buffer) => void
    this.buf = Buffer.allocUnsafe(64 * 1024);
    this.pos = 0;
  }
  async ensure(n) { if (this.pos + n > this.buf.length) await this.flush(); }
  async flush() {
    if (this.pos === 0) return;
    const b = Buffer.from(this.buf.subarray(0, this.pos));
    this.pos = 0;
    await this.sink(b);
  }
  byte(b) { this.buf[this.pos++] = b; }
  varint(v) {
    while (v >= 0x80) { this.buf[this.pos++] = (v % 0x80) | 0x80; v = Math.floor(v / 0x80); }
    this.buf[this.pos++] = v;
  }
  async copy(off, len) { await this.ensure(21); this.byte(OP_COPY); this.varint(off); this.varint(len); }
  async insert(data) {
    if (data.length === 0) return;
    await this.ensure(11); this.byte(OP_INSERT); this.varint(data.length);
    if (data.length <= 4096) {
      await this.ensure(data.length);
      data.copy(this.buf, this.pos); this.pos += data.length;
    } else {
      await this.flush();
      for (let o = 0; o < data.length; o += IO_BLOCK) await this.sink(data.subarray(o, Math.min(data.length, o + IO_BLOCK)));
    }
  }
  async end() { await this.ensure(1); this.byte(OP_END); await this.flush(); }
}

/** old ve new Buffer'larından op dizisi üretir; ops.copy/insert çağırır. */
async function diff(oldData, newData, ops, stats) {
  // 1) eski dosyayı indeksle
  const index = new Map();
  for (let off = 0; off < oldData.length;) {
    const end = nextCut(oldData, off);
    const k = chunkKey(oldData, off, end - off);
    if (!index.has(k)) index.set(k, off);
    off = end;
  }

  let pendCopyOff = -1, pendCopyLen = 0;
  const flushCopy = async () => {
    if (pendCopyLen > 0) {
      await ops.copy(pendCopyOff, pendCopyLen);
      stats.copyOps++; stats.copyBytes += pendCopyLen;
    }
    pendCopyLen = 0; pendCopyOff = -1;
  };
  const addCopy = async (off, len) => {
    if (pendCopyLen > 0 && pendCopyOff + pendCopyLen === off) { pendCopyLen += len; return; }
    await flushCopy();
    pendCopyOff = off; pendCopyLen = len;
  };
  const addInsert = async (from, to) => {
    if (to <= from) return;
    await flushCopy();
    await ops.insert(newData.subarray(from, to));
    stats.insertOps++; stats.insertBytes += to - from;
  };

  const N = newData.length, O = oldData.length;
  let pos = 0;        // yeni dosyada şu anki parça başı
  let litStart = 0;   // henüz yazılmamış INSERT verisinin başı
  while (pos < N) {
    const end = nextCut(newData, pos);
    const len = end - pos;
    const src = index.get(chunkKey(newData, pos, len));
    if (src === undefined || newData.compare(oldData, src, src + len, pos, end) !== 0) {
      pos = end;
      continue;
    }
    // geriye uzat (bekleyen INSERT verisinin içine)
    let b = 0;
    while (pos - b > litStart && src - b > 0 && newData[pos - b - 1] === oldData[src - b - 1]) b++;
    // ileriye uzat: önce 4 KiB bloklarla, sonra bayt bayt
    let e = end, s = src + len;
    const BLK = 4096;
    while (e + BLK <= N && s + BLK <= O && newData.compare(oldData, s, s + BLK, e, e + BLK) === 0) { e += BLK; s += BLK; }
    while (e < N && s < O && newData[e] === oldData[s]) { e++; s++; }

    await addInsert(litStart, pos - b);
    await addCopy(src - b, e - (pos - b));
    pos = e;
    litStart = e;
  }
  await addInsert(litStart, N);
  await flushCopy();
  await ops.end();
}

function newStats() {
  return { copyOps: 0, copyBytes: 0, insertOps: 0, insertBytes: 0 };
}

/** Bellekteki iki Buffer'dan yama Buffer'ı üretir. */
async function make(oldData, newData, opts = {}) {
  const stats = newStats();
  const def = zlib.createDeflate({ level: opts.level ?? 9, memLevel: 9 });
  const parts = [buildHeader(oldData.length, sha256(oldData), newData.length, sha256(newData))];
  def.on('data', (c) => parts.push(c));
  const done = once(def, 'end');
  const ops = new OpWriter(async (b) => { if (!def.write(b)) await once(def, 'drain'); });
  await diff(oldData, newData, ops, stats);
  def.end();
  await done;
  const patch = Buffer.concat(parts);
  if (opts.stats) Object.assign(opts.stats, stats, { patchLen: patch.length, newLen: newData.length });
  return patch;
}

/** Dosyalardan yama üretir; yama akış halinde diske yazılır. */
async function makeFile(oldPath, newPath, patchPath, opts = {}) {
  const t0 = Date.now();
  const oldData = fs.readFileSync(oldPath);
  const newData = fs.readFileSync(newPath);
  const stats = newStats();
  const tmp = patchPath + '.tmp-' + process.pid;
  const out = fs.createWriteStream(tmp);
  try {
    out.write(buildHeader(oldData.length, sha256(oldData), newData.length, sha256(newData)));
    const def = zlib.createDeflate({ level: opts.level ?? 9, memLevel: 9 });
    def.pipe(out);
    const closed = once(out, 'close');
    const ops = new OpWriter(async (b) => { if (!def.write(b)) await once(def, 'drain'); });
    await diff(oldData, newData, ops, stats);
    def.end();
    await closed;
    fs.renameSync(tmp, patchPath);
  } catch (e) {
    out.destroy();
    try { fs.unlinkSync(tmp); } catch (_) { /* yok say */ }
    throw e;
  }
  const patchLen = fs.statSync(patchPath).size;
  return Object.assign(stats, {
    oldLen: oldData.length, newLen: newData.length, patchLen,
    ratio: newData.length ? patchLen / newData.length : 0,
    ms: Date.now() - t0,
  });
}

// ---------------------------------------------------------------------------
// APPLY
// ---------------------------------------------------------------------------

/**
 * Açılmış op akışını parça parça işleyen durum makinesi.
 * h.copy(off, len) ve h.insert(buf) senkron çağrılır.
 */
class OpParser {
  constructor(srcLen, dstLen, h) {
    this.srcLen = srcLen; this.dstLen = dstLen; this.h = h;
    this.state = 0; // 0=op, 1=varint, 2=insert verisi
    this.op = 0; this.fields = []; this.need = 0;
    this.v = 0; this.shift = 0;
    this.remain = 0; this.written = 0; this.ended = false;
  }
  feed(c) {
    let i = 0;
    const n = c.length;
    while (i < n) {
      if (this.ended) throw new Error('FCD1: END sonrası fazla veri');
      if (this.state === 0) {
        const op = c[i++];
        if (op === OP_END) { this.ended = true; continue; }
        if (op === OP_COPY) this.need = 2;
        else if (op === OP_INSERT) this.need = 1;
        else throw new Error('FCD1: geçersiz op ' + op);
        this.op = op; this.fields = []; this.v = 0; this.shift = 0; this.state = 1;
      } else if (this.state === 1) {
        const b = c[i++];
        if (this.shift > 56) throw new Error('FCD1: varint çok uzun');
        this.v += (b & 0x7F) * Math.pow(2, this.shift);
        this.shift += 7;
        if (b < 0x80) {
          if (this.v > Number.MAX_SAFE_INTEGER) throw new Error('FCD1: varint çok büyük');
          this.fields.push(this.v); this.v = 0; this.shift = 0;
          if (this.fields.length === this.need) this._exec();
        }
      } else {
        const k = Math.min(this.remain, n - i);
        this.h.insert(c.subarray(i, i + k));
        i += k; this.remain -= k;
        if (this.remain === 0) this.state = 0;
      }
    }
  }
  _exec() {
    if (this.op === OP_COPY) {
      const [off, len] = this.fields;
      if (off + len > this.srcLen) throw new Error('FCD1: COPY aralığı kaynak dışında');
      this._grow(len);
      if (len > 0) this.h.copy(off, len);
      this.state = 0;
    } else {
      const len = this.fields[0];
      this._grow(len);
      this.remain = len;
      this.state = len > 0 ? 2 : 0;
    }
  }
  _grow(len) {
    this.written += len;
    if (this.written > this.dstLen) throw new Error('FCD1: çıktı dstLen değerini aşıyor');
  }
  finish() {
    if (!this.ended) throw new Error('FCD1: END op yok (yama kesik)');
    if (this.written !== this.dstLen) throw new Error('FCD1: çıktı uzunluğu dstLen ile uyuşmuyor');
  }
}

/** Bellekte uygular: Buffer döndürür. Kaynak/hedef özeti uyuşmazsa hata fırlatır. */
function apply(oldData, patch) {
  const hd = parseHeader(patch);
  if (oldData.length !== hd.srcLen || sha256(oldData).toString('hex') !== hd.srcSha256)
    throw new Error('FCD1: kaynak dosya yamanın kaynağı değil');
  const res = zlib.inflateSync(patch.subarray(HEADER_LEN), { info: true });
  if (res.engine.bytesWritten !== patch.length - HEADER_LEN) throw new Error('FCD1: zlib akışından sonra fazla veri');
  const out = Buffer.allocUnsafe(hd.dstLen);
  let w = 0;
  const p = new OpParser(hd.srcLen, hd.dstLen, {
    copy: (off, len) => { oldData.copy(out, w, off, off + len); w += len; },
    insert: (b) => { b.copy(out, w); w += b.length; },
  });
  p.feed(res.buffer);
  p.finish();
  if (sha256(out).toString('hex') !== hd.dstSha256) throw new Error('FCD1: sonuç SHA-256 uyuşmuyor');
  return out;
}

function hashFileSync(p) {
  const fd = fs.openSync(p, 'r');
  try {
    const h = crypto.createHash('sha256');
    const buf = Buffer.allocUnsafe(IO_BLOCK);
    let n, len = 0;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) { h.update(buf.subarray(0, n)); len += n; }
    return { len, hex: h.digest('hex') };
  } finally { fs.closeSync(fd); }
}

function readFdFully(fd, buf, len, pos) {
  let got = 0;
  while (got < len) {
    const n = fs.readSync(fd, buf, got, len - got, pos + got);
    if (n <= 0) throw new Error('FCD1: kaynak dosya beklenenden kısa');
    got += n;
  }
}

function writeFdFully(fd, buf) {
  let o = 0;
  while (o < buf.length) o += fs.writeSync(fd, buf, o, buf.length - o);
}

/**
 * Dosya üzerinde, sabit bellekle uygular. Önce geçici dosyaya yazar, doğrular, sonra
 * outPath'e taşır. opts.onProgress(writtenBytes, dstLen) isteğe bağlı.
 */
async function applyFile(oldPath, patchPath, outPath, opts = {}) {
  const pfd = fs.openSync(patchPath, 'r');
  const head = Buffer.alloc(HEADER_LEN);
  let patchSize;
  try {
    patchSize = fs.fstatSync(pfd).size;
    if (patchSize < HEADER_LEN) throw new Error('FCD1: yama çok kısa');
    readFdFully(pfd, head, HEADER_LEN, 0);
  } finally { fs.closeSync(pfd); }
  const hd = parseHeader(head);

  const src = hashFileSync(oldPath);
  if (src.len !== hd.srcLen || src.hex !== hd.srcSha256) throw new Error('FCD1: kaynak dosya yamanın kaynağı değil');

  const tmp = outPath + '.tmp-' + process.pid;
  const ofd = fs.openSync(oldPath, 'r');
  const wfd = fs.openSync(tmp, 'w');
  const outHash = crypto.createHash('sha256');
  const cbuf = Buffer.allocUnsafe(IO_BLOCK);
  let written = 0;
  const emit = (b) => {
    writeFdFully(wfd, b); outHash.update(b); written += b.length;
    if (opts.onProgress) opts.onProgress(written, hd.dstLen);
  };
  let ok = false;
  try {
    const parser = new OpParser(hd.srcLen, hd.dstLen, {
      copy: (off, len) => {
        while (len > 0) {
          const k = Math.min(len, cbuf.length);
          readFdFully(ofd, cbuf, k, off);
          emit(cbuf.subarray(0, k));
          off += k; len -= k;
        }
      },
      insert: (b) => emit(b),
    });
    const inf = zlib.createInflate();
    const rs = fs.createReadStream(patchPath, { start: HEADER_LEN, highWaterMark: 256 * 1024 });
    rs.on('error', (e) => inf.destroy(e));
    rs.pipe(inf);
    for await (const chunk of inf) parser.feed(chunk);
    parser.finish();
    if (inf.bytesWritten !== patchSize - HEADER_LEN) throw new Error('FCD1: zlib akışından sonra fazla veri');
    if (outHash.digest('hex') !== hd.dstSha256) throw new Error('FCD1: sonuç SHA-256 uyuşmuyor');
    ok = true;
  } finally {
    fs.closeSync(ofd);
    fs.closeSync(wfd);
    if (!ok) { try { fs.unlinkSync(tmp); } catch (_) { /* yok say */ } }
  }
  try { fs.unlinkSync(outPath); } catch (_) { /* yok say */ }
  fs.renameSync(tmp, outPath);
  return { dstLen: hd.dstLen, dstSha256: hd.dstSha256 };
}

/** Başlığı ve (inspect=true ise) op istatistiklerini okur. bufOrPath: Buffer ya da dosya yolu. */
async function readHeader(bufOrPath, inspect = false) {
  let head, size, stream;
  if (Buffer.isBuffer(bufOrPath)) {
    head = bufOrPath.subarray(0, HEADER_LEN); size = bufOrPath.length;
  } else {
    const fd = fs.openSync(bufOrPath, 'r');
    try {
      size = fs.fstatSync(fd).size;
      head = Buffer.alloc(Math.min(HEADER_LEN, size));
      if (head.length) readFdFully(fd, head, head.length, 0);
    } finally { fs.closeSync(fd); }
  }
  const hd = parseHeader(head);
  hd.patchLen = size;
  if (!inspect) return hd;
  const st = newStats();
  const p = new OpParser(hd.srcLen, hd.dstLen, {
    copy: (o, l) => { st.copyOps++; st.copyBytes += l; },
    insert: (b) => { st.insertBytes += b.length; },
  });
  const origExec = p._exec.bind(p);
  p._exec = () => { if (p.op === OP_INSERT) st.insertOps++; origExec(); };
  const inf = zlib.createInflate();
  if (Buffer.isBuffer(bufOrPath)) { inf.end(bufOrPath.subarray(HEADER_LEN)); } else {
    stream = fs.createReadStream(bufOrPath, { start: HEADER_LEN }); stream.pipe(inf);
  }
  for await (const c of inf) p.feed(c);
  p.finish();
  return Object.assign(hd, st, { ratio: hd.dstLen ? size / hd.dstLen : 0 });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

async function cli(argv) {
  const [cmd, a, b, c] = argv;
  const usage = 'kullanım: fcdelta make <old> <new> <patch> | apply <old> <patch> <out> | verify <old> <patch> <new> | info <patch>';
  if (cmd === 'make' && c) {
    const s = await makeFile(a, b, c);
    console.log(`patch ${c}: ${mb(s.patchLen)} (full ${mb(s.newLen)}) ratio=${(s.ratio * 100).toFixed(2)}% ` +
      `copy=${s.copyOps}/${mb(s.copyBytes)} insert=${s.insertOps}/${mb(s.insertBytes)} ${s.ms} ms`);
    console.log(JSON.stringify({ patch: c, patchLen: s.patchLen, newLen: s.newLen, ratio: s.ratio }));
    return 0;
  }
  if (cmd === 'apply' && c) {
    const t0 = Date.now();
    const r = await applyFile(a, b, c);
    console.log(`ok ${c} ${mb(r.dstLen)} sha256=${r.dstSha256} ${Date.now() - t0} ms`);
    return 0;
  }
  if (cmd === 'verify' && c) {
    const tmp = path.join(os.tmpdir(), `fcdelta-verify-${process.pid}-${Date.now()}.bin`);
    try {
      const want = hashFileSync(c);
      const hd = await readHeader(b);
      if (hd.dstLen !== want.len || hd.dstSha256 !== want.hex) {
        console.error('MISMATCH: yama başlığındaki hedef özeti yeni dosyayla aynı değil');
        return 1;
      }
      await applyFile(a, b, tmp);
      const got = hashFileSync(tmp);
      if (got.len !== want.len || got.hex !== want.hex) { console.error('MISMATCH: uygulanan sonuç farklı'); return 1; }
      console.log(`verified sha256=${got.hex} patch=${mb(hd.patchLen)} full=${mb(want.len)} ratio=${(hd.patchLen / Math.max(1, want.len) * 100).toFixed(2)}%`);
      return 0;
    } catch (e) {
      console.error('MISMATCH: ' + e.message);
      return 1;
    } finally { try { fs.unlinkSync(tmp); } catch (_) { /* yok say */ } }
  }
  if (cmd === 'info' && a) {
    console.log(JSON.stringify(await readHeader(a, true), null, 2));
    return 0;
  }
  console.error(usage);
  return 2;
}

module.exports = {
  make, makeFile, apply, applyFile, readHeader, parseHeader, nextCut, GEAR,
  HEADER_LEN, MAGIC, CODEC_ZLIB, OpParser, hashFileSync,
};

if (require.main === module) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    console.error('hata: ' + (e && e.message ? e.message : e));
    process.exitCode = 2;
  });
}
