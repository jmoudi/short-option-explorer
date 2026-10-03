// T29 the payoff lenses' math (ui_lens.js): break-even edges, a day's break-even move, the profit zone, the EV cells
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { load } = require("./load.js");
const fs = require("fs"), path = require("path");
const MODEL = ["dist.js", "inst.js", "rule.js", "pos.js", "cmp.js", "state.js", "ctx.js", "recovery.js", "manage.js", "capture.js", "ui_lens.js"];
const { LENSES, N, DIST } = load(null, { files: MODEL.filter(f => fs.existsSync(path.join(__dirname, "..", f))) });
const { findEdge, readDayBreakEvens, readZone, readEvCells } = LENSES.math;

const bs0 = (S, K, T, s, cp) => {
  if (!(T > 0)) { return cp === "C" ? Math.max(0, S - K) : Math.max(0, K - S); }
  const v = s * Math.sqrt(T), d1 = Math.log(S / K) / v + v / 2, d2 = d1 - v;
  return cp === "C" ? S * N(d1) - K * N(d2) : K * N(-d2) - S * N(-d1);
};
// a short ATM straddle at strike 100 sold at implied vol iv with T years: P&L per share at a price and time left
const shortStraddle = ({ iv, T }) => {
  const credit = bs0(100, 100, T, iv, "P") + bs0(100, 100, T, iv, "C");
  return { credit, value: (x, tau) => credit - bs0(x, 100, tau, iv, "P") - bs0(x, 100, tau, iv, "C") };
};

test("T29 findEdge finds the first sign change either way, and says what a start at or below zero means", () => {
  const f = m => 0.1 - m * m, root = Math.sqrt(0.1);
  assert.ok(Math.abs(findEdge({ f, direction: 1, limit: 1, step: 0.01, atStart: NaN }) - root) < 1e-9);
  assert.ok(Math.abs(findEdge({ f, direction: -1, limit: 1, step: 0.01, atStart: NaN }) + root) < 1e-9);
  assert.equal(findEdge({ f: () => -1, direction: 1, limit: 1, step: 0.01, atStart: 0 }), 0);
  assert.ok(Number.isNaN(findEdge({ f: () => 1, direction: 1, limit: 0.5, step: 0.01, atStart: 0 })), "no edge inside the limit");
});

test("T29 a short straddle's day break-even moves: their geometric mean is one implied day (decay pays for a 1σ day)", () => {
  const iv = 0.8, T = 30 / 365, day = 1 / 365, { value } = shortStraddle({ iv, T });
  const be = readDayBreakEvens({ value, price: 100, tauBefore: T, tauAfter: T - day });
  const oneDay = iv * Math.sqrt(day);
  assert.ok(be.decay > 0, "the day's decay is a gain for the short");
  // the straddle carries a small delta (2N(d1) − 1 > 0 at the strike), so the two edges differ; their product is the
  // theta–gamma identity: up·|down| = 2θdt / Γ = σ²dt at zero rate
  assert.ok(be.up < -be.down, "short delta: an up move costs sooner");
  assert.ok(Math.abs(Math.sqrt(be.up * -be.down) / oneDay - 1) < 0.05, `√(up·down) ${Math.sqrt(be.up * -be.down)} vs ${oneDay}`);
});

test("T29 at expiry the profit zone of a short straddle is the strike ± the credit", () => {
  const { credit, value } = shortStraddle({ iv: 0.6, T: 20 / 365 });
  const z = readZone({ value, price: 100, tau: 0 });
  assert.ok(Math.abs(z.lo + credit / 100) < 1e-8 && Math.abs(z.hi - credit / 100) < 1e-8, JSON.stringify(z));
  const losing = readZone({ value: () => -1, price: 100, tau: 0 });
  assert.ok(Number.isNaN(losing.lo) && Number.isNaN(losing.hi), "no profit at the price: no zone");
});

test("T29 the EV cells carry all the probability and their total is the expectation", () => {
  const vol = 0.9, t = 0.1, cdf = m => DIST.lognormalCdf({ x: m, vol, t }), span = 4.5 * vol * Math.sqrt(t);
  const ones = readEvCells({ value: () => 1, cdf, span });
  assert.ok(Math.abs(ones.total - 1) < 1e-12, "masses add to 1 (the edge cells carry the tails)");
  // E[S_t / S − 1] = 0 under the zero-drift lognormal (up to the tails folded into the edge cells)
  const ret = readEvCells({ value: m => Math.exp(m) - 1, cdf, span });
  assert.ok(Math.abs(ret.total) < 2e-3, `mean return ${ret.total}`);
  assert.equal(ret.cells[ret.cells.length - 1].running, ret.total);
});
