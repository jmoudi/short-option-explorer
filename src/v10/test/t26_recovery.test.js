// T26 recovery dynamics (PLAN_V10 §2, §7): the three growth rates, q, the honesty figure and the edges, in the model
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js");
const L = load();
const { POS, RECOVERY, INST, STATE } = L;
const position = over => Object.assign({ inst: { id: "KORU" }, exp: "20261016", structure: "straddle", legs: "together", basis: "delta",
  values: { center: "atm", put: 50, call: 50 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" }, over);
const vol = INST.base("KORU").hv;
const straddle = POS.build(position({}));
const reading = (built, hit, extra) => RECOVERY.computeRecovery(Object.assign({ built, vol, hit, capital: "margin", growth: "nohit", typedRate: 0.02 }, extra || {}));
const move = k => ({ basis: "move", k, side: "worse", fraction: 0 });
const fixed = f => ({ basis: "fixed", k: 0, side: "worse", fraction: f });

test("T26 the reference straddle (KORU 16 Oct 21, 1.5σ hit): the plan's figures", () => {
  const r = reading(straddle, move(1.5));
  assert.equal(r.status, "ok");
  assert.ok(Math.abs(r.Lmargin - 0.3208) < 5e-4 && Math.abs(r.Lnotional - 0.2569) < 5e-4, `${r.Lmargin} ${r.Lnotional}`);
  assert.ok(Math.abs(r.q - 0.0501) < 5e-4, `q ${r.q}`);
  assert.ok(Math.abs(r.rates.best - 0.2561) < 5e-4 && Math.abs(r.rates.noHit - 0.03711) < 5e-5 && Math.abs(r.rates.average - 0.02014) < 5e-5);
  assert.ok(Math.abs(r.cycles.noHit - 10.615) < 0.01 && Math.abs(r.cycles.average - 19.39) < 0.02 && Math.abs(r.cycles.best - 1.697) < 0.01);
  assert.equal(r.wholeCycles, 11); assert.ok(Math.abs(r.survival - 0.568) < 0.002); assert.equal(r.isAmber, false);
});

test("T26 the average equals the period-vol EV on margin the rest of the page shows", () => {
  const ev = POS.stats(straddle, L.DIST.make({ expiry: straddle.E, odds: "hv", vol })).ev / straddle.margin;
  assert.ok(Math.abs(reading(straddle, move(1.5)).rates.average - ev) < 1e-6);
});

test("T26 if no such hit never rises as the hit grows, and sits below the average from about 2σ", () => {
  let last = Infinity;
  for (let f = 0.05; f < 0.99; f += 0.05) { const g = reading(straddle, fixed(f)).rates.noHit; assert.ok(Number.isFinite(g) && g <= last + 1e-12, `${f}: ${g} after ${last}`); last = g; }
  const two = reading(straddle, move(2)), twoHalf = reading(straddle, move(2.5));
  assert.ok(Math.abs(two.rates.noHit - 0.0149) < 2e-4 && two.rates.noHit < two.rates.average);
  assert.ok(Math.abs(twoHalf.rates.noHit - 0.0033) < 2e-4);
});

test("T26 at q = 0 the rate is the plain compounded one, negative for the 20Δ condor with 5Δ wings at a 90% hit", () => {
  const condor = POS.build(position({ structure: "strangle", values: { center: "atm", put: 20, call: 20 }, wings: { call: { on: true, value: 5 }, put: { on: true, value: 5 } } }));
  const r = reading(condor, fixed(0.9));
  assert.ok(r.q < 1e-12, `q ${r.q}`);
  assert.ok(Math.abs(r.rates.noHit - (-0.0312)) < 2e-3, `rate ${r.rates.noHit}`);
  assert.equal(r.cycles.noHit, Infinity);
  // a hit at exactly the worst loss (the flat floor) counts as a hit: the floor's own mass is q
  const worst = -r.worst, atFloor = reading(condor, fixed(worst));
  assert.ok(atFloor.q > 0.01, `the floor counts as a hit: q ${atFloor.q}`);
});

test("T26 best case: the credit on margin for straddles and strangles", () => {
  for (const pos of [position({}), position({ structure: "strangle", values: { center: "atm", put: 25, call: 25 } })]) {
    const b = POS.build(pos), r = reading(b, move(1));
    assert.ok(Math.abs(r.rates.best - b.cr / b.margin) < 1e-9, `${b.label.full}: ${r.rates.best} vs ${b.cr / b.margin}`);
  }
});

test("T26 edges: L ≥ 1 is wiped out, no loss needs no recovery, never NaN", () => {
  assert.equal(reading(straddle, move(6)).status, "wiped");
  assert.equal(reading(straddle, fixed(0)).status, "none");
  for (const k of [0.25, 0.5, 1, 2, 3, 4]) for (const capital of ["margin", "notional"]) for (const growth of ["nohit", "avg", "best", "custom"]) {
    const r = reading(straddle, move(k), { capital, growth });
    if (r.status !== "ok") continue;
    for (const v of [r.L, r.q, r.rates.best, r.rates.noHit, r.rates.average, r.growth, r.survival]) assert.ok(!Number.isNaN(v), `${k} ${capital} ${growth}`);
  }
});

test("T26 the quadrature matches a fine midpoint sum of the same integral", () => {
  const capital = straddle.margin, hit = 0.3208, v = vol * Math.sqrt(straddle.T), n = 400000, lo = -10, hi = 10, dz = (hi - lo) / n;
  let mass = 0, logSum = 0;
  for (let i = 0; i < n; i++) {
    const z = lo + (i + 0.5) * dz, S = straddle.S * Math.exp(v * z - 0.5 * v * v), P = POS.payoff(straddle, S) / capital, w = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * dz;
    if (P > -hit + 1e-9) { mass += w; logSum += w * Math.log(1 + P); }
  }
  const brute = Math.exp(logSum / mass) - 1, quad = RECOVERY.ratesFor({ built: straddle, vol, capital, hit }).noHit;
  assert.ok(Math.abs(brute - quad) < 5e-6, `${brute} vs ${quad}`);
});

test("T26 a saved view that chose the old EV growth reads as Average", () => {
  const s = STATE.defaults(), code = STATE.writeViewCode({ state: Object.assign({}, s, { tab: "compare", prefs: Object.assign({}, s.prefs, { rdG: "ev" }) }), yr: null });
  const back = STATE.readViewCode("#" + code);
  assert.equal(back.ok, true); assert.equal(back.value.state.prefs.rdG, "avg");
  assert.equal(STATE.defaults().prefs.rdG, "nohit");
});
