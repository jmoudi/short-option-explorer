// T31 the pit-trader round, loop 3: one way to print a zero and thousands in every reading unit, one size statement
// for every case, one survival sentence (at least $X of capital, N× its base), and the margin call in words
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { load, V9 } = require("./load.js");
const { STATE, CTX, SURVIVAL, ctx } = load();
vm.runInContext(["compound_engine.js", "compound_stress.js"].map(f => fs.readFileSync(path.join(V9, f), "utf8")).join("\n"), ctx);
const COMPOUND_STRESS = vm.runInContext("COMPOUND_STRESS", ctx), COMPOUND_ENGINE = vm.runInContext("COMPOUND_ENGINE", ctx);
const withPrefs = patch => STATE.applyChange(STATE.defaults(), s => { Object.assign(s.prefs, patch); });

test("T31 dollars: thousands are separated, a zero is $0, small values keep cents", () => {
  const C = CTX.ctx9(withPrefs({ units: "usd" })), per = v => v / (C.A.S * 100);
  assert.equal(C.fU(per(1117.4)), "+$1,117");
  assert.equal(C.fU(per(-25378)), "−$25,378");
  assert.equal(C.fU(per(4.567)), "+$4.57");
  assert.equal(C.fU(0), "$0");
  assert.equal(C.fUt(per(-1500), per(500)), "−$1,500");
});

test("T31 multiples of credit and %: a zero is 0× / 0%, and an axis keeps its step's decimals below 1×", () => {
  const C = CTX.ctx9(withPrefs({ units: "cr" })), cr = x => x * C.A.tv / C.A.S;
  assert.equal(C.fU(0), "0×");
  assert.equal(C.fUt(0, cr(0.25)), "0×");
  assert.equal(C.fUt(cr(0.5), cr(0.25)), "+0.50×");
  assert.equal(C.fUt(cr(-0.25), cr(0.25)), "−0.25×");
  const P = CTX.ctx9(withPrefs({ units: "pct" }));
  assert.equal(P.fU(0), "0%");
  assert.equal(P.fU(1e-9), "0%");
});

test("T31 the size statement covers every case: sized, one for one, and a side that is n/a", () => {
  const C = CTX.ctx9(STATE.defaults());
  assert.ok(C.sizeWords().length > 0, "the default pair is sized across tickers");
  assert.equal(C.sizeStatement(), C.sizeWords());
  const same = STATE.applyChange(STATE.defaults(), s => { s.comparison.B = JSON.parse(JSON.stringify(s.comparison.A)); s.comparison.sizing.rule = "notional"; });
  const C1 = CTX.ctx9(same);
  if (C1.sizeWords() === "") assert.match(C1.sizeStatement(), /^B is held one contract per A contract \(equal notional\)$/);
  assert.match(C.ruleWords, /equal|your size/);
});

test("T31 the survival sentence: at least the capital a contract needs at the printed size, and its multiple of the base", () => {
  assert.equal(SURVIVAL.capital({ usd: 1117.2, tk: "RAM", multiple: 1.62, base: "margin" }), "at least $1,118 of capital a RAM contract, 1.7× its margin"); // the multiple rounds up
  assert.equal(SURVIVAL.capital({ usd: NaN, tk: "RAM" }), "");
  const line = SURVIVAL.line({ scale: 0.6123, test: "this 2σ hit", capital: "at least $1,118 of capital a RAM contract", plain: true });
  assert.equal(line, "survives this 2σ hit at ≤\u00a00.61×\u00a0this size (at least $1,118 of capital a RAM contract)");
  assert.match(SURVIVAL.line({ scale: 0.5, test: "x" }), /<b>≤\u00a00\.50×\u00a0this size<\/b>/);
  assert.equal(SURVIVAL.line({ scale: 0, test: "this hit" }), "no size survives this hit");
});

test("T31 the margin call in words: strangles buy contracts back (and sell assigned shares only when there are some)", () => {
  const fx = x => "$" + x;
  const str = { ev: { call: { day: 3, x: 33.74, kHeld: 10, kBack: 4 }, kBack: 4, sold: 0, n0: 0, closedAt: null } };
  assert.equal(COMPOUND_STRESS.callWords(str, false, fx), "day 3 at $33.74, bought back 4 of 10 contracts");
  const later = { ev: { call: { day: 3, x: 30, kHeld: 10, kBack: 4 }, kBack: 7, sold: 200, n0: 0, closedAt: { el: 9 } } };
  assert.equal(COMPOUND_STRESS.callWords(later, false, fx), "day 3 at $30, bought back 7 contracts, sold 200 assigned shares · position closed");
  const cc = { ev: { call: { day: 2, x: 15 }, kBack: 3, sold: 300, n0: 1000, closedAt: null } };
  assert.equal(COMPOUND_STRESS.callWords(cc, true, fx), "day 2 at $15, sold 30% of the shares and their calls");
  assert.equal(COMPOUND_STRESS.callWords({ ev: { call: null } }, true, fx), "none");
});

test("T31 the run's definition words come from one place (the page and the export read the engine's)", () => {
  const W = COMPOUND_ENGINE.WORDS, run = { tk: "KORU", cad: "wk", fam: "cc", cd: 30, pd: 30, puts: false, lev: 1.2, use: 0.5, modus: { credit: "cash", call: "ibkr", move: "keep" } };
  assert.equal(W.name(run), "KORU weekly covered calls");
  assert.equal(W.def(run), "KORU · weekly · covered calls · call 30Δ · 1.20× leverage");
  assert.equal(W.modus(run.modus), "keep as cash · IBKR minimum · keeps trading");
  assert.equal(W.def({ ...run, fam: "str", cd: 20, pd: 20, use: 0.5, wcd: 5, wpd: 0 }), "KORU · weekly · strangle + wings · put 20Δ / call 20Δ · 50% of margin · wings 5Δ call");
});
