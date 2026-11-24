package main

import (
	"encoding/json"
	"strings"
)

// hostJS: yalnız kabuk 2'nin sunduğu /__shell/host.js. Ortak çekirdeğin beklediği window.fcHost'u kurar
// (web/js/host.js bunu "electron" türü kabuk olarak tanır: pencere düğmeleri, güncelleme, CORS'suz indirme).
// Eski kabukta (1.x) ve düz tarayıcıda bu dosya 404 döner → çekirdek tarayıcı kipine düşer.
func hostJS() string {
	info, _ := json.Marshal(map[string]any{"version": appVersion, "port": listenAt, "fixed": fixed, "shell": 2})
	return strings.Replace(hostJSTemplate, "__INFO__", string(info), 1)
}

const hostJSTemplate = `/* Baskı Hesabı kabuğu (Go) → ortak çekirdek köprüsü: window.fcHost */
(function () {
  'use strict';
  var INFO = __INFO__;
  window.BH_KABUK = INFO;
  function err(code) { var e = new Error(code || 'ERR'); e.code = code || 'ERR'; return e; }
  function call(path, opt) {
    return fetch('/__shell/' + path, Object.assign({ cache: 'no-store' }, opt || {})).then(function (r) {
      return r.text().then(function (t) { if (!r.ok) throw err((t || ('HTTP_' + r.status)).trim()); return t; });
    });
  }
  function post(path, obj) { return call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj || {}) }); }
  function json(t) { try { return JSON.parse(t); } catch (e) { return {}; } }

  /* ---------- pencere ---------- */
  var subs = [], last = {};
  function mq() { try { return matchMedia('(display-mode: fullscreen)').matches; } catch (e) { return false; } }
  function emit(s) { last = s; subs.slice().forEach(function (f) { try { f(s); } catch (e) {} }); }
  function win(op) { return post('pencere/' + op, {}).then(function (t) { var s = json(t); emit({ fullscreen: !!s.fullscreen, half: !!s.half }); return s; }); }
  function state() { return call('pencere/durum').then(function (t) { var s = json(t); return { fullscreen: !!s.fullscreen || mq(), half: !!s.half }; }); }
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { state().then(emit, function () {}); }, 250); });
  /** Pencereyi bir kez tanıt: başlığa geçici iz koyar, kabuk Windows'ta pencereyi bulur. */
  function register() {
    var iz = Math.random().toString(36).slice(2, 10) + Date.now().toString(36), old = document.title;
    document.title = 'BH-' + iz;
    return post('pencere/kaydet', { iz: iz }).then(json, function () { return {}; }).then(function (r) {
      document.title = old;
      return r;
    });
  }

  /* ---------- indirme (kabuk GitHub'dan indirir; tarayıcı CORS'una takılmaz) ---------- */
  function download(url, onProgress) {
    return fetch('/__shell/indir?url=' + encodeURIComponent(url), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw err((t || 'HTTP_' + r.status).trim()); });
      var total = +(r.headers.get('X-Toplam') || 0), rd = r.body.getReader(), parts = [], n = 0, lastT = 0;
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) {
            if (onProgress) onProgress({ done: n, total: total, finished: true });
            var out = new Uint8Array(n), o = 0;
            parts.forEach(function (p) { out.set(p, o); o += p.length; });
            return out;
          }
          parts.push(x.value); n += x.value.length;
          var t = Date.now(); if (onProgress && t - lastT > 120) { lastT = t; onProgress({ done: n, total: total }); }
          return pump();
        });
      }
      return pump();
    });
  }
  function send(path, bytes, meta) {
    return call(path, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Meta': encodeURIComponent(JSON.stringify(meta || {})) }, body: bytes })
      .then(function (t) {
        // Arayüz paketi değişti: sayfa yeniden yüklenir (kabuk yeni paketi sunar). Kurulumda kabuk kendini kapatır.
        if (!/setup/i.test(String((meta && meta.channel) || '')) && !/\.exe$/i.test(String((meta && meta.file) || ''))) setTimeout(function () { location.reload(); }, 1200);
        return t.trim() || 'restarting';
      });
  }

  window.fcHost = {
    kind: 'electron',            // çekirdek açısından masaüstü kabuğu (pencere düğmeleri + güncelleme)
    shell: 'go',
    platform: 'win32',
    version: INFO.version,
    window: {
      minimize: function () { return win('kucult'); },
      half: function () { return win('orta'); },
      toggleFullscreen: function () { return win('tam'); },
      close: function () { return win('kapat'); },
      getState: state,
      onState: function (cb) { subs.push(cb); return function () { subs = subs.filter(function (x) { return x !== cb; }); }; }
    },
    update: {
      channel: 'win-app',
      applyPatch: function (bytes, meta) { return send('guncelle/yama', bytes, meta); },
      installFull: function (bytes, meta) { return send('guncelle/tam', bytes, meta); }
    },
    net: { download: download },
    agent: {
      read: function () { return call('agent').then(json); },
      write: function (key, j) { return post('agent', { key: key, json: String(j) }).then(function () { return true; }); },
      remove: function (key) { return call('agent?key=' + encodeURIComponent(key), { method: 'DELETE' }).then(function () { return true; }); }
    },
    onMainError: function () { return function () {}; },
    openExternal: function (u) { return post('ac', { url: String(u) }); },
    /* uygulamaya özel */
    bh: { register: register, fullscreenOnStart: function () { return win('tam-ac'); }, info: function () { return call('info').then(json); } }
  };
})();
`
