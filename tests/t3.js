global.YRE = require("../yr_engine.js"); const S = require("../yr_stress.js"), Y = YRE;
const mult = Y.pathMult({ mode: "flat" }, 52), sc = { cap0: 30000, W: 52, S0: 20, mult, iv: 1.3, rv: 1.17 }, costs = { ...Y.COSTS, grid: { KORU: 0 } };
for (const [lab, run] of [["A target", { tk: "KORU", cad: "wk", fam: "cc", cd: 30, lev: 1.2, modus: { ...Y.MODUS, call: "target" } }], ["A ibkr", { tk: "KORU", cad: "wk", fam: "cc", cd: 30, lev: 1.2, modus: { ...Y.MODUS } }], ["B", { tk: "KORU", cad: "wk", fam: "str", cd: 20, pd: 20, use: 0.5, modus: { ...Y.MODUS, call: "target" } }]]) {
  const R = Y.runYear(run, sc, costs); const sn = S.snapshot({ ...R, run }, 0, { ...sc }, costs);
  const t0 = Date.now(); const o = S.mcRun(sn, mult, 1.17, 52, 20261001, 0, 2000, costs, 0.75); const ms = Date.now() - t0;
  const nv = o.map(r => r.end).sort((a, b) => a - b), q = p => nv[Math.floor(p * (nv.length - 1))];
  console.log(lab.padEnd(9), ms + "ms", "MC 10/50/90", [q(.1), q(.5), q(.9)].map(v => (v / 1e3).toFixed(1) + "k").join(" / "), "called", (o.filter(r => r.call).length / o.length * 100).toFixed(1) + "%", "| engine", (R.end.c10 / 1e3).toFixed(1), (R.end.med / 1e3).toFixed(1), (R.end.c90 / 1e3).toFixed(1), (R.end.called * 100).toFixed(1) + "%");
}
