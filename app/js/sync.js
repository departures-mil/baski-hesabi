/* Firebase katmanı — resmî SDK yerine REST (kullanıcının KENDİ Firebase projesi).
   Eşitleme: updatedAt karşılaştırmalı, iki yönlü. Ortak kural: hiçbir kayıt silinmez ya da sessizce ezilmez —
   uzaktaki daha yeni sürüm yereldekini değiştirirken yereldeki eski hal "cakismalar" deposuna yedeklenir;
   uzakta silinmiş (deleted:true) kayıt yerelde de gizlenir ama tam içeriği "arsiv" olarak saklanır.
   Kullanım sayacı (Kullanım Limitleri kartı): FC.usage.wrapFetch() Firestore REST çağrılarını sayar.
   v1.14.0: eski (depo kökündeki imzasız sürüm dosyası) güncelleyicisi kaldırıldı (güncelleme ortak çekirdek: GitHub Releases + latest.json). */

const FS_HOST = "https://firestore.googleapis.com/v1";
const ID_HOST = "https://identitytoolkit.googleapis.com/v1";
const TOKEN_HOST = "https://securetoken.googleapis.com/v1";

/* Firestore'a gönderilecek koleksiyonlar. files boyut sınırına takılmasın diye ayrı ele alınır. */
const SYNC_STORES = ["filaments", "printers", "customers", "groups", "expenses", "records",
                     "spools", "products", "sales"];
const MAX_FILE_SYNC = 700 * 1024;   // Firestore belge sınırı 1 MiB

let _tok = null;        // {idToken, refreshToken, expiresAt, uid}

/* ---------- değer dönüşümü ---------- */
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") {
    const fields = {};
    for (const k in v) fields[k] = toFs(v[k]);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fromFs(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
  if ("mapValue" in v) {
    const o = {};
    const f = v.mapValue.fields || {};
    for (const k in f) o[k] = fromFs(f[k]);
    return o;
  }
  return null;
}

const docToObj = d => {
  const o = {};
  const f = d.fields || {};
  for (const k in f) o[k] = fromFs(f[k]);
  if (!o.id && d.name) o.id = d.name.split("/").pop();
  return o;
};

/* ---------- kimlik ---------- */
async function signIn(cfg, email, password) {
  const res = await fetch(`${ID_HOST}/accounts:signInWithPassword?key=${cfg.apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "giriş başarısız");
  _tok = {
    idToken: data.idToken, refreshToken: data.refreshToken, uid: data.localId,
    expiresAt: Date.now() + (parseInt(data.expiresIn, 10) - 60) * 1000
  };
  await DB.saveSettings({ fbRefresh: data.refreshToken, fbEmail: email });
  return _tok;
}

async function signInAnon(cfg) {
  const res = await fetch(`${ID_HOST}/accounts:signUp?key=${cfg.apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "anonim giriş kapalı");
  _tok = {
    idToken: data.idToken, refreshToken: data.refreshToken, uid: data.localId,
    expiresAt: Date.now() + (parseInt(data.expiresIn, 10) - 60) * 1000
  };
  await DB.saveSettings({ fbRefresh: data.refreshToken });
  return _tok;
}

async function refresh(cfg, refreshToken) {
  const res = await fetch(`${TOKEN_HOST}/token?key=${cfg.apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "oturum yenilenemedi");
  _tok = {
    idToken: data.id_token, refreshToken: data.refresh_token, uid: data.user_id,
    expiresAt: Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000
  };
  await DB.saveSettings({ fbRefresh: data.refresh_token });
  return _tok;
}

/* Her açılışta elle şifre istemeden bağlanır: saklı yenileme anahtarı varsa onu kullanır. */
async function ensureAuth(settings) {
  const cfg = settings.fb;
  if (!cfg || !cfg.apiKey || !cfg.projectId) throw new Error("yapılandırma yok");
  if (_tok && _tok.expiresAt > Date.now()) return _tok;
  if (settings.fbRefresh) {
    try { return await refresh(cfg, settings.fbRefresh); } catch (e) { /* aşağıda yeniden dene */ }
  }
  if (settings.fbEmail && settings.fbPassword) return signIn(cfg, settings.fbEmail, settings.fbPassword);
  return signInAnon(cfg);
}

/* ---------- Firestore ---------- */
function root(cfg) {
  return `${FS_HOST}/projects/${cfg.projectId}/databases/(default)/documents`;
}

async function fsList(cfg, coll) {
  const out = [];
  let token = "";
  do {
    const url = `${root(cfg)}/${coll}?pageSize=300${token ? "&pageToken=" + token : ""}`;
    const res = await fetch(url, { headers: { Authorization: "Bearer " + _tok.idToken } });
    if (res.status === 404) return out;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || ("liste alınamadı: " + coll));
    (data.documents || []).forEach(d => out.push(docToObj(d)));
    token = data.nextPageToken || "";
  } while (token);
  return out;
}

async function fsPut(cfg, coll, doc) {
  const fields = {};
  for (const k in doc) if (k !== "id") fields[k] = toFs(doc[k]);
  const url = `${root(cfg)}/${coll}/${encodeURIComponent(doc.id)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + _tok.idToken, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || "yazılamadı");
  }
  return true;
}

async function fsGet(cfg, path) {
  const res = await fetch(`${root(cfg)}/${path}`, {
    headers: _tok ? { Authorization: "Bearer " + _tok.idToken } : {}
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "okunamadı");
  return docToObj(data);
}

/* ---------- eşitleme ---------- */
function sameDoc(a, b) {
  const strip = d => { const o = Object.assign({}, d); delete o.updatedAt; return o; };
  return window.Kurtarma ? Kurtarma.canon(strip(a)) === Kurtarma.canon(strip(b)) : JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/* Ezilecek yerel kaydın tam kopyası: uzak silme → "arsiv", içerik farkı → "cakisma" */
async function backupLocal(coll, local, remote) {
  const at = DB.now();
  await DB.put("cakismalar", {
    id: DB.uid(), tur: remote.deleted && !local.deleted ? "arsiv" : "cakisma", kaynak: "firebase",
    store: coll, kayitId: local.id, kalan: remote, kaybeden: local, zaman: at, updatedAt: at
  }, true);
}

async function syncAll(onStep) {
  const st = await DB.getSettings();
  if (!st.fb || !st.fb.projectId) throw new Error(t("fb_missing"));
  await ensureAuth(st);
  const cfg = st.fb;
  let pushed = 0, pulled = 0;

  for (const coll of SYNC_STORES) {
    if (onStep) onStep(coll);
    const local = await DB.all(coll, true);
    const remote = await fsList(cfg, coll);
    const rmap = new Map(remote.map(d => [d.id, d]));
    const lmap = new Map(local.map(d => [d.id, d]));

    /* yerelde daha yeni olanı yukarı it */
    for (const d of local) {
      const r = rmap.get(d.id);
      if (!r || String(d.updatedAt || "") > String(r.updatedAt || "")) {
        await fsPut(cfg, coll, d); pushed++;
      }
    }
    /* uzakta daha yeni olanı aşağı al — yereldeki eski hal yedeklenir */
    for (const r of remote) {
      const l = lmap.get(r.id);
      if (!l || String(r.updatedAt || "") > String(l.updatedAt || "")) {
        if (l && !sameDoc(l, r)) await backupLocal(coll, l, r);
        await DB.put(coll, r, true); pulled++;
      }
    }
  }

  /* küçük ekler */
  try {
    const files = await DB.all("files", true);
    const remoteFiles = await fsList(cfg, "files");
    const rf = new Map(remoteFiles.map(d => [d.id, d]));
    for (const f of files) {
      const size = typeof f.data === "string" ? f.data.length : 0;
      if (size && size < MAX_FILE_SYNC && !rf.has(f.id)) { await fsPut(cfg, "files", f); pushed++; }
    }
    for (const r of remoteFiles) {
      if (!(await DB.get("files", r.id))) { await DB.put("files", r, true); pulled++; }
    }
  } catch (e) { /* ekler eşitlenemezse kayıtlar yine de eşitlenmiş olur */ }

  await DB.saveSettings({ lastSync: DB.now() });
  return { pushed, pulled, total: pushed + pulled };
}

window.SYNC = { syncAll, signIn, signInAnon, ensureAuth, fsGet, fsPut, fsList, sameDoc };
