/* Baskı Hesabı — ortak çekirdek kabuğu (app/cekirdek/fc-core.js, ortak-cekirdek ebec004).
   Burada: sağ üst sıra (Duyurular · ✦ Agent · Eşitle · Güncelle · Tema · Dil | Küçült · Orta · Tam ekran · Kapat),
   "klasik" renk şeması (v1.13'e kadarki koyu görünüm), dil köprüsü (uygulama I18N ↔ FC.i18n), ayarlar düzeni
   (Admin ile iletişim EN SON), Kullanım Limitleri (kullanıcının kendi Firebase'i; AI yok), ilk açılış rehberi,
   "neler yeni", güncelleme (GitHub Releases + latest.json: win-app = arayüz paketi app.zip, FCD1 yama; minVersion
   altı → win-setup), eski oturum kayıtlarının kurtarılması ve ESKİ KABUK KÖPRÜSÜ:

   - Kabuk 2 (Go, v1.14.0+): /__shell/host.js window.fcHost'u kurar (shell:'go') → pencere düğmeleri, tek tuşla güncelleme.
   - Eski kabuk 1.x (taşınabilir exe): eski güncelleyici bu arayüzü surum.json'dan BaskiHesabi-veri/app'e yazar ve
     eski kabuk sunar (fcHost yok, /__shell/info var). Burada "Yeni kurulum gerekli" penceresi: kurulum programını
     indirme bağlantısı. Yeni kurulum ilk açılışta eski klasördeki kayıtları kendiliğinden taşır (kabuk: migrate.go).
   - Düz tarayıcı / eski Android kabuğu: çekirdek tarayıcı kipi (Güncelle → Sürümler sayfası).
   Bu dosya ui.js'ten ÖNCE yüklenir; ui.js'in işlevlerine (DB, S, render, doSync…) yalnız çağrı anında erişir. */
(function () {
  'use strict';
  var OWNER = 'departures-mil', REPO = 'baski-hesabi', APP = 'baski-hesabi', PREFIX = 'BaskiHesabi';
  var H = window.fcHost || null;
  var NEW = !!(H && H.shell === 'go');
  var ui = FC.ui;
  var tb = null, syncState = 'off';
  function V() { return String(window.APP_VERSION || '0.0.0'); }
  function legacy() { return !NEW && !!(window.shell && window.shell.kind === 'desktop'); }

  /* ---------- "klasik" şema: v1.13'e kadarki app.css renkleri (yalnız koyu vardı) ---------- */
  FC.look.registerScheme('klasik', {
    label: { tr: 'Klasik (eski görünüm)', en: 'Classic (previous look)', ar: 'الكلاسيكي (المظهر السابق)' },
    dark: {
      '--bg': '#111A20', '--bg-grid': '#ffffff05', '--panel': '#18242C', '--panel-solid': '#18242C', '--panel-hover': '#1E2D36',
      '--border': '#2B3E49', '--border-strong': '#375060', '--border-w': '1px', '--text': '#E8F1F4', '--muted': '#8FA5B1', '--label': '#B5C6CF',
      '--nav-text': '#8FA5B1', '--nav-title': '#6C8695', '--accent': '#45C8BE', '--accent-2': '#6C9BF0', '--on-accent': '#0B1518',
      '--primary-1': '#45C8BE', '--primary-2': '#45C8BE', '--active-1': '#45C8BE29', '--active-2': '#45C8BE0f', '--active-line': '#45C8BE47',
      '--accent-soft': '#45C8BE14', '--accent-line': '#45C8BE59', '--focus': '#45C8BE', '--focus-w': '2px', '--focus-ring': '#45C8BE1f',
      '--danger': '#E0607F', '--warn': '#F0B440', '--ok': '#45C8BE', '--ok-text': '#7FDDD5', '--danger-text': '#FFB3C4', '--warn-text': '#F5C96B',
      '--ok-soft': '#45C8BE1a', '--ok-line': '#265049', '--danger-soft': '#2A1E24', '--danger-line': '#4A2E39', '--warn-soft': '#F0B4401a', '--warn-line': '#4D4024',
      '--sidebar-bg': '#111A20', '--topbar-bg': '#111A20eb', '--modal-bg': '#18242C', '--modal-border': '#375060', '--backdrop': '#080D10b8',
      '--toast-bg': '#1E2D36', '--toast-text': '#E8F1F4', '--toast-line': '#265049', '--toast-err-bg': '#2A1E24', '--toast-err-text': '#FFD4DE', '--toast-err-line': '#4A2E39',
      '--badge-text': '#E8F1F4', '--badge-bg': '#1E2D36', '--badge-line': '#375060', '--on-badge': '#0B1518',
      '--bar-track': '#2B3E49', '--scroll-thumb': '#37506080', '--glow-1': '#0000', '--glow-2': '#0000',
      '--shadow-pop': '0 8px 26px #00000073', '--shadow-modal': '0 18px 50px #00000080', '--shadow-toast': '0 8px 26px #00000073'
    }
  });

  /* ---------- Firebase (REST) çağrıları Kullanım Limitleri kartında sayılır ---------- */
  try { FC.usage.wrapFetch(); } catch (e) { }

  /* ---------- sürüm notları ("neler yeni" + latest.json ile aynı: release-notes.json) ---------- */
  var NEWS = {
    '1.14.0': {
      tr: '- Yeni görünüm (Falcon) ve renk şemaları; eski görünüm "Klasik" olarak seçilebilir\n- Kurulumlu sürüm: her açılışta tam ekran, sağ üstte Küçült · Orta · Tam ekran · Kapat\n- Tek tuşla güncelleme: yalnızca değişen kısımlar iner (yüzde, MB, kalan, hız)\n- Önceki oturumlarda kaybolmuş görünen kayıtlar bulunup birleştirildi; hiçbir kayıt silinmez\n- Eşitlemede çakışma ve silinen kayıtlar yedeklenir (Ayarlar → Arşiv ve çakışma yedekleri)\n- Admin ile iletişim Ayarlar\'ın en sonunda; otomatik hata raporu; ilk açılış rehberi; yazı boyutu',
      en: '- New look (Falcon) and colour schemes; the previous look is available as "Classic"\n- Installed version: opens full screen, Minimize · Half · Full screen · Close at the top right\n- One-click updates: only the changed parts are downloaded (percent, MB, remaining, speed)\n- Records from earlier sessions that looked lost were found and merged; nothing is deleted\n- Sync keeps a backup of conflicting and deleted records (Settings → Archive and conflict backups)\n- Contact the admin at the end of Settings; automatic error reports; first-run guide; text size',
      ar: '- مظهر جديد (فالكون) ونظم ألوان؛ المظهر السابق متاح باسم "الكلاسيكي"\n- نسخة مثبّتة: تفتح بملء الشاشة، وفي الأعلى تصغير · نصف · ملء الشاشة · إغلاق\n- تحديث بنقرة واحدة: تُنزَّل الأجزاء المتغيرة فقط (النسبة، الميغابايت، المتبقي، السرعة)\n- عُثر على السجلات التي بدت مفقودة من الجلسات السابقة ودُمجت؛ لا يُحذف أي سجل\n- تحتفظ المزامنة بنسخة من السجلات المتعارضة والمحذوفة (الإعدادات ← الأرشيف ونسخ التعارض)\n- التواصل مع المسؤول في آخر الإعدادات؛ تقارير أخطاء تلقائية؛ دليل البدء؛ حجم الخط'
    }
  };
  function notes(v) { return NEWS[String(v).replace(/^v/, '')] || null; }

  /* ---------- güncelleme ---------- */
  var OB = {
    ai: false, store: false,
    onFirebase: function (cfg) { if (cfg && cfg.projectId && window.saveFirebase) saveFirebase(cfg).then(function () { doSync(true); }); }
  };
  var shownFor = null, userCheck = false;
  function availableDialog(p) {
    if (!p || shownFor === p.version || legacy()) return;
    if (document.querySelector('.modal-backdrop') || !document.getElementById('modalWrap').hidden) return setTimeout(function () { availableDialog(p); }, 900);
    shownFor = p.version;
    var body = ui.el('div');
    body.appendChild(ui.el('p', { text: FC.t('fc.update.avail', { v: p.version }) + ' · ' + t('current_version') + ': v' + V() }));
    var n = FC.i18n.pick(notes(p.version) || p.notes);
    if (n) body.appendChild(ui.el('pre.notes', { text: n, dir: 'auto' }));
    if (p.size) body.appendChild(ui.el('p.muted.small', { text: FC.progress.mb(p.size) + (p.mode === 'patch' ? ' · ' + FC.t('fc.update.patchMode') : '') }));
    ui.modal({ title: FC.t('fc.update.avail', { v: p.version }), icon: 'download', body: body, buttons: [
      { label: t('update_later'), cls: 'ghost' }, 'spacer',
      { label: FC.t('fc.update'), icon: 'download', cls: 'primary', onClick: function () { FC.updater.run().catch(function () { }); } }
    ] });
  }
  function startUpdater() {
    var auto = !(S.settings && S.settings.autoUpdate === false);
    if (legacy()) FC.updater.start({ repo: REPO, app: APP, version: '0.0.0', channel: 'win-setup', autoCheck: false });
    else FC.updater.start({ repo: REPO, app: APP, version: V(), setupChannel: 'win-setup', autoCheck: auto, firstDelayMs: 2500, intervalHours: 6 });
    FC.updater.subscribe(function (st) { if (st.status === 'available' && st.plan && !userCheck) availableDialog(st.plan); });
  }

  /* ---------- üst çubuk ---------- */
  function topbar() {
    var host = document.getElementById('topRight'); if (!host || tb) return;
    tb = FC.topbar.mount(host, {
      before: [FC.announcements.button()],
      sync: { state: syncState, onClick: function () { doSync(true); } },
      lan: false   // tek masaüstünde kullanılan araç: Wi-Fi eşitleme yok (bulut eşitleme kullanıcının Firebase'iyle)
    });
  }
  function setSync(s) { syncState = s || 'off'; if (tb) tb.setSync(syncState); }

  /* ---------- ayarlar ---------- */
  function settingsOptions(cards) {
    return {
      cards: cards,
      usage: { firebase: true, ai: false, project: function () { return (S.settings && S.settings.fb && S.settings.fb.projectId) || ''; } },
      about: { version: V() },
      onboarding: OB
    };
  }

  /* ---------- eski oturumların kayıtları (kabuk 2) ---------- */
  var recResult = null;
  async function recover(fromUser) {
    if (!NEW || !window.Kurtarma) return null;
    var list;
    try { list = await (await fetch('/__shell/kurtar/liste', { cache: 'no-store' })).json(); } catch (e) { return null; }
    var n = (list.portlar || []).length;
    if (!n) { if (fromUser) toast(t('recover_none'), 'good'); return { portlar: 0, eklenen: 0 }; }
    var m = null, bar = null, txt = null;
    var timer = setTimeout(function () {
      var b = ui.el('div');
      txt = ui.el('p', { text: t('recover_running', { i: 0, n: n }) });
      var track = ui.el('div.bar'); bar = ui.el('i', { style: 'width:0%' }); track.appendChild(bar);
      b.appendChild(txt); b.appendChild(track);
      b.appendChild(ui.el('p.note', { text: t('recover_why') }));
      m = ui.modal({ title: t('recover_title'), icon: 'sync', body: b, buttons: [], dismiss: false, cls: 'small' });
    }, 400);
    var r = await Kurtarma.run(DB, function (p) {
      if (txt) txt.textContent = t('recover_running', { i: p.i, n: p.n });
      if (bar) bar.style.width = Math.round(p.i * 100 / Math.max(1, p.n)) + '%';
    });
    clearTimeout(timer); if (m) m.close();
    recResult = r;
    if (r.eklenen || r.guncellenen) setTimeout(function () { toast(t('recover_done', { n: r.eklenen + r.guncellenen, s: r.portlar }), 'good'); }, 800);
    else if (fromUser) toast(t('recover_none'), 'good');
    return r;
  }
  async function recoverBox(el) {
    if (!el || !NEW) return;
    var info = {};
    try { info = await H.bh.info(); } catch (e) { }
    var ts = info.tasima || {};
    var p = [];
    if (ts.durum === 'tamam' && ts.kaynak) p.push(t('migrate_done', { src: ts.kaynak }));
    if (ts.diger && ts.diger.length) p.push(t('migrate_other', { list: ts.diger.join(' · ') }));
    if (ts.durum === 'atlandi') p.push(t('migrate_skipped', { src: ts.kaynak || '' }));
    if (ts.durum === 'hata') p.push(t('migrate_error', { msg: ts.hata || '' }));
    if (recResult && recResult.portlar) p.push(t('recover_done', { n: recResult.eklenen + recResult.guncellenen, s: recResult.portlar }));
    el.innerHTML = '<h3 class="card-title" style="margin-top:18px">' + ui.icon('sync') + '<span>' + ui.esc(t('recover_title')) + '</span></h3>' +
      '<p class="note">' + ui.esc(t('recover_card')) + '</p>' + p.map(function (x) { return '<p class="status">' + ui.esc(x) + '</p>'; }).join('') +
      '<p class="status">' + ui.esc(t('data_folder')) + ': <code>' + ui.esc(info.dataDir || '') + '</code></p>' +
      '<div class="btnrow"><button class="btn" id="bRecover">' + ui.esc(t('recover_again')) + '</button></div>';
    el.querySelector('#bRecover').onclick = async function () {
      this.disabled = true;
      await recover(true); await reload(); render();
    };
  }

  /* ---------- başlangıç ---------- */
  function init(o) {
    o = o || {};
    // Uygulamanın kayıtlı dili çekirdeğe (FC.i18n) aktarılır; sonra çekirdekteki değişiklik uygulamaya döner.
    if (FC.i18n.lang() !== LANG) FC.i18n.set(LANG);
    // Önceki sürümden gelen kullanıcı: ilk açılış rehberi yerine "neler yeni"
    if (o.returning && FC.storage.get('whatsnew.seen', null) == null) { FC.storage.set('whatsnew.seen', '1.13.0'); FC.storage.set('onboarding.done', true); }
    FC.init({ app: APP, repo: REPO, version: V(), update: false, whatsnew: false, onboarding: false, announcements: true });
    startUpdater();
    topbar();
    // Sekme çubuğu üst çubuğun altına yapışır (üst çubuğun yüksekliği dile/yazı boyutuna göre değişir).
    var top = document.querySelector('.topbar');
    if (top && window.ResizeObserver) new ResizeObserver(function () { document.documentElement.style.setProperty('--bh-top', top.offsetHeight + 'px'); }).observe(top);
    FC.i18n.onChange(function (l) { if (l !== LANG && window.appLangChanged) appLangChanged(l); });
    if (S.settings && S.settings.fb && S.settings.fb.projectId) FC.usage.setProject(S.settings.fb.projectId);
    if (NEW) {
      document.documentElement.classList.add('bh-kabuk2');
      // Pencereyi kabuğa tanıt ve tam ekranı garantile (Edge --start-fullscreen ile açılır).
      setTimeout(function () { H.bh.register().then(function (r) { if (r && r.bulundu) return H.bh.fullscreenOnStart(); }).catch(function () { }); }, 300);
    }
    if (legacy()) document.documentElement.classList.add('bh-eski-kabuk');
  }
  function started() {
    if (legacy()) { setTimeout(bridge, 900); return; }
    var wn = FC.whatsnew.start({ version: V(), notes: notes });
    if (!wn) setTimeout(function () { FC.onboarding.maybeStart(OB); }, 700);
  }

  /* ---------- eski kabuk köprüsü ---------- */
  function setupUrl() { return 'https://github.com/' + OWNER + '/' + REPO + '/releases/download/v' + V() + '/' + PREFIX + '-' + V() + '-win-setup.exe'; }
  function openOut(u) { try { window.open(u, '_blank'); } catch (e) { location.href = u; } }
  function bridge() {
    if (document.querySelector('.bh-bridge')) return;
    var body = ui.el('div.bh-bridge');
    body.appendChild(ui.el('p', { text: t('bridge_text', { v: V() }) }));
    body.appendChild(ui.el('div.notice.ok', null, [ui.el('span', { html: ui.icon('check') }), ui.el('span', { text: t('bridge_data') })]));
    var info = (window.shell && window.shell.info) ? window.shell.info() : Promise.resolve({});
    var where = ui.el('p.muted', { style: 'margin-top:10px' });
    body.appendChild(where);
    Promise.resolve(info).then(function (i) { if (i && i.dataDir) where.textContent = t('data_folder') + ': ' + i.dataDir; }).catch(function () { });
    body.appendChild(ui.el('p.muted', { text: t('bridge_steps'), style: 'margin-top:10px' }));
    ui.modal({ title: t('bridge_title'), icon: 'download', body: body, buttons: [
      { label: t('update_later'), cls: 'ghost' }, 'spacer',
      { label: t('bridge_releases'), onClick: function () { openOut('https://github.com/' + OWNER + '/' + REPO + '/releases/latest'); return false; } },
      { label: t('bridge_download'), icon: 'download', cls: 'primary', onClick: function () { openOut(setupUrl()); return false; } }
    ] });
  }

  window.Kabuk = { init: init, started: started, setSync: setSync, settingsOptions: settingsOptions, recover: recover, recoverBox: recoverBox,
    bridge: bridge, setupUrl: setupUrl, notes: notes, NEWS: NEWS, get isNew() { return NEW; }, get isLegacy() { return legacy(); } };
})();
