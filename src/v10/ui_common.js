// ============================================================ UI plumbing shared by both tabs
// Binders tie one control to one state value. The control executes a command (command(value) -> a command, or null
// for "nothing to change", which still asks for a frame as v9's refresh did). Its sync function skips the focused
// control, so a slider drag stays one command per input event and one render per frame. By default the sync
// subscribes to "state.changed" and runs on Compare frames that carry a context only (as v9's sync lists ran inside
// the Compare render, after the context was built), or on every frame with everyTab (the page menu's theme). With
// syncList, the binder hands its sync to the module that owns the control instead, which runs it with the frame's
// state where it renders that control (the summary in its range row, the dock in its sizing row), as v9's REG lists
// were: a render step that throws first leaves its controls as they were.
// The event loop comes from the page object (app.js): the sync subscriptions are made when a binder is created, so
// binders are created after main() built the loop; the commands and frame requests reach it at event time. Step 4
// (panels) passes {bus, executor, frames} in instead.
const resolveElement = el => typeof el === "string" ? $(el) : el;
function runControlCommand({ command, value, source }) {
  const next = command(value);
  if (!next) {
    page.frames.mark({ cause: FrameCause.Ui });
    return;
  }
  page.executor.execute(Object.assign({ source }, next));
}
/** @param {{ sync: (state: any) => void, everyTab?: boolean, syncList?: Array<(state: any) => void> }} binding */
function subscribeSync({ sync, everyTab, syncList }) {
  if (syncList) {
    syncList.push(sync);
    return () => {
      const index = syncList.indexOf(sync);
      if (index < 0) { return; }   // already removed: splice(-1, 1) would drop another control's sync
      syncList.splice(index, 1);
    };
  }
  return page.bus.subscribe(EnvelopeType.StateChanged, frame => {
    const isRenderedCompare = frame.state.tab === Tab.Compare && frame.context !== null;
    const isShown = everyTab || isRenderedCompare;
    if (!isShown) { return; }
    sync(frame.state);
  });
}
/**
 * @typedef {(value: any) => (LabCommand | null)} ControlCommand
 * @typedef {Array<(state: any) => void>} SyncList
 * @param {{ el: string | Element, options: ReadonlyArray<ReadonlyArray<any>>, read: (state: any) => any, command: ControlCommand, everyTab?: boolean,
 *   syncList?: SyncList }} binding
 */
function seg({ el, options, read, command, everyTab, syncList }) {
  const host = resolveElement(el);
  host.innerHTML = options.map(([v, l, t]) => `<button type="button" data-v="${v}"${t ? ` title="${t}"` : ""}>${l}</button>`).join("");
  host.addEventListener("click", e => {
    const b = /** @type {HTMLButtonElement} */ (/** @type {Element} */ (e.target).closest("button"));
    if (!b || b.disabled) { return; }
    runControlCommand({ command, value: b.dataset.v, source: host.id });
  });
  const syncButtons = state => host.querySelectorAll("button").forEach(b => {
    const on = b.dataset.v === String(read(state));
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  subscribeSync({ everyTab, syncList, sync: syncButtons });
  return host;
}
/**
 * @param {{ input: string | Element, output: string | Element, read: (state: any) => any, command: ControlCommand, format: (value: any) => string,
 *   syncList?: SyncList }} binding
 */
function bindRange({ input, output, read, command, format, syncList }) {
  const slider = /** @type {HTMLInputElement} */ (resolveElement(input)), readout = resolveElement(output);
  slider.addEventListener("input", () => runControlCommand({ command, value: +slider.value, source: slider.id }));
  subscribeSync({
    syncList,
    sync: state => {
      if (document.activeElement !== slider) { slider.value = read(state); }
      readout.textContent = format(read(state));
    }
  });
}
/** @param {{ input: string | Element, read: (state: any) => any, command: ControlCommand, syncList?: SyncList }} binding */
function bindChk({ input, read, command, syncList }) {
  const checkbox = /** @type {HTMLInputElement} */ (resolveElement(input));
  checkbox.addEventListener("change", () => runControlCommand({ command, value: checkbox.checked, source: checkbox.id }));
  subscribeSync({ syncList, sync: state => { checkbox.checked = !!read(state); } });
}
/**
 * @param {{ input: string | Element, options: ReadonlyArray<ReadonlyArray<any>>, read: (state: any) => any, command: ControlCommand,
 *   syncList?: SyncList }} binding
 */
function bindSelect({ input, options, read, command, syncList }) {
  const select = /** @type {HTMLSelectElement} */ (resolveElement(input));
  select.innerHTML = options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  select.addEventListener("change", () => runControlCommand({ command, value: select.value, source: select.id }));
  subscribeSync({ syncList, sync: state => { select.value = String(read(state)); } });
}
const TIP = $("#tip");
function showTip(html, cx, cy) {
  TIP.innerHTML = html; TIP.hidden = false;
  const w = TIP.offsetWidth, h = TIP.offsetHeight; let x = cx + 16, y = cy + 14;
  if (x + w > innerWidth - 8) x = cx - w - 16; if (y + h > innerHeight - 8) y = cy - h - 14;
  TIP.style.left = Math.max(8, x) + "px"; TIP.style.top = Math.max(8, y) + "px";
}
const hideTip = () => { TIP.hidden = true; };
const krow = (k, v) => `<span class="r"><span class="k">${k}</span><span class="v">${v}</span></span>`;
// copy through the clipboard adapter; when the browser refuses, the text is put selected into fallbackField
/** @param {{ text: string, fallbackField?: HTMLInputElement | HTMLTextAreaElement }} copy */
async function copyText({ text, fallbackField }) {
  const written = await clipboard.writeText(text);
  if (written.ok) {
    page.bus.emit(createNoticeEnvelope({ text: "Copied" }));
    return written;
  }
  if (!fallbackField) { return written; }
  fallbackField.hidden = false;
  fallbackField.value = text;
  fallbackField.select();
  page.bus.emit(createNoticeEnvelope({ text: "Clipboard blocked: the text is selected, copy it manually" }));
  return written;
}
// the element with a data-tip under an event, if any (the target may be a node without closest())
const findTipTarget = e => { const t = /** @type {Element} */ (e.target); return t.closest ? /** @type {HTMLElement} */ (t.closest("[data-tip]")) : null; };
const findOpenMenus = () => /** @type {NodeListOf<HTMLDetailsElement>} */ (document.querySelectorAll("details.menu[open]"));
document.addEventListener("pointerover", e => { const t = findTipTarget(e); if (t) { const r = t.getBoundingClientRect(); showTip(`<p>${t.dataset.tip}</p>`, r.right, r.bottom); } });
document.addEventListener("pointerout", e => { if (findTipTarget(e)) hideTip(); });
document.addEventListener("focusin", e => { const t = findTipTarget(e); if (t) { const r = t.getBoundingClientRect(); showTip(`<p>${t.dataset.tip}</p>`, r.right, r.bottom); } });
document.addEventListener("focusout", e => { if (findTipTarget(e)) hideTip(); });
document.addEventListener("pointerdown", e => {
  const target = /** @type {Node} */ (e.target);
  findOpenMenus().forEach(d => { if (!d.contains(target)) d.open = false; });
  const p = $("#pop"); if (!p.hidden && !p.contains(target)) p.hidden = true;
});
document.addEventListener("toggle", e => { const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("menu") || !d.open) return; d.classList.remove("up"); const mb = d.querySelector(".mb"), r = mb.getBoundingClientRect(); if (r.bottom > innerHeight - 8 && d.getBoundingClientRect().top > r.height + 16) d.classList.add("up"); }, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") { findOpenMenus().forEach(d => d.open = false); $("#pop").hidden = true; hideTip(); } });
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
