global.YRE = require("../yr_engine.js"); const S = require("../yr_stress.js"), Y = YRE;
const mult = Y.pathMult({ mode: "flat" }, 52), sc = { cap0: 30000, W: 52, S0: 20, mult, iv: 1.3, rv: 1.17 }, costs = { ...Y.COSTS, grid: { KORU: 0 } };
for (const use of [0.1, 0.3, 0.5]) for (const rv of [1.17, 0.01]) {
  const run = { tk: "KORU", cad: "wk", fam: "str", cd: 20, pd: 20, use, modus: { ...Y.MODUS, call: "target" } };
  const R = Y.runYear(run, { ...sc, rv }, costs); const sn = S.snapshot({ ...R, run }, 0, sc, costs);
  const o = S.mcRun(sn, mult, rv, 52, 20261001, 0, 1500, costs, 0.75); const nv = o.map(r => r[0]).sort((a, b) => a - b), q = p => nv[Math.floor(p * (nv.length - 1))];
  const mean = nv.reduce((a, b) => a + b) / nv.length;
  console.log(`use ${use} rv ${rv}`, "MC 10/50/90", [q(.1), q(.5), q(.9)].map(v => (v / 1e3).toFixed(1)).join("/"), "mean", (mean / 1e3).toFixed(1), "called", (o.filter(r => r[2]).length / o.length * 100).toFixed(1) + "%", "| engine", (R.end.c10 / 1e3).toFixed(1), (R.end.med / 1e3).toFixed(1), (R.end.c90 / 1e3).toFixed(1), "avg", (R.end.avg / 1e3).toFixed(1), (R.end.called * 100).toFixed(1) + "%");
}
