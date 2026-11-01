# Baskı Hesabı

3B baskı maliyet/kâr hesabı ve satış kayıtları. Taşınabilir Windows uygulaması
(tek exe) — arayüz `app/` içindeki düz JS, kabuk `shell-exe/` içindeki Go
programı. Kabuk paketi exe'ye gömer, yerel bir adreste sunar ve Edge/Chrome'u
uygulama kipinde açar.

## Kurallar (Milen)
- Milen "BAŞLA" demeden yeni iş başlatma. Arayüz ve yazışma dili Türkçe.
- Onay sorusu sorma; kararı ver, ne yaptığını söyle.
- Her güncellemede sürüm yükselir (v1.2 → v1.3). Üç yerde birden:
  `app/js/ui.js` içindeki `APP_VERSION`, `shell-exe/main.go` içindeki
  `appVersion`, ve etiket. `araclar/yayinla-github.js` birincisini kendisi yazar.
- Yalnız masaüstü. APK yalnızca Milen isteyince yapılır (`shell-android/`
  kaynağı ayrı pakette duruyor).
- Dosya olarak exe gönderme; güncelleme uygulamanın içinden insin.

## Yayın
Arayüz değiştiyse (`app/` altı), kabuk aynıysa — kullanıcı yeni exe indirmez:

    node araclar/yayinla-github.js --version 1.3 --notes "Neler değişti" --out surum.json
    git add -A && git commit -m "v1.3" && git push

Uygulama her açılışta `surum.json` dosyasına bakar, yeni sürüm varsa üstte şerit
çıkarır, tek tıkla iner ve yeniden açılır.

Kabuk da değiştiyse (`shell-exe/` altı) ayrıca etiket gönder; Actions taşınabilir
exe'yi üretip sürüm sayfasına koyar:

    git tag v1.3 && git push origin v1.3

## Güncelleme kanalı
`app/js/db.js` içindeki `ghOwner`/`ghRepo`/`ghBranch` varsayılanları bu depoyu
gösterir. Kullanıcı Ayarlar'dan değiştirebilir. Depo genel olmalı — uygulama
`raw.githubusercontent.com` üzerinden anahtarsız okur.

## Test
Kabuğu Linux'ta derleyip (`cd shell-exe && cp -r ../app app && go build -o test-linux .`)
çalıştır, yazdığı adrese Playwright ile bağlan. Güncelleme akışı için
`raw.githubusercontent.com` isteğini `page.route` ile karşıla.
