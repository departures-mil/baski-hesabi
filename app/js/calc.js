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

/* ---- çevrimiçi kur ---- */
const RATE_SOURCES = [
  "https://open.er-api.com/v6/latest/USD",
  "https://api.exchangerate-api.com/v4/latest/USD",
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
];

async function fetchRates() {
  let lastErr = null;
  for (const url of RATE_SOURCES) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      const data = await res.json();
      let r = data.rates || data.conversion_rates || data.usd || {};
      r = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toUpperCase(), v]));
      const tryR = parseFloat(r.TRY), sypR = parseFloat(r.SYP);
      if (!(tryR > 0)) { lastErr = new Error("TRY yok"); continue; }
      return { rateTry: tryR, rateSyp: sypR > 0 ? sypR : null, src: new URL(url).hostname };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("kaynak yok");
}

window.CALC = { compute, fmt, convert, fmtHours, fetchRates, CURRENCIES, num: n };
