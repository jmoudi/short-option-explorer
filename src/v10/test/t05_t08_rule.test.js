// T5 (resolution), T6 (round trip), T7 (reachability), T8 (wings)
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js"), { synthD, range } = require("./synth.js");
const L = load();
const { INST, RULE, POS } = L;
const chains = () => INST.list().flatMap(({ id }) => INST.base(id).expiries.map(e => [id, e, INST.base(id).exp(e)]));
const grid = basis => basis === "delta" ? range(1, 99, 2) : basis === "money" ? range(-40, 80, 2.5) : range(-2, 2.5, 0.1);

test("T5: a straddle always resolves to one strike, on every chain, basis and center", () => {
  for (const [id, e, E] of chains()) for (const basis of RULE.BASES) for (const c of ["atm", ...grid(basis)]) {
    const r = RULE.resolve(E, "straddle", basis, { center: c, put: 30, call: 30 }, {});
    assert.equal(r.na, "");
    assert.equal(r.put.K, r.call.K, `${id} ${e} ${basis} ${c}`);
    assert.equal(r.kind, "straddle");
  }
});

test("T5: a strangle is never a straddle unless ONE_STRIKE, and is a guts iff the values cross", () => {
  let n = 0, guts = 0;
  for (const [id, e, E] of chains()) for (const basis of RULE.BASES) {
    const g = grid(basis).filter((x, i) => i % 2 === 0);
    for (const p of g) for (const c of g) {
      const r = RULE.resolve(E, "strangle", basis, { center: "atm", put: p, call: c }, {});
      const one = r.flags.some(f => f.code === "ONE_STRIKE");
      if (!one) {
        assert.notEqual(r.kind, "straddle", `${id} ${e} ${basis} ${p}/${c}`);
        assert.equal(r.kind === "guts", RULE.crosses(basis, p, c), `${id} ${e} ${basis} ${p}/${c} -> ${r.kind}`);
      }
      if (r.kind === "guts") guts++;
      n++;
    }
  }
  assert.ok(n > 10000 && guts > 100);
});

test("T5: WIDENED picks the leg with the smaller added error (RAM 16 Oct, 20 Nov, 19 Mar at 47–49Δ)", () => {
  let seen = 0;
  for (const e of ["20261016", "20261120", "20270319"]) {
    const E = INST.base("RAM").exp(e);
    for (const t of [47, 47.5, 48, 48.5, 49]) {
      const r = RULE.resolve(E, "strangle", "delta", { center: "atm", put: t, call: t }, {});
      const f = r.flags.find(x => x.code === "WIDENED");
      if (!f) continue;
      seen++;
      const p0 = RULE.snap(E, "short put", "delta", t), c0 = RULE.snap(E, "short call", "delta", t);
      assert.ok(p0.K >= c0.K);
      const el = RULE.eligible(E);
      const pc = el.put.filter(K => K < c0.K).pop(), cc = el.call.find(K => K > p0.K);
      const ep = pc !== undefined ? Math.abs(RULE.valueAt(E, pc, "short put", "delta") - t) - Math.abs(p0.snapErr) : Infinity;
      const ec = cc !== undefined ? Math.abs(RULE.valueAt(E, cc, "short call", "delta") - t) - Math.abs(c0.snapErr) : Infinity;
      assert.equal(f.moved, ep <= ec + 1e-12 ? "put" : "call");
      assert.equal(r.kind, "strangle");
      assert.match(f.text, /^kept a strangle: (put|call) [\d.]+ \(/);
    }
  }
  assert.ok(seen >= 3, `collisions seen: ${seen}`);
  const r = RULE.resolve(INST.base("RAM").exp("20261016"), "strangle", "delta", { put: 48, call: 48 }, {});
  assert.equal(r.flags.find(x => x.code === "WIDENED").text, "kept a strangle: put 14 (both legs snapped to 15)");
});

test("T5: ITM status comes from the strike against Fpar, never from a target", () => {
  for (const [, , E] of chains()) for (const basis of RULE.BASES) for (const p of grid(basis).filter((x, i) => i % 3 === 0)) {
    const r = RULE.resolve(E, "strangle", basis, { put: p, call: p }, {});
    assert.equal(r.put.itm, r.put.K > E.Fpar); assert.equal(r.call.itm, r.call.K < E.Fpar);
  }
  // finding 10/11: RAM 20 Nov 49 vs 51 put targets that land on the same strike mark identically
  const pos = v => ({ inst: { id: "RAM" }, exp: "20261120", structure: "strangle", legs: "detached", basis: "delta", values: { center: "atm", put: v, call: 20 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" });
  const a = POS.build(pos(41)), b = POS.build(pos(42));
  if (a.sp.K === b.sp.K) for (const x of [12, 14.45, 17]) assert.equal(POS.val(a, x, a.T / 2), POS.val(b, x, b.T / 2));
});

test("T5: CHAIN_END at both ends (short legs), GAP on RAM 20 Nov inside 21P–25P, FAR on a coarse grid", () => {
  const E = INST.base("RAM").exp("20261120");
  const out = RULE.resolve(E, "strangle", "delta", { put: 30, call: 3 }, {});
  const ce = out.flags.find(f => f.code === "CHAIN_END" && f.leg === "call");
  assert.ok(ce && ce.severity === "warn" && /beyond the chain: 25C is the last listed/.test(ce.text));
  assert.equal(out.call.K, Math.max(...RULE.eligible(E).call));
  const itm = RULE.resolve(E, "strangle", "delta", { put: 99, call: 10 }, {});
  const ce2 = itm.flags.find(f => f.code === "CHAIN_END" && f.leg === "put");
  assert.ok(ce2, "ITM end of the put chain");
  assert.equal(itm.put.K, Math.max(...RULE.eligible(E).put));
  const lowP = RULE.resolve(E, "strangle", "delta", { put: 0.5, call: 10 }, {});
  assert.ok(lowP.flags.some(f => f.code === "CHAIN_END" && f.leg === "put"), "OTM end of the put chain");
  // GAP: a put target between the 21P and 25P achieved values
  const v21 = RULE.valueAt(E, 21, "short put", "delta"), v25 = RULE.valueAt(E, 25, "short put", "delta");
  const gap = RULE.resolve(E, "strangle", "delta", { put: (v21 + v25) / 2, call: 30 }, {});
  const g = gap.flags.find(f => f.code === "GAP");
  assert.ok(g && g.severity === "note", JSON.stringify(gap.flags));
  assert.match(g.text, /^no 22–24P listed; 21P [\d.]+Δ, 25P [\d.]+Δ$/);
  // FAR: coarse synthetic grid
  const S = load(synthD({ inst: [{ id: "RAM", S: 20, exps: { "20261120": { dte: 50, strikes: [5, 10, 15, 20, 25, 30, 35, 40], vol: 0.25 } } }] }));
  const Ec = S.INST.base("RAM").exp("20261120");
  const far = S.RULE.resolve(Ec, "strangle", "delta", { put: 25, call: 25 }, {});
  assert.ok(far.flags.some(f => f.code === "FAR"), JSON.stringify(far.flags));
  assert.ok(!far.flags.some(f => f.code === "GAP"));
  assert.match(far.flags.find(f => f.code === "FAR").text, /^25Δ → [\d.]+Δ: nearest strikes \d+[PC] [\d.]+Δ, \d+[PC] [\d.]+Δ$/);
  // at most one of CHAIN_END / GAP / FAR per leg
  for (const r of [out, itm, gap, far]) for (const leg of ["put", "call"]) assert.ok(r.flags.filter(f => f.leg === leg && ["CHAIN_END", "GAP", "FAR"].includes(f.code)).length <= 1);
});

test("T5: synthetic chains: one strike → ONE_STRIKE, no straddle strike → n/a, a missing expiry maps", () => {
  const D = synthD({ inst: [
    { id: "RAM", S: 10, exps: { "20261120": { dte: 50, strikes: [10] } } },
    { id: "SYN", S: 10, exps: { "20261218": { dte: 78, strikes: [8, 9, 10, 11, 12], noBid: ["C8", "C9", "C10", "P10", "P11", "P12"] } } }
  ] });
  const S = load(D);
  const E1 = S.INST.base("RAM").exp("20261120");
  const r = S.RULE.resolve(E1, "strangle", "delta", { put: 30, call: 30 }, {});
  assert.equal(r.kind, "straddle"); assert.ok(r.flags.some(f => f.code === "ONE_STRIKE" && f.severity === "warn"));
  const E2 = S.INST.base("SYN").exp("20261218");
  assert.equal(S.RULE.resolve(E2, "straddle", "delta", { center: "atm" }, {}).na, "no strike with both a put and a call bid");
  const b = S.POS.build({ inst: { id: "SYN" }, exp: "20261120", structure: "strangle", legs: "together", basis: "delta", values: { center: "atm", put: 30, call: 30 }, wings: {}, fill: "mid" });
  assert.equal(b.exp, "20261218"); assert.ok(b.flags.some(f => f.code === "EXP_MAPPED"));
  const bn = S.POS.build({ inst: { id: "SYN" }, exp: "20261120", structure: "strangle", legs: "together", basis: "delta", values: { put: 30, call: 30 }, wings: {}, fill: "mid" }, { expMap: "same" });
  assert.ok(bn.na && bn.flags.some(f => f.code === "EXP_NA"));
});

test("T6: resolve(valueAt(K)) gives back K for every eligible strike, chain, basis and role", () => {
  let n = 0;
  for (const [id, e, E] of chains()) {
    const el = RULE.eligible(E);
    for (const basis of RULE.BASES) {
      for (const K of el.put) { assert.equal(RULE.snap(E, "short put", basis, RULE.valueAt(E, K, "short put", basis)).K, K, `${id} ${e} ${basis} ${K}P`); n++; }
      for (const K of el.call) { assert.equal(RULE.snap(E, "short call", basis, RULE.valueAt(E, K, "short call", basis)).K, K, `${id} ${e} ${basis} ${K}C`); n++; }
      for (const K of el.straddle) {
        const r = RULE.resolve(E, "straddle", basis, { center: RULE.valueAt(E, K, "center", basis) }, {});
        assert.equal(r.put.K, K, `${id} ${e} ${basis} center ${K}`); n++;
      }
      // a strangle around each pair of eligible strikes (put below call) resolves exactly to that pair
      for (const Kp of el.put) {
        const Kc = el.call.find(K => K > Kp); if (Kc === undefined) continue;
        const r = RULE.resolve(E, "strangle", basis, { put: RULE.valueAt(E, Kp, "short put", basis), call: RULE.valueAt(E, Kc, "short call", basis) }, {});
        assert.deepEqual([r.put.K, r.call.K], [Kp, Kc], `${id} ${e} ${basis} ${Kp}/${Kc}`); n++;
      }
      // wings beyond a short
      const Ks = el.call[0];
      for (const K of el.longCall.filter(x => x > Ks)) { assert.equal(RULE.snap(E, "long call", basis, RULE.valueAt(E, K, "long call", basis, Ks), Ks).K, K); n++; }
      const Kp = el.put[el.put.length - 1];
      for (const K of el.longPut.filter(x => x < Kp)) { assert.equal(RULE.snap(E, "long put", basis, RULE.valueAt(E, K, "long put", basis, Kp), Kp).K, K); n++; }
    }
  }
  assert.ok(n > 2000, String(n));
});

test("T6: basis conversion keeps every strike (positions stay in place)", () => {
  for (const [id, e, E] of chains()) for (const from of RULE.BASES) for (const to of RULE.BASES) {
    if (from === to) continue;
    for (const v of grid(from).filter((x, i) => i % 4 === 1)) {
      const w = from === "delta" ? 12 : from === "money" ? 15 : 0.5;
      const pos = { basis: from, structure: "strangle", values: { center: v, put: v, call: v }, wings: { call: { on: true, value: w }, put: { on: true, value: w } } };
      const r0 = RULE.resolve(E, "strangle", from, pos.values, pos.wings), s0 = RULE.resolve(E, "straddle", from, pos.values, {});
      const cv = RULE.convert(E, pos, to);
      const r1 = RULE.resolve(E, "strangle", to, cv.values, cv.wings), s1 = RULE.resolve(E, "straddle", to, cv.values, {});
      const inB = (K, role) => { const x = RULE.valueAt(E, K, role, to); return x === RULE.clampValue(to, x); };
      if (inB(r0.put.K, "short put") && inB(r0.call.K, "short call")) assert.deepEqual([r1.put.K, r1.call.K], [r0.put.K, r0.call.K], `${id} ${e} ${from}->${to} ${v}`);
      if (inB(s0.put.K, "center")) assert.equal(s1.put.K, s0.put.K);
      for (const k of ["wingCall", "wingPut"]) if (r0[k] && r1[k] && !cv.flags.length && r0[k === "wingCall" ? "call" : "put"].K === r1[k === "wingCall" ? "call" : "put"].K && (x => x === RULE.clampWing(to, x))(RULE.valueAt(E, r0[k].K, r0[k].role, to, r0[k].Kshort))) assert.equal(r1[k].K, r0[k].K, `${id} ${e} ${from}->${to} ${k}`);
    }
    // "atm" stays "atm"
    assert.equal(RULE.convert(E, { basis: from, structure: "straddle", values: { center: "atm", put: 30, call: 30 }, wings: {} }, to).values.center, "atm");
  }
});

test("T7: every eligible strike is reached by some value on every basis, inside RULE.range", () => {
  for (const [id, e, E] of chains()) for (const basis of RULE.BASES) for (const [role, list] of [["short put", RULE.eligible(E).put], ["short call", RULE.eligible(E).call], ["center", RULE.eligible(E).straddle]]) {
    const [lo, hi] = RULE.range(E, basis, role);
    const hit = new Set();
    const steps = 4000;
    for (let i = 0; i <= steps; i++) hit.add(RULE.snap(E, role, basis, lo + (hi - lo) * i / steps).K);
    for (const K of list) assert.ok(hit.has(K), `${id} ${e} ${basis} ${role} ${K} unreachable`);
  }
});

test("T8: wings sit strictly beyond the short; n/a → WING_NA and priced without; beyond → end + CHAIN_END; inside → first + WING_INSIDE", () => {
  for (const [id, e, E] of chains()) for (const basis of RULE.BASES) for (const v of grid(basis).filter((x, i) => i % 5 === 2)) {
    const w = basis === "delta" ? 10 : basis === "money" ? 12 : 0.4;
    const r = RULE.resolve(E, "strangle", basis, { put: v, call: v }, { call: { on: true, value: w }, put: { on: true, value: w } });
    if (r.wingCall) assert.ok(r.wingCall.K > r.call.K); else assert.ok(r.flags.some(f => f.code === "WING_NA" && f.leg === "wingCall"));
    if (r.wingPut) assert.ok(r.wingPut.K < r.put.K); else assert.ok(r.flags.some(f => f.code === "WING_NA" && f.leg === "wingPut"));
  }
  // RAM 19 Mar 30/30/17: the short call is the last listed call → n/a, built and priced without the wing
  const pos = { inst: { id: "RAM" }, exp: "20270319", structure: "strangle", legs: "together", basis: "delta", values: { center: "atm", put: 30, call: 30 }, wings: { call: { on: true, value: 17 }, put: { on: false, value: 15 } }, fill: "mid" };
  const b = POS.build(pos);
  assert.equal(b.na, false); assert.equal(b.cap, null);
  const wna = b.flags.find(f => f.code === "WING_NA");
  assert.equal(wna.text, "call wing n/a (no strike above 30C)");
  assert.ok(wna.fix && wna.fix.path === "values.call");
  const fixed = POS.build(Object.assign({}, pos, { values: Object.assign({}, pos.values, { call: wna.fix.value }) }));
  assert.ok(fixed.cap && fixed.cap.K > fixed.sc.K, "the fix frees a wing");
  assert.equal(b.cr, POS.build(Object.assign({}, pos, { wings: { call: { on: false, value: 17 }, put: { on: false, value: 15 } } })).cr);
  // beyond the end
  const E = INST.base("RAM").exp("20261120");
  const far = RULE.resolve(E, "strangle", "delta", { put: 30, call: 30 }, { call: { on: true, value: 0.5 }, put: { on: true, value: 0.5 } });
  assert.ok(far.flags.some(f => f.code === "CHAIN_END" && f.leg === "wingCall")); assert.equal(far.wingCall.K, Math.max(...RULE.eligible(E).longCall));
  assert.ok(far.flags.some(f => f.code === "CHAIN_END" && f.leg === "wingPut")); assert.equal(far.wingPut.K, Math.min(...RULE.eligible(E).longPut));
  // inside the short
  const ins = RULE.resolve(E, "strangle", "delta", { put: 30, call: 30 }, { call: { on: true, value: 45 }, put: { on: true, value: 45 } });
  assert.ok(ins.flags.some(f => f.code === "WING_INSIDE" && f.leg === "wingCall")); assert.equal(ins.wingCall.K, RULE.eligible(E).longCall.find(K => K > ins.call.K));
  assert.ok(ins.flags.some(f => f.code === "WING_INSIDE" && f.leg === "wingPut")); assert.equal(ins.wingPut.K, RULE.eligible(E).longPut.filter(K => K < ins.put.K).pop());
  // money / sigma wings measure from their own short
  const m = RULE.resolve(E, "strangle", "money", { put: 10, call: 10 }, { call: { on: true, value: 20 } });
  assert.ok(Math.abs(m.wingCall.K / m.call.K - 1.2) < 0.08);
});

test("smile click helpers: an eligible strike is accepted, others are refused with the reason; legs together keep their offset", () => {
  const E = INST.base("RAM").exp("20261120"), el = RULE.eligible(E);
  assert.equal(RULE.whyNot(E, el.put[0], "short put"), "");
  assert.match(RULE.whyNot(E, 99, "short call"), /not listed/);
  assert.match(RULE.whyNot(E, el.call[0], "long call", el.call[3]), /must sit above the short call/);
  const v = RULE.valueAt(E, el.put[2], "short put", "delta");
  const s = RULE.shiftTogether({ put: 30, call: 25 }, "put", v);
  assert.equal(s.put, v); assert.ok(Math.abs((s.put - s.call) - 5) < 1e-12);
  assert.equal(RULE.snap(E, "short put", "delta", s.put).K, el.put[2]);
});
