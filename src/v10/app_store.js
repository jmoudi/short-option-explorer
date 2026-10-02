// ============================================================ app store: the boot inputs (the stored blob, the address)
// blob in localStorage "rk-lab-v10": {v: 10, tab, comparison, assumptions, prefs, periodVol, yr} (STATE.writeStoredView);
// the address carries the same document as a "#v10." code. Older views load through STATE's migration.
// This file runs before the model, so BOOT only collects the raw inputs; the app's readBootState migrates them.
// The older keys are read once, in order, when the newer ones hold nothing usable, and never written or removed:
// rk-lab-v9 (the v9 page), then rk-lab-v8, then rk-lab-v5 (those pages stay deployed and keep their own state).
const STORAGE_KEY = Object.freeze({ V10: "rk-lab-v10", V9: "rk-lab-v9", V8: "rk-lab-v8", V5: "rk-lab-v5" });
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
// {blob: the v10 or v9 blob | null, legacy: the v8 blob or the bare v5 state | null, legacySrc, hash: location.hash,
//  storageError: the first refused read (LabError) | null, reported once the page has its bus}
const BOOT = (() => {
  const b = { blob: null, legacy: null, legacySrc: "", hash: "", storageError: null };
  const readObject = key => {
    const read = readKey(key);
    if (read.ok) { return read.value; }
    b.storageError = b.storageError || read.error;
    return null;
  };
  const readBlob = ({ key, version }) => {
    const o = readObject(key);
    return o && o.v === version ? o : null;
  };
  b.blob = readBlob({ key: STORAGE_KEY.V10, version: +ViewCodeVersion.V10 }) || readBlob({ key: STORAGE_KEY.V9, version: +ViewCodeVersion.V9 });
  if (!b.blob) {
    const v8 = readBlob({ key: STORAGE_KEY.V8, version: +ViewCodeVersion.V8 });
    if (v8) { b.legacy = v8; b.legacySrc = "v8"; }
    else { const v5 = readObject(STORAGE_KEY.V5); if (v5) { b.legacy = v5; b.legacySrc = "v5"; } }
  }
  try { b.hash = String(location.hash || ""); } catch (e) { b.hash = ""; }
  return b;
})();
