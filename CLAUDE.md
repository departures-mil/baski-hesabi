# Baskı Hesabı

3B baskı maliyet/kâr hesabı ve satış kayıtları. Kurulumlu Windows uygulaması (NSIS, kullanıcı başına) —
arayüz `app/` içindeki düz JS, kabuk `shell-exe/` içindeki Go programı (kabuk 2). Kabuk arayüz paketini
(app.zip) exe'ye gömer, SABİT yerel adreste (`http://127.0.0.1:41731`) sunar ve Edge/Chrome'u uygulama kipinde,
her açılışta tam ekran açar. Ortak çekirdek (departures-mil/ortak-cekirdek) v1.14.0'dan beri gömülü.

## Kurallar (Milen)
- Milen "BAŞLA" demeden yeni iş başlatma. Arayüz ve yazışma dili Türkçe; arayüz üç dilli (tr/en/ar, Arapça RTL).
- Onay sorusu sorma; kararı ver, ne yaptığını söyle.
- Sürüm semver `X.Y.Z`, etiket `vX.Y.Z` (kısaltma YOK). Tek kaynak `package.json`; `node araclar/surum.js X.Y.Z`
  `app/js/ui.js` (APP_VERSION) ve `shell-exe/main.go` (appVersion; CI ayrıca -ldflags ile verir) dosyalarını yazar.
  Notlar elle: `release-notes.json` (latest.json) + `app/js/kabuk.js` → `NEWS`. `npm test` tutarlılığı denetler.
- Yalnız masaüstü, tek bilgisayar: Wi-Fi (LAN) eşitleme YOK (gerekmiyor); bulut eşitleme kullanıcının KENDİ Firebase'iyle.
  APK yalnızca Milen isteyince yapılır (`shell-android/` kaynağı ayrı pakette; bu depoda yok).
- Dosya olarak exe gönderme; güncelleme uygulamanın içinden insin.
- Kullanıcı verisi asla kaybolmaz: veri klasörü `BaskiHesabi-veri` (exe'nin yanında), tarayıcı profili
  `BaskiHesabi-veri/pencere`, kayıtlar bu profilin IndexedDB'sinde `http://127.0.0.1:41731` kökeninde.
  **Port 41731, profil yolu, IndexedDB adı (`baski-hesabi`) DEĞİŞMEZ** — değişirse kayıtlar görünmez olur.

## Ortak çekirdek
- Kopya: `app/cekirdek/` (fc-core.js, css, yazı tipleri) + `cekirdek/` (fcdelta.js, FCD1-FORMAT.md — test vektörleri için).
  Commit `cekirdek/VERSION`'da (ebec004). Çekirdek deposunu buradan değiştirme.
- Yapıştırıcı `app/js/kabuk.js`: üst çubuk (Duyurular · ✦ Agent · Eşitle · Güncelle · Tema · Dil | Küçült · Orta · Tam ekran ·
  Kapat), `klasik` şeması (v1.13'e kadarki koyu renkler), dil köprüsü (I18N ↔ FC.i18n), ayarlar (`FC.settings.build`;
  Admin ile iletişim EN SON), Kullanım Limitleri (`{firebase:true, ai:false}`), ilk açılış rehberi, "neler yeni", güncelleme,
  eski oturum kurtarma, eski kabuk köprüsü.
- Kabuk köprüsü: Go kabuğu `/__shell/host.js` ile `window.fcHost`'u kurar (`shell-exe/hostjs.go`); çekirdek bunu masaüstü
  kabuğu olarak tanır. Pencere düğmeleri `/__shell/pencere/*` → Windows API (`win.go`: pencere sayfa başlığındaki bir kerelik
  izle bulunur; tam ekran = Chromium F11 tam ekranı, Orta = çalışma alanının %50×%50'si).
  **Neden WebView2 değil:** kayıtlar Edge profilinin IndexedDB'sinde; WebView2 ayrı bir profil/depolama kullanır, geçiş veri
  kaybı riski taşırdı. Edge --app aynı profili kullanmaya devam eder, ek DLL/CGO gerekmez.

## Güncelleme ve yayın
- Yalnız GitHub Releases + `latest.json` (çekirdek `FC.updater`, açılışta + 6 saatte bir; Ayarlar → "Her açılışta denetle").
  Kanallar: `win-app` = arayüz paketi `BaskiHesabi-X.Y.Z-win-app.zip` (FCD1 yama ya da tam dosya; kabuk SHA-256 doğrular,
  `BaskiHesabi-veri/paket/app.zip`'e atomik yazar, sayfa yenilenir), `win-setup` = NSIS kurulum `BaskiHesabi-Setup-X.Y.Z.exe` (duyurular indirme sayfası bu adı listeler)
  (kabuk değiştiğinde: `minVersion` yükseltin → istemci kurulumu indirir, doğrular, çalıştırır).
  Kabuk (Go) değişikliği eski kurulumlara yalnız win-setup ile gider; arayüz yeni kabuk ucu kullanıyorsa `min_version` verin.
- CI `.github/workflows/release.yml`: test (ubuntu: Node + Go + Chromium) → build (windows-latest: app.zip, exe [rsrc simgesi],
  NSIS, Windows duman testi) → ortak `reusable-release.yml` (latest.json, son 5 sürümden FCD1 yamaları).
  Entegrasyon dalları (`ortak-cekirdek-*`) yalnız test + derleme. Yayın main'de:
  `gh api -X POST repos/departures-mil/baski-hesabi/actions/workflows/release.yml/dispatches -f ref=main`
  (ya da `git tag vX.Y.Z && git push --tags`).
- `kurulum.yml` (başka oturumun eklediği, surum.json'a bağlı eski kurulum üretimi; v1.13 sürümünü o yaptı) v1.14.0'da
  kaldırıldı: kurulum artık release.yml'in win-setup kanalı. `kurulum/kurulum.nsi` (genel betik) duruyor, kullanılmıyor.
- ESKİ KANAL KÖPRÜSÜ (kabuk 1.x taşınabilir exe, v1.13 ve öncesi): bunlar depo kökündeki `surum-ozet.json`/`surum.json`'u
  (raw, imzasız) okur ve yalnız arayüzü değiştirir. Her release'ten SONRA: `node araclar/eski-kanal.js` → surum.json +
  surum-ozet.json → commit + push (main). Eski kabukta yeni arayüz "Yeni kurulum gerekli" der ve kurulumu indirtir; yeni
  kurulum ilk açılışta eski taşınabilir klasörü bulur ve tarayıcı profilini kopyalar (`shell-exe/migrate.go`, eski klasör
  silinmez). Eski kabuğun JSON güncelleme ucu yeni kabukta kapalı (410).

## Veri kurtarma (v1.14.0)
Kabuk 1 her açılışta RASTGELE port kullanıyordu → her oturumun kayıtları profilde ayrı bir kökende kaldı
(`pencere/Default/IndexedDB/http_127.0.0.1_<port>.indexeddb.leveldb`). Kabuk 2 açılışta henüz birleştirilmemiş eski
kökenleri o portlarda geçici bir okuma sayfasıyla açar (aynı site → aynı depolama), arayüz (`app/js/kurtarma.js`)
birleştirir: eksik eklenir, çakışmada yeni kalır, eskisi `cakismalar` deposuna; ilk açılış örnek kategorileri çoğaltılmaz.
Birleştirilen portlar `BaskiHesabi-veri/kurtarilan.json`'da. Eski klasörler silinmez.
Firebase eşitlemesi de aynı kural: ezilen/uzakta silinen yerel kayıt `cakismalar`'a (Ayarlar → Arşiv ve çakışma yedekleri).

## Test
- `npm test`: `test/app.test.js` (sürüm, çekirdek, paket, kurtarma kuralı, çeviriler) + `test/kabuk.test.js` (go vet/test —
  FCD1 Go uygulayıcısı Node üreticisinin vektörleriyle; gerçek kabuk: yama/tam/bozuk yama/kurulum kanalı, pencere API'si,
  köken denetimi; Chromium: eski oturum kurtarma, taşınabilir → kurulum taşıması, eski kabuk 1.5 köprüsü — git f1c59bc'den derlenir).
  Playwright: `PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm test`.
- Ekran görüntüleri: aynı ortamla `node araclar/ekran.js <klasör>` (gerçek kabuk, Linux derlemesi, pencere açmaz).
- Kabuğu elle: `node araclar/paket.js && cd shell-exe && go build -o /tmp/bh . && BASKI_PENCERE_YOK=1 BASKI_VERI=/tmp/v /tmp/bh`
  (ortam: BASKI_PORT, BASKI_VERI, BASKI_CIKTI, BASKI_TASIMA_YOK, BASKI_ESKI_ARA).
- FCD1 vektörleri: `node araclar/fcd1-vektor.js` → `shell-exe/fcd1/testdata/`.
