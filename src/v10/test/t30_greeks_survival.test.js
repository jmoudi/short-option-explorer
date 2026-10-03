// T30 the pit-trader round: Greeks now (POS.greeks) and the size that survives (CAPTURE growth's survivalScale)
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js");
const { POS, CAPTURE, INST } = load();

const build = ({ tk = "KORU", exp = "20261016", structure = "strangle", put = 30, call = 30 }) => POS.build({ inst: { id: tk }, exp, structure, legs: "together", basis: "delta",
  values: { center: "atm", put, call }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" });

test("T30 a short strangle's Greeks: short gamma and vega, long theta, and vega matches the legs' Black-76 vega", () => {
  const b = build({}), g = POS.greeks(b);
  assert.ok(g.theta > 0, `theta ${g.theta}`);
  assert.ok(g.vega < 0, `vega ${g.vega}`);
  assert.ok(g.gamma1 < 0, `gamma ${g.gamma1}`);
  assert.ok(Math.abs(g.dollarDelta - g.delta * b.S) < 1e-9);
  // vega is the legs' Black-76 vega (b.vega, $ per IV point per contract): one source with the sizing and the table;
  // a ±1 point bump of every leg's IV through the model lands within a few % of it
  assert.equal(g.vega, b.vega);
  const bump = ivs => POS.val(b, b.S, b.T, Object.assign({}, POS.NOSHOCK, { ivs })) * 100;
  assert.ok(Math.abs((bump(1) - bump(-1)) / 2 / b.vega - 1) < 0.05, `${(bump(1) - bump(-1)) / 2} vs ${b.vega}`);
  assert.ok(Math.abs(g.dollarGamma1 - g.gamma1 * b.S) < 1e-9);
});

test("T30 a straddle centred at the money has a small delta; Greeks are NaN for an n/a position", () => {
  const b = build({ structure: "straddle" }), g = POS.greeks(b);
  assert.ok(Math.abs(g.delta) < 25, `delta ${g.delta} shares`);
  const na = POS.greeks({ na: true });
  assert.ok(Number.isNaN(na.delta) && Number.isNaN(na.theta) && Number.isNaN(na.vega));
});

test("T30 theta pays for gamma: one day's theta ≈ ½ · |gamma dollars| · (a 1σ day)² at the model's vol", () => {
  const b = build({ structure: "straddle" }), g = POS.greeks(b);
  const sigmaDay = b.E.atm * Math.sqrt(b.T / b.dte);
  // gamma1 is shares per 1% move: Γ (per $) = gamma1 / (0.01 S); ½ Γ (σ_day S)² dollars
  const gammaPerDollar = g.gamma1 / (0.01 * b.S), implied = 0.5 * Math.abs(gammaPerDollar) * (sigmaDay * b.S) ** 2;
  assert.ok(Math.abs(g.theta / implied - 1) < 0.35, `theta ${g.theta} vs ½Γσ²S² ${implied}`);
});

test("T30 the size that survives: just under it the wipe-out odds are at or under the floor, just over it they are not", () => {
  const b = build({}), vol = INST.base("KORU").hv;
  const scenario = CAPTURE.lognormal({ S0: b.S, vol, years: b.T }), pnl = S => POS.payoff(b, S), max = b.cr;
  const capitalPerShare = b.margin / 2;
  const g = CAPTURE.growth({ pnl, scenario, capitalPerShare, maxPayoff: max }).value;
  assert.ok(Number.isFinite(g.survivalScale) && g.survivalScale > 0, `${g.survivalScale}`);
  const at = scale => CAPTURE.growth({ pnl, scenario, capitalPerShare: capitalPerShare / scale, maxPayoff: max }).value;
  assert.equal(at(g.survivalScale * 0.98).isRuinous, false, "just under the size: survives");
  assert.equal(at(g.survivalScale * 1.05).isRuinous, true, "over it: ends at zero");
  assert.equal(g.isRuinous, g.survivalScale < 1, "ruinous exactly when the size that survives is below this size");
});
