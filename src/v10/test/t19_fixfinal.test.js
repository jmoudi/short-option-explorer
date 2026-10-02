// T19 (final fix round): the pure parts of
//   2. A and B summary cards shorten together (SUM9.commonStages);
//   3. comparison table: zero-safe fN / fP and the A / B ratio over a B value that prints as zero;
//   4. payoff ticks on a lopsided range;
//   8. recovery headline always in weeks (the view counts weeks), four-digit years in dates more than ten years out;
//   1. B's line-2 multiplier is B contracts per A contract.
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, V9 } = require("./load.js");
const L = load();
vm.runInContext(fs.readFileSync(path.join(V9, "ui_views.js"), "utf8") + "\n;globalThis.__v = {VIEWS};", L.ctx, { filename: "ui_views.js" });
vm.runInContext(fs.readFileSync(path.join(V9, "ui_summary.js"), "utf8") + "\n;globalThis.__s = {SUM9};", L.ctx, { filename: "ui_summary.js" });
const { VIEWS } = L.ctx.__v, { SUM9 } = L.ctx.__s, { STATE, CTX } = L;
const ops = (S, list) => { for (const [o, ...a] of list) S = STATE.cmpOp(S, o, ...a).state; return S; };
const MINUS = "−";

// ---------------------------------------------------------------- 2. shared shortening
// a line is a base width plus what each stage saves; it fits when the width is within the card's budget
const model = cards => ({
  fits: (i, set) => cards[i].base - set.reduce((t, f) => t + (cards[i].save[f] || 0), 0) <= cards[i].budget,
  // the card's own pass, as ownStages: apply in order while over, then give back (latest first, all but the last)
  own(i, order, keep) {
    const on = [];
    for (const f of order) if (!this.fits(i, on)) on.push(f);
    for (const f of on.slice(0, -1).reverse()) if (!keep.includes(f)) { const t = on.filter(g => g !== f); if (this.fits(i, t)) on.splice(on.indexOf(f), 1); }
    return order.filter(f => on.includes(f));
  }
});
test("T19 (2): both cards get one stage set: every card fits, keep-stages stay, no stage can be given back", () => {
  const order = SUM9.L1F, keep = ["f20"];
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let n = 0, differed = 0;
  for (let k = 0; k < 4000; k++) {
    const cards = [0, 1].map(() => ({ base: 500 + rnd() * 120, budget: 535, save: Object.fromEntries(order.map(f => [f, 4 + rnd() * 40])) }));
    const M = model(cards), own = [0, 1].map(i => M.own(i, order, keep));
    if (!own.every((s, i) => M.fits(i, s))) continue;   // a card that needs the ellipsis even with every stage
    n++;
    if (own[0].join() !== own[1].join()) differed++;
    const U = SUM9.commonStages(order, own, set => [0, 1].every(i => M.fits(i, set)), keep);
    assert.ok([0, 1].every(i => M.fits(i, U)), "both cards fit with the shared set");
    assert.deepEqual([...U], [...order.filter(f => U.includes(f))], "kept in stage order");
    for (const f of U) assert.ok(own.some(s => s.includes(f)), `${f} came from some card's own set`);
    for (const f of keep) if (own.some(s => s.includes(f))) assert.ok(U.includes(f), `${f} is never given back`);
    for (const f of U) if (!keep.includes(f)) assert.ok(![0, 1].every(i => M.fits(i, U.filter(g => g !== f))), `${f} could be given back`);
  }
  assert.ok(n > 2000 && differed > 300, `cases ${n}, differing own sets ${differed}`);
});
test("T19 (2): the verifier's case: A needs only 20px, B also drops 'short' -> both drop 'short' at 20px", () => {
  const cards = [{ base: 540, budget: 535, save: { f20: 10, fa: 30, fw: 25, fx: 8 } }, { base: 570, budget: 535, save: { f20: 12, fa: 30, fw: 25, fx: 8 } }];
  const M = model(cards), own = [0, 1].map(i => M.own(i, SUM9.L1F, ["f20"]));
  assert.deepEqual([...own[0]], ["f20"]); assert.deepEqual([...own[1]], ["f20", "fa"]);
  assert.deepEqual([...SUM9.commonStages(SUM9.L1F, own, set => [0, 1].every(i => M.fits(i, set)), ["f20"])], ["f20", "fa"]);
  // line 2: B drops the % of spot and "net"; A follows
  const c2 = [{ base: 520, budget: 535, save: { f1: 10, f3: 40, f4: 20 } }, { base: 590, budget: 535, save: { f1: 10, f2: 5, f3: 40, f4: 20 } }];
  const M2 = model(c2), own2 = [0, 1].map(i => M2.own(i, SUM9.L2F, []));
  assert.deepEqual([...own2[0]], []);
  assert.deepEqual([...SUM9.commonStages(SUM9.L2F, own2, set => [0, 1].every(i => M2.fits(i, set)), [])], [...own2[1]]);
});
test("T19 (2): nothing to shorten -> nothing applied", () => {
  assert.deepEqual([...SUM9.commonStages(SUM9.L2F, [[], []], () => true, [])], []);
});

// ---------------------------------------------------------------- 3. zero-safe table formatters and the ratio cell
test("T19 (3): fN0 / fP0 print a value that rounds to zero unsigned, keep real signs", () => {
  const { fN0, fP0 } = VIEWS;
  assert.equal(fN0(-6.7e-16, 3), "0.000"); assert.equal(fN0(-0.0004, 3), "0.000"); assert.equal(fN0(-0.03, 3), MINUS + "0.030");
  assert.equal(fN0(0.417, 3), "0.417"); assert.equal(fN0(NaN, 3), "–");
  assert.equal(fP0(-0.0003, 1), "0.0%"); assert.equal(fP0(-6.7e-16, 1), "0.0%"); assert.equal(fP0(-0.137, 1), MINUS + "13.7%"); assert.equal(fP0(0.127, 1), "12.7%");
  for (const v of [-1e-9, -4.9e-4, -1e-12]) { assert.ok(!fN0(v, 3).startsWith(MINUS)); assert.ok(!fP0(v / 100, 1).startsWith(MINUS)); }
});
test("T19 (3): the A / B cell is '–' when B prints as zero at its precision, a ratio otherwise", () => {
  const { ratioTxt, zeroTxt, fN0, fP0 } = VIEWS, f3 = v => fN0(v, 3), p1 = v => fP0(v, 1);
  for (const t of ["0.000", "0.0%", "$0", "0.00×", "0.00%"]) assert.ok(zeroTxt(t), t);
  for (const t of ["0.001", "−0.4%", "$10", "1.00×", "–", ""]) assert.ok(!zeroTxt(t), t);
  assert.equal(ratioTxt(-0.03, -0.00004, f3), "–");
  assert.equal(ratioTxt(-0.137, -0.0001, p1), "–");
  assert.equal(ratioTxt(0.5, 0.25, f3), "2.00×");
  assert.equal(ratioTxt(1e-5, 0.3, f3), "0.00×");
  assert.equal(ratioTxt(1, 0, f3), "–"); assert.equal(ratioTxt(NaN, 1, f3), "–"); assert.equal(ratioTxt(1, NaN, f3), "–");
  assert.equal(ratioTxt(1, 1e-13), "–", "no formatter: only the exact-zero guard");
  assert.equal(ratioTxt(1, 1e-6), "1000000.00×");
});
test("T19 (3): the verifier's repros: A's −6.7e-16 time value prints unsigned; B's ~0 time value gives '–' ratios", () => {
  const R1 = [["setA", "inst.id", "RAM"], ["setA", "exp", "20261016"], ["setA", "structure", "strangle"], ["setA", "basis", "sigma"], ["setA", "legs", "detached"], ["setA", "values", { put: -0.4694762468338012, call: 1.0535299718379978 }], ["setA", "wings.put.on", true], ["setA", "wings.put.value", 0.6557188987731933], ["setB", "values", { put: -0.049648886919021584, call: -0.41240890026092525 }]];
  const R2 = [["setA", "inst.id", "KORU"], ["setA", "exp", "20261218"], ["setA", "structure", "straddle"], ["setA", "basis", "money"], ["setA", "wings.call.on", true], ["setA", "wings.call.value", 13.3476], ["setA", "wings.put.on", true], ["setA", "wings.put.value", 8.3375], ["setA", "fill", "nat"], ["setB", "inst.id", "KORU"], ["setB", "inst.spot", 24.7592], ["setB", "inst.ivShift", 4], ["setB", "wings.call.on", true]];
  const C1 = CTX.ctx9(ops(STATE.defaults(), R1)), A = C1.A;
  assert.ok(Math.abs(A.tv) < 1e-9, `A tv ${A.tv}`);
  assert.equal(VIEWS.fN0(A.tv / (A.S * A.sig), 3), "0.000");
  assert.equal(VIEWS.fP0(A.tv / A.margin, 1), "0.0%");
  const C2 = CTX.ctx9(ops(STATE.defaults(), R2)), B = C2.B, f3 = v => VIEWS.fN0(v, 3), p1 = v => VIEWS.fP0(v, 1);
  assert.ok(Math.abs(B.tv) < 0.005, `B tv ${B.tv}`);
  {   // the repro's B time value (−0.00052) prints as zero in every row
    assert.equal(VIEWS.ratioTxt(C2.A.tv / C2.A.S, C2.h * B.tv / B.S, C2.fU), "–");
    assert.equal(VIEWS.ratioTxt(C2.A.tv / (C2.A.S * C2.A.sig), B.tv / (B.S * B.sig), f3), "–");
    assert.equal(VIEWS.ratioTxt(C2.A.tv / C2.A.S / C2.A.dte, C2.h * B.tv / B.S / B.dte, v => C2.fU(v, 3)), "–");
    assert.equal(VIEWS.ratioTxt(C2.A.tv / C2.A.margin, B.tv / B.margin, p1), "–");
  }
});

// ---------------------------------------------------------------- 4. payoff ticks
test("T19 (4): a lopsided payoff range gets a tick on its short side; a balanced one is unchanged", () => {
  const { payTicks } = VIEWS;
  const t = payTicks(-1.27, 0.41, 6, 270).map(x => x.v);
  assert.ok(t.some(v => v > 0), `ticks ${t}`);
  assert.ok(t.filter(v => v > 0).every(v => v <= 0.41 && v / 1.68 * 270 >= 14));
  const tn = payTicks(-0.41, 1.27, 6, 270).map(x => x.v);
  assert.ok(tn.some(v => v < 0), `ticks ${tn}`);
  const b = payTicks(-0.5, 0.5, 6, 270);
  assert.ok(b.every(x => Math.abs(x.step - 0.2) < 1e-12), "a balanced range keeps one step");
  assert.deepEqual([...b.map(x => x.v)], [-0.4, -0.2, 0, 0.2, 0.4]);
  // a side under 12% of the range gets no extra tick
  assert.ok(!payTicks(-1, 0.1, 6, 270).some(x => x.v > 0));
});

// ---------------------------------------------------------------- 8. recovery headline
test("T19 (8): the recovery time always reads in weeks, with whole cycles", () => {
  const id = d => String(d);
  assert.equal(VIEWS.recTime(95.3, 169, 0.5, id).v, `${(96 * 169 / 7).toFixed(1)} wk`);
  assert.equal(VIEWS.recTime(95.3, 169, 0.5, id).s, "96 cycles");
  assert.equal(VIEWS.recTime(103, 7, 0.5, id).v, "103.0 wk");
  assert.equal(VIEWS.recTime(104, 7, 0.5, id).v, "104.0 wk");
  assert.equal(VIEWS.recTime(2.5, 50, 0.3, id).v, `${(3 * 50 / 7).toFixed(1)} wk`);
});
test("T19 (8): recovery dates carry a four-digit year more than ten years out", () => {
  const t0 = Date.UTC(2026, 9, 2);
  assert.equal(L.calendar.formatDayAfter({ startMs: t0, days: 0 }), "2 Oct");
  assert.equal(L.calendar.formatDayAfter({ startMs: t0, days: 30 }), "1 Nov");
  assert.match(L.calendar.formatDayAfter({ startMs: t0, days: 150 }), /^\d{1,2} [A-Z][a-z]{2} 27$/);
  assert.match(L.calendar.formatDayAfter({ startMs: t0, days: 3652 }), /^\d{1,2} [A-Z][a-z]{2} 36$/);
  assert.match(L.calendar.formatDayAfter({ startMs: t0, days: 3653 }), /^\d{1,2} [A-Z][a-z]{2} 2036$/);
  assert.match(L.calendar.formatDayAfter({ startMs: t0, days: 96 * 169 }), /^\d{1,2} [A-Z][a-z]{2} 2071$/);
});

// ---------------------------------------------------------------- 1. B contracts per A contract
test("T19 (1): B's multiplier is B contracts per A contract (h · S_A / S_B), = h on one instrument", () => {
  const C = CTX.ctx9(STATE.defaults());
  assert.ok(!C.same);
  assert.ok(Math.abs(SUM9.contractsK(C) - C.h * C.A.S / C.B.S) < 1e-12);
  assert.ok(Math.abs(SUM9.contractsK(C) - C.h) > 0.05, "RAM vs KORU: contracts differ from the notional ratio");
  const C1 = CTX.ctx9(ops(STATE.defaults(), [["setB", "inst.id", C.A.inst.id]]));
  assert.ok(C1.same); assert.ok(Math.abs(SUM9.contractsK(C1) - C1.h) < 1e-12);
});
