// ============================================================ app store: one blob for both tabs, view codes, boot inputs
// blob in localStorage "rk-lab-v9": {v: 9, tab, theme, cmp: S9, yr}
// view code: "#v9." + enc({t, th, c: S9, y}) loads everything; "#v8." and "#v5." codes load through STATE.migrate.
// This file runs first in the bundle, before the model, so BOOT only collects the raw inputs; app9 migrates them.
// The old keys ("rk-lab-v8", "rk-lab-v5") are read once, when there is no v9 blob, and never written: the v8 page
// stays deployed and keeps its own state.
const KEY9 = "rk-lab-v9", KEY8 = "rk-lab-v8", KEY5 = "rk-lab-v5", TABS = ["compare", "yr"], THEMES = ["auto", "light", "dark"];
function readKey(k) {
  try { const s = localStorage.getItem(k); if (!s) return null; const o = JSON.parse(s); return o && typeof o === "object" ? o : null; }
  catch (e) { return null; }
}
function writeBlob(s) { try { localStorage.setItem(KEY9, s); } catch (e) { } }
// {blob: the v9 blob | null, legacy: the v8 blob or the bare v5 state | null, legacySrc, hash: location.hash}
const BOOT = (() => {
  const b = { blob: null, legacy: null, legacySrc: "", hash: "" };
  const v9 = readKey(KEY9);
  if (v9 && v9.v === 9) b.blob = v9;
  else {
    const v8 = readKey(KEY8);
    if (v8 && v8.v === 8) { b.legacy = v8; b.legacySrc = "v8"; }
    else { const v5 = readKey(KEY5); if (v5) { b.legacy = v5; b.legacySrc = "v5"; } }
  }
  try { b.hash = String(location.hash || ""); } catch (e) { b.hash = ""; }
  return b;
})();
