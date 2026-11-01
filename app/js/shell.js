/* Kabuk köprüsü.
   Masaüstü: exe'nin içindeki yerel sunucuya HTTP ile konuşur.
   Android: WebView'in verdiği AndroidShell nesnesini kullanır.
   Tarayıcı: indirme bağlantısına düşer. */

(function () {

  const web = {
    kind: "web",
    info: async () => ({ kind: "web", version: null }),
    applyUpdate: async () => false,
    restart: async () => location.reload(),
    saveFile: async (name, dataUrl) => {
      const a = document.createElement("a");
      a.href = dataUrl; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      return true;
    },
    setFullscreen: async on => {
      try {
        if (on && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else if (!on && document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
      } catch (e) { /* izin yoksa sorun değil */ }
      return true;
    },
    share: async () => false
  };

  function android() {
    const A = window.AndroidShell;
    if (!A) return null;
    return {
      kind: "android",
      info: async () => ({ kind: "android", version: A.appVersion ? A.appVersion() : null }),
      applyUpdate: async json => A.applyUpdate(json),
      restart: async () => A.restart(),
      saveFile: async (name, dataUrl) => A.saveFile(name, dataUrl),
      setFullscreen: async () => true,
      share: async (name, dataUrl) => (A.share ? A.share(name, dataUrl) : false)
    };
  }

  async function post(path, body) {
    const res = await fetch("/__shell/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(txt || ("HTTP " + res.status));
    return txt;
  }

  function desktop(info) {
    return {
      kind: "desktop",
      info: async () => info,
      applyUpdate: async json => { await post("update", JSON.parse(json)); return true; },
      restart: async () => { try { await post("restart", {}); } catch (e) {} location.reload(); },
      saveFile: async (name, dataUrl) => post("save", { name, data: dataUrl }),
      setFullscreen: async () => true,     // pencere zaten tam açılır
      share: async () => false
    };
  }

  window.shell = web;

  /* Kabuk var mı diye bir kez sorar; varsa HTTP köprüsüne geçer. */
  window.shellReady = (async () => {
    const a = android();
    if (a) { window.shell = a; return a; }
    try {
      const res = await fetch("/__shell/info", { cache: "no-store" });
      if (res.ok) {
        const info = await res.json();
        window.shell = desktop(info);
        /* pencere kapandığında exe de kapansın diye yaşam işareti */
        setInterval(() => { fetch("/__shell/ping", { method: "POST" }).catch(() => {}); }, 4000);
      }
    } catch (e) { /* tarayıcıdayız */ }
    return window.shell;
  })();
})();
