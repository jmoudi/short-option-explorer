// ============================================================ outcome distributions
const DC = new Map();
function dist(tk, exp) {
  const key = tk + exp + st.dist + st.hvk; const hit = DC.get(key); if (hit) return hit;
  const U = D.u[tk], E = U.exps[exp], S = U.S, T = E.T, v0 = Math.max(E.atm * Math.sqrt(T), 0.05);
  const n = 1000, ulo = -7 * v0, uhi = 7 * v0, du = (uhi - ulo) / n, u = [], cdf = [];
  for (let i = 0; i <= n; i++) u.push(ulo + du * i);
  const hs = U.hv * st.hvk;
  if (st.dist === "rn") {
    const K = u.map(x => S * Math.exp(x)), C = K.map(k => bs(S, k, T, smile(E, k, E.F), "C")), sf = [];
    for (let i = 0; i <= n; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1); sf.push(clamp(-Math.exp(R * T) * (C[i1] - C[i0]) / (K[i1] - K[i0]), 0, 1)); }
    for (let i = 1; i <= n; i++) sf[i] = Math.min(sf[i], sf[i - 1]);
    for (let i = 0; i <= n; i++) cdf.push(1 - sf[i]);
  } else {
    const mu = -0.5 * hs * hs * T, v = hs * Math.sqrt(T);
    for (let i = 0; i <= n; i++) cdf.push(N((u[i] - mu) / v));
  }
  const d = { tk, exp, T, u, cdf, ulo, uhi, du, n, mode: st.dist, hs };
  DC.set(key, d); return d;
}
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
