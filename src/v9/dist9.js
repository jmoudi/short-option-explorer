// ============================================================ dist9: outcome distributions at expiry (pure)
// One namespace object, DIST, plus v8's cdfT / cdfAt / quantAt, copied verbatim.
// DIST.make(expiry, spot, mode, hv, hvk) replaces the v8 distribution builder: no global reads, nothing written to the data object.
// RN mode: Breeden–Litzenberger on Black-76 calls on Fpar with Expiry.smile, so the mean is Fpar.
// HV mode: zero-drift lognormal at hv·hvk, as v8. The grid is in u = ln(K/spot).
const DIST = (() => {
  let DC = null;
  const memo = () => DC || (DC = INST.cache("dist.make"));
  function make(E, S, mode, hv, hvk) {
    mode = mode === "hv" ? "hv" : "rn"; hvk = Number.isFinite(+hvk) ? +hvk : 1;
    const key = `${E.version}|${E.id}|${mode}|${hvk}`, C0 = memo(), hit = C0.get(key); if (hit) return hit;
    const T = E.T, v0 = Math.max(E.atm * Math.sqrt(T), 0.05);
    const n = 1000, ulo = -7 * v0, uhi = 7 * v0, du = (uhi - ulo) / n, u = [], cdf = [];
    for (let i = 0; i <= n; i++) u.push(ulo + du * i);
    const hs = hv * hvk;
    if (mode === "rn") {
      const K = u.map(x => S * Math.exp(x)), C = K.map(k => INST.b76(E.Fpar, k, T, E.smile(k), "C")), sf = [];
      for (let i = 0; i <= n; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1); sf.push(clamp(-Math.exp(R * T) * (C[i1] - C[i0]) / (K[i1] - K[i0]), 0, 1)); }
      for (let i = 1; i <= n; i++) sf[i] = Math.min(sf[i], sf[i - 1]);
      for (let i = 0; i <= n; i++) cdf.push(1 - sf[i]);
    } else {
      const mu = -0.5 * hs * hs * T, v = hs * Math.sqrt(T);
      for (let i = 0; i <= n; i++) cdf.push(N((u[i] - mu) / v));
    }
    Object.freeze(u); Object.freeze(cdf);
    const d = Object.freeze({ key, exp: E.id, version: E.version, T, S, Fpar: E.Fpar, u, cdf, ulo, uhi, du, n, mode, hs });
    return C0.set(key, d);
  }
  // probability that the price at expiry is ≤ K
  const cdfK = (d, K) => K <= 0 ? 0 : cdfT(d, Math.log(K / d.S));
  return Object.freeze({ make, cdfK });
})();
function cdfT(d, x) { const f = (x - d.ulo) / d.du; if (f <= 0) return d.cdf[0]; if (f >= d.n) return d.cdf[d.n]; const i = Math.floor(f), t = f - i; return d.cdf[i] * (1 - t) + d.cdf[i + 1] * t; }
function cdfAt(d, x, t) {
  if (t <= 1e-9) return x >= 0 ? 1 : 0;
  if (d.mode === "rn") return cdfT(d, x * Math.sqrt(d.T / t));
  return N((x + 0.5 * d.hs * d.hs * t) / (d.hs * Math.sqrt(t)));
}
function quantAt(d, p, t) {
  if (t <= 1e-9) return 0;
  if (d.mode === "rn") {
    let lo = 0, hi = d.n; if (p <= d.cdf[0]) return d.ulo * Math.sqrt(t / d.T); if (p >= d.cdf[d.n]) return d.uhi * Math.sqrt(t / d.T);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d.cdf[m] < p) lo = m; else hi = m; }
    const c0 = d.cdf[lo], c1 = d.cdf[hi], f = c1 > c0 ? (p - c0) / (c1 - c0) : 0;
    return (d.u[lo] + f * d.du) * Math.sqrt(t / d.T);
  }
  return -0.5 * d.hs * d.hs * t + d.hs * Math.sqrt(t) * Ninv(p);
}
