// Synthetic chains for node tests: Black-Scholes quotes on a carry forward with an optional skew, 5% relative spread.
"use strict";
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
const N = x => 0.5 * (1 + erf(x / Math.SQRT2));
function bs(S, K, T, s, cp, r) { const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + (r + s * s / 2) * T) / v, d2 = d1 - v; return cp === "C" ? S * N(d1) - K * Math.exp(-r * T) * N(d2) : K * Math.exp(-r * T) * N(-d2) - S * N(-d1); }
// spec: {asof, rate, inst: [{id, S, lev, hv, exps: {YYYYMMDD: {dte, strikes, vol, skew, spread, omit: ["P10","C12"], noBid: ["P9"]}}}]}
function synthD(spec) {
  const r = spec.rate ?? 0.04, D = { meta: { asof: spec.asof || "2026-10-01T16:00:00", rate: r }, u: {} };
  for (const I of spec.inst) {
    const U = { S: I.S, pre: I.S, hv: I.hv ?? 1, lev: I.lev ?? 2, exps: {} };
    for (const e of Object.keys(I.exps)) {
      const X = I.exps[e], T = X.dte / 365, F = I.S * Math.exp(r * T), q = [];
      for (const K of X.strikes) for (const cp of ["P", "C"]) {
        if ((X.omit || []).includes(cp + K)) continue;
        const vol = (X.vol ?? 0.8) + (X.skew ?? 0) * Math.log(K / F);
        const px = bs(I.S, K, T, Math.max(0.05, vol), cp, r), h = (X.spread ?? 0.05) / 2;
        const mid = Math.max(0.01, +px.toFixed(4));
        const noBid = (X.noBid || []).includes(cp + K);
        q.push({ K, cp, bid: noBid ? 0 : +(mid * (1 - h)).toFixed(4), ask: +(mid * (1 + h)).toFixed(4), mid: noBid ? +(mid * (1 + h) / 2).toFixed(4) : mid, ivm: null });
      }
      U.exps[e] = { dte: X.dte, T, F, atm: X.vol ?? 0.8, coef: [X.vol ?? 0.8], xlo: -1, xhi: 1, q };
    }
    D.u[I.id] = U;
  }
  return D;
}
const range = (a, b, s) => { const o = []; for (let x = a; x <= b + 1e-9; x += s) o.push(+x.toFixed(6)); return o; };
module.exports = { synthD, range, bs, N };
