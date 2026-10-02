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
const unlinked = S9 => CMP.ASPECTS.filter(a => !S9.cmp.links[a]);

test("T14: along = tk: B is the other instrument, nothing else unlinked; the migrated event is emitted", () => {
  const r = mig(v8());
  assert.deepEqual(J(unlinked(r.S9)), ["inst"]);
  assert.equal(CMP.resolveB(r.S9.cmp).inst.id, "KORU");
  assert.equal(r.events[0].type, "migrated"); assert.equal(r.events[0].text, "Loaded a v8 view: strikes re-resolved with v9 rules");
  assert.equal(r.tab, "compare"); assert.equal(r.theme, "dark"); assert.deepEqual(J(r.yr), { k: 1 });
  assert.deepEqual(J(r.S9.cmp.A.values), { center: "atm", put: 30, call: 30 }); assert.equal(r.S9.cmp.A.legs, "together");
});

test("T14: along = st / exp / k / fill: exactly the aspects v8 varied are unlinked, on A's instrument", () => {
  let r = mig(v8({ along: "st" }));
  assert.deepEqual(J(unlinked(r.S9)), ["wingCall"]);
  const rb = CMP.resolveB(r.S9.cmp); assert.equal(rb.inst.id, "RAM"); assert.deepEqual(J([rb.wings.call.on, rb.wings.call.value]), [true, 17]);
  r = mig(v8({ along: "st", A: A8({ st: "cap", capd: 12 }) }));
  assert.equal(r.S9.cmp.A.wings.call.on, true); assert.equal(CMP.resolveB(r.S9.cmp).wings.call.on, false);
  r = mig(v8({ along: "exp" }));
  assert.deepEqual(J(unlinked(r.S9)), ["exp"]); assert.equal(CMP.resolveB(r.S9.cmp).exp, "20261218"); assert.equal(CMP.resolveB(r.S9.cmp).inst.id, "RAM");
  r = mig(v8({ along: "k", A: A8({ st: "cap", capd: 17 }), bk: { pd: 20, cd: 25, capd: 10 } }));
  assert.deepEqual(J(unlinked(r.S9)), ["legs", "placement", "wingCall"]);
  const kb = CMP.resolveB(r.S9.cmp);
  assert.deepEqual(J([kb.values.put, kb.values.call, kb.legs, kb.wings.call.on, kb.wings.call.value]), [20, 25, "detached", true, 10]);
  r = mig(v8({ along: "k", bk: { pd: 20, cd: 20, capd: 17 } }));
  assert.deepEqual(J(unlinked(r.S9)), ["legs", "placement"]); assert.equal(CMP.resolveB(r.S9.cmp).legs, "together");
  r = mig(v8({ along: "fill", A: A8({ fill: "nat" }) }));
  assert.deepEqual(J(unlinked(r.S9)), ["fill"]); assert.equal(CMP.resolveB(r.S9.cmp).fill, "mid");
});

test("T14: along = exp never wraps: bexp = A.exp takes the next longer, the longest takes the next shorter (finding 34)", () => {
  assert.equal(CMP.resolveB(mig(v8({ along: "exp", bexp: "20261120" })).S9.cmp).exp, "20261218");
  assert.equal(CMP.resolveB(mig(v8({ along: "exp", A: A8({ exp: "20270319" }), bexp: "20270319" })).S9.cmp).exp, "20261218");
  assert.equal(CMP.resolveB(mig(v8({ along: "exp", A: A8({ exp: "20270319" }), bexp: "20261016" })).S9.cmp).exp, "20261016");
});

test("T14: along = free: every aspect unlinked from Bf", () => {
  const Bf = { tk: "KORU", exp: "20270319", st: "cap", pd: 62.5, cd: 61.5, capd: 12.5, fill: "nat" };
  const r = mig(v8({ along: "free", Bf, linkB: false }));
  assert.deepEqual(J(unlinked(r.S9)), J(CMP.ASPECTS));
  const b = CMP.resolveB(r.S9.cmp);
  assert.deepEqual(J([b.inst.id, b.exp, b.structure, b.legs, b.values.put, b.values.call, b.wings.call.on, b.wings.call.value, b.fill]), ["KORU", "20270319", "strangle", "detached", 62.5, 61.5, true, 12.5, "nat"]);
  assert.ok(!CTX.ctx9(r.S9).B.na);
});

test("T14: the finding-35 v5 code loads with B's legs detached (linkB := link)", () => {
  const code = "#v5." + STATE.enc({ A: { tk: "RAM", exp: "20261120", st: "str", pd: 25, cd: 35, capd: 12, fill: "mid" }, along: "k", bk: { pd: 15, cd: 45, capd: 10 }, link: false });
  const r = STATE.migrate(code);
  assert.equal(r.src, "v5"); assert.equal(r.S9.cmp.A.legs, "detached");
  const b = CMP.resolveB(r.S9.cmp);
  assert.equal(b.legs, "detached"); assert.deepEqual(J([b.values.put, b.values.call]), [15, 45]);
  // nudging B's put changes only B's put
  const n = STATE.cmpOp(r.S9, "setB", "values.put", 16);
  assert.deepEqual(J([CMP.resolveB(n.S9.cmp).values.put, CMP.resolveB(n.S9.cmp).values.call]), [16, 45]);
});

test("T14: v8 50/50 with linked legs becomes a straddle at 'atm'; pins map per slot; nm 12 → 13; sweep/ovm map", () => {
  let r = mig(v8({ A: A8({ pd: 50, cd: 50 }) }));
  assert.equal(r.S9.cmp.A.structure, "straddle"); assert.equal(r.S9.cmp.A.values.center, "atm");
  assert.equal(CTX.ctx9(r.S9).A.kind, "straddle");
  r = mig(v8({ A: A8({ pd: 50, cd: 50 }), link: false }));
  assert.equal(r.S9.cmp.A.structure, "strangle");
  r = mig(v8({ pins: [{ S: { RAM: 14, KORU: 22 }, dA: 40, dB: 120 }] }));
  assert.deepEqual(J(r.S9.view.pins), [{ SA: 14, SB: 22, dA: 40, dB: 120 }]);
  r = mig(v8({ along: "exp", pins: [{ S: { RAM: 14, KORU: 22 }, dA: 40, dB: 120 }] }));
  assert.deepEqual(J(r.S9.view.pins), [{ SA: 14, SB: 14, dA: 40, dB: 120 }]);
  r = mig(Object.assign(v8({ nm: 12, sweep: "capd", ovm: "capp" }), { linkB: undefined }), "v5");
  assert.equal(r.S9.view.nm, 13); assert.equal(r.S9.view.sweep, "wingCall"); assert.equal(r.S9.view.ovm, "wingp");
  r = mig(v8({ size: "custom", hc: 2, unit: "pct", rlo: 50, rhi: 100, dist: "hv", gview: "num", dock: false }));
  assert.deepEqual(J(r.S9.cmp.sizing), { rule: "custom", h: 2 });
  assert.deepEqual(J([r.S9.scen.unit, r.S9.scen.rlo, r.S9.scen.rhi, r.S9.scen.dist, r.S9.view.gview, r.S9.view.dock]), ["pct", 50, 100, "hv", "num", false]);
  // finding 38: a migrated custom h and pins swap and swap back
  const p = STATE.applyChange(r.S9, s => { s.view.pins = [{ SA: 14, SB: 22, dA: 40, dB: 120 }]; });
  const s1 = STATE.swap(p), s2 = STATE.swap(s1.S9);
  assert.equal(s1.S9.cmp.sizing.h, 0.5); assert.deepEqual(J(s1.S9.view.pins), [{ SA: 22, SB: 14, dA: 120, dB: 40 }]);
  assert.deepEqual(J(s2.S9.cmp.sizing), { rule: "custom", h: 2 });
});

test("T14: a v9 code and a v9 blob round-trip; v8 / v5 blobs migrate; a bad code throws", () => {
  let S9 = STATE.defaults();
  S9 = STATE.cmpOp(S9, "setB", "basis", "sigma").S9;
  S9 = STATE.cmpOp(S9, "setA", "wings.put", { on: true, value: 9 }).S9;
  S9 = STATE.cmpOp(S9, "setB", "inst.ivShift", 7.5).S9;
  const code = STATE.code(S9, { tab: "yr", theme: "light", yr: { a: 1 } });
  assert.ok(code.startsWith("v9."));
  const r = STATE.migrate("https://x.example/lab.html#" + code);
  assert.equal(JSON.stringify(r.S9), JSON.stringify(S9)); assert.deepEqual(J(r.events), []);
  assert.deepEqual(J([r.tab, r.theme, r.yr, r.src]), ["yr", "light", { a: 1 }, "v9"]);
  const b = STATE.migrate(J(STATE.blob(S9, { tab: "compare", theme: "auto" })));
  assert.equal(JSON.stringify(b.S9), JSON.stringify(S9));
  const b8 = STATE.migrate({ v: 8, tab: "compare", theme: "dark", cmp: v8({ along: "fill" }), yr: { z: 2 } });
  assert.equal(b8.src, "v8"); assert.deepEqual(J(unlinked(b8.S9)), ["fill"]); assert.deepEqual(J(b8.yr), { z: 2 });
  const b5 = STATE.migrate(Object.assign(v8({ along: "k", bk: { pd: 15, cd: 25, capd: 10 }, link: true }), { linkB: undefined, theme: "dark" }));
  assert.equal(b5.src, "v5"); assert.equal(b5.theme, "dark"); assert.equal(CMP.resolveB(b5.S9.cmp).legs, "detached");
  assert.throws(() => STATE.migrate("#v8.@@@"));
  assert.throws(() => STATE.migrate("#nothing"));
  assert.equal(STATE.parse("#abc"), null);
  // garbage inside a valid envelope sanitizes to defaults
  const g = STATE.migrate("#v9." + STATE.enc({ c: { cmp: { A: { inst: { id: "XYZ" }, exp: "bad", values: { put: "x" } } }, scen: { unit: "zz", rlo: -5 }, view: { nm: 11, pins: [{ SA: "a" }] } } }));
  assert.equal(g.S9.cmp.A.inst.id, "RAM"); assert.equal(g.S9.scen.unit, "sig"); assert.equal(g.S9.view.nm, 13); assert.deepEqual(J(g.S9.view.pins), []);
});

test("T14: audit repro states load and resolve as described", () => {
  // finding 1/31/42: RAM 16 Oct 48/48 → v9 names the resolved structure (strangle after widening, A amber-free label)
  let r = mig(v8({ A: A8({ exp: "20261016", pd: 48, cd: 48 }) }));
  let C = CTX.ctx9(r.S9);
  assert.equal(C.A.label.kindWord, C.A.kind); assert.match(C.A.label.full, /^RAM 16 Oct · short (strangle|straddle) /);
  // finding 50: 50/50 → "ATM" never appears in a label; v8 along=k with bk 20/20 keeps B's own strikes
  r = mig(v8({ A: A8({ pd: 50, cd: 50 }), along: "k", bk: { pd: 20, cd: 20, capd: 10 } }));
  C = CTX.ctx9(r.S9);
  assert.ok(!/ATM/.test(C.labels.title)); assert.equal(C.A.kind, "straddle"); assert.equal(C.B.kind, "strangle");
  assert.deepEqual(J(unlinked(r.S9)), ["structure", "legs", "placement"]);
  // finding 36: switching to strikes mode in v8 started B from stale targets; v9 migration takes bk as B's own values
  r = mig(v8({ A: A8({ pd: 40, cd: 40 }), along: "k", bk: { pd: 20, cd: 20, capd: 10 } }));
  assert.deepEqual(J([CMP.resolveB(r.S9.cmp).values.put, r.S9.cmp.A.values.put]), [20, 40]);
  // finding 30: a hand-built B survives relinking and unlinking (stash)
  let S9 = mig(v8({ along: "free", Bf: { tk: "KORU", exp: "20261120", st: "cap", pd: 15, cd: 15, capd: 17, fill: "mid" } })).S9;
  const own = JSON.stringify(CMP.resolveB(S9.cmp).values);
  S9 = STATE.cmpOp(S9, "relinkAll").S9;
  S9 = STATE.cmpOp(S9, "unlink", "placement").S9;
  assert.equal(JSON.stringify(CMP.resolveB(S9.cmp).values), own);
});
