// ============================================================ app store: one blob for both tabs, view codes, boot
// blob in localStorage "rk-lab-v8": {v: 8, tab, theme, cmp, yr}
// view code: "#v8." + enc({t, th, c, y}) loads everything; "#v5." + enc(st) loads the comparer only
const KEY8 = "rk-lab-v8", KEY5 = "rk-lab-v5", TABS = ["compare", "yr"], THEMES = ["auto", "light", "dark"];
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
function readBlob() {
  try { const s = localStorage.getItem(KEY8); if (s) { const o = JSON.parse(s); if (o && o.v === 8) return o; } } catch (e) { }
  return null;
}
function writeBlob(o) { try { localStorage.setItem(KEY8, JSON.stringify(o)); } catch (e) { } }
// a view code, with or without the leading "#" or the page address; returns null when it is not one
function parseCode(s) {
  s = String(s || "").trim().replace(/^.*#/, "");
  if (s.startsWith("v8.")) { const o = dec(s.slice(3)); if (!o || typeof o !== "object") throw 0; return { src: "v8", tab: o.t, theme: o.th, cmp: o.c, yr: o.y }; }
  if (s.startsWith("v5.")) { const o = dec(s.slice(3)); if (!o || typeof o !== "object") throw 0; return { src: "v5", tab: "compare", theme: o.theme, cmp: o, yr: undefined }; }
  return null;
}
const BOOT = (() => {
  const blob = readBlob();
  let seed = null;
  if (!blob) { try { const s = localStorage.getItem(KEY5); if (s) seed = JSON.parse(s); } catch (e) { } }
  const b = { tab: "compare", theme: "auto", cmp: null, yr: null, src: blob ? "v8" : seed ? "v5-store" : "none" };
  if (blob) { b.tab = blob.tab; b.theme = blob.theme; b.cmp = blob.cmp; b.yr = blob.yr; }
  else if (seed) { b.cmp = seed; b.theme = seed.theme; }
  let h = null; try { h = parseCode(location.hash); } catch (e) { h = null; }
  if (h) {
    b.src = h.src; b.cmp = h.cmp; b.tab = h.tab;
    if (h.theme !== undefined) b.theme = h.theme;
    if (h.src === "v8") b.yr = h.yr;
  }
  if (!TABS.includes(b.tab)) b.tab = "compare";
  if (!THEMES.includes(b.theme)) b.theme = "auto";
  return b;
})();
