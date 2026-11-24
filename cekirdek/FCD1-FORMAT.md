# FCD1 — Ortak Çekirdek ikili yama (delta) formatı

Sürüm: 1 (2026-11). Durum: kararlı. Bu belge normatiftir; Node, Python, Java (Android) ve
Dart uygulamaları birebir buna uyar. DesktopDuzenSabitleyici'deki `DDSD1` formatının dilden
bağımsız sürümüdür. Tek fark: sıkıştırma Brotli yerine **zlib (DEFLATE)** ve başlıkta bir
codec baytı var.

## 1. Genel yapı

```
+---------+-------+--------+-----------+--------+-----------+---------------------------+
| "FCD1"  | codec | srcLen | srcSha256 | dstLen | dstSha256 | sıkıştırılmış op akışı    |
| 4 bayt  | 1 b.  | 8 b.   | 32 b.     | 8 b.   | 32 b.     | dosya sonuna kadar        |
+---------+-------+--------+-----------+--------+-----------+---------------------------+
 ofset 0    4       5        13          45       53          85
```

| Alan        | Boyut | Açıklama |
|-------------|-------|----------|
| `magic`     | 4     | ASCII `F` `C` `D` `1` = `46 43 44 31` |
| `codec`     | 1     | `0x01` = zlib (RFC 1950: 2 bayt başlık + DEFLATE RFC 1951 + Adler-32). Başka değer → **reddet**. |
| `srcLen`    | 8     | Kaynak (eski, kurulu) dosyanın bayt uzunluğu, **unsigned 64-bit little-endian**. Pratikte < 2^53. |
| `srcSha256` | 32    | Kaynak dosyanın ham SHA-256 özeti (hex değil). |
| `dstLen`    | 8     | Hedef (yeni) dosyanın uzunluğu, u64 LE. |
| `dstSha256` | 32    | Hedef dosyanın ham SHA-256 özeti. |
| gövde       | ...   | Op akışının tek bir zlib akışı halinde sıkıştırılmış hali. |

Başlık sabit **85 bayttır**.

### Neden zlib (Brotli değil)?
Dört istemcinin hepsi zlib'i **ek kütüphane olmadan** açabilir:
Node `zlib`, Python `zlib`, Java/Android `java.util.zip.Inflater`, Dart `dart:io ZLibDecoder`
(ayrıca .NET `System.IO.Compression.ZLibStream`). Brotli Android'de ek bağımlılık ister.
Yamaların büyük kısmı zaten sıkıştırılmış veri (asar içindeki png, APK içindeki dex/zip)
olduğundan Brotli'nin kazancı küçüktür (tipik %3–10). `codec` baytı ileride başka bir
sıkıştırma (ör. `0x02` = Brotli) eklenebilsin diye ayrılmıştır; v1 çözücüler yalnız `0x01`
kabul eder.

## 2. Op akışı (sıkıştırma açıldıktan sonra)

Ardışık op'lardan oluşur. Her op bir tür baytıyla başlar:

| Tür  | Ad      | Gövde | Anlamı |
|------|---------|-------|--------|
| `0x00` | END    | —                         | Akışın sonu. Bundan sonra op gelmez. |
| `0x01` | COPY   | `varint offset`, `varint length` | Kaynak dosyanın `[offset, offset+length)` aralığını çıktıya yaz. |
| `0x02` | INSERT | `varint length`, `length` bayt | Takip eden ham baytları çıktıya yaz. |

Diğer tür baytları → **reddet**.

### varint
İşaretsiz LEB128: her baytın alt 7 biti değer (küçük anlamlı önce), üst bit (0x80) "devamı
var". En çok 9 bayt / 63 bit; daha uzunu → reddet. Örnek: `300` → `AC 02`.

### Kurallar
- COPY: `offset + length <= srcLen` olmalı, değilse reddet. `offset` serbesttir (geri/ileri
  atlayabilir, aynı aralık birden çok kez kopyalanabilir).
- Üreticiler `length = 0` op yazmamalıdır; çözücüler kabul etmelidir (no-op).
- Çıktıya yazılan toplam bayt `dstLen`'i **aşarsa** hemen reddet; END'de toplam `dstLen`'e
  eşit değilse reddet.
- END'den sonra zlib akışı bitmeli. Açılmış veride END'den sonra bayt kalması veya zlib
  akışından sonra dosyada fazladan bayt olması → reddet (çözücüler SHOULD; tüm referans
  uygulamalar MUST olarak uygular).
- END'siz biten akış → reddet.

## 3. Uygulama (apply) algoritması — normatif

1. 85 bayt başlığı oku; `magic` ve `codec` kontrol et.
2. Kaynak dosyanın uzunluğu `srcLen` ve SHA-256'sı `srcSha256` ile **aynı olmalı**; değilse
   hata ("kurulu dosya yamanın kaynağı değil") → istemci tam dosyaya geçer.
3. Op akışını akış halinde aç ve işle; çıktıyı geçici bir dosyaya yaz, yazarken SHA-256 hesapla.
4. Sonda uzunluk `dstLen` ve özet `dstSha256` ile aynı olmalı; değilse geçici dosyayı sil, hata.
5. Ancak bundan sonra geçici dosya yerine taşınır (atomik rename).

Kaynak dosya rastgele erişimle (seek+read) okunabildiği için uygulayıcının belleğe dosya
yüklemesi gerekmez; referans uygulamalar sabit (~1 MB) bellekle çalışır.

## 4. Üretim (make) — bilgilendirici, normatif DEĞİL

Format hangi COPY/INSERT dizisinin yazıldığını şart koşmaz; farklı üreticiler farklı (ama
hepsi geçerli) yamalar üretebilir. Referans üretici (`node/fcdelta.js`, `python/fcdelta.py`):

- **İçerik tanımlı parçalama (CDC), gear hash**: `h = ((h << 1) + GEAR[b]) mod 2^32`;
  `GEAR` tablosu xorshift64 ile üretilir (tohum `0x9E3779B97F4A7C15`, her adımda
  `x^=x<<13; x^=x>>7; x^=x<<17`, alt 32 bit alınır). Parça sınırı: parça uzunluğu ≥ 2 KiB ve
  `(h & 0xFFF80000) == 0` (üst 13 bit → ortalama ~8 KiB), en fazla 64 KiB.
  DDSD1'den fark: 32-bit hash ve üst bitlere maske (JS/Python/Java'da 64-bit gerekmez,
  sınır son ~32 bayta bağlıdır).
- Eski dosyanın parçaları `(uzunluk, SHA-256)` → ofset tablosuna konur.
- Yeni dosyada parça parça ilerlenir; eşleşen parça bayt bayt doğrulanır, sonra eşleşme
  **geriye** (bekleyen INSERT verisine doğru) ve **ileriye** (parça sınırını aşarak) bayt
  düzeyinde uzatılır (DDSD1'e göre iyileştirme: kayan veride daha az INSERT). Ardışık
  COPY'ler birleştirilir. İleri uzatmadan sonra parçalama yeni konumdan yeniden başlar;
  gear hash içerik tanımlı olduğu için sınırlar birkaç parça içinde yeniden hizalanır.
- zlib seviye 9.

## 5. Dosya adları ve manifest

Yama dosyaları release'e `<Önek>-<kanal>.patch-from-<X.Y.Z>.bin` adıyla yüklenir; istemci
adları her zaman `latest.json` → `assets.<kanal>.patches.<X.Y.Z>.file` üzerinden okur (bkz.
SPEC.md). `patches.<X>.sha256` yama dosyasının kendi özetidir; uygulama sonrası doğrulama
başlıktaki `dstSha256` ve manifestteki `assets.<kanal>.sha256` ile yapılır.

## 6. Test vektörü

`srcLen=0` (boş kaynak), hedef `"abc"` için op akışı (açılmış):
`02 03 61 62 63 00`. Başlık: `46 43 44 31 01`, `00×8`,
`e3b0c442…b855` (boş SHA-256), `03 00 00 00 00 00 00 00`, `ba7816bf…15ad` (SHA-256("abc")).
Tam dosyayı `node fcdelta.js make /dev/null abc.txt p.bin` üretir.
