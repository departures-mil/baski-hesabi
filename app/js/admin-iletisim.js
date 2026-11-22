/*
 * "Admin ile iletişime geç" — Ayarlar sayfasının sonuna eklenen ortak bölüm (TR / EN / AR).
 * Mesaj yöneticinin mesaj kutusuna (Firestore) ve FormSubmit ile e-postasına gider; adres programda açıkça görünmez.
 * Kullanım: bu dosyadan ÖNCE
 *   window.ADMIN_ILETISIM = { app: 'Uygulama adı', version: () => '1.0.0', anchor: () => element|null,
 *                             lang: () => 'tr'|'en'|'ar', cls: { card, title, input, btn, muted } }
 * anchor() Ayarlar ekranı açıkken bölümün ekleneceği kapsayıcıyı döndürür; değilse null.
 * Gönderilemeyen mesaj saklanır, internet gelince kendiliğinden gönderilir.
 */
(function () {
  'use strict';
  var C = window.ADMIN_ILETISIM || {};
  var cls = C.cls || {};
  var T = {
    tr: { title: 'Admin ile iletişime geç', desc: 'Programı geliştirmemiz için öneri, istek ve hata bildirimlerinizi yazın; mesajınız doğrudan yöneticiye ulaşır.', name: 'Adınız (isteğe bağlı)', mail: 'E-posta (yanıt için, isteğe bağlı)', msg: 'Mesajınız', send: 'Gönder', empty: 'Lütfen mesajınızı yazın.', bad: 'E-posta adresi geçerli değil.', sending: 'Gönderiliyor…', ok: 'Mesajınız yöneticiye iletildi. Teşekkürler!', queued: 'İnternet yok; mesajınız saklandı, bağlantı gelince kendiliğinden gönderilecek.' },
    en: { title: 'Contact the admin', desc: 'Send suggestions, requests and bug reports to help us improve the program; your message goes straight to the administrator.', name: 'Your name (optional)', mail: 'Email (for a reply, optional)', msg: 'Your message', send: 'Send', empty: 'Please write your message.', bad: 'The email address is not valid.', sending: 'Sending…', ok: 'Your message has been delivered to the administrator. Thank you!', queued: 'No internet; your message was saved and will be sent automatically once you are online.' },
    ar: { title: 'التواصل مع المسؤول', desc: 'أرسل اقتراحاتك وطلباتك وبلاغات الأخطاء لمساعدتنا على تطوير البرنامج؛ تصل رسالتك مباشرة إلى المسؤول.', name: 'اسمك (اختياري)', mail: 'البريد الإلكتروني (للرد، اختياري)', msg: 'رسالتك', send: 'إرسال', empty: 'يرجى كتابة رسالتك.', bad: 'عنوان البريد الإلكتروني غير صالح.', sending: 'جارٍ الإرسال…', ok: 'تم إيصال رسالتك إلى المسؤول. شكرًا لك!', queued: 'لا يوجد اتصال؛ حُفظت رسالتك وستُرسل تلقائيًا عند توفر الإنترنت.' }
  };
  var QKEY = 'adminIletisim.kuyruk';
  function lang() { var l = String((C.lang && C.lang()) || document.documentElement.lang || 'tr').slice(0, 2); return T[l] ? l : 'tr'; }
  function to() { return atob('').split('').reverse().join(''); }
  function ver() { try { return String((C.version && C.version()) || ''); } catch (e) { return ''; } }
  function q() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } }
  function setQ(a) { try { localStorage.setItem(QKEY, JSON.stringify(a.slice(-20))); } catch (e) {} }
  // İki bağımsız kanal; biri kabul ederse mesaj ulaşmış sayılır:
  //  1) yöneticinin mesaj kutusu (Firestore "mesajlar", yalnızca ekleme; etkinleştirme gerekmez)
  //  2) e-posta kopyası (FormSubmit; etkinleştirme yanıtı ulaştı sayılmaz)
  var INBOX = 'https://firestore.googleapis.com/v1/projects/comm-calc-103111111/databases/(default)/documents/mesajlar?key=AIzaSyB12RFS6ENPpmnnPsETfjedNH-3hmNWQvA';
  function inbox(m) {
    var F = function (v) { return { stringValue: String(v || '').slice(0, 4000) }; };
    var app = C.app || 'Uygulama';
    var fields = { mesaj: F(m.message), konu: F(app + ' · Mesaj'), dil: F(m.lang), surum: F(m.version), platform: F(app + ' · ' + (m.device || '')), zaman: { timestampValue: new Date().toISOString() } };
    if (m.name) fields.ad = F(m.name);
    if (m.email) fields.iletisim = F(m.email);
    return fetch(INBOX, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: fields }) })
      .then(function (r) { return r.ok; }, function () { return false; });
  }
  function mail(m) {
    if (C.send) return Promise.resolve(C.send(m)).then(function (r) { return !!(r && r.ok); }, function () { return false; });
    var body = { _subject: (C.app || 'Uygulama') + ': yeni mesaj', _template: 'table', _captcha: 'false', Ad: m.name || '-', Mesaj: m.message, Surum: m.version || '', Cihaz: m.device || '', Dil: m.lang || '' };
    if (m.email) { body.email = m.email; body._replyto = m.email; }
    return fetch('https://formsubmit.co/ajax/' + to(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) { return String(j.success) === 'true'; }, function () { return false; });
  }
  function post(m) {
    return Promise.all([inbox(m), mail(m)]).then(function (r) { if (!r[0] && !r[1]) throw new Error('fail'); });
  }
  function flush() {
    var a = q(); if (!a.length || !navigator.onLine) return;
    var m = a[0];
    post(m).then(function () { setQ(q().slice(1)); flush(); }).catch(function () {});
  }
  function mk(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
  function build(l) {
    var t = T[l];
    var sec = mk('section', { class: cls.card || 'card', id: 'admin-iletisim', 'data-lang': l, dir: l === 'ar' ? 'rtl' : 'ltr' });
    sec.appendChild(mk(cls.titleTag || 'h2', { class: cls.title || '' }, '✉ ' + t.title));
    sec.appendChild(mk('p', { class: cls.muted || 'muted', style: 'margin:4px 0 8px' }, t.desc));
    var box = mk('div', { style: 'display:grid;gap:8px' });
    var ist = 'width:100%;box-sizing:border-box;padding:8px;font:inherit';
    var name = mk('input', { class: cls.input || '', dir: 'auto', maxlength: '80', placeholder: t.name, style: ist });
    var mail = mk('input', { class: cls.input || '', dir: 'ltr', maxlength: '120', type: 'email', placeholder: t.mail, style: ist });
    var msg = mk('textarea', { class: cls.input || '', dir: 'auto', maxlength: '5000', rows: '5', placeholder: t.msg, style: ist + ';resize:vertical' });
    var st = mk('div', { class: cls.muted || 'muted', role: 'status' });
    var btn = mk('button', { class: cls.btn || 'btn primary', type: 'button', style: 'justify-self:start' }, '✉ ' + t.send);
    btn.addEventListener('click', function () {
      var m = msg.value.trim(), e = mail.value.trim();
      if (!m) { st.textContent = t.empty; return; }
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { st.textContent = t.bad; return; }
      var item = { name: name.value.trim().slice(0, 80), email: e.slice(0, 120), message: m.slice(0, 5000), version: ver(), lang: l, device: C.device || (/Android/i.test(navigator.userAgent) ? 'Android' : 'Windows') };
      btn.disabled = true; st.textContent = t.sending;
      post(item).then(function () { msg.value = ''; st.textContent = t.ok; })
        .catch(function () { var a = q(); a.push(item); setQ(a); msg.value = ''; st.textContent = t.queued; })
        .then(function () { btn.disabled = false; });
    });
    [name, mail, msg, btn, st].forEach(function (x) { box.appendChild(x); });
    sec.appendChild(box);
    return sec;
  }
  function ensure() {
    var host = null; try { host = C.anchor && C.anchor(); } catch (e) {}
    var cur = document.getElementById('admin-iletisim');
    if (!host) return;
    var l = lang();
    if (cur && cur.getAttribute('data-lang') !== l) { cur.remove(); cur = null; }
    if (!cur) host.appendChild(build(l));
    else if (cur.parentNode !== host || host.lastElementChild !== cur) host.appendChild(cur);
  }
  var pending = false;
  function start() {
    new MutationObserver(function () { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; try { ensure(); } catch (e) {} }); })
      .observe(document.body, { childList: true, subtree: true });
    ensure();
    window.addEventListener('online', flush);
    setTimeout(flush, 4000);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
