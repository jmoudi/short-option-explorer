// ============================================================ Compounding engine (pure: no DOM, no comparer state)
// One run = a strategy (what is sold) + a modus operandi (how the account is run), over a weekly price path.
// Each cycle the end price is lognormal around the path's next price (realized moves); settlement is the expected
// payoff over that spread. Share runs under "reinvest" / "keep as cash" carry a lattice over leverage λ; the year's
// outcome is the distribution of ln NAV, summarised by its first three moments (Cornish-Fisher quantiles).
const YRE = (() => {
  // ---------------------------------------------------------- math
  const SQ2PI = Math.sqrt(2 * Math.PI);
  const erfY = x => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
  const Nc = x => 0.5 * (1 + erfY(x / Math.SQRT2));
  function NinvY(p) { // Acklam
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
      b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
      d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const RATE = 0.04;
  function bsY(S, K, T, s, cp) {
    if (!(K > 0)) return cp === "C" ? S : 0;
    if (T <= 1e-12 || s <= 1e-12) { const F = S * Math.exp(RATE * T); return Math.exp(-RATE * T) * Math.max(0, cp === "C" ? F - K : K - F); }
    const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + (RATE + s * s / 2) * T) / v, d2 = d1 - v;
    return cp === "C" ? S * Nc(d1) - K * Math.exp(-RATE * T) * Nc(d2) : K * Math.exp(-RATE * T) * Nc(-d2) - S * Nc(-d1);
  }
  const deltaOf = (S, K, T, s, cp) => { const d1 = (Math.log(S / K) + (RATE + s * s / 2) * T) / (s * Math.sqrt(T)); return cp === "C" ? Nc(d1) : 1 - Nc(d1); }; // |Δ|
  const kForDelta = (S, T, s, d, cp) => { const z = cp === "C" ? NinvY(d) : -NinvY(d); return S * Math.exp(-(z * s * Math.sqrt(T)) + (RATE + s * s / 2) * T); };

  // ---------------------------------------------------------- tickers, margin (IBKR, leveraged ETFs)
  const LEV = { KORU: 3, RAM: 2 };
  const mOf = (tk, ovr) => ovr && ovr[tk] ? ovr[tk] : Math.min(1, 0.25 * LEV[tk]);
  function naked(tk, x, K, mark, cp) { const L = LEV[tk], a = Math.min(1, .2 * L), b = Math.min(1, .1 * L);
    return cp === "C" ? mark + Math.max(a * x - Math.max(0, K - x), b * x) : mark + Math.max(a * x - Math.max(0, x - K), b * K); }
  // strangle-family requirement per share at price x with the given marks
  function reqStr(tk, x, L, mc, mp) {
    const rc = naked(tk, x, L.Kc, mc, "C"), rp = naked(tk, x, L.Kp, mp, "P");
    if (L.Kwc && L.Kwp) return Math.max(L.Kwc - L.Kc, L.Kp - L.Kwp, 0) + Math.max(0, L.Kp - L.Kc); // condor; guts adds the overlap
    if (L.Kwc) return rp + (L.Kwc - L.Kc);
    if (L.Kwp) return rc + (L.Kp - L.Kwp);
    return Math.max(rc + mp, rp + mc);
  }
  function loanRate(loan, R) { if (!R.tiered) return R.loan; if (loan <= 0) return R.bm + 0.015;
    const t1 = Math.min(loan, 1e5), t2 = Math.min(Math.max(loan - 1e5, 0), 9e5), t3 = Math.max(loan - 1e6, 0);
    return (t1 * (R.bm + 0.015) + t2 * (R.bm + 0.01) + t3 * (R.bm + 0.0075)) / loan; }
  function interest(cash, nav, R, yrs) {
    if (cash < 0) return cash * loanRate(-cash, R) * yrs;
    if (!R.tiered) return cash * R.cash * yrs;
    return Math.max(0, cash - 1e4) * Math.max(0, R.bm - 0.005) * Math.min(1, Math.max(nav, 0) / 1e5) * yrs;
  }

  // ---------------------------------------------------------- calendar
  const HOL = new Set(["2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
    "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19", "2028-07-04", "2028-09-04"]);
  const iso = d => d.toISOString().slice(0, 10);
  const addD = (d, n) => new Date(d.getTime() + n * 864e5);
  const shiftHol = d => { while (HOL.has(iso(d)) || d.getUTCDay() === 0 || d.getUTCDay() === 6) d = addD(d, -1); return d; };
  const thirdFri = (y, m) => { const d = new Date(Date.UTC(y, m, 1)); return addD(d, (5 - d.getUTCDay() + 7) % 7 + 14); };
  const START = new Date(Date.UTC(2026, 9, 2)); // week 0: Fri 2 Oct 2026
  function cycles(cad, W) {
    const F = Array.from({ length: W + 1 }, (_, w) => addD(START, 7 * w));
    if (cad === "wk") return F.slice(1).map((f, i) => ({ w0: i, w1: i + 1, exp: shiftHol(f), t0: i === 0 ? START : shiftHol(F[i]) }));
    const out = []; let y = START.getUTCFullYear(), m = START.getUTCMonth(), pw = 0, pd = START;
    for (let k = 0; k < 40; k++) { const tf = thirdFri(y, m); m++; if (m > 11) { m = 0; y++; } if (tf <= START) continue;
      const w1 = Math.round((+tf - +START) / (7 * 864e5)), exp = shiftHol(tf); out.push({ w0: pw, w1, exp, t0: pd }); pw = w1; pd = exp; if (w1 >= W) break; }
    return out;
  }
  const weekDate = w => addD(START, 7 * w);

  // ---------------------------------------------------------- paths (multiples of the start; price never falls)
  // p: {mode:'flat'|'line'|'pts'|'growth', end (multiple), pts:[[w, mult]], geo, g (per week), floor:boolean}
  function pathMult(p, W, nonDecreasing = true) {
    const S = [];
    for (let w = 0; w <= W; w++) {
      let v = 1;
      if (p.mode === "line") v = p.geo ? Math.pow(p.end, w / W) : 1 + (p.end - 1) * w / W;
      else if (p.mode === "growth") v = Math.pow(1 + p.g, w);
      else if (p.mode === "pts") { const P = [[0, 1], ...(p.pts || []).filter(q => q[0] > 0).sort((a, b) => a[0] - b[0])];
        let i = 0; while (i < P.length - 1 && P[i + 1][0] <= w) i++;
        if (i === P.length - 1) v = P[i][1]; else { const [w0, s0] = P[i], [w1, s1] = P[i + 1], f = (w - w0) / (w1 - w0); v = p.geo ? s0 * Math.pow(s1 / s0, f) : s0 + (s1 - s0) * f; } }
      S.push(v);
    }
    if (nonDecreasing) for (let w = 1; w <= W; w++) S[w] = Math.max(S[w], S[w - 1]);
    return S;
  }

  // ---------------------------------------------------------- strikes on a listed grid
  // nearest-Δ listed strike; ties go further from the money (conservative for a short leg). Δ 50 = nearest the forward.
  function pickStrike(S, T, iv, cp, d, g) {
    const F = S * Math.exp(RATE * T);
    if (!(g > 0)) return Math.abs(d - 50) < 1e-9 ? F : kForDelta(S, T, iv, d / 100, cp); // continuous (tests only)
    if (Math.abs(d - 50) < 1e-9) return Math.max(g, Math.round(F / g) * g);
    const K0 = kForDelta(S, T, iv, d / 100, cp), lo = Math.max(g, Math.floor(K0 / g) * g), hi = lo + g;
    const dl = Math.abs(deltaOf(S, lo, T, iv, cp) * 100 - d), dh = Math.abs(deltaOf(S, hi, T, iv, cp) * 100 - d);
    if (Math.abs(dl - dh) < 1e-9) return cp === "C" ? hi : lo;
    return dl < dh ? lo : hi;
  }
  const hs = (p, c) => p > 0 ? Math.max(c.hsMin, c.hsPct * p) : 0;

  // ---------------------------------------------------------- barrier helpers (drifting Brownian motion in y = ln x/S0)
  const touch1 = (b, mu, v) => b < 0 ? Nc((b - mu) / v) + Math.exp(2 * mu * b / (v * v)) * Nc((b + mu) / v) : Nc((mu - b) / v) + Math.exp(2 * mu * b / (v * v)) * Nc((-b - mu) / v);
  function surv2(be, al, mu, v) { const w = al - be, v2 = v * v; let s = 0;
    for (let k = -4; k <= 4; k++) {
      const d1 = Nc((al - 2 * k * w - mu) / v) - Nc((be - 2 * k * w - mu) / v); if (d1 > 0) s += Math.exp(2 * mu * k * w / v2 + Math.log(d1));
      const d2 = Nc((-al - 2 * k * w - mu) / v) - Nc((be - 2 * al - 2 * k * w - mu) / v); if (d2 > 0) s -= Math.exp(2 * mu * (al + k * w) / v2 + Math.log(d2)); }
    return Math.min(1, Math.max(0, s)); }
  function killed(y, mu, v, be, al) {
    const v2 = v * v, ph = z => Math.exp(-z * z / (2 * v2)) / (v * SQ2PI);
    if (!isFinite(be) && !isFinite(al)) return ph(y - mu);
    if (!isFinite(al)) return ph(y - mu) - Math.exp(2 * mu * be / v2) * ph(y - 2 * be - mu);
    if (!isFinite(be)) return ph(y - mu) - Math.exp(2 * mu * al / v2) * ph(y - 2 * al - mu);
    const w = al - be; let s = 0; for (let k = -4; k <= 4; k++) s += ph(y - 2 * k * w) - ph(y - 2 * al - 2 * k * w);
    return Math.exp(mu * y / v2 - mu * mu / (2 * v2)) * s;
  }
  // joint density of (running minimum m, end y), m ≤ min(0, y)
  const jointMinEnd = (m, y, mu, v) => { const v2 = v * v, z = y - 2 * m; return 2 * z / (v2 * v * SQ2PI) * Math.exp(-z * z / (2 * v2) + mu * y / v2 - mu * mu / (2 * v2)); };
  function nodes(lo, hi, brk, NQ) {
    const pts = [lo, ...brk.filter(b => b > lo && b < hi).sort((a, b) => a - b), hi], Y = [], Wt = [];
    for (let j = 0; j < pts.length - 1; j++) { const a = pts[j], b = pts[j + 1]; const n = Math.max(2, 2 * Math.round(NQ * (b - a) / (hi - lo) / 2)), hh = (b - a) / n;
      for (let i = 0; i <= n; i++) { Y.push(a + i * hh); Wt.push(hh / 3 * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2)); } }
    return { Y, Wt };
  }
  function root(f, a, b, fa, fb, tol = 1e-7) { let side = 0, c = a, fc;
    for (let it = 0; it < 40; it++) { c = (a * fb - b * fa) / (fb - fa); fc = f(c);
      if (Math.abs(b - a) < tol || fc === 0) break;
      if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; } else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
      if (Math.abs(b - a) < tol) break; }
    return c; }

  // ---------------------------------------------------------- defaults
  const MODUS = { credit: "reinvest", call: "ibkr", target: 1.0, move: "keep" };
  const COSTS = { give: 0.25, hsPct: 0.07, hsMin: 0.025, comm: 0.65, commSh: 0.005, hsSh: 0.005, liq: 250, whole: true, grid: { KORU: 1, RAM: 1 }, mOvr: null };
  const RATES = { tiered: true, bm: 0.04, loan: 0.055, cash: 0.035 };

  // ---------------------------------------------------------- one run
  // run: {tk, cad:'wk'|'mo', fam:'cc'|'str', cd, pd, puts, lev, use, wcd, wpd, modus}
  // sc: {cap0, W, S0, mult (path multiples), iv:[per cycle start week -> iv] or number, rv: number or per-week array}
  // o: {literal (moves 0), h, NQ, NQ2}
  function runYear(run, sc, costs = COSTS, R = RATES, o = {}) {
    const W = sc.W, S = sc.mult.map(x => x * sc.S0), cyc = cycles(run.cad, W), m = mOf(run.tk, costs.mOvr), LMAX = 1 / m;
    const md = { ...MODUS, ...(run.modus || {}) }, g = costs.grid && costs.grid[run.tk] != null ? costs.grid[run.tk] : 1;
    const ivAt = w => typeof sc.iv === "number" ? sc.iv : sc.iv[Math.min(w, sc.iv.length - 1)];
    const rvAt = w => typeof sc.rv === "number" ? sc.rv : sc.rv[Math.min(w, sc.rv.length - 1)];
    const NQ = o.NQ || 60, NQ2 = o.NQ2 || 24, h = o.h || 0.02;
    const isCC = run.fam === "cc", lamT0 = isCC ? Math.min(run.lev, LMAX) : 0;
    const pol = isCC ? (md.credit === "rebal" ? "reset" : md.credit === "cash" ? "cash" : "add") : (md.credit === "cash" ? "fixed" : "grow");
    const lattice = isCC && pol !== "reset" && !o.literal, single = isCC && pol !== "reset" && !!o.literal; let lamS = lamT0;
    const K_ = Math.floor(LMAX / h + 1e-9), top = LMAX - K_ * h > 1e-9, B = lattice ? K_ + 1 + (top ? 1 : 0) : 1;
    const lamOf = i => i <= K_ ? i * h : LMAX;
    const binOf = lam => !lattice ? 0 : lam <= K_ * h ? lam / h : K_ + (lam - K_ * h) / (LMAX - K_ * h);
    const mk = () => new Float64Array(B);
    let P0 = mk(), P1 = mk(), L1 = mk(), L2 = mk(), L3 = mk(), A = mk(), U1 = mk(), U2 = mk(), U3 = mk();
    { const x = binOf(lamT0), i0 = Math.floor(x), f = x - i0; P0[i0] += 1 - f; A[i0] += 1 - f; if (f > 0) { P0[i0 + 1] += f; A[i0 + 1] += f; } }
    const rows = []; let note = "", lamHoldLast = lamT0, cumCredit = 0;
    const c0 = Math.log(sc.cap0 / S[0]);
    for (const cy of cyc) {
      const w0 = cy.w0, w1 = Math.min(cy.w1, W), S0 = S[w0], S1 = S[w1], iv = ivAt(w0), rv = rvAt(w0);
      const days = Math.round((cy.exp - cy.t0) / 864e5), daysH = cy.w1 > W ? Math.round(days * (W - w0) / (cy.w1 - w0)) : days;
      const T = days / 365, Th = daysH / 365, tauRem = (days - daysH) / 365;
      const v = o.literal ? 0 : rv * Math.sqrt(Th), mu = Math.log(S1 / S0);
      const L = { Kc: 0, Kp: 0, Kwc: 0, Kwp: 0, pc: 0, pp: 0, pwc: 0, pwp: 0 };
      if (isCC) {
        if (run.cd > 0) { L.Kc = pickStrike(S0, T, iv, "C", run.cd, g); L.pc = bsY(S0, L.Kc, T, iv, "C"); }
        if (run.puts) { L.Kp = pickStrike(S0, T, iv, "P", run.pd, g); L.pp = bsY(S0, L.Kp, T, iv, "P"); }
      } else {
        L.Kc = pickStrike(S0, T, iv, "C", run.cd, g); L.Kp = pickStrike(S0, T, iv, "P", run.pd, g);
        L.pc = bsY(S0, L.Kc, T, iv, "C"); L.pp = bsY(S0, L.Kp, T, iv, "P");
        if (run.wcd) { L.Kwc = Math.max(pickStrike(S0, T, iv, "C", run.wcd, g), Math.max(L.Kc, L.Kp) + g); L.pwc = bsY(S0, L.Kwc, T, iv, "C"); }
        if (run.wpd) { L.Kwp = Math.max(g, Math.min(pickStrike(S0, T, iv, "P", run.wpd, g), Math.min(L.Kp, L.Kc) - g)); L.pwp = bsY(S0, L.Kwp, T, iv, "P"); }
      }
      const fc = L.pc - costs.give * hs(L.pc, costs), fp = L.pp - costs.give * hs(L.pp, costs);
      const fwc = L.pwc ? L.pwc + costs.give * hs(L.pwc, costs) : 0, fwp = L.pwp ? L.pwp + costs.give * hs(L.pwp, costs) : 0;
      const tvc = L.Kc ? L.pc - Math.max(0, S0 - L.Kc) : 0, tvp = L.Kp ? L.pp - Math.max(0, L.Kp - S0) : 0;
      const callLiab = x => L.Kc ? Math.max(0, x - L.Kc) : 0, putLiab = x => L.Kp ? Math.max(0, L.Kp - x) : 0;
      const liabEnd = x => tauRem > 0
        ? (L.Kc ? bsY(x, L.Kc, tauRem, iv, "C") : 0) + (L.Kp ? bsY(x, L.Kp, tauRem, iv, "P") : 0) - (L.Kwc ? bsY(x, L.Kwc, tauRem, iv, "C") : 0) - (L.Kwp ? bsY(x, L.Kwp, tauRem, iv, "P") : 0)
        : callLiab(x) + putLiab(x) - (L.Kwc ? Math.max(0, x - L.Kwc) : 0) - (L.Kwp ? Math.max(0, L.Kwp - x) : 0);
      const nat = q => q + hs(q, costs);
      const mc = x => L.Kc ? bsY(x, L.Kc, T / 2, iv, "C") : 0, mp = x => L.Kp ? bsY(x, L.Kp, T / 2, iv, "P") : 0;
      const mwc = x => L.Kwc ? bsY(x, L.Kwc, T / 2, iv, "C") : 0, mwp = x => L.Kwp ? bsY(x, L.Kwp, T / 2, iv, "P") : 0;
      const qHat = isCC ? 0 : reqStr(run.tk, S0, L, L.pc, L.pp) / S0;
      const nP0 = mk(), nP1 = mk(), nL1 = mk(), nL2 = mk(), nL3 = mk(), nA = mk(), nU1 = mk(), nU2 = mk(), nU3 = mk();
      let pTouchCycle = 0, row = null, credExp = 0;
      const put = (lamN, s0, s1, i, wq, lnR, Rr, du) => {
        let x = binOf(lamN); if (!(x >= 0)) x = 0; if (x > B - 1) x = B - 1; const i0 = Math.floor(x), f = x - i0;
        const p = P0[i] + P1[i], l1 = L1[i], l2 = L2[i], l3 = L3[i], u1 = U1[i], u2 = U2[i], u3 = U3[i];
        const add = (k, s) => { if (s <= 0) return; s *= wq; nP0[k] += s * s0; nP1[k] += s * s1;
          nL1[k] += s * (l1 + p * lnR); nL2[k] += s * (l2 + 2 * l1 * lnR + p * lnR * lnR); nL3[k] += s * (l3 + 3 * l2 * lnR + 3 * l1 * lnR * lnR + p * lnR * lnR * lnR);
          nU1[k] += s * (u1 + p * du); nU2[k] += s * (u2 + 2 * u1 * du + p * du * du); nU3[k] += s * (u3 + 3 * u2 * du + 3 * u1 * du * du + p * du * du * du);
          nA[k] += s * A[i] * Rr; };
        add(i0, 1 - f); if (f > 0) add(i0 + 1, f);
      };
      for (let i = 0; i < B; i++) {
        const p = P0[i] + P1[i]; if (p < 1e-13) continue;
        const navD = sc.cap0 * Math.exp(L1[i] / p);
        let lam = lattice ? lamOf(i) : single ? lamS : lamT0, lamHold = lamT0, cu = 0, pu = 0, ku = 0, cash, comm = 0, n = 0, calls = 0, puts = 0, k = 0;
        if (isCC) {
          if (run.puts && L.Kp) { const cap = 1 / (m + naked(run.tk, S0, L.Kp, L.pp, "P") / S0); if (lam > cap) { lam = cap; note = "leverage held by put margin"; } lamHold = Math.min(lamT0, cap); }
          n = lam * navD / S0; calls = L.Kc ? (costs.whole ? Math.floor(n / 100 + 1e-9) : n / 100) : 0; if (costs.liq) calls = Math.min(calls, costs.liq); puts = run.puts ? calls : 0;
          cu = 100 * calls / navD; pu = 100 * puts / navD; comm = costs.comm * (calls + puts);
          cash = 1 - lam + cu * fc + pu * fp - comm / navD;
        } else {
          const q = reqStr(run.tk, S0, L, L.pc, L.pp), base = pol === "fixed" ? sc.cap0 : navD;
          k = run.use * base / (100 * q); if (costs.whole) k = Math.floor(k + 1e-9); if (costs.liq) k = Math.min(k, costs.liq);
          ku = 100 * k / navD; comm = costs.comm * k * (2 + (L.Kwc ? 1 : 0) + (L.Kwp ? 1 : 0));
          cash = 1 + ku * (fc + fp - fwc - fwp) - comm / navD;
        }
        lamHoldLast = lamHold;
        const cashE = cash + interest(cash * navD, navD, R, Th) / navD;
        const exc = X => { const x = X * S0; let req;
          if (isCC) req = m * lam * X + pu * naked(run.tk, x, L.Kp, mp(x), "P");
          else req = ku * reqStr(run.tk, x, L, mc(x), mp(x));
          return cash + (isCC ? lam * X : 0) - req; };
        let be = -Infinity, al = Infinity;
        if (isCC && !pu) { if (cash < 0 && lam > 0) { const Xb = -cash / ((1 - m) * lam); be = Xb >= 1 ? 0 : Math.log(Xb); } }
        else { const f1 = exc(1);
          if (f1 < 0) be = 0; else {
            const flo = exc(0.0005); if (flo < 0) be = Math.log(root(exc, 0.0005, 1, flo, f1));
            if (!isCC) { const fhi = exc(40); if (fhi < 0) al = Math.log(root(exc, 1, 40, f1, fhi)); } } }
        if (v > 0) { const shf = 0.5826 * rv / Math.sqrt(252); if (isFinite(be)) be -= shf; if (isFinite(al)) al += shf; }
        const navEnd = X => { const x = X * S0; let nv = cashE + (isCC ? lam * X : 0);
          if (isCC) nv -= cu * (tauRem > 0 ? (L.Kc ? bsY(x, L.Kc, tauRem, iv, "C") : 0) : callLiab(x)) + pu * (tauRem > 0 ? (L.Kp ? bsY(x, L.Kp, tauRem, iv, "P") : 0) : putLiab(x)) + (L.Kc && x > L.Kc ? cu * (costs.commSh + costs.hsSh) : 0);
          else nv -= ku * liabEnd(x);
          return nv; };
        const netOpt = X => { const x = X * S0; return cu * fc + pu * fp - comm / navD - cu * callLiab(x) - pu * putLiab(x); };
        const lamNext = (X, nv) => { if (!isCC) return 0; if (!lattice) return lamHold;
          const add = pol === "add" ? lamT0 * netOpt(X) : 0; return Math.min(LMAX, Math.max(0, (lam * X + add) / nv)); };
        const tradeCost = (X, nv, lN) => isCC ? Math.abs(lN * nv - lam * X) * (costs.commSh + costs.hsSh) / (X * S0) : 0;
        credExp += p * navD * (cu * fc + pu * fp + ku * (fc + fp - fwc - fwp));
        const mkrow = pT => ({ w0, w1, date: cy.exp, t0: cy.t0, days, S0, S1, iv, rv, Kc: L.Kc, Kp: L.Kp, Kwc: L.Kwc, Kwp: L.Kwp, pc: L.pc, pp: L.pp, tvc, tvp,
          dc: L.Kc ? deltaOf(S0, L.Kc, T, iv, "C") : 0, dp: L.Kp ? deltaOf(S0, L.Kp, T, iv, "P") : 0, calls, puts, k, n, lam,
          pitm: (L.Kc ? 1 - Nc((Math.log(L.Kc / S0) - mu) / Math.max(v, 1e-9)) : 0),
          cush: isFinite(be) ? 1 - Math.exp(be) : 1, cushUp: isFinite(al) ? Math.exp(al) - 1 : Infinity, pt: pT, sigma: v });
        if (v === 0) { const X = S1 / S0; let nv = navEnd(X); const lN = single ? Math.min(LMAX, Math.max(0, (lam * X + (pol === "add" ? lamT0 * netOpt(X) : 0)) / nv)) : lamNext(X, nv);
          if (single) lamS = lN; nv -= tradeCost(X, nv, lN); nv = Math.max(nv, 1e-9); put(lN, P0[i], P1[i], i, 1, Math.log(nv), nv, Math.log(nv) - Math.log(X));
          if (!row) row = mkrow(0); continue; }
        let pT, ptD = 0, ptU = 0;
        if (!isFinite(be) && !isFinite(al)) pT = 0;
        else { ptD = isFinite(be) ? (be >= 0 ? 1 : touch1(be, mu, v)) : 0; ptU = isFinite(al) ? (al <= 0 ? 1 : touch1(al, mu, v)) : 0;
          pT = isFinite(be) && isFinite(al) ? 1 - surv2(be, al, mu, v) : ptD + ptU; pT = Math.min(1, pT); }
        const brk = [L.Kc, L.Kp, L.Kwc, L.Kwp].filter(K => K > 0).map(K => Math.log(K / S0));
        // untouched part, renormalised to 1 − pT
        const lo = Math.max(be, mu - 8.5 * v), hi = Math.min(al, mu + 8.5 * v);
        if (hi > lo && pT < 1) { const { Y, Wt } = nodes(lo, hi, brk, NQ); const wk = new Float64Array(Y.length); let mass = 0;
          for (let j = 0; j < Y.length; j++) { const wq = Wt[j] * killed(Y[j], mu, v, be, al); if (wq > 0) { wk[j] = wq; mass += wq; } }
          const scl = mass > 0 ? (1 - pT) / mass : 0;
          for (let j = 0; j < Y.length; j++) { if (!(wk[j] > 0)) continue; const X = Math.exp(Y[j]); let nv = navEnd(X); const lN = lamNext(X, nv); nv -= tradeCost(X, nv, lN); if (nv <= 1e-9) nv = 1e-9;
            put(lN, P0[i], P1[i], i, wk[j] * scl, Math.log(nv), nv, Math.log(nv) - Y[j]); } }
        if (pT > 1e-12) {
          if (!isCC) { // strangles: closed at the trigger at natural marks (both margin-call rules); cash runs to the cycle end
            const sD = ptD + ptU > 0 ? ptD / (ptD + ptU) : 1;
            for (const [side, share] of [[be, sD], [al, 1 - sD]]) { if (!(share > 0) || !isFinite(side)) continue; const x = Math.exp(side) * S0;
              let nb = cash - ku * (nat(mc(x)) + nat(mp(x)) - mwc(x) - mwp(x)) - comm / navD; nb += Math.max(0, interest(Math.max(nb, 0) * navD, navD, R, Th / 2)) / navD; if (nb <= 1e-9) nb = 1e-9;
              const down = side < 0, e2 = Math.exp(2 * mu * side / (v * v)), lo2 = Math.min(mu - 8.5 * v, 2 * side + mu - 8.5 * v), hi2 = Math.max(mu + 8.5 * v, 2 * side + mu + 8.5 * v), { Y, Wt } = nodes(lo2, hi2, [side], NQ);
              const ws = new Float64Array(Y.length); let ms = 0;
              for (let j = 0; j < Y.length; j++) { const y = Y[j], beyond = down ? y < side : y > side; ws[j] = Wt[j] * (beyond ? Math.exp(-((y - mu) ** 2) / (2 * v * v)) : e2 * Math.exp(-((y - 2 * side - mu) ** 2) / (2 * v * v))); ms += ws[j]; }
              for (let j = 0; j < Y.length; j++) if (ws[j] > 0) put(0, 0, p, i, pT * share * ws[j] / ms, Math.log(nb), nb, Math.log(nb) - Y[j]); }
          } else if (isFinite(be)) {
            const Xb = Math.exp(be), xb = Xb * S0;
            // puts are bought back at the trigger; covered calls stay on the shares that remain
            const cashB = cash - pu * nat(mp(xb));
            const lo2 = mu - 8.5 * v + Math.min(0, 2 * be), hi2 = mu + 8.5 * v;
            if (md.call === "target") { // sell back to the target leverage at the trigger, then hold
              const nb = cashB + lam * Xb - cu * nat(mc(xb)), ex = Math.min(lam, md.target) * nb, nL = ex / Xb, cu2 = Math.min(cu, nL / S0);
              const cash2 = nb - ex + cu2 * mc(xb) - (lam * Xb - ex) / Xb / S0 * (costs.commSh + costs.hsSh);
              const { Y, Wt } = nodes(lo2, hi2, [be, ...brk], NQ), e2 = Math.exp(2 * mu * be / (v * v));
              const ws = new Float64Array(Y.length); let ms = 0;
              for (let j = 0; j < Y.length; j++) { const y = Y[j]; ws[j] = Wt[j] * (y < be ? Math.exp(-((y - mu) ** 2) / (2 * v * v)) : e2 * Math.exp(-((y - 2 * be - mu) ** 2) / (2 * v * v))); ms += ws[j]; }
              for (let j = 0; j < Y.length; j++) { if (!(ws[j] > 0)) continue; const X = Math.exp(Y[j]), x = X * S0;
                let nv = cash2 + nL * X - cu2 * (tauRem > 0 ? bsY(x, L.Kc, tauRem, iv, "C") : callLiab(x)); if (nv <= 1e-9) nv = 1e-9;
                const lN = lattice ? Math.min(LMAX, nL * X / nv) : lamHold; put(lN, 0, p, i, pT * ws[j] / ms, Math.log(nv), nv, Math.log(nv) - Y[j]); }
            } else { // IBKR minimum: from the shares-only limit the account rides it down (equity ∝ x^(1/m)), then holds from the cycle's low
              const lr = cashB < 0 && lam > 0 ? Math.min(be, Math.log(-cashB / ((1 - m) * lam))) : -Infinity, E_r = isFinite(lr) ? m * lam * Math.exp(lr) : 0;
              const Mq = nodes(lo2, be, isFinite(lr) && lr > lo2 ? [lr] : [], NQ2); let ms = 0; const acc = [];
              for (let a = 0; a < Mq.Y.length; a++) { const mm = Mq.Y[a]; if (!(Mq.Wt[a] > 0)) continue;
                let nL = lam, cashM = cashB, cuM = cu;
                if (mm < lr) { const E_m = E_r * Math.exp((mm - lr) / m), Xm = Math.exp(mm), Vm = E_m / m; nL = Vm / Xm; cashM = E_m - Vm;
                  cuM = Math.min(cu, nL / S0); cashM -= (cu - cuM) * nat(mc(Xm * S0)) + (lam * Xm - Vm) / Xm / S0 * (costs.commSh + costs.hsSh); }
                const Yn = nodes(mm, Math.max(hi2, mm + 1e-6), brk.filter(q => q > mm), NQ2);
                for (let j = 0; j < Yn.Y.length; j++) { const y = Yn.Y[j], wq = Mq.Wt[a] * Yn.Wt[j] * jointMinEnd(mm, y, mu, v); if (!(wq > 0)) continue;
                  ms += wq; acc.push(y, wq, cashM, nL, cuM); } }
              for (let q = 0; q < acc.length; q += 5) { const y = acc[q], X = Math.exp(y), x = X * S0, wq = acc[q + 1], cashM = acc[q + 2], nL = acc[q + 3], cuM = acc[q + 4];
                let nv = cashM + nL * X - cuM * (tauRem > 0 ? bsY(x, L.Kc, tauRem, iv, "C") : callLiab(x)); if (nv <= 1e-9) nv = 1e-9;
                const lN = lattice ? Math.min(LMAX, nL * X / nv) : lamHold; put(lN, 0, p, i, pT * wq / ms, Math.log(nv), nv, Math.log(nv) - y); }
            }
          }
        }
        pTouchCycle += p * pT;
        if (!row || (lattice && Math.abs(lamOf(i) - lamT0) < h / 2)) row = mkrow(pT);
      }
      P0 = nP0; P1 = nP1; L1 = nL1; L2 = nL2; L3 = nL3; A = nA; U1 = nU1; U2 = nU2; U3 = nU3;
      let sp = 0, s1 = 0, s2 = 0, s3 = 0, sa = 0, sc1 = 0, sll = 0, q1 = 0, q2 = 0, q3 = 0;
      for (let i = 0; i < B; i++) { const p = P0[i] + P1[i]; if (!(p > 0)) continue; sp += p; s1 += L1[i]; s2 += L2[i]; s3 += L3[i]; sa += A[i]; sc1 += P1[i];
        const lb = lattice ? lamOf(i) : single ? lamS : lamHoldLast; sll += p * Math.log(Math.max(lb, 1e-6));
        const a = Math.log(Math.max(lb, lattice ? h / 2 : 1e-12)) + c0;
        q1 += U1[i] + p * a; q2 += U2[i] + 2 * a * U1[i] + p * a * a; q3 += U3[i] + 3 * a * U2[i] + 3 * a * a * U1[i] + p * a * a * a; }
      const cfq = (S1_, S2_, S3_) => { const mean = S1_ / sp, sd = Math.sqrt(Math.max(0, S2_ / sp - mean * mean)); const g3 = sd > 1e-9 ? (S3_ / sp - 3 * mean * sd * sd - mean ** 3) / sd ** 3 : 0, g3c = Math.max(-1, Math.min(1, g3));
        return { mean, sd, g3, f: z => mean + sd * (z + (z * z - 1) * g3c / 6) }; };
      const Lq = cfq(s1, s2, s3);
      cumCredit += credExp;
      Object.assign(row, { med: sc.cap0 * Math.exp(Lq.f(0)), c10: sc.cap0 * Math.exp(Lq.f(-1.2816)), c90: sc.cap0 * Math.exp(Lq.f(1.2816)), geo: sc.cap0 * Math.exp(Lq.mean), skew: Lq.g3,
        avg: sc.cap0 * sa / sp, called: sc1 / sp, pTouch: pTouchCycle, lamTyp: Math.exp(sll / sp), mass: sp, credit: credExp, cumCredit });
      if (isCC) { const Q = cfq(q1, q2, q3); row.shMed = Math.exp(Q.f(0)); row.sh10 = Math.exp(Q.f(-1.2816)); row.sh90 = Math.exp(Q.f(1.2816)); row.lots = Math.floor(row.shMed / 100 + 1e-9); }
      else { let u1 = 0, u2 = 0, u3 = 0; for (let i = 0; i < B; i++) { u1 += U1[i]; u2 += U2[i]; u3 += U3[i]; } const Q = cfq(u1, u2, u3);
        row.kMed = (pol === "fixed" ? run.use * sc.cap0 / S0 : run.use * Math.exp(c0 + Q.f(0))) / (100 * qHat); }
      rows.push(row); if (cy.w1 >= W) break;
    }
    const z = rows[rows.length - 1];
    return { rows, end: z, note, S, run, m, LMAX };
  }

  // the three tracks a panel needs for one run: typical (realized moves), exactly on the path, and the KORU-held baseline
  function runAll(run, sc, costs, R, o = {}) {
    const main = runYear(run, sc, costs, R, o);
    const exact = runYear(run, sc, costs, R, { ...o, literal: true });
    return { main, exact };
  }

  return { runYear, runAll, cycles, weekDate, pathMult, pickStrike, bs: bsY, deltaOf, kForDelta, naked, reqStr, interest, loanRate, touch1, surv2, jointMinEnd, nodes, Nc, Ninv: NinvY, mOf, LEV, START, iso, MODUS, COSTS, RATES, HOL };
})();
if (typeof module !== "undefined") module.exports = YRE;
