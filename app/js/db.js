/* Yerel veri katmanı — IndexedDB. Her kayıt {id, updatedAt, deleted} taşır;
   silinenler iz bırakır ki eşitleme diğer cihazda da silebilsin. */

const DB_NAME = "baski-hesabi";
const DB_VER = 2;
const STORES = ["meta", "filaments", "printers", "customers", "groups", "expenses",
                "records", "spools", "files", "products", "sales"];

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" }); });
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror = () => rej(req.error);
  });
}

function tx(store, mode) {
  return openDB().then(db => db.transaction(store, mode).objectStore(store));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();

async function all(store, includeDeleted) {
  const os = await tx(store, "readonly");
  return new Promise((res, rej) => {
    const r = os.getAll();
    r.onsuccess = () => res((r.result || []).filter(x => includeDeleted || !x.deleted));
    r.onerror = () => rej(r.error);
  });
}

async function get(store, id) {
  const os = await tx(store, "readonly");
  return new Promise((res, rej) => {
    const r = os.get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

async function put(store, doc, keepStamp) {
  const os = await tx(store, "readwrite");
  if (!doc.id) doc.id = uid();
  if (!keepStamp) doc.updatedAt = now();
  return new Promise((res, rej) => {
    const r = os.put(doc);
    r.onsuccess = () => res(doc);
    r.onerror = () => rej(r.error);
  });
}

async function putMany(store, docs, keepStamp) {
  for (const d of docs) await put(store, d, keepStamp);
  return docs.length;
}

/* Yumuşak silme: kayıt kalır, deleted işareti alır. */
async function del(store, id) {
  const doc = await get(store, id);
  if (!doc) return false;
  doc.deleted = true;
  doc.updatedAt = now();
  await put(store, doc, true);
  return true;
}

/* Eki (fotoğraf/STL) ayrı depoda tutar; kayıt yalnız kimliğini taşır. */
async function putFile(blobOrDataUrl, meta) {
  const doc = Object.assign({ id: uid(), updatedAt: now() }, meta || {});
  doc.data = blobOrDataUrl;
  await put("files", doc, true);
  return doc.id;
}

async function getFile(id) { return id ? get("files", id) : null; }

async function clearAll() {
  const db = await openDB();
  await Promise.all(STORES.map(s => new Promise(res => {
    const r = db.transaction(s, "readwrite").objectStore(s).clear();
    r.onsuccess = res; r.onerror = res;
  })));
}

/* ---- ayarlar ---- */
const SETTINGS_ID = "settings";

const FACTORY = {
  id: SETTINGS_ID,
  lang: "tr",
  fullscreen: true,
  rateTry: 48.92,
  rateSyp: 122,
  autoRates: true,
  ratesUpdatedAt: null,
  ratesMarket: false,
  primaryCurrency: "USD",
  /* varsayılan hesap değerleri */
  defFilamentId: null,
  defPrinterId: null,
  defMargin: 0,
  defKwhPrice: 0.15,
  defLaborOn: false,
  defLaborRate: 8,
  defLaborMin: 20,
  defWearOn: false,
  defFailOn: false,
  defFailRate: 8,
  /* firebase */
  fb: null,              // {apiKey, projectId, ...}
  syncOn: false,
  lastSync: null,
  /* güncelleme denetimi — yalnız program açılışında, kanal GitHub */
  autoUpdate: true,
  ghOwner: "departures-mil",
  ghRepo: "baski-hesabi",
  ghBranch: "main",
  lastUpdateCheck: null,
  skipVersion: null        // "Sonra" denen sürüm; yenisi çıkınca yine uyarır
};

async function getSettings() {
  const s = await get("meta", SETTINGS_ID);
  return Object.assign({}, FACTORY, s || {});
}

async function saveSettings(patch) {
  const cur = await getSettings();
  const next = Object.assign(cur, patch, { id: SETTINGS_ID });
  await put("meta", next);
  return next;
}

async function resetSettings() {
  /* kurlar ve firebase bağlantısı korunur, gerisi fabrika değerine döner */
  const cur = await getSettings();
  const keep = { fb: cur.fb, rateTry: cur.rateTry, rateSyp: cur.rateSyp };
  await put("meta", Object.assign({}, FACTORY, keep));
  return getSettings();
}

/* ---- yedek ---- */
async function exportAll() {
  const out = { app: "baski-hesabi", version: window.APP_VERSION, exportedAt: now(), data: {} };
  for (const s of STORES) out.data[s] = await all(s, true);
  return out;
}

async function importAll(bundle) {
  if (!bundle || !bundle.data) throw new Error("bozuk yedek");
  let n = 0;
  for (const s of STORES) {
    if (!Array.isArray(bundle.data[s])) continue;
    await putMany(s, bundle.data[s], true);
    n += bundle.data[s].length;
  }
  return n;
}

window.DB = { openDB, all, get, put, putMany, del, putFile, getFile, clearAll,
              getSettings, saveSettings, resetSettings, exportAll, importAll,
              uid, now, FACTORY, STORES };
