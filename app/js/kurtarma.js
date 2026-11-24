/* Eski oturumların kayıtlarını kurtarma (kabuk 2).
   Kabuk 1 her açılışta rastgele port kullandığı için her oturumun kayıtları tarayıcı profilinde ayrı bir kökende
   (http://127.0.0.1:<port>) kaldı. Kabuk 2 sabit porttadır; açılışta henüz birleştirilmemiş eski kökenleri sırayla
   görünmez bir çerçevede açar (kabuk o portta küçük bir okuma sayfası sunar), kayıtları okur ve buraya BİRLEŞTİRİR.
   Kural (çekirdek lan-sync-merge ile aynı ruh): hiçbir kayıt silinmez, sessizce ezilmez —
     - yerelde olmayan eklenir;
     - iki tarafta farklıysa updatedAt'i yeni olan kalır, eskisi "cakismalar" deposuna yedeklenir;
     - ilk açılışta otomatik eklenen örnek kategoriler (PLA/PETG/ABS, Ender 3) çoğaltılmaz: aynısı varsa kimliği
       ona eşlenir ve o oturumdaki kayıtlar eşlenmiş kimliği kullanır;
     - ayarlar: yeni olan esas, boş alanları eskisinden doldurulur (ör. Firebase yapılandırması).
   Eski köken klasörleri olduğu gibi kalır; birleştirilen portlar kabukta BaskiHesabi-veri/kurtarilan.json'a yazılır. */
(function (g) {
  'use strict';

  var SEEDS = {
    filaments: [
      { name: 'PLA', price: 20, color: '#45C8BE' },
      { name: 'PETG', price: 24, color: '#6C9BF0' },
      { name: 'ABS', price: 22, color: '#F0876A' }
    ],
    printers: [{ name: 'Ender 3', watt: 150, price: 400, life: 5000 }]
  };
  var SKIP = { id: 1, updatedAt: 1 };

  function canon(x) {
    if (x === null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x);
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    return '{' + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}';
  }
  function body(doc) { var o = {}; for (var k in doc) if (!SKIP[k]) o[k] = doc[k]; return o; }
  function seedKey(store, doc) {
    var list = SEEDS[store]; if (!list || !doc || doc.deleted) return null;
    var c = canon(body(doc));
    for (var i = 0; i < list.length; i++) if (canon(list[i]) === c) return store + ':' + i;
    return null;
  }
  function ts(v) { var n = Date.parse(v || ''); return isNaN(n) ? 0 : n; }
  function remap(x, map) {
    if (typeof x === 'string') return Object.prototype.hasOwnProperty.call(map, x) ? map[x] : x;
    if (Array.isArray(x)) return x.map(function (v) { return remap(v, map); });
    if (x && typeof x === 'object' && !(typeof Blob !== 'undefined' && x instanceof Blob)) { var o = {}; for (var k in x) o[k] = remap(x[k], map); return o; }
    return x;
  }

  /** Saf birleştirme planı.
   *  local: {store: [doc]} (yerel, silinmişler dahil) · incoming: {store: [doc]} (bir eski köken)
   *  Döner: {puts: [{store, doc}], conflicts: [{store, id, kept, lost}], idMap, added, updated} — local'e dokunmaz. */
  function plan(local, incoming, stores) {
    stores = stores || Object.keys(incoming || {});
    var puts = [], conflicts = [], idMap = {}, added = 0, updated = 0;
    var idx = {};
    function index(store) {
      if (idx[store]) return idx[store];
      var m = { byId: {}, seeds: {} };
      (local[store] || []).forEach(function (d) { if (!d || d.id == null) return; m.byId[d.id] = d; var k = seedKey(store, d); if (k && !m.seeds[k]) m.seeds[k] = d.id; });
      return (idx[store] = m);
    }
    // 1) örnek kategoriler önce: kimlik eşlemesi çıkar
    ['filaments', 'printers'].forEach(function (store) {
      var m = index(store);
      (incoming[store] || []).forEach(function (d) {
        var k = seedKey(store, d);
        if (k && m.seeds[k] && m.seeds[k] !== d.id && !m.byId[d.id]) idMap[d.id] = m.seeds[k];
      });
    });
    stores.forEach(function (store) {
      if (store === 'cakismalar') return;
      var m = index(store);
      (incoming[store] || []).forEach(function (raw) {
        if (!raw || raw.id == null) return;
        if (idMap[raw.id]) return;                         // çoğaltılmayan örnek kategori
        var d = remap(raw, idMap);
        if (store === 'meta') {
          if (d.id !== 'settings') return;                 // pendingUpdate vb. taşınmaz
          var cur = m.byId.settings;
          if (!cur) { puts.push({ store: store, doc: d }); m.byId.settings = d; added++; return; }
          var newer = ts(d.updatedAt) > ts(cur.updatedAt) ? d : cur, older = newer === d ? cur : d, merged = {};
          for (var k in newer) merged[k] = newer[k];
          for (var k2 in older) if (merged[k2] === undefined || merged[k2] === null || merged[k2] === '') merged[k2] = older[k2];
          if (canon(merged) !== canon(cur)) { puts.push({ store: store, doc: merged }); m.byId.settings = merged; updated++; }
          return;
        }
        var l = m.byId[d.id];
        if (!l) { puts.push({ store: store, doc: d }); m.byId[d.id] = d; var sk = seedKey(store, d); if (sk && !m.seeds[sk]) m.seeds[sk] = d.id; added++; return; }
        if (canon(body(l)) === canon(body(d))) return;      // aynı
        var incomingWins = ts(d.updatedAt) > ts(l.updatedAt);
        conflicts.push({ store: store, id: d.id, kept: incomingWins ? d : l, lost: incomingWins ? l : d });
        if (incomingWins) { puts.push({ store: store, doc: d }); m.byId[d.id] = d; updated++; }
      });
    });
    return { puts: puts, conflicts: conflicts, idMap: idMap, added: added, updated: updated };
  }

  /* ---------- çalıştırıcı (tarayıcıda, kabuk 2) ---------- */
  function shellGet(p) { return fetch('/__shell/' + p, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function shellPost(p, o) { return fetch('/__shell/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o || {}) }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }

  function readFrame(port, ana, timeoutMs) {
    return new Promise(function (res) {
      var f = document.createElement('iframe'), done = false;
      f.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;border:0;visibility:hidden';
      f.setAttribute('aria-hidden', 'true');
      function finish(v) { if (done) return; done = true; g.removeEventListener('message', onMsg); clearTimeout(t); if (f.parentNode) f.parentNode.removeChild(f); res(v); }
      function onMsg(e) {
        if (e.origin !== 'http://127.0.0.1:' + port || !e.data || !e.data.kurtarma) return;
        finish(e.data);
      }
      g.addEventListener('message', onMsg);
      var t = setTimeout(function () { finish({ zaman: true }); }, timeoutMs || 12000);
      f.src = 'http://127.0.0.1:' + port + '/__kurtar/cerceve.html?ana=' + ana;
      document.body.appendChild(f);
    });
  }

  async function localAll(DB) {
    var out = {};
    for (var i = 0; i < DB.STORES.length; i++) out[DB.STORES[i]] = await DB.all(DB.STORES[i], true);
    return out;
  }

  async function apply(DB, p, port) {
    for (var i = 0; i < p.puts.length; i++) await DB.put(p.puts[i].store, p.puts[i].doc, true);
    var at = DB.now();
    for (var j = 0; j < p.conflicts.length; j++) {
      var c = p.conflicts[j];
      await DB.put('cakismalar', { id: DB.uid(), tur: 'cakisma', kaynak: 'kurtarma:' + port, store: c.store, kayitId: c.id, kalan: c.kept, kaybeden: c.lost, zaman: at, updatedAt: at }, true);
    }
  }

  /** Kabuk 2'de açılışta çağrılır. onProgress({i, n, eklenen}) · Döner: {portlar, eklenen, guncellenen, cakisma, bekleyen} */
  async function run(DB, onProgress) {
    var sonuc = { portlar: 0, eklenen: 0, guncellenen: 0, cakisma: 0, bekleyen: 0 };
    var liste;
    try { liste = await shellGet('kurtar/liste'); } catch (e) { return sonuc; }
    var ports = (liste.portlar || []).slice(), ana = liste.ana;
    if (!ports.length) return sonuc;
    var BATCH = 6, n = ports.length, i = 0;
    while (ports.length) {
      var grup = ports.splice(0, BATCH), acik = [];
      try { acik = (await shellPost('kurtar/dinle', { portlar: grup })).acik || []; } catch (e) { acik = []; }
      var okunan = await Promise.all(acik.map(function (p) { return readFrame(p, ana).then(function (r) { return { port: p, r: r }; }); }));
      var biten = [], kapat = [];
      for (var k = 0; k < okunan.length; k++) {
        var o = okunan[k], r = o.r;
        if (r.yok) { biten.push(o.port); continue; }
        if (!r.veri) { kapat.push(o.port); sonuc.bekleyen++; continue; }   // zaman aşımı/hata: sonra yeniden
        var local = await localAll(DB);
        var p = plan(local, r.veri, DB.STORES);
        await apply(DB, p, o.port);
        sonuc.eklenen += p.added; sonuc.guncellenen += p.updated; sonuc.cakisma += p.conflicts.length;
        biten.push(o.port);
      }
      grup.forEach(function (p) { if (acik.indexOf(p) < 0) sonuc.bekleyen++; });
      try { await shellPost('kurtar/bitti', { portlar: biten, kapat: kapat }); } catch (e) {}
      sonuc.portlar += biten.length;
      i += grup.length;
      if (onProgress) try { onProgress({ i: i, n: n, eklenen: sonuc.eklenen }); } catch (e) {}
    }
    return sonuc;
  }

  var api = { plan: plan, run: run, seedKey: seedKey, canon: canon, SEEDS: SEEDS };
  g.Kurtarma = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
