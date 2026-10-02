// ============================================================ app: comparer glue, tab strip, theme, view codes, persistence (loaded last)
// The comparer's state is S9 (STATE); every render builds C = CTX.ctx9(S9) and hands it to the summary, the dock and
// the views. The Compounding tab lives in YR (init, render(mode), getState, setState, reset).
// Contract with the UI modules: cmpWire, renderAll, renderNotes, refresh / RAF (ui_common8), getS9 / setS9,
// STATE.sanitize9, STATE.migrate.
let S9 = null, C = null;
function getS9() { return S9; }
function setS9(s) { S9 = s; }
const appSafe = (f, n) => { try { f(); } catch (e) { console.error(n, e); } };
// wire the Compare tab once: summary, dock, then the views (they build their panels inside #views)
function cmpWire() {
  SUM9.init(); DOCK9.init();
  wireViews({ host: $("#views"), getS9, setS9, onEvents: cmpEvents });
}
// one render of the Compare tab. DOCK9.render runs before the views: it sets body.dock-off from S9.view.dock,
// which changes the main column's width before the charts measure it.
function renderAll() {
  C = CTX.ctx9(S9);
  for (const f of SYNC) f();
  appSafe(() => SUM9.render(C), "summary");
  appSafe(() => DOCK9.render(C), "dock");
  renderViews(C);
  appSave();
}
function renderNotes() { VIEWS.notes(); }

// title: the page's own <title>; the Compare tab names A vs B (SUM9.render), the Compounding tab names itself
const APP = { tab: "compare", theme: "auto", scroll: { compare: 0, yr: 0 }, title: document.title };
const ASYNC = [];   // sync functions for app-level controls (theme seg), run on every render whichever tab is active
let lastCode = "", lastBlob = "";
function applyTheme() { const r = document.documentElement; if (APP.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", APP.theme); }
function yrState() { try { return YR.getState(); } catch (e) { console.error("YR.getState", e); return null; } }
// one blob for both tabs (localStorage "rk-lab-v9"); the address carries the same view as a #v9. code
function appSave() {
  if (!S9) return;
  if (S9.view.theme !== APP.theme) S9 = STATE.applyChange(S9, s => { s.view.theme = APP.theme; });
  const meta = { tab: APP.tab, theme: APP.theme, yr: yrState() };
  const blob = JSON.stringify(STATE.blob(S9, meta));
  if (blob !== lastBlob) { lastBlob = blob; writeBlob(blob); }
  const code = STATE.code(S9, meta);
  if (code === lastCode) return; lastCode = code;
  const vc = $("#vcode"); if (vc) vc.value = code;
  try { history.replaceState(null, "", "#" + code); } catch (e) { }
}
function syncTabs() {
  const t = APP.tab, b = document.body;
  b.dataset.tab = t;
  $("#tab-cmp").hidden = t !== "compare"; $("#tab-yr").hidden = t !== "yr";
  document.querySelectorAll("#tabs [data-tab]").forEach(x => { const on = x.dataset.tab === t; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; });
}
// renders the active tab only; hidden tabs are display:none and render when they are shown
function appRender() {
  applyTheme();
  for (const f of ASYNC) f();
  syncTabs();
  if (APP.tab === "compare") renderAll();
  else { try { YR.render("full"); } catch (e) { console.error("YR.render", e); } document.title = "Compounding · " + APP.title; appSave(); }
}
// switching keeps each tab's own scroll position
function setTab(t) {
  if (!TABS.includes(t) || t === APP.tab) return;
  APP.scroll[APP.tab] = scrollY; APP.tab = t;
  if (RAF) { cancelAnimationFrame(RAF); RAF = 0; }
  appRender();
  window.scrollTo(0, APP.scroll[t] || 0);
}
const dockClass = () => document.body.classList.toggle("dock-off", !(S9 && S9.view.dock));
// load a view code (#v9., or #v8. / #v5. through migration). Returns null when s is not a view code and throws on a
// bad one, leaving the state as it was. Otherwise {tab, events}.
function loadCode(s) {
  if (!STATE.parse(s)) return null;
  const m = STATE.migrate(s);
  S9 = m.S9; dockClass();
  if (THEMES.includes(m.theme)) APP.theme = m.theme;
  if (m.src !== "v5" && m.yr != null) { try { YR.setState(m.yr); } catch (e) { console.error("YR.setState", e); } }
  return { tab: m.src !== "v5" && TABS.includes(m.tab) ? m.tab : "compare", events: m.events || [] };
}
// a loaded code: toast "View loaded" (with the migration note for v8 / v5 codes), switch tab, re-render
function codeLoaded(r) {
  cmpEvents([{ type: "note", aspects: [], text: "View loaded", actions: [] }].concat(r.events));
  if (r.tab !== APP.tab) { APP.scroll[APP.tab] = scrollY; APP.tab = r.tab; APP.scroll[r.tab] = 0; }
  refresh();
}
// first load: a code in the address wins over the stored blob; with no v9 blob, the v8 blob or the v5 store migrates
function appBoot() {
  const out = { tab: "compare", theme: "auto", yr: null, events: [], badHash: false };
  const src = BOOT.blob || BOOT.legacy;
  let m = null;
  if (src) { try { m = STATE.migrate(src); } catch (e) { console.warn("stored view did not load", e); m = null; } }
  if (m) {
    S9 = m.S9; out.events = m.events || [];
    out.tab = m.tab; out.theme = m.theme; out.yr = m.yr == null ? null : m.yr;
  }
  try {
    if (STATE.parse(BOOT.hash)) {
      const h = STATE.migrate(BOOT.hash);
      S9 = h.S9; out.events = h.events || [];
      out.tab = h.src === "v5" ? "compare" : h.tab;
      if (h.theme !== undefined) out.theme = h.theme;
      if (h.src !== "v5") out.yr = h.yr == null ? null : h.yr;
    }
  } catch (e) { out.badHash = true; }
  if (!S9) S9 = STATE.defaults();
  if (!TABS.includes(out.tab)) out.tab = "compare";
  if (!THEMES.includes(out.theme)) out.theme = "auto";
  return out;
}
function appInit() {
  const boot = appBoot();
  APP.tab = boot.tab; APP.theme = boot.theme;
  cmpWire(); renderNotes();
  exportWire({ tab: () => APP.tab, getS9, code: () => lastCode, save: appSave });
  // tab strip
  const tabs = $("#tabs");
  tabs.addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
  tabs.addEventListener("keydown", e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; const i = TABS.indexOf(APP.tab), n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]; setTab(n); tabs.querySelector(`[data-tab="${n}"]`).focus(); e.preventDefault(); });
  // ⋯ page menu: theme, view code, resets
  seg("#c-theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], () => APP.theme, v => { APP.theme = v; }, ASYNC);
  $("#vcopy").addEventListener("click", () => copyText($("#vcode").value, $("#vcode")));
  $("#vgo").addEventListener("click", () => {
    let r = null;
    try { r = loadCode($("#vload").value); } catch (e) { r = null; }
    if (!r) { toast("That code didn't load. Copy it again from ‘View code’."); return; }
    $("#vload").value = ""; $("#pmenu").open = false;
    codeLoaded(r);
  });
  const resetCmp = () => { S9 = STATE.defaults(); dockClass(); };
  const resetYr = () => { try { YR.reset(); } catch (e) { console.error("YR.reset", e); } };
  $("#vreset").addEventListener("click", () => { if (APP.tab === "compare") { resetCmp(); toast("Compare A vs B reset to defaults"); } else { resetYr(); toast("Compounding reset to defaults"); } $("#pmenu").open = false; refresh(); });
  $("#vresetAll").addEventListener("click", () => { resetCmp(); resetYr(); $("#pmenu").open = false; toast("Both tabs reset to defaults"); refresh(); });
  // a pasted or edited address: our own replaceState never fires hashchange, but compare with lastCode anyway
  addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (!h || h === lastCode) return;
    let r = null, bad = false;
    try { r = loadCode(location.hash); } catch (e) { bad = true; }
    if (bad) { toast("The view code in the address didn't load; the current view is kept."); lastCode = ""; refresh(); return; }
    if (r) codeLoaded(r);
  });
  // listeners that apply to whichever tab is showing
  let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(refresh, 120); });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", refresh);
  // docks: body[data-tab] decides which shows (CSS). #dock collapses with body.dock-off (S9.view.dock, set again by
  // DOCK9.render); #ydock collapses with body.ydock-off, which YR sets from its own state
  dockClass();
  if (!$("#tab-yr").children.length) $("#tab-yr").innerHTML = `<p class="yrnone">The Compounding tab is not part of this build.</p>`;
  try { YR.init(); if (boot.yr != null) YR.setState(boot.yr); } catch (e) { console.error("YR.init", e); }
  appRender();
  if (boot.badHash) toast("The view code in the address didn't load; the last saved view is shown.");
  else if (boot.events.length) cmpEvents(boot.events);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
}
appInit();
