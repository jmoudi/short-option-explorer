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
// ============================================================ info knobs
const KNOBS = (() => {
  // A knob (an ⓘ with data-tip, or any element with data-knob) shows its detail while hovered or focused; a click (or
  // Enter / Space) pins the detail open as a card next to it, so several can be read side by side; a second click on the
  // knob, the card's ×, or Escape closes it. Elements with data-tip that act on a click themselves only show the tip.
  const KNOB_CONFIG = Object.freeze({ offset: 8, maxWidth: 460 });
  const isKnob = el => !!el && (el.hasAttribute("data-knob") || (el.classList.contains("info") && el.hasAttribute("data-tip") && !el.hasAttribute("data-act")));
  const knobKey = el => el.dataset.knob || el.dataset.tip;
  const isInFixedArea = el => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if (position === "fixed" || position === "sticky") { return true; }
    }
    return false;
  };
  const knobBody = el => el.dataset.knobTitle ? `<span class="h">${el.dataset.knobTitle}</span><p>${el.dataset.tip}</p>` : `<p>${el.dataset.tip}</p>`;
  // one pinned card per knob key; it lives in the page (it scrolls with the content it explains)
  class PinnedKnobs {
    // why a class: it owns the open cards and their keys across renders (a re-render replaces the knob, not the card)
    constructor() { this.cards = new Map(); }
    isPinned(key) { return this.cards.has(key); }
    /** @param {HTMLElement} knob */
    toggle(knob) {
      const key = knobKey(knob);
      if (this.cards.has(key)) { this.close(key); return; }
      this.open({ key, knob });
    }
    /** @param {{ key: string, knob: HTMLElement }} input */
    open({ key, knob }) {
      hideTip();
      const card = document.createElement("div"), anchor = knob.getBoundingClientRect();
      card.className = "pintip";
      card.setAttribute("role", "note");
      card.innerHTML = `<button type="button" class="pinx" aria-label="Close">×</button>${knobBody(knob)}`;
      card.querySelector(".pinx").addEventListener("click", () => this.close(key));
      document.body.appendChild(card);
      const width = Math.min(KNOB_CONFIG.maxWidth, card.offsetWidth);
      const left = Math.max(8, Math.min(anchor.right + KNOB_CONFIG.offset, innerWidth - width - 8));
      // a knob in a fixed or sticky area (the summary, the docks) keeps its card on screen with it
      const isPinnedToScreen = isInFixedArea(knob);
      card.style.position = isPinnedToScreen ? "fixed" : "absolute";
      card.style.left = left + (isPinnedToScreen ? 0 : scrollX) + "px";
      card.style.top = anchor.bottom + KNOB_CONFIG.offset + (isPinnedToScreen ? 0 : scrollY) + "px";
      knob.classList.add("pinned");
      this.cards.set(key, { card, knob });
    }
    close(key) {
      const entry = this.cards.get(key);
      if (!entry) { return; }
      entry.card.remove();
      entry.knob.classList.remove("pinned");
      this.cards.delete(key);
    }
    closeAll() { for (const key of [...this.cards.keys()]) { this.close(key); } }
  }
  const pinnedKnobs = new PinnedKnobs();
  const showKnobTip = el => { if (pinnedKnobs.isPinned(knobKey(el))) { return; } const r = el.getBoundingClientRect(); showTip(el.dataset.knobTitle ? knobBody(el) : `<p>${el.dataset.tip}</p>`, r.right, r.bottom); };
  document.addEventListener("pointerover", e => { const t = findTipTarget(e); if (t) { showKnobTip(t); } });
  document.addEventListener("pointerout", e => { if (findTipTarget(e)) hideTip(); });
  document.addEventListener("focusin", e => { const t = findTipTarget(e); if (t) { showKnobTip(t); } });
  document.addEventListener("focusout", e => { if (findTipTarget(e)) hideTip(); });
  document.addEventListener("click", e => {
    const t = findTipTarget(e);
    if (!isKnob(t)) { return; }
    e.preventDefault(); e.stopPropagation();
    pinnedKnobs.toggle(t);
  }, true);
  document.addEventListener("keydown", e => {
    const t = /** @type {HTMLElement} */ (document.activeElement);
    const isToggleKey = e.key === "Enter" || e.key === " ";
    if (!isToggleKey || !t || !t.matches || !t.matches("[data-tip]") || !isKnob(t)) { return; }
    e.preventDefault();
    pinnedKnobs.toggle(t);
  });
  // a knob from JS: the short label shows inline, the detail on hover, a click pins it
  /** @param {{ id?: string, title?: string, body: string }} knob */
  function knobHtml({ id, title, body }) {
    const at = v => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return `<span class="info" tabindex="0" role="button"${id ? ` data-knob="${at(id)}"` : ""}${title ? ` data-knob-title="${at(title)}"` : ""} data-tip="${at(body)}">i</span>`;
  }
  // a plain-text label whose knob stays on the line of its last word (an inline knob may otherwise wrap alone)
  /** @param {string} text @param {{ id?: string, title?: string, body: string }} knob */
  function labelWithKnob(text, knob) {
    const cut = text.lastIndexOf(" ");
    return `${text.slice(0, cut + 1)}<span class="knw">${text.slice(cut + 1)}${knobHtml(knob)}</span>`;
  }
  return { html: knobHtml, label: labelWithKnob, closeAll: () => pinnedKnobs.closeAll(), isPinned: key => pinnedKnobs.isPinned(key) };
})();
document.addEventListener("pointerdown", e => {
  const target = /** @type {Node} */ (e.target);
  findOpenMenus().forEach(d => { if (!d.contains(target)) d.open = false; });
  const p = $("#pop"); if (!p.hidden && !p.contains(target)) p.hidden = true;
});
document.addEventListener("toggle", e => { const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("menu") || !d.open) return; d.classList.remove("up"); const mb = d.querySelector(".mb"), r = mb.getBoundingClientRect(); if (r.bottom > innerHeight - 8 && d.getBoundingClientRect().top > r.height + 16) d.classList.add("up"); }, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") { findOpenMenus().forEach(d => d.open = false); $("#pop").hidden = true; hideTip(); KNOBS.closeAll(); } });
function openPopAt(html, cx, cy, onclick) {
  hideTip(); const pop = $("#pop"); pop.innerHTML = html; pop.hidden = false;
  const w = pop.offsetWidth, h = pop.offsetHeight; let x = cx + 10, y = cy + 10;
  if (x + w > innerWidth - 8) x = cx - w - 10; if (y + h > innerHeight - 8) y = cy - h - 10;
  pop.style.left = Math.max(8, x) + "px"; pop.style.top = Math.max(8, y) + "px"; pop.onclick = onclick;
}

// ============================================================ axis hover
// An axis is information too: hovering the band where an axis prints its labels shows what a value there means (the
// caller's describe), and a guide line marks that value across the plot. One helper for every chart on both tabs.
const AXES = (() => {
  /**
   * @param {{ svg: SVGSVGElement, orient: "x" | "y", band: { x: number, y: number, width: number, height: number },
   *   toValue: (px: number) => number, toPx: (value: number) => number, guide: { from: number, to: number },
   *   describe: (value: number) => string }} spec
   */
  function attach({ svg, orient, band, toValue, toPx, guide, describe }) {
    const isX = orient === "x";
    const line = el("line", { class: "axguide", visibility: "hidden" }, svg);
    const hit = el("rect", { x: band.x, y: band.y, width: Math.max(1, band.width), height: Math.max(1, band.height), fill: "transparent", class: "axhit" }, svg);
    const toSvgCoord = ev => {
      const box = svg.getBoundingClientRect(), view = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
      const scale = view ? (isX ? view.width / box.width : view.height / box.height) : 1;
      return isX ? (ev.clientX - box.left) * scale : (ev.clientY - box.top) * scale;
    };
    hit.addEventListener("pointermove", ev => {
      const value = toValue(toSvgCoord(ev));
      if (!Number.isFinite(value)) { return; }
      const at = toPx(value);
      if (isX) { Object.entries({ x1: at, x2: at, y1: guide.from, y2: guide.to }).forEach(([k, v]) => line.setAttribute(k, String(v))); }
      else { Object.entries({ y1: at, y2: at, x1: guide.from, x2: guide.to }).forEach(([k, v]) => line.setAttribute(k, String(v))); }
      line.setAttribute("visibility", "visible");
      showTip(describe(value), ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", () => { line.setAttribute("visibility", "hidden"); hideTip(); });
    return hit;
  }
  return { attach };
})();

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

// ---------------------------------------------------------- collapsible panels
// every section panel with an id and a header gets a show / hide chip after its title; which panels are collapsed is
// a per-browser convenience (localStorage), never part of the view. decorate() is idempotent: the views call it after
// they render, so a panel rebuilt from scratch gets its chip back
const PANELS = (() => {
  const KEY = "rk-lab-v10-collapsed";
  /** @type {Set<string> | null} */
  let closed = null;
  function readClosed() {
    if (closed) { return closed; }
    const stored = storage.read(KEY);
    closed = new Set(stored.ok && stored.value ? String(stored.value).split(",").filter(Boolean) : []);
    return closed;
  }
  // A panel head is three fixed tracks, never a wrapping row: lead (the title and its chips and knobs) | mid (a short
  // caption: one line, cut with … and the full text in its tooltip) | tools. .ph2 gives the tools a second row and .phc
  // the caption a second row, by design. A chart legend is not a caption: it leaves the head for its own two-line
  // area under it (.phlg). Built once per head; the slots keep the original nodes, so ids and listeners stay.
  const LEAD = "h2, .pcol, .pnotes, .phx, .info, .xbtn";
  function layoutHead(head) {
    if (head.dataset.laid) { return; }
    head.dataset.laid = "1";
    const slot = cls => { const span = document.createElement("span"); span.className = cls; return span; };
    const lead = slot("phl"), mid = slot("phm"), tools = slot("pht"), legends = [];
    for (const child of [...head.childNodes]) {
      if (child.nodeType === 3 && !child.textContent.trim()) { child.remove(); continue; }
      const node = /** @type {Element} */ (child);
      if (node.nodeType === 1 && node.matches(".tools")) { tools.appendChild(node); }
      else if (node.nodeType === 1 && node.matches(".lgd")) { node.classList.add("phlg"); legends.push(node); }
      else if (node.nodeType === 1 && node.matches(LEAD)) { lead.appendChild(node); }
      else { mid.appendChild(node); }
    }
    head.append(lead, mid, tools);
    head.after(...legends);
  }
  // the mid track's tooltip follows its text (legends are rewritten on every render)
  // any text cut by an ellipsis or a line clamp shows its full text on hover: the title is set when the pointer
  // arrives and only while the text is cut; titles the page sets itself are left alone
  const isCutter = (/** @type {Element} */ el) => { const cs = getComputedStyle(el); return cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none"; };
  const isCut = (/** @type {HTMLElement} */ el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2;
  function titleCut(/** @type {HTMLElement} */ el) {
    const auto = el.dataset.autotitle === "1";
    if (el.title && !auto) { return; }
    if (isCut(el)) { el.title = el.innerText.replace(/\s+/g, " ").trim(); el.dataset.autotitle = "1"; }
    else if (auto) { el.removeAttribute("title"); delete el.dataset.autotitle; }
  }
  document.addEventListener("mouseover", ev => {
    let el = /** @type {Element} */ (ev.target);
    for (let up = 0; el && el !== document.body && up < 4; up++, el = el.parentElement) {
      if (el instanceof HTMLElement && isCutter(el)) { titleCut(el); return; }
    }
  }, true);
  function decorate(root) {
    if (!root) { return; }
    for (const head of root.querySelectorAll(".ph")) { layoutHead(/** @type {HTMLElement} */ (head)); }
    const set = readClosed();
    for (const node of root.querySelectorAll("section.panel[id]")) {
      const panel = /** @type {HTMLElement} */ (node), head = panel.querySelector(":scope > .ph"), title = head && head.querySelector("h2");
      if (!title) { continue; }
      let chip = /** @type {HTMLButtonElement} */ (head.querySelector(".pcol"));
      if (!chip) { chip = document.createElement("button"); chip.type = "button"; chip.className = "xbtn pcol"; title.insertAdjacentElement("afterend", chip); }
      const isClosed = set.has(panel.id);
      panel.classList.toggle("collapsed", isClosed);
      chip.textContent = isClosed ? "show ▸" : "hide ▾";
      chip.setAttribute("aria-expanded", String(!isClosed));
      chip.title = isClosed ? "Show this panel" : "Hide this panel (remembered in this browser)";
      // a panel with notes (long captions on how it is read) gets a notes chip; the notes start hidden
      const hasNotes = !!panel.querySelector(".pnote");
      let notes = /** @type {HTMLButtonElement} */ (head.querySelector(".pnotes"));
      if (hasNotes && !notes) { notes = document.createElement("button"); notes.type = "button"; notes.className = "xbtn pnotes"; chip.insertAdjacentElement("afterend", notes); }
      if (notes) { const on = panel.classList.contains("notes-on"); notes.hidden = !hasNotes || isClosed; notes.textContent = on ? "notes ▾" : "notes ▸"; notes.setAttribute("aria-expanded", String(on)); }
      // one place for every expander on a title line: title · hide/show · notes · the panel's own detail chips (.phx)
      /** @type {Element} */
      let anchor = notes && !notes.hidden ? notes : chip;
      for (const extra of head.querySelectorAll(".phx")) { if (anchor.nextElementSibling !== extra) { anchor.insertAdjacentElement("afterend", extra); } anchor = extra; }
    }
  }
  document.addEventListener("click", ev => {
    const notes = /** @type {Element} */ (ev.target).closest(".pnotes");
    if (notes) { const panel = /** @type {HTMLElement} */ (notes.closest("section.panel")); panel.classList.toggle("notes-on"); decorate(/** @type {HTMLElement} */ (panel.parentElement)); return; }
    const chip = /** @type {Element} */ (ev.target).closest(".pcol");
    if (!chip) { return; }
    const panel = /** @type {HTMLElement} */ (chip.closest("section.panel[id]")), set = readClosed();
    if (set.has(panel.id)) { set.delete(panel.id); } else { set.add(panel.id); }
    storage.write({ key: KEY, text: [...set].join(",") });
    decorate(/** @type {HTMLElement} */ (panel.parentElement));
    // a panel shown again draws at its real width
    dispatchEvent(new Event("resize"));
    if (typeof page !== "undefined" && page.frames) { page.frames.mark({ cause: FrameCause.Ui }); }
  });
  return { decorate };
})();

// ---------------------------------------------------------- LaTeX and icons
// TEX.html: LaTeX set by the inlined KaTeX as MathML, which the browser draws with no extra fonts or CSS; the TeX
// source in a code tag where KaTeX is missing (node tests)
const TEX = Object.freeze({
  /** @param {string} tex @param {{ display?: boolean }} [options] */
  html(tex, { display = false } = {}) {
    try {
      // full-size fractions everywhere; a display formula is its own left-aligned line (the browser would centre it)
      if (typeof katex !== "undefined" && katex) { const math = katex.renderToString("\\displaystyle " + tex, { output: "mathml", throwOnError: false }); return display ? `<span class="texblock">${math}</span>` : math; }
    } catch (error) { }
    return `<code>${String(tex).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</code>`;
  }
});
// icons from Lucide (lucide-static 0.454.0, ISC License: vendor/LUCIDE_LICENSE), inline SVG in currentColor
const ICONS = (() => {
  const svg = body => `<svg class="ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return Object.freeze({
    play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
    pause: svg('<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'),
    rewind: svg('<polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>'),
    forward: svg('<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>'),
    skipBack: svg('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>'),
    skipForward: svg('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>'),
    repeat: svg('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
    trendingUp: svg('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>')
  });
})();
// market moves in colour words, judged in σ of the move's own span (a day, a week, the days since entry): grey flat
// (under 0.5σ), yellow notable (0.5σ to 1.5σ either way), green a clear rise, red a clear fall (1.5σ or more)
const MOVES = (() => {
  const FLAT = 0.5, CLEAR = 1.5;
  const WORDS = Object.freeze({ flat: "flat", note: "notable", up: "clear rise", down: "clear fall" });
  /** @param {number} z the move in σ of its span */
  function classify(z) {
    if (!Number.isFinite(z)) { return "flat"; }
    const size = Math.abs(z);
    if (size < FLAT) { return "flat"; }
    if (size < CLEAR) { return "note"; }
    return z > 0 ? "up" : "down";
  }
  /** @param {number} z */
  const chip = z => `<span class="mv mv-${classify(z)}">${WORDS[classify(z)]} · ${Number.isFinite(z) ? (z < 0 ? MINUS : "+") + Math.abs(z).toFixed(1) : "–"}σ</span>`;
  return Object.freeze({ FLAT, CLEAR, WORDS, classify, chip });
})();
