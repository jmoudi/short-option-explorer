// T1 (frozen D, strict mode), T2 (frozen S9, ctx9 without writes) and the build-time source rules of §3.1
"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), path = require("path"), vm = require("vm");
const { load, deepFreeze, V9 } = require("./load.js");
const L = load();
const { INST, RULE, POS, DIST, CMP, STATE, CTX, D, Odds, readPeriodVol } = L;

test("T1: D is deep-frozen before the model loads, and a write to it throws in the bundle's strict mode", () => {
  assert.ok(Object.isFrozen(D) && Object.isFrozen(D.u) && Object.isFrozen(D.u.RAM.exps["20261120"].q[0]));
  assert.throws(() => vm.runInContext('"use strict"; D.u.RAM.exps["20261120"]._w = 1;', L.ctx));
  assert.throws(() => vm.runInContext('"use strict"; D.u.RAM.S = 25;', L.ctx));
});

test("T1: every model entry point runs on the frozen data (all instruments, expiries, bases, structures, wings, fills)", () => {
  let n = 0;
  for (const { id } of INST.list()) {
    const I = INST.base(id);
    for (const e of I.expiries) {
      const E = I.exp(e);
      assert.ok(Object.isFrozen(E) && Object.isFrozen(E.rows));
      for (const basis of RULE.BASES) for (const structure of ["straddle", "strangle"]) for (const fill of ["mid", "nat"]) {
        const v = basis === "delta" ? 25 : basis === "money" ? 12 : 0.4, w = basis === "delta" ? 10 : basis === "money" ? 15 : 0.5;
        const pos = { inst: { id }, exp: e, structure, legs: "together", basis, values: { center: "atm", put: v, call: v }, wings: { call: { on: true, value: w }, put: { on: true, value: w } }, fill };
        const b = POS.build(pos);
        assert.ok(Object.isFrozen(b) && Object.isFrozen(b.legs) && Object.isFrozen(b.label));
        if (!b.na) {
          const d = DIST.make({ expiry: b.E, odds: Odds.Implied });
          assert.ok(Object.isFrozen(d));
          POS.stats(b, d); POS.stats(b, DIST.make({ expiry: b.E, odds: Odds.PeriodVol, vol: readPeriodVol({ record: I }).pct / 100 }));
          POS.val(b, b.S * 1.1, b.T / 2, { ivs: 5, svs: 3, svd: true }); POS.legsAt(b, b.S * 0.9, b.T / 3);
          RULE.convert(b.E, pos, basis === "delta" ? "sigma" : "delta");
        }
        n++;
      }
    }
    const O = INST.make({ id, spot: INST.base(id).spot * 1.07, ivShift: 4 });
    for (const e of O.expiries) assert.ok(O.exp(e).rows.every(o => o.model));
  }
  assert.ok(n >= 96);
});

test("T2: ctx9 and every C helper run on a deep-frozen S9 without writing to it", () => {
  const states = [STATE.defaults()];
  let r = STATE.cmpOp(states[0], "setA", "wings.put.on", true); states.push(r.state);
  r = STATE.cmpOp(r.state, "setB", "inst.spot", 23.2); states.push(r.state);
  r = STATE.cmpOp(r.state, "setB", "exp", "20270319"); states.push(r.state);
  r = STATE.applyChange(r.state, s => { s.assumptions.unit = "pct"; s.prefs.units = "cr"; s.assumptions.dist = "hv"; s.comparison.sizing.rule = "loss"; }); states.push(r);
  for (const S9 of states) {
    const snap = JSON.stringify(S9);
    deepFreeze(S9);
    const C = CTX.ctx9(S9);
    for (const u of [-2, -0.5, 0, 0.7, 2]) { C.vA(u, C.A.T / 2); C.vB(u, C.B.T / 3); C.pA(u); C.pB(u); C.xA(u); C.xB(u); C.toSA(u); C.toSB(u); }
    C.uOfSA(C.A.S * 1.1); C.uOfSB(C.B.S * 0.9); C.sFor(C.A, C.toSA); C.stats(C.B, "hv"); C.statsAtPeriodVol(C.A); C.volOf(C.A.tk); C.volOddsText(); C.worstIn9(C.A, 1, 100);
    C.fU(0.0123); C.fUt(0.05, 0.01); C.unitName(); C.hTxt(); C.axis("pct").toS("B")(10); C.ax.sig("A"); C.sigOwnSuffix(C.B);
    CMP.diff(S9.comparison, C.A, C.B); STATE.swap(S9); STATE.cmpOp(S9, "setA", "values.call", 22); STATE.cmpOp(S9, "detach", "A"); STATE.writeViewCode({ state: Object.assign({ tab: "compare" }, S9), yr: null });
    assert.equal(JSON.stringify(S9), snap);
    assert.ok(typeof C.labels.title === "string" && C.labels.title.includes(" vs "));
  }
});

test("§3.1 source rules: banned patterns and one top-level name per module", () => {
  const banned = [/\bD\.u\b/, /\b(TKS|EXPS)\b/, /["'](RAM|KORU)["']/, /\bst\./, /(^|[^.\w$])(smile|wingAnchors|chain|maxDelta|build|dist|val|legPx|ivAt|statsBase|context)\(/m];
  const NS = { "inst.js": "INST", "rule.js": "RULE", "pos.js": "POS", "dist.js": "DIST", "cmp.js": "CMP", "state.js": "STATE", "ctx.js": "CTX" };
  for (const f of Object.keys(NS)) {
    const src = fs.readFileSync(path.join(V9, f), "utf8");
    if (f !== "inst.js") for (const re of banned) assert.ok(!re.test(src), `${f} matches ${re}: ${(src.match(re) || [])[0]}`);
    const tops = [...src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const allowed = f === "dist.js" ? [NS[f], "cdfT", "cdfAt", "quantAt"] : [NS[f]];
    assert.deepEqual([...new Set(tops)].sort(), allowed.sort(), `${f} top-level names`);
    assert.ok(!/\b(wrinkle|seam|smell)/i.test(src), `${f} uses a banned word`);
  }
});

test("T2: STATE functions never modify their (frozen) input", () => {
  const d0 = STATE.defaults(), S9 = deepFreeze(JSON.parse(JSON.stringify(Object.assign({}, d0, { assumptions: Object.assign({}, d0.assumptions, { unit: "pts", rlo: 3 }) }))));
  const snap = JSON.stringify(S9);
  const n = STATE.normalise(S9);
  assert.equal(n.state.assumptions.unit, "sig"); assert.ok(n.events.some(e => e.type === "note"));
  STATE.change(S9, s => { s.prefs.dock = false; }); STATE.cmpOp(S9, "relinkAll"); STATE.swap(S9); STATE.sanitizeTree(S9);
  assert.equal(JSON.stringify(S9), snap);
});

test("source rules: no .hv read outside inst.js and readPeriodVol, no HV30 outside nameVolSource (every source, shells and CSS)", () => {
  const SOURCES = ["core.js", "adapters.js", "app_store.js", "eng_head.js", "dist.js", "inst.js", "rule.js", "pos.js", "cmp.js", "state.js", "ctx.js",
    "ui_common.js", "ui_summary.js", "ui_dock.js", "ui_views.js", "ui_export.js", "yr_engine.js", "yr_stress.js", "yr_ui.js", "app.js",
    "shell.html", "yr_shell.html", "yr.css", "views.css"].filter(f => fs.existsSync(path.join(V9, f)));
  // the span of one top-level function (its exemption)
  const spanOf = (src, name) => { const m = new RegExp(`^function\\s+${name}\\b[\\s\\S]*?^}`, "m").exec(src); return m ? [m.index, m.index + m[0].length] : [0, 0]; };
  const RULES = [[/\.hv\b/g, { "inst.js": null, "core.js": "readPeriodVol" }], [/HV30/g, { "core.js": "nameVolSource" }]];
  const bad = [];
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(V9, f), "utf8");
    for (const [re, exempt] of RULES) {
      if (f in exempt && exempt[f] === null) continue;
      const [lo, hi] = f in exempt ? spanOf(src, exempt[f]) : [0, 0];
      // the exemption is that function's own body: a span that ran on into the next block would hide literals there
      assert.ok(src.slice(lo, hi).split("\n").length <= 6, `${f}: the ${exempt[f]} exemption spans ${src.slice(lo, hi).split("\n").length} lines`);
      for (const m of src.matchAll(re)) if (m.index < lo || m.index >= hi) bad.push(`${f}: ${src.slice(Math.max(0, m.index - 30), m.index + 20)}`);
    }
  }
  assert.deepEqual(bad, []);
  const core = fs.readFileSync(path.join(V9, "core.js"), "utf8");
  assert.ok(/function readPeriodVol[\s\S]*?\.hv\b/.test(core) && /function nameVolSource\([^)]*\) \{[\s\S]*?return "HV30";\n\}/.test(core), "the accessor and the source-name helper exist");
  assert.ok(/function labelPeriodVol[\s\S]*?nameVolSource\(/.test(core), "the label helper names the source through nameVolSource");
});
