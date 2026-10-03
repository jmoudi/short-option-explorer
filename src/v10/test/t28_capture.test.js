// T28 capture: the share of the maximum payoff kept, against closed forms (zero rate, ATM straddle, lognormal)
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js");
const { CAPTURE, POS, RECOVERY, INST, N } = load();

// Black–Scholes at zero rate: an ATM straddle's price is exactly E|S_T − K| under the zero-drift lognormal
const bs0 = (S, K, T, s, cp) => {
  if (!(T > 0)) { return cp === "C" ? Math.max(0, S - K) : Math.max(0, K - S); }
  const v = s * Math.sqrt(T), d1 = Math.log(S / K) / v + v / 2, d2 = d1 - v;
  return cp === "C" ? S * N(d1) - K * N(d2) : K * N(-d2) - S * N(-d1);
};
const straddle = ({ iv, days = 30 }) => CAPTURE.fromLegs({ S0: 100, days, iv, rate: 0, price: bs0, legs: [{ K: 100, cp: "P", qty: -1 }, { K: 100, cp: "C", qty: -1 }] });
const readings = ({ position, vol }) => {
  const max = CAPTURE.findMaxPayoff(position).value;
  const scenario = CAPTURE.lognormal({ S0: position.S0, vol, years: position.years });
  return { max, scenario, m: CAPTURE.measure({ pnl: position.payoff, scenario, maxPayoff: max }) };
};

test("T28 the maximum payoff of a short straddle is its credit; a long call has none to keep", () => {
  const p = straddle({ iv: 0.6 });
  assert.ok(Math.abs(CAPTURE.findMaxPayoff(p).value - p.credit) < 1e-12);
  const long = CAPTURE.fromLegs({ S0: 100, days: 30, iv: 0.6, rate: 0, price: bs0, legs: [{ K: 100, cp: "C", qty: 1 }] });
  assert.equal(CAPTURE.findMaxPayoff(long).ok, true, "a long call's payoff is unbounded above: its max is at the grid's top");
  const debit = CAPTURE.fromLegs({ S0: 100, days: 30, iv: 0.6, rate: 0, price: bs0, legs: [{ K: 100, cp: "P", qty: 1 }, { K: 100, cp: "C", qty: 1 }] });
  assert.equal(debit.credit < 0, true);
});

test("T28 expected capture is 1 − straddle(RV) / straddle(IV): zero when realized vol = implied", () => {
  const p = straddle({ iv: 0.8 });
  const same = readings({ position: p, vol: 0.8 }), lower = readings({ position: p, vol: 0.6 });
  assert.ok(Math.abs(same.m.mean) < 2e-3, `RV = IV: ${same.m.mean}`);
  const exact = 1 - (bs0(100, 100, p.years, 0.6, "P") + bs0(100, 100, p.years, 0.6, "C")) / p.credit;
  assert.ok(Math.abs(lower.m.mean - exact) < 2e-3, `${lower.m.mean} vs ${exact}`);
});

test("T28 the median keeps more than the mean, about 1 − 0.845·RV/IV for a short horizon", () => {
  const p = straddle({ iv: 0.5, days: 15 }), r = readings({ position: p, vol: 0.5 });
  assert.ok(r.m.median > r.m.mean + 0.1, `${r.m.median} vs ${r.m.mean}`);
  assert.ok(Math.abs(r.m.median - (1 - 0.6745 / 0.7979)) < 0.02, `median ${r.m.median}`);
});

test("T28 the odds of keeping at least x are the odds of ending inside the keep band", () => {
  const p = straddle({ iv: 0.6 }), r = readings({ position: p, vol: 0.6 });
  for (const x of [0, 0.5, 0.9]) {
    const band = CAPTURE.findKeepBand({ payoff: p.payoff, maxPayoff: r.max, x, S0: 100 });
    const v = 0.6 * Math.sqrt(p.years), z = S => (Math.log(S / 100) + v * v / 2) / v;
    const exact = N(z(band[1])) - N(z(band[0]));
    assert.ok(Math.abs(r.m.oddsAtLeast(x) - exact) < 4e-3, `x ${x}: ${r.m.oddsAtLeast(x)} vs ${exact}`);
  }
  assert.ok(Math.abs(r.m.oddsAtLeast(-1000) - 1) < 1e-9 && r.m.oddsAtLeast(1.0001) < 1e-9);
  assert.ok(r.m.curve.every((pt, i, a) => i === 0 || pt.odds <= a[i - 1].odds + 1e-12), "the curve never rises");
});

test("T28 the time path: all kept at expiry with no move, about 1 − √½ half-way", () => {
  const p = straddle({ iv: 0.6 }), max = CAPTURE.findMaxPayoff(p).value;
  const t = CAPTURE.timePath({ value: p.value, S0: 100, years: p.years, days: p.days, maxPayoff: max, x: 0.5 });
  assert.ok(Math.abs(t.curve[t.curve.length - 1].kept - 1) < 1e-12);
  assert.ok(Math.abs(t.atHalf - (1 - Math.SQRT1_2)) < 0.01, `half-way ${t.atHalf}`);
  assert.ok(Math.abs(t.dayToX / p.days - 0.75) < 0.02, `50% kept at ${t.dayToX} of ${p.days} days`);
});

test("T28 a gap mixes in: weights still sum to 1, and a down gap lowers the expected capture", () => {
  const p = straddle({ iv: 0.6 }), r = readings({ position: p, vol: 0.6 });
  const gapped = CAPTURE.withGap({ scenario: r.scenario, chance: 0.1, size: 0.3, side: CAPTURE.GapSide.Down });
  assert.ok(Math.abs(gapped.w.reduce((t, w) => t + w, 0) - 1) < 1e-9);
  const m = CAPTURE.measure({ pnl: p.payoff, scenario: gapped, maxPayoff: r.max });
  assert.ok(m.mean < r.m.mean - 0.1, `${m.mean} vs ${r.m.mean}`);
});

test("T28 growth: no P&L grows nothing; the growth-equivalent capture sits below the expected capture", () => {
  const p = straddle({ iv: 0.8 }), r = readings({ position: p, vol: 0.6 });
  const flat = CAPTURE.growth({ pnl: () => 0, scenario: r.scenario, capitalPerShare: 30, maxPayoff: r.max }).value;
  assert.equal(flat.perCycle, 0);
  const g = CAPTURE.growth({ pnl: p.payoff, scenario: r.scenario, capitalPerShare: 30, maxPayoff: r.max }).value;
  assert.ok(g.equivalentCapture < r.m.mean, `${g.equivalentCapture} vs ${r.m.mean}`);
  const thin = CAPTURE.growth({ pnl: p.payoff, scenario: r.scenario, capitalPerShare: 2, maxPayoff: r.max }).value;
  assert.ok(thin.ruin > 0, "a thin capital can be wiped out");
});

test("T28 empirical: steady closes give one move; too few closes say so", () => {
  const closes = Array.from({ length: 200 }, (_, i) => 100 * Math.pow(1.001, i));
  const e = CAPTURE.fromCloses({ S0: 50, closes, days: 7 });
  assert.equal(e.ok, true);
  assert.ok(Array.from(e.value.S).every(S => Math.abs(S - 50 * Math.pow(1.001, 5)) < 1e-9));
  assert.equal(CAPTURE.fromCloses({ S0: 50, closes: closes.slice(0, 20), days: 7 }).ok, false);
  assert.equal(JSON.stringify(CAPTURE.parseCloses("10, 11\n12 x 13;14")), "[10,11,12,13,14]");
});

test("T28 managed: exits add up, a 50% take profit is hit often, and with no rule it is the held mean", () => {
  const p = straddle({ iv: 0.6 }), max = CAPTURE.findMaxPayoff(p).value;
  const base = { value: p.value, payoff: p.payoff, S0: 100, years: p.years, days: p.days, vol: 0.6, maxPayoff: max };
  const none = CAPTURE.managed({ ...base, takeProfit: 0, stopLoss: 0 }).value, r = readings({ position: p, vol: 0.6 });
  assert.ok(Math.abs(none.mean - r.m.mean) < 0.05, `${none.mean} vs ${r.m.mean}`);
  const rule = CAPTURE.managed({ ...base, takeProfit: 0.5, stopLoss: 2 }).value;
  assert.ok(rule.takeProfitShare > 0.3 && rule.meanDays < p.days, `${rule.takeProfitShare} · ${rule.meanDays}`);
});

test("T28 on a listed position: the implied distribution reads, and the expected capture matches the closed-form EV", () => {
  const b = POS.build({ inst: { id: "KORU" }, exp: "20261016", structure: "straddle", legs: "together", basis: "delta", values: { center: "atm", put: 50, call: 50 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" });
  const vol = INST.base("KORU").hv, max = CAPTURE.findMaxPayoff({ payoff: S => POS.payoff(b, S), strikes: b.legs.map(l => l.K), S0: b.S }).value;
  const m = CAPTURE.measure({ pnl: S => POS.payoff(b, S), scenario: CAPTURE.lognormal({ S0: b.S, vol, years: b.T }), maxPayoff: max });
  const ev = RECOVERY.expectedPnl({ built: b, vol });
  assert.ok(Math.abs(m.mean - ev / max) < 2e-3, `${m.mean} vs ${ev / max}`);
});

// review round: centring, parsing, open bands, wipe-outs, the edge masses
test("T28 managed with a log move mu and no rule is the held mean of the same median-centred scenario", () => {
  const p = straddle({ iv: 0.6, days: 7 }), max = CAPTURE.findMaxPayoff(p).value, mu = Math.log(1.02);
  const held = CAPTURE.measure({ pnl: p.payoff, scenario: CAPTURE.lognormal({ S0: 100, vol: 0.5, years: p.years, mu }), maxPayoff: max }).mean;
  const r = CAPTURE.managed({ value: p.value, payoff: p.payoff, S0: 100, years: p.years, days: p.days, vol: 0.5, maxPayoff: max, takeProfit: 0, stopLoss: 0, mu }).value;
  assert.ok(Math.abs(r.mean - held) < 1e-9, `${r.mean} vs ${held}: the control variate makes no rule exact`);
  const ruled = CAPTURE.managed({ value: p.value, payoff: p.payoff, S0: 100, years: p.years, days: p.days, vol: 0.5, maxPayoff: max, takeProfit: 0.5, stopLoss: 2, mu }).value;
  assert.ok(ruled.error > 0 && ruled.error < 0.05, `standard error ${ruled.error}`);
});

test("T28 closes: a decimal comma per line is one number; misread jumps are counted", () => {
  assert.equal(JSON.stringify(CAPTURE.parseCloses("21,42\n21,87\n2026-01-05,22.10")), "[21.42,21.87,22.1]");
  const c = CAPTURE.checkCloses([21, 21.4, 74, 21.5]);
  assert.equal(c.count, 4); assert.equal(c.jumps, 2);
});

test("T28 the keep band has open ends where every farther price keeps x", () => {
  const shortPut = CAPTURE.fromLegs({ S0: 100, days: 30, iv: 0.6, rate: 0, price: bs0, legs: [{ K: 95, cp: "P", qty: -1 }] });
  const max = CAPTURE.findMaxPayoff(shortPut).value, band = CAPTURE.findKeepBand({ payoff: shortPut.payoff, maxPayoff: max, x: 0.5, S0: 100 });
  assert.ok(band[0] > 80 && band[0] < 95 && band[1] === null, JSON.stringify(band));
});

test("T28 growth with a wipe-out chance is flagged, and the cycles without one are reported apart", () => {
  const p = straddle({ iv: 0.6 }), r = readings({ position: p, vol: 0.6 });
  const g = CAPTURE.growth({ pnl: p.payoff, scenario: r.scenario, capitalPerShare: 2, maxPayoff: r.max }).value;
  assert.equal(g.isRuinous, true);
  assert.ok(Number.isFinite(g.survivorCapture) && g.survivorPerCycle > g.perCycle);
  const safe = CAPTURE.growth({ pnl: p.payoff, scenario: r.scenario, capitalPerShare: 100, maxPayoff: r.max }).value;
  assert.equal(safe.isRuinous, false);
});

test("T28 a chain's distribution keeps its edge masses", () => {
  const d = { n: 3, u: [-0.1, 0, 0.1, 0.2], cdf: [0.1, 0.4, 0.8, 0.95] };
  const s = CAPTURE.fromDistribution({ S0: 100, d }).value;
  assert.ok(Math.abs(s.w.reduce((t, w) => t + w, 0) - 1) < 1e-12);
  assert.ok(Math.abs(s.w[0] - 0.1) < 1e-12 && Math.abs(s.w[s.w.length - 1] - 0.05) < 1e-12);
});
