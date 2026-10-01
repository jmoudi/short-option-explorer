// ============================================================ UI plumbing shared by both tabs
const SYNC = [];
let RAF = 0;
// every settled change goes through refresh(): one appRender() per frame for the active tab
function refresh() { if (!RAF) RAF = requestAnimationFrame(() => { RAF = 0; appRender(); }); }
// binders take an optional registry of sync functions (default SYNC, the comparer's); the year tab passes its own
function seg(el, opts, get, set, reg) {
  if (typeof el === "string") el = $(el);
  el.innerHTML = opts.map(([v, l, t]) => `<button type="button" data-v="${v}"${t ? ` title="${t}"` : ""}>${l}</button>`).join("");
  el.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || b.disabled) return; set(b.dataset.v); refresh(); });
  (reg || SYNC).push(() => el.querySelectorAll("button").forEach(b => { const on = b.dataset.v === String(get()); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }));
  return el;
}
function bindRange(id, outId, get, set, fmt, reg) {
  const i = $(id), o = $(outId);
  i.addEventListener("input", () => { set(+i.value); refresh(); });
  (reg || SYNC).push(() => { if (document.activeElement !== i) i.value = get(); o.textContent = fmt(get()); });
}
function bindChk(id, get, set, reg) { const i = $(id); i.addEventListener("change", () => { set(i.checked); refresh(); }); (reg || SYNC).push(() => { i.checked = !!get(); }); }
function bindSelect(id, opts, get, set, reg) {
  const s = $(id); s.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  s.addEventListener("change", () => { set(s.value); refresh(); }); (reg || SYNC).push(() => { s.value = String(get()); });
}
let toastT = 0;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3800); }
const TIP = $("#tip");
function showTip(html, cx, cy) {
  TIP.innerHTML = html; TIP.hidden = false;
  const w = TIP.offsetWidth, h = TIP.offsetHeight; let x = cx + 16, y = cy + 14;
  if (x + w > innerWidth - 8) x = cx - w - 16; if (y + h > innerHeight - 8) y = cy - h - 14;
  TIP.style.left = Math.max(8, x) + "px"; TIP.style.top = Math.max(8, y) + "px";
}
const hideTip = () => { TIP.hidden = true; };
const krow = (k, v) => `<span class="r"><span class="k">${k}</span><span class="v">${v}</span></span>`;
async function copyText(txt, fallbackEl) {
  try { await navigator.clipboard.writeText(txt); toast("Copied"); }
  catch (e) { if (fallbackEl) { fallbackEl.hidden = false; fallbackEl.value = txt; fallbackEl.select(); toast("Clipboard blocked: the text is selected, copy it manually"); } }
}
document.addEventListener("pointerover", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t) { const r = t.getBoundingClientRect(); showTip(`<p>${t.dataset.tip}</p>`, r.right, r.bottom); } });
document.addEventListener("pointerout", e => { if (e.target.closest && e.target.closest("[data-tip]")) hideTip(); });
document.addEventListener("focusin", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t) { const r = t.getBoundingClientRect(); showTip(`<p>${t.dataset.tip}</p>`, r.right, r.bottom); } });
document.addEventListener("focusout", e => { if (e.target.closest && e.target.closest("[data-tip]")) hideTip(); });
document.addEventListener("pointerdown", e => {
  document.querySelectorAll("details.menu[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
  const p = $("#pop"); if (!p.hidden && !p.contains(e.target)) p.hidden = true;
});
document.addEventListener("toggle", e => { const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("menu") || !d.open) return; d.classList.remove("up"); const mb = d.querySelector(".mb"), r = mb.getBoundingClientRect(); if (r.bottom > innerHeight - 8 && d.getBoundingClientRect().top > r.height + 16) d.classList.add("up"); }, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") { document.querySelectorAll("details.menu[open]").forEach(d => d.open = false); $("#pop").hidden = true; hideTip(); } });
function openPopAt(html, cx, cy, onclick) {
  hideTip(); const pop = $("#pop"); pop.innerHTML = html; pop.hidden = false;
  const w = pop.offsetWidth, h = pop.offsetHeight; let x = cx + 10, y = cy + 10;
  if (x + w > innerWidth - 8) x = cx - w - 10; if (y + h > innerHeight - 8) y = cy - h - 10;
  pop.style.left = Math.max(8, x) + "px"; pop.style.top = Math.max(8, y) + "px"; pop.onclick = onclick;
}

// nice ticks inside the range plus the range edges themselves
function axisTicks(lo, hi, n) {
  const t = ticks(lo, hi, Math.max(2, n)), step = t.length > 1 ? t[1] - t[0] : hi - lo;
  return [lo, ...t.filter(u => u > lo + 0.45 * step && u < hi - 0.45 * step), hi];
}

// ============================================================ SVG and colour helpers
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
function txt(parent, x, y, s, attrs = {}) { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; }
const halo = { "paint-order": "stroke", stroke: "var(--surface)", "stroke-width": 4, "stroke-linejoin": "round" };
const pathOf = (pts, X, Y) => { let d = "", pen = false; for (const [x, y] of pts) { if (!Number.isFinite(y)) { pen = false; continue; } d += (pen ? "L" : "M") + X(x).toFixed(1) + " " + Y(y).toFixed(1); pen = true; } return d; };
function mix(c1, c2, t) { return c1.map((v, i) => Math.round(v + (c2[i] - v) * t)); }
function rgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
