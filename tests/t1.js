const Y = require("../yr_engine.js");
const sc = { cap0: 30000, W: 52, S0: 20, mult: Y.pathMult({ mode: "flat" }, 52), iv: 1.3, rv: 1.17 };
const C = c => ({ ...Y.COSTS, grid: { KORU: c, RAM: c } });
const A = (modus, g) => ({ tk: "KORU", cad: "wk", fam: "cc", cd: 30, lev: 1.2, modus });
const B = { tk: "KORU", cad: "wk", fam: "str", cd: 20, pd: 20, use: 0.5 };
const f = r => `med $${(r.end.med/1e3).toFixed(1)}k 10-90 ${(r.end.c10/1e3).toFixed(1)}-${(r.end.c90/1e3).toFixed(1)} called ${(r.end.called*100).toFixed(1)}% sh ${r.end.shMed?.toFixed(0)} k ${r.end.kMed?.toFixed(1)}`;
for (const [lab, run, g] of [["A target cont", A({ call: "target" }), 0], ["A ibkr cont", A({ call: "ibkr" }), 0], ["A target $1", A({ call: "target" }), 1], ["A ibkr $1", A({}), 1], ["A rebal $1", A({ credit: "rebal" }), 1], ["A cash $1", A({ credit: "cash" }), 1], ["B cont", B, 0], ["B $1", B, 1]]) {
  const t0 = Date.now(); const r = Y.runYear(run, sc, C(g)); const ex = Y.runYear(run, sc, C(g), Y.RATES, { literal: true });
  console.log(lab.padEnd(14), f(r), "| exact $" + (ex.end.med / 1e3).toFixed(1) + "k", (Date.now() - t0) + "ms");
}
// identity: realized 0, flat, fractional, frictionless, rates 0, continuous
const C0 = { ...Y.COSTS, give: 0, hsMin: 0, hsPct: 0, comm: 0, commSh: 0, hsSh: 0, liq: 0, whole: false, grid: { KORU: 0 } };
const R0 = { tiered: false, loan: 0, cash: 0, bm: 0 };
for (const cr of ["reinvest", "rebal"]) console.log("identity", cr, Y.runYear({ ...A({ credit: cr, call: "target" }) }, sc, C0, R0, { literal: true }).end.med.toFixed(2));
