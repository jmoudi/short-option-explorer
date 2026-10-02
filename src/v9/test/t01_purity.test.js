// T1 (frozen D, strict mode), T2 (frozen S9, ctx9 without writes) and the build-time source rules of §3.1
"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), path = require("path"), vm = require("vm");
const { load, deepFreeze, V9 } = require("./load.js");
const L = load();
const { INST, RULE, POS, DIST, CMP, STATE, CTX, D } = L;

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
          const d = DIST.make(b.E, b.S, "rn", I.hv, 1);
          assert.ok(Object.isFrozen(d));
          POS.stats(b, d); POS.stats(b, DIST.make(b.E, b.S, "hv", I.hv, 1));
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
  let r = STATE.cmpOp(states[0], "setA", "wings.put.on", true); states.push(r.S9);
  r = STATE.cmpOp(r.S9, "setB", "inst.spot", 23.2); states.push(r.S9);
  r = STATE.cmpOp(r.S9, "setB", "exp", "20270319"); states.push(r.S9);
  r = STATE.applyChange(r.S9, s => { s.scen.unit = "pct"; s.view.units = "cr"; s.scen.dist = "hv"; s.cmp.sizing.rule = "loss"; }); states.push(r);
  for (const S9 of states) {
    const snap = JSON.stringify(S9);
    deepFreeze(S9);
    const C = CTX.ctx9(S9);
    for (const u of [-2, -0.5, 0, 0.7, 2]) { C.vA(u, C.A.T / 2); C.vB(u, C.B.T / 3); C.pA(u); C.pB(u); C.xA(u); C.xB(u); C.toSA(u); C.toSB(u); }
    C.uOfSA(C.A.S * 1.1); C.uOfSB(C.B.S * 0.9); C.sFor(C.A, C.toSA); C.stats(C.B, "hv"); C.statsHV(C.A); C.worstIn9(C.A, 1, 100);
    C.fU(0.0123); C.fUt(0.05, 0.01); C.unitName(); C.hTxt(); C.axis("pct").toS("B")(10); C.ax.sig("A"); C.sigOwnSuffix(C.B);
    CMP.diff(S9.cmp, C.A, C.B); STATE.swap(S9); STATE.cmpOp(S9, "setA", "values.call", 22); STATE.cmpOp(S9, "detach", "A"); STATE.code(S9, { tab: "compare" });
    assert.equal(JSON.stringify(S9), snap);
    assert.ok(typeof C.labels.title === "string" && C.labels.title.includes(" vs "));
  }
});

test("§3.1 source rules: banned patterns and one top-level name per module", () => {
  const banned = [/\bD\.u\b/, /\b(TKS|EXPS)\b/, /["'](RAM|KORU)["']/, /\bst\./, /(^|[^.\w$])(smile|wingAnchors|chain|maxDelta|build|dist|val|legPx|ivAt|statsBase|context)\(/m];
  const NS = { "inst9.js": "INST", "rule9.js": "RULE", "pos9.js": "POS", "dist9.js": "DIST", "cmp9.js": "CMP", "state9.js": "STATE", "ctx9.js": "CTX" };
  for (const f of Object.keys(NS)) {
    const src = fs.readFileSync(path.join(V9, f), "utf8");
    if (f !== "inst9.js") for (const re of banned) assert.ok(!re.test(src), `${f} matches ${re}: ${(src.match(re) || [])[0]}`);
    const tops = [...src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const allowed = f === "dist9.js" ? [NS[f], "cdfT", "cdfAt", "quantAt"] : [NS[f]];
    assert.deepEqual([...new Set(tops)].sort(), allowed.sort(), `${f} top-level names`);
    assert.ok(!/\b(wrinkle|seam|smell)/i.test(src), `${f} uses a banned word`);
  }
});

test("T2: STATE functions never modify their (frozen) input", () => {
  const d0 = STATE.defaults(), S9 = deepFreeze(JSON.parse(JSON.stringify(Object.assign({}, d0, { scen: Object.assign({}, d0.scen, { unit: "pts", rlo: 3 }) }))));
  const snap = JSON.stringify(S9);
  const n = STATE.normalise(S9);
  assert.equal(n.S9.scen.unit, "sig"); assert.ok(n.events.some(e => e.type === "note"));
  STATE.change(S9, s => { s.view.dock = false; }); STATE.cmpOp(S9, "relinkAll"); STATE.swap(S9); STATE.sanitize9(S9);
  assert.equal(JSON.stringify(S9), snap);
});
