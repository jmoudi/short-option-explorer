// ============================================================ recovery: how long one bad hit takes to earn back (pure)
// Per cycle, P = the position's P&L at expiry per unit of capital (each side's Reg T margin at entry, or its notional),
// under the zero-drift lognormal at the ticker's period vol (ln S_T/S ~ N(−σ²T/2, σ²T), as every EV reading uses);
// L = the hit as a fraction of that capital. Three growth rates a cycle:
//   best case        max payoff / capital: nothing ever goes wrong (the credit for straddles and strangles)
//   if no such hit   exp(E[ln(1 + P) | P > −L]) − 1: compounded, with the losses short of the hit still in it. It falls
//                    as L grows and can sit below the average; at q = 0 it is the plain compounded rate, which at full
//                    margin can be negative
//   average          E[P]: expected NAV a cycle, not a compounding rate at full margin
// q = P(P ≤ −L) a cycle (a tie at a flat floor counts as a hit); the honesty figure (1 − q)^N is the chance that the
// condition behind "if no such hit" holds for all N cycles of the recovery.
// E[P] and q are closed form (the payoff is piecewise linear in the price); the log-mean is Gauss–Legendre in the
// standard-normal variable, each piece split at the strikes and at the roots of P = −L. One namespace: RECOVERY.
const RECOVERY = (() => {
  const RECOVERY_CONFIG = Object.freeze({
    nodes: 24,              // Gauss–Legendre nodes per piece (24 vs 48 agree to 1e-9 on the reference straddle)
    span: 10,               // the standard-normal range integrated, ±span (mass outside < 1e-22)
    tieTolerance: 1e-9,     // a P within this of −L counts as the hit (a flat floor at exactly the hit)
    amberBelow: 0.5,        // the honesty figure turns amber below this
    memoSize: 4000
  });
  const memo = new Map();
  // ---------------------------------------------------------- Gauss–Legendre nodes on [−1, 1]
  const legendre = (() => {
    const n = RECOVERY_CONFIG.nodes, x = [], w = [];
    for (let i = 1; i <= n; i++) {
      let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), dp = 0;
      for (let it = 0; it < 100; it++) {
        let p0 = 1, p1 = z;
        for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
        dp = n * (z * p1 - p0) / (z * z - 1);
        const dz = p1 / dp; z -= dz;
        if (Math.abs(dz) < 1e-15) { break; }
      }
      x.push(z); w.push(2 / ((1 - z * z) * dp * dp));
    }
    return Object.freeze({ x: Object.freeze(x), w: Object.freeze(w) });
  })();
  const phi = z => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

  // ---------------------------------------------------------- the payoff as linear pieces in the price
  // P(S) = payoff / capital, linear between the strikes: pieces [{lo, hi, a, c}] with P = a + c·S on [lo, hi]
  /** @param {{ built: any, capital: number }} input */
  function payoffPieces({ built, capital }) {
    const strikes = [...new Set(built.marks.map(m => m.K))].sort((p, r) => p - r);
    const edges = [0, ...strikes, Infinity], pieces = [];
    const valueAt = S => POS.payoff(built, S) / capital;
    for (let i = 0; i < edges.length - 1; i++) {
      const lo = edges[i], hi = edges[i + 1];
      const x1 = lo, x2 = Number.isFinite(hi) ? hi : lo + Math.max(1, lo);
      const c = (valueAt(x2) - valueAt(x1)) / (x2 - x1), a = valueAt(x1) - c * x1;
      pieces.push({ lo, hi, a, c });
    }
    return pieces;
  }
  // the best and worst P: at the kinks, at S → 0, and the slope beyond the last strike
  function payoffRange(pieces) {
    const values = pieces.map(p => p.a + p.c * p.lo), last = pieces[pieces.length - 1];
    const best = last.c > 1e-12 ? Infinity : Math.max(...values);
    const worst = last.c < -1e-12 ? -Infinity : Math.min(...values);
    return { best, worst };
  }

  // ---------------------------------------------------------- the distribution in the standard-normal variable z
  // S(z) = S0·exp(v·z − v²/2), v = σ√T; z(S) its inverse
  const priceAt = ({ S0, v }) => z => S0 * Math.exp(v * z - 0.5 * v * v);
  const zAt = ({ S0, v }) => S => S <= 0 ? -Infinity : !Number.isFinite(S) ? Infinity : (Math.log(S / S0) + 0.5 * v * v) / v;

  // the z-intervals of the line where P > −L (the condition), each with its linear piece
  /** @param {{ pieces: any[], hit: number, toZ: (S: number) => number }} input */
  function splitAtHit({ pieces, hit, toZ }) {
    const out = [];
    for (const p of pieces) {
      const cuts = [p.lo, p.hi];
      // the root of a + c·S = −hit inside the piece
      if (Math.abs(p.c) > 1e-15) {
        const root = (-hit - p.a) / p.c;
        if (root > p.lo && root < p.hi) { cuts.splice(1, 0, root); }
      }
      for (let i = 0; i < cuts.length - 1; i++) {
        const lo = cuts[i], hi = cuts[i + 1];
        const mid = Number.isFinite(hi) ? (lo + hi) / 2 : lo + Math.max(1, lo);
        const value = p.a + p.c * mid;
        out.push({ zLo: toZ(lo), zHi: toZ(hi), a: p.a, c: p.c, isNoHit: value > -hit + RECOVERY_CONFIG.tieTolerance });
      }
    }
    return out;
  }
  // mass and E[P·1] of one interval in closed form: E[S·1{z1<z<z2}] = S0·(Φ(z2 − v) − Φ(z1 − v))
  /** @param {{ part: any, S0: number, v: number }} input */
  function momentsOf({ part, S0, v }) {
    const mass = N(part.zHi) - N(part.zLo);
    const priceMass = S0 * (N(part.zHi - v) - N(part.zLo - v));
    return { mass, mean: part.a * mass + part.c * priceMass };
  }
  // ∫ ln(1 + P) φ dz over one interval (clipped to ±span), by Gauss–Legendre
  /** @param {{ part: any, toS: (z: number) => number }} input */
  function logIntegral({ part, toS }) {
    const span = RECOVERY_CONFIG.span, lo = Math.max(part.zLo, -span), hi = Math.min(part.zHi, span);
    if (!(hi > lo)) { return 0; }
    const half = (hi - lo) / 2, centre = (hi + lo) / 2;
    let sum = 0;
    for (let i = 0; i < legendre.x.length; i++) {
      const z = centre + half * legendre.x[i], P = part.a + part.c * toS(z);
      sum += legendre.w[i] * Math.log(1 + P) * phi(z);
    }
    return sum * half;
  }

  // ---------------------------------------------------------- the three rates for one hit size
  /** @param {{ built: any, vol: number, capital: number, hit: number }} input */
  function ratesFor({ built, vol, capital, hit }) {
    const key = `${built.key}|${vol}|${capital}|${hit}`, cached = memo.get(key);
    if (cached) { return cached; }
    const S0 = built.S, v = vol * Math.sqrt(built.T), pieces = payoffPieces({ built, capital }), range = payoffRange(pieces);
    const toZ = zAt({ S0, v }), toS = priceAt({ S0, v });
    const parts = splitAtHit({ pieces, hit, toZ });
    let average = 0, noHitMass = 0, noHitLog = 0, canLog = true;
    for (const part of parts) {
      const m = momentsOf({ part, S0, v });
      average += m.mean;
      if (!part.isNoHit) { continue; }
      noHitMass += m.mass;
      // inside the condition P > −L > −1, so 1 + P > 0 and the log is defined
      noHitLog += logIntegral({ part, toS });
    }
    if (!(noHitMass > 0)) { canLog = false; }
    const result = Object.freeze({
      best: range.best, worst: range.worst, average,
      noHit: canLog ? Math.exp(noHitLog / noHitMass) - 1 : NaN,
      q: Math.min(1, Math.max(0, 1 - noHitMass))
    });
    if (memo.size > RECOVERY_CONFIG.memoSize) { memo.clear(); }
    memo.set(key, result);
    return result;
  }

  // ---------------------------------------------------------- the hit
  // a move of k of the position's own implied σ to its own expiry (the worse side, or one side), or a fixed share of
  // capital; -> {L, price}: L as a fraction of the capital, the price the move lands at (null for a fixed hit)
  /** @param {{ built: any, capital: number, hit: { basis: string, k: number, side: string, fraction: number } }} input */
  function measureHit({ built, capital, hit }) {
    if (hit.basis === HitBasis.Fixed) { return { L: hit.fraction, price: null }; }
    const down = built.S * Math.exp(-hit.k * built.sig), up = built.S * Math.exp(hit.k * built.sig);
    const lossDown = -POS.payoff(built, down) / capital, lossUp = -POS.payoff(built, up) / capital;
    if (hit.side === HitSide.Down) { return { L: lossDown, price: down }; }
    if (hit.side === HitSide.Up) { return { L: lossUp, price: up }; }
    return lossDown >= lossUp ? { L: lossDown, price: down } : { L: lossUp, price: up };
  }
  // cycles to earn back a hit L at growth g a cycle (hit first): 1/(1−L) = (1+g)^n; Infinity when g cannot get there
  /** @param {{ hit: number, growth: number }} input */
  function cyclesToRecover({ hit, growth }) {
    if (!(hit > 0)) { return 0; }
    if (hit >= 1 || !(growth > 0)) { return Infinity; }
    return Math.log(1 / (1 - hit)) / Math.log(1 + growth);
  }

  /**
   * @typedef {{ status: string, L?: number, Lmargin?: number, Lnotional?: number, price?: number | null, rates?: any, q?: number,
   *   worst?: number, growth?: number, cycles?: any, wholeCycles?: number, survival?: number, isAmber?: boolean }} RecoveryReading
   */
  // ---------------------------------------------------------- the panel's one call
  // -> {status: "ok" | "wiped" | "none" | "na", L, Lmargin, Lnotional, price, rates {best, noHit, average, typed}, q,
  //     growth (the chosen rate), cycles {chosen, best, noHit, average}, wholeCycles, survival, isAmber}
  /** @param {{ built: any, vol: number, hit: { basis: string, k: number, side: string, fraction: number }, capital: string, growth: string, typedRate: number }} input */
  /** @returns {RecoveryReading} */
  function computeRecovery({ built, vol, hit, capital, growth, typedRate }) {
    if (!built || built.na || !(vol > 0) || !(built.T > 0)) { return Object.freeze({ status: "na" }); }
    const marginCap = built.margin, notionalCap = built.S, cap = capital === Capital.Notional ? notionalCap : marginCap;
    if (!(cap > 0)) { return Object.freeze({ status: "na" }); }
    const measured = measureHit({ built, capital: cap, hit });
    const dollars = measured.L * cap;
    const base = { L: measured.L, Lmargin: marginCap > 0 ? dollars / marginCap : NaN, Lnotional: dollars / notionalCap, price: measured.price };
    if (measured.L >= 1) { return Object.freeze(Object.assign({ status: "wiped" }, base)); }
    if (!(measured.L > 0)) { return Object.freeze(Object.assign({ status: "none" }, base)); }
    const r = ratesFor({ built, vol, capital: cap, hit: measured.L });
    const rates = { best: r.best, noHit: r.noHit, average: r.average, typed: typedRate };
    const chosen = growth === GrowthRate.Average ? r.average : growth === GrowthRate.BestCase ? r.best : growth === GrowthRate.Typed ? typedRate : r.noHit;
    const cycles = {
      chosen: cyclesToRecover({ hit: measured.L, growth: chosen }), best: cyclesToRecover({ hit: measured.L, growth: r.best }),
      noHit: cyclesToRecover({ hit: measured.L, growth: r.noHit }), average: cyclesToRecover({ hit: measured.L, growth: r.average })
    };
    const wholeCycles = Number.isFinite(cycles.chosen) ? Math.ceil(cycles.chosen - 1e-9) : Infinity;
    const survival = Number.isFinite(wholeCycles) ? Math.pow(1 - r.q, wholeCycles) : 0;
    return Object.freeze(Object.assign({ status: "ok" }, base, {
      rates: Object.freeze(rates), q: r.q, worst: r.worst, growth: chosen, cycles: Object.freeze(cycles), wholeCycles, survival,
      isAmber: growth === GrowthRate.IfNoSuchHit && survival < RECOVERY_CONFIG.amberBelow
    }));
  }
  // ---------------------------------------------------------- the vol edge
  // E[P&L at expiry] per share at a period vol, closed form (the same zero-drift lognormal as every EV reading)
  /** @param {{ built: any, vol: number }} input */
  function expectedPnl({ built, vol }) {
    const S0 = built.S, v = vol * Math.sqrt(built.T), toZ = zAt({ S0, v });
    let total = 0;
    for (const p of payoffPieces({ built, capital: 1 })) {
      total += momentsOf({ part: { zLo: toZ(p.lo), zHi: toZ(p.hi), a: p.a, c: p.c }, S0, v }).mean;
    }
    return total;
  }
  // the period vol at which the position's EV is zero: below it, this fill wins on average. Result err when EV keeps
  // one sign over the whole range (codes negative_at_any_vol, positive_at_any_vol, not_available)
  /** @param {{ built: any, low?: number, high?: number }} input @returns {LabResult} */
  function findBreakEvenVol({ built, low = 0.01, high = 5 }) {
    if (!built || built.na || !(built.T > 0)) { return Result.err({ code: "not_available", message: "the position is n/a" }); }
    const evAt = vol => expectedPnl({ built, vol });
    if (evAt(low) <= 0) { return Result.err({ code: "negative_at_any_vol", message: `EV is negative even at ${Math.round(low * 100)}% vol` }); }
    if (evAt(high) > 0) { return Result.err({ code: "positive_at_any_vol", message: `EV stays positive up to ${Math.round(high * 100)}% vol` }); }
    let lo = low, hi = high;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (evAt(mid) > 0) { lo = mid; } else { hi = mid; }
    }
    return Result.ok((lo + hi) / 2);
  }
  // the growth rates in words: one set for the Recovery panel, its readings and the export
  const RATE_WORDS = Object.freeze({ [GrowthRate.IfNoSuchHit]: "if no repeat", [GrowthRate.Average]: "average", [GrowthRate.BestCase]: "best case", [GrowthRate.Typed]: "typed" });
  return Object.freeze({ computeRecovery, ratesFor, measureHit, cyclesToRecover, expectedPnl, findBreakEvenVol, RATE_WORDS, CONFIG: RECOVERY_CONFIG });
})();
