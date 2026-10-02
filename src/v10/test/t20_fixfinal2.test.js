// T20 (final fix round 2): the pure parts of
//   OPEN-1. the A − h·B payoff panel gets a tick on a lopsided side (payTicks on the 92px panel, niceIn);
//   OPEN-2. the Recovery header's growth prints its sign from the printed value, with a typographic minus (growthTxt);
//   OPEN-3. the overview table's Breakevens cell stacks one price per line (besTxt);
//   and the difference strip's "B strikes" text uses the typographic minus (CMP.placeTxt).
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, V9 } = require("./load.js");
const L = load();
vm.runInContext(fs.readFileSync(path.join(V9, "ui_views.js"), "utf8") + "\n;globalThis.__v = {VIEWS, ticks};", L.ctx, { filename: "ui_views.js" });
const { VIEWS, ticks } = L.ctx.__v, { STATE, CTX, CMP, POS } = L;
const ops = (S, list) => { for (const [o, ...a] of list) S = STATE.cmpOp(S, o, ...a).state; return S; };
const MINUS = "−", H2 = 92;

// the A − h·B panel's range exactly as renderPayoff builds it: a 600-step grid plus the strikes, padded by 14%
function diffRange(C) {
  const n = 600, us = Array.from({ length: n + 1 }, (_, i) => C.lo + (C.hi - C.lo) * i / n);
  for (const [b, inv] of [[C.A, C.uOfSA], [C.B, C.uOfSB]]) if (!b.na) for (const l of b.legs) { const u = inv(l.K); if (u > C.lo && u < C.hi) us.push(u); }
  const dys = us.map(u => C.pA(u) - C.pB(u)).filter(Number.isFinite);
  let dlo = Math.min(...dys, 0), dhi = Math.max(...dys, 0); const dp = (dhi - dlo) * 0.14 || 0.005;
  return [dlo - dp, dhi + dp];
}
const sideHasTick = (t, sg) => t.some(v => sg * v > 1e-12);

// ---------------------------------------------------------------- OPEN-1. the A − h·B panel
test("T20 (1): the verifier's two panels get a tick on the side that had none", () => {
  const bCall = [["unlink", "wingCall"], ["setB", "wings.call.on", true]];
  const s9 = [["setA", "inst.id", "RAM"], ["setA", "exp", "20261016"], ["setA", "structure", "strangle"], ["setA", "basis", "delta"], ["setA", "values", { put: 52.483609199523926, call: 32.2972993850708, center: 37.11449909210205 }], ["setA", "wings.call.on", true], ["setA", "wings.call.value", 22.000613689422607], ["setB", "inst.spot", 17.136393567681313]];
  for (const [name, list, sg, want] of [["bCall", bCall, 1, [-0.5, 0, 0.4]], ["s9", s9, -1, [-0.04, 0, 0.05]]]) {
    const [dlo, dhi] = diffRange(CTX.ctx9(ops(STATE.defaults(), list)));
    assert.ok(!sideHasTick(ticks(dlo, dhi, 3), sg), `${name}: the old ticks() left that side bare`);
    const t = Array.from(VIEWS.payTicks(dlo, dhi, 3, H2), x => +x.v.toFixed(6));
    assert.deepEqual(t, want, `${name}: [${dlo}, ${dhi}]`);
  }
});
test("T20 (1): on the 92px panel every side at least 14px tall (and over 12% of the range) carries a tick, inside the range and at least 12px clear of zero", () => {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let checked = 0, viaFallback = 0;
  for (let k = 0; k < 40000; k++) {
    const R = Math.pow(10, -2.5 + rnd() * 3.5), f = rnd() * 0.5, neg = rnd() < 0.5;
    const lo = neg ? -f * R : -(1 - f) * R, hi = lo + R, sg = neg ? -1 : 1;
    const T = VIEWS.payTicks(lo, hi, 3, H2), t = T.map(x => x.v);
    for (const v of t) assert.ok(v >= lo - 1e-12 && v <= hi + 1e-12, `tick ${v} outside [${lo}, ${hi}]`);
    for (const x of T) assert.ok(x.step > 0 && Number.isFinite(x.step));
    if (f > 0.12 && f * H2 >= 14) {
      checked++;
      assert.ok(sideHasTick(t, sg), `no tick on the short side of [${lo}, ${hi}]`);
      const base = ticks(lo, hi, 3), added = t.filter(v => !base.some(w => Math.abs(w - v) < 1e-12));
      for (const v of added) assert.ok(Math.abs(v) / R * H2 >= 12 - 1e-9, `added tick ${v} is ${Math.abs(v) / R * H2}px from zero`);
      if (!sideHasTick(base, sg) && f * H2 < 22) viaFallback++;
    }
  }
  assert.ok(checked > 20000 && viaFallback > 500, `checked ${checked}, short sides ${viaFallback}`);
});
test("T20 (1): where no finer set has a tick, the fallback is the roundest number 12px or more from zero", () => {
  // three page states (seed 4242 #43, #64, #71): the short side is 16–17px, 17px and 14.4px tall
  const t = (lo, hi) => Array.from(VIEWS.payTicks(lo, hi, 3, H2), x => [+x.v.toFixed(6), +x.step.toFixed(6)]);
  assert.deepEqual(t(-0.2547, 1.1488), [[-0.2, 0.2], [0, 0.5], [0.5, 0.5], [1, 0.5]]);
  assert.deepEqual(t(-0.1268, 0.5515), [[-0.1, 0.1], [0, 0.2], [0.2, 0.2], [0.4, 0.2]]);
  assert.deepEqual(t(-1.0121, 0.1847), [[-1, 0.5], [-0.5, 0.5], [0, 0.5], [0.18, 0.02]]);
});
test("T20 (1): niceIn picks the roundest number in the band, and nothing in an empty band", () => {
  const { niceIn } = VIEWS;
  assert.deepEqual({ ...niceIn(0.152, 0.2) }, { v: 0.2, step: 0.2 });
  assert.deepEqual({ ...niceIn(0.152, 0.19) }, { v: 0.18, step: 0.02 });
  assert.deepEqual({ ...niceIn(0.152, 0.159) }, { v: 0.155, step: 0.005 });
  assert.deepEqual({ ...niceIn(14, 49) }, { v: 40, step: 20 });
  assert.equal(niceIn(0.2, 0.1), null); assert.equal(niceIn(0, 1), null); assert.equal(niceIn(NaN, 1), null);
});
test("T20 (1): the main 270px panel is unchanged by the fallback (the old finer-set pass always finds a tick there)", () => {
  let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 20000; k++) {
    const R = Math.pow(10, -2 + rnd() * 3), f = 0.12 + rnd() * 0.38, neg = rnd() < 0.5;
    const lo = neg ? -f * R : -(1 - f) * R, hi = lo + R;
    const t = VIEWS.payTicks(lo, hi, 6, 270), base = ticks(lo, hi, 6), extra = t.filter(x => !base.some(w => Math.abs(w - x.v) < 1e-12));
    assert.ok(extra.length <= 1);
    // an added tick is the outermost of one of the finer nice sets
    for (const x of extra) assert.ok([2, 3, 4, 6].some(m => ticks(lo, hi, 6 * m).some(w => Math.abs(w - x.v) < 1e-12)), `${x.v} from a finer set`);
  }
});

// ---------------------------------------------------------------- OPEN-2. growth a cycle
test("T20 (2): growth prints its sign from the printed value, with a typographic minus", () => {
  const { growthTxt } = VIEWS;
  assert.equal(growthTxt(0.0141), "+1.41%");
  assert.equal(growthTxt(-0.0141), MINUS + "1.41%");
  assert.equal(growthTxt(-0.0796), MINUS + "7.96%");
  for (const g of [0, -0, -0.00004, 0.00004, -1e-12, 1e-12]) assert.equal(growthTxt(g), "0.00%", String(g));
  assert.equal(growthTxt(NaN), "–"); assert.equal(growthTxt(Infinity), "–");
  for (let k = -3000; k <= 3000; k++) { const t = growthTxt(k / 1e6); assert.ok(!t.includes("-"), t); assert.ok(!/^[−+]0\.00%$/.test(t), t); }
});
test("T20 (2): the verifier's repro: B's growth is a hair below zero and prints 0.00%; A's prints with −", () => {
  const REC = [["setA", "inst.id", "RAM"], ["setA", "exp", "20261016"], ["setA", "structure", "strangle"], ["setA", "basis", "sigma"], ["setA", "values", { put: 0.26995048522949217, call: 0.645901107788086, center: 0.7587093353271485 }], ["setA", "wings.call.on", true], ["setA", "wings.call.value", 1.0719598591327668], ["setA", "wings.put.on", true], ["setA", "wings.put.value", 0.7139980852603912]];
  const S = ops(STATE.defaults(), REC), C = CTX.ctx9(S);
  const rB = VIEWS.recRun(C, C.B, "B", S.prefs), rA = VIEWS.recRun(C, C.A, "A", S.prefs);
  assert.ok(rB.g < 0 && rB.g > -0.00005, `B growth ${rB.g}`);
  assert.equal(VIEWS.growthTxt(rB.g), "0.00%");
  assert.equal(VIEWS.growthTxt(rA.g), MINUS + "1.41%");
});

// ---------------------------------------------------------------- OPEN-3. the overview's Breakevens cell
test("T20 (3): the Breakevens cell stacks one price per line, low first; 'none' when there is none", () => {
  const { besTxt } = VIEWS;
  assert.equal(besTxt([12.22, 17.77]), "12.22<br>17.77");
  assert.equal(besTxt([9.5]), "9.50");
  assert.equal(besTxt([]), "none"); assert.equal(besTxt(undefined), "none");
  assert.ok(!besTxt([12.22, 17.77]).includes("/"));
});
test("T20 (3): the overview row a verifier saw cut off: its breakevens come out as two stacked prices", () => {
  const S = ops(STATE.defaults(), [["setA", "values", { put: 62, call: 62 }], ["setA", "wings.call.on", true], ["setA", "wings.put.on", true]]);
  const C = CTX.ctx9(S), cells = VIEWS.ovCells(C);
  assert.ok(cells.length >= 8);
  let stacked = 0;
  for (const c of cells) if (!c.b.na && c.sx && c.sx.bes.length === 2) { stacked++; assert.match(VIEWS.besTxt(c.sx.bes), /^\d+\.\d{2}<br>\d+\.\d{2}$/); }
  assert.ok(stacked >= 8, `rows with two breakevens: ${stacked}`);
});

// ---------------------------------------------------------------- the difference strip's "B strikes" text
test("T20: CMP.placeTxt prints negatives with a typographic minus and a value that rounds to zero unsigned", () => {
  assert.equal(CMP.placeTxt("sigma", { put: 1.08, call: -0.12 }, "strangle"), "1.08 / " + MINUS + "0.12σ");
  assert.equal(CMP.placeTxt("money", { put: 19.8, call: -11.2 }, "strangle"), "19.8 / " + MINUS + "11.2%");
  assert.equal(CMP.placeTxt("money", { put: -0.04, call: 16 }, "strangle"), "0 / 16%");
  assert.equal(CMP.placeTxt("delta", { put: 20, call: 20 }, "strangle"), "20 / 20Δ");
  for (const v of [-11.8, -0.35, -0.004, 0, 3]) assert.ok(!CMP.placeTxt("sigma", { put: v, call: 1 }, "strangle").includes("-"));
});
