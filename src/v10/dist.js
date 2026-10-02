// ============================================================ dist: outcome distributions at expiry (pure)
// One namespace object, DIST, plus v8's cdfT / cdfAt / quantAt. A distribution is the price at one expiry under one
// set of odds, on a grid in u = ln(K/spot) (the expiry carries the spot, override included):
//   Odds.Implied    Breeden–Litzenberger on Black-76 calls on Fpar with Expiry.smile, so the mean is Fpar; the grid
//                   is the distribution (cdfT interpolates it). Grid ±7 implied σ√T.
//   Odds.PeriodVol  a zero-drift lognormal at the ticker's period vol (a fraction, 1.17 = 117%). cdfT / cdfK are the
//                   closed-form normal, so profit odds, the odds strips and the grid's column odds come from one
//                   formula; the grid (±7·max(ATM, vol)·√T, wide enough at 300% vol) serves the readers that sum
//                   over it (pair odds), and is built on its first read only: a vol slider drag makes one
//                   distribution per value and expiry, and most are never summed over.
// Memoized per expiry version and odds; the period-vol distribution also per vol, so a vol edit never rebuilds the
// implied one. No global reads, nothing written to the data object.
const DIST = (() => {
  const DIST_CONFIG = Object.freeze({
    gridPoints: 1000,
    gridHalfWidthSigmas: 7,
    // the smallest σ√T the grid spans (a very short expiry still gets a usable grid)
    minGridSigma: 0.05,
    // the period vol never goes below this (fraction); the state floors the comparer's vol at 1% already
    minVol: 0.01
  });
  // the zero-drift lognormal: P(ln(S_t/S_0) ≤ x) at annual vol `vol` over t years
  /** @param {{ x: number, vol: number, t: number }} input */
  function lognormalCdf({ x, vol, t }) {
    return N((x + 0.5 * vol * vol * t) / (vol * Math.sqrt(t)));
  }
  let DC = null;
  const memo = () => DC || (DC = INST.cache("dist.make"));
  const isPeriodVol = odds => odds === Odds.PeriodVol;
  // the period vol as the grid uses it: a finite fraction at or above the floor (NaN stays NaN: a reader shows "–")
  const usableVol = vol => Number.isFinite(+vol) ? Math.max(+vol, DIST_CONFIG.minVol) : NaN;
  // the grid's shape {n, ulo, uhi, du}; its points u come from listGridPoints
  function createGrid({ halfWidth }) {
    const n = DIST_CONFIG.gridPoints, ulo = -halfWidth, uhi = halfWidth;
    return { n, ulo, uhi, du: (uhi - ulo) / n };
  }
  function listGridPoints({ n, ulo, du }) {
    const u = [];
    for (let i = 0; i <= n; i++) u.push(ulo + du * i);
    return Object.freeze(u);
  }
  // the period-vol distribution's u and cdf, computed on the first read of either and kept with the distribution
  function defineLazyGrid({ target, grid, vol, T }) {
    let points = null;
    const read = () => {
      if (points) { return points; }
      const u = listGridPoints(grid);
      points = { u, cdf: Object.freeze(u.map(x => lognormalCdf({ x, vol, t: T }))) };
      return points;
    };
    Object.defineProperty(target, "u", { enumerable: true, get: () => read().u });
    Object.defineProperty(target, "cdf", { enumerable: true, get: () => read().cdf });
    return target;
  }
  function computeImpliedCdf({ expiry, grid, u }) {
    const { n } = grid, S = expiry.S, T = expiry.T;
    const K = u.map(x => S * Math.exp(x)), C = K.map(k => INST.b76(expiry.Fpar, k, T, expiry.smile(k), "C")), sf = [], cdf = [];
    for (let i = 0; i <= n; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1); sf.push(clamp(-Math.exp(R * T) * (C[i1] - C[i0]) / (K[i1] - K[i0]), 0, 1)); }
    for (let i = 1; i <= n; i++) sf[i] = Math.min(sf[i], sf[i - 1]);
    for (let i = 0; i <= n; i++) cdf.push(1 - sf[i]);
    return cdf;
  }
  // DIST.make({expiry, odds, vol}) -> {key, exp, version, T, S, Fpar, u, cdf, ulo, uhi, du, n, mode, vol}, frozen.
  // mode is the odds value; vol is the period vol (NaN under implied odds)
  /** @param {{ expiry: any, odds?: string, vol?: number }} input */
  function make({ expiry, odds, vol }) {
    const mode = isPeriodVol(odds) ? Odds.PeriodVol : Odds.Implied;
    const pv = isPeriodVol(mode) ? usableVol(vol) : NaN;
    const key = isPeriodVol(mode) ? `${expiry.version}|${expiry.id}|${mode}|${pv}` : `${expiry.version}|${expiry.id}|${mode}`;
    const C0 = memo(), hit = C0.get(key);
    if (hit) { return hit; }
    const T = expiry.T, spread = isPeriodVol(mode) ? Math.max(expiry.atm, pv) : expiry.atm;
    const grid = createGrid({ halfWidth: DIST_CONFIG.gridHalfWidthSigmas * Math.max(spread * Math.sqrt(T), DIST_CONFIG.minGridSigma) });
    const base = { key, exp: expiry.id, version: expiry.version, T, S: expiry.S, Fpar: expiry.Fpar, ulo: grid.ulo, uhi: grid.uhi, du: grid.du, n: grid.n, mode, vol: pv };
    if (isPeriodVol(mode)) { return C0.set(key, Object.freeze(defineLazyGrid({ target: base, grid, vol: pv, T }))); }
    const u = listGridPoints(grid);
    const cdf = Object.freeze(computeImpliedCdf({ expiry, grid, u }));
    return C0.set(key, Object.freeze(Object.assign(base, { u, cdf })));
  }
  // probability that the price at expiry is ≤ K
  const cdfK = (d, K) => K <= 0 ? 0 : cdfT(d, Math.log(K / d.S));
  return Object.freeze({ make, cdfK, lognormalCdf, CONFIG: DIST_CONFIG });
})();
// P(ln(S_T/S) ≤ x) at the distribution's own expiry: the closed form under period-vol odds, the grid under implied odds
function cdfT(d, x) {
  if (d.mode === Odds.PeriodVol) return DIST.lognormalCdf({ x, vol: d.vol, t: d.T });
  const f = (x - d.ulo) / d.du; if (f <= 0) return d.cdf[0]; if (f >= d.n) return d.cdf[d.n]; const i = Math.floor(f), t = f - i; return d.cdf[i] * (1 - t) + d.cdf[i + 1] * t;
}
// the same at an earlier time t (years): implied odds shrink the expiry distribution by √(t/T)
function cdfAt(d, x, t) {
  if (t <= 1e-9) return x >= 0 ? 1 : 0;
  if (d.mode === Odds.Implied) return cdfT(d, x * Math.sqrt(d.T / t));
  return DIST.lognormalCdf({ x, vol: d.vol, t });
}
function quantAt(d, p, t) {
  if (t <= 1e-9) return 0;
  if (d.mode === Odds.Implied) {
    let lo = 0, hi = d.n; if (p <= d.cdf[0]) return d.ulo * Math.sqrt(t / d.T); if (p >= d.cdf[d.n]) return d.uhi * Math.sqrt(t / d.T);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d.cdf[m] < p) lo = m; else hi = m; }
    const c0 = d.cdf[lo], c1 = d.cdf[hi], f = c1 > c0 ? (p - c0) / (c1 - c0) : 0;
    return (d.u[lo] + f * d.du) * Math.sqrt(t / d.T);
  }
  return -0.5 * d.vol * d.vol * t + d.vol * Math.sqrt(t) * Ninv(p);
}
