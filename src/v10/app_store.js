// ============================================================ app store: one blob for both tabs, view codes, boot inputs
// blob in localStorage "rk-lab-v9": {v: 9, tab, theme, cmp: S9, yr}
// view code: "#v9." + enc({t, th, c: S9, y}) loads everything; "#v8." and "#v5." codes load through STATE.migrate.
// This file runs before the model, so BOOT only collects the raw inputs; the app's readBootState migrates them.
// The old keys ("rk-lab-v8", "rk-lab-v5") are read once, when there is no v9 blob, and never written: the v8 page
// stays deployed and keeps its own state.
const KEY9 = "rk-lab-v9", KEY8 = "rk-lab-v8", KEY5 = "rk-lab-v5";
// ok(a stored JSON object | null for missing, not JSON or not an object); err when the storage refused the read
function readKey(key) {
  const read = storage.read(key);
  if (!read.ok) { return read; }
  if (!read.value) { return Result.ok(null); }
  try {
    const o = JSON.parse(read.value);
    return Result.ok(o && typeof o === "object" ? o : null);
  } catch (e) {
    return Result.ok(null);
  }
}
// {blob: the v9 blob | null, legacy: the v8 blob or the bare v5 state | null, legacySrc, hash: location.hash,
//  storageError: the first refused read (LabError) | null, reported once the page has its bus}
const BOOT = (() => {
  const b = { blob: null, legacy: null, legacySrc: "", hash: "", storageError: null };
  const readObject = key => {
    const read = readKey(key);
    if (read.ok) { return read.value; }
    b.storageError = b.storageError || read.error;
    return null;
  };
  const v9 = readObject(KEY9);
  if (v9 && v9.v === 9) b.blob = v9;
  else {
    const v8 = readObject(KEY8);
    if (v8 && v8.v === 8) { b.legacy = v8; b.legacySrc = "v8"; }
    else { const v5 = readObject(KEY5); if (v5) { b.legacy = v5; b.legacySrc = "v5"; } }
  }
  try { b.hash = String(location.hash || ""); } catch (e) { b.hash = ""; }
  return b;
})();
