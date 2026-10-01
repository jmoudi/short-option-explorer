global.YRE = require("../yr_engine.js"); const S = require("../yr_stress.js"), Y = YRE;
const sc = { cap0: 30000, W: 52, S0: 20, mult: Y.pathMult({ mode: "flat" }, 52), iv: 1.3, rv: 1.17 };
for (const g of [0, 1]) {
  const costs = { ...Y.COSTS, grid: { KORU: g, RAM: g } };
  for (const [lab, run] of [["A", { tk: "KORU", cad: "wk", fam: "cc", cd: 30, lev: 1.2, modus: { ...Y.MODUS, call: "target" } }], ["A ibkr", { tk: "KORU", cad: "wk", fam: "cc", cd: 30, lev: 1.2, modus: { ...Y.MODUS } }], ["B", { tk: "KORU", cad: "wk", fam: "str", cd: 20, pd: 20, use: 0.5, modus: { ...Y.MODUS, call: "target" } }]]) {
    const R = Y.runYear(run, sc, costs); R.run = run;
    const t0 = Date.now(); const out = [];
    for (const w of [0, 12, 25, 51]) { const sn = S.snapshot(R, w, sc, costs); const rm = S.room(sn, {}, costs); const gp = S.run(sn, { shape: "gap", X: -0.353, unit: "etf" }, {}, costs);
      out.push(`w${w + 1}: nav ${sn.nav.toFixed(0)} room call ${rm.callDown == null ? "–" : (rm.callDown * 100).toFixed(1)}% zero ${rm.zeroDown == null ? "–" : (rm.zeroDown * 100).toFixed(1)}% up ${rm.callUp == null ? "–" : (rm.callUp * 100).toFixed(1)}% | gap −35.3%: loss ${(gp.lossEnd / gp.navBefore * 100).toFixed(1)}%${gp.ev.call ? " call" : ""}`); }
    console.log(`grid ${g} ${lab}`, (Date.now() - t0) + "ms\n  " + out.join("\n  "));
    const sn = S.snapshot(R, 0, sc, costs); for (const sh of [{ shape: "run", X: -0.2, k: 3 }, { shape: "dd", X: -0.6, n: 4 }, { shape: "spike", X: 0.45, back: 2 }, { shape: "gap", X: 0.2 }]) { const r = S.run(sn, { unit: "etf", ...sh }, {}, costs); console.log("   ", JSON.stringify(sh), "low", (-r.lossLow / r.navBefore * 100).toFixed(1) + "%", "end", (-r.lossEnd / r.navBefore * 100).toFixed(1) + "%", r.ev.call ? "call day " + r.ev.call.day : "", r.ev.wiped ? "WIPED" : "", "given up $" + S.givenUp(sn, { unit: "etf", ...sh }, {}, costs).toFixed(0)); }
  }
}
