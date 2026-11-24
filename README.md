# Baskı Hesabı

3B yazıcıdan çıkan parçaların maliyetini ve kârını hesaplar, baskı ve satış
kayıtlarını tutar. Windows uygulaması (kullanıcı başına kurulum, yönetici izni gerekmez).

- Filament, elektrik (watt × kWh), işçilik, makine aşınması, başarısız baskı payı
  ve kendi tanımladığın gider kalemleriyle maliyet; üzerine yüzde kâr
- Sonuç dolar, Türk lirası ve Suriye lirası olarak; kurlar çevrimiçi ya da elle
- Baskı ve satış kayıtları: tarih, adet, ödeme durumu, teslim tarihi, fotoğraf,
  STL/gcode eki, baskı notu
- Yazıcı kartları: her yazıcının ürettiği parça, saat, ciro ve kâr
- Eklenip çıkarılabilen, adı değiştirilebilen kategoriler: filament, yazıcı,
  müşteri, parça grubu, gider kalemi
- Filament stok takibi, raporlar ve grafikler, teklif/fiş çıktısı, yedekleme
- Türkçe, İngilizce, Arapça (sağdan sola düzen dahil)
- Uygulama içinden tek tıkla güncelleme (yalnızca değişen kısımlar iner)
- Renk şemaları, açık/koyu tema, yazı boyutu; Admin ile iletişim

**İndir:** [Sürümler](https://github.com/departures-mil/baski-hesabi/releases/latest)
→ `BaskiHesabi-X.Y.Z-win-setup.exe`

Kayıtlar kurulum klasöründeki (`%LOCALAPPDATA%\Programs\BaskiHesabi`) `BaskiHesabi-veri` klasöründe tutulur;
kaldırma onlara dokunmaz. Dışa aktarmalar `BaskiHesabi-ciktilar` klasörüne iner. Eski taşınabilir sürümü
kullandıysanız yeni kurulum ilk açılışta eski kayıtları kendiliğinden taşır (eski klasör silinmez).
