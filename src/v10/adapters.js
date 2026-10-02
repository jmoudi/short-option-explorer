/**
 * The lab's doors to the browser: persistent storage, the clipboard, file downloads and the calendar. The browser
 * globals they cover are touched only here; storage, clipboard and download answer with a Result and never throw, so
 * the caller decides what the person sees. The calendar answers with plain values (it cannot fail) and holds the day
 * arithmetic and day formats the UI and the app print. Swapping an adapter (a node test fake; Temporal for the
 * calendar once node has it) changes this file only. Nothing runs at load: the node tests load this file as is.
 */

const ADAPTERS_CONFIG = Object.freeze({
  downloadMimeType: "text/markdown;charset=utf-8",
  revokeObjectUrlAfterMs: 1000,               // the Blob URL must outlive the click that starts the download
  monthNames: Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]),
  homeYear: 2026,                             // short day labels omit this year (the data's year)
  dayMs: 864e5,
  fullYearAfterDays: 3652.5                   // a day label more than ten years out prints its four-digit year
});
const AdapterError = Object.freeze({
  BadKey: "bad_key", StorageUnavailable: "storage_unavailable", BadText: "bad_text", ClipboardBlocked: "clipboard_blocked",
  BadFilename: "bad_filename", EmptyFile: "empty_file", BlobFailed: "blob_failed", ViewerUnavailable: "unavailable", Declined: "declined"
});
// the message of a caught error, or the fallback when it carries none
/** @param {{ error: any, fallback: string }} caught */
const describeError = ({ error, fallback }) => (error && error.message ? error.message : fallback);
const isFilledString = value => typeof value === "string" && value.trim().length > 0;
const isDate = value => value instanceof Date;

// ---------------------------------------------------------------- storage (localStorage; private windows may refuse it)
const storage = Object.freeze({
  /** @returns {LabResult} ok(text | null) */
  read(key) {
    if (!isFilledString(key)) { return Result.err({ code: AdapterError.BadKey, message: `storage.read needs a key, got ${JSON.stringify(key)}` }); }
    try {
      return Result.ok(localStorage.getItem(key));
    } catch (error) {
      return Result.err({ code: AdapterError.StorageUnavailable, message: describeError({ error, fallback: `localStorage refused to read ${key}` }) });
    }
  },
  /** @returns {LabResult} */
  write({ key, text } = { key: "", text: "" }) {
    if (!isFilledString(key)) { return Result.err({ code: AdapterError.BadKey, message: `storage.write needs a key, got ${JSON.stringify(key)}` }); }
    if (typeof text !== "string") { return Result.err({ code: AdapterError.BadText, message: `storage.write(${key}) needs text, got ${typeof text}` }); }
    try {
      localStorage.setItem(key, text);
      return Result.ok({ key });
    } catch (error) {
      return Result.err({ code: AdapterError.StorageUnavailable, message: describeError({ error, fallback: `localStorage refused to write ${key}` }) });
    }
  },
  /** @returns {LabResult} */
  remove(key) {
    if (!isFilledString(key)) { return Result.err({ code: AdapterError.BadKey, message: `storage.remove needs a key, got ${JSON.stringify(key)}` }); }
    try {
      localStorage.removeItem(key);
      return Result.ok({ key });
    } catch (error) {
      return Result.err({ code: AdapterError.StorageUnavailable, message: describeError({ error, fallback: `localStorage refused to remove ${key}` }) });
    }
  }
});

// ---------------------------------------------------------------- clipboard
const clipboard = Object.freeze({
  // the browser call starts synchronously, inside the click that asked for it (user activation)
  /** @returns {Promise<LabResult>} */
  async writeText(text) {
    if (typeof text !== "string") { return Result.err({ code: AdapterError.BadText, message: `clipboard.writeText needs text, got ${typeof text}` }); }
    try {
      await navigator.clipboard.writeText(text);
      return Result.ok({ length: text.length });
    } catch (error) {
      return Result.err({ code: AdapterError.ClipboardBlocked, message: describeError({ error, fallback: "the browser refused the clipboard" }) });
    }
  }
});

// ---------------------------------------------------------------- download
// Handing the viewer a file. Inside the claude.ai viewer a plain anchor download does nothing, so the page asks the
// viewer's `downloads` capability first (the viewer confirms the save and may decline); the standalone file, where
// `window.claude` does not exist, falls back to a Blob anchor.
const download = (() => {
  async function resolveViewerDownloads() {
    const hasViewerRuntime = typeof window !== "undefined" && window.claude && typeof window.claude.use === "function";
    if (!hasViewerRuntime) { return null; }
    try { return await window.claude.use("downloads"); } catch (e) { return null; }
  }
  /** @returns {Promise<LabResult>} ok({status: "saved" | "declined", filename}) */
  async function saveTextFile({ filename, text } = { filename: "", text: "" }) {
    if (!isFilledString(filename)) { return Result.err({ code: AdapterError.BadFilename, message: `a non-empty filename is required, got ${JSON.stringify(filename)}` }); }
    if (typeof text !== "string" || !text.length) { return Result.err({ code: AdapterError.EmptyFile, message: `nothing to save for ${filename}` }); }
    const viewerDownloads = await resolveViewerDownloads();
    if (viewerDownloads) {
      try {
        await viewerDownloads.save({ filename, data: text });
        return Result.ok({ status: "saved", filename });
      } catch (e) {
        const code = e && e.code ? e.code : AdapterError.ViewerUnavailable;
        if (code === AdapterError.Declined) { return Result.ok({ status: "declined", filename }); }
        return Result.err({ code, message: describeError({ error: e, fallback: `the viewer could not save ${filename} (${code})` }) });
      }
    }
    try {
      const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: ADAPTERS_CONFIG.downloadMimeType }));
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), ADAPTERS_CONFIG.revokeObjectUrlAfterMs);
      return Result.ok({ status: "saved", filename });
    } catch (e) {
      return Result.err({ code: AdapterError.BlobFailed, message: describeError({ error: e, fallback: `the browser refused the download of ${filename}` }) });
    }
  }
  return Object.freeze({ saveTextFile, resolveViewerDownloads });
})();

// ---------------------------------------------------------------- calendar
// Local days for "exported on" lines and file names; UTC days for dates computed from the data's as-of day, so a
// recovery date does not move with the viewer's time zone.
const calendar = (() => {
  const MONTHS = ADAPTERS_CONFIG.monthNames;
  const pad2 = n => String(n).padStart(2, "0");
  const asDate = value => (isDate(value) ? value : new Date(value));
  return Object.freeze({
    today() { return new Date(); },
    nowMs() { return Date.now(); },
    /** "2 Oct 2026" in local time */
    formatLongDay(date) { return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`; },
    /** "2026-10-02" in local time (file names) */
    formatIsoDay(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; },
    /** UTC midnight of a text that starts with YYYY-MM-DD (the data's as-of stamp); NaN for anything else */
    readUtcDayStart(text) {
      const at = String(text || "");
      if (!/^\d{4}-\d{2}-\d{2}/.test(at)) { return NaN; }
      return Date.UTC(+at.slice(0, 4), +at.slice(5, 7) - 1, +at.slice(8, 10));
    },
    /**
     * the UTC day `days` after startMs: "1 Nov", "1 Nov 27" in another year, "1 Nov 2036" more than ten years out
     * @param {{ startMs: number, days: number }} span
     */
    formatDayAfter({ startMs, days }) {
      const d = new Date(startMs + days * ADAPTERS_CONFIG.dayMs), y = d.getUTCFullYear();
      const otherYear = y !== new Date(startMs).getUTCFullYear();
      const yearTxt = days > ADAPTERS_CONFIG.fullYearAfterDays ? String(y) : String(y).slice(2);
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${otherYear ? " " + yearTxt : ""}`;
    },
    /** the day of the data's as-of stamp ("2026-10-02 16:00") as "2 Oct 2026"; any other text comes back as given */
    formatAsOfDay(text) {
      const at = String(text || "");
      if (!/^\d{4}-\d{2}-\d{2}/.test(at)) { return at; }
      return `${+at.slice(8, 10)} ${MONTHS[+at.slice(5, 7) - 1]} ${at.slice(0, 4)}`;
    },
    /** a Date or timestamp as "5 Oct" (UTC), "5 Oct 27" outside the home year, "–" when invalid */
    formatShortUtcDay(value) {
      const t = asDate(value);
      if (isNaN(t.getTime())) { return "–"; }
      const y = t.getUTCFullYear();
      return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}${y !== ADAPTERS_CONFIG.homeYear ? " " + String(y).slice(2) : ""}`;
    }
  });
})();
