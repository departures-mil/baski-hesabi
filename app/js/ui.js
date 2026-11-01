/* Baskı Hesabı — ekranlar ve akış. */

window.APP_VERSION = "1.5";

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nz = v => CALC.num(v);

const S = {                 // oturum durumu
  settings: null,
  filaments: [], printers: [], customers: [], groups: [], expenses: [],
  records: [], spools: [],
  screen: "calc"
};

/* ---------------- küçük yardımcılar ---------------- */
function toast(msg, kind) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (kind ? " " + kind : "");
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 3200);
}

function modal(title, bodyHtml, buttons) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = bodyHtml;
  const foot = $("#modalFoot");
  foot.innerHTML = "";
  (buttons || []).forEach(b => {
    const btn = document.createElement("button");
    btn.className = "btn" + (b.kind ? " " + b.kind : "");
    btn.textContent = b.label;
    btn.onclick = () => b.onClick ? b.onClick() : closeModal();
    foot.appendChild(btn);
  });
  $("#modalWrap").hidden = false;
  applyI18n($("#modalBody"));
  const first = $("#modalBody input, #modalBody select, #modalBody textarea");
  if (first) setTimeout(() => first.focus(), 40);
}
function closeModal() { $("#modalWrap").hidden = true; }

function confirmBox(text, onYes) {
  modal(t("ok"), `<p style="margin:0">${esc(text)}</p>`, [
    { label: t("cancel"), onClick: closeModal },
    { label: t("yes"), kind: "pri", onClick: () => { closeModal(); onYes(); } }
  ]);
}

const today = () => new Date().toISOString().slice(0, 10);
const money = (usd, cur) =>
  CALC.fmt(usd, cur || S._recCur || S.settings.primaryCurrency, S.settings);
function allThree(usd) {
  return [CALC.fmt(usd, "USD", S.settings), CALC.fmt(usd, "TRY", S.settings), CALC.fmt(usd, "SYP", S.settings)];
}
function dateStr(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString(I18N[LANG]._locale);
}
function opts(list, sel, placeholder) {
  let h = `<option value="">${esc(placeholder || "—")}</option>`;
  list.forEach(x => {
    h += `<option value="${esc(x.id)}"${x.id === sel ? " selected" : ""}>${esc(x.name)}</option>`;
  });
  return h;
}
const byId = (list, id) => list.find(x => x.id === id) || null;
const nameOf = (list, id, fallback) => (byId(list, id) || {}).name || fallback || "—";

async function reload() {
  S.settings = await DB.getSettings();
  const [f, p, c, g, e, r, s] = await Promise.all([
    DB.all("filaments"), DB.all("printers"), DB.all("customers"), DB.all("groups"),
    DB.all("expenses"), DB.all("records"), DB.all("spools")
  ]);
  S.filaments = f.sort(byName); S.printers = p.sort(byName); S.customers = c.sort(byName);
  S.groups = g.sort(byName); S.expenses = e.sort(byName); S.spools = s;
  S.records = r.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), I18N[LANG]._locale);

/* ======================================================================
   HESAPLA
   ====================================================================== */
function screenCalc() {
  const st = S.settings;
  const f = byId(S.filaments, st.defFilamentId);
  const p = byId(S.printers, st.defPrinterId);

  return `
  <h1 data-i18n="calc_title"></h1>
  <p class="lead" data-i18n="calc_sub"></p>

  <div class="grid3">
    <section class="panel">
      <h2 data-i18n="material"></h2>

      <div class="field">
        <label data-i18n="filament"></label>
        <div class="inp"><select id="cFil">${opts(S.filaments, st.defFilamentId, t("none"))}</select></div>
      </div>
      <div class="field">
        <label data-i18n="filament_price"></label>
        <div class="inp"><span>$</span><input id="cKg" type="number" min="0" step="0.01" value="${f ? f.price || 20 : 20}"><span data-i18n="per_kg"></span></div>
      </div>
      <div class="field">
        <label data-i18n="part_weight"></label>
        <div class="inp"><input id="cGram" type="number" min="0" step="1" value="120"><span data-i18n="grams"></span></div>
      </div>

      <p class="sec" data-i18n="electricity"></p>
      <div class="field">
        <label data-i18n="printer"></label>
        <div class="inp"><select id="cPrn">${opts(S.printers, st.defPrinterId, t("none"))}</select></div>
      </div>
      <div class="field">
        <label data-i18n="printer_power"></label>
        <div class="inp"><input id="cWatt" type="number" min="0" step="1" value="${p ? p.watt || 150 : 150}"><span data-i18n="watt"></span></div>
      </div>
      <div class="field">
        <label data-i18n="kwh_price"></label>
        <div class="inp"><span>$</span><input id="cKwh" type="number" min="0" step="0.001" value="${st.defKwhPrice}"><span data-i18n="per_kwh"></span></div>
        <p class="sub"><span data-i18n="hourly_power"></span>: <b id="cHourly">$0.000</b></p>
      </div>

      <p class="sec" data-i18n="duration"></p>
      <div class="field"><div class="pair">
        <div class="inp"><input id="cH" type="number" min="0" step="1" value="6"><span data-i18n="hours"></span></div>
        <div class="inp"><input id="cM" type="number" min="0" max="59" step="1" value="30"><span data-i18n="minutes"></span></div>
      </div></div>

      <div class="field">
        <label data-i18n="qty"></label>
        <div class="inp"><input id="cQty" type="number" min="1" step="1" value="1"></div>
      </div>
      <div class="field">
        <label data-i18n="profit_rate"></label>
        <div class="inp"><input id="cMargin" type="number" min="0" step="1" value="${st.defMargin}"><span>%</span></div>
      </div>
    </section>

    <section class="panel">
      <h2 data-i18n="extras"></h2>

      <label class="chk head" style="--acc:var(--labor)">
        <input type="checkbox" id="cLaborOn"${st.defLaborOn ? " checked" : ""}> <span data-i18n="labor"></span></label>
      <div class="group" id="gLabor">
        <div class="field"><label data-i18n="labor_rate"></label>
          <div class="inp"><span>$</span><input id="cLaborRate" type="number" min="0" step="0.5" value="${st.defLaborRate}"><span>/ ${esc(t("hours"))}</span></div></div>
        <div class="field"><label data-i18n="labor_time"></label>
          <div class="inp"><input id="cLaborMin" type="number" min="0" step="1" value="${st.defLaborMin}"><span data-i18n="minutes"></span></div></div>
      </div>

      <label class="chk head" style="--acc:var(--wear)">
        <input type="checkbox" id="cWearOn"${st.defWearOn ? " checked" : ""}> <span data-i18n="wear"></span></label>
      <div class="group" id="gWear">
        <div class="field"><label data-i18n="machine_price"></label>
          <div class="inp"><span>$</span><input id="cMachine" type="number" min="0" step="10" value="${p ? p.price || 400 : 400}"></div></div>
        <div class="field"><label data-i18n="machine_life"></label>
          <div class="inp"><input id="cLife" type="number" min="0" step="100" value="${p ? p.life || 5000 : 5000}"><span data-i18n="hours"></span></div></div>
      </div>

      <label class="chk head" style="--acc:var(--fail)">
        <input type="checkbox" id="cFailOn"${st.defFailOn ? " checked" : ""}> <span data-i18n="fail"></span></label>
      <div class="group" id="gFail">
        <div class="field"><label data-i18n="fail_rate"></label>
          <div class="inp"><input id="cFailRate" type="number" min="0" step="1" value="${st.defFailRate}"><span>%</span></div></div>
      </div>

      <div class="photobox${S._calcPhoto ? " has" : ""}" id="photoBox">
        ${S._calcPhoto
          ? `<img src="${S._calcPhoto}" alt=""><button type="button" class="rm" id="photoRm" data-i18n="photo_remove"></button>`
          : `<div class="ph"><i></i><span data-i18n="photo_hint"></span></div>`}
        <input type="file" id="photoInp" accept="image/*" hidden>
      </div>

      ${S.expenses.length ? `<p class="sec" data-i18n="extra_cost"></p><div id="cExtras">${
        S.expenses.map(x => `
        <label class="chk" style="margin-top:9px"><input type="checkbox" class="exOn" data-id="${esc(x.id)}">
          <span>${esc(x.name)}</span></label>
        <div class="field" style="margin-top:5px;padding-inline-start:26px">
          <div class="inp"><span>$</span><input class="exAmt" data-id="${esc(x.id)}" type="number" min="0" step="0.1" value="${nz(x.price) || 0}"></div>
        </div>`).join("")}</div>` : ""}
    </section>

    <section class="panel sticky">
      <h2 data-i18n="sale_price"></h2>

      <p class="price-label">${esc(t("sale_price"))} — USD</p>
      <p class="p-main" id="rUsd">$0.00</p>
      <p class="price-label">TRY</p>
      <p class="p-alt" id="rTry">₺0,00</p>
      <p class="price-label">SYP</p>
      <p class="p-alt" id="rSyp">0 <em>SYP</em></p>

      <div class="stackrow">
        <div class="stack" id="rStack" aria-hidden="true"></div>
        <div class="legend">
          <div class="leg" data-k="filament"><i style="background:var(--filament)"></i><span data-i18n="filament"></span><b>$0.00</b></div>
          <div class="leg" data-k="power"><i style="background:var(--power)"></i><span data-i18n="electricity"></span><b>$0.00</b></div>
          <div class="leg" data-k="labor"><i style="background:var(--labor)"></i><span data-i18n="labor"></span><b>$0.00</b></div>
          <div class="leg" data-k="wear"><i style="background:var(--wear)"></i><span data-i18n="wear"></span><b>$0.00</b></div>
          <div class="leg" data-k="extras"><i style="background:#7FB069"></i><span data-i18n="extras"></span><b>$0.00</b></div>
          <div class="leg" data-k="fail"><i style="background:var(--fail)"></i><span data-i18n="fail"></span><b>$0.00</b></div>
          <div class="leg" data-k="profit"><i style="background:var(--profit)"></i><span data-i18n="profit"></span><b>$0.00</b></div>
        </div>
      </div>

      <div class="totals">
        <div class="trow strong"><span data-i18n="unit_cost"></span><b id="rCost">$0.00</b></div>
        <div class="trow"><span data-i18n="cost_per_gram"></span><b id="rGram">—</b></div>
        <div class="trow"><span data-i18n="total_time"></span><b id="rTime">—</b></div>
        <div class="trow" id="rQtyRow" hidden><span id="rQtyLab"></span><b id="rQtyVal"></b></div>
      </div>

      <div class="btnrow">
        <button class="btn pri" id="bSave" data-i18n="save_record"></button>
        <button class="btn" id="bReset" data-i18n="reset_form"></button>
      </div>
      <p class="note" data-i18n="calc_note"></p>
    </section>
  </div>`;
}

function readCalcForm() {
  const ex = [];
  $$(".exOn").forEach(c => {
    if (c.checked) {
      const amt = $(`.exAmt[data-id="${c.dataset.id}"]`);
      ex.push({ id: c.dataset.id, name: nameOf(S.expenses, c.dataset.id), amount: nz(amt && amt.value) });
    }
  });
  return {
    filamentId: $("#cFil").value || null,
    printerId: $("#cPrn").value || null,
    kgPrice: nz($("#cKg").value), grams: nz($("#cGram").value),
    watt: nz($("#cWatt").value), kwhPrice: nz($("#cKwh").value),
    hours: nz($("#cH").value), minutes: nz($("#cM").value),
    qty: Math.max(1, Math.round(nz($("#cQty").value) || 1)),
    margin: nz($("#cMargin").value),
    laborOn: $("#cLaborOn").checked, laborRate: nz($("#cLaborRate").value), laborMin: nz($("#cLaborMin").value),
    wearOn: $("#cWearOn").checked, machinePrice: nz($("#cMachine").value), machineLife: nz($("#cLife").value),
    failOn: $("#cFailOn").checked, failRate: nz($("#cFailRate").value),
    extras: ex,
    photo: S._calcPhoto || null
  };
}

function paintCalc() {
  const p = readCalcForm();
  const r = CALC.compute(p);

  $("#cHourly").textContent = "$" + r.perHour.toFixed(3);
  ["labor", "wear", "fail"].forEach(k => {
    const on = $("#c" + k[0].toUpperCase() + k.slice(1) + "On").checked;
    $("#g" + k[0].toUpperCase() + k.slice(1)).classList.toggle("off", !on);
  });

  const parts = { filament: r.filament, power: r.power, labor: r.labor, wear: r.wear,
                  extras: r.extras, fail: r.fail, profit: r.profit };
  $$(".leg").forEach(el => {
    const v = parts[el.dataset.k] || 0;
    $("b", el).textContent = CALC.fmt(v, "USD");
    el.classList.toggle("zero", v <= 0);
  });

  const [u, ty, sy] = allThree(r.price);
  $("#rUsd").textContent = u;
  $("#rTry").textContent = ty;
  $("#rSyp").innerHTML = CALC.fmt(r.price, "SYP", S.settings, { bare: true }) + ' <em>SYP</em>';
  $("#rCost").textContent = CALC.fmt(r.cost, "USD");
  $("#rGram").textContent = r.grams > 0 ? "$" + r.costPerGram.toFixed(3) : "—";
  $("#rTime").textContent = CALC.fmtHours(r.hours);

  const qrow = $("#rQtyRow");
  if (r.qty > 1) {
    qrow.hidden = false;
    $("#rQtyLab").textContent = t("total_for_qty", { n: r.qty });
    $("#rQtyVal").textContent = CALC.fmt(r.totalPrice, "USD");
  } else qrow.hidden = true;

  drawStack($("#rStack"), [
    [r.filament, "var(--filament)"], [r.power, "var(--power)"], [r.labor, "var(--labor)"],
    [r.wear, "var(--wear)"], [r.extras, "#7FB069"], [r.fail, "var(--fail)"], [r.profit, "var(--profit)"]
  ], r.price);
}

function drawStack(host, slices, total) {
  const N = 30;
  if (host.children.length !== N) {
    host.innerHTML = "";
    for (let i = 0; i < N; i++) host.appendChild(document.createElement("i"));
  }
  [...host.children].forEach((el, i) => {
    if (!(total > 0)) { el.style.background = "var(--line)"; return; }
    const pos = ((i + 0.5) / N) * total;
    let acc = 0, color = "var(--line)";
    for (const [v, c] of slices) { acc += v; if (pos < acc) { color = c; break; } }
    el.style.background = color;
  });
}

/* Hesap ekranındaki parça fotoğrafı: tıkla ya da sürükle. Küçültülüp
   saklanır, "Kayda geç" ile kayda da geçer. */
function bindPhotoBox() {
  const box = $("#photoBox");
  if (!box) return;
  const inp = $("#photoInp");

  const al = async file => {
    if (!file || !file.type.startsWith("image/")) return;
    S._calcPhoto = await shrinkImage(file);
    render();
  };

  box.onclick = e => { if (e.target.id !== "photoRm" && !S._calcPhoto) inp.click(); };
  inp.onchange = e => al(e.target.files[0]);

  const rm = $("#photoRm");
  if (rm) rm.onclick = e => { e.stopPropagation(); S._calcPhoto = null; render(); };

  box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("over"); });
  box.addEventListener("dragleave", () => box.classList.remove("over"));
  box.addEventListener("drop", e => {
    e.preventDefault(); box.classList.remove("over");
    al(e.dataTransfer.files && e.dataTransfer.files[0]);
  });
}

function bindCalc() {
  const repaint = () => paintCalc();
  $$("#main input, #main select").forEach(el => {
    el.addEventListener("input", repaint);
    el.addEventListener("change", repaint);
  });

  $("#cFil").addEventListener("change", e => {
    const f = byId(S.filaments, e.target.value);
    if (f && nz(f.price)) $("#cKg").value = f.price;
    repaint();
  });
  $("#cPrn").addEventListener("change", e => {
    const p = byId(S.printers, e.target.value);
    if (p) {
      if (nz(p.watt)) $("#cWatt").value = p.watt;
      if (nz(p.price)) $("#cMachine").value = p.price;
      if (nz(p.life)) $("#cLife").value = p.life;
    }
    repaint();
  });

  bindPhotoBox();

  $("#bReset").onclick = () => { S._calcPhoto = null; render(); };
  $("#bSave").onclick = () => openRecordForm(null, readCalcForm());
  paintCalc();
}

/* ======================================================================
   KAYITLAR
   ====================================================================== */
const PAY_KINDS = ["paid", "pending", "deposit", "cancelled"];

function screenRecords() {
  return `
  <h1 data-i18n="records_title"></h1>
  <div class="statrow" id="recStats"></div>

  <div class="toolbar">
    <div class="inp"><input id="fSearch" type="search" data-i18n-ph="search"></div>
    <div class="inp narrow"><select id="fPrinter"><option value="">${esc(t("nav_printers"))}: ${esc(t("all"))}</option>${
      S.printers.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></div>
    <div class="inp narrow"><select id="fCustomer"><option value="">${esc(t("customer"))}: ${esc(t("all"))}</option>${
      S.customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></div>
    <div class="inp narrow"><select id="fPay"><option value="">${esc(t("payment"))}: ${esc(t("all"))}</option>${
      PAY_KINDS.map(k => `<option value="${k}">${esc(t("pay_" + k))}</option>`).join("")}</select></div>
    <div class="inp narrow"><input id="fFrom" type="date" data-i18n-title="filter_from"></div>
    <div class="inp narrow"><input id="fTo" type="date" data-i18n-title="filter_to"></div>
    <div class="inp narrow"><select id="fCur">${["USD", "TRY", "SYP"].map(c =>
      `<option value="${c}"${(S._recCur || S.settings.primaryCurrency) === c ? " selected" : ""}>${c}</option>`).join("")}</select></div>
    <button class="btn pri" id="bNewRec" data-i18n="new_record"></button>
  </div>

  <div id="recList"></div>`;
}

function filteredRecords() {
  const q = ($("#fSearch")?.value || "").toLowerCase().trim();
  const pr = $("#fPrinter")?.value || "";
  const cu = $("#fCustomer")?.value || "";
  const pay = $("#fPay")?.value || "";
  const from = $("#fFrom")?.value || "";
  const to = $("#fTo")?.value || "";

  return S.records.filter(r => {
    if (pr && r.printerId !== pr) return false;
    if (cu && r.customerId !== cu) return false;
    if (pay && (r.payment || "pending") !== pay) return false;
    if (from && String(r.date || "") < from) return false;
    if (to && String(r.date || "") > to) return false;
    if (q) {
      const hay = [r.partName, nameOf(S.customers, r.customerId, r.customerName),
                   nameOf(S.printers, r.printerId, r.printerName),
                   nameOf(S.filaments, r.filamentId, r.filamentName),
                   r.note, r.failReason].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function paintRecords() {
  const list = filteredRecords();
  const sum = list.reduce((a, r) => {
    const live = (r.payment !== "cancelled");
    a.cost += live ? nz(r.totalCost) : 0;
    a.rev += live ? nz(r.totalPrice) : 0;
    a.profit += live ? nz(r.totalProfit) : 0;
    a.n += 1;
    return a;
  }, { cost: 0, rev: 0, profit: 0, n: 0 });

  $("#recStats").innerHTML = `
    <div class="stat"><em data-i18n="count_prints"></em><b>${sum.n}</b></div>
    <div class="stat"><em data-i18n="revenue"></em><b>${esc(money(sum.rev))}</b></div>
    <div class="stat"><em data-i18n="total_cost"></em><b>${esc(money(sum.cost))}</b></div>
    <div class="stat"><em data-i18n="total_profit"></em><b>${esc(money(sum.profit))}</b></div>`;

  $("#recList").innerHTML = list.length ? `
    <div class="tablewrap"><table>
      <thead><tr>
        <th></th><th data-i18n="part_name"></th><th data-i18n="date"></th>
        <th data-i18n="printer"></th><th data-i18n="customer"></th>
        <th class="num" data-i18n="qty"></th>
        <th class="num" data-i18n="unit_cost"></th>
        <th class="num" data-i18n="sale_price"></th>
        <th class="num" data-i18n="profit"></th>
        <th data-i18n="payment"></th><th></th>
      </tr></thead>
      <tbody>${list.map(rowRecord).join("")}</tbody>
    </table></div>` : `<div class="empty" data-i18n="no_records"></div>`;

  applyI18n($("#main"));
  $$("[data-edit]").forEach(b => b.onclick = () => openRecordForm(byId(S.records, b.dataset.edit)));
  $$("[data-del]").forEach(b => b.onclick = () => confirmBox(t("delete_confirm"), async () => {
    await DB.del("records", b.dataset.del);
    await reload(); render(); toast(t("deleted"));
  }));
  $$("[data-quote]").forEach(b => b.onclick = () => printQuote(byId(S.records, b.dataset.quote)));
  $$("img.thumb[data-thumb]").forEach(img => loadThumb(img));
}

function rowRecord(r) {
  const pay = r.payment || "pending";
  return `<tr>
    <td>${r.photoId ? `<img class="thumb" data-thumb="${esc(r.photoId)}" alt="">` : ""}</td>
    <td>${esc(r.partName || "—")}${r.failed ? ` <span class="pill failed">${esc(t("failed"))}</span>` : ""}</td>
    <td>${esc(dateStr(r.date))}</td>
    <td>${esc(nameOf(S.printers, r.printerId, r.printerName))}</td>
    <td>${esc(nameOf(S.customers, r.customerId, r.customerName))}</td>
    <td class="num">${r.qty || 1}</td>
    <td class="num">${esc(money(nz(r.totalCost)))}</td>
    <td class="num">${esc(money(nz(r.totalPrice)))}</td>
    <td class="num">${esc(money(nz(r.totalProfit)))}</td>
    <td><span class="pill ${pay}">${esc(t("pay_" + pay))}</span></td>
    <td class="act">
      <button class="icon-btn" data-quote="${esc(r.id)}" title="${esc(t("print_quote"))}">⎙</button>
      <button class="icon-btn" data-edit="${esc(r.id)}" title="${esc(t("edit"))}">✎</button>
      <button class="icon-btn" data-del="${esc(r.id)}" title="${esc(t("remove"))}">🗑</button>
    </td></tr>`;
}

async function loadThumb(img) {
  const f = await DB.getFile(img.dataset.thumb);
  if (f && f.data) img.src = f.data;
}

function openRecordForm(rec, fromCalc) {
  const r = rec || {};
  const c = fromCalc || null;
  const computed = c ? CALC.compute(c) : null;

  const g = k => r[k] ?? (c ? c[k] : "") ?? "";
  modal(rec ? t("edit_record") : t("new_record"), `
    <div class="grid2">
      <div>
        <div class="field"><label data-i18n="part_name"></label>
          <div class="inp"><input id="mName" value="${esc(r.partName || "")}"></div></div>
        <div class="field"><label data-i18n="date"></label>
          <div class="inp"><input id="mDate" type="date" value="${esc(r.date || today())}"></div></div>
        <div class="field"><label data-i18n="customer"></label>
          <div class="inp"><select id="mCustomer">${opts(S.customers, r.customerId, t("none"))}</select></div></div>
        <div class="field"><label data-i18n="group"></label>
          <div class="inp"><select id="mGroup">${opts(S.groups, r.groupId, t("none"))}</select></div></div>
        <div class="field"><label data-i18n="printer"></label>
          <div class="inp"><select id="mPrinter">${opts(S.printers, r.printerId ?? (c && c.printerId), t("none"))}</select></div></div>
        <div class="field"><label data-i18n="filament"></label>
          <div class="inp"><select id="mFilament">${opts(S.filaments, r.filamentId ?? (c && c.filamentId), t("none"))}</select></div></div>
      </div>
      <div>
        <div class="field"><label data-i18n="payment"></label>
          <div class="inp"><select id="mPay">${PAY_KINDS.map(k =>
            `<option value="${k}"${(r.payment || "pending") === k ? " selected" : ""}>${esc(t("pay_" + k))}</option>`).join("")}</select></div></div>
        <div class="field"><label data-i18n="delivery_date"></label>
          <div class="inp"><input id="mDelivery" type="date" value="${esc(r.deliveryDate || "")}"></div></div>
        <div class="field"><div class="pair">
          <div><label data-i18n="layer_h"></label>
            <div class="inp"><input id="mLayer" type="number" step="0.01" min="0" value="${esc(r.layerH ?? "")}"><span>mm</span></div></div>
          <div><label data-i18n="infill"></label>
            <div class="inp"><input id="mInfill" type="number" step="1" min="0" max="100" value="${esc(r.infill ?? "")}"><span>%</span></div></div>
        </div></div>
        <label class="chk head" style="--acc:var(--fail)"><input type="checkbox" id="mFailed"${r.failed ? " checked" : ""}>
          <span data-i18n="failed"></span></label>
        <div class="field"><label data-i18n="fail_reason"></label>
          <div class="inp"><input id="mFailReason" value="${esc(r.failReason || "")}"></div></div>
      </div>
    </div>

    <div class="field"><label data-i18n="note"></label>
      <div class="inp"><textarea id="mNote">${esc(r.note || "")}</textarea></div></div>

    <div class="pair" style="margin-top:11px">
      <div class="field"><label data-i18n="photo"></label>
        <div class="inp"><input id="mPhoto" type="file" accept="image/*"></div>
        ${(c && c.photo) ? `<div class="photoprev"><img src="${c.photo}" alt="">
          <span data-i18n="photo_hint"></span></div>` : ""}</div>
      <div class="field"><label data-i18n="attachment"></label>
        <div class="inp"><input id="mFile" type="file"></div></div>
    </div>

    ${computed ? `<div class="totals" style="margin-top:16px">
      <div class="trow"><span data-i18n="qty"></span><b>${computed.qty}</b></div>
      <div class="trow"><span data-i18n="total_cost"></span><b>${esc(CALC.fmt(computed.totalCost, "USD"))}</b></div>
      <div class="trow strong"><span data-i18n="sale_price"></span><b>${esc(CALC.fmt(computed.totalPrice, "USD"))}</b></div>
    </div>` : `<div class="totals" style="margin-top:16px">
      <div class="trow"><span data-i18n="total_cost"></span><b>${esc(money(nz(r.totalCost)))}</b></div>
      <div class="trow strong"><span data-i18n="sale_price"></span><b>${esc(money(nz(r.totalPrice)))}</b></div>
    </div>`}
  `, [
    { label: t("cancel"), onClick: closeModal },
    { label: t("save"), kind: "pri", onClick: () => saveRecord(r, c, computed) }
  ]);
}

async function saveRecord(r, c, computed) {
  const doc = Object.assign({}, r);
  doc.partName = $("#mName").value.trim();
  doc.date = $("#mDate").value || today();
  doc.customerId = $("#mCustomer").value || null;
  doc.groupId = $("#mGroup").value || null;
  doc.printerId = $("#mPrinter").value || null;
  doc.filamentId = $("#mFilament").value || null;
  doc.payment = $("#mPay").value || "pending";
  doc.deliveryDate = $("#mDelivery").value || null;
  doc.layerH = nz($("#mLayer").value) || null;
  doc.infill = nz($("#mInfill").value) || null;
  doc.failed = $("#mFailed").checked;
  doc.failReason = $("#mFailReason").value.trim();
  doc.note = $("#mNote").value.trim();

  /* adları da saklarız: kategori sonradan silinirse kayıt okunur kalsın */
  doc.customerName = nameOf(S.customers, doc.customerId, doc.customerName);
  doc.printerName = nameOf(S.printers, doc.printerId, doc.printerName);
  doc.filamentName = nameOf(S.filaments, doc.filamentId, doc.filamentName);

  if (c && computed) {
    Object.assign(doc, {
      kgPrice: c.kgPrice, grams: c.grams, watt: c.watt, kwhPrice: c.kwhPrice,
      hours: c.hours, minutes: c.minutes, qty: computed.qty, margin: c.margin,
      laborOn: c.laborOn, laborRate: c.laborRate, laborMin: c.laborMin,
      wearOn: c.wearOn, machinePrice: c.machinePrice, machineLife: c.machineLife,
      failOn: c.failOn, failRate: c.failRate, extras: c.extras,
      costFilament: computed.filament, costPower: computed.power, costLabor: computed.labor,
      costWear: computed.wear, costExtras: computed.extras, costFail: computed.fail,
      unitCost: computed.cost, unitPrice: computed.price, unitProfit: computed.profit,
      totalCost: computed.totalCost, totalPrice: computed.totalPrice, totalProfit: computed.totalProfit,
      totalGrams: computed.totalGrams, totalHours: computed.hours * computed.qty,
      rateTry: S.settings.rateTry, rateSyp: S.settings.rateSyp
    });
  }

  const photo = $("#mPhoto").files[0];
  if (photo) {
    doc.photoId = await DB.putFile(await shrinkImage(photo), { name: photo.name, kind: "photo" });
  } else if (c && c.photo && !doc.photoId) {
    /* hesap ekranında seçilen fotoğraf kayda geçer */
    doc.photoId = await DB.putFile(c.photo, { name: "parca.jpg", kind: "photo" });
  }
  const file = $("#mFile").files[0];
  if (file) {
    if (file.size > 4 * 1024 * 1024) toast(t("fb_missing"), "bad");
    doc.fileId = await DB.putFile(await readAsDataUrl(file), { name: file.name, kind: "file", size: file.size });
    doc.fileName = file.name;
  }

  const isNew = !doc.id;
  await DB.put("records", doc);
  if (isNew && !doc.failed) await deductStock(doc);

  closeModal();
  if (c) S._calcPhoto = null;
  await reload();
  S.screen = "records";
  render();
  toast(t("saved"), "good");
}

function readAsDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}

/* Fotoğrafı eşitlemeye sığacak boya indirir. */
function shrinkImage(file, max) {
  max = max || 900;
  return new Promise(async res => {
    try {
      const url = await readAsDataUrl(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => res(url);
      img.src = url;
    } catch (e) { res(null); }
  });
}

async function deductStock(rec) {
  if (!rec.filamentId || !(nz(rec.totalGrams) > 0)) return;
  const spools = S.spools.filter(s => s.filamentId === rec.filamentId && nz(s.remaining) > 0)
                         .sort((a, b) => nz(a.remaining) - nz(b.remaining));
  let left = nz(rec.totalGrams);
  for (const s of spools) {
    if (left <= 0) break;
    const take = Math.min(nz(s.remaining), left);
    s.remaining = nz(s.remaining) - take;
    left -= take;
    await DB.put("spools", s);
  }
}

/* ======================================================================
   YAZICILAR
   ====================================================================== */
function printerStats(printerId) {
  const rs = S.records.filter(r => r.printerId === printerId);
  const live = rs.filter(r => r.payment !== "cancelled");
  return {
    prints: rs.length,
    parts: rs.reduce((a, r) => a + (r.qty || 1), 0),
    hours: rs.reduce((a, r) => a + nz(r.totalHours), 0),
    grams: rs.reduce((a, r) => a + nz(r.totalGrams), 0),
    revenue: live.reduce((a, r) => a + nz(r.totalPrice), 0),
    cost: live.reduce((a, r) => a + nz(r.totalCost), 0),
    profit: live.reduce((a, r) => a + nz(r.totalProfit), 0),
    failed: rs.filter(r => r.failed).length
  };
}

function screenPrinters() {
  if (!S.printers.length) {
    return `<h1 data-i18n="printers_title"></h1><p class="lead" data-i18n="printers_sub"></p>
      <div class="empty" data-i18n="empty_list"></div>
      <div class="btnrow"><button class="btn pri" id="bAddPrinter" data-i18n="add_printer"></button></div>`;
  }
  return `
  <h1 data-i18n="printers_title"></h1>
  <p class="lead" data-i18n="printers_sub"></p>
  <div class="cards">${S.printers.map(p => {
    const s = printerStats(p.id);
    return `<div class="card">
      <h3>${esc(p.name)}</h3>
      <p class="cardsub">${nz(p.watt)} W · ${esc(CALC.fmt(nz(p.price), "USD"))} · ${nz(p.life)} ${esc(t("hours"))}</p>
      <div class="kv"><span data-i18n="produced"></span><b>${s.parts}</b></div>
      <div class="kv"><span data-i18n="print_hours"></span><b>${s.hours.toFixed(1)}</b></div>
      <div class="kv"><span data-i18n="filament_used"></span><b>${Math.round(s.grams)} g</b></div>
      <div class="kv"><span data-i18n="earned"></span><b>${esc(money(s.revenue))}</b></div>
      <div class="kv"><span data-i18n="printer_profit"></span><b>${esc(money(s.profit))}</b></div>
      <div class="kv"><span data-i18n="fail_count"></span><b>${s.failed}</b></div>
      <div class="btnrow"><button class="btn" data-prec="${esc(p.id)}" data-i18n="nav_records"></button></div>
    </div>`;
  }).join("")}</div>
  <div class="btnrow"><button class="btn" id="bAddPrinter" data-i18n="add_printer"></button></div>`;
}

function bindPrinters() {
  const add = $("#bAddPrinter");
  if (add) add.onclick = () => catForm("printers", null);
  $$("[data-prec]").forEach(b => b.onclick = () => {
    S.screen = "records"; S._pendingPrinter = b.dataset.prec; render();
  });
}

/* ======================================================================
   KATEGORİLER
   ====================================================================== */
const CAT_DEFS = {
  filaments: { title: "cat_filaments", fields: ["name", "price", "color", "note"] },
  printers:  { title: "cat_printers",  fields: ["name", "watt", "price", "life", "note"] },
  customers: { title: "cat_customers", fields: ["name", "phone", "note"] },
  groups:    { title: "cat_groups",    fields: ["name", "note"] },
  expenses:  { title: "cat_expenses",  fields: ["name", "price", "note"] }
};

function screenCats() {
  return `
  <h1 data-i18n="cats_title"></h1>
  <p class="lead" data-i18n="cats_sub"></p>
  <div class="grid2">${Object.keys(CAT_DEFS).map(k => {
    const list = S[k];
    return `<section class="panel">
      <h2 data-i18n="${CAT_DEFS[k].title}"></h2>
      <div class="rows">${list.length ? list.map(x => `
        <div class="row">
          ${k === "filaments" ? `<i class="swatch" style="background:${esc(x.color || "#45C8BE")}"></i>` : ""}
          <span class="rname">${esc(x.name)}</span>
          <span class="rmeta">${esc(catMeta(k, x))}</span>
          <button class="icon-btn" data-cedit="${k}:${esc(x.id)}" title="${esc(t("edit"))}">✎</button>
          <button class="icon-btn" data-cdel="${k}:${esc(x.id)}" title="${esc(t("remove"))}">🗑</button>
        </div>`).join("") : `<div class="empty" data-i18n="empty_list"></div>`}</div>
      <div class="btnrow"><button class="btn" data-cadd="${k}" data-i18n="add"></button></div>
    </section>`;
  }).join("")}</div>`;
}

function catMeta(kind, x) {
  if (kind === "filaments") return nz(x.price) ? CALC.fmt(nz(x.price), "USD") + " / kg" : "";
  if (kind === "printers") return [nz(x.watt) ? nz(x.watt) + " W" : "", nz(x.life) ? nz(x.life) + " " + t("hours") : ""].filter(Boolean).join(" · ");
  if (kind === "customers") return x.phone || "";
  if (kind === "expenses") return nz(x.price) ? CALC.fmt(nz(x.price), "USD") : "";
  return "";
}

function catForm(kind, item) {
  const def = CAT_DEFS[kind];
  const x = item || {};
  const labels = { name: "name", price: "price", color: "color", note: "note_field",
                   phone: "phone", watt: "printer_power", life: "machine_life" };
  const body = def.fields.map(f => {
    if (f === "color") return `<div class="field"><label data-i18n="color"></label>
      <div class="inp"><input id="f_color" type="color" value="${esc(x.color || "#45C8BE")}" style="padding:6px 0"></div></div>`;
    if (f === "note") return `<div class="field"><label data-i18n="note_field"></label>
      <div class="inp"><input id="f_note" value="${esc(x.note || "")}"></div></div>`;
    const num = ["price", "watt", "life"].includes(f);
    const unit = f === "price" ? (kind === "filaments" ? t("per_kg") : "") : f === "watt" ? t("watt") : f === "life" ? t("hours") : "";
    return `<div class="field"><label data-i18n="${labels[f]}"></label>
      <div class="inp">${f === "price" ? "<span>$</span>" : ""}<input id="f_${f}" ${num ? 'type="number" min="0" step="any"' : ""} value="${esc(x[f] ?? "")}">${unit ? `<span>${esc(unit)}</span>` : ""}</div></div>`;
  }).join("");

  modal(item ? t("edit") : t("add"), body, [
    { label: t("cancel"), onClick: closeModal },
    { label: t("save"), kind: "pri", onClick: async () => {
        const doc = Object.assign({}, x);
        def.fields.forEach(f => {
          const el = $("#f_" + f);
          if (!el) return;
          doc[f] = ["price", "watt", "life"].includes(f) ? nz(el.value) : el.value.trim();
        });
        if (!doc.name) { toast(t("required"), "bad"); return; }
        await DB.put(kind, doc);
        closeModal(); await reload(); render(); toast(t("saved"), "good");
      } }
  ]);
}

function bindCats() {
  $$("[data-cadd]").forEach(b => b.onclick = () => catForm(b.dataset.cadd, null));
  $$("[data-cedit]").forEach(b => b.onclick = () => {
    const [k, id] = b.dataset.cedit.split(":");
    catForm(k, byId(S[k], id));
  });
  $$("[data-cdel]").forEach(b => b.onclick = () => {
    const [k, id] = b.dataset.cdel.split(":");
    const used = S.records.filter(r => r[k.slice(0, -1) + "Id"] === id).length;
    const msg = used ? t("in_use_warn", { n: used }) + "\n" + t("delete_confirm") : t("delete_confirm");
    confirmBox(msg, async () => {
      await DB.del(k, id); await reload(); render(); toast(t("deleted"));
    });
  });
}

/* ======================================================================
   STOK
   ====================================================================== */
function screenStock() {
  return `
  <h1 data-i18n="stock_title"></h1>
  <p class="lead" data-i18n="stock_sub"></p>
  ${S.spools.length ? `<div class="cards">${S.spools.map(s => {
    const init = nz(s.initial) || 1000;
    const rem = Math.max(0, nz(s.remaining));
    const pct = Math.max(0, Math.min(100, rem / init * 100));
    const low = rem <= nz(s.lowAt || 100);
    const fil = byId(S.filaments, s.filamentId);
    return `<div class="card">
      <h3>${esc(s.name || nameOf(S.filaments, s.filamentId))}</h3>
      <p class="cardsub">${esc(fil ? fil.name : "")}${low ? ` · <span class="pill pending">${esc(t("low_stock"))}</span>` : ""}</p>
      <div class="kv"><span data-i18n="remaining"></span><b>${Math.round(rem)} g</b></div>
      <div class="kv"><span data-i18n="initial"></span><b>${Math.round(init)} g</b></div>
      <div class="kv"><span data-i18n="spent"></span><b>${Math.round(Math.max(0, init - rem))} g</b></div>
      <div class="bar ${rem <= 0 ? "out" : low ? "low" : ""}"><i style="width:${pct}%"></i></div>
      <div class="btnrow">
        <button class="btn" data-sedit="${esc(s.id)}" data-i18n="edit"></button>
        <button class="btn danger" data-sdel="${esc(s.id)}" data-i18n="remove"></button>
      </div>
    </div>`;
  }).join("")}</div>` : `<div class="empty" data-i18n="stock_empty"></div>`}
  <div class="btnrow"><button class="btn pri" id="bAddSpool" data-i18n="add_spool"></button></div>`;
}

function spoolForm(item) {
  const x = item || {};
  modal(item ? t("edit") : t("add_spool"), `
    <div class="field"><label data-i18n="name"></label>
      <div class="inp"><input id="s_name" value="${esc(x.name || "")}"></div></div>
    <div class="field"><label data-i18n="filament"></label>
      <div class="inp"><select id="s_fil">${opts(S.filaments, x.filamentId, t("none"))}</select></div></div>
    <div class="pair" style="margin-top:11px">
      <div class="field"><label data-i18n="initial"></label>
        <div class="inp"><input id="s_init" type="number" min="0" step="10" value="${esc(x.initial ?? 1000)}"><span data-i18n="grams"></span></div></div>
      <div class="field"><label data-i18n="remaining"></label>
        <div class="inp"><input id="s_rem" type="number" min="0" step="10" value="${esc(x.remaining ?? 1000)}"><span data-i18n="grams"></span></div></div>
    </div>
    <div class="field"><label data-i18n="low_at"></label>
      <div class="inp"><input id="s_low" type="number" min="0" step="10" value="${esc(x.lowAt ?? 100)}"><span data-i18n="grams"></span></div></div>
  `, [
    { label: t("cancel"), onClick: closeModal },
    { label: t("save"), kind: "pri", onClick: async () => {
        const doc = Object.assign({}, x, {
          name: $("#s_name").value.trim(),
          filamentId: $("#s_fil").value || null,
          initial: nz($("#s_init").value),
          remaining: nz($("#s_rem").value),
          lowAt: nz($("#s_low").value)
        });
        if (!doc.name) doc.name = nameOf(S.filaments, doc.filamentId, t("spool"));
        await DB.put("spools", doc);
        closeModal(); await reload(); render(); toast(t("saved"), "good");
      } }
  ]);
}

function bindStock() {
  $("#bAddSpool").onclick = () => spoolForm(null);
  $$("[data-sedit]").forEach(b => b.onclick = () => spoolForm(byId(S.spools, b.dataset.sedit)));
  $$("[data-sdel]").forEach(b => b.onclick = () => confirmBox(t("delete_confirm"), async () => {
    await DB.del("spools", b.dataset.sdel); await reload(); render(); toast(t("deleted"));
  }));
}

/* ======================================================================
   RAPORLAR
   ====================================================================== */
function periodRecords(period) {
  const now = new Date();
  return S.records.filter(r => {
    if (r.payment === "cancelled") return false;
    if (period === "all") return true;
    const d = new Date(r.date || "");
    if (isNaN(d)) return false;
    if (period === "year") return d.getFullYear() === now.getFullYear();
    const cut = new Date(now); cut.setMonth(cut.getMonth() - 11); cut.setDate(1);
    return d >= cut;
  });
}

function screenReports() {
  const period = S._period || "last12";
  const rs = periodRecords(period === "last12" ? "last12" : period === "year" ? "year" : "all");

  const months = {};
  rs.forEach(r => {
    const d = new Date(r.date || "");
    if (isNaN(d)) return;
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    months[key] = months[key] || { rev: 0, profit: 0, n: 0 };
    months[key].rev += nz(r.totalPrice);
    months[key].profit += nz(r.totalProfit);
    months[key].n++;
  });
  const keys = Object.keys(months).sort();
  const maxRev = Math.max(1, ...keys.map(k => months[k].rev));

  const totals = rs.reduce((a, r) => {
    a.rev += nz(r.totalPrice); a.cost += nz(r.totalCost);
    a.profit += nz(r.totalProfit); a.parts += (r.qty || 1); return a;
  }, { rev: 0, cost: 0, profit: 0, parts: 0 });

  return `
  <h1 data-i18n="reports_title"></h1>

  <div class="toolbar">
    <div class="inp narrow"><select id="rPeriod">
      <option value="last12"${period === "last12" ? " selected" : ""}>${esc(t("last_12"))}</option>
      <option value="year"${period === "year" ? " selected" : ""}>${esc(t("this_year"))}</option>
      <option value="all"${period === "all" ? " selected" : ""}>${esc(t("all_time"))}</option>
    </select></div>
    <button class="btn" id="bExport" data-i18n="export_excel"></button>
  </div>

  <div class="statrow">
    <div class="stat"><em data-i18n="count_prints"></em><b>${rs.length}</b></div>
    <div class="stat"><em data-i18n="produced"></em><b>${totals.parts}</b></div>
    <div class="stat"><em data-i18n="revenue"></em><b>${esc(money(totals.rev))}</b></div>
    <div class="stat"><em data-i18n="total_profit"></em><b>${esc(money(totals.profit))}</b></div>
  </div>

  <section class="panel">
    <h2 data-i18n="monthly"></h2>
    ${keys.length ? `<div class="chart">${keys.map(k => {
      const m = months[k];
      const lab = I18N[LANG].months[parseInt(k.slice(5), 10) - 1].slice(0, 3) + " " + k.slice(2, 4);
      return `<div class="col" title="${esc(lab)}: ${esc(money(m.rev))}">
        <div class="bars">
          <i class="rev" style="height:${Math.max(2, m.rev / maxRev * 100)}%"></i>
          <i class="pro" style="height:${Math.max(2, m.profit / maxRev * 100)}%"></i>
        </div>
        <span class="lab">${esc(lab)}</span></div>`;
    }).join("")}</div>
    <div class="chartkey">
      <span><i style="background:var(--power)"></i>${esc(t("revenue"))}</span>
      <span><i style="background:var(--profit)"></i>${esc(t("profit"))}</span>
    </div>` : `<div class="empty" data-i18n="no_data"></div>`}
  </section>

  <div class="grid2" style="margin-top:14px">
    ${breakdownPanel("by_printer", rs, r => nameOf(S.printers, r.printerId, r.printerName))}
    ${breakdownPanel("by_customer", rs, r => nameOf(S.customers, r.customerId, r.customerName))}
    ${breakdownPanel("by_filament", rs, r => nameOf(S.filaments, r.filamentId, r.filamentName))}
    ${breakdownPanel("top_parts", rs, r => r.partName || "—")}
  </div>`;
}

function breakdownPanel(titleKey, rs, keyFn) {
  const m = {};
  rs.forEach(r => {
    const k = keyFn(r) || "—";
    m[k] = m[k] || { n: 0, rev: 0, profit: 0 };
    m[k].n += (r.qty || 1);
    m[k].rev += nz(r.totalPrice);
    m[k].profit += nz(r.totalProfit);
  });
  const rows = Object.entries(m).sort((a, b) => b[1].rev - a[1].rev).slice(0, 12);
  return `<section class="panel">
    <h2 data-i18n="${titleKey}"></h2>
    ${rows.length ? `<div class="tablewrap"><table style="min-width:0">
      <thead><tr><th data-i18n="name"></th><th class="num" data-i18n="qty"></th>
        <th class="num" data-i18n="revenue"></th><th class="num" data-i18n="profit"></th></tr></thead>
      <tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.n}</td>
        <td class="num">${esc(money(v.rev))}</td><td class="num">${esc(money(v.profit))}</td></tr>`).join("")}</tbody>
    </table></div>` : `<div class="empty" data-i18n="no_data"></div>`}
  </section>`;
}

function bindReports() {
  $("#rPeriod").onchange = e => { S._period = e.target.value; render(); };
  $("#bExport").onclick = exportCsv;
}

async function exportCsv() {
  const rs = S.records;
  if (!rs.length) { toast(t("nothing_to_export"), "bad"); return; }
  const head = [t("date"), t("part_name"), t("customer"), t("printer"), t("filament"),
                t("qty"), t("part_weight"), t("total_time"), t("unit_cost"), t("sale_price"),
                t("profit"), t("payment"), t("delivery_date"), t("note")];
  const lines = [head];
  rs.forEach(r => lines.push([
    r.date || "", r.partName || "", nameOf(S.customers, r.customerId, r.customerName),
    nameOf(S.printers, r.printerId, r.printerName), nameOf(S.filaments, r.filamentId, r.filamentName),
    r.qty || 1, nz(r.totalGrams).toFixed(0), nz(r.totalHours).toFixed(2),
    nz(r.totalCost).toFixed(2), nz(r.totalPrice).toFixed(2), nz(r.totalProfit).toFixed(2),
    t("pay_" + (r.payment || "pending")), r.deliveryDate || "", (r.note || "").replace(/\n/g, " ")
  ]));
  const csv = "﻿" + lines.map(row =>
    row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  await window.shell.saveFile(`baski-kayitlari-${today()}.csv`, url);
  toast(t("backup_done"), "good");
}

/* teklif / fiş çıktısı */
function printQuote(r) {
  if (!r) return;
  const rows = [
    [t("part_name"), r.partName || "—"],
    [t("date"), dateStr(r.date)],
    [t("customer"), nameOf(S.customers, r.customerId, r.customerName)],
    [t("printer"), nameOf(S.printers, r.printerId, r.printerName)],
    [t("filament"), nameOf(S.filaments, r.filamentId, r.filamentName)],
    [t("qty"), String(r.qty || 1)],
    [t("part_weight"), Math.round(nz(r.totalGrams)) + " g"],
    [t("total_time"), nz(r.totalHours).toFixed(1) + " " + t("hours")],
    [t("payment"), t("pay_" + (r.payment || "pending"))]
  ];
  const price = nz(r.totalPrice);
  const html = `<!doctype html><html lang="${LANG}" dir="${I18N[LANG]._dir}"><head><meta charset="utf-8">
    <title>${esc(t("quote_title"))}</title><style>
    body{font-family:"Segoe UI",system-ui,"Noto Naskh Arabic",sans-serif;color:#111;margin:36px;font-size:14px}
    h1{font-size:20px;margin:0 0 4px} .sub{color:#666;margin:0 0 22px;font-size:13px}
    table{border-collapse:collapse;width:100%;max-width:560px}
    td{padding:7px 0;border-bottom:1px solid #e3e3e3}
    td:last-child{text-align:${I18N[LANG]._dir === "rtl" ? "left" : "right"};font-weight:600}
    .tot{margin-top:22px;font-size:17px;font-weight:700}
    .tot div{margin-top:4px;font-size:14px;font-weight:500;color:#444}
    </style></head><body>
    <h1>${esc(t("quote_title"))}</h1>
    <p class="sub">${esc(t("app"))} · ${esc(dateStr(today()))}</p>
    <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    <p class="tot">${esc(t("sale_price"))}: ${esc(CALC.fmt(price, "USD"))}
      <div>${esc(CALC.fmt(price, "TRY", S.settings))} · ${esc(CALC.fmt(price, "SYP", S.settings))}</div></p>
    </body></html>`;

  /* Gizli çerçeveden yazdırır — uygulama penceresinde açılır pencere engellenebiliyor. */
  const old = document.getElementById("printFrame");
  if (old) old.remove();
  const fr = document.createElement("iframe");
  fr.id = "printFrame";
  fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(fr);
  fr.srcdoc = html;
  fr.onload = () => {
    try { fr.contentWindow.focus(); fr.contentWindow.print(); }
    catch (e) { toast(t("update_fail", { msg: e.message }), "bad"); }
  };
}

/* ======================================================================
   AYARLAR
   ====================================================================== */
function screenSettings() {
  const st = S.settings;
  const fb = st.fb || {};
  return `
  <h1 data-i18n="settings_title"></h1>

  <div class="grid2">
    <section class="panel">
      <h2 data-i18n="appearance"></h2>
      <div class="field"><label data-i18n="language"></label>
        <div class="inp"><select id="setLang">
          ${["tr", "en", "ar"].map(c => `<option value="${c}"${st.lang === c ? " selected" : ""}>${I18N[c]._name}</option>`).join("")}
        </select></div></div>
      <label class="chk head"><input type="checkbox" id="setFull"${st.fullscreen ? " checked" : ""}>
        <span data-i18n="fullscreen_start"></span></label>
      <div class="field" style="margin-top:14px"><label data-i18n="def_currency"></label>
        <div class="inp"><select id="setCur">
          ${["USD", "TRY", "SYP"].map(c => `<option value="${c}"${st.primaryCurrency === c ? " selected" : ""}>${c}</option>`).join("")}
        </select></div></div>

      <h2 style="margin-top:24px" data-i18n="rates"></h2>
      <div class="pair">
        <div class="field"><label data-i18n="rate_try"></label>
          <div class="inp"><input id="setTry" type="number" min="0" step="0.01" value="${st.rateTry}"><span>₺</span></div></div>
        <div class="field"><label data-i18n="rate_syp"></label>
          <div class="inp"><input id="setSyp" type="number" min="0" step="0.01" value="${st.rateSyp}"><span>SYP</span></div></div>
      </div>
      <div class="btnrow"><button class="btn" id="bRates" data-i18n="fetch_rates"></button></div>
      <label class="chk" style="margin-top:11px"><input type="checkbox" id="setAutoRates"${st.autoRates ? " checked" : ""}>
        <span data-i18n="auto_rates"></span></label>
      <p class="status" id="rateStatus">${st.ratesUpdatedAt
        ? esc(t("rates_ok", { time: dateStr(st.ratesUpdatedAt), src: st.ratesSrc || "" })
            + " — " + t(st.ratesMarket ? "rate_market" : "rate_official"))
        : esc(t("rates_manual"))}</p>
      <p class="note" data-i18n="syp_note"></p>
    </section>

    <section class="panel">
      <h2 data-i18n="defaults"></h2>
      <p class="lead" style="margin-bottom:12px" data-i18n="defaults_sub"></p>
      <div class="field"><label data-i18n="def_filament"></label>
        <div class="inp"><select id="dFil">${opts(S.filaments, st.defFilamentId, t("none"))}</select></div></div>
      <div class="field"><label data-i18n="def_printer"></label>
        <div class="inp"><select id="dPrn">${opts(S.printers, st.defPrinterId, t("none"))}</select></div></div>
      <div class="pair" style="margin-top:11px">
        <div class="field"><label data-i18n="def_margin"></label>
          <div class="inp"><input id="dMargin" type="number" min="0" step="1" value="${st.defMargin}"><span>%</span></div></div>
        <div class="field"><label data-i18n="kwh_price"></label>
          <div class="inp"><span>$</span><input id="dKwh" type="number" min="0" step="0.001" value="${st.defKwhPrice}"></div></div>
      </div>
      <label class="chk head" style="--acc:var(--labor)"><input type="checkbox" id="dLabor"${st.defLaborOn ? " checked" : ""}>
        <span data-i18n="def_labor"></span></label>
      <label class="chk head" style="--acc:var(--wear)"><input type="checkbox" id="dWear"${st.defWearOn ? " checked" : ""}>
        <span data-i18n="def_wear"></span></label>
      <label class="chk head" style="--acc:var(--fail)"><input type="checkbox" id="dFail"${st.defFailOn ? " checked" : ""}>
        <span data-i18n="def_fail"></span></label>
      <div class="btnrow">
        <button class="btn pri" id="bSaveDefaults" data-i18n="save"></button>
        <button class="btn danger" id="bRestore" data-i18n="restore_defaults"></button>
      </div>
    </section>

    <section class="panel">
      <h2 data-i18n="sync"></h2>
      <p class="status" id="syncStatus">${fb.projectId ? esc(t("fb_ok", { id: fb.projectId })) : esc(t("fb_missing"))}</p>
      <div class="field" style="margin-top:12px"><label data-i18n="fb_config"></label>
        <div class="inp"><textarea id="fbJson" rows="5" placeholder='{"apiKey":"…","projectId":"…","authDomain":"…"}'>${fb.projectId ? esc(JSON.stringify(fb, null, 1)) : ""}</textarea></div>
        <p class="note" data-i18n="fb_config_hint"></p></div>
      <div class="pair" style="margin-top:11px">
        <div class="field"><label>E-posta <span class="hint" data-i18n="optional"></span></label>
          <div class="inp"><input id="fbEmail" type="email" value="${esc(st.fbEmail || "")}"></div></div>
        <div class="field"><label>Parola <span class="hint" data-i18n="optional"></span></label>
          <div class="inp"><input id="fbPass" type="password" value=""></div></div>
      </div>
      <div class="btnrow">
        <button class="btn pri" id="bFbSave" data-i18n="fb_save"></button>
        <button class="btn" id="bSyncNow" data-i18n="sync_now"></button>
      </div>
      <p class="status">${st.lastSync ? esc(t("sync_last", { time: new Date(st.lastSync).toLocaleString(I18N[LANG]._locale) })) : esc(t("sync_never"))}</p>
    </section>

    <section class="panel">
      <h2 data-i18n="updates"></h2>
      <div class="trow"><span data-i18n="current_version"></span><b>v${window.APP_VERSION}</b></div>

      <label class="chk head"><input type="checkbox" id="setAutoUp"${st.autoUpdate ? " checked" : ""}>
        <span data-i18n="update_on_open"></span></label>

      <div class="field" style="margin-top:14px"><label data-i18n="up_channel"></label>
        <div class="pair">
          <div class="inp"><input id="setGhRepo" value="${esc((st.ghOwner || "") + "/" + (st.ghRepo || ""))}" placeholder="kullanici/depo"></div>
          <div class="inp"><input id="setGhBranch" value="${esc(st.ghBranch || "main")}" data-i18n-ph="up_branch"></div>
        </div>
        <p class="note" data-i18n="up_channel_hint"></p>
      </div>

      <div class="btnrow">
        <button class="btn" id="bCheckUp" data-i18n="check_update"></button>
        <button class="btn pri" id="bDoUp" hidden data-i18n="update_now"></button>
      </div>
      <p class="status" id="upLastCheck"></p>
      <p class="status" id="upStatus"></p>

      <h2 style="margin-top:24px" data-i18n="backup"></h2>
      <div class="btnrow">
        <button class="btn" id="bExportAll" data-i18n="export_backup"></button>
        <button class="btn" id="bImportAll" data-i18n="import_backup"></button>
        <input type="file" id="impFile" accept="application/json" hidden>
      </div>
    </section>
  </div>`;
}

function bindSettings() {
  $("#setLang").onchange = async e => {
    await DB.saveSettings({ lang: e.target.value });
    S.settings = await DB.getSettings();
    setLang(e.target.value);
    render();
  };
  $("#setFull").onchange = async e => {
    await DB.saveSettings({ fullscreen: e.target.checked });
    window.shell.setFullscreen(e.target.checked);
    S.settings = await DB.getSettings();
  };
  $("#setCur").onchange = async e => {
    await DB.saveSettings({ primaryCurrency: e.target.value });
    S.settings = await DB.getSettings(); render();
  };
  $("#setAutoRates").onchange = e => DB.saveSettings({ autoRates: e.target.checked });

  $("#setAutoUp").onchange = async e => {
    await DB.saveSettings({ autoUpdate: e.target.checked });
    S.settings = await DB.getSettings();
  };
  paintUpdateStatusLine();

  ["setTry", "setSyp"].forEach(id => $("#" + id).onchange = async () => {
    await DB.saveSettings({ rateTry: nz($("#setTry").value), rateSyp: nz($("#setSyp").value) });
    S.settings = await DB.getSettings();
  });

  $("#bRates").onclick = () => doFetchRates(true);

  $("#bSaveDefaults").onclick = async () => {
    await DB.saveSettings({
      defFilamentId: $("#dFil").value || null,
      defPrinterId: $("#dPrn").value || null,
      defMargin: nz($("#dMargin").value),
      defKwhPrice: nz($("#dKwh").value),
      defLaborOn: $("#dLabor").checked,
      defWearOn: $("#dWear").checked,
      defFailOn: $("#dFail").checked
    });
    S.settings = await DB.getSettings();
    toast(t("saved"), "good");
  };

  $("#bRestore").onclick = () => confirmBox(t("restore_confirm"), async () => {
    await DB.resetSettings();
    S.settings = await DB.getSettings();
    setLang(S.settings.lang);
    render(); toast(t("saved"), "good");
  });

  $("#bFbSave").onclick = async () => {
    let cfg = null;
    try {
      const raw = $("#fbJson").value.trim();
      if (!raw) throw new Error("boş");
      cfg = JSON.parse(raw.replace(/^[^{]*/, "").replace(/;?\s*$/, ""));
    } catch (e) { toast(t("update_fail", { msg: String(e.message || e) }), "bad"); return; }
    if (!cfg.apiKey || !cfg.projectId) { toast(t("required"), "bad"); return; }
    const patch = { fb: cfg, syncOn: true };
    const em = $("#fbEmail").value.trim(), pw = $("#fbPass").value;
    if (em) patch.fbEmail = em;
    if (em && pw) patch.fbPassword = pw;
    await DB.saveSettings(patch);
    S.settings = await DB.getSettings();
    $("#syncStatus").textContent = t("fb_ok", { id: cfg.projectId });
    toast(t("saved"), "good");
    doSync(true);
    checkUpdates(false);
  };

  $("#bSyncNow").onclick = () => doSync(true);

  const saveChannel = async () => {
    const parts = $("#setGhRepo").value.trim().replace(/^https?:\/\/github\.com\//i, "").split("/");
    await DB.saveSettings({
      ghOwner: (parts[0] || "").trim(),
      ghRepo: (parts[1] || "").trim(),
      ghBranch: $("#setGhBranch").value.trim() || "main"
    });
    S.settings = await DB.getSettings();
    toast(t("saved"), "good");
  };
  $("#setGhRepo").onchange = saveChannel;
  $("#setGhBranch").onchange = saveChannel;

  $("#bDoUp").hidden = !UP.found;
  $("#bDoUp").onclick = () => applyFoundUpdate();
  $("#bCheckUp").onclick = async () => {
    const u = await checkUpdates(true);
    $("#bDoUp").hidden = !(u && u.available);
    paintUpdateStatusLine();
  };

  $("#bExportAll").onclick = async () => {
    const bundle = await DB.exportAll();
    const url = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bundle));
    await window.shell.saveFile(`baski-hesabi-yedek-${today()}.json`, url);
    toast(t("backup_done"), "good");
  };
  $("#bImportAll").onclick = () => $("#impFile").click();
  $("#impFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    confirmBox(t("import_confirm"), async () => {
      try {
        const n = await DB.importAll(JSON.parse(text));
        await reload(); setLang(S.settings.lang); render();
        toast(t("import_done", { n }), "good");
      } catch (err) { toast(t("update_fail", { msg: err.message }), "bad"); }
    });
  };
}

async function doFetchRates(loud) {
  const st = $("#rateStatus");
  if (st) { st.className = "status"; st.textContent = t("rates_fetching"); }
  try {
    const r = await CALC.fetchRates();
    const patch = { ratesUpdatedAt: DB.now(), ratesSrc: r.src, ratesMarket: !!r.market };
    if (r.rateTry) patch.rateTry = r.rateTry;
    if (r.rateSyp) patch.rateSyp = r.rateSyp;
    await DB.saveSettings(patch);
    S.settings = await DB.getSettings();
    if ($("#setTry")) $("#setTry").value = S.settings.rateTry;
    if ($("#setSyp")) $("#setSyp").value = S.settings.rateSyp;
    if (st) {
      st.className = "status ok";
      st.textContent = t("rates_ok", { time: new Date().toLocaleString(I18N[LANG]._locale), src: r.src })
        + " — " + t(r.market ? "rate_market" : "rate_official");
    }
    if (loud) toast(t("saved"), "good");
    if (S.screen === "calc") paintCalc();
  } catch (e) {
    if (st) { st.className = "status err"; st.textContent = t("rates_fail"); }
    if (loud) toast(t("rates_fail"), "bad");
  }
}

/* loud: kullanıcı düğmeye bastı. Açılıştaki kendiliğinden eşitleme sessizdir —
   bağlantı yoksa her açılışta uyarı atmasın. */
async function doSync(loud) {
  const dot = $("#syncDot");
  const st = $("#syncStatus");
  dot.className = "dot-busy";
  if (st) { st.className = "status"; st.textContent = t("sync_working"); }
  try {
    const r = await SYNC.syncAll();
    dot.className = "dot-on";
    await reload();
    if (S.screen === "settings") render();
    if (loud) toast(t("sync_done", { n: r.total }), "good");
  } catch (e) {
    dot.className = "dot-err";
    if (st) { st.className = "status err"; st.textContent = t("sync_error", { msg: e.message }); }
    if (loud) toast(t("sync_error", { msg: e.message }), "bad");
  }
}

/* ======================================================================
   GÜNCELLEME BİLDİRİMİ
   Her program açılışında denetler; yeni sürüm varsa üstte bir şerit çıkar
   ve sekmeye nokta koyar. Şerit, güncellenene ya da "Sonra" denene kadar
   durur.
   ====================================================================== */
const UP = { found: null, busy: false };

function upBarEls() {
  return { bar: $("#upBar"), txt: $("#upBarTxt"), notes: $("#upBarNotes"),
           go: $("#upBarGo"), later: $("#upBarLater") };
}

function showUpBar(u) {
  const e = upBarEls();
  if (!e.bar) return;
  e.txt.textContent = t("update_banner", { v: u.version });
  e.notes.textContent = u.notes || "";
  e.notes.title = u.notes || "";
  e.go.textContent = t("update_now");
  e.later.textContent = t("update_later");
  e.bar.hidden = false;
  document.body.classList.add("has-upbar");
  markTabDot(true);
}

function hideUpBar() {
  const e = upBarEls();
  if (e.bar) e.bar.hidden = true;
  document.body.classList.remove("has-upbar");
  markTabDot(false);
}

function markTabDot(on) {
  const btn = $('#tabs button[data-screen="settings"]');
  if (!btn) return;
  const old = $(".tabdot", btn);
  if (on && !old) {
    const i = document.createElement("i");
    i.className = "tabdot";
    btn.appendChild(i);
  } else if (!on && old) old.remove();
}

/* loud: kullanıcı düğmeye bastı — sonucu her hâlükârda bildir. */
async function checkUpdates(loud) {
  const st = await DB.getSettings();
  const status = $("#upStatus");

  if (!st.ghOwner || !st.ghRepo) {
    if (loud && status) { status.className = "status err"; status.textContent = t("up_no_channel"); }
    return null;
  }
  if (UP.busy) return null;
  UP.busy = true;
  if (loud && status) { status.className = "status"; status.textContent = t("update_checking"); }

  try {
    const u = await SYNC.checkUpdate();
    await DB.saveSettings({ lastUpdateCheck: DB.now() });
    S.settings = await DB.getSettings();

    if (u.available) {
      UP.found = u;
      /* "Sonra" denen sürümü tekrar tekrar göstermeyiz; daha yenisi gelirse gösteririz */
      if (S.settings.skipVersion && SYNC.cmpVer(u.version, S.settings.skipVersion) <= 0) {
        if (loud) showUpBar(u);
      } else {
        showUpBar(u);
        if (!loud) toast(t("update_banner", { v: u.version }), "good");
      }
      if (status) {
        status.className = "status ok";
        status.textContent = t("update_found", { v: u.version }) + (u.notes ? " — " + u.notes : "");
      }
    } else {
      UP.found = null;
      hideUpBar();
      if (status) {
        status.className = "status ok";
        status.textContent = t("up_to_date");
      }
    }
    if (S.screen === "settings") paintUpdateStatusLine();
    return u;
  } catch (e) {
    if (status) { status.className = "status err"; status.textContent = t("update_fail", { msg: e.message }); }
    if (loud) toast(t("update_fail", { msg: e.message }), "bad");
    return null;
  } finally {
    UP.busy = false;
  }
}

async function applyFoundUpdate() {
  if (!UP.found) return;
  const u = UP.found;
  const status = $("#upStatus");
  const e = upBarEls();
  if (e.go) { e.go.disabled = true; e.go.textContent = t("update_applying"); }
  if (status) { status.className = "status"; status.textContent = t("update_applying"); }
  try {
    await DB.saveSettings({ justUpdatedTo: u.version, skipVersion: null });
    const done = await SYNC.applyUpdate(u.release);
    if (status) status.textContent = t("update_done");
    setTimeout(() => window.shell.restart(), 500);
    if (!done) toast(t("update_done"), "good");
  } catch (err) {
    await DB.saveSettings({ justUpdatedTo: null });
    if (e.go) { e.go.disabled = false; e.go.textContent = t("update_now"); }
    if (status) { status.className = "status err"; status.textContent = t("update_fail", { msg: err.message }); }
    toast(t("update_fail", { msg: err.message }), "bad");
  }
}

function paintUpdateStatusLine() {
  const el = $("#upLastCheck");
  if (!el) return;
  const st = S.settings;
  el.textContent = st.lastUpdateCheck
    ? t("update_last_check", { time: new Date(st.lastUpdateCheck).toLocaleTimeString(I18N[LANG]._locale) })
    : t("update_never_checked");
}

/* ======================================================================
   YÖNLENDİRME
   ====================================================================== */
const SCREENS = {
  calc:     { html: screenCalc,     bind: bindCalc },
  records:  { html: screenRecords,  bind: bindRecords },
  printers: { html: screenPrinters, bind: bindPrinters },
  cats:     { html: screenCats,     bind: bindCats },
  stock:    { html: screenStock,    bind: bindStock },
  reports:  { html: screenReports,  bind: bindReports },
  settings: { html: screenSettings, bind: bindSettings }
};

function bindRecords() {
  $("#bNewRec").onclick = () => openRecordForm(null, null);
  $("#fCur").onchange = e => { S._recCur = e.target.value; paintRecords(); };
  ["fSearch", "fPrinter", "fCustomer", "fPay", "fFrom", "fTo"].forEach(id => {
    const el = $("#" + id);
    el.addEventListener("input", paintRecords);
    el.addEventListener("change", paintRecords);
  });
  if (S._pendingPrinter) { $("#fPrinter").value = S._pendingPrinter; S._pendingPrinter = null; }
  paintRecords();
}

function render() {
  const sc = SCREENS[S.screen] || SCREENS.calc;
  $("#main").innerHTML = sc.html();
  applyI18n($("#main"));
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.screen === S.screen));
  if (UP.found && $("#upBar") && !$("#upBar").hidden) showUpBar(UP.found);
  else markTabDot(false);
  try { sc.bind(); } catch (e) { console.error(e); }
  window.scrollTo(0, 0);
}

/* ======================================================================
   AÇILIŞ
   ====================================================================== */
async function boot() {
  if (window.shellReady) { try { await window.shellReady; } catch (e) {} }
  await DB.openDB();
  S.settings = await DB.getSettings();

  /* ilk açılışta örnek kategoriler: boş ekranla karşılaşmasın */
  if (!(await DB.all("filaments")).length && !(await DB.all("printers")).length) {
    const pla = { id: DB.uid(), name: "PLA", price: 20, color: "#45C8BE" };
    const prn = { id: DB.uid(), name: "Ender 3", watt: 150, price: 400, life: 5000 };
    await DB.putMany("filaments", [
      pla,
      { id: DB.uid(), name: "PETG", price: 24, color: "#6C9BF0" },
      { id: DB.uid(), name: "ABS", price: 22, color: "#F0876A" }
    ]);
    await DB.put("printers", prn);
    /* ilk hesap boş seçimle açılmasın */
    await DB.saveSettings({ defFilamentId: pla.id, defPrinterId: prn.id });
  }

  await reload();
  setLang(S.settings.lang || "tr");
  $("#verTag").textContent = "v" + window.APP_VERSION;
  $("#langSel").value = S.settings.lang || "tr";

  $("#langSel").onchange = async e => {
    await DB.saveSettings({ lang: e.target.value });
    S.settings = await DB.getSettings();
    setLang(e.target.value);
    render();
  };
  $$("#tabs button").forEach(b => b.onclick = () => { S.screen = b.dataset.screen; render(); });
  $("#modalX").onclick = closeModal;
  $("#modalWrap").onclick = e => { if (e.target.id === "modalWrap") closeModal(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  render();

  /* bildirim şeridinin düğmeleri */
  $("#upBarGo").onclick = () => applyFoundUpdate();
  $("#upBarLater").onclick = async () => {
    if (UP.found) await DB.saveSettings({ skipVersion: UP.found.version });
    S.settings = await DB.getSettings();
    hideUpBar();
  };

  /* güncelleme sonrası ilk açılış: ne yüklendiğini söyle */
  if (S.settings.justUpdatedTo) {
    const v = S.settings.justUpdatedTo;
    await DB.saveSettings({ justUpdatedTo: null });
    S.settings = await DB.getSettings();
    setTimeout(() => toast(t("update_applied", { v }), "good"), 600);
  }

  if (S.settings.fullscreen) window.shell.setFullscreen(true);
  if (S.settings.autoRates) doFetchRates(false);

  /* güncelleme denetimi Firebase'den bağımsız; eşitleme ayrı */
  if (S.settings.autoUpdate) checkUpdates(false);
  if (S.settings.fb && S.settings.fb.projectId) doSync().catch(() => {});
}

document.addEventListener("DOMContentLoaded", boot);
