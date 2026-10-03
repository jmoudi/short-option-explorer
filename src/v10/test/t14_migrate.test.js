// T14: migration from v8 / v5 states, view codes and blobs
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js");
const L = load();
const { CMP, STATE, CTX } = L;
const J = x => JSON.parse(JSON.stringify(x));
const A8 = o => Object.assign({ tk: "RAM", exp: "20261120", st: "str", pd: 30, cd: 30, capd: 17, fill: "mid" }, o || {});
const v8 = o => Object.assign({ A: A8(), along: "tk", bexp: "20261218", bk: { pd: 20, cd: 20, capd: 10 }, Bf: null, link: true, linkB: true, unit: "sig", rlo: 2, rhi: 2, size: "auto", hc: 1, pins: [] }, o || {});
const mig = (o, src) => STATE.migrate(src === "v5" ? "#v5." + STATE.enc(o) : "#v8." + STATE.enc({ t: "compare", th: "dark", c: o, y: { k: 1 } }));
const unlinked = S9 => CMP.ASPECTS.filter(a => !S9.comparison.links[a]);

test("T14: along = tk: B is the other instrument, nothing else unlinked; the migrated event is emitted", () => {
  const r = mig(v8());
  assert.deepEqual(J(unlinked(r.state)), ["inst"]);
  assert.equal(CMP.resolveB(r.state.comparison).inst.id, "KORU");
  assert.equal(r.events[0].type, "migrated"); assert.equal(r.events[0].text, "Loaded a v8 view: strikes re-resolved with v9 rules");
  assert.equal(r.tab, "compare"); assert.equal(r.theme, "dark"); assert.deepEqual(J(r.yr), { k: 1 });
  assert.deepEqual(J(r.state.comparison.A.values), { center: "atm", put: 30, call: 30 }); assert.equal(r.state.comparison.A.legs, "together");
});

test("T14: along = st / exp / k / fill: exactly the aspects v8 varied are unlinked, on A's instrument", () => {
  let r = mig(v8({ along: "st" }));
  assert.deepEqual(J(unlinked(r.state)), ["wingCall"]);
  const rb = CMP.resolveB(r.state.comparison); assert.equal(rb.inst.id, "RAM"); assert.deepEqual(J([rb.wings.call.on, rb.wings.call.value]), [true, 17]);
  r = mig(v8({ along: "st", A: A8({ st: "cap", capd: 12 }) }));
  assert.equal(r.state.comparison.A.wings.call.on, true); assert.equal(CMP.resolveB(r.state.comparison).wings.call.on, false);
  r = mig(v8({ along: "exp" }));
  assert.deepEqual(J(unlinked(r.state)), ["exp"]); assert.equal(CMP.resolveB(r.state.comparison).exp, "20261218"); assert.equal(CMP.resolveB(r.state.comparison).inst.id, "RAM");
  r = mig(v8({ along: "k", A: A8({ st: "cap", capd: 17 }), bk: { pd: 20, cd: 25, capd: 10 } }));
  assert.deepEqual(J(unlinked(r.state)), ["legs", "placement", "wingCall"]);
  const kb = CMP.resolveB(r.state.comparison);
  assert.deepEqual(J([kb.values.put, kb.values.call, kb.legs, kb.wings.call.on, kb.wings.call.value]), [20, 25, "detached", true, 10]);
  r = mig(v8({ along: "k", bk: { pd: 20, cd: 20, capd: 17 } }));
  assert.deepEqual(J(unlinked(r.state)), ["legs", "placement"]); assert.equal(CMP.resolveB(r.state.comparison).legs, "together");
  r = mig(v8({ along: "fill", A: A8({ fill: "nat" }) }));
  assert.deepEqual(J(unlinked(r.state)), ["fill"]); assert.equal(CMP.resolveB(r.state.comparison).fill, "mid");
});

test("T14: along = exp never wraps: bexp = A.exp takes the next longer, the longest takes the next shorter (finding 34)", () => {
  assert.equal(CMP.resolveB(mig(v8({ along: "exp", bexp: "20261120" })).state.comparison).exp, "20261218");
  assert.equal(CMP.resolveB(mig(v8({ along: "exp", A: A8({ exp: "20270319" }), bexp: "20270319" })).state.comparison).exp, "20261218");
  assert.equal(CMP.resolveB(mig(v8({ along: "exp", A: A8({ exp: "20270319" }), bexp: "20261016" })).state.comparison).exp, "20261016");
});

test("T14: along = free: every aspect unlinked from Bf", () => {
  const Bf = { tk: "KORU", exp: "20270319", st: "cap", pd: 62.5, cd: 61.5, capd: 12.5, fill: "nat" };
  const r = mig(v8({ along: "free", Bf, linkB: false }));
  assert.deepEqual(J(unlinked(r.state)), J(CMP.ASPECTS));
  const b = CMP.resolveB(r.state.comparison);
  assert.deepEqual(J([b.inst.id, b.exp, b.structure, b.legs, b.values.put, b.values.call, b.wings.call.on, b.wings.call.value, b.fill]), ["KORU", "20270319", "strangle", "detached", 62.5, 61.5, true, 12.5, "nat"]);
  assert.ok(!CTX.ctx9(r.state).B.na);
});

test("T14: the finding-35 v5 code loads with B's legs detached (linkB := link)", () => {
  const code = "#v5." + STATE.enc({ A: { tk: "RAM", exp: "20261120", st: "str", pd: 25, cd: 35, capd: 12, fill: "mid" }, along: "k", bk: { pd: 15, cd: 45, capd: 10 }, link: false });
  const r = STATE.migrate(code);
  assert.equal(r.src, "v5"); assert.equal(r.state.comparison.A.legs, "detached");
  const b = CMP.resolveB(r.state.comparison);
  assert.equal(b.legs, "detached"); assert.deepEqual(J([b.values.put, b.values.call]), [15, 45]);
  // nudging B's put changes only B's put
  const n = STATE.cmpOp(r.state, "setB", "values.put", 16);
  assert.deepEqual(J([CMP.resolveB(n.state.comparison).values.put, CMP.resolveB(n.state.comparison).values.call]), [16, 45]);
});

test("T14: v8 50/50 with linked legs becomes a straddle at 'atm'; pins map per slot; nm 12 → 13; sweep/ovm map", () => {
  let r = mig(v8({ A: A8({ pd: 50, cd: 50 }) }));
  assert.equal(r.state.comparison.A.structure, "straddle"); assert.equal(r.state.comparison.A.values.center, "atm");
  assert.equal(CTX.ctx9(r.state).A.kind, "straddle");
  r = mig(v8({ A: A8({ pd: 50, cd: 50 }), link: false }));
  assert.equal(r.state.comparison.A.structure, "strangle");
  r = mig(v8({ pins: [{ S: { RAM: 14, KORU: 22 }, dA: 40, dB: 120 }] }));
  assert.deepEqual(J(r.state.prefs.pins), [{ SA: 14, SB: 22, dA: 40, dB: 120 }]);
  r = mig(v8({ along: "exp", pins: [{ S: { RAM: 14, KORU: 22 }, dA: 40, dB: 120 }] }));
  assert.deepEqual(J(r.state.prefs.pins), [{ SA: 14, SB: 14, dA: 40, dB: 120 }]);
  r = mig(Object.assign(v8({ nm: 12, sweep: "capd", ovm: "capp" }), { linkB: undefined }), "v5");
  assert.equal(r.state.prefs.nm, 13); assert.equal(r.state.prefs.sweep, "wingCall"); assert.equal(r.state.prefs.ovm, "wingp");
  r = mig(v8({ size: "custom", hc: 2, unit: "pct", rlo: 50, rhi: 100, dist: "hv", gview: "num", dock: false }));
  assert.deepEqual(J(r.state.comparison.sizing), { rule: "custom", h: 2 });
  assert.deepEqual(J([r.state.assumptions.unit, r.state.assumptions.rlo, r.state.assumptions.rhi, r.state.assumptions.dist, r.state.prefs.gview, r.state.prefs.dock]), ["pct", 50, 100, "hv", "num", false]);
  // finding 38: a migrated custom h and pins swap and swap back
  const p = STATE.applyChange(r.state, s => { s.prefs.pins = [{ SA: 14, SB: 22, dA: 40, dB: 120 }]; });
  const s1 = STATE.swap(p), s2 = STATE.swap(s1.state);
  assert.equal(s1.state.comparison.sizing.h, 0.5); assert.deepEqual(J(s1.state.prefs.pins), [{ SA: 22, SB: 14, dA: 120, dB: 40 }]);
  assert.deepEqual(J(s2.state.comparison.sizing), { rule: "custom", h: 2 });
});

// v9's comparer state S9 = {cmp, scen, view} from a v10 tree (prefs without the export sections), and v9's code and
// blob around it: the inputs a v9 page wrote
const toS9 = tree => { const view = Object.assign({}, tree.prefs); delete view.exportSections; return { cmp: tree.comparison, scen: tree.assumptions, view }; };
const writeV9Code = ({ tree, tab, theme, yr }) => "v9." + STATE.enc({ t: tab, th: theme, c: toS9(tree), y: yr });
const writeV9Blob = ({ tree, tab, theme, yr }) => ({ v: 9, tab, theme, cmp: toS9(tree), yr });
const busyTree = () => {
  let tree = STATE.defaults();
  tree = STATE.cmpOp(tree, "setB", "basis", "sigma").state;
  tree = STATE.cmpOp(tree, "setA", "wings.put", { on: true, value: 9 }).state;
  tree = STATE.cmpOp(tree, "setB", "inst.ivShift", 7.5).state;
  return STATE.applyChange(tree, s => { s.assumptions.dist = "hv"; s.prefs.units = "usd"; s.prefs.pins = [{ SA: 14, SB: 22, dA: 40, dB: 120 }]; s.prefs.theme = "light"; });
};

test("T14: the tree has four parts; a v10 code and blob round-trip with the tab, the theme and the Compounding state", () => {
  const tree = busyTree();
  assert.deepEqual(Object.keys(tree), ["comparison", "assumptions", "prefs", "periodVol"]);
  assert.deepEqual(J(tree.periodVol), {}); assert.deepEqual(J(tree.prefs.exportSections), {});
  const state = Object.assign({}, tree, { tab: "yr" });
  const code = STATE.writeViewCode({ state, yr: { a: 1 } });
  assert.ok(code.startsWith("v10."));
  const r = STATE.migrate("https://x.example/lab.html#" + code);
  assert.equal(JSON.stringify(r.state), JSON.stringify(tree)); assert.deepEqual(J(r.events), []);
  assert.deepEqual(J([r.tab, r.theme, r.yr, r.src]), ["yr", "light", { a: 1 }, "v10"]);
  const blob = J(STATE.writeStoredView({ state, yr: null }));
  assert.deepEqual(Object.keys(blob), ["v", "tab", "comparison", "assumptions", "prefs", "periodVol", "yr"]); assert.equal(blob.v, 10);
  const b = STATE.migrate(blob);
  assert.equal(JSON.stringify(b.state), JSON.stringify(tree)); assert.deepEqual(J([b.tab, b.theme, b.yr, b.src]), ["yr", "light", null, "v10"]);
  // the code is the blob's document without v, base64url JSON
  const document = STATE.dec(code.slice(4));
  assert.deepEqual(Object.keys(document), ["tab", "comparison", "assumptions", "prefs", "periodVol", "yr"]); assert.deepEqual(document.yr, { a: 1 });
  assert.equal(JSON.stringify(document.prefs), JSON.stringify(blob.prefs));
});

test("T14: a v9 code and a v9 blob load into the v10 tree with identical content and no note", () => {
  const tree = busyTree();
  for (const read of [
    () => STATE.migrate(writeV9Code({ tree, tab: "compare", theme: "light", yr: { k: 1, view: { v: "year" } } })),
    () => STATE.migrate(J(writeV9Blob({ tree, tab: "compare", theme: "light", yr: { k: 1, view: { v: "year" } } })))
  ]) {
    const r = read();
    assert.equal(r.src, "v9");
    assert.equal(JSON.stringify(r.state), JSON.stringify(tree));
    assert.deepEqual(J(r.events), []);
    assert.deepEqual(J([r.tab, r.theme, r.yr]), ["compare", "light", { k: 1, view: { v: "year" } }]);
  }
  // readViewCode / readStoredView: the same tree, no notices
  const viaCode = STATE.readViewCode("#" + writeV9Code({ tree, tab: "yr", theme: "dark", yr: null }));
  assert.equal(viaCode.ok, true); assert.equal(JSON.stringify(viaCode.value.state), JSON.stringify(tree));
  assert.deepEqual(J([viaCode.value.tab, viaCode.value.theme, viaCode.value.yr, viaCode.value.notices]), ["yr", "dark", null, []]);
  const viaBlob = STATE.readStoredView(J(writeV9Blob({ tree, tab: "compare", theme: "auto", yr: { k: 2 } })));
  assert.equal(viaBlob.ok, true); assert.equal(JSON.stringify(viaBlob.value.state), JSON.stringify(tree)); assert.deepEqual(J(viaBlob.value.yr), { k: 2 });
});

test("T14: v9's export section choice moves from the Compounding state into prefs.exportSections (order kept)", () => {
  const tree = STATE.defaults();
  const yr = { k: 1, view: { v: "year", exportYr: { runs: false, weeks: true }, dockOff: false, exportCmp: { header: true, overview: true, pins: false, bogus: true } } };
  const r = STATE.migrate(J(writeV9Blob({ tree, tab: "compare", theme: "auto", yr })));
  assert.deepEqual(Object.keys(r.state.prefs.exportSections), ["yr", "compare"], "the order of the first choice");
  assert.deepEqual(J(r.state.prefs.exportSections.compare), { header: true, comparison: true, assumptions: true, results: true, recovery: true, lens: true, capture: true, pins: false, overview: true, notes: true });
  assert.deepEqual(J(r.state.prefs.exportSections.yr), { runs: false, base: true, strip: true, kept: true, weeks: true, stress: true, random: true });
  assert.deepEqual(J(r.yr), { k: 1, view: { v: "year", dockOff: false } }, "the Compounding state loses the export keys");
  assert.deepEqual(J(yr.view.exportCmp), { header: true, overview: true, pins: false, bogus: true }, "the input is untouched");
  // the readers see every section of the tab, defaults where nothing was chosen
  assert.deepEqual(J(STATE.readExportSections({ prefs: STATE.defaults().prefs, tab: "compare" })), J(STATE.EXPORT_SECTION_DEFAULTS.compare));
  assert.deepEqual(J(STATE.readExportSections({ prefs: r.state.prefs, tab: "yr" })), J(r.state.prefs.exportSections.yr));
  // a v10 view keeps the choice in prefs; the Compounding state never carries it
  const code = STATE.writeViewCode({ state: Object.assign({}, r.state, { tab: "compare" }), yr: r.yr });
  const back = STATE.migrate(code);
  assert.equal(JSON.stringify(back.state.prefs.exportSections), JSON.stringify(r.state.prefs.exportSections)); assert.deepEqual(J(back.yr), J(r.yr));
});

test("T14: v8 / v5 blobs migrate; a bad code throws; garbage sanitizes to defaults", () => {
  const b8 = STATE.migrate({ v: 8, tab: "compare", theme: "dark", cmp: v8({ along: "fill" }), yr: { z: 2 } });
  assert.equal(b8.src, "v8"); assert.deepEqual(J(unlinked(b8.state)), ["fill"]); assert.deepEqual(J(b8.yr), { z: 2 });
  assert.deepEqual(Object.keys(b8.state), ["comparison", "assumptions", "prefs", "periodVol"]);
  const b5 = STATE.migrate(Object.assign(v8({ along: "k", bk: { pd: 15, cd: 25, capd: 10 }, link: true }), { linkB: undefined, theme: "dark" }));
  assert.equal(b5.src, "v5"); assert.equal(b5.theme, "dark"); assert.equal(CMP.resolveB(b5.state.comparison).legs, "detached");
  assert.throws(() => STATE.migrate("#v8.@@@"));
  assert.throws(() => STATE.migrate("#nothing"));
  assert.equal(STATE.parse("#abc"), null);
  // garbage inside a valid envelope sanitizes to defaults, in v9 and in v10 codes
  const g = STATE.migrate("#v9." + STATE.enc({ c: { cmp: { A: { inst: { id: "XYZ" }, exp: "bad", values: { put: "x" } } }, scen: { unit: "zz", rlo: -5 }, view: { nm: 11, pins: [{ SA: "a" }] } } }));
  assert.equal(g.state.comparison.A.inst.id, "RAM"); assert.equal(g.state.assumptions.unit, "sig"); assert.equal(g.state.prefs.nm, 13); assert.deepEqual(J(g.state.prefs.pins), []);
  const g10 = STATE.migrate("#v10." + STATE.enc({ tab: "nope", comparison: 5, assumptions: { unit: "zz" }, prefs: { nm: 11, exportSections: { compare: "all", other: {} } }, periodVol: { XYZ: { pct: 50 }, KORU: { pct: 999, source: "set" }, RAM: { pct: "x" } } }));
  assert.equal(g10.src, "v10"); assert.equal(g10.state.comparison.A.inst.id, "RAM"); assert.equal(g10.state.assumptions.unit, "sig"); assert.equal(g10.state.prefs.nm, 13);
  assert.deepEqual(J(g10.state.prefs.exportSections), {}); assert.deepEqual(J(g10.state.periodVol), { KORU: { pct: 300, source: "set" } });
  const r10 = STATE.readViewCode("#v10." + STATE.enc({ tab: "nope" }));
  assert.equal(r10.ok, true); assert.equal(r10.value.tab, "compare"); assert.equal(JSON.stringify(r10.value.state), JSON.stringify(STATE.defaults()));
});

test("T14: audit repro states load and resolve as described", () => {
  // finding 1/31/42: RAM 16 Oct 48/48 → v9 names the resolved structure (strangle after widening, A amber-free label)
  let r = mig(v8({ A: A8({ exp: "20261016", pd: 48, cd: 48 }) }));
  let C = CTX.ctx9(r.state);
  assert.equal(C.A.label.kindWord, C.A.kind); assert.match(C.A.label.full, /^RAM 16 Oct · short (strangle|straddle) /);
  // finding 50: 50/50 → "ATM" never appears in a label; v8 along=k with bk 20/20 keeps B's own strikes
  r = mig(v8({ A: A8({ pd: 50, cd: 50 }), along: "k", bk: { pd: 20, cd: 20, capd: 10 } }));
  C = CTX.ctx9(r.state);
  assert.ok(!/ATM/.test(C.labels.title)); assert.equal(C.A.kind, "straddle"); assert.equal(C.B.kind, "strangle");
  assert.deepEqual(J(unlinked(r.state)), ["structure", "legs", "placement"]);
  // finding 36: switching to strikes mode in v8 started B from stale targets; v9 migration takes bk as B's own values
  r = mig(v8({ A: A8({ pd: 40, cd: 40 }), along: "k", bk: { pd: 20, cd: 20, capd: 10 } }));
  assert.deepEqual(J([CMP.resolveB(r.state.comparison).values.put, r.state.comparison.A.values.put]), [20, 40]);
  // finding 30: a hand-built B survives relinking and unlinking (stash)
  let S9 = mig(v8({ along: "free", Bf: { tk: "KORU", exp: "20261120", st: "cap", pd: 15, cd: 15, capd: 17, fill: "mid" } })).state;
  const own = JSON.stringify(CMP.resolveB(S9.comparison).values);
  S9 = STATE.cmpOp(S9, "relinkAll").state;
  S9 = STATE.cmpOp(S9, "unlink", "placement").state;
  assert.equal(JSON.stringify(CMP.resolveB(S9.comparison).values), own);
});
