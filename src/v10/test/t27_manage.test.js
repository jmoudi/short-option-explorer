// T27 the management simulator: holding is exact, the rule's exits add up, a stop cuts the tail, seeds agree
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js");
const { POS, MANAGE, RECOVERY, INST } = load();
const build = over => POS.build(Object.assign({ inst: { id: "KORU" }, exp: "20261016", structure: "strangle", legs: "together", basis: "delta",
  values: { center: "atm", put: 20, call: 20 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" }, over));
const vol = INST.base("KORU").hv, strangle = build({});

test("T27 holding to expiry is the closed-form EV; with no rule, managed = held", () => {
  const r = MANAGE.simulate({ built: strangle, vol, takeProfit: 0, stopLoss: 0 });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.value.heldMean - RECOVERY.expectedPnl({ built: strangle, vol })) < 1e-12);
  assert.equal(r.value.expiry.share, 1);
  assert.ok(Math.abs(r.value.managedMean - r.value.heldMean) < 1e-9, `${r.value.managedMean} vs ${r.value.heldMean}`);
});

test("T27 the exits add up, a stop cuts the worst 5%, and the take profit closes earlier", () => {
  const v = MANAGE.simulate({ built: strangle, vol, takeProfit: 0.5, stopLoss: 2 }).value;
  assert.ok(Math.abs(v.takeProfit.share + v.stop.share + v.expiry.share - 1) < 1e-12);
  assert.ok(v.managedWorst > v.heldWorst, `${v.managedWorst} vs ${v.heldWorst}`);
  assert.ok(v.meanDays < v.days && v.takeProfit.meanDay < v.days);
});

test("T27 two seeds agree within four standard errors", () => {
  const a = MANAGE.simulate({ built: strangle, vol, takeProfit: 0.5, stopLoss: 2, seed: 11 }).value;
  const b = MANAGE.simulate({ built: strangle, vol, takeProfit: 0.5, stopLoss: 2, seed: 12 }).value;
  assert.ok(Math.abs(a.managedMean - b.managedMean) < 4 * Math.hypot(a.managedError, b.managedError), `${a.managedMean} vs ${b.managedMean}`);
});

test("T27 a net debit has no credit to take a share of", () => {
  const debit = POS.build(Object.assign({}, { inst: { id: "KORU" }, exp: "20261016", structure: "strangle", legs: "together", basis: "delta", values: { center: "atm", put: 20, call: 20 }, wings: { call: { on: false, value: 15 }, put: { on: false, value: 15 } }, fill: "mid" }, { fills: { put: { tk: "KORU", exp: "20261016", K: strangle.sp.K, cp: "P", px: 0 }, call: { tk: "KORU", exp: "20261016", K: strangle.sc.K, cp: "C", px: 0 } } }));
  const r = MANAGE.simulate({ built: debit, vol, takeProfit: 0.5, stopLoss: 2 });
  assert.equal(r.ok, false); assert.equal(r.error.code, "net_debit");
});
