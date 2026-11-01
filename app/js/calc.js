/* Hesap motoru — arayüzden bağımsız, saf fonksiyonlar. */

function n(v) {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(x) && x > 0 ? x : 0;
}

/* p: {kgPrice, grams, watt, kwhPrice, hours, minutes, qty,
       laborOn, laborRate, laborMin, wearOn, machinePrice, machineLife,
       extras:[{name, amount}], failOn, failRate, margin} */
function compute(p) {
  const hours = n(p.hours) + n(p.minutes) / 60;
  const qty = Math.max(1, Math.round(n(p.qty) || 1));

  const filament = (n(p.grams) / 1000) * n(p.kgPrice);
  const perHour = (n(p.watt) / 1000) * n(p.kwhPrice);
  const power = hours * perHour;
  const labor = p.laborOn ? n(p.laborRate) * n(p.laborMin) / 60 : 0;
  const wear = (p.wearOn && n(p.machineLife) > 0)
    ? (n(p.machinePrice) / n(p.machineLife)) * hours : 0;
  const extras = (p.extras || []).reduce((s, e) => s + n(e.amount), 0);

  const subtotal = filament + power + labor + wear + extras;
  const fail = p.failOn ? subtotal * (n(p.failRate) / 100) : 0;
  const cost = subtotal + fail;
  const profit = cost * (n(p.margin) / 100);
  const price = cost + profit;

  return {
    hours, qty, perHour,
    filament, power, labor, wear, extras, fail,
    cost, profit, price,
    totalCost: cost * qty,
    totalProfit: profit * qty,
    totalPrice: price * qty,
    grams: n(p.grams),
    totalGrams: n(p.grams) * qty,
    costPerGram: n(p.grams) > 0 ? cost / n(p.grams) : 0
  };
}

/* ---- para biçimleri ---- */
const CURRENCIES = {
  USD: { code: "USD", sym: "$", dec: 2, pre: true },
  TRY: { code: "TRY", sym: "₺", dec: 2, pre: true },
  SYP: { code: "SYP", sym: "SYP", dec: 0, pre: false }
};

function convert(usd, cur, rates) {
  if (cur === "USD") return usd;
  if (cur === "TRY") return usd * n(rates.rateTry);
  if (cur === "SYP") return usd * n(rates.rateSyp);
  return usd;
}

function fmt(value, cur, rates, opts) {
  const c = CURRENCIES[cur] || CURRENCIES.USD;
  const v = rates ? convert(value, cur, rates) : value;
  const loc = (window.I18N && I18N[window.LANG] && I18N[window.LANG]._locale) || "tr-TR";
  const num = v.toLocaleString(cur === "USD" ? "en-US" : loc,
    { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
  if (opts && opts.bare) return num;
  return c.pre ? c.sym + num : num + " " + c.sym;
}

function fmtHours(h) {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return hh + " " + t("h_short") + " " + String(mm).padStart(2, "0") + " " + t("m_short");
}

/* ---- çevrimiçi kur ----
   Suriye piyasa kuru resmî kurdan belirgin biçimde ayrılıyor; fiyatlar
   piyasaya göre verilmeli. Piyasa siteleri tarayıcıdan doğrudan okunamaz
   (CORS), bu yüzden kabuğun getiricisi üzerinden okunur. Kabuk yoksa ya da
   okuma başarısızsa resmî kaynağa düşülür ve hangisi olduğu söylenir. */

const RATE_SOURCES = [
  "https://open.er-api.com/v6/latest/USD",
  "https://api.exchangerate-api.com/v4/latest/USD",
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
];

const MARKET_PAGES = [
  "https://sp-today.com/en/currencies",
  "https://sp-today.com/"
];

async function viaShell(url) {
  const res = await fetch("/__shell/getir?url=" + encodeURIComponent(url), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

/* Etiketin yakınındaki ilk makul sayıyı ayıklar.
   Yeni lira 100–400 bandında; eski lira yazılmışsa 100'e bölünür. */
function pickRate(text, labels, lo, hi) {
  for (const label of labels) {
    let from = 0;
    for (let k = 0; k < 6; k++) {
      const i = text.indexOf(label, from);
      if (i < 0) break;
      from = i + label.length;
      const win = text.slice(i, i + 260).replace(/,/g, "");
      for (const m of win.matchAll(/\d+(?:\.\d+)?/g)) {
        let v = parseFloat(m[0]);
        if (!isFinite(v) || v <= 0) continue;
        if (v >= lo * 100 && v <= hi * 100) v = v / 100;   // eski lira yazılmış
        if (v >= lo && v <= hi) return v;
      }
    }
  }
  return 0;
}

async function fetchMarketRates() {
  if (!window.shell || window.shell.kind !== "desktop") throw new Error("kabuk yok");
  let lastErr = null;
  for (const page of MARKET_PAGES) {
    try {
      const html = await viaShell(page);
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                       .replace(/<style[\s\S]*?<\/style>/gi, " ")
                       .replace(/<[^>]+>/g, " ")
                       .replace(/&nbsp;/g, " ")
                       .replace(/\s+/g, " ");
      const syp = pickRate(text, ["USD", "US Dollar", "دولار"], 40, 2000);
      if (!syp) { lastErr = new Error("USD satırı bulunamadı"); continue; }
      /* Türk lirası da Suriye piyasasındaki değeriyle: 1 USD = syp / (TRY→SYP) */
      const tryInSyp = pickRate(text, ["TRY", "Turkish", "تركي"], 0.5, 60);
      const rateTry = tryInSyp > 0 ? syp / tryInSyp : 0;
      return { rateSyp: syp, rateTry: rateTry || null, src: "sp-today.com", market: true };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("piyasa kuru okunamadı");
}

async function fetchOfficialRates() {
  let lastErr = null;
  for (const url of RATE_SOURCES) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      const data = await res.json();
      let r = data.rates || data.conversion_rates || data.usd || {};
      r = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toUpperCase(), v]));
      const tryR = parseFloat(r.TRY);
      let sypR = parseFloat(r.SYP);
      if (!(tryR > 0)) { lastErr = new Error("TRY yok"); continue; }
      if (sypR > 2000) sypR = sypR / 100;          // eski lira veren kaynaklar
      return { rateTry: tryR, rateSyp: sypR > 0 ? sypR : null,
               src: new URL(url).hostname, market: false };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("kaynak yok");
}

/* Önce Suriye piyasası, olmazsa resmî kaynak. */
async function fetchRates(preferMarket) {
  if (preferMarket !== false) {
    try { return await fetchMarketRates(); } catch (e) { /* resmîye düş */ }
  }
  return fetchOfficialRates();
}

window.CALC = { compute, fmt, convert, fmtHours, fetchRates,
                fetchMarketRates, fetchOfficialRates, CURRENCIES, num: n };
