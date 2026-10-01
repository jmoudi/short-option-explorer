// ============================================================ app: tab strip, theme, view codes, persistence (loaded last)
// The comparer keeps st / C / SYNC / renderAll(); the Compounding tab lives in YR (init, render(mode), getState, setState, reset).
const APP = { tab: BOOT.tab, theme: BOOT.theme, scroll: { compare: 0, yr: 0 } };
const ASYNC = [];   // sync functions for app-level controls (theme seg), run on every render whichever tab is active
let lastCode = "", lastBlob = "";
function applyTheme() { const r = document.documentElement; if (APP.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", APP.theme); }
function yrState() { try { return YR.getState(); } catch (e) { console.error("YR.getState", e); return null; } }
// one blob for both tabs; the address carries the same view as a #v8. code
function appSave() {
  st.theme = APP.theme;   // kept inside the comparer state so v5-style readers still see a theme
  const y = yrState(), code = "v8." + enc({ t: APP.tab, th: APP.theme, c: st, y });
  const blob = JSON.stringify({ v: 8, tab: APP.tab, theme: APP.theme, cmp: st, yr: y });
  if (blob !== lastBlob) { lastBlob = blob; try { localStorage.setItem(KEY8, blob); } catch (e) { } }
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
  else { try { YR.render("full"); } catch (e) { console.error("YR.render", e); } appSave(); }
}
// switching keeps each tab's own scroll position
function setTab(t) {
  if (!TABS.includes(t) || t === APP.tab) return;
  APP.scroll[APP.tab] = scrollY; APP.tab = t;
  if (RAF) { cancelAnimationFrame(RAF); RAF = 0; }
  appRender();
  window.scrollTo(0, APP.scroll[t] || 0);
}
function loadCode(s) {
  const h = parseCode(s); if (!h) throw 0;
  st = sanitize(h.cmp);
  document.body.classList.toggle("dock-off", !st.dock);
  if (THEMES.includes(h.theme)) APP.theme = h.theme;
  if (h.src === "v8" && h.yr != null) { try { YR.setState(h.yr); } catch (e) { console.error("YR.setState", e); } }
  return h.src === "v8" && TABS.includes(h.tab) ? h.tab : "compare";
}
function appInit() {
  cmpWire(); renderNotes();
  // tab strip
  const tabs = $("#tabs");
  tabs.addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
  tabs.addEventListener("keydown", e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; const i = TABS.indexOf(APP.tab), n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]; setTab(n); tabs.querySelector(`[data-tab="${n}"]`).focus(); e.preventDefault(); });
  // ⋯ page menu: theme, view code, resets
  seg("#c-theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], () => APP.theme, v => { APP.theme = v; }, ASYNC);
  $("#vcopy").addEventListener("click", () => copyText($("#vcode").value, $("#vcode")));
  $("#vgo").addEventListener("click", () => {
    let t;
    try { t = loadCode($("#vload").value); } catch (e) { toast("That code didn't load. Copy it again from ‘View code’."); return; }
    $("#vload").value = ""; $("#pmenu").open = false; toast("View loaded");
    if (t !== APP.tab) { APP.scroll[APP.tab] = scrollY; APP.tab = t; APP.scroll[t] = 0; }
    refresh();
  });
  const resetCmp = () => { st = sanitize(null); document.body.classList.remove("dock-off"); };
  const resetYr = () => { try { YR.reset(); } catch (e) { console.error("YR.reset", e); } };
  $("#vreset").addEventListener("click", () => { if (APP.tab === "compare") { resetCmp(); toast("Compare A vs B reset to defaults"); } else { resetYr(); toast("Compounding reset to defaults"); } $("#pmenu").open = false; refresh(); });
  $("#vresetAll").addEventListener("click", () => { resetCmp(); resetYr(); $("#pmenu").open = false; toast("Both tabs reset to defaults"); refresh(); });
  // listeners that apply to whichever tab is showing
  let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(refresh, 120); });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", refresh);
  // docks: body[data-tab] decides which shows (CSS). #dock collapses with body.dock-off (comparer state st.dock);
  // #ydock collapses with body.ydock-off, which YR sets from its own state
  if (!st.dock) document.body.classList.add("dock-off");
  if (!$("#tab-yr").children.length) $("#tab-yr").innerHTML = `<p class="yrnone">The Compounding tab is not part of this build.</p>`;
  try { YR.init(); if (BOOT.yr != null) YR.setState(BOOT.yr); } catch (e) { console.error("YR.init", e); }
  appRender();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
}
appInit();
