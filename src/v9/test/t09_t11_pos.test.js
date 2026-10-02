// T9 (pricing parity with v8 build), T10 (marks: entry P&L, expiry limit, same legs mark the same), T11 (stats)
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load, loadV8 } = require("./load.js"), { range } = require("./synth.js");
const L = load(), V = loadV8();
const { INST, RULE, POS, DIST } = L;
const P = (id, exp, o) => Object.assign({ inst: { id }, exp, structure: "strangle", legs: "together", basis: "delta", values: { center: "atm", put: 30, call: 30 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" }, o || {});

test("T9: POS.price on v8's legs equals v8 crS, capPx, cr, intr, tv, exitCost, margin and payoff (1e-9); strike agreement is reported", t => {
  const pds = [3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 48, 50, 52, 60, 70, 80, 90];
  let n = 0, worst = 0;
  const agree = { same: 0, put: 0, call: 0, wing: 0, v8na: 0, total: 0 };
  for (const { id } of INST.list()) for (const exp of INST.base(id).expiries) {
    const I = INST.base(id), S = I.spot;
    for (const st of ["str", "cap"]) for (const pd of pds) for (const cd of pds) for (const capd of st === "cap" ? [5, 10, 17, 25] : [17]) for (const fill of ["mid", "nat"]) {
      const b8 = V.build({ tk: id, exp, st, pd, cd, capd, fill });
      agree.total++;
      const b9 = POS.build(P(id, exp, { legs: "detached", values: { center: "atm", put: pd, call: cd }, wings: { call: { on: st === "cap", value: capd }, put: { on: false, value: 15 } }, fill }));
      if (b8.na) { agree.v8na++; continue; }
      const legs = [{ role: "short put", K: b8.sp.K }, { role: "short call", K: b8.sc.K }];
      if (b8.cap) legs.push({ role: "long call", K: b8.cap.K });
      const pr = POS.price(I, exp, legs, fill);
      for (const k of ["crS", "capPx", "cr", "intr", "tv", "exitCost", "margin"]) {
        const d = Math.abs(pr[k] - b8[k]); worst = Math.max(worst, d);
        assert.ok(d <= 1e-9, `${id} ${exp} ${st} ${pd}/${cd}/${capd} ${fill}: ${k} ${pr[k]} vs ${b8[k]}`);
      }
      for (let i = 0; i < 200; i++) {
        const x = S * (0.2 + 2.8 * i / 199), d = Math.abs(POS.payoff(pr, x) - V.payoff(b8, x));
        worst = Math.max(worst, d); assert.ok(d <= 1e-9, `${id} ${exp} payoff at ${x}`);
      }
      n++;
      if (!b9.na) {
        const sp = b9.sp.K === b8.sp.K, sc = b9.sc.K === b8.sc.K, w = (b9.cap ? b9.cap.K : null) === (b8.cap ? b8.cap.K : null);
        if (sp && sc && w) agree.same++; else if (!sp) agree.put++; else if (!sc) agree.call++; else agree.wing++;
      }
    }
  }
  assert.ok(n > 5000, String(n));
  t.diagnostic(`priced ${n} v8 positions; worst abs difference ${worst.toExponential(2)}`);
  // where the two rules pick the same legs, the whole v9 Built agrees with v8 on every kept pricing field
  let full = 0, symSame = 0, symTot = 0;
  for (const { id } of INST.list()) for (const exp of INST.base(id).expiries) for (const t0 of range(3, 49, 1)) for (const fill of ["mid", "nat"]) {
    const b8 = V.build({ tk: id, exp, st: "str", pd: t0, cd: t0, capd: 17, fill }), b9 = POS.build(P(id, exp, { values: { center: "atm", put: t0, call: t0 }, fill }));
    symTot++;
    if (b8.sp.K !== b9.sp.K || b8.sc.K !== b9.sc.K) continue;
    symSame++;
    for (const k of ["crS", "capPx", "cr", "intr", "tv", "exitCost", "margin", "straddle", "guts", "dte", "T", "S"]) assert.ok(b9[k] === b8[k] || Math.abs(b9[k] - b8[k]) <= 1e-9, `${id} ${exp} ${t0} ${k}`);
    full++;
  }
  assert.ok(full > 100);
  t.diagnostic(`symmetric linked targets 3..49Δ (critic E's sweep): v9 picks v8's strikes in ${symSame}/${symTot} = ${(100 * symSame / symTot).toFixed(1)}%; all agreeing Builts match v8's pricing fields`);
  t.diagnostic(`strike agreement with v8 (same targets on the Δ basis): ${agree.same}/${agree.total - agree.v8na} = ${(100 * agree.same / (agree.total - agree.v8na)).toFixed(1)}%; first difference by leg: put ${agree.put}, call ${agree.call}, wing ${agree.wing}; v8 n/a ${agree.v8na}`);
});

const sample = () => {
  const out = [];
  for (const { id } of INST.list()) for (const exp of INST.base(id).expiries) for (const basis of RULE.BASES) {
    const vs = basis === "delta" ? [10, 30, 45, 60, 75] : basis === "money" ? [-15, 0, 10, 25] : [-0.6, 0, 0.4, 1];
    for (const p of vs) for (const c of vs) for (const structure of ["strangle", "straddle"]) for (const fill of ["mid", "nat"]) for (const wings of [false, true]) {
      const w = basis === "delta" ? 8 : basis === "money" ? 20 : 0.6;
      out.push(P(id, exp, { structure, basis, fill, values: { center: p, put: p, call: c }, wings: { call: { on: wings, value: w }, put: { on: wings, value: w } } }));
    }
  }
  return out;
};

test("T10: entry P&L is 0 at mid and −Σ(ask − bid) at natural, ITM legs included", () => {
  let itm = 0, n = 0;
  for (const pos of sample()) {
    const b = POS.build(pos); if (b.na) continue;
    const v = POS.val(b, b.S, b.T);
    if (b.fill === "mid") assert.ok(Math.abs(v) < 1e-12, `${b.label.full} mid: ${v}`);
    else { const spr = b.legs.reduce((t, l) => t + (l.ask - l.bid), 0); assert.ok(Math.abs(v + spr) < 1e-12, `${b.label.full} nat: ${v} vs ${-spr}`); }
    const la = POS.legsAt(b, b.S, b.T); assert.ok(Math.abs(la.reduce((t, l) => t + l.pnl, 0) - v) < 1e-12);
    if (b.legs.some(l => l.itm)) itm++;
    n++;
  }
  assert.ok(itm > 500 && n > 2000, `${itm} / ${n}`);
  // overridden instruments (model quotes) too
  for (const sd of [{ id: "KORU", spot: 23.2 }, { id: "RAM", ivShift: 10 }, { id: "RAM", spot: 13, ivShift: -5 }]) {
    const b = POS.build(P(sd.id, "20261218", { inst: sd, values: { center: "atm", put: 70, call: 25 } }));
    assert.ok(Math.abs(POS.val(b, b.S, b.T)) < 1e-12);
  }
});

test("T10: val at τ → 0 equals payoff away from strikes; at τ = 0 it is the payoff", () => {
  for (const pos of sample().filter((x, i) => i % 7 === 0)) {
    const b = POS.build(pos); if (b.na || b.fill !== "mid") continue;
    for (const k of [0.5, 0.8, 0.93, 1.07, 1.3, 2]) {
      const x = b.S * k; if (b.legs.some(l => Math.abs(Math.log(x / l.K)) < 0.01)) continue;
      assert.ok(Math.abs(POS.val(b, x, 1e-8) - POS.payoff(b, x)) < 1e-6, `${b.label.full} at ${x}`);
      assert.equal(POS.val(b, x, 0), POS.payoff(b, x));
    }
  }
});

test("T10: positions that resolve to the same legs and fill price and mark identically, whatever their values or basis", () => {
  let pairs = 0;
  for (const pos of sample().filter((x, i) => i % 3 === 0)) {
    const b = POS.build(pos); if (b.na) continue;
    const to = pos.basis === "delta" ? "sigma" : "delta", cv = RULE.convert(b.E, pos, to);
    const b2 = POS.build(Object.assign({}, pos, { basis: to, values: cv.values, wings: cv.wings }));
    if (b2.na || b2.legs.map(l => l.role + l.K).join() !== b.legs.map(l => l.role + l.K).join()) continue;
    assert.equal(b2.priced, b.priced, "the same frozen pricing object");
    for (const [x, tau, sh] of [[b.S, b.T, null], [b.S * 1.2, b.T / 2, { ivs: 10, svs: 0, svd: true }], [b.S * 0.8, b.T / 4, { ivs: -5, svs: 4, svd: false }]]) assert.equal(POS.val(b2, x, tau, sh), POS.val(b, x, tau, sh));
    pairs++;
  }
  assert.ok(pairs > 200, String(pairs));
  // finding 11: v8 49 vs 51 on RAM 20 Nov gave two marks for the same legs
  const a = POS.build(P("RAM", "20261120", { legs: "detached", values: { center: "atm", put: 40.5, call: 20 } })), c = POS.build(P("RAM", "20261120", { legs: "detached", values: { center: "atm", put: 41.5, call: 20 } }));
  if (a.sp.K === c.sp.K) assert.equal(POS.val(a, 14, a.T / 2), POS.val(c, 14, c.T / 2));
});

// brute force: integrate 1[payoff > ε] over the distribution grid, each cell split in 50
function brute(b, d) {
  const S = b.S, eps = 1e-9 * S; let m = 0;
  const xLo = S * Math.exp(d.ulo), xHi = S * Math.exp(d.uhi);
  if (POS.payoff(b, xLo * 0.999) > eps) m += d.cdf[0];
  if (POS.payoff(b, xHi * 1.001) > eps) m += 1 - d.cdf[d.n];
  for (let i = 0; i < d.n; i++) for (let j = 0; j < 50; j++) {
    const u0 = d.u[i] + d.du * j / 50, u1 = d.u[i] + d.du * (j + 1) / 50, um = (u0 + u1) / 2;
    if (POS.payoff(b, S * Math.exp(um)) > eps) m += L.cdfT(d, u1) - L.cdfT(d, u0);
  }
  return m;
}
test("T11: profit odds match brute-force integration (debits, guts with a wing below the put, iron condors, the exact-gap case)", () => {
  const cases = [
    P("RAM", "20261120"),
    P("KORU", "20261016", { wings: { call: { on: true, value: 10 }, put: { on: false, value: 15 } }, values: { center: "atm", put: 15, call: 15 }, fill: "nat" }),
    P("RAM", "20261016", { values: { center: "atm", put: 5, call: 15 }, wings: { call: { on: true, value: 5 }, put: { on: false, value: 15 } }, fill: "nat", legs: "detached" }),   // finding 21: net debit
    P("RAM", "20261016", { values: { center: "atm", put: 80, call: 80 }, wings: { call: { on: true, value: 40 }, put: { on: false, value: 15 } } }),   // finding 20: capped guts
    P("RAM", "20261120", { values: { center: "atm", put: 70, call: 70 }, wings: { call: { on: false, value: 15 }, put: { on: true, value: 10 } } }),   // guts with a wing below the put
    P("KORU", "20261218", { values: { center: "atm", put: 20, call: 20 }, wings: { call: { on: true, value: 8 }, put: { on: true, value: 8 } } }),   // iron condor
    P("KORU", "20270319", { structure: "straddle", basis: "money", values: { center: 0, put: 10, call: 10 }, wings: { call: { on: true, value: 30 }, put: { on: true, value: 30 } }, fill: "nat" })
  ];
  for (const pos of cases) {
    const b = POS.build(pos); assert.ok(!b.na, pos.exp);
    for (const mode of ["rn", "hv"]) {
      const d = DIST.make(b.E, b.S, mode, b.inst.hv, 1), s = POS.stats(b, d), bf = brute(b, d);
      assert.ok(Math.abs(s.pop - bf) < 1e-3, `${b.label.full} ${mode}: pop ${s.pop} vs brute ${bf}`);
      for (const x of s.bes) assert.ok(Math.abs(POS.payoff(b, x)) < 1e-6 * b.S, `breakeven ${x} of ${b.label.full}`);
      if (s.bes.length === 0) assert.ok(s.pop < 1e-9 || s.pop > 1 - 1e-9);
      if (mode === "rn" && b.fill === "mid") assert.ok(Math.abs(s.ev) < 1e-12);
    }
  }
  // a net debit that can never profit: odds 0, no breakevens
  const debit = POS.build(P("RAM", "20261016", { values: { center: "atm", put: 5, call: 15 }, wings: { call: { on: true, value: 5 }, put: { on: false, value: 15 } }, fill: "nat", legs: "detached" }));
  const sd = POS.stats(debit, DIST.make(debit.E, debit.S, "rn", debit.inst.hv, 1));
  if (debit.cr < 0 && [0.1, 0.5, 1, 1.5, 3].every(k => POS.payoff(debit, debit.S * k) <= 0)) { assert.equal(sd.pop, 0); assert.equal(sd.bes.length, 0); }
  // HV EV is the lognormal expectation of the payoff
  const b = POS.build(cases[5]), d = DIST.make(b.E, b.S, "hv", b.inst.hv, 1), s = POS.stats(b, d);
  let ev = 0; const n = 20000, v = d.hs * Math.sqrt(b.T), mu = -0.5 * v * v;
  for (let i = 0; i < n; i++) { const z = -8 + 16 * (i + 0.5) / n, x = b.S * Math.exp(mu + v * z); ev += POS.payoff(b, x) * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * 16 / n; }
  assert.ok(Math.abs(ev - s.ev) < 1e-3 * b.S, `${ev} vs ${s.ev}`);
});

test("T11: the exact-gap case — P&L exactly 0 above the wing is not a profit", () => {
  const D = { meta: { asof: "2026-10-01T16:00:00", rate: 0.04 }, u: { RAM: { S: 10, hv: 0.8, lev: 2, exps: { "20261120": { dte: 50, T: 50 / 365, q: [
    { K: 9, cp: "P", bid: 0.5, ask: 0.5, mid: 0.5 }, { K: 9, cp: "C", bid: 1.5, ask: 1.5, mid: 1.5 },
    { K: 10, cp: "P", bid: 0.875, ask: 0.875, mid: 0.875 }, { K: 10, cp: "C", bid: 0.875, ask: 0.875, mid: 0.875 },
    { K: 11, cp: "P", bid: 1.5, ask: 1.5, mid: 1.5 }, { K: 11, cp: "C", bid: 0.75, ask: 0.75, mid: 0.75 },
    { K: 12, cp: "P", bid: 2.25, ask: 2.25, mid: 2.25 }, { K: 12, cp: "C", bid: 0.25, ask: 0.25, mid: 0.25 }] } } } } };
  const S = load(D);
  const pr = S.POS.price(S.INST.base("RAM"), "20261120", [{ role: "short put", K: 9 }, { role: "short call", K: 11 }, { role: "long call", K: 12 }], "mid");
  assert.equal(pr.cr, 1);                            // 0.5 + 0.75 − 0.25: payoff above 12 is exactly 0
  assert.equal(S.POS.payoff(pr, 20), 0);
  const fake = Object.assign({}, pr, { key: "gap", na: false });
  const d = S.DIST.make(pr.E, pr.S, "hv", 0.8, 1), s = S.POS.stats(fake, d);
  assert.deepEqual(JSON.parse(JSON.stringify(s.bes)), [8, 12]);
  assert.ok(Math.abs(s.pop - (S.DIST.cdfK(d, 12) - S.DIST.cdfK(d, 8))) < 1e-9, "profit region (8, 12): above 12 the P&L is exactly 0");
});
