/* Üç dilin sözlüğü. Yeni anahtar eklerken üç dile birden ekle. */
const I18N = {

tr: {
  _name: "Türkçe", _dir: "ltr", _locale: "tr-TR",

  app: "Baskı Hesabı",
  nav_calc: "Hesapla", nav_records: "Kayıtlar", nav_printers: "Yazıcılar",
  nav_cats: "Kategoriler", nav_stock: "Stok", nav_reports: "Raporlar", nav_settings: "Ayarlar",

  /* hesap */
  calc_title: "Maliyet ve kâr hesabı",
  calc_sub: "Hesap dolar üzerinden yapılır; sonuç üç para biriminde gösterilir.",
  material: "Malzeme", filament: "Filament", filament_price: "Filament fiyatı",
  per_kg: "/ kg", grams: "gram", part_weight: "Parça ağırlığı",
  electricity: "Elektrik", printer: "Yazıcı", printer_power: "Yazıcı gücü",
  watt: "watt", kwh_price: "Elektrik birim fiyatı", per_kwh: "/ kWh",
  hourly_power: "Saatlik elektrik gideri",
  duration: "Baskı süresi", hours: "saat", minutes: "dakika", h_short: "sa", m_short: "dk",
  profit: "Kâr", profit_rate: "Kâr oranı",
  labor: "İşçilik", labor_rate: "Saatlik işçilik ücreti", labor_time: "Harcanan süre",
  wear: "Makine aşınması", machine_price: "Yazıcının fiyatı", machine_life: "Tahmini ömrü",
  fail: "Başarısız baskı payı", fail_rate: "Fire oranı",
  fail_hint: "diğer kalemlerin üzerine",
  extras: "Ek giderler", extra_cost: "Ek gider",
  qty: "Adet",
  sale_price: "Satış fiyatı", unit_cost: "Parça maliyeti",
  cost_per_gram: "Gram başına maliyet", total_time: "Toplam baskı süresi",
  total_for_qty: "{n} adet için toplam",
  calc_note: "Maliyet = filament + elektrik + işaretlenen ek kalemler. Kâr, bu maliyetin üzerine yüzde olarak eklenir.",
  save_record: "Kayda geç", reset_form: "Formu temizle",

  /* kayıtlar */
  records_title: "Baskı ve satış kayıtları",
  new_record: "Yeni kayıt", edit_record: "Kaydı düzenle",
  part_name: "Parça adı", customer: "Müşteri", group: "Parça grubu",
  date: "Tarih", delivery_date: "Teslim tarihi",
  payment: "Ödeme durumu", pay_paid: "Ödendi", pay_pending: "Bekliyor",
  pay_deposit: "Kapora", pay_cancelled: "İptal",
  photo: "Fotoğraf", attachment: "Dosya eki (STL / gcode)",
  note: "Baskı notu", layer_h: "Katman yüksekliği", infill: "Doluluk oranı",
  failed: "Başarısız oldu", fail_reason: "Başarısızlık nedeni",
  no_records: "Henüz kayıt yok. İlk baskını hesaplayıp kaydet.",
  search: "Ara", all: "Hepsi", filter_from: "Başlangıç", filter_to: "Bitiş",
  revenue: "Ciro", total_profit: "Toplam kâr", total_cost: "Toplam maliyet",
  count_prints: "Baskı sayısı",
  delete_confirm: "Bu kayıt silinsin mi?",

  /* yazıcılar */
  printers_title: "Yazıcılar",
  printers_sub: "Her yazıcının ürettiği ve sattığı kayıtlar ayrı tutulur.",
  printer_name: "Yazıcı adı", add_printer: "Yazıcı ekle",
  produced: "Ürettiği parça", print_hours: "Baskı saati",
  earned: "Ürettiği ciro", printer_profit: "Kazandırdığı kâr",
  filament_used: "Harcadığı filament", fail_count: "Başarısız baskı",
  no_printer_records: "Bu yazıcıyla henüz baskı kaydı yok.",

  /* kategoriler */
  cats_title: "Kategoriler",
  cats_sub: "Her listeye ekleme, çıkarma ve ad değiştirme yapabilirsin.",
  cat_filaments: "Filament / malzeme türleri", cat_printers: "Yazıcılar",
  cat_customers: "Müşteriler", cat_groups: "Parça grupları",
  cat_expenses: "Gider kalemleri",
  add: "Ekle", edit: "Düzenle", rename: "Adını değiştir", remove: "Çıkar",
  name: "Ad", color: "Renk", price: "Fiyat", note_field: "Not",
  phone: "Telefon", in_use_warn: "Bu kalem {n} kayıtta kullanılıyor; çıkarırsan kayıtlar adını saklar.",
  empty_list: "Liste boş.",

  /* stok */
  stock_title: "Filament stoğu",
  stock_sub: "Baskı kaydedildikçe kullanılan gram makaradan düşülür.",
  spool: "Makara", remaining: "Kalan", initial: "Başlangıç",
  add_spool: "Makara ekle", low_stock: "Azaldı", low_at: "Uyarı eşiği",
  restock: "Dolum ekle", spent: "Harcanan",
  stock_empty: "Kayıtlı makara yok.",

  /* raporlar */
  reports_title: "Raporlar",
  monthly: "Aylık", by_printer: "Yazıcıya göre", by_customer: "Müşteriye göre",
  by_filament: "Filamente göre", top_parts: "En çok basılan parçalar",
  period: "Dönem", last_12: "Son 12 ay", this_year: "Bu yıl", all_time: "Tümü",
  no_data: "Bu dönem için veri yok.",
  export_excel: "Excel'e aktar", print_quote: "Teklif / fiş çıktısı",
  quote_title: "Fiyat teklifi", receipt_title: "Satış fişi",

  /* ayarlar */
  settings_title: "Ayarlar",
  language: "Dil", appearance: "Görünüm",
  fullscreen_start: "Açılışta tam ekran", window_mode: "Pencere görünümü",
  rates: "Döviz kurları", rate_try: "1 USD karşılığı TRY", rate_syp: "1 USD karşılığı SYP",
  fetch_rates: "Kurları çevrimiçi al", auto_rates: "Açılışta kurları otomatik güncelle",
  rates_manual: "Kurlar elle girildi.", rates_fetching: "Kurlar alınıyor…",
  rates_ok: "Güncellendi: {time} — {src}",
  rates_fail: "Çevrimiçi alınamadı. Elle girilen kurlar kullanılıyor.",
  syp_note: "SYP, iki sıfır atılmış yeni Suriye lirasıdır. Çevrimiçi değer resmî kurdur; serbest piyasa farklıysa elle yaz.",

  defaults: "Varsayılan ayarlar",
  defaults_sub: "Yeni hesap bu değerlerle açılır.",
  def_filament: "Öntanımlı filament", def_printer: "Öntanımlı yazıcı",
  def_margin: "Öntanımlı kâr oranı", def_currency: "Öne çıkan para birimi",
  def_labor: "İşçilik varsayılan açık", def_wear: "Aşınma varsayılan açık",
  def_fail: "Fire payı varsayılan açık",
  restore_defaults: "Fabrika ayarlarına dön",
  restore_confirm: "Tüm ayarlar fabrika değerlerine dönsün mü? Kayıtlar silinmez.",

  sync: "Firebase eşitleme", sync_status: "Durum",
  sync_on: "Eşitleme açık", sync_off: "Eşitleme kapalı",
  sync_now: "Şimdi eşitle", sync_last: "Son eşitleme: {time}",
  sync_never: "Henüz eşitlenmedi", sync_working: "Eşitleniyor…",
  sync_done: "Eşitlendi: {n} kayıt", sync_error: "Eşitlenemedi: {msg}",
  fb_config: "Firebase yapılandırması",
  fb_config_hint: "Firebase konsolundan aldığın web yapılandırmasını buraya yapıştır.",
  fb_paste: "Yapılandırmayı yapıştır", fb_save: "Kaydet ve bağlan",
  fb_missing: "Firebase yapılandırması girilmedi. Uygulama çevrimdışı çalışıyor, kayıtlar cihazda tutuluyor.",
  fb_ok: "Bağlandı: {id}",

  updates: "Güncelleme", current_version: "Yüklü sürüm",
  up_channel: "Güncelleme kaynağı (GitHub)",
  up_channel_hint: "kullanıcı/depo biçiminde genel bir GitHub deposu. Depodaki surum.json okunur.",
  up_branch: "Dal",
  up_no_channel: "Güncelleme kaynağı girilmedi.",
  up_bad_manifest: "Kaynaktaki sürüm dosyası okunamadı.",
  update_on_open: "Her açılışta denetle",
  update_checking: "Denetleniyor…",
  update_last_check: "Son denetim: {time}",
  update_never_checked: "Henüz denetlenmedi",
  update_banner: "Yeni sürüm hazır: v{v}",
  update_later: "Sonra",
  whats_new: "Neler değişti",
  update_applied: "v{v} yüklendi.",
  update_need_fb: "Denetim için önce Firebase yapılandırması gerekir.",
  check_update: "Güncellemeyi denetle", update_now: "Güncelle",
  up_to_date: "Uygulama güncel.", update_found: "Yeni sürüm hazır: {v}",
  update_applying: "Güncelleniyor…", update_done: "Güncellendi. Uygulama yeniden açılıyor.",
  update_fail: "Güncelleme alınamadı: {msg}",

  backup: "Yedekleme", export_backup: "Yedek dosyası al",
  import_backup: "Yedekten geri yükle",
  import_confirm: "Yedekteki veriler şimdikilerin üzerine yazılsın mı?",
  backup_done: "Yedek alındı.", import_done: "Geri yüklendi: {n} kayıt.",

  /* ortak */
  save: "Kaydet", cancel: "Vazgeç", close: "Kapat", yes: "Evet", no: "Hayır",
  ok: "Tamam", none: "Yok", optional: "isteğe bağlı", total: "Toplam",
  select: "Seç", required: "Bu alan gerekli.", saved: "Kaydedildi.",
  deleted: "Silindi.", nothing_to_export: "Aktarılacak kayıt yok.",
  pick_file: "Dosya seç", clear: "Temizle",
  months: ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]
},

en: {
  _name: "English", _dir: "ltr", _locale: "en-US",

  app: "Print Cost",
  nav_calc: "Calculate", nav_records: "Records", nav_printers: "Printers",
  nav_cats: "Categories", nav_stock: "Stock", nav_reports: "Reports", nav_settings: "Settings",

  calc_title: "Cost and profit",
  calc_sub: "Everything is calculated in dollars and shown in three currencies.",
  material: "Material", filament: "Filament", filament_price: "Filament price",
  per_kg: "/ kg", grams: "grams", part_weight: "Part weight",
  electricity: "Electricity", printer: "Printer", printer_power: "Printer power",
  watt: "watts", kwh_price: "Electricity unit price", per_kwh: "/ kWh",
  hourly_power: "Electricity per hour",
  duration: "Print time", hours: "hours", minutes: "minutes", h_short: "h", m_short: "min",
  profit: "Profit", profit_rate: "Profit margin",
  labor: "Labor", labor_rate: "Hourly labor rate", labor_time: "Time spent",
  wear: "Machine wear", machine_price: "Printer price", machine_life: "Expected life",
  fail: "Failed print allowance", fail_rate: "Failure rate",
  fail_hint: "on top of the other items",
  extras: "Extra costs", extra_cost: "Extra cost",
  qty: "Quantity",
  sale_price: "Sale price", unit_cost: "Unit cost",
  cost_per_gram: "Cost per gram", total_time: "Total print time",
  total_for_qty: "Total for {n}",
  calc_note: "Cost = filament + electricity + the items you tick. Profit is added on top as a percentage.",
  save_record: "Save as record", reset_form: "Clear form",

  records_title: "Print and sales records",
  new_record: "New record", edit_record: "Edit record",
  part_name: "Part name", customer: "Customer", group: "Part group",
  date: "Date", delivery_date: "Delivery date",
  payment: "Payment", pay_paid: "Paid", pay_pending: "Pending",
  pay_deposit: "Deposit", pay_cancelled: "Cancelled",
  photo: "Photo", attachment: "Attachment (STL / gcode)",
  note: "Print note", layer_h: "Layer height", infill: "Infill",
  failed: "Print failed", fail_reason: "Reason",
  no_records: "No records yet. Calculate a print and save it.",
  search: "Search", all: "All", filter_from: "From", filter_to: "To",
  revenue: "Revenue", total_profit: "Total profit", total_cost: "Total cost",
  count_prints: "Prints",
  delete_confirm: "Delete this record?",

  printers_title: "Printers",
  printers_sub: "Each printer keeps its own production and sales history.",
  printer_name: "Printer name", add_printer: "Add printer",
  produced: "Parts produced", print_hours: "Hours printed",
  earned: "Revenue produced", printer_profit: "Profit earned",
  filament_used: "Filament used", fail_count: "Failed prints",
  no_printer_records: "No prints recorded on this printer yet.",

  cats_title: "Categories",
  cats_sub: "Add, remove and rename anything in these lists.",
  cat_filaments: "Filament / material types", cat_printers: "Printers",
  cat_customers: "Customers", cat_groups: "Part groups",
  cat_expenses: "Expense items",
  add: "Add", edit: "Edit", rename: "Rename", remove: "Remove",
  name: "Name", color: "Color", price: "Price", note_field: "Note",
  phone: "Phone", in_use_warn: "Used in {n} records; removing it keeps the name on them.",
  empty_list: "The list is empty.",

  stock_title: "Filament stock",
  stock_sub: "Grams used are deducted from the spool as records are saved.",
  spool: "Spool", remaining: "Remaining", initial: "Initial",
  add_spool: "Add spool", low_stock: "Low", low_at: "Warn below",
  restock: "Add refill", spent: "Used",
  stock_empty: "No spools on file.",

  reports_title: "Reports",
  monthly: "Monthly", by_printer: "By printer", by_customer: "By customer",
  by_filament: "By filament", top_parts: "Most printed parts",
  period: "Period", last_12: "Last 12 months", this_year: "This year", all_time: "All time",
  no_data: "No data for this period.",
  export_excel: "Export to Excel", print_quote: "Quote / receipt",
  quote_title: "Price quote", receipt_title: "Sales receipt",

  settings_title: "Settings",
  language: "Language", appearance: "Appearance",
  fullscreen_start: "Start full screen", window_mode: "Windowed",
  rates: "Exchange rates", rate_try: "1 USD in TRY", rate_syp: "1 USD in SYP",
  fetch_rates: "Fetch rates online", auto_rates: "Update rates on startup",
  rates_manual: "Rates entered by hand.", rates_fetching: "Fetching rates…",
  rates_ok: "Updated: {time} — {src}",
  rates_fail: "Could not fetch. Using the rates you entered.",
  syp_note: "SYP is the new Syrian pound, two zeros removed. The online value is the official rate; type the market rate if it differs.",

  defaults: "Default settings",
  defaults_sub: "A new calculation opens with these values.",
  def_filament: "Default filament", def_printer: "Default printer",
  def_margin: "Default profit margin", def_currency: "Primary currency",
  def_labor: "Labor on by default", def_wear: "Wear on by default",
  def_fail: "Failure allowance on by default",
  restore_defaults: "Restore factory settings",
  restore_confirm: "Reset all settings to factory values? Records are kept.",

  sync: "Firebase sync", sync_status: "Status",
  sync_on: "Sync is on", sync_off: "Sync is off",
  sync_now: "Sync now", sync_last: "Last sync: {time}",
  sync_never: "Not synced yet", sync_working: "Syncing…",
  sync_done: "Synced {n} records", sync_error: "Sync failed: {msg}",
  fb_config: "Firebase configuration",
  fb_config_hint: "Paste the web config from your Firebase console here.",
  fb_paste: "Paste configuration", fb_save: "Save and connect",
  fb_missing: "No Firebase configuration. The app runs offline and keeps records on this device.",
  fb_ok: "Connected: {id}",

  updates: "Updates", current_version: "Installed version",
  up_channel: "Update source (GitHub)",
  up_channel_hint: "A public GitHub repository as owner/repo. Its surum.json is read.",
  up_branch: "Branch",
  up_no_channel: "No update source set.",
  up_bad_manifest: "The version file at the source could not be read.",
  update_on_open: "Check on every launch",
  update_checking: "Checking…",
  update_last_check: "Last check: {time}",
  update_never_checked: "Not checked yet",
  update_banner: "New version ready: v{v}",
  update_later: "Later",
  whats_new: "What changed",
  update_applied: "v{v} installed.",
  update_need_fb: "Checking needs a Firebase configuration first.",
  check_update: "Check for updates", update_now: "Update",
  up_to_date: "The app is up to date.", update_found: "New version ready: {v}",
  update_applying: "Updating…", update_done: "Updated. Restarting the app.",
  update_fail: "Update failed: {msg}",

  backup: "Backup", export_backup: "Save a backup file",
  import_backup: "Restore from backup",
  import_confirm: "Overwrite current data with the backup?",
  backup_done: "Backup saved.", import_done: "Restored {n} records.",

  save: "Save", cancel: "Cancel", close: "Close", yes: "Yes", no: "No",
  ok: "OK", none: "None", optional: "optional", total: "Total",
  select: "Select", required: "This field is required.", saved: "Saved.",
  deleted: "Deleted.", nothing_to_export: "Nothing to export.",
  pick_file: "Choose file", clear: "Clear",
  months: ["January","February","March","April","May","June","July","August","September","October","November","December"]
},

ar: {
  _name: "العربية", _dir: "rtl", _locale: "ar",

  app: "حاسبة الطباعة",
  nav_calc: "الحساب", nav_records: "السجلات", nav_printers: "الطابعات",
  nav_cats: "الفئات", nav_stock: "المخزون", nav_reports: "التقارير", nav_settings: "الإعدادات",

  calc_title: "حساب التكلفة والربح",
  calc_sub: "يجري الحساب بالدولار ويُعرض بثلاث عملات.",
  material: "المادة", filament: "الفيلامنت", filament_price: "سعر الفيلامنت",
  per_kg: "/ كغ", grams: "غرام", part_weight: "وزن القطعة",
  electricity: "الكهرباء", printer: "الطابعة", printer_power: "استهلاك الطابعة",
  watt: "واط", kwh_price: "سعر الكهرباء", per_kwh: "/ ك.و.س",
  hourly_power: "تكلفة الكهرباء في الساعة",
  duration: "مدة الطباعة", hours: "ساعة", minutes: "دقيقة", h_short: "س", m_short: "د",
  profit: "الربح", profit_rate: "نسبة الربح",
  labor: "أجرة العمل", labor_rate: "أجرة الساعة", labor_time: "الوقت المستغرق",
  wear: "استهلاك الآلة", machine_price: "سعر الطابعة", machine_life: "العمر المتوقع",
  fail: "حصة الطباعة الفاشلة", fail_rate: "نسبة الفاقد",
  fail_hint: "تُضاف فوق باقي البنود",
  extras: "مصاريف إضافية", extra_cost: "مصروف إضافي",
  qty: "العدد",
  sale_price: "سعر البيع", unit_cost: "تكلفة القطعة",
  cost_per_gram: "التكلفة لكل غرام", total_time: "إجمالي وقت الطباعة",
  total_for_qty: "الإجمالي لـ {n}",
  calc_note: "التكلفة = الفيلامنت + الكهرباء + البنود المحددة. تُضاف نسبة الربح فوق هذه التكلفة.",
  save_record: "حفظ كسجل", reset_form: "تفريغ النموذج",

  records_title: "سجلات الطباعة والمبيعات",
  new_record: "سجل جديد", edit_record: "تعديل السجل",
  part_name: "اسم القطعة", customer: "الزبون", group: "مجموعة القطع",
  date: "التاريخ", delivery_date: "تاريخ التسليم",
  payment: "حالة الدفع", pay_paid: "مدفوع", pay_pending: "معلّق",
  pay_deposit: "عربون", pay_cancelled: "ملغى",
  photo: "صورة", attachment: "ملف مرفق (STL / gcode)",
  note: "ملاحظة الطباعة", layer_h: "ارتفاع الطبقة", infill: "نسبة التعبئة",
  failed: "فشلت الطباعة", fail_reason: "سبب الفشل",
  no_records: "لا توجد سجلات بعد. احسب أول طباعة واحفظها.",
  search: "بحث", all: "الكل", filter_from: "من", filter_to: "إلى",
  revenue: "الإيراد", total_profit: "إجمالي الربح", total_cost: "إجمالي التكلفة",
  count_prints: "عدد الطباعات",
  delete_confirm: "هل تريد حذف هذا السجل؟",

  printers_title: "الطابعات",
  printers_sub: "لكل طابعة سجل إنتاجها ومبيعاتها على حدة.",
  printer_name: "اسم الطابعة", add_printer: "إضافة طابعة",
  produced: "القطع المنتجة", print_hours: "ساعات الطباعة",
  earned: "الإيراد المحقق", printer_profit: "الربح المحقق",
  filament_used: "الفيلامنت المستهلك", fail_count: "طباعات فاشلة",
  no_printer_records: "لا توجد سجلات على هذه الطابعة بعد.",

  cats_title: "الفئات",
  cats_sub: "يمكنك الإضافة والحذف وتغيير الأسماء في كل قائمة.",
  cat_filaments: "أنواع الفيلامنت والمواد", cat_printers: "الطابعات",
  cat_customers: "الزبائن", cat_groups: "مجموعات القطع",
  cat_expenses: "بنود المصاريف",
  add: "إضافة", edit: "تعديل", rename: "تغيير الاسم", remove: "حذف",
  name: "الاسم", color: "اللون", price: "السعر", note_field: "ملاحظة",
  phone: "الهاتف", in_use_warn: "مستخدم في {n} سجلًا؛ عند الحذف يبقى الاسم في السجلات.",
  empty_list: "القائمة فارغة.",

  stock_title: "مخزون الفيلامنت",
  stock_sub: "يُخصم الغرام المستهلك من البكرة مع كل سجل يُحفظ.",
  spool: "بكرة", remaining: "المتبقي", initial: "الكمية الأولية",
  add_spool: "إضافة بكرة", low_stock: "منخفض", low_at: "حد التنبيه",
  restock: "إضافة كمية", spent: "المستهلك",
  stock_empty: "لا توجد بكرات مسجلة.",

  reports_title: "التقارير",
  monthly: "شهري", by_printer: "حسب الطابعة", by_customer: "حسب الزبون",
  by_filament: "حسب الفيلامنت", top_parts: "أكثر القطع طباعة",
  period: "الفترة", last_12: "آخر 12 شهرًا", this_year: "هذه السنة", all_time: "الكل",
  no_data: "لا توجد بيانات لهذه الفترة.",
  export_excel: "تصدير إلى Excel", print_quote: "عرض سعر / إيصال",
  quote_title: "عرض سعر", receipt_title: "إيصال بيع",

  settings_title: "الإعدادات",
  language: "اللغة", appearance: "المظهر",
  fullscreen_start: "فتح بملء الشاشة", window_mode: "وضع النافذة",
  rates: "أسعار الصرف", rate_try: "الدولار مقابل الليرة التركية", rate_syp: "الدولار مقابل الليرة السورية",
  fetch_rates: "جلب الأسعار من الإنترنت", auto_rates: "تحديث الأسعار عند الفتح",
  rates_manual: "الأسعار مُدخلة يدويًا.", rates_fetching: "يجري جلب الأسعار…",
  rates_ok: "حُدِّثت: {time} — {src}",
  rates_fail: "تعذّر الجلب. سيجري استخدام الأسعار المُدخلة يدويًا.",
  syp_note: "الليرة السورية الجديدة بعد حذف صفرين. القيمة المجلوبة هي السعر الرسمي؛ اكتب سعر السوق إن اختلف.",

  defaults: "الإعدادات الافتراضية",
  defaults_sub: "يُفتح كل حساب جديد بهذه القيم.",
  def_filament: "الفيلامنت الافتراضي", def_printer: "الطابعة الافتراضية",
  def_margin: "نسبة الربح الافتراضية", def_currency: "العملة الأساسية",
  def_labor: "تفعيل أجرة العمل افتراضيًا", def_wear: "تفعيل الاستهلاك افتراضيًا",
  def_fail: "تفعيل حصة الفاقد افتراضيًا",
  restore_defaults: "استعادة الإعدادات الأصلية",
  restore_confirm: "هل تعيد كل الإعدادات إلى قيم المصنع؟ لن تُحذف السجلات.",

  sync: "مزامنة Firebase", sync_status: "الحالة",
  sync_on: "المزامنة مفعّلة", sync_off: "المزامنة متوقفة",
  sync_now: "زامن الآن", sync_last: "آخر مزامنة: {time}",
  sync_never: "لم تجرِ مزامنة بعد", sync_working: "جارٍ المزامنة…",
  sync_done: "تمت مزامنة {n} سجلًا", sync_error: "فشلت المزامنة: {msg}",
  fb_config: "إعداد Firebase",
  fb_config_hint: "الصق هنا إعداد الويب من لوحة Firebase.",
  fb_paste: "لصق الإعداد", fb_save: "حفظ واتصال",
  fb_missing: "لم يُدخل إعداد Firebase. يعمل التطبيق دون اتصال وتُحفظ السجلات على الجهاز.",
  fb_ok: "متصل: {id}",

  updates: "التحديث", current_version: "النسخة المثبتة",
  up_channel: "مصدر التحديث (GitHub)",
  up_channel_hint: "مستودع عام على GitHub بصيغة المالك/المستودع. يُقرأ منه ملف surum.json.",
  up_branch: "الفرع",
  up_no_channel: "لم يُحدَّد مصدر التحديث.",
  up_bad_manifest: "تعذّر قراءة ملف النسخة من المصدر.",
  update_on_open: "التحقق عند كل فتح",
  update_checking: "جارٍ التحقق…",
  update_last_check: "آخر تحقق: {time}",
  update_never_checked: "لم يجرِ التحقق بعد",
  update_banner: "نسخة جديدة جاهزة: v{v}",
  update_later: "لاحقًا",
  whats_new: "ما الذي تغيّر",
  update_applied: "جرى تثبيت v{v}.",
  update_need_fb: "يحتاج التحقق إلى إعداد Firebase أولًا.",
  check_update: "التحقق من التحديثات", update_now: "تحديث",
  up_to_date: "التطبيق محدَّث.", update_found: "نسخة جديدة جاهزة: {v}",
  update_applying: "جارٍ التحديث…", update_done: "تم التحديث. يُعاد فتح التطبيق.",
  update_fail: "تعذّر التحديث: {msg}",

  backup: "النسخ الاحتياطي", export_backup: "حفظ نسخة احتياطية",
  import_backup: "الاستعادة من نسخة",
  import_confirm: "هل تُكتب بيانات النسخة فوق البيانات الحالية؟",
  backup_done: "حُفظت النسخة.", import_done: "استُعيد {n} سجلًا.",

  save: "حفظ", cancel: "إلغاء", close: "إغلاق", yes: "نعم", no: "لا",
  ok: "موافق", none: "لا شيء", optional: "اختياري", total: "الإجمالي",
  select: "اختر", required: "هذا الحقل مطلوب.", saved: "حُفظ.",
  deleted: "حُذف.", nothing_to_export: "لا توجد بيانات للتصدير.",
  pick_file: "اختيار ملف", clear: "تفريغ",
  months: ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران","تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"]
}

};

let LANG = "tr";

function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.tr[key] ?? key;
  if (vars && typeof s === "string") {
    for (const k in vars) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
  }
  return s;
}

function setLang(code) {
  if (!I18N[code]) code = "tr";
  LANG = code;
  const d = document.documentElement;
  d.lang = code;
  d.dir = I18N[code]._dir;
  applyI18n();
}

/* data-i18n taşıyan her düğümü yeniden yazar */
function applyI18n(root) {
  (root || document).querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  (root || document).querySelectorAll("[data-i18n-ph]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  (root || document).querySelectorAll("[data-i18n-title]").forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.title = t("app") + " " + (window.APP_VERSION || "");
}

window.I18N = I18N; window.t = t; window.setLang = setLang; window.applyI18n = applyI18n;
Object.defineProperty(window, "LANG", { get: () => LANG });
