// ============================================================ state: the page's one state tree, sanitizers, view codes, migration (pure)
// One namespace object, STATE. The tree the store holds (plus the visible tab):
//   { comparison: Comparison (A, B, links, expMap, sizing),
//     assumptions: { unit, rlo, rhi, rlink, wl, wlo, whi, dist, ivs, svs, svd, align },
//     prefs: { units, ovm, ..., pins: [{SA, SB, dA, dB}], dock, theme, rd*, exportSections: {[tab]: {[section]: on}} },
//     periodVol: { [instrument id]: { pct, source, expiry? } } }   absent = the listed 30-day historical vol
// The view code and the stored blob carry the whole tree, the tab and the Compounding tab's state ("#v10." codes,
// localStorage "rk-lab-v10"); v9, v8 and v5 codes and blobs load through migration. Every function returns new
// objects; inputs are never modified (they may be deep-frozen).
const STATE = (() => {
  const ASSUMPTIONS_DEF = Object.freeze({ unit: MoveUnit.Sigma, rlo: 2, rhi: 2, rlink: true, wl: WorstLossRange.View, wlo: 2, whi: 2, dist: Odds.Implied, ivs: 0, svs: 0, svd: true, align: Align.Fraction });
  const PREFS_DEF = Object.freeze({
    units: ReadingUnit.Percent, ovm: "cr", ovv: "chart", gview: "heat", gval: "pnl", gtab: "D", nm: 13, nd: 7, gl: false, ct: "zero", cts: 5,
    ovk: true, ovc: true, ovb: false, ovs: true, ovo: true, pso: true, pss: true, payLeft: 0, cs: "comp", cr: "auto", crx: 20, shared: true,
    sweep: "both", sweepSmoothing: 0, mgTp: 50, mgSl: 200, jday: -1, pins: Object.freeze([]), dock: true, theme: "auto",
    rdHit: HitBasis.Move, rdK: 2, rdDir: HitSide.Worse, rdL: 60, rdBase: "nav", rdCap: Capital.Margin, rdG: GrowthRate.IfNoSuchHit, rdGc: 2,
    // the Compare tab's junior tab; the Capture view: the share x for the fixed preset and the odds of keeping at least
    // x, and the custom variant (vol source and typed vol, a gap's chance / size / side, the reading, the exit)
    // a side that takes the other's credit as a share of the chain's mid: "off", or the side it is copied from
    fillMatch: "off",
    cmpView: CompareView.Results, capX: 50, ccSrc: "pv", ccVol: 100, ccGapP: 0, ccGapS: 30, ccGapSide: "down", ccRead: "mean", ccPct: 25, ccExit: "expiry", ccLeft: 2,
    // a tab's entry exists once the reader chose its sections (absent: the defaults below, so a section added later
    // shows by its own default); key order is the order of the first choice
    exportSections: Object.freeze({})
  });
  const ENUMS = Object.freeze({
    unit: Object.values(MoveUnit), wl: Object.values(WorstLossRange), dist: Object.values(Odds), align: Object.values(Align),
    units: Object.values(ReadingUnit), ovm: ["cr", "crs", "crd", "ev", "pop", "worst", "wingc", "wingp", "rom"], ovv: ["chart", "table"],
    gview: ["heat", "num"], gval: ["pnl", "contrib"], gtab: ["A", "B", "D"], ct: ["zero", "lev"], cs: ["comp", "lin"], cr: ["auto", "fix"],
    sweep: ["both", "put", "call", "wingCall"], theme: THEMES,
    rdHit: Object.values(HitBasis), rdDir: Object.values(HitSide), rdBase: ["nav", "start"], rdCap: Object.values(Capital), rdG: Object.values(GrowthRate),
    nm: [9, 13, 17, 25], nd: [1, 2, 5, 7, 14, 30], cts: [1, 2, 5, 10, 20],
    fillMatch: ["off", "A", "B"], cmpView: Object.values(CompareView), ccSrc: ["pv", "atm", "typed"], ccGapSide: ["down", "either"], ccRead: ["mean", "median", "pct"], ccExit: ["expiry", "days"]
  });
  // which export sections are on until the reader chooses, per tab in document order (the export holds the labels)
  const EXPORT_SECTION_DEFAULTS = Object.freeze({
    [Tab.Compare]: Object.freeze({
      [ExportSection.Header]: true, [ExportSection.Comparison]: true, [ExportSection.Assumptions]: true, [ExportSection.Results]: true,
      [ExportSection.Recovery]: true, [ExportSection.Capture]: true, [ExportSection.Pins]: true, [ExportSection.Overview]: false, [ExportSection.Notes]: true
    }),
    [Tab.Compounding]: Object.freeze({
      [ExportSection.Runs]: true, [ExportSection.Base]: true, [ExportSection.Strip]: true, [ExportSection.Kept]: true, [ExportSection.Weeks]: false,
      [ExportSection.Stress]: true, [ExportSection.Random]: true
    })
  });
  const STATE_CONFIG = Object.freeze({
    // the version the page writes (codes "v10." and the blob's v); the others in ViewCodeVersion are read only
    writtenVersion: ViewCodeVersion.V10,
    pinLimit: 12,
    // v9's listed-vol multiplier (scen.hvk): read once by migration, which turns it into a hand-set period vol per ticker
    legacyVolScaleRange: Object.freeze([0.5, 1.6]),
    // the run that carries the Compounding tab's own moves when B differs in vol (yr.sc.volOverride.run) in a view
    // migrated from the tab's old per-run vols: B's, as v9 kept them in rvB
    legacyOverrideRun: RunSlot.B,
    // where v9 kept the export section choice: inside the Compounding tab's view state, one key per tab
    v9ExportKeys: Object.freeze({ exportCmp: Tab.Compare, exportYr: Tab.Compounding }),
    // prefs keys with their own sanitizer (sanFlat would copy them unchecked)
    prefsSanitizedApart: Object.freeze(["pins", "exportSections"]),
    periodVolKeptText: "period vol kept"
  });
  const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const fin = v => typeof v === "number" && Number.isFinite(v);

  // ---------------------------------------------------------- move units (shared with the render context)
  const UNAME = Object.freeze({ [MoveUnit.Sigma]: "σ", [MoveUnit.Percent]: "%", [MoveUnit.Points]: "price" });
  const uStep = unit => unit === MoveUnit.Sigma ? 0.25 : unit === MoveUnit.Percent ? 5 : 0.5;
  const uRound = (v, unit) => unit === MoveUnit.Sigma ? Math.round(v * 20) / 20 : unit === MoveUnit.Percent ? Math.round(v) : Math.round(v * 20) / 20;
  const rangeCaps = (unit, S) => unit === MoveUnit.Percent ? [95, 2000] : unit === MoveUnit.Points ? [+(S * 0.95).toFixed(2), +(S * 20).toFixed(2)] : [12, 12];
  function uLab(u, unit, dec) {
    const sg = Math.abs(u) < 1e-9 ? "" : u < 0 ? MINUS : "+", a = Math.abs(u);
    if (unit === MoveUnit.Sigma) return sg + String(+a.toFixed(dec ?? 2)) + "σ";
    if (unit === MoveUnit.Percent) return sg + String(+a.toFixed(dec ?? 1)) + "%";
    return sg + String(+a.toFixed(dec ?? 2));
  }

  // ---------------------------------------------------------- one sanitizer per part
  function sanFlat(o, DEF) {
    const s = clone(DEF);
    if (!isObj(o)) return s;
    for (const k in s) {
      if (!(k in o) || STATE_CONFIG.prefsSanitizedApart.includes(k)) continue;
      if (ENUMS[k]) { if (ENUMS[k].includes(o[k])) s[k] = o[k]; }
      else if (typeof o[k] === typeof s[k] && (typeof o[k] !== "number" || Number.isFinite(o[k]))) s[k] = o[k];
    }
    return s;
  }
  function sanitizeAssumptions(o) {
    const s = sanFlat(o, ASSUMPTIONS_DEF);
    for (const k of ["rlo", "rhi", "wlo", "whi"]) s[k] = clamp(+s[k] || ASSUMPTIONS_DEF[k], 0.01, 5000);
    s.ivs = clamp(s.ivs, -30, 60); s.svs = clamp(s.svs, 0, 20);
    return s;
  }
  const sanPins = a => Array.isArray(a) ? a.filter(p => isObj(p) && fin(+p.SA) && +p.SA > 0 && fin(+p.SB) && +p.SB > 0 && fin(+p.dA) && fin(+p.dB)).map(p => ({ SA: +p.SA, SB: +p.SB, dA: +p.dA, dB: +p.dB })).slice(0, STATE_CONFIG.pinLimit) : [];
  // one tab's sections: every section of the tab in document order, the chosen booleans over the defaults
  /** @param {{ tab: string, chosen?: any }} input */
  function pickExportSections({ tab, chosen }) {
    const picked = Object.assign({}, EXPORT_SECTION_DEFAULTS[tab]);
    if (!isObj(chosen)) { return picked; }
    for (const section of Object.keys(picked)) {
      if (typeof chosen[section] === "boolean") { picked[section] = chosen[section]; }
    }
    return picked;
  }
  // the tabs whose sections were chosen, in the order they were first chosen (the input's key order)
  function sanitizeExportSections(o) {
    const out = {};
    if (!isObj(o)) { return out; }
    for (const tab of Object.keys(o)) {
      const isChosenTab = !!EXPORT_SECTION_DEFAULTS[tab] && isObj(o[tab]);
      if (isChosenTab) { out[tab] = pickExportSections({ tab, chosen: o[tab] }); }
    }
    return out;
  }
  // the recovery panel's old "EV" growth reading was the plain average: views that chose it keep their headline
  const LEGACY_GROWTH = Object.freeze({ ev: GrowthRate.Average });
  function sanitizePrefs(o) {
    const legacyGrowth = isObj(o) && LEGACY_GROWTH[o.rdG];
    const s = sanFlat(legacyGrowth ? Object.assign({}, o, { rdG: legacyGrowth }) : o, PREFS_DEF);
    s.crx = clamp(s.crx, 0.5, 200); s.sweepSmoothing = clamp(s.sweepSmoothing, 0, 2); s.mgTp = clamp(s.mgTp, 0, 95); s.mgSl = clamp(s.mgSl, 0, 1000); s.jday = Math.round(clamp(s.jday, -1, 400)); s.payLeft = Math.round(clamp(s.payLeft, 0, 400));
    s.capX = clamp(s.capX, -300, 100); s.ccVol = clamp(s.ccVol, 1, 400); s.ccGapP = clamp(s.ccGapP, 0, 100); s.ccGapS = clamp(s.ccGapS, 0, 95);
    s.ccPct = clamp(s.ccPct, 1, 99); s.ccLeft = Math.round(clamp(s.ccLeft, 0, 400));
    s.pins = sanPins(isObj(o) ? o.pins : null);
    s.exportSections = sanitizeExportSections(isObj(o) ? o.exportSections : null);
    return s;
  }
  // one entry per listed instrument with a finite pct (clamped to the stored range, two decimals). The source is
  // kept as stored (an unknown one reads as Set: someone typed the number); an entry whose source is the listed vol
  // is dropped, since absent means exactly that. Only an ATM entry keeps its expiry
  const VOL_SOURCES = /** @type {readonly string[]} */ (Object.freeze(Object.values(VolSource)));
  // an expiry some listed instrument lists ("20261016"): where an ATM period vol can have been read (A's horizon)
  const isListedExpiry = expiry => typeof expiry === "string" && INST.ids().some(id => INST.base(id).expiries.includes(expiry));
  const roundPeriodVol = pct => +(+pct).toFixed(PERIOD_VOL_CONFIG.decimals);
  function sanitizePeriodVolEntry(entry) {
    const [lo, hi] = PERIOD_VOL_CONFIG.range;
    const source = VOL_SOURCES.includes(entry.source) ? entry.source : VolSource.Set;
    const out = { pct: roundPeriodVol(clamp(+entry.pct, lo, hi)), source };
    if (source !== VolSource.Atm) { return out; }
    // an ATM read without a listed expiry cannot say where it was read: it stays as the number it is, hand-set
    if (!isListedExpiry(entry.expiry)) { return Object.assign(out, { source: VolSource.Set }); }
    return Object.assign(out, { expiry: entry.expiry });
  }
  function sanitizePeriodVol(o) {
    const out = {};
    if (!isObj(o)) { return out; }
    for (const id of Object.keys(o)) {
      const entry = o[id];
      const isUsable = INST.has(id) && isObj(entry) && fin(+entry.pct) && entry.source !== VolSource.Hv30;
      if (isUsable) { out[id] = sanitizePeriodVolEntry(entry); }
    }
    return out;
  }

  // ---------------------------------------------------------- normaliser (v8 ensureUnit + range clamps)
  // in place: only ever called on a fresh tree (change / sanitizeTree); the exported normalise() copies first
  function normIn(tree) {
    const s = tree, events = [], sc = s.assumptions;
    const bA = POS.build(s.comparison.A), bB = CMP.buildB(s.comparison);
    const same = !!(bA.inst && bB.inst && bA.inst.version === bB.inst.version);
    if (sc.unit === MoveUnit.Points && !same && !bA.na) {
      const S = bA.S, sg = bA.sig, uOf = x => Math.log(x / S) / sg;
      const lo = Math.max(sc.rlo, 0), hi = Math.max(sc.rhi, 0);
      sc.unit = MoveUnit.Sigma; sc.rlo = uRound(-uOf(Math.max(S - lo, S * 0.05)), MoveUnit.Sigma) || 0.05; sc.rhi = uRound(uOf(S + hi), MoveUnit.Sigma) || 0.05;
      sc.wlo = sc.rlo; sc.whi = sc.rhi; if (Math.abs(sc.rlo - sc.rhi) > 1e-9) sc.rlink = false;
      events.push({ type: "note", aspects: [], text: "Price moves need one instrument, so the move range was converted to σ", actions: [] });
    }
    const [capLo, capHi] = rangeCaps(sc.unit, bA.na ? bA.S || 1 : bA.S);
    let note = "";
    if (sc.rlo > capLo) { sc.rlo = capLo; note = `The lower bound is capped at ${uLab(-capLo, sc.unit)}`; }
    if (sc.rhi > capHi) { sc.rhi = capHi; note = `The upper bound is capped at ${uLab(capHi, sc.unit)}`; }
    if (note && sc.rlink && Math.abs(sc.rlo - sc.rhi) > 1e-9) sc.rlink = false;
    if (sc.wlo > capLo) sc.wlo = capLo; if (sc.whi > capHi) sc.whi = capHi;
    if (note) events.push({ type: "note", aspects: [], text: note, actions: [] });
    return { state: s, events };
  }
  // the four parts, each through its sanitizer (anything else, the visible tab included, is dropped)
  const sanitizeParts = o => ({
    comparison: CMP.sanitize(o.comparison), assumptions: sanitizeAssumptions(o.assumptions), prefs: sanitizePrefs(o.prefs), periodVol: sanitizePeriodVol(o.periodVol)
  });
  const normalise = tree => normIn(clone(tree));
  function defaults() { return sanitizeTree(null); }
  function sanitizeTree(o) {
    return normIn(sanitizeParts(isObj(o) ? o : {})).state;
  }
  // fn edits a deep copy; then the sanitizers and the normaliser run. change() also returns normaliser notes.
  function change(tree, fn) {
    const s = clone(tree);
    if (fn) fn(s);
    return normIn(sanitizeParts(s));
  }
  const applyChange = (tree, fn) => change(tree, fn).state;
  // run one CMP mutator on the comparison: STATE.cmpOp(tree, "setA", "values.put", 20) -> {state, events}
  function cmpOp(tree, op, ...args) {
    const r = CMP[op](tree.comparison, ...args);
    const n = change(tree, s => { s.comparison = r.c; });
    return { state: n.state, events: r.events.concat(n.events) };
  }
  // apply an event action (from a toast; data: {steps, quiet}, see CMP.runAction): {state, events}
  function applyAction(tree, action) {
    const r = CMP.runAction(tree.comparison, action);
    const n = change(tree, s => { s.comparison = r.c; });
    return { state: n.state, events: (r.events || []).concat(n.events) };
  }
  function swap(tree) {
    const r = CMP.swap(tree.comparison);
    const n = change(tree, s => { s.comparison = r.c; s.prefs.pins = (s.prefs.pins || []).map(p => ({ SA: p.SB, SB: p.SA, dA: p.dB, dB: p.dA })); });
    return { state: n.state, events: r.events.concat(n.events) };
  }
  // the export's sections for one tab as the reader sees them (the chosen ones or the defaults)
  /** @param {{ prefs: any, tab: string }} input */
  function readExportSections({ prefs, tab }) {
    const chosen = isObj(prefs) && isObj(prefs.exportSections) ? prefs.exportSections[tab] : null;
    return pickExportSections({ tab, chosen });
  }

  // ---------------------------------------------------------- view codes and the stored blob
  const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
  // what a view code and the stored blob carry: the visible tab, the tree, the Compounding tab's state (null when it
  // could not be read). state = the store's state (the tree plus the tab)
  /** @param {{ state: any, yr: any }} input */
  function createViewDocument({ state, yr }) {
    return { tab: state.tab, comparison: state.comparison, assumptions: state.assumptions, prefs: state.prefs, periodVol: state.periodVol, yr };
  }
  // "v10." + base64url JSON of the document; put it after "#"
  /** @param {{ state: any, yr: any }} input */
  const writeViewCode = ({ state, yr }) => `v${STATE_CONFIG.writtenVersion}.` + enc(createViewDocument({ state, yr }));
  // localStorage["rk-lab-v10"]: {v: 10, ...the document}
  /** @param {{ state: any, yr: any }} input */
  const writeStoredView = ({ state, yr }) => Object.assign({ v: +STATE_CONFIG.writtenVersion }, createViewDocument({ state, yr }));
  // a view code, with or without "#" or the page address -> {text (the code alone), version (any digits, or "" when the
  // text does not start like a code), payload, isOneLine}
  function splitCode(input) {
    const text = String(input || "").trim().replace(/^.*#/, "");
    const head = /^v(\d+)\./.exec(text);
    if (!head) { return { text, version: "", payload: "", isOneLine: false }; }
    const payload = text.slice(head[0].length);
    return { text, version: head[1], payload, isOneLine: /^.*$/.test(payload) };
  }
  const CODE_VERSIONS = /** @type {readonly string[]} */ (Object.freeze(Object.values(ViewCodeVersion)));
  const isReadableCode = split => CODE_VERSIONS.includes(split.version) && split.isOneLine;
  // a code's payload as JSON; throws an Undecodable error naming the payload when it is not base64url JSON
  /** @param {{ version: string, payload: string }} split */
  function decodePayload({ version, payload }) {
    try {
      return dec(payload);
    } catch (error) {
      throw createCoreError({ code: ViewCodeError.Undecodable, message: `the v${version} view code payload ${JSON.stringify(payload.slice(0, 24))} is not base64url JSON (${describeThrown(error)})` });
    }
  }
  // the src a migrated view reports ("v10", "v9", "v8", "v5"; "none" for no view): its ViewCodeVersion, as messages name it
  const ViewSource = Object.freeze({
    V10: `v${ViewCodeVersion.V10}`, V9: `v${ViewCodeVersion.V9}`, V8: `v${ViewCodeVersion.V8}`, V5: `v${ViewCodeVersion.V5}`, None: "none"
  });
  const readDocumentTheme = o => isObj(o.prefs) ? o.prefs.theme : undefined;
  // a split code of a known version -> {src, tab, theme, content, yr}; content is the version's own state (the v10
  // document, the v9 comparer state, the v8 / v5 state); throws when the payload does not decode
  function decodeCode({ version, payload }) {
    const o = decodePayload({ version, payload });
    if (!isObj(o)) {
      throw createCoreError({ code: ViewCodeError.Undecodable, message: `the v${version} view code payload ${JSON.stringify(payload.slice(0, 24))} is not an object` });
    }
    if (version === ViewCodeVersion.V10) return { src: ViewSource.V10, tab: o.tab, theme: readDocumentTheme(o), content: o, yr: o.yr };
    if (version === ViewCodeVersion.V5) return { src: ViewSource.V5, tab: Tab.Compare, theme: o.theme, content: o, yr: undefined };
    return { src: "v" + version, tab: o.t, theme: o.th, content: o.c, yr: o.y };
  }
  // a view code -> {src, tab, theme, content, yr}; null when it is not one (of a known version); throws on a bad one
  function parse(input) {
    const split = splitCode(input);
    if (!isReadableCode(split)) return null;
    return decodeCode(split);
  }

  // ---------------------------------------------------------- migration from v9: the comparer state and the export choice
  // v9 kept {cmp, scen, view} (S9) and the export section choice inside the Compounding tab's view state; both move
  // into the tree, and the Compounding state loses the export keys (the page never writes them there again)
  function readV9ExportSections(yr) {
    const out = {};
    const hasView = isObj(yr) && isObj(yr.view);
    if (!hasView) { return out; }
    for (const key of Object.keys(yr.view)) {
      const tab = STATE_CONFIG.v9ExportKeys[key];
      if (tab) { out[tab] = yr.view[key]; }
    }
    return out;
  }
  function removeV9ExportSections(yr) {
    const hasView = isObj(yr) && isObj(yr.view);
    if (!hasView) { return yr; }
    const view = Object.assign({}, yr.view);
    for (const key of Object.keys(STATE_CONFIG.v9ExportKeys)) { delete view[key]; }
    return Object.assign({}, yr, { view });
  }
  /** @param {{ s9: any, yr: any }} input -> {state, yr, events} */
  function fromV9({ s9, yr }) {
    const o = isObj(s9) ? s9 : {};
    const prefs = Object.assign({}, isObj(o.view) ? o.view : {}, { exportSections: readV9ExportSections(yr) });
    const state = sanitizeTree({ comparison: o.cmp, assumptions: o.scen, prefs, periodVol: {} });
    return { state, yr: removeV9ExportSections(yr), events: [], legacyHvk: isObj(o.scen) ? o.scen.hvk : undefined };
  }
  // ---------------------------------------------------------- migration of the period vol's predecessors
  // Before v10 the comparer's odds scaled the listed vol by one multiplier for both tickers (hvk), and before part 2c
  // the Compounding tab kept its own realized-moves vol per ticker (yr.sc.rv; B's own in yr.sc.rvB). Both become the
  // one period vol, ticker by ticker, in this order:
  //   1. a period vol the view already has (a v10 document) is kept;
  //   2. else the Compounding tab's vol, when it differs from the listed vol as that tab rounded it (source Set);
  //   3. else listed × hvk, when hvk ≠ 1 (source Set);
  //   4. else nothing: the listed vol.
  // One note per ticker set. The Compounding state loses rv / rvB; B's own moves (rvB where they differ from A's rv)
  // become the run override yr.sc.volOverride = {run: "B", [ticker]: pct}, which the Compounding tab reads only while
  // B differs in vol. Every migration ends here (adoptLegacyVols); a view without these fields passes unchanged.
  const readLegacyVolScale = hvk => {
    const [lo, hi] = STATE_CONFIG.legacyVolScaleRange;
    const isNumber = typeof hvk === "number" && fin(hvk);
    return isNumber ? clamp(hvk, lo, hi) : 1;
  };
  // {rv, rvB} ({[ticker]: pct} each, possibly empty) when the Compounding state still carries them, else null
  function readLegacyCompoundingVol(yr) {
    const hasSc = isObj(yr) && isObj(yr.sc);
    if (!hasSc) { return null; }
    const hasLegacy = "rv" in yr.sc || "rvB" in yr.sc;
    if (!hasLegacy) { return null; }
    return { rv: isObj(yr.sc.rv) ? yr.sc.rv : {}, rvB: isObj(yr.sc.rvB) ? yr.sc.rvB : {} };
  }
  // one ticker's period vol from what the view kept instead: {pct, note}, or null when the listed vol stands
  /** @param {{ id: string, rv: any, k: number }} input */
  function pickLegacyVol({ id, rv, k }) {
    const [lo, hi] = PERIOD_VOL_CONFIG.range;
    const listed = readPeriodVol({ record: INST.base(id) }).pct, listedName = nameVolSource({ source: VolSource.Hv30 });
    const hasOwnMoves = fin(rv) && Math.abs(rv - Math.round(listed)) > 1e-9;
    if (hasOwnMoves) {
      const pct = roundPeriodVol(clamp(rv, lo, hi));
      return { pct, note: `${id} period vol set to ${Math.round(pct)}%: the loaded view's Compounding tab moved ${id} at ${Math.round(pct)}% (${listedName} ${Math.round(listed)}%)` };
    }
    const isScaled = Math.abs(k - 1) >= 1e-9;
    if (!isScaled) { return null; }
    const pct = roundPeriodVol(clamp(listed * k, lo, hi));
    return { pct, note: `${id} period vol set to ${Math.round(pct)}%: the loaded view scaled ${listedName} ${Math.round(listed)}% by ${k.toFixed(2)}` };
  }
  // the Compounding state without rv / rvB, B's differing moves as the run override (an override already there wins)
  function convertLegacyCompoundingVol({ yr, legacy }) {
    if (!legacy) { return yr; }
    const [lo, hi] = PERIOD_VOL_CONFIG.range;
    const sc = Object.assign({}, yr.sc);
    delete sc.rv;
    delete sc.rvB;
    const override = isObj(sc.volOverride) ? Object.assign({}, sc.volOverride) : { run: STATE_CONFIG.legacyOverrideRun };
    for (const id of INST.ids()) {
      const own = legacy.rvB[id];
      const isOwn = fin(own) && own !== legacy.rv[id] && !(id in override);
      if (isOwn) { override[id] = roundPeriodVol(clamp(own, lo, hi)); }
    }
    sc.volOverride = override;
    return Object.assign({}, yr, { sc });
  }
  /** @param {{ periodVol: any, hvk: any, yr: any }} input -> {periodVol, yr, events} */
  function migrateLegacyVols({ periodVol, hvk, yr }) {
    const kept = sanitizePeriodVol(periodVol);
    const legacy = readLegacyCompoundingVol(yr), k = readLegacyVolScale(hvk), events = [];
    for (const id of INST.ids()) {
      if (kept[id]) { continue; }
      const picked = pickLegacyVol({ id, rv: legacy ? legacy.rv[id] : undefined, k });
      if (!picked) { continue; }
      kept[id] = { pct: picked.pct, source: VolSource.Set };
      events.push(createNoteEvent(picked.note));
    }
    return { periodVol: kept, yr: convertLegacyCompoundingVol({ yr, legacy }), events };
  }
  // the last step of every migration: r = {state, events, tab, theme, yr, src, legacyHvk} -> the same without legacyHvk
  function adoptLegacyVols(r) {
    const vols = migrateLegacyVols({ periodVol: r.state.periodVol, hvk: r.legacyHvk, yr: r.yr });
    const state = Object.assign({}, r.state, { periodVol: sanitizePeriodVol(vols.periodVol) });
    return { state, events: (r.events || []).concat(vols.events), tab: r.tab, theme: r.theme, yr: vols.yr, src: r.src };
  }


  // ---------------------------------------------------------- migration from v8 / v5
  const V8 = Object.freeze({ A: Object.freeze({ exp: "20261120", st: "str", pd: 30, cd: 30, capd: 17, fill: "mid" }), bexp: "20261218", bk: Object.freeze({ pd: 20, cd: 20, capd: 10 }) });
  const ALONG = ["st", "tk", "exp", "k", "fill", "free"];
  function v8pos(p, d) {
    const ids = INST.ids(), r = Object.assign({}, d);
    if (!isObj(p)) return r;
    if (ids.includes(p.tk)) r.tk = p.tk;
    if (typeof p.exp === "string" && /^\d{8}$/.test(p.exp)) r.exp = p.exp;
    if (p.st === "str" || p.st === "cap") r.st = p.st;
    if (p.fill === "mid" || p.fill === "nat") r.fill = p.fill;
    for (const k of ["pd", "cd"]) if (p[k] !== null && p[k] !== "" && Number.isFinite(+p[k])) r[k] = clamp(+p[k], 3, 90);
    if (p.capd !== null && p.capd !== "" && Number.isFinite(+p.capd)) r.capd = clamp(+p.capd, 3, 40);
    return r;
  }
  function mapPos(p, together) {
    const pos = {
      inst: { id: p.tk }, exp: p.exp, structure: "strangle", legs: together && p.pd === p.cd ? "together" : "detached", basis: "delta",
      values: { center: "atm", put: p.pd, call: p.cd }, wings: { call: { on: p.st === "cap", value: p.capd }, put: { on: false, value: 15 } }, fill: p.fill
    };
    if (together && p.pd === 50 && p.cd === 50) pos.structure = "straddle";   // v8's "nearest the forward"
    return pos;
  }
  function fromV8(o, src) {
    o = isObj(o) ? o : {};
    const ids = INST.ids(), other = id => ids.find(x => x !== id) || id;
    const link = typeof o.link === "boolean" ? o.link : true;
    const linkB = src === ViewSource.V5 || typeof o.linkB !== "boolean" ? link : o.linkB;
    const pA = v8pos(o.A, Object.assign({ tk: ids[0] }, V8.A));
    {   // A's expiry must be one A's instrument lists (v8 used the union)
      const I = INST.base(pA.tk); if (!I.expiries.includes(pA.exp)) pA.exp = I.nearestExp(pA.exp);
    }
    const A = mapPos(pA, link);
    const along = ALONG.includes(o.along) ? o.along : "tk";
    const links = { inst: false, exp: true, structure: true, legs: true, placement: true, wingCall: true, wingPut: true, fill: true };
    let B = { inst: { id: other(pA.tk) } }, bTk = pA.tk;
    if (along !== "tk" && along !== "free") links.inst = true;      // v8 kept B on A's ticker in these modes
    switch (along) {
      case "tk": bTk = other(pA.tk); break;
      case "st": links.wingCall = false; B.wings = { call: { on: pA.st !== "cap", value: pA.capd } }; break;
      case "exp": {
        links.exp = false;
        const ex = INST.base(pA.tk).expiries;
        let e = typeof o.bexp === "string" && /^\d{8}$/.test(o.bexp) ? o.bexp : V8.bexp;
        if (!ex.includes(e)) e = INST.base(pA.tk).nearestExp(e);
        if (e === pA.exp) { const i = ex.indexOf(pA.exp); e = i + 1 < ex.length ? ex[i + 1] : i > 0 ? ex[i - 1] : ex[i]; }   // never wrap
        B.exp = e; break;
      }
      case "k": {
        links.placement = false; links.legs = false;
        const bk = v8pos(Object.assign({}, pA, isObj(o.bk) ? o.bk : V8.bk), pA);
        B.basis = "delta"; B.values = { center: "atm", put: bk.pd, call: bk.cd };
        B.legs = linkB && bk.pd === bk.cd ? "together" : "detached";
        const bStruct = linkB && bk.pd === 50 && bk.cd === 50 ? "straddle" : "strangle";
        if (bStruct !== A.structure) { links.structure = false; B.structure = bStruct; }
        if (pA.st === "cap" && bk.capd !== pA.capd) { links.wingCall = false; B.wings = { call: { on: true, value: bk.capd } }; }
        break;
      }
      case "fill": links.fill = false; B.fill = pA.fill === "mid" ? "nat" : "mid"; break;
      case "free": {
        const pf = isObj(o.Bf) ? v8pos(o.Bf, pA) : Object.assign({}, pA, { tk: other(pA.tk) });
        bTk = pf.tk;
        const bp = mapPos(pf, linkB);
        for (const a of CMP.ASPECTS) links[a] = false;
        B = { inst: bp.inst, exp: bp.exp, structure: bp.structure, legs: bp.legs, basis: bp.basis, values: bp.values, wings: bp.wings, fill: bp.fill };
        break;
      }
    }
    const cmp = { A, B, links, expMap: "nearest", sizing: { rule: CMP.SIZE_RULES.includes(o.size) ? o.size : "auto", h: Number.isFinite(+o.hc) && +o.hc > 0 ? +o.hc : 1 } };
    const scen = {}; for (const k of Object.keys(ASSUMPTIONS_DEF)) if (k in o) scen[k] = o[k];
    const view = {};
    for (const k of Object.keys(PREFS_DEF)) if (k in o && !STATE_CONFIG.prefsSanitizedApart.includes(k)) view[k] = o[k];
    const SW = { pd: "put", cd: "call", capd: "wingCall", both: "both" }; if ("sweep" in o) view.sweep = SW[o.sweep] || "both";
    const OV = { capc: "wingc", capp: "wingp" }; if (o.ovm in OV) view.ovm = OV[o.ovm];
    if (fin(+o.nm) && !ENUMS.nm.includes(+o.nm)) view.nm = ENUMS.nm.reduce((b, x) => Math.abs(x - o.nm) < Math.abs(b - o.nm) ? x : b, ENUMS.nm[0]);
    view.pins = Array.isArray(o.pins) ? o.pins.filter(p => isObj(p) && isObj(p.S)).map(p => ({ SA: +p.S[pA.tk], SB: +p.S[bTk], dA: +p.dA, dB: +p.dB })) : [];
    const state = sanitizeTree({ comparison: cmp, assumptions: scen, prefs: view, periodVol: {} });
    return { state, events: [{ type: "migrated", aspects: [], text: `Loaded a ${src} view: strikes re-resolved with v9 rules`, actions: [] }], legacyHvk: o.hvk };
  }
  // a parsed code (parse) or blob -> {state, events, tab, theme, yr, src}; v10 and v9 views carry no migration note
  // unless they carried a vol the period vol replaced (one note per ticker, see migrateLegacyVols)
  // a v10 document as written before part 2b may still carry the multiplier in its assumptions, and one written before
  // part 2c the Compounding tab's own vols
  function fromV10(content) {
    const o = isObj(content) ? content : {};
    return { state: sanitizeTree(o), events: [], legacyHvk: isObj(o.assumptions) ? o.assumptions.hvk : undefined };
  }
  function migrateParsed(h) {
    if (h.src === ViewSource.V10) return adoptLegacyVols(Object.assign(fromV10(h.content), { tab: h.tab, theme: h.theme, yr: h.yr, src: h.src }));
    if (h.src === ViewSource.V9) return adoptLegacyVols(Object.assign(fromV9({ s9: h.content, yr: h.yr }), { tab: h.tab, theme: h.theme, src: h.src }));
    const r = fromV8(h.content, h.src);
    return adoptLegacyVols(Object.assign(r, { tab: h.src === ViewSource.V8 ? h.tab : Tab.Compare, theme: h.theme, yr: h.src === ViewSource.V8 ? h.yr : undefined, src: h.src }));
  }
  // STATE.migrate(code | blob) -> {state, events, tab, theme, yr, src}; throws on a string that is not a view code
  function migrate(input) {
    if (typeof input === "string") {
      const h = parse(input);
      if (!h) { throw createCoreError({ code: ViewCodeError.NotACode, message: `not a view code: ${JSON.stringify(String(input).slice(0, 24))}` }); }
      return migrateParsed(h);
    }
    if (!isObj(input)) return { state: defaults(), events: [], tab: Tab.Compare, theme: Theme.Auto, yr: undefined, src: ViewSource.None };
    if (input.v === +ViewCodeVersion.V10) return migrateParsed({ src: ViewSource.V10, tab: input.tab, theme: readDocumentTheme(input), content: input, yr: input.yr });
    if (input.v === +ViewCodeVersion.V9) return migrateParsed({ src: ViewSource.V9, tab: input.tab, theme: input.theme, content: input.cmp, yr: input.yr });
    if (input.v === +ViewCodeVersion.V8) return adoptLegacyVols(Object.assign(fromV8(input.cmp, ViewSource.V8), { tab: input.tab, theme: input.theme, yr: input.yr, src: ViewSource.V8 }));
    return adoptLegacyVols(Object.assign(fromV8(input, ViewSource.V5), { tab: Tab.Compare, theme: input.theme, yr: undefined, src: ViewSource.V5 }));   // the rk-lab-v5 store holds the bare state

  }

  // ---------------------------------------------------------- reading views: view codes and the stored blob
  // The page's view arrives as a code (⋯ → Load, the address, boot) or as the stored blob (boot). Both answer with a
  // Result: {state (the sanitized tree, without the tab), tab, theme and yr as the view carries them, notices
  // (migration notes), faults}. theme is raw (a v10 view's prefs.theme): a load keeps the current theme when the code
  // has none, boot falls back to "auto". yr is undefined when the view cannot carry the Compounding tab (v5), null
  // when it carries none; a v9 view's yr comes without the export keys (they moved into prefs).
  // The code is split and decoded once; the versions it reads are ViewCodeVersion's (the list parse uses too).
  function readViewCode(text) {
    const split = splitCode(text), notACode = Result.err({ code: ViewCodeError.NotACode, message: `not a view code: ${JSON.stringify(split.text.slice(0, 24))}` });
    if (!split.version) { return notACode; }
    if (!CODE_VERSIONS.includes(split.version)) {
      return Result.err({ code: ViewCodeError.UnknownVersion, message: `view code version v${split.version} is not one of v${CODE_VERSIONS.join(", v")}` });
    }
    if (!split.isOneLine) { return notACode; }
    let migrated;
    try {
      migrated = migrateParsed(decodeCode(split));
    } catch (error) {
      // decodeCode's errors name the payload; a migration error gets the code's version in front
      const isDecodeError = !!error && error.code === ViewCodeError.Undecodable;
      return Result.err({ code: ViewCodeError.Undecodable, message: isDecodeError ? describeThrown(error) : `the v${split.version} view code did not migrate: ${describeThrown(error)}` });
    }
    const isV5 = migrated.src === ViewSource.V5;
    const carriedYr = migrated.yr == null ? null : migrated.yr;   // a code that can carry the Compounding tab: its yr or null
    return Result.ok({
      state: migrated.state, tab: !isV5 && TABS.includes(migrated.tab) ? migrated.tab : Tab.Compare, theme: migrated.theme,
      yr: isV5 ? undefined : carriedYr, notices: (migrated.events || []).map(convertEventToNotice), faults: []
    });
  }
  function readStoredView(stored) {
    let migrated;
    try { migrated = migrate(stored); } catch (error) {
      return Result.err({ code: ViewCodeError.Undecodable, message: `the stored view did not load: ${error && error.message ? error.message : error}`, cause: error });
    }
    return Result.ok({ state: migrated.state, tab: migrated.tab, theme: migrated.theme, yr: migrated.yr == null ? null : migrated.yr, notices: (migrated.events || []).map(convertEventToNotice), faults: [] });
  }

  // ---------------------------------------------------------- command handlers: ({state, command}) -> {state, notices, faults}
  // Pure. The store holds the tree plus the visible tab; STATE's functions rebuild the tree from its four parts, so
  // every outcome puts the tab back.
  /** @param {{ tree: any, tab: string }} input */
  const attachTab = ({ tree, tab }) => ({ comparison: tree.comparison, assumptions: tree.assumptions, prefs: tree.prefs, periodVol: tree.periodVol, tab });
  const createNoteEvent = text => ({ type: CmpEventType.Note, aspects: [], text, actions: [] });
  // a cmp / normaliser event as a toast: its actions become ApplyAction commands carrying the button label
  function convertEventToNotice(event) {
    const actions = (event.actions || []).map(a => ({ type: Command.ApplyAction, label: a.label, steps: a.steps, quiet: !!a.quiet, source: "notice" }));
    return { text: event.text, actions, style: NoticeStyle.Event };
  }
  const createPlainNotice = text => ({ text, actions: [], style: NoticeStyle.Plain });
  // a STATE function's {state: tree, events} as a handler outcome on the store's state (the views' PlaceLeg uses it too)
  /** @param {{ state: any, result: { state: any, events?: any[] }, leadEvents?: any[] }} input */
  function convertToOutcome({ state, result, leadEvents }) {
    const events = (leadEvents || []).concat(result.events || []);
    return { state: attachTab({ tree: result.state, tab: state.tab }), notices: events.map(convertEventToNotice), faults: [] };
  }
  // SetAssumption / SetPref / SetSizing edit only these keys (the move unit goes through SetMoveUnit, pins through
  // the pin commands, export sections through SetExportSection)
  const PATCH_KEYS = Object.freeze({
    assumptions: Object.freeze(Object.keys(ASSUMPTIONS_DEF).filter(k => k !== "unit")),
    prefs: Object.freeze(Object.keys(PREFS_DEF).filter(k => !STATE_CONFIG.prefsSanitizedApart.includes(k))),
    sizing: Object.freeze(["rule", "h"])
  });
  // a command whose fields cannot be applied: the state stays, one BadCommand fault says why
  /** @param {{ state: any, command: LabCommand, text: string, handling?: string }} rejection */
  function rejectCommand({ state, command, text, handling }) {
    const fault = createFault({ code: FaultCode.BadCommand, severity: FaultSeverity.Warning, handling: handling || FaultHandling.IgnoredCommand, where: `command ${command.type}`, text });
    return { state, notices: [], faults: [fault] };
  }
  const isNonEmptyObject = o => isObj(o) && Object.keys(o).length > 0;
  function rejectPatch({ state, command, allowed }) {
    const keys = isObj(command.patch) ? Object.keys(command.patch) : [];
    const fault = createFault({
      code: FaultCode.PatchRejected, severity: FaultSeverity.Warning, handling: FaultHandling.IgnoredPatch, where: `command ${command.type}`,
      text: `patch ${JSON.stringify(command.patch)} has key(s) outside ${allowed.join(", ")}: ${keys.filter(k => !allowed.includes(k)).join(", ") || "(empty patch)"}`
    });
    return { state, notices: [], faults: [fault] };
  }
  function createPatchHandler({ allowed, target }) {
    return ({ state, command }) => {
      const patch = command.patch, isAllowed = isNonEmptyObject(patch) && Object.keys(patch).every(k => allowed.includes(k));
      if (!isAllowed) { return rejectPatch({ state, command, allowed }); }
      return convertToOutcome({ state, result: change(state, s => { Object.assign(target(s), patch); }) });
    };
  }
  const createChangeHandler = fn => ({ state, command }) => convertToOutcome({ state, result: change(state, s => fn(s, command)) });
  function setMoveUnit({ state, command }) {
    const { unit, rlo, rhi, wlo, whi } = command, extra = [];
    const result = change(state, s => {
      const sc = s.assumptions;
      sc.unit = unit; sc.rlo = rlo; sc.rhi = rhi;
      if (sc.wl === WorstLossRange.Own) { sc.wlo = wlo; sc.whi = whi; }
      const turnsAsymmetric = sc.rlink && Math.abs(rlo - rhi) > 1e-9;
      if (turnsAsymmetric) {
        sc.rlink = false;
        extra.push(createNoteEvent(`Range converted to ${uLab(-rlo, unit)} to ${uLab(rhi, unit)}; symmetric is off because the converted range is not symmetric`));
      }
    });
    return convertToOutcome({ state, result, leadEvents: extra });
  }
  function showTab({ state, command }) {
    if (!TABS.includes(command.tab)) {
      return rejectCommand({ state, command, text: `no tab ${JSON.stringify(command.tab)} (tabs: ${TABS.join(", ")})`, handling: FaultHandling.KeptTab });
    }
    return { state: Object.assign({}, state, { tab: command.tab }), notices: [], faults: [] };
  }
  // command = {view: the tree readViewCode read, tab, theme (raw), notices}; the toast says "View loaded" first
  function loadView({ state, command }) {
    if (!isObj(command.view)) {
      return rejectCommand({ state, command, text: `LoadView needs a view (the state readViewCode read), got ${JSON.stringify(command.view)}`, handling: FaultHandling.KeptView });
    }
    const theme = THEMES.includes(command.theme) ? command.theme : state.prefs.theme;
    const tree = applyChange(command.view, s => { s.prefs.theme = theme; });
    const tab = TABS.includes(command.tab) ? command.tab : Tab.Compare;
    return { state: attachTab({ tree, tab }), notices: [convertEventToNotice(createNoteEvent("View loaded"))].concat(command.notices || []), faults: [] };
  }
  const RESET_TEXT = Object.freeze({
    [ResetTarget.Compare]: "Compare A vs B reset to defaults",
    [ResetTarget.Compounding]: "Compounding reset to defaults",
    [ResetTarget.Both]: "Both tabs reset to defaults"
  });
  // command = {resetTarget}. The Compounding tab resets itself (it is off the bus). Every reset keeps the visible tab
  // and the page-wide preferences (theme, export sections); the period vol, which both tabs read, resets only with
  // both tabs, and a one-tab reset that keeps a period vol says so
  function reset({ state, command }) {
    const baseText = RESET_TEXT[command.resetTarget];
    if (!baseText) {
      return rejectCommand({ state, command, text: `Reset needs a resetTarget of ${Object.values(ResetTarget).join(", ")}, got ${JSON.stringify(command.resetTarget)}` });
    }
    const resetsPeriodVol = command.resetTarget === ResetTarget.Both;
    const keepsPeriodVol = !resetsPeriodVol && isNonEmptyObject(state.periodVol);
    const text = keepsPeriodVol ? `${baseText}; ${STATE_CONFIG.periodVolKeptText}` : baseText;
    if (command.resetTarget === ResetTarget.Compounding) { return { state, notices: [createPlainNotice(text)], faults: [] }; }
    const tree = applyChange(defaults(), s => {
      s.prefs.theme = state.prefs.theme;
      s.prefs.exportSections = state.prefs.exportSections;
      if (!resetsPeriodVol) { s.periodVol = state.periodVol; }
    });
    return { state: attachTab({ tree, tab: state.tab }), notices: [createPlainNotice(text)], faults: [] };
  }
  // command = {pin: {SA, SB, dA, dB}}: the newest pinLimit pins are kept. A pin the sanitizer would drop is refused
  function addPin({ state, command }) {
    const isUsablePin = sanPins([command.pin]).length === 1;
    if (!isUsablePin) { return rejectCommand({ state, command, text: `AddPin needs a pin {SA > 0, SB > 0, dA, dB}, got ${JSON.stringify(command.pin)}` }); }
    return convertToOutcome({ state, result: change(state, s => { s.prefs.pins = (s.prefs.pins || []).concat([command.pin]).slice(-STATE_CONFIG.pinLimit); }) });
  }
  // command = {index}: the position of the pin in the list
  function removePin({ state, command }) {
    const pins = state.prefs.pins || [], index = command.index;
    const isListed = Number.isInteger(index) && index >= 0 && index < pins.length;
    if (!isListed) { return rejectCommand({ state, command, text: `RemovePin needs an index from 0 to ${pins.length - 1}, got ${JSON.stringify(index)}` }); }
    return convertToOutcome({ state, result: change(state, s => { s.prefs.pins.splice(index, 1); }) });
  }
  // command = {tab, section, isOn}: the tab's sections become a choice (every section of the tab, in document order)
  function setExportSection({ state, command }) {
    const tabDefaults = EXPORT_SECTION_DEFAULTS[command.tab];
    const isKnownSection = !!tabDefaults && Object.prototype.hasOwnProperty.call(tabDefaults, command.section);
    if (!isKnownSection) {
      const tabs = Object.keys(EXPORT_SECTION_DEFAULTS).join(", ");
      return rejectCommand({ state, command, text: `SetExportSection needs a tab (${tabs}) and one of its sections, got ${JSON.stringify(command.tab)} / ${JSON.stringify(command.section)}` });
    }
    if (typeof command.isOn !== "boolean") {
      return rejectCommand({ state, command, text: `SetExportSection needs isOn true or false, got ${JSON.stringify(command.isOn)}` });
    }
    const result = change(state, s => {
      const sections = Object.assign(readExportSections({ prefs: s.prefs, tab: command.tab }), { [command.section]: command.isOn });
      s.prefs.exportSections = Object.assign({}, s.prefs.exportSections, { [command.tab]: sections });
    });
    return convertToOutcome({ state, result });
  }
  // command = {ticker, source (VolSource), pct (%), expiry? (Atm), reader? (Tab, default Compare)}: one ticker's period
  // vol, for every expiry and both sides. Source Hv30 removes the entry (absent = the listed vol; pct is not needed).
  // The source is stored as given, never inferred from the value. A pct outside [floor, 300] is applied at the
  // nearest end with a warning fault and a toast; the floor is the reader's (the comparer 1%, Compounding 0)
  function setPeriodVol({ state, command }) {
    const refusal = findPeriodVolRefusal(command);
    if (refusal) { return rejectCommand({ state, command, text: refusal }); }
    const { ticker, source } = command;
    if (source === VolSource.Hv30) {
      return convertToOutcome({ state, result: change(state, s => { delete s.periodVol[ticker]; }) });
    }
    const placed = placePeriodVol({ pct: +command.pct, reader: command.reader || Tab.Compare });
    const entry = source === VolSource.Atm ? { pct: placed.pct, source, expiry: command.expiry } : { pct: placed.pct, source };
    const outcome = convertToOutcome({ state, result: change(state, s => { s.periodVol[ticker] = entry; }) });
    if (!placed.note) { return outcome; }
    const fault = createFault({ code: FaultCode.ValueClamped, severity: FaultSeverity.Warning, handling: FaultHandling.AppliedClamped, where: `command ${command.type}`, text: `${ticker}: ${placed.note}` });
    /** @type {LabNotice[]} */
    const notices = [...outcome.notices, createPlainNotice(`${ticker} ${placed.note}`)];
    return { state: outcome.state, notices, faults: [fault] };
  }
  // "" when the command can apply, else why not (for the BadCommand fault)
  function findPeriodVolRefusal(command) {
    if (!INST.has(command.ticker)) { return `SetPeriodVol needs a listed ticker (${INST.ids().join(", ")}), got ${JSON.stringify(command.ticker)}`; }
    if (!VOL_SOURCES.includes(command.source)) { return `SetPeriodVol needs a source of ${VOL_SOURCES.join(", ")}, got ${JSON.stringify(command.source)}`; }
    const needsPct = command.source !== VolSource.Hv30;
    const hasPct = typeof command.pct === "number" && fin(command.pct);
    if (needsPct && !hasPct) { return `SetPeriodVol (${command.source}) needs a finite pct in %, got ${JSON.stringify(command.pct)}`; }
    const lacksExpiry = command.source === VolSource.Atm && !isListedExpiry(command.expiry);
    if (lacksExpiry) { return `SetPeriodVol (${command.source}) needs the listed expiry the ATM was read at (YYYYMMDD), got ${JSON.stringify(command.expiry)}`; }
    const readers = Object.keys(PERIOD_VOL_CONFIG.floor);
    if (command.reader !== undefined && !readers.includes(command.reader)) { return `SetPeriodVol reader must be one of ${readers.join(", ")}, got ${JSON.stringify(command.reader)}`; }
    return "";
  }
  // the pct the state stores (rounded, inside [the reader's floor, the cap]) and what the toast says when it moved
  /** @param {{ pct: number, reader: string }} input */
  function placePeriodVol({ pct, reader }) {
    const floor = PERIOD_VOL_CONFIG.floor[reader], cap = PERIOD_VOL_CONFIG.range[1];
    if (pct < floor) { return { pct: floor, note: `period vol floored at ${floor}% (asked ${+pct.toFixed(2)}%)` }; }
    if (pct > cap) { return { pct: cap, note: `period vol capped at ${cap}% (asked ${+pct.toFixed(2)}%)` }; }
    return { pct: roundPeriodVol(pct), note: "" };
  }
  const HANDLERS = Object.freeze({
    [Command.SetA]: ({ state, command }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.SetA, command.path, command.value) }),
    [Command.SetB]: ({ state, command }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.SetB, command.path, command.value) }),
    [Command.Link]: ({ state, command }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.Link, command.aspect) }),
    [Command.Unlink]: ({ state, command }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.Unlink, command.aspect) }),
    [Command.Detach]: ({ state, command }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.Detach, command.side) }),
    [Command.Swap]: ({ state }) => convertToOutcome({ state, result: swap(state) }),
    [Command.RelinkAll]: ({ state }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.RelinkAll) }),
    // leadNote: a note the UI computed from the render context (an override the side drops), shown first
    [Command.SetFrom]: ({ state, command }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.SetFrom, command.side, command.spec), leadEvents: command.leadNote ? [createNoteEvent(command.leadNote)] : [] }),
    [Command.ApplyFix]: ({ state, command }) => convertToOutcome({ state, result: cmpOp(state, CmpOperation.ApplyFix, command.fix) }),
    [Command.ApplyAction]: ({ state, command }) => convertToOutcome({ state, result: applyAction(state, { steps: command.steps, quiet: command.quiet }) }),
    [Command.SetSizing]: createPatchHandler({ allowed: PATCH_KEYS.sizing, target: s => s.comparison.sizing }),
    [Command.SetExpiryMap]: createChangeHandler((s, command) => { s.comparison.expMap = command.expMap; }),
    [Command.SetAssumption]: createPatchHandler({ allowed: PATCH_KEYS.assumptions, target: s => s.assumptions }),
    [Command.SetMoveUnit]: setMoveUnit,
    [Command.SetPref]: createPatchHandler({ allowed: PATCH_KEYS.prefs, target: s => s.prefs }),
    [Command.AddPin]: addPin,
    [Command.RemovePin]: removePin,
    [Command.ClearPins]: createChangeHandler(s => { s.prefs.pins = []; }),
    [Command.SetExportSection]: setExportSection,
    [Command.SetPeriodVol]: setPeriodVol,
    [Command.ShowTab]: showTab,
    [Command.LoadView]: loadView,
    [Command.Reset]: reset
  });
  // PlaceLeg is registered by the views
  function registerCommandHandlers(registry) {
    for (const [type, handler] of Object.entries(HANDLERS)) { registry.register(type, handler); }
    return registry;
  }

  return Object.freeze({
    ASSUMPTIONS_DEF, PREFS_DEF, ENUMS, EXPORT_SECTION_DEFAULTS, CONFIG: STATE_CONFIG, UNAME, uStep, uRound, rangeCaps, uLab,
    defaults, sanitizeTree, sanitizeAssumptions, sanitizePrefs, sanitizePeriodVol, normalise, change, applyChange, cmpOp, applyAction, swap,
    pickExportSections, readExportSections, migrate, parse, writeViewCode, writeStoredView, enc, dec,
    readViewCode, readStoredView, convertEventToNotice, convertToOutcome, registerCommandHandlers, HANDLERS
  });
})();
