// Asistan Agent (ortak-cekirdek/web/dist/fc-agent.js): bütün uygulamalardaki çalışmayı izler (yalnız sayılar), öneri verir.
// Bildirim + sağ altta ✦ panel; Ayarlar'da "Admin ile iletişim" kartının önünde kendi kartı. fc-agent.js'yi çekirdekten yeniden kopyalayarak güncellenir.
(function () {
  if (!window.FCAgent) return;
  FCAgent.mount({
    app: "baski-hesabi",
    version: (function () { try { return window.APP_VERSION; } catch (e) { return ''; } })(),
    lang: function () { try { return (typeof LANG!=='undefined'?LANG:'tr') || document.documentElement.lang || 'tr'; } catch (e) { return document.documentElement.lang || 'tr'; } },
    theme: 'auto',
    sync: true,
    settingsBefore: ["Admin ile iletişime geç", "Contact the admin", "التواصل مع المسؤول"]
  });
})();
